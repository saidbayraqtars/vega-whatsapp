// ═══════════════════════════════════════════════════════════════════════════
//  Sipariş Bildirimi (sabit iç numara listesine bildirim)
//  Vega'da ALINAN SİPARİŞ fişi oluşunca, satış faturası bildirimi gibi WhatsApp
//  gönderir — ama CARİYE DEĞİL, kullanıcının elle girdiği numara(lar)a (kendi
//  personeli / depo / patron). Birden çok numara virgülle yazılır; her birine
//  aynı mesaj gider.
//
//  NEDEN AYRI MODÜL: sipariş fişi cari hareket tablosuna HİÇ yazmaz (canlı
//  doğrulandı, F0101D0017: son 5 siparişin BELGENO'su TBLCARIHAREKETLERI'nde
//  0 satır). watcher.js yalnız TBLCARIHAREKETLERI'ni tarar → siparişi asla
//  göremez. Bu modül sipariş başlık tablosunu kendi watermark'ıyla tarar.
//
//  Tablo: F{firmaNo}D{donemNo}TBLALSIPBASLIK  (alınan sipariş, BELGETIPI=60)
//    • IND       artan PK → "yeni sipariş" watermark'ı
//    • BELGENO   belge no (A00xxxxx)
//    • FIRMANO   = TBLCARI.IND (sipariş veren cari)
//    • TUTAR     genel toplam (KDV dahil), ARATOPLAM = matrah
//    • TARIH     belge tarihi, CREDATE = kayıt anı
//    • IPTAL     bit — sipariş iptal edildi (canlı kullanımda: 89/6748)
//  Kalemler: TBLALSIPHAREKET.EVRAKNO = BASLIK.IND (fatura ile aynı desen).
//
//  ANTI-BAN: hedefler az sayıda, kayıtlı, kendi numaralarımız → günlük/saatlik tavan ve
//  gece penceresi UYGULANMAZ (sipariş girildiği an haber gitmeli). Yalnız
//  ban-şüphesi SOĞUMASI (403/401) dinlenir: flaglenen numarayı dövmeyiz.
//  Gönderim yine de recordSent ile hesap toplamına yazılır (tavanlar dürüst kalsın).
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const antiban = require('./antiban');
const { normalizePhone, isLikelyValid } = require('./phone');

let deps = null;

// Anti-ban kapısı/sayacı: çok numaralı kurulumda gönderen hat gönderim anında
// seçilir → kapıyı server.js verir (accounts.gate), sayacı gönderim yolu işler.
// deps.gate yoksa eski tekil davranış (geri uyum).
const gateSend = (ch) => (deps.gate ? deps.gate(ch) : antiban.gate(deps.waStatus().me, null, ch));
const noteSent = (ch) => {
    try {
        if (deps.recordSent) deps.recordSent(ch);
        else antiban.recordSent(deps.waStatus().me, ch);
    } catch { /* yok say */ }
};

let CONFIG_PATH = null;
let STATE_PATH = null;
let LOG_PATH = null;
let SENT_PATH = null;

let timer = null;
let polling = false;
let running = false;
let lastPollAt = null;
let lastError = null;
let lastResult = null;
let lastCancelScanAt = 0;

const DEFAULT_TEMPLATE =
    '🧾 *Yeni Sipariş* — {evrak}\n' +
    'Cari: {firma}{kodpar}\n' +
    'Tarih: {tarih}\n' +
    'Tutar: {tutar} TL';

const DEFAULT_CANCEL_TEMPLATE =
    '❌ *Sipariş İptal* — {evrak}\n' +
    'Cari: {firma}{kodpar}\n' +
    'Tutar: {tutar} TL\n' +
    'Bu sipariş Vega\'da iptal edildi/silindi.';

const DEFAULT_CONFIG = {
    enabled: false,
    firmaNo: null,
    donemNo: null,
    // Bildirimin gideceği numara(lar) — elle girilir, virgülle çoğaltılır.
    // Format serbest (0532…, +90532…, 532…). Boşken gönderim yapılmaz.
    phone: '',
    intervalSec: 30,
    // Bu tutarın altındaki siparişleri bildirme (0 = hepsi).
    minAmount: 0,
    // Sipariş kalemlerini (ürün/miktar/fiyat) mesaja ekle.
    includeContent: true,
    // Sipariş sonradan iptal edilir/silinirse iptal mesajı gönder.
    watchCancel: true,
    cancelScanSec: 60,
    // Gönderim saati/gün penceresine uy (varsayılan KAPALI: iç bildirim anında gider).
    respectSendWindow: false,
    simulateTyping: false,
    template: DEFAULT_TEMPLATE,
    cancelTemplate: DEFAULT_CANCEL_TEMPLATE,
};

let config = { ...DEFAULT_CONFIG };
let state = { lastSeenInd: {} };
let log = [];
let pending = [];          // WA kapalıyken bekleyen mesajlar
// Gönderilen sipariş defteri (iptal izleme): { [tbl]: { [IND]: entry } }, 7 gün.
let sentDocs = {};

const DOC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SEND_ATTEMPTS = 8;
// Tek turda en fazla kaç yeni sipariş işlensin (toplu içe aktarımda mesaj yağmuru olmasın).
const MAX_PER_POLL = 30;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));

// ─── Kalıcılık ───────────────────────────────────────────────────────────────
function configure(d) {
    deps = d;
    const dataDir = path.join(d.baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    CONFIG_PATH = path.join(dataDir, 'siparis.json');
    STATE_PATH = path.join(dataDir, 'siparis-state.json');
    LOG_PATH = path.join(dataDir, 'siparis-log.json');
    SENT_PATH = path.join(dataDir, 'siparis-sent.json');
    loadAll();
}

function readJson(file, fallback) {
    try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { console.error('[Sipariş] okunamadı:', path.basename(file), e.message); }
    return fallback;
}
function writeJson(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
    catch (e) { console.error('[Sipariş] yazılamadı:', path.basename(file), e.message); }
}

function loadAll() {
    const raw = readJson(CONFIG_PATH, null);
    if (raw && typeof raw === 'object') config = { ...DEFAULT_CONFIG, ...raw };
    const st = readJson(STATE_PATH, null);
    if (st && st.lastSeenInd) state = st;
    const lg = readJson(LOG_PATH, null);
    if (Array.isArray(lg)) log = lg;
    const sd = readJson(SENT_PATH, null);
    if (sd && typeof sd === 'object') sentDocs = sd;
    const pd = readJson(path.join(path.dirname(CONFIG_PATH), 'siparis-pending.json'), null);
    if (Array.isArray(pd)) pending = pd;
}

const saveConfig = () => writeJson(CONFIG_PATH, config);
const saveState = () => writeJson(STATE_PATH, state);
const saveSent = () => writeJson(SENT_PATH, sentDocs);
const savePending = () => writeJson(path.join(path.dirname(CONFIG_PATH), 'siparis-pending.json'), pending);

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
const tableName = () =>
    config.firmaNo && config.donemNo ? `F${config.firmaNo}D${config.donemNo}TBLALSIPBASLIK` : null;

function fmtAmount(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Hedef numaralar: kullanıcı virgülle (veya ; / satır sonu ile) birden çok numara
// yazabilir. Format serbest — 0532…, +90532…, 90532…, 532… hepsi kabul; normalizePhone
// tek biçime çeker. ÖNCE AYIR SONRA NORMALİZE: normalizePhone rakam-dışını atar,
// bölmeden çağrılırsa "0532...,0533..." tek dev numaraya yapışır.
const splitPhones = (raw) => String(raw || '').split(/[,;\n\r/|]+/).map(s => s.trim()).filter(Boolean);

// Geçerli (905XXXXXXXXX) numaralar, tekilleştirilmiş.
function targetPhones() {
    const out = [];
    for (const part of splitPhones(config.phone)) {
        const p = normalizePhone(part);
        if (isLikelyValid(p) && !out.includes(p)) out.push(p);
    }
    return out;
}
// Kullanıcının yazdığı ama numaraya çevrilemeyen parçalar (UI uyarısı için).
function invalidPhoneParts() {
    return splitPhones(config.phone).filter(part => !isLikelyValid(normalizePhone(part)));
}

function renderTemplate(tpl, vars) {
    return antiban.applySpintax(tpl || '')
        .replace(/\{firma\}/gi, vars.firma || '')
        .replace(/\{ad\}/gi, vars.firma || '')
        .replace(/\{kodpar\}/gi, vars.kod ? ` (${vars.kod})` : '')   // kod yoksa parantez de yok
        .replace(/\{kod\}/gi, vars.kod || '')
        .replace(/\{evrak\}/gi, vars.evrak || '')
        .replace(/\{tarih\}/gi, vars.tarih || '')
        .replace(/\{saat\}/gi, vars.saat || '')
        .replace(/\{tutar\}/gi, vars.tutar || '')
        .replace(/\{firmaadi\}/gi, vars.firmaadi || '')
        .replace(/ ?\(\s*\)/g, '')
        .replace(/\n+\s*$/, '');
}

async function tableExists(pool, name) {
    const r = pool.request();
    r.input('tbl', deps.sql.NVarChar, name);
    const res = await r.query(`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME=@tbl`);
    return res.recordset[0].c > 0;
}

// Ban-şüphesi soğuması dışında tavan uygulamıyoruz (bkz. başlıktaki ANTI-BAN notu).
function cooldownReason() {
    try {
        const g = gateSend('siparis');
        if (!g.ok && g.capType === 'cooldown') return g.reason;
    } catch { /* gate okunamazsa gönderime engel olma */ }
    return null;
}

// Tek gönderim noktası: aynı bildirimi TÜM hedef numaralara yollar. WA kapalı/
// soğumada/pencere dışındaysa numara başına kuyruğa alır.
// entry = { key, ind, evrak, firma, kod, tutar, kind:'new'|'cancel' }
// Döner: { sent, queued } (numara sayısı bazında).
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
            simulateTyping: config.simulateTyping, typingMs: rand(900, 1800), channel: 'siparis',
        });
        if (res.success) {
            noteSent('siparis');
            recordSentDoc(entry, phone, res.id);
            pushLog({ ...entry, phone, status: entry.kind === 'cancel' ? 'cancelled' : 'sent', message: text });
            sent++;
        } else {
            enqueue(entry, phone, text, `Gönderilemedi (${res.error})`);
            queued++;
        }
        if (phones.length > 1) await sleep(rand(1500, 3500));   // aynı anda seri atış yapma
    }
    return { sent, queued };
}

function enqueue(entry, phone, text, reason) {
    // Tekillik numara bazında: aynı sipariş iki numaraya ayrı ayrı kuyruklanır.
    if (pending.some(p => p.key === entry.key && p.kind === entry.kind && p.phone === phone)) return;
    pending.push({ ...entry, phone, text, attempts: 0, queuedAt: new Date().toISOString(), lastError: reason });
    savePending();
    pushLog({ ...entry, phone, status: 'queued', error: reason, message: text });
}

async function processPending() {
    if (!pending.length) return 0;
    if (!deps.waStatus().ready) return 0;
    if (config.respectSendWindow && antiban.inQuietHours()) return 0;
    if (cooldownReason()) return 0;
    let sent = 0;
    for (const item of [...pending]) {
        if (!pending.includes(item)) continue;
        if (!deps.waStatus().ready) break;
        const res = await deps.waSend(item.phone, item.text, null, {
            simulateTyping: config.simulateTyping, typingMs: rand(900, 1800), channel: 'siparis',
        });
        if (res.success) {
            noteSent('siparis');
            recordSentDoc(item, item.phone, res.id);
            pending = pending.filter(p => p !== item); savePending(); sent++;
            pushLog({ ...item, status: item.kind === 'cancel' ? 'cancelled' : 'sent', message: item.text });
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

// ─── Gönderilen sipariş defteri (iptal izleme) ─────────────────────────────────
function recordSentDoc(entry, phone, id) {
    if (!config.watchCancel || entry.kind !== 'new') return;
    const tbl = entry.tbl || tableName();
    if (!tbl || entry.ind == null) return;
    sentDocs[tbl] = sentDocs[tbl] || {};
    const e = sentDocs[tbl][entry.ind] || {
        ind: entry.ind, evrak: entry.evrak, firma: entry.firma, kod: entry.kod,
        tutar: entry.tutar, sentAt: new Date().toISOString(), msgs: [],
    };
    if (id) e.msgs.push({ phone, id });
    sentDocs[tbl][entry.ind] = e;
    saveSent();
}

function pruneSent() {
    const cut = Date.now() - DOC_WINDOW_MS;
    let changed = false;
    for (const t of Object.keys(sentDocs)) {
        const bucket = sentDocs[t];
        for (const k of Object.keys(bucket)) {
            if (new Date(bucket[k].sentAt).getTime() < cut) { delete bucket[k]; changed = true; }
        }
        if (!Object.keys(bucket).length) delete sentDocs[t];
    }
    if (changed) saveSent();
}

// Bildirilmiş siparişler iptal edildi mi / silindi mi? (IPTAL=1 veya satır yok)
async function scanCancels(pool, tbl) {
    const now = Date.now();
    if (now - lastCancelScanAt < Math.max(15, config.cancelScanSec || 60) * 1000) return 0;
    lastCancelScanAt = now;
    pruneSent();
    const bucket = sentDocs[tbl];
    if (!bucket) return 0;
    const inds = Object.keys(bucket).map(n => parseInt(n, 10)).filter(Number.isFinite);
    if (!inds.length) return 0;

    const alive = new Map();
    try {
        const rows = (await pool.request().query(`
            SELECT IND, ISNULL(IPTAL, 0) AS IPTAL FROM [${tbl}] WHERE IND IN (${inds.join(',')})
        `)).recordset;
        rows.forEach(r => alive.set(Number(r.IND), r.IPTAL === true || Number(r.IPTAL) === 1));
    } catch (e) { console.error('[Sipariş] iptal taraması:', e.message); return 0; }

    let n = 0;
    for (const ind of inds) {
        const e = bucket[ind];
        const iptal = alive.get(ind);
        const gone = !alive.has(ind);
        if (!gone && !iptal) continue;
        const entry = {
            key: `cancel:${tbl}:${ind}`, kind: 'cancel', tbl, ind,
            evrak: e.evrak, firma: e.firma, kod: e.kod, tutar: e.tutar,
        };
        const text = renderTemplate(config.cancelTemplate || DEFAULT_CANCEL_TEMPLATE, {
            firma: e.firma, kod: e.kod, evrak: e.evrak, tutar: e.tutar,
            tarih: new Date().toLocaleDateString('tr-TR'), saat: new Date().toLocaleTimeString('tr-TR'),
            firmaadi: await getBizFirma(),
        });
        await sendOrQueue(entry, text);
        delete bucket[ind]; saveSent();   // tek kez bildir
        n++;
        await sleep(rand(1500, 3000));
    }
    if (!Object.keys(bucket).length) { delete sentDocs[tbl]; saveSent(); }
    return n;
}

// {firmaadi} imzası — 6 saat cache (watcher ile aynı desen).
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

// ─── Çekirdek: tek tarama ──────────────────────────────────────────────────────
async function pollOnce() {
    if (polling) return;
    polling = true;
    lastPollAt = new Date().toISOString();
    lastError = null;
    let sent = 0, queued = 0, skipped = 0, found = 0, cancelled = 0;

    try { sent += await processPending(); }
    catch (e) { console.error('[Sipariş] kuyruk işleme hatası:', e.message); }

    try {
        const pool = deps.getPool();
        if (!pool || !pool.connected) throw new Error('Veritabanı bağlantısı yok.');
        const tbl = tableName();
        if (!tbl) throw new Error('Firma/dönem seçilmemiş.');
        if (!(await tableExists(pool, tbl))) throw new Error(`Sipariş tablosu bulunamadı: ${tbl}`);

        if (config.watchCancel) {
            try { cancelled = await scanCancels(pool, tbl); }
            catch (e) { console.error('[Sipariş] iptal tarama hatası:', e.message); }
        }

        // İlk görüşte watermark = mevcut MAX(IND); geçmiş siparişlere mesaj atma.
        if (state.lastSeenInd[tbl] == null) {
            const mx = (await pool.request().query(`SELECT ISNULL(MAX(IND),0) AS mx FROM [${tbl}]`)).recordset[0].mx;
            state.lastSeenInd[tbl] = mx;
            saveState();
            lastResult = { sent: 0, found: 0, note: `İzleme başladı (watermark IND=${mx})` };
            return;
        }

        const lastSeen = state.lastSeenInd[tbl];
        const rMax = pool.request();
        rMax.input('last', deps.sql.Int, lastSeen);
        const newMax = (await rMax.query(`SELECT ISNULL(MAX(IND), @last) AS mx FROM [${tbl}] WHERE IND > @last`)).recordset[0].mx;

        const r = pool.request();
        r.input('last', deps.sql.Int, lastSeen);
        const rows = (await r.query(`
            SELECT TOP ${MAX_PER_POLL} IND, BELGENO, TARIH, CREDATE, TUTAR, FIRMANO, PARABIRIMI
            FROM [${tbl}]
            WHERE IND > @last AND ISNULL(IPTAL, 0) = 0
            ORDER BY IND ASC
        `)).recordset;
        found = rows.length;

        if (!found) {
            if (newMax > lastSeen) { state.lastSeenInd[tbl] = newMax; saveState(); }
            lastResult = { sent, cancelled, found: 0, note: bitsNote(sent, queued, skipped, cancelled) || 'Yeni sipariş yok' };
            return;
        }

        // Cari adları topluca (bildirim bize gidiyor ama mesajda cari adı yazılıyor).
        const inds = [...new Set(rows.map(x => x.FIRMANO).filter(v => v != null))];
        let contacts = new Map();
        try { contacts = await deps.resolveCariContacts(config.firmaNo, inds); }
        catch (e) { console.error('[Sipariş] cari çözümlenemedi:', e.message); }
        const bizFirma = await getBizFirma();

        let maxHandled = lastSeen;
        for (const row of rows) {
            const tutar = Number(row.TUTAR) || 0;
            const c = contacts.get(row.FIRMANO) || {};
            const entry = {
                key: `new:${tbl}:${row.IND}`, kind: 'new', tbl, ind: row.IND,
                evrak: row.BELGENO || '', firma: c.firma || c.name || String(row.FIRMANO),
                kod: c.kod || '', tutar: fmtAmount(tutar), name: c.name || String(row.FIRMANO),
            };
            if (tutar < (config.minAmount || 0)) {
                skipped++; maxHandled = row.IND;
                pushLog({ ...entry, status: 'skipped', error: `Tutar alt sınırın altında (${fmtAmount(config.minAmount)} TL)` });
                continue;
            }

            let text = renderTemplate(config.template || DEFAULT_TEMPLATE, {
                firma: entry.firma, kod: entry.kod, evrak: entry.evrak, tutar: entry.tutar,
                tarih: row.TARIH ? new Date(row.TARIH).toLocaleDateString('tr-TR') : '',
                saat: row.CREDATE ? new Date(row.CREDATE).toLocaleTimeString('tr-TR') : '',
                firmaadi: bizFirma,
            });
            if (config.includeContent && typeof deps.buildSiparisContentText === 'function') {
                try {
                    const content = await deps.buildSiparisContentText(config.firmaNo, config.donemNo, row.IND, tutar);
                    if (content) text += '\n\n' + content;
                } catch (e) { console.error('[Sipariş] içerik eklenemedi:', e.message); }
            }

            const res = await sendOrQueue(entry, text);
            sent += res.sent;
            queued += res.queued;
            if (!res.sent && !res.queued) skipped++;    // hedef numara yok
            maxHandled = row.IND;
            await sleep(rand(2000, 5000));
        }

        // Watermark: bu turda işlenen son satıra kadar ilerlet. TOP sınırına takıldıysak
        // newMax'e ATLAMA — kalanlar sonraki turda işlenir (sipariş kaçırmayalım).
        const advanceTo = rows.length < MAX_PER_POLL ? Math.max(newMax, maxHandled) : maxHandled;
        if (advanceTo > state.lastSeenInd[tbl]) { state.lastSeenInd[tbl] = advanceTo; saveState(); }
        lastResult = { sent, queued, skipped, cancelled, found, note: bitsNote(sent, queued, skipped, cancelled) };
    } catch (e) {
        lastError = e.message;
        lastResult = { sent, queued, skipped, cancelled, found, note: 'Hata: ' + e.message };
        console.error('[Sipariş] tarama hatası:', e.message);
    } finally {
        polling = false;
    }
}

function bitsNote(sent, queued, skipped, cancelled) {
    const bits = [];
    if (sent) bits.push(`${sent} gönderildi`);
    if (queued) bits.push(`${queued} kuyrukta`);
    if (cancelled) bits.push(`${cancelled} iptal bildirimi`);
    if (skipped) bits.push(`${skipped} atlandı`);
    return bits.join(', ');
}

// ─── Yaşam döngüsü ─────────────────────────────────────────────────────────────
function start() {
    if (!config.firmaNo || !config.donemNo) { lastError = 'Firma/dönem seçilmemiş.'; return false; }
    if (!targetPhones().length) { lastError = 'Geçerli bildirim numarası yok.'; return false; }
    stop();
    running = true;
    config.enabled = true;
    saveConfig();
    const ms = Math.max(10, config.intervalSec || 30) * 1000;
    pollOnce();
    timer = setInterval(pollOnce, ms);
    console.log(`[Sipariş] başlatıldı → ${tableName()} her ${config.intervalSec}sn → ${targetPhones().join(', ')}`);
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
    config = { ...config, ...patch };
    saveConfig();
    return getConfig();
}

function getStatus() {
    return {
        running, enabled: config.enabled,
        firmaNo: config.firmaNo, donemNo: config.donemNo,
        table: tableName(), intervalSec: config.intervalSec,
        phone: config.phone || '', phones: targetPhones(), invalidPhones: invalidPhoneParts(),
        minAmount: config.minAmount || 0,
        includeContent: config.includeContent !== false,
        watchCancel: config.watchCancel !== false,
        respectSendWindow: config.respectSendWindow === true,
        simulateTyping: config.simulateTyping === true,
        template: config.template || DEFAULT_TEMPLATE,
        cancelTemplate: config.cancelTemplate || DEFAULT_CANCEL_TEMPLATE,
        watermark: tableName() ? (state.lastSeenInd[tableName()] ?? null) : null,
        trackedCount: Object.values(sentDocs).reduce((n, b) => n + Object.keys(b).length, 0),
        pendingCount: pending.length,
        lastPollAt, lastError, lastResult,
    };
}

function getLog() { return log; }

function resetWatermark() {
    const t = tableName();
    if (t) { delete state.lastSeenInd[t]; saveState(); }
}

// UI "Test mesajı gönder": son gerçek siparişi (yoksa örnek veriyi) şablonla gönderir.
async function sendTest() {
    const phones = targetPhones();
    if (!phones.length) return { success: false, message: 'Önce geçerli bir bildirim numarası girin.' };
    if (!deps.waStatus().ready) return { success: false, message: 'WhatsApp bağlı değil.' };
    const pool = deps.getPool();
    const tbl = tableName();
    let vars = { firma: 'ÖRNEK MÜŞTERİ A.Ş.', kod: 'M00001', evrak: 'A0000001', tutar: fmtAmount(1250), tarih: new Date().toLocaleDateString('tr-TR'), saat: new Date().toLocaleTimeString('tr-TR') };
    let ind = null, tutarNum = 1250;
    if (pool && pool.connected && tbl && await tableExists(pool, tbl)) {
        const row = (await pool.request().query(`SELECT TOP 1 IND, BELGENO, TARIH, CREDATE, TUTAR, FIRMANO FROM [${tbl}] WHERE ISNULL(IPTAL,0)=0 ORDER BY IND DESC`)).recordset[0];
        if (row) {
            const c = (await deps.resolveCariContacts(config.firmaNo, [row.FIRMANO])).get(row.FIRMANO) || {};
            ind = row.IND; tutarNum = Number(row.TUTAR) || 0;
            vars = {
                firma: c.firma || c.name || String(row.FIRMANO), kod: c.kod || '',
                evrak: row.BELGENO || '', tutar: fmtAmount(tutarNum),
                tarih: row.TARIH ? new Date(row.TARIH).toLocaleDateString('tr-TR') : '',
                saat: row.CREDATE ? new Date(row.CREDATE).toLocaleTimeString('tr-TR') : '',
            };
        }
    }
    vars.firmaadi = await getBizFirma();
    let text = renderTemplate(config.template || DEFAULT_TEMPLATE, vars);
    if (config.includeContent && ind != null && typeof deps.buildSiparisContentText === 'function') {
        try {
            const content = await deps.buildSiparisContentText(config.firmaNo, config.donemNo, ind, tutarNum);
            if (content) text += '\n\n' + content;
        } catch { /* içerik olmadan gönder */ }
    }
    text = '🔔 TEST\n' + text;
    // Test TÜM hedef numaralara gider — kullanıcı listenin tamamını doğrulasın.
    let ok = 0; const errors = [];
    for (const phone of phones) {
        const res = await deps.waSend(phone, text, null, { simulateTyping: false, channel: 'siparis' });
        if (res.success) {
            noteSent('siparis');
            pushLog({ key: 'test', kind: 'new', evrak: vars.evrak, firma: vars.firma, tutar: vars.tutar, phone, status: 'sent', message: text, error: 'Test mesajı' });
            ok++;
        } else {
            errors.push(`${phone}: ${res.error || 'gönderilemedi'}`);
            pushLog({ key: 'test', kind: 'new', evrak: vars.evrak, firma: vars.firma, tutar: vars.tutar, phone, status: 'failed', error: `Test — ${res.error || 'gönderilemedi'}` });
        }
        if (phones.length > 1) await sleep(rand(1200, 2500));
    }
    if (ok === phones.length) return { success: true, message: `${ok} numaraya test gönderildi.` };
    if (ok) return { success: true, message: `${ok}/${phones.length} numaraya gitti. Hata: ${errors.join(' • ')}` };
    return { success: false, message: errors.join(' • ') || 'Gönderilemedi.' };
}

module.exports = {
    configure, autoStart, start, stop,
    getConfig, setConfig, getStatus, getLog, resetWatermark, pollOnce, sendTest,
    clearPending,
};
