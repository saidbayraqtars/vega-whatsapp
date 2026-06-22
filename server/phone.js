// Telefon numarasını WhatsApp JID formatına çevirir (905551234567).
// Türkiye odaklı: 0 ile başlayanlar 90'a, 5 ile başlayan 10 hane 90 ekiyle düzeltilir.
const normalizePhone = (phone) => {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (!digits) return '';

    // Bazı carilerde birden fazla numara tek alanda olabilir ("0532... / 0533...").
    // İlk geçerli bloğu al: ayraçtan böl, ilk parçayı kullan.
    // (replace ile rakam dışı zaten gittiği için burada uzunluk bazlı kırpıyoruz.)

    if (digits.startsWith('00')) {
        digits = digits.slice(2); // 00 = uluslararası arama öneki (0090...) → at, 90... kalır
    }

    if (digits.startsWith('0')) {
        digits = '90' + digits.slice(1);
    } else if (digits.length === 10 && digits.startsWith('5')) {
        digits = '90' + digits;
    } else if (digits.length === 12 && digits.startsWith('90')) {
        // zaten doğru
    } else if (digits.length === 11 && digits.startsWith('90')) {
        // 90 + 9 hane gibi eksik — olduğu gibi bırak, onWhatsApp doğrular
    } else if (digits.length === 7) {
        // sadece yerel hat — geçersiz say
        return '';
    }

    return digits;
};

// Numara mantıken geçerli mi (TR cep: 90 + 5xx + 7 hane = 12 hane).
const isLikelyValid = (normalized) => {
    return /^905\d{9}$/.test(normalized);
};

module.exports = { normalizePhone, isLikelyValid };
