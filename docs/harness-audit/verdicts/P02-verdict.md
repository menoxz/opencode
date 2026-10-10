# P02 — `description` dans la clé de signature rend `FAILURE_LIMIT` inatteignable

## Proposal

`P02` — `description` dans la clé de signature rend `FAILURE_LIMIT` inatteignable
`C:\jeanluc\opencode-fork\docs\harness-audit\proposals\P02-signature-noise.md`

## Validator

`validator-independent-p02` — `independent` : n'a pas rédigé la proposition. Vérification faite par
lecture directe des sources citées, sans modifier aucun fichier du dépôt.

## Status

`PASS_WITH_CHANGES`

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | KO | 30 citations vérifiées exactes ; 1 fausse (`package.json:17`) ; 1 mesure non reproductible (§2 (g)) |
| le correctif supprime vraiment la cause | ok | `packages/opencode/src/tool/repetition.ts:82-84` est le seul point de calcul de la clé, appelé par `inspect` `:120` **et** `record` `:147` |
| le correctif ne casse pas un comportement existant | ok | `src/tool/repetition.test.ts:16-17` n'emploie aucun champ `description` → aucun jugement existant ne bouge |
| tests proposés sont exécutables dans ce dépôt | KO | runner et chemin valides, mais le cas 4 utilise une clé de schéma inexistante : `grep "updates"` sur `src/tool/tasks.ts` → **No files found** ; le vrai chemin est `task` (`tasks.ts:57-62`) |
| effort et coût annoncés réalistes | ok | 1 fichier, 1 fonction, ~10 lignes : `package.json:10` confirme le runner, le fichier de test est au bon emplacement |

### Citations vérifiées exactes et verbatim

Toutes les citations suivantes ont été ouvertes et comparées caractère à caractère :

- `repetition.ts:18-20` (règle FAILURE), `:26-28` (règle IDLE-OUTPUT), `:37` (`WINDOW = 24`),
  `:43` (`export const FAILURE_LIMIT = 3`), `:67`, `:69`, `:72-79` (`stableStringify`),
  `:75-78` (filtre `undefined`), `:82-84` (`signature`), `:110-113` (`preview`), `:129`,
  `:147`, `:155`, `:161-163`, `:166`, `:172-176`, `:188-194`.
- `tool.ts:127`, `:132`, `:153-155`, `:162`, `:163-164`, `:179`, `:183-185`.
- `shell/prompt.ts:11`, `:24-28`, `:29` — le bloc `command`/`timeout`/`workdir`/`description` est
  exactement aux lignes 24-29.
- `shell.ts:350-351`, `:351`, `:540-545`.
- `task.ts:53-58`, `:85`, `:86`, `:291-292`, `:292`.
- `tasks.ts:28`, `:30`.
- `workspace-handoff.ts:19` (`reason`), `:21` (`title`) ; `goal-contract.ts:63-65`, `:69-71`, `:436` ;
  `environment.ts:17`, `:31`.
- `package.json:10` (`"test": "bun test --timeout 30000"`).
- `src/tool/repetition.test.ts` existe bien, 156 lignes, `:16-17` et `:21-41` conformes.

### Surface réelle des champs non sémantiques (question 3)

`grep "^\s{2,6}(description|question|prompt|subtask_summary|summary|title)\s*:\s*(Schema\.|z\.)"`
sur `packages/opencode/src/tool` → 13 correspondances. Répartition des champs **de premier niveau**
et non sémantiques :

| champ | outils qui le déclarent au premier niveau | traité par P02 ? |
|---|---|---|
| `description` | `shell/prompt.ts:29`, `task.ts:53`/`:85` | oui |
| `title` | `environment.ts:31`, `workspace-handoff.ts:21` | non (différé §9) |
| `summary` | `environment.ts:17`, `goal-contract.ts:436` | non (différé §9) |
| `reason` | `workspace-handoff.ts:19` | non (différé §9) |

`tasks.ts:30` est un `description` **imbriqué** dans `Patch` (`:28`) lui-même imbriqué sous la clé
`task` (`:57-62`) : le filtre de premier niveau ne le touche pas. Le raisonnement de la proposition
lignes 163-166 est donc **correct et vérifié**.

L'inventaire de la proposition est donc complet sur les 4 familles de champs décoratifs trouvées,
mais le correctif n'en couvre **qu'une sur quatre**. C'est un scopage assumé (§9, point 1), pas une
omission cachée — mais le titre du document et le §2 (a) formulent la thèse au niveau de la
classe de défaut, alors que le patch ne traite que `description`.

### Risque « deux commandes réellement différentes indiscernables » (question 4)

**Faible, et le risque est correctement placé.** Vérification de la consommation réelle de
`description` :

- Famille shell : `input.description` n'apparaît qu'à `shell.ts:491`, `:532`, `:543`, `:612`,
  `:616` — métadonnées de sortie et `title`. Il n'atteint jamais le spawn. Deux appels shell
  différant seulement par `description` exécutent donc **la même commande** : les fusionner est le
  comportement correct, pas un masquage.
- `task` : `description` est requis (`:85`) mais n'est consommé qu'en affichage — métadonnées de
  permission (`:419`), texte de notification background (`:231-234`), champs `title:` (`:373`, `:453`,
  `:524`, `:602`, `:662`, `:704`, `:712`, `:723`). L'invocation réelle est pilotée par `prompt` et
  `subagent_type`, qui **restent dans la clé**.

Le vrai danger serait d'exclure `prompt` : la proposition le refuse explicitement (lignes 171-175)
et ce refus est le bon. Verdict : `description` est la seule exclusion sûre au premier lot.

## Objections

**O1 — Citation fausse : `package.json:17` n'est pas `bench:test`.**

La proposition ligne 245-246 écrit « la mesure à produire est `bun run bench:test`
(`package.json:17`) ». Fichier ouvert, `packages/opencode/package.json:16-17` :

```
16:    "bench:test": "bun run script/bench-test-suite.ts",
17:    "profile:test": "bun run script/profile-test-files.ts",
```

`bench:test` est en `:16`, pas `:17`. Décaler la citation. Sans effet sur le fond (le script existe
et le runner est correct), mais une citation fausse est en soi un motif de `PASS_WITH_CHANGES`.

**O2 — La mesure §2 (g) est présentée comme reproductible, elle ne l'est pas.**

La proposition annonce `JOURNAL_LINES=1253`. Recompté sur la même machine, même fichier :

```
JOURNAL_LINES=1267   (exit 0)
JOURNAL_BASH1=138
JOURNAL_SEEN=0
```

`JOURNAL_BASH1=138` et `JOURNAL_SEEN=0` se reproduisent **exactement** — les deux affirmations
substantielles de la section sont confirmées, y compris l'absence totale du motif `seen \d+x`. En
revanche le nombre de lignes ne se reproduit pas : c'est le journal d'échecs **vivant de la session
en cours** (le chemin est celui référencé par le harness lui-même), il grandit pendant que l'on
compte. Un décompte de lignes sur ce fichier ne peut pas être une preuve reproductible : le citer
comme « Résultat » d'une commande invite le lecteur à le rejouer et le voir contredire. Corriger
en « ≥ 1 253 au moment de la mesure, fichier en croissance », ou retirer le chiffre.

**O3 — Le cas de test 4 utilise une clé de schéma qui n'existe pas.**

Proposition lignes 291-292 :

```
signature("tasks", { updates: [{ description: "x" }] })
```

`grep "updates"` sur `packages/opencode/src/tool/tasks.ts` → **No files found**. L'outil `tasks`
n'a pas de champ `updates`. La forme réelle est `task: Patch` (`tasks.ts:57-62`), où `Patch`
déclare `description` en `:30`. Le cas 4 est le **seul** garde-fou qui prouve que le filtre est
superficiel et non récursif ; avec une clé fantôme il reste vert sans jamais passer par la forme
d'args qu'un outil émet réellement. Remplacer par
`signature("tasks", { task: { description: "x" } })` vs `{ task: { description: "y" } }`.

**O4 — Le risque de faux positifs est sous-estimé : l'IDLE-OUTPUT ne protège pas la règle FAILURE.**

Proposition lignes 251-253 : « la règle IDLE-OUTPUT (`:26-28`) garantit qu'un appel dont la sortie
**change** n'est jamais bloqué (`:166`) : un `bun test` dont le nombre d'échecs évolue reste
autorisé. »

`repetition.ts:161-168` :

```
161:  if (!outcome.ok) {
162:    entry.failures += 1
163:    entry.idle = 0
164:  } else {
165:    entry.failures = 0
166:    entry.idle = entry.digest === outcome.digest ? entry.idle + 1 : 0
167:    entry.digest = outcome.digest
168:  }
```

`failures` est incrémenté **sans condition** et n'est remis à zéro que sur un **succès** (`:165`).
Un digest qui change ne le protège donc pas. Conséquence directe et non couverte par la
proposition : c'est précisément la règle FAILURE que le patch rend atteignable, et une commande qui
échoue 3 fois en évoluant (`127 → 95 → 3` tests rouges) sera bloquée à la 3ᵉ alors que chaque
exécution apprenait quelque chose. La mitigation §5 doit dire vrai sur ce point : IDLE-OUTPUT
protège le compteur `idle`, pas le compteur `failures`.

## Required changes

1. Corriger `package.json:17` → `package.json:16` (O1).
2. Reformuler §2 (g) : les compteurs `138` et `0` sont reproductibles, le nombre de lignes ne l'est
   pas ; le fichier est vivant (O2).
3. Remplacer le cas de test 4 par la forme réelle `{ task: { description: ... } }`
   (`tasks.ts:57-62`), pas `updates` qui n'existe pas (O3).
4. Réécrire la mitigation de faux positifs : `entry.failures` n'est remis à zéro que sur succès
   (`repetition.ts:165`), donc un échec répété à sortie évolutive est bloqué. Ou étendre la
   correction à `entry.failures = 0` quand le digest change, ce qui est un choix de conception à
   trancher explicitement (O4).
5. Aligner le titre et le §2 (a) sur le périmètre réel : la classe de défaut est « champ décoratif
   de premier niveau », le patch ne traite que `description`. Les trois autres (`title`, `summary`,
   `reason`) restent des instances connues du même défaut, à planifier.

## Implementation guidance

Ordre : (1) corriger d'abord le test — cas 1, 2, 4 avec les formes réelles `{command, description}`
et `{task: {description}}`, plus le contrôle négatif de mutation déjà bien spécifié (§7) ; (2)
appliquer le filtre dans `signature` (`repetition.ts:82-84`) en laissant `stableStringify` intact —
ne surtout pas filtrer dans `stableStringify`, sinon `Entry.args` (`:155`) perdrait le `description`
réellement envoyé et `preview` (`:110-113`, `:129`) mentirait au modèle ; (3) ne toucher à aucun
schéma d'outil ; (4) enchaîner sur `bun test src/tool/repetition.test.ts` puis `bun run bench:test`
(`package.json:16`). Piège connu : la clé de `task` est la constante locale de `task.ts:291-292`
et non un littéral, idem `ShellID.ToolID` (`shell.ts:350-351`) — c'est ce qui a fait rejeter
l'option A (table par id), et ce couplage doit rester évité tant que le lot 2 n'est pas décidé.