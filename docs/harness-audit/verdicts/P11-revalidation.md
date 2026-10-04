# P11 — revalidation

Révalidateur indépendant. Méthode : `read` uniquement, aucun shell, aucun `git`, aucune écriture sous
`packages/**`. Le marqueur de révision `> Révisé après verdict FAIL. Corrections appliquées : 7/7`
(proposition `:3`) n'a pas été pris en compte comme preuve (C-21) : chaque correction a été
re-vérifiée sur le code.

## Proposal

`P11` — « La barrière anti-clôture est inactive par défaut : `deliverable` vaut `undefined` sur le
chemin outils, et `out_of_scope` sans preuve la neutralise en un appel ».
`docs/harness-audit/proposals/P11-objective-type-gate.md`, révision de **364 lignes**.

Mécanisme proposé : **R1** (supprimer le paramètre `deliverable` de `blockingResidualFindings`, garde
inconditionnelle), **R2** (`goal-evidence.ts:41` rétrograde en `open` *tout* statut non-`open` privé
de preuve), **R3** (`deliverable` devient champ mort, hors périmètre).

**Statut d'origine — réconciliation.** La requête désigne `P11-verdict.md` comme `FAIL`. Le fichier
sur disque porte `PASS_WITH_CHANGES` (`verdicts/P11-verdict.md:23`). Les deux faits sont exacts et ne
se contredisent pas : le `FAIL` est le verdict **d'origine**, dont les 7 corrections sont listées en
tête de la proposition (`proposal:5-13`) ; `P11-verdict.md` est le verdict **sur la révision de 364
lignes**, et ses 3 objections (N1/N2/N3) et 4 `Required changes` (`P11-verdict.md:115-127`) sont
précisément l'objet de la présente revalidation. La chaîne est cohérente.

## Revisions applied

Vérification des 4 `Required changes` de `P11-verdict.md:115-127`, point par point.

| RC | Exigence | Traitée ? | Preuve |
|---|---|---|---|
| RC#1 (N1) | Corriger l'attribution du §6.4 : ne pas rattacher `proofIsSubstantive` ni le filtre `:723` au chemin *finding*, **ou** borner l'affirmation « non contournable » | **NON** | `proposal:269-275` (§6.4) reproduit la phrase fautive : *« il est traité par `proofIsSubstantive` (`:482-488`) et le filtre `:723` »*. Vérifié faux : `goal-contract.ts:692` est le seul branchement, `const weak = evidence.filter((item) => !proofIsSubstantive(item.proof))`, situé dans `if (dodItems.length > 0)` et appliqué à l'array DoD `{dod, proof}` (schéma `:440-448`). `finding.evidence` reste `Schema.optional(Schema.Array(Schema.String))` **sans validation** (`:458`). L'affirmation est identique à celle que le verdict avait déclarée non vérifiable. |
| RC#2 (N2) | Relibeller T4 : `goal-evidence.test.ts` existe et est vert ; T4 doit en être l'extension, 3 tests nommés | **NON** | `proposal:289` porte toujours `packages/opencode/src/session/goal-evidence.test.ts` **(nouveau)**. Le fichier existe : 28 lignes, `describe("sticky goal findings")` (`:9`) avec exactement les 3 tests que le verdict nomme — *« a narrower empty pass never erases an existing finding »* (`:10`), *« refuses to close without evidence and closes monotonically with evidence »* (`:14`), *« deduplicates retries and preserves first-seen ordering »* (`:22`). Une implémentation littérale de T4 **écrase 3 tests verts**. |
| RC#3 (N3) | Remplacer l'`INFERE` du §7.2 par les deux lignes de base mesurées | **NON** | `proposal:323-326` reproduit l'`INFERE` : *« l'état préexistant de `src/tool/goal-residual.test.ts` et de `src/session/goal-evidence.test.ts` n'est **pas** mesuré »*. La mesure existe désormais (verdict `:39`, `:111`) mais n'a pas été reprise. |
| RC#4 | Escalader §9.2 **et** consigner la décision dans `README.md:33` au merge | **PARTIEL** | L'escalade est présente (`proposal:348-359`, options A/B, recommandation). Mais la proposition **supprime l'obligation de consigner** : `proposal:10` affirme *« Aucune modification de matrice n'est demandée »*. Sur le chemin, l'affirmation est vraie — `README.md:33` porte bien `src/tool/goal-contract.ts:519` et `goal-contract.ts:519` est bien la première ligne du commentaire de `blockingResidualFindings` (vérifié). Sur la **décision A/B**, l'obligation de trace reste non satisfaite. |

**Score : 0 traitée, 1 partielle, 3 intactes.** Le point favorable et vérifié : la correction
**C-01 est respectée** — aucune citation de `src/session/goal-contract.ts` dans le document ; toutes
les citations `:NNN` sans préfixe pointent `packages/opencode/src/tool/goal-contract.ts`
(`proposal:24-25`).

## Status

**3 des 4 `Required changes` de la vague 2 ne sont pas traitées.** La révision porte sur les
corrections du verdict `FAIL` d'origine (7/7), pas sur celles du verdict le plus récent — elle
répond à une chaîne antérieure.

C-01 (chemin) : **respectée**. C-06 (`deliverable` optionnel, absent par défaut) : **respectée et
bien citée** — `goal-state.ts:29` `deliverable: Schema.optional(...)`, `:116-129` `inferDeliverable`,
`prompt.ts:2739` `existing?.deliverable ?? inferDeliverable(sourceText)` seul écrivain. La
proposition ne suppose jamais la présence du champ : R1 le supprime du prédicat. C-21 (marqueur non
fiable) : respectée par construction de la méthode.

Citations vérifiées ligne à ligne, toutes exactes : `:519-532` (E1, commentaire + signature +
`if (deliverable !== "implementation") return []`), `:452-459` (E8, `:455` les 4 statuts, `:458`
`evidence` non validée), `:450` (E11), `:624` « Completion refused: sticky findings remain OPEN. »
(E11, et la barrière C-01 `609-628`), `:626` (E10), `:643` (E11), `:656` (E6), `:671` (E5), `:709`
(E11), `:723` (E11), `:42-50` et `:52-60` dont `:55` « Replace DoD list when provided » (E4),
`:199-222` `nextGoalState` qui ne construit aucune clé `deliverable` (E4), `goal-evidence.ts:41`
(E9) et `:51-53`. La barrière `609-628` est bien celle de C-01 : `:609` filtre `status === "open"`,
`:610` `if (openFindings.length > 0)`, `:624` refus. **Le diagnostic de fond de P11 est juste et
bien prouvé.**

## Remaining objections

### O1 — RC#1 non traité : la non-contournabilité est toujours affirmée au-delà des preuves (bloquant, sécurité)

C'est l'objection que le verdict a déjà posée, recopiée sans changement. `proposal:272-275` attribue
au chemin *finding* un mécanisme qui ne s'y branche pas. La suite exacte prouvée par le code :

```ts
// goal-contract.ts:458 — finding.evidence : aucune contrainte
evidence: Schema.optional(Schema.Array(Schema.String)),
// goal-contract.ts:692 — unique branchement de proofIsSubstantive, sur le DoD
const weak = evidence.filter((item) => !proofIsSubstantive(item.proof))
```

Conséquence mesurable : après R1 **et** R2, un finding `out_of_scope` `critical` avec
`evidence: ["x"]` (une chaîne d'un caractère) franchit R2 (`incomingEvidence.length === 0` est
faux), échappe au filtre R1 (`:530` ne retient que `residual`), échappe à la barrière `609-628`
(`:609` ne compte que `open`) → la clôture passe. Le §6.4 affirme que ce cas est traité. Il ne
l'est pas. *Quoi changer :* soit appliquer `proofIsSubstantive` à `finding.evidence` dans
`goal-evidence.ts`, soit appliquer §5.2 (interdire `out_of_scope` sur `high`/`critical`), soit
réécrire §6.4 en bornant l'affirmation — « zéro sortie sans chaîne », pas « zéro sortie sans
artefact » (`proposal:194-196`).

### O2 — RC#2 non traité : T4 instructs a destructive overwrite (bloquant, intégrité du dépôt)

Voir le tableau `Revisions applied`. Le fichier existe et est vert ; il faut l'**étendre** et nommer
les 3 tests à préserver (`3 pass → 5 pass`). Instruction littérale = destruction de couverture.

### O3 — la suppression du cas `:37` laisse un `test()` vide qui passe (nouveau, moyen)

`goal-residual.test.ts:35-38` est le `test` *« never blocks audits, plans, answers or legacy
contracts »*, dont **l'unique assertion** est la ligne `:37`. `proposal:286` (T1) dit *« Le cas
`:37` est **supprimé** »* — mais T1 garde le `test` et pose pour critère *« `bun test` exit 0 sur ce
fichier »*. Un `test` sans assertion **passe**. Le fichier peut donc passer de 3 à 2 tests, laisser
un `test` creux qui rapporte vert, et satisfaire le critère : la suppression devient invisible.
*Quoi changer :* supprimer le `describe`/`test` `:35-38` entier, et poser le critère T1 sur le
**nombre de tests** (`3 → 2`, base mesurée), pas seulement sur l'exit code.

### O4 — décompte des appels falsifié (faible)

`proposal:255` et `proposal:286` annoncent *« 9 appels »* dans `goal-residual.test.ts:19-38`.
Comptage effectif des expressions `blockingResidualFindings(` : `:21`, `:22`, `:26`, `:27`, `:28`,
`:29`, `:31`, `:37` = **8**. Le `:37` cité comme cas distinct existe bien. Impact nul sur le patch,
mais c'est un chiffre que la proposition fait recopier au patcheur.

### O5 — `README.md:33` décrit encore une garantie que le patch ne porte pas (moyen, non traité)

RC#4 demandait de consigner la décision A/B. `README.md:33` décrit la barrière comme *« conditionnée
au type d'objectif **choisi par le modèle** »* — formulation que C-06 a précisément infirmée (le
champ est absent par défaut, pas choisi) et que R1 supprime. La proposition argumente que la
ligne est correcte ; elle l'est quant au **chemin**, pas quant à la **garantie**. Le verdict de vague
2 demandait une trace de décision au merge : elle reste absente du texte révisé.

### Mesures non vérifiables par `read` (signalées, non opposées)

Héritées du verdict et non rejouables sans shell : `86 pass / 8 fail` et les 4 snapshots
`parameters.test.ts`, et la base verte `goal-residual.test.ts` (5 tests / 15 `expect`). J'ai vérifié
la **plausibilité des causes** citées — `goal-contract.test.ts:62` `throw new Error(\`tool not
found: ${id}\`)`, appelé avec l'id fautif `create_objectif` en `:220` et `:265`, pour les tests
nommés en `:216` et `:261` ; le test `:243` utilise le bon id — mais ni les comptes ni les
noms de snapshots. Elles restent des **mesures héritées**, pas des preuves que je blesse.

## Regressions introduced

**Aucune régression de code introduite** : la proposition ne modifie rien, elle spécifie un patch.
Deux effets de spécification à retenir :

1. **Sur-blocage `audit`/`plan`/`answer` (assumé, `proposal:244-252`).** R1 supprime l'exemption que
   portent le commentaire `:519-523` (« Audits, plans and plain answers are unaffected — documenting
   a defect can be their result ») **et** le commentaire d'appel `:653-655` (« Audits may
   legitimately end with documented defects, so the rule is scoped to implementation »), que la
   proposition ne cite pas et qui devra aussi être réécrit. Le coût — un appel
   `out_of_scope` + preuve — est réel et l'agent a l'instruction correcte à l'écran (`:626`). Le
   taux réel n'est pas mesuré ; la proposition le marque `INFERE`, ce qui est honnête.
2. **Perte de couverture sur l'exemption.** `goal-residual.test.ts:35-38` est le **seul** test qui
   atteste que la garde n'a jamais bloqué un audit. R1 le supprime legitimately (le comportement
   disparaît), mais le patch doit le supprimer **explicitement** — voir O3.

Vérifié par ailleurs : la voie de contournement nommée dans la méthode (« un `finding` qui se déclare
`residual` pour forcer la clôture ») **est bien fermée**. Avant R1 : `residual` survit à `:41`,
n'est pas compté par `:609`, `:656` renvoie `[]` via `:528` → clôture. Après R1 : `:656`
`blockingResidualFindings(findings)` sans `deliverable`, le filtre `:529-531` retient le `residual`
`high`/`critical` → `:657` bloque. R2 ferme le même cas indépendamment (rétrogradation vers `open` →
`:610`). La seule brèche qui subsiste est `out_of_scope` + preuve creuse (O1), plus étroite
qu'avant.

## Final verdict

`REVALIDATED-FAIL`

Motif : le diagnostic de P11 est **juste et correctement prouvé** — j'ai relu chaque citation du
document et toutes sont exactes, chemin compris (C-01 respectée, C-06 respectée), et le correctif
R1+R2 ferme effectivement la voie d'évasion que la méthode demandait de tester. Le motif du `FAIL`
n'est donc **ni le fond ni l'exactitude des citations**, mais le fait que **3 des 4 `Required
changes` de la vague 2 sont intacts**, dont RC#1 qui est une **affirmation de sûreté fausse
recopiée verbatim** (O1, bloquant par la règle « toute affirmation non vérifiable → objection
bloquante »), et RC#2 qui, exécuté littéralement, **détruit 3 tests verts** (O2). La révision
« 7/7 » répond à une chaîne antérieure et n'a pas Absorbé le verdict le plus récent.

Sont requis avant revalidation : traiter RC#1 (bornage ou fermeture du chemin `out_of_scope` +
preuve creuse), relibeler T4 comme extension de `goal-evidence.test.ts` avec les 3 tests nommés,
remplacer l'`INFERE` du §7.2, et trancher O3 en supprimant le `test` `:35-38` entier avec un critère
de comptage.

## Arbitrage — effort L (décision du revalidateur, demandée explicitement)

**Refusé. Aucun lot `L` n'est autorisé pour P11 en vague 4.**

L'option (B) de `proposal:354-356` — DoD typé (`kind`/`polarity` par item) **plus** une autorité
d'écriture hors de la surface `edit_objective` — est refusée **sur le fond, pas sur le coût**, et la
preuve tient en trois citations :

- `goal-contract.ts:54-56` — `dod: Schema.optional(Schema.mutable(Schema.Array(Schema.String)))`,
  description *« Replace DoD list when provided »*. Remplacement **intégral**, sans fusion.
- `goal-contract.ts:208` + `:216` — `normalizeGoalList` ne fait que normaliser des chaînes ; le
  tableau écrit est celui que le modèle a fourni.
- `goal-contract.ts:199-222` — `nextGoalState` n'en valide pas le contenu.

Typer les items ne change rien à cette surface : le modèle remplace toujours le tableau entier, et le
classifieur lirait toujours une chaîne qu'il a écrite. La proposition le concède elle-même
(`proposal:220-221`) : il faudrait « une **autorité d'écriture** hors de la surface d'édition du
modèle ». C'est un **second plan de contrôle**, plus volumineux que R1+R2 réunis, qui laisse la
chaîne contrôlée par le modèle *dans* la décision — exactement ce que R1 élimine.

Le plafond que j'autorise est donc **`M`**, et `M` est déjà le contenu intégral de cette proposition :
« ne pas de couche d'analyse, ne pas de migration de schéma, ne pas d'historique à reconstruire »
(`proposal:334-337`) est confirmé par le code — le classifieur disparaît, `deliverable` n'a plus
d'entrée.

Conséquence d'ordonnancement : le trou résiduel de O1 **ne doit pas être renvoyé à un futur lot
`L`**. Il se ferme en `S`, par une ligne dans `goal-evidence.ts` appliquant `proofIsSubstantive`
aux `finding.evidence`, ou par §5.2 (interdire `out_of_scope` sur `high`/`critical`). C'est une
correction de la présente proposition, pas un lot suivant.

## Grille d'effort vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| **R2** — rétrograder tout statut non-`open` privé de preuve | `S` | `packages/opencode/src/session/goal-evidence.ts:41` | extension de `src/session/goal-evidence.test.ts` : finding **nouveau** `out_of_scope` `evidence: []` → `open` ; puis `evidence: ["src/tool/goal-contract.ts:455"]` → conservé. Base **3 pass → 5 pass** | **non** — ajout pur ; préserver les 3 tests de `describe("sticky goal findings")` (`:10`, `:14`, `:22`). **RC#2 à appliquer d'abord.** |
| **R1** — garde inconditionnelle, suppression du paramètre | `S` | `packages/opencode/src/tool/goal-contract.ts:519-532`, `:656`, `:671`, + commentaire `:653-655` | `goal-residual.test.ts` : `critical`/`high` `residual` → longueur 1 sans paramètre ; `out_of_scope` et `open` → 0 | **oui, obligatoirement** — `:37` casse la compilation. Réécrire les 7 appels survivants (`:21`, `:22`, `:26`, `:27`, `:28`, `:29`, `:31`) et **supprimer le `test` `:35-38` entier** (O3). Critère : exit 0 **et** 3 tests → 2 |
| **O1** — borner ou fermer `out_of_scope` + preuve creuse | `S` | `packages/opencode/src/session/goal-evidence.ts` (predicat sur `incomingEvidence`) | même fichier que R2 : `out_of_scope` + `evidence: ["x"]` → `open` | **non** si appliqué dans R2 ; **oui** si `proofIsSubstantive` est appliqué : `evidence: ["src/tool/goal-contract.ts:455"]` (18 car., chemin + n°) reste accepté, mais ajouter un cas `["voir §3 du rapport"]` à verrouiller |
| **E4** — preuve que le DoD ne commande plus rien (bout en bout) | `S` | `packages/opencode/test/tool/goal-contract.test.ts` | 2 `it.instance` **ajoutés** : refus sur `critical` `residual` puis `edit_objective({dod: ["Inventorier les constats et documenter l'état actuel"]})` puis nouvel échec ; et refus avec le DoD par défaut `MINIMAL_DOD_ITEM` (`goal-edit-parser.ts:1`). Gabarit : `:344-364`, qui plante l'état par `sessions.setGoalState({...} as any)` **sans champ `deliverable`** | **non** — ajout de blocs. Référence `parseResult` (`:45-54`) et `getTool` (`:56-64`) réutilisables. Ne pas toucher aux tests rouges `:216`/`:261` (`create_objectif`) |
| **RC#3** — remplacer l'`INFERE` §7.2 par les bases mesurées | `S` | `proposal:323-326` (doc) | aucun | aucun |
| **O5** — tracer la décision A/B et corriger la garantie de `README.md:33` | `S` | `docs/harness-audit/README.md:33` | aucun | aucun |
| **lot `L`** (DoD typé + autorité d'écriture hors `edit_objective`) | **refusé** | — | — | — |
