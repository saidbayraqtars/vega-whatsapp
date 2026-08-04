// ─── Vega Toplu WhatsApp — Frontend ─────────────────────────────────────────
const $ = (id) => document.getElementById(id);
// Lisans/deneme geçersizse sunucu TÜM /api/* uçlarına 403 LICENSE_REQUIRED döner.
// Nerede olursak olalım lisans kapısına düş (deneme uygulama açıkken de dolabilir).
const api = (path, opts) => fetch('/api' + path, opts).then(async (r) => {
    const j = await r.json();
    if (r.status === 403 && j && j.error === 'LICENSE_REQUIRED') showLicenseGate(j.license);
    return j;
});

// Electron masaüstü köprüsü (varsa). PIN'i DPAPI ile saklayıp PC açılışında
// otomatik bağlanmayı sağlar; tarayıcıda çalışınca yok sayılır.
const desktop = window.vegaDesktop;
async function rememberPin(pin) { if (desktop?.isElectron) { try { await desktop.savePin(pin); } catch { /* yok say */ } } }
async function forgetPin() { if (desktop?.isElectron) { try { await desktop.clearPin(); } catch { /* yok say */ } } }

const state = {
    firmaNo: null,
    donemNo: null,            // uygulama genel bağlamı (ayarlardan; toplu+watcher paylaşır)
    rows: [],                 // ekranda görünen cariler
    selected: new Map(),      // ind -> {name, unvan, kod, phone, phones}
    cariLoadedAt: 0,          // cari kart bilgisi en son ne zaman çekildi (günlük tazeleme)
    waReady: false,
    waPollTimer: null,
    currentJob: null,
    sse: null,
};

// Uygulama bağlamı (firma/dönem) kalıcı: hem sunucu config'i hem localStorage.
async function saveContext(firmaNo, donemNo) {
    state.firmaNo = firmaNo; state.donemNo = donemNo ?? null;
    try { localStorage.setItem('vega.ctx', JSON.stringify({ firmaNo, donemNo: donemNo ?? null })); } catch { /* yok say */ }
    try { await api('/settings/context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaNo, donemNo: donemNo ?? null }) }); } catch { /* yok say */ }
}
function localContext() { try { return JSON.parse(localStorage.getItem('vega.ctx') || '{}'); } catch { return {}; } }

// ═══════════════════════════════════════════════════════════════════════════
//  Açılış akışı
// ═══════════════════════════════════════════════════════════════════════════
async function boot() {
    // Lisans önce: geçersizse (deneme doldu / lisans yok) hiçbir /api ucu açılmaz,
    // kurulum ekranını göstermenin de anlamı yok — doğrudan lisans kapısı.
    const lr = await api('/license');
    if (lr.version) { const v = $('sbVer'); if (v) v.textContent = 'v' + lr.version; }
    if (!lr.license || !lr.license.valid) { showLicenseGate(lr.license); return; }
    renderLicense(lr.license);

    const r = await api('/check-setup');
    if (r.version) { const v = $('sbVer'); if (v) v.textContent = 'v' + r.version; }
    if (!r.isSetup) { show('setupScreen'); return; }
    // Giriş PIN'i kaldırıldı: sunucu açılışta otomatik bağlanır. Bağlı değilse dene.
    try {
        let st = await api('/status');
        if (!st.dbConnected && !st.needsReauth) {
            await api('/connect', { method: 'POST' });
            st = await api('/status');
        }
        if (st.dbConnected) { await enterApp(); maybeShowNotice(r.version); return; }
        if (st.needsReauth || r.needsReauth) {
            show('setupScreen');
            $('su_err').textContent = 'Sürüm güncellendi. Lütfen DB parolasını bir kez yeniden girin.';
            return;
        }
    } catch { /* yok say */ }
    show('setupScreen'); // bağlanılamadı (sunucu/parola değişmiş olabilir)
}

function show(screen) {
    ['setupScreen', 'app', 'licenseScreen'].forEach(s => $(s).classList.add('hidden'));
    $(screen).classList.remove('hidden');
}

// Güncelleme sonrası (sürüm değişince) bir kez ban-riski bilgilendirme ekranı.
const NOTICE_HTML = `
<p><b>Bu sürümde WhatsApp ban riskinizi en aza indirmek için yeni araçlar var. Lütfen uygulayın:</b></p>
<ul style="margin:8px 0 8px 18px; padding:0">
<li>📉 <b>Günde 100-150 mesajı aşmayın.</b> ⚙ Ayarlar → <b>Ban Koruması</b>'ndan günlük üst sınır + uyarı eşiği belirleyin. Eşiğe gelince "devam edeyim mi?" diye sorar.</li>
<li>💬 <b>Cevap vermeyene ısrar etmeyin.</b> <b>Dönüş-budama</b>'yı açın: üst üste yanıt alınmayan numaraya otomatik gönderim durur (şikayet/ban sinyalini keser).</li>
<li>📇 <b>Müşteri sizi rehbere kaydetsin.</b> <b>"İlk mesaja kaydet ricası"</b> seçeneğini açın — rehbere kayıtsız numaraya toplu mesaj en büyük ban sebebidir.</li>
<li>🕐 <b>Güne yayın.</b> Gönderim saatlerini genişletin; tek saatte patlama yapmayın.</li>
<li>🖼️ <b>Numara profilini doldurun</b> (firma adı + profil fotoğrafı) — şikayet ihtimalini düşürür.</li>
</ul>
<p class="muted">Tüm bu ayarlar: sağ üst <b>⚙ Ayarlar → Ban Koruması</b> bölümünde.</p>`;
function maybeShowNotice(version) {
    try {
        const key = version || 'unknown';
        if (localStorage.getItem('vega.noticeVer') === key) return; // bu sürüm görüldü
        $('noticeBody').innerHTML = NOTICE_HTML;
        $('noticeModal').classList.remove('hidden');
        $('noticeOk').onclick = () => {
            try { localStorage.setItem('vega.noticeVer', key); } catch { /* yok say */ }
            $('noticeModal').classList.add('hidden');
        };
    } catch { /* yok say */ }
}

// ─── Kurulum ───
function setupBody() {
    return {
        server: $('su_server').value.trim(),
        port: $('su_port').value.trim(),
        database: $('su_db').value.trim(),
        username: $('su_user').value.trim(),
        password: $('su_pass').value,
    };
}

$('su_test').onclick = async () => {
    const box = $('su_testResult');
    box.style.display = '';
    box.className = 'hint';
    box.textContent = 'Sınanıyor...';
    try {
        const r = await api('/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setupBody()) });
        if (r.success) { box.className = 'hint ok'; box.textContent = `✓ ${r.message}${r.firmaSayisi != null ? ` (${r.firmaSayisi} firma)` : ''}`; }
        else { box.className = 'err'; box.textContent = r.message; }
    } catch (e) { box.className = 'err'; box.textContent = 'Hata: ' + e.message; }
};

$('su_btn').onclick = async () => {
    $('su_err').textContent = '';
    const body = setupBody();
    $('su_btn').disabled = true;
    $('su_btn').textContent = 'Bağlanıyor...';
    try {
        const r = await api('/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.success) { await enterApp(); }
        else $('su_err').textContent = r.message;
    } catch (e) { $('su_err').textContent = 'Hata: ' + e.message; }
    $('su_btn').disabled = false;
    $('su_btn').textContent = 'Bağlan ve Kaydet';
};

// ═══════════════════════════════════════════════════════════════════════════
//  Ana uygulama
// ═══════════════════════════════════════════════════════════════════════════
async function enterApp() {
    show('app');
    $('dbDot').className = 'dot on';
    await loadFirmalar();
    startWaPolling();
    loadLicense();
}

async function loadFirmalar() {
    const r = await api('/firmalar');
    if (!r.success) { alert('Firmalar alınamadı: ' + r.message); return; }
    const sel = $('firmaSel');
    sel.innerHTML = '';
    r.data.forEach(f => {
        const o = document.createElement('option');
        o.value = f.FIRMANO;
        o.textContent = `${f.FIRMANO} — ${f.FIRMAADI}`;
        sel.appendChild(o);
    });
    if (!r.data.length) return;
    // Hatırlanan firma: bellek > localStorage > sunucu bağlamı > ilk firma.
    let pref = state.firmaNo || localContext().firmaNo;
    if (!pref) { try { const cr = await api('/settings/context'); pref = cr.context && cr.context.firmaNo; state.donemNo = (cr.context && cr.context.donemNo) || state.donemNo; } catch { /* yok say */ } }
    state.firmaNo = r.data.some(f => f.FIRMANO === pref) ? pref : r.data[0].FIRMANO;
    sel.value = state.firmaNo;
    await loadCari();
}

$('firmaSel').onchange = async () => { await saveContext($('firmaSel').value, state.donemNo); await loadCari(); };
$('searchBtn').onclick = loadCari;
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadCari(); });
// Canlı arama: yazdıkça (350ms bekleyerek) otomatik ara — Ara butonu kalktı.
let searchDebounce = null;
$('searchInput').addEventListener('input', () => { clearTimeout(searchDebounce); searchDebounce = setTimeout(loadCari, 350); });
$('onlySms').onchange = loadCari;
$('cariTypeSel').onchange = loadCari;
$('onlyBalance').onchange = loadCari;

async function loadCari() {
    if (!state.firmaNo) return;
    $('cariBody').innerHTML = `<tr><td colspan="4" class="muted" style="padding:18px">Yükleniyor...</td></tr>`;
    const search = encodeURIComponent($('searchInput').value.trim());
    const onlySms = $('onlySms').checked ? '1' : '0';
    const cariType = $('cariTypeSel').value || 'hepsi';
    const onlyBalance = $('onlyBalance').checked ? '1' : '0';
    const r = await api(`/cari?firmaNo=${state.firmaNo}&search=${search}&onlySmsGonder=${onlySms}&cariType=${cariType}&onlyWithBalance=${onlyBalance}&pageSize=1000`);
    if (!r.success) {
        $('cariBody').innerHTML = `<tr><td colspan="4" class="nophone" style="padding:18px">${r.message}</td></tr>`;
        return;
    }
    state.rows = r.data;
    state.cariLoadedAt = Date.now();
    renderCari();
    $('loadInfo').textContent = `${r.data.length} kayıt gösteriliyor${r.total > r.data.length ? ` (toplam ${r.total}, daraltmak için arayın)` : ''}`;
}

// Cari kart bilgileri günde 1 kez DB'den tazelenir (uygulama tray'de açık kalsa bile
// telefon/ünvan değişiklikleri en geç 24 saatte ekrana yansır). Seçimler korunur.
setInterval(() => {
    if (state.firmaNo && state.cariLoadedAt && Date.now() - state.cariLoadedAt > 24 * 60 * 60 * 1000) loadCari();
}, 60 * 60 * 1000);

// Cari tipi rozeti (FIRMATIPI bit-maskesi → etiket+renk).
const TIP_BADGE = {
    alici:     ['Alıcı', '#1d4ed8'],
    satici:    ['Satıcı', '#b45309'],
    her_ikisi: ['Alıcı+Satıcı', '#6d28d9'],
    diger:     ['Diğer', '#6b7280'],
};
function tipBadge(tip) {
    const x = TIP_BADGE[tip] || TIP_BADGE.diger;
    return ` <span class="tipbadge" style="background:${x[1]}" title="Cari tipi (FIRMATIPI): ${x[0]}">${x[0]}</span>`;
}
const fmtBakiye = (b) => b == null ? '' : ` <span class="bakiye ${b > 0 ? 'borc' : (b < 0 ? 'alacak' : '')}" title="Güncel bakiye (+ borç / − alacak)">${b.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>`;

function renderCari() {
    const body = $('cariBody');
    if (!state.rows.length) {
        body.innerHTML = `<tr><td colspan="4" class="muted" style="padding:18px">Kayıt yok.</td></tr>`;
        return;
    }
    body.innerHTML = '';
    for (const row of state.rows) {
        const tr = document.createElement('tr');
        const checked = state.selected.has(row.ind);
        if (checked) tr.classList.add('sel');
        tr.innerHTML = `
            <td class="c"><input type="checkbox" ${checked ? 'checked' : ''} ${row.phone ? '' : 'disabled'} /></td>
            <td>${esc(row.unvan)}${row.smsGonder ? ' <span class="smsbadge" title="SMS Gönder izni var (SMSGONDER)">SMS</span>' : ''}${tipBadge(row.tip)}${fmtBakiye(row.bakiye)}</td>
            <td class="muted">${esc(row.kod)}</td>
            <td>${row.phone ? `<span title="${esc(row.phoneRaw)}">${esc(row.phone)}</span>${row.valid ? '' : ' <span class="nophone">?</span>'}` : '<span class="nophone">telefon yok</span>'}</td>
        `;
        const cb = tr.querySelector('input');
        cb.onchange = () => toggleSelect(row, cb.checked, tr);
        body.appendChild(tr);
    }
    updateSelCount();
}

// phones = karttaki tüm geçerli numaralar ("tüm numaralara gönder" seçeneği için).
// firma = FIRMAADI ("Sayın {firma} müşterimiz"), smsGonder = SMS Gönder izni biti.
const selObj = (row) => ({ ind: row.ind, name: row.unvan, unvan: row.unvan, firma: row.firma || row.unvan, kod: row.kod, phone: row.phone, phones: row.phones || [], valid: row.valid, smsGonder: row.smsGonder });

function toggleSelect(row, on, tr) {
    if (on && row.phone) {
        state.selected.set(row.ind, selObj(row));
        tr && tr.classList.add('sel');
    } else {
        state.selected.delete(row.ind);
        tr && tr.classList.remove('sel');
    }
    updateSelCount();
}

$('selAll').onchange = (e) => {
    state.rows.forEach(row => { if (row.phone) state.selected.set(row.ind, selObj(row)); });
    if (!e.target.checked) state.rows.forEach(row => state.selected.delete(row.ind));
    renderCari();
};
$('selPage').onclick = () => { state.rows.forEach(row => { if (row.phone) state.selected.set(row.ind, selObj(row)); }); renderCari(); };
$('selClear').onclick = () => { state.selected.clear(); renderCari(); };

function updateSelCount() {
    $('selCount').textContent = state.selected.size;
    // "Temizle" yalnız seçim varken görünsün (ekranda gereksiz buton kalmasın).
    $('selClear').style.display = state.selected.size ? '' : 'none';
    updateEstimate();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Mesaj / değişken / medya
// ═══════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.chip').forEach(c => {
    c.onclick = () => {
        const ta = $('msgText');
        const v = c.dataset.var;
        const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, pos) + v + ta.value.slice(pos);
        ta.focus();
    };
});

$('mediaInput').onchange = () => {
    const f = $('mediaInput').files[0];
    const box = $('mediaPreview');
    box.innerHTML = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    if (f.type.startsWith('image/')) box.innerHTML = `<img src="${url}" />`;
    else if (f.type.startsWith('video/')) box.innerHTML = `<video src="${url}" controls></video>`;
    else box.innerHTML = `<span class="muted">${esc(f.name)}</span>`;
    updateEstimate();
};

function getPacing() {
    return {
        minDelayMs: Math.max(1, +$('p_min').value) * 1000,
        maxDelayMs: Math.max(+$('p_min').value + 1, +$('p_max').value) * 1000,
        batchSize: Math.max(1, +$('p_batch').value),
        dailyCap: Math.max(1, +$('p_cap').value),
        batchPauseMinMs: Math.max(1, +$('p_pmin').value) * 1000,
        batchPauseMaxMs: Math.max(+$('p_pmin').value + 1, +$('p_pmax').value) * 1000,
        simulateTyping: $('p_typing').checked,
        verifyOnWhatsApp: $('p_verify').checked,
        shuffle: $('p_shuffle').checked,
    };
}

// "Tüm numaralara gönder" açıksa hedef sayısı = seçili carilerin numara toplamı.
function countBulkTargets() {
    if (!$('bulkAllPhones').checked) return state.selected.size;
    let n = 0;
    state.selected.forEach(r => { n += (r.phones && r.phones.length) ? r.phones.length : 1; });
    return n;
}

function updateEstimate() {
    const n = Math.min(countBulkTargets(), +$('p_cap').value);
    if (!n) { $('estimate').textContent = ''; return; }
    const p = getPacing();
    const avgDelay = (p.minDelayMs + p.maxDelayMs) / 2;
    const batches = Math.floor(n / p.batchSize);
    const avgPause = (p.batchPauseMinMs + p.batchPauseMaxMs) / 2;
    const totalMs = n * avgDelay + batches * avgPause;
    const min = Math.round(totalMs / 60000);
    $('estimate').textContent = `~${n} mesaj, tahmini süre ~${min} dakika (bot koruması gecikmeleriyle).`;
}
['p_min', 'p_max', 'p_batch', 'p_cap', 'p_pmin', 'p_pmax'].forEach(id => $(id).oninput = updateEstimate);
$('bulkAllPhones').onchange = updateEstimate;

// ═══════════════════════════════════════════════════════════════════════════
//  WhatsApp durum / QR
// ═══════════════════════════════════════════════════════════════════════════
function startWaPolling() {
    if (state.waPollTimer) clearInterval(state.waPollTimer);
    pollWa();
    state.waPollTimer = setInterval(pollWa, 4000);
}

async function pollWa() {
    try {
        const r = await api('/wa/status');
        state.waReady = r.ready;
        const dot = $('waDot');
        const label = $('waLabel');
        if (r.ready) { dot.className = 'dot on'; label.textContent = r.relay ? 'Ana PC üzerinden bağlı' : 'WhatsApp bağlı'; }
        else if (r.relay) { dot.className = 'dot wait'; label.textContent = 'Ana PC bekleniyor'; }
        else if (r.hasQr) { dot.className = 'dot wait'; label.textContent = 'QR bekliyor'; }
        else { dot.className = 'dot wait'; label.textContent = 'Bağlanıyor...'; }

        // QR modal açıksa içeriği güncelle
        if (!$('waModal').classList.contains('hidden')) renderWaModal(r);
        // Ban uyarı eşiği aşıldıysa devam-onayı popup'ı.
        handleWarn(r.antiban);
    } catch { /* yok say */ }
}

// ─── Ban uyarısı (devam onayı) ────────────────────────────────────────────────
// Hesabın günlük toplamı uyarı eşiğini aşınca (antiban.warnPending) popup çıkar.
// Evet → sunucuya onay (o kata) → gönderim sürer. Hayır → 30 dk ertele (otomatik
// gönderim zaten duraklı kalır; gün dönünce ya da onayla sürer).
let warnSnoozeUntil = 0;
function handleWarn(ab) {
    if (!ab || !ab.warnPending) return;
    if (Date.now() < warnSnoozeUntil) return;
    const modal = $('warnModal');
    if (!modal.classList.contains('hidden')) return;
    $('warnMsg').textContent = `Bu numaradan bugün ${ab.daySent ?? '?'} mesaj gönderildi (uyarı eşiği ${ab.warnAt}). Göndermeye devam edilsin mi?`;
    modal.classList.remove('hidden');
}
$('warnGo').onclick = async () => {
    $('warnModal').classList.add('hidden');
    warnSnoozeUntil = 0;
    try { await api('/antiban/ack', { method: 'POST' }); } catch { /* yok say */ }
    pollWa();
};
$('warnStop').onclick = () => {
    $('warnModal').classList.add('hidden');
    warnSnoozeUntil = Date.now() + 30 * 60 * 1000; // 30 dk tekrar sorma
};

function renderWaModal(r) {
    const c = $('waContent');
    if (r.relay) {
        // Relay modu: bu PC kendi WhatsApp'ını açmaz; durum ana PC'den gelir. QR yok.
        c.innerHTML = r.ready
            ? `<p style="color:var(--primary); font-weight:600">✓ Ana PC üzerinden bağlı</p><p class="muted">${r.me ? r.me.split(':')[0].split('@')[0] : ''}</p><p class="muted" style="margin-top:8px">Bu bilgisayar Relay modunda — gönderim ana PC'ye yollanır.</p>`
            : `<p class="nophone">${esc(r.error || 'Ana PC bekleniyor')}</p><p class="muted" style="margin-top:8px">Ana PC açık ve WhatsApp bağlı olmalı. Adres/token için Ayarlar → WhatsApp Gönderim Modu.</p>`;
        return;
    }
    if (r.ready) {
        c.innerHTML = `<p style="color:var(--primary); font-weight:600">✓ WhatsApp bağlı</p><p class="muted">${r.me ? r.me.split(':')[0] : ''}</p>`;
    } else if (r.qrImage) {
        c.innerHTML = `<img src="${r.qrImage}" alt="QR" /><p class="muted" style="margin-top:10px">Telefonda WhatsApp → Bağlı Cihazlar → Cihaz Bağla</p>`;
    } else if (r.error) {
        c.innerHTML = `<p class="nophone">${esc(r.error)}</p><p class="muted">Yeniden deneniyor...</p>`;
    } else {
        c.innerHTML = `<p class="muted">Bağlanıyor / QR hazırlanıyor...</p>`;
    }
}

$('waBtn').onclick = () => { $('waModal').classList.remove('hidden'); pollWa(); };
$('waClose').onclick = () => $('waModal').classList.add('hidden');
$('waRefresh').onclick = async () => {
    if (!confirm('WhatsApp oturumu sıfırlanacak, yeni QR çıkacak. Devam?')) return;
    $('waContent').innerHTML = '<p class="muted">Sıfırlanıyor...</p>';
    await api('/wa/refresh', { method: 'POST' });
    setTimeout(pollWa, 1500);
};
// ═══════════════════════════════════════════════════════════════════════════
//  Ayarlar modalı (SQL bağlantısı + varsayılan firma/dönem — en başa dönmez)
// ═══════════════════════════════════════════════════════════════════════════
$('settingsBtn').onclick = openSettings;
$('set_close').onclick = () => $('settingsModal').classList.add('hidden');

async function openSettings() {
    $('set_err').textContent = '';
    $('set_testResult').style.display = 'none';
    $('set_pass').value = '';
    try {
        const r = await api('/settings/db');
        if (r.db) {
            $('set_server').value = r.db.server || '';
            $('set_port').value = r.db.port || '1433';
            $('set_db').value = r.db.database || '';
            $('set_user').value = r.db.username || '';
        }
    } catch { /* yok say */ }
    try {
        const sw = await api('/send-window');
        if (sw.success && sw.window) {
            $('sw_enabled').checked = sw.window.enabled !== false;
            $('sw_start').value = sw.window.start || '10:00';
            $('sw_end').value = sw.window.end || '20:00';
            const days = Array.isArray(sw.window.days) ? sw.window.days : [1, 2, 3, 4, 5, 6];
            [0, 1, 2, 3, 4, 5, 6].forEach(d => { const el = $('sw_day_' + d); if (el) el.checked = days.includes(d); });
        }
    } catch { /* yok say */ }
    try {
        const ab = await api('/antiban');
        if (ab.success) {
            $('ab_dailyCap').value = ab.limits.userDailyCap || '';
            $('ab_warnAt').value = (ab.limits.warnAt != null) ? ab.limits.warnAt : 120;
            $('ab_guardEnabled').checked = !!(ab.guard && ab.guard.enabled);
            $('ab_noReplyLimit').value = (ab.guard && ab.guard.noReplyLimit) || 6;
            $('ab_askSave').checked = !!(ab.guard && ab.guard.askSaveContact);
            const eng = ab.engage || {};
            $('ab_engInfo').textContent = `İzlenen ${eng.tracked || 0} numara · susturulan ${eng.suspendedCount || 0}`;
        }
    } catch { /* yok say */ }
    try {
        const w = await api('/settings/wa');
        if (w.success) {
            $('set_waMode').value = w.mode || 'local';
            $('set_relayTarget').value = w.relayTarget || '';
            $('set_relayToken').value = '';
            $('set_relayToken').placeholder = w.hasToken ? '(kayıtlı — değişmeyecekse boş bırak)' : 'ortak gizli parola';
            toggleRelayFields();
            const wr = $('set_waResult');
            if (w.relay) {
                wr.style.display = ''; wr.className = w.relay.ready ? 'hint ok' : 'hint';
                wr.textContent = w.relay.ready
                    ? `✓ Ana PC bağlı (${(w.relay.me || '').split(':')[0].split('@')[0]})`
                    : ('Ana PC: ' + (w.relay.error || 'bekleniyor'));
            } else { wr.style.display = 'none'; }
        }
    } catch { /* yok say */ }
    await loadSettingsFirmalar();
    $('settingsModal').classList.remove('hidden');
}

// WhatsApp Modu: relay seçilince ana PC adresi alanını göster.
function toggleRelayFields() {
    const el = $('set_relayFields');
    if (el) el.style.display = ($('set_waMode').value === 'relay') ? '' : 'none';
}
$('set_waMode').onchange = toggleRelayFields;
$('set_saveWa').onclick = async () => {
    const box = $('set_waResult');
    box.style.display = ''; box.className = 'hint'; box.textContent = 'Kaydediliyor...';
    try {
        const body = {
            mode: $('set_waMode').value,
            relayTarget: $('set_relayTarget').value.trim(),
            relayToken: $('set_relayToken').value,
        };
        const r = await api('/settings/wa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.success) {
            box.className = 'hint ok';
            if (r.mode === 'relay') {
                // Adres tamamlanmış olabilir (IP yazıldıysa http:// ve port eklenir) — göster.
                if (r.relayTarget) $('set_relayTarget').value = r.relayTarget;
                box.textContent = (r.relay && r.relay.ready)
                    ? `✓ Relay kaydedildi — ana PC bağlı (${r.relayTarget}).`
                    : `✓ Relay kaydedildi (${r.relayTarget}). Ana PC durumu: ${(r.relay && r.relay.error) || 'bekleniyor'}`;
            } else {
                box.textContent = '✓ Yerel mod kaydedildi (bu PC WhatsApp oturumu tutar).';
            }
            $('set_relayToken').value = '';
            try { pollWa(); } catch { /* yok say */ }
        } else {
            box.className = 'err'; box.textContent = r.message || 'Kaydedilemedi.';
        }
    } catch (e) { box.className = 'err'; box.textContent = 'Hata: ' + e.message; }
};

// Ban Koruması ayarlarını kaydet (günlük cap + uyarı eşiği + dönüş-budama + kaydet-opt-in).
$('ab_save').onclick = async () => {
    const box = $('ab_result');
    box.style.display = ''; box.className = 'hint'; box.textContent = 'Kaydediliyor...';
    try {
        const capVal = $('ab_dailyCap').value.trim();
        const warnVal = $('ab_warnAt').value.trim();
        const lr = await api('/antiban/limits', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userDailyCap: capVal === '' ? 0 : Number(capVal), warnAt: warnVal === '' ? 120 : Number(warnVal) }),
        });
        const gr = await api('/antiban/guard', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: $('ab_guardEnabled').checked, noReplyLimit: Number($('ab_noReplyLimit').value) || 6, askSaveContact: $('ab_askSave').checked }),
        });
        if (lr.success && gr.success) {
            box.className = 'hint ok';
            box.textContent = `✓ Kaydedildi (üst sınır ${lr.limits.userDailyCap || 'otomatik'}, uyarı ${lr.limits.warnAt || 'kapalı'}, budama ${gr.guard.enabled ? 'açık/' + gr.guard.noReplyLimit : 'kapalı'})`;
        } else { box.className = 'err'; box.textContent = 'Kaydedilemedi.'; }
    } catch (e) { box.className = 'err'; box.textContent = 'Hata: ' + e.message; }
};
$('ab_engReset').onclick = async () => {
    if (!confirm('Susturulan tüm numaralar yeniden gönderime açılsın mı?')) return;
    try {
        const r = await api('/antiban/engage/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (r.success) $('ab_engInfo').textContent = `Sıfırlandı (${r.reset} numara açıldı)`;
    } catch (e) { /* yok say */ }
};

$('sw_save').onclick = async () => {
    const box = $('sw_result');
    box.style.display = ''; box.className = 'hint'; box.textContent = 'Kaydediliyor...';
    try {
        const days = [0, 1, 2, 3, 4, 5, 6].filter(d => { const el = $('sw_day_' + d); return el && el.checked; });
        const r = await api('/send-window', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: $('sw_enabled').checked, start: $('sw_start').value, end: $('sw_end').value, days }),
        });
        if (r.success) {
            const DN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
            const dl = (r.window.days || []).map(d => DN[d]).join(',') || 'hiç';
            box.className = 'hint ok'; box.textContent = `✓ Kaydedildi (${r.window.start}–${r.window.end} · ${dl}${r.window.enabled ? '' : ', kapalı'})`;
        }
        else { box.className = 'err'; box.textContent = 'Kaydedilemedi.'; }
    } catch (e) { box.className = 'err'; box.textContent = 'Hata: ' + e.message; }
};

async function loadSettingsFirmalar() {
    const fr = await api('/firmalar');
    const sel = $('set_firma');
    sel.innerHTML = '';
    if (fr.success) fr.data.forEach(f => {
        const o = document.createElement('option');
        o.value = f.FIRMANO; o.textContent = `${f.FIRMANO} — ${f.FIRMAADI}`;
        sel.appendChild(o);
    });
    const ctx = localContext();
    const firmaNo = ctx.firmaNo || state.firmaNo;
    if (firmaNo && fr.success && fr.data.some(f => f.FIRMANO === firmaNo)) sel.value = firmaNo;
    await loadSettingsDonemler(ctx.donemNo || state.donemNo);
}

async function loadSettingsDonemler(selectDonem) {
    const firmaNo = $('set_firma').value;
    const sel = $('set_donem');
    sel.innerHTML = '<option>...</option>';
    const r = await api(`/donemler?firmaNo=${firmaNo}`);
    sel.innerHTML = '';
    if (r.success && r.data.length) {
        r.data.forEach(d => {
            const o = document.createElement('option');
            o.value = d.donemNo; o.textContent = d.donem ? `${d.donemNo} — ${d.donem}` : d.donemNo;
            sel.appendChild(o);
        });
        sel.value = selectDonem || r.data[r.data.length - 1].donemNo;
    } else {
        sel.innerHTML = '<option value="">dönem yok</option>';
    }
}

// Firma/dönem değişince bağlamı kaydet + toplu ekranı aynı firmaya getir (en başa dönmeden).
$('set_firma').onchange = async () => { await loadSettingsDonemler(); await applySettingsContext(); };
$('set_donem').onchange = applySettingsContext;

async function applySettingsContext() {
    const firmaNo = $('set_firma').value, donemNo = $('set_donem').value;
    if (!firmaNo) return;
    await saveContext(firmaNo, donemNo);
    if ($('firmaSel').value !== firmaNo) { $('firmaSel').value = firmaNo; await loadCari(); }
}

$('set_test').onclick = async () => {
    const box = $('set_testResult');
    box.style.display = ''; box.className = 'hint'; box.textContent = 'Sınanıyor...';
    const body = { server: $('set_server').value.trim(), port: $('set_port').value.trim(), database: $('set_db').value.trim(), username: $('set_user').value.trim(), password: $('set_pass').value };
    if (!body.password) { box.className = 'err'; box.textContent = 'Sınamak için parola girin.'; return; }
    try {
        const r = await api('/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.success) { box.className = 'hint ok'; box.textContent = `✓ ${r.message}${r.firmaSayisi != null ? ` (${r.firmaSayisi} firma)` : ''}`; }
        else { box.className = 'err'; box.textContent = r.message; }
    } catch (e) { box.className = 'err'; box.textContent = 'Hata: ' + e.message; }
};

$('set_saveDb').onclick = async () => {
    $('set_err').textContent = '';
    const body = { server: $('set_server').value.trim(), port: $('set_port').value.trim(), database: $('set_db').value.trim(), username: $('set_user').value.trim(), password: $('set_pass').value };
    $('set_saveDb').disabled = true;
    try {
        const r = await api('/settings/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.success) { $('set_pass').value = ''; await loadFirmalar(); $('settingsModal').classList.add('hidden'); }
        else $('set_err').textContent = r.message;
    } catch (e) { $('set_err').textContent = 'Hata: ' + e.message; }
    $('set_saveDb').disabled = false;
};

$('set_reset').onclick = async () => {
    if (!confirm('Tüm DB ayarları silinecek ve kurulum ekranına dönülecek. Emin misiniz?')) return;
    await api('/reset', { method: 'POST' });
    await forgetPin();
    location.reload();
};

// ═══════════════════════════════════════════════════════════════════════════
//  Gönderim
// ═══════════════════════════════════════════════════════════════════════════
$('sendBtn').onclick = async () => {
    $('sendErr').textContent = '';
    let recipients = [...state.selected.values()];
    if (!recipients.length) { $('sendErr').textContent = 'Önce cari seçin.'; return; }
    // Seçenek açıksa her cari, karttaki numara sayısı kadar alıcıya açılır
    // (sunucu aynı numarayı zaten tekilleştirir).
    if ($('bulkAllPhones').checked) {
        recipients = recipients.flatMap(r =>
            ((r.phones && r.phones.length) ? r.phones : [r.phone]).map(p => ({ ...r, phone: p })));
    }
    if (!state.waReady) { $('sendErr').textContent = 'WhatsApp bağlı değil. Sağ üstten QR okutun.'; $('waModal').classList.remove('hidden'); pollWa(); return; }
    const message = $('msgText').value;
    const media = $('mediaInput').files[0];
    if (!message.trim() && !media) { $('sendErr').textContent = 'Mesaj metni veya medya gerekli.'; return; }

    // Gönderim log'unda "mesajı gör" için: gönderilen şablon + alıcılar telefon bazlı saklanır.
    state.jobMessage = message;
    state.jobRecipients = {};
    recipients.forEach(rr => { if (rr.phone) state.jobRecipients[String(rr.phone)] = rr; });

    const pacing = getPacing();
    if (!confirm(`${recipients.length} kişiye gönderilecek (günlük tavan: ${pacing.dailyCap}).\nTahmini süre üstte yazıyor. Başlatılsın mı?`)) return;

    const fd = new FormData();
    fd.append('recipients', JSON.stringify(recipients));
    fd.append('message', message);
    fd.append('pacing', JSON.stringify(pacing));
    if (media) fd.append('media', media);

    $('sendBtn').disabled = true;
    let r;
    try {
        r = await fetch('/api/send-bulk', { method: 'POST', body: fd }).then(x => x.json());
    } catch (e) { $('sendErr').textContent = 'Hata: ' + e.message; $('sendBtn').disabled = false; return; }
    $('sendBtn').disabled = false;
    if (!r.success) { $('sendErr').textContent = r.message; return; }

    openSendModal(r.jobId, r.total);
};

function openSendModal(jobId, total) {
    state.currentJob = jobId;
    $('sendModal').classList.remove('hidden');
    $('s_total').textContent = total;
    $('s_sent').textContent = '0';
    $('s_failed').textContent = '0';
    $('s_skipped').textContent = '0';
    $('s_bar').style.width = '0%';
    $('s_log').innerHTML = '';
    $('s_status').textContent = 'Başlatılıyor...';
    $('s_cancel').style.display = '';
    $('s_done').style.display = 'none';

    let sent = 0, failed = 0, skipped = 0, processed = 0;
    const es = new EventSource(`/api/send-stream/${jobId}`);
    state.sse = es;

    es.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        if (d.type === 'progress') {
            processed++;
            if (d.status === 'sent') sent++;
            else if (d.status === 'failed') failed++;
            else skipped++;
            $('s_sent').textContent = sent;
            $('s_failed').textContent = failed;
            $('s_skipped').textContent = skipped;
            $('s_bar').style.width = `${Math.round((processed / total) * 100)}%`;
            addLog(d.name || d.phone, d.phone, d.status, d.error);
            $('s_status').textContent = `${processed}/${total} işlendi...`;
        } else if (d.type === 'delay') {
            $('s_status').textContent = `Bekleniyor (${Math.round(d.ms / 1000)} sn)...`;
        } else if (d.type === 'batchPause') {
            $('s_status').textContent = `Parti molası: ${Math.round(d.ms / 1000)} sn (${d.after} gönderildi)...`;
            addLogRaw(`⏸ Parti molası ${Math.round(d.ms / 1000)} sn`, 'info');
        } else if (d.type === 'waDisconnected') {
            $('s_status').textContent = 'WhatsApp bağlantısı koptu — bağlanınca devam edilecek...';
            addLogRaw('⚠ Bağlantı koptu, kalan mesajlar sırada bekliyor', 'info');
        } else if (d.type === 'waReconnected') {
            $('s_status').textContent = 'Yeniden bağlandı, gönderim sürüyor...';
            addLogRaw('✓ Yeniden bağlandı, gönderim devam ediyor', 'info');
        } else if (d.type === 'capReached') {
            addLogRaw(`Günlük tavana ulaşıldı (${d.cap})`, 'info');
        } else if (d.type === 'cancelled') {
            addLogRaw('Kullanıcı durdurdu', 'info');
        } else if (d.type === 'done') {
            $('s_status').textContent = `Tamamlandı. Gönderildi: ${d.sentCount}`;
            finishModal();
            es.close();
        } else if (d.type === 'error') {
            $('s_status').textContent = 'Hata: ' + d.error;
            finishModal();
            es.close();
        }
    };
    es.onerror = () => { /* sunucu stream'i kapattıysa done gelmiş olabilir */ };
}

function finishModal() {
    $('s_cancel').style.display = 'none';
    $('s_done').style.display = '';
}

$('s_cancel').onclick = async () => {
    if (state.currentJob) await api(`/send-cancel/${state.currentJob}`, { method: 'POST' });
    $('s_status').textContent = 'Durduruluyor...';
};
$('s_done').onclick = () => { $('sendModal').classList.add('hidden'); if (state.sse) state.sse.close(); };

function addLog(name, phone, status, error) {
    const labels = { sent: 'Gönderildi', failed: 'Başarısız', invalid: 'Geçersiz no', notOnWhatsApp: 'WA yok' };
    const rcp = state.jobRecipients ? state.jobRecipients[String(phone)] : null;
    const canShow = rcp && (state.jobMessage || '').trim();
    const div = document.createElement('div');
    div.className = 'logline';
    div.innerHTML = `<span>${esc(name || '')} <span class="muted">${esc(phone || '')}</span>${error ? ` <span class="muted">— ${esc(error)}</span>` : ''}${canShow ? ` <a href="#" class="s_msg">mesajı gör</a>` : ''}</span><span class="st ${status}">${labels[status] || status}</span>`;
    if (canShow) div.querySelector('.s_msg').onclick = (ev) => { ev.preventDefault(); showBulkMessage(rcp, status); };
    const log = $('s_log');
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}
function addLogRaw(text, cls) {
    const div = document.createElement('div');
    div.className = 'logline';
    div.innerHTML = `<span class="st ${cls || ''}">${esc(text)}</span>`;
    $('s_log').appendChild(div);
    $('s_log').scrollTop = $('s_log').scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Sekmeler + Belge Tipi Mesajları (watcher, çok kurallı)
// ═══════════════════════════════════════════════════════════════════════════
// ─── Erişim kilidi (AI Oto-Yanıt + Hesap Extresi) ───────────────────────────────
// Bu iki bölüm giriş şifresiyle sınırlıdır; Firma Bilgileri açıktır. Sekmeye tıklayınca
// şifre sorulur; doğru şifre cihazda (localStorage) hatırlanır ve TEK giriş HER İKİ
// bölümü açar. Şifre düz değil, SHA-256 hash'i gömülü. (Yerel araç — istemci koruması.)
const ACCESS_PW_HASH = '66202fae8c01b9b5014aefe8175ff064e25c0209ab4d58ef174c4bf070e3663f';
// Eski 'vega.extreUnlock' anahtarı da kabul edilir (geriye dönük — yeniden şifre sorMA).
function accessUnlocked() {
    try { return localStorage.getItem('vega.accessUnlock') === '1' || localStorage.getItem('vega.extreUnlock') === '1'; }
    catch { return false; }
}
async function sha256hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// NOT: Electron window.prompt() DESTEKLEMEZ (null döner) → özel modal kullanılır.
function ensureAccessUnlocked() {
    if (accessUnlocked()) return Promise.resolve(true);
    return new Promise((resolve) => {
        const modal = $('extreLockModal'), inp = $('exLockPw'), err = $('exLockErr');
        const okB = $('exLockOk'), cancelB = $('exLockCancel');
        err.textContent = ''; inp.value = '';
        modal.classList.remove('hidden');
        setTimeout(() => inp.focus(), 50);
        const cleanup = () => {
            okB.removeEventListener('click', onOk);
            cancelB.removeEventListener('click', onCancel);
            inp.removeEventListener('keydown', onKey);
        };
        const finish = (v) => { modal.classList.add('hidden'); cleanup(); resolve(v); };
        const onOk = async () => {
            try { if ((await sha256hex(inp.value)) === ACCESS_PW_HASH) { try { localStorage.setItem('vega.accessUnlock', '1'); } catch { /* yok say */ } return finish(true); } }
            catch { /* crypto.subtle yoksa */ }
            err.textContent = 'Şifre hatalı.'; inp.select();
        };
        const onCancel = () => finish(false);
        const onKey = (e) => { if (e.key === 'Enter') onOk(); else if (e.key === 'Escape') onCancel(); };
        okB.addEventListener('click', onOk);
        cancelB.addEventListener('click', onCancel);
        inp.addEventListener('keydown', onKey);
    });
}

document.querySelectorAll('.tab').forEach(t => {
    t.onclick = async () => {
        // AI Oto-Yanıt + Hesap Extresi kilitli: giriş şifresi girilmeden sekme değişmesin.
        if ((t.dataset.view === 'viewExtre' || t.dataset.view === 'viewAiBot') && !(await ensureAccessUnlocked())) return;
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const v = t.dataset.view;
        ['viewDashboard', 'viewBulk', 'viewWatcher', 'viewReminders', 'viewExtre', 'viewAiBot', 'viewFirma'].forEach(id => { const el = $(id); if (el) el.style.display = (id === v) ? '' : 'none'; });
        const at = $('appbarTitle'); if (at) at.textContent = t.dataset.title || t.textContent.trim();
        if (v === 'viewDashboard') initDashboardView();
        if (v === 'viewWatcher') initWatcherView();
        if (v === 'viewReminders' && typeof initRemindersView === 'function') initRemindersView();
        if (v === 'viewExtre' && typeof initExtreView === 'function') initExtreView();
        if (v === 'viewAiBot' && typeof initAiBotView === 'function') initAiBotView();
        if (v === 'viewFirma' && typeof initFirmaView === 'function') initFirmaView();
    };
});

// ═══════════════════════════════════════════════════════════════════════════
//  PANO (güven paneli) — gönderim/teslim/okundu/yanıt + anti-ban durumu
// ═══════════════════════════════════════════════════════════════════════════
let panoTimer = null;
let panoWired = false;

function initDashboardView() {
    if (!panoWired) {
        $('pn_refresh').onclick = () => refreshDashboard();
        $('pn_push').onclick = async () => {
            const b = $('pn_push'); const old = b.textContent;
            b.disabled = true; b.textContent = 'Gönderiliyor...';
            try {
                const r = await api('/stats/push-summary', { method: 'POST' });
                b.textContent = r.success ? '✓ Gönderildi' : (r.message || 'Hata');
            } catch { b.textContent = 'Hata'; }
            setTimeout(() => { b.disabled = false; b.textContent = old; }, 2500);
        };
        panoWired = true;
    }
    refreshDashboard();
    if (panoTimer) clearInterval(panoTimer);
    // Görünürken 6 sn'de bir tazele; sekme değişince dur (boşa istek atma).
    panoTimer = setInterval(() => {
        if ($('viewDashboard').style.display !== 'none') refreshDashboard();
        else { clearInterval(panoTimer); panoTimer = null; }
    }, 6000);
}

async function refreshDashboard() {
    try {
        const r = await api('/stats');
        if (!r.success) return;
        renderDashboard(r);
    } catch { /* yok say */ }
}

function renderDashboard(r) {
    const t = r.today || {};
    $('pn_date').textContent = t.date || '';
    $('pn_sent').textContent = t.sent ?? 0;
    $('pn_delivered').textContent = t.delivered ?? 0;
    $('pn_read').textContent = t.read ?? 0;
    $('pn_replies').textContent = t.replies ?? 0;
    $('pn_failed').textContent = t.failed ?? 0;
    $('pn_deliveredRate').textContent = `%${t.deliveredRate ?? 0}`;
    $('pn_readRate').textContent = `%${t.readRate ?? 0}`;

    $('pn_dr_txt').textContent = `%${t.deliveredRate ?? 0}`;
    $('pn_dr_bar').style.width = `${t.deliveredRate ?? 0}%`;
    $('pn_rr_txt').textContent = `%${t.readRate ?? 0}`;
    $('pn_rr_bar').style.width = `${t.readRate ?? 0}%`;

    // Anti-ban
    const ab = r.antiban;
    if (ab) {
        $('pn_ab_body').style.display = '';
        $('pn_ab_off').style.display = 'none';
        const warmTxt = ab.warmup ? `Isınma günü ${(ab.dayIndex ?? 0) + 1} · günlük tavan` : 'Günlük tavan';
        $('pn_warm').textContent = warmTxt;
        const dcap = ab.dailyCap || 0, dsent = ab.daySent || 0;
        $('pn_daycap_txt').textContent = `${dsent}/${dcap}`;
        $('pn_daycap_bar').style.width = `${dcap ? Math.min(100, Math.round(dsent / dcap * 100)) : 0}%`;
        const hcap = ab.hourCap || 0, hsent = ab.hourSent || 0;
        $('pn_hourcap_txt').textContent = `${hsent}/${hcap}`;
        $('pn_hourcap_bar').style.width = `${hcap ? Math.min(100, Math.round(hsent / hcap * 100)) : 0}%`;
        const cd = $('pn_cooldown');
        if (ab.cooldownUntil) {
            const mins = Math.max(1, Math.ceil((ab.cooldownUntil - Date.now()) / 60000));
            cd.classList.remove('hidden');
            cd.textContent = `⚠ Ban koruması aktif: gönderim durduruldu (~${mins} dk) — ${ab.cooldownReason || 'anormal kopma'}`;
        } else cd.classList.add('hidden');
    } else {
        $('pn_ab_body').style.display = 'none';
        $('pn_ab_off').style.display = '';
    }

    // 7 günlük mini grafik
    const hist = r.history || [];
    const max = Math.max(1, ...hist.map(d => d.sent || 0));
    const H = 84;
    $('pn_spark').innerHTML = hist.map(d => {
        const day = (d.date || '').slice(5); // MM-DD
        const bh = v => Math.round((v || 0) / max * H);
        return `<div class="spark-col" title="${esc(d.date)} — gönderildi ${d.sent || 0}, ulaştı ${d.delivered || 0}, okundu ${d.read || 0}, yanıt ${d.replies || 0}">
            <div class="spark-bars">
                <i class="sw-sent" style="height:${bh(d.sent)}px"></i>
                <i class="sw-del" style="height:${bh(d.delivered)}px"></i>
                <i class="sw-read" style="height:${bh(d.read)}px"></i>
            </div>
            <span>${esc(day)}</span>
        </div>`;
    }).join('');

    // Kanal kırılımı
    const CH_TR = { bulk: 'Toplu', reminder: 'Hatırlatma', belge: 'Belge', manual: 'Manuel', extre: 'Ekstre', aibot: 'AI Yanıt', other: 'Diğer' };
    const rows = t.byChannel || [];
    $('pn_chBody').innerHTML = rows.length
        ? rows.map(c => `<tr><td>${esc(CH_TR[c.ch] || c.ch)}</td><td class="r">${c.sent}</td><td class="r">${c.delivered}</td><td class="r">${c.read}</td></tr>`).join('')
        : '<tr><td colspan="4" class="muted" style="padding:14px">Bugün gönderim yok.</td></tr>';
}

// Belge tipi şablonunda kullanılabilir değişkenler (kart başına chip).
const WC_VARS = ['{firma}', '{ad}', '{tutar}', '{kod}', '{evrak}', '{tarih}', '{bakiye}', '{durum}', '{belge}', '{firmaadi}'];

// Hazır belge türleri (backend PRESET_RULES ile birebir) + Özel.
const WC_DOCTYPES = [
    { v: 'satisFaturasi', t: 'Satış Faturası' },
    { v: 'satisIrsaliyesi', t: 'Satış İrsaliyesi' },
    { v: 'stokCikis', t: 'Stok Çıkış Fişi' },
    { v: 'cariGiris', t: 'Cari Giriş (Tahsilat / ödeme alındı)' },
    { v: 'cariCikis', t: 'Cari Çıkış (Tediye / ödeme yapıldı)' },
    { v: 'alisFaturasi', t: 'Alış Faturası' },
    { v: 'stokGiris', t: 'Stok Giriş Fişi' },
    { v: 'custom', t: 'Özel (IZAHAT kodu ile)' },
];

let wcLoaded = false;
let wcLogTimer = null;

async function initWatcherView() {
    if (!wcLoaded) {
        const fr = await api('/firmalar');
        const sel = $('wc_firma');
        sel.innerHTML = '';
        if (fr.success) fr.data.forEach(f => {
            const o = document.createElement('option');
            o.value = f.FIRMANO; o.textContent = `${f.FIRMANO} — ${f.FIRMAADI}`;
            sel.appendChild(o);
        });
        sel.onchange = () => loadWatcherDonemler();
        $('wc_addRule').onclick = () => {
            const empty = $('wc_rules').querySelector('.muted'); if (empty) empty.remove();
            $('wc_rules').appendChild(createRuleCard({ enabled: true, docType: 'custom', direction: 'alacak', excludeFatura: true }));
        };
        wcLoaded = true;
    }
    await loadWatcherConfig();
    if (wcLogTimer) clearInterval(wcLogTimer);
    refreshWatcherLog();
    wcLogTimer = setInterval(refreshWatcherLog, 5000);
}

async function loadWatcherDonemler(selectDonem) {
    const firmaNo = $('wc_firma').value;
    const sel = $('wc_donem');
    sel.innerHTML = '<option>...</option>';
    const r = await api(`/donemler?firmaNo=${firmaNo}`);
    sel.innerHTML = '';
    if (r.success && r.data.length) {
        r.data.forEach(d => {
            const o = document.createElement('option');
            o.value = d.donemNo;
            o.textContent = d.donem ? `${d.donemNo} — ${d.donem}` : d.donemNo;
            sel.appendChild(o);
        });
        sel.value = selectDonem || r.data[r.data.length - 1].donemNo;
    } else {
        sel.innerHTML = '<option value="">dönem yok</option>';
    }
}

async function loadWatcherConfig() {
    const r = await api('/watcher');
    if (!r.success) return;
    const s = r.status;
    const ctx = localContext();
    if (s.firmaNo) $('wc_firma').value = s.firmaNo;
    else if (ctx.firmaNo) $('wc_firma').value = ctx.firmaNo;
    await loadWatcherDonemler(s.donemNo || ctx.donemNo);
    $('wc_interval').value = s.intervalSec || 30;
    $('wc_verify').checked = s.verifyOnWhatsApp !== false;
    $('wc_typing').checked = s.simulateTyping !== false;
    $('wc_allPhones').checked = s.sendAllPhones === true;
    $('wc_onlySms').checked = s.onlySmsGonder === true;
    $('wc_sendAlacakli').checked = s.sendAlacakli !== false;
    $('wc_cariType').value = s.cariType || 'hepsi';
    $('wc_watchEdits').checked = s.watchEdits === true;
    $('wc_watchDeletes').checked = s.watchDeletes === true;
    $('wc_editTemplate').value = s.editTemplate || '';
    renderWatcherRules(s.rules || []);
    renderWatcherState(s);
}

function renderWatcherRules(rules) {
    const box = $('wc_rules');
    box.innerHTML = '';
    if (!rules.length) {
        box.innerHTML = '<div class="muted" style="padding:10px 0">Henüz mesaj türü yok. <b>+ Yeni mesaj türü ekle</b> ile başlayın.</div>';
        return;
    }
    rules.forEach(r => box.appendChild(createRuleCard(r)));
}

// Bir belge tipi kuralının kartını oluşturur (DOM + olaylar).
function createRuleCard(rule) {
    rule = rule || {};
    const id = rule.id || `rule-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const dir = rule.direction || 'alacak';
    const docType = rule.docType || 'custom';
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.dataset.id = id;
    const mediaInfo = (rule.media && rule.media.name)
        ? `Kayıtlı: <b>${esc(rule.media.name)}</b>${rule.media.kind ? ` (${esc(rule.media.kind)})` : ''} <a href="#" class="rc_mediaClear">Kaldır</a>` : '';
    card.innerHTML = `
        <div class="rule-head">
            <label class="check"><input type="checkbox" class="rc_enabled" ${rule.enabled ? 'checked' : ''} /> <b>Etkin</b></label>
            <input class="rc_name" placeholder="Tür adı (örn: Satış Faturası)" value="${esc(rule.name || '')}" />
            <button class="btn ghost xs rc_del" title="Bu türü sil">✕</button>
        </div>
        <div class="field">
            <label>Belge türü</label>
            <select class="rc_docType">${WC_DOCTYPES.map(d => `<option value="${d.v}">${d.t}</option>`).join('')}</select>
            <div class="hint rc_docHint"></div>
        </div>
        <div class="rc_advanced" style="display:none">
            <div class="row">
                <div class="field"><label>Yön</label>
                    <select class="rc_dir">
                        <option value="alacak">Tahsilat / Ödeme (ALACAK)</option>
                        <option value="borc">Fatura / Borçlandırma (BORC)</option>
                        <option value="any">Her ikisi</option>
                    </select>
                </div>
                <div class="field" style="flex:.55"><label>Min tutar</label><input class="rc_min" type="number" min="0" value="${Number(rule.minAmount) || 0}" /></div>
            </div>
            <div class="field">
                <label>IZAHAT kodları (virgülle; boş = bu yöndeki tüm kodlar)</label>
                <input class="rc_codes" placeholder="örn: 13, 32, 83" value="${esc((rule.izahatCodes || []).join(', '))}" />
                <div class="hint"><a href="#" class="rc_showCodes">Bu dönemdeki kodları göster</a></div>
                <div class="rc_codesList muted" style="font-size:12px; margin-top:6px"></div>
            </div>
            <label class="check"><input type="checkbox" class="rc_excludeFatura" /> Fatura kaynaklı satırları dışla <span class="muted">(tahsilat için önerilir)</span></label>
        </div>
        <div class="field rc_minSimple"><label>Min tutar (TL)</label><input class="rc_min2" type="number" min="0" value="${Number(rule.minAmount) || 0}" /></div>
        <div class="field">
            <label>Mesaj şablonu</label>
            <textarea class="rc_template" placeholder="Sayın {firma} müşterimiz, ...">${esc(rule.template || '')}</textarea>
            <div class="chips rc_chips">${WC_VARS.map(v => `<span class="chip" data-v="${v}">${v}</span>`).join('')}</div>
            <div class="hint">{firma}=cari adı, {tutar}=bu belgenin tutarı, {bakiye}=güncel kalan bakiye, {durum}=Borç/Alacak, {belge}=tür adı, {firmaadi}=kendi firma adın (Firma Bilgileri'nden).</div>
        </div>
        <label class="check rc_contentRow" style="display:none"><input type="checkbox" class="rc_includeContent" /> Belge içeriğini de gönder <span class="muted">(kesilen faturanın/belgenin kalemleri mesaja eklenir)</span></label>
        <div class="field">
            <label>Görsel / Video (opsiyonel)</label>
            <input type="file" class="rc_media" accept="image/*,video/*" />
            <div class="rc_mediaInfo hint" style="${mediaInfo ? '' : 'display:none'}">${mediaInfo}</div>
        </div>`;
    card.querySelector('.rc_dir').value = dir;
    card.querySelector('.rc_docType').value = docType;
    card.querySelector('.rc_excludeFatura').checked = (rule.excludeFatura !== undefined) ? !!rule.excludeFatura : (dir === 'alacak');
    card.querySelector('.rc_includeContent').checked = rule.includeContent === true;
    // Kalemli (içeriği olan) belge tipleri — "Belge içeriğini de gönder" yalnız bunlarda görünür.
    const CONTENT_DOCTYPES = new Set(['satisFaturasi', 'alisFaturasi', 'satisIrsaliyesi', 'alisIrsaliyesi', 'stokCikis', 'stokGiris']);
    // Hazır tip → gelişmiş alanlar (yön/kod/fatura) otomatik, gizli; özel → göster.
    const DOC_HINTS = {
        satisFaturasi: 'Satış faturası kesildiğinde (müşteri borçlanır) gönderilir.',
        satisIrsaliyesi: 'Satış irsaliyesi (sevk) düzenlendiğinde gönderilir.',
        stokCikis: 'Stok çıkış fişi (mal/ürün çıkışı) düzenlendiğinde gönderilir.',
        cariGiris: 'Cari giriş bordrosu = müşteriden ödeme/tahsilat alındığında gönderilir.',
        cariCikis: 'Cari çıkış bordrosu = tedarikçiye ödeme (tediye) yapıldığında gönderilir.',
        alisFaturasi: 'Alış faturası girildiğinde gönderilir.',
        stokGiris: 'Stok giriş fişi düzenlendiğinde gönderilir.',
        custom: 'IZAHAT kodlarını elle girerek özel bir kural tanımlayın.',
    };
    const applyDocTypeUI = () => {
        const dt = card.querySelector('.rc_docType').value;
        const custom = dt === 'custom';
        card.querySelector('.rc_advanced').style.display = custom ? '' : 'none';
        card.querySelector('.rc_minSimple').style.display = custom ? 'none' : '';
        card.querySelector('.rc_docHint').textContent = DOC_HINTS[dt] || '';
        card.querySelector('.rc_contentRow').style.display = CONTENT_DOCTYPES.has(dt) ? '' : 'none';
    };
    applyDocTypeUI();
    card.querySelector('.rc_docType').onchange = applyDocTypeUI;
    card.querySelector('.rc_del').onclick = () => card.remove();
    card.querySelectorAll('.rc_chips .chip').forEach(ch => ch.onclick = () => {
        const ta = card.querySelector('.rc_template');
        const v = ch.dataset.v;
        const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, pos) + v + ta.value.slice(pos);
        ta.focus();
    });
    card.querySelector('.rc_showCodes').onclick = (e) => { e.preventDefault(); showRuleCodes(card); };
    const mc = card.querySelector('.rc_mediaClear');
    if (mc) mc.onclick = async (e) => {
        e.preventDefault();
        await api(`/watcher/rules/${id}/media/clear`, { method: 'POST' });
        const box = card.querySelector('.rc_mediaInfo'); box.style.display = 'none'; box.innerHTML = '';
    };
    return card;
}

// Karttaki "kodları göster" — dönemin IZAHAT dağılımını listeler; koda tıkla ekle.
async function showRuleCodes(card) {
    const firmaNo = $('wc_firma').value, donemNo = $('wc_donem').value;
    const box = card.querySelector('.rc_codesList');
    if (!firmaNo || !donemNo) { box.textContent = 'Önce firma/dönem seçin.'; return; }
    box.textContent = 'Yükleniyor...';
    const r = await api(`/watcher/izahat-stats?firmaNo=${firmaNo}&donemNo=${donemNo}`);
    if (!r.success) { box.textContent = r.message; return; }
    if (!r.data.length) { box.textContent = 'Bu dönemde hareket yok.'; return; }
    const fmt = n => Number(n).toLocaleString('tr-TR');
    box.innerHTML = 'Koda tıkla ekle (A=alacak/tahsilat, B=borç/fatura):<br>' + r.data.map(d => {
        const borcAdet = (d.adet || 0) - (d.alacakAdet || 0);
        return `<span class="chip" data-code="${d.code}" style="cursor:pointer">${d.code}${d.label ? ' ' + esc(d.label) : ''}${d.devir ? ' ⚠devir' : ''} · ${d.alacakAdet || 0}A/${borcAdet}B</span>`;
    }).join(' ');
    box.querySelectorAll('[data-code]').forEach(ch => ch.onclick = () => {
        const inp = card.querySelector('.rc_codes');
        const cur = inp.value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
        if (!cur.includes(ch.dataset.code)) cur.push(ch.dataset.code);
        inp.value = cur.join(', ');
    });
}

function renderWatcherState(s) {
    const on = s.running;
    $('wcDot').className = 'dot ' + (on ? 'on' : '');
    $('wcState').textContent = on ? 'Aktif' : 'Pasif';
    $('wc_save').textContent = on ? 'Ayarları Kaydet' : 'Kaydet ve Başlat';
    $('wc_stop').style.display = on ? '' : 'none';
    const parts = [];
    if (s.table) parts.push(`Tablo: ${s.table}`);
    if (s.watermark != null) parts.push(`Son IND: ${s.watermark}`);
    if (s.pendingCount > 0) parts.push(`⏳ Kuyrukta ${s.pendingCount} mesaj (bağlanınca gönderilecek)`);
    if (s.lastPollAt) parts.push(`Son tarama: ${new Date(s.lastPollAt).toLocaleTimeString('tr-TR')}`);
    if (s.lastResult?.note) parts.push(s.lastResult.note);
    if (s.lastError) parts.push(`⚠ ${s.lastError}`);
    $('wc_status').textContent = parts.join('  •  ') || '—';
    $('wc_info').textContent = on ? `Her ${s.intervalSec}sn taranıyor` : '';
}

function collectRules() {
    return [...document.querySelectorAll('#wc_rules .rule-card')].map(card => {
        const docType = card.querySelector('.rc_docType').value;
        const custom = docType === 'custom';
        const minAmount = Math.max(0, +(custom ? card.querySelector('.rc_min').value : card.querySelector('.rc_min2').value) || 0);
        return {
            id: card.dataset.id,
            docType,
            name: card.querySelector('.rc_name').value.trim(),
            enabled: card.querySelector('.rc_enabled').checked,
            // Yön/kod/fatura-dışlama yalnız özel kuralda kullanıcıdan; hazır tipte backend belirler.
            direction: card.querySelector('.rc_dir').value,
            minAmount,
            izahatCodes: card.querySelector('.rc_codes').value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n)),
            excludeFatura: card.querySelector('.rc_excludeFatura').checked,
            includeContent: card.querySelector('.rc_includeContent').checked,
            template: card.querySelector('.rc_template').value,
        };
    });
}

function collectWatcherConfig() {
    return {
        firmaNo: $('wc_firma').value,
        donemNo: $('wc_donem').value,
        intervalSec: Math.max(10, +$('wc_interval').value || 30),
        verifyOnWhatsApp: $('wc_verify').checked,
        simulateTyping: $('wc_typing').checked,
        sendAllPhones: $('wc_allPhones').checked,
        onlySmsGonder: $('wc_onlySms').checked,
        sendAlacakli: $('wc_sendAlacakli').checked,
        cariType: $('wc_cariType').value || 'hepsi',
        watchEdits: $('wc_watchEdits').checked,
        watchDeletes: $('wc_watchDeletes').checked,
        editTemplate: $('wc_editTemplate').value,
        rules: collectRules(),
    };
}

$('wc_save').onclick = async () => {
    $('wc_err').textContent = '';
    const cfg = collectWatcherConfig();
    if (!cfg.firmaNo || !cfg.donemNo) { $('wc_err').textContent = 'Firma ve dönem seçin.'; return; }
    const bad = cfg.rules.find(r => r.enabled && !r.template.trim());
    if (bad) { $('wc_err').textContent = `"${bad.name || 'Mesaj türü'}" etkin ama şablonu boş.`; return; }
    $('wc_save').disabled = true;
    try {
        await api('/watcher', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
        // Her kartın seçili görsel/videosunu ilgili kurala yükle.
        for (const card of document.querySelectorAll('#wc_rules .rule-card')) {
            const f = card.querySelector('.rc_media').files[0];
            if (f) {
                const fd = new FormData(); fd.append('media', f);
                await fetch(`/api/watcher/rules/${card.dataset.id}/media`, { method: 'POST', body: fd });
                card.querySelector('.rc_media').value = '';
            }
        }
        if (cfg.rules.some(r => r.enabled)) {
            const r = await api('/watcher/start', { method: 'POST' });
            if (!r.success) $('wc_err').textContent = r.message || 'Başlatılamadı.';
        } else {
            await api('/watcher/stop', { method: 'POST' });
        }
        await loadWatcherConfig(); // kaydedilen kurallar + medya bilgisiyle tazele
    } catch (e) { $('wc_err').textContent = 'Hata: ' + e.message; }
    $('wc_save').disabled = false;
};

$('wc_stop').onclick = async () => {
    const r = await api('/watcher/stop', { method: 'POST' });
    renderWatcherState(r.status);
};

let wcLogEntries = []; // popup'ta mesaj gösterimi için son log (index ile erişilir)

async function refreshWatcherLog() {
    try {
        const r = await api('/watcher/log');
        if (!r.success) return;
        renderWatcherState(r.status);
        const box = $('wc_log');
        if (!r.log.length) { box.innerHTML = '<div class="muted" style="padding:10px">Henüz otomatik gönderim yok.</div>'; return; }
        wcLogEntries = r.log;
        const labels = { sent: 'Gönderildi', failed: 'Başarısız', noPhone: 'Telefon yok', noSmsConsent: 'SMS izni yok', notOnWhatsApp: 'WA yok', waOffline: 'WA kapalı', queued: 'Kuyrukta', pasif: 'Cari pasif', wrongType: 'Tip dışı', alacakli: 'Alacaklı (atlandı)', dropped: 'Düşürüldü', edited: 'Güncellendi', recalled: 'Geri çekildi', recallExpired: 'Geri çekilemedi (2 gün)', info: 'Bilgi' };
        box.innerHTML = r.log.map((e, i) => `
            <div class="logline">
                <span>${esc(e.name || '')} <span class="muted">${esc(e.phone || '')}</span>
                    ${e.tutar ? `<b>${esc(e.tutar)} TL</b>` : ''}
                    ${e.bakiye ? `<span class="muted">bakiye: ${esc(e.bakiye)} TL${e.bakiyeDurum ? ` <b>${esc(e.bakiyeDurum)}</b>` : ''}</span>` : ''}
                    ${e.evrak ? `<span class="muted">(${esc(e.evrak)})</span>` : ''}
                    ${e.error ? `<span class="muted">— ${esc(e.error)}</span>` : ''}
                    <span class="muted" style="font-size:11px">${e.at ? new Date(e.at).toLocaleTimeString('tr-TR') : ''}</span>
                    ${e.message ? `<a href="#" class="wc_msg" data-i="${i}">mesajı gör</a>` : ''}
                </span>
                <span class="st ${['sent', 'edited', 'recalled'].includes(e.status) ? 'sent' : (['failed', 'recallExpired'].includes(e.status) ? 'failed' : 'info')}">${labels[e.status] || e.status}</span>
            </div>`).join('');
        box.querySelectorAll('.wc_msg').forEach(a => a.onclick = (ev) => {
            ev.preventDefault();
            showSentMessage(wcLogEntries[+a.dataset.i]);
        });
    } catch { /* yok say */ }
}

// Mesaj/değişken yer tutucuları client tarafında doldur (toplu log popup'ı için).
// Sunucudaki renderMessage ile aynı: {ad}/{unvan}/{firma}/{kod}.
function renderClientMessage(tpl, r) {
    return String(tpl || '')
        .replace(/\{ad\}/gi, r.name || r.unvan || '')
        .replace(/\{unvan\}/gi, r.unvan || r.name || '')
        .replace(/\{firma\}/gi, r.firma || r.unvan || r.name || '')
        .replace(/\{kod\}/gi, r.kod || '');
}

// Popup'taki firma/cari bilgi bloğunu doldur (boş alanlar gizlenir).
function fillCariInfo(pairs) {
    const box = $('msgModalCari');
    const rows = pairs.filter(([, v]) => v != null && String(v).trim() !== '');
    box.innerHTML = rows.map(([k, v]) => `<div><span class="ci-k">${esc(k)}</span><span class="ci-v">${esc(v)}</span></div>`).join('');
    box.style.display = rows.length ? '' : 'none';
}

// Otomatik tahsilat log'undan: gönderilen mesaj + cari/firma bilgileri.
function showSentMessage(e) {
    if (!e || !e.message) return;
    $('msgModalMeta').textContent = [e.phone, e.at ? new Date(e.at).toLocaleString('tr-TR') : ''].filter(Boolean).join('  ·  ');
    fillCariInfo([
        ['Firma', e.firma || e.name],
        ['Ünvan', e.name],
        ['Kod', e.kod],
        ['Telefon', e.phone],
        ['Ödenen', e.tutar ? e.tutar + ' TL' : ''],
        ['Bakiye', e.bakiye ? e.bakiye + ' TL' + (e.bakiyeDurum ? ` (${e.bakiyeDurum})` : '') : ''],
        ['Evrak', e.evrak],
    ]);
    $('msgModalText').textContent = e.message;
    $('msgModal').classList.remove('hidden');
}

// Toplu gönderim log'undan: şablonu cariye göre doldur + cari/firma bilgileri.
function showBulkMessage(r, status) {
    const stLabel = { sent: 'Gönderildi', failed: 'Başarısız', invalid: 'Geçersiz no', notOnWhatsApp: 'WA yok' }[status] || status;
    $('msgModalMeta').textContent = [r.phone, stLabel].filter(Boolean).join('  ·  ');
    fillCariInfo([
        ['Firma', r.firma || r.unvan],
        ['Ünvan', r.unvan],
        ['Kod', r.kod],
        ['Telefon', r.phone],
        ['Geçerli numara', r.valid ? 'Evet' : 'Hayır'],
        ['SMS Gönder izni', r.smsGonder ? 'Var' : 'Yok'],
    ]);
    $('msgModalText').textContent = renderClientMessage(state.jobMessage, r);
    $('msgModal').classList.remove('hidden');
}
$('msgModalClose').onclick = () => $('msgModal').classList.add('hidden');

// ═══════════════════════════════════════════════════════════════════════════
//  Bakiye / Borç Hatırlatma (periyodik)
// ═══════════════════════════════════════════════════════════════════════════
const RM_VARS = ['{firma}', '{ad}', '{bakiye}', '{kalan}', '{durum}', '{vade}', '{vadeNot}', '{gecikmeGun}', '{enEskiVade}'];
const RM_TYPE_LABEL = { anyBalance: 'Bakiye hatırlatma (borçlular, vadesi gelmemiş)', overdueBuyer: 'Geciken borç hatırlatma (borçlular)' };
let rmLoaded = false;
let rmLogTimer = null;

async function initRemindersView() {
    if (!rmLoaded) {
        const fr = await api('/firmalar');
        const sel = $('rm_firma');
        sel.innerHTML = '';
        if (fr.success) fr.data.forEach(f => {
            const o = document.createElement('option');
            o.value = f.FIRMANO; o.textContent = `${f.FIRMANO} — ${f.FIRMAADI}`;
            sel.appendChild(o);
        });
        sel.onchange = () => loadRemindersDonemler();
        $('rm_save').onclick = saveReminders;
        rmLoaded = true;
    }
    await loadRemindersConfig();
    if (rmLogTimer) clearInterval(rmLogTimer);
    refreshRemindersLog();
    rmLogTimer = setInterval(refreshRemindersLog, 5000);
}

async function loadRemindersDonemler(selectDonem) {
    const firmaNo = $('rm_firma').value;
    const sel = $('rm_donem');
    sel.innerHTML = '<option>...</option>';
    const r = await api(`/donemler?firmaNo=${firmaNo}`);
    sel.innerHTML = '';
    if (r.success && r.data.length) {
        r.data.forEach(d => {
            const o = document.createElement('option');
            o.value = d.donemNo; o.textContent = d.donem ? `${d.donemNo} — ${d.donem}` : d.donemNo;
            sel.appendChild(o);
        });
        sel.value = selectDonem || r.data[r.data.length - 1].donemNo;
    } else {
        sel.innerHTML = '<option value="">dönem yok</option>';
    }
}

async function loadRemindersConfig() {
    const r = await api('/reminders');
    if (!r.success) return;
    const s = r.status;
    const ctx = localContext();
    if (s.firmaNo) $('rm_firma').value = s.firmaNo;
    else if (ctx.firmaNo) $('rm_firma').value = ctx.firmaNo;
    await loadRemindersDonemler(s.donemNo || ctx.donemNo);
    renderReminderCards(s.reminders || []);
    renderRemindersStatus(s);
}

function renderReminderCards(reminders) {
    const box = $('rm_cards');
    box.innerHTML = '';
    reminders.forEach(rem => box.appendChild(createReminderCard(rem)));
}

function createReminderCard(rem) {
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.dataset.id = rem.id;
    card.dataset.type = rem.type;
    const isOverdue = rem.type === 'overdueBuyer';
    // Normal bakiye: vade YOK (sadece kalan borç). Geciken (askıda): gecikmeGun/enEskiVade.
    const vars = RM_VARS.filter(v => isOverdue
        ? (v !== '{vade}' && v !== '{vadeNot}')
        : (v !== '{gecikmeGun}' && v !== '{enEskiVade}' && v !== '{vade}' && v !== '{vadeNot}'));
    const mediaInfo = (rem.media && rem.media.name)
        ? `Kayıtlı: <b>${esc(rem.media.name)}</b>${rem.media.kind ? ` (${esc(rem.media.kind)})` : ''} <a href="#" class="rm_mediaClear">Kaldır</a>` : '';
    const startVal = rem.startDate ? String(rem.startDate).slice(0, 10) : '';
    card.innerHTML = `
        <div class="rule-head">
            <label class="check"><input type="checkbox" class="rm_enabled" ${rem.enabled ? 'checked' : ''} /> <b>Etkin</b></label>
            <input class="rm_name" value="${esc(rem.name || RM_TYPE_LABEL[rem.type] || '')}" />
            <button class="btn ghost xs rm_preview" title="Göndermeden önce: kime ne gidecek (bakiye/vade) göster">Önizle</button>
            <button class="btn ghost xs rm_test" title="Şimdi bir kez gönder (test)">Şimdi gönder</button>
        </div>
        <div class="muted" style="font-size:12px; margin:-2px 0 8px">${esc(RM_TYPE_LABEL[rem.type] || rem.type)}</div>
        <div class="field">
            <label>Mesaj şablonu</label>
            <textarea class="rm_template" placeholder="Sayın {firma} müşterimiz, ...">${esc(rem.template || '')}</textarea>
            <div class="chips rm_chips">${vars.map(v => `<span class="chip" data-v="${v}">${v}</span>`).join('')}</div>
            ${isOverdue ? '<div class="hint">{kalan}=geciken borç tutarı, {gecikmeGun}=gün, {enEskiVade}=en eski vade tarihi.</div>' : '<div class="hint">{bakiye}=kalan borç (cari hareketten, işaretsiz; belge mesajıyla aynı). {durum}=Borç/Alacak.</div>'}
        </div>
        <div class="grid2">
            <div><label>Gün sıklığı</label><input class="rm_interval" type="number" min="1" value="${Number(rem.intervalDays) || 7}" /></div>
            <div><label>Gönderim saati</label><input class="rm_time" type="time" value="${esc(rem.sendTime || '10:00')}" /></div>
            <div><label>Başlangıç tarihi</label><input class="rm_start" type="date" value="${esc(startVal)}" /></div>
            <div><label>Min tutar (TL)</label><input class="rm_min" type="number" min="0" value="${Number(rem.minAmount) || 0}" /></div>
        </div>
        <div class="field"><label>Varsayılan vade günü (cari vadesi boşsa)</label><input class="rm_vade" type="number" min="0" value="${Number(rem.vadeGunDefault) || 90}" /></div>
        <label class="check"><input type="checkbox" class="rm_onlySms" ${rem.onlySmsGonder ? 'checked' : ''} /> Sadece <b>SMS Gönder izni</b> olan carilere</label>
        <label class="check"><input type="checkbox" class="rm_verify" ${rem.verifyOnWhatsApp !== false ? 'checked' : ''} /> Numara WhatsApp'ta mı kontrol et</label>
        <div class="field">
            <label>Görsel / Video (opsiyonel)</label>
            <input type="file" class="rm_media" accept="image/*,video/*" />
            <div class="rm_mediaInfo hint" style="${mediaInfo ? '' : 'display:none'}">${mediaInfo}</div>
        </div>`;
    card.querySelectorAll('.rm_chips .chip').forEach(ch => ch.onclick = () => {
        const ta = card.querySelector('.rm_template');
        const v = ch.dataset.v;
        const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, pos) + v + ta.value.slice(pos);
        ta.focus();
    });
    card.querySelector('.rm_test').onclick = () => testReminder(card);
    card.querySelector('.rm_preview').onclick = () => previewReminderCard(card);
    // overdueBuyer (geciken/vade) ŞU AN ASKIDA: kart gizli ama DOM'da kalır →
    // collectReminders config'te korur (pasif). Vade düzeltilince bu satır kalkar.
    if (isOverdue) card.style.display = 'none';
    const mc = card.querySelector('.rm_mediaClear');
    if (mc) mc.onclick = async (e) => {
        e.preventDefault();
        await api(`/reminders/${rem.id}/media/clear`, { method: 'POST' });
        const box = card.querySelector('.rm_mediaInfo'); box.style.display = 'none'; box.innerHTML = '';
    };
    return card;
}

function collectReminders() {
    return [...document.querySelectorAll('#rm_cards .rule-card')].map(card => {
        const rem = {
            id: card.dataset.id, type: card.dataset.type,
            name: card.querySelector('.rm_name').value.trim(),
            enabled: card.querySelector('.rm_enabled').checked,
            template: card.querySelector('.rm_template').value,
            intervalDays: Math.max(1, +card.querySelector('.rm_interval').value || 7),
            sendTime: card.querySelector('.rm_time').value || '10:00',
            startDate: card.querySelector('.rm_start').value || null,
            minAmount: Math.max(0, +card.querySelector('.rm_min').value || 0),
            onlySmsGonder: card.querySelector('.rm_onlySms').checked,
            verifyOnWhatsApp: card.querySelector('.rm_verify').checked,
        };
        const vade = card.querySelector('.rm_vade');
        if (vade) rem.vadeGunDefault = Math.max(0, +vade.value || 90);
        return rem;
    });
}

async function saveRemindersConfig() {
    const cfg = { firmaNo: $('rm_firma').value, donemNo: $('rm_donem').value, reminders: collectReminders() };
    await api('/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
    // kart medyalarını yükle
    for (const card of document.querySelectorAll('#rm_cards .rule-card')) {
        const f = card.querySelector('.rm_media').files[0];
        if (f) {
            const fd = new FormData(); fd.append('media', f);
            await fetch(`/api/reminders/${card.dataset.id}/media`, { method: 'POST', body: fd });
            card.querySelector('.rm_media').value = '';
        }
    }
}

async function saveReminders() {
    $('rm_err').textContent = '';
    const cfg = collectReminders();
    const bad = cfg.find(r => r.enabled && !r.template.trim());
    if (bad) { $('rm_err').textContent = `"${bad.name}" etkin ama şablonu boş.`; return; }
    if (!$('rm_firma').value) { $('rm_err').textContent = 'Firma seçin.'; return; }
    $('rm_save').disabled = true;
    try { await saveRemindersConfig(); await loadRemindersConfig(); }
    catch (e) { $('rm_err').textContent = 'Hata: ' + e.message; }
    $('rm_save').disabled = false;
}

async function testReminder(card) {
    $('rm_err').textContent = '';
    if (!confirm('Bu kategoriye uyan TÜM carilere şimdi hatırlatma gönderilecek (zaten yakın zamanda gönderilenler atlanır). Devam edilsin mi?')) return;
    const btn = card.querySelector('.rm_test');
    btn.disabled = true; btn.textContent = 'Gönderiliyor...';
    try {
        await saveRemindersConfig(); // önce kaydet (firma/dönem + şablon güncel)
        const r = await api('/reminders/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: card.dataset.id }) });
        if (!r.success) $('rm_err').textContent = r.message || 'Gönderilemedi.';
        if (r.status) renderRemindersStatus(r.status);
        refreshRemindersLog();
    } catch (e) { $('rm_err').textContent = 'Hata: ' + e.message; }
    btn.disabled = false; btn.textContent = 'Şimdi gönder';
}

// ─── Önizleme (göndermeden: kime ne gidecek) ─────────────────────────────────
let rmPreviewId = null;
async function previewReminderCard(card) {
    $('rm_err').textContent = '';
    const btn = card.querySelector('.rm_preview');
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Hazırlanıyor...';
    try {
        await saveRemindersConfig(); // firma/dönem + güncel şablonla önizle
        const r = await api('/reminders/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: card.dataset.id }) });
        if (!r.success) { $('rm_err').textContent = r.message || 'Önizlenemedi.'; return; }
        rmPreviewId = card.dataset.id;
        renderReminderPreview(r);
        $('rmPreviewModal').classList.remove('hidden');
    } catch (e) { $('rm_err').textContent = 'Hata: ' + e.message; }
    finally { btn.disabled = false; btn.textContent = old; }
}

function renderReminderPreview(r) {
    const rows = r.rows || [];
    const willSend = r.willSend || 0;
    $('rmpvMeta').innerHTML = `Toplam aday: <b>${r.total || 0}</b> &nbsp;•&nbsp; Gönderilecek: <b>${willSend}</b> &nbsp;•&nbsp; Atlanacak: <b>${(r.total || 0) - willSend}</b>${r.donemNo ? ` &nbsp;•&nbsp; Dönem: ${esc(String(r.donemNo))}` : ''} &nbsp;—&nbsp; <span class="muted">hiçbiri henüz GÖNDERİLMEDİ</span>`;
    if (!rows.length) { $('rmpvBody').innerHTML = `<div class="muted" style="padding:12px">${esc(r.note || 'Aday cari yok.')}</div>`; $('rmpvConfirm').disabled = true; return; }
    $('rmpvConfirm').disabled = willSend === 0;
    $('rmpvBody').innerHTML = rows.map(x => {
        const ind = esc(String(x.ind));
        const hasPhone = x.phone && x.valid;
        const phoneLabel = hasPhone
            ? `<span class="muted">${esc(x.phone)}${x.phoneManual ? ' <b>(elle)</b>' : ''}</span>`
            : `<span class="muted" style="color:#d33">telefon yok</span> <button class="btn ghost xs" data-act="edit" data-ind="${ind}" title="Elle telefon ekle">✎ No. ekle</button>`;
        const sendBtn = hasPhone
            ? `<button class="btn ghost xs" data-act="send" data-ind="${ind}" title="Bu cariye şimdi gönder">${x.willSend ? 'Gönder' : 'Yine de gönder'}</button>`
            : '';
        return `
        <div class="logline" data-ind="${ind}" style="display:block; padding:10px 12px; opacity:${(x.willSend || hasPhone) ? '1' : '0.6'}">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                <b>${esc(x.name)}</b>
                ${phoneLabel}
                ${x.bakiyeStr ? `<span><b>${esc(x.bakiyeStr)} TL</b>${x.durum ? ` ${esc(x.durum)}` : ''}</span>` : ''}
                ${x.vade ? `<span class="muted">son ödeme: ${esc(x.vade)}</span>` : ''}
                ${x.gecikmeGun != null ? `<span class="muted">${esc(String(x.gecikmeGun))} gün gecikme</span>` : ''}
                <span class="st ${x.willSend ? 'sent' : 'info'}" style="margin-left:auto">${x.willSend ? 'Gönderilecek' : 'Atlanacak: ' + esc(x.skipReason || '')}</span>
                ${sendBtn}
            </div>
            <div class="rmpv_editor" data-ind="${ind}" style="display:none; margin-top:6px; gap:6px; align-items:center; flex-wrap:wrap">
                <input type="text" class="rmpv_phone" placeholder="05xx xxx xx xx" style="max-width:200px" />
                <button class="btn xs" data-act="save" data-ind="${ind}">Kaydet</button>
                <span class="muted" style="font-size:11px">DB'ye yazılmaz, uygulamada saklanır</span>
            </div>
            <div style="white-space:pre-wrap; font-size:13px; line-height:1.5; margin-top:6px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg3)">${esc(x.message)}</div>
        </div>`;
    }).join('');
}

// Önizlemeyi yeniden çek (elle numara / gönderim sonrası willSend güncellensin).
async function reloadPreview() {
    if (!rmPreviewId) return;
    try { const r = await api('/reminders/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rmPreviewId }) });
        if (r.success) renderReminderPreview(r);
    } catch { /* yok say */ }
}

// Satır içi aksiyonlar: pencil (düzenle) / Kaydet (elle no) / Gönder (tek cari).
$('rmpvBody').onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act, ind = btn.dataset.ind;
    if (act === 'edit') {
        const ed = $('rmpvBody').querySelector(`.rmpv_editor[data-ind="${ind}"]`);
        if (ed) { ed.style.display = ed.style.display === 'none' ? 'flex' : 'none'; const inp = ed.querySelector('.rmpv_phone'); if (inp) inp.focus(); }
        return;
    }
    if (act === 'save') {
        const ed = $('rmpvBody').querySelector(`.rmpv_editor[data-ind="${ind}"]`);
        const phone = ed ? ed.querySelector('.rmpv_phone').value.trim() : '';
        if (!phone) return;
        btn.disabled = true;
        try {
            const r = await api('/reminders/manual-phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ind, phone }) });
            if (!r.success) { alert(r.message || 'Numara kaydedilemedi.'); btn.disabled = false; return; }
            await reloadPreview(); // numara artık görünür + Gönder çıkar
        } catch (err) { alert('Hata: ' + err.message); btn.disabled = false; }
        return;
    }
    if (act === 'send') {
        btn.disabled = true; const old = btn.textContent; btn.textContent = 'Gönderiliyor...';
        try {
            const r = await api('/reminders/send-one', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rmPreviewId, ind }) });
            btn.textContent = r.success ? '✓ Gönderildi' : 'Başarısız';
            if (!r.success) { btn.disabled = false; alert(r.message || 'Gönderilemedi.'); }
            refreshRemindersLog();
        } catch (err) { btn.disabled = false; btn.textContent = old; alert('Hata: ' + err.message); }
        return;
    }
};

$('rmpvClose').onclick = () => { $('rmPreviewModal').classList.add('hidden'); rmPreviewId = null; };
$('rmpvConfirm').onclick = async () => {
    if (!rmPreviewId) return;
    const btn = $('rmpvConfirm'); btn.disabled = true; btn.textContent = 'Gönderiliyor...';
    try {
        const r = await api('/reminders/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rmPreviewId }) });
        if (!r.success) $('rm_err').textContent = r.message || 'Gönderilemedi.';
        if (r.status) renderRemindersStatus(r.status);
        refreshRemindersLog();
    } catch (e) { $('rm_err').textContent = 'Hata: ' + e.message; }
    $('rmPreviewModal').classList.add('hidden'); rmPreviewId = null;
    btn.disabled = false; btn.textContent = 'Onayla ve gönder';
};

function renderRemindersStatus(s) {
    const active = (s.reminders || []).filter(r => r.enabled).length;
    const parts = [];
    if (active) parts.push(`${active} kategori aktif`);
    else parts.push('Hiç kategori aktif değil');
    if (s.lastResult?.note) parts.push(`Son: ${s.lastResult.note}`);
    if (s.lastTickAt) parts.push(`Son denetim: ${new Date(s.lastTickAt).toLocaleTimeString('tr-TR')}`);
    if (s.lastError) parts.push(`⚠ ${s.lastError}`);
    $('rm_status').textContent = parts.join('  •  ') || '—';
    $('rm_info').textContent = active ? `${active} aktif kategori` : '';
}

async function refreshRemindersLog() {
    try {
        const r = await api('/reminders/log');
        if (!r.success) return;
        renderRemindersStatus(r.status);
        const box = $('rm_log');
        if (!r.log.length) { box.innerHTML = '<div class="muted" style="padding:10px">Henüz hatırlatma gönderilmedi.</div>'; return; }
        const labels = { sent: 'Gönderildi', failed: 'Başarısız', noPhone: 'Telefon yok', notOnWhatsApp: 'WA yok', pasif: 'Cari pasif' };
        box.innerHTML = r.log.map(e => {
            const meta = `<span>${esc(e.name || '')} <span class="muted">${esc(e.phone || '')}</span>
                    ${e.reminder ? `<span class="muted">[${esc(e.reminder)}]</span>` : ''}
                    ${e.bakiye ? `<b>${esc(e.bakiye)} TL${e.bakiyeDurum ? ` ${esc(e.bakiyeDurum)}` : ''}</b>` : ''}
                    ${e.gecikmeGun != null ? `<span class="muted">${esc(e.gecikmeGun)} gün gecikme</span>` : ''}
                    ${e.error ? `<span class="muted">— ${esc(e.error)}</span>` : ''}
                    <span class="muted" style="font-size:11px">${e.at ? new Date(e.at).toLocaleTimeString('tr-TR') : ''}</span>
                </span>`;
            const badge = `<span class="st ${e.status === 'sent' ? 'sent' : (e.status === 'failed' ? 'failed' : 'info')}">${labels[e.status] || e.status}</span>`;
            // Gönderilemeyen/atlanan kayıt → OTOMATİK denenmez; elle "Yeniden dene".
            // noPhone ayrıca "No. ekle" (manuel numara) sunar.
            const retryable = ['noPhone', 'failed', 'notOnWhatsApp', 'pasif'];
            if (retryable.includes(e.status) && e.ind != null) {
                const ind = esc(String(e.ind));
                const rid = e.id != null ? esc(String(e.id)) : '';
                const done = rmResentKeys.has(rid + ':' + ind);
                const noPhoneBtn = e.status === 'noPhone' ? `<button class="btn ghost xs" data-act="edit" data-ind="${ind}" title="Elle telefon ekle">✎ No. ekle</button>` : '';
                const retryBtn = rid ? `<button class="btn ghost xs" data-act="send" data-id="${rid}" data-ind="${ind}" title="Şimdi yeniden gönder">Yeniden dene</button>` : '';
                const actions = done
                    ? `<span class="st sent">✓ yeniden gönderildi</span>`
                    : `${noPhoneBtn}${retryBtn}`;
                return `
            <div class="logline" data-ind="${ind}" style="display:block">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline; flex-wrap:wrap">${meta}${badge}</div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:6px">${actions}</div>
                <div class="rmlog_editor" data-ind="${ind}" style="display:none; gap:6px; align-items:center; flex-wrap:wrap; margin-top:6px">
                    <input type="text" class="rmlog_phone" placeholder="05xx xxx xx xx" style="max-width:200px" />
                    <button class="btn xs" data-act="save" data-id="${rid}" data-ind="${ind}">Kaydet</button>
                    <span class="muted" style="font-size:11px">DB'ye yazılmaz, uygulamada saklanır</span>
                </div>
            </div>`;
            }
            return `
            <div class="logline">${meta}${badge}</div>`;
        }).join('');
    } catch { /* yok say */ }
}

// Log satırında elle numara ekle + yeniden dene (Önizle modalıyla aynı akış).
let rmResentKeys = new Set();
$('rm_log').onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act, ind = btn.dataset.ind, id = btn.dataset.id;
    const line = btn.closest('.logline');
    if (act === 'edit') {
        const ed = line && line.querySelector('.rmlog_editor');
        if (ed) { ed.style.display = ed.style.display === 'none' ? 'flex' : 'none'; const inp = ed.querySelector('.rmlog_phone'); if (inp) inp.focus(); }
        return;
    }
    if (act === 'save') {
        const ed = line && line.querySelector('.rmlog_editor');
        const phone = ed ? ed.querySelector('.rmlog_phone').value.trim() : '';
        if (!phone) return;
        btn.disabled = true;
        try {
            const r = await api('/reminders/manual-phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ind, phone }) });
            if (!r.success) { alert(r.message || 'Numara kaydedilemedi.'); btn.disabled = false; return; }
            refreshRemindersLog(); // numara saklandı → "Yeniden dene" ile gönder
        } catch (err) { alert('Hata: ' + err.message); btn.disabled = false; }
        return;
    }
    if (act === 'send') {
        if (!id) { alert('Bu kayıt için hatırlatma kimliği yok; Önizle ekranından gönderin.'); return; }
        btn.disabled = true; const old = btn.textContent; btn.textContent = 'Gönderiliyor...';
        try {
            const r = await api('/reminders/send-one', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ind }) });
            if (r.success) { rmResentKeys.add(id + ':' + ind); refreshRemindersLog(); }
            else { btn.disabled = false; btn.textContent = old; alert(r.message || 'Gönderilemedi.'); }
        } catch (err) { btn.disabled = false; btn.textContent = old; alert('Hata: ' + err.message); }
        return;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
//  Lisans (çevrimdışı — imzalı .lic dosyası + 15 gün deneme)
//  Geçersizken sunucu tüm /api/* uçlarını kapatır; burası kapı ekranı + rozet.
// ═══════════════════════════════════════════════════════════════════════════
const LIC_REASONS = {
    TRIAL_EXPIRED: 'Deneme Süresi Doldu',
    LICENSE_EXPIRED: 'Lisans Süresi Doldu',
    LICENSE_HARDWARE_MISMATCH: 'Lisans Bu Bilgisayara Ait Değil',
    LICENSE_INVALID: 'Geçersiz Lisans',
    LICENSE_WRONG_PRODUCT: 'Yanlış Ürün Lisansı',
    LICENSE_CORRUPT: 'Bozuk Lisans Dosyası',
    LICENSE_NOT_YET_VALID: 'Lisans Henüz Geçerli Değil',
    CLOCK_TAMPERED: 'Sistem Saati Hatalı',
};

// Seçilen .lic dosyasını metne çevir.
function readLicFile(input) {
    const f = input.files && input.files[0];
    if (!f) return Promise.resolve(null);
    return f.text();
}

// Uygulamayı kilitle: tam ekran lisans kapısı.
function showLicenseGate(L) {
    show('licenseScreen');
    if (!L) return;
    $('lg_title').textContent = LIC_REASONS[L.reason] || 'Lisans Gerekli';
    $('lg_msg').textContent = L.detail
        || (L.reason === 'TRIAL_EXPIRED'
            ? `${L.trialDays} günlük ücretsiz deneme sona erdi. Kullanmaya devam etmek için lisansınızı tanımlatın.`
            : 'Devam etmek için lisansınızı tanımlatın.');
    $('lg_hwid').value = L.hardwareId || '';
    // Lisans tanımlandığı an ekranın kendiliğinden açılması için arka plan yoklaması.
    startLicenseGatePolling();
}

// Sidebar rozeti: deneme sayacı / lisans durumu.
function renderLicense(L) {
    if (!L) return;
    const pill = $('licPill');
    if (pill) pill.classList.remove('hidden');

    let label, on;
    if (!L.valid) { label = LIC_REASONS[L.reason] || 'Lisanssız'; on = false; }
    else if (L.trial) { label = `Deneme — ${L.daysLeft} gün`; on = L.daysLeft > 3; }
    else if (L.daysLeft === null) { label = 'Lisanslı (süresiz)'; on = true; }
    else { label = `Lisanslı — ${L.daysLeft} gün`; on = L.daysLeft > 15; }

    $('licLabel').textContent = label;
    $('licDot').className = 'dot ' + (on ? 'on' : 'wait');

    // Lisans modalı (rozete tıklayınca açılır).
    $('lic_machine').value = L.hardwareId || '';
    const bits = [];
    if (L.valid && L.trial) bits.push(`Deneme sürümü — ${L.daysLeft} gün kaldı`);
    else if (L.valid) bits.push(`Lisanslı: ${L.customerName || '—'}`);
    else bits.push(LIC_REASONS[L.reason] || 'Lisanssız');
    if (L.expiresAt) bits.push(`Bitiş: ${new Date(L.expiresAt * 1000).toLocaleDateString('tr-TR')}`);
    else if (L.valid && !L.trial) bits.push('Süresiz');
    if (L.detail) bits.push(L.detail);
    $('lic_state').textContent = bits.join('  ·  ');
}

async function loadLicense() {
    try { const r = await api('/license'); if (r.success) renderLicense(r.license); }
    catch { /* yok say */ }
}

// Lisans dosyasını sunucuya gönder. Geçerliyse uygulamaya gir.
// errEl / btnEl: kapı ekranı ile modal aynı mantığı paylaşır.
async function activateLicense(content, errEl, btnEl) {
    if (!content) { $(errEl).textContent = 'Önce bir .lic dosyası seçin.'; return false; }
    $(errEl).textContent = '';
    $(btnEl).disabled = true;
    try {
        const r = await fetch('/api/license/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        }).then(x => x.json());

        if (!r.success) { $(errEl).textContent = r.message || 'Etkinleştirilemedi.'; return false; }
        renderLicense(r.license);
        return true;
    } catch (e) {
        $(errEl).textContent = 'Hata: ' + e.message;
        return false;
    } finally {
        $(btnEl).disabled = false;
    }
}

async function copyHwid(inputId, btnId) {
    try {
        await navigator.clipboard.writeText($(inputId).value);
        const b = $(btnId), old = b.textContent;
        b.textContent = '✓ Kopyalandı';
        setTimeout(() => { b.textContent = old; }, 1600);
    } catch { /* pano yoksa kullanıcı elle seçer */ }
}

// ─── Kapı ekranı ───
$('lg_copy').onclick = () => copyHwid('lg_hwid', 'lg_copy');
$('lg_activate').onclick = async () => {
    const content = await readLicFile($('lg_file'));
    if (await activateLicense(content, 'lg_err', 'lg_activate')) {
        await boot();   // lisans geldi → normal açılış akışı (kurulum ya da uygulama)
    }
};
$('lg_recheck').onclick = async () => {
    $('lg_err').textContent = '';
    const r = await fetch('/api/license/recheck', { method: 'POST' }).then(x => x.json());
    if (r.license && r.license.valid) await boot();
    else showLicenseGate(r.license);
};

// ─── Uzaktan lisans alma ───
// Tedarikçi panelden lisansı tanımlar; uygulama kendi donanım kimliğiyle çeker.
// Müşteriye dosya göndermeye gerek yok. Ekran açıkken arka planda da yoklanır.
const LG_FETCH_MSG = {
    NOT_FOUND: 'Bu bilgisayara henüz lisans tanımlanmamış. Donanım kimliğini tedarikçinize ilettiyseniz birkaç dakika içinde otomatik gelecektir.',
    NETWORK: 'Lisans sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin ya da lisans dosyanızı elle yükleyin.',
    SAME: 'Sunucudaki lisans zaten kurulu.',
};

async function fetchLicenseFromServer(silent) {
    const btn = $('lg_fetch');
    if (!silent && btn) { btn.disabled = true; btn.textContent = 'Alınıyor...'; }
    try {
        const r = await fetch('/api/license/fetch', { method: 'POST' }).then(x => x.json());
        if (r.success) { await boot(); return true; }
        if (!silent) $('lg_err').textContent = LG_FETCH_MSG[r.reason] || r.message || 'Lisans alınamadı.';
        return false;
    } catch (e) {
        if (!silent) $('lg_err').textContent = 'Lisans alınamadı: ' + e.message;
        return false;
    } finally {
        if (!silent && btn) { btn.disabled = false; btn.textContent = 'Lisansımı Al'; }
    }
}

$('lg_fetch').onclick = () => fetchLicenseFromServer(false);

// Kapı ekranı açıkken sessiz yoklama: lisans tanımlandığı an ekran kendiliğinden
// açılsın, müşteri hiçbir şeye basmasın. Ekran kapanınca zamanlayıcı durur.
let lgPollTimer = null;
function startLicenseGatePolling() {
    if (lgPollTimer) return;
    lgPollTimer = setInterval(async () => {
        const gate = $('licenseScreen');
        if (!gate || gate.classList.contains('hidden')) { clearInterval(lgPollTimer); lgPollTimer = null; return; }
        await fetchLicenseFromServer(true);
    }, 20000);
}

// ─── Modal (uygulama içi lisans bilgisi) ───
$('licBtn').onclick = async () => { await loadLicense(); $('licModal').classList.remove('hidden'); };
$('licPill').onclick = async () => { await loadLicense(); $('licModal').classList.remove('hidden'); };
$('lic_close').onclick = () => $('licModal').classList.add('hidden');
$('lic_copy').onclick = () => copyHwid('lic_machine', 'lic_copy');
$('lic_activate').onclick = async () => {
    const content = await readLicFile($('lic_file'));
    if (await activateLicense(content, 'lic_err', 'lic_activate')) {
        $('lic_err').textContent = '';
        $('lic_hint').textContent = '✓ Lisans etkinleştirildi.';
    }
};
$('lic_recheck').onclick = async () => {
    $('lic_err').textContent = '';
    const r = await fetch('/api/license/recheck', { method: 'POST' }).then(x => x.json());
    if (r.license && !r.license.valid) showLicenseGate(r.license);
    else renderLicense(r.license);
};

// ─── Gece / gündüz modu ───
function applyTheme(t) {
    const dark = t === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    const b = $('themeBtn');
    if (b) b.textContent = dark ? '☀️' : '🌙';
}
(function initTheme() {
    let t = 'light';
    try { t = localStorage.getItem('vega.theme') || 'light'; } catch { /* yok say */ }
    applyTheme(t);
    const b = $('themeBtn');
    if (b) b.onclick = () => {
        const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        try { localStorage.setItem('vega.theme', next); } catch { /* yok say */ }
        applyTheme(next);
    };
})();

// ─── Üst başlık: aktif sekme adını yansıt (mevcut .tab onclick'i EZME — ek dinleyici) ───
document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
        if (t.dataset.view === 'viewExtre' || t.dataset.view === 'viewAiBot') return; // kilit sonrası ana handler ayarlar
        const el = $('appbarTitle');
        if (el) el.textContent = t.dataset.title || t.textContent.trim();
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Hesap Extresi (manuel, tek tek PDF gönderim)
// ═══════════════════════════════════════════════════════════════════════════
let exLoaded = false;
let exRows = [];
let exPv = null; // önizlemedeki cari (satır objesi)

const exFmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const exDate = (d) => { if (!d) return ''; const x = new Date(d); return isNaN(x.getTime()) ? String(d) : x.toLocaleDateString('tr-TR'); };

async function initExtreView() {
    if (!exLoaded) {
        const fr = await api('/firmalar');
        const sel = $('ex_firma');
        sel.innerHTML = '';
        if (fr.success) fr.data.forEach(f => {
            const o = document.createElement('option');
            o.value = f.FIRMANO; o.textContent = `${f.FIRMANO} — ${f.FIRMAADI}`;
            sel.appendChild(o);
        });
        sel.onchange = () => loadExtreDonemler();
        $('ex_load').onclick = loadExtreList;
        $('ex_search').onkeydown = (e) => { if (e.key === 'Enter') loadExtreList(); };
        $('exPvClose').onclick = () => $('exPreviewModal').classList.add('hidden');
        $('exPvSend').onclick = sendExtreFromPreview;
        exLoaded = true;
    }
    const ctx = localContext();
    if (state.firmaNo) $('ex_firma').value = state.firmaNo;
    else if (ctx.firmaNo) $('ex_firma').value = ctx.firmaNo;
    await loadExtreDonemler(state.donemNo || ctx.donemNo);
    exStatus();
}

async function loadExtreDonemler(selectDonem) {
    const firmaNo = $('ex_firma').value;
    const sel = $('ex_donem');
    sel.innerHTML = '<option>...</option>';
    const r = await api(`/donemler?firmaNo=${firmaNo}`);
    sel.innerHTML = '';
    if (r.success && r.data.length) {
        r.data.forEach(d => {
            const o = document.createElement('option');
            o.value = d.donemNo;
            o.textContent = d.donem ? `${d.donemNo} — ${d.donem}` : d.donemNo;
            sel.appendChild(o);
        });
        sel.value = selectDonem || r.data[r.data.length - 1].donemNo;
    } else {
        sel.innerHTML = '<option value="">dönem yok</option>';
    }
}

function exStatus(msg) {
    const el = $('ex_status'); if (!el) return;
    el.textContent = msg || (state.waReady ? 'Hazır.' : 'WhatsApp bağlı değil — gönderim için QR okutun.');
}

async function loadExtreList() {
    const firmaNo = $('ex_firma').value, donemNo = $('ex_donem').value;
    $('ex_err').textContent = '';
    if (!firmaNo || !donemNo) { $('ex_err').textContent = 'Firma ve dönem seçin.'; return; }
    const body = $('ex_body');
    body.innerHTML = `<tr><td colspan="5" class="muted" style="padding:18px">Yükleniyor...</td></tr>`;
    const search = $('ex_search').value.trim();
    const r = await api(`/extre/list?firmaNo=${firmaNo}&donemNo=${donemNo}${search ? `&search=${encodeURIComponent(search)}` : ''}`);
    if (!r.success) { body.innerHTML = ''; $('ex_err').textContent = r.message || 'Listelenemedi.'; return; }
    exRows = r.data || [];
    renderExtreList();
}

function renderExtreList() {
    const body = $('ex_body');
    if (!exRows.length) { body.innerHTML = `<tr><td colspan="5" class="muted" style="padding:18px">Bakiyesi olan cari bulunamadı.</td></tr>`; $('ex_info').textContent = ''; return; }
    body.innerHTML = '';
    for (const row of exRows) {
        const tr = document.createElement('tr');
        const bal = `<span class="bakiye ${row.bakiye > 0 ? 'borc' : (row.bakiye < 0 ? 'alacak' : '')}">${exFmt(row.bakiye)} ₺</span>`;
        tr.innerHTML = `
            <td>${esc(row.name)}${row.smsGonder ? ' <span class="smsbadge">SMS</span>' : ''}</td>
            <td class="muted">${esc(row.kod)}</td>
            <td>${row.phone ? `${esc(row.phone)}${row.valid ? '' : ' <span class="nophone">?</span>'}` : '<span class="nophone">telefon yok</span>'}</td>
            <td class="c">${bal}</td>
            <td class="c"></td>
        `;
        const cell = tr.lastElementChild;
        cell.style.whiteSpace = 'nowrap';
        const pv = document.createElement('button');
        pv.className = 'btn ghost xs';
        pv.textContent = 'Önizle';
        pv.title = 'Ekstreyi göndermeden gör';
        pv.onclick = () => openExtrePreview(row);
        const btn = document.createElement('button');
        btn.className = 'btn green xs';
        btn.style.marginLeft = '6px';
        btn.textContent = 'Extre Gönder';
        btn.disabled = !row.phone || !row.valid;
        btn.title = btn.disabled ? 'Geçerli telefon yok' : 'PDF ekstreyi gönder';
        btn.onclick = () => sendExtreRow(row, btn);
        cell.appendChild(pv);
        cell.appendChild(btn);
        body.appendChild(tr);
    }
    $('ex_info').textContent = `${exRows.length} cari listelendi`;
}

// Önizleme = gönderilecek PDF'in birebir kendisi (iframe'de Chromium PDF görüntüleyici).
function openExtrePreview(row) {
    exPv = row;
    const firmaNo = $('ex_firma').value, donemNo = $('ex_donem').value;
    $('exPvErr').textContent = '';
    $('exPvMeta').innerHTML = `<b>${esc(row.name)}</b> · Kod: ${esc(row.kod)} · Tel: ${esc(row.phone || '—')} · Bakiye: <b>${exFmt(row.bakiye)} ₺</b> (${esc(row.durum)})`;
    const src = `/api/extre/pdf?firmaNo=${firmaNo}&donemNo=${donemNo}&ind=${row.ind}&t=${Date.now()}`;
    $('exPvBody').innerHTML = `<iframe title="Ekstre PDF" src="${src}" style="width:100%; height:62vh; border:1px solid var(--border); border-radius:8px; background:#fff"></iframe>`;
    $('exPreviewModal').classList.remove('hidden');
}

async function doExtreSend(ind) {
    const firmaNo = $('ex_firma').value, donemNo = $('ex_donem').value;
    return api('/extre/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaNo, donemNo, ind }) });
}

// Satırdaki "Extre Gönder" — önizleme olmadan doğrudan gönder (confirm ile).
async function sendExtreRow(row, btn) {
    if (!row.phone || !row.valid) return;
    if (!confirm(`${row.name} carisine PDF hesap ekstresi gönderilsin mi?`)) return;
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Gönderiliyor...';
    try {
        const r = await doExtreSend(row.ind);
        exLog(r.success ? `✓ ${row.name} (${row.phone}) — ekstre gönderildi` : `✗ ${row.name} — ${r.message || 'hata'}`);
    } catch (e) {
        exLog(`✗ ${row.name} — ${e.message}`);
    }
    btn.disabled = false; btn.textContent = old;
}

// Önizleme modalındaki "Extreyi Gönder".
async function sendExtreFromPreview() {
    if (!exPv) return;
    const btn = $('exPvSend');
    $('exPvErr').textContent = '';
    btn.disabled = true; btn.textContent = 'Gönderiliyor...';
    try {
        const r = await doExtreSend(exPv.ind);
        if (r.success) {
            exLog(`✓ ${exPv.name} (${exPv.phone}) — ekstre gönderildi`);
            $('exPreviewModal').classList.add('hidden');
        } else {
            $('exPvErr').textContent = r.message || 'Gönderilemedi.';
            exLog(`✗ ${exPv.name} — ${r.message || 'hata'}`);
        }
    } catch (e) {
        $('exPvErr').textContent = 'Hata: ' + e.message;
    }
    btn.disabled = false; btn.textContent = 'Extreyi Gönder';
}

function exLog(line) {
    const box = $('ex_log'); if (!box) return;
    const div = document.createElement('div');
    div.style.cssText = 'padding:6px 8px; border-bottom:1px solid var(--border); font-size:13px';
    div.textContent = `${new Date().toLocaleTimeString('tr-TR')}  ${line}`;
    box.prepend(div);
}

// ═══════════════════════════════════════════════════════════════════════════
//  AI Oto-Yanıt Botu
// ═══════════════════════════════════════════════════════════════════════════
let abLoaded = false;
let abLogTimer = null;

async function initAiBotView() {
    if (!abLoaded) {
        const fr = await api('/firmalar');
        const sel = $('ab_firma');
        sel.innerHTML = '';
        if (fr.success) fr.data.forEach(f => {
            const o = document.createElement('option');
            o.value = f.FIRMANO; o.textContent = `${f.FIRMANO} — ${f.FIRMAADI}`;
            sel.appendChild(o);
        });
        sel.onchange = () => loadAbDonemler();
        $('ab_save').onclick = saveAiBot;
        $('ab_test').onclick = testAiBotKey;
        $('ab_provider').onchange = () => abApplyProvider(true);
        $('ab_kontorRefresh').onclick = () => abRefreshKontor(true);
        abLoaded = true;
    }
    await loadAiBotConfig();
    abRefreshLog();
    if (abLogTimer) clearInterval(abLogTimer);
    abLogTimer = setInterval(() => { if ($('viewAiBot').style.display !== 'none') abRefreshLog(); else { clearInterval(abLogTimer); abLogTimer = null; } }, 5000);
}

async function loadAbDonemler(selectDonem) {
    const firmaNo = $('ab_firma').value;
    const sel = $('ab_donem');
    sel.innerHTML = '<option>...</option>';
    const r = await api(`/donemler?firmaNo=${firmaNo}`);
    sel.innerHTML = '';
    if (r.success && r.data.length) {
        r.data.forEach(d => {
            const o = document.createElement('option');
            o.value = d.donemNo;
            o.textContent = d.donem ? `${d.donemNo} — ${d.donem}` : d.donemNo;
            sel.appendChild(o);
        });
        sel.value = selectDonem || r.data[r.data.length - 1].donemNo;
    } else {
        sel.innerHTML = '<option value="">dönem yok</option>';
    }
}

// Sağlayıcı meta: varsayılan model, anahtar placeholder, "anahtar al" linki.
// vega = kontörlü: anahtar yok, ücret gönderilen mesaj başına kontör.
const AB_PROVIDERS = {
    vega:      { model: 'claude-haiku-4-5', metered: true },
    anthropic: { model: 'claude-haiku-4-5', keyPh: 'sk-ant-...', link: 'https://console.anthropic.com/settings/keys', linkT: 'console.anthropic.com' },
    openai:    { model: 'gpt-4o-mini',      keyPh: 'sk-...',     link: 'https://platform.openai.com/api-keys',       linkT: 'platform.openai.com' },
    gemini:    { model: 'gemini-2.0-flash', keyPh: 'AIza...',    link: 'https://aistudio.google.com/app/apikey',      linkT: 'aistudio.google.com' },
};

// Sağlayıcı değişince placeholder/link + kontör paneli görünürlüğü güncellenir.
// resetModel=true → model kutusunu varsayılana çek.
function abApplyProvider(resetModel) {
    const p = AB_PROVIDERS[$('ab_provider').value] || AB_PROVIDERS.vega;
    $('ab_model').placeholder = p.model;
    // Kontörlü modda anahtar alanı anlamsız → gizle, yerine açıklama göster.
    $('ab_keyBox').style.display = p.metered ? 'none' : '';
    $('ab_meteredNote').style.display = p.metered ? '' : 'none';
    $('ab_kontorCard').style.display = p.metered ? '' : 'none';
    $('ab_test').textContent = p.metered ? 'Kontör Sunucusunu Sına' : 'Anahtarı Sına';
    if (!p.metered) {
        $('ab_apiKey').placeholder = p.keyPh + ' (değişmeyecekse boş bırak)';
        const link = $('ab_keyLink');
        if (link) { link.href = p.link; link.textContent = p.linkT + ' → anahtar al'; }
    }
    if (resetModel) $('ab_model').value = p.model;
    if (p.metered) abRefreshKontor();
}

// ─── Kontör paneli ──────────────────────────────────────────────────────────
// Bakiye kontör sunucusundadır; burada yalnız gösterilir. Yükleme uzaktan yapılır.
async function abRefreshKontor(force) {
    const card = $('ab_kontorCard');
    if (!card || card.style.display === 'none') return;
    const r = await api(force === true ? '/credits/refresh' : '/credits', force === true ? { method: 'POST' } : {});
    const c = r && r.credits;
    if (!c) return;
    abPaintKontor(c);
}

function abPaintKontor(c) {
    const bal = $('ab_kontorBalance');
    if (!bal) return;
    bal.textContent = (c.balance != null && c.known) ? c.balance : '—';
    bal.style.color = c.low ? 'var(--danger, #dc2626)' : '';

    const parts = [];
    if (c.sentToday != null) parts.push(`bugün ${c.sentToday} mesaj`);
    if (c.dailyCap) parts.push(`günlük çağrı ${c.callsToday ?? 0}/${c.dailyCap}`);
    if (c.lastSync) parts.push('son kontrol ' + new Date(c.lastSync).toLocaleTimeString('tr-TR'));
    $('ab_kontorInfo').textContent = parts.join(' · ') || '—';
    $('ab_kontorHw').textContent = c.hardwareId ? 'Kimlik: ' + c.hardwareId : '';

    const warn = $('ab_kontorWarnBox');
    let msg = '';
    if (!c.hasIdentity) msg = 'Kontörlü AI için lisans gerekli — deneme sürümünde kapalıdır.';
    else if (c.blocked) msg = 'Kontör hesabınız kapalı. Tedarikçinizle görüşün.';
    else if (c.lastError) msg = c.lastError;
    else if (c.known && c.balance <= 0) msg = 'Kontör bitti — bot cevap veremez. Kontör yüklenmesi için tedarikçinizle görüşün.';
    else if (c.low) msg = `Kontör azaldı (${c.balance}). Tedarikçinizden yükleme isteyin.`;
    warn.textContent = msg;
    warn.style.display = msg ? '' : 'none';
}

async function loadAiBotConfig() {
    const r = await api('/aibot');
    if (!r.success) return;
    const c = r.config;
    $('ab_enabled').checked = !!c.enabled;
    $('ab_chatMode').checked = c.chatMode !== false;
    $('ab_provider').value = c.provider || 'vega';
    $('ab_model').value = c.model || '';
    $('ab_baseUrl').value = c.baseUrl || '';
    $('ab_history').value = c.historyTurns ?? 10;
    $('ab_maxTokens').value = c.maxReplyTokens ?? 800;
    abApplyProvider(false);
    // Kontör ayarları ayrı uçtan gelir (bakiye sunucuda tutulur).
    const kr = await api('/credits');
    if (kr && kr.credits) {
        $('ab_kontorUrl').value = kr.credits.endpointCustom ? kr.credits.endpoint : '';
        $('ab_kontorUrl').placeholder = kr.credits.endpoint || 'https://vega-kontor.workers.dev';
        $('ab_kontorWarn').value = kr.credits.lowWarn ?? 50;
        abPaintKontor(kr.credits);
    }
    $('ab_apiKey').value = '';
    $('ab_keyState').textContent = c.hasApiKey ? '(kayıtlı ✓)' : '(girilmedi)';
    const ctx = (typeof localContext === 'function') ? localContext() : {};
    const firma = c.firmaNo || state.firmaNo || ctx.firmaNo;
    if (firma) $('ab_firma').value = firma;
    await loadAbDonemler(c.donemNo || state.donemNo || ctx.donemNo);
    $('ab_businessName').value = c.businessName || '';
    $('ab_paymentInfo').value = c.paymentInfo || '';
    $('ab_extra').value = c.extraInstructions || '';
    $('ab_startHour').value = c.startHour ?? 9;
    $('ab_endHour').value = c.endHour ?? 21;
    $('ab_dailyCap').value = c.dailyCap ?? 100;
    $('ab_minGap').value = c.minGapSec ?? 30;
    $('ab_onlySms').checked = !!c.onlySmsGonder;
    $('ab_movements').checked = c.includeMovements !== false;
    $('ab_maxThread').value = c.maxThreadReplies ?? 4;
    $('ab_closeCooldown').value = c.closeCooldownHours ?? 6;
    $('ab_closingMsg').value = c.closingMessage || '';
    abStatus(r.status);
}

async function saveAiBot() {
    $('ab_err').textContent = '';
    const patch = {
        enabled: $('ab_enabled').checked,
        chatMode: $('ab_chatMode').checked,
        provider: $('ab_provider').value,
        model: $('ab_model').value.trim(),
        baseUrl: $('ab_baseUrl').value.trim(),
        historyTurns: Number($('ab_history').value) || 0,
        maxReplyTokens: Number($('ab_maxTokens').value) || 800,
        firmaNo: $('ab_firma').value || null,
        donemNo: $('ab_donem').value || null,
        businessName: $('ab_businessName').value.trim(),
        paymentInfo: $('ab_paymentInfo').value.trim(),
        extraInstructions: $('ab_extra').value.trim(),
        startHour: Number($('ab_startHour').value) || 0,
        endHour: Number($('ab_endHour').value) || 0,
        dailyCap: Number($('ab_dailyCap').value) || 0,
        minGapSec: Number($('ab_minGap').value) || 0,
        onlySmsGonder: $('ab_onlySms').checked,
        includeMovements: $('ab_movements').checked,
        maxThreadReplies: Number($('ab_maxThread').value) || 0,
        closeCooldownHours: Number($('ab_closeCooldown').value) || 0,
        closingMessage: $('ab_closingMsg').value.trim(),
    };
    const key = $('ab_apiKey').value.trim();
    if (key) patch.apiKey = key;

    // Kontör ayarları ayrı uçta (bakiye sunucuda; burada yalnız adres/uyarı eşiği).
    const kr = await api('/credits/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            endpoint: $('ab_kontorUrl').value.trim(),
            lowWarn: Number($('ab_kontorWarn').value) || 0,
            // Model yalnız kontörlü modda kontör sunucusuna geçer; BYOK modelini
            // oraya yazmak sunucudaki izinli model listesini bozar.
            ...($('ab_provider').value === 'vega' ? { model: $('ab_model').value.trim() || undefined } : {}),
        }),
    });
    if (kr && kr.credits) abPaintKontor(kr.credits);

    const r = await api('/aibot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (r.success) {
        $('ab_apiKey').value = '';
        $('ab_keyState').textContent = r.config.hasApiKey ? '(kayıtlı ✓)' : '(girilmedi)';
        abStatus(r.status);
        const btn = $('ab_save'); const old = btn.textContent;
        btn.textContent = 'Kaydedildi ✓'; setTimeout(() => btn.textContent = old, 1500);
    } else {
        $('ab_err').textContent = r.message || 'Kaydedilemedi.';
    }
}

async function testAiBotKey() {
    const el = $('ab_testResult');
    el.style.display = ''; el.textContent = 'Sınanıyor...';
    const key = $('ab_apiKey').value.trim();
    // Kaydetmeden sınamada da seçili sağlayıcı/model/uç kullanılsın.
    const body = { provider: $('ab_provider').value, model: $('ab_model').value.trim(), baseUrl: $('ab_baseUrl').value.trim() };
    if (key) body.apiKey = key;
    const r = await api('/aibot/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    el.textContent = r.success ? `Anahtar geçerli ✓ (${r.sample || 'yanıt alındı'})` : `Hata: ${r.message || 'geçersiz'}`;
    el.style.color = r.success ? 'var(--green, #16a34a)' : 'var(--danger, #dc2626)';
}

function abStatus(st) {
    if (!st) return;
    const on = st.enabled ? 'AÇIK' : 'kapalı';
    const prov = st.metered ? ' · kontörlü' : (st.provider ? ` · ${st.provider}` : '');
    const key = st.metered
        ? (st.credits && st.credits.known ? `${st.credits.balance} kontör` : 'kontör okunamadı')
        : (st.hasApiKey ? 'anahtar var' : 'anahtar YOK');
    const mode = st.chatMode ? 'sohbet modu' : 'dar kapsam';
    $('ab_status').textContent = `Bot: ${on}${prov} · ${key} · ${mode} · bugün ${st.sentToday}/${st.dailyCap} cevap · saat ${st.startHour}:00–${st.endHour}:00`;
    // Kontör bakiyesi durum akışıyla birlikte tazelenir (uzaktan yükleme görünür olsun).
    if (st.metered && st.credits) abPaintKontor(st.credits);
}

const AB_KIND = {
    reply: { t: 'Cevap', c: 'var(--green, #16a34a)' },
    silent: { t: 'Sessiz', c: '#64748b' },
    skip: { t: 'Atlandı', c: '#b45309' },
    error: { t: 'Hata', c: 'var(--danger, #dc2626)' },
};

async function abRefreshLog() {
    const r = await api('/aibot/log');
    if (!r.success) return;
    abStatus(r.status);
    const box = $('ab_log'); if (!box) return;
    if (!r.log.length) { box.innerHTML = '<div class="muted" style="padding:12px">Henüz gelen mesaj yok.</div>'; return; }
    box.innerHTML = r.log.map(e => {
        const k = AB_KIND[e.kind] || { t: e.kind, c: '#64748b' };
        const time = new Date(e.at).toLocaleTimeString('tr-TR');
        const who = esc(e.name || e.phone || '');
        const detail = e.kind === 'reply'
            ? `<div style="font-size:12px;color:#64748b">↩ ${esc(e.incoming || '')}</div><div style="font-size:13px;margin-top:2px">${esc(e.reply || '')}</div>`
            : e.kind === 'silent'
                ? `<div style="font-size:12px;color:#64748b">↩ ${esc(e.incoming || '')}</div>`
                : `<div style="font-size:12px;color:#64748b">${esc(e.reason || '')}</div>`;
        // Kontörlü modda düşen kontör + kalan bakiye rozeti.
        const credit = (e.credit != null)
            ? ` <span class="muted" style="font-size:11px">· −${e.credit} kontör${e.balance != null ? ` (kalan ${e.balance})` : ''}</span>`
            : '';
        return `<div style="padding:8px; border-bottom:1px solid var(--border)">
            <div style="font-size:13px"><b style="color:${k.c}">${k.t}</b> · ${who} <span class="muted" style="font-size:11px">${time}</span>${credit}</div>
            ${detail}
        </div>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  Firma Bilgileri (ekstre/belge başlığı + logo)
// ═══════════════════════════════════════════════════════════════════════════
let fiLoaded = false;

async function initFirmaView() {
    if (!fiLoaded) {
        const fr = await api('/firmalar');
        const sel = $('fi_firma');
        sel.innerHTML = '';
        if (fr.success) fr.data.forEach(f => {
            const o = document.createElement('option');
            o.value = f.FIRMANO; o.textContent = `${f.FIRMANO} — ${f.FIRMAADI}`;
            sel.appendChild(o);
        });
        sel.onchange = () => loadFirmaInfo();
        $('fi_save').onclick = saveFirmaInfo;
        $('fi_logoPick').onclick = () => $('fi_logoFile').click();
        $('fi_logoFile').onchange = uploadFirmaLogo;
        $('fi_logoClear').onclick = clearFirmaLogo;
        $('fi_logoUrlBtn').onclick = fetchFirmaLogoUrl;
        fiLoaded = true;
    }
    const ctx = (typeof localContext === 'function') ? localContext() : {};
    const firma = state.firmaNo || ctx.firmaNo;
    if (firma) $('fi_firma').value = firma;
    await loadFirmaInfo();
}

async function loadFirmaInfo() {
    const firmaNo = $('fi_firma').value;
    if (!firmaNo) return;
    const r = await api(`/firma/info?firmaNo=${firmaNo}`);
    if (!r.success) return;
    const i = r.info || {};
    $('fi_name').value = i.name || '';
    $('fi_phone').value = i.phone || '';
    $('fi_email').value = i.email || '';
    $('fi_web').value = i.web || '';
    $('fi_address').value = i.address || '';
    $('fi_taxOffice').value = i.taxOffice || '';
    $('fi_taxNo').value = i.taxNo || '';
    $('fi_iban').value = i.iban || '';
    $('fi_legal').value = i.legalTerms || '';
    renderFirmaLogo(r.hasLogo, firmaNo);
}

function renderFirmaLogo(hasLogo, firmaNo) {
    const box = $('fi_logoBox');
    if (hasLogo) {
        box.innerHTML = `<img src="/api/firma/logo?firmaNo=${firmaNo}&t=${Date.now()}" style="max-width:100%; max-height:100%; object-fit:contain" />`;
    } else {
        box.innerHTML = '<span class="muted" style="font-size:12px">logo yok</span>';
    }
}

async function saveFirmaInfo() {
    $('fi_err').textContent = '';
    const body = {
        firmaNo: $('fi_firma').value,
        name: $('fi_name').value.trim(),
        phone: $('fi_phone').value.trim(),
        email: $('fi_email').value.trim(),
        web: $('fi_web').value.trim(),
        address: $('fi_address').value.trim(),
        taxOffice: $('fi_taxOffice').value.trim(),
        taxNo: $('fi_taxNo').value.trim(),
        iban: $('fi_iban').value.trim(),
        legalTerms: $('fi_legal').value.trim(),
    };
    const r = await api('/firma/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.success) {
        const btn = $('fi_save'); const old = btn.textContent;
        btn.textContent = 'Kaydedildi ✓'; setTimeout(() => btn.textContent = old, 1500);
    } else {
        $('fi_err').textContent = r.message || 'Kaydedilemedi.';
    }
}

async function uploadFirmaLogo(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('firmaNo', $('fi_firma').value);
    fd.append('logo', file);
    const r = await fetch('/api/firma/logo', { method: 'POST', body: fd }).then(x => x.json()).catch(() => ({ success: false }));
    firmaLogoMsg(r.success ? 'Logo yüklendi ✓' : (r.message || 'Yüklenemedi'), r.success);
    if (r.success) renderFirmaLogo(true, $('fi_firma').value);
    e.target.value = '';
}

async function fetchFirmaLogoUrl() {
    const url = $('fi_logoUrl').value.trim();
    if (!url) return;
    const r = await api('/firma/logo/url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaNo: $('fi_firma').value, url }) });
    firmaLogoMsg(r.success ? 'Logo getirildi ✓' : (r.message || 'Getirilemedi'), r.success);
    if (r.success) { $('fi_logoUrl').value = ''; renderFirmaLogo(true, $('fi_firma').value); }
}

async function clearFirmaLogo() {
    const r = await api('/firma/logo/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firmaNo: $('fi_firma').value }) });
    if (r.success) renderFirmaLogo(false, $('fi_firma').value);
}

function firmaLogoMsg(msg, ok) {
    const el = $('fi_logoMsg');
    el.style.display = ''; el.textContent = msg;
    el.style.color = ok ? 'var(--green, #16a34a)' : 'var(--danger, #dc2626)';
}

// ─── yardımcı ───
function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

boot();
