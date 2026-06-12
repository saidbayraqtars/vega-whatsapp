// ─── WhatsApp servisi (Baileys / WebSocket — chromium gerekmez) ──────────────
// proje teknik'teki çalışan servis temel alınarak toplu gönderim için uyarlandı:
//   • QR ile bağlanma + otomatik yeniden bağlanma + durum
//   • Metin + medya (görsel/video/belge) gönderimi
//   • Gönderim öncesi "yazıyor..." (presence) simülasyonu — insansı görünüm
//   • onWhatsApp ile numara WhatsApp'ta kayıtlı mı kontrolü (bot sinyalini azaltır)
// Gönderim hızlandırma/molalar server.js tarafında yönetilir; burası tek tek
// güvenilir gönderim sağlar.

const fs = require('fs');
const path = require('path');

// pkg altında exe dizinini, geliştirmede klasörü kullan.
const isPkg = typeof process.pkg !== 'undefined';
const baseDir = process.env.VEGA_BASE_DIR || (isPkg ? path.dirname(process.execPath) : __dirname);
const DATA_DIR = path.join(baseDir, 'data');
const AUTH_DIR = path.join(DATA_DIR, 'baileys-auth');
const STATS_PATH = path.join(DATA_DIR, 'wa-stats.json');
const VERSION_PATH = path.join(DATA_DIR, 'wa-version.json');
const EVENTS_PATH = path.join(DATA_DIR, 'wa-events.log');
const QR_TIMEOUT_MS = 60_000;

let sock = null;
let isReady = false;
let isInitializing = false;
let lastError = null;
let currentQR = null;
let qrTimer = null;
let meId = null;
let _baileys = null;

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

// ─── Günlük gönderim sayacı (kalıcı) ─────────────────────────────────────────
// Günlük tavan iş (job) bazlı değil hesap bazlı anlamlı: aynı gün başlatılan
// ikinci toplu gönderim de aynı tavandan düşmeli (ban riski hesaba göre işler).
// Sayaç data/wa-stats.json'da tutulur; yeniden başlatma sıfırlamaz, gün dönünce
// kendiliğinden sıfırlanır. Watcher gönderimleri de sayılır.
const todayKey = () => new Date().toISOString().slice(0, 10);
let dailyStats = { date: todayKey(), sent: 0 };
try {
    const s = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
    if (s && s.date === todayKey()) dailyStats = s;
} catch { /* ilk çalıştırma */ }
const bumpDailySent = () => {
    if (dailyStats.date !== todayKey()) dailyStats = { date: todayKey(), sent: 0 };
    dailyStats.sent++;
    try { ensureDir(DATA_DIR); fs.writeFileSync(STATS_PATH, JSON.stringify(dailyStats)); } catch { /* yok say */ }
};
const getDailySent = () => (dailyStats.date === todayKey() ? dailyStats.sent : 0);

// ─── Bağlantı olay günlüğü (kalıcı) ──────────────────────────────────────────
// Müşteride "bağlantı sürekli düşüyor" şikâyeti teşhis edilemiyordu çünkü kopma
// sebebi hiçbir yere yazılmıyordu. Her open/close olayı kod+mesajıyla buraya
// eklenir; dosya 200KB'ı aşınca son yarısı tutulur.
const waEvent = (line) => {
    try {
        ensureDir(DATA_DIR);
        fs.appendFileSync(EVENTS_PATH, `${new Date().toISOString()} ${line}\n`);
        const st = fs.statSync(EVENTS_PATH);
        if (st.size > 200_000) {
            const buf = fs.readFileSync(EVENTS_PATH, 'utf8');
            fs.writeFileSync(EVENTS_PATH, buf.slice(buf.length / 2));
        }
    } catch { /* günlük yazılamazsa gönderim etkilenmesin */ }
};

// ─── WA protokol sürümü önbelleği ────────────────────────────────────────────
// fetchLatestBaileysVersion her bağlanışta internete çıkar; ağ sorunluyken
// (tam da yeniden bağlanmaya çalıştığımız anda) hata verip varsayılan eski
// sürüme düşer, bu da 405 ile bağlantının tekrar kopmasına yol açabilir.
// Başarılı sorgu diske yazılır; sorgu başarısızsa son bilinen sürüm kullanılır.
const loadCachedVersion = () => {
    try {
        const v = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'));
        return Array.isArray(v.version) ? v.version : null;
    } catch { return null; }
};
const saveCachedVersion = (version) => {
    try { ensureDir(DATA_DIR); fs.writeFileSync(VERSION_PATH, JSON.stringify({ version, at: Date.now() })); }
    catch { /* yok say */ }
};

// ─── Bağlantı bekleyicileri ──────────────────────────────────────────────────
// Bağlantı koptuğunda gönderim döngüleri burada bekler; "open" gelince hepsi
// uyandırılır. Böylece mesajlar kaybolmaz, sırada birikir ve bağlanınca akar.
let readyWaiters = [];
const notifyReady = () => {
    const waiters = readyWaiters;
    readyWaiters = [];
    for (const resolve of waiters) resolve(true);
};
// isReady olana kadar bekle. timeoutMs > 0 verilirse süre dolunca false döner
// (çağıran taraf iptal kontrolü yapıp tekrar bekleyebilsin diye).
const waitForReady = (timeoutMs = 0) => {
    if (isReady) return Promise.resolve(true);
    return new Promise((resolve) => {
        let timer = null;
        const entry = (ok) => { if (timer) clearTimeout(timer); resolve(ok); };
        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                readyWaiters = readyWaiters.filter((w) => w !== entry);
                resolve(false);
            }, timeoutMs);
        }
        readyWaiters.push(entry);
    });
};

// Yeniden başlatmayı tek timer'la debounce et (hata döngüsünde spam olmasın).
let retryTimer = null;
const scheduleInit = (ms) => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!isReady && !isInitializing) initializeWhatsApp();
    }, ms);
};

// Üst üste kopmalarda bekleme süresini artır (3s → 6s → 12s ... 60s tavan).
// Sabit 3sn ile sorunlu ağda saniyede bir el sıkışma denenip WhatsApp tarafında
// şüpheli trafik oluşuyordu; başarılı bağlantı sayacı sıfırlar.
let reconnectFails = 0;
const backoffMs = () => Math.min(3000 * Math.pow(2, Math.min(reconnectFails, 5)), 60_000);

const makeLogger = () => {
    const log = {
        trace: () => {}, debug: () => {}, info: () => {},
        warn: (...a) => console.warn('[Baileys]', ...a),
        error: (...a) => console.error('[Baileys]', ...a),
        fatal: (...a) => console.error('[Baileys][FATAL]', ...a),
        level: 'warn',
    };
    log.child = () => makeLogger();
    return log;
};

const loadBaileys = async () => {
    if (!_baileys) _baileys = await import('@whiskeysockets/baileys');
    return _baileys;
};

const getStatus = () => ({
    ready: isReady,
    initializing: isInitializing,
    hasQr: !!currentQR,
    qr: currentQR,
    error: lastError,
    me: meId,
});

const clearQrTimer = () => { if (qrTimer) { clearTimeout(qrTimer); qrTimer = null; } };

const cleanupSocket = () => {
    if (sock) {
        try { sock.ev.removeAllListeners(); } catch { /* yok say */ }
        try { sock.end(); } catch { /* yok say */ }
        sock = null;
    }
};

const wipeAuth = () => {
    if (fs.existsSync(AUTH_DIR)) {
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); }
        catch (err) { console.error('[WhatsApp] Auth temizlenemedi:', err.message); }
    }
};

const initializeWhatsApp = async () => {
    if (isReady || isInitializing) return getStatus();

    isInitializing = true;
    lastError = null;
    currentQR = null;
    clearQrTimer();
    console.log('[WhatsApp] Başlatılıyor...');

    try {
        const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
            await loadBaileys();

        ensureDir(AUTH_DIR);
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        let version;
        try {
            const fetched = await fetchLatestBaileysVersion();
            version = fetched.version;
            saveCachedVersion(version);
            console.log('[WhatsApp] WA protokol sürümü:', version.join('.'));
        } catch (err) {
            version = loadCachedVersion() || undefined;
            console.warn('[WhatsApp] Sürüm sorgulanamadı,', version ? `önbellek: ${version.join('.')}` : 'varsayılan kullanılacak.', '—', err.message);
        }

        sock = makeWASocket({
            logger: makeLogger(),
            printQRInTerminal: false,
            auth: state,
            version,
            connectTimeoutMs: 60_000,
            defaultQueryTimeoutMs: 60_000,
            keepAliveIntervalMs: 25_000,
            browser: ['Vega Toplu Mesaj', 'Chrome', '120.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentQR = qr;
                isReady = false;
                isInitializing = false;
                clearQrTimer();
                console.log('[WhatsApp] QR hazır — telefonla okutun.');
            }

            if (connection === 'open') {
                isReady = true;
                isInitializing = false;
                currentQR = null;
                lastError = null;
                meId = sock?.user?.id || null;
                reconnectFails = 0;
                clearQrTimer();
                console.log('[WhatsApp] Bağlantı kuruldu!', meId || '');
                waEvent(`open ${meId || ''}`);
                notifyReady();
            }

            if (connection === 'close') {
                clearQrTimer();
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errMsg = lastDisconnect?.error?.message;
                console.log(`[WhatsApp] Bağlantı kapandı. Kod: ${statusCode}, mesaj: ${errMsg}`);
                waEvent(`close code=${statusCode} msg=${errMsg || ''}`);
                isReady = false;
                cleanupSocket();

                const shouldWipe =
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === DisconnectReason.badSession ||
                    statusCode === 401;

                // 440: aynı oturum başka yerde açıldı (WhatsApp Web/ikinci kopya).
                // Hemen geri bağlanmak karşı tarafı düşürür, o da bizi düşürür →
                // sonsuz düşürme savaşı. Daha uzun bekle ve sebebi kullanıcıya söyle.
                const conflict =
                    statusCode === DisconnectReason.connectionReplaced || statusCode === 440;
                if (conflict) {
                    lastError = 'Bu WhatsApp oturumu başka bir yerde açıldı (WhatsApp Web / ikinci kopya). Diğer oturumu kapatın.';
                }

                if (shouldWipe) {
                    wipeAuth();
                    isInitializing = false;
                    currentQR = null;
                    lastError = null;
                    reconnectFails = 0;
                    scheduleInit(1500);
                } else {
                    isInitializing = false;
                    currentQR = null;
                    scheduleInit(conflict ? 20_000 : backoffMs());
                    reconnectFails++;
                }
            }
        });

        // "QR yok, open yok, close yok" takılma durumuna karşı koruma.
        qrTimer = setTimeout(() => {
            if (!isReady && !currentQR) {
                console.warn('[WhatsApp] QR zaman aşımı, yeniden deneniyor.');
                lastError = 'QR oluşturulamadı, yeniden deneniyor...';
                cleanupSocket();
                isInitializing = false;
                scheduleInit(500);
            }
        }, QR_TIMEOUT_MS);

    } catch (err) {
        lastError = err.message;
        isInitializing = false;
        isReady = false;
        cleanupSocket();
        clearQrTimer();
        console.error('[WhatsApp] Başlatma hatası:', err.message);
        scheduleInit(5000);
    }

    return getStatus();
};

const refreshWhatsApp = async () => {
    console.log('[WhatsApp] Manuel yenileme (oturum sıfırlanır).');
    cleanupSocket();
    clearQrTimer();
    isReady = false;
    isInitializing = false;
    currentQR = null;
    lastError = null;
    meId = null;
    wipeAuth();
    return initializeWhatsApp();
};

// Çıkış yap ama auth'u koru (sadece bağlantıyı kapat).
const logoutWhatsApp = async () => {
    try { if (sock) await sock.logout(); } catch { /* yok say */ }
    cleanupSocket();
    isReady = false;
    meId = null;
    wipeAuth();
    return getStatus();
};

const toJid = (phone) => `${String(phone).replace(/[^0-9]/g, '')}@s.whatsapp.net`;

// Numara WhatsApp'ta kayıtlı mı? Kayıtlı değilse gönderme (ban sinyalini azaltır).
// transient=true → sonuç güvenilmez (bağlantı yok / sorgu hatası / boş yanıt);
// çağıran taraf numarayı "WhatsApp'ta yok" sayıp kalıcı atlamamalı, tekrar denemeli.
// (Baileys yeniden bağlanmanın hemen ardından onWhatsApp'a boş dizi dönebiliyor —
// gerçek kullanıcılar "kullanıcı değil" sanılıp mesajsız kalıyordu.)
const checkOnWhatsApp = async (phone) => {
    if (!isReady || !sock) return { exists: false, transient: true, error: 'WhatsApp bağlı değil.' };
    try {
        const clean = String(phone).replace(/[^0-9]/g, '');
        const results = await sock.onWhatsApp(clean);
        if (!Array.isArray(results) || !results.length) {
            return { exists: false, transient: true, error: 'Sorgu boş yanıt verdi' };
        }
        const r = results[0];
        return { exists: !!r?.exists, jid: r?.jid || null };
    } catch (err) {
        return { exists: false, transient: true, error: err.message };
    }
};

// İnsansı görünüm: "yazıyor..." durumu gönder, kısa bekle.
const simulateTyping = async (jid, ms = 1500) => {
    try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise((r) => setTimeout(r, ms));
        await sock.sendPresenceUpdate('paused', jid);
    } catch { /* presence başarısızlığı gönderimi engellemesin */ }
};

// Tek mesaj gönder. media: { kind:'image'|'video'|'document', buffer, mimetype, fileName } | null
const sendMessage = async (phone, text, media = null, opts = {}) => {
    if (!isReady || !sock) return { success: false, error: 'WhatsApp bağlı değil.' };
    const clean = String(phone).replace(/[^0-9]/g, '');
    if (!clean) return { success: false, error: 'Geçersiz numara.' };
    const jid = `${clean}@s.whatsapp.net`;

    try {
        if (opts.simulateTyping) await simulateTyping(jid, opts.typingMs || 1500);

        let content;
        const caption = text || '';
        if (media && media.buffer) {
            if (media.kind === 'image') {
                content = { image: media.buffer, caption, mimetype: media.mimetype || 'image/jpeg' };
            } else if (media.kind === 'video') {
                content = { video: media.buffer, caption, mimetype: media.mimetype || 'video/mp4' };
            } else {
                content = {
                    document: media.buffer,
                    mimetype: media.mimetype || 'application/octet-stream',
                    fileName: media.fileName || 'dosya',
                    caption,
                };
            }
        } else {
            content = { text: caption };
        }

        await sock.sendMessage(jid, content);
        bumpDailySent();
        return { success: true };
    } catch (err) {
        console.error('[WhatsApp] Gönderim hatası →', clean, err.message);
        return { success: false, error: err.message };
    }
};

module.exports = {
    initializeWhatsApp,
    refreshWhatsApp,
    logoutWhatsApp,
    getStatus,
    sendMessage,
    checkOnWhatsApp,
    getDailySent,
    waitForReady,
    toJid,
    get client() { return sock; },
};
