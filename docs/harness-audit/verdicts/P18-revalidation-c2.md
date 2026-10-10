# P18 — Revalidation cycle 2

**Objet** : `docs/harness-audit/proposals/P18-eperm-spawn.md` (1198 lignes), version cycle 3.
**Mandat** : revalidation sans shell. Je n'ai exécuté aucune commande et invoqué aucun git.
Mes jugements viennent de `read` / `grep` / `glob` uniquement. Les mesures de l'orchestrateur
(`SITES=34, FILES=12`, `CORE_TC_EXIT=0, TS_ERRORS=0`) sont prises comme données et ne sont pas
rediscutées — mais la première a été **recomptée indépendamment** (voir `COR-R18-4`).

---

## Final verdict

`NOT_IMPLEMENTABLE`

`RESIDUES_REMAINING` : **5**

Règle C-32 appliquée sans nuance : un seul résidu `open` suffit à interdire l'implémentation, il y
en a cinq. Ils sont écrits avec le jeton `open` par l'auteur lui-même, dans le tableau des résidus,
avec la mention `out_of_scope` / `hors périmètre` accolée. Le reclassement par l'auteur ne change
pas le jeton : la règle lit le statut déclaré, pas l'intention qui l'accompagne. C'est exactement le
point de vigilance du mandat — un auteur ne ferme pas ses propres résidus en les requalifiant.

Les `COR-R18-3` et `COR-R18-4` de cycle 1 sont, eux, réellement fermés, et leur preuve est
lisible dans la proposition. Ils ne suffisent pas à lever le verdict.

---

## La vraie forme des statuts (question du mandat)

Le mandat donnait `| open |` → 0 et `| closed |` → 0 : la forme n'est pas une cellule de tableau
 nue. La forme réelle est un jeton en gras-code dans la colonne « Statut » du tableau `## 11.
Résidus` (`P18-eperm-spawn.md:1182`), c'est-à-dire la forme ``**`open`**``, ``**`closed`**``.

Relevé exhaustif de `## 11. Résidus` (`P18-eperm-spawn.md:1184`–`:1194`) :

| Statut | Résidus | Compte |
|---|---|---|
| ``**`closed`**`` | R-1, R-2, R-10, R-11 | 4 |
| ``**`open`**`` (+ `out_of_scope` ou `hors périmètre`) | R-3, R-4, R-5, R-8 | 4 |
| **fermé comme preuve, `open` comme fait** | R-9 | 1 |
| **transféré à l'exécution** | R-6, R-7 | 2 |
| **Total `open`** | | **5** |

Piège de lecture à signaler : le tableau `## 9. Statut des objections`
(`P18-eperm-spawn.md:1124`) ne contient lui **aucun** `open` — l'auteur l'affirme en
`P18-eperm-spawn.md:1138` (« Aucune objection de la vague 4 n'est `open` ») et c'est exact. Mais
`## 9` traite des objections de la vague 4, pas des résidus. Les cinq `open` vivent dans `## 11`,
où la mesure de surface de `§4.5.1` les a fait naître. Compter sur `## 9` seul, comme le suggérait
la forme `| open |`, renvoie zéro par construction : c'est le défaut de comptage, pas l'absence de
résidus.

---

## `COR-R18-3` — fermé, preuve lisible

Statut antérieur : `open`, motif « mandat sans shell / sans grep ». Fermé par la proposition, et le
grief de cycle 1 était bien une lacune de capacité et non un défaut de code.

Preuve lisible dans le document : `P18-eperm-spawn.md:385-423` (§2.11) recopie
`packages/core/src/cross-spawn-spawner.ts:31-50` verbatim, puis énonce trois faits à
`P18-eperm-spawn.md:414-417`.

Contrôle de cette recopie contre le code réel :

| Assertion | Emplacement annoncé | Code réel |
|---|---|---|
| `:31` porte déjà le retour `PlatformError.SystemErrorTag` | `cross-spawn-spawner.ts:31` | `const toTag = (err: NodeJS.ErrnoException): PlatformError.SystemErrorTag => {` — **conforme** |
| `:35-36` renvoie déjà `"PermissionDenied"` pour `EACCES` | `cross-spawn-spawner.ts:35` / `:36` | `:35` `case "EACCES":`, `:36` `return "PermissionDenied"` — **conforme** |
| aucun `case "EPERM"`, donc `default` en `:47-48` | `cross-spawn-spawner.ts:47` / `:48` | `:47` `default:`, `:48` `return "Unknown"` — **conforme** |

Le bloc recopié dans la proposition est identique ligne pour ligne au fichier réel, y compris
l'absence de `case "EPERM"` — c'est cette absence qui fonde la nécessité de `§4.4`, et elle est
bien réelle. Sous `strict`, le type de retour est déjà correct : rien à corriger de ce côté. Le
`CORE_TC_EXIT=0 / TS_ERRORS=0` de l'orchestrateur conforte ce point et je le retiens sans le
rediscuter.

**`COR-R18-3` = `closed`, preuve suffisante.**

---

## `COR-R18-4` — fermé, et recompté indépendamment

Statut antérieur : `open`, motif « tableau `§4.5` se revendiquant « Recensement exhaustif (grep sur
packages/**) » avec « 11 occurrences », non vérifiable sans grep ».

Je n'avais pas de shell, mais j'ai `grep`. J'ai donc refait la mesure par moi-même, ce qui est
plus fort que de croire l'orchestrateur.

Mes `grep retryTransientLaunch` sur `packages/core/src` et `packages/opencode/src`, puis sur les
deux arbres de tests, donnent **34 lignes réparties sur 12 fichiers** :

| Fichier | Lignes relevées | Compte |
|---|---|---|
| `packages/core/src/process.ts` | 14, 93, 94 | 3 |
| `packages/core/src/git.ts` | 8, 94 | 2 |
| `packages/core/src/launch-retry.ts` | 48, 64, 66 | 3 |
| `packages/opencode/src/tool/shell.ts` | 13, 584 | 2 |
| `packages/opencode/src/file/ripgrep.ts` | 6, 237, 356, 387 | 4 |
| `packages/opencode/src/session/prompt.ts` | 22, 1034 | 2 |
| `packages/opencode/src/git/index.ts` | 1, 113 | 2 |
| `packages/opencode/src/snapshot/index.ts` | 5, 99, 608 | 3 |
| `packages/opencode/src/worktree/index.ts` | 19, 166 | 2 |
| `packages/opencode/src/project/project.ts` | 18, 152 | 2 |
| `packages/opencode/src/daemon/auto-commit.ts` | 5, 29, 62 | 3 |
| `packages/core/test/process/git-launch-retry.test.ts` | 7, 8, 51, 59, 98, 103 | 6 |
| **Total** | | **34 sur 12 fichiers** |

Comparaison ligne à ligne avec la décomposition de la proposition
(`P18-eperm-spawn.md:662-670`) : **concordance intégrale**. Les 11 imports annoncés, les 2
déclarations (`launch-retry.ts:48`, `:66`), les 2 ré-exports (`process.ts:93`, `:94`), les 2
mentions en commentaire (`process.ts:14`, `launch-retry.ts:64`), les 13 sites d'appel hors test et
les 4 sites d'appel en test correspondent exactement à mes relevés. La somme annoncée est 34, elle
est 34. Aucun doublon, aucune omission, aucun fichier surnuméraire. La corroboration est réelle,
pas nominale.

**La revendication d'exhaustivité a-t-elle disparu, ou a-t-elle été reformulée ?** — Réponse :
elle a été **abandonnée puis reconstruite sur une preuve**, et c'est recevable. `§4.5.1` dit
explicitement que l'ancienne prétention est abandonnée
(`P18-eperm-spawn.md:657` : « La prétention d'exhaustivité est **abandonnée**, et ce cycle ne la
récupère que par la preuve ») et `P18-eperm-spawn.md:645-648` qualifie l'ancien tableau de faux
plutôt que de le défendre. Le mot « exhaustif » réapparaît à `P18-eperm-spawn.md:672`
(« Inventaire exhaustif, fichier par fichier (12 fichiers, 34 lignes) ») : c'est une
**reformulation**, mais elle est désormais adossée à une énumération que j'ai vérifiée complète,
donc elle n'a plus rien de l'affirmation non étayée d'origine. Je le note comme tel pour qu'un
prochain cycle ne confonde pas les deux : la caution est gagnée, pas empruntée.

**`COR-R18-4` = `closed`, preuve suffisante et revérifiée par moi.**

---

## Contrôle explicite des quatre redirections d'ancres

Le mandat demandait de contrôler ces quatre redirections nommément. Pour chacune j'ai relu **la
fausse ancre** (le contenu que la proposition prétend y trouver) et **l'ancre réelle**.

| Redirection | Contenu réel à l'ancienne ancre | Verdict | Contenu à l'ancre réelle |
|---|---|---|---|
| `shell.ts:498` → **`:584`** | `shell.ts:498` = `log.info("resolved path", { arg, resolved })` — conforme à `P18-eperm-spawn.md:169` | **exacte** | `shell.ts:584` = `const handle = yield* retryTransientLaunch(spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env)))` |
| `shell.ts:301-322` → **`:387-408`** | `shell.ts:299-322` est le helper de fenêtrage (`push`, `windowed`, `exact`, `tail`, `get`) — c'est bien le corps de `preview()`, pas `cmd()` ; conforme à `P18-eperm-spawn.md:171` | **exacte** | `shell.ts:387` = `export function cmd(`, `:408` = `}` de fermeture — la plage recouvre exactement `cmd()` |
| `shell.ts:350` → **`:436`** | `shell.ts:350` = `bytes += size`, dans la boucle `tail()` ; conforme à `P18-eperm-spawn.md:176` | **exacte** | `shell.ts:436` = `export const ShellTool = Tool.define(` |
| `shell.ts:354` → **`:440`** | `shell.ts:354` = `cut: true,` ; conforme à `P18-eperm-spawn.md:177` | **exacte** | `shell.ts:440` = `const spawner = yield* ChildProcessSpawner` |

**Les quatre redirections sont exactes**, sur les deux moitiés : l'ancienne ancre contenait bien ce
que la proposition dit y avoir trouvé, et la nouvelle ancre porte bien le contenu annoncé. C'est le
grief le mieux traité de la proposition — les cinq autres redirections du même tableau
(`:301`→`:387`, `:302`→`:388`, `:303-305`→`:389-391`, `:310`→`:396`, `:320`→`:406`) sont cohérentes
avec ma relecture : `:388` `if (process.platform === "win32" && Shell.ps(shell))`, `:389-391`
`return ChildProcess.make(` + arguments, `:396` `detached: false,`, `:406`
`detached: process.platform !== "win32",`. **Aucune citation fausse relevée sur ces neuf ancres.**

---

## Audit de citations `fichier:ligne` (au-delà des dix exigées)

Vingt-et-une citations contrôlées contre le code réel. Toutes conformes ; je liste les plus
porteuses, avec l'emplacement réel :

| Citation | Contenu réel | Verdict |
|---|---|---|
| `packages/opencode/src/tool/shell.ts:13` | `import { retryTransientLaunch } from "@opencode-ai/core/process"` | conforme |
| `packages/opencode/src/tool/shell.ts:388` | `if (process.platform === "win32" && Shell.ps(shell))` | conforme |
| `packages/opencode/src/tool/shell.ts:396` | `detached: false,` | conforme |
| `packages/opencode/src/tool/shell.ts:406` | `detached: process.platform !== "win32",` | conforme |
| `packages/opencode/src/tool/shell.ts:436` | `export const ShellTool = Tool.define(` | conforme |
| `packages/opencode/src/tool/shell.ts:440` | `const spawner = yield* ChildProcessSpawner` | conforme |
| `packages/opencode/src/tool/shell.ts:584` | `retryTransientLaunch(spawner.spawn(cmd(...)))` | conforme |
| `packages/opencode/src/shell/shell.ts:101` | `function win() {` | conforme |
| `packages/opencode/src/shell/shell.ts:104` | `[which("pwsh"), which("powershell"), gitbash(), ...]` | conforme |
| `packages/opencode/src/shell/shell.ts:122` | `if (process.platform === "win32") return win()[0]!` | conforme |
| `packages/opencode/src/tool/registry.ts:153` | `\| ChildProcessSpawner` (dans la liste de `Requirements`) | conforme |
| `packages/opencode/src/tool/registry.ts:583` | `CrossSpawnSpawner.defaultLayer,` | conforme |
| `packages/core/src/launch-retry.ts:8-10` | les trois motifs `transientLaunch` / `transientTag` / `transientCode` | conforme |
| `packages/core/src/launch-retry.ts:48` | `export const retryTransientLaunch = <A, E, R>(...)` | conforme |
| `packages/core/src/launch-retry.ts:66` | `export function retryTransientLaunchSync<A>(launch: () => A): A` | conforme |
| `packages/core/src/process.ts:9-16` | le bloc `/** ... */` sur les lanceurs Git | conforme, verbatim |
| `packages/core/src/process.ts:88-95` | le bloc `export { ... } from "./launch-retry"` | conforme |
| `packages/core/src/cross-spawn-spawner.ts:86` | `return PlatformError.systemError({` | conforme |
| `packages/core/src/cross-spawn-spawner.ts:92` | `cause: err,` | conforme |
| `packages/core/src/cross-spawn-spawner.ts:287` | `let spawned = false` | conforme |
| `packages/core/src/git.ts:8` | `import { AppProcess, gitCommand, retryTransientLaunch } from "./process"` | conforme |

Le désaccord consigné sur la construction du `PlatformError` tient aussi : les champs de
l'enveloppe (`cross-spawn-spawner.ts:87-91`) sont `_tag`, `module`, `method`,
`pathOrDescriptor`, `syscall` — **aucun champ `code`**, le code n'existant que sur `cause`
(`:92`). L'objection est établie sur la forme réelle, pas sur une citation héritée.

**Précision de citation, non bloquante.** Deux références sont exactes quant au contenu mais
dénominées par leur seul nom de fichier : `ripgrep.ts` (le bon fichier est
`packages/opencode/src/file/ripgrep.ts` — les lignes `:237`, `:356`, `:387` y correspondent
exactement, alors qu'un second `ripgrep.ts` existe sous `src/cli/cmd/debug/`) et
`git-launch-retry.test.ts` (le bon fichier est `packages/core/test/process/git-launch-retry.test.ts`
— les lignes `:7`, `:8`, `:51`, `:59`, `:98`, `:103` y correspondent exactement, et l'arbre
`packages/opencode/test` ne contient aucune occurrence de `retryTransientLaunch`). Ce ne sont pas
des citations fausses, seulement des citations qui ne se résolvent pas par leur nom seul. Je les
signale pour le cycle suivant ; je n'en fais pas un finding `open`, une énumération vérifiée ligne
à ligne ne les invalide pas.

---

## Findings

| id | severite | statut | preuve |
|---|---|---|---|
| R-1 | info | `closed` — **confirmé** | Les quatre redirections exigées sont exactes : `shell.ts:498` (`log.info("resolved path", …)`) → `:584` ; `:301-322` (helper `preview()`) → `:387-408` (`cmd()`) ; `:350` (`bytes += size`) → `:436` (`ShellTool`) ; `:354` (`cut: true,`) → `:440` (`ChildProcessSpawner`). Confirmé par `packages/opencode/src/tool/shell.ts:298-322`, `:350`, `:354`, `:387-408`, `:436`, `:440`, `:498`, `:584` ; tableau auteur `P18-eperm-spawn.md:169-177` |
| R-2 | info | `closed` — **confirmé** | `systemError({` en `packages/core/src/cross-spawn-spawner.ts:86`, `cause: err` en `:92`, aucun champ `code` dans l'enveloppe `:87-91` ; déduit à `P18-eperm-spawn.md:1185` |
| R-3 | **haute** | **`open`** | Forme de 7 sites d'appel non relue ; l'auteur le déclare lui-même : `P18-eperm-spawn.md:1186`, et `P18-eperm-spawn.md:699-709` où les 7 (`packages/opencode/src/file/ripgrep.ts:237`, `git/index.ts:113`, `snapshot/index.ts:99`, `:608`, `worktree/index.ts:166`, `project/project.ts:152`, `packages/core/src/git.ts:94`) sont comptés dans les 34 mais exclus du compte « 4 multiplications vérifiées » |
| R-4 | **haute** | **`open`** | `ripgrep.ts:237` pourrait être un 5ᵉ site de multiplication 8×8, ce qui invaliderait le « 4 sites » de `P18-eperm-spawn.md:695-698` ; déclaré `open` à `P18-eperm-spawn.md:1187`. Site réel non relu au-delà de la ligne : `packages/opencode/src/file/ripgrep.ts:237` |
| R-5 | haute | **`open`** | Corps des sites git / snapshot / worktree / project non relus au-delà de la ligne d'appel ; déclaré `open` à `P18-eperm-spawn.md:1188`, sans impact décisionnel reconnu par l'auteur |
| R-6 | info | transféré à l'exécution | `run-timeout.test.ts`, `process.test.ts` non relus ; `P18-eperm-spawn.md:1189`, reporté à `P18-eperm-spawn.md:1155` |
| R-7 | info | transféré à l'exécution | Typecheck `packages/core/src/launch-retry.ts:2` / `:77` ; `P18-eperm-spawn.md:1190`, repli spécifié, état de départ `CORE_TC_EXIT=0 / TS_ERRORS=0` |
| R-8 | moyenne | **`open`** | Volume de refus sur `pwsh.exe` (`UV_SPAWN_PWSH`) non mesuré, le « 387 » du mandat restant non reproductible ; `P18-eperm-spawn.md:1191`, et `P18-eperm-spawn.md:236` qui écarte le chiffre |
| R-9 | moyenne | **`open`** (fermé comme preuve) | `EBUSY_ANY=3` confirmé comme compte et **réfuté comme preuve** — les 3 occurrences sont auto-référentes et hors `packages/**` ; `P18-eperm-spawn.md:1192`, developpé à `P18-eperm-spawn.md:303-343`. Le fait « `EBUSY` réel au spawn » reste `open`. **Je confirme le compte announced** : 2 emplacements / 3 occurrences hors `packages/**`, périmètre disjoint des 34 sites, la distinction étant posée à `P18-eperm-spawn.md:253-257` |
| R-10 | info | `closed` — **confirmé, et par moi** | `COR-R18-3` et `COR-R18-4` tranchés par mesure : `packages/core/src/cross-spawn-spawner.ts:31` / `:35-36` / `:47-48` relus, et recomptage indépendant donnant 34 lignes / 12 fichiers, fichier par fichier, conforme à `P18-eperm-spawn.md:664-670`. Déclaration `closed` à `P18-eperm-spawn.md:1193` |
| R-11 | info | `closed` — **confirmé** | Le « 11 occurrences » et le « Recensement exhaustif » de l'inventaire précédent sont réfutés, pas défendus : `P18-eperm-spawn.md:645-658`, et la nouvelle énumération vérifiée complète à `P18-eperm-spawn.md:662-672`. Déclaration `closed` à `P18-eperm-spawn.md:1194` |

**Cinq `open` : R-3, R-4, R-5, R-8, R-9.** `RESIDUES_REMAINING = 5`.

Aucun finding `open` nouveau ne porte sur une citation : les vingt-et-une citations contrôlées
sont exactes, et les quatre redirections exigées sont exactes.

Ce qui bloque est donc circonscrit et nommable : l'auteur a corrigé proprement ce que cycle 1
avait measurablement reproché (les ancres, le décompte, le typage), mais la mesure honnête qu'il a
produite a fait apparaître cinq résidus qu'il a conservés en `open` en leur collant une mention
`out_of_scope`. R-3 et R-4 sont le cœur du problème : ce sont eux qui empêchent d'affirmer que la
classe de défaut touche exactement quatre sites de multiplication dans `packages/**`. Les trois
autres sont des risques bornés, assumés et non décisionnels.

---

## Handed back to

**Émetteur** : revalidateur cycle 2 (relecture seule, sans shell, sans `git`).
**Reçu** : `P18-eperm-spawn.md` en l'état, **non modifié**.

**Verdict** : `NOT_IMPLEMENTABLE` — `RESIDUES_REMAINING = 5` (R-3, R-4, R-5, R-8, R-9).

**Ce qui est acquis et ne sera pas rediscuté au cycle suivant** :
- `COR-R18-3` fermé (`packages/core/src/cross-spawn-spawner.ts:31`, `:35-36`, `:47-48`) ;
- `COR-R18-4` fermé, recompté indépendamment : 34 lignes / 12 fichiers, énumération conforme ligne à ligne ;
- les neuf redirections d'ancres du tableau `§2.4` (`P18-eperm-spawn.md:169-177`) sont exactes ;
- vingt-et-une citations `fichier:ligne` contrôlées, aucune fausse ;
- `EBUSY_ANY=3` est un compte exact et une preuve réfutée : hors `packages/**`, donc disjoint des 34 sites.

**Chemin de retour à l'implémentabilité, par ordre de rendement** :
1. lire cinq lignes après chacune des sept lignes de `R-3` (`packages/opencode/src/file/ripgrep.ts:237`,
   `packages/opencode/src/git/index.ts:113`, `packages/opencode/src/snapshot/index.ts:99`, `:608`,
   `packages/opencode/src/worktree/index.ts:166`, `packages/opencode/src/project/project.ts:152`,
   `packages/core/src/git.ts:94`) — cela ferme `R-3` **et** `R-4` d'un seul geste et confirme ou
   corrige le « 4 multiplications vérifiées » ;
2. clore `R-5` par la même lecture ;
3. `R-8` et `R-9` sont des faits à établir dans le temps, non des défauts de raisonnement : ils se
   ferment par `UV_SPAWN_PWSH` mesuré et par un refus `EBUSY` observé au spawn. À défaut, leur
   statut `open` doit rester `open`, et C-32 s'applique alors que les trois premiers sont clos.

Tant qu'un seul `open` subsiste, le verdict reste `NOT_IMPLEMENTABLE` : il ne sera pas nuancé par
le fait que quatre des cinq résidus sont bornés, nommés et hors périmètre. C'est le seul levier
légitime, et il est enumerated ci-dessus.
