// 403 (hesap kısıtlı) sonrası bağlanma durdurması. Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-wa403-'));
process.env.VEGA_BASE_DIR = dir;
const { createSession } = require('../whatsapp');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

function oturum(forbiddenAt) {
    const authDir = path.join(dir, `auth-${forbiddenAt}`);
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'forbidden.json'), JSON.stringify({ at: forbiddenAt }));
    return createSession({ id: `t${forbiddenAt}`, authDir });
}

test('403 kaydı tazeyken uygulama yeniden başlasa da bağlanmaya çalışmaz', async () => {
    const s = oturum(Date.now() - 60 * 60 * 1000);
    const st = await s.initialize();
    assert.equal(st.ready, false);
    assert.equal(st.initializing, false);
    assert.match(st.error, /403/);
    assert.ok(st.forbidden && st.forbidden.until > Date.now());
});

test('403 kaydı 24 saati geçince durum ekranında kısıtlı görünmez (tek deneme serbest)', () => {
    const s = oturum(Date.now() - 25 * 60 * 60 * 1000);
    assert.equal(s.getStatus().forbidden, null);
});
