// Çok firma: gelen mesaj → hangi firmanın AI botu cevaplar, cevap hangi hattan gider.
// Gerçek aiBot kopyaları (nöbetçi mod: model çağrılmaz), taklit WhatsApp ve taklit cari araması.
// Çalıştırma: npm run test:antiban
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vega-ai-'));
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const profiles = require('../profiles');
const engines = require('../engines');
const { createLines, createBotRouter } = require('../lines');
const aiTekil = require('../aiBot');

profiles.configure({ baseDir: dir, getLegacyContext: () => ({ firmaNo: '0101', donemNo: '0017' }), hasAccount: () => true, isLocalMode: () => true });

// Taklit WhatsApp: gönderimler kaydedilir; yalnız opts.accountId ile hat bilinir.
const giden = [];
const lines = createLines({
    profiles,
    accounts: { get: () => ({}), statusOf: () => ({ ready: true, me: '905000000001:1@s.whatsapp.net' }) },
    isLocalMode: () => true,
    x: {
        send: async (phone, text, media, opts) => { giden.push({ phone, text, opts }); return { success: true, id: `m${giden.length}` }; },
        check: async () => ({ exists: true }),
        del: async () => ({ success: true }),
        gate: () => ({ ok: true }),
        waitReady: async () => true,
        status: () => ({ ready: true, me: '905000000001:1@s.whatsapp.net' }),
    },
});

// Taklit cari: 905321112233 yalnız 0103 firmasında; 905329990000 yalnız 0101'de.
const cariAramalari = [];
const CARILER = { '0103': { '905321112233': { ind: 7, name: 'Ahmet Ltd.' } }, '0101': { '905329990000': { ind: 3, name: 'Birinci Firma Müşterisi' } } };
const findCariByPhone = async (firmaNo, phone) => { cariAramalari.push(`${firmaNo}:${phone}`); return (CARILER[firmaNo] || {})[phone] || null; };

const ACK = { default: 'F1 mesajı aldık', p2: 'F2 mesajı aldık', p3: 'F3 mesajı aldık', p4: 'F4 mesajı aldık' };
function aiBagimlilik(profil) {
    return {
        baseDir: profiles.baseDirFor(profil.id),
        findCariByPhone,
        waSend: lines.waFor(profil.id).send,
        waStatus: lines.waFor(profil.id).status,
        getContext: () => ({ firmaNo: profil.firmaNo, donemNo: profil.donemNo }),
        encryptSecret: (s) => s, decryptSecret: (s) => s, recordSent: () => { },
    };
}
engines.configure({
    defaultSet: { aiBot: aiTekil },
    baseDirFor: (id) => profiles.baseDirFor(id),
    log: () => { },
    configureSet: (set, profil) => set.aiBot.configure(aiBagimlilik(profil)),
});
engines.registerDefault({ aiBot: aiTekil }, profiles.getDefault());

const yonlendir = createBotRouter({ profiles, enginesOf: (p) => engines.ensure(p), findCariByPhone, log: () => { } });
const botAyarla = (pid, ek = {}) => engines.of(pid).aiBot.setConfig({
    enabled: true, replyMode: 'ack', ackMessage: ACK[pid], ackUnknown: true, ackCooldownHours: 0, notifyPhone: '', firmaNo: profiles.get(pid).firmaNo, donemNo: profiles.get(pid).donemNo, ...ek,
});

// Tek firma → önce eski davranış
test('tek firma: gelen mesaj hangi hattan gelirse gelsin tekil bot karşılar (eski davranış)', async () => {
    botAyarla('default');
    giden.length = 0;
    const sec = await yonlendir({ phone: '905329990000', text: 'merhaba', id: 'w1', accountId: 'a77' });
    assert.equal(sec.id, 'default');
    assert.equal(giden.length, 1);
    assert.equal(giden[0].text, ACK.default);
    assert.equal(giden[0].opts.accountId, 'a77', 'havuz modunda cevap mesajın geldiği hattan (eski davranış)');
});

// Çok firma
test('çok firma kurulumu hazır: 4 firma, a2 hattı 0102 ve 0103 firmalarıyla ortak', () => {
    profiles.add({ firmaNo: '0102', donemNo: '0001', waAccount: 'a2' });
    profiles.add({ firmaNo: '0103', donemNo: '0002', waAccount: 'a2' });
    profiles.add({ firmaNo: '0104', donemNo: '0005', waAccount: 'a3' });
    for (const p of profiles.list()) { engines.ensure(p); botAyarla(p.id); }
    assert.equal(profiles.isMulti(), true);
});

test('çok firma: mesaj hangi hatta geldiyse o hatta bağlı firmanın botu cevaplar, cevap aynı hattan gider', async () => {
    giden.length = 0;
    const sec = await yonlendir({ phone: '905329990000', text: 'borcum ne', id: 'w2', accountId: 'main' });
    assert.equal(sec.id, 'default');
    assert.equal(giden.length, 1);
    assert.equal(giden[0].text, ACK.default);
    assert.equal(giden[0].opts.accountId, 'main');
    assert.equal(giden[0].opts.stickyScope, 'F0101');
});

test('çok firma: ortak hatta gelen mesaj, bağlı TÜM firmalarda aranır; cari hangisindeyse onun botu cevaplar', async () => {
    giden.length = 0; cariAramalari.length = 0;
    const sec = await yonlendir({ phone: '905321112233', text: 'ekstre', id: 'w3', accountId: 'a2' });
    assert.equal(sec.id, 'p3', 'numara yalnız 0103 carisi');
    assert.deepEqual(cariAramalari.slice(0, 2), ['0102:905321112233', '0103:905321112233'], 'a2\'ye bağlı iki firmada da arandı, 0101\'de ARANMADI');
    assert.equal(cariAramalari.some((a) => a.startsWith('0101:') || a.startsWith('0104:')), false);
    const cevap = giden.find((g) => g.text === ACK.p3);
    assert.ok(cevap, 'F3 botu cevapladı');
    assert.equal(cevap.opts.accountId, 'a2', 'cevap mesajın geldiği (firmanın) hattından');
    assert.equal(giden.some((g) => g.text === ACK.p2), false, 'F2 botu sessiz kaldı');
    // iki firmanın botlarının sayaçları ayrı
    assert.equal(engines.of('p3').aiBot.getStatus().sentToday, 1);
    assert.equal(engines.of('p2').aiBot.getStatus().sentToday, 0);
});

test('çok firma: ortak hatta bilinmeyen numara — botu açık ilk firma karşılar', async () => {
    giden.length = 0;
    botAyarla('p2', { enabled: false });
    const sec = await yonlendir({ phone: '905320001122', text: 'selam', id: 'w4', accountId: 'a2' });
    assert.equal(sec.id, 'p3');
    assert.equal(giden.at(-1).text, ACK.p3);
    botAyarla('p2');
});

test('çok firma: hiçbir firmaya bağlı olmayan hatta gelen mesaja cevap verilmez', async () => {
    giden.length = 0;
    const sec = await yonlendir({ phone: '905329990000', text: 'merhaba', id: 'w5', accountId: 'a9' });
    assert.equal(sec, null);
    assert.equal(giden.length, 0);
});

test('çok firma: tek firmaya bağlı hatta cari sorgusu yapılmadan o firmanın botu cevaplar', async () => {
    giden.length = 0; cariAramalari.length = 0;
    const sec = await yonlendir({ phone: '905321112244', text: 'merhaba', id: 'w6', accountId: 'a3' });
    assert.equal(sec.id, 'p4');
    assert.equal(giden.at(-1).text, ACK.p4);
    assert.equal(giden.at(-1).opts.accountId, 'a3');
    // ack modunda botun kendi cari araması dışında yönlendirme sorgusu yok (yalnız 0104)
    assert.ok(cariAramalari.every((a) => a.startsWith('0104:')));
});

test('aynı telefon iki firmaya yazarsa her firmanın botu kendi hattından, kendi metniyle cevaplar', async () => {
    giden.length = 0;
    const tel = '905329990000';        // 0101'de cari
    await yonlendir({ phone: tel, text: 'a', id: 'w7', accountId: 'main' });
    await yonlendir({ phone: tel, text: 'b', id: 'w8', accountId: 'a3' });
    const m = giden.find((g) => g.opts.accountId === 'main');
    const a3 = giden.find((g) => g.opts.accountId === 'a3');
    assert.equal(m.text, ACK.default);
    assert.equal(a3.text, ACK.p4);
    assert.equal(m.opts.stickyScope, 'F0101');
    assert.equal(a3.opts.stickyScope, 'F0104');
});
