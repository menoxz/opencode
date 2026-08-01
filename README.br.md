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

O fork é publicado no npm sob o scope `@lux-tech` e instala seu comando como
**`opencodev2`** — um binário distinto que **coexiste** com o `opencode` oficial
(instalado a partir do `opencode-ai`). Ele também mantém seus próprios diretórios de
dados/configuração (`~/.local/share/opencodev2`, `~/.config/opencodev2`), para que os
dois produtos possam ser executados lado a lado sem tocar nos dados um do outro. No
primeiro lançamento interativo, o fork oferece importar sua configuração opencode
existente, suas chaves de API e o histórico de sessões — a instalação original fica
intacta. Consulte **coexistência com o opencode oficial**.

### Recomendado: npm

```bash
npm install -g @lux-tech/opencode-ai
```

Verificação:

```bash
opencodev2 --version
# 1.18.59 (ou a versão publicada mais recente)
```

O meta-pacote `@lux-tech/opencode-ai` baixa automaticamente o binário correto para a
sua plataforma a partir de uma de suas 12 dependências opcionais (consulte a
**tabela de binários por plataforma**) e o expõe como o comando `opencodev2`.

### Alternativa: Releases do GitHub (manual)

Os arquivos de release são publicados na
[página de releases](https://github.com/menoxz/opencode/releases) como `.tar.gz` (Linux)
e `.zip` (macOS / Windows). Cada arquivo contém o binário CLI compilado em sua raiz —
renomeie-o para `opencodev2` ao instalar manualmente para que nunca entre em conflito
com o binário `opencode` oficial.

```bash
# Exemplo: Linux x64
VERSION=v1.18.59
curl -fsSL -o opencode.tar.gz "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-linux-x64.tar.gz"
tar -xzf opencode.tar.gz
sudo mv opencode /usr/local/bin/opencodev2   # nome distinto, sem conflito com o binário oficial
```

```powershell
# Exemplo: Windows x64 (PowerShell)
$VERSION = "v1.18.59"
Invoke-WebRequest -Uri "https://github.com/menoxz/opencode/releases/download/$VERSION/opencode-windows-x64.zip" -OutFile opencode.zip
Expand-Archive -Path opencode.zip -DestinationPath . -Force
Move-Item .\opencode.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\opencodev2.exe" -Force
```

### Localização do binário

| Método de instalação | Caminho do binário |
|---|---|
| npm (Windows) | `%APPDATA%\npm\opencodev2.exe` |
| npm (Linux / macOS) | `$(npm prefix -g)/bin/opencodev2` |
| Release do GitHub (manual) | onde você o colocou |

### Atualização

```bash
# Atualizador integrado (busca a release mais recente de @lux-tech/opencode-ai)
opencodev2 upgrade

# Ou via npm
npm update -g @lux-tech/opencode-ai
```

### Desinstalação

```bash
npm uninstall -g @lux-tech/opencode-ai
```

No Windows, remova também o shim obsoleto se o npm tiver deixado um:

```powershell
Remove-Item "$env:APPDATA\npm\opencodev2*" -Force -ErrorAction SilentlyContinue
```

---

## Coexistência com o opencode oficial

O fork (`@lux-tech/opencode-ai`) instala seu comando como **`opencodev2`**, enquanto o
opencode oficial (`opencode-ai`) instala `opencode`. Os dois nomes nunca entram em
conflito, e o fork usa seus próprios diretórios de dados
(`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`,
`~/.cache/opencodev2`), então **ambos podem ser instalados e usados ao mesmo tempo**.

### Assistente de migração no primeiro uso

No primeiro lançamento interativo, o `opencodev2` detecta se existe uma instalação
anterior do opencode (configuração, chaves de API, sessões) e pergunta o que fazer:

- **Importar (recomendado)** — copia sua configuração, credenciais (`auth.json`) e
  histórico de sessões (`opencode.db`) dos diretórios opencode originais para os
  diretórios opencodev2. Os dados originais ficam intactos.
- **Depois** — começa do zero e pergunta novamente no próximo lançamento.
- **Nunca** — começa com dados opencodev2 vazios (um arquivo marcador impede novos avisos).

Ambientes sem interface (CI, scripts) podem forçar o comportamento:

```bash
OPENCODEV2_MIGRATE=copy opencodev2 ...   # importar sem interação
OPENCODEV2_MIGRATE=skip opencodev2 ...   # pular e marcar como decidido
```

O assistente é executado apenas uma vez por diretório de dados (um marcador `.migrate-state`
registra a decisão). Após uma importação, o banco de dados copiado pertence ao opencodev2 —
migrações subsequentes do banco de dados opencodev2 nunca tocam a instalação opencode original.

### Qual você deve usar?

| Necessidade | Use |
|---|---|
| MCP auto-reconnect, hot reload, eval pipeline, memory consolidation, unified prompt | **Este fork** (`opencodev2`) |
| A release oficial, amplamente validada | [opencode oficial](https://github.com/anomalyco/opencode) (`opencode`) |

Ambos permanecem atualizados de forma independente:

```bash
opencodev2 upgrade        # atualiza o fork (@lux-tech/opencode-ai)
opencode upgrade          # atualiza o opencode oficial (opencode-ai)
```

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
| **Identidade opencodev2 + migração** | Instala-se como `opencodev2` com seus próprios diretórios de dados, portanto coexiste com o opencode oficial; um assistente no primeiro uso importa sua configuração, chaves de API e histórico de sessões sob demanda |

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
