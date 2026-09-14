const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const renderer = require('../renderer');

app.whenReady().then(async () => {
    const root = path.join(__dirname, '..');
    const design = process.env.VEGA_SMOKE_DESIGN === 'earchive' ? 'earchive' : 'invoice';
    const htmlPath = path.join(os.tmpdir(), 'vega-efatura-electron-smoke.html');
    const pdfPath = path.join(os.tmpdir(), 'vega-efatura-electron-smoke.pdf');
    try {
        await renderer.runXslt({
            helperPath: path.join(root, 'tools', 'VegaXsltRenderer.exe'),
            xmlPath: path.join(__dirname, 'fixture-invoice.xml'),
            xslPath: path.join(root, 'designs', 'default', `${design}.xslt`),
            htmlPath,
            saxonDir: 'C:\\eArsiv',
        });
        const pdf = await renderer.htmlToPdf(htmlPath, require('electron'));
        if (pdf.length < 1000 || pdf.subarray(0, 4).toString() !== '%PDF') throw new Error('gecersiz PDF ciktisi');
        fs.writeFileSync(pdfPath, pdf);
        console.log(`electron PDF smoke (${design}): OK (${pdf.length} bayt) ${pdfPath}`);
        app.exit(0);
    } catch (e) {
        console.error(e.stack || e.message);
        app.exit(1);
    }
});
