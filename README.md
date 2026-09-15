# Vega WhatsApp — Expert Bilişim WhatsApp Tahsilat

Vega ERP (SQL Server) kullanan işletmeler için Windows masaüstü uygulaması. Vega'da oluşan
belgeleri izler ve cariye otomatik WhatsApp mesajı gönderir; bakiye hatırlatması, PDF hesap
ekstresi, çek/senet vade bildirimi, sipariş bildirimi, toplu mesaj ve gelen mesajlara otomatik
cevap sunar.

| | |
|---|---|
| **Masaüstü** | Electron. Pencere kapatılınca tray'e iner, otomasyon durmaz; Windows açılışında başlar |
| **Sunucu** | Express (port `3100`), Electron ana süreci içinde çalışır |
| **WhatsApp** | Varsayılan Baileys (QR ile). İsteğe bağlı: ikinci PC (relay) veya Meta resmî Cloud API |
| **Veritabanı** | Vega `VEGADB` — `F{firma}TBLCARI`, `F{firma}D{dönem}TBL...` tabloları salt okunur |
| **Arayüz** | `server/public/` — vanilla HTML/CSS/JS, açık/gece tema |
| **Güncelleme** | GitHub Releases üzerinden otomatik ve zorunlu |

---

## İçindekiler

- [Ekranlar](#ekranlar)
- [WhatsApp bağlantı modları](#whatsapp-bağlantı-modları)
- [Çek / senet vade takibi](#çek--senet-vade-takibi)
- [Lisans, kontör, erişim kilidi](#lisans-kontör-erişim-kilidi)
- [Ban koruması](#ban-koruması)
- [Geliştirme](#geliştirme)
- [Yayın ve otomatik güncelleme](#yayın-ve-otomatik-güncelleme)
- [Veri dosyaları](#veri-dosyaları)

---

## Ekranlar

Arayüz sade tutulur: her otomatik mesaj tek satırdır, ayarları satıra tıklayınca açılır.
Mesaj taslakları `{firma}` gibi kodlar ezberlenmeden yazılır — **"Müşteri adı", "Tutar"**
gibi etiketlere tıklanır, hazır metin seçilebilir ve altta **"Müşteri böyle görecek"**
balonunda örnek verilerle önizlenir.

### Belge Mesajları (açılış ekranı)

**Müşteriye giden mesajlar** — Vega'da belge oluşunca cariye mesaj gider.

- **+ Mesaj ekle** henüz eklenmemiş türleri listeler: satış faturası, satış irsaliyesi,
  stok çıkışı, tahsilat/havale, tedarikçiye ödeme, alış faturası, stok girişi, özel kural (IZAHAT kodu).
- `F{firma}D{dönem}TBLCARIHAREKETLERI` periyodik taranır (varsayılan 30 sn). Watermark kalıcıdır:
  uygulama kapalıyken oluşan belgeler açılışta yakalanır, geçmişe mesaj atılmaz.
- Belge tutarı sonradan değişirse "güncellendi" mesajı gider; belge silinirse WhatsApp mesajı
  geri çekilir (WhatsApp'ın ~2 gün sınırı içinde).
- Belge kimliği `tür + cari + tarih + EVRAKNO`'dur — EVRAKNO tek başına tekil değildir.
- Kimlere gideceği (müşteri/tedarikçi), yalnız "SMS Gönder" izinliler, alacaklı carilere
  gönderim "Diğer ayarlar" altındadır.

**Bana gelen bildirimler** — cariye değil, girilen sabit numaralara gider.

- **Sipariş gelince haber ver** — sipariş fişi cari harekete yazmadığı için ayrı sipariş tablosu
  taranır; kalemler ve iptal bildirimi isteğe bağlı.
- **Çek / senet vadesi yaklaşınca haber ver** — ayrıntı: [Çek / senet vade takibi](#çek--senet-vade-takibi).

### Bakiye Hatırlatma

Borçlu carilere seçilen gün aralığı ve saatte hatırlatma. **Kime gidecek?** göndermeden
listeyi (bakiye, telefon, atlanma sebebi) gösterir; **Şimdi gönder** bir kez çalıştırır.
Son gönderim cari bazında tutulur, kaldığı yerden devam eder.

### Toplu Mesaj

Firma + arama → cari seç → metin (+ isteğe bağlı görsel/video) → Gönder. Canlı ilerleme,
durdurma, sonuç kaydı. `{a|b|c}` spintax desteklenir.

**DUR listesi:** müşteri tek kelime **DUR** yazarsa toplu mesaj listesinden çıkar, **BAŞLA**
yazarsa geri döner (`server/optout.js`). Mesaj sonuna "almak istemiyorsanız DUR yazın"
cümlesi eklenebilir. DUR/BAŞLA mesajları AI cevaba gitmez.

### Hesap Extresi

Bakiyeli carileri listeler; seçilen cariye firma logosu ve yasal metinle markalı PDF ekstre
(`pdfkit`) üretilip WhatsApp'tan gönderilir. Giriş şifresiyle kilitlidir.

### AI Oto-Yanıt

Gelen mesajlara otomatik cevap. Giriş şifresiyle kilitlidir. İki mod:

| Mod | Davranış |
|---|---|
| **Nöbetçi** (önerilen) | Model çağrılmaz. Numara başına tek "mesajınızı aldık" cevabı + ekibe iç bildirim. Kontör harcamaz |
| **Yapay zekâ** | Model müşteriyle konuşur. Rakam uydurma ve taahhüt (fiyat/vade/iskonto sözü) yasak; hukuki tehdit ve ciddi şikâyette sessiz kalıp insana bırakır. `[EKSTRE]` / `[FATURA]` kararı verebilir |

Sağlayıcı: **Vega Kontör** (anahtar bizde, gönderilen cevap başına kontör) veya kendi anahtarı
ile Anthropic / OpenAI / Gemini.

### Firma Bilgileri

Firma adı, iletişim, vergi bilgileri, logo ve yasal metin — ekstre PDF'inin başlık ve
altbilgisinde kullanılır. Vega'dan otomatik dolar, düzeltilebilir.

### Ayarlar

Açılır-kapanır bölümler: firma ve dönem · gönderim saatleri ve günleri · ban koruması ·
WhatsApp bağlantı modu · veritabanı bağlantısı · lisans ve sıfırlama.

---

## WhatsApp bağlantı modları

Ayarlar → **WhatsApp bağlantı modu** (`config.json → wa.mode`). Tüm gönderimler
`server.js`'teki `waSendX / waCheckX / waStatusX / waDeleteX` sarmalayıcılarından geçer;
yeni bir gönderim yolu eklenirse ham fonksiyon değil bunlar kullanılmalıdır.

| Mod | Ne zaman | Notlar |
|---|---|---|
| **Yerel** (varsayılan) | Tek bilgisayar | Baileys, QR ile. **Çok numara:** 2–4 telefon aynı anda okutulur; her numaranın kendi ısınma ve günlük tavanı vardır, müşteriye hep aynı numaradan yazılır |
| **İkinci bilgisayar (relay)** | İki PC aynı numarayı kullanıyorsa | İkinci PC WhatsApp açmaz, gönderimi LAN'dan ana PC'ye (`:3100`) yollar; otomasyon (belge/hatırlatma/vade) yalnız ana PC'de çalışır. İki PC'de aynı ortak parola |
| **Meta resmî (Cloud API)** | Hesap kapanma riskini sıfırlamak için | Mesaj başına ücret. Müşteri son 24 saatte yazmadıysa Meta onaylı taslak kullanılır. Varsayılan yol Expert Bilişim sunucusu (`vega-kontor` Worker) — bu bilgisayarda Meta anahtarı tutulmaz |

**Cloud API ayrıntıları**

- Numara bağlama tarayıcıda Meta girişiyle yapılır ("Numarayı Meta'ya bağla").
- **Mesaj taslakları:** "Taslakları onaya gönder" her mesaj türü için standart taslağı Meta
  onayına yollar (belge, hatırlatma, vade, sipariş, ekstre, e-Fatura, toplu duyuru). Müşteri
  yalnız sade durumu görür (Onaylandı / Onay bekliyor / Reddedildi); onay takibi Expert Bilişim'dedir.
- Gelen mesajlar ve teslim/okundu bilgisi sunucudan 15 sn'de bir çekilir; 10 dakikadan eski
  mesaja AI cevap yazmaz.
- Cloud API'de gönderilen mesaj geri çekilemez; ısınma rampası ve saatlik tavan uygulanmaz.

---

## Çek / senet vade takibi

Çek ve senedin vadesine **kaç gün kala** (ör. `3, 0` — 0 = vade günü) girilen numaralara
bildirim gider. Kod: `server/vade.js`.

**Veri nerede**

- Vade belge tablosunda değil, cari fişinin ödeme satırındadır:
  `F{firma}D{dönem}TBLCAR{GIR|CIK}HAREKET.VADE` (`GIR` = müşteriden alınan, `CIK` = bizim verdiğimiz).
- Belge tipi tablo üyeliğiyle bulunur: `d.IND = h.BELGELINK AND d.EVRAKNO = h.EVRAKNO`
  → `TBLCEKGIRIS/CIKIS`, `TBLSENETGIRIS/CIKIS`, `TBLTAKSITGIRIS`. Yalnız `BELGELINK` ile
  eşleştirmek gerçek veride ~%17 yanlış tip üretir. Dönemde olmayan tablo atlanır.
- Banka adı `h.BANKANO → F{firma}TBLBANKALAR.ADI`.

**Aynı belge iki kez gitmesin**

- Gönderilenler defteri (`data/vade-sent.json`, 120 gün) belgeyi **doğal kimliğiyle** tanır:
  `firma + yön + tip + cari + belge no + vade tarihi + eşik`. Vega fişi düzenleyince satır
  numaraları değişir; kimlik değişmez. Vade tarihi değişirse yeni tarihle bir kez daha haber verilir.
- Firma/dönem seçimi değişince defter silinmez.
- Program kapalıyken birden çok eşik kaçtıysa tek mesaj gider. Aynı taramada birden çok
  belge çıkarsa tek mesajda toplanır. Bildirim saati aralığı varsayılan 09–20.

**Tarih**

- `VADE` SQL'de `CONVERT(char(10), VADE, 23)` ile metin olarak okunur, parametreler de metin
  gider. Sürücü DATETIME'ı UTC sandığı için saatli vadeler aksi halde bir gün kayıyordu.

**Bilerek kapsam dışı**

- **Visa / kredi kartı:** Vega bu satırda taksit vadesini tutmaz (peşinde banka blokaj günü,
  taksitlide işlem günü). Yanlış tarihli bildirim üretmemesi için ayarda açık olsa bile taranmaz.
  Gerçek taksit takvimi `TBLWSTAKSITLISATIS`'tedir.
- Ciro edilen müşteri çeki: alınırken zaten bildirilmiştir.

---

## Lisans, kontör, erişim kilidi

**Lisans (çevrimdışı)** — kod: `server/license.js`

| Konu | Davranış |
|---|---|
| Deneme | İlk açılışta **15 gün**. Başlangıç hem gizli dosyada hem registry'de tutulur, en eskisi geçerli — yeniden kurmak sıfırlamaz |
| Lisans | RSA-2048 imzalı `.lic`, donanım kimliğine bağlı; başka bilgisayarda çalışmaz |
| Saat geri alma | "Son görülen zaman" ile reddedilir |
| Geçersizken | Tüm `/api/*` uçları 403, arka plan otomasyonu durur |

Lisans üretimi ayrı araçla yapılır: `../vega-lisans-yonetici/` (bulut: `vega-panel`).
Özel anahtar bu depoda **yoktur** ve olmamalıdır.

**Kontör** — AI cevapları ve Cloud API mesaj ücretleri `../vega-kontor/` Cloudflare Worker'ında
tutulan bakiyeden düşer. Kimlik = imzalı lisans. Bakiye sunucudadır, uzaktan yüklenir;
gönderilemeyen/sessiz kalınan cevaptan düşmez.

**Erişim kilidi** — AI Oto-Yanıt ve Hesap Extresi tek giriş şifresiyle açılır (istemci tarafı);
lisanstan bağımsızdır.

---

## Ban koruması

Yalnız **Yerel** modda (Baileys) uygulanır. Kod: `server/antiban.js`.

| Katman | Davranış |
|---|---|
| Isınma rampası | Yeni numara 20/gün'den başlar, kademeli olarak ~200/gün'e çıkar |
| Saatlik / günlük tavan | Numara başına; günlük tavan kanal başına ayrı sayılır |
| Devre kesici | 403 bağlantı kapanması gerçek ban sinyalidir → sürekli soğuma |
| Cevapsız numara | Üst üste cevap vermeyen numaraya otomatik gönderim durur |
| Gecikme | Mesaj arası 8–22 sn, 25'lik partiler arası 60–150 sn mola, "yazıyor…" |
| Gönderim penceresi | Otomatik mesajlar seçili gün ve saatlerde (varsayılan Pzt–Cmt 10:00–20:00) |

> **Uyarı:** Resmî olmayan istemciyle rızasız ticari mesaj numaranın kapanmasına yol açabilir.
> Ban sebebi çoğunlukla hacim değil rıza ve ilk temastır. Riski sıfırlamak için Cloud API modu.

---

## Geliştirme

```bash
npm install
cd server && npm install && cd ..
npm start            # veya start.bat
```

Gerçek çalıştırma VEGADB'ye bağlanır ve bu bilgisayarın WhatsApp oturumunu açar. Numara
başka bir PC'de açıksa çakışma olur (cihaz fırtınası ban sinyalidir).

**Arayüzü yan etkisiz denemek:** `/api/*` isteklerine sabit JSON dönen küçük bir express
sunucusu ile `server/public/` servis edilip tarayıcıda açılabilir; ekran görüntüsü için
`env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron.exe <betik>` ve
`webContents.capturePage()` kullanılır.

**Arayüz sözleşmesi:** `app.js` DOM'u kimlik (`$('id')`) ve yük taşıyan class'larla sürer
(`hidden`, `dot on/wait/off`, `tab/active/data-view`, `rule-card`, `acc-item/open`, `logline`,
`st`, `chip` …). Görünüm değiştirirken bunlar korunmalı; her `$('id')` `index.html`'de bulunmalı.

**Klasörler**

```
electron/            ana süreç, tray, güncelleme penceresi
server/
  server.js          Express + tüm uçlar + gönderim sarmalayıcıları
  watcher.js         belge mesajları
  reminders.js       bakiye hatırlatma
  vade.js            çek / senet vade bildirimi
  siparis.js         sipariş bildirimi
  extre.js           PDF hesap ekstresi
  aiBot.js           AI oto-yanıt
  whatsapp.js        Baileys oturumu · accounts.js çok numara havuzu
  cloudapi.js        Meta Cloud API · cloudinbox.js gelen kutusu
  antiban.js         ban koruması · stats.js gönderim sayaçları · optout.js DUR listesi
  license.js         lisans · credits.js kontör
  public/            arayüz (index.html, style.css, app.js, float.html)
scripts/release.js   yayın betiği
```

---

## Yayın ve otomatik güncelleme

- `build.bat` → `dist\Vega WhatsApp Setup x.y.z.exe` (yayınlamaz).
- `release.bat [patch|minor|major]` → sürümü artırır, derler ve
  [vega-whatsapp-releases](https://github.com/saidbayraqtars/vega-whatsapp-releases)
  deposuna yükler. GitHub jetonu git credential manager'dan alınır.
- Kurulu uygulamalar açılışta ve 4 saatte bir denetler, indirir.
- **Güncelleme zorunludur:** indirme bitince 10 dakikalık geri sayım, sonra otomatik kurulum.
  Toplu gönderim sürüyorsa (`GET /api/busy`) en fazla 3 saat ertelenir.
- Sidebar'daki sürüm `package.json`'dan çalışma anında okunur.

---

## Veri dosyaları

Kurulu uygulamada `%APPDATA%\vega-whatsapp-desktop\`, geliştirmede `server/` altında.
`config.json` ve `data/` **asla commit edilmez** (şifreli DB parolası, WhatsApp oturumu).

| Dosya | İçerik |
|---|---|
| `config.json` | DB bağlantısı (şifreli), WhatsApp modu, bağlam |
| `data/baileys-auth/` | WhatsApp oturumu |
| `data/watcher.json` | belge mesajı kuralları + watermark |
| `data/vade.json`, `vade-sent.json`, `vade-pending.json` | vade ayarı, gönderilenler defteri, bekleyen kuyruk |
| `data/antiban.json`, `data/stats.json` | ban koruması sayaçları, gönderim istatistikleri |
| `data/optout.json` | DUR listesi |
| `data/reminders-log.json`, `data/aibot-state.json` | hatırlatma kaydı, AI sohbet durumu |
