# Verdict de validation — H3

## Proposal
`H3` — Retirer les éléments volatils du segment système mis en cache. Fiche validée : `docs/releases/v2.4.0/items/H3.md` (294 lignes).

## Validator
Agent indépendant : n'a ni rédigé ni relu la fiche avant de l'auditer. Aucun fichier source
modifié ; seules des lectures et des `grep` ont été exécutés.

## Status
`PASS_WITH_CHANGES`
Le diagnostic est exact et vérifié : `env.runtime` (qui porte la date, `system.ts:144`) **et**
`unavailableLine` (qui porte l'état MCP, `prompt.ts:2307-2314`) sont poussés dans `system`
(`prompt.ts:2323-2324`), donc dans le préfixe caché, alors que le commentaire du code
(`prompt.ts:2258-2264`) interdit exactement cela. Le critère §7 est le bon : une **identité
d'octets** (`diff_bytes(system_A, system_B) === 0`, « égalité stricte, pas un seuil »), plus deux
gardes absolues (comptes exacts, et `diff_bytes > 0` sur changement d'instruction) — aucun ratio à
dénominateur réduit. Deux défauts de méthode, tous deux corrigeables, empêchent le `PASS` : le test
d'invariant existant n'est pas nommé, et le §8 suppose un assembleur qui n'existe pas.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok — 13/13 | `session/system.ts:136-146` (bloc `runtime`, date `:144`, `join` `:146`), `:149` (`stable: ""`) ; `session/prompt.ts:2307-2314` (`mcpReadiness` + `unavailableLine`), `:2323-2324` (les deux `system.push`), `:2258-2264` (le commentaire), `:2552-2568` (`injected` + `messages`), `:2241` (`contextSummary.add("env", …, [env.stable, env.runtime]`), `:2360-2362` (section `env` de `contextSections`), `:2332` (capsule `holdings`) ; `provider/transform.ts:359-366` (commentaire du breakpoint), `:367-421` (`applyCaching`) ; `test/provider/cache-anchor.test.ts:103-114` ; `test/session/cache-prefix.test.ts:113` (`firstChangedSection: "system"`) ; `src/session/unavailable-tools.ts:16` — toutes relues et conformes |
| le correctif supprime bien la cause racine | ok | cause BACKLOG = « date + état MCP dans le préfixe système » ; le patch **déplace** exactement ces deux éléments de `system` vers `volatile` (`prompt.ts:2545-2552` : `volatile` est ajouté après l'historique, hors préfixe). Aucun contenu supprimé, position seule changée |
| le critère §7 est ABSOLU et MONOTONE | ok | §7.1 = égalité d'octets stricte (`diff_bytes === 0`), §7.2 = comptes exacts (`count === 1`), §7.3 = `diff_bytes > 0` sur changement d'instruction (garde anti-élargissement). Que des comptes/égalités absolus ; le critère réussit **dans le bon sens** quand le patch agit (le piège O1 de `P19-verdict.md` est évité et le test d'identité est bien formulé comme attendu) |
| les tests §8 sont exécutables ici | ok, réserve | `packages/opencode/test/session/` existe ; le chemin `system-prefix-stability.test.ts` est cohérent. Réserve : le §8 suppose un « assembleur du segment `system` » qui **n'existe pas** comme fonction (voir O2) ; l'exécution exige de piloter la boucle |
| les régressions potentielles sont nommées et réelles | partiel | `cache-prefix.test.ts`, `cache-anchor.test.ts`, `system.test.ts`, `src/session/unavailable-tools.test.ts`, `src/session/environment.test.ts`, `src/session/prompt-budget.test.ts`, `test/session/context-budget.test.ts` existent tous (vérifié). **Manque** `test/session/prompt.test.ts` : le test d'invariant directement concerné (voir O1) |
| les `INFERE:` sont dûment marqués avec méthode | ok | §2 `INFERE:` (H3.md:120-126) : caractère intermittent (minuit, flap MCP) + méthode (hash du segment `system` par step, ou lecture de `firstChangedSection` du `CachePrefix`, corrélation avec une chute `cached_tokens`). Honnête et borné |
| l'effort §9 est réaliste | ok | `S` justifié : deux `push` + un champ de retour ; coût réel = recalibration budget + test par mutation |

## Objections

### O1 — MAJEUR. Le test d'invariant existant `prompt.test.ts:1154-1196` n'est ni nommé ni étendu

`packages/opencode/test/session/prompt.test.ts:1154` définit
`it.instance("keeps volatile harness blocks out of the cached system segment", …)`. C'est **exactement**
l'invariant que H3 corrige : il pilote `prompt.loop` (lignes 1165-1173), lit le segment caché
(`messages.filter((message) => message.role === "system")`, `:1187`), vérifie un contrôle positif
(`system.length > 1000`, `:1189`) puis affirme qu'aucun marqueur volatile ne s'y trouve —
`["<working-state", "<task-contract", "<goal_reminder", "<context_slots", "<environment_state", "<progress_state"]` (`:1175-1182`, `:1190`).
C'est le lieu naturel pour verrouiller « la date et la ligne MCP ne sont pas dans le segment caché »
et pour héberger le test par mutation du §8.2. Ni le §6 (qui liste pourtant sept fichiers de test)
ni le §8 ne le mentionnent.

**Ce qu'il faut changer** : citer `prompt.test.ts:1154-1196` en §6/§8 et y ajouter `Today's date` et
`<unavailable_tools` à la liste d'exclusion `volatile` (le test passera sans modification après le
patch, mais la garantie doit y être écrite, pas rejouée en parallèle).

### O2 — MAJEUR. Le §8 suppose un assembleur du segment `system` qui n'existe pas comme fonction exportée

Le tableau `system` est construit **en ligne** dans la boucle de prompt : `prompt.ts:2258`
(`const system: string[] = []`) … `:2323-2341` (`system.push(...)`, `if (skills) system.push(skills)`).
Les exports réels de `prompt.ts` sont `formatLearningsSection`, `reachedStepLimit`, `Interface`,
`Service`, `layer`, `defaultLayer`, `PromptInput`, `LoopInput`, `ShellInput`, `CommandInput`,
`createStructuredOutputTool`, `unreadableImages`, `SessionPrompt` — **aucun `assembleSystem`**. Or le
§8 cas 1/2/4 parle d'« assembler `system` deux fois » et de « réinjecter la ligne de date dans le
`system` ». En outre, simuler `mcp.readiness = { memory: false }` (§8 cas 1) suppose un
`Layer.mock` du service MCP, non décrit. La faisabilité existe (précédent : `prompt.test.ts:1154`
pilote `prompt.loop` et lit le corps HTTP), mais elle n'est pas spécifiée.

**Ce qu'il faut changer** : préciser le harnais — soit extraire un assembleur pur testable, soit
piloter `it.instance` + `Layer.mock(McpService, { readiness })` et lire
`hit.body.messages.filter(role === "system")` — et nommer le point de lecture.

### O3 — MINEUR. Le breakpoint est cité par son commentaire, pas par son code

H3.md:140 cite `transform.ts:361` pour « le breakpoint qui ferme le segment système ». `:361` est une
ligne de commentaire ; le code qui ferme réellement le préfixe système est `transform.ts:371`
(`const system = cached.filter((msg) => msg.role === "system").slice(-1)`), dans `applyCaching`
(`:367-421`). Citer le code.

### O4 — MINEUR. La recalibration de budget est annoncée mais non chiffrée

§6/§9 disent que `prompt-budget.test.ts` / `context-budget.test.ts` doivent être « recalibrés » sans
donner la cible. Le changement étant un déplacement pur, la cible est déterminable : `system` décroît
exactement de `len(ligne de date)` (et de `len(unavailableLine)` le cas échéant), `volatile` croît
d'autant. Le dire, pour que la recalibration ne devienne pas un ajustement à l'aveugle.

## Required changes

1. **Citer et étendre `test/session/prompt.test.ts:1154-1196`** (ajouter `Today's date` et
   `<unavailable_tools` à la liste `volatile`), dans §6 et §8.
2. **Spécifier le harnais du §8** : assembleur extrait **ou** `it.instance` + `Layer.mock` du service
   MCP pour piloter `readiness`, avec le point de lecture du segment `system`.
3. **Citer `transform.ts:371`** (le code), pas `:361` (le commentaire).
4. **Chiffrer la recalibration** des budgets (delta = octets déplacés).

## Implementation guidance

Ordre : (1) `system.ts` — `environment()` retire la ligne de date de `runtime` et expose un champ
`volatile` (`runtime` reste stable, `<env>` reste intact) ; (2) `prompt.ts` — retirer
`unavailableLine` du `system.push` (`:2323`) et pousser `env.volatile` + `unavailableLine` dans
`volatile` (près de `:2332`) ; (3) mettre à jour les porteurs `:2241` et `:2360-2362` ; (4) étendre
`prompt.test.ts` ; (5) recalibrer `prompt-budget.test.ts` / `context-budget.test.ts`.

Pièges : garder `env.runtime` et `instructions` dans `system` — ne pas sur-déplacer, sinon la garde
§7.3 (« un changement d'instruction doit invalider `system` ») deviendrait vide. Ne pas toucher
`unavailable-tools.ts` (constructeur de ligne, déplacement en amont) ni `src/session/environment.test.ts`
(module distinct). Les deux carriers `:2241` / `:2360-2362` doivent refléter le nouveau découpage.

Tests à ne pas oublier (depuis `packages/opencode`) :
`bun test --timeout 30000 ./test/session/system-prefix-stability.test.ts ./test/session/prompt.test.ts ./test/session/cache-prefix.test.ts ./test/provider/cache-anchor.test.ts ./test/session/system.test.ts ./test/session/context-budget.test.ts`
