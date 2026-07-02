// ═══════════════════════════════════════════════════════════════════════════
//  Vega WhatsApp — Electron masaüstü sarmalayıcı
//  • Express sunucu + tahsilat watcher AYNI process'te çalışır (arka plan servis).
//  • Pencere (X) kapatınca tray'e küçülür; izleme DURMAZ.
//  • Windows açılışında otomatik başlar (login item).
//  • PIN, Windows DPAPI (safeStorage) ile şifreli saklanır → PC açılışında
//    otomatik DB bağlantısı + watcher (kullanıcı PIN girmeden takip sürer).
// ═══════════════════════════════════════════════════════════════════════════

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const PORT = 3100;
const URL = `http://localhost:${PORT}`;

// Tek örnek kilidi — ikinci kez açılırsa mevcut pencereyi öne getir.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let mainWindow = null;
let floatWindow = null;
let tray = null;
let isQuitting = false;

const userDataDir = app.getPath('userData');
const AUTH_BIN = path.join(userDataDir, 'auth.bin'); // safeStorage ile şifreli PIN
const FLOAT_POS = path.join(userDataDir, 'float-pos.json'); // yüzen buton konumu
const FLOAT_HIDDEN = path.join(userDataDir, '.float-hidden'); // kullanıcı gizlediyse marker

// ─── Sunucuyu aynı process'te başlat ───────────────────────────────────────────
function startServer() {
    process.env.VEGA_BASE_DIR = userDataDir; // config.json + data/ buraya
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    require(path.join(__dirname, '..', 'server', 'server.js')); // app.listen tetikler
}

// Sunucu ayağa kalkana kadar bekle.
async function waitForServer(timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const r = await fetch(`${URL}/api/status`);
            if (r.ok) return true;
        } catch { /* henüz hazır değil */ }
        await new Promise(r => setTimeout(r, 400));
    }
    return false;
}

// ─── PIN saklama (DPAPI) ───────────────────────────────────────────────────────
function savePin(pin) {
    if (!safeStorage.isEncryptionAvailable()) return false;
    fs.writeFileSync(AUTH_BIN, safeStorage.encryptString(String(pin)));
    return true;
}
function readPin() {
    try {
        if (!fs.existsSync(AUTH_BIN) || !safeStorage.isEncryptionAvailable()) return null;
        return safeStorage.decryptString(fs.readFileSync(AUTH_BIN));
    } catch { return null; }
}
function clearPin() { try { fs.existsSync(AUTH_BIN) && fs.unlinkSync(AUTH_BIN); } catch { /* yok say */ } }

// PC açılışı / uygulama başlangıcında: PIN'siz sessiz DB bağlantısı. Sunucu zaten
// boot'ta otomatik bağlanır; bu yalnızca emniyet için bir tetikleyici. /api/connect
// içinde watcher + reminders autoStart çalışır → takip kendiliğinden sürer.
async function autoConnect() {
    try {
        await fetch(`${URL}/api/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        console.log('[Electron] Otomatik bağlantı denendi.');
    } catch (e) { console.error('[Electron] auto-connect hata:', e.message); }
}

// ─── Otomatik güncelleme (GitHub Releases) ─────────────────────────────────────
// Paketli sürüm github.com/saidbayraqtars/vega-whatsapp-releases'tan yeni sürüm
// denetler (publish ayarı package.json'da). İndirme otomatik; kurulum kullanıcı
// onayıyla hemen ya da uygulama kapanırken sessizce yapılır.
let updateDownloaded = false;
let updateVersion = null;

function installUpdateNow() {
    isQuitting = true; // tray'e gizlenme davranışını atla, gerçekten kapan
    autoUpdater.quitAndInstall(true, true); // sessiz kur + kurulunca yeniden başlat
}

// ─── Güncelleme durum penceresi ────────────────────────────────────────────────
// İndirme arka planda sürer; sağ-altta küçük, logolu "Güncelleme yükleniyor..."
// kartı çıkar (odak çalmaz). İndirme bitince aynı kartta "Şimdi Kur / Sonra".
let updateWindow = null;
let updateWinState = null;

function sendUpdateState(state) {
    updateWinState = state;
    if (updateWindow && !updateWindow.isDestroyed()) {
        updateWindow.webContents.send('updater:state', state);
    }
}

function createUpdateWindow() {
    if (updateWindow && !updateWindow.isDestroyed()) { return; }
    const { screen } = require('electron');
    const wa = screen.getPrimaryDisplay().workArea;
    updateWindow = new BrowserWindow({
        width: 380, height: 160,
        x: wa.x + wa.width - 396, y: wa.y + wa.height - 176,
        frame: false, transparent: true, hasShadow: false,
        resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
        skipTaskbar: true, alwaysOnTop: true, show: false,
        title: 'Güncelleme',
        webPreferences: { preload: path.join(__dirname, 'updater-preload.js'), contextIsolation: true },
    });
    updateWindow.loadFile(path.join(__dirname, 'updater.html'));
    updateWindow.webContents.on('did-finish-load', () => {
        if (updateWinState) updateWindow.webContents.send('updater:state', updateWinState);
    });
    updateWindow.once('ready-to-show', () => {
        if (updateWindow && !updateWindow.isDestroyed()) updateWindow.showInactive(); // odak çalma
    });
    updateWindow.on('closed', () => { updateWindow = null; });
}

function closeUpdateWindow() {
    if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
}

function setupAutoUpdater() {
    if (!app.isPackaged) return; // geliştirmede (npm start) denetleme yapma

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true; // kullanıcı "Sonra" derse çıkışta kurulur

    // İndirme başladı → durum penceresini göster (arka planda inmeye devam eder).
    autoUpdater.on('update-available', (info) => {
        updateVersion = info.version;
        createUpdateWindow();
        sendUpdateState({ phase: 'downloading', version: info.version, percent: 0 });
    });

    autoUpdater.on('download-progress', (p) => {
        sendUpdateState({ phase: 'downloading', version: updateVersion, percent: Math.round(p?.percent || 0) });
    });

    autoUpdater.on('update-downloaded', (info) => {
        updateDownloaded = true;
        updateVersion = info.version;
        refreshTrayMenu();
        // Aynı kartta "Şimdi Kur / Sonra" — native dialog yok.
        createUpdateWindow();
        sendUpdateState({ phase: 'ready', version: info.version });
    });

    autoUpdater.on('error', (e) => { console.error('[Updater]', e?.message || e); closeUpdateWindow(); });

    // Açılışta + her 4 saatte bir denetle (uygulama tray'de uzun süre açık kalıyor).
    autoUpdater.checkForUpdates().catch(() => { /* ağ yoksa sessiz geç */ });
    setInterval(() => autoUpdater.checkForUpdates().catch(() => { /* yok say */ }), 4 * 60 * 60 * 1000);
}

// ─── Pencere + Tray ────────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 820, minWidth: 980, minHeight: 640,
        icon: path.join(__dirname, 'icon.png'),
        title: 'Expert Bilişim — WhatsApp Tahsilat',
        autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    });
    // Önceki sürümden cache'lenmiş eski arayüz (index/app/style) kalmasın → temizle, sonra yükle.
    mainWindow.webContents.session.clearCache()
        .catch(() => { /* yok say */ })
        .finally(() => mainWindow.loadURL(URL));

    // X → kapatma değil, tray'e gizle (izleme sürsün).
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
            if (tray) tray.displayBalloon?.({ title: 'Expert Bilişim', content: 'Arka planda tahsilat takibi sürüyor.' });
        }
    });
}

// ─── Yüzen "Bakiyeyi Gönder" butonu ────────────────────────────────────────────
// Arctos'un üstünde duran küçük, her zaman üstte, çerçevesiz pencere. Arctos'ta
// açık cariyi (server plan-cache ile tespit eder) gösterir; tıkla → önizle → gönder.
function loadFloatPos() {
    try { if (fs.existsSync(FLOAT_POS)) return JSON.parse(fs.readFileSync(FLOAT_POS, 'utf8')); } catch { /* yok say */ }
    return null;
}
function saveFloatPos() {
    if (!floatWindow || floatWindow.isDestroyed()) return;
    try { const [x, y] = floatWindow.getPosition(); fs.writeFileSync(FLOAT_POS, JSON.stringify({ x, y })); } catch { /* yok say */ }
}

function createFloatWindow() {
    if (floatWindow && !floatWindow.isDestroyed()) { floatWindow.show(); return; }
    const pos = loadFloatPos();
    floatWindow = new BrowserWindow({
        width: 300, height: 170,
        x: pos ? pos.x : undefined, y: pos ? pos.y : undefined,
        frame: false, transparent: true, hasShadow: false,
        resizable: true, maximizable: false, minimizable: false, fullscreenable: false,
        skipTaskbar: true, alwaysOnTop: true,
        title: 'Bakiyeyi Gönder',
        webPreferences: { preload: path.join(__dirname, 'float-preload.js'), contextIsolation: true },
    });
    floatWindow.setAlwaysOnTop(true, 'screen-saver');
    floatWindow.setVisibleOnAllWorkspaces?.(true);
    floatWindow.loadURL(`${URL}/float.html`);
    if (!pos) {
        // İlk açılış: ekranın sağ-altına yerleştir.
        const { screen } = require('electron');
        const wa = screen.getPrimaryDisplay().workArea;
        floatWindow.setPosition(wa.x + wa.width - 320, wa.y + wa.height - 200);
    }
    floatWindow.on('moved', saveFloatPos);
    floatWindow.on('closed', () => { floatWindow = null; });
}

function showFloat() { try { fs.existsSync(FLOAT_HIDDEN) && fs.unlinkSync(FLOAT_HIDDEN); } catch { /* yok say */ } createFloatWindow(); refreshTrayMenu(); }
function hideFloat() {
    try { fs.writeFileSync(FLOAT_HIDDEN, '1'); } catch { /* yok say */ }
    if (floatWindow && !floatWindow.isDestroyed()) floatWindow.hide();
    refreshTrayMenu();
}
function floatVisible() { return !!(floatWindow && !floatWindow.isDestroyed() && floatWindow.isVisible()); }

function refreshTrayMenu() {
    if (!tray) return;
    const showWin = () => { mainWindow ? (mainWindow.show(), mainWindow.focus()) : createWindow(); };
    const items = [
        { label: 'Göster', click: showWin },
        { type: 'separator' },
    ];
    if (updateDownloaded) {
        items.push({ label: `Güncellemeyi Kur (v${updateVersion})`, click: installUpdateNow });
    } else if (app.isPackaged) {
        items.push({ label: 'Güncellemeleri Denetle', click: () => autoUpdater.checkForUpdates().catch(() => { /* yok say */ }) });
    }
    items.push(
        { type: 'separator' },
        {
            label: 'Bakiye butonu (Arctos üstünde)', type: 'checkbox',
            checked: floatVisible(),
            click: (item) => { item.checked ? showFloat() : hideFloat(); },
        },
        {
            label: 'Windows açılışında başlat', type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] }),
        },
        { type: 'separator' },
        { label: 'Çıkış (takibi durdurur)', click: () => { isQuitting = true; app.quit(); } },
    );
    tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
    const img = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('Expert Bilişim — tahsilat takibi aktif');
    refreshTrayMenu();
    tray.on('double-click', () => { mainWindow ? (mainWindow.show(), mainWindow.focus()) : createWindow(); });
}

// ─── IPC (preload üzerinden web arayüzü çağırır) ───────────────────────────────
ipcMain.handle('pin:save', (_e, pin) => savePin(pin));
ipcMain.handle('pin:has', () => fs.existsSync(AUTH_BIN));
ipcMain.handle('pin:clear', () => { clearPin(); return true; });
ipcMain.handle('autostart:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('autostart:set', (_e, on) => { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); return true; });

// Güncelleme penceresi butonları.
ipcMain.on('updater:install', () => installUpdateNow());
ipcMain.on('updater:later', () => closeUpdateWindow()); // çıkışta otomatik kurulur

// Yüzen buton: pencere boyutu (önizleme açılınca büyür) + gizle.
ipcMain.on('float:size', (_e, { w, h } = {}) => {
    if (floatWindow && !floatWindow.isDestroyed() && w && h) {
        floatWindow.setSize(Math.round(w), Math.round(h));
    }
});
ipcMain.on('float:hide', () => hideFloat());

app.on('second-instance', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });

app.whenReady().then(async () => {
    // Varsayılan: ilk kurulumda Windows açılışında başlatmayı aç.
    if (app.getLoginItemSettings().openAtLogin === false && !fs.existsSync(path.join(userDataDir, '.autostart-set'))) {
        app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
        try { fs.writeFileSync(path.join(userDataDir, '.autostart-set'), '1'); } catch { /* yok say */ }
    }

    startServer();
    createTray();
    setupAutoUpdater();
    const ok = await waitForServer();
    if (!ok) console.error('[Electron] Sunucu başlatılamadı.');
    await autoConnect();

    // Yüzen "Bakiyeyi Gönder" butonu — kullanıcı daha önce gizlemediyse göster.
    if (!fs.existsSync(FLOAT_HIDDEN)) createFloatWindow();

    // --hidden ile (oto-başlatma) açıldıysa pencereyi gösterme, tray'de kal.
    const hidden = process.argv.includes('--hidden');
    if (!hidden) createWindow();
    else createWindow(), mainWindow.hide();
});

// Tray uygulaması: tüm pencereler kapansa da çalışmaya devam (macOS hariç davranış).
app.on('window-all-closed', (e) => { /* tray'de kal, çıkma */ });
app.on('before-quit', () => { isQuitting = true; });
