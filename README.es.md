<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo del fork de OpenCode">
    </picture>
  </a>
</p>
<p align="center">El agente de programación con IA de código abierto — fork de la comunidad.

> **Aviso del fork** — este repositorio (`menoxz/opencode`) es un fork comunitario del
> [opencode oficial](https://github.com/anomalyco/opencode) con características adicionales
> (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt).
> **No está afiliado** con el equipo oficial de opencode.
> **Ver las diferencias del fork →**</p>
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

[![Interfaz de terminal de OpenCode](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Instalación (fork)

El fork se publica en npm bajo el scope `@lux-tech` e instala un binario llamado
`opencode`, exactamente igual que el paquete oficial. Esto significa que el fork
**reemplaza** al opencode oficial cuando ambos están instalados globalmente — lee
**coexistencia con el opencode oficial** antes de instalar.

### Recomendado: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verificación:

```bash
opencode --version
# opencode v1.18.55 (o la última versión publicada)
```

El meta-paquete `@lux-tech/opencode-ai` descarga automáticamente el binario correcto
para tu plataforma desde una de sus 12 dependencias opcionales (consulta la
**tabla de binarios por plataforma**) y lo expone como el binario `opencode`.

### Alternativa: Releases de GitHub (manual)

Los archivos de release se publican en
[la página de releases](https://github.com/menoxz/opencode/releases) como `.tar.gz` (Linux)
y `.zip` (macOS / Windows). Cada archivo contiene el binario `opencode` (o `opencode.exe`)
en su raíz.

```bash
# Ejemplo: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # renombrar para no sobrescribir el binario oficial
```

```powershell
# Ejemplo: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Ubicación del binario

| Método de instalación | Ruta del binario |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| Release de GitHub (manual) | donde lo hayas colocado |

### Actualización

```bash
# Actualizador integrado (descarga la última release de @lux-tech/opencode-ai)
opencode upgrade

# O mediante npm
npm update -g @lux-tech/opencode-ai
```

### Desinstalación

```bash
npm uninstall -g @lux-tech/opencode-ai
```

En Windows, elimina también el shim obsoleto si npm dejó uno:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Coexistencia con el opencode oficial

**Tanto el fork (`@lux-tech/opencode-ai`) como el opencode oficial (`opencode-ai`)
instalan un binario llamado `opencode`.** Instalar uno globalmente después del otro
reemplaza silenciosamente el binario anterior. No puedes mantener ambos como `opencode`
global al mismo tiempo.

### ¿Cuál deberías usar?

| Necesidad | Usa |
|---|---|
| Servidores MCP con reconexión automática, hot reload, eval pipeline, memory consolidation, unified prompt | **Este fork** (`@lux-tech/opencode-ai`) |
| La release oficial, ampliamente validada | [opencode oficial](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Opción A — una instalación global + `npx` para la otra (recomendado)

Instala el fork globalmente y ejecuta el opencode oficial bajo demanda sin instalarlo
globalmente:

```bash
npm install -g @lux-tech/opencode-ai   # el fork se convierte en el `opencode` global

# Usa el opencode oficial sin tocar la instalación global:
npx -y opencode-ai@latest
```

O al revés — mantén el opencode oficial global y ejecuta el fork bajo demanda:

```bash
npm install -g opencode-ai             # el oficial se convierte en el `opencode` global
npx -y @lux-tech/opencode-ai@latest    # ejecuta el fork bajo demanda
```

### Opción B — ambos instalados, uno renombrado

Instala ambos y luego renombra el binario secundario para que los dos comandos no
entren en conflicto:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # sobrescribe `opencode` — haz esto en segundo lugar
```

Luego, en Windows, renombra el binario del fork a `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # oficial
```

En Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # oficial
```

### Comprobar qué binario está activo actualmente

```bash
which opencode                # ruta del binario activo
opencode --version            # versión del binario activo
opencode upgrade --help       # el actualizador integrado apunta a @lux-tech/opencode-ai
```

> [!TIP]
> El actualizador integrado (`opencode upgrade`) siempre descarga `@lux-tech/opencode-ai`.
> Si quieres que el opencode **oficial** se actualice automáticamente, ejecútalo a través de
> `npx opencode-ai@latest` o del instalador oficial (consulta
> [opencode.ai](https://opencode.ai)).

---

## Binarios por plataforma

`@lux-tech/opencode-ai` se distribuye como meta-paquete con 12 binarios opcionales
por plataforma (todos publicados en la misma versión):

| Package | Plataforma / CPU | Notas |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPUs sin AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPUs sin AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, sin AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPUs sin AVX2 |

---

## Agentes

OpenCode incluye dos agentes integrados entre los que puedes alternar con la tecla `Tab`.

- **build** - Por defecto, agente con acceso completo para tareas de desarrollo
- **plan** - Agente de solo lectura para análisis y exploración de código
  - Deniega ediciones de archivos por defecto
  - Pide permiso antes de ejecutar comandos bash
  - Ideal para explorar codebases desconocidas o planificar cambios

También se incluye un subagente **general** para búsquedas complejas y tareas de varios pasos.
Se usa internamente y se puede invocar con `@general` en los mensajes.

El fork además incluye un agente **planner** que descompone automáticamente las tareas antes
de la ejecución. Más información sobre los
[agentes en la documentación oficial](https://opencode.ai/docs/agents) — el comportamiento
es compatible con upstream.

---

## Documentación

- **Documentación específica del fork** : en este repositorio — [`docs/`](./docs) (arquitectura,
  ADRs, diseño del hot reload y de los MCP) y [`CHANGELOG.md`](./CHANGELOG.md).
- **Documentación general de configuración** : compatible con la documentación oficial —
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Diferencias del fork

Este fork (`menoxz/opencode`) añade las siguientes características sobre upstream:

| Funcionalidad | Descripción |
|---------|-------------|
| **MCP Auto-reconnect** | Los servidores MCP cuya conexión se cae se detectan (eventos de transporte + ping de salud) y se reconectan automáticamente con backoff exponencial — sin más estados «conectado» obsoletos ni sesiones muertas |
| **Hot Reload** | Los agentes, plugins y servidores MCP se recargan automáticamente al cambiar un archivo — sin necesidad de reiniciar |
| **Eval Pipeline** | Evaluación basada en SQLite con detección de regresiones, análisis de tendencias y comandos CLI de comparación |
| **Memory Consolidation** | Memoria entre sesiones con decaimiento automático, detección de patrones y análisis post-mortem |
| **Unified Prompt** | Un único `core.txt` reemplaza 10 prompts específicos por modelo — más limpio, más pequeño, más fácil de mantener |
| **Continuous Improvement** | Los métodos son documentos vivos — actualiza los skills existentes con un changelog en lugar de crear duplicados |
| **Planner Integration** | El agente `planner` integrado descompone automáticamente las tareas antes de la ejecución |

Las nuevas características se versionan en [`CHANGELOG.md`](./CHANGELOG.md).

---

## Contribuir

Si te interesa contribuir a este fork, lee nuestros
[docs de contribución](./CONTRIBUTING.md) antes de enviar un pull request.
Los pull requests apuntan a la rama `dev`.

---

## Construir sobre OpenCode

Si estás trabajando en un proyecto relacionado con OpenCode y usas «opencode» como parte
de su nombre, por ejemplo «opencode-dashboard» u «opencode-mobile», añade una nota a tu
README para aclarar que no está construido por el equipo de OpenCode y que no está
afiliado con nosotros de ninguna manera.

---

**Informa de problemas** en [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Fuente** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
