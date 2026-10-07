# P10 — Estimation de contexte : ratio unique et seuil binaire

## 1. Problem

Le harnais convertit des caractères en tokens avec un diviseur unique de 4, y compris
pour du texte structuré dense où un caractère ne vaut pas quatre tokens, et il classe une
fenêtre « read-heavy » ou non par un booléen unique, ce qui triple d'un coup le budget de
verbatim ; une fenêtre à 23 000 tokens inspectés et une fenêtre à 18 000 reçoivent des
traitements opposés alors que le phénomène est continu.

## 2. Evidence

**Le diviseur unique et son unique site d'usage dans la classification read-heavy**
— `packages/opencode/src/session/overflow.ts:11` et `:52-64` :

```ts
const CHARS_PER_TOKEN = 4
```

```ts
function inspectionTokens(messages: MessageV2.WithParts[]) {
  let chars = 0
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    const message = messages[messageIndex]!
    if (message.info.role === "assistant" && message.info.summary) break
    if (message.parts.some((part) => part.type === "compaction")) break
    for (const part of message.parts) {
      if (part.type !== "tool" || !INSPECTION_TOOLS.has(part.tool) || part.state.status !== "completed") continue
      chars += part.state.output.length
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN)
}
```

`INSPECTION_TOOLS` inclut `inspect_batch` et `repo_overview`
(`packages/opencode/src/session/overflow.ts:12`), dont la sortie est du JSON structuré et
non de la prose.

**Le sort explicite de chaque constante auditée** — `packages/opencode/src/session/overflow.ts:7-11` :

```ts
const COMPACTION_BUFFER = 20_000
const DEFAULT_THRESHOLD = 0.95
const READ_HEAVY_FRACTION = 0.8
const READ_HEAVY_MIN_TOKENS = 20_000
const CHARS_PER_TOKEN = 4
```

`COMPACTION_BUFFER` (ligne 7, consommé par `overflow.ts:30` pour la réserve de `limits`) et
`DEFAULT_THRESHOLD` (ligne 8, consommé par `threshold()` lignes 21-25) n'ont aucun lien avec
le ratio : inchangés. `READ_HEAVY_FRACTION` (ligne 9) reste le plancher de l'arme anticipée.
`READ_HEAVY_MIN_TOKENS` (ligne 10) devient le **début** de la rampe. Seul `CHARS_PER_TOKEN`
(ligne 11) change de rôle : il ne disparaît pas, il cesse d'être unique.

Côté compaction — `packages/opencode/src/session/compaction.ts:44-48` :

```ts
const TOOL_OUTPUT_MAX_CHARS = 2_000
const PRUNE_PROTECTED_TOOLS = ["skill"]
const DEFAULT_TAIL_TURNS = 2
const MIN_PRESERVE_RECENT_TOKENS = 2_000
const MAX_PRESERVE_RECENT_TOKENS = 8_000
```

`TOOL_OUTPUT_MAX_CHARS` (ligne 44), `PRUNE_PROTECTED_TOOLS` (ligne 45) et
`DEFAULT_TAIL_TURNS` (ligne 46, consommé par `compaction.ts:422`) pilotent l'élagage et le
découpage de la queue : hors périmètre. `MIN_PRESERVE_RECENT_TOKENS` (ligne 47) reste le
plancher du budget. `MAX_PRESERVE_RECENT_TOKENS` (ligne 48) cesse d'être un plateau discret
pour devenir le **point de départ** de la rampe, et
`MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS` (`compaction.ts:54`) reste le plafond.

**Le seuil qui produit la discontinuité** — `packages/opencode/src/session/overflow.ts:76-78` :

```ts
export function isReadHeavy(messages: MessageV2.WithParts[], cfg: Config.Info) {
  return inspectionTokens(messages) >= (cfg.compaction?.read_heavy_min_tokens ?? READ_HEAVY_MIN_TOKENS)
}
```

**La décision que ce booléen commande** — `packages/opencode/src/session/compaction.ts:199-206` :

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

avec `MAX_PRESERVE_RECENT_TOKENS = 8_000` (`packages/opencode/src/session/compaction.ts:48`)
et `MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS = 24_000`
(`packages/opencode/src/session/compaction.ts:54`). Le passage de 19 999 à 20 000 tokens
inspectés fait donc sauter la borne `max` de 8 000 à 24 000 d'un seul coup ; la borne
`floor(usable * 0.25)` de la ligne 205 ne l'amortit que sur les gros modèles.

**Les blocs que le harnais s'injecte lui-même, et qui sont du XML dense** :
`<context_slots>` est poussé dans le prompt système à chaque tour
(`packages/opencode/src/session/prompt.ts:2438-2446`), `<goal_reminder>` à
`packages/opencode/src/session/prompt.ts:2452-2469`, et `<task-contract>` est construit à
`packages/opencode/src/session/compaction.ts:119-124`. Mesure de session fournie par
l'audit : ratio réel **≈ 2,8 caractères par token** sur ces blocs, et jusqu'à
**32 807 caractères** d'instructions réinjectés par tour.

**Vérifié, pas supposé** — le diviseur de `packages/opencode/src/util/token.ts:1` (aussi
`= 4`) a le même défaut apparent sur la sérialisation des messages, mais **aucun** appelant
ne voit le prompt système. Les deux seuls appels sont
`packages/opencode/src/session/compaction.ts:413` et `:498` (`part.state.output`). À la
ligne 413, `msgs` est produit par
`MessageV2.toModelMessagesEffect(input.messages, input.model, …)` (`compaction.ts:405`),
donc à partir des seuls messages de session `MessageV2.WithParts[]` ; les blocs injectés
sont ajoutés à `volatile` par un chemin d'assemblage distinct
(`packages/opencode/src/session/prompt.ts:2444`) et ne sont jamais stockés dans ces messages.
Conclusion : `packages/opencode/src/util/token.ts` est **hors périmètre**, son diviseur n'a
pas à être touché, et le test qui fige son rapport 4 c/t
(`test/session/compaction.test.ts:1862-1864`) reste vert sans modification (finding F2, clos).

**Le travail de calibrage du seuil est bon et doit survivre** —
`packages/opencode/src/session/overflow.ts:15-20` :

```ts
// Compacting is not free: it rewrites the whole prompt prefix, which throws away
// the provider cache, and it spends a summarisation call that reads the entire
// context. Roughly 2.50 $ at a 256k context, against ~0.06 $/turn saved by
// carrying a smaller one — it only pays back after ~40 turns. So compact late,
// just short of the usable window rather than well inside it. A lower value is
// only worth it when the provider cache is unavailable.
```

**Le ratio ne décide pas du pivot d'overflow** — `packages/opencode/src/session/overflow.ts:46-50` :
`tokenCount` renvoie `tokens.total || tokens.input + tokens.output + tokens.cache.read +
tokens.cache.write`. Quand le provider publie un total non nul, le diviseur n'entre pas dans
la décision de compacter ; il ne reste que les estimations locales, c'est-à-dire le signal
read-heavy et le dimensionnement de la queue. C'est ce périmètre, et lui seul, que la
proposition touche.

## 3. Mechanism

1. Le prompt est assemblé : `prompt.ts:2438-2446` ajoute la capsule `<context_slots>` à
   `volatile`, `prompt.ts:2452-2469` ajoute `<goal_reminder>`, et
   `compaction.ts:119-124` produit `<task-contract>`. Sur la session mesurée, ces blocs
   totalisent jusqu'à 32 807 caractères par tour.
2. Après une réponse, `processor.ts:769` et `prompt.ts:1984` appellent `isOverflow`.
3. `isOverflow` calcule `count = tokenCount(input.tokens)` (`overflow.ts:151`), c'est-à-dire
   le total provider : cette valeur est **exacte**. Le pivot de compaction n'est donc pas
   concerné par le ratio.
4. En parallèle, `isOverflow` calcule `inspected = inspectionTokens(input.messages)`
   (`overflow.ts:152`), qui passe par `Math.ceil(chars / 4)` (`overflow.ts:63`). Un texte
   dense est surestimé en tokens, jamais sous-estimé : le diviseur 4 est trop petit, donc
   `inspected` est trop faible.
5. Cet `inspected` entre deux fois dans le pivot lui-même, via `trigger`
   (`overflow.ts:95-122`) : sur un provider sans cache lu (`cacheAware` faux,
   `overflow.ts:89-91`), l'arme anticipée vaut `floor(proportional × 0,8)`
   (`overflow.ts:108`) et n'est activée que si le booléen est vrai (`overflow.ts:112`).
6. Il entre une troisième fois dans le budget de verbatim : `compaction.ts:424` appelle
   `isReadHeavy(input.messages, input.cfg)` et passe le booléen à `preserveRecentBudget`,
   qui choisit entre 8 000 et 24 000 (`compaction.ts:202-204`).

**Erreur chiffrée.** Soit `S` le nombre de caractères de la fenêtre, `f = 0,30` de texte
dense à 2,8 et le reste à 4 :

- tokens réels : `0,30·S/2,8 + 0,70·S/4 = 0,107143·S + 0,175·S = 0,282143·S`
- tokens estimés : `S/4 = 0,250000·S`
- sous-estimation : `(0,282143 − 0,250000) / 0,282143 = 0,1139`, soit **11,4 %** de la
  fenêtre.

Appliqué à la réinjection elle-même : `32 807 / 2,8 = 11 717` tokens réels contre
`32 807 / 4 = 8 202` estimés, soit **−3 515 tokens par tour (−30,0 % sur ce bloc)**.

**Effet sur le seuil binaire.** Comme le diviseur est aveugle au format, la position du
cliff en *caractères* se déplace avec lui : un seuil de 20 000 tokens supposé à 4 c/t se
situe en réalité à `20 000 × 2,8 = 56 000` caractères sur une sortie structurée, et non à
80 000. Deux discontinuités se compounding, l'une dans l'espace token et l'autre dans
l'espace caractère. Concrètement, avec le code actuel : 18 000 inspectés donnent un budget
de verbatim de 8 000, 23 000 inspectés donnent 24 000. Une variation de 28 % du volume
inspecté multiplie le budget par trois — et sur un modèle dont `usable × 0,25 < 24 000`,
le surplus est de toute façon abandonné à la ligne 205 : les deux lectures se paient donc
indépendamment de l'utilité du budget.

## 4. Proposal

Quatre changements, deux fichiers source, aucune nouvelle clé de configuration.

**a) Diviseur par forme de texte, dans `inspectionTokens`**
(`packages/opencode/src/session/overflow.ts`). Le diviseur 4 est conservé tel quel pour la
prose et le code ; un second diviseur est ajouté pour le texte structuré dense, détecté par
un reniflage des 64 premiers caractères — coût nul, la longueur étant déjà lue.

```ts
// Structured payloads (JSON tool output, injected XML capsules) measured ~2.8
// chars/token on a real session; prose and code measure ~4. One global ratio
// prices a 30%-dense window 11.4% low and moves the read-heavy cliff in char space.
const DENSE_CHARS_PER_TOKEN = 2.8
const DENSE_SNIFF_CHARS = 64

function isDense(text: string) {
  const head = text.slice(0, DENSE_SNIFF_CHARS)
  return head.startsWith("{") || head.startsWith("[") || head.includes("<task-contract") ||
    head.includes("<context_slots>") || head.includes("<goal_reminder")
}
```

et dans la boucle existante (`overflow.ts:58-61`), deux accumulateurs au lieu d'un seul :

```ts
      const output = part.state.output
      const len = output.length
      if (isDense(output)) dense += len
      else prose += len
// et à la place du retour de la ligne 63 :
  return Math.ceil(dense / DENSE_CHARS_PER_TOKEN + prose / CHARS_PER_TOKEN)
```

**b) Rampe proportionnelle au volume inspecté, en remplacement du booléen**
(`packages/opencode/src/session/overflow.ts`). `READ_HEAVY_MIN_TOKENS` reste le point de
départ de la rampe — il garde son sens (« à partir d'ici le volume d'inspection compte ») —
et la borne haute est atteinte à trois fois ce volume, ce qui rend la fonction continue par
construction :

```ts
// A 23k-token window and an 18k one must not differ by a 3x verbatim budget:
// the read-heavy budget is proportional to the volume actually read.
const READ_HEAVY_RAMP_SPAN = 2 * READ_HEAVY_MIN_TOKENS

export function readHeavyRamp(inspected: number, start = READ_HEAVY_MIN_TOKENS) {
  return Math.max(0, Math.min(1, (inspected - start) / READ_HEAVY_RAMP_SPAN))
}
```

`cfg.compaction?.read_heavy_min_tokens` reste lu par les deux appelants, donc la clé
existante garde exactement son effet : elle déplace le début de la rampe, elle ne le
supprime pas. Le booléen `readHeavy` est **conservé tel quel** dans l'objet retourné par
`trigger` (ligne 112) et dans le log de débogage (`overflow.ts:167`), parce qu'il est
observé ; `isReadHeavy` reste exporté avec sa signature actuelle (`overflow.ts:76`,
importé par `compaction.ts:21`).

**c) L'arme anticipée fond au lieu de basculer** (`overflow.ts:106-108`). À `ramp = 0`
l'arme vaut exactement `proportional`, donc `Math.min(proportional, absolute, proportional)`
(ligne 114) donne le même résultat que `arm = undefined` : **aucun changement de
comportement en bas de gamme** et aucune compaction anticipée nouvelle. À `ramp = 1` elle
vaut `proportional × 0,8`, la valeur actuelle :

```ts
  const ramp = readHeavyRamp(input.inspected ?? 0, input.cfg.compaction?.read_heavy_min_tokens)
  const early = input.cfg.compaction?.read_heavy_trigger ??
    (cached
      ? undefined
      : Math.floor(proportional * (READ_HEAVY_FRACTION + (1 - READ_HEAVY_FRACTION) * (1 - ramp))))
```

**d) Budget de verbatim continu** (`compaction.ts:199-206`). L'early return sur
`preserve_recent_tokens`, le plancher `MIN_PRESERVE_RECENT_TOKENS` et le plafond
`floor(usable * 0.25)` sont conservés à l'identique — le résumé garde la même place, c'est
une exigence de fonctionnement et pas un réglage :

```ts
function preserveRecentBudget(input: { cfg: Config.Info; model: Provider.Model; ramp: number }) {
  const configured = input.cfg.compaction?.preserve_recent_tokens
  if (configured !== undefined) return configured
  const ceiling = input.cfg.compaction?.read_heavy_preserve_recent_tokens ?? MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS
  const volume = MAX_PRESERVE_RECENT_TOKENS +
    (ceiling - MAX_PRESERVE_RECENT_TOKENS) * Math.max(0, Math.min(1, input.ramp))
  return Math.min(volume, Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable(input) * 0.25)))
}
```

L'appelant `compaction.ts:424` passe `readHeavyRamp(inspectionTokens(input.messages), …)`
au lieu du booléen. Pour ne pas exposer une fonction interne, `overflow.ts` expose une seule
fonction `inspectionProfile(messages, start)` qui retourne `{ tokens, ramp }` ; `isReadHeavy`
devient alors un cas particulier de cette fonction, ce qui supprime la possibilité que le
trigger et le budget divergent.

**Comportements après correctif**, lorsque `usable × 0,25` ne limite pas :

| tokens inspectés | budget aujourd'hui | budget après correctif |
|---|---|---|
| 18 000 | 8 000 | 8 000 |
| 20 000 | 24 000 | 8 000 |
| 23 000 | 24 000 | 9 200 |
| 30 000 | 24 000 | 14 000 |
| 60 000 et plus | 24 000 | 24 000 |

**Inchangé volontairement, et pourquoi :**

- `overflow.ts:15-20`, `threshold()` (lignes 21-25) et `DEFAULT_THRESHOLD = 0,95`. Le
  calibrage économique du pivot est juste et indépendant du sujet : il compare le coût d'une
  compaction au coût par tour, pas la forme du texte. Le modifier décalerait le pivot
  audité (159 967 → 161 715 tokens dans `test/session/overflow.test.ts:34-37`) sans
  résoudre le défaut. **Ce raisonnement est conservé tel quel, commentaire compris.**
- `tokenCount` (`overflow.ts:46-50`) et donc le pivot lui-même : le total provider est déjà
  la source de vérité, il n'y a rien à corriger et le ratio ne doit pas y entrer.
- `src/util/token.ts:1-5` : les deux appelants (`compaction.ts:413` et `:498`)
  dimensionnent la queue et l'élagage sur du texte sérialisé, pour lequel aucune mesure à
  2,8 n'existe. Y appliquer 2,8 sans mesure déplacerait le seuil de taille de la queue sur
  tout le corpus de sorties d'outils sans preuve. Constante dupliquée laissée en place : la
  factoriser maintenant élargirait le périmètre sans traiter le défaut (finding F2 clos : hors
  périmètre confirmé par `compaction.ts:405`).

## 5. Alternatives considered

**A5.1 — Remplacer le ratio par un vrai tokenizer (tiktoken ou gpt-tokenizer) sur la
chaîne sérialisée.** Rejeté : c'est la solution « juste » mais la plus risquée du lot. Elle
ajoute une dépendance native ou environ 1 Mo de tables à un chemin exécuté à chaque tour,
elle n'est correcte que pour le tokenizer d'un provider précis alors que le code sert tous
les providers, et elle ne corrige ni le cliff de `isReadHeavy` ni le facteur 3 du budget de
verbatim, qui sont deux défauts de **fonction**, pas de constante. Le défaut est dans le
modèle de décision, pas dans la conversion caractères/tokens.

**A5.2 — Recalibrer `isReadHeavy` sur le total provider déjà disponible.** C'est la piste
la plus grossière, et elle est partiellement fausse, ce qui doit être dit explicitement.
`tokenCount` (`overflow.ts:46-50`) est exact, mais il décrit la fenêtre **entière** ;
`isReadHeavy` a besoin d'un **sous-volume**, les octets d'inspection seulement. Diviser un
total exact par un sous-volume estimé réintroduit l'estimation au dénominateur : on déplace
l'erreur, on ne la supprime pas. Pire, le signal n'est pas disponible là où la décision se
prend — `isOverflow` ne calcule `inspected` que si `messages` est fourni
(`overflow.ts:152`), et le site d'appel principal ne le fournit pas (`processor.ts:769`
passe `{ cfg, tokens, model }`, sans `messages`). Une calibration sur le total verrait
`inspected = 0` à cet endroit exact et n'y armerait jamais rien. Ce que le total provider
rend correct, le pivot, l'est déjà par `tokenCount` : ce correctif est donc sans effet sur
le pivot. Rejeté comme signal, conservé comme invariant inchangé de l'axe du pivot.

**A5.3 — Supprimer la branche read-heavy** (plus d'arme anticipée, budget de verbatim fixe
à 24 000). Rejeté : cela détruit deux décisions délibérées et documentées, la protection peu
coûteuse contre la relecture des fichiers (`compaction.ts:49-53`) et l'arme conditionnée à
l'absence de cache (`overflow.ts:84-91`). Le cliff disparaît, mais au prix de la perte d'une
optimisation dont le raisonnement est sain.

**A5.4 — Exposer `chars_per_token` en configuration.** Rejeté : cela ajoute une molette à
un défaut qui est un mauvais modèle, pas une valeur manquante. L'opérateur ne peut pas savoir
qu'il faut 2,8 et non 4, la configuration devient le lieu où réapparaît le prochain cliff, et
`config.ts` gagne une clé que personne n'actionnera correctement. Cela déplace le problème
vers l'opérateur au lieu de le résoudre.

**A5.5 — Lisser `isReadHeavy` en laissant le choix à l'opérateur via
`read_heavy_preserve_recent_tokens`.** Rejeté : la clé existe déjà (`config.ts:328-330`) et
couvre le plafond, mais la discontinuité est dans la valeur par *défaut* de la branche, pas
dans son plafond. Configurer `read_heavy_preserve_recent_tokens` à 8 000 supprimerait la
branche read-heavy entière, donc aussi l'arme anticipée non cachée, qui est une optimisation
indépendante et valide. Le lissage doit être structurel, pas configurationnel.

## 6. Risks

**R6.1 — Régression sur les tests existants.** Deux suites sont directement touchées :

- `packages/opencode/src/session/overflow.test.ts` : ses six assertions (lignes 32, 36, 40,
  44, 48, 52) encodent le booléen et son seuil exact. `20 000` passe de read-heavy à non
  read-heavy, donc la ligne 32 casse. Le helper `chars` (lignes 25-26) doit être ajusté en
  conséquence ; les autres assertions restent valides, leur sortie étant du texte `x`
  répété, qui n'est pas dense.
- `packages/opencode/test/session/compaction.test.ts` : les tests qui fixent explicitement
  `preserve_recent_tokens` (lignes 1239, 1265, 1290, 1327, 1378, 1772, 1816) sont protégés
  par l'early return de `compaction.ts:201` et ne bougent pas. Le test qui configure
  `read_heavy_trigger: 90 000` et `read_heavy_min_tokens: 25 000` (lignes 533-534) est
  protégé par le court-circuit de `overflow.ts:107`. **Les 10 occurrences du fichier ont été
  classifiées une à une** : `533-534` par ce court-circuit, et `1239`, `1265`, `1290`,
  `1327`, `1378`, `1772`, `1816`, `1851` par l'early return de `compaction.ts:201`, car
  toutes fixent `preserve_recent_tokens`. Aucune ne casse (finding F1, clos). Le test
  `1862-1864` fige `Token.estimate("x".repeat(4000)) === 1000` et reste donc vert tel quel,
  ce qui confirme `packages/opencode/src/util/token.ts` hors périmètre.

**R6.2 — Modification des seuils d'arme anticipée.** À `inspected = 500 000`, valeur des
tests, la rampe vaut 1, donc `early = proportional × 0,8` et les valeurs des lignes 92, 94,
103 et 104 restent identiques. Le test de la ligne 113 (`inspected: 1_000`) ne verrait
non plus aucun changement : la rampe y vaut 0, l'arme vaut `proportional`, et
`Math.min(proportional, absolute, proportional)` est égal à `Math.min(proportional,
absolute)`. C'est un résultat voulu, mais il doit être vérifié et non supposé.

**R6.3 — Coût en tokens et en latence.** Aucun coût de tokens ajouté : aucune requête,
aucune dépendance, aucun appel réseau. Le surcoût CPU par tour est borné et constant : une
concaténation de 64 caractères par part d'outil inspecté, plus une division par part. À deux
divisions par part sur un chemin qui en compte déjà une, le surcoût est de l'ordre de la
microseconde et non mesurable à l'échelle du tour. La seule hausse possible est indirecte et
orientée dans le bon sens : moins d'armes anticipées mal calibrées et moins de budgets de
verbatim gaspillés, donc moins de relectures de fichiers, donc moins de tours.

**R6.4 — Risque de sécurité.** Aucun. Le correctif ne touche ni aux permissions, ni aux
requêtes, ni aux chemins de fichiers, et ne lit aucun contenu que le code ne lisait déjà.
Le reniflage `isDense` n'examine que des métadonnées de forme (`{`, `[`, trois noms de
balises XML) sur des chaînes déjà en mémoire ; il ne transporte rien, ne journalise rien, et
n'affecte aucune décision d'autorisation. Un attaquant qui nommerait `<goal_reminder>` en
tête d'une sortie d'outil influencerait seulement le ratio d'estimation de sa propre sortie,
au plus gagnant pour elle un budget de verbatim plus généreux — un gain borné par
`read_heavy_preserve_recent_tokens` et par le plafond `usable × 0,25` de la ligne 205, donc
sans effet sur les bornes de sécurité du système.

**R6.5 — Dérive de la valeur 2,8.** Une constante codée en dur issue d'une seule session
mesurée se périmera. Elle est isolée en un seul littéral nommé `DENSE_CHARS_PER_TOKEN`, dont
le commentaire porte la provenance, pour être recalibrée sans toucher à la logique.

## 7. Tests

**T7.1 — Rampe proportionnelle du budget de verbatim.**
Chemin : `packages/opencode/test/session/overflow.test.ts`, ajout dans le bloc
`describe("Overflow read-heavy trigger")` qui existe déjà à la ligne 74. Valeurs à
verrouiller avec `read_heavy_min_tokens: 20_000` : `readHeavyRamp(0) === 0`,
`readHeavyRamp(18_000) === 0`, `readHeavyRamp(20_000) === 0`,
`readHeavyRamp(30_000) === 0.25`, `readHeavyRamp(60_000) === 1`. Critère de succès
observable : les cinq valeurs sont exactes et aucune n'est `NaN`.

**T7.2 — Continuité du budget.** Même fichier, via `Compaction.select` : construire une
fenêtre dont la sortie d'inspection contient successivement 18 000 puis 23 000 puis 30 000
tokens de texte structuré, et vérifier que le budget de verbatim augmente strictement à
chaque palier. Critère de succès observable : budget(23 000) strictement supérieur à
budget(18 000) et strictement inférieur à budget(30 000), et budget(18 000) égal à 8 000
comme budget(20 000).

**T7.3 — Diviseur dense.** Étendre `packages/opencode/src/session/overflow.test.ts` avec un
helper `denseChars(n)` produisant `n` caractères de JSON. Vérifier que **deux sorties de
56 000 caractères sont classées différemment** : `isReadHeavy([inspection(denseChars(56_000))],
cfg())` vaut `true` (20 000 tokens au ratio dense) alors que
`isReadHeavy([inspection(chars(14_000))], cfg())` vaut `false` (14 000 tokens au ratio 4,
`chars(14_000)` produisant exactement 56 000 caractères). Critère de succès observable : les
deux appels retournent des valeurs différentes alors que la longueur est identique — c'est
la démonstration directe que le ratio unique est la cause.

**T7.4 — Non-régression du pivot.** Vérifier que les seuils de
`test/session/overflow.test.ts` lignes 70, 82, 92, 94, 103, 104 et 113 sont inchangés après
le correctif. C'est le test qui protège le travail de `overflow.ts:15-20`.

**Commandes exactes, depuis `C:\jeanluc\opencode-fork\packages\opencode` :**

```powershell
bun test test/session/overflow.test.ts
bun test src/session/overflow.test.ts
bun test test/session/compaction.test.ts
bun typecheck
```

**Critère de succès global :** les quatre commandes sortent en code 0, et le tableau de la
section 4 est reproduit par un test.

## 8. Effort

**M** — deux fichiers source, une fonction exportée nouvelle, un contrat d'appelant
modifié, et deux suites de tests à étendre, sans dépendance ni clé de configuration.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — deux points que le validateur doit trancher, tous deux dus au fait que le
2,8 est une **mesure de session fournie par l'audit sur des blocs XML injectés**, et non une
mesure de sorties d'outils.

1. **Portée du ratio dense.** `isDense` reconnaît à la fois les trois noms de blocs XML
   injectés et le JSON des sorties d'outils (`{`, `[`). La mesure à 2,8 ne couvre que les
   premiers. Le validateur doit-il accepter 2,8 pour le JSON de sortie d'outils
   (`inspect_batch`, `repo_overview`, tous deux dans `INSPECTION_TOOLS` de
   `overflow.ts:12`), au risque de rattacher une mesure à un texte non mesuré, ou faut-il
   restreindre `isDense` aux trois noms de blocs et laisser le JSON à 4 jusqu'à une mesure
   dédiée ? Le second choix rend le correctif strictement plus étroit et mieux prouvé.
2. **Portée de la rampe.** `READ_HEAVY_RAMP_SPAN = 2 × READ_HEAVY_MIN_TOKENS` place le
   budget plein à 60 000 tokens inspectés, soit trois fois le seuil actuel. C'est le paramètre
   libre du correctif : il devrait être confirmé par une courbe de coût de relecture mesurée,
   ou alors explicitement arbitré comme choix de politique assumé.

Le raisonnement économique de `overflow.ts:15-20`, le pivot fondé sur `tokenCount`
(`overflow.ts:46-50`) et la condition de cache de `overflow.ts:84-91` sont explicitement
conservés. Aucun fichier source n'a été modifié par cette proposition : le seul fichier écrit
est ce document.