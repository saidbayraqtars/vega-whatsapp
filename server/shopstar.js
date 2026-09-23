// ═══════════════════════════════════════════════════════════════════════════
//  ShopStar — taksitli satış: tahsilat bildirimi + geciken taksit hatırlatması
//
//  ShopStar, Vega'nın taksitli perakende modülü. Ayrı veritabanı YOK; aynı VEGADB
//  içinde TBLWS* önekli tablolar kullanır. Mesaj CARİYE (müşteriye) gider.
//
//  ─── VERİTABANI GERÇEĞİ (VEGADBozdemirkaya, F0101D0017 üzerinde doğrulandı) ──
//  Ana tablo: F{firma}D{donem}TBLWSTAKSITLISATIS — her satır bir olay.
//  MUSTERINO = F{firma}TBLCARI.IND. IND identity (artan) → filigran güvenli.
//    IZAHAT  -1 → dönem başı devir
//    IZAHAT   1 → satış faturası (BORC=tutar, ODENEN=peşinat, TAKSITSAYISI)
//    IZAHAT   2 → kasa tahsilatı (BORDROIZAHAT=13). ODENEN=ödenen, BAKIYE=kalan borç
//    IZAHAT 104 → havale tahsilatı (BORDROIZAHAT=83). BAKIYE ve ISLEMTARIHI çoğu satırda NULL
//    IZAHAT   4 → kuruş yuvarlaması (ODENEN negatif, -0,01..-15) → BİLDİRİLMEZ
//    IZAHAT 100 → CANLI AÇIK TAKSİT PLANI, müşteri bazlı (fatura bazlı değil).
//                 TARIH=vade, TUTAR=o taksitten KALAN. Ödenen taksit satırı silinir,
//                 kısmi ödemede TUTAR düşer. Plan toplamı = müşterinin kalan borcu
//                 (son BAKIYE ile birebir tuttuğu doğrulandı).
//  Bu yüzden "kalan borç / kalan taksit / sonraki vade" hep IZAHAT=100'den okunur;
//  tahsilat satırının BAKIYE'si yalnız plan okunamazsa yedek.
//
//  TUTARSIZ VERİ: 2007 vadeli bayat plan satırları, 3202 gibi bozuk yıllar ve negatif
//  (alacaklı) planlar var → geçersiz yıl (2000 öncesi / 2100 sonrası) vade
//  hesaplarına girmez; "en fazla X gün geriye bak" sınırı var; kalan<=0 hatırlatılmaz
//  (alacaklı cariye mesaj yok kuralı).
//
//  ─── TAHSİLAT BİLDİRİMİ ───────────────────────────────────────────────────
//  IND > filigran olan yeni satırlar taranır. İlk açılışta filigran MAX(IND)'e
//  çekilir → geçmiş tahsilatlara mesaj gitmez. Bulunan tahsilat hemen gönderilmez,
//  SETTLE_MS kadar bekletilir: plan satırlarının (IZAHAT=100) güncellenmesi aynı
//  işlemde mi bilinmiyor; beklemek kalan taksit bilgisinin tazeliğini garanti eder.
//  Aynı müşterinin aynı turdaki birden çok tahsilatı TEK mesajda toplanır.
//  Defter anahtarı doğal alanlardan kurulur (müşteri+evrak+tutar+bordro); Vega fişi
//  düzenleyip satırı yeniden yazarsa (yeni IND) ikinci mesaj gitmez.
//
//  ─── GECİKEN TAKSİT HATIRLATMASI ──────────────────────────────────────────
//  Her gün "saat" geldiğinde: en eski açık taksiti N günden fazla gecikmiş müşteriler.
//  Aynı müşteriye "tekrar aralığı" gün dolmadan ikinci hatırlatma gitmez.
//  Anti-ban: her mesaj kapıdan geçer, 12-30 sn arayla gider; tavan dolarsa ya da gönderim
//  penceresi kapanırsa tur durur, sonraki dakikada/gün kaldığı yerden sürer (müşteri başı
//  defter tekrar göndermeyi önler).
//
//  Bağımlılıklar enjekte edilir:
//    configure({ getPool, sql, resolveCariContacts, waSend, checkOnWhatsApp, waStatus,
//                gate, isSuspended, isOptedOut, getFirmaName, baseDir })
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const antiban = require('./antiban');
const { normalizePhone, isLikelyValid } = require('./phone');

let deps = null;
const CHANNEL = 'shopstar';
const gateSend = () => (deps.gate ? deps.gate(CHANNEL) : antiban.gate(deps.waStatus().me, null, CHANNEL));

let CONFIG_PATH = null;
let STATE_PATH = null;
let LOG_PATH = null;

let timer = null;
let ticking = false;
let lastTickAt = null;
let lastError = null;
let lastPayResult = null;
let lastOverdueResult = null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));
const DAY_MS = 24 * 60 * 60 * 1000;
const SETTLE_MS = 60 * 1000;                 // tahsilat bulunduktan sonra bekleme
const PAY_MAX_AGE_DAYS = 3;                  // bundan eski tarihli tahsilat bildirilmez
const PAY_QUEUE_MAX_AGE_MS = 2 * DAY_MS;     // kuyrukta 2 günden uzun kalan tahsilat düşer
const SENT_WINDOW_MS = 90 * DAY_MS;          // tahsilat defteri 90 gün
const SCAN_BATCH = 500;
// Kasada kuruş kapatma da IZAHAT=2 tahsilat olarak yazılıyor (canlıda çok sayıda 0,01 TL satır) → 1 TL altı tahsilat sayılmaz.
const MIN_PAY = 1;

// Tahsilat tipleri: IZAHAT kodu → etiket.
const PAY_TYPES = [
    { id: 'kasa', izahat: 2, label: 'Kasa' },
    { id: 'havale', izahat: 104, label: 'Havale' },
];

const DEFAULT_PAY_TEMPLATE =
    'Sayın {ad}, {tarih} tarihli {odenen} TL ödemeniz alınmıştır, teşekkür ederiz.\n' +
    'Kalan borcunuz: {kalan} TL ({kalanTaksit} taksit)\n' +
    'Sonraki taksit: {sonrakiVade} — {sonrakiTutar} TL\n\n' +
    '{firmaadi}';

const DEFAULT_PAIDOFF_TEMPLATE =
    'Sayın {ad}, {tarih} tarihli {odenen} TL ödemeniz alınmıştır. ' +
    'Tüm taksitleriniz tamamlanmıştır, teşekkür ederiz.\n\n{firmaadi}';

const DEFAULT_OVERDUE_TEMPLATE =
    'Sayın {ad}, vadesi geçmiş {gecikenTaksit} taksit ödemeniz bulunmaktadır.\n' +
    'Geciken tutar: {gecikenTutar} TL (en eski vade {enEskiVade})\n' +
    'Toplam kalan borcunuz: {kalan} TL\n' +
    'Ödemenizi en kısa sürede yapmanızı rica ederiz.\n\n' +
    '{firmaadi}';

const DEFAULT_CONFIG = {
    firmaNo: null,
    donemNo: null,
    verifyOnWhatsApp: true,
    onlySmsGonder: false,
    // Açıksa karttaki tüm geçerli numaralara (TELEFON1/2/3…) gönderilir; kapalıysa yalnız birincil numaraya.
    sendAllPhones: false,
    payment: {
        enabled: false,
        types: { kasa: true, havale: true },
        minAmount: 0,
        template: DEFAULT_PAY_TEMPLATE,
        paidOffTemplate: DEFAULT_PAIDOFF_TEMPLATE,
    },
    overdue: {
        enabled: false,
        graceDays: 7,         // en eski açık taksit bu kadar günden FAZLA gecikmişse
        repeatDays: 7,        // aynı müşteriye en erken bu kadar gün sonra tekrar
        sendTime: '10:00',
        maxAgeDays: 180,      // bundan eski vadeler (bayat/hukuki takipteki) atlanır
        minAmount: 0,         // geciken tutar bunun altındaysa atla
        template: DEFAULT_OVERDUE_TEMPLATE,
    },
};

let config = clone(DEFAULT_CONFIG);
// state: { wm: {prefix: lastInd}, payQueue: [], paySent: {key: iso},
//          overdueSent: {"firma:ind": iso}, overdueTried: {"firma:ind": {status, at}}, overdueRunDate }
let state = { wm: {}, payQueue: [], paySent: {}, overdueSent: {}, overdueTried: {}, overdueRunDate: null };
let log = [];

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// ─── Kalıcılık ───────────────────────────────────────────────────────────────
function configure(d) {
    deps = d;
    const dataDir = path.join(d.baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    CONFIG_PATH = path.join(dataDir, 'shopstar.json');
    STATE_PATH = path.join(dataDir, 'shopstar-state.json');
    LOG_PATH = path.join(dataDir, 'shopstar-log.json');
    loadAll();
}

function readJson(file, fallback) {
    try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error('[ShopStar] okunamadı:', path.basename(file), e.message); }
    return fallback;
}
// Atomik yazım: güncelleme process'i yazarken öldürürse yarım JSON kalmasın
// (defter kaybolursa aynı müşteriye tekrar mesaj gider).
function writeJson(file, data) {
    try {
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, file);
    } catch (e) { console.error('[ShopStar] yazılamadı:', path.basename(file), e.message); }
}

function mergeConfig(raw) {
    const base = clone(DEFAULT_CONFIG);
    if (!raw || typeof raw !== 'object') return base;
    return {
        ...base, ...raw,
        payment: { ...base.payment, ...(raw.payment || {}), types: { ...base.payment.types, ...((raw.payment || {}).types || {}) } },
        overdue: { ...base.overdue, ...(raw.overdue || {}) },
    };
}

function loadAll() {
    config = mergeConfig(readJson(CONFIG_PATH, null));
    const st = readJson(STATE_PATH, null);
    if (st && typeof st === 'object') state = { ...state, ...st };
    const lg = readJson(LOG_PATH, null);
    if (Array.isArray(lg)) log = lg;
}
const saveConfig = () => writeJson(CONFIG_PATH, config);
const saveState = () => writeJson(STATE_PATH, state);

function pushLog(entry) {
    log.unshift({ ...entry, at: new Date().toISOString() });
    if (log.length > 300) log.length = 300;
    try { fs.writeFileSync(LOG_PATH, JSON.stringify(log), 'utf8'); } catch { /* bellekte devam */ }
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
const prefix = () => (config.firmaNo && config.donemNo ? `F${config.firmaNo}D${config.donemNo}` : null);
const tableName = () => (prefix() ? `${prefix()}TBLWSTAKSITLISATIS` : null);

function fmtAmount(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Tarihler yalnız 'YYYY-MM-DD' metniyle: mssql DATETIME'ı UTC sanar, TR'de gün kayar
// (vade.js ile aynı gerekçe). SQL tarafı CONVERT(char(10), x, 23) döndürür.
const pad2 = (n) => String(n).padStart(2, '0');
const localYmd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function ymdUtc(s) { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDaysYmd(s, n) {
    const t = new Date(ymdUtc(s) + n * DAY_MS);
    return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
const daysBetween = (a, b) => Math.round((ymdUtc(b) - ymdUtc(a)) / DAY_MS);   // b - a
const trDate = (ymd) => { const [y, m, d] = String(ymd || '').split('-'); return d ? `${d}.${m}.${y}` : ''; };
const validYmd = (ymd) => { const y = parseInt(String(ymd || '').slice(0, 4), 10); return y >= 2000 && y < 2100; };

function renderTemplate(tpl, v) {
    return antiban.applySpintax(tpl || '')
        .replace(/\{ad\}/gi, v.ad || '')
        .replace(/\{unvan\}/gi, v.ad || '')
        .replace(/\{firma\}/gi, v.firma || v.ad || '')
        .replace(/\{kod\}/gi, v.kod || '')
        .replace(/\{odenen\}/gi, v.odenen || '')
        .replace(/\{tarih\}/gi, v.tarih || '')
        .replace(/\{evrak\}/gi, v.evrak || '')
        .replace(/\{odemeTuru\}/gi, v.odemeTuru || '')
        .replace(/\{kalan\}/gi, v.kalan || '')
        .replace(/\{kalanTaksit\}/gi, v.kalanTaksit == null ? '' : String(v.kalanTaksit))
        .replace(/\{sonrakiVade\}/gi, v.sonrakiVade || '')
        .replace(/\{sonrakiTutar\}/gi, v.sonrakiTutar || '')
        .replace(/\{gecikenTaksit\}/gi, v.gecikenTaksit == null ? '' : String(v.gecikenTaksit))
        .replace(/\{gecikenTutar\}/gi, v.gecikenTutar || '')
        .replace(/\{enEskiVade\}/gi, v.enEskiVade || '')
        .replace(/\{gecikmeGun\}/gi, v.gecikmeGun == null ? '' : String(v.gecikmeGun))
        .replace(/\{taksitListesi\}/gi, v.taksitListesi || '')
        .replace(/\{firmaadi\}/gi, v.firmaadi || '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function tableExists(pool, name) {
    const r = pool.request();
    r.input('tbl', deps.sql.NVarChar, name);
    const res = await r.query(`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME=@tbl`);
    return res.recordset[0].c > 0;
}

async function tableColumns(pool, name) {
    const r = pool.request();
    r.input('tbl', deps.sql.NVarChar, name);
    const res = await r.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@tbl`);
    return new Set(res.recordset.map(x => x.COLUMN_NAME.toUpperCase()));
}

async function readyPool() {
    const pool = deps.getPool();
    if (!pool || !pool.connected) throw new Error('Veritabanı bağlantısı yok.');
    const T = tableName();
    if (!T) throw new Error('Firma/dönem seçilmemiş.');
    if (!(await tableExists(pool, T))) throw new Error(`Bu dönemde ShopStar taksit tablosu yok (${T}).`);
    return { pool, T };
}

// {firmaadi} imzası — 6 saat cache.
let bizFirmaCache = { no: null, name: '', at: 0 };
async function getBizFirma() {
    if (!config.firmaNo || typeof deps.getFirmaName !== 'function') return '';
    const now = Date.now();
    if (bizFirmaCache.no === config.firmaNo && (now - bizFirmaCache.at) < 6 * 60 * 60 * 1000) return bizFirmaCache.name;
    try {
        const name = (await deps.getFirmaName(config.firmaNo)) || '';
        bizFirmaCache = { no: config.firmaNo, name, at: now };
        return name;
    } catch { return bizFirmaCache.name || ''; }
}

// ─── Taksit planı (IZAHAT=100) ───────────────────────────────────────────────
// Map<musteriNo, { kalan, open:[{vade,tutar}], overdue:[...], next }>
async function fetchPlans(pool, T, ids) {
    const map = new Map();
    const idNums = [...new Set((ids || []).map(n => parseInt(n, 10)).filter(Number.isFinite))];
    if (!idNums.length) return map;
    const today = localYmd();
    // IN listesi parçalı: binlerce müşteride sorgu sınırına takılmasın.
    for (let i = 0; i < idNums.length; i += 800) {
        const part = idNums.slice(i, i + 800);
        const rows = (await pool.request().query(`
            SELECT MUSTERINO, CONVERT(char(10), TARIH, 23) AS VADE, CAST(TUTAR AS decimal(18,2)) AS TUTAR
            FROM [${T}]
            WHERE IZAHAT = 100 AND ISNULL(TUTAR, 0) <> 0 AND MUSTERINO IN (${part.join(',')})
            ORDER BY MUSTERINO, TARIH, IND`)).recordset;
        for (const r of rows) {
            let p = map.get(r.MUSTERINO);
            if (!p) { p = { kalan: 0, open: [], overdue: [], next: null }; map.set(r.MUSTERINO, p); }
            const tutar = Number(r.TUTAR) || 0;
            p.kalan += tutar;
            if (tutar <= 0.009 || !validYmd(r.VADE)) continue;
            const it = { vade: r.VADE, tutar };
            p.open.push(it);
            if (r.VADE < today) p.overdue.push(it);
        }
    }
    for (const p of map.values()) {
        p.kalan = Math.round(p.kalan * 100) / 100;
        p.next = p.open[0] || null;
    }
    return map;
}

function listLines(items, max = 12) {
    const lines = items.slice(0, max).map(it => `• ${trDate(it.vade)} — ${fmtAmount(it.tutar)} TL`);
    if (items.length > max) lines.push(`• … ${items.length - max} taksit daha`);
    return lines.join('\n');
}

function planVars(plan) {
    const p = plan || { kalan: 0, open: [], overdue: [], next: null };
    const eldest = p.overdue[0] || null;
    return {
        kalan: fmtAmount(Math.max(0, p.kalan)),
        kalanTaksit: p.open.length,
        sonrakiVade: p.next ? trDate(p.next.vade) : '',
        sonrakiTutar: p.next ? fmtAmount(p.next.tutar) : '',
        gecikenTaksit: p.overdue.length,
        gecikenTutar: fmtAmount(p.overdue.reduce((s, x) => s + x.tutar, 0)),
        enEskiVade: eldest ? trDate(eldest.vade) : '',
        gecikmeGun: eldest ? daysBetween(eldest.vade, localYmd()) : 0,
    };
}

// ─── Ortak alıcı kontrolleri ─────────────────────────────────────────────────
// null = gönderilebilir; aksi halde atlama sebebi.
function recipientBlock(contact) {
    if (!contact || contact.missing) return 'Cari kartı bulunamadı';
    if (contact.pasif) return 'Cari pasif (STATUS=2)';
    if (config.onlySmsGonder && !contact.smsGonder) return '"SMS Gönder" izni yok';
    if (!contact.phone || !contact.valid) return 'Geçerli telefon yok';
    if (targetPhones(contact).length) return null;
    const optedOut = (p) => typeof deps.isOptedOut === 'function' && deps.isOptedOut(p);
    return optedOut(contact.phone) ? 'DUR listesinde' : 'Üst üste yanıt yok (dinlendiriliyor)';
}

// Mesajın gideceği numaralar. "Tüm numaralara gönder" açıksa karttaki bütün geçerli
// numaralar (TELEFON1/2/3…), kapalıysa yalnız birincil numara. DUR listesindeki ve
// dinlendirilen numaralar her durumda çıkarılır.
function targetPhones(contact) {
    if (!contact || !contact.phone || !contact.valid) return [];
    const all = config.sendAllPhones && Array.isArray(contact.phones) && contact.phones.length
        ? contact.phones : [contact.phone];
    return [...new Set(all)].filter(p =>
        !(typeof deps.isOptedOut === 'function' && deps.isOptedOut(p)) &&
        !(typeof deps.isSuspended === 'function' && deps.isSuspended(p)));
}

async function resolveContacts(ids) {
    let map = new Map();
    try { map = await deps.resolveCariContacts(config.firmaNo, ids); }
    catch (e) { console.error('[ShopStar] cari çözümlenemedi:', e.message); }
    return map;
}

// Hedef numaraların hepsine sırayla gönderir. En az biri giderse başarılı sayılır
// (defter işaretlenir; tek numara hatası müşteriye ikinci turda mükerrer mesaj açmasın).
// { ok, phones:[gidenler], error? } | { ok:false, status, error, transient }
async function sendText(contact, text) {
    const phones = targetPhones(contact);
    const sent = [], errors = [];
    let transient = false;
    for (const phone of phones) {
        if (sent.length || errors.length) await sleep(rand(2000, 5000));
        if (config.verifyOnWhatsApp !== false) {
            const chk = await deps.checkOnWhatsApp(phone);
            if (!chk.exists) {
                if (chk.transient) transient = true;
                errors.push(`${phone}: ${chk.transient ? 'WhatsApp doğrulaması geçici hata' : 'WhatsApp kullanıcısı değil'}`);
                continue;
            }
        }
        const res = await deps.waSend(phone, text, null, { simulateTyping: true, typingMs: rand(1200, 2400), channel: CHANNEL });
        if (res.success) sent.push(phone);
        else { transient = true; errors.push(`${phone}: ${res.error || 'Gönderilemedi'}`); }
    }
    if (sent.length) return { ok: true, phones: sent, error: errors.length ? errors.join(' • ') : undefined };
    const error = phones.length > 1 ? errors.join(' • ') : (errors[0] || 'Gönderilemedi').replace(/^[^:]+: /, '');
    return transient
        ? { ok: false, status: 'failed', error, transient: true }
        : { ok: false, status: 'notOnWhatsApp', error };
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAHSİLAT BİLDİRİMİ
// ═══════════════════════════════════════════════════════════════════════════
const payKey = (row) => `F${config.firmaNo}:${row.musteri}:${String(row.evrak || '').trim()}:${Number(row.odenen).toFixed(2)}:${row.bordroInd || ''}`;

function prunePaySent() {
    const cut = Date.now() - SENT_WINDOW_MS;
    for (const k of Object.keys(state.paySent || {})) {
        if (new Date(state.paySent[k]).getTime() < cut) delete state.paySent[k];
    }
}

// Yeni satırları kuyruğa al, filigranı ilerlet.
async function scanPayments(pool, T) {
    const P = prefix();
    const cols = await tableColumns(pool, T);
    const islemExpr = cols.has('ISLEMTARIHI') ? 'COALESCE(ISLEMTARIHI, FATURATARIHI)' : 'FATURATARIHI';

    if (state.wm[P] == null) {
        // İlk tarama: geçmiş tahsilatlara mesaj atılmasın → filigran en sona.
        const r = await pool.request().query(`SELECT ISNULL(MAX(IND), 0) AS M FROM [${T}]`);
        state.wm[P] = r.recordset[0].M;
        saveState();
        console.log(`[ShopStar] ${T} filigranı ${state.wm[P]} — bundan sonraki tahsilatlar bildirilecek`);
        return 0;
    }

    const req = pool.request();
    req.input('wm', deps.sql.Int, state.wm[P]);
    const rows = (await req.query(`
        SELECT TOP ${SCAN_BATCH} IND, MUSTERINO, IZAHAT, EVRAKNO,
               CAST(ODENEN AS decimal(18,2)) AS ODENEN, CAST(BAKIYE AS decimal(18,2)) AS BAKIYE,
               BORDROIND, CONVERT(char(10), ${islemExpr}, 23) AS ISLEMYMD
        FROM [${T}] WHERE IND > @wm ORDER BY IND`)).recordset;
    if (!rows.length) return 0;

    const wantIzahat = new Set(PAY_TYPES.filter(t => config.payment.types[t.id]).map(t => t.izahat));
    const today = localYmd();
    let added = 0;
    for (const r of rows) {
        if (!wantIzahat.has(r.IZAHAT)) continue;
        const odenen = Number(r.ODENEN) || 0;
        if (odenen < MIN_PAY || r.MUSTERINO == null) continue;
        const item = {
            ind: r.IND, musteri: r.MUSTERINO, izahat: r.IZAHAT,
            evrak: (r.EVRAKNO || '').trim(), odenen, bakiye: r.BAKIYE == null ? null : Number(r.BAKIYE),
            bordroInd: r.BORDROIND || null, tarih: r.ISLEMYMD || today,
            prefix: P, foundAt: new Date().toISOString(),
        };
        // Geçmiş tarihli toplu havale aktarımı gibi eski işlemleri bildirme.
        if (validYmd(item.tarih) && daysBetween(item.tarih, today) > PAY_MAX_AGE_DAYS) continue;
        if (state.paySent[payKey(item)]) continue;
        if (state.payQueue.some(q => payKey(q) === payKey(item))) continue;
        state.payQueue.push(item);
        added++;
    }
    state.wm[P] = rows[rows.length - 1].IND;
    saveState();
    return added;
}

async function processPayQueue(pool, T, { manual = false } = {}) {
    let sent = 0, skipped = 0, waiting = 0, stopReason = null;
    const P = prefix();
    const now = Date.now();

    // Başka döneme ait ya da çok bekleyen kalemleri at.
    state.payQueue = state.payQueue.filter(q => {
        if (q.prefix !== P) return false;
        if (now - new Date(q.foundAt).getTime() > PAY_QUEUE_MAX_AGE_MS) {
            pushLog({ kind: 'payment', ind: q.musteri, status: 'cleared', odenen: fmtAmount(q.odenen), evrak: q.evrak, error: 'Kuyrukta 2 günden uzun kaldı — bildirilmedi' });
            return false;
        }
        return true;
    });

    const ready = state.payQueue.filter(q => manual || now - new Date(q.foundAt).getTime() >= SETTLE_MS);
    waiting = state.payQueue.length - ready.length;
    if (!ready.length) { saveState(); return { sent, skipped, waiting }; }

    // Müşteri başına grupla: aynı turdaki çoklu tahsilat tek mesaj.
    const groups = new Map();
    for (const q of ready) {
        if (!groups.has(q.musteri)) groups.set(q.musteri, []);
        groups.get(q.musteri).push(q);
    }
    const ids = [...groups.keys()];
    const contacts = await resolveContacts(ids);
    const plans = await fetchPlans(pool, T, ids);
    const bizFirma = await getBizFirma();

    for (const [musteri, items] of groups) {
        if (!deps.waStatus().ready) { stopReason = 'WhatsApp bağlı değil'; break; }
        if (!manual && antiban.inQuietHours()) { stopReason = antiban.quietReason(); break; }
        const g = gateSend();
        if (!g.ok) { stopReason = g.reason; break; }

        const contact = contacts.get(musteri) || { missing: true };
        const odenen = items.reduce((s, x) => s + x.odenen, 0);
        const plan = plans.get(musteri);
        const last = items[items.length - 1];
        const pv = planVars(plan);
        // Plan yoksa (hiç açık taksit kalmadı ya da okunamadı) tahsilat satırının BAKIYE'si yedek.
        const kalanNum = plan ? plan.kalan : (last.bakiye != null ? last.bakiye : 0);
        const vars = {
            ad: contact.name, firma: contact.firma || contact.name, kod: contact.kod,
            odenen: fmtAmount(odenen), tarih: trDate(last.tarih),
            evrak: items.map(x => x.evrak).filter(Boolean).join(', '),
            odemeTuru: [...new Set(items.map(x => (PAY_TYPES.find(t => t.izahat === x.izahat) || {}).label).filter(Boolean))].join(' + '),
            ...pv, kalan: fmtAmount(Math.max(0, kalanNum)),
            taksitListesi: plan ? listLines(plan.open) : '',
            firmaadi: bizFirma,
        };
        const logBase = { kind: 'payment', ind: musteri, name: contact.name, firma: contact.firma, kod: contact.kod, phone: contact.phone || '', odenen: vars.odenen, kalan: vars.kalan, evrak: vars.evrak };
        const done = (status) => {
            const at = new Date().toISOString();
            for (const x of items) state.paySent[payKey(x)] = at;
            state.payQueue = state.payQueue.filter(q => !items.includes(q));
            saveState();
            if (status !== 'sent') skipped++;
        };

        if (odenen < (config.payment.minAmount || 0)) { done('skipped'); continue; }
        const block = recipientBlock(contact);
        if (block) { done('skipped'); pushLog({ ...logBase, status: 'skipped', error: block }); continue; }

        const paidOff = kalanNum <= 0.009;
        const tpl = paidOff ? (config.payment.paidOffTemplate || DEFAULT_PAIDOFF_TEMPLATE) : (config.payment.template || DEFAULT_PAY_TEMPLATE);
        const text = renderTemplate(tpl, vars);
        const res = await sendText(contact, text);
        if (res.ok) {
            sent++;
            done('sent');
            pushLog({ ...logBase, phone: res.phones.join(', '), status: 'sent', message: text, error: res.error });
        } else if (res.transient) {
            // Geçici hata: kuyrukta kalsın, sonraki turda yeniden denensin.
            if (!deps.waStatus().ready) { stopReason = 'WhatsApp bağlantısı koptu'; break; }
            const attempts = Math.max(...items.map(x => (x.attempts = (x.attempts || 0) + 1)));
            if (attempts >= 5) {
                done('failed');
                pushLog({ ...logBase, status: 'failed', error: `${res.error} (5 deneme sonrası vazgeçildi)` });
            } else {
                saveState();
                pushLog({ ...logBase, status: 'failed', error: `${res.error} — tekrar denenecek` });
                skipped++;
            }
        } else {
            done('skipped');
            pushLog({ ...logBase, status: res.status, error: res.error });
        }
        await sleep(rand(8000, 20000));
    }
    return { sent, skipped, waiting, stopReason };
}

async function paymentTick() {
    if (!config.payment.enabled) return;
    const { pool, T } = await readyPool();
    prunePaySent();
    const found = await scanPayments(pool, T);
    const r = await processPayQueue(pool, T);
    const bits = [];
    if (found) bits.push(`${found} yeni tahsilat`);
    if (r.sent) bits.push(`${r.sent} bildirildi`);
    if (r.skipped) bits.push(`${r.skipped} atlandı`);
    if (r.waiting) bits.push(`${r.waiting} bekliyor`);
    if (r.stopReason) bits.push(`durdu: ${r.stopReason}`);
    if (bits.length || !lastPayResult) lastPayResult = { note: bits.join(', ') || 'Yeni tahsilat yok', at: new Date().toISOString() };
}

// ═══════════════════════════════════════════════════════════════════════════
//  GECİKEN TAKSİT HATIRLATMASI
// ═══════════════════════════════════════════════════════════════════════════
const custKey = (ind) => `${config.firmaNo}:${ind}`;

// Adaylar: en eski açık taksiti graceDays'ten fazla gecikmiş ama maxAgeDays'ten yeni.
// En eski gecikmesi maxAgeDays'i aşan müşteri tümden atlanır (bayat kayıt / hukuki takip);
// yalnız o eski satırı yok sayıp yeni taksitleri hatırlatmak "16.01.2025 vadeli…" gibi
// yanıltıcı mesaj üretirdi.
async function overdueCandidates(pool, T) {
    const o = config.overdue;
    const today = localYmd();
    const cut = addDaysYmd(today, -Math.max(0, parseInt(o.graceDays, 10) || 0));
    const old = addDaysYmd(today, -Math.max(1, parseInt(o.maxAgeDays, 10) || 365));
    const req = pool.request();
    req.input('cut', deps.sql.NVarChar, cut);
    req.input('old', deps.sql.NVarChar, old);
    const rows = (await req.query(`
        SELECT DISTINCT MUSTERINO FROM [${T}]
        WHERE IZAHAT = 100 AND TUTAR > 0.009 AND MUSTERINO IS NOT NULL
          AND TARIH < CAST(@cut AS date) AND TARIH >= CAST(@old AS date)`)).recordset;
    // SQL ön süzgeç: penceresinde gecikmesi olan müşteri. Kesin karar en eski gecikmeye göre aşağıda.
    const ids = rows.map(r => r.MUSTERINO);
    const plans = await fetchPlans(pool, T, ids);
    const out = [];
    for (const ind of ids) {
        const plan = plans.get(ind);
        if (!plan || plan.kalan <= 0.009 || !plan.overdue.length) continue;   // alacaklı / kapanmış
        const eldest = plan.overdue[0].vade;
        if (eldest < old || eldest >= cut) continue;
        const overdueSum = plan.overdue.reduce((s, x) => s + x.tutar, 0);
        out.push({ ind, plan, overdueSum });
    }
    // En uzun gecikenden başla.
    out.sort((a, b) => (a.plan.overdue[0].vade < b.plan.overdue[0].vade ? -1 : 1));
    return out;
}

function overdueSkip(c, contact, { manual = false } = {}) {
    const o = config.overdue;
    if (c.overdueSum < (o.minAmount || 0)) return `Geciken tutar ${fmtAmount(o.minAmount)} TL altında`;
    const last = state.overdueSent[custKey(c.ind)];
    const rep = Math.max(1, parseInt(o.repeatDays, 10) || 7);
    if (last && Date.now() - new Date(last).getTime() < rep * DAY_MS) return `Son ${rep} günde hatırlatıldı`;
    if (!manual && state.overdueTried[custKey(c.ind)]) return 'Daha önce denendi (numara/WA sorunu)';
    return recipientBlock(contact);
}

function overdueText(c, contact, bizFirma) {
    const pv = planVars(c.plan);
    return renderTemplate(config.overdue.template || DEFAULT_OVERDUE_TEMPLATE, {
        ad: contact.name, firma: contact.firma || contact.name, kod: contact.kod,
        ...pv, taksitListesi: listLines(c.plan.overdue), firmaadi: bizFirma,
    });
}

async function runOverdue({ manual = false } = {}) {
    const { pool, T } = await readyPool();
    if (!deps.waStatus().ready) return { aborted: true, reason: 'WhatsApp bağlı değil' };
    const cands = await overdueCandidates(pool, T);
    const contacts = await resolveContacts(cands.map(c => c.ind));
    const bizFirma = await getBizFirma();
    let sent = 0, skipped = 0, interrupted = false, stopReason = null;

    for (const c of cands) {
        if (!deps.waStatus().ready) { interrupted = true; stopReason = 'WhatsApp bağlı değil'; break; }
        if (!manual && antiban.inQuietHours()) { interrupted = true; stopReason = antiban.quietReason(); break; }
        const g = gateSend();
        if (!g.ok) { interrupted = true; stopReason = g.reason; break; }

        const contact = contacts.get(c.ind) || { missing: true };
        const skip = overdueSkip(c, contact, { manual });
        if (skip) { skipped++; continue; }

        const text = overdueText(c, contact, bizFirma);
        const pv = planVars(c.plan);
        const logBase = { kind: 'overdue', ind: c.ind, name: contact.name, firma: contact.firma, kod: contact.kod, phone: contact.phone || '', geciken: pv.gecikenTutar, gecikmeGun: pv.gecikmeGun, kalan: pv.kalan };
        const res = await sendText(contact, text);
        const nowIso = new Date().toISOString();
        if (res.ok) {
            sent++;
            state.overdueSent[custKey(c.ind)] = nowIso;
            delete state.overdueTried[custKey(c.ind)];
            pushLog({ ...logBase, phone: res.phones.join(', '), status: 'sent', message: text, error: res.error });
        } else {
            skipped++;
            if (res.transient && !deps.waStatus().ready) { interrupted = true; stopReason = 'WhatsApp bağlantısı koptu'; break; }
            // Kalıcı sorun (WA yok / gönderim hatası) → otomatik tekrar deneme; önizlemeden elle gönderilebilir.
            state.overdueTried[custKey(c.ind)] = { status: res.status, at: nowIso, error: res.error };
            pushLog({ ...logBase, status: res.status, error: res.error });
        }
        saveState();
        // Tahsilat mesajı yüksek risk: insansı tempo, her 20 mesajda uzun mola.
        if (res.ok && sent % 20 === 0) await sleep(rand(60000, 150000));
        else await sleep(rand(12000, 30000));
    }
    const note = `${sent} gönderildi${skipped ? `, ${skipped} atlandı` : ''}${interrupted ? ` (durdu: ${stopReason})` : ''}`;
    lastOverdueResult = { note, at: new Date().toISOString() };
    return { sent, skipped, total: cands.length, interrupted, stopReason, note };
}

// Günlük pencere: saat geldiyse ve bugün tamamlanmadıysa çalış. Tavan/saat yüzünden
// yarıda kalan tur sonraki dakikada sürer; müşteri başı defter tekrar göndermeyi önler.
function overdueDueReason(now = new Date()) {
    const o = config.overdue;
    if (!o.enabled) return 'kapalı';
    if (state.overdueRunDate === localYmd(now)) return 'bugün tamamlandı';
    const [h, m] = String(o.sendTime || '10:00').split(':').map(Number);
    const target = new Date(now); target.setHours(h || 0, m || 0, 0, 0);
    if (now < target) return `saati gelmedi (${o.sendTime})`;
    // Gönderim penceresi (Ayarlar → gönderim gün/saatleri) dışındaysa tur başlamaz.
    if (antiban.inQuietHours(now)) return antiban.quietReason(now);
    return null;
}

async function overdueTick() {
    const why = overdueDueReason();
    if (why) {
        if (config.overdue.enabled && !lastOverdueResult) lastOverdueResult = { note: why, at: new Date().toISOString() };
        return;
    }
    const r = await runOverdue();
    if (r && !r.aborted && !r.interrupted) { state.overdueRunDate = localYmd(); saveState(); }
}

// ─── Zamanlayıcı ────────────────────────────────────────────────────────────────
async function tick() {
    if (ticking) return;
    ticking = true;
    lastTickAt = new Date().toISOString();
    lastError = null;
    try {
        if (!config.payment.enabled && !config.overdue.enabled) return;
        try { await paymentTick(); }
        catch (e) { lastError = e.message; console.error('[ShopStar] tahsilat tarama:', e.message); }
        try { await overdueTick(); }
        catch (e) { lastError = e.message; console.error('[ShopStar] geciken taksit:', e.message); }
    } finally { ticking = false; }
}

function start() {
    stop();
    tick();
    timer = setInterval(tick, 60 * 1000);
    if (timer.unref) timer.unref();
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }
function autoStart() { start(); }   // zamanlayıcı hep çalışır; enabled bayrakları kapı

// ─── Ayarlar / durum ─────────────────────────────────────────────────────────
function getConfig() { return clone(config); }

function setConfig(patch) {
    const prevPrefix = prefix();
    const next = mergeConfig({ ...config, ...patch,
        payment: { ...config.payment, ...(patch.payment || {}), types: { ...config.payment.types, ...((patch.payment || {}).types || {}) } },
        overdue: { ...config.overdue, ...(patch.overdue || {}) },
    });
    const o = next.overdue;
    o.graceDays = Math.max(0, parseInt(o.graceDays, 10) || 0);
    o.repeatDays = Math.max(1, parseInt(o.repeatDays, 10) || 7);
    o.maxAgeDays = Math.max(1, parseInt(o.maxAgeDays, 10) || 365);
    o.minAmount = Math.max(0, Number(o.minAmount) || 0);
    if (!/^\d{1,2}:\d{2}$/.test(o.sendTime || '')) o.sendTime = '10:00';
    next.payment.minAmount = Math.max(0, Number(next.payment.minAmount) || 0);
    config = next;
    saveConfig();
    // Dönem değiştiyse o dönemin kuyruğu geçersiz; filigran dönem başına ayrı tutulur.
    if (prevPrefix !== prefix()) { state.payQueue = []; saveState(); }
    return getStatus();
}

function getStatus() {
    return {
        firmaNo: config.firmaNo, donemNo: config.donemNo, table: tableName(),
        verifyOnWhatsApp: config.verifyOnWhatsApp !== false,
        onlySmsGonder: config.onlySmsGonder === true,
        sendAllPhones: config.sendAllPhones === true,
        payment: { ...config.payment },
        overdue: { ...config.overdue },
        payQueue: state.payQueue.length,
        watermark: prefix() ? (state.wm[prefix()] ?? null) : null,
        overdueDue: overdueDueReason(),
        overdueRunDate: state.overdueRunDate,
        lastTickAt, lastError, lastPayResult, lastOverdueResult,
    };
}
function getLog() { return log; }

// ─── Önizleme (GÖNDERMEZ) ────────────────────────────────────────────────────
async function previewOverdue() {
    const { pool, T } = await readyPool();
    const cands = await overdueCandidates(pool, T);
    const contacts = await resolveContacts(cands.map(c => c.ind));
    const bizFirma = await getBizFirma();
    let willSend = 0;
    const rows = cands.map(c => {
        const contact = contacts.get(c.ind) || { missing: true };
        const skip = overdueSkip(c, contact);
        if (!skip) willSend++;
        const pv = planVars(c.plan);
        return {
            ind: c.ind, name: contact.name || String(c.ind), kod: contact.kod || '',
            phone: targetPhones(contact).join(', ') || contact.phone || '', valid: !!contact.valid,
            gecikenTaksit: pv.gecikenTaksit, gecikenTutar: pv.gecikenTutar, gecikmeGun: pv.gecikmeGun,
            enEskiVade: pv.enEskiVade, kalan: pv.kalan,
            willSend: !skip, skipReason: skip, message: overdueText(c, contact, bizFirma),
        };
    });
    rows.sort((a, b) => (a.willSend === b.willSend ? 0 : (a.willSend ? -1 : 1)));
    return { total: cands.length, willSend, rows };
}

// Son tahsilatlar ve bunlara gidecek (ya da gidecek olan) mesaj — filigrana bakmaz.
async function previewPayments(limit = 20) {
    const { pool, T } = await readyPool();
    const cols = await tableColumns(pool, T);
    const islemExpr = cols.has('ISLEMTARIHI') ? 'COALESCE(ISLEMTARIHI, FATURATARIHI)' : 'FATURATARIHI';
    const izahats = PAY_TYPES.filter(t => config.payment.types[t.id]).map(t => t.izahat);
    if (!izahats.length) return { rows: [] };
    const rows = (await pool.request().query(`
        SELECT TOP ${Math.min(100, Math.max(1, limit))} IND, MUSTERINO, IZAHAT, EVRAKNO,
               CAST(ODENEN AS decimal(18,2)) AS ODENEN, CAST(BAKIYE AS decimal(18,2)) AS BAKIYE,
               BORDROIND, CONVERT(char(10), ${islemExpr}, 23) AS ISLEMYMD
        FROM [${T}] WHERE IZAHAT IN (${izahats.join(',')}) AND ODENEN >= ${MIN_PAY}
        ORDER BY IND DESC`)).recordset;
    const ids = rows.map(r => r.MUSTERINO);
    const contacts = await resolveContacts(ids);
    const plans = await fetchPlans(pool, T, ids);
    const bizFirma = await getBizFirma();
    const wm = state.wm[prefix()];
    return {
        watermark: wm ?? null,
        rows: rows.map(r => {
            const contact = contacts.get(r.MUSTERINO) || { missing: true };
            const plan = plans.get(r.MUSTERINO);
            const kalanNum = plan ? plan.kalan : (r.BAKIYE != null ? Number(r.BAKIYE) : 0);
            const vars = {
                ad: contact.name, firma: contact.firma || contact.name, kod: contact.kod,
                odenen: fmtAmount(r.ODENEN), tarih: trDate(r.ISLEMYMD), evrak: (r.EVRAKNO || '').trim(),
                odemeTuru: (PAY_TYPES.find(t => t.izahat === r.IZAHAT) || {}).label || '',
                ...planVars(plan), kalan: fmtAmount(Math.max(0, kalanNum)),
                taksitListesi: plan ? listLines(plan.open) : '', firmaadi: bizFirma,
            };
            const paidOff = kalanNum <= 0.009;
            const item = { musteri: r.MUSTERINO, evrak: vars.evrak, odenen: Number(r.ODENEN), bordroInd: r.BORDROIND || null };
            return {
                ind: r.MUSTERINO, name: contact.name || String(r.MUSTERINO), phone: targetPhones(contact).join(', ') || contact.phone || '',
                odenen: vars.odenen, tarih: vars.tarih, tur: vars.odemeTuru, evrak: vars.evrak, kalan: vars.kalan,
                kalanTaksit: vars.kalanTaksit,
                block: recipientBlock(contact),
                bildirildi: !!state.paySent[payKey(item)],
                eski: wm != null && r.IND <= wm,
                message: renderTemplate(paidOff ? config.payment.paidOffTemplate : config.payment.template, vars),
            };
        }),
    };
}

// ShopStar verisi (açık taksit planı) olan en son firma/dönem — ilk açılışta seçici
// boş kalmasın diye. Tablo her dönemde şablon olarak var ama çoğu boş (ör. VEGADBDEF).
async function detectDefault() {
    const pool = deps.getPool();
    if (!pool || !pool.connected) return null;
    const tbls = (await pool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE 'F[0-9][0-9][0-9][0-9]D[0-9][0-9][0-9][0-9]TBLWSTAKSITLISATIS'
        ORDER BY TABLE_NAME DESC`)).recordset.map(r => r.TABLE_NAME);
    // Son işlemi en yeni olan tablo = asıl çalışan firma/dönem. Ad sırası yanıltır
    // (özdemirkaya'da F0106D0003 küçük bir yan firma); satır sayısı da yanıltır (eski
    // dönemler de tam plan taşıyor). Tarih metin (YYYY-MM-DD) → doğrudan karşılaştırılır.
    let best = null;
    for (const t of tbls.slice(0, 80)) {
        const r = await pool.request().query(`
            SELECT CONVERT(char(10), MAX(FATURATARIHI), 23) AS SON,
                   (SELECT COUNT(*) FROM [${t}] WHERE IZAHAT = 100 AND TUTAR > 0) AS N
            FROM [${t}] WHERE FATURATARIHI < DATEADD(day, 1, GETDATE())`);
        const { SON: son, N: n } = r.recordset[0] || {};
        if (!n || !son) continue;
        if (!best || son > best.son || (son === best.son && n > best.n)) best = { t, n, son };
    }
    return best ? { firmaNo: best.t.slice(1, 5), donemNo: best.t.slice(6, 10) } : null;
}

// Tek müşteriye geciken taksit hatırlatmasını ŞİMDİ gönder (önizlemeden).
async function sendOverdueOne(ind) {
    const { pool, T } = await readyPool();
    if (!deps.waStatus().ready) return { success: false, message: 'WhatsApp bağlı değil' };
    const indNum = parseInt(ind, 10);
    const plan = (await fetchPlans(pool, T, [indNum])).get(indNum);
    if (!plan || !plan.overdue.length || plan.kalan <= 0.009) return { success: false, message: 'Geciken taksit yok' };
    const contact = (await resolveContacts([indNum])).get(indNum) || { missing: true };
    const block = recipientBlock(contact);
    if (block) return { success: false, message: block };
    const text = overdueText({ ind: indNum, plan }, contact, await getBizFirma());
    const res = await sendText(contact, text);
    const pv = planVars(plan);
    const logBase = { kind: 'overdue', ind: indNum, name: contact.name, firma: contact.firma, kod: contact.kod, phone: contact.phone, geciken: pv.gecikenTutar, gecikmeGun: pv.gecikmeGun, kalan: pv.kalan, manual: true };
    if (res.ok) {
        state.overdueSent[custKey(indNum)] = new Date().toISOString();
        delete state.overdueTried[custKey(indNum)];
        saveState();
        pushLog({ ...logBase, phone: res.phones.join(', '), status: 'sent', message: text, error: res.error });
        return { success: true, message: 'Gönderildi' };
    }
    pushLog({ ...logBase, status: res.status, error: res.error });
    return { success: false, message: res.error };
}

// Test: şablonu gerçek bir müşterinin verisiyle doldurup KULLANICININ girdiği numaraya yollar.
async function sendTest(kind, phoneRaw) {
    const phone = normalizePhone(phoneRaw || '');
    if (!isLikelyValid(phone)) return { success: false, message: 'Geçerli bir test numarası girin.' };
    if (!deps.waStatus().ready) return { success: false, message: 'WhatsApp bağlı değil.' };
    let text = null;
    try {
        if (kind === 'overdue') {
            const p = await previewOverdue();
            if (p.rows.length) text = p.rows[0].message;
        } else {
            const p = await previewPayments(1);
            if (p.rows.length) text = p.rows[0].message;
        }
    } catch (e) { return { success: false, message: e.message }; }
    if (!text) return { success: false, message: kind === 'overdue' ? 'Geciken taksitli müşteri bulunamadı.' : 'Bu dönemde tahsilat bulunamadı.' };
    text = '🔔 TEST MESAJI — gerçek bildirim değildir\n' + text;
    const res = await deps.waSend(phone, text, null, { simulateTyping: false, channel: 'manual' });
    pushLog({ kind, phone, status: res.success ? 'sent' : 'failed', message: text, error: res.success ? 'Test mesajı' : `Test — ${res.error}` });
    return res.success ? { success: true, message: 'Test mesajı gönderildi.' } : { success: false, message: res.error || 'Gönderilemedi.' };
}

module.exports = {
    configure, autoStart, start, stop, tick,
    getConfig, setConfig, getStatus, getLog,
    previewOverdue, previewPayments, sendOverdueOne, sendTest, detectDefault,
    runOverdueNow: () => runOverdue({ manual: true }),
};
