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
    waitForReady: waWaitForReady, setIncomingHandler, setDisconnectHandler, setOpenHandler, setRevokedHandler,
} = require('./whatsapp');
const { normalizePhone, isLikelyValid } = require('./phone');
const watcher = require('./watcher');
const siparis = require('./siparis');
const reminders = require('./reminders');
const activeCari = require('./activeCari');
const aiBot = require('./aiBot');
const credits = require('./credits');
const license = require('./license');
const antiban = require('./antiban');
const stats = require('./stats');
const { buildExtrePdf } = require('./extre');

const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3100;

// Uygulama sürümü — kök package.json'dan (Electron/electron-builder tek doğruluk
// kaynağı). Sürüm sidebar'da elle yazılıp releaslerde unutulup duruyordu (v1.1.2
// donmuş kalmıştı, gerçek 1.1.5'ti); artık her açılışta buradan okunup UI'a geçer.
const APP_VERSION = (() => {
    try { return require(path.join(__dirname, '..', 'package.json')).version; }
    catch { try { return require('./package.json').version; } catch { return null; } }
})();

app.use(cors());
app.use(express.json({ limit: '16mb' })); // relay-send ekstre PDF'i base64 taşır → yüksek

// ─── Lisans kapısı ───────────────────────────────────────────────────────────
// Lisans (ya da 15 günlük deneme) geçerli değilse TÜM /api/* uçları 403 döner.
// Statik dosyalar açık kalır → tarayıcı lisans ekranını yükleyebilir; o ekranın
// ihtiyaç duyduğu uçlar aşağıdaki muafiyet listesindedir.
// NOT: routes'lardan ÖNCE kayıtlı olmalı (Express sırayla çalıştırır).
const LICENSE_OPEN_PATHS = new Set([
    '/api/license',
    '/api/license/activate',
    '/api/license/recheck',
    '/api/license/fetch',    // uzaktan lisans alma — lisanssızken de çalışmalı
]);
app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    if (LICENSE_OPEN_PATHS.has(req.path)) return next();
    if (license.isAllowed()) return next();
    return res.status(403).json({
        success: false,
        error: 'LICENSE_REQUIRED',
        license: license.getStatus(),
    });
});

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
    if (existing.wa) saved.wa = existing.wa;   // WA modu (relay) ayarını DB kaydında koru
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

// ═══════════════════════════════════════════════════════════════════════════
//  WHATSAPP MODU: yerel | relay  (iki-PC aynı-numara conflict çözümü)
// ═══════════════════════════════════════════════════════════════════════════
// İki bilgisayar aynı WhatsApp numarasını kullanınca İKİSİ de Baileys oturumu
// açarsa WhatsApp bunu "conflict" (connectionReplaced/401) sayar: biri diğerini
// düşürür, o yeniden bağlanır, karşıyı düşürür → sonsuz düşürme savaşı + cihaz
// fırtınası (linked-device sayacı şişer → hesap işaretlenir).
//
// Çözüm: YALNIZ ana PC (PC1) tek Baileys oturumu tutar. İkinci PC (PC2, yalnız
// ekstre) kendi oturumunu AÇMAZ; göndereceği işi LAN üzerinden PC1'e yollar
// (POST /api/relay-send), PC1 kendi oturumundan gönderir. WhatsApp'a bağlı tek
// cihaz kalır → conflict imkânsız, anti-ban sayacı tek yerde birleşir.
//
//   config.json → "wa": { "mode":"relay", "relayTarget":"http://PC1-IP:3100", "relayToken":"ORTAK-SIR" }
//   mode yoksa "local" (PC1 varsayılanı). PC2'de mode=relay.
let waCfg = (loadConfigFile() || {}).wa || { mode: 'local' };
const isRelay = () => !!waCfg && waCfg.mode === 'relay' && !!waCfg.relayTarget;
const relayUrl = (p) => String(waCfg.relayTarget || '').replace(/\/+$/, '') + p;
const relayHeaders = () => ({ 'x-relay-token': waCfg.relayToken || '' });

// Küçük JSON HTTP istemcisi — pkg/exe altında global fetch garanti değil → http/https.
function httpJson(urlStr, { method = 'POST', headers = {}, body, timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(urlStr); } catch { return reject(new Error('geçersiz adres: ' + urlStr)); }
        const lib = u.protocol === 'https:' ? require('https') : require('http');
        const data = body != null ? Buffer.from(JSON.stringify(body)) : null;
        const req = lib.request({
            hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search, method,
            headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': data.length } : {}), ...headers },
        }, (res) => {
            let buf = '';
            res.on('data', (d) => { buf += d; });
            res.on('end', () => {
                let json = null;
                try { json = buf ? JSON.parse(buf) : null; } catch { /* json değil */ }
                resolve({ status: res.statusCode, json, raw: buf });
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error('ana PC yanıt vermedi (zaman aşımı)')));
        if (data) req.write(data);
        req.end();
    });
}

// Relay modunda PC1'in bağlantı durumunu önbellekte tut (waStatusX senkron okusun).
let relayStatus = { ready: false, me: null, error: 'Ana PC ile bağlantı bekleniyor…', ts: 0 };
async function pollRelayStatus() {
    if (!isRelay()) return;
    try {
        const r = await httpJson(relayUrl('/api/relay-status'), { method: 'GET', headers: relayHeaders(), timeoutMs: 8000 });
        if (r.status === 200 && r.json) relayStatus = { ready: !!r.json.ready, me: r.json.me || null, error: r.json.error || null, ts: Date.now() };
        else if (r.status === 401) relayStatus = { ready: false, me: null, error: 'Relay parolası (token) ana PC ile eşleşmiyor.', ts: Date.now() };
        else relayStatus = { ready: false, me: null, error: `Ana PC yanıtı: ${r.status}`, ts: Date.now() };
    } catch (e) {
        relayStatus = { ready: false, me: null, error: 'Ana PC erişilemiyor: ' + e.message, ts: Date.now() };
    }
}

// ─── Mod-duyarlı WA sarmalayıcıları ──────────────────────────────────────────
// Yerel modda gerçek Baileys fonksiyonları; relay modda PC1'e HTTP vekil.
const waStatusX = () => isRelay()
    ? { ready: relayStatus.ready, initializing: false, hasQr: false, qr: null, error: relayStatus.error, me: relayStatus.me }
    : waStatus();

const waCheckX = async (phone) => {
    if (!isRelay()) return checkOnWhatsApp(phone);
    try {
        const r = await httpJson(relayUrl('/api/relay-check'), { body: { phone }, headers: relayHeaders() });
        if (r.status === 200 && r.json) return r.json;
        return { exists: false, transient: true, error: `Ana PC: ${r.status}` };
    } catch (e) { return { exists: false, transient: true, error: 'Ana PC erişilemiyor: ' + e.message }; }
};

const waSendX = async (phone, text, media = null, opts = {}) => {
    if (!isRelay()) return waSend(phone, text, media, opts);
    let m = null;
    if (media && media.buffer) m = { kind: media.kind, mimetype: media.mimetype, fileName: media.fileName, b64: Buffer.from(media.buffer).toString('base64') };
    try {
        const r = await httpJson(relayUrl('/api/relay-send'), { body: { phone, text, media: m, opts }, headers: relayHeaders() });
        if (r.json) return r.json;
        return { success: false, error: `Ana PC: ${r.status}` };
    } catch (e) { return { success: false, error: 'Ana PC erişilemiyor: ' + e.message }; }
};

// Anti-ban tek hesap = tek yer (PC1). Relay modda PC2 yerel gate/record YAPMAZ;
// PC1'in /api/relay-send'i gate+record uygular (çift sayım olmasın).
const gateX = (me, cap, ch) => isRelay() ? { ok: true } : antiban.gate(me, cap, ch);
const recordSentX = (me, ch) => { if (!isRelay()) { try { antiban.recordSent(me, ch); } catch { /* yok say */ } } };

// Relay modda otomasyonu (watcher/hatırlatma/aktif-cari) BAŞLATMA — belge bildirimi
// + hatırlatma ana PC'nin işi; ikinci PC'de de çalışırsa çift mesaj gider.
function startAutomationUnlessRelay() {
    if (isRelay()) { console.log('[Relay] İkinci PC (ekstre) modu — watcher/hatırlatma/aktif-cari BAŞLATILMADI (ana PC yürütür).'); return; }
    watcher.autoStart();
    try { siparis.autoStart(); } catch { /* yok say */ }
    try { reminders.autoStart(); } catch { /* Faz 6 */ }
    try { activeCari.autoStart(); } catch { /* yok say */ }
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
        startAutomationUnlessRelay();
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
    res.json({ success: true, isSetup: st.exists, needsReauth: !!st.needsReauth, version: APP_VERSION });
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
        startAutomationUnlessRelay();
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
        startAutomationUnlessRelay();
        res.json({ success: true, message: 'Bağlandı.' });
    } catch (err) {
        console.error('login hatası:', err.message);
        res.status(500).json({ success: false, message: 'Giriş hatası: ' + err.message });
    }
});

app.post('/api/reset', async (req, res) => {
    try {
        watcher.stop(); // DB ayarları silinirken izleme açık kalmasın
        try { siparis.stop(); } catch { /* yok say */ }
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

// ─── WhatsApp Modu (yerel / relay) ───────────────────────────────────────────
// Relay: bu PC kendi WhatsApp'ını açmaz; gönderimi ana PC'ye (relayTarget) yollar.
// Token asla geri gönderilmez (yalnız var/yok bilgisi).
app.get('/api/settings/wa', (req, res) => {
    res.json({
        success: true,
        mode: (waCfg && waCfg.mode) || 'local',
        relayTarget: (waCfg && waCfg.relayTarget) || '',
        hasToken: !!(waCfg && waCfg.relayToken),
        relay: isRelay() ? { ready: relayStatus.ready, me: relayStatus.me, error: relayStatus.error } : null,
    });
});
// Kullanıcı çoğunlukla yalnız IP yazıyor ("192.168.0.99"). Eksikleri tamamla:
// şema yoksa http://, port yoksa bu uygulamanın portu. Bilgisayar adı da olur.
// Dönüş: normalize adres | null (çözümlenemedi) | '' (boş girdi)
function normalizeRelayTarget(value) {
    let s = String(value || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s.replace(/^\/+/, '');
    let u;
    try { u = new URL(s); } catch { return null; }
    if (!u.hostname) return null;
    if (!u.port) u.port = String(PORT);
    return u.origin;
}

app.post('/api/settings/wa', async (req, res) => {
    const b = req.body || {};
    const mode = b.mode === 'relay' ? 'relay' : 'local';
    const relayTarget = normalizeRelayTarget(b.relayTarget);
    // Parola boş bırakılırsa mevcut korunur (yeniden yazmaya gerek kalmasın).
    const relayToken = (b.relayToken != null && b.relayToken !== '') ? String(b.relayToken) : (waCfg && waCfg.relayToken) || '';
    if (mode === 'relay') {
        if (relayTarget === null) return res.status(400).json({ success: false, message: 'Ana PC adresi anlaşılamadı. Ana PC\'nin IP adresini yazın (ör. 192.168.0.99).' });
        if (!relayTarget) return res.status(400).json({ success: false, message: 'Ana PC adresi gerekli (ör. 192.168.0.99).' });
        if (!relayToken) return res.status(400).json({ success: false, message: 'Relay parolası (token) gerekli — ana PC ile aynı olmalı.' });
    }
    const next = { mode, relayTarget: relayTarget || '', relayToken };
    try {
        const existing = loadConfigFile() || {};
        existing.wa = next;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(existing, null, 2), 'utf8');
        waCfg = next;
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Ayar kaydedilemedi: ' + e.message });
    }
    // Relay'e geçildiyse hemen durum çek + otomasyon zaten relay guard'ıyla susar.
    if (isRelay()) { try { await pollRelayStatus(); } catch { /* yok say */ } }
    res.json({ success: true, mode, relayTarget: next.relayTarget, relay: isRelay() ? { ready: relayStatus.ready, me: relayStatus.me, error: relayStatus.error } : null });
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
        // Sayfalama SQL 2008 UYUMLU: OFFSET/FETCH (SQL 2012+) yerine ROW_NUMBER
        // (SQL 2005+). Dış SELECT iç sorgunun TAKMA ADLARINI kullanır — ifadeler
        // tekrarlanmaz (selectCols ile birebir aynı sırada).
        const outerCols = [
            'IND', 'KOD', 'UNVAN', 'FIRMA', 'SMSGONDER', 'FIRMATIPI', 'BAKIYE',
            ...info.phoneCols.map(c => `[PH_${c}]`),
            ...info.emailCols.map(c => `[EM_${c}]`),
        ].join(', ');
        const rows = (await r.query(`
            SELECT ${outerCols} FROM (
                SELECT ${selectCols}, ROW_NUMBER() OVER (ORDER BY ${orderExpr}) AS __rn
                FROM ${T} ${where}
            ) q
            WHERE q.__rn > @offset AND q.__rn <= @offset + @limit
            ORDER BY q.__rn
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

// ─── Telefon → cari (AI bot: gelen numaradan cariyi bul) ─────────────────────
// Numaranın son 7 hanesiyle telefon sütunlarında eşleştirir (0/90/+90 önekleri
// ve ayraç farklarını aşmak için LIKE %son7%). Birden çok eşleşme olursa ilki.
async function findCariByPhone(firmaNo, phone) {
    if (!pool || !pool.connected) return null;
    const norm = normalizePhone(phone);
    if (!norm || norm.length < 7) return null;
    const tail = norm.slice(-7); // son 7 hane → önek/ayraç bağımsız eşleşme
    const info = await detectCariColumns(firmaNo);
    if (!info.phoneCols.length) return null;
    const T = `[${info.table}]`;

    const hasAdSoyad = info.all.some(c => c.toUpperCase() === 'ADI') && info.all.some(c => c.toUpperCase() === 'SOYADI');
    const nameParts = [];
    if (info.hasUnvan) nameParts.push(`NULLIF(LTRIM(RTRIM(UNVAN)),'')`);
    if (info.hasFirmaadi) nameParts.push(`NULLIF(LTRIM(RTRIM(FIRMAADI)),'')`);
    if (hasAdSoyad) nameParts.push(`NULLIF(LTRIM(RTRIM(ISNULL(ADI,'')+' '+ISNULL(SOYADI,''))),'')`);
    const nameExpr = nameParts.length ? `COALESCE(${nameParts.join(', ')}, CAST(IND AS NVARCHAR))` : `CAST(IND AS NVARCHAR)`;
    const firmaExpr = info.hasFirmaadi ? `NULLIF(LTRIM(RTRIM(FIRMAADI)),'')` : nameExpr;
    const smsSelect = info.hasSmsGonder ? 'ISNULL(SMSGONDER,0) AS SMSGONDER' : 'CAST(0 AS BIT) AS SMSGONDER';
    const hasBakiye = info.all.some(c => c.toUpperCase() === 'BAKIYE');
    const bakiyeSelect = hasBakiye ? 'BAKIYE AS BAKIYE' : 'CAST(NULL AS DECIMAL(18,2)) AS BAKIYE';

    const whereParts = [];
    if (info.hasDeleted) whereParts.push('ISNULL(DELETED,0)=0');
    if (info.hasStatus) whereParts.push('ISNULL(STATUS,1)<>2'); // pasif hariç
    // Son 7 haneyi rakam-dışı temizlenmiş sütunda ara. REPLACE zinciri: boşluk/(/)/-/+ temizle.
    const clean = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL([${col}],''),' ',''),'(',''),')',''),'-',''),'+','')`;
    const phoneWhere = info.phoneCols.map(c => `${clean(c)} LIKE @tail`).join(' OR ');
    whereParts.push(`(${phoneWhere})`);
    const where = 'WHERE ' + whereParts.join(' AND ');

    const r = pool.request();
    r.input('tail', sql.NVarChar, `%${tail}`);
    const rows = (await r.query(`
        SELECT TOP 1 IND, ${nameExpr} AS UNVAN, ${firmaExpr} AS FIRMA, ${smsSelect}, ${bakiyeSelect}
        FROM ${T} ${where}
    `)).recordset;
    if (!rows.length) return null;
    const row = rows[0];
    return {
        ind: row.IND,
        name: row.UNVAN,
        firma: row.FIRMA || row.UNVAN || null,
        smsGonder: !!row.SMSGONDER,
        bakiye: row.BAKIYE != null ? Number(row.BAKIYE) : null,
    };
}

// ─── Net bakiye (AI bot: cari hareketten SUM(BORC)-SUM(ALACAK)) ──────────────
// reminders.fetchNetBalances ile aynı kaynak; net>0 = borçlu. Map<ind, net>.
async function fetchNetBalances(poolArg, firmaNo, donemNo, ids) {
    const map = new Map();
    const p = poolArg || pool;
    if (!p || !p.connected || !donemNo) return map;
    const tbl = `F${firmaNo}D${donemNo}TBLCARIHAREKETLERI`;
    if (!(await validateTableName(tbl))) return map;
    const idNums = (ids || []).map(n => parseInt(n, 10)).filter(Number.isFinite);
    const idFilter = idNums.length ? ` WHERE FIRMANO IN (${idNums.join(',')})` : '';
    const rows = (await p.request().query(`
        SELECT FIRMANO, CAST(SUM(BORC) - SUM(ALACAK) AS DECIMAL(18,2)) AS NET
        FROM [${tbl}]${idFilter} GROUP BY FIRMANO
    `)).recordset;
    for (const r of rows) map.set(r.FIRMANO, Number(r.NET));
    return map;
}

// ─── Son cari hareketler (AI bot: "borç sebebi" bağlamı) ─────────────────────
async function fetchRecentMovements(firmaNo, donemNo, ind, limit = 5) {
    if (!pool || !pool.connected || !donemNo) return [];
    const tbl = `F${firmaNo}D${donemNo}TBLCARIHAREKETLERI`;
    if (!(await validateTableName(tbl))) return [];
    const cols = (await pool.request().query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${tbl}'`
    )).recordset.map(x => x.COLUMN_NAME.toUpperCase());
    const has = (c) => cols.includes(c);
    if (!has('FIRMANO')) return [];
    const tarih = has('TARIH') ? 'TARIH' : (has('VADETARIHI') ? 'VADETARIHI' : null);
    const izahat = has('IZAHAT') ? 'IZAHAT' : null;
    const sel = [
        tarih ? `${tarih} AS TARIH` : 'CAST(NULL AS DATETIME) AS TARIH',
        has('BORC') ? 'BORC' : 'CAST(0 AS DECIMAL(18,2)) AS BORC',
        has('ALACAK') ? 'ALACAK' : 'CAST(0 AS DECIMAL(18,2)) AS ALACAK',
        izahat ? `${izahat} AS IZAHAT` : `'' AS IZAHAT`,
    ].join(', ');
    const order = tarih ? `${tarih} DESC` : 'IND DESC';
    const r = pool.request();
    r.input('ind', sql.Int, parseInt(ind, 10));
    const rows = (await r.query(`
        SELECT TOP ${Math.max(1, Math.min(20, limit))} ${sel}
        FROM [${tbl}] WHERE FIRMANO=@ind ORDER BY ${order}
    `)).recordset;
    return rows.map(r => ({ tarih: r.TARIH, borc: r.BORC, alacak: r.ALACAK, izahat: r.IZAHAT }));
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

// Verilen IND'ler içinden DB'de HÂLÂ VAR OLAN carileri döner (kart silinmiş mi kontrolü).
// activeCariInds'ten farkı: STATUS'e BAKMAZ → pasif (STATUS=2) cari yine "var" sayılır.
// Yalnız gerçekten silinmiş (TBLCARI'de satır yok / DELETED=1) olanlar kümede DEĞİL.
// SÖZLEŞME: sorgu ÇALIŞAMADIYSA (pool yok / geçersiz girdi) null döner = "bilinmiyor",
// çağıran engelleme yapmaz (fail-open). Set döndüyse sonuç KESİNDİR: kümede olmayan
// ind gerçekten silinmiştir — boş küme "hepsi silinmiş" demektir, "DB kopuk" değil.
// (Eski hali her iki durumda da boş küme dönüyordu; tek-ind kontrolünde "silinmiş" ile
// "kontrol edilemedi" ayırt edilemiyor, sendOne guard'ı hiç tetiklenmiyordu.)
// reminders DB-uzlaştırması: silinen carinin log/dedup/elle-numara kalıntısını temizler,
// pasif carinin kalıcı verisine (perCariLastSent / manuel numara) DOKUNMADAN.
async function existingCariInds(firmaNo, indList) {
    if (!pool || !pool.connected || !Array.isArray(indList) || !indList.length) return null;
    const ids = indList.map(n => parseInt(n, 10)).filter(Number.isFinite);
    if (!ids.length) return null;
    const info = await detectCariColumns(firmaNo);
    const where = [`IND IN (${ids.join(',')})`];
    if (info.hasDeleted) where.push('ISNULL(DELETED,0)=0');
    const rows = (await pool.request().query(`SELECT IND FROM [${info.table}] WHERE ${where.join(' AND ')}`)).recordset;
    const set = new Set();
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
    const allowed = ['firmaNo', 'donemNo', 'intervalSec', 'verifyOnWhatsApp', 'simulateTyping', 'sendAllPhones', 'onlySmsGonder', 'sendAlacakli', 'cariType', 'rules', 'watchEdits', 'watchDeletes', 'editScanSec', 'editTemplate'];
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

// ═══════════════════════════════════════════════════════════════════════════
//  SİPARİŞ BİLDİRİMİ (tek sabit numaraya iç bildirim)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/siparis', (req, res) => {
    res.json({ success: true, status: siparis.getStatus() });
});

app.post('/api/siparis', (req, res) => {
    const allowed = ['firmaNo', 'donemNo', 'phone', 'intervalSec', 'minAmount', 'includeContent',
        'watchCancel', 'cancelScanSec', 'respectSendWindow', 'simulateTyping', 'template', 'cancelTemplate'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const prev = siparis.getConfig();
    siparis.setConfig(patch);
    // Firma/dönem değiştiyse yeni tablonun GEÇMİŞ siparişlerine mesaj atılmasın.
    if (patch.firmaNo && (patch.firmaNo !== prev.firmaNo || patch.donemNo !== prev.donemNo)) {
        siparis.resetWatermark();
    }
    res.json({ success: true, status: siparis.getStatus() });
});

app.post('/api/siparis/start', (req, res) => {
    if (!requireDb(req, res)) return;
    const ok = siparis.start();
    res.json({ success: ok, status: siparis.getStatus(), message: ok ? '' : (siparis.getStatus().lastError || 'Başlatılamadı.') });
});

app.post('/api/siparis/stop', (req, res) => {
    siparis.stop();
    res.json({ success: true, status: siparis.getStatus() });
});

app.get('/api/siparis/log', (req, res) => {
    res.json({ success: true, log: siparis.getLog(), status: siparis.getStatus() });
});

// Şablonu gerçek (son) siparişle deneyip bildirim numarasına tek mesaj atar.
app.post('/api/siparis/test', async (req, res) => {
    try { res.json(await siparis.sendTest()); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  AI OTO-YANIT BOTU
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/aibot', (req, res) => {
    res.json({ success: true, config: aiBot.getConfig(), status: aiBot.getStatus() });
});

app.post('/api/aibot', (req, res) => {
    const allowed = [
        'enabled', 'apiKey', 'clearApiKey', 'provider', 'baseUrl', 'model', 'firmaNo', 'donemNo',
        'businessName', 'paymentInfo', 'extraInstructions', 'startHour', 'endHour',
        'dailyCap', 'minGapSec', 'onlySmsGonder', 'includeMovements',
        'chatMode', 'historyTurns', 'maxReplyTokens',
        'maxThreadReplies', 'threadWindowMin', 'closeCooldownHours', 'closingMessage',
    ];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const config = aiBot.setConfig(patch);
    res.json({ success: true, config, status: aiBot.getStatus() });
});

app.get('/api/aibot/log', (req, res) => {
    res.json({ success: true, log: aiBot.getLog(), status: aiBot.getStatus() });
});

// Anahtarı sına: gövdede apiKey verilirse onu, yoksa kayıtlıyı dener.
app.post('/api/aibot/test', async (req, res) => {
    try {
        const b = req.body || {};
        const out = await aiBot.testApiKey(b.apiKey, { provider: b.provider, baseUrl: b.baseUrl, model: b.model });
        res.json({ success: true, ...out });
    } catch (err) {
        res.status(200).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  KONTÖR (kontörlü AI bakiyesi)
//  Bakiye kontör sunucusunda tutulur; burada yalnız okunur/gösterilir.
//  Yükleme UZAKTAN yapılır (lisans yöneticisi → Kontör) — bu tarafta yükleme ucu
//  YOKTUR; olsaydı müşteri kendine kontör yazabilirdi.
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/credits', (req, res) => {
    res.json({ success: true, credits: credits.getStatus() });
});

// Bakiyeyi sunucudan tazele (UI "Yenile" + kontör yüklendi bildirimi sonrası).
app.post('/api/credits/refresh', async (req, res) => {
    try {
        await credits.refresh();
        res.json({ success: true, credits: credits.getStatus() });
    } catch (err) {
        res.status(200).json({ success: false, message: err.message, credits: credits.getStatus() });
    }
});

// Sunucu adresi / model / düşük bakiye uyarı eşiği.
app.post('/api/credits/config', async (req, res) => {
    try {
        const b = req.body || {};
        credits.setConfig({ endpoint: b.endpoint, model: b.model, lowWarn: b.lowWarn });
        await credits.refresh();
        res.json({ success: true, credits: credits.getStatus() });
    } catch (err) {
        res.status(200).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  FİRMA BİLGİLERİ (belge/ekstre başlığı için) + LOGO
//  Alanlar TBLFIRMA'dan otomatik gelir; kullanıcı UI'dan düzeltir/ekler (IBAN,
//  yasal şartlar…). Ekstre PDF başlığı bu bilgilere ve logoya göre şekillenir.
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/firma/info', async (req, res) => {
    const { firmaNo } = req.query;
    if (!firmaNo) return res.status(400).json({ success: false, message: 'firmaNo gerekli.' });
    try {
        const info = await fetchFirmaInfo(firmaNo);
        res.json({ success: true, info, hasLogo: !!firmaLogoPath(firmaNo) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/firma/info', (req, res) => {
    const firmaNo = req.body && req.body.firmaNo;
    if (!firmaNo) return res.status(400).json({ success: false, message: 'firmaNo gerekli.' });
    const allowed = ['name', 'phone', 'email', 'web', 'address', 'taxOffice', 'taxNo', 'iban', 'legalTerms'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    saveFirmaOverride(firmaNo, patch);
    res.json({ success: true });
});

// Logo yükle (multipart 'logo'). PNG/JPG. data/firma-logo-<ind>.<ext>.
app.post('/api/firma/logo', upload.single('logo'), (req, res) => {
    const firmaNo = req.body && req.body.firmaNo;
    if (!firmaNo || !req.file) return res.status(400).json({ success: false, message: 'firmaNo ve logo gerekli.' });
    const ind = parseInt(firmaNo, 10);
    if (!Number.isFinite(ind)) return res.status(400).json({ success: false, message: 'Geçersiz firmaNo.' });
    const mt = req.file.mimetype || '';
    const ext = mt.includes('png') ? 'png' : (mt.includes('jpeg') || mt.includes('jpg')) ? 'jpg' : null;
    if (!ext) return res.status(400).json({ success: false, message: 'Yalnız PNG/JPG.' });
    try {
        ensureDataDir();
        // önce eski uzantıları temizle (png↔jpg değişimi için)
        for (const e of ['png', 'jpg', 'jpeg']) { const f = path.join(baseDir, 'data', `firma-logo-${ind}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f); }
        fs.writeFileSync(path.join(baseDir, 'data', `firma-logo-${ind}.${ext}`), req.file.buffer);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Logo URL'den indir + kaydet.
app.post('/api/firma/logo/url', async (req, res) => {
    const firmaNo = req.body && req.body.firmaNo;
    const url = req.body && req.body.url;
    const ind = parseInt(firmaNo, 10);
    if (!Number.isFinite(ind) || !url) return res.status(400).json({ success: false, message: 'firmaNo ve url gerekli.' });
    try {
        const buf = await downloadToBuffer(url);
        const ext = /\.png($|\?)/i.test(url) ? 'png' : 'jpg';
        ensureDataDir();
        for (const e of ['png', 'jpg', 'jpeg']) { const f = path.join(baseDir, 'data', `firma-logo-${ind}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f); }
        fs.writeFileSync(path.join(baseDir, 'data', `firma-logo-${ind}.${ext}`), buf);
        res.json({ success: true });
    } catch (err) {
        res.status(200).json({ success: false, message: 'Logo indirilemedi: ' + err.message });
    }
});

app.post('/api/firma/logo/clear', (req, res) => {
    const ind = parseInt(req.body && req.body.firmaNo, 10);
    if (!Number.isFinite(ind)) return res.status(400).json({ success: false, message: 'firmaNo gerekli.' });
    for (const e of ['png', 'jpg', 'jpeg']) { const f = path.join(baseDir, 'data', `firma-logo-${ind}.${e}`); try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* yok say */ } }
    res.json({ success: true });
});

// Logo önizleme (UI'da göster). ?firmaNo=
app.get('/api/firma/logo', (req, res) => {
    const f = firmaLogoPath(req.query.firmaNo);
    if (!f) return res.status(404).end();
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(f);
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
        // SQL 2008 uyumlu: TRY_CAST (2012+) yerine ham IZAHAT ile grupla, sayıya
        // çevirme + yeniden toplama JS'te. Farklı yazımlar ('13', ' 13') aynı koda
        // düştüğü için JS tarafında birleştiriyoruz.
        const raw = (await pool.request().query(`
            SELECT IZAHAT AS codeRaw,
                   COUNT(*) AS adet,
                   SUM(CASE WHEN ALACAK>0 THEN 1 ELSE 0 END) AS alacakAdet,
                   CAST(SUM(ALACAK) AS DECIMAL(18,2)) AS toplamAlacak,
                   CAST(SUM(BORC) AS DECIMAL(18,2)) AS toplamBorc
            FROM [${tbl}]
            GROUP BY IZAHAT
            HAVING SUM(ALACAK) > 0
        `)).recordset;
        const byCode = new Map();
        for (const r of raw) {
            const n = parseInt(r.codeRaw, 10);
            const code = Number.isFinite(n) ? n : null;
            const cur = byCode.get(code) || { code, adet: 0, alacakAdet: 0, toplamAlacak: 0, toplamBorc: 0 };
            cur.adet += Number(r.adet) || 0;
            cur.alacakAdet += Number(r.alacakAdet) || 0;
            cur.toplamAlacak += Number(r.toplamAlacak) || 0;
            cur.toplamBorc += Number(r.toplamBorc) || 0;
            byCode.set(code, cur);
        }
        const rows = [...byCode.values()].sort((a, b) => b.toplamAlacak - a.toplamAlacak);
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

// ─── Gönderim saati penceresi (gece gönderme koruması — paylaşılan) ───────────
app.get('/api/send-window', (req, res) => {
    res.json({ success: true, window: antiban.getSendWindow() });
});
app.post('/api/send-window', (req, res) => {
    res.json({ success: true, window: antiban.setSendWindow(req.body || {}) });
});

// İlk (otomatik) temasta eklenen "numaramızı kaydedin" ricası — soğuk gönderimi
// (rehbere kayıtsız numaraya toplu mesaj) sıcağa çevirir → ban/şikayet riskini düşürür.
const SAVE_CONTACT_LINE = 'Bildirimlerimizin size düzenli ulaşabilmesi için lütfen numaramızı telefon rehberinize kaydediniz.';

// ─── Anti-ban ayarları: günlük cap + soft uyarı eşiği + dönüş-budama (guard) ──
app.get('/api/antiban', (req, res) => {
    try {
        const st = waStatus();
        const ab = st.ready ? antiban.snapshot(st.me, DEFAULT_PACING.dailyCap) : null;
        res.json({ success: true, limits: antiban.getLimits(), guard: stats.guardConfig(), engage: stats.engageSummary(), antiban: ab });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.post('/api/antiban/limits', (req, res) => {
    try { res.json({ success: true, limits: antiban.setLimits(req.body || {}) }); }
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
app.post('/api/antiban/guard', (req, res) => {
    try { res.json({ success: true, guard: stats.setGuard(req.body || {}) }); }
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
// Kullanıcı "devam" onayı: o günkü uyarı katını onayla → sonraki kata kadar sormaz.
app.post('/api/antiban/ack', (req, res) => {
    try {
        const st = waStatus();
        if (!st.ready || !st.me) return res.status(400).json({ success: false, message: 'WhatsApp bağlı değil.' });
        res.json({ success: true, ...antiban.acknowledgeWarn(st.me) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
// Susturulan numarayı elle yeniden aç (dönüş-budama). phone boşsa hepsini.
app.post('/api/antiban/engage/reset', (req, res) => {
    try {
        const phone = req.body && req.body.phone;
        res.json({ success: true, reset: stats.resetEngage(phone || null) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
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
        const result = await waSend(c.phone, text, null, { simulateTyping: true, typingMs: 1500, channel: 'manual' });
        if (result.success) { antiban.recordSent(waStatus().me, 'manual'); return res.json({ success: true, message: 'Gönderildi.', phone: c.phone, name: c.name }); }
        res.status(500).json({ success: false, message: result.error || 'Gönderilemedi.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  HESAP EKSTRESİ (manuel, tek tek PDF gönderim)
//  Vega'nın .fr3 tasarımı Node'da basılamaz → ekstre PDF'i CARIHAREKETLERI'nden
//  üretilir (server/extre.js). Akış: bakiyeli carileri listele → tek tek "Gönder".
//  Alacaklı (net<0) ENGELİ YOK — ekstre bilgi amaçlı, iki yön de gönderilir.
// ═══════════════════════════════════════════════════════════════════════════

// Firma kısa adı (TBLFIRMA.KISAAD). firmaNo "0101" → IND 101. PDF başlığı için.
async function fetchFirmaName(firmaNo) {
    try {
        const ind = parseInt(firmaNo, 10);
        if (!pool || !pool.connected || !Number.isFinite(ind)) return null;
        const r = await pool.request().query(`SELECT KISAAD FROM TBLFIRMA WHERE IND=${ind}`);
        return (r.recordset[0] && r.recordset[0].KISAAD) || null;
    } catch { return null; }
}

// ─── Firma bilgileri (TBLFIRMA — kolonlar otomatik tespit) + kullanıcı override ─
// TBLFIRMA şeması sürümlere göre değişir; sabit kolon adı yerine INFORMATION_SCHEMA
// ile ADRES/TELEFON/VERGI* kolonlarını yakalayıp eşleriz. Kullanıcı UI'dan
// düzenlerse data/firma-info.json'daki override kazanır (IBAN, e-posta vb. eklenir).
const FIRMA_INFO_PATH = path.join(baseDir, 'data', 'firma-info.json');
function loadFirmaOverrides() {
    try { return JSON.parse(fs.readFileSync(FIRMA_INFO_PATH, 'utf8')); } catch { return {}; }
}
function saveFirmaOverride(firmaNo, patch) {
    const all = loadFirmaOverrides();
    all[String(firmaNo)] = { ...(all[String(firmaNo)] || {}), ...patch };
    try { ensureDataDir(); fs.writeFileSync(FIRMA_INFO_PATH, JSON.stringify(all, null, 2), 'utf8'); } catch (e) { console.error('firma-info yazılamadı:', e.message); }
    return all[String(firmaNo)];
}
function ensureDataDir() { const d = path.join(baseDir, 'data'); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

const firmaColCache = {}; // firmaNo -> { info, at }
async function fetchFirmaInfo(firmaNo) {
    const ind = parseInt(firmaNo, 10);
    const ov = loadFirmaOverrides()[String(firmaNo)] || {};
    if (!pool || !pool.connected || !Number.isFinite(ind)) {
        return { name: ov.name || '', ...ov };
    }
    try {
        const cols = (await pool.request().query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='TBLFIRMA'`
        )).recordset.map(x => x.COLUMN_NAME);
        const up = cols.map(c => c.toUpperCase());
        const pick = (...cands) => { for (const c of cands) { const i = up.indexOf(c); if (i >= 0) return cols[i]; } return null; };
        // Vega TBLFIRMA (canlı doğrulandı): unvan AD1+AD2, kısa ad KISAAD; adres
        // parçalı (MAHALLE/CADDE/SOKAK/APARTMANADI/APARTMANNO/DAIRE/ILCE/SEHIR/POSTAKODU);
        // vergi dairesi VDAIRESI, vergi no VNO/TCKIMLIKNO; mail MAIL; web WEBSITE.
        // Telefon kolonu bu şemada yok → boş (kullanıcı elle girer).
        const map = {
            ad1: pick('AD1', 'UNVAN', 'FIRMAADI'),
            ad2: pick('AD2'),
            kisaad: pick('KISAAD', 'ADI'),
            mahalle: pick('MAHALLE'), cadde: pick('CADDE'), sokak: pick('SOKAK'),
            apartmanAdi: pick('APARTMANADI'), apartmanNo: pick('APARTMANNO'), daire: pick('DAIRE'),
            ilce: pick('ILCE'), sehir: pick('SEHIR', 'IL'), postaKodu: pick('POSTAKODU'),
            phone: pick('TELEFON', 'TELEFON1', 'TEL', 'GSM', 'CEP'),
            email: pick('MAIL', 'EPOSTA', 'EMAIL', 'E_POSTA'),
            taxOffice: pick('VDAIRESI', 'VERGIDAIRESI', 'VDAIRE'),
            taxNo: pick('VNO', 'VERGINO', 'VKN'),
            tckn: pick('TCKIMLIKNO'),
            web: pick('WEBSITE', 'WEB', 'INTERNETADRESI'),
        };
        const selCols = [...new Set(Object.values(map).filter(Boolean))];
        const row = selCols.length
            ? (await pool.request().query(`SELECT ${selCols.map(c => `[${c}]`).join(', ')} FROM TBLFIRMA WHERE IND=${ind}`)).recordset[0] || {}
            : {};
        const val = (col) => (col && row[col] != null ? String(row[col]).trim() : '');
        // Adres: parçaları oku (boş olanları at). "No:x D:y  İlçe/Şehir Posta".
        const apt = [val(map.apartmanAdi), val(map.apartmanNo) ? `No:${val(map.apartmanNo)}` : '', val(map.daire) ? `D:${val(map.daire)}` : ''].filter(Boolean).join(' ');
        const yer = [val(map.ilce), val(map.sehir)].filter(Boolean).join('/');
        const address = [val(map.mahalle), val(map.cadde), val(map.sokak), apt, yer, val(map.postaKodu)].filter(Boolean).join(' ');
        const db = {
            name: [val(map.ad1), val(map.ad2)].filter(Boolean).join(' ') || val(map.kisaad),
            address,
            phone: val(map.phone),
            email: val(map.email),
            taxOffice: val(map.taxOffice),
            taxNo: val(map.taxNo) || val(map.tckn),
            web: val(map.web),
            city: val(map.sehir),
            district: val(map.ilce),
        };
        // Override (kullanıcı UI) DB üstüne yazar; boş override DB'yi ezmesin.
        const merged = { ...db };
        for (const [k, v] of Object.entries(ov)) if (v != null && String(v).trim() !== '') merged[k] = v;
        merged.iban = ov.iban || ''; // IBAN yalnız override'dan
        return merged;
    } catch (e) {
        console.error('fetchFirmaInfo:', e.message);
        return { name: ov.name || '', ...ov };
    }
}

// Firma logosu: data/firma-logo-<ind>.<ext>. Buffer döner (PDF için) ya da null.
function loadFirmaLogo(firmaNo) {
    const ind = parseInt(firmaNo, 10);
    if (!Number.isFinite(ind)) return null;
    for (const ext of ['png', 'jpg', 'jpeg']) {
        const f = path.join(baseDir, 'data', `firma-logo-${ind}.${ext}`);
        try { if (fs.existsSync(f)) return fs.readFileSync(f); } catch { /* yok say */ }
    }
    return null;
}
function firmaLogoPath(firmaNo) {
    const ind = parseInt(firmaNo, 10);
    for (const ext of ['png', 'jpg', 'jpeg']) {
        const f = path.join(baseDir, 'data', `firma-logo-${ind}.${ext}`);
        if (fs.existsSync(f)) return f;
    }
    return null;
}

// URL'den buffer indir (logo URL için). Boyut sınırı 3MB.
function downloadToBuffer(url) {
    return new Promise((resolve, reject) => {
        let mod;
        try { mod = require(url.startsWith('https') ? 'https' : 'http'); } catch { return reject(new Error('geçersiz URL')); }
        const req = mod.get(url, { timeout: 15000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume(); return resolve(downloadToBuffer(res.headers.location));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
            const chunks = []; let size = 0;
            res.on('data', (c) => { size += c.length; if (size > 3_000_000) { req.destroy(); reject(new Error('dosya çok büyük')); } else chunks.push(c); });
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('zaman aşımı')));
    });
}

// CARIHAREKETLERI.IZAHAT = Vega işlem kodu (canlı doğrulandı F0101). Belge tipi
// etiketi + "belge içeriği" (kalem) için kaynak belge tablosu eşlemesi.
const IZAHAT_LABEL = {
    21: 'Satış Faturası', 20: 'Alış Faturası', 33: 'Stok Çıkış', 32: 'Stok Giriş',
    13: 'Tahsilat', 11: 'Tediye', 22: 'Satış İrsaliyesi', 23: 'Alış İrsaliyesi',
    83: 'Havale (Banka Tahsilat)', 84: 'Banka Tediye',
    103: 'Devir', 104: 'Devir',
};
// IZAHAT kodu → kaynak belge tablo öneki(leri). Kalemler: BASLIK.BELGENO = cari
// hareket EVRAKNO → BASLIK.IND → HAREKET.EVRAKNO (= başlık IND). Canlı doğrulandı.
const DOC_LINE_MAP = {
    21: ['SATFAT', 'SATVADFAT', 'PSATFAT'],
    20: ['ALFAT', 'ALVADFAT'],
    22: ['SATIRS'], 23: ['ALIRS'],
    33: ['STKCIK'], 32: ['STKGIR'],
};
// Tablo varlık cache (dönem tabloları kararlı; tekrar INFORMATION_SCHEMA sorgusu yapma).
const _tblExistsCache = new Map();
async function tableExistsCached(name) {
    if (_tblExistsCache.has(name)) return _tblExistsCache.get(name);
    const ok = await validateTableName(name);
    _tblExistsCache.set(name, ok);
    return ok;
}

// Bir belgenin KALEMLERİ (belge içeriği): ürün/miktar/birim/fiyat/tutar. Yoksa null.
//
// TUTARLAR KDV DAHİL döner. VegaDB'de satır alanları KDV HARİÇ tutulur (FIYATI = birim
// matrah, GERCEKTOPLAM = satır matrahı, KDV = oran %); cari hareketteki BORC ise KDV
// DAHİL genel toplamdır (F0103 ile doğrulandı: ARATOPLAM × (1+KDV/100) = TUTAR = BORC).
// Müşteriye giden mesajda kalemler KDV hariç, bakiye/tutar KDV dahil olunca rakamlar
// tutmuyordu → kalemleri de KDV dahile çeviriyoruz.
//
// GERCEKTOPLAM bazı satırlarda 0 yazılıyor (F0103D0012'de 907/26547) ama MIKTAR ve
// FIYATI dolu → o satırlar mesajda "0,00 TL" görünüyordu. Boşsa MIKTAR × FIYATI'ndan
// hesapla.
async function fetchBelgeKalemleri(firmaNo, donemNo, izahat, evrakno) {
    const suffixes = DOC_LINE_MAP[Number(izahat)];
    const ev = evrakno == null ? '' : String(evrakno).trim();
    if (!suffixes || !ev) return null;
    for (const sfx of suffixes) {
        const bTbl = `F${firmaNo}D${donemNo}TBL${sfx}BASLIK`;
        const hTbl = `F${firmaNo}D${donemNo}TBL${sfx}HAREKET`;
        if (!(await tableExistsCached(bTbl)) || !(await tableExistsCached(hTbl))) continue;
        const rb = pool.request(); rb.input('e', sql.NVarChar, ev);
        const b = (await rb.query(`SELECT TOP 1 IND FROM [${bTbl}] WHERE BELGENO=@e ORDER BY IND DESC`)).recordset[0];
        if (!b) continue;
        const lines = (await pool.request().query(`
            SELECT MALINCINSI, STOKKODU, MIKTAR, BIRIM, FIYATI, GERCEKTOPLAM, KDV
            FROM [${hTbl}] WHERE EVRAKNO=${Number(b.IND)} ORDER BY SATIRNO
        `)).recordset;
        if (lines.length) return mapKalemRows(lines);
    }
    return null;
}

// Belge/sipariş satırlarını (aynı sütun şeması) mesajda kullanılan KDV DAHİL
// kalem nesnesine çevirir. Fatura ve sipariş hareket tabloları aynı alanları taşır.
function mapKalemRows(lines) {
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    return lines.map(l => {
        const miktar = Number(l.MIKTAR) || 0;
        const fiyatHaric = Number(l.FIYATI) || 0;
        const oran = Number(l.KDV) || 0;              // KDV oranı (%), 0 olabilir
        const k = 1 + oran / 100;
        const satirHaric = Number(l.GERCEKTOPLAM) || 0;
        // Birim fiyatı önce yuvarla, satır tutarını ONDAN türet — yoksa mesajda
        // "10 ADET x 11.250,00 = 112.500,02" gibi çarpımı tutmayan satır çıkar
        // (FIYATI zaten yuvarlanmış matrahtır: 9.533,90 ≈ 11.250 / 1,18).
        // GERCEKTOPLAM doluysa o esastır (iskonto/kampanya satırda uygulanmış olur).
        const fiyat = round2(fiyatHaric * k);
        const tutar = satirHaric > 0 ? round2(satirHaric * k) : round2(miktar * fiyat);
        return {
            ad: (l.MALINCINSI != null && String(l.MALINCINSI).trim()) || (l.STOKKODU != null && String(l.STOKKODU).trim()) || '',
            miktar, birim: (l.BIRIM == null ? '' : String(l.BIRIM)).trim(),
            fiyat, tutar, kdv: oran,
            fiyatHaric, tutarHaric: satirHaric || round2(miktar * fiyatHaric),
        };
    });
}

// Carinin dönem hareket satırları + yürüyen bakiye. opts.withKalemler → fatura/stok
// belgelerinin içeriğini (kalemleri) her satıra ekler.
async function fetchHareketRows(firmaNo, donemNo, ind, opts = {}) {
    const indNum = parseInt(ind, 10);
    if (!pool || !pool.connected || !/^\d+$/.test(String(firmaNo)) || !/^\d+$/.test(String(donemNo)) || !Number.isFinite(indNum)) return { rows: [], net: 0 };
    const tbl = `F${firmaNo}D${donemNo}TBLCARIHAREKETLERI`;
    if (!(await validateTableName(tbl))) return { rows: [], net: 0 };
    const colRs = (await pool.request().input('t', sql.NVarChar, tbl)
        .query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t`)).recordset;
    const have = new Set(colRs.map(c => c.COLUMN_NAME.toUpperCase()));
    const tarihCol = have.has('TARIH') ? 'TARIH' : null;
    const evrakCol = have.has('EVRAKNO') ? 'EVRAKNO' : null;
    const izahatCol = have.has('IZAHAT') ? 'IZAHAT' : null; // sayısal işlem kodu
    const sel = [
        tarihCol ? `${tarihCol} AS TARIH` : `CAST(NULL AS DATETIME) AS TARIH`,
        evrakCol ? `${evrakCol} AS EVRAKNO` : `CAST('' AS NVARCHAR(1)) AS EVRAKNO`,
        izahatCol ? `${izahatCol} AS IZAHAT` : `CAST(NULL AS INT) AS IZAHAT`,
        `CAST(ISNULL(BORC,0) AS DECIMAL(18,2)) AS BORC`,
        `CAST(ISNULL(ALACAK,0) AS DECIMAL(18,2)) AS ALACAK`,
    ].join(', ');
    const order = (tarihCol ? `${tarihCol} ASC, ` : '') + 'IND ASC';
    const recs = (await pool.request().query(`SELECT ${sel} FROM [${tbl}] WHERE FIRMANO=${indNum} ORDER BY ${order}`)).recordset;
    let run = 0; const rows = [];
    for (const r of recs) {
        run += Number(r.BORC) - Number(r.ALACAK);
        const izahat = r.IZAHAT != null ? Number(r.IZAHAT) : null;
        rows.push({
            tarih: r.TARIH, evrak: r.EVRAKNO, izahat,
            belgeTip: (izahat != null && IZAHAT_LABEL[izahat]) || '',
            borc: Number(r.BORC), alacak: Number(r.ALACAK), bakiye: run, kalemler: null,
        });
    }
    if (opts.withKalemler) {
        for (const row of rows) {
            if (DOC_LINE_MAP[row.izahat] && row.evrak) {
                try { row.kalemler = await fetchBelgeKalemleri(firmaNo, donemNo, row.izahat, row.evrak); }
                catch { row.kalemler = null; }
            }
        }
    }
    return { rows, net: run };
}

// AI bot [FATURA]: carinin SON satış faturası (izahat 21) başlık + kalemleri.
// Tüm kalemleri çekmemek için önce kalemsiz satırlar alınır, son 21 satırı bulunur,
// yalnız onun kalemleri getirilir. Yoksa null.
async function fetchLastSalesInvoice(firmaNo, donemNo, ind) {
    const { rows } = await fetchHareketRows(firmaNo, donemNo, ind);
    let last = null;
    for (const r of rows) if (Number(r.izahat) === 21) last = r; // rows tarih ASC → son eşleşen en yeni
    if (!last) return null;
    let kalemler = null;
    try { kalemler = await fetchBelgeKalemleri(firmaNo, donemNo, 21, last.evrak); } catch { kalemler = null; }
    return { tarih: last.tarih, evrak: last.evrak, tutar: Number(last.borc) || 0, kalemler };
}

// Belge kalemlerini (fatura/irsaliye/stok İÇERİĞİ) düz metne çevir. Belge-tipi
// watcher mesajına "içeriği de ekle" seçeneği açıkken eklenir. Kalem yoksa null.
// Kalemler KDV DAHİL'dir (fetchBelgeKalemleri çeviriyor).
//
// belgeTutari verilirse (cari hareketteki BORC/ALACAK = belgenin KDV dahil genel
// toplamı) genel toplam ONDAN yazılır — kalem toplamından DEĞİL. İskonto/masraf içeren
// faturalarda kalem toplamı başlıktan sapıyor (F0103D0012: 10.735 faturanın 48'i);
// müşteriye giden toplam, borcuna yazılan tutarla birebir aynı olmalı.
function formatDocContentText(kalemler, belgeTutari, baslik = 'Belge içeriği:') {
    const ks = Array.isArray(kalemler) ? kalemler : [];
    if (!ks.length) return null;
    const money = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const qty = (n) => { const x = Number(n) || 0; return Number.isInteger(x) ? String(x) : money(x); };
    const out = [baslik];
    const MAX = 25;
    for (const k of ks.slice(0, MAX)) {
        const q = Number(k.miktar) ? `${qty(k.miktar)}${k.birim ? ' ' + k.birim : ''} x ${money(k.fiyat)}` : '';
        out.push(`- ${k.ad || '(kalem)'}${q ? '  ' + q : ''} = ${money(k.tutar)} TL`);
    }
    if (ks.length > MAX) out.push(`... (+${ks.length - MAX} kalem daha)`);
    const toplam = Number(belgeTutari) > 0
        ? Number(belgeTutari)
        : ks.reduce((s, k) => s + (Number(k.tutar) || 0), 0);
    out.push(`Toplam (KDV dahil): ${money(toplam)} TL`);
    return out.join('\n');
}

// docType (watcher) → izahat kodu (DOC_LINE_MAP kalem tablosu eşlemesi için).
const DOCTYPE_IZAHAT = { satisFaturasi: 21, alisFaturasi: 20, satisIrsaliyesi: 22, alisIrsaliyesi: 23, stokCikis: 33, stokGiris: 32 };

// Watcher "belge içeriğini de ekle" seçeneği: O AN kesilen belgenin (EVRAKNO)
// kalemlerini düz metne çevirir. Desteklenmeyen tip / kalem yok → null.
// belgeTutari: watcher'ın o satır için hesapladığı tutar (BORC/ALACAK = KDV dahil).
async function buildDocContentText(firmaNo, donemNo, docType, evrak, belgeTutari) {
    const izahat = DOCTYPE_IZAHAT[docType];
    if (!izahat || evrak == null || evrak === '') return null;
    let kalemler = null;
    try { kalemler = await fetchBelgeKalemleri(firmaNo, donemNo, izahat, evrak); } catch { kalemler = null; }
    return formatDocContentText(kalemler, belgeTutari);
}

// Sipariş bildirimi "içeriği de ekle" seçeneği: ALINAN SİPARİŞ fişinin kalemleri.
// Fatura'dan farkı: bağlantı BELGENO değil, başlık IND üzerinden kurulur (sipariş
// cari harekete yazmadığı için elimizde zaten başlık IND'i var).
// TBLALSIPHAREKET.EVRAKNO = TBLALSIPBASLIK.IND (canlı doğrulandı).
// SATIRNO sipariş satırlarında NULL olabiliyor → IND ile sırala.
async function buildSiparisContentText(firmaNo, donemNo, basIND, tutar) {
    const ind = parseInt(basIND, 10);
    if (!pool || !pool.connected || !/^\d+$/.test(String(firmaNo)) || !/^\d+$/.test(String(donemNo)) || !Number.isFinite(ind)) return null;
    const hTbl = `F${firmaNo}D${donemNo}TBLALSIPHAREKET`;
    if (!(await tableExistsCached(hTbl))) return null;
    try {
        const lines = (await pool.request().query(`
            SELECT MALINCINSI, STOKKODU, MIKTAR, BIRIM, FIYATI, GERCEKTOPLAM, KDV
            FROM [${hTbl}] WHERE EVRAKNO=${ind} ORDER BY ISNULL(SATIRNO, IND)
        `)).recordset;
        if (!lines.length) return null;
        return formatDocContentText(mapKalemRows(lines), tutar, 'Sipariş içeriği:');
    } catch (e) {
        console.error('[Sipariş] kalem sorgusu:', e.message);
        return null;
    }
}

// Dönemde bakiyesi (net) sıfır OLMAYAN carileri listele (borçlu + alacaklı).
app.get('/api/extre/list', async (req, res) => {
    if (!requireDb(req, res)) return;
    const { firmaNo, donemNo } = req.query;
    const search = (req.query.search || '').trim();
    if (!firmaNo || !donemNo || !/^\d+$/.test(firmaNo) || !/^\d+$/.test(donemNo))
        return res.status(400).json({ success: false, message: 'Geçerli firma/dönem gerekli.' });
    try {
        const tbl = `F${firmaNo}D${donemNo}TBLCARIHAREKETLERI`;
        if (!(await validateTableName(tbl)))
            return res.status(404).json({ success: false, message: 'Cari hareket tablosu bulunamadı.' });
        const netRows = (await pool.request().query(`
            SELECT FIRMANO, CAST(SUM(BORC) - SUM(ALACAK) AS DECIMAL(18,2)) AS NET
            FROM [${tbl}] GROUP BY FIRMANO HAVING SUM(BORC) - SUM(ALACAK) <> 0
        `)).recordset;
        const netMap = new Map(netRows.map(r => [r.FIRMANO, Number(r.NET)]));
        let ids = [...netMap.keys()];
        // Pasif (STATUS=2) / silinmiş carileri süz.
        const active = await activeCariInds(firmaNo, ids);
        ids = ids.filter(i => active.has(i));
        const contacts = await resolveCariContacts(firmaNo, ids);
        let data = ids.map(ind => {
            const c = contacts.get(ind) || {};
            const net = netMap.get(ind);
            return {
                ind, name: c.name || String(ind), kod: c.kod || '', firma: c.firma || c.name || '',
                phone: c.phone || null, valid: !!c.valid, smsGonder: !!c.smsGonder,
                bakiye: net, durum: net > 0 ? 'Borç' : net < 0 ? 'Alacak' : '',
            };
        });
        if (search) {
            const s = search.toLocaleLowerCase('tr');
            data = data.filter(d =>
                (d.name || '').toLocaleLowerCase('tr').includes(s) ||
                String(d.kod || '').toLocaleLowerCase('tr').includes(s) ||
                String(d.phone || '').includes(search));
        }
        data.sort((a, b) => Math.abs(b.bakiye) - Math.abs(a.bakiye));
        res.json({ success: true, data, total: data.length });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Tek carinin ekstre satırları (göndermeden önce ekranda göster).
app.get('/api/extre/preview', async (req, res) => {
    if (!requireDb(req, res)) return;
    const { firmaNo, donemNo, ind } = req.query;
    if (!firmaNo || !donemNo || !ind) return res.status(400).json({ success: false, message: 'firma/dönem/cari gerekli.' });
    try {
        const indNum = parseInt(ind, 10);
        const { rows, net } = await fetchHareketRows(firmaNo, donemNo, indNum);
        const c = (await resolveCariContacts(firmaNo, [indNum])).get(indNum) || {};
        res.json({
            success: true,
            cari: { name: c.name || String(indNum), kod: c.kod || '', firma: c.firma || c.name || '', phone: c.phone || null, valid: !!c.valid, pasif: !!c.pasif },
            net, durum: net > 0 ? 'Borç' : net < 0 ? 'Alacak' : '', rows,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Gönderilecek PDF'in BİREBİR kendisi (önizleme). /send ile aynı üretici → ne
// görünüyorsa o gider. Tarayıcı/Electron Chromium PDF'i iframe'de gösterir.
app.get('/api/extre/pdf', async (req, res) => {
    if (!requireDb(req, res)) return;
    const { firmaNo, donemNo, ind } = req.query;
    if (!firmaNo || !donemNo || !ind) return res.status(400).json({ success: false, message: 'firma/dönem/cari gerekli.' });
    try {
        const indNum = parseInt(ind, 10);
        const c = (await resolveCariContacts(firmaNo, [indNum])).get(indNum) || {};
        const { rows, net } = await fetchHareketRows(firmaNo, donemNo, indNum, { withKalemler: true });
        const firma = await fetchFirmaInfo(firmaNo);
        const pdf = await buildExtrePdf({
            firmaName: (firma && firma.name) || '', firma, logo: loadFirmaLogo(firmaNo),
            cariName: c.name || String(indNum), cariKod: c.kod || '',
            donem: donemNo, rows, net, generatedAt: new Date(),
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="ekstre-${indNum}.pdf"`);
        res.send(pdf);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Tek cariye PDF ekstre gönder (manuel). Anti-ban kapısı + WA doğrulama uygulanır.
app.post('/api/extre/send', async (req, res) => {
    if (!requireDb(req, res)) return;
    const firmaNo = req.body && req.body.firmaNo;
    const donemNo = req.body && req.body.donemNo;
    const indNum = parseInt(req.body && req.body.ind, 10);
    if (!firmaNo || !donemNo || !Number.isFinite(indNum))
        return res.status(400).json({ success: false, message: 'firma/dönem/cari gerekli.' });
    if (!waStatusX().ready) return res.status(400).json({ success: false, message: isRelay() ? 'Ana PC WhatsApp bağlı değil (relay).' : 'WhatsApp bağlı değil. Önce QR okutun.' });
    const me = waStatusX().me;
    const g = gateX(me, DEFAULT_PACING.dailyCap, 'manual');
    if (!g.ok) return res.status(429).json({ success: false, message: g.reason || 'Anti-ban: gönderim sınırına ulaşıldı.' });
    try {
        const c = (await resolveCariContacts(firmaNo, [indNum])).get(indNum);
        if (!c) return res.status(404).json({ success: false, message: 'Cari bulunamadı.' });
        if (c.pasif) return res.status(400).json({ success: false, message: 'Cari pasif (STATUS=2) — gönderilmez.' });
        if (!c.phone || !c.valid) return res.status(400).json({ success: false, message: 'Carinin geçerli telefonu yok.' });

        const { rows, net } = await fetchHareketRows(firmaNo, donemNo, indNum, { withKalemler: true });
        const firma = await fetchFirmaInfo(firmaNo);
        const pdf = await buildExtrePdf({
            firmaName: (firma && firma.name) || '', firma, logo: loadFirmaLogo(firmaNo),
            cariName: c.name, cariKod: c.kod,
            donem: donemNo, rows, net, generatedAt: new Date(),
        });

        const chk = await waCheckX(c.phone);
        if (!chk.exists) return res.status(400).json({ success: false, message: chk.transient ? 'WhatsApp doğrulaması geçici hata — tekrar deneyin.' : 'Numara WhatsApp kullanıcısı değil.' });

        const caption = (req.body && req.body.message && String(req.body.message).trim())
            ? String(req.body.message)
            : `Sayın ${c.firma || c.name}, hesap ekstreniz ektedir.`;
        const fileName = `Hesap-Ekstresi-${String(c.kod || indNum)}.pdf`.replace(/[^\w.\-]+/g, '_');
        const result = await waSendX(c.phone, caption, { kind: 'document', buffer: pdf, mimetype: 'application/pdf', fileName }, { simulateTyping: true, typingMs: 1200, channel: 'extre' });
        if (result.success) { recordSentX(me, 'manual'); return res.json({ success: true, message: 'Ekstre gönderildi.', phone: c.phone, name: c.name }); }
        res.status(500).json({ success: false, message: result.error || 'Gönderilemedi.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Tek cariye SON SATIŞ FATURASI içeriğini METİN olarak gönder (manuel, AI'sız).
// Aynı anti-ban kapısı + WA doğrulaması (ekstre gönderimiyle bire bir).
// ── GEÇİCİ TEŞHİS: cari hareket IZAHAT kod dağılımı + son satırlar. "Havale girişi
// mesaj gitmiyor" arızası için: havale satırının işlem kodunu tespit etmek. Tarayıcıda:
//   http://localhost:3100/api/extre/_izahat?firmaNo=0101&donemNo=0014
app.get('/api/extre/_izahat', async (req, res) => {
    if (!requireDb(req, res)) return;
    const { firmaNo, donemNo } = req.query;
    if (!/^\d+$/.test(String(firmaNo)) || !/^\d+$/.test(String(donemNo)))
        return res.status(400).json({ success: false, message: 'firmaNo/donemNo gerekli (rakam).' });
    const tbl = `F${firmaNo}D${donemNo}TBLCARIHAREKETLERI`;
    if (!(await validateTableName(tbl))) return res.status(404).json({ success: false, message: 'Cari hareket tablosu yok.' });
    try {
        // &evrak=<no> → o evrakın TAM işlem kodu + hangi kaynak başlık tablosunda (havale tespiti).
        if (req.query.evrak) {
            const ev = String(req.query.evrak);
            const r = pool.request(); r.input('e', sql.NVarChar, ev);
            const rows = (await r.query(`
                SELECT IND, TARIH, IZAHAT, EVRAKNO, FIRMANO,
                       CAST(ISNULL(BORC,0) AS DECIMAL(18,2)) AS BORC,
                       CAST(ISNULL(ALACAK,0) AS DECIMAL(18,2)) AS ALACAK
                FROM [${tbl}] WHERE EVRAKNO=@e ORDER BY IND DESC`)).recordset;
            const SRC = ['CARGIRBASLIK', 'CARCIKBASLIK', 'BANKTAHSILBASLIK', 'BANKGIRBASLIK', 'BANKHARBASLIK', 'BANKODEMEBASLIK', 'BANKGELIRBASLIK', 'EFTBASLIK', 'TAHSILBASLIK', 'SATFATBASLIK', 'ALFATBASLIK', 'STKCIKBASLIK'];
            const inSource = {};
            for (const s of SRC) {
                const t = `F${firmaNo}D${donemNo}TBL${s}`;
                if (!(await validateTableName(t))) continue;
                try { const n = (await pool.request().input('e', sql.NVarChar, ev).query(`SELECT COUNT(*) AS c FROM [${t}] WHERE BELGENO=@e`)).recordset[0].c; if (n > 0) inSource[s] = n; } catch { /* yok say */ }
            }
            // Banka/cari tahsilat HAREKET tabloları: gerçek satırlar (FIRMANO=cari bağı, TUTAR, IZAHAT).
            const HAR = ['BANKGIRHAREKET', 'BANKTAHSILHAREKET', 'BANKHARHAREKET', 'EFTHAREKET', 'CARGIRHAREKET'];
            const hareketRows = {};
            for (const h of HAR) {
                const t = `F${firmaNo}D${donemNo}TBL${h}`;
                if (!(await validateTableName(t))) continue;
                try { const rs = (await pool.request().input('e', sql.NVarChar, ev).query(`SELECT TOP 5 * FROM [${t}] WHERE BELGENO=@e`)).recordset; if (rs.length) hareketRows[h] = rs; } catch { /* yok say */ }
            }
            return res.json({ success: true, table: tbl, evrak: ev, rows, inSource, hareketRows });
        }
        const dist = (await pool.request().query(`
            SELECT IZAHAT, COUNT(*) AS c,
                   SUM(CASE WHEN ISNULL(BORC,0)>0 THEN 1 ELSE 0 END) AS borc,
                   SUM(CASE WHEN ISNULL(ALACAK,0)>0 THEN 1 ELSE 0 END) AS alacak
            FROM [${tbl}] GROUP BY IZAHAT ORDER BY IZAHAT`)).recordset;
        const recent = (await pool.request().query(`
            SELECT TOP 30 IND, TARIH, IZAHAT, EVRAKNO,
                   CAST(ISNULL(BORC,0) AS DECIMAL(18,2)) AS BORC,
                   CAST(ISNULL(ALACAK,0) AS DECIMAL(18,2)) AS ALACAK
            FROM [${tbl}] ORDER BY IND DESC`)).recordset;
        res.json({ success: true, table: tbl, dist, recent });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── GEÇİCİ TEŞHİS: havale/banka tahsilat satırını yakala (PARAMSIZ).
// Firma/dönem watcher config'ten alınır. Arctos'ta havale girişi yapıp şu URL'i aç:
//   http://localhost:3100/api/extre/_havale
// En yeni satır en üstte gelir → FIRMANO(cari bağı), TUTAR, BELGENO, IZAHAT, IND.
app.get('/api/extre/_havale', async (req, res) => {
    if (!requireDb(req, res)) return;
    let firmaNo = req.query.firmaNo, donemNo = req.query.donemNo;
    if (!firmaNo || !donemNo) {
        try { const c = watcher.getConfig(); firmaNo = firmaNo || c.firmaNo; donemNo = donemNo || c.donemNo; } catch { /* yok say */ }
    }
    if (!/^\d+$/.test(String(firmaNo || '')) || !/^\d+$/.test(String(donemNo || '')))
        return res.status(400).json({ success: false, message: 'firmaNo/donemNo bulunamadı (watcher config boş). ?firmaNo=..&donemNo=.. ekle.' });
    try {
        // Tüm banka/cari tahsilat HAREKET tablolarından son satırlar (IND DESC).
        const HAR = ['BANKGIRHAREKET', 'BANKTAHSILHAREKET', 'BANKHARHAREKET', 'BANKGELIRHAREKET', 'EFTHAREKET', 'CARGIRHAREKET', 'CARCIKHAREKET'];
        const out = {};
        for (const h of HAR) {
            const t = `F${firmaNo}D${donemNo}TBL${h}`;
            if (!(await validateTableName(t))) continue;
            try { out[h] = (await pool.request().query(`SELECT TOP 8 * FROM [${t}] ORDER BY IND DESC`)).recordset; }
            catch (e) { out[h] = { error: e.message }; }
        }
        res.json({ success: true, firmaNo, donemNo, hareketRows: out });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LİSANS (çevrimdışı — imzalı lisans dosyası + 15 gün deneme)
//  Bu uçlar lisans kapısının DIŞINDADIR (LICENSE_OPEN_PATHS): lisanssız kullanıcı
//  donanım kimliğini görebilsin ve lisans yükleyebilsin diye.
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/license', (req, res) => {
    res.json({ success: true, license: license.getStatus(), version: APP_VERSION });
});

// Lisans dosyası (.lic) içeriğini doğrula + kaydet. Geçerliyse otomasyonu başlat.
app.post('/api/license/activate', async (req, res) => {
    try {
        const r = license.activate(req.body && req.body.content);
        if (!r.ok) {
            return res.status(400).json({
                success: false, message: r.error, reason: r.reason,
                license: license.getStatus(),
            });
        }
        // Lisans geldi → kilitliyken atlanan otomatik bağlantıyı şimdi kur.
        try { await autoConnectFromConfig(); } catch (e) { console.error('lisans sonrası oto-bağlantı:', e.message); }
        // Dosyayla kurulan lisansı panele bildir → elle takip gerekmesin.
        lastReport = Date.now();
        license.reportRemote().catch(() => { });
        res.json({ success: true, license: r.license });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Uzaktan lisans al: bu bilgisayara tanımlı lisansı sunucudan indirip kurar.
// Müşteriye .lic dosyası göndermeye gerek kalmaz — panelde lisans verilir,
// müşteri "İnternetten Al" der (ya da lisans ekranı kendiliğinden yoklar).
app.post('/api/license/fetch', async (req, res) => {
    try {
        const r = await license.fetchRemote();
        if (!r.ok) {
            return res.json({
                success: false, reason: r.reason, message: r.error,
                license: license.getStatus(),
            });
        }
        try { await autoConnectFromConfig(); } catch (e) { console.error('lisans sonrası oto-bağlantı:', e.message); }
        res.json({ success: true, license: r.license });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Yeniden denetle (ör. saat düzeltildi, süre doldu).
app.post('/api/license/recheck', async (req, res) => {
    try {
        license.invalidateCache();
        const st = license.getStatus();
        if (st.valid) { try { await autoConnectFromConfig(); } catch { /* yok say */ } }
        else stopAutomation('lisans geçersiz');
        res.json({ success: true, license: st });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  WHATSAPP DURUM / OTURUM
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/wa/status', async (req, res) => {
    try {
        // Relay modu: bu PC kendi Baileys'ini AÇMAZ (conflict olmasın). Durumu ana
        // PC'den (relayTarget) çek; QR yok. UI "ana PC üzerinden bağlı" gösterir.
        if (isRelay()) {
            await pollRelayStatus();
            const s = waStatusX();
            return res.json({ success: true, ready: s.ready, initializing: false, hasQr: false, qrImage: null, me: s.me, error: s.error, antiban: null, relay: true, relayTarget: waCfg.relayTarget });
        }
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
//  RELAY SUNUCU TARAFI (ANA PC / PC1)
// ═══════════════════════════════════════════════════════════════════════════
// İkinci PC (relay modunda) buraya iş yollar; tek WA oturumu burada olduğundan
// conflict olmaz. Token config.json → wa.relayToken ile eşleşmeli. NOT: ana PC'nin
// KENDİSİ relay moduna geçmemeli (mode=local); bu uçlar mode'dan bağımsız açık —
// yalnız token korur. LAN dışına açmayın (güvenlik duvarı: yalnız yerel ağ).
function relayAuthed(req, res) {
    const need = (waCfg && waCfg.relayToken) || ((loadConfigFile() || {}).wa || {}).relayToken || '';
    const got = req.get('x-relay-token') || '';
    if (!need) { res.status(503).json({ success: false, error: 'Ana PC relay parolası (token) tanımlı değil.' }); return false; }
    if (got !== need) { res.status(401).json({ success: false, error: 'relay parolası (token) geçersiz' }); return false; }
    return true;
}

// İkinci PC durum sorgusu: ana PC'nin WhatsApp'ı bağlı mı?
app.get('/api/relay-status', (req, res) => {
    if (!relayAuthed(req, res)) return;
    const s = waStatus();
    res.json({ ready: s.ready, me: s.me, error: s.error });
});

// İkinci PC: numara WhatsApp kullanıcısı mı? (ana PC'nin oturumuyla sorgula)
app.post('/api/relay-check', async (req, res) => {
    if (!relayAuthed(req, res)) return;
    try { res.json(await checkOnWhatsApp((req.body || {}).phone)); }
    catch (e) { res.json({ exists: false, transient: true, error: e.message }); }
});

// İkinci PC: gönderilecek işi al → anti-ban kapısı + ana PC oturumuyla gönder.
// media.b64 varsa buffer'a çevrilir (ekstre PDF). Anti-ban sayacı BURADA işler
// (tek hesap = tek sayaç). channel korunur (istatistik/kanal ayrımı için).
app.post('/api/relay-send', async (req, res) => {
    if (!relayAuthed(req, res)) return;
    const { phone, text, media, opts } = req.body || {};
    if (!phone) return res.status(400).json({ success: false, error: 'telefon gerekli' });
    if (!waStatus().ready) return res.status(503).json({ success: false, error: 'Ana PC WhatsApp bağlı değil.' });
    const me = waStatus().me;
    const ch = (opts && opts.channel) || 'relay';
    const gateCh = ch === 'bulk' ? 'bulk' : 'manual';
    const g = antiban.gate(me, DEFAULT_PACING.dailyCap, gateCh);
    if (!g.ok) return res.status(429).json({ success: false, error: g.reason || 'Anti-ban: gönderim sınırına ulaşıldı.' });
    let m = null;
    if (media && media.b64) m = { kind: media.kind, mimetype: media.mimetype, fileName: media.fileName, buffer: Buffer.from(media.b64, 'base64') };
    try {
        const result = await waSend(phone, text || '', m, opts || {});
        if (result.success) { try { antiban.recordSent(me, gateCh); } catch { /* yok say */ } }
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── Güven paneli (Pano) ─────────────────────────────────────────────────────
// Bugünkü gönderim/teslim/okundu/yanıt/hata + son 7 gün + anti-ban durumu (warm-up
// günü / tavan doluluk / cooldown). Hepsi sayaç; AI yok.
app.get('/api/stats', (req, res) => {
    try {
        const st = waStatus();
        const ab = st.ready ? antiban.snapshot(st.me, DEFAULT_PACING.dailyCap) : null;
        res.json({ success: true, today: stats.today(), history: stats.history(7), antiban: ab });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Günlük özeti kendi WhatsApp numarana gönder (kendine mesaj). st.me = bağlı hesap.
app.post('/api/stats/push-summary', async (req, res) => {
    try {
        const st = waStatus();
        if (!st.ready || !st.me) return res.status(400).json({ success: false, message: 'WhatsApp bağlı değil.' });
        const myPhone = String(st.me).split(':')[0].split('@')[0];
        const result = await waSend(myPhone, stats.summaryText(), null, { channel: 'manual' });
        if (result.success) return res.json({ success: true });
        return res.status(500).json({ success: false, message: result.error || 'Gönderilemedi.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
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
        const g = antiban.gate(waStatus().me, p.dailyCap, 'bulk');
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
            channel: 'bulk',
        });

        // Gönderim sırasında kopma: bağlantı gelene kadar bekle, aynı alıcıya
        // yeniden dene. Bağlıyken alınan hatalar (geçersiz numara vb.) yeniden
        // denenmez, normal "failed" akışına düşer.
        while (!result.success && !waStatus().ready && !job.cancelled) {
            if (!(await waitForWhatsApp(job))) break;
            result = await waSend(phone, text, job.media, {
                simulateTyping: p.simulateTyping,
                typingMs: rand(1200, 2600),
                channel: 'bulk',
            });
        }
        if (job.cancelled) { pushEvent(job, { type: 'cancelled', index: i }); break; }

        if (result.success) {
            antiban.recordSent(waStatus().me, 'bulk'); // anti-ban saat/gün sayacı
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

// Çevrimdışı lisans: data/ altındaki şifreli lisans deposu + deneme sayacı.
license.configure({ baseDir });

// Kontör istemcisi: kontörlü ("vega") AI sağlayıcısının bakiye/çağrı katmanı.
// Kimlik olarak imzalı lisans kullanılır → ayrı parola/jeton dağıtılmaz.
credits.configure({
    baseDir,
    getLicenseProof: () => license.getLicenseProof(),
    getHardwareId: () => license.getHardwareId(),
});

// Lisans geçersizken çalışan her şeyi durdur. API kapısı manuel gönderimi zaten
// keser; bu, ARKA PLAN otomasyonunu (watcher/hatırlatma/aktif cari) susturur —
// aksi halde deneme dolduktan sonra da mesaj atmayı sürdürürdü.
function stopAutomation(sebep) {
    try { watcher.stop(); } catch { /* yok say */ }
    try { siparis.stop(); } catch { /* yok say */ }
    try { reminders.stop(); } catch { /* yok say */ }
    try { activeCari.stop(); } catch { /* yok say */ }
    console.warn(`[Lisans] Otomasyon durduruldu — ${sebep}`);
}

// Deneme süresi uygulama AÇIKKEN dolabilir (günlerce açık kalıyor). Saatte bir
// denetle; dolduğu an otomasyonu kes. Kapı zaten her istekte denetler (1 dk cache).
setInterval(() => {
    license.invalidateCache();
    const st = license.getStatus();
    if (!st.valid) stopAutomation(st.reason || 'geçersiz');
}, 60 * 60 * 1000).unref?.();

// ─── Uzaktan lisans yoklaması ────────────────────────────────────────────────
// Lisans dosyası göndermeyi tamamen gereksiz kılar:
//  • Lisans yoksa/geçersizse sık sık yoklar → biz panelden lisansı verir vermez
//    müşterinin ekranı kendiliğinden açılır, kimseye dosya yollamaya gerek kalmaz.
//  • Lisans varsa ve bitmesine az kaldıysa seyrek yoklar → panelden süre
//    uzatınca müşteri hiçbir şey yapmadan yenilenir.
// İnternet yoksa hiçbir şey bozulmaz: mevcut lisans çevrimdışı doğrulanmaya devam eder.
//  • Lisans varsa panele BİLDİRİLİR (günde bir) → eski masaüstü araçla verilmiş
//    lisanslar da panele kendiliğinden düşer; artık elle içe aktarma gerekmez.
const LIC_POLL_UNLICENSED_MS = 3 * 60 * 1000;    // lisans bekleniyor
const LIC_POLL_RENEWAL_MS = 6 * 60 * 60 * 1000;  // yenileme kollaması
const LIC_REPORT_MS = 24 * 60 * 60 * 1000;       // panele kendini bildirme
let lastRenewalCheck = 0;
let lastReport = 0;

async function pollRemoteLicense() {
    const st = license.getStatus();
    const now = Date.now();

    // Lisansı panele bildir. Hak istemez, cevabı beklenmez; internet yoksa
    // sessizce geçilir. Amaç: panelde kimde hangi lisans var, görünsün.
    if (st.valid && now - lastReport >= LIC_REPORT_MS) {
        lastReport = now;
        license.reportRemote().catch(() => { });
    }

    if (st.valid) {
        // Süresiz lisansta yenileme aramaya gerek yok.
        if (st.daysLeft == null || st.daysLeft > 10) return;
        if (now - lastRenewalCheck < LIC_POLL_RENEWAL_MS) return;
        lastRenewalCheck = now;
    }

    const r = await license.fetchRemote();
    if (r.ok) {
        console.log(`  ✓ Lisans sunucudan alındı: ${r.license.customerName || ''}`);
        try { await autoConnectFromConfig(); } catch (e) { console.error('lisans sonrası oto-bağlantı:', e.message); }
    }
    // NOT_FOUND / SAME / NETWORK sessizce geçilir — her 3 dakikada bir log basmasın.
}

setTimeout(() => { pollRemoteLicense().catch(() => { }); }, 20_000).unref?.();
setInterval(() => { pollRemoteLicense().catch(() => { }); }, LIC_POLL_UNLICENSED_MS).unref?.();

// Anti-ban katmanı: warm-up rampı + saatlik/günlük tavan (hesap-başı sayaç).
antiban.configure(baseDir);
// Ban-şüpheli bağlantı kapanışını anti-ban'a bildir: 403/401 veya reconnect
// fırtınasında gate() gönderimi soğutur (flaglenen numarayı dövmeyi keser).
setDisconnectHandler((code, accountId, errMsg, conflict) => {
    try { antiban.noteDisconnect(accountId || waStatus().me, code, errMsg, conflict); } catch { /* yok say */ }
});
// Oturumu WhatsApp iptal etti (diskte bağlı kimlik varken QR isteniyor). Sebebi ne
// olursa olsun gönderime devam etmek yanlış → 24 saat sticky soğuma + warm-up sıfır.
setRevokedHandler((accountId) => {
    try {
        const r = antiban.noteSessionRevoked(accountId || waStatus().me);
        if (r) console.warn(`[Antiban] Oturum iptali — gönderim durduruldu: ${r.reason}`);
    } catch { /* yok say */ }
});
// Kimlik doğrulanmış açılış = numara kısıtlı değil → yanlış alarm soğumasını kaldır.
setOpenHandler((accountId) => {
    try {
        const r = antiban.noteOpen(accountId);
        if (r && r.cleared) console.log(`[Antiban] Bağlantı kuruldu — soğuma kaldırıldı (${r.cleared})`);
    } catch { /* yok say */ }
});

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
    // {firmaadi} imzası: Firma Bilgileri (TBLFIRMA + kullanıcı override) adı.
    getFirmaName: async (firmaNo) => { try { return (await fetchFirmaInfo(firmaNo)).name || ''; } catch { return ''; } },
    // "Belge içeriğini de ekle" seçeneği için: kesilen belgenin kalemlerini metne çevir.
    buildDocContentText,
    // Anti-ban dönüş-budama: üst üste yanıt vermeyen numaraya gönderme + ilk temasta kaydet-ricası.
    isSuspended: (phone) => { try { return stats.isSuspended(phone); } catch { return false; } },
    shouldAskSave: (phone) => { try { return stats.shouldAskSave(phone); } catch { return false; } },
    saveContactText: SAVE_CONTACT_LINE,
});

// Sipariş bildirimi: alınan sipariş fişi oluşunca TEK sabit numaraya haber ver.
// (Sipariş cari harekete yazmaz → watcher göremez; ayrı tablo taranır.)
siparis.configure({
    getPool: () => pool,
    sql,
    resolveCariContacts,
    waSend,
    waStatus,
    baseDir,
    getFirmaName: async (firmaNo) => { try { return (await fetchFirmaInfo(firmaNo)).name || ''; } catch { return ''; } },
    buildSiparisContentText,
});

// Periyodik bakiye/borç hatırlatma zamanlayıcısı.
reminders.configure({
    getPool: () => pool,
    sql,
    resolveCariContacts,
    reminderCandidateInds,
    activeCariInds,
    existingCariInds,
    waSend,
    checkOnWhatsApp,
    waStatus,
    baseDir,
    isSuspended: (phone) => { try { return stats.isSuspended(phone); } catch { return false; } },
    shouldAskSave: (phone) => { try { return stats.shouldAskSave(phone); } catch { return false; } },
    saveContactText: SAVE_CONTACT_LINE,
});

// Arctos'ta o an açık cariyi plan cache'ten tespit eden izleyici (yüzen buton için).
activeCari.configure({ getPool: () => pool, sql });

// AI oto-yanıt botu: gelen WA mesajlarına Claude Haiku ile SEÇMELİ cevap.
// Anahtar config.json'daki DB parolasıyla aynı makine anahtarıyla şifrelenir.
aiBot.configure({
    credits,                       // kontörlü ('vega') sağlayıcı: çağrı + kontör düşme
    getPool: () => pool,
    sql,
    findCariByPhone,
    fetchNetBalances,
    fetchRecentMovements,
    fetchLastSalesInvoice,
    waSend,
    waStatus,
    encryptSecret,
    decryptSecret,
    // Bot "borç sebebi / ekstre" sorusunda PDF hesap ekstresi üretir (manuel gönderimle aynı üretici).
    buildCariExtre: async (firmaNo, donemNo, ind) => {
        const indNum = parseInt(ind, 10);
        const c = (await resolveCariContacts(firmaNo, [indNum])).get(indNum) || {};
        const { rows, net } = await fetchHareketRows(firmaNo, donemNo, indNum, { withKalemler: true });
        const firma = await fetchFirmaInfo(firmaNo);
        const pdf = await buildExtrePdf({
            firmaName: (firma && firma.name) || '', firma, logo: loadFirmaLogo(firmaNo),
            cariName: c.name || String(indNum), cariKod: c.kod || '',
            donem: donemNo, rows, net, generatedAt: new Date(),
        });
        const fileName = `Hesap-Ekstresi-${String(c.kod || indNum)}.pdf`.replace(/[^\w.\-]+/g, '_');
        return { buffer: pdf, fileName };
    },
    recordSent: () => { try { antiban.recordSent(waStatus().me, 'aibot'); } catch { /* yok say */ } },
    // firma/dönem config'te boşsa uygulama bağlamına düş.
    getContext: () => {
        const c = loadConfigFile();
        if (c && c.uiContext) return c.uiContext;
        try { const w = watcher.getConfig(); return { firmaNo: w.firmaNo, donemNo: w.donemNo }; } catch { return null; }
    },
    baseDir,
});
// Baileys gelen-mesaj dinleyicisini bota bağla (her yeniden bağlanışta yeniden kurulur).
setIncomingHandler(aiBot.handleIncoming);

// Relay modunda ana PC durumunu düzenli yokla (UI + gönderim öncesi hazır-mı kararı).
if (isRelay()) {
    console.log(`[Relay] İkinci PC (ekstre) modu — gönderim ana PC'ye vekil edilecek: ${waCfg.relayTarget}`);
    pollRelayStatus();
    setInterval(pollRelayStatus, 15000).unref?.();
}

app.listen(PORT, async () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  Vega Toplu WhatsApp çalışıyor → ${url}\n`);

    // Lisans/deneme durumu — geçersizse DB'ye bile bağlanma, otomasyonu başlatma.
    // UI lisans ekranını gösterir (statik dosyalar ve /api/license açık).
    const lic = license.getStatus();
    if (!lic.valid) {
        console.warn(`  ⚠ LİSANS GEÇERSİZ (${lic.reason}) — uygulama kilitli.`);
        console.warn(`    ${lic.detail || ''}`);
        console.warn(`    Donanım Kimliği: ${lic.hardwareId}`);
        console.warn('    Lisans dosyasını arayüzden yükleyin.\n');
    } else {
        if (lic.trial) console.log(`  Deneme sürümü — ${lic.daysLeft} gün kaldı.\n`);
        else console.log(`  Lisanslı: ${lic.customerName}${lic.daysLeft !== null ? ` (${lic.daysLeft} gün)` : ' (süresiz)'}\n`);

        // Giriş PIN'i kaldırıldı: kayıtlı config varsa açılışta otomatik bağlan
        // (watcher + reminders kendiliğinden başlar).
        try {
            const ok = await autoConnectFromConfig();
            if (ok) console.log('  Otomatik bağlanıldı (kayıtlı ayarlar).');
        } catch (e) { console.error('boot oto-bağlantı:', e.message); }
    }

    // Lisanssız da olsa arayüzü aç — kullanıcı lisans ekranını görsün.
    if (isPkg) {
        const startCmd = process.platform === 'win32' ? 'start ""' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
        try { require('child_process').exec(`${startCmd} ${url}`); } catch { /* yok say */ }
    }
});
