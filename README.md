# Vega WhatsApp

VegaDB (SQL Server) carilerine **toplu WhatsApp mesajı** gönderen ve cari hareketleri izleyip
**tahsilat alındığında otomatik bildirim** atan Windows masaüstü uygulaması (Electron).

- **WhatsApp:** Baileys (WebSocket — chromium gerekmez). QR ile bağlanır, oturum kalıcıdır.
- **Veritabanı:** `F{firma}TBLCARI` cari + telefon sütunları otomatik tespit edilir
  (TELEFON1/2/3, YGSM, YTELEFON1/2 — KEFIL/FAKS/MODEM hariç).
- **Masaüstü:** Pencere kapatılınca tray'e gizlenir, izleme durmaz. Windows açılışında
  otomatik başlar; PIN, DPAPI (safeStorage) ile şifreli saklanıp açılışta otomatik bağlanır.
- **Güncelleme:** GitHub Releases üzerinden otomatik (aşağıya bakın).

## Çalıştırma (geliştirme)

`start.bat` çift tıkla — ilk açılışta bağımlılıkları kurar, Electron penceresi açılır.

```bash
npm install && cd server && npm install && cd ..
npm start
```

## Sekmeler

### Toplu Mesaj
Firma + arama → cari seç → metin (+ opsiyonel görsel/video, `{ad}` `{unvan}` `{kod}`
değişkenleri) → Gönder. Canlı ilerleme (SSE), durdurma, sonuç logu.

### Otomatik Tahsilat
`F{firma}D{dönem}TBLCARIHAREKETLERI` tablosu periyodik taranır (varsayılan 30 sn);
yeni **ALACAK** girişi (devir 103/104 hariç) bulununca cariye şablon mesaj gönderilir
(`{ad}` `{tutar}` `{kod}` `{evrak}` `{tarih}` `{bakiye}`).
- Watermark (`data/watcher-state.json`) kalıcı: uygulama kapalıyken biriken ödemeler
  açılışta yakalanır; geçmişe asla mesaj atılmaz (ilk çalıştırmada watermark = MAX(IND)).
- WhatsApp kapalıysa watermark ilerletilmez — bağlanınca kaldığı yerden dener.
- IZAHAT kodları boş = tüm tahsilatlar; "Bu dönemdeki kodları göster" ile canlı dağılım.

## Bot koruması (anti-ban)

| Ayar | Varsayılan | Açıklama |
|------|-----------|----------|
| Gecikme | 8–22 sn (rastgele) | Her mesaj arası |
| Parti boyutu / molası | 25 / 60–150 sn | Parti sonrası uzun bekleme |
| Günlük tavan | 200 | **Hesap bazlı ve kalıcı** — aynı gün tüm gönderimler sayılır (`data/wa-stats.json`) |
| "Yazıyor..." | açık | Gönderim öncesi presence |
| WA kontrolü | açık | Numara WhatsApp'ta değilse atlar |

> **Uyarı:** Toplu mesaj WhatsApp ToS'a aykırı olabilir; ban riski vardır. Numarayı ısıtın,
> onaylı kişilere gönderin.

## Kurulum dosyası + otomatik güncelleme

- `build.bat` → `dist\Vega WhatsApp Setup x.y.z.exe` (NSIS, yayınlamaz).
- `release.bat` → sürümü artırır (varsayılan patch), derler ve
  [vega-whatsapp-releases](https://github.com/saidbayraqtars/vega-whatsapp-releases)
  deposuna yayınlar. GH token'ı git credential manager'dan otomatik alınır.
- Kurulu uygulamalar açılışta + 4 saatte bir yeni sürüm denetler (electron-updater),
  indirir; tray balonu/menüsünden hemen veya uygulama kapanışında sessiz kurulur.
- Kaynak kod: [vega-whatsapp](https://github.com/saidbayraqtars/vega-whatsapp) (private).
  `config.json` ve `data/` gitignore'da — asla commit edilmez.

## Teknik

- Port `3100`; Express sunucu + watcher, Electron main process içinde çalışır.
- Veriler: `%APPDATA%\vega-whatsapp-desktop\` (Electron userData) — `config.json`,
  `data/baileys-auth`, `data/watcher*.json`, `data/wa-stats.json`. Geliştirmede `server/` altı.
- Telefon normalizasyonu TR odaklı (`server/phone.js`): `0xxx`/`5xxx` → `90...`,
  `905xxxxxxxxx` regex'i geçenler "geçerli" sayılır.
