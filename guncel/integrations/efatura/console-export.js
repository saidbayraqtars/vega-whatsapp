// Vega'nin resmi console araci UBL'yi ERP'den olusturur. Ilk arguman BELGENO
// degil sayisal TBLSATFATBASLIK.IND'dir; ikinci arguman her iki fatura turunde
// de "einvoice" olur. Sonucun belge numarasi ayrica XML icinde dogrulanir.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');

const EXE = 'vega.earsiv.console.exe';
let serial = Promise.resolve();

function atomicJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value), 'utf8');
    fs.renameSync(tmp, file);
}

function listDumpFiles(tempDir) {
    try {
        return new Map(fs.readdirSync(tempDir)
            .filter(n => /_dump\.xml$/i.test(n))
            .map(n => {
                const file = path.join(tempDir, n);
                const s = fs.statSync(file);
                return [file, `${s.size}:${s.mtimeMs}`];
            }));
    } catch { return new Map(); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForXml(tempDir, before, startedAt, timeoutMs, expectedBelgeNo, expectedUuid) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const [file, sig] of listDumpFiles(tempDir)) {
            if (before.get(file) === sig) continue;
            let st;
            try { st = fs.statSync(file); } catch { continue; }
            if (!st.size || st.mtimeMs < startedAt - 2000) continue;
            let xml;
            try { xml = fs.readFileSync(file, 'utf8'); } catch { continue; }
            if (!expectedBelgeNo || matchesInvoice(xml, expectedBelgeNo, expectedUuid)) return { file, xml };
        }
        await sleep(300);
    }
    throw new Error(`Vega UBL ${Math.round(timeoutMs / 1000)} sn icinde uretilmedi`);
}

// Gorev yukseltilmemis calisirsa Windows, requireAdministrator manifestli Vega
// konsolunu baslatmayi reddeder ve mesaj "islem kullanici tarafindan iptal
// edildi" (hata 1223) olur. Kullaniciya ne yapacagini soyleyen metne cevir.
function friendlyTaskError(message) {
    const raw = String(message || '').trim();
    if (/iptal edildi|cancell?ed|1223|elevat|yetki/i.test(raw)) {
        return 'Vega konsolu yonetici yetkisiyle baslatilamadi (gorev yukseltilmemis calisiyor). '
            + 'integrations\\efatura\\tools\\setup-task.cmd dosyasini yonetici olarak bir kez calistirin.';
    }
    return raw || 'Vega export gorevi basarisiz';
}

// Zaman asiminda gec yazilan done dosyalari birikir; her istekten once eskileri
// temizle ki klasor sismesin ve karisiklik olmasin.
function cleanStaleDoneFiles(requestsDir, maxAgeMs = 600000) {
    try {
        for (const name of fs.readdirSync(requestsDir)) {
            if (!/^done-.*.json$/i.test(name)) continue;
            const file = path.join(requestsDir, name);
            try { if (Date.now() - fs.statSync(file).mtimeMs > maxAgeMs) fs.unlinkSync(file); } catch { /* baskasi silmis */ }
        }
    } catch { /* klasor yok */ }
}

// Kok Invoice'in kendi alanlari (ID, UUID) ilk cac: blogundan once gelir. Sonrasi
// AdditionalDocumentReference/party/satir ID'leridir; onlari okumamak icin kes.
function invoiceHead(xml) {
    const s = String(xml || '');
    const i = s.search(/<cac:/i);
    return i < 0 ? s : s.slice(0, i);
}

function invoiceId(xml) {
    // Bazi firmalarda Vega numarayi GIB'e gonderirken verir; dump'ta <cbc:ID /> bos gelir.
    const m = invoiceHead(xml).match(/<(?:cbc:)?ID(?:\s[^>]*)?(?:\/>|>([^<]*)<\/(?:cbc:)?ID>)/i);
    return m && m[1] ? m[1].trim() : '';
}

function invoiceUuid(xml) {
    const m = invoiceHead(xml).match(/<(?:cbc:)?UUID(?:\s[^>]*)?>([^<]*)<\/(?:cbc:)?UUID>/i);
    return m ? m[1].trim() : '';
}

// Dump bu faturaya mi ait? Numara varsa numara belirler. Numara bossa ETTN
// (EFATURAUUID) karsilastirilir; ETTN de bilinmiyorsa bu IND icin calistirilan
// konsolun urettigi dosya kabul edilir.
function matchesInvoice(xml, expectedBelgeNo, expectedUuid) {
    const id = invoiceId(xml);
    if (id) return id === expectedBelgeNo;
    const want = String(expectedUuid || '').trim().toLowerCase();
    return !want || invoiceUuid(xml).toLowerCase() === want;
}

// Numarasi bos dump PDF'te "Fatura No" alanini bos birakir; Vega'daki BELGENO'yu yaz.
function fillInvoiceId(xml, belgeNo) {
    const s = String(xml || '');
    const head = invoiceHead(s);
    const filled = head.replace(/<((?:cbc:)?ID)((?:\s+[^\s/>]+)*)\s*(?:\/>|>\s*<\/(?:cbc:)?ID>)/i,
        (_, tag, attrs) => `<${tag}${attrs || ''}>${belgeNo}</${tag}>`);
    return filled + s.slice(head.length);
}

function findConsoleDir(setting) {
    if (setting && setting !== 'auto') {
        const p = path.resolve(setting);
        if (fs.existsSync(path.join(p, EXE))) return p;
        throw new Error(`${EXE} bulunamadi: ${p}`);
    }
    for (const p of ['C:\\eArsiv', 'C:\\EArsiv']) {
        if (fs.existsSync(path.join(p, EXE))) return p;
    }
    throw new Error(`${EXE} bulunamadi. integration.json settings.consoleDir alanini ayarlayin.`);
}

function taskExists(taskName) {
    return new Promise(resolve => execFile('schtasks.exe', ['/Query', '/TN', taskName], { windowsHide: true }, e => resolve(!e)));
}

async function runViaTask({ taskName, dataDir, ind, expectedBelgeNo, expectedUuid, timeoutMs }) {
    const requests = path.join(dataDir, 'requests');
    fs.mkdirSync(requests, { recursive: true });
    cleanStaleDoneFiles(requests);
    const jobId = crypto.randomUUID();
    const requestPath = path.join(requests, 'request.json');
    const donePath = path.join(requests, `done-${jobId}.json`);
    atomicJson(requestPath, {
        jobId, ind: Number(ind), expectedBelgeNo, expectedUuid: expectedUuid || '', requestedAt: new Date().toISOString(),
    });
    await new Promise((resolve, reject) => execFile('schtasks.exe', ['/Run', '/TN', taskName], { windowsHide: true },
        (e, stdout, stderr) => e ? reject(new Error(`yuksek yetkili gorev baslatilamadi: ${(stderr || stdout || e.message).trim()}`)) : resolve()));

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (fs.existsSync(donePath)) {
            const done = JSON.parse(fs.readFileSync(donePath, 'utf8'));
            try { fs.unlinkSync(donePath); } catch { /* kritik degil */ }
            if (!done.ok) throw new Error(friendlyTaskError(done.error));
            const xml = fs.readFileSync(done.xmlPath, 'utf8');
            if (!matchesInvoice(xml, expectedBelgeNo, expectedUuid)) {
                throw new Error(`Vega e-Fatura firma/donem ayari uyusmuyor: beklenen ${expectedBelgeNo}, uretilen ${invoiceId(xml) || `(numarasiz, ETTN ${invoiceUuid(xml) || '?'})`}`);
            }
            return { xmlPath: done.xmlPath, xml, mode: 'task' };
        }
        await sleep(350);
    }
    throw new Error(`yuksek yetkili Vega export gorevi ${Math.round(timeoutMs / 1000)} sn icinde bitmedi`
        + ' (gorev yonetici yetkisiyle kayitli degilse tools\\setup-task.cmd dosyasini yonetici olarak calistirin)');
}

async function runDirect({ consoleDir, ind, expectedBelgeNo, expectedUuid, timeoutMs }) {
    const tempDir = path.join(consoleDir, 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    const before = listDumpFiles(tempDir), startedAt = Date.now();
    const child = spawn(path.join(consoleDir, EXE), [String(ind), 'einvoice'], {
        cwd: consoleDir, windowsHide: true, stdio: 'ignore',
    });
    const processError = new Promise((_, reject) => child.once('error', e => reject(new Error(
        e.code === 'EACCES'
            ? 'Vega konsolu yonetici yetkisi istiyor. tools\\setup-task.cmd dosyasini bir kez calistirin.'
            : `${EXE} baslatilamadi: ${e.message}`
    ))));
    try {
        const result = await Promise.race([
            waitForXml(tempDir, before, startedAt, timeoutMs, expectedBelgeNo, expectedUuid),
            processError,
        ]);
        return { xmlPath: result.file, xml: result.xml, mode: 'direct' };
    } finally {
        try { child.kill(); } catch { /* gorev zaten sonlanmis olabilir */ }
    }
}

function exportInvoice(opts) {
    const run = async () => {
        const ind = Number(opts.ind);
        if (!Number.isInteger(ind) || ind <= 0) throw new Error(`gecersiz fatura IND: ${opts.ind}`);
        if (!opts.expectedBelgeNo) throw new Error('beklenen BELGENO zorunlu');
        const timeoutMs = Number(opts.timeoutMs) || 120000;
        const consoleDir = findConsoleDir(opts.consoleDir);
        const result = (await taskExists(opts.taskName))
            ? await runViaTask({ ...opts, consoleDir, ind, timeoutMs })
            : await runDirect({ ...opts, consoleDir, ind, timeoutMs });
        if (invoiceId(result.xml)) return result;
        // Numarasiz dump: BELGENO'yu yazip kendi klasorumuze kopyala (Vega temp'i
        // SYSTEM'e ait olabilir). Tasarim XSLT'si bu kopyadan calisir.
        const xml = fillInvoiceId(result.xml, opts.expectedBelgeNo);
        const workDir = path.join(opts.dataDir || os.tmpdir(), 'work');
        fs.mkdirSync(workDir, { recursive: true });
        const xmlPath = path.join(workDir, `${ind}-ubl.xml`);
        fs.writeFileSync(xmlPath, xml, 'utf8');
        return { ...result, xml, xmlPath, sourcePath: result.xmlPath, filledId: true };
    };
    const next = serial.then(run, run);
    serial = next.catch(() => {});
    return next;
}

module.exports = {
    exportInvoice, findConsoleDir, taskExists, invoiceId, invoiceUuid, matchesInvoice, fillInvoiceId,
    friendlyTaskError, cleanStaleDoneFiles, EXE,
};
