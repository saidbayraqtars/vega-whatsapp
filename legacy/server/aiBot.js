// ═══════════════════════════════════════════════════════════════════════════
//  AI Oto-Yanıt Botu — gelen WhatsApp mesajlarına yapay zekâ ile cevap
//
//  Kapsam (chatMode): AÇIK'ken bot GENİŞ konuşur — selamlaşma, genel sorular,
//  çalışma saati, sipariş/teslimat durumu sorularına da insan gibi cevap verir.
//  KAPALI'yken eski dar davranış: yalnız bakiye/ödeme/borç sebebi, gerisine
//  [SESSIZ]. Geniş modda da değişmeyen sert kurallar:
//    • rakam uydurma yok (yalnız verilen bakiye/hareket),
//    • TAAHHÜT YASAĞI: fiyat/iskonto/vade/tarih/sipariş sözü verilmez →
//      "yetkilimiz dönüş yapacaktır",
//    • hakarete karşılık verilmez (sakin, kısa, gerekirse özür),
//    • hukuki tehdit / ciddi şikâyet / anlaşılmaz mesaj → [SESSIZ] (insana bırak).
//
//  Sohbet hafızası: numara-başı gün içi son N tur (state.convo) modele geçmiş
//  olarak verilir → "az önce ne dedim" bilen tutarlı konuşma.
//
//  Sağlayıcı: 'vega' (KONTÖRLÜ — anahtar bizde, kontör sunucusunda düşer) ya da
//  BYOK: anthropic | openai | gemini. BYOK'ta anahtar bu bilgisayarda ŞİFRELİ
//  saklanır (server.js encrypt/decrypt — makine anahtarı), gömülü değildir.
//
//  Kontör: yalnız müşteriye mesaj GERÇEKTEN gidince düşer. Model çağrısı bir
//  rezervasyon döndürür; gönderim başarılıysa credits.commit(), sessiz kalındı
//  ya da gönderilemediyse credits.release() → ücretsiz.
//
//  Güvenlik/KVKK: yalnız cari kartında EŞLEŞEN numaralara cevap verilir;
//  tanınmayan numaraya hiçbir şey yazılmaz.
//
//  Anti-ban / döngü koruması: çalışma saati penceresi, günlük cevap tavanı,
//  numara-başı min cevap aralığı, mesaj-id tekrar (dedupe) koruması.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const https = require('https');
const { normalizePhone, isLikelyValid } = require('./phone');

let deps = null;
let CONFIG_PATH = null;
let STATE_PATH = null;
let LOG_PATH = null;

const DEFAULT_CONFIG = {
    enabled: false,
    // ─── Yanıt modu ───
    // 'ai'  : model konuşur (geniş sohbet — aşağıdaki chatMode/limitler geçerli)
    // 'ack' : NÖBETÇİ — model HİÇ çağrılmaz. Müşteriye tek kısa alındı mesajı
    //         ("ekibimiz dönecek") + iç numaraya "şu kişi yazdı" bildirimi.
    // Canlı kullanımda ('ai') bot arıza/teknik mesajlara ekipten ÖNCE cevap verip
    // müşteriyle gereksiz diyaloga giriyordu; 'ack' o riski tamamen kaldırır
    // (halüsinasyon yok, kontör harcanmaz, tartışma büyümez).
    replyMode: 'ai',
    ackMessage: '',                // boşsa DEFAULT_ACK
    ackCooldownHours: 6,           // aynı numaraya alındı mesajı en fazla bu sıklıkta
    ackUnknown: true,              // cari kartında olmayan numaraya da alındı mesajı gönder
    notifyPhone: '',               // iç bildirim numaraları (virgülle çoğaltılır)
    notifyGapMin: 5,               // aynı müşteri için iç bildirim min aralığı (0 = her mesaj)
    provider: 'vega',              // 'vega' (kontörlü, anahtar gerekmez) | BYOK: 'anthropic' | 'openai' | 'gemini'
    baseUrl: '',                   // OpenAI-uyumlu özel uç (OpenRouter/DeepSeek/Groq/yerel); boşsa sağlayıcı varsayılanı
    apiKeyEnc: null,               // BYOK anahtarı — ŞİFRELİ (asla düz metin diskte). 'vega'da kullanılmaz.
    model: 'claude-haiku-4-5',
    // ─── Kapsam / sohbet ───
    chatMode: true,                // AÇIK: neredeyse her şeye cevap ver (geniş). KAPALI: eski dar kapsam.
    historyTurns: 10,              // modele verilen gün içi geçmiş tur sayısı (0 = hafızasız)
    maxReplyTokens: 800,           // cevap uzunluk tavanı (token)
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

// Nöbetçi modun varsayılan alındı mesajı (config.ackMessage boşsa). TEK cümle,
// söz vermez, saat/tarih taahhüdü içermez.
const DEFAULT_ACK = 'Mesajınızı aldık. Teknik ekibimizden bir arkadaşımız en kısa sürede size dönüş yapacaktır.';

// Tartışma uzayınca gönderilecek varsayılan kapanış (config.closingMessage boşsa).
const DEFAULT_CLOSING = 'Görüşmemizi burada nazikçe sonlandırıyorum. Bakiye veya ödemeyle ilgili net bir sorunuz olduğunda tekrar yazabilir ya da bizi telefonla arayabilirsiniz. İyi günler dilerim.';

let config = { ...DEFAULT_CONFIG };
// state: günlük sayaç + numara-başı son cevap + işlenmiş mesaj id'leri (dedupe)
//        + thread: numara-başı sohbet sayacı/kapanış (tartışma-kredi koruması)
//        + convo: numara-başı gün içi konuşma hafızası [{role,text}]
//        + ack: nöbetçi modda numara-başı son alındı/bildirim anı
let state = { date: null, sent: 0, lastByPhone: {}, seenIds: [], thread: {}, convo: {}, ack: {} };
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
            // Yükseltme koruması: varsayılan sağlayıcı 'vega' (kontörlü) oldu. Sağlayıcı
            // alanı olmayan ESKİ config'te anahtar varsa kullanıcı BYOK kurmuş demektir —
            // sessizce kontörlü moda geçirip botu susturmayalım.
            if (raw.provider === undefined && raw.apiKeyEnc) config.provider = 'anthropic';
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

// Gün dönünce günlük sayaç + numara-başı geçmiş (sohbet hafızası dahil) sıfırlanır.
function rollDay() {
    const t = todayKey();
    if (state.date !== t) {
        state.date = t; state.sent = 0; state.lastByPhone = {}; state.thread = {}; state.convo = {};
        // Nöbetçi defterinde yalnız SON 3 GÜN tutulur: alındı mesajı soğuması saat
        // ölçeğinde, eski kayıtlar sadece dosyayı şişirir.
        const keep = Date.now() - 3 * 24 * 3600000;
        for (const [k, v] of Object.entries(state.ack || {})) {
            if (Math.max(v.ackAt || 0, v.notifyAt || 0) < keep) delete state.ack[k];
        }
        saveState();
    }
}

// ─── Sohbet hafızası (gün içi, numara-başı) ─────────────────────────────────
// Modele geçmiş turlar verilir → bot "az önce ne konuştuk" bilir. Sessiz kalınan
// turda da müşteri mesajı yazılır (bağlam kopmasın).
function convoOf(phone) {
    if (!state.convo) state.convo = {};
    if (!Array.isArray(state.convo[phone])) state.convo[phone] = [];
    return state.convo[phone];
}

function pushConvo(phone, role, text) {
    const turns = Math.max(0, Number(config.historyTurns) || 0);
    if (turns <= 0) { state.convo[phone] = []; return; }
    const arr = convoOf(phone);
    arr.push({ role, text: String(text || '').slice(0, 2000) });
    // N tur ≈ 2N mesaj (soru + cevap).
    const max = turns * 2;
    if (arr.length > max) state.convo[phone] = arr.slice(-max);
    saveState();
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
        'chatMode', 'historyTurns', 'maxReplyTokens',
        'maxThreadReplies', 'threadWindowMin', 'closeCooldownHours', 'closingMessage',
        // Nöbetçi (ack) modu
        'replyMode', 'ackMessage', 'ackCooldownHours', 'ackUnknown', 'notifyPhone', 'notifyGapMin',
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
    const metered = isMetered();
    return {
        enabled: config.enabled,
        // Kontörlü modda anahtar aranmaz — "hazır mı" bilgisi kontöre bakar.
        hasApiKey: metered ? true : hasApiKey(),
        metered,
        chatMode: !!config.chatMode,
        replyMode: config.replyMode || 'ai',
        notifyPhone: config.notifyPhone || '',
        credits: metered && deps?.credits ? deps.credits.getStatus() : null,
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

// ─── LLM sağlayıcıları — https, harici bağımlılık yok ────────────────────────
// 'vega'  : KONTÖRLÜ. İstek kontör sunucusuna gider; API anahtarı orada, müşteride
//           anahtar yok. Kontör gönderilen mesaj başına düşer (credits.js).
// BYOK    : anthropic (Claude), openai (+OpenAI-uyumlu: OpenRouter/DeepSeek/Groq/
//           yerel — baseUrl ile), gemini (Google). Müşteri kendi anahtarını girer,
//           token parasını kendi öder, kontör harcanmaz.
const PROVIDERS = ['vega', 'anthropic', 'openai', 'gemini'];
const DEFAULT_MODEL = {
    vega: 'claude-haiku-4-5',
    anthropic: 'claude-haiku-4-5',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.0-flash',
};
const DEFAULT_BASE = {
    anthropic: 'https://api.anthropic.com',
    openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

function normProvider(p) { return PROVIDERS.includes(p) ? p : 'vega'; }

// Kontörlü mod mu? (BYOK'ta kontör harcanmaz.)
function isMetered() { return normProvider(config.provider) === 'vega'; }

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

// Geçmiş + güncel mesajı sağlayıcı biçimine hazırla. Anthropic/Gemini ilk mesajın
// 'user' olmasını şart koşar → baştaki assistant turları kırpılır.
function normMessages(messages, user) {
    let msgs = Array.isArray(messages) && messages.length
        ? messages
        : [{ role: 'user', text: String(user || '') }];
    msgs = msgs
        .filter(m => m && typeof m.text === 'string' && m.text.trim())
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: m.text }));
    while (msgs.length && msgs[0].role === 'assistant') msgs.shift();
    return msgs;
}

// BYOK sağlayıcısına istek kur, tek düz metin cevap döndür.
// messages = [{role:'user'|'assistant', text}] (geçmiş + güncel). Eski çağrılar
// için `user` (tek metin) de kabul edilir.
async function callLLM({ provider, baseUrl, apiKey, model, system, user, messages, maxTokens = 500 }) {
    const prov = normProvider(provider);
    const base = (baseUrl && baseUrl.trim().replace(/\/+$/, '')) || DEFAULT_BASE[prov];
    const mdl = (model && model.trim()) || DEFAULT_MODEL[prov];
    const msgs = normMessages(messages, user);
    if (!msgs.length) throw new Error('Gönderilecek mesaj yok.');

    if (prov === 'anthropic') {
        const { statusCode, json } = await postJson(`${base}/v1/messages`, {
            'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
        }, {
            model: mdl, max_tokens: maxTokens, system,
            messages: msgs.map(m => ({ role: m.role, content: m.text })),
        });
        if (statusCode !== 200) throw new Error(json?.error?.message || `HTTP ${statusCode}`);
        return (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    }

    if (prov === 'gemini') {
        // Anahtar query string'te; sistem yönergesi ayrı alanda. Asistan rolü 'model'.
        const url = `${base}/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const { statusCode, json } = await postJson(url, {}, {
            systemInstruction: { parts: [{ text: system }] },
            contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
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
        messages: [{ role: 'system', content: system }, ...msgs.map(m => ({ role: m.role, content: m.text }))],
    });
    if (statusCode !== 200) throw new Error(json?.error?.message || `HTTP ${statusCode}`);
    return (json?.choices?.[0]?.message?.content || '').trim();
}

// Tek giriş noktası: kontörlü ('vega') ya da BYOK — çağıran farkı bilmez.
// Dönüş: { text, reservationId } — reservationId yalnız kontörlü modda dolu ve
// mesaj gönderilince commit, gönderilmezse release edilmelidir.
async function runModel({ system, messages, maxTokens }) {
    if (isMetered()) {
        if (!deps?.credits) { const e = new Error('Kontör istemcisi kurulu değil.'); e.code = 'NO_CREDITS_CLIENT'; throw e; }
        const r = await deps.credits.chat({
            system, messages: normMessages(messages), maxTokens, model: config.model,
        });
        if (!r.ok) { const e = new Error(r.error || r.code); e.code = r.code; throw e; }
        return { text: r.reply, reservationId: r.reservationId, cost: r.cost, balance: r.balance };
    }

    const apiKey = getApiKey();
    if (!apiKey) { const e = new Error('API anahtarı yok'); e.code = 'NO_KEY'; throw e; }
    const text = await callLLM({
        provider: config.provider, baseUrl: config.baseUrl, apiKey, model: config.model,
        system, messages, maxTokens,
    });
    return { text, reservationId: null };
}

const fmtTR = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n) => { const x = Number(n) || 0; return Number.isInteger(x) ? String(x) : fmtTR(x); };

// [FATURA] cevabında müşteriye gönderilecek son satış faturası metni.
// inv = { tarih, evrak, tutar, kalemler:[{ad,miktar,birim,fiyat,tutar}] }
// Kalem fiyat/tutarları KDV DAHİL gelir (fetchBelgeKalemleri çeviriyor). Genel toplam
// inv.tutar'dan yazılır = cari hareketteki BORC = faturanın KDV dahil genel toplamı;
// kalem toplamı iskonto/masraflı faturalarda bundan sapar, müşteriye giden rakam ise
// borcuna yazılanla birebir aynı olmalı.
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
    const toplam = Number(inv.tutar) > 0
        ? Number(inv.tutar)
        : ks.reduce((s, k) => s + (Number(k.tutar) || 0), 0);
    out.push(`Toplam (KDV dahil): ${fmtTR(toplam)} TL`);
    return out.join('\n');
}

// ─── Sistem istemi (Türkçe) ──────────────────────────────────────────────────
// chatMode AÇIK  → GENİŞ: neredeyse her mesaja cevap; [SESSIZ] dar bir alana çekilir.
// chatMode KAPALI → DAR: yalnız bakiye/ödeme/borç sebebi; gerisi [SESSIZ].
// Her iki modda da rakam uydurma ve taahhüt yasağı geçerlidir.
function buildSystem() {
    return config.chatMode ? buildSystemChat() : buildSystemNarrow();
}

function buildSystemChat() {
    const biz = config.businessName?.trim();
    const pay = config.paymentInfo?.trim();
    const extra = config.extraInstructions?.trim();
    return [
        `Sen bir Türk işletmesinin${biz ? ` (${biz})` : ''} WhatsApp müşteri asistanısın. Müşterilerle (carilerle) doğal, sıcak ve profesyonel Türkçe konuşursun. Amacın müşteriyi karşılıksız bırakmamak: gelen hemen her mesaja yardımcı, kısa ve net bir cevap verirsin.`,
        ``,
        `CEVAP VERDİĞİN KONULAR (geniş):`,
        `- Selamlaşma, hatır sorma, teşekkür, günlük nezaket sözleri → doğal karşılık ver.`,
        `- Güncel bakiye / borç durumu → SADECE sana "GÜNCEL BAKİYE" olarak verilen rakamı kullan.`,
        `- Ödeme / hesap bilgileri → sana verilen "ÖDEME BİLGİSİ" metnini paylaş.`,
        `- Borç sebebi, son işlemler, hesap dökümü → sana verilen hareket özetini kullan.`,
        `- İşletme hakkında genel sorular (çalışma saatleri, konum, iletişim, nasıl ödeme yapılır) → sana verilen bilgilerden cevapla; bilgi verilmemişse uydurma, "yetkilimiz en kısa sürede size dönecektir" de.`,
        `- Sipariş/teslimat/ürün soruları → elinde bilgi varsa aktar; yoksa yetkiliye ileteceğini söyle.`,
        `- Şikâyet, memnuniyetsizlik → önce anlayış göster, çözüm için yetkiliye ileteceğini söyle.`,
        `- Kapsam dışı ya da alakasız sohbet → kısaca ve kibarca karşılık ver, konuyu işletmeyle ilgili yardıma yönlendir.`,
        ``,
        `DEĞİŞMEZ KURALLAR:`,
        `1) RAKAM UYDURMA. Bakiye, fiyat, tarih, stok, vade, iskonto gibi hiçbir sayıyı kendin üretme. Yalnız sana açıkça verilen rakamları kullan. Verilmemişse "bu bilgiyi yetkilimiz teyit edip dönecektir" de.`,
        `2) TAAHHÜT YASAĞI. Müşteri adına söz veremezsin: fiyat/iskonto/indirim, vade veya ödeme ertelemesi, teslimat tarihi, sipariş kabulü, iade, iptal, garanti kapsamı konularında ASLA kesin söz verme, pazarlık yapma, onay verme. Bu konularda tek doğru cevap: "Bu konuda yetkilimiz en kısa sürede size dönüş yapacaktır."`,
        `3) BAKİYEYİ KENDİLİĞİNDEN SÖYLEME. Müşteri açıkça sormadıysa rakam veya bakiye yazma; selamlaşmaya bakiye ekleme.`,
        `4) Sana "GÜNCEL BAKİYE: BİLİNMİYOR" verildiyse bakiye/borç sorulsa bile ASLA rakam söyleme; sistemden teyit edip döneceğini söyle.`,
        `5) Bakiye "BORCU YOK" / 0 ise: "Güncel bir borcunuz bulunmamaktadır." de, rakam uydurma.`,
        `6) MÜŞTERİ SİNİRLİ / KABA / HAKARET EDİYORSA: karşılık verme, tartışmaya girme, savunma yapma. Sakin, en fazla iki cümle, gerekirse özür dile ve yardım teklif et.`,
        `7) BAŞKASININ BİLGİSİ İSTENİRSE (başka firma/kişi bakiyesi vb.) verme; yalnız yazan müşterinin kendi hesabı hakkında konuş.`,
        `8) Bilmediğin bir şeyi bildiğin gibi anlatma. Emin değilsen yetkiliye ileteceğini söyle.`,
        ``,
        `SESSİZ KALMAN GEREKEN DAR DURUMLAR — bu hâllerde tam olarak [SESSIZ] üret (hiçbir şey yazma, insana bırakılır):`,
        `- Hukuki tehdit, avukat/icra/mahkeme/şikâyet başvurusu içeren mesajlar.`,
        `- Ciddi şikâyet, tazminat/iade talebi ya da yönetici müdahalesi gereken konular.`,
        `- Anlaşılmayan, bozuk, spam veya boş mesajlar.`,
        `- Sana verilmemiş bilgiyi uydurmadan cevaplamanın mümkün olmadığı, hassas konular.`,
        pay ? null : `- Ödeme bilgisi isteniyor ama sana ÖDEME BİLGİSİ verilmemiş.`,
        ``,
        `ETİKETLER:`,
        `- Müşteri "neden borcum var / bu borç nereden / hesap dökümü / ekstre / detay" gibi DÖKÜM/EKSTRE isterse cevabına [EKSTRE] etiketini ekle ve tek cümle kısa açıklama yaz (örn. "[EKSTRE] Hesap ekstreniz ektedir."). Sistem PDF ekstreyi otomatik ekler.`,
        `- Müşteri "son faturam / faturamı gönder / fatura içeriği / ne aldım / fatura kalemleri" isterse cevabına [FATURA] etiketini ekle ve tek cümle yaz. Sistem fatura kalemlerini otomatik ekler; kalem/rakam yazma.`,
        ``,
        `ÜSLUP: Kısa tut (1-5 cümle). Emoji kullanma. Yanıtında köşeli parantez [ ] kullanma (yalnız yukarıdaki etiketler hariç). Doğal konuş, robot gibi tekrar etme; aynı cümleyi her mesajda kurma.`,
        extra ? `\nEk talimat: ${extra}` : '',
    ].filter(l => l !== null).join('\n');
}

function buildSystemNarrow() {
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
    } else if (config.chatMode) {
        // Geniş modda sessiz kalmak yerine dürüst cevap: rakam yok, teyit sözü var.
        lines.push(`GÜNCEL BAKİYE: BİLİNMİYOR — bakiye şu an sorgulanamadı; ASLA rakam söyleme, "yetkilimiz teyit edip dönecektir" de.`);
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

// accountId: mesajın geldiği WhatsApp hattı (çok numaralı kurulumda). Cevap AYNI
// hattan gitmeli — müşteri iki ayrı numaradan konuşulmuş gibi görmesin.
async function handleIncoming({ phone, text, jid, id, accountId = null }) {
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
        await handleIncomingInner({ phone, text, jid, id, accountId });
    } finally {
        inFlight.delete(phone);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  NÖBETÇİ (ack) MODU — model hiç çağrılmaz
// ═══════════════════════════════════════════════════════════════════════════
//  Canlı denemede AI her konuya (arıza/teknik dahil) atlayıp ekipten önce cevap
//  veriyor, müşteriyle gereksiz uzun diyaloga giriyordu. Bu modda bot EN FAZLA
//  iki şey yapar:
//    1) müşteriye TEK kısa alındı mesajı — söz vermez, saat/tarih taahhüdü yok,
//       aynı numaraya ackCooldownHours boyunca tekrar yazmaz (5 mesaj = 1 cevap);
//    2) iç numaraya "şu kişi yazdı + mesajı" bildirimi (notifyGapMin ile kısılır).
//  Model çağrısı yok → halüsinasyon yok, kontör harcanmaz, tartışma büyümez.

// İç bildirim hedefleri: virgül/;/satır sonu ile çoğaltılır.
function notifyTargets() {
    return String(config.notifyPhone || '')
        .split(/[,;\n\r/|]+/).map((s) => normalizePhone(s.trim())).filter((p) => isLikelyValid(p));
}

async function handleAckMode({ phone, text, accountId }) {
    const now = Date.now();
    const me = normalizePhone(phone);
    const targets = notifyTargets();

    // Kendi iç numaralarımızdan gelen mesaja alındı yazma (bot-bot döngüsü olmasın).
    if (targets.includes(me)) { addLog({ phone, kind: 'skip', reason: 'iç bildirim numarası — cevap yazılmadı' }); return; }
    if (!deps.waStatus || !deps.waStatus().ready) { addLog({ phone, kind: 'skip', reason: 'WhatsApp bağlı değil' }); return; }

    if (!state.ack) state.ack = {};
    const rec = state.ack[me] || { ackAt: 0, notifyAt: 0 };

    // Müşterinin adı (varsa) bildirimde geçsin — bulunamazsa numara yeter.
    let name = '';
    let known = false;
    try {
        let firmaNo = config.firmaNo;
        if (!firmaNo && deps.getContext) firmaNo = deps.getContext()?.firmaNo;
        if (firmaNo && deps.findCariByPhone) {
            const cari = await deps.findCariByPhone(firmaNo, phone);
            if (cari) { known = true; name = cari.name || cari.firma || ''; }
        }
    } catch { /* isim bulunamazsa numara ile devam */ }

    // 1) İÇ BİLDİRİM — "şu kişi mesaj attı, haberin olsun".
    const gapMs = Math.max(0, Number(config.notifyGapMin) || 0) * 60000;
    if (targets.length && (!gapMs || now - (rec.notifyAt || 0) >= gapMs)) {
        const body = `📩 *Yeni müşteri mesajı*\n` +
            `Gönderen: ${name ? name + ' — ' : ''}${me}${known ? '' : ' (cari kartında yok)'}\n` +
            `Mesaj: ${String(text || '').slice(0, 600)}\n\n` +
            `Lütfen dönüş yapın.`;
        for (const t of targets) {
            // İç bildirimde hat SABİTLENMEZ: müşterinin hattı o an tavanda/kopuksa
            // haber kaybolmasın diye havuz uygun numarayı seçsin.
            try { await deps.waSend(t, body, null, { channel: 'aibot' }); }
            catch (e) { addLog({ phone, kind: 'error', reason: 'iç bildirim gönderilemedi: ' + e.message }); }
        }
        rec.notifyAt = now;
        addLog({ phone, name, kind: 'notify', reason: `iç bildirim → ${targets.join(', ')}`, incoming: String(text || '').slice(0, 80) });
    }

    // 2) MÜŞTERİYE ALINDI MESAJI — numara başına en fazla ackCooldownHours'ta bir.
    if (!known && !config.ackUnknown) {
        state.ack[me] = rec; saveState();
        addLog({ phone, kind: 'skip', reason: 'numara cari kartında yok (alındı mesajı kapalı)' }); return;
    }
    const coolMs = Math.max(0, Number(config.ackCooldownHours) || 0) * 3600000;
    if (coolMs && now - (rec.ackAt || 0) < coolMs) {
        state.ack[me] = rec; saveState();
        addLog({ phone, name, kind: 'skip', reason: 'alındı mesajı yakın zamanda gönderildi (tek cevap kuralı)' }); return;
    }
    if (Number(config.dailyCap) > 0 && state.sent >= Number(config.dailyCap)) {
        addLog({ phone, kind: 'skip', reason: 'günlük tavan doldu' }); return;
    }
    const ackText = (config.ackMessage && config.ackMessage.trim()) || DEFAULT_ACK;
    const r = await deps.waSend(phone, ackText, null, { simulateTyping: true, typingMs: 900, channel: 'aibot', accountId });
    if (r && r.success) {
        rec.ackAt = now;
        state.sent++;
        state.lastByPhone[phone] = now;
        if (deps.recordSent) deps.recordSent();
        addLog({ phone, name, kind: 'reply', reason: 'nöbetçi mod — alındı mesajı', reply: ackText.slice(0, 120), incoming: String(text || '').slice(0, 80) });
    } else {
        addLog({ phone, name, kind: 'error', reason: 'alındı mesajı gönderilemedi: ' + ((r && r.error) || 'bilinmiyor') });
    }
    state.ack[me] = rec;
    saveState();
}

async function handleIncomingInner({ phone, text, jid, id, accountId = null }) {
    // Nöbetçi mod: model devre dışı — alındı mesajı + iç bildirim ile bitir.
    if (config.replyMode === 'ack') return handleAckMode({ phone, text, accountId });

    // Sağlayıcı hazırlık kontrolü: kontörlü modda anahtar değil KONTÖR aranır.
    if (isMetered()) {
        if (!deps.credits) { addLog({ phone, kind: 'skip', reason: 'kontör istemcisi yok' }); return; }
        if (!deps.credits.hasIdentity()) {
            addLog({ phone, kind: 'skip', reason: 'kontörlü AI için lisans gerekli (deneme sürümünde kapalı)' }); return;
        }
        // Önbellekteki bakiye sıfırsa modeli hiç çağırma (boş ağ turu olmasın).
        // Kesin karar sunucuda; uzaktan kontör yüklenince bir sonraki tazelemede açılır.
        if (deps.credits.likelyOutOfCredit()) {
            addLog({ phone, kind: 'skip', reason: 'kontör bitti — yeni kontör yüklenmesi gerekiyor' }); return;
        }
    } else if (!getApiKey()) {
        addLog({ phone, kind: 'skip', reason: 'API anahtarı yok' }); return;
    }

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
            const r = await deps.waSend(phone, closing, null, { simulateTyping: true, typingMs: 1000, channel: 'aibot', accountId });
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

    // Modeli çağır. Geçmiş turlar ham metin; güncel mesaj bağlam bloğuyla sarılır
    // (bakiye/hareket her turda tazelenir, eski turdaki rakam yeniden kullanılmaz).
    const history = convoOf(phone).slice();
    const messages = [...history, { role: 'user', text: buildUser(ctx, text) }];

    let reply = '';
    let reservationId = null;
    try {
        const out = await runModel({
            system: buildSystem(),
            messages,
            maxTokens: Number(config.maxReplyTokens) || 800,
        });
        reply = out.text;
        reservationId = out.reservationId;
    } catch (e) {
        // Kontör bitti / hesap kapalı → kullanıcıya sebebi ayırt edilebilir yazılır.
        const meteredCode = e.code && ['NO_CREDIT', 'DAILY_CAP', 'ACCOUNT_BLOCKED'].includes(e.code);
        addLog({
            phone, name: ctx.name,
            kind: meteredCode ? 'skip' : 'error',
            reason: (meteredCode ? '' : 'API: ') + e.message,
        });
        return;
    }

    // Sessiz kalınan turda da müşteri mesajı hafızaya yazılır (bağlam kopmasın).
    pushConvo(phone, 'user', text);

    // Kapsam dışı / emin değil → sessiz kal (mesaj gönderme).
    // KONTÖR DÜŞMEZ: rezervasyon iptal edilir (yalnız giden mesajdan ücret alınır).
    if (!reply || /\[SESSIZ\]/i.test(reply)) {
        if (reservationId && deps.credits) await deps.credits.release(reservationId);
        addLog({ phone, name: ctx.name, kind: 'silent', incoming: text.slice(0, 80) });
        return;
    }

    if (!deps.waStatus || !deps.waStatus().ready) {
        if (reservationId && deps.credits) await deps.credits.release(reservationId);
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
    if (!outText && !media) {
        if (reservationId && deps.credits) await deps.credits.release(reservationId);
        addLog({ phone, name: ctx.name, kind: 'silent', incoming: text.slice(0, 80) }); return;
    }

    const r = await deps.waSend(phone, outText, media, { simulateTyping: true, typingMs: 1200, channel: 'aibot', accountId });
    if (r && r.success) {
        state.sent++;
        state.lastByPhone[phone] = Date.now();
        // Tartışma sayacı: bu numaraya verilen bot cevabı (eşiğe yaklaşınca sohbet kapanır).
        th.n = (th.n || 0) + 1; th.since = th.since || Date.now(); th.name = ctx.name; state.thread[phone] = th;
        saveState();
        pushConvo(phone, 'assistant', outText);
        if (deps.recordSent) deps.recordSent(); // anti-ban gün/saat sayacı

        // KONTÖR BURADA DÜŞER — mesaj müşteriye gerçekten gitti.
        let spent = null, balance = null;
        if (reservationId && deps.credits) {
            const c = await deps.credits.commit(reservationId, ctx.name || phone);
            if (c.ok) { spent = c.spent; balance = c.balance; }
        }
        addLog({
            phone, name: ctx.name, kind: 'reply', incoming: text.slice(0, 80),
            reply: (media ? '[EKSTRE PDF] ' : '') + outText.slice(0, 200),
            ...(spent != null ? { credit: spent, balance } : {}),
        });
    } else {
        // Gönderilemedi → kontör düşmez.
        if (reservationId && deps.credits) await deps.credits.release(reservationId);
        addLog({ phone, name: ctx.name, kind: 'error', reason: 'gönderim: ' + (r?.error || 'bilinmiyor') });
    }
}

// Bağlantı sınaması (UI "Sına"). Kontörlü modda anahtar yoktur: kontör
// sunucusuna erişim + bakiye sınanır, model ÇAĞRILMAZ (boşuna kontör yanmasın).
async function testApiKey(rawKey, opts = {}) {
    const prov = normProvider(opts.provider || config.provider);

    if (prov === 'vega') {
        if (!deps?.credits) throw new Error('Kontör istemcisi kurulu değil.');
        if (!deps.credits.hasIdentity()) throw new Error('Kontörlü AI için lisans gerekli (deneme sürümünde kapalıdır).');
        const t = await deps.credits.test();
        if (t.error) throw new Error(t.error);
        return { ok: true, sample: `kontör sunucusu hazır — kalan kontör: ${t.balance ?? 0}` };
    }

    const key = (rawKey && rawKey.trim()) || getApiKey();
    if (!key) throw new Error('Anahtar yok.');
    // UI'da kaydetmeden sınama: gönderilen provider/baseUrl/model'i kullan, yoksa config.
    const text = await callLLM({
        provider: prov,
        baseUrl: opts.baseUrl !== undefined ? opts.baseUrl : config.baseUrl,
        model: opts.model || config.model,
        apiKey: key, maxTokens: 16,
        system: 'Kısa cevap ver.', user: 'Merhaba, sadece "TAMAM" yaz.',
    });
    return { ok: true, sample: text };
}

module.exports = { configure, getConfig, setConfig, getStatus, getLog, handleIncoming, testApiKey };
