# Revalidation — P19

## Proposal

`P19` — `turn_plan` : autorégération d'autorité. Fichier revalidé :
`docs/harness-audit/proposals/P19-turn-plan-cost.md`, **562 lignes**, révisé après verdict
`PASS_WITH_CHANGES` du 2026-10-03 (verdict d'origine : 202 lignes).

Je n'ai rédigé ni la proposition initiale, ni le verdict, ni la révision. Aucun fichier sous
`packages/**` n'a été modifié ; la proposition n'a pas été éditée (**C-36**) ; aucune commande
`git` n'a été exécutée.

## Revisions applied

Les huit Required changes du verdict d'origine, point par point, avec la citation qui prouve le
traitement. **22/22 citations relues verbatim** — aucune fausse citation relevée sur la
proposition révisée.

| RC | exigence | traitement | vérification |
|---|---|---|---|
| 1 | grandeurs monotones, aucun ratio à dénominateur réducteur | **traité quant à la forme, faux quant au fond** | G1/G2/G3 sont bien monotones et le ratio `0,628` a disparu. Mais **G1 ne discrimine pas** — voir N1 |
| 2 | **chiffrer le sacrifice avant fusion**, sinon livrer B seule | **INTACT** | §4.2 point 4 : « Fréquence réelle : **non mesurée, et non estimée** ». Aucun seuil pré-fixé. B retirée, donc la branche de repli n'est pas exécutée. → `RC2-INTACT` |
| 3 | corriger la Partie B pour préserver la récence `turn-plan.ts:72-78` | **sans objet — la prémisse du verdict était fausse** | `declare()` (`turn-plan.ts:69-80`) ne contient **aucun** court-circuit de déduplication ; `plans.delete` (`:73`) précède toujours `plans.set` (`:78`). La ligne `if (live && JSON.stringify(live.plan) === JSON.stringify(normalized)) return live.plan` citée par O3 **n'existe pas dans le dépôt**. La révision a raison de refuser O3 |
| 4 | réécrire « 70 % des étapes se terminent par un `turn_plan` » | traité | §2.1 : l'énoncé est retiré, remplacé par « 0,863 appel par tour » sur population définie |
| 5 | aligner `README.md:41` et §2 | **non appliqué, hors périmètre justifié** | `README.md:41` porte toujours « 0,70 appel par étape » ; §2.1 retient 0,863 appel par tour. Justification écrite en §7.4 (`README.md` partagé avec 19 vagues) |
| 6 | retirer ou étayer « premier poste d'usage après `bash` » | traité | §2.1 : retiré, unités distinguées (`README.md:31` = part d'appels ≠ ratio par tour) |
| 7 | réécrire « réellement non bornée », corriger le renvoi « section 9, point 2 » | traité | bornes survivantes citées et exactes : `continuation.ts:5` `AUTO_CONTINUE_LIMIT = 4`, `:71` step-limit, `:74-76`, `:82`. Renvoi erroné supprimé |
| 8 | trancher `turn-plan.ts:213` dans la proposition | traité | §4.4 : reste inchangée, « correctif le plus rentable en surface » retiré, contradiction `213`/`218` assumée et consignée |

**Diagnostic d'origine : confirmé, intégralement.** `prompt.ts:1872` `declaredIntent = "execute"`
sur une déclaration sans aucune observation ; `prompt.ts:1864` `let declaredIntent … | undefined` ;
`prompt.ts:1866` `TurnPlan.reminder(sessionID)` ; `prompt.ts:1885` unique autre affectation, via
`TurnPlan.declaredIntent` (`turn-plan.ts:142-148`) ; `prompt.ts:1887` `turnPlanCapsules.push(TurnPlan.instruction())`
inconditionnel ; `prompt.ts:1753` activation unique, `turn-plan.ts:200-202` `return input.flag || input.config === true`
seule implémentation ; `config.ts:340` `Default: false.` ; `registry.ts:410` enregistrement conditionnel ;
`message-v2.ts:322` `"turn_plan"` dans les entrées élidables au rejeu. La contradiction interne
`turn-plan.ts:213` (« On every turn, declare … the BATCH this turn delivers ») contre `:218`
(« Declare only what genuinely remains ») est réelle, même tableau, lignes 5 et 11.
`continuation.ts:77-81` confirme la condition de poursuite. **Rien de tout cela n'est contesté.**

## Status

`REVALIDATED-FAIL` — **Required change #2 intact**, non pas un résidu.

La règle 2 du gabarit est directement applicable : `REVALIDATED-FAIL` signale des Required changes
intacts. C'est exactement le cas. Le verdict d'origine demandait un **chiffre** — « compter sur un
échantillon les tours `reason === "declared-intent" && hasToolCalls === false` » et « le fixer comme
seuil d'acceptation explicite ». La révision fournit une méthode, une borne, et une identité, puis
écrit explicitement que la fréquence **n'est pas mesurée** et qu'**aucun gain n'est annoncé**. La
branche de repli du verdict (« sans ce chiffre, livrer B seule ») a été écartée par un argument de
rapport coût-bénéfice, non exécutée. Le RC n'est donc pas satisfait.

S'y ajoute un fait neuf, que ni le verdict ni la révision n'ont vu, et qui frappe le **critère de
succès installé à la place** : **G1 ne peut pas atteindre 0 après le patch**. Détail en N1.

`REVALIDATED-PASS_WITH_CHANGES` est exclu : au moins quatre résidus sont `open` (N1, N5, N6, RC2),
et la règle 1 exige qu'aucun ne le soit. `REVALIDATED-PASS` est exclu a fortiori.

## Remaining objections

Statut en tête de chaque ligne, conformément à la règle 4 du gabarit.

- **`open` — N1 (CRITIQUE). G1 ne discrimine pas : le patch laisse un second producteur de `"execute"`.**
  §4.1 affirme « ce compte est **nul par construction**, la ligne `prompt.ts:1872` ayant disparu et
  `declaredIntent` restant `undefined` sur ce chemin ». C'est faux. `declaredIntent = "execute"` a
  **deux** producteurs, et le second est le chemin « settlement », que le patch ne touche pas :
  `prompt.ts:1885` `declaredIntent = TurnPlan.declaredIntent(outcome?.verdict ?? "no-plan", outcome?.plan)`,
  et `turn-plan.ts:146-147` `if (!plan || verdict === "no-plan") return undefined` /
  `return verdict === "confirmed" ? "none" : "execute"`. Un plan dont l'attente est **manquée**
  (`settle()` → `"missed"`, `turn-plan.ts:128`) restitue donc `"execute"`, et
  `continuation.ts:77-80` en fait `{ action: "continue", reason: "declared-intent" }`.
  La proposition **reconnaît elle-même** ce chemin (« sans changement sur le chemin « settlement »
  (`prompt.ts:1885`) », §4.1) puis conclut quand même « → 0 » : contradiction interne.
  **G1 mesure « aucune poursuite non confrontée à une observation »**, pas « aucune poursuite ».
  Tel quel, G1 est **inatteignable** et donc non opposable : un futur correctif de la ligne 1872
  échouerait sur son propre critère de succès. Corollaire : le patch ne supprime qu'une **moitié**
  au mieux des ajustements d'Authority, ce que le document présente comme une suppression totale.
  *Statut `open` : traité seulement en surface (une borne et un cas limite), le fond est faux.*

- **`open` — N5 (MAJEUR). La borne structurelle annoncée est fausse d'un facteur ~2.**
  §4.2 point 3 pose `(R) ≤ nombre de déclarations`, sur le motif qu'« une déclaration ne pouvant
  produire qu'une poursuite (`turn-plan.ts:97-99`, `turn-plan.ts:127`) ». C'est faux sur le code :
  `reminder()` (`:95-100`) ne rend la main qu'une fois, **et** `settle()` (`:121-134`) supprime
  l'entrée à `:127`, mais le chemin « settlement » de `prompt.ts:1885` peut rendre `"execute"`
  **après** le chemin « reminder ». Scénario atteignable sur un seul `declare()` : itération N,
  le modèle déclare (tool call) ; itération N+1, `reminder()` rend la main → `prompt.ts:1872`
  → poursuite `declared-intent` ; itération N+2, `reminder()` rend `undefined` (déjà rappelé) →
  `settle()` sur l'observation réelle → `"missed"` → `prompt.ts:1885` → **seconde** poursuite
  `declared-intent`. La borne correcte est `(R) ≤ 2 × déclarations`, soit **≤ 10 252/semaine**, et
  non « ≤ 5 126 ». La section 4.2 est présentée comme le remplacement « chiffré » du risque
  qualitatif : elle est chiffrée faux. *Statut `open`.*

- **`open` — RC2-INTACT (CRITIQUE). Le sacrifice n'est pas chiffré.**
  Reprise littérale de N1/N5 ci-dessus. Aucun chiffre, aucun seuil pré-fixé, la branche de repli
  n'est pas exécutée. C'est le motif direct du `REVALIDATED-FAIL`. *Statut `open`.*

- **`open` — N6 (MOYENNE). Le retrait de la Partie B repose sur un nombre `HÉRITÉ`, et §9 affirme
  qu'aucun critère ne dépend des grandeurs héritées.**
  §9 point 3 : « Les grandeurs de la section 2.1 sont `HÉRITÉ` … **Aucun critère d'acceptation ne
  repose sur elles.** » L'énoncé est étroitement vrai — G1/G2/G3 n'en dépendent pas — mais trompeur :
  la **décision de livraison de la Partie B** en dépend entièrement (§4.2 point 3 et §5 : « 8
  déclarations strictement identiques sur 5 126 (0,16 %) … Gain maximal : **huit appels par
  semaine**. Du code qui supprime huit appels par semaine serait un coût d'entretien sans
  bénéfice. »). Un nombre non re-mesuré porte donc une décision de livraison, ce qui est
  exactement ce que la révision s'interdit ailleurs. *Statut `open`.*

- **`open` — N7 (MINEURE). §7.3 demande d'ajouter un test qui existe déjà.**
  §7.3 : « ajouter dans le fichier existant `continuation.test.ts` un cas qui épingle le
  comportement … `decideRunDecision` avec `nextAction: { kind: "none" }` et `declaredIntent: undefined`
  doit rendre `{ action: "stop", reason: "no-executable-action" }` ». Le fichier existe bien
  (`src/session/continuation.test.ts`, 85 lignes) et **`continuation.test.ts:25` asserte
  déjà exactement ce cas**, avec `declaredIntent` absent donc `undefined`. Le verrou que §7.3
  veut créer est déjà en place et passe déjà. La justification associée — « Aucun câblage d'import
  nouveau n'est requis : l'alias `@/session/...` est résolu dans `test/session/` (22 imports) » —
  vise le mauvais dossier : `continuation.test.ts:2` importe `from "./continuation"`, pas l'alias.
  *Statut `open`.*

- **`accepted` — contradiction `turn-plan.ts:213` / `turn-plan.ts:218`.**
  Tranchée en §4.4, assumée, tracée, aucun faux levier. Le verrou `turn-plan.test.ts:176-179`
  (`expect(instruction()).toContain("On every turn")`) est réel et vérifié ; `instruction()` est
  injecté sans condition (`prompt.ts:1887`) ; aucun levier opérateur n'existe
  (`config.ts:340` ne fait que porter un booléen). Réserve assumée : le protocole conserve une
  consigne qui contredit sa propre ligne 11. **Implémentable.**

- **`accepted` — `prompt.ts:1920-1935` : le sacrifice de `declaredIntent` est bien un angle mort de
  test.** §6 l'établit et c'est exact : aucun test de `test/session/` n'énonce cette autorité
  (`declaredIntent` → **0 occurrence** dans `packages/opencode/test/`), et
  `turn-plan.test.ts:108-123` teste `declaredIntent()` pur, que le patch ne touche pas.
  Réserve assumée : le critère de succès ne peut donc pas être un test unitaire. **Implémentable.**

- **`out_of_scope` — `README.md:41` désaligné.** « 0,70 appel par étape » contre 0,863 appel par
  tour retenu en §2.1. Justification écrite (§7.4 : `README.md` partagé avec 19 vagues de
  révision, mandat portant sur `proposals/**`). **Implémentable.**

- **`refused` — O3 du verdict d'origine : démontrée fausse.**
  Le verdict citait `if (live && JSON.stringify(live.plan) === JSON.stringify(normalized)) return live.plan`
  comme étant **après** l'entrée de `declare()`. La ligne **n'existe pas** dans
  `packages/opencode/src/session/turn-plan.ts` : `declare()` (`:69-80`) enchaîne `normalize`,
  garde `if (!normalized) return undefined`, `plans.delete` (`:73`), éviction sous `MAX_SESSIONS`
  (`:74-77`), `plans.set` (`:78`). Aucune sortie anticipée. La révision refuse O3 à raison ;
  le refus est **confirmé**, et le Required change #3 était inatteignable. **Implémentable.**

- **`refused` — « `grep` échoue en EPERM ».** Le mandat annonçait un échec EPERM. `grep` **n'a
  jamais échoué** : 67 occurrences (`declaredIntent|declared-intent`), 12 (`declared-intent` dans
  `~/.local/share/opencodev2/log/`), 10 (`continuation.test.ts`), 3 (`turn plan protocol injected`).
  Un `grep` sur `~/.local/state/opencode/log` a rendu « No files found » — répertoire qui existe
  mais ne contient aucun `.log` ; conformément à **C-50**, je ne l'ai pas lu comme une absence de
  source avant d'avoir sondé le vrai répertoire par `read`. **Implémentable.**

## Regressions introduced

**Aucun test n'est cassé : la proposition ne modifie aucun fichier** (`§4` : « Aucun fichier n'est
modifié » ; `§8` : effort `XS`, « zéro patch »). Aucune régression n'est donc introduite, ce qui
satisfait la clause de la règle 1 du gabarit — sans pour autant rendre `PASS_WITH_CHANGES`
atteignable, faute de résidus `open`.

État de mesure, établi sur le dépôt courant **sans aucun patch** :

- `bun typecheck` dans `packages/opencode` → **`TYPECHECK_EXIT=0`**, `bun --version` = **1.4.2**.
  Reproduit indépendamment (le verdict d'origine ne l'avait pas mesuré ; `C-46` l'avait établi
  pour P18).
- Aucune citation fausse relevée : **22/22 vérifiées**.
- Suites que le futur patch devrait garder vertes, état lu directement :
  `src/session/turn-plan.test.ts:34-40` (remplacement), `:42-50` (éviction), `:108-123`
  (`declaredIntent()` pur), `:176-179` (verrou « On every turn ») ; `src/session/continuation.test.ts:25`
  (déjà le verrou de §7.3), `:41-44` (`declaredIntent: "execute"` → `continue`/`declared-intent`),
  `:47-56` (plafond d'inactivité) ; `test/session/message-v2.test.ts:1706` (rejeu d'une part `turn_plan`).

**Ce que le validateur précédent n'a pas vu — la mesure de RC2 est faisable sans code.**
Le verdict d'origine l'écrivait déjà (« elle est déjà dans les logs », O2) ; la révision l'a
remontée en exigant un **build instrumenté** (§4.2 point 1, §7.1). C'est une régression de méthode :
`prompt.ts:1931` journalise déjà `reason` en clair via
`slog.info("auto-continue", { step, idleContinues, reason: decision.reason })`, et les journaux sont
sur disque dans `~/.local/share/opencodev2/log/`. **La chaîne exacte est bien `"declared-intent"`** —
`continuation.ts:80` `return { action: "continue", reason: "declared-intent" }`,dhaque `RunDecision`
littéral (`continuation.ts:48`). Elle est **mesurable sans instrumentation intrusive**, par simple
recherche de la chaîne dans les journaux existants.

Comptage effectivement exécuté sur les 12 fichiers `.log` conservés
(artefact : `%TEMP%\opencodev2\p19-reval-counts2.log`) :

| motif | occurrences |
|---|---|
| `turn plan protocol injected` (**contrôle**) | **3** |
| `reason=declared-intent` | **0** |
| `declaredIntent=execute` | **0** |
| `auto-continue` | 8 |
| `reason=no-executable-action` | 15 |

Le motif de contrôle prouvant que la méthode fonctionne, **`(R) = 0` sur le corpus conservé**. Deux
réserves, que je consigne plutôt que de les masquer : (a) le corpus est de **12 fichiers**, et le
protocole n'y apparaît que 3 fois — donc la fenêtre où `turn_plan` est actif est étroite ; (b)
`auto-continue` = 8 et `declaredIntent` = 14 incluent des **échos de permission de mes propres
commandes** (`service=permission … pattern=…`), donc seul le contrôle et le motif recherché sont
exploitables. Ce `(R) = 0` est **suggestif, pas concluant** — mais il est exactement le cas limite
annoncé par la révision elle-même (§4.1) : *« si le corpus de rejeu donne `(R) = 0` avant le
correctif, G1 est sans objet sur ce corpus et la Partie A n'est pas justifiée par lui ».*

## Tranchement demandé — `prompt.ts:1872` hors périmètre : `open`, pas `accepted`

La proposition **ne déclare pas** `prompt.ts:1872` hors périmètre : §5 la maintient « comme option
re-soumissible », §9 point 1 la donne pour « non livrable sans la mesure 7.1 et sans seuil
pré-fixé ». Le statut applicable est donc **`open`** :

1. `accepted` exige « traitée quant au fond, avec une réserve assumée et tracée ». Il n'y a pas de
   traitement : il n'y a pas de patch. La réserve est assumée, le fond ne l'est pas.
2. `out_of_scope` exige « hors périmètre décidé, justification écrite ». Aucun périmètre n'a été
   décidé pour cette ligne.
3. **Nœud logique à relever** : la condition de réouverture (§7.1) exige d'**instrumenter
   `prompt.ts`**, donc d'éditer `packages/**` — l'acte même que le mandat interdit. La condition de
   réouverture est **inexécutable sous le mandat qui l'a produite**. Le §7.4 applique awareness du
   mandat au `README.md` mais pas à `prompt.ts`, alors que `prompt.ts` est *le* fichier du finding.

**Règle appliquée** : une proposition dont le défaut principal est hors périmètre ne corrige pas le
défaut principal. Ici le défaut principal **est** `prompt.ts:1872` — « le seul chemin accordant
`declaredIntent = "execute"` sans vérification » est le diagnostic même. Le laisser non traité est
`open` par construction, sauf à prouver que la correction nuit ; ce que la révision ne fait pas.

## Tranchement demandé — que reste-t-il à implémenter, et quel est le bilan ?

**Réponse : rien.** La proposition révisée est une **décision de ne rien changer** — `§4` : « Aucun
fichier n'est modifié » ; `§5` : « Ne rien changer. **Retenue.** » ; `§8` : effort `XS`, « zéro
patch ». Il n'y a **ni Partie A ni Partie B** à implémenter. Le sacrifice de l'autorité de poursuite
n'est donc **pas mesuré à zéro** : il est **inconnu**, et le document le dit (§4.2 point 4).

**Bilan coût-bénéfice de la correction, s'il était someday livré :**

- **Coût en tours perdus : mesurable, et la révision refuse de le mesurer.** La borne est
  structurelle — une déclaration produit au plus une poursuite « reminder » (`turn-plan.ts:95-100`)
  **plus** une poursuite « settlement » (`prompt.ts:1885`, N5) — donc `(R) ≤ 2 × déclarations`, soit
  **≤ 10 252 tours/semaine** au maximum théorique, **zéro occurrence n'étant mesurée**.
- **Ce que la correction rapporte : rien de chiffré, et rien ne peut l'être dans ce document.** Le
  seul gain tangible — une tour/provider-request en moins par poursuite supprimée — est fonction de
  `(R)`, qui n'est pas mesuré. Aucun gain n'est annoncé, et c'est honnête.
- **Jugement : le bilan est inconnu, et le dire est la bonne décision de méthode.** Un correctif qui
  retire une capacité sans mesure de ce qu'elle rapporte n'a pas un bilan faible — il n'a **pas de
  bilan**. La révision a raison de ne pas livrer sur cette base. Mais elle a tort d'(a) aggraver le
  coût en annoncant une borne fausse (N5, facteur 2), (b) qualifier G1 d'atteignable alors qu'il ne
  l'est pas (N1), et (c) rendre sa propre condition de réouverture inexécutable sous son mandat.

Autrement dit : **la conclusion « ne rien changer » est robuste ; le raisonnement qui la fonde ne
l'est pas.** Et le chemin qui la débloquerait est plus court que ce que le document suppose — un
`rg --fixed-strings "reason=declared-intent"` sur `~/.local/share/opencodev2/log/`, pas un build
instrumenté. C'est ce qui manque pour que RC2 soit satisfiable.

## Final verdict

REVALIDATED-FAIL

Motif unique : **Required change #2 intact** (règle 2 du gabarit — Required changes intacts, non
résidus). Aggravants, non déterminants : **N1**, le critère de succès installé en remplacement de
RC1 est **inatteignable** et ne peut donc rien prouver ; **N5**, la borne chiffrée qui fonde le
refus de livrer est **fausse d'un facteur ~2** ; **N6**, une décision de livraison repose sur un
nombre `HÉRITÉ` que §9 déclare sans effet ; **N7**, §7.3 duplique un test existant.

Tranchements rendus : `prompt.ts:1872` est **`open`**, pas `accepted` ni `out_of_scope` ; il ne reste
**rien** à implémenter ; `reason === "declared-intent"` est bien la chaîne exacte
(`continuation.ts:80`) et elle est **mesurable sans instrumentation intrusive** — `(R) = 0` sur le
corpus de journaux conservé, avec les réserves de fenêtre énoncées ci-dessus. **O3 du verdict
d'origine est `refused`** : la ligne de déduplication qu'il citait n'existe pas dans le dépôt.

Ce verdict ne condamne pas le diagnostic, qui est **exact et intégralement vérifié**. Il condamne un
dossier dont la seule production — « ne rien changer » — est correctement décidée mais correctement
argumentée par une borne fausse et un critère inatteignable. **Cycles de révision : 2 sur 3**
(`C-37`) ; `NOT-IMPLEMENTABLE` n'est pas atteint.

## Grille d'effort (vague 4)

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| Mesure `(R)`/`(Q)` par recherche dans les journaux existants, sans instrumentation | XS | aucun (`~/.local/share/opencodev2/log/`) | aucun — preuve par shell, pas par test | aucun |
| Recalibrage de G1 en deux compteurs distincts (`unverified` / `reconciled`) pour qu'il discrimine réellement | S | `packages/opencode/src/session/prompt.ts:1931` | aucun | aucun — `prompt.ts:1931` n'est asserté nulle part |
| Correction de la borne `(R) ≤ 2 × déclarations` et de la formulation « → 0 par construction » | XS | aucun (document de proposition) | aucun | aucun |
| Retrait de §7.3, redondant avec `continuation.test.ts:25` | XS | aucun (document de proposition) | aucun — le verrou existe déjà | aucun |
| Partie A — suppression de `declaredIntent = "execute"` à `prompt.ts:1872`, **subordonnée à un seuil `(Q)` pré-fixé** | XS | `packages/opencode/src/session/prompt.ts:1872` | aucun — `continuation.test.ts:25` couvre déjà le verrou | **aucun** — `continuation.ts` n'est pas modifié ; `turn-plan.test.ts:176-179` reste vert |
| Partie B — déduplication | — | — | — | **abandonnée** : 0,16 % de rendement sur un nombre `HÉRITÉ` (N6) |
| Alignement `README.md:41` sur un triplet unique | XS | `docs/harness-audit/README.md` | aucun | aucun — hors périmètre, à arbitrer avec les 19 autres vagues |