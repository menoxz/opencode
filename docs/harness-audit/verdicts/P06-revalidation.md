# P06 — Revalidation (cycle 2)

Révalidateur indépendant. Je n'ai rédigé ni la proposition initiale, ni son verdict, ni la
révision. Je n'ai écrit aucun fichier sous `packages/**` et n'ai lancé aucune commande `git`.

## Proposal

`docs/harness-audit/proposals/P06-compaction-dod-loss.md`, révision cycle 2 (1 025 lignes).

**Objet.** Le résumeur de compaction reçoit un `SUMMARY_TEMPLATE` qui lui **demande** des
sections, sans aucun état de contrat ; et le filet `formatGoalContext` → `stickyGoalContext`
coupe à dix éléments **silencieusement**. Cause racine unique (§3) : le contrat de sortie a
deux représentations indépendantes et rien ne les lie.

**Fichiers de production visés : un seul** — `packages/opencode/src/session/compaction.ts`.
Fichiers de test : `packages/opencode/src/session/goal-context.test.ts` (colocalisé, importe
déjà `formatGoalContext` ligne 2) et `packages/opencode/test/session/compaction.test.ts`.

**Ce que le cycle 1 a établi et que je ne rediscute pas** : effort réel `S`, **0 appelant
touché**, `goal-contract.ts:576-577` (`sessions.get(sessionID).goalState`), `compaction.ts:5`
+ `:372-374` + `:377` (`const session = yield* Session.Service`), `processCompaction` défini à
`:525` et **utilisé** à `:477` et `:711`. **C-28** : le §8 du cycle 1 affirmait le contraire,
il était **réfuté** — et le §8 du cycle 2 le réfute lui-même en nommant la faute
(« la justification du cycle 1 était fausse », §8).

## Revisions applied

**RC1 — bornage de la dégradation `open` (origine :87). Traité.** §4.3 impose
`OPEN_OVERFLOW_MAX_LINES = 25` (§5 vii, ligne 643) ; le marqueur porte le **nombre exact** et
l'instruction `task-contract(edit)` ; `OVERFLOW_MARKER` est « généré par le harnais, jamais
par le modèle » (§4.2, lignes 440-445).

**RC2 — test d'effet, pas seulement de prompt (origine :89). Traité.** T4 observe le prompt,
**T4b** observe le résumé persistant. T4b porte sa propre limite (§7, lignes 849-857) : il ne
prouve pas l'obéissance du modèle, et le dit au lieu de simuler une preuve.

**RC3 — T3 auto-suffisant (origine :91). Traité, avec divergence assumée.** Plafond **absolu
et gelé dans le test** : `FROZEN_CEILING_TOKENS = Token.estimate("x".repeat(4_800))`
(ligne 889). Le test ne référence plus aucune implémentation qu'il valide — le vice reproché
au cycle 1 est supprimé par construction. La valeur diverge des 750 suggérés par le verdict
d'origine ; j'ai vérifié que cette divergence est **nécessaire**, pas extravagante (F1/F2).

**RC4 — liste de régression et commande globale (origine :93). Traité.** La commande globale
ligne 907 inclut `test/session/context-budget.test.ts` ; `context-budget.test.ts:294` est
nommée comme surface de casse réelle (ligne 656) ; `eval.test.ts:914` et `scenario.ts:90`
sont nommés comme consommateurs du préfixe `UNVERIFIED:` (ligne 680).

**RC5 — joint §4.2 / §4.3 (origine :95). Traité.** `FINDING_PRIORITY: Record<GoalFinding["status"], number>`
exhaustif (lignes 383-388), clé de départ explicite `priority → firstSeenAt →
id.localeCompare` (lignes 420-423), `renderBudgeted` déclare sa pré-condition « `items` MUST
already be sorted by the caller » (ligne 390). T2 encode deux règles distinctes, dont le test
anti-stabilité-accidentelle (lignes 878-881).

**RC6 — §3 étape 4, chemin §2, requalification d'effort (origine :97). Traité
**intégralement** — le cycle 1 le disait `partiel`, et je confirme le passage.** Les trois
composantes, vérifiées séparément :
1. §3 étape 4 : « ils n'ont pas de case » est **explicitement réfuté** comme formulation
   fausse (lignes 226-229), le risque réel est recentré sur le `(none)` affirmatif (230-232) ;
2. §2 ligne 50 : chemin corrigé en `packages/opencode/src/tool/goal-contract.ts:609-628`
   (ligne 88), plus `session/goal-contract` ;
3. §8 (lignes 915-932) : `S` justifié sur quatre faits — un seul fichier, aucune API nouvelle,
   `firstSeenAt` déjà dans `GoalFinding` (`goal-evidence.ts:11`), et **aucune modification du
   type d'entrée de `SessionCompaction.process`** (`compaction.ts:525-531`).

**Voie B retirée.** §5 vi (lignes 632-640) la retire **sur preuve** : `sessionID` déjà dans le
type (`:528`), service déjà importé (`:5`) et déjà acquis (`:377`), lecture nommée déjà
existante ailleurs (`goal-contract.ts:576-577`). Un champ supplémentaire serait un paramètre
redondant dont l'oubli serait **silencieux**.

**F1 du cycle 1 (matrice) — clos.** `README.md:28` est bien la ligne **P06** et pointe
`src/session/compaction.ts:55` ; `README.md:33` est bien la ligne **P11** et porte **déjà**
`src/tool/goal-contract.ts:519`. C-01 était appliqué.

**F3 du cycle 1 (format des lignes) — clos et cohérent.** `goal-context.test.ts:11-13` pinne
`SUMMARY: functional work done`, `FINDING SEC-001 [high/residual]`, `UNVERIFIED: load`.
`compaction.ts:101` produit le format `FINDING <id> [<severity>/<status>]`, `:104` le format
`UNVERIFIED:`. §4.2 lignes 361-367 conserve ces formats **à l'identique** et nomme le test
comme la raison de la contrainte. Le patch ajoute un *budget*, il ne change pas la *forme*.

## Status

| Required change (origine) | Statut | Preuve |
| --- | --- | --- |
| RC1 bornage `open` | traité | §4.3 + `OPEN_OVERFLOW_MAX_LINES = 25` (§5 vii :643), `OVERFLOW_MARKER` :444-445 |
| RC2 test d'effet | traité | T4 + T4b (§7 :843-857) |
| RC3 T3 auto-suffisant | traité (750→1 200 justifié) | `Token.estimate("x".repeat(4_800))` :889 |
| RC4 régression + commande globale | traité | :656, :680, :907 |
| RC5 joint §4.2/§4.3 | traité | `FINDING_PRIORITY` :383-388, tri :420-423, T2 :874-881 |
| RC6 §3/§2/effort | **intégralement traité** | :226-232, :88, §8 :915-932 |

**T4 discrimine-t-il réellement ? Oui — vérifié, non par analogie.** Le vice **C-20** du
cycle 1 était un test lexical qui passait dans les deux mondes. La reconstruction est sound,
et voici la preuve structurelle :
- `rg 'task-contract|formatGoalContext|goalState' compaction.ts` → **4 hits, tous dans la
  définition** : `:109` (commentaire), `:112` (signature), `:119` et `:124` (les deux `return`
  de `formatGoalContext`). **Zéro site d'appel dans le fichier** ;
- `buildPrompt` (`:186-197`) assemble `[anchor, SUMMARY_TEMPLATE, ...input.context].join("\n\n")`
  — aucune des trois sources n'est l'état de contrat ;
- `nextPrompt` est défini à `:655` et consommé **une seule fois**, `:734`
  (`content: [{ type: "text", text: nextPrompt }]`).

Avant le patch, `captured` ne peut donc pas contenir `<task-contract` :
`expect(captured).toContain("<task-contract")` est **rouge avant, vert après**. Le test est
dans le monde observable, pas dans le monde lexical — c'est bien la correction du défaut C-20.

**Antériorité du branchement, ligne à ligne.** Vérifiée sur `:654-660` :
```
654  // The LLM boundary supplies escaped live state, not a raw/stale goal hint.
655  const nextPrompt =
656    compacting.prompt ??
657    buildPrompt({
658      previousSummary,
659      context: jevChecklist ? [...compacting.context, jevChecklist] : compacting.context,
660    })
```
L'affirmation est exacte. `nextPrompt` est le point de jonction des **deux** voies : la voie
`compacting.prompt` court-circuite `buildPrompt` à `:656`, la voie `buildPrompt` s'exécute à
`:657-660`. Une injection placée **après** `:660` — renommage `resolvedPrompt`, puis
concaténation de `formatGoalContext` — est donc postérieure aux deux, et le bloc est présent
sur les deux voies **par construction**, non par cas particulier. `buildPrompt` garde sa
signature (`:184-199`), donc la voie B n'est pas affectée. T4c couvre la voie
`compacting.prompt` et n'est pas redondant avec T4. L'affirmation de branchement est vérifiée.

**Le verrou `DETAIL_BUDGET_CHARS` tient-il ? Oui.** La tension décrite était réelle : deux
appels sur un même budget rendent 1 600 caractères pour 800 annoncés. §9 point 3 (lignes
996-998) la résout par **fusion** — findings non-`open` et lacunes dans une liste unique
pré-triée, **un seul site d'appel** — parce qu'un budget partagé à `spent` local n'est pas
exprimable. T1.4 (lignes 869-872) verrouille l'invariant sur la **longueur totale du palier**,
pas sur le nombre de lignes : « avec 40 findings non-`open` et 40 lacunes, la longueur totale
du palier de détail est inférieure à `DETAIL_BUDGET_CHARS + longueur du marqueur ». Une
implémentation à deux appels produirait 1 600 rendues pour 800 annoncées et **violerait cette
assertion**. « Sans cette assertion, une implémentation à deux appels sur le même budget
passerait les trois premières » est exact. Verrou effectif, aucun double comptage résiduel.

**Les trois chaînes absentes le sont bien.** Sur la proposition entière :
`session/goal-contract` → **aucun fichier** ; `22 appelants|deux fichiers|2 fichiers` →
**aucun fichier**. Glob `**/goal*.ts` sous `packages/opencode` → 11 fichiers, dont
`src/tool/goal-contract.ts` et `src/session/goal-evidence.ts`, **aucun**
`src/session/goal-contract.ts`. Le fichier fantôme du cycle 1 n'existe pas et la proposition
ne le mentionne plus.

## Remaining objections

Quatre résidus étaient déclarés en `unverified` §9. **Aucun n'est `open`.** Trois l'ont été
**dischargés par exécution** pendant cette revalidation ; un est une réserve bornée et tracée.

**F1 — divergence 1 200 assumée et motivée — `accepted`.**
Le cycle 1 recommandait 1 100 ; le cycle 2 retient 1 200 et diverge explicitement (§5 vii,
§9 point 1). **J'ai mesuré le raisonnement : il est juste, et l'argument est plus fort que
ce que le cycle 2 énonce.** Le pire cas corrigé mesure 4 402 caractères, soit
`Token.estimate` = **1 101 tokens** : **1 100 est infeasible**, et pas « pile à la limite »
comme l'écrivait le cycle 2. Et 1 200 laisse **398 caractères de marge**, le chiffre annoncé à
± 1. La divergence est un **choix mesuré**, pas une préférence : elle est assumée, motivée et
tracée, donc `accepted` — elle ne bloque pas. **J'entérine le cycle 2.**

**F2 — longueurs de marqueur comptées à la main — `refused` (prémisse réfutée).**
Une longueur vérifiée par exécution n'est plus un `INFERE`. J'ai exécuté la mesure (§9
proposait la commande ; elle n'avait jamais été lancée) — `bun -e`, `BUN_EXIT=0` :

| grandeur | annoncé (main) | **mesuré** | écart |
| --- | --- | --- | --- |
| ligne `open` dégradée | — | **67** car. | — |
| marqueur `open`, 45 findings | ≈ 197 | **196** car. | −1 |
| marqueur `open`, 1 000 findings | ≈ 197 | **199** car. | +2 |
| marqueur de détail, ids `SEC-*` | ≈ 129 | **131** car. | +2 |
| marqueur de détail, ids `UNVERIFIED-*` | ≈ 129 | **161** car. | **+32** |

| pire cas corrigé | annoncé | **mesuré** |
| --- | --- | --- |
| ids `SEC-*` | 4 401 car. = 1 100 tok. exactement | **4 402 car. = 1 101 tok.** |
| ids `UNVERIFIED-*` | non chiffré | **4 432 car. = 1 108 tok.** |
| marge à 1 200 (plafond 4 800) | ≈ 399 car. | **398** car. (`SEC-*`) / **368** car. (`UNVERIFIED-*`) |

`1100_FEASIBLE=false`, `1200_FEASIBLE=true`. **Le raisonnement du cycle 2 est confirmé.** Le
comptage manuel était légèrement optimiste — de 1 caractère sur le pire cas `SEC-*`, de 32 sur
la variante `UNVERIFIED-*` — ce qui **renforce** la démonstration contre 1 100 au lieu de
l'affaiblir. Deux précisions d'honnêteté : `Token.estimate` vaut
`Math.max(0, Math.round(len / 4))` (`util/token.ts:1-4`), donc 4 402 → **1 101**, pas 1 100 ;
et la variante `UNVERIFIED-*`, plus longue, n'avait pas été envisagée — elle reste sous 4 800.
Le §9 affirmait « aucune décision ne dépend d'elles au-delà du choix de marge » : c'est exact,
et la marge est désormais **mesurée**, pas supposée. F2 n'est plus un résidu.

**F3 — forme du stub `Plugin.Service` pour T4c — `refused` (prémisse réfutée).**
Protocole §9 exécuté (`rg 'trigger' src/plugin/index.ts`, `EXIT1=0`) :
```
plugin/index.ts:55   readonly trigger: <
plugin/index.ts:378  const trigger = Effect.fn("Plugin.trigger")(function* <
plugin/index.ts:441  return Service.of({ trigger, list, init, reload, version })
```
Surtout, la couture de test **existe déjà** dans le fichier cible :
```
compaction.test.ts:260  plugin?: Layer.Layer<Plugin.Service>
compaction.test.ts:287  Layer.provide(options?.plugin ?? Plugin.defaultLayer)
compaction.test.ts:357  function plugin(ready: Deferred.Deferred<void>)
compaction.test.ts:1412 withCompaction({ plugin: autocontinue(false) })
compaction.test.ts:1575 }).pipe(withCompaction({ plugin: plugin(ready) }))
```
T4c n'a donc **aucune forme de stub à découvrir** : le helper `plugin(ready)` et l'option
`plugin?:` sont déjà là, déjà exercés. Le résidu ne décrit aucun travail restant.

**F4 — rayon de casse non fermé — `accepted`, et borné.**
Un `F4` « rayon ouvert » est un `open` tant qu'il n'est pas borné. Je l'ai borné en exécutant le
protocole que la proposition s'était fixé (§9, lignes 1009-1017), puis en l'étendant à la
surface que le patch touche réellement.

1. `rg '## DoD|## Findings|SUMMARY_TEMPLATE'` sur tout `packages/opencode` → **2 hits** :
   `compaction.ts:55` (déclaration) et `:196` (usage). Aucun test n'asserte sur ces titres ;
   `SUMMARY_TEMPLATE` étendu à `packages` + `docs` ne remonte que `:55`, `:196` et de la prose.
   Le protocole demandait de vérifier que chaque hit est `compaction.ts:55`/`:196` ou une
   assertion additive : **condition satisfaite, la liste est complète et vide du reste.**
2. `rg 'Progress|ensureSection|normalize|replace\(|template'` sur `compaction.ts` → `:55`,
   `:56`, `:63`, `:67`, `:84`, `:116`, **tous dans `:40-200`**. **Zéro hit hors des plages
   déclarées** (`:40-200`, `:460-600`, `:640-768`). Aucun post-traitement de la sortie du
   résumeur n'existe : la claim « persisté verbatim » de T4b tient.
3. Extension que le protocole ne couvrait pas — l'injection pouvait **inverser** une assertion
   négative existante. Toutes les assertions `captured` de `compaction.test.ts` relevées
   (`:1289`, `:1325-1326`, `:1370-1371`, `:1684-1687`, `:1725-1729`) sont soit des
   `toContain` sur la queue, soit des `not.toContain` sur du contenu **élagué** (`keep tail`,
   `keep this turn`, `and this one too`, `What did we do so far?`). **Aucune n'est un
   `not.toContain("<task-contract")`.** Le rayon de casse de l'injection est **vide, compté**,
   pas supposé.

Le rayon est borné, et la borne est un compte. Le constat du cycle 1 — « cinq comptes `rg`
supprimés » — reste **juste** : le cycle 2 n'en fournit aucun ; c'est cette revalidation qui
en fournit. D'où `accepted` et non `refused` : la critique était fondée, elle a été tracée
comme telle, puis la lacune comblée par mesure. Elle ne bloque pas.

**Réserves restantes, tracées et non bloquantes** (héritées du §9, hors des quatre résidus) :
- l'obéissance du résumeur au gabarit — **aucun test à stub ne la prouve** ; la proposition
  le dit (§7 :849-857) et donne un protocole manuel ;
- les 273 / 415 caractères par ligne du tableau §6 (lignes 718, 721) restent comptés à la main.
  Ils sont **présentatifs** — ils chiffrent l'amélioration, pas le plafond, et le plafond est
  mesuré ;
- la mesure terrain « 5 compactions, 2,7 minutes » n'est pas reproductible par une commande de
  ce dépôt ; aucun chiffre du §6 n'en dépend seul.

## Regressions introduced

**Aucun test vert n'est cassé** — énoncé explicitement, comme l'exige la règle 1 du gabarit.

| suite | état | pourquoi le patch ne la casse pas |
| --- | --- | --- |
| `src/session/goal-context.test.ts` | vert | fixture à **1** finding et **1** lacune, très sous tout budget ; `SUMMARY:` / `FINDING` / `UNVERIFIED:` inchangés (§4.2 :361-367) |
| `test/session/compaction.test.ts` | 61 pass / 2 fail (baseline **C-40**) | aucune assertion `captured` n'est un `not.toContain("<task-contract")` (relevé exhaustif ci-dessus) ; les titres ajoutés s'ajoutent après les sections existantes, les `toContain` existants restent vrais |
| `test/session/context-budget.test.ts` | vert | le prompt de compaction part en **message utilisateur** avec `system: []`, pas en prompt système : `stats.systemTotal` (`:414`) n'est pas mesuré par ce patch |
| `test/session/prompt.test.ts:910`, `:1193` | vert | ils portent sur le contrat du **prompt principal**, dont l'injection (`prompt.ts:2381-2386`) est **préexistante** et non touchée |
| `test/session/overflow.test.ts` | 8/8 vert | fichier non concerné |
| `test/tool/goal-contract.test.ts` (T5) | vert | aucun fichier de `src/tool/` modifié ; le refus de clôture `:624` reste identique |

**Les 2 échecs préexistants ne sont pas aggravés** : le patch n'ajoute que des tests et ne
touche pas le code que ces deux-là exercent. Ils restent rouges **dans la baseline**, pas à
cause de ce patch — et la règle 1 vise précisément le cas inverse (« un test déjà rouge qui
casse davantage reste un `open` »), qui ne se produit pas.

Porte de type distincte : le patch ne modifie aucun type ni signature, donc `bun typecheck`
sortant en `0` avec `test/session/compaction.test.ts` non modifié est la preuve statique de
« aucun appelant touché ». État de mesure fourni : `TYPECHECK_EXIT=0` (16 s, bun 1.4.2) —
**C-46**. Je n'ai pas rejoué la suite : n'ayant écrit aucun code, la baseline est inchangée par
construction, et mes jugements reposent sur mes propres mesures.

## Final verdict

REVALIDATED-PASS_WITH_CHANGES

Implémentable : **aucun** résidu n'est `open`. Les six `Required changes` du verdict d'origine
sont traités, RC6 **intégralement** (contre `partiel` au cycle 1). Le test de condition est
reconstruit et **discrimine** — preuve structurelle, pas analogie. Le branchement
`compacting.prompt` est vérifié ligne à ligne. Le verrou `DETAIL_BUDGET_CHARS` tient contre
l'implémentation à deux appels qu'il doit empêcher. La divergence 1 200 est **entérinée** :
mesurée, elle est nécessaire — 1 100 est infeasible à 4 402 caractères.

La variante « sans réserve » serait excessive : des réserves réelles subsistent (obéissance
du résumeur non prouvable par stub, tableau §6 non mesuré, mesure terrain non reproductible),
tracées et assumées. La variante « échec » serait fausse : aucun `Required change` n'est
intact.

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| Palier `open` borné + `OPEN_OVERFLOW_MAX_LINES = 25` + marqueur exact | S | `packages/opencode/src/session/compaction.ts` | T1.1-T1.3 dans `src/session/goal-context.test.ts` | aucun — fixture unique, très sous budget |
| Tri du palier `open` : priorité + clé de départ | S | `packages/opencode/src/session/compaction.ts` | T2 dans `src/session/goal-context.test.ts` | aucun — aucun ordre n'est aujourd'hui asserté sur plus d'un finding |
| Fusion du palier de détail (un seul site d'appel) | S | `packages/opencode/src/session/compaction.ts` | T1.4 — invariant de budget fusionné | aucun — aucun test n'asserte sur le palier de détail |
| Plafond gelé T3, auto-suffisant | S | `packages/opencode/src/session/goal-context.test.ts` | T3 — `Token.estimate("x".repeat(4_800))` | aucun — test nouveau |
| Injection `<task-contract>` après résolution du prompt (2 voies) | S | `packages/opencode/src/session/compaction.ts` | T4 (voie `buildPrompt`), T4c (voie `compacting.prompt`) | relire `test/session/compaction.test.ts` `:1289`, `:1325-1326`, `:1370-1371`, `:1684-1687`, `:1725-1729` — aucune assertion négative sur `<task-contract`, donc aucun |
| Gabarit `## DoD` / `## Findings` au résumeur + persistance | S | `packages/opencode/src/session/compaction.ts` | T4b — le résumé entre verbatim dans le transcript | relire `:1725-1729` (`toContain("## Progress")` etc.) — ajout de titres, les assertions existantes restent vraies |
| Non-régression de la barrière de clôture | S | aucun (aucun fichier de `src/tool/` modifié) | T5 — suite `goal-contract.test.ts` verte | aucun |