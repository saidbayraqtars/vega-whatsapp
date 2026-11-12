// ═══════════════════════════════════════════════════════════════════════════
//  Kontör İstemcisi — AI oto-yanıtın kontörlü ("Vega") sağlayıcısı
//
//  Kurgu: müşteri API anahtarı girmez. Model çağrısı bizim kontör sunucumuza
//  (Cloudflare Worker) gider; anahtar orada durur, kontör orada düşer.
//  BAKİYE SUNUCUDA tutulur → bu bilgisayarda kurcalanamaz. Buradaki kopya
//  yalnız ekranda göstermek/uyarmak içindir.
//
//  Ücretlendirme: kontör YALNIZ müşteriye mesaj gerçekten gidince düşer.
//    chat()     → cevap + reservationId (henüz düşmedi)
//    commit()   → WhatsApp gönderimi başarılı → kontör düşer
//    release()  → bot sessiz kaldı / gönderilemedi → düşmez (ücretsiz)
//
//  Kimlik: ayrı parola yok — mevcut RSA imzalı lisans kanıt olarak gönderilir
//  (license.getLicenseProof). Lisanssız (deneme) kurulumda kontörlü AI kapalı.
//
//  Uzaktan kontör yükleme: lisans yöneticisindeki "Kontör" sekmesinden yapılır;
//  bu tarafta yapılacak bir şey yoktur — bakiye bir sonraki tazelemede görünür.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Yayındaki kontör sunucusu (projeler/vega-kontor → wrangler deploy).
// Kullanıcı UI'dan değiştirebilir; config.endpoint doluysa o kazanır.
const BUILTIN_ENDPOINT = 'https://vega-kontor.expertbilisim.workers.dev';

const DEFAULT_CONFIG = {
    endpoint: '',                    // boşsa BUILTIN_ENDPOINT
    model: 'claude-haiku-4-5',       // sunucudaki izinli model listesinden
    lowWarn: 50,                     // bu bakiyenin altında UI uyarısı
};

// Bakiye önbelleği: sunucu doğruluk kaynağıdır, bu yalnız gösterim içindir.
const DEFAULT_CACHE = {
    balance: null, known: false, blocked: false,
    dailyCap: null, callsToday: null, sentToday: null,
    lastSync: null, lastError: null,
};

const REFRESH_MS = 10 * 60 * 1000;   // arka planda bakiye tazeleme aralığı

let deps = null;
let CONFIG_PATH = null;
let config = { ...DEFAULT_CONFIG };
let cache = { ...DEFAULT_CACHE };
let refreshTimer = null;

// ─── Kalıcılık ──────────────────────────────────────────────────────────────
function configure(d) {
    deps = d;
    const dataDir = path.join(d.baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    CONFIG_PATH = path.join(dataDir, 'credits.json');
    load();
    // Açılışta bir kez, sonra periyodik tazele (uzaktan yüklenen kontör görünsün).
    setTimeout(() => { refresh().catch(() => { }); }, 8000).unref?.();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { refresh().catch(() => { }); }, REFRESH_MS);
    refreshTimer.unref?.();
}

function load() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            config = { ...DEFAULT_CONFIG, ...(raw.config || {}) };
            cache = { ...DEFAULT_CACHE, ...(raw.cache || {}) };
        }
    } catch (e) { console.error('[Kontör] ayar okunamadı:', e.message); }
}

function save() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify({ config, cache }, null, 2), 'utf8'); }
    catch { /* bellekte devam */ }
}

function endpoint() {
    return String(config.endpoint || BUILTIN_ENDPOINT || '').trim().replace(/\/+$/, '');
}

// ─── HTTP (pkg-güvenli: SDK yok, çekirdek modüller) ─────────────────────────
function request(pathname, { method = 'POST', body = null, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const base = endpoint();
        if (!base) return reject(new Error('Kontör sunucusu adresi tanımlı değil.'));
        let u;
        try { u = new URL(base + pathname); } catch { return reject(new Error('Kontör sunucusu adresi geçersiz: ' + base)); }

        const payload = body ? JSON.stringify(body) : null;
        const mod = u.protocol === 'http:' ? http : https;
        const req = mod.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'http:' ? 80 : 443),
            path: u.pathname + u.search,
            method,
            headers: {
                ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
                ...headers,
            },
            timeout: 45000,
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                let j = null;
                try { j = JSON.parse(data); } catch { /* aşağıda ele alınır */ }
                if (!j) return reject(new Error(`Kontör sunucusu yanıtı çözümlenemedi (HTTP ${res.statusCode}).`));
                resolve({ statusCode: res.statusCode, json: j });
            });
        });
        req.on('error', (e) => reject(new Error('Kontör sunucusuna ulaşılamadı: ' + e.message)));
        req.on('timeout', () => req.destroy(new Error('Kontör sunucusu zaman aşımı.')));
        if (payload) req.write(payload);
        req.end();
    });
}

// Kimlik başlıkları: imzalı lisans + (deneme hesapları için) donanım kimliği.
function authHeaders() {
    const h = {};
    const proof = deps?.getLicenseProof && deps.getLicenseProof();
    if (proof) h['authorization'] = 'Vega ' + Buffer.from(JSON.stringify(proof), 'utf8').toString('base64');
    const hw = deps?.getHardwareId && deps.getHardwareId();
    if (hw) h['x-vega-hwid'] = hw;
    return h;
}

function hasIdentity() {
    return !!(deps?.getLicenseProof && deps.getLicenseProof());
}

// Sunucu hata kodlarını kullanıcıya gösterilebilir Türkçeye çevir.
const ERR_TR = {
    NO_CREDIT: 'Kontör bitti. Yeni kontör yüklenmesi için tedarikçinizle görüşün.',
    DAILY_CAP: 'Günlük AI çağrı tavanına ulaşıldı. Yarın devam edecek.',
    ACCOUNT_BLOCKED: 'Kontör hesabınız kapalı. Tedarikçinizle görüşün.',
    AUTH_MISSING: 'Kontörlü AI için lisans gerekli (deneme sürümünde kapalıdır).',
    AUTH_MALFORMED: 'Lisans kimliği okunamadı.',
    LICENSE_INVALID: 'Lisans imzası kontör sunucusunda doğrulanamadı.',
    LICENSE_EXPIRED: 'Lisans süresi dolmuş.',
    LICENSE_WRONG_PRODUCT: 'Lisans başka bir ürüne ait.',
    RESERVATION_NOT_FOUND: 'Kontör kaydı bulunamadı.',
    BAD_REQUEST: 'Geçersiz istek.',
};
function trError(code) {
    if (!code) return 'Bilinmeyen hata.';
    if (ERR_TR[code]) return ERR_TR[code];
    if (String(code).startsWith('UPSTREAM')) return 'Model sağlayıcı hatası: ' + String(code).slice(10);
    return String(code);
}

// ─── Bakiye ─────────────────────────────────────────────────────────────────

async function refresh() {
    if (!hasIdentity() && !deps?.getHardwareId) {
        cache = { ...cache, lastError: 'Lisans yok' };
        return cache;
    }
    try {
        const { statusCode, json } = await request('/v1/balance', { method: 'GET', headers: authHeaders() });
        if (statusCode === 200 && json.success) {
            cache = {
                balance: json.balance ?? 0,
                known: json.known !== false,
                blocked: !!json.blocked,
                dailyCap: json.dailyCap ?? null,
                callsToday: json.callsToday ?? null,
                sentToday: json.sentToday ?? null,
                lastSync: new Date().toISOString(),
                lastError: null,
            };
        } else {
            cache = { ...cache, lastError: trError(json.error), lastSync: new Date().toISOString() };
        }
    } catch (e) {
        cache = { ...cache, lastError: e.message, lastSync: new Date().toISOString() };
    }
    save();
    return cache;
}

// UI durumu (bakiye + son hata + ayarlar).
function getStatus() {
    return {
        endpoint: endpoint(),
        endpointCustom: !!(config.endpoint || '').trim(),
        model: config.model,
        lowWarn: config.lowWarn,
        hasIdentity: hasIdentity(),
        hardwareId: (deps?.getHardwareId && deps.getHardwareId()) || null,
        ...cache,
        low: cache.balance != null && cache.balance <= Number(config.lowWarn || 0),
    };
}

function getConfig() { return { ...config }; }

function setConfig(patch = {}) {
    const next = { ...config };
    if (patch.endpoint !== undefined) next.endpoint = String(patch.endpoint || '').trim().replace(/\/+$/, '');
    if (patch.model !== undefined) next.model = String(patch.model || '').trim() || DEFAULT_CONFIG.model;
    if (patch.lowWarn !== undefined) next.lowWarn = Math.max(0, Number(patch.lowWarn) || 0);
    config = next;
    save();
    return getConfig();
}

// Bakiye yeterli mi — model çağrısından ÖNCE hızlı ön kontrol (önbellekten).
// Kesin karar sunucudadır; bu yalnız gereksiz ağ turunu önler.
function likelyOutOfCredit() {
    return cache.known && cache.balance != null && cache.balance <= 0;
}

// ─── Model çağrısı ──────────────────────────────────────────────────────────
// Dönüş: { ok:true, reply, reservationId, cost, balance } | { ok:false, code, error }

async function chat({ system, messages, maxTokens, model }) {
    if (!hasIdentity()) return { ok: false, code: 'AUTH_MISSING', error: trError('AUTH_MISSING') };

    let r;
    try {
        r = await request('/v1/chat', {
            headers: authHeaders(),
            body: {
                system: system || '',
                messages: messages || [],
                model: model || config.model,
                maxTokens: maxTokens || 800,
            },
        });
    } catch (e) {
        cache = { ...cache, lastError: e.message }; save();
        return { ok: false, code: 'NETWORK', error: e.message };
    }

    const { statusCode, json } = r;
    if (statusCode !== 200 || !json.success) {
        const code = json.error || `HTTP_${statusCode}`;
        // Sunucu bakiye bildirdiyse ekrandaki rakamı da tazele.
        if (json.balance != null) { cache = { ...cache, balance: json.balance, known: true }; }
        cache = { ...cache, lastError: trError(code), lastSync: new Date().toISOString() };
        save();
        return { ok: false, code, error: trError(code) };
    }

    cache = { ...cache, balance: json.balance ?? cache.balance, known: true, lastError: null, lastSync: new Date().toISOString() };
    save();
    return { ok: true, reply: json.reply || '', reservationId: json.reservationId, cost: json.cost || 1, balance: json.balance };
}

// Mesaj GİTTİ → kontörü düş.
async function commit(reservationId, note) {
    if (!reservationId) return { ok: false };
    try {
        const { statusCode, json } = await request('/v1/commit', {
            headers: authHeaders(), body: { reservationId, note: note || undefined },
        });
        if (statusCode === 200 && json.success) {
            cache = { ...cache, balance: json.balance ?? cache.balance, known: true, lastSync: new Date().toISOString() };
            save();
            return { ok: true, balance: json.balance, spent: json.spent || 0 };
        }
        return { ok: false, error: trError(json.error) };
    } catch (e) {
        // Ağ koptuysa kontör düşmez (bizim zararımıza) — mesaj zaten gitti, müşteriyi bekletme.
        console.error('[Kontör] düşme bildirilemedi:', e.message);
        return { ok: false, error: e.message };
    }
}

// Bot sessiz kaldı / gönderilemedi → rezervasyonu iptal et (kontör düşmez).
async function release(reservationId) {
    if (!reservationId) return { ok: false };
    try {
        const { json } = await request('/v1/void', { headers: authHeaders(), body: { reservationId } });
        return { ok: !!json.success };
    } catch { return { ok: false }; }
}

// UI "Bağlantıyı Sına": sunucu ayakta mı + bakiye ne?
async function test() {
    const { statusCode, json } = await request('/health', { method: 'GET' });
    if (statusCode !== 200 || !json.ok) throw new Error('Kontör sunucusu yanıt vermedi.');
    const bal = await refresh();
    return { ok: true, models: json.models || [], balance: bal.balance, known: bal.known, error: bal.lastError };
}

module.exports = {
    configure, getConfig, setConfig, getStatus,
    refresh, chat, commit, release, test,
    likelyOutOfCredit, hasIdentity,
    // cloudapi.js 'vega' yolu aynı sunucuya aynı lisans kimliğiyle konuşur.
    endpoint, authHeaders,
    BUILTIN_ENDPOINT,
};
