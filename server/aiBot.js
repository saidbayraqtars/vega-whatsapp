// ═══════════════════════════════════════════════════════════════════════════
//  AI Oto-Yanıt Botu — gelen WhatsApp mesaplarına Claude Haiku ile cevap
//
//  Karar: SEÇMELİ oto-cevap. Bot yalnız belirli konulara (bakiye/borç durumu,
//  ödeme/hesap bilgileri, borç sebebi) cevap verir; diğer her şeyde SESSİZ kalır
//  (mesaj göndermez → insana bırakılır). Karar modele bırakılır: kapsam dışıysa
//  [SESSIZ] üretir.
//
//  Güvenlik/KVKK: yalnız cari kartında EŞLEŞEN numaralara borç bilgisi verilir;
//  tanınmayan numaraya cevap yok. Anahtar (Anthropic) config'te ŞİFRELİ tutulur
//  (server.js encrypt/decrypt — makine anahtarı); UI'dan girilir, gömülü değildir.
//
//  Anti-ban / döngü koruması: çalışma saati penceresi, günlük cevap tavanı,
//  numara-başı min cevap aralığı, mesaj-id tekrar (dedupe) koruması.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const https = require('https');

let deps = null;
let CONFIG_PATH = null;
let STATE_PATH = null;
let LOG_PATH = null;

const DEFAULT_CONFIG = {
    enabled: false,
    apiKeyEnc: null,               // Anthropic anahtarı — ŞİFRELİ (asla düz metin diskte)
    model: 'claude-haiku-4-5',
    firmaNo: null,                 // boşsa watcher/uiContext bağlamına düşer
    donemNo: null,
    businessName: '',              // imza / "biz kimiz" (mesaj altına)
    paymentInfo: '',               // ödeme bilgisi metni (IBAN vb.) — "nereye ödeyeyim" cevabı
    extraInstructions: '',         // kullanıcı ek talimatı (opsiyonel)
    startHour: 9,                  // çalışma saati başlangıç (0-23)
    endHour: 21,                   // çalışma saati bitiş (0-23)
    dailyCap: 100,                 // günlük bot cevap tavanı (anti-ban)
    minGapSec: 30,                 // aynı numaraya iki cevap arası min saniye (döngü koruması)
    onlySmsGonder: false,          // yalnız 'SMS Gönder' izinli carilere cevap
    includeMovements: true,        // borç sebebi için son hareketleri bağlama ekle
};

let config = { ...DEFAULT_CONFIG };
// state: günlük sayaç + numara-başı son cevap + işlenmiş mesaj id'leri (dedupe)
let state = { date: null, sent: 0, lastByPhone: {}, seenIds: [] };
let log = []; // son ~200 olay (UI canlı kayıt)

const todayKey = () => new Date().toISOString().slice(0, 10);

// ─── Kalıcılık ────────────────────────────────────────────────────────────
function configure(d) {
    deps = d;
    const dataDir = path.join(d.baseDir, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    CONFIG_PATH = path.join(dataDir, 'aibot.json');
    STATE_PATH = path.join(dataDir, 'aibot-state.json');
    LOG_PATH = path.join(dataDir, 'aibot-log.json');
    loadConfig();
    loadState();
    loadLog();
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            config = { ...DEFAULT_CONFIG, ...raw };
        }
    } catch (e) { console.error('[AIBot] config okunamadı:', e.message); }
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8'); }
    catch (e) { console.error('[AIBot] config yazılamadı:', e.message); }
}

function loadState() {
    try { if (fs.existsSync(STATE_PATH)) state = { ...state, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) }; }
    catch (e) { console.error('[AIBot] state okunamadı:', e.message); }
    rollDay();
}

function saveState() {
    try { fs.writeFileSync(STATE_PATH, JSON.stringify(state)); }
    catch { /* bellekte devam */ }
}

function loadLog() {
    try { if (fs.existsSync(LOG_PATH)) log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); }
    catch { log = []; }
}

function saveLog() {
    try { fs.writeFileSync(LOG_PATH, JSON.stringify(log)); } catch { /* bellekte devam */ }
}

// Gün dönünce günlük sayaç + numara-başı geçmiş sıfırlanır.
function rollDay() {
    const t = todayKey();
    if (state.date !== t) { state.date = t; state.sent = 0; state.lastByPhone = {}; saveState(); }
}

function addLog(entry) {
    log.unshift({ at: new Date().toISOString(), ...entry });
    if (log.length > 200) log.length = 200;
    saveLog();
}

// ─── Anahtar (şifreli) ──────────────────────────────────────────────────────
function getApiKey() {
    if (!config.apiKeyEnc || !deps?.decryptSecret) return null;
    try { return deps.decryptSecret(config.apiKeyEnc); }
    catch (e) { console.error('[AIBot] anahtar çözülemedi:', e.message); return null; }
}
function hasApiKey() { return !!config.apiKeyEnc; }

// ─── Config API (server.js endpoint'leri kullanır) ──────────────────────────
function getConfig() {
    // apiKeyEnc UI'ya SIZDIRILMAZ; yalnız "var mı" bilgisi döner.
    const { apiKeyEnc, ...rest } = config;
    return { ...rest, hasApiKey: !!apiKeyEnc };
}

// patch.apiKey = düz metin gelirse şifrele; boş/undefined ise mevcut korunur.
function setConfig(patch) {
    const next = { ...config };
    const ALLOWED = [
        'enabled', 'model', 'firmaNo', 'donemNo', 'businessName', 'paymentInfo',
        'extraInstructions', 'startHour', 'endHour', 'dailyCap', 'minGapSec',
        'onlySmsGonder', 'includeMovements',
    ];
    for (const k of ALLOWED) if (patch[k] !== undefined) next[k] = patch[k];
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim() && deps?.encryptSecret) {
        next.apiKeyEnc = deps.encryptSecret(patch.apiKey.trim());
    }
    if (patch.clearApiKey === true) next.apiKeyEnc = null;
    config = next;
    saveConfig();
    return getConfig();
}

function getStatus() {
    rollDay();
    return {
        enabled: config.enabled,
        hasApiKey: hasApiKey(),
        model: config.model,
        firmaNo: config.firmaNo, donemNo: config.donemNo,
        sentToday: state.sent, dailyCap: config.dailyCap,
        startHour: config.startHour, endHour: config.endHour,
    };
}

function getLog() { return log; }

// ─── Çalışma saati penceresi ─────────────────────────────────────────────────
// start<end → aynı gün aralığı (9-21). start>end → gece aşan aralık (21-9).
function withinHours() {
    const h = new Date().getHours();
    const s = Number(config.startHour), e = Number(config.endHour);
    if (s === e) return true;                 // 24 saat
    if (s < e) return h >= s && h < e;
    return h >= s || h < e;                    // gece aşan
}

// ─── Anthropic (Haiku) çağrısı — https, harici bağımlılık yok ────────────────
function callAnthropic({ apiKey, model, system, user, maxTokens = 500 }) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: user }],
        });
        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-length': Buffer.byteLength(payload),
            },
            timeout: 30000,
        }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                let j = null;
                try { j = JSON.parse(body); } catch { return reject(new Error('Yanıt çözümlenemedi.')); }
                if (res.statusCode !== 200) {
                    return reject(new Error(j?.error?.message || `HTTP ${res.statusCode}`));
                }
                const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
                resolve(text);
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('İstek zaman aşımına uğradı.')));
        req.write(payload);
        req.end();
    });
}

const fmtTR = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Sistem istemi (Türkçe) ──────────────────────────────────────────────────
// Modele: yalnız KAPSAM içi (bakiye/ödeme/borç sebebi) sorulara cevap ver, aksi
// halde tam olarak [SESSIZ] üret. Rakam uydurma; verilen bakiyeyi kullan.
function buildSystem() {
    const biz = config.businessName?.trim();
    const pay = config.paymentInfo?.trim();
    const extra = config.extraInstructions?.trim();
    return [
        `Sen bir Türk işletmesinin${biz ? ` (${biz})` : ''} muhasebe/tahsilat WhatsApp asistanısın. Müşteri (cari) mesajlarına kısa, kibar, profesyonel Türkçe ile cevap verirsin.`,
        ``,
        `YALNIZCA şu konularda cevap ver:`,
        `- Güncel bakiye / borç durumu (sana verilen rakamı kullan; ASLA rakam uydurma).`,
        `- Ödeme / hesap bilgileri (IBAN vb. — sana verilen "ÖDEME BİLGİSİ" metnini paylaş).`,
        `- Borç sebebi / son işlemler (sana verilen hareket özetini kullan).`,
        ``,
        `Bunların DIŞINDAKİ her şeyde (şikayet, ürün/fiyat sorusu, pazarlık, itiraz, teknik sorun, sohbet, anlamadığın veya emin olmadığın mesajlar) hiçbir şey yazma, sadece tam olarak şunu üret: [SESSIZ]`,
        `Ödeme bilgisi istenmiş ama sana ÖDEME BİLGİSİ verilmemişse yine [SESSIZ] üret.`,
        `Müşteri "neden borcum var / bu borç nereden / hesap dökümü / ekstre / detay" gibi DÖKÜM/EKSTRE isterse: cevabına [EKSTRE] etiketini ekle ve ardından tek cümle kısa açıklama yaz (örn. "[EKSTRE] Hesap ekstreniz ektedir."). Sistem PDF hesap ekstresini otomatik ekleyecek.`,
        ``,
        `Kurallar: Verilen bakiye/rakam dışında sayı söyleme. Kısa tut (1-4 cümle). Selamlama + kısa cevap yeter. Emoji kullanma. Yanıtında köşeli parantez [ ] kullanma (yalnız sessiz kalırken [SESSIZ]).`,
        extra ? `\nEk talimat: ${extra}` : '',
    ].join('\n');
}

function buildUser(ctx, incomingText) {
    const lines = [];
    lines.push(`MÜŞTERİ: ${ctx.name || '(bilinmiyor)'}`);
    if (ctx.net != null) {
        const durum = ctx.net > 0 ? 'BORÇLU (bize borcu var)' : ctx.net < 0 ? 'ALACAKLI (biz borçluyuz)' : 'bakiyesi kapalı';
        lines.push(`GÜNCEL BAKİYE: ${fmtTR(Math.abs(ctx.net))} TL — ${durum}`);
    }
    if (config.paymentInfo?.trim()) lines.push(`ÖDEME BİLGİSİ: ${config.paymentInfo.trim()}`);
    if (ctx.movements) lines.push(`SON İŞLEMLER:\n${ctx.movements}`);
    lines.push('');
    lines.push(`MÜŞTERİNİN MESAJI: "${incomingText}"`);
    return lines.join('\n');
}

// ─── Gelen mesaj işleyici (whatsapp.js → setIncomingHandler) ─────────────────
async function handleIncoming({ phone, text, jid, id }) {
    if (!config.enabled) return;
    rollDay();

    // Tekrar (dedupe): aynı mesaj id iki kez gelirse (senkron/yeniden bağlanma).
    if (id) {
        if (state.seenIds.includes(id)) return;
        state.seenIds.push(id);
        if (state.seenIds.length > 500) state.seenIds = state.seenIds.slice(-500);
        saveState();
    }

    const apiKey = getApiKey();
    if (!apiKey) { addLog({ phone, kind: 'skip', reason: 'API anahtarı yok' }); return; }

    if (!withinHours()) { addLog({ phone, kind: 'skip', reason: 'çalışma saati dışı' }); return; }
    if (state.sent >= Number(config.dailyCap || 0) && Number(config.dailyCap) > 0) {
        addLog({ phone, kind: 'skip', reason: 'günlük tavan doldu' }); return;
    }
    // Aynı numaraya çok sık cevap → döngü/spam koruması.
    const last = state.lastByPhone[phone] || 0;
    if (Date.now() - last < Number(config.minGapSec || 0) * 1000) {
        addLog({ phone, kind: 'skip', reason: 'çok sık mesaj (aralık koruması)' }); return;
    }

    // Firma/dönem: config → yoksa watcher/uiContext bağlamı.
    let firmaNo = config.firmaNo, donemNo = config.donemNo;
    if ((!firmaNo || !donemNo) && deps.getContext) {
        const c = deps.getContext();
        firmaNo = firmaNo || c?.firmaNo;
        donemNo = donemNo || c?.donemNo;
    }
    if (!firmaNo) { addLog({ phone, kind: 'skip', reason: 'firma seçili değil' }); return; }

    // KVKK: yalnız EŞLEŞEN cariye cevap. Tanınmayan numara → sessiz.
    let cari = null;
    try { cari = await deps.findCariByPhone(firmaNo, phone); }
    catch (e) { addLog({ phone, kind: 'error', reason: 'cari arama: ' + e.message }); return; }
    if (!cari) { addLog({ phone, kind: 'skip', reason: 'numara cari kartında yok' }); return; }
    if (config.onlySmsGonder && !cari.smsGonder) { addLog({ phone, kind: 'skip', reason: 'SMS izni yok' }); return; }

    // Bağlam: net bakiye (cari harekete göre) + isteğe bağlı son hareketler.
    const ctx = { name: cari.name || cari.firma, net: null, movements: null };
    try {
        const pool = deps.getPool && deps.getPool();
        if (pool && donemNo && deps.fetchNetBalances) {
            const m = await deps.fetchNetBalances(pool, firmaNo, donemNo, [cari.ind]);
            if (m && m.has(cari.ind)) ctx.net = m.get(cari.ind);
        }
        if (ctx.net == null && cari.bakiye != null) ctx.net = cari.bakiye; // TBLCARI.BAKIYE yedek
        if (config.includeMovements && donemNo && deps.fetchRecentMovements) {
            const rows = await deps.fetchRecentMovements(firmaNo, donemNo, cari.ind, 5);
            if (rows && rows.length) {
                ctx.movements = rows.map(r => {
                    const yon = Number(r.borc) ? `borç ${fmtTR(r.borc)} TL` : Number(r.alacak) ? `alacak ${fmtTR(r.alacak)} TL` : '';
                    const t = r.tarih ? new Date(r.tarih).toLocaleDateString('tr-TR') : '';
                    return `- ${t} ${yon}${r.izahat ? ' (' + String(r.izahat).slice(0, 40) + ')' : ''}`;
                }).join('\n');
            }
        }
    } catch (e) { console.error('[AIBot] bağlam hatası:', e.message); }

    // Modeli çağır.
    let reply = '';
    try {
        reply = await callAnthropic({
            apiKey, model: config.model,
            system: buildSystem(), user: buildUser(ctx, text),
        });
    } catch (e) {
        addLog({ phone, name: ctx.name, kind: 'error', reason: 'API: ' + e.message });
        return;
    }

    // Kapsam dışı / emin değil → sessiz kal (mesaj gönderme).
    if (!reply || /\[SESSIZ\]/i.test(reply)) {
        addLog({ phone, name: ctx.name, kind: 'silent', incoming: text.slice(0, 80) });
        return;
    }

    if (!deps.waStatus || !deps.waStatus().ready) {
        addLog({ phone, name: ctx.name, kind: 'skip', reason: 'WhatsApp bağlı değil' }); return;
    }

    // [EKSTRE] → PDF hesap ekstresi ekle (borç sebebi/döküm sorusu).
    const wantsExtre = /\[EKSTRE\]/i.test(reply);
    const caption = reply.replace(/\[SESSIZ\]|\[EKSTRE\]/ig, '').trim();
    let media = null;
    if (wantsExtre && deps.buildCariExtre && donemNo) {
        try {
            const ex = await deps.buildCariExtre(firmaNo, donemNo, cari.ind);
            if (ex && ex.buffer) media = { kind: 'document', buffer: ex.buffer, mimetype: 'application/pdf', fileName: ex.fileName || 'Hesap-Ekstresi.pdf' };
        } catch (e) { console.error('[AIBot] ekstre üretilemedi:', e.message); addLog({ phone, name: ctx.name, kind: 'error', reason: 'ekstre üretilemedi: ' + e.message }); }
    }

    // Ekstre istendi ama üretilemediyse: en azından metin varsa onu gönder, yoksa sessiz.
    const outText = caption || (media ? 'Hesap ekstreniz ektedir.' : '');
    if (!outText && !media) { addLog({ phone, name: ctx.name, kind: 'silent', incoming: text.slice(0, 80) }); return; }

    const r = await deps.waSend(phone, outText, media, { simulateTyping: true, typingMs: 1200, channel: 'aibot' });
    if (r && r.success) {
        state.sent++;
        state.lastByPhone[phone] = Date.now();
        saveState();
        if (deps.recordSent) deps.recordSent(); // anti-ban gün/saat sayacı
        addLog({ phone, name: ctx.name, kind: 'reply', incoming: text.slice(0, 80), reply: (media ? '[EKSTRE PDF] ' : '') + outText.slice(0, 200) });
    } else {
        addLog({ phone, name: ctx.name, kind: 'error', reason: 'gönderim: ' + (r?.error || 'bilinmiyor') });
    }
}

// Anahtar geçerliliğini sınamak için minik çağrı (UI "Anahtarı Sına").
async function testApiKey(rawKey) {
    const key = (rawKey && rawKey.trim()) || getApiKey();
    if (!key) throw new Error('Anahtar yok.');
    const text = await callAnthropic({
        apiKey: key, model: config.model, maxTokens: 16,
        system: 'Kısa cevap ver.', user: 'Merhaba, sadece "TAMAM" yaz.',
    });
    return { ok: true, sample: text };
}

module.exports = { configure, getConfig, setConfig, getStatus, getLog, handleIncoming, testApiKey };
