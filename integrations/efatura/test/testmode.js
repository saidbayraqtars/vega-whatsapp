// Test modu: settings.json'daki testPhone doluysa PDF cari yerine test numarasina gider.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const exporter = require('../console-export');
const renderer = require('../renderer');
const { Integration } = require('../index');

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'efatura-testmode-'));
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ testPhone: '5350786101' }));
    exporter.findConsoleDir = () => 'C:\eArsiv';
    exporter.exportInvoice = async () => ({ xml: '<Invoice/>', xmlPath: path.join(dir, 'x.xml'), mode: 'task' });
    renderer.render = async () => ({ pdf: Buffer.from('%PDF-test'), design: 'default/invoice.xslt' });
    const sends = [];
    const mk = (contact) => new Integration({
        manifest: { settings: { caption: 'Sayin {unvan}, {belgeno} ektedir.' } }, dataDir: dir, integrationDir: __dirname,
        gate: () => ({ ok: true }),
        resolveCariContacts: async () => new Map(contact ? [[5, contact]] : []),
        waSend: async (phone, text, media) => { sends.push({ phone, text, media }); return { success: true, id: 'm' + sends.length }; },
    });
    const row = { IND: 7, BELGENO: 'ODM2026000000706', TARIH: new Date(), TUTAR: 10, CARIIND: 5, DOCUMENT_TYPE: 'earsiv' };
    const ctx = { firmaNo: '0103', donemNo: '0015' };

    const a = mk({ name: 'GERCEK CARI', phone: '905551112233', valid: true });
    assert.equal(a.testPhone, '905350786101');
    assert((await a.processOne(ctx, row)).sent);
    assert.equal(sends[0].phone, '905350786101');
    assert(sends[0].text.startsWith('🔔 TEST — gercek alici: GERCEK CARI (905551112233)'));
    assert.equal(sends[0].media.kind, 'document');
    assert.equal(a.state.doc('F0103D0015:7').testMode, true);

    const b = mk(null);                       // carinin telefonu yok → testte yine gider
    assert((await b.processOne(ctx, { ...row, IND: 8 })).sent);
    assert.equal(sends[1].phone, '905350786101');

    fs.unlinkSync(path.join(dir, 'settings.json'));
    const c = mk({ name: 'X', phone: '905551112233', valid: true });
    assert.equal(c.testPhone, '');
    assert((await c.processOne(ctx, { ...row, IND: 9 })).sent);
    assert.equal(sends[2].phone, '905551112233');
    assert(!sends[2].text.includes('TEST'));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('efatura test modu: OK');
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
