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
    template: 'Sayın {ad}, {tutar} TL ödemeniz alınmış ve kaydedilmiştir. Güncel bakiyeniz: {bakiye} TL. Teşekkür ederiz.',
    verifyOnWhatsApp: true,
    simulateTyping: true,
    // Opsiyonel görsel/video: data/ altına kaydedilen dosya. { path, mime, kind, name } | null
    media: null,
};

let config = { ...DEFAULT_CONFIG };
let state = { lastSeenInd: {} };  // tableName -> son işlenen IND
let log = [];                     // son otomatik gönderimler (en yeni başta), tavan 200

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));

// ─── Kalıcılık ───────────────────────────────────────────────────────────────
function configure(d) {
    deps = d;
    const dataDir = path.join(d.baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    CONFIG_PATH = path.join(dataDir, 'watcher.json');
    STATE_PATH = path.join(dataDir, 'watcher-state.json');
    MEDIA_DIR = dataDir;
    loadConfig();
    loadState();
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

function pushLog(entry) {
    log.unshift({ ...entry, at: new Date().toISOString() });
    if (log.length > 200) log.length = 200;
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
        .replace(/\{borc\}/gi, vars.borc || '');     // kalan borç = {bakiye} ile aynı (pozitif bakiye)
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

// Fatura başlık tabloları her taramada sorgulanmasın diye varlık bilgisi önbelleğe alınır.
let tblExistsCache = {};
async function cachedTableExists(pool, name) {
    if (!(name in tblExistsCache)) tblExistsCache[name] = await tableExists(pool, name);
    return tblExistsCache[name];
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
    let sent = 0, skipped = 0, found = 0;

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
            lastResult = { sent, skipped, found, note: 'Yeni tahsilat yok' };
            return;
        }

        // Cari iletişim bilgilerini topluca çöz (FIRMANO = TBLCARI.IND)
        const inds = [...new Set(rows.map(x => x.FIRMANO).filter(v => v != null))];
        const contacts = await deps.resolveCariContacts(config.firmaNo, inds); // Map<ind,{name,kod,phone,valid,bakiye}>
        // Gerçek kalan borç hareket toplamından; TBLCARI.BAKIYE sadece yedek.
        const borcMap = await fetchKalanBorc(pool, tbl, inds);

        // Opsiyonel görsel/video — bir kez oku, tüm alıcılara aynı buffer.
        const media = loadMediaForSend();

        let maxInd = lastSeen;
        let interrupted = false; // waOffline kesintisinde watermark newMax'e çekilmesin
        for (const row of rows) {
            maxInd = Math.max(maxInd, row.IND);
            const c = contacts.get(row.FIRMANO) || {};
            // Kalan borç = hareket toplamı (ödeme satırı dahil, anlık tutarlı). Pozitif = borç.
            // TBLCARI.BAKIYE gecikmeli güncellenebildiğinden sadece yedek olarak kullanılır.
            const kalanBorc = borcMap.has(row.FIRMANO) ? borcMap.get(row.FIRMANO)
                : (c.bakiye != null ? c.bakiye : null);
            const base = {
                ind: row.IND, cariInd: row.FIRMANO, name: c.name || String(row.FIRMANO),
                kod: c.kod || '', phone: c.phone || null,
                tutar: fmtAmount(row.ALACAK), evrak: row.EVRAKNO || '',
                bakiye: kalanBorc != null ? fmtAmount(kalanBorc) : '',
            };

            if (!c.phone || !c.valid) {
                skipped++;
                pushLog({ ...base, status: 'noPhone', error: 'Geçerli telefon yok' });
                continue;
            }

            const waOk = deps.waStatus();
            if (!waOk.ready) {
                // WhatsApp bağlı değil → bu satırı henüz işlenmemiş say (watermark'ı ilerletme).
                maxInd = Math.min(maxInd, row.IND - 1);
                interrupted = true;
                skipped++;
                pushLog({ ...base, status: 'waOffline', error: 'WhatsApp bağlı değil, sonraki taramada denenecek' });
                break; // sonrakileri de beklet; watermark kesinti noktasına çekilir
            }

            if (config.verifyOnWhatsApp) {
                const chk = await deps.checkOnWhatsApp(c.phone);
                if (!chk.exists) {
                    skipped++;
                    pushLog({ ...base, status: 'notOnWhatsApp', error: chk.error || 'WhatsApp kullanıcısı değil' });
                    continue;
                }
            }

            const text = renderTemplate(config.template, {
                ad: c.name, tutar: fmtAmount(row.ALACAK), kod: c.kod,
                evrak: row.EVRAKNO || '',
                tarih: row.TARIH ? new Date(row.TARIH).toLocaleDateString('tr-TR') : '',
                // Kalan borç hareket toplamından (ödeme düşülmüş hali). Yoksa boş bırak.
                bakiye: kalanBorc != null ? fmtAmount(kalanBorc) : '',
                borc: kalanBorc != null ? fmtAmount(kalanBorc) : '',
            });

            const res = await deps.waSend(c.phone, text, media, {
                simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400),
            });
            if (res.success) { sent++; pushLog({ ...base, status: 'sent' }); }
            else { skipped++; pushLog({ ...base, status: 'failed', error: res.error }); }

            await sleep(rand(2500, 6000)); // düşük hacim — küçük insansı gecikme
        }

        // Kesinti yoksa filtrelenen (fatura/BORC) satırların da üzerinden atla.
        if (!interrupted) maxInd = Math.max(maxInd, newMax);
        if (maxInd > state.lastSeenInd[tbl]) { state.lastSeenInd[tbl] = maxInd; saveState(); }
        lastResult = { sent, skipped, found, note: `${sent} gönderildi, ${skipped} atlandı` };
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
        media: config.media ? { name: config.media.name, kind: config.media.kind } : null,
        lastPollAt, lastError, lastResult,
        watermark: tableName() ? (state.lastSeenInd[tableName()] ?? null) : null,
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
