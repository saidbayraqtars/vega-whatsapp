// Anti-ban kapısı kuralları. Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// antiban modül durumu tutar; her test temiz bir kopya ve geçici veri klasörü alır.
function taze(t, baslangic = '2026-10-13T08:00:00Z') {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(baslangic) });
    delete require.cache[require.resolve('../antiban')];
    const antiban = require('../antiban');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-antiban-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    antiban.configure(dir);
    return antiban;
}

const OLGUN = '905000000001';
const IKINCI = '905000000002';

// Numarayı ısınmayı bitirmiş say (warm-up rampı testleri bozmasın).
function olgunlastir(t, antiban, hesap) {
    antiban.gate(hesap, null, 'belge');
    t.mock.timers.tick(10 * 24 * 60 * 60 * 1000);
}

test('hatırlatma kanalı saatte 10 gönderimde durur, diğer kanallar sürer', (t) => {
    const antiban = taze(t);
    olgunlastir(t, antiban, OLGUN);
    for (let i = 0; i < antiban.CHANNEL_LIMITS.reminder.hourly; i++) {
        assert.equal(antiban.gate(OLGUN, null, 'reminder').ok, true);
        antiban.recordSent(OLGUN, 'reminder');
    }
    const g = antiban.gate(OLGUN, null, 'reminder');
    assert.equal(g.ok, false);
    assert.equal(g.capType, 'hourly');
    assert.equal(antiban.gate(OLGUN, null, 'belge').ok, true);
});

test('hatırlatma kanalı günde 25 gönderimde durur', (t) => {
    const antiban = taze(t);
    olgunlastir(t, antiban, OLGUN);
    let gonderilen = 0;
    for (let saat = 0; saat < 4; saat++) {
        while (antiban.gate(OLGUN, null, 'reminder').ok) {
            antiban.recordSent(OLGUN, 'reminder');
            gonderilen++;
        }
        t.mock.timers.tick(60 * 60 * 1000);
    }
    assert.equal(gonderilen, antiban.CHANNEL_LIMITS.reminder.daily);
    assert.match(antiban.gate(OLGUN, null, 'reminder').reason, /günlük tavanı/);
});

test('taze numarada kanallar toplamı ısınma tavanını aşamaz', (t) => {
    const antiban = taze(t);
    const kanallar = ['belge', 'watcher', 'vade', 'aibot', 'manual'];
    let toplam = 0;
    for (let saat = 0; saat < 10; saat++) {
        for (const kanal of kanallar) {
            if (antiban.gate(OLGUN, null, kanal).ok) { antiban.recordSent(OLGUN, kanal); toplam++; }
        }
        t.mock.timers.tick(60 * 60 * 1000);
    }
    assert.equal(toplam, antiban.WARMUP_RAMP[0]);
});

test('bir numara 403 alınca aynı bilgisayardaki diğer numara 7 gün temkinli gönderir', (t) => {
    const antiban = taze(t);
    olgunlastir(t, antiban, IKINCI);
    antiban.gate(OLGUN, null, 'belge');
    assert.equal(antiban.snapshot(IKINCI).dailyCap, antiban.WARMUP_RAMP.at(-1));

    antiban.noteDisconnect(OLGUN, 403, 'Connection Failure');
    assert.equal(antiban.gate(OLGUN, null, 'belge').capType, 'cooldown');
    const snap = antiban.snapshot(IKINCI);
    assert.equal(snap.machineCaution, true);
    assert.equal(snap.dailyCap, antiban.WARMUP_RAMP[0]);
    assert.equal(antiban.snapshot(OLGUN).machineCaution, false);

    t.mock.timers.tick(antiban.MACHINE_CAUTION_MS + 1000);
    assert.equal(antiban.snapshot(IKINCI).machineCaution, false);
});
