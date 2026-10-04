# Verdict P03 — MCP readiness comme gate de sélection du catalogue

## Proposal

`P03` — La readiness MCP doit être un gate de sélection du catalogue.
Fichier validé : `docs/harness-audit/proposals/P03-mcp-catalog-health-gate.md`.

## Validator

`independent` — validateur qui n'a pas rédigé la proposition. Preuve par lecture
directe du code source (`packages/opencode/src/mcp/index.ts`,
`packages/opencode/src/session/tools.ts`, `packages/opencode/src/session/tool-catalog.ts`,
fichiers de test cités). Aucun fichier source modifié.

## Status

`PASS_WITH_CHANGES`

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | **partiel** | 22 citations sur 24 verbatim ; `mcp/index.ts:200-204` OK ; `mcp/index.ts:1135-1137` OK ; `mcp/index.ts:807-810` et `:803-805` OK ; `session/tools.ts:64-68` OK ; `:250` OK ; `:83-93`, `:98-106`, `:169-182`, `:209-219`, `:231-235`, `:184-222`, `:207`, `:725` OK ; deux défauts de forme : `index.ts:266-273` est présenté comme un extrait contigu alors que 268-271 sont élidés sans ellipse, et l'étiquette `index.ts:211-216` ne couvre pas ce qui est cité (contenu réel à 212-213, signature à 210) |
| le chemin qui assemble le catalogue final est bien celui décrit | ok | `tools.ts:184` → `ToolCatalog.getPreparedEffect(...)`, closure `187-221`, push MCP `212-218` avec `source: "mcp"` ; sélection par requête `223` (`baseline`), `232-235` (`visibleCatalog`), `274-280` (`proposed`), `285` (`selection`) |
| **la santé est DISPONIBLE au moment de l'assemblage (question décisive)** | ok | `s.healthFailures` fait partie de l'état par instance créé à `index.ts:719-726` ; `MCP.tools()` récupère le même objet `s` à `index.ts:1129` et pourrait lire le compteur dans la même tranche de tick. Le compteur est écrit par `healthTick` : `index.ts:804` (effacement au succès), `:807-808` (incrément), `:809-810` (seuil). **Le gate est donc lisible au moment de l'assemblage, pas seulement après un échec d'appel** |
| la couverture du gate est immédiate | **KO** | Premier tick retardé d'un intervalle entier : `index.ts:847` `Effect.delay(Duration.millis(healthInterval))` (commentaire `842-843`), intervalle `index.ts:840` `mcp_health_interval_ms ?? defaultMcpHealthIntervalMs`, défaut `30_000` vérifié par `src/mcp/reconnect-policy.test.ts:11`. Le gate est donc aveugle jusqu'à 30 s après le démarrage et jusqu'à un intervalle après une chute. Non bloquant (l'état par défaut `0` ⇒ catalogue inchangé ⇒ comportement actuel), mais la latence réelle du gate n'est écrite nulle part dans la proposition |
| le placement « sélection, pas cache préparé » est justifié | ok | `tool-catalog.ts:103-121` : `getPreparedEffect(owner, version, build, ttlMs = 30_000)`, mémoïsation sur `version` **et** TTL — test `tool-catalog.ts:114` `now - cached.createdAt < ttlMs`, purge `117-118`. Un filtre dans la closure serait donc périmé jusqu'à 30 s ; la sélection (`223`/`232`/`274`/`285`) recalcule par requête. La proposition a raison mais ne cite jamais `tool-catalog.ts:107`/`:114`, qui sont sa vraie preuve |
| **le correctif supprime vraiment la cause** | **KO** | La justification de `corePresent` est réfutée par `session/tools.ts:253` : `requiredCount = new Set([...core, ...always_tools].filter((id) => visibleCatalog.tools.some((item) => item.id === id))).size + 1`. Les identifiants fantômes sont **déjà** exclus par ce `.filter(...) visibleCatalog.tools.some(...)`. L'affirmation « `requiredCount` compte des outils fantômes et `leanDynamicCapVerdict` refuse le cap à tort » est fausse sur le code actuel. Le gate, lui, est bien la cause : `index.ts:1135-1136` ne filtre que sur `status === "connected"` |
| **le correctif ne casse pas `tool_search` / activation dynamique (risque challengé)** | ok | Tracé complet : `tools.ts:44` `ActivationStore`, `:252` `sticky`, `:767` `slots = max(0, configuredMax - requiredCount - activations.get(session.id).size)`, `:771` `capacity_exceeded`, `:775-780` `activations.activate(...)`. Retirer des outils du catalogue **ne peut pas** réduire le budget d'activation : `requiredCount` baisse de 5 (253) quand les cinq outils mémoire quittent `visibleCatalog`, donc `slots` **augmente** de 5. Aucun risque de `capacity_exceeded` supplémentaire. Bénéfice net, et c'est la cause d'une panne déjà documentée en dépôt : `src/session/tools-allowlist.test.ts:41-43` (« max_tools=14 with 12 mandatory tools passed the old guard yet left a single slot for every MCP tool, so activations evicted each other on every step ») |
| le risque « réapparition d'un serveur mort via `catalogVersion` » (§6) est possible | ok (non recevable) | `catalogVersion` est un compteur monotone (`index.ts:694`, `:862`, `:897`, `:1100`), jamais une source d'ajout. Un serveur mort ne peut pas réapparaître par cet effet de bord ; l'invariant à tester reste valable, la causalité annoncée non |
| **un serveur MCP qui redémarre est retrouvé sans recréer la session (risque challengé)** | ok | Quatre mécanismes de re-découverte, tous dans l'état vivant : (1) `index.ts:804` efface le compteur au premier ping réussi ; (2) `index.ts:817-837` boucle de reconnexion avec backoff exponentiel ; (3) `index.ts:884-900` `storeClient` — `893` connected, `895` defs, `896` `delete s.healthFailures[name]`, `897` `catalogVersion++` ; (4) `index.ts:704-711` `transport.onclose/onerror` → `markDisconnected` → statut `failed` → re-découverte par (2). Le catalogue est réassemblé car `mcpVersion` entre dans `catalogKey` (`tools.ts:169`, `:180`), avec le TTL 30 s en filet. Aucune reconstruction de session requise |
| l'attribution des quatre incréments de `catalogVersion` (marquée *INFERE*) | ok (résolu) | `index.ts:694` = `watch` / `ToolListChanged` ; `:862` = `closeClient` ; `:897` = `storeClient` ; `:1100` = `reloadUnsafe`. **Aucun des quatre n'est `MCP.status`** : `MCP.status` (`index.ts:902`) est en lecture seule, `catalogVersion` y est simplement retourné (`922-924`) |
| aucun mécanisme d'alerte proactive applicatif n'existe | ok | `grep "degraded"` sur `packages/opencode/src/**/*.ts` → **No files found**. Confirmation exacte de la proposition |
| les tests existants sont correctement identifiés | **KO** | Layout mixte. `test/session/tools-allowlist.test.ts` **n'existe pas** : le fichier réel est `src/session/tools-allowlist.test.ts`. `test/mcp/reconnect-policy.test.ts` **n'existe pas** : le fichier réel est `src/mcp/reconnect-policy.test.ts`. En revanche `test/mcp/lifecycle.test.ts` et `test/tool/mcp.test.ts` existent bien. Les tests unitaires sont co-localisés dans `src/`, les tests d'intégration dans `test/` |
| numéros de ligne dans les tests cités | ok | `src/session/tools-allowlist.test.ts` lignes **8, 20, 25, 37, 62, 68, 74** : tous exacts (`leanPhaseCoreTools`/`leanCoreTools`/`leanDynamicCapVerdict`). `test/mcp/lifecycle.test.ts:275` = `toBe(beforeVersion)`, `:306` = `toBeGreaterThan(beforeVersion)` : exacts. `src/mcp/reconnect-policy.test.ts` lignes 28, 31, 39 : exactes ; **ligne 5 citée à tort** (ligne 5 vide, l'import de `mcpUnavailableMessage` est ligne 4) |
| **tests proposés exécutables dans ce dépôt** | **KO** | §7 Test 2 prescrit `bun test test/session/tools-allowlist.test.ts` et la non-régression `bun test test/mcp test/tool/mcp.test.ts test/session/tools-allowlist.test.ts` : les deux référencent un chemin inexistant (`glob **/{tools-allowlist,reconnect-policy}.test.ts` ne retourne que les deux fichiers sous `src/`). La commande ne peut pas sortir en 0 |
| **effort et coût annoncés réalistes** | **KO (partiel)** | Le chiffre récurrent est **mode-dépendant** et la proposition ne le dit pas. `tool-catalog.ts:298` et `:330` : `if (!options.enabled) return { tools: catalog.tools, mode: "full", reason: "disabled" }`. Chemin non-lean / `jit_tools` off (`tools.ts:223-228`, `baseline` en `enabled:false`) ⇒ le catalogue complet, donc les ~20 outils morts partent à chaque requête : le gain est réel. Chemin lean `enforce` (`tools.ts:274-277`, `threshold: 0`, `maxTools: max(1, effectiveMax - 1)`, et `selection = proposed` à `285`) ⇒ la charge utile est déjà plafonnée à ~`effectiveMax-1` outil : les outils morts en sont **presque toujours absents** et le gain par requête est ≈ 0 |
| chiffrage en tokens vérifiable | **INFERE (confirmé)** | `~200-250 tokens par outil`, `~4 000-5 000 par requête`, `~18 tokens` pour la ligne d'annonce, ratio `250x` : aucune de ces valeurs n'est dérivable du code, la proposition les marque correctement *INFERE*. En revanche l'hypothèse de fond est structurelle et prouvée : `description` et `schema` sont embarqués par entrée de catalogue (`tools.ts:214`, `:217`) et le catalogue est resérialisé à chaque requête (`232`, `274`, `285`). `~18 tokens` est en outre généreux : le littéral `llm-memory-tool (offline)` entre balises est de l'ordre de 10-12 tokens |

## Objections

**O1 — Les chemins de test de §6/§7 n'existent pas ; la commande de non-régression ne peut pas réussir.**
La proposition cite `test/session/tools-allowlist.test.ts` (§6, §7 Test 2, §9) et
`test/mcp/reconnect-policy.test.ts` (§6). Le dépôt a deux layouts : `glob
**/{tools-allowlist,reconnect-policy}.test.ts` sous `packages/opencode` ne retourne que
`src\session\tools-allowlist.test.ts` et `src\mcp\reconnect-policy.test.ts`. `read` sur
`packages/opencode/test/session/tools-allowlist.test.ts` → *File not found*. Les commandes
prescrites référencent donc un chemin absent et ne peuvent pas produire l'exit code 0 exigé
comme critère de succès. Pire, les numéros de ligne cités sont corrects **au bon fichier,
au mauvais chemin** : `src/session/tools-allowlist.test.ts:8,20,25,37,62,68,74` sont exacts,
ce qui masque l'erreur jusqu'à l'exécution.
*Ce qu'il faut changer :* réécrire tous les chemins en `src/…`, donc
`bun test src/session/tools-allowlist.test.ts src/mcp/reconnect-policy.test.ts`, et corriger
la commande de non-régression en `bun test test/mcp test/tool/mcp.test.ts
src/session/tools-allowlist.test.ts`. Le nouveau test de §7 Test 1 doit être créé en
`src/mcp/catalog-health-gate.test.ts` (co-localisé) et non en `test/mcp/…`.

**O2 — La justification de `corePresent` est réfutée par le code, et l'implémenter ainsi
peut dégrader `requiredCount`.**
§Fichier 2 affirme : « Intersecter le noyau avec ce qui est réellement présent, sinon
`requiredCount` compte des outils fantômes et `leanDynamicCapVerdict` refuse le cap à tort ».
`session/tools.ts:253` fait déjà exactement cette intersection :
`new Set([...core, ...(hotPath?.always_tools ?? [])].filter((id) => visibleCatalog.tools.some((item) => item.id === id))).size + 1`.
Il n'y a donc aucun Phantom : le compteur exclut déjà les identifiants absents, et
`leanDynamicCapVerdict` (`:98-106`) ne peut pas « refuser le cap à tort » de ce fait. Le
commentaire `:256-258` confirme d'ailleurs l'intention (« the memory policy pins five MCP
tools that disappear when that server is down ») : l'intention est juste, le diagnostic du
code est faux. Un `corePresent` calculé depuis `prepared.catalog.tools` (donc **avant**
`visibleCatalog` et donc avant le filtrage `Permission.disabled` de `:231`) serait
strictement plus large que l'existant et pourrait recounté des outils que la session a
interdits.
*Ce qu'il faut changer :* supprimer la motivation « fantômes / cap refusé à tort »,
remplacer `present` par l'ensemble sur `visibleCatalog.tools` si une variable est vraiment
nécessaire, et énoncer le vrai bénéfice mesurable — après le gate, `requiredCount` perd
naturellement 5 et `slots` (`tools.ts:767`) gagne 5 créneaux d'activation.

**O3 — Le gain récurrent annoncé n'est pas vrai dans le mode qui motive la proposition.**
§5 et §6 annoncent « les ~4 000-5 000 tokens par requête d'un serveur mort disparaissent »
et un rapport de 250x, sans conditionner au mode. `tool-catalog.ts:298`/`:330` montrent que
`selectTools` renvoie **tout** le catalogue quand `enabled` est faux. Sur un agent lean en
`dynamicMode === "enforce"`, `tools.ts:274-277` impose `threshold: 0` et
`maxTools: Math.max(1, effectiveMax - 1)`, et `tools.ts:285` sélectionne `proposed` : la
charge utile est déjà plafonnée, donc les ~20 outils morts n'y sont **pas** transmis et le
gain par requête est proche de zéro. Le gain est réel sur le chemin non-lean / `jit_tools`
désactivé. Les deux chiffres doivent être séparés et l'hypothèse de base (catalogue
resérialisé à chaque requête) maintenue comme structurelle.
*Ce qu'il faut changer :* distinguer explicitement les deux modes dans §5/§6, ou mesurer
sur un agent non-lean, et conserver le marquage *INFERE* sur la valeur par outil.

**O4 — La latence réelle du gate n'est écrite nulle part.** §3.2 ne mentionne que « deux
occasions de signal perdues ». `index.ts:847` retarde le premier tick d'un intervalle
entier, défaut 30 000 ms (`src/mcp/reconnect-policy.test.ts:11`), et `index.ts:840` rend
l'intervalle configurable. Le gate est donc muet jusqu'à `mcp_health_interval_ms` après le
démarrage et jusqu'à un intervalle après une chute. Ce n'est pas bloquant (défaut `0` ⇒
comportement actuel préservé) mais la borne doit figurer dans la proposition, faute de quoi
la question « le serveur vient de tomber » reçoit une réponse « non détecté » qui n'est
documentée nulle part.

**O5 — Une dépendance probatoire manque au §Fichier 2.** La décision « gate à la sélection,
pas dans le closure `getPreparedEffect` » est correcte, mais elle repose sur une TTL que la
proposition ne cite pas : `tool-catalog.ts:107` (`ttlMs = 30_000`) et `:114`
(`if (cached && now - cached.createdAt < ttlMs) return { catalog: cached, hit: true }`). Sans
cette citation, l'argument « dépendant d'une invalidation de cache » reste non prouvé.

**O6 — Défauts de forme dans les citations** (non bloquants, à corriger dans la même
passée). `index.ts:266-273` est présenté comme un bloc contigu alors que les lignes 268 à 271
sont élidées sans ellipse. L'étiquette `index.ts:211-216` ne correspond pas au contenu cité,
qui vit en `212-213` avec la signature en `210`. `src/mcp/reconnect-policy.test.ts` « ligne 5 »
est vide. `tools.ts:209-219` est décrit comme versant « *tout* » ce que renvoie `mcp.tools()`
alors que `:210` fait `if (!item.execute) continue`.

## Required changes

1. Corriger tous les chemins de test vers `src/` (§6, §7 Test 2, §7 non-régression, §9) et
   replacer le fichier à créer en `src/mcp/catalog-health-gate.test.ts`. Sans cela le critère
   « exit code 0 » est inatteignable. *(O1)*
2. Supprimer la motivation « `requiredCount` compte des outils fantômes », réfutée par
   `tools.ts:253`, et formuler le vrai bénéfice : `requiredCount` perd 5 par lui-même et
   `slots` (`tools.ts:767`) gagne 5 créneaux. Si `corePresent` est conservé, le calculer sur
   `visibleCatalog.tools`, jamais sur `prepared.catalog.tools`. *(O2)*
3. Séparer le chiffrage du gain récurrent par mode (`jit_tools` off / non-lean ⇒ catalogue
   complet, gain réel ; lean `enforce` ⇒ charge utile déjà plafonnée par
   `tools.ts:274-277`, gain ≈ 0), et conserver le marquage *INFERE* sur toutes les valeurs
   par outil et sur les `~18 tokens`. *(O3, challenge 5)*
4. Écrire la borne de latence du gate : premier tick retardé d'un intervalle
   (`index.ts:847`), intervalle par défaut 30 000 ms (`index.ts:840`,
   `src/mcp/reconnect-policy.test.ts:11`). *(O4)*
5. Citer `tool-catalog.ts:107` et `:114` à l'appui du choix « sélection et non cache
   préparé ». *(O5)*
6. Réparer les trois étiquettes de plage et l'élision : `index.ts:266-273` (insérer une
   ellipse entre 267 et 272), `index.ts:211-216` → `:210-217`, et « ligne 5 » de
   `reconnect-policy.test.ts` → ligne 4 (import) ou 28 (première assertion). *(O6)*
7. Répondre aux deux questions de §9 dans la proposition, pas seulement dans le verdict.
   Recommandation du validateur : **retrait dès 1 échec conservé** (`healthFailures > 0`), car
   la réapparition est automatique et sans coût au premier ping réussi
   (`index.ts:804`) et que le coût d'un clignotement est borné par l'intervalle de santé ;
   **pas de déduplication exigée** avec le `<degraded_capabilities>` du harnais — le doublon
   est inoffensif, la déduplication coûterait un accord de couches que rien ne structure
   aujourd'hui. Si le doute persiste sur le clignotement, la variante `healthFailures > 1`
   est acceptable **à condition** que la limite soit écrite dans le test de non-régression.
   *(§9, non classé objection : décision de conception)*

## Implementation guidance

Ordre des patches : (1) `src/mcp/index.ts` — ajouter `isCatalogEligible` à côté de
`shouldDisconnectAfterHealthFailures` (`:200-204`), filtrer `connectedClients`
(`:1135-1137`) sur `status === "connected" && (s.healthFailures[clientName] ?? 0) === 0`, et
exposer `readiness()` ; laisser `HEALTH_FAILURE_THRESHOLD`, les deux `throw` (`:267`, `:273`)
et `convertMcpTool` (`:227-234`) intacts. (2) `src/session/tools.ts` — au point de sélection
(après `:232-235`, avant `:253`), broadcaster les serveurs filtrés en une ligne unique vers le
prompt système, nom construit depuis `sanitize(clientName)` (`index.ts:1155`,
`tools.ts:207`) **et** échappé pour ne pas pouvoir fermer la balise `<unavailable_tools>` :
c'est une contrainte de code, pas de commentaire. (3) Ne pas toucher `leanCoreTools`
(`:83-93`) : `src/session/tools-allowlist.test.ts` l'appelle directement et doit rester vert
sans retouche. Piège connu : le prepared catalog est mémoïsé 30 s
(`tool-catalog.ts:107`/`:114`) — toute assertion de visibilité doit passer par la sélection
(`tools.ts:285`), jamais par `prepared.catalog`. Fichiers de test : créer
`src/mcp/catalog-health-gate.test.ts` (prédicat + ligne d'annonce, une occurrence par
serveur) et étendre `src/session/tools-allowlist.test.ts` (intersection, `requiredCount`
inchangé quand rien n'est filtré et réduit de 5 quand les cinq outils mémoire sont absents,
`slots` à `tools.ts:767` non réduit).
