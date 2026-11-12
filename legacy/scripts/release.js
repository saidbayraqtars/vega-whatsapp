// ─── Yeni sürüm yayınlama ─────────────────────────────────────────────────────
// LEGACY (Electron 22 — Win7 SP1 / Server 2008 R2 / 2012): kurulum dosyası
// github.com/saidbayraqtars/vega-whatsapp-legacy-releases'a gider; güncel sürümün
// deposuna ASLA değil (orada Electron 33 var, eski Windows'ta açılmaz).
// GH_TOKEN'ı git credential manager'dan (kayıtlı GitHub girişi) alır, sürüm
// numarasını artırır ve installer'ı GitHub Releases'a yükler. Kurulu uygulamalar
// 4 saat içinde (veya tray "Güncellemeleri Denetle" ile) yeni sürümü kendiliğinden
// indirip kurar.
//
// Kullanım:  node scripts/release.js [patch|minor|major|none]   (varsayılan: patch)
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd, args, opts = {}) =>
    spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true, ...opts });

// 1) GitHub token (git push yapan hesabın kimliği — credential manager'da kayıtlı)
const fill = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
});
const m = (fill.stdout || '').match(/^password=(.+)$/m);
if (!m) {
    console.error('HATA: GitHub token alınamadı. Bir kez "git push" yapıp GitHub girişini tamamlayın.');
    process.exit(1);
}

// 2) Sürüm artır (aynı sürüm iki kez yayınlanamaz)
const bump = (process.argv[2] || 'patch').toLowerCase();
if (['patch', 'minor', 'major'].includes(bump)) {
    const r = run('npm', ['version', bump, '--no-git-tag-version']);
    if (r.status !== 0) process.exit(r.status);
} else if (bump !== 'none') {
    console.error(`Geçersiz argüman: ${bump} (patch|minor|major|none)`);
    process.exit(1);
}
const version = require(path.join(root, 'package.json')).version;
console.log(`\nYayınlanıyor: v${version} → github.com/saidbayraqtars/vega-whatsapp-legacy-releases\n`);

// 3) Baileys'i Node 16 için derle (server/vendor), sonra paketle + GitHub Releases'a yükle
const v = run('node', ['scripts/build-vendor.js', '--force']);
if (v.status !== 0) process.exit(v.status);
// Electron zip'i GitHub'dan indirmek bu ağda sık zaman aşımına düşüyor; aynı
// sürüm node_modules/electron/dist'te zaten varsa onu kullan.
const fs = require('fs');
const builderArgs = ['electron-builder', '--win', '--publish', 'always'];
try {
    const localVer = fs.readFileSync(path.join(root, 'node_modules/electron/dist/version'), 'utf8').trim();
    const pkgVer = require(path.join(root, 'node_modules/electron/package.json')).version;
    if (localVer === pkgVer) builderArgs.push('--config.electronDist=node_modules/electron/dist');
} catch { /* yerel dist yok → electron-builder kendisi indirir */ }
const b = run('npx', builderArgs, {
    env: { ...process.env, GH_TOKEN: m[1] },
});
process.exit(b.status || 0);
