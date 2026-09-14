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
// 200/gün ≈ 40/saat ⇒ en az ~5 saate yayılır. Taze numarada bu üst sınır,
// warm-up günlük tavanına oranla küçültülür (bkz. effectiveHourlyCap).
const HOURLY_CAP = 40;

// ─── Kullanıcı ayarlı sınırlar (kalıcı) ───────────────────────────────────────
// userDailyCap: warm-up rampına EK üst sınır (kullanıcı 200'ü fazla bulursa 150'ye
//   çeker). null = yalnız ramp geçerli. Ramp ile küçüğü uygulanır.
// warnAt: SOFT uyarı eşiği — hesabın bugünkü TOPLAM gönderimi bu katı aşınca gate()
//   'warn' döner; UI onay ister. Eski/olgun numaralarda da geçerli (warm-up'tan bağımsız).
//   0 = uyarı kapalı. Onaylanınca bir sonraki kata kadar sürer.
const DEFAULT_LIMITS = { userDailyCap: null, warnAt: 120 };

// ─── Ban-şüphesi devre kesici (soğuma) ───────────────────────────────────────
// Bağlantı ban-şüpheli kapanınca (403 forbidden / 401 loggedOut) veya kısa sürede
// çok kopunca (ağ fırtınası), hesaba SOĞUMA konur → gate() o süre gönderime izin
// vermez. Amaç: FLAGLENEN numarayı dövmeyi kes. Flaglenen numaraya gönderime devam
// etmek uyarıyı tam bana çevirir; iki numaranın da yanmasının asıl mekanizması buydu.
const COOLDOWN_FORBIDDEN_MS = 24 * 60 * 60 * 1000; // 403 = hesap kısıtlı (kesin)
const COOLDOWN_LOGGEDOUT_MS = 2 * 60 * 60 * 1000;  // 401 = oturum düşürüldü (çoğu kez flag)
const COOLDOWN_REVOKED_MS = 24 * 60 * 60 * 1000;   // oturumu WA iptal etti = 403 ağırlığında
const COOLDOWN_STORM_MS = 30 * 60 * 1000;          // reconnect fırtınası
// Fırtına eşiği: STORM_WINDOW_MS içinde >= STORM_MAX_CLOSES kopma = anormal.
const STORM_WINDOW_MS = 10 * 60 * 1000;
const STORM_MAX_CLOSES = 8;
// Çakışma (conflict) eşiği: tek çakışma iyi huyludur (kullanıcı WA Web açtı), ama
// araya BAŞARILI bir 'open' girmeden tekrarlıyorsa sebep ikinci kopya değil,
// WhatsApp'ın cihazı düşürmesidir — ban/cihaz iptali aynı stream error'ı üretir.
const CONFLICT_WINDOW_MS = 30 * 60 * 1000;
const CONFLICT_MAX = 3;

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

// Bağlantı kapanışları oturum AÇILMADAN da gelir (connect sırasında 403) — o an
// waStatus().me boştur. Son bilinen numarayı kalıcı tut ki kapanış gerçek hesaba
// yazılsın, 'unknown' adında hiç okunmayan bir kovaya değil.
const rememberAccount = (id) => {
    const k = normAccount(id);
    if (k !== 'unknown' && state.lastAccountId !== k) { state.lastAccountId = k; save(); }
    return k;
};
const resolveAccount = (id) => {
    const k = normAccount(id);
    return k === 'unknown' && state.lastAccountId ? state.lastAccountId : k;
};

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
    // 'unknown' kovası: kimlik bilinmeden (henüz açılmamış oturumda) gelen kapanışlar
    // buraya yazılıyordu. gate() daima gerçek numarayla çağrıldığı için hiç okunmuyor,
    // sadece çöp. lastAccountId ile artık üretilmiyor; eskisini temizle.
    if (state.accounts && state.accounts.unknown) { delete state.accounts.unknown; save(); }
}
function save() {
    try { if (STATE_PATH) fs.writeFileSync(STATE_PATH, JSON.stringify(state)); }
    catch { /* sayaç yazılamazsa gönderim engellenmesin */ }
}

// ─── Kullanıcı sınırları (günlük cap + soft uyarı eşiği) ──────────────────────
function getLimits() {
    const l = state.limits || {};
    const cap = Number(l.userDailyCap);
    let warn;
    if (l.warnAt === 0 || l.warnAt === '0') warn = 0;                       // açıkça kapatılmış
    else warn = Number(l.warnAt) > 0 ? Math.floor(Number(l.warnAt)) : DEFAULT_LIMITS.warnAt;
    return { userDailyCap: cap > 0 ? Math.floor(cap) : null, warnAt: warn };
}
function setLimits(patch = {}) {
    const cur = getLimits();
    const next = { ...cur };
    if (patch.userDailyCap !== undefined) {
        const v = Number(patch.userDailyCap);
        next.userDailyCap = v > 0 ? Math.floor(v) : null;
    }
    if (patch.warnAt !== undefined) {
        const v = Number(patch.warnAt);
        next.warnAt = v >= 0 ? Math.floor(v) : cur.warnAt;                  // 0 = kapalı
    }
    state.limits = next;
    save();
    return getLimits();
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

// Saatlik tavanı günlük tavana oranla — taze numara günlük hakkını tek saatte
// boşaltmasın (gün-0: 20/gün → ~7/saat). Olgun numarada üst sınır HOURLY_CAP.
// Gözlemlenen ban: gün-0 numaraya 90 sn'de 6 mesaj + tek saatte 23 mesaj; sabit
// 40 saatlik tavan bunları hiç durdurmuyordu.
function effectiveHourlyCap(dailyCap) {
    const scaled = Math.ceil((Number(dailyCap) || HOURLY_CAP) / 3);
    return Math.max(6, Math.min(HOURLY_CAP, scaled));
}

// ─── Kapıyı devre dışı bırakma (resmî Cloud API modu) ────────────────────────
// Baileys'e özgü ban korumaları (warm-up rampı, saatlik tavan, 403 soğuması)
// yalnız resmî OLMAYAN istemcide anlamlıdır. Cloud API modunda hepsi yanlış
// pozitif üretir (1. gün 20 mesajda durmak gibi) → server.js bayrağı takar.
// Gönderim GÜN PENCERESİ (inQuietHours) bundan etkilenmez: o kullanıcı tercihi.
let bypassFn = () => false;
const bypass = () => { try { return !!bypassFn(); } catch { return false; } };
const setBypass = (fn) => { bypassFn = typeof fn === 'function' ? fn : (() => !!fn); };

// Gönderim ÖNCESİ izin sorgusu. channel = bağımsız günlük sayaç ('belge'|'reminder'|
// 'bulk'|'manual'…). userDailyCap verilirse warm-up tavanıyla küçüğü alınır.
// GÜNLÜK tavan KANAL-BAŞI; SAATLİK tavan hesap-geneli (ortak).
// Döner: { ok, reason, dailyCap, daySent, hourCap, hourSent, dayIndex, capType, channel }
function gate(accountId, userDailyCap, channel = 'default') {
    if (!STATE_PATH) return { ok: true, dailyCap: null, daySent: 0, hourCap: HOURLY_CAP, hourSent: 0, dayIndex: 0, channel };
    // Resmî kanal (Cloud API) modunda ısınma rampası/soğuma ANLAMSIZ: ban riski
    // yok, sınırı Meta'nın kademesi belirler. Kapı açılır; sayaçlar yine işlenir
    // (Pano göstergesi). Bayrağı server.js takar (bkz. setBypass).
    if (bypass()) {
        const { acc, ch } = touch(resolveAccount(accountId), channel);
        return { ok: true, bypass: true, dailyCap: null, daySent: ch.count, hourCap: null, hourSent: acc.hour.count, dayIndex: 0, channel };
    }
    rememberAccount(accountId);
    const { acc, ch } = touch(resolveAccount(accountId), channel);
    const dayIndex = daysBetween(acc.firstActiveDate, dayKey());
    const rampCap = rampDailyCap(acc);
    const lim = getLimits();
    const caps = [rampCap];
    if (Number(userDailyCap) > 0) caps.push(Number(userDailyCap));
    if (lim.userDailyCap) caps.push(lim.userDailyCap);                       // kullanıcı üst sınırı
    const dailyCap = Math.min(...caps);
    const hourCap = effectiveHourlyCap(dailyCap);

    // Ban-şüphesi soğuması aktifse hiç gönderme — flaglenen numarayı dövme.
    const now = Date.now();
    if (acc.cooldownUntil && acc.cooldownUntil > now) {
        const mins = Math.ceil((acc.cooldownUntil - now) / 60000);
        return { ok: false, capType: 'cooldown', channel,
            reason: `Ban koruması: gönderim ${mins} dk durduruldu (${acc.cooldownReason || 'anormal kopma'})`,
            dailyCap, daySent: ch.count, hourCap, hourSent: acc.hour.count, dayIndex, cooldownUntil: acc.cooldownUntil };
    }

    // Soft ban-uyarı eşiği (TÜM numaralar, eski/olgun dahil): hesabın bugün TÜM
    // kanallardaki TOPLAM gönderimi warnAt katını aşınca kullanıcı onayı gerekir.
    // Onaylanmadıkça gönderim DURUR (kuyruğa alınır); gün dönünce sayaç sıfır →
    // kendiliğinden sürer. acknowledgeWarn() o günkü kata onay verir.
    if (lim.warnAt > 0) {
        const today = dayKey();
        if (acc.warnDay !== today) { acc.warnDay = today; acc.warnAckLevel = 0; }
        const total = totalDaySent(acc);
        const level = Math.floor(total / lim.warnAt);
        if (level >= 1 && level > (acc.warnAckLevel || 0)) {
            return {
                ok: false, capType: 'warn', needsConfirm: true, channel,
                reason: `Ban uyarısı: bugün toplam ${total} mesaj gönderildi. Devam etmek ban riskini artırır — onayınız gerekiyor.`,
                dailyCap, daySent: ch.count, total, warnAt: lim.warnAt, warnLevel: level,
                hourCap, hourSent: acc.hour.count, dayIndex,
            };
        }
    }

    if (ch.count >= dailyCap) {
        return { ok: false, capType: 'daily', channel, reason: `Günlük tavan doldu (${ch.count}/${dailyCap}${dayIndex < WARMUP_RAMP.length - 1 ? ', ısınma günü ' + (dayIndex + 1) : ''})`,
            dailyCap, daySent: ch.count, hourCap, hourSent: acc.hour.count, dayIndex };
    }
    if (acc.hour.count >= hourCap) {
        return { ok: false, capType: 'hourly', channel, reason: `Saatlik tavan doldu (${acc.hour.count}/${hourCap}) — sonraki saat sürer`,
            dailyCap, daySent: ch.count, hourCap, hourSent: acc.hour.count, dayIndex };
    }
    return { ok: true, channel, dailyCap, daySent: ch.count, hourCap, hourSent: acc.hour.count, dayIndex };
}

// Gönderim BAŞARILI olunca çağır: kanal-günlük + ortak-saatlik sayacı artır, diske yaz.
function recordSent(accountId, channel = 'default') {
    if (!STATE_PATH) return;
    rememberAccount(accountId);
    const { acc, ch } = touch(resolveAccount(accountId), channel);
    ch.count++;
    acc.hour.count++;
    save();
}

// Kullanıcı "devam" onayı verince: o günkü uyarı katını onayla → sonraki kata (warnAt
// katı) kadar tekrar sormaz. Gün dönünce sıfırlanır (yeniden uyarılır).
function acknowledgeWarn(accountId) {
    if (!STATE_PATH) return { ok: true };
    const { acc } = touch(accountId);
    const lim = getLimits();
    const today = dayKey();
    if (acc.warnDay !== today) acc.warnDay = today;
    const total = totalDaySent(acc);
    acc.warnAckLevel = lim.warnAt > 0 ? Math.floor(total / lim.warnAt) : 0;
    save();
    return { ok: true, warnAckLevel: acc.warnAckLevel, total };
}

// Bağlantı kapanışını anti-ban açısından değerlendir (whatsapp.js close olayından
// çağrılır). Ban-şüpheli kapanışta (403 forbidden / 401 loggedOut) veya kısa sürede
// çok kopmada (ağ fırtınası) hesaba SOĞUMA koy → gate() o süre gönderime izin vermez.
// 403/401'de warm-up da sıfırlanır: kick yiyen numara sıfırdan yavaş ısınmalı.
// NOT: 440 (connectionReplaced = WA Web başka yerde açıldı) TEK BAŞINA iyi huyludur.
// Bazı Baileys sürümleri aynı çakışmayı 401 + "Stream Errored (conflict)" olarak
// bildirir — mesajdan ayıklarız, yoksa WA Web'i açan kullanıcı hesabı 2 saat
// kilitliyor ve warm-up'ı sıfırlıyor.
// AMA "iyi huylu" varsayımı koşulsuz DEĞİLDİR: WhatsApp bir cihazı zorla düşürdüğünde
// (hesap kısıtlama / cihaz iptali) İSTEMCİYE AYNI conflict stream error'ı gelir.
// Ayırt edici: iyi huylu çakışmadan sonra aynı creds ile yeniden bağlanma 'open'
// verir; iptalde QR ister (bkz. whatsapp.js session-revoked). Ara bir güvenlik ağı
// olarak da: 'open' görmeden tekrarlayan çakışma soğutulur (aşağıdaki sayaç).
const isConflict = (code, errMsg) =>
    code === 440 || /conflict|replaced/i.test(String(errMsg || ''));

// conflictHint: whatsapp.js çakışmayı olay-üstü çözer (çakışma İKİ kapanış üretir;
// ikincisinde mesajda 'conflict' geçmez) ve sonucu buraya bildirir. Mesaja tek
// başına bakmak yetmiyordu — canlı vaka 4 Ağu: 07:08:57 "401 (conflict)" ardından
// 07:09:02 düz "401 Connection Failure" → ikincisi gerçek logout sanılıp 2 saatlik
// sticky soğuma + warm-up sıfırlaması yiyordu.
function noteDisconnect(accountId, statusCode, errMsg, conflictHint) {
    if (!STATE_PATH) return null;
    const { acc } = touch(resolveAccount(accountId));
    const now = Date.now();
    const code = Number(statusCode);
    let ms = 0, reason = null, resetWarmup = false, sticky = false;

    if (conflictHint || isConflict(code, errMsg)) {
        // Tek çakışma iyi huylu: oturum başka yerde açıldı → soğuma yok. Tekrarlarsa
        // (araya 'open' girmeden) ikinci kopya değil, WhatsApp cihazı düşürüyordur.
        acc.conflicts = (acc.conflicts || []).filter(t => now - t < CONFLICT_WINDOW_MS);
        acc.conflicts.push(now);
        if (acc.conflicts.length < CONFLICT_MAX) { save(); return null; }
        acc.conflicts = [];
        ms = COOLDOWN_LOGGEDOUT_MS;
        reason = `tekrarlayan oturum çakışması (${CONFLICT_MAX}/30dk)`;
        resetWarmup = true;
        sticky = true;
    }
    // 403 = KESİN ban sinyali; SOĞUMA KALICIDIR, sonradan 'open' olsa bile kalkmaz.
    // (Canlı vaka 9–11 Tem 2026: 15:03:04 mesaj gitti → 15:03:15 403 fırtınası → numara
    // 'open' olmaya ve mesaj iletmeye devam etti → 11 Tem'de "Hesap gözden geçiriliyor".
    // Yani flaglenen numara bağlanabiliyor: 'open' sağlamlık kanıtı DEĞİL. Bunu bir kez
    // yanlış varsayıp soğumayı open'da kaldırmıştık; koruma o sırada devre dışı kalıyordu.)
    else if (code === 403) { ms = COOLDOWN_FORBIDDEN_MS; reason = 'hesap kısıtlı (403)'; resetWarmup = true; sticky = true; }
    else if (code === 401) { ms = COOLDOWN_LOGGEDOUT_MS; reason = 'oturum düşürüldü (401)'; resetWarmup = true; sticky = true; }
    else if (acc.cooldownUntil && acc.cooldownUntil > now) {
        return null; // zaten soğumada — fırtına sayımıyla disk churn yapma
    } else {
        // Fırtına: son STORM_WINDOW_MS içindeki kopmaları say. Ağ kaynaklı olabilir →
        // ban sinyali değil, sticky değil: başarılı açılış bunu kaldırabilir.
        acc.closes = (acc.closes || []).filter(t => now - t < STORM_WINDOW_MS);
        acc.closes.push(now);
        if (acc.closes.length >= STORM_MAX_CLOSES) {
            ms = COOLDOWN_STORM_MS; reason = `ağ fırtınası (${acc.closes.length} kopma/10dk)`; acc.closes = [];
        } else { save(); return null; }
    }

    acc.cooldownUntil = Math.max(acc.cooldownUntil || 0, now + ms);
    acc.cooldownReason = reason;
    acc.cooldownSticky = sticky;      // true → noteOpen kaldıramaz
    // Ban sinyalinde warm-up sıfırla: kick yiyen numara sıfırdan yavaş ısınmalı.
    if (resetWarmup) acc.firstActiveDate = dayKey();
    save();
    return { cooldownMs: ms, reason };
}

// Oturumu WhatsApp SUNUCUSU iptal etti: diskte bağlı bir kimlik (creds.me) dururken
// yeniden bağlanma QR istiyor (bkz. whatsapp.js). Sebebi ne olursa olsun — kullanıcı
// "bağlı cihazlar"dan çıkardı ya da hesap kısıtlandı — gönderime devam etmek yanlış:
// kısıtlıysa dövmeye devam ederiz, kullanıcı çıkardıysa zaten gönderecek oturum yok.
// 403 ağırlığında sayılır: 24 saat sticky + warm-up sıfırlanır (yeni QR = taze numara
// gibi yavaş ısınmalı; her yeni eşleşme WhatsApp'ta yeni bir cihaz slotu yakıyor).
function noteSessionRevoked(accountId, note) {
    if (!STATE_PATH) return null;
    const { acc } = touch(resolveAccount(accountId));
    const now = Date.now();
    acc.cooldownUntil = Math.max(acc.cooldownUntil || 0, now + COOLDOWN_REVOKED_MS);
    acc.cooldownReason = note || 'oturum WhatsApp tarafından iptal edildi (ban şüphesi)';
    acc.cooldownSticky = true;
    acc.conflicts = [];
    acc.closes = [];
    acc.firstActiveDate = dayKey();
    save();
    return { cooldownMs: COOLDOWN_REVOKED_MS, reason: acc.cooldownReason };
}

// Oturum BAŞARIYLA açıldı. DİKKAT: bu, numaranın sağlam olduğunun kanıtı DEĞİLDİR —
// WhatsApp flaglediği numarayı bağlamaya ve mesaj iletmeye devam ederken arka planda
// hesabı incelemeye alabiliyor (canlı vaka için yukarıdaki nota bak). O yüzden burada
// YALNIZ ağ fırtınası soğuması kalkar; 403/401 soğuması (sticky) süresini doldurur.
function noteOpen(accountId) {
    if (!STATE_PATH) return null;
    const key = rememberAccount(accountId);
    if (key === 'unknown') return null;
    const { acc } = touch(key);
    acc.closes = [];
    // Başarılı açılış = önceki çakışma gerçekten iyi huyluydu (creds hâlâ geçerli).
    // Sayaç sıfırlanır ki normal WA Web kullanımı zamanla eşiği doldurmasın.
    acc.conflicts = [];
    if (acc.cooldownUntil && acc.cooldownUntil > Date.now() && !acc.cooldownSticky) {
        const cleared = acc.cooldownReason;
        delete acc.cooldownUntil;
        delete acc.cooldownReason;
        delete acc.cooldownSticky;
        save();
        return { cleared };
    }
    save();
    return null;
}

// Kullanıcı ELLE soğumayı kaldırır (403/401 sticky dahil). Müşteri riski bilerek
// göze alıp devam etmek isteyince kullanılır — bu bir güvenlik açığı DEĞİL, kasıtlı
// manuel override: buton arkasında açık onay ister (bkz. app.js). Numara gerçekten
// flaglenmişse mesajlar yine gitmeyebilir/hesap kapanabilir; bunu kaldırmak riski
// SİLMEZ, yalnız uygulamanın kendi frenini açar.
function clearCooldown(accountId, note) {
    if (!STATE_PATH) return null;
    const { acc } = touch(resolveAccount(accountId));
    const had = acc.cooldownUntil ? { reason: acc.cooldownReason, sticky: acc.cooldownSticky } : null;
    delete acc.cooldownUntil;
    delete acc.cooldownReason;
    delete acc.cooldownSticky;
    acc.overrideNote = note || 'kullanıcı elle kaldırdı (risk kabul edildi)';
    acc.overrideAt = Date.now();
    save();
    return { cleared: had };
}

// ─── Gönderim saati + günü penceresi (gece/haftasonu gönderme koruması) ───────
// Otomatik gönderimler (hatırlatma + belge watcher) yalnız SEÇİLİ GÜNLERDE ve
// [start,end] saatleri arasında yapılır; dışında sırada bekler. Manuel gönderim
// (toplu/Şimdi gönder/float) bu pencereye TABİ DEĞİL — kullanıcı bizzat tetikler.
// Varsayılan 10:00–20:00, Pzt–Cmt (Pazar kapalı). days: haftagünü indeksleri
// (0=Pazar … 6=Cumartesi, JS getDay ile aynı). data/antiban.json'da tutulur.
const DEFAULT_SEND_WINDOW = { enabled: true, start: '10:00', end: '20:00', days: [1, 2, 3, 4, 5, 6] };
const validTime = (t) => (/^\d{1,2}:\d{2}$/.test(String(t || '')) ? t : null);
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
// days doğrulama: 0..6 tam sayılar, tekilleştir + sırala. Dizi değilse varsayılan
// (Pazar kapalı). Boş dizi geçerli — kullanıcı hiçbir gün seçmezse hiç gönderilmez.
const validDays = (d) => {
    if (!Array.isArray(d)) return DEFAULT_SEND_WINDOW.days.slice();
    return [...new Set(d.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
};

function getSendWindow() {
    const w = state.sendWindow || {};
    return {
        enabled: w.enabled !== false,
        start: validTime(w.start) || DEFAULT_SEND_WINDOW.start,
        end: validTime(w.end) || DEFAULT_SEND_WINDOW.end,
        days: validDays(w.days),
    };
}
function setSendWindow(patch = {}) {
    const cur = getSendWindow();
    state.sendWindow = {
        enabled: patch.enabled !== undefined ? patch.enabled !== false : cur.enabled,
        start: validTime(patch.start) || cur.start,
        end: validTime(patch.end) || cur.end,
        days: patch.days !== undefined ? validDays(patch.days) : cur.days,
    };
    save();
    return getSendWindow();
}
// Şu an gönderim YASAK pencerede mi? Gün seçili değilse tüm gün yasak; seçiliyse
// saat penceresi uygulanır. Saat penceresi gece yarısını aşabilir (örn 22:00–06:00).
function inQuietHours(now = new Date()) {
    const w = getSendWindow();
    if (!w.enabled) return false;
    if (!w.days.includes(now.getDay())) return true; // bugün seçili gün değil → kapalı
    const t = now.getHours() * 60 + now.getMinutes();
    const s = toMin(w.start), e = toMin(w.end);
    if (s === e) return false; // 24 saat açık
    const allowed = s < e ? (t >= s && t < e) : (t >= s || t < e);
    return !allowed;
}
function quietReason(now = new Date()) {
    const w = getSendWindow();
    if (!w.days.includes(now.getDay())) return 'Bugün otomatik gönderim kapalı (gün seçimi dışında) — sırada bekliyor';
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
    if (!STATE_PATH) return { dayIndex: 0, warmup: false, dailyCap: null, daySent: 0, hourCap: HOURLY_CAP, hourSent: 0, warnAt: 0, warnPending: false, warnLevel: 0 };
    const { acc } = touch(resolveAccount(accountId), 'default');
    const dayIndex = daysBetween(acc.firstActiveDate, dayKey());
    const rampCap = rampDailyCap(acc);
    const lim = getLimits();
    const caps = [rampCap];
    if (Number(userDailyCap) > 0) caps.push(Number(userDailyCap));
    if (lim.userDailyCap) caps.push(lim.userDailyCap);
    const dailyCap = Math.min(...caps);
    const total = totalDaySent(acc);
    let warnPending = false, warnLevel = 0;
    if (lim.warnAt > 0) {
        const ackLevel = (acc.warnDay === dayKey()) ? (acc.warnAckLevel || 0) : 0;
        warnLevel = Math.floor(total / lim.warnAt);
        warnPending = warnLevel >= 1 && warnLevel > ackLevel;
    }
    return {
        dayIndex, warmup: dayIndex < WARMUP_RAMP.length - 1,
        dailyCap, daySent: total, hourCap: effectiveHourlyCap(dailyCap), hourSent: acc.hour.count,
        cooldownUntil: (acc.cooldownUntil && acc.cooldownUntil > Date.now()) ? acc.cooldownUntil : null,
        cooldownReason: (acc.cooldownUntil && acc.cooldownUntil > Date.now()) ? acc.cooldownReason : null,
        warnAt: lim.warnAt, warnPending, warnLevel,
    };
}

module.exports = { configure, setBypass, gate, recordSent, acknowledgeWarn, noteDisconnect, noteOpen, noteSessionRevoked, clearCooldown, snapshot, applySpintax, getLimits, setLimits, getSendWindow, setSendWindow, inQuietHours, quietReason, WARMUP_RAMP, HOURLY_CAP };
