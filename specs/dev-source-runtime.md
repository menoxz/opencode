# Développement depuis les sources

Objectif : la surface **produit** d'`opencodev2` sert le code du dépôt — jamais le binaire installé —
de sorte qu'une modification de source soit prise en compte sans rebuild ni redéploiement.

## Les trois portes d'entrée

| Commande | Surface | Code servi |
|---|---|---|
| `opencodev2` | TUI | sources |
| `opencodev2 cli` | CLI (headless) | sources |
| `opencodev2 web` | GUI | sources |

Il n'existe volontairement **aucune** commande par verbes de cycle de vie (`up`, `down`, `status`…) :
la surface produit est l'unique porte d'entrée.

`cli` est le nom officiel de l'ancienne commande `run`, conservée comme alias (`aliases: ["run"]`)
pour ne pas casser les scripts existants.

## Comment la racine source est résolue

`packages/opencode/src/dev/source.ts` résout la racine du dépôt ainsi :

- soit `OPENCODE_DEV_SOURCE` est posée et l'entrée existe ;
- soit — cas normal — le processus doit **réellement exécuter**
  `<racine>/packages/opencode/src/index.ts`, c'est-à-dire que `process.argv[1]` résolu doit être égal à
  l'entrée candidate.

Dans un binaire compilé, `import.meta.dir` est un chemin virtuel : la correspondance échoue et le
runtime retombe proprement sur le binaire installé. Exiger la correspondance sur l'entrée
*effectivement exécutée* — et non la simple présence du dépôt à côté du module — empêche les tests,
scripts et outils importés depuis le dépôt de prendre silencieusement le chemin source.

`cli/cmd/tui/attach.ts` et `daemon/autostart.ts` passent par le même resolveur : en mode source, ils
ne peuvent plus spawner `opencodev2.exe`.

## Comment le serveur d'arrière-plan naît

La TUI et la CLI n'embarquent pas le serveur : elles passent par `ensureDaemonStarted()`, qui spawne
en mode source `bun --watch --conditions=browser <racine>/packages/opencode/src/index.ts serve`.

- **Le port est épinglé à 4096** (`DevSource.DEFAULT_PORT`). Le port `0` du `serve` par défaut est
  éphémère, ce qui rendrait le serveur impossible à retrouver d'une commande à l'autre. `web` épingle
  le même port pour que le GUI et le backend s'accordent.
- **Aucun état n'est écrit dans le dépôt.** Le serveur tourne avec `bun --watch` enraciné sur le
  dépôt : un fichier d'état écrit dedans serait vu comme une modification de source et relancerait le
  serveur qui l'a écrit (boucle d'auto-restart). C'est pourquoi il n'y a ni fichier de bail ni
  registre de PID.
- **Serveur détaché + stdio redirigé vers un fichier = mort immédiate** : le serveur démarre puis
  s'arrête dès que le lanceur sort. La combinaison qui tient est `detached: true` + `stdio: "ignore"`.
- **`bun --watch` redémarre le serveur** (nouveau PID), ce n'est pas du HMR. L'état vit côté serveur
  (sessions en base), donc **les sessions survivent** à une modification ; le client TUI, lui, est
  jetable et se relance.

## Cas particulier : `opencodev2 web`

Le GUI est une app Vite (SolidJS, `packages/app`) : son code ne peut être servi « live » que par son
serveur de dev, sur le port 3000 (`packages/app/vite.config.ts`). Aujourd'hui le serveur d'opencode
sert, selon le cas, soit `embeddedWebUI` — un instantané figé généré au build
(`server/shared/ui.ts:44-48`, `script/build.ts`) — soit, si `OPENCODE_DISABLE_EMBEDDED_WEB_UI` est
posée, un proxy vers l'app hébergée `https://app.opencode.ai` (`ui.ts:9,68-107`). Aucun des deux ne
sert les sources.

En mode source, `opencodev2 web` orchestre donc les deux :

1. il démarre le serveur d'arrière-plan source et épingle son port à 4096 ;
2. il démarre le serveur de dev de l'app (`packages/app`, port 3000) en lui injectant
   `VITE_OPENCODE_SERVER_HOST` / `VITE_OPENCODE_SERVER_PORT` — les deux variables que l'app lit pour
   résoudre son backend (`packages/app/src/entry.tsx:103-105`, déclarées en `env.d.ts:2-3`) ;
3. il ouvre le navigateur sur le GUI live ;
4. il arrête le serveur de dev de l'app en sortant, sinon le port resterait pris et le prochain
   lancement binderait ailleurs.

Hors dépôt (binaire installé), `web` conserve le comportement d'origine.

## Périmètre client

| Client | Se rattache au serveur source ? |
|---|---|
| TUI (`opencodev2`) | oui, via `ensureDaemonStarted()` |
| CLI (`opencodev2 cli`) | oui |
| GUI web (`opencodev2 web`) | oui, via l'app Vite orchestrée |
| GUI Electron (`bun run dev:desktop`) | **non** — `packages/desktop/src/main/server.ts:75-81` fork son propre sidecar `sidecar.js` en `utilityProcess`, et `src/main/index.ts:287-312` lui choisit son port (`OPENCODE_PORT`, sinon éphémère). Sa seule accroche externe est `getDefaultServerUrl()`/`setDefaultServerUrl()` (`server.ts:35-47`, clé `defaultServerUrl` en `constants.ts:8`). |

## Vérifications de référence

- Identité : `opencodev2 --version` répond `local` depuis les sources (une version numérique
  signalerait le binaire installé), et `GET /global/health` répond `{"healthy":true,"version":"local"}`.
- Aucun binaire déployé : le nombre de processus `opencodev2.exe` ne bouge pas pendant
  `opencodev2`, `opencodev2 cli` et `opencodev2 web`.
- `opencodev2 web` : `vite.exe … packages/app/…/vite.exe --port 3000` dans la table de processus, et
  `http://localhost:3000` sert du HTML qui référence le client de dev Vite (`/@vite/client`) — donc
  du code live, pas un instantané de build.
- Rechargement : modifier un fichier de `packages/opencode/src` suffit à changer ce que l'API répond
  (le champ `runtime.pid` de `/plugin` change), sans rebuild ni redéploiement, et une session créée
  avant reste lisible.
