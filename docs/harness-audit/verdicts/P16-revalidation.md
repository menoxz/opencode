# P16 — Revalidation après réécriture complète

Revalidateur indépendant. Ni la proposition initiale, ni son verdict, ni la révision n'ont été
rédigés par moi. Contraintes respectées : aucun fichier écrit sous `packages/**`, aucune commande
`git`, proposition non éditée (`C-36`), existence des fichiers établie par `read` et **jamais** par
`glob` (`C-50`).

## Proposal

`docs/harness-audit/proposals/P16-output-path-regex.md` — 507 lignes, réécriture intégrale.

Le défaut : un chemin de fichier est reconstruit par expression régulière depuis le **texte** d'une
sortie d'outil, puis réinjecté comme référence dans le texte compacté et dans deux champs de
métadonnées. Les trois — et seuls — sites de dérivation texte→chemin sont `truncate.ts:29-31`
(regex), `truncate.ts:127` (`references`) et `terminal-output.ts:145`. Vérifié verbatim :

- `truncate.ts:29-31` — `export function savedOutputPath(text: string) { return text.match(/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/)?.[1]?.trim() }`
- `truncate.ts:127` — `const references = [...new Set([options.outputPath, savedOutputPath(text)].filter((value): value is string => value !== undefined))]`
- `terminal-output.ts:144-146` — `typeof input.metadata.outputPath === "string" ? … : undefined,` / `Truncate.savedOutputPath(input.output),` / `].filter(…)`

Remède retenu (§4, `:214-219`) : un filtre de préfixe dans `savedOutputPath`, quatre lignes, un seul
fichier source. Le patch tel que écrit :

```ts
export function savedOutputPath(text: string) {
  const extracted = text.match(/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/)?.[1]?.trim()
  if (extracted === undefined) return undefined
  const root = path.resolve(TRUNCATION_DIR)
  return path.resolve(extracted).startsWith(root + path.sep) ? extracted : undefined
}
```

`TRUNCATION_DIR` est une constante de module, sans E/S : `truncation-dir.ts:4`
`export const TRUNCATION_DIR = path.join(Global.Path.data, "tool-output")`, réexportée par
`truncate.ts:10` et `truncate.ts:17` (`export const DIR = TRUNCATION_DIR`).

## Revisions applied

Les sept Required changes du verdict sont tracés dans la proposition `:10-24`. J'ai vérifié chaque
site d'atterrissage annoncé, et non seulement la table :

| RC | Site déclaré | Vérification indépendante |
|---|---|---|
| RC1 | §6.2 | `:361-377` — chaîne ligne à ligne reproduite, et la variante retenue **préserve** `:160` (voir ci-dessous) |
| RC2 | §5.3 | `:289-290` refuse explicitement le remède « ajouter `outputPath` au metadata » |
| RC3 | §1, §2.5, §3.4, §4, §5.3, §8 | `:30-38` (sévérité + `C-10`), `:141-183` (capacité documentée), `:239-253` (« Ce qui reste volontairement inchangé »), `:474-483` (`XS`→`S`, trois fichiers de test) |
| RC4 | §5.2 | `:271-277` — « Filtre de préfixe `TRUNCATION_DIR` seul — **retenu** » |
| RC5 | §2.2 | `:91-96` — « C'est faux. Le texte visible par le modèle est `truncate.ts:130`, et il ne mentionne **aucune** rétention » |
| RC6 | §7 | `:459-465` — critères séparés par variante, `N >= 33` exigé |
| RC7 | §7 | `:456` — `processor-effect.test.ts` et `message-v2.test.ts` ajoutés |

**RC5 vérifié indépendamment.** `RETENTION` n'a que deux occurrences dans tout `truncate.ts` :
`:13` `const RETENTION = Duration.days(7)` (déclaration) et `:56`
`Identifier.create("tool", "ascending", Date.now() - Duration.toMillis(RETENTION))`, qui est le
filtre de `cleanup()` (effacement `:63-64`). Aucun troisième usage, donc le texte vu par le modèle
est bien `:130` seul. La rectification est exacte, pas seulement plausible.

**RC1 — la seconde régression, chaîne vérifiée ligne à ligne.** `terminal-output.test.ts:160`
`expect(result.output).toContain("unverified; not opened")`, dans l'itération `metadata = {}` de la
boucle `:154-164`. La chaîne annoncée est exacte :

1. `:155` — `for (const metadata of [{}, { outputPath: reference }])` : en `metadata = {}`, la seule
   source de `references` est `terminal-output.ts:145`.
2. `:156` — `const raw = \`public output\nFull output saved to: ${reference}\`` : le texte contient
   bien la ligne que la regex relit.
3. `terminal-output.ts:145` → `references` ; `:225` — `const referenceText = references.map((reference) => \`\nUpstream reference (unverified; not opened): ${JSON.stringify(reference)}\`).join("")` → `""` quand `references` est vide.
4. `:160` tombe.

**Mais sous le remède retenu, `:160` ne tombe pas** — et c'est le point que j'ai vérifié le plus
strictement, parce que c'est là que la réécriture pouvait mentir. Les trois références de la boucle
sont créées par `store.write`, c'est-à-dire `truncate.ts:69`
`const file = path.join(TRUNCATION_DIR, ToolID.ascending())` :

- `terminal-output.test.ts:148` — `const canary = yield* store.write("PRIVATE_CROSS_SESSION_CANARY")` → **sous** la racine
- `:149` — `const large = yield* store.write("LARGE_UNREAD_CANARY\n" + …)` → **sous** la racine
- `:150` — `const link = \`${canary}-symlink\`` : le suffixe est sur le **nom de fichier**, donc le
  chemin reste `root + sep + tool_xxx-symlink` → **sous** la racine

Les trois passent le filtre dans les **deux** itérations, `referenceText` reste non vide, `:160`
reste vrai. J'avais posé l'hypothèse inverse avant d'avoir ces lignes ; la lecture l'a réfutée.

## Status

| Objet | Attendu | Mesuré | Verdict |
|---|---|---|---|
| `test/tool/terminal-output.test.ts` | exit 0, 14/0 | `EXIT=0`, `14 pass`, `0 fail`, `Ran 14 tests across 1 file. [9.01s]` | conforme |
| `test/tool/truncation.test.ts` | exit 0, 19/0 | `EXIT=0`, `19 pass`, `0 fail`, `Ran 19 tests across 1 file. [7.30s]` | conforme |
| Les deux ensemble | 33/0 | `TEST_EXIT=0`, `33 pass`, `0 fail`, `Ran 33 tests across 2 files. [6.61s]` | conforme |
| `bun typecheck` | `TYPECHECK_EXIT=0` | `TYPECHECK_EXIT=0` | conforme |
| Commande §7 (4 fichiers) | `0 fail` | `EXIT=0`, `111 pass`, `0 fail`, `552 expect() calls`, `Ran 111 tests across 4 files. [47.73s]` | conforme |
| Base de reference | 4 rouges / 6 vertes, 39 échecs | `wave4-baseline.md:22` : « **10 suites, 4 rouges** (shell, compaction, read, task), **6 vertes**, **39 tests en échec** au total » ; détail `:11-20` : shell 32, read 4, compaction 2, task 1 = 39 | conforme, avec rectification (voir O5) |

Runtime `bun test v1.4.2 (744846f84)`, cwd `packages/opencode`. Aucun de ces nombres n'est inherited :
tous ont été produits par mes propres exécutions. Le shell a répondu ; aucun `BLOCKED` à rapporter.

**`wave4-baseline.md` existe.** Je l'ai établi par `read` (jamais `glob`, `C-50`) : `:22` donne le
bilan, `:11-20` le tableau par suite. Aucune des suites rouges (`shell`, `compaction`, `read`,
`task`) ne touche P16 ; `terminal-output` n'y figure pas et est verte par exécution directe.

**Réponse à la question ouverte du §9.** La proposition demande si la variante §5.3 (suppression
pure) est *exigée* pour couvrir la forge d'un identifiant de journal **à l'intérieur** de
`TRUNCATION_DIR`. **Non.** Un identifiant deviné dans ce répertoire ne produit rien de plus qu'une
chaîne de chemin que le modèle voit déjà, et ce chemin n'est jamais ouvert, jamais `stat`é, jamais
converti en lien : `docs/terminal-output.md:25-28` l'interdit nommément (« No referenced path is
automatically opened, **even inside the Truncate directory** or when supplied in metadata. Paths
are unverified upstream references, not authorization to read files. No stat, size-check/read,
symlink following or cross-session journal lookup occurs. »). Le préfixe ferme le seul cas qui*fuit
une localisation sur le disque*, à savoir la forge **hors** répertoire. §4 suffit ; §5.3 reste utile
en contingence ; la sévérité reste `low`.

**Le point faible structurel du remède — mesuré, pas déduit.** La question posée était : sur
Windows, `C:\...\TRUNCATION_DIR` et `C:\...TRUNCATION_DIR_EVIL` partagent-ils un préfixe que le
filtre laisserait passer ? J'ai exécuté le prédicat retenu contre huit cas (`PROBE_EXIT=0`) :

| Cas | Verdict |
|---|---|
| journal légitime sous la racine | `ACCEPTED` |
| frère `tool-output_EVIL\secret.txt` | **`REJECTED`** |
| traversée `…\tool-output\..\..\..\ssh\id_rsa` | `REJECTED` |
| relatif `a/scripts/foo` | `REJECTED` |
| absolu `C:\etc\shadow` | `REJECTED` |
| variante de casse du préfixe | `REJECTED` |
| identifiant deviné **dans** la racine | `ACCEPTED` (résidual documenté, voir O2) |
| racine nue, sans enfant | `REJECTED` |

Et le contre-facteur décisif : `NAIVE no-sep would ACCEPT sibling = true`. Un filtre par préfixe
*sans* séparateur final aurait accepté le frère `tool-output_EVIL`. C'est donc précisément le
`+ path.sep` de `:218` qui rend le remède sain. Un chemin retour à `l/scripts` **n'équivaut pas**
à une fuite de chemin : il est rejeté avant toute E/S, et l'ouverture resterait de toute façon
gardée en aval.

**Rejet du remède précédent — approuvé.** Ajouter `outputPath` au metadata n'est pas seulement
inélégant, il efface la couverture. `:84` affirme
`expect(embedded.metadata.outputPath).toBeUndefined()` et `:85`
`expect(embedded.metadata.upstreamOutputPaths).toEqual([truncated.outputPath])` : les deux ne sont
sensibles à la regex que dans la même itération `metadata = {}`. Fournir `outputPath` ferait passer
la branche `{}` pour une branche metadata, et le test validerait demain un harnais qui n'extrait plus
rien. `:145` le confirme par son titre même (« real canary, symlink and 32 MiB references never
supply compactor content ») : la référence doit **apparaître** sans fournir de contenu.

**Ce qui survit à la suppression** (`§6.3`, `:381-391`) — vérifié, pour éviter la sur-correction :
`:135` reçoit `run(fixtures.failure, { outputPath: missing })` en `:133`, `:176` reçoit
`metadata: { outputPath: expired }` en `:173`, `processor-effect.test.ts:817` reçoit
`metadata: { outputPath: journal, … }` (`:793` d'après la proposition ; existence de `:817` confirmée
par recherche, mais je n'ai pas relu `:793`). Aucune de ces assertions ne dépend de la regex.

## Remaining objections

- `refused` — **RC5 : « le chemin forgé est présenté au milieu d'une mention de rétention de 7 jours
  (`truncate.ts:13`) ».** Démontrée fausse. `RETENTION` n'a que deux occurrences dans `truncate.ts`:
  `:13` (déclaration) et `:56` (filtre de `cleanup()`). Le texte vu par le modèle est `:130`, qui ne
  mentionne aucune rétention. Preuve : recherche `RETENTION` sur `src/tool`, 2 correspondances.
- `refused` — **« il faut ajouter `outputPath` au metadata pour faire passer `:160` ».** Démontrée
  fausse, et nuisible. `:84` exige `outputPath` `toBeUndefined()` dans la même itération que `:85` ;
  l'injecter ferait valider un harnais qui n'extrait plus rien. La variante retenue préserve
  `:160` sans toucher au test, les trois références étant sous la racine (`:148-150`).
- `refused` — **« la variante §5.3 est nécessaire pour couvrir la forge d'un identifiant dans
  `TRUNCATION_DIR` ».** Démontrée non nécessaire. `docs/terminal-output.md:25-28` interdit
  explicitement l'ouverture « even inside the Truncate directory », et aucun code applicatif ne
  consomme `upstreamOutputPaths`. Le résidu est borné et gardé en aval.
- `refused` — **« la variante retenue casse `:160` parce que les références sont hors de
  `TRUNCATION_DIR` ».** Démontrée fausse : `:148-150` crée les trois par `store.write`, donc sous la
  racine ; `:150` suffixe le nom de fichier, pas le répertoire.
- `accepted` — **Sévérité `low` avec réserve.** La réserve est correctement formulée, pas une
  échappatoire : elle est falsifiable et nomme la condition exacte (§1 `:36-38` — « si une TUI vient
  un jour afficher `upstreamOutputPaths` comme un lien cliquable, la sévérité remonte »), et elle ne
  sert pas à reporter le classement. J'ai vérifié sa prémisse : une recherche
  `upstreamOutputPaths|upstreamReferences` sur tout `packages/opencode` rend 6 correspondances, dont
  les deux lignes productrices (`terminal-output.ts:252`, `:258`) et **quatre assertions de test**
  (`terminal-output.test.ts:85`, `:135`, `:176`, `processor-effect.test.ts:817`) — **aucun consommateur
  applicatif**. Classer `medium` aujourd'hui serait aussi injustifié que l'inverse. Sévérité finale
  entérinée : **`low`**.
- `accepted` — **Identifiant de journal deviné dans la racine.** Résidu que le remède ne ferme pas
  (`ACCEPTED` au banc d'essai). Borné : le résultat reste un chemin *dans* le répertoire des
  journaux, jamais ouvert ni `stat`é, et l'ouverture est gardée en aval. Le proposer comme
  `accepted` et non `open` repose sur deux choses vérifiées : le garde-fou est écrit dans
  `docs/terminal-output.md:25-28`, et le test F1/F3 couvre déjà la forge interne. Si une TUI cliquable
  apparaît, ce résidu change de nature — voir la réserve de sévérité.
- `accepted` — **Le protocole « exactement deux échecs, `:85` puis `:160` » (§7 `:423-426`) n'a pas
  été exécuté par moi.** Il exige de patcher `truncate.ts` et `terminal-output.ts`, ce qu'interdit
  cette mission. J'ai tenté une vérification en bac à sable **hors du dépôt**
  (`%TEMP%/opencodev2/p16-sandbox`, copie de `packages/opencode`) ; elle n'est pas fidèle :
  `bunfig.toml` déclare `preload = ["@opentui/solid/preload"]` puis `error: Cannot find package
  'drizzle-orm'`, et le bras témoin rend `0 pass | 2 fail | Ran 2 tests` contre 14/0 dans le dépôt.
  Bac à sable supprimé (`SB_CLEANUP=True`). **Ce protocole reste donc dérivé, pas observé.** La
  dérivation est complète et citée : la suppression rend `references` vide, ce qui fait tomber `:85`
  et `:160` ; `:135`, `:176`, `:817` et `message-v2.test.ts:1570` survivent parce qu'ils reçoivent
  tous `outputPath` par metadata (§6.3). L'exécution appartient à l'agent d'implémentation, pour qui
  la commande §7 est déjà écrite.
- `out_of_scope` — **Exhaustivité des trois sites de dérivation.** J'ai lu et confirmé les trois
  sites (`truncate.ts:29-31`, `:127`, `terminal-output.ts:145`) et l'absence de consommateur
  applicatif. Je n'ai pas réexécuté le `rg savedOutputPath` à l'échelle du dépôt qui fonde
  l'exhaustivité : la revendication reste héritée du verdict (`P16-verdict.md:30`), corroborée mais
  pas réétablie par moi.
- `out_of_scope` — **§8 `:481` mentionne `truncation.test.ts:184` parmi les fichiers de test de la
  variante suppression.** Mesure : `:184` est
  `expect(result.content).toContain("Tool output was truncated")`, qui survit aux deux variantes
  (préfixe du hint, conditionné à la troncature et non aux références) ; et une recherche
  `savedOutputPath|Full output saved to|unverified; not opened` sur `truncation.test.ts` rend **zéro**
  correspondance. Le fichier n'a donc pas besoin d'être modifié et le total « trois fichiers de test »
  est surestimé d'une unité. N'affecte pas le travail à faire : la variante retenue ne modifie
  **aucun** fichier de test et reste `XS`. À corriger le jour où la contingence est invoquée.

Aucun résidu `open`. Conformément à la règle d'implémentabilité (`REVALIDATION-BRIEFS.md:63`, `:69-71`,
`:74-75`), l'implémentation n'est pas bloquée.

## Regressions introduced

**Aucun test vert n'est cassé.** C'est explicite et mesuré : les quatre suites de la commande §7
rendent `111 pass`, `0 fail`, `EXIT=0` sur le code inchangé, et la variante retenue ne modifie
quatre lignes dans un seul fichier source, sans toucher aucun fichier de test
(`P16-output-path-regex.md:476-477`).

Les deux régressions du verdict sont des régressions **de la variante concurrente §5.3**, non de la
variante retenue, et aucune des deux ne survit au remède retenu :

- `:85` — la variante retenue le préserve : la référence reste sous la racine, donc
  `upstreamOutputPaths` vaut toujours `[truncated.outputPath]`.
- `:160` — la variante retenue le préserve : les trois références de `:148-150` sont sous la racine.

Sous la variante §5.3, ces deux-là casseraient, et le correctif de test prêt à appliquer (§7,
variante « suppression », `:292-303`) les réécrirait au lieu de les supprimer. Les quatre assertions
de §6.3 reçoivent toutes `outputPath` par metadata et ne casseraient donc pas. Aucun test déjà rouge
n'est aggravé : aucune des quatre suites rouges de la base (`shell`, `compaction`, `read`, `task`)
ne touche P16.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

Les sept Required changes sont traités et vérifiés à leur site d'atterrissage, aucun résidu n'est
`open`, et `## Regressions introduced` déclare qu'aucun test vert n'est cassé — les trois conditions
de `REVALIDATION-BRIEFS.md:69-71`. `REVALIDATED-PASS` serait inappropriate : `P16-output-path-regex.md:412-413`
contient une affirmation fausse sur l'absence de `wave4-baseline.md`, et `:481` surestime un fichier
de test ; aucune n'est bloquante, mais aucune n'est fausse non plus, et le gabarit (`:55-56`) rattache
`PASS` à un état de fait total.

## Grille d'effort pour la vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| RC1 (résoudre l'`INFERE`, `:160`) | clos | aucun | aucun | `aucun` — `:148-160` relu, préservé |
| RC2 (figer les deux comportements) | clos | aucun | aucun | `aucun` — `:154-164` intact sous §4 |
| RC3 (trancher O2, §4, §8) | clos | aucun | aucun | `aucun` — `:476-483` lus |
| RC4 (filtre de préfixe) | clos | aucun | aucun | `aucun` |
| RC5 (citation de rétention) | clos | aucun | aucun | `aucun` |
| RC6 / RC7 (§7, commande 4 fichiers) | clos | aucun | aucun | `aucun` — commande exécutée, `111 pass` |
| **Filtre de préfixe `savedOutputPath`** | `XS` | `packages/opencode/src/tool/truncate.ts` (`:29-31`) | `test/tool/truncation.test.ts` — cas `inside` conservé / `outside` écarté, selon `:433-445` | `aucun` |
| Exécution du protocole « 2 échecs » (§7 `:423-426`) | `S` | aucun (variant §5.3) | aucun | **oui si la variante §5.3 est retenue** — `terminal-output.test.ts:83-85` et `:154-164` ; sinon aucun |
| Correction de `:481` (`truncation.test.ts:184` surestimé) | `XS` | aucun | aucun | `aucun` — `:184` survit aux deux variantes |
| Correction de `:412-413` (base de mesure) | `XS` | aucun | aucun | `aucun` — `wave4-baseline.md:22` existe |