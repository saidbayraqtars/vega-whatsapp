const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function xmlValue(xml, tag) {
    const re = new RegExp(`<(?:cbc:)?${tag}(?:\\s[^>]*)?>([^<]+)<\\/(?:cbc:)?${tag}>`, 'i');
    const m = String(xml || '').match(re);
    return m ? m[1].trim() : '';
}

function supplierVkn(xml) {
    const part = String(xml || '').match(/<(?:cac:)?AccountingSupplierParty\b[\s\S]*?<\/(?:cac:)?AccountingSupplierParty>/i);
    if (!part) return '';
    const ids = [
        ...part[0].matchAll(/<(?:cbc:)?ID\b[^>]*schemeID=["'](?:VKN|TCKN)["'][^>]*>([^<]+)<\/(?:cbc:)?ID>/ig),
        ...part[0].matchAll(/<(?:cbc:)?CompanyID(?:\s[^>]*)?>([^<]+)<\/(?:cbc:)?CompanyID>/ig),
    ];
    const value = ids.map(m => m[1].trim()).find(x => /^\d{10,11}$/.test(x));
    return value || '';
}

const designBase = documentType => (documentType === 'earsiv' ? 'earchive' : 'invoice');

// Vega'nin kendi duzeni: e-Fatura invoice.xslt, e-Arsiv earchive.xslt. Birden
// fazla firma varsa firmaya ozel invoice_<VKN/TCKN>.xslt once aranir. Kuruluma
// gomulu yedek dizayn YOK: dosya bulunamazsa belge gonderilmez.
function designCandidates(designsDir, documentType, xml, configuredVkn) {
    const base = designBase(documentType);
    const vkn = String(configuredVkn || supplierVkn(xml) || '').trim().replace(/[^0-9]/g, '');
    return [
        vkn && path.join(designsDir, `${base}_${vkn}.xslt`),
        path.join(designsDir, `${base}.xslt`),
    ].filter(Boolean);
}

// Disa aktarma (yonetici gorevi) calistirilmadan once ucuz on kontrol:
// bu tur icin klasorde hic dizayn yoksa belgeyi hic isleme alma.
function hasAnyDesign(designsDir, documentType) {
    const base = designBase(documentType);
    try {
        return fs.readdirSync(designsDir).some(f => f.toLowerCase() === `${base}.xslt`
            || (f.toLowerCase().startsWith(`${base}_`) && f.toLowerCase().endsWith('.xslt')));
    } catch { return false; }
}

function selectDesign(opts) {
    const candidates = designCandidates(opts.designsDir, opts.documentType, opts.xml, opts.invoiceVkn);
    const selected = candidates.find(f => fs.existsSync(f));
    if (!selected) {
        throw new Error(`dizayn bulunamadi, gonderilmedi: ${candidates.map(f => path.basename(f)).join(' / ')} (${opts.designsDir})`);
    }
    return { selected, candidates };
}

function runXslt({ helperPath, xmlPath, xslPath, htmlPath, saxonDir, timeoutMs = 60000 }) {
    return new Promise((resolve, reject) => {
        const child = spawn(helperPath, ['--xml', xmlPath, '--xsl', xslPath, '--out', htmlPath, '--saxon-dir', saxonDir], {
            windowsHide: true,
        });
        let stderr = '', done = false;
        child.stderr.on('data', d => { stderr += d.toString(); });
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            try { child.kill(); } catch { /* sonlanmis olabilir */ }
            reject(new Error('XSLT donusumu zaman asimina ugradi'));
        }, timeoutMs);
        child.once('error', e => {
            if (done) return;
            done = true; clearTimeout(timer);
            reject(new Error(`XSLT yardimcisi baslatilamadi: ${e.message}`));
        });
        child.once('close', code => {
            if (done) return;
            done = true; clearTimeout(timer);
            if (code !== 0 || !fs.existsSync(htmlPath)) return reject(new Error(`XSLT donusumu basarisiz (${code}): ${stderr.slice(-1200)}`));
            resolve(htmlPath);
        });
    });
}

async function htmlToPdf(htmlPath, electron) {
    if (!electron || !electron.BrowserWindow) throw new Error('PDF icin Electron BrowserWindow bulunamadi');
    const win = new electron.BrowserWindow({
        show: false,
        webPreferences: { offscreen: true, javascript: true, nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    try {
        await win.loadFile(htmlPath);
        await new Promise(r => setTimeout(r, 700)); // gomulu QR JavaScript ve font yerlesimi
        return await win.webContents.printToPDF({
            marginsType: 0, pageSize: 'A4', printBackground: true, landscape: false,
        });
    } finally {
        try { win.destroy(); } catch { /* zaten kapanmis */ }
    }
}

async function render(opts) {
    const { selected } = selectDesign(opts);
    const helperPath = path.join(opts.integrationDir, 'tools', 'VegaXsltRenderer.exe');
    if (!fs.existsSync(helperPath)) throw new Error(`XSLT yardimcisi bulunamadi: ${helperPath}`);
    await runXslt({ helperPath, xmlPath: opts.xmlPath, xslPath: selected, htmlPath: opts.htmlPath, saxonDir: opts.saxonDir });
    const pdf = await htmlToPdf(opts.htmlPath, opts.electron);
    return { pdf, design: path.relative(opts.designsDir, selected) };
}

module.exports = { render, selectDesign, designCandidates, hasAnyDesign, supplierVkn, xmlValue, runXslt, htmlToPdf };
