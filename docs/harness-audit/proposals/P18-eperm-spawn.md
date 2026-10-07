# P18 — le refus EPERM au spawn du shell : budget doublé et erreur non actionnable

## 1. Problem

Quand Windows refuse de créer un processus (`EPERM` à `uv_spawn`), l'outil `bash` gaspille jusqu'à ~57 s en tentatives redondantes puis renvoie au modèle un errno nu, sans aucune indication de ce qu'il faut faire.

## 2. Evidence

### 2.1 Le périmètre du correctif git est explicitement borné

`packages/core/src/process.ts:13-15` :

```
 * (measured: one failure in eighty starts for either launcher, zero for the real binary). The refusal
 * happens in a process opencode never launched, so `retryTransientLaunch` cannot observe or retry it.
 * Resolving the launcher to the real binary drops the second spawn and the whole failure mode with it.
```

La phrase désigne un refus survenu **dans un processus que opencode n'a pas lancé** (le lanceur Git qui re-exécute `mingw64/bin/git.exe`, cf. `packages/core/src/process.ts:10-12`). Rien n'y empêche d'observer un refus **par** opencode lui-même.

### 2.2 La classification est agnostique de l'exécutable

`packages/core/src/launch-retry.ts:4-10` :

```
// Windows intermittently refuses to create a child process (`EPERM`/`EACCES`,
// "Accès refusé"). The process never started, so retrying cannot duplicate or
// corrupt repository state. `AppProcessError` carries an empty `message`: the
// denial only survives in `cause`/`stderr`, so those must be inspected too.
const transientLaunch = /EPERM|EACCES|EBUSY|operation not permitted|uv_spawn|Access is denied|Accès refusé|error launching/i
const transientTag = /^(PermissionDenied|Busy)$/
const transientCode = /^(EPERM|EACCES|EBUSY)$/
```

Aucun nom d'exécutable n'apparaît dans `transientLaunch` : `EPERM` et `uv_spawn` correspondent quelle que soit la cible.

### 2.3 Le refus devient visible à l'écoute `error`, avant tout `spawn`

`packages/core/src/cross-spawn-spawner.ts:279-298` :

```
      // A refused start (`EPERM`/`EACCES` at `uv_spawn`) means no process ever
      // ran, so repeating the launch cannot duplicate work. The retry lives
      // here, at the single chokepoint every caller crosses, because the denial
      // arrives in bursts that outlast any per-caller budget. An error raised
      // after the process actually spawned is never retried.
      const start = (attempt: number) => {
        const proc = launch(command.command, command.args, opts)
        current = proc
        let spawned = false
        ...
        proc.on("error", (err) => {
          const failure = toPlatformError("spawn", err, command)
          if (!spawned && !settled && attempt + 1 < LAUNCH_RETRY_ATTEMPTS && isTransientLaunchFailure(failure)) {
            setTimeout(() => start(attempt + 1), launchRetryDelayMs(attempt))
            return
          }
```

### 2.4 Le chemin exact `bash` → `pwsh.exe`, et le spawner qui l'exécute

| Étape | Citation |
|---|---|
| Le shell est résolu par `which("pwsh")` | `packages/opencode/src/shell/shell.ts:104` |
| Le premier candidat gagne | `packages/opencode/src/shell/shell.ts:122` — `if (process.platform === "win32") return win()[0]!` |
| La commande est construite en PowerShell natif | `packages/opencode/src/tool/shell.ts:302-305` — `Shell.ps(shell)` puis `ChildProcess.make(shell, [...])` |
| Le spawner ambiant est obtenu | `packages/opencode/src/tool/shell.ts:354` — `const spawner = yield* ChildProcessSpawner` |
| `ChildProcessSpawner` est une exigence de la couche outils | `packages/opencode/src/tool/registry.ts:153` |
| La couche qui construit les outils fournit `CrossSpawnSpawner.defaultLayer` | `packages/opencode/src/tool/registry.ts:583` |
| Le spawn effectif | `packages/opencode/src/tool/shell.ts:498` |

### 2.5 Erreur terrain exacte

```
EPERM: operation not permitted, uv_spawn 'C:\Program Files\PowerShell\7\pwsh.EXE'
```

Reproduite **deux fois dans cette session** comme échec de l'appel `bash` lui-même ; la tentative suivante du même type a réussi. C'est donc une observation directe que le refus est transitoire et non un échec permanent.

### 2.6 Correction de deux affirmations du mandat

**(a) Chemins obsolètes.** Le mandat cite `packages/opencode/src/tool/launch-retry.ts:8` et `packages/opencode/src/tool/cross-spawn-spawner.ts:279`. Ces fichiers sont dans `packages/core/src/` (`packages/core/src/launch-retry.ts`, `packages/core/src/cross-spawn-spawner.ts`). Les numéros de ligne, eux, sont exacts.

**(b) L'affirmation « aucune de ces branches ne cible le spawn de pwsh.exe observé » est fausse.** Les preuves 2.2, 2.3 et 2.4 établissent la chaîne complète :

1. `shell.ts:354` obtient le `ChildProcessSpawner` ambiant ;
2. `registry.ts:153` en fait une exigence de la couche outils ;
3. `registry.ts:583` fournit `CrossSpawnSpawner.defaultLayer` à cette couche ;
4. `cross-spawn-spawner.ts:284-298` applique `isTransientLaunchFailure` — générique (§2.2) — à **tout** spawn, `pwsh.exe` compris.

La politique de retry couvre donc déjà le spawn de `pwsh.exe`. Le mandat est built sur une prémisse fausse ; le défaut réel est ailleurs et est établi en §3.

### 2.7 Le chiffre « 387 » n'est pas reproductible

`UNVERIFIED:` aucune source de logs ne contient 387 occurrences. Mesures :

| Commande | Résultat |
|---|---|
| Comptage `[regex]::Matches($raw,'uv_spawn')` sur les 11 `.jsonl` de `~/.config/opencode/failure-journal` | `UV_SPAWN_TOTAL=1`, `UV_SPAWN_PWSH=0`, `EPERM_ANY=11` |
| `Test-Path ~/.local/state/opencode/log` | `MISSING` |
| Lecture des 3 fichiers les plus récents de `~/.local/share/opencode` (plafond 4 Mio) | `EPERM=0`, `UV_SPAWN=0` sur `auth.json`, `opencode-local.db-shm`, `opencode-dev.db-wal` |

Méthode de vérification si le chiffre doit être retenu : indiquer le fichier ou la commande qui l'a produit. L'argumentaire de §4 et §8 ne repose pas dessus.

### 2.8 Couverture de test existante

`packages/core/test/process/spawner-launch-retry.test.ts:15-16` modélise le refus avec `uv_spawn 'git'` uniquement ; aucune occurrence de `pwsh` dans ces tests. Fichiers concernés : `packages/core/test/process/git-launch-retry.test.ts` (110 l.), `packages/core/test/process/spawner-launch-retry.test.ts` (88 l.), `packages/core/test/process/run-timeout.test.ts`, `packages/core/test/process/process.test.ts`.

## 3. Mechanism

1. Le modèle appelle `bash`. `ShellTool` est construit en `packages/opencode/src/tool/shell.ts:350`, récupère le spawner en `:354`, et construit la commande en `:498`.
2. `cmd()` (`shell.ts:301-322`) voit `process.platform === "win32"` et `Shell.ps(shell)` vrai, donc retourne `ChildProcess.make(shell, ["-NoLogo", ...])`. `shell` vaut `C:\Program Files\PowerShell\7\pwsh.EXE`, résolu en `shell/shell.ts:104` et sélectionné en `shell/shell.ts:122`.
3. `shell.ts:498` évalue **`retryTransientLaunch(spawner.spawn(cmd(...)))`** : deux politiques de retry superposées.
4. `spawner.spawn` descend jusqu'à `cross-spawn-spawner.ts:321` (`start(0)`) puis `:285` (`launch(...)`).
5. Windows refuse. **L'EPERM devient visible ici** : `proc.on("error")` (`cross-spawn-spawner.ts:289`) se déclenche alors qu'aucun événement `spawn` n'a été émis (`spawned` reste `false`, `:287`).
6. Le garde `:291` est satisfait — `isTransientLaunchFailure` reconnaît `EPERM` via `transientCode` (`launch-retry.ts:31`) en remontant la chaîne `cause` (`launch-retry.ts:33`), puisque `toTag` mappe `EPERM` à `"Unknown"` (`cross-spawn-spawner.ts:47-49`). Le retry interne est programmé (`:292`).
7. Budget interne épuisé après 8 tentatives (`launch-retry.ts:42`) et 7 délais totalisant 6 350 ms (`launch-retry.ts:43`) → `resume(Effect.fail(failure))` (`:297`).
8. Le retry **externe** de `shell.ts:498` (`launch-retry.ts:48-55`, `times: LAUNCH_RETRY_ATTEMPTS - 1 = 7`) ré-enveloppe alors l'ensemble du budget interne, jusqu'à 8 fois.
9. Une fois épuisé, l'échec remonte : le modèle reçoit un `PlatformError` portant `EPERM`/`uv_spawn` et un chemin, sans compteur de tentative, sans nom de l'action corrective.

**Coût du défaut, chiffré.** 8 tentatives externes × 8 tentatives internes = **64 appels `launch()`**. Somme des délais internes `50+100+200+400+800+1600+3200 = 6 350 ms`. Pire cas `8 × 6 350 + 6 350 ≈ 57 150 ms` de pur échec avant la première réponse, contre un budget interne de 6 350 ms suffit à couvrir le refus transitoire documenté (`launch-retry.ts:38-41`).

**Processus orphelin : impossible dans les deux cas.**

- *Refus avant création* (cas observé, §2.5) : `spawned === false`, aucun `pid`, aucun handle noyau. `current?.kill("SIGTERM")` (`:322-324`) porte sur un `kill` inopérant. Rien à nettoyer.
- *Erreur après création* : `proc.on("spawn")` (`:314-319`) met `spawned = true` et résout le succès. Toute `error` ultérieure échoue au garde `:291` (`!spawned` faux), et `settled` (`:295`) empêche une seconde résolution. Le finaliseur de scope `:322-324` tue l'enfant direct, et `killGroup` (`:332-338`) utilise `taskkill /T /F` sous Windows. La variante « processus créé puis EPERM » n'est donc **ni rejouée ni orpheline**.

`INFERE:` un petit-enfant pourrait survivre si la hiérarchie était détachée. Sur Windows `detached: process.platform !== "win32"` est `false` (`shell.ts:320`), donc la hiérarchie reste attachée et `taskkill /T` la traverse. Vérification : forcer un spawn refusé puis lister les processus enfants avec `Get-CimInstance Win32_Process`.

## 4. Proposal

Le retry n'est pas le problème : **le budget est appliqué deux fois, et l'échec final n'est pas actionnable.** Le correctif supprime la redondance et rend l'échec final exploitable. Il conserve un budget, mais un seul, à un seul niveau.

### 4.1 `packages/opencode/src/tool/shell.ts` — retirer le retry externe, ajouter le message

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

L'import `retryTransientLaunch` (`shell.ts:13`) devient inutile dans ce fichier et doit être retiré, remplacé par `isTransientLaunchFailure`, `launchRefused`, `LAUNCH_RETRY_ATTEMPTS` depuis `@opencode-ai/core/process` (déjà ré-exportés en `packages/core/src/process.ts:88-95`).

### 4.2 `packages/core/src/launch-retry.ts` — le message déterministe

Ajouter en fin de fichier (≤ 15 lignes) :

```ts
// A refused start never created a process, so there is nothing to clean up and
// the command's effect is simply absent. Naming the executable, the spent
// budget and the one lever that works is what turns an errno into a decision
// the model can take; the errno alone leaves it guessing.
export function launchRefused(executable: string, attempts: number, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(
    `opencode could not start a process after ${attempts} attempts: the host refused to create ` +
      `"${executable}" (EPERM at uv_spawn). No process was created, so the command never ran and ` +
      `nothing needs cleanup. Retry the command, or grant the executing identity rights on ` +
      `"${executable}". Underlying error: ${detail}`,
  )
}
```

### 4.3 `packages/core/src/cross-spawn-spawner.ts` — typer `EPERM`

Dans `toTag` (`:31-50`), ajouter avant le `default` :

```ts
    case "EPERM":
      return "PermissionDenied"
```

`isTransientLaunchFailure` reste inchangé : `EPERM` était déjà transient via `transientCode` (`launch-retry.ts:10`) appliqué au `code` de l'errno (`:31`) ; le tag ne fait qu'ajouter un chemin de reconnaissance (`launch-retry.ts:30`).

### 4.4 Ce qui reste volontairement inchangé

- **Le retry interne du chokepoint** (`cross-spawn-spawner.ts:284-298`) : c'est le bon niveau — un seul point de croisement, garde `spawned` qui empêche tout rejeu après création. Le généraliser davantage serait YAGNI.
- **`LAUNCH_RETRY_ATTEMPTS = 8`** (`launch-retry.ts:42`) : le refus est transitoire (§2.5) ; réduire à 1 rendrait les échecs transitoires durs.
- **`cmd()` lazy** (`shell.ts:301`) : inerte une fois le retry externe retiré.
- **Le chemin git** (`process.ts:27-44`) : hors périmètre, déjà couvert.
- **Les appelants git de `retryTransientLaunch`** (`git/index.ts:113`, `snapshot/index.ts:99`, `project/project.ts:152`, `core/src/git.ts:94`) : leur spawn passe par `AppProcess`, dont le spawner est déjà le chokepoint (`process.ts:315`) — même redondance que §3, mais hors du périmètre P18. Recommandé en suivi P18-bis.

## 5. Alternatives considered

**5.1 Généraliser / augmenter le budget de tentatives pour le shell.** Rejeté. Le budget n'est pas trop petit : 8 tentatives et 6 350 ms couvrent déjà un refus transitoire documenté (`launch-retry.ts:38-41`). L'agrandir multiplierait le pire cas de 57 s. Le défaut est la *multiplication*, pas la taille.

**5.2 Refus immédiat, zéro tentative.** Rejeté. Le refus est explicitement décrit comme en rafales (`launch-retry.ts:4-8`, `cross-spawn-spawner.ts:281-283`), et observé comme tel dans cette session (§2.5) : un refus immédiat convertirait un incident transitoire en échec dur d'outil.

**5.3 Appliquer au shell le correctif « résout le lanceur vers le vrai binaire » (`process.ts:27-44`).** Rejeté. `pwsh.EXE` n'est pas un lanceur re-exécutant : il n'y a pas de second spawn à supprimer. Le refus vise d'ailleurs le chemin final résolu `C:\Program Files\PowerShell\7\pwsh.EXE` (§2.5), donc aucune réécriture de chemin ne peut aider.

**5.4 Rejouer avec le shell suivant de `Shell.win()` (`shell/shell.ts:101-109`).** Rejeté comme défaut : cela change silencieusement la sémantique — une ligne PowerShell serait réinterprétée par `bash` ou `cmd`. Une variante *proposée au modèle* dans le message de §4.2 reste possible.

## 6. Risks

**Régression sur les tests existants.**

- `packages/core/test/process/spawner-launch-retry.test.ts` — construit `build(refusals)` et compte `calls.count` (`:50-55`). §4.1–4.3 ne touchent pas `spawn()`, donc le compteur reste 8. Non cassé.
- `packages/core/test/process/git-launch-retry.test.ts` — vérifie `retryTransientLaunch` directement (`:44-61`). La fonction reste inchangée ; seul son usage dans `shell.ts` disparaît. Non cassé.
- `packages/core/test/process/run-timeout.test.ts`, `packages/core/test/process/process.test.ts` — aucun ne dépend de `toTag`. Risque faible, à confirmer par exécution.
- `packages/opencode/test/` — aucun test de l'outil shell n'a été trouvé pour un motif `*shell*.ts` / `*bash*.ts` (l'appel `glob` a renvoyé `ripgrep failed with code 5`, donc liste non obtenue). **C'est une lacune, pas une preuve d'absence.** Vérification : `bun test packages/opencode/test/tool` avant de merger.

**Coût tokens / latence ajouté.** Négatif. Latence au pire cas ramenée de `8 × 6 350 + 6 350 ≈ 57 150 ms` à `6 350 ms` (budget interne seul). Tokens : +~60 tokens par échec seulement, chemin froid ; sur un tour nominal, coût nul car aucune chaîne n'est construite (`launchRefused` n'est appelé que dans le `catch`).

**Sécurité.** Aucun risque d'injection : `launchRefused` n'exécute rien et n'exécute pas de shell ; il formate un message. Le message contient `input.shell`, qui vient de la configuration résolue (`shell/shell.ts:92-99`), pas de l'entrée de commande. Aucun contournement de permission : la correction rend un échec **plus** visible, elle n'en masque aucun.

## 7. Tests

**Test unitaire 1** — `packages/opencode/test/tool/shell-launch-refusal.test.ts` (nouveau).

- Cas : un spawner qui refuse toujours (même fake que `spawner-launch-retry.test.ts:44-48`), la commande `git status --porcelain`, cwd temporaire.
- Assertions : (a) l'appel échoue ; (b) le message contient `pwsh` si le shell est PowerShell, ou le chemin du shell passé ; (c) il contient le nombre de tentatives `8` ; (d) il contient `No process was created` ; (e) il contient `nothing needs cleanup`.
- Commande : `cd packages/opencode && bun test test/tool/shell-launch-refusal.test.ts`
- Critère de succès observable : le test passe et le message d'échec contient la chaîne littérale `No process was created` — c'est le comportement aujourd'hui absent.

**Test unitaire 2** — `packages/core/test/process/spawner-launch-retry.test.ts` (fichier existant, ajout d'un cas).

- Cas : refus portant `code: "EPERM"` sur `pwsh.exe` ; 8 refus consécutifs.
- Assertions : (a) `calls.count === 8` — budget unique, **pas** 64 ; (b) l'erreur finale expose `_tag === "PermissionDenied"` (dû à §4.3) ; (c) le tag `Unknown` d'avant n'apparaît plus.
- Commande : `cd packages/core && bun test test/process/spawner-launch-retry.test.ts`
- Critère de succès observable : `calls.count` vaut exactement `8`. C'est le test qui prouve l'absence de multiplication.

**Non-régression** : `cd packages/core && bun test test/process` doit rester vert.

## 8. Effort

`S` — deux branches ajoutées dans `toTag`, une fonction de 12 lignes dans `launch-retry.ts`, un enrobage `catch` à un seul site ; aucun changement de type public, aucun nouveau service.

## 9. Verdict self-assessment

`NEEDS_REVIEW`

Deux points précis à trancher par le validateur :

1. **La prémisse du mandat est fausse** (§2.6) : la politique de retry couvre déjà le spawn de `pwsh.exe`. Le validateur doit-il statuer que P18 est reformulé en « budget doublé + erreur non actionnable », ou refermer P18 au motif que le périmètre annoncé est déjà traité ?
2. **Le chiffre « 387 » est invérifiable** (§2.7). Le validateur doit-il exiger la source avant validation, ou accepter la proposition sur la seule preuve reproductible (l'EPERM observé deux fois dans cette session, §2.5) ?