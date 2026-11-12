// ─── Legacy duman testi: Electron 22 (Node 16) içinde kritik parçalar ────────
// Çalıştır:  npm run test:legacy
// İsteğe bağlı SQL denemesi: SMOKE_SQL_SERVER, SMOKE_SQL_USER, SMOKE_SQL_PASSWORD
// ortam değişkenleri verilirse tedious/mssql ile bağlanıp SELECT @@VERSION yapılır.
// Gerçek WhatsApp oturumuna DOKUNMAZ: geçici klasörde yeni oturum açıp yalnız QR
// üretilene kadar bekler, sonra kapatır (eşleştirme yapılmaz).
const path = require('path');
const os = require('os');
const fs = require('fs');
require(path.join(__dirname, '..', 'server', 'node16-shim.js'));
const { app, BrowserWindow } = require('electron');
// Uygulamadaki gibi: gizli PDF penceresi kapanınca Electron kendini kapatmasın.
app.on('window-all-closed', () => { /* çıkma */ });

const results = [];
// SMOKE_ONLY="v6,pdfkit" → yalnız adında bu parçalardan biri geçen kontroller
const ONLY = (process.env.SMOKE_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const check = async (name, fn) => {
    if (ONLY.length && !ONLY.some((o) => name.includes(o))) return;
    const t = Date.now();
    let r;
    try { const info = await fn(); r = { name, ok: true, info: info || '', ms: Date.now() - t }; }
    catch (e) { r = { name, ok: false, info: e && e.message, ms: Date.now() - t }; }
    results.push(r);
    console.log(`${r.ok ? 'GEÇTİ ' : 'HATA  '} ${r.name}  (${r.ms} ms)  ${r.info}`);
};
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: ${ms / 1000} sn zaman aşımı`)), ms))]);

async function qrFor(file) {
    const B = require(path.join(__dirname, '..', 'server', 'vendor', file));
    const makeWASocket = B.default || B.makeWASocket;
    const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-legacy-smoke-'));
    const { state } = await B.useMultiFileAuthState(authDir);
    const { version } = await B.fetchLatestBaileysVersion();
    const silent = { level: 'silent', child() { return silent; }, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };
    const sock = makeWASocket({ version, auth: state, logger: silent, printQRInTerminal: false, browser: ['Vega Smoke', 'Chrome', '120.0'] });
    try {
        const qr = await withTimeout(new Promise((resolve, reject) => {
            sock.ev.on('connection.update', (u) => {
                if (u.qr) resolve(u.qr);
                if (u.connection === 'close') reject(new Error((u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.message) || 'bağlantı kapandı'));
            });
        }), 45000, file);
        return `QR ${qr.length} karakter, WA ${version.join('.')}`;
    } finally {
        try { sock.end(undefined); } catch { /* yok say */ }
        try { sock.ws && sock.ws.close && sock.ws.close(); } catch { /* yok say */ }
        fs.rmSync(authDir, { recursive: true, force: true });
    }
}

app.whenReady().then(async () => {
    await check('Electron / Node sürümü', async () => {
        if (!process.versions.electron.startsWith('22.')) throw new Error(`Electron 22 bekleniyordu: ${process.versions.electron}`);
        return `Electron ${process.versions.electron}, Node ${process.versions.node}, Chromium ${process.versions.chrome}`;
    });
    await check('HKDF (boş anahtar)', async () => {
        const subtle = globalThis.crypto.subtle;
        const key = await subtle.importKey('raw', new Uint8Array(0), { name: 'HKDF' }, false, ['deriveBits']);
        const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new Uint8Array(0) }, key, 256);
        // RFC 5869 boş IKM/tuz/info için SHA-256 HKDF ilk 32 bayt
        const hex = Buffer.from(bits).toString('hex');
        if (hex !== 'eb70f01dede9afafa449eee1b1286504e1f62388b3f7dd4f956697b0e828fe18') throw new Error(`beklenmeyen çıktı ${hex}`);
        return 'RFC 5869 ile aynı';
    });
    await check('Baileys v6 → QR', () => qrFor('baileys-v6.cjs'));
    await check('Baileys v7 → QR', () => qrFor('baileys-v7.cjs'));
    await check('express + qrcode + multer + cors', async () => {
        for (const m of ['express', 'qrcode', 'multer', 'cors', 'electron-updater']) require(m);
        const png = await require('qrcode').toDataURL('vega');
        return `qrcode ${png.length} bayt`;
    });
    await check('pdfkit (Arial ile ekstre fontu)', () => new Promise((resolve, reject) => {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(`PDF ${Buffer.concat(chunks).length} bayt`));
        doc.on('error', reject);
        doc.registerFont('arial', fs.readFileSync(path.join(__dirname, '..', 'server', 'assets', 'arial.ttf')));
        doc.font('arial').fontSize(12).text('Hesap Ekstresi — ğüşıöç ĞÜŞİÖÇ 1.234,56 ₺');
        doc.end();
    }));
    await check('Electron printToPDF (e-Fatura yolu)', async () => {
        const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
        try {
            await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<h1>e-Fatura</h1><p>ğüşıöç</p>'));
            const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
            return `PDF ${pdf.length} bayt`;
        } finally { win.destroy(); }
    });
    if (process.env.SMOKE_SQL_SERVER) {
        await check('mssql / tedious bağlantısı', async () => {
            const sql = require('mssql');
            const pool = await sql.connect({
                server: process.env.SMOKE_SQL_SERVER, user: process.env.SMOKE_SQL_USER || 'sa', password: process.env.SMOKE_SQL_PASSWORD || '',
                options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 10000,
            });
            try { const r = await pool.request().query('SELECT @@VERSION AS v'); return String(r.recordset[0].v).split('\n')[0].trim(); }
            finally { await pool.close(); }
        });
    }

    const failed = results.filter((r) => !r.ok).length;
    console.log(failed ? `\n${failed} kontrol başarısız.` : '\nTüm kontroller geçti.');
    process.exit(failed ? 1 : 0);
});
