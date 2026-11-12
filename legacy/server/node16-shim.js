// ═══════════════════════════════════════════════════════════════════════════
//  NODE 16 UYUM KATMANI (yalnız legacy sürüm — Electron 22 / Node 16.17)
// ═══════════════════════════════════════════════════════════════════════════
//  Windows 7 / Server 2008 R2 / 2012'de çalışan son Electron 22'dir; Node 16 ile
//  gelir. Baileys Node 20 bekler. Eksikler:
//   1) globalThis.crypto yok (Node 16'da yalnız require('crypto').webcrypto var).
//      Baileys modül yüklenirken `const { subtle } = globalThis.crypto` yapıyor.
//   2) WebCrypto HKDF sıfır uzunluklu anahtarı reddediyor ("Zero-length key is not
//      supported"); Node 16 hkdfSync de reddediyor. Baileys el sıkışmada boş anahtar
//      / boş tuzla HKDF çağırıyor → bağlantı kurulmuyor. HKDF burada RFC 5869'a göre
//      HMAC ile elle hesaplanır (Node 20'nin hkdfSync çıktısıyla birebir aynı).
//  server/vendor/baileys-*.cjs paketlerinin en başında yüklenir; ayrıca
//  electron/main.js en başta çağırır. Yeni Node'da zararsızdır (yalnız HKDF yolu
//  elle hesaplanır).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const nc = require('crypto');

if (!globalThis.__vegaNode16Shim) {
    globalThis.__vegaNode16Shim = true;

    if (!globalThis.crypto) {
        Object.defineProperty(globalThis, 'crypto', { value: nc.webcrypto, configurable: true, writable: true });
    }

    const subtle = globalThis.crypto.subtle;
    const origImport = subtle.importKey.bind(subtle);
    const origDerive = subtle.deriveBits.bind(subtle);
    const RAW = Symbol('vegaHkdfRaw');

    const toBuf = (d) => {
        if (d == null) return Buffer.alloc(0);
        if (Buffer.isBuffer(d)) return d;
        if (d instanceof ArrayBuffer) return Buffer.from(new Uint8Array(d));
        if (ArrayBuffer.isView(d)) return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
        return Buffer.from(d);
    };
    const hashName = (h) => String((h && h.name) || h || 'SHA-256').replace('-', '').toLowerCase();

    // RFC 5869: PRK = HMAC(salt, IKM); OKM = T(1) | T(2) | ...  (boş anahtar/tuz serbest)
    const hkdf = (hash, ikm, salt, info, len) => {
        const hl = nc.createHash(hash).digest().length;
        const prk = nc.createHmac(hash, salt.length ? salt : Buffer.alloc(hl)).update(ikm).digest();
        const blocks = [];
        let t = Buffer.alloc(0), total = 0;
        for (let i = 1; total < len; i++) {
            t = nc.createHmac(hash, prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest();
            blocks.push(t);
            total += t.length;
        }
        const okm = Buffer.concat(blocks).subarray(0, len);
        return okm.buffer.slice(okm.byteOffset, okm.byteOffset + okm.byteLength);
    };

    subtle.importKey = async function (format, keyData, algorithm, extractable, usages) {
        const name = typeof algorithm === 'string' ? algorithm : algorithm && algorithm.name;
        if (format === 'raw' && String(name).toUpperCase() === 'HKDF') {
            return { [RAW]: Buffer.from(toBuf(keyData)), type: 'secret', extractable: false, algorithm: { name: 'HKDF' }, usages };
        }
        return origImport(format, keyData, algorithm, extractable, usages);
    };

    subtle.deriveBits = async function (algorithm, baseKey, length) {
        if (baseKey && baseKey[RAW]) {
            return hkdf(hashName(algorithm.hash), baseKey[RAW], toBuf(algorithm.salt), toBuf(algorithm.info), length / 8);
        }
        return origDerive(algorithm, baseKey, length);
    };
}

module.exports = {};
