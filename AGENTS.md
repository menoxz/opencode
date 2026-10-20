# AGENTS.md — opencode-fork

Scope: ce dépôt. Conduite générale = fichier global. Règles détaillées = skills `fork-*` (§ ci-dessous), **chargées à l'usage**, pas injectées ici.
Mesures, recettes, bases d'échecs : `docs/HARNESS.md` (non injecté) — lire quand une ligne porte `(H)`.
Ne pas recopier ce que le harnais injecte déjà : descriptions d'agents et d'outils, échecs récurrents, capacités dégradées. Ni l'inventaire — il dérive.

## Invariants

- Vérifier avant d'affirmer : commande + exit, test, mesure. Un chiffre sans mesure est une opinion.
- Aucune action irréversible ou externe (push, delete, deploy, publish, send) sans accord explicite dans la conversation.
- `push` ⇒ `git.exe push` (pwsh casse `#force`).
- Commit dès qu'un changement est cohérent et vérifié ; ne pas finir sur du travail fini non commité ; `.opencode/tasks.json` est gitignoré ⇒ jamais dans un commit.
- Une règle sans artefact dérive : la doubler d'un contrôle, d'une permission ou d'un test.

## Skills du dépôt — charger avant d'agir

Une skill créée en cours de session n'entre pas dans le catalogue (reload sans effet, mesuré) ⇒ si `skill` ne la connaît pas, lire `.opencode/skills/<nom>/SKILL.md` directement.

| Domaine | Skill | Déclencher quand |
|---|---|---|
| Tests, typecheck, A/B | `fork-tests` | lancer ou écrire un test, échec, `--timeout`, `perf-guard` |
| API, config, sqlite, fins de ligne | `fork-server-api` | route, config, fournisseur, `session_message.seq`, CRLF/LF, `matter` |
| Écrans et flux | `fork-webui` | composant, SSE, deltas, `API_PREFIXES`, style, picker |
| TUI et CLI | `fork-tui-cli` | rendu d'outil, file de prompts, `toolExitCode`, capture |
| Publication, npm, binaire | `fork-release-npm` | publish, version, install, plateforme, GitHub Actions |
| Rien ne répond | `fork-troubleshooting` | page muette, port pris, dialog bloquant, CDP |

## Repères

- Version : `docs/releases/<version>/` ; `PROGRESS.md` est la **seule** autorité de statut.
- Mise à jour de ce fichier : action à faire **maintenant** seulement, une ligne ; le détail va dans la skill du domaine ou `docs/HARNESS.md`.
