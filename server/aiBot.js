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
    provider: 'anthropic',         // 'anthropic' | 'openai' | 'gemini' (BYOK — her işletme kendi sağlayıcısı)
    baseUrl: '',                   // OpenAI-uyumlu özel uç (OpenRouter/DeepSeek/Groq/yerel); boşsa sağlayıcı varsayılanı
    apiKeyEnc: null,               // Seçili sağlayıcının anahtarı — ŞİFRELİ (asla düz metin diskte)
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
    // ─── Tartışma/kredi koruması ───
    maxThreadReplies: 4,           // aynı numaraya kısa sürede bu kadar bot cevabından sonra sohbeti kapat (0=kapalı)
    threadWindowMin: 30,           // "kısa süre" penceresi (dk) — sayaç bu süre sonunda sıfırlanır
    closeCooldownHours: 6,         // sohbet kapandıktan sonra o numaraya sessiz kalma süresi (saat)
    closingMessage: '',            // boşsa varsayılan kapanış metni (aşağıda DEFAULT_CLOSING)
};

// Tartışma uzayınca gönderilecek varsayılan kapanış (config.closingMessage boşsa).
const DEFAULT_CLOSING = 'Görüşmemizi burada nazikçe sonlandırıyorum. Bakiye veya ödemeyle ilgili net bir sorunuz olduğunda tekrar yazabilir ya da bizi telefonla arayabilirsiniz. İyi günler dilerim.';

let config = { ...DEFAULT_CONFIG };
// state: günlük sayaç + numara-başı son cevap + işlenmiş mesaj id'leri (dedupe)
//        + thread: numara-başı sohbet sayacı/kapanış (tartışma-kredi koruması)
let state = { date: null, sent: 0, lastByPhone: {}, seenIds: [], thread: {} };
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
    if (state.date !== t) { state.date = t; state.sent = 0; state.lastByPhone = {}; state.thread = {}; saveState(); }
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
        'enabled', 'provider', 'baseUrl', 'model', 'firmaNo', 'donemNo', 'businessName', 'paymentInfo',
        'extraInstructions', 'startHour', 'endHour', 'dailyCap', 'minGapSec',
        'onlySmsGonder', 'includeMovements',
        'maxThreadReplies', 'threadWindowMin', 'closeCooldownHours', 'closingMessage',
    ];
    for (const k of ALLOWED) if (patch[k] !== undefined) next[k] = patch[k];
    if (patch.provider !== undefined) next.provider = normProvider(patch.provider);
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
        provider: config.provider, model: config.model,
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

// ─── LLM sağlayıcıları (BYOK) — https, harici bağımlılık yok ─────────────────
// Desteklenen: anthropic (Claude), openai (+OpenAI-uyumlu: OpenRouter/DeepSeek/Groq/
// yerel — baseUrl ile), gemini (Google). Tek aktif sağlayıcı + tek anahtar.
const PROVIDERS = ['anthropic', 'openai', 'gemini'];
const DEFAULT_MODEL = {
    anthropic: 'claude-haiku-4-5',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.0-flash',
};
const DEFAULT_BASE = {
    anthropic: 'https://api.anthropic.com',
    openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

function normProvider(p) { return PROVIDERS.includes(p) ? p : 'anthropic'; }

// Ortak HTTPS POST → { statusCode, json }. url mutlak; baseUrl override desteği.
function postJson(urlStr, headers, bodyObj) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(urlStr); } catch { return reject(new Error('Geçersiz uç adresi: ' + urlStr)); }
        const payload = JSON.stringify(bodyObj);
        const req = https.request({
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers, 'content-length': Buffer.byteLength(payload) },
            timeout: 30000,
        }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                let j = null;
                try { j = JSON.parse(body); } catch { return reject(new Error('Yanıt çözümlenemedi (HTTP ' + res.statusCode + ').')); }
                resolve({ statusCode: res.statusCode, json: j });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('İstek zaman aşımına uğradı.')));
        req.write(payload);
        req.end();
    });
}

// Sağlayıcıya göre istek kur, tek düz metin cevap döndür.
async function callLLM({ provider, baseUrl, apiKey, model, system, user, maxTokens = 500 }) {
    const prov = normProvider(provider);
    const base = (baseUrl && baseUrl.trim().replace(/\/+$/, '')) || DEFAULT_BASE[prov];
    const mdl = (model && model.trim()) || DEFAULT_MODEL[prov];

    if (prov === 'anthropic') {
        const { statusCode, json } = await postJson(`${base}/v1/messages`, {
            'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
        }, { model: mdl, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
        if (statusCode !== 200) throw new Error(json?.error?.message || `HTTP ${statusCode}`);
        return (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    }

    if (prov === 'gemini') {
        // Anahtar query string'te; sistem yönergesi ayrı alanda.
        const url = `${base}/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const { statusCode, json } = await postJson(url, {}, {
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens },
        });
        if (statusCode !== 200) throw new Error(json?.error?.message || `HTTP ${statusCode}`);
        const parts = json?.candidates?.[0]?.content?.parts || [];
        return parts.map(p => p.text || '').join('').trim();
    }

    // openai ve OpenAI-uyumlu (OpenRouter/DeepSeek/Groq/yerel): /chat/completions
    const { statusCode, json } = await postJson(`${base}/chat/completions`, {
        'authorization': `Bearer ${apiKey}`,
    }, {
        model: mdl, max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    if (statusCode !== 200) throw new Error(json?.error?.message || `HTTP ${statusCode}`);
    return (json?.choices?.[0]?.message?.content || '').trim();
}

const fmtTR = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n) => { const x = Number(n) || 0; return Number.isInteger(x) ? String(x) : fmtTR(x); };

// [FATURA] cevabında müşteriye gönderilecek son satış faturası metni.
// inv = { tarih, evrak, tutar, kalemler:[{ad,miktar,birim,fiyat,tutar}] }
function buildInvoiceText(inv) {
    const t = inv.tarih ? new Date(inv.tarih).toLocaleDateString('tr-TR') : '';
    const meta = [];
    if (t) meta.push(t);
    if (inv.evrak) meta.push('No: ' + inv.evrak);
    const out = [`Son satış faturanız${meta.length ? ' (' + meta.join(', ') + ')' : ''}:`];
    const ks = Array.isArray(inv.kalemler) ? inv.kalemler : [];
    const MAX = 20;
    for (const k of ks.slice(0, MAX)) {
        const qty = Number(k.miktar) ? `${fmtQty(k.miktar)}${k.birim ? ' ' + k.birim : ''} x ${fmtTR(k.fiyat)}` : '';
        out.push(`- ${k.ad || '(kalem)'}${qty ? '  ' + qty : ''} = ${fmtTR(k.tutar)} TL`);
    }
    if (ks.length > MAX) out.push(`... (+${ks.length - MAX} kalem daha)`);
    const toplam = ks.length ? ks.reduce((s, k) => s + (Number(k.tutar) || 0), 0) : (Number(inv.tutar) || 0);
    out.push(`Toplam: ${fmtTR(toplam)} TL`);
    return out.join('\n');
}

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
        `YALNIZCA müşteri AÇIKÇA sorduğunda ve YALNIZCA şu konularda cevap ver:`,
        `- Güncel bakiye / borç durumu (SADECE sana "GÜNCEL BAKİYE" olarak verilen rakamı kullan; ASLA rakam uydurma, tahmin etme).`,
        `- Ödeme / hesap bilgileri (IBAN vb. — sana verilen "ÖDEME BİLGİSİ" metnini paylaş).`,
        `- Borç sebebi / son işlemler (sana verilen hareket özetini kullan).`,
        ``,
        `BAKİYEYİ KENDİLİĞİNDEN SÖYLEME: Müşteri bakiyesini/borcunu açıkça SORMADIYSA rakam veya bakiye yazma. Sadece selam/hatır sorma/teşekkür içeren ("merhaba", "günaydın", "iyi günler", "nasılsınız", "teşekkürler" vb.) mesajlara bakiye EKLEME → tam olarak [SESSIZ] üret (insana bırak).`,
        `Sana "GÜNCEL BAKİYE: BİLİNMİYOR" verildiyse, bakiye/borç sorulsa bile ASLA rakam söyleme → [SESSIZ] üret.`,
        `Müşteri borcunu soruyor ve bakiye "BORCU YOK" / 0 ise: rakam uydurma; açıkça "Güncel bir borcunuz bulunmamaktadır." de.`,
        ``,
        `MÜŞTERİ SİNİRLİ / KABA / HAKARET EDİYORSA: ASLA karşılık verme, hakarete hakaretle cevap verme, tartışmaya girme, savunma yapma. Sakin ve kısa bir tonla, gerekiyorsa özür dileyerek yaz; yardımcı olmak istediğini belirt ve bakiye/ödeme konusuna nazikçe yönlendir. Örnek: "Yaşadığınız olumsuzluk için özür dilerim, size yardımcı olmak isterim; bakiyeniz veya ödemeyle ilgili sorunuzu iletebilirsiniz." En fazla iki cümle, emojisiz, rakam uydurma.`,
        ``,
        `Bunların DIŞINDAKİ her şeyde (ürün/fiyat sorusu, pazarlık, teknik sorun, alakasız sohbet, anlamadığın veya emin olmadığın mesajlar) hiçbir şey yazma, sadece tam olarak şunu üret: [SESSIZ]`,
        `Ödeme bilgisi istenmiş ama sana ÖDEME BİLGİSİ verilmemişse yine [SESSIZ] üret.`,
        `Müşteri "neden borcum var / bu borç nereden / hesap dökümü / ekstre / detay" gibi DÖKÜM/EKSTRE isterse: cevabına [EKSTRE] etiketini ekle ve ardından tek cümle kısa açıklama yaz (örn. "[EKSTRE] Hesap ekstreniz ektedir."). Sistem PDF hesap ekstresini otomatik ekleyecek.`,
        `Müşteri "son faturam / son satış faturası / faturamı gönder / fatura içeriği / ne aldım / fatura kalemleri" gibi SON SATIŞ FATURASI içeriğini isterse: cevabına [FATURA] etiketini ekle ve tek cümle kısa açıklama yaz (örn. "[FATURA] Son satış faturanızın içeriği aşağıdadır."). Sistem fatura kalemlerini otomatik ekleyecek; kalem/rakam yazma, uydurma.`,
        ``,
        `Kurallar: Verilen bakiye/rakam dışında sayı söyleme. Kısa tut (1-4 cümle). Emoji kullanma. Yanıtında köşeli parantez [ ] kullanma (yalnız sessiz kalırken [SESSIZ], ekstre gerekince [EKSTRE]).`,
        extra ? `\nEk talimat: ${extra}` : '',
    ].join('\n');
}

function buildUser(ctx, incomingText) {
    const lines = [];
    lines.push(`MÜŞTERİ: ${ctx.name || '(bilinmiyor)'}`);
    if (ctx.net != null) {
        const durum = ctx.net > 0 ? 'BORÇLU (bize borcu var)'
            : ctx.net < 0 ? 'ALACAKLI (biz borçluyuz)'
            : 'BORCU YOK (bakiye kapalı — borç/alacak bulunmuyor)';
        lines.push(`GÜNCEL BAKİYE: ${fmtTR(Math.abs(ctx.net))} TL — ${durum}`);
    } else {
        lines.push(`GÜNCEL BAKİYE: BİLİNMİYOR — bakiye şu an sorgulanamadı; bakiye/borç sorulsa bile ASLA rakam söyleme, [SESSIZ] üret.`);
    }
    if (config.paymentInfo?.trim()) lines.push(`ÖDEME BİLGİSİ: ${config.paymentInfo.trim()}`);
    if (ctx.movements) lines.push(`SON İŞLEMLER:\n${ctx.movements}`);
    lines.push('');
    lines.push(`MÜŞTERİNİN MESAJI: "${incomingText}"`);
    return lines.join('\n');
}

// ─── Gelen mesaj işleyici (whatsapp.js → setIncomingHandler) ─────────────────
const inFlight = new Set(); // numara-başı eş zamanlı işlem kilidi (çift-cevap yarışı önleme)

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

    // Çift-cevap yarışı: LLM/DB beklenirken gelen 2. mesaj, 1. henüz lastByPhone'a
    // yazmadığı için min-aralık/tavan kontrolünü geçip ikinci cevaba yol açıyordu
    // (ekranda "Merhabalar" + "Günaydın" → iki ayrı cevap). Numara-başı kilit ile 2. atlanır.
    if (inFlight.has(phone)) { addLog({ phone, kind: 'skip', reason: 'önceki mesaj işleniyor' }); return; }
    inFlight.add(phone);
    try {
        await handleIncomingInner({ phone, text, jid, id });
    } finally {
        inFlight.delete(phone);
    }
}

async function handleIncomingInner({ phone, text, jid, id }) {
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

    // ─── Tartışma / kredi koruması ───
    // Kısa pencerede numara-başı bot cevabı sayılır. Eşik aşılınca tek kapanış
    // mesajı gönderilir, o numara bir süre sessize alınır (model çağrılmaz → kredi korunur).
    const nowMs = Date.now();
    const windowMs = Math.max(1, Number(config.threadWindowMin) || 30) * 60000;
    let th = state.thread[phone];
    if (!th || (nowMs - (th.since || 0)) > windowMs) th = { n: 0, since: nowMs, closedUntil: (th && th.closedUntil) || 0 };
    if (th.closedUntil && nowMs < th.closedUntil) {
        state.thread[phone] = th; saveState();
        addLog({ phone, kind: 'skip', reason: 'sohbet sonlandırıldı (bekleme)' }); return;
    }
    const maxThread = Number(config.maxThreadReplies) || 0;
    if (maxThread > 0 && th.n >= maxThread) {
        if (deps.waStatus && deps.waStatus().ready) {
            const closing = (config.closingMessage && config.closingMessage.trim()) || DEFAULT_CLOSING;
            const r = await deps.waSend(phone, closing, null, { simulateTyping: true, typingMs: 1000, channel: 'aibot' });
            th.closedUntil = nowMs + Math.max(1, Number(config.closeCooldownHours) || 6) * 3600000;
            th.n = 0; th.since = nowMs;
            state.thread[phone] = th;
            state.lastByPhone[phone] = nowMs;
            if (r && r.success) { state.sent++; if (deps.recordSent) deps.recordSent(); }
            saveState();
            addLog({ phone, name: (state.thread[phone] && state.thread[phone].name), kind: r && r.success ? 'reply' : 'error', reason: 'tartışma uzadı → sohbet kapatıldı', reply: closing.slice(0, 120) });
        } else {
            addLog({ phone, kind: 'skip', reason: 'kapanış: WhatsApp bağlı değil' });
        }
        return;
    }
    state.thread[phone] = th;

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
        if (pool && pool.connected && donemNo && deps.fetchNetBalances) {
            const m = await deps.fetchNetBalances(pool, firmaNo, donemNo, [cari.ind]);
            // Sorgu başarılı: cari hareketi yoksa map'te key olmaz → bakiye GERÇEKTEN 0 (borç yok).
            // net'i null bırakmak model uydurmasına yol açıyordu; burada 0'a sabitliyoruz.
            ctx.net = (m && m.has(cari.ind)) ? m.get(cari.ind) : 0;
        }
        if (ctx.net == null && cari.bakiye != null) ctx.net = cari.bakiye; // DB kapalıysa TBLCARI.BAKIYE yedek
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
        reply = await callLLM({
            provider: config.provider, baseUrl: config.baseUrl, apiKey, model: config.model,
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
    // [FATURA] → son satış faturasının içeriğini metin olarak ekle.
    const wantsExtre = /\[EKSTRE\]/i.test(reply);
    const wantsFatura = /\[FATURA\]/i.test(reply);
    let caption = reply.replace(/\[SESSIZ\]|\[EKSTRE\]|\[FATURA\]/ig, '').trim();
    let media = null;
    if (wantsExtre && deps.buildCariExtre && donemNo) {
        try {
            const ex = await deps.buildCariExtre(firmaNo, donemNo, cari.ind);
            if (ex && ex.buffer) media = { kind: 'document', buffer: ex.buffer, mimetype: 'application/pdf', fileName: ex.fileName || 'Hesap-Ekstresi.pdf' };
        } catch (e) { console.error('[AIBot] ekstre üretilemedi:', e.message); addLog({ phone, name: ctx.name, kind: 'error', reason: 'ekstre üretilemedi: ' + e.message }); }
    }
    // Son satış faturası içeriği (isteğe bağlı) → caption altına metin olarak eklenir.
    if (wantsFatura && deps.fetchLastSalesInvoice && donemNo) {
        try {
            const inv = await deps.fetchLastSalesInvoice(firmaNo, donemNo, cari.ind);
            const invText = inv ? buildInvoiceText(inv) : 'Adınıza kayıtlı bir satış faturası bulunamadı.';
            caption = caption ? `${caption}\n\n${invText}` : invText;
        } catch (e) { console.error('[AIBot] fatura getirilemedi:', e.message); addLog({ phone, name: ctx.name, kind: 'error', reason: 'fatura getirilemedi: ' + e.message }); }
    }

    // Ekstre istendi ama üretilemediyse: en azından metin varsa onu gönder, yoksa sessiz.
    const outText = caption || (media ? 'Hesap ekstreniz ektedir.' : '');
    if (!outText && !media) { addLog({ phone, name: ctx.name, kind: 'silent', incoming: text.slice(0, 80) }); return; }

    const r = await deps.waSend(phone, outText, media, { simulateTyping: true, typingMs: 1200, channel: 'aibot' });
    if (r && r.success) {
        state.sent++;
        state.lastByPhone[phone] = Date.now();
        // Tartışma sayacı: bu numaraya verilen bot cevabı (eşiğe yaklaşınca sohbet kapanır).
        th.n = (th.n || 0) + 1; th.since = th.since || Date.now(); th.name = ctx.name; state.thread[phone] = th;
        saveState();
        if (deps.recordSent) deps.recordSent(); // anti-ban gün/saat sayacı
        addLog({ phone, name: ctx.name, kind: 'reply', incoming: text.slice(0, 80), reply: (media ? '[EKSTRE PDF] ' : '') + outText.slice(0, 200) });
    } else {
        addLog({ phone, name: ctx.name, kind: 'error', reason: 'gönderim: ' + (r?.error || 'bilinmiyor') });
    }
}

// Anahtar geçerliliğini sınamak için minik çağrı (UI "Anahtarı Sına").
async function testApiKey(rawKey, opts = {}) {
    const key = (rawKey && rawKey.trim()) || getApiKey();
    if (!key) throw new Error('Anahtar yok.');
    // UI'da kaydetmeden sınama: gönderilen provider/baseUrl/model'i kullan, yoksa config.
    const text = await callLLM({
        provider: opts.provider || config.provider,
        baseUrl: opts.baseUrl !== undefined ? opts.baseUrl : config.baseUrl,
        model: opts.model || config.model,
        apiKey: key, maxTokens: 16,
        system: 'Kısa cevap ver.', user: 'Merhaba, sadece "TAMAM" yaz.',
    });
    return { ok: true, sample: text };
}

module.exports = { configure, getConfig, setConfig, getStatus, getLog, handleIncoming, testApiKey };
