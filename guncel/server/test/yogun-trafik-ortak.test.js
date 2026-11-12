// Yoğun trafik modu TÜM yüksek hacimli mesajlara uygulanır: belge mesajı (watcher), e-Fatura PDF
// ve ShopStar (tahsilat + geciken taksit) tek ortak gönderim hakkını paylaşır. Gerçek veritabanı /
// WhatsApp / Vega yok; sahte havuz, sahte saat ve sahte hak ile.
//  • watcher: slowTake/slowPeek/slowDeadline — hak atomik, release(false) geri verir, release(true)
//    aralığı kurar, aralık HER kaynağın sırasını birlikte görür.
//  • e-Fatura: yeni fatura gönderilmeden sıraya girer, tick başına en çok bir PDF, "bekleyenleri
//    temizle" sırayı siler ve fatura yeniden sıraya girmez, gün sonunda kalan silinir, mod kapanınca
//    sıra boşalır, iptal bildirimi de hakka tabidir.
//  • ShopStar: tahsilat bildirimi hak yokken gitmez, hak varken tek tek gider, gün sonunda silinir.
// Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-yogun-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const mk = (name) => { const d = path.join(root, name); fs.mkdirSync(path.join(d, 'data'), { recursive: true }); return d; };

const antiban = require('../antiban');
antiban.configure(mk('antiban'));

const DK = 60000;
// Pencere neredeyse tüm gün açık; gece yarısına çok yakınken zaman ilerletmeli testler anlamsızlaşır.
const geceYarisiYakin = () => { const n = new Date(); return n.getHours() === 23 && n.getMinutes() >= 30; };

// ═══════════════════════════════════════════════════════════════════════════
//  1) watcher: ortak gönderim hakkı
// ═══════════════════════════════════════════════════════════════════════════
test('ortak hak (watcher)', async (t) => {
    const watcher = require('../watcher');
    let extra = 0;
    watcher.configure({ baseDir: mk('watcher'), slowExtraQueued: () => extra });

    await t.test('mod kapalıyken hak her zaman verilir, silme saati yok', () => {
        watcher.setConfig({ slowMode: false });
        const s = watcher.slowTake();
        assert.equal(s.ok, true);
        s.release(true);                                         // etkisiz
        assert.equal(watcher.slowTake().ok, true);
        assert.equal(watcher.slowPeek().active, false);
        assert.equal(watcher.slowActive(), false);
        assert.equal(watcher.slowDeadline(Date.now()), null);
    });

    await t.test('hak atomik alınır; release(false) geri verir; release(true) 5–15 dk ileri alır', (tt) => {
        if (geceYarisiYakin()) return tt.skip('gece yarısına yakın');
        watcher.setConfig({ slowMode: true, slowStart: '00:00', slowEnd: '23:59', slowMinMin: 5, slowMaxMin: 15 });
        assert.equal(watcher.slowActive(), true);
        const a = watcher.slowTake();
        assert.equal(a.ok, true);
        const b = watcher.slowTake();                            // gönderim sürerken başka kaynak giremez
        assert.equal(b.ok, false);
        assert.match(b.reason, /sıradaki gönderim/);
        a.release(false);                                        // hiçbir şey gönderilmedi → hak geri
        const c = watcher.slowTake();
        assert.equal(c.ok, true);
        const t0 = Date.now();
        c.release(true);
        c.release(true);                                         // ikinci release etkisiz
        const p = watcher.slowPeek();
        assert.equal(p.ok, false);
        assert.ok(p.nextAt - t0 >= 5 * DK - 50 && p.nextAt - t0 <= 15 * DK + 50, `bekleme ${(p.nextAt - t0) / DK} dk`);
        assert.equal(watcher.slowPeek(p.nextAt + 1).ok, true);   // süre dolunca hak açılır
        const dl = watcher.slowDeadline(Date.now());
        assert.ok(typeof dl === 'number' && dl > Date.now());
    });

    await t.test('aralık hesabı tüm kaynakların sırasını birlikte görür', (tt) => {
        if (geceYarisiYakin()) return tt.skip('gece yarısına yakın');
        watcher.setConfig({ slowMode: true, slowStart: '00:00', slowEnd: '23:59', slowMinMin: 5, slowMaxMin: 15 });
        const gap = () => {
            const s = watcher.slowTake(Date.now() + 16 * DK);    // önceki bekleme dolmuş say
            assert.equal(s.ok, true);
            const t0 = Date.now();
            s.release(true);
            return watcher.slowPeek(Date.now()).nextAt - t0;
        };
        extra = 1000;                                            // sıra güne sığmaz → ağır yük: 5–10 dk
        for (let i = 0; i < 40; i++) {
            const g = gap();
            assert.ok(g >= 5 * DK - 50 && g <= 10 * DK + 50, `ağır yükte ${g / DK} dk`);
        }
        extra = 0;                                               // boş sıra: 5–15 dk (10 dk üstü de çıkar)
        let max = 0;
        for (let i = 0; i < 200; i++) max = Math.max(max, gap());
        assert.ok(max > 10.5 * DK, `hafif yükte en büyük bekleme ${max / DK} dk`);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  2) e-Fatura PDF sırası
// ═══════════════════════════════════════════════════════════════════════════
test('e-Fatura PDF yoğun trafik sırası', async (t) => {
    const db = require('../../integrations/efatura/db');
    const { Integration, fingerprint, FP_VERSION } = require('../../integrations/efatura/index');
    const saved = { ...db };
    t.after(() => Object.assign(db, saved));

    const row = (ind, extra = {}) => ({
        IND: ind, BELGENO: `EXP2026${String(ind).padStart(9, '0')}`, TARIH: new Date('2026-11-09T09:00:00Z'),
        TUTAR: 100 + ind, PARABIRIMI: 'TL', CARIIND: 7, EFATURA: 1, EFATURAUUID: `u-${ind}`, BELGETIPI: 21,
        IPTAL: 0, IADE: 0, LINE_COUNT: 1, LINE_CHECKSUM: 1, DOCUMENT_TYPE: 'efatura', ...extra,
    });
    let all = [];
    const gone = new Set();
    db.resolveContext = async () => ({ firmaNo: '0101', donemNo: '0017' });
    db.maxInvoiceInd = async () => 100;
    db.readyDocuments = async (pool, ctx, { afterInd, limit }) => all.filter(r => r.IND > afterInd && !r.IPTAL).slice(0, limit);
    db.documentStates = async (pool, ctx, inds) => all.filter(r => inds.includes(r.IND) && !gone.has(r.IND));

    const slow = {
        on: true, open: false, deadlineAt: Date.now() + 6 * 3600 * 1000, takes: 0,
        active: () => slow.on,
        take() {
            if (!slow.open) return { ok: false, reason: 'Yoğun trafik modu: sıradaki gönderim 14:20', release() {} };
            slow.open = false; slow.takes++;
            return { ok: true, release(used) { if (!used) slow.open = true; } };
        },
        deadline: () => slow.deadlineAt,
    };
    const logs = [];
    const dataDir = mk('efatura');
    const integ = new Integration({
        manifest: { id: 'efatura', settings: { batchLimit: 5 } }, dataDir, integrationDir: dataDir,
        getPool: () => ({ connected: true }), getContext: () => ({ firmaNo: '0101', donemNo: '0017' }),
        getEnabled: () => ({ enabled: true, enabledAt: '2026-01-01T00:00:00.000Z' }),
        waStatus: () => ({ ready: true }), slow, log: (e) => logs.push(e),
    });
    const ctx = { firmaNo: '0101', donemNo: '0017' };
    const sent = [], cancelled = [];
    integ.processOne = async (c, r, mode) => {
        sent.push(`${r.IND}:${mode}`);
        integ.state.setDoc(integ.documentKey(c, r), {
            status: 'sent', sentAt: new Date().toISOString(), ind: r.IND, belgeNo: r.BELGENO, contextKey: integ.key(c),
            type: r.DOCUMENT_TYPE, fingerprint: fingerprint(r), fpVersion: FP_VERSION,
        });
        return { sent: true, belgeNo: r.BELGENO };
    };
    integ.cancelOne = async (c, doc, r, reason) => {            // gerçeği gibi belgeyi 'cancelled' yapar
        cancelled.push(`${doc.ind}:${reason}`);
        integ.state.setDoc(doc.key, { status: 'cancelled', cancelReason: reason });
        return { cancelled: true };
    };
    const status = (ind) => (integ.state.doc(integ.documentKey(ctx, { IND: ind })) || {}).status;

    await t.test('ilk tur yalnız başlangıcı alır', async () => {
        assert.equal((await integ.tick()).initialized, true);
    });

    await t.test('yeni faturalar sıraya girer, hak yokken hiçbiri gitmez', async () => {
        all = [101, 102, 103, 104, 105].map(i => row(i));
        const r = await integ.tick();
        assert.equal(r.slow, true);
        assert.equal(r.queuedNow, 5);
        assert.ok(r.paused, 'hak yok → bekliyor');
        assert.deepEqual(sent, []);
        assert.equal(integ.queuedCount(), 5);
        assert.equal(status(101), 'queued');
    });

    await t.test('hak açılınca tick başına en çok BİR PDF, sırayla (FIFO)', async () => {
        slow.open = true;
        await integ.tick();
        assert.deepEqual(sent, ['101:queued']);
        assert.equal(integ.queuedCount(), 4);
        const r = await integ.tick();                            // hak yeniden kapandı
        assert.ok(r.paused);
        assert.deepEqual(sent, ['101:queued']);
        slow.open = true;
        await integ.tick();
        assert.deepEqual(sent, ['101:queued', '102:queued']);
        assert.equal(slow.takes, 2);
    });

    await t.test('bekleyen fatura Vega\'da silindiyse hak harcamadan düşer, sıradaki gider', async () => {
        gone.add(103);
        slow.open = true;
        await integ.tick();
        assert.equal(status(103), 'skipped');
        assert.deepEqual(sent, ['101:queued', '102:queued', '104:queued']);
        assert.ok(logs.some(l => l.status === 'dropped'));
        assert.equal(integ.queuedCount(), 1);                    // 105
    });

    await t.test('"Birikmiş mesajları temizle" sıradaki faturaları siler, yeniden sıraya girmez', async () => {
        all.push(row(106), row(107));
        await integ.tick();                                      // hak kapalı: 106 ve 107 sıraya girer
        assert.equal(integ.queuedCount(), 3);
        assert.equal(integ.clearPending(), 3);
        assert.equal(integ.queuedCount(), 0);
        assert.equal(integ.clearPending(), 0);
        assert.equal(status(105), 'skipped');
        slow.open = true;
        const before = sent.length;
        await integ.tick();                                      // tam tarama baştan okur ama kimse geri gelmez
        assert.equal(integ.queuedCount(), 0);
        assert.equal(sent.length, before);
        assert.ok(logs.some(l => l.status === 'cleared' && /elle temizlendi/.test(l.error)));
        slow.open = false;
    });

    await t.test('gün sonu: pencere kapanınca sırada kalanlar silinir', async () => {
        all.push(row(108));
        await integ.tick();
        assert.equal(integ.queuedCount(), 1);
        slow.deadlineAt = Date.now() - 1000;
        const before = sent.length;
        slow.open = true;
        await integ.tick();
        assert.equal(integ.queuedCount(), 0);
        assert.equal(status(108), 'skipped');
        assert.equal(sent.length, before, 'süresi geçen fatura gönderilmez');
        assert.ok(logs.some(l => l.status === 'cleared' && /Gün sonu/.test(l.error)));
        slow.deadlineAt = Date.now() + 6 * 3600 * 1000;
        slow.open = false;
    });

    await t.test('iptal bildirimi de ortak hakka tabidir', async () => {
        all.find(r => r.IND === 101).IPTAL = 1;                  // 101'in PDF'i gitmişti, şimdi iptal edildi
        await integ.tick();
        assert.deepEqual(cancelled, [], 'hak yok → iptal bildirimi bekler');
        slow.open = true;
        await integ.tick();
        assert.deepEqual(cancelled, ['101:iptal']);
        slow.open = false;
    });

    await t.test('mod sıra doluyken kapatılırsa kalanlar normal hızla boşalır', async () => {
        all.push(row(109), row(110));
        await integ.tick();
        assert.equal(integ.queuedCount(), 2);
        slow.on = false;
        const r = await integ.tick();
        assert.equal(r.processed, 2);
        assert.equal(integ.queuedCount(), 0);
        assert.ok(sent.includes('109:queued') && sent.includes('110:queued'));
    });

    await t.test('sıradaki fatura normal taramada ikinci kez gönderilmez', async () => {
        const r = row(111);
        integ.state.setDoc(integ.documentKey(ctx, r), { status: 'queued', queuedAt: new Date().toISOString(), contextKey: integ.key(ctx), ind: 111 });
        const res = await Integration.prototype.processOne.call(integ, ctx, r, 'initial');
        assert.deepEqual(res, { skipped: 'queued', belgeNo: r.BELGENO });
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  3) ShopStar tahsilat bildirimi
// ═══════════════════════════════════════════════════════════════════════════
test('ShopStar yoğun trafik modu', async (t) => {
    const base = mk('shopstar');
    const P = 'F0101D0017';
    const bugun = new Date().toISOString().slice(0, 10);
    const iki = new Date(Date.now() - 2 * DK).toISOString();
    const kalem = (ind, musteri) => ({ ind, musteri, izahat: 2, evrak: `H${ind}`, odenen: 250, bakiye: 500, bordroInd: ind, tarih: bugun, prefix: P, foundAt: iki });
    fs.writeFileSync(path.join(base, 'data', 'shopstar.json'), JSON.stringify({ firmaNo: '0101', donemNo: '0017', payment: { enabled: true } }));
    fs.writeFileSync(path.join(base, 'data', 'shopstar-state.json'), JSON.stringify({ wm: { [P]: 100 }, payQueue: [kalem(101, 7), kalem(102, 8), kalem(103, 9)] }));

    let yeniSatirlar = [];
    const pool = {
        connected: true,
        request() {
            return {
                input() {},
                async query(m) {
                    if (/INFORMATION_SCHEMA\.TABLES/.test(m)) return { recordset: [{ c: 1 }] };
                    if (/INFORMATION_SCHEMA\.COLUMNS/.test(m)) return { recordset: [{ COLUMN_NAME: 'ISLEMTARIHI' }] };
                    if (/WHERE IND > @wm/.test(m)) { const r = yeniSatirlar; yeniSatirlar = []; return { recordset: r }; }
                    return { recordset: [] };
                },
            };
        },
    };
    const gidenler = [];
    const slow = {
        on: true, open: false, deadlineAt: Date.now() + 6 * 3600 * 1000,
        active: () => slow.on,
        peek: () => (slow.open ? { ok: true, active: true } : { ok: false, active: true, reason: 'Yoğun trafik modu: sıradaki gönderim 14:20' }),
        take() {
            if (!slow.open) return { ok: false, reason: 'Yoğun trafik modu: sıradaki gönderim 14:20', release() {} };
            slow.open = false;
            return { ok: true, release(used) { if (!used) slow.open = true; } };
        },
        deadline: () => slow.deadlineAt,
    };
    const shopstar = require('../shopstar');
    shopstar.configure({
        getPool: () => pool, sql: { NVarChar: 'nvarchar', Int: 'int' }, baseDir: base,
        resolveCariContacts: async (f, ids) => new Map(ids.map(i => [i, { name: `Müşteri ${i}`, firma: `Firma ${i}`, kod: `C${i}`, phone: `90532000000${i}`, phones: [`90532000000${i}`], valid: true }])),
        waSend: async (phone, text) => { gidenler.push(phone); return { success: true, id: `m-${gidenler.length}` }; },
        checkOnWhatsApp: async () => ({ exists: true }),
        waStatus: () => ({ ready: true, me: '905001112233' }),
        gate: () => ({ ok: true }), getFirmaName: async () => 'Test Firma', slow,
    });

    await t.test('hak yokken tahsilat bildirimi gitmez, kuyrukta bekler', async () => {
        await shopstar.tick();
        assert.equal(gidenler.length, 0);
        assert.equal(shopstar.getStatus().payQueue, 3);
        assert.equal(shopstar.getStatus().slow, true);
    });

    await t.test('hak açılınca tek bildirim gider, sonrası yine bekler', async () => {
        slow.open = true;
        await shopstar.tick();
        assert.equal(gidenler.length, 1);
        assert.equal(shopstar.getStatus().payQueue, 2);
        await shopstar.tick();                                   // hak kapandı
        assert.equal(gidenler.length, 1);
        assert.equal(shopstar.getStatus().payQueue, 2);
    });

    await t.test('"Birikmiş mesajları temizle" tahsilat sırasını da boşaltır', () => {
        assert.equal(shopstar.clearPending(), 2);
        assert.equal(shopstar.getStatus().payQueue, 0);
        assert.equal(shopstar.clearPending(), 0);
        assert.ok(shopstar.getLog().some(l => l.status === 'cleared' && /elle temizlendi/.test(l.error)));
    });

    await t.test('gün sonu: pencere kapanınca sırada kalan bildirim silinir', async () => {
        yeniSatirlar = [{ IND: 104, MUSTERINO: 7, IZAHAT: 2, EVRAKNO: 'H104', ODENEN: 250, BAKIYE: 500, BORDROIND: 104, ISLEMYMD: bugun }];
        slow.deadlineAt = Date.now() - 1000;
        const once = gidenler.length;
        await shopstar.tick();
        assert.equal(shopstar.getStatus().payQueue, 0);
        assert.equal(gidenler.length, once);
        assert.ok(shopstar.getLog().some(l => l.status === 'cleared' && /Gün sonu/.test(l.error)));
    });
});
