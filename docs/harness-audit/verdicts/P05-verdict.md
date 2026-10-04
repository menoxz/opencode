# P05 — DoD réémis deux fois par tour (`task-contract` + `risk_advisory`)

## Proposal

`P05` — DoD réémis deux fois par tour (`task-contract` + `risk_advisory`).
Fichier de proposition validé : `docs/harness-audit/proposals/P05-dod-duplicated.md` (269 lignes).

## Validator

`independent` — validateur n'ayant pas rédigé la proposition. Aucune ligne de
`lean-advisory.ts`, `prompt.ts`, `goal-state.ts`, `compaction.ts`, `runtime-flags.ts`
n'a été modifiée pendant cette validation ; la seule écriture est le présent verdict.

## Status

`PASS_WITH_CHANGES`

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok (1 réserve) | `lean-advisory.ts:20-32`, `prompt.ts:2380-2386/2451/2454/2458-2472/2466/2468/2473-2476`, `compaction.ts:112/122-124`, `goal-state.ts:47-50/86-88/104-109`, `runtime-flags.ts:4/11-14/52/55-56`, `goal-contract.ts:450/724`, `lean-advisory.test.ts:20-28`, `context-budget.test.ts:294-295/414/450`, `prompt.test.ts:910/1193`, `working-state-runtime.test.ts:201`, `README.md:27` — tous relus et conformes au caractère près. Réserve : `proposals/P05-dod-duplicated.md:145` (voir Objection 5) |
| le correctif supprime vraiment la cause | ok | `lean-advisory.ts:21` `const requirements = (goal.dod ?? []).map((item) => \`- mandatory requirement: ${item}\`)` est l'unique site qui recopie le texte d'un DoD ; `goal-state.ts:87` `if (dod) lines.push(\`DOD: ${dod}\`)` est le porteur canonique |
| le correctif ne casse pas un comportement existant | ok | baseline exécutée : `bun test src/session/lean-advisory.test.ts` → `3 pass / 0 fail`, exit `0`. Aucun test n'assert l'énumération : grep `risk_advisory\|mandatory requirement\|buildRiskAdvisory` sous `packages/opencode/test` → **0 résultat**. `context-budget.test.ts:414` `toBeLessThan(20000)` et `:450` `toBeLessThan(60000)` sont des bornes supérieures : retirer des caractères ne peut qu'en éloigner |
| tests proposés sont exécutables dans ce dépôt | ok pour #2 et #3, **non discriminant** pour #1 | `packages/opencode/test/` existe (dossier tiers confirmé par lecture de ses fichiers) ; mais `proposals/P05-dod-duplicated.md:245` `expect(text.length).toBeLessThan(400)` est satisfait **par l'implémentation actuelle** sur le cas de test donné (348 < 400, mesuré) : l'assertion ne prouve pas le défaut corrigé (voir Objection 2) |
| effort et coût annoncés réalistes | **KO** | gain réel mesuré par import de la fonction réelle : 2 sentinelles → **−35 caractères** (le bloc *grossit*), 1 DoD realistic → **−12 caractères** (le bloc *grossit*), 3 DoD typiques → **+35 caractères** (~9 tokens), 5 DoD longs → **+453 caractères** (~113 tokens). Le « ~240 tokens par tour » (`proposals/P05-dod-duplicated.md:5`, `:109`, `:221`) est **INFERE** et non reproductible (voir Objection 1) |
| priorité réelle du correctif | **KO** (énoncé mais non_draw) | `runtime-flags.ts:55` `experimentalQaProofAdvisory: bool("OPENCODE_EXPERIMENTAL_QA_PROOF_ADVISORY")` et `:56` `experimentalRiskPlannerAdvisory: bool("OPENCODE_EXPERIMENTAL_RISK_PLANNER_ADVISORY")`, avec `bool` défini `:4` `Config.boolean(name).pipe(Config.withDefault(false))` → **éteints par défaut**. Ces deux flags n'utilisent pas `enabledByExperimental` (`:11-14`) donc `OPENCODE_EXPERIMENTAL=1` ne les active pas. Aucune clé de configuration n'existe (voir Objection 4) |
| garde anti-doublon `prompt.ts:2381` — interroge le mauvais tableau | **KO** | `prompt.ts:2244` `const system: string[] = []` ; `system.push` uniquement en `:2297`, `:2298`, `:2315`, `:2530`. `<task-contract>` est poussé dans `volatile` (`:2251` `const volatile: string[] = []`, `:2386` `if (goalCtx) volatile.push(goalCtx)`) et les deux tableaux ne fusionnent qu'en `:2526`. La clause `!system.some((entry) => entry.includes("<task-contract"))` est donc **morte** (voir Objection 3) |

## Objections

**Objection 1 — LE GAIN ANNONCÉ EST FAUX POUR LES DoD RÉELS, ET N'EST MESURABLE
QUE POUR DES DoD LONGUES. C'est l'objection bloquante.**

La proposition annonce « ~240 tokens par tour » (`proposals/P05-dod-duplicated.md:5`)
sans fournir aucune mesure reproductible : « selon la mesure terrain fournie »
(`:221`), non joinsse. Le delta réel est arithmétique et vérifiable à partir de
`lean-advisory.ts:21` — le surcoût courant est `"- mandatory requirement: "` (24
caractères) + `"\n"` = **25 caractères par DoD**, et la ligne de renvoi proposée en
ajoute **121** (mesuré). D'où :

```
gain = Σ(len(item_i) + 25) − 121
```

Le seuil de rentabilité est donc atteint **uniquement** quand `Σ(len(item)+25) > 121`.
Mesuré sur la fonction réelle (import direct de `buildRiskAdvisory`) :

| cas | DoD (caractères) | actuel | proposé | delta | tokens |
|---|---|---|---|---|---|
| cas de test de P05 : 2 sentinelles | 35 | 348 | 383 | **−35** | −8,8 |
| 1 DoD realistic (le DoD de la session vivante) | 84 | 371 | 383 | **−12** | −3,0 |
| 3 DoD typiques | 79 | 418 | 383 | +35 | +8,8 |
| 5 DoD longs | 445 | 836 | 383 | +453 | +113,3 |

Autrement dit : sur le cas de test que la proposition elle-même prescrit, et sur un
DoD unique réaliste, **le bloc devient plus gros**. L'argument de §6
(`proposals/P05-dod-duplicated.md:221`, « Zéro coût CPU et zéro latence ajoutée »)
reste vrai, mais l'argument de gain net est infirmé dans le régime le plus courant.
À corriger : remplacer « ~240 tokens » par la formule et le tableau ci-dessus,
marqués **MESURÉ**, et annoncer honnêtement « gain nul à négatif pour 1–3 DoD
courts ; jusqu'à ~113 tokens pour une liste longue ».

**Objection 2 — LE TEST PROPOSÉ NE DÉTECTE PAS LE DÉFAUT.**

`proposals/P05-dod-duplicated.md:245` exige `expect(text.length).toBeLessThan(400)`.
Or la longueur de la sortie proposée est **constante à 383 caractères** (mesuré : 383
pour n = 1 à 5, le décompte tenant sur un chiffre), et la longueur **actuelle** du
cas prescrit est **348** (`DOD_SENTINEL_ALPHA|DOD_SENTINEL_BETA`). L'assertion est donc
vraie **avant comme après** le correctif : elle ne prouve rien. Seule la paire
`not.toContain("DOD_SENTINEL_ALPHA")` / `not.toContain("DOD_SENTINEL_BETA")` (`:240`)
détecte réellement la régression — ce qui est la bonne assertion, mais elle suffit.
À corriger : soit supprimer l'assertion de taille (elle est décorative et piège), soit
la rendre discriminante en fixant un seuil sous 348 (p. ex. `toBeLessThan(200)`),
soit remplacer par une assertion de forme : `expect(text.match(/^- mandatory requirement: /gm) ?? []).toHaveLength(0)`.

**Objection 3 — LA GARDE ANTI-DOUBLON DE `prompt.ts:2381` INTERROGE LE MAUVEAU
TABLEAU. La proposition ne la traite pas.**

`prompt.ts:2381` :
```ts
if (!system.some((entry) => entry.includes("<task-contract")) && goalState.status !== "skipped") {
```
`system` est déclaré `:2244` et alimenté **uniquement** par `:2297`, `:2298`, `:2315`
et `:2530`. Or le contrat est poussé dans `volatile` — `:2251`
`const volatile: string[] = []`, `:2386` `if (goalCtx) volatile.push(goalCtx)` — et les
deux tableaux ne fusionnent qu'en `:2526`
`const injected = [...volatile, ...stepOneTail].filter((entry) => entry.trim())`.
Au moment où `:2381` s'exécute, `system` ne peut donc pas contenir `<task-contract` :
**la première clause de la garde est morte** et la garde se réduit à
`goalState.status !== "skipped"`.

Deux conséquences que la proposition doit tackled, et non contourner :

1. **Latent : le contrat peut être silencieusement supprimé.** `system` contient les
   instructions fusionnées `:2297` (`[...instructions, env.stable, preloadedSkills,
   toolList]`). Un `AGENTS.md` ou une skill qui mentionne littéralement
   `<task-contract` ferait evaluates `system.some(...)` à `true` et **supprimerait
   l'injection du contrat réel**. Même défaut sur la garde jumelle `:2452`
   `!system.some((entry) => entry.includes("<goal_reminder"))`. Ce n'est plus une
   clause morte inoffensive : c'est un suppresseur à faux positifs.
2. **L'invariant central de §2 repose sur cette garde.** `proposals/P05-dod-duplicated.md:85`
  -chainne `TERMINAL_STATUSES` (`goal-state.ts:47`) → `goalActive` (`prompt.ts:2451`)
   → franchissement de `prompt.ts:2381`. Le raisonnement est valide, mais il repose
   sur une garde dont une moitié ne fait rien ; le lecteur doit le redériver à chaque
   fois. Corriger la clause (`volatile` au lieu de `system`) est un changement
   d'une ligne et un **no-op** aujourd'hui, puisque l'invariant prouve qu'elle est
   toujours fausse dans le sens souhaité.

**Objection 4 — LE RISQUE DÉTERMINANT (Q2) : RÉPONSE CORRECTE SUR LE POINT
DÉCISIF, MAIS LA DÉFENSE EST TROP NETTE.**

Ce que contient **exactement** chaque ligne de `<risk_advisory>` aujourd'hui
(`lean-advisory.ts:24-31`) :

| ligne | texte | sort du correctif ? |
|---|---|---|
| `:25` | `<risk_advisory>` | conservée |
| `:26` | `This is advisory only: it cannot downgrade user requirements, security gates, failures or unverified evidence.` | conservée (phrased « non-DoD » de `:54`) |
| `:27` | `- mandatory requirement: <texte du DoD>` × N (produit par `:21`) | **supprimée** |
| `:28` | `- sticky finding: <texte>` × M (produit par `:22`) | conservée |
| `:29` | `Reuse proof only when its git/file/environment freshness still matches; uncertainty invalidates rather than skips it.` | conservée (phrased « non-DoD » de `:54`) |
| `:30` | `</risk_advisory>` | conservée |

**Sur la question posée — « le modèle peut-il perdre l'instruction d'appliquer
*chaque* DoD ? » — la réponse est NON, et c'est prouvable sans dépendre du renvoi
proposé.** L'instruction par item est énoncée dans le bloc que le correctif **ne
touche pas** : `prompt.ts:2468` `` `- A required DoD item with no verifiable evidence leaves the objective open: keep working. …` ``, et elle est imposée structurellement par `goal-contract.ts:450`
`"One entry per DoD item, each carrying a verifiable artifact. Required — completion is refused without it."`
appliquée en `goal-contract.ts:724`
`` … `No proof for DoD item: ${item}` ``. La porte est donc ailleurs que dans le
prompt ; c'est le point fort de la proposition, et il est vérifié.

**Mais la défense n°1 de §6 (`:224`) est trop affirmative** : elle affirme « Ce n'est
pas une suppression d'information » et « le modèle voit `DOD: a|b|c` ». Or le porteur
canonique **ne présente pas la liste sous forme d'énumération** : `goal-state.ts:76-79`
`.map((item) => item.trim()).filter(Boolean).join("|")`, puis `goal-state.ts:87`
`` lines.push(`DOD: ${dod}`) ``. Deux informations ne sont donc disponibles que dans
l'advisory et disparaissent avec lui :

1. **Le nombre d'items n'est pas lisible dans le porteur canonique** sans segmenter
   la chaîne sur `|`. Or c'est précisément le contrôle de cohérence que la
   proposition revendique (§6, défense 3, `the ${count} DoD item(s)`) : P05 admet
   donc une perte qu'elle ne répare pas, en déplaçant le décompte vers un bloc qui
   était le seul endroit où il était derivable sans effort.
2. **La granularité par ligne disparaît.** La forme `- mandatory requirement: x`
   donne une liste de travail directement consommable item par item ; `DOD: a|b|c`
   impose un re-parsing. Et si un texte de DoD contient lui-même `|`, la forme
   canonique `DOD:` devient ambiguë là où la forme courante ne l'était pas — cas
   étroit mais réel, et il plaide en faveur du texte *actuel*.

À corriger : reformuler la défense 1 en « aucune information de *contenu* n'est
perdue, l'énumération lisible par item l'est » ; etapture mitigations
correspondantes, ou accepter explicitement ce perte.

**Objection 5 — UNE CITATION IMPRECISE (mineure, sans effet sur le statut).**

`proposals/P05-dod-duplicated.md:145` affirme : « Recherche de
`risk_advisory|mandatory requirement|goalReminder|buildRiskAdvisory` sous
`packages/opencode/test` : **1 seule** occurrence,
`packages/opencode/test/session/context-budget.test.ts:295` ». La ligne `:295` est
bien `["goalReminder", /<goal_reminder>[\s\S]*?<\/goal_reminder>/]`, mais le motif
retenu ne contient **pas** `goalReminder` : le motif cité ne trouve **aucune**
occurrence. La conclusion de fond est juste (aucun test n'assert l'énumération —
confirmé par le motif effectivement pertinent) ; la formulation ne l'est pas.

**Objection 6 — LE PRIORITÉ RÉELLE N'EST PAS TIRÉE (mineure mais structurante).**

La proposition **constate** correctement que les deux flags sont éteints par défaut
(`:125`) et qu'aucune clé de configuration n'existe (`:127-129`) — la preuve est
bonne : grep `qa_proof|risk_planner|qaProof|riskPlanner` sur `packages/opencode/src`
→ **2 résultats**, `lean-advisory.ts:9` et `lean-advisory.ts:16`, qui sont bien les
étiquettes XML. Mais elle n'en tire **aucune conséquence de priorisation**.
Réponse franche à la question posée : la priorité réelle de P05 est **FAIBLE**. Le
correctif est inerte pour tout opérateur n'ayant pas défini
`OPENCODE_EXPERIMENTAL_RISK_PLANNER_ADVISORY`, il ne ferme aucun gate, ne corrige
aucun défaut de justesse ni de sécurité, et son bénéfice net est nul à négatif pour
1–3 DoD courts (Objection 1). Dans la matrice `docs/harness-audit/README.md:23-29`,
P03 (des outils MCP dont la readiness a échoué restent au catalogue) et P04
(`Retry-After` non borné) sont des défauts visibles sans drapeau ; P05 est le
**dernier** des huit, pas un item de milieu de peloton.

## Required changes

1. **Objection 1** — Remplacer le « ~240 tokens par tour » (`:5`, `:109`, `:221`) par
   la formule `Σ(len(item)+25) − 121` et le tableau mesuré ci-dessus, avec la mention
   explicite que le gain est **nul ou négatif pour 1 à 3 DoD courts**. Ne pas annoncer
   un gain净 là où la mesure montre un grossissement du bloc.
2. **Objection 2** — Rendre le test §7.1 discriminant : remplacer
   `expect(text.length).toBeLessThan(400)` par `toBeLessThan(200)`, ou par
   `expect(text.match(/^- mandatory requirement: /gm) ?? []).toHaveLength(0)`.
3. **Objection 3** — Corriger la garde de `prompt.ts:2381` (et, dans le même lot,
   `prompt.ts:2452`) pour tester le tableau qui porte réellement le marqueur :
   `system` → `volatile`. Si le correctif veut rester strictement limité à
   `lean-advisory.ts`, alors **l'ajouter explicitement à la section « hors
   périmètre »** de la proposition, en citant `prompt.ts:2244` / `:2386` / `:2526`,
   au lieu de laisser la garde_muette non signalée dans un fichier que la
   proposition lit et cite déjà.
4. **Objection 4** — Reformuler la défense 1 de §6 : l'information de contenu n'est
   pas perdue, la **forme énumérée par item l'est** (nombre d'items non dérivable de
   `DOD: a|b|c` sans segmentation `goal-state.ts:79`). Arbitrer la question laissée
   ouverte en §9 : la formulation « the N DoD item(s) » est **à conserver** — c'est
   elle qui porte le décompte que le porteur canonique ne porte plus de façon
   lisible — et cette conservation doit être justifiée par ce motif, pas seulement
   par le contrôle de cohérence.
5. **Objection 5** — Corriger la formulation de `:145` (motif réellement appliqué, ou
   motif incluant `goalReminder`).
6. **Objection 6** — Ajouter une phrase de priorisation explicite : le correctif est
   **inerte par défaut** et doit être priorisé **après** P03 et P04 dans la matrice.

## Implementation guidance

Ordre des patches : (1) `lean-advisory.ts` `buildRiskAdvisory` seul, en appliquant le
correctif §4 tel quel — le diff est de 4 lignes et ne touche ni `prompt.ts`, ni les
clés de cache, ni le contrat ; (2) `test/session/lean-advisory.test.ts` nouveau, avec
l'assertion de forme de l'Objection 2 en priorité sur l'assertion de taille ; (3)
`prompt.ts:2381` et `:2452`, `system` → `volatile`, en lot séparé et avec ses propres
tests. Piège connu : la sortie proposée fait **383 caractères constants** pour 1 à 9
DoD — toute assertion de taille calibrée sur ce plateau ne distinguera pas l'avant de
l'après, et l'ordre des blocs dans `context-budget.test.ts:294-295` doit rester
`<task-contract>` avant `<goal_reminder>` pour ne pas casser le découpage. Fichier de
test à modifier plutôt qu'à créer : `packages/opencode/src/session/lean-advisory.test.ts`
(29 lignes, colocated, 3 tests) — y ajouter le cas sentinelle évite d'introduire un
deuxième emplacement pour la même fonction, le nouveau fichier de §7.1 n'étant justifié
que si le gabarit l'impose.
