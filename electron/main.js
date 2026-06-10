// ═══════════════════════════════════════════════════════════════════════════
//  Vega WhatsApp — Electron masaüstü sarmalayıcı
//  • Express sunucu + tahsilat watcher AYNI process'te çalışır (arka plan servis).
//  • Pencere (X) kapatınca tray'e küçülür; izleme DURMAZ.
//  • Windows açılışında otomatik başlar (login item).
//  • PIN, Windows DPAPI (safeStorage) ile şifreli saklanır → PC açılışında
//    otomatik DB bağlantısı + watcher (kullanıcı PIN girmeden takip sürer).
// ═══════════════════════════════════════════════════════════════════════════

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, safeStorage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const PORT = 3100;
const URL = `http://localhost:${PORT}`;

// Tek örnek kilidi — ikinci kez açılırsa mevcut pencereyi öne getir.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let mainWindow = null;
let tray = null;
let isQuitting = false;

const userDataDir = app.getPath('userData');
const AUTH_BIN = path.join(userDataDir, 'auth.bin'); // safeStorage ile şifreli PIN

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

// PC açılışı / uygulama başlangıcında: kayıtlı PIN ile sessiz DB bağlantısı →
// server.js login içinde watcher.autoStart() çalışır → takip kendiliğinden başlar.
async function autoConnect() {
    const pin = readPin();
    if (!pin) return;
    try {
        await fetch(`${URL}/api/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin }),
        });
        console.log('[Electron] Otomatik bağlantı denendi.');
    } catch (e) { console.error('[Electron] auto-login hata:', e.message); }
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

function setupAutoUpdater() {
    if (!app.isPackaged) return; // geliştirmede (npm start) denetleme yapma

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true; // kullanıcı "Sonra" derse çıkışta kurulur

    autoUpdater.on('update-downloaded', (info) => {
        updateDownloaded = true;
        updateVersion = info.version;
        refreshTrayMenu();
        if (tray) tray.displayBalloon?.({
            title: 'Vega WhatsApp',
            content: `Yeni sürüm ${info.version} indirildi. Tray menüsünden kurabilir veya çıkışta otomatik kurulmasını bekleyebilirsiniz.`,
        });
        // Pencere açıksa kullanıcıya sor; tray'de gizliyse rahatsız etme.
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                buttons: ['Şimdi Kur ve Yeniden Başlat', 'Sonra'],
                defaultId: 0, cancelId: 1,
                title: 'Güncelleme hazır',
                message: `Yeni sürüm ${info.version} indirildi.`,
                detail: 'Şimdi kurulursa uygulama yeniden başlar; tahsilat takibi kurulum sonrası kaldığı yerden sürer (watermark kalıcıdır).',
            }).then(r => { if (r.response === 0) installUpdateNow(); });
        }
    });

    autoUpdater.on('error', (e) => console.error('[Updater]', e?.message || e));

    // Açılışta + her 4 saatte bir denetle (uygulama tray'de uzun süre açık kalıyor).
    autoUpdater.checkForUpdates().catch(() => { /* ağ yoksa sessiz geç */ });
    setInterval(() => autoUpdater.checkForUpdates().catch(() => { /* yok say */ }), 4 * 60 * 60 * 1000);
}

// ─── Pencere + Tray ────────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 820, minWidth: 980, minHeight: 640,
        icon: path.join(__dirname, 'icon.png'),
        title: 'Vega WhatsApp',
        autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    });
    mainWindow.loadURL(URL);

    // X → kapatma değil, tray'e gizle (izleme sürsün).
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
            if (tray) tray.displayBalloon?.({ title: 'Vega WhatsApp', content: 'Arka planda tahsilat takibi sürüyor.' });
        }
    });
}

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
    tray.setToolTip('Vega WhatsApp — tahsilat takibi aktif');
    refreshTrayMenu();
    tray.on('double-click', () => { mainWindow ? (mainWindow.show(), mainWindow.focus()) : createWindow(); });
}

// ─── IPC (preload üzerinden web arayüzü çağırır) ───────────────────────────────
ipcMain.handle('pin:save', (_e, pin) => savePin(pin));
ipcMain.handle('pin:has', () => fs.existsSync(AUTH_BIN));
ipcMain.handle('pin:clear', () => { clearPin(); return true; });
ipcMain.handle('autostart:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('autostart:set', (_e, on) => { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); return true; });

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

    // --hidden ile (oto-başlatma) açıldıysa pencereyi gösterme, tray'de kal.
    const hidden = process.argv.includes('--hidden');
    if (!hidden) createWindow();
    else createWindow(), mainWindow.hide();
});

// Tray uygulaması: tüm pencereler kapansa da çalışmaya devam (macOS hariç davranış).
app.on('window-all-closed', (e) => { /* tray'de kal, çıkma */ });
app.on('before-quit', () => { isQuitting = true; });
