// Çok firma: firma profilleri deposu, geriye uyum, hat çözümleme, gelen mesaj yönlendirme.
// Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const profiles = require('../profiles');

function kur(t, { ctx = { firmaNo: '0101', donemNo: '0017' }, hesaplar = ['main', 'a2', 'a3'], yerel = true, onceden } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-profiles-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    if (onceden) {
        fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
        onceden(dir);
    }
    const durum = { ctx, yerel };
    profiles.configure({
        baseDir: dir,
        getLegacyContext: () => durum.ctx,
        hasAccount: (id) => hesaplar.includes(id),
        isLocalMode: () => durum.yerel,
    });
    return { dir, durum, dosya: path.join(dir, 'data', 'profiles.json') };
}

// ─── Geriye uyum: tek firmalı mevcut kurulum ────────────────────────────────

test('profil dosyası yoksa tek örtük profil eski bağlamdan türer ve diske HİÇBİR ŞEY yazılmaz', (t) => {
    const k = kur(t);
    const liste = profiles.list();
    assert.equal(liste.length, 1);
    assert.deepEqual(
        { id: liste[0].id, firmaNo: liste[0].firmaNo, donemNo: liste[0].donemNo, enabled: liste[0].enabled, waAccount: liste[0].waAccount },
        { id: 'default', firmaNo: '0101', donemNo: '0017', enabled: true, waAccount: null },
    );
    assert.equal(liste[0].implicit, true);
    assert.equal(profiles.isExplicit(), false);
    assert.equal(profiles.isMulti(), false);
    assert.equal(fs.existsSync(k.dosya), false, 'profiles.json kendiliğinden oluşmamalı');
});

test('örtük profil eski motor ayarı değişince onu izler (firma/dönem ekranları eskisi gibi çalışır)', (t) => {
    const k = kur(t);
    k.durum.ctx = { firmaNo: '0102', donemNo: '0003' };
    assert.equal(profiles.getDefault().firmaNo, '0102');
    assert.equal(profiles.getDefault().donemNo, '0003');
});

test('tek firmada motor dosyaları eski yerinde: default profilin kök klasörü baseDir', (t) => {
    const k = kur(t);
    assert.equal(profiles.baseDirFor('default'), k.dir);
    assert.equal(profiles.baseDirFor('p2'), path.join(k.dir, 'profiles', 'p2'));
});

test('tek firmada hat havuzdur: waAccount yok, opts eski; yapışkan kapsam yok', (t) => {
    kur(t);
    const p = profiles.getDefault();
    assert.deepEqual(profiles.resolveLine(p), { mode: 'pool' });
    assert.equal(profiles.stickyScope(p), null);
});

test('tek firmada profil ayarı yazılamaz (ikinci firma gelmeden dosya oluşmaz)', (t) => {
    const k = kur(t);
    const r = profiles.update('default', { label: 'X' });
    assert.equal(r.success, false);
    assert.equal(fs.existsSync(k.dosya), false);
});

test('bozuk profiles.json tek firma moduna düşer ve yan yana yedeklenir', (t) => {
    const k = kur(t, {
        onceden: (dir) => fs.writeFileSync(path.join(dir, 'data', 'profiles.json'), '{ bozuk'),
    });
    assert.equal(profiles.isExplicit(), false);
    assert.equal(profiles.list().length, 1);
    const yedek = fs.readdirSync(path.join(k.dir, 'data')).filter((f) => f.startsWith('profiles.json.bozuk-'));
    assert.equal(yedek.length, 1);
});

// ─── İkinci firmayı eklemek ────────────────────────────────────────────────

test('ilk ek firma: örtük profil dosyaya terfi eder, varsayılan firma main hattına sabitlenir', (t) => {
    const k = kur(t);
    const r = profiles.add({ firmaNo: '0102', donemNo: '0003', label: 'İkinci', waAccount: 'a2' });
    assert.equal(r.success, true);
    assert.equal(r.profile.id, 'p2');
    assert.equal(fs.existsSync(k.dosya), true);
    const l = profiles.list();
    assert.deepEqual(l.map((p) => [p.id, p.firmaNo, p.donemNo, p.waAccount, p.enabled]), [
        ['default', '0101', '0017', 'main', true],
        ['p2', '0102', '0003', 'a2', true],
    ]);
    assert.equal(profiles.isMulti(), true);
    assert.equal(profiles.stickyScope(profiles.get('p2')), 'F0102');
    // yeniden yükleme aynı sonucu verir
    profiles.reload();
    assert.deepEqual(profiles.list().map((p) => p.id), ['default', 'p2']);
});

test('aynı firma iki kez eklenemez (çift mesaj olurdu), dönem ve firma zorunlu', (t) => {
    kur(t);
    assert.equal(profiles.add({ firmaNo: '0101', donemNo: '0017', waAccount: 'a2' }).success, false);
    assert.equal(profiles.add({ firmaNo: '', donemNo: '0003' }).success, false);
    assert.equal(profiles.add({ firmaNo: '0102', donemNo: '' }).success, false);
    assert.equal(profiles.add({ firmaNo: 'abc', donemNo: '0003' }).success, false);
    assert.equal(profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'yok' }).success, false, 'olmayan hesap reddedilir');
});

test('4 firmalı kurulum: her firma ayrı hat, firma numarası değişmez, silme ve kapatma', (t) => {
    const k = kur(t, { hesaplar: ['main', 'a2', 'a3', 'a4'] });
    for (const [f, d, h] of [['0102', '0001', 'a2'], ['0103', '0002', 'a3'], ['0104', '0005', 'a4']]) {
        assert.equal(profiles.add({ firmaNo: f, donemNo: d, waAccount: h }).success, true);
    }
    assert.equal(profiles.list().length, 4);
    assert.equal(profiles.enabled().length, 4);
    assert.deepEqual(profiles.list().map((p) => p.waAccount), ['main', 'a2', 'a3', 'a4']);
    // firmaNo güncellenemez (ek firma); dönem ve etiket güncellenir
    profiles.update('p2', { firmaNo: '0999', donemNo: '0002', label: 'Yeni ad' });
    assert.equal(profiles.get('p2').firmaNo, '0102');
    assert.equal(profiles.get('p2').donemNo, '0002');
    assert.equal(profiles.get('p2').label, 'Yeni ad');
    // ilk firma silinemez ama kapatılabilir
    assert.equal(profiles.remove('default').success, false);
    assert.equal(profiles.update('default', { enabled: false }).success, true);
    assert.equal(profiles.enabled().length, 3);
    // ek firma silinir; kimliği yeniden kullanılmaz
    assert.equal(profiles.remove('p3').success, true);
    const yeni = profiles.add({ firmaNo: '0105', donemNo: '0001', waAccount: 'a3' });
    assert.equal(yeni.profile.id, 'p5');
    assert.ok(JSON.parse(fs.readFileSync(k.dosya, 'utf8')).profiles.length === 4);
});

test('hesap silinince ona bağlı profillerin hattı boşalır', (t) => {
    kur(t);
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    assert.deepEqual(profiles.unbindAccount('a2'), ['p2']);
    assert.equal(profiles.get('p2').waAccount, null);
});

test('e-Fatura sahibi en çok bir firma olur', (t) => {
    kur(t);
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    profiles.update('p2', { efatura: true });
    assert.equal(profiles.get('p2').efatura, true);
    profiles.update('default', { efatura: true });
    assert.equal(profiles.get('default').efatura, true);
    assert.equal(profiles.get('p2').efatura, false);
});

test('cloud/relay modunda ikinci etkin firma eklenemez', (t) => {
    kur(t, { yerel: false });
    const r = profiles.add({ firmaNo: '0102', donemNo: '0003' });
    assert.equal(r.success, false);
    assert.match(r.message, /Yerel/);
});

// ─── Hat çözümleme (sıkı bağlama) ──────────────────────────────────────────

test('çok firmada hat: atanmış hat sıkı, atanmamış/yok hesap hiçbir yerden gönderilmez', (t) => {
    kur(t);
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    profiles.add({ firmaNo: '0103', donemNo: '0003' });       // hat atanmadı
    assert.deepEqual(profiles.resolveLine(profiles.get('default')), { mode: 'strict', accountId: 'main' });
    assert.deepEqual(profiles.resolveLine(profiles.get('p2')), { mode: 'strict', accountId: 'a2' });
    const p3 = profiles.resolveLine(profiles.get('p3'));
    assert.equal(p3.mode, 'none');
    assert.match(p3.reason, /atanmamış/);
    // hesabı sonradan kaybolan profil de 'none' olur (havuza düşmez)
    const kayip = profiles.resolveLine(profiles.get('p2'), { hasAccount: () => false });
    assert.equal(kayip.mode, 'none');
});

test('cloud/relay + çok firma: hiçbir firma gönderemez (yanlış numaradan mesaj gitmesin)', (t) => {
    const k = kur(t);
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    k.durum.yerel = false;
    assert.equal(profiles.resolveLine(profiles.get('default')).mode, 'none');
    assert.equal(profiles.resolveLine(profiles.get('p2')).mode, 'none');
});

test('tek etkin firma kalınca (diğeri kapalı) havuz davranışı ya da atanmış hat geçerli', (t) => {
    kur(t);
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    profiles.update('p2', { enabled: false });
    assert.equal(profiles.isMulti(), false);
    assert.equal(profiles.stickyScope(profiles.get('default')), null);
    assert.deepEqual(profiles.resolveLine(profiles.get('default')), { mode: 'strict', accountId: 'main' });
    profiles.update('default', { waAccount: null });
    assert.deepEqual(profiles.resolveLine(profiles.get('default')), { mode: 'pool' });
});

test('istek profili: bilinmeyen kimlik varsayılana, varsayılan kapalıysa ilk etkin profile düşer', (t) => {
    kur(t);
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    assert.equal(profiles.pick('yok').id, 'default');
    assert.equal(profiles.pick('p2').id, 'p2');
    profiles.update('default', { enabled: false });
    assert.equal(profiles.pick(null).id, 'p2');
    assert.equal(profiles.forFirma('0102').id, 'p2');
    assert.equal(profiles.forFirma('0101'), null, 'kapalı firma etkin aramada çıkmaz');
});

// ─── Gelen mesaj → hangi firmanın botu ─────────────────────────────────────

test('AI yönlendirme: çok firmada adaylar yalnız gelen hatta bağlı etkin firmalardır', (t) => {
    kur(t, { hesaplar: ['main', 'a2', 'a3'] });
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    profiles.add({ firmaNo: '0103', donemNo: '0003', waAccount: 'a2' });   // a2 iki firmayla ortak
    assert.deepEqual(profiles.incomingCandidates('a2').map((p) => p.id), ['p2', 'p3']);
    assert.deepEqual(profiles.incomingCandidates('main').map((p) => p.id), ['default']);
    assert.deepEqual(profiles.incomingCandidates('a3'), [], 'hiçbir firmaya bağlı olmayan hat');
});

test('AI yönlendirme: tek firmada her zaman tek (etkin) profil', (t) => {
    kur(t);
    assert.deepEqual(profiles.incomingCandidates('a9').map((p) => p.id), ['default']);
    assert.deepEqual(profiles.incomingCandidates(null).map((p) => p.id), ['default']);
});

test('AI yönlendirme: hat birden çok firmaya bağlıysa telefon sırayla her firmada aranır, ilk bulunan kazanır', async (t) => {
    kur(t);
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    profiles.add({ firmaNo: '0103', donemNo: '0003', waAccount: 'a2' });
    const cands = profiles.incomingCandidates('a2');
    const arananlar = [];
    const cariVar = { '0103': true };                      // numara yalnız 0103'te cari
    const sec = await profiles.chooseForIncoming(cands, '905321112233', {
        findCari: async (p) => { arananlar.push(p.firmaNo); return cariVar[p.firmaNo]; },
        isBotOn: () => false,
    });
    assert.equal(sec.id, 'p3');
    assert.deepEqual(arananlar, ['0102', '0103'], 'her bağlı firmada aranır');
});

test('AI yönlendirme: tek aday doğrudan seçilir (gereksiz cari sorgusu yok); hiçbirinde yoksa botu açık ilk aday', async (t) => {
    kur(t);
    profiles.add({ firmaNo: '0102', donemNo: '0003', waAccount: 'a2' });
    profiles.add({ firmaNo: '0103', donemNo: '0003', waAccount: 'a2' });
    let sorgu = 0;
    const tek = await profiles.chooseForIncoming([profiles.get('p2')], '905', { findCari: async () => { sorgu++; return false; } });
    assert.equal(tek.id, 'p2');
    assert.equal(sorgu, 0);
    const yok = await profiles.chooseForIncoming(profiles.incomingCandidates('a2'), '905', {
        findCari: async () => null,
        isBotOn: (p) => p.id === 'p3',
    });
    assert.equal(yok.id, 'p3', 'bilinmeyen numara: botu açık firma karşılar');
    // bir firmada sorgu hata verirse sıradakine geçilir
    const hata = await profiles.chooseForIncoming(profiles.incomingCandidates('a2'), '905', {
        findCari: async (p) => { if (p.id === 'p2') throw new Error('sql'); return true; },
    });
    assert.equal(hata.id, 'p3');
    assert.equal(await profiles.chooseForIncoming([], '905', {}), null);
});
