# P20 — `inspect_batch` sous-exploité ; `AGENTS.md` contredit la doctrine globale

## 1. Problem

Deux défauts indépendants, de nature différente, corrigés séparément en section 4 :

- **(a) défaut d'outillage** — l'outil le plus économe en tours (`inspect_batch`) n'est pas
  choisi, parce que la description de `read` enseigne activement l'inverse, alors que `read`
  est déjà dédupliqué par le harnais sans que cela ne soit écrit dans aucune description.
- **(b) défaut de doctrine** — `packages/opencode/AGENTS.md` prescrit `tmux` sur un profil
  win32/pwsh où la commande n'existe pas, et cette prescription écrase la doctrine globale
  qui l'interdit.

Les deux ne partagent pas la même correction : (a) se corrige dans le texte d'un outil, (b)
dans le texte d'un fichier d'instructions. Deux diffs, deux réversibilités.

## 2. Evidence

### 2.1 Mesure d'efficacité (fournie par l'audit, non rejouée ici)

| grandeur | valeur |
|---|---|
| `inspect_batch` | 2 396,7 car./action — 49 appels, 212 actions, 508 090 car. |
| `read` seul | 3 839,7 car./action — 205 appels, 787 137 car. |
| rapport | 1,602× |

Cohérence arithmétique vérifiée : `508090/212 = 2396,65`, `787137/205 = 3839,69`,
`3839,69/2396,65 = 1,6021`. Les trois chiffres du dossier sont mutuellement cohérents.
`INFERE:` la mesure n'a pas été rejouée ; vérification = rejouer l'agrégation sur les parts
de session de la fenêtre d'audit et comparer `Σ caractères / Σ actions` par `tool`.

### 2.2 (a) — la description de `read` enseigne l'inverse de l'optimum

`packages/opencode/src/tool/read.txt:12` (fichier entier = 14 lignes) :

```
- Call this tool in parallel when you know there are multiple files you want to read.
- Avoid tiny repeated slices (30 line chunks). If you need more context, read a larger window.
- This tool can read image files and PDFs and return them as file attachments.
```

La ligne 12 ne mentionne ni `inspect_batch`, ni le ledger, ni la déduplication. Elle ordonne
« en parallèle », donc N appels `read` — précisément la configuration mesurée à
3 839,7 car./action.

`packages/opencode/src/tool/inspect-batch.ts:266` dit l'inverse, mais dans la description
d'un autre outil :

```
"Group already-known independent inspections to avoid extra model turns; use exact paths, grep include and read offset/limit. Follow truncated results with only the missing relevant range. Duplicate actions reference their primary result rather than repeating content.",
```

`read` est pourtant dédupliqué, et c'est écrit dans le code, pas dans la description :

- `packages/opencode/src/tool/read.ts:350` — `const ledgerKey = ReadLedger.key(filepath, offset, limit)`
- `packages/opencode/src/tool/read.ts:356` — `const seen = ReadLedger.get(ctx.sessionID, ledgerKey)`
- `packages/opencode/src/tool/read.ts:408` — `if (seen && ReadLedger.provenUnchanged(seen, mtime, size)) return unchanged(seen)`
- `packages/opencode/src/tool/read.ts:362` — `output: ReadLedger.stub(filepath, entry) + reminder`
- `packages/opencode/src/tool/read.ts:379` — `output: ReadLedger.duplicateStub(filepath, where) + reminder`
- `packages/opencode/src/tool/read.ts:458` — `const elsewhere = ReadLedger.duplicateOf(ctx.sessionID, contentDigest)`

Le mécanisme `ReadLedger` existe et est complet : `read-ledger.ts:280` (`key`), `:290`
(`fileKey`), `:295` (`digest`), `:306` (`get`), `:310` (`put`), `:324` (`putContent`),
`:375` (`duplicateOf`), `:416` (`provenUnchanged`), `:422` (`stub`), `:434` (`duplicateStub`),
`:446` (`producedStub`). Bornes : `read-ledger.ts:60` `MAX_SESSIONS = 64`, `:63`
`MAX_ENTRIES = 512`, `:76` `FLUSH_MS = 250`.

**Réponse directe : oui, le harnais sait que `read` est dédupliqué, et ce n'est écrit que dans
le code.** Aucune ligne de `read.txt` ne mentionne ce comportement.

Gaspillage mesuré : 6 groupes de lectures EXACTEMENT identiques relus, 8 appels,
10 599 caractères. `INFERE:` 10 599 / 8 = 1 325 car./appel, compatible avec un stub + le
`<system-reminder>` plutôt qu'avec des corps de fichier ; vérification = comparer la taille
d'une sortie `read` retenue contre une sortie `read` normale sur le même fichier.

### 2.3 (a) — l'amplificateur qui rend le stub non gratuit

`packages/opencode/src/tool/read.ts:357` :

```ts
const reminder = loaded.length > 0 ? `\n\n<system-reminder>\n${loaded.map((item) => item.content).join("\n\n")}\n</system-reminder>` : ""
```

Ce `reminder` est concaténé aux **trois** chemins de rétention : `read.ts:362` (`stub`),
`read.ts:379` (`duplicateStub`), `read.ts:397` (`producedStub`). Le chemin le moins cher
réexpédie donc quand même l'instruction fichier-scopée en entier. **Cette amplification
relève de P01** (`src/tool/read.ts:357`) ; P20 la constate et ne la corrige pas.

### 2.4 (b) — le texte réel reçu

`packages/opencode/AGENTS.md:14-17` (le fichier fait 135 lignes) :

```
- Running `bun dev` from `packages/opencode` starts the live interactive TUI. Do not run it as a blocking foreground command when you need to inspect the result.
- Start it in `tmux` instead: `tmux new-session -d -s opencode-dev 'bun dev'`.
- Capture the current TUI output with: `tmux capture-pane -pt opencode-dev`.
- Stop the session explicitly when done: `tmux kill-session -t opencode-dev`.
```

`packages/opencode/src/permission/arity.ts:149` porte encore `tmux: 2, // tmux new -s dev`.

### 2.5 (b) — la doctrine globale contredite

`C:\Users\jeanl\.config\opencodev2\AGENTS.md:26` :

```
5. Never use `Start-Process`, `cmd /c start`, detached/background mode or a native terminal for a temporary long-lived server. Never elevate a dev server.
```

`C:\Users\jeanl\.config\opencodev2\AGENTS.md:22` :

```
1. Start a temporary dev server only via a managed terminal (`mcp-terminal command_run mode=async`); record its handle and port.
```

`C:\Users\jeanl\.config\opencodev2\AGENTS.md:7` fixe le profil : `TypeScript + Effect (v4),
Windows / pwsh7`.

`tmux new-session -d` **est** du mode détaché : la doctrine de la ligne 26 l'interdit
nommément. Conflit frontal, pas d'interprétation.

### 2.6 (b) — pourquoi la contradiction est effective

`C:\Users\jeanl\.config\opencodev2\AGENTS.md:3` :

```
A project-level `AGENTS.md`/`CLAUDE.md` refines this file and wins on conflict.
```

`packages/opencode/src/session/instruction.ts:19` liste `AGENTS.md` parmi les fichiers
d'instruction ; `:88` charge le global (`path.join(global.config, "AGENTS.md")`) ; `:186` —
« The first project-level match wins so we don't stack AGENTS.md/CLAUDE.md from every
ancestor. » Un `AGENTS.md` plus spécifique écrase donc la doctrine globale **par la règle
même que la doctrine globale s'est donnée**.

Livraison : `read.ts:357` concatène le fichier chargé dans chaque résultat de lecture. Durant
cette rédaction j'ai observé **4** blocs `<system-reminder>Instructions from:
C:\jeanluc\opencode-fork\packages\opencode\AGENTS.md</system-reminder>` dans mes propres
résultats d'outils (lectures de `read.txt`, `tools.ts`, `read.ts:346-375`, `read.ts:376-403`),
soit plus que les 2 marqueurs consignés dans le dossier.

### 2.7 Catalogue des contradictions, y compris les verdicts négatifs

| source | contradiction avec la doctrine globale |
|---|---|
| `packages/opencode/AGENTS.md:15-17` (`tmux`) | **OUI** — frontal, et inexécutable sur win32/pwsh |
| `packages/opencode/AGENTS.md:110,112` (`Effect.forkDetach`, « fire-and-forget ») | **NON** — `detach` de *fiber* Effect, pas de détachement de processus OS. Proximité lexicale, pas de conflit. Signalé pour qu'il ne devienne pas un grief. |
| `packages/opencode/AGENTS.md:1-135` (reste) | **NON** — conventions Drizzle, forme de module, règles Effect v4 : aucun conflit |
| `C:\Users\jeanl\.config\opencode\AGENTS.md` (129 lignes) | **NON** — `rg -n "tmux\|Start-Process\|background\|detached\|terminal\|server\|dev server\|foreground"` sur ce fichier : **0 correspondance**. Même profil win32/pwsh (`opencode\AGENTS.md:3`), cycle de vie des serveurs non abordé. |

Une seule contradiction réelle, isolée dans trois lignes.

## 3. Mechanism

### 3.1 (a) — chemin d'exécution de bout en bout

1. À l'ouverture du tour, le modèle voit le catalogue des outils. La première phrase de `read`
   (`read.txt:1`) ne porte aucun signal de regroupement.
   **F3 clos : les descriptions d'outils ne sont PAS tronquées.** La borne de 200 caractères
   n'existe que pour les skills — `rg -n "description.{0,40}(slice|substring|truncat)|(slice|substring|truncat).{0,30}description" packages/opencode/src`
   ne retourne que `src/skill/index.ts:463` (`DESCRIPTION_DISPLAY_CHARS`) et
   `src/skill/select.ts:61` (`.slice(0, 300)`), tous deux sur des skills ; le chemin des
   outils est `src/tool/registry.ts:637`
   (`typeof value.description === "string" ? value.description : undefined`), sans
   troncure. Contrôle complémentaire : `read.txt` fait déjà 1 172 caractères, et la ligne 12
   actuelle (« Call this tool in parallel … ») est délivrée integralement au modèle — donc
   les 85 mots ajoutés par A1+A2 atteindront bien le modèle. Le risque R2 de troncure est
   écarté ; seul le coût en tokens subsiste.
2. Le modèle doit lire 2 fichiers ou plus. Il a alors deux consignes en concurrence :
   `inspect-batch.ts:266` (« group … to avoid extra model turns ») et `read.txt:12`
   (« call this tool in parallel »).
3. **`read.txt:12` l'emporte**, parce qu'elle est (i) attachée à l'outil que le modèle vient
   d'élire, donc proximale, et (ii) plus spécifique : « en parallèle » implique explicitement
   le même outil. Résultat : N appels `read`, la configuration à 3 839,7 car./action.
4. Chaque appel traverse `read.ts:346-462`. Le chemin de rétention sert un stub
   (`read.ts:362`) au lieu du corps du fichier : les octets sont économisés, **mais l'appel et
   le tour sont dépensés**, et le `reminder` de `read.ts:357` est réexpédié quand même.
5. Résultat net : les 6 groupes relus, 8 appels, 10 599 caractères. Le harnais a bien fait son
   travail de déduplication ; il ne peut pas empêcher l'appel.

**Point clé : la déduplication ne peut pas réparer ce défaut.** Le levier est en amont, au
moment du choix d'outil. C'est ce qui fait de (a) un défaut d'outillage et non un défaut de
ledger — le ledger est correct, il est consulté trop tard.

### 3.2 (b) — chemin d'exécution de bout en bout

1. Instruction globale chargée : `instruction.ts:19` (détection), `:88` (global).
2. Instruction projet chargée : `instruction.ts:186`, premier niveau projet gagnant.
3. La règle de préséance `opencodev2/AGENTS.md:3` fait que `packages/opencode/AGENTS.md:15`
   **écrase** `opencodev2/AGENTS.md:26`. L'agent reçoit les deux et suit le plus spécifique.
4. Le bloc est réinjecté à chaque lecture sous `packages/opencode`, via `read.ts:357`, y
   compris sur le chemin de rétention (`read.ts:362`, `:379`, `:397`).
5. Sur le profil win32/pwsh (`opencodev2:7`, `opencode:3`), `tmux new-session -d` est absent
   de la plateforme. L'instruction n'est pas seulement interdite, elle est inexécutable :
   l'agent brûle un tour pour le découvrir, puis un second pour trouver la voie conforme.
   `INFERE:` « 2 tours par serveur de dev » est une estimation de mécanisme, pas une mesure ;
   vérification = rejouer une session qui suit littéralement `AGENTS.md:15` et compter les
   tours jusqu'au premier lancement réussi.

## 4. Proposal

### 4.1 Changement A — défaut d'outillage (a)

**A1 — `packages/opencode/src/tool/read.txt:12`.** Remplacer la ligne qui enseigne le
parallélisme par la règle de seuil, et nommer l'alternative.

```diff
-- Call this tool in parallel when you know there are multiple files you want to read.
+- For two or more known independent targets, issue one `inspect_batch` wave instead of
+  parallel `read` calls: it groups them into a single turn.
+- This tool is already deduplicated per session: re-reading an unchanged or identical range
+  returns a short stub, never the bytes again. Batch the remaining reads instead.
```

**A2 — `packages/opencode/src/tool/inspect-batch.ts:266`.** Porter le seuil et le gain de tour
en tête de description, là où le modèle lit avant d'élire un outil.

```diff
-  "Group already-known independent inspections to avoid extra model turns; use exact paths, grep include and read offset/limit. Follow truncated results with only the missing relevant range. Duplicate actions reference their primary result rather than repeating content.",
+  "Two or more known independent targets belong in one wave: this is the cheapest way to spend a turn on inspection. Group already-known independent inspections to avoid extra model turns; use exact paths, grep include and read offset/limit. Follow truncated results with only the missing relevant range. Duplicate actions reference their primary result rather than repeating content.",
```

**A3 — facultatif, NON inclus par défaut.** Empêcher le `read` retenu en glissant le nom de
l'action manquante dans le stub (`read.ts:362`). **Rejeté par défaut** : le stub est la
réponse la moins chère du harnais ; y ajouter une phrase consomme un budget de contexte déjà
comprimé, et un agent déjà mal orienté peut lire un refus comme une erreur et réessayer.
Laisser A1+A2 mesurer d'abord. Décision à trancher, section 9.

**Volontairement inchangé, et pourquoi :**

- `read.ts:350-462` — le ledger est correct ; le modifier serait du bruit.
- `read.ts:357` — l'amplificateur de réinjection relève de **P01**, pas de P20 (§2.3).
- `lean-output-policy.ts:1-3` (16 actions / 16 000 car. / 4 000 par résultat) et
  `inspect-batch.ts:48,278-279` — les bornes de vague font déjà la sécurité du regroupement.
- `tools.ts:49-51` (`LEAN_CORE_TOOLS` contient `inspect_batch`) et `tools.ts:123-131`
  (`SAFE_PARALLEL_LOCAL_TOOL_IDS`) — la disponibilité est acquise ; le défaut est
  l'incitation, pas l'accès.

### 4.2 Changement B — défaut de doctrine (b)

**B1 — `packages/opencode/AGENTS.md:15-17`.** Retirer la dépendance `tmux` au profit du
protocole managed-terminal, déjà doctrine globale et neutre en plateforme. La ligne 14 est
conservée telle quelle : correcte et compatible.

```diff
-- Start it in `tmux` instead: `tmux new-session -d -s opencode-dev 'bun dev'`.
-- Capture the current TUI output with: `tmux capture-pane -pt opencode-dev`.
-- Stop the session explicitly when done: `tmux kill-session -t opencode-dev`.
+- Start it through a managed terminal instead: `mcp-terminal_command_run mode=async` with
+  `bun dev`, and record the returned command handle. This protocol is platform-neutral; a
+  POSIX-only multiplexer is not available on the Windows/pwsh profile.
+- Read the TUI output with `mcp-terminal_terminal_read target=<handle>`, preferring a bounded
+  `tail` or `grep` over a full-screen dump.
+- Stop it through that same handle with `mcp-terminal_command_cancel` once the turn no longer
+  needs it. Never stop a process this turn did not start.
```

Le remplacement est aligné sur `opencodev2/AGENTS.md:22` (lancement + handle), `:26`
(interdiction du détachement) et `:23` (« Stop only a temporary process started by the current
turn »).

**Volontairement inchangé, et pourquoi :**

- `AGENTS.md:110,112` (`Effect.forkDetach`) — ce n'est pas une contradiction (§2.7) ; le
  réécrire casserait la règle intentionnelle « `init()` is fire-and-forget in production ».
- `src/permission/arity.ts:149` (`tmux: 2`) — devient orphelin. Sans effet (personne n'appelle
  `tmux` via un outil) et hors périmètre P20 ; **finding résiduel** signalé, pas corrigé en
  douce.
- `~/.config/opencodev2/AGENTS.md` et `~/.config/opencode/AGENTS.md` — fichiers de
  *déploiement*, hors du dépôt : rôle de l'opérateur, pas du fork.

### 4.3 Séparation des deux

A et B sont deux diffs dans deux arborescences (`src/tool/` contre `AGENTS.md`), avec des
tests distincts (§7) et des risques distincts (§6). A peut être livré sans B, B sans A.

## 5. Alternatives considered

1. **Durcir le ledger — refuser un `read` dont la clé est présente depuis peu de tours.**
   Rejeté. Cela déplacerait la faute sur le mécanisme qui fonctionne : `read.ts:408` sert
   déjà un stub correct pour le cas inchangé, et `read.ts:379` pour le cas identique ailleurs.
   Le problème est le coût du *choix* en amont, pas la réponse en aval. Le durcissement
   produirait un faux échec là où l'appel est légitime, contre la doctrine fail-open déclarée
   dans `src/config/config.ts:391-393` (« Deterministic and fail-open; it never suppresses a
   call that can mutate »). Bénéfice marginal, risque élevé.
2. **Conditionner `tmux` à POSIX plutôt que le supprimer** — « sur POSIX, tmux ; sinon le
   terminal géré ». Rejeté. La doctrine globale (`opencodev2:26`) interdit le détaché
   *quelle que soit la plateforme* ; une branche `tmux` resterait donc en contradiction sur
   Linux et macOS. Elle réintroduirait exactement le conflit que P20 doit fermer, sur deux
   plateformes au lieu d'une.
3. **Ne corriger que `AGENTS.md` et laisser `read.txt` tel quel.** Rejeté : c'est le levier le
   moins cher du dossier, 2 lignes de texte, aucun risque runtime, et il attaque la cause
   racine de 205 appels `read` contre 49 vagues.
4. **Ajouter un neuvième outil « read_many » dédié.** Rejeté : `inspect_batch` fait déjà
   exactement cela (`inspect-batch.ts:263-266`), est déjà dans le catalogue lean
   (`tools.ts:51`) et est déjà dans le parallel-safe set (`tools.ts:127`). Un alias
   concurrencerait sa propre description au lieu de l'utiliser.

## 6. Risks

| # | risque | statut |
|---|---|---|
| R1 | **Régression sur `read`** : `read.txt` est importé par `read.ts:7` et servi tel quel par `read.ts:482`. Aucun test n'asserte son contenu littéral (`rg -n "read.txt" --glob "*.test.ts"` sur `packages/opencode/test` : 0 hit ; seule constante liée : `prompt-budget.test.ts:30-31`). Risque de régression faible, mais **aucun test ne protège le texte**. | ouvert, couvert par T1 |
| R2 | **Régression sur le budget de contexte** : allonger une description ajoute des tokens à chaque tour. A1 : +≈ 60 mots dans `read.txt`. A2 : +≈ 25 mots dans `inspect-batch.ts:266`. Soit ≈ 85 mots ≈ 110 tokens par tour, sur une base de prompt de plusieurs milliers de tokens. Borne existante à surveiller : `prompt-budget.test.ts:31` `MAX_DESCRIPTION = 200` (§3.1, `INFERE` sur l'application effective de cette borne). | quantifié |
| R3 | **Régression sur le catalogue d'outils** : `test/session/tool-catalog.test.ts` et `test/tool/registry.test.ts` référencent `inspect_batch` ; `test/cli/tui/inspect-batch-tree.test.tsx` et `inspect-batch-align.test.tsx` couvrent son rendu. A2 touche sa description : un test d'alignement de colonnes pourrait être sensible à la longueur. À exécuter en priorité. | ouvert, nommé |
| R4 | **Régression sur `read.test.ts`** : le ledger est couvert (`test/tool/read.test.ts:24,45,828-890`) mais A1 ne le touche pas. En revanche `read.ts:357` reste hors périmètre ; si P01 le corrige plus tard, la concaténation `stub + reminder` de `read.ts:362` change et `read.test.ts:655-666` (chargement `AGENTS.md` dans `metadata.loaded`) est le test à rejouer. | différé à P01 |
| R5 | **B1 affecte le harnais lui-même** : `packages/opencode/AGENTS.md` est une instruction *de ce* dépôt, lue par `instruction.ts:19` et réinjectée par `read.ts:357`. Le risque est réel mais **borné à une instruction textuelle**, sans effet sur le code ni sur le typage ; et le contenu de remplacement est *plus* contraignant pour l'opérateur (handle obligatoire, arrêt par handle, jamais de processus non démarré) qu'il ne l'est aujourd'hui. Le risque résiduel réel est l'inverse de celui redouté : un agent sous Linux/macOS perd `tmux`, qui était un raccourci fonctionnel — mais ce raccourci est interdit par la doctrine, donc le perdre est la correction, pas la régression. | accepté, finding résiduel F1 |
| R6 | **Sécurité** : aucun des deux changements n'accroît une surface d'injection ni une capacité ; A1/A2 sont des constantes de texte, B1 remplace une consigne par une autre de la même famille. Seul point de vigilance : la promesse faite par A1 (« returns a short stub, never the bytes again ») doit rester vraie après toute évolution de P01, sinon elle devient une instruction fausse. | ouvert, lié à P01 |
| R7 | **Dérive de la description** : `read.txt` est la seule description de `read` (`read.ts:482`). Toute divergence future entre le code et ce texte devient invisible. Atténuation : T1. | couvert par T1 |

## 7. Tests

**T1 — contrat de description (nouveau, couvre R1 et R7).**
`packages/opencode/test/tool/read-description.test.ts` : lire `./read.txt` par le même chemin que
`read.ts:7` et asserter trois invariants —
(a) la description ne contient plus `Call this tool in parallel` ;
(b) elle contient `inspect_batch` ;
(c) elle contient un mot de la famille `deduplicat` / `stub`.
Critère de succès : passe après A1 ; échoue avant A1 (à vérifier en retirant le seul diff
`read.txt`).

**T2 — seuil dans la description d'`inspect_batch` (nouveau, couvre R3).**
`packages/opencode/test/tool/inspect-batch-description.test.ts` : asserter que la description
retournée par `InspectBatchTool` contient `Two or more known independent targets`.
Critère : passe après A2.

**T3 — non-régression catalogue et rendu (existant, à rejouer en priorité).**
```
cd packages/opencode && bun test test/cli/tui/inspect-batch-tree.test.tsx test/cli/tui/inspect-batch-align.test.tsx test/session/tool-catalog.test.ts test/tool/registry.test.ts
```
Critère : exit code 0, aucun diff de sortie.

**T4 — non-régression ledger (existant).**
```
cd packages/opencode && bun test test/tool/read.test.ts src/tool/read-ledger.test.ts
```
Critère : exit code 0. A1/A2 ne touchent pas `read.ts`, donc ce test doit être vert **avant
comme après** — c'est le témoin que le changement est purement textuel.

**T5 — budget de contexte (existant, couvre R2).**
```
cd packages/opencode && bun test test/session/context-budget.test.ts
```
`test/session/context-budget.test.ts:421` fixe le cas « loaded config: AGENTS.md + skills stay
within budget » : c'est le test qui détecte l'explosion de contexte due à B1, puisque
`AGENTS.md` est précisément une source de base. Critère : exit code 0.

**T6 — vérification de bout en bout de B1 (manuel, non automatisable).**
`rg -n "tmux" packages/opencode/AGENTS.md` doit renvoyer 0 ligne après B1. Avant B1 : 3 lignes
(`:15`, `:16`, `:17`). Contrôle exécuté aujourd'hui : `rg -n "tmux" packages/opencode` → 5
occurrences, dont 3 dans `AGENTS.md`, 1 dans `src/permission/arity.ts:149`, 1 dans
`src/cli/cmd/tui/util/clipboard.ts:42` (chaîne d'échappement `\x1bPtmux;`, sans rapport).

## 8. Effort

**S** — A1+A2 sont 4 lignes de texte, B1 échange 3 lignes contre 6 ; T1/T2 sont deux fichiers
de quelques lignes. Le seul coût non trivial est la non-régression à rejouer (T3-T5) et la
décision A3 à trancher.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — deux points précis à trancher.

1. **A3 : faut-il durcir le ledger, ou seulement la description ?** Proposition livrée :
   description seulement (A1+A2), ledger inchangé. Le validateur doit confirmer que la
   description seule suffit, ou exiger le refus d'un `read` déjà vu. Rappel : le refus dur a
   été rejeté en §5.1 pour cause de fail-open ; s'il le juge nécessaire, il doit arbitrer
   explicitement contre `src/config/config.ts:391-393`.
2. **B1 : qui applique la modification à `packages/opencode/AGENTS.md` ?** Ce fichier est une
   instruction du harnais qui nous écrit. Le cycle de vie global
   (`.config/opencodev2/AGENTS.md:22-27`) n'a pas de source versionnée dans ce dépôt. Le
   validateur doit trancher si B1 doit être livré dans ce dépôt, ou renvoyé à l'opérateur
   pour ses fichiers de configuration globale, faute de quoi la contradiction reste active
   après livraison.

**Findings résiduels ouverts (ne bloquent pas ce verdict, mais restent OPEN) :**

- **F1 — `src/permission/arity.ts:149` conserve `tmux: 2` après B1.** Entrée de table devenue
  orpheline. Inoffensive aujourd'hui ; à statuer dans une fiche dédiée ou à supprimer avec B1.
  Statut : **OPEN**.
- **F2 — P01 reste propriétaire de `read.ts:357`.** Tant que ce `reminder` est concaténé aux
  trois chemins de rétention (`read.ts:362`, `:379`, `:397`), le stub le moins cher réexpédie
  l'instruction complète, et A1 promet une économie que le mécanisme ne livre pas encore
  entièrement. Statut : **OPEN**, dépendant de P01.
- **F3 — le point de troncure réel du catalogue d'outils n'est pas établi** (§3.1 étape 1) :
  `DESCRIPTION_DISPLAY_CHARS` n'existe que pour les skills (`src/skill/index.ts:459-463`). Si
  le catalogue tronque les descriptions d'outils bien en dessous de 200 caractères, A1 et A2
  pourraient être coupées avant d'atteindre le modèle, ce qui invaliderait le levier.
  Statut : **OPEN**, vérification nommée en §3.1.