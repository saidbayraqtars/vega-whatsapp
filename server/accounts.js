// ═══════════════════════════════════════════════════════════════════════════
//  ÇOK HESAP (çoklu WhatsApp numarası) yöneticisi
// ═══════════════════════════════════════════════════════════════════════════
//  NEDEN: Tek numarada günlük tavan anti-ban rampasıyla sınırlı (ilk günler 20-40
//  mesaj). 2-3-4 telefon aynı anda QR okutulunca toplam kapasite numara sayısıyla
//  çarpılır ve tek numaraya yığılan şikâyet/engelleme oranı dağılır. Her hesap
//  KENDİ oturumunu, KENDİ auth klasörünü, KENDİ ısınma rampasını ve KENDİ günlük
//  sayacını taşır (antiban zaten hesap-başı sayıyor).
//
//  YÖNLENDİRME (kim gönderecek?):
//    1. Yapışkan (sticky) eşleme — bir müşteriye HEP aynı numaradan yazılır.
//       Aksi halde müşteri her seferinde başka numaradan mesaj alır: hem güven
//       kırıcı hem de "spam ağı" görüntüsü (ban sebebi). Eşleme diske yazılır.
//    2. Yapışkan hesap yoksa/hazır değilse: o an hazır + anti-ban kapısından
//       geçen hesaplar arasından BUGÜN EN AZ gönderen seçilir (yük dengesi).
//    3. Hiçbir hesap gönderemiyorsa (hepsi tavanda/kopuk) capped=true döner —
//       çağıran döngü (watcher/hatırlatma/toplu) bekler ya da durur.
//
//  GERİ UYUM: 'main' hesabı ESKİ auth klasörünü (data/baileys-auth) kullanır →
//  mevcut kurulumlar güncellemeden sonra QR'ı YENİDEN OKUTMAZ.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { createSession, DATA_DIR } = require('./whatsapp');
const antiban = require('./antiban');
const { normalizePhone } = require('./phone');

const REG_PATH = path.join(DATA_DIR, 'accounts.json');
const LEGACY_AUTH_DIR = path.join(DATA_DIR, 'baileys-auth');
const MAX_ACCOUNTS = 8;          // makul üst sınır (UI + bellek)
const STICKY_MAX = 20_000;       // eşleme defteri şişmesin
const MSG_MAP_MAX = 3_000;       // mesaj kimliği → hesap (geri çekme için)

let deps = {
    onIncoming: null,            // ({phone,text,jid,id,accountId}) => …
    dailyCap: null,              // kullanıcı günlük tavanı (DEFAULT_PACING.dailyCap)
};
const configure = (d = {}) => { deps = { ...deps, ...d }; };

// ─── Kalıcı kayıt (hesap listesi + yapışkan eşleme) ──────────────────────────
let reg = { accounts: [], sticky: {} };
const sessions = new Map();      // id → session
// msgId → accountId (geri çekme AYNI hattan yapılmalı). Bellekte yeter: geri
// çekme penceresi ~2 gün ama program açık kaldığı sürece defter dolu kalır;
// kaçırılırsa yapışkan eşlemeye düşülür.
const msgAccount = new Map();

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

function load() {
    try {
        const j = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
        reg = {
            accounts: Array.isArray(j.accounts) ? j.accounts : [],
            sticky: (j.sticky && typeof j.sticky === 'object') ? j.sticky : {},
        };
    } catch { reg = { accounts: [], sticky: {} }; }
    // 'main' her zaman vardır (eski kurulumun oturumu burada).
    if (!reg.accounts.some((a) => a.id === 'main')) {
        reg.accounts.unshift({ id: 'main', label: '1. Numara', createdAt: Date.now() });
    }
}

let saveTimer = null;
function save(immediate = false) {
    const write = () => {
        saveTimer = null;
        try { ensureDir(DATA_DIR); fs.writeFileSync(REG_PATH, JSON.stringify(reg, null, 2), 'utf8'); }
        catch (e) { console.error('[Hesaplar] Kayıt yazılamadı:', e.message); }
    };
    if (immediate) { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } return write(); }
    // Yapışkan eşleme her gönderimde değişebilir → yazımı topla.
    if (!saveTimer) { saveTimer = setTimeout(write, 2000); saveTimer.unref?.(); }
}

const authDirFor = (id) => (id === 'main' ? LEGACY_AUTH_DIR : path.join(DATA_DIR, `baileys-auth-${id}`));

// ─── Oturum kurulumu ─────────────────────────────────────────────────────────
function buildSession(meta) {
    const s = createSession({ id: meta.id, authDir: authDirFor(meta.id), label: meta.label || meta.id });
    // Gelen mesaj → AI bot (hangi hattan geldiği accountId ile gider).
    s.setIncomingHandler(async (msg) => {
        // Müşteri bize bu hattan yazdıysa yapışkan eşlemeyi ona sabitle: yanıt ve
        // sonraki bildirimler aynı numaradan gitsin.
        try { setSticky(msg.phone, meta.id); } catch { /* yok say */ }
        if (deps.onIncoming) await deps.onIncoming(msg);
    });
    // Anti-ban: ban-şüpheli kapanış → o HESABI soğut (diğerleri çalışmaya devam eder).
    s.setDisconnectHandler((code, accountId, errMsg, conflict) => {
        try { antiban.noteDisconnect(accountId || s.getStatus().me, code, errMsg, conflict); } catch { /* yok say */ }
    });
    s.setRevokedHandler((accountId) => {
        try {
            const r = antiban.noteSessionRevoked(accountId || s.getStatus().me);
            if (r) console.warn(`[Antiban] ${meta.id}: oturum iptali — gönderim durduruldu: ${r.reason}`);
        } catch { /* yok say */ }
    });
    s.setOpenHandler((accountId) => {
        try {
            const r = antiban.noteOpen(accountId);
            if (r && r.cleared) console.log(`[Antiban] ${meta.id}: bağlantı kuruldu — soğuma kaldırıldı (${r.cleared})`);
        } catch { /* yok say */ }
    });
    sessions.set(meta.id, s);
    return s;
}

// Tüm kayıtlı hesapların oturumlarını kur ve bağlanmayı başlat. Tekrar çağrılabilir
// (UI "bağlan" isteği): kayıt dosyası YALNIZ ilk çağrıda okunur — bellekteki taze
// yapışkan eşleme diskteki eski hâlle ezilmesin.
let started = false;
function start() {
    if (!started) { load(); started = true; }
    for (const meta of reg.accounts) if (!sessions.has(meta.id)) buildSession(meta);
    for (const s of sessions.values()) s.initialize().catch(() => { });
    if (reg.accounts.length > 1) {
        console.log(`[Hesaplar] ${reg.accounts.length} WhatsApp numarası — hepsi aynı anda bağlanıyor.`);
    }
    return list();
}

const get = (id) => sessions.get(id) || null;
const count = () => sessions.size;
const list = () => reg.accounts.map((a) => {
    const s = sessions.get(a.id);
    const st = s ? s.getStatus() : { ready: false, error: 'Oturum kurulmadı' };
    return { ...st, id: a.id, label: a.label || a.id, createdAt: a.createdAt || null };
});

// ─── Hesap ekle / sil ────────────────────────────────────────────────────────
function nextId() {
    for (let i = 2; i <= MAX_ACCOUNTS + 2; i++) {
        const id = `a${i}`;
        if (!reg.accounts.some((a) => a.id === id)) return id;
    }
    return `a${Date.now()}`;
}

// Yeni numara ekle → hemen QR üretmeye başlar (diğer hesaplar etkilenmez).
function add(label) {
    if (reg.accounts.length >= MAX_ACCOUNTS) {
        return { success: false, message: `En fazla ${MAX_ACCOUNTS} numara eklenebilir.` };
    }
    const meta = { id: nextId(), label: String(label || '').trim() || `${reg.accounts.length + 1}. Numara`, createdAt: Date.now() };
    reg.accounts.push(meta);
    save(true);
    const s = buildSession(meta);
    s.initialize().catch(() => { });
    return { success: true, account: { id: meta.id, label: meta.label } };
}

// Hesabı kaldır: oturumu kapat, auth klasörünü sil, eşlemeleri temizle.
// 'main' silinemez (eski oturumun sahibi + her zaman en az bir hesap kalmalı).
async function remove(id) {
    if (id === 'main') return { success: false, message: 'İlk numara kaldırılamaz. Değiştirmek için "Oturumu Sıfırla" kullanın.' };
    const s = sessions.get(id);
    if (!s) return { success: false, message: 'Hesap bulunamadı.' };
    try { await s.logout({ shutdown: true }); } catch { /* yok say */ }
    sessions.delete(id);
    reg.accounts = reg.accounts.filter((a) => a.id !== id);
    for (const [phone, acc] of Object.entries(reg.sticky)) if (acc === id) delete reg.sticky[phone];
    save(true);
    return { success: true };
}

function rename(id, label) {
    const meta = reg.accounts.find((a) => a.id === id);
    if (!meta) return { success: false, message: 'Hesap bulunamadı.' };
    meta.label = String(label || '').trim() || meta.label;
    const s = sessions.get(id);
    if (s) s.label = meta.label;
    save(true);
    return { success: true, label: meta.label };
}

// ─── Yapışkan (müşteri → numara) eşleme ──────────────────────────────────────
const stickyKey = (phone) => normalizePhone(phone) || String(phone || '');
function setSticky(phone, accountId) {
    const k = stickyKey(phone);
    if (!k || !accountId) return;
    if (reg.sticky[k] === accountId) return;
    reg.sticky[k] = accountId;
    // Defter şişerse en eski girdileri at (ekleme sırası korunur).
    const keys = Object.keys(reg.sticky);
    if (keys.length > STICKY_MAX) for (const old of keys.slice(0, keys.length - STICKY_MAX)) delete reg.sticky[old];
    save();
}
const getSticky = (phone) => reg.sticky[stickyKey(phone)] || null;

// ─── Seçim ───────────────────────────────────────────────────────────────────
// Hazır + anti-ban kapısından geçen hesaplar. gate() sayaç ARTIRMAZ (yalnız
// gün/saat kovalarını tazeler) → yoklama güvenli.
function candidates(channel, dailyCap) {
    const out = [];
    const fails = [];
    let anyReady = false;
    for (const s of sessions.values()) {
        const st = s.getStatus();
        if (!st.ready || !st.me) continue;
        anyReady = true;
        const g = antiban.gate(st.me, dailyCap != null ? dailyCap : deps.dailyCap, channel);
        if (g.ok) out.push({ s, st, g });
        else fails.push(g);
    }
    return { out, anyReady, fails };
}

// Tüm numaralar kapalıysa engelin CİNSİ önemli: 'hourly' ise beklemek işe yarar
// (saat başında açılır), 'daily'/'cooldown' ise o gün/pencere boyunca kapalıdır.
// En az kısıtlayıcı engeli bildir ki çağıran döngü boşuna durmasın.
function worstFail(fails) {
    if (!fails.length) return null;
    return fails.find((f) => f.capType === 'hourly') || fails[0];
}

// Bu kanal için şu an gönderim yapılabilir mi? (döngülerin "dur/bekle" kararı)
// Dönüş antiban.gate ile aynı biçimde: { ok, reason, capType… } + accounts alanı.
function gate(channel, dailyCap) {
    const { out, anyReady, fails } = candidates(channel, dailyCap);
    if (out.length) {
        const best = out[0];
        return { ...best.g, ok: true, accountId: best.st.me, accounts: out.length };
    }
    if (!anyReady) return { ok: false, reason: 'WhatsApp bağlı değil.', capType: 'offline', accounts: 0 };
    const f = worstFail(fails) || {};
    const many = sessions.size > 1 ? ` (${sessions.size} numaranın hepsi kapalı)` : '';
    return { ...f, ok: false, reason: (f.reason || 'Tüm numaralar günlük/saatlik tavanda.') + many, capType: f.capType || 'daily', accounts: 0 };
}

// Gönderimi hangi hesap yapsın? Yapışkan eşleme → yoksa bugün en az gönderen.
function pick(phone, channel, dailyCap, forcedId) {
    const { out, anyReady, fails } = candidates(channel, dailyCap);
    if (!out.length) {
        const f = worstFail(fails) || {};
        return { error: anyReady ? (f.reason || 'Tüm numaralar tavanda.') : 'WhatsApp bağlı değil.', capped: anyReady };
    }
    if (forcedId) {
        const forced = out.find((c) => c.s.id === forcedId);
        // Zorlanan hesap (AI yanıtı gibi) müsait değilse gönderme: yanıt başka
        // numaradan giderse müşteri iki ayrı hattan konuşulmuş olur.
        if (forced) return { session: forced.s, me: forced.st.me };
        return { error: 'İlgili numara şu an gönderemiyor (bağlı değil ya da tavanda).', capped: true };
    }
    const stickyId = getSticky(phone);
    if (stickyId) {
        const hit = out.find((c) => c.s.id === stickyId);
        if (hit) return { session: hit.s, me: hit.st.me };
        // Yapışkan hesap geçici olarak müsait değil → eşlemeyi SİLME (geri gelince
        // devam etsin), bu mesaj için en az yüklüye düş.
    }
    out.sort((a, b) => a.st.daySent - b.st.daySent);
    const chosen = out[0];
    if (!stickyId) setSticky(phone, chosen.s.id);
    return { session: chosen.s, me: chosen.st.me };
}

// ─── Dış API (server.js sarmalayıcılarının çağırdıkları) ─────────────────────
// Baileys sendMessage ile aynı imza + { accountId } eklenir. Anti-ban kapısı ve
// sayacı BURADA işler (tek yer) — çağıranlar ayrıca recordSent ETMEZ.
async function send(phone, text, media = null, opts = {}) {
    const channel = opts.channel || 'manual';
    const p = pick(phone, channel, opts.dailyCap, opts.accountId || null);
    if (p.error) return { success: false, error: p.error, capped: !!p.capped };
    const res = await p.session.sendMessage(phone, text, media, opts);
    if (res.success) {
        try { antiban.recordSent(p.me, channel); } catch { /* yok say */ }
        if (res.id) {
            msgAccount.set(res.id, p.session.id);
            if (msgAccount.size > MSG_MAP_MAX) msgAccount.delete(msgAccount.keys().next().value);
        }
    }
    return { ...res, accountId: p.session.id };
}

// Numara WhatsApp kullanıcısı mı? Yapışkan hesabı yoksa hazır olan ilk hesap sorar.
async function checkOnWhatsApp(phone) {
    const stickyId = getSticky(phone);
    const ordered = [];
    if (stickyId && sessions.has(stickyId)) ordered.push(sessions.get(stickyId));
    for (const s of sessions.values()) if (s.id !== stickyId) ordered.push(s);
    for (const s of ordered) {
        if (!s.getStatus().ready) continue;
        return s.checkOnWhatsApp(phone);
    }
    return { exists: false, transient: true, error: 'WhatsApp bağlı değil.' };
}

// Geri çekme MESAJI GÖNDEREN hattan yapılmalı; defterde yoksa yapışkan hesaba düş.
async function deleteMessage(phone, msgId) {
    const accId = (msgId && msgAccount.get(msgId)) || getSticky(phone) || 'main';
    const s = sessions.get(accId) || sessions.get('main');
    if (!s) return { success: false, error: 'WhatsApp hesabı yok.' };
    return s.deleteMessage(phone, msgId);
}

// Toplam durum. ready = EN AZ BİR hesap bağlı. me/qr alanları eski tek-hesap
// arayüzüyle uyumlu kalsın diye "birincil" hesaptan (bağlı olan ilk, yoksa main)
// doldurulur — eski UI ve relay yanıtı kırılmaz.
function status() {
    const all = list();
    const ready = all.filter((a) => a.ready);
    const primary = ready[0] || all.find((a) => a.hasQr) || all[0] || null;
    return {
        ready: ready.length > 0,
        initializing: !ready.length && all.some((a) => a.initializing),
        hasQr: !ready.length && all.some((a) => a.hasQr),
        qr: primary && primary.hasQr ? primary.qr : null,
        error: ready.length ? null : (primary && primary.error) || null,
        me: primary ? primary.me : null,
        revoked: !!(primary && primary.revoked),
        accounts: all,
        readyCount: ready.length,
        total: all.length,
    };
}

// En az bir hesap hazır olana kadar bekle (toplu gönderim kuyruğu bunu kullanır).
function waitForReady(timeoutMs = 0) {
    if (status().ready) return Promise.resolve(true);
    const waiters = [...sessions.values()].map((s) => s.waitForReady(timeoutMs));
    if (!waiters.length) return Promise.resolve(false);
    return Promise.race(waiters);
}

const totalDailySent = () => [...sessions.values()].reduce((n, s) => n + s.getDailySent(), 0);

// Tekil hesap işlemleri (UI düğmeleri).
const initializeOne = (id) => { const s = get(id); return s ? s.initialize() : Promise.resolve(null); };
const refreshOne = (id) => { const s = get(id); return s ? s.refresh() : Promise.resolve(null); };
const logoutOne = (id) => { const s = get(id); return s ? s.logout() : Promise.resolve(null); };

// Tüm hesaplar (eski tekil davranış: hepsini yenile/çıkış).
const refreshAll = () => Promise.all([...sessions.values()].map((s) => s.refresh().catch(() => { })));
const logoutAll = () => Promise.all([...sessions.values()].map((s) => s.logout().catch(() => { })));

module.exports = {
    configure, start, list, get, count, add, remove, rename,
    send, checkOnWhatsApp, deleteMessage, gate, pick,
    status, waitForReady, totalDailySent,
    initializeOne, refreshOne, logoutOne, refreshAll, logoutAll,
    setSticky, getSticky,
    MAX_ACCOUNTS,
};
