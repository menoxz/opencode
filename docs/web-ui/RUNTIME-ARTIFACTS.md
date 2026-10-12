# RUNTIME-ARTIFACTS — inventaire P1 (mode sans build, hors checkout)

Ce document répond à la question posée par le workflow (§3 M2) : **quels fichiers non-TypeScript
le serveur faut-il livrer pour qu'il s'exécute depuis les sources, sans build de binaire ?**

Toutes les mesures ci-dessous sont des observations du 2026-10-12 sur le dépôt, pas des
hypothèses. Les blocs marqués `INFERE:` indiquent un point non vérifié par exécution.

---

## 1. Preuve de démarrage sans build (G1)

Commande exécutée, **sans qu'aucun `script/build.ts` n'ait été lancé** :

```pwsh
$bun = "$env:APPDATA\npm\node_modules\bun\bin\bun.exe"
Start-Process $bun -ArgumentList "--conditions=browser","./packages/opencode/src/index.ts","serve","--port","4702" `
  -WorkingDirectory "C:\jeanluc\opencode-fork"
```

Résultat observé :

```
BOOT OK {"healthy":true,"version":"local"}
/agent   => 200 len=1272853
/config  => 200 len=156041
/session => 200 len=22931
/path    => 200 len=211
/mode    => 200 len=2884
```

Flux d'événements (`curl --max-time 4 -N`, `text/event-stream`) :

```
HTTP/1.1 200 OK
content-type: text/event-stream
transfer-encoding: chunked

data: {"id":"evt_...","type":"server.connected","properties":{}}
```

**G1 est franchie.** Deux réserves methodologiques :

- `version: "local"` et non `2.4.4` : le versionnement est résolu au build
  (`script/build.ts:19-20` force `OPENCODE_VERSION` depuis le `package.json`). En mode source,
  le serveur ne connaît pas sa version. Conséquence pour l'UI : ne jamais afficher la version
  du serveur comme un identifiant de build.
- Le premier lancement sur le port 4701 est mort après la sonde SSE. La cause n'est pas établie
  (`INFERE:` le shell qui a expiré pendant la lecture du flux infini a emporté l'enfant).
  Le port 4702, relancé sans sonde bloquante, est resté vivant. Point à surveiller, pas bloquant.

---

## 2. Inventaire des artefacts non-TS requis à l'exécution

### 2.1 Migrations SQL — **le seul artefact réellement bloquant**

`packages/opencode/src/storage/db.ts:223-241` lit les migrations **depuis le disque au runtime**,
et non via un import :

```ts
const dirs = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
const sql = dirs.map((name) => {
  const file = path.join(dir, name, "migration.sql")
  if (!existsSync(file)) return
  return { sql: readFileSync(file, "utf-8"), timestamp: time(name), name }
})
```

Mesuré : **24 dossiers, 24 `migration.sql`, 12 032 octets au total**.

Conséquence : un paquet de sources qui n'embarque pas `packages/opencode/migration/**` démarre
mais **crée une base vide** — aucune migration appliquée. C'est le mode de défaillance le plus
trompeur du chantier : il ne lève pas d'erreur, il perd des données. La gate P1 doit donc vérifier
le nombre de migrations appliquées, pas seulement `healthy:true`.

### 2.2 WASM — résolus depuis `node_modules`, pas embarqués

`grep` des imports non-TS :

| Fichier | Artefact | Mode d'import |
|---|---|---|
| `src/image/image.ts:4` | `@silvia-odwyer/photon-node/photon_rs_bg.wasm` | statique, `with { type: "file" }` |
| `src/tool/shell.ts:441` | `web-tree-sitter/tree-sitter.wasm` | dynamique, `with: { type: "wasm" }` |
| `src/tool/shell.ts:450` | `tree-sitter-bash/tree-sitter-bash.wasm` | dynamique, idem |
| `src/tool/shell.ts:453` | `tree-sitter-powershell/tree-sitter-powershell.wasm` | dynamique, idem |

Mesuré dans `packages/opencode` : **0 fichier `.wasm`**. Ils viennent donc des dépendances npm.
Ce n'est pas un blocage pour un paquet de sources (les dépendances sont installées), mais cela
signale que **M2 exige un `bun install` complet**, pas seulement une copie de fichiers.

### 2.3 Binaires natifs — aucun, et le PTY en dépend

Mesuré : **0 fichier `.node`** dans `packages/opencode`. Le PTY est conditionalisé :

- `pty.bun.ts:1` → `bun-pty` (condition `bun`)
- `pty.node.ts:2` → `@lydell/node-pty` (condition `node`)

`packages/opencode/package.json:33-37` déclare `#pty` avec `bun` / `node` / `default`. Un
paquet de sources fonctionne donc sous Bun **sans** binaire natif à construire. Node reste
envisageable mais n'est pas nécessaire à la gate P1.

### 2.4 Audio — dépend de `@opencode-ai/ui`

`src/cli/cmd/tui/attention.ts:16-21` importe six `.mp3` depuis `@opencode-ai/ui/audio/*` en
`with { type: "file" }`. Sans effet sur le serveur (chemin TUI), mais un paquet M2 minimal qui
exclut `packages/ui` casse la TUI. À trancher : embarquer `ui` complet, ou rendre ces imports audio
devenir conditionnels au mode web.

---

## 3. Blocage identifié : le champ `files` du SDK

| Paquet | Champ `files` | Conséquence |
|---|---|---|
| `packages/opencode/package.json` | **absent** | tout le dépôt est publiable, y compris `migration/` — cohérent avec §2.1 |
| `packages/sdk/js/package.json:20-22` | `["dist"]` | **seul `dist/` est publié** |

Or les `exports` du SDK pointent vers les **sources** :

```json
".": "./src/index.ts",
"./v2/client": "./src/v2/client.ts",
```

### 3.1 Vérification A1 — `bun pm pack --dry-run` (2026-10-12)

Commande exécutée dans `packages/sdk/js`, **exit 0** :

```
packed 0.90KB    package.json
packed 2.65KB    dist/v2/client.js
packed 206B      dist/v2/gen/client.gen.js
packed 97.77KB   dist/v2/gen/sdk.gen.js
packed 173.68KB  dist/v2/gen/types.gen.d.ts
packed 65B       dist/v2/gen/types.gen.js
packed 3.30KB    dist/v2/server.js

Total files: 7
Unpacked size: 0.28MB
```

**Fait mesuré, plus une inférence :** aucun `src/*.ts` n'est packé. Comme les `exports` du
paquet pointent vers `./src/*.ts`, l'inférence est qu'un `import` du SDK installé échoue sur une
résolution de fichier absent. Cette seconde partie est `INFERE:` (elle suppose un installateur
respectant `exports` + `files`, non testé ici) ; la première partie est un fait de sortie de
commande.

**Portée** : ce défaut est **antérieur à l'initiative web** et indépendant d'elle. Il rend
toutefois M2 inutilisable tant qu'il n'est pas tranché, puisque l'UI se connecte par ce client.

---

## 4. Actions issues de cet inventaire

| # | action | phase |
|---|---|---|
| A1 | ✅ **Fait** — `bun pm pack --dry-run` : 7 fichiers, `dist/` seul, aucun `src/` (§3.1) | P1 |
| A2 | Exiger `migration/**` dans le paquet M2 et **compter les migrations appliquées** dans la gate, pas seulement la santé | P1 |
| A3 | Documenter que M2 implique un `bun install` complet (wasm depuis `node_modules`) | P1 |
| A4 | Trancher le sort de `@opencode-ai/ui` pour le paquet M2 (§2.4) | P2 |
| A5 | Surveiller la mort du serveur après une sonde SSE longue | P3 |

## 5. Verdict de gate

**G1 franchie pour l'essentiel** : le serveur démarre sans build et répond sur toute la surface
gelée en P0, SSE compris.

**G1 n'est pas clôturée.** A1 est fait et confirme le blocage SDK (§3.1) ; A2 reste ouvert : tant
que la gate ne compte pas les migrations appliquées, elle accepte un serveur « sain » dont la
base est vide — un échec silencieux, le pire pour une base de données.
