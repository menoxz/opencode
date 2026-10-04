# P11 — revalidation (cycle 3)

Révalidateur indépendant. Je n'ai rédigé ni la proposition, ni le verdict, ni la révision, et je
n'edite rien (C-36 : le revalidateur **constate, classe, n'édite jamais**). Méthode : `read` pour
toute existence de fichier, jamais `glob` (C-50) ; shell autorisé, tenté et réussi ; aucun `git` ;
aucune écriture sous `packages/**`. Une recherche restée vide n'a pas été comptée comme preuve : le
motif `^\*\*?C-34…` est tombé à zéro, motif que j'ai déclaré faux plutôt que fichier vide (C-66), et
j'ai relu `CORRECTIONS.md` par `grep` positif (`C-34:44`, `C-36:46`, `C-59:68`, `C-62:71`, `C-66:75`,
`C-107:165`).

Le marqueur `> Révisé cycle 2 … RC#1..RC#4 et O1..O3 traités` (`proposal:3`) n'est pas pris comme
preuve (C-21) : chaque point a été re-vérifié sur le code, ligne à ligne.

## Proposal

`P11` — « La barrière anti-clôture est inactive par défaut : `deliverable` vaut `undefined` sur le
chemin outils, et `out_of_scope` sans preuve la neutralise en un appel ».
`docs/harness-audit/proposals/P11-objective-type-gate.md`, **526 lignes** (364 au cycle précédent).

Mécanisme : **R1** garde inconditionnelle à un paramètre + **clause 2** qui rattrape `closed` à la
barrière, **R2** rétrogradation de tout statut non-`open` privé de preuve, **R3** preuve
*substantive* obligatoire sur `finding.evidence`, **R4** `deliverable` en champ mort documenté,
**R5** seuils d'effort falsifiables, **R6** trace de décision.

**Diagnostic de fond : juste, et toujours correctement prouvé.** Toutes les citations porteuses de
charge sont exactes, y compris celles que j'avais moi-même vérifiées au cycle précédent :

| citation | vérifié |
|---|---|
| `:609` `const openFindings = findings.filter((finding) => finding.status === "open")` puis `:610` `if (openFindings.length > 0)`, refus `:621-628`, message `:624` « Completion refused: sticky findings remain OPEN. », `:626` | **exacte** |
| `:482-483` `VAGUE_PROOF`, `:485-491` `proofIsSubstantive` (`value.length < 12`, `VAGUE_PROOF.test`, regex `/[\d]\|[\\/]\|https?:\|exit\|passed\|failed\|\bcode\b\|\bscore\b\|\btest/i`) | **exacte** |
| `:691-694` unique branchement, dans `if (dodItems.length > 0)`, appliqué à `evidence.filter((item) => !proofIsSubstantive(item.proof))` | **exacte** |
| `:723` « Completion refused: the DoD is not backed by verifiable evidence. » et `:725` « Proof is an assertion, not an artifact, for: … » | **exactes** |
| `:54-56` `dod: Schema.optional(Schema.mutable(Schema.Array(Schema.String)))`, description « Replace DoD list when provided » | **exacte** |
| `goal-evidence.ts:41` `item.status === "closed" && incomingEvidence.length === 0`, `:51` et `:52` les deux branches à `incomingEvidence.length > 0` | **exactes** |
| `goal-residual.test.ts` : 8 appels `blockingResidualFindings(` en `:21`, `:22`, `:26`, `:27`, `:28`, `:29`, `:31`, `:37` | **exacte** |
| `README.md:33` « barrière anti-clôture conditionnée au type d'objectif choisi par le modèle » | **exacte** |

Aucune citation fausse : aucune objection de ce chef.

## Revisions applied

Les 4 `Required changes` de la vague 2 (`P11-revalidation.md:29-34`), point par point.

| RC | Exigence | Traité ? | Ligne qui le prouve |
|---|---|---|---|
| **RC#1** / O1 | borner **ou fermer** `out_of_scope` + preuve creuse | **OUI — par fermeture** | `proposal:306-343` (R3) : `goal-evidence.ts:41` et `:52` passent de `incomingEvidence.length === 0` à `!incomingEvidence.some(proofIsSubstantive)`, le prédicat étant **déplacé** de `goal-contract.ts:485-491` vers `goal-evidence.ts` pour éviter le cycle (`:312-315`). La clause 2 de R1 (`:256-264`) rattrape `closed` à la barrière. Et surtout **l'affirmation fausse a disparu** : E7 (`:127-152`) énonce désormais que le branchement unique est `:691-694` sur `evidence: [{ dod, proof }]` — ce que j'ai revérifié — et §6.4 (`:425-428`) attribue chaque porte au bon mécanisme. Le cycle 2 traitait RC#1 par reformulation ; le cycle 3 le traite par code. |
| **RC#2** / O2 | T4 = **extension** de `goal-evidence.test.ts`, 3 tests nommés | **OUI** | `proposal:448` : « **extension d'un fichier existant de 28 lignes**, pas un fichier nouveau », nomme `describe("sticky goal findings")` `:9` et les 3 tests `:10-12`, `:14-20`, `:22-27`, critère **`3 pass → 5 pass`**, plus l'exigence que « les 3 tests préexistants sont inchangés ». J'ai relu le fichier : 28 lignes, `describe` `:9`, tests `:10`/`:14`/`:22` — la base annoncée est la base réelle. |
| **RC#3** | remplacer l'`INFERE` du §7.2 par les deux bases mesurées | **OUI** | `proposal:453-467` : « aucun `INFERE` ne subsiste ici », avec `exit 0, 5 tests, 15 expect() calls, 0 fail` et « 3 tests verts ». **Re-mesuré par moi** (voir `Regressions introduced`) : conforme au chiffre près. |
| **RC#4** | escalader §9.2 **et** consigner la décision dans `README.md:33` | **OUI** | R6 (`:360-366`) fournit le texte de remplacement littéral (« barrière anti-clôture inconditionnelle sur les findings `high`/`critical` ; `out_of_scope` et `closed` exigent une preuve re-observable ») ; l'arbitrage A-2 est rendu en §4/§5.1/§8 ; `proposal:516` renvoie au merge. `README.md:33` porte bien la chaîne citée. |

**Score : 4 traitées sur 4.** Les 3 résidus de cycle 2 (`O3`, `O4`, `O5`) sont eux aussi traités :
`O3` — `proposal:445` impose de supprimer le `test` `:35-38` **entier**, « pas seulement son assertion
`:37` », avec critère de **comptage** `3 tests → 2 tests` ; j'ai vérifié que `:35-38` est bien le test
dont `:37` est l'unique assertion. `O4` — `proposal:409` et `:20` comptent désormais **8** appels et
énumèrent les 8 lignes, 7 survivants ; mon comptage indépendant donne 8. `O5` — traité par R6.

**Preuve que le patch proposé préserve les tests verts.** J'ai recalculé chaque assertion survivante
de `goal-residual.test.ts` contre la règle R1+R2+R3 et le prédicat réel `:485-491` :
`residual` `critical`/`high` → 1 (`:21`, `:22`) · `medium`/`low` → 0 (`:26`, `:27`) · `open` avec
`["probe exit 1"]` → 0, la clause 2 excluant `status === "open"` (`:28`) · `closed` avec
`["probe exit 1"]` → 0, `probe exit 1` faisant 12 caractères et contenant `exit` (`:29`) ·
`out_of_scope` `critical` avec `["probe exit 1"]` → 0 (`:31`). **Les 7 assertions survivent
inchangées.** J'ai de même recalculé les 5 critères de T3 et les 4 branches de T4 : tous exacts.

Et la justification mesurée de R3 est **juste** : « independent re-audit ses_b PASS »
(`goal-evidence.test.ts:17`) fait 31 caractères, ne matche ni `VAGUE_PROOF` (ancré `^…$`), ni la
regex finale — `PASS` n'est pas `passed`, et il n'y a ni chiffre, ni `/`, ni `exit`, ni `code`/
`score`/`test`. Étendre R3 à `:51` casserait donc bien `:14-20`, et la borne de R3 est une contrainte
mesurée, pas une préférence.

## Status

**Les 4 `Required changes` sont traités, avec preuve dans le texte. Aucun n'est seulement cité.**

Décision A-2 — **plafond `M`, respecté, et aucun schéma dédié réintroduit.** La proposition
rejette l'option typée **sur le fond** (§5.1, `proposal:370-375`) en citant `:54-56` — que j'ai revérifié
mot pour mot — `:211-221`, et le refus du lot `L` (`P11-revalidation.md:167-195`). Elle ne touche pas
au schéma `dod` : aucun `kind`, aucun `polarity`, aucune autorité d'écriture hors `edit_objective`.
`R4` (`:345-348`) ne laisse que `deliverable` en champ mort documenté en §6.5, ce qui ne réintroduit
rien. §8 (`:486-502`) porte le label `M` **assorti de seuils chiffrés falsifiables**, et `:525` classe
le lot `L` en `refused`. Conformément à C-34 puis C-59, la décision opératrice « plafond `M`, pas de
schéma dédié » est bien celle que le document applique.

Trou résiduel O1 — **il se ferme en `S`, comme la décision A-2 révisée l'affirme.** R3 est deux
lignes de prédicat plus un déplacement (`:306-327`), et sa justification est bornée par une contrainte
de test existant. Aucun renvoi à un lot futur : c'est exactement ce que la décision A-2 révisée
exigeait, et c'est fait dans cette proposition, pas dans un lot `L` suivant.

## Remaining objections

Statut en tête de chaque ligne (C-107). Rappel C-107 : une objection sans statut explicite vaut
`open`, et `PASS_WITH_CHANGES` seul ne dit rien de l'implémentabilité.

### O1 — `open` (moyen) — le seuil « ≤ 6 expressions de production » contredit son propre dénombrement

`proposal:494` fixe le seuil à « **≤ 6** sur **≤ 3** fichiers » puis, dans la colonne « base mesurée »
du même tableau, énumère **9** sites : R1 `:528` + signature + `:656` + `:671` + commentaire
`:653-655` (5), R2 `:41` (1), R3 `:41` + `:52` + déplacement `:482-491` (3). Dédupliqué — R2 et R3
éditent **la même** ligne `goal-evidence.ts:41` — cela fait 8 sites distincts, dont 6 seulement si
l'on exclut la signature et le commentaire. Le nombre est donc **vague, pas faux** : il est correct
sous la convention « expressions de production = lignes de corps, signature et commentaire exclus,
`:41` comptée une fois », et faux sous toute autre lecture. Or A-2 exige un seuil *falsifiable* : un
critère dont la convention de comptage n'est pas écrite n'est pas opposable au patcheur.
*Quoi changer :* écrire la convention dans la cellule — « on compte les lignes de corps, la
signature et le commentaire sont exclus, `goal-evidence.ts:41` n'est comptée qu'une fois » — et aligner
le chiffre dessus (6 ou 8).

### O2 — `open` (moyen) — la divergence `closed` entre `mergeGoalFindings` et la barrière n'est pas tranchée

`proposal:508-514` et `:522` la reconnaissent et la renvoient explicitement à mon arbitrage
(« le validateur doit trancher si cette dette doit être soldée dans P11 ou portée comme dette
assumée »). Elle est réelle : après le patch, `goal-evidence.ts:51` accepte toujours `closed` avec
une preuve creuse, `goal-contract.ts:620` persiste cet état via `setGoalState`, et `:657` refuse
pourtant la clôture. L'agent relit donc `closed` dans son état, renvoie la même preuve, se heurte au
même refus — la dette est un **potentiel de boucle**, pas une simple divergence de lecture.
**Le statut `residual` employé en `:522` et `:523` ne fait pas partie des quatre statuts admis**
(`open` / `out_of_scope` / `accepted` / `refused`) : selon C-107, ces deux lignes valent `open`
jusqu'à reclassification. *Quoi changer :* soit étendre R3 à `:51` en réécrivant la preuve de
`goal-evidence.test.ts:17` en une preuve re-observable — un code de sortie suffit, le test reste
vert — soit reclasser `accepted` en assumant la divergence, sur trace écrite au merge. Je ne tranche
pas à la place de l'opérateur : le choix engage la surface de test.

### O3 — `out_of_scope` (faible) — le taux de sur-blocage `audit`/`plan`/`answer` reste non mesuré

`proposal:397-405` et `:523`. Non mesurable sans shell sur un corpus de sessions ; la proposition pose
un seuil d'alerte chiffré (> 30 % des clôtures d'audit). Hors périmètre d'une revalidation, et
l'effet est **assumé et documenté** avec une mitigation réelle. Classification `out_of_scope`
légitime.

### O4 — `accepted` (faible) — les bases rouges héritées ne sont pas rejouées

`proposal:469-484` et `:526`. `86 pass / 8 fail`, `snapshots: 12 passed, 4 failed`, les 4 snapshots
`parameters.test.ts` et la base de `goal-contract.test.ts` viennent du validateur de vague 2 et ne
sont pas rejouables ici : `test/tool/goal-contract.test.ts:1-18` importe `@/tool/registry`,
`@/agent/agent`, `@/session/session` et `@/background/job`, donc la chaîne de `src/tool/shell.ts`,
que C-62 m'interdit d'exercer. J'ai en revanche **re-mesuré** les deux bases qui, elles, ne chargent
pas `shell.ts`, et elles sont exactes. Réserve tracée → `accepted`.

## Regressions introduced

**Aucun test vert n'est cassé, et aucune régression n'est introduite :** la proposition ne modifie
aucun fichier, elle spécifie un patch. Distinction demandée, préexistant contre introduit.

### Mesures réelles de cette revalidation

| mesure | commande | exit code | résultat |
|---|---|---|---|
| typecheck, **1er passage** | `bun typecheck` (`packages/opencode`) | **`TYPECHECK_EXIT=2`** | 2 erreurs, toutes deux dans `src/tool/shell.ts` : `shell.ts(699,24): error TS2339: Property 'length' does not exist on type 'Preview'` et `shell.ts(703,34)`, même signature. Bun `1.4.2`. **Cause étrangère à P11** : fichier en cours d'édition par un agent concurrent. **Zéro erreur dans les quatre fichiers que P11 modifie.** |
| typecheck, **2e passage** | `bun typecheck` | **`TYPECHECK_EXIT=0`** | **aucune erreur**, bun `1.4.2`. Le `shell.ts` concurrent a été remis entre les deux passages. |
| les 2 fichiers de test que P11 touche | `bun test ./src/tool/goal-residual.test.ts ./src/session/goal-evidence.test.ts` | **`TEST_EXIT=0`** | **`8 pass`, `0 fail`, `22 expect() calls`, `Ran 8 tests across 2 files` (1.84 s)** |

Les deux erreurs du premier passage **ne sont pas miennes et ne sont pas imputables à P11** ; je les
**signale et ne les corrige pas** (C-62), et le second passage confirme `TYPECHECK_EXIT=0`. Je n'ai
lancé aucun test qui exercise `shell.ts`, et je n'ai touché ni `git`, ni `packages/**`.

**Décompte des bases de §7.2 — confirmé, et repeigné par moi.** Mon run donne 8 tests et 22
`expect()` sur les deux fichiers. `goal-evidence.test.ts` compte 7 assertions à `:11`, `:16`, `:18`,
`:19`, `:24`, `:25`, `:26` et 3 tests ; par différence, `goal-residual.test.ts` compte bien
**5 tests / 15 `expect()`**, avec **0 fail**, exactement comme l'annonce `proposal:462-463`. Les deux
bases du §7.2 sont donc **réelles**, ce qui ferme la réserve de RC#3 par la mesure et non par la
citation.

### Préesistant — base rouge, non causée par P11 et non rejouée sous C-62

- `test/tool/goal-contract.test.ts` : **non exécuté**, pour la raison d'import exposée plus haut. La
  base « verte » fournie dans l'état de mesure est reprise comme héritée, pas rejouée.
- Les 2 tests rouges de ce fichier (`tool not found: create_objectif` / `edit_objectif`) sont
  plausibles et indépendants de P11 : `test/tool/goal-contract.test.ts:62` lève bien
  `throw new Error(\`tool not found: ${id}\`)`. Je n'ai pas relu `:216`/`:261`, donc je ne confirme
  **ni** les comptes **ni** les noms — mesure héritée, pas preuve.
- `test/tool/parameters.test.ts` : 4 snapshots dus au champ Lean `causedBy`, cause étrangère à P11.
- `src/session/compaction.ts` : modifié par P06, sans rapport avec P11, aucun effet ici.

### Introduit — aucun

| point | statut |
|---|---|
| R1 / R2 / R3 / R4 | spécifiés seulement, aucun fichier modifié → **0 régression** |
| `goal-residual.test.ts` | T1 exige la réécriture des 7 appels survivants **et** la suppression du `test` `:35-38` ; j'ai recalculé les 7 assertions survivantes : aucune ne change (voir `Revisions applied`) → **aucun vert cassé, aucun `test` creux** |
| `goal-evidence.test.ts` | T4 exige l'extension sans toucher `:10-27` → **ajout pur**, les 3 tests préservés |
| sur-blocage `audit`/`plan`/`answer` | effet de spécification **assumé** (§6.1) : la garde perd l'exemption des commentaires `:519-523` et `:653-655`. Le taux n'est pas mesuré (O3) |
| dette de symétrie `closed` | voir O2, `open` |

La voie de contournement testée au cycle 2 (« un `finding` qui se déclare `residual` ») reste fermée :
R1 clause 1 la ferme à la barrière sans lire `deliverable`, R2 la ferme indépendamment à
`goal-evidence.ts:41`. Le mécanisme de R3 est **le même** que celui que j'avais refusé en cycle 2, mais
cette fois il est **branché sur `finding.evidence`**, ce que le code confirme.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

**Les 4 `Required changes` sont traités — 4 sur 4, avec la ligne qui prouve chacun.** C'est le
progrès décisif : le cycle 2 en laissait 3 intacts, dont RC#1 (affirmation de sûreté fausse recopiée
verbatim) et RC#2 (une instruction destructive qui aurait écrasé 3 tests verts). RC#1 est désormais
traité **par fermeture** — R3 branche `proofIsSubstantive` sur `finding.evidence`, et l'attribution
fausse du §6.4 a disparu ; RC#2 est traité par une extension qui nomme et préserve les 3 tests.

Le `FAIL` précédent est donc levé. Je n'écris pas `REVALIDATED-PASS` : deux défauts trouvés **dans**
la proposition subsistent et sont classés `open` (O1, O2). Ils ne sont pas des `Required changes`
intacts, donc ils ne justifient pas un `FAIL`.

**Implémentabilité : non.** Règle 1 du gabarit : `PASS_WITH_CHANGES` n'est implémentable que si aucun
résidu n'est `open`. O1 et O2 en sont deux. Les classer `accepted` pour débloquer est explicitement
interdit tant que la levée n'est pas tracée par l'agent de révision.

## Handed back to

| résidu | statut | remède en une ligne | destinataire |
|---|---|---|---|
| O1 — seuil « ≤ 6 » vs 9 sites énumérés | **`open`** | écrire la convention de comptage dans `proposal:494` et aligner le chiffre dessus | agent de révision P11 |
| O2 — divergence `closed` non tranchée, statut `residual` hors vocabulaire | **`open`** | étendre R3 à `goal-evidence.ts:51` en réécrivant la preuve de `goal-evidence.test.ts:17`, ou reclasser `accepted` sur trace au merge | opérateur (arbitrage de surface de test), puis agent de révision |
| O3 — taux de sur-blocage non mesuré | `out_of_scope` | — | — |
| O4 — bases rouges héritées non rejouées | `accepted` | — | — |

Je n'édite ni la proposition ni le code (C-36) : la levée de ces deux `open` appartient à l'agent de
révision du cycle suivant.

## Grille d'effort vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| **R2** — tout statut non-`open` privé de preuve → `open` | `S` | `packages/opencode/src/session/goal-evidence.ts:41` | inclus dans T4 (base `3 pass → 5 pass`) | **non** — ajout pur |
| **R3** — preuve *substantive* sur `finding.evidence` (ferme O1/RC#1) | `S` | `goal-evidence.ts:41`, `:52`, + déplacement depuis `goal-contract.ts:482-491` | T4 (a), (b) et les 2 transitions | **non** si borné à `:41`/`:52` ; **oui** si étendu à `:51` (casserait `goal-evidence.test.ts:14-20`) — cf. O2 |
| **R1** clause 1 — garde inconditionnelle, suppression du paramètre | `S` | `goal-contract.ts:519-532`, `:656`, `:671`, commentaire `:653-655` | T1, T2 | **oui, obligatoirement** — `:37` ne compile plus ; réécrire `:21`, `:22`, `:26`, `:27`, `:28`, `:29`, `:31` et supprimer le `test` `:35-38` entier. Critère : `exit 0` **ET** `3 → 2 tests` |
| **R1** clause 2 — `closed` à preuve creuse retenu à la barrière | `S` | `goal-contract.ts:256-264` (dans R1) | T3 (5 longueurs) | **non** — j'ai recalculé `:28`/`:29`/`:31`, inchangés |
| **T5/T6** — non-contournabilité bout en bout | `S` | `packages/opencode/test/tool/goal-contract.test.ts` | 2 scénarios : réécriture du DoD, et DoD par défaut `MINIMAL_DOD_ITEM` | **non** si ajout de blocs ; **fichier rouge par ailleurs** (`tool not found: create_objectif`), ne pas y toucher |
| **T7** (RC#1) — `out_of_scope` `critical` + `evidence: ["x"]` → refus | `S` | `test/tool/goal-contract.test.ts` | 1 scénario | **non** |
| **O1** — convention de comptage du seuil d'effort | `S` | `proposal:494` (doc) | aucun | aucun |
| **O2** — trancher la dette `closed` | `S` | `goal-evidence.ts:51` **ou** `goal-evidence.test.ts:17` | aucun si portage ; réécriture de la preuve si extinction | **oui** si extinction : c'est ce choix qui décide du sort de `goal-evidence.test.ts:14-20` |
| **R4** — `deliverable` en champ mort | `out_of_scope` | `goal-state.ts:29`, `:122-129` | aucun | aucun |
| **lot `L`** (DoD typé + autorité d'écriture hors `edit_objective`) | **`refused`** | — | — | — |