<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Логотип OpenCode fork">
    </picture>
  </a>
</p>
<p align="center">AI-агент для програмування з відкритим кодом — спільнотовий форк.

> **Повідомлення про форк** — цей репозиторій (`menoxz/opencode`) — спільнотовий
> форк [офіційного opencode](https://github.com/anomalyco/opencode) з додатковими
> функціями (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation,
> unified prompt). Він **не пов'язаний** з офіційною командою opencode.
> **Перегляньте відмінності форку →**</p>
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

[![Термінальний інтерфейс OpenCode](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Встановлення (fork)

Форк публікується на npm у скоупі `@lux-tech` і встановлює свою команду як
**`opencodev2`** — окремий бінарний файл, який **співіснує** з офіційним
`opencode` (встановлюється з `opencode-ai`). Він також використовує власні
каталоги даних і конфігурації (`~/.local/share/opencodev2`,
`~/.config/opencodev2`), тому обидва продукти можуть працювати поруч, не
зачіпаючи дані один одного. Під час першого інтерактивного запуску форк пропонує
імпортувати вашу наявну конфігурацію opencode, ключі API та історію сесій —
оригінальна інсталяція залишається недоторканою. Див.
[співіснування з офіційним opencode](#співіснування-з-офіційним-opencode).

### Рекомендовано: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Перевірка:

```bash
opencodev2 --version
# 1.18.59 (або остання опублікована версія)
```

Метапакет `@lux-tech/opencode-ai` автоматично завантажує правильний бінарний файл
платформи з однієї зі своїх 12 опціональних залежностей (див. **таблицю бінарних
файлів платформ**) і надає його як команду `opencodev2`.

### Альтернатива: GitHub Releases (вручну)

Архіви релізів публікуються на [сторінці релізів](https://github.com/menoxz/opencode/releases)
у вигляді `.tar.gz` (Linux) і `.zip` (macOS / Windows). Кожен архів містить
скомпільований CLI-бінарний файл у своєму корені — перейменуйте його на
`opencodev2` під час ручної інсталяції, щоб він ніколи не конфліктував з
офіційним бінарним файлом `opencode`.

```bash
# Приклад: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # окрема назва, без конфлікту з офіційним бінарним файлом
```

```powershell
# Приклад: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Розташування бінарного файлу

| Метод встановлення | Шлях до бінарного файлу |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub release (вручну) | де ви його розмістили |

### Оновлення

```bash
# Вбудований оновлювач (завантажує останній реліз @lux-tech/opencode-ai)
opencodev2 upgrade

# Або через npm
npm update -g @lux-tech/opencode-ai
```

### Видалення

```bash
npm uninstall -g @lux-tech/opencode-ai
```

У Windows також видаліть застарілий shim, якщо npm його залишив:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Співіснування з офіційним opencode

Форк (`@lux-tech/opencode-ai`) встановлює свою команду як **`opencodev2`**, а
офіційний opencode (`opencode-ai`) встановлює `opencode`. Ці дві назви ніколи не
конфліктують, і форк використовує власні каталоги даних
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), тому **обидва можуть бути встановлені й використовуватися
одночасно**.

### Майстер міграції під час першого запуску

Під час першого інтерактивного запуску `opencodev2` визначає, чи існує попередня
інсталяція opencode (конфігурація, ключі API, сесії), і запитує, що робити:

- **Import (рекомендовано)** — копіює вашу конфігурацію, облікові дані
  (`auth.json`) та історію сесій (`opencode.db`) з оригінальних каталогів opencode
  у каталоги opencodev2. Оригінальні дані залишаються недоторканими.
- **Later** — починає з чистого аркуша й запитає знову під час наступного запуску.
- **Never** — починає з порожніми даними opencodev2 (маркерний файл запобігає
  подальшим запитанням).

Безголові середовища (CI, скрипти) можуть примусово задати поведінку:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # імпорт без взаємодії
OPENCODEV2_MIGRATE=skip opencodev2 ...   # пропустити і позначити як вирішене
```

Майстер запускається лише один раз на каталог даних (маркер `.migrate-state`
фіксує рішення). Після імпорту скопійована база даних належить opencodev2 —
подальші міграції бази даних opencodev2 ніколи не зачіпають оригінальну
інсталяцію opencode.

### Який варіант обрати?

| Потреба | Використовуйте |
|---|---|
| MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **Цей форк** (`opencodev2`) |
| Офіційний, широко перевірений реліз | [офіційний opencode](https://github.com/anomalyco/opencode) (`opencode`) |

Обидва оновлюються незалежно:

```bash
opencodev2 upgrade        # оновлює форк (@lux-tech/opencode-ai)
opencode upgrade          # оновлює офіційний opencode (opencode-ai)
```

---

## Бінарні файли платформ

`@lux-tech/opencode-ai` постачається як метапакет із 12 опціональними бінарними
файлами платформ (усі опубліковані в одній версії):

| Пакет | Платформа / CPU | Примітки |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | Процесори без AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | Процесори без AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, без AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | Процесори без AVX2 |

---

## Агенти

OpenCode містить два вбудовані агенти, між якими можна перемикатися клавішею `Tab`.

- **build** - Агент за замовчуванням із повним доступом для завдань розробки
- **plan** - Агент лише для читання для аналізу та дослідження коду
  - За замовчуванням забороняє редагування файлів
  - Запитує дозвіл перед запуском bash-команд
  - Ідеально підходить для дослідження незнайомих кодових баз або планування змін

Також доступний допоміжний агент **general** для складного пошуку та багатокрокових
завдань. Він використовується всередині системи й може бути викликаний у
повідомленнях через `@general`.

Форк додатково надає агента **planner**, який автоматично розкладає завдання на
кроки перед виконанням. Дізнайтеся більше про [агентів в офіційній
документації](https://opencode.ai/docs/agents) — поведінка сумісна з upstream.

---

## Документація

- **Документація, специфічна для форку**, знаходиться в цьому репозиторії:
  [`docs/`](./docs) (архітектура, ADR, дизайн hot reload і MCP) та
  [`CHANGELOG.md`](./CHANGELOG.md).
- **Загальна документація з налаштування** сумісна з офіційною документацією:
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Відмінності форку

Цей форк (`menoxz/opencode`) додає такі функції поверх upstream:

| Функція | Опис |
|---------|-------------|
| **MCP Auto-reconnect** | MCP-сервери, чиє з'єднання обривається, виявляються (події транспорту + health ping) і автоматично перепідключаються з експоненційним backoff — більше жодних застарілих статусів "connected" чи мертвих сесій |
| **Hot Reload** | Агенти, плагіни та MCP-сервери автоматично перезавантажуються при зміні файлів — перезапуск не потрібен |
| **Eval Pipeline** | Оцінювання на основі SQLite з виявленням регресій, аналізом трендів і CLI-командами compare |
| **Memory Consolidation** | Пам'ять між сесіями з автоматичним згасанням, виявленням патернів і пост-мортем аналізом |
| **Unified Prompt** | Один `core.txt` замінює 10 промптів, специфічних для моделей — чистіше, менше, легше підтримувати |
| **Continuous Improvement** | Методи — це живі документи: оновлюйте наявні skills із changelog замість створення дублікатів |
| **Planner Integration** | Вбудований агент `planner` автоматично розкладає завдання перед виконанням |
| **opencodev2 identity + migration** | Встановлюється як `opencodev2` із власними каталогами даних, тому співіснує з офіційним opencode; майстер першого запуску імпортує вашу конфігурацію, ключі API та історію сесій на запит |

Нові функції версіонуються у [`CHANGELOG.md`](./CHANGELOG.md).

---

## Внесок

Якщо ви зацікавлені у внеску до цього форку, будь ласка, прочитайте нашу
[документацію для контриб'юторів](./CONTRIBUTING.md) перед надсиланням pull request.
Pull request'и надсилаються у гілку `dev`.

---

## Проєкти на базі OpenCode

Якщо ви працюєте над проєктом, пов'язаним з OpenCode, і використовуєте "opencode" як
частину назви, наприклад "opencode-dashboard" або "opencode-mobile", додайте примітку
до свого README, щоб пояснити, що цей проєкт не створений командою OpenCode і
жодним чином не афілійований із нами.

---

**Повідомляйте про проблеми** на [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Джерело** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
