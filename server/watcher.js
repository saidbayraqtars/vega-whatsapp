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
let DOCS_PATH = null;
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
//     83=Banka Giriş/HAVALE (tahsilat)  84=Banka Çıkış (tediye)
// HAVALE NOTU (2026-06-30, F0101 D0001 ile birebir doğrulandı): banka havalesi cari
// defterine IZAHAT=83 ALACAK olarak yazılır (BANKGIRHAREKET 420 satır = CARIHAREKET
// IZAHAT=83 420 satır, toplam 3.255.263,74 birebir). 83 cariGiris ile aynı "ödeme
// alındı" sınıfına girer; 84 banka tediyesi → cariCikis. (Eskiden sadece 13 vardı →
// havale bildirimi gitmiyordu; "bir özellikten sonra gitti" arızasının kökü buydu.)
// dir: ödeme tipleri yalnız doğru işaretli satırda sınıflanır (peşin stok çıkışı
// gibi paylaşılan EVRAKNO'lu BORC satırı tahsilat sayılmasın).
const DOC_PRIORITY = [
    // Banka havalesi (83/84) başlık authority ile eşleşmez (BANKGIRBASLIK'ta FIRMANO
    // yok + BELGENO ayrı seri) → SADECE IZAHAT kodu yedeğiyle sınıflanır. cari giriş/
    // çıkış bordrosu (13/11) ise CARGIR/CARCIKBASLIK authority + kodla.
    { docType: 'cariGiris',      suffixes: ['TBLCARGIRBASLIK'], codes: [13, 83], dir: 'alacak' },
    { docType: 'cariCikis',      suffixes: ['TBLCARCIKBASLIK'], codes: [11, 84], dir: 'borc' },
    { docType: 'satisFaturasi',  suffixes: ['TBLSATFATBASLIK', 'TBLSATVADFATBASLIK', 'TBLPSATFATBASLIK'], codes: [21] },
    { docType: 'alisFaturasi',   suffixes: ['TBLALFATBASLIK', 'TBLALVADFATBASLIK'], codes: [20] },
    { docType: 'satisIrsaliyesi', suffixes: ['TBLSATIRSBASLIK'], codes: [] },
    { docType: 'alisIrsaliyesi', suffixes: ['TBLALIRSBASLIK'], codes: [] },
    { docType: 'stokCikis',      suffixes: ['TBLSTKCIKBASLIK'], codes: [33] },
    { docType: 'stokGiris',      suffixes: ['TBLSTKGIRBASLIK'], codes: [32] },
];
// Tek kod → docType (eski kod-bazlı kuralları docType'a göç için).
const CODE_TO_DOCTYPE = { 13: 'cariGiris', 83: 'cariGiris', 11: 'cariCikis', 84: 'cariCikis', 21: 'satisFaturasi', 20: 'alisFaturasi', 33: 'stokCikis', 32: 'stokGiris' };

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
        id: 'cariGiris', docType: 'cariGiris', name: 'Cari Giriş / Havale (Tahsilat)',
        direction: 'alacak', izahatCodes: [13, 83], excludeFatura: true, enabled: false,
        template: 'Değerli müşterimiz {firma}, {tarih} itibari ile {tutar} TL. tutarındaki ödemeniz başarıyla alınmış ve hesabınıza işlenmiştir.\nSon durum Cari Hesap Bakiyeniz {bakiye} TL. dir.\nBilgi amaçlıdır. Bakiyede farklılık olduğunu düşünüyorsanız lütfen iletişime geçiniz.\n{firmaadi}',
    },
    {
        id: 'cariCikis', docType: 'cariCikis', name: 'Cari Çıkış / Banka Tediye',
        direction: 'borc', izahatCodes: [11, 84], excludeFatura: false, enabled: false,
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
    // Alacaklı carilere de gönder (biz borçluyken, net bakiye < 0). VARSAYILAN AÇIK
    // (kullanıcı talebi). Kapatılırsa eski "KESİN KURAL" döner: alacaklıya gönderme.
    sendAlacakli: true,
    // ── Belge düzenleme / silme izleme (mesaj atılmış belgeler için) ──
    // watchEdits: belgenin tutarı sonradan değişince "düzenlendi" mesajı gönder.
    // watchDeletes: belge DB'den silinince gönderilen WhatsApp mesajını geri çek.
    // editScanSec: izlenen belgeleri yeniden sorgulama sıklığı (DB yükünü sınırlar).
    watchEdits: false,
    watchDeletes: false,
    editScanSec: 60,
    editTemplate: 'Sayın {firma}, {tarih} tarihli {evrak} no.lu belgeniz güncellendi. Yeni tutar: {yeniTutar} TL (önceki {eskiTutar} TL). Güncel bakiyeniz: {bakiye} TL ({durum}).',
    // Belge tipi kuralları. loadConfig ilk açılışta PRESET_RULES ile doldurur.
    //   { id, docType, name, enabled, izahatCodes:[], direction:'alacak'|'borc'|'any',
    //     minAmount, excludeFatura, template, media:{path,mime,kind,name}|null }
    rules: [],
};

let config = { ...DEFAULT_CONFIG };
let state = { lastSeenInd: {} };
let log = [];
let pending = [];
// Gönderilen belge defteri: { [tbl]: { [docType::cari::tarih::EVRAKNO]: entry } }.
// Düzenleme/silme algısı için; yalnız watchEdits||watchDeletes açıkken doldurulur.
// 7 günle sınırlı.
let docs = {};
let lastEditScanAt = 0;
let rescanDone = false;

const MAX_VERIFY_ATTEMPTS = 3;
const MAX_SEND_ATTEMPTS = 8;
// İzleme penceresi: 7 günden eski belge "düzenlenemez/silinmez" sayılır, defterden düşer.
const DOC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// WhatsApp geri çekme (delete-for-everyone) sınırı ~2 gün; küçük güvenlik payı bırak.
const RECALL_LIMIT_MS = 2 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000;

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
    if (/tahsilat|ödeme alın|odeme alin|cari giriş|cari giris|havale|banka giriş|banka giris/.test(name)) return 'cariGiris';
    if (/tediye|cari çıkış|cari cikis|banka çıkış|banka cikis/.test(name)) return 'cariCikis';
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
        // Belge içeriğini (kesilen faturanın kalemlerini) mesaja da ekle. Varsayılan kapalı.
        // Yalnız kalemli belge tiplerinde (fatura/irsaliye/stok) çalışır; ödeme/özel'de yok sayılır.
        includeContent: r.includeContent === true,
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
    DOCS_PATH = path.join(dataDir, 'watcher-docs.json');
    MEDIA_DIR = dataDir;
    loadConfig();
    loadState();
    loadPending();
    loadLog();
    loadDocs();
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
            // DİSKTEKİ ham veriye (raw.rules) bak: config.rules zaten DEFAULT_CONFIG'ten
            // [] gelir, o yüzden config.rules'a bakmak göçü hep atlatırdı (eski kullanıcının
            // etkin tahsilat şablonu güncellemede sessizce düşerdi → havale bildirimi durur).
            if (!Array.isArray(raw.rules) && (raw.template != null || raw.izahatCodes != null)) {
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

// ─── Gönderilen belge defteri (düzenleme/silme izleme) ──────────────────────────
const watchActive = () => config.watchEdits === true || config.watchDeletes === true;

// EVRAKNO Vega'da GLOBAL TEKİL DEĞİL: her kasa/banka fiş serisi kendi sayacını tutar,
// numaralar cariler ve tarihler arasında tekrar eder (canlı: A0000272 → 8 Tem cari 176,
// 10 Tem cari 123). Defter anahtarı sadece docType::EVRAKNO iken bir carinin belgesi
// başka carinin aynı numaralı belgesini susturuyordu (94/99 yanlış "zaten bildirildi").
// Kimlik = belge tipi + cari + belge tarihi + evrak.
const dayOf = (t) => {
    if (!t) return '';
    const d = t instanceof Date ? t : new Date(t);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};
const docKeyOf = (docType, cariInd, tarih, evrak) => `${docType}::${cariInd}::${dayOf(tarih)}::${evrak}`;

// Eski defterler docType::EVRAKNO ile yazılmıştı. Anahtarları kayıt alanlarından
// yeniden üret — yoksa yeni anahtar hiçbir eski kayda değmez ve zaten mesaj almış
// carilere mükerrer gider.
function migrateDocKeys() {
    let changed = false;
    for (const t of Object.keys(docs)) {
        const bucket = docs[t];
        const fixed = {};
        for (const [k, e] of Object.entries(bucket)) {
            if (!e || !e.evrak || !e.docType) continue;         // bozuk kayıt: düş
            const nk = docKeyOf(e.docType, e.cariInd, e.tarih, e.evrak);
            if (nk !== k) changed = true;
            fixed[nk] = e;
        }
        docs[t] = fixed;
    }
    if (changed) saveDocs();
}

function loadDocs() {
    try { if (fs.existsSync(DOCS_PATH)) { const d = JSON.parse(fs.readFileSync(DOCS_PATH, 'utf8')); if (d && typeof d === 'object') docs = d; } }
    catch (e) { console.error('[Watcher] belge defteri okunamadı:', e.message); }
    migrateDocKeys();
}
function saveDocs() {
    try { fs.writeFileSync(DOCS_PATH, JSON.stringify(docs), 'utf8'); }
    catch (e) { console.error('[Watcher] belge defteri yazılamadı:', e.message); }
}
// 7 günden eski kayıtları düşür (defter bounded kalsın).
function pruneDocs() {
    const cut = Date.now() - DOC_WINDOW_MS;
    let changed = false;
    for (const t of Object.keys(docs)) {
        const bucket = docs[t];
        for (const k of Object.keys(bucket)) {
            if (new Date(bucket[k].sentAt).getTime() < cut) { delete bucket[k]; changed = true; }
        }
        if (!Object.keys(bucket).length) delete docs[t];
    }
    if (changed) saveDocs();
}

// Bir belge mesajı başarıyla gidince deftere işle (yeni belge VEYA kuyruktan gönderim).
// base: pollOnce/enqueue base'i (docType, ruleId, amountNum, direction, evrak, cariInd,
// name/firma/kod, tarihISO içerir). id: WhatsApp mesaj kimliği (geri çekme için).
function recordSentDoc(tbl, base, phone, id) {
    if (!watchActive() || !tbl || !base || !base.evrak || !base.docType) return;
    docs[tbl] = docs[tbl] || {};
    const key = docKeyOf(base.docType, base.cariInd, base.tarihISO, base.evrak);
    const e = docs[tbl][key] || {
        evrak: base.evrak, cariInd: base.cariInd, docType: base.docType,
        ruleId: base.ruleId, ruleName: base.ruleName,
        name: base.name, firma: base.firma, kod: base.kod,
        amount: Number(base.amountNum) || 0, direction: base.direction || 'any',
        tarih: base.tarihISO || null, waMsgs: [], sentAt: new Date().toISOString(),
    };
    if (id) e.waMsgs.push({ phone, id });
    docs[tbl][key] = e;
    saveDocs();
}

// Defter kaydından log/güvenlik için base üret.
const ledgerBase = (e) => ({
    ind: null, cariInd: e.cariInd, name: e.name || String(e.cariInd),
    firma: e.firma || e.name || String(e.cariInd), kod: e.kod || '',
    phone: (e.waMsgs[0] && e.waMsgs[0].phone) || null,
    tutar: fmtAmount(e.amount), evrak: e.evrak, ruleName: e.ruleName,
});

// Kuyruğa ekle (ind+phone tekilliği). mediaDesc kuralın görselidir (kalıcı yeniden okuma için).
function enqueue(base, phone, text, reason, mediaDesc) {
    if (pending.some(p => p.ind === base.ind && p.phone === phone)) return;
    pending.push({
        ind: base.ind, cariInd: base.cariInd, name: base.name, firma: base.firma, kod: base.kod,
        tutar: base.tutar, evrak: base.evrak, bakiye: base.bakiye, bakiyeDurum: base.bakiyeDurum,
        ruleName: base.ruleName, phone, text, media: mediaDesc || null,
        // Defter alanları: kuyruktan gönderilince recordSentDoc bunlarla işler.
        docType: base.docType, ruleId: base.ruleId, amountNum: base.amountNum,
        direction: base.direction, tarihISO: base.tarihISO,
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
        // Gece penceresi: gönderim saati dışında kuyrukta beklesin (gece mesaj atma).
        if (antiban.inQuietHours()) break;
        // Anti-ban tavanı doldu → kuyrukta kalsın, sonraki turda (saat/gün dönünce) dene.
        if (!antiban.gate(deps.waStatus().me, null, 'belge').ok) break;
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
        const res = await deps.waSend(item.phone, item.text, media, { simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400), channel: 'belge' });
        if (res.success) {
            antiban.recordSent(deps.waStatus().me, 'belge');
            recordSentDoc(tableName(), item, item.phone, res.id);
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

// Firma Bilgileri'ndeki "biz" adı ({firmaadi} imzası) — pollOnce başına 1 kez, 6s TTL cache.
let bizFirmaCache = { no: null, name: '', at: 0 };
async function getBizFirma() {
    if (!config.firmaNo || !deps || typeof deps.getFirmaName !== 'function') return '';
    const now = Date.now();
    if (bizFirmaCache.no === config.firmaNo && (now - bizFirmaCache.at) < 6 * 60 * 60 * 1000) return bizFirmaCache.name;
    try {
        const name = (await deps.getFirmaName(config.firmaNo)) || '';
        bizFirmaCache = { no: config.firmaNo, name, at: now };
        return name;
    } catch { return bizFirmaCache.name || ''; }
}

function renderTemplate(tpl, vars) {
    return antiban.applySpintax(tpl)
        .replace(/\{ad\}/gi, vars.ad || '')
        .replace(/\{unvan\}/gi, vars.ad || '')
        .replace(/\{firma\}/gi, vars.firma || vars.ad || '')
        .replace(/\{firmaadi\}/gi, vars.firmaadi || '')
        .replace(/\{tutar\}/gi, vars.tutar || '')
        .replace(/\{eskiTutar\}/gi, vars.eskiTutar || '')
        .replace(/\{yeniTutar\}/gi, vars.yeniTutar || '')
        .replace(/\{kod\}/gi, vars.kod || '')
        .replace(/\{evrak\}/gi, vars.evrak || '')
        .replace(/\{belge\}/gi, vars.belge || '')
        .replace(/\{tarih\}/gi, vars.tarih || '')
        .replace(/\{bakiye\}/gi, vars.bakiye || '')
        .replace(/\{borc\}/gi, vars.bakiye || '')
        .replace(/\{durum\}/gi, vars.durum || '')
        .replace(/ ?\(\s*\)/g, '')
        .replace(/\n+\s*$/, ''); // {firmaadi} boşsa dipteki boş satırı at
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

// ─── Belge tipi + isFatura sınıflandırma (JS tarafında) ─────────────────────────
// ESKİ: tek dev SQL (nested CASE+EXISTS+OR zinciri) üretiyordu; bazı müşteri
// veritabanlarında (eski/farklı SQL Server sürümü/ayarı) açıklanamayan
// "Incorrect syntax near OR" hatası veriyordu — üretilen metin kendi başına
// geçerli T-SQL olduğu halde (parantez dengeli, her OR'un iki yanı dolu; 2026-08-11
// doğrulandı). Kök neden sürücü/sunucu tarafında olabileceğinden, riski SQL
// karmaşıklığını azaltarak kapatıyoruz: her belge başlık tablosuna dosyadaki diğer
// sorgularla (scanEditsDeletes, fetchKalanBorc) AYNI basit "parametreli IN" deseniyle
// tek tek bakılır, sınıflandırma satır satır JS'te yapılır. Ana sorguda artık ne CASE
// ne de OR'lu EXISTS var.
// SQL Server tek istekte EN FAZLA 2100 parametre kabul eder. EVRAKNO listesi
// parametre olarak gider; uygulama uzun süre kapalı/hatalı kalıp geri yığın
// birikirse liste 2100'ü aşar ve sorgu "too many parameters" ile patlar.
// Listeyi parçalayıp sonuçları birleştiriyoruz (sonuç birebir aynı).
const SQL_PARAM_CHUNK = 1000;
function chunkList(arr, size = SQL_PARAM_CHUNK) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function fetchAuthoritySets(pool, ftList, firmanos, evraknos) {
    const sets = {};
    if (!firmanos.length || !evraknos.length) return sets;
    for (const ft of ftList) {
        sets[ft] = new Set();
        for (const part of chunkList(evraknos)) {
            try {
                const req = pool.request();
                const eParams = part.map((ev, i) => { req.input(`e${i}`, deps.sql.NVarChar, String(ev)); return `@e${i}`; });
                const rows = (await req.query(`
                    SELECT DISTINCT BELGENO, FIRMANO FROM [${ft}]
                    WHERE FIRMANO IN (${firmanos.join(',')}) AND BELGENO IN (${eParams.join(',')})
                `)).recordset;
                rows.forEach(r => sets[ft].add(`${r.FIRMANO}::${r.BELGENO}`));
            } catch (e) { console.error(`[Watcher] authority sorgusu (${ft}):`, e.message); }
        }
    }
    return sets;
}

// rows'a isFatura/docType alanlarını ekler (in-place).
async function classifyRows(pool, tbl, rows) {
    if (!rows.length) return;
    const firmanos = [...new Set(rows.map(r => r.FIRMANO).filter(v => v != null))];
    const evraknos = [...new Set(rows.map(r => r.EVRAKNO).filter(v => v != null && v !== ''))];

    const neededSuffixes = new Set(['TBLALFATBASLIK', 'TBLSATFATBASLIK']);
    for (const { suffixes } of DOC_PRIORITY) (suffixes || []).forEach(s => neededSuffixes.add(s));
    const ftBySuf = {};
    for (const suf of neededSuffixes) {
        const ft = `F${config.firmaNo}D${config.donemNo}${suf}`;
        if (await cachedTableExists(pool, ft) && await cachedHasDocCols(pool, ft)) ftBySuf[suf] = ft;
    }
    const sets = await fetchAuthoritySets(pool, Object.values(ftBySuf), firmanos, evraknos);

    // Peşin fatura oto-ödeme çifti: aynı FIRMANO+EVRAKNO+tarihte başka bir BORC satırı.
    let pairRows = [];
    if (firmanos.length && evraknos.length) {
        for (const part of chunkList(evraknos)) {
            try {
                const req = pool.request();
                const eParams = part.map((ev, i) => { req.input(`e${i}`, deps.sql.NVarChar, String(ev)); return `@e${i}`; });
                const got = (await req.query(`
                    SELECT FIRMANO, EVRAKNO, CONVERT(date, TARIH) AS D, IND
                    FROM [${tbl}] WHERE BORC > 0 AND FIRMANO IN (${firmanos.join(',')}) AND EVRAKNO IN (${eParams.join(',')})
                `)).recordset;
                pairRows = pairRows.concat(got);
            } catch (e) { console.error('[Watcher] peşin fatura çift sorgusu:', e.message); }
        }
    }

    for (const row of rows) {
        const key = `${row.FIRMANO}::${row.EVRAKNO}`;
        const rowDate = row.TARIH ? new Date(row.TARIH).toISOString().slice(0, 10) : null;
        const hasPair = pairRows.some(p => p.FIRMANO === row.FIRMANO && String(p.EVRAKNO) === String(row.EVRAKNO)
            && p.IND !== row.IND && p.D && rowDate && new Date(p.D).toISOString().slice(0, 10) === rowDate);
        const alExists = ftBySuf.TBLALFATBASLIK && sets[ftBySuf.TBLALFATBASLIK]?.has(key);
        const stExists = ftBySuf.TBLSATFATBASLIK && sets[ftBySuf.TBLSATFATBASLIK]?.has(key);
        row.isFatura = (hasPair || alExists || stExists) ? 1 : 0;

        row.docType = 'diger';
        const borc = Number(row.BORC) || 0, alacak = Number(row.ALACAK) || 0;
        const code = parseInt(row.IZAHAT, 10);
        for (const { docType, suffixes, codes, dir } of DOC_PRIORITY) {
            if (dir === 'alacak' && !(alacak > 0)) continue;
            if (dir === 'borc' && !(borc > 0)) continue;
            const tableHit = (suffixes || []).some(suf => ftBySuf[suf] && sets[ftBySuf[suf]]?.has(key));
            const codeHit = codes && codes.length && Number.isFinite(code) && codes.includes(code);
            if (tableHit || codeHit) { row.docType = docType; break; }
        }
    }
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

// ─── Düzenleme / silme taraması (mesaj atılmış belgeler) ────────────────────────
// Defterdeki belgeleri DB'de yeniden sorgular: tutar değişmiş → "düzenlendi" mesajı;
// satır yok → silinmiş → WhatsApp mesajını geri çek. editScanSec ile throttle'lı.
async function scanEditsDeletes(pool, tbl) {
    const now = Date.now();
    if (now - lastEditScanAt < Math.max(15, config.editScanSec || 60) * 1000) return;
    lastEditScanAt = now;
    pruneDocs();
    const bucket = docs[tbl];
    if (!bucket) return;
    const entries = Object.entries(bucket);
    if (!entries.length) return;

    // İzlenen EVRAKNO'ların güncel durumunu tek sorguda al.
    const evraks = [...new Set(entries.map(([, e]) => e.evrak).filter(v => v != null && v !== ''))];
    const inds = [...new Set(entries.map(([, e]) => parseInt(e.cariInd, 10)).filter(Number.isFinite))];
    if (!evraks.length || !inds.length) return;

    // 2100 parametre sınırı için parçalı sorgu (bkz. chunkList). DİKKAT: bir parça
    // hata verirse TÜM tarama iptal — eksik `cur` haritası, var olan belgeyi
    // "silinmiş" gösterip mesajı yanlışlıkla geri çektirir.
    const cur = new Map();
    for (const part of chunkList(evraks)) {
        const req = pool.request();
        const params = part.map((ev, i) => { req.input(`e${i}`, deps.sql.NVarChar, String(ev)); return `@e${i}`; });
        try {
            // Gruplama defter anahtarıyla aynı kimliği kullanmalı: cari + belge tarihi +
            // evrak. Sadece cari+evrak ile gruplayınca aynı carinin farklı tarihli, aynı
            // numaralı iki fişi tek satırda toplanır → uydurma "tutar değişti" mesajı.
            const rows = (await req.query(`
                SELECT EVRAKNO, FIRMANO, CONVERT(date, TARIH) AS D,
                       CAST(SUM(BORC) AS DECIMAL(18,2)) AS B,
                       CAST(SUM(ALACAK) AS DECIMAL(18,2)) AS A,
                       COUNT(*) AS N
                FROM [${tbl}]
                WHERE FIRMANO IN (${inds.join(',')}) AND EVRAKNO IN (${params.join(',')})
                GROUP BY EVRAKNO, FIRMANO, CONVERT(date, TARIH)
            `)).recordset;
            rows.forEach(r => cur.set(`${r.FIRMANO}::${dayOf(r.D)}::${r.EVRAKNO}`, { B: Number(r.B) || 0, A: Number(r.A) || 0, N: Number(r.N) || 0 }));
        } catch (e) { console.error('[Watcher] düzenleme/silme sorgusu:', e.message); return; }
    }

    for (const [key, e] of entries) {
        const c = cur.get(`${e.cariInd}::${dayOf(e.tarih)}::${e.evrak}`);
        if (!c || c.N === 0) {
            if (config.watchDeletes) await handleDeleted(tbl, key, e);
            else { delete bucket[key]; saveDocs(); }    // izlenmiyorsa defteri temizle
            continue;
        }
        const curAmount = e.direction === 'alacak' ? c.A : e.direction === 'borc' ? c.B : (c.B > 0 ? c.B : c.A);
        if (Math.abs(curAmount - (Number(e.amount) || 0)) >= 0.01) {
            if (config.watchEdits) await handleEdited(pool, tbl, key, e, curAmount);
            else { e.amount = curAmount; saveDocs(); } // izlenmiyorsa sessizce güncelle
        }
    }
}

// Silinen belge: gönderilen WhatsApp mesaj(lar)ını geri çek (2 gün sınırı). WA bağlı
// değilse needsRecall ile beklet, sonraki turda dene. Tamamlanınca defterden düş.
async function handleDeleted(tbl, key, e) {
    const bucket = docs[tbl]; if (!bucket) return;
    const ageMs = Date.now() - new Date(e.sentAt).getTime();
    if (ageMs > RECALL_LIMIT_MS) {
        pushLog({ ...ledgerBase(e), status: 'recallExpired', error: 'Belge silindi ama mesaj 2 günden eski — geri çekilemez' });
        delete bucket[key]; saveDocs(); return;
    }
    if (!deps.waStatus().ready) { e.needsRecall = true; saveDocs(); return; }
    let allOk = true;
    for (const m of (e.waMsgs || [])) {
        const r = await deps.waDelete(m.phone, m.id);
        if (!r.success) allOk = false;
        await sleep(rand(800, 1800));
    }
    pushLog({ ...ledgerBase(e), status: 'recalled', error: allOk ? 'Belge silindi — WhatsApp mesajı geri çekildi' : 'Belge silindi — bazı mesajlar geri çekilemedi' });
    delete bucket[key]; saveDocs();
}

// Tutarı değişen belge: "düzenlendi" mesajı gönder (mevcut guard'lar + anti-ban + kuyruk).
async function handleEdited(pool, tbl, key, e, curAmount) {
    const bucket = docs[tbl]; if (!bucket) return;
    const oldAmount = Number(e.amount) || 0;
    e.amount = curAmount;       // tekrar tetiklenmesin diye hemen güncelle (mesaj gitmese de)
    saveDocs();

    const contacts = await deps.resolveCariContacts(config.firmaNo, [e.cariInd]);
    const c = contacts.get(e.cariInd) || {};
    const borcMap = await fetchKalanBorc(pool, tbl, [e.cariInd]);
    const kalanBorc = borcMap.has(e.cariInd) ? borcMap.get(e.cariInd) : (c.bakiye != null ? c.bakiye : null);
    const bakiyeStr = kalanBorc != null ? fmtAmount(Math.abs(kalanBorc)) : '';
    const durum = kalanBorc == null ? '' : (kalanBorc > 0 ? 'Borç' : kalanBorc < 0 ? 'Alacak' : '');
    const base = {
        ind: null, cariInd: e.cariInd, name: c.name || e.name || String(e.cariInd),
        firma: c.firma || c.name || e.firma || String(e.cariInd), kod: c.kod || e.kod || '',
        phone: c.phone || null, tutar: fmtAmount(curAmount), evrak: e.evrak,
        bakiye: bakiyeStr, bakiyeDurum: durum, ruleName: e.ruleName,
        docType: e.docType, ruleId: e.ruleId, amountNum: curAmount, direction: e.direction, tarihISO: e.tarih,
    };

    // Guard'lar (insert yoluyla birebir aynı): pasif / alacaklı / tip / sms / telefon.
    if (c.pasif) { pushLog({ ...base, status: 'pasif', error: 'Cari pasif — düzenleme mesajı atlandı' }); return; }
    if (config.sendAlacakli === false && kalanBorc != null && kalanBorc < 0) { pushLog({ ...base, status: 'alacakli', error: 'Cari alacaklı — "alacaklılara da gönder" kapalı, düzenleme atlandı' }); return; }
    if (!cariTipMatches(config.cariType, c.tip)) { pushLog({ ...base, status: 'wrongType', error: `Cari tipi filtre dışı (${c.tip || 'bilinmiyor'})` }); return; }
    if (config.onlySmsGonder && !c.smsGonder) { pushLog({ ...base, status: 'noSmsConsent', error: 'SMS Gönder izni yok' }); return; }
    if (!c.phone || !c.valid) { pushLog({ ...base, status: 'noPhone', error: 'Geçerli telefon yok' }); return; }

    const text = renderTemplate(config.editTemplate || DEFAULT_CONFIG.editTemplate, {
        ad: c.name, firma: c.firma, kod: c.kod, evrak: e.evrak, belge: e.ruleName,
        tarih: e.tarih ? new Date(e.tarih).toLocaleDateString('tr-TR') : '',
        eskiTutar: fmtAmount(oldAmount), yeniTutar: fmtAmount(curAmount),
        bakiye: bakiyeStr, durum,
    });

    if (antiban.inQuietHours()) { enqueue(base, c.phone, text, antiban.quietReason(), null); return; }
    if (!deps.waStatus().ready) {
        enqueue(base, c.phone, text, 'WhatsApp bağlı değil — düzenleme mesajı kuyruğa alındı', null);
        return;
    }
    const g = antiban.gate(deps.waStatus().me, null, 'belge');
    if (!g.ok) { enqueue(base, c.phone, text, `Gönderim tavanı: ${g.reason} — kuyruğa alındı`, null); return; }
    if (config.verifyOnWhatsApp) {
        const chk = await deps.checkOnWhatsApp(c.phone);
        if (!chk.exists) {
            if (chk.transient) enqueue(base, c.phone, text, `Doğrulanamadı (${chk.error || 'geçici hata'}) — kuyruğa alındı`, null);
            else pushLog({ ...base, status: 'notOnWhatsApp', error: 'WhatsApp kullanıcısı değil' });
            return;
        }
    }
    const res = await deps.waSend(c.phone, text, null, { simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400), channel: 'belge' });
    if (res.success) {
        antiban.recordSent(deps.waStatus().me, 'belge');
        if (res.id) { e.waMsgs.push({ phone: c.phone, id: res.id }); saveDocs(); }  // sonraki silmede bu da geri çekilir
        pushLog({ ...base, status: 'edited', message: text, error: `Tutar ${fmtAmount(oldAmount)} → ${fmtAmount(curAmount)} TL` });
    } else {
        enqueue(base, c.phone, text, `Gönderilemedi (${res.error}) — kuyruğa alındı`, null);
    }
}

// ─── Tek seferlik kurtarma: son 24 saati yeniden tara ──────────────────────────
// docKeyOf cari+tarih içermediği sürece yeni belgeler "zaten bildirildi" denip
// atlanıyordu (canlı: 94/99 yanlış atlama). Watermark'ı dün 00:00'a çek ki kaçan
// belgeler bir kez daha değerlendirilsin. Defter (migrateDocKeys ile taşındı) zaten
// mesaj almış olanları tutar, mükerrer gitmez. Marker dosyası: sadece bir kez.
const RESCAN_MARKER = () => path.join(MEDIA_DIR, '.rescan-24h-v1');

function markRescanDone() {
    rescanDone = true;
    try { fs.writeFileSync(RESCAN_MARKER(), new Date().toISOString(), 'utf8'); }
    catch (e) { console.error('[Watcher] yeniden tarama işareti yazılamadı:', e.message); }
}

async function rescanLast24h(pool, tbl) {
    if (rescanDone) return;
    if (fs.existsSync(RESCAN_MARKER())) { rescanDone = true; return; }
    try {
        // TARIH belge tarihidir (saat 00:00). "Son 24 saat" = dün 00:00'dan itibaren.
        const mn = Number((await pool.request().query(`
            SELECT ISNULL(MIN(IND), 0) AS mn FROM [${tbl}]
            WHERE TARIH >= DATEADD(day, -1, CONVERT(date, GETDATE()))
        `)).recordset[0].mn) || 0;
        const prev = state.lastSeenInd[tbl];
        if (mn > 0 && prev != null && mn - 1 < prev) {
            state.lastSeenInd[tbl] = mn - 1;
            saveState();
            pushLog({ status: 'info', error: `Belge kimliği düzeltildi — son 24 saat yeniden taranıyor (IND ${mn} sonrası)` });
            console.log(`[Watcher] 24s yeniden tarama: watermark ${prev} → ${mn - 1}`);
        }
        markRescanDone();   // yalnız sorgu başarılıysa işaretle; hata olursa sonraki turda dene
    } catch (e) { console.error('[Watcher] 24s yeniden tarama:', e.message); }
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

        // Mesaj atılmış belgelerin düzenleme/silme taraması (throttle'lı; insert'ten bağımsız).
        if (watchActive()) {
            try { await scanEditsDeletes(pool, tbl); }
            catch (e) { console.error('[Watcher] düzenleme/silme tarama hatası:', e.message); }
        }

        const rules = (config.rules || []).filter(r => r.enabled);

        // İlk görüşte watermark = mevcut MAX(IND); geçmişe mesaj atma.
        if (state.lastSeenInd[tbl] == null) {
            const mx = (await pool.request().query(`SELECT ISNULL(MAX(IND),0) AS mx FROM [${tbl}]`)).recordset[0].mx;
            state.lastSeenInd[tbl] = mx;
            saveState();
            markRescanDone();   // yeni kurulum: geçmişi kurtarma yok
            lastResult = { sent: 0, skipped: 0, found: 0, note: `İzleme başladı (watermark IND=${mx})` };
            return;
        }

        await rescanLast24h(pool, tbl);
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

        // Ana sorgu bilerek SQL Server 2008 UYUMLU tutulur: CASE/EXISTS/OR yok,
        // TRY_CAST yok (TRY_CAST SQL 2012+ ister; müşterilerimizde 2008 kullanan var).
        // Devir (103/104) elemesi ve sınıflandırma sorgu sonrası JS'te yapılır.
        const r = pool.request();
        r.input('last', deps.sql.Int, lastSeen);
        const mainQuery = `
            SELECT h.IND, h.FIRMANO, h.BORC, h.ALACAK, h.BAKIYE, h.EVRAKNO, h.TARIH, h.IZAHAT, h.PARABIRIMI
            FROM [${tbl}] h
            WHERE h.IND > @last AND (h.BORC > 0 OR h.ALACAK > 0)
            ORDER BY h.IND ASC
        `;
        let rows;
        try {
            rows = (await r.query(mainQuery)).recordset;
        } catch (e) {
            // Hangi sorgu patladığını panelde göster (dosyaya bakmaya gerek kalmasın).
            console.error('[Watcher] ana sorgu hatası, SQL:\n' + mainQuery);
            e.message = `${e.message} | SQL: ${mainQuery.replace(/\s+/g, ' ').trim()}`;
            throw e;
        }
        // Devir (yıl başı açılış) satırları belge değil — eskiden SQL'de TRY_CAST ile
        // eleniyordu, artık burada.
        rows = rows.filter(row => !DEVIR_CODES.includes(parseInt(row.IZAHAT, 10)));
        try {
            await classifyRows(pool, tbl, rows);
        } catch (e) {
            console.error('[Watcher] sınıflandırma hatası:', e.message);
            e.message = `${e.message} (sınıflandırma aşaması)`;
            throw e;
        }

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
        const bizFirma = await getBizFirma(); // {firmaadi} imzası (Firma Bilgileri)

        for (const { row, rule, amount } of matched) {
            // INSERT-guard: bu belge zaten bildirilmişse (sil+ekle ile gelen düzenleme)
            // yeni mesaj ATMA — düzenleme/silme taraması tutar farkını/kaybı yakalar.
            // Kimlik cari+tarih içerir: EVRAKNO tek başına tekil değil (bkz. docKeyOf).
            if (watchActive() && docs[tbl] && docs[tbl][docKeyOf(rule.docType, row.FIRMANO, row.TARIH, row.EVRAKNO || '')]) {
                skipped++;
                pushLog({ ind: row.IND, cariInd: row.FIRMANO, name: String(row.FIRMANO), evrak: row.EVRAKNO || '', ruleName: rule.name, status: 'info', error: 'Belge zaten bildirildi — düzenleme olarak izleniyor' });
                continue;
            }
            const c = contacts.get(row.FIRMANO) || {};
            const kalanBorc = borcMap.has(row.FIRMANO) ? borcMap.get(row.FIRMANO) : (c.bakiye != null ? c.bakiye : null);
            const bakiyeStr = kalanBorc != null ? fmtAmount(Math.abs(kalanBorc)) : '';
            const durum = kalanBorc == null ? '' : (kalanBorc > 0 ? 'Borç' : kalanBorc < 0 ? 'Alacak' : '');
            const base = {
                ind: row.IND, cariInd: row.FIRMANO, name: c.name || String(row.FIRMANO),
                firma: c.firma || c.name || String(row.FIRMANO), kod: c.kod || '', phone: c.phone || null,
                tutar: fmtAmount(amount), evrak: row.EVRAKNO || '', bakiye: bakiyeStr, bakiyeDurum: durum,
                ruleName: rule.name,
                // Defter alanları (düzenleme/silme izleme için).
                docType: rule.docType, ruleId: rule.id, amountNum: amount, direction: rule.direction, tarihISO: row.TARIH,
            };

            if (c.pasif) {
                skipped++; pushLog({ ...base, status: 'pasif', error: 'Cari pasif (STATUS=2)' }); continue;
            }
            // Alacaklı cari (net bakiye < 0 = biz borçluyuz). VARSAYILAN: gönder.
            // sendAlacakli=false ise eski KESİN KURAL döner (atla): tahsilat/bakiye mesajı
            // "müşteri bize borçlu" izlenimi verir, kullanıcı kapatabilir.
            if (config.sendAlacakli === false && kalanBorc != null && kalanBorc < 0) {
                skipped++; pushLog({ ...base, status: 'alacakli', error: 'Cari alacaklı — "alacaklılara da gönder" kapalı, atlandı' }); continue;
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
            // Dönüş-budama (anti-ban): üst üste yanıt vermeyen numaraya gönderimi durdur.
            if (typeof deps.isSuspended === 'function' && deps.isSuspended(c.phone)) {
                skipped++; pushLog({ ...base, status: 'noReply', error: 'Üst üste yanıt yok — dönüş-budama ile atlandı (Anti-ban)' }); continue;
            }

            let text = renderTemplate(rule.template, {
                ad: c.name, firma: c.firma, tutar: fmtAmount(amount), kod: c.kod, evrak: row.EVRAKNO || '',
                belge: rule.name, firmaadi: bizFirma,
                tarih: row.TARIH ? new Date(row.TARIH).toLocaleDateString('tr-TR') : '',
                bakiye: bakiyeStr, durum,
            });
            // Seçenek açıksa O AN kesilen belgenin (EVRAKNO) kalemlerini mesaja ekle.
            if (rule.includeContent && typeof deps.buildDocContentText === 'function') {
                try {
                    // amount = BORC/ALACAK = belgenin KDV DAHİL genel toplamı → içerik
                    // bloğundaki "Toplam" bununla yazılsın (kalem toplamı iskontoda sapar).
                    const content = await deps.buildDocContentText(config.firmaNo, config.donemNo, rule.docType, row.EVRAKNO, amount);
                    if (content) text += '\n\n' + content;
                } catch (e) { console.error('[Watcher] belge içeriği eklenemedi:', e.message); }
            }
            // İlk temasta "numaramızı kaydedin" ricası (kaydet-opt-in açıksa).
            if (deps.saveContactText && typeof deps.shouldAskSave === 'function' && deps.shouldAskSave(c.phone)) {
                text += '\n\n' + deps.saveContactText;
            }
            const media = loadMediaFromDescriptor(rule.media);

            const targets = (config.sendAllPhones && Array.isArray(c.phones) && c.phones.length) ? c.phones : [c.phone];
            for (const phone of targets) {
                // Gece penceresi: saat dışındaysa kuyruğa al, pencere açılınca gönderilir.
                if (antiban.inQuietHours()) { enqueue(base, phone, text, antiban.quietReason(), rule.media); queued++; continue; }
                if (!deps.waStatus().ready) {
                    enqueue(base, phone, text, 'WhatsApp bağlı değil — kuyruğa alındı, bağlanınca gönderilecek', rule.media); queued++; continue;
                }
                // Anti-ban tavanı (warm-up/saatlik/günlük) doldu → kuyruğa al, gönderme.
                // Sonraki turlarda gate açılınca processPending gönderir.
                const g = antiban.gate(deps.waStatus().me, null, 'belge');
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
                const res = await deps.waSend(phone, text, media, { simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400), channel: 'belge' });
                if (res.success) { antiban.recordSent(deps.waStatus().me, 'belge'); recordSentDoc(tbl, base, phone, res.id); sent++; pushLog({ ...base, phone, status: 'sent', message: text }); }
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
        cariType: config.cariType || 'hepsi', sendAlacakli: config.sendAlacakli !== false,
        watchEdits: config.watchEdits === true, watchDeletes: config.watchDeletes === true,
        editScanSec: config.editScanSec || 60, editTemplate: config.editTemplate || DEFAULT_CONFIG.editTemplate,
        docsCount: Object.values(docs).reduce((n, b) => n + Object.keys(b).length, 0),
        rules: (config.rules || []).map(r => ({
            id: r.id, docType: r.docType, name: r.name, enabled: r.enabled, izahatCodes: r.izahatCodes,
            direction: r.direction, minAmount: r.minAmount, excludeFatura: r.excludeFatura,
            includeContent: r.includeContent === true,
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
