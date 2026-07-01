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

// Fontlar BUFFER olarak yüklenir. pkg/exe içinde fontkit'e dosya YOLU verilirse
// (openSync) snapshot fs yolu çözümü kırılabilir; buffer verilince pdfkit
// fontkit.create(buffer) ile bellekte parse eder — fs/path'e dokunmaz.
// NOT: exe'de standart font (Helvetica) AFM'i bundle EDİLMEZ; TTF olmadan
// buildExtrePdf standart fonta düşer ve AFM eksikliğinden patlar → TTF şart.
const FONT_DIR = path.join(__dirname, 'assets');
const tryFontBuf = (name) => { try { return fs.readFileSync(path.join(FONT_DIR, name)); } catch { return null; } };
const FONT_REG_BUF = tryFontBuf('arial.ttf');
const FONT_BOLD_BUF = tryFontBuf('arialbd.ttf');
const HAS_FONTS = !!(FONT_REG_BUF && FONT_BOLD_BUF);

const fmtTR = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Miktar: tam sayıysa ondalıksız, değilse 3 haneye kadar.
const fmtNum = (n) => { const x = Number(n) || 0; return Number.isInteger(x) ? String(x) : x.toLocaleString('tr-TR', { maximumFractionDigits: 3 }); };
function fmtDate(d) {
    if (!d) return '';
    const x = new Date(d);
    return isNaN(x.getTime()) ? String(d) : x.toLocaleDateString('tr-TR');
}

// Sütun düzeni (A4 = 595pt, margin 40 → içerik 40..555, genişlik 515).
const COLS = [
    { key: 'tarih',  title: 'Tarih',    x: 40,  w: 58,  align: 'left'  },
    { key: 'evrak',  title: 'Evrak No', x: 98,  w: 82,  align: 'left'  },
    { key: 'izahat', title: 'Belge / Açıklama', x: 180, w: 175, align: 'left'  },
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

            if (HAS_FONTS) { doc.registerFont('reg', FONT_REG_BUF); doc.registerFont('bold', FONT_BOLD_BUF); }
            const REG = HAS_FONTS ? 'reg' : 'Helvetica';
            const BOLD = HAS_FONTS ? 'bold' : 'Helvetica-Bold';

            const rows = Array.isArray(data.rows) ? data.rows : [];
            const firma = data.firma || {};

            // ─── Marka başlık (logo + firma bilgileri) ───
            // Logo varsa sol üstte; firma adı + iletişim/vergi/IBAN bilgileri yanında.
            let logoW = 0;
            const headTop = 38;
            if (data.logo) {
                try { doc.image(data.logo, X0, headTop, { fit: [120, 50] }); logoW = 132; }
                catch { logoW = 0; }
            }
            const infoX = X0 + logoW;
            const infoW = X1 - infoX;
            doc.font(BOLD).fontSize(15).fillColor('#111')
                .text(firma.name || data.firmaName || 'HESAP EKSTRESİ', infoX, headTop, { width: infoW });
            doc.font(REG).fontSize(8.5).fillColor('#555');
            const line2 = [firma.address].filter(Boolean).join('');
            if (line2) doc.text(line2, infoX, doc.y + 1, { width: infoW });
            const line3 = [
                firma.phone ? `Tel: ${firma.phone}` : null,
                firma.email || null,
                firma.web || null,
            ].filter(Boolean).join('   ');
            if (line3) doc.text(line3, infoX, doc.y + 1, { width: infoW });
            const line4 = [
                firma.taxOffice ? `V.D.: ${firma.taxOffice}` : null,
                firma.taxNo ? `VKN/TCKN: ${firma.taxNo}` : null,
            ].filter(Boolean).join('   ');
            if (line4) doc.text(line4, infoX, doc.y + 1, { width: infoW });
            if (firma.iban) doc.text(`IBAN: ${firma.iban}`, infoX, doc.y + 1, { width: infoW });

            // Sağ üst köşe: belge tipi etiketi
            doc.font(BOLD).fontSize(10).fillColor('#888')
                .text('HESAP EKSTRESİ', X1 - 160, headTop, { width: 160, align: 'right' });

            const dividerY = Math.max(doc.y, headTop + 52) + 6;
            doc.moveTo(X0, dividerY).lineTo(X1, dividerY).strokeColor('#ccc').lineWidth(1).stroke();
            doc.y = dividerY;

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

            // ─── Satırlar (+ belge içeriği = kalemler) ───
            const ROW_H = 16;
            const adX = COLS[2].x + 8;          // kalem girintisi (Açıklama sütunu altı)
            const sumX = COLS[3].x;             // kalem "miktar×fiyat=tutar" sağ blok başlangıcı
            const nameW = sumX - adX - 8;       // kalem adı genişliği (Borç sütununa kadar)
            for (const r of rows) {
                if (y + ROW_H > PAGE_BOTTOM) { doc.addPage(); y = 40; y = drawHeader(y); }
                doc.font(REG).fontSize(8.5);
                const cells = {
                    tarih: fmtDate(r.tarih),
                    evrak: r.evrak != null ? String(r.evrak) : '',
                    izahat: r.belgeTip || (r.izahat != null ? String(r.izahat) : ''),
                    borc: Number(r.borc) ? fmtTR(r.borc) : '',
                    alacak: Number(r.alacak) ? fmtTR(r.alacak) : '',
                    bakiye: fmtTR(r.bakiye),
                };
                for (const c of COLS) {
                    doc.fillColor(c.key === 'bakiye' ? (Number(r.bakiye) < 0 ? '#b45309' : '#111') : '#111')
                        .text(cells[c.key], c.x + 3, y + 4, { width: c.w - 6, align: c.align, lineBreak: false, ellipsis: true });
                }
                y += ROW_H;

                // Belge içeriği: kalemler (ürün — miktar × fiyat = tutar). Ad uzun olabilir →
                // yükseklik heightOfString ile dinamik; sayı bloğu ilk satıra sabit (sarmaz).
                if (Array.isArray(r.kalemler) && r.kalemler.length) {
                    doc.font(REG).fontSize(7);
                    for (const k of r.kalemler) {
                        const nameTxt = `• ${k.ad}`;
                        const sumStr = `${fmtNum(k.miktar)} ${k.birim} × ${fmtTR(k.fiyat)} = ${fmtTR(k.tutar)}`;
                        const h = Math.max(10, doc.heightOfString(nameTxt, { width: nameW }));
                        if (y + h > PAGE_BOTTOM) { doc.addPage(); y = 40; y = drawHeader(y); doc.font(REG).fontSize(7); }
                        doc.fillColor('#666').text(nameTxt, adX, y + 1, { width: nameW });
                        doc.fillColor('#888').text(sumStr, sumX, y + 1, { width: X1 - sumX - 2, align: 'right', lineBreak: false });
                        y += h + 1;
                    }
                }
                doc.moveTo(X0, y).lineTo(X1, y).strokeColor('#eee').lineWidth(0.5).stroke();
                y += 2;
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
            y = doc.y;

            // ─── Yasal şartlar (firma bilgilerinden — belge altında küçük punto) ───
            if (firma.legalTerms && String(firma.legalTerms).trim()) {
                y += 14;
                if (y + 40 > PAGE_BOTTOM) { doc.addPage(); y = 40; }
                doc.font(REG).fontSize(7).fillColor('#777')
                    .text(String(firma.legalTerms).trim(), X0, y, { width: X1 - X0, align: 'left' });
            }

            // ─── Dipnot ───
            doc.font(REG).fontSize(7.5).fillColor('#999')
                .text('Bu ekstre bilgilendirme amaçlıdır. + Borç / − Alacak (sizin bize borcunuz pozitiftir).', X0, PAGE_BOTTOM + 12, { width: X1 - X0, align: 'center' });

            doc.end();
        } catch (e) { reject(e); }
    });
}

module.exports = { buildExtrePdf };
