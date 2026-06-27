// ═══════════════════════════════════════════════════════════════════════════
//  Otomatik Belge-Tipi Mesajları (event-watcher, çok kurallı)
//  VegaDB cari hareket tablosunu periyodik tarar; yeni satırı (BORC = fatura/
//  borçlandırma, ALACAK = tahsilat/ödeme) TANIMLI KURALLARLA eşleştirip ilgili
//  cariye otomatik WhatsApp atar. Her kural = bir belge tipi: kendi IZAHAT
//  kodları, yönü, şablonu, opsiyonel görseli. Default: hiçbir kural etkin değil.
//
//  Tablo: F{firmaNo}D{donemNo}TBLCARIHAREKETLERI
//    • IND        artan PK  → "yeni satır" watermark'ı
//    • FIRMANO    = TBLCARI.IND (cari bağlantısı)
//    • BORC       borçlandırma (satış/alış faturası, borç fişi)
//    • ALACAK     tahsilat/ödeme (müşteri ödedi, borcu düştü)
//    • IZAHAT     belge tipi kodu (nvarchar) — kural eşleşmesi buradan
//    • TARIH/EVRAKNO/BAKIYE/PARABIRIMI bilgilendirme alanları
//
//  Fatura-dışlama: ALACAK satırı her zaman tahsilat değildir (peşin fatura oto-
//  ödemesi / alış-satış fatura başlığı kaydı). Her satır için isFatura bayrağı
//  hesaplanır; kuralın excludeFatura'sı açıksa fatura kaynaklı satır atlanır
//  (tahsilat kuralları için varsayılan açık; fatura kuralları için kapalı).
//
//  Bağımlılıklar dışarıdan enjekte edilir (server.js ile gevşek bağlı):
//    configure({ getPool, sql, resolveCariContacts, waSend, checkOnWhatsApp, waStatus, baseDir })
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const antiban = require('./antiban');

let deps = null;
let CONFIG_PATH = null;
let STATE_PATH = null;
let PENDING_PATH = null;
let LOG_PATH = null;
let MEDIA_DIR = null;

let timer = null;
let polling = false;
let running = false;
let lastPollAt = null;
let lastError = null;
let lastResult = null;

// Devir (yıl başı açılış) kodları — bunlar belge değil, daima hariç tutulur.
const DEVIR_CODES = [103, 104];

// ─── Belge tipi sınıflandırması (VegaDB ile ampirik doğrulandı 2026-06) ─────────
// Her cari hareket satırı bir belge tipine sınıflanır. Sınıflama hibrit:
//   1) EVRAKNO'nun ilgili belge başlık tablosunda olması (AUTORİTE),
//   2) standart Vega IZAHAT işlem kodu (yedek; tablo üyeliği yoksa).
// Sıra = öncelik (ilk eşleşen kazanır). Ödeme (cari giriş/çıkış) faturadan önce
// gelir: peşin satışta tahsilat satırı "ödeme alındı" sınıfını korur.
//   Standart kodlar (F0101 EXPERT BİLİŞİM ile doğrulandı):
//     13=Cari Giriş/Tahsilat  11=Cari Çıkış/Tediye  21=Satış Faturası
//     20=Alış Faturası  33=Stok Çıkış Fişi  32=Stok Giriş Fişi
// dir: ödeme tipleri yalnız doğru işaretli satırda sınıflanır (peşin stok çıkışı
// gibi paylaşılan EVRAKNO'lu BORC satırı tahsilat sayılmasın).
const DOC_PRIORITY = [
    { docType: 'cariGiris',      suffixes: ['TBLCARGIRBASLIK'], codes: [13], dir: 'alacak' },
    { docType: 'cariCikis',      suffixes: ['TBLCARCIKBASLIK'], codes: [11], dir: 'borc' },
    { docType: 'satisFaturasi',  suffixes: ['TBLSATFATBASLIK', 'TBLSATVADFATBASLIK', 'TBLPSATFATBASLIK'], codes: [21] },
    { docType: 'alisFaturasi',   suffixes: ['TBLALFATBASLIK', 'TBLALVADFATBASLIK'], codes: [20] },
    { docType: 'satisIrsaliyesi', suffixes: ['TBLSATIRSBASLIK'], codes: [] },
    { docType: 'alisIrsaliyesi', suffixes: ['TBLALIRSBASLIK'], codes: [] },
    { docType: 'stokCikis',      suffixes: ['TBLSTKCIKBASLIK'], codes: [33] },
    { docType: 'stokGiris',      suffixes: ['TBLSTKGIRBASLIK'], codes: [32] },
];
// Tek kod → docType (eski kod-bazlı kuralları docType'a göç için).
const CODE_TO_DOCTYPE = { 13: 'cariGiris', 11: 'cariCikis', 21: 'satisFaturasi', 20: 'alisFaturasi', 33: 'stokCikis', 32: 'stokGiris' };

// ─── Hazır belge-tipi şablonları (kullanıcı bunlar üzerinden düzenler) ──────────
// Tümü default PASİF. docType belirli olunca yön/kod/fatura-dışlama OTOMATİK
// (yanlış yapılandırılamaz; örn. stok çıkışı asla "ödeme alındı" sınıfına düşmez).
const PRESET_RULES = [
    {
        id: 'satisFaturasi', docType: 'satisFaturasi', name: 'Satış Faturası',
        direction: 'borc', izahatCodes: [21], excludeFatura: false, enabled: false,
        template: 'Sayın {firma}, {tarih} tarihli {tutar} TL tutarındaki satış faturanız düzenlenmiştir. Güncel bakiyeniz: {bakiye} TL ({durum}). Bizi tercih ettiğiniz için teşekkür ederiz.',
    },
    {
        id: 'satisIrsaliyesi', docType: 'satisIrsaliyesi', name: 'Satış İrsaliyesi',
        direction: 'any', izahatCodes: [], excludeFatura: false, enabled: false,
        template: 'Sayın {firma}, {tarih} tarihli {tutar} TL tutarındaki satış irsaliyeniz (sevk belgeniz) düzenlenmiştir. Bilginize sunarız.',
    },
    {
        id: 'stokCikis', docType: 'stokCikis', name: 'Stok Çıkış Fişi',
        direction: 'any', izahatCodes: [33], excludeFatura: false, enabled: false,
        template: 'Sayın {firma}, {tarih} tarihli {tutar} TL tutarındaki mal/ürün çıkışınız (sevkiyat) gerçekleştirilmiştir. Bilginize sunarız.',
    },
    {
        id: 'cariGiris', docType: 'cariGiris', name: 'Cari Giriş (Tahsilat)',
        direction: 'alacak', izahatCodes: [13], excludeFatura: true, enabled: false,
        template: 'Sayın {firma}, {tarih} tarihinde hesabınıza {tutar} TL tutarında ödemeniz alınmıştır. Güncel bakiyeniz: {bakiye} TL ({durum}). Teşekkür ederiz.',
    },
    {
        id: 'cariCikis', docType: 'cariCikis', name: 'Cari Çıkış (Tediye)',
        direction: 'borc', izahatCodes: [11], excludeFatura: false, enabled: false,
        template: 'Sayın {firma}, {tarih} tarihinde tarafınıza {tutar} TL tutarında ödeme gerçekleştirilmiştir. Güncel bakiyeniz: {bakiye} TL ({durum}). Bilginize sunarız.',
    },
];
const PRESET_BY_TYPE = Object.fromEntries(PRESET_RULES.map(p => [p.docType, p]));
const VALID_DOCTYPES = new Set([...PRESET_RULES.map(p => p.docType), 'satisIrsaliyesi', 'alisIrsaliyesi', 'stokGiris', 'alisFaturasi', 'custom']);

const DEFAULT_CONFIG = {
    enabled: false,
    firmaNo: null,
    donemNo: null,
    intervalSec: 30,
    verifyOnWhatsApp: true,
    simulateTyping: true,
    // Cari kartındaki tüm geçerli numaralara gönder; kapalıysa sadece birincil.
    sendAllPhones: false,
    // Sadece SMS Gönder izni (SMSGONDER=1) olanlara gönder.
    onlySmsGonder: false,
    // Cari tipi hedefleme (FIRMATIPI): hepsi | alici | satici | diger.
    cariType: 'hepsi',
    // Belge tipi kuralları. loadConfig ilk açılışta PRESET_RULES ile doldurur.
    //   { id, docType, name, enabled, izahatCodes:[], direction:'alacak'|'borc'|'any',
    //     minAmount, excludeFatura, template, media:{path,mime,kind,name}|null }
    rules: [],
};

let config = { ...DEFAULT_CONFIG };
let state = { lastSeenInd: {} };
let log = [];
let pending = [];

const MAX_VERIFY_ATTEMPTS = 3;
const MAX_SEND_ATTEMPTS = 8;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));

// Cari tipi filtresi (config.cariType): resolveCariContacts c.tip ('alici'|'satici'|
// 'her_ikisi'|'diger') döner. 'her_ikisi' hem alıcı hem satıcı filtresine uyar.
function cariTipMatches(filter, tip) {
    if (!filter || filter === 'hepsi') return true;
    if (filter === 'alici')  return tip === 'alici'  || tip === 'her_ikisi';
    if (filter === 'satici') return tip === 'satici' || tip === 'her_ikisi';
    if (filter === 'diger')  return tip === 'diger';
    return true;
}

// ─── Kural normalizasyonu ──────────────────────────────────────────────────────
let ruleSeq = 1;

function parseCodes(codes) {
    if (typeof codes === 'string') codes = codes.split(/[,\s]+/);
    return (Array.isArray(codes) ? codes : []).map(c => parseInt(c, 10)).filter(Number.isFinite);
}

// Kuralın belge tipini çöz: açık docType > id > kod eşlemesi > ad ipucu > 'custom'.
// Eski (docType'sız) kuralları yeni belge-tipi modeline göç ettirir; özellikle
// boş-kod alacak "Tahsilat" kuralı → 'cariGiris' (stok çıkış bug'ını kapatır).
function inferDocType(r) {
    if (r.docType && VALID_DOCTYPES.has(r.docType)) return r.docType;
    if (PRESET_BY_TYPE[r.id]) return r.id;
    const codes = parseCodes(r.izahatCodes);
    if (codes.length) {
        const set = new Set(codes.map(c => CODE_TO_DOCTYPE[c]).filter(Boolean));
        if (set.size === 1 && codes.every(c => CODE_TO_DOCTYPE[c])) return [...set][0];
    }
    const name = (r.name || '').toLocaleLowerCase('tr-TR');
    if (/tahsilat|ödeme alın|odeme alin|cari giriş|cari giris/.test(name)) return 'cariGiris';
    if (/tediye|cari çıkış|cari cikis/.test(name)) return 'cariCikis';
    if (/satış fat|satis fat/.test(name)) return 'satisFaturasi';
    if (/alış fat|alis fat/.test(name)) return 'alisFaturasi';
    if (/satış irs|satis irs/.test(name)) return 'satisIrsaliyesi';
    if (/stok çıkış|stok cikis/.test(name)) return 'stokCikis';
    if (/stok giriş|stok giris/.test(name)) return 'stokGiris';
    return 'custom';
}

function normalizeRule(r, prev) {
    const docType = inferDocType(r);
    const preset = PRESET_BY_TYPE[docType];
    // Hazır tip seçiliyse yön/kod/fatura-dışlama OTOMATİK (preset'ten); kullanıcı
    // yalnız ad/şablon/etkin/min tutar/medya değiştirir → yanlış yapılandırma olmaz.
    let direction, codes, excludeFatura;
    if (preset) {
        direction = preset.direction;
        codes = preset.izahatCodes.slice();
        excludeFatura = preset.excludeFatura;
    } else {
        direction = ['alacak', 'borc', 'any'].includes(r.direction) ? r.direction : 'alacak';
        codes = parseCodes(r.izahatCodes);
        excludeFatura = (r.excludeFatura !== undefined) ? !!r.excludeFatura : (direction === 'alacak');
    }
    // media: gönderilmediyse aynı id'li eski kuraldan koru (UI media'yı ayrı yükler).
    const media = (r.media !== undefined) ? r.media : (prev ? prev.media : null);
    // template: tanımsızsa (tohumlama) preset'ten; boş string ise kullanıcı sildi → boş.
    const template = (r.template !== undefined && r.template !== null)
        ? String(r.template) : (preset ? preset.template : '');
    return {
        id: r.id || (preset ? preset.id : `rule-${Date.now()}-${ruleSeq++}`),
        docType,
        name: (r.name || '').toString().trim() || (preset ? preset.name : 'Mesaj türü'),
        enabled: r.enabled === true,
        izahatCodes: codes,
        direction,
        minAmount: Math.max(0, Number(r.minAmount) || 0),
        excludeFatura,
        template,
        media: media || null,
    };
}

// Eksik hazır tipleri (disabled) ekle — yeni kurulum tüm preset'leri alır; mevcut
// kullanıcılar güncellemede yeni belge tiplerini kazanır. docType'a göre tekilleştirir.
function ensurePresets(rules) {
    const present = new Set(rules.map(r => r.docType).filter(Boolean));
    const out = [...rules];
    for (const p of PRESET_RULES) {
        if (!present.has(p.docType)) out.push(normalizeRule(p));
    }
    return out;
}

// ─── Kalıcılık ───────────────────────────────────────────────────────────────
function configure(d) {
    deps = d;
    const dataDir = path.join(d.baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    CONFIG_PATH = path.join(dataDir, 'watcher.json');
    STATE_PATH = path.join(dataDir, 'watcher-state.json');
    PENDING_PATH = path.join(dataDir, 'watcher-pending.json');
    LOG_PATH = path.join(dataDir, 'watcher-log.json');
    MEDIA_DIR = dataDir;
    loadConfig();
    loadState();
    loadPending();
    loadLog();
}

// ─── Görsel/video (kural başına) ───────────────────────────────────────────────
function clearMediaFileByDesc(desc) {
    if (desc && desc.path && MEDIA_DIR) {
        try {
            const f = path.join(MEDIA_DIR, desc.path);
            if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch (e) { console.error('[Watcher] medya silinemedi:', e.message); }
    }
}

// file = multer dosyası { buffer, mimetype, originalname }
function setRuleMedia(ruleId, file) {
    const rule = (config.rules || []).find(r => r.id === ruleId);
    if (!rule || !file || !file.buffer) return getStatus();
    const mt = file.mimetype || '';
    const kind = mt.startsWith('image/') ? 'image' : mt.startsWith('video/') ? 'video' : 'document';
    const ext = path.extname(file.originalname || '') || (kind === 'image' ? '.jpg' : kind === 'video' ? '.mp4' : '');
    clearMediaFileByDesc(rule.media);
    const fname = `watcher-media-${ruleId}${ext}`;
    try { fs.writeFileSync(path.join(MEDIA_DIR, fname), file.buffer); }
    catch (e) { console.error('[Watcher] medya yazılamadı:', e.message); return getStatus(); }
    rule.media = { path: fname, mime: mt, kind, name: file.originalname || fname };
    saveConfig();
    return getStatus();
}

function clearRuleMedia(ruleId) {
    const rule = (config.rules || []).find(r => r.id === ruleId);
    if (rule) { clearMediaFileByDesc(rule.media); rule.media = null; saveConfig(); }
    return getStatus();
}

function loadMediaFromDescriptor(desc) {
    if (!desc || !desc.path || !MEDIA_DIR) return null;
    try {
        const f = path.join(MEDIA_DIR, desc.path);
        if (!fs.existsSync(f)) return null;
        return { kind: desc.kind, buffer: fs.readFileSync(f), mimetype: desc.mime, fileName: desc.name };
    } catch (e) { console.error('[Watcher] medya okunamadı:', e.message); return null; }
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            config = { ...DEFAULT_CONFIG, ...raw };
            // Göç: eski tek-şablon config → "Cari Giriş (Tahsilat)" kuralı.
            if (!Array.isArray(config.rules) && (raw.template != null || raw.izahatCodes != null)) {
                config.rules = [{
                    id: 'cariGiris', docType: 'cariGiris', name: 'Cari Giriş (Tahsilat)',
                    enabled: !!raw.enabled, template: raw.template || '',
                    minAmount: raw.minAmount || 0, media: raw.media || null,
                }];
            }
            if (!Array.isArray(config.rules)) config.rules = [];
            config.rules = config.rules.map(r => normalizeRule(r));
            // eski tek-şablon alanlarını bırak
            delete config.template; delete config.izahatCodes; delete config.minAmount; delete config.media;
        }
    } catch (e) { console.error('[Watcher] config okunamadı:', e.message); }
    // Eksik hazır belge tiplerini her zaman ekle (yeni kurulum = tümü; mevcut = yeni olanlar).
    config.rules = ensurePresets(Array.isArray(config.rules) ? config.rules : []);
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8'); }
    catch (e) { console.error('[Watcher] config yazılamadı:', e.message); }
}

function loadState() {
    try { if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
    catch (e) { console.error('[Watcher] state okunamadı:', e.message); }
    if (!state.lastSeenInd) state.lastSeenInd = {};
}
function saveState() {
    try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8'); }
    catch (e) { console.error('[Watcher] state yazılamadı:', e.message); }
}

function loadPending() {
    try { if (fs.existsSync(PENDING_PATH)) { const p = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8')); if (Array.isArray(p)) pending = p; } }
    catch (e) { console.error('[Watcher] kuyruk okunamadı:', e.message); }
}
function savePending() {
    try { fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2), 'utf8'); }
    catch (e) { console.error('[Watcher] kuyruk yazılamadı:', e.message); }
}

function loadLog() {
    try { if (fs.existsSync(LOG_PATH)) { const l = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); if (Array.isArray(l)) log = l; } }
    catch (e) { console.error('[Watcher] günlük okunamadı:', e.message); }
}
function pushLog(entry) {
    log.unshift({ ...entry, at: new Date().toISOString() });
    if (log.length > 200) log.length = 200;
    try { fs.writeFileSync(LOG_PATH, JSON.stringify(log), 'utf8'); } catch { /* bellekte devam */ }
}

// Kuyruğa ekle (ind+phone tekilliği). mediaDesc kuralın görselidir (kalıcı yeniden okuma için).
function enqueue(base, phone, text, reason, mediaDesc) {
    if (pending.some(p => p.ind === base.ind && p.phone === phone)) return;
    pending.push({
        ind: base.ind, cariInd: base.cariInd, name: base.name, firma: base.firma, kod: base.kod,
        tutar: base.tutar, evrak: base.evrak, bakiye: base.bakiye, bakiyeDurum: base.bakiyeDurum,
        ruleName: base.ruleName, phone, text, media: mediaDesc || null,
        attempts: 0, noWaCount: 0, queuedAt: new Date().toISOString(), lastError: reason,
    });
    savePending();
    pushLog({ ...base, phone, status: 'queued', error: reason, message: text });
}

const pendingBase = (p) => ({
    ind: p.ind, cariInd: p.cariInd, name: p.name, firma: p.firma, kod: p.kod, phone: p.phone,
    tutar: p.tutar, evrak: p.evrak, bakiye: p.bakiye, bakiyeDurum: p.bakiyeDurum, ruleName: p.ruleName,
});

async function processPending() {
    if (!pending.length || !deps.waStatus().ready) return 0;
    let sentCount = 0;

    // Kuyruktaki carileri DB'de YENİDEN doğrula: kuyruk phone+text snapshot tutar ve
    // körlemesine retry eder; cari sonradan PASİF olduysa (STATUS=2) ya da DB'den
    // SİLİNDİYSE kuyruktan düşür, tekrar gönderme. Yalnız DB bağlıyken doğrula
    // (bağlı değilken boş Map'i "hepsi silinmiş" sanıp kuyruğu yanlışlıkla boşaltma).
    const pool = deps.getPool();
    let contacts = null;
    if (pool && pool.connected) {
        const inds = [...new Set(pending.map(p => p.cariInd).filter(v => v != null))];
        if (inds.length) {
            try { contacts = await deps.resolveCariContacts(config.firmaNo, inds); }
            catch { contacts = null; }
        }
    }

    for (const item of [...pending]) {
        if (!deps.waStatus().ready) break;
        // Anti-ban tavanı doldu → kuyrukta kalsın, sonraki turda (saat/gün dönünce) dene.
        if (!antiban.gate(deps.waStatus().me, null).ok) break;
        // Pasif/silinmiş cariyi kuyruktan at (doğrulama yapılabildiyse).
        if (contacts && item.cariInd != null) {
            const c = contacts.get(item.cariInd);
            if (!c) {
                pending = pending.filter(p => p !== item); savePending();
                pushLog({ ...pendingBase(item), status: 'dropped', error: 'Cari veritabanında yok (silinmiş) — kuyruktan çıkarıldı' });
                continue;
            }
            if (c.pasif) {
                pending = pending.filter(p => p !== item); savePending();
                pushLog({ ...pendingBase(item), status: 'dropped', error: 'Cari pasif (STATUS=2) — kuyruktan çıkarıldı' });
                continue;
            }
        }
        const media = loadMediaFromDescriptor(item.media);
        if (config.verifyOnWhatsApp) {
            const chk = await deps.checkOnWhatsApp(item.phone);
            if (!chk.exists) {
                if (chk.transient) { item.lastError = chk.error || 'Doğrulama yapılamadı'; savePending(); continue; }
                item.noWaCount = (item.noWaCount || 0) + 1;
                if (item.noWaCount >= MAX_VERIFY_ATTEMPTS) {
                    pending = pending.filter(p => p !== item); savePending();
                    pushLog({ ...pendingBase(item), status: 'notOnWhatsApp', error: `WhatsApp kullanıcısı değil (${MAX_VERIFY_ATTEMPTS} doğrulama sonrası)` });
                } else { item.lastError = 'WhatsApp kullanıcısı değil (tekrar doğrulanacak)'; savePending(); }
                continue;
            }
        }
        const res = await deps.waSend(item.phone, item.text, media, { simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400) });
        if (res.success) {
            antiban.recordSent(deps.waStatus().me);
            pending = pending.filter(p => p !== item); savePending(); sentCount++;
            pushLog({ ...pendingBase(item), status: 'sent', message: item.text });
        } else {
            item.attempts = (item.attempts || 0) + 1; item.lastError = res.error;
            if (item.attempts >= MAX_SEND_ATTEMPTS) {
                pending = pending.filter(p => p !== item);
                pushLog({ ...pendingBase(item), status: 'failed', error: `${res.error} (${MAX_SEND_ATTEMPTS} deneme sonrası vazgeçildi)`, message: item.text });
            }
            savePending();
        }
        await sleep(rand(8000, 20000));
    }
    return sentCount;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
const tableName = () =>
    config.firmaNo && config.donemNo ? `F${config.firmaNo}D${config.donemNo}TBLCARIHAREKETLERI` : null;

function fmtAmount(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderTemplate(tpl, vars) {
    return antiban.applySpintax(tpl)
        .replace(/\{ad\}/gi, vars.ad || '')
        .replace(/\{unvan\}/gi, vars.ad || '')
        .replace(/\{firma\}/gi, vars.firma || vars.ad || '')
        .replace(/\{tutar\}/gi, vars.tutar || '')
        .replace(/\{kod\}/gi, vars.kod || '')
        .replace(/\{evrak\}/gi, vars.evrak || '')
        .replace(/\{belge\}/gi, vars.belge || '')
        .replace(/\{tarih\}/gi, vars.tarih || '')
        .replace(/\{bakiye\}/gi, vars.bakiye || '')
        .replace(/\{borc\}/gi, vars.bakiye || '')
        .replace(/\{durum\}/gi, vars.durum || '')
        .replace(/ ?\(\s*\)/g, '');
}

async function tableExists(pool, name) {
    const r = pool.request();
    r.input('tbl', deps.sql.NVarChar, name);
    const res = await r.query(`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME=@tbl`);
    return res.recordset[0].c > 0;
}

const SCHEMA_CACHE_MS = 24 * 60 * 60 * 1000;
let tblExistsCache = {};
async function cachedTableExists(pool, name) {
    const hit = tblExistsCache[name];
    if (hit && Date.now() - hit.at < SCHEMA_CACHE_MS) return hit.v;
    const v = await tableExists(pool, name);
    tblExistsCache[name] = { v, at: Date.now() };
    return v;
}

// Belge başlık tablosu BELGENO+FIRMANO sütunlarıyla cari harekete bağlanabilir mi?
let docColsCache = {};
async function cachedHasDocCols(pool, name) {
    const hit = docColsCache[name];
    if (hit && Date.now() - hit.at < SCHEMA_CACHE_MS) return hit.v;
    let v = false;
    try {
        const r = pool.request();
        r.input('tbl', deps.sql.NVarChar, name);
        const res = await r.query(`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME=@tbl AND COLUMN_NAME IN ('BELGENO','FIRMANO')`);
        v = res.recordset[0].c >= 2;
    } catch { v = false; }
    docColsCache[name] = { v, at: Date.now() };
    return v;
}

// Cari hareket satırını belge tipine sınıflayan SQL CASE'i kur (DOC_PRIORITY sırası).
// Tablo üyeliği (varsa, BELGENO+FIRMANO ile) + standart IZAHAT kodu yedeği.
async function buildDocTypeCase(pool) {
    const whens = [];
    for (const { docType, suffixes, codes, dir } of DOC_PRIORITY) {
        const conds = [];
        for (const suf of suffixes || []) {
            const ft = `F${config.firmaNo}D${config.donemNo}${suf}`;
            if (await cachedTableExists(pool, ft) && await cachedHasDocCols(pool, ft)) {
                conds.push(`EXISTS(SELECT 1 FROM [${ft}] dt WHERE dt.BELGENO=h.EVRAKNO AND dt.FIRMANO=h.FIRMANO)`);
            }
        }
        if (codes && codes.length) conds.push(`TRY_CAST(h.IZAHAT AS INT) IN (${codes.join(',')})`);
        if (!conds.length) continue;
        let when = `(${conds.join(' OR ')})`;
        if (dir === 'alacak') when = `h.ALACAK > 0 AND ${when}`;
        else if (dir === 'borc') when = `h.BORC > 0 AND ${when}`;
        whens.push(`WHEN ${when} THEN '${docType}'`);
    }
    return whens.length ? `CASE ${whens.join(' ')} ELSE 'diger' END` : `'diger'`;
}

// Carilerin gerçek kalan borcu: hareket tablosundan SUM(BORC)-SUM(ALACAK).
async function fetchKalanBorc(pool, tbl, indList) {
    const map = new Map();
    const ids = indList.map(n => parseInt(n, 10)).filter(Number.isFinite);
    if (!ids.length) return map;
    const rows = (await pool.request().query(`
        SELECT FIRMANO, CAST(SUM(BORC) - SUM(ALACAK) AS DECIMAL(18,2)) AS NET
        FROM [${tbl}] WHERE FIRMANO IN (${ids.join(',')}) GROUP BY FIRMANO
    `)).recordset;
    rows.forEach(r => map.set(r.FIRMANO, Number(r.NET)));
    return map;
}

// Satırı etkin kurallarla eşleştir (ilk eşleşen kazanır). { rule, amount } | null.
// Hazır tip kuralı → satırın sınıflanmış docType'ı ile eşleşir (kod+tablo authority).
// Özel kural → IZAHAT kodları + yön ile eşleşir (geriye uyum).
function matchRule(row, rules) {
    const code = parseInt(row.IZAHAT, 10);
    const borc = Number(row.BORC) || 0;
    const alacak = Number(row.ALACAK) || 0;
    const isFatura = !!row.isFatura;
    const rowDocType = row.docType || 'diger';
    for (const rule of rules) {
        if (!rule.enabled) continue;
        let amount;
        if (rule.direction === 'borc') { if (!(borc > 0)) continue; amount = borc; }
        else if (rule.direction === 'alacak') { if (!(alacak > 0)) continue; amount = alacak; }
        else { amount = borc > 0 ? borc : alacak; if (!(amount > 0)) continue; }
        if (amount < (rule.minAmount || 0)) continue;
        if (rule.docType && rule.docType !== 'custom') {
            if (rowDocType !== rule.docType) continue;
        } else {
            const codes = rule.izahatCodes || [];
            if (codes.length && !codes.includes(code)) continue;
        }
        if (rule.excludeFatura && isFatura) continue;
        return { rule, amount };
    }
    return null;
}

// ─── Çekirdek: tek tarama ──────────────────────────────────────────────────────
async function pollOnce() {
    if (polling) return;
    polling = true;
    lastPollAt = new Date().toISOString();
    lastError = null;
    let sent = 0, skipped = 0, found = 0, queued = 0;

    try { sent += await processPending(); }
    catch (e) { console.error('[Watcher] kuyruk işleme hatası:', e.message); }

    try {
        const pool = deps.getPool();
        if (!pool || !pool.connected) throw new Error('Veritabanı bağlantısı yok.');
        const tbl = tableName();
        if (!tbl) throw new Error('Firma/dönem seçilmemiş.');
        if (!(await tableExists(pool, tbl))) throw new Error(`Tablo bulunamadı: ${tbl}`);

        const rules = (config.rules || []).filter(r => r.enabled);

        // İlk görüşte watermark = mevcut MAX(IND); geçmişe mesaj atma.
        if (state.lastSeenInd[tbl] == null) {
            const mx = (await pool.request().query(`SELECT ISNULL(MAX(IND),0) AS mx FROM [${tbl}]`)).recordset[0].mx;
            state.lastSeenInd[tbl] = mx;
            saveState();
            lastResult = { sent: 0, skipped: 0, found: 0, note: `İzleme başladı (watermark IND=${mx})` };
            return;
        }

        const lastSeen = state.lastSeenInd[tbl];

        // Watermark tavanı (kural eşleşmese de ilerleyebilsin).
        const rMax = pool.request();
        rMax.input('last', deps.sql.Int, lastSeen);
        const newMax = (await rMax.query(`SELECT ISNULL(MAX(IND), @last) AS mx FROM [${tbl}] WHERE IND > @last`)).recordset[0].mx;

        // Hiç etkin kural yoksa: tarama sadece watermark'ı ilerletir (DB yükü minimum).
        if (!rules.length) {
            if (newMax > lastSeen) { state.lastSeenInd[tbl] = newMax; saveState(); }
            lastResult = { sent, skipped, found: 0, note: sent ? `Kuyruktan ${sent} gönderildi` : 'Etkin belge tipi kuralı yok' };
            return;
        }

        const devirFilter = ` AND TRY_CAST(h.IZAHAT AS INT) NOT IN (${DEVIR_CODES.join(',')})`;

        // isFatura bayrağı: peşin fatura oto-ödeme çifti VEYA fatura başlık kaydı.
        const pairExpr = `EXISTS (SELECT 1 FROM [${tbl}] b
            WHERE b.FIRMANO = h.FIRMANO AND b.EVRAKNO = h.EVRAKNO AND b.BORC > 0
              AND b.IND <> h.IND AND CONVERT(date, b.TARIH) = CONVERT(date, h.TARIH))`;
        const faturaParts = [pairExpr];
        for (const [suffix, alias] of [['TBLALFATBASLIK', 'fal'], ['TBLSATFATBASLIK', 'fst']]) {
            const ft = `F${config.firmaNo}D${config.donemNo}${suffix}`;
            if (await cachedTableExists(pool, ft)) {
                faturaParts.push(`EXISTS (SELECT 1 FROM [${ft}] ${alias} WHERE ${alias}.BELGENO = h.EVRAKNO AND ${alias}.FIRMANO = h.FIRMANO)`);
            }
        }
        const isFaturaExpr = faturaParts.join(' OR ');
        const docTypeExpr = await buildDocTypeCase(pool);

        const r = pool.request();
        r.input('last', deps.sql.Int, lastSeen);
        const rows = (await r.query(`
            SELECT h.IND, h.FIRMANO, h.BORC, h.ALACAK, h.BAKIYE, h.EVRAKNO, h.TARIH, h.IZAHAT, h.PARABIRIMI,
                   CASE WHEN ${isFaturaExpr} THEN 1 ELSE 0 END AS isFatura,
                   ${docTypeExpr} AS docType
            FROM [${tbl}] h
            WHERE h.IND > @last AND (h.BORC > 0 OR h.ALACAK > 0)${devirFilter}
            ORDER BY h.IND ASC
        `)).recordset;

        // Kural eşleşen satırları ayıkla
        const matched = [];
        for (const row of rows) {
            const m = matchRule(row, rules);
            if (m) matched.push({ row, rule: m.rule, amount: m.amount });
        }
        found = matched.length;
        if (!found) {
            if (newMax > lastSeen) { state.lastSeenInd[tbl] = newMax; saveState(); }
            lastResult = { sent, skipped, found, note: sent ? `Kuyruktan ${sent} gönderildi` : (pending.length ? `Yeni belge yok (kuyrukta ${pending.length})` : 'Yeni belge yok') };
            return;
        }

        // Cari iletişim + kalan borç topluca çöz
        const inds = [...new Set(matched.map(x => x.row.FIRMANO).filter(v => v != null))];
        const contacts = await deps.resolveCariContacts(config.firmaNo, inds);
        const borcMap = await fetchKalanBorc(pool, tbl, inds);

        for (const { row, rule, amount } of matched) {
            const c = contacts.get(row.FIRMANO) || {};
            const kalanBorc = borcMap.has(row.FIRMANO) ? borcMap.get(row.FIRMANO) : (c.bakiye != null ? c.bakiye : null);
            const bakiyeStr = kalanBorc != null ? fmtAmount(Math.abs(kalanBorc)) : '';
            const durum = kalanBorc == null ? '' : (kalanBorc > 0 ? 'Borç' : kalanBorc < 0 ? 'Alacak' : '');
            const base = {
                ind: row.IND, cariInd: row.FIRMANO, name: c.name || String(row.FIRMANO),
                firma: c.firma || c.name || String(row.FIRMANO), kod: c.kod || '', phone: c.phone || null,
                tutar: fmtAmount(amount), evrak: row.EVRAKNO || '', bakiye: bakiyeStr, bakiyeDurum: durum,
                ruleName: rule.name,
            };

            if (c.pasif) {
                skipped++; pushLog({ ...base, status: 'pasif', error: 'Cari pasif (STATUS=2)' }); continue;
            }
            // KESİN KURAL: biz müşteriye borçluysak (net bakiye Alacak yönünde, < 0) HİÇ gönderme.
            // Tahsilat/bakiye mesajı "müşteri bize borçlu" izlenimi verir; alacaklı cariye yanlıştır.
            // (reminders.js zaten net>0 borçluları hedefler; watcher belge-tipi yolunda bu guard eksikti.)
            if (kalanBorc != null && kalanBorc < 0) {
                skipped++; pushLog({ ...base, status: 'alacakli', error: 'Cari alacaklı (biz borçluyuz) — gönderilmez' }); continue;
            }
            if (!cariTipMatches(config.cariType, c.tip)) {
                skipped++; pushLog({ ...base, status: 'wrongType', error: `Cari tipi filtre dışı (${c.tip || 'bilinmiyor'})` }); continue;
            }
            if (config.onlySmsGonder && !c.smsGonder) {
                skipped++; pushLog({ ...base, status: 'noSmsConsent', error: 'SMS Gönder izni yok (SMSGONDER kapalı)' }); continue;
            }
            if (!c.phone || !c.valid) {
                skipped++; pushLog({ ...base, status: 'noPhone', error: 'Geçerli telefon yok' }); continue;
            }

            const text = renderTemplate(rule.template, {
                ad: c.name, firma: c.firma, tutar: fmtAmount(amount), kod: c.kod, evrak: row.EVRAKNO || '',
                belge: rule.name,
                tarih: row.TARIH ? new Date(row.TARIH).toLocaleDateString('tr-TR') : '',
                bakiye: bakiyeStr, durum,
            });
            const media = loadMediaFromDescriptor(rule.media);

            const targets = (config.sendAllPhones && Array.isArray(c.phones) && c.phones.length) ? c.phones : [c.phone];
            for (const phone of targets) {
                if (!deps.waStatus().ready) {
                    enqueue(base, phone, text, 'WhatsApp bağlı değil — kuyruğa alındı, bağlanınca gönderilecek', rule.media); queued++; continue;
                }
                // Anti-ban tavanı (warm-up/saatlik/günlük) doldu → kuyruğa al, gönderme.
                // Sonraki turlarda gate açılınca processPending gönderir.
                const g = antiban.gate(deps.waStatus().me, null);
                if (!g.ok) {
                    enqueue(base, phone, text, `Gönderim tavanı: ${g.reason} — kuyruğa alındı`, rule.media); queued++; continue;
                }
                if (config.verifyOnWhatsApp) {
                    const chk = await deps.checkOnWhatsApp(phone);
                    if (!chk.exists) {
                        if (chk.transient) { enqueue(base, phone, text, `Doğrulanamadı (${chk.error || 'geçici hata'}) — kuyruğa alındı`, rule.media); queued++; }
                        else { skipped++; pushLog({ ...base, phone, status: 'notOnWhatsApp', error: 'WhatsApp kullanıcısı değil' }); }
                        continue;
                    }
                }
                const res = await deps.waSend(phone, text, media, { simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400) });
                if (res.success) { antiban.recordSent(deps.waStatus().me); sent++; pushLog({ ...base, phone, status: 'sent', message: text }); }
                else { enqueue(base, phone, text, `Gönderilemedi (${res.error}) — kuyruğa alındı`, rule.media); queued++; }
                await sleep(rand(8000, 20000));
            }
        }

        if (newMax > state.lastSeenInd[tbl]) { state.lastSeenInd[tbl] = newMax; saveState(); }
        const bits = [`${sent} gönderildi`];
        if (queued) bits.push(`${queued} kuyrukta`);
        if (skipped) bits.push(`${skipped} atlandı`);
        lastResult = { sent, skipped, found, queued, note: bits.join(', ') };
    } catch (e) {
        lastError = e.message;
        lastResult = { sent, skipped, found, note: 'Hata: ' + e.message };
        console.error('[Watcher] tarama hatası:', e.message);
    } finally {
        polling = false;
    }
}

// ─── Yaşam döngüsü ─────────────────────────────────────────────────────────────
function start() {
    if (!config.firmaNo || !config.donemNo) { lastError = 'Firma/dönem seçilmemiş.'; return false; }
    stop();
    running = true;
    config.enabled = true;
    saveConfig();
    const ms = Math.max(10, config.intervalSec || 30) * 1000;
    pollOnce();
    timer = setInterval(pollOnce, ms);
    console.log(`[Watcher] başlatıldı → ${tableName()} her ${config.intervalSec}sn`);
    return true;
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    running = false;
    config.enabled = false;
    saveConfig();
}

function autoStart() {
    if (config.enabled && config.firmaNo && config.donemNo) start();
}

function getConfig() { return { ...config }; }

function setConfig(patch) {
    const prevRules = config.rules || [];
    const next = { ...config, ...patch };
    if (patch.rules !== undefined) {
        const arr = Array.isArray(patch.rules) ? patch.rules : [];
        next.rules = arr.map(r => normalizeRule(r, prevRules.find(p => p.id === r.id)));
    }
    config = next;
    saveConfig();
    return getConfig();
}

function getStatus() {
    return {
        running, enabled: config.enabled,
        firmaNo: config.firmaNo, donemNo: config.donemNo,
        table: tableName(), intervalSec: config.intervalSec,
        verifyOnWhatsApp: config.verifyOnWhatsApp, simulateTyping: config.simulateTyping,
        sendAllPhones: config.sendAllPhones === true, onlySmsGonder: config.onlySmsGonder === true,
        cariType: config.cariType || 'hepsi',
        rules: (config.rules || []).map(r => ({
            id: r.id, docType: r.docType, name: r.name, enabled: r.enabled, izahatCodes: r.izahatCodes,
            direction: r.direction, minAmount: r.minAmount, excludeFatura: r.excludeFatura,
            template: r.template, media: r.media ? { name: r.media.name, kind: r.media.kind } : null,
        })),
        lastPollAt, lastError, lastResult,
        watermark: tableName() ? (state.lastSeenInd[tableName()] ?? null) : null,
        pendingCount: pending.length,
    };
}

function getLog() { return log; }

function resetWatermark() {
    const t = tableName();
    if (t) { delete state.lastSeenInd[t]; saveState(); }
}

module.exports = {
    configure, autoStart, start, stop,
    getConfig, setConfig, getStatus, getLog, resetWatermark, pollOnce,
    setRuleMedia, clearRuleMedia,
};
