// Çok firma: firma → WhatsApp hattı sıkı bağlama (accounts.js + lines.js + profiles.js birlikte).
// WhatsApp katmanı TAKLİT edilir (gerçek bağlantı/mesaj yok). Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-hat-'));
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

// ── Taklit oturum fabrikası: accounts.js bunu whatsapp.js yerine görür ──
const olusan = [];
const authDirleri = {};
function taklitOturum({ id, authDir, label }) {
    authDirleri[id] = authDir;
    const s = {
        id, label, authDir, ready: false, me: null, sent: [], checks: [], deleted: [], handlers: {}, daySent: 0,
        getStatus() { return { ready: s.ready, me: s.me, initializing: false, hasQr: false, qr: null, error: null, daySent: s.daySent }; },
        async sendMessage(phone, text, media, opts) { s.sent.push({ phone, text, opts }); s.daySent++; return { success: true, id: `${id}-${s.sent.length}` }; },
        async checkOnWhatsApp(phone) { s.checks.push(phone); return { exists: true }; },
        async deleteMessage(phone, msgId) { s.deleted.push(msgId); return { success: true }; },
        waitForReady(ms) { return s.ready ? Promise.resolve(true) : new Promise((r) => setTimeout(() => r(false), ms || 10)); },
        initialize: async () => { }, refresh: async () => { }, resume: async () => { }, restart: async () => { }, logout: async () => { },
        setIncomingHandler(fn) { s.handlers.incoming = fn; },
        setDisconnectHandler() { }, setRevokedHandler() { }, setOpenHandler() { }, setRestrictedHandler() { },
        getDailySent: () => s.daySent,
    };
    olusan.push(s);
    return s;
}
const waYolu = require.resolve('../whatsapp');
require.cache[waYolu] = { id: waYolu, filename: waYolu, loaded: true, exports: { createSession: taklitOturum, DATA_DIR: path.join(dir, 'data') } };

// Eski kurulumun hesap kaydı: yapışkan eşleme yalnız telefon anahtarlı (kapsamsız).
const ESKI_TEL = '905321110000';
fs.writeFileSync(path.join(dir, 'data', 'accounts.json'), JSON.stringify({
    accounts: [{ id: 'main', label: '1. Numara', createdAt: 1 }],
    sticky: { [ESKI_TEL]: 'main' },
}));

const antiban = require('../antiban');
antiban.configure(dir);
const accounts = require('../accounts');
const profiles = require('../profiles');
const { createLines } = require('../lines');

const durum = { yerel: true, ctx: { firmaNo: '0101', donemNo: '0017' } };
profiles.configure({
    baseDir: dir,
    getLegacyContext: () => durum.ctx,
    hasAccount: (id) => !!accounts.get(id),
    isLocalMode: () => durum.yerel,
});
accounts.configure({
    dailyCap: 200,
    stickyScopes: (accountId) => (profiles.isMulti() ? profiles.forAccount(accountId).map((p) => profiles.stickyScope(p)).filter(Boolean) : []),
});
const lines = createLines({
    profiles, accounts,
    isLocalMode: () => durum.yerel,
    x: {
        send: (p, t, m, o) => accounts.send(p, t, m, o),
        check: (p, o) => accounts.checkOnWhatsApp(p, o),
        del: (p, i, o) => accounts.deleteMessage(p, i, o),
        gate: (c, cap, id) => accounts.gate(c, cap, id),
        waitReady: (ms, id) => accounts.waitForReady(ms, id),
        status: () => accounts.status(),
    },
});

accounts.start();
for (const ad of ['Firma 2 hattı', 'Firma 3 hattı', 'Firma 4 hattı']) accounts.add(ad);
const oturum = (id) => olusan.find((s) => s.id === id);
const HAT = { main: '905000000001', a2: '905000000002', a3: '905000000003', a4: '905000000004' };
for (const [id, no] of Object.entries(HAT)) { const s = oturum(id); s.ready = true; s.me = `${no}:1@s.whatsapp.net`; }
const MUSTERI = '905329998877';

// Isınma rampasını ve eski sayaçları sıfırla: tüm hatlar olgun ve boş sayılsın.
function olgunlastir() {
    for (const no of Object.values(HAT)) antiban.gate(`${no}:1@s.whatsapp.net`, null, 'belge');
}

test('geriye uyum: main eski auth klasöründe, yeni hesaplar ayrı klasörde (QR yeniden okutulmaz)', () => {
    assert.equal(authDirleri.main, path.join(dir, 'data', 'baileys-auth'));
    assert.equal(authDirleri.a2, path.join(dir, 'data', 'baileys-auth-a2'));
});

test('geriye uyum: eski kapsamsız yapışkan kayıt aynen okunur; tek firmada kapsam yoktur', () => {
    assert.equal(accounts.getSticky(ESKI_TEL), 'main');
    assert.equal(accounts.getSticky(ESKI_TEL, 'F0101'), null, 'kapsamlı anahtar eski kaydı görmez');
    assert.equal(profiles.stickyScope(profiles.getDefault()), null);
});

test('tek firma (profil dosyası yok): havuz eski gibi — en az yüklü hat seçilir, opts\'a hat/kapsam girmez', async () => {
    olgunlastir();
    assert.equal(profiles.isExplicit(), false);
    // main'e önceden yük bindir: havuz boş olan hatlardan birini seçmeli (eski davranış).
    for (let i = 0; i < 5; i++) await accounts.send('90500000999' + i, 'x', null, { channel: 'belge', accountId: 'main' });
    const w = lines.waFor('default');
    assert.equal(w.line().mode, 'pool');
    const r = await w.send(MUSTERI, 'merhaba', null, { channel: 'belge' });
    assert.equal(r.success, true);
    assert.notEqual(r.accountId, 'main', 'havuz en az yüklüye gider');
    const giden = oturum(r.accountId).sent.at(-1);
    assert.equal('stickyScope' in giden.opts, false);
    assert.equal(giden.opts.accountId, undefined);
});

// ── Çok firma: 4 firma, her birine ayrı hat ──
function dortFirmaKur() {
    profiles.add({ firmaNo: '0102', donemNo: '0001', waAccount: 'a2' });
    profiles.add({ firmaNo: '0103', donemNo: '0002', waAccount: 'a3' });
    profiles.add({ firmaNo: '0104', donemNo: '0005', waAccount: 'a4' });
}

test('çok firma: her firmanın mesajı YALNIZ kendi hattından gider (başka hat boş olsa bile)', async () => {
    dortFirmaKur();
    assert.equal(profiles.isMulti(), true);
    const onceki = Object.fromEntries(olusan.map((s) => [s.id, s.sent.length]));
    const beklenen = { default: 'main', p2: 'a2', p3: 'a3', p4: 'a4' };
    for (const [pid, hat] of Object.entries(beklenen)) {
        const r = await lines.waFor(pid).send(MUSTERI, `mesaj ${pid}`, null, { channel: 'belge' });
        assert.equal(r.success, true);
        assert.equal(r.accountId, hat, `${pid} → ${hat}`);
    }
    // Her hatta tam bir yeni mesaj var, başka firmanın mesajı yok.
    for (const s of olusan) assert.equal(s.sent.length - onceki[s.id], 1, `${s.id} tam 1 mesaj`);
    const g = oturum('a3').sent.at(-1);
    assert.equal(g.opts.accountId, 'a3');
    assert.equal(g.opts.stickyScope, 'F0103', 'yapışkan anahtar (firma, telefon)');
});

test('çok firma: aynı telefon iki firmanın carisi — ikisi de kendi hattından, eşleme kapsamı ayrı', async () => {
    const a = await lines.waFor('p2').send(MUSTERI, 'F2 mesajı', null, { channel: 'belge' });
    const b = await lines.waFor('p3').send(MUSTERI, 'F3 mesajı', null, { channel: 'belge' });
    assert.equal(a.accountId, 'a2');
    assert.equal(b.accountId, 'a3');
    // kapsamlı yapışkan eşleme yazılmıştır ve birbirini etkilemez
    accounts.setSticky(MUSTERI, 'a2', 'F0102');
    accounts.setSticky(MUSTERI, 'a3', 'F0103');
    assert.equal(accounts.getSticky(MUSTERI, 'F0102'), 'a2');
    assert.equal(accounts.getSticky(MUSTERI, 'F0103'), 'a3');
    assert.equal(accounts.getSticky(MUSTERI, 'F0104'), null);
});

test('çok firma: firmanın hattı KAPALIYSA mesaj gitmez, başka firmanın hattına DÜŞÜLMEZ', async () => {
    const s3 = oturum('a3');
    s3.ready = false;
    const onceki = Object.fromEntries(olusan.map((s) => [s.id, s.sent.length]));
    const w = lines.waFor('p3');
    assert.equal(w.status().ready, false);
    const g = w.gate('belge', null);
    assert.equal(g.ok, false);
    assert.equal(g.capType, 'offline');
    const r = await w.send(MUSTERI, 'F3 mesajı', null, { channel: 'belge' });
    assert.equal(r.success, false);
    assert.equal(r.capped, true);
    const c = await w.check(MUSTERI);
    assert.equal(c.exists, false);
    assert.equal(c.transient, true, 'doğrulama geçici hata → motor mesajı sıraya alır');
    for (const s of olusan) assert.equal(s.sent.length, onceki[s.id], `${s.id} hiçbir mesaj almamalı`);
    const sorgular = Object.fromEntries(olusan.map((s) => [s.id, s.checks.length]));
    await w.check(MUSTERI);
    for (const s of olusan) assert.equal(s.checks.length, sorgular[s.id], `${s.id}: doğrulama başka hatta sorulmaz`);
    // hat dönünce aynı firma kendi hattından gönderir
    s3.ready = true;
    const r2 = await w.send(MUSTERI, 'F3 mesajı', null, { channel: 'belge' });
    assert.equal(r2.success, true);
    assert.equal(r2.accountId, 'a3');
});

test('çok firma: firmanın hattı TAVANDAYSA gönderim reddedilir; başka hat boş olsa da kullanılmaz', async () => {
    const hatNo = `${HAT.a4}:1@s.whatsapp.net`;
    // Günlük tavanı doldur (ısınma tavanı); kapı kapanana dek sayaç işle.
    let n = 0;
    while (antiban.gate(hatNo, 200, 'belge').ok && n < 500) { antiban.recordSent(hatNo, 'belge'); n++; }
    assert.ok(n > 0 && n < 500);
    const w = lines.waFor('p4');
    const g = w.gate('belge', 200);
    assert.equal(g.ok, false, 'tavan dolu');
    const onceki = Object.fromEntries(olusan.map((s) => [s.id, s.sent.length]));
    const r = await w.send(MUSTERI, 'F4 mesajı', null, { channel: 'belge', dailyCap: 200 });
    assert.equal(r.success, false);
    assert.equal(r.capped, true);
    for (const s of olusan) assert.equal(s.sent.length, onceki[s.id], `${s.id} mesaj almamalı`);
    // Diğer firmaların kapısı etkilenmez (anti-ban sayaçları hesap başına ayrı).
    assert.equal(lines.waFor('p2').gate('belge', 200).ok, true);
});

test('çok firma: hattı atanmamış firma hiçbir hattan gönderemez', async () => {
    const yeni = profiles.add({ firmaNo: '0105', donemNo: '0001' });   // waAccount yok
    assert.equal(yeni.success, true);
    const w = lines.waFor(yeni.profile.id);
    assert.equal(w.line().mode, 'none');
    assert.equal(w.status().ready, false);
    const onceki = Object.fromEntries(olusan.map((s) => [s.id, s.sent.length]));
    const r = await w.send(MUSTERI, 'x', null, { channel: 'belge' });
    assert.equal(r.success, false);
    assert.match(r.error, /atanmamış/);
    assert.equal(w.gate('belge', null).ok, false);
    assert.equal((await w.del(MUSTERI, 'a2-1')).success, false);
    for (const s of olusan) assert.equal(s.sent.length, onceki[s.id]);
    profiles.remove(yeni.profile.id);
});

test('çok firma: gönderen hattan geri çekme; kaydı olmayan mesaj firmanın hattına düşer (main\'e değil)', async () => {
    const r = await lines.waFor('p2').send(MUSTERI, 'geri çekilecek', null, { channel: 'belge' });
    assert.equal(r.accountId, 'a2');
    // başka firmanın bağlamından silme istense de mesajı GÖNDEREN hat kullanılır
    await lines.waFor('p3').del(MUSTERI, r.id);
    assert.deepEqual(oturum('a2').deleted, [r.id]);
    // bellekte izi olmayan mesaj (yeniden başlatma): firmanın kendi hattı, main değil
    await lines.waFor('p4').del(MUSTERI, 'bilinmeyen-id');
    assert.deepEqual(oturum('a4').deleted, ['bilinmeyen-id']);
    assert.equal(oturum('main').deleted.includes('bilinmeyen-id'), false);
});

test('çok firma: bekleme yalnız firmanın hattını bekler (başka hat hazır diye hemen dönmez)', async () => {
    const s2 = oturum('a2');
    s2.ready = false;
    const w = lines.waFor('p2');
    const t0 = Date.now();
    const hazir = await w.waitReady(40);
    assert.equal(hazir, false, 'a2 kapalı, diğerleri hazır olsa da true dönmemeli');
    assert.ok(Date.now() - t0 >= 30);
    s2.ready = true;
    assert.equal(await w.waitReady(40), true);
});

test('çok firma: gelen mesaj, hattın bağlı olduğu firmaların kapsamına yapışkan eşleme yazar', () => {
    const MUS2 = '905328889900';
    oturum('a2').handlers.incoming({ phone: MUS2, text: 'merhaba' });
    assert.equal(accounts.getSticky(MUS2, 'F0102'), 'a2');
    assert.equal(accounts.getSticky(MUS2, 'F0103'), null);
    assert.equal(accounts.getSticky(MUS2), null, 'çok firmada kapsamsız anahtar yazılmaz');
});

test('cloud/relay + çok firma: hiçbir firma gönderemez', async () => {
    durum.yerel = false;
    try {
        const onceki = olusan.reduce((n, s) => n + s.sent.length, 0);
        const r = await lines.waFor('p2').send(MUSTERI, 'x', null, { channel: 'belge' });
        assert.equal(r.success, false);
        assert.match(r.error, /Yerel/);
        assert.equal(olusan.reduce((n, s) => n + s.sent.length, 0), onceki);
    } finally { durum.yerel = true; }
});

test('profil kapatılıp tek firma kalınca (atanmış hat) yine yalnız o hattan gider', async () => {
    for (const id of ['p2', 'p3', 'p4']) profiles.update(id, { enabled: false });
    assert.equal(profiles.isMulti(), false);
    const w = lines.waFor('default');
    assert.equal(w.line().mode, 'strict');
    const r = await w.send(MUSTERI, 'x', null, { channel: 'manual' });
    assert.equal(r.accountId, 'main');
    assert.equal('stickyScope' in oturum('main').sent.at(-1).opts, false, 'tek firmada kapsam yok');
});
