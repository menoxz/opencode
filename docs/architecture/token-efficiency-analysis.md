# Token Efficiency — Agent Context Budget Analysis

Date: 2026-08-01 — Fork version: 1.18.58 (installed base: 1.18.56)

## 1. Points d'entrée de données dans le contexte agent

Le système final envoyé au modèle est assemblé dans `session/prompt.ts` (boucle
de prompt), `session/system.ts` (env/skills/adaptive), `session/instruction.ts`
(AGENTS.md) et `session/llm/request.ts` (`prepare()` → `system` + `messages` +
`tools`).

### Cartographie avec tailles mesurées (version installée réelle, 1er tour, C:\jeanluc)

| # | Point d'entrée | Source | Taille (chars) | ~tokens (÷4) | Fréquence |
|---|---|---|---|---|---|
| 1 | PROMPT_CORE (`prompt/core.txt`) | request.ts `prepare()` | 1 449 | 362 | chaque tour |
| 2 | Env (identité modèle + `<env>`) | system.ts `environment()` | 373 | 93 | chaque tour |
| 3 | Shell & tasks (`<shell-and-tasks>`) | system.ts `tasksAndShellGuidance()` | 813 | 203 | chaque tour |
| 4 | Instructions AGENTS.md + config.instructions | instruction.ts `system()` | 9 425 (5 fichiers) | 2 356 | chaque tour |
| 5 | Liste skills (30/178, mode verbose) | system.ts `skills()` | **13 362 → 8 724** | 3 340 → 2 181 | chaque tour (cache par hash message) |
| 6 | Task contract (`<task-contract>`) | prompt.ts `formatGoalContext` | 165–178 | ~45 | chaque tour |
| 7 | Goal reminder (`<goal_reminder>`) | prompt.ts | 496 | 124 | chaque tour |
| 8 | toolList sécurité | system.ts `toolList()` | 0 (mode interactif) | 0 | selon mode |
| 9 | Guidance step 1 (task_context + personality + daemon + plan) | prompt.ts `stepOneTail` → message user | 1 844 | 461 | 1er tour seulement |
| 10 | **Tools (204 réels : natifs + 9 MCP)** | tools.ts `resolve()` → `prepare()` | **~34 Ko (27 natifs en test) ; ~200 Ko estimé (204)** | 8 500–50 000 | chaque tour (hot-path cache) |
| 11 | Messages session (historique) | message-v2.ts `toModelMessagesEffect` | 88 (1er tour) → croît | — | chaque tour |
| 12 | user.system (instructions client API) | message-v2.ts (champ optionnel) | 0 (CLI/TUI) | 0 | clients API seulement |

Ordre de grandeur du système joint (avant/après optimisations, périmètre réel) :
**~22,4 Ko → ~29,9 Ko tracés** dont les nouveaux core/env/instructions (+12 Ko
de traçage honnête) et skills -4,6 Ko. La requête complète (system + messages +
tools) est dominée par le payload tools (jusqu'à ~10× le system prompt).

## 2. Analyse de qualité du contexte builder (v1.18.56)

### Problèmes identifiés

| # | Sévérité | Problème | Impact |
|---|---|---|---|
| P1 | Élevée | Liste de skills verbose injectée à chaque tour (13,4 Ko) : descriptions réelles médiane 474 chars (max 1 137), format XML 5 lignes/skill. Le ranking BM25 garde 30/178 skills même pour « hello ». Le tool `skill`/`skill_search` permet déjà la découverte à la demande — la liste verbose duplique ce service. | ~1 160 tokens/tour gaspillés (~35 % du poste) |
| P2 | Moyenne | `contextSummary.totalSize` sous-estime le système réel : core/env/instructions/user.system ne sont pas tracés (~11 Ko cachés). Le log « prompt context summary » est trompeur pour tout diagnostic de contexte. | Diagnostic faussé |
| P2 | Moyenne | `config.instructions` (`"./rules.md"`) résolues par globUp relatif au répertoire projet : silencieusement perdues quand le fichier est à côté du fichier de config (3 fichiers de l'utilisateur jamais injectés). | Instructions utilisateur ignorées sans erreur |
| P3 | Moyenne | 204 tools envoyés en full (JIT `hot_path.jit_tools` désactivé par défaut). Payload tools = plus gros poste de la requête (~200 Ko avec les 9 serveurs MCP). | Coût dominant par requête |
| P3 | Faible | Le diagnostic `llm.request` (Effect.logDebug) avec tailles exactes n'est pas visible dans les logs par défaut. | Observabilité limitée |
| P3 | Faible | `toolResolution` mesure les NOMS des tools (4 775 chars), pas le payload réel (schémas). | Mesure incomplète |

### Promesses non tenues
- `instruction_injection.skills: "full"` → mode verbose, mais seuls **30/178** skills sont listés : le « full » n'est pas full. Inversement, le format verbose (XML) est ~2,5× plus lourd que summary/caveman pour la même information.
- `config.instructions` documenté comme « Additional instruction files or patterns to include » : les patterns relatifs ne sont pas résolus comme attendu (base = projet, pas config).
- `totalSize` du context summary annoncé comme total du contexte construit : exclut le plus gros morceau fixe.

## 3. Recommandations priorisées (impact tokens vs risque)

| # | Recommandation | Gain estimé | Risque | Statut |
|---|---|---|---|---|
| R1 | Clipper les descriptions à 200 chars dans la liste injectée (les 3 modes) ; le texte complet reste utilisé pour le ranking BM25 et le tool `skill` | -4,6 Ko/tour (-35 % du poste skills) | Très faible (découverte inchangée : nom + 1 ligne suffisent) | ✅ Implémenté (1beffa2e6) |
| R2 | Tracer core/env/instructions dans le contextSummary | Mesure honnête (~+12 Ko affichés) | Nul (logging) | ✅ Implémenté (6a2cb6ced) |
| R3 | Fallback de résolution des `config.instructions` relatifs vers le répertoire de config | Instructions utilisateur réellement injectées (+1,4 Ko utiles) | Très faible (ajout d'un chemin de recherche) | ✅ Implémenté (270ecb738) |
| R4 | Activer le JIT tools (`experimental.hot_path.jit_tools: true`) : gardes existantes (CORE toujours inclus, seuil 30, fallback full si couverture de requête incomplète) | ~150-170 Ko/requête (204 → ~30 tools) | Moyen : un outil non mentionné dans la requête initiale peut manquer en cours de tour | ⏳ Recommandé, à activer par config (déjà implémenté dans le fork) |
| R5 | Passer `instruction_injection.skills` de `full` à `caveman` (format 1 ligne) | ~-4 Ko/tour supplémentaires | Faible (même info, format dense) | ⏳ Choix utilisateur |
| R6 | Exposer le diagnostic `llm.request` (tailles system/tools) au niveau INFO une fois par session | Observabilité | Nul | ⏳ Recommandé |

## 4. Mesures avant / après (version installée réelle)

Conditions identiques : `opencode --log-level DEBUG --print-logs run "list files in current directory"` dans C:\jeanluc, premier tour, 1.18.56 vs 1.18.58.

| Section (chars) | AVANT 1.18.56 | APRÈS 1.18.58 | Delta |
|---|---|---|---|
| skills | 13 362 | **8 724** | **-4 638 (-35 %)** |
| core (nouveau tracé) | — | 1 449 | +1 449 (traçage) |
| env (nouveau tracé) | — | 1 154 | +1 154 (traçage) |
| instructions (traçage + 3 fichiers config récupérés) | (8 063 non tracés) | 9 425 | +1 362 (instructions perdues récupérées) |
| goal + reminder | 661 | 674 | ~ |
| daemon | 1 844 | 1 844 | ~ |
| toolResolution | 4 775 | 4 775 | ~ |
| totalSize tracé | 22 408 | 29 883 | +7 475 (dont +12 028 de traçage honnête ; périmètre comparable : -4 553) |
| instructions config | **3 fichiers perdus** | **3 fichiers injectés** | R3 fix |

Gain net comparable : **-4,6 Ko/tour** (skills), soit ~1 160 tokens/tour économisés,
avec en plus les instructions config enfin injectées. Sur une session de 20 tours :
~23 Ko économisés en skills seuls.

## 5. Tests

- `test/session/context-budget.test.ts` (nouveau) : harnais end-to-end TestLLMServer qui capture la requête réelle, découpe le system prompt en sections et mesure chaque point d'entrée (bare + loaded). Budgets anti-régression.
- `test/skill/skill.test.ts` : clipping des descriptions dans les 3 modes.
- `test/session/instruction.test.ts` : résolution des instructions relatives au config dir.
- Suite session/skill : 34 pass / 0 fail (les 4 échecs observés sur 418 tests sont des flakes préexistants, reproduits sur code propre).
- `bun typecheck` : exit 0.
