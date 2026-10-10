# P20 — revalidation après re-scope

## Proposal

`P20` — `packages/opencode/AGENTS.md` prescrit `tmux` : contradiction frontale avec la doctrine globale.

Fichier validé : `docs/harness-audit/proposals/P20-batch-first-doctrine.md` (**278 lignes**
réelles ; C-35 annonce « ~272 », écart d'approximation sans conséquence).

Version relue : le **re-scope** (bandeau ligne 3, « Révisé après verdict FAIL du 2026-10-03 —
périmètre réduit à B1, A1/A2 rejetés »), et non la version initiale de 387 lignes.

**Indépendance.** Je n'ai rédigé ni la proposition initiale, ni `P20-verdict.md`, ni le
re-scope. Toutes les lectures ci-dessous sont des `read` par tranches ; **aucun shell,
aucun `git` n'a été exécuté** (contrainte EPERM du brief). Aucune assertion de ce document
ne repose donc sur une mesure que je n'aie pas produite ou lue moi-même.

**Contrat relu** : `REVALIDATION-BRIEFS.md:1-93`, en particulier la règle
d'implémentabilité (`:51-77`) et la grille d'effort (`:85-93`).
`docs/harness-audit/CORRECTIONS.md:45` (**C-35**) lu : il annonce exactement les trois
résidus que ce document tranche.

## Revisions applied

### Les `Required changes` de la vague 2, point par point

`P20-verdict.md:180-213` liste onze `Required changes`. État de chacun, avec la preuve qui
l'établit :

| # | Required change (vague 2) | État | Preuve |
|---|---|---|---|
| RC1 | refaire la mesure au dénominateur « par tour » | **résolu par suppression** | A1/A2 supprimées. §2.1 (`:20-37`) : « Aucun chiffre issu de cette mesure n'est conservé dans cette fiche. » §5.4 (`:196-201`) : « **aucun n'est repris** ». Aucun des chiffres `10581,1 / 10 369,2 / 1,602× / 1,020× / 1,64` ne survit dans le fichier relu. |
| RC2 | constater que `inspect_batch` a 0 usage, **ou retirer A1/A2** | **résolu** | RC2 offrait explicitement les deux issues. Retrait retenu, et justifié sur un fait rejouable : §2.1 (`:28-33`) cite `src/session/tools.ts:123-124`. **Citation revérifiée** : `src/session/tools.ts:123` = `export const SAFE_PARALLEL_LOCAL_TOOL_IDS = [`, `:124` = `  "read",`. `read` est bien déjà parallel-safe. |
| RC3 | réordonner le remède (ledger vs regroupement) | **résolu par suppression** | Le comparatif dont RC3 exigeait la refonte ne porte plus sur aucun changement livré. |
| RC4 | corriger la chaîne causale « N appels `read` » | **résolu par suppression** | Idem : la chaîne causale visait A1/A2. |
| RC5 | **corriger le modèle de réinjection : une fois par tour, pas à chaque lecture** | **RÉSOLU — vérifié** | §2.5 est bien renommé « (b) — modèle de réinjection : une fois par tour, pas à chaque lecture » (`:90`). §3 étape 4 (`:126-128`) dit « une fois par tour (`instruction.ts:96-97`, clé `MessageID`) ». **Citation revérifiée** : `src/session/instruction.ts:96` = `// Track which instruction files have already been attached for a given assistant message.`, `:97` = `claims: new Map<MessageID, Set<string>>(),`. La clé est bien `MessageID`, pas l'appel de lecture. Correction exacte. |
| RC6 | ajouter le delta par tour à R5 **et remplacer T5** par un test mesurant le **vrai** `packages/opencode/AGENTS.md` | **PREMIÈRE MOITIÉ FAITE, SECONDE INTACTE** | R2 en §6 (`:211`) quantifie le +4 lignes net et signale honnêtement « delta octets non mesuré » + le point de vigilance sur le tour retenu par le ledger. Mais §7 (`:240-245`) : « **Garde-fou qu'aucun test automatisé ne fournit**… **Statut : résiduel assumé** — le contrôle est T6, manuel et exécutable ». **La seconde moitié de RC6 n'est pas faite.** → c'est le résidu R2. |
| RC7 | résoudre A3 dans le texte | **RÉSOLU** | §5.5 (`:202-204`) : « Exclu, décision déjà rendue par le validateur ». §9 (`:267`) : « **A3 — exclu**, décision du validateur, ledger inchangé ». |
| RC8 | réparer ou remplacer T4 et T5 | **résolu par retrait motivé** | §7 (`:230-238`) : les deux suites sont « rouges avant diff » (`ffprobe failed` ; timeout de hook 5 000 ms) et sont citées « comme état de référence, pas comme tests ». Le lot ne revendique plus aucun « exit 0 » inatteignable. C'est la bonne réponse à RC8. |
| RC9 | **corriger deux citations** (`:110`→`:112` ; `tools.ts`→`src/session/tools.ts`) | **RÉSOLU — vérifié** | `packages/opencode/AGENTS.md:110` = « Use `Effect.forkScoped` inside the closure for background stream consumers… » ; `packages/opencode/AGENTS.md:112` = « `src/project/bootstrap.ts` already wraps every service `init()` in `Effect.forkDetach`, so `init()` is fire-and-forget in production. » **Seul `:112` porte `forkDetach` / « fire-and-forget »** : la correction est exacte. La seconde correction est vérifiée ci-dessus (RC2). |
| RC10 | ajouter `packages/opencode/test/AGENTS.md` au catalogue avec verdict | **RÉSOLU** | §2.6 (`:114`) : « relu intégralement : fixture de répertoire temporaire, helpers Effect, stratégie de synchronisation. Aucun cycle de vie de serveur, aucun `tmux`. » *Je n'ai pas relu ce fichier de 204 lignes moi-même ; je retiens cette ligne comme héritée du verdict et non comme revérifiée.* |
| RC11 | B1 : mentionner la dépendance MCP **ou justifier** que `AGENTS.md` peut présumer d'un serveur MCP d'environnement | **RÉSOLU — justifié en §4** | §4 (`:159-168`) : « leur disponibilité n'est garantie par aucun fichier versionné. B1 peut donc présumer de cette disponibilité parce que le contrat de déploiement de l'opérateur la présume déjà, dans les mêmes termes, et l'injecte à chaque tour ». RC11 est une exigence **textuelle** ; elle a reçu la seconde de ses deux réponses possibles. Le **risque** qui subsiste derrière est le résidu R3, pas RC11 lui-même. |

**Bilan : 10 `Required changes` résolus, 1 intact** (seconde moitié de RC6).

### Les affirmations du re-scope, revérifiées une à une

Toutes les citations conservées dans la proposition re-scopée ont été relues à la source.
**Aucune citation fausse** → aucune objection bloquante de ce chef.

| citation conservée | verdict | source relue |
|---|---|---|
| `packages/opencode/AGENTS.md:15-17` = les trois lignes `tmux` | ✅ exacte | `:15` `tmux new-session -d -s opencode-dev 'bun dev'` ; `:16` `tmux capture-pane -pt opencode-dev` ; `:17` `tmux kill-session -t opencode-dev` |
| `AGENTS.md:14` conservée telle quelle | ✅ exacte, et compatible | `- Running \`bun dev\` from \`packages/opencode\` starts the live interactive TUI. Do not run it as a blocking foreground command…` — le diff de §4 (`:142-153`) ne touche que `-15/-16/-17` et leurs `+`. **La ligne 14 survit intacte.** |
| `AGENTS.md:112` (`Effect.forkDetach`, « fire-and-forget ») | ✅ corrigée correctement | voir RC9 |
| `src/session/tools.ts:123-124` (`read` déjà parallel-safe) | ✅ exacte | voir RC2 |
| `instruction.ts:96-97` (clé `MessageID`) | ✅ exacte | voir RC5 |
| `instruction.ts:19` (`"AGENTS.md"` dans la liste des fichiers d'instruction) | ✅ exacte | `:18-22` : `const files = (…) => ["AGENTS.md", …("CLAUDE.md"), "CONTEXT.md" /* deprecated */]` |
| `instruction.ts:88` (chargement du global) | ✅ exacte | `:88` = `path.join(global.config, "AGENTS.md"),` dans `globalFiles` |
| `instruction.ts:186` (« The first project-level match wins… ») | ✅ exacte | commentaire relu mot pour mot |
| `read.ts:357` (concaténation du bloc) | ✅ exacte | `const reminder = loaded.length > 0 ? \`\n\n<system-reminder>\n${loaded.map((item) => item.content).join("\n\n")}\n</system-reminder>\` : ""` |
| `read.ts:362` (chemin de rétention) | ✅ exacte | `output: ReadLedger.stub(filepath, entry) + reminder,` |
| `opencodev2/AGENTS.md:3` (préséance du projet) | ✅ exacte | « A project-level `AGENTS.md`/`CLAUDE.md` refines this file and wins on conflict. » |
| `opencodev2/AGENTS.md:7` (profil win32/pwsh) | ✅ exacte | « TypeScript + Effect (v4), Windows / pwsh7. » |
| `opencodev2/AGENTS.md:22` (lancement + handle) | ✅ exacte | « 1. Start a temporary dev server only via a managed terminal (\`mcp-terminal command_run mode=async\`); record its handle and port. » |
| `opencodev2/AGENTS.md:23` (arrêt par handle) | ✅ exacte | « 2. Stop only a temporary process started by the current turn, through that recorded handle… » |
| `opencodev2/AGENTS.md:25` (confirmation pour un hôte MCP) | ✅ exacte | « 4. Protected processes always need explicit confirmation: … **MCP hosts**, native Brave/Chrome/Edge, IDEs… » |
| `opencodev2/AGENTS.md:26` (interdiction du détaché) | ✅ exacte | « 5. Never use \`Start-Process\`, \`cmd /c start\`, detached/background mode or a native terminal for a temporary long-lived server. » |
| `clipboard.ts:42` (`\x1bPtmux;…`, sans rapport) | ✅ exacte | `:41` `const passthrough = process.env["TMUX"] || process.env["STY"]` ; `:42` `const sequence = passthrough ? \`\x1bPtmux;\x1b${osc52}\x1b\\\` : osc52` — séquence DCS d'échappement presse-papiers, **sans lien avec le cycle de vie d'un serveur**. |
| `arity.ts:149` (`tmux: 2`) | ✅ exacte | `  tmux: 2, // tmux new -s dev` |
| `test/session/context-budget.test.ts:421` + `:425-438` | ✅ exacte | `:420-421` titre `loaded config: AGENTS.md + skills stay within budget` ; `:425-438` = `writeText(path.join(dir, "AGENTS.md"), [ …huit lignes de fixture… ])`. **C'est bien un `AGENTS.md` synthétique dans un répertoire temporaire** : la conclusion de la proposition est juste. |

### Les rejets annoncés, contrôlés

- **A1/A2 supprimés** : ✅ confirmé. Plus aucun chiffre issu de l'agrégation `opencode.db`.
  Le refus ne repose plus que sur le fait rejouable `src/session/tools.ts:123-124`, qui est
  exact. C'est le refus correct : `read` étant déjà parallel-safe, N lectures coûtent déjà
  un tour, et A1/A2 ne formulent aucun levier neuf.
- **A3 exclu** : ✅ confirmé en deux endroits (§5.5, §9).
- **`AGENTS.md:27-105` et `:118-135` marqués « non couvert »** : ✅ conforme. Le re-scope
  **retire** le verdict antérieur au lieu de le reconduire — c'est la conduite correcte
  face à une citation non relue, et cela n'ouvre aucune objection.
- **`~/.config/opencode/AGENTS.md` retiré du catalogue** : ✅ conforme, hors dépôt.
- **Effort annoncé `XS`** (§8, `:249-252`) : ⚠️ **partiellement faux**. Les trois lignes
  échangées contre sept sont bien un patch trivial, mais « **aucun test à écrire** » est
  contredit par le propre §7 de la proposition, qui admet qu'aucun test ne couvre B1. Le
  budget ne peut pas être `XS` tant que la seconde moitié de RC6 est ouverte. §8 est
  cohérent avec §7 seulement si l'on admet que le test n'est pas dans le lot — ce qui est
  précisément l'objection R2.

## Status

**`REVALIDATED-FAIL`**

Portée, conformément à `REVALIDATION-BRIEFS.md:72-73` (un FAIL « signale des Required
changes **intacts**, pas des résidus ») :

- Le FAIL porte sur **un seul** `Required change` intact : **la seconde moitié de RC6** —
  le test qui doit mesurer le vrai `packages/opencode/AGENTS.md`.
- Il **ne porte pas** sur le contenu de B1. Les dix autres `Required changes` sont résolus,
  et les dix-sept citations conservées sont exactes.
- Il **ne porte pas** sur les rejets A1/A2/A3, qui sont justes et correctement documentés.

Pourquoi pas l'autre statut implémentable : `REVALIDATION-BRIEFS.md:69-71` rend
implémentable le statut « with changes » **si et seulement si aucun résidu n'est `open`**.
R2 est `open` (voir ci-dessous). Le statut serait donc contradictoire avec mon propre
classement. C'est la cohérence entre le classement des résidus et le statut qui tranche,
pas une préférence de sévérité.

## Remaining objections

Statut en tête de chaque ligne, comme l'exige `REVALIDATION-BRIEFS.md:76`.

### R2 — `open` — aucun test automatisé ne voit B1, et un test sans shell est réalisable

C'est le point décisif de cette revalidation.

**Constat 1 — la preuve actuelle est une preuve par shell, donc perdue pour la vague 4.**
§7 (`:218-223`) ne propose que T6 : `rg -n "tmux" packages/opencode/AGENTS.md` → 0 ligne.
C'est un contrôle manuel. La vague 4 interdit le shell aux agents : à ce moment-là, B1 n'a
plus **aucune** preuve rejouable, ni automatisée ni manuelle. Or R1 (§6, `:210`) déclare la
non-régression « couvert par T6 » — c'est-à-dire adossée à la même preuve fragile.

**Constat 2 — le test que la vague 2 demandait n'existe pas, et la proposition l'admet.**
§7 (`:240-245`) le dit en toutes lettres : « **Garde-fou qu'aucun test automatisé ne
fournit**… Ce test ne lit jamais `packages/opencode/AGENTS.md` : il ne peut pas voir B1.
**Statut : résiduel assumé** ». Ma vérification du code confirme le diagnostic : le test de
`context-budget.test.ts` écrit une fixture synthérique, il n'a aucun accès au fichier réel.

**Constat 3 — et pourtant, un test équivalent est réalisable.** C'est ce qui fait passer R2
de « résiduel assumé » à `open` plutôt qu'à `accepted`. Le blocage n'est pas technique :

- Le motif existe déjà dans le dépôt. `test/daemon/console-visibility.test.ts:17`
  `const daemonDir = path.resolve(import.meta.dir, "../../src/daemon")`, puis `:51` et `:60`
  `const source = readFileSync(file, "utf-8")` : un test qui lit un fichier source du dépôt
  et vérifie son **contenu**. Précédent exact, deux fois dans le même fichier.
  `:583` / `:701` de `test/tool/registry.test.ts` et `:34` de `test/tool/read.test.ts`
  (`path.join(import.meta.dir, "fixtures")`) confirment que le résonnement par
  `import.meta.dir` est la norme du dépôt.
- L'assertion nécessaire est triviale et sans dépendance au modèle : lire
  `packages/opencode/AGENTS.md` par chemin relatif à `import.meta.dir`, puis vérifier
  (a) l'absence de `tmux`, (b) la présence du protocole managed-terminal, (c) **la présence
  de la ligne 14 inchangée** — ce dernier point verrouille la condition que le re-scope
  présente comme invariante et que rien aujourd'hui ne contrôle automatiquement.
- Le fichier **n'a pas besoin** d'être un test de budget. `context-budget.test.ts:425-438`
  mesure la taille d'un `AGENTS.md` *injecté*, via `runOneTurn` ; y loger une assertion de
  contenu sur un autre fichier serait hors sujet. Le bon emplacement est un fichier dédié
  (`test/agents-md.test.ts`), qui reprend le motif de `console-visibility.test.ts`.

**Pourquoi `open` et non `accepted` :** la réserve de §7 (« résiduel assumé ») repose sur une
hypothèse qui ne tient pas — que la vague 4 validera une preuve par shell qu'elle interdit.
Ce n'est pas une réserve raisonnable à la lumière de ce qui est implémentable ; c'est un trou.
`REVALIDATION-BRIEFS.md:74-75` interdit explicitement de requalifier en `accepted` pour
débloquer.

**Statut dans le registre d'audit : `residual`, et non `open`.** Les deux classements ne se
contredisent pas et ne sont pas le même objet. `open` est le classement exigé par le gabarit
de revalidation et il **interdit l'implémentation** ; c'est lui qui fonde le
`REVALIDATED-FAIL`. `residual` est le statut de suivi : le correctif exigé est
`test/agents-md.test.ts`, un fichier sous `packages/**`, hors de la portée d'écriture de ce
revalidateur, et donc transmis à l'implémenteur de la vague 4 — specified, tracé, non clos
ici. Si la vague 4 écrit ce test, R2 se ferme et le statut du lot redevient implémentable.

**Ce qui lève R2 :** écrire le test de contenu décrit ci-dessus. Effort `S`, fichier
principal `packages/opencode/AGENTS.md` (lecture seule), aucun test existant à casser.
Une fois écrit, R2 passe `closed` et le statut devient implémentable.

### R3 — `accepted` — dépendance à un serveur MCP d'environnement : risque réel, décision tracée, **escalade opérateur requise**

**Constat 1 — le risque est réel, pas formel.** `packages/opencode/AGENTS.md` est un fichier
versionné du dépôt ; les trois outils `mcp-terminal_command_run`,
`mcp-terminal_terminal_read`, `mcp-terminal_command_cancel` sont des outils d'environnement
dont la disponibilité n'est garantie par **aucun fichier du dépôt** (constat établi par la
vague 2, `P20-verdict.md:137-144`, et non contredit par le re-scope).

**Constat 2 — mais B1 n'introduit pas la dépendance, il en hérite.** Le contrat de
déploiement de l'opérateur impose déjà ce protocole à toute session :
`opencodev2/AGENTS.md:22` est injecté à chaque tour (`:3` : « It is injected in full every
turn »). B1 ne crée donc **aucune dépendance propre au dépôt** : il supprime une
contradiction avec une dépendance que l'opérateur possède déjà. Ce qui est remplacé —
`tmux` absent sur win32/pwsh — est un échec **bruyant et immédiat** ; ce qui le remplace peut
être **absent silencieusement**. Sur le déploiement nominal, B1 est un gain net.

**Ce qui reste vrai et que je ne.minimise pas :** la fiche versionnée peut atteindre un
checkout qui n'est **pas** piloté par `opencodev2/AGENTS.md`. Dans ce cas, `:15-17` nommerait
des outils inexistants, là où il nommait auparavant un binaire d'OS. Le **mode de défaillance
passe de bruyant à silencieux** pour cette audience. C'est un delta de déploiement réel,
que la formulation « il n'ajoute aucune dépendance propre au dépôt » (`:164-166`) ne couvre
pas complètement.

**Classement `accepted`** : le fond est traité (RC11 a reçu sa réponse écrite, §4 `:159-168`),
la réserve est assumée et tracée (R3 en §6, `:212`, statut « ouvert, déclaré »). Je ne le
classe ni `out_of_scope` — le risque est une **conséquence** du changement, pas quelque chose
qui lui est étranger — ni `open`, parce que B1 n'aggrave pas la position d'exploitation.

**Escalade : oui, ce point doit remonter à l'opérateur**, pour une raison qui n'est pas une
contestation du patch. La question à trancher est une **politique de déploiement** : « le
fork est-il destiné à des checkouts qui ne tournent pas sous le contrat `opencodev2` ? »
Si **non**, R3 reste `accepted` et B1 est livré tel quel. Si **oui** — un fork distribué, ou
un harnais tiers — alors R3 doit être **rouvert en `open`** et le texte de `:15-17` doit
prévoir un repli neutre vis-à-vis de la plateforme. Cette décision n'appartient pas au
validateur : elle engage la surface de distribution du fork. Elle n'empêche pas d'appliquer
B1, puisque l'alternative actuelle (`tmux`) est pire sur le déploiement nominal.

### F1 — `out_of_scope` — `arity.ts:149` orphelin : vérifié inoffensif, et même conservateur

Le brief demande de vérifier si un `tmux` orphelin peut faire **échouer** un `tool.execute`.
Réponse vérifiée : **non**.

- `src/permission/arity.ts:1-9` — `prefix(tokens)` est une fonction **totale** : elle
  parcourt les préfixes du plus long au plus court, retourne `tokens.slice(0, arity)` si
  `ARITY[prefix] !== undefined`, et **retombe toujours** (`if (tokens.length === 0) return
  []`, sinon `tokens.slice(0, 1)`). Aucune branche ne lève, aucune ne retourne
  `undefined`. Une entrée de table ne peut donc pas produire d'exception ; elle peut au pire
  modifier le nombre de tokens renvoyés.
- Le seul consommateur est `src/tool/shell.ts:421`,
  `scan.always.add(BashArity.prefix(tokens).join(" ") + " *")` — la construction d'un
  **motif de permission**, par concaténation de chaînes. Aucune exécution, aucun rejet.
- `test/permission/arity.test.ts` (33 lignes, lu en entier) ne mentionne `tmux` dans aucun
  de ses 7 cas : les retirer ne casse aucun test.

**Argument supplémentaire, dans le sens de la conservation :** l'effet de l'entrée est de
restreindre le motif always-allow de `tmux new *` (arité 2) plutôt que `tmux *` (repli par
défaut). **Garder l'entrée est donc l'option prudente.** La supprimer élargirait
involontairement la permission si un agent lançait encore `tmux`. La fiche classe F1
« hors périmètre » ; le classement est correct, et la justification proposée (« sans
effet ») est plus faible que la réalité — c'est une entrée inerte *et* conservatrice.

### Points explicitement hors périmètre de ce verdict

- **A3** (durcissement du `read-ledger`) : exclu par la vague 2, décision inchangée.
- **Catalogue `AGENTS.md:27-105` / `:118-135`** : « non couvert », verdict antérieur retiré.
  Aucun grief possible — une citation non relue n'est pas une citation fausse.
- **`test/AGENTS.md`** (RC10) : ligne de catalogue présente ; je ne l'ai pas relue
  moi-même, je le signale comme hérité et non revérifié.

## Regressions introduced

**Aucune régression.** Déclaration explicite exigée par `REVALIDATION-BRIEFS.md:69-71`.

- B1 ne modifie qu'un fichier Markdown d'instruction. Il n'entre dans aucune chaîne
  d'exécution : `instruction.ts` ne fait que **lire** ce fichier pour le concaténer au
  prompt ; aucune logique n'est indexée sur son contenu.
- **Aucun test vert n'est cassé.** Vérifié : `grep "AGENTS\.md"` sur
  `packages/opencode/test` renvoie 60 occurrences, **toutes** soit des fixtures synthétiques
  (`withFiles({"AGENTS.md": …})`, `tmpWithFiles` dans `test/session/instruction.test.ts`),
  soit le budget de `context-budget.test.ts`. **Aucune ne lit
  `packages/opencode/AGENTS.md`.** Le fichier modifié n'est donc dans le périmètre d'aucun
  test.
- Aucune suite ne devient rouge du fait de B1. Les deux suites rouges avant diff
  (`ffprobe failed`, timeout de hook 5 000 ms) le restent **à l'identique** — B1 ne les
  aggrave pas. Ce sont des échecs de baseline, pas des régressions de cette proposition.

**Réserve sur la méthode de non-régression (§6, R1).** La fiche déclare R1 « couvert par
T6 ». La conclusion est juste, la **méthode** ne tient pas : T6 est une preuve par shell,
incompatible avec la vague 4. C'est la même racine que R2 et cela se corrige avec le même
test de contenu.

**Note pour l'implémentation (non bloquante).** T6 reste valide tel quel, borné à
`packages/opencode/AGENTS.md`. Il ne faut surtout pas le généraliser à un
`rg tmux packages/opencode` : après B1, deux hits légitimes subsistent —
`src/permission/arity.ts:149` (F1) et `src/cli/cmd/tui/util/clipboard.ts:42`
(`\x1bPtmux;`, échappement presse-papiers). Un contrôle repo-wide produirait un faux
positif. Le test de contenu doit donc asserter sur le **fichier `AGENTS.md`**, pas sur
l'arbre.

## Final verdict

`REVALIDATED-FAIL`

Un `Required change` de la vague 2 est **intact** : la seconde moitié de RC6 — le test qui
mesure le vrai `packages/opencode/AGENTS.md` au lieu d'un `AGENTS.md` synthétique. Le
résidu correspondant, **R2, est `open`** : la seule preuve existante est un `rg` manuel,
interdit à la vague 4, et un test équivalent est réalisable en `S` sur le motif déjà
prouvé par `test/daemon/console-visibility.test.ts:17,51,60`. Conformément à
`REVALIDATION-BRIEFS.md:74-75`, un résidu `open` interdit l'implémentation.

**Le contenu de B1 n'est pas en cause.** Dix des onze `Required changes` sont résolus, les
dix-sept citations conservées sont exactes, le diff est minimal et la ligne 14 est
effectivement préservée. R3 est `accepted` et **doit remonter à l'opérateur** pour un
arbitrage de politique de déploiement. F1 est `out_of_scope`, vérifié inoffensif — et même
prudentiel à conserver. **Un seul travail bloque : écrire le test de contenu de R2.**

## Effort — grille vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| **B1** — remplacer `AGENTS.md:15-17` (`tmux` → terminal géré), ligne 14 intacte | XS | `packages/opencode/AGENTS.md` (L15-17) | aucun | **aucun** — relu : aucun test ne lit ce fichier |
| **R2** — test de contenu sur le vrai `AGENTS.md` : absence de `tmux`, présence du protocole managed-terminal, présence de la ligne 14 | S | `packages/opencode/AGENTS.md` (lecture seule) | **`test/agents-md.test.ts`** (nouveau) — motif : `readFileSync(path.resolve(import.meta.dir, "../../AGENTS.md"), "utf-8")`, cf. `test/daemon/console-visibility.test.ts:17,51,60` | **aucun** — fichier neuf ; ne pas le loger dans `context-budget.test.ts` (mesure de budget, hors sujet) et ne pas compter sur cette suite, rouge avant diff (timeout de hook) |
| **F1** — `arity.ts:149` : conserver `tmux: 2` (prudent) ou le retirer en follow-up | XS | `packages/opencode/src/permission/arity.ts:149` | aucun (facultatif : cas `tmux` dans `test/permission/arity.test.ts`) | relire `test/permission/arity.test.ts` (33 lignes, **aucun** cas `tmux`) → sans effet ; `prefix()` est totale, aucune branche ne lève |
| **R3** — arbitrage de politique de déploiement, hors dépôt | XS (décision seule) | aucun fichier du dépôt | aucun | aucun — **escalade opérateur requise** |
| **RC6 bis** — chiffrer le delta en octets de B1 par tour | XS | aucun fichier du dépôt (mesure) | aucun | aucun |