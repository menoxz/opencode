# Rapport d'Audit — Opencode v1.18.0

**Date** : 4 juillet 2026  
**Méthodologie** : Inspection statique de `packages/opencode/src` (501 fichiers TS, 59 modules). Posture critique : tout défaut est relevé, aucun bénéfice du doute.

---

## 1. Architecture

### 1.1 God Modules — CRITICAL

Quatre fichiers dépassent 1000 lignes avec plus de 40 imports chacun :
- `session/prompt.ts` — 2760 lignes, 80+ imports
- `provider/provider.ts` — 1896 lignes, 30+ imports
- `session/processor.ts` — 963 lignes, 40+ imports
- `config/config.ts` — 936 lignes, 25+ imports

`session/prompt.ts` gère simultanément la boucle de réponse, le planning, les reminders, la compaction, la réflexion mémoire, le post-mortem, les sous-tâches, les permissions, et la sécurité — le tout dans une seule fonction `runLoop` de ~1000 lignes.

**Impact** : Effets de bord en cascade. Impossible à tester unitairement. Onboarding développeur = semaines.

**Recommandation** : Décomposer `session/prompt.ts` en 5-6 modules spécialisés (`prompt-loop.ts`, `prompt-planning.ts`, `prompt-reflection.ts`, `prompt-security.ts`, `prompt-methodology.ts`). Extraire l'auth provider dans `provider/auth/*.ts`.

### 1.2 Dépendances circulaires implicites — HIGH

`session/prompt.ts` importe `* as Memory from "@/memory"` ET `* as ReflectUse from "@/memory/reflect-use"` — deux chemins vers le même package. `memory/index.ts` importe `post-mortem.ts` qui importe `session/session.ts`, créant une chaîne potentiellement circulaire.

**Recommandation** : Barrels exports stricts. `@/memory` exporte l'interface publique uniquement. Les imports internes (`reflect-use`, `post-mortem`) ne doivent jamais venir de l'extérieur du package.

### 1.3 Pattern Effect.Service incohérent — MEDIUM

- `memory/index.ts` lignes 851-867 : 17 méthodes castées en `as any` pour construire le service.
- `session/system.ts` utilise `Effect.fn` pour `adaptivePrompt` mais n'est pas un `Context.Service`.

L'injection de dépendances est cassée — impossible de mocker en tests.

**Recommandation** : Uniformiser. Tout module partagé DOIT être un `Context.Service` avec un `Layer` associé. Supprimer les 17 `as any` dans `memory/index.ts`.

### 1.4 État global non encapsulé — HIGH

129 occurrences de `process.env` dans `packages/opencode/src` :
- `provider/provider.ts` lignes 285-300 : TODO documenté — "Using process.env directly because Env.set only updates a process.env shallow copy".
- `config/config.ts` ligne 745 : `process.env["OPENCODE_CONSOLE_TOKEN"] = tokenOpt.value`
- `daemon/triggers.ts` : lit `process.env.OPENCODE_TRIGGER_DIR` sans service intermédiaire.

**Recommandation** : Remplacer `Env` par un vrai `Context.Service` avec `ConfigProvider` d'Effect. Toute lecture DOIT passer par ce service. Supprimer les mutations directes de `process.env`.

---

## 2. Sécurité

### 2.1 `as any` comme pratique de typing — CRITICAL

327 occurrences de `any` dans le code source :
- `memory/index.ts` lignes 851-867 : 17 `as any` d'affilée
- `memory/post-mortem.ts` : `(sessions.get as any)(sessionId as any)` — double `as any`
- `memory/llm-decisions.ts` ligne 83 : `(aiGenerateText as any)({...})`
- `tool/registry.ts` ligne 208 : `def.execute(args as any, pluginCtx)`

**Impact** : Le système de types est désactivé dans les sections les plus critiques. Une injection de paramètres dans `tool/registry.ts` passerait sans être détectée.

**Recommandation** : Remplacer chaque `as any` par un typage correct ou un Zod/Effect Schema runtime check. Éliminer des appels AI SDK en important les types depuis `ai`/`@ai-sdk/provider`.

### 2.2 Secrets dans `process.env` — HIGH

- `provider/provider.ts` ligne 291 : `process.env.AWS_BEARER_TOKEN_BEDROCK = auth.key` — réécriture du secret.
- `tool/websearch.ts` lignes 56-57 : clé API PARALLEL lue et injectée en header HTTP.
- `tool/mcp-websearch.ts` lignes 4-5 : clé API EXA interpolée dans une URL (exposée en clair).

**Impact** : Secrets lisibles par tout processus fils. Un dump de `process.env` dans un log expose toutes les clés API.

**Recommandation** : Utiliser le MCP `secret-vault` pour stocker/retrieve les credentials. Ne jamais écrire un secret dans `process.env`. Passer les clés directement aux providers.

### 2.3 Sandboxing tools insuffisant — MEDIUM

- `tool/shell.ts` ligne 419 : `...process.env` passé intégralement au sous-processus.
- `tool/tasks.ts` ligne 185 : merge `process.env` non filtré.
- `lsp/server.ts` : 15 occurrences de `...process.env` passées aux processus LSP.

**Recommandation** : Créer un `SandboxEnv` service avec whitelist stricte. Ne jamais passer `...process.env` brut.

---

## 3. Performance

### 3.1 Pas de batching des appels LLM — HIGH

Chaque appel à `generateText` est individuel. `memory/reflect-use.ts` : appel par tour. `memory/synthesis-runner.ts` : appels séquentiels par cluster.

**Recommandation** : `LLM Batching` service avec `Effect.all()` et limite de concurrence.

### 3.2 Cache inexistant ou local uniquement — MEDIUM

Le seul cache visible est `injectionCache` (Map en mémoire, perdu au redémarrage). Aucun cache pour embeddings mémoire, résolutions de modèles, résultats LSP.

**Recommandation** : Cache deux niveaux : mémoire (TTL court) + SQLite (persistant).

### 3.3 Pas de streaming pour les outils lourds — LOW

`tool/shell.ts` accumule stdout puis retourne en bloc. Pas d'abort possible.

**Recommandation** : `Effect.Stream` avec chunks progressifs et signal d'abort.

---

## 4. Maintenabilité

### 4.1 TODOs abandonnés — CRITICAL

31 TODOs dans le code source :
- `provider/provider.ts` lignes 285, 533 : faille `Env` connue, non résolue.
- `provider/transform.ts` ligne 62 : "TODO: fix this stupid inefficient dogshit function"
- `session/processor.ts` : 17 "TODO(v2): Temporary dual-write" — migration v2 inachevée.
- `agent/agent.ts` ligne 474 : "TODO: clean this up so provider specific logic doesnt bleed over"

**Recommandation** : Plan de remédiation : (1) fixer `Env.set`, (2) terminer migration v2, (3) fixer `transform.ts:62`, (4) extraire logique provider d'`agent.ts`.

### 4.2 `Record<string, any>` partout — HIGH

`session/processor.ts` : `metadata: Record<string, any>` répété 4 fois. `session/llm/request.ts` : options LLM non typées. `tool/goal-contract.ts` : `previous: any`.

**Recommandation** : Schémas Effect/Zod stricts. Pour metadata dynamiques : `Record<string, unknown>` avec guards.

### 4.3 Duplication massive de patterns — HIGH

Chaque module réimplémente `Context.Service` + `Layer` différemment. `session/processor.ts` : 17 dual-writes identiques pour la migration v2.

**Recommandation** : Générateur de service standardisé `createService<T>(...)`. Template unique.

### 4.4 Schémas Zod/Effect Schema incohérents — MEDIUM

Mélange `Schema.Struct` (Effect), `z.object` (Zod), et interfaces TypeScript sans schéma. Données invalides acceptées silencieusement.

**Recommandation** : Toute donnée persistée ou transmise DOIT avoir un schéma avec validation runtime.

---

## 5. Tests

### 5.1 Couverture faible et inégale — HIGH

`memory/memory.test.ts` (334 lignes) couvre bien tokenize/BM25/hybridRank. Mais :
- `session/prompt.ts` (2760 lignes) — aucun test.
- `provider/provider.ts` (1896 lignes) — aucun test.
- `session/processor.ts` (963 lignes) — aucun test.
- Aucun test d'intégration end-to-end trouvé.

**Recommandation** : Priorité absolue : tests unitaires pour les trois plus gros modules. Tests d'intégration CLI avec LLM mocké.

### 5.2 Pas d'isolation de test — MEDIUM

Pas de `TestLayer` ou `TestContext` visible. Pas de helper `inMemory` pour la DB SQLite.

**Recommandation** : Créer un `TestEnv` Layer avec DB `:memory:` et filesystem virtuel.

---

## 6. UX / CLI

### 6.1 Messages d'erreur opaques — HIGH

`index.ts` fail handler affiche l'erreur brute sans suggestion. Pas de différenciation entre `UserError` et `SystemError`.

**Recommandation** : Hiérarchie : `UserError` (suggestion), `SystemError` (log + message friendly), `RetryableError` (timeout).

### 6.2 Pas de feedback progressif — MEDIUM

Migration DB avec barre de progression uniquement si `stderr.isTTY`. Aucune indication "generating..." pendant l'appel LLM.

**Recommandation** : Système de status events via `Bus.publish(Status.Event.Progress(...))`.

### 6.3 Aide CLI inconsistante — LOW

Certaines commandes ont un `describe` riche, d'autres une ligne vague. Pas d'exemples dans `--help`.

**Recommandation** : Template de commande standardisé avec `describe` obligatoire et exemples encouragés.

---

## 7. Synthèse et Priorisation

### Quick Wins (1-3 jours)

| # | Action | Impact |
|---|--------|--------|
| 1 | Éliminer les 17 `as any` dans `memory/index.ts` lignes 851-867 | Type safety |
| 2 | Supprimer les mutations `process.env` dans `provider/provider.ts` (lignes 291, 539) | Sécurité |
| 3 | Remplacer `as any` dans `memory/post-mortem.ts` et `llm-decisions.ts` | Robustesse |
| 4 | Ajouter filtre `process.env` → whitelist dans `tool/shell.ts` | Sandboxing |
| 5 | Créer `UserError` vs `SystemError` dans `index.ts` fail handler | UX erreurs |

### Moyen Terme (1-2 semaines)

| # | Action | Impact |
|---|--------|--------|
| 6 | Corriger `Env.set` pour propager à `process.env` | Architecture |
| 7 | Terminer la migration v2 : supprimer les 17 dual-writes dans `processor.ts` | Dette technique |
| 8 | Décomposer `session/prompt.ts` (2760 lignes) en 5-6 modules | Maintenabilité |
| 9 | Remplacer `Record<string, any>` par des schémas stricts | Type safety |
| 10 | Créer un `TestEnv` Layer avec DB `:memory:` | Testabilité |

### Long Terme (1-3 mois)

| # | Action | Impact |
|---|--------|--------|
| 11 | Uniformiser tous les services en `Context.Service` + `Layer` | Architecture |
| 12 | Implémenter le batching LLM via `Effect.all` | Performance |
| 13 | Cache deux niveaux (mémoire + SQLite) pour embeddings | Performance |
| 14 | Tests unitaires pour `session/prompt.ts`, `provider/provider.ts`, `processor.ts` | Qualité |
| 15 | Tests d'intégration end-to-end avec LLM mocké | Confiance |
| 16 | Système de status events pour feedback progressif | UX |

---

## 8. Conclusion

Le codebase opencode est **fonctionnel mais structurellement fragile**. Les défauts les plus graves sont :

1. **Sécurité** : `process.env` utilisé comme stockage de secrets avec mutations directes.
2. **Typage** : 327 `any` + 17 `as any` d'affilée dans le module mémoire — le système de types est désactivé là où il est le plus nécessaire.
3. **Dette technique** : 31 TODOs dont une migration v2 inachevée avec 17 dual-writes identiques.
4. **Tests** : Les trois plus gros modules (prompt, provider, processor — 5600 lignes) n'ont aucun test.

La bonne nouvelle : le pattern Effect.ts est déjà en place, ce qui rend les corrections architecturales (injection de dépendances, isolation, testabilité) **mécaniquement possibles** sans réécriture complète. Les quick wins proposés peuvent être implémentés en 3 jours avec un impact immédiat sur la sécurité et la maintenabilité.

---

*Rapport généré le 4 juillet 2026 — Audit statique, aucun code modifié.*