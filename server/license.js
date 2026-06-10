// ═══════════════════════════════════════════════════════════════════════════
//  Online Lisans Altyapısı (scaffold)
//  Amaç: ileride çevrimiçi lisans zorunluluğu için hazır altyapı. ŞU AN
//  uygulamayı KISITLAMAZ (mode='scaffold', enforced=false) — yalnızca anahtarı
//  saklar, uzak sunucu varsa doğrular, durumu UI'ya verir. Zorunlu hale getirmek
//  için tek değişiklik: ENFORCED=true (veya VEGA_LICENSE_ENFORCED=1) + geçerli
//  LICENSE_API_URL. O zaman isAllowed() gerçek doğrulamaya bağlanır.
//
//  Uzak sunucu sözleşmesi (ileride yazılacak; HTTP JSON):
//    POST {LICENSE_API_URL}/validate
//      gövde: { key, machineId, product, version }
//      yanıt: { valid:boolean, plan?:string, validUntil?:ISO, message?:string }
//  Sunucu yoksa (URL boş) anahtar yerel 'offline' durumda saklanır; scaffold
//  modda bu uygulamayı engellemez.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const PRODUCT = 'vega-whatsapp';

// Zorunluluk bayrağı. Varsayılan: kapalı (altyapı hazır, kısıtlama yok).
const ENFORCED = process.env.VEGA_LICENSE_ENFORCED === '1';
// Uzak lisans sunucusu (ileride). Boş = çevrimdışı/scaffold.
const API_URL = (process.env.VEGA_LICENSE_API_URL || '').replace(/\/+$/, '');
// Periyodik yeniden denetim (ms). 0 = kapalı.
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 saat

let baseDir = __dirname;
let STATE_PATH = null;
let MACHINE_PATH = null;
let recheckTimer = null;

let state = {
    key: null,
    status: 'unlicensed',   // unlicensed | offline | valid | invalid | expired | error
    plan: null,
    validUntil: null,
    lastCheckAt: null,
    lastMessage: '',
    activatedAt: null,
};

function configure(opts = {}) {
    baseDir = opts.baseDir || baseDir;
    const dataDir = path.join(baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    STATE_PATH = path.join(dataDir, 'license.json');
    MACHINE_PATH = path.join(dataDir, 'machine-id');
    loadState();
    if (RECHECK_INTERVAL_MS > 0 && API_URL && state.key) {
        recheckTimer = setInterval(() => { recheck().catch(() => {}); }, RECHECK_INTERVAL_MS);
        if (recheckTimer.unref) recheckTimer.unref();
        recheck().catch(() => {});
    }
}

function loadState() {
    try {
        if (fs.existsSync(STATE_PATH)) state = { ...state, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
    } catch (e) { console.error('[License] state okunamadı:', e.message); }
}
function saveState() {
    try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8'); }
    catch (e) { console.error('[License] state yazılamadı:', e.message); }
}

// Kararlı cihaz kimliği: ilk çalıştırmada üretilip data/machine-id'de saklanır.
// (Donanım MAC'ı yerine kalıcı rastgele kimlik — taşınabilir, gizlilik dostu.)
function getMachineId() {
    try {
        if (MACHINE_PATH && fs.existsSync(MACHINE_PATH)) {
            const id = fs.readFileSync(MACHINE_PATH, 'utf8').trim();
            if (id) return id;
        }
    } catch { /* yok say */ }
    const seed = `${os.hostname()}|${os.platform()}|${os.arch()}|${crypto.randomBytes(8).toString('hex')}`;
    const id = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32).toUpperCase();
    try { if (MACHINE_PATH) fs.writeFileSync(MACHINE_PATH, id, 'utf8'); } catch { /* yok say */ }
    return id;
}

// Uzak sunucuya doğrulama isteği (yalnızca API_URL doluysa).
function postJson(url, body) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(url); } catch (e) { return reject(new Error('Geçersiz lisans URL')); }
        const lib = u.protocol === 'https:' ? https : http;
        const payload = JSON.stringify(body);
        const req = lib.request(u, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            timeout: 12000,
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data || '{}')); }
                catch { reject(new Error('Lisans sunucusu geçersiz yanıt verdi')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('Lisans sunucusu zaman aşımı')); });
        req.write(payload);
        req.end();
    });
}

async function validateRemote(key) {
    const resp = await postJson(`${API_URL}/validate`, {
        key, machineId: getMachineId(), product: PRODUCT,
        version: process.env.VEGA_APP_VERSION || null,
    });
    return resp;
}

// Anahtar etkinleştir. Sunucu varsa doğrular; yoksa yerel 'offline' saklar.
async function activate(key) {
    key = String(key || '').trim();
    if (!key) { state.lastMessage = 'Anahtar boş.'; return getStatus(); }
    state.key = key;
    state.activatedAt = new Date().toISOString();

    if (!API_URL) {
        state.status = 'offline';
        state.lastMessage = 'Anahtar kaydedildi (çevrimdışı). Lisans sunucusu tanımlı değil.';
        state.lastCheckAt = new Date().toISOString();
        saveState();
        return getStatus();
    }
    try {
        const r = await validateRemote(key);
        state.status = r.valid ? 'valid' : 'invalid';
        state.plan = r.plan || null;
        state.validUntil = r.validUntil || null;
        state.lastMessage = r.message || (r.valid ? 'Lisans etkin.' : 'Lisans geçersiz.');
    } catch (e) {
        state.status = 'error';
        state.lastMessage = 'Sunucuya ulaşılamadı: ' + e.message;
    }
    state.lastCheckAt = new Date().toISOString();
    saveState();
    return getStatus();
}

// Mevcut anahtarı yeniden denetle.
async function recheck() {
    if (!state.key) { state.lastMessage = 'Kayıtlı anahtar yok.'; return getStatus(); }
    if (!API_URL) { state.status = 'offline'; state.lastCheckAt = new Date().toISOString(); saveState(); return getStatus(); }
    try {
        const r = await validateRemote(state.key);
        state.status = r.valid ? 'valid' : (r.expired ? 'expired' : 'invalid');
        state.plan = r.plan || state.plan;
        state.validUntil = r.validUntil || state.validUntil;
        state.lastMessage = r.message || '';
    } catch (e) {
        state.status = 'error';
        state.lastMessage = 'Denetim hatası: ' + e.message;
    }
    state.lastCheckAt = new Date().toISOString();
    saveState();
    return getStatus();
}

function getStatus() {
    return {
        enforced: ENFORCED,
        mode: ENFORCED ? 'enforced' : 'scaffold',
        online: !!API_URL,
        machineId: getMachineId(),
        key: state.key,
        status: state.status,
        plan: state.plan,
        validUntil: state.validUntil,
        lastCheckAt: state.lastCheckAt,
        message: state.lastMessage,
        allowed: isAllowed(),
    };
}

// İleride zorunlu modda kapı: scaffold modda DAİMA true (kısıtlama yok).
function isAllowed() {
    if (!ENFORCED) return true;
    return state.status === 'valid';
}

module.exports = { configure, getMachineId, getStatus, activate, recheck, isAllowed };
