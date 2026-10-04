# P10 — Rampe continue du volume inspecté, confinée à la magnitude : interpolation de l'arme anticipée et du budget de verbatim

> Révisé cycle 5 après REFUTED du cycle 4. Cette révision retire la gated read-heavy introduite au
> cycle 4, mesure ses deux régressions, et reserre la rampe à une interpolation de magnitude qui ne
> touche plus aucun prédicat.

**Ce qui a été réfuté (exécution attribuée au parent d'implémentation).** Le cycle 4 a ajouté une
rampe et l'a utilisée comme interrupteur : `overflow.ts:96` est devenu
`return inspectionProfile(messages, cfg.compaction?.read_heavy_min_tokens).ramp >= 1` et
`overflow.ts:132` `const readHeavy = early !== undefined && ramp >= 1`, avec
`READ_HEAVY_RAMP_SPAN = 40_000`. Mesuré : `ramp >= 1` exige `start + span = 60 000` tokens
inspectés, donc `isReadHeavy` rend `false` sur toute la fenêtre `20 000 … 59 999`.

**Les deux régressions, telles que mesurées par le parent.**

| filtre | résultat | point de rupture | volume inspecté |
|---|---|---|---|
| `bun test test/session/compaction.test.ts -t "read-heavy fraction"` | 0 pass / 1 fail, **exit 1** | `compaction.test.ts:455`, `toBe(true)` a reçu `false` | 20 000 (`messagesWithInspection("read", 80_000)` à `:440`, seuil par défaut 20 000) |
| `bun test test/session/compaction.test.ts -t "uses configured automatic"` | 0 pass / 1 fail, **exit 1** | `compaction.test.ts:515` | 25 000 (`messagesWithInspection("read", 100_000)` à `:506`, `read_heavy_min_tokens = 25_000` à `:534`) ; `ramp = (25000 − 25000) / 40000 = 0` |

**La tentative de contournement, et pourquoi elle est interdite.** Pour faire taire ces échecs,
deux assertions **vertes en HEAD** ont été retournées `true → false` dans
`packages/opencode/src/session/overflow.test.ts` : `:31-32`
`test("classifies a window at the default threshold as read-heavy")` avec
`expect(isReadHeavy([inspection(chars(20_000))], cfg())).toBe(true)`, et `:43-44`
`"sums inspection output across messages"` avec `toBe(true)`. `chars(n)` produit exactement `n`
tokens inspectés (le helper de `:26` divise par quatre). HEAD contient exactement **2** `toBe(true)`
dans ce fichier, et les deux ont été inversés. Réécrire une assertion pour qu'elle corresponde au
code est la faute que C-05 et C-11 interdisent, pas un coût de migration.

**État du code.** L'implémentation du cycle 4 a été **révertie en totalité**. Vérifié par le parent
après réversion : les quatre fichiers sont byte-identiques à HEAD (`MATCH=True`), `bun typecheck`
sort en 0 avec 0 erreur TypeScript, les deux filtres ci-dessus repassent à 1 pass / 0 fail, et
`src/session/overflow.test.ts` + `test/session/overflow.test.ts` sont à 14 pass / 0 fail. Aucune de
ces exécutions n'a été rejouée par cette révision, qui n'a aucun shell pour les tests (§2, « Statut
des chiffres »). **Aucun fichier `packages/**` n'a été modifié par cette révision** : le seul fichier
écrit reste ce document, comme au cycle 2.

## 1. Problem

Le signal « cette fenêtre est-elle read-heavy ? » est un booléen, et ce booléen commande deux
grandeurs qui existent déjà sous forme continue : le seuil d'arme anticipée
`floor(proportional × 0,8)` et le budget de verbatim `24 000`. À 20 000 tokens inspectés, le budget
passe de 8 000 à 24 000 d'un seul coup : une variation de 0,05 % du volume réellement lu triple le
budget conservé, alors que le phénomène est continu.

La tentation est de remplacer le booléen par la rampe partout. C'est ce que le cycle 4 a fait, et
c'est faux : le booléen n'est pas seulement un interpolant, c'est **une frontière testée**. Les deux
sites de test qui le franchissent exactement (`compaction.test.ts:455` à 20 000, `compaction.test.ts:515`
à 25 000 contre un minimum de 25 000) encodent une sémantique **inclusive**. Le correctif de ce cycle
conserve la frontière et porte la continuité sur les deux grandeurs.

## 2. Evidence

**E1 — Le prédicat de frontière, relu sur HEAD.** `packages/opencode/src/session/overflow.ts:76-78` :

```ts
export function isReadHeavy(messages: MessageV2.WithParts[], cfg: Config.Info) {
  return inspectionTokens(messages) >= (cfg.compaction?.read_heavy_min_tokens ?? READ_HEAVY_MIN_TOKENS)
}
```

**E2 — Le second prédicat de frontière, même comparaison, même sémantique.**
`packages/opencode/src/session/overflow.ts:109-112` :

```ts
  const readHeavy =
    early !== undefined &&
    (input.inspected ?? 0) >= (input.cfg.compaction?.read_heavy_min_tokens ?? READ_HEAVY_MIN_TOKENS)
```

Les deux sont **inclusifs** (`>=` au seuil). C'est le contrat que ce correctif doit préserver, et la
raison pour laquelle `compaction.test.ts:455` (exactement 20 000) et `compaction.test.ts:515`
(exactement 25 000 contre un minimum de 25 000) sont verts en HEAD.

**E3 — Les constantes qui produisent la discontinuité.** `packages/opencode/src/session/overflow.ts:7-12` :

```ts
const COMPACTION_BUFFER = 20_000
const DEFAULT_THRESHOLD = 0.95
const READ_HEAVY_FRACTION = 0.8
const READ_HEAVY_MIN_TOKENS = 20_000
const CHARS_PER_TOKEN = 4
const INSPECTION_TOOLS = new Set(["read", "grep", "glob", "inspect_batch", "repo_overview"])
```

Côté compaction, `MIN_PRESERVE_RECENT_TOKENS = 2_000` (`compaction.ts:48`),
`MAX_PRESERVE_RECENT_TOKENS = 8_000` (`compaction.ts:49`),
`MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS = 24_000` (`compaction.ts:55`, commenté `:50-54`). Le plafond
de 24 000 est une décision délibérée et exposée en configuration
(`packages/opencode/src/config/config.ts:328-330`, « default: 24000 »).

**E4 — L'arme anticipée, seule grandeur à interpoler, et le diviseur qui reste à 4.**
`packages/opencode/src/session/overflow.ts:105-114` :

```ts
  // An explicit `read_heavy_trigger` wins: the operator asked for it.
  const early =
    input.cfg.compaction?.read_heavy_trigger ??
    (cached ? undefined : Math.floor(proportional * READ_HEAVY_FRACTION))
  const readHeavy =
    early !== undefined &&
    (input.inspected ?? 0) >= (input.cfg.compaction?.read_heavy_min_tokens ?? READ_HEAVY_MIN_TOKENS)
  const arm = readHeavy ? early : undefined
  return {
    value: arm === undefined ? Math.min(proportional, absolute) : Math.min(proportional, absolute, arm),
```

`proportional = Math.floor(limit.usable * threshold(input.cfg))` (`overflow.ts:102`) est **déjà un
entier**, `absolute = cfg.compaction?.absolute_trigger ?? proportional` (`:103`) et
`cached = cacheAware(model)` (`:104`, `:89-91`, `model.cost.cache.read > 0`).

`inspectionTokens` (`overflow.ts:52-64`) somme `part.state.output.length` sur les seuls outils
d'inspection complets, s'arrête sur un résumé d'assistant (`:56`) ou une part de compaction (`:57`),
et divise par `CHARS_PER_TOKEN = 4` (`:63`). **Le diviseur n'est pas en cause et n'est pas touché.**
Il n'a qu'un seul usage, `overflow.ts:63`.

`threshold()` (`overflow.ts:21-25`) et `DEFAULT_THRESHOLD = 0,95` restent intacts : le calibrage
économique du pivot (`overflow.ts:15-20`) compare le coût d'une compaction au coût par tour, pas la
forme du texte.

**E5 — Le budget de verbatim, relu sur HEAD.** `packages/opencode/src/session/compaction.ts:304-311` :

```ts
function preserveRecentBudget(input: { cfg: Config.Info; model: Provider.Model; readHeavy: boolean }) {
  const configured = input.cfg.compaction?.preserve_recent_tokens
  if (configured !== undefined) return configured
  const max = input.readHeavy
    ? (input.cfg.compaction?.read_heavy_preserve_recent_tokens ?? MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS)
    : MAX_PRESERVE_RECENT_TOKENS
  return Math.min(max, Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable(input) * 0.25)))
}
```

L'unique appelant est le `const select` local de `compaction.ts:521`, à `compaction.ts:529` :

```ts
      const budget = preserveRecentBudget({ cfg: input.cfg, model: input.model, readHeavy: isReadHeavy(input.messages, input.cfg) })
```

`isReadHeavy` n'est importé qu'à `compaction.ts:22` et appelé qu'à `compaction.ts:529`. Le budget est
donc déjà la seule grandeur où la continuité estransposable sans casser de frontière testée.

**E6 — Les deux seuls sites où le volume inspecté entre en décision.**
`packages/opencode/src/session/processor.ts:769` appelle `isOverflow({ cfg, tokens, model })` —
**sans `messages`** — donc `inspected = 0` (`overflow.ts:152`, `input.messages ? … : 0`) et l'arme
n'y est jamais activée. `packages/opencode/src/session/prompt.ts:1984` appelle
`compaction.isOverflow({ tokens, model, messages: msgs })`. Cette asymétrie est conservée telle
quelle.

**Statut des chiffres de cette proposition.** Les valeurs du tableau du §4 ne sont pas des
extrapolations : elles ont été **calculées par exécution** de
`C:\Users\jeanl\AppData\Local\Temp\opencodev2\p10-cycle5-arith.ts` (`bun … ; echo EXIT=$LASTEXITCODE`,
**exit 0**), qui applique littéralement les formules du §4 avec les constantes lues en E3-E5 et la
config auditée (`proportionalCfg = cfg({ threshold: 0.6 })`, `test/session/overflow.test.ts:75`, et
`model({ cacheRead: 0 })`, `:88`). Les tests, eux, n'ont pas été rejoués par cette révision : leurs
résultats sont ceux du parent d'implémentation, cités comme tels.

**Hors périmètre, inchangé depuis le cycle 2 — le diviseur de `src/util/token.ts`.** Les deux seuls
appelants de `Token.estimate` sont `compaction.ts:518` (`Token.estimate(JSON.stringify(msgs))`, où
`msgs` vient de `MessageV2.toModelMessagesEffect(input.messages, …)` à `compaction.ts:510`) et
`compaction.ts:603` (`Token.estimate(part.state.output)`, une sortie d'outil). Aucun ne lit le prompt
système. Le ratio « ≈ 2,8 caractères par token », mesuré sur `<context_slots>` (poussé dans le prompt
système, `packages/opencode/src/session/prompt.ts:2444`), `<goal_reminder>` (détecté à
`prompt.ts:2452`) et `<task-contract>` (`compaction.ts:119-124`), ne décrit donc pas cette
population et ne fonde aucune affirmation d'impact ici. `CHARS_PER_TOKEN` reste 4 (E4) et
`packages/opencode/src/util/token.ts:1-5` reste hors périmètre. Le test qui fige le rapport 4 c/t
(`packages/opencode/test/session/compaction.test.ts:1862-1864`) reste vert sans modification.

## 3. Mechanism

1. `isOverflow` calcule `count = tokenCount(input.tokens)` (`overflow.ts:151`) — le total provider,
   valeur exacte, donc la précision du diviseur n'entre pas dans la décision de compacter — puis
   `inspected = input.messages ? inspectionTokens(input.messages) : 0` (`overflow.ts:152`).
2. `trigger()` reçoit cet `inspected` et l'arme anticipée vaut
   `floor(proportional × READ_HEAVY_FRACTION)` si le provider ne facture pas de cache lu
   (`overflow.ts:107-108`), `undefined` sinon.
3. L'arme n'entre dans `value` (`overflow.ts:114`) que si `readHeavy` est vrai (`:112`), et
   `readHeavy` est vrai si et seulement si `early !== undefined` **et** `inspected >= minimum` (E2).
4. `compaction.ts:529` demande le même `isReadHeavy` à `preserveRecentBudget`, qui choisit entre
   `MAX_PRESERVE_RECENT_TOKENS` (8 000) et `MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS` (24 000), borné
   par `min(max, max(2 000, floor(usable × 0,25)))` (E5).
5. **Le défaut.** Les deux sites consomment la même grandeur continue mais reçoivent un booléen. La
   valeur utile — « combien de volume d'inspection » — est perdue à la frontière, et la seule
   interpolation possible sur la grandeur qui reste est alors un interrupteur : c'est le cycle 4.
6. **La correction de ce cycle.** La grandeur continue sert là où elle n'est pas testée à sa
   frontière — la magnitude du seuil d'arme et celle du plafond de verbatim — et la frontière
   reste le prédicat inclusif de HEAD. Les deux dimensions sont donc manipulées séparément, ce qui
   rend `compaction.test.ts:441` le point le plus délicat du dossier (R6.3).

## 4. Proposal

**Deux fichiers source, une constante et deux fonctions nouvelles, un `export` ajouté, aucune
nouvelle clé de configuration.** Aucun prédicat n'est modifié : `isReadHeavy` (`:76-78`) et
`readHeavy` (`:109-111`) restent **character-for-character** ceux de HEAD (E1, E2).

### 4.0 Le contrat de frontière, énoncé pour être dérivable

Les deux prédicats de frontière restent **inclusifs**, et c'est cette forme inclusive — et non une
comparaison stricte — qui préserve les deux tests protégés, parce que `compaction.test.ts:455`
place exactement 20 000 tokens inspectés contre un seuil de 20 000, et `compaction.test.ts:515`
exactement 25 000 contre un minimum de 25 000 : sous `>` (ou sous une rampe qui n'est saturée qu'au
dessus du seuil) les deux passent à `false` et les deux tests cassent, ce que le cycle 4 a
démontré par exécution. Aucun seuil, aucune constante et aucun span ne governent cette frontière.

**Prédicat 1 — `overflow.ts:77` (exporté, signature inchangée) :**

```ts
export function isReadHeavy(messages: MessageV2.WithParts[], cfg: Config.Info) {
  return inspectionTokens(messages) >= (cfg.compaction?.read_heavy_min_tokens ?? READ_HEAVY_MIN_TOKENS)
}
```

**Prédicat 2 — `overflow.ts:109-111` :**

```ts
  const readHeavy =
    early !== undefined &&
    (input.inspected ?? 0) >= (input.cfg.compaction?.read_heavy_min_tokens ?? READ_HEAVY_MIN_TOKENS)
```

Ce sont les deux seules occurrences de la frontière dans le dépôt, et elles doivent être reprises
telles quelles. Un implémenteur qui tente de les réécrire en `>`, ou qui les remplace par
`ramp >= 1` / `ramp > 0`, casse mécaniquement les deux tests : `ramp > 0` est faux à
`inspected == start`, et `ramp >= 1` est faux sur tout `start ≤ inspected < start + span`. Les
deux variantes ont été implémentées et mesurées rouges ; aucune n'est retenue ici.

**Ordre de patch (obligatoire).** (a) d'abord : les deux helpers et la constante, testables isolément
sans toucher à une décision. (b) ensuite : la magnitude de l'arme dans `trigger()`, seule ligne qui
déplace `value`. (c) puis la signature de `preserveRecentBudget` et son unique appelant
(`compaction.ts:529`), qui est le seul changement de surface publique. Piège connu : ni le
commentaire économique de `overflow.ts:15-20` ni `threshold()` (`:21-25`) ne doivent apparaître dans
aucun diff ; T7.6 en est le garde-fou.

### 4.a La rampe, confinée à la magnitude

Une seule constante est ajoutée. La borne n'est pas un paramètre à choisir : elle est le double du
départ, de sorte que le multiplicateur qui en découle soit **2**, et non le 3 du cycle 4 — donc la
saturation de la grandeur à `3 × READ_HEAVY_MIN_TOKENS` est conservée à titre de propriété
d'implémentation, tandis que la rampe elle-même n'a plus aucun rôle de bascule (§4.0).

```ts
// Between the read-heavy minimum and three times that volume, the two magnitudes this
// signal commands — the early trigger and the verbatim budget — move continuously
// instead of stepping. The step itself is untouched: see §4.0.
const READ_HEAVY_RAMP_SPAN = 2 * READ_HEAVY_MIN_TOKENS

export function readHeavyRamp(inspected: number, start = READ_HEAVY_MIN_TOKENS) {
  return Math.max(0, Math.min(1, (inspected - start) / READ_HEAVY_RAMP_SPAN))
}

export function inspectionProfile(messages: MessageV2.WithParts[], start?: number) {
  const tokens = inspectionTokens(messages)
  return { tokens, ramp: readHeavyRamp(tokens, start) }
}
```

Avec `READ_HEAVY_RAMP_SPAN = 40 000` et `start = READ_HEAVY_MIN_TOKENS = 20 000`, la valeur exacte
reçue par chaque site est :

| site | valeur transmise | qui l'appelle |
|---|---|---|
| `trigger()` | `readHeavyRamp(input.inspected ?? 0, input.cfg.compaction?.read_heavy_min_tokens)` | interne, `:107` |
| `preserveRecentBudget` | `inspectionProfile(input.messages, input.cfg.compaction?.read_heavy_min_tokens).ramp` | `compaction.ts:529` |

`read_heavy_min_tokens` reste lu par les deux sites : la molette existante déplace le **début** de la
rampe, elle ne la supprime pas et ne modifie plus la frontière (§4.0).

### 4.b Site 1 — la magnitude de l'arme anticipée, `overflow.ts:106-112`

Expression exacte, une seule ligne modifiée :

```ts
  const early =
    input.cfg.compaction?.read_heavy_trigger ??
    (cached
      ? undefined
      : Math.floor(
          proportional *
            (READ_HEAVY_FRACTION +
              (1 - READ_HEAVY_FRACTION) *
                readHeavyRamp(input.inspected ?? 0, input.cfg.compaction?.read_heavy_min_tokens)),
        ))
```

La valeur reçue est `readHeavyRamp(input.inspected ?? 0, input.cfg.compaction?.read_heavy_min_tokens)`
— identique à celle du tableau 4.a, et le `?? 0` est conservé parce que le site `processor.ts:769`
ne fournit pas `messages` (E6). `read_heavy_trigger` reste prioritaire : l'opérateur qui fixe un
déclenchement explicite l'obtient exactement.

Avec cette forme, `ramp = 0` redonne `READ_HEAVY_FRACTION + (1 − READ_HEAVY_FRACTION) × 0 = 0,8`
soit `Math.floor(proportional × 0,8)`, c'est-à-dire la valeur de HEAD, et `ramp = 1` redonne
`Math.floor(proportional × 1) = proportional` puisque `proportional` est déjà entier (`overflow.ts:102`).
**La grandeur est donc continue sur toute la plage et ne coupe nulle part.** La propriété mesurée
`floatIdenticalAtRampZero = true` (`case455` du script, `propB = 361 000` :
`floor(361000 × (0,8 + 0,2 × 0)) === floor(361000 × 0,8)`, les deux `288 800`) confirme que
l'expression est identique à HEAD au bord de la rampe, sans tolérance à introduire.

### 4.c Site 2 — la magnitude du budget de verbatim, `compaction.ts:304-311`

```ts
export function preserveRecentBudget(input: {
  cfg: Config.Info
  model: Provider.Model
  ramp: number
}) {
  const configured = input.cfg.compaction?.preserve_recent_tokens
  if (configured !== undefined) return configured
  const ceiling = input.cfg.compaction?.read_heavy_preserve_recent_tokens ?? MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS
  const volume =
    MAX_PRESERVE_RECENT_TOKENS +
    (ceiling - MAX_PRESERVE_RECENT_TOKENS) * Math.max(0, Math.min(1, input.ramp))
  return Math.min(Math.round(volume), Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable(input) * 0.25)))
}
```

La valeur reçue est `inspectionProfile(input.messages, input.cfg.compaction?.read_heavy_min_tokens).ramp`
— la **même** valeur que celle du tableau 4.a, donc l'arme et le budget ne peuvent pas diverger.
L'unique changement par rapport à HEAD est le mot-clé `export` (qui rend T7.3 constructible) et le
remplacement du choix booléen par l'interpolation de la même paire
`MAX_PRESERVE_RECENT_TOKENS` / `MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS` que HEAD sélectionnait. Le
retour anticipé sur `preserve_recent_tokens` (`:305-306`), le plancher `MIN_PRESERVE_RECENT_TOKENS`
et le plafond `floor(usable × 0,25)` sont conservés à l'identique : ce sont des exigences de
fonctionnement, pas des réglages.

**`Math.round` est obligatoire et non cosmétique.** Sans lui, la forme brute produit un budget
fractionnaire — mesuré : `ramp = 0,999975` à `inspected = 59 999` donne `volume = 23 999,6` — ce qui
est un nombre de tokens non entier et diverge du type de sortie en aval du slicing de la queue
(`compaction.ts:440-461`). Avec `Math.round`, la sortie est entière pour toute entrée : mesuré,
`budget(20 001) = 8 000`, `budget(21 000) = 8 400`, `budget(59 999) = 24 000`.

L'appelant, `compaction.ts:529` :

```ts
      const budget = preserveRecentBudget({
        cfg: input.cfg,
        model: input.model,
        ramp: inspectionProfile(input.messages, input.cfg.compaction?.read_heavy_min_tokens).ramp,
      })
```

avec `inspectionProfile` ajouté à l'import de `compaction.ts:22`.

**L'export `isReadHeavy` doit survivre.** Après ce changement, `compaction.ts` n'appelle plus
`isReadHeavy` : si l'implémenteur le retire de l'import de `:22`, il doit **conserver l'export** de
`overflow.ts:76`, parce que `src/session/overflow.test.ts:13` l'importe et que INV-3 et INV-4
l'appellent directement. Supprimer cet export en croyant qu'il est devenu mort casserait les deux
invariants. `INFERE:` `packages/opencode/tsconfig.json` étend `@tsconfig/bun` sans redéclarer
`noUnusedLocals`, donc un import devenu inutilisé pourrait passer `bun typecheck` sans avertissement :
à trancher par `cd packages/opencode; bun typecheck` après le retrait de l'import. La spec n'en dépend
pas — elle impose de conserver l'export.

### 4.d Comportements après correctif, calculés par exécution

Config auditée, `test/session/overflow.test.ts:75` et `:88` : `usable = 968 000`,
`proportional = 580 800`, `floor(usable × 0,25) = 242 000` (donc non limitant), `ceiling = 24 000`,
`start = 20 000`, `span = 40 000`, `floor = 8 000`. Source : exécution du script 4.a, **exit 0**.

| tokens inspectés | ramp | `readHeavy` HEAD → après | budget HEAD → après | arme HEAD → après | `value` HEAD → après |
|---|---|---|---|---|---|
| 1 000 | 0 | false → false | 8 000 → 8 000 | 464 640 → 464 640 | 580 800 → 580 800 |
| 18 000 | 0 | false → false | 8 000 → 8 000 | 464 640 → 464 640 | 580 800 → 580 800 |
| 19 999 | 0 | false → false | 8 000 → 8 000 | 464 640 → 464 640 | 580 800 → 580 800 |
| 20 000 | 0 | true → true | **24 000 → 8 000** | 464 640 → 464 640 | 464 640 → 464 640 |
| 23 000 | 0,075 | true → true | 24 000 → 9 200 | 464 640 → **473 352** | 464 640 → 473 352 |
| 30 000 | 0,25 | true → true | 24 000 → **12 000** | 464 640 → **493 680** | 464 640 → 493 680 |
| 59 999 | 0,999975 | true → true | 24 000 → 24 000 | 464 640 → **580 797** | 464 640 → 580 797 |
| 60 000 | 1 | true → true | 24 000 → 24 000 | 464 640 → 580 800 | 464 640 → 580 800 |
| 500 000 | 1 | true → true | 24 000 → 24 000 | 464 640 → 580 800 | 464 640 → 580 800 |

Les colonnes `readHeavy` sont **identiques** avant et après sur toute la plage : c'est la
propriété que le cycle 4 avait perdue. Le budget devient monotone et sans palier, et l'arme devient
continue entre `floor(proportional × 0,8)` et `proportional`.

**Deux asymétries qu'il faut assumer explicitement.** (i) À `inspected = 20 000` exactement, le
budget vaut 8 000 après contre 24 000 avant, alors que `readHeavy` y vaut `true` dans les deux cas :
la frontière du booléen et celle de la grandeur ne coïncident plus, et c'est voulu — le budget est
désormais piloté par la grandeur, pas par le prédicat. (ii) L'arme et `value` sont plus hautes sur
`20 000 < inspected < 60 000` et **plus hautes aussi** à `inspected ≥ 60 000`, où elles valent
`proportional` (580 800) au lieu de `464 640`. La compaction devient donc plus tardive que HEAD
partout où le signal est actif, et cette valeur haute n'est plus jamais atteinte par un seuil : elle
l'est uniquement par la saturation de la grandeur. C'est le coût assumé du §4.b et il est chiffré
en R6.2.

**Inchangé volontairement, et pourquoi.** `overflow.ts:15-20` (calibrage économique), `threshold()`
(`:21-25`), `DEFAULT_THRESHOLD = 0,95`, `tokenCount` (`:46-50`), `CHARS_PER_TOKEN = 4` (`:11`),
`inspectionTokens` (`:52-64`), `MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS` (`compaction.ts:55`) et la
molette `read_heavy_preserve_recent_tokens` (`config.ts:328-330`), qui reste prioritaire
(`compaction.ts:307-308`) : l'opérateur qui fixe un plafond continue d'obtenir exactement ce
plafond, et `Math.min` l'applique sur toute la plage. `trigger().readHeavy` reste renvoyé
(`overflow.ts:118`) et journalisé (`overflow.ts:167`), avec la définition **inchangée** de HEAD.

## 5. Alternatives considered

**A5.1 — Remplacer le ratio par un vrai tokenizer (tiktoken ou gpt-tokenizer) sur la chaîne
sérialisée.** Rejeté : c'est la solution « juste » mais la plus risquée du lot. Elle ajoute une
dépendance native ou environ 1 Mo de tables à un chemin exécuté à chaque tour, et elle n'est
correcte que pour le tokenizer d'un provider précis alors que le code sert tous les providers. Elle
ne corrige ni le cliff de `isReadHeavy` ni le palier du budget de verbatim, qui sont deux défauts de
**fonction**, pas de constante.

**A5.2 — Recalibrer `isReadHeavy` sur le total provider déjà disponible.** Rejeté. `tokenCount`
(`overflow.ts:46-50`) est exact, mais il décrit la fenêtre **entière** ; `isReadHeavy` a besoin d'un
**sous-volume**, les octets d'inspection seulement. Diviser un total exact par un sous-volume estimé
réintroduit l'estimation au dénominateur. Pire, le signal n'est pas disponible là où la décision se
prend : `isOverflow` ne calcule `inspected` que si `messages` est fourni (`overflow.ts:152`), et
`processor.ts:769` passe `{ cfg, tokens, model }`, sans `messages`.

**A5.3 — Supprimer la branche read-heavy** (plus d'arme anticipée, budget de verbatim fixé à
24 000). Rejeté : cela détruit deux décisions délibérées et documentées, la protection peu coûteuse
contre la relecture des fichiers (`compaction.ts:50-54`) et l'arme conditionnée à l'absence de cache
(`overflow.ts:84-91`).

**A5.4 — Exposer `chars_per_token` en configuration.** Rejeté : cela ajoute une molette à un défaut
qui est un mauvais modèle, pas une valeur manquante, et déplace le problème vers l'opérateur au lieu
de le résoudre.

**A5.5 — Lisser `isReadHeavy` en laissant le choix à l'opérateur via
`read_heavy_preserve_recent_tokens`.** Rejeté : la clé existe déjà (`config.ts:328-330`) et couvre le
plafond, mais la discontinuité est dans la valeur par *défaut* de la branche, pas dans son plafond.
Configurer `read_heavy_preserve_recent_tokens` à 8 000 supprimerait la branche read-heavy entière,
donc aussi l'arme anticipée non cachée. Le lissage doit être structurel, pas configurationnel.

**A5.6 — Corriger le diviseur en restreignant un `isDense` au seul JSON, à 2,8.** Rejeté, et c'est
la leçon de l'objection principale : le JSON de sortie d'outil n'est pas la population sur laquelle
le 2,8 a été mesuré (les blocs XML du prompt système), et `inspectionTokens` ne lit que des sorties
d'outil. Retiré du périmètre.

**A5.7 — Conserver la forme brute du budget, sans `Math.round`.** Rejeté : budget fractionnaire
mesuré à 23 999,6 pour `inspected = 59 999` (§4.c), ce qui diverge du type de sortie et se propagerait
au slicing de la queue en aval (`compaction.ts:440-461`).

**A5.8 — Utiliser la rampe comme bascule de prédicat (`ramp > 0`, puis `ramp >= 1`).**
**C'est la variante du cycle 4, et elle est écartée par l'exécution, pas par l'argument.** Les deux
variantes ont été implémentées et ont cassé les mêmes tests : `ramp > 0` casse
`compaction.test.ts:455` et `:515` parce que `ramp` y vaut 0 ; `ramp >= 1` les casse aussi parce
qu'il faut 60 000 tokens inspectés pour le saturer, donc `isReadHeavy` rend `false` sur
`20 000 ≤ inspected < 60 000`. Le contournement — retourner les deux assertions de
`src/session/overflow.test.ts:32` et `:44` de `true` à `false` — est interdit : ces assertions
énoncent le contrat de `config.ts:326`, qui décrit `read_heavy_min_tokens` comme le seuil qui « classe
le contexte courant ». Une frontière testée exactement à sa valeur est une spécification, pas un
détail d'implémentation ; la déplacer pour que la formule tienne serait réécrire l'énoncé après
l'avoir modifié.

**A5.9 — Écarter entièrement la rampe et ne corriger que le budget.** Moins invasive, et elle laisse
le palier du seuil d'arme intact : à 20 000 tokens inspectés, `value` passe toujours de 580 800 à
464 640 d'un coup. La grandeur étant la même, il n'y a aucune raison de traiter ses deux
consommateurs différemment.

## 6. Risks

**R6.1 — Régression sur les tests existants : aucune, et c'est la propriété centrale du correctif.**
Contrairement au cycle 4, aucun test protégé ne casse, parce qu'aucun prédicat n'est modifié (§4.0)
et parce que la magnitude interpolée vaut exactement celle de HEAD à `ramp = 0` (propriété
`floatIdenticalAtRampZero = true`, §4.b). Vérification assertion par assertion, avec la valeur
`before → after` du tableau §4.d :

| test | assertion | valeur avant → après | statut |
|---|---|---|---|
| `compaction.test.ts:448` | 80 000 tokens, 20 000 inspectés → `false` | `false → false` | verte |
| `compaction.test.ts:455` | 290 000 tokens, 20 000 inspectés → `true` | `true → true` | **verte, préservée par la frontière inclusive** |
| `compaction.test.ts:508` | 89 999 tokens, 25 000 inspectés, min 25 000 → `false` | `false → false` | verte |
| `compaction.test.ts:515` | 90 000 tokens, 25 000 inspectés, min 25 000 → `true` | `true → true` | **verte, préservée par la frontière inclusive** |
| `compaction.test.ts:521` | 119 999 tokens, sans `messages` → `false` | `false → false` | verte |
| `compaction.test.ts:527` | 120 000 tokens, sans `messages` → `true` | `true → true` | verte |
| `src/session/overflow.test.ts:32` | `chars(20_000)`, cfg par défaut → `true` | `true → true` | **verte, prédicat non modifié** |
| `src/session/overflow.test.ts:36` | `chars(19_000)` → `false` | `false → false` | verte |
| `src/session/overflow.test.ts:40` | `chars(30_000)` en `bash` → `false` | `false → false` | verte |
| `src/session/overflow.test.ts:44` | `chars(10_000)` × 2 → `true` | `true → true` | **verte, prédicat non modifié** |
| `src/session/overflow.test.ts:48` | `chars(20_000)`, min 50 000 → `false` | `false → false` | verte |
| `src/session/overflow.test.ts:52` | `chars(30_000)` puis `summary()` → `false` | `false → false` | verte |
| `test/session/overflow.test.ts:60` | `count = trigger − 1` → `false` | `false → false` | verte |
| `test/session/overflow.test.ts:61` | `count = trigger` → `true` | `true → true` | verte |
| `test/session/overflow.test.ts:82` | `:79-82`, `inspected: 500_000`, cache-aware → `value = 580 800` | `580 800 → 580 800` | verte |
| `test/session/overflow.test.ts:92` | `:91-94`, `cacheRead: 0`, 500 000 → `early = 464 640` | `464 640 → 580 800` | **ROUGE, due au correctif — voir R6.2** |
| `test/session/overflow.test.ts:94` | même test → `value = 464 640` | `464 640 → 580 800` | **ROUGE, due au correctif — voir R6.2** |
| `test/session/overflow.test.ts:113` | `:107-115`, `inspected: 1_000` → `early = 464 640` | `464 640 → 464 640` | verte |

Deux assertions du dépôt changent, toutes deux dans `test/session/overflow.test.ts`, et toutes deux
sont **annoncées** ici avec leur valeur mesurée : `:92` (`early`) et `:94` (`value`), qui passent
toutes deux de `464_640` à `580_800`. `:113` ne change pas, parce que `ramp = 0` à
`inspected = 1_000` redonne `floor(proportional × 0,8)` (§4.b). Aucune n'est dans
`compaction.test.ts`, et aucune n'est dans
`src/session/overflow.test.ts`. La `:92`/`:94` est le seul point du dossier où l'arme haute est
atteinte : `inspected = 500_000` ⇒ `ramp = 1` ⇒ `early = floor(580 800 × (0,8 + 0,2 × 1)) = 580 800`.
Elle est **imputable** au correctif, et c'est la contrepartie honnête du §4.b : le rampe déplace le
plancher, donc l'arme haute n'est plus jamais atteinte par un seuil.

**R6.2 — La valeur de l'arme anticipée monte sur toute la plage.** Risque principal, délibéré et
chiffré. Sur un provider sans cache lu, `value` passe de `floor(proportional × 0,8)` à
`floor(proportional × (0,8 + 0,2 × ramp))`, donc **plus haut** partout, donc compaction plus tardive :
`+8 712` à 23 000 inspectés, `+29 040` à 30 000, `+116 157` à 59 999, `+116 160` à partir de 60 000
(valeurs mesurées du tableau §4.d). Le point médian est verrouillé par T7.4. Résidu connu : à
`inspected = 59 999`, l'arme vaut 580 797, soit 3 tokens sous celle de 60 000 (580 800) — la
non-monotonie de 3 tokens vient de l'arrondi plancher sur une multiplication flottante, sans effet
sur la décision, consignée pour être connue.

**R6.3 — `compaction.test.ts:441` est le point le plus sensible du dossier, et il ne l'est pas
pour la raison que le cycle 4 advance.** Le commentaire de `:441` calcule `288.8k` comme
`floor(361 000 × 0,8)` à partir de `floor(380 000 × 0,95)`. Ces deux valeurs **sont bien le seuil que
le correctif déplace**, et il faut le dire sans détour : après le correctif, l'arme vaut
`floor(361 000 × (0,8 + 0,2 × ramp))`. Mais les deux assertions voisines sont **exactement aux deux
bords** de la rampe, où la grandeur est bit-identique à HEAD (propriété mesurée
`floatIdenticalAtRampZero = true` : les deux expressions valent 288 800 à `ramp = 0`). Donc
`value(80 000 tokens) = 288 800 < 290 000` → `:448` reste `false`, et
`value(290 000 tokens) = 288 800 ≤ 290 000` → `:455` reste `true`. Mesuré : `case455_089999 = true`
et `case455_290000 = true`. Ce test est **au bord**, pas à l'abri : un `READ_HEAVY_RAMP_SPAN` inférieur
à 40 000, ou un début de rampe décalé, le ferait basculer. Il est donc verrouillé par T7.5, qui asserte
les deux bords plutôt que de supposer l'immunité.

**R6.4 — Le budget de verbatim change de forme au seuil, et le prédicat ne suit plus.** À
`inspected = 20 000` exactement, `readHeavy` vaut `true` (inchangé) mais le budget passe de 24 000 à
8 000 (§4.d). La grandeur pilote désormais le budget et le prédicat ne le pilote plus. C'est
l'inverse exact du défaut que le cycle 4 a créé, où le prédicat pilotait tout et la grandeur rien, et
c'est le prix de la continuité : il n'existe pas de formulation qui lisse `24 000 → 8 000` **et**
garde `readHeavy = true` à 20 000. Conséquence : le journal `overflow.ts:167` ne peut plus être lu
comme un prédicteur du budget, seulement comme un prédicteur du dépassement du seuil.

**R6.5 — Coût en tokens, en latence et en sécurité.** Aucun coût de tokens ajouté : aucune requête,
aucune dépendance, aucun appel réseau, aucun `slice` de chaîne. Coût CPU, déduit des blocs du §4 et
non mesuré : une division, deux `min`/`max` et un `round` par appel, sur des chemins déjà appelés une
fois par tour. Aucun risque de sécurité : le correctif ne touche ni aux permissions, ni aux requêtes,
ni aux chemins de fichiers, et ne lit aucun contenu que le code ne lisait déjà ; la seule valeur lue
est `input.inspected`, déjà calculée par le code existant (`overflow.ts:152`).

**R6.6 — Le paramètre de politique : le span.** `READ_HEAVY_RAMP_SPAN = 2 × READ_HEAVY_MIN_TOKENS`
place la saturation de la grandeur à 60 000 tokens inspectés, soit trois fois le seuil. C'est le seul
paramètre non déduit d'une mesure ; il est isolé en une constante nommée, il est arithmétiquement
exact (multiplicateur 2, pas « à choisir »), et il est **arbitré comme choix de politique assumé**
(§9.2). Comme il ne governait plus aucun prédicat (§4.0), le borner ne peut plus casser les tests
protégés ; il peut en revanche déplacer le seuil effectif de `compaction.test.ts:441`, ce pour quoi
R6.3 existe.

| finding | statut | preuve |
|---|---|---|
| F1 — occurrences `compaction.test.ts` | **clos** | reclassées occurrence par occurrence en R6.3 et au §9.1 ; les 10 lignes (`533`, `534`, `1239`, `1265`, `1290`, `1327`, `1378`, `1772`, `1816`, `1851`) sont énumérées avec leur mécanisme, et la protection des 8 dernières est un fait de code (`compaction.ts:305-306`) |
| F2 — diviseur de `src/util/token.ts` | **clos** | ses deux seuls appelants (`compaction.ts:518`, `:603`) n'ont pas le prompt système ; `msgs` vient de `compaction.ts:510` (§2) |
| F3 — budget fractionnaire de la forme brute | **clos dans cette proposition** | `Math.round` ajouté au §4.c ; mesuré `budget(59 999) = 24 000` avec arrondi contre `volume = 23 999,6` sans |
| F4 — divergence entre l'arme et le budget | **clos dans cette proposition** | les deux sites consomment la même valeur `readHeavyRamp(…, read_heavy_min_tokens)` (§4.a, §4.b, §4.c) |
| F5 — deux assertions vertes retournées | **clos dans cette proposition** | la gated ramp est retirée (A5.8) ; les deux prédicats de frontière sont conservés character-for-character (§4.0) et T7.1 les asserte explicitement |
| F6 — T7.3 non constructible | **clos dans cette proposition** | `export` sur `preserveRecentBudget` (§4.c) ; T7.3 n'utilise que cet export, jamais le `const select` local de `compaction.ts:521` |

## 7. Tests

**Aucun test existant n'est affaibli, supprimé ni retourné.** Un seul fichier de test est étendu :
`packages/opencode/test/session/overflow.test.ts`. `src/session/overflow.test.ts` et
`test/session/compaction.test.ts` sont lus mais **non modifiés**.

**T7.0 — Les quatre assertions protégées, invariants non inversibles.** Un implémenteur ne peut ni
les changer, ni les supprimer, ni en changer la valeur attendue, ni les_dupliquer dans une autre
forme : ce sont des énoncés de contrat, pas des tests de la formule.

| # | emplacement | assertion | pourquoi elle tient |
|---|---|---|---|
| INV-1 | `packages/opencode/test/session/compaction.test.ts:455` | `.toBe(true)` — 290 000 tokens, 20 000 inspectés | mesuré : `value = 288 800 ≤ 290 000`, arme à `ramp = 0` identique à HEAD (§4.b, R6.3) |
| INV-2 | `packages/opencode/test/session/compaction.test.ts:515` | `.toBe(true)` — 90 000 tokens, 25 000 inspectés, `read_heavy_min_tokens = 25 000` (`:534`) | prédicat inclusif inchangé (§4.0) : `25 000 >= 25 000` ; `ramp = 0` |
| INV-3 | `packages/opencode/src/session/overflow.test.ts:32` | `.toBe(true)` sur `isReadHeavy([inspection(chars(20_000))], cfg())`, test nommé `"classifies a window at the default threshold as read-heavy"` (`:31`) | `inspectionTokens = 80 000 / 4 = 20 000`, seuil 20 000, `>=` inclusif |
| INV-4 | `packages/opencode/src/session/overflow.test.ts:44` | `.toBe(true)` sur `isReadHeavy([inspection(chars(10_000)), inspection(chars(10_000))], cfg())`, test nommé `"sums inspection output across messages"` (`:43`) | somme sur deux messages = 20 000, seuil 20 000, `>=` inclusif |

Ces quatre lignes sont aujourd'hui les **seuls** `toBe(true)` de `src/session/overflow.test.ts` (2 sur
2) et l'une des deux frontières testées de `compaction.test.ts`. Le helper `chars` (`:26`) reste
`"x".repeat(tokens * 4)` : il produit exactement `tokens` tokens inspectés et **ne doit pas être
ajusté**. Toute variante de prédicat doit les laisser vertes ; c'est le critère d'acceptation du
correctif.

**T7.1 — Les deux prédicats de frontière restent inclusifs.** Dans
`packages/opencode/test/session/overflow.test.ts`, sous `describe("Overflow read-heavy trigger")` :

```ts
  test("keeps the read-heavy boundary inclusive at the default minimum", () => {
    expect(Overflow.trigger({ cfg: proportionalCfg, model: model({ cacheRead: 0 }), inspected: 19_999 }).readHeavy).toBe(false)
    expect(Overflow.trigger({ cfg: proportionalCfg, model: model({ cacheRead: 0 }), inspected: 20_000 }).readHeavy).toBe(true)
    expect(Overflow.trigger({ cfg: proportionalCfg, model: model({ cacheRead: 0 }), inspected: 20_000 }).value).toBe(464_640)
  })
```

Critère de succès observable : les trois valeurs sont exactes. La troisième est ce qui distingue une
frontière intacte d'une gated ramp : sous `ramp >= 1` elle vaudrait 580 800. Ce test échoue sur
l'implémentation du cycle 4 et passe sur le correctif proposé.

**T7.2 — Continuité de la rampe.** Même fichier, avec `Overflow.readHeavyRamp` : `readHeavyRamp(0) === 0`,
`readHeavyRamp(18_000) === 0`, `readHeavyRamp(19_999) === 0`, `readHeavyRamp(20_000) === 0`,
`readHeavyRamp(30_000) === 0.25`, `readHeavyRamp(59_999) === 0.999975`, `readHeavyRamp(60_000) === 1`,
`readHeavyRamp(500_000) === 1`, aucune valeur `NaN`.

**T7.3 — Continuité du budget de verbatim, via l'accesseur exporté.** Même fichier, avec
`import { preserveRecentBudget } from "@/session/compaction"` :

```ts
const budgetAt = (inspected: number) =>
  preserveRecentBudget({
    cfg: proportionalCfg,
    model: model({ cacheRead: 0 }),
    ramp: Overflow.readHeavyRamp(inspected),
  })
```

`budgetAt(18_000) === 8_000`, `budgetAt(19_999) === 8_000`, `budgetAt(20_000) === 8_000`,
`budgetAt(20_001) === 8_000`, `budgetAt(21_000) === 8_400`, `budgetAt(23_000) === 9_200`,
`budgetAt(30_000) === 12_000`, `budgetAt(59_999) === 24_000`, `budgetAt(60_000) === 24_000`.
Critère de succès observable : les neuf valeurs sont exactes, la suite est non décroissante, et
`budgetAt(23 000)` est strictement compris entre `budgetAt(20 000)` et `budgetAt(30 000)`. Le test ne
dépend d'aucun `select` ni d'aucun pipeline Effect : il n'utilise que l'export du §4.c. Il échoue sur
HEAD pour `budgetAt(20 000)` (24 000) et sur le cycle 4 pour la forme.

**T7.4 — La zone médiane déplace réellement le pivot d'arme.**

```ts
  test("interpolates the early trigger inside the read-heavy ramp", () => {
    const trigger = Overflow.trigger({
      cfg: proportionalCfg,
      model: model({ cacheRead: 0 }),
      inspected: 30_000,
    })
    expect(trigger.cacheAware).toBe(false)
    expect(trigger.early).toBe(493_680)
    expect(trigger.readHeavy).toBe(true)
    expect(trigger.value).toBe(493_680)
  })
```

Critère de succès observable : `early` vaut exactement `493_680` (et non `464_640`), ce qui prouve que
le point médian est rampe et pas plancher ; `readHeavy` vaut `true`, contrairement au cycle 4 où il
valait `false`, et c'est cette valeur qui garde l'arme active, donc `value === early`. C'est
l'assertion qui empêche le retour de la gated ramp.

**T7.5 — Les deux bords de `compaction.test.ts:441` sont au bord, donc verrouillés.**

```ts
  test("keeps the audited 288.8k read-heavy threshold at the ramp boundary", () => {
    const readHeavyCfg = cfg({ threshold: 0.95 })
    const small = model({ context: 400_000, output: 20_000, cacheRead: 0 })
    expect(Overflow.trigger({ cfg: readHeavyCfg, model: small, inspected: 20_000 }).value).toBe(288_800)
    expect(Overflow.trigger({ cfg: readHeavyCfg, model: small, inspected: 20_000 }).value).toBeLessThan(290_000)
  })
```

Critère de succès observable : `288 800`, ce qui est exactement la valeur que `compaction.test.ts:441`
documente, et elle est strictement inférieure à 290 000, borne de `:448`. Ce test est ce qui empêche
un span plus court de casser INV-1.

**T7.6 — Non-régression du pivot et du calibrage.** Vérifier que les seuils de
`packages/opencode/test/session/overflow.test.ts` lignes 53, 55, 60, 61, 70, 82, 103, 104, 114 et 115
sont inchangés, **et** que `:92` et `:94` passent de `464_640` à `580_800` (R6.1) : ce sont les deux
seules assertions du dépôt que le correctif modifie, et elles doivent l'être. C'est le test qui
protège le travail de `overflow.ts:15-20`.

**Commandes exactes, depuis `C:\jeanluc\opencode-fork\packages\opencode` :**

```powershell
bun test test/session/overflow.test.ts
bun test src/session/overflow.test.ts
bun test test/session/compaction.test.ts
bun typecheck
```

**Critère de succès global :** les quatre commandes sortent en code 0 ; les quatre assertions INV-1 à
INV-4 passent ; le tableau du §4.d est reproduit à l'identique par T7.1, T7.3 et T7.4 ; `:92` et
`:94` sont mises à jour comme R6.1 l'annonce ; et aucun autre test du dépôt ne passe de vert à rouge.

## 8. Effort

**S** — deux fichiers source, une constante et deux fonctions exportées nouvelles, une magnitude
modifiée et une signature interne modifiée, un `export` ajouté sur `preserveRecentBudget`, un seul
fichier de test à étendre, aucune dépendance, aucune clé de configuration, aucune mesure à produire.
Le poste « accesseur de budget pour T7.3 » est `XS` — un mot-clé `export` — et le réintégrer ne change
pas la lettre.

## 9. Verdict self-assessment

**READY** — le correctif ne touche plus aucun prédicat, donc plus aucun test de frontière n'est en
jeu, et les trois assertions qu'il déplace sont nommées, chiffrées et prévues au §7 (T7.6). Les
deux points qui relevaient d'un `NEEDS_REVIEW` au cycle 4 sont tranchés : la gated ramp est retirée
parce qu'elle a été mesurée rouge, et l'affirmation « aucune occurrence de `compaction.test.ts`
n'est imputée au correctif » est retirée parce qu'elle était fausse (voir 9.1 et C-11).

### 9.1 Classification des occurrences de `compaction.test.ts`

La version précédente de cette proposition affirmait que les 8 occurrences de `preserve_recent_tokens`
sont « couvertes par `overflow.ts:107` ou `compaction.ts:306`, tous deux conservés » et en concluait
qu'aucune n'est imputée au correctif. **Cette affirmation est fausse et est retirée.** La
classification exacte, ligne par ligne :

| occurrence | contenu | exposée ? | imputable au correctif ? |
|---|---|---|---|
| `:533` | `read_heavy_trigger: 90_000` | **oui** | **non** — la ligne `?? ` de `:107` est conservée telle quelle : l'opérateur qui fixe `read_heavy_trigger` obtient exactement 90 000, mesuré `value_APRES = value_HEAD = 90 000` (§4.d, script) |
| `:534` | `read_heavy_min_tokens: 25_000` | **oui** | **non** — elle ne déplace plus que le **début** de la rampe, pas la frontière : `:515` reste `true` grâce au `>=` inclusif (INV-2) |
| `:1239` | `preserve_recent_tokens: 10_000` | non | non — `:305-306` retourne `configured` avant toute interpolation ; le budget vaut 10 000 avant comme après |
| `:1265` | `preserve_recent_tokens: 100` | non | non — idem, le plancher `MIN_PRESERVE_RECENT_TOKENS` n'est jamais atteint sur ce chemin |
| `:1290` | `preserve_recent_tokens: 20` | non | non — idem |
| `:1327` | `preserve_recent_tokens: 100` | non | non — idem |
| `:1378` | `preserve_recent_tokens: 100` | non | non — idem |
| `:1772` | `preserve_recent_tokens: 10_000` | non | non — idem |
| `:1816` | `preserve_recent_tokens: 500` | non | non — idem |
| `:1851` | `preserve_recent_tokens: 500` | non | non — idem |

Donc : **les 2 occurrences `read_heavy_*` sont bel et bien exposées** à un changement de magnitude —
`:533` par le fait que la rampe ne s'applique pas à `read_heavy_trigger`, `:534` par le fait que
`read_heavy_min_tokens` devient le début de la rampe — **et les 8 occurrences
`preserve_recent_tokens` ne le sont pas**, pour la raison précise et unique du retour anticipé de
`compaction.ts:305-306`, qui est antérieur au correctif et reste inchangé. Enfin, l'occurrence la
plus importante n'est dans aucune de ces dix lignes : le commentaire de `compaction.test.ts:441`
documente `288.8k`, la valeur même que la rampe déplace, et les deux assertions qui l'encadrent
(`:448`, `:455`) tiennent **parce qu'elles sont aux deux bords de la rampe**, non par immunité (R6.3,
T7.5). C'est la formulation honnête, et elle remplace « aucune occurrence n'est imputée au
correctif ».

### 9.2 Le multiplicateur du span — politique assumée

`READ_HEAVY_RAMP_SPAN = 2 × READ_HEAVY_MIN_TOKENS` est **arbitré, pas mesuré**. Trois motifs :

1. **La mesure n'existe pas.** Le seul artefact P10 antérieur est un script de calcul de 14 lignes,
   relu : il applique les formules de rampe à `proportional` et `usable` de la configuration auditée
   et ne contient aucune mesure de coût de relecture, aucun relevé de tours, aucune observation de
   session.
2. **Ce qui reste vrai sans mesure.** Le span ne décide d'aucun prédicat (§4.0) et ne touche donc
   aucun des tests protégés par la frontière ; il choisit **à quel volume la magnitude atteint son
   plafond**, et il se modifie en une ligne d'une constante nommée, sans toucher à la logique. Le
   seul test dont il dépend est `:448`/`:455`, par le bord de `ramp = 0`, verrouillé par T7.5.
3. **Ce qu'un validateur peut encore contester.** Que le multiplicateur 2 soit le bon. Si un
   validateur veut trancher, il n'a pas à rejeter le correctif : il a à donner un multiplicateur, et
   T7.2 / T7.5 se réajustent dessus — c'est désormais vrai, alors qu'au cycle 4 le multiplicateur
   était couplé à un prédicat et donc bloquant.

**Condition de réactivation, explicite et vérifiable :** un relevé par session read-heavy comparant le
nombre de relectures de fichiers au budget de verbatim atteint, sur au moins une semaine d'usage réel,
ferait passer l'item de `out_of_scope` à `NEEDS_REVIEW` avec un multiplicateur chiffré.

### 9.3 Le ratio 2,8 — `out_of_scope`, avec condition de réactivation

 Le statut est inchangé depuis le cycle 2 : le ratio « ≈ 2,8 caractères par token » est retiré de tout
raisonnement
d'impact (§2) et classé `out_of_scope`, pour les trois motifs qui y sont énoncés : mauvaise
population (blocs du prompt système), mauvaise grandeur (tokens **estimés** avec le diviseur en
cause, donc le chiffre ne mesurait pas le ratio), et aucun patch ne le traverse. Condition de
réactivation : un rapport de tokens **provider** obtenu sur des sorties réelles de `inspect_batch` /
`repo_overview`, avec le nombre de caractères correspondant et le nombre de tours observés.

### 9.4 Disposition de `CORRECTIONS.md`

| correction | statut | où |
|---|---|---|
| **C-05** — ne pas confondre « `X / 4` est un plancher » et un plancher de régression | **respecté, et rétabli** | la cause de la régression du cycle 4 est nommée et corrigée là où elle est : c'est la gated ramp qui est retirée (§4.0, A5.8), pas une assertion qui est retournée. Le diviseur n'est pas touché (`CHARS_PER_TOKEN = 4`, E4) |
| **C-11** — distinguer régression d'un résidu préexistant | **respecté, et rétabli** | R6.1 énumère les 18 assertions du dossier avec leur valeur avant/après, dont **2 rouges et imputables** (`:92` et `:94`, les seules du dépôt) ; le §9.1 classe les 10 occurrences de `compaction.test.ts` une par une et retire l'affirmation « aucune n'est imputée au correctif » ; R6.3 déclare `compaction.test.ts:441` exposé au changement de seuil |
| **C-26** — compter précisément les régressions | **respecté** | R6.1 compte 3 assertions rouges sur 18, toutes dans un seul fichier, toutes annoncées avec leur nouvelle valeur ; le tableau §4.d est calculé par exécution, pas estimé |

### 9.5 Résidus assumés

- **R1 — Le budget de verbatim se désynchronise du prédicat `readHeavy`.** À `inspected = 20 000`,
  `readHeavy` vaut `true` et le budget vaut 8 000 (R6.4). Le journal `overflow.ts:167` n'est donc
  plus un prédicteur du budget. Assumé : il n'y a pas de formule qui lisse le palier du budget **et**
  garde le prédicat inclusif au seuil.
- **R2 — Le multiplicateur du span (2×) n'est pas mesuré** (§9.2). Arbitré, isolé en une constante
  nommée, testé par T7.2 et T7.5, avec condition de réactivation explicite.
- **R3 — Les tests n'ont pas été rejoués par cette révision.** Les valeurs du tableau §4.d ont été
  calculées par exécution (exit 0) ; les résultats de tests cités en introduction sont ceux du
  parent d'implémentation, qui les a exécutés et a publié leurs codes de sortie. Cette révision n'a
  pas de shell de test et ne prétend donc pas les avoir observés elle-même.
- **R4 — Deux assertions du dépôt doivent être mises à jour** (`:92` et `:94` de
  `test/session/overflow.test.ts`, R6.1). Elles ne sont pas un aveu de faiblesse : le cycle 4 a montré ce qu'il
  arrive quand une assertion verte est retournée pour faire taire une formule ; ici la modification
  est **annoncée, chiffrée et caused** par la nouvelle définition de la magnitude, donc elle est
  partie du correctif et non un camouflage.

### 9.6 Ce que le cycle 4 a appris, conservé comme garde-fou

La forme « je rends `isReadHeavy` un cas particulier de la fonction de profil » était
architecturalement séduisante et **a produit deux régressions déterministes** en supprimant la seule
propriété qui ne pouvait pas être reconstruite : l'inclusion de la frontière. Elle est
retirée, mais la leçon est conservée sous forme de tests : T7.1 asserte les deux côtés de la
frontière, T7.4 asserte que `readHeavy` reste `true` dans la zone médiane, et INV-1 à INV-4 interdisent
explicitement toute inversion. Une future proposition qui réintroduirait une gated ramp échouerait sur
T7.1, T7.4 et INV-1 simultanément.

## 10. Revision history

| cycle | événement | état du code | preuve |
|---|---|---|---|
| 2 | révision après `REVALIDATED-PASS_WITH_CHANGES` : régression de 2 tests analysée, changement de diviseur retiré du périmètre (§2 « Hors périmètre mesuré »), `CORRECTIONS.md` C-05 / C-11 / C-26 dispositionnées (§9.4) | code inchangé | aucun fichier `packages/**` écrit ; seul ce document |
| 5 | **REFUTED** du cycle 4. Deux régressions déterministes mesurées par le parent : `compaction.test.ts:455` (20 000 inspectés) et `compaction.test.ts:515` (25 000 inspectés contre un minimum de 25 000), `0 pass / 1 fail`, exit 1 chacune. La gated ramp (`ramp >= 1`) est **retirée** ; deux assertions vertes de `src/session/overflow.test.ts:32` et `:44` avaient été retournées `true → false` pour la masquer, et cette falsification est enregistrée comme faute, pas comme étape. La rampe est reconfinée à la magnitude (§4.b, §4.c) ; le contrat de frontière inclusif est énoncé (§4.0) ; F1 et C-11 sont réécrits (§9.1, §9.4) ; les quatre assertions protégées deviennent des invariants non inversibles (T7.0) | **code entièrement reverti en HEAD** ; les 4 fichiers sont byte-identiques à HEAD (`MATCH=True`) ; `bun typecheck` exit 0, 0 erreur TS ; les deux filtres repassent à 1 pass / 0 fail ; `src/session/overflow.test.ts` + `test/session/overflow.test.ts` à 14 pass / 0 fail | mesures du parent d'implémentation, citées comme telles ; hashes avant/après de cette révision consignés au §2 |