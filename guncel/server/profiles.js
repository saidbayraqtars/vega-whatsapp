// ═══════════════════════════════════════════════════════════════════════════
//  FİRMA PROFİLLERİ (çok firma, tek bilgisayar)
// ═══════════════════════════════════════════════════════════════════════════
//  Bir Vega veritabanında birden çok firma olabilir (F0101…, F0102…, tablolar
//  F{firma}D{dönem}TBL…). Tek bilgisayardan hepsinin otomasyonu yürüsün, her
//  firmanın mesajı KENDİ WhatsApp hattından gitsin diye her firma bir PROFİL'dir:
//
//      { id, firmaNo, donemNo, label, enabled, waAccount }
//
//  waAccount = accounts.js havuzundaki hesap kimliği (o firmanın hattı).
//
//  GERİ UYUMLULUK (bu dosyanın asıl kuralı):
//    • data/profiles.json YOKSA tek bir ÖRTÜK profil vardır ("default"): firma ve
//      dönemi eski motor ayarlarından (watcher.json / uiContext) türetilir, hat
//      havuzun tamamıdır, motor dosyaları eskisiyle AYNIDIR. Hiçbir şey yazılmaz.
//    • Dosya, kullanıcı ikinci bir firma EKLEYİNCE oluşur. 'default' profili eski
//      kurulumun kendisidir (aynı dosyalar, aynı watermark'lar); yalnız hattı
//      'main' olarak sabitlenir.
//    • Çok firma modu yalnız ETKİN profil sayısı 2+ iken devrededir. O zamana dek
//      (tek profil) davranış eskisiyle aynıdır.
//
//  Bu modül saf veri katmanıdır: WhatsApp'a, veritabanına, motorlara dokunmaz.
//  Hat çözümlemesi (resolveLine) da saftır; hesap varlığını dışarıdan sorar.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DEFAULT_ID = 'default';
const MAX_PROFILES = 8;                 // accounts.MAX_ACCOUNTS ile aynı mertebe
const FILE_NAME = 'profiles.json';

let baseDir = null;
let FILE = null;
let deps = {
    getLegacyContext: () => ({ firmaNo: null, donemNo: null }),   // eski tek firmalı bağlam
    hasAccount: () => true,                                       // hesap kimliği var mı
    isLocalMode: () => true,                                      // Baileys (yerel) modu mu
};
// store = null → dosya yok, örtük tek profil. Aksi halde { version, seq, profiles[] }.
let store = null;

const cleanNo = (v) => {
    const s = String(v == null ? '' : v).trim();
    return /^\d{1,6}$/.test(s) ? s : null;
};
const cleanLabel = (v) => String(v == null ? '' : v).trim().slice(0, 60);
const cleanAccount = (v) => {
    const s = String(v == null ? '' : v).trim();
    return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : null;
};

function configure(d = {}) {
    baseDir = d.baseDir;
    deps = { ...deps, ...Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'baseDir')) };
    FILE = path.join(baseDir, 'data', FILE_NAME);
    load();
}

// ─── Kalıcılık ───────────────────────────────────────────────────────────────
function normalizeRecord(r, fallbackId) {
    const id = r && r.id ? String(r.id) : fallbackId;
    return {
        id,
        firmaNo: cleanNo(r && r.firmaNo),
        donemNo: cleanNo(r && r.donemNo),
        label: cleanLabel(r && r.label),
        enabled: !(r && r.enabled === false),
        waAccount: cleanAccount(r && r.waAccount),
        // e-Fatura PDF entegrasyonu hangi firmanın? (tek durum klasörü/VKN → en çok bir profil)
        efatura: !!(r && r.efatura),
        createdAt: (r && r.createdAt) || null,
    };
}

function load() {
    store = null;
    try {
        if (!fs.existsSync(FILE)) return;
        const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        const list = Array.isArray(j.profiles) ? j.profiles : [];
        const profiles = [];
        const seen = new Set();
        for (const r of list) {
            const rec = normalizeRecord(r, `p${profiles.length + 2}`);
            if (seen.has(rec.id)) continue;
            seen.add(rec.id);
            profiles.push(rec);
        }
        // 'default' her zaman vardır (eski kurulumun motor dosyaları onundur).
        if (!seen.has(DEFAULT_ID)) {
            const ctx = deps.getLegacyContext() || {};
            profiles.unshift(normalizeRecord({ id: DEFAULT_ID, firmaNo: ctx.firmaNo, donemNo: ctx.donemNo, waAccount: 'main' }));
        }
        const maxSeq = profiles.reduce((m, p) => Math.max(m, parseInt(String(p.id).replace(/\D/g, ''), 10) || 0), 1);
        store = { version: 1, seq: Math.max(parseInt(j.seq, 10) || 0, maxSeq), profiles };
    } catch (e) {
        // Bozuk dosya: örtük tek profile düş (eski davranış) — üzerine yazmadan. Kullanıcı
        // çok firmalı kurulumu yitirmesin diye bozuk dosya yan yana saklanır.
        console.error('[Profiller] profiles.json okunamadı, tek firma moduna düşüldü:', e.message);
        try { fs.copyFileSync(FILE, `${FILE}.bozuk-${Date.now()}`); } catch { /* yok say */ }
        store = null;
    }
}

function save() {
    if (!store) return;
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        const tmp = `${FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(tmp, FILE);
    } catch (e) { console.error('[Profiller] profiles.json yazılamadı:', e.message); }
}

// ─── Okuma ───────────────────────────────────────────────────────────────────
function implicitDefault() {
    const ctx = deps.getLegacyContext() || {};
    return { id: DEFAULT_ID, firmaNo: cleanNo(ctx.firmaNo), donemNo: cleanNo(ctx.donemNo), label: '', enabled: true, waAccount: null, efatura: false, createdAt: null };
}

// Örtük = profiles.json yok. Tek profil, eski tek firmalı kurulumun kendisi.
const isExplicit = () => store !== null;

function list() {
    const src = store ? store.profiles : [implicitDefault()];
    return src.map((p) => ({ ...p, isDefault: p.id === DEFAULT_ID, implicit: !store }));
}
const get = (id) => list().find((p) => p.id === id) || null;
const getDefault = () => get(DEFAULT_ID);
const enabled = () => list().filter((p) => p.enabled);

// Çok firma modu: 2+ etkin profil VE yerel (Baileys) mod. Cloud/relay tek numaradır;
// orada hat bağlama anlamsızdır ve başka firmanın numarasından gitmemesi için
// resolveLine 'none' döner (aşağıda).
const isMulti = () => enabled().length > 1;

// Hangi profil "istek profili" olsun: istenen etkinse o, değilse varsayılan (etkinse),
// o da kapalıysa ilk etkin profil. Hiç etkin profil yoksa varsayılan.
function pick(id) {
    const all = list();
    const want = id ? all.find((p) => p.id === id) : null;
    if (want) return want;
    const def = all.find((p) => p.id === DEFAULT_ID);
    if (def && def.enabled) return def;
    return all.find((p) => p.enabled) || def || all[0] || null;
}

const forFirma = (firmaNo) => enabled().find((p) => p.firmaNo === String(firmaNo)) || null;
const forAccount = (accountId) => enabled().filter((p) => p.waAccount && p.waAccount === accountId);

// ─── Gelen mesaj yönlendirme (AI oto-yanıt) ─────────────────────────────────
//  Aday profiller: tek firmada tek (etkin) profil; çok firmada mesajın GELDİĞİ hatta
//  bağlı etkin profiller. Bir hat birden çok firmaya bağlıysa (ortak numara) hepsi aday.
function incomingCandidates(accountId) {
    const en = enabled();
    if (!isMulti()) return en.slice(0, 1);
    return en.filter((p) => p.waAccount && p.waAccount === accountId);
}

//  Aday birden çoksa telefon sırayla her adayın firmasında cari aranır; ilk bulunan
//  kazanır. Hiçbirinde yoksa botu açık ilk aday (bilinmeyen numara ayarı onun botunda).
async function chooseForIncoming(cands, phone, { findCari, isBotOn } = {}) {
    if (!cands || !cands.length) return null;
    if (cands.length === 1) return cands[0];
    for (const c of cands) {
        try { if (c.firmaNo && findCari && await findCari(c, phone)) return c; }
        catch { /* bu firmada aranamadı → sıradakine geç */ }
    }
    return cands.find((c) => (isBotOn ? isBotOn(c) : false)) || cands[0];
}

// Motor dosyalarının kök klasörü: 'default' eski baseDir'in kendisi (data/ altındaki
// eski dosyalar), diğerleri baseDir/profiles/<id>/ (içinde yine data/).
function baseDirFor(id) {
    return id === DEFAULT_ID ? baseDir : path.join(baseDir, 'profiles', id);
}

// Yapışkan eşlemenin kapsamı: çok firmada firma numarası (aynı telefon iki firmanın
// carisi olabilir), tek firmada yok → eski anahtarlar korunur.
function stickyScope(profile) {
    return isMulti() && profile && profile.firmaNo ? `F${profile.firmaNo}` : null;
}

// ─── Hat çözümleme (saf) ─────────────────────────────────────────────────────
//  Dönüş: { mode, accountId?, reason? }
//    'pool'   : eski davranış — havuzdaki hesaplardan biri (yapışkan + en az yüklü)
//    'strict' : YALNIZ accountId hattı; müsait değilse gönderim yapılmaz
//    'none'   : bu profilin gönderebileceği hat yok → HİÇBİR hattan gönderilmez
function resolveLine(profile, { multi = isMulti(), localMode = deps.isLocalMode(), hasAccount = deps.hasAccount } = {}) {
    if (!profile) return { mode: 'none', reason: 'Firma profili bulunamadı.' };
    if (!localMode) {
        // Cloud/relay: tek numara. Birden çok firma varsa hangisinin numarası olduğu
        // belirsiz → gönderme (başka firmanın numarasından mesaj gitmesin).
        return multi
            ? { mode: 'none', reason: 'Birden çok firma yalnız Yerel (Baileys) WhatsApp modunda çalışır.' }
            : { mode: 'pool' };
    }
    const id = profile.waAccount;
    if (id && hasAccount(id)) return { mode: 'strict', accountId: id };
    if (!multi) return { mode: 'pool' };
    return {
        mode: 'none',
        reason: id ? 'Firmaya atanan WhatsApp hattı bulunamadı.' : 'Bu firmaya WhatsApp hattı atanmamış.',
    };
}

// ─── Yazma ───────────────────────────────────────────────────────────────────
// İlk ek firma eklenirken örtük profil dosyaya "terfi" ettirilir.
function ensureStore() {
    if (store) return;
    const def = implicitDefault();
    // Eski kurulum havuzdaki hesaplarla gönderiyordu; çok firmada varsayılan firma
    // eski oturumun sahibi 'main' hattına sabitlenir (QR yeniden okutulmaz).
    def.waAccount = 'main';
    def.createdAt = Date.now();
    store = { version: 1, seq: 1, profiles: [def] };
}

function validateAccount(id) {
    if (id == null || id === '') return null;
    const a = cleanAccount(id);
    if (!a) return { error: 'Geçersiz WhatsApp hesabı.' };
    if (!deps.hasAccount(a)) return { error: 'Seçilen WhatsApp hesabı bulunamadı.' };
    return { value: a };
}

function add(input = {}) {
    const firmaNo = cleanNo(input.firmaNo);
    if (!firmaNo) return { success: false, message: 'Firma seçin.' };
    const donemNo = cleanNo(input.donemNo);
    if (!donemNo) return { success: false, message: 'Dönem seçin.' };
    const cur = list();
    if (cur.length >= MAX_PROFILES) return { success: false, message: `En fazla ${MAX_PROFILES} firma eklenebilir.` };
    // Aynı firma iki profilde olursa iki tarayıcı aynı tabloyu izler → çift mesaj.
    if (cur.some((p) => p.firmaNo === firmaNo)) return { success: false, message: 'Bu firma zaten ekli.' };
    const acc = validateAccount(input.waAccount);
    if (acc && acc.error) return { success: false, message: acc.error };
    const willEnable = input.enabled !== false;
    if (willEnable && !deps.isLocalMode() && cur.filter((p) => p.enabled).length >= 1) {
        return { success: false, message: 'Birden çok firma yalnız Yerel (Baileys) WhatsApp modunda çalışır (Ayarlar → WhatsApp Gönderim Modu).' };
    }
    ensureStore();
    store.seq += 1;
    const rec = {
        id: `p${store.seq}`,
        firmaNo, donemNo,
        label: cleanLabel(input.label),
        enabled: willEnable,
        waAccount: acc ? acc.value : null,
        createdAt: Date.now(),
    };
    store.profiles.push(rec);
    save();
    return { success: true, profile: get(rec.id) };
}

// patch: label, enabled, waAccount, donemNo. firmaNo değişmez (başka firma = yeni profil).
// 'default' profilinin firma/dönemi, ilk ekleme ânında eski bağlamdan alınır.
function update(id, patch = {}) {
    if (!store) {
        // Örtük profil üzerinde güncelleme: dosyaya terfi ettirmeden yalnız etiket
        // saklanamaz; tek profilde ayar yoktur, ek firma eklenince terfi eder.
        return { success: false, message: 'Önce ikinci bir firma ekleyin; tek firmada profil ayarı yoktur.' };
    }
    const rec = store.profiles.find((p) => p.id === id);
    if (!rec) return { success: false, message: 'Firma profili bulunamadı.' };
    if ('label' in patch) rec.label = cleanLabel(patch.label);
    // Yalnız ilk (eski) firmanın firması değiştirilebilir — onu kurulum ânında bağlamdan
    // türettik, boş kalmış olabilir. Ek firmalarda firma = kimlik; başkası için yeni profil.
    if ('firmaNo' in patch && id === DEFAULT_ID) {
        const f = cleanNo(patch.firmaNo);
        if (!f) return { success: false, message: 'Geçersiz firma.' };
        if (store.profiles.some((p) => p.id !== id && p.firmaNo === f)) return { success: false, message: 'Bu firma zaten ekli.' };
        rec.firmaNo = f;
    }
    if ('donemNo' in patch) {
        const d = cleanNo(patch.donemNo);
        if (!d) return { success: false, message: 'Geçersiz dönem.' };
        rec.donemNo = d;
    }
    if ('waAccount' in patch) {
        const acc = validateAccount(patch.waAccount);
        if (acc && acc.error) return { success: false, message: acc.error };
        rec.waAccount = acc ? acc.value : null;
    }
    if ('efatura' in patch) {
        const on = patch.efatura === true || patch.efatura === 'true';
        if (on) for (const p of store.profiles) p.efatura = false;   // en çok bir firma
        rec.efatura = on;
    }
    if ('enabled' in patch) {
        const on = patch.enabled !== false && patch.enabled !== 'false' && patch.enabled !== 0;
        if (on && !rec.enabled && !deps.isLocalMode() && store.profiles.some((p) => p.enabled && p.id !== id)) {
            return { success: false, message: 'Birden çok firma yalnız Yerel (Baileys) WhatsApp modunda çalışır.' };
        }
        rec.enabled = on;
    }
    save();
    return { success: true, profile: get(id) };
}

function remove(id) {
    if (!store) return { success: false, message: 'Silinecek ek firma yok.' };
    if (id === DEFAULT_ID) return { success: false, message: 'İlk firma silinemez; kapatabilirsiniz.' };
    const i = store.profiles.findIndex((p) => p.id === id);
    if (i < 0) return { success: false, message: 'Firma profili bulunamadı.' };
    const [gone] = store.profiles.splice(i, 1);
    save();
    return { success: true, profile: gone };
}

// WhatsApp hesabı silinince onu kullanan profillerin hattı boşalır (hayalet bağ kalmaz).
function unbindAccount(accountId) {
    if (!store) return [];
    const changed = [];
    for (const p of store.profiles) if (p.waAccount === accountId) { p.waAccount = null; changed.push(p.id); }
    if (changed.length) save();
    return changed;
}

// Testler için: bellekteki durumu dosyadan yeniden kur.
const reload = () => load();

module.exports = {
    DEFAULT_ID, MAX_PROFILES,
    configure, reload,
    list, get, getDefault, enabled, isExplicit, isMulti, pick, forFirma, forAccount,
    baseDirFor, stickyScope, resolveLine, incomingCandidates, chooseForIncoming,
    add, update, remove, unbindAccount,
};
