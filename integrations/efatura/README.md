# Vega e-Fatura / e-Arsiv WhatsApp entegrasyonu

Bu klasor kurulumda `C:\Program Files\Vega WhatsApp\integrations\efatura`
altina kopyalanir ve Vega WhatsApp acilirken otomatik yuklenir.

## Ilk kurulum

Vega'nin `vega.earsiv.console.exe` araci Windows geregi yonetici yetkisi ister.
Kurulum export gorevini SYSTEM hesabinda kaydeder. Gorev eksik gorunurse
`tools\setup-task.cmd` dosyasini bir kez cift tiklayin ve UAC onayini verin.
Sonraki faturalarda pencere/UAC acilmaz.

Degisen dosyalar AppData'ya yazilmaz. Durum ve loglar:

`C:\ProgramData\Vega WhatsApp\efatura`

Ilk acilista mevcut faturalar bilerek gonderilmez. O andaki en yuksek `IND`
baslangic kabul edilir. Bundan sonra Vega satis faturasi (`BELGETIPI=21`) 16
karakterli `BELGENO` aldigi anda, GIB/e-Arsiv gonderimi beklenmeden PDF olarak
gonderilir. `EFATURA` alani sadece hangi dizaynin secilecegini belirler.

Gonderilen bir fatura sonraki 7 gun icinde degistirilirse yeni PDF gonderilir ve
eski PDF mesaji geri cekilmeye calisilir. Fatura `IPTAL=1` olursa veya kaydi
silinirse eski PDF geri cekilir ve musteriye iptal bildirimi gider. WhatsApp'in
geri cekme suresi asilmissa iptal bildirimi yine gonderilir.

## Dizayn sirasi

Her belge icin ilk bulunan dosya kullanilir:

1. `designs\<VKN>\invoice.xslt` / `earchive.xslt`
2. `designs\invoice_<VKN>.xslt` / `earchive_<VKN>.xslt`
3. `designs\invoice_<PROFILEID>.xslt` / `earchive_<PROFILEID>.xslt`
4. `designs\default\invoice.xslt` / `earchive.xslt`
5. `designs\invoice.xslt` / `earchive.xslt`

Varsayilan iki dosya kuruluma dahildir. Musteriye ozel dizayn icin ilgili XSLT'yi
bu klasore kopyalamak yeterlidir; `C:\eArsiv` icinde dizayn aranmaz.

`integration.json` icinden tarama suresi, tur basina adet, sabit VKN ve mesaj
sablonu degistirilebilir. Program Files altinda oldugu icin degisiklik yonetici
yetkisi ister.

## Guvenlik ve dogruluk

- Konsola belge numarasi degil sayisal `TBLSATFATBASLIK.IND` verilir.
- Uretilen UBL'nin kok fatura numarasi beklenen `BELGENO` ile ayni degilse
  WhatsApp gonderimi durdurulur. Bu kontrol yanlis firma/donem ayarinda baska
  faturanin gitmesini engeller.
- Tetik icin `TBLEARCHIVEHISTORY`, `SENTSTATUS` veya GIB sonucu kullanilmaz.
- Ayni 16 haneli satis faturasinin eski metin bildirimi atlanir; PDF ve aciklama
  tek WhatsApp mesaji olarak gider.
- WhatsApp gonderimi ana uygulamanin mevcut hesap/relay/cloud ve anti-ban
  katmanindan yapilir.
