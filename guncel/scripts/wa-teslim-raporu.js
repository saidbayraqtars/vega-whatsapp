// ─── wa-events.log teslim raporu (canlı motor testi için) ───────────────────────
// Programın gönderdiği her mesaj için (send-ok id=...) gelen en yüksek alındıyı
// bulur ve motor bölümlerine ayırır: 2 = WhatsApp sunucusu aldı, 3 = karşı telefona
// ulaştı, 4 = okundu. "Mesaj bekleniyor" sorununda gönderimler 2'de kalır ve
// alındılar @lid adresiyle gelir (bkz. Ekmel Çeyiz 2026-10).
//
// Kullanım: node scripts/wa-teslim-raporu.js <wa-events.log> [--son 20]
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('Kullanım: node scripts/wa-teslim-raporu.js <wa-events.log> [--son 20]'); process.exit(2); }
const sonIdx = process.argv.indexOf('--son');
const son = sonIdx > 0 ? Number(process.argv[sonIdx + 1]) || 20 : 20;

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const sends = [];            // { at, engine, to, id }
const acks = new Map();      // id → { best, lid }
// Hesap başına motor (çok hesapta satırlar [main], [a2] … ile başlar). Eski günlüklerde
// "engine=" yazmaz → 6.7 sayılır.
const engineOf = new Map();
const opens = [];

for (const line of lines) {
    const at = line.slice(0, 24);
    const acct = (line.match(/^\S+ \[([^\]]+)\]/) || [])[1] || 'main';
    let m = line.match(/ open (\S*) engine=(v\d)/) || line.match(/ open (\S*)\s*$/);
    if (m) { engineOf.set(acct, m[2] || 'v6?'); opens.push({ at, me: m[1], engine: engineOf.get(acct) }); continue; }
    if ((m = line.match(/send-ok to=(\d+) id=(\S+)/)) && m[2] !== 'YOK') {
        const s = { at, engine: engineOf.get(acct) || 'v6?', to: m[1], id: m[2] };
        sends.push(s);
        continue;
    }
    if ((m = line.match(/ack id=(\S+) to=(\S+) status=(\d+)/))) {
        const a = acks.get(m[1]) || { best: 0, lid: false };
        a.best = Math.max(a.best, Number(m[3]));
        if (m[2].endsWith('@lid')) a.lid = true;
        acks.set(m[1], a);
    }
}

const ozet = (list) => {
    const r = { gonderim: list.length, sunucu: 0, teslim: 0, okundu: 0, alindiYok: 0, lidAlindi: 0 };
    for (const s of list) {
        const a = acks.get(s.id);
        if (!a) { r.alindiYok++; continue; }
        if (a.lid) r.lidAlindi++;
        if (a.best >= 4) r.okundu++;
        if (a.best >= 3) r.teslim++;
        else if (a.best >= 2) r.sunucu++;
    }
    r.teslimOrani = list.length ? `${Math.round((r.teslim / list.length) * 100)}%` : '-';
    return r;
};

console.log(`Günlük: ${file}`);
console.log(`Bağlantı açılışları: ${opens.length} (son: ${opens.length ? `${opens[opens.length - 1].at} ${opens[opens.length - 1].me} ${opens[opens.length - 1].engine}` : '-'})`);
for (const eng of [...new Set(sends.map((s) => s.engine))]) {
    console.log(`\nMotor ${eng}:`, JSON.stringify(ozet(sends.filter((s) => s.engine === eng))));
}
console.log(`\nSon ${son} gönderim:`);
for (const s of sends.slice(-son)) {
    const a = acks.get(s.id);
    const durum = !a ? 'alındı yok' : a.best >= 4 ? 'okundu' : a.best >= 3 ? 'TESLİM' : a.best >= 2 ? 'sunucuda kaldı' : `status=${a.best}`;
    console.log(`${s.at}  ${s.engine.padEnd(3)}  ${s.to}  ${durum}${a && a.lid ? ' (@lid)' : ''}`);
}
