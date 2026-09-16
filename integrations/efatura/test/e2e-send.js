// Uctan uca: gercek dizayn (XSLT) -> gercek HTML -> gercek PDF -> gonderim yolu.
// Yalniz Vega konsolu (UBL uretimi) ve WhatsApp cikisi taklit edilir; arasindaki
// her sey gercek kodla calisir. Calistirma: npm run test:efatura-e2e
const { app } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const exporter = require('../console-export');
const { Integration } = require('../index');

const root = path.join(__dirname, '..');

function copyDesigns(dir) {
    fs.mkdirSync(dir, { recursive: true });
    for (const name of ['invoice.xslt', 'earchive.xslt']) {
        fs.copyFileSync(path.join(root, 'designs', 'default', name), path.join(dir, name));
    }
}

// PDF penceresi kapaninca Electron kendini kapatmasin (test devam etsin).
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efatura-e2e-'));
    const fixture = path.join(__dirname, 'fixture-invoice.xml');
    const xml = fs.readFileSync(fixture, 'utf8');
    const belgeNo = exporter.invoiceId(xml);
    const sends = [];
    const deletes = [];
    let exportCalls = 0;
    let allPhones = false;
    const failPhones = new Set();

    // Vega konsolu yerine sabit UBL; her cagrida kendi kopyasini verir cunku
    // processOne isi bitince xmlPath'i siler.
    // Saxon DLL'leri Vega konsol klasorunde; yoksa test atlanir (XSLT calismaz).
    const consoleDir = ['C:\\eArsiv', 'C:\\EArsiv'].find(p => fs.existsSync(p));
    if (!consoleDir) { console.log('efatura uctan uca: ATLANDI (C:\\eArsiv yok, Saxon bulunamadi)'); return app.exit(0); }
    exporter.findConsoleDir = () => consoleDir;
    exporter.exportInvoice = async (opts) => {
        exportCalls++;
        assert.equal(opts.expectedBelgeNo, belgeNo, 'konsola beklenen BELGENO gecilmeli');
        assert.equal(typeof opts.ind, 'number');
        const xmlPath = path.join(dataDir, `export-${exportCalls}.xml`);
        fs.writeFileSync(xmlPath, xml, 'utf8');
        return { xml, xmlPath, mode: 'task' };
    };

    const integration = new Integration({
        manifest: {
            settings: {
                caption: '{unvan} - {belgeno} ({tutar} {parabirimi}) ektedir.',
                updatedCaption: '{belgeno} guncellendi: {tutar} {parabirimi}.',
                cancelledCaption: '{belgeno} iptal edildi.',
            },
        },
        dataDir,
        integrationDir: root,
        electron: require('electron'),
        gate: () => ({ ok: true }),
        resolveCariContacts: async () => new Map([[5, {
            name: 'ORNEK MUSTERI A.S.', phone: '905551112233', valid: true,
            phones: ['905551112233', '905551112244', '905551112255'],
        }]]),
        getWatcherOptions: () => ({ sendAllPhones: allPhones }),
        waSend: async (phone, text, media, opts) => {
            if (failPhones.has(phone)) return { success: false, error: 'numara kapali' };
            sends.push({ phone, text, media, opts });
            return { success: true, id: 'wa-' + (sends.length) };
        },
        waDelete: async (phone, id) => { deletes.push({ phone, id }); return { success: true }; },
        waStatus: () => ({ ready: true }),
    });
    copyDesigns(integration.designsDir);
    integration.phoneGapMs = 0;

    const ctx = { firmaNo: '0103', donemNo: '0015' };
    const row = {
        IND: 4210, BELGENO: belgeNo, TARIH: new Date('2026-09-16T00:00:00Z'), TUTAR: 1234.5,
        PARABIRIMI: 'TL', CARIIND: 5, EFATURA: true, BELGETIPI: 21, IPTAL: false, IADE: false,
        LADATE: new Date('2026-09-16T08:00:00Z'), LINE_COUNT: 2, LINE_CHECKSUM: 77, DOCUMENT_TYPE: 'efatura',
    };
    const key = integration.documentKey(ctx, row);

    try {
        // 1) Normal gonderim: gercek PDF, gercek cariye.
        const first = await integration.processOne(ctx, row);
        assert.equal(first.sent, true);
        assert.equal(sends.length, 1);
        assert.equal(sends[0].phone, '905551112233');
        assert.equal(sends[0].media.kind, 'document');
        assert.equal(sends[0].media.mimetype, 'application/pdf');
        assert.equal(sends[0].media.fileName, `${belgeNo}.pdf`);
        assert.equal(sends[0].media.buffer.subarray(0, 4).toString(), '%PDF', 'gercek PDF uretilmeli');
        assert(sends[0].media.buffer.length > 20000, `PDF cok kucuk: ${sends[0].media.buffer.length}`);
        assert(sends[0].text.startsWith('ORNEK MUSTERI A.S. - ' + belgeNo));
        assert(sends[0].text.includes('1.234,50 TL'));
        assert(!sends[0].text.includes('gercek alici'), 'test modu kapaliyken TEST basligi olmamali');
        assert.equal(integration.state.doc(key).status, 'sent');
        assert.equal(integration.state.doc(key).design, 'invoice.xslt');
        // Gecici dosyalar temizlenmeli (work klasoru dolmasin).
        assert.equal(fs.readdirSync(path.join(dataDir, 'work')).length, 0);

        // 2) Ayni belge ikinci turda tekrar gitmez.
        const again = await integration.processOne(ctx, row);
        assert.equal(again.skipped, 'sent');
        assert.equal(sends.length, 1);

        // 3) Tutar degisti -> guncel PDF gider, eski mesaj geri cekilir.
        const changed = { ...row, TUTAR: 2000, LINE_CHECKSUM: 78 };
        const upd = await integration.processOne(ctx, changed, 'update');
        assert.equal(upd.updated, true);
        assert.equal(sends.length, 2);
        assert(sends[1].text.includes('2.000,00 TL'));
        assert.equal(deletes.length, 1);
        assert.equal(deletes[0].id, 'wa-1');
        assert.equal(integration.state.doc(key).revision, 2);

        // 4) Iptal: PDF geri cekilir, musteriye iptal bildirimi gider (eksiz).
        const doc = integration.state.docsForContext(integration.key(ctx)).find(d => d.ind === 4210);
        const cancelled = await integration.cancelOne(ctx, doc, { ...changed, IPTAL: true }, 'iptal');
        assert.equal(cancelled.cancelled, true);
        assert.equal(deletes.length, 2);
        assert.equal(sends[2].media, null);
        assert(sends[2].text.includes('iptal edildi'));
        assert.equal(integration.state.doc(key).status, 'cancelled');

        // 5) Test modu: ayni akis, PDF cariye degil test numarasina gider.
        const t = integration.setTestMode({ phone: '0535 078 61 01', minutes: 60 });
        assert.equal(t.testPhone, '905350786101');
        assert(Date.parse(t.testUntil) > Date.now());
        assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).testPhone, '905350786101');
        const testRow = { ...row, IND: 4211 };
        const inTest = await integration.processOne(ctx, testRow);
        assert.equal(inTest.sent, true);
        assert.equal(sends[3].phone, '905350786101', 'test modunda PDF test numarasina gitmeli');
        assert(sends[3].text.includes('TEST — gercek alici'));
        assert(sends[3].text.includes('905551112233'), 'test mesaji gercek aliciyi yazmali');
        assert.equal(sends[3].media.buffer.subarray(0, 4).toString(), '%PDF');
        assert.equal(integration.state.doc(integration.documentKey(ctx, testRow)).testMode, true);

        // 6) Sure dolunca kendiliginden gercek cariye doner (acik unutulma korumasi).
        integration._testUntil = Date.now() - 1000;
        assert.equal(integration.testPhone, '');
        assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).testPhone, '');
        const afterExpiry = await integration.processOne(ctx, { ...row, IND: 4212 });
        assert.equal(afterExpiry.sent, true);
        assert.equal(sends[4].phone, '905551112233');
        assert(!sends[4].text.includes('gercek alici'));

        // 7) Elle kapatma, suresiz acma ve gecersiz numara.
        assert.equal(integration.setTestMode({ phone: '905350786101', minutes: 0 }).testUntil, null);
        assert.equal(integration.setTestMode({ phone: '' }).testPhone, null);
        assert.throws(() => integration.setTestMode({ phone: '123' }), /gecersiz/i);

        // 8) "Carideki tum telefonlara gonder" acik: ayni PDF her numaraya gider;
        // guncelleme ve iptal de hepsine uygulanir.
        allPhones = true;
        const multiRow = { ...row, IND: 4214 };
        const multiKey = integration.documentKey(ctx, multiRow);
        let base = sends.length;
        const multi = await integration.processOne(ctx, multiRow);
        assert.deepEqual(multi.phones, ['905551112233', '905551112244', '905551112255']);
        assert.equal(sends.length, base + 3);
        const pdfs = sends.slice(base);
        assert.deepEqual(pdfs.map(x => x.phone), multi.phones);
        assert(pdfs.every(x => x.media.buffer === pdfs[0].media.buffer), 'PDF bir kez uretilip hepsine gitmeli');
        assert.equal(integration.state.doc(multiKey).sends.length, 3);
        assert.equal(integration.state.doc(multiKey).phone, '905551112233');

        base = sends.length;
        let delBase = deletes.length;
        const multiChanged = { ...multiRow, TUTAR: 3000, LINE_CHECKSUM: 79 };
        await integration.processOne(ctx, multiChanged, 'update');
        assert.equal(sends.length, base + 3);
        assert.deepEqual(deletes.slice(delBase).map(d => d.id), pdfs.map((_, i) => 'wa-' + (base - 2 + i)));
        assert.deepEqual(deletes.slice(delBase).map(d => d.phone), multi.phones);

        base = sends.length; delBase = deletes.length;
        const multiDoc = integration.state.docsForContext(integration.key(ctx)).find(d => d.ind === 4214);
        await integration.cancelOne(ctx, multiDoc, { ...multiChanged, IPTAL: true }, 'iptal');
        assert.equal(deletes.length, delBase + 3);
        assert.deepEqual(sends.slice(base).map(x => x.phone), multi.phones);
        assert(sends.slice(base).every(x => x.media === null && x.text.includes('iptal edildi')));

        // Bir numara kapaliysa digerlerine gider, belge gonderildi sayilir (tekrar denenirse
        // gidenlere ikinci PDF atilirdi). Hicbirine gitmezse hata: sonraki turda denenir.
        failPhones.add('905551112244');
        base = sends.length;
        const partial = await integration.processOne(ctx, { ...row, IND: 4215 });
        assert.deepEqual(partial.phones, ['905551112233', '905551112255']);
        assert.equal(partial.failed, 1);
        assert.equal(integration.state.doc(integration.documentKey(ctx, { ...row, IND: 4215 })).failedPhones[0].phone, '905551112244');
        for (const p of multi.phones) failPhones.add(p);
        await assert.rejects(() => integration.processOne(ctx, { ...row, IND: 4216 }), /numara kapali/);
        assert.notEqual(integration.state.doc(integration.documentKey(ctx, { ...row, IND: 4216 }))?.status, 'sent');
        failPhones.clear();

        // Test modu tum telefonlar acikken de yalniz test numarasina, basliga tum gercek numaralar.
        integration.setTestMode({ phone: '905350786101', minutes: 60 });
        base = sends.length;
        await integration.processOne(ctx, { ...row, IND: 4217 });
        assert.equal(sends.length, base + 1);
        assert.equal(sends[base].phone, '905350786101');
        assert(sends[base].text.includes('905551112233, 905551112244, 905551112255'));
        integration.setTestMode({ phone: '' });
        allPhones = false;

        // 9) Dizayn yoksa hicbir sey gonderilmez.
        base = sends.length;
        for (const f of fs.readdirSync(integration.designsDir)) fs.unlinkSync(path.join(integration.designsDir, f));
        await assert.rejects(() => integration.processOne(ctx, { ...row, IND: 4213 }), /dizayn yok/);
        assert.equal(sends.length, base);

        // 10) Durum ozeti UI'nin okudugu alanlari verir; getEnabled yok -> KAPALI.
        const status = integration.status();
        assert.equal(status.testPhone, null);
        assert.equal(status.enabled, false);

        const sample = path.join(os.tmpdir(), 'vega-efatura-e2e.pdf');
        fs.writeFileSync(sample, sends[0].media.buffer);
        console.log(`efatura uctan uca: OK (${sends.length} gonderim, ${deletes.length} geri cekme, PDF ${sends[0].media.buffer.length} bayt)`);
        console.log('ornek PDF: ' + sample);
        app.exit(0);
    } catch (e) {
        console.error(e.stack || e.message);
        app.exit(1);
    } finally {
        try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* temizlik kritik degil */ }
    }
});
