# Vega WhatsApp

VegaDB (SQL Server) carilerine **toplu WhatsApp mesajı** gönderen, cari hareketleri izleyip
**tahsilat alındığında otomatik bildirim** atan ve gönderim sağlığını (teslim/okundu/yanıt)
izleyen Windows masaüstü uygulaması (Electron).

- **WhatsApp:** Baileys (WebSocket — chromium gerekmez). QR ile bağlanır, oturum kalıcıdır.
- **Veritabanı:** `F{firma}TBLCARI` cari + telefon sütunları otomatik tespit edilir
  (TELEFON1/2/3, YGSM, YTELEFON1/2 — KEFIL/FAKS/MODEM hariç).
- **Masaüstü:** Pencere kapatılınca tray'e gizlenir, izleme durmaz. Windows açılışında
  otomatik başlar; DB parolası DPAPI (safeStorage) ile şifreli saklanıp açılışta otomatik bağlanır.
- **Güncelleme:** GitHub Releases üzerinden otomatik (aşağıya bakın).

## Çalıştırma (geliştirme)

`start.bat` çift tıkla — ilk açılışta bağımlılıkları kurar, Electron penceresi açılır.

```bash
npm install && cd server && npm install && cd ..
npm start
```

## Sekmeler

### Pano
Gönderim sağlığı — bugünkü **gönderildi / ulaştı / okundu / yanıt / hata** sayaçları,
teslim ve okunma oranı, son 7 günün mini grafiği, kanal kırılımı (toplu/hatırlatma/belge/
manuel/ekstre/AI) ve anti-ban durumu (ısınma günü, günlük/saatlik tavan doluluk, ban
koruması aktifse uyarı). "Özeti telefonuma gönder" ile günlük özet kendi WhatsApp'ına gider.
Okundu bilgisi karşı taraf kapattıysa gelmez — düşük okunma oranı "okunmadı" anlamına gelmez;
teslim ve yanıt sayıları kesindir.

### Toplu Mesaj
Firma + arama → cari seç → metin (+ opsiyonel görsel/video, `{ad}` `{unvan}` `{firma}` `{kod}`
değişkenleri + `{a|b|c}` spintax varyasyonu) → Gönder. Canlı ilerleme (SSE), durdurma, sonuç logu.

### Belge Mesajları (Otomatik Tahsilat)
`F{firma}D{dönem}TBLCARIHAREKETLERI` tablosu periyodik taranır (varsayılan 30 sn); satış
faturası/irsaliyesi, cari giriş/çıkış (tahsilat/ödeme), alış faturası vb. belge tiplerinden
seçilenler oluştuğunda cariye şablon mesaj gönderilir (`{ad}` `{tutar}` `{kod}` `{evrak}`
`{tarih}` `{bakiye}` `{durum}` `{belge}` `{firmaadi}`).
- Watermark (`data/watcher.json`) kalıcı: uygulama kapalıyken biriken hareketler açılışta
  yakalanır; geçmişe asla mesaj atılmaz.
- Belge tutarı sonradan değişirse "güncellendi" mesajı, silinirse WhatsApp mesajı geri
  çekilir (~2 gün WhatsApp sınırı içinde).
- Alacaklı olduğumuz (net bakiye negatif) cariye asla mesaj atılmaz.

### Çek / Senet / Vadeli Visa (vade takibi)
Portföydeki çek, senet ve vadeli kredi kartı belgelerinin **vadesine kaç gün kala**
haber verileceği seçilir (ör. `7, 3, 1`); eşik dolunca sipariş bildirimi gibi cariye
değil, **girilen sabit numaralara** WhatsApp mesajı gider.
- Vade, belge tablosunda değil ödeme satırındadır: `F{firma}D{dönem}TBLCAR{GIR|CIK}HAREKET.VADE`.
  `GIR` = müşteriden alınan (tahsilat), `CIK` = bizim verdiğimiz (ödeme); "Yön" ayarından seçilir.
- Belge tipi IZAHAT koduyla değil **tablo üyeliğiyle** belirlenir:
  `d.IND = h.BELGELINK AND d.EVRAKNO = h.EVRAKNO` → `TBLCEKGIRIS/CIKIS`,
  `TBLSENETGIRIS/CIKIS`, `TBLVISAGIRIS`, `TBLTAKSITGIRIS`. Dönemde olmayan tablo atlanır.
  Yalnız `BELGELINK` ile eşleştirmek gerçek veride %20 yanlış tip üretiyor — `EVRAKNO` şart.
- Banka adı `h.BANKANO → F{firma}TBLBANKALAR.ADI` ile çözülür (ör. AKBANK); yoksa
  belge tablosundaki şube/keşideci/kart adı kullanılır.
- **Visa varsayılan KAPALI — Vega taksit takvimini bu satırda tutmuyor.** Ölçüm
  (F0101D0017, 2240 satır): peşin çekimde (`TAKSITSAYISI=1`, 1.723 satır) vade =
  işlem + 0–9 gün banka blokajı; taksitli çekimde (517 satır) vade = işlem tarihinin
  aynısı. Yani visa açılırsa gerçek taksit vadesi değil kart çekim/blokaj tarihi
  bildirilir. Açılırsa varsayılan olarak yalnız taksitli işlemler alınır
  (`visaOnlyTaksit`; canlıda 30 günlük pencerede 735 → 190 satır). Çek ve senette
  vade gerçektir. Gerçek taksit takvimi ayrı tabloda (`TBLWSTAKSITLISATIS`,
  IZAHAT=100, taksit başına 1 satır) — bu modülün kapsamında değil.
- Portföydeki müşteri çekinin **cirosu** bilerek kapsam dışı: o çek alınırken zaten
  bildirildi, ciroyu eklemek aynı çeki ikinci kez haber vermek olurdu (~%1 satır).
- Aynı belge + aynı eşik ikinci kez bildirilmez (`data/vade-sent.json`, 120 gün).
  Program kapalıyken eşikler kaçtıysa **tek** mesaj gider (7/3/1 için üç tane değil).
- Birden çok belge aynı anda düşerse tek mesajda toplanır; bildirim saati aralığı
  (varsayılan 09–20) dışında gönderim yapılmaz.
- "Yaklaşan vadeleri göster" düğmesi mesaj göndermeden okunan belgeleri listeler.

### Bakiye Hatırlatma
Seçilen carilere periyodik bakiye hatırlatma mesajı; kendi zamanlayıcısı, son gönderim
tarihini cari bazında tutar, kaldığı yerden devam eder.

### Hesap Extresi
Bakiyeli carileri listeler → seçilen cariye PDF hesap ekstresi üretilip (uygulama içi
`pdfkit` ile, firma logosu/yasal şartla markalı) WhatsApp'tan belge olarak gönderilir.
Giriş şifresiyle kilitlidir (bkz. Erişim kilidi).

### AI Oto-Yanıt
Gelen mesajlara yapay zekâ ile otomatik yanıt. Giriş şifresiyle kilitlidir.

**Kapsam — Sohbet modu (varsayılan AÇIK):** selamlaşmadan bakiye/ödeme sorularına, işletme
hakkındaki genel sorulardan şikâyetlere kadar hemen her mesaja cevap verir. Kapatılırsa eski
dar davranışa döner (yalnız bakiye/ödeme/borç sebebi, gerisi sessiz). Her iki modda da
değişmeyen sert kurallar: **rakam uydurma yok**, **taahhüt yasağı** (fiyat/iskonto/vade/teslimat
sözü verilmez → "yetkilimiz dönüş yapacaktır"), hakarete karşılık verilmez. Hukuki tehdit,
ciddi şikâyet ve anlaşılmaz mesajlarda `[SESSIZ]` → insana bırakılır.
Model ayrıca `[EKSTRE]` (PDF hesap ekstresi) ve `[FATURA]` (son satış faturası kalemleri)
kararı verebilir. Sohbet hafızası gün içinde numara bazında tutulur, gece sıfırlanır.

**Ücretlendirme — iki mod:**

| Mod | Anahtar | Ücret |
|---|---|---|
| **Vega Kontör** (varsayılan) | Yok — anahtar bizde, kontör sunucusunda | **Gönderilen mesaj başına kontör.** Sessiz kalınan / gönderilemeyen cevaptan **düşmez** |
| BYOK (Anthropic / OpenAI / Gemini) | Müşterinin kendi anahtarı, bu makinede şifreli | Kontör harcanmaz; token parasını müşteri kendi öder |

Kontör bakiyesi **sunucuda** tutulur (bu bilgisayarda kurcalanamaz) ve **uzaktan** yüklenir:
müşteri hiçbir şey girmez, dosya yüklemez — yükleme birkaç dakika içinde ekranında görünür.
Kontörlü mod **lisans gerektirir** (imzalı lisans kimlik kanıtıdır); deneme sürümünde kapalıdır.
Kontör sunucusu: [`../vega-kontor/`](../vega-kontor/) (Cloudflare Worker + D1).

### Firma Bilgileri
Firma adı, logo ve yasal şart metni — Hesap Extresi PDF'inin başlık/logo/altbilgisinde kullanılır.

## Lisanslama (çevrimdışı)

Kurulumdan sonra **15 gün ücretsiz deneme**. Sonrasında lisans gerekir. İnternet gerekmez.

| Konu | Davranış |
|---|---|
| Deneme | İlk açılışta başlar, **15 gün**. Başlangıç hem gizli dosyada (`data/ti`) hem `HKCU\Software\ExpertBilisim\VegaWA`'da tutulur; **en eskisi** geçerlidir → AppData'yı silmek, yeniden kurmak veya güncellemek denemeyi **sıfırlamaz** |
| Lisans | RSA-2048 imzalı `.lic` dosyası. İmza gömülü public key ile doğrulanır → sahte lisans üretilemez |
| Donanım bağlama | Lisans `hardwareId` içerir (anakart seri + sistem UUID → SHA-256). Başka bilgisayara kopyalanan lisans **çalışmaz** |
| Saklama | `data/.vglic` — AES-256-GCM, anahtar donanımdan türetilir, dosya gizli (+h) |
| Saat geri-alma | "Son görülen zaman" sentinel'i (dosya + registry, `max()`). Saati geri almak `CLOCK_TAMPERED` ile reddedilir |
| Geçersizken | **Tüm `/api/*` uçları 403**, arka plan otomasyonu (watcher/hatırlatma/aktif cari) durur. UI lisans ekranını gösterir |

Doğrulama kodu: [server/license.js](server/license.js) — `TRIAL_DAYS`, `PRODUCT`, `PUBLIC_KEY` sabitleri.

**Lisans üretimi (satıcı):** ayrı, taşınabilir araç → `../vega-lisans-yonetici/`
Müşteri lisans ekranındaki **Donanım Kimliği**'ni gönderir → araçta kimlik + süre girilir → `.lic` dosyası üretilir → müşteri "Lisans Dosyası Seç" ile yükler.

> `vega-lisans-yonetici/lisans/private.key` bu depoda **değildir** ve olmamalıdır. Sızarsa herkes kendine sınırsız lisans üretir.

## Kontör (kontörlü AI)

AI oto-yanıtın kontörlü modu, model çağrılarını **bizim** Anthropic anahtarımızla karşılayan
bir Cloudflare Worker'a gider: [`../vega-kontor/`](../vega-kontor/). Anahtar müşteriye hiç gitmez.

| Konu | Davranış |
|---|---|
| Kimlik | Ayrı parola/jeton yok — müşterinin **RSA imzalı lisansı** kanıt olarak gönderilir (`license.getLicenseProof`). İmza Worker'da doğrulanır; `payload.hardwareId` hesap anahtarıdır |
| Bakiye | **Sunucuda** tutulur. Yereldeki `data/credits.json` yalnız gösterim önbelleğidir; silinse/değiştirilse kontör kazanılmaz |
| Düşme | `chat` → rezervasyon (düşmez) → WhatsApp gönderimi başarılı → `commit` (**düşer**). Sessiz kalındı / gönderilemedi → `release` (**düşmez**) |
| Bedel | `claude-haiku-4-5` = 1 kontör, `claude-sonnet-5` = 3 kontör (Worker'daki `MODELS` tablosu). Listede olmayan model reddedilir |
| Sömürü freni | Sessiz çağrıların token maliyeti bizde → hesap başına **günlük çağrı tavanı** (varsayılan 300) |
| Kontör bitince | Bot **sessiz kalır** (model bile çağrılmaz), arayüzde uyarı çıkar. Otomasyonun geri kalanı etkilenmez |
| Uzaktan yükleme | `vega-lisans-yonetici` → **Kontör** sekmesi → `POST /admin/topup`. Admin jetonu yalnız satıcı makinesinde durur |

İstemci kodu: [server/credits.js](server/credits.js) — `BUILTIN_ENDPOINT` sabiti Worker
yayınlandıktan sonra güncellenir (kullanıcı UI'dan da girebilir).

## Erişim kilidi

**AI Oto-Yanıt** ve **Hesap Extresi** sekmeleri tek bir giriş şifresiyle korunur (client-side);
**Firma Bilgileri** açıktır. Diğer sekmelerin normal kullanımını etkilemez.

Bu kilit lisanstan **bağımsızdır**: lisans uygulamanın tamamını, erişim kilidi yalnızca bu iki sekmeyi kapsar.

## Bot koruması (anti-ban)

| Katman | Davranış |
|---|---|
| Isınma rampası | Yeni numara 1. gün 20/gün'den başlar, kademeli 200/gün'e çıkar (`WARMUP_RAMP`) |
| Saatlik tavan | Günlük tavanın ~1/3'ü (taze numarada daha sıkı) — günlük hakkı tek saatte boşaltmaz |
| Günlük tavan | Kanal başına ayrı sayılır (toplu/hatırlatma/belge/manuel birbirini yemez); saatlik tavan hesap-geneli ortak |
| Ban devre kesici | Bağlantı 403/401 ile kapanırsa veya kısa sürede çok koparsa (fırtına), hesaba geçici SOĞUMA konur — flaglenen numaraya gönderime devam edip uyarıyı bana çevirmeyi engeller |
| Gecikme / parti molası | 8–22 sn mesaj arası (rastgele), 25'lik partiler arası 60–150 sn mola |
| Metin varyasyonu | `{a|b|c}` spintax — herkese birebir aynı metin gitmez |
| Gönderim penceresi | Otomatik gönderimler yalnız seçili günlerde (varsayılan Pzt–Cmt, Pazar kapalı) ve saat aralığında (varsayılan 10:00–20:00) çalışır; manuel gönderim bu pencereye tabi değil |
| "Yazıyor..." + WA kontrolü | Gönderim öncesi presence simülasyonu; numara WhatsApp'ta değilse atlanır |

> **Uyarı:** Toplu mesaj WhatsApp ToS'a aykırı olabilir; ban riski vardır. Numarayı ısıtın,
> onaylı kişilere gönderin. **Pano** sekmesinden gerçek teslim/okunma/ban durumunu izleyin.

## Kurulum dosyası + otomatik güncelleme

- `build.bat` → `dist\Vega WhatsApp Setup x.y.z.exe` (NSIS, yayınlamaz).
- `release.bat` → sürümü artırır (varsayılan patch), derler ve
  [vega-whatsapp-releases](https://github.com/saidbayraqtars/vega-whatsapp-releases)
  deposuna yayınlar. GH token'ı git credential manager'dan otomatik alınır.
- Kurulu uygulamalar açılışta + 4 saatte bir yeni sürüm denetler (electron-updater),
  indirir; tray balonu/menüsünden hemen veya uygulama kapanışında sessiz kurulur.
- Sidebar'daki sürüm etiketi kök `package.json`'dan çalışma anında okunur (`/api/check-setup`
  → `version`) — elle güncellenmez, release'te otomatik doğru gelir.
- Kaynak kod: [vega-whatsapp](https://github.com/saidbayraqtars/vega-whatsapp) (private).
  `config.json` ve `data/` gitignore'da — asla commit edilmez.

## Teknik

- Port `3100`; Express sunucu + watcher/reminders/aiBot/antiban/stats, Electron main process
  içinde aynı process'te çalışır.
- Veriler: `%APPDATA%\vega-whatsapp-desktop\` (Electron userData) — `config.json`,
  `data/baileys-auth`, `data/watcher.json`, `data/antiban.json`, `data/stats.json`,
  `data/reminders-log.json`, `data/aibot-state.json`, `data/vade.json` +
  `data/vade-sent.json`. Geliştirmede `server/data/` altı.
- Telefon normalizasyonu TR odaklı (`server/phone.js`): `0xxx`/`5xxx` → `90...`,
  `905xxxxxxxxx` regex'i geçenler "geçerli" sayılır.
