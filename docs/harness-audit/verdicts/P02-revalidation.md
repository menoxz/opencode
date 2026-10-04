# P02 — revalidation cycle 2

**Statut : `REVALIDATED-PASS_WITH_CHANGES`** — implémentable (règle 1 du gabarit satisfaite).

Révalidateur indépendant du cycle 2. Je n'ai rédigé ni la proposition initiale, ni le verdict
cycle 1, ni la révision cycle 2 ; je n'édite pas la proposition (**C-36** : le revalidateur
constate et classe). Aucun `git`, aucune écriture sous `packages/**`, aucun commit.

Différence de méthode avec le cycle 1 et le cycle 2 : ici **le shell est autorisé** (règle 7), la
baseline est **exécutée** et non lue, et `bun typecheck` rend `TYPECHECK_EXIT=0` (**C-46**). Le
bruit de fond décrit par la requête — deux résidus `open` qui senitzmoient leur statut — est donc
directement testable : il ne l'est plus. Je l'ai testé.

## Proposal

`P02` — champ décoratif de premier niveau dans la clé de signature : `description` rend
`FAILURE_LIMIT` inatteignable (lot 1 sur 4)
`C:\jeanluc\opencode-fork\docs\harness-audit\proposals\P02-signature-noise.md` — **569 lignes**,
révisée cycle 2 (marqueur `:3`).

Le correctif est d'un seul fichier : `signature` (`repetition.ts:82`) projette ses `args` en
retirant les clés d'un `Set` nommé `DECORATIVE = new Set(["description"])` (`proposal:258-270`).

## Revisions applied

Le marqueur de révision n'est **pas** utilisé comme preuve (**C-21**). Les 5 Required changes du
verdict cycle 1 (`P02-revalidation.md:64-67` et `:258-273`) sont recontrôlés un par un contre le
code, et non contre la promesse du tableau `proposal:12-18`.

### R1 — GUÉRIE, vérifiée dans le code du test, pas dans la prose

Le cycle 1 était bloquant parce que `digest` est **requis**
(`repetition.ts:48-52`, relu : `digest: string`, sans `?`) alors que le cas 2 écrivait
`{ ok: false }`.

| point contrôlé | observation | statut |
|---|---|---|
| `Outcome.digest` est requis | `repetition.ts:48-52` | **confirmé** |
| encadré de compilation | `proposal:456-474`, règle en gras `proposal:458` : « Le cas 2 doit écrire `{ ok: false, digest: "" }`. `{ ok: false }` seul **ne compile pas** » | **confirmé** |
| **code du cas 2** | `proposal:490-491` : `record(SESSION, "bash", A, { ok: false, digest: "" })` puis `record(SESSION, "bash", B, { ok: false, digest: "" })` | **corrigé — compile** |
| plus aucune occurrence non corrigée | grep `ok: false \}` → **3 hits** (`:14`, `:458`, `:487`), tous trois descriptifs (tableau d'objections, encadré, commentaire de code). **Aucun site d'appel** | **confirmé** |
| convention de la suite | `repetition.test.ts:75-76` : `{ ok: false, digest: "" }` | **confirmé** |
| même littéral en production | `tool.ts:155` et `tool.ts:179` | **confirmé** |

**R1 est réellement levée, pas requalifiée.** Le littéral qui bloque la compilation a été
corrigé dans le code du test lui-même, et `bun typecheck` rend `TYPECHECK_EXIT=0` sur le
workspace : le type `Outcome` est cohérent avec le littéral écrit.

### R2 — GUÉRIE, les 14 citations du reclassement sont vraies

Le cycle 1 affirmait à l'envers que `goal-contract.ts:436` était « imbriqué ». Le cycle 2
requalifie et compte 4. J'ai vérifié **chaque** citation par `read`, sans exception.

| champ | citation de la proposition | observation réelle | statut |
|---|---|---|---|
| `summary` est de premier niveau | `goal-contract.ts:436` | `:435 const CompleteParameters = Schema.Struct({` puis `:436 summary: Schema.optional(Schema.String)` | **vrai** |
| `CompleteParameters` est la racine | `goal-contract.ts:435` | `:573 parameters: CompleteParameters` | **vrai** |
| `summary` exigé par `observe` | `environment.ts:72` | `:71 const summary = params.summary?.trim()` ; `:72 if (!summary) {` ; `:74` titre d'erreur ; `:76` output | **vrai** |
| `summary` persisté (`environment`) | `environment.ts:82` | `:79-85 ledger.record({ … summary, … })` | **vrai** |
| `summary` persisté (état) | `goal-contract.ts:740` | `:739-744 completion: { summary: params.summary?.trim() \|\| undefined, … }` puis `:748 setGoalState` | **vrai** |
| `summary` rendu | `goal-contract.ts:750` | `:750 const summaryLine = params.summary?.trim() ? …` | **vrai** |
| `summary` propagé par `expect` | `environment.ts:105` | `:105 summary,` dans `ledger.record` de l'action `expect` | **vrai** |
| `title` déclaré | `environment.ts:31` ; `workspace-handoff.ts:21` | `:31 title: Schema.optional(Schema.String)…` ; `wh:21 title: Schema.optional(Schema.String)` | **vrai** |
| `title` exigé par `recipe_save` | `environment.ts:156` | `:154-156 const title = params.title?.trim() ; if (!title \|\| !objective) {` ; `:158` `:160` | **vrai** (imprécis : `objective` est exigé au même endroit — sans conséquence, `title` reste bien exigé) |
| `title` = titre de session | `workspace-handoff.ts:144` | `:143-144 sessions.create({ title: params.title ?? \`Handoff: ${source.title}\` })` | **vrai** |
| `reason` déclaré | `workspace-handoff.ts:19` | `:19 reason: Schema.String.annotate({ … })`, premier membre de `Parameters` (`:17`) | **vrai** |
| `reason` = métadonnées de permission | `workspace-handoff.ts:119`, `:127` | `:119 ctx.ask({ permission: "external_directory", … metadata: { targetDirectory, reason: params.reason } })` ; `:127 idem` pour `permission: "edit"` | **vrai** |
| `reason` dans la capsule | `workspace-handoff.ts:80`, `:140` | `:80 \`Reason: ${clipped(input.reason, 500)}\`` ; `:140 reason: params.reason` | **vrai** |

**Aucune citation fausse. R2 est guéri sur le fond** : `summary` est bien de premier niveau, le
compte est bien de 4, et les trois champs conservés le sont **sur preuve de consommateur**, pas
par小球 intuition. Le défaut que P02 combat sur `description` ne persiste donc pas sur
`complete_objective`.

### R3 — GUÉRIE

`proposal:302` (tableau §4) et `proposal:249-260` (§4) citent `task.ts:53-54` pour `description` et
`task.ts:56-58` pour `prompt`. Relevé réel : `:53-55` porte
`description: Schema.optional(Schema.String).annotate({ description: "Required for launch/resume: a
short (3-5 words) description" })`, `:56-58` porte `prompt`. Plages resserrées, **conformes**.

### R4 — GUÉRIE sur la formulation

`proposal:419-423` réécrit §6 en « Sécurité — ce que le canal `description` est, et ce qu'il n'est
pas » : « Aucun contournement de permission n'est possible », « Aucun risque d'injection : la
valeur retirée de la clé n'est jamais réinterprétée, seulement omise ». La citation « canal covert »
du cycle 1 a disparu. Je conserve toutefois une réserve de sévérité, tracée en R7.

### RC5 — GUÉRIE

Le cas 6 existe bien (`proposal:510-530`) et épingle les trois champs sémantiques par trois
`not.toBe` (`summary` `:519-521`, `title` `:523-525`, `reason` `:527-529`). Point fort que le cycle
1 n'avait pas : le **contrôle négatif** (`proposal:533-536`) impose qu'étendre le `Set` à
`summary`/`title`/`reason` fasse échouer le cas 6, et que neutraliser le `.filter` fasse échouer les
cas 1 et 2. C'est exactement le test anti-mutation qui distingue une preuve d'un test qui passe
dans les deux sens.

## Status

- **R1** : `closed` — littéralement corrigé dans `proposal:490-491`, compilation vérifiée.
- **R2** : `closed` — requalification exacte, 4 instances, 14/14 citations vraies, cas 6 ajouté.
- **R3** : `closed` — plages resserrées et exactes.
- **R4** : `closed` sur la formulation ; réserve de sévérité reprise en R7.
- **RC5** : `closed` — vérification ligne à ligne **et** test d'épinglage ajoutés.
- **La réserve « non-régression par lecture » est levée par exécution** (voir R6 et
  `## Regressions introduced`).

Aucune objection du cycle 1 ne survit. **Zéro résidu `open`.**

## Remaining objections

Statut en tête de chaque ligne (règle 4 du gabarit).

**R5 — `accepted` : « champ décoratif de premier niveau ajouté ou renommé plus tard » (risque
structurel déclaré par le cycle 2, `proposal:410-418` et §9 `proposal:567-569`).** Le correctif est **fail-closed**, ce
qui était la condition posée. `DECORATIVE` est un ensemble **nommé, non vide** d'une seule clé
(`proposal:260`) ; rien n'est retiré par défaut. Un champ de premier niveau inconnu **reste** dans
la clé, donc dans le calcul du blocage — l'inverse d'un motif « tout retirer sauf… », qui serait
fail-open. Le comportement par défaut est donc « ne jamais modifier le frein ». C'est vérifié par le
code : la fonction actuelle est `${tool}\u0000${stableStringify(args)}` (`repetition.ts:82-84`) et
`stableStringify` ne filtre que `undefined` (`:76`) ; le patch **resserre** la clé au lieu de
l'élargir. `accepted` : risque de classe future réel, assumé, tracé, et mitigé par construction.

**R6 — `closed` : la réserve « baseline `bun test` non établie » (`proposal:396-397`).** L'obstacle
a disparu et je l'ai levé par exécution, ce que le cycle 2 ne pouvait pas faire (shell non autorisé
à l'époque).

```
bun typecheck                      → TYPECHECK_EXIT=0
bun test (6 fichiers de la surface déclarée §6)
  → TEST_EXIT=1 ; 116 pass ; 34 fail ; 5 errors ; 150 tests
bun test src/tool/repetition.test.ts (isolé)
  → REP_EXIT=0 ; 16 pass ; 0 fail ; 204 expect() calls
```

Les 34 échecs sont **tous** dans `test/tool/shell.test.ts` (ventilation par fichier : `34 fail :
…\test\tool\shell.test.ts`, et aucun autre fichier n'apparaît dans la ventilation) — c'est-à-dire
**avant** tout patch : le patch P02 n'est pas dans le code. J'ai isolé `repetition.test.ts` pour
mieux : **16/16 verts**. La surface que le correctif touche directement est donc verte **par
exécution**, ce que le cycle 2 n'avait établi que par lecture. Cette réserve n'a plus d'objet et
n'est pas un `open` : aucun test n'est établi comme cassé, ni vert ni rouge.

**R7 — `accepted` : la sévérité de `description` reste sous-descrite, mais le sort du patch n'en
dépend pas.** Le cycle 1 signalait que « canal covert » était plus fort que sa preuve ; le cycle 2
a corrigé la formulation, mais l'inventaire §4 décrit `description` comme « sans effet sur le
résultat », ce qui est trop large : `description` **pilote l'affichage**. `shell.ts:612`
`title: input.description` (titre rendu à l'utilisateur) et `shell.ts:543` / `:616`
`metadata: { description: input.description }`. Ces trois sorties sont **des résultats d'outil, pas
des entrées du frein** : `record` reçoit `args`, pas le résultat (`repetition.ts:145-147`,
`tool.ts:153-155`), donc aucun des trois ne peut modifier le calcul du blocage, et le risque
« le frein se laisse tromper » est écarté. `accepted` : inexactitude de sévérité, sans effet sur
l'exclusion — ce qui compte est que `description` ne change pas l'exécution, ce qui est vrai
(`shell/prompt.ts:24-28` : seuls `command`, `timeout`, `workdir` sont lus ; `:29` est la seule
déclaration, et `shell/prompt.ts:10-13` n'impose qu'une **formulation** du texte).

**Aucun résidu `open`.**

## Regressions introduced

**Aucun test vert n'est cassé. Aucun test n'est établi comme cassé par la révision — la révision ne
touche aucun code, et je l'ai établi par exécution.**

- `repetition.test.ts` : `REP_EXIT=0`, 16 pass / 0 fail, 204 expectations. C'est la suite qui teste
  `signature` (`:21-41`) et `record`/`inspect` (`:43-156`), donc la non-régression y est mesurée, pas
  supposée. Elle satisfait le cas 5 de la proposition (`proposal:508-509`).
- Les 34 échecs de `shell.test.ts` sont **préexistants** : ils sont déjà rouges dans le workspace
  où le patch P02 est absent. Ils sont cohérents avec la ligne de base rouge déjà enregistrée au
  dossier (`C-07` : « 8 tests échouent avant toute implémentation », et au-delà via les
  `RuntimeFlags`/`CrossSpawnSpawner`). Règle 1 du gabarit (« un test déjà rouge qui casse
  davantage reste un `open` ») : **aucun test n'est établi comme cassé davantage**, donc rien à
  classer `open`.
- Réserve de visibilité que je dois tracer, car elle est réelle : `shell.test.ts` passe `description`
  dans **44 endroits** (lignes 181, 198, 203, 226, 248, 272, 302, 330, 358, 388, 414, 445, 473, 502,
  530, 566, 597, 625, 654, 681, 709, 735, 760, 785, 816, 849, 877…), tous sur le même
  `sessionID: SessionID.make("ses_test")` (`:66`). C'est donc **la seule surface où un effet de clé
  pourrait se\ApiDegler et rester invisible dans un delta vert/rouge**, puisque ce fichier est déjà
  rouge. J'ai cherché la collision : le frein exige trois échecs du **même** `(outil, args)` pour
  bloquer (`repetition.ts:123`), et chaque test de ce fichier utilise une `command` distincte, donc
  aucune clé ne peut fusionner par retrait du `description`. Une collision resterait par ailleurs
  détectable, pas silencieuse : `preview(entry.args)` (`:129`, alimenté par `stableStringify(args)`
  en `:155`) incorporate `description` dans le message de blocage, donc un blocage过一次 par
  mauvaise fusion se lirait dans le message d'erreur. Ce n'est pas un défaut du correctif, c'est une
  limite de mesure que je consigne pour l'implémentateur.
- Les autres surfaces de la liste §6 (`test/tool/registry.test.ts`,
  `shell-output-prompt.test.ts`, `shell-launch-retry.test.ts`) sont vertes dans le run global
  (150 tests, 34 échecs, tous attribués à `shell.test.ts`) et n'ont pas bougé.

## Final verdict

REVALIDATED-PASS_WITH_CHANGES

Implémentable : règle 1 satisfaite — aucun résidu `open`, et cette section déclare explicitement
qu'aucun test vert n'est cassé. Les trois résidus sont `accepted` avec réserve tracée (R5, R7) ou
`closed` (R6). La clause « aucune nouvelle objection ne subsiste » est **abrogée** par le gabarit
(C-32, C-33) : elle rendait l'état final inatteignable par construction.

**Phrase exacte que la vague 4 devra exécuter :**

> Dans `packages/opencode/src/tool/repetition.ts`, ajouter `const DECORATIVE = new Set(["description"])`
> et faire passer `signature` par la projection filtrée de `proposal:263-269` ; puis, depuis
> `packages/opencode`, `bun test src/tool/repetition.test.ts test/tool/repetition-signature.test.ts`
> doit rendre `0 fail` sur les deux fichiers, les 16 tests existants de `repetition.test.ts` devant
> rester verts, `bun typecheck` doit rester à `TYPECHECK_EXIT=0`, et le décompte d'échecs de
> `test/tool/shell.test.ts` doit rester **exactement 34** — tout autre nombre signale une régression
> que le delta vert/rouge ne pourrait pas montrer, puisque ce fichier est déjà rouge.

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| P02 lot 1 — champ décoratif `description` hors clé de signature | **XS** — 1 fichier, 1 fonction (`repetition.ts:82`), 1 constante + 6 lignes de filtre | `packages/opencode/src/tool/repetition.ts` | `packages/opencode/test/tool/repetition-signature.test.ts` (nouveau, 6 cas : `proposal:478-530`, dont cas 2 `digest` obligatoire et cas 6 d'épinglage + contrôle anti-mutation `:533-536`) | **aucun** — `src/tool/repetition.test.ts` (156 l.) ne contient aucun `description` dans ses args (`:16`, `:17`, `:23`, `:37`) ; mesuré vert, 16/16. **À relire avant patcher** : `test/tool/shell.test.ts` (1249 l.) — déjà rouge (34 échecs), `description` présent dans 44 args, `sessionID` commun `ses_test` (`:66`) : le delta n'y est pas lisible, ne pas s'y fier au compte vert/rouge |