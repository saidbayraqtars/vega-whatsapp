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
let state = { days: {} };

// id → { day, ch, phone, deliveredCounted, readCounted } — ack geldiğinde hangi
// güne/kanala yazılacağını bilmek + aynı mesajı iki kez saymamak için.
const ledger = new Map();
const MAX_LEDGER = 2000;

// phone → son gönderim ts. Bu sette olan bir numaradan mesaj gelirse "yanıt" say.
const recentSent = new Map();
const MAX_RECENT = 4000;
const REPLY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 gün içindeki gelen = yanıt

const KEEP_DAYS = 60;

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

module.exports = { configure, recordSent, recordFail, onAck, onIncoming, today, history, summaryText };
