<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-v2-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-v2-light.svg" alt="Logo del fork de OpenCode">
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

El fork se publica en npm bajo el scope `@lux-tech` e instala su comando como
**`opencodev2`** — un binario distinto que **coexiste** con el `opencode` oficial
(instalado desde `opencode-ai`). También mantiene sus propios directorios de
datos/configuración (`~/.local/share/opencodev2`, `~/.config/opencodev2`), por lo que
ambos productos pueden ejecutarse lado a lado sin tocar los datos del otro. En el primer
lanzamiento interactivo, el fork ofrece importar tu configuración de opencode existente,
tus claves de API y el historial de sesiones — la instalación original queda intacta.
Consulta **coexistencia con el opencode oficial**.

### Recomendado: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verificación:

```bash
opencodev2 --version
# 1.18.59 (o la última versión publicada)
```

El meta-paquete `@lux-tech/opencode-ai` descarga automáticamente el binario correcto
para tu plataforma desde una de sus 12 dependencias opcionales (consulta la
**tabla de binarios por plataforma**) y lo expone como el comando `opencodev2`.

### Alternativa: Releases de GitHub (manual)

Los archivos de release se publican en
[la página de releases](https://github.com/menoxz/opencode/releases) como `.tar.gz` (Linux)
y `.zip` (macOS / Windows). Cada archivo contiene el binario CLI compilado en su raíz —
renómbralo a `opencodev2` al instalarlo manualmente para que nunca entre en conflicto
con el binario `opencode` oficial.

```bash
# Ejemplo: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # nombre distinto, sin conflicto con el binario oficial
```

```powershell
# Ejemplo: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Ubicación del binario

| Método de instalación | Ruta del binario |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| Release de GitHub (manual) | donde lo hayas colocado |

### Actualización

```bash
# Actualizador integrado (descarga la última release de @lux-tech/opencode-ai)
opencodev2 upgrade

# O mediante npm
npm update -g @lux-tech/opencode-ai
```

### Desinstalación

```bash
npm uninstall -g @lux-tech/opencode-ai
```

En Windows, elimina también el shim obsoleto si npm dejó uno:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Coexistencia con el opencode oficial

El fork (`@lux-tech/opencode-ai`) instala su comando como **`opencodev2`**, mientras que
el opencode oficial (`opencode-ai`) instala `opencode`. Los dos nombres nunca entran en
conflicto, y el fork usa sus propios directorios de datos
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), por lo que **ambos pueden instalarse y usarse al mismo tiempo**.

### Asistente de migración en el primer lanzamiento

En el primer lanzamiento interactivo, `opencodev2` detecta si existe una instalación
anterior de opencode (configuración, claves de API, sesiones) y pregunta qué hacer:

- **Importar (recomendado)** — copia tu configuración, credenciales (`auth.json`) e
  historial de sesiones (`opencode.db`) desde los directorios originales de opencode a
  los directorios de opencodev2. Los datos originales quedan intactos.
- **Más tarde** — comienza desde cero y vuelve a preguntar en el siguiente lanzamiento.
- **Nunca** — comienza con datos de opencodev2 vacíos (un archivo marcador evita más avisos).

Los entornos sin interfaz (CI, scripts) pueden forzar el comportamiento:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # importar sin interacción
OPENCODEV2_MIGRATE=skip opencodev2 ...   # omitir y marcar como decidido
```

El asistente se ejecuta solo una vez por directorio de datos (un marcador `.migrate-state`
registra la decisión). Después de una importación, la base de datos copiada pertenece a
opencodev2 — las migraciones posteriores de la base de datos de opencodev2 nunca tocan la
instalación original de opencode.

### ¿Cuál deberías usar?

| Necesidad | Usa |
|---|---|
| MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **Este fork** (`opencodev2`) |
| La release oficial, ampliamente validada | [opencode oficial](https://github.com/anomalyco/opencode) (`opencode`) |

Ambos se mantienen actualizados de forma independiente:

```bash
opencodev2 upgrade        # actualiza el fork (@lux-tech/opencode-ai)
opencode upgrade          # actualiza el opencode oficial (opencode-ai)
```

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
| **Identidad opencodev2 + migración** | Se instala como `opencodev2` con sus propios directorios de datos, por lo que coexiste con el opencode oficial; un asistente en el primer lanzamiento importa tu configuración, tus claves de API y el historial de sesiones a petición |

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
