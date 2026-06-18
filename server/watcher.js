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
    // Belge tipi kuralları — default BOŞ = hiçbir mesaj gönderilmez.
    //   { id, name, enabled, izahatCodes:[], direction:'alacak'|'borc'|'any',
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

// ─── Kural normalizasyonu ──────────────────────────────────────────────────────
let ruleSeq = 1;
function normalizeRule(r, prev) {
    const direction = ['alacak', 'borc', 'any'].includes(r.direction) ? r.direction : 'alacak';
    let codes = r.izahatCodes;
    if (typeof codes === 'string') codes = codes.split(/[,\s]+/);
    codes = (Array.isArray(codes) ? codes : []).map(c => parseInt(c, 10)).filter(Number.isFinite);
    // media: gönderilmediyse aynı id'li eski kuraldan koru (UI media'yı ayrı yükler).
    const media = (r.media !== undefined) ? r.media : (prev ? prev.media : null);
    return {
        id: r.id || `rule-${Date.now()}-${ruleSeq++}`,
        name: (r.name || '').toString().trim() || 'Mesaj türü',
        enabled: r.enabled === true,
        izahatCodes: codes,
        direction,
        minAmount: Math.max(0, Number(r.minAmount) || 0),
        excludeFatura: (r.excludeFatura !== undefined) ? !!r.excludeFatura : (direction === 'alacak'),
        template: (r.template || '').toString(),
        media: media || null,
    };
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
            // Göç: eski tek-şablon config → tek "Tahsilat" kuralı (etkinliği korunur).
            if (!Array.isArray(config.rules) && (raw.template != null || raw.izahatCodes != null)) {
                config.rules = [{
                    id: 'tahsilat', name: 'Tahsilat (ödeme alındı)',
                    enabled: !!raw.enabled, izahatCodes: raw.izahatCodes || [],
                    direction: 'alacak', minAmount: raw.minAmount || 0,
                    excludeFatura: true, template: raw.template || '',
                    media: raw.media || null,
                }];
            }
            if (!Array.isArray(config.rules)) config.rules = [];
            config.rules = config.rules.map(r => normalizeRule(r));
            // eski tek-şablon alanlarını bırak
            delete config.template; delete config.izahatCodes; delete config.minAmount; delete config.media;
        }
    } catch (e) { console.error('[Watcher] config okunamadı:', e.message); }
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
    for (const item of [...pending]) {
        if (!deps.waStatus().ready) break;
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
        await sleep(rand(2500, 6000));
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
    return String(tpl || '')
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
function matchRule(row, rules) {
    const code = parseInt(row.IZAHAT, 10);
    const borc = Number(row.BORC) || 0;
    const alacak = Number(row.ALACAK) || 0;
    const isFatura = !!row.isFatura;
    for (const rule of rules) {
        if (!rule.enabled) continue;
        let amount;
        if (rule.direction === 'borc') { if (!(borc > 0)) continue; amount = borc; }
        else if (rule.direction === 'alacak') { if (!(alacak > 0)) continue; amount = alacak; }
        else { amount = borc > 0 ? borc : alacak; if (!(amount > 0)) continue; }
        if (amount < (rule.minAmount || 0)) continue;
        const codes = rule.izahatCodes || [];
        if (codes.length && !codes.includes(code)) continue;
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

        const r = pool.request();
        r.input('last', deps.sql.Int, lastSeen);
        const rows = (await r.query(`
            SELECT h.IND, h.FIRMANO, h.BORC, h.ALACAK, h.BAKIYE, h.EVRAKNO, h.TARIH, h.IZAHAT, h.PARABIRIMI,
                   CASE WHEN ${isFaturaExpr} THEN 1 ELSE 0 END AS isFatura
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
                if (config.verifyOnWhatsApp) {
                    const chk = await deps.checkOnWhatsApp(phone);
                    if (!chk.exists) {
                        if (chk.transient) { enqueue(base, phone, text, `Doğrulanamadı (${chk.error || 'geçici hata'}) — kuyruğa alındı`, rule.media); queued++; }
                        else { skipped++; pushLog({ ...base, phone, status: 'notOnWhatsApp', error: 'WhatsApp kullanıcısı değil' }); }
                        continue;
                    }
                }
                const res = await deps.waSend(phone, text, media, { simulateTyping: config.simulateTyping, typingMs: rand(1200, 2400) });
                if (res.success) { sent++; pushLog({ ...base, phone, status: 'sent', message: text }); }
                else { enqueue(base, phone, text, `Gönderilemedi (${res.error}) — kuyruğa alındı`, rule.media); queued++; }
                await sleep(rand(2500, 6000));
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
        rules: (config.rules || []).map(r => ({
            id: r.id, name: r.name, enabled: r.enabled, izahatCodes: r.izahatCodes,
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
