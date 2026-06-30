// ═══════════════════════════════════════════════════════════════════════════
//  Periyodik Bakiye/Borç Hatırlatma (scheduler)
//  Olaydan bağımsız zamanlayıcı: belirli gün-sıklığı + saat + başlangıç tarihiyle
//  carilere bakiye/borç hatırlatması gönderir. 2 hazır kategori (hepsi default pasif).
//  HER İKİSİ DE SADECE BORÇLULARA (BAKIYE>0) gönderir; alacaklılara (BAKIYE<0) asla:
//    • anyBalance   — bakiyesi olan borçlular, VADESİ HENÜZ GEÇMEMİŞ (gecikmeGun<=0);
//                     mesajda son ödeme tarihini ({vade}) söyler, varsa.
//    • overdueBuyer — ALICI (FIRMATIPI 1/3) borç bakiyesi (BAKIYE>0), VADESİ GEÇMİŞ.
//
//  Vade/gecikme: cari hareketten FIFO yaşlandırma — ödemeler en eski borçlara
//  mahsup edilir; kalan en eski ödenmemiş borcun vadesi (belge tarihi + cari
//  OPSIYON günü, yoksa vadeGunDefault). geçmişse "gecikmiş", değilse "vadesi
//  gelecek" sayılır. anyBalance gecikenleri atlar, overdueBuyer vadesi
//  gelmemişleri atlar — aynı cariye çift mesaj gitmez.
//
//  Bağımlılıklar enjekte edilir:
//    configure({ getPool, sql, resolveCariContacts, reminderCandidateInds,
//                waSend, checkOnWhatsApp, waStatus, baseDir })
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const antiban = require('./antiban');

let deps = null;
let CONFIG_PATH = null;
let LOG_PATH = null;
let MANUAL_PHONES_PATH = null;
let MEDIA_DIR = null;
let DATA_DIR = null;

let timer = null;
let ticking = false;
// Zamanlayıcının bu process'te ilk başladığı an (≈ uygulama açılışı). isDue catch-up
// engelinde kullanılır: planlanan saat zamanlayıcı başlamadan ÖNCE geçtiyse o döngü
// atlanır (restart/güncelleme sonrası geçmiş pencereye toplu gönderim yapılmaz).
let schedulerStartedAt = null;
// Aynı hatırlatmanın aynı anda iki kez çalışmasını engeller (scheduler + elle "Şimdi gönder"
// / Önizle-onayla çakışınca aynı cariye çift gönderim olmasın).
const runningReminderIds = new Set();
let lastTickAt = null;
let lastError = null;
let lastResult = null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min));
const DAY_MS = 24 * 60 * 60 * 1000;

// Atomik JSON yazımı: önce .tmp'ye yaz, sonra rename. quitAndInstall (oto-güncelleme)
// process'i tam dosya yazılırken öldürürse yarım/bozuk JSON kalmasın → açılışta
// JSON.parse patlayıp config DEFAULT'a (perCariLastSent boş) düşmesin = TEKRAR gönderim.
function writeJsonAtomic(file, data) {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, file);
}

function defaultReminders() {
    const common = { intervalDays: 7, sendTime: '10:00', startDate: null, minAmount: 0, onlySmsGonder: false, verifyOnWhatsApp: true, vadeGunDefault: 90, media: null, lastRunAt: null, perCariLastSent: {}, perCariTried: {} };
    return [
        { id: 'anyBalance', type: 'anyBalance', name: 'Bakiye hatırlatma (kalan borç)', enabled: false,
            template: 'Sayın {firma}, güncel borç bakiyeniz {bakiye} TL. Ödemenizi rica ederiz.', ...common },
        // NOT: overdueBuyer (geciken/vade) şu an ASKIDA — UI'da gizli, default pasif.
        // Vade hesabı düzeltilince geri açılır. Kod korunur.
        { id: 'overdueBuyer', type: 'overdueBuyer', name: 'Geciken borç hatırlatma (borçlular)', enabled: false,
            template: 'Sayın {firma}, {kalan} TL tutarında, {gecikmeGun} gün vadesi geçmiş borcunuz bulunmaktadır (en eski vade: {enEskiVade}). Ödemenizi rica ederiz.', ...common },
    ];
}

let config = { firmaNo: null, donemNo: null, reminders: defaultReminders() };

// ─── Kalıcılık ───────────────────────────────────────────────────────────────
function configure(d) {
    deps = d;
    const dataDir = path.join(d.baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    DATA_DIR = dataDir;
    CONFIG_PATH = path.join(dataDir, 'reminders.json');
    LOG_PATH = path.join(dataDir, 'reminders-log.json');
    MANUAL_PHONES_PATH = path.join(dataDir, 'manual-phones.json');
    MEDIA_DIR = dataDir;
    loadConfig();
    loadLog();
    loadManualPhones();
    // Config sıfırlansa/bozulsa bile log dururken dedup'ı geri kur (tekrar gönderim önler).
    try { rebuildDedupFromLog(); } catch (e) { console.error('[Reminders] dedup onarımı:', e.message); }
    // Tek seferlik baz çizgisi (bu güncellemeye özel): geçmiş logu temizle + mevcut
    // döngüyü "çalışmış" say → güncelleme sonrası geçmiş tarihli gönderim TEKRARLANMAZ.
    try { applyOneTimeBaseline(); } catch (e) { console.error('[Reminders] baz çizgisi:', e.message); }
}

// Tek seferlik geçiş (yalnız bir kez, marker dosyasıyla): kullanıcının isteğiyle bu
// güncellemede geçmiş gönderim log'u temizlenir ve her hatırlatma "bu döngü için
// çalışmış" işaretlenir (lastRunAt=now). Böylece gönderim günü/saati geçmiş olduğu
// için güncelleme/yeniden başlatma anında ne tekrar gönderim ne de gönderilemeyenlere
// yeniden deneme olur; hatırlatma bir SONRAKİ periyotta normal saatinde devam eder.
const BASELINE_MARKER = '.rm-baseline-v1';
const LASTRUN_RESET_MARKER = '.rm-lastrun-reset-v2';
function applyOneTimeBaseline() {
    if (!DATA_DIR) return;
    // v1 (tek seferlik): geçmiş gönderim log'unu temizle. ARTIK lastRunAt'a DOKUNMAZ
    // — eskiden now basıyordu, bu da ilk planlı gönderimi intervalDays boyunca
    // bloke ediyordu (saatinde kursan bile göndermiyordu). Bkz. v2 düzeltmesi.
    const m1 = path.join(DATA_DIR, BASELINE_MARKER);
    if (!fs.existsSync(m1)) {
        log = [];
        try { writeJsonAtomic(LOG_PATH, JSON.stringify(log)); } catch { /* yok say */ }
        try { fs.writeFileSync(m1, new Date().toISOString(), 'utf8'); } catch { /* yok say */ }
        console.log('[Reminders] v1 baz çizgisi: geçmiş log temizlendi.');
    }
    // v2 (tek seferlik onarım): önceki sürümde baz çizgisi lastRunAt=now basmış olan
    // kurulumlarda planlı gönderim intervalDays boyunca atlanıyordu. lastRunAt'ı bir
    // kez temizle (null) → hatırlatma bir SONRAKİ saatinde normal çalışsın. Mükerrer
    // gönderim perCariLastSent ile müşteri-başına engelli; catch-up engeli geçmiş
    // pencereyi yine atlar → toplu spam OLMAZ.
    const m2 = path.join(DATA_DIR, LASTRUN_RESET_MARKER);
    if (!fs.existsSync(m2)) {
        let changed = false;
        for (const rem of config.reminders || []) { if (rem.lastRunAt != null) { rem.lastRunAt = null; changed = true; } }
        if (changed) saveConfig();
        try { fs.writeFileSync(m2, new Date().toISOString(), 'utf8'); } catch { /* yok say */ }
        console.log('[Reminders] v2 onarım: lastRunAt temizlendi (planlı gönderim bir sonraki saatinde çalışır).');
    }
}

// ─── Elle eklenen telefonlar (UYGULAMA İÇİ — DB'ye YAZILMAZ) ──────────────────
// Telefonu olmayan carilere, kullanıcının uygulama içinden girdiği numaralar.
// Anahtar: `${firmaNo}:${ind}` → normalize edilmiş numara. data/manual-phones.json.
let manualPhones = {};
function loadManualPhones() {
    try { if (fs.existsSync(MANUAL_PHONES_PATH)) { const m = JSON.parse(fs.readFileSync(MANUAL_PHONES_PATH, 'utf8')); if (m && typeof m === 'object') manualPhones = m; } }
    catch (e) { console.error('[Reminders] elle telefonlar okunamadı:', e.message); }
}
function saveManualPhones() {
    try { writeJsonAtomic(MANUAL_PHONES_PATH, JSON.stringify(manualPhones, null, 2)); }
    catch (e) { console.error('[Reminders] elle telefonlar yazılamadı:', e.message); }
}
function manualKey(firmaNo, ind) { return `${firmaNo}:${ind}`; }
function getManualPhone(firmaNo, ind) { return manualPhones[manualKey(firmaNo, ind)] || null; }
// Aktif firmaya (config.firmaNo) elle numara kaydet/sil. phone boşsa siler.
function setManualPhone(ind, phone) {
    if (!config.firmaNo) return { ok: false, message: 'Firma seçilmemiş' };
    const key = manualKey(config.firmaNo, ind);
    if (phone) manualPhones[key] = String(phone);
    else delete manualPhones[key];
    saveManualPhones();
    return { ok: true, ind, phone: phone || null };
}
// Telefonu/geçerli numarası yoksa elle eklenen numarayı uygula (DB'ye dokunmaz).
function withManualPhone(firmaNo, ind, contact) {
    if (contact && contact.phone && contact.valid) return contact;
    const mp = getManualPhone(firmaNo, ind);
    if (mp) return { ...contact, phone: mp, valid: true, phoneManual: true };
    return contact || {};
}

function normalizeReminder(r, prev) {
    const type = ['anyBalance', 'overdueBuyer'].includes(r.type) ? r.type : 'anyBalance';
    const media = (r.media !== undefined) ? r.media : (prev ? prev.media : null);
    return {
        id: r.id || type,
        type,
        name: (r.name || '').toString().trim() || type,
        enabled: r.enabled === true,
        template: (r.template || '').toString(),
        intervalDays: Math.max(1, Number(r.intervalDays) || 7),
        sendTime: /^\d{1,2}:\d{2}$/.test(r.sendTime || '') ? r.sendTime : '10:00',
        startDate: r.startDate || null,
        minAmount: Math.max(0, Number(r.minAmount) || 0),
        onlySmsGonder: r.onlySmsGonder === true,
        verifyOnWhatsApp: r.verifyOnWhatsApp !== false,
        vadeGunDefault: Math.max(0, Number(r.vadeGunDefault) || 90),
        media: media || null,
        // çalışma durumu korunur (UI göndermezse eski değer)
        lastRunAt: (r.lastRunAt !== undefined) ? r.lastRunAt : (prev ? prev.lastRunAt : null),
        perCariLastSent: (r.perCariLastSent !== undefined) ? r.perCariLastSent : (prev ? prev.perCariLastSent : {}) || {},
        // Başarısız/atlanan cariler (telefon yok / WA yok / hata) — OTOMATİK tekrar
        // denenmez; yalnız elle "Yeniden dene" (sendOne) ile temizlenir/gönderilir.
        perCariTried: (r.perCariTried !== undefined) ? r.perCariTried : (prev ? prev.perCariTried : {}) || {},
    };
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            // Göç: alacaklılara mesaj atan eski 'creditorSupplier' kaldırıldı.
            // Göç: overdueBuyer (geciken/vade) şu an askıda → zorla pasif (kart gizli).
            const rawRems = (Array.isArray(raw.reminders) ? raw.reminders : [])
                .filter(r => r && r.type !== 'creditorSupplier')
                .map(r => r && r.type === 'overdueBuyer' ? { ...r, enabled: false } : r);
            config = {
                firmaNo: raw.firmaNo || null, donemNo: raw.donemNo || null,
                reminders: rawRems.length ? rawRems.map(r => normalizeReminder(r)) : defaultReminders(),
            };
        }
    } catch (e) { console.error('[Reminders] config okunamadı:', e.message); }
}
function saveConfig() {
    try { writeJsonAtomic(CONFIG_PATH, JSON.stringify(config, null, 2)); }
    catch (e) { console.error('[Reminders] config yazılamadı:', e.message); }
}

let log = [];
function loadLog() {
    try { if (fs.existsSync(LOG_PATH)) { const l = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); if (Array.isArray(l)) log = l; } }
    catch (e) { console.error('[Reminders] günlük okunamadı:', e.message); }
}
function pushLog(entry) {
    log.unshift({ ...entry, at: new Date().toISOString() });
    if (log.length > 200) log.length = 200;
    try { writeJsonAtomic(LOG_PATH, JSON.stringify(log)); } catch { /* bellekte devam */ }
}

// Dedup'ı (perCariLastSent) gönderim LOG'undan yeniden kur. config dosyası
// güncelleme/restart sırasında sıfırlanır/bozulursa ama log dururken, daha önce
// gönderilen cariler buradan geri yüklenir → planlı tur tekrar çalışsa bile o
// carilere TEKRAR mesaj gitmez. Log 'sent' kayıtları artık {id, ind, at} taşır.
function rebuildDedupFromLog() {
    if (!Array.isArray(log) || !log.length) return;
    let changed = false;
    for (const rem of config.reminders || []) {
        rem.perCariLastSent = rem.perCariLastSent || {};
        for (const e of log) {
            if (!e || e.status !== 'sent' || e.ind == null) continue;
            if (e.id !== rem.id && e.reminder !== rem.name) continue; // hangi hatırlatma
            if (!e.at) continue;
            const cur = rem.perCariLastSent[e.ind];
            if (!cur || new Date(e.at).getTime() > new Date(cur).getTime()) {
                rem.perCariLastSent[e.ind] = e.at; changed = true;
            }
        }
    }
    if (changed) saveConfig();
}

// ─── Görsel/video (hatırlatma başına) ─────────────────────────────────────────
function clearMediaFileByDesc(desc) {
    if (desc && desc.path && MEDIA_DIR) {
        try { const f = path.join(MEDIA_DIR, desc.path); if (fs.existsSync(f)) fs.unlinkSync(f); }
        catch (e) { console.error('[Reminders] medya silinemedi:', e.message); }
    }
}
function setReminderMedia(id, file) {
    const rem = (config.reminders || []).find(r => r.id === id);
    if (!rem || !file || !file.buffer) return getStatus();
    const mt = file.mimetype || '';
    const kind = mt.startsWith('image/') ? 'image' : mt.startsWith('video/') ? 'video' : 'document';
    const ext = path.extname(file.originalname || '') || (kind === 'image' ? '.jpg' : kind === 'video' ? '.mp4' : '');
    clearMediaFileByDesc(rem.media);
    const fname = `reminder-media-${id}${ext}`;
    try { fs.writeFileSync(path.join(MEDIA_DIR, fname), file.buffer); }
    catch (e) { console.error('[Reminders] medya yazılamadı:', e.message); return getStatus(); }
    rem.media = { path: fname, mime: mt, kind, name: file.originalname || fname };
    saveConfig();
    return getStatus();
}
function clearReminderMedia(id) {
    const rem = (config.reminders || []).find(r => r.id === id);
    if (rem) { clearMediaFileByDesc(rem.media); rem.media = null; saveConfig(); }
    return getStatus();
}
function loadMediaFromDescriptor(desc) {
    if (!desc || !desc.path || !MEDIA_DIR) return null;
    try { const f = path.join(MEDIA_DIR, desc.path); if (!fs.existsSync(f)) return null;
        return { kind: desc.kind, buffer: fs.readFileSync(f), mimetype: desc.mime, fileName: desc.name };
    } catch { return null; }
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function fmtAmount(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function renderTemplate(tpl, v) {
    return antiban.applySpintax(tpl)
        .replace(/\{ad\}/gi, v.ad || '')
        .replace(/\{unvan\}/gi, v.ad || '')
        .replace(/\{firma\}/gi, v.firma || v.ad || '')
        .replace(/\{kod\}/gi, v.kod || '')
        .replace(/\{bakiye\}/gi, v.bakiye || '')
        .replace(/\{kalan\}/gi, v.kalan || v.bakiye || '')
        .replace(/\{tutar\}/gi, v.tutar || v.bakiye || '')
        .replace(/\{borc\}/gi, v.bakiye || '')
        .replace(/\{durum\}/gi, v.durum || '')
        .replace(/\{gecikmeGun\}/gi, v.gecikmeGun || '')
        .replace(/\{enEskiVade\}/gi, v.enEskiVade || '')
        .replace(/\{vade\}/gi, v.vade || '')
        .replace(/\{vadeNot\}/gi, v.vadeNot || '')
        .replace(/ ?\(\s*\)/g, '')      // boş parantez temizle: "( )"
        .replace(/[ \t]{2,}/g, ' ')     // {vadeNot} boşsa kalan çift boşluğu topla
        .replace(/[ \t]+([.,;:])/g, '$1')
        .trim();
}
async function tableExists(pool, name) {
    const r = pool.request();
    r.input('tbl', deps.sql.NVarChar, name);
    const res = await r.query(`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME=@tbl`);
    return res.recordset[0].c > 0;
}

// FIFO yaşlandırma: cands = [{ind, vadeGun}]. Map<ind,{gecikmeGun, enEskiVade}>.
async function fetchAging(pool, firma, donem, cands, vadeGunDefault) {
    const map = new Map();
    const ids = cands.map(c => parseInt(c.ind, 10)).filter(Number.isFinite);
    if (!ids.length || !donem) return map;
    const tbl = `F${firma}D${donem}TBLCARIHAREKETLERI`;
    if (!(await tableExists(pool, tbl))) return map;
    const rows = (await pool.request().query(`
        SELECT FIRMANO, TARIH, CAST(BORC AS DECIMAL(18,2)) AS BORC, CAST(ALACAK AS DECIMAL(18,2)) AS ALACAK
        FROM [${tbl}] WHERE FIRMANO IN (${ids.join(',')}) AND (BORC > 0 OR ALACAK > 0)
        ORDER BY FIRMANO, TARIH ASC, IND ASC
    `)).recordset;
    const byCari = new Map();
    for (const r of rows) { if (!byCari.has(r.FIRMANO)) byCari.set(r.FIRMANO, []); byCari.get(r.FIRMANO).push(r); }
    const vadeMap = new Map(cands.map(c => [parseInt(c.ind, 10), c.vadeGun]));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const [ind, list] of byCari) {
        let credit = 0; const debits = [];
        for (const r of list) {
            if (Number(r.ALACAK) > 0) credit += Number(r.ALACAK);
            if (Number(r.BORC) > 0) debits.push(r);
        }
        let rem = credit, oldestUnpaid = null;
        for (const d of debits) {
            const amt = Number(d.BORC);
            if (rem >= amt) { rem -= amt; continue; }
            oldestUnpaid = d.TARIH; break; // bu borç kısmen/tamamen ödenmemiş = en eski açık
        }
        if (!oldestUnpaid) { map.set(ind, { gecikmeGun: 0, enEskiVade: null }); continue; }
        const vadeGun = (vadeMap.get(ind) != null ? Number(vadeMap.get(ind)) : Number(vadeGunDefault)) || 0;
        const due = new Date(oldestUnpaid); due.setDate(due.getDate() + vadeGun); due.setHours(0, 0, 0, 0);
        const gun = Math.floor((today.getTime() - due.getTime()) / DAY_MS);
        map.set(ind, { gecikmeGun: gun, enEskiVade: due });
    }
    return map;
}

// Gerçek kalan bakiye: cari hareketten SUM(BORC)-SUM(ALACAK) (belge mesajlarıyla
// AYNI kaynak — watcher.fetchKalanBorc ile birebir). TBLCARI.BAKIYE güvenilmez.
// ids verilmezse dönemdeki tüm carileri döner. Map<ind, net> (net>0 = borçlu).
async function fetchNetBalances(pool, firma, donem, ids) {
    const map = new Map();
    if (!donem) return map;
    const tbl = `F${firma}D${donem}TBLCARIHAREKETLERI`;
    if (!(await tableExists(pool, tbl))) return map;
    const idNums = (ids || []).map(n => parseInt(n, 10)).filter(Number.isFinite);
    const idFilter = idNums.length ? ` WHERE FIRMANO IN (${idNums.join(',')})` : '';
    const rows = (await pool.request().query(`
        SELECT FIRMANO, CAST(SUM(BORC) - SUM(ALACAK) AS DECIMAL(18,2)) AS NET
        FROM [${tbl}]${idFilter} GROUP BY FIRMANO
    `)).recordset;
    for (const r of rows) map.set(r.FIRMANO, Number(r.NET));
    return map;
}

// anyBalance adayları: cari hareket net bakiyesi > 0 olan borçlular (belge ile aynı
// kaynak). [{IND,BAKIYE,FIRMATIPI,OPSIYON}] biçiminde — runReminder/preview ortak.
async function debtorCandidates(pool, firmaNo, donem, minAmount) {
    const netMap = await fetchNetBalances(pool, firmaNo, donem);
    const min = Math.max(0, Number(minAmount) || 0);
    const debtorIds = [];
    for (const [ind, net] of netMap) if (net > 0 && net >= min) debtorIds.push(ind);
    // Pasif (STATUS=2) / silinmiş carileri KAYNAKTA süz: aday listesine hiç girmesin
    // (hem önizleme listesinden hem gönderimden düşer). Net bakiye TBLCARI.STATUS'ü
    // bilmez; aktif IND kümesiyle kesiştir. activeCariInds yoksa eski davranış.
    const active = deps.activeCariInds ? await deps.activeCariInds(firmaNo, debtorIds) : null;
    const out = [];
    for (const ind of debtorIds) {
        if (active && !active.has(ind)) continue;
        out.push({ IND: ind, BAKIYE: netMap.get(ind), FIRMATIPI: null, OPSIYON: null });
    }
    return out;
}

// ─── Tek hatırlatma çalıştır ───────────────────────────────────────────────────
async function runReminder(rem, opts = {}) {
    // Eşzamanlı çalışma kilidi: aynı hatırlatma zaten çalışıyorsa (scheduler vs elle) atla.
    if (runningReminderIds.has(rem.id)) return { aborted: true, reason: 'Bu hatırlatma zaten çalışıyor' };
    runningReminderIds.add(rem.id);
    try {
        return await _runReminder(rem, opts);
    } finally {
        runningReminderIds.delete(rem.id);
    }
}

// opts.manual = kullanıcı tetikledi (Şimdi gönder) → gece penceresi VE perCariTried
// (otomatik-deneme engeli) baypas edilir.
async function _runReminder(rem, opts = {}) {
    const manual = opts.manual === true;
    const pool = deps.getPool();
    // aborted = çalıştırma hiç yapılamadı (DB/WA/firma yok) → lastRunAt İLERLEMEZ, sonraki tick'te tekrar.
    // skipped (aşağıda) = çalıştı ama N cari atlandı (telefonsuz/pasif/dedup) → lastRunAt İLERLER.
    if (!pool || !pool.connected) return { aborted: true, reason: 'Veritabanı bağlantısı yok' };
    if (!deps.waStatus().ready) return { aborted: true, reason: 'WhatsApp bağlı değil' };
    const firmaNo = config.firmaNo;
    if (!firmaNo) return { aborted: true, reason: 'Firma seçilmemiş' };

    // anyBalance: bakiye = cari hareket net (belge mesajlarıyla AYNI). overdueBuyer (askıda): eski yol.
    const cands = rem.type === 'anyBalance'
        ? await debtorCandidates(pool, firmaNo, config.donemNo, rem.minAmount || 0)
        : await deps.reminderCandidateInds(firmaNo, rem.type, rem.minAmount || 0); // [{IND,BAKIYE,FIRMATIPI,OPSIYON}]
    if (!cands.length) { lastResult = { id: rem.id, sent: 0, total: 0, note: 'Aday cari yok', at: new Date().toISOString() }; return { sent: 0, skipped: 0, total: 0 }; }

    const contacts = await deps.resolveCariContacts(firmaNo, cands.map(c => c.IND));
    // Vade/gecikme yalnız overdueBuyer (askıda) için. anyBalance vade kullanmaz.
    let agingMap = new Map();
    if (rem.type === 'overdueBuyer') {
        agingMap = await fetchAging(pool, firmaNo, config.donemNo, cands.map(c => ({ ind: c.IND, vadeGun: c.OPSIYON })), rem.vadeGunDefault || 90);
    }
    const media = loadMediaFromDescriptor(rem.media);
    let sent = 0, skipped = 0, interrupted = false, stopReason = null;
    const nowIso = new Date().toISOString();
    rem.perCariLastSent = rem.perCariLastSent || {};
    rem.perCariTried = rem.perCariTried || {};

    for (const c of cands) {
        if (!deps.waStatus().ready) { interrupted = true; stopReason = 'WhatsApp bağlı değil'; break; }
        // Gece penceresi (otomatik): gönderim saati dışındaysa dur — sırada beklesin.
        // Manuel "Şimdi gönder" baypas eder. lastRunAt ilerlemez → pencere açılınca sürer.
        if (!manual && antiban.inQuietHours()) { interrupted = true; stopReason = antiban.quietReason(); break; }
        // Anti-ban tavanı (warm-up/saatlik/günlük) doldu → turu kes; lastRunAt ilerlemez.
        const gate = antiban.gate(deps.waStatus().me, null, 'reminder');
        if (!gate.ok) { interrupted = true; stopReason = gate.reason; break; }

        const contact = withManualPhone(firmaNo, c.IND, contacts.get(c.IND) || {});
        const bakiye = c.BAKIYE != null ? Number(c.BAKIYE) : (contact.bakiye != null ? contact.bakiye : null);
        const durum = bakiye == null ? '' : (bakiye > 0 ? 'Borç' : bakiye < 0 ? 'Alacak' : '');
        const bakStr = bakiye != null ? fmtAmount(Math.abs(bakiye)) : '';
        const ag = agingMap.get(c.IND);
        // Bakiye HER log kaydında görünsün (borçlu olduğu, ne kadar olduğu bilinsin).
        const logBase = { reminder: rem.name, id: rem.id, ind: c.IND, name: contact.name, firma: contact.firma, phone: contact.phone || '', bakiye: bakStr, bakiyeDurum: durum };

        // Gecikme kategorisinde (overdueBuyer, askıda) vadesi geçmemişleri atla.
        if (rem.type === 'overdueBuyer' && (!ag || ag.gecikmeGun <= 0)) continue;

        // intervalDays içinde başarıyla gönderilmişe tekrar gönderme (dedup) — log yok.
        const last = rem.perCariLastSent[c.IND];
        if (last && (Date.now() - new Date(last).getTime()) < (rem.intervalDays || 7) * DAY_MS) { skipped++; continue; }

        // Daha önce denenip başarısız/atlanmış (telefon yok / WA yok / hata) → OTOMATİK
        // tekrar DENEME, tekrar LOGLAMA (flood'u da keser). Yalnız elle "Yeniden dene"
        // (sendOne) temizler. Manuel "Şimdi gönder" baypas eder (hepsini yeniden dener).
        if (!manual && rem.perCariTried[c.IND]) { skipped++; continue; }

        // Pasif cari (STATUS=2) → gönderme; bir kez logla, tekrar deneme.
        if (contact.pasif) { skipped++; rem.perCariTried[c.IND] = { status: 'pasif', at: nowIso }; saveConfig(); pushLog({ ...logBase, status: 'pasif', error: 'Cari pasif (STATUS=2) — gönderilmez' }); continue; }

        // onlySms FİLTRE'dir (yapılandırma değişebilir) → "tried" işaretleme, sessizce atla.
        if (rem.onlySmsGonder && !contact.smsGonder) { skipped++; continue; }

        if (!contact.phone || !contact.valid) {
            skipped++; rem.perCariTried[c.IND] = { status: 'noPhone', at: nowIso }; saveConfig();
            pushLog({ ...logBase, status: 'noPhone', error: 'Geçerli telefon yok' });
            continue;
        }

        const vadeStr = ag && ag.enEskiVade ? new Date(ag.enEskiVade).toLocaleDateString('tr-TR') : '';
        const vadeNot = vadeStr ? `Son ödeme tarihi ${vadeStr}. ` : '';
        const text = renderTemplate(rem.template, {
            ad: contact.name, firma: contact.firma || contact.name, kod: contact.kod,
            bakiye: bakStr, kalan: bakStr, tutar: bakStr, durum,
            gecikmeGun: ag ? String(ag.gecikmeGun) : '',
            enEskiVade: vadeStr, vade: vadeStr, vadeNot,
        });

        if (rem.verifyOnWhatsApp !== false) {
            const chk = await deps.checkOnWhatsApp(contact.phone);
            if (!chk.exists) {
                if (chk.transient) {
                    // WA GERÇEKTEN koptuysa turu kes; tek numara geçici hatası ise o cariyi
                    // atla (tried İŞARETLEME → bağlantı düzelince yine denenir).
                    if (!deps.waStatus().ready) { interrupted = true; stopReason = 'WhatsApp bağlantısı koptu'; break; }
                    skipped++; continue;
                }
                skipped++; rem.perCariTried[c.IND] = { status: 'notOnWhatsApp', at: nowIso }; saveConfig();
                pushLog({ ...logBase, status: 'notOnWhatsApp', error: 'WhatsApp kullanıcısı değil' });
                continue;
            }
        }
        const res = await deps.waSend(contact.phone, text, media, { simulateTyping: true, typingMs: rand(1200, 2400) });
        if (res.success) {
            antiban.recordSent(deps.waStatus().me, 'reminder');
            sent++; rem.perCariLastSent[c.IND] = nowIso; delete rem.perCariTried[c.IND];
            pushLog({ ...logBase, gecikmeGun: ag ? ag.gecikmeGun : undefined, status: 'sent', message: text });
        } else {
            // Gönderim hatası → OTOMATİK tekrar DENEME; elle "Yeniden dene" gerekir.
            rem.perCariTried[c.IND] = { status: 'failed', at: nowIso, error: res.error };
            pushLog({ ...logBase, status: 'failed', error: res.error });
        }
        saveConfig(); // perCariLastSent / perCariTried kalıcı
        // Anti-ban: tahsilat mesajı yüksek riskli → insansı, yavaş tempo. Her mesaj arası
        // 12-30 sn; her 20 başarılı gönderimde 1-2.5 dk mola.
        if (res.success && sent % 20 === 0) await sleep(rand(60000, 150000));
        else await sleep(rand(12000, 30000));
    }
    const note = `${sent} gönderildi${skipped ? `, ${skipped} atlandı` : ''}${interrupted ? ` (durdu${stopReason ? ': ' + stopReason : ''}, sürecek)` : ''}`;
    lastResult = { id: rem.id, sent, skipped, total: cands.length, interrupted, stopReason, note, at: new Date().toISOString() };
    return { sent, skipped, total: cands.length, interrupted };
}

// ─── Kuru çalıştırma / önizleme (GÖNDERMEZ) ──────────────────────────────────
// runReminder ile AYNI aday seçimi + vade/gecikme + filtre mantığını uygular ama
// hiç mesaj GÖNDERMEZ, dedup'ı (perCariLastSent) GÜNCELLEMEZ. Kime, hangi
// bakiye/vade/gecikme ile, hangi metnin gideceğini satır satır döner. WhatsApp
// numara kontrolü atlanır (yalnız "telefon var/geçerli mi" gösterilir) — onay öncesi.
async function previewReminder(rem) {
    const pool = deps.getPool();
    if (!pool || !pool.connected) return { ok: false, reason: 'Veritabanı bağlantısı yok' };
    const firmaNo = config.firmaNo;
    if (!firmaNo) return { ok: false, reason: 'Firma seçilmemiş' };

    const cands = rem.type === 'anyBalance'
        ? await debtorCandidates(pool, firmaNo, config.donemNo, rem.minAmount || 0)
        : await deps.reminderCandidateInds(firmaNo, rem.type, rem.minAmount || 0);
    if (!cands.length) return { ok: true, total: 0, willSend: 0, rows: [], note: 'Aday cari yok' };

    const contacts = await deps.resolveCariContacts(firmaNo, cands.map(c => c.IND));
    let agingMap = new Map();
    if (rem.type === 'overdueBuyer') {
        agingMap = await fetchAging(pool, firmaNo, config.donemNo, cands.map(c => ({ ind: c.IND, vadeGun: c.OPSIYON })), rem.vadeGunDefault || 90);
    }

    const rows = [];
    let willSend = 0;
    for (const c of cands) {
        const contact = withManualPhone(firmaNo, c.IND, contacts.get(c.IND) || {});
        const bakiye = c.BAKIYE != null ? Number(c.BAKIYE) : (contact.bakiye != null ? contact.bakiye : null);
        const durum = bakiye == null ? '' : (bakiye > 0 ? 'Borç' : bakiye < 0 ? 'Alacak' : '');
        const ag = agingMap.get(c.IND);

        let skip = null;
        if (rem.type === 'overdueBuyer' && (!ag || ag.gecikmeGun <= 0)) skip = 'Vadesi geçmemiş';
        else if (contact.pasif) skip = 'Cari pasif (STATUS=2)';
        else {
            const last = rem.perCariLastSent[c.IND];
            if (last && (Date.now() - new Date(last).getTime()) < (rem.intervalDays || 7) * DAY_MS) skip = 'Sıklık içinde zaten gönderildi';
            else if (rem.perCariTried && rem.perCariTried[c.IND]) skip = 'Daha önce denendi — elle "Yeniden dene"';
            else if (rem.onlySmsGonder && !contact.smsGonder) skip = 'Sadece SMS izinli seçili — izin yok';
            else if (!contact.phone || !contact.valid) skip = 'Geçerli telefon yok';
        }

        const bakStr = bakiye != null ? fmtAmount(Math.abs(bakiye)) : '';
        const vadeStr = ag && ag.enEskiVade ? new Date(ag.enEskiVade).toLocaleDateString('tr-TR') : '';
        const vadeNot = vadeStr ? `Son ödeme tarihi ${vadeStr}. ` : '';
        const message = renderTemplate(rem.template, {
            ad: contact.name, firma: contact.firma || contact.name, kod: contact.kod,
            bakiye: bakStr, kalan: bakStr, tutar: bakStr, durum,
            gecikmeGun: ag ? String(ag.gecikmeGun) : '',
            enEskiVade: vadeStr, vade: vadeStr, vadeNot,
        });

        if (!skip) willSend++;
        rows.push({
            ind: c.IND,
            name: contact.name || String(c.IND),
            firma: contact.firma || contact.name || '',
            phone: contact.phone || '',
            valid: !!contact.valid,
            phoneManual: !!contact.phoneManual,
            bakiye, bakiyeStr: bakStr, durum,
            vade: vadeStr, gecikmeGun: ag ? ag.gecikmeGun : null,
            willSend: !skip, skipReason: skip,
            message,
        });
    }
    // Gönderilecekler üste.
    rows.sort((a, b) => (a.willSend === b.willSend) ? 0 : (a.willSend ? -1 : 1));
    return { ok: true, total: cands.length, willSend, donemNo: config.donemNo, rows };
}

async function preview(id) {
    const rem = (config.reminders || []).find(r => r.id === id);
    if (!rem) return { ok: false, reason: 'Hatırlatma bulunamadı.' };
    return previewReminder(rem);
}

// Tek cariye elle gönder ("Yeniden dene"). Elle eklenen numara da kullanılır.
// Elle numarada WhatsApp varlık doğrulaması atlanır (kullanıcı bizzat girdi).
async function sendOne(id, ind) {
    const rem = (config.reminders || []).find(r => r.id === id);
    if (!rem) return { success: false, message: 'Hatırlatma bulunamadı.' };
    const pool = deps.getPool();
    if (!pool || !pool.connected) return { success: false, message: 'Veritabanı bağlantısı yok' };
    if (!deps.waStatus().ready) return { success: false, message: 'WhatsApp bağlı değil' };
    const firmaNo = config.firmaNo;
    if (!firmaNo) return { success: false, message: 'Firma seçilmemiş' };
    const indNum = parseInt(ind, 10);
    if (!Number.isFinite(indNum)) return { success: false, message: 'Geçersiz cari' };

    let bakiye = null;
    if (rem.type === 'anyBalance') {
        const netMap = await fetchNetBalances(pool, firmaNo, config.donemNo, [indNum]);
        bakiye = netMap.has(indNum) ? netMap.get(indNum) : null;
    }
    const contacts = await deps.resolveCariContacts(firmaNo, [indNum]);
    const contact = withManualPhone(firmaNo, indNum, contacts.get(indNum) || {});
    if (bakiye == null && contact.bakiye != null) bakiye = contact.bakiye;
    if (contact.pasif) return { success: false, message: 'Cari pasif (STATUS=2) — gönderilmez' };
    if (!contact.phone || !contact.valid) return { success: false, message: 'Geçerli telefon yok' };

    const durum = bakiye == null ? '' : (bakiye > 0 ? 'Borç' : bakiye < 0 ? 'Alacak' : '');
    const bakStr = bakiye != null ? fmtAmount(Math.abs(bakiye)) : '';
    const text = renderTemplate(rem.template, {
        ad: contact.name, firma: contact.firma || contact.name, kod: contact.kod,
        bakiye: bakStr, kalan: bakStr, tutar: bakStr, durum,
        gecikmeGun: '', enEskiVade: '', vade: '', vadeNot: '',
    });

    // DB numarası ise (elle değil) WA doğrulaması yap; elle numarayı doğrudan gönder.
    if (rem.verifyOnWhatsApp !== false && !contact.phoneManual) {
        const chk = await deps.checkOnWhatsApp(contact.phone);
        if (!chk.exists) return { success: false, message: chk.transient ? 'WhatsApp doğrulaması geçici hata — tekrar deneyin' : 'Numara WhatsApp kullanıcısı değil' };
    }
    const media = loadMediaFromDescriptor(rem.media);
    const res = await deps.waSend(contact.phone, text, media, { simulateTyping: true, typingMs: rand(1200, 2400) });
    if (res.success) {
        antiban.recordSent(deps.waStatus().me, 'reminder');
        rem.perCariLastSent = rem.perCariLastSent || {}; rem.perCariTried = rem.perCariTried || {};
        rem.perCariLastSent[indNum] = new Date().toISOString();
        delete rem.perCariTried[indNum];   // elle gönderildi → "denendi" engeli kalksın
        saveConfig();
        pushLog({ reminder: rem.name, id: rem.id, ind: indNum, name: contact.name, firma: contact.firma, phone: contact.phone, bakiye: bakStr, bakiyeDurum: durum, status: 'sent', message: text, manual: !!contact.phoneManual });
        return { success: true, message: 'Gönderildi', phone: contact.phone };
    }
    pushLog({ reminder: rem.name, id: rem.id, ind: indNum, name: contact.name, firma: contact.firma, phone: contact.phone, bakiye: bakStr, bakiyeDurum: durum, status: 'failed', error: res.error });
    return { success: false, message: res.error || 'Gönderilemedi' };
}

// ─── Zamanlayıcı ────────────────────────────────────────────────────────────────
// isDue false ise SEBEBİ döner (UI'da "neden göndermedi" görünsün); due ise null.
function dueReason(rem, now = new Date()) {
    if (!rem.enabled) return 'kapalı';
    if (rem.startDate) { const sd = new Date(rem.startDate); if (!isNaN(sd) && now < sd) return `başlangıç ${sd.toLocaleDateString('tr-TR')} sonrası`; }
    let target = null;
    if (rem.sendTime) {
        const [h, m] = String(rem.sendTime).split(':').map(Number);
        target = new Date(now); target.setHours(h || 0, m || 0, 0, 0);
        if (now < target) return `saati gelmedi (${rem.sendTime})`; // bugünün saati henüz gelmedi
    }
    // Catch-up engeli: planlanan saat zamanlayıcı başlamadan ÖNCE geçtiyse (uygulama
    // o saatten SONRA açıldı/güncellendi) bu döngüyü ATLA. 7/24 tray uygulaması saatinde
    // zaten çalışır → normal gönderir; sadece "kaçırılmış geçmiş pencere" atlanır, böylece
    // güncelleme/yeniden başlatma anında geçmiş tarihli toplu tekrar gönderim olmaz.
    if (target && schedulerStartedAt && schedulerStartedAt > target.getTime()) {
        return 'kaçırılan pencere atlandı (uygulama saatten sonra açıldı; bir sonraki gün gönderir)';
    }
    if (rem.lastRunAt) {
        const diff = now.getTime() - new Date(rem.lastRunAt).getTime();
        if (diff < (rem.intervalDays || 7) * DAY_MS) {
            const next = new Date(new Date(rem.lastRunAt).getTime() + (rem.intervalDays || 7) * DAY_MS);
            return `bu periyotta çalıştı (sonraki ~${next.toLocaleDateString('tr-TR')})`;
        }
    }
    return null;
}
function isDue(rem, now = new Date()) { return dueReason(rem, now) === null; }

async function tick() {
    if (ticking) return;
    ticking = true;
    lastTickAt = new Date().toISOString();
    lastError = null;
    try {
        let ranAny = false;
        const skips = [];
        for (const rem of config.reminders || []) {
            const reason = dueReason(rem);
            if (reason !== null) { if (rem.enabled) skips.push(`${rem.name}: ${reason}`); continue; }
            const res = await runReminder(rem);
            ranAny = true;
            // WA/DB yok (aborted) ya da yarıda kesildi (interrupted) → lastRunAt ilerletme, sonraki tick'te tekrar.
            // Atlanan cari olması (skipped>0) çalıştırmayı geçersiz kılmaz; lastRunAt ilerler.
            if (res && !res.aborted && !res.interrupted) { rem.lastRunAt = new Date().toISOString(); saveConfig(); }
        }
        // Hiçbiri çalışmadıysa NEDEN'i UI'da göster ("Son: ..." satırı) — kör kalmasın.
        if (!ranAny && skips.length) lastResult = { note: skips.join('  •  '), at: new Date().toISOString() };
    } catch (e) { lastError = e.message; console.error('[Reminders] tick hata:', e.message); }
    finally { ticking = false; }
}

function start() {
    stop();
    // İlk başlama anını bir kez sabitle (reconnect'lerde kaymasın) — catch-up engeli
    // bunu "uygulama ne zaman ayağa kalktı" referansı olarak kullanır.
    if (schedulerStartedAt == null) schedulerStartedAt = Date.now();
    tick();
    timer = setInterval(tick, 60 * 1000);
    if (timer.unref) timer.unref();
    console.log('[Reminders] zamanlayıcı başlatıldı (60sn tick)');
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }
function autoStart() { start(); } // zamanlayıcı hep çalışır; her hatırlatmanın enabled'ı kapı

// Elle test gönderimi (UI "Şimdi test gönder").
async function runNow(id) {
    const rem = (config.reminders || []).find(r => r.id === id);
    if (!rem) return { success: false, message: 'Hatırlatma bulunamadı.' };
    const res = await runReminder(rem, { manual: true });
    if (res && !res.aborted && !res.interrupted) { rem.lastRunAt = new Date().toISOString(); saveConfig(); }
    return { success: !res.aborted, message: res.aborted ? res.reason : (res.note || `${res.sent} gönderildi`), result: res };
}

function getConfig() { return { ...config }; }
function setConfig(patch) {
    const prev = config.reminders || [];
    const next = { ...config };
    if (patch.firmaNo !== undefined) next.firmaNo = patch.firmaNo || null;
    if (patch.donemNo !== undefined) next.donemNo = patch.donemNo || null;
    if (patch.reminders !== undefined) {
        const arr = Array.isArray(patch.reminders) ? patch.reminders : [];
        next.reminders = arr.map(r => normalizeReminder(r, prev.find(p => p.id === r.id)));
    }
    config = next;
    saveConfig();
    return getStatus();
}

function getStatus() {
    return {
        firmaNo: config.firmaNo, donemNo: config.donemNo,
        lastTickAt, lastError, lastResult,
        reminders: (config.reminders || []).map(r => ({
            id: r.id, type: r.type, name: r.name, enabled: r.enabled, template: r.template,
            intervalDays: r.intervalDays, sendTime: r.sendTime, startDate: r.startDate,
            minAmount: r.minAmount, onlySmsGonder: r.onlySmsGonder, verifyOnWhatsApp: r.verifyOnWhatsApp,
            vadeGunDefault: r.vadeGunDefault, lastRunAt: r.lastRunAt,
            media: r.media ? { name: r.media.name, kind: r.media.kind } : null,
        })),
    };
}
function getLog() { return log; }

module.exports = {
    configure, autoStart, start, stop, tick, runNow, preview, sendOne,
    setManualPhone, getManualPhone,
    getConfig, setConfig, getStatus, getLog,
    setReminderMedia, clearReminderMedia,
};
