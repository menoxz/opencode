# Verdict de validation — H7

## Proposal

`H7` — Dédupliquer les injections de contexte par tour. Fiche validée : `docs/releases/v2.4.0/items/H7.md` (255 lignes).

## Validator

Agent indépendant : n'a ni rédigé ni relu la fiche avant de l'auditer. Aucun fichier source
modifié ; seules des lectures et des `grep` ont été exécutés.

## Status

`PASS_WITH_CHANGES`

La direction est bonne : il existe réellement des recouvrements à supprimer — le contrat
objectif/DoD est rendu **deux fois** (`<task-contract>` *et* `<working-state>`) et deux capsules de
réutilisation se chevauchent. La DoD « objectif et DoD présents **exactement une fois** » est sans
ambiguïté et c'est le bon critère de non-perte. Mais trois défauts de fait/méthode interdisent
`PASS` : (a) le comptage central « objectif 3× » est **faux** — le `<goal_reminder>` ne porte pas
l'objectif, la fiche se contredit avec sa propre citation (O1) ; (b) la surface `<working-state>`
n'est pas poussée là où la fiche le dit (O2) ; (c) le critère §7 s'ancre sur un test qui ne mesure
pas la grandeur visée (O3).

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok — 10/10 | `prompt.ts:2406-2412` = bloc `<task-contract>` (l.2407 garde `!system.some((entry) => entry.includes("<task-contract"))`, l.2412 `volatile.push(goalCtx)`) ; `prompt.ts:2475-2502` = bloc `<goal_reminder>` (début 2475, fin réelle 2504) ; `working-state.ts:53-65` = `return [` … `` `goal: ${quote(goal?.goal ?? "", 900)}` `` … `` `dod: ${list(goal?.dod ?? [], 2000)}` `` … `"</working-state>"` (l.60-61) ; `prompt.ts:2330-2332` ; `prompt.ts:2468` ; `holdings-capsule.ts:37-42` ; `context-ledger.ts:561-564` ; `instruction.ts:264-300`, `:310-354`, `:329`. Aucun numéro décalé |
| le correctif supprime bien la cause racine | partiel | la cause réelle = double surface du **contrat** (`<task-contract>` vs `<working-state>`) + deux capsules redondantes : bien visée. Mais §4 cible aussi une copie de l'objectif dans le `<goal_reminder>` qui **n'existe pas** (O1) |
| le critère §7 est ABSOLU et MONOTONE / dérivé de la baseline | KO sur l'instrument | §7.1 est bien formulé (deux valeurs **absolues** comparées, « jamais un ratio dont le dénominateur serait ce que le patch fait baisser »). Mais **non mesurable par la commande citée** : `src/session/prompt-budget.test.ts` n'asserte que `tokens(PROMPT_CORE) < 1600` (l.48) et la taille du catalogue de skills (`< 3000` l.58, `< 2500` l.63) — il n'assemble aucun tour, ne mesure ni « préfixe + queue », ni objectif/DoD, ni capsules (O3) |
| les tests §8 sont exécutables ici | oui, mais §8.6 inopérant | `test/session/context-dedup.test.ts` : chemin et convention valides (le dossier `test/session/` existe). §8.6 ré-ancre sur `prompt-budget.test.ts`, donc ne peut pas observer `bytes_after < bytes_baseline` sans étendre ce test (O3) |
| les régressions potentielles sont nommées et réelles | KO — lacune majeure | les fichiers nommés existent, mais les tests **directement** touchés sont omis : `src/session/holdings-capsule.test.ts` (module **supprimé**), `src/session/context-ledger.test.ts`, `test/session/working-state.test.ts`, `test/session/working-state-runtime.test.ts`, `test/session/working-state-goal-dod.test.ts`, `src/session/goal-context.test.ts`, `test/session/instruction.test.ts` (O4) |
| les `INFERE:` sont dûment marqués avec méthode | marqués, mais conclusion fausse | §2 marque `INFERE:` « objectif 3×, DoD 2× » **avec** méthode (« compter les occurrences dans le turn »). La méthode est bonne ; la conclusion « objectif 3× » est réfutée par la plage citée elle-même (O1) |
| l'effort §9 est réaliste | sous-évalué | `S` annoncé ; or le patch touche `prompt.ts`, `working-state.ts`, la **suppression** de `holdings-capsule.ts` (+ son test), `context-ledger.ts`, `instruction.ts`, et — pour rendre le critère observable — `prompt-budget.test.ts` plus un nouveau test. Plausiblement `M` (O5) |

## Objections

### O1 — CRITIQUE. Le comptage « objectif injecté 3× » est faux ; le `<goal_reminder>` ne porte pas l'objectif

La fiche (§2, l.100-103) affirme : « l'objectif est donc injecté **3×** (task-contract +
goal_reminder + working-state) ». C'est démenti par la plage même qu'elle cite,
`prompt.ts:2475-2502`. Le texte du rappel est construit l.2488-2498 :

```
const goalReminderText = [
    "<goal_reminder>",
    "- Compare the user's latest message with the current objective before acting.",
    … 5 lignes de consigne de cycle de vie …,
    "</goal_reminder>",
    qaAdvisory,
    riskAdvisory,
].filter(Boolean).join("\n") + "\n"
```

Aucun `goalState.goal`, aucun `goalState.dod` : le `<goal_reminder>` est **purement procédural**.
Le compte réel est donc : objectif **2×** (`<task-contract>` via `formatGoalContext` + le champ
`goal:` de `<working-state>`) et DoD **2×** (`<task-contract>` + `dod:` de `<working-state>`).
Conséquence : le levier §4 « faire que `<goal_reminder>` ne réinjecte plus l'objectif » corrige une
copie **inexistante** ; présenté comme un des trois axes, c'est un no-op. La ligne 117 (« les étapes
3, 5 et 6 transportent le même contrat sous trois formes ») est fausse de la même façon.

**Ce qu'il faut changer** : rectifier le comptage (« objectif 2×, DoD 2× ») ; retirer du §4 la
déduplication du `<goal_reminder>` (il n'y a rien à y retirer) — ou la reformuler explicitement
comme non-action (« conserver le rappel procédural tel quel, il ne duplique rien ») — et corriger
§2 `INFERE:`, §3 et l'axe concerné.

### O2 — MAJEUR. La surface `<working-state>` est mal localisée : elle n'est pas poussée par `prompt.ts`

La fiche (§3 étape 6 ; §4 code cible l.157) place `<working-state>` dans la liste `volatile` de
`prompt.ts`. Faux. Un `grep` de `working-state|WorkingState|workingState` sur `src/session/*.ts`
**ne trouve aucune occurrence dans `prompt.ts`** : la carte est injectée par `llm.ts:169`
(`workingState: yield* WorkingState.current(...)`) puis attachée par `llm/request.ts:293-298`
(`WorkingState.attach(messages, injectedTail)`), c'est-à-dire dans la **queue** de la requête LLM.
Le code cible §4 `workingStateRender({ …, includeContract })` invoque une fonction qui n'existe pas
(`working-state.ts` expose `render(input)` / `current(...)`) et suppose un appel depuis `prompt.ts`
qui n'a pas lieu.

**Ce qu'il faut changer** : réécrire §3/§4 pour le vrai point d'injection (`WorkingState.current`
→ `WorkingState.attach`) et faire porter le paramètre `includeContract` (ou équivalent) jusqu'à
`working-state.ts` / `llm/request.ts`. Sans cela, la moitié « working-state » du correctif ne
s'applique pas où la fiche l'écrit.

### O3 — MAJEUR. Le critère §7 s'ancre sur un test qui ne mesure pas la grandeur visée

§7 impose « sur le tour de référence de `prompt-budget.test.ts`, le `(préfixe + queue)` **baisse**
des octets des copies redondantes », avec la commande
`bun test --timeout 30000 ./src/session/prompt-budget.test.ts`. Or ce fichier (79 lignes)
**n'assemble aucun tour** : il mesure `tokens(PROMPT_CORE)` (core.txt) et la taille du catalogue de
skills. Il ne contient ni « préfixe + queue », ni `task-contract`, ni `working-state`, ni capsules.
Le critère est donc **non observable** par l'instrument cité.

**Ce qu'il faut changer** : soit déclarer que `prompt-budget.test.ts` doit être **étendu** pour
assembler le tour et rendre `bytes_baseline`/`bytes_after` observables (valeur plancher recalibrée
dans le même changeset), soit déporter la mesure octets dans `context-dedup.test.ts`. En l'état,
« commande de mesure » et « valeur attendue » ne peuvent pas être exécutées. Le BACKLOG désigne
lui aussi `prompt-budget.test.ts`, mais l'extension incombe à la fiche.

### O4 — MAJEUR. Tests menacés réels non nommés (dont le test du module supprimé)

§6 nomme `prompt-budget.test.ts`, `test/tool/goal-contract.test.ts`, `test/tool/registry.test.ts`,
`test/tool/parameters.test.ts`, `test/session/*`. Il omet les tests **directement** menacés :

- `packages/opencode/src/session/holdings-capsule.test.ts` — teste `contextHoldingsCapsule`, que
  §4 **supprime** : il cassera au build. C'est la régression la plus certaine.
- `packages/opencode/src/session/context-ledger.test.ts` — asserte `contextCapsule`/`buildCapsule`
  (l.197, 209, 226), que §4 modifie.
- `packages/opencode/test/session/working-state.test.ts`,
  `packages/opencode/test/session/working-state-runtime.test.ts`,
  `packages/opencode/test/session/working-state-goal-dod.test.ts` — la carte `render` change de
  signature.
- `packages/opencode/src/session/goal-context.test.ts` (formatage du contrat) et
  `packages/opencode/test/session/instruction.test.ts` (garde anti-double `AGENTS.md`).

**Ce qu'il faut changer** : nommer ces fichiers dans §6 et les ajouter à la régression §8 ; en
particulier trancher le sort de `holdings-capsule.test.ts` (migration de ses cas vers
`context-ledger.test.ts` si le module disparaît).

### O5 — MINEUR. Effort sous-évalué ; §8.6 repose sur l'instrument invalide

`S` (l.244) est optimiste : suppression d'un module et de son test, changement de signature de
`render`, re-câblage `working-state` côté `llm.ts`/`request.ts`, recalibration de
`prompt-budget.test.ts`, nouveau test — c'est un `M`. Et §8.6 (« `prompt-budget` recalculé :
`bytes_after < bytes_baseline` ») hérite du défaut O3.

**Ce qu'il faut changer** : relever l'effort à `M` ; après correction de O3, aligner §8.6 sur
l'instrument réellement retenu.

## Required changes

1. **Rectifier le comptage** (O1) : objectif 2×, DoD 2× ; le `<goal_reminder>` est procédural et ne
   duplique ni objectif ni DoD — retirer la déduplication du `<goal_reminder>` de §4 (ou la
   reformuler comme non-action) et corriger §2 `INFERE:`, §3 et l'axe correspondant.
2. **Re-localiser `<working-state>`** (O2) : la surface est injectée par `WorkingState.current`
   (`llm.ts:169`) + `WorkingState.attach` (`llm/request.ts:298`), pas par `volatile` de
   `prompt.ts` ; réécrire §3/§4 et le code cible en conséquence.
3. **Rendre le critère §7 mesurable** (O3) : étendre `prompt-budget.test.ts` pour assembler le tour
   (préfixe + queue), ou déporter la mesure dans `context-dedup.test.ts` ; figer `bytes_baseline`
   et le plancher dans le même changeset.
4. **Nommer les tests réellement menacés** (O4) — dont `holdings-capsule.test.ts`,
   `context-ledger.test.ts`, `working-state*.test.ts`, `goal-context.test.ts`,
   `instruction.test.ts` — et les ajouter à la régression §8.
5. **Effort → `M`** (O5).
6. **Trancher §10** (« où s'arrête la dédup ? ») : forme finale du `<goal_reminder>` (⇒ le garder
   tel quel, cf. O1) et sort de `holdings-capsule.ts` (suppression + migration de ses cas de test).

## Implementation guidance

Ordre : (1) écrire d'abord le test d'**unicité** (`context-dedup.test.ts`, cas 1/2/3/4) contre le
tour assemblé — c'est lui qui prouve la non-perte, et il doit **échouer** avant le patch ;
(2) supprimer la copie du contrat dans `<working-state>` en interceptant au **vrai** point
(`WorkingState.current`/`attach`), puis migrer `holdings-capsule.test.ts` vers le ledger **avant**
de supprimer `holdings-capsule.ts` ; (3) recalibrer `prompt-budget.test.ts` (ou porter la mesure
dans le nouveau test) ; (4) relancer `goal-contract`, `registry`, `parameters`, `working-state*`,
`context-ledger`, `instruction`, `goal-context`, `prompt-budget`. Pièges : ne jamais supprimer un
garde `!system.some(<…>)` en croyant dédupliquer (§6) ; vérifier qu'un `AGENTS.md` déjà injecté en
**système** n'est pas réattaché par la remontée `instruction.ts:310+` (le garde `sys.has(found)`
l.329 est le point à instrumenter, cf. §8.5) ; mesurer les octets réels en **différence de valeurs
absolues**, jamais un ratio dont le dénominateur serait ce que le patch fait baisser.
