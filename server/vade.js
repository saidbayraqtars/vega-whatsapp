// ═══════════════════════════════════════════════════════════════════════════
//  Vade Takip — Çek / Senet / Vadeli Visa hatırlatması (sabit iç numaraya)
//
//  Kullanıcı "kalan gün" eşiği seçer (ör. 7,3,1). Portföydeki çek/senet/kredi
//  kartı belgesinin vadesine o kadar gün kalınca, sipariş bildirimi gibi
//  WhatsApp mesajı gider — CARİYE DEĞİL, kullanıcının girdiği numara(lar)a.
//
//  ─── VERİTABANI GERÇEĞİ (canlı doğrulandı, VEGADB) ────────────────────────
//  Vade, çek/senet/visa BELGE tablolarında DEĞİL, cari giriş/çıkış fişinin
//  ÖDEME SATIRINDA durur:
//    • F{firma}D{donem}TBLCARGIRHAREKET  → tahsilat (müşteriden ALINAN)
//    • F{firma}D{donem}TBLCARCIKHAREKET  → ödeme    (bizim VERDİĞİMİZ)
//  Bu satırlarda: VADE (datetime), TUTAR, FIRMANO (=TBLCARI.IND), BELGENO
//  (çek/senet no), BANKANO, EVRAKNO (=fiş başlığı IND), BELGELINK (=belge IND).
//
//  BELGE TİPİ: IZAHAT kodu değil TABLO ÜYELİĞİ (watcher.js ile aynı desen).
//  Ödeme satırı hangi belge tablosuna bağlanıyorsa tipi odur:
//      d.IND = h.BELGELINK  AND  d.EVRAKNO = h.EVRAKNO      ← bileşik anahtar
//  Tek başına BELGELINK YETMEZ: çek/senet/visa IND uzayları 100'den başlar, çakışır.
//  Ölçüldü (F0103D0014, gerçek veri): yalnız IND ile 798 eşleşme → 132'si YANLIŞ TİP;
//  IND+EVRAKNO ile 666 eşleşme → tip karışımı SIFIR.
//    çek   → TBLCEKGIRIS / TBLCEKCIKIS
//    senet → TBLSENETGIRIS / TBLSENETCIKIS
//    visa  → TBLVISAGIRIS            (çıkış tablosu yok)
//    taksit→ TBLTAKSITGIRIS
//  Tablolar döneme göre eksik olabilir (ör. F0101D0002'de TBLCEKCIKIS yok) →
//  her dal kullanılmadan önce varlığı kontrol edilir.
//
//  IZAHAT kodları (canlıda doğrulandı, yalnız teşhis için — sorgu bunlara BAĞLI DEĞİL):
//    1 = kasa/nakit   2 = çek   3 = senet   4 = visa/kredi kartı   6 = virman   11 = banka/diğer
//  Doğrulama F0101D0017: IZAHAT=4 → 2240 satır = TBLVISAGIRIS 2240 kayıt (birebir).
//
//  BİLEREK KAPSAM DIŞI — CİRO EDİLEN ÇEK: portföydeki müşteri çeki tedarikçiye
//  verilince çıkış satırı TBLCEKGİRİS kaydına bağlanır ama d.EVRAKNO ilk giriş fişini
//  gösterdiği için bileşik anahtar tutmaz (F0103D0014'te 674 çek satırının 8'i, %1.2).
//  Kasıtlı: o çek alınırken zaten bildirildi; ciroyu da eklemek AYNI çeki ikinci kez
//  (aynı vade, aynı tutar) haber vermek olurdu. BELGENO'yu ikinci anahtar yapmayı
//  denedik: kazanılan 8 satır tamamen mükerrer, üstelik 1-2 yanlış tip eşleşmesi getirdi.
//
//  VİSA'NIN VADESİ — TBLVISAGIRIS'te satır = bankanın ödeyeceği BİR parça:
//    • LN>=1  → banka anlaşması (F{firma}TBLBNKKARTANLASMAHAREKET) tanımlı: Vega satışı
//               taksitlere böler, her taksit ayrı satır (TAKSITSAYISI=1, LN=taksit no),
//               VADE = işlem + BLOKEGUN + (LN-1) × TAHSILATSEKLI gün → GERÇEK ödeme günü.
//    • LN=0   → anlaşma yok/bölünmemiş: tek satır, VADE çoğunlukla işlem gününün AYNISI
//               (czgr 1014 satırın 855'i, özdemirkaya %100) → vade değil, işlem tarihi.
//    • PORTFOYNO = satış şekli (kaç taksitle satıldı; anlaşmadaki SATISSEKLI ile eşleşir).
//      TAKSITSAYISI bölünmüş satırda 1'dir — "taksitli mi" sorusunun cevabı DEĞİL.
//  2026-09-30 düzeltmesi: eskiden "taksitli" = TAKSITSAYISI>1 idi → tam tersini seçiyordu:
//  vadesi işlem günü olan bölünmemiş satırları alıp ("bugün vadesi"), gerçek taksit
//  satırlarını (czgr 6657, özdemirkaya 4222) hiç görmüyordu. Artık:
//    - taksitli = PORTFOYNO>1, PORTFOYNO yoksa TAKSITSAYISI>1 (visaOnlyTaksit),
//    - VADE işlem gününden SONRA olmalı (vadesi işlem günü olan satırın takip edilecek vadesi yok),
//    - STATUS=27 "Kredi Kartı Bankada" (Vega'nın tahsil edilmemiş visa görünümüyle aynı:
//      F..VTBLTAHSILEDILMEMISVISALAR da CH.STATUS=27 + CH.VADE kullanır; 28/52 = tahsil
//      edildi, 50/51 = iade).
//  Taksit günlerini Vega anlaşmadan hesaplar; anlaşma yanlış girilmişse (ör. özdemirkaya:
//  BLOKEGUN=1, TAHSILATSEKLI=1 → 6 taksit art arda 6 gün) Vega ekranı da aynı günü gösterir.
//
//  VADESİ OLMAYAN SATIŞ (2026-10-02): anlaşma tanımlı değilse Vega VADE'ye işlem gününü
//  yazar — özdemirkaya'da 2240 satırın ~1700'ü (YKB, ZİRAAT, AKBANK, VISA…). Bu satırlar
//  yukarıdaki kuralla elenir; bir kurulumda bütün kart satışları böyleyse visa bildirimi
//  HİÇ gelmez (patron PC'si). Gerçek ödeme günü Vega'da yok, biz uydurmayız: kullanıcı
//  isterse Vega'nın formülünü kendi verir (visaRuleFirst = blokaj günü, visaRuleEvery =
//  taksit aralığı; 0 = tek seferde). Yalnız BÖLÜNMEMİŞ satışa uygulanır — bölünmüş satışın
//  bir parçasının tutarını tekrar bölmemek için (LN<=1 ve aynı fişte LN>1 satır yok).
//  Önizlemedeki visa özeti (visaSummary) kaç satırın neden alınmadığını gösterir.
//  Gerçek taksitli SATIŞ takvimi (mağaza taksiti) ayrı: TBLWSTAKSITLISATIS — bkz. shopstar.js.
//
//  BANKA ADI: h.BANKANO → F{firma}TBLBANKALAR.IND → ADI (dönemsiz tablo; canlı:
//  101→AKBANK). Tablo/eşleşme yoksa belge tablosunun metin alanına düşülür.
//
//  STATUS: çek 1=açık / 6=kapandı, senet 8=açık / 13=kapandı (kodlar tipe ve kuruluma
//  göre değişiyor: aynı DB'de 1..34 aralığı görüldü) → STATUS'e GÖRE FİLTRE YOK.
//  Gerek de yok: canlıda gelecek vadeli 162 çekin 162'si STATUS=1, 25 senedin 25'i
//  STATUS=8 — kapanmış belgenin vadesi zaten geçmişte kalıyor.
//
//  ─── EŞİK MANTIĞI (mesaj yağmuru olmadan yakalama) ────────────────────────
//  Eşikler azalan sırada denenmez; belge için "kalan gün <= eşik" olan
//  eşiklerin EN KÜÇÜĞÜ seçilir ve gönderim sonrası büyükleri de işaretlenir.
//  Böylece:
//    • normal akış: 7 → 3 → 1 diye üç ayrı hatırlatma gider,
//    • program kapalıyken eşikler kaçtıysa TEK mesaj gider (üç tane değil),
//    • aynı belge+eşik ikinci kez asla bildirilmez (defter: vade-sent.json).
//
//  ANTI-BAN: hedef az sayıda, kayıtlı, kendi numaramız → tavan uygulanmaz;
//  yalnız 403/401 soğuması dinlenir (sipariş.js ile aynı gerekçe).
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const antiban = require('./antiban');
const { normalizePhone, isLikelyValid } = require('./phone');

let deps = null;

const gateSend = (ch) => (deps.gate ? deps.gate(ch) : antiban.gate(deps.waStatus().me, null, ch));
const noteSent = (ch) => {
    try {
        if (deps.recordSent) deps.recordSent(ch);
        else antiban.recordSent(deps.waStatus().me, ch);
    } catch { /* yok say */ }
};

let CONFIG_PATH = null;
let SENT_PATH = null;
let LOG_PATH = null;
let PENDING_PATH = null;

let timer = null;
let polling = false;
let running = false;
let lastPollAt = null;
let lastError = null;
let lastResult = null;

// Belge tipi tanımı: hangi belge tablosuna bağlanırsa o tip.
// side: 'GIR' = alınan (tahsilat), 'CIK' = verilen (ödeme).
// taksit = satışın taksit sayısı, taksitNo = bu satır kaçıncı taksit (visa dışında yok).
// islem = işlem günü (yalnız visa; vadesi olmayan satışa kural uygulamak için).
// Visa'da taksit sayısı PORTFOYNO'da (satış şekli); boşsa TAKSITSAYISI (czgr'de 2 satır).
const VISA_TAKSIT = 'CASE WHEN ISNULL(d.PORTFOYNO, 0) > 1 THEN d.PORTFOYNO ELSE d.TAKSITSAYISI END';
const DOC_TYPES = [
    { id: 'cek', label: 'Çek', gir: 'TBLCEKGIRIS', cik: 'TBLCEKCIKIS', ek: 'd.SUBE', taksit: 'NULL', taksitNo: 'NULL', islem: 'NULL' },
    { id: 'senet', label: 'Senet', gir: 'TBLSENETGIRIS', cik: 'TBLSENETCIKIS', ek: 'd.KESIDEEDEN', taksit: 'NULL', taksitNo: 'NULL', islem: 'NULL' },
    // Visa'da BANKAADI canlıda çoğu satırda NULL; kart adı (GARANTI/ISBANK/MAİLORDER) dolu.
    // PORTFOYNO = satış şekli (taksit sayısı), LN = taksit no — bkz. başlıktaki VİSA notu.
    { id: 'visa', label: 'Kredi Kartı', gir: 'TBLVISAGIRIS', cik: null, ek: 'ISNULL(d.BANKAADI, d.KARTADI)', taksit: VISA_TAKSIT, taksitNo: 'd.LN', islem: 'd.ISLEMTARIHI' },
    { id: 'taksit', label: 'Taksit', gir: 'TBLTAKSITGIRIS', cik: null, ek: 'NULL', taksit: 'NULL', taksitNo: 'NULL', islem: 'NULL' },
];

// Visa satırı için ek filtre: tahsil edilmemiş (27), istenirse yalnız taksitli satış.
// Vega vadesi olan satır: VADE işlem gününden sonra. Vadesi olmayan (VADE = işlem günü)
// bölünmemiş satış ayrı dalda kuralla açılır (noVade). Bkz. başlıktaki VİSA notları.
function visaFilter(onlyTaksit, noVade) {
    const base = ' AND h.STATUS = 27' + (onlyTaksit ? ` AND ISNULL(${VISA_TAKSIT}, 0) > 1` : '');
    if (!noVade) return base + ' AND h.VADE >= DATEADD(day, 1, CAST(d.ISLEMTARIHI AS date))';
    return base + ' AND h.VADE < DATEADD(day, 1, CAST(d.ISLEMTARIHI AS date))'
        + ' AND ISNULL(d.LN, 0) <= 1'
        + ' AND NOT EXISTS (SELECT 1 FROM [{DOC}] d2 WHERE d2.EVRAKNO = d.EVRAKNO AND d2.LN > 1)';
}

// Vadesi olmayan kart satışı için kullanıcının kuralı: ilk ödeme kaç gün sonra (boş = kural
// yok, bu satışlar alınmaz), taksitler kaç gün arayla (0 = hepsi ilk ödemeyle tek seferde).
function visaRule() {
    const first = parseInt(config.visaRuleFirst, 10);
    if (!Number.isFinite(first) || first < 0) return null;
    const every = parseInt(config.visaRuleEvery, 10);
    return { first: Math.min(365, first), every: Number.isFinite(every) ? Math.min(120, Math.max(0, every)) : 30 };
}
const MAX_TAKSIT = 36;   // kural dalında geriye bakış sınırı (taksit sayısı en çok bu kadar sayılır)
const typeLabel = (id) => (DOC_TYPES.find(t => t.id === id) || {}).label || id;

const DEFAULT_TEMPLATE =
    '⏰ *Vade Hatırlatma* — {kalan}\n' +
    '{tur} {belgeno} • {yon}\n' +
    'Cari: {firma}{kodpar}\n' +
    'Vade: {vade}\n' +
    'Tutar: {tutar} TL';

const DEFAULT_HEADER_TEMPLATE =
    '⏰ *Vade Hatırlatma* — {adet} belge\n' +
    'Toplam: {toplam} TL\n';

const DEFAULT_LINE_TEMPLATE =
    '• {kalan} — {tur} {belgeno} — {firma} — {tutar} TL ({vade})';

const DEFAULT_CONFIG = {
    enabled: false,
    firmaNo: null,
    donemNo: null,
    // Bildirimin gideceği numara(lar) — virgülle çoğaltılır (sipariş ile aynı).
    phone: '',
    // Kalan gün eşikleri. 0 = vade günü. Küçükten büyüğe normalize edilir.
    days: [7, 3, 1],
    // Hangi belge tipleri izlensin.
    // Visa varsayılan KAPALI: peşin kart çekimi de bu tabloda ve "vade"si banka
    // blokajı (0..9 gün) — bildirim kalabalığı yapar. Bkz. başlıktaki VİSA notu.
    types: { cek: true, senet: true, visa: false, taksit: false },
    // Visa açıksa: yalnız taksitli satışlar alınsın (peşin kart çekimi alınmasın).
    visaOnlyTaksit: true,
    // Vega'da vadesi olmayan kart satışı (VADE = işlem günü) için ödeme kuralı.
    // visaRuleFirst boş/null = kural yok → bu satışlar alınmaz. Bkz. visaRule().
    visaRuleFirst: null,
    visaRuleEvery: 30,
    // 'alinan' = müşteriden alınan (tahsilat), 'verilen' = bizim ödediğimiz, 'ikisi'.
    direction: 'ikisi',
    // Bu tutarın altındaki belgeleri bildirme (0 = hepsi).
    minAmount: 0,
    // Aynı taramada birden çok belge çıkarsa TEK mesajda topla (mesaj yağmuru olmasın).
    groupMessages: true,
    // Günün hangi saat aralığında bildirim gitsin (vade hatırlatması gece 03:00'te gitmesin).
    sendFromHour: 9,
    sendToHour: 20,
    // Tarama sıklığı (sn). Vade günlük bir olay → sık taramaya gerek yok.
    intervalSec: 900,
    respectSendWindow: false,
    simulateTyping: false,
    template: DEFAULT_TEMPLATE,
    headerTemplate: DEFAULT_HEADER_TEMPLATE,
    lineTemplate: DEFAULT_LINE_TEMPLATE,
};

let config = { ...DEFAULT_CONFIG };
// Bildirim defteri: { "<key>": { at, vade } } — key = tbl:yon:tip:dind:esik
let sentKeys = {};
let log = [];
let pending = [];

const SENT_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;   // defteri 120 gün tut
const MAX_SEND_ATTEMPTS = 8;
const PENDING_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;   // "3 gün kaldı" bir hafta sonra gitmesin
const MAX_PER_POLL = 60;            // tek turda en fazla kaç belge işlensin

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));

// ─── Kalıcılık ───────────────────────────────────────────────────────────────
function configure(d) {
    deps = d;
    const dataDir = path.join(d.baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    CONFIG_PATH = path.join(dataDir, 'vade.json');
    SENT_PATH = path.join(dataDir, 'vade-sent.json');
    LOG_PATH = path.join(dataDir, 'vade-log.json');
    PENDING_PATH = path.join(dataDir, 'vade-pending.json');
    loadAll();
}

function readJson(file, fallback) {
    try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error('[Vade] okunamadı:', path.basename(file), e.message); }
    return fallback;
}
function writeJson(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
    catch (e) { console.error('[Vade] yazılamadı:', path.basename(file), e.message); }
}

function loadAll() {
    const raw = readJson(CONFIG_PATH, null);
    if (raw && typeof raw === 'object') {
        config = { ...DEFAULT_CONFIG, ...raw, types: { ...DEFAULT_CONFIG.types, ...(raw.types || {}) } };
        config.days = normalizeDays(raw.days);
    }
    const sk = readJson(SENT_PATH, null);
    if (sk && typeof sk === 'object') sentKeys = sk;
    const lg = readJson(LOG_PATH, null);
    if (Array.isArray(lg)) log = lg;
    const pd = readJson(PENDING_PATH, null);
    if (Array.isArray(pd)) pending = pd;
}

const saveConfig = () => writeJson(CONFIG_PATH, config);
const saveSent = () => writeJson(SENT_PATH, sentKeys);
const savePending = () => writeJson(PENDING_PATH, pending);

// Kuyruğu elle boşalt (ban-şüpheli soğuma sonrası biriken eski bildirimleri toptan atmak için).
function clearPending() {
    const n = pending.length;
    if (n) pushLog({ status: 'cleared', error: `Kuyruk elle temizlendi (${n} bekleyen bildirim silindi)` });
    pending = [];
    savePending();
    return n;
}

function pushLog(entry) {
    log.unshift({ ...entry, at: new Date().toISOString() });
    if (log.length > 200) log.length = 200;
    try { fs.writeFileSync(LOG_PATH, JSON.stringify(log), 'utf8'); } catch { /* bellekte devam */ }
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
// "7, 3, 1" / [7,3,1] / "3" → [1,3,7] (küçükten büyüğe, tekil, 0..365)
function normalizeDays(raw) {
    const arr = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(/[,;\s]+/);
    const out = [];
    for (const v of arr) {
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 365 && !out.includes(n)) out.push(n);
    }
    out.sort((a, b) => a - b);
    return out.length ? out : [...DEFAULT_CONFIG.days].sort((a, b) => a - b);
}

const prefix = () => (config.firmaNo && config.donemNo ? `F${config.firmaNo}D${config.donemNo}` : null);

function fmtAmount(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Tarih: yalnız 'YYYY-MM-DD' metniyle çalışılır ──────────────────────────
// mssql sürücüsü DATETIME'ı UTC sanar (useUTC varsayılanı): Vega'nın yerel saatle
// yazdığı '2026-09-20 22:30' JS'e 20T22:30Z gelir, TR'de (UTC+3) bu 21 Eylül 01:30'dur
// → vade bir gün kayar, "kalan gün" ve mesajdaki tarih yanlış çıkar. Aynı kayma
// @f/@t parametrelerinde ters yönde olur. Bu yüzden VADE SQL'de CONVERT(..., 23) ile
// metne çevrilir, parametreler de metin gider; saat dilimi hesaba hiç girmez.
const pad2 = (n) => String(n).padStart(2, '0');
const localYmd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function ymdUtc(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}
function addDaysYmd(s, n) {
    const t = new Date(ymdUtc(s) + n * 86400000);
    return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
const daysUntil = (ymd) => Math.round((ymdUtc(ymd) - ymdUtc(localYmd())) / 86400000);
const trDate = (ymd) => { const [y, m, d] = String(ymd || '').split('-'); return d ? `${d}.${m}.${y}` : ''; };
function kalanLabel(n) {
    if (n < 0) return `${Math.abs(n)} gün geçti`;
    if (n === 0) return 'Bugün vadesi';
    if (n === 1) return 'Yarın vadesi';
    return `${n} gün kaldı`;
}

const splitPhones = (raw) => String(raw || '').split(/[,;\n\r/|]+/).map(s => s.trim()).filter(Boolean);

function targetPhones() {
    const out = [];
    for (const part of splitPhones(config.phone)) {
        const p = normalizePhone(part);
        if (isLikelyValid(p) && !out.includes(p)) out.push(p);
    }
    return out;
}
function invalidPhoneParts() {
    return splitPhones(config.phone).filter(part => !isLikelyValid(normalizePhone(part)));
}

function renderTemplate(tpl, vars) {
    return antiban.applySpintax(tpl || '')
        .replace(/\{firma\}/gi, vars.firma || '')
        .replace(/\{ad\}/gi, vars.firma || '')
        .replace(/\{kodpar\}/gi, vars.kod ? ` (${vars.kod})` : '')
        .replace(/\{kod\}/gi, vars.kod || '')
        .replace(/\{tur\}/gi, vars.tur || '')
        .replace(/\{yon\}/gi, vars.yon || '')
        .replace(/\{belgeno\}/gi, vars.belgeno || '')
        .replace(/\{banka\}/gi, vars.banka || '')
        .replace(/\{taksit\}/gi, vars.taksit || '')
        .replace(/\{vade\}/gi, vars.vade || '')
        .replace(/\{kalan\}/gi, vars.kalan || '')
        .replace(/\{gun\}/gi, vars.gun == null ? '' : String(vars.gun))
        .replace(/\{tutar\}/gi, vars.tutar || '')
        .replace(/\{adet\}/gi, vars.adet == null ? '' : String(vars.adet))
        .replace(/\{toplam\}/gi, vars.toplam || '')
        .replace(/\{fisno\}/gi, vars.fisno || '')
        .replace(/\{firmaadi\}/gi, vars.firmaadi || '')
        .replace(/ ?\(\s*\)/g, '')
        .replace(/\n+\s*$/, '');
}

// Tarama seçenekleri tek yerden — üç çağıran (poll / önizleme / test) aynı filtreyi kullansın.
// Visa kullanıcı seçeneğidir (v1.8.0–v1.10.1 arası zorla kapalıydı, geri açıldı).
const activeTypes = () => ({ ...config.types });
const scanOpts = () => ({
    types: activeTypes(),
    direction: config.direction,
    visaOnlyTaksit: config.visaOnlyTaksit !== false,
    visaRule: visaRule(),
});

async function tableExists(pool, name) {
    const r = pool.request();
    r.input('tbl', deps.sql.NVarChar, name);
    const res = await r.query(`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME=@tbl`);
    return res.recordset[0].c > 0;
}

function cooldownReason() {
    try {
        const g = gateSend('vade');
        if (!g.ok && g.capType === 'cooldown') return g.reason;
    } catch { /* gate okunamazsa gönderime engel olma */ }
    return null;
}

// Bildirim saati penceresi: vade hatırlatması gece yarısı gitmesin.
function outsideHourWindow() {
    const from = Math.min(23, Math.max(0, parseInt(config.sendFromHour, 10) || 0));
    const to = Math.min(23, Math.max(from, parseInt(config.sendToHour, 10) || 23));
    const h = new Date().getHours();
    if (h < from || h > to) return `Bildirim saati dışında (${from}:00–${to}:59)`;
    return null;
}

// ─── SQL: vadesi yaklaşan çek/senet/visa ─────────────────────────────────────
// Aktif belge tiplerini ve yönleri, o dönemde GERÇEKTEN VAR OLAN tablolara göre
// UNION'lar. Hiç dal kalmazsa null döner (çağıran anlamlı hata verir).
async function buildQuery(pool, opts) {
    const P = prefix();
    if (!P) return null;
    const wantGir = opts.direction !== 'verilen';
    const wantCik = opts.direction !== 'alinan';
    const parts = [];
    const missing = [];

    // Banka adı: h.BANKANO -> F{firma}TBLBANKALAR.IND (dönemsiz, firma seviyesi tablo).
    // Canlı doğrulandı: BANKANO=101 -> ADI='AKBANK'. Tablo yoksa belge tablosundaki
    // metin alanına (şube/keşideci/kart adı) düşeriz.
    const bankTbl = `F${config.firmaNo}TBLBANKALAR`;
    const hasBank = await tableExists(pool, bankTbl);
    const bankaCol = hasBank ? 'CAST(bk.ADI AS nvarchar(120))' : 'CAST(NULL AS nvarchar(120))';
    const bankaJoin = hasBank ? `\n                LEFT JOIN [${bankTbl}] bk ON bk.IND = h.BANKANO` : '';

    for (const t of DOC_TYPES) {
        if (!opts.types[t.id]) continue;
        for (const side of ['GIR', 'CIK']) {
            if (side === 'GIR' && !wantGir) continue;
            if (side === 'CIK' && !wantCik) continue;
            const docTbl = side === 'GIR' ? t.gir : t.cik;
            if (!docTbl) continue;                       // ör. visa çıkışı Vega'da yok
            const harTbl = `${P}TBLCAR${side}HAREKET`;
            const basTbl = `${P}TBLCAR${side}BASLIK`;
            const full = `${P}${docTbl}`;
            if (!(await tableExists(pool, full)) || !(await tableExists(pool, harTbl)) || !(await tableExists(pool, basTbl))) {
                missing.push(full);
                continue;
            }
            // kural=1: Vega'da vadesi olmayan visa satışı — vade JS'te kuraldan hesaplanır,
            // bu yüzden pencere VADE'ye değil işlem gününe (@if..@it) uygulanır.
            const branches = [{ kural: 0 }];
            if (t.id === 'visa' && opts.visaRule) branches.push({ kural: 1 });
            for (const br of branches) {
                const extra = t.id === 'visa'
                    ? visaFilter(opts.visaOnlyTaksit !== false, br.kural === 1).replace('{DOC}', full) : '';
                const window = br.kural
                    ? 'd.ISLEMTARIHI >= CAST(@if AS date) AND d.ISLEMTARIHI < DATEADD(day, 1, CAST(@it AS date))'
                    : 'h.VADE >= CAST(@f AS date) AND h.VADE < DATEADD(day, 1, CAST(@t AS date))';
                parts.push(`
                SELECT '${t.id}' AS TUR, '${side === 'GIR' ? 'alinan' : 'verilen'}' AS YON,
                       h.IND AS HIND, h.BELGELINK AS DIND, h.EVRAKNO AS FISIND,
                       h.VADE AS VADE, CONVERT(char(10), h.VADE, 23) AS VADEYMD,
                       CONVERT(char(10), ${t.islem}, 23) AS ISLEMYMD, ${br.kural} AS KURAL,
                       h.TUTAR AS TUTAR, h.PARABIRIMI AS PARABIRIMI,
                       h.FIRMANO AS FIRMANO, h.BELGENO AS BELGENO,
                       CAST(${t.ek} AS nvarchar(120)) AS EK,
                       CAST(${t.taksit} AS decimal(18,2)) AS TAKSIT,
                       CAST(${t.taksitNo} AS int) AS TAKSITNO,
                       ${bankaCol} AS BANKAADI,
                       b.BELGENO AS FISNO, b.TARIH AS FISTARIHI
                FROM [${harTbl}] h
                JOIN [${full}] d ON d.IND = h.BELGELINK AND d.EVRAKNO = h.EVRAKNO
                LEFT JOIN [${basTbl}] b ON b.IND = h.EVRAKNO${bankaJoin}
                WHERE ${window}
                  AND ISNULL(b.IPTAL, 0) = 0${extra}`);
            }
        }
    }
    if (!parts.length) return { sql: null, missing };
    return { sql: parts.join('\nUNION ALL\n') + '\nORDER BY VADE ASC, TUTAR DESC', missing };
}

// Vadesi olmayan bölünmemiş kart satışını kurala göre ödeme parçalarına açar — Vega'nın
// kendi formülü: işlem + ilk + (k-1) × aralık. Yalnız [from, to] içine düşenler döner.
// Aralık 0 ya da peşin satış → tek ödeme, tutarın tamamı. Kuruş farkı son taksitte.
function expandByRule(d, rule, from, to) {
    if (!rule || !d.islem) return [];
    const n = Math.min(MAX_TAKSIT, Math.max(1, Math.round(d.taksit || 1)));
    const one = n === 1 || rule.every === 0;
    const part = one ? d.tutar : Math.round((d.tutar / n) * 100) / 100;
    const out = [];
    for (let k = 1; k <= (one ? 1 : n); k++) {
        const vade = addDaysYmd(d.islem, rule.first + (k - 1) * rule.every);
        if (vade < from || vade > to) continue;
        const tutar = one || k < n ? part : Math.round((d.tutar - part * (n - 1)) * 100) / 100;
        out.push({ ...d, vade, kalanGun: daysUntil(vade), tutar, taksitNo: one ? null : k });
    }
    return out;
}

// Vadesi [bugün, bugün+maxDays] aralığında olan belgeler.
async function fetchDueDocs(pool, maxDays, opts) {
    const q = await buildQuery(pool, opts);
    if (!q) throw new Error('Firma/dönem seçilmemiş.');
    if (!q.sql) throw new Error('İzlenecek belge tablosu bulunamadı (seçilen tipler bu dönemde yok).');

    const from = localYmd();
    const to = addDaysYmd(from, maxDays);
    const rule = opts.visaRule || null;
    const r = pool.request();
    r.input('f', deps.sql.NVarChar, from);
    r.input('t', deps.sql.NVarChar, to);
    // Kural dalı: son taksiti pencereye düşebilecek, ilk ödemesi pencereyi geçmeyen satışlar.
    r.input('if', deps.sql.NVarChar, addDaysYmd(from, -(rule ? rule.first + (MAX_TAKSIT - 1) * rule.every : 0)));
    r.input('it', deps.sql.NVarChar, addDaysYmd(to, -(rule ? rule.first : 0)));
    const rows = (await r.query(q.sql)).recordset;

    const raw = rows.map(row => ({
        tur: row.TUR,
        turAdi: typeLabel(row.TUR),
        yon: row.YON,
        yonAdi: row.YON === 'alinan' ? 'Alınan' : 'Verilen',
        hind: row.HIND,
        dind: row.DIND,
        fisInd: row.FISIND,
        vade: row.VADEYMD,                       // 'YYYY-MM-DD' — saat dilimsiz
        kalanGun: daysUntil(row.VADEYMD),
        tutar: Number(row.TUTAR) || 0,
        parabirimi: row.PARABIRIMI || 'TL',
        firmano: row.FIRMANO,
        belgeno: (row.BELGENO || '').trim(),
        // Banka adı varsa onu göster; yoksa belge tablosunun metin alanı (şube/keşideci/kart).
        ek: (row.BANKAADI || row.EK || '').trim(),
        taksit: row.TAKSIT == null ? null : Number(row.TAKSIT),
        taksitNo: row.TAKSITNO == null ? null : Number(row.TAKSITNO),
        fisno: row.FISNO || '',
        islem: row.ISLEMYMD || null,
        kural: row.KURAL === 1,
    }));
    const docs = [];
    for (const d of raw) {
        if (!d.kural) docs.push(d);
        else docs.push(...expandByRule(d, rule, from, to));
    }
    docs.sort((a, b) => (a.vade < b.vade ? -1 : a.vade > b.vade ? 1 : b.tutar - a.tutar));

    // Aynı belge birden çok ödeme satırıyla gelebilir (fiş düzenlenip satırlar yeniden
    // yazıldığında / aynı çek iki satıra bölündüğünde) → kimliğe göre tekille.
    const seen = new Set();
    return docs.filter(d => {
        const id = docIdentity(d);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

// ─── Defter anahtarı: aynı belge + aynı eşik ikinci kez bildirilmez ──────────
// Kimlik DOĞAL alanlardan kurulur: firma + yön + tip + cari + belge no + vade.
// ESKİDEN satır IND'leri (BELGELINK + hareket IND) kullanılıyordu; Vega fişi
// düzenleyince ödeme satırlarını silip yeniden yazar → yeni IND → aynı çek "yeni
// belge" sanılıp İKİNCİ kez bildiriliyordu. Dönem de anahtarda yok: firma/dönem
// seçimi değişince defteri silmek gerekmez (eskiden siliniyordu → hepsi yeniden gidiyordu).
// Vade değişirse kimlik değişir → yeni tarihle bir kez daha haber verilir (istenen).
function docIdentity(d) {
    const no = d.belgeno ? d.belgeno.toLocaleUpperCase('tr-TR') : `#${d.dind}`;
    return `F${config.firmaNo}:${d.yon}:${d.tur}:${d.firmano}:${no}:${d.vade}`;
}
const docKey = (d, esik) => `${docIdentity(d)}:${esik}`;
// Güncellemeden önce yazılmış defter kayıtları da saysın (geçişte ikinci mesaj gitmesin).
// Kuralla açılan visa parçalarında yok: eski anahtarda vade olmadığından bütün taksitler
// aynı anahtara düşer, ilki "gönderildi" diye hepsi susardı.
const legacyKey = (d, esik) => `${prefix()}:${d.yon}:${d.tur}:${d.dind}:${d.hind}:${esik}`;
const wasSent = (d, esik) => !!(sentKeys[docKey(d, esik)] || (!d.kural && sentKeys[legacyKey(d, esik)]));

function pruneSent() {
    const cut = Date.now() - SENT_WINDOW_MS;
    let changed = false;
    for (const k of Object.keys(sentKeys)) {
        const at = new Date(sentKeys[k] && sentKeys[k].at || 0).getTime();
        if (!at || at < cut) { delete sentKeys[k]; changed = true; }
    }
    if (changed) saveSent();
}

// Belge için gönderilecek eşiği seç.
// "kalan <= eşik" olan eşiklerin EN KÜÇÜĞÜ alınır; gönderim sonrası büyükleri de
// işaretlenir → kapalı kalınan günlerin eşikleri tek mesajla kapanır.
function pickThreshold(d) {
    const cands = config.days.filter(t => d.kalanGun <= t);
    if (!cands.length) return null;
    const t0 = cands[0];                              // days küçükten büyüğe sıralı
    if (wasSent(d, t0)) return null;                  // bu belge zaten bildirildi
    return { esik: t0, alsoMark: cands.slice(1) };
}

function markSent(d, pick) {
    const at = new Date().toISOString();
    const vade = d.vade || null;
    sentKeys[docKey(d, pick.esik)] = { at, vade };
    for (const t of pick.alsoMark) sentKeys[docKey(d, t)] = { at, vade, skipped: true };
    saveSent();
}

// ─── Gönderim ────────────────────────────────────────────────────────────────
async function sendOrQueue(entry, text) {
    const phones = targetPhones();
    if (!phones.length) {
        pushLog({ ...entry, status: 'noPhone', error: 'Bildirim numarası girilmemiş/geçersiz' });
        return { sent: 0, queued: 0 };
    }
    const blockers = [];
    if (config.respectSendWindow && antiban.inQuietHours()) blockers.push(antiban.quietReason());
    if (!deps.waStatus().ready) blockers.push('WhatsApp bağlı değil');
    const cd = cooldownReason();
    if (cd) blockers.push(cd);

    let sent = 0, queued = 0;
    for (const phone of phones) {
        if (blockers.length) { enqueue(entry, phone, text, blockers.join(' • ')); queued++; continue; }
        const res = await deps.waSend(phone, text, null, {
            simulateTyping: config.simulateTyping, typingMs: rand(900, 1800), channel: 'vade',
        });
        if (res.success) {
            noteSent('vade');
            pushLog({ ...entry, phone, status: 'sent', message: text });
            sent++;
        } else {
            enqueue(entry, phone, text, `Gönderilemedi (${res.error})`);
            queued++;
        }
        if (phones.length > 1) await sleep(rand(1500, 3500));
    }
    return { sent, queued };
}

function enqueue(entry, phone, text, reason) {
    if (pending.some(p => p.key === entry.key && p.phone === phone)) return;
    pending.push({ ...entry, phone, text, attempts: 0, queuedAt: new Date().toISOString(), lastError: reason });
    savePending();
    pushLog({ ...entry, phone, status: 'queued', error: reason, message: text });
}

// Kuyruktaki bildirim artık gönderilmemeli mi? Kuyruk, kuyruğa alındığı andaki METNİ
// saklar; tip sonradan kapatılırsa (v1.8.0'da visa) tarama onu bulmaz ama kuyruk yine
// gönderirdi — güncellemeden önce kuyruğa düşen visa bildirimleri böyle gitti.
// Eski kayıtlarda turIds yok: tekilde tip adından, grupta metindeki tip adından bakılır.
function pendingDropReason(item) {
    const age = Date.now() - new Date(item.queuedAt || 0).getTime();
    if (!(age < PENDING_MAX_AGE_MS)) return 'bekleme süresi doldu';
    const active = activeTypes();
    const off = DOC_TYPES.filter(t => !active[t.id]);
    const hit = Array.isArray(item.turIds)
        ? off.find(t => item.turIds.includes(t.id))
        : off.find(t => item.tur ? item.tur === t.label : String(item.text || '').includes(t.label));
    return hit ? `${hit.label} bildirimi kapalı` : null;
}

function dropDisabledPending() {
    let changed = false;
    for (const item of [...pending]) {
        const why = pendingDropReason(item);
        if (!why) continue;
        pending = pending.filter(p => p !== item);
        pushLog({ ...item, status: 'cleared', error: `Kuyruktan çıkarıldı (${why})` });
        changed = true;
    }
    if (changed) savePending();
}

async function processPending() {
    if (!pending.length) return 0;
    dropDisabledPending();
    if (!pending.length) return 0;
    if (!deps.waStatus().ready) return 0;
    if (config.respectSendWindow && antiban.inQuietHours()) return 0;
    if (cooldownReason()) return 0;
    let sent = 0;
    for (const item of [...pending]) {
        if (!pending.includes(item)) continue;
        if (!deps.waStatus().ready) break;
        const res = await deps.waSend(item.phone, item.text, null, {
            simulateTyping: config.simulateTyping, typingMs: rand(900, 1800), channel: 'vade',
        });
        if (res.success) {
            noteSent('vade');
            pending = pending.filter(p => p !== item); savePending(); sent++;
            pushLog({ ...item, status: 'sent', message: item.text });
        } else {
            item.attempts = (item.attempts || 0) + 1;
            item.lastError = res.error;
            if (item.attempts >= MAX_SEND_ATTEMPTS) {
                pending = pending.filter(p => p !== item);
                pushLog({ ...item, status: 'failed', error: `${res.error} (${MAX_SEND_ATTEMPTS} deneme sonrası vazgeçildi)` });
            }
            savePending();
        }
        await sleep(rand(2000, 5000));
    }
    return sent;
}

// {firmaadi} imzası — 6 saat cache (watcher/sipariş ile aynı desen).
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

// "3/6. taksit" (bölünmüş visa satırı) / "6 taksit" (bölünmemiş) / '' (peşin, çek, senet).
function taksitLabel(d) {
    if (!(d.taksit > 1)) return '';
    return d.taksitNo > 0 ? `${d.taksitNo}/${d.taksit}. taksit` : `${d.taksit} taksit`;
}

function docVars(d, bizFirma, contact) {
    const c = contact || {};
    return {
        firma: c.firma || c.name || String(d.firmano),
        kod: c.kod || '',
        tur: d.turAdi,
        yon: d.yonAdi,
        belgeno: d.belgeno,
        banka: d.ek,
        taksit: taksitLabel(d),
        vade: trDate(d.vade),
        kalan: kalanLabel(d.kalanGun),
        gun: d.kalanGun,
        tutar: fmtAmount(d.tutar),
        fisno: d.fisno,
        firmaadi: bizFirma,
    };
}

// ─── Çekirdek: tek tarama ─────────────────────────────────────────────────────
async function pollOnce() {
    if (polling) return;
    polling = true;
    lastPollAt = new Date().toISOString();
    lastError = null;
    let sent = 0, queued = 0, skipped = 0, found = 0, due = 0;

    try { sent += await processPending(); }
    catch (e) { console.error('[Vade] kuyruk işleme hatası:', e.message); }

    try {
        const hourBlock = outsideHourWindow();
        if (hourBlock) { lastResult = { sent, note: hourBlock }; return; }

        const pool = deps.getPool();
        if (!pool || !pool.connected) throw new Error('Veritabanı bağlantısı yok.');
        pruneSent();

        const maxDays = config.days[config.days.length - 1];
        const docs = await fetchDueDocs(pool, maxDays, scanOpts());
        found = docs.length;

        // Eşiği dolan + daha önce bildirilmemiş belgeler.
        const batch = [];
        for (const d of docs) {
            const pick = pickThreshold(d);
            if (!pick) continue;
            if (d.tutar < (config.minAmount || 0)) {
                markSent(d, pick);                      // alt sınırın altı: bir daha bakma
                skipped++;
                continue;
            }
            batch.push({ d, pick });
            if (batch.length >= MAX_PER_POLL) break;
        }
        due = batch.length;

        if (!due) {
            lastResult = { sent, queued, skipped, found, due: 0, note: bitsNote(sent, queued, skipped) || `Vadesi yaklaşan yeni belge yok (${found} belge izleniyor)` };
            return;
        }

        const inds = [...new Set(batch.map(b => b.d.firmano).filter(v => v != null))];
        let contacts = new Map();
        try { contacts = await deps.resolveCariContacts(config.firmaNo, inds); }
        catch (e) { console.error('[Vade] cari çözümlenemedi:', e.message); }
        const bizFirma = await getBizFirma();

        if (config.groupMessages && batch.length > 1) {
            // TEK mesaj: başlık + satırlar. Vade sırasına göre.
            const toplam = batch.reduce((n, b) => n + b.d.tutar, 0);
            const header = renderTemplate(config.headerTemplate || DEFAULT_HEADER_TEMPLATE, {
                adet: batch.length, toplam: fmtAmount(toplam), firmaadi: bizFirma,
                tarih: new Date().toLocaleDateString('tr-TR'),
            });
            const lines = batch.map(b =>
                renderTemplate(config.lineTemplate || DEFAULT_LINE_TEMPLATE, docVars(b.d, bizFirma, contacts.get(b.d.firmano))));
            const text = header + '\n' + lines.join('\n');
            const entry = {
                key: `vade:group:${Date.now()}`, kind: 'group', adet: batch.length,
                turIds: [...new Set(batch.map(b => b.d.tur))],
                firma: `${batch.length} belge`, tutar: fmtAmount(toplam),
                evrak: batch.map(b => b.d.belgeno).filter(Boolean).slice(0, 5).join(', '),
            };
            const res = await sendOrQueue(entry, text);
            sent += res.sent; queued += res.queued;
            if (res.sent || res.queued) batch.forEach(b => markSent(b.d, b.pick));
            else skipped += batch.length;
        } else {
            for (const b of batch) {
                const vars = docVars(b.d, bizFirma, contacts.get(b.d.firmano));
                const text = renderTemplate(config.template || DEFAULT_TEMPLATE, vars);
                const entry = {
                    key: docKey(b.d, b.pick.esik), kind: 'single',
                    firma: vars.firma, kod: vars.kod, tutar: vars.tutar,
                    evrak: b.d.belgeno, tur: b.d.turAdi, turIds: [b.d.tur], vade: vars.vade, kalan: vars.kalan,
                };
                const res = await sendOrQueue(entry, text);
                sent += res.sent; queued += res.queued;
                if (res.sent || res.queued) markSent(b.d, b.pick);
                else skipped++;
                await sleep(rand(2000, 5000));
            }
        }

        lastResult = { sent, queued, skipped, found, due, note: bitsNote(sent, queued, skipped) };
    } catch (e) {
        lastError = e.message;
        lastResult = { sent, queued, skipped, found, due, note: 'Hata: ' + e.message };
        console.error('[Vade] tarama hatası:', e.message);
    } finally {
        polling = false;
    }
}

function bitsNote(sent, queued, skipped) {
    const bits = [];
    if (sent) bits.push(`${sent} gönderildi`);
    if (queued) bits.push(`${queued} kuyrukta`);
    if (skipped) bits.push(`${skipped} atlandı`);
    return bits.join(', ');
}

// ─── Yaşam döngüsü ────────────────────────────────────────────────────────────
function start() {
    if (!config.firmaNo || !config.donemNo) { lastError = 'Firma/dönem seçilmemiş.'; return false; }
    if (!targetPhones().length) { lastError = 'Geçerli bildirim numarası yok.'; return false; }
    if (!config.days.length) { lastError = 'Kalan gün eşiği girilmemiş.'; return false; }
    if (!Object.values(activeTypes()).some(Boolean)) { lastError = 'En az bir belge tipi seçin (çek/senet/visa).'; return false; }
    stop();
    running = true;
    config.enabled = true;
    saveConfig();
    const ms = Math.max(60, config.intervalSec || 900) * 1000;
    pollOnce();
    timer = setInterval(pollOnce, ms);
    console.log(`[Vade] başlatıldı → ${prefix()} • eşik ${config.days.join(',')} gün • ${targetPhones().join(', ')}`);
    return true;
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    running = false;
    config.enabled = false;
    saveConfig();
}

function autoStart() {
    if (config.enabled && config.firmaNo && config.donemNo && targetPhones().length) start();
}

function getConfig() { return { ...config }; }

function setConfig(patch) {
    const next = { ...config, ...patch };
    if (patch && patch.types) next.types = { ...config.types, ...patch.types };
    if (patch && patch.days !== undefined) next.days = normalizeDays(patch.days);
    // Kural alanları UI'dan metin gelir: boş = kural yok (null), aralık boşsa 30.
    if (patch && 'visaRuleFirst' in patch) {
        const v = parseInt(patch.visaRuleFirst, 10);
        next.visaRuleFirst = Number.isFinite(v) && v >= 0 ? Math.min(365, v) : null;
    }
    if (patch && 'visaRuleEvery' in patch) {
        const v = parseInt(patch.visaRuleEvery, 10);
        next.visaRuleEvery = Number.isFinite(v) && v >= 0 ? Math.min(120, v) : 30;
    }
    config = next;
    saveConfig();
    return getConfig();
}

function getStatus() {
    return {
        running, enabled: config.enabled,
        firmaNo: config.firmaNo, donemNo: config.donemNo,
        prefix: prefix(),
        days: config.days,
        types: activeTypes(),
        visaOnlyTaksit: config.visaOnlyTaksit !== false,
        visaRuleFirst: config.visaRuleFirst,
        visaRuleEvery: config.visaRuleEvery,
        direction: config.direction,
        minAmount: config.minAmount || 0,
        groupMessages: config.groupMessages !== false,
        sendFromHour: config.sendFromHour, sendToHour: config.sendToHour,
        intervalSec: config.intervalSec,
        phone: config.phone || '', phones: targetPhones(), invalidPhones: invalidPhoneParts(),
        respectSendWindow: config.respectSendWindow === true,
        simulateTyping: config.simulateTyping === true,
        template: config.template || DEFAULT_TEMPLATE,
        headerTemplate: config.headerTemplate || DEFAULT_HEADER_TEMPLATE,
        lineTemplate: config.lineTemplate || DEFAULT_LINE_TEMPLATE,
        notifiedCount: Object.keys(sentKeys).length,
        pendingCount: pending.length,
        lastPollAt, lastError, lastResult,
    };
}

function getLog() { return log; }

// Firma/dönem değişince eski defter yanlış tabloyu işaret eder → temizle.
function resetLedger() {
    sentKeys = {};
    saveSent();
}

// UI önizleme: vadesi yaklaşan belgeleri listele (mesaj GÖNDERMEZ).
// Kullanıcı canlı veride doğru belgeleri okuduğumuzu görsün diye.
async function listUpcoming(days) {
    const pool = deps.getPool();
    if (!pool || !pool.connected) throw new Error('Veritabanı bağlantısı yok.');
    const maxDays = Math.min(365, Math.max(1, parseInt(days, 10) || 30));
    const docs = await fetchDueDocs(pool, maxDays, scanOpts());
    const inds = [...new Set(docs.map(d => d.firmano).filter(v => v != null))];
    let contacts = new Map();
    try { contacts = await deps.resolveCariContacts(config.firmaNo, inds); }
    catch { /* isimsiz göster */ }
    return docs.map(d => {
        const c = contacts.get(d.firmano) || {};
        return {
            tur: d.tur, turAdi: d.turAdi, yon: d.yon, yonAdi: d.yonAdi,
            belgeno: d.belgeno, banka: d.ek, taksit: d.taksit, taksitStr: taksitLabel(d), kural: !!d.kural,
            firma: c.firma || c.name || String(d.firmano), kod: c.kod || '',
            vade: d.vade, vadeStr: trDate(d.vade), kalanGun: d.kalanGun, kalan: kalanLabel(d.kalanGun),
            tutar: d.tutar, tutarStr: fmtAmount(d.tutar),
            bildirildi: config.days.some(t => wasSent(d, t)),
        };
    });
}

// UI önizleme: seçili dönemdeki kart satışlarının dökümü — visa neden gelmiyor sorusunun
// cevabı. Satır = TBLVISAGIRIS parçası (bölünmüş satışta taksit başına bir satır).
// Visa kapalıysa / tablo yoksa null.
async function visaSummary() {
    const P = prefix();
    if (!P || !config.types.visa || config.direction === 'verilen') return null;
    const pool = deps.getPool();
    if (!pool || !pool.connected) return null;
    const docTbl = `${P}TBLVISAGIRIS`, harTbl = `${P}TBLCARGIRHAREKET`, basTbl = `${P}TBLCARGIRBASLIK`;
    for (const t of [docTbl, harTbl, basTbl]) if (!(await tableExists(pool, t))) return null;
    const vadeli = 'h.VADE >= DATEADD(day, 1, CAST(d.ISLEMTARIHI AS date))';
    const pesin = `ISNULL(${VISA_TAKSIT}, 0) <= 1`;
    const r = pool.request();
    r.input('f', deps.sql.NVarChar, localYmd());
    const row = (await r.query(`
        SELECT COUNT(*) AS TOPLAM,
               SUM(CASE WHEN h.STATUS = 27 THEN 1 ELSE 0 END) AS ACIK,
               SUM(CASE WHEN h.STATUS = 27 AND ${vadeli} THEN 1 ELSE 0 END) AS VADELI,
               SUM(CASE WHEN h.STATUS = 27 AND ${vadeli} AND h.VADE >= CAST(@f AS date) THEN 1 ELSE 0 END) AS ILERI,
               SUM(CASE WHEN h.STATUS = 27 AND ${pesin} THEN 1 ELSE 0 END) AS PESIN
        FROM [${harTbl}] h
        JOIN [${docTbl}] d ON d.IND = h.BELGELINK AND d.EVRAKNO = h.EVRAKNO
        LEFT JOIN [${basTbl}] b ON b.IND = h.EVRAKNO
        WHERE ISNULL(b.IPTAL, 0) = 0`)).recordset[0] || {};
    const n = (k) => Number(row[k]) || 0;
    const rule = visaRule();
    return {
        toplam: n('TOPLAM'),
        acik: n('ACIK'),                       // tahsil edilmemiş (STATUS=27)
        vadeli: n('VADELI'),                   // Vega'da vadesi var
        ileri: n('ILERI'),                     //   … ve vadesi bugün ya da sonra
        vadesiz: n('ACIK') - n('VADELI'),      // Vega'da vade = işlem günü
        pesin: n('PESIN'),                     // tahsil edilmemiş peşin satış
        onlyTaksit: config.visaOnlyTaksit !== false,
        rule,
    };
}

// UI "Test mesajı gönder": vadesi en yakın gerçek belgeyi (yoksa örneği) şablonla yollar.
async function sendTest() {
    const phones = targetPhones();
    if (!phones.length) return { success: false, message: 'Önce geçerli bir bildirim numarası girin.' };
    if (!deps.waStatus().ready) return { success: false, message: 'WhatsApp bağlı değil.' };

    const bizFirma = await getBizFirma();
    let vars = {
        firma: 'ÖRNEK MÜŞTERİ A.Ş.', kod: 'M00001', tur: 'Çek', yon: 'Alınan',
        belgeno: '1234567', banka: 'ZİRAAT', taksit: '', vade: trDate(addDaysYmd(localYmd(), 3)),
        kalan: kalanLabel(3), gun: 3, tutar: fmtAmount(125000), fisno: 'A0000001', firmaadi: bizFirma,
    };
    try {
        const pool = deps.getPool();
        if (pool && pool.connected && prefix()) {
            const maxDays = Math.max(90, config.days[config.days.length - 1]);
            const docs = await fetchDueDocs(pool, maxDays, scanOpts());
            if (docs.length) {
                const d = docs[0];
                const c = (await deps.resolveCariContacts(config.firmaNo, [d.firmano])).get(d.firmano) || {};
                vars = docVars(d, bizFirma, c);
            }
        }
    } catch (e) { console.error('[Vade] test verisi okunamadı:', e.message); }

    // Test en yakın GERÇEK belgeyi kullanır → gerçek bildirimle karışıp "aynı çek iki kez
    // geldi" sanılmasın diye başlık açıkça yazılır.
    const text = '🔔 TEST MESAJI — gerçek bildirim değildir\n' + renderTemplate(config.template || DEFAULT_TEMPLATE, vars);
    let ok = 0; const errors = [];
    for (const phone of phones) {
        const res = await deps.waSend(phone, text, null, { simulateTyping: false, channel: 'vade' });
        if (res.success) {
            noteSent('vade');
            pushLog({ key: 'test', kind: 'single', firma: vars.firma, tutar: vars.tutar, evrak: vars.belgeno, phone, status: 'sent', message: text, error: 'Test mesajı' });
            ok++;
        } else {
            errors.push(`${phone}: ${res.error || 'gönderilemedi'}`);
            pushLog({ key: 'test', kind: 'single', firma: vars.firma, tutar: vars.tutar, evrak: vars.belgeno, phone, status: 'failed', error: `Test — ${res.error || 'gönderilemedi'}` });
        }
        if (phones.length > 1) await sleep(rand(1200, 2500));
    }
    if (ok === phones.length) return { success: true, message: `${ok} numaraya test gönderildi.` };
    if (ok) return { success: true, message: `${ok}/${phones.length} numaraya gitti. Hata: ${errors.join(' • ')}` };
    return { success: false, message: errors.join(' • ') || 'Gönderilemedi.' };
}

module.exports = {
    configure, autoStart, start, stop,
    getConfig, setConfig, getStatus, getLog, resetLedger,
    pollOnce, listUpcoming, visaSummary, sendTest, clearPending,
};
