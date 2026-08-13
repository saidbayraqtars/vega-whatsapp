// ═══════════════════════════════════════════════════════════════════════════
//  WhatsApp Cloud API sürücüsü (RESMÎ kanal — Baileys'e alternatif)
// ═══════════════════════════════════════════════════════════════════════════
//  NEDEN: Baileys resmî olmayan istemcidir. Rızasız ticari bildirim (bakiye /
//  ekstre / belge) gönderiminde WhatsApp hesabı "hizmet koşullarına uymadı"
//  diyerek kapatır — hacim düşük olsa bile. Şikayet/engelleme oranı ve soğuk
//  ilk temas ban sebebidir, mesaj SAYISI değil.
//
//  Bu modül Meta'nın resmî WhatsApp Business Platform (Cloud API) uçlarına
//  konuşur: graph.facebook.com. Ban riski yoktur; karşılığında (a) mesaj başına
//  ücret, (b) 24 saatlik servis penceresi dışında ONAYLI ŞABLON zorunluluğu.
//
//  VARSAYILAN DEĞİLDİR. server.js yalnız config.json → wa.mode === 'cloud'
//  olduğunda bu sürücüye yönlenir; aksi halde Baileys (yerel) çalışır.
//
//  SINIRLAR (bilerek kapsam dışı):
//    • GELEN mesaj yok — Cloud API webhook ister, webhook genel erişime açık
//      HTTPS adres ister. Yerel PC'de yok. ⇒ AI oto-yanıt cloud modda çalışmaz.
//    • Teslim/okundu bildirimi yok (aynı webhook sebebi) — Pano yalnız
//      "gönderildi" sayar.
//    • Mesaj geri çekme (delete-for-everyone) Cloud API'de YOKTUR.
//    • Numara WhatsApp'ta kayıtlı mı sorgusu YOKTUR; gönderim anında anlaşılır.
// ═══════════════════════════════════════════════════════════════════════════

const https = require('https');
const crypto = require('crypto');
const { normalizePhone } = require('./phone');

const GRAPH_HOST = 'graph.facebook.com';
const DEFAULT_API_VERSION = 'v21.0';
const TEXT_LIMIT = 4096;     // Cloud API text.body üst sınırı
const CAPTION_LIMIT = 1024;  // document/image caption üst sınırı
const STATUS_TTL_MS = 60_000;

// cfg: { phoneNumberId, token, apiVersion, templateName, templateLang,
//        templateMode:'auto'|'always'|'never', templateParamCount, templateDocHeader }
let cfg = null;
let deps = { stats: null, log: () => { } };
let statusCache = { ready: false, me: null, error: 'Cloud API ayarlanmadı.', ts: 0, info: null };

const configure = (d = {}) => { deps = { ...deps, ...d }; };

// ─── Yapılandırma ────────────────────────────────────────────────────────────
// server.js token'ı ÇÖZÜLMÜŞ halde verir (config.json'da makine anahtarıyla
// şifreli durur). Burada düz metin tutulur, diske yazılmaz.
function setConfig(next) {
    if (!next || !next.phoneNumberId || !next.token) {
        cfg = null;
        statusCache = { ready: false, me: null, error: 'Cloud API ayarlanmadı (numara kimliği / erişim anahtarı eksik).', ts: 0, info: null };
        return;
    }
    cfg = {
        phoneNumberId: String(next.phoneNumberId).trim(),
        token: String(next.token).trim(),
        apiVersion: String(next.apiVersion || DEFAULT_API_VERSION).trim().replace(/^(?!v)/, 'v'),
        templateName: String(next.templateName || '').trim(),
        templateLang: String(next.templateLang || 'tr').trim(),
        templateMode: ['auto', 'always', 'never'].includes(next.templateMode) ? next.templateMode : 'auto',
        templateParamCount: Number(next.templateParamCount) >= 0 ? Math.floor(Number(next.templateParamCount)) : 1,
        templateDocHeader: !!next.templateDocHeader,
    };
    statusCache = { ready: false, me: null, error: 'Durum sorgulanmadı.', ts: 0, info: null };
}

const isConfigured = () => !!cfg;

// ─── HTTP (graph.facebook.com) ───────────────────────────────────────────────
// Not: pkg/exe altında global fetch garanti değil → düz https modülü.
function graph(path, { method = 'GET', json = null, body = null, contentType = null, timeoutMs = 60_000 } = {}) {
    return new Promise((resolve, reject) => {
        const payload = json != null ? Buffer.from(JSON.stringify(json)) : body;
        const headers = { Authorization: `Bearer ${cfg.token}` };
        if (payload) {
            headers['Content-Type'] = contentType || 'application/json';
            headers['Content-Length'] = payload.length;
        }
        const req = https.request({ hostname: GRAPH_HOST, path, method, headers }, (res) => {
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let parsed = null;
                try { parsed = raw ? JSON.parse(raw) : null; } catch { /* json değil */ }
                resolve({ status: res.statusCode, json: parsed, raw });
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error('Meta sunucusu yanıt vermedi (zaman aşımı)')));
        if (payload) req.write(payload);
        req.end();
    });
}

// multipart/form-data gövdesi (medya yükleme) — bağımlılık eklemeden.
function multipartBody(fields, file) {
    const boundary = '----vegawa' + crypto.randomBytes(12).toString('hex');
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
    }
    parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.fileName}"\r\n` +
        `Content-Type: ${file.mimetype}\r\n\r\n`, 'utf8'));
    parts.push(file.buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
    return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ─── Hata çevirisi ───────────────────────────────────────────────────────────
// Meta hata kodlarını kullanıcı diline indir; ham kodu da tut (destek için).
function describeError(res) {
    const e = (res && res.json && res.json.error) || null;
    if (!e) return `Meta yanıtı ${res?.status || '?'} (ayrıntı yok)`;
    const code = e.code, sub = e.error_subcode;
    const detail = (e.error_data && e.error_data.details) || e.message || '';
    const tr = {
        190: 'Erişim anahtarı geçersiz veya süresi dolmuş — Meta panelinden kalıcı (System User) anahtar üretin.',
        200: 'Erişim anahtarında yetki yok — System User\'a whatsapp_business_messaging izni verin.',
        100: 'İstek parametresi hatalı (numara kimliği yanlış olabilir).',
        131047: '24 saatlik servis penceresi kapalı — müşteri son 24 saatte yazmadı. Serbest metin gönderilemez, ONAYLI ŞABLON gerekir.',
        131026: 'Mesaj teslim edilemedi — numara WhatsApp kullanıcısı olmayabilir ya da alıcı eski sürüm kullanıyor.',
        131031: 'WhatsApp Business hesabı kısıtlanmış/askıya alınmış.',
        131049: 'Meta bu mesajı sağlık/kalite gerekçesiyle iletmedi (pazarlama sıklık sınırı).',
        133010: 'Numara Cloud API\'ye kayıtlı değil — telefon numarasını Meta panelinde kaydedin.',
        132000: 'Şablon değişken sayısı şablondaki {{n}} sayısıyla uyuşmuyor.',
        132001: 'Şablon bulunamadı — ad ve dil kodu Meta\'daki onaylı şablonla birebir aynı olmalı.',
        132005: 'Şablon parametresi çok uzun (satır sonu/sekme içeremez, uzunluk sınırı var).',
        132007: 'Şablon biçim hatası (parametre boş ya da yasaklı karakter).',
        132012: 'Şablon parametre biçimi hatalı.',
        132015: 'Şablon devre dışı (kalite düşüklüğü nedeniyle Meta pasifleştirmiş).',
        132016: 'Şablon kalite düşüklüğünden askıya alınmış.',
        130429: 'Hız sınırı aşıldı — gönderim hızını düşürün.',
        131056: 'Aynı numara çiftine çok sık gönderim (eşleştirme hız sınırı).',
        80007: 'Hız sınırı aşıldı (hesap seviyesinde).',
        131000: 'Meta tarafında geçici hata — tekrar deneyin.',
    }[code];
    return `${tr || detail || e.message || 'bilinmeyen hata'} [kod ${code}${sub ? '/' + sub : ''}]`;
}

// 24 saat penceresi kapalı sinyali → şablona düşülecek hata kodları.
const isReengagementError = (res) => {
    const c = res?.json?.error?.code;
    return c === 131047 || c === 470;
};

// ─── Durum ───────────────────────────────────────────────────────────────────
// getStatus() SENKRONDUR (server.js waStatusX senkron okur) → önbellekten döner.
// refreshStatus() periyodik olarak (ve ayar kaydında) çağrılır.
const getStatus = () => ({
    ready: statusCache.ready,
    initializing: false,
    hasQr: false,
    qr: null,
    me: statusCache.me,
    error: statusCache.error,
    cloud: statusCache.info,
});

async function refreshStatus(force = false) {
    if (!cfg) {
        statusCache = { ready: false, me: null, error: 'Cloud API ayarlanmadı.', ts: Date.now(), info: null };
        return getStatus();
    }
    if (!force && Date.now() - statusCache.ts < STATUS_TTL_MS) return getStatus();
    try {
        const r = await graph(
            `/${cfg.apiVersion}/${encodeURIComponent(cfg.phoneNumberId)}` +
            `?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,platform_type`,
            { timeoutMs: 20_000 });
        if (r.status === 200 && r.json && !r.json.error) {
            const num = String(r.json.display_phone_number || '').replace(/\D/g, '');
            statusCache = {
                ready: true,
                me: num || cfg.phoneNumberId,
                error: null,
                ts: Date.now(),
                info: {
                    displayPhone: r.json.display_phone_number || '',
                    name: r.json.verified_name || '',
                    quality: r.json.quality_rating || '',
                    tier: r.json.messaging_limit_tier || '',
                },
            };
        } else {
            statusCache = { ready: false, me: null, error: describeError(r), ts: Date.now(), info: null };
        }
    } catch (e) {
        statusCache = { ready: false, me: null, error: 'Meta erişilemedi: ' + e.message, ts: Date.now(), info: null };
    }
    return getStatus();
}

// ─── Medya yükleme ───────────────────────────────────────────────────────────
// Cloud API dosyayı gövdede kabul etmez: önce /media'ya yüklenir, dönen id ile
// mesaj gönderilir. Aynı dosya birden çok kişiye gidebildiği için (bir carinin
// iki telefonu) içerik özetine göre kısa süreli önbellek tutulur.
const mediaCache = new Map(); // sha1 -> { id, at }
const MEDIA_CACHE_TTL_MS = 60 * 60 * 1000;
const MEDIA_CACHE_MAX = 50;

async function uploadMedia(media) {
    const hash = crypto.createHash('sha1').update(media.buffer).digest('hex');
    const hit = mediaCache.get(hash);
    if (hit && Date.now() - hit.at < MEDIA_CACHE_TTL_MS) return { id: hit.id };

    const { body, contentType } = multipartBody(
        { messaging_product: 'whatsapp', type: media.mimetype || 'application/octet-stream' },
        { buffer: media.buffer, mimetype: media.mimetype || 'application/octet-stream', fileName: media.fileName || 'dosya' },
    );
    const r = await graph(`/${cfg.apiVersion}/${encodeURIComponent(cfg.phoneNumberId)}/media`,
        { method: 'POST', body, contentType, timeoutMs: 120_000 });
    if (r.status !== 200 || !r.json || !r.json.id) return { error: describeError(r) };

    if (mediaCache.size >= MEDIA_CACHE_MAX) mediaCache.delete(mediaCache.keys().next().value);
    mediaCache.set(hash, { id: r.json.id, at: Date.now() });
    return { id: r.json.id };
}

// ─── Yük (payload) kurucular ─────────────────────────────────────────────────
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

// Şablon parametresi satır sonu/sekme İÇEREMEZ (Meta reddeder) → tek satıra in.
const toParam = (s) => clip(String(s || '').replace(/\s*\n\s*/g, ' · ').replace(/\t/g, ' ').replace(/ {2,}/g, ' ').trim(), 900);

function buildTextPayload(to, text) {
    return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: clip(text, TEXT_LIMIT) } };
}

function buildMediaPayload(to, text, media, mediaId) {
    const caption = clip(text, CAPTION_LIMIT);
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
    if (media.kind === 'image') return { ...base, type: 'image', image: { id: mediaId, caption } };
    if (media.kind === 'video') return { ...base, type: 'video', video: { id: mediaId, caption } };
    return { ...base, type: 'document', document: { id: mediaId, caption, filename: media.fileName || 'dosya.pdf' } };
}

// Şablon gönderimi. Serbest metnimiz çok satırlı olduğu için tek satıra indirilip
// gövde değişkenine konur ({{1}}). templateParamCount=0 ise sabit metinli şablon
// varsayılır (değişken yollanmaz). opts.templateParams verilirse o kullanılır.
function buildTemplatePayload(to, text, mediaId, media, opts) {
    const components = [];
    if (cfg.templateDocHeader && mediaId) {
        const p = media.kind === 'image'
            ? { type: 'image', image: { id: mediaId } }
            : { type: 'document', document: { id: mediaId, filename: media.fileName || 'dosya.pdf' } };
        components.push({ type: 'header', parameters: [p] });
    }
    let params = Array.isArray(opts.templateParams) ? opts.templateParams.map(toParam) : null;
    if (!params && cfg.templateParamCount > 0) {
        params = [toParam(text)];
        // Şablon 1'den fazla değişken bekliyorsa kalanları boş bırakma (Meta reddeder) → tire koy.
        while (params.length < cfg.templateParamCount) params.push('-');
    }
    if (params && params.length) {
        components.push({ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t || '-' })) });
    }
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
            name: cfg.templateName,
            language: { code: cfg.templateLang || 'tr' },
            ...(components.length ? { components } : {}),
        },
    };
}

// ─── Gönderim ────────────────────────────────────────────────────────────────
// İmza Baileys sendMessage ile AYNI (server.js sarmalayıcısı ikisini de çağırır):
//   sendMessage(phone, text, media|null, opts) -> { success, id? , error? }
//   media: { kind:'image'|'video'|'document', buffer, mimetype, fileName }
//   opts : { channel, templateParams?, forceTemplate?, simulateTyping? (yok sayılır) }
async function sendMessage(phone, text, media = null, opts = {}) {
    if (!cfg) return { success: false, error: 'Cloud API ayarlanmadı.' };
    const to = normalizePhone(phone);
    if (!to) return { success: false, error: 'Geçersiz numara.' };

    let mediaId = null;
    if (media && media.buffer) {
        const up = await uploadMedia(media);
        if (up.error) {
            try { deps.stats?.recordFail(opts.channel); } catch { /* yok say */ }
            return { success: false, error: 'Dosya yüklenemedi: ' + up.error };
        }
        mediaId = up.id;
    }

    const wantTemplate = opts.forceTemplate || cfg.templateMode === 'always';
    const canTemplate = !!cfg.templateName && cfg.templateMode !== 'never';
    const url = `/${cfg.apiVersion}/${encodeURIComponent(cfg.phoneNumberId)}/messages`;

    const post = (payload) => graph(url, { method: 'POST', json: payload });

    try {
        let res;
        if (wantTemplate && canTemplate) {
            res = await post(buildTemplatePayload(to, text, mediaId, media || {}, opts));
        } else {
            res = await post(mediaId ? buildMediaPayload(to, text, media, mediaId) : buildTextPayload(to, text));
            // 24 saat penceresi kapalıysa serbest metin reddedilir → onaylı şablona düş.
            if (res.status !== 200 && isReengagementError(res) && canTemplate) {
                deps.log(`cloud: 24s penceresi kapalı, şablona düşülüyor (${to})`);
                res = await post(buildTemplatePayload(to, text, mediaId, media || {}, opts));
            }
        }

        if (res.status === 200 && res.json && res.json.messages && res.json.messages[0]) {
            const id = res.json.messages[0].id;
            try { deps.stats?.recordSent({ id, phone: to, channel: opts.channel }); } catch { /* yok say */ }
            deps.log(`cloud send-ok to=${to} id=${id}`);
            return { success: true, id };
        }
        const err = describeError(res);
        try { deps.stats?.recordFail(opts.channel); } catch { /* yok say */ }
        deps.log(`cloud send-fail to=${to} err=${err}`);
        return { success: false, error: err };
    } catch (e) {
        try { deps.stats?.recordFail(opts.channel); } catch { /* yok say */ }
        deps.log(`cloud send-fail to=${to} err=${e.message}`);
        return { success: false, error: 'Meta erişilemedi: ' + e.message };
    }
}

// Cloud API'de numara sorgusu YOK. "Bilinmiyor" demek gönderimi durdurur; çağıran
// taraf transient=true görünce numarayı kalıcı elemez → exists:true dönüp gerçek
// sonucu gönderim anında (131026) öğreniyoruz.
const checkOnWhatsApp = async (phone) => {
    const clean = normalizePhone(phone);
    if (!clean) return { exists: false, transient: false, error: 'Geçersiz numara.' };
    return { exists: true, jid: `${clean}@s.whatsapp.net`, unchecked: true };
};

// Cloud API gönderilmiş mesajı geri çekemez (delete-for-everyone yok).
const deleteMessage = async () => ({ success: false, error: 'Cloud API mesaj geri çekmeyi desteklemiyor.' });

// Ayar ekranındaki "Sına" düğmesi: kimlik doğrula, istenirse tek test mesajı at.
async function test(testPhone) {
    if (!cfg) return { success: false, message: 'Önce numara kimliği ve erişim anahtarını girin.' };
    const st = await refreshStatus(true);
    if (!st.ready) return { success: false, message: st.error || 'Doğrulanamadı.' };
    if (!testPhone) {
        return {
            success: true,
            message: `✓ Bağlandı: ${st.cloud.displayPhone || st.me}${st.cloud.name ? ' (' + st.cloud.name + ')' : ''}` +
                `${st.cloud.quality ? ' · kalite: ' + st.cloud.quality : ''}${st.cloud.tier ? ' · kademe: ' + st.cloud.tier : ''}`,
            info: st.cloud,
        };
    }
    const r = await sendMessage(testPhone, 'Vega WhatsApp — Cloud API test mesajı.', null, { channel: 'manual' });
    return r.success
        ? { success: true, message: '✓ Test mesajı gönderildi.', info: st.cloud }
        : { success: false, message: 'Bağlantı tamam ama gönderim başarısız: ' + r.error, info: st.cloud };
}

module.exports = {
    configure,
    setConfig,
    isConfigured,
    getStatus,
    refreshStatus,
    sendMessage,
    deleteMessage,
    checkOnWhatsApp,
    test,
    DEFAULT_API_VERSION,
};
