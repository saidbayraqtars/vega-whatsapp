// Tek dosya EXE build: esbuild ile Baileys'i (ESM) CJS'e bundle → pkg ile exe.
// cmd/.bat quoting ve encoding sorunlarından kaçınmak için tüm mantık Node'da.
const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;                       // .../server
const buildDir = path.join(root, 'build');
const outExe = path.join(root, '..', 'VegaWhatsApp.exe');

(async () => {
    console.log('[1/3] esbuild ile bundle...');
    fs.rmSync(buildDir, { recursive: true, force: true });
    fs.mkdirSync(buildDir, { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(root, 'server.js')],
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'cjs',
        outfile: path.join(buildDir, 'app.cjs'),
        external: ['sharp'],                  // native — opsiyonel; jimp fallback bundle edilir
        logLevel: 'warning',
    });

    console.log('[2/3] public + assets kopyala + pkg ayarı...');
    fs.cpSync(path.join(root, 'public'), path.join(buildDir, 'public'), { recursive: true });
    // assets/ (arial.ttf, arialbd.ttf) → PDF ekstre için ŞART. Bundle edilmezse
    // exe'de font bulunamaz, Helvetica AFM'i de yok → buildExtrePdf patlar (PDF gitmez).
    if (fs.existsSync(path.join(root, 'assets'))) {
        fs.cpSync(path.join(root, 'assets'), path.join(buildDir, 'assets'), { recursive: true });
    }
    fs.writeFileSync(
        path.join(buildDir, 'package.json'),
        JSON.stringify({ name: 'vega-wa-build', bin: 'app.cjs', pkg: { assets: ['public/**/*', 'assets/**/*'] } }, null, 2)
    );

    // @yao-pkg/pkg (bakımlı fork) — Node 22 base shipler. Node 18'in WebCrypto
    // 'Zero-length key' hatası ve eksik global crypto'su Node 22'de yok.
    console.log('[3/3] pkg ile exe paketle (ilk sefer node binary indirir, sürebilir)...');
    execSync(`npx @yao-pkg/pkg . --targets node22-win-x64 --output "${outExe}"`, { cwd: buildDir, stdio: 'inherit' });

    console.log('\n========================================');
    console.log(' TAMAM: ' + path.resolve(outExe));
    console.log(' Not: exe ile ayni klasorde config.json + data/ olusur.');
    console.log('========================================');
})().catch((e) => {
    console.error('\nBUILD HATA:', e.message);
    console.error('Alternatif: start.bat ile node uzerinden calistirin (exe gerekmez).');
    process.exit(1);
});
