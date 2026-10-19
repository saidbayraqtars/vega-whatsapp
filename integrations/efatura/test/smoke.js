const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../db');
const exporter = require('../console-export');
const renderer = require('../renderer');
const { Integration, fingerprint, FP_VERSION } = require('../index');

const root = path.join(__dirname, '..');
const xml = fs.readFileSync(path.join(__dirname, 'fixture-invoice.xml'), 'utf8');
assert.equal(db.code('101', 'firma'), '0101');
assert.equal(db.code('D3', 'donem'), '0003');
assert.throws(() => db.code('01x1', 'firma'));
assert.equal(exporter.invoiceId(xml), 'TEST2026000000001');
// Bazi firmalarda Vega dump'i numarasiz uretir (<cbc:ID />); ETTN ile taninir,
// sonraki AdditionalDocumentReference ID'si fatura numarasi sanilmamali.
{
    const blank = xml.replace('<cbc:ID>TEST2026000000001</cbc:ID>', '<cbc:ID />')
        .replace('<cac:AccountingSupplierParty>', '<cac:AdditionalDocumentReference><cbc:ID>099e8ea70d</cbc:ID></cac:AdditionalDocumentReference><cac:AccountingSupplierParty>');
    const uuid = '00000000-0000-0000-0000-000000000001';
    assert.equal(exporter.invoiceId(blank), '');
    assert.equal(exporter.invoiceUuid(blank), uuid);
    assert.ok(exporter.matchesInvoice(blank, 'EXP2026000000550', uuid.toUpperCase()));
    assert.ok(!exporter.matchesInvoice(blank, 'EXP2026000000550', '11111111-0000-0000-0000-000000000001'));
    assert.ok(exporter.matchesInvoice(blank, 'EXP2026000000550', ''));
    assert.ok(!exporter.matchesInvoice(xml, 'EXP2026000000550', uuid));
    const filled = exporter.fillInvoiceId(blank, 'EXP2026000000550');
    assert.equal(exporter.invoiceId(filled), 'EXP2026000000550');
    assert.equal(filled.replace('<cbc:ID>EXP2026000000550</cbc:ID>', '<cbc:ID />'), blank);
    assert.equal(exporter.fillInvoiceId(xml, 'X'), xml);
}
assert.equal(renderer.xmlValue(xml, 'ProfileID'), 'TEMELFATURA');
assert.equal(renderer.supplierVkn(xml), '1234567890');
// Dizayn: once <tur>_<VKN>.xslt, sonra <tur>.xslt; hic yoksa hata (gonderilmez).
const designDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-efatura-design-'));
try {
    assert.equal(renderer.hasAnyDesign(designDir, 'efatura'), false);
    assert.throws(() => renderer.selectDesign({ designsDir: designDir, documentType: 'efatura', xml }), /dizayn bulunamadi/);
    fs.writeFileSync(path.join(designDir, 'invoice.xslt'), '<x/>');
    fs.writeFileSync(path.join(designDir, 'invoice_1234567890.xslt'), '<x/>');
    fs.writeFileSync(path.join(designDir, 'earchive.xslt'), '<x/>');
    const invoice = renderer.selectDesign({ designsDir: designDir, documentType: 'efatura', xml });
    const archive = renderer.selectDesign({ designsDir: designDir, documentType: 'earsiv', xml });
    assert.equal(path.basename(invoice.selected), 'invoice_1234567890.xslt');
    assert.equal(path.basename(archive.selected), 'earchive.xslt');
    fs.unlinkSync(path.join(designDir, 'earchive.xslt'));
    fs.writeFileSync(path.join(designDir, 'earchive_9999999999.xslt'), '<x/>');   // baska firmanin
    assert.equal(renderer.hasAnyDesign(designDir, 'earsiv'), true);
    assert.throws(() => renderer.selectDesign({ designsDir: designDir, documentType: 'earsiv', xml }), /dizayn bulunamadi/);
} finally {
    fs.rmSync(designDir, { recursive: true, force: true });
}

async function main() {
    let sqlText = '';
    let queryCount = 0;
    const pool = {
        request() {
            return {
                input() { return this; },
                async query(text) {
                    queryCount++;
                    if (text.includes('sys.tables')) return { recordset: [
                        { name: 'F0103D0015TBLSATFATBASLIK' },
                        { name: 'F0103D0015TBLSATFATHAREKET' },
                    ] };
                    sqlText = text;
                    return { recordset: [] };
                },
            };
        },
    };
    await db.readyDocuments(pool, { firmaNo: '0103', donemNo: '0015' }, { afterInd: 10, limit: 5 });
    assert(queryCount >= 2);
    assert(sqlText.includes('b.BELGETIPI=21'));
    assert(sqlText.includes("LEN(LTRIM(RTRIM(ISNULL(b.BELGENO,''))))=16"));
    assert(!sqlText.includes('TBLEARCHIVEHISTORY'));

    const baseRow = {
        IND: 99, BELGENO: 'ODM2026000000001', TARIH: new Date('2026-09-07T00:00:00Z'),
        TUTAR: 100, PARABIRIMI: 'TL', CARIIND: 5, EFATURA: false,
        EFATURAUUID: 'uuid', BELGETIPI: 21, IPTAL: false, IADE: false,
        LADATE: new Date('2026-09-07T10:00:00Z'), LINE_COUNT: 1, LINE_CHECKSUM: 123,
        DOCUMENT_TYPE: 'earsiv',
    };
    assert.notEqual(fingerprint(baseRow), fingerprint({ ...baseRow, LINE_CHECKSUM: 124 }));
    assert.notEqual(fingerprint(baseRow), fingerprint({ ...baseRow, TUTAR: 101 }));
    // Vega'da acip kaydetmek (LADATE) ya da GIB durumu degisikligi yeniden gonderim sebebi degil.
    assert.equal(fingerprint(baseRow), fingerprint({ ...baseRow, LADATE: new Date('2026-09-08T10:00:00Z') }));
    assert.equal(fingerprint(baseRow), fingerprint({ ...baseRow, EFATURA: true, EFATURAUUID: 'baska' }));

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-efatura-test-'));
    const calls = { send: 0, del: 0 };
    try {
        const integration = new Integration({
            manifest: { settings: {} }, dataDir: tempDir, integrationDir: root,
            gate: () => ({ ok: true }),
            waDelete: async () => { calls.del++; return { success: true }; },
            waSend: async () => { calls.send++; return { success: true, id: 'cancel-msg' }; },
        });
        const ctx = { firmaNo: '0103', donemNo: '0015' };
        const key = integration.documentKey(ctx, baseRow);
        integration.state.setDoc(key, {
            status: 'sent', contextKey: 'F0103D0015', ind: 99,
            belgeNo: baseRow.BELGENO, phone: '905551112233', waMessageId: 'pdf-msg',
            sentAt: new Date().toISOString(), fingerprint: fingerprint(baseRow),
            invoiceDate: baseRow.TARIH, amount: baseRow.TUTAR, currency: 'TL', type: 'earsiv',
        });
        const doc = integration.state.docsForContext('F0103D0015')[0];
        const cancelled = await integration.cancelOne(ctx, doc, { ...baseRow, IPTAL: true }, 'iptal');
        assert(cancelled.cancelled);
        assert.equal(calls.del, 0, 'iptalde eski PDF herkesten silinmemeli');
        assert.equal(calls.send, 1);
        assert.equal(integration.state.doc(key).status, 'cancelled');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Degisiklik: eski parmak izi sessizce yenilenir, degisiklik sabitlenene kadar
    // beklenir, fatura basina tek guncelleme gider.
    const changeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-efatura-change-'));
    const origStates = db.documentStates;
    try {
        const ctx = { firmaNo: '0103', donemNo: '0015' };
        const integration = new Integration({
            manifest: { settings: { updateSettleMinutes: 15, maxUpdates: 1 } }, dataDir: changeDir, integrationDir: root,
            gate: () => ({ ok: true }),
            waDelete: async () => { throw new Error('geri cekme cagrilmamali'); },
            waSend: async () => ({ success: true, id: 'x' }),
        });
        const key = integration.documentKey(ctx, baseRow);
        integration.state.setDoc(key, {
            status: 'sent', contextKey: 'F0103D0015', ind: 99, belgeNo: baseRow.BELGENO,
            phone: '905551112233', waMessageId: 'pdf-msg', sentAt: new Date().toISOString(),
            fingerprint: 'v1-eski-parmak-izi',
        });
        let row = { ...baseRow };
        db.documentStates = async () => [row];
        const updates = [];
        integration.processOne = async (_ctx, r, mode) => {
            updates.push(mode);
            integration.state.setDoc(key, { fingerprint: fingerprint(r), updates: 1, pendingFingerprint: null, pendingSince: null });
            return { sent: true, updated: true };
        };

        // v1 kaydi: gonderim yok, yeni parmak izine gecer.
        assert.deepEqual(await integration.reconcileSent({}, ctx), []);
        assert.equal(integration.state.doc(key).fpVersion, FP_VERSION);
        assert.equal(integration.state.doc(key).fingerprint, fingerprint(baseRow));

        // Yalniz LADATE degisti: hicbir sey olmaz.
        row = { ...baseRow, LADATE: new Date('2026-09-09T10:00:00Z') };
        await integration.reconcileSent({}, ctx);
        assert.equal(integration.state.doc(key).pendingFingerprint, null);

        // Tutar degisti: once bekler, 15 dk dolmadan gondermez.
        row = { ...baseRow, TUTAR: 150 };
        await integration.reconcileSent({}, ctx);
        assert.deepEqual(updates, []);
        assert.equal(integration.state.doc(key).pendingFingerprint, fingerprint(row));
        await integration.reconcileSent({}, ctx);
        assert.deepEqual(updates, []);

        // Bekleme sirasinda yine degisti: sayac bastan baslar.
        row = { ...baseRow, TUTAR: 175 };
        await integration.reconcileSent({}, ctx);
        assert.equal(integration.state.doc(key).pendingFingerprint, fingerprint(row));
        assert.deepEqual(updates, []);

        // Sabit kaldi ve sure doldu: tek guncelleme gider.
        integration.state.setDoc(key, { pendingSince: new Date(Date.now() - 16 * 60000).toISOString() });
        await integration.reconcileSent({}, ctx);
        assert.deepEqual(updates, ['update']);

        // Sinir dolu: sonraki degisiklik sessiz kalir, yeni parmak izi kabul edilir.
        row = { ...baseRow, TUTAR: 200 };
        await integration.reconcileSent({}, ctx);
        integration.state.setDoc(key, { pendingSince: new Date(Date.now() - 60 * 60000).toISOString() });
        await integration.reconcileSent({}, ctx);
        assert.deepEqual(updates, ['update']);
        assert.equal(integration.state.doc(key).fingerprint, fingerprint(row));

        // v1.10.8'de guncellenmis belge (revision 2, updates alani yok): sinir dolu sayilir.
        integration.state.setDoc(key, { updates: undefined, revision: 2 });
        row = { ...baseRow, TUTAR: 250 };
        await integration.reconcileSent({}, ctx);
        assert.deepEqual(updates, ['update']);
        assert.equal(integration.state.doc(key).fingerprint, fingerprint(row));

        // Yalniz ana numara: "tum telefonlar" ayari PDF'i katlamaz.
        assert.deepEqual(integration.recipients({ phone: '905551112233', phones: ['905551112233', '905551112244'] }), ['905551112233']);
        assert.deepEqual(integration.recipients(null), []);
    } finally {
        db.documentStates = origStates;
        fs.rmSync(changeDir, { recursive: true, force: true });
    }

    // Batch siniri dolunca imlec islenmeyen satirlarin uzerinden atlamamali.
    const cursorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-efatura-cursor-'));
    try {
        const ctx = { firmaNo: '0103', donemNo: '0015' };
        const ready = [11, 12, 13, 14, 15].map(ind => ({ ...baseRow, IND: ind, BELGENO: `ODM20260000000${ind}` }));
        const integration = new Integration({
            manifest: { settings: { batchLimit: 2 } }, dataDir: cursorDir, integrationDir: root,
            getPool: () => ({ connected: true }),
            getContext: () => ctx,
            getEnabled: () => enabledSetting,
            waStatus: () => ({ ready: true }),
            gate: () => ({ ok: true }),
            waSend: async () => ({ success: true, id: 'msg' }),
        });
        integration.currentContext = async () => ctx;
        const item = { docType: 'satisFaturasi', evrak: 'ODM2026000000001' };

        // Varsayilan kapali: tarama yok, watcher metin mesajini engellemez.
        let enabledSetting = null;
        assert.equal((await integration.tick()).skipped, 'ayarlardan kapali');
        assert.equal(integration.claimsWatcherDocument(item), false);

        // Eski (kapaliyken/eski surumde) alinmis baslangic, tus acilinca yenilenir.
        integration.state.init('F0103D0015', 3);
        integration.state.data.contexts.F0103D0015.initializedAt = '2026-01-01T00:00:00.000Z';
        enabledSetting = { enabled: true, enabledAt: new Date().toISOString() };
        const origMax = db.maxInvoiceInd;
        db.maxInvoiceInd = async () => 10;
        const reinit = await integration.tick();
        db.maxInvoiceInd = origMax;
        assert.equal(reinit.initialized, true);
        assert.equal(integration.state.context('F0103D0015').scanAfter, 10);
        assert.equal(integration.claimsWatcherDocument(item), true);
        integration.reconcileSent = async () => [];
        const seen = [];
        integration.processOne = async (_ctx, row) => { seen.push(row.IND); return { sent: true, belgeNo: row.BELGENO }; };
        db.readyDocuments = async (_pool, _ctx, { afterInd }) => ready.filter(r => r.IND > afterInd);

        await integration.tick();
        assert.deepEqual(seen, [11, 12]);
        assert.equal(integration.state.context('F0103D0015').scanAfter, 12);
        await integration.tick();
        assert.deepEqual(seen, [11, 12, 13, 14]);
        assert.equal(integration.state.context('F0103D0015').scanAfter, 14);
    } finally {
        fs.rmSync(cursorDir, { recursive: true, force: true });
    }
    console.log('efatura smoke: OK');
}

main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
