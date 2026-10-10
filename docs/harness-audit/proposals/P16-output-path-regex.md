# P16 — chemin de fichier reconstruit par regex depuis du contenu non fiable

> Révisé après verdict `PASS_WITH_CHANGES` du 2026-10-03 — réécriture complète (fichier corrompu,
> règle `C-21`), sévérité recalée à `low`.

Sévérité : **`low`** (arbitrage `C-10`, confirmé par `P16-verdict.md:18-23`).
Décision de remédiation : **conserver l'extraction de secours et la borner à `TRUNCATION_DIR`**
(option du §4), au lieu de supprimer la regex.

## Traçabilité des Required changes du verdict

| # | Required change | Où il est traité | État |
|---|---|---|---|
| RC1 | résoudre l'`INFERE` et l'enregistrer comme régression confirmée | §6.2 : `terminal-output.test.ts:160`, branche `metadata = {}` de la boucle `:154-164`, mécanisme ligne à ligne | fait |
| RC2 | réécrire la boucle `:154-164` pour figer les deux comportements distincts | §5.3, correctif prêt à appliquer **si** la suppression est retenue ; la variante retenue au §4 ne touche pas ce test | fait |
| RC3 | trancher O2 explicitement, corriger §4 « ce qui reste inchangé », §8 (`XS`→`S`, trois fichiers de test), et la justification « le `Set` disparaît » | §1, §2.5, §3.4, §4 (bloc « Ce qui reste volontairement inchangé »), §5.3, §8 | fait |
| RC4 | ajouter l'alternative du filtre de préfixe `TRUNCATION_DIR` | §5.2 (retenue) — c'est la décision centrale de cette révision | fait |
| RC5 | corriger l'affirmation « au milieu d'une mention de rétention de 7 jours (`truncate.ts:13`) » | §2.2 : le texte vu par le modèle est `truncate.ts:130` et ne mentionne pas la rétention | fait |
| RC6 | corriger le critère de succès §7 : nommer le troisième fichier de test et exiger `N >= 33` | §7, critères séparés par variante | fait |
| RC7 | ajouter `processor-effect.test.ts` et `message-v2.test.ts` à la commande §7 | §7, dans la variante retenue **et** dans la variante suppression | fait |

Corrections d'arbitrage également appliquées : `C-10` (sévérité `low`, §1 et §9), `C-11` + `C-26`
(deux régressions, §6.1 et §6.2), réécriture intégrale du fichier (§0 et en-tête, règle `C-21`).

## 1. Problem

Un chemin de fichier est reconstruit par expression régulière depuis le **texte** d'une sortie
d'outil, puis réinjecté comme référence dans le texte compacté et dans deux champs de métadonnées.

Sévérité **`low`** : la chaîne de consommation a été suivie jusqu'à son terme et s'arrête à **un
texte passé au modèle** et à **deux champs de métadonnées inertes**. Elle n'atteint ni un lien
cliquable, ni un fichier ouvert, ni une demande de permission — `docs/terminal-output.md:26-28`
et `read.ts:229-239` en sont les gardiens. Le classement `medium` de l'audit initial et le `M` de
la matrice ne sont pas soutenables (`C-10`).

Réserve explicite, reprise du verdict : **si une TUI vient un jour afficher `upstreamOutputPaths`
comme un lien cliquable, la sévérité remonte.** C'est une raison de borner la dérivation, pas de
la classer `medium` aujourd'hui.

## 2. Evidence

### 2.1 Les trois — et seulement trois — sites de dérivation texte→chemin

`rg "Full output saved to"` sur `packages/opencode/src` ne rend que deux lignes : `shell.ts:605`
(productrice) et `truncate.ts:30` (consommatrice). `rg savedOutputPath` ne rend que les trois
sites ci-dessous.

`packages/opencode/src/tool/truncate.ts:29-31` — la regex :

```ts
export function savedOutputPath(text: string) {
  return text.match(/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/)?.[1]?.trim()
}
```

`packages/opencode/src/tool/truncate.ts:127` — premier appelant :

```ts
      const references = [...new Set([options.outputPath, savedOutputPath(text)].filter((value): value is string => value !== undefined))]
      const file = yield* write(text)
```

`packages/opencode/src/tool/terminal-output.ts:143-146` — second appelant :

```ts
  const references = [...new Set([
    typeof input.metadata.outputPath === "string" ? input.metadata.outputPath : undefined,
    Truncate.savedOutputPath(input.output),
  ].filter((value): value is string => value !== undefined))]
  // References are untrusted data, never a capability to open another journal.
```

Ce sont les **seuls** sites de dérivation texte→chemin du dépôt.

Les cinq producteurs de `outputPath` — `session/tools.ts:685`, `tool.ts:199`, `registry.ts:261`,
`processor.ts:602`, `shell.ts:618` — sont tous des **émetteurs** de chemin, jamais des lecteurs de
texte : ils n'ajoutent aucune capacité de dérivation. Dérivation vérifiée par liste fermée :
`rg "outputPath:"` sur `packages/opencode/src` rend exactement 7 correspondances, ces cinq
émetteurs plus `truncate.ts:20` (ligne de type) et `truncate.ts:138` (le hint du §2.2) — les deux
seules autres sont des lectures ou des constructions de `references`, pas des_points d'entrée
textuels supplémentaires.

### 2.2 Le texte vu par le modèle (citation rectifiée — RC5)

`truncate.ts:130` est la seule ligne dont le contenu atteint le modèle :

```ts
      const hint = `Tool output was truncated. ${references.length ? "Received" : "Full"} output saved to: ${file}${references.map((reference) => `\nUpstream reference (unverified; not opened): ${JSON.stringify(reference)}`).join("")}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`
```

**Correction de la version précédente de cette proposition** : elle affirmait que le chemin forgé
est présenté au modèle « au milieu d'une mention de rétention de 7 jours (`truncate.ts:13`) ».
C'est faux. Le texte visible par le modèle est `truncate.ts:130`, et il ne mentionne **aucune**
rétention ; `truncate.ts:13` définit `const RETENTION = Duration.days(7)` pour `cleanup()` seul
(`truncate.ts:64`), jamais pour le texte. La ligne citée était exacte, l'inférence qu'elle portait
ne l'était pas.

`terminal-output.ts:225` reproduit la même ligne dans le texte compacté (`referenceText`), `:235-237`
la place dans `footer`, `:246` assemble `const output = \`${prefix}${body}${footer}\``. C'est le
même canal textuel, pas un canal distinct.

### 2.3 Les deux champs de métadonnées inertes

`terminal-output.ts:252` `...(references.length ? { upstreamOutputPaths: references } : {})` et
`terminal-output.ts:258` `upstreamReferences: references`.

Sur **tout** le dépôt, `upstreamOutputPaths` / `upstreamReferences` n'ont **aucun** consommateur
applicatif : seulement `terminal-output.ts:252` et `:258`, quatre assertions de test
(`terminal-output.test.ts:85`, `:135`, `:176`, `processor-effect.test.ts:817`) et
`docs/terminal-output.md:32`. Aucun code ne transforme la valeur en lien, en action ou en demande
de permission. C'est le fondement de `low`.

### 2.4 Les gardiens en aval qui interdisent l'exploitation

`read.ts:229-239` — l'ouverture d'un journal par l'outil `read` reste gardée :

```ts
      yield* assertExternalDirectoryEffect(ctx, filepath, {
        bypass: Boolean(ctx.extra?.["bypassCwdCheck"]) || (yield* reference.contains(filepath)),
        kind: stat?.type === "Directory" ? "directory" : "file",
      })

      yield* ctx.ask({
        permission: "read",
        patterns: [path.relative(instance.worktree, filepath)],
        always: ["*"],
        metadata: {},
      })
```

`docs/terminal-output.md:25-28` — « No referenced path is automatically opened, even inside the
Truncate directory or when supplied in metadata. Paths are unverified upstream references, not
authorization to read files. No stat, size-check/read, symlink following or cross-session journal
lookup occurs. »

`terminal-output.test.ts:145-166` (test F1/F3, titre : « real canary, symlink and 32 MiB
references never supply compactor content ») — une référence forgée, même réelle et lisible, ne
fournit **jamais** de contenu au compacteur. La limite résiduelle du correctif §4 est déjà couverte
par ce test.

### 2.5 La capacité documentée que la regex porte

`docs/terminal-output.md:31-34` :

```text
`outputPath` points to this new journal when made;
`upstreamOutputPaths` retains upstream references. Missing/expired references do
not suppress journaling. An upstream excerpt cannot recover omitted evidence;
there is no trusted journal registry. This can store an extra received excerpt
alongside an existing upstream journal, deliberately favoring evidence integrity.
```

En usage nominal, la référence **provient du harnais lui-même** : `shell.ts:604-606` est le seul
émetteur de production, sous la condition `cut && file`, et `shell.ts:618` publie le même `file`
dans le metadata sous cette même condition :

```ts
      if (cut && file) {
        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output
      }
```

et

```ts
          truncated: cut,
          ...(cut && file ? { outputPath: file } : {}),
```

`truncate.ts:68-73` écrit exclusivement sous ce préfixe, ce qui fonde le correctif §4 :

```ts
    const write = Effect.fn("Truncate.write")(function* (text: string) {
      const file = path.join(TRUNCATION_DIR, ToolID.ascending())
      yield* fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie)
      yield* fs.writeFileString(file, text).pipe(Effect.orDie)
      return file
    })
```

`truncate.ts:17` expose `export const DIR = TRUNCATION_DIR`, et `src/tool/truncation-dir.ts:4`
fixe `TRUNCATION_DIR = path.join(Global.Path.data, "tool-output")`. La racine est donc connue
sans aucune E/S : c'est une constante de module.

## 3. Mechanism

1. `trunc.write` écrit le journal sous `path.join(TRUNCATION_DIR, ToolID.ascending())`
   (`truncate.ts:69`) et `shell.ts:605` grave ce chemin dans **le texte** de sortie.
2. Ce texte traverse le chemin d'outils. À deux endroits, une regex le relit pour en extraire un
   chemin : `truncate.ts:127` (dans le hint `truncate.ts:130`) et `terminal-output.ts:145` (dans
   `referenceText` `terminal-output.ts:225`).
3. **L'injection** : un texte d'entrée contenant lui-même la ligne
   `Full output saved to: <chemin au choix de l'émetteur>` est matché par
   `/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/`. Rien ne distingue la ligne produite par
   `shell.ts:605` d'une ligne forgée : le harnais est le seul juge, et il juge sur la forme.
4. **La consommation** s'arrête à `truncate.ts:130` (texte vu par le modèle) et à
   `terminal-output.ts:252`/`:258` (deux champs sans consommateur, §2.3). Aucun `stat`, aucune
   résolution, aucune ouverture, aucune permission n'est demandée sur la valeur forgée — d'où
   `low`.
5. **Ce que la regex apporte** : dans la branche `metadata = {}`, elle est le **seul** moyen de
   récupérer la référence amont quand le metadata n'est pas transporté. C'est un usage légitime,
   documenté (`docs/terminal-output.md:32`), pas un accident — et il est exercé par deux tests.

## 4. Proposal

Borner l'extraction de secours au préfixe `TRUNCATION_DIR`, dans la **fonction partagée**, de sorte
que les deux appelants (`truncate.ts:127` et `terminal-output.ts:145`) soient corrigés en un seul
point.

Fichier modifié : `packages/opencode/src/tool/truncate.ts` — fonction `savedOutputPath` (`:29-31`).
Aucun autre fichier source n'est touché.

```ts
export function savedOutputPath(text: string) {
  const extracted = text.match(/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/)?.[1]?.trim()
  if (extracted === undefined) return undefined
  const root = path.resolve(TRUNCATION_DIR)
  return path.resolve(extracted).startsWith(root + path.sep) ? extracted : undefined
}
```

Comportement qui change : une extraction **hors de `TRUNCATION_DIR`** est abandonnée au lieu d'être
réinjectée. Une extraction **dans `TRUNCATION_DIR`** est conservée à l'identique.

Pourquoi cela suffit à la fois à la sécurité et à la fidélité :

- **Sécurité** : `C:\Users\victim\.ssh\id_rsa`, `C:\Users\victim\AppData\...`, `/etc/shadow` et
  toute cible hors du répertoire de journaux sont écartés. Aucun `stat`, aucune résolution
  disque, aucune lecture, aucune **oracle d'existence** — donc aucun des reproches portés à la
  variante « validation de l'extraction » (§5.1).
- **Fidélité** : le cas nominal est intégralement préservé, parce que le **seul** émetteur de
  production écrit sous ce préfixe (`truncate.ts:69`, atteint par `shell.ts:598`). Le texte vu par
  le modèle est **inchangé en production**, `referenceText` garde sa longueur, et le budget de
  `terminal-output.ts:228` n'est pas recalculé.
- **Défaillance dans le sens sûr** : sur Windows `startsWith` est sensible à la casse, donc une
  forge qui change la casse du préfixe est **écartée**, pas acceptée. Un chemin relatif est résolu
  contre le `cwd` et écarté s'il n'est pas sous la racine.

### Ce qui reste volontairement inchangé, et pourquoi

- **La regex n'est pas supprimée.** Elle porte une capacité documentée
  (`docs/terminal-output.md:32`) : quand `metadata` n'est pas transporté, la référence amont est
  récupérée depuis le texte du harnais, texte produit par `shell.ts:605`. La supprimer serait un
  **retrait de fonctionnalité**, pas une réécriture équivalente : le correctif de la version
  précédente coûtait deux tests et une fonctionnalité documentée pour un gain de sécurité
  rigoureusement nul au-dessus des gardiens en aval (§2.4), ce qu'il reconnaissait lui-même.
- **`options.outputPath` / `metadata.outputPath` ne sont pas filtrés** (`truncate.ts:127`,
  `terminal-output.ts:144`). Ce sont des chemins **émis** par le harnais, jamais relus dans un
  texte ; les filtrer casserait `terminal-output.test.ts:135` et `:176`, qui fournissent des
  chemins identiques sous `TRUNCATION_DIR` et vérifient précisément que le mécanisme survit à une
  référence manquante ou expirée.
- **Les deux `new Set` sont conservés.** La version précédente justifiait leur disparition par
  « le `Set` n'avait qu'une raison d'exister » : c'est un argument de propreté, pas une
  justification de perte de branche. Le dédoublonnage évite qu'une référence présente à la fois
  dans le metadata et dans le texte (`terminal-output.test.ts:142`) apparaisse deux fois.
- **Le libellé `"Received"` / `"Full"` de `truncate.ts:130` reste piloté par
  `references.length`.** Comme la branche légitime survit, ce libellé ne bascule pas en
  production ; s'il basculait, le texte vu par le modèle changerait et devrait être asserté.
- **`terminal-output.ts:147`** (« References are untrusted data, never a capability to open
  another journal ») reste vrai : il décrit l'aval, pas l'extraction.

## 5. Alternatives considered

### 5.1 Validation de l'extraction de secours (résolution + existence) — rejetée

`path.resolve` + `fs.exists` sur la valeur extraite. **Rejetée** : elle ajoute une opération
disque et une **oracle d'existence** sur une entrée non fiable, donc une fuite d'information
potentielle, et elle coûte plus cher que le filtre de préfixe pour un gain strictement nul —
l'ouverture reste gardée par `read.ts:229-239` de toute façon.

### 5.2 Filtre de préfixe `TRUNCATION_DIR` seul — **retenu**

C'est l'alternative que la version précédente n'avait pas considérée. Elle conserve intégralement
le cas légitime (§2.5), supprime toute cible hors du répertoire, ne fait ni `stat`, ni résolution,
ni lecture, ni oracle, et tient en quatre lignes. **Retenue** comme correctif principal ; son
unique limite — un identifiant de journal deviné *dans* le répertoire reste accepté — est déjà
couverte par `terminal-output.test.ts:145-166` et par les gardiens d'ouverture. Le code est au §4.

### 5.3 Suppression pure de la regex — écartée comme option principale, maintenue en contingence

`truncate.ts:29-31` supprimé, `:127` réduit à `[options.outputPath]`, `:145` supprimé. Elle est
**correcte sur le fond** — c'est la seule variante qui interdit aussi une forge *à l'intérieur* de
`TRUNCATION_DIR` — mais elle casse **deux** tests (§6), retire une fonctionnalité documentée
(`docs/terminal-output.md:32`), fait basculer le libellé de `truncate.ts:130` dans le cas
`metadata` absent, exige trois fichiers de test et une décision explicite de sacrifice (RC3).

Elle est conservée ci-dessous comme **contingence** si le validateur juge la forge interne au
répertoire inacceptable — auquel cas le correctif de test prêt à appliquer est celui-ci, qui fige
les **deux** comportements distincts exigés par RC2 (ne **pas** ajouter `outputPath` au metadata
du cas concerné : cela effacerait la couverture text→chemin du test F1/F3, cf. RC1) :

```ts
    for (const reference of [canary, link, large]) {
      const raw = `public output\nFull output saved to: ${reference}`
      const bare = yield* compactTerminalOutput({ tool: "bash", args: {}, sessionID: "other-session", output: raw, metadata: {}, polls: createTerminalPollState(), store })
      expect(bare.output).not.toContain(reference)          // branche metadata = {} : plus d'extraction du texte
      expect(bare.output).not.toContain("unverified; not opened")
      const carried = yield* compactTerminalOutput({ tool: "bash", args: {}, sessionID: "other-session", output: raw, metadata: { outputPath: reference }, polls: createTerminalPollState(), store })
      expect(carried.output).not.toContain("PRIVATE_CROSS_SESSION_CANARY")     // :158-159 conservées
      expect(carried.output).not.toContain("LARGE_UNREAD_CANARY")
      expect(carried.output).toContain("unverified; not opened")              // :160
      expect(carried.metadata.terminalOutput).toMatchObject({ rawBytes: Buffer.byteLength(raw) })
      expect(Buffer.byteLength(carried.output)).toBeLessThan(1000)
    }
```

et `terminal-output.test.ts:83-85`, qui exige `upstreamOutputPaths === [truncated.outputPath]` en
`metadata = {}`, est requalifié en assertion de non-régression explicite :

```ts
  const embedded = yield* run(truncated.content, {}, "bash")
  expect(embedded.metadata.outputPath).toBeUndefined()
  expect(embedded.metadata.upstreamOutputPaths).toBeUndefined()   // plus d'extraction depuis le texte
```

### 5.4 Registre de confiance des journaux — rejetée

Un registre persistant des journaux écrits par le harnais, avec une identité vérifiable.
**Rejetée** : `docs/terminal-output.md:34` refuse explicitement l'idée (« there is no trusted
journal registry »), le coût est celui d'un état persistant, et le gain est nul devant
`read.ts:229-239`.

### 5.5 Rendre le format non imitable (jeton opaque ou signature) — rejetée

Remplacer le chemin en clair par un jeton non falsifiable. **Rejetée** : coût très supérieur
(`XS` → `L`), portabilité et débogage dégradés, et le risque visé n'est pas dans l'imitation de la
forme mais dans l'absence de vérification de l'**origine** — que le préfixe vérifie déjà.

## 6. Risks

### 6.1 Régression n°1 — `test/tool/terminal-output.test.ts:85` (connue de la version précédente)

```ts
  const embedded = yield* run(truncated.content, {}, "bash")
  expect(embedded.metadata.outputPath).toBeUndefined()
  expect(embedded.metadata.upstreamOutputPaths).toEqual([truncated.outputPath])
```

`metadata` est `{}` : la seule source de `references` est `Truncate.savedOutputPath(input.output)`
(`terminal-output.ts:145`). Toute suppression de l'extraction fait tomber `:85`.

**Traitement** : la variante retenue (§4) **préserve** ce test — `truncated.outputPath` vient de
`store.output()` et vaut `path.join(TRUNCATION_DIR, ToolID.ascending())`, donc l'extraction passe
le filtre de préfixe et la référence est conservée à l'identique. Aucune régression. Sous la
variante §5.3, `:83-85` est requalifié comme ci-dessus.

### 6.2 Régression n°2 — `test/tool/terminal-output.test.ts:160` (**l'omission de `C-11`**, `C-26`)

Boucle `terminal-output.test.ts:154-164`, test F1/F3 :

```ts
    for (const reference of [canary, link, large]) {
      for (const metadata of [{}, { outputPath: reference }]) {
        const raw = `public output\nFull output saved to: ${reference}`
        const result = yield* compactTerminalOutput({ … output: raw, metadata, … })
        expect(result.output).not.toContain("PRIVATE_CROSS_SESSION_CANARY")
        expect(result.output).not.toContain("LARGE_UNREAD_CANARY")
        expect(result.output).toContain("unverified; not opened")      // ← :160
```

Dans l'itération `metadata = {}`, la seule source de `references` est
`Truncate.savedOutputPath(input.output)`. Après suppression, `references` vaut `[]`,
`referenceText` (`terminal-output.ts:225`) vaut `""`, et `:160` tombe. **Régression confirmée** :
elle n'est pas conditionnelle, elle est structurelle — et le titre même du test (`:145`, « real
canary, symlink and 32 MiB references never supply compactor content ») exige que la référence
extraite **apparaisse** tout en ne fournissant aucun contenu.

Le remède de la version précédente (« ajouter `outputPath` au metadata du cas concerné ») est
**inacceptable** : il ferait passer la branche `{}` pour une branche `metadata` et supprimerait
exactement la couverture text→chemin que ce test existe pour ; le test verrait demain un harnais
qui n'extrait plus rien et le déclarerait conforme.

**Traitement** : la variante retenue (§4) **préserve également** ce test — `canary`, `link`
(`${canary}-symlink`) et `large` sont tous écrits par `store.write` (`:148-150`), donc tous sous
`TRUNCATION_DIR` ; les trois passent le filtre dans les **deux** itérations de la boucle, et `:160`
reste vrai. Aucune régression, et la couverture text→chemin est **préservée plutôt que
supprimée**.

### 6.3 Ce qui n'est pas une régression (vérifié, pour ne pas sur-corriger)

- `terminal-output.test.ts:135` (`upstreamOutputPaths` égale `[missing]`) et `:176` (égale
  `[expired]`) : dans les deux cas le metadata porte déjà `outputPath` — `run(fixtures.failure, {
  outputPath: missing })` en `:133`, `metadata: { outputPath: expired }` en `:173`. Ces assertions
  ne dépendent pas de la regex.
- `processor-effect.test.ts:817` (`toEqual([journal])`) : `:793` publie
  `metadata: { outputPath: journal, … }`, chemin réel produit par `store.write` en `:787`.
  Indépendant.
- `message-v2.test.ts:1570` : rejoue un `summary` **fourni en entrée** contenant
  `Full output saved to: /logs/raw` avec `{ terminalOutput: { version: 1, summary } }`, sans
  passer par `compactTerminalOutput` ; l'assertion `:1576` porte sur la conservation du résumé.
  Indépendant — mais à maintenir dans la commande (§7).

### 6.4 Coût en tokens / latence

**Nul.** Une comparaison de préfixe sur une chaîne déjà en mémoire, une fois par troncature, dans
une fonction déjà appelée (`truncate.ts:127`, `terminal-output.ts:145`). Aucun `stat`, aucune
lecture, aucune résolution disque (`path.resolve` est purement lexical). Zéro E/S ajoutée, zéro
token ajouté ni retiré : le texte produit est identique en production.

### 6.5 Sécurité

Le correctif **réduit** la surface (cibles hors `TRUNCATION_DIR` écartées) et n'en ajoute aucune.
Il n'y a ni injection, ni contournement de permission : le filtre ne consulte ni permission ni
existence, et les gardiens `read.ts:229-239` / `docs/terminal-output.md:26-28` restent inchangés et
suffisent à l'ouverture. **Résiduel assumé** : un identifiant de journal *deviné à l'intérieur* de
`TRUNCATION_DIR` reste accepté comme référence — ce résidu est déjà couvert par
`terminal-output.test.ts:145-166` et par les gardiens d'ouverture, et c'est la raison pour laquelle
§5.3 reste disponible en contingence.

## 7. Tests

**Méthode de mesure.** L'agent de mesure n'a pas produit de base : `glob wave4-baseline.md` sur
`%TEMP%/opencodev2` → « No files found ». Aucun chiffre n'est donc inventé ; la procédure est :

1. **Référence, sur le code inchangé** : `bun test test/tool/truncation.test.ts
   test/tool/terminal-output.test.ts` depuis `packages/opencode` → **33 pass / 0 fail**,
   `Ran 33 tests across 2 files` (`P16-verdict.md:32`, reproduit par le validateur). *Cette session
   n'a pas pu l'exécuter : aucun shell n'est autorisé (EPERM) ; ce chiffre est hérité du verdict,
   pas remesuré.*
2. **Après patch §4**, relancer **exactement** la même commande → `0 fail` et toujours 33 tests.
   Aucun fichier de test n'est modifié par la variante retenue : une variation de `N`
   signalerait un test perdu, pas un test devenu rouge.
3. **Pour établir le fait « deux régressions »** (§6.1 et §6.2), appliquer la variante §5.3 et
   relancer → **exactement deux échecs**, `terminal-output.test.ts:85` puis
   `terminal-output.test.ts:160`, dans cet ordre d'apparition. C'est ce protocole qui régénère la
   preuve et qui **distingue les deux** de la régression unique comptée par `C-11`.

**Test à écrire — variante retenue (§4).** Chemin exact sous `packages/opencode/test/` :
`test/tool/truncation.test.ts`, dans la suite de `Truncate`, sur le modèle de `:177-189`
(`svc.output(lines, { maxLines: 10 })`, `it.live`, `yield* Truncate.Service`) :

```ts
it.live("upstream references outside the truncation directory are never re-attached", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    const inside = yield* svc.write("y".repeat(2_000))
    const kept = yield* svc.output(`x\nFull output saved to: ${inside}\n${"z".repeat(2_000)}`, { maxBytes: 100 })
    if (!kept.truncated) throw new Error("expected truncation")
    expect(kept.content).toContain("unverified; not opened")            // branche légitime conservée
    const outside = path.join(Global.Path.home, ".ssh", "id_rsa")
    const dropped = yield* svc.output(`x\nFull output saved to: ${outside}\n${"z".repeat(2_000)}`, { maxBytes: 100 })
    if (!dropped.truncated) throw new Error("expected truncation")
    expect(dropped.content).not.toContain("unverified; not opened")     // branche forgée écartée
    expect(dropped.content).not.toContain(outside)
  }))
```

Deux assertions, deux comportements : la référence **dans** `TRUNCATION_DIR` reste affichée, la
référence **hors** `TRUNCATION_DIR` disparaît. C'est la preuve directe du correctif.

**Commande** (RC6, RC7 — les deux fichiers de session qui pinent le transport de la référence sont
inclus) :

```
cd packages/opencode
bun test test/tool/truncation.test.ts test/tool/terminal-output.test.ts test/session/processor-effect.test.ts test/session/message-v2.test.ts
```

**Critère de succès observable — variante retenue :**

- `0 fail` sur les quatre fichiers ;
- `terminal-output.test.ts` : `:85` **et** `:160` verts, boucle `:154-164` **inchangée** (la
  réécriture est la contingence §5.3) ;
- `truncation.test.ts` : `N >= 33` sur le couple des deux fichiers de test ;
- les deux assertions du nouveau test ci-dessus tiennent.

**Critère de succès observable — variante §5.3 (contingence) :**

- `0 fail` **et** `N >= 33` sur `truncation.test.ts` + `terminal-output.test.ts` ;
- la branche `{}` de la boucle `:154` est **réécrite** selon §5.3, avec `not.toContain(reference)`
  en `metadata = {}` et `toContain("unverified; not opened")` en `metadata = { outputPath }` — pas
  seulement « `0 fail` ».

## 8. Effort

**`XS`** pour la variante retenue : quatre lignes dans un seul fichier source
(`truncate.ts:29-31`), **aucun** fichier de test modifié, aucun changement de texte produit.

Correction de la version précédente (RC3) : elle annonçait `XS` en ne chiffrant que le patch.
L'estimation honnête **pour la variante suppression** est **`S`** — **trois** fichiers de test
(`terminal-output.test.ts:83-85`, `terminal-output.test.ts:154-164`, `truncation.test.ts:184`) plus
une **fonction documentée** supprimée (`docs/terminal-output.md:32`), ce qui contredit son propre §4
« ce qui reste volontairement inchangé ».

## 9. Verdict self-assessment

**`READY`** — pour la variante §4 (filtre de préfixe), qui est sans régression de test, sans
retrait de fonctionnalité et de coût nul.

`NEEDS_REVIEW` sur **un seul point**, à trancher par le validateur : **la variante §5.3
(suppression pure) est-elle exigée pour couvrir la forge d'un identifiant de journal *à
l'intérieur* de `TRUNCATION_DIR` ?** Si oui, il faut accepter trois fichiers de test modifiés, la
perte de `docs/terminal-output.md:32`, et appliquer §5.3 tel quel. Si non, §4 suffit et la sévérité
reste `low`.

Vérification de la citation du verdict sur ce point : le cinquième producteur de `outputPath`
existe bien — `packages/opencode/src/session/tools.ts:685`
(`...(truncated.truncated && { outputPath: truncated.outputPath }),`). La citation du verdict est
donc exacte, et le décompte « 5 producteurs » est **revérifié** ici par liste fermée
(`rg "outputPath:"` → 7 correspondances, §2.1). Correction consignée parce que la version
précédente de cette proposition affirmait à tort l'absence de ce fichier, sur la base d'une lecture
visée au mauvais répertoire. Aucun effet sur le correctif, qui ne touche aucun producteur.

Contrainte de cette révision : lecture seule (`read`), aucun shell ni `git` sur cette machine
(EPERM), aucun fichier sous `packages/**` modifié, aucun commit. Les chiffres de test sont donc
**hérités du verdict** (`P16-verdict.md:32`) et la méthode de mesure est donnée au §7 pour être
exécutée par l'agent d'implémentation.