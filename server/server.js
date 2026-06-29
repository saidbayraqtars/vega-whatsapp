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
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');

const {
    initializeWhatsApp, refreshWhatsApp, logoutWhatsApp,
    getStatus: waStatus, sendMessage: waSend, deleteMessage: waDelete, checkOnWhatsApp, getDailySent,
    waitForReady: waWaitForReady,
} = require('./whatsapp');
const { normalizePhone, isLikelyValid } = require('./phone');
const watcher = require('./watcher');
const reminders = require('./reminders');
const activeCari = require('./activeCari');
const license = require('./license');
const antiban = require('./antiban');

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

// ─── Şifreleme (makineye bağlı AES-256) ──────────────────────────────────────
// Giriş PIN'i kaldırıldı: DB parolası artık PIN yerine makine kimliğinden
// türetilen anahtarla şifrelenir; uygulama açılışta PIN'siz otomatik bağlanır.
// machine-id, license.js ile paylaşılan kalıcı dosya (data/machine-id).
const APP_SALT = 'vega-wa-machine-key-2026';
const MACHINE_ID_PATH = path.join(baseDir, 'data', 'machine-id');
// DB parola anahtarı makinenin KARARLI kimliğinden türetilir (hostname|platform|
// arch) — disk'teki rastgele machine-id dosyasından DEĞİL. Eski şemada anahtar o
// dosyanın içeriğine bağlıydı; dosya güncelleme/yeniden kurulumda kaybolunca eski
// rastgele kimlik bir daha üretilemiyor, parola çözülemiyor ve kullanıcıdan HER
// güncellemede yeniden isteniyordu. Kararlı parmak izi her zaman aynı türetilir;
// machine-id dosyası kaybolsa bile parola çözülür (yeniden giriş gerekmez).
function machineKey() {
    return crypto.createHash('sha256')
        .update(`${os.hostname()}|${os.platform()}|${os.arch()}|${APP_SALT}`)
        .digest();
}
// Eski şema (rastgele machine-id) anahtarı — yalnızca yükseltmede eski parolayı bir
// kez çözüp yeni kararlı anahtarla yeniden kaydetmek (göç) için. Dosya yoksa null.
function legacyMachineKey() {
    try {
        if (fs.existsSync(MACHINE_ID_PATH)) {
            const id = fs.readFileSync(MACHINE_ID_PATH, 'utf8').trim();
            if (id) return crypto.createHash('sha256').update(id + APP_SALT).digest();
        }
    } catch { /* yok say */ }
    return null;
}
function encryptSecret(text, key = machineKey()) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');
    return iv.toString('hex') + ':' + enc;
}
function decryptSecret(text, key = machineKey()) {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const data = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let dec = decipher.update(data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
}
// Eski (v1) config göçü: parola PIN'den türetilen anahtarla şifreliydi.
function pinKey(pin) { return crypto.createHash('sha256').update(String(pin)).digest(); }

// ─── Config dosyası (v2 = makine anahtarı) ────────────────────────────────────
function loadConfigFile() {
    try { if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch (e) { console.error('config okunamadı:', e.message); }
    return null;
}

// Parola verilmezse mevcut şifreli parola korunur (ayar güncellemede işe yarar).
function persistConfig({ server, database, username, port, password, uiContext }) {
    const existing = loadConfigFile() || {};
    const saved = {
        v: 2,
        server, database, username, port: port || '1433',
        password: (password != null && password !== '') ? encryptSecret(password) : existing.password,
        uiContext: uiContext !== undefined ? uiContext : (existing.uiContext || null),
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(saved, null, 2), 'utf8');
    return saved;
}

// Kayıtlı config'i oku + parolayı çözmeyi dene. needsReauth = sürüm yükseltmede
// eski (PIN ile şifreli) parola makine anahtarıyla çözülemez → bir kez yeniden gir.
function readStoredConfig() {
    const c = loadConfigFile();
    if (!c) return { exists: false };
    const legacy = !c.v && !!c.pinHash;
    let password = null, needsReauth = false, rekey = false;
    if (c.v === 2 && c.password) {
        try {
            password = decryptSecret(c.password); // yeni kararlı anahtar
        } catch {
            // Eski rastgele-id anahtarıyla dene; çözülürse göç işaretle (yeniden kaydedilecek).
            const lk = legacyMachineKey();
            if (lk) {
                try { password = decryptSecret(c.password, lk); rekey = true; }
                catch { needsReauth = true; }
            } else {
                needsReauth = true;
            }
        }
    } else {
        needsReauth = true; // eski v1 (PIN gerekli) veya bozuk
    }
    return { exists: true, config: c, password, needsReauth, legacy, rekey };
}

// Kayıtlı config varsa PIN'siz otomatik bağlan (boot + /api/connect).
async function autoConnectFromConfig() {
    if (pool && pool.connected) return true;
    const st = readStoredConfig();
    if (!st.exists || st.needsReauth || !st.password) return false;
    const c = st.config;
    const config = { server: c.server, database: c.database, username: c.username, password: st.password, port: c.port };
    try {
        if (pool) { try { await pool.close(); } catch { /* yok say */ } pool = null; }
        pool = await createPool(config);
        currentConfig = config;
        // Eski anahtarla çözüldüyse yeni kararlı anahtarla yeniden kaydet (tek seferlik göç).
        if (st.rekey) {
            try { persistConfig({ server: c.server, database: c.database, username: c.username, port: c.port, password: st.password }); }
            catch (e) { console.error('parola yeniden anahtarlama hatası:', e.message); }
        }
        watcher.autoStart();
        try { reminders.autoStart(); } catch { /* Faz 6 */ }
        try { activeCari.autoStart(); } catch { /* yok say */ }
        return true;
    } catch (e) { console.error('oto-bağlantı hata:', e.message); return false; }
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
    const st = readStoredConfig();
    res.json({ success: true, isSetup: st.exists, needsReauth: !!st.needsReauth });
});

// Kurulum — PIN istenmez; parola makine anahtarıyla şifrelenip kaydedilir.
app.post('/api/setup', async (req, res) => {
    const { server, database, username, password, port } = req.body;
    if (!server || !database || !username || !password) {
        return res.status(400).json({ success: false, message: 'Sunucu, veritabanı, kullanıcı ve parola zorunlu.' });
    }
    try {
        if (pool) { await pool.close(); pool = null; }
        const config = { server, database, username, password, port: port || '1433' };
        pool = await createPool(config);
        currentConfig = config;

        // Bağlantıyı doğrula — firma tablosu okunabiliyor mu?
        await pool.request().query('SELECT TOP 1 IND FROM TBLFIRMA');

        persistConfig({ server, database, username, port: port || '1433', password });
        watcher.autoStart();
        try { reminders.autoStart(); } catch { /* yok say */ }
        try { activeCari.autoStart(); } catch { /* yok say */ }
        res.json({ success: true, message: 'Kurulum tamamlandı.' });
    } catch (err) {
        console.error('setup hatası:', err.message);
        res.status(500).json({ success: false, message: 'Bağlantı/kurulum hatası: ' + err.message });
    }
});

// PIN'siz bağlan (boot/Electron). Eski v1 config gönderilen PIN ile göç ettirilir.
app.post('/api/connect', async (req, res) => {
    if (pool && pool.connected) return res.json({ success: true, message: 'Zaten bağlı.' });
    const ok = await autoConnectFromConfig();
    if (ok) return res.json({ success: true });
    const st = readStoredConfig();
    res.status(st.needsReauth ? 409 : 400).json({
        success: false, needsReauth: !!st.needsReauth,
        message: st.needsReauth ? 'Sürüm yükseltme: DB parolasını Ayarlar\'dan bir kez yeniden kaydedin.' : 'Bağlanılamadı.',
    });
});

// Geriye uyumluluk + eski v1 → v2 göçü. PIN yalnızca eski config çözümünde gerekir.
app.post('/api/login', async (req, res) => {
    const st = readStoredConfig();
    if (!st.exists) return res.status(400).json({ success: false, message: 'Kurulum yapılmamış.' });

    let password = st.password;
    if (!password && st.legacy) {
        const pin = req.body && req.body.pin;
        if (!pin) return res.status(409).json({ success: false, needsReauth: true, message: 'DB parolası yeniden girilmeli.' });
        try { password = decryptSecret(st.config.password, pinKey(pin)); }
        catch { return res.status(401).json({ success: false, message: 'Hatalı PIN.' }); }
    }
    if (!password) return res.status(409).json({ success: false, needsReauth: true, message: 'DB parolası yeniden girilmeli.' });

    try {
        const c = st.config;
        const config = { server: c.server, database: c.database, username: c.username, password, port: c.port };
        if (pool) { try { await pool.close(); } catch { /* yok say */ } pool = null; }
        pool = await createPool(config);
        currentConfig = config;
        if (st.legacy) persistConfig({ server: c.server, database: c.database, username: c.username, port: c.port, password }); // v2'ye yükselt
        watcher.autoStart();
        try { reminders.autoStart(); } catch { /* Faz 6 */ }
        try { activeCari.autoStart(); } catch { /* yok say */ }
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
    const st = readStoredConfig();
    res.json({
        success: true,
        dbConnected: !!(pool && pool.connected),
        isSetup: st.exists, needsReauth: !!st.needsReauth,
        wa: waStatus(),
    });
});

// Bağlantıyı sına — canlı pool'a dokunmadan geçici bağlantı dener.
app.post('/api/test-connection', async (req, res) => {
    const { server, database, username, password, port } = req.body || {};
    if (!server || !database || !username || !password) {
        return res.status(400).json({ success: false, message: 'Sunucu, veritabanı, kullanıcı ve parola gerekli.' });
    }
    let testPool = null;
    try {
        testPool = await new sql.ConnectionPool({
            user: username, password, database, server,
            port: parseInt(port) || 1433,
            options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
            connectionTimeout: 10000, requestTimeout: 15000,
            pool: { max: 1, min: 0, idleTimeoutMillis: 5000 },
        }).connect();
        const r = await testPool.request().query('SELECT COUNT(*) AS c FROM TBLFIRMA');
        res.json({ success: true, message: 'Bağlantı başarılı.', firmaSayisi: r.recordset[0].c });
    } catch (err) {
        res.status(200).json({ success: false, message: 'Bağlantı başarısız: ' + err.message });
    } finally {
        if (testPool) { try { await testPool.close(); } catch { /* yok say */ } }
    }
});

// Ayarlar modalı için mevcut bağlantı bilgileri (parola HARİÇ).
app.get('/api/settings/db', (req, res) => {
    const c = loadConfigFile();
    if (!c) return res.json({ success: true, db: null });
    res.json({ success: true, db: { server: c.server, database: c.database, username: c.username, port: c.port } });
});

// Ayarlar → SQL bağlantısını YERİNDE güncelle (kurulumu sıfırlamaz, en başa dönmez).
// Parola boş bırakılırsa mevcut kayıtlı parola korunur. Watcher/reminder durmaz;
// sonraki taramada yeni pool'u kullanır.
app.post('/api/settings/db', async (req, res) => {
    const { server, database, username, password, port } = req.body || {};
    if (!server || !database || !username) {
        return res.status(400).json({ success: false, message: 'Sunucu, veritabanı ve kullanıcı gerekli.' });
    }
    let pass = password;
    if (!pass) {
        const st = readStoredConfig();
        if (st.password) pass = st.password;
        else return res.status(400).json({ success: false, message: 'Parola gerekli (kayıtlı parola çözülemedi).' });
    }
    const newCfg = { server, database, username, password: pass, port: port || '1433' };
    try {
        // Önce ayrı bir bağlantıyla doğrula — canlı pool'u bozma.
        const test = await new sql.ConnectionPool({
            user: username, password: pass, database, server, port: parseInt(port) || 1433,
            options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
            connectionTimeout: 10000, requestTimeout: 15000, pool: { max: 1, min: 0, idleTimeoutMillis: 5000 },
        }).connect();
        await test.request().query('SELECT TOP 1 IND FROM TBLFIRMA');
        await test.close();
    } catch (err) {
        return res.status(200).json({ success: false, message: 'Bağlantı hatası: ' + err.message });
    }
    try {
        if (pool) { try { await pool.close(); } catch { /* yok say */ } pool = null; }
        pool = await createPool(newCfg);
        currentConfig = newCfg;
        persistConfig({ server, database, username, port: port || '1433', password: (password || undefined) });
        res.json({ success: true, message: 'Bağlantı güncellendi.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Bağlantı uygulanamadı: ' + err.message });
    }
});

// Uygulama genel bağlamı (varsayılan firma/dönem) — config.uiContext'te kalıcı.
app.get('/api/settings/context', (req, res) => {
    const c = loadConfigFile();
    res.json({ success: true, context: (c && c.uiContext) || null });
});

app.post('/api/settings/context', (req, res) => {
    const c = loadConfigFile();
    if (!c) return res.status(400).json({ success: false, message: 'Kurulum yapılmamış.' });
    const ctx = { firmaNo: (req.body && req.body.firmaNo) || null, donemNo: (req.body && req.body.donemNo) || null };
    persistConfig({ server: c.server, database: c.database, username: c.username, port: c.port, uiContext: ctx });
    res.json({ success: true, context: ctx });
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
// Şema bilgisi günde 1 kez tazelenir: uygulama tray'de haftalarca açık kalabiliyor,
// cari kart yapısı değişirse (yeni telefon kolonu vb.) en geç 24 saatte yakalanır.
const CARI_SCHEMA_TTL_MS = 24 * 60 * 60 * 1000;
const phoneColCache = {}; // firmaNo -> { info: { table, phoneCols, emailCols, all }, at }
async function detectCariColumns(firmaNo) {
    const hit = phoneColCache[firmaNo];
    if (hit && Date.now() - hit.at < CARI_SCHEMA_TTL_MS) return hit.info;
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
        // STATUS = cari aktiflik durumu (1=aktif, 2=pasif). Pasif carilere mesaj yok.
        hasStatus: colSet.has('STATUS'),
        hasUnvan: colSet.has('UNVAN'),
        hasFirmaadi: colSet.has('FIRMAADI'),
        hasFirmakodu: colSet.has('FIRMAKODU'),
        // SMSGONDER = Vega "SMS Gönder" izni biti; mesaj göndermede onay/öncelik kapısı.
        hasSmsGonder: colSet.has('SMSGONDER'),
        // FIRMATIPI = alıcı/satıcı bit-maskesi, BAKIYE = güncel kalan bakiye.
        hasFirmaTipi: colSet.has('FIRMATIPI'),
        hasBakiye: colSet.has('BAKIYE'),
        phoneCols, emailCols, all: cols,
    };
    phoneColCache[firmaNo] = { info, at: Date.now() };
    return info;
}

// ─── Cari tipi (alıcı / satıcı) sınıflaması ──────────────────────────────────
// Vega FIRMATIPI bir BİT-MASKESİ: bit0(1)=alıcı, bit1(2)=satıcı. Yüksek bitler
// (4,8…) personel/diğer kategoriler — alıcı/satıcı sayılmaz. F0101 ile doğrulandı
// (tipler: 1,2,3,5,6,11,12). NOT: 'FIRMATIPI IN (1,3)' eksik kalır (5,11 de alıcı),
// bu yüzden bitwise test kullanılır. NULL → 0 → 'diğer'.
function cariTypeWhere(type) {
    switch (type) {
        case 'alici':  return '(ISNULL(FIRMATIPI,0) & 1) = 1';
        case 'satici': return '(ISNULL(FIRMATIPI,0) & 2) = 2';
        case 'diger':  return '(ISNULL(FIRMATIPI,0) & 1) = 0 AND (ISNULL(FIRMATIPI,0) & 2) = 0';
        default:       return null; // 'hepsi'/tanımsız → filtre yok
    }
}
function cariTypeLabel(firmaTipi) {
    const t = Number(firmaTipi) || 0;
    const a = (t & 1) === 1, s = (t & 2) === 2;
    if (a && s) return 'her_ikisi';
    if (a) return 'alici';
    if (s) return 'satici';
    return 'diger';
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
    // SMS Gönder izni (SMSGONDER=1) olanları listele — "telefonu olanlar" filtresinin yerini alır.
    const onlySmsGonder = req.query.onlySmsGonder === '1';
    // Alıcı/satıcı filtresi (FIRMATIPI bit-maskesi) + sadece bakiyeli filtresi.
    const cariType = req.query.cariType || 'hepsi';      // hepsi|alici|satici|diger
    const onlyWithBalance = req.query.onlyWithBalance === '1';
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
        // Firma adı: kullanıcı mesajda "Sayın {firma} müşterimiz" için FIRMAADI sütununu ister.
        const firmaExpr = info.hasFirmaadi ? `NULLIF(LTRIM(RTRIM(FIRMAADI)),'')` : nameExpr;
        const smsSelect = info.hasSmsGonder ? 'ISNULL(SMSGONDER,0) AS SMSGONDER' : 'CAST(0 AS BIT) AS SMSGONDER';
        const tipSelect = info.hasFirmaTipi ? 'ISNULL(FIRMATIPI,0) AS FIRMATIPI' : 'CAST(0 AS INT) AS FIRMATIPI';
        const bakiyeSelect = info.hasBakiye ? 'BAKIYE AS BAKIYE' : 'CAST(NULL AS DECIMAL(18,2)) AS BAKIYE';
        const phoneSelect = info.phoneCols.map(c => `[${c}] AS [PH_${c}]`).join(', ');
        const emailSelect = info.emailCols.map(c => `[${c}] AS [EM_${c}]`).join(', ');

        const selectCols = [
            'IND',
            `${kodExpr} AS KOD`,
            `${nameExpr} AS UNVAN`,
            `${firmaExpr} AS FIRMA`,
            smsSelect,
            tipSelect,
            bakiyeSelect,
            phoneSelect,
            emailSelect,
        ].filter(Boolean).join(', ');

        const r = pool.request();
        const whereParts = [];
        if (info.hasDeleted) whereParts.push('ISNULL(DELETED,0)=0');
        if (info.hasStatus) whereParts.push('ISNULL(STATUS,1)<>2'); // pasif (STATUS=2) hariç
        if (onlySmsGonder && info.hasSmsGonder) whereParts.push('ISNULL(SMSGONDER,0)=1');
        const typeWhere = info.hasFirmaTipi ? cariTypeWhere(cariType) : null;
        if (typeWhere) whereParts.push(typeWhere);
        if (onlyWithBalance && info.hasBakiye) whereParts.push('ISNULL(BAKIYE,0) <> 0');
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
        // SMS Gönder izinliler önce (1. öncelik), sonra ada göre.
        const orderExpr = (info.hasSmsGonder ? 'ISNULL(SMSGONDER,0) DESC, ' : '') + nameExpr;
        const rows = (await r.query(`
            SELECT ${selectCols} FROM ${T} ${where}
            ORDER BY ${orderExpr}
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
                firma: row.FIRMA || row.UNVAN || null,
                smsGonder: !!row.SMSGONDER,
                firmaTipi: row.FIRMATIPI != null ? Number(row.FIRMATIPI) : 0,
                tip: cariTypeLabel(row.FIRMATIPI),
                bakiye: row.BAKIYE != null ? Number(row.BAKIYE) : null,
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
    const firmaExpr = info.hasFirmaadi ? `NULLIF(LTRIM(RTRIM(FIRMAADI)),'')` : nameExpr;
    const smsSelect = info.hasSmsGonder ? 'ISNULL(SMSGONDER,0) AS SMSGONDER' : 'CAST(0 AS BIT) AS SMSGONDER';
    const phoneSelect = info.phoneCols.map(c => `[${c}] AS [PH_${c}]`).join(', ');
    // Carinin güncel kalan bakiyesi TBLCARI.BAKIYE'de tutulur (cari hareket
    // tablosunun BAKIYE kolonu Vega'da NULL; dönemler arası devirli toplamı
    // burada saklanır). Pozitif = borç (müşteri bize borçlu).
    const hasBakiye = info.all.some(c => c.toUpperCase() === 'BAKIYE');
    const bakiyeSelect = hasBakiye ? 'BAKIYE AS BAKIYE' : 'CAST(NULL AS DECIMAL(18,2)) AS BAKIYE';
    const tipSelect = info.hasFirmaTipi ? 'ISNULL(FIRMATIPI,0) AS FIRMATIPI' : 'CAST(0 AS INT) AS FIRMATIPI';
    // STATUS=2 = pasif cari → mesaj gönderilmez (caller pasif bayrağıyla atlar).
    const statusSelect = info.hasStatus ? 'ISNULL(STATUS,1) AS STATUS' : 'CAST(1 AS INT) AS STATUS';
    const cols = ['IND', `${kodExpr} AS KOD`, `${nameExpr} AS UNVAN`, `${firmaExpr} AS FIRMA`, smsSelect, tipSelect, bakiyeSelect, statusSelect, phoneSelect].filter(Boolean).join(', ');

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
            firma: row.FIRMA || row.UNVAN || null,
            smsGonder: !!row.SMSGONDER,
            // Karttaki tüm geçerli numaralar (TELEFON1/2/3, YGSM...) — "tümüne gönder" seçeneği için.
            phones: normalized.filter(isLikelyValid),
            valid: primary ? isLikelyValid(primary) : false,
            bakiye: row.BAKIYE != null ? Number(row.BAKIYE) : null,
            firmaTipi: row.FIRMATIPI != null ? Number(row.FIRMATIPI) : 0,
            tip: cariTypeLabel(row.FIRMATIPI),
            pasif: Number(row.STATUS) === 2, // pasif cari → mesaj yok
        });
    }
    return map;
}

// ─── Hatırlatma aday carileri (kategori + bakiye filtresi) ───────────────────
// reminders.js için: FIRMATIPI + BAKIYE kategorisine uyan carilerin IND/BAKIYE/
// FIRMATIPI/OPSIYON(vade günü) listesi. Telefon/isim resolveCariContacts ile çözülür.
//   anyBalance   → BAKIYE > 0 (borçlular; vade ayrımı reminders.js'te yapılır)
//   overdueBuyer → FIRMATIPI 1/3 (alıcı) & BAKIYE > 0
//   Alacaklılara (BAKIYE < 0) hiçbir kategoride mesaj gönderilmez.
async function reminderCandidateInds(firmaNo, category, minAmount) {
    if (!pool || !pool.connected) return [];
    const info = await detectCariColumns(firmaNo);
    const T = `[${info.table}]`;
    const up = info.all.map(c => c.toUpperCase());
    if (!up.includes('BAKIYE')) return [];
    const hasTipi = up.includes('FIRMATIPI');
    const hasOps = up.includes('OPSIYON');

    // Her iki kategori de yalnızca borçlu carileri (BAKIYE > 0) hedefler.
    const where = ['ISNULL(BAKIYE,0) > 0'];
    if (info.hasDeleted) where.push('ISNULL(DELETED,0)=0');
    if (info.hasStatus) where.push('ISNULL(STATUS,1)<>2'); // pasif (STATUS=2) hariç
    if (category === 'overdueBuyer' && hasTipi) where.push('FIRMATIPI IN (1,3)');
    if (minAmount > 0) where.push('ABS(BAKIYE) >= @minAmt');

    const sel = `IND, BAKIYE, ${hasTipi ? 'FIRMATIPI' : 'CAST(NULL AS INT) AS FIRMATIPI'}, ${hasOps ? 'OPSIYON' : 'CAST(NULL AS INT) AS OPSIYON'}`;
    const r = pool.request();
    r.input('minAmt', sql.Decimal(18, 2), minAmount || 0);
    const rows = (await r.query(`SELECT ${sel} FROM ${T} WHERE ${where.join(' AND ')}`)).recordset;
    return rows.map(x => ({ IND: x.IND, BAKIYE: x.BAKIYE != null ? Number(x.BAKIYE) : null, FIRMATIPI: x.FIRMATIPI, OPSIYON: x.OPSIYON }));
}

// ─── Aktif cari süzgeci (reminders için) ─────────────────────────────────────
// Verilen IND'ler içinden AKTİF carileri (DELETED=0 AND STATUS<>2) döner. anyBalance
// adayları cari HAREKET net bakiyesinden üretildiği için TBLCARI.STATUS'ü bilmez;
// pasif/silinmiş cariler aday listesine hiç girmesin diye kaynakta kesişim alınır.
async function activeCariInds(firmaNo, indList) {
    const set = new Set();
    if (!pool || !pool.connected || !Array.isArray(indList) || !indList.length) return set;
    const ids = indList.map(n => parseInt(n, 10)).filter(Number.isFinite);
    if (!ids.length) return set;
    const info = await detectCariColumns(firmaNo);
    const where = [`IND IN (${ids.join(',')})`];
    if (info.hasDeleted) where.push('ISNULL(DELETED,0)=0');
    if (info.hasStatus) where.push('ISNULL(STATUS,1)<>2'); // pasif (STATUS=2) hariç
    const rows = (await pool.request().query(`SELECT IND FROM [${info.table}] WHERE ${where.join(' AND ')}`)).recordset;
    for (const row of rows) set.add(row.IND);
    return set;
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
    const allowed = ['firmaNo', 'donemNo', 'intervalSec', 'verifyOnWhatsApp', 'simulateTyping', 'sendAllPhones', 'onlySmsGonder', 'cariType', 'rules'];
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

// Belge tipi kuralına eklenecek görsel/video yükle / kaldır (kural başına).
app.post('/api/watcher/rules/:id/media', upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya gerekli.' });
    const status = watcher.setRuleMedia(req.params.id, req.file);
    res.json({ success: true, status });
});

app.post('/api/watcher/rules/:id/media/clear', (req, res) => {
    res.json({ success: true, status: watcher.clearRuleMedia(req.params.id) });
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
        // Standart Vega işlem (evrak) kodları — F0101 EXPERT BİLİŞİM ile ampirik
        // doğrulandı (2026-06). Belge başlık tablolarına EVRAKNO=BELGENO join ile.
        const KNOWN = {
            11: 'Cari Çıkış Bordrosu (Tediye)', 13: 'Cari Giriş Bordrosu (Tahsilat)',
            20: 'Alış Faturası', 21: 'Satış Faturası', 22: 'Alış İade / İrsaliye',
            23: 'Satış İade Faturası', 32: 'Stok Giriş Fişi', 33: 'Stok Çıkış Fişi',
            83: 'Manuel / Mahsup Fiş',
            103: 'Cari Devir (açılış)', 104: 'Cari Devir (borç)',
        };
        const data = rows.map(r => ({ ...r, label: KNOWN[r.code] || '', devir: [103, 104].includes(r.code) }));
        res.json({ success: true, table: tbl, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PERİYODİK BAKİYE/BORÇ HATIRLATMA (reminders)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/reminders', (req, res) => {
    res.json({ success: true, status: reminders.getStatus() });
});

app.post('/api/reminders', (req, res) => {
    const allowed = ['firmaNo', 'donemNo', 'reminders'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const status = reminders.setConfig(patch);
    res.json({ success: true, status });
});

// Elle test gönderimi (UI "Şimdi test gönder").
app.post('/api/reminders/run', async (req, res) => {
    if (!requireDb(req, res)) return;
    try {
        const r = await reminders.runNow(req.body && req.body.id);
        res.json({ success: r.success, message: r.message, status: reminders.getStatus() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Kuru çalıştırma / önizleme: GÖNDERMEZ, kime ne gideceğini döner (onay öncesi).
app.post('/api/reminders/preview', async (req, res) => {
    if (!requireDb(req, res)) return;
    try {
        const out = await reminders.preview(req.body && req.body.id);
        res.json({ success: out.ok !== false, message: out.reason, ...out });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Elle telefon ekle/sil (UYGULAMA İÇİ — DB'ye yazılmaz). phone boşsa kaydı siler.
app.post('/api/reminders/manual-phone', (req, res) => {
    const { ind, phone } = req.body || {};
    if (ind == null) return res.status(400).json({ success: false, message: 'Cari (ind) gerekli.' });
    if (phone == null || String(phone).trim() === '') {
        return res.json({ success: true, ...reminders.setManualPhone(ind, null) });
    }
    const norm = normalizePhone(String(phone));
    if (!norm || !isLikelyValid(norm)) return res.status(400).json({ success: false, message: 'Geçersiz telefon numarası.' });
    res.json({ success: true, ...reminders.setManualPhone(ind, norm), normalized: norm });
});

// Tek cariye elle gönder ("Yeniden dene").
app.post('/api/reminders/send-one', async (req, res) => {
    if (!requireDb(req, res)) return;
    try {
        const r = await reminders.sendOne(req.body && req.body.id, req.body && req.body.ind);
        res.json(r);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/reminders/log', (req, res) => {
    res.json({ success: true, log: reminders.getLog(), status: reminders.getStatus() });
});

app.post('/api/reminders/:id/media', upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'Dosya gerekli.' });
    res.json({ success: true, status: reminders.setReminderMedia(req.params.id, req.file) });
});

app.post('/api/reminders/:id/media/clear', (req, res) => {
    res.json({ success: true, status: reminders.clearReminderMedia(req.params.id) });
});

// ═══════════════════════════════════════════════════════════════════════════
//  AKTİF CARİ → "BAKİYEYİ GÖNDER" (Arctos yüzen butonu)
//  Arctos'ta o an açık cari plan cache'ten tespit edilir (activeCari.js).
//  Float pencere /api/active-cari'yi yoklar; "Gönder" /api/active-cari/send'i çağırır.
// ═══════════════════════════════════════════════════════════════════════════
const ACTIVE_CARI_DEFAULT_TPL = 'Sayın {firma}, güncel hesap bakiyeniz {bakiye} TL ({durum}). Bilginize sunarız.';

function fmtAmountTR(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Bakiye işaretsiz gösterilir; yön {durum} ile (Borç/Alacak). Boş parantez temizlenir.
function renderBalanceMessage(tpl, c) {
    const bak = c.bakiye != null ? fmtAmountTR(Math.abs(c.bakiye)) : '';
    const durum = c.bakiye == null ? '' : (c.bakiye > 0 ? 'Borç' : c.bakiye < 0 ? 'Alacak' : '');
    return String(tpl || '')
        .replace(/\{ad\}/gi, c.name || '')
        .replace(/\{unvan\}/gi, c.name || '')
        .replace(/\{firma\}/gi, c.firma || c.name || '')
        .replace(/\{kod\}/gi, c.kod || '')
        .replace(/\{bakiye\}/gi, bak)
        .replace(/\{kalan\}/gi, bak)
        .replace(/\{durum\}/gi, durum)
        .replace(/ ?\(\s*\)/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

// Gerçek güncel bakiye = aktif dönem cari hareketinden SUM(BORC)-SUM(ALACAK)
// (Arctos'un cari hareket ekranında gösterdiği net ile birebir; belge/hatırlatma
// mesajlarıyla AYNI kaynak). TBLCARI.BAKIYE BAYAT olabilir — kullanılmaz.
// net>0 = borç (müşteri borçlu), net<0 = alacak. Dönem yoksa null.
async function fetchCariNetBalance(firmaNo, donemNo, ind) {
    if (!pool || !pool.connected || !firmaNo || !donemNo) return null;
    const indNum = parseInt(ind, 10);
    if (!Number.isFinite(indNum)) return null;
    const tbl = `F${firmaNo}D${donemNo}TBLCARIHAREKETLERI`;
    if (!(await validateTableName(tbl))) return null;
    const r = await pool.request().query(
        `SELECT CAST(SUM(BORC) - SUM(ALACAK) AS DECIMAL(18,2)) AS NET FROM [${tbl}] WHERE FIRMANO=${indNum}`
    );
    const net = r.recordset[0] && r.recordset[0].NET;
    return net != null ? Number(net) : null;
}

// O an açık cari + çözümlenmiş iletişim/bakiye/önizleme metni. Buton bunu yoklar.
app.get('/api/active-cari', async (req, res) => {
    const a = activeCari.getActive();
    if (!a) return res.json({ success: true, active: null });
    if (!pool || !pool.connected) {
        return res.json({ success: true, active: { firmaNo: a.firmaNo, donemNo: a.donemNo, ind: a.ind, ageMs: a.ageMs, dbConnected: false } });
    }
    try {
        const map = await resolveCariContacts(a.firmaNo, [a.ind]);
        const c = map.get(a.ind);
        if (!c) {
            return res.json({ success: true, active: { firmaNo: a.firmaNo, donemNo: a.donemNo, ind: a.ind, ageMs: a.ageMs, found: false } });
        }
        // Bakiyeyi aktif dönem hareketinden hesapla (TBLCARI.BAKIYE bayat olabilir).
        const net = await fetchCariNetBalance(a.firmaNo, a.donemNo, a.ind);
        if (net != null) c.bakiye = net;
        const durum = c.bakiye == null ? '' : (c.bakiye > 0 ? 'Borç' : c.bakiye < 0 ? 'Alacak' : '');
        res.json({
            success: true,
            active: {
                firmaNo: a.firmaNo, donemNo: a.donemNo, ind: a.ind, ageMs: a.ageMs, found: true,
                name: c.name, kod: c.kod, firma: c.firma,
                phone: c.phone, valid: !!c.valid, pasif: !!c.pasif,
                bakiye: c.bakiye, durum,
                message: renderBalanceMessage(ACTIVE_CARI_DEFAULT_TPL, c),
                wa: waStatus().ready,
            },
        });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// Açık cariye bakiye mesajını gönder (birincil numara). message verilirse onu,
// yoksa varsayılan şablonu kullanır. WhatsApp varlık doğrulaması yapılır.
app.post('/api/active-cari/send', async (req, res) => {
    if (!requireDb(req, res)) return;
    const a = activeCari.getActive() || {};
    const firmaNo = (req.body && req.body.firmaNo) || a.firmaNo;
    const indVal = (req.body && req.body.ind != null) ? req.body.ind : a.ind;
    const indNum = parseInt(indVal, 10);
    if (!firmaNo || !Number.isFinite(indNum)) {
        return res.status(400).json({ success: false, message: 'Açık cari tespit edilemedi.' });
    }
    if (!waStatus().ready) {
        return res.status(400).json({ success: false, message: 'WhatsApp bağlı değil. Önce QR okutun.' });
    }
    try {
        const map = await resolveCariContacts(firmaNo, [indNum]);
        const c = map.get(indNum);
        if (!c) return res.status(404).json({ success: false, message: 'Cari bulunamadı.' });
        if (c.pasif) return res.status(400).json({ success: false, message: 'Cari pasif (STATUS=2) — gönderilmez.' });
        if (!c.phone || !c.valid) return res.status(400).json({ success: false, message: 'Carinin geçerli telefonu yok.' });

        // Varsayılan şablon için bakiyeyi aktif dönem hareketinden hesapla.
        const donemNo = (req.body && req.body.donemNo) || a.donemNo;
        const net = await fetchCariNetBalance(firmaNo, donemNo, indNum);
        if (net != null) c.bakiye = net;

        // KESİN KURAL: biz müşteriye borçluysak (net bakiye Alacak yönünde, < 0) gönderme.
        // Otomatik watcher ile aynı çizgi; manuel "Bakiyeyi Gönder" de alacaklı cariye atmaz.
        if (c.bakiye != null && c.bakiye < 0) {
            return res.status(400).json({ success: false, message: 'Cari alacaklı (biz borçluyuz) — mesaj gönderilmez.' });
        }

        const text = (req.body && req.body.message && String(req.body.message).trim())
            ? String(req.body.message)
            : renderBalanceMessage(ACTIVE_CARI_DEFAULT_TPL, c);

        const chk = await checkOnWhatsApp(c.phone);
        if (!chk.exists) {
            return res.status(400).json({ success: false, message: chk.transient ? 'WhatsApp doğrulaması geçici hata — tekrar deneyin.' : 'Numara WhatsApp kullanıcısı değil.' });
        }
        const result = await waSend(c.phone, text, null, { simulateTyping: true, typingMs: 1500 });
        if (result.success) { antiban.recordSent(waStatus().me); return res.json({ success: true, message: 'Gönderildi.', phone: c.phone, name: c.name }); }
        res.status(500).json({ success: false, message: result.error || 'Gönderilemedi.' });
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
        // Anti-ban: warm-up günü + saatlik/günlük tavan ve bugün gönderilen (UI uyarısı için).
        const ab = st.ready ? antiban.snapshot(st.me, DEFAULT_PACING.dailyCap) : null;
        res.json({ success: true, ready: st.ready, initializing: st.initializing, hasQr: st.hasQr, qrImage, me: st.me, error: st.error, antiban: ab });
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
// Saatlik tavan dolduğunda bir sonraki saat başına kalan süre (anti-ban beklemesi).
const msUntilNextHour = () => { const n = new Date(); return (3600 - (n.getMinutes() * 60 + n.getSeconds())) * 1000; };

function pushEvent(job, event) {
    job.events.push(event);
    for (const client of job.clients) {
        try { client.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* yok say */ }
    }
}

function renderMessage(template, recipient) {
    // Önce spintax varyantlarını ({a|b|c}) çöz (anti-ban: birebir aynı metin gitmesin),
    // sonra {ad} / {unvan} / {firma} / {kod} değişkenleri.
    return antiban.applySpintax(template)
        .replace(/\{ad\}/gi, recipient.name || recipient.unvan || '')
        .replace(/\{unvan\}/gi, recipient.unvan || recipient.name || '')
        .replace(/\{firma\}/gi, recipient.firma || recipient.unvan || recipient.name || '')
        .replace(/\{kod\}/gi, recipient.kod || '');
}

// Bağlantı koptuysa job'u duraklat, bağlanana kadar bekle. Kalan alıcılar
// kuyrukta birikir; bağlantı gelince kaldığı yerden devam eder. İptal edilirse
// false döner. 2 sn'lik dilimlerle beklenir ki iptal gecikmeden işlesin.
async function waitForWhatsApp(job) {
    if (waStatus().ready) return true;
    pushEvent(job, { type: 'waDisconnected', message: 'WhatsApp bağlantısı koptu, bağlanınca devam edilecek...' });
    while (!job.cancelled && !waStatus().ready) {
        await waWaitForReady(2000);
    }
    if (job.cancelled) return false;
    pushEvent(job, { type: 'waReconnected', message: 'WhatsApp yeniden bağlandı, gönderim sürüyor.' });
    return true;
}

async function runJob(job) {
    job.status = 'running';
    const p = job.pacing;
    let order = [...job.recipients];
    if (p.shuffle) order = order.sort(() => Math.random() - 0.5);

    let sentInBatch = 0;
    for (let i = 0; i < order.length; i++) {
        if (job.cancelled) { pushEvent(job, { type: 'cancelled', index: i }); break; }
        // Anti-ban kapısı: warm-up rampı + saatlik + günlük tavan (hesap-başı).
        // Günlük dolduysa job biter; saatlik dolduysa sonraki saat başına kadar
        // (iptal edilebilir) bekleyip aynı alıcıdan devam eder.
        const g = antiban.gate(waStatus().me, p.dailyCap);
        if (!g.ok) {
            if (g.capType === 'hourly') {
                const waitMs = msUntilNextHour();
                pushEvent(job, { type: 'hourlyCap', reason: g.reason, waitMs, hourSent: g.hourSent, hourCap: g.hourCap });
                const until = Date.now() + waitMs;
                while (!job.cancelled && Date.now() < until) await sleep(Math.min(5000, until - Date.now()));
                if (job.cancelled) { pushEvent(job, { type: 'cancelled', index: i }); break; }
                i--; continue;
            }
            pushEvent(job, { type: 'capReached', cap: g.dailyCap, todaySent: g.daySent, reason: g.reason });
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

        // Bağlantı yoksa burada bekle — alıcı atlanmaz, sırada bekler.
        if (!(await waitForWhatsApp(job))) { pushEvent(job, { type: 'cancelled', index: i }); break; }

        if (p.verifyOnWhatsApp) {
            const chk = await checkOnWhatsApp(phone);
            if (!chk.exists) {
                // Kontrol sırasında bağlantı koptuysa alıcıyı "kayıtlı değil" sayma;
                // bağlantıyı bekleyip aynı alıcıyı yeniden dene.
                if (!waStatus().ready) { i--; continue; }
                pushEvent(job, { ...base, status: 'notOnWhatsApp', error: chk.error || 'WhatsApp kullanıcısı değil' });
                job.results.push({ ...rcp, status: 'notOnWhatsApp' });
                continue;
            }
        }

        const text = renderMessage(job.message, rcp);
        let result = await waSend(phone, text, job.media, {
            simulateTyping: p.simulateTyping,
            typingMs: rand(1200, 2600),
        });

        // Gönderim sırasında kopma: bağlantı gelene kadar bekle, aynı alıcıya
        // yeniden dene. Bağlıyken alınan hatalar (geçersiz numara vb.) yeniden
        // denenmez, normal "failed" akışına düşer.
        while (!result.success && !waStatus().ready && !job.cancelled) {
            if (!(await waitForWhatsApp(job))) break;
            result = await waSend(phone, text, job.media, {
                simulateTyping: p.simulateTyping,
                typingMs: rand(1200, 2600),
            });
        }
        if (job.cancelled) { pushEvent(job, { type: 'cancelled', index: i }); break; }

        if (result.success) {
            antiban.recordSent(waStatus().me); // anti-ban saat/gün sayacı
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
// Masaüstü app: CDN yok, cache faydası yok. Electron renderer eski index/app/style'ı
// cache'leyip eski arayüzü göstermesin diye no-store (güncelleme anında yansır).
app.use(express.static(PUBLIC_DIR, {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));
app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Lisans altyapısını başlat (data/license.json + machine-id; scaffold = kısıtlamaz).
license.configure({ baseDir });

// Anti-ban katmanı: warm-up rampı + saatlik/günlük tavan (hesap-başı sayaç).
antiban.configure(baseDir);

// Watcher'ı bağımlılıklarıyla yapılandır (config/state data/ altına yazılır).
watcher.configure({
    getPool: () => pool,
    sql,
    resolveCariContacts,
    waSend,
    waDelete,
    checkOnWhatsApp,
    waStatus,
    baseDir,
});

// Periyodik bakiye/borç hatırlatma zamanlayıcısı.
reminders.configure({
    getPool: () => pool,
    sql,
    resolveCariContacts,
    reminderCandidateInds,
    activeCariInds,
    waSend,
    checkOnWhatsApp,
    waStatus,
    baseDir,
});

// Arctos'ta o an açık cariyi plan cache'ten tespit eden izleyici (yüzen buton için).
activeCari.configure({ getPool: () => pool, sql });

app.listen(PORT, async () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  Vega Toplu WhatsApp çalışıyor → ${url}\n`);
    // Giriş PIN'i kaldırıldı: kayıtlı config varsa açılışta otomatik bağlan
    // (watcher + reminders kendiliğinden başlar).
    try {
        const ok = await autoConnectFromConfig();
        if (ok) console.log('  Otomatik bağlanıldı (kayıtlı ayarlar).');
    } catch (e) { console.error('boot oto-bağlantı:', e.message); }
    if (isPkg) {
        const startCmd = process.platform === 'win32' ? 'start ""' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
        try { require('child_process').exec(`${startCmd} ${url}`); } catch { /* yok say */ }
    }
});
