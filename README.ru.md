<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Логотип форка OpenCode">
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

Форк опубликован в npm под скоупом `@lux-tech` и устанавливает бинарный файл
с именем `opencode`, точно так же, как официальный пакет. Это означает, что форк
**заменяет** официальный opencode, когда оба установлены глобально — прочитайте
**сосуществование с официальным opencode** перед установкой.

### Рекомендуется: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Проверка:

```bash
opencode --version
# opencode v1.18.55 (или последняя опубликованная версия)
```

Мета-пакет `@lux-tech/opencode-ai` автоматически загружает правильный бинарный
файл для вашей платформы из одной из 12 опциональных зависимостей (см.
**таблицу бинарных файлов для платформ**) и предоставляет его как бинарный
файл `opencode`.

### Альтернатива: GitHub Releases (вручную)

Архивы релизов публикуются на
[странице релизов](https://github.com/menoxz/opencode/releases) как `.tar.gz`
(Linux) и `.zip` (macOS / Windows). Каждый архив содержит бинарный файл
`opencode` (или `opencode.exe`) в своём корне.

```bash
# Пример: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # переименуйте, чтобы не затереть официальный бинарный файл
```

```powershell
# Пример: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Расположение бинарного файла

| Способ установки | Путь к бинарному файлу |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| GitHub release (вручную) | там, куда вы его поместили |

### Обновление

```bash
# Встроенный обновлятор (загружает последний релиз @lux-tech/opencode-ai)
opencode upgrade

# Или через npm
npm update -g @lux-tech/opencode-ai
```

### Удаление

```bash
npm uninstall -g @lux-tech/opencode-ai
```

В Windows также удалите устаревший shim, если npm оставил его:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Сосуществование с официальным opencode

**И форк (`@lux-tech/opencode-ai`), и официальный opencode (`opencode-ai`)
устанавливают бинарный файл с именем `opencode`.** Глобальная установка одного
поверх другого молча заменяет предыдущий бинарный файл. Нельзя держать оба
как глобальный `opencode` одновременно.

### Какой из них использовать?

| Потребность | Использовать |
|---|---|
| MCP-серверы с автопереподключением, hot reload, eval pipeline, memory consolidation, unified prompt | **Этот форк** (`@lux-tech/opencode-ai`) |
| Официальный, широко проверенный релиз | [официальный opencode](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Вариант A — одна глобальная установка + `npx` для другого (рекомендуется)

Установите форк глобально и запускайте официальный opencode по требованию,
не устанавливая его глобально:

```bash
npm install -g @lux-tech/opencode-ai   # форк становится глобальным `opencode`

# Используйте официальный opencode, не трогая глобальную установку:
npx -y opencode-ai@latest
```

Или наоборот — оставьте официальный opencode глобальным и запускайте форк
по требованию:

```bash
npm install -g opencode-ai             # официальный становится глобальным `opencode`
npx -y @lux-tech/opencode-ai@latest    # запуск форка по требованию
```

### Вариант B — оба установлены, один переименован

Установите оба, затем переименуйте вторичный бинарный файл, чтобы команды
не конфликтовали:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # перезаписывает `opencode` — сделайте это вторым
```

Затем в Windows переименуйте бинарный файл форка в `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # форк
opencode --version        # официальный
```

В Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # форк
opencode --version        # официальный
```

### Проверка, какой бинарный файл сейчас активен

```bash
which opencode                # путь активного бинарного файла
opencode --version            # версия активного бинарного файла
opencode upgrade --help       # встроенный обновлятор нацелен на @lux-tech/opencode-ai
```

> [!TIP]
> Встроенный обновлятор (`opencode upgrade`) всегда загружает
> `@lux-tech/opencode-ai`. Если вы хотите, чтобы **официальный** opencode
> обновлялся автоматически, запускайте его через `npx opencode-ai@latest`
> или официальный установщик (см. [opencode.ai](https://opencode.ai)).

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
