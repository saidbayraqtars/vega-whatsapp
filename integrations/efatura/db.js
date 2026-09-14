// Vega ERP belge secimi. Yalniz SELECT; tablo adlari kati 4 haneli kodlardan uretilir.
// Bu entegrasyon yalniz Vega satis faturasini izler. GIB/e-Arsiv gonderim
// durumu tetik degildir; tamamlanma kaniti 16 karakterli BELGENO'dur.
const SATIS_FATURASI_BELGE_TIPI = 21;

function code(value, label) {
    const m = String(value == null ? '' : value).match(/^(?:F|D)?(\d{1,4})$/i);
    if (!m) throw new Error(`gecersiz ${label}: ${value}`);
    return m[1].padStart(4, '0');
}

function names(firma, donem) {
    const f = code(firma, 'firma'), d = code(donem, 'donem');
    return {
        firma: f, donem: d,
        header: `F${f}D${d}TBLSATFATBASLIK`,
        lines: `F${f}D${d}TBLSATFATHAREKET`,
    };
}

async function resolveContext(pool, raw) {
    if (!raw || raw.firmaNo == null) return null;
    const firmaNo = code(raw.firmaNo, 'firma');
    if (raw.donemNo != null && String(raw.donemNo).trim() !== '') {
        const donemNo = code(raw.donemNo, 'donem');
        const n = names(firmaNo, donemNo);
        const exists = await pool.request().input('name', n.header)
            .query('SELECT COUNT(*) n FROM sys.tables WHERE name=@name');
        if (Number(exists.recordset[0].n) > 0) return { firmaNo, donemNo };
    }
    // UI yalniz firma secmis olabilir. Bu durumda o firmaya ait en yeni
    // satis faturasi donemi otomatik secilir.
    const pattern = `F${firmaNo}D____TBLSATFATBASLIK`;
    const rs = await pool.request().input('pattern', pattern).query(`
        SELECT TOP 1 SUBSTRING(h.name,7,4) donemNo
        FROM sys.tables h
        WHERE h.name LIKE @pattern
        ORDER BY SUBSTRING(h.name,7,4) DESC`);
    if (!rs.recordset.length) throw new Error(`F${firmaNo} icin e-belge donemi bulunamadi`);
    return { firmaNo, donemNo: rs.recordset[0].donemNo };
}

async function assertTables(pool, firma, donem) {
    const n = names(firma, donem);
    const rs = await pool.request()
        .input('header', n.header)
        .input('lines', n.lines)
        .query(`SELECT name FROM sys.tables WHERE name IN (@header,@lines)`);
    const found = new Set(rs.recordset.map(r => r.name));
    if (!found.has(n.header)) throw new Error(`${n.header} bulunamadi`);
    if (!found.has(n.lines)) throw new Error(`${n.lines} bulunamadi`);
    return n;
}

async function maxInvoiceInd(pool, ctx) {
    const n = await assertTables(pool, ctx.firmaNo, ctx.donemNo);
    const rs = await pool.request().query(`SELECT ISNULL(MAX(IND),0) maxInd FROM [${n.header}]`);
    return Number(rs.recordset[0].maxInd) || 0;
}

const snapshotSelect = n => `
    SELECT
        b.IND, b.BELGENO, b.TARIH, b.TUTAR, b.PARABIRIMI,
        b.FIRMANO AS CARIIND, b.EFATURA, b.EFATURAUUID,
        b.BELGETIPI, b.IPTAL, b.IADE, b.LADATE,
        ISNULL(l.LINE_COUNT,0) AS LINE_COUNT,
        ISNULL(l.LINE_CHECKSUM,0) AS LINE_CHECKSUM,
        CASE WHEN ISNULL(b.EFATURA,0)=1 THEN 'efatura' ELSE 'earsiv' END AS DOCUMENT_TYPE
    FROM [${n.header}] b
    OUTER APPLY (
        SELECT COUNT_BIG(*) AS LINE_COUNT,
               CHECKSUM_AGG(BINARY_CHECKSUM(
                   h.IND,h.SATIRNO,h.STOKNO,h.STOKKODU,h.MALINCINSI,
                   h.MIKTAR,h.BIRIMMIKTAR,h.BIRIM,h.KDV,h.KDVTUTARI,
                   h.ISK1,h.ISK2,h.ISK3,h.ISK4,h.ISK5,h.ISK6,
                   h.FIYATI,h.GERCEKTOPLAM,h.ACIKLAMA,h.PARABIRIMI,h.KUR
               )) AS LINE_CHECKSUM
        FROM [${n.lines}] h
        WHERE h.EVRAKNO=b.IND
    ) l`;

// Fatura GIB'e gonderilmeden once yakalanir. Vega'da normal satis faturasi
// tip 21'dir; 16 karakterli numara belge kaydinin tamamlandigini gosterir.
async function readyDocuments(pool, ctx, { afterInd, limit = 5 } = {}) {
    const n = await assertTables(pool, ctx.firmaNo, ctx.donemNo);
    const rs = await pool.request()
        .input('afterInd', Number(afterInd) || 0)
        .input('limit', Math.max(1, Math.min(50, Number(limit) || 5)))
        .query(`
            ${snapshotSelect(n).replace('SELECT', 'SELECT TOP (@limit)')}
            WHERE b.IND > @afterInd
              AND b.BELGETIPI=${SATIS_FATURASI_BELGE_TIPI}
              AND LEN(LTRIM(RTRIM(ISNULL(b.BELGENO,''))))=16
              AND ISNULL(b.IPTAL,0)=0 AND ISNULL(b.IADE,0)=0
            ORDER BY b.IND ASC`);
    return rs.recordset;
}

// Daha once PDF'i gonderilen belgelerin degisiklik/iptal/silinme kontrolu.
// Eksik donen IND, Vega tablosundan fiziksel olarak silinmis demektir.
async function documentStates(pool, ctx, inds) {
    const ids = [...new Set((inds || []).map(Number).filter(Number.isInteger).filter(x => x > 0))].slice(0, 1000);
    if (!ids.length) return [];
    const n = await assertTables(pool, ctx.firmaNo, ctx.donemNo);
    const request = pool.request();
    const params = ids.map((id, i) => {
        const name = `ind${i}`;
        request.input(name, id);
        return `@${name}`;
    });
    const rs = await request.query(`${snapshotSelect(n)} WHERE b.IND IN (${params.join(',')})`);
    return rs.recordset;
}

module.exports = {
    code, names, resolveContext, assertTables, maxInvoiceInd, readyDocuments,
    documentStates, SATIS_FATURASI_BELGE_TIPI,
};
