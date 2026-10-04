# P10 — Revalidation (indépendante) de la proposition révisée

Révalidateur indépendant. Ni la proposition initiale, ni son verdict, ni la révision n'ont été
rédigés par moi ; ce rapport ne modifie pas la proposition.

Sources lues, dans l'ordre imposé : `verdicts/P10-revalidation.md` (revalidation antérieure),
`proposals/P10-token-estimation.md` (**777 lignes**, version validée ici),
`CORRECTIONS.md` (C-36, C-62, C-66, C-107).

## Proposal

`docs/harness-audit/proposals/P10-token-estimation.md`, 777 lignes. Self-assessment `READY` (§9),
§9.1 déclare RC1/RC2/RC3/RC4 **appliqué**, §9.1 (`:699-704`) déclare N1 **résolue par le correctif**
et N2 **résolu**.

Corrections auditées (C-36, C-62, C-66, C-107) : C-62 appliquée — les deux erreurs de typecheck sont
dans `src/tool/shell.ts`, fichier qu'un autre agent édite ; signalées, **non corrigées**. C-66
appliquée — chaque recherche a été rejouée jusqu'à obtenir un résultat **positif** (les `^#+ *C-`
d'abord négatif, puis `C-36`/`C-62`/`C-66`/`C-107` : 4 hits positifs). C-50 appliquée — existence
vérifiée par `read`, jamais par `glob`. C-107 appliquée — chaque objection porte son statut en tête
de ligne dans `## Remaining objections`.

## Revisions applied

| # | Required change (revalidation antérieure) | Statut après réexamen | Preuve |
|---|---|---|---|
| RC1 | Re-scaler la preuve du point (a) | **RÉSOLU** | `isDense` : **0 occurrence** dans `src/session/` (grep `isDense\|CHARS_PER_TOKEN` → 2 hits, les deux `CHARS_PER_TOKEN` à `overflow.ts:11` et `:63`). `CHARS_PER_TOKEN = 4` intact. Le ratio 2,8 est confiné à §9.3, `out_of_scope` avec condition de réactivation (`:733-752`) |
| RC2 | Couvrir la zone médiane de la rampe | **RÉSOLU** | R6.2 (`:504-510`) chiffre `23 000 → 572 088`, `30 000 → 551 760` (+18,75 %), `59 999 → 464 642`. Recalculé à partir de `overflow.ts:102` (`proportional = Math.floor(usable × threshold)`) et de la formule `:256-258` : les **trois** valeurs sont exactes, y compris l'inversion de 2 tokens à 59 999 |
| RC3 | Corriger R6.1 et couvrir la frontière | **PARTIEL** | R6.1 est désormais **vrai** (`:457` admet `:32` et `:44` rouges) et T7.6 (`:639-653`) reverrouille les deux prédicats. Mais la couverture de frontière est incomplète : `test/session/overflow.test.ts:113` est sur la **même** frontière (`inspected = 1 000`, ramp 0), la proposition affirme qu'il ne change pas (`:516-518`) et il change ; et l'assertion `value === 551_760` de T7.3 est inatteignable. Voir R1 et R2 |
| RC4 | Énumérer la ligne 1851 et clore F1 | **RÉSOLU** | Les 10 occurrences sont énumérées (`:695`) et le grep les confirme **une à une** au bon numéro : `compaction.test.ts` `533, 534, 1239, 1265, 1290, 1327, 1378, 1772, 1816, 1851`. Le renvoi au mécanisme de protection (`compaction.ts:201`) est, lui, périmé — traité séparément en R3, il ne diminue pas l'accomplissement de RC4 |

Les deux `open` de la revalidation antérieure :

- **N1 → `accepted`.** L'objection était : « R6.1 affirme à tort que `:32` et `:44` survivent ».
  La révision **retire cette affirmation** et la remplace par un tableau ligne à ligne (`:457` :
  `| :32 | … | true | false | rouge, causée par le correctif |`). Le défaut *nommé* par N1 n'existe
  plus dans le texte. Ce qui subsiste n'est pas un défaut de la proposition mais un **choix assumé** :
  deux tests verts sont réécrits, au même titre que A5.8 (`:437-445`) refuse l'alternative de les
  réécrire pour préserver `ramp > 0`. Statut `accepted` au sens du gabarit (traité quant au fond,
  réserve assumée et tracée). **N1 n'est pas pour autant soldé par un non-casse** : voir
  `## Regressions introduced`.
- **N2 → `accepted`.** Le remède est adopté et chiffré : T7.2/T7.4 lisent le budget via
  `import { preserveRecentBudget } from "@/session/compaction"` (`:582`), et non plus via un
  `Compaction.select` inexistant. Vérifié sur l'arbre actuel : `compaction.ts` expose 17 exports
  (`:34, 43, 44, 104, 217, 233, 362, 386, 392, 404, 429, 444, 473, 475, 477, 1067, 1082`) et
  `preserveRecentBudget` **n'en fait pas partie** : c'est un `function` de niveau module à `:304`.
  Le coût est d'un mot-clé `export`, déclaré `XS` au §8 (`:680-681`). Le périmètre n'est donc pas
  contredit. Résolu quant au fond. (La justification écrite de `:702-703` est, elle, fausse — R3.)

## Status

`READY` auto-déclaré (§9) **non tenu** : une des assertions que la proposition verrouille elle-même
(T7.3) est inatteignable sous sa propre formule, et un test vert non cité casse en silence.

| Objet | Statut |
|---|---|
| N1 (2 assertions vertes réécrites) | `accepted` — plus une régression verte **non** déclarée (R1) |
| N2 (`preserveRecentBudget` non exporté) | `accepted` — remède adopté, coût `XS` tranché |
| RC1 / RC2 / RC4 | `RÉSOLU` |
| RC3 | `PARTIEL` |
| R1 — `test/session/overflow.test.ts:113` casse | **`open`** (haute) |
| R2 — T7.3 `value === 551_760` inatteignable | **`open`** (haute) |
| R3 — citations `compaction.ts` fausses | **`open`** (moyenne) |
| `READ_HEAVY_RAMP_SPAN` | `out_of_scope` (`:706-731`, justification en trois temps + condition de réactivation vérifiable) |
| Ratio 2,8 | `out_of_scope` (`:733-752`, trois motifs cumulatifs + condition de réactivation) |
| Seuil de coût | `out_of_scope` / documenté — voir `## Remaining objections`, R4 |

## Remaining objections

- **`open`** — **R1 (haute)** — `test/session/overflow.test.ts:113` passe au rouge, et la proposition
  affirme l'inverse. `:516-518` : « `inspected = 1 000` la rampe vaut 0, l'arme vaut `proportional`,
  et `Math.min(proportional, absolute, proportional) = Math.min(proportional, absolute)`, donc **les
  lignes 113 et 115 ne voient aucun changement** ». Le calcul de la proposition se réfute
  lui-même : si `early` vaut `proportional`, il vaut `580 800`, pas `464 640`.
  Chaîne complète : `overflow.ts:102` fait `proportional = Math.floor(usable × threshold)`, donc
  **`proportional` est déjà un entier** ; `overflow.ts:108` donne l'assertion verte
  `464_640 = floor(580 800 × 0,8)` ; la formule §4(c) `:256-258` donne à ramp 0
  `early = floor(proportional × (0,8 + 0,2 × 1)) = floor(proportional) = proportional = 580 800`.
  `proportional = 580 800` est confirmé par `:115`, qui reste vert (`value = min(proportional, absolute)`,
  `absolute` valant `proportional` par défaut, `:103`). **La ligne 115 est bien inchangée ; la ligne 113
  passe de `464 640` à `580 800`.** Aucun test de la proposition (T7.1 à T7.6) ne réécrit `:113` :
  T7.3 ajoute un test à côté, T7.5 garde le commentaire économique, T7.6 réécrit le bloc
  `isReadHeavy`. **Remède :** corriger l'assertion `:113` en `expect(trigger.early).toBe(580_800)` et
  remplacer `:516-518` par la mention du changement.
- **`open`** — **R2 (haute)** — T7.3 asserte une valeur que la formule du §4(c) rend inatteignable.
  `:609` : `expect(trigger.value).toBe(551_760)`. À `inspected: 30_000`, ramp `= 0,25`, donc
  `early = floor(580 800 × (0,8 + 0,2 × 0,75)) = floor(551 760) = 551 760` ✓ (`:607` est correct), mais
  `readHeavy = early !== undefined && ramp >= 1` est **faux** (`:259`), donc `arm = undefined`
  (`:260`), donc `value = Math.min(proportional, absolute) = 580 800` (`:114`) — **pas** `551_760`.
  Le test est contradictoire avec lui-même : il exige `readHeavy === false` (`:608`) **et**
  `value === 551_760`, alors que ce `false` est précisément ce qui produit `580 800`. Le verrou que
  RC3 (`:694`) revendique (« T7.3 asserte `early` **et** `value === 551 760` ») ne peut pas fermer.
  **Remède :** passer `expect(trigger.value).toBe(580_800)` et verrouiller `early === 551_760` seul,
  ou armer `value` via une formule qui garde `arm` actif sur la zone médiane.
- **`open`** — **R3 (moyenne)** — les citations `compaction.ts` sont fausses dans l'arbre actuel.
  `:702-703` écrit « `compaction.ts:416` est un `const` local à portée de fonction » : `:416` est
  `result: renderPruneResult(part),` à l'intérieur d'un `map` ; le `const` local à portée de fonction
  est `const select` à **`:521`**. `preserveRecentBudget` est un `function` de niveau module à **`:304`**,
  pas à `:199-206`. `:413` (`Token.estimate`) est aujourd'hui `:518`. `:424` (l'appelant) est aujourd'hui
  `:529`, et `:424` est aujourd'hui un commentaire JSDoc. `:21` (l'import) est aujourd'hui `:22`. Le
  mécanisme de protection cité pour RC4 (`compaction.ts:201`) est aujourd'hui `firstSeenAt: index,` ;
  la vraie garde est le retour anticipé de `preserveRecentBudget` à `:306`. Ces dérives viennent des
  ajouts de P06 dans `compaction.ts` (déjà commités, **pas** un changement de P10) : la proposition
  n'a pas été rafraîchie. **Remède :** réaligner `:21→:22`, `:199-206→:304-310`, `:413→:518`,
  `:416→:521`, `:424→:529`.
- **`out_of_scope`** — **R4 (info)** — le **seuil de coût** annoncé. Question tranchée : il **ne**
  repose pas sur un `INFERE` servant un argument d'impact, donc ce n'est pas un `open`. Le seul
  matériel de coût est la citation `:142` (`// context. Roughly 2.50 $ at a 256k context, against
  ~0.06 $/turn saved by`), qui est du **code existant cité** (`overflow.ts:15-20`), et non une
  affirmation de P10 ; `:376` s'en sert pour **rejeter** une variante ; R6.4 (`:536`) affirme
  « aucun coût de tokens ajouté » ; §9.2 (`:711-716`) déclare explicitement qu'aucune courbe de coût
  n'existe et qu'aucune mesure ne peut être produite ici. Il ne borne donc qu'un gain et ne sert
  aucun argument d'impact. Classification : `out_of_scope`, avec la condition de réactivation de
  `:727-731` déjà écrite. Aucun `INFERE` du dossier (6 occurrences : `:165, 338, 368, 433, 504, 564`)
  n'est un seuil de coût.
- **`refused`** — **R5 (info)** — aucune objection. Signalé pour être complet : la piste «
  `test/session/overflow.test.ts` (117 lignes, sans `describe("isReadHeavy")`) » que j'ai suivie
  avant de corriger est un **fichier distinct** de `src/session/overflow.test.ts` (54 lignes). Les
  deux existent ; les citations de R6.1 visent le bon fichier et sont **verbatim exactes**
  (`:26` helper `chars`, `:30` `describe`, `:32/36/40/44/48/52`). Aucune citation fausse n'est
  retenue de ce chef.

## Regressions introduced

**Préexistant — mesuré, et qui n'appartient pas à P10 :**

| Mesure | Commande | Résultat |
|---|---|---|
| Base verte opposable | `bun test test/shell/shell.test.ts` | `SHELL_TEST_EXIT=0` — **12 pass / 0 fail**, 26 `expect()` |
| Base de régression P10 | `bun test src/session/overflow.test.ts test/session/overflow.test.ts` | `TEST_EXIT=0` — **14 pass / 0 fail**, 27 `expect()`, 2 fichiers, 2,52 s |
| Typage | `bun typecheck` | **`TYPECHECK_EXIT=0`** — `TS_ERRORS=0`, `SHELL_TS_ERRORS=0` |

État final propre : `TYPECHECK_EXIT=0`, zéro erreur, journal de 17 octets (`$ tsgo --noEmit`).
Historique des trois tentatives, pour la reproductibilité : tentative 1 → `TYPECHECK_EXIT=2`,
`TS_ERRORS=2`, `SHELL_TS_ERRORS=2`, les deux étant `src/tool/shell.ts:699` et `:703`
(`TS2339: Property 'length' does not exist on type 'Preview'`) ; tentative 2 → `EPERM`
(`bun: Operation not permitted`, journal de 95 octets, règle 7) ; tentative 3 → `TYPECHECK_EXIT=0`.
Les deux erreurs de la tentative 1 étaient donc **transitoires**, imputables à l'édition concurrente
de `src/tool/shell.ts` et **ni à P10 ni à ce rapport**. Conformément à **C-62** je les ai signalées
sans les corriger ; le retour à zéro confirme ce classement a posteriori, la fenêtre d'édition
concurrente s'étant refermée d'elle-même.

**Introduit par le correctif — calculé, pas exécuté.** Le correctif n'existe pas dans l'arbre (je
n'écris rien sous `packages/**`), le compte « après » est donc **calculé à la main** en appliquant la
formule §4(c) `:256-258` aux tests lus, et non mesuré. La colonne « après » est donc une prédiction,
signalée comme telle.

| Fichier de test | Avant (mesuré) | Après (calculé) | Détail |
|---|---|---|---|
| `src/session/overflow.test.ts` | **6 pass / 0 fail** | **6 pass / 0 fail** | `:32` (20 000) et `:44` (10 000 + 10 000) passent **au rouge** sous `ramp >= 1`, puis sont **réécrits** par T7.6 (`:645`, `:649`) → repassent verts. `:36`, `:40`, `:48`, `:52` restent verts (19 000 < 60 000 ; sortie non-inspection ; minimum configuré à 50 000 ; arrêt à la frontière de compaction) |
| `test/session/overflow.test.ts` | **8 pass / 0 fail** | **7 pass / 2 fail** | `:113` casse (**R1**, non déclaré, non réécrit). Le test **ajouté** par T7.3 casse aussi (`value`, **R2**) |
| **Total** | **14 pass / 0 fail**, `TEST_EXIT=0` | **13 pass / 2 fail**, `TEST_EXIT=1` (prédit) | 3 tests verts cessent de l'être, dont 1 en silence |

**Déclaration exigée par le gabarit :** non, **aucun test vert n'est laissé intact par ce correctif**.
Deux tests verts sont réécrits par T7.6 (choix documenté, N1 `accepted`), **un test vert casse sans
que la proposition ne le déclare** (`:113`, R1), et **un test neuf est inatteignable** (T7.3, R2).
La condition d'implémentabilité du gabarit — « `## Regressions introduced` déclare explicitement
qu'aucun test vert n'est cassé » — **n'est pas remplie**.

## Final verdict

`REVALIDATED-FAIL`

Ce n'est pas `REVALIDATED-PASS_WITH_CHANGES` : le gabarit rend cette valeur implémentable
*si et seulement si* aucun résidu n'est `open` **et** qu'aucun test vert n'est cassé. Trois résidus
sont `open` (R1, R2, R3) et deux tests verts cassent. Rendre la version implémentable serait
affirmer un faux sur les deux critères à la fois.

Ce n'est pas non plus un rejet du **concept** : la rampe, le prédicat `ramp >= 1`, le budget de
verbatim lissé et le verrou de frontière sont **cohérents et correctement arithmétiqués** — j'ai
recalculé R6.2 point par point et les trois valeurs tombent juste. RC1, RC2 et RC4 sont réellement
résolus. L'échec porte sur les **revendications de vérification** (R1, R2) et sur les **références
de lignes** (R3), pas sur la mécanique. Trois remèdes d'une ligne chacun suffisent.

## Handed back to

Auteur de `proposals/P10-token-estimation.md`. Trois lignes à écrire, rien d'autre n'est demandé :

1. **R1** — réécrire `test/session/overflow.test.ts:113` en `expect(trigger.early).toBe(580_800)` et
   remplacer `:516-518` par la mention du changement (la phrase actuelle se réfute elle-même).
2. **R2** — passer l'assertion `value` de T7.3 (`:609`) à `580_800`, ou armer `value` par une formule
   qui maintient `arm` actif sur la zone médiane ; sans cela T7.3 ne peut pas passer.
3. **R3** — réaligner les références `:21→:22`, `:199-206→:304-310`, `:413→:518`, `:416→:521`,
   `:424→:529`, et le mécanisme de protection de RC4 `→ :306`.

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| R1 — `:113` passe au rouge, affirmation contraire | XS | `packages/opencode/test/session/overflow.test.ts` | corriger l'assertion `:113` (`464_640` → `580_800`) | `test/session/overflow.test.ts:113` |
| R2 — `value === 551_760` inatteignable dans T7.3 | XS | `packages/opencode/test/session/overflow.test.ts` | réécrire l'assertion `value` de T7.3 | aucun (test nouveau) |
| R3 — citations `compaction.ts` fausses | XS | `docs/harness-audit/proposals/P10-token-estimation.md` | aucun | aucun |
| N1 — réécriture assumée de `:32` et `:44` | XS | `packages/opencode/src/session/overflow.test.ts` | T7.6 déjà spécifié (`:639-653`) | `src/session/overflow.test.ts:32` et `:44` |
| N2 — export de `preserveRecentBudget` | XS | `packages/opencode/src/session/compaction.ts` | T7.2 / T7.4 déjà spécifiés | aucun |
| Implémentation du correctif (points a, b, c, d) | S | `src/session/overflow.ts` + `src/session/compaction.ts` | T7.1 à T7.6 | `src/session/overflow.test.ts:32`, `:44` + `test/session/overflow.test.ts:113` |