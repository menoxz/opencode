# Revalidation de P17 — invariant de plafond de sortie

## Proposal

`P17` — Invariant de plafond de sortie `min(lean, générique)`.
Fichier : `docs/harness-audit/proposals/P17-output-cap-invariant.md`, **750 lignes** sur disque
(le verdict de vague 2 en mesurait 194 : le dossier a été révisé depuis, §1 `:10-19` s'en réclame).

Revalidateur : `revalidator-independent-p17-1`. Je n'ai rédigé ni la proposition, ni
`P17-verdict.md`, ni aucune révision. Toutes les citations de code ci-dessous ont été relues
sur les fichiers réels de `packages/opencode/src`, pas sur le texte de la proposition.

État de départ : `truncate.ts` **intact** (158 lignes ; `MAX_LINES`/`MAX_BYTES` toujours
déclarés `:15-16`, boucle toujours en octets). La variante P16 vit dans `terminal-output.ts`
seulement.

## Revisions applied

Les trois `Required changes` de `P17-verdict.md:101-112` sont **traités dans le texte** de la
proposition révisée. Je les nomme les uns par les autres, avec la preuve du traitement.

**RC1 — unité en points de code dans la boucle + test accentué.** Traité.
`:232-258` fixe l'unité une fois et au bon niveau (le niveau de la borne) ; `:304-330` ajoute
`chars` / `hitChars` et un `break` de sortie anticipée **dans les deux branches** (`head` et
`tail`), la contrainte code-points étant évaluée en premier (`:318`, `:326`) ; `:342-345` fait
passer `removed`/`unit` à trois branches, ce qui répond explicitement à la demande du verdict
(`P17-verdict.md:59-61`). Le test accentué exigé est bien présent (`:622-638`).

Je relève au passage une **décision de la révision plus juste que le verdict** : la fixture
`"é".repeat(5000)` demandée par RC1 est **impossible à exécuter**, et la révision le démontre
(`:640-649`) — 4 000 est `LEAN_TERMINAL_MAX_CHARS` (`lean-output-policy.ts:4`) et les outils
terminal sont carve-out (`proposition:269`), donc `leanCeiling` renvoie `undefined` et le texte
ressort **non tronqué**. La substitution par `repo_overview` à 7 000 caractères accentués est
correcte : `repo_overview` est bien dans la liste blanche (`lean-output-policy.ts:56-57`,
6 000 / 200). Cet élément de RC1 est **`accepted`**.

**RC2 — publier le gain par nom d'outil avant tout chiffre.** Traité, et traité au fond.
`:546-562` explique pourquoi le chiffre précédent (91 000 – 833 000 tokens) mesurait une
population hors liste blanche ; `:564-585` **retire le chiffre**, lui substitue la seule borne
dérivable du code — `0` token sur la population mesurée — et donne la formule
`gain_tokens = (1/R) · Σ_appels max(0, L_i − min(L_i, B_i))` ; `:594-607` pose le préalable
(histogramme par `options.tool`, avec `(c) = 0` attendu pour `read`, `inspect_batch`, `glob`,
`grep`, `ls`). Je vérifie la prémisse : `lean-output-policy.ts:49-62` ne couvre bien que
`isLeanTerminalTool`, `repo_overview` et `web-browser_*`. **Cet élément est `accepted`.**

**RC3 — `maxChars` justifié ou retiré ; import `RuntimeFlags` listé.** Traité.
`:347-360` **retire** `maxChars` de `Options`, qui ne gagne que `tool?` ; la justification est
donnée (champ d'API mort = surface de divergence vers le même plafond). `:366-370` liste les
deux ajouts d'import de `truncate.ts`, dont `import { RuntimeFlags } from "@/effect/runtime-flags"`.
Je vérifie le chemin de référence : `inspect-batch.ts:7` est bien exactement cette ligne.
**Cet élément est `accepted`.**

## Status

**Non implémentable**, pour une raison qui n'est pas « Required changes
intacts ».

Les trois RC sont traités (`accepted` ci-dessus), donc le motif défini par
`REVALIDATION-BRIEFS.md:72-73` pour l'échec — des Required changes intacts — est
**inapplicable**. Mais la règle 1 (`:69-71`) rend la variante `…PASS_WITH_CHANGES`
implémentable **si et seulement si aucun résidu n'est `open`**, et la règle 3 (`:74-75`)
interdit de requalifier un `open` pour franchir la porte. Je trouve **trois `open`**. Écrire
`PASS_WITH_CHANGES` affirmerait une implémentabilité fausse ; écrire `PASS` est exclu par la
règle d'implémentabilité. La seule chaîne honnête est donc l'échec, et je précise
que son motif ici est **l'existence de résidus `open`**, pas un Required change intact.

### L'invariant est-il encore bien énoncé ?

**Oui sur le fond et sur les plafond, non sur le point d'application qu'il présuppose.**

Le plafond générique est porté par quatre lignes réelles de `truncate.ts`, relevé à froid :

- `truncate.ts:15` `export const MAX_LINES = 2000`
- `truncate.ts:16` `export const MAX_BYTES = 50 * 1024` → **51 200 octets**
- `truncate.ts:87-88` `const maxLines = options.maxLines ?? resolved.maxLines` /
  `const maxBytes = options.maxBytes ?? resolved.maxBytes` — unique résolution du plafond
- `truncate.ts:93-95` `if (lines.length <= maxLines && totalBytes <= maxBytes) { return { content: text, truncated: false } as const }`

et l'application est la boucle `:99-122`, dont le seul compteur est `bytes`
(`:99-100`, `:104`, `:114`) avec sortie anticipée à `:105` / `:115`. `truncate.ts` étant
resté intact, **les plafonds que la proposition énonce sont exacts et inchangés** : §2.1 cite
`:15-16`, `:75-83` et `:87-88`, §2.3 cite `:99-122`, §2.4 cite `:124-125`. Je n'ai trouvé
aucune citation fausse dans la section 2.

L'hypothèse de départ du dossier est également confirmée : `registry.ts:256`
(`output: out.truncated ? out.content : output,`) reste un no-op, puisque `truncate.ts:93-95`
garantit `out.content === output` octet pour octet quand `truncated` est faux. §4.5 (`:387-414`)
décrit `:253`/`:256` exactement, et identifie correctement que ce bloc est **plugin-only**
(`registry.ts:242-253`) — d'où la conclusion juste que l'invariant doit vivre ailleurs.

Le défaut d'énoncé est ailleurs : **la proposition présuppose une granularité de coupe qu'elle
n'établit pas.** Sa boucle corrigée resteau niveau de la ligne — `out.push(lines[i])`
(`:320`), `out.unshift(lines[i])` (`:328`) — sans jamais couper une ligne en son milieu, alors
que sa borne est exprimée en **points de code**. Sur un texte sans `\n`, ces deux notions sont
incompatibles : la boucle ne peut garder qu'un **nombre entier de lignes**, et une borne de
6 000 points de code ne peut donc pas être atteinte sans émettre zéro ligne. C'est la cause
racine du résidu `R17-01`.

## Remaining objections

**`open` — R17-01. Les fixtures de §8 ne sont pas exécutables : le critère de succès « `0 fail` » est inatteignable, et le critère ne discrimine pas.**
La boucle de `:304-330` est ligne-granulaire (`out.push(lines[i])`, `:320`) ; `truncate.ts:90`
découpe sur `"\n"`. Les fixtures de §8 sont des chaînes **sans aucun `\n`** :
`:627` `"é".repeat(7000)`, `:659` `"é".repeat(30_000)`, `:687` `"x".repeat(45_000)`.
Conséquence arithmétique, sans interprétation : chacune produit `lines.length === 1`, donc
**une seule itération**, dont la largeur (`:317` / `:325`) dépasse immédiatement la borne ; le
`break` part avec `out` **vide**. Le contenu rendu est alors le bandeau seul.
- §8.2 (`:631-634`) attend `5 500 < content.length <= 6_000` et `byteLength > 11 000` : après
  correctif, `content` fait quelques centaines de caractères. **Rouge après.**
- §8.3 (`:665-666`) attend `25 000 < content.length < 25 700` : idem. **Rouge après.** La
  proposition reconnaît que 8.3 n'est pas rouge avant (`:700-701`) mais claims qu'il « fige le
  comportement actuel » ; il ne le fige pas, il échoue aussi après.
- §8.6 (`:687-689`) est **auto-contradictoire** : `:686` pose « un texte ASCII doit produire le
  même résultat avant et après le patch », puis `:688` attend `truncated === true` et
  `content.length` proche de 8 000. Sur `"x".repeat(45_000)`, l'état actuel donne
  45 000 octets < 51 200 et 1 ligne < 2 000, donc `truncated === false` : les deux énoncés ne
  peuvent pas être vrais à la fois. **Rouge après.**
- §8.1 (`:617-620`) : « texte de 45 000 caractères », forme non spécifiée. Sur une fixture
  multi-lignes réaliste, la borne de 8 000 points de code produit ~8 000 caractères de
  prévisualisation, **plus** le bandeau et l'astuce que `truncate.output` concatène
  (`truncate.ts:130-136`) → `content.length > 8 000`, et l'assertion `toBeLessThanOrEqual(8_000)`
  échoue. Le seuil `8_000` est **arbitraire et faux** : il compare une sortie qui *inclut* le
  bandeau à une borne qui ne le couvre pas.
Ce n'est donc pas « un seuil non justifié » mais un seuil **inatteignable** : le critère de
succès ne peut pas être atteint par le patch qu'il décrit. Zéro test de §8 ne passe dans un
monde et échoue dans l'autre. **Bloquant.**
*Remède en une ligne* : donner aux fixtures des retours à la ligne (`Array.from({length:N},()=>"é").join("\n")`) et comparer la **prévisualisation** (`out.join("\n")`) plutôt que `result.content`, ou majorer le seuil de la longueur du bandeau.

**`open` — R17-02. `F-02` est déclaré « hors périmètre / sans effet observable » ; c'est faux, et le chemin est dans le périmètre du patch.**
`processor.ts:589-593` passe aujourd'hui `{ maxLines: outputBudget.maxLines, maxBytes: outputBudget.maxChars, direction: outputBudget.direction }` — je relis `:591` : `maxBytes: outputBudget.maxChars`. C'est **exactement** la collision d'unités que F-01 décrit, vivante sur le chemin session. Et `processor.ts:587` est la garde
`if (!terminal && flags.experimentalLeanOutputBudget && truncate._tag === "Some" && toolCall && outputBudget)`
— elle **ne teste pas `isLeanAgent`**. Donc, sous drapeau actif, avec un agent **non lean** et un
outil de la liste blanche, `maxBytes` vaut 6 000 (ou 8 000) et `resolved.maxBytes` (51 200) est
**écarté** par le `??` de `truncate.ts:88`. Une sortie `repo_overview` de 7 000 caractères accentués
est alors coupée à **6 000 octets ≈ 3 000 caractères** : budget divisé par deux, défaut
observable, et ce **après** le patch puisque §4.4 (`:379`) déclare `processor.ts` « inchangé —
résorbé par `??` » — ce qui est faux : `maxBytes` est fourni explicitement, donc rien n'est
résorbé. La qualification « hors périmètre » (`:716`) est donc **invalide** : c'est le même
défaut que F-01, sur une ligne que le patch liste lui-même comme point d'application.
**Bloquant.**
*Remède en une ligne* : passer `{ tool: toolCall.part.tool }` et supprimer `maxBytes: outputBudget.maxChars` à `processor.ts:591`, en laissant `leanCeiling` porter la borne.

**`open` — R17-03. Trois citations périmées vers `terminal-output.ts`, sur un fichier que P16 vient de réécrire.**
La proposition fonde son carve-out sur `:142`. Or `terminal-output.ts:142` est aujourd'hui
`return path.resolve(root, value).startsWith(root + path.sep)` — le durcissement P16 dans
`withinTruncationRoot` (`:139-142`). Le carve-out est désormais `:155` :
`if (!isLeanTerminalTool(input.tool, input.args)) return { output: input.output, metadata: input.metadata }`.
Et les plafonds 4 000 / 120 sont à `:7-8` (`const MAX_BYTES = 4_000`, `const MAX_LINES = 120`),
non à `:5-6`. Sites périmés : `:188`, `:266`, `:428`, `:431`.
La **thèse** survit intacte (le carve-out existe bien et les plafonds sont bien 4 000 / 120) ;
seules les ancres de ligne sont fausses. Une citation fausse est une objection bloquante.
*Remède en une ligne* : ré-ancrer `:142` → `:155` et `:5-6` → `:7-8` aux quatre sites.

**`accepted` — R17-04. `terminal-output.ts` n'est pas la couche propriétaire de l'invariant.**
Vérification demandée explicitement. La proposition **ne** suppose pas cette propriété : §4.6
(`:428-431`) déclare `terminal-output.ts` **« aucune modification »** et son carve-out
« obligatoire », et elle place le point d'application unique dans `truncate.ts`
(`leanCeiling` + la boucle). L'hypothèse de la question est donc **infirmée** : P17 traite
correctement `terminal-output.ts` comme la couche qui plafonne **déjà** le terminal, pas comme
le propriétaire de l'invariant. J'ajoute que `terminal-output.ts` reste sain sur les points
d'atterrissage signalés : `:158` est bien un passe-through intact de `metadata.outputPath`, le
filtre `:159` ne s'applique qu'à la référence récupérée du texte, `:162` est bien
`const raw = input.output`, et le `+ path.sep` de `:142` rejette bien un frère dont le nom
commence seulement par la racine. **Aucun de ces points n'est un défaut de P17.**

**`accepted` — R17-05. Le seul `INFERE` est une borne de gain, pas un argument d'impact.**
Un `rg` sur `INFERE|NON MESUR|MESURÉ|non mesur` sur la proposition ne rend **qu'une** ligne
(`:574`, « le gain est réel mais **non mesuré** »). Il ne porte aucun argument d'impact : il
borne le gain sur la population réellement couverte (`repo_overview` 6 000, `web-browser_*` 8 000),
et il est accompagné de sa formule (`:578-580`) et du préalable qui le rend calculable
(`:594-607`). L'argument d'impact, lui, est la borne `0`, qui est **dérivable du code**, pas
une estimation (`:569-571`). Classement : `accepted`, conformément à la règle « `INFERE` non
mesuré qui sert d'argument d'impact = `open` », qui ne s'applique pas ici. La seule affirmation
d'impact **non** dérivée que j'ai trouvée est la clause « sans effet observable » de `F-02`,
que **R17-02** réfute par le code.

**`accepted` — R17-06. Aucune dépendance à une donnée d'entrée introuvable.**
`wave4-baseline.md` **existe** : `read` positif sur
`C:\Users\jeanl\AppData\Local\Temp\opencodev2\wave4-baseline.md`, **192 lignes**, bun test
v1.4.2, mesuré le 2026-10-03, 10 suites, 4 rouges, 39 tests en échec (`:11-22`). Je ne le tiens
jamais pour absent. Vérification de la règle C-50 : **aucune** section de la proposition ne
revendique ce fichier absent, et aucune n'en dépend. Le critère de succès de `:691-697` est
`bun test test/tool/truncation.test.ts` → `0 fail`, qui n'a besoin d'aucune donnée externe. Le
seul histogramme manquant est celui de `:594-607`, qui est un **prérequis d'un gain futur**,
pas une entrée d'un critère de succès — et son absence y est déclarée comme telle (« tant
qu'il n'est pas produit, le coefficient reste inconnu », `:583-585`), pas comme une absence de
fichier. Aucun motif C-50 dans ce dossier.

## Handed back to

| résidu | trouvé dans | remède en une ligne |
|---|---|---|
| `R17-01` | `P17-output-cap-invariant.md:617-620`, `:627`, `:659`, `:665-666`, `:686-689` | fixtures avec `\n`, et comparer la prévisualisation et non `result.content`. |
| `R17-02` | `P17-output-cap-invariant.md:379`, `:591`, `:716` | `processor.ts:591` → `{ tool: toolCall.part.tool }`, sans `maxBytes: outputBudget.maxChars`. |
| `R17-03` | `P17-output-cap-invariant.md:188`, `:266`, `:428`, `:431` | ré-ancrer `terminal-output.ts:142` → `:155`, `:5-6` → `:7-8`. |

Les trois sont des défauts de la proposition : ils restent `open` et ne sont pas requalifiés.

## Regressions introduced

**Aucun test n'est cassé par cette revalidation.** Aucun fichier sous `packages/**` n'a été
modifié, aucun `git` n'a été exécuté, aucun fichier autre que celui-ci n'a été écrit. Aucun
état de mesure n'a été re-demandé.

**Préexistant — mesuré, non causé par P17 (qui n'est pas implémenté).** La base
`wave4-baseline.md:11-22` et l'état fourni concordent :

| suite | état | statut |
|---|---|---|
| `test/tool/shell.test.ts` | 63 pass / 32 fail / 1 error, exit 1 (baseline `:11`) ; 63/32/1 puis 62/33/4 (mesure fournie) | **rouge, instable, préexistant** |
| `test/session/compaction.test.ts` | 61/2 baseline `:17` ; 63/0 **uniquement avec `--timeout 30000`** | rouge par timeout, préexistant |
| `test/tool/read.test.ts` | 52 pass / 4 fail, exit 1 (baseline `:18`) | rouge, préexistant |
| `test/tool/task.test.ts` | 34 pass / 1 fail, exit 1 (baseline `:19`) | rouge, préexistant |
| `test/plugin` | oscille 124/0, 123/1, 122/2 à SHA constant | instable, préexistant |

**Vert, et non cassé** : `test/tool/truncation.test.ts` 19/0, `test/tool/terminal-output.test.ts`
14/0, `test/tool/terminal-output-truncation-root.test.ts` 6/0, `test/shell/shell.test.ts` 12/0 —
seule base verte opposable.

**Introduit : néant.** Et, par anticipation sur l'implémentation, voici ce que le patch casserait s'il
était écrit tel quel — je l'ai vérifié contre les assertions existantes plutôt que supposé :

- `truncation.test.ts:104-106` vérifie `MAX_LINES`/`MAX_BYTES` : le patch ne touche ni `:15`
  ni `:16`. **Vert.**
- `truncation.test.ts:147` et `:172-173` vérifient `"bytes truncated..."` ; `:61` et `:136`
  vérifient `"...90 lines truncated..."`. Le `unit` à trois branches (`:344`) conserve
  `"bytes"` et `"lines"` pour ces cas. **Vert.**
- `truncation.test.ts:37-39`, `:177-192` vérifient le chemin d'écriture disque ; le carve-out
  terminal l'évite. **Vert.**
- Le seul risque vert identifié est `processor.ts:591`, mais le patch le laisse **inchangé** :
  il n'introduit donc pas de casse verte — il necorrige pas un défaut préexistant, ce qui est
  précisément R17-02.
- `test/tool/shell.test.ts`, instable et rouge, n'est sur aucun chemin du patch ; s'il cassait
  davantage, ce serait un `open` (règle 1), mais rien dans le diff ne l'atteint.

Aucun test vert n'est cassé : la condition de la règle 1 est remplie sur ce point. Elle ne l'est
pas sur le critère « aucun résidu `open` ».

## Final verdict

`REVALIDATED-FAIL`

Non implémentable. Les trois `Required changes` de `P17-verdict.md:101-112` sont **traités**
(`accepted`), l'invariant reste correctement énoncé sur les plafonds réels
(`truncate.ts:15` `MAX_LINES = 2000`, `:16` `MAX_BYTES = 51 200`, appliqués à `:87-88`, `:93-95`
et `:99-122`), et `terminal-output.ts` n'est pas la couche propriétaire. Mais **trois résidus
`open`** subsistent — R17-01 (fixtures non exécutables, critère de succès inatteignable et non
discriminant), R17-02 (`F-02` mal classé hors périmètre alors que `processor.ts:591` porte le
défaut de façon observable), R17-03 (citations périmées) — et la règle 3 interdit de les
requalifier. Le dossier n'est pas un dossier dont les Required changes sont intacts : c'est un
dossier dont **l'instruction de test est inapplicable en l'état**.

## Tableau d'effort (vague 4)

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| R17-01 — fixtures §8 multi-lignes + assertions sur la prévisualisation | S | `packages/opencode/test/tool/truncation.test.ts` | réécrire 8.1/8.2/8.3/8.6 avec `\n` ; comparer `content` au seuil + longueur du bandeau | `test/tool/truncation.test.ts` (vert 19/0) — relire `:147`, `:172-173` avant de patcher |
| R17-02 — retirer `maxBytes: outputBudget.maxChars` du chemin session | S | `packages/opencode/src/session/processor.ts` | cas « drapeau actif + agent non lean + `repo_overview` accentué » : 7 000 caractères conservés, non 3 000 | `test/session/` — relire `processor.ts:586-593` ; aucune suite verte connue sur ce chemin |
| R17-03 — ré-ancrer les 4 citations `terminal-output.ts` | XS | `docs/harness-audit/proposals/P17-output-cap-invariant.md` | aucun (documentation) | aucun |
| Corps du patch P17 (`leanCeiling`, deux compteurs, `unit` 3 branches, 2 imports, 4 appelants) | S | `packages/opencode/src/tool/truncate.ts` | §8.1–8.3 une fois R17-01 traité | `test/tool/truncation.test.ts` — relire `:104-106`, `:61`, `:136`, `:147`, `:172-173` |