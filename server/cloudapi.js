// ═══════════════════════════════════════════════════════════════════════════
//  WhatsApp Cloud API sürücüsü (RESMÎ kanal — Baileys'e alternatif)
// ═══════════════════════════════════════════════════════════════════════════
//  NEDEN: Baileys resmî olmayan istemcidir. Rızasız ticari bildirim (bakiye /
//  ekstre / belge) gönderiminde WhatsApp hesabı "hizmet koşullarına uymadı"
//  diyerek kapatır — hacim düşük olsa bile. Şikayet/engelleme oranı ve soğuk
//  ilk temas ban sebebidir, mesaj SAYISI değil.
//
//  Bu modül Meta'nın resmî WhatsApp Business Platform (Cloud API) uçlarına
//  konuşur. Ban riski yoktur; karşılığında (a) mesaj başına ücret, (b) 24
//  saatlik servis penceresi dışında ONAYLI ŞABLON zorunluluğu.
//
//  İKİ BAĞLANTI YOLU (cfg.via):
//    • 'vega'   — Vega sunucusu (vega-kontor Worker) üzerinden. Meta jetonu bu
//                 PC'ye HİÇ gelmez; kimlik imzalı lisanstır, numara tedarikçi
//                 panelinden lisansa bağlanır. Worker Meta'nın cevabını birebir
//                 geçirdiği için aşağıdaki hata çevirisi iki yolda da aynıdır.
//    • 'direct' — graph.facebook.com'a doğrudan, kullanıcının kendi jetonuyla.
//
//  VARSAYILAN DEĞİLDİR. server.js yalnız config.json → wa.mode === 'cloud'
//  olduğunda bu sürücüye yönlenir; aksi halde Baileys (yerel) çalışır.
//
//  GELEN MESAJ / TESLİM BİLDİRİMİ: yalnız 'vega' yolunda. Meta webhook'u Worker'a
//  düşer, cloudinbox.js 15 sn'de bir /v1/wa/inbox'tan çeker (AI oto-yanıt + Pano
//  teslim/okundu). 'direct' yolda webhook yok ⇒ ikisi de çalışmaz.
//
//  SINIRLAR (bilerek kapsam dışı):
//    • Mesaj geri çekme (delete-for-everyone) Cloud API'de YOKTUR.
//    • Numara WhatsApp'ta kayıtlı mı sorgusu YOKTUR; gönderim anında anlaşılır.
// ═══════════════════════════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { normalizePhone } = require('./phone');

const GRAPH_HOST = 'graph.facebook.com';
const DEFAULT_API_VERSION = 'v21.0';
const TEXT_LIMIT = 4096;     // Cloud API text.body üst sınırı
const CAPTION_LIMIT = 1024;  // document/image caption üst sınırı
const STATUS_TTL_MS = 60_000;

// cfg: { via, phoneNumberId, token, apiVersion, templateName, templateLang,
//        templateMode:'auto'|'always'|'never', templateParamCount, templateDocHeader }
let cfg = null;
// vega: { endpoint(): string, authHeaders(): object } — server.js credits.js'ten verir.
let deps = { stats: null, log: () => { }, vega: null };
let statusCache = { ready: false, me: null, error: 'Cloud API ayarlanmadı.', ts: 0, info: null };

const configure = (d = {}) => { deps = { ...deps, ...d }; };

// ─── Yapılandırma ────────────────────────────────────────────────────────────
// server.js token'ı ÇÖZÜLMÜŞ halde verir (config.json'da makine anahtarıyla
// şifreli durur). Burada düz metin tutulur, diske yazılmaz. 'vega' yolunda
// token yoktur; numara kimliği de isteğe bağlıdır (boşsa lisansın ilk numarası).
function setConfig(next) {
    const via = next && next.via === 'vega' ? 'vega' : 'direct';
    if (!next || (via === 'direct' && (!next.phoneNumberId || !next.token))) {
        cfg = null;
        statusCache = { ready: false, me: null, error: 'Cloud API ayarlanmadı (numara kimliği / erişim anahtarı eksik).', ts: 0, info: null };
        return;
    }
    cfg = {
        via,
        phoneNumberId: String(next.phoneNumberId || '').trim(),
        token: via === 'direct' ? String(next.token).trim() : null,
        apiVersion: String(next.apiVersion || DEFAULT_API_VERSION).trim().replace(/^(?!v)/, 'v'),
        templateName: String(next.templateName || '').trim(),
        templateLang: String(next.templateLang || 'tr').trim(),
        templateMode: ['auto', 'always', 'never'].includes(next.templateMode) ? next.templateMode : 'auto',
        templateParamCount: Number(next.templateParamCount) >= 0 ? Math.floor(Number(next.templateParamCount)) : 1,
        templateDocHeader: !!next.templateDocHeader,
        // Mesaj türüne (opts.channel) göre standart şablon seti (STANDARD_TEMPLATES).
        // Kapalıysa ya da kanalın standart şablonu yoksa tek şablon (templateName) kullanılır.
        useStandardTemplates: next.useStandardTemplates !== false,
    };
    statusCache = { ready: false, me: null, error: 'Durum sorgulanmadı.', ts: 0, info: null };
}

const isConfigured = () => !!cfg;
const viaVega = () => !!cfg && cfg.via === 'vega';
// cfg yokken de güvenli: numara bağlama/şablon ekranı mod kaydedilmeden kullanılabilir.
const pnidQuery = () => (cfg && cfg.phoneNumberId ? `?phoneNumberId=${encodeURIComponent(cfg.phoneNumberId)}` : '');
const unreachable = () => (viaVega() ? 'Vega sunucusuna erişilemedi: ' : 'Meta erişilemedi: ');

// ─── HTTP ────────────────────────────────────────────────────────────────────
// Not: pkg/exe altında global fetch garanti değil → düz http/https modülü.
function httpRequest(urlStr, { method = 'GET', json = null, body = null, contentType = null, headers = {}, timeoutMs = 60_000 } = {}) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(urlStr); } catch { return reject(new Error('Adres geçersiz: ' + urlStr)); }
        const payload = json != null ? Buffer.from(JSON.stringify(json)) : (body ? Buffer.from(body) : null);
        const h = { ...headers };
        if (payload) {
            h['Content-Type'] = contentType || 'application/json';
            h['Content-Length'] = payload.length;
        }
        const mod = u.protocol === 'http:' ? http : https;
        const req = mod.request({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method, headers: h }, (res) => {
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
        req.setTimeout(timeoutMs, () => req.destroy(new Error('Sunucu yanıt vermedi (zaman aşımı)')));
        if (payload) req.write(payload);
        req.end();
    });
}

// Doğrudan: graph.facebook.com + kullanıcının jetonu.
function graph(path, opts = {}) {
    return httpRequest(`https://${GRAPH_HOST}${path}`, { ...opts, headers: { Authorization: `Bearer ${cfg.token}` } });
}

// Vega: Worker + imzalı lisans. Cevap Meta'nınkiyle aynı biçimde gelir.
function vega(path, opts = {}) {
    const base = deps.vega && deps.vega.endpoint && deps.vega.endpoint();
    if (!base) return Promise.reject(new Error('Vega sunucusu adresi tanımlı değil.'));
    const auth = (deps.vega.authHeaders && deps.vega.authHeaders()) || {};
    return httpRequest(String(base).replace(/\/+$/, '') + path, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
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
// Vega sunucusunun kendi hataları: { success:false, error:'KOD' } (düz metin).
const VEGA_ERR = {
    AUTH_MISSING: 'Vega sunucusu üzerinden gönderim için lisans gerekli (deneme sürümünde kapalıdır).',
    AUTH_MALFORMED: 'Lisans kimliği okunamadı.',
    LICENSE_INVALID: 'Lisans imzası Vega sunucusunda doğrulanamadı.',
    LICENSE_EXPIRED: 'Lisans süresi dolmuş.',
    LICENSE_WRONG_PRODUCT: 'Lisans başka bir ürüne ait.',
    NO_NUMBER: 'Bu lisansa bağlı WhatsApp numarası yok — tedarikçiniz numaranızı tanımlamalı.',
    NUMBER_NOT_YOURS: 'Girilen numara kimliği bu lisansa bağlı değil — alanı boş bırakın ya da tedarikçinize danışın.',
    TOKEN_MISSING: 'Vega sunucusunda bu numaranın Meta anahtarı tanımlı değil — tedarikçinize bildirin.',
    BAD_MESSAGE: 'Mesaj biçimi Vega sunucusunca reddedildi.',
    TOO_LARGE: 'Dosya çok büyük (en fazla 16 MB).',
    EMPTY_FILE: 'Dosya boş.',
    BAD_TEMPLATE: 'Şablon biçimi Vega sunucusunca reddedildi.',
    BAD_TYPE: 'Örnek dosya türü desteklenmiyor (PDF, JPEG, PNG).',
    NOT_FOUND: 'Vega sunucusu bu işlemi henüz desteklemiyor — sunucu güncellenmeli.',
    SERVER_NOT_CONFIGURED: 'Vega sunucusunda Meta uygulama ayarı eksik — tedarikçinize bildirin.',
    NO_WABA: 'Numaranın WhatsApp Business hesabı (WABA) Vega sunucusunda tanımlı değil — tedarikçinize bildirin.',
};

// Meta hata kodlarını kullanıcı diline indir; ham kodu da tut (destek için).
function describeError(res) {
    const raw = res && res.json && res.json.error;
    if (typeof raw === 'string') return `${VEGA_ERR[raw] || raw} [Vega ${res.status}]`;
    const e = raw || null;
    if (!e) return `Sunucu yanıtı ${res?.status || '?'} (ayrıntı yok)`;
    const code = e.code, sub = e.error_subcode;
    const detail = (e.error_data && e.error_data.details) || e.message || '';
    const tr = {
        190: 'Erişim anahtarı geçersiz veya süresi dolmuş — Meta panelinden kalıcı (System User) anahtar üretin.',
        200: 'Erişim anahtarında yetki yok — System User\'a whatsapp_business_messaging izni verin.',
        100: 'İstek parametresi hatalı (numara kimliği yanlış olabilir).',
        131047: '24 saatlik servis penceresi kapalı — müşteri son 24 saatte yazmadı. Serbest metin gönderilemez, ONAYLI ŞABLON gerekir.',
        131026: 'Mesaj teslim edilemedi — numara WhatsApp kullanıcısı olmayabilir ya da alıcı eski sürüm kullanıyor.',
        131030: 'Alıcı numara izin listesinde değil — test numarasıyla yalnız Meta panelinde eklenen alıcılara gönderilebilir.',
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
        const r = viaVega()
            ? await vega('/v1/wa/status' + pnidQuery(), { timeoutMs: 20_000 })
            : await graph(
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
                    via: cfg.via,
                },
            };
        } else {
            statusCache = { ready: false, me: null, error: describeError(r), ts: Date.now(), info: null };
        }
    } catch (e) {
        statusCache = { ready: false, me: null, error: unreachable() + e.message, ts: Date.now(), info: null };
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

    const mimetype = media.mimetype || 'application/octet-stream';
    let r;
    if (viaVega()) {
        // Worker ham baytı alır, multipart'ı kendisi kurar.
        r = await vega('/v1/wa/media' + pnidQuery(), {
            method: 'POST', body: media.buffer, contentType: mimetype,
            headers: { 'X-File-Name': encodeURIComponent(media.fileName || 'dosya') }, timeoutMs: 120_000,
        });
    } else {
        const { body, contentType } = multipartBody(
            { messaging_product: 'whatsapp', type: mimetype },
            { buffer: media.buffer, mimetype, fileName: media.fileName || 'dosya' },
        );
        r = await graph(`/${cfg.apiVersion}/${encodeURIComponent(cfg.phoneNumberId)}/media`,
            { method: 'POST', body, contentType, timeoutMs: 120_000 });
    }
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

// ─── Standart şablon seti (mesaj türü başına bir şablon) ─────────────────────
// 24 saat penceresi kapalıyken serbest metin gidemez; her mesaj türü kendi ONAYLI
// şablonuna düşer. Mesaj metnimiz (kullanıcının düzenlediği şablondan üretilen) tek
// satıra indirilip {{1}}'e konur → uygulamadaki mesaj düzenleme ekranları aynen çalışır.
// Sabit metin türe özgü tutuldu ki Meta "Hizmet (UTILITY)" sınıflandırsın; toplu mesaj
// içeriği serbest olduğu için Pazarlama. Şablonlar WABA'ya özgüdür: her müşteri kendi
// hesabında bir kez "Standart şablonları oluştur" der (ensureStandardTemplates).
// Metin değişkenle başlayıp bitemez, {{1}} ≤ 900 karakter (toParam) + sabit metin < 1024.
const STANDARD_TEMPLATES = [
    {
        channel: 'manual', name: 'hesap_bakiye_bildirimi', category: 'UTILITY', label: 'Bakiye bildirimi (tek cari)',
        body: 'Sayın müşterimiz, hesap bilgilendirmeniz: {{1}} İyi çalışmalar dileriz.',
        example: 'ABC Ltd. güncel hesap bakiyeniz 1.250,00 TL (borç).',
    },
    {
        channel: 'belge', name: 'belge_bildirimi', category: 'UTILITY', label: 'Belge bildirimleri (fatura, irsaliye, tahsilat, ödeme, güncelleme)',
        body: 'Cari hesabınızla ilgili belge bildirimi: {{1}} Bu mesaj bilgilendirme amaçlıdır.',
        example: 'Sayın ABC Ltd., 14.09.2026 tarihli 12.500,00 TL tutarındaki satış faturanız düzenlenmiştir.',
    },
    {
        channel: 'reminder', name: 'odeme_hatirlatma', category: 'UTILITY', label: 'Bakiye / ödeme hatırlatma',
        body: 'Cari hesap ödeme hatırlatması: {{1}} Ödemenizi yaptıysanız bu mesajı dikkate almayınız.',
        example: 'Sayın ABC Ltd., güncel borç bakiyeniz 8.400,00 TL.',
    },
    {
        channel: 'vade', name: 'vade_hatirlatma', category: 'UTILITY', label: 'Çek / senet / vadeli ödeme hatırlatma',
        body: 'Çek, senet ve vadeli ödeme hatırlatması: {{1}} Bilginize sunarız.',
        example: '3 gün kaldı · Çek 000123 · Cari: ABC Ltd. · Tutar: 15.000,00 TL · Vade: 17.09.2026',
    },
    {
        channel: 'siparis', name: 'siparis_bildirimi', category: 'UTILITY', label: 'Sipariş bildirimi (iç numara)',
        body: 'Sipariş takip bildirimi: {{1}} Bu mesaj sipariş takip sistemince otomatik gönderilmiştir.',
        example: 'Yeni Sipariş SP-2026-0412 · Cari: ABC Ltd. · Tarih: 14.09.2026 · Tutar: 23.750,00 TL',
    },
    {
        channel: 'extre', name: 'hesap_ekstresi', category: 'UTILITY', header: 'DOCUMENT', label: 'Hesap ekstresi (PDF)',
        body: 'Cari hesap ekstreniz ektedir. {{1}} Sorularınız için bu numaradan bize yazabilirsiniz.',
        example: 'Sayın ABC Ltd., 01.01.2026 - 14.09.2026 dönemi hesap ekstreniz.',
    },
    {
        channel: 'watcher', name: 'efatura_belgesi', category: 'UTILITY', header: 'DOCUMENT', label: 'e-Fatura / e-Arşiv PDF',
        body: 'e-Fatura / e-Arşiv belgeniz ektedir. {{1}} İyi çalışmalar dileriz.',
        example: 'Sayın ABC Ltd., 14.09.2026 tarihli ABC2026000000123 numaralı e-Fatura belgeniz.',
    },
    {
        channel: 'bulk', name: 'genel_duyuru', category: 'MARKETING', label: 'Toplu mesaj / duyuru',
        body: 'Değerli müşterimiz, {{1}} Bu tür mesajları almak istemiyorsanız bize DUR yazabilirsiniz.',
        example: 'Eylül ayına özel tüm ürünlerde yüzde 10 indirim başladı.',
    },
];
const STANDARD_BY_CHANNEL = Object.fromEntries(STANDARD_TEMPLATES.map((t) => [t.channel, t]));

// Gönderimde kullanılacak şablon. Belge başlıklı şablon eksiz gönderilemez → eksiz
// mesaj (ör. e-Fatura iptal bildirimi) belge bildirimine düşer.
function templateFor(channel, media) {
    if (!cfg || cfg.templateMode === 'never') return null;
    if (cfg.useStandardTemplates) {
        let std = STANDARD_BY_CHANNEL[channel] || null;
        if (std && std.header === 'DOCUMENT' && !(media && media.kind === 'document')) std = STANDARD_BY_CHANNEL.belge;
        if (std) return { name: std.name, lang: 'tr', paramCount: 1, docHeader: std.header === 'DOCUMENT' };
    }
    if (!cfg.templateName) return null;
    return { name: cfg.templateName, lang: cfg.templateLang || 'tr', paramCount: cfg.templateParamCount, docHeader: cfg.templateDocHeader };
}

// Şablon gönderimi. Serbest metnimiz çok satırlı olduğu için tek satıra indirilip
// gövde değişkenine konur ({{1}}). paramCount=0 ise sabit metinli şablon
// varsayılır (değişken yollanmaz). opts.templateParams verilirse o kullanılır.
function buildTemplatePayload(to, text, mediaId, media, opts, tpl) {
    const components = [];
    if (tpl.docHeader && mediaId) {
        const p = media.kind === 'image'
            ? { type: 'image', image: { id: mediaId } }
            : { type: 'document', document: { id: mediaId, filename: media.fileName || 'dosya.pdf' } };
        components.push({ type: 'header', parameters: [p] });
    }
    let params = Array.isArray(opts.templateParams) ? opts.templateParams.map(toParam) : null;
    if (!params && tpl.paramCount > 0) {
        params = [toParam(text)];
        // Şablon 1'den fazla değişken bekliyorsa kalanları boş bırakma (Meta reddeder) → tire koy.
        while (params.length < tpl.paramCount) params.push('-');
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
            name: tpl.name,
            language: { code: tpl.lang || 'tr' },
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
        let up;
        try { up = await uploadMedia(media); } catch (e) { up = { error: unreachable() + e.message }; }
        if (up.error) {
            try { deps.stats?.recordFail(opts.channel); } catch { /* yok say */ }
            return { success: false, error: 'Dosya yüklenemedi: ' + up.error };
        }
        mediaId = up.id;
    }

    const tpl = templateFor(opts.channel, mediaId ? media : null);
    const wantTemplate = opts.forceTemplate || cfg.templateMode === 'always';
    const canTemplate = !!tpl;

    const post = (payload) => (viaVega()
        ? vega('/v1/wa/send', { method: 'POST', json: { phoneNumberId: cfg.phoneNumberId || undefined, message: payload } })
        : graph(`/${cfg.apiVersion}/${encodeURIComponent(cfg.phoneNumberId)}/messages`, { method: 'POST', json: payload }));
    const sendTemplate = () => {
        if (mediaId && !tpl.docHeader) deps.log(`cloud: "${tpl.name}" şablonunda belge başlığı yok, ek gönderilmedi (${to})`);
        return post(buildTemplatePayload(to, text, mediaId, media || {}, opts, tpl));
    };

    try {
        let res;
        if (wantTemplate && canTemplate) {
            res = await sendTemplate();
        } else {
            res = await post(mediaId ? buildMediaPayload(to, text, media, mediaId) : buildTextPayload(to, text));
            // 24 saat penceresi kapalıysa serbest metin reddedilir → onaylı şablona düş.
            if (res.status !== 200 && isReengagementError(res) && canTemplate) {
                deps.log(`cloud: 24s penceresi kapalı, "${tpl.name}" şablonuna düşülüyor (${to})`);
                res = await sendTemplate();
            }
        }

        if (res.status === 200 && res.json && res.json.messages && res.json.messages[0]) {
            const id = res.json.messages[0].id;
            try { deps.stats?.recordSent({ id, phone: to, channel: opts.channel }); } catch { /* yok say */ }
            deps.log(`cloud send-ok via=${cfg.via} to=${to} id=${id}`);
            return { success: true, id };
        }
        const err = describeError(res);
        try { deps.stats?.recordFail(opts.channel); } catch { /* yok say */ }
        deps.log(`cloud send-fail via=${cfg.via} to=${to} err=${err}`);
        return { success: false, error: err };
    } catch (e) {
        try { deps.stats?.recordFail(opts.channel); } catch { /* yok say */ }
        deps.log(`cloud send-fail via=${cfg.via} to=${to} err=${e.message}`);
        return { success: false, error: unreachable() + e.message };
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
    const via = viaVega() ? ' · Vega sunucusu üzerinden' : '';
    if (!testPhone) {
        return {
            success: true,
            message: `✓ Bağlandı: ${st.cloud.displayPhone || st.me}${st.cloud.name ? ' (' + st.cloud.name + ')' : ''}` +
                `${st.cloud.quality ? ' · kalite: ' + st.cloud.quality : ''}${st.cloud.tier ? ' · kademe: ' + st.cloud.tier : ''}${via}`,
            info: st.cloud,
        };
    }
    const r = await sendMessage(testPhone, 'Vega WhatsApp — Cloud API test mesajı.', null, { channel: 'manual' });
    return r.success
        ? { success: true, message: `✓ Test mesajı gönderildi${via}.`, info: st.cloud }
        : { success: false, message: 'Bağlantı tamam ama gönderim başarısız: ' + r.error, info: st.cloud };
}

// ─── Vega sunucusu uçları: gelen kutusu, numara bağlama, şablonlar ──────────
// Hepsi lisans imzasıyla kimliklenir. Gelen kutusu yalnız 'vega' yolu seçiliyken
// yoklanır; bağlama ve şablon ekranı mod henüz kaydedilmeden de çalışır (kullanıcı
// önce numarasını bağlar, sonra modu seçer).

async function pullInbox(limit = 50) {
    if (!viaVega()) return { ok: false, error: 'Gelen kutusu yalnız "Vega sunucusu üzerinden" bağlantıda çalışır.' };
    try {
        const r = await vega(`/v1/wa/inbox?limit=${encodeURIComponent(limit)}`, { timeoutMs: 30_000 });
        if (r.status === 200 && r.json && Array.isArray(r.json.events)) return { ok: true, events: r.json.events, more: !!r.json.more };
        return { ok: false, error: describeError(r) };
    } catch (e) { return { ok: false, error: unreachable() + e.message }; }
}

async function ackInbox(ids) {
    try {
        const r = await vega('/v1/wa/ack', { method: 'POST', json: { ids }, timeoutMs: 30_000 });
        return r.status === 200 ? { ok: true } : { ok: false, error: describeError(r) };
    } catch (e) { return { ok: false, error: unreachable() + e.message }; }
}

// Embedded Signup bileti: 30 dk geçerli bağlama sayfası adresi.
async function onboardTicket() {
    try {
        const r = await vega('/v1/wa/onboard/ticket', { method: 'POST', timeoutMs: 20_000 });
        if (r.status === 200 && r.json && r.json.url) return { ok: true, url: String(r.json.url), expiresIn: r.json.expiresIn || 0 };
        return { ok: false, error: describeError(r) };
    } catch (e) { return { ok: false, error: unreachable() + e.message }; }
}

// Şablon işlemlerinde Meta'nın kullanıcıya dönük açıklaması (error_user_msg) kod
// çevirisinden değerlidir: "değişken metnin sonunda olamaz" gibi tam sebebi söyler.
function templateError(r) {
    const e = r && r.json && r.json.error;
    if (e && typeof e === 'object' && (e.error_user_msg || e.error_user_title)) {
        return `${e.error_user_title ? e.error_user_title + ': ' : ''}${e.error_user_msg || ''} [kod ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''}]`;
    }
    return describeError(r);
}

async function listTemplates() {
    try {
        const r = await vega('/v1/wa/templates' + pnidQuery(), { timeoutMs: 30_000 });
        if (r.status !== 200 || !r.json || !Array.isArray(r.json.data)) return { ok: false, error: templateError(r) };
        const templates = r.json.data.map((t) => {
            const body = (t.components || []).find((c) => c.type === 'BODY');
            const header = (t.components || []).find((c) => c.type === 'HEADER');
            return {
                name: t.name, status: t.status, language: t.language, category: t.category,
                body: (body && body.text) || '', header: (header && header.format) || '',
                rejected: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : '',
            };
        });
        return { ok: true, templates };
    } catch (e) { return { ok: false, error: unreachable() + e.message }; }
}

// Kullanıcının formundan Meta şablon gövdesi. Meta'nın sık reddettiği biçimleri
// göndermeden yakala: değişkenle başlayan/biten metin, atlanan numara ({{1}} {{3}}).
function buildTemplateDraft(input = {}) {
    const name = String(input.name || '').trim();
    const category = String(input.category || 'UTILITY').trim().toUpperCase();
    const language = String(input.language || 'tr').trim() || 'tr';
    const text = String(input.body || '').trim();

    if (!/^[a-z0-9_]{1,512}$/.test(name)) return { error: 'Şablon adı yalnız küçük harf, rakam ve alt çizgi içerebilir (ör. hesap_bakiye_bildirimi).' };
    if (!['UTILITY', 'MARKETING'].includes(category)) return { error: 'Kategori Hizmet (UTILITY) ya da Pazarlama (MARKETING) olmalı.' };
    if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) return { error: 'Dil kodu geçersiz (ör. tr, en_US).' };
    if (!text) return { error: 'Şablon metni boş olamaz.' };
    if (text.length > 1024) return { error: 'Şablon metni en fazla 1024 karakter olabilir.' };
    if (/^\{\{\s*\d+\s*\}\}/.test(text) || /\{\{\s*\d+\s*\}\}[.!?…\s]*$/.test(text)) {
        return { error: 'Metin değişkenle ({{1}}) başlayamaz ya da bitemez — önüne ve arkasına sabit metin ekleyin.' };
    }

    const nums = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
    const count = nums.length ? Math.max(...nums) : 0;
    for (let i = 1; i <= count; i++) {
        if (!nums.includes(i)) return { error: `Değişkenler 1'den başlayıp sırayla gitmeli — {{${i}}} eksik.` };
    }
    const examples = (Array.isArray(input.examples) ? input.examples : [])
        .map((s) => toParam(s)).filter(Boolean);
    while (examples.length < count) examples.push(`örnek ${examples.length + 1}`);

    const bodyComp = { type: 'BODY', text };
    if (count) bodyComp.example = { body_text: [examples.slice(0, count)] };
    return { template: { name, language, category, components: [bodyComp] }, variableCount: count };
}

async function createTemplate(template) {
    try {
        const r = await vega('/v1/wa/templates', {
            method: 'POST', timeoutMs: 30_000,
            json: { phoneNumberId: (cfg && cfg.phoneNumberId) || undefined, template },
        });
        if (r.status === 200 && r.json && r.json.id) return { ok: true, id: r.json.id, status: r.json.status || '', category: r.json.category || '' };
        return { ok: false, error: templateError(r) };
    } catch (e) { return { ok: false, error: unreachable() + e.message }; }
}

// Belge başlıklı şablonun Meta'ya gösterilecek örneği — bağımlılıksız, elle kurulmuş
// tek sayfalık PDF (xref ofsetleri hesaplanır; yalnız ASCII).
function samplePdf() {
    const content = 'BT /F1 18 Tf 72 770 Td (Ornek belge - Vega WhatsApp) Tj ET';
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let out = '%PDF-1.4\n';
    const offsets = objs.map((o, i) => {
        const at = out.length;
        out += `${i + 1} 0 obj\n${o}\nendobj\n`;
        return at;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
        offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('') +
        `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

async function uploadTemplateSample() {
    try {
        const r = await vega('/v1/wa/templates/sample' + pnidQuery(), {
            method: 'POST', body: samplePdf(), contentType: 'application/pdf',
            headers: { 'X-File-Name': 'ornek-belge.pdf' }, timeoutMs: 60_000,
        });
        if (r.status === 200 && r.json && r.json.handle) return { ok: true, handle: r.json.handle };
        return { ok: false, error: templateError(r) };
    } catch (e) { return { ok: false, error: unreachable() + e.message }; }
}

// Standart şablon setini bu WABA'da tamamla: olanlara dokunma, eksikleri Meta onayına
// gönder. Müşteri numarasını bağladıktan sonra bir kez çalıştırılır; tekrar güvenli.
async function ensureStandardTemplates() {
    const l = await listTemplates();
    if (!l.ok) return { ok: false, error: l.error };
    const have = new Map(l.templates.map((t) => [`${t.name}|${t.language}`, t]));
    const results = [];
    for (const s of STANDARD_TEMPLATES) {
        const ex = have.get(`${s.name}|tr`);
        if (ex) { results.push({ name: s.name, label: s.label, status: ex.status, existed: true }); continue; }

        const draft = buildTemplateDraft({ name: s.name, category: s.category, language: 'tr', body: s.body, examples: [s.example] });
        if (draft.error) { results.push({ name: s.name, label: s.label, error: draft.error }); continue; }
        if (s.header === 'DOCUMENT') {
            const up = await uploadTemplateSample();
            if (!up.ok) { results.push({ name: s.name, label: s.label, error: 'Örnek belge yüklenemedi: ' + up.error }); continue; }
            draft.template.components.unshift({ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [up.handle] } });
        }
        const r = await createTemplate(draft.template);
        results.push(r.ok
            ? { name: s.name, label: s.label, status: r.status, category: r.category, created: true }
            : { name: s.name, label: s.label, error: r.error });
    }
    return { ok: true, results };
}

module.exports = {
    configure,
    setConfig,
    isConfigured,
    viaVega,
    STANDARD_TEMPLATES,
    templateFor,
    samplePdf,
    ensureStandardTemplates,
    getStatus,
    refreshStatus,
    sendMessage,
    deleteMessage,
    checkOnWhatsApp,
    test,
    pullInbox,
    ackInbox,
    onboardTicket,
    listTemplates,
    buildTemplateDraft,
    createTemplate,
    DEFAULT_API_VERSION,
};
