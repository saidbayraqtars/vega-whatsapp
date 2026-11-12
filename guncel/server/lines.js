// ═══════════════════════════════════════════════════════════════════════════
//  ÇOK FİRMA: profil → WhatsApp hattı (sıkı bağlama)
// ═══════════════════════════════════════════════════════════════════════════
//  Her firma profili (profiles.js) kendi motor kümesiyle çalışır ve gönderimini bu
//  sarmalayıcılardan yapar. Kurallar:
//   • Çok firmada (2+ etkin profil) mesaj YALNIZ profilin waAccount hattından gider.
//     Hat kapalı/tavandaysa gönderim REDDEDİLİR (motor mesajı sıraya alır); başka
//     firmanın hattına düşülmez. Hat atanmamışsa hiçbir hattan gönderilmez.
//   • Tek firmada (eski kurulumlar) hiçbir şey değişmez: waAccount yoksa havuz
//     (yapışkan + en az yüklü) eskisi gibi çalışır; opts'a ek alan girmez.
//   • Cloud/relay tek numaradır: çok firmada gönderim kapalıdır (profiles.resolveLine).
//
//  Bu modül server.js'in mod-duyarlı WhatsApp sarmalayıcılarını (waSendX, waCheckX…)
//  alır; böylece hat bağlama mantığı sunucu açılmadan test edilebilir.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {object} o
 * @param {object} o.profiles   profiles.js
 * @param {object} o.accounts   accounts.js (get, statusOf)
 * @param {Function} o.isLocalMode  () => boolean (Baileys yerel mod mu)
 * @param {object} o.x          { send, check, del, gate, waitReady, status } mod-duyarlı sarmalayıcılar
 *   send(phone, text, media, opts) · check(phone, opts) · del(phone, id, opts)
 *   gate(channel, cap, accountId?) · waitReady(ms, accountId?) · status() (havuz durumu)
 */
function createLines({ profiles, accounts, isLocalMode, x }) {
    const lineOf = (p) => profiles.resolveLine(p, {
        multi: profiles.isMulti(),
        localMode: isLocalMode(),
        hasAccount: (id) => !!accounts.get(id),
    });

    const cache = new Map();
    function waFor(profileId) {
        if (cache.has(profileId)) return cache.get(profileId);
        const prof = () => profiles.get(profileId) || profiles.getDefault();
        const line = () => lineOf(prof());
        // Seçenekleri hatta göre tamamla. Havuz modunda opts'a dokunulmaz (AI yanıtı kendi
        // accountId'sini taşıyabilir); sıkı modda profilin hattı HER ZAMAN kazanır.
        const withLine = (opts, ln) => {
            const o = { ...(opts || {}) };
            if (ln.mode === 'strict') o.accountId = ln.accountId;
            const sc = profiles.stickyScope(prof());
            if (sc) o.stickyScope = sc;
            return o;
        };
        const w = {
            line,
            send: async (phone, text, media, opts) => {
                const ln = line();
                if (ln.mode === 'none') return { success: false, error: ln.reason, capped: true };
                return x.send(phone, text, media, withLine(opts, ln));
            },
            check: async (phone) => {
                const ln = line();
                if (ln.mode === 'none') return { exists: false, transient: true, error: ln.reason };
                return x.check(phone, withLine({}, ln));
            },
            del: async (phone, id) => {
                const ln = line();
                if (ln.mode === 'none') return { success: false, error: ln.reason };
                return x.del(phone, id, withLine({}, ln));
            },
            gate: (ch, cap) => {
                const ln = line();
                if (ln.mode === 'none') return { ok: false, reason: ln.reason, capType: 'offline' };
                return x.gate(ch, cap, ln.mode === 'strict' ? ln.accountId : undefined);
            },
            status: () => {
                const ln = line();
                if (ln.mode === 'none') return { ready: false, initializing: false, hasQr: false, qr: null, me: null, error: ln.reason };
                if (ln.mode === 'strict') return accounts.statusOf(ln.accountId);
                return x.status();
            },
            // Hat hazır olana kadar (en çok ms) bekle; havuz modunda eski davranış.
            waitReady: (ms) => {
                const ln = line();
                if (ln.mode === 'strict') return x.waitReady(ms, ln.accountId);
                if (ln.mode === 'none') return new Promise((r) => setTimeout(() => r(false), Math.max(1, ms || 2000)));
                return x.waitReady(ms);
            },
        };
        cache.set(profileId, w);
        return w;
    }

    return { lineOf, waFor, forget: (id) => cache.delete(id) };
}

// ─── Gelen mesaj → hangi firmanın AI botu? ───────────────────────────────────
//  • Tek firma: tek profilin botu (eski davranış, tekil aiBot).
//  • Çok firma: mesajın GELDİĞİ hatta bağlı etkin profiller adaydır; cevap da o hattan gider.
//    Hat birden çok firmaya bağlıysa telefon sırayla her firmanın carilerinde aranır, ilk
//    bulunan firmanın botu (kendi işletme adı/ödeme bilgisiyle) cevaplar.
function createBotRouter({ profiles, enginesOf, findCariByPhone, log = () => { } }) {
    return async function routeToBot(m) {
        const cands = profiles.incomingCandidates(m.accountId);
        if (!cands.length) {
            log(`[AI] ${m.phone}: gelen hatta (${m.accountId || '-'}) bağlı etkin firma yok — cevaplanmadı.`);
            return null;
        }
        const chosen = await profiles.chooseForIncoming(cands, m.phone, {
            findCari: (p, phone) => findCariByPhone(p.firmaNo, phone),
            isBotOn: (p) => { try { return !!enginesOf(p).aiBot.getConfig().enabled; } catch { return false; } },
        });
        if (!chosen) return null;
        await enginesOf(chosen).aiBot.handleIncoming(m);
        return chosen;
    };
}

module.exports = { createLines, createBotRouter };
