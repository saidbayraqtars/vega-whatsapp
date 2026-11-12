// ─── Legacy: Baileys v6 / v7'yi Node 16 (Electron 22) için derle ──────────────
// Baileys ESM ve Node 20 sözdizimi kullanıyor (ör. `import ... with { type: 'json' }`);
// Electron 22'nin Node 16.17'si bunları yükleyemez. esbuild ile iki paket tek CJS
// dosyasına (server/vendor/baileys-v6.cjs, baileys-v7.cjs) node16 hedefiyle çevrilir.
//  - Dosyanın başında server/node16-shim.js yüklenir (globalThis.crypto + HKDF).
//  - Baileys 7'nin lru-cache 11'i node:diagnostics_channel.tracingChannel (Node 19.9+)
//    istiyor → aynı API'li lru-cache 10'a yönlendirilir.
//  - sharp / jimp / link-preview-js vb. isteğe bağlı paketler dışarıda bırakılır
//    (Baileys yoksa kendisi atlıyor; güncel sürümde de kurulu değiller).
// Sunucu kodu PAKETLENMEZ: engines.js firma başına modül kopyası yüklüyor (require
// önbelleği), tek dosya paket bunu bozar.
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'server', 'vendor');
const lruCache10 = require.resolve('lru-cache', { paths: [root] });

const ENGINES = [
    { pkg: '@whiskeysockets/baileys', out: 'baileys-v6.cjs' },
    { pkg: 'baileys7', out: 'baileys-v7.cjs' },
];

const legacyResolve = {
    name: 'legacy-resolve',
    setup(build) {
        build.onResolve({ filter: /^lru-cache$/ }, () => ({ path: lruCache10 }));
    },
};

const pkgVersion = (name) => require(require.resolve(`${name}/package.json`, { paths: [root] })).version;

(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    for (const e of ENGINES) {
        const version = pkgVersion(e.pkg);
        const outfile = path.join(outDir, e.out);
        const stamp = `${outfile}.version`;
        if (fs.existsSync(outfile) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === version && !process.argv.includes('--force')) {
            console.log(`[vendor] ${e.out} güncel (${e.pkg}@${version})`);
            continue;
        }
        await esbuild.build({
            stdin: {
                contents: `export * from ${JSON.stringify(e.pkg)}; export { default } from ${JSON.stringify(e.pkg)};`,
                resolveDir: root,
                sourcefile: `${e.out}-entry.mjs`,
                loader: 'js',
            },
            bundle: true,
            platform: 'node',
            target: 'node16',
            format: 'cjs',
            outfile,
            banner: { js: "require('../node16-shim.js');" },
            plugins: [legacyResolve],
            external: ['sharp', 'jimp', 'link-preview-js', 'qrcode-terminal', 'audio-decode'],
            legalComments: 'none',
            logLevel: 'error',
        });
        fs.writeFileSync(stamp, version);
        console.log(`[vendor] ${e.out} derlendi (${e.pkg}@${version}, ${(fs.statSync(outfile).size / 1048576).toFixed(1)} MB)`);
    }
})().catch((err) => {
    console.error('[vendor] HATA:', err.message);
    process.exit(1);
});
