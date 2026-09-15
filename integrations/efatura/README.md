# Vega e-Fatura / e-Arsiv WhatsApp entegrasyonu

Bu klasor kurulumda `C:\Program Files\Vega WhatsApp\integrations\efatura`
altina kopyalanir ve Vega WhatsApp acilirken otomatik yuklenir.

## Acma / kapama

Guncellemeyle herkese dagitildigi icin **varsayilan KAPALI**dir. Ayarlar >
**e-Fatura PDF gonderimi** > "Fatura kesilince PDF'i musteriye WhatsApp'tan
gonder" isaretlenip Kaydet'e basilinca calisir. Kapaliyken satis faturalari
eskisi gibi Belge Mesajlari'ndan metin olarak gider.

Tusun acildigi andaki en yuksek `IND` baslangic kabul edilir: once kesilmis
faturalar gonderilmez. Bundan sonra Vega satis faturasi (`BELGETIPI=21`) 16
karakterli `BELGENO` aldigi anda, GIB/e-Arsiv gonderimi beklenmeden PDF olarak
gonderilir. `EFATURA` alani sadece hangi dizaynin secilecegini belirler.

## Dizayn ve log klasoru

Ayarlar'daki **"Dizayn ve log klasorunu ac"** dugmesi su klasoru acar:

`C:\ProgramData\Vega WhatsApp\efatura`

- `dizaynlar\` — XSLT dosyalari
- `efatura-log.txt` — gunluk (metin belgesi)
- `state.json` — gonderim kaydi (elle degistirmeyin)
- `settings.json` — istege bagli makineye ozel ayar (ornegin `testPhone`)

Program Files kullanilmaz: her guncelleme o klasoru bastan siler.

## Dizayn secimi

Her belge icin ilk bulunan dosya kullanilir:

1. `dizaynlar\invoice_<VKN/TCKN>.xslt` / `earchive_<VKN/TCKN>.xslt` (birden fazla firma)
2. `dizaynlar\invoice.xslt` / `earchive.xslt`

e-Fatura `invoice`, e-Arsiv `earchive` dizaynini kullanir. VKN faturanin
satici bilgisinden okunur (`integration.json` > `invoiceVkn` ile sabitlenebilir).
**Dizayn bulunamazsa belge gonderilmez**; hata logda ve Ayarlar'da gorunur.
Kuruluma gomulu `designs\default` yalniz ornektir, otomatik kullanilmaz.

## Yonetici gorevi

Vega'nin `vega.earsiv.console.exe` araci Windows geregi yonetici yetkisi ister.
Kurulum export gorevini SYSTEM hesabinda kaydeder ve oturum acmis kullanicilara
calistirma izni verir. Gorev eksik gorunurse `tools\setup-task.cmd` dosyasini bir
kez cift tiklayin ve UAC onayini verin.

## Test modu

`settings.json` icine `{ "testPhone": "905xxxxxxxxx" }` yazilirsa butun PDF ve
iptal mesajlari cari yerine o numaraya gider, basinda gercek alici yazar. Test
modunda gonderilen faturalar gonderildi sayilir; kapatinca gercek cariye tekrar
gitmez.

## Degisiklik ve iptal

Gonderilen bir fatura sonraki 7 gun icinde degistirilirse yeni PDF gonderilir ve
eski PDF mesaji geri cekilmeye calisilir. Fatura `IPTAL=1` olursa veya kaydi
silinirse eski PDF geri cekilir ve musteriye iptal bildirimi gider. WhatsApp'in
geri cekme suresi asilmissa iptal bildirimi yine gonderilir.

## Guvenlik ve dogruluk

- Konsola belge numarasi degil sayisal `TBLSATFATBASLIK.IND` verilir.
- Uretilen UBL'nin kok fatura numarasi beklenen `BELGENO` ile ayni degilse
  WhatsApp gonderimi durdurulur. Bu kontrol yanlis firma/donem ayarinda baska
  faturanin gitmesini engeller.
- Tetik icin `TBLEARCHIVEHISTORY`, `SENTSTATUS` veya GIB sonucu kullanilmaz.
- Ayni 16 haneli satis faturasinin eski metin bildirimi (tus aciksa) atlanir; PDF
  ve aciklama tek WhatsApp mesaji olarak gider.
- WhatsApp gonderimi ana uygulamanin mevcut hesap/relay/cloud ve anti-ban
  katmanindan yapilir.
