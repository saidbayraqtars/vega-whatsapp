// ═══════════════════════════════════════════════════════════════════════════
//  Otomatik Tahsilat Bildirimi (payment-watcher)
//  VegaDB cari hareket tablosunu periyodik tarar; yeni tahsilat (ALACAK>0,
//  izlenen IZAHAT kodu) satırı bulunca ilgili cariye otomatik WhatsApp atar.
//
//  Tablo: F{firmaNo}D{donemNo}TBLCARIHAREKETLERI
//    • IND        artan PK  → "yeni satır" watermark'ı
//    • FIRMANO    = TBLCARI.IND (cari bağlantısı)
//    • ALACAK     tahsilat tutarı (müşteri ödedi, borcu düştü)
//    • IZAHAT     hareket tipi kodu (nvarchar)
//    • TARIH/EVRAKNO/BAKIYE/PARABIRIMI bilgilendirme alanları
//
//  DİKKAT: ALACAK>0 her zaman tahsilat değildir (gerçek veri doğrulandı, 2026-06):
//    • Alış/e-faturası girişi cariye ALACAK satırı yazar (EVRAKNO = fatura
//      başlığının BELGENO'su → TBLALFATBASLIK/TBLSATFATBASLIK'ta kayıtlı).
//    • Peşin fatura/fiş aynı EVRAKNO ile BORC (fatura) + ALACAK (otomatik
//      ödeme) çifti yazar.
//  Bu satırlar fatura girişidir, tahsilat fişi değil → mesaj atılmaz (sorguda
//  NOT EXISTS ile elenir). Gerçek tahsilat = cari giriş/kasa/visa fişleri.
//
//  Bağımlılıklar dışarıdan enjekte edilir (server.js ile gevşek bağlı):
//    configure({ getPool, sql, resolveCariContacts, waSend, checkOnWhatsApp, waStatus, baseDir })
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let deps = null;            // { getPool, sql, resolveCariContacts, waSend, checkOnWhatsApp, waStatus, baseDir }
let CONFIG_PATH = null;
let STATE_PATH = null;
let PENDING_PATH = null;    // bağlantı kopunca bekleyen mesajlar (kalıcı kuyruk)
let LOG_PATH = null;        // son gönderim günlüğü (kalıcı — yeniden başlatmada kaybolmasın)
let MEDIA_DIR = null;       // görsel/video data/ altında saklanır

let timer = null;
let polling = false;        // tek seferde tek tarama (reentrancy koruması)
let running = false;        // watcher aktif mi
let lastPollAt = null;
let lastError = null;
let lastResult = null;      // son taramanın özeti

// Devir (yıl başı açılış) kodları — bunlar tahsilat DEĞİL, daima hariç tutulur.
// (Excel + gerçek veri doğrulandı: 103=devir alacak, 104=devir borç.)
const DEVIR_CODES = [103, 104];

const DEFAULT_CONFIG = {
    enabled: false,
    firmaNo: null,           // örn "0102"
    donemNo: null,           // örn "0011"
    intervalSec: 30,
    // Tahsilat = cari ALACAK girişi (gerçek veri + vega_sorgu doğrulandı). Kod→anlam
    // haritası firmalar arası tutarsız olduğu için VARSAYILAN: boş = tüm ALACAK>0
    // (devir hariç). Belirli kodlara daraltmak istenirse buraya yazılır (örn [13,20]).
    izahatCodes: [],
    minAmount: 0,
    template: 'Sayın {ad}, {tutar} TL ödemeniz alınmış ve kaydedilmiştir. Güncel bakiyeniz: {bakiye} TL ({durum}). Teşekkür ederiz.',
    verifyOnWhatsApp: true,
    simulateTyping: true,
    // Cari kartındaki tüm geçerli numaralara (TELEFON1/2/3 vb.) gönder; kapalıysa sadece birincil.
    sendAllPhones: false,
    // Opsiyonel görsel/video: data/ altına kaydedilen dosya. { path, mime, kind, name } | null
    media: null,
};

let config = { ...DEFAULT_CONFIG };
let state = { lastSeenInd: {} };  // tableName -> son işlenen IND
let log = [];                     // son otomatik gönderimler (en yeni başta), tavan 200
let pending = [];                 // gönderilemeyen mesajlar — diskte saklanır, bağlanınca akar

// Kuyruk deneme tavanları: bağlantı yokken sayaç İŞLEMEZ (denenmez bile);
// sayaçlar yalnızca bağlantı varken alınan yanıtlarla artar.
const MAX_VERIFY_ATTEMPTS = 3;  // üst üste bu kadar temiz "WhatsApp'ta yok" yanıtı → kalıcı kabul
const MAX_SEND_ATTEMPTS = 8;    // bağlıyken bu kadar gönderim hatası → vazgeç (failed)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));

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

// ─── Görsel/video (opsiyonel ek) ───────────────────────────────────────────────
function clearMediaFile() {
    if (config.media && config.media.path && MEDIA_DIR) {
        try {
            const f = path.join(MEDIA_DIR, config.media.path);
            if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch (e) { console.error('[Watcher] medya silinemedi:', e.message); }
    }
}

// file = multer dosyası { buffer, mimetype, originalname }
function setMedia(file) {
    if (!file || !file.buffer) return getStatus();
    const mt = file.mimetype || '';
    const kind = mt.startsWith('image/') ? 'image' : mt.startsWith('video/') ? 'video' : 'document';
    let ext = path.extname(file.originalname || '') || (kind === 'image' ? '.jpg' : kind === 'video' ? '.mp4' : '');
    clearMediaFile();
    const fname = `watcher-media${ext}`;
    try { fs.writeFileSync(path.join(MEDIA_DIR, fname), file.buffer); }
    catch (e) { console.error('[Watcher] medya yazılamadı:', e.message); return getStatus(); }
    config.media = { path: fname, mime: mt, kind, name: file.originalname || fname };
    saveConfig();
    return getStatus();
}

function clearMedia() {
    clearMediaFile();
    config.media = null;
    saveConfig();
    return getStatus();
}

// Kayıtlı medyayı waSend formatına oku (yoksa null → düz metin).
function loadMediaForSend() {
    if (!config.media || !config.media.path || !MEDIA_DIR) return null;
    try {
        const f = path.join(MEDIA_DIR, config.media.path);
        if (!fs.existsSync(f)) return null;
        return { kind: config.media.kind, buffer: fs.readFileSync(f), mimetype: config.media.mime, fileName: config.media.name };
    } catch (e) { console.error('[Watcher] medya okunamadı:', e.message); return null; }
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
        }
    } catch (e) { console.error('[Watcher] config okunamadı:', e.message); }
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8'); }
    catch (e) { console.error('[Watcher] config yazılamadı:', e.message); }
}

function loadState() {
    try {
        if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch (e) { console.error('[Watcher] state okunamadı:', e.message); }
    if (!state.lastSeenInd) state.lastSeenInd = {};
}

function saveState() {
    try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8'); }
    catch (e) { console.error('[Watcher] state yazılamadı:', e.message); }
}

function loadPending() {
    try {
        if (fs.existsSync(PENDING_PATH)) {
            const p = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
            if (Array.isArray(p)) pending = p;
        }
    } catch (e) { console.error('[Watcher] kuyruk okunamadı:', e.message); }
}

function savePending() {
    try { fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2), 'utf8'); }
    catch (e) { console.error('[Watcher] kuyruk yazılamadı:', e.message); }
}

function loadLog() {
    try {
        if (fs.existsSync(LOG_PATH)) {
            const l = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
            if (Array.isArray(l)) log = l;
        }
    } catch (e) { console.error('[Watcher] günlük okunamadı:', e.message); }
}

function pushLog(entry) {
    log.unshift({ ...entry, at: new Date().toISOString() });
    if (log.length > 200) log.length = 200;
    try { fs.writeFileSync(LOG_PATH, JSON.stringify(log), 'utf8'); }
    catch { /* günlük diske yazılamazsa bellekte devam */ }
}

// Kuyruğa ekle. ind+phone çifti zaten kuyruktaysa eklenmez (watermark kaydı ile
// kuyruk kaydı arasında çökme olursa satır tekrar taranabilir — çift mesaj engeli).
function enqueue(base, phone, text, reason) {
    if (pending.some(p => p.ind === base.ind && p.phone === phone)) return;
    pending.push({
        ind: base.ind, cariInd: base.cariInd, name: base.name, kod: base.kod,
        tutar: base.tutar, evrak: base.evrak, bakiye: base.bakiye, bakiyeDurum: base.bakiyeDurum,
        phone, text, attempts: 0, noWaCount: 0,
        queuedAt: new Date().toISOString(), lastError: reason,
    });
    savePending();
    pushLog({ ...base, phone, status: 'queued', error: reason, message: text });
}

const pendingBase = (p) => ({
    ind: p.ind, cariInd: p.cariInd, name: p.name, kod: p.kod, phone: p.phone,
    tutar: p.tutar, evrak: p.evrak, bakiye: p.bakiye, bakiyeDurum: p.bakiyeDurum,
});

// Bekleyen kuyruğu boşaltmayı dene. Bağlantı yokken hiç dokunmaz; bağlıyken
// sırayla doğrula+gönder, başaranı kuyruktan düş. Gönderilen adedini döndürür.
async function processPending() {
    if (!pending.length || !deps.waStatus().ready) return 0;
    const media = loadMediaForSend();
    let sentCount = 0;
    for (const item of [...pending]) {
        if (!deps.waStatus().ready) break; // bağlantı yine koptu — kalanlar sonraki taramada
        if (config.verifyOnWhatsApp) {
            const chk = await deps.checkOnWhatsApp(item.phone);
            if (!chk.exists) {
                if (chk.transient) {
                    // Güvenilmez yanıt (bağlantı az önce geldi / sorgu hatası) → sayma, beklet.
                    item.lastError = chk.error || 'Doğrulama yapılamadı';
                    savePending();
                    continue;
                }
                item.noWaCount = (item.noWaCount || 0) + 1;
                if (item.noWaCount >= MAX_VERIFY_ATTEMPTS) {
                    pending = pending.filter(p => p !== item);
                    savePending();
                    pushLog({ ...pendingBase(item), status: 'notOnWhatsApp', error: `WhatsApp kullanıcısı değil (${MAX_VERIFY_ATTEMPTS} doğrulama sonrası)` });
                } else {
                    item.lastError = 'WhatsApp kullanıcısı değil (tekrar doğrulanacak)';
                    savePending();
                }
                continue;
            }
        }
        const res = await deps.waSend(item.phone, item.text, media, {
            simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400),
        });
        if (res.success) {
            pending = pending.filter(p => p !== item);
            savePending();
            sentCount++;
            pushLog({ ...pendingBase(item), status: 'sent', message: item.text });
        } else {
            item.attempts = (item.attempts || 0) + 1;
            item.lastError = res.error;
            if (item.attempts >= MAX_SEND_ATTEMPTS) {
                pending = pending.filter(p => p !== item);
                pushLog({ ...pendingBase(item), status: 'failed', error: `${res.error} (${MAX_SEND_ATTEMPTS} deneme sonrası vazgeçildi)`, message: item.text });
            }
            savePending();
        }
        await sleep(rand(2500, 6000)); // insansı gecikme (toplu boşaltmada da geçerli)
    }
    return sentCount;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
const tableName = () =>
    config.firmaNo && config.donemNo
        ? `F${config.firmaNo}D${config.donemNo}TBLCARIHAREKETLERI`
        : null;

function fmtAmount(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderTemplate(tpl, vars) {
    return String(tpl || '')
        .replace(/\{ad\}/gi, vars.ad || '')
        .replace(/\{unvan\}/gi, vars.ad || '')
        .replace(/\{tutar\}/gi, vars.tutar || '')
        .replace(/\{kod\}/gi, vars.kod || '')
        .replace(/\{evrak\}/gi, vars.evrak || '')
        .replace(/\{tarih\}/gi, vars.tarih || '')
        .replace(/\{bakiye\}/gi, vars.bakiye || '')
        .replace(/\{borc\}/gi, vars.borc || '')      // kalan bakiye = {bakiye} ile aynı (işaretsiz tutar)
        .replace(/\{durum\}/gi, vars.durum || '')    // 'Borç' / 'Alacak' (bakiye 0 ise boş)
        .replace(/ ?\(\s*\)/g, '');                  // bakiye 0 → "({durum})" boş parantez kalmasın
}

async function tableExists(pool, name) {
    const r = pool.request();
    r.input('tbl', deps.sql.NVarChar, name);
    const res = await r.query(`
        SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME=@tbl
    `);
    return res.recordset[0].c > 0;
}

// Fatura başlık tabloları her taramada sorgulanmasın diye varlık bilgisi önbelleğe
// alınır; günde 1 kez tazelenir (uygulama haftalarca açık kalabiliyor — tray).
const SCHEMA_CACHE_MS = 24 * 60 * 60 * 1000;
let tblExistsCache = {};   // name -> { v, at }
async function cachedTableExists(pool, name) {
    const hit = tblExistsCache[name];
    if (hit && Date.now() - hit.at < SCHEMA_CACHE_MS) return hit.v;
    const v = await tableExists(pool, name);
    tblExistsCache[name] = { v, at: Date.now() };
    return v;
}

// Carilerin gerçek kalan borcu: dönem hareket tablosundan SUM(BORC)-SUM(ALACAK)
// (devir satırları dahil → dönem açılışı + tüm hareketler). Vega'nın kendi ekstre
// raporu da bakiyeyi aynı formülle hesaplar: SUM(BORC-ALACAK) per FIRMANO.
// Pozitif = cari bize borçlu, negatif = biz cariye borçluyuz (gerçek DB doğrulandı).
// TBLCARI.BAKIYE Vega tarafından gecikmeli güncellenebildiği için ödeme anında eski
// değeri verebiliyor; hareket toplamı, az önce okunan ödeme satırıyla her zaman tutarlıdır.
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

// ─── Çekirdek: tek tarama ──────────────────────────────────────────────────────
async function pollOnce() {
    if (polling) return;
    polling = true;
    lastPollAt = new Date().toISOString();
    lastError = null;
    let sent = 0, skipped = 0, found = 0, queued = 0;

    // Önce birikmiş kuyruk: DB erişimi gerektirmez, bağlantı geldiyse geçmiş
    // (gönderilememiş) mesajlar yeni satırlardan önce akar.
    try { sent += await processPending(); }
    catch (e) { console.error('[Watcher] kuyruk işleme hatası:', e.message); }

    try {
        const pool = deps.getPool();
        if (!pool || !pool.connected) throw new Error('Veritabanı bağlantısı yok.');
        const tbl = tableName();
        if (!tbl) throw new Error('Firma/dönem seçilmemiş.');
        if (!(await tableExists(pool, tbl))) throw new Error(`Tablo bulunamadı: ${tbl}`);

        // İlk görüşte watermark = mevcut MAX(IND); geçmiş tahsilatlara mesaj atma.
        if (state.lastSeenInd[tbl] == null) {
            const mx = (await pool.request().query(`SELECT ISNULL(MAX(IND),0) AS mx FROM [${tbl}]`)).recordset[0].mx;
            state.lastSeenInd[tbl] = mx;
            saveState();
            lastResult = { sent: 0, skipped: 0, found: 0, note: `İzleme başladı (watermark IND=${mx})` };
            return;
        }

        const lastSeen = state.lastSeenInd[tbl];
        const codes = (config.izahatCodes || []).map(c => parseInt(c, 10)).filter(Number.isFinite);
        // Daima devir hariç; kod listesi verilmişse o kodlarla sınırla.
        const devirFilter = ` AND TRY_CAST(h.IZAHAT AS INT) NOT IN (${DEVIR_CODES.join(',')})`;
        const codeFilter = codes.length
            ? ` AND TRY_CAST(h.IZAHAT AS INT) IN (${codes.join(',')})`
            : '';

        // Fatura kaynaklı ALACAK satırlarını ele (fatura girişi tahsilat değildir):
        //  1) Aynı evrak + cari + günde BORC satırı varsa → peşin fatura/fiş çifti.
        //  2) EVRAKNO alış/satış fatura başlığında kayıtlıysa → fatura kaydı.
        const pairFilter = `
            AND NOT EXISTS (SELECT 1 FROM [${tbl}] b
                WHERE b.FIRMANO = h.FIRMANO AND b.EVRAKNO = h.EVRAKNO AND b.BORC > 0
                  AND b.IND <> h.IND AND CONVERT(date, b.TARIH) = CONVERT(date, h.TARIH))`;
        let faturaFilter = '';
        for (const [suffix, alias] of [['TBLALFATBASLIK', 'fal'], ['TBLSATFATBASLIK', 'fst']]) {
            const ft = `F${config.firmaNo}D${config.donemNo}${suffix}`;
            if (await cachedTableExists(pool, ft)) {
                faturaFilter += `
            AND NOT EXISTS (SELECT 1 FROM [${ft}] ${alias}
                WHERE ${alias}.BELGENO = h.EVRAKNO AND ${alias}.FIRMANO = h.FIRMANO)`;
            }
        }

        // Yeni satırların tavanı: fatura/BORC satırları filtrelense de watermark ilerleyebilsin.
        const rMax = pool.request();
        rMax.input('last', deps.sql.Int, lastSeen);
        const newMax = (await rMax.query(`
            SELECT ISNULL(MAX(IND), @last) AS mx FROM [${tbl}] WHERE IND > @last
        `)).recordset[0].mx;

        const r = pool.request();
        r.input('last', deps.sql.Int, lastSeen);
        r.input('minAmt', deps.sql.Decimal(18, 2), config.minAmount || 0);
        const rows = (await r.query(`
            SELECT h.IND, h.FIRMANO, h.ALACAK, h.BAKIYE, h.EVRAKNO, h.TARIH, h.IZAHAT, h.PARABIRIMI
            FROM [${tbl}] h
            WHERE h.IND > @last AND h.ALACAK > @minAmt${devirFilter}${codeFilter}${pairFilter}${faturaFilter}
            ORDER BY h.IND ASC
        `)).recordset;

        found = rows.length;
        if (!found) {
            if (newMax > lastSeen) { state.lastSeenInd[tbl] = newMax; saveState(); }
            lastResult = {
                sent, skipped, found,
                note: sent ? `Kuyruktan ${sent} gönderildi` : (pending.length ? `Yeni tahsilat yok (kuyrukta ${pending.length})` : 'Yeni tahsilat yok'),
            };
            return;
        }

        // Cari iletişim bilgilerini topluca çöz (FIRMANO = TBLCARI.IND)
        const inds = [...new Set(rows.map(x => x.FIRMANO).filter(v => v != null))];
        const contacts = await deps.resolveCariContacts(config.firmaNo, inds); // Map<ind,{name,kod,phone,valid,bakiye}>
        // Gerçek kalan borç hareket toplamından; TBLCARI.BAKIYE sadece yedek.
        const borcMap = await fetchKalanBorc(pool, tbl, inds);

        // Opsiyonel görsel/video — bir kez oku, tüm alıcılara aynı buffer.
        const media = loadMediaForSend();

        // Gönderilemeyen her satır kalıcı kuyruğa alınır (watermark daima ilerler;
        // satırın sahibi artık kuyruktur). Eski "watermark'ı geri çek" yaklaşımı,
        // uygulama kapanınca veya doğrulama yanlış "yok" dediğinde mesaj kaybediyordu.
        for (const row of rows) {
            const c = contacts.get(row.FIRMANO) || {};
            // Kalan borç = hareket toplamı (ödeme satırı dahil, anlık tutarlı). Pozitif = borç.
            // TBLCARI.BAKIYE gecikmeli güncellenebildiğinden sadece yedek olarak kullanılır.
            const kalanBorc = borcMap.has(row.FIRMANO) ? borcMap.get(row.FIRMANO)
                : (c.bakiye != null ? c.bakiye : null);
            // Bakiye işaretsiz yazılır; yönü {durum} söyler (pozitif = cari borçlu).
            const bakiyeStr = kalanBorc != null ? fmtAmount(Math.abs(kalanBorc)) : '';
            const durum = kalanBorc == null ? '' : (kalanBorc > 0 ? 'Borç' : kalanBorc < 0 ? 'Alacak' : '');
            const base = {
                ind: row.IND, cariInd: row.FIRMANO, name: c.name || String(row.FIRMANO),
                kod: c.kod || '', phone: c.phone || null,
                tutar: fmtAmount(row.ALACAK), evrak: row.EVRAKNO || '',
                bakiye: bakiyeStr, bakiyeDurum: durum,
            };

            if (!c.phone || !c.valid) {
                skipped++;
                pushLog({ ...base, status: 'noPhone', error: 'Geçerli telefon yok' });
                continue;
            }

            const text = renderTemplate(config.template, {
                ad: c.name, tutar: fmtAmount(row.ALACAK), kod: c.kod,
                evrak: row.EVRAKNO || '',
                tarih: row.TARIH ? new Date(row.TARIH).toLocaleDateString('tr-TR') : '',
                bakiye: bakiyeStr, borc: bakiyeStr, durum,
            });

            // Seçenek açıksa karttaki tüm geçerli numaralara, değilse sadece birincile.
            const targets = (config.sendAllPhones && Array.isArray(c.phones) && c.phones.length)
                ? c.phones : [c.phone];
            for (const phone of targets) {
                if (!deps.waStatus().ready) {
                    enqueue(base, phone, text, 'WhatsApp bağlı değil — kuyruğa alındı, bağlanınca gönderilecek');
                    queued++;
                    continue;
                }
                if (config.verifyOnWhatsApp) {
                    const chk = await deps.checkOnWhatsApp(phone);
                    if (!chk.exists) {
                        if (chk.transient) {
                            // Yanıt güvenilmez (bağlantı sorunu / boş yanıt) → kalıcı atlama YOK.
                            enqueue(base, phone, text, `Doğrulanamadı (${chk.error || 'geçici hata'}) — kuyruğa alındı`);
                            queued++;
                        } else {
                            skipped++;
                            pushLog({ ...base, phone, status: 'notOnWhatsApp', error: 'WhatsApp kullanıcısı değil' });
                        }
                        continue;
                    }
                }

                const res = await deps.waSend(phone, text, media, {
                    simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400),
                });
                // Gönderilen metin log'a yazılır → arayüzde popup'ta görüntülenir.
                if (res.success) { sent++; pushLog({ ...base, phone, status: 'sent', message: text }); }
                else {
                    // Gönderim hatası çoğunlukla geçici (bağlantı o an koptu) → kuyruğa.
                    enqueue(base, phone, text, `Gönderilemedi (${res.error}) — kuyruğa alındı`);
                    queued++;
                }

                await sleep(rand(2500, 6000)); // düşük hacim — küçük insansı gecikme
            }
        }

        // Watermark daima yeni tavana çekilir; gönderilemeyenler kuyrukta yaşar.
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

// Sunucu açılışında: kayıtlı config enabled ise otomatik başlat.
function autoStart() {
    if (config.enabled && config.firmaNo && config.donemNo) start();
}

function getConfig() {
    return { ...config };
}

function setConfig(patch) {
    config = { ...config, ...patch };
    // izahatCodes string gelebilir → diziye çevir
    if (typeof config.izahatCodes === 'string') {
        config.izahatCodes = config.izahatCodes.split(/[,\s]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
    }
    saveConfig();
    return getConfig();
}

function getStatus() {
    return {
        running, enabled: config.enabled,
        firmaNo: config.firmaNo, donemNo: config.donemNo,
        table: tableName(), intervalSec: config.intervalSec,
        izahatCodes: config.izahatCodes, minAmount: config.minAmount,
        template: config.template,
        verifyOnWhatsApp: config.verifyOnWhatsApp, simulateTyping: config.simulateTyping,
        sendAllPhones: config.sendAllPhones === true,
        media: config.media ? { name: config.media.name, kind: config.media.kind } : null,
        lastPollAt, lastError, lastResult,
        watermark: tableName() ? (state.lastSeenInd[tableName()] ?? null) : null,
        pendingCount: pending.length,
    };
}

function getLog() { return log; }

// Firma/dönem değişince eski watermark karışmasın diye sıfırlamayı çağıran için.
function resetWatermark() {
    const t = tableName();
    if (t) { delete state.lastSeenInd[t]; saveState(); }
}

module.exports = {
    configure, autoStart, start, stop,
    getConfig, setConfig, getStatus, getLog, resetWatermark, pollOnce,
    setMedia, clearMedia,
};
