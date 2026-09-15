'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  DUR listesi — toplu mesajdan çıkmak isteyen numaralar
//
//  Müşteri tek kelime "DUR" (ya da STOP) yazınca numarası listeye girer, toplu
//  gönderim onu atlar; "BAŞLA" yazınca listeden çıkar. Liste yerel: data/optout.json.
//
//  Neden: istemediği mesajı alan kişi "engelle / şikayet et"e basar — Baileys
//  hattında ban sinyalinin en büyüğü. Çıkış yolu gösterip ona uymak şikayeti azaltır.
//  Yalnız TOPLU mesaj listesidir: belge bildirimi, hatırlatma, ekstre etkilenmez.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const STOP_WORDS = new Set(['DUR', 'STOP']);
const START_WORDS = new Set(['BAŞLA', 'BASLA', 'START']);
const MAX_ENTRIES = 50000;

const FOOTER = 'Bu tür mesajları almak istemiyorsanız DUR yazabilirsiniz.';
const REPLY = {
    stop: 'Toplu bilgilendirme listemizden çıkarıldınız. Tekrar almak isterseniz BAŞLA yazabilirsiniz.',
    start: 'Toplu bilgilendirme listemize yeniden eklendiniz. Çıkmak için DUR yazabilirsiniz.',
};

let file = null;
let normalize = (p) => String(p || '').replace(/\D/g, '') || null;
let phones = {};   // numara → { at, text, source }

function configure({ dataDir, normalizePhone } = {}) {
    if (typeof normalizePhone === 'function') normalize = (p) => normalizePhone(p) || null;
    if (dataDir) {
        file = path.join(dataDir, 'optout.json');
        load();
    }
}

function load() {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        phones = j && j.phones && typeof j.phones === 'object' ? j.phones : {};
    } catch {
        phones = {};
    }
}

function save() {
    if (!file) return;
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ phones }, null, 1));
        fs.renameSync(tmp, file);
    } catch (e) {
        console.error('[DUR] liste yazılamadı:', e.message);
    }
}

// Yalnız TEK KELİMELİK mesaj komuttur: "dur", "DUR.", "Dur!" → stop.
// Cümle içindeki "dur" sayılmaz ("biraz dur bakayım" sohbettir, listeden çıkarmak yanlış olur).
function classify(text) {
    const n = String(text || '').toLocaleUpperCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (STOP_WORDS.has(n)) return 'stop';
    if (START_WORDS.has(n)) return 'start';
    return null;
}

function has(phone) {
    const k = normalize(phone);
    return !!(k && phones[k]);
}

function add(phone, { text = '', source = 'manual' } = {}) {
    const k = normalize(phone);
    if (!k || phones[k]) return false;
    if (Object.keys(phones).length >= MAX_ENTRIES) return false;
    phones[k] = { at: Date.now(), text: String(text || '').slice(0, 60), source };
    save();
    return true;
}

function remove(phone) {
    const k = normalize(phone);
    if (!k || !phones[k]) return false;
    delete phones[k];
    save();
    return true;
}

function list() {
    return Object.entries(phones)
        .map(([phone, v]) => ({ phone, ...v }))
        .sort((a, b) => b.at - a.at);
}

const count = () => Object.keys(phones).length;

/**
 * Gelen mesaj komutsa işler: { action:'stop'|'start', changed } — bu mesaj AI bota GİTMEZ.
 * Komut değilse null. Listede olmayan birinin "başla" demesi sohbettir → null.
 */
function handleIncoming(phone, text) {
    const action = classify(text);
    if (action === 'stop') return { action, changed: add(phone, { text, source: 'whatsapp' }) };
    if (action === 'start' && has(phone)) return { action, changed: remove(phone) };
    return null;
}

module.exports = { configure, classify, has, add, remove, list, count, handleIncoming, FOOTER, REPLY };
