## Proposal

`P18` — le refus EPERM au spawn du shell : budget doublé et erreur non actionnable

Chemin : `docs/harness-audit/proposals/P18-eperm-spawn.md`

## Validator

`independent` — validateur n'ayant pas rédigé la proposition. Aucun fichier source
modifié pendant cette validation ; lecture seule, plus un comptage de citations.

## Status

`PASS_WITH_CHANGES`

Le diagnostic central est **correct et bien prouvé** : le budget de retry est appliqué
deux fois (64 `launch()`, ~57 s), et l'échec final remonte un errno nu. Les quatre
objections ci-dessous sont des corrections locales qui ne remettent pas en cause la
thèse : aucune n'exige de revoir l'architecture du correctif.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | KO (1/24) | `packages/core/src/process.ts:88-95` — voir Objection 3 |
| le correctif supprime vraiment la cause | ok | `packages/opencode/src/tool/shell.ts:498` (`retryTransientLaunch(spawner.spawn(cmd(...)))`) + `packages/core/src/cross-spawn-spawner.ts:284-298` = 2 politiques imbriquées, 8×8 |
| le correctif ne casse pas un comportement existant | **KO** | `packages/opencode/test/tool/shell-launch-retry.test.ts:103` casse — voir Objection 1 |
| tests proposés sont exécutables dans ce dépôt | ok | `packages/core/test/process/spawner-launch-retry.test.ts:44-48` (`refusingProc`) et `:50-55` (`build`/`calls.count`) existent et sont réutilisables tels quels |
| effort et coût annoncés réalistes | ok | `packages/core/src/launch-retry.ts:42-43` : `LAUNCH_RETRY_ATTEMPTS = 8`, délais `50+100+200+400+800+1600+3200 = 6350 ms` — arithmétique de la proposition exacte ; pire cas `8 × 6350 + 6350 ≈ 57 150 ms` correct |

Citations vérifiées **exactes et verbatim** (24) : `core/src/process.ts:10-15`,
`core/src/launch-retry.ts:4-10`, `:30`, `:31`, `:33`, `:42`, `:43`, `:48-55`,
`core/src/cross-spawn-spawner.ts:279-298`, `:285`, `:287`, `:289`, `:291`, `:292`,
`:297`, `:314-315`, `:318`, `:321`, `:322-324`, `:332-338`, `:31-50` (`toTag`, `EPERM`
absent → `default: return "Unknown"` ligne 47-48), `opencode/src/tool/shell.ts:13`,
`:301-322`, `:320`, `:350`, `:354`, `:498`, `shell/shell.ts:104`, `:122`,
`tool/registry.ts:153`, `:583`, `core/test/process/git-launch-retry.test.ts:44-61`,
`core/test/process/spawner-launch-retry.test.ts:15-16`.

## Objections

### 1. Le test existant `packages/opencode/test/tool/shell-launch-retry.test.ts` casse, et la proposition l'a manqué

Ce fichier existe (106 lignes) et **asserte explicitement le comportement que §4.1 supprime**.
La proposition ne le mentionne nulle part : §2.8 ne cite que les tests de `packages/core`,
et §6 affirme « aucun test de l'outil shell n'a été trouvé » en se justifiant par un
`glob` en échec — puis qualifie honnêtement cela de « lacune, pas une preuve d'absence ».
La lacune est en réalité comblée par le fichier lui-même.

Le mécanisme, ligne par ligne :

- `shell-launch-retry.test.ts:54-68` remplace `ChildProcessSpawner.spawn` **au-dessus** du
  chokepoint interne. Le retry de `cross-spawn-spawner.ts:284-298` est donc **court-circuité** :
  il ne s'exécute jamais dans ce test. `starts.count` ne compte que les appels de la
  politique **externe**.
- `:64` — `starts.count < LAUNCH_BUDGET ? Effect.fail(refused(command)) : Effect.fail(permanent(command))`
- `:20` — `const LAUNCH_BUDGET = 5`, commentaire `:19` : « one start plus the four retries the shared policy allows »
- `:103` — `expect(starts.count).toBeGreaterThanOrEqual(LAUNCH_BUDGET)`

Aujourd'hui : 1 + 7 = 8 ≥ 5 → vert. **Après §4.1** (retrait de `retryTransientLaunch` en
`shell.ts:498`) : un seul et unique `spawner.spawn` est appelé, il échoue en `refused`
(`1 < 5`), et l'assertion devient `1 >= 5` → **échec**.

Ce n'est pas une régression de comportement mais un test qui encode l'ancien budget
multiplié. Il **doit** être mis à jour, pas contourné.

**Changer :** réécrire `shell-launch-retry.test.ts` pour asserter `starts.count === 1`
et `Exit.isFailure(exit) === true`, et vérifier que le message exposes `No process was created`.
Le test devient la preuve directe de l'absence de multiplication côté outil — exactement
le rôle que §7 attribue au test 2 côté core, mais pour la couche `packages/opencode`.

### 2. Le message §4.2 affirme `EPERM` alors que la garde qui l'appelle accepte six classes d'échec

Texte exact proposé (`P18-eperm-spawn.md:166-174`) :

```
opencode could not start a process after ${attempts} attempts: the host refused to create "${executable}" (EPERM at uv_spawn). No process was created, so the command never ran and nothing needs cleanup. Retry the command, or grant the executing identity rights on "${executable}". Underlying error: ${detail}
```

L'objection porte sur l'**affirmation `(EPERM at uv_spawn)` en dur** dans la chaîne. Or
l'appel est gardé par `isTransientLaunchFailure(error)` (`P18:149`), dont le motif est
`packages/core/src/launch-retry.ts:8` :

```ts
const transientLaunch = /EPERM|EACCES|EBUSY|operation not permitted|uv_spawn|Access is denied|Accès refusé|error launching/i
```

`EACCES` et `EBUSY` passent cette garde au même titre qu'`EPERM` (`transientTag` `:9`
mappe `Busy`, `transientCode` `:10` accepte `EPERM|EACCES|EBUSY`). Un `EBUSY` produit donc
un message qui ** diagnostique à tort un problème de droits** et oriente le modèle vers
« grant the executing identity rights » alors que la cause est une contention de verrou,
que seule l'attente résout. Le message n'est pas déterministe **par rapport à sa cause** :
même chemin de code, diagnostics opposés.

Second défaut, même fonction : `:167` `const detail = error instanceof Error ? error.message : String(error)`.
Or `launch-retry.ts:6-7` documente que « `AppProcessError` carries an empty `message` : the
denial only survives in `cause`/`stderr` ». Sur un `PlatformError` à `message` vide, la
chaîne se termine par `Underlying error: ` suivi de rien — l'errno qui a motivé le
diagnostic disparaît du texte. Le suffixe `Underlying error:` n'est pas garanti non vide,
donc non déterministe.

**Changer :** dériver l'errno du `code` plutôt que le figer, et n'inclure le suffix
`Underlying error:` que si `detail` est non vide. Ex.pected :

```ts
const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined
const suffix = detail ? ` Underlying error: ${detail}` : ""
```

Le reste du texte (« No process was created… nothing needs cleanup », le nom de
l'exécutable, le compteur de tentatives) est bon,actionnable et stable — voir §2.5 du
rapport de validation.

### 3. §4.1 affirme que `launchRefused` est « déjà ré-exporté » — il ne l'est pas

`P18:155` : « depuis `@opencode-ai/core/process` (déjà ré-exportés en `packages/core/src/process.ts:88-95`) ».
Le bloc réel, `packages/core/src/process.ts:88-95`, exporte six noms :

```ts
export {
  isTransientLaunchFailure,
  LAUNCH_RETRY_ATTEMPTS,
  LAUNCH_RETRY_DELAYS_MS,
  launchRetryDelayMs,
  retryTransientLaunch,
  retryTransientLaunchSync,
} from "./launch-retry"
```

`launchRefused` y est absent. L'affirmation est fausse et, prise littéralement, le patch
de §4.1 **ne compile pas** (symbole non exporté). Le reste de l'affirmation est exact :
`isTransientLaunchFailure` et `LAUNCH_RETRY_ATTEMPTS` sont bien déjà là.

**Changer :** ajouter `launchRefused` à ce bloc `export` dans le même patch, et reformuler
« déjà ré-exportés » en « à ré-exporter ici ». C'est la seule citation inexacte du lot.

### 4. La transience de l'EPERM est affirmée, pas mesurée — et l'argument du mandat est inversé

Deux points distincts.

**(a) Le mandat demande si la proposition argumente qu'un RETRY serait une mauvaise
réponse. Elle argues l'inverse, et c'est le bon choix.** §4.4 conserve explicitement
« Le retry interne du chokepoint … c'est le bon niveau » et `LAUNCH_RETRY_ATTEMPTS = 8`
est maintenu ; §5.2 rejette « Refus immédiat, zéro tentative ». La proposition supprime la
**duplication**, pas le retry. La question du mandat est donc sans objet tel qu'écrite ;
le risque réel n'est pas le retry mais le budget dupliqué.

**(b) La justification de ce choix est plus faible que présentée.** §2.5 fonde la
transience sur « Reproduite **deux fois dans cette session** … la tentative suivante du
même type a réussi » : deux observations auto-rapportées, sans artefact. Ce qui est
 incompatible avec son propre §2.7, qui mesure `UV_SPAWN_TOTAL=1` et `UV_SPAWN_PWSH=0`
sur les 11 `.jsonl` du failure-journal — soit **zéro** corroboration logarithmique du
refus sur `pwsh` qui est précisément le phenomenon à expliquer.

Et l'argument est inversible : un `EPERM` caused par un antivirus ou une ACL est
**permanent**, et produirait tout aussi bien un grand nombre d'occurrences. Le volume
cité par le mandat (387) est donc **compatible avec les deux hypothèses** et ne départage
rien. Je n'ai pas pu reproduire ce chiffre non plus ; comme la proposition, je le declare
non vérifié.

Ce qui sauve le correctif : en cas de cause permanente, le coût tombe de ~57 s à 6,35 s
par appel (un seul budget), et le message oriente vers les droits d'exécution — le bon
levier pour un `EPERM` permanent. Le risque est donc **borné et acceptable**, mais il doit
être énoncé comme tel au lieu d'être présenté comme une transience établie.

**Changer :** remplacer l'affirmation « le refus est transitoire » par la formulation
bornée (« non mesuré ; le pire cas est 6,35 s et le message nomme le levier droits »),
et ajouter au §2.5 la mesure manquante : compter, sur une fenêtre fixe, le ratio
refus/succès sur `pwsh.exe`. Sans cela, l'argument §5.2 repose sur deux anecdotes.

## Required changes

1. **Mettre à jour `packages/opencode/test/tool/shell-launch-retry.test.ts`** (Objection 1) :
   remplacer `:103` `toBeGreaterThanOrEqual(LAUNCH_BUDGET)` par `starts.count === 1`, et
   ajouter l'assertion sur `No process was created`. Ne pas supprimer le fichier.
2. **Dériver l'errno du `code` dans `launchRefused`** au lieu de figer `(EPERM at uv_spawn)`,
   et conditionner le suffixe `Underlying error:` à un `detail` non vide (Objection 2).
3. **Ajouter `launchRefused` au bloc `export` de `packages/core/src/process.ts:88-95`** dans
   le même patch que §4.1, et corriger la mention « déjà ré-exportés » (Objection 3).
4. **Réviser §2.5** : remplacer l'affirmation de transience établie par la formulation bornée,
   et signaler que le chiffre 387 reste non reproductible (Objection 4).

Les points 1 à 3 sont bloquants pour le merge. Le point 4 est une exigence de rigueur
documentaire.

## Implementation guidance

Ordre : (1) ajouter `launchRefused` dans `launch-retry.ts` **et** l'exporter dans
`process.ts:88-95`, (2) typer `EPERM` dans `toTag` (`cross-spawn-spawner.ts:31-50` — vrai
bug au passage, `EPERM` retombe sur `default: return "Unknown"` ligne 47-48), (3) patcher
`shell.ts:498` et **retirer l'import `retryTransientLaunch` de `shell.ts:13`** sinon
`noUnusedLocals` casse le typecheck, (4) mettre à jour
`packages/opencode/test/tool/shell-launch-retry.test.ts`, (5) ajouter le cas `EPERM`/`pwsh.exe`
dans `packages/core/test/process/spawner-launch-retry.test.ts`.

Piège connu : `shell-launch-retry.test.ts` **court-circuite** le retry interne en
remplaçant `ChildProcessSpawner.spawn` au-dessus du chokepoint ; ne pas s'en servir pour
mesurer le budget interne, il ne voit que la politique externe. Piège secondaire :
`bun test test/tool/shell-launch-refusal.test.ts` de §7 échouera sur la tentative 2 du
fichier car `bun test` n'accepte pas un chemin de fichier et un répertoire mélangés — utiliser
`bun test test/tool/`. Vérification finale : `cd packages/core && bun test test/process`
et `cd packages/opencode && bun test test/tool`, tous deux verts.
