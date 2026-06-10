// ═══════════════════════════════════════════════════════════════════════════
//  Vega Toplu WhatsApp — Backend
//  VegaDB carilerini çeker → seçilenlere Baileys ile pacing'li toplu mesaj.
//  Tek exe (pkg) hedefli; geliştirme: `npm run dev`.
// ═══════════════════════════════════════════════════════════════════════════

// pkg'nin gömülü Node 18 base'inde global `crypto` (WebCrypto) açık değildir;
// Baileys `globalThis.crypto.subtle` kullanır. node:crypto.webcrypto ile polyfill
// (Node 18'de mevcut, sadece global atanmamış). Tüm require'lardan ÖNCE olmalı.
if (!globalThis.crypto || !globalThis.crypto.subtle) {
    try { globalThis.crypto = require('crypto').webcrypto; } catch { /* yok say */ }
}

// Baileys async event handler'ında fırlayan hata tüm exe'yi öldürmesin (uzun
// süreli gönderim sırasında dayanıklılık). Sadece logla, süreç ayakta kalsın.
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message || e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e?.message || e));

const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const {
    initializeWhatsApp, refreshWhatsApp, logoutWhatsApp,
    getStatus: waStatus, sendMessage: waSend, checkOnWhatsApp, getDailySent,
} = require('./whatsapp');
const { normalizePhone, isLikelyValid } = require('./phone');
const watcher = require('./watcher');
const license = require('./license');

const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const isPkg = typeof process.pkg !== 'undefined';
// Electron sarmalayıcı VEGA_BASE_DIR ile config/data konumunu verir (userData).
// pkg exe'de exe dizini; geliştirmede server klasörü.
const baseDir = process.env.VEGA_BASE_DIR || (isPkg ? path.dirname(process.execPath) : __dirname);
const CONFIG_PATH = path.join(baseDir, 'config.json');
// public/ klasörü hem geliştirmede (__dirname/public) hem pkg snapshot'ında
// (build/public) bulunabilsin diye var olan ilk adayı seç.
const PUBLIC_DIR = [
    path.join(__dirname, 'public'),
    path.join(baseDir, 'public'),
].find(p => fs.existsSync(p)) || path.join(__dirname, 'public');

let pool = null;
let currentConfig = null;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 80 * 1024 * 1024 }, // 80MB (WhatsApp medya tavanına yakın)
});

// ─── Şifreleme (PIN'den türetilen AES-256) ───────────────────────────────────
function encrypt(text, pin) {
    const key = crypto.createHash('sha256').update(pin).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');
    return iv.toString('hex') + ':' + enc;
}
function decrypt(text, pin) {
    const key = crypto.createHash('sha256').update(pin).digest();
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const data = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let dec = decipher.update(data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
}
function hashPin(pin) {
    return crypto.createHash('sha256').update(pin).digest('hex');
}

// ─── SQL bağlantı havuzu ─────────────────────────────────────────────────────
async function createPool(config) {
    const sqlConfig = {
        user: config.username,
        password: config.password,
        database: config.database,
        server: config.server,
        port: parseInt(config.port) || 1433,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: 15000,
        requestTimeout: 30000,
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    };
    return await sql.connect(sqlConfig);
}

function requireDb(req, res) {
    if (!pool || !pool.connected) {
        res.status(401).json({ success: false, message: 'Veritabanı bağlantısı yok.' });
        return false;
    }
    return true;
}

async function validateTableName(tableName) {
    if (!pool || !pool.connected) return false;
    const r = pool.request();
    r.input('tbl', sql.NVarChar, tableName);
    const result = await r.query(`
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME=@tbl
    `);
    return result.recordset[0].cnt > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
//  KURULUM / GİRİŞ
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/check-setup', (req, res) => {
    res.json({ success: true, isSetup: fs.existsSync(CONFIG_PATH) });
});

app.post('/api/setup', async (req, res) => {
    const { server, database, username, password, port, pin } = req.body;
    if (!server || !database || !username || !password || !pin) {
        return res.status(400).json({ success: false, message: 'Tüm alanları ve PIN kodunu doldurunuz.' });
    }
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ success: false, message: 'PIN 6 haneli sadece rakam olmalı.' });
    }
    try {
        if (pool) { await pool.close(); pool = null; }
        const config = { server, database, username, password, port: port || '1433' };
        pool = await createPool(config);
        currentConfig = config;

        // Bağlantıyı doğrula — firma tablosu okunabiliyor mu?
        await pool.request().query('SELECT TOP 1 IND FROM TBLFIRMA');

        const saved = {
            server, database, username, port: port || '1433',
            password: encrypt(password, pin),
            pinHash: hashPin(pin),
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(saved, null, 2), 'utf8');
        res.json({ success: true, message: 'Kurulum tamamlandı.' });
    } catch (err) {
        console.error('setup hatası:', err.message);
        res.status(500).json({ success: false, message: 'Bağlantı/kurulum hatası: ' + err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ success: false, message: 'PIN gerekli.' });
    if (!fs.existsSync(CONFIG_PATH)) return res.status(400).json({ success: false, message: 'Kurulum yapılmamış.' });

    try {
        const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        if (saved.pinHash !== hashPin(pin)) {
            return res.status(401).json({ success: false, message: 'Hatalı PIN.' });
        }
        const password = decrypt(saved.password, pin);
        const config = { server: saved.server, database: saved.database, username: saved.username, password, port: saved.port };
        if (pool) { try { await pool.close(); } catch { /* yok say */ } pool = null; }
        pool = await createPool(config);
        currentConfig = config;
        watcher.autoStart(); // kayıtlı config aktifse otomatik tahsilat izlemeyi başlat
        res.json({ success: true, message: 'Bağlandı.' });
    } catch (err) {
        console.error('login hatası:', err.message);
        res.status(500).json({ success: false, message: 'Giriş hatası: ' + err.message });
    }
});

app.post('/api/reset', async (req, res) => {
    try {
        watcher.stop(); // DB ayarları silinirken izleme açık kalmasın
        if (pool) { await pool.close(); pool = null; }
        if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ success: true, dbConnected: !!(pool && pool.connected), wa: waStatus() });
});

// ═══════════════════════════════════════════════════════════════════════════
//  FİRMALAR
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/firmalar', async (req, res) => {
    if (!requireDb(req, res)) return;
    try {
        const result = await pool.request().query(`
            SELECT IND, '0' + CAST(IND AS VARCHAR) AS FIRMANO, KISAAD AS FIRMAADI
            FROM TBLFIRMA ORDER BY IND
        `);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Cari tablosundaki iletişim sütunlarını otomatik tespit ──────────────────
const phoneColCache = {}; // firmaNo -> { table, phoneCols, emailCols, all }
async function detectCariColumns(firmaNo) {
    if (phoneColCache[firmaNo]) return phoneColCache[firmaNo];
    const table = `F${firmaNo}TBLCARI`;
    const r = pool.request();
    r.input('tbl', sql.NVarChar, table);
    const cols = (await r.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@tbl
    `)).recordset.map(x => x.COLUMN_NAME);

    const colSet = new Set(cols.map(c => c.toUpperCase()));
    // Telefon sütunu tespiti (Vega TBLCARI doğrulandı: TELEFON1/2/3, YGSM, YTELEFON1/2).
    //   Dahil: GSM/CEP/MOBIL içeren, TELEFON* (Y öneki = yetkili kişi de dahil).
    //   HARİÇ: KEFIL* (kefil = 3. şahıs, carinin kendisi değil), FAKS/FAX, MODEM, *GONDER (bit bayrak).
    const isPhoneCol = (c) => {
        const u = c.toUpperCase();
        if (/KEFIL|FAKS|FAX|MODEM|GONDER|IZNIVAR/.test(u)) return false;
        return /GSM|CEP|MOBIL/.test(u) || /TELEFON/.test(u) || /^TEL\d/.test(u);
    };
    const phoneCols = cols.filter(isPhoneCol);
    // Öncelik: önce carinin kendi cep/telefonu, sonra yetkili (Y öneki) numaraları.
    phoneCols.sort((a, b) => {
        const score = (x) => {
            const u = x.toUpperCase();
            const yetkili = /^Y/.test(u) ? 10 : 0;          // yetkili numarası sona
            const tip = /GSM|CEP|MOBIL/.test(u) ? 0 : 1;     // cep önce
            return yetkili + tip;
        };
        return score(a) - score(b);
    });
    // E-posta: GONDER/bayrak değil, gerçek e-posta sütunları.
    const emailCols = cols.filter(c => /(MAIL|EPOSTA|E_POSTA)/i.test(c) && !/GONDER|IZNIVAR/i.test(c));

    const info = {
        table,
        hasDeleted: colSet.has('DELETED'),
        hasUnvan: colSet.has('UNVAN'),
        hasFirmaadi: colSet.has('FIRMAADI'),
        hasFirmakodu: colSet.has('FIRMAKODU'),
        phoneCols, emailCols, all: cols,
    };
    phoneColCache[firmaNo] = info;
    return info;
}

app.get('/api/cari/columns', async (req, res) => {
    if (!requireDb(req, res)) return;
    const { firmaNo } = req.query;
    if (!firmaNo) return res.status(400).json({ success: false, message: 'firmaNo gerekli.' });
    try {
        if (!(await validateTableName(`F${firmaNo}TBLCARI`)))
            return res.status(404).json({ success: false, message: 'Cari tablosu bulunamadı.' });
        const info = await detectCariColumns(firmaNo);
        res.json({ success: true, table: info.table, phoneCols: info.phoneCols, emailCols: info.emailCols, allColumns: info.all });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  CARİ LİSTE (arama + telefon)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/cari', async (req, res) => {
    if (!requireDb(req, res)) return;
    const { firmaNo, search = '' } = req.query;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 200, 2000);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * pageSize;
    const onlyWithPhone = req.query.onlyWithPhone === '1';
    if (!firmaNo) return res.status(400).json({ success: false, message: 'firmaNo gerekli.' });

    try {
        if (!(await validateTableName(`F${firmaNo}TBLCARI`)))
            return res.status(404).json({ success: false, message: 'Cari tablosu bulunamadı.' });
        const info = await detectCariColumns(firmaNo);
        const T = `[${info.table}]`;

        // İsim: UNVAN > FIRMAADI > ADI+SOYADI (bireysel cari) > IND.
        const hasAdSoyad = info.all.some(c => c.toUpperCase() === 'ADI') && info.all.some(c => c.toUpperCase() === 'SOYADI');
        const nameParts = [];
        if (info.hasUnvan) nameParts.push(`NULLIF(LTRIM(RTRIM(UNVAN)),'')`);
        if (info.hasFirmaadi) nameParts.push(`NULLIF(LTRIM(RTRIM(FIRMAADI)),'')`);
        if (hasAdSoyad) nameParts.push(`NULLIF(LTRIM(RTRIM(ISNULL(ADI,'')+' '+ISNULL(SOYADI,''))),'')`);
        const nameExpr = nameParts.length
            ? `COALESCE(${nameParts.join(', ')}, CAST(IND AS NVARCHAR))`
            : `CAST(IND AS NVARCHAR)`;
        const kodExpr = info.hasFirmakodu ? 'FIRMAKODU' : `CAST(IND AS NVARCHAR)`;
        const phoneSelect = info.phoneCols.map(c => `[${c}] AS [PH_${c}]`).join(', ');
        const emailSelect = info.emailCols.map(c => `[${c}] AS [EM_${c}]`).join(', ');

        const selectCols = [
            'IND',
            `${kodExpr} AS KOD`,
            `${nameExpr} AS UNVAN`,
            phoneSelect,
            emailSelect,
        ].filter(Boolean).join(', ');

        const r = pool.request();
        const whereParts = [];
        if (info.hasDeleted) whereParts.push('ISNULL(DELETED,0)=0');
        if (search.trim()) {
            r.input('s', sql.NVarChar, `%${search.trim()}%`);
            const searchCols = [
                info.hasUnvan ? 'UNVAN' : null,
                info.hasFirmaadi ? 'FIRMAADI' : null,
                info.hasFirmakodu ? 'FIRMAKODU' : null,
                'CAST(IND AS NVARCHAR)',
                ...info.phoneCols.map(c => `[${c}]`),
            ].filter(Boolean);
            whereParts.push('(' + searchCols.map(c => `${c} LIKE @s`).join(' OR ') + ')');
        }
        const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

        const total = (await r.query(`SELECT COUNT(*) AS cnt FROM ${T} ${where}`)).recordset[0].cnt;

        r.input('offset', sql.Int, offset);
        r.input('limit', sql.Int, pageSize);
        const rows = (await r.query(`
            SELECT ${selectCols} FROM ${T} ${where}
            ORDER BY ${nameExpr}
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `)).recordset;

        // Telefonları normalize et + birincil seç
        const data = rows.map(row => {
            const rawPhones = info.phoneCols
                .map(c => row[`PH_${c}`])
                .filter(v => v != null && String(v).trim() !== '');
            const normalized = [];
            for (const rp of rawPhones) {
                // tek alanda birden çok numara olabilir
                String(rp).split(/[\/,;|]+/).forEach(part => {
                    const n = normalizePhone(part);
                    if (n && !normalized.includes(n)) normalized.push(n);
                });
            }
            const primary = normalized.find(isLikelyValid) || normalized[0] || null;
            const email = info.emailCols.map(c => row[`EM_${c}`]).find(v => v && String(v).trim()) || null;
            return {
                ind: row.IND,
                kod: row.KOD,
                unvan: row.UNVAN,
                phones: normalized,
                phone: primary,
                phoneRaw: rawPhones.join(' / '),
                email,
                valid: primary ? isLikelyValid(primary) : false,
            };
        }).filter(d => (onlyWithPhone ? !!d.phone : true));

        res.json({ success: true, data, total, page, pageSize });
    } catch (err) {
        console.error('cari hatası:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Cari iletişim çözümü (watcher için: IND listesi → {name,kod,phone,valid}) ──
// /api/cari ile aynı isim/telefon mantığını paylaşır; FIRMANO=IND ile eşleşir.
async function resolveCariContacts(firmaNo, indList) {
    const map = new Map();
    if (!pool || !pool.connected || !Array.isArray(indList) || !indList.length) return map;
    const ids = indList.map(n => parseInt(n, 10)).filter(Number.isFinite);
    if (!ids.length) return map;

    const info = await detectCariColumns(firmaNo);
    const T = `[${info.table}]`;
    const hasAdSoyad = info.all.some(c => c.toUpperCase() === 'ADI') && info.all.some(c => c.toUpperCase() === 'SOYADI');
    const nameParts = [];
    if (info.hasUnvan) nameParts.push(`NULLIF(LTRIM(RTRIM(UNVAN)),'')`);
    if (info.hasFirmaadi) nameParts.push(`NULLIF(LTRIM(RTRIM(FIRMAADI)),'')`);
    if (hasAdSoyad) nameParts.push(`NULLIF(LTRIM(RTRIM(ISNULL(ADI,'')+' '+ISNULL(SOYADI,''))),'')`);
    const nameExpr = nameParts.length
        ? `COALESCE(${nameParts.join(', ')}, CAST(IND AS NVARCHAR))`
        : `CAST(IND AS NVARCHAR)`;
    const kodExpr = info.hasFirmakodu ? 'FIRMAKODU' : `CAST(IND AS NVARCHAR)`;
    const phoneSelect = info.phoneCols.map(c => `[${c}] AS [PH_${c}]`).join(', ');
    // Carinin güncel kalan bakiyesi TBLCARI.BAKIYE'de tutulur (cari hareket
    // tablosunun BAKIYE kolonu Vega'da NULL; dönemler arası devirli toplamı
    // burada saklanır). Pozitif = borç (müşteri bize borçlu).
    const hasBakiye = info.all.some(c => c.toUpperCase() === 'BAKIYE');
    const bakiyeSelect = hasBakiye ? 'BAKIYE AS BAKIYE' : 'CAST(NULL AS DECIMAL(18,2)) AS BAKIYE';
    const cols = ['IND', `${kodExpr} AS KOD`, `${nameExpr} AS UNVAN`, bakiyeSelect, phoneSelect].filter(Boolean).join(', ');

    const rows = (await pool.request().query(`SELECT ${cols} FROM ${T} WHERE IND IN (${ids.join(',')})`)).recordset;
    for (const row of rows) {
        const rawPhones = info.phoneCols.map(c => row[`PH_${c}`]).filter(v => v != null && String(v).trim() !== '');
        const normalized = [];
        for (const rp of rawPhones) {
            String(rp).split(/[\/,;|]+/).forEach(part => {
                const n = normalizePhone(part);
                if (n && !normalized.includes(n)) normalized.push(n);
            });
        }
        const primary = normalized.find(isLikelyValid) || normalized[0] || null;
        map.set(row.IND, {
            name: row.UNVAN, kod: row.KOD, phone: primary,
            valid: primary ? isLikelyValid(primary) : false,
            bakiye: row.BAKIYE != null ? Number(row.BAKIYE) : null,
        });
    }
    return map;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DÖNEMLER (cari hareket tabloları → dönem listesi)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/donemler', async (req, res) => {
    if (!requireDb(req, res)) return;
    const { firmaNo } = req.query;
    if (!firmaNo || !/^\d+$/.test(firmaNo)) return res.status(400).json({ success: false, message: 'Geçerli firmaNo gerekli.' });
    try {
        // Sadece gerçekten var olan cari hareket tablolarının dönemleri seçilebilsin.
        const t = (await pool.request().query(`
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE 'F${firmaNo}D%TBLCARIHAREKETLERI'
            ORDER BY TABLE_NAME
        `)).recordset;
        const donemNos = t.map(x => (x.TABLE_NAME.match(/D(\d+)TBLCARIHAREKETLERI$/) || [])[1]).filter(Boolean);

        // Dönem → yıl eşlemesi (TBLDONEM'de IND başına birden çok satır olabiliyor; en güncel yılı al)
        const yearMap = {};
        try {
            const d = (await pool.request().query(`
                SELECT RIGHT('0000'+CAST(IND AS VARCHAR),4) AS DONEMNO, MAX(DONEM) AS DONEM
                FROM TBLDONEM GROUP BY IND
            `)).recordset;
            d.forEach(x => { yearMap[x.DONEMNO] = x.DONEM; });
        } catch { /* yıl bilgisi opsiyonel */ }

        const data = donemNos.map(dn => ({ donemNo: dn, donem: yearMap[dn] ?? null }));
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  OTOMATİK TAHSİLAT BİLDİRİMİ (watcher)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/watcher', (req, res) => {
    res.json({ success: true, status: watcher.getStatus() });
});

app.post('/api/watcher', (req, res) => {
    const allowed = ['firmaNo', 'donemNo', 'intervalSec', 'izahatCodes', 'minAmount', 'template', 'verifyOnWhatsApp', 'simulateTyping'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const prev = watcher.getConfig();
    watcher.setConfig(patch);
    // Firma/dönem değiştiyse yeni tablo geçmişine mesaj atılmasın diye watermark sıfırla.
    if (patch.firmaNo && (patch.firmaNo !== prev.firmaNo || patch.donemNo !== prev.donemNo)) {
        watcher.resetWatermark();
    }
    res.json({ success: true, status: watcher.getStatus() });
});

app.post('/api/watcher/start', (req, res) => {
    if (!requireDb(req, res)) return;
    const ok = watcher.start();
    res.json({ success: ok, status: watcher.getStatus(), message: ok ? '' : (watcher.getStatus().lastError || 'Başlatılamadı.') });
});

app.post('/api/watcher/stop', (req, res) => {
    watcher.stop();
    res.json({ success: true, status: watcher.getStatus() });
});

app.get('/api/watcher/log', (req, res) => {
    res.json({ success: true, log: watcher.getLog(), status: watcher.getStatus() });
});

// Otomatik tahsilat mesajına eklenecek görsel/video yükle / kaldır.
app.post('/api/watcher/media', upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya gerekli.' });
    const status = watcher.setMedia(req.file);
    res.json({ success: true, status });
});

app.post('/api/watcher/media/clear', (req, res) => {
    res.json({ success: true, status: watcher.clearMedia() });
});

// Cari hareket tablosundaki IZAHAT dağılımı — kullanıcı tahsilat kodunu canlı görsün.
app.get('/api/watcher/izahat-stats', async (req, res) => {
    if (!requireDb(req, res)) return;
    const { firmaNo, donemNo } = req.query;
    if (!/^\d+$/.test(firmaNo || '') || !/^\d+$/.test(donemNo || ''))
        return res.status(400).json({ success: false, message: 'firmaNo/donemNo gerekli.' });
    const tbl = `F${firmaNo}D${donemNo}TBLCARIHAREKETLERI`;
    try {
        if (!(await validateTableName(tbl))) return res.status(404).json({ success: false, message: 'Tablo yok: ' + tbl });
        const rows = (await pool.request().query(`
            SELECT TRY_CAST(IZAHAT AS INT) AS code,
                   COUNT(*) AS adet,
                   SUM(CASE WHEN ALACAK>0 THEN 1 ELSE 0 END) AS alacakAdet,
                   CAST(SUM(ALACAK) AS DECIMAL(18,2)) AS toplamAlacak,
                   CAST(SUM(BORC) AS DECIMAL(18,2)) AS toplamBorc
            FROM [${tbl}]
            GROUP BY TRY_CAST(IZAHAT AS INT)
            HAVING SUM(ALACAK) > 0
            ORDER BY toplamAlacak DESC
        `)).recordset;
        // Bilinen etiketler — bu DB'de gerçek veriyle doğrulandı (2026-06). Kod→anlam
        // haritası firmalar arası değişebilir; etiketler sadece bilgilendirme amaçlı.
        const KNOWN = {
            13: 'Visa Giriş Bordrosu', 14: 'Visa Giriş İade Bordrosu', 20: 'Havale Giriş Bordrosu',
            32: 'Nakit Giriş Bordrosu', 83: 'Manuel Fiş',
            103: 'Cari Devir (açılış)', 104: 'Cari Devir (borç)',
        };
        const data = rows.map(r => ({ ...r, label: KNOWN[r.code] || '', devir: [103, 104].includes(r.code) }));
        res.json({ success: true, table: tbl, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LİSANS (çevrimiçi lisans altyapısı — scaffold, şu an kısıtlamaz)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/license', (req, res) => {
    res.json({ success: true, license: license.getStatus() });
});

app.post('/api/license/activate', async (req, res) => {
    try {
        const st = await license.activate(req.body && req.body.key);
        res.json({ success: st.status !== 'invalid' && st.status !== 'error', license: st, message: st.message });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/license/recheck', async (req, res) => {
    try {
        const st = await license.recheck();
        res.json({ success: true, license: st, message: st.message });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  WHATSAPP DURUM / OTURUM
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/wa/status', async (req, res) => {
    try {
        const s = waStatus();
        if (!s.initializing && !s.ready && !s.hasQr) {
            await initializeWhatsApp();
        }
        const st = waStatus();
        let qrImage = null;
        if (st.qr) qrImage = await QRCode.toDataURL(st.qr, { margin: 2, width: 280 });
        res.json({ success: true, ready: st.ready, initializing: st.initializing, hasQr: st.hasQr, qrImage, me: st.me, error: st.error });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/wa/refresh', async (req, res) => {
    try { await refreshWhatsApp(); res.json({ success: true }); }
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/wa/logout', async (req, res) => {
    try { await logoutWhatsApp(); res.json({ success: true }); }
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TOPLU GÖNDERİM (pacing + SSE ilerleme)
// ═══════════════════════════════════════════════════════════════════════════
const jobs = new Map(); // jobId -> job

const DEFAULT_PACING = {
    minDelayMs: 8000,
    maxDelayMs: 22000,
    batchSize: 25,
    batchPauseMinMs: 60000,
    batchPauseMaxMs: 150000,
    dailyCap: 200,
    simulateTyping: true,
    verifyOnWhatsApp: true,
    shuffle: false,
};

const rand = (min, max) => Math.floor(min + Math.random() * (max - min));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function pushEvent(job, event) {
    job.events.push(event);
    for (const client of job.clients) {
        try { client.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* yok say */ }
    }
}

function renderMessage(template, recipient) {
    // {ad} / {unvan} / {kod} değişkenleri
    return String(template || '')
        .replace(/\{ad\}/gi, recipient.name || recipient.unvan || '')
        .replace(/\{unvan\}/gi, recipient.unvan || recipient.name || '')
        .replace(/\{kod\}/gi, recipient.kod || '');
}

async function runJob(job) {
    job.status = 'running';
    const p = job.pacing;
    let order = [...job.recipients];
    if (p.shuffle) order = order.sort(() => Math.random() - 0.5);

    let sentInBatch = 0;
    for (let i = 0; i < order.length; i++) {
        if (job.cancelled) { pushEvent(job, { type: 'cancelled', index: i }); break; }
        // Tavan hesap bazlı: bugün gönderilen TÜM mesajlar sayılır (önceki job'lar
        // + watcher dahil) — aynı gün ikinci toplu gönderim tavanı sıfırlamasın.
        if (getDailySent() >= p.dailyCap) {
            pushEvent(job, { type: 'capReached', cap: p.dailyCap, todaySent: getDailySent() });
            break;
        }

        const rcp = order[i];
        const phone = normalizePhone(rcp.phone);
        const base = { type: 'progress', index: i, total: order.length, name: rcp.name || rcp.unvan, phone };

        if (!phone || !isLikelyValid(phone)) {
            pushEvent(job, { ...base, status: 'invalid', error: 'Geçersiz numara' });
            job.results.push({ ...rcp, status: 'invalid' });
            continue;
        }

        if (p.verifyOnWhatsApp) {
            const chk = await checkOnWhatsApp(phone);
            if (!chk.exists) {
                pushEvent(job, { ...base, status: 'notOnWhatsApp', error: chk.error || 'WhatsApp kullanıcısı değil' });
                job.results.push({ ...rcp, status: 'notOnWhatsApp' });
                continue;
            }
        }

        const text = renderMessage(job.message, rcp);
        const result = await waSend(phone, text, job.media, {
            simulateTyping: p.simulateTyping,
            typingMs: rand(1200, 2600),
        });

        if (result.success) {
            job.sentCount++;
            sentInBatch++;
            pushEvent(job, { ...base, status: 'sent', sentCount: job.sentCount });
            job.results.push({ ...rcp, status: 'sent' });
        } else {
            pushEvent(job, { ...base, status: 'failed', error: result.error });
            job.results.push({ ...rcp, status: 'failed', error: result.error });
        }

        const isLast = i === order.length - 1;
        if (!isLast) {
            // Parti molası mı normal gecikme mi?
            if (sentInBatch >= p.batchSize) {
                const pause = rand(p.batchPauseMinMs, p.batchPauseMaxMs);
                pushEvent(job, { type: 'batchPause', ms: pause, after: job.sentCount });
                sentInBatch = 0;
                await sleep(pause);
            } else {
                const d = rand(p.minDelayMs, p.maxDelayMs);
                pushEvent(job, { type: 'delay', ms: d });
                await sleep(d);
            }
        }
    }

    job.status = 'done';
    const summary = job.results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    pushEvent(job, { type: 'done', summary, sentCount: job.sentCount });
    finalizeJob(job);
}

// Medya buffer'ı hemen, job kaydı 1 saat sonra bellekten düşsün (geç bağlanan
// SSE istemcisi geçmiş olayları hâlâ okuyabilsin diye hemen silinmez).
const JOB_TTL_MS = 60 * 60 * 1000;
function finalizeJob(job) {
    job.media = null;
    const t = setTimeout(() => jobs.delete(job.id), JOB_TTL_MS);
    if (t.unref) t.unref();
}

app.post('/api/send-bulk', upload.single('media'), async (req, res) => {
    const st = waStatus();
    if (!st.ready) return res.status(400).json({ success: false, message: 'WhatsApp bağlı değil. Önce QR okutun.' });

    let recipients, pacing;
    try {
        recipients = JSON.parse(req.body.recipients || '[]');
        pacing = { ...DEFAULT_PACING, ...(req.body.pacing ? JSON.parse(req.body.pacing) : {}) };
    } catch {
        return res.status(400).json({ success: false, message: 'recipients/pacing JSON hatalı.' });
    }
    const message = req.body.message || '';
    if (!Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'Alıcı listesi boş.' });
    }
    if (!message.trim() && !req.file) {
        return res.status(400).json({ success: false, message: 'Mesaj veya medya gerekli.' });
    }

    // Tekrarlı numaraları ele
    const seen = new Set();
    recipients = recipients.filter(r => {
        const n = normalizePhone(r.phone);
        if (!n || seen.has(n)) return false;
        seen.add(n);
        return true;
    });

    let media = null;
    if (req.file) {
        const mt = req.file.mimetype || '';
        const kind = mt.startsWith('image/') ? 'image' : mt.startsWith('video/') ? 'video' : 'document';
        media = { kind, buffer: req.file.buffer, mimetype: mt, fileName: req.file.originalname };
    }

    const jobId = crypto.randomBytes(8).toString('hex');
    const job = {
        id: jobId, recipients, message, media, pacing,
        status: 'pending', cancelled: false,
        results: [], events: [], clients: new Set(),
        sentCount: 0, createdAt: Date.now(),
    };
    jobs.set(jobId, job);

    // Asenkron çalıştır
    runJob(job).catch(err => {
        console.error('Job hatası:', err.message);
        pushEvent(job, { type: 'error', error: err.message });
        job.status = 'error';
        finalizeJob(job);
    });

    res.json({ success: true, jobId, total: recipients.length, pacing });
});

app.get('/api/send-stream/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).end();

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    res.write('retry: 3000\n\n');

    // Geçmiş olayları gönder (geç bağlanan istemci için)
    for (const ev of job.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    if (job.status === 'done' || job.status === 'error') {
        res.end();
        return;
    }
    job.clients.add(res);

    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* yok say */ } }, 15000);
    req.on('close', () => { clearInterval(ping); job.clients.delete(res); });
});

app.post('/api/send-cancel/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ success: false });
    job.cancelled = true;
    res.json({ success: true });
});

// ─── Statik frontend ─────────────────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Lisans altyapısını başlat (data/license.json + machine-id; scaffold = kısıtlamaz).
license.configure({ baseDir });

// Watcher'ı bağımlılıklarıyla yapılandır (config/state data/ altına yazılır).
watcher.configure({
    getPool: () => pool,
    sql,
    resolveCariContacts,
    waSend,
    checkOnWhatsApp,
    waStatus,
    baseDir,
});

app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  Vega Toplu WhatsApp çalışıyor → ${url}\n`);
    if (isPkg) {
        const startCmd = process.platform === 'win32' ? 'start ""' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
        try { require('child_process').exec(`${startCmd} ${url}`); } catch { /* yok say */ }
    }
});
