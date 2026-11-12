// ═══════════════════════════════════════════════════════════════════════════
//  Aktif Cari İzleyici (Arctos/Vega ERP)
//  Arctos kapalı kaynak + CEF gömülü → penceresi okunamaz, toolbar'ı
//  özelleştirilemez. ÇÖZÜM: Arctos bir cari kartı açınca DB'ye LİTERAL IND ile
//  sorgu atar; SQL Server plan cache'inden (dm_exec_query_stats) bu sorgunun
//  en son çalışanını okuyup "şu an açık cari"yi tespit ederiz. XE/Profiler
//  oturumu KURMAZ — yalnız tek SELECT (VIEW SERVER STATE; sa zaten sahip).
//
//  Arctos imzaları (F0101 ile canlı doğrulandı 2026-06-23):
//    SELECT ISNULL(FIRMATIPI,0) FROM F0101TBLCARI WHERE IND=109
//    SELECT SUM(BORC - ALACAK) FROM F0101D0005TBLCARIHAREKETLERI WHERE FIRMANO=109
//  Birincisi firma+ind; ikincisi firma+DÖNEM+ind verir. En yenisi = açık cari.
//  Tam prefix eşleşmesi şart: uygulamanın kendi (IN/@P1) sorguları ve tanılama
//  sorguları karışmasın.
//
//  Bağımlılıklar: configure({ getPool, sql })
// ═══════════════════════════════════════════════════════════════════════════

let deps = null;
let timer = null;
let polling = false;
const POLL_MS = 1500;

// Son tespit edilen açık cari. { firmaNo, donemNo, ind, lx (server zamanı), ageMs }
let active = null;
let lastError = null;

// Arctos cari-açılış sorgularının tam imzaları (plan cache LIKE filtresi).
const SIG_TIPI = 'SELECT ISNULL(FIRMATIPI,0) FROM F%TBLCARI WHERE IND=%';
const SIG_BAKIYE = 'SELECT SUM(BORC - ALACAK) FROM F%TBLCARIHAREKETLERI WHERE FIRMANO=%';

const RE_TIPI = /FROM\s+F(\d+)TBLCARI\s+WHERE\s+IND\s*=\s*(\d+)/i;
const RE_BAKIYE = /FROM\s+F(\d+)D(\d+)TBLCARIHAREKETLERI\s+WHERE\s+FIRMANO\s*=\s*(\d+)/i;

function configure(d) { deps = d; }

// Plan cache'i tek seferde oku → en yeni cari-açılış sorgusunu çöz.
async function pollOnce() {
    const pool = deps && deps.getPool();
    if (!pool || !pool.connected) return;
    const rows = (await pool.request().query(`
        SELECT TOP 12 qs.last_execution_time AS lx, t.text AS qtext, SYSDATETIME() AS srvnow
        FROM sys.dm_exec_query_stats qs
        CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
        WHERE t.text LIKE '${SIG_TIPI}' OR t.text LIKE '${SIG_BAKIYE}'
        ORDER BY qs.last_execution_time DESC
    `)).recordset;
    if (!rows.length) return; // hiç cari açılmamış (cache boş)

    // En yeni satır firma+ind'i belirler. Dönem yalnız BAKIYE imzasında var →
    // aynı firma+ind için en yakın BAKIYE satırından dönemi tamamla.
    let firmaNo = null, ind = null, donemNo = null, lx = null;
    for (const r of rows) {
        const mb = RE_BAKIYE.exec(r.qtext);
        const mt = mb ? null : RE_TIPI.exec(r.qtext);
        const m = mb || mt;
        if (!m) continue;
        const f = mb ? mb[1] : mt[1];
        const i = mb ? mb[3] : mt[2];
        const d = mb ? mb[2] : null;
        if (firmaNo == null) { firmaNo = f; ind = i; lx = r.lx; donemNo = d; }
        // Dönem henüz yoksa, aynı carinin BAKIYE satırından al.
        if (donemNo == null && d && f === firmaNo && i === ind) { donemNo = d; }
        if (firmaNo != null && donemNo != null) break;
    }
    if (firmaNo == null || ind == null) return;

    const indNum = parseInt(ind, 10);
    const ageMs = (rows[0] && rows[0].srvnow && lx) ? Math.max(0, new Date(rows[0].srvnow) - new Date(lx)) : null;
    const changed = !active || active.firmaNo !== firmaNo || active.ind !== indNum || active.donemNo !== donemNo;
    active = { firmaNo, donemNo: donemNo || null, ind: indNum, lx: lx ? new Date(lx).toISOString() : null, ageMs, changedAt: changed ? new Date().toISOString() : (active && active.changedAt) };
}

async function tick() {
    if (polling) return;
    polling = true;
    try { await pollOnce(); lastError = null; }
    catch (e) { lastError = e.message; }
    finally { polling = false; }
}

function start() {
    stop();
    tick();
    timer = setInterval(tick, POLL_MS);
    if (timer.unref) timer.unref();
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }
function autoStart() { start(); }

// Anlık açık cari (ham). Yaş bilgisi UI'ya bırakılır.
function getActive() { return active ? { ...active, lastError } : null; }

module.exports = { configure, start, stop, autoStart, tick, getActive };
