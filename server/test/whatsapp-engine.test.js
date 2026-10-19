// WhatsApp motoru (Baileys 6.7 / 7) geçişi. Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-waengine-'));
process.env.VEGA_BASE_DIR = dir;
const wa = require('../whatsapp');
test.after(() => { wa.setEngine('v6'); fs.rmSync(dir, { recursive: true, force: true }); });

const eslesmisOturum = (ad) => {
    const authDir = path.join(dir, ad);
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'creds.json'), JSON.stringify({ me: { id: '905550000000:8@s.whatsapp.net' } }));
    fs.writeFileSync(path.join(authDir, 'session-905551112233.0.json'), '{}');
    return authDir;
};

test('bilinmeyen motor adı varsayılana (v6) düşer', () => {
    assert.equal(wa.setEngine('v9'), 'v6');
    assert.equal(wa.setEngine('v7'), 'v7');
    assert.equal(wa.getEngine(), 'v7');
    wa.setEngine('v6');
});

test('v6 oturumu v7 ile ilk açılışta yedeklenir, sonraki açılışlarda yedek ezilmez', () => {
    const authDir = eslesmisOturum('auth-yedek');
    const log = [];
    wa.prepareAuthForEngine(authDir, 'v7', (l) => log.push(l));
    const bak = `${authDir}-v6-yedek`;
    assert.ok(fs.existsSync(path.join(bak, 'creds.json')));
    assert.ok(fs.existsSync(path.join(bak, 'session-905551112233.0.json')));
    assert.equal(fs.readFileSync(path.join(authDir, '.engine'), 'utf8'), 'v7');

    // v7 klasöre LID oturumu yazdı; yeniden açılış yedeği v7 verisiyle değiştirmemeli.
    fs.writeFileSync(path.join(authDir, 'session-123456789_1.0.json'), '{}');
    wa.prepareAuthForEngine(authDir, 'v7', (l) => log.push(l));
    assert.ok(!fs.existsSync(path.join(bak, 'session-123456789_1.0.json')));
    assert.equal(log.filter((l) => l.startsWith('engine-backup ')).length, 1);
});

test('eşlenmemiş klasörde yedek alınmaz', () => {
    const authDir = path.join(dir, 'auth-bos');
    wa.prepareAuthForEngine(authDir, 'v7', () => { });
    assert.ok(!fs.existsSync(`${authDir}-v6-yedek`));
    assert.equal(fs.readFileSync(path.join(authDir, '.engine'), 'utf8'), 'v7');
});

test('motor değişimi (restart) 403 beklemesini aşmaz', async () => {
    const authDir = eslesmisOturum('auth-403');
    fs.writeFileSync(path.join(authDir, 'forbidden.json'), JSON.stringify({ at: Date.now() - 60_000 }));
    const s = wa.createSession({ id: 'eng403', authDir });
    wa.setEngine('v7');
    const st = await s.restart();
    assert.equal(st.initializing, false);
    assert.equal(st.ready, false);
    assert.match(st.error, /403/);
    assert.ok(st.forbidden);
    // Bağlanma denenmediyse v7 klasöre hiç dokunmadı (yedek/işaret yok).
    assert.ok(!fs.existsSync(`${authDir}-v6-yedek`));
    wa.setEngine('v6');
});
