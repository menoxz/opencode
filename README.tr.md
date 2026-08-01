<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode fork logosu">
    </picture>
  </a>
</p>
<p align="center">Açık kaynaklı yapay zeka kodlama asistanı — topluluk fork'u.

> **Fork bildirimi** — bu depo (`menoxz/opencode`), ek özelliklere sahip (MCP
> auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt)
> [resmi opencode](https://github.com/anomalyco/opencode)'un bir topluluk fork'udur.
> Resmi opencode ekibiyle **ilişkili değildir**.
> **Fork farklılıklarını görün →**</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@lux-tech/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/%40lux-tech%2Fopencode-ai?style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/typecheck.yml"><img alt="Typecheck" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/typecheck.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/eval.yml"><img alt="Eval" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/eval.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/blob/dev/LICENSE"><img alt="License" src="https://img.shields.io/github/license/menoxz/opencode?style=flat-square" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode terminal arayüzü](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Kurulum (fork)

Fork, `@lux-tech` kapsamında npm üzerinde yayınlanır ve komutunu **`opencodev2`** olarak
kurar — resmi `opencode` (`opencode-ai` ile kurulan) ile **birlikte kullanılabilen** ayrı
bir ikili dosya. Ayrıca kendi veri/yapılandırma dizinlerini kullanır
(`~/.local/share/opencodev2`, `~/.config/opencodev2`), böylece iki ürün birbirinin
verisine dokunmadan yan yana çalışabilir. İlk etkileşimli başlatmada fork, mevcut
opencode yapılandırmanızı, API anahtarlarınızı ve oturum geçmişinizi içe aktarmayı
önerir — orijinal kuruluma dokunulmaz. **resmi opencode ile birlikte kullanım** hakkında
bilgi edinin.

### Önerilen: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Doğrulama:

```bash
opencodev2 --version
# 1.18.59 (veya yayınlanan en son sürüm)
```

Meta paket `@lux-tech/opencode-ai`, 12 isteğe bağlı bağımlılığından birinden doğru
platform ikili dosyasını otomatik olarak indirir (bkz. **platform ikili dosyaları
tablosu**) ve onu `opencodev2` komutu olarak kullanıma sunar.

### Alternatif: GitHub Releases (manuel)

Sürüm arşivleri [sürümler sayfasında](https://github.com/menoxz/opencode/releases)
`.tar.gz` (Linux) ve `.zip` (macOS / Windows) olarak yayınlanır. Her arşiv kökünde
derlenmiş CLI ikili dosyasını içerir — manuel kurulumda onu `opencodev2` olarak
yeniden adlandırın ki resmi `opencode` ikili dosyasıyla asla çakışmasın.

```bash
# Örnek: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # ayrı ad, resmi ikili dosyayla çakışma yok
```

```powershell
# Örnek: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### İkili dosya konumu

| Kurulum yöntemi | İkili dosya yolu |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub release (manuel) | nereye yerleştirdiyseniz orası |

### Güncelleme

```bash
# Yerleşik güncelleyici (en son @lux-tech/opencode-ai sürümünü getirir)
opencodev2 upgrade

# Veya npm üzerinden
npm update -g @lux-tech/opencode-ai
```

### Kaldırma

```bash
npm uninstall -g @lux-tech/opencode-ai
```

Windows'ta, npm arkasında bıraktıysa eski shim'i de kaldırın:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Resmi opencode ile birlikte kullanım

Fork (`@lux-tech/opencode-ai`) komutunu **`opencodev2`** olarak kurar, resmi opencode
(`opencode-ai`) ise `opencode` kurar. İki ad asla çakışmaz ve fork kendi veri
dizinlerini kullanır (`~/.local/share/opencodev2`, `~/.config/opencodev2`,
`~/.local/state/opencodev2`, `~/.cache/opencodev2`), bu yüzden **ikisi aynı anda
kurulup kullanılabilir**.

### İlk çalıştırmada geçiş sihirbazı

İlk etkileşimli başlatmada `opencodev2`, önceki bir opencode kurulumunun (yapılandırma,
API anahtarları, oturumlar) olup olmadığını algılar ve ne yapılacağını sorar:

- **İçe aktar (önerilir)** — yapılandırmanızı, kimlik bilgilerinizi (`auth.json`) ve
  oturum geçmişinizi (`opencode.db`) orijinal opencode dizinlerinden opencodev2
  dizinlerine kopyalar. Orijinal veriye dokunulmaz.
- **Sonra** — boş olarak başlar ve bir sonraki başlatmada tekrar sorar.
- **Asla** — boş opencodev2 verisiyle başlar (bir işaret dosyası sonraki soruları engeller).

Başsız ortamlar (CI, komut dosyaları) davranışı zorlayabilir:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # etkileşimsiz içe aktar
OPENCODEV2_MIGRATE=skip opencodev2 ...   # atla ve karar verilmiş olarak işaretle
```

Sihirbaz veri dizini başına yalnızca bir kez çalışır (`.migrate-state` işaret dosyası
kararı kaydeder). İçe aktarmadan sonra kopyalanan veritabanı opencodev2'ye aittir —
sonraki opencodev2 veritabanı geçişleri asla orijinal opencode kurulumuna dokunmaz.

### Hangisini kullanmalısınız?

| İhtiyaç | Kullan |
|---|---|
| Otomatik yeniden bağlanan MCP sunucuları, hot reload, eval pipeline, memory consolidation, unified prompt | **Bu fork** (`opencodev2`) |
| Resmi, geniş çapta doğrulanmış sürüm | [resmi opencode](https://github.com/anomalyco/opencode) (`opencode`) |

Her ikisi de bağımsız olarak güncel kalır:

```bash
opencodev2 upgrade        # fork'u günceller (@lux-tech/opencode-ai)
opencode upgrade          # resmi opencode'u günceller (opencode-ai)
```

---

## Platform ikili dosyaları

`@lux-tech/opencode-ai`, 12 isteğe bağlı platform ikili dosyasına sahip bir meta paket
olarak sunulur (hepsi aynı sürümde yayınlanır):

| Paket | Platform / CPU | Notlar |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | AVX2 olmayan CPU'lar |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | AVX2 olmayan CPU'lar |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, AVX2 yok |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | AVX2 olmayan CPU'lar |

---

## Ajanlar

OpenCode, `Tab` tuşuyla aralarında geçiş yapabileceğiniz iki yerleşik ajan içerir.

- **build** - Varsayılan, geliştirme çalışmaları için tam erişimli ajan
- **plan** - Analiz ve kod keşfi için salt okunur ajan
  - Varsayılan olarak dosya düzenlemelerini reddeder
  - Bash komutlarını çalıştırmadan önce izin ister
  - Tanımadığınız kod tabanlarını keşfetmek veya değişiklikleri planlamak için ideal

Ayrıca, karmaşık aramalar ve çok adımlı görevler için bir **general** alt ajanı
bulunmaktadır. Bu dahili olarak kullanılır ve mesajlarda `@general` ile çağrılabilir.

Fork ayrıca, görevleri yürütmeden önce otomatik olarak parçalara ayıran bir **planner**
ajanı sunar. [Resmi dokümantasyondaki ajanlar](https://opencode.ai/docs/agents)
hakkında daha fazla bilgi edinin — davranış upstream ile uyumludur.

---

## Dokümantasyon

- **Fork'a özel dokümantasyon** bu depoda bulunur: [`docs/`](./docs) (mimari, ADR'ler,
  hot reload ve MCP tasarımı) ve [`CHANGELOG.md`](./CHANGELOG.md).
- **Genel yapılandırma dokümantasyonu** resmi dokümantasyonla uyumludur:
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Fork Farklılıkları

Bu fork (`menoxz/opencode`), upstream'in üzerine aşağıdaki özellikleri ekler:

| Özellik | Açıklama |
|---------|-------------|
| **MCP Auto-reconnect** | Bağlantısı kopan MCP sunucuları algılanır (transport olayları + sağlık ping'i) ve üstel geri çekilme ile otomatik olarak yeniden bağlanır — bayat "connected" durumu veya ölü oturum yok |
| **Hot Reload** | Ajanlar, eklentiler ve MCP sunucuları dosya değişikliklerinde otomatik olarak yeniden yüklenir — yeniden başlatma gerekmez |
| **Eval Pipeline** | Regresyon tespiti, trend analizi ve compare CLI komutlarıyla SQLite tabanlı değerlendirme |
| **Memory Consolidation** | Otomatik sönümleme, desen tespiti ve post-mortem analizi ile oturumlar arası bellek |
| **Unified Prompt** | Tek bir `core.txt`, 10 modele özel prompt'un yerini alır — daha temiz, daha küçük, bakımı daha kolay |
| **Continuous Improvement** | Yöntemler yaşayan belgelerdir — kopya oluşturmak yerine mevcut skill'leri changelog ile güncelleyin |
| **Planner Integration** | Yerleşik `planner` ajanı, görevleri yürütmeden önce otomatik olarak parçalara ayırır |
| **opencodev2 kimliği + geçiş** | `opencodev2` olarak kurulur ve kendi veri dizinleriyle resmi opencode ile birlikte çalışır; ilk çalıştırma sihirbazı yapılandırmanızı, API anahtarlarınızı ve oturum geçmişinizi isteğe bağlı içe aktarır |

Yeni özellikler [`CHANGELOG.md`](./CHANGELOG.md) içinde sürümlenir.

---

## Katkıda Bulunma

Bu fork'a katkıda bulunmak istiyorsanız, bir pull request göndermeden önce lütfen
[katkıda bulunma dokümanlarımızı](./CONTRIBUTING.md) okuyun.
Pull request'ler `dev` dalını hedefler.

---

## OpenCode Üzerine Geliştirme

OpenCode ile ilgili bir proje üzerinde çalışıyorsanız ve projenizin adının bir parçası
olarak "opencode" kullanıyorsanız (örneğin "opencode-dashboard" veya "opencode-mobile"),
lütfen README dosyanıza, projenin OpenCode ekibi tarafından geliştirilmediğini ve
bizimle hiçbir şekilde bağlantılı olmadığını belirten bir not ekleyin.

---

**Sorun bildirin** [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Kaynak** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
