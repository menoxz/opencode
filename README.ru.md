<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="Логотип форка OpenCode">
    </picture>
  </a>
</p>
<p align="center">Открытый AI-агент для программирования — форк сообщества.

> **Уведомление о форке** — этот репозиторий (`menoxz/opencode`) — форк
> [официального opencode](https://github.com/anomalyco/opencode) от сообщества
> с дополнительными возможностями (MCP auto-reconnect, hot reload, eval pipeline,
> memory consolidation, unified prompt). Он **не аффилирован** с командой
> официального opencode. **См. различия форка →**</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@lux-tech/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/%40lux-tech%2Fopencode-ai?style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/typecheck.yml"><img alt="Typecheck" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/typecheck.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/actions/workflows/eval.yml"><img alt="Eval" src="https://img.shields.io/github/actions/workflow/status/menoxz/opencode/eval.yml?branch=dev&style=flat-square" /></a>
  <a href="https://github.com/menoxz/opencode/blob/dev/LICENSE"><img alt="Лицензия" src="https://img.shields.io/github/license/menoxz/opencode?style=flat-square" /></a>
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

[![Интерфейс терминала OpenCode](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Установка (форк)

Форк опубликован в npm под скоупом `@lux-tech` и устанавливает свою команду как
**`opencodev2`** — отдельный бинарный файл, который **сосуществует** с официальным
`opencode` (устанавливаемым из `opencode-ai`). Он также использует собственные
каталоги данных и конфигурации (`~/.local/share/opencodev2`,
`~/.config/opencodev2`), поэтому оба продукта могут работать бок о бок, не
затрагивая данные друг друга. При первом интерактивном запуске форк предлагает
импортировать существующую конфигурацию opencode, ключи API и историю сессий —
оригинальная установка остаётся нетронутой. См.
[сосуществование с официальным opencode](#сосуществование-с-официальным-opencode).

### Рекомендуется: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Проверка:

```bash
opencodev2 --version
# 1.18.59 (или последняя опубликованная версия)
```

Мета-пакет `@lux-tech/opencode-ai` автоматически загружает правильный бинарный
файл для вашей платформы из одной из 12 опциональных зависимостей (см.
**таблицу бинарных файлов для платформ**) и предоставляет его как команду
`opencodev2`.

### Альтернатива: GitHub Releases (вручную)

Архивы релизов публикуются на
[странице релизов](https://github.com/menoxz/opencode/releases) как `.tar.gz`
(Linux) и `.zip` (macOS / Windows). Каждый архив содержит скомпилированный
CLI-бинарный файл в своём корне — переименуйте его в `opencodev2` при ручной
установке, чтобы он никогда не конфликтовал с официальным бинарным файлом
`opencode`.

```bash
# Пример: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # отдельное имя, без конфликта с официальным бинарным файлом
```

```powershell
# Пример: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Расположение бинарного файла

| Способ установки | Путь к бинарному файлу |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| GitHub release (вручную) | там, куда вы его поместили |

### Обновление

```bash
# Встроенный обновлятор (загружает последний релиз @lux-tech/opencode-ai)
opencodev2 upgrade

# Или через npm
npm update -g @lux-tech/opencode-ai
```

### Удаление

```bash
npm uninstall -g @lux-tech/opencode-ai
```

В Windows также удалите устаревший shim, если npm оставил его:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Сосуществование с официальным opencode

Форк (`@lux-tech/opencode-ai`) устанавливает свою команду как **`opencodev2`**,
а официальный opencode (`opencode-ai`) устанавливает `opencode`. Эти два имени
никогда не конфликтуют, и форк использует собственные каталоги данных
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), поэтому **оба могут быть установлены и использоваться
одновременно**.

### Мастер миграции при первом запуске

При первом интерактивном запуске `opencodev2` определяет, существует ли
предыдущая установка opencode (конфигурация, ключи API, сессии), и спрашивает,
что делать:

- **Import (рекомендуется)** — копирует вашу конфигурацию, учётные данные
  (`auth.json`) и историю сессий (`opencode.db`) из оригинальных каталогов
  opencode в каталоги opencodev2. Оригинальные данные остаются нетронутыми.
- **Later** — начинает с чистого листа и спросит снова при следующем запуске.
- **Never** — начинает с пустыми данными opencodev2 (маркерный файл предотвращает
  дальнейшие запросы).

Безголовые среды (CI, скрипты) могут принудительно задать поведение:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # импорт без взаимодействия
OPENCODEV2_MIGRATE=skip opencodev2 ...   # пропустить и пометить как решённое
```

Мастер запускается только один раз на каталог данных (маркер `.migrate-state`
записывает решение). После импорта скопированная база данных принадлежит
opencodev2 — последующие миграции базы данных opencodev2 никогда не затрагивают
оригинальную установку opencode.

### Какой из них использовать?

| Потребность | Использовать |
|---|---|
| MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **Этот форк** (`opencodev2`) |
| Официальный, широко проверенный релиз | [официальный opencode](https://github.com/anomalyco/opencode) (`opencode`) |

Оба обновляются независимо:

```bash
opencodev2 upgrade        # обновляет форк (@lux-tech/opencode-ai)
opencode upgrade          # обновляет официальный opencode (opencode-ai)
```

---

## Бинарные файлы для платформ

`@lux-tech/opencode-ai` поставляется как мета-пакет с 12 опциональными
бинарными файлами для платформ (все опубликованы в одной версии):

| Пакет | Платформа / CPU | Примечания |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | Процессоры без AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | Процессоры без AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, без AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | Процессоры без AVX2 |

---

## Агенты

OpenCode включает два встроенных агента, между которыми можно переключаться
клавишей `Tab`.

- **build** — по умолчанию, агент с полным доступом для работы над кодом
- **plan** — агент только для чтения для анализа и изучения кода
  - По умолчанию запрещает редактирование файлов
  - Запрашивает разрешение перед выполнением bash-команд
  - Идеален для изучения незнакомых кодовых баз или планирования изменений

Также включён субагент **general** для сложных поисков и многошаговых задач.
Он используется внутри и может быть вызван с помощью `@general` в сообщениях.

Форк дополнительно включает агента **planner**, который автоматически
разбивает задачи на подзадачи перед выполнением. Узнайте больше об
[агентах в официальной документации](https://opencode.ai/docs/agents) —
поведение совместимо с upstream.

---

## Документация

- **Документация форка** находится в этом репозитории:
  [`docs/`](./docs) (архитектура, ADR, hot reload и дизайн MCP)
  и [`CHANGELOG.md`](./CHANGELOG.md).
- **Общая документация по настройке** совместима с официальной
  документацией: [opencode.ai/docs](https://opencode.ai/docs).

---

## Различия форка

Этот форк (`menoxz/opencode`) добавляет следующие возможности поверх upstream:

| Возможность | Описание |
|---------|-------------|
| **MCP Auto-reconnect** | MCP-серверы, чьё соединение оборвалось, обнаруживаются (события транспорта + пинг здоровья) и переподключаются автоматически с экспоненциальной задержкой — больше никакого устаревшего статуса "connected" или мёртвых сессий |
| **Hot Reload** | Агенты, плагины и MCP-серверы перезагружаются автоматически при изменении файлов — перезапуск не нужен |
| **Eval Pipeline** | Оценка на базе SQLite с обнаружением регрессий, анализом трендов и CLI-командами сравнения |
| **Memory Consolidation** | Кросс-сессионная память с автоматическим затуханием, обнаружением паттернов и посмертным анализом |
| **Unified Prompt** | Единый `core.txt` заменяет 10 модельно-специфичных промптов — чище, меньше, проще поддерживать |
| **Continuous Improvement** | Методы — живые документы: обновляйте существующие скиллы с журналом изменений вместо создания дубликатов |
| **Planner Integration** | Встроенный агент `planner` автоматически разбивает задачи перед выполнением |
| **opencodev2 identity + migration** | Устанавливается как `opencodev2` с собственными каталогами данных, поэтому сосуществует с официальным opencode; мастер при первом запуске импортирует вашу конфигурацию, ключи API и историю сессий по запросу |

Новые возможности версионируются в [`CHANGELOG.md`](./CHANGELOG.md).

---

## Вклад

Если вы заинтересованы в вкладе в этот форк, пожалуйста, прочитайте наши
[документы по вкладу](./CONTRIBUTING.md) перед отправкой pull request.
Pull request'ы направляются в ветку `dev`.

---

## Разработка на базе OpenCode

Если вы работаете над проектом, связанным с OpenCode, и используете "opencode"
как часть его имени, например "opencode-dashboard" или "opencode-mobile",
добавьте примечание в свой README, чтобы уточнить, что проект не создан
командой OpenCode и не аффилирован с нами каким-либо образом.

---

**Сообщайте об ошибках** на [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Исходный код** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
