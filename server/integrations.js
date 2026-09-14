// Program Files altina birakilan, imzali/yonetici kontrollu entegrasyonlari yukler.
// Entegrasyon kodu degisebilir veri yazmaz; durum ve loglar ProgramData'dadir.
const fs = require('fs');
const path = require('path');

let host = null;
const loaded = new Map();

function integrationRoots() {
    const roots = [];
    if (process.env.VEGA_INTEGRATIONS_DIR) roots.push(path.resolve(process.env.VEGA_INTEGRATIONS_DIR));
    // Paketli Electron: Vega WhatsApp.exe ile ayni seviye.
    if (process.execPath) roots.push(path.join(path.dirname(process.execPath), 'integrations'));
    // Kaynak agacinda gelistirme/test.
    roots.push(path.join(__dirname, '..', 'integrations'));
    return [...new Set(roots.map(p => path.resolve(p)))];
}

function commonDataRoot(baseDir) {
    if (process.platform === 'win32' && process.env.ProgramData) {
        return path.join(process.env.ProgramData, 'Vega WhatsApp');
    }
    return path.join(baseDir, 'data', 'integrations');
}

function readManifest(dir) {
    const file = path.join(dir, 'integration.json');
    if (!fs.existsSync(file)) return null;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!manifest || !/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(String(manifest.id || ''))) {
        throw new Error(`gecersiz entegrasyon kimligi: ${file}`);
    }
    const entry = path.resolve(dir, manifest.entry || 'index.js');
    const prefix = path.resolve(dir) + path.sep;
    if (!entry.startsWith(prefix) || !fs.existsSync(entry)) throw new Error(`gecersiz entry: ${entry}`);
    return { manifest, entry };
}

function discover() {
    const found = [];
    for (const root of integrationRoots()) {
        if (!fs.existsSync(root)) continue;
        for (const item of fs.readdirSync(root, { withFileTypes: true })) {
            if (!item.isDirectory()) continue;
            const dir = path.join(root, item.name);
            try {
                const parsed = readManifest(dir);
                if (parsed) found.push({ dir, ...parsed });
            } catch (e) {
                console.error(`[Entegrasyon] ${dir}: ${e.message}`);
            }
        }
        // Program Files koku varsa ayni entegrasyonun kaynak kopyasini yukleme.
        if (found.length) break;
    }
    return found;
}

function configure(o) {
    host = { ...o, commonDataRoot: commonDataRoot(o.baseDir) };
    loadAll();
}

function loadAll() {
    if (!host) return [];
    for (const item of discover()) {
        if (loaded.has(item.manifest.id)) continue;
        if (item.manifest.enabled === false) continue;
        try {
            const factory = require(item.entry);
            if (!factory || typeof factory.create !== 'function') throw new Error('create(host) disa aktarimi bulunamadi');
            const instance = factory.create({
                ...host,
                integrationDir: item.dir,
                dataDir: path.join(host.commonDataRoot, item.manifest.dataDir || item.manifest.id),
                manifest: item.manifest,
            });
            if (!instance || typeof instance.start !== 'function' || typeof instance.stop !== 'function') {
                throw new Error('entegrasyon start/stop sozlesmesini saglamiyor');
            }
            loaded.set(item.manifest.id, { ...item, instance, error: null });
            console.log(`[Entegrasyon] yuklendi: ${item.manifest.name || item.manifest.id} (${item.dir})`);
        } catch (e) {
            console.error(`[Entegrasyon] ${item.manifest.id} yuklenemedi: ${e.stack || e.message}`);
            loaded.set(item.manifest.id, { ...item, instance: null, error: e.message });
        }
    }
    return status();
}

function autoStart() {
    loadAll();
    for (const x of loaded.values()) {
        if (!x.instance) continue;
        try { x.instance.start(); }
        catch (e) { x.error = e.message; console.error(`[Entegrasyon] ${x.manifest.id} baslatilamadi: ${e.message}`); }
    }
}

function stopAll() {
    for (const x of loaded.values()) {
        if (!x.instance) continue;
        try { x.instance.stop(); } catch { /* kapanista devam */ }
    }
}

async function runNow(id) {
    const x = loaded.get(id);
    if (!x || !x.instance) throw new Error('entegrasyon yuklu degil');
    if (typeof x.instance.tick !== 'function') throw new Error('elle calistirma desteklenmiyor');
    return await x.instance.tick();
}

function status() {
    return [...loaded.values()].map(x => ({
        id: x.manifest.id,
        name: x.manifest.name || x.manifest.id,
        version: x.manifest.version || null,
        dir: x.dir,
        error: x.error,
        ...(x.instance && typeof x.instance.status === 'function' ? x.instance.status() : {}),
    }));
}

function claimsWatcherDocument(item) {
    for (const x of loaded.values()) {
        if (!x.instance || typeof x.instance.claimsWatcherDocument !== 'function') continue;
        try { if (x.instance.claimsWatcherDocument(item)) return true; }
        catch (e) { console.error(`[Entegrasyon] ${x.manifest.id} belge sahipligi: ${e.message}`); }
    }
    return false;
}

module.exports = { configure, loadAll, autoStart, stopAll, runNow, status, integrationRoots, claimsWatcherDocument };
