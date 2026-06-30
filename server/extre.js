// ═══════════════════════════════════════════════════════════════════════════
//  Hesap Ekstresi PDF üretici (saf fonksiyon — SQL yok)
//  Vega'nın .fr3 (FastReport) tasarımı Node'da render EDİLEMEZ; bu yüzden ekstre
//  PDF'i CARIHAREKETLERI satırlarından burada üretilir. SQL/iletişim server.js'te.
//
//  Türkçe karakter (ş/ğ/İ/ı) için TTF GÖMÜLÜR — pdfkit'in standart Helvetica AFM'i
//  WinAnsi (CP1252) olduğundan Türkçe basamaz. server/assets/arial(.bd).ttf gerekir.
//  NOT: dağıtımda lisanslı Arial yerine libre font (DejaVu/Noto) önerilir.
// ═══════════════════════════════════════════════════════════════════════════
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const FONT_DIR = path.join(__dirname, 'assets');
const FONT_REG = path.join(FONT_DIR, 'arial.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'arialbd.ttf');
const HAS_FONTS = fs.existsSync(FONT_REG) && fs.existsSync(FONT_BOLD);

const fmtTR = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtDate(d) {
    if (!d) return '';
    const x = new Date(d);
    return isNaN(x.getTime()) ? String(d) : x.toLocaleDateString('tr-TR');
}

// Sütun düzeni (A4 = 595pt, margin 40 → içerik 40..555, genişlik 515).
const COLS = [
    { key: 'tarih',  title: 'Tarih',    x: 40,  w: 58,  align: 'left'  },
    { key: 'evrak',  title: 'Evrak No', x: 98,  w: 82,  align: 'left'  },
    { key: 'izahat', title: 'Açıklama', x: 180, w: 175, align: 'left'  },
    { key: 'borc',   title: 'Borç',     x: 355, w: 66,  align: 'right' },
    { key: 'alacak', title: 'Alacak',   x: 421, w: 66,  align: 'right' },
    { key: 'bakiye', title: 'Bakiye',   x: 487, w: 68,  align: 'right' },
];
const X0 = 40, X1 = 555;
const PAGE_BOTTOM = 800; // A4 yüksekliği 842; alt margin payı

// data: { firmaName, cariName, cariKod, donem, rows:[{tarih,evrak,izahat,borc,alacak,bakiye}],
//         net, generatedAt }  → Promise<Buffer>
function buildExtrePdf(data = {}) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            if (HAS_FONTS) { doc.registerFont('reg', FONT_REG); doc.registerFont('bold', FONT_BOLD); }
            const REG = HAS_FONTS ? 'reg' : 'Helvetica';
            const BOLD = HAS_FONTS ? 'bold' : 'Helvetica-Bold';

            const rows = Array.isArray(data.rows) ? data.rows : [];

            // ─── Başlık ───
            doc.font(BOLD).fontSize(16).fillColor('#111').text(data.firmaName || 'HESAP EKSTRESİ', X0, 40, { width: X1 - X0 });
            doc.font(REG).fontSize(11).fillColor('#555').text('Hesap Ekstresi', X0, doc.y + 2);
            doc.moveTo(X0, doc.y + 6).lineTo(X1, doc.y + 6).strokeColor('#ccc').lineWidth(1).stroke();

            // ─── Cari bilgisi ───
            let y = doc.y + 14;
            doc.fillColor('#111').font(BOLD).fontSize(12).text(data.cariName || '', X0, y, { width: X1 - X0 });
            y = doc.y + 2;
            doc.font(REG).fontSize(9).fillColor('#555');
            const meta = [
                data.cariKod ? `Cari Kod: ${data.cariKod}` : null,
                data.donem ? `Dönem: ${data.donem}` : null,
                `Ekstre Tarihi: ${fmtDate(data.generatedAt || new Date())}`,
            ].filter(Boolean).join('     ');
            doc.text(meta, X0, y);
            y = doc.y + 12;

            // ─── Tablo başlık satırı (çizici) ───
            const drawHeader = (yy) => {
                doc.save();
                doc.rect(X0, yy, X1 - X0, 20).fillColor('#f0f2f5').fill();
                doc.fillColor('#111').font(BOLD).fontSize(9);
                for (const c of COLS) doc.text(c.title, c.x + 3, yy + 6, { width: c.w - 6, align: c.align, lineBreak: false });
                doc.restore();
                return yy + 20;
            };
            y = drawHeader(y);

            // ─── Satırlar ───
            doc.font(REG).fontSize(8.5).fillColor('#111');
            const ROW_H = 16;
            for (const r of rows) {
                if (y + ROW_H > PAGE_BOTTOM) { doc.addPage(); y = 40; y = drawHeader(y); doc.font(REG).fontSize(8.5).fillColor('#111'); }
                const cells = {
                    tarih: fmtDate(r.tarih),
                    evrak: r.evrak != null ? String(r.evrak) : '',
                    izahat: r.izahat != null ? String(r.izahat) : '',
                    borc: Number(r.borc) ? fmtTR(r.borc) : '',
                    alacak: Number(r.alacak) ? fmtTR(r.alacak) : '',
                    bakiye: fmtTR(r.bakiye),
                };
                for (const c of COLS) {
                    doc.fillColor(c.key === 'bakiye' ? (Number(r.bakiye) < 0 ? '#b45309' : '#111') : '#111')
                        .text(cells[c.key], c.x + 3, y + 4, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
                }
                doc.moveTo(X0, y + ROW_H).lineTo(X1, y + ROW_H).strokeColor('#eee').lineWidth(0.5).stroke();
                y += ROW_H;
            }
            if (!rows.length) {
                doc.fillColor('#999').font(REG).fontSize(10).text('Bu dönemde hareket bulunmuyor.', X0, y + 8, { width: X1 - X0, align: 'center' });
                y += 30;
            }

            // ─── Özet / güncel bakiye ───
            if (y + 60 > PAGE_BOTTOM) { doc.addPage(); y = 40; }
            const net = Number(data.net) || 0;
            const durum = net > 0 ? 'Borç' : net < 0 ? 'Alacak' : 'Kapalı';
            y += 10;
            doc.moveTo(X0, y).lineTo(X1, y).strokeColor('#ccc').lineWidth(1).stroke();
            y += 10;
            doc.font(BOLD).fontSize(12).fillColor(net < 0 ? '#b45309' : '#111')
                .text(`GÜNCEL BAKİYE: ${fmtTR(Math.abs(net))} ₺  (${durum})`, X0, y, { width: X1 - X0, align: 'right' });

            // ─── Dipnot ───
            doc.font(REG).fontSize(7.5).fillColor('#999')
                .text('Bu ekstre bilgilendirme amaçlıdır. + Borç / − Alacak (sizin bize borcunuz pozitiftir).', X0, PAGE_BOTTOM + 12, { width: X1 - X0, align: 'center' });

            doc.end();
        } catch (e) { reject(e); }
    });
}

module.exports = { buildExtrePdf };
