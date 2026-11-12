// Dönüş-budama (cevapsız numara) susturmasının otomatik geri alınması. Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GUN = 24 * 60 * 60 * 1000;
const NUMARA = '905321112233';

// stats modül durumu tutar; her test temiz bir kopya, geçici veri klasörü ve sahte saat alır.
function taze(t, baslangic = '2026-11-02T09:00:00Z') {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(baslangic) });
    delete require.cache[require.resolve('../stats')];
    const stats = require('../stats');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-stats-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    stats.configure(dir);
    return { stats, dir };
}

// Numaraya limit kadar cevapsız otomatik mesaj gönderip susturur.
function sustur(stats, phone = NUMARA, adet = 6) {
    for (let i = 0; i < adet; i++) stats.recordSent({ id: `m${phone}-${i}`, phone, channel: 'belge' });
}

test('varsayılan 15 gün: susturulan numara 15 gün dolmadan kapalı, dolunca açılır', (t) => {
    const { stats } = taze(t);
    assert.equal(stats.guardConfig().reinstateDays, 15);
    sustur(stats);
    assert.equal(stats.isSuspended(NUMARA), true);

    t.mock.timers.tick(14 * GUN + 23 * 60 * 60 * 1000);
    assert.equal(stats.isSuspended(NUMARA), true, '15 gün dolmadan susturma sürer');

    t.mock.timers.tick(2 * 60 * 60 * 1000);
    assert.equal(stats.isSuspended(NUMARA), false, '15 gün dolunca numara yeniden devreye girer');
});

test('geri alınınca streak sıfırdan sayılır: tekrar limit kadar cevapsız gidince yine susar', (t) => {
    const { stats } = taze(t);
    sustur(stats);
    t.mock.timers.tick(16 * GUN);
    assert.equal(stats.isSuspended(NUMARA), false);

    // "Durdurulanları sıfırla" ile aynı sonuç: 6 mesaj daha gidebilir, 6. cevapsızda yine durur.
    for (let i = 0; i < 5; i++) {
        stats.recordSent({ id: `y${i}`, phone: NUMARA, channel: 'belge' });
        assert.equal(stats.isSuspended(NUMARA), false, `${i + 1}. mesajdan sonra susmamalı`);
    }
    stats.recordSent({ id: 'y5', phone: NUMARA, channel: 'belge' });
    assert.equal(stats.isSuspended(NUMARA), true);

    // Süre yeni susturmadan (son mesajdan) sayılır, eski tarihten değil.
    t.mock.timers.tick(10 * GUN);
    assert.equal(stats.isSuspended(NUMARA), true);
    t.mock.timers.tick(6 * GUN);
    assert.equal(stats.isSuspended(NUMARA), false);
});

test('0 gün: otomatik geri alma kapalı, susturma elle sıfırlanana kadar sürer', (t) => {
    const { stats } = taze(t);
    stats.setGuard({ reinstateDays: 0 });
    assert.equal(stats.guardConfig().reinstateDays, 0);
    sustur(stats);
    t.mock.timers.tick(400 * GUN);
    assert.equal(stats.isSuspended(NUMARA), true);
    assert.equal(stats.reinstateExpired(), 0);
    stats.resetEngage();
    assert.equal(stats.isSuspended(NUMARA), false);
});

test('gün sayısı ayarlanabilir; geçersiz değer kapalı sayılır, boş ayar varsayılana düşer', (t) => {
    const { stats } = taze(t);
    stats.setGuard({ reinstateDays: 3 });
    sustur(stats);
    t.mock.timers.tick(2 * GUN);
    assert.equal(stats.isSuspended(NUMARA), true);
    t.mock.timers.tick(2 * GUN);
    assert.equal(stats.isSuspended(NUMARA), false);

    assert.equal(stats.setGuard({ reinstateDays: 'abc' }).reinstateDays, 0);
    assert.equal(stats.setGuard({ reinstateDays: -5 }).reinstateDays, 0);
    assert.equal(stats.setGuard({ reinstateDays: 7.9 }).reinstateDays, 7);
    // Başka bir alan kaydedilirken gün sayısı bozulmaz.
    assert.equal(stats.setGuard({ noReplyLimit: 4 }).reinstateDays, 7);
});

test('susturulan numara cevap verirse zaten açılır (mevcut davranış bozulmaz)', (t) => {
    const { stats } = taze(t);
    sustur(stats);
    assert.equal(stats.isSuspended(NUMARA), true);
    stats.onIncoming(NUMARA);
    assert.equal(stats.isSuspended(NUMARA), false);
});

test('guard kapalıyken hiçbir numara susturulmuş sayılmaz ve geri alma çalışmaz', (t) => {
    const { stats } = taze(t);
    sustur(stats);
    stats.setGuard({ enabled: false });
    assert.equal(stats.isSuspended(NUMARA), false);
    t.mock.timers.tick(30 * GUN);
    assert.equal(stats.reinstateExpired(), 0);
});

test('toplu geri alma: yalnız süresi dolanlar açılır, özet ve kayıt buna göre', (t) => {
    const { stats, dir } = taze(t);
    sustur(stats, '905000000001');
    t.mock.timers.tick(10 * GUN);
    sustur(stats, '905000000002');
    t.mock.timers.tick(6 * GUN); // birincisi 16 gündür, ikincisi 6 gündür susturulu

    const once = stats.engageSummary(); // özet istenince süresi dolanlar geri alınır
    assert.equal(once.reinstateDays, 15);
    assert.equal(once.suspendedCount, 1);
    assert.equal(once.suspended[0].phone, '905000000002');
    assert.equal(once.suspended[0].reinstateAt, once.suspended[0].lastOutAt + 15 * GUN, 'geri alınma zamanı listede görünür');

    // Kayıt diske yazıldı: yeniden yüklenince birinci numara açık kalır, ikincisi susturulu kalır.
    const yeni = (() => {
        delete require.cache[require.resolve('../stats')];
        const s = require('../stats');
        s.configure(dir);
        return s;
    })();
    assert.equal(yeni.isSuspended('905000000001'), false);
    assert.equal(yeni.isSuspended('905000000002'), true);
});

test('açılışta (configure) süresi dolmuş susturmalar geri alınır: uygulama kapalıyken geçen günler sayılır', (t) => {
    const { stats, dir } = taze(t);
    sustur(stats);
    assert.equal(stats.isSuspended(NUMARA), true);
    // Uygulama kapalıyken 20 gün geçti; yeniden açılış.
    t.mock.timers.tick(20 * GUN);
    delete require.cache[require.resolve('../stats')];
    const yeni = require('../stats');
    yeni.configure(dir);
    assert.equal(yeni.engageSummary().suspendedCount, 0);
    assert.equal(yeni.isSuspended(NUMARA), false);
});
