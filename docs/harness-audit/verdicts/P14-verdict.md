# Verdict de validation

## Proposal

`P14` — Aperçu d'une commande : la tête de la sortie disparaît sans marqueur
Fichier : `docs/harness-audit/proposals/P14-preview-tail-loss.md`

## Validator

`independent` — validateur n'ayant pas rédigé la proposition. Vérification par lecture
directe du code source (`packages/opencode/src/tool/shell.ts`, `src/tool/truncate.ts`,
`src/cli/cmd/tui/routes/session/index.tsx`, `src/session/tools.ts`,
`test/tool/shell.test.ts`), aucun fichier source modifié.

## Status

`PASS_WITH_CHANGES`

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok | `shell.ts:29`, `:235-238`, `:512`, `:614`, `:596`, `:617`, `:604-605`, `:240-242`, `:566`, `:570`, `:573-581`, `:608-610`, `:654`, `:658`, `truncate.ts:15-16` — tous concordent au caractère près avec le code relu |
| le correctif supprime vraiment la cause (aperçu sans tête) | ok | `shell.ts:237` `return "...\n\n" + text.slice(-MAX_METADATA_LENGTH)` → la proposition conserve `text.slice(0, head)` en plus, budget constant |
| le correctif rend `truncated` honnête (§4.3) | KO | `shell.ts:512` `last = preview(last + chunk)` tronque **en flux** ; la détection proposée `body !== (last \|\| output)` vaut `last !== last` → `false` dans le cas streamé. Voir objection 2 |
| le correctif ne casse pas un comportement existant | non-testé | aucun test existant n'assert la forme de `preview()` au-delà de 30 000 caractères ; `shell.test.ts:1172`/`:1188`/`:1219` portent sur la troncature lignes/octets, inchangée. Non exécuté par le validateur (aucune modification de source autorisée) |
| tests proposés sont exécutables dans ce dépôt | ok | `packages/opencode/package.json:10` `"test": "bun test --timeout 30000"` ; alias `@/tool/` déjà utilisé dans `test/tool/registry.test.ts:7` → l'import `{ preview }` depuis `@/tool/shell` du nouveau test est valide. Réserve sur la stabilité du test 7.2 (objection 3) |
| effort et coût annoncés réalistes | ok | arithmétique du coût vérifiée : `Math.floor(30_000 × 0.25) = 7 500`, `30 000 − 7 500 = 22 500`, somme = 30 000 exactement ; marqueur ≈ 90 caractères ≈ +23 tokens, delta net nul |
| sévérité annoncée justifiée | KO | `shell.ts:654` précède `shell.ts:658` et `shell.ts:297` envoie `metadata: {}` : aucune décision d'autorisation ne peut reposer sur l'aperçu. Voir objection 1 |

## Objections

### Objection 1 — la sévérité s'appuie sur une branche qui n'existe pas dans le code

La section 6 (lignes 314-320) affirme : « si le modèle ou l'approbateur ne voit pas la tête
d'une sortie de 200 000 caractères, il peut soit **approuver une commande dont il n'a pas vu
le préambule** (donnée perdue, action irréversible), soit relire le fichier complet ».
Les deux branches sont fausses :

```ts
// shell.ts:654 — l'autorisation précède l'exécution
                  yield* ask(ctx, scan)
// shell.ts:658
                return yield* run(
```

```ts
// shell.ts:293-298 — la demande ne porte aucun aperçu de sortie
  yield* ctx.ask({
    permission: ShellID.ToolID,
    patterns: Array.from(scan.patterns),
    always: Array.from(scan.always),
    metadata: {},
  })
```

Et le modèle ne lit pas `preview()` :

```ts
// shell.ts:620 puis session/tools.ts:691 — le texte vu par le modèle est `output`,
// dérivé de tail() (shell.ts:601), jamais de preview()
          output,
```

`preview()` n'alimente que `metadata.output` (`shell.ts:614`), rendu à l'opérateur dans le
TUI (`index.tsx:2467`). **La sévérité réelle est faible — un défaut de fidélité d'affichage
vive — et non une perte de données d'autorisation.** Ce n'est pas une critique de cosmétique :
la priorisation de l'audit repose sur cette phrase, et elle doit être réécrite.

### Objection 2 — §4.3 ne propage pas le signal dans le cas que la proposition désigne comme le plus fréquent

La troncature de `preview()` a lieu **pendant** le streaming :

```ts
// shell.ts:512
              last = preview(last + chunk)
```

La proposition propose ensuite :

```ts
const body = last || preview(output)
// metadata : { ..., truncated: cut, outputTruncated: body !== (last || output) }
```

Quand `last` est truthy (cas streamé, cf. `shell.ts:540-544` qui publie `output: last` à
chaque chunk), `body === last` : la comparaison donne `false` alors que `last` a bien été
amputé. Le signal est perdu exactement là où il compte. Faire retourner l'information par
`preview()` lui-même et propager ce booléen, au lieu de comparer des chaînes.

### Objection 3 — le test du drain (§7.2) attend une horloge, donc il sera instable

Le test proposé attend `Start-Sleep 5` face à une course de 200 ms :

```ts
// shell.ts:578-581
          yield* Effect.raceAll([
            Fiber.join(streamFiber).pipe(Effect.asVoid, Effect.ignore),
            Effect.sleep("200 millis"),
          ]).pipe(Effect.ignore)
```

`test/AGENTS.md` interdit explicitement l'attente par temps fixe au profit d'un signal
publié. Sans refonte, ce test sera un failure intermittent. À réécrire sur un signal
observable, ou à retirer de P14 (le correctif 4.2 reste valable).

### Objection 4 — §4.2 répare la visibilité du modèle, pas celle de l'opérateur

Le message de drain est ajouté à `meta`, qui n'atteint que `output` :

```ts
// shell.ts:608-610
      if (meta.length > 0) {
        output += "\n\n<shell_metadata>\n" + meta.join("\n") + "\n</shell_metadata>"
```

Or l'affichage TUI lit `metadata.output` (`index.tsx:2467`), pas `output`. L'opérateur qui
regarde la commande en cours n'aura donc **pas** le message ; seul le modèle l'aura. À
annoncer explicitement, sinon le correctif est présenté comme plus large qu'il ne l'est.

### Objection 5 — l'INFERE du rendu est infirmé, et les bornes de citations de tests sont imprécises

La section 2 (lignes 110-117) déclare le composant de rendu « probablement dans
`packages/app` ». Il est en réalité ici :

```tsx
// index.tsx:2462-2471
function Shell(props: ToolProps<typeof ShellTool>) {
  …
  const output = createMemo(() => stripAnsi(props.metadata.output?.trim() ?? ""))
  const maxLines = 10
  const collapsed = createMemo(() => collapseToolOutput(output(), maxLines, maxChars()))
```

Conséquence non tirée par la proposition : `maxLines = 10` plafonne l'affichage bien en-dessous
de 30 000 caractères, donc la perte de tête n'est visible qu'après expansion. Cela abaisse encore
la sévérité, et il faut remplacer l'INFERE par la citation.

Bornes de citations à corriger : `shell.test.ts:1161-1220` alors que le `describe` continue au
delà (`shell.test.ts:1222-1225` sont dans le bloc) ; `shell.test.ts:1134-1148` alors que le test
finit à `shell.test.ts:1158` et que l'assertion décrite est à `shell.test.ts:1155`
(`expect(updates.length).toBeGreaterThan(1)`).

### Objection 6 — le coût dominant n'est pas celui qui est chiffré

Le coût token du payload final est bien constant (objection sur le doublement : infirmée, voir
« challenges »). Mais `preview()` est recalculé et **republié à chaque chunk** :

```ts
// shell.ts:540-544
              return ctx.metadata({
                metadata: {
                  output: last,
```

Conserver tête et queue ne change pas ce volume de republication sur un flux long. Le chiffrage
annoncé est correct mais partiel : il faut soit le compléter, soit assumer explicitement que le
volume par chunk est inchangé.

## Required changes

1. Réécrire la section 6 (lignes 314-320) : supprimer la branche « approuver une commande dont il
   n'a pas vu le préambule » et la branche « le modèle ne voit pas la tête », citer
   `shell.ts:654` / `:658` / `:297` / `:620` / `:614` et `session/tools.ts:691`, et reclasser P14
   en priorité basse.
2. Corriger §4.3 (lignes 244-246) : remplacer `body !== (last || output)` par un retour structuré
   de `preview()` transmettant le booléen de troncature.
3. Rendre §7.2 exécutable de façon déterministe conformément à `test/AGENTS.md`, ou le retirer de
   P14.
4. Documenter dans §4.2 que le message de drain atteint `output` (donc le modèle) et non
   `metadata.output` (donc pas l'affichage TUI).
5. Remplacer l'INFERE des lignes 110-117 par la citation `index.tsx:2462-2471`, et en tirer la
   conséquence sur `maxLines = 10`. Corriger les deux bornes de citations de tests.
6. Compléter le chiffrage du coût par la republication par chunk (`shell.ts:512` + `:540-544`).

## Implementation guidance

Ordre des patches : (1) `preview()` + `export` + `cutStart` et le test unitaire
`packages/opencode/test/tool/shell-preview.test.ts` (import `{ preview }` from `@/tool/shell`,
alias déjà en usage) ; (2) §4.2 `drained` ; (3) §4.3, seulement après la correction de l'API de
`preview()` de l'étape 1. Piège connu : n'appliquer `cutStart` qu'à la coupe de tête —
`text.slice(-tail)` inclut jusqu'à la fin de la chaîne et ne peut donc pas séparer une paire de
surrogates ; ne pas toucher `tail()` (`shell.ts:240-270`) ni `truncate.ts`. Tests à exécuter :
`bun test --timeout 30000 test/tool/shell-preview.test.ts test/tool/shell.test.ts` avec
`workdir = C:\jeanluc\opencode-fork\packages\opencode`.

## Challenges du commanditaire — réponses

**Seuil 30 000 atteignable ?** Oui, dans une fenêtre étroite, mais il ne s'agit pas de code
mort. `last` n'est borné par aucun `MAX_LINES`/`MAX_BYTES` pendant le streaming — seule `list`
l'est (`shell.ts:505-510`) — et le basculement vers un fichier survient à `limits.maxBytes`
(`shell.ts:518`, soit 51 200). Une sortie ASCII entre 30 000 et 51 200 caractères est donc
tronquée par `preview()` en flux alors que `tail()` renvoie `cut: false`
(`shell.ts:242`), donc `truncated: false` (`shell.ts:617`) et aucun bandeau (`shell.ts:604`).
Avec des sorties typiques à 1 511 caractères, le chemin est **rare, pas mort** : c'est un
défaut de basse fréquence, ce qui justifie la priorité basse de l'objection 1.

**Tête + queue double-t-il la taille ?** Non. Budget constant vérifié : 7 500 + 22 500 = 30 000,
marqueur ≈ 90 caractères ≈ +23 tokens, delta net nul. Le chiffrage de la proposition est exact.

**Drain 200 ms coupé sans signal ?** Correctement traité et non noyé : mechanism §3 étape 7,
correctif §4.2, report explicite à P17/F-L3 en §4.4, test dédié §7.2. Seule réserve : la
stabilité du test (objection 3) et la visibilité réelle du message (objection 4).