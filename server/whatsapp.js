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
const { normalizePhone } = require('./phone');

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

// Gelen mesaj işleyici (AI oto-yanıt botu için). server.js kaydeder; sock her
// yeniden bağlanışta baştan kurulduğu için dinleyici initializeWhatsApp içinde
// bağlanır ve bu callback'i çağırır (removeAllListeners sonrası kaybolmasın diye).
let incomingHandler = null;
const setIncomingHandler = (fn) => { incomingHandler = fn; };
// Bağlantı kapanışını üst katmana (anti-ban) bildir. statusCode ile çağrılır;
// anti-ban ban-şüpheli kapanışta gönderimi soğutur. whatsapp.js düşük seviyede
// kalsın diye doğrudan antiban require etmez — server.js bağlar.
let disconnectHandler = null;
const setDisconnectHandler = (fn) => { disconnectHandler = fn; };

// Baileys mesaj gövdesinden düz metni çıkar (farklı sarmalayıcı tipleri).
const extractText = (msg) => {
    if (!msg) return '';
    // viewOnce / ephemeral sarmalayıcılarını aç
    const inner = msg.ephemeralMessage?.message
        || msg.viewOnceMessage?.message
        || msg.viewOnceMessageV2?.message
        || msg;
    return (
        inner.conversation
        || inner.extendedTextMessage?.text
        || inner.imageMessage?.caption
        || inner.videoMessage?.caption
        || inner.documentMessage?.caption
        || ''
    ).trim();
};

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

// ─── Gönderilen mesaj önbelleği (retry/yeniden şifreleme için) ───────────────
// WhatsApp karşı taraf mesajı çözemeyince retry ister; Baileys getMessage(key)
// ile orijinali isteyip YENİDEN şifreler. undefined dönersek mesaj karşıda
// "Mesaj bekleniyor..." takılır. id → message proto (son ~400 gönderim tutulur).
const sentMsgCache = new Map();
const cacheSentMessage = (id, message) => {
    if (!id || !message) return;
    sentMsgCache.set(id, message);
    if (sentMsgCache.size > 400) sentMsgCache.delete(sentMsgCache.keys().next().value);
};

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
// Bekleyen otomatik yeniden-bağlanmayı iptal et. Kullanıcı elle "QR oluştur"a
// bastığında çağrılır: zamanlanmış reconnect ile elle başlatma yarışmasın.
const clearRetry = () => { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } };

// Üst üste kopmalarda bekleme süresini artır (3s → 6s → 12s ... 60s tavan).
// Sabit 3sn ile sorunlu ağda saniyede bir el sıkışma denenip WhatsApp tarafında
// şüpheli trafik oluşuyordu; başarılı bağlantı sayacı sıfırlar.
let reconnectFails = 0;
const backoffMs = () => Math.min(3000 * Math.pow(2, Math.min(reconnectFails, 5)), 60_000);

// badSession (500) üst üste kaç kez geldi? İlk gelişte oturum silinmez (geçici
// senkron hatası olabilir), 2. üst üste gelişte gerçekten bozuk sayılıp silinir.
// Başarılı "open" sayacı sıfırlar.
let badSessionFails = 0;

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
            // Bağlanınca hesabı "online" İŞARETLEME. Varsayılan true; online olunca WA
            // bildirimleri aktif cihaza (bu programa) yönlendirir → telefon/diğer bağlı
            // cihazlar push ALMAZ. false → telefon birincil kalır, bildirimler oraya düşer;
            // program yine sessizce mesaj gönderir/alır.
            markOnlineOnConnect: false,
            browser: ['Vega Toplu Mesaj', 'Chrome', '120.0'],
            // Karşı taraf mesajı çözemeyince (yeni oturum/anahtar uyuşmazlığı) WA bir
            // "retry receipt" gönderir; Baileys mesajı YENİDEN şifreleyip göndermek için
            // getMessage(key) ile orijinal içeriği ister. Burada undefined dönersek
            // yeniden gönderim OLMAZ → mesaj karşıda "Mesaj bekleniyor..." takılır.
            // Bu yüzden gönderdiğimiz mesajları kısa süre cache'te tutup buradan döndürüyoruz.
            getMessage: async (key) => sentMsgCache.get(key?.id) || undefined,
        });

        sock.ev.on('creds.update', saveCreds);

        // Gönderim TANILAMA: gönderdiğimiz mesajların gerçek teslim durumunu (ack) günlüğe
        // yaz. status: 1=PENDING 2=SERVER_ACK(WhatsApp aldı) 3=DELIVERY_ACK(karşıya ulaştı)
        // 4=READ. "gönderildi deyip ulaşmıyor" şikayetinde: SERVER_ACK var ama DELIVERY_ACK
        // hiç gelmiyorsa WhatsApp kabul edip düşürüyor (shadow/anti-bot); hiç ack yoksa relay
        // olmuyor (protokol/sürüm). Teşhis için kritik.
        sock.ev.on('messages.update', (updates) => {
            for (const u of (updates || [])) {
                if (u?.key?.fromMe && u?.update && u.update.status != null) {
                    waEvent(`ack id=${u.key.id} to=${u.key.remoteJid} status=${u.update.status}`);
                }
            }
        });

        // Gelen mesajlar → AI oto-yanıt botu. Yalnız: bize gelen (fromMe değil),
        // birebir sohbet (@s.whatsapp.net — grup/broadcast/status hariç), metin
        // içeren. Filtre/karar/gönderim incomingHandler'da (ai-bot.js). type
        // 'notify' = canlı yeni mesaj (append = geçmiş senkronu, atlanır).
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify' || !incomingHandler) return;
            for (const m of (messages || [])) {
                try {
                    if (!m.message || m.key?.fromMe) continue;
                    const jid = m.key?.remoteJid || '';
                    // Birebir sohbet: @s.whatsapp.net VEYA @lid (WhatsApp gizli-numara /
                    // Linked ID formatı). @lid'de gerçek telefon key.senderPn'de gelir.
                    // Grup(@g.us)/broadcast/status hariç.
                    let phone = null;
                    if (jid.endsWith('@s.whatsapp.net')) {
                        phone = jid.split('@')[0];
                    } else if (jid.endsWith('@lid')) {
                        const pn = m.key?.senderPn || m.key?.participantPn || '';
                        if (pn.includes('@')) phone = pn.split('@')[0];
                    } else {
                        continue;
                    }
                    const text = extractText(m.message);
                    if (!text) continue;
                    if (!phone) { waEvent(`incoming-nopn jid=${jid}`); continue; }
                    waEvent(`incoming from=${phone} jid=${jid} len=${text.length}`);
                    await incomingHandler({ phone, text, jid, id: m.key?.id || null });
                } catch (err) {
                    waEvent(`incoming-err ${err.message}`);
                }
            }
        });

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
                badSessionFails = 0;
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
                // Anti-ban: ban-şüpheli kapanış / fırtına → gönderim soğuması.
                try { disconnectHandler && disconnectHandler(statusCode); } catch { /* yok say */ }

                // badSession (500) çoğu zaman geçici senkron hatası; ilk gelişte
                // oturumu SİLMEDEN diskten yeniden bağlan, ÜST ÜSTE 2. kez gelirse
                // gerçekten bozuk say ve auth'u sil (yeni QR). open olunca sıfırlanır.
                const isBadSession = statusCode === DisconnectReason.badSession;
                if (isBadSession) badSessionFails++;
                else badSessionFails = 0; // araya başka kod girerse "üst üste" sıfırlanır
                const shouldWipe =
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 ||
                    (isBadSession && badSessionFails >= 2);

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
                    badSessionFails = 0;
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
    clearRetry();          // bekleyen otomatik reconnect'i kır — elle QR'a öncelik ver
    cleanupSocket();
    clearQrTimer();
    isReady = false;
    isInitializing = false;
    currentQR = null;
    lastError = null;
    meId = null;
    reconnectFails = 0;
    badSessionFails = 0;
    wipeAuth();
    return initializeWhatsApp();
};

// Çıkış yap ama auth'u koru (sadece bağlantıyı kapat).
const logoutWhatsApp = async () => {
    clearRetry();
    clearQrTimer();
    try { if (sock) await sock.logout(); } catch { /* yok say */ }
    cleanupSocket();
    isReady = false;
    isInitializing = false;
    meId = null;
    reconnectFails = 0;
    badSessionFails = 0;
    wipeAuth();
    return getStatus();
};

// TR normalizasyonu: +90.../90.../0... hepsi tek biçime (905...) iner — aksi halde
// 05350786101@s.whatsapp.net gibi geçersiz JID "gönderildi" görünüp teslim olmaz.
const toJid = (phone) => `${normalizePhone(phone)}@s.whatsapp.net`;

// Numara WhatsApp'ta kayıtlı mı? Kayıtlı değilse gönderme (ban sinyalini azaltır).
// transient=true → sonuç güvenilmez (bağlantı yok / sorgu hatası / boş yanıt);
// çağıran taraf numarayı "WhatsApp'ta yok" sayıp kalıcı atlamamalı, tekrar denemeli.
// (Baileys yeniden bağlanmanın hemen ardından onWhatsApp'a boş dizi dönebiliyor —
// gerçek kullanıcılar "kullanıcı değil" sanılıp mesajsız kalıyordu.)
const checkOnWhatsApp = async (phone) => {
    if (!isReady || !sock) return { exists: false, transient: true, error: 'WhatsApp bağlı değil.' };
    try {
        const clean = normalizePhone(phone);
        if (!clean) return { exists: false, transient: false, error: 'Geçersiz numara.' };
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
    // Zombi bağlantı koruması: connection.update 'open' geldi ama alttaki WebSocket
    // temiz bir 'close' olayı gelmeden sessizce kapandıysa isReady bayrağı yanıltıcı
    // kalır → sock.sendMessage throw ETMEDEN çözülür, "gönderildi" loglanır ama mesaj
    // TESLİM OLMAZ. Gerçek WS durumunu kontrol et: kapalıysa başarısız say + yeniden
    // bağlanmayı tetikle (üst katman kuyruğa alır/yeniden dener). isOpen yalnız KESİN
    // false ise müdahale et (tanımsız/ara durumda eski davranışı koru).
    if (sock.ws && sock.ws.isOpen === false) {
        isReady = false;
        waEvent('send-abort ws-not-open (zombie)');
        scheduleInit(500);
        return { success: false, error: 'WhatsApp bağlantısı kopuk (yeniden bağlanılıyor).' };
    }
    const clean = normalizePhone(phone);
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

        const sent = await sock.sendMessage(jid, content);
        // Retry/yeniden şifreleme için orijinali sakla (getMessage buradan döndürür).
        cacheSentMessage(sent?.key?.id, sent?.message);
        bumpDailySent();
        // TANILAMA: relay sonucu. id varsa Baileys WA sunucusuna iletti; ardından gelen
        // 'ack' satırları (messages.update) gerçek teslimi gösterir. id YOKSA relay olmadı.
        waEvent(`send-ok to=${clean} id=${sent?.key?.id || 'YOK'}`);
        return { success: true, id: sent?.key?.id || null };
    } catch (err) {
        console.error('[WhatsApp] Gönderim hatası →', clean, err.message);
        waEvent(`send-fail to=${clean} err=${err.message}`);
        return { success: false, error: err.message };
    }
};

// Gönderilmiş bir mesajı herkesten geri çek (delete-for-everyone). id = sendMessage'ın
// döndürdüğü key.id. WhatsApp ~2 gün sınırı koyar; daha eski mesajda sunucu hata döner.
// Birebir (DM) sohbet olduğu için key.participant gerekmez.
const deleteMessage = async (phone, id) => {
    if (!isReady || !sock) return { success: false, error: 'WhatsApp bağlı değil.' };
    if (!id) return { success: false, error: 'Mesaj kimliği yok.' };
    const clean = normalizePhone(phone);
    if (!clean) return { success: false, error: 'Geçersiz numara.' };
    const jid = `${clean}@s.whatsapp.net`;
    try {
        await sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe: true, id } });
        waEvent(`recall-ok to=${clean} id=${id}`);
        return { success: true };
    } catch (err) {
        waEvent(`recall-fail to=${clean} id=${id} err=${err.message}`);
        return { success: false, error: err.message };
    }
};

module.exports = {
    initializeWhatsApp,
    refreshWhatsApp,
    logoutWhatsApp,
    getStatus,
    sendMessage,
    deleteMessage,
    checkOnWhatsApp,
    getDailySent,
    waitForReady,
    setIncomingHandler,
    setDisconnectHandler,
    toJid,
    get client() { return sock; },
};
