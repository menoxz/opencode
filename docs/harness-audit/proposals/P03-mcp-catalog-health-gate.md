# P03 — La readiness MCP doit être un gate de sélection du catalogue

## 1. Problem

Les outils d'un serveur MCP dont la readiness a échoué restent annoncés au modèle dans le
catalogue, qui les invoque et perd 2 à 4 tours par tentative avant d'apprendre — à ses
dépens — qu'ils ne répondent pas.

## 2. Evidence

Le seuil de santé existe et décide de la déconnexion, jamais de la visibilité :

```ts
// packages/opencode/src/mcp/index.ts:200-204
const HEALTH_FAILURE_THRESHOLD = 3
export function shouldDisconnectAfterHealthFailures(failures: number): boolean {
  return failures >= HEALTH_FAILURE_THRESHOLD
}
```

L'échec est levé au moment de l'appel, pas annoncé avant :

```ts
// packages/opencode/src/mcp/index.ts:266-273
      const live = resolve()
      if (!live) throw new Error(mcpUnavailableMessage(label, mcpTool.name, autoreconnect, false))
        const fresh = await recover(live, error)
        if (!fresh) throw new Error(mcpUnavailableMessage(label, mcpTool.name, autoreconnect, true))
```

`mcpUnavailableMessage` est un message d'*échec d'appel*, jamais un avis d'*indisponibilité* :

```ts
// packages/opencode/src/mcp/index.ts:211-216
  const state = dropped
    ? `MCP server "${server}" dropped mid-call and has not reconnected yet, so ${tool} could not run.`
    : `MCP server "${server}" is not connected, so the ${tool} tool is unavailable right now.`
```

Trois pings ratés sont requis avant toute déconnexion, et les deux premières opportunities ne
font rien du tout :

```ts
// packages/opencode/src/mcp/index.ts:807-810
                       const failures = (s.healthFailures[name] ?? 0) + 1
                       s.healthFailures[name] = failures
                       if (!shouldDisconnectAfterHealthFailures(failures)) return Effect.void
                       return markDisconnected(s, name, client, `health check ping failed ${failures} times`)
```

Le compteur d'échecs existe par serveur, et son effacement est déjà branché sur le succès :

```ts
// packages/opencode/src/mcp/index.ts:803-805
                       if (ok) {
                         delete s.healthFailures[name]
                         return Effect.void
```

Le catalogue ne filtre que sur un signal de transport, jamais sur la santé :

```ts
// packages/opencode/src/mcp/index.ts:1135-1137
      const connectedClients = Object.entries(s.clients).filter(
        ([clientName]) => s.status[clientName]?.status === "connected",
      )
```

Cinq outils du serveur dégradé sont **épinglés au noyau lean** donc envoyés à chaque tour :

```ts
// packages/opencode/src/session/tools.ts:64-68
  "llm-memory-tool_memory_retrieve",
  "llm-memory-tool_memory_store",
  "llm-memory-tool_memory_update",
  "llm-memory-tool_memory_delete",
  "llm-memory-tool_memory_consolidate",
```

Ce noyau est injecté dans la sélection sans être recoupé avec ce qui existe réellement :

```ts
// packages/opencode/src/session/tools.ts:250
  const core = leanCoreTools({ phase, environmentState, goalActive: isActiveGoal(input.goalState ?? input.session.goalState) })
```

L'état par serveur porte déjà tout ce dont un gate a besoin :

```ts
// packages/opencode/src/mcp/index.ts:719-726
        const s: State = {
          status: {},
          clients: {},
          defs: {},
          fingerprints: {},
          healthFailures: {},
          catalogVersion: 1,
        }
```

Aucun mécanisme d'alerte proactive n'existe : `grep "degraded"` sur tout le dépôt `*.ts` →
*No files found*. Observation terrain : ~20 outils `llm-memory-tool` au catalogue pendant que
`localhost:8765` est injoignable — et le bloc `<degraded_capabilities>` qui avertit le modèle
est produit par le harnais, pas par l'application.

## 3. Mechanism

1. `MCP.state` initialise `status`, `clients`, `defs`, `healthFailures` par serveur
   (`mcp/index.ts:719-726`).
2. `healthTick` ping en parallèle chaque serveur `connected`. Un échec incrémente
   `healthFailures` puis **retourne sans effet** tant que le compteur est < 3
   (`mcp/index.ts:800-812`) : deux occasions de signal perdues.
3. `resolveTools` calcule une clé de cache qui inclut `mcpVersion`
   (`tools.ts:169-182`), puis verse *tout* ce que renvoie `mcp.tools()` dans
   `prepared.catalog` avec `source: "mcp"` (`tools.ts:209-219`) — sans filtre de santé.
4. `leanCoreTools` réinjecte les identifiants épinglés (`tools.ts:250`, définition
   `tools.ts:83-93`), dont les cinq outils mémoire.
5. `baseline`/`visibleCatalog` ne retirent que ce que `Permission.disabled` et
   `userTools` excluent (`tools.ts:231-235`) : la santé n'y figure pas.
6. À l'appel, `resolve()` renvoie `undefined` et le modèle reçoit enfin l'erreur
   (`mcp/index.ts:267`) — après avoir payé la préparation, l'invocation et un tour de
   réponse. Le catalogue n'a jamais rien dit.

## 4. Proposal

**Choix : (a) en mécanisme — retrait du catalogue — plus une ligne `<unavailable_tools>` par
serveur dégradé.** Le retrait est récurrent à coût nul ; la ligne coûte ~18 tokens et empêche
le modèle de lire l'absence comme « mémoire non configurée ».

### Fichier 1 — `packages/opencode/src/mcp/index.ts`

Un prédicat de readiness, à côté du seuil existant (`index.ts:200-204`) :

```ts
export function isCatalogEligible(r: { status: string; healthFailures: number }): boolean {
  return r.status === "connected" && (r.healthFailures ?? 0) === 0
}
```

Puis, dans `MCP.tools()` (`index.ts:1135-1137`), filtrer sur ce prédicat au lieu de
`status === "connected"`, et exposer au service une fonction `readiness()` retournant
`Record<server, { status; healthFailures; autoreconnect }>` — `autoreconnect` étant déjà lu à
`index.ts:789` et `index.ts:1170` sous la forme
`cfg.experimental?.mcp_autoreconnect !== false`.

### Fichier 2 — `packages/opencode/src/session/tools.ts`

**Le gate se place à la SÉLECTION (par requête, état vif), pas dans la préparation (mise en
cache).** C'est le point qui répond à la question « un serveur qui redémarre » : filtrer dans
le closure `getPreparedEffect` (`tools.ts:184-222`) rendrait la visibilité dépendante d'une
invalidation de cache, alors que l'état vif est déjà rafraîchi par le tick suivant.

Intersecter le noyau avec ce qui est réellement présent, sinon `requiredCount` compte des
outils fantômes et `leanDynamicCapVerdict` (`tools.ts:98-106`) refuse le cap à tort :

```ts
  const present = new Set(prepared.catalog.tools.map((item) => item.id))
  const corePresent = core.filter((id) => present.has(id))
```

Puis émettre **une seule** ligne, seulement si au moins un serveur est filtré, vers le prompt
système :

```
<unavailable_tools>llm-memory-tool (offline)</unavailable_tools>
```

### Ce qui reste volontairement inchangé

- **`HEALTH_FAILURE_THRESHOLD = 3` et la boucle de santé** (`index.ts:786-814`) : ce seuil
  protège le transport, pas la visibilité. Déconnecter un serveur après un seul ping raté
  coûte un cycle connexion/transport pour une panne de 200 ms. On ne le touche pas ; on
  ajoute un prédicat distinct, plus strict pour la *visibilité* que pour la *connexion*.
- **`leanCoreTools` reste pur** (`tools.ts:83-93`) : l'intersection se fait à l'appel, donc
  `test/session/tools-allowlist.test.ts` (qui appelle `leanPhaseCoreTools` et
  `leanCoreTools` directement, lignes 8, 20, 25, 37, 62, 68, 74) reste vert sans retouche.
- **Les deux `throw` de `index.ts:267` et `index.ts:273`** : ils restent la dernière ligne de
  défense contre la course entre sélection et appel. On ne les supprime pas.
- **`convertMcpTool` et son `resolve`/`recover`** (`index.ts:227-234`, `1154-1171`) :
  inchangés. Le commentaire de `index.ts:1157` (« Re-read from live state so a reconnect is
  picked up mid-session ») décrit exactement la propriété à préserver.
- **`mcp.catalogVersion` et ses quatre incréments** (`index.ts:694`, `862`, `897`, `1100`) :
  le gate n'en dépend pas, il les exploite.

### Cas « le serveur redémarre », traité explicitement

Le risque demandé est qu'un serveur revenu exige une reconstruction de session. Il n'en
exige aucune, pour trois raisons vérifiables :

1. **Aucune reconstruction** : le gate lit l'état à chaque requête, pas un instantané figé
   dans une session. La session ne stocke pas la liste d'outils MCP.
2. **Le retour est détecté par le tick de santé** : au premier ping réussi,
   `delete s.healthFailures[name]` (`index.ts:804`) remet le compteur à zéro, donc
   `isCatalogEligible` redevient vrai au tour suivant.
3. **Le cache préparé se recompose de toute façon** : `mcpVersion` entre dans `catalogKey`
   (`tools.ts:169-182`) et `catalogVersion` est incrémenté sur quatre sites
   (`index.ts:694`, `862`, `897`, `1100`), vérifié croissant sur reconnect par
   `test/mcp/lifecycle.test.ts:306` et `:332` (`toBeGreaterThan(beforeVersion)`) et inchangé
   hors transition par `:275`. *INFERE:* l'attribution exacte de `694` et `897` aux fonctions
   `markDisconnected`/`MCP.status` ; à vérifier en lisant `index.ts:685-700` et
   `index.ts:890-900`. Le point 1 rend cette attribution non bloquante pour le correctif.

## 5. Alternatives considered

**(b) Garder les outils morts, les marquer.** Rejeté sur le coût récurrent. Chacune des ~20
entrées porte description + `inputSchema` JSON renvoyés à **chaque requête**. En ordre de grandeur : ~200-250 tokens par outil, donc **~4 000 à 5 000 tokens par requête** pour
un serveur mort, contre **~18 tokens** pour la ligne d'annonce — rapport de l'ordre de 250x.
*INFERE:* la valeur par outil ; à mesurer en comparant le nombre de tokens de la requête
avant/après correctif (ou en sérialisant le payload `tools` d'une requête réelle et en le
passant au compteur de tokens du provider). L'hypothèse de fond — l'API renvoie description et
schéma de chaque outil à chaque tour — est structurelle, pas une conjecture : le catalogue est
assemblé dans `prepared.catalog` (`tools.ts:188-219`) puis sérialisé à chaque appel.

**(a) strict, sans ligne d'annonce.** Écarté. C'est l'option la moins chère, mais la doctrine
globale ordonne d'utiliser ces outils : un silence ne dit pas *pourquoi*, et le modèle peut
conclure que la mémoire n'est pas configurée et demander à l'utilisateur de l'activer. 18
tokens récurrents contre ~4 500 lever cette ambiguïté. Le format `<unavailable_tools>` est
repris de `<degraded_capabilities>`, que le harnais produit déjà pour exactement ce cas
(observation terrain, session courante).

**Baisser `HEALTH_FAILURE_THRESHOLD` à 1.** Rejeté. Ce seuil est une protection du transport ;
ce qu'il protège, c'est la disponibilité du transport, pas la visibilité. Baisser le seuil
pénalise les cycles de reconnexion sur des pannes brèves sans rien apporter à la
visibilité — c'est le prédicat `isCatalogEligible`, ajouté séparément, qui règle le
problème de visibilité sans toucher au transport.

**Compter sur la seule erreur d'appel, en l'annotant.** Rejeté : cela ne change rien au
catalogue. Le modèle a déjà payé la préparation et l'invocation avant de lire le message
(`index.ts:267`), et rien dans le catalogue ne l'avait averti.

## 6. Risks

- **Régression sur les tests existants.** `test/session/tools-allowlist.test.ts` est le plus
  exposé : il vérifie `leanCoreTools` / `leanPhaseCoreTools` /
  `leanDynamicCapVerdict` (lignes 8, 20, 25, 37, 62, 68, 74). Il reste vert **à condition de
  ne pas toucher `leanCoreTools`** — l'intersection est faite à l'appel (`tools.ts:250`),
  jamais dans la fonction pure. Les tests `test/mcp/lifecycle.test.ts` (assertions
  `catalogVersion` 269-332), `test/mcp/reconnect-policy.test.ts` (`mcpUnavailableMessage`,
  lignes 5, 28, 31, 39) et `test/tool/mcp.test.ts` ne sont pas affectés : ni
  `convertMcpTool`, ni `mcpUnavailableMessage`, ni la boucle de santé ne changent.
- **Coût en tokens / latence ajouté.** Négatif en récurrent, positif une fois. Gain : les
  ~4 000-5 000 tokens par requête d'un serveur mort disparaissent (hypothèse à mesurer, §5).
  Ajout : **~18 tokens** par requête où un serveur est dégradé, plus une ligne de contexte
  système. Latence : un prédicat pur sur un objet déjà en mémoire, plus une intersection de
  tableaux de quelques dizaines d'éléments (`corePresent`, `tools.ts:250`) — négligeable devant
  une requête. Aucun aller-retour réseau ajouté : le gate ne pinge pas, il lit
  `healthFailures`.
- **Injection de prompt.** Le contenu de la ligne d'annonce provient d'un nom de serveur
  déclaré dans la configuration — donc a priori maîtrisé, mais pas fiable par construction,
  puisque le harnais traite déjà les annotations MCP comme non fiables
  (`tools.ts:725` : « MCP annotations are protocol hints from an untrusted server »). La ligne
  doit donc être construite depuis le nom **assaini** — le même `sanitize(clientName)` que
  `tools.ts:207` et `index.ts:1155` — et le nom du serveur doit être échappé pour qu'il ne
  puisse pas fermer la balise et injecter une instruction. Contrainte à écrire dans le code,
  pas seulement dans le commentaire.
- **Cloisonnement de permissions.** Le gate ne doit pas **ajouter** d'outils : il n'en retire
  que des absents. Une régression ici se traduirait par un serveur mort réapparaissant dans
  `corePresent` par un effet de bord sur `catalogVersion`. À couvrir par le test §7.
- **Volatilité perçue du catalogue.** Un serveur qui oscille (ping OK / raté) voit ses outils
  disparaître et revenir d'un tour à l'autre. Acceptable côté modèle (il réessaie), mais à
  surveiller : voir la question du validateur, §9.

## 7. Tests

**Test unitaire 1 — `packages/opencode/test/mcp/catalog-health-gate.test.ts`** (nouveau).
Cible : `isCatalogEligible` et la construction de la ligne d'annonce.

```
cd packages/opencode && bun test test/mcp/catalog-health-gate.test.ts
```

Critères de succès observables :
- `{ status: "connected", healthFailures: 0 }` → `true` ;
- `{ status: "connected", healthFailures: 1 }` → `false` (**c'est le cas P03** : connecté au
  transport, mort en readiness) ;
- `{ status: "connected", healthFailures: 3 }` → `false` ;
- `{ status: "failed", healthFailures: 0 }` → `false` ;
- la ligne produite pour `llm-memory-tool` contient le nom **assaini** et exactement une
  occurrence par serveur, jamais deux lignes pour deux outils du même serveur.

**Test unitaire 2 — étendre `packages/opencode/test/session/tools-allowlist.test.ts`.**
Cible : l'intersection noyau × catalogue. Aligner `core` sur `corePresent`, vérifier
`requiredCount` inchangé quand rien n'est filtré, et `requiredCount` réduit de 5 quand les cinq
outils mémoire sont absents.

```
cd packages/opencode && bun test test/session/tools-allowlist.test.ts
```

Critère de succès : les assertions existantes (lignes 8, 20, 25, 37, 62, 68, 74) restent
vertes **sans modification**, et les nouvelles assertions sur l'intersection passent.

**Non-régression obligatoire, dans la même commande :**

```
cd packages/opencode && bun test test/mcp test/tool/mcp.test.ts test/session/tools-allowlist.test.ts
```

Critère de succès : exit code 0, `test/mcp/lifecycle.test.ts:306` et `:332` toujours
`toBeGreaterThan(beforeVersion)`.

## 8. Effort

`M` — deux fichiers de source modifiés, un prédicat pur, un point d'injection de prompt à
trouver dans l'assemblage système, et le placement du gate qui doit être à la sélection et
non dans le cache préparé.

## 9. Verdict self-assessment

`NEEDS_REVIEW`.

Deux décisions que le validateur doit trancher :

1. **Seuil de visibility.** La proposition retire les outils dès **1** ping raté
   (`healthFailures > 0`), en gardant la déconnexion physique à 3. C'est le choix qui élimine
   le plus de tours perdus, mais un serveur à la limite (ping lent, timeout serré) voit ses
   outils disparaître puis revenir d'un tour à l'autre. Le validateur doit-il accepter ce
   clignotement, ou exiger 2 échecs avant retrait — ce qui laisserait passer ~1 fenêtre de
  .catalog avec des outils morts, au prix de ~2 tours perdus par incident ?
2. **Point d'injection de la ligne.** Le bloc `<degraded_capabilities>` que le modèle reçoit
   aujourd'hui est produit par le harnais, hors application. L'appliquer côté application
   signifie que la même information peut apparaître deux fois (harnais + application) quand
   le serveur est vu par les deux couches. Le validateur doit-il exiger une déduplication, ou
   l'acceptation du doublon comme coût nul (~18 tokens) ?