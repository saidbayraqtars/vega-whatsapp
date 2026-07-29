// ═══════════════════════════════════════════════════════════════════════════
//  Vega WhatsApp — Çevrimdışı (offline) Lisanslama
//
//  Kurgu:
//   • Lisans = RSA-2048 ile imzalanmış JSON. İmza gömülü PUBLIC_KEY ile doğrulanır;
//     özel anahtar yalnızca satıcıda (lisans/private.key) → sahte lisans üretilemez.
//   • Lisans DONANIMA BAĞLI: payload.hardwareId bu makinenin kimliğiyle eşleşmeli.
//     Başka bilgisayara kopyalanan lisans çalışmaz.
//   • Saklama: data/.vglic — AES-256-GCM ile donanımdan türetilen anahtarla şifreli
//     ve gizli (+h). Kopyalansa bile çözülemez.
//   • DENEME (trial): lisans yokken ilk çalıştırmadan itibaren TRIAL_DAYS gün ücretsiz.
//     Başlangıç hem gizli dosyada (data/ti) hem Windows registry'de tutulur ve
//     ikisinin EN ESKİsi kullanılır → birini (ya da AppData'yı) silmek denemeyi
//     SIFIRLAMAZ. Güncelleme/yeniden kurulum da sıfırlamaz.
//   • Saat geri-alma: "en son görülen zaman" sentinel'i (dosya + registry, max()).
//     Saati geri alarak süre uzatmak CLOCK_TAMPERED ile reddedilir.
//   • Hiçbir ağ bağlantısı gerekmez.
//
//  Lisans üretimi (satıcı tarafı): scripts/lisans-uret.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// RSA-2048 public key — derlemeye gömülü, değişmez.
// Karşılığı: lisans/private.key (yalnızca satıcıda; scripts/lisans-uret.js kullanır).
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1XanX8tnjvjdISRkcKEc
vvd+2R6OA2Tt5lr7A8OVz1/Z3TCpZGDxXJrlsNBBAk7zWgrOUsjJbTeZx4i4qp6S
bZjJLt3Qq+ewDn6jQaV1VnHJkpWy9jdImy0GbOS/Tia2m1UVxVQLbfVW9YrUgtKM
WAbxrBB9kZCiV4iZD4hRM+1LhnPI/Ohp0wHj2k6uAWD4rL/aVpPWOjyw8TisSV1Y
kAZCLnupQVtWocHvto7ab+O+hT9VYNsETEkSQ0eF9bY7oqocey+6o0zh73+c39i2
HbK2PtZqCr3fueBJs7vV/s1uMjbKAPqgSIbA6BJpQygaKIJhdQlWgcaaaddpzcS8
bQIDAQAB
-----END PUBLIC KEY-----`;

// Lisans yalnızca bu ürün için geçerli (başka bir Expert Bilişim ürününün
// lisansı burada çalışmasın diye payload.product denetlenir).
const PRODUCT = 'VEGA';

// Deneme süresi — ilk kurulumdan itibaren, lisans sorulmadan çalışır.
const TRIAL_DAYS = 15;

// Saat sapması toleransı (NTP düzeltmeleri vb.) — 5 dk.
const GRACE_SEC = 300;

// Dosya/registry'ye yazılan zaman damgasını okunmaz kılan karıştırma maskesi
// (şifreleme değil; gözle bakınca anlamsız görünsün diye).
const XOR_KEY = 0x7E19_C4A3 >>> 0;

const REG_KEY = 'HKCU\\Software\\ExpertBilisim\\VegaWA';
const REG_VAL_SENTINEL = 'AppSentinel';   // en son görülen zaman (saat geri-alma)
const REG_VAL_TRIAL = 'AppInit';          // deneme başlangıcı

const CACHE_TTL_MS = 60_000;

let baseDir = __dirname;
let _cache = null;
let _cacheAt = 0;

// ─── Kurulum ────────────────────────────────────────────────────────────────
// server.js açılışta çağırır: baseDir = Electron userData (güncellemede silinmez).
function configure(opts = {}) {
    baseDir = opts.baseDir || baseDir;
    ensureDataDir();
    invalidateCache();
}

function dataDir() { return path.join(baseDir, 'data'); }
function ensureDataDir() {
    const d = dataDir();
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    return d;
}

// Aktif lisansın saklandığı GİZLİ + ŞİFRELİ dosya.
function licenseStorePath() { return path.join(dataDir(), '.vglic'); }
// "En son görülen zaman" sentinel'i.
function sentinelPath() { return path.join(dataDir(), 'lc'); }
// Deneme başlangıcı.
function trialPath() { return path.join(dataDir(), 'ti'); }

// Windows'ta dosyaya gizli özniteliği ekle (best-effort).
function hideFile(filePath) {
    if (process.platform !== 'win32') return;
    try { execSync(`attrib +h "${filePath}"`, { stdio: 'ignore', timeout: 2000 }); }
    catch { /* best-effort */ }
}

// ─── Donanım kimliği ────────────────────────────────────────────────────────
// Anakart seri no + sistem UUID (Windows), yoksa kalıcı MAC adresleri.
// SHA-256 → 20 karakter, 4'erli 5 grup: XXXX-XXXX-XXXX-XXXX-XXXX. Aynı makinede sabit.

let _hwId = null;

function isJunkValue(v) {
    return !v || /^(none|to be filled|default|system serial number|0+|f+)$/i.test(String(v).trim());
}

function rawHardwareSources() {
    const parts = [];
    if (process.platform === 'win32') {
        const tryCmd = (cmd) => {
            try {
                return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 6000 });
            } catch { return ''; }
        };

        let board = '';
        let uuid = '';

        // wmic yeni Windows sürümlerinde kaldırıldı → önce PowerShell CIM.
        const ps = tryCmd(
            'powershell -NoProfile -NonInteractive -Command ' +
            '"(Get-CimInstance Win32_BaseBoard).SerialNumber; (Get-CimInstance Win32_ComputerSystemProduct).UUID"'
        ).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (ps.length >= 1) board = ps[0];
        if (ps.length >= 2) uuid = ps[1];

        if (isJunkValue(board)) {
            board = tryCmd('wmic baseboard get serialnumber')
                .split(/\r?\n/).map(s => s.trim()).filter(s => s && !/serialnumber/i.test(s))[0] || '';
        }
        if (isJunkValue(uuid)) {
            uuid = tryCmd('wmic csproduct get uuid')
                .split(/\r?\n/).map(s => s.trim()).filter(s => s && !/uuid/i.test(s))[0] || '';
        }

        if (!isJunkValue(board)) parts.push('BB:' + board.trim());
        if (!isJunkValue(uuid)) parts.push('UUID:' + uuid.trim());
    }
    // Yedek kaynak: kalıcı (sanal olmayan) MAC adresleri.
    if (parts.length === 0) {
        const ifaces = os.networkInterfaces();
        const macs = [];
        for (const name of Object.keys(ifaces)) {
            for (const net of ifaces[name] || []) {
                if (net.mac && net.mac !== '00:00:00:00:00:00' && !net.internal) macs.push(net.mac.toLowerCase());
            }
        }
        macs.sort();
        if (macs.length) parts.push('MAC:' + macs.join(','));
    }
    return parts.join('|');
}

function getHardwareId() {
    if (_hwId) return _hwId;
    let source = rawHardwareSources();
    if (!source) source = 'HOST:' + os.hostname();   // son çare (zayıf ama hiç yoktan iyi)
    const hash = crypto.createHash('sha256').update('VEGA-HWID-v1::' + source).digest('hex').toUpperCase();
    _hwId = hash.slice(0, 20).match(/.{1,4}/g).join('-');
    return _hwId;
}

// ─── Lisans dosyası şifreleme (AES-256-GCM, donanıma bağlı anahtar) ─────────

function encryptionKey() {
    return crypto.createHash('sha256').update('VEGA-LICENSE-AES-v1::' + getHardwareId()).digest();
}

function encryptLicense(obj) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, data]);   // [12 IV][16 TAG][n DATA]
}

function decryptLicense(buf) {
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

// Dönüş: { license } | null (dosya yok) | { decryptFailed:true } (yanlış makine/bozuk)
function readStoredLicense() {
    const p = licenseStorePath();
    if (!fs.existsSync(p)) return null;
    try { return { license: decryptLicense(fs.readFileSync(p)) }; }
    catch { return { decryptFailed: true }; }
}

function saveLicense(obj) {
    ensureDataDir();
    const p = licenseStorePath();
    // Gizli (+h) dosyanın üzerine writeFileSync EPERM verir → önce sil, yaz, tekrar gizle.
    try { fs.unlinkSync(p); } catch { /* yoksa yok say */ }
    fs.writeFileSync(p, encryptLicense(obj));
    hideFile(p);
}

function removeStoredLicense() {
    try { fs.unlinkSync(licenseStorePath()); } catch { /* yok say */ }
}

// ─── Karıştırılmış zaman damgası I/O (dosya) ────────────────────────────────

function readStampFile(file) {
    try {
        const buf = fs.readFileSync(file);
        if (buf.length < 4) return null;
        return (buf.readUInt32BE(0) ^ XOR_KEY) >>> 0;
    } catch { return null; }
}

function writeStampFile(file, sec) {
    try {
        ensureDataDir();
        const buf = Buffer.allocUnsafe(4);
        buf.writeUInt32BE((sec ^ XOR_KEY) >>> 0, 0);
        try { fs.unlinkSync(file); } catch { /* yok say */ }
        fs.writeFileSync(file, buf);
        hideFile(file);
    } catch { /* best-effort */ }
}

// ─── Karıştırılmış zaman damgası I/O (Windows registry) ─────────────────────

function readStampRegistry(valueName) {
    if (process.platform !== 'win32') return null;
    try {
        const out = execSync(`reg query "${REG_KEY}" /v "${valueName}"`, {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
        });
        const m = out.match(/0x([0-9a-fA-F]+)/i);
        if (!m) return null;
        return (parseInt(m[1], 16) ^ XOR_KEY) >>> 0;
    } catch { return null; }
}

function writeStampRegistry(valueName, sec) {
    if (process.platform !== 'win32') return;
    try {
        const scrambled = ((sec ^ XOR_KEY) >>> 0).toString();
        execSync(`reg add "${REG_KEY}" /v "${valueName}" /t REG_DWORD /d ${scrambled} /f`, {
            stdio: 'ignore', timeout: 3000,
        });
    } catch { /* best-effort */ }
}

// Damga makul aralık denetimi. Bozuk/sıfırlanmış bir damga (ör. ani kapanma
// sonrası dosyanın sıfır dolması) XOR maskesiyle çözülünce XOR_KEY'in kendisine
// (2115617955 ≈ 2037) dönüşür ve "gelecekten gelen son görülen zaman" gibi
// görünüp sahte CLOCK_TAMPERED üretirdi. Meşru bir damga bu aralığın dışına
// çıkamaz; çıkanlar yok sayılır ve self-heal ile düzeltilir.
const MIN_STAMP = 1_700_000_000;   // ~2023-11
const MAX_STAMP = 2_000_000_000;   // ~2033-05
const isSaneStamp = (v) => Number.isInteger(v) && v >= MIN_STAMP && v <= MAX_STAMP;

// ─── Saat geri-alma sentinel'i ──────────────────────────────────────────────
// Dosya + registry'nin EN BÜYÜĞÜ güvenilir "son görülen zaman"dır. Tek kaynağı
// düşürerek saati geri alma denemesi max() ile zaten etkisiz; o yüzden "ikisi
// farklı → müdahale" gibi sert bir red gerekmez (meşru çok-kopyalı kullanımda
// sahte alarm üretiyordu).
function trustedLastSeen() {
    const f = readStampFile(sentinelPath());
    const r = readStampRegistry(REG_VAL_SENTINEL);

    // Bozuk damga varsa (okundu ama aralık dışı) şimdiyle tazele — aksi halde
    // kullanıcı kalıcı olarak CLOCK_TAMPERED'a kilitlenir ve lisans giremez.
    const nowSec = Math.floor(Date.now() / 1000);
    if (f !== null && !isSaneStamp(f)) writeStampFile(sentinelPath(), nowSec);
    if (r !== null && !isSaneStamp(r)) writeStampRegistry(REG_VAL_SENTINEL, nowSec);

    const vals = [f, r].filter(isSaneStamp);
    return vals.length ? Math.max(...vals) : null;
}

function updateSentinels() {
    const sec = Math.floor(Date.now() / 1000);
    writeStampFile(sentinelPath(), sec);
    writeStampRegistry(REG_VAL_SENTINEL, sec);
}

// Geri alınmışsa insanca okunur bir süre döndürür ("3 gün", "40 dakika"), yoksa null.
function clockRolledBack(nowSec) {
    const last = trustedLastSeen();
    if (last === null || nowSec >= last - GRACE_SEC) return null;
    const sec = last - nowSec;
    if (sec >= 86400) return `${Math.floor(sec / 86400)} gün`;
    if (sec >= 3600) return `${Math.floor(sec / 3600)} saat`;
    return `${Math.floor(sec / 60)} dakika`;
}

// ─── Deneme (trial) ─────────────────────────────────────────────────────────
// İlk çalıştırmada başlangıcı yazar; sonraki açılışlarda dosya+registry'deki
// EN ESKİ değeri kullanır → tek kaynağı (ya da AppData'yı) silmek sıfırlamaz.
// nowSec dışarıdan gelir: registry okuması saniyeler sürebiliyor, burada yeniden
// Date.now() okunursa başlangıç çağıranın nowSec'inden ileri kayar ve ilk gün
// "16 gün kaldı" gibi yanlış bir sayı çıkar.
function ensureTrialStart(nowSec) {
    const f = readStampFile(trialPath());
    const r = readStampRegistry(REG_VAL_TRIAL);
    const known = [f, r].filter(isSaneStamp);
    const start = known.length ? Math.min(...known) : nowSec;
    if (f !== start) writeStampFile(trialPath(), start);
    if (r !== start) writeStampRegistry(REG_VAL_TRIAL, start);
    return start;
}

function evaluateTrial(nowSec, hwId) {
    const start = ensureTrialStart(nowSec);
    const expiresAt = start + TRIAL_DAYS * 86400;

    const rolledBack = clockRolledBack(nowSec);
    if (rolledBack) {
        return {
            valid: false, reason: 'CLOCK_TAMPERED', trial: true, hardwareId: hwId,
            detail: `Sistem saati ${rolledBack} geri alınmış. Saati düzeltip uygulamayı yeniden başlatın.`,
        };
    }

    if (nowSec > expiresAt) {
        return {
            valid: false, reason: 'TRIAL_EXPIRED', trial: true, hardwareId: hwId,
            trialDays: TRIAL_DAYS, issuedAt: start, expiresAt,
            daysExpired: Math.floor((nowSec - expiresAt) / 86400),
            detail: `${TRIAL_DAYS} günlük deneme süresi doldu. Devam etmek için lisans gerekli.`,
        };
    }

    updateSentinels();
    return {
        valid: true, trial: true, hardwareId: hwId,
        customerName: 'Deneme Sürümü',
        trialDays: TRIAL_DAYS,
        issuedAt: start, expiresAt,
        daysLeft: Math.ceil((expiresAt - nowSec) / 86400),
    };
}

// ─── İmza doğrulama ─────────────────────────────────────────────────────────

function verifySignature(payload, signature) {
    try {
        const v = crypto.createVerify('RSA-SHA256');
        v.update(JSON.stringify(payload));
        return v.verify(PUBLIC_KEY, Buffer.from(String(signature), 'base64'));
    } catch { return false; }
}

// ─── Çekirdek doğrulama ─────────────────────────────────────────────────────

function validateLicense() {
    const nowSec = Math.floor(Date.now() / 1000);
    const hwId = getHardwareId();

    const stored = readStoredLicense();

    // 1. Hiç lisans yok → deneme sürümünü değerlendir.
    if (stored === null) return evaluateTrial(nowSec, hwId);

    // 2. Dosya var ama çözülemedi → başka bilgisayardan kopyalanmış ya da bozuk.
    if (stored.decryptFailed) {
        return {
            valid: false, reason: 'LICENSE_HARDWARE_MISMATCH', hardwareId: hwId,
            detail: 'Lisans dosyası bu bilgisayara ait değil. Bu makineye özel yeni bir lisans gerekli.',
        };
    }

    const { payload, signature } = stored.license || {};
    if (!payload || !signature || typeof payload !== 'object') {
        return { valid: false, reason: 'LICENSE_CORRUPT', hardwareId: hwId, detail: 'Lisans dosyası bozuk.' };
    }

    // 3. İmza geçerli olmalı (sahtecilik tespiti).
    if (!verifySignature(payload, signature)) {
        return {
            valid: false, reason: 'LICENSE_INVALID', hardwareId: hwId,
            detail: 'Lisans imzası geçersiz. Bu lisans bu yazılım için üretilmemiş.',
        };
    }

    // 4. Ürün eşleşmesi — başka ürünün lisansı burada çalışmaz.
    if (String(payload.product || '').toUpperCase() !== PRODUCT) {
        return {
            valid: false, reason: 'LICENSE_WRONG_PRODUCT', hardwareId: hwId,
            detail: 'Bu lisans başka bir ürün için üretilmiş.',
        };
    }

    // 5. Donanım bağlama (ZORUNLU).
    if (payload.hardwareId !== hwId) {
        return {
            valid: false, reason: 'LICENSE_HARDWARE_MISMATCH', hardwareId: hwId,
            customerName: payload.customerName || null,
            detail: 'Bu lisans başka bir bilgisayara tanımlanmış. Bu makineye özel yeni bir lisans gerekli.',
        };
    }

    // 6. Saat geri-alma.
    const rolledBack = clockRolledBack(nowSec);
    if (rolledBack) {
        return {
            valid: false, reason: 'CLOCK_TAMPERED', hardwareId: hwId,
            detail: `Sistem saati ${rolledBack} geri alınmış. Saati düzeltip uygulamayı yeniden başlatın.`,
        };
    }

    // 7. Lisans veriliş tarihinden önce geçerli olamaz.
    if (nowSec < payload.issuedAt - GRACE_SEC) {
        return { valid: false, reason: 'LICENSE_NOT_YET_VALID', hardwareId: hwId, detail: 'Lisans henüz geçerli değil.' };
    }

    // 8. Süre dolumu. (expiresAt yoksa/0 ise SÜRESİZ.)
    const perpetual = !payload.expiresAt;
    if (!perpetual && nowSec > payload.expiresAt) {
        return {
            valid: false, reason: 'LICENSE_EXPIRED', hardwareId: hwId,
            customerName: payload.customerName || null,
            expiresAt: payload.expiresAt,
            daysExpired: Math.floor((nowSec - payload.expiresAt) / 86400),
            detail: 'Lisans süresi dolmuş. Yenilemek için tedarikçinizle görüşün.',
        };
    }

    // ✓ Geçerli — sentinel'leri ilerlet (gelecekteki geri-almayı yakala).
    updateSentinels();

    return {
        valid: true,
        trial: false,
        licenseId: payload.id || null,
        customerName: payload.customerName || null,
        customerEmail: payload.customerEmail || null,
        hardwareId: hwId,
        issuedAt: payload.issuedAt,
        expiresAt: perpetual ? null : payload.expiresAt,
        daysLeft: perpetual ? null : Math.ceil((payload.expiresAt - nowSec) / 86400),
    };
}

// ─── Önbellekli erişim (dakikada en fazla bir kez yeniden doğrular) ─────────
// Doğrulama PowerShell/reg çağırdığı için pahalı; her API isteğinde çalışmamalı.

function getCachedStatus() {
    const now = Date.now();
    if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;
    _cache = validateLicense();
    _cacheAt = now;
    return _cache;
}

function invalidateCache() { _cache = null; _cacheAt = 0; }

function isAllowed() { return getCachedStatus().valid === true; }

// UI'ya verilen durum (her zaman erişilebilir; lisans kapısı bunu engellemez).
function getStatus() {
    const s = getCachedStatus();
    return {
        valid: !!s.valid,
        trial: !!s.trial,
        trialDays: TRIAL_DAYS,
        reason: s.reason || null,
        detail: s.detail || null,
        hardwareId: s.hardwareId || getHardwareId(),
        customerName: s.customerName || null,
        customerEmail: s.customerEmail || null,
        issuedAt: s.issuedAt || null,
        expiresAt: s.expiresAt || null,
        daysLeft: s.daysLeft ?? null,
        daysExpired: s.daysExpired ?? null,
    };
}

// Lisans dosyası içeriğini (JSON metin) doğrula + kaydet.
// Dönüş: { ok:true, license } | { ok:false, error, reason }
function activate(content) {
    if (!content || typeof content !== 'string') {
        return { ok: false, error: 'Lisans dosyası içeriği gerekli.', reason: 'EMPTY' };
    }

    let parsed;
    try { parsed = JSON.parse(content.trim()); }
    catch { return { ok: false, error: 'Geçersiz lisans formatı (JSON bekleniyor).', reason: 'LICENSE_CORRUPT' }; }

    if (!parsed || !parsed.payload || !parsed.signature) {
        return { ok: false, error: 'Eksik lisans alanları (payload / signature).', reason: 'LICENSE_CORRUPT' };
    }

    const hwId = getHardwareId();

    // Yazmadan önce ön denetimler — kullanıcıya net hata mesajı ver.
    if (!verifySignature(parsed.payload, parsed.signature)) {
        return { ok: false, error: 'Lisans imzası geçersiz. Bu lisans bu yazılım için üretilmemiş.', reason: 'LICENSE_INVALID' };
    }
    if (String(parsed.payload.product || '').toUpperCase() !== PRODUCT) {
        return { ok: false, error: 'Bu lisans başka bir ürün için üretilmiş.', reason: 'LICENSE_WRONG_PRODUCT' };
    }
    if (parsed.payload.hardwareId !== hwId) {
        return {
            ok: false, reason: 'LICENSE_HARDWARE_MISMATCH',
            error: 'Bu lisans bu bilgisayar için üretilmemiş. Aşağıdaki Donanım Kimliği ile lisansınızı yeniden talep edin.',
        };
    }

    // Önceki (varsa) lisansı geri yükleyebilmek için sakla.
    const prev = readStoredLicense();

    try { saveLicense(parsed); }
    catch (e) { return { ok: false, error: `Lisans kaydedilemedi: ${e.message}`, reason: 'WRITE_FAILED' }; }

    invalidateCache();
    const result = validateLicense();
    _cache = result; _cacheAt = Date.now();

    if (!result.valid) {
        // Geçersiz lisansı bırakma — eski duruma dön.
        if (prev && prev.license) { try { saveLicense(prev.license); } catch { /* yok say */ } }
        else removeStoredLicense();
        invalidateCache();
        return { ok: false, error: result.detail || 'Lisans doğrulanamadı.', reason: result.reason };
    }

    return { ok: true, license: getStatus() };
}

// Lisansı diskten kaldır (destek/hata ayıklama). Deneme süresi geri gelmez —
// deneme başlangıcı ayrı saklanır ve dolmuşsa dolu kalır.
function deactivate() {
    removeStoredLicense();
    invalidateCache();
    return getStatus();
}

module.exports = {
    configure,
    validateLicense,
    getCachedStatus,
    invalidateCache,
    isAllowed,
    getStatus,
    getHardwareId,
    activate,
    deactivate,
    verifySignature,
    TRIAL_DAYS,
    PRODUCT,
};
