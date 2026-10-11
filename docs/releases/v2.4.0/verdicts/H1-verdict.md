# Verdict de validation — H1

## Proposal

`H1` — Un seul appel provider par round d'outils. Fiche validée : `docs/releases/v2.4.0/items/H1.md` (251 lignes).

## Validator

Agent indépendant : n'a ni rédigé ni relu la fiche avant de l'auditer. Aucun fichier source
modifié ; seules des lectures et des `grep` ont été exécutés.

## Status

`PASS_WITH_CHANGES`

Le diagnostic est exact et vérifié au niveau des octets : `llm.ts:367` ouvre `streamText({…})` sans
passer `stopWhen`, et le SDK `ai@6.0.168` retombe bien sur `stopWhen = stepCountIs(1)` (`index.js:4122`,
et `:6459` pour la seconde variante `streamText`, les deux vérifiées verbatim). En outre les outils
portent un `execute` réel (`tools.ts:497` `yield* item.execute(inputArgs, ctx)` dans l'enveloppe construite
`:579`), donc la continuation multi-step native du SDK exécute effectivement les outils — la direction du
correctif supprime la cause racine.
Le statut n'est pas `PASS` pour un défaut bloquant, corrigeable dans le document : le « Code cible » du §4
référence deux champs qui **n'existent pas** (`input.maxSteps`, `handle.message.steps`) et ne compilerait
pas tel quel.
Le critère §7 est conforme à la leçon P19/O1 : **entièrement absolu et monotone**, sans aucun ratio à
dénominateur réduit par le patch.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok, 2 légers décalages | `llm.ts:367` = `const result = streamText({` ; `:400-407` verbatim (activeTools/tools/toolChoice/maxOutputTokens/abortSignal/headers/maxRetries/messages) ; `:167`, `:514-522`, `:523-529` verbatim ; `processor.ts:963`, `:972`, `:976`, `:978-982`, `:1001`, `:679`, `:706`, `:729-730` verbatim ; `ai-sdk.ts:74-80`, `prompt.ts:1758`, `:1933`, `:2559`, `:2083`, `:320-321`, `:2084`, `:2655`, `:1916`, `:2552-2553`, `retry.ts` n/a, `turn-plan.ts:200/:210`, `stall-watch.ts:20`, `continuation.ts:5/:61`, `session.ts:426`, `session.sql.ts:48` verbatim ; SDK `index.js:4122` et `:6459` = `stopWhen = stepCountIs(1),`. Décalages : §2 cite `llm.ts:216-221` mais le bloc cité se termine `:222` ; §4.1 situe `decideRunDecision` à `prompt.ts:1908-1916` alors que l'appel commence `:1903` |
| le correctif supprime bien la cause racine | ok | `llm.ts:367` `streamText({…})` ne passe ni `stopWhen` ni `maxSteps` (grep sur `llm.ts` : 0 occurrence hors import `:6`) ⇒ le SDK applique `stepCountIs(1)` (`index.js:4122`). Les outils ont un `execute` réel (`tools.ts:497`, `:579`) ⇒ `stopWhen: stepCountIs(n)` enchaîne bien N rounds dans un seul `streamText` |
| le critère §7 est ABSOLU et MONOTONE | ok | §7.1 = compteur d'invocations `streamText` 5→≤2 (absolu) ; §7.2 tokens facturés « ne doit pas augmenter » (absolu) ; §7.3 `cache_read` « ne doit pas diminuer » (absolu) ; §7.4 `auto-continue ≥ 1` (absolu). Aucun ratio ; aucun dénominateur réduit par le patch |
| les tests §8 sont exécutables ici | ok | `packages/opencode/test/session/` existe (36 fichiers) ; alias `@/*` → `./src/*` (`tsconfig.json:12`) et imports relatifs `../../src/…` cohabitent (`llm.test.ts:8`, `retry.test.ts:7`) ; commande `bun test --timeout 30000 ./test/session/single-provider-call.test.ts` valide (nouveau fichier) |
| les régressions potentielles sont nommées et réelles | ok | les 10 fichiers listés §6 existent tous : `test/session/{llm,llm-native,llm-native-recorded,processor-effect,prompt,context-rollout}.test.ts` et `src/session/{prompt-budget,step-limit,turn-plan,continuation}.test.ts` |
| les `INFERE:` de la fiche sont marqués avec méthode de vérification | partiel | la fiche **n'emploie pas** le marqueur `INFERE:` (contrairement à H8) ; ses inférences (§6 « une requête HTTP par step interne », §6 « à mesurer ») sont explicitement présentées comme à mesurer, mais sans protocole chiffré |
| l'effort §9 est réaliste | ok | `L` : patch court, mais preuve mécanisme-par-mécanisme (§4.1) + recalibration des suites de session dominent — cohérent avec le §3/§6 |

## Objections

### O1 — MAJEUR. Le « Code cible » du §4 référence deux champs inexistants : il ne compile pas

Le §4 propose littéralement :

```ts
stopWhen: stepCountIs(Math.max(1, input.maxSteps ?? 8)),
```

Or `input.maxSteps` **n'existe pas**. `StreamInput` est déclaré `llm.ts:56` et le seul champ voisin est
`retries?: number` (`llm.ts:67`) ; un `grep` sur `input.maxSteps` dans `llm.ts` ne retourne rien. De même :

```ts
const internalSteps = handle.message.steps ?? 1 // nb de steps SDK du tour
```

`handle.message.steps` n'existe pas : le message assistant n'a aucun champ `steps` (`grep` « steps » sur
`message-v2.ts` : 0 occurrence). Les deux lignes du « code cible » sont donc des références inventées, et le
test §8.3 (`agent.steps = 3` → `steps_consumed === 3`) présuppose un câblage `agent.steps → StreamInput`
qui n'est décrit nulle part.

**Ce qu'il faut changer** : décrire le câblage réel du budget — ajouter un champ borné au `StreamInput`
(`llm.ts:56`) alimenté par `agent.steps` depuis `prompt.ts:2083`, et relever le nombre de steps SDK
réellement consommés par un compteur fiable (p. ex. le compteur d'index déjà tenu par `ai-sdk.ts:80`,
`state.step++`), au lieu de `handle.message.steps`. Sinon le patch ne s'applique pas.

### O2 — MINOR. Deux plages de citation sont décalées

- §2 cite `llm.ts:216-221` pour le bloc `const t = prepared.tools[toolName] …` ; le bloc cité inclut la
  ligne `toolCallId: _requestID,` qui est en `:222` (le `:221` est `const result = await t.execute!(`).
- §4.1 situe l'appel `decideRunDecision` « à `prompt.ts:1908-1916` » ; l'appel commence en réalité `:1903`
  (`const decision = decideRunDecision({`), `:1908-1912` n'en sont que des arguments et `:1916` le log
  `auto-continue`.

**Ce qu'il faut changer** : corriger en `llm.ts:216-222` et `prompt.ts:1903-1916`.

### O3 — MINOR. Le gate de permission est mal situé

§6 affirme que « les gates de permission (`ask`) et le garde `doom_loop` … restent dans `handleEvent` et
s'appliquent par tool-call ». Seul le garde `doom_loop` est dans `handleEvent` (`processor.ts:562-569`) ;
le vrai `ask` de permission vit dans l'enveloppe d'outil (`tools.ts:497`, `tools.ts:154`
`Permission.Service`), donc dans l'`execute` que le SDK appelle. La conclusion de la fiche — « pas de
contournement à condition de ne pas déplacer l'exécution d'outil hors du processeur » — reste **vraie**
(le SDK appelle l'enveloppe), mais l'argument cité ne l'établit pas.

**Ce qu'il faut changer** : réécrire §6 en pointant `tools.ts:497/:579` (le `execute` appelé par le SDK
porte lui-même le gate `Permission.Service`), et non `handleEvent`.

### O4 — MINOR. « Appel provider » reste ambigu au niveau du critère

§7.1 compte les invocations de `streamText` ; la fiche admet elle-même §6 (« le SDK émet une requête HTTP
par step interne ») et §10 que le BACKLOG (« 1 pour N rounds ») peut se lire comme des requêtes HTTP, que
le multi-step ne réduit pas. Le critère §7.1 n'est valide que si « appel provider » = invocation `streamText`.

**Ce qu'il faut changer** : figer la définition dans §7.1 (« appel provider = invocations orchestrées
`streamText` ») avant merge, plutôt que de laisser le point au §10.

## Required changes

1. **Corriger le code cible §4** : supprimer `input.maxSteps` et `handle.message.steps` ; décrire le champ
   `StreamInput` à ajouter (alimenté par `agent.steps`, `prompt.ts:2083`) et la source du compteur de
   steps SDK (`ai-sdk.ts:80`, `state.step++`).
2. **Corriger les plages** `llm.ts:216-221` → `:216-222` et `prompt.ts:1908-1916` → `:1903-1916`.
3. **Relocaliser la preuve de permission** §6 vers `tools.ts:497/:579` (enveloppe portant
   `Permission.Service`), en gardant `processor.ts:562` pour `doom_loop`.
4. **Figer la définition de « appel provider »** dans §7.1 (invocations `streamText`), et déplacer la
   question du §10 dans §7.

## Implementation guidance

Ordre : (1) ajouter le champ de budget à `StreamInput` (`llm.ts:56`) et le passer depuis
`prompt.ts:2559` ; (2) passer `stopWhen: stepCountIs(bound)` dans le `streamText` (`llm.ts:367-437`, après
`messages:` `:407`) ; (3) recompter les steps internes à partir de `state.step` (`ai-sdk.ts:80`) plutôt
que d'un champ de message ; (4) seulement alors écrire
`packages/opencode/test/session/single-provider-call.test.ts`.
Pièges : (a) le mutant §8.4 (`stopWhen = stepCountIs(1)`) doit reproduire 5 appels — le compter via un spy
sur `llm.stream`, pas via les événements `step-start` (qui resteront 5 dans les deux cas, cf. le test §8.2) ;
(b) `turn_plan` (`prompt.ts:1851-1872`) et `continuation` (`prompt.ts:1916`) s'exécutent par **tour**, donc
un tour réduit à une itération ne doit pas faire disparaître le log `auto-continue` — c'est le verrou §7.4 ;
(c) `stall-watch` (`prompt.ts:1768`, relâché `:2558`) borne la phase pré-provider d'un tour : ne pas le
déplacer dans la boucle interne du SDK.
