// ─── Vega Toplu WhatsApp — Frontend ─────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const api = (path, opts) => fetch('/api' + path, opts).then(r => r.json());

// Electron masaüstü köprüsü (varsa). PIN'i DPAPI ile saklayıp PC açılışında
// otomatik bağlanmayı sağlar; tarayıcıda çalışınca yok sayılır.
const desktop = window.vegaDesktop;
async function rememberPin(pin) { if (desktop?.isElectron) { try { await desktop.savePin(pin); } catch { /* yok say */ } } }
async function forgetPin() { if (desktop?.isElectron) { try { await desktop.clearPin(); } catch { /* yok say */ } } }

const state = {
    firmaNo: null,
    rows: [],                 // ekranda görünen cariler
    selected: new Map(),      // ind -> {name, unvan, kod, phone, phones}
    cariLoadedAt: 0,          // cari kart bilgisi en son ne zaman çekildi (günlük tazeleme)
    waReady: false,
    waPollTimer: null,
    currentJob: null,
    sse: null,
};

// ═══════════════════════════════════════════════════════════════════════════
//  Açılış akışı
// ═══════════════════════════════════════════════════════════════════════════
async function boot() {
    const r = await api('/check-setup');
    if (!r.isSetup) {
        show('setupScreen');
        return;
    }
    // Electron oto-bağlantı: sunucu kayıtlı PIN ile zaten giriş yaptıysa PIN sorma.
    try {
        const st = await api('/status');
        if (st.dbConnected) { await enterApp(); return; }
    } catch { /* yok say */ }
    show('pinScreen');
    $('pin_input').focus();
}

function show(screen) {
    ['setupScreen', 'pinScreen', 'app'].forEach(s => $(s).classList.add('hidden'));
    $(screen).classList.remove('hidden');
}

// ─── Kurulum ───
$('su_btn').onclick = async () => {
    $('su_err').textContent = '';
    const body = {
        server: $('su_server').value.trim(),
        port: $('su_port').value.trim(),
        database: $('su_db').value.trim(),
        username: $('su_user').value.trim(),
        password: $('su_pass').value,
        pin: $('su_pin').value.trim(),
    };
    $('su_btn').disabled = true;
    $('su_btn').textContent = 'Bağlanıyor...';
    try {
        const r = await api('/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.success) { await rememberPin(body.pin); await enterApp(); }
        else $('su_err').textContent = r.message;
    } catch (e) { $('su_err').textContent = 'Hata: ' + e.message; }
    $('su_btn').disabled = false;
    $('su_btn').textContent = 'Bağlan ve Kaydet';
};

// ─── PIN giriş ───
$('pin_input').oninput = async (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = v;
    if (v.length === 6) {
        $('pin_err').textContent = '';
        const r = await api('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: v }) });
        if (r.success) { await rememberPin(v); await enterApp(); }
        else { $('pin_err').textContent = r.message; e.target.value = ''; }
    }
};
$('pin_reset').onclick = async () => {
    if (!confirm('Veritabanı ayarları silinecek. Emin misiniz?')) return;
    await api('/reset', { method: 'POST' });
    await forgetPin();
    show('setupScreen');
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
    if (r.data.length) {
        state.firmaNo = r.data[0].FIRMANO;
        await loadCari();
    }
}

$('firmaSel').onchange = async () => { state.firmaNo = $('firmaSel').value; await loadCari(); };
$('searchBtn').onclick = loadCari;
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadCari(); });
$('onlyPhone').onchange = loadCari;

async function loadCari() {
    if (!state.firmaNo) return;
    $('cariBody').innerHTML = `<tr><td colspan="4" class="muted" style="padding:18px">Yükleniyor...</td></tr>`;
    const search = encodeURIComponent($('searchInput').value.trim());
    const onlyPhone = $('onlyPhone').checked ? '1' : '0';
    const r = await api(`/cari?firmaNo=${state.firmaNo}&search=${search}&onlyWithPhone=${onlyPhone}&pageSize=1000`);
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
            <td>${esc(row.unvan)}</td>
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
const selObj = (row) => ({ ind: row.ind, name: row.unvan, unvan: row.unvan, kod: row.kod, phone: row.phone, phones: row.phones || [] });

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
        if (r.ready) { dot.className = 'dot on'; label.textContent = 'WhatsApp bağlı'; }
        else if (r.hasQr) { dot.className = 'dot wait'; label.textContent = 'QR bekliyor'; }
        else { dot.className = 'dot wait'; label.textContent = 'Bağlanıyor...'; }

        // QR modal açıksa içeriği güncelle
        if (!$('waModal').classList.contains('hidden')) renderWaModal(r);
    } catch { /* yok say */ }
}

function renderWaModal(r) {
    const c = $('waContent');
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
$('logoutBtn').onclick = async () => { await api('/reset', { method: 'POST' }); await forgetPin(); location.reload(); };

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
    const div = document.createElement('div');
    div.className = 'logline';
    div.innerHTML = `<span>${esc(name || '')} <span class="muted">${esc(phone || '')}</span>${error ? ` <span class="muted">— ${esc(error)}</span>` : ''}</span><span class="st ${status}">${labels[status] || status}</span>`;
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
//  Sekmeler + Otomatik Tahsilat (watcher)
// ═══════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        $('viewBulk').style.display = t.dataset.view === 'viewBulk' ? '' : 'none';
        $('viewWatcher').style.display = t.dataset.view === 'viewWatcher' ? '' : 'none';
        if (t.dataset.view === 'viewWatcher') initWatcherView();
    };
});

document.querySelectorAll('[data-wcvar]').forEach(c => {
    c.onclick = () => {
        const ta = $('wc_template');
        const v = c.dataset.wcvar;
        const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, pos) + v + ta.value.slice(pos);
        ta.focus();
    };
});

let wcLoaded = false;
let wcLogTimer = null;

async function initWatcherView() {
    if (!wcLoaded) {
        // Firma listesini doldur (ana firmaSel ile aynı kaynak)
        const fr = await api('/firmalar');
        const sel = $('wc_firma');
        sel.innerHTML = '';
        if (fr.success) fr.data.forEach(f => {
            const o = document.createElement('option');
            o.value = f.FIRMANO; o.textContent = `${f.FIRMANO} — ${f.FIRMAADI}`;
            sel.appendChild(o);
        });
        // () sarmalayıcı şart: doğrudan atanırsa event objesi selectDonem sanılır.
        sel.onchange = () => loadWatcherDonemler();
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
        // en güncel dönem (en yüksek donemNo) varsayılan
        const target = selectDonem || r.data[r.data.length - 1].donemNo;
        sel.value = target;
    } else {
        sel.innerHTML = '<option value="">dönem yok</option>';
    }
}

async function loadWatcherConfig() {
    const r = await api('/watcher');
    if (!r.success) return;
    const s = r.status;
    if (s.firmaNo) $('wc_firma').value = s.firmaNo;
    await loadWatcherDonemler(s.donemNo);
    $('wc_template').value = s.template || '';
    $('wc_interval').value = s.intervalSec || 30;
    $('wc_min').value = s.minAmount || 0;
    applyIzahatCodesToUI(s.izahatCodes || []);
    $('wc_verify').checked = s.verifyOnWhatsApp !== false;
    $('wc_typing').checked = s.simulateTyping !== false;
    $('wc_allPhones').checked = s.sendAllPhones === true;
    renderWatcherMedia(s.media);
    renderWatcherState(s);
}

function renderWatcherMedia(media) {
    const info = $('wc_mediaInfo');
    if (media && media.name) {
        $('wc_mediaName').textContent = media.name + (media.kind ? ` (${media.kind})` : '');
        info.style.display = '';
    } else {
        info.style.display = 'none';
    }
}

$('wc_media').onchange = () => {
    const f = $('wc_media').files[0];
    const box = $('wc_mediaPreview');
    box.innerHTML = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    if (f.type.startsWith('image/')) box.innerHTML = `<img src="${url}" />`;
    else if (f.type.startsWith('video/')) box.innerHTML = `<video src="${url}" controls></video>`;
    else box.innerHTML = `<span class="muted">${esc(f.name)}</span>`;
};

$('wc_mediaClear').onclick = async (e) => {
    e.preventDefault();
    const r = await api('/watcher/media/clear', { method: 'POST' });
    $('wc_media').value = '';
    $('wc_mediaPreview').innerHTML = '';
    renderWatcherMedia(r.status && r.status.media);
};

// Kayıtlı izahat kodlarını UI'ya dağıt: boş = "Tüm ödemeler"; doluysa "seçili
// tipler" moduna geç, eşleşen ön tanımlı tipleri işaretle, kalanı ek kod kutusuna yaz.
function applyIzahatCodesToUI(codes) {
    const set = new Set((codes || []).map(Number).filter(n => !isNaN(n)));
    const ptypes = document.querySelectorAll('.wc_ptype');
    if (!set.size) {
        $('wc_mode_all').checked = true;
        ptypes.forEach(cb => cb.checked = false);
        $('wc_codes').value = '';
        $('wc_typeBox').style.display = 'none';
        return;
    }
    $('wc_mode_sel').checked = true;
    $('wc_typeBox').style.display = '';
    ptypes.forEach(cb => {
        const pc = cb.dataset.codes.split(',').map(Number);
        const all = pc.every(c => set.has(c));
        cb.checked = all;
        if (all) pc.forEach(c => set.delete(c));
    });
    $('wc_codes').value = [...set].join(',');
}

// UI seçimlerinden izahat kod listesi üret: "Tüm ödemeler" → [] (boş = hepsi).
function collectWatcherIzahatCodes() {
    const mode = document.querySelector('input[name="wc_mode"]:checked');
    if (!mode || mode.value === 'all') return [];
    const set = new Set();
    document.querySelectorAll('.wc_ptype:checked').forEach(cb =>
        cb.dataset.codes.split(',').forEach(c => { const n = +c.trim(); if (!isNaN(n)) set.add(n); }));
    $('wc_codes').value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
        .map(Number).filter(n => !isNaN(n)).forEach(n => set.add(n));
    return [...set];
}

// Mod radyo değişiminde seçili-tip kutusunu göster/gizle.
document.querySelectorAll('input[name="wc_mode"]').forEach(r => r.addEventListener('change', () => {
    $('wc_typeBox').style.display = $('wc_mode_sel').checked ? '' : 'none';
}));

function renderWatcherState(s) {
    const on = s.running;
    $('wcDot').className = 'dot ' + (on ? 'on' : '');
    $('wcState').textContent = on ? 'Aktif' : 'Pasif';
    $('wc_save').textContent = on ? 'Ayarları Kaydet' : 'Kaydet ve Başlat';
    $('wc_stop').style.display = on ? '' : 'none';
    const parts = [];
    if (s.table) parts.push(`Tablo: ${s.table}`);
    if (s.watermark != null) parts.push(`Son IND: ${s.watermark}`);
    if (s.lastPollAt) parts.push(`Son tarama: ${new Date(s.lastPollAt).toLocaleTimeString('tr-TR')}`);
    if (s.lastResult?.note) parts.push(s.lastResult.note);
    if (s.lastError) parts.push(`⚠ ${s.lastError}`);
    $('wc_status').textContent = parts.join('  •  ') || '—';
    $('wc_info').textContent = on ? `Her ${s.intervalSec}sn taranıyor` : '';
}

function collectWatcherConfig() {
    return {
        firmaNo: $('wc_firma').value,
        donemNo: $('wc_donem').value,
        template: $('wc_template').value,
        intervalSec: Math.max(10, +$('wc_interval').value || 30),
        minAmount: Math.max(0, +$('wc_min').value || 0),
        izahatCodes: collectWatcherIzahatCodes(),
        verifyOnWhatsApp: $('wc_verify').checked,
        simulateTyping: $('wc_typing').checked,
        sendAllPhones: $('wc_allPhones').checked,
    };
}

$('wc_save').onclick = async () => {
    $('wc_err').textContent = '';
    const cfg = collectWatcherConfig();
    if (!cfg.firmaNo || !cfg.donemNo) { $('wc_err').textContent = 'Firma ve dönem seçin.'; return; }
    if (!cfg.template.trim()) { $('wc_err').textContent = 'Mesaj şablonu boş olamaz.'; return; }
    $('wc_save').disabled = true;
    try {
        await api('/watcher', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
        // Görsel/video seçildiyse yükle (gönderim anında okunur).
        const mediaFile = $('wc_media').files[0];
        if (mediaFile) {
            const fd = new FormData();
            fd.append('media', mediaFile);
            const mr = await fetch('/api/watcher/media', { method: 'POST', body: fd }).then(x => x.json());
            $('wc_media').value = '';
            $('wc_mediaPreview').innerHTML = '';
            if (mr.status) renderWatcherMedia(mr.status.media);
        }
        const r = await api('/watcher/start', { method: 'POST' });
        if (!r.success) $('wc_err').textContent = r.message || 'Başlatılamadı.';
        renderWatcherState(r.status);
    } catch (e) { $('wc_err').textContent = 'Hata: ' + e.message; }
    $('wc_save').disabled = false;
};

$('wc_showCodes').onclick = async (e) => {
    e.preventDefault();
    const firmaNo = $('wc_firma').value, donemNo = $('wc_donem').value;
    if (!firmaNo || !donemNo) return;
    const box = $('wc_codesList');
    box.textContent = 'Yükleniyor...';
    const r = await api(`/watcher/izahat-stats?firmaNo=${firmaNo}&donemNo=${donemNo}`);
    if (!r.success) { box.textContent = r.message; return; }
    if (!r.data.length) { box.textContent = 'Bu dönemde alacak (tahsilat) hareketi yok.'; return; }
    const fmt = n => Number(n).toLocaleString('tr-TR');
    box.innerHTML = 'ALACAK (tahsilat) içeren kodlar — koda tıkla ekle:<br>' + r.data.map(d =>
        `<span class="chip" data-code="${d.code}" style="cursor:pointer">${d.code}${d.label ? ' ' + esc(d.label) : ''}${d.devir ? ' ⚠devir' : ''} · ${d.alacakAdet} adet · ${fmt(d.toplamAlacak)} TL</span>`
    ).join(' ');
    box.querySelectorAll('[data-code]').forEach(ch => ch.onclick = () => {
        const cur = $('wc_codes').value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
        if (!cur.includes(ch.dataset.code)) cur.push(ch.dataset.code);
        $('wc_codes').value = cur.join(',');
    });
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
        const labels = { sent: 'Gönderildi', failed: 'Başarısız', noPhone: 'Telefon yok', notOnWhatsApp: 'WA yok', waOffline: 'WA kapalı' };
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
                <span class="st ${e.status === 'sent' ? 'sent' : (e.status === 'failed' ? 'failed' : 'info')}">${labels[e.status] || e.status}</span>
            </div>`).join('');
        box.querySelectorAll('.wc_msg').forEach(a => a.onclick = (ev) => {
            ev.preventDefault();
            showSentMessage(wcLogEntries[+a.dataset.i]);
        });
    } catch { /* yok say */ }
}

// Gönderilen mesajın tam metni sadece popup'ta gösterilir (log satırı kalabalıklaşmasın).
function showSentMessage(e) {
    if (!e || !e.message) return;
    const bits = [e.name, e.phone, e.at ? new Date(e.at).toLocaleString('tr-TR') : ''].filter(Boolean);
    $('msgModalMeta').textContent = bits.join('  ·  ');
    $('msgModalText').textContent = e.message;
    $('msgModal').classList.remove('hidden');
}
$('msgModalClose').onclick = () => $('msgModal').classList.add('hidden');

// ═══════════════════════════════════════════════════════════════════════════
//  Lisans (çevrimiçi lisans altyapısı — scaffold; şu an kısıtlamaz)
// ═══════════════════════════════════════════════════════════════════════════
const LIC_LABELS = {
    valid: 'Lisanslı', offline: 'Çevrimdışı', unlicensed: 'Lisanssız',
    invalid: 'Geçersiz', expired: 'Süresi doldu', error: 'Hata',
};

async function loadLicense() {
    try { const r = await api('/license'); if (r.success) renderLicense(r.license); }
    catch { /* yok say */ }
}

function renderLicense(L) {
    if (!L) return;
    $('licLabel').textContent = LIC_LABELS[L.status] || 'Lisans';
    $('licDot').className = 'dot ' + (L.status === 'valid' ? 'on' : 'wait');
    $('lic_machine').value = L.machineId || '';
    $('lic_key').value = L.key || '';
    const mode = L.enforced ? 'Zorunlu mod' : 'Altyapı hazır (kısıtlama yok)';
    const bits = [`${mode}`, `Durum: ${LIC_LABELS[L.status] || L.status}`];
    if (L.plan) bits.push(`Plan: ${L.plan}`);
    if (L.validUntil) bits.push(`Bitiş: ${new Date(L.validUntil).toLocaleDateString('tr-TR')}`);
    if (L.message) bits.push(L.message);
    $('lic_state').textContent = bits.join('  ·  ');
}

$('licBtn').onclick = async () => { await loadLicense(); $('licModal').classList.remove('hidden'); };
$('lic_close').onclick = () => $('licModal').classList.add('hidden');
$('lic_activate').onclick = async () => {
    $('lic_err').textContent = '';
    const key = $('lic_key').value.trim();
    if (!key) { $('lic_err').textContent = 'Anahtar girin.'; return; }
    $('lic_activate').disabled = true;
    try {
        const r = await api('/license/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
        renderLicense(r.license);
        if (!r.success) $('lic_err').textContent = r.message || 'Etkinleştirilemedi.';
    } catch (e) { $('lic_err').textContent = 'Hata: ' + e.message; }
    $('lic_activate').disabled = false;
};
$('lic_recheck').onclick = async () => {
    $('lic_err').textContent = '';
    try { const r = await api('/license/recheck', { method: 'POST' }); renderLicense(r.license); }
    catch (e) { $('lic_err').textContent = 'Hata: ' + e.message; }
};

// ─── yardımcı ───
function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

boot();
