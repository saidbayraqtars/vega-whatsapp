// ─── Yeni sürüm yayınlama ─────────────────────────────────────────────────────
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
console.log(`\nYayınlanıyor: v${version} → github.com/saidbayraqtars/vega-whatsapp-releases\n`);

// 3) Derle + GitHub Releases'a yükle
const b = run('npx', ['electron-builder', '--win', '--publish', 'always'], {
    env: { ...process.env, GH_TOKEN: m[1] },
});
process.exit(b.status || 0);
