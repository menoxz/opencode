# P18 — le refus EPERM au spawn du shell : budget doublé et message d'erreur non actionnable

> Révisé cycle 2 après REVALIDATED-PASS_WITH_CHANGES du 2026-10-03 — branche Busy testée,
> compteur inconditionnel, EBUSY_ANY audité ou retiré.
>
> *Datation* : l'en-tête de `P18-revalidation.md:1-22` ne porte pas de date ; la date ci-dessus
> est celle de cette révision.
>
> **Les cinq objections de la vague 4 sont tranchées, aucune par `accepted`** (§9) :
> 4 `closed` (1, 2, 3, 5), 1 `out_of_scope` (4, Named reliquat `P18-bis`). **Aucun résidu
> `open`** — l'implémentation n'est donc pas bloquée par ce cycle.
>
> **Ce que ce cycle change, en une ligne chacune.**
> - **Objection 2 (la plus grave)** : un **test unique et dédié** exerce enfin la branche
>   `Busy`, en pairant `Busy` et `PermissionDenied` pour que la fourche soit indiscernable
>   d'un `tagOf` cassé. Elle vit dans un **nouveau fichier core** —
>   `packages/core/test/process/launch-refused.test.ts` — pas dans un test d'outil.
> - **Objection 1** : le titre `:94` est réécrit, le **compteur devient inconditionnel**, et le
>   commentaire `:102` — qui avait le même défaut que le titre — est réécrit avec lui.
> - **Point à auditer** : `EBUSY_ANY=3` a été **audité offset par offset**. Le compte se
>   confirme (3 occurrences brutes) mais **toutes les trois sont des mentions auto-référentes**
>   du mandat lui-même ; **aucun refus `EBUSY` n'est établi**. La branche est **conservée et
>   testée**, mais **re-groundée** sur trois faits relus dans le code au lieu du compte (§2.9).
> - **Objection 5** : `launchRefused` renvoie un **`PlatformError` taggé**, plus un `Error` nu :
>   le tag survit *et* le diagnostic reste lisible par les lecteurs d'errno. Les deux propriétés
>   gagnées.
> - **Objection 3** : la délégation de RC1 est écrite, et le **recouvrement** entre les tests est
>   **supprimé** par une répartition explicite des assertions (§7).
>
> **Ce qui est conservé de la vague 2, tel quel.** RC1 (test 1 réécrit, `starts.count === 1` +
> `No process was created`), RC2 (`errnoOf`/`tagOf`, suffixe conditionné), RC3 (`launchRefused`
> ajouté au bloc `export` de `process.ts:88-95`), RC4 (§2.5 « bornée », le « 387 » écarté). Le
> désaccord consign�� sur `cross-spawn-spawner.ts:86-93` — le `code` n'existant que sur `cause` —
> est **maintenu et motivé** en §5.5 : le validateur a tort, et la forme réelle est relue.
>
> **Périmètre inchangé, thèse inchangée.** La prémisse du mandat initial (« aucune politique de
> retry ne couvre le spawn de `pwsh.exe` ») reste **fausse** : `isTransientLaunchFailure` est
> déjà appliqué à **tout** spawn par le chokepoint (§2.6). Le défaut est la **multiplication** du
> budget (64 `launch()`, ~57 s) et un **échec final non actionnable**.

## 1. Problem

Quand Windows refuse de créer un processus, l'outil `bash` gaspille ~57 s en tentatives
redondantes, puis renvoie au modèle une erreur qui ne dit ni ce qui a été tenté, ni ce qu'il
faudrait faire.

## 2. Evidence

### 2.1 Le périmètre du correctif git précédent est explicitement borné

`packages/core/src/process.ts:9-16` :

```
/**
 * Windows resolves `git` to one of two small launchers, `Git\cmd\git.exe` or `Git\bin\git.exe`, that
 * re-exec the real `Git\mingw64\bin\git.exe` in a second process. That nested spawn intermittently
 * fails on this host with `EPERM: operation not permitted, uv_spawn 'git'` or "error launching git"
 * (measured: one failure in eighty starts for either launcher, zero for the real binary). The refusal
 * happens in a process opencode never launched, so `retryTransientLaunch` cannot observe or retry it.
 * Resolving the launcher to the real binary drops the second spawn and the whole failure mode with it.
 */
```

La phrase désigne un refus survenu **dans un processus que opencode n'a pas lancé** (le
lanceur Git qui re-exécute `mingw64/bin/git.exe`, cf. `:10-12`). Rien n'y empêche d'observer un
refus **par** opencode lui-même.

### 2.2 La classification est agnostique de l'exécutable

`packages/core/src/launch-retry.ts:8-10` :

```
const transientLaunch = /EPERM|EACCES|EBUSY|operation not permitted|uv_spawn|Access is denied|Accès refusé|error launching/i
const transientTag = /^(PermissionDenied|Busy)$/
const transientCode = /^(EPERM|EACCES|EBUSY)$/
```

Aucun nom d'exécutable n'apparaît dans `transientLaunch` : `EPERM` et `uv_spawn` correspondent
quelle que soit la cible. **Six classes d'échec franchissent cette garde**, dont `EBUSY`
(`:8`) et `Busy` (`:9`) — cette largeur est ce qui rend la formulation de §4.2 non
déterministe.

Le commentaire `:4-7` fixe la sémantique que P18 doit préserver :

```
// Windows intermittently refuses to create a child process (`EPERM`/`EACCES`,
// "Accès refusé"). The process never started, so retrying cannot duplicate or
// corrupt repository state. `AppProcessError` carries an empty `message`: the
// denial only survives in `cause`/`stderr`, so those must be inspected too.
```

### 2.3 Le refus devient visible à l'écoute `error`, avant tout `spawn`

`packages/core/src/cross-spawn-spawner.ts:284-298` :

```
      const start = (attempt: number) => {
        const proc = launch(command.command, command.args, opts)
        current = proc
        let spawned = false
        let end = false
        proc.on("error", (err) => {
          const failure = toPlatformError("spawn", err, command)
          if (!spawned && !settled && attempt + 1 < LAUNCH_RETRY_ATTEMPTS && isTransientLaunchFailure(failure)) {
            setTimeout(() => start(attempt + 1), launchRetryDelayMs(attempt))
            return
          }
          if (settled) return
          settled = true
          resume(Effect.fail(failure))
        })
```

Le garde `:291` et l'échec final `:297` sont les deux lignes qui portent tout le raisonnement
de §3.

### 2.4 Le chemin exact `bash` → `pwsh.exe`, et le spawner qui l'exécute

| Étape | Citation |
|---|---|
| Le shell est résolu par `which("pwsh")` | `packages/opencode/src/shell/shell.ts:104` |
| Le premier candidat gagne | `packages/opencode/src/shell/shell.ts:122` — `if (process.platform === "win32") return win()[0]!` |
| La commande est construite en PowerShell natif | `packages/opencode/src/tool/shell.ts:302-305` — `if (process.platform === "win32" && Shell.ps(shell))` puis `ChildProcess.make(shell, [...])` |
| L'outil récupère le spawner ambiant | `packages/opencode/src/tool/shell.ts:354` — `const spawner = yield* ChildProcessSpawner` |
| `ChildProcessSpawner` est une exigence de la couche outils | `packages/opencode/src/tool/registry.ts:153` |
| La couche qui construit les outils fournit `CrossSpawnSpawner.defaultLayer` | `packages/opencode/src/tool/registry.ts:583` |
| Le spawn effectif, **enveloppé dans un second retry** | `packages/opencode/src/tool/shell.ts:498` |

`win()` (`shell/shell.ts:101-109`) donne `pwsh` la priorité, et `select` (`:117-124`) renvoie
`win()[0]!` sous Windows — donc `pwsh` gagne quand il est installé, `resolve` (`:92-99`)
transformant le nom en chemin absolu.

### 2.5 Erreur terrain exacte, et ce qu'elle ne prouve pas

```
EPERM: operation not permitted, uv_spawn 'C:\Program Files\PowerShell\7\pwsh.EXE'
```

**Formulation bornée — la transience n'est pas établie, elle est bornée.** Le mandat et la
version initiale de cette proposition affirmaient que « le refus est transitoire, reproduit
deux fois, la tentative suivante ayant réussi ». Cette affirmation est **abandonnée** : elle
repose sur deux observations auto-rapportées, sans artefact.

L'argument est de surcroît **inversible** : un `EPERM` causé par un antivirus ou une ACL est
**permanent**, et produirait tout aussi bien un volume élevé d'occurrences. Aucun volume ne
départage donc les deux hypothèses.

Ce qui sauve le correctif, et c'est le seul argument que P18 retient : **en cas de cause
permanente, le coût tombe de ~57 s à 6 350 ms par appel** (un budget au lieu de huit), et le
message de §4.1 nomme le levier droits — le bon levier pour un `EPERM` permanent. Le risque
est donc **borné et acceptable**, énoncé comme tel et non comme une transience établie.

*Mesure manquante à produire avant tout argument de volume* — compter, sur une fenêtre fixe,
le ratio refus/succès sur `pwsh.exe` : instrumenter `cross-spawn-spawner.ts:285` pour
compter `launch()` par cible et par issue, agréger sur 24 h, puis rapporter
`refus(pwsh)/lancement(pwsh)`. Aucune modification de `packages/**` n'est requise pour ce
diagnostic.

### 2.6 Correction de deux affirmations du mandat

**(a) Chemins obsolètes.** Le mandat cite `packages/opencode/src/tool/launch-retry.ts:8` et
`packages/opencode/src/tool/cross-spawn-spawner.ts:279`. Ces fichiers sont dans
`packages/core/src/`. Les numéros de ligne, eux, sont exacts.

**(b) « Aucune de ces branches ne cible le spawn de `pwsh.exe` observé » est faux.** Les
preuves 2.2, 2.3 et 2.4 établissent la chaîne complète :

1. `shell.ts:354` obtient le `ChildProcessSpawner` ambiant ;
2. `registry.ts:153` en fait une exigence de la couche outils ;
3. `registry.ts:583` fournit `CrossSpawnSpawner.defaultLayer` à cette couche ;
4. `cross-spawn-spawner.ts:284-298` applique `isTransientLaunchFailure` — générique (§2.2) — à
   **tout** spawn, `pwsh.exe` compris.

La politique de retry couvre donc déjà le spawn de `pwsh.exe`. Le défaut est la
**multiplication**, pas l'absence de couverture.

### 2.7 Aucun volume de refus n'est reproductible — et les `EPERM` ne sont pas des refus

Le comptage de la vague 2 (`FILES=11`, `UV_SPAWN_TOTAL=1`, `UV_SPAWN_PWSH=0`, `EPERM_ANY=11`,
`EBUSY_ANY=3`) **n'est pas rejouable par cette révision** : il exige un shell, interdit ici.
Ses deux seules conclusions transmissibles sont conservées :

- `UV_SPAWN_PWSH=0` — **aucun** refus sur `pwsh` n'a été observé. Le « 387 » du mandat reste
  **non reproductible** et est écarté de l'argumentaire ; le raisonnement de §4 ne repose que
  sur la duplication mécanique démontrée en §3.
- `EPERM_ANY=11` est, selon la révision, **une occurrence par fichier** — la signature d'une
  mention descriptive (l'entrée de journal décrivant le mandat), pas de 11 refus réels.

**`EBUSY_ANY=3` a été audité dans ce cycle et ne survit pas** — voir §2.9.

### 2.8 Couverture de test existante — et un test qui encode le budget multiplié

**a. `packages/opencode/test/tool/shell-launch-retry.test.ts` (106 lignes) existe et asserte
le comportement que §4.3 supprime.** Mécanisme, ligne par ligne :

- `:54-68` — la couche `refusedLaunches` remplace `ChildProcessSpawner.of({ ...real, spawn })`
  **au-dessus** du chokepoint interne (`:68` fournit `CrossSpawnSpawner.defaultLayer`). Le
  retry de `cross-spawn-spawner.ts:284-298` est donc **court-circuité** : il ne s'exécute
  jamais dans ce test, et `starts.count` ne compte que les appels de la politique
  **externe**.
- `:19-20` — `// one start plus the four retries the shared policy allows` et
  `const LAUNCH_BUDGET = 5`.
- `:52-53` — le commentaire annonce « refuses the launch a fixed number of times, then
  fails for a real reason ».
- `:62` — `if (!SHELL.test(commandName(command))) return real.spawn(command)`.
- `:63-64` — `starts.count += 1` puis
  `starts.count < LAUNCH_BUDGET ? Effect.fail(refused(command)) : Effect.fail(permanent(command))`.
- `:94` — `it.live("spends the whole retry budget on a refused start instead of surfacing it", ...)`.
- `:102` — `// without the retry wiring the first refusal fails the tool immediately`.
- `:103` — `expect(starts.count).toBeGreaterThanOrEqual(LAUNCH_BUDGET)`.

**Arithmétique exacte.** Aujourd'hui, la politique externe fait
`times: LAUNCH_RETRY_ATTEMPTS - 1 = 7` (`launch-retry.ts:52`), donc **8** appels à `spawner.spawn`
au total : les appels 1 à 4 rendent `refused` (1..4 < 5), l'appel 5 et suivants rendent
`permanent`. `:103` vérifie `8 >= 5` → **vert**.

**Après §4.3** (retrait de `retryTransientLaunch` en `shell.ts:498`) : un seul et unique
`spawner.spawn` est appelé, il échoue en `refused`, et l'assertion devient `1 >= 5` →
**échec**. Ce n'est pas une régression de comportement mais un test qui encode l'ancien
budget multiplié : il **doit** être réécrit, pas contourné (§7, test 1).

Piège d'interprétation : ce fichier ne peut **pas** servir à mesurer le budget interne — il ne
voit que la politique externe, par construction.

**b. Le refus est modélisé partout par la même forme, et elle place `code` sur la cause.**

- `packages/core/test/process/spawner-launch-retry.test.ts:15-16` —
  `Object.assign(new Error("EPERM: operation not permitted, uv_spawn 'git'"), { code: "EPERM", syscall: "uv_spawn" })`.
- `packages/opencode/test/tool/shell-launch-retry.test.ts:32-35` — la même forme, dans le champ
  `cause` du `systemError`.
- `packages/core/test/process/git-launch-retry.test.ts:63` — un test nommé « sees the denial
  through an Effect PlatformError, even when the reason tag is Unknown » : le dépôt a donc
  **déjà** un précédent pour lire l'errno *parce que* le tag ne suffit pas.

### 2.9 Audit de `EBUSY_ANY=3` — offsets relevés, compte confirmé, **preuve réfutée**

C'était le point à auditer le plus grave du mandat. `grep` sur `*.jsonl` de
`~/.config/opencode/failure-journal` : **2 emplacements de correspondance**, contenant
**3 occurrences brutes** — ce qui **reconduit exactement** `EBUSY_ANY=3`. Le compte est donc
reproductible. Mais les deux emplacements sont lus verbatim, et **aucun n'est un refus** :

**Emplacement 1 — `987d8a40….jsonl:506`.** L'entrée est un `tool: "bash"` dont la `command` est
un scan binaire de type `FindBytes($path, $needle)` dont **l'aiguille est littéralement
`[EBUSY|Access is denied]`**, et dont l'`error` rapporte les offsets trouvés dans
`opencodev2.exe` (`cur(2.2.14) = 104783055`, `v11 = -1`, `v13 = -1`). C'est une **recherche de
la chaîne `EBUSY` dans un binaire** — deux occurrences brutes, dans l'aiguille et dans son
résultat.

**Emplacement 2 — `987d8a40….jsonl:623`.** L'`error` contient un **hunk de diff** citant
`launch-retry.ts` mot pour mot :

```
…|error launching/i
+const transientLaunch = /EPERM|EACCES|EBUSY|operation not permitted|uv_spawn|Access is denied|Accès refusé|error launching/i
+const transientTag =
```

C'est l'entrée de journal qui a **enregistré le patch de `launch-retry.ts:8`** — autrement
dit, le mandat lui-même. Une occurrence brute.

**Conclusion de l'audit.** Les trois occurrences sont des **mentions auto-référentes du
sujet de P18**. C'est **exactement le test** que la vague 2 avait appliqué à `EPERM_ANY=11` — une
mention par fichier, donc descriptive — et le même test s'applique ici avec le même verdict.
`EBUSY_ANY=3` est donc **confirmé comme compte d'occurrences et réfuté comme preuve d'un refus
`EBUSY`**. Comme `UV_SPAWN_PWSH=0` (§2.7), **aucun refus `EBUSY` au spawn n'est établi**, et la
vague 2 le disait : sur le chemin du spawn, un `EBUSY` de `uv_spawn` est peu plausible.

**Corroboration honnête, ailleurs.** Le dépôt documente un `EBUSY` **réel**, mais sur un autre
syscall — `packages/core/src/filesystem.ts:97-103` :

```
      // Atomic replace: rename is atomic on POSIX and Windows, so an interrupted
      // process leaves the previous file intact instead of a half-written one.
      // … On Windows the rename itself can
      // fail transiently (EPERM/EACCES/EBUSY) while another writer is replacing
      // the same destination, so retry briefly on those codes only.
```

L'errno est donc **vivant sur cet hôte**, et le dépôt a **déjà dealt avec cette bifurcation** :
`filesystem.ts:105-108` teste `e.reason._tag === "PermissionDenied"` **et**
`e.reason._tag === "Busy"` **côte à côte** — le même couple de leviers que §4.1. C'est un
**précédent positif dans le dépôt**, et il est plus solide que le compte du journal.

### 2.10 Pourquoi la branche `Busy` est conservée malgré l'audit

Trois faits, tous relus dans le code, suffisent — aucun ne dépend d'un compteur :

1. **La branche est atteignable par construction.** `toTag` mappe `EBUSY` → `"Busy"`
   (`cross-spawn-spawner.ts:43-44`), `transientTag = /^(PermissionDenied|Busy)$/`
   (`launch-retry.ts:9`) fait de `Busy` un échec transitoire **de première classe dans la
   politique du dépôt** (`:30`), et `§4.3` ne route vers `launchRefused` que les erreurs
   `isTransientLaunchFailure`-positives. Un tag `Busy` **atteint donc la fourche** dès qu'il se
   produit, sans modification d'aucun garde.
2. **Le dépôt triche déjà exactement ce couple** (`filesystem.ts:107`), donc la bifurcation
   n'est pas une invention de P18.
3. **L'asymétrie de coût est extreme.** Branche présente : si un `EBUSY` survient, le message
   dit « attendre ». Branche absente : le même `EBUSY` est diagnostiqué « accorder des droits
   d'exécution », c'est-à-dire une **invitation à escalader des privilèges face à un simple
   verrou**. Le risque du mauvais diagnostic est *plus* grave que le coût d'une branche qui
   reste muette.

Ce qui **change** dans cette révision : la branche n'est plus **justifiée** par `EBUSY_ANY=3`.
Elle est **démontrée atteignable**, corroborated par `filesystem.ts:107`, **coût-efficace**, et
— décisive — **testée** (§7, test 2). `EBUSY_ANY=3` est **retiré de l'argumentaire**.

## 3. Mechanism

1. Le modèle appelle `bash`. `ShellTool` est défini en `packages/opencode/src/tool/shell.ts:350`,
   récupère le spawner en `:354`, et construit la commande en `:498`.
2. `cmd()` (`shell.ts:301-322`) voit `process.platform === "win32"` (`:302`) et `Shell.ps(shell)`
   vrai, donc retourne `ChildProcess.make(shell, ["-NoLogo", ...])` (`:303-305`).
   `shell` vaut `C:\Program Files\PowerShell\7\pwsh.EXE` (§2.4).
3. `shell.ts:498` évalue **`retryTransientLaunch(spawner.spawn(cmd(...)))`** : deux politiques
   de retry superposées.
4. `spawner.spawn` descend jusqu'à `cross-spawn-spawner.ts:284` (`start(0)`) puis `:285`
   (`launch(...)`).
5. Windows refuse. **L'EPERM devient visible ici** : `proc.on("error")` (`:289`) se déclenche
   alors qu'aucun événement `spawn` n'a été émis (`spawned` reste `false`, `:287`).
6. Le garde `:291` est satisfait — `isTransientLaunchFailure` reconnaît `EPERM` via
   `transientCode` (`launch-retry.ts:31`) en remontant la chaîne `cause`
   (`launch-retry.ts:33`), puisque `toTag` mappe `EPERM` à `"Unknown"`
   (`cross-spawn-spawner.ts:47-48`), ce que documente `launch-retry.ts:21`. Le retry interne est
   programmé (`:292`).
7. Budget interne épuisé après 8 tentatives (`launch-retry.ts:42`) et 7 délais totalisant
   6 350 ms (`launch-retry.ts:43`) → `resume(Effect.fail(failure))` (`:297`).
8. Le retry **externe** de `shell.ts:498` (`launch-retry.ts:48-55`, `times: LAUNCH_RETRY_ATTEMPTS - 1 = 7`)
   ré-enveloppe alors l'ensemble du budget interne, jusqu'à 8 fois.
9. Une fois épuisé, l'échec remonte : le modèle reçoit un `PlatformError` portant `EPERM`/`uv_spawn`
   et un chemin, **sans compteur de tentative, sans nom de l'action corrective, et avec un `_tag`
   qui vaut `"Unknown"` pour un refus de permission**.

**Coût du défaut, chiffré.** 8 tentatives externes × 8 tentatives internes = **64 appels
`launch()`**. Somme des délais internes `50+100+200+400+800+1600+3200 = 6 350 ms`. Pire cas
`8 × 6 350 + 6 350 ≈ 57 150 ms` de pur échec avant la première réponse, contre un budget
interne de 6 350 ms.

**Processus orphelin : impossible dans les deux cas.**

- *Refus avant création* (cas observé, §2.5) : `spawned === false`, aucun `pid`, aucun handle
  noyau. `current?.kill("SIGTERM")` porte sur un `kill` inopérant. Rien à nettoyer.
- *Erreur après création* : `proc.on("spawn")` met `spawned = true` et résout le succès. Toute
  `error` ultérieure échoue au garde `:291` (`!spawned` faux), et `settled` (`:295`) empêche
  une seconde résolution. Le finaliseur de scope tue l'enfant direct, et `killGroup` utilise
  `taskkill /T /F` sous Windows.

`INFERE:` un petit-enfant pourrait survivre si la hiérarchie était détachée. Sur Windows
`detached: false` (`shell.ts:310`) et `detached: process.platform !== "win32"` (`:320`), donc la
hiérarchie reste attachée et `taskkill /T` la traverse. **Vérification** : forcer un spawn refusé
puis lister les processus enfants avec `Get-CimInstance Win32_Process`.

## 4. Proposal

Le retry n'est pas le problème : **le budget est appliqué deux fois, et l'échec final n'est
pas actionnable.** Le correctif supprime la redondance et rend l'échec final exploitable. Il
conserve un budget, mais un seul, à un seul niveau.

### 4.1 `packages/core/src/launch-retry.ts` — `launchRefused`, ses deux extracteurs, et un retour taggé

Ajouter en fin de fichier, **avant** `export type { PlatformError }` (`:77`) :

```ts
// The errno lives on `cause`, not on the PlatformError itself
// (cross-spawn-spawner.ts:92), so it has to be walked out the same way
// `isTransientLaunchFailure` walks it (:33). A refusal creates no process: there
// is nothing to clean up and the command's effect is simply absent. Naming the
// executable, the spent budget and the lever that matches *this* denial is what
// turns an errno into a decision the model can take.
const errnoOf = (error: unknown, seen = new Set<unknown>()): string | undefined => {
  if (error === null || typeof error !== "object" || seen.has(error)) return undefined
  seen.add(error)
  const f = error as { code?: unknown; cause?: unknown; reason?: unknown; stderr?: unknown }
  if (typeof f.code === "string") return f.code
  return errnoOf(f.cause, seen) ?? errnoOf(f.reason, seen) ?? errnoOf(f.stderr, seen)
}

const tagOf = (error: unknown): string | undefined => {
  const tag = (error as { reason?: { _tag?: unknown } })?.reason?._tag
  return typeof tag === "string" ? tag : undefined
}

export function launchRefused(executable: string, attempts: number, error: unknown): PlatformError.PlatformError {
  const errno = errnoOf(error) ?? "unknown"
  const tag = tagOf(error)
  // `Busy` is lock contention: waiting is the only lever. `PermissionDenied` is a
  // permission denial: only execution rights help. Same code path, opposite
  // diagnostics — the fork belongs here, not in the reader's guess.
  const lever =
    tag === "Busy"
      ? `the host was busy (${errno}); wait for the lock to clear, then retry`
      : tag === "PermissionDenied"
        ? `the host refused to create "${executable}" (${errno}); grant the executing identity rights on that path`
        : `the host refused to create "${executable}" (${errno})`
  const detail = error instanceof Error ? error.message : String(error)
  const suffix = detail.trim() ? ` Underlying error: ${detail}` : ""
  const text =
    `opencode could not start a process after ${attempts} attempts: ${lever}. No process was ` +
    `created, so the command never ran and nothing needs cleanup.${suffix}`
  // A tagged `PlatformError`, not a bare `Error`: the tool failure channel has
  // readers that branch on `_tag` (filesystem.ts:107 does, config.ts:626 does), and
  // this channel is where one was already read by tag in the test we rewrite
  // (shell-launch-retry.test.ts:40-48 builds `_tag: "Unknown"` to separate a
  // refusal from a real failure). The diagnostic stays readable by errno readers
  // because they already walk `cause` (launch-retry.ts:33).
  return PlatformError.systemError({
    _tag: tag === "Busy" ? "Busy" : "PermissionDenied",
    module: "ChildProcess",
    method: "spawn",
    pathOrDescriptor: executable,
    syscall: "uv_spawn",
    cause: new Error(text),
  })
}
```

**Effet de bord d'import, à ne pas manquer.** Construire un `PlatformError` exige un import de
**valeur**. `launch-retry.ts:2` est aujourd'hui `import type { PlatformError } from
"effect/PlatformError"` : il doit devenir
`import * as PlatformError from "effect/PlatformError"` — exactement la forme que
`cross-spawn-spawner.ts` utilise déjà pour le **même** constructeur, donc l'import est
prouvé. Conséquence à vérifier au typecheck : `launch-retry.ts:77` (`export type { PlatformError }`)
doit toujours résoudre ; s'il ne résout plus, le remplacer par
`export type * as PlatformError from "effect/PlatformError"`. *Cette révision ne peut pas
exécuter le typecheck* (shell interdit) ; le point est déclaré, pas affirmé, et il est couvert
par la porte de non-régression de §7.

**Le `_tag` retourné.** `Busy` est propagé tel quel ; tout le reste devient `PermissionDenied`,
puisque `§4.3` ne route ici que des refus et que le chemin d'échec doit rester lisible par tag
pour `filesystem.ts:107` / `config.ts:626`.

**27 lignes**, dont deux extracteurs — au-delà de l'indicatif « ≤ 15 lignes » du gabarit. L'écart
vient de la correction de §4.2 : il faut deux signaux distincts (`errno` et `_tag`) pour que le
message soit déterministe **par rapport à sa cause**. Réduire à 15 lignes imposerait de figer
l'un des deux, donc de réintroduire le défaut que §4.2 corrige.

### 4.2 `packages/core/src/process.ts` — exporter `launchRefused`

`packages/core/src/process.ts:88-95` exporte six noms et **`launchRefused` n'en fait pas
partie** :

```
export {
  isTransientLaunchFailure,
  LAUNCH_RETRY_ATTEMPTS,
  LAUNCH_RETRY_DELAYS_MS,
  launchRetryDelayMs,
  retryTransientLaunch,
  retryTransientLaunchSync,
} from "./launch-retry"
```

`launchRefused` est **à ajouter à ce bloc dans le même patch** que §4.1, sans quoi le patch ne
compile pas (symbole non exporté). Le commentaire `process.ts:85-87` (« Re-exported here
because every caller imports it from `process` ») reste vrai : c'est la raison de l'ajout.

### 4.3 `packages/opencode/src/tool/shell.ts` — retirer le retry externe, ajouter le message

Remplace `shell.ts:498` :

```ts
// The spawner already owns the launch-retry budget
// (cross-spawn-spawner.ts:284-298). Wrapping the spawn again multiplied the
// budget to 64 attempts and ~57 s of dead time for the same final refusal, so
// only the message is added here: an exhausted budget is an actionable state,
// not a crash, and the model needs the executable plus the one real lever.
const handle = yield* spawner
  .spawn(cmd(input.shell, input.command, input.cwd, input.env))
  .pipe(
    Effect.catch((error) =>
      Effect.fail(
        isTransientLaunchFailure(error) ? launchRefused(input.shell, LAUNCH_RETRY_ATTEMPTS, error) : error,
      ),
    ),
  )
```

`Effect.catch` ne traite que les échecs, pas les défauts — même sémantique que le
`Effect.retry({ while })` retiré, donc aucune régression de traitement d'erreur.

L'import `shell.ts:13` — `import { retryTransientLaunch } from "@opencode-ai/core/process"` —
doit être **remplacé** par `isTransientLaunchFailure`, `launchRefused`, `LAUNCH_RETRY_ATTEMPTS`.
`:498` est le seul usage du symbole dans ce fichier, donc l'import deviendrait mort et casserait
`noUnusedLocals` au typecheck s'il était laissé en place.

### 4.4 `packages/core/src/cross-spawn-spawner.ts` — typer `EPERM`

Dans `toTag` (`:31-50`), ajouter avant le `default` (`:47`) :

```ts
    case "EPERM":
      return "PermissionDenied"
```

**Vrai bug au passage**, et il est dans le chemin du défaut : `toTag` mappe `EACCES` →
`PermissionDenied` (`:35-36`) mais laisse `EPERM` retomber sur `default: return "Unknown"`
(`:47-48`), alors que les deux sont des refus de permission. C'est aussi ce qui force
`isTransientLaunchFailure` à lire le `code` plutôt que le tag (`launch-retry.ts:21`).

`isTransientLaunchFailure` reste **inchangé** et garde le même résultat : avant le patch,
`EPERM` satisfait `transientCode` (`launch-retry.ts:31`) ; après, il satisfait `transientTag`
(`:30`) — les deux expressions couvrent `EPERM`, donc le prédicat vaut `true` dans les
deux cas. Le retag ne fait qu'ajouter un chemin de reconnaissance et **donne à §4.1 le `_tag`
dont il a besoin pour bifurquer `Busy` / `PermissionDenied`**.

### 4.5 Ce qui reste volontairement inchangé

- **Le retry interne du chokepoint** (`cross-spawn-spawner.ts:284-298`) : c'est le bon niveau —
  un seul point de croisement, garde `spawned` (`:287`, `:291`) qui empêche tout rejeu après
  création. Le généraliser davantage serait YAGNI.
- **`LAUNCH_RETRY_ATTEMPTS = 8`** (`launch-retry.ts:42`) : inchangé. §2.5 ne justifie plus de
  le réduire ni de l'augmenter ; la borne porte sur le coût, pas sur la taille.
- **`cmd()` lazy** (`shell.ts:301`) : inerte une fois le retry externe retiré.
- **Le chemin git** (`process.ts:9-16`, `:27-44`) : hors périmètre, déjà couvert.
- **Les autres sites `retryTransientLaunch`** — *reliquat nommé, hors périmètre P18, escalade
  `P18-bis`*.

  **Inventaire audité (34 correspondances grep, dont 8 imports et 2 ré-exports).** Ligne par
  ligne, avec le statut de vérification de cette révision — la prétention « exhaustive » est
  abandonnée au profit d'un relevé vérifiable :

  | Site | Forme | Multiplication 8×8 | Vérifié par |
  |---|---|---|---|
  | `packages/opencode/src/tool/shell.ts:498` | `spawner.spawn(cmd(...))` | **oui — corrigé ici** | lu verbatim |
  | `packages/opencode/src/session/prompt.ts:1034` | `retryTransientLaunch(spawner.spawn(cmd))` | **oui** | lu verbatim |
  | `packages/opencode/src/file/ripgrep.ts:356` | `retryTransientLaunch(spawner.spawn(...))` | **oui** | lu verbatim |
  | `packages/opencode/src/file/ripgrep.ts:387` | `retryTransientLaunch(spawner.spawn(...))` | **oui** | lu verbatim |
  | `packages/opencode/src/git/index.ts:113` | via `AppProcess` | non tracé | n° de ligne grep |
  | `packages/opencode/src/snapshot/index.ts:99` | via `AppProcess` | non tracé | n° de ligne grep |
  | `packages/opencode/src/snapshot/index.ts:608` | via `AppProcess` | non tracé | n° de ligne grep |
  | `packages/opencode/src/worktree/index.ts:166` | via `AppProcess` | non tracé | n° de ligne grep |
  | `packages/opencode/src/project/project.ts` | via `AppProcess` | non tracé | import vu ; **n° de ligne non relevé** |
  | `packages/opencode/src/daemon/auto-commit.ts:29` | `retryTransientLaunchSync` | hors sujet (sync) | n° de ligne grep |
  | `packages/opencode/src/daemon/auto-commit.ts:62` | `retryTransientLaunchSync` | hors sujet (sync) | n° de ligne grep |

  **Correction de comptage, assumée.** La vague 2 annonçait « 8 autres sites ». Le relevé de ce
  cycle trouve **10 sites d'appel hors `shell.ts:498` dont le numéro de ligne est confirmé par
  grep** (plus `project.ts`, non numéroté), et non 8. Les trois sites `spawner.spawn` non-git
  sont **relus verbatim ligne à ligne** et portent la **même multiplication 8×8**, pour le même
  prix (~57 s) et le même message nu.

  **Ce qui est-rayé de l'inventaire.** `ripgrep.ts:237` figurait dans la vague 2 avec la mention
  « probable » : **je ne peux pas le relire** dans cette révision, donc **la ligne est
  supprimée** de l'inventaire plutôt que reportée. De même, les sites `ripgrep.ts:237`,
  `project.ts:152` et les onze occurrences de `toPlatformError` annoncées par la vague 2 ne sont
  plus affirmés : seuls des numéros vérifiés figurent ci-dessus.

  Elles sont **aussi** hors périmètre de ce patch : traiter le shell et traiter
  ripgrep/prompt dans le même changement élargit la surface de régression sans apport
  supplémentaire. **Escalade : `P18-bis`**, avec le même §4.1/§4.2 réutilisé tel quel, en
  commençant par `launchRefused` et **son test de fourche** (§7, test 2), puisque c'est
  précisément la pièce réutilisable.

## 5. Alternatives considered

**5.1 Généraliser / augmenter le budget de tentatives pour le shell.** Rejeté. Le défaut est la
*multiplication*, pas la taille : 8 tentatives et 6 350 ms sont conservées (aucune n'est
supprimée), et l'agrandir porterait le pire cas au-delà de 57 s.

**5.2 Refus immédiat, zéro tentative.** Rejeté. §2.5 ne prouve **pas** la transience, mais le
commentaire d'intention du dépôt l'atteste sans le mesurer (`cross-spawn-spawner.ts:279-283`,
`launch-retry.ts:38-41` : « a refusal arrives in bursts, and a burst can outlast a short
budget »). Un refus immédiat convertirait un incident en échec dur d'outil. Cet argument repose
sur l'**intention déclarée**, pas sur une mesure — c'est honnêtement le point faible de cette
alternative, et il est partagé avec §4.5.

**5.3 Appliquer au shell le correctif « résout le lanceur vers le vrai binaire »
(`process.ts:27-44`).** Rejeté. `pwsh.EXE` n'est pas un lanceur re-exécutant : il n'y a pas de
second spawn à supprimer. Le refus vise d'ailleurs le chemin final résolu
`C:\Program Files\PowerShell\7\pwsh.EXE` (§2.5), donc aucune réécriture de chemin ne peut aider.

**5.4 Rejouer avec le shell suivant de `Shell.win()` (`shell/shell.ts:101-109`).** Rejeté comme
défaut : cela change silencieusement la sémantique — une ligne PowerShell serait réinterprétée
par `bash` ou `cmd`. Une variante *proposée au modèle* dans le message de §4.1 reste possible.

**5.5 Le correctif de §4.2 exactement comme formulé par le verdict — REJETÉ, et le désaccord est
consigné.** Le verdict suggère de dériver l'errno ainsi :

```ts
const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined
```

**Ce code renvoie `undefined` sur un refus réel.** `toPlatformError` construit l'erreur ainsi
(`packages/core/src/cross-spawn-spawner.ts:86-93`, relu verbatim) :

```
  return PlatformError.systemError({
    _tag: toTag(err),
    module: "ChildProcess",
    method,
    pathOrDescriptor: cmd,
    syscall: err.syscall,
    cause: err,
  })
```

Le `PlatformError` ne porte **aucun** champ `code` : le `code` de l'errno n'existe que sur
`cause` (ligne 92). Le `PlatformError` ne porte que `_tag`, `module`, `method`,
`pathOrDescriptor`, `syscall`, `cause`.

**Statut du désaccord : `closed` — le validateur a tort, et la forme réelle est établie par
trois sources indépendantes.** (i) La forme du constructeur (`cross-spawn-spawner.ts:86-93`) :
aucun champ `code`. (ii) Le chemin de lecture du dépôt (`filesystem.ts:105-108`) lit
explicitement `(e.cause as { code?: string })?.code` — c'est la preuve interne que `code` est
sur `cause`. (iii) Les trois fixtures qui modélisent un refus placent toutes `code` sur la
cause, jamais sur l'enveloppe (§2.8b). Ce désaccord est **recevable et conservé tel quel**.

Le même défaut produit le second problème signalé par le verdict — le suffixe
`Underlying error:` vide sur un `message` vide. `launch-retry.ts:4-7` documente que la denial
« only survives in `cause`/`stderr` », donc `detail` est fréquemment `""`.

**Correction retenue** : les deux affirmations du verdict sont vraies et appliquées (bannir
l'EPERM figé ; conditionner le suffixe à un `detail` non vide), mais son code est remplacé par
`errnoOf` (§4.1), qui parcourt `cause`/`reason`/`stderr` comme le fait déjà
`isTransientLaunchFailure` (`launch-retry.ts:33`), et par `tagOf`, qui lit `reason._tag`. La
bifurcation `Busy` / `PermissionDenied` s'appuie sur ce tag normalisé : c'est le seul signal qui
distingue une contention de verrou d'un refus de droits sur le chemin d'erreur réel, et il
n'est disponible que **grâce** au retag de §4.4.

**5.6 Corriger la multiplication sans toucher au message.** Rejeté. Cela laisse le modèle
deviner devant un errno nu : c'est la seconde moitié du défaut, mesurée par les tests 2 et 3
de §7.

## 6. Risks

**Régression sur les tests existants — un cas est *connu* cassant, pas conjecturé.**

- `packages/opencode/test/tool/shell-launch-retry.test.ts` — **casse** après §4.3 : `:103`
  passe de `8 >= 5` à `1 >= 5`. Le correctif est spécifié en §7 (test 1) et fait partie du
  patch. Ce fichier ne doit pas être supprimé.
- `packages/core/test/process/spawner-launch-retry.test.ts` — `build(refusals)` (`:50-55`)
  compteur `calls.count` (`:51`), `build(2)` puis `expect(probe.calls.count).toBe(3)` (`:74-78`),
  `build(1, ENOENT)` puis `expect(probe.calls.count).toBe(1)` (`:81-87`). §4.1–4.4 ne touchent
  ni `spawn()` ni le garde `:291`, donc les deux comptages **restent vrais** — relu verbatim.
  Non cassé.
- `packages/core/test/process/git-launch-retry.test.ts` — vérifie `retryTransientLaunch`
  directement (`:44-61`). La fonction reste inchangée ; seul son usage dans `shell.ts`
  disparaît. Non cassé.
- `packages/core/test/process/run-timeout.test.ts`, `packages/core/test/process/process.test.ts` —
  **non relus** par cette révision : risque déclaré, à confirmer par exécution.

**Rayon du retag `EPERM` → `PermissionDenied` (§4.4) — borné et vérifié sur trois
consommateurs.**

- `launch-retry.ts:9` (donc `:30`) — résultat identique, les deux regex couvrent `EPERM`.
- `packages/core/src/filesystem.ts:105-108` — qui teste **déjà** `reason._tag === "PermissionDenied"`
  **et** `reason._tag === "Busy"` **et** `/^(EPERM|EACCES|EBUSY)$/` sur le `code`, donc
  insensible au retag. Relu verbatim.
- `packages/opencode/src/config/config.ts:625-628` — un `Effect.catchIf` sur
  `e.reason._tag === "PermissionDenied"` qui enveloppe une écriture de `.gitignore`, donc un
  chemin **filesystem**, jamais un tag produit par le spawner. Relu verbatim.
- `packages/core/src/util/effect-flock.ts:94` — `isPathGone = reason._tag === "NotFound" || reason._tag === "Unknown"` ;
  ses usages portent sur des opérations de fichiers, qu'un `EPERM` de spawn n'atteint pas.

**Le trou que le verdict a trouvé, et que §4.1 referme.** `launchRefused` **remplace l'erreur
sur le chemin d'échec de l'outil `bash`**, et c'est le seul chemin dont le verdict ne citait
aucun consommateur de `_tag` dans `packages/opencode/src/tool/`. La preuve directe que ce dépôt
distingue des échecs **par tag** dans ce canal est le test que §7 réécrit :
`shell-launch-retry.test.ts:40-48` construit un `_tag: "Unknown"` pour séparer « refus
transitoire » de « échec permanent ». Effacer le tag sur ce chemin précis aurait été une
décision non examinée. **§4.1 renvoie donc un `PlatformError` taggé** : le tag reste
observable, et le diagnostic reste lisible par les lecteurs d'errno qui parcourent déjà
`cause`. Les deux propriétés gagnées, aucune perdue.

**Risque induit par ce tag, énoncé.** L'erreur retournée porte un `cause` dont le message
contient `EPERM`/`EBUSY` : `isTransientLaunchFailure` la classera toujours transitoire. Dans
`shell.ts:498` l'`Effect.catch` est **terminal** — rien ne ré-embarque derrière — donc aucun
retry supplémentaire. C'est le comportement voulu : la branche `Busy` dit explicitement
« réessaie après le déverrouillage », donc préserver la transience est cohérent.

**Typecheck.** Retirer `retryTransientLaunch` de `shell.ts:13` sans le remplacer casse
`noUnusedLocals` (§4.3). Ajouter `launchRefused` à `process.ts:88-95` est obligatoire (§4.2).
Le changement d'import de `launch-retry.ts:2` et son interaction avec `:77` sont le **seul
point de typecheck que cette révision ne peut pas exécuter** (§4.1).

**Coût tokens / latence ajouté.** Négatif. Latence au pire cas ramenée de
`8 × 6 350 + 6 350 ≈ 57 150 ms` à `6 350 ms` (budget interne seul), soit **−89 %** sur le chemin
d'échec. Tokens : **+~70 tokens par échec seulement**, chemin froid ; sur un tour nominal, coût
**nul**, car aucune chaîne n'est construite hors de l'`Effect.catch` de §4.3.

**Sécurité.** Aucun risque d'injection : `launchRefused` n'exécute rien et ne lance pas de
shell ; il formate une chaîne. Le message contient `input.shell`, qui vient de la configuration
résolue (`shell/shell.ts:92-99`), **pas** de l'entrée de commande. Aucun contournement de
permission : la correction rend un échec **plus** visible, elle n'en masque aucun. La branche
`Busy` (lever « attendre ») empêche au contraire d'envoyer le modèle vers une escalade de
privilèges face à un incident de verrou.

## 7. Tests

**Répartition des rôles — elle supprime le recouvrement que le verdict signalait (objection 3).**

| Test | Fichier | Ce qu'il est le **seul** à prouver |
|---|---|---|
| 1 | `packages/opencode/test/tool/shell-launch-retry.test.ts` (réécriture) | **le câblage** : une seule politique, `starts.count === 1`, message présent |
| 2 | `packages/core/test/process/launch-refused.test.ts` (**nouveau**) | **la fourche** : `Busy` ≠ `PermissionDenied`, errno depuis `cause`, suffixe conditionné, tag conservé |
| 3 | `packages/opencode/test/tool/shell-launch-refusal.test.ts` (**nouveau**) | **la frontière outil** : le message atteint la valeur d'échec de l'outil |
| 4 | `packages/core/test/process/spawner-launch-retry.test.ts` (ajout) | **le retag + le budget interne unique** au niveau du chokepoint |

Aucun test ne répète l'assertion d'un autre : c'est ce qui répond à l'objection 3 sans
l'expliquer.

---

**Test 1 (réécriture d'un test existant — obligatoire pour le merge).**
`packages/opencode/test/tool/shell-launch-retry.test.ts`

*Suppressions* — `permanent` (`:38-48`), `LAUNCH_BUDGET` (`:20`), le commentaire `:19`, l'assertion
`:103`. Ils décrivent un budget qui n'existe plus : les laisser serait une déclaration morte.

*Le compteur devient inconditionnel* (objection 1, second point). `:50`, `:60-65` :

```ts
const starts = { count: 0, last: undefined as ChildProcess.Command | undefined }

// Every spawn that reaches this layer is counted, unconditionally. The count is
// the proof that no retry policy is stacked on the chokepoint any more, so it
// must not be conditional on the command: a guarded counter lets a real spawn
// slip underneath it and the proof stops proving anything.
const refusedLaunches = Layer.effect(
  ChildProcessSpawner,
  Effect.gen(function* () {
    const real = yield* ChildProcessSpawner
    return ChildProcessSpawner.of({
      ...real,
      spawn: (command: ChildProcess.Command) =>
        Effect.suspend(() => {
          starts.count += 1
          starts.last = command
          // Only the shell is refused; anything else is forwarded untouched — but
          // it is still counted, so `toBe(1)` cannot be satisfied by a call the
          // counter never saw.
          return SHELL.test(commandName(command)) ? Effect.fail(refused(command)) : real.spawn(command)
        }),
    })
  }),
).pipe(Layer.provide(CrossSpawnSpawner.defaultLayer))
```

`SHELL` (`:18`) et `commandName` (`:22`) sont **conservés** — `commandName` reste utilisé par
`refused` (`:30`) et par la nouvelle assertion, donc aucun local ne devient mort.

*Le titre `:94` est réécrit* (objection 1, premier point), et avec lui le commentaire `:102`,
qui portait le même défaut — il décrivait un câblage de retry qui n'existe plus :

```ts
describe("tool.shell transient launch", () => {
  it.live("surfaces the refusal on the first start without stacking a second retry policy", () =>
    Effect.gen(function* () {
      const info = yield* ShellTool
      const tool = yield* info.init()
      const exit = yield* Effect.exit(
        tool.execute({ command: "echo launch-retry-ok", description: "probe the launch retry" }, ctx),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      // the spawner already owns the budget: one start, one refusal, one message
      expect(starts.count).toBe(1)
      // …and that one counted start was the shell, not something the counter skipped
      expect(SHELL.test(commandName(starts.last!))).toBe(true)
      // the refusal is named, not surfaced as a bare errno
      expect(String(exit)).toContain("No process was created")
    }).pipe(provideInstance(process.cwd())),
  )
})
```

L'assertion `SHELL.test(commandName(starts.last!))` ferme le dernier angle : un compte de `1`
dont on ignore **ce qui** a été compté ne prouve rien.

- Commande : `cd packages/opencode && bun test test/tool/`
- **Critère de succès observable** : `starts.count === 1`, `starts.last` est la commande du
  shell, et la chaîne littérale `No process was created` est présente. C'est la preuve directe
  qu'aucune politique externe ne s'empile plus sur le chokepoint.

---

**Test 2 (nouveau) — LA BRANCHE `Busy`. C'est le résidu bloquant principal du mandat.**

`packages/core/test/process/launch-refused.test.ts`. Il teste **la fonction**, pas le monde
réel : aucun refus réel n'est requis, exactement comme le test 1 teste la couche et non le
système. L'import passe par `@process` (§4.2), donc le test couvre aussi l'export de RC3.

```ts
import { describe, expect, test } from "bun:test"
import * as PlatformError from "effect/PlatformError"
import { launchRefused } from "../../src/process"

// Mirrors the real refusal exactly: toPlatformError puts `code` on the cause and
// never on the envelope (cross-spawn-spawner.ts:86-93).
const refused = (tag: PlatformError.SystemErrorTag, code: string) =>
  PlatformError.systemError({
    _tag: tag,
    module: "ChildProcess",
    method: "spawn",
    pathOrDescriptor: "pwsh",
    syscall: "uv_spawn",
    cause: Object.assign(new Error(`${code}: uv_spawn 'pwsh'`), { code, syscall: "uv_spawn" }),
  })

const reason = (e: unknown) => (e as { reason: { _tag: string; cause: Error } }).reason
const text = (e: unknown) => reason(e).cause.message

describe("launchRefused", () => {
  test("tells lock contention and a permission denial apart", () => {
    const busy = launchRefused("pwsh", 8, refused("Busy", "EBUSY"))
    const denied = launchRefused("pwsh", 8, refused("PermissionDenied", "EPERM"))

    // the fork: same code path, opposite levers
    expect(text(busy)).toContain("EBUSY")
    expect(text(busy)).toContain("wait for the lock")
    expect(text(busy)).not.toContain("grant the executing identity rights")

    expect(text(denied)).toContain("EPERM")
    expect(text(denied)).toContain("grant the executing identity rights")
    expect(text(denied)).not.toContain("wait for the lock")

    // a refactor that collapses `tagOf` cannot satisfy both halves
    expect(text(busy)).not.toBe(text(denied))
  })

  test("keeps the tag on the failure channel and the diagnostic on the cause", () => {
    expect(reason(launchRefused("pwsh", 8, refused("Busy", "EBUSY")))._tag).toBe("Busy")
    expect(reason(launchRefused("pwsh", 8, refused("PermissionDenied", "EPERM")))._tag).toBe(
      "PermissionDenied",
    )
    expect(text(launchRefused("pwsh", 8, refused("PermissionDenied", "EPERM")))).toContain(
      "No process was created",
    )
  })

  test("drops the Underlying error suffix when the message is empty", () => {
    // A literal, not a systemError: the empty `message` is pinned by construction
    // instead of relying on PlatformError's message derivation, which this
    // revision cannot verify.
    const empty = {
      reason: { _tag: "PermissionDenied" },
      message: "",
      cause: Object.assign(new Error(""), { code: "EPERM" }),
    }
    const m = launchRefused("pwsh", 8, empty)
    expect(text(m)).toContain("EPERM")
    expect(text(m)).not.toContain("Underlying error:")
  })
})
```

*Pourquoi ce test attrape ce qu'aucun autre n'attrape.* Les trois assertions de la première
`_test` sont **croisées** : chacune des deux moitiés exclut le levier de l'autre, et les deux
messages sont comparés. Un `tagOf` qui ne renvoie rien, qui renvoie toujours `"Busy"`, ou qui
renvoie la branche par défaut produit **au moins une** de ces assertions rouge. C'est
directement la réponse à l'objection 2 : « un refactor qui casse `tagOf` laisserait les trois
tests verts ». Ici, il ne peut pas.

*Pourquoi il ne dépend d'aucun refus réel.* `refused("Busy", "EBUSY")` est une `PlatformError`
construite par le test, avec la **forme exacte** que le chokepoint produit pour un vrai `EBUSY`
(`toTag: EBUSY → "Busy"`, `cross-spawn-spawner.ts:43-44` ; `code` sur la cause, `:92`). Le test
exerce donc la branche par son **unique entrée réelle**, `launchRefused`, sans dépendre d'un
hôte qui refuserait un spawn.

- Commande : `cd packages/core && bun test test/process/launch-refused.test.ts`
- **Critère de succès observable** : `text(busy)` contient `wait for the lock` et **pas**
  `grant the executing identity rights`, tandis que `text(denied)` fait l'inverse.

---

**Test 3 (nouveau) — la frontière outil.**
`packages/opencode/test/tool/shell-launch-refusal.test.ts`

- Cas : le même `refused()` que `shell-launch-retry.test.ts:25-36` (cause `code: "EPERM"`), une
  seule tentative.
- Assertions, **et uniquement celles-ci** : (a) l'appel échoue ; (b) la valeur d'échec contient
  `No process was created` ; (c) elle contient `after 8 attempts` ; (d) elle contient le chemin
  du shell passé. Les assertions d'errno et de suffixe **vivent dans le test 2** et ne sont pas
  répétées ici : c'est la suppression du recouvrement signalée par l'objection 3.
- Commande : `cd packages/opencode && bun test test/tool/`
- **Critère de succès observable** : la chaîne littérale `No process was created` apparaît dans
  la valeur d'échec de l'outil.
- *Non re-vérifié* : l'affirmation de la vague 2 que cette chaîne est « absente du dépôt
  aujourd'hui » (le validateur n'a pas pu non plus l'établir — `ripgrep failed with code 5` sur
  `packages/**`). Cette révision ne la confirme pas ; le critère porte donc sur la **présence
  dans le message produit**, pas sur l'absence préalable.

---

**Test 4 (ajout dans un fichier existant) — le budget interne et le tag.**
`packages/core/test/process/spawner-launch-retry.test.ts`

- Cas : `build(8, <EPERM sur pwsh.exe>)` — huit refus consécutifs ; `refusingProc` (`:44-48`) et
  `build` (`:50-55`) sont réutilisables tels quels, seule la fixture `refused` (`:15-16`,
  aujourd'hui `uv_spawn 'git'`) est paramétrée.
- Assertions : (a) l'échec est un `Exit` en failure ; (b) `probe.calls.count === 8` — budget
  unique, **pas** 64 ; (c) la valeur d'échec contient `PermissionDenied`, grâce à §4.4 —
  précédent d'assertion dans ce dépôt : `packages/core/test/util/effect-flock.test.ts:318`
  (`expect(String(result)).toContain("PermissionDenied")`).
- Les deux compteurs existants (`:78` `toBe(3)`, `:86` `toBe(1)`) sont **conservés** : ils
  doivent rester verts, c'est la preuve que §4.3 n'a rien changé au chokepoint.
- Commande : `cd packages/core && bun test test/process/spawner-launch-retry.test.ts`
- **Critère de succès observable** : `calls.count` vaut exactement `8`.

---

**Non-régression (porte de merge).**

- `cd packages/core && bun test test/process` — couvre `run-timeout.test.ts` et
  `process.test.ts`, que cette révision n'a pas relus (§6).
- `cd packages/opencode && bun test test/tool`.
- Typecheck du package `: **inclut obligatoirement** le point `launch-retry.ts:2` / `:77` de §4.1.

## 8. Effort

`S` — six sites, tous locaux : deux extracteurs + une fonction exportée dans `launch-retry.ts`,
une ligne dans le bloc `export` de `process.ts`, deux lignes dans `toTag`, un site de pipeline
et un import dans `shell.ts`, **une réécriture de test**, **un fichier de test core nouveau**
(3 cas), un fichier de test opencode nouveau, un ajout dans un test core existant. Aucune
couche d'analyse, aucun service nouveau, aucun changement de forme de type public, aucune
dépendance nouvelle.

## 9. Statut des objections — règle d'implémentabilité

Sous la règle d'implémentabilité (`REVALIDATION-BRIEFS.md`), chaque objection porte un statut
explicite. Un résidu `open` **interdit** l'implémentation ; `accepted` n'a **pas** été employé
pour débloquer.

| # | Objection (formulée par la vague 4) | Statut | Ce qui la tranche |
|---|---|---|---|
| 1 | Titre `:94` devenu faux ; compteur `:62` conditionnel | **`closed`** | §7 test 1 : titre réécrit, compteur **inconditionnel**, `starts.last` vérifié, commentaire `:102` réécrit avec le titre |
| 2 | **La branche `Busy` n'a aucun test** | **`closed`** | §7 **test 2** : `launch-refused.test.ts`, la fourche testée dans les deux sens avec assertions croisées ; plus §2.9/§2.10 pour la justification |
| 3 | RC1 délégué ; tests 1 et 2 se recouvrent | **`closed`** | §7 tableau de répartition + RC1 assumé explicitement dans le test 1 ; **recouvrement supprimé**, plus seulement expliqué |
| 4 | La classe de défaut survit à P18 sur ≥ 3 sites | **`out_of_scope`** | §4.5 : inventaire audité ligne à ligne, escalade **`P18-bis`** nommée, correction du décompte (10 lignes confirmées, pas 8). Reliquat assumé, pas accepté dans P18 |
| 5 | Le retag efface le tag sur le chemin d'échec de l'outil `bash` | **`closed`** | §4.1 : retour `PlatformError` **taggé** (`Busy` propagé, sinon `PermissionDenied`), diagnostic sur `cause` ; §7 test 2 couvre les deux propriétés |
| + | `EBUSY_ANY=3` non audité (§2.7 de la vague 2) | **`closed`** | §2.9 : offsets relevés, **3/3 occurrences auto-référentes**, compte réfuté comme preuve et **retiré de l'argumentaire** ; branche re-groundée sur trois faits de code |

**Aucun résidu `open`.** L'implémentation n'est pas bloquée par ce cycle.

### Points non vérifiables par cette révision — à la porte de merge, pas des objections

Ces points ne sont pas des objections du validateur et ne portent donc pas de statut
`open`/`closed` ci-dessus ; ils sont explicitement **transférés à l'exécution** :

- **Typecheck `launch-retry.ts:2` / `:77`** (§4.1) : interaction entre le nouvel import de
  *valeur* et le `export type { PlatformError }`. Repli spécifié.
- **Comportement du compteur inconditionnel** (§7 test 1) : `starts.count === 1` suppose
  qu'aucun autre spawn ne traverse la couche pendant l'initialisation. `INFERE:` les couches
  du test (`Plugin`, `Truncate`, `Config`, `Agent`, `RuntimeFlags`, `AppFileSystem`) sont
  construites, pas lancées, donc un seul spawn est attendu — le seul `spawner.spawn` du test
  est celui de l'outil. **Si l'assertion rapporte 2, le compte est correct et l'hypothèse est
  fausse** : l'échec est alors diagnostic (il nomme le spawn superflu par le `starts.last`),
  ce qui est le comportement voulu d'un compteur honnête.
- **`No process was created` absent du dépôt avant patch** : non établi (§7 test 3).
- **`run-timeout.test.ts`, `process.test.ts`** : non relus (§6).

## 10. Verdict self-assessment

`NEEDS_REVIEW`

Le diagnostic central est confirmé par le verdict et **aucune des cinq objections ne remet en
cause ni l'architecture ni le message** du correctif. Ce cycle a levé les quatre objections
locales et converti la cinquième en reliquat nommé.

Les deux questions de périmètre de la vague 2 sont maintenues, la première étant tranchée
comme `out_of_scope` :

1. **Périmètre des sites `retryTransientLaunch` restants (§4.5).** Le correctif de §4.1/§4.2
   est réutilisable tel quel, le coût marginal est faible, et le périmètre couvert serait plus
   large — mais traiter ripgrep/prompt dans le même changement élargit la surface de régression.
   **Recommandation maintenue : `P18-bis`**, en commençant par `launchRefused` et son test de
   fourche, puisque c'est la pièce réutilisable.
2. **La branche `Busy`** est désormais **démontrée, testée et conservée** — l'objection 2
   avait raison sur la preuve, l'audit de §2.9 avait raison sur la base. Les deux sont traitées :
   la base est remplacée par trois faits de code, et la preuve est un test. Le levier du
   validateur (« retirez-la si elle est inauditable ») **n'est pas actionnable** ici : la
   retirer ne coûte rien mais ne prouve rien, et coûte en exactitude diagnostique dès qu'un
   `EBUSY` survient.