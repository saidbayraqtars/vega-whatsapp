// ═══════════════════════════════════════════════════════════════════════════
//  PROFİL BAŞINA MOTOR KÜMESİ
// ═══════════════════════════════════════════════════════════════════════════
//  watcher / siparis / vade / reminders / shopstar / aiBot modülleri TEKİL yazıldı:
//  modül düzeyinde tek config, tek state, tek zamanlayıcı (tek firma/dönem). Çok
//  firmada her firmanın kendi ayarı, watermark'ı, defteri ve zamanlayıcısı olmalı.
//
//  Çözüm: her ek profil için bu modüllerin AYRI BİR KOPYASI yüklenir (modül önbelleği
//  geçici olarak atlanır). Kopyanın kendi değişkenleri ve zamanlayıcısı vardır;
//  dosyaları baseDir/profiles/<id>/data/ altına yazar. Paylaşılması gerekenler
//  (antiban, stats, phone, optout…) önbellekte kalır — yani TEKİLDİR.
//
//  'default' profil kopya değil, server.js'in zaten kullandığı tekil modüllerdir:
//  tek firmalı kurulumda kod yolu ve dosyalar eskisiyle birebir aynıdır.
//
//  Bağımlılıkları (WhatsApp hattı, firma adı vb.) server.js enjekte eder
//  (configureSet) — burada WhatsApp'a ya da veritabanına dokunulmaz.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DEFAULT_ID = 'default';
// Motor adı → modül yolu. aiBot kopyalanır: her firmanın kendi işletme adı, ödeme bilgisi,
// günlük cevap sayacı ve sohbet hafızası olur (aynı telefon iki firmaya yazabilir).
const MODULES = {
    watcher: './watcher',
    siparis: './siparis',
    vade: './vade',
    reminders: './reminders',
    shopstar: './shopstar',
    aiBot: './aiBot',
};
const NAMES = Object.keys(MODULES);

let host = {
    defaultSet: null,       // tekil modüller: { watcher, siparis, vade, reminders, shopstar, aiBot }
    configureSet: null,     // (set, profile) => void — bağımlılıkları enjekte eder
    baseDirFor: null,       // profil kimliği → motor kök klasörü
    log: (m) => console.log(m),
};
const sets = new Map();     // profil kimliği → motor kümesi

function configure(h = {}) { host = { ...host, ...h }; }

// Modülün TAZE bir kopyasını yükle; önbellekteki asıl kopyaya dokunma.
function loadFresh(name) {
    const file = require.resolve(MODULES[name]);
    const saved = require.cache[file];
    delete require.cache[file];
    try { return require(file); }
    finally {
        if (saved) require.cache[file] = saved; else delete require.cache[file];
    }
}

// ─── Ayar kopyalama (yeni firma "şundan kopyala" ile açılırken) ──────────────
//  Yalnız AYAR dosyaları kopyalanır (kurallar, şablonlar, saatler); durum dosyaları
//  (watermark, defterler, kuyruk, log) ASLA — onlar firmaya özeldir. Kopya güvenli
//  başlar: otomatik gönderim açık gelmez, iç bildirim numaraları boşaltılır, cari
//  kimliğine bağlı kayıtlar (IND başka firmada başka cari demektir) temizlenir.
const COPY_FILES = ['watcher.json', 'siparis.json', 'vade.json', 'reminders.json', 'shopstar.json', 'aibot.json'];

function sanitizeCopied(file, json, ctx) {
    const o = json && typeof json === 'object' ? json : {};
    if (ctx.firmaNo) o.firmaNo = ctx.firmaNo;
    if (ctx.donemNo) o.donemNo = ctx.donemNo;
    switch (file) {
        case 'watcher.json': o.enabled = false; break;
        case 'siparis.json': o.enabled = false; o.phone = ''; break;
        case 'vade.json':
            o.enabled = false; o.phone = '';
            if (o.customer && typeof o.customer === 'object') o.customer.enabled = false;
            break;
        case 'reminders.json':
            for (const r of Array.isArray(o.reminders) ? o.reminders : []) {
                r.enabled = false; r.lastRunAt = null; r.perCariLastSent = {}; r.perCariTried = {};
            }
            break;
        case 'shopstar.json':
            if (o.payment) o.payment.enabled = false;
            if (o.overdue) o.overdue.enabled = false;
            break;
        case 'aibot.json': o.enabled = false; o.notifyPhone = ''; break;
        default: break;
    }
    return o;
}

function copyConfigs(fromId, toId, ctx) {
    const src = path.join(host.baseDirFor(fromId), 'data');
    const dst = path.join(host.baseDirFor(toId), 'data');
    fs.mkdirSync(dst, { recursive: true });
    const copied = [];
    for (const f of COPY_FILES) {
        const from = path.join(src, f);
        if (!fs.existsSync(from)) continue;
        try {
            const j = sanitizeCopied(f, JSON.parse(fs.readFileSync(from, 'utf8')), ctx);
            fs.writeFileSync(path.join(dst, f), JSON.stringify(j, null, 2), 'utf8');
            copied.push(f);
        } catch (e) { host.log(`[Motorlar] ${f} kopyalanamadı: ${e.message}`); }
    }
    // Kurallara bağlı görsel/video dosyaları (watcher-media-*, reminders-media-*).
    try {
        for (const f of fs.readdirSync(src)) {
            if (/-media-/.test(f)) { try { fs.copyFileSync(path.join(src, f), path.join(dst, f)); } catch { /* yok say */ } }
        }
    } catch { /* kaynak yok */ }
    return copied;
}

// ─── Küme yaşam döngüsü ──────────────────────────────────────────────────────
function registerDefault(set, profile) {
    sets.set(DEFAULT_ID, set);
    if (host.configureSet) host.configureSet(set, profile);
    return set;
}

// Profilin motor kümesi (yoksa kurar). opts.copyFrom: ayarları bu profilden kopyala.
function ensure(profile, opts = {}) {
    const have = sets.get(profile.id);
    if (have) return have;
    if (profile.id === DEFAULT_ID) {
        if (!host.defaultSet) throw new Error('Varsayılan motor kümesi kayıtlı değil.');
        return registerDefault(host.defaultSet, profile);
    }
    if (opts.copyFrom) {
        try { copyConfigs(opts.copyFrom, profile.id, { firmaNo: profile.firmaNo, donemNo: profile.donemNo }); }
        catch (e) { host.log(`[Motorlar] ayar kopyalama hatası: ${e.message}`); }
    }
    const set = {};
    for (const n of NAMES) set[n] = loadFresh(n);
    if (host.configureSet) host.configureSet(set, profile);
    sets.set(profile.id, set);
    host.log(`[Motorlar] ${profile.id} (firma ${profile.firmaNo || '-'}) için motorlar kuruldu.`);
    return set;
}

const has = (id) => sets.has(id);
const of = (id) => sets.get(id) || null;
const all = () => [...sets.entries()].map(([id, set]) => ({ id, set }));

// Profilin firma/dönemini motor ayarlarına işle. Değiştiyse yeni tablonun GEÇMİŞİNE
// mesaj atılmasın diye watermark sıfırlanır (UI'daki firma/dönem değişimiyle aynı kural).
function applyContext(profile) {
    const set = sets.get(profile.id);
    if (!set || !profile.firmaNo || !profile.donemNo) return false;
    const { firmaNo, donemNo } = profile;
    let changed = false;
    const differs = (cfg) => !cfg || cfg.firmaNo !== firmaNo || cfg.donemNo !== donemNo;
    for (const n of ['watcher', 'siparis']) {
        if (differs(set[n].getConfig())) { set[n].setConfig({ firmaNo, donemNo }); set[n].resetWatermark(); changed = true; }
    }
    for (const n of ['vade', 'reminders', 'shopstar', 'aiBot']) {
        if (differs(set[n].getConfig())) { set[n].setConfig({ firmaNo, donemNo }); changed = true; }
    }
    return changed;
}

function autoStartSet(set) {
    try { set.watcher.autoStart(); } catch (e) { host.log(`[Motorlar] watcher: ${e.message}`); }
    try { set.siparis.autoStart(); } catch { /* yok say */ }
    try { set.vade.autoStart(); } catch { /* yok say */ }
    try { set.reminders.autoStart(); } catch { /* yok say */ }
    try { set.shopstar.autoStart(); } catch (e) { host.log(`[ShopStar] otomatik baslatma: ${e.message}`); }
}

// Kalıcı "açık" bayrağını BOZMADAN durdur (profil kapatma): stop() watcher/siparis/vade'de
// config.enabled=false yazar; profil yeniden açılınca motorlar kendiliğinden dönsün diye
// önceki değer geri konur. Lisans/DB sıfırlama gibi gerçek durdurmalar stopSet kullanır.
function pauseSet(set) {
    for (const n of ['watcher', 'siparis', 'vade']) {
        try {
            const was = set[n].getConfig().enabled === true;
            set[n].stop();
            if (was) set[n].setConfig({ enabled: true });
        } catch { /* yok say */ }
    }
    for (const n of ['reminders', 'shopstar']) { try { set[n].stop(); } catch { /* yok say */ } }
}

function stopSet(set) {
    for (const n of ['watcher', 'siparis', 'vade', 'reminders', 'shopstar']) { try { set[n].stop(); } catch { /* yok say */ } }
}

function autoStart(profile) {
    const set = ensure(profile);
    autoStartSet(set);
}

function pause(id) { const s = sets.get(id); if (s) pauseSet(s); }
function stopAll() { for (const s of sets.values()) stopSet(s); }

// Profil silinince: motorlar durur, küme bırakılır. Disk dosyaları SİLİNMEZ (veri kaybı yok).
function drop(id) {
    if (id === DEFAULT_ID) return;
    const s = sets.get(id);
    if (s) { pauseSet(s); sets.delete(id); }
}

module.exports = {
    DEFAULT_ID, NAMES,
    configure, registerDefault, ensure, has, of, all,
    applyContext, autoStart, autoStartSet, pause, stopAll, stopSet, drop,
    copyConfigs, loadFresh,
};
