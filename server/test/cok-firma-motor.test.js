// Çok firma: profil başına motor kümeleri (engines.js) — izolasyon, ayrı watermark/state,
// ayar kopyalama, tek firmada eski dosyaların aynen korunması. Gerçek veritabanı/WhatsApp yok.
// Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-motor-'));
const data = path.join(dir, 'data');
fs.mkdirSync(data, { recursive: true });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const T1 = 'F0101D0017TBLCARIHAREKETLERI';
const T2 = 'F0102D0003TBLCARIHAREKETLERI';
const T3 = 'F0103D0001TBLCARIHAREKETLERI';

// ── ESKİ KURULUM: profiles.json yok, motor dosyaları baseDir/data altında ──
fs.writeFileSync(path.join(data, 'watcher.json'), JSON.stringify({
    enabled: false, firmaNo: '0101', donemNo: '0017', intervalSec: 45,
    rules: [{ id: 'satisFaturasi', docType: 'satisFaturasi', name: 'Satış Faturası', direction: 'borc', izahatCodes: [21], enabled: true, template: 'Sayın {firma}, faturanız kesildi. {firmaadi}' }],
}));
fs.writeFileSync(path.join(data, 'watcher-state.json'), JSON.stringify({ lastSeenInd: { [T1]: 88 } }));
fs.writeFileSync(path.join(data, 'siparis.json'), JSON.stringify({ enabled: true, firmaNo: '0101', donemNo: '0017', phone: '905320000001' }));
fs.writeFileSync(path.join(data, 'reminders.json'), JSON.stringify({
    firmaNo: '0101', donemNo: '0017',
    reminders: [{ id: 'anyBalance', type: 'anyBalance', name: 'Bakiye', enabled: true, template: 'Sayın {firma} {bakiye}', intervalDays: 7, sendTime: '10:00', perCariLastSent: { 42: '2026-10-30T10:00:00Z' }, perCariTried: { 43: { at: 1 } }, lastRunAt: '2026-10-30T10:00:00Z' }],
}));

// ── Taklit veritabanı: yalnız watcher'ın ilk tarama sorguları ──
const maks = { [T1]: 100, [T2]: 500, [T3]: 900 };
const sorgular = [];
const havuz = {
    connected: true,
    request() {
        const girdiler = {};
        return {
            input(ad, _tip, deger) { girdiler[ad] = deger; },
            async query(metin) {
                sorgular.push(metin);
                if (/INFORMATION_SCHEMA\.TABLES/.test(metin)) return { recordset: [{ c: 1 }] };
                const m = /FROM \[(F\d+D\d+TBLCARIHAREKETLERI)\]/.exec(metin);
                if (/MIN\(IND\)/.test(metin)) return { recordset: [{ mn: 0 }] };
                if (/ISNULL\(MAX\(IND\), @last\)/.test(metin)) return { recordset: [{ mx: Math.max(maks[m[1]] || 0, girdiler.last || 0) }] };
                if (/ISNULL\(MAX\(IND\),0\)/.test(metin)) return { recordset: [{ mx: maks[m[1]] || 0 }] };
                return { recordset: [] };
            },
        };
    },
};
const sql = { NVarChar: 'nvarchar', Int: 'int', VarChar: 'varchar', Date: 'date', Decimal: () => 'dec' };

const profiles = require('../profiles');
const engines = require('../engines');
const tekil = {
    watcher: require('../watcher'), siparis: require('../siparis'), vade: require('../vade'),
    reminders: require('../reminders'), shopstar: require('../shopstar'), aiBot: require('../aiBot'),
};

const gonderilen = [];
profiles.configure({ baseDir: dir, getLegacyContext: () => ({ firmaNo: '0101', donemNo: '0017' }), hasAccount: () => true, isLocalMode: () => true });

function bagimliliklar(profil) {
    const baseDir = profiles.baseDirFor(profil.id);
    return {
        getPool: () => havuz, sql, baseDir,
        resolveCariContacts: async () => new Map(),
        reminderCandidateInds: async () => [], activeCariInds: async () => new Set(), existingCariInds: async () => null,
        waSend: async (phone, text, media, opts) => { gonderilen.push({ profil: profil.id, phone, text, opts }); return { success: true, id: 'x' }; },
        waDelete: async () => ({ success: true }),
        checkOnWhatsApp: async () => ({ exists: true }),
        waStatus: () => ({ ready: true, me: '905000000001:1@s.whatsapp.net' }),
        gate: () => ({ ok: true }),
        recordSent: () => { },
        getFirmaName: async (firmaNo) => `Firma-${firmaNo}`,
        buildDocContentText: async () => '', buildSiparisContentText: async () => '',
        isSuspended: () => false, shouldAskSave: () => false, isOptedOut: () => false, saveContactText: '',
        findCariByPhone: async () => null, fetchNetBalances: async () => new Map(), fetchRecentMovements: async () => [], fetchLastSalesInvoice: async () => null,
        encryptSecret: (s) => s, decryptSecret: (s) => s, credits: null,
    };
}
engines.configure({
    defaultSet: tekil,
    baseDirFor: (id) => profiles.baseDirFor(id),
    log: () => { },
    configureSet: (set, profil) => { for (const n of engines.NAMES) set[n].configure(bagimliliklar(profil)); },
});
engines.registerDefault(tekil, profiles.getDefault());

test('geriye uyum: varsayılan profil eski tekil modüllerdir; eski watermark/ayar aynen yüklenir, dosya oluşmaz', () => {
    assert.equal(engines.of('default').watcher, tekil.watcher);
    assert.equal(require('../watcher'), tekil.watcher, 'modül önbelleği bozulmadı');
    const s = tekil.watcher.getStatus();
    assert.equal(s.firmaNo, '0101');
    assert.equal(s.donemNo, '0017');
    assert.equal(s.watermark, 88, 'eski watcher-state.json okundu (anahtar tablo adı, göç gerekmez)');
    assert.equal(s.intervalSec, 45);
    assert.equal(s.rules.find((r) => r.id === 'satisFaturasi').enabled, true);
    assert.equal(tekil.siparis.getConfig().phone, '905320000001');
    assert.equal(tekil.reminders.getConfig().reminders[0].perCariLastSent['42'], '2026-10-30T10:00:00Z');
    assert.equal(fs.existsSync(path.join(data, 'profiles.json')), false, 'tek firmada profiles.json yazılmaz');
    assert.equal(fs.existsSync(path.join(dir, 'profiles')), false, 'tek firmada profiles/ klasörü açılmaz');
});

test('ek firma: motorlar ayrı kopya, ayrı dosya klasörü; tekil modüller etkilenmez', () => {
    const r = profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    assert.equal(r.success, true);
    const set = engines.ensure(r.profile);
    for (const n of engines.NAMES) assert.notEqual(set[n], tekil[n], `${n}: ayrı kopya`);
    assert.equal(require('../watcher'), tekil.watcher, 'önbellekteki asıl modül yerinde');
    assert.equal(engines.applyContext(r.profile), true);
    assert.equal(set.watcher.getStatus().firmaNo, '0102');
    assert.equal(set.watcher.getStatus().donemNo, '0003');
    assert.equal(tekil.watcher.getStatus().firmaNo, '0101', 'ilk firmanın ayarı değişmedi');
    // ayar dosyaları profilin kendi klasöründe
    const p2 = path.join(dir, 'profiles', 'p2', 'data');
    assert.equal(JSON.parse(fs.readFileSync(path.join(p2, 'watcher.json'), 'utf8')).firmaNo, '0102');
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'watcher.json'), 'utf8')).firmaNo, '0101');
    // aynı kimlikle tekrar istenen küme aynı nesnedir
    assert.equal(engines.ensure(r.profile), set);
});

test('her firmanın watermark/state\'i ayrı: tablo adı ve dosya bazında bağımsız ilerler', async () => {
    const a = engines.of('default').watcher;
    const b = engines.of('p2').watcher;
    assert.equal(a.getStatus().watermark, 88);
    await a.pollOnce();
    await b.pollOnce();
    assert.equal(a.getStatus().watermark, 100, 'eski watermark (88) korunup oradan devam edildi, yeniden ilklenmedi');
    assert.equal(b.getStatus().watermark, 500, 'yeni firma izlemeyi bugünden başlatır, geçmişe mesaj atmaz');
    // diskte ayrı dosyalar, birbirinin tablosunu içermez
    const sa = JSON.parse(fs.readFileSync(path.join(data, 'watcher-state.json'), 'utf8')).lastSeenInd;
    const sb = JSON.parse(fs.readFileSync(path.join(dir, 'profiles', 'p2', 'data', 'watcher-state.json'), 'utf8')).lastSeenInd;
    assert.deepEqual(Object.keys(sa), [T1]);
    assert.deepEqual(Object.keys(sb), [T2]);
    // yalnız ikinci firmanın tablosuna yeni belge düşer: yalnız onun watermark'ı ilerler
    maks[T2] = 520;
    await a.pollOnce();
    await b.pollOnce();
    assert.equal(a.getStatus().watermark, 100, "A kendi tablosunu izler, B'nin ilerlemesi ona yansımaz");
    assert.equal(b.getStatus().watermark, 520);
    // her firma yalnız kendi tablosunu sorguladı
    assert.ok(sorgular.some((q) => q.includes(T1)) && sorgular.some((q) => q.includes(T2)));
});

test('dönem değişince yeni dönemin geçmişine mesaj atılmaz: watermark yeni tabloda sıfırdan ilklenir', async () => {
    const b = engines.of('p2').watcher;
    const r = profiles.update('p2', { donemNo: '0004' });
    assert.equal(r.success, true);
    assert.equal(engines.applyContext(r.profile), true);
    assert.equal(b.getStatus().donemNo, '0004');
    assert.equal(b.getStatus().watermark, null, 'yeni tablo için watermark yok → ilk taramada mevcut en büyük IND alınır');
    assert.equal(engines.applyContext(r.profile), false, 'değişiklik yoksa dokunmaz');
    profiles.update('p2', { donemNo: '0003' });
    engines.applyContext(profiles.get('p2'));
});

test('hatırlatma/sipariş/vade/shopstar/AI da firma başına ayrı yapılandırılır', () => {
    const set = engines.of('p2');
    assert.equal(set.reminders.getConfig().firmaNo, '0102');
    assert.equal(set.siparis.getConfig().firmaNo, '0102');
    assert.equal(set.vade.getConfig().firmaNo, '0102');
    assert.equal(set.shopstar.getConfig().firmaNo, '0102');
    assert.equal(set.aiBot.getConfig().firmaNo, '0102');
    // ilk firmanın hatırlatma durumu (müşteri-başı gönderim kaydı) ikinci firmaya sızmaz
    assert.deepEqual(set.reminders.getConfig().reminders[0].perCariLastSent, {});
    assert.equal(tekil.reminders.getConfig().reminders[0].perCariLastSent['42'], '2026-10-30T10:00:00Z');
});

test('ayar kopyalama: kurallar/şablonlar gelir; açık bayraklar, iç numaralar ve cari-kimlikli kayıtlar gelmez', () => {
    fs.writeFileSync(path.join(data, 'vade.json'), JSON.stringify({ enabled: true, firmaNo: '0101', donemNo: '0017', phone: '905320000002', customer: { enabled: true, days: [3] } }));
    fs.writeFileSync(path.join(data, 'watcher-media-satisFaturasi.jpg'), 'resim');
    const r = profiles.add({ firmaNo: '0103', donemNo: '0001', waAccount: 'a3' });
    const set = engines.ensure(r.profile, { copyFrom: 'default' });
    engines.applyContext(r.profile);
    const w = set.watcher.getStatus();
    assert.equal(w.firmaNo, '0103');
    assert.equal(w.enabled, false, 'kopya otomatik gönderim açık gelmez');
    assert.equal(w.intervalSec, 45);
    const kural = w.rules.find((x) => x.id === 'satisFaturasi');
    assert.equal(kural.enabled, true);
    assert.match(kural.template, /faturanız kesildi/);
    assert.equal(set.siparis.getConfig().enabled, false);
    assert.equal(set.siparis.getConfig().phone, '', 'iç bildirim numarası kopyalanmaz');
    assert.equal(set.vade.getConfig().phone, '');
    assert.equal(set.vade.getConfig().customer.enabled, false, 'müşteriye giden vade bildirimi kopyada kapalı');
    const rem = set.reminders.getConfig().reminders[0];
    assert.equal(rem.enabled, false);
    assert.deepEqual(rem.perCariLastSent, {});
    assert.deepEqual(rem.perCariTried, {});
    assert.equal(rem.lastRunAt, null);
    assert.match(rem.template, /Sayın \{firma\}/, 'şablon kopyalandı');
    // durum dosyaları kopyalanmadı
    assert.equal(fs.existsSync(path.join(dir, 'profiles', r.profile.id, 'data', 'watcher-state.json')), false);
    // medya dosyası kural için kopyalandı
    assert.equal(fs.existsSync(path.join(dir, 'profiles', r.profile.id, 'data', 'watcher-media-satisFaturasi.jpg')), true);
    // kaynak dosyalar değişmedi
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'siparis.json'), 'utf8')).phone, '905320000001');
});

test('profil kapatılınca zamanlayıcılar durur ama "açık" bayrağı korunur (yeniden açılınca dönsün)', () => {
    const set = engines.of('p2');
    set.watcher.setConfig({ enabled: true });
    engines.pause('p2');
    assert.equal(set.watcher.getStatus().running, false);
    assert.equal(set.watcher.getConfig().enabled, true, 'kalıcı bayrak bozulmadı');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'profiles', 'p2', 'data', 'watcher.json'), 'utf8')).enabled, true);
    engines.drop('p2');
    assert.equal(engines.has('p2'), false);
    assert.equal(engines.has('default'), true, 'varsayılan küme bırakılmaz');
    assert.equal(fs.existsSync(path.join(dir, 'profiles', 'p2', 'data', 'watcher.json')), true, 'diskteki ayarlar silinmez');
});
