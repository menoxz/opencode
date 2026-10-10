# P20 — `packages/opencode/AGENTS.md` prescrit `tmux` : contradiction frontale avec la doctrine globale

> Révisé après verdict FAIL du 2026-10-03 — périmètre réduit à B1, A1/A2 rejetés

## 1. Problem

`packages/opencode/AGENTS.md:15-17` prescrit `tmux` pour lancer le serveur de développement,
alors que le dépôt tourne sur un profil win32/pwsh où `tmux` n'existe pas et où la doctrine
globale interdit nommément le mode détaché. Le fichier projet l'emporte sur la doctrine
globale par la règle de préséance que celle-ci s'est elle-même donnée. Le défaut est un
défaut de doctrine : un texte d'instruction versionné du dépôt contredit le contrat qui le
régit.

**Périmètre.** Cette fiche ne livre qu'un changement : **B1**. Le lot **A1/A2** (inciter à
`inspect_batch` dans les descriptions d'outils) est **rejeté** — motif en §2.1. **A3** est
**exclu**, décision déjà rendue par le validateur (§5.5, §9).

## 2. Evidence

### 2.1 (rejet) A1/A2 — motif du rejet

**A1/A2 rejetés, motif :** leur justification reposait sur un **dénominateur faux**
(« caractères par action » au lieu de « caractères par tour ») et sur une **mesure non
reproductible localement** (agrégation SQL sur `opencode.db`, inaccessible sans shell sur
cette machine). Aucun chiffre issu de cette mesure n'est conservé dans cette fiche.

Le fait rejouable qui suffit à refermer le dossier, relu dans le code :
`packages/opencode/src/session/tools.ts:123-124` :

```
export const SAFE_PARALLEL_LOCAL_TOOL_IDS = [
  "read",
```

`read` est déjà dans le jeu d'exécution parallèle : N lectures parallèles coûtent **un**
tour, comme une vague. Le regroupement n'est donc pas le levier manquant que A1/A2
promettaient d'ouvrir.

### 2.2 (b) — le texte fautif

`packages/opencode/AGENTS.md:12-17` (fichier de 135 lignes) :

```
## Development server

- Running `bun dev` from `packages/opencode` starts the live interactive TUI. Do not run it as a blocking foreground command when you need to inspect the result.
- Start it in `tmux` instead: `tmux new-session -d -s opencode-dev 'bun dev'`.
- Capture the current TUI output with: `tmux capture-pane -pt opencode-dev`.
- Stop the session explicitly when done: `tmux kill-session -t opencode-dev`.
```

La ligne 14 est exacte et compatible ; les trois lignes suivantes sont fautives.

### 2.3 (b) — la doctrine globale contredite

`C:\Users\jeanl\.config\opencodev2\AGENTS.md:22` :

```
1. Start a temporary dev server only via a managed terminal (`mcp-terminal command_run mode=async`); record its handle and port.
```

`:23` — arrêt par le handle enregistré, jamais d'un processus préexistant ou non démarré
par le tour. `:26` :

```
5. Never use `Start-Process`, `cmd /c start`, detached/background mode or a native terminal for a temporary long-lived server. Never elevate a dev server.
```

`:25` exige une confirmation explicite pour tout hôte MCP. `:7` fixe le profil :
`TypeScript + Effect (v4), Windows / pwsh7`.

`tmux new-session -d` **est** du mode détaché : la doctrine de la ligne 26 l'interdit
nommément. Conflit frontal, pas d'interprétation. Et `:7` rend la consigne doublement
inapplicable : `tmux` est absent du profil déclaré.

### 2.4 (b) — pourquoi la contradiction est effective

`C:\Users\jeanl\.config\opencodev2\AGENTS.md:3` :

```
A project-level `AGENTS.md`/`CLAUDE.md` refines this file and wins on conflict.
```

`packages/opencode/src/session/instruction.ts:19` liste `"AGENTS.md"` parmi les fichiers
d'instruction ; `:88` charge le global (`path.join(global.config, "AGENTS.md")`) ; `:186` —
« The first project-level match wins so we don't stack AGENTS.md/CLAUDE.md from every
ancestor. » Un `AGENTS.md` plus spécifique écrase donc la doctrine globale **par la règle
même que la doctrine globale s'est donnée**.

### 2.5 (b) — modèle de réinjection : une fois par tour, pas à chaque lecture

`packages/opencode/src/session/instruction.ts:96-97` :

```
      // Track which instruction files have already been attached for a given assistant message.
      claims: new Map<MessageID, Set<string>>(),
```

La clé est le **MessageID**, pas l'appel de lecture. Le bloc d'instructions est donc
attaché **une fois par tour**. `read.ts:357` concatène le bloc chargé à la sortie de
lecture, y compris sur le chemin de rétention (`read.ts:362`,
`output: ReadLedger.stub(filepath, entry) + reminder`). **Correction de forme imposée par le
verdict** : la version précédente affirmait « à chaque lecture ».

### 2.6 (b) — catalogue des contradictions

| source | contradiction avec la doctrine globale |
|---|---|
| `packages/opencode/AGENTS.md:15-17` (`tmux`) | **OUI** — frontal, et inexécutable sur le profil win32/pwsh |
| `packages/opencode/AGENTS.md:14` | **NON** — exacte et compatible ; conservée telle quelle |
| `packages/opencode/AGENTS.md:112` (`Effect.forkDetach`, « fire-and-forget ») | **NON** — `detach` de *fiber* Effect, pas de détachement de processus OS. Proximité lexicale, pas de conflit ; signalé pour qu'il ne devienne pas un grief. **Citation corrigée** : le dossier citait `:110` ; relu, `:110` est `Effect.forkScoped` pour les consommateurs de flux en arrière-plan, et seul `:112` porte `forkDetach` / « fire-and-forget ». |
| `packages/opencode/AGENTS.md:1-26` et `:106-117` | **NON** — relus dans cette révision : conventions Drizzle, forme de module, règles Effect v4 ; aucun conflit |
| `packages/opencode/AGENTS.md:27-105` et `:118-135` | **non couvert** — non relus dans cette révision (lecture par tranches). Le verdict « reste du fichier = NON » de la version précédente est **retiré**, pas reconduit. |
| `packages/opencode/test/AGENTS.md` (204 lignes) | **NON** — relu intégralement : fixture de répertoire temporaire, helpers Effect, stratégie de synchronisation. Aucun cycle de vie de serveur, aucun `tmux`. |
| `C:\Users\jeanl\.config\opencodev2\AGENTS.md` | le global lui-même, relu : il prescrit le terminal géré et interdit le détaché |
| `C:\Users\jeanl\.config\opencode\AGENTS.md` | hors périmètre — hors dépôt, non modifié par B1, **non relu** dans cette révision ; sa ligne de catalogue est retirée |

Une contradiction réelle confirmée, isolée dans trois lignes.

## 3. Mechanism

1. Instruction globale chargée : `instruction.ts:19` (détection), `:88` (global).
2. Instruction projet chargée : `instruction.ts:186`, premier niveau projet gagnant.
3. La règle de préséance `opencodev2/AGENTS.md:3` fait que `packages/opencode/AGENTS.md:15`
   **écrase** `opencodev2/AGENTS.md:26`. L'agent reçoit les deux et suit le plus spécifique.
4. Le bloc projet est réinjecté **une fois par tour** (`instruction.ts:96-97`, clé
   `MessageID`), concaténé par `read.ts:357`, y compris sur le chemin de rétention
   (`read.ts:362`).
5. Sur le profil win32/pwsh (`opencodev2:7`), `tmux` est absent : l'instruction n'est pas
   seulement interdite, elle est inexécutable — l'agent doit discoverer le conflit avant
   de trouver une voie conforme. `INFERE:` « au moins un tour perdu par serveur de dev » est
   une estimation de mécanisme, pas une mesure ; vérification = rejouer une session qui
   suit littéralement `AGENTS.md:15` et compter les tours jusqu'au premier lancement
   réussi.

## 4. Proposal

**B1 — `packages/opencode/AGENTS.md:15-17`.** Retirer la dépendance `tmux` au profit du
protocole managed-terminal, déjà doctrine globale et neutre en plateforme. La ligne 14 est
conservée telle quelle.

```diff
- Start it in `tmux` instead: `tmux new-session -d -s opencode-dev 'bun dev'`.
- Capture the current TUI output with: `tmux capture-pane -pt opencode-dev`.
- Stop the session explicitly when done: `tmux kill-session -t opencode-dev`.
+ Start it through a managed terminal instead: `mcp-terminal_command_run mode=async` with
+  `bun dev`, and record the returned command handle. This protocol is platform-neutral; a
+  POSIX-only multiplexer is not available on the Windows/pwsh profile.
+ Read the TUI output with `mcp-terminal_terminal_read target=<handle>`, preferring a bounded
+  `tail` or `grep` over a full-screen dump.
+ Stop it through that same handle with `mcp-terminal_command_cancel` once the turn no longer
+  needs it. Never stop a process this turn did not start.
```

Le remplacement est aligné sur `opencodev2/AGENTS.md:22` (lancement + handle), `:23`
(« Stop only a temporary process started by the current turn ») et `:26` (interdiction du
détachement).

**Justification de la dépendance à un serveur d'environnement** (exigence 11 du verdict).
Le texte nommé `mcp-terminal_command_run`, `mcp-terminal_terminal_read` et
`mcp-terminal_command_cancel`, qui sont des outils **MCP d'environnement**, non des outils du
dépôt : leur disponibilité n'est garantie par aucun fichier versionné. B1 peut donc
présumer de cette disponibilité parce que le contrat de déploiement de l'opérateur la
présume déjà, dans les mêmes termes, et l'injecte à chaque tour
(`opencodev2/AGENTS.md:22`) ; il n'ajoute aucune dépendance propre au dépôt et ne crée
aucune divergence avec le texte global. Le risque résiduel — remplacer un échec bruyant
(`tmux` absent) par une dépendance qui peut ne pas être satisfaite — est consigné en R3 et
n'est **pas** écrit dans le diff, le verdict déclarant B1 livrable tel quel.

**Volontairement inchangé, et pourquoi :**

- `AGENTS.md:112` (`Effect.forkDetach`) — ce n'est pas une contradiction (§2.6) ; le
  réécrire casserait la règle intentionnelle « `init()` is fire-and-forget in production ».
- `AGENTS.md:14` — correcte et compatible avec la doctrine ; hors du diff.
- `src/permission/arity.ts:149` (`tmux: 2, // tmux new -s dev`) — devient orphelin. Sans
  effet (aucun agent n'appelle `tmux` via un outil de ce dépôt) et hors périmètre P20 ;
  **finding résiduel** F1, à solder dans le même diff par l'opérateur ou en follow-up.
- `src/cli/cmd/tui/util/clipboard.ts:42`
  (`const sequence = passthrough ? \`\x1bPtmux;\x1b${osc52}\x1b\\\` : osc52`) — séquence
  d'échappement OSC pour le presse-papiers, sans rapport avec le cycle de vie des serveurs.
- `~/.config/opencodev2/AGENTS.md` et `~/.config/opencode/AGENTS.md` — fichiers de
  *déploiement*, hors du dépôt : rôle de l'opérateur, pas du fork.

## 5. Alternatives considered

1. **Conditionner `tmux` à POSIX plutôt que le supprimer** — « sur POSIX, tmux ; sinon le
   terminal géré ». Rejeté. `opencodev2/AGENTS.md:26` interdit le détaché *quelle que soit
   la plateforme* ; une branche `tmux` resterait en contradiction sur Linux et macOS, et
   rouvrirait le conflit sur deux plateformes au lieu d'une.
2. **Supprimer toute la section « Development server » (`AGENTS.md:12-17`).** Rejeté : la
   ligne 14 est exacte ; B1 ne remplace que les trois lignes fautives, ce qui réduit le
   diff et la surface de revue.
3. **Réécrire `AGENTS.md:110-112`** pour lever l'ambiguïté « fire-and-forget ». Rejeté :
   aucun conflit (§2.6). Le réécrire introduirait une ambiguïté réelle là où la règle est
   intentionnelle, et ne corrigerait rien.
4. **Livrer A1/A2 avec un dénominateur corrigé (« caractères par tour »).** Rejeté : le
   regroupement ne coûte pas moins d'un tour que `read`, qui est déjà parallel-safe
   (`src/session/tools.ts:123-124`, §2.1) ; et l'outil visé n'a aucun usage enregistré dans
   la base auditée. `INFERE:` les deux chiffres qui fondaient ce refus viennent de
   l'agrégation `opencode.db` du validateur, non rejouable ici ; **aucun n'est repris** —
   le refus ne repose que sur le fait rejouable cité.
5. **Durcir le ledger — refuser un `read` dont la clé est présente.** Exclu, décision déjà
   rendue par le validateur : le mécanisme est correct et fail-open, et un refus
   produirait un faux échec sur une relecture légitime. A3 reste donc hors du lot.

## 6. Risks

| # | risque | statut |
|---|---|---|
| R1 | **Régression sur les tests existants** : B1 ne modifie qu'un fichier d'instruction Markdown ; il n'entre dans aucune chaîne de code. Les suites citées par la version précédente (`test/tool/read.test.ts`, `src/tool/read-ledger.test.ts`, `test/session/context-budget.test.ts`) ne chargent pas ce fichier. `INFERE:` vérification = `rg -n "AGENTS.md" packages/opencode/test` ; le validateur a établi le même fait pour `context-budget.test.ts` (§7). | couvert par T6 |
| R2 | **Coût en tokens** : le bloc remplace 3 lignes par 7 dans un fichier de 135 lignes, soit +4 lignes net, réinjecté **une fois par tour** (`instruction.ts:96-97`) et non à chaque lecture. `INFERE:` le delta en octets n'est pas chiffré ici ; aucune mesure locale ne le justifie aujourd'hui. Vérification = `git diff --stat packages/opencode/AGENTS.md` après application du diff de §4. Point de vigilance réel, non chiffré ici : sur un tour **retenu** par le ledger, qui est par construction un petit tour, la part relative de ces 4 lignes est plus élevée que sur un tour moyen. | quantifié en lignes, delta octets non mesuré |
| R3 | **Dépendance à un serveur MCP d'environnement** : `packages/opencode/AGENTS.md` est un fichier versionné du dépôt (constaté par le validateur : `git ls-files --error-unmatch` → exit 0), alors que les trois outils `mcp-terminal_*` sont des outils d'environnement dont la connexion n'est garantie par aucun fichier du dépôt. B1 remplace un échec bruyant et détectable (`tmux` absent) par une dépendance qui peut ne pas être satisfaite. Justification en §4 : le contrat global prescrit déjà ce protocole. **Non corrigé dans le diff**, le verdict déclarant B1 livrable tel quel : arbitrage opérateur. | ouvert, déclaré |
| R4 | **Sécurité** : B1 n'ajoute aucune capacité, aucune surface d'injection — c'est une constante de texte. Le contenu de remplacement est *plus* contraignant qu'avant (handle obligatoire, arrêt par handle, jamais un processus non démarré par ce tour) et reproduit les interdits de `opencodev2/AGENTS.md:23` et `:25`. Aucun contournement de permission n'est possible : `src/permission/arity.ts` n'est pas touché. | accepté |
| R5 | **Plateforme** : un agent sous Linux/macOS perd `tmux`, qui était un raccourci fonctionnel. Ce raccourci est interdit par la doctrine ; le perdre est donc la correction, pas la régression. Résiduel connexe : `arity.ts:149` devient orphelin (**F1**). | accepté, finding résiduel F1 |

## 7. Tests

**T6 — vérification de bout en bout de B1 (seul contrôle signifiant, et il est
exécutable).**

```
rg -n "tmux" packages/opencode/AGENTS.md
```

Critère de succès observable : **0 ligne** après B1. Avant B1 : 3 lignes, relues dans cette
révision — `:15` (`tmux new-session -d`), `:16` (`tmux capture-pane`), `:17`
(`tmux kill-session`). Contrôle de non-régression associé : `:14` doit rester inchangée et
le fichier doit conserver ses 135 lignes + 4.

**Tests retirés du plan, avec motif.** T1, T2 (à écrire) et T3, T4, T5 (existants) portaient
sur A1/A2 : hors périmètre après rejet. Deux d'entre eux ne sont de surcroît pas des
garde-fous aujourd'hui — le validateur les a exécutés **avant diff**, et ils sont rouges
pour des causes indépendantes du changement : `bun test test/tool/read.test.ts
src/tool/read-ledger.test.ts` → exit 1 (`ffprobe failed`) ; `bun test
test/session/context-budget.test.ts` → exit 1 (timeout de hook à 5 000 ms). Un critère
« exit 0 » inatteignable aujourd'hui n'est pas une non-régression : ces suites sont donc
citées comme état de référence, pas comme tests. T3 était vert (exit 0) mais ne couvre plus
rien de livré.

**Garde-fou qu'aucun test automatisé ne fournit.** La régression propre à B1 est
documentaire : `test/session/context-budget.test.ts:421` (« loaded config: AGENTS.md +
skills stay within budget ») écrit un `AGENTS.md` **synthétique** dans un répertoire
temporaire — relu, `:425-438` est un `writeText(path.join(dir, "AGENTS.md"), [...])` de
huit lignes de fixture. Ce test ne lit jamais `packages/opencode/AGENTS.md` : il ne peut pas
voir B1. **Statut : résiduel assumé** — le contrôle est T6, manuel et exécutable.

## 8. Effort

**XS** — un patch de 3 lignes échangées contre 7 dans un seul fichier Markdown, un contrôle
exécutable, aucun test à écrire ni baseline à réparer. L'estimation `S` de la version
précédente ne vaut plus : elle comptait les deux suites rouges que cette révision retire du
plan.

## 9. Verdict self-assessment

**READY** pour B1 — le validateur le déclare défendable et livrable tel quel ; la seule
correction de forme qu'il exige (modèle de réinjection : une fois par tour,
`instruction.ts:96-97`) est appliquée en §2.5 et en §3 étape 4.

Restent ouverts, sans bloquer B1 :

- **R3** — dépendance au serveur MCP d'environnement : déclarée et justifiée en §4, non
  écrite dans le diff. Arbitrage opérateur.
- **F1 — `src/permission/arity.ts:149` conserve `tmux: 2` après B1.** Entrée de table
  orpheline, inoffensive. **Statut : hors périmètre** ; à supprimer dans le même diff par
  l'opérateur, ou en follow-up dédiée.
- **A3 — exclu**, décision du validateur, ledger inchangé (§5.5).
- **F3 — sans objet** après le rejet de A1/A2 : le validateur l'a close (les descriptions
  d'outils ne sont pas tronquées). Aucune citation n'en est reprise ici, n'ayant pas été
  relue dans cette révision.
- **Catalogue §2.6 partiellement couvert** : `AGENTS.md:27-105` et `:118-135` n'ont pas été
  relus ; leur verdict antérieur est retiré plutôt que reconduit.
- **Aucun chiffre de la version précédente n'est conservé** : dénominateur « caractères par
  action » faux, et mesure `opencode.db` non rejouable sans shell sur cette machine.

**Note de date.** `docs/harness-audit/verdicts/P20-verdict.md` ne porte aucune date interne ;
la date de l'en-tête est donc la date de cette révision. `INFERE:` vérification =
`git log -1 --format=%ad -- docs/harness-audit/verdicts/P20-verdict.md`.