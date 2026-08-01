<p align="center">
  <a href="https://github.com/menoxz/opencode">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logotipo do fork do OpenCode">
    </picture>
  </a>
</p>
<p align="center">O agente de programação com IA de código aberto — fork da comunidade.

> **Aviso do fork** — este repositório (`menoxz/opencode`) é um fork da comunidade do
> [opencode oficial](https://github.com/anomalyco/opencode) com recursos adicionais
> (MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt).
> Ele **não é afiliado** à equipe oficial do opencode.
> **Veja as diferenças do fork →**</p>
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

[![Interface de terminal do OpenCode](packages/web/src/assets/lander/screenshot.png)](https://github.com/menoxz/opencode)

---

## Instalação (fork)

O fork é publicado no npm sob o scope `@lux-tech` e instala um binário chamado
`opencode`, exatamente como o pacote oficial. Isso significa que o fork **substitui**
o opencode oficial quando ambos estão instalados globalmente — leia
**coexistência com o opencode oficial** antes de instalar.

### Recomendado: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verificação:

```bash
opencode --version
# opencode v1.18.55 (ou a versão publicada mais recente)
```

O meta-pacote `@lux-tech/opencode-ai` baixa automaticamente o binário correto para a
sua plataforma a partir de uma de suas 12 dependências opcionais (consulte a
**tabela de binários por plataforma**) e o expõe como o binário `opencode`.

### Alternativa: Releases do GitHub (manual)

Os arquivos de release são publicados na
[página de releases](https://github.com/menoxz/opencode/releases) como `.tar.gz` (Linux)
e `.zip` (macOS / Windows). Cada arquivo contém o binário `opencode` (ou `opencode.exe`)
em sua raiz.

```bash
# Exemplo: Linux x64
VERSION=v1.18.55
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencode-fork   # renomear para não sobrescrever o binário oficial
```

```powershell
# Exemplo: Windows x64 (PowerShell)
$VERSION = "v1.18.55"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencode-fork.exe" -Force
```

### Localização do binário

| Método de instalação | Caminho do binário |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencode.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencode` |
| Release do GitHub (manual) | onde você o colocou |

### Atualização

```bash
# Atualizador integrado (busca a release mais recente de @lux-tech/opencode-ai)
opencode upgrade

# Ou via npm
npm update -g @lux-tech/opencode-ai
```

### Desinstalação

```bash
npm uninstall -g @lux-tech/opencode-ai
```

No Windows, remova também o shim obsoleto se o npm tiver deixado um:

```powershell
Remove-Item "$env:APPDATA\npm\opencode*" -Force -ErrorAction SilentlyContinue
```

---

## Coexistência com o opencode oficial

**Tanto o fork (`@lux-tech/opencode-ai`) quanto o opencode oficial (`opencode-ai`)
instalam um binário chamado `opencode`.** Instalar um globalmente depois do outro
substitui silenciosamente o binário anterior. Você não pode manter os dois como
`opencode` global ao mesmo tempo.

### Qual você deve usar?

| Necessidade | Use |
|---|---|
| Servidores MCP com reconexão automática, hot reload, eval pipeline, memory consolidation, unified prompt | **Este fork** (`@lux-tech/opencode-ai`) |
| A release oficial, amplamente validada | [opencode oficial](https://github.com/anomalyco/opencode) (`opencode-ai`) |

### Opção A — uma instalação global + `npx` para a outra (recomendada)

Instale o fork globalmente e execute o opencode oficial sob demanda sem instalá-lo
globalmente:

```bash
npm install -g @lux-tech/opencode-ai   # o fork se torna o `opencode` global

# Use o opencode oficial sem tocar na instalação global:
npx -y opencode-ai@latest
```

Ou o contrário — mantenha o opencode oficial global e execute o fork sob demanda:

```bash
npm install -g opencode-ai             # o oficial se torna o `opencode` global
npx -y @lux-tech/opencode-ai@latest    # execute o fork sob demanda
```

### Opção B — ambos instalados, um renomeado

Instale os dois e renomeie o binário secundário para que os dois comandos não
entrem em conflito:

```bash
npm install -g @lux-tech/opencode-ai
npm install -g opencode-ai             # sobrescreve `opencode` — faça isto por segundo
```

Em seguida, no Windows, renomeie o binário do fork para `opencode-fork.exe`:

```powershell
Copy-Item "$env:APPDATA\npm\opencode.exe" "$env:APPDATA\npm\opencode-fork.exe"
opencode-fork --version   # fork
opencode --version        # oficial
```

No Linux / macOS:

```bash
cp "$(npm prefix -g)/bin/opencode" "$(npm prefix -g)/bin/opencode-fork"
opencode-fork --version   # fork
opencode --version        # oficial
```

### Verificar qual binário está ativo no momento

```bash
which opencode                # caminho do binário ativo
opencode --version            # versão do binário ativo
opencode upgrade --help       # o atualizador integrado visa @lux-tech/opencode-ai
```

> [!TIP]
> O atualizador integrado (`opencode upgrade`) sempre busca `@lux-tech/opencode-ai`.
> Se você quiser que o opencode **oficial** se atualize automaticamente, execute-o via
> `npx opencode-ai@latest` ou o instalador oficial (consulte
> [opencode.ai](https://opencode.ai)).

---

## Binários por plataforma

`@lux-tech/opencode-ai` é distribuído como meta-pacote com 12 binários opcionais
por plataforma (todos publicados na mesma versão):

| Package | Plataforma / CPU | Observações |
|---|---|---|
| `@lux-tech/opencode-ai-darwin-arm64` | macOS arm64 | Apple Silicon |
| `@lux-tech/opencode-ai-darwin-x64` | macOS x64 | Intel |
| `@lux-tech/opencode-ai-darwin-x64-baseline` | macOS x64 | CPUs sem AVX2 |
| `@lux-tech/opencode-ai-linux-arm64` | Linux arm64 | |
| `@lux-tech/opencode-ai-linux-arm64-musl` | Linux arm64 | Alpine / musl |
| `@lux-tech/opencode-ai-linux-x64` | Linux x64 | |
| `@lux-tech/opencode-ai-linux-x64-baseline` | Linux x64 | CPUs sem AVX2 |
| `@lux-tech/opencode-ai-linux-x64-baseline-musl` | Linux x64 | musl, sem AVX2 |
| `@lux-tech/opencode-ai-linux-x64-musl` | Linux x64 | Alpine / musl |
| `@lux-tech/opencode-ai-windows-arm64` | Windows arm64 | |
| `@lux-tech/opencode-ai-windows-x64` | Windows x64 | |
| `@lux-tech/opencode-ai-windows-x64-baseline` | Windows x64 | CPUs sem AVX2 |

---

## Agentes

O OpenCode inclui dois agents integrados, que você pode alternar com a tecla `Tab`.

- **build** - Padrão, agent com acesso total para trabalho de desenvolvimento
- **plan** - Agent somente leitura para análise e exploração de código
  - Nega edições de arquivos por padrão
  - Pede permissão antes de executar comandos bash
  - Ideal para explorar codebases desconhecidas ou planejar mudanças

Também há um subagent **general** para buscas complexas e tarefas em várias etapas.
Ele é usado internamente e pode ser invocado com `@general` nas mensagens.

O fork também inclui um agent **planner** que decompõe automaticamente as tarefas antes
da execução. Saiba mais sobre
[agents na documentação oficial](https://opencode.ai/docs/agents) — o comportamento
é compatível com o upstream.

---

## Documentação

- **Documentação específica do fork** : neste repositório — [`docs/`](./docs) (arquitetura,
  ADRs, design de hot reload e MCP) e [`CHANGELOG.md`](./CHANGELOG.md).
- **Documentação geral de configuração** : compatível com a documentação oficial —
  [opencode.ai/docs](https://opencode.ai/docs).

---

## Diferenças do fork

Este fork (`menoxz/opencode`) adiciona os seguintes recursos além do upstream:

| Recurso | Descrição |
|---------|-------------|
| **MCP Auto-reconnect** | Servidores MCP cuja conexão cai são detectados (eventos de transporte + ping de saúde) e reconectados automaticamente com backoff exponencial — sem mais status "conectado" obsoleto nem sessões mortas |
| **Hot Reload** | Agents, plugins e servidores MCP recarregam automaticamente ao mudar arquivos — sem necessidade de reiniciar |
| **Eval Pipeline** | Avaliação baseada em SQLite com detecção de regressões, análise de tendências e comandos CLI de comparação |
| **Memory Consolidation** | Memória entre sessões com decaimento automático, detecção de padrões e análise post-mortem |
| **Unified Prompt** | Um único `core.txt` substitui 10 prompts específicos por modelo — mais limpo, menor, mais fácil de manter |
| **Continuous Improvement** | Métodos são documentos vivos — atualize skills existentes com changelog em vez de criar duplicatas |
| **Planner Integration** | O agent `planner` integrado decompõe automaticamente as tarefas antes da execução |

Os novos recursos são versionados em [`CHANGELOG.md`](./CHANGELOG.md).

---

## Contribuir

Se você tem interesse em contribuir com este fork, leia os
[contributing docs](./CONTRIBUTING.md) antes de enviar um pull request.
Os pull requests têm como alvo a branch `dev`.

---

## Construindo sobre o OpenCode

Se você estiver trabalhando em um projeto relacionado ao OpenCode e estiver usando
"opencode" como parte do nome, por exemplo "opencode-dashboard" ou "opencode-mobile",
adicione uma nota ao seu README para deixar claro que não foi construído pela equipe
do OpenCode e não é afiliado a nós de nenhuma forma.

---

**Reporte problemas** no [GitHub Issues](https://github.com/menoxz/opencode/issues) ·
**Fonte** [github.com/menoxz/opencode](https://github.com/menoxz/opencode)
