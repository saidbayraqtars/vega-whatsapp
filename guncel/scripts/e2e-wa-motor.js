// ─── Uçtan uca test: WhatsApp motoru 6.7 → 7 geçişi (gerçek numarayla) ─────────
// Müşterideki yolu birebir yürür: numara 6.7 (v6) ile eşlenir ve gönderir, sonra
// motor v7'ye alınır ve oturum SİLİNMEDEN yeniden bağlanır. v7'de teslim alındısı
// (status=3), PDF eki, gelen mesajda numara çözümü (@lid) ve geri çekme denenir.
//
// Çalıştırma (Electron içindeki Node ile, uygulamanın gerçek çalışma ortamı):
//   set ELECTRON_RUN_AS_NODE=1
//   node_modules\electron\dist\electron.exe scripts\e2e-wa-motor.js --target 905xxxxxxxxx
// Seçenekler:
//   --target <numara>  mesajların gideceği telefon (zorunlu; test hattından FARKLI olmalı)
//   --dir <klasör>     test oturum klasörü (varsayılan: %TEMP%\vega-wa-e2e)
//   --fresh            klasörü sil, yeni QR ile başla
//   --keep             sonunda oturumu kapatma (bağlı cihaz kalır)
// QR ve adımlar http://localhost:3198 sayfasında görünür.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const flag = (name) => process.argv.includes(`--${name}`);
const dir = path.resolve(arg('dir') || path.join(os.tmpdir(), 'vega-wa-e2e'));
if (flag('fresh')) fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
process.env.VEGA_BASE_DIR = dir;

const QRCode = require('qrcode');
const { normalizePhone } = require('../server/phone');
const wa = require('../server/whatsapp');

const target = normalizePhone(arg('target') || '');
if (!target) { console.error('HATA: --target <numara> gerekli.'); process.exit(2); }

const authDir = path.join(dir, 'auth');
const eventsPath = path.join(dir, 'data', 'wa-events.log');
const steps = [];
let qrImage = null;
let waiting = '';

const step = (name, ok, detail = '') => {
    steps.push({ name, ok, detail, at: new Date().toLocaleTimeString('tr-TR') });
    console.log(`${ok ? 'GEÇTİ ' : 'KALDI '} ${name}${detail ? ' — ' + detail : ''}`);
};
const note = (t) => { waiting = t; if (t) console.log(`… ${t}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Durum sayfası ─────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
http.createServer((req, res) => {
    const rows = steps.map((s) => `<tr><td>${s.ok ? '✅' : '❌'}</td><td>${esc(s.name)}</td><td>${esc(s.detail)}</td><td>${s.at}</td></tr>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2">
<title>WA motor E2E</title><body style="font-family:system-ui;max-width:760px;margin:24px auto;padding:0 16px">
<h2>WhatsApp motoru uçtan uca test</h2><p>Hedef: <b>${esc(target)}</b> · motor: <b>${esc(wa.getEngine())}</b></p>
${waiting ? `<p style="background:#fff4c2;padding:10px">${esc(waiting)}</p>` : ''}
${qrImage ? `<p>Test hattının telefonunda: WhatsApp → Bağlı cihazlar → Cihaz bağla</p><img src="${qrImage}" width="280">` : ''}
<table cellpadding="6" style="border-collapse:collapse">${rows}</table></body>`);
}).listen(3198, () => console.log('Durum sayfası: http://localhost:3198'));

// ─── Yardımcılar ───────────────────────────────────────────────────────────
const s = wa.createSession({ id: 'e2e', authDir });
const incoming = [];
s.setIncomingHandler(async (m) => { incoming.push(m); });

const until = async (fn, ms, every = 500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        const v = await fn();
        if (v) return v;
        await sleep(every);
    }
    return null;
};

const events = () => { try { return fs.readFileSync(eventsPath, 'utf8'); } catch { return ''; } };
const bestAck = (id) => {
    let best = 0;
    for (const m of events().matchAll(new RegExp(`ack id=${id} to=(\\S+) status=(\\d+)`, 'g'))) best = Math.max(best, Number(m[2]));
    return best;
};

// QR gelirse sayfaya koy; açılana kadar bekle. allowQr=false iken QR istenmesi hata sayılır.
const waitOpen = async (ms, allowQr) => {
    let askedQr = false;
    const st = await until(async () => {
        const x = s.getStatus();
        if (x.hasQr) {
            askedQr = true;
            if (!allowQr) return x;
            qrImage = await QRCode.toDataURL(x.qr, { margin: 2, width: 280 });
        } else qrImage = null;
        return x.ready ? x : (x.error && /403|iptal/i.test(x.error) ? x : null);
    }, ms);
    qrImage = null;
    return { st: st || s.getStatus(), askedQr };
};

const sendAndAck = async (label, text, media) => {
    const r = await s.sendMessage(target, text, media);
    if (!r.success) { step(label, false, r.error); return null; }
    note(`${label}: teslim alındısı bekleniyor (en çok 90 sn)`);
    const ack = await until(async () => { const a = bestAck(r.id); return a >= 3 ? a : 0; }, 90_000, 1000);
    note('');
    step(label, !!ack, ack ? `id=${r.id} status=${ack}${ack === 4 ? ' (okundu)' : ' (teslim)'}` : `id=${r.id} en yüksek status=${bestAck(r.id)} — teslim olmadı`);
    return ack ? r.id : null;
};

// En küçük geçerli PDF (tek boş sayfa + metin).
const tinyPdf = () => {
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        null,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    const stream = 'BT /F1 18 Tf 24 70 Td (Vega E2E PDF) Tj ET';
    objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    let out = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
};

// ─── Senaryo ───────────────────────────────────────────────────────────────
(async () => {
    const markPath = path.join(authDir, '.engine');
    const paired = fs.existsSync(path.join(authDir, 'creds.json'));
    const prevEngine = fs.existsSync(markPath) ? fs.readFileSync(markPath, 'utf8').trim() : 'v6';
    const startEngine = paired ? prevEngine : 'v6';
    wa.setEngine(startEngine);
    console.log(`Klasör: ${dir}\nBaşlangıç motoru: ${startEngine}${paired ? ' (önceki eşleşme)' : ' (yeni eşleşme)'}`);

    // 1) Bağlan (yeni eşleşmede QR okut)
    s.initialize();
    note(paired ? 'Kayıtlı oturumla bağlanılıyor' : 'QR okutun (sayfada) — 3 dk');
    let { st } = await waitOpen(180_000, true);
    note('');
    if (!st.ready) { step(`${startEngine} bağlantı`, false, st.error || 'açılmadı'); return finish(); }
    step(`${startEngine} bağlantı`, true, st.me);

    // 2) v6'da bir mesaj (müşterinin geçiş öncesi durumu: PN oturumu oluşur)
    if (startEngine === 'v6') {
        await sendAndAck('v6 metin gönderimi', `Vega E2E 1/4 — eski motor (v6) ${new Date().toLocaleTimeString('tr-TR')}`);
        // 3) Motor değişimi: oturum silinmeden v7 ile yeniden bağlan, QR istememeli
        wa.setEngine('v7');
        await s.restart();
        ({ st } = await waitOpen(90_000, false));
        const qrAsked = s.getStatus().hasQr;
        step('v6 → v7 geçişi QR istemeden açıldı', st.ready && !qrAsked, st.ready ? `${st.me} engine=${st.engine}` : (qrAsked ? 'QR istedi!' : st.error || 'açılmadı'));
        step('v6 oturum yedeği alındı', fs.existsSync(path.join(`${authDir}-v6-yedek`, 'creds.json')));
        if (!st.ready) return finish();
    }

    // 4) v7: numara sorgusu, metin, PDF
    const chk = await s.checkOnWhatsApp(target);
    step('v7 numara sorgusu (onWhatsApp)', !!chk.exists, chk.exists ? (chk.jid || '') : (chk.error || 'yok'));
    const textId = await sendAndAck('v7 metin gönderimi', `Vega E2E 2/4 — yeni motor (v7) ${new Date().toLocaleTimeString('tr-TR')}`);
    await sendAndAck('v7 PDF gönderimi', 'Vega E2E 3/4 — PDF eki', { kind: 'document', buffer: tinyPdf(), mimetype: 'application/pdf', fileName: 'vega-e2e.pdf' });

    // 5) Gelen mesaj: numara doğru çözülüyor mu (@lid → telefon)
    const before = incoming.length;
    note(`Hedef telefondan (${target}) test hattına bir mesaj yazın — 3 dk`);
    const got = await until(async () => incoming.slice(before).find((m) => m.text), 180_000);
    note('');
    step('v7 gelen mesaj numarası çözüldü', !!got && got.phone === target,
        got ? `phone=${got.phone} jid=${got.jid}` : 'mesaj gelmedi (wa-events.log: incoming-nopn?)');

    // 6) Geri çekme
    if (textId) {
        const d = await s.deleteMessage(target, textId);
        step('v7 geri çekme (herkesten sil)', !!d.success, d.error || 'hedef telefonda "Bu mesaj silindi" görünmeli');
    }

    // 7) Uygulama yeniden açılışı: v7 oturumu QR istemeden geri gelmeli
    await s.restart();
    ({ st } = await waitOpen(90_000, false));
    step('v7 yeniden açılış QR istemedi', st.ready && !s.getStatus().hasQr, st.ready ? st.me : (st.error || 'açılmadı'));
    if (st.ready) await sendAndAck('v7 yeniden açılış sonrası gönderim', `Vega E2E 4/4 — yeniden açılış sonrası ${new Date().toLocaleTimeString('tr-TR')}`);

    finish();
})().catch((e) => { step('beklenmeyen hata', false, e.stack || e.message); finish(); });

async function finish() {
    const failed = steps.filter((x) => !x.ok).length;
    console.log(`\nSONUÇ: ${steps.length - failed}/${steps.length} adım geçti.`);
    fs.writeFileSync(path.join(dir, 'e2e-sonuc.json'), JSON.stringify({ at: new Date().toISOString(), target, steps }, null, 2));
    note(failed ? `${failed} adım kaldı — ayrıntı: ${eventsPath}` : 'Tüm adımlar geçti.');
    if (!flag('keep')) { try { await s.logout(); } catch { /* yok say */ } }
    await sleep(4000); // sayfa son durumu göstersin
    process.exit(failed ? 1 : 0);
}
