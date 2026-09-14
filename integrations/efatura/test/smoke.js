const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../db');
const exporter = require('../console-export');
const renderer = require('../renderer');
const { Integration, fingerprint } = require('../index');

const root = path.join(__dirname, '..');
const xml = fs.readFileSync(path.join(__dirname, 'fixture-invoice.xml'), 'utf8');
assert.equal(db.code('101', 'firma'), '0101');
assert.equal(db.code('D3', 'donem'), '0003');
assert.throws(() => db.code('01x1', 'firma'));
assert.equal(exporter.invoiceId(xml), 'TEST2026000000001');
assert.equal(renderer.xmlValue(xml, 'ProfileID'), 'TEMELFATURA');
assert.equal(renderer.supplierVkn(xml), '1234567890');
const invoice = renderer.selectDesign({ designsDir: path.join(root, 'designs'), documentType: 'efatura', xml });
const archive = renderer.selectDesign({ designsDir: path.join(root, 'designs'), documentType: 'earsiv', xml });
assert.equal(path.basename(invoice.selected), 'invoice.xslt');
assert.equal(path.basename(archive.selected), 'earchive.xslt');

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
        assert.equal(calls.del, 1);
        assert.equal(calls.send, 1);
        assert.equal(integration.state.doc(key).status, 'cancelled');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
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
            waStatus: () => ({ ready: true }),
            gate: () => ({ ok: true }),
            waSend: async () => ({ success: true, id: 'msg' }),
        });
        integration.currentContext = async () => ctx;
        integration.state.init('F0103D0015', 10);
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
