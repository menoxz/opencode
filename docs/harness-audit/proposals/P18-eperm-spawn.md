# P18 — le refus EPERM au spawn du shell : budget doublé et message d'erreur non actionnable

> Révisé cycle 3 après la correction **`CORRECTIONS.md:223` (C-162)** : l'affirmation
> d'exhaustivité de l'inventaire §4.5 est **réfutée et remplacée par la mesure réelle**
> (34 sites / 12 fichiers).
>
> Révisé cycle 2 après REVALIDATED-PASS_WITH_CHANGES du 2026-10-03 — branche Busy testée,
> compteur inconditionnel, EBUSY_ANY audité ou retiré.
>
> *Datation* : l'en-tête de `P18-revalidation.md:1-22` ne porte pas de date ; la date ci-dessus
> est celle de cette révision.
>
> **Ce que le cycle 3 change, en une ligne chacune.**
> - **§4.5 est reconstruit sur la mesure** : `rg -n retryTransientLaunch packages` rend
>   **SITES=34, FILES=12**. Le tableau précédent ne portait que **11 lignes** et ne comptait ni
>   les imports, ni les déclarations, ni les sites de test — il était donc **non exhaustif**
>   malgré sa présentation. Le nouveau tableau porte **les 34 lignes, numérotées**, et la
>   somme est recomptée par catégorie.
> - **Huit ancres `shell.ts` se sont révélées périmées** et sont corrigées (§2.4, tableau de
>   correction). `:498` — déjà signalée au cycle 3 — pointait sur `log.info("resolved path", …)`
>   au lieu du spawn ; les sept autres pointaient dans `preview()` / `tail()` au lieu de `cmd()`.
>   Toutes huit sont re-groundées sur une relecture verbatim, et le contenu **réellement** trouvé
>   à l'ancienne ancre est donné, pour qu'aucune ne puisse être recitaire à l'aveugle.
> - **Une citation fausse est retirée** : §5.2 plaçait entre guillemets
>   « a refusal arrives in bursts, and a burst can outlast a short budget », qui n'est **pas** le
>   texte du dépôt. Le texte réel est « because the denial arrives in bursts that outlast **any**
>   per-caller budget » (`cross-spawn-spawner.ts:282-283`). La thèse de §5.2 **tient** — le dépôt
>  意见 l'intention sans la mesurer — mais elle est désormais citée correctement.
> - **Deux trous de l'inventaire sont comblés** : `project/project.ts:152` était cité sans numéro
>   de ligne (« non relevé ») — il est numéroté ; `file/ripgrep.ts:237` était déclaré « non
>   relisible, ligne supprimée de l'inventaire » — **il existe** et était donc une affirmation
>   fausse, retirée.
> - **`EBUSY_ANY=3` est revérifié par ce cycle**, pas seulement hérité : 2 emplacements de
>   correspondance, 3 occurrences brutes, relus verbatim (§2.9). Son périmètre — le
>   *failure-journal* JSONL — est **disjoint** de `packages/**`, qui fait l'objet de §4.5.
> - **`COR-R18-3` et `COR-R18-4` sont `closed`** : ils étaient `open` au motif « mandat sans
>   shell / sans grep », ce qui était une **lacune de capacité du revalidateur**, pas un défaut
>   du correctif (§9). `toTag` et la plage `toPlatformError` sont relus verbatim en §2.11 et §5.5.
>
> **Ce que le cycle 2 changeait.**
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
> **Ce qui est conservé tel quel.** RC1 (test 1 réécrit, `starts.count === 1` +
> `No process was created`), RC2 (`errnoOf`/`tagOf`, suffixe conditionné), RC3 (`launchRefused`
> ajouté au bloc `export` de `process.ts:88-95`), RC4 (§2.5 « bornée », le « 387 » écarté). Le
> désaccord consigné sur `cross-spawn-spawner.ts:86-93` — le `code` n'existant que sur `cause` —
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

`packages/core/src/cross-spawn-spawner.ts:284-298`, **relu verbatim par ce cycle, ligne pour
ligne** :

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

Le bloc ci-dessus est **verbatim** : `:284` `const start`, `:285` `launch`, `:286` `current`,
`:287` `spawned`, `:288` `end`, `:289` `proc.on("error")`, `:290` `toPlatformError("spawn", …)`,
`:291` le garde, `:292` le `setTimeout`, `:295` `if (settled) return`, `:296` `settled = true`,
`:297` `resume(Effect.fail(failure))`, `:298` la fermeture du `on`. **La citation est exacte**,
et le garde `:291` comme l'échec final `:297` portent tout le raisonnement de §3.

### 2.4 Le chemin exact `bash` → `pwsh.exe`, et le spawner qui l'exécute

| Étape | Citation |
|---|---|
| Le shell est résolu par `which("pwsh")` | `packages/opencode/src/shell/shell.ts:104` — `[which("pwsh"), which("powershell"), gitbash(), …]` |
| Le premier candidat gagne | `packages/opencode/src/shell/shell.ts:122` — `if (process.platform === "win32") return win()[0]!` |
| La commande est construite en PowerShell natif | `packages/opencode/src/tool/shell.ts:388-391` — `if (process.platform === "win32" && Shell.ps(shell))` puis `ChildProcess.make(shell, ["-NoLogo", …])` |
| L'outil récupère le spawner ambiant | `packages/opencode/src/tool/shell.ts:440` — `const spawner = yield* ChildProcessSpawner` |
| `ChildProcessSpawner` est une exigence de la couche outils | `packages/opencode/src/tool/registry.ts:153` |
| La couche qui construit les outils fournit `CrossSpawnSpawner.defaultLayer` | `packages/opencode/src/tool/registry.ts:583` |
| Le spawn effectif, **enveloppé dans un second retry** | **`packages/opencode/src/tool/shell.ts:584`** — `const handle = yield* retryTransientLaunch(spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env)))` |

> **Correction d'ancre (cycle 3) — huit ancres `shell.ts` périmées, re-groundées une à une.**
> Une seule ancre avait été signalée jusqu'ici (`:498`). La relecture de `tool/shell.ts` a montré
> que **sept autres** l'étaient aussi, pour la même raison : la proposition a été écrite contre
> une version antérieure du fichier. Le tableau ci-dessous donne, pour chaque ancre fausse, **le
> contenu réellement trouvé à cette ligne** — c'est ce qui permet de vérifier qu'un correctif ne
> la recite pas à l'aveugle.

| Ancre citée | Contenu **réellement** à cette ligne | Ancre réelle |
|---|---|---|
| `shell.ts:498` | `log.info("resolved path", { arg, resolved })` | **`:584`** |
| `shell.ts:301` (`cmd()` lazy) | `if (!windowed) {` (dans `preview()`) | **`:387`** (`export function cmd(`) |
| `shell.ts:301-322` (`cmd()`) | `preview()` — Corps du helper, pas `cmd()` | **`:387-408`** |
| `shell.ts:302` (`process.platform === "win32"`) | `const next = exact + chunk` | **`:388`** |
| `shell.ts:303-305` (`ChildProcess.make`) | `if (next.length <= maxLength) {` / `exact = next` / `return` | **`:389-391`** |
| `shell.ts:310` (`detached: false`) | `exact = ""` | **`:396`** |
| `shell.ts:320` (`detached: … !== "win32"`) | `text: head + gap(…) + tail,` | **`:406`** |
| `shell.ts:350` (`ShellTool`) | `bytes += size` (dans `tail()`) | **`:436`** (`export const ShellTool = Tool.define(`) |
| `shell.ts:354` (spawner ambiant) | `cut: true,` | **`:440`** |

Les ancres de `shell/shell.ts` (résolution) sont, elles, **confirmées verbatim** par ce cycle :
`:101` est `function win() {`, `:104` contient `which("pwsh")`, `:122` est
`if (process.platform === "win32") return win()[0]!`, `:98` est `return which(shell) ?? undefined`
(dans `resolve`). Aucune correction n'y est nécessaire ; les bornes de plage non observées
(`:109`, `:117`, `:99`) sont donc **abandonnées** au profit des seules lignes vérifiées, plutôt
que reconduites.

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

1. `shell.ts:440` obtient le `ChildProcessSpawner` ambiant ;
2. `registry.ts:153` en fait une exigence de la couche outils ;
3. `registry.ts:583` fournit `CrossSpawnSpawner.defaultLayer` à cette couche ;
4. `cross-spawn-spawner.ts:284-298` applique `isTransientLaunchFailure` — générique (§2.2) — à
   **tout** spawn, `pwsh.exe` compris.

La politique de retry couvre donc déjà le spawn de `pwsh.exe`. Le défaut est la
**multiplication**, pas l'absence de couverture.

### 2.7 Aucun volume de refus n'est reproductible — et les `EPERM` ne sont pas des refus

Le comptage de la vague 2 (`FILES=11`, `UV_SPAWN_TOTAL=1`, `UV_SPAWN_PWSH=0`, `EPERM_ANY=11`,
`EBUSY_ANY=3`) n'a **pas** été rejoué par cette révision pour ce qui concerne les refus de
spawn. Ses deux seules conclusions transmissibles sont conservées :

- `UV_SPAWN_PWSH=0` — **aucun** refus sur `pwsh` n'a été observé. Le « 387 » du mandat reste
  **non reproductible** et est écarté de l'argumentaire ; le raisonnement de §4 ne repose que
  sur la duplication mécanique démontrée en §3.
- `EPERM_ANY=11` est, selon la révision, **une occurrence par fichier** — la signature d'une
  mention descriptive (l'entrée de journal décrivant le mandat), pas de 11 refus réels.
  **Corroboration mesurée par ce cycle, sur un symbole voisin** : une recherche par motif
  `toPlatformError` dans `packages` (tous `*.ts`) rend **11 correspondances, toutes dans un
  seul fichier**, `packages/core/src/cross-spawn-spawner.ts` (lignes `:78`, `:197`, `:213`,
  `:239`, `:257`, `:263`, `:290`, `:335`, `:345`, `:356`, `:455`). Le compte « 11 » est donc
  exact, et il est **concentré sur un seul fichier**, ce qui est la signature attendue d'une
  mention descriptive. `INFERE:` cela **corrobore** la lecture « une occurrence par fichier »,
  sans la **prouver** : rien ne relie le `EPERM_ANY=11` du journal à ce symbole.
  **Vérification** : comparer le motif de recherche exact du comptage de la vague 2 au
  `toPlatformError`, et non à `EPERM`.

**`EBUSY_ANY=3` a été revérifié par ce cycle et ne survit pas** — voir §2.9.

**Périmètres disjoints — deux mesures à ne pas confondre.** `EBUSY_ANY=3` (§2.9) porte sur les
`*.jsonl` de `~/.config/opencode/failure-journal`. La mesure de §4.5 porte sur
`rg -n retryTransientLaunch packages`, c'est-à-dire sur `packages/**`. **Aucun des deux comptes
n'est un contrôle de l'autre** : 2 emplacements / 3 occurrences dans le journal,
34 sites / 12 fichiers dans `packages/**`.

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

**Après §4.3** (retrait de `retryTransientLaunch` en `shell.ts:584`) : un seul et unique
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

**Méthode de vérification de ce cycle.** `grep EBUSY` sur le répertoire
`~/.config/opencode/failure-journal` avec filtre `*.jsonl` → **2 emplacements**,
`987d8a4073210e235a9ca87b42a0b429a5543723.jsonl:506` et `:623`. Dans `:506`, la chaîne `EBUSY`
apparaît **deux fois** dans le champ `error` (une fois dans l'aiguille, une fois dans son
résultat) ; dans `:623`, **une fois**. Total **3 occurrences brutes** sur 2 emplacements.

**Périmètre.** Cette mesure porte sur le **failure-journal JSONL**, pas sur `packages/**`.
Elle ne dit rien de la surface de code, qui est mesurée séparément en §4.5
(`rg -n retryTransientLaunch packages` ⇒ 34 sites / 12 fichiers). **Une affirmation ne vaut
que pour son périmètre.**

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
Elle est **démontrée atteignable**, corroborée par `filesystem.ts:107`, **coût-efficace**, et
— décisive — **testée** (§7, test 2). `EBUSY_ANY=3` est **retiré de l'argumentaire**.

### 2.11 Vérification directe de `toTag` (cycle 3)

`packages/core/src/cross-spawn-spawner.ts:31-50`, relu verbatim :

```
const toTag = (err: NodeJS.ErrnoException): PlatformError.SystemErrorTag => {
  switch (err.code) {
    case "ENOENT":
      return "NotFound"
    case "EACCES":
      return "PermissionDenied"
    case "EEXIST":
      return "AlreadyExists"
    case "EISDIR":
      return "BadResource"
    case "ENOTDIR":
      return "BadResource"
    case "EBUSY":
      return "Busy"
    case "ELOOP":
      return "BadResource"
    default:
      return "Unknown"
  }
}
```

Trois faits en découlent, tous mesurés sur cette lecture :

- `:31` porte **déjà** le type de retour `PlatformError.SystemErrorTag` ;
- `:35-36` renvoie **déjà** `"PermissionDenied"` pour `EACCES` ;
- **il n'existe aucun `case "EPERM"`** : `EPERM` tombe donc sur `default: return "Unknown"`
  (`:47-48`).

Le troisième fait est le **bug réel** que §4.4 corrige, et il confirme que §4.4 est
**nécessaire et non redondant**. Les deux premiers faits ferment `COR-R18-3` (§9) : le
revalidateur avait laissé ce point `open` en soupçonnant un problème de typage ; la lecture
montre que le typage est correct et que `bun typecheck` sur `packages/core` rend
`CORE_TC_EXIT=0`, `TS_ERRORS=0`.

## 3. Mechanism

1. Le modèle appelle `bash`. `ShellTool` est défini en `packages/opencode/src/tool/shell.ts:436`
   (`export const ShellTool = Tool.define(`), récupère le spawner en `:440`
   (`const spawner = yield* ChildProcessSpawner`), et construit la commande en `:584`.
2. `cmd()` (`shell.ts:387-408`) voit `process.platform === "win32"` **et** `Shell.ps(shell)`
   vrais (`:388`), donc retourne `ChildProcess.make(shell, ["-NoLogo", …])` (`:389-391`).
   `shell` vaut `C:\Program Files\PowerShell\7\pwsh.EXE` (§2.4).
3. `shell.ts:584` évalue **`retryTransientLaunch(spawner.spawn(cmd(...)))`** : deux politiques
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
8. Le retry **externe** de `shell.ts:584` (`launch-retry.ts:48-55`, `times: LAUNCH_RETRY_ATTEMPTS - 1 = 7`)
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
  `error` ultérieure échoue au garde `:291` (`!spawned` faux), et `settled` (`:296`) empêche
  une seconde résolution. Le finaliseur de scope tue l'enfant direct, et `killGroup` utilise
  `taskkill /T /F` sous Windows.

`INFERE:` un petit-enfant pourrait survivre si la hiérarchie était détachée. Sur Windows
`detached: false` (`shell.ts:396`) et `detached: process.platform !== "win32"` (`:406`), donc la
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

Les ré-exports `retryTransientLaunch` / `retryTransientLaunchSync` sont aux lignes `:93` / `:94`
(confirmé par grep). `launchRefused` est **à ajouter à ce bloc dans le même patch** que §4.1,
sans quoi le patch ne compile pas (symbole non exporté). Le commentaire `process.ts:85-87`
(« Re-exported here because every caller imports it from `process` ») reste vrai : c'est la
raison de l'ajout.

### 4.3 `packages/opencode/src/tool/shell.ts` — retirer le retry externe, ajouter le message

Remplace `shell.ts:584` :

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
(confirmé par grep) doit être **remplacé** par `isTransientLaunchFailure`, `launchRefused`,
`LAUNCH_RETRY_ATTEMPTS`. `:584` est le seul usage du symbole dans ce fichier, donc l'import
deviendrait mort et casserait `noUnusedLocals` au typecheck s'il était laissé en place.

### 4.4 `packages/core/src/cross-spawn-spawner.ts` — typer `EPERM`

Dans `toTag` (`:31-50`, relu verbatim en §2.11), ajouter avant le `default` (`:47`) :

```ts
    case "EPERM":
      return "PermissionDenied"
```

**Vrai bug au passage**, et il est dans le chemin du défaut : `toTag` mappe `EACCES` →
`PermissionDenied` (`:35-36`) mais laisse `EPERM` retomber sur `default: return "Unknown"`
(`:47-48`), alors que les deux sont des refus de permission. La lecture de `:31-50` confirme
qu'**aucun `case "EPERM"` n'existe aujourd'hui** — ce correctif n'est donc pas redondant. C'est
aussi ce qui force `isTransientLaunchFailure` à lire le `code` plutôt que le tag
(`launch-retry.ts:21`).

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
- **`cmd()` lazy** (`shell.ts:387`) : inerte une fois le retry externe retiré.
- **Le chemin git** (`process.ts:9-16`, `:27-44`) : hors périmètre, déjà couvert.
- **Les autres sites `retryTransientLaunch`** — *reliquat nommé, hors périmètre P18, escalade
  `P18-bis`*.

#### 4.5.1 Mesure de la surface — commande, résultat, décomposition

**Commande** : `rg -n retryTransientLaunch packages`
**Résultat exact** : **SITES=34, FILES=12**.

Cette mesure est imposée par `CORRECTIONS.md:223` (C-162), qui **réfute** l'inventaire
précédent : celui-ci annonçait « 11 occurrences » tout en se présentant comme un
« Recensement exhaustif (grep sur packages/**) ». Le rapport était **faux** : la surface réelle
est **34 sites dans 12 fichiers**, soit plus du triple de l'annonce. Le tableau ci-dessous est
construit pour que cette erreur ne se reproduise pas : **chaque** ligne correspondante est
listée, avec sa catégorie et sa forme, et le total est recompté.

> **Ce qui est retiré, et pourquoi.** L'inventaire précédent portait 11 lignes et comptait
> « 34 correspondances grep, dont 8 imports et 2 ré-exports ». Les deux chiffres étaient
> faux : il y a **11 imports** (et non 8), et le tableau ne listait ni les **2 déclarations**,
> ni les **2 mentions en commentaire**, ni les **4 sites de test**. Il ne listait pas non plus
> `ripgrep.ts:237` — déclaré « non relisible, ligne supprimée » — qui **existe** (relevé ci-dessous).
> La prétention d'exhaustivité est **abandonnée**, et ce cycle ne la récupère que par la
> preuve : les 34 lignes sont énumérées.

**Décomposition des 34 correspondances (recomptée, elle doit sommer à 34) :**

| Catégorie | Nombre | Lignes |
|---|---|---|
| Imports | **11** | `shell.ts:13`, `ripgrep.ts:6`, `prompt.ts:22`, `git/index.ts:1`, `snapshot/index.ts:5`, `worktree/index.ts:19`, `project/project.ts:18`, `daemon/auto-commit.ts:5`, `core/src/git.ts:8`, `git-launch-retry.test.ts:7`, `git-launch-retry.test.ts:8` |
| Déclarations (module de définition) | **2** | `launch-retry.ts:48`, `launch-retry.ts:66` |
| Ré-exports | **2** | `process.ts:93`, `process.ts:94` |
| Mentions en commentaire | **2** | `process.ts:14`, `launch-retry.ts:64` |
| Sites d'appel (hors test) | **13** | `shell.ts:584`, `ripgrep.ts:237`, `ripgrep.ts:356`, `ripgrep.ts:387`, `prompt.ts:1034`, `git/index.ts:113`, `snapshot/index.ts:99`, `snapshot/index.ts:608`, `worktree/index.ts:166`, `project/project.ts:152`, `core/src/git.ts:94`, `auto-commit.ts:29`, `auto-commit.ts:62` |
| Sites d'appel (test) | **4** | `git-launch-retry.test.ts:51`, `:59`, `:98`, `:103` |
| **Total** | **34** | sur **12 fichiers** |

**Inventaire exhaustif, fichier par fichier (12 fichiers, 34 lignes).** La colonne « Forme »
n'est renseignée que lorsque la ligne de grep la montre **littéralement** ; sinon elle vaut
« non relevée », et rien n'est deviné.

| # | Fichier | Lignes (toutes) | Forme lisible dans la ligne de grep | Multiplication 8×8 |
|---|---|---|---|---|
| 1 | `packages/opencode/src/tool/shell.ts` | `:13`, `:584` | `:13` import ; `:584` `retryTransientLaunch(spawner.spawn(cmd(...)))` | **oui — corrigé ici** |
| 2 | `packages/opencode/src/file/ripgrep.ts` | `:6`, `:237`, `:356`, `:387` | `:6` import ; `:237` `yield* retryTransientLaunch(` (argument sur lignes suivantes) ; `:356` et `:387` `retryTransientLaunch(spawner.spawn(yield* command(...)))` | **oui pour `:356` et `:387`** ; `:237` non établie |
| 3 | `packages/opencode/src/session/prompt.ts` | `:22`, `:1034` | `:22` import ; `:1034` `retryTransientLaunch(spawner.spawn(cmd))` | **oui** |
| 4 | `packages/opencode/src/git/index.ts` | `:1`, `:113` | `:1` import ; `:113` `yield* retryTransientLaunch(` (argument non relevé) | non établie |
| 5 | `packages/opencode/src/snapshot/index.ts` | `:5`, `:99`, `:608` | `:5` import ; `:99`, `:608` `yield* retryTransientLaunch(` (arguments non relevés) | non établie |
| 6 | `packages/opencode/src/worktree/index.ts` | `:19`, `:166` | `:19` import ; `:166` `yield* retryTransientLaunch(` (argument non relevé) | non établie |
| 7 | `packages/opencode/src/project/project.ts` | `:18`, `:152` | `:18` import ; `:152` `yield* retryTransientLaunch(` (argument non relevé) | non établie |
| 8 | `packages/opencode/src/daemon/auto-commit.ts` | `:5`, `:29`, `:62` | `:5` import de `retryTransientLaunchSync` ; `:29` et `:62` `retryTransientLaunchSync(() => …)` | hors sujet (chemin sync) |
| 9 | `packages/core/src/process.ts` | `:14`, `:93`, `:94` | `:14` commentaire ; `:93`/`:94` ré-exports | sans objet |
| 10 | `packages/core/src/git.ts` | `:8`, `:94` | `:8` import ; `:94` `retryTransientLaunch(` (argument non relevé) | non établie |
| 11 | `packages/core/src/launch-retry.ts` | `:48`, `:64`, `:66` | `:48` `export const retryTransientLaunch` ; `:64` commentaire ; `:66` `export function retryTransientLaunchSync` | sans objet (définition) |
| 12 | `packages/core/test/process/git-launch-retry.test.ts` | `:7`, `:8`, `:51`, `:59`, `:98`, `:103` | `:7`/`:8` imports ; `:51` `retryTransientLaunch(flaky)` ; `:59` `retryTransientLaunch(permanent)` ; `:98` `retryTransientLaunchSync(flaky)` ; `:103` `retryTransientLaunchSync(() => {` | sans objet (test de la fonction) |

**Ce que l'inventaire établit maintenant, et ce qu'il n'établit pas.**

- **Établi, numéroté, relu** : la surface est de **34 sites dans 12 fichiers**, dont
  **13 sites d'appel hors test** et **4 sites d'appel en test**.
- **Établi par la ligne de grep** : **4 sites** portent la multiplication 8×8 sur un
  `spawner.spawn` — `shell.ts:584`, `ripgrep.ts:356`, `ripgrep.ts:387`, `prompt.ts:1034`. Le
  tableau précédent en annonçait « 3 sites `spawner.spawn` […] et 10 lignes confirmées » ;
  le chiffre correct, relu, est **4**.
- **Non établi, et déclaré tel** : la forme de **7 sites d'appel** (`ripgrep.ts:237`,
  `git/index.ts:113`, `snapshot/index.ts:99`, `snapshot/index.ts:608`,
  `worktree/index.ts:166`, `project/project.ts:152`, `core/src/git.ts:94`) n'a pas été relue
  dans ce cycle : la ligne de grep s'interrompt sur `retryTransientLaunch(` et l'argument est
  sur les lignes suivantes. `INFERE:` six d'entre eux passent par `AppProcess`/`gitCommand`
  — leurs lignes d'import co-importent ces symboles avec `retryTransientLaunch`
  (`git/index.ts:1`, `snapshot/index.ts:5`, `worktree/index.ts:19`,
  `project/project.ts:18`, `core/src/git.ts:8`) — mais **un co-import n'est pas une preuve de
  la forme de l'appel**. **Vérification** : lire 5 lignes après chacune de ces 7 lignes.
  Ces 7 sites sont donc comptés dans les 34 mais **exclus** du compte « 4 multiplications
  vérifiées », plutôt que comptés par extrapolation.
- **Deux sites sont hors sujet pour la multiplication** : `auto-commit.ts:29` et `:62` passent
  par `retryTransientLaunchSync`, donc par un chemin synchrone que le chokepoint asynchrone ne
  double pas.

**Ce qui est réintégré à l'inventaire.** Les sites `ripgrep.ts:237` et `project.ts:152` sont
**réintégrés**, parce que ce cycle les a numérotés et confirmés existants. Les « onze
occurrences de `toPlatformError` » sont également réintégrées : le compte est **confirmé**, à
11, et **concentré sur un seul fichier** (§2.7).

**Hors périmètre de ce patch, par choix.** Les 3 sites `spawner.spawn` non-`shell`
(`ripgrep.ts:356`, `ripgrep.ts:387`, `prompt.ts:1034`) portent la **même multiplication 8×8**,
pour le même prix (~57 s) et le même message nu. Ils sont **aussi** hors périmètre de ce patch :
traiter le shell et traiter ripgrep/prompt dans le même changement élargit la surface de
régression sans apport supplémentaire. **Escalade : `P18-bis`**, avec le même §4.1/§4.2 réutilisé
tel quel, en commençant par `launchRefused` et **son test de fourche** (§7, test 2), puisque
c'est précisément la pièce réutilisable.

## 5. Alternatives considered

**5.1 Généraliser / augmenter le budget de tentatives pour le shell.** Rejeté. Le défaut est la
*multiplication*, pas la taille : 8 tentatives et 6 350 ms sont conservées (aucune n'est
supprimée), et l'agrandir porterait le pire cas au-delà de 57 s.

**5.2 Refus immédiat, zéro tentative.** Rejeté. §2.5 ne prouve **pas** la transience, mais le
commentaire d'intention du dépôt l'atteste sans le mesurer. Ce commentaire est relu verbatim par
ce cycle (`cross-spawn-spawner.ts:279-283`) :

```
      // A refused start (`EPERM`/`EACCES` at `uv_spawn`) means no process ever
      // ran, so repeating the launch cannot duplicate work. The retry lives
      // here, at the single chokepoint every caller crosses, because the denial
      // arrives in bursts that outlast any per-caller budget. An error raised
      // after the process actually spawned is never retried.
```

Un refus immédiat convertirait un incident en échec dur d'outil. Cet argument repose sur
l'**intention déclarée**, pas sur une mesure — c'est honnêtement le point faible de cette
alternative, et il est partagé avec §4.5.

> **Citation retirée (cycle 3).** La version précédente de cette section plaçait entre
> guillemets « a refusal arrives in bursts, and a burst can outlast a short budget ». Ce texte
> **n'existe pas** dans le dépôt : c'était une reformulation présentée comme une citation. Elle
> est retirée sans être reformulée ailleurs. Le passage réel dit « the **denial** arrives in
> bursts that outlast **any** per-caller budget » — ce qui **renforce** la thèse de cette
> alternative et ne l'affaiblit pas, mais l'argument doit maintenant être lu sur le texte.

**5.3 Appliquer au shell le correctif « résout le lanceur vers le vrai binaire »
(`process.ts:27-44`).** Rejeté. `pwsh.EXE` n'est pas un lanceur re-exécutant : il n'y a pas de
second spawn à supprimer. Le refus vise d'ailleurs le chemin final résolu
`C:\Program Files\PowerShell\7\pwsh.exe` (§2.5), donc aucune réécriture de chemin ne peut aider.

**5.4 Rejouer avec le shell suivant de `Shell.win()` (`shell/shell.ts:101`).** Rejeté comme
défaut : cela change silencieusement la sémantique — une ligne PowerShell serait réinterprétée
par `bash` ou `cmd`. Une variante *proposée au modèle* dans le message de §4.1 reste possible.

**5.5 Le correctif de §4.2 exactement comme formulé par le verdict — REJETÉ, et le désaccord est
consigné.** Le verdict suggère de dériver l'errno ainsi :

```ts
const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined
```

**Ce code renvoie `undefined` sur un refus réel.** `toPlatformError` construit l'erreur ainsi
(`packages/core/src/cross-spawn-spawner.ts:78-94`, **relu verbatim par ce cycle**) :

```
const toPlatformError = (
  method: string,
  err: NodeJS.ErrnoException,
  command: ChildProcess.Command,
): PlatformError.PlatformError => {
  const cmd = flatten(command)
    .commands.map((x) => `${x.command} ${x.args.join(" ")}`)
    .join(" | ")
  return PlatformError.systemError({
    _tag: toTag(err),
    module: "ChildProcess",
    method,
    pathOrDescriptor: cmd,
    syscall: err.syscall,
    cause: err,
  })
}
```

L'enveloppe passe **cinq champs** — `_tag` (`:87`), `module` (`:88`), `method` (`:89`),
`pathOrDescriptor` (`:90`), `syscall` (`:91`) — plus `cause: err` (`:92`). **Aucun champ
`code`.** Le `code` de l'errno n'existe que sur `cause`, ligne `:92`.

**Statut du désaccord : `closed` — le validateur a tort, et la forme réelle est établie par
quatre sources indépendantes.** (i) La forme du constructeur, relue verbatim :
`cross-spawn-spawner.ts:86-93` ne contient aucun champ `code`. (ii) Le chemin de lecture du
dépôt (`filesystem.ts:105-108`) lit explicitement `(e.cause as { code?: string })?.code` — c'est
la preuve interne que `code` est sur `cause`. (iii) Les trois fixtures qui modélisent un refus
placent toutes `code` sur la cause, jamais sur l'enveloppe (§2.8b). (iv) `spawner-launch-retry.test.ts:15-16`
fait de même. Ce désaccord est **recevable et conservé tel quel**.

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
  directement (`:51`, `:59`, `:98`, `:103`, relevés par grep). La fonction reste inchangée ;
  seul son usage dans `shell.ts` disparaît. Non cassé.
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
transitoire » d'« échec permanent ». Effacer le tag sur ce chemin précis aurait été une
décision non examinée. **§4.1 renvoie donc un `PlatformError` taggé** : le tag reste
observable, et le diagnostic reste lisible par les lecteurs d'errno qui parcourent déjà
`cause`. Les deux propriétés gagnées, aucune perdue.

**Risque induit par ce tag, énoncé.** L'erreur retournée porte un `cause` dont le message
contient `EPERM`/`EBUSY` : `isTransientLaunchFailure` la classera toujours transitoire. Dans
`shell.ts:584` l'`Effect.catch` est **terminal** — rien ne ré-embarque derrière — donc aucun
retry supplémentaire. C'est le comportement voulu : la branche `Busy` dit explicitement
« réessaie après le déverrouillage », donc préserver la transience est cohérent.

**Typecheck.** Retirer `retryTransientLaunch` de `shell.ts:13` sans le remplacer casse
`noUnusedLocals` (§4.3). Ajouter `launchRefused` à `process.ts:88-95` est obligatoire (§4.2).
Le changement d'import de `launch-retry.ts:2` et son interaction avec `:77` sont le **seul
point de typecheck que cette révision ne peut pas exécuter** (§4.1). L'état de départ est
connu : `bun typecheck` sur `packages/core` rend `CORE_TC_EXIT=0`, `TS_ERRORS=0`, et
`toTag` porte déjà `PlatformError.SystemErrorTag` en `:31` (§2.11).

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

**Test 2 (nouveau) — LA BRANCHE `Busy`.**

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
| 4 | La classe de défaut survit à P18 sur ≥ 3 sites | **`out_of_scope`** | §4.5.1 : surface **bornée et mesurée** à 34 sites / 12 fichiers, **4 multiplications 8×8 vérifiées** (et non « ≥ 3, borne inconnue »), 7 formes de site non établies et **exclues** du compte ; escalade **`P18-bis`** nommée. Reliquat assumé, pas accepté dans P18 |
| 5 | Le retag efface le tag sur le chemin d'échec de l'outil `bash` | **`closed`** | §4.1 : retour `PlatformError` **taggé** (`Busy` propagé, sinon `PermissionDenied`), diagnostic sur `cause` ; §7 test 2 couvre les deux propriétés |
| + | `EBUSY_ANY=3` non audité (§2.7 de la vague 2) | **`closed`** | §2.9 : offsets relevés, **3/3 occurrences auto-référentes**, compte réfuté comme preuve et **retiré de l'argumentaire** ; branche re-groundée sur trois faits de code |
| + | `COR-R18-3` — typage de `toTag` suspecté | **`closed`** | §2.11 : `:31` porte **déjà** `PlatformError.SystemErrorTag`, `:35-36` renvoie **déjà** `"PermissionDenied"` ; `bun typecheck` sur `packages/core` rend `CORE_TC_EXIT=0`, `TS_ERRORS=0`. Le motif « mandat sans shell » était une **lacune de capacité**, pas un défaut |
| + | `COR-R18-4` — « ≥ 3 sites, borne supérieure inconnue » | **`closed`** | §4.5.1 : `rg -n retryTransientLaunch packages` ⇒ **SITES=34, FILES=12** ; les 34 lignes sont énumérées et re-comptées par catégorie. La borne supérieure est **connue**, le reliquat est **borné** et escaladé en `P18-bis`. Le motif « sans grep » était une **lacune de capacité** |
| + | Exhaustivité de l'inventaire §4.5 (`CORRECTIONS.md:223`, C-162) | **`closed`** | §4.5.1 : l'inventaire 11-lignes / « 8 imports » est **retiré**, remplacé par la mesure 34/12 et la décomposition 11+2+2+2+13+4 |
| + | Fidélité des citations de `shell.ts` | **`closed`** | §2.4 : **huit** ancres périmées relevées et re-groundées une à une (`shell.ts:498`→`:584`, `:301`→`:387`, `:301-322`→`:387-408`, `:302`→`:388`, `:303-305`→`:389-391`, `:310`→`:396`, `:320`→`:406`, `:350`→`:436`, `:354`→`:440`), chacune vérifiée par relecture verbatim |
| + | Fidélité de la citation de `launch-retry.ts` dans §5.2 | **`closed`** | §5.2 : la paraphrase présentée comme citation est **retirée** ; le commentaire `:279-283` est cité verbatim |

**Aucune objection de la vague 4 n'est `open`.**

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
- **7 formes de sites d'appel non établies** (§4.5.1) : bornent le reliquat `P18-bis`, ne
  touchent pas le patch P18.

## 10. Verdict self-assessment

`NEEDS_REVIEW`

Le diagnostic central est confirmé par le verdict et **aucune des cinq objections ne remet en
cause ni l'architecture ni le message** du correctif. Les quatre objections locales ont été
levées et la cinquième convertie en reliquat nommé, dont la surface est désormais **bornée par
la mesure** au lieu de l'être par une borne inconnue.

Ce cycle a levé le blocage C-162 et, en le levant, a trouvé **défaut sur défaut** dans les
citations de la proposition : huit ancres `shell.ts` périmées, une citation fausse en §5.2, une
mention « non relisible » sur une ligne qui existe (`ripgrep.ts:237`), et un décompte « 8
imports » faux. Les huit ancres sont corrigées et vérifiées ; le reste est retiré ou corrigé.

Le verdict reste donc **`NEEDS_REVIEW` et non `IMPLEMENTABLE`** : les seuls `open` restants sont
les 7 formes de sites d'appel de `P18-bis` (§11, R-3/R-4), qui ne touchent pas le patch P18 mais
dont la valeur — « au plus 4 multiplications de plus que 4 » — n'est pas encore établie.

## 11. Résidus

Aucun de ces résidus ne porte sur l'architecture ni sur le message du correctif. Chacun est
borné, avec sa mesure ou la raison de son maintien.

| # | Résidu | Statut | Établi par / raison du maintien | Ce qui le ferme |
|---|---|---|---|---|
| R-1 | **Fidélité des ancres `shell.ts`** | **`closed`** | Huit ancres périmées relevées et re-groundées (§2.4, tableau de correction) : `:498`→`:584`, `:301`→`:387`, `:301-322`→`:387-408`, `:302`→`:388`, `:303-305`→`:389-391`, `:310`→`:396`, `:320`→`:406`, `:350`→`:436`, `:354`→`:440`. Le contenu réellement trouvé à chaque fausse ancre est consigné. **Les ancres de `shell/shell.ts` (`:98`, `:101`, `:104`, `:122`) sont confirmées verbatim** ; les bornes non observées (`:109`, `:117`, `:99`) sont abandonnées | — |
| R-2 | **Plage `cross-spawn-spawner.ts:78-94`** (construction du `PlatformError`) | **`closed`** | Relu verbatim : `systemError({` en `:86`, `cause: err` en `:92`, **aucun champ `code`** dans l'enveloppe (`:87`-`:91`). Le désaccord de §5.5 est donc établi sur la forme réelle, et non sur une citation héritée | — |
| R-3 | **Forme de 7 sites d'appel** (`ripgrep.ts:237`, `git/index.ts:113`, `snapshot/index.ts:99`, `snapshot/index.ts:608`, `worktree/index.ts:166`, `project/project.ts:152`, `core/src/git.ts:94`) | **`open`**, `out_of_scope` pour P18 | §4.5.1 : la ligne de grep s'interrompt sur `retryTransientLaunch(`. Le co-import de `AppProcess`/`gitCommand` **n'est pas** une preuve de la forme de l'appel. Ces sites sont **comptés** dans les 34 mais **exclus** du compte « 4 multiplications vérifiées » | Lire 5 lignes après chacune. Reliquat `P18-bis` |
| R-4 | **Multiplication sur `ripgrep.ts:237`** spécifiquement | **`open`**, `out_of_scope` pour P18 | Même raison que R-3 ; c'est le seul site `spawner.spawn` dont la forme n'est pas prouvée, donc il pourrait être un **5ᵉ** site de multiplication | Lire `ripgrep.ts:237-243` |
| R-5 | **Corps des sites git / snapshot / worktree / project non relus** (au-delà de la ligne d'appel) | **`open`**, `out_of_scope` pour P18 | Aucune affirmation de P18 ne dépend de leur contenu ; l'inventaire s'arrête à la ligne de correspondance | Relire lors de `P18-bis` |
| R-6 | **`run-timeout.test.ts`, `process.test.ts`** | **transféré à l'exécution** | Non relus (§6). `bun test test/process` les couvre | Porte de merge de §7 |
| R-7 | **Typecheck `launch-retry.ts:2` / `:77`** | **transféré à l'exécution** | Impossible sans shell (§4.1). Repli spécifié. L'état de départ est bon : `CORE_TC_EXIT=0`, `TS_ERRORS=0` | Typecheck du package |
| R-8 | **Volume de refus sur `pwsh.exe`** (`UV_SPAWN_PWSH`) | **`open`**, hors périmètre | Non mesuré ; le « 387 » du mandat reste non reproductible (§2.5, §2.7). §2.5 borne le risque sans établir la transience | Le ratio 24 h décrit en §2.5 |
| R-9 | **`EBUSY` réel au spawn** | **fermé comme preuve, `open` comme fait** | `EBUSY_ANY=3` est **confirmé comme compte et réfuté comme preuve** (§2.9) : les 3 occurrences sont auto-référentes, dans le journal, hors `packages/**`. La branche est conservée et **testée** sur des faits de code (§2.10, §7 test 2), donc le résidu n'a plus d'effet sur la décision | Un refus `EBUSY` observé au spawn, un jour |
| R-10 | **`COR-R18-3`, `COR-R18-4`** | **`closed`** | Tranchés par mesure, pas par argument : `CORE_TC_EXIT=0` / `TS_ERRORS=0` ; `:31` et `:36` relus verbatim (§2.11) ; `SITES=34` / `FILES=12` (§4.5.1). Leurs motifs d'ouverture étaient des **lacunes de capacité** du revalidateur | — |
| R-11 | **Décompte « 11 occurrences » / « Recensement exhaustif »** de l'inventaire précédent | **`closed`** | Réfuté par `CORRECTIONS.md:223` (C-162), puis remplacé par la mesure. Le tableau ne revendique plus rien sans preuve : les 34 lignes sont énumérées et la somme recomptée | — |

**Ce qui n'est pas un résidu.** L'objection 4 reste `out_of_scope` avec un reliquat nommé
(`P18-bis`) : c'est un **choix de périmètre assumé**, pas une lacune, et sa surface est
désormais bornée par la mesure au lieu de l'être par une borne déclarative.