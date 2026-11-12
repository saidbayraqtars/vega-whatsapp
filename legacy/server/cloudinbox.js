// ═══════════════════════════════════════════════════════════════════════════
//  Cloud API gelen kutusu — Vega sunucusundan (vega-kontor Worker) yoklama
// ═══════════════════════════════════════════════════════════════════════════
//  Meta'nın webhook'u Worker'a düşer (bu PC'de açık port/tünel yok). Worker
//  olayları lisansın donanım kimliğine göre biriktirir; bu modül 15 sn'de bir
//  çeker, işler ve /v1/wa/ack ile kapatır. Kapatılmayan olay tekrar gelir.
//
//  • Mesaj → stats.onIncoming + AI oto-yanıt (Baileys gelen mesajıyla aynı yol).
//  • Durum → stats.onAck (Pano teslim/okundu sayacı).
//  • ESKİ MESAJA AI CEVAP YAZMAZ. Numara eşlemesi geç yapıldıysa ya da PC kapalı
//    kaldıysa saatler önceki mesaj gelir; bot o an cevap yazarsa müşteri sabah
//    yazdığı şikayete öğleden sonra "Merhaba, nasıl yardımcı olabilirim" görür.
//    Böyle mesajlar yalnız listede kalır, ekip kendisi döner.
//  • Son mesajlar data/cloud-inbox.json'da (7 gün, en fazla 300). Cloud modda
//    numara telefondaki WhatsApp uygulamasında açık olmayabilir — gelen mesajı
//    görecek tek yer burası.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { normalizePhone } = require('./phone');

const POLL_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const PULL_LIMIT = 50;
const MAX_ROUNDS = 10;                 // tek yoklamada en fazla 10 × 50 olay
const AI_MAX_AGE_MS = 10 * 60_000;
const KEEP_MS = 7 * 24 * 3600_000;
const KEEP_MAX = 300;
const SEEN_MAX = 2000;

// pull(limit) -> { ok, events, more, error }   ack(ids) -> { ok, error }
// onMessage({ phone, text, name, id, type, at, forAi })   onStatus({ id, status, code, phone, errors })
let deps = { pull: null, ack: null, onMessage: null, onStatus: null, log: () => { } };
let storePath = null;
let messages = [];                     // en yeni başta
const seen = new Set();                // işlenmiş olay id'leri — ack düşerse tekrar işlenmesin
let timer = null;
let running = false;
let busy = false;
let delayMs = POLL_MS;
let lastPollAt = 0;
let lastError = null;

function configure(d = {}) {
    deps = { ...deps, ...d };
    if (d.dataDir) {
        storePath = path.join(d.dataDir, 'cloud-inbox.json');
        load();
    }
}

function load() {
    try {
        const j = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        messages = Array.isArray(j.messages) ? j.messages : [];
    } catch { messages = []; }
    prune();
}

function save() {
    if (!storePath) return;
    try {
        fs.mkdirSync(path.dirname(storePath), { recursive: true });
        fs.writeFileSync(storePath, JSON.stringify({ messages }), 'utf8');
    } catch (e) { deps.log('gelen kutusu diske yazılamadı: ' + e.message); }
}

function prune() {
    const limit = Date.now() - KEEP_MS;
    messages = messages.filter((m) => (m.at || 0) >= limit).slice(0, KEEP_MAX);
}

function remember(id) {
    seen.add(id);
    if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value);
}

// Meta mesaj nesnesi → okunabilir metin. AI'ya yalnız gerçek metin (ya da düğme/
// liste seçimi, açıklamalı medya) gider; ses/çıkartma/konum gibi türler listede
// yer tutucuyla görünür.
function messageText(m) {
    const cap = (o, label) => (o && o.caption ? { text: o.caption, forAi: true } : { text: label, forAi: false });
    switch (m.type) {
        case 'text': return { text: (m.text && m.text.body) || '', forAi: true };
        case 'button': return { text: (m.button && m.button.text) || '', forAi: true };
        case 'interactive': {
            const i = m.interactive || {};
            const t = (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || '';
            return { text: t || '[etkileşim]', forAi: !!t };
        }
        case 'image': return cap(m.image, '[resim]');
        case 'video': return cap(m.video, '[video]');
        case 'document': return cap(m.document, `[belge${m.document && m.document.filename ? ': ' + m.document.filename : ''}]`);
        case 'audio': return { text: '[sesli mesaj]', forAi: false };
        case 'sticker': return { text: '[çıkartma]', forAi: false };
        case 'location': return { text: `[konum${m.location && m.location.name ? ': ' + m.location.name : ''}]`, forAi: false };
        case 'contacts': return { text: '[kişi kartı]', forAi: false };
        case 'reaction': return { text: `[tepki ${(m.reaction && m.reaction.emoji) || ''}]`.trim(), forAi: false };
        default: return { text: `[${m.type || 'bilinmeyen tür'}]`, forAi: false };
    }
}

// Meta durumu → stats.onAck kodu (Baileys ile aynı ölçek: 2 sunucu, 3 teslim, 4 okundu).
const STATUS_CODE = { sent: 2, delivered: 3, read: 4 };

async function handleEvent(ev) {
    const data = ev.data || {};

    if (ev.kind === 'message' && data.msg) {
        const m = data.msg;
        const phone = normalizePhone(m.from);
        const contacts = Array.isArray(data.contacts) ? data.contacts : [];
        const contact = contacts.find((c) => c.wa_id === m.from) || contacts[0] || {};
        const tsMs = Number(m.timestamp) > 0 ? Number(m.timestamp) * 1000 : (Number(ev.at) > 0 ? Number(ev.at) * 1000 : Date.now());
        const { text, forAi } = messageText(m);

        let skip = null;
        if (!phone) skip = 'numara okunamadı';
        else if (!forAi) skip = 'metin değil';
        else if (Date.now() - tsMs > AI_MAX_AGE_MS) skip = 'eski mesaj — AI cevap yazmadı';

        const entry = {
            id: m.id, phone, name: (contact.profile && contact.profile.name) || '',
            text, type: m.type || '', at: tsMs, ai: skip,
        };
        messages = [entry, ...messages.filter((x) => x.id !== entry.id)];
        prune();
        save();

        if (deps.onMessage) {
            await deps.onMessage({ phone, text, name: entry.name, id: m.id, type: entry.type, at: tsMs, forAi: !skip });
        }
        return;
    }

    if (ev.kind === 'status' && data.status) {
        const s = data.status;
        if (s.status === 'failed') {
            const e = (s.errors || [])[0] || {};
            deps.log(`teslim edilemedi → ${s.recipient_id || '?'}: ${e.title || e.message || 'sebep yok'} [kod ${e.code || '?'}]`);
        }
        if (deps.onStatus) {
            deps.onStatus({ id: s.id, status: s.status, code: STATUS_CODE[s.status] || 0, phone: normalizePhone(s.recipient_id), errors: s.errors || [] });
        }
        return;
    }

    if (data.error) {
        deps.log(`Meta hata bildirimi: ${data.error.title || data.error.message || ''} [kod ${data.error.code || '?'}]`);
    }
}

// Tek yoklama turu. İşleyici hatası olayı tekrar ettirmez (AI hatası yüzünden aynı
// mesaja ikinci kez cevap yazılmasın) — yalnız çekme/kapatma hatası geri çekilir.
async function pollOnce() {
    if (busy || !deps.pull || !deps.ack) return { processed: 0, skipped: true };
    busy = true;
    let processed = 0;
    try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
            const r = await deps.pull(PULL_LIMIT);
            if (!r || !r.ok) throw new Error((r && r.error) || 'yanıt yok');
            const events = Array.isArray(r.events) ? r.events : [];
            if (!events.length) break;

            const done = [];
            for (const ev of events) {
                if (!ev || typeof ev.id !== 'string') continue;
                if (!seen.has(ev.id)) {
                    try { await handleEvent(ev); } catch (e) { deps.log(`olay işlenemedi (${ev.id}): ${e.message}`); }
                    remember(ev.id);
                    processed++;
                }
                done.push(ev.id);
            }
            if (done.length) {
                const a = await deps.ack(done);
                if (!a || !a.ok) throw new Error('kapatılamadı: ' + ((a && a.error) || 'yanıt yok'));
            }
            if (!r.more) break;
        }
        lastError = null;
        delayMs = POLL_MS;
    } catch (e) {
        lastError = e.message;
        delayMs = Math.min(delayMs * 2, MAX_BACKOFF_MS);
        deps.log('gelen kutusu yoklanamadı: ' + e.message);
    } finally {
        busy = false;
        lastPollAt = Date.now();
    }
    return { processed };
}

function schedule(ms) {
    if (!running) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
        timer = null;
        await pollOnce();
        schedule(delayMs);
    }, ms);
    timer.unref?.();
}

function start() {
    if (running) return;
    running = true;
    delayMs = POLL_MS;
    deps.log('gelen kutusu yoklaması başladı');
    schedule(1500);
}

function stop() {
    if (!running) return;
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
    deps.log('gelen kutusu yoklaması durdu');
}

const getStatus = () => ({ running, lastPollAt, lastError });
const list = (limit = 100) => { prune(); return messages.slice(0, limit); };

module.exports = { configure, start, stop, pollOnce, getStatus, list, messageText, AI_MAX_AGE_MS };
