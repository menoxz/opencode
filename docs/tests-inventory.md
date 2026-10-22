# Inventaire des tests — `packages/opencode`

Mesuré sur l’arborescence le 2026-10-22 : **489 fichiers de test**, **4674 cas**, **119163 lignes**.

Deux emplacements :

- `test/` — tests d${A}intégration, arborescence miroir de `src/` (CLI, serveur, session, outils, providers).
- `src/**/*.test.ts` — unités colocalisées avec le code qu${A}elles couvrent (session, TUI, jev, eval, tool).

`n` = nombre de cas détectés dans le fichier (`it`/`test` et helpers `*.effect(...)`). C${A}est un comptage par expression régulière : il sert à situer le poids relatif d${A}un fichier, pas à prédire la sortie de `bun test`. Les titres de `describe` sont repris verbatim.

Support partagé (pas des tests) : `test/preload.ts` ; `test/lib/` (`cli-process`, `effect` avec `pollWithTimeout`/`awaitWithTimeout`, `filesystem`, `llm-server` + `llm.wait(n)`, `snapshot`, `test-provider`, `websocket`) ; `test/fake/` (`account`, `auth`, `npm`, `provider`, `skill`) ; `test/fixtures/dummy-mcp-server.mjs` ; `test/fixture/fixture.ts` (fixture `tmpdir` avec nettoyage auto) ; `test/AGENTS.md` (conventions : attendre un signal publié, pas de `sleep` fixe).

## Vue par domaine

| Domaine | Fichiers | Cas | Ce que ça couvre |
|---|---:|---:|---|
| `cli` | 101 | 598 | TUI et CLI : rendu des messages et des outils, palette de commandes, footer, thème, scrollback, dialogues, saisie de prompt, sessions ACP / `run` / `serve`, snapshots d’aide. |
| `session` | 49 | 585 | Cœur de session (intégration) : boucle de prompt, compaction, résumé, arbre de messages, partage, récupération après erreur provider. |
| `tool` | 35 | 370 | Outils exposés au modèle : `read`/`write`/`edit`, `glob`/`grep`, `shell`, `task`, `todo`, `webfetch`/`websearch`, MCP, LSP, troncature de sortie, registre et paramètres. |
| `provider` | 12 | 274 | Fournisseurs LLM : transformation requêtes/réponses (`transform`), catalogue et résolution de modèles, auth OAuth, Copilot, GitLab Duo. |
| `server` | 50 | 253 | Serveur HTTP : routes d’API, SSE, streaming de messages, sessions / projets / fichiers, auth, exercices de contrat `httpapi`. |
| `jev` | 21 | 207 | Modèle de décision Jev : espace d’actions, sélection bornée, politique, compaction, intake, skills, snapshots, validation, verrous de fournisseur. |
| `config` | 11 | 189 | Chargement et fusion de configuration : `opencode.json`, agents, plugins, MCP, permissions, providers, variables d’environnement. |
| `src:session` | 23 | 179 | Unités colocalisées avec `src/session` : contrat d’objectif et DoD, preuves, budget de prompt, compaction, recettes, limites d’étapes, allowlist d’outils, environnements, capsules de phase. |
| `util` | 14 | 139 | Utilitaires transverses : filesystem, glob, wildcard, logs, timeouts, `which`, formatage, data-url, processus, dépôts. |
| `src:cli` | 8 | 130 | Unités colocalisées TUI : nav de session, brouillons de prompt, mode submit, keybinds, scope de session, outils masqués, pile de tours en attente. |
| `src:tool` | 13 | 127 | Unités colocalisées d’outils : ledger de lecture, paramètres, troncature, signature de répétition. |
| `plugin` | 15 | 125 | Système de plugins : chargement, hooks, agents enregistrés par plugin, régressions. |
| `src:jev` | 11 | 118 | Unités Jev colocalisées : client, espace d’actions, sélecteur borné, compaction, validation, snapshots, tools, skills. |
| `file` | 6 | 98 | Couche fichiers : index de recherche, suivi de lectures, watchers, formateurs. |
| `permission` | 3 | 92 | Permissions et approbations : demandes, portée, décisionnaire. |
| `src:eval` | 3 | 91 | Harnais d’évaluation : suite principale, cas golden, tests de régression. |
| `effect` | 6 | 89 | Primitives Effect du dépôt : runtime (`makeRuntime`), `InstanceState`, ponts callback, helpers de test. |
| `acp-next` | 8 | 78 | ACP v2 : conversion de contenu et d’outils, options de config, sessions, usage, snapshots de répertoire. |
| `project` | 7 | 74 | Cycle de vie projet : bootstrap, instances par répertoire, migration, découverte. |
| `guard` | 6 | 64 | Garde-fous du harnais : application des règles, blocages, injections de rappel. |
| `snapshot` | 2 | 58 | Snapshots de fichiers : versionnement, suivi des suppressions, revert. |
| `daemon` | 5 | 55 | Démon : démarrage, arrêt, supervision, verrous de port. |
| `storage` | 6 | 55 | Persistance SQLite : migrations (JSON, workspace-time), schéma, accès. |
| `agent` | 3 | 53 | Définition et résolution des agents : agents natifs, mode plan (sous-agents read-only), agents de plugin. |
| `mcp` | 6 | 45 | Client MCP : connexion, reconnexion, hot-reload, patch SDK, santé du catalogue, OAuth. |
| `lsp` | 5 | 39 | Client LSP : démarrage de serveurs, diagnostics, cycle de vie. |
| `control-plane` | 2 | 36 | Plan de contrôle : routage et arbitrage des décisions. |
| `skill` | 3 | 34 | Skills : découverte, chargement, rendu dans le prompt. |
| `src:memory` | 2 | 32 | Mémoire persistante : stockage et rappel. |
| `filesystem` | 1 | 24 | Abstraction système de fichiers : lecture/écriture, sécurité des chemins. |
| `src:storage` | 1 | 22 | Migration / écriture SQLite. |
| `account` | 2 | 22 | Comptes : dépôt local, service de login, normalisation d’URL, erreurs de transport. |
| `permission-task.test.ts` | 1 | 21 | Test isolé à la racine de `test/` : permissions appliquées aux tâches. |
| `bus` | 3 | 21 | Bus d’événements interne : publication, abonnement, ordre, filtrage. |
| `patch` | 1 | 20 | Application de patchs unifiés. |
| `shell` | 2 | 19 | Shell configuré : résolution, sélection, environnement. |
| `src:skill` | 2 | 16 | Skills : parsing et catalogue. |
| `question` | 1 | 15 | Outil `question`. |
| `acp` | 2 | 13 | Protocole ACP : conformité de l’interface agent, abonnements aux événements. |
| `folder` | 1 | 13 | Modèle de dossiers / répertoires de travail. |
| `src:config` | 3 | 13 | Unités de config : Jev, tasks VSCode, tasks. |
| `memory` | 1 | 12 | _(à préciser)_ |
| `src:mcp` | 4 | 12 | Unités MCP : politique de reconnexion, porte de santé du catalogue, patch SDK, reconnexion. |
| `sync` | 1 | 12 | Synchronisation d’état. |
| `src:prompt-composer` | 1 | 11 | Composition du prompt (sections, ordre). |
| `auth` | 1 | 11 | Authentification : clés API, pool de clés, credentials. |
| `format` | 1 | 11 | Formatage de sortie et de valeurs. |
| `ide` | 1 | 10 | Intégration IDE (connexion éditeur). |
| `background` | 1 | 10 | Tâches d’arrière-plan : cycle de vie des jobs, attente, annulation. |
| `git` | 1 | 10 | Intégration git bas niveau : capture d’état, commits. |
| `pty` | 4 | 8 | Pseudo-terminaux : isolation des sorties, réattachement. |
| `src:self-improve` | 1 | 7 | Boucle d’auto-amélioration. |
| `share` | 1 | 7 | Partage de sessions. |
| `reference` | 1 | 6 | Références de fichiers dans les prompts. |
| `plan-engine` | 1 | 5 | Moteur de planification (DAG d’étapes). |
| `src:document` | 2 | 5 | Extraction de documents et support fournisseur. |
| `id` | 1 | 5 | Génération d’identifiants. |
| `image` | 1 | 5 | Traitement des images en entrée. |
| `src:decision` | 1 | 4 | Modèle de décision (sélection). |
| `v2` | 1 | 4 | Mise à jour incrémentale des messages de session (v2). |
| `flag` | 1 | 3 | Drapeaux de fonctionnalité. |
| `fixture` | 1 | 2 | Auto-test du helper de fixtures. |
| `src:artifact` | 1 | 2 | Artefacts produits par l’agent (`store`). |
| `src:util` | 1 | 2 | Utilitaire colocalisé. |
| `orchestrator` | 1 | 2 | Orchestrateur de sous-agents. |
| `src:qa-proof.test.ts` | 1 | 2 | Preuve QA déterministe (workflow `qa:run`). |
| `installation` | 1 | 0 | Installation / mise à jour du binaire. |

## Détail fichier par fichier

### cli — 101 fichiers, 598 cas

TUI et CLI : rendu des messages et des outils, palette de commandes, footer, thème, scrollback, dialogues, saisie de prompt, sessions ACP / `run` / `serve`, snapshots d’aide.

- `test/cli/account.test.ts` (n=4) — console account display
- `test/cli/acp-next/acp-next-process.test.ts` (n=7) — opencode acp-next (subprocess)
- `test/cli/acp/acp-compatibility-baseline.test.ts` (n=9) — opencode acp verifier compatibility baseline
- `test/cli/acp/acp-process.test.ts` (n=2) — opencode acp (subprocess)
- `test/cli/cmd/tui/aggregate-failures.test.ts` (n=7) — aggregateFailures
- `test/cli/cmd/tui/attention.test.ts` (n=18) — createTuiAttention
- `test/cli/cmd/tui/decision-model.test.ts` (n=5) — decision model picker
- `test/cli/cmd/tui/dialog-workspace-create.test.ts` (n=1) — recentConnectedWorkspaces
- `test/cli/cmd/tui/notifications.test.ts` (n=6) — internal notifications TUI plugin
- `test/cli/cmd/tui/prompt-history.test.ts` (n=5) — prompt history dedupe
- `test/cli/cmd/tui/prompt-part.test.ts` (n=2) — prompt part
- `test/cli/cmd/tui/prompt-traits.test.ts` (n=4) — computePromptTraits
- `test/cli/cmd/tui/provider-options.test.ts` (n=4) — providerOptions
- `test/cli/cmd/tui/sync-undefined-messages.test.tsx` (n=1) — tui sync (#26560)
- `test/cli/cmd/tui/sync.test.tsx` (n=6) — tui sync
- `test/cli/default-command.test.ts` (n=11) — cli.default-command
- `test/cli/effect-cmd-instance-als.test.ts` (n=2) — effect-cmd.ts does not restore legacy instance ALS ; InstanceRef remains the handler context across Effect promise awaits
- `test/cli/error.test.ts` (n=6) — cli.error
- `test/cli/github-action.test.ts` (n=17) — extractResponseText ; formatPromptTooLargeError
- `test/cli/github-remote.test.ts` (n=16) — parses https URL with .git suffix ; parses https URL without .git suffix
- `test/cli/help/help-snapshots.test.ts` (n=1) — opencode CLI help-text snapshots
- `test/cli/import.test.ts` (n=5) — parses valid share URLs ; rejects invalid URLs
- `test/cli/logo.test.ts` (n=3) — OPENCODEV2 logo
- `test/cli/migrate.test.ts` (n=5) — computeMigrationState ; migrateOriginalData
- `test/cli/network.test.ts` (n=3) — network authentication policy
- `test/cli/plugin-auth-picker.test.ts` (n=10) — resolvePluginProviders
- `test/cli/run/entry.body.test.ts` (n=16) — run entry body ; bash display
- `test/cli/run/footer.menu.test.ts` (n=2) — footer menu scrolls before the selected row hits the bottom edge ; footer menu scrolls before the selected row hits the top edge
- `test/cli/run/footer.view.test.tsx` (n=9) — run entry content updates when live commit text changes ; direct command panel renders grouped command palette
- `test/cli/run/permission.shared.test.ts` (n=5) — run permission shared
- `test/cli/run/prompt.shared.test.ts` (n=9) — run prompt shared
- `test/cli/run/question.shared.test.ts` (n=5) — run question shared
- `test/cli/run/run-process.test.ts` (n=?) — opencode run (non-interactive subprocess)
- `test/cli/run/runtime.boot.test.ts` (n=5) — run runtime boot
- `test/cli/run/runtime.queue.test.ts` (n=13) — run runtime queue
- `test/cli/run/runtime.stdin.test.ts` (n=4) — run interactive stdin
- `test/cli/run/scrollback.shared.test.ts` (n=3) — run entry look
- `test/cli/run/scrollback.surface.test.ts` (n=13) — finalizes markdown tables for streamed and coalesced input ; holds markdown code blocks until final commit and keeps newline ownership
- `test/cli/run/session-data.test.ts` (n=13) — run session data
- `test/cli/run/session-replay.test.ts` (n=2) — run session replay
- `test/cli/run/session.shared.test.ts` (n=4) — run session shared
- `test/cli/run/stream.test.ts` (n=1) — run stream bridge
- `test/cli/run/stream.transport.test.ts` (n=21) — run stream transport
- `test/cli/run/subagent-data.test.ts` (n=4) — run subagent data
- `test/cli/run/theme.test.ts` (n=4) — falls back when palette lookup fails ; returns syntax styles and indexed splash colors
- `test/cli/run/variant.shared.test.ts` (n=6) — run variant shared
- `test/cli/serve/serve-process.test.ts` (n=2) — opencode serve (subprocess)
- `test/cli/server-restart.test.ts` (n=11) — cli.server-restart
- `test/cli/smokes/read-only.test.ts` (n=7) — opencode read-only commands (smoke)
- `test/cli/tui/collapse-tool-output.test.ts` (n=3) — a short output is returned untouched ; an overflowing output keeps its last lines, marked with a leading ellipsis
- `test/cli/tui/delivery-badge.test.tsx` (n=4) — a queued prompt shows QUEUED, never STEER ; a steer prompt shows STEER, never QUEUED
- `test/cli/tui/dialog-prompt.test.tsx` (n=2) — dialog prompt submit wins when return is also input newline ; dialog prompt submit can be rebound separately from input submit
- `test/cli/tui/diff-viewer-file-tree-utils.test.ts` (n=22) — diff viewer file tree utilities
- `test/cli/tui/diff-viewer-file-tree.test.tsx` (n=4) — DiffViewerFileTree
- `test/cli/tui/diff-viewer.test.tsx` (n=1) — closing the diff viewer returns to the route it opened from
- `test/cli/tui/editor-context-zed.test.ts` (n=16) — offsetToPosition converts Zed offsets to 1-based editor positions ; resolveZedDbPath skips candidates that cannot be stated
- `test/cli/tui/editor-context.test.tsx` (n=5) — useEditorContext reconnect switches editor server by session directory ; useEditorContext favors configured port over lock files
- `test/cli/tui/guard-injection.test.ts` (n=6) — guards injection
- `test/cli/tui/home-end-resolve.test.tsx` (n=1) — base mode resolves bare home/end to session.first/session.last
- `test/cli/tui/inspect-batch-align.test.tsx` (n=1) — the batch block is indented to the prose gutter and stays one row per action
- `test/cli/tui/inspect-batch-tree.test.tsx` (n=12) — pending and running preserve targets without inventing child execution ; each action takes exactly one row, with its parameters inline and no tree glyph
- `test/cli/tui/instructions-injection.test.ts` (n=9) — instructions injection
- `test/cli/tui/keymap.test.tsx` (n=1) — legacy page key aliases compile as page keys
- `test/cli/tui/layer-resolution.test.tsx` (n=1) — layer resolution: mode vs priority
- `test/cli/tui/navbar.test.ts` (n=8) — navbar offers Session, Config and Logs and registers inline slots, not full screen routes ; the config editor and the trajectory register inline session slots, not routes
- `test/cli/tui/output-disclosure.test.tsx` (n=4) — sizes an output by characters or lines, and summarizes it ; a large output is folded by default and unfolds from the keyboard
- `test/cli/tui/overlay-superpose.test.tsx` (n=2) — fixed: the / overlay owns its plate over a red backdrop ; regression: without the plate the border cells leak the backdrop
- `test/cli/tui/panel-above-prompt.test.tsx` (n=1) — the 
- `test/cli/tui/permission-key-shadow.test.tsx` (n=2) — permission panel answers on return ; permission panel keys survive a mode pushed on top of the stack
- `test/cli/tui/permission-reply-routing.test.tsx` (n=2) — a permission reply names the directory of the session it answers ; a permission reply falls back to the launch directory when the session is unknown
- `test/cli/tui/plugin-add.test.ts` (n=2) — adds tui plugin at runtime from spec ; retries runtime add for file plugins after dependency wait
- `test/cli/tui/plugin-install.test.ts` (n=1) — installs plugin without loading it
- `test/cli/tui/plugin-lifecycle.test.ts` (n=4) — runs onDispose callbacks with aborted signal and is idempotent ; rolls back failed plugin and continues loading next
- `test/cli/tui/plugin-loader-entrypoint.test.ts` (n=8) — loads npm tui plugin from package ./tui export ; does not use npm package exports dot for tui entry
- `test/cli/tui/plugin-loader-pure.test.ts` (n=1) — skips external tui plugins in pure mode
- `test/cli/tui/plugin-loader.test.ts` (n=15) — tui.plugin.loader
- `test/cli/tui/plugin-toggle.test.ts` (n=4) — toggles plugin runtime state by exported id ; deactivating plugin pops pushed mode
- `test/cli/tui/prompt-submit-race.test.ts` (n=2) — Prompt.submit race
- `test/cli/tui/prompt-usage.test.ts` (n=6) — prompt usage helpers
- `test/cli/tui/question-directory-routing.test.tsx` (n=1) — question reply and reject carry the session
- `test/cli/tui/question-mode-shadow.test.tsx` (n=2) — question prompt submits on return and cancels on escape ; question prompt keys survive a mode pushed on top of the stack
- `test/cli/tui/revert-diff.test.ts` (n=1) — revert diff
- `test/cli/tui/server-version.test.ts` (n=5) — tui.server-version
- `test/cli/tui/session-logs-injection.test.tsx` (n=2) — partLabel names an instruction injection instead of a generic synthetic text ; the Logs part block displays the injection provenance and its source files
- `test/cli/tui/session-nav-keybind.test.tsx` (n=1) — the navbar toggle keybind resolves to a leader chord, like the sidebar toggle
- `test/cli/tui/session-nav.view.test.tsx` (n=35) — groups the sessions under a directory header with its session count ; marks an added folder with a plus and leaves the workspace
- `test/cli/tui/session-v2-compaction.view.test.tsx` (n=5) — compaction summary is collapsed by default and expands from the keyboard ; the label is centred between two rules that split the remaining width
- `test/cli/tui/sidebar-context.test.ts` (n=13) — zero output and zero cost are completed usage, not missing data ; reasoning-only and cache-only completions qualify
- `test/cli/tui/sidebar-context.view.test.tsx` (n=1) — context details toggle with a mouse click
- `test/cli/tui/sidebar-footer.test.ts` (n=6) — selectFooterBranch ; formatFooterPath
- `test/cli/tui/sidebar-goal.view.test.tsx` (n=3) — the task contract is one button with its status, and none of its content ; an empty contract still shows its counts, at zero
- `test/cli/tui/slot-replace.test.tsx` (n=1) — replace slot mounts plugin content once
- `test/cli/tui/subagent-bar-format.test.ts` (n=7) — subagent bar helpers
- `test/cli/tui/task-followup.test.ts` (n=4) — tui.task-followup
- `test/cli/tui/theme-store.test.ts` (n=5) — addTheme writes into module theme store ; addTheme keeps first theme for duplicate names
- `test/cli/tui/thinking.test.ts` (n=6) — reasoningSummary
- `test/cli/tui/thread.test.ts` (n=2) — tui thread
- `test/cli/tui/transcript-opacity.test.ts` (n=2) — the transcript ladder is the theme text at half opacity, hue unchanged ; a light theme gets the same relative step
- `test/cli/tui/transcript.test.ts` (n=18) — transcript ; formatAssistantHeader ; formatPart
- `test/cli/tui/use-event.test.tsx` (n=5) — useEvent
- `test/cli/tui/worker-ready.test.ts` (n=4) — first RPC survives a delayed top-level-await import ; readiness also works without a startup delay

### session — 49 fichiers, 585 cas

Cœur de session (intégration) : boucle de prompt, compaction, résumé, arbre de messages, partage, récupération après erreur provider.

- `test/session/agents-md-doctrine.test.ts` (n=2) — packages/opencode/AGENTS.md doctrine
- `test/session/cache-prefix.test.ts` (n=9) — private prefix snapshots
- `test/session/compaction-focus.test.ts` (n=4) — compaction focus
- `test/session/compaction.test.ts` (n=46) — session.compaction.isOverflow ; session.compaction.create ; session.compaction.prune
- `test/session/context-budget.test.ts` (n=2) — bare config: fixed base context stays within budget ; loaded config: AGENTS.md + skills stay within budget
- `test/session/context-dedup.test.ts` (n=7) — H7 — the objective is injected exactly once ; H7 — the dedup guard holds in both directions (mutation) ; H7 — a single reuse capsule
- `test/session/context-file.test.ts` (n=4) — ContextFile.formatContextMarkdown
- `test/session/context-rollout.test.ts` (n=10) — session.context-rollout.resolve ; session.context-rollout service
- `test/session/goal-edit-parser.test.ts` (n=8) — goal-edit-parser
- `test/session/h4-nonmutant-capture.test.ts` (n=3) — H4-A non-mutant 3-step turn ; H4-B mutant 3-step turn (control)
- `test/session/injection-format.test.ts` (n=8) — context injection block ; guard firings block
- `test/session/instruction-discovery-cache.test.ts` (n=5) — Instruction.systemPaths memoization (H5)
- `test/session/instruction.test.ts` (n=16) — Instruction.resolve ; Instruction.system ; Instruction.systemPaths global config
- `test/session/lean-advisory-dod-fidelity.test.ts` (n=7) — risk advisory DoD fidelity
- `test/session/llm-native-recorded.test.ts` (n=?) — session.llm native recorded
- `test/session/llm-native.test.ts` (n=17) — session.llm-native.request
- `test/session/llm.test.ts` (n=26) — session.llm.hasToolCalls ; session.llm.ai-sdk adapter ; session.llm.stream
- `test/session/loop-counter.test.ts` (n=33) — callsPerStep ; batchNudge ; nudgeText
- `test/session/message-v2.test.ts` (n=60) — session.message-v2.toModelMessage ; session.message-v2.fromError ; session.message-v2.latest
- `test/session/messages-pagination.test.ts` (n=51) — MessageV2.page ; MessageV2.stream ; MessageV2.parts
- `test/session/overflow.test.ts` (n=8) — Overflow limits ; Overflow read-heavy trigger
- `test/session/processor-effect.test.ts` (n=16) — session.processor effect tests capture llm input cleanly ; session.processor effect tests preserve text start time
- `test/session/prompt-queue-withdraw.test.ts` (n=7) — un prompt en file derrière le tour en cours est annulable ; le prompt que l
- `test/session/prompt-queue.test.ts` (n=28) — compactionTaskParentID ; resolveAnchorUserID ; staleAssistantsAtRunStart
- `test/session/prompt.test.ts` (n=38) — loop exits without an LLM request for interrupted orphan tool calls ; loop calls LLM and returns assistant message
- `test/session/retry-non-destructive.test.ts` (n=4) — H8: a retryable error before the first chunk is still retried ; H8: the default idle watchdog is bounded and generous
- `test/session/retry-transient.test.ts` (n=8) — session.retry.transient ; session.retry.cap
- `test/session/retry.test.ts` (n=31) — session.retry.delay ; session.retry.retryable ; session.message-v2.fromError
- `test/session/revert-after-single-capture.test.ts` (n=1) — revert after a single capture restores the original bytes
- `test/session/revert-compact.test.ts` (n=8) — revert + compact workflow ; revert d
- `test/session/schema-decoding.test.ts` (n=25) — Session.Info ; Session.ProjectInfo ; Session.GlobalInfo
- `test/session/session-schema.test.ts` (n=3) — Session schema
- `test/session/session.test.ts` (n=4) — session.created event ; step-finish token propagation via Bus event ; Session
- `test/session/single-provider-call.test.ts` (n=1) — chains N tool rounds inside a single provider invocation
- `test/session/snapshot-tool-race.test.ts` (n=1) — tool execution produces non-empty session diff (snapshot race)
- `test/session/stall-watch.test.ts` (n=3) — releases the session when the provider phase is never reached ; stays silent once the provider phase starts
- `test/session/steer-pending.test.ts` (n=10) — hasPendingSteer ; isPendingSteerFor ; isSteerDelivered — le reçu de livraison ferme le tour
- `test/session/step-git-spawn.test.ts` (n=2) — a 3-step turn pays at most N+1 git captures ; carrier hash is reused instead of recaptured
- `test/session/structured-output-integration.test.ts` (n=1) — StructuredOutput Integration
- `test/session/structured-output.test.ts` (n=22) — structured-output.OutputFormat ; structured-output.StructuredOutputError ; structured-output.UserMessage
- `test/session/system-prefix-stability.test.ts` (n=2) — keeps the cached system segment byte-identical across a readiness flip ; still moves the system segment when an instruction file changes
- `test/session/system.test.ts` (n=6) — session.system ; session.system Jev skill selection
- `test/session/tool-catalog-reliability.test.ts` (n=7) — tool catalog retrieval reliability
- `test/session/tool-catalog.test.ts` (n=14) — session tool hot-path catalog
- `test/session/tool-search-benchmark.test.ts` (n=3) — tool catalog retrieval benchmark
- `test/session/vision-fallback.test.ts` (n=6) — unreadableImages
- `test/session/working-state-goal-dod.test.ts` (n=2) — hides the persisted contract from the card when goal_dod is off ; the disabled placeholder is inert everywhere a contract is inspected
- `test/session/working-state-runtime.test.ts` (n=?) — _(titres non détectés)_
- `test/session/working-state.test.ts` (n=6) — bounded escaped Unicode and oversized structured values cannot break out ; long history remains immutable; live card replaces state across compaction snapshots

### tool — 35 fichiers, 370 cas

Outils exposés au modèle : `read`/`write`/`edit`, `glob`/`grep`, `shell`, `task`, `todo`, `webfetch`/`websearch`, MCP, LSP, troncature de sortie, registre et paramètres.

- `test/tool/apply_patch.test.ts` (n=27) — tool.apply_patch freeform
- `test/tool/cache.test.ts` (n=2) — ToolCache.invalidate
- `test/tool/edit.test.ts` (n=27) — tool.edit ; creating new files ; editing existing files
- `test/tool/external-directory.test.ts` (n=7) — tool.assertExternalDirectory
- `test/tool/glob.test.ts` (n=3) — tool.glob
- `test/tool/goal-contract.test.ts` (n=14) — tool.goal-contract
- `test/tool/grep.test.ts` (n=6) — tool.grep
- `test/tool/lsp.test.ts` (n=4) — tool.lsp ; permission metadata
- `test/tool/mcp.test.ts` (n=3) — MCP control tools
- `test/tool/parameters.test.ts` (n=58) — tool parameters ; JSON Schema (wire shape) ; apply_patch
- `test/tool/planning.test.ts` (n=?) — tool.planning
- `test/tool/question.test.ts` (n=2) — tool.question
- `test/tool/read.test.ts` (n=36) — tool.read external_directory permission ; tool.read env file permissions ; tool.read truncation
- `test/tool/registry.test.ts` (n=18) — tool.registry
- `test/tool/repetition-signature.test.ts` (n=6) — signature ignores decorative top-level fields
- `test/tool/repo_clone.test.ts` (n=6) — tool.repo_clone
- `test/tool/repo_overview.test.ts` (n=5) — tool.repo_overview
- `test/tool/session-info.test.ts` (n=2) — session_info limits
- `test/tool/shell-launch-retry.test.ts` (n=1) — tool.shell transient launch
- `test/tool/shell-output-prompt.test.ts` (n=?) — decision-focused terminal instructions
- `test/tool/shell-session.test.ts` (n=6) — tool.shell.session
- `test/tool/shell.test.ts` (n=20) — tool.shell ; tool.shell permissions ; tool.shell abort
- `test/tool/skill.test.ts` (n=2) — tool.skill
- `test/tool/task-evidence-merge.test.ts` (n=2) — tool.task evidence merge
- `test/tool/task.test.ts` (n=26) — tool.task
- `test/tool/tasks-description.test.ts` (n=2) — tasks tool dynamic description
- `test/tool/tasks-store.test.ts` (n=8) — tasks-store.merge ; tasks-store persistence ; tasks-store.logPath
- `test/tool/terminal-output-truncation-root.test.ts` (n=6) — sibling vector: a path merely prefixed by the truncation root is not retained ; traversal vector: a reference climbing out of the truncation root is not retained
- `test/tool/terminal-output.test.ts` (n=9) — structured MCP controls, unknown data, raw-path reuse and exact polling ; polling is bounded and control actions are unchanged
- `test/tool/todo.test.ts` (n=7) — todowrite real service / SQLite
- `test/tool/tool-define.test.ts` (n=6) — Tool.define
- `test/tool/truncation.test.ts` (n=17) — Truncate ; output ; with tool_output config
- `test/tool/webfetch.test.ts` (n=6) — tool.webfetch
- `test/tool/websearch.test.ts` (n=10) — websearch provider ; websearch MCP response parser
- `test/tool/write.test.ts` (n=16) — tool.write ; new file creation ; existing file overwrite

### provider — 12 fichiers, 274 cas

Fournisseurs LLM : transformation requêtes/réponses (`transform`), catalogue et résolution de modèles, auth OAuth, Copilot, GitLab Duo.

- `test/provider/amazon-bedrock.test.ts` (n=19) — Bedrock cross-region prefix detection
- `test/provider/cache-anchor.test.ts` (n=4) — ProviderTransform.message - cache breakpoints
- `test/provider/cf-ai-gateway-e2e.test.ts` (n=3) — cf-ai-gateway end-to-end (regression: #24432)
- `test/provider/digitalocean.test.ts` (n=4) — digitalocean provider autoloads from DIGITALOCEAN_ACCESS_TOKEN ; digitalocean provider.models surfaces cached routers from auth metadata
- `test/provider/discovery.test.ts` (n=2) — discovers models from an OpenAI-compatible /models endpoint when discover is enabled ; does not query /models for providers without discover
- `test/provider/gitlab-duo.test.ts` (n=?) — _(titres non détectés)_
- `test/provider/model-status.test.ts` (n=2) — provider model status schemas
- `test/provider/opencode.test.ts` (n=3) — provider opencode
- `test/provider/prompt-cache-openai-compatible.test.ts` (n=4) — H2 — ProviderTransform.options: promptCacheKey pour @ai-sdk/openai-compatible
- `test/provider/provider.test.ts` (n=89) — provider loaded from env variable ; provider loaded from config with apiKey option
- `test/provider/responses-tool-search.test.ts` (n=5) — installed SDK reproduces missing arguments; boundary preserves local JSON and nonstream name ; stream restores tool-input-start and tool-call names using real SDK SSE parser
- `test/provider/transform.test.ts` (n=139) — ProviderTransform.options - setCacheKey ; ProviderTransform.options - zai/zhipuai thinking ; ProviderTransform.options - google thinkingConfig gating

### server — 50 fichiers, 253 cas

Serveur HTTP : routes d’API, SSE, streaming de messages, sessions / projets / fichiers, auth, exercices de contrat `httpapi`.

- `test/server/auth.test.ts` (n=5) — ServerAuth
- `test/server/global-session-list.test.ts` (n=3) — session.listGlobal
- `test/server/httpapi-authorization.test.ts` (n=9) — HttpApi authorization middleware
- `test/server/httpapi-compression.test.ts` (n=10) — HttpApi compression ; encodes responses ; skips
- `test/server/httpapi-config.test.ts` (n=2) — config HttpApi
- `test/server/httpapi-cors-vary.test.ts` (n=3) — CORS preflight Vary header
- `test/server/httpapi-cors.test.ts` (n=3) — HttpApi CORS
- `test/server/httpapi-error-middleware.test.ts` (n=4) — HttpApi error middleware
- `test/server/httpapi-error-reason.test.ts` (n=6) — error reason extraction ; handler failures over HTTP
- `test/server/httpapi-event-diagnostics.test.ts` (n=6) — /event SSE delivery diagnostics
- `test/server/httpapi-event.test.ts` (n=3) — event HttpApi
- `test/server/httpapi-experimental.test.ts` (n=4) — experimental HttpApi
- `test/server/httpapi-file.test.ts` (n=2) — file HttpApi
- `test/server/httpapi-global.test.ts` (n=2) — global HttpApi
- `test/server/httpapi-instance-context.test.ts` (n=8) — HttpApi instance context middleware
- `test/server/httpapi-instance.test.ts` (n=7) — instance HttpApi
- `test/server/httpapi-listen.test.ts` (n=4) — HttpApi Server.listen
- `test/server/httpapi-logs.test.ts` (n=4) — standalone Logs page
- `test/server/httpapi-mcp-oauth.test.ts` (n=1) — mcp HttpApi OAuth
- `test/server/httpapi-mcp.test.ts` (n=5) — mcp HttpApi
- `test/server/httpapi-mdns.test.ts` (n=3) — HttpApi Server.listen mDNS
- `test/server/httpapi-promptasync-context.test.ts` (n=2) — HttpApi handler context inheritance
- `test/server/httpapi-provider.test.ts` (n=5) — provider HttpApi
- `test/server/httpapi-pty-websocket.test.ts` (n=1) — pty HttpApi websocket input
- `test/server/httpapi-pty.test.ts` (n=4) — pty HttpApi bridge
- `test/server/httpapi-public-openapi.test.ts` (n=12) — PublicApi OpenAPI v2 errors
- `test/server/httpapi-query-schema-drift.test.ts` (n=12) — httpapi query schema drift
- `test/server/httpapi-raw-route-auth.test.ts` (n=2) — HttpApi raw route authorization
- `test/server/httpapi-schema-error-body.test.ts` (n=5) — schema-rejection wire shape
- `test/server/httpapi-sdk.test.ts` (n=?) — HttpApi SDK
- `test/server/httpapi-session-directory.test.ts` (n=3) — session-scoped workspace routing (plan)
- `test/server/httpapi-session.test.ts` (n=16) — session HttpApi
- `test/server/httpapi-sync.test.ts` (n=2) — sync HttpApi
- `test/server/httpapi-ui.test.ts` (n=11) — HttpApi UI fallback
- `test/server/httpapi-workspace-routing.test.ts` (n=9) — HttpApi workspace routing middleware
- `test/server/httpapi-workspace.test.ts` (n=9) — workspace HttpApi
- `test/server/negative-tokens-regression.test.ts` (n=1) — messages endpoint tolerates legacy negative token counts
- `test/server/permission-reply-cross-instance.test.ts` (n=4) — replyAnywhere
- `test/server/project-init-git.test.ts` (n=2) — project.initGit endpoint
- `test/server/proxy-util.test.ts` (n=13) — ProxyUtil ; websocketTargetURL ; websocketProtocols
- `test/server/sdk-error-shape.test.ts` (n=2) — v2 SDK error shape
- `test/server/sdk-v1-smoke.test.ts` (n=4) — v1 SDK runtime smoke
- `test/server/session-actions.test.ts` (n=1) — session action routes
- `test/server/session-diff-missing-patch.test.ts` (n=1) — session diff with missing patch (#26574)
- `test/server/session-list.test.ts` (n=8) — session.list
- `test/server/session-messages.test.ts` (n=5) — session messages endpoint
- `test/server/session-select.test.ts` (n=3) — tui.selectSession endpoint
- `test/server/workspace-proxy.test.ts` (n=4) — HttpApi workspace proxy
- `test/server/workspace-routing.test.ts` (n=18) — isLocalWorkspaceRoute ; getWorkspaceRouteSessionID ; workspaceProxyURL
- `test/server/worktree-endpoint-repro.test.ts` (n=?) — worktree endpoint reproduction

### jev — 21 fichiers, 207 cas

Modèle de décision Jev : espace d’actions, sélection bornée, politique, compaction, intake, skills, snapshots, validation, verrous de fournisseur.

- `test/jev/catalogue.test.ts` (n=6) — JevCatalogue.parseHostModels ; JevCatalogue.PRESET_MODELS
- `test/jev/client.test.ts` (n=14) — jev.client key precedence ; jev.client host and model ; jev.client decide
- `test/jev/compaction.test.ts` (n=23) — JevCompaction.candidatesFromText ; JevCompaction.clampState ; JevCompaction.auditState
- `test/jev/complexity.test.ts` (n=12) — jev.complexity questions ; jev.complexity interpret ; jev.complexity classify
- `test/jev/decide.test.ts` (n=7) — jev.decide fallbacks ; jev.decide circuit breaker
- `test/jev/guard.test.ts` (n=5) — jev.guard
- `test/jev/intake-hooks.test.ts` (n=3) — jev intake hook
- `test/jev/intake-ledger.test.ts` (n=2) — context ledger raw retention
- `test/jev/intake.test.ts` (n=13) — jev intake segmentation ; jev intake decision ; jev intake apply
- `test/jev/live.test.ts` (n=2) — selects the BPMN skill for an SRS cartography request ; keeps the shell tool for a build-and-test request
- `test/jev/memo.test.ts` (n=9) — jev guard memoisation
- `test/jev/next-action.test.ts` (n=7) — next action question ; one round-trip per step
- `test/jev/plan.test.ts` (n=10) — JevPlan.planQuestions ; JevPlan.plan ; JevPlan.render
- `test/jev/prefilter.test.ts` (n=13) — jev.prefilter guard ; jev.prefilter relevance
- `test/jev/prune.test.ts` (n=13) — pruneEvents ; heaviestPairs ; rewriteRefuted
- `test/jev/react.test.ts` (n=33) — jev guard policy ; jev untrusted detection ; jev routing
- `test/jev/relevance.test.ts` (n=11) — relevance question ; relevance thresholds ; relevance hook
- `test/jev/schema.test.ts` (n=9) — jev.schema
- `test/jev/skills.test.ts` (n=5) — jev.skills end to end
- `test/jev/tool.test.ts` (n=6) — tool.jev
- `test/jev/tools.test.ts` (n=4) — jev.tools end to end

### config — 11 fichiers, 189 cas

Chargement et fusion de configuration : `opencode.json`, agents, plugins, MCP, permissions, providers, variables d’environnement.

- `test/config/agent-color.test.ts` (n=2) — agent color parsed from project config ; Agent.get includes color from config
- `test/config/config.test.ts` (n=85) — resolvePluginSpec ; deduplicatePluginOrigins ; OPENCODE_DISABLE_PROJECT_CONFIG
- `test/config/decision-model-write.test.ts` (n=4) — Config.hotReloadablePatch ; ConfigJev.writableDecisionModel
- `test/config/entry-name.test.ts` (n=7) — configEntryNameFromPath
- `test/config/global-config-file.test.ts` (n=4) — names the existing opencode.json ; prefers opencode.jsonc when both exist
- `test/config/guard.test.ts` (n=3) — config guards
- `test/config/lsp.test.ts` (n=8) — ConfigLSP.Info refinement ; accepted inputs ; rejected inputs
- `test/config/markdown.test.ts` (n=38) — ConfigMarkdown: normal template ; ConfigMarkdown: frontmatter parsing ; ConfigMarkdown: frontmatter parsing w/ empty frontmatter
- `test/config/parse.test.ts` (n=5) — ConfigParse.schema comment keys
- `test/config/plugin.test.ts` (n=?) — _(titres non détectés)_
- `test/config/tui.test.ts` (n=33) — keeps server and tui plugin merge semantics aligned ; loads tui config with the same precedence order as server config paths

### src:session — 23 fichiers, 179 cas

Unités colocalisées avec `src/session` : contrat d’objectif et DoD, preuves, budget de prompt, compaction, recettes, limites d’étapes, allowlist d’outils, environnements, capsules de phase.

- `src/session/adapters.test.ts` (n=6) — adapter classification ; environment detection
- `src/session/context-ledger.skills.test.ts` (n=7) — brique 2 — one canonical slot per skill ; brique 2 — a repeated skill load is answered from its slot ; brique 2 — freshness is carried by the revision
- `src/session/context-ledger.test.ts` (n=26) — context ledger classification ; context ledger step coalescence ; context ledger coverage
- `src/session/continuation.test.ts` (n=10) — auto-continue instruction ; action-oriented continuation ; hasOpenTodos
- `src/session/environment.test.ts` (n=18) — EnvironmentLedger ; tool outcome interpretation ; MCP result normalization
- `src/session/goal-context.test.ts` (n=6) — sticky goal context ; sticky budget (P06)
- `src/session/goal-deliverable.test.ts` (n=4) — inferDeliverable
- `src/session/goal-evidence.test.ts` (n=3) — sticky goal findings
- `src/session/goal-status-badge.test.ts` (n=2) — formatGoalStatusBadge
- `src/session/lean-advisory.test.ts` (n=3) — Lean advisories
- `src/session/overflow.test.ts` (n=6) — isReadHeavy
- `src/session/phase-capsule.test.ts` (n=2) — phase capsule shadow
- `src/session/progress.test.ts` (n=12) — fingerprint ; ProgressLedger.guard ; ProgressLedger.observe verdicts
- `src/session/prompt-budget.test.ts` (n=5) — core system prompt ; skill catalog block
- `src/session/qa-guardrails.test.ts` (n=12) — qa-guardrails.resolveQaBudget ; qa-guardrails.checkQaBudgets ; qa-guardrails.browserCircuit
- `src/session/recipes.test.ts` (n=7) — RecipeBook ; recipe capsule
- `src/session/step-limit.test.ts` (n=3) — session.prompt.reachedStepLimit
- `src/session/task-evidence.test.ts` (n=1) — task evidence packet
- `src/session/tools-allowlist.test.ts` (n=11) — Lean dynamic core tools ; Live objective keeps its lifecycle tools reachable ; strict session tool allowlist
- `src/session/turn-intent.test.ts` (n=5) — isContinuationPrompt ; classifyUserTurn
- `src/session/turn-plan.test.ts` (n=25) — turn plan declaration is bounded and transient ; turn plan lifecycle is two-staged ; turn plan reconciliation shares the single comparator
- `src/session/unavailable-tools.test.ts` (n=3) — unavailableToolsLine
- `src/session/work-plan.test.ts` (n=2) — session work plan

### util — 14 fichiers, 139 cas

Utilitaires transverses : filesystem, glob, wildcard, logs, timeouts, `which`, formatage, data-url, processus, dépôts.

- `test/util/data-url.test.ts` (n=2) — decodeDataUrl
- `test/util/error.test.ts` (n=6) — util.error
- `test/util/filesystem.test.ts` (n=61) — filesystem ; exists() ; isDir()
- `test/util/format.test.ts` (n=7) — util.format ; formatDuration
- `test/util/glob.test.ts` (n=17) — Glob ; scan() ; scanSync()
- `test/util/iife.test.ts` (n=3) — util.iife
- `test/util/lazy.test.ts` (n=3) — util.lazy
- `test/util/log.test.ts` (n=2) — init cleanup keeps the newest timestamped logs ; local dev log is not truncated twice for the same run
- `test/util/module.test.ts` (n=4) — util.module
- `test/util/process.test.ts` (n=12) — util.process
- `test/util/repository.test.ts` (n=6) — util.repository
- `test/util/timeout.test.ts` (n=2) — util.timeout
- `test/util/which.test.ts` (n=6) — util.which
- `test/util/wildcard.test.ts` (n=8) — match handles glob tokens ; match with trailing space+wildcard matches command with or without args

### src:cli — 8 fichiers, 130 cas

Unités colocalisées TUI : nav de session, brouillons de prompt, mode submit, keybinds, scope de session, outils masqués, pile de tours en attente.

- `src/cli/cmd/tui/component/prompt/drafts.test.ts` (n=7) — TUI per-session prompt drafts
- `src/cli/cmd/tui/component/prompt/submit-mode.test.ts` (n=3) — queues by default while a run is active ; steers only on an explicit request during a run
- `src/cli/cmd/tui/config/keybind.test.ts` (n=3) — keybind defaults
- `src/cli/cmd/tui/context/session-directory.test.ts` (n=8) — session directory routing ; a session is displayed under the directory it executes in
- `src/cli/cmd/tui/context/session-scope.test.ts` (n=13) — session scope
- `src/cli/cmd/tui/routes/session/pending-turn.test.ts` (n=20) — TUI user prompt delivery status
- `src/cli/cmd/tui/routes/session/session-nav.test.ts` (n=72) — TUI session navbar
- `src/cli/cmd/tui/util/hidden-tools.test.ts` (n=4) — bookkeeping tools stay out of the transcript

### src:tool — 13 fichiers, 127 cas

Unités colocalisées d’outils : ledger de lecture, paramètres, troncature, signature de répétition.

- `src/tool/cache.test.ts` (n=5) — ToolCacheService.getStatMtime
- `src/tool/goal-residual.test.ts` (n=5) — blockingResidualFindings ; sessionRunningJobs
- `src/tool/inspect-batch.test.ts` (n=9) — inspect batch planning
- `src/tool/lean-output-policy.test.ts` (n=6) — lean output policy
- `src/tool/protocol-dedupe.test.ts` (n=2) — goal contract catalog dedupe
- `src/tool/read-ledger.test.ts` (n=61) — key ; provenUnchanged ; ledger
- `src/tool/repetition.test.ts` (n=16) — signature ; failure rule ; idle-output rule
- `src/tool/repo_overview.test.ts` (n=2) — repo_overview progressive disclosure
- `src/tool/search-index.test.ts` (n=13) — extractRequiredTrigrams (safety) ; SearchIndex real-runtime narrowing (uses the actual ripgrep binary) ; SearchIndex resilience (index build/query failures never break grep)
- `src/tool/session-info.test.ts` (n=1) — session agent metrics
- `src/tool/subagent-summary.test.ts` (n=2) — subagent result contracts
- `src/tool/task-notification.test.ts` (n=1) — task result notification idempotency
- `src/tool/workspace-handoff.test.ts` (n=4) — workspace_handoff

### plugin — 15 fichiers, 125 cas

Système de plugins : chargement, hooks, agents enregistrés par plugin, régressions.

- `test/plugin/auth-override.test.ts` (n=2) — plugin.auth-override ; plugin.config-hook-error-isolation
- `test/plugin/cloudflare.test.ts` (n=4) — omits maxOutputTokens for openai reasoning models on cloudflare-ai-gateway ; keeps maxOutputTokens for openai non-reasoning models
- `test/plugin/codex.test.ts` (n=14) — plugin.codex ; parseJwtClaims ; extractAccountIdFromClaims
- `test/plugin/github-copilot-models.test.ts` (n=3) — preserves temperature support from existing provider models ; clears existing variants so refreshed models calculate provider-specific variants
- `test/plugin/hot-reload.test.ts` (n=3) — plugin hot reload
- `test/plugin/install-concurrency.test.ts` (n=3) — plugin.install.concurrent
- `test/plugin/install.test.ts` (n=21) — plugin.install.task
- `test/plugin/loader-shared.test.ts` (n=28) — plugin.loader.shared
- `test/plugin/meta.test.ts` (n=3) — plugin.meta
- `test/plugin/opencode.test.ts` (n=1) — declares an API key method for the opencode provider
- `test/plugin/reload-rollback.test.ts` (n=1) — plugin reload atomicity
- `test/plugin/shared.test.ts` (n=12) — parsePluginSpecifier
- `test/plugin/trigger.test.ts` (n=2) — plugin.trigger
- `test/plugin/workspace-adapter.test.ts` (n=1) — plugin.workspace
- `test/plugin/xai.test.ts` (n=27) — plugin.xai ; accessTokenIsExpiring ; buildAuthorizeUrl

### src:jev — 11 fichiers, 118 cas

Unités Jev colocalisées : client, espace d’actions, sélecteur borné, compaction, validation, snapshots, tools, skills.

- `src/jev/action-space.test.ts` (n=10) — JevBrowserActionSpace.space
- `src/jev/client.provider-lock.test.ts` (n=22) — JevClient.provider lock ; JevClient.apiKey ; JevClient.isProviderHost
- `src/jev/compact.test.ts` (n=14) — JevCompact.windowsFromText ; JevCompact.parsePlan ; JevCompact.applyPlan
- `src/jev/harness.test.ts` (n=10) — JevHarness.render ; JevHarness.parse
- `src/jev/intake.test.ts` (n=4) — JevIntake.intakeApplies ; JevIntake.decide without answers
- `src/jev/policy.test.ts` (n=7) — JevBrowserPolicy.preview ; JevBrowserPolicy.run without a key ; JevBrowserActionSpace and the validator agree on head names
- `src/jev/selector-bound.test.ts` (n=3) — JevSkills.select is bounded ; JevTools.select is bounded
- `src/jev/skills.test.ts` (n=9) — JevSkills is opt-in and fail-open ; JevSkills.questions ; JevSkills.decide
- `src/jev/snapshot.test.ts` (n=14) — JevBrowserSnapshot.toElements ; JevBrowserSnapshot.bind ; JevBrowserSnapshot.plan
- `src/jev/tools.test.ts` (n=9) — JevTools is opt-in and fail-open ; JevTools.questions ; JevTools.decide
- `src/jev/validate.test.ts` (n=16) — JevBrowserValidate.target ; JevBrowserValidate.decision

### file — 6 fichiers, 98 cas

Couche fichiers : index de recherche, suivi de lectures, watchers, formateurs.

- `test/file/fsmonitor.test.ts` (n=4) — file fsmonitor
- `test/file/ignore.test.ts` (n=1) — match nested and non-nested
- `test/file/index.test.ts` (n=56) — file/index Filesystem patterns ; read() - text content ; read() - binary content
- `test/file/path-traversal.test.ts` (n=19) — Filesystem.contains ; containsPath
- `test/file/ripgrep.test.ts` (n=12) — file.ripgrep
- `test/file/watcher.test.ts` (n=6) — publishes root create, update, and delete events ; watches non-git roots

### permission — 3 fichiers, 92 cas

Permissions et approbations : demandes, portée, décisionnaire.

- `test/permission/arity.test.ts` (n=6) — arity 1 - unknown commands default to first token ; arity 2 - two token commands
- `test/permission/jev-guard.test.ts` (n=7) — permission.jev-guard
- `test/permission/next.test.ts` (n=79) — fromConfig - string value becomes wildcard rule ; fromConfig - object value converts to rules array

### src:eval — 3 fichiers, 91 cas

Harnais d’évaluation : suite principale, cas golden, tests de régression.

- `src/eval/eval.test.ts` (n=73) — EvalScenario definitions ; auto-evaluation concept ; functional validation
- `src/eval/golden/golden.test.ts` (n=4) — golden fingerprints
- `src/eval/regression.test.ts` (n=14) — historicalBaseline ; detectSustained ; format

### effect — 6 fichiers, 89 cas

Primitives Effect du dépôt : runtime (`makeRuntime`), `InstanceState`, ponts callback, helpers de test.

- `test/effect/app-runtime-logger.test.ts` (n=4) — makeRuntime installs EffectLogger through Observability.layer ; AppLayer also installs EffectLogger through Observability.layer
- `test/effect/config-service.test.ts` (n=3) — ConfigService
- `test/effect/instance-state.test.ts` (n=12) — InstanceState caches values per directory ; InstanceState isolates directories
- `test/effect/run-service.test.ts` (n=2) — makeRuntime shares dependent layers through the shared memo map ; makeRuntime inherits InstanceRef from the current fiber
- `test/effect/runner.test.ts` (n=40) — Runner
- `test/effect/runtime-flags.test.ts` (n=28) — RuntimeFlags

### acp-next — 8 fichiers, 78 cas

ACP v2 : conversion de contenu et d’outils, options de config, sessions, usage, snapshots de répertoire.

- `test/acp-next/config-option.test.ts` (n=16) — acp-next config options
- `test/acp-next/content.test.ts` (n=13) — acp-next content conversion ; acp-next replay conversion
- `test/acp-next/directory.test.ts` (n=6) — ACP next directory snapshot
- `test/acp-next/error.test.ts` (n=6) — acp-next.error
- `test/acp-next/service-session.test.ts` (n=12) — ACP next service sessions
- `test/acp-next/session.test.ts` (n=8) — acp-next session state
- `test/acp-next/tool.test.ts` (n=7) — acp-next tool conversion
- `test/acp-next/usage.test.ts` (n=10) — acp-next usage

### project — 7 fichiers, 74 cas

Cycle de vie projet : bootstrap, instances par répertoire, migration, découverte.

- `test/project/instance-bootstrap.test.ts` (n=4) — InstanceStore.provide runs InstanceBootstrap before effect ; CLI bootstrap runs InstanceBootstrap before callback
- `test/project/instance.test.ts` (n=9) — InstanceStore
- `test/project/migrate-global.test.ts` (n=4) — migrateFromGlobal
- `test/project/project.test.ts` (n=33) — Project.fromDirectory ; Project.fromDirectory git failure paths ; Project.fromDirectory with worktrees
- `test/project/vcs.test.ts` (n=12) — Vcs ; Vcs diff
- `test/project/worktree-remove.test.ts` (n=1) — Worktree.remove
- `test/project/worktree.test.ts` (n=11) — Worktree ; makeWorktreeInfo ; create + remove lifecycle

### guard — 6 fichiers, 64 cas

Garde-fous du harnais : application des règles, blocages, injections de rappel.

- `test/guard/discovery.test.ts` (n=6) — guard discovery
- `test/guard/origin.test.ts` (n=3) — guard origin
- `test/guard/state.test.ts` (n=11) — buildGuardState
- `test/guard/triggers.test.ts` (n=31) — guard triggers
- `test/guard/watch.test.ts` (n=11) — guard watch ; guard roots
- `test/guard/wiring.test.ts` (n=2) — wiring SessionPrompt × Guard

### snapshot — 2 fichiers, 58 cas

Snapshots de fichiers : versionnement, suivi des suppressions, revert.

- `test/snapshot/git-launch-retry.test.ts` (n=3) — snapshot git launch retry
- `test/snapshot/snapshot.test.ts` (n=55) — tracks deleted files correctly ; revert should remove new files

### daemon — 5 fichiers, 55 cas

Démon : démarrage, arrêt, supervision, verrous de port.

- `test/daemon/autostart.test.ts` (n=8) — shouldAutoStart ; daemonBinary ; pid helpers
- `test/daemon/console-visibility.test.ts` (n=2) — daemon console visibility
- `test/daemon/learning-artifacts.test.ts` (n=3) — persistLearningArtifacts
- `test/daemon/learnings-shape.test.ts` (n=5) — learnings diff shape
- `test/daemon/pipeline.test.ts` (n=37) — parseHeadlessResult (auto-executor logic) ; TriggerHandler task queue ; AutoMemory learnings

### storage — 6 fichiers, 55 cas

Persistance SQLite : migrations (JSON, workspace-time), schéma, accès.

- `test/storage/census.test.ts` (n=9) — census is read-only ; census on the maintenance timer ; census measurement
- `test/storage/db-migrations.test.ts` (n=7) — Database.applyMigrations
- `test/storage/db.test.ts` (n=3) — Database.getChannelPath
- `test/storage/json-migration.test.ts` (n=22) — JSON to SQLite migration
- `test/storage/storage.test.ts` (n=13) — Storage
- `test/storage/workspace-time-migration.test.ts` (n=1) — workspace time migration

### agent — 3 fichiers, 53 cas

Définition et résolution des agents : agents natifs, mode plan (sous-agents read-only), agents de plugin.

- `test/agent/agent.test.ts` (n=47) — returns default native agents when no config ; build agent has correct default properties
- `test/agent/plan-mode-subagent-bypass.test.ts` (n=5) — [#26514] subagent spawned from plan mode inherits read-only restriction (edit denied) ; [#26514] explore subagent launched from plan mode also stays read-only
- `test/agent/plugin-agent-regression.test.ts` (n=1) — plugin-registered agents appear in Agent.list

### mcp — 6 fichiers, 45 cas

Client MCP : connexion, reconnexion, hot-reload, patch SDK, santé du catalogue, OAuth.

- `test/mcp/headers.test.ts` (n=3) — mcp.headers
- `test/mcp/lifecycle.test.ts` (n=29) — tool execution forwards the AI SDK abort signal to the MCP request ; reload keeps an unchanged connected client hot and preserves the catalog version
- `test/mcp/oauth-auto-connect.test.ts` (n=?) — _(titres non détectés)_
- `test/mcp/oauth-browser.test.ts` (n=?) — _(titres non détectés)_
- `test/mcp/oauth-callback.test.ts` (n=4) — parseRedirectUri ; McpOAuthCallback.ensureRunning
- `test/mcp/oauth-provider.test.ts` (n=9) — McpOAuthProvider.redirectUrl ; McpOAuthProvider.clientMetadata

### lsp — 5 fichiers, 39 cas

Client LSP : démarrage de serveurs, diagnostics, cycle de vie.

- `test/lsp/client.test.ts` (n=12) — LSPClient interop
- `test/lsp/diagnostic.test.ts` (n=4) — boundProjectDiagnostics
- `test/lsp/index.test.ts` (n=8) — lsp.spawn
- `test/lsp/launch.test.ts` (n=1) — lsp.launch
- `test/lsp/lifecycle.test.ts` (n=14) — LSP service lifecycle ; LSP.Diagnostic

### control-plane — 2 fichiers, 36 cas

Plan de contrôle : routage et arbitrage des décisions.

- `test/control-plane/adapters.test.ts` (n=2) — control-plane/adapters
- `test/control-plane/workspace.test.ts` (n=34) — workspace schemas and exports ; workspace CRUD ; workspace sync state

### skill — 3 fichiers, 34 cas

Skills : découverte, chargement, rendu dans le prompt.

- `test/skill/discovery.test.ts` (n=6) — Discovery.pull
- `test/skill/select.test.ts` (n=4) — SkillSelect.interpret
- `test/skill/skill.test.ts` (n=24) — skill

### src:memory — 2 fichiers, 32 cas

Mémoire persistante : stockage et rappel.

- `src/memory/memory.test.ts` (n=29) — tokenize ; scoreBM25 ; hybridRank
- `src/memory/store.test.ts` (n=3) — balancedOr

### filesystem — 1 fichiers, 24 cas

Abstraction système de fichiers : lecture/écriture, sécurité des chemins.

- `test/filesystem/filesystem.test.ts` (n=24) — AppFileSystem ; isDir ; isFile

### src:storage — 1 fichiers, 22 cas

Migration / écriture SQLite.

- `src/storage/maintenance.test.ts` (n=22) — checkpoint ; retentionDays ; cutoff

### account — 2 fichiers, 22 cas

Comptes : dépôt local, service de login, normalisation d’URL, erreurs de transport.

- `test/account/repo.test.ts` (n=13) — list returns empty when no accounts exist ; active returns none when no accounts exist
- `test/account/service.test.ts` (n=9) — login normalizes trailing slashes in the provided server URL ; login maps transport failures to account transport errors

### permission-task.test.ts — 1 fichiers, 21 cas

Test isolé à la racine de `test/` : permissions appliquées aux tâches.

- `test/permission-task.test.ts` (n=21) — Permission.evaluate for permission.task ; Permission.disabled for task tool ; permission.task with real config files

### bus — 3 fichiers, 21 cas

Bus d’événements interne : publication, abonnement, ordre, filtrage.

- `test/bus/bus-effect.test.ts` (n=8) — Bus (Effect-native)
- `test/bus/bus-integration.test.ts` (n=3) — Bus integration: acquireRelease subscriber pattern
- `test/bus/bus.test.ts` (n=10) — Bus ; publish + subscribe ; unsubscribe

### patch — 1 fichiers, 20 cas

Application de patchs unifiés.

- `test/patch/patch.test.ts` (n=20) — Patch namespace ; parsePatch ; maybeParseApplyPatch

### shell — 2 fichiers, 19 cas

Shell configuré : résolution, sélection, environnement.

- `test/shell/preview-window.test.ts` (n=7) — previewWindow ; preview
- `test/shell/shell.test.ts` (n=12) — shell

### src:skill — 2 fichiers, 16 cas

Skills : parsing et catalogue.

- `src/skill/usage.test.ts` (n=11) — score ; prioritize ; record
- `src/skill/watcher.test.ts` (n=5) — skill watcher events

### question — 1 fichiers, 15 cas

Outil `question`.

- `test/question/question.test.ts` (n=15) — ask - remains pending until answered ; ask - adds to pending list

### acp — 2 fichiers, 13 cas

Protocole ACP : conformité de l’interface agent, abonnements aux événements.

- `test/acp/agent-interface.test.ts` (n=1) — acp.agent interface compliance
- `test/acp/event-subscription.test.ts` (n=12) — acp.agent event subscription

### folder — 1 fichiers, 13 cas

Modèle de dossiers / répertoires de travail.

- `test/folder/folder.test.ts` (n=13) — projection des entrées d ; parent d ; parcours réel

### src:config — 3 fichiers, 13 cas

Unités de config : Jev, tasks VSCode, tasks.

- `src/config/jev.test.ts` (n=7) — ConfigJev.resolve ; ConfigJev.Info
- `src/config/tasks-vscode.test.ts` (n=5) — ConfigTasks.fromVscode dependsOn
- `src/config/tasks.test.ts` (n=1) — QA workflow task config

### memory — 1 fichiers, 12 cas

- `test/memory/synthesis.test.ts` (n=12) — parseEmbedding ; cosineSimilarity ; clusterByEmbedding

### src:mcp — 4 fichiers, 12 cas

Unités MCP : politique de reconnexion, porte de santé du catalogue, patch SDK, reconnexion.

- `src/mcp/catalog-health-gate.test.ts` (n=4) — MCP catalog eligibility gate
- `src/mcp/reconnect-policy.test.ts` (n=6) — MCP reconnect policy
- `src/mcp/reconnect.test.ts` (n=1) — MCP auto-reconnect
- `src/mcp/sdk-patch.test.ts` (n=1) — patched mcp sdk hides the console on windows

### sync — 1 fichiers, 12 cas

Synchronisation d’état.

- `test/sync/index.test.ts` (n=12) — SyncEvent ; run ; replay

### src:prompt-composer — 1 fichiers, 11 cas

Composition du prompt (sections, ordre).

- `src/prompt-composer/composer.test.ts` (n=11) — heuristicDetect ; heuristicDetect with tool context ; task prompt structure

### auth — 1 fichiers, 11 cas

Authentification : clés API, pool de clés, credentials.

- `test/auth/auth.test.ts` (n=11) — Auth ; api key pool

### format — 1 fichiers, 11 cas

Formatage de sortie et de valeurs.

- `test/format/format.test.ts` (n=11) — Format

### ide — 1 fichiers, 10 cas

Intégration IDE (connexion éditeur).

- `test/ide/ide.test.ts` (n=10) — ide

### background — 1 fichiers, 10 cas

Tâches d’arrière-plan : cycle de vie des jobs, attente, annulation.

- `test/background/job.test.ts` (n=10) — background.job

### git — 1 fichiers, 10 cas

Intégration git bas niveau : capture d’état, commits.

- `test/git/git.test.ts` (n=10) — Git

### pty — 4 fichiers, 8 cas

Pseudo-terminaux : isolation des sorties, réattachement.

- `test/pty/pty-output-isolation.test.ts` (n=?) — pty
- `test/pty/pty-session.test.ts` (n=1) — pty
- `test/pty/pty-shell.test.ts` (n=3) — pty shell args ; pty configured shell
- `test/pty/ticket.test.ts` (n=4) — PTY websocket tickets

### src:self-improve — 1 fichiers, 7 cas

Boucle d’auto-amélioration.

- `src/self-improve/self-improve.test.ts` (n=7) — updateProfile ; SessionOutcome validation ; applyLearnedParams

### share — 1 fichiers, 7 cas

Partage de sessions.

- `test/share/share-next.test.ts` (n=7) — ShareNext

### reference — 1 fichiers, 6 cas

Références de fichiers dans les prompts.

- `test/reference/reference.test.ts` (n=6) — reference

### plan-engine — 1 fichiers, 5 cas

Moteur de planification (DAG d’étapes).

- `test/plan-engine/validation.test.ts` (n=5) — plan-engine validation

### src:document — 2 fichiers, 5 cas

Extraction de documents et support fournisseur.

- `src/document/extractor.test.ts` (n=3) — document extractor
- `src/document/provider-support.test.ts` (n=2) — document provider support

### id — 1 fichiers, 5 cas

Génération d’identifiants.

- `test/id/id.test.ts` (n=5) — Identifier.monotonic

### image — 1 fichiers, 5 cas

Traitement des images en entrée.

- `test/image/image.test.ts` (n=5) — Image

### src:decision — 1 fichiers, 4 cas

Modèle de décision (sélection).

- `src/decision/model.test.ts` (n=4) — parseModelRef ; DecisionModel.resolve

### v2 — 1 fichiers, 4 cas

Mise à jour incrémentale des messages de session (v2).

- `test/v2/session-message-updater.test.ts` (n=4) — step snapshots carry over to assistant messages ; text ended populates assistant text content

### flag — 1 fichiers, 3 cas

Drapeaux de fonctionnalité.

- `test/flag/experimental-env.test.ts` (n=3) — loadExperimentalEnv

### fixture — 1 fichiers, 2 cas

Auto-test du helper de fixtures.

- `test/fixture/fixture.test.ts` (n=2) — tmpdir

### src:artifact — 1 fichiers, 2 cas

Artefacts produits par l’agent (`store`).

- `src/artifact/store.test.ts` (n=2) — artifact store

### src:util — 1 fichiers, 2 cas

Utilitaire colocalisé.

- `src/util/media.test.ts` (n=2) — media signatures

### orchestrator — 1 fichiers, 2 cas

Orchestrateur de sous-agents.

- `test/orchestrator/runtime-guard.test.ts` (n=2) — dagRuntimeGuard

### src:qa-proof.test.ts — 1 fichiers, 2 cas

Preuve QA déterministe (workflow `qa:run`).

- `src/qa-proof.test.ts` (n=2) — qa proof workflow

### installation — 1 fichiers, 0 cas

Installation / mise à jour du binaire.

- `test/installation/installation.test.ts` (n=?) — installation ; latest ; upgrade


