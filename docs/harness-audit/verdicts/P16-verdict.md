# P16 — chemin de fichier reconstruit par regex depuis du contenu non fiable

## Proposal

`P16` — chemin de fichier reconstruit par regex depuis du contenu non fiable.
Fichier validé : `C:\jeanluc\opencode-fork\docs\harness-audit\proposals\P16-output-path-regex.md`

## Validator

`opencode/space-bunny-free` — `independent` : n'a pas rédigé la proposition, n'a
modifié aucun fichier source. Toutes les affirmations ci-dessous ont été relues
dans le code réel de cette session.

## Status

`PASS_WITH_CHANGES`

Sévérité réelle arbitrée : **`low`** (et non `medium`, et non `M`). La chaîne de
consommation a été suivie jusqu'à son terme : `references` n'atteint **ni un lien
cliquable, ni un fichier ouvert, ni une permission**. Elle atteint **un texte
passé au modèle** et **deux champs de métadonnées inertes**. Le classement `M` de
l'audit initial n'est pas soutenable ; l'argument de P16 qui *conclut* à une
sévérité basse est en revanche juste, et je le confirme.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok (22 lues verbatim, 1 inexacte, 1 ligne INFERE résolue) | voir détail ci-dessous |
| le correctif supprime vraiment la cause | ok | `truncate.ts:29-31` (regex) + `truncate.ts:127` + `terminal-output.ts:145` sont les **seuls** sites de dérivation texte→chemin ; `rg savedOutputPath` sur tout le dépôt ne rend que `truncate.ts:29`, `truncate.ts:127`, `terminal-output.ts:145`, plus les citations de docs `P09:91,97` et `P16` |
| le correctif ne casse pas un comportement existant | KO | **deux** régressions de test, pas une : `test/tool/terminal-output.test.ts:85` (déjà identifié par P16) **et** `test/tool/terminal-output.test.ts:160` (que P16 avait marqué `INFERE` et que j'ai résolu) |
| tests proposés sont exécutables dans ce dépôt | ok | `bun test test/tool/truncation.test.ts test/tool/terminal-output.test.ts` depuis `packages/opencode` → `33 pass`, `0 fail`, `Ran 33 tests across 2 files. [8.41s]`, `EXIT=0`. Les 3 cas proposés utilisent `yield* Truncate.Service` et `it.live`, même schéma que `truncation.test.ts:178-181` |
| effort et coût annoncés réalistes | KO (partiel) | `XS` est correct pour le patch, mais l'effort est **sous-estimé** : 3 fichiers de test touchés et non 1, et une **fonction documentée** est supprimée (`docs/terminal-output.md:32`) |

### Détail des citations lues verbatim dans le code réel

Confirmées exactement :

- `truncate.ts:29-31` — la regex, `/…Full output saved to: ([^\r\n]+)/` ✓
- `truncate.ts:127` — `const references = [...new Set([options.outputPath, savedOutputPath(text)].filter(…))]` ✓
- `truncate.ts:130` — le `hint` contient bien `Upstream reference (unverified; not opened): ${JSON.stringify(reference)}` ✓
- `truncate.ts:132-139` / `:138` — `outputPath: file` ✓ · `truncate.ts:128` — `const file = yield* write(text)` ✓ · `truncate.ts:17` `DIR = TRUNCATION_DIR` ✓ · `truncate.ts:22-27` `Options.outputPath` ✓ · `truncate.ts:68-73` `write` apatride ✓ · `truncate.ts:86-88` plafonds ✓ · `truncate.ts:90-95` non-troncature sous les limites ✓ · `truncate.ts:13` `RETENTION = Duration.days(7)` ✓ (constante) · `truncate.ts:16` `MAX_BYTES = 50 * 1024` ✓
- `terminal-output.ts:143-146` ✓ · `:147` (« References are untrusted data… ») ✓ · `:225` `referenceText` ✓ · `:235-237` `footer` ✓ · `:246` `const output = \`${prefix}${body}${footer}\`` ✓ · `:252` `...(references.length ? { upstreamOutputPaths: references } : {})` ✓ · `:258` `upstreamReferences: references` ✓
- `read.ts:229-232` `assertExternalDirectoryEffect` ✓ · `read.ts:234-239` `ctx.ask({ permission: "read" … })` ✓
- `shell.ts:605` — **seul** émetteur de production de `Full output saved to:` — `output = \`...output truncated...\n\nFull output saved to: ${file}\n\n\` + output` ✓ · `shell.ts:618` — `...(cut && file ? { outputPath: file } : {})`, **sous la même condition `cut && file`** ✓
- `tool.ts:199`, `registry.ts:261`, `tools.ts:685`, `processor.ts:602` — les 5 producteurs de `outputPath` ✓ (confirmés par `rg "outputPath:" src`)
- `docs/terminal-output.md:25-28` (« No stat, size-check/read, symlink following or cross-session journal lookup occurs ») ✓ · `:32` (« `upstreamOutputPaths` retains upstream references ») ✓ · `:34` (« there is no trusted journal registry ») ✓
- `truncation.test.ts:184-186` ✓ · `terminal-output.test.ts:77-82`, `:83-85`, `:140`, `:154-164`, `:168-179` ✓ · `processor-effect.test.ts:792-793`, `:817` ✓ · `message-v2.test.ts:1570` ✓

**Citation inexacte (1)** — P16 §2.4 affirme que le chemin forgé est présenté au modèle « au milieu d'une mention de rétention de 7 jours (`truncate.ts:13`) ». Le texte visible par le modèle est `truncate.ts:130`, et il ne contient **aucune** mention de rétention : `Tool output was truncated. … Use Grep to search the full content or Read with offset/limit…`. `truncate.ts:13` définit `RETENTION` pour `cleanup()` seulement. La ligne citée est exacte, l'inférence qu'elle porte ne l'est pas.

Lignes confirmées par `rg` mais non relues individuellement : `terminal-output.test.ts:135`. Le motif de test est cohérent avec `:140` (`run(…, { outputPath: journal })`).

## Objections

### O1 — `metadata` n'est pas la seule voie : la régression de test est double, et le remède proposé détruit la couverture qu'il prétend conserver

P16 §6 ne connaît qu'un seul point d'échec (`terminal-output.test.ts:83-85`) et laisse le
second en `INFERE`. Je l'ai résolu : **il échoue**.

`terminal-output.test.ts:154-164` (test « F1/F3 ») :

```ts
for (const reference of [canary, link, large]) {
  for (const metadata of [{}, { outputPath: reference }]) {
    const raw = `public output\nFull output saved to: ${reference}`
    const result = yield* compactTerminalOutput({ …, output: raw, metadata, … })
    …
    expect(result.output).toContain("unverified; not opened")   // :160
```

Dans la branche `metadata = {}`, la **seule** source de `references` est
`Truncate.savedOutputPath(input.output)` (`terminal-output.ts:145`). Après suppression,
`references` vaut `[]`, `referenceText` (`terminal-output.ts:225`) vaut `""`, et
`:160` tombe. Le correctif de P16 pour ce cas — « ajouter `outputPath` au `metadata` du cas
concerné » (P16:213) — est **inacceptable** : il ferait passer la branche `{}` pour une
branche `metadata` et **supprimerait exactement la couverture que ce test existe pour**
(cf. son titre, `:145` : « real canary, symlink and 32 MiB references never supply compactor
content », et son assertion jumelle `:158-159`). Le test F1/F3 verrait demain un harnais
qui n'extrait plus rien et le déclarerait conforme.

### O2 — Le correctif supprime une capacité documentée, et P16 ne le dit pas : le chemin n'est pas seulement une menace, c'est aussi un mécanisme de récupération de provenance

La branche `metadata = {}` de `:154`, et `terminal-output.test.ts:83-85`
(`run(truncated.content, {}, "bash")` — **sans** metadata, qui exige
`upstreamOutputPaths === [truncated.outputPath]`), décrivent un usage légitime : quand
`metadata` n'est pas transporté, la référence est **récupérée depuis le texte du harnais
lui-même**. Ce texte est bien produit par le seul émetteur de production, `shell.ts:605`.

Ce mécanisme est documenté comme une fonctionnalité : `docs/terminal-output.md:32` —
« `upstreamOutputPaths` retains upstream references », avec `docs/terminal-output.md:34`
qui refuse explicitement d'ajouter un registre de confiance. Il survit d'ailleurs dans
l'historique : `message-v2.test.ts:1570` rejoue un `summary` contenant
`Full output saved to: /logs/raw` avec des metadata qui ne portent **pas** `outputPath`.

Supprimer la regex retire donc ce que P16 qualifie de « chemin non fiable » mais qui est,
dans le cas nominal, une information de provenance produite par le harnais. Ce n'est pas
une réécriture équivalente : c'est un **retrait de fonctionnalité**, ce qui contredit
P16 §4 (« Ce qui reste volontairement inchangé ») et sous-estime §8. Rien dans P16 ne
l'énonce comme un sacrifice assumé, et la note « le `Set` disparaît : il n'avait qu'une
raison d'exister » (`P16:137`) est un argument de propreté du `Set`, pas une justification
de la perte de la branche.

### O3 — L'alternativeEvidente à coût nul n'a pas été considérée : un filtre de préfixe sur `TRUNCATION_DIR`, sans `stat` ni oracle d'existence

P16 §5.1 rejette « validation de l'extraction de secours (résolution + existence) » — rejet
**correct**, cela ajouterait une opération disque et une oracle d'existence. Mais la
variante utile n'est pas celle-là. `truncate.ts:17` expose `DIR = TRUNCATION_DIR` et
`truncate.ts:69` écrit exclusivement `path.join(TRUNCATION_DIR, ToolID.ascending())` :
tous les journaux légitimes vivent sous ce préfixe. Un test de préfixe pur sur la chaîne
extraite :

- conserve intégralement le cas légitime (O2) ;
- supprime la forge `C:\Users\victim\.ssh\id_rsa` et toute cible hors du répertoire ;
- n'effectue **aucun** `stat`, **aucune** résolution, **aucune** lecture, **aucune**
  oracle d'existence — donc aucun des reproches portés à §5.1 ;
- coûte une ligne, donc reste `XS`.

Son unique limite — un identifiant de journal deviné dans le répertoire reste accepté — est
déjà couverte : `terminal-output.test.ts:145-166` prouve qu'une telle référence ne fournit
jamais de contenu, et `read.ts:229-232` + `read.ts:234-239` gardent l'ouverture. Le
correctif de P16, lui, coûte deux tests et une fonctionnalité documentée pour un gain de
sécurité **rigoureusement nul** au-dessus du garde en aval — ce qu'il reconnaît lui-même
(`P16:112-115`).

### O4 — Surqualification de la sévérité dans l'auto-évaluation

`P16:308-312` plaide pour « matériellement au-dessus de `L` » sur l'honnêteté de la
provenance. La chaîne réelle ne le soutient pas à ce niveau : la valeur forgée ne sort du
harnais que par (a) une **chaîne de texte** dans le résultat d'outil (`truncate.ts:130` →
`:132-139`, `terminal-output.ts:225` → `:246`) et (b) deux champs de métadonnées dont
`rg upstreamOutputPaths|upstreamReferences` sur **tout** le dépôt ne montre **aucun**
consommateur applicatif — seulement `terminal-output.ts:252`, `:258`, quatre assertions de
test (`terminal-output.test.ts:85`, `:135`, `:176`, `processor-effect.test.ts:817`) et
`docs/terminal-output.md:32`. Aucun code ne transforme la valeur en lien, en action ou en
demande de permission. `low`, avec une réserve explicite : si un jour une TUI rend
`upstreamOutputPaths` comme lien, la séventielle remonte — ce qui est une raison de
supprimer la dérivation, pas de la classer `medium` aujourd'hui.

## Required changes

1. **Résoudre l'`INFERE` de P16:209-213 et leRecorded comme régression confirmée.**
   `test/tool/terminal-output.test.ts:160` échoue dans la branche `metadata = {}` de la
   boucle `:154-164`. Ne pas appliquer le remède P16:213 (ajouter `outputPath` au
   metadata) : cela efface la couverture text→chemin du test F1/F3.
2. **Réécrire la boucle `:154-164` pour figurer les deux comportements distincts** :
   `metadata = {}` → aucune référence extraite du texte (nouveau comportement attendu,
   assertion `not.toContain(reference)` sur `output`) ; `metadata = { outputPath }` →
   référence présente et marquée `unverified; not opened`, contenu canary toujours absent
   (conserver `:158-159`).
3. **Trancher O2 explicitement dans la proposition** : dire que la suppression retire la
   récupération de provenance depuis le texte du harnais,feature documentée par
   `docs/terminal-output.md:32`. Corriger §4 (« Ce qui reste volontairement inchangé »),
   §8 (`XS` → `S`, trois fichiers de test) et la justification `P16:137`.
4. **Ajouter l'alternative du filtre de préfixe `TRUNCATION_DIR` (§5, nouvelle entrée)**,
   conformément à O3 : `const within = extracted && path.resolve(extracted).startsWith(path.resolve(TRUNCATION_DIR) + path.sep)` — sans `stat`, sans résolution, sans oracle. Si elle est retenue, O1 reste à traiter mais O2 et la perte de fonctionnalité disparaissent, et le correctif redevient réellement sans régression.
5. **Corriger l'affirmation `P16:77-78`** (« au milieu d'une mention de rétention de 7
   jours, `truncate.ts:13` ») : le texte visible par le modèle est `truncate.ts:130` et ne
   mentionne pas la rétention.
6. **Corriger le critère de succès §7** : nommer le troisième fichier de test
   (`test/tool/terminal-output.test.ts`) et exiger `N >= 33` **avec** la branche `{}` de
   `:154` mise à jour, pas seulement `0 fail`.
7. **Ajouter `test/session/processor-effect.test.ts` et `test/session/message-v2.test.ts`
   à la commande de §7** si le choix est (3) : ces deux fichiers pinning le transport de la
   référence dans l'historique peuvent être affectés par la perte de la branche.

## Implementation guidance

Ordre : corriger d'abord §5 de la proposition (décision O2/O3), **puis** patcher — si et
seulement si la suppression est confirmée, `truncate.ts:29-31` + `:127`, puis
`terminal-output.ts:143-146`, puis les trois sites de test
(`terminal-output.test.ts:83-85`, `:154-164`, `truncation.test.ts:184`).
Piège connu : `truncate.ts:130` change de libellé selon `references.length`
(`"Received"` vs `"Full"`) — supprimer la branche fait basculer ce libellé dans le cas
`metadata` absent, ce qui modifie le texte vu par le modèle et doit être asserté, pas
supposé. Avant de commencer, figer la référence : `bun test test/tool/truncation.test.ts
test/tool/terminal-output.test.ts` → `33 pass / 0 fail` (reproduit dans cette session,
`EXIT=0`), puis exiger `0 fail` **et** la nouvelle assertion de la branche `{}`.