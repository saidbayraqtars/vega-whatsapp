// ═══════════════════════════════════════════════════════════════════════════
//  Anti-ban / shadowban önleme katmanı (paylaşılan)
//  Üç gönderim kaynağı da (toplu job / watcher / reminders) gönderim ÖNCESİ
//  gate() çağırır, gönderim BAŞARILI olunca recordSent() çağırır. Böylece tek
//  merkezden:
//    • WARM-UP RAMP — yeni numara ilk günler düşük tavanla başlar, kademeli
//      artar (1. gün direkt 200 atıp yanmasın). Numara değişince (yeni QR /
//      yeni hesap) ramp KENDİLİĞİNDEN sıfırlanır (sayaç hesap kimliğine bağlı).
//    • SAATLİK TAVAN — günlük tavanı tek saatte boşaltmayı engeller (200'ü ilk
//      saatte atmak, güne yaymak kadar tehlikeli).
//    • GÜNLÜK TAVAN — warm-up rampı ile kullanıcı tavanının küçüğü.
//  Sayaçlar data/antiban.json'da hesap-başı tutulur; gün/saat dönünce sıfırlanır,
//  yeniden başlatma kaybetmez.
//
//  NOT: whatsapp.js'teki bumpDailySent ayrı "toplam bugün gönderilen" sayacıdır
//  (UI göstergesi). Burası gönderim İZNİNİ veren otoritedir.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// ─── Ayarlanabilir sınırlar ──────────────────────────────────────────────────
// warmupRamp[i] = numaranın i. aktif gününde izin verilen GÜNLÜK tavan. Son
// elemandan sonrası sabit kalır (olgun numara). Muhafazakâr: iş mesajı + Baileys
// (resmî olmayan) için güvenli kademe. Gerekirse buradan gevşetilir.
const WARMUP_RAMP = [20, 40, 60, 90, 130, 170, 200];
// Saatlik tavan: günlük tavanı tek saate sığdırmayı engeller. Olgun numarada
// 200/gün ≈ 40/saat ⇒ en az ~5 saate yayılır.
const HOURLY_CAP = 40;

let STATE_PATH = null;
// accounts[accountId] = {
//   firstActiveDate:'YYYY-MM-DD',
//   hour:{key,count},                         // SAATLİK tavan: hesap-geneli (ban koruması)
//   channels:{ [kanal]:{date,count} }          // GÜNLÜK tavan: KANAL-BAŞI ayrı sayaç
// }
// Kanallar (belge / reminder / bulk / manual) birbirinin günlük tavanını YEMEZ —
// biri dolunca diğeri durmaz. Saatlik tavan ortak kalır (toplam patlama koruması).
let state = { accounts: {} };

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);            // YYYY-MM-DD
const hourKey = (d = new Date()) => d.toISOString().slice(0, 13);           // YYYY-MM-DDTHH
const daysBetween = (fromKey, toKey) =>
    Math.max(0, Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000));

// Hesap kimliğini telefon numarasına indir: "905xxxxxxxxx:12@s.whatsapp.net" →
// "905xxxxxxxxx". Cihaz eki (:12) yeniden eşleşmede değişir; numara aynıyken
// warm-up'ı sıfırlamak istemeyiz, o yüzden numara kısmını anahtar yaparız.
const normAccount = (id) => String(id || 'unknown').split(':')[0].split('@')[0] || 'unknown';

function configure(baseDir) {
    const dataDir = path.join(baseDir, 'data');
    try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch { /* yok say */ }
    STATE_PATH = path.join(dataDir, 'antiban.json');
    load();
}

function load() {
    try {
        const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        if (raw && raw.accounts) state = raw;
    } catch { /* ilk çalıştırma */ }
}
function save() {
    try { if (STATE_PATH) fs.writeFileSync(STATE_PATH, JSON.stringify(state)); }
    catch { /* sayaç yazılamazsa gönderim engellenmesin */ }
}

// Hesap + kanal kaydını al/oluştur ve gün/saat dönüşünde sayaçları sıfırla.
// Döner: { acc, ch } — ch = bu kanalın bugünkü günlük sayacı.
function touch(accountId, channel = 'default') {
    const key = normAccount(accountId);
    const today = dayKey();
    const hr = hourKey();
    let acc = state.accounts[key];
    if (!acc) {
        acc = { firstActiveDate: today, hour: { key: hr, count: 0 }, channels: {} };
        state.accounts[key] = acc;
    }
    if (!acc.firstActiveDate) acc.firstActiveDate = today;
    if (!acc.channels) acc.channels = {};                 // eski şemadan göç (acc.day yok say)
    if (!acc.hour || acc.hour.key !== hr) acc.hour = { key: hr, count: 0 };
    let ch = acc.channels[channel];
    if (!ch || ch.date !== today) { ch = { date: today, count: 0 }; acc.channels[channel] = ch; }
    return { acc, ch };
}
// Hesabın bugün TÜM kanallardaki toplam gönderimi (UI göstergesi için).
function totalDaySent(acc) {
    const today = dayKey();
    return Object.values(acc.channels || {}).filter(c => c.date === today).reduce((s, c) => s + c.count, 0);
}

// Warm-up rampına göre bu numaranın bugünkü günlük tavanı.
function rampDailyCap(acc) {
    const idx = Math.min(daysBetween(acc.firstActiveDate, dayKey()), WARMUP_RAMP.length - 1);
    return WARMUP_RAMP[idx];
}

// Gönderim ÖNCESİ izin sorgusu. channel = bağımsız günlük sayaç ('belge'|'reminder'|
// 'bulk'|'manual'…). userDailyCap verilirse warm-up tavanıyla küçüğü alınır.
// GÜNLÜK tavan KANAL-BAŞI; SAATLİK tavan hesap-geneli (ortak).
// Döner: { ok, reason, dailyCap, daySent, hourCap, hourSent, dayIndex, capType, channel }
function gate(accountId, userDailyCap, channel = 'default') {
    if (!STATE_PATH) return { ok: true, dailyCap: null, daySent: 0, hourCap: HOURLY_CAP, hourSent: 0, dayIndex: 0, channel };
    const { acc, ch } = touch(accountId, channel);
    const dayIndex = daysBetween(acc.firstActiveDate, dayKey());
    const rampCap = rampDailyCap(acc);
    const dailyCap = (Number(userDailyCap) > 0) ? Math.min(rampCap, Number(userDailyCap)) : rampCap;

    if (ch.count >= dailyCap) {
        return { ok: false, capType: 'daily', channel, reason: `Günlük tavan doldu (${ch.count}/${dailyCap}${dayIndex < WARMUP_RAMP.length - 1 ? ', ısınma günü ' + (dayIndex + 1) : ''})`,
            dailyCap, daySent: ch.count, hourCap: HOURLY_CAP, hourSent: acc.hour.count, dayIndex };
    }
    if (acc.hour.count >= HOURLY_CAP) {
        return { ok: false, capType: 'hourly', channel, reason: `Saatlik tavan doldu (${acc.hour.count}/${HOURLY_CAP}) — sonraki saat sürer`,
            dailyCap, daySent: ch.count, hourCap: HOURLY_CAP, hourSent: acc.hour.count, dayIndex };
    }
    return { ok: true, channel, dailyCap, daySent: ch.count, hourCap: HOURLY_CAP, hourSent: acc.hour.count, dayIndex };
}

// Gönderim BAŞARILI olunca çağır: kanal-günlük + ortak-saatlik sayacı artır, diske yaz.
function recordSent(accountId, channel = 'default') {
    if (!STATE_PATH) return;
    const { acc, ch } = touch(accountId, channel);
    ch.count++;
    acc.hour.count++;
    save();
}

// ─── Gönderim saati penceresi (gece gönderme koruması) ───────────────────────
// Otomatik gönderimler (hatırlatma + belge watcher) yalnız [start,end] arasında
// yapılır; dışında sırada bekler. Manuel gönderim (toplu/Şimdi gönder/float) bu
// pencereye TABİ DEĞİL — kullanıcı bizzat tetikler. Varsayılan 10:00–20:00
// (akşam 20:00 → sabah 10:00 arası gönderilmez). data/antiban.json'da tutulur.
const DEFAULT_SEND_WINDOW = { enabled: true, start: '10:00', end: '20:00' };
const validTime = (t) => (/^\d{1,2}:\d{2}$/.test(String(t || '')) ? t : null);
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };

function getSendWindow() {
    const w = state.sendWindow || {};
    return { enabled: w.enabled !== false, start: validTime(w.start) || DEFAULT_SEND_WINDOW.start, end: validTime(w.end) || DEFAULT_SEND_WINDOW.end };
}
function setSendWindow(patch = {}) {
    const cur = getSendWindow();
    state.sendWindow = {
        enabled: patch.enabled !== undefined ? patch.enabled !== false : cur.enabled,
        start: validTime(patch.start) || cur.start,
        end: validTime(patch.end) || cur.end,
    };
    save();
    return getSendWindow();
}
// Şu an gönderim YASAK pencerede mi? (gece). Pencere gece yarısını aşabilir (örn 22:00–06:00).
function inQuietHours(now = new Date()) {
    const w = getSendWindow();
    if (!w.enabled) return false;
    const t = now.getHours() * 60 + now.getMinutes();
    const s = toMin(w.start), e = toMin(w.end);
    if (s === e) return false; // 24 saat açık
    const allowed = s < e ? (t >= s && t < e) : (t >= s || t < e);
    return !allowed;
}
function quietReason() {
    const w = getSendWindow();
    return `Gönderim saati dışı (${w.start}–${w.end} arası gönderilir) — sırada bekliyor`;
}

// ─── Metin varyasyonu (spintax) ──────────────────────────────────────────────
// Herkese BİREBİR aynı metin = spam imzası. Kullanıcı şablona "{a|b|c}" yazarak
// varyant tanımlar; her gönderimde rastgele biri seçilir. Örn:
//   "{Sayın|Değerli|Merhaba} {firma}, {güncel|şu anki} borç bakiyeniz {bakiye} TL."
// Yalnız İÇİNDE '|' olan süslü parantezler varyant sayılır; değişken token'ları
// ({firma}, {bakiye} — pipe yok) dokunulmaz. Pipe yoksa metin aynen döner.
function applySpintax(text) {
    let s = String(text || '');
    // İç içe olabilir; en içteki pipe'lı grubu tekrar tekrar çöz (sonsuz döngü
    // koruması: en fazla 20 tur).
    for (let i = 0; i < 20 && /\{[^{}]*\|[^{}]*\}/.test(s); i++) {
        s = s.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, body) => {
            const opts = body.split('|');
            return opts[Math.floor(Math.random() * opts.length)];
        });
    }
    return s;
}

// UI / teşhis için anlık durum (gönderime etkisi yok). daySent = TÜM kanal toplamı.
function snapshot(accountId, userDailyCap) {
    if (!STATE_PATH) return { dayIndex: 0, warmup: false, dailyCap: null, daySent: 0, hourCap: HOURLY_CAP, hourSent: 0 };
    const { acc } = touch(accountId, 'default');
    const dayIndex = daysBetween(acc.firstActiveDate, dayKey());
    const rampCap = rampDailyCap(acc);
    const dailyCap = (Number(userDailyCap) > 0) ? Math.min(rampCap, Number(userDailyCap)) : rampCap;
    return {
        dayIndex, warmup: dayIndex < WARMUP_RAMP.length - 1,
        dailyCap, daySent: totalDaySent(acc), hourCap: HOURLY_CAP, hourSent: acc.hour.count,
    };
}

module.exports = { configure, gate, recordSent, snapshot, applySpintax, getSendWindow, setSendWindow, inQuietHours, quietReason, WARMUP_RAMP, HOURLY_CAP };
