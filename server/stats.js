// ═══════════════════════════════════════════════════════════════════════════
//  Gönderim istatistiği / güven paneli katmanı (paylaşılan)
//  "Gönderildi" demek teslim edildi/okundu demek DEĞİL. Bu modül gerçek sonucu
//  toplar: kaç mesaj sunucuya iletildi, kaçı karşıya ULAŞTI (delivery ack), kaçı
//  OKUNDU (read ack), kaç YANIT geldi, kaç HATA oldu. Böylece "gönderdim ama
//  ulaşmıyor / shadowban" durumu sayıyla görünür, körlemesine gönderim biter.
//
//  Veri kaynağı — hepsi whatsapp.js'ten:
//    • recordSent({id,phone,channel})  → başarılı sock.sendMessage sonrası
//    • recordFail(channel)             → sendMessage throw / başarısız
//    • onAck(id,status)                → messages.update (2=sunucu 3=teslim 4=okundu)
//    • onIncoming(phone)               → messages.upsert (gelen = olası yanıt)
//
//  DİKKAT: Okundu (status 4) karşı taraf "okundu bilgisi"ni KAPATTIYSA hiç gelmez.
//  Düşük okunma oranı "okunmadı" anlamına gelmez — panelde bu not gösterilir.
//  Teslim (status 3) ve yanıt sayımı güvenilirdir.
//
//  Günlük özet data/stats.json'da tutulur (son 60 gün); ledger + son-gönderilen
//  telefon seti bellekte (yeniden başlatma kaybeder — ack/yanıt saniyeler içinde
//  gelir, restart sonrası eski mesajların ack'i atfedilemez, kabul edilebilir).
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let STATE_PATH = null;
// state.days[YYYY-MM-DD] = {
//   sent, delivered, read, failed, replies,
//   ch:{ [kanal]:{sent,delivered,read} },   // kanal kırılımı (bulk/reminder/belge/manual/extre/aibot)
//   repliers:{ [phone]:1 }                    // gün içi benzersiz yanıtlayan (mükerrer sayımı önler)
// }
let state = { days: {}, engage: {}, guard: {} };

// id → { day, ch, phone, deliveredCounted, readCounted } — ack geldiğinde hangi
// güne/kanala yazılacağını bilmek + aynı mesajı iki kez saymamak için.
const ledger = new Map();
const MAX_LEDGER = 2000;

// phone → son gönderim ts. Bu sette olan bir numaradan mesaj gelirse "yanıt" say.
const recentSent = new Map();
const MAX_RECENT = 4000;
const REPLY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 gün içindeki gelen = yanıt

const KEEP_DAYS = 60;

// ─── Dönüş-budama (engagement guard) ──────────────────────────────────────────
// Otomatik tahsilat mesajlarına (belge/reminder) üst üste cevap vermeyen numaraya
// gönderimi durdur → şikayet/ban yüzeyini düşür. streak = son GELEN mesajdan bu yana
// giden ardışık OTOMATİK mesaj sayısı; o numaradan gelen her mesaj streak'i sıfırlar.
// state.engage[phone] = { out, inn, streak, lastOutAt, lastInAt }.
const AUTO_CHANNELS = new Set(['belge', 'reminder']);
const MAX_ENGAGE = 6000;
const ENGAGE_TTL_MS = 45 * 24 * 60 * 60 * 1000;
// VARSAYILAN AÇIK (11 Tem 2026): kapalıyken canlı bir kurulumda 31 mesaj gidip 0 yanıt
// geldi → tek yönlü/karşılıksız gönderim spam profili çizdi, numara WhatsApp hesap
// incelemesine düştü. Bu koruma tam bunun içindi; kapalı varsayılan onu işlevsiz
// bırakıyordu. Kullanıcı Pano'dan kapatabilir.
// askSaveContact da VARSAYILAN AÇIK: ilk otomatik temasta "numaramızı kaydedin" ricası
// eklenir. Rehbere kayıtlı olmayan numaradan gelen toplu mesaj spam sinyalidir; kayıt
// olması hem teslimi hem güveni artırır (aynı vakada ban'e giden etkenlerden biri).
const DEFAULT_GUARD = { enabled: true, noReplyLimit: 6, askSaveContact: true };

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const normPhone = (p) => String(p || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function configure(baseDir) {
    const dataDir = path.join(baseDir, 'data');
    try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch { /* yok say */ }
    STATE_PATH = path.join(dataDir, 'stats.json');
    load();
}

function load() {
    try {
        const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        if (raw && raw.days) state = raw;
    } catch { /* ilk çalıştırma */ }
    if (!state.engage || typeof state.engage !== 'object') state.engage = {};
    if (!state.guard || typeof state.guard !== 'object') state.guard = {};
}
function save() {
    try { if (STATE_PATH) fs.writeFileSync(STATE_PATH, JSON.stringify(state)); }
    catch { /* sayaç yazılamazsa gönderim etkilenmesin */ }
}

// Gün kaydını al/oluştur + eski günleri buda.
function ensureDay(day = dayKey()) {
    let d = state.days[day];
    if (!d) {
        d = { sent: 0, delivered: 0, read: 0, failed: 0, replies: 0, ch: {}, repliers: {} };
        state.days[day] = d;
        pruneDays();
    }
    if (!d.ch) d.ch = {};
    if (!d.repliers) d.repliers = {};
    return d;
}
function pruneDays() {
    const keys = Object.keys(state.days).sort();
    while (keys.length > KEEP_DAYS) {
        delete state.days[keys.shift()];
    }
    // Dünden eski günlerde repliers detayını at (count zaten replies'ta), dosya şişmesin.
    const today = dayKey();
    const ykey = dayKey(new Date(Date.now() - 86_400_000));
    for (const k of Object.keys(state.days)) {
        if (k !== today && k !== ykey && state.days[k].repliers) state.days[k].repliers = {};
    }
}
function chBucket(d, ch) {
    const name = ch || 'other';
    if (!d.ch[name]) d.ch[name] = { sent: 0, delivered: 0, read: 0 };
    return d.ch[name];
}

// ─── Başarılı gönderim ────────────────────────────────────────────────────────
function recordSent({ id, phone, channel } = {}) {
    if (!STATE_PATH) return;
    const day = dayKey();
    const d = ensureDay(day);
    d.sent++;
    chBucket(d, channel).sent++;

    const ph = normPhone(phone);
    if (id) {
        ledger.set(id, { day, ch: channel || 'other', phone: ph, deliveredCounted: false, readCounted: false });
        if (ledger.size > MAX_LEDGER) ledger.delete(ledger.keys().next().value);
    }
    if (ph) {
        recentSent.set(ph, Date.now());
        if (recentSent.size > MAX_RECENT) recentSent.delete(recentSent.keys().next().value);
    }
    // Dönüş-budama: yalnız OTOMATİK kanallar (belge/reminder) streak'i artırır. Manuel/
    // toplu/AI cevabı sayılmaz (operatör/karşı taraf kaynaklı → susturma tetiklemesin).
    if (ph && AUTO_CHANNELS.has(channel)) {
        const e = engageOf(ph);
        e.out++; e.streak++; e.lastOutAt = Date.now();
    }
    save();
}

// ─── Başarısız gönderim ───────────────────────────────────────────────────────
function recordFail(channel) {
    if (!STATE_PATH) return;
    const d = ensureDay();
    d.failed++;
    save();
}

// ─── Teslim / okundu makbuzu (messages.update) ────────────────────────────────
// status: 2=sunucu aldı, 3=karşıya TESLİM, 4=OKUNDU. Aynı id için teslim ve okundu
// birer kez sayılır (ledger flag'leri). Ledger'de yoksa (restart) atfedilemez → yok say.
function onAck(id, status) {
    if (!STATE_PATH || !id) return;
    const e = ledger.get(id);
    if (!e) return;
    const s = Number(status);
    let changed = false;
    const d = ensureDay(e.day);
    if (s >= 3 && !e.deliveredCounted) {
        e.deliveredCounted = true;
        d.delivered++;
        chBucket(d, e.ch).delivered++;
        changed = true;
    }
    if (s >= 4 && !e.readCounted) {
        e.readCounted = true;
        d.read++;
        chBucket(d, e.ch).read++;
        changed = true;
    }
    if (changed) save();
}

// ─── Gelen mesaj = olası yanıt (messages.upsert) ──────────────────────────────
// Yalnız SON 3 GÜN içinde mesaj attığımız numaradan gelen sayılır (rastgele gelen
// mesaj değil). Gün içinde aynı numara birden çok yazsa da 1 yanıt (repliers seti).
function onIncoming(phone) {
    if (!STATE_PATH) return;
    const ph = normPhone(phone);
    if (!ph) return;
    // Dönüş-budama: bu numaradan gelen mesaj = etkileşim → streak sıfırla (kayıt varsa).
    // recentSent penceresinden bağımsız (herhangi bir cevap susturmayı kaldırır). Rastgele
    // gelen için kayıt AÇMA (yalnız daha önce otomatik mesaj attıklarımız izlenir).
    if (state.engage && state.engage[ph]) {
        const e = state.engage[ph];
        e.inn = (e.inn || 0) + 1; e.streak = 0; e.lastInAt = Date.now();
        save();
    }
    const ts = recentSent.get(ph);
    if (!ts || (Date.now() - ts) > REPLY_WINDOW_MS) return; // bizim mesajımıza yanıt değil
    const d = ensureDay();
    if (d.repliers[ph]) return; // bugün zaten sayıldı
    d.repliers[ph] = 1;
    d.replies++;
    save();
}

// ─── Okuma tarafı (UI / özet) ─────────────────────────────────────────────────
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function today() {
    const day = dayKey();
    const d = state.days[day] || { sent: 0, delivered: 0, read: 0, failed: 0, replies: 0, ch: {} };
    const byChannel = Object.entries(d.ch || {})
        .map(([ch, v]) => ({ ch, sent: v.sent || 0, delivered: v.delivered || 0, read: v.read || 0 }))
        .filter(x => x.sent > 0)
        .sort((a, b) => b.sent - a.sent);
    return {
        date: day,
        sent: d.sent || 0,
        delivered: d.delivered || 0,
        read: d.read || 0,
        failed: d.failed || 0,
        replies: d.replies || 0,
        deliveredRate: pct(d.delivered || 0, d.sent || 0),      // teslim / gönderilen
        readRate: pct(d.read || 0, d.delivered || 0),           // okundu / teslim
        replyRate: pct(d.replies || 0, d.delivered || 0),       // yanıt / teslim
        byChannel,
    };
}

// Son n günün özeti (grafik için, en eskiden yeniye).
function history(n = 7) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const day = dayKey(new Date(Date.now() - i * 86_400_000));
        const d = state.days[day] || {};
        out.push({
            date: day,
            sent: d.sent || 0,
            delivered: d.delivered || 0,
            read: d.read || 0,
            replies: d.replies || 0,
            failed: d.failed || 0,
        });
    }
    return out;
}

// Kendi telefonuna gönderilecek günlük özet metni.
function summaryText() {
    const t = today();
    return [
        `📊 Günlük gönderim özeti (${t.date})`,
        `• Gönderildi: ${t.sent}`,
        `• Ulaştı: ${t.delivered} (%${t.deliveredRate})`,
        `• Okundu: ${t.read} (%${t.readRate})`,
        `• Yanıt: ${t.replies}`,
        `• Hata: ${t.failed}`,
    ].join('\n');
}

// ─── Engagement / guard iç yardımcıları ───────────────────────────────────────
function engageOf(ph) {
    if (!state.engage) state.engage = {};
    let e = state.engage[ph];
    if (!e) { e = { out: 0, inn: 0, streak: 0, lastOutAt: 0, lastInAt: 0 }; state.engage[ph] = e; pruneEngage(); }
    return e;
}
function pruneEngage() {
    const keys = Object.keys(state.engage || {});
    if (keys.length <= MAX_ENGAGE) return;
    const cut = Date.now() - ENGAGE_TTL_MS;
    for (const p of keys) {
        const e = state.engage[p];
        if (Math.max(e.lastOutAt || 0, e.lastInAt || 0) < cut) delete state.engage[p];
    }
    let rest = Object.keys(state.engage);
    if (rest.length > MAX_ENGAGE) {
        rest.sort((a, b) => Math.max(state.engage[a].lastOutAt || 0, state.engage[a].lastInAt || 0)
                          - Math.max(state.engage[b].lastOutAt || 0, state.engage[b].lastInAt || 0));
        while (rest.length > MAX_ENGAGE) delete state.engage[rest.shift()];
    }
}

function guardConfig() {
    const g = state.guard || {};
    return {
        // enabled hiç yazılmamışsa VARSAYILANA düş (açık). `g.enabled === true` demek,
        // varsayılanı true yapsak bile yeni kurulumda kapalı bırakırdı. Kullanıcı Pano'dan
        // kapatınca state'e false yazılır ve bu dal onu korur.
        enabled: g.enabled === undefined ? DEFAULT_GUARD.enabled : g.enabled === true,
        noReplyLimit: Math.max(1, Number(g.noReplyLimit) || DEFAULT_GUARD.noReplyLimit),
        askSaveContact: g.askSaveContact === undefined ? DEFAULT_GUARD.askSaveContact : g.askSaveContact === true,
    };
}
function setGuard(patch = {}) {
    const cur = guardConfig();
    state.guard = {
        enabled: patch.enabled !== undefined ? patch.enabled === true : cur.enabled,
        noReplyLimit: patch.noReplyLimit !== undefined ? Math.max(1, Number(patch.noReplyLimit) || cur.noReplyLimit) : cur.noReplyLimit,
        askSaveContact: patch.askSaveContact !== undefined ? patch.askSaveContact === true : cur.askSaveContact,
    };
    save();
    return guardConfig();
}

// Bu numaraya otomatik gönderim şu an susturulmuş mu? (guard açık + streak >= limit)
function isSuspended(phone) {
    const g = guardConfig();
    if (!g.enabled) return false;
    const e = state.engage && state.engage[normPhone(phone)];
    return !!(e && e.streak >= g.noReplyLimit);
}
// İlk (otomatik) temas mı? → "numaramızı kaydedin" ricası yalnız ilk mesajda eklensin.
function shouldAskSave(phone) {
    const g = guardConfig();
    if (!g.askSaveContact) return false;
    const e = state.engage && state.engage[normPhone(phone)];
    return !e || (e.out || 0) === 0;
}
// Susturmayı elle kaldır (streak sıfırla). phone verilmezse hepsini.
function resetEngage(phone) {
    if (phone) { const e = state.engage && state.engage[normPhone(phone)]; if (e) { e.streak = 0; save(); } return 1; }
    let n = 0;
    for (const p of Object.keys(state.engage || {})) { if (state.engage[p].streak) { state.engage[p].streak = 0; n++; } }
    if (n) save();
    return n;
}
// UI özeti: izlenen numara sayısı + susturulanlar (streak azalan).
function engageSummary() {
    const g = guardConfig();
    const arr = Object.entries(state.engage || {});
    const suspended = arr
        .filter(([, e]) => e.streak >= g.noReplyLimit)
        .map(([phone, e]) => ({ phone, streak: e.streak, out: e.out || 0, lastOutAt: e.lastOutAt || 0 }))
        .sort((a, b) => b.streak - a.streak);
    return {
        enabled: g.enabled, noReplyLimit: g.noReplyLimit, askSaveContact: g.askSaveContact,
        tracked: arr.length, suspendedCount: suspended.length, suspended: suspended.slice(0, 100),
    };
}

module.exports = {
    configure, recordSent, recordFail, onAck, onIncoming, today, history, summaryText,
    guardConfig, setGuard, isSuspended, shouldAskSave, resetEngage, engageSummary,
};
