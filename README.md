# Vega WhatsApp

İki ayrı sürüm, iki ayrı klasör:

| Klasör | Hedef Windows | Electron | Güncelleme deposu |
|---|---|---|---|
| [`guncel/`](guncel/) | Windows 10 / 11, Server 2016+ | 33 | [vega-whatsapp-releases](https://github.com/saidbayraqtars/vega-whatsapp-releases) |
| [`legacy/`](legacy/) | Windows 7 SP1, Server 2008 R2 SP1, Server 2012 / 2012 R2 | 22.3.27 | [vega-whatsapp-legacy-releases](https://github.com/saidbayraqtars/vega-whatsapp-legacy-releases) |

Özellik kodu (sunucu, arayüz, entegrasyonlar) iki klasörde aynıdır; bir düzeltme ya da özellik
**iki klasöre de** uygulanmalıdır. Legacy'nin farkları `legacy/README.md` başında listelidir.

Her klasör kendi başına bir projedir: kendi `package.json`, `node_modules`, `start.bat`,
`build.bat`, `release.bat` dosyaları vardır. Sürüm yayınlamak için ilgili klasörde `release.bat`.
