# P11 — verdict

## Proposal

`P11` — La barrière anti-clôture est inactive par défaut : `deliverable` vaut `undefined` sur le
chemin outils, et `out_of_scope` sans preuve la neutralise en un appel.
Fichier validé : `docs/harness-audit/proposals/P11-objective-type-gate.md` — **révision de 364 lignes**,
en-tête `:3` : *« Révisé après verdict `FAIL`. Corrections appliquées : 7/7. »*

> Ce verdict porte sur la **révision**, pas sur la version de 338 lignes invalidée précédemment.
> La révision remplace le classifieur de texte par **R1** (garde inconditionnelle), **R2**
> (`out_of_scope` exige une preuve) et **R3** (`deliverable` devient champ mort). Les constats sont
> re-vérifiés sur ce texte ; les objections de la version précédente sont marquées « levée » quand
> la révision y répond, avec la preuve.

## Validator

`opencode_agent` (Space Bunny), session `ses_08956f56cffeQrgeNqGdKm0DlI`.
`independent` — n'a pas rédigé la proposition ; n'a modifié aucun fichier source.

## Status

`PASS_WITH_CHANGES`

Les deux blocages `critical` de la version précédente sont **levés par construction**, et non par
ajout d'un second classifieur : R1 supprime toute chaîne choisie par le modèle comme entrée de la
décision, et R2 rend l'issue de sortie inatteignable sans artefact. Restent deux défauts réels de la
révision elle-même (N1, N2) et une décision de conception que la proposition escalade correctement
au coordinateur (§9.2).

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok | E1 `:524-532` ; E2 `goal-state.ts:116-129`/`:29`/`:122` ; E3 `prompt.ts:2739` ; E4 `:42-50`, `:52-60`, `:199-222`, `:208`, `:212-217` ; E5 `:671` ; E6 `:656` ; E7 `:44`, `:54`, `goal-state.ts:25` ; E8 `:452-459` ; E9 `goal-evidence.ts:41` ; E10 `:626` ; E11 `:624`, `:643`, `:709`, `:723`, `:450`. Toutes relues ligne à ligne : `:624` = *« Completion refused: sticky findings remain OPEN. »* ; `:643` = *« background work started by this session is still running »* ; `:656` = `const blockingResidual = blockingResidualFindings(previous.deliverable, findings)` ; `:671` = *« an implementation objective cannot close with high-severity findings left residual »* ; `:709` = *« every unproven DoD item needs a declared external blocker »* ; `:723` = *« the DoD is not backed by verifiable evidence »* ; `:450` = *« One entry per DoD item … Required — completion is refused without it. »* |
| le correctif supprime vraiment la cause | ok | R1 supprime le paramètre : `:161` `export function blockingResidualFindings(findings: readonly GoalFinding[]): GoalFinding[]` — plus aucun `deliverable` en entrée, donc plus aucun texte sous contrôle du modèle dans la décision. Le reproche « déplacer une chaîne contrôlée par le modèle » ne s'applique plus : il n'y a plus de chaîne. **O1 levée.** |
| R2 ne crée pas d'inversion de sûreté | ok | Point décisif vérifié : `:624` (*sticky findings remain OPEN*) est **antérieur** à `:656` (garde residual). R2 rétrograde un `out_of_scope` sans preuve vers `open` (`:188`) → le refus `:624` se déclenche. La rétrogradation renforce le verrou. **O2 levée.** |
| chemin de sortie explicite et non contournable | KO (surévalué) | R2 exige bien `incomingEvidence.length !== 0`, donc la sortie **vide** est fermée. Mais le §6.4 (`:272-274`) attribue le traitement du cas « preuve creuse » à `proofIsSubstantive` (`:482-488`) et au filtre `:723`. Vérification : `:485-490` ne s'applique qu'aux **preuves de DoD** (longueur ≥ 12, non-vague, jeton ré-observable) ; `finding.evidence` reste `Schema.optional(Schema.Array(Schema.String))` (`:458`), sans validation. → **N1**. |
| le correctif ne casse pas un comportement existant | ok | Base mesurée : `bun test ./src/tool/goal-residual.test.ts` → **exit 0, 5 tests, 15 expect() calls, 0 fail** (log `p11-goalresidual-baseline.log`). Le fichier est **vert avant patch**, donc le critère T1 (« `bun test` exit 0 sur ce fichier ») est atteignable et T1 dispose d'une base de comparaison. `:37` (`undefined`) est supprimé par T1 (`:286`), la signature perdant le paramètre. |
| base rouge préexistante : 8 cas rouges nommés | ok | `bun test ./test/tool/goal-contract.test.ts ./test/tool/registry.test.ts ./test/tool/parameters.test.ts` → exit 1, `86 pass / 8 fail`, `snapshots: 12 passed, 4 failed`, `94 tests across 3 files`. Les 8 noms repris par la proposition `:310-317` correspondent **exactement** à ma mesure, y compris `error: tool not found: create_objectif` (`goal-contract.test.ts:62` depuis `:220` et `:265`, alors que `registry.ts:362` publie `create_objective`) et le `(fail) (unnamed) [5000.65ms]` par timeout de hook. **O5 levée.** |
| tests proposés sont exécutables dans ce dépôt | KO (partiel) | T1, T2, T3, T5, T6 sont exécutables. **T4** vise `packages/opencode/src/session/goal-evidence.test.ts` en le qualifiant de « **(nouveau)** » (`:289`) alors que le fichier **existe** : 1315 octets, 3 tests verts sous `describe("sticky goal findings")`, dont *« refuses to close without evidence and closes monotonically with evidence »* — exactement le comportement que R2 modifie. → **N2**. |
| effort et coût annoncés réalistes | ok | §8 (`:330-337`) annonce `M` : trois expressions dans deux fichiers (`goal-contract.ts:519-532`, `:656`, `:671` ; `goal-evidence.ts:41`), une réécriture de test, 6 cas. Le lot `L` disparaît **mécaniquement** : plus de couche d'analyse, plus de migration de schéma, plus d'historique à reconstruire, le classifieur étant supprimé. |
| décision de conception correctement escaladée | ok | §9.2 (`:348-359`) soumet au coordinateur l'arbitrage (A) R1 tel quel / (B) DoD typé + autorité d'écriture hors surface `edit_objective`, effort `L`, avec le motif de rejet de 5.2. Escalade légitime. |

### Réponses aux 5 points du brief

1. **Citations exactes et verbatim** — oui, sur les 11 évidences E1-E11, détail ci-dessus.
2. **Type d'objectif choisi ou dérivé ?** — **dérivé**, et la révision le dit : `:44` « le champ est un
   `regex` sur du texte utilisateur », `:58` un seul écrivain lisant `sourceText`. Titre corrigé
   (`:1`), correction 3 du tableau `:9`. **O7 levée.**
3. **DoD typés ?** — non (`:44`, `:54`, `goal-state.ts:25` : `Schema.Array(Schema.String)`), et la
   révision le reconnaît en §5.1 (`:217-222`) puis **supprime la règle** au lieu de la déplacer. Le
   reclassement demandé par le verdict précédent est **justifié** : la question devient sans objet.
4. **Régression ?** — les 8 cas rouges préexistants sont énumérés à l'identique et le critère est
   devenu « 0 nouvel échec » (`:301`). `goal-residual.test.ts` est vert (exit 0) et
   `goal-contract.test.ts` n'exerce ni `deliverable` ni `blockingResidualFindings` (aucune occurrence
   dans le fichier), donc aucun test supplémentaire ne casse. **O6 levée.**
5. **Chemin de sortie non contournable ?** — R2 ferme proprement la sortie **sans artefact**, ce qui
   était l'objection critique. Restent deux réserves : la preuve reste une chaîne libre non validée
   sur le chemin *finding* (N1), et le taux de sur-blocage des `audit`/`plan`/`answer` n'est pas
   mesuré (§6.1 `:250`, honnêtement marqué `INFERE`).

## Objections

### N1 — « non contournable » estimé au-delà de ce que le code prouve (moyen)

R2 exige `incomingEvidence.length !== 0` (`:188`), ce qui ferme la sortie **vide**. Mais le §6.4
(`:272-274`) écrit que le risque d'une « preuve formelle mais creuse » est « traité par
`proofIsSubstantive` (`:482-488`) et le filtre `:723` ». Vérification :

> `goal-contract.ts:485-490`
> ```ts
> function proofIsSubstantive(proof: string): boolean {
>   const value = proof.trim()
>   if (value.length < 12) return false
>   if (VAGUE_PROOF.test(value)) return false
>   // Something re-observable: a command, a path, a number, a status, a URL, a hash.
>   return /[\d]|[\\/]|https?:|exit|passed|failed|\bcode\b|\bscore\b|\btest/i.test(value)
> }
> ```

Ce contrôle est branché sur les **preuves de DoD** (annotation `:450`, diagnostic `:724-725`
*« Proof is an assertion, not an artifact, for: … »*). Sur le chemin *finding*, `evidence` reste :

> `goal-contract.ts:458`
> ```ts
> evidence: Schema.optional(Schema.Array(Schema.String)),
> ```

Aucune longueur, aucun motif, aucun jeton ré-observable. Donc `evidence: ["x"]` suffit à faire
persister `out_of_scope` : R2 est contournable en un appel avec une chaîne d'un caractère. La
proposition **reconnaît** ce résidu (§6.4, phrase liminaire) mais **l'attribue à un mécanisme qui ne
s'applique pas**. *Quoi changer :* soit appliquer `proofIsSubstantive` (ou un équivalent) à
`finding.evidence`, soit reformuler « chemin de sortie explicite et non contournable » (`:194-195`)
en une affirmation bornée par ce que le code prouve, et écrire que la qualité de la preuve côté
*finding* n'est pas validée — le gap est alors assumé au lieu d'être déguisé.

### N2 — T4 décrit un fichier de test existant comme « nouveau » (faible)

`:289` annonce `packages/opencode/src/session/goal-evidence.test.ts` **(nouveau)**. Le fichier existe
(1315 octets) et contient déjà 3 tests verts sous `describe("sticky goal findings")` : *« a narrower
empty pass never erases an existing finding »*, *« refuses to close without evidence and closes
monotonically with evidence »*, *« deduplicates retries and preserves first-seen ordering »*.
*Quoi changer :* libeller T4 « extension d'un fichier existant », nommer les 3 tests préexistants à
préserver, et donner la base `3 pass → 5 pass` au lieu de `0 → 2`.

### N3 — la base mesurée rend une réserve du §7.2 caduque (information)

`:323-326` marque en `INFERE` que l'état préexistant de `goal-residual.test.ts` et
`goal-evidence.test.ts` n'est pas mesuré, et demande de le relever avant le patch. C'est fait :
`bun test ./src/tool/goal-residual.test.ts` → **exit 0, 5 tests, 15 expect() calls** ; le second
fichier est vert (3 tests). Les deux bases sont donc disponibles et la réserve peut être close sans
travail supplémentaire. *Quoi changer :* remplacer l'`INFERE` par ces deux mesures.

## Required changes

1. **Corriger l'attribution du §6.4** (N1) : ne pas attribuer `proofIsSubstantive` (`:482-488`) ni le
   filtre `:723` au chemin *finding*. Ou étendre ce contrôle à `finding.evidence` (`:458`), ou
   reformuler l'affirmation « non contournable » (`:194-195`) en une affirmation bornée par ce que le
   code prouve réellement.
2. **Relibeller T4** (N2) : `goal-evidence.test.ts` existe et est vert (3 tests) ; T4 doit en être
   l'extension, avec les 3 tests existants nommés comme base à préserver.
3. **Remplacer l'`INFERE` du §7.2** (N3) par les deux lignes de base mesurées.
4. **Trancher §9.2 avant merge** : l'arbitrage (A)/(B) relève du coordinateur, mais R1 seul n'est pas
   neutre — il supprime l'exemption `audit`/`plan`/`answer` que porte le commentaire `:519-523`.
   Faire consigner la décision dans `README.md:33` au merge, sinon la matrice décrira une garantie
   que le patch ne porte pas.

## Implementation guidance

Ordre de patch : (1) **R2 seul** (`goal-evidence.ts:41`, une ligne) — indépendant de R1, ferme la
seule sortie sans artefact, testable immédiatement contre le fichier existant (N2) ; (2) **R1**
(`goal-contract.ts:519-532`, `:656`, `:671`) plus la réécriture des 9 appels de
`goal-residual.test.ts:19-38`, base verte mesurée (exit 0) ; (3) T5/T6 dans
`test/tool/goal-contract.test.ts`. Piège connu : T5 et T6 doivent écrire **explicitement** leur DoD,
sinon le DoD par défaut `MINIMAL_DOD_ITEM`
(`src/cli/cmd/tui/routes/session/goal-edit-parser.ts:1`) fait passer le test pour une preuve de
non-régression alors qu'il prouve l'inverse — ces deux cas sont les seuls capables de détecter une
régression de suppression du classifieur. Ne pas mettre à jour les 4 snapshots `parameters.test.ts`
dans le périmètre P11 : ils sont rouges pour le champ Lean `causedBy`, cause étrangère (`:319-321`).
