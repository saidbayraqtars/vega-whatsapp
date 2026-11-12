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
    stickyScopes: null,          // (accountId) => ['F0101', …] çok firmada eşleme kapsamları; boş = kapsamsız
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
        // sonraki bildirimler aynı numaradan gitsin. Çok firmada anahtar (firma, telefon):
        // hat hangi firmalara bağlıysa onların kapsamına yazılır (aynı telefon iki
        // firmanın carisi olabilir).
        try {
            const scopes = (deps.stickyScopes && deps.stickyScopes(meta.id)) || [];
            if (scopes.length) for (const sc of scopes) setSticky(msg.phone, meta.id, sc);
            else setSticky(msg.phone, meta.id);
        } catch { /* yok say */ }
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
    s.setRestrictedHandler((accountId, until) => {
        try {
            const r = antiban.noteRestricted(accountId || s.getStatus().me, until);
            if (r) console.warn(`[Antiban] ${meta.id}: ${r.reason} — gönderim ${Math.ceil(r.cooldownMs / 60000)} dk durduruldu`);
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
// Tek firmada anahtar yalnız telefondur (eski kayıtlar aynen geçerli). Çok firmada
// anahtar `<kapsam>|<telefon>` olur (kapsam = 'F0101'): aynı telefon iki firmanın
// carisi olabilir ve her firmanın kendi hattı vardır.
const stickyKey = (phone, scope) => {
    const base = normalizePhone(phone) || String(phone || '');
    return scope && base ? `${scope}|${base}` : base;
};
function setSticky(phone, accountId, scope) {
    const k = stickyKey(phone, scope);
    if (!k || !accountId) return;
    if (reg.sticky[k] === accountId) return;
    reg.sticky[k] = accountId;
    // Defter şişerse en eski girdileri at (ekleme sırası korunur).
    const keys = Object.keys(reg.sticky);
    if (keys.length > STICKY_MAX) for (const old of keys.slice(0, keys.length - STICKY_MAX)) delete reg.sticky[old];
    save();
}
const getSticky = (phone, scope) => reg.sticky[stickyKey(phone, scope)] || null;

// ─── Seçim ───────────────────────────────────────────────────────────────────
// Hazır + anti-ban kapısından geçen hesaplar. gate() sayaç ARTIRMAZ (yalnız
// gün/saat kovalarını tazeler) → yoklama güvenli.
// onlyId verilirse YALNIZ o hesap değerlendirilir (firmaya sıkı hat bağlama): başka
// hesap hazır ve boş olsa bile aday sayılmaz.
function candidates(channel, dailyCap, onlyId) {
    const out = [];
    const fails = [];
    let anyReady = false;
    for (const s of sessions.values()) {
        if (onlyId && s.id !== onlyId) continue;
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
// onlyId (opsiyonel): yalnız o hesabın kapısı sorulur — firmaya bağlı hat. O hat
// kapalı/tavandaysa başka hesaba BAKILMAZ (başka firmanın numarasından gitmesin).
function gate(channel, dailyCap, onlyId) {
    if (onlyId && !sessions.has(onlyId)) {
        return { ok: false, reason: 'Firmaya atanan WhatsApp hattı bulunamadı.', capType: 'offline', accounts: 0 };
    }
    const { out, anyReady, fails } = candidates(channel, dailyCap, onlyId);
    if (out.length) {
        const best = out[0];
        return { ...best.g, ok: true, accountId: best.st.me, accounts: out.length };
    }
    if (!anyReady) return { ok: false, reason: onlyId ? 'Firmanın WhatsApp hattı bağlı değil.' : 'WhatsApp bağlı değil.', capType: 'offline', accounts: 0 };
    const f = worstFail(fails) || {};
    const many = !onlyId && sessions.size > 1 ? ` (${sessions.size} numaranın hepsi kapalı)` : '';
    return { ...f, ok: false, reason: (f.reason || (onlyId ? 'Firmanın hattı günlük/saatlik tavanda.' : 'Tüm numaralar günlük/saatlik tavanda.')) + many, capType: f.capType || 'daily', accounts: 0 };
}

// Gönderimi hangi hesap yapsın? Zorlanan hesap (firma hattı / AI yanıtı) → yoksa
// yapışkan eşleme (kapsamlı) → yoksa bugün en az gönderen.
function pick(phone, channel, dailyCap, forcedId, scope) {
    if (forcedId && !sessions.has(forcedId)) {
        return { error: 'İlgili numara bulunamadı.', capped: true };
    }
    const { out, anyReady, fails } = candidates(channel, dailyCap, forcedId || null);
    if (forcedId) {
        const forced = out.find((c) => c.s.id === forcedId);
        // Zorlanan hesap (firma hattı, AI yanıtı) müsait değilse gönderme: mesaj başka
        // numaradan giderse müşteri yanlış hattan (başka firmadan) mesaj almış olur.
        if (forced) return { session: forced.s, me: forced.st.me };
        const f = worstFail(fails) || {};
        return { error: anyReady ? (f.reason || 'İlgili numara tavanda.') : 'İlgili numara şu an bağlı değil.', capped: true };
    }
    if (!out.length) {
        const f = worstFail(fails) || {};
        return { error: anyReady ? (f.reason || 'Tüm numaralar tavanda.') : 'WhatsApp bağlı değil.', capped: anyReady };
    }
    const stickyId = getSticky(phone, scope);
    if (stickyId) {
        const hit = out.find((c) => c.s.id === stickyId);
        if (hit) return { session: hit.s, me: hit.st.me };
        // Yapışkan hesap geçici olarak müsait değil → eşlemeyi SİLME (geri gelince
        // devam etsin), bu mesaj için en az yüklüye düş.
    }
    out.sort((a, b) => a.st.daySent - b.st.daySent);
    const chosen = out[0];
    if (!stickyId) setSticky(phone, chosen.s.id, scope);
    return { session: chosen.s, me: chosen.st.me };
}

// ─── Dış API (server.js sarmalayıcılarının çağırdıkları) ─────────────────────
// Baileys sendMessage ile aynı imza + { accountId } eklenir. Anti-ban kapısı ve
// sayacı BURADA işler (tek yer) — çağıranlar ayrıca recordSent ETMEZ.
// opts.accountId = zorunlu hat (firmaya bağlı hat / AI yanıtı); opts.stickyScope =
// çok firmada yapışkan eşleme kapsamı.
async function send(phone, text, media = null, opts = {}) {
    const channel = opts.channel || 'manual';
    const p = pick(phone, channel, opts.dailyCap, opts.accountId || null, opts.stickyScope || null);
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
// opts.accountId verilirse (firmaya bağlı hat) YALNIZ o hesap sorar; hazır değilse
// geçici hata döner — başka hesaba düşülmez, çağıran mesajı sıraya alır.
async function checkOnWhatsApp(phone, opts = {}) {
    if (opts.accountId) {
        const s = sessions.get(opts.accountId);
        if (!s || !s.getStatus().ready) return { exists: false, transient: true, error: 'Firmanın WhatsApp hattı bağlı değil.' };
        return s.checkOnWhatsApp(phone);
    }
    const stickyId = getSticky(phone, opts.stickyScope || null);
    const ordered = [];
    if (stickyId && sessions.has(stickyId)) ordered.push(sessions.get(stickyId));
    for (const s of sessions.values()) if (s.id !== stickyId) ordered.push(s);
    for (const s of ordered) {
        if (!s.getStatus().ready) continue;
        return s.checkOnWhatsApp(phone);
    }
    return { exists: false, transient: true, error: 'WhatsApp bağlı değil.' };
}

// Geri çekme MESAJI GÖNDEREN hattan yapılmalı; defterde yoksa firmanın hattına
// (opts.accountId), o da yoksa yapışkan hesaba düş.
async function deleteMessage(phone, msgId, opts = {}) {
    const accId = (msgId && msgAccount.get(msgId)) || opts.accountId || getSticky(phone, opts.stickyScope || null) || 'main';
    const s = sessions.get(accId) || (opts.accountId ? null : sessions.get('main'));
    if (!s) return { success: false, error: 'WhatsApp hesabı yok.' };
    return s.deleteMessage(phone, msgId);
}

// Tek hesabın durumu (firmaya bağlı hattın hazır olup olmadığı). Hesap yoksa hazır değil.
function statusOf(id) {
    const s = sessions.get(id);
    if (!s) return { ready: false, initializing: false, hasQr: false, qr: null, me: null, error: 'Hat bulunamadı.' };
    return s.getStatus();
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
// id verilirse (firmaya bağlı hat) yalnız o hesabı bekler: başka hesap hazır diye hemen
// dönmez, yoksa bekleme döngüleri boşa dönerdi.
function waitForReady(timeoutMs = 0, id = null) {
    if (id) {
        const s = sessions.get(id);
        return s ? s.waitForReady(timeoutMs) : new Promise((resolve) => setTimeout(() => resolve(false), Math.max(1, timeoutMs || 2000)));
    }
    if (status().ready) return Promise.resolve(true);
    const waiters = [...sessions.values()].map((s) => s.waitForReady(timeoutMs));
    if (!waiters.length) return Promise.resolve(false);
    return Promise.race(waiters);
}

const totalDailySent = () => [...sessions.values()].reduce((n, s) => n + s.getDailySent(), 0);

// Tekil hesap işlemleri (UI düğmeleri).
const initializeOne = (id) => { const s = get(id); return s ? s.initialize() : Promise.resolve(null); };
const refreshOne = (id) => { const s = get(id); return s ? s.refresh() : Promise.resolve(null); };
// 403 durdurmasını kaldırıp oturumu silmeden yeniden bağlan.
const resumeOne = (id) => { const s = get(id); return s ? s.resume() : Promise.resolve(null); };
const logoutOne = (id) => { const s = get(id); return s ? s.logout() : Promise.resolve(null); };

// Tüm hesaplar (eski tekil davranış: hepsini yenile/çıkış).
const refreshAll = () => Promise.all([...sessions.values()].map((s) => s.refresh().catch(() => { })));
const logoutAll = () => Promise.all([...sessions.values()].map((s) => s.logout().catch(() => { })));
// Motor (Baileys sürümü) değişince: oturumlar SİLİNMEDEN yeni motorla yeniden bağlanır.
const restartAll = () => Promise.all([...sessions.values()].map((s) => s.restart().catch(() => { })));

module.exports = {
    configure, start, list, get, count, add, remove, rename,
    send, checkOnWhatsApp, deleteMessage, gate, pick,
    status, statusOf, waitForReady, totalDailySent,
    initializeOne, refreshOne, resumeOne, logoutOne, refreshAll, logoutAll, restartAll,
    setSticky, getSticky,
    MAX_ACCOUNTS,
};
