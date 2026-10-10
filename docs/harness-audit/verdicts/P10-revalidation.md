# P10 — Revalidation indépendante, cycle 5

Revalidator : agent indépendant, n'a pas rédigé la proposition, ne la répare pas.
Cible unique : `docs/harness-audit/proposals/P10-token-estimation.md`.
Fichier écrit par cette revalidation : `docs/harness-audit/verdicts/P10-revalidation.md` (celui-ci).
Aucun fichier sous `packages/**` ni la proposition n'a été modifié. `git` non employé.
Aucun test n'a été exécuté par moi : je n'ai fait que de l'arithmétique reproductible (`bun`, exit 0)
et des recherches de texte.

## Dérive de l'artefact pendant la revalidation — à lire avant les citations

La proposition a été **réécrite par son auteur pendant que je revalidais**. Mesure, `bash` exit 0 :

| | snapshot jugé | snapshot courant |
|---|---|---|
| lignes | 780 | **880** (`TOTAL_LINES=880`, `LF_COUNT=879`, `NONBLANK=738`, `CONSISTENT=True`) |
| octets | 53 711 | **63 657** |
| SHA-256 | non capturé | `8224545F23FC24D58240CD1FB72B3AD4683D0949C224242F4D1F608964895078` |
| mtime | 10:42:01 | **10:50:19** |

**Je n'ai pas écrit ce fichier** : mon mandat l'interdit, et ma seule écriture de la session est
`docs/harness-audit/verdicts/P10-revalidation.md` (`ALL_FORBIDDEN_OLDER_THAN_VERDICT=True` pour les quatre
sources et les deux tests). La dérive est l'acte de l'auteur, pas le mien.

Conséquence, déclarée sans détour : les citations `P10:NNN` de ce document sont ancrées sur le snapshot
**780 lignes**, sauf celles que j'ai réancrées explicitement ci-dessous. Toute citation `P10:NNN` non
réancrée doit être lue comme « dans le snapshot 780 lignes ». Je ne réécris pas les ~40 citations
correspondantes : ce serait une reconstruction non vérifiée. J'ai réancré uniquement ce qui décide du
verdict, et je l'ai mesuré sur le snapshot courant :

- **T7.6 : `P10:642-646` → `P10:684-690`, la prescription est en `P10:686`** — le texte
  « que `:92` et `:94` passent de `464_640` à `580_800` … ce sont les deux » y est toujours présent.
  **Le constat bloquant tient sur le snapshot courant, pas seulement sur le snapshot jugé.**
- **R6.2 passe de `P10:702-706` à `P10:510-511`** (mêmes deux lignes, `464 640 → 580 800`).
- **`P10:744` (C-11) → `P10:818`**, et le décompte R6.1 devient `P10:819` (« 18 assertions auditées,
  2 rouges et imputables … les seules du dépôt »).

**`P10-R5-02` est clos par cette dérive**, et je le dis contre mon propre intérêt : la fausse revendication
de longueur qui le portait n'existe plus dans le fichier courant. Mesure : `MATCH_646=0` et `MATCH_780=0`,
avec **contrôle positif `MATCH_20000=30`** sur le même motif et le même fichier (donc la recherche
fonctionne), plus `CTRL_OVERFLOW_TS=43`. L'auteur a retiré la comparaison pendant que je jugeais.

Le reste de mes constats est **indépendant du numérotage de lignes** : il porte sur les expressions
arithmétiques (que j'ai reproduites), sur le contenu des tests sous `packages/**` (que je n'ai pas rejoué
mais dont j'ai lu les lignes), et sur la logique de la spécification. Ces constats-là survivent au
renumérotage.

## Final verdict

**REVALIDATED-FAIL**

La proposition est arithmétiquement juste, complète et honnête sur son exposition résiduelle — c'est un
document nettement meilleur que le cycle 4. Mais elle échoue à la clause d'implémentabilité, et pour une
raison qui ne peut pas être contournée : **elle prescrit la réécriture de deux assertions vertes de HEAD**,
`test/session/overflow.test.ts:92` et `:94` (`toBe(464_640)` → `toBe(580_800)`), et cette réécriture est
*logiquement forcée* par ses propres invariants. Elle ne peut donc pas être satisfaite sans casser un test
vert. Clause : implémentable ⟺ aucun résidu `open` **et** aucun test vert cassé. Les deux conditions
échouent.

`RESIDUES_REMAINING` : **oui** — 1 `residual` (1 `blocking`), 1 `out_of_scope` (1 `minor`),
9 `closed`. Le `residual` est un défaut **mesuré, confirmé et réancré sur le snapshot courant** que mon
mandat m'interdit de réparer ; il reste un défaut ouvert, pas un accord. `RESIDUES_REMAINING` est donc
non nul, et c'est ce qui fonde `REVALIDATED-FAIL`.

---

## 1. Arithmétique — reproduite par moi, chiffres du revalidateur

Script : `%TEMP%\opencodev2\p10-reval-arith.ts`, `p10-reval2.ts`, `p10-reval3.ts`, `bun` → **exit 0**.
Constantes HEAD : `READ_HEAVY_FRACTION = 0.8`, `READ_HEAVY_MIN_TOKENS = 20_000`, `MAX_PRESERVE_RECENT_TOKENS
= 8_000`, plafond read-heavy `24_000` (`src/session/overflow.ts:15-20`, `src/session/compaction.ts:49`,`:55`).
`SPAN = 2 × 20_000 = 40 000`.

### 1.a La rampe — conforme à la revendication

| inspected | ma valeur | attendu |
|---|---|---|
| 0 | `0` | `0` |
| 18 000 | `0` | `0` |
| 19 999 | `0` | `0` |
| **20 000** | **`0`** | **`0`** |
| 30 000 | `0.25` | `0.25` |
| 59 999 | `0.999975` | `0.999975` |
| **60 000** | **`1`** | **`1`** |
| 500 000 | `1` | `1` |

Aucune valeur `NaN`. **Conforme.**

### 1.b `Math.floor(proportional × 0.8) = 288 800` — vérifié

`proportional = 361 000` (chaîne T7.5 : usable `380 000` × `0.95` → `Math.floor` = `361 000`, reproduit).
`Math.floor(361000 × 0.8) = 288800`. Et `early(361000, ramp=0) === 288800`, avec
`early(361000,0) === Math.floor(361000*0.8)` → **`true`** (identité, pas coïncidence).

Conséquence : à rampe 0, `compaction.test.ts:441` (commentaire documentant `288.8k`), `:448`
(`trigger < 290 000`) et `:455` (`toBe(true)`) restent **strictement identiques** à HEAD. Marge
`290 000 − 288 800 = 1 200`. **Conforme.**

### 1.c Le `Math.round` — la revendication est exacte et `Math.round` est bien obligatoire

À `inspected = 59 999` : `ramp = 0.999975` → valeur **non arrondie = `23999.6`**, valeur **arrondie =
`24000`**. La revendication « 23 999,6 » est exacte au chiffre près. Sans arrondi, `budget` vaudrait
`23999.6` et toutes les assertions de budget entières casseraient. **Conforme, et mandatory confirmé.**

### 1.d Les neuf valeurs de T7.3 — les neuf reproduites

`8 000, 8 000, 8 000, 8 000, 8 400, 9 200, 12 000, 24 000, 24 000` pour `18 000 / 19 999 / 20 000 /
20 001 / 21 000 / 23 000 / 30 000 / 59 999 / 60 000`. **Les neuf exactes**, suite non décroissante,
`budgetAt(23 000) = 9 200` strictement compris entre `8 000` et `12 000`. **Conforme.**

### 1.e T7.4 et T7.5

- T7.4 : `early(580800, 0.25) = 493680` — exactement la valeur annoncée, distincte de `464 640`.
- T7.5 : `usable = 380000`, `proportional = 361000`, `early(rampe 0) = 288800` — exactement l'ancrage annoncé.

### 1.f Le prédiction `:92`/`:94` — arithmétiquement exacte

`test/session/overflow.test.ts:89` fixe `inspected: 500_000` → `ramp = 1` →
`early = Math.floor(580800 × (0.8 + 0.2 × 1)) = Math.floor(580800) = 580800`. **Prédit, exact.**
(Idem `value`, `:94`.) Et `59 999` → `580 797` : les deux lignes de tableau `P10:367` et `P10:369` sont
juste, il n'y a pas de contradiction interne.

---

## 2. Derivabilité — oui, plus aucun seuil ni frontière au goût

Aucun `à choisir` résiduel. La seule grandeur libre — le multiplicateur du span — est **explicite et
nommée** (`READ_HEAVY_RAMP_SPAN = 2 × READ_HEAVY_MIN_TOKENS`), déclarée « arbitré, pas mesuré »
(`P10:710`), et **ne décide d'aucun prédicat** (`P10:716-719`), donc ne peut casser aucun des tests
protégés. Ce n'est pas une taste-portion : c'est une constante documentée, modifiable en une ligne, avec
condition de réactivation posée (`P10:725-727`).

Preuve que la dépendance est réellement absente, pas seulement affirmée : j'ai fait varier le span sur
`{1 000, 4 000, 10 000, 20 000, 40 000, 100 000}` et la rampe à `inspected = 20 000` vaut `0` pour les six,
donc `early(361000, ·) = 288800` pour les six → `T7_5_value_under_any_span_all_288800 = true`. La
revendication « T7.5 est ce qui empêche un span plus court de casser INV-1 » est **vérifiée, pas cru**.

Les deux prédicats de site restent inclusifs et inchangés : `src/session/overflow.ts:76-77` et `:111` sont
laissés tels quels, ce qui préserve la frontière inclusive de HEAD (`>=`). Le gated `ramp >= 1` du cycle 4 a
disparu — les colonnes `readHeavy` de `P10:359-369` sont identiques avant/après sur toute la plage, ce que
j'ai confirmé : le multiplicateur n'apparaît que dans la magnitude.

§4.c ajoute `export` sur `preserveRecentBudget` (`HEAD: src/session/compaction.ts:304` est un `function`
non exporté ; le fichier HEAD expose 17 symbols et `preserveRecentBudget` n'en fait pas partie). C'est le
correctif de N2, et il est explicite.

---

## 3. Exposition résiduelle — **BLOCANTE**

`T7.6` (`P10:642-646`) : « **et** que `:92` et `:94` passent de `464_640` à `580_800` (R6.1) : ce sont
les deux seules assertions du dépôt que le correctif modifie, **et elles doivent l'être** ».

Donc : la spécification **prescrit** la rupture de deux assertions vertes de HEAD. Je vérifie si la rupture
était évitable — elle ne l'est pas.

**Preuve de la forcing.** Pour que `:92`/`:94` restent à `464 640`, il faut
`floor(580800 × (0.8 + 0.2 × r)) = 464640`, soit `0.2 × 580800 × r = 116 160 × r < 1`, donc
`r < 8.61e-6`. Or `r = (500 000 − 20 000)/span = 480 000/span`, d'où `span > 5.58 × 10^10`. Tout span fini
et raisonnable produit `r > 0` à `inspected = 500 000`, donc `early > 464 640`. Et les invariants propres de
la proposition (`T7.2` : `readHeavyRamp(60_000) === 1` ; `T7.3` : `budgetAt(60_000) === 24_000` ; `T7.4` :
`early(30_000) === 493 680`) **épinglent le span à 40 000**. Les deux intentions sont mutuellement
incompatibles : on ne peut pas garder `:92`/`:94` et tenir T7.2/T7.4.

Pour fermer définitivement l'alternative « plafonner ou faire retomber la rampe au-delà d'un certain
volume », qui rendrait la rupture évitable : `INFERE:` exécuter la formule du §4.b sur `inspected` de
60 000 à 500 000 par pas de 1 000 et vérifier que `early` y est strictement croissant et ne redonne
jamais `464 640`. On attendrait une suite strictement croissante, donc aucun repli possible — ce qui
confirme l'impossibilité de préserver `:92`/`:94` sous la forme spécifiée.

**Le document est honnête là-dessus** — `R6.1` énumère les 2 rouges imputables, `C-11` a été révisé pour
admettre « 2 rouges et imputables (`:92` et `:94`, les seules du dépôt) » (`P10:744`), et §9.1 retire
l'affirmation « aucune occurrence n'est imputée au correctif » (`P10:705-706`). Je n'ai trouvé aucune
tentative de masquer la rupture. **C'est la transparence qui rend le verdict `FAIL` et non `PASS`, pas
l'inverse** : une spécification honnête qui casse un test vert reste une spécification qui casse un test
vert.

**Vérification indépendante de « les deux seules du dépôt »** — je ne l'ai pas prise pour argent comptant.
`compaction.test.ts` contient 11 correspondances `24_000|8_000|preserve_recent|MAX_PRESERVE`, que j'ai
classées une à une : `:665`, `:690`, `:702` sont `output: 128_000` (faux positifs de la sous-chaîne
`8_000`), et `:1239`, `:1265`, `:1290`, `:1327`, `:1378`, `:1772`, `:1816`, `:1851` sont des valeurs de
configuration `preserve_recent_tokens` quiattaquent le **retour anticipé** de `src/session/compaction.ts:305-306`,
antérieur au correctif et laissé intact par §4.c. **Aucune assertion verte ne colle le budget verbatim
read-heavy.** La revendication est exacte.

---

## 4. Propriété lecture seule — confirmée

Le correctif ne touche que deux fonctions pures, `overflow.ts` et `compaction.ts`.

Recherche large `\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bSELECT\b|\.exec\(|db\.` sur la proposition :
**3 lignes**, toutes bénignes — `P10:135` (« le `const select` local de `compaction.ts:521` »),
`P10:541` et `P10:603` (« dépend d'aucun `select` »). Ce sont l'identifiant JS `select` et de la prose, pas
du SQL. Recherche stricte, sensible à la casse : `COUNT_STRICT = 0`. Le mot `SQL` lui-même n'apparaît
**pas** dans la proposition (`CTRL_sql_word = 0`), et `census` non plus (`CTRL_census = 0`) — la propriété
est tenue par construction, non par affirmation. **Aucun SQL mutant n'est ajouté. Confirmé.**

---

## 5. Contrôle d'honnêteté — conforme, sauf la revendication de longueur

Le revalidateur **n'a exécuté aucun test** et le dit. Je n'ai trouvé **aucune** revendication de test
passant sans code de sortie. Les seules passes citées sont soit attribuées explicitement au parent
d'implémentation (`P10:26`, « mesures du parent d'implémentation, citées comme telles »), soit un code de
sortie de script : `P10:357` « Source : exécution du script 4.a, **exit 0** », dont j'ai **reproduit**
tous les nombres (`proportional = 580800`, `floor(usable × 0,25) = 242000`, `ceiling = 24000`,
`start = 20000`, `span = 40000`, `floor = 8000`). L'artefact de scratch qu'il invoque existe
(`%TEMP%\opencodev2\p10-cycle5-arith.ts`, 3 354 octets) — c'est un script, pas un run de test.
**Aucun finding d'honnêteté sur les tests.**

En revanche la revendication « *Line count is now 646 (was 780)* » est **fausse telle qu'écrite** :
`TOTAL_LINES = 780`, `BLANK = 134`, `NONBLANK = 646`, `BYTES = 53 711`. Le fichier fait toujours 780
lignes ; 646 est le compte des lignes **non vides**. La réduction annoncée est un artefact de méthode de
comptage, et « was 780 » est le total. Le document n'a pas rétréci.

---

## 6. Statut des invariants tels qu'ils se tiennent maintenant

| invariant | site | verdict | preuve |
|---|---|---|---|
| **INV-1** | `test/session/compaction.test.ts:455` `toBe(true)` | **préservé** | prédicat inclusif `:76-77`/`:111` non modifié ; `inspected = 20 000`, rampe 0 → `readHeavy` reste `true` (colonnes `P10:364`) |
| **INV-2** | `test/session/compaction.test.ts:515` `toBe(true)` | **préservé** | idem ; `25 000` contre un minimum `25 000`, frontière `>=` inchangée |
| **INV-3** | `src/session/overflow.test.ts:32` `toBe(true)` | **préservé** | predicate intact, aucun `ramp >= 1` ne subsiste |
| **INV-4** | `src/session/overflow.test.ts:44` `toBe(true)` | **préservé** | idem |
| `:441` | `test/session/compaction.test.ts:441` | **EXPOSÉ, correctement déclaré** | `P10:702-706` + `R6.3` ; valeur 288 800 conservée, seul le commentaire documente la valeur déplacée |
| **—** | `test/session/overflow.test.ts:92`, `:94` | **CASSÉ par prescription** | `P10:644` — `REVALIDATED-FAIL` |

Les quatre invariants non inversibles sont réellement non inversibles : aucun ne dépend de la magnitude,
donc aucun n'est atteignable par le multiplicateur du span. C'est le progrès réel du cycle 5.

---

## 7. Findings

Statuts : `closed` = vérifié et clos par moi. `residual` = défaut **mesuré et confirmé**, que je ne peux pas
réparer (mon mandat interdit de toucher la proposition) et qui attend une décision de l'auteur ; il reste
un défaut ouvert, pas un accord. `out_of_scope` = hors périmètre de ce cycle, avec condition de
réactivation posée par la proposition elle-même. Aucun de ces trois statuts n'adoucit le verdict :
`REVALIDATED-FAIL` tient, et `P10-R5-01` reste **bloquant**.

| id | sévérité | statut | preuve (file:line) | constat |
|---|---|---|---|---|
| **P10-R5-01** | **blocking** | `residual` | `P10:642-646` (snapshot 780 l.) → **réancré `P10:684-690`, prescription en `P10:686`** (snapshot 880 l., SHA256 `8224545F…`) ; `packages/opencode/test/session/overflow.test.ts:92`, `:94`, `:89` | T7.6 **prescrit** la réécriture de deux assertions vertes de HEAD (`toBe(464_640)` → `toBe(580_800)`). La rupture est logiquement forcée : garder `464 640` exige `span > 5.58e10`, incompatible avec les invariants T7.2/T7.4 qui épinglent `span = 40 000`. Implémentable ⟺ aucun test vert cassé → **non implémentable**. |
| **P10-R5-02** | material | **`closed`** | `P10` (longueur globale) ; snapshot 780 l. : `TOTAL_LINES=780 / BLANK=134 / NONBLANK=646` ; snapshot 880 l. : `MATCH_646=0`, `MATCH_780=0`, contrôle positif `MATCH_20000=30` | **Clos par la dérive, et je le dis contre mon propre intérêt.** La revendication était fausse sur le snapshot jugé — 780 lignes, 646 = non vides — et **n'existe plus** dans le snapshot courant, mesurée à `MATCH_646=0` et `MATCH_780=0` contre un contrôle positif `MATCH_20000=30` sur le même motif et le même fichier. L'auteur l'a retirée pendant ma revalidation. |
| **P10-R5-03** | minor | `out_of_scope` | `P10:708-727` | Le multiplicateur 2 du span reste un arbitrage non mesuré. **Non bloquant** : constante nommée, ne décide aucun prédicat, et j'ai vérifié que la valeur 288 800 de T7.5 est invariante pour tout span de 1 000 à 100 000. |
| **P10-R5-04** | minor | closed | `src/session/overflow.ts:76-77`, `:111` vs `P10:275-300` | Les deux prédicats de site restent inclusifs et inchars. Le gated `ramp >= 1` du cycle 4 a disparu. |
| **P10-R5-05** | minor | closed | ma mesure `bun`, exit 0 (§1.a-§1.f) | Les six expressions annoncées sont exactes au chiffre près, y compris `23999.6` et les neuf valeurs de T7.3. |
| **P10-R5-06** | minor | closed | `P10:589-604` ; ma mesure | T7.3 ne dépend que de l'export du §4.c — pas de `select`, pas de pipeline Effect. §4.c ajoute bien `export` (`HEAD compaction.ts:304` ne l'a pas). |
| **P10-R5-07** | minor | closed | `P10:359-369` ; ma mesure §1.f | La table R6.1 est exacte sur les neuf lignes, `readHeavy` identique avant/après, y compris les deux lignes 59 999 / 60 000 que j'ai cru contradictoires avant vérification. |
| **P10-R5-08** | minor | closed | `P10:744` ; `compaction.test.ts:665,690,702,1239,1265,1290,1327,1378,1772,1816,1851` | « Les deux seules assertions du dépôt » est exact : les 11 correspondances de budget sont des `128_000` ou des `preserve_recent_tokens` de config hitting le retour anticipé `compaction.ts:305-306`. Aucune assertion verte ne colle le budget. |
| **P10-R5-09** | minor | closed | `P10:26`, `P10:357` ; artefact `%TEMP%\opencodev2\p10-cycle5-arith.ts` | Aucun test passant revendiqué sans code de sortie. Les passes sont attribuées au parent ; les seuls codes de sortie cités sont ceux du script 4.a, dont j'ai reproduit les nombres. |
| **P10-R5-10** | minor | closed | `P10` entier ; `COUNT_STRICT=0`, `CTRL_overflow_ts=32` | Lecture seule confirmée : aucune SQL mutant ; les 3 hits du motif large sont l'identifiant `select` et de la prose. |
| **P10-R5-11** | minor | closed | `P10:627-640`, `P10:716-719` | La revendication « T7.5 empêche un span plus court de casser INV-1 » est **vérifiée** par variation du span, pas seulement affirmée. |

---

## Contrôles positifs

Aucun de mes zéros n'est dépourvu d'un contrôle positif sur un motif connu présent.

| recherche | résultat | contrôle positif sur un motif connu présent |
|---|---|---|
| `toBe(true)` dans `src/session/overflow.test.ts` | **2** (`:32`, `:44`) | fichier lu en entier, 54 lignes, 6 assertions `toBe` énumérées (`:32` T, `:36` F, `:40` F, `:44` T, `:48` F, `:52` F) |
| motifs SQL mutants, P10 | `COUNT_STRICT = 0` | `overflow.ts` dans P10 = **32** ; `compaction.ts` = **27** |
| mots `SQL` / `census`, P10 | `0` / `0` | idem 32 / 27 |
| budget dans `compaction.test.ts` | 11 matches, **0 assertion** | `toBe` = **136**, `isOverflow` = **31** dans le même fichier |
| exports de `compaction.ts` | `preserveRecentBudget` **absent** des 17 | `export function preserveRecentBudget` introuvable, `function` nu en `:304` |
| rampe « trivialement nulle » | `ramp(30 000) = 0.25` | valeur intérieure non nulle observée |

---

## Handed back to

`P10-token-estimation.md`, auteur du cycle 5.

**Le travail de fond est bon et je le dis :** la rampe est enfin confinée à la magnitude, les deux prédicats
de site sont intacts, les six expressions sont exactes, `Math.round` est correctement justifié, les
quatre invariants sont réellement non inversibles, la propriété lecture seule tient, et le document
annonce sa propre rupture au lieu de la maquiller. C'est un bon diagnostic.

**Ce qui bloque, et rien d'autre :** `T7.6` prescrit de casser `test/session/overflow.test.ts:92` et
`:94`. Ce n'est pas un oubli, c'est un choix — mais c'est un choix que la clause d'implémentabilité
interdit tant qu'il n'est pas levé. Trois voies, à ton arbitrage, je n'en choisirai pas pour toi :

1. **Déplacer la magnitude hors de `early`** — interpoler entre `floor(proportional × 0.8)` et
   `proportional` sur la **fenêtre de verbatim** plutôt que sur le déclencheur, si un point d'appui existe
   qui ne touche aucune assertion. Cela laisserait `:92`/`:94` vertes. `INFERE:` il faudrait d'abord établir
   qu'un tel point d'appui existe ; je ne l'ai pas cherché, et ce n'est pas mon rôle de le concevoir.
2. **Faire endosser la rupture** — si changer le calibrage de l'arme à 500 000 inspectés est un choix
   produit assumé, il lui faut un acte explicite (une décision d'owner, pas une ligne de spec), et
   `P10-R5-01` se ferme alors sur cette base.
3. **Allonger le span** pour que `ramp(500 000)` soit négligeable — mathématiquement possible
   (`span > 5.58e10`), sémantiquement absurde, et incompatible avec T7.2/T7.4. Je la mentionne pour
   complétude, pas comme option.

Et une correction de forme, sans rapport avec le verdict : `P10-R5-02`, la longueur. Dis `646 lignes non
vides sur 780` ou supprime la comparaison « was 780 », mais n'annonce pas une réduction qui n'a pas eu
lieu.