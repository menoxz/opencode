# Revalidation P18 — `REVALIDATED-PASS_WITH_CHANGES`

## Proposal

`P18` — le refus EPERM au spawn du shell : budget doublé et message d'erreur non actionnable.

Chemin : `docs/harness-audit/proposals/P18-eperm-spawn.md` (version révisée, 605 lignes).

Validateur indépendant de la vague 4. Lecture seule : aucun shell, aucune commande `git`,
aucun fichier écrit sous `packages/**`. Seul fichier produit : celui-ci.

**Méthode anti-C-21.** Le marqueur de révision (`> Révisé après verdict … Corrections
appliquées : 4/4`, `proposal:3`) est explicitement écarté comme preuve, conformément à
`CORRECTIONS.md:31` (deux agents écrivant le même fichier rendent ce marqueur non fiable).
Les quatre corrections ont donc été re-dérivées depuis les sources, sans jamais l'accepter
comme prémisse. Le verdict de cette revalidation ne repose sur aucune affirmation de la
révision qui n'ait été reconfirmée par une citation de code.

**Note de méthode.** La méthode imposée (jamais grep, jamais shell) empêche la
comptabilisation exhaustive des occurrences de `retryTransientLaunch`. Chaque
correspondance ci-dessous est vérifiée par lecture de la plage citée ; la prétention
« exhaustive » du tableau §4.5 est traitée en conséquence (`COR-R18-4`).

## Revisions applied

### RC1 — réécriture de `shell-launch-retry.test.ts` — TRAITÉE

Le verdict exigeait : remplacer `toBeGreaterThanOrEqual(LAUNCH_BUDGET)` par
`starts.count === 1`, ajouter l'assertion `No process was created`, **ne pas supprimer le
fichier**.

Le fichier existe et n'a pas été supprimé — `packages/opencode/test/tool/shell-launch-retry.test.ts`,
**106 lignes**. Les quatre sites cités par la révision sont verbatim :

- `:19` — `// one start plus the four retries the shared policy allows`
- `:20` — `const LAUNCH_BUDGET = 5`
- `:63-64` — `starts.count += 1` puis
  `return starts.count < LAUNCH_BUDGET ? Effect.fail(refused(command)) : Effect.fail(permanent(command))`
- `:103` — `expect(starts.count).toBeGreaterThanOrEqual(LAUNCH_BUDGET)`

Le court-circuit est confirmé : `:54-68` construit `ChildProcessSpawner.of({ ...real, spawn })`
via `Layer.effect(ChildProcessSpawner, …)` **au-dessus** du chokepoint, donc le retry interne
de `cross-spawn-spawner.ts:284-298` ne s'exécute pas et `starts.count` ne compte que la
politique externe. `:68` (`Layer.provide(CrossSpawnSpawner.defaultLayer)`) confirme que le
vrai spawner est fourni **en dessous** de la substitution — la substitution gagne.

**Arithmétique reconfirmée** contre `launch-retry.ts:52` (`times: LAUNCH_RETRY_ATTEMPTS - 1`,
soit 7) et `:42` (`LAUNCH_RETRY_ATTEMPTS = 8`) : 8 appels à `spawner.spawn`. Appels 1–4 →
`refused` (1..4 < 5), appels 5–8 → `permanent`. `:103` évalue donc `8 >= 5` → **vert
aujourd'hui**. Après retrait du retry externe : 1 appel, `1 < 5` → `refused`, donc
`1 >= 5` → **échec**. C-15 est arithmétiquement confirmé, pas seulement plausible.

Prescription : `proposal:527-543` (Test 1) remplace `:103` par `expect(starts.count).toBe(1)`
et exige l'assertion `No process was created` sur `exit` ; `:534-536` impose de supprimer
`permanent` (`:38-48`), `LAUNCH_BUDGET` (`:20`) et le commentaire `:19` — « les laisseraient
créer une déclaration morte et un commentaire faux ». `proposal:474-475` rappelle que le
fichier « ne doit pas être supprimé ». Diagnostic du mécanisme documenté en
`proposal:170-194` (§2.8), là où la version initiale l'avait manqué.

**Traité conformément, avec une exigence supplémentaire du verdict respectée** (suppression
des artefacts du budget mort, que le verdict n'avait pas demandés).

### RC2 — errno dérivé de `cause`, suffixe conditionné, `EPERM` figé banni — TRAITÉE

`proposal:258-264` — `errnoOf` parcourt `cause`, `reason`, `stderr` avec garde de cycle
(`seen`), et lit `f.code` à chaque niveau. `proposal:266-269` — `tagOf` lit `reason._tag`.
`proposal:283-284` — `const detail = error instanceof Error ? error.message : String(error)`
puis `const suffix = detail.trim() ? ` Underlying error: ${detail}` : ""`. Le suffixe est donc
**conditionné à un `detail` non vide**, ce qui ferme le second défaut relevé au verdict
(chaîne terminant par `Underlying error:` suivi de rien).

**Le `EPERM` figé est banni.** La chaîne produite (`proposal:285-288`) n'interpole que
`${errno}`, `${attempts}`, `${executable}`, `${detail}` : aucune occurrence littérale de
`EPERM` dans le message. La construction du levier (`proposal:277-282`) bifurque sur
`tag === "Busy"` → attendre, `tag === "PermissionDenied"` → droits d'exécution, sinon
formulation neutre. C'est la réponse structurelle à C-16 : les six classes franchissant
`launch-retry.ts:8` ne reçoivent plus un diagnostic figé, mais un diagnostic **dérivé de la
cause**. `proposal:423-463` (§5.5) consigne explicitement le rejet du code du verdict, avec
les deux fixtures qui le réfutent (voir la section de désaccord).

### RC3 — `launchRefused` ajouté au bloc `export` de `process.ts:88-95` — TRAITÉE (comme delta)

Le bloc réel est verbatim `packages/core/src/process.ts:88-95` :

```ts
export {
  isTransientLaunchFailure,
  LAUNCH_RETRY_ATTEMPTS,
  LAUNCH_RETRY_DELAYS_MS,
  launchRetryDelayMs,
  retryTransientLaunch,
  retryTransientLaunchSync,
} from "./launch-retry"
```

Six noms, `launchRefused` absent — l'objection du verdict est exacte. La révision ne répète
pas l'erreur : `proposal:299-311` **recopie le bloc réel** (preuve directe contre sa propre
version antérieure) et `proposal:313-318` retire la mention « déjà ré-exportés » au profit de
« **à ajouter à ce bloc dans le même patch** que §4.3, sans quoi le patch ne compile pas
(symbole non exporté) ». La formulation exigée par le verdict est donc littéralement appliquée.

Ancre d'insertion également vérifiée : `proposal:249` impose d'ajouter la fonction
« **avant** `export type { PlatformError }` (`:77`) » — et `launch-retry.ts:77` est bien
`export type { PlatformError }`, dernière ligne du fichier. L'ancre est juste.

### RC4 — §2.5 reformulé en « bornée », 387 déclaré non reproductible — TRAITÉE

- `proposal:95-99` — titre du §2.5 : « **Formulation bornée — la transience n'est pas établie,
  elle est bornée.** » et abandon explicite : « Cette affirmation est **abandonnée** : elle
  repose sur deux observations auto-rapportées, sans artefact ».
- `proposal:99` — l'incompatibilité avec la mesure de §2.7 est nommée (zéro corroboration
  logarithmique sur `pwsh`).
- `proposal:101-103` — l'argument inversible est conservé (un `EPERM` d'antivirus ou d'ACL est
  permanent et produirait le même volume).
- `proposal:105-108` — le risque est énoncé **borné** : « le coût tombe de ~57 s à 6 350 ms
  par appel … le message nomme le levier droits — le bon levier pour un `EPERM` permanent ».
- `proposal:110-114` — la mesure manquante exigée par le verdict est nommée avec une méthode
  exécutable sans toucher `packages/**` (wrapper de `launch` dans un harness, agrégation
  24 h, rapport `refus(pwsh)/lancement(pwsh)`).
- `proposal:159-160` — « **Le chiffre « 387 » du mandat reste donc non reproductible, et il
  est écarté de l'argumentaire.** Le raisonnement de §4 et §5 ne repose que sur la duplication
  mécanique démontrée en §3. »

Le point 4 du verdict (exigence de rigueur documentaire) est satisfait. Le chiffre 387 est
**retiré de l'argumentaire** plutôt que réutilisé — c'est exactement ce qui était demandé.

## Status

`REVALIDATED-PASS_WITH_CHANGES`

Les quatre `Required changes` du verdict de la vague 2 sont traités, chacun avec une citation
de code qui prouve le traitement. **Aucune des quatre objections n'est seulement satisfaite par
une reformulation cosmétique** : RC1 change une assertion et supprime trois artefacts morts,
RC2 change la fonction de production du message, RC3 rectifie une affirmation fausse sur le
propre patch, RC4 abandonne une thèse au lieu de l'atténuer.

Le désaccord ouvert de la vague 2 (`cross-spawn-spawner.ts:86-93`) est tranché **contre** le
code de l'Objection 2 du validateur — voir la section dédiée ci-dessous.

`REVALIDATED-PASS` est refusée : trois défauts résiduels sont réels, dont un défaut de sûreté
de type sur le cœur du correctif (`COR-R18-3`) et une dépendance à une annotation de ligne
mutante (`COR-R18-2`). Aucun n'est bloquant pour le merge du correctif shell ; tous sont
bloquants pour un `REVALIDATED-PASS`.

`REVALIDATED-FAIL` est refusée : le diagnostic central est confirmé bout en bout par le code,
et le correctif est applicable sans reprise d'architecture.

## Remaining objections

### Le désaccord explicite : `cross-spawn-spawner.ts:86-93` — **l'agent de révision a raison**

Il s'agit d'un désaccord affirmatif de la révision contre le code de l'Objection 2 du verdict.
Il est tranché sur source, sans avoir accepté la parole d'aucune des deux parties.

**Ce que dit la source** — `packages/core/src/cross-spawn-spawner.ts:86-93`, verbatim :

```ts
  return PlatformError.systemError({
    _tag: toTag(err),
    module: "ChildProcess",
    method,
    pathOrDescriptor: cmd,
    syscall: err.syscall,
    cause: err,
  })
```

Six champs : `_tag`, `module`, `method`, `pathOrDescriptor`, `syscall`, `cause`. **Aucun champ
`code`.** Le `code` de l'errno est porté par `cause` — c'est-à-dire par `err`, le
`NodeJS.ErrnoException` que `toPlatformError` reçoit en `:80`. Donc le cast du verdict

```ts
const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined
```

renvoie `undefined` sur un refus réel : `error.code` n'est jamais défini sur l'enveloppe.
**La contradiction est établie.** La révision a raison ; le code de l'Objection 2 est
mécaniquement faux.

**Trois corroborations indépendantes, toutes dans le dépôt :**

1. `packages/core/test/process/spawner-launch-retry.test.ts:15-16` — la fixture place le
   `code` sur la cause, jamais sur l'enveloppe :
   ```ts
   const refused = () =>
     Object.assign(new Error("EPERM: operation not permitted, uv_spawn 'git'"), { code: "EPERM", syscall: "uv_spawn" })
   ```
2. `packages/opencode/test/tool/shell-launch-retry.test.ts:24` — le commentaire du dépôt dit
   lisiblement « Exactly what this host returns at random: **the errno survives on the cause** ».
   Et `:26-36` construit bien
   `PlatformError.systemError({ _tag: "PermissionDenied", module, method, pathOrDescriptor,
   syscall: "uv_spawn", cause: Object.assign(new Error(…), { code: "EPERM", … }) })` —
   `code` dans le champ `cause`, rien sur l'enveloppe.
3. `packages/core/src/launch-retry.ts:19-21` — le commentaire du dépôt nomme le mécanisme
   exact : « Effect wraps a refused start in `PlatformError`, whose own message may carry
   neither the errno text nor the code: the denial then only survives as the inner errno
   (code/message) or as the reason tag. The spawner's `toTag` maps `EPERM` to `Unknown`, so
   the errno must be read directly. »

**Le dépôt lui-même démontre la récursion par `cause`** — `launch-retry.ts:31-33` :

```ts
    if (typeof fields._tag === "string" && transientTag.test(fields._tag)) return true
    if (typeof fields.code === "string" && transientCode.test(fields.code)) return true
    if (typeof fields.description === "string" && transientLaunch.test(fields.description)) return true
    return inspect(fields.cause, seen) || inspect(fields.stderr, seen) || inspect(fields.reason, seen)
```

Le `fields.code` de `:31` teste l'objet **courant** ; tout le reste passe par
`inspect(fields.cause, …)`. C'est la même forme de parcours que `errnoOf`
(`proposal:258-264`) — la proposition applique au message la stratégie que `isTransientLaunchFailure`
applique déjà au prédicat. **Le fond de la méthode du validateur (dérive plutôt que fige)
était juste ; son implémentation ne l'était pas.**

**Ce qui reste acquis au validateur.** L'objection 2 reste juste sur ses deux conclusions, et
la révision les applique explicitement (`proposal:457-458` : « les deux affirmations du verdict
sont vraies et appliquées (bannir l'EPERM figé ; conditionner le suffixe à un `detail` non
vide), mais son code est remplacé »). L'objection était en outre **incomplète** : corriger le
message ne suffisait pas à lever C-16, puisque C-16 porte sur la non-déterminisme par rapport à
la cause, non sur la seule présence du mot `EPERM`. La bifurcation `Busy`/`PermissionDenied`
de `proposal:277-282` répond à cela ; le cast du verdict ne l'aurait pas fait. La proposition
est donc **strictement supérieure** au correctif demandé, et ce n'est pas un empiètement :
c'est le même fichier et la même fonction.

**Un point que la révision a manqué — `errnoOf` a un angle mort.** `errnoOf` retourne
`undefined` pour un refus dont la cause ne porte **pas** de `code` mais dont le `message`
contient l'errno. Or `transientLaunch` (`launch-retry.ts:8`) classe justement ces refus comme
transitoires via `:15` (`transientLaunch.test(value.message)`) et `:32` (`fields.description`).
Sur ce refus — un `uv_spawn` en texte brut, sans `code` — le message produit par
`proposal:272` (`errno ?? "unknown"`) affiche donc `the host refused to create "…" (unknown)`.
C'est **mieux** que le message figé `EPERM` — on ne diagnostique pas faux — mais on perd
l'errno disponible dans la chaîne, et un jeton `EPERM` réel pourrait être présenté comme
« unknown ». Verdict : défaut mineur, non bloquant. Correctif d'une ligne, à loger si le
correctif part : avant le repli `"unknown"`, extraire un jeton d'errno de `detail`
(`/^(EPERM|EACCES|EBUSY|E[A-Z]+)/`). Non applicable aux deux fixtures du dépôt, qui
portent toutes deux `code` — d'où l'absence de couverture.

### COR-R18-1 — `CORRECTIONS.md` attribue deux conclusions contradictoires à la même proposition

Le mandat cite C-10 comme « la sévérité réelle de P18 est `low`, pas plus ». C'est
**mutuellement exclusif** avec C-15 et C-16, et ces deux dernières sont vérifiables :

- C-15 porte la source `P18` et décrit exactement la régression de `shell-launch-retry.test.ts:103`
  que cette revalidation vient de recalculer (`8 → 1`, `LAUNCH_BUDGET = 5` en `:20`) ;
- C-16 porte la source `P18` et décrit exactement le message figé que RC2 supprime.

`CORRECTIONS.md:20` (C-10) porte en revanche la source **`P16`** et porte sur
`references` / `truncate.ts:130` / `terminal-output.ts:252`, un sujet sans rapport avec le spawn.
Le même fichier ne peut pas être à la fois « `low` » et « casse le seul test qui couvre le
chemin ». **C-10 concerne P16, pas P18.** Sa sévérité n'a jamais été inscrite pour P18 et la
question posée par le mandat est sans fondement dans le registre des objections.

**Sévérité réelle de P18, établie par moi.** `low`. Motif, à partir de la proposition et des
sources : chemin **froid** (échec de lancement uniquement) ; aucun impact sécurité — §6 déclare
et la source le confirme (`launchRefused` formate une chaîne, n'exécute rien, et le message
prend `input.shell` de la configuration résolue, pas de l'entrée de commande) ; aucune perte de
donnée ni corruption (un refus crée aucun processus — `spawned` reste `false`) ; gain
−89 % de latence sur le chemin d'échec, **coût nul sur un tour nominal** (§6, et confirmé par
la forme du correctif : la chaîne n'est construite que dans le `Effect.catch`) ; +~70 tokens
par échec seulement. Un défaut de performance et d'actionnabilité sur un chemin d'erreur
n'atteint jamais l'utilisateur en régime nominal. `low` est le bon classement, et il n'a
jamais été formulé pour P18 dans le dépôt : **il est à inscrire** (voir `COR-10`).

### COR-R18-2 — une annotation de ligne mutante dans le correctif (§4.1)

`proposal:252-254` justifie l'extracteur par :

> // The errno lives on `cause`, not on the PlatformError itself
> // (cross-spawn-spawner.ts:92), so it has to be walked out the same way

`cross-spawn-spawner.ts:92` est correct et **stable** (§4.4 ne touche que `toTag`, `:31-50`).
Mais `proposal:297-298` et `proposal:374-375` justifient la même chose par `shell.ts:498` — or
§4.3 **réécrit cette ligne**. Le commentaire qui survivra au patch ne sera plus à côté de son
fait générateur. Correction sans coût : faire porter l'annotation sur
`cross-spawn-spawner.ts:92` et `launch-retry.ts:33` uniquement, et supprimer la référence à
`shell.ts:498` des justifications de §4.1/§4.5. Sévérité `info` — mais c'est exactement le
genre de dérive qui a produit C-22 et C-23.

### COR-R18-3 — sûreté de type du nouveau `tagOf` (défaut réel, cœur du correctif)

`proposal:266-269` :

```ts
const tagOf = (error: unknown): string | undefined =>
  typeof (error as { reason?: { _tag?: unknown } })?.reason?._tag === "string"
    ? (error as { reason: { _tag: string } }).reason._tag
    : undefined
```

L'accessibilité sur `reason` vient du fait que `PlatformError` est un union `system |
executable`, dont `reason` est un tag discriminé. Le dépôt impose `strict`, et le précédent
est connu (C-18 : un cast trop large sur ce type a déclenché TS18047 sur P15).
`typeof x === "string"` **ne restreint pas** une propriété d'un type union indexé par cast —
la comparaison de `proposal:280` (`tag === "PermissionDenied"`) contre le type
`PlatformError.SystemErrorTag` peut donc échouer en TS2367 selon la résolution exacte des
membres. Je n'ai pas pu exécuter le typecheck (interdit par le mandat). Correctif à préparer
avant merge : caster `reason` dans un type dont `_tag` est une `string`, ou lire
`reason?._tag as string | undefined` sur un objet `unknown` réel — jamais sur un type union
déclaré. Statut : **`open`**, non bloquant pour le merge mais bloquant pour `REVALIDATED-PASS`.

### COR-R18-4 — le tableau §4.5 n'est pas vérifiable exhaustivement sous ce mandat

`proposal:380` revendique un « Recensement exhaustif (grep sur `packages/**`) ». Le mandat de
revalidation interdit grep ; je ne peux donc ni confirmer « 11 occurrences » ni l'exclure. Ce
que j'ai vérifié par lecture directe : **les trois sites marqués « oui » sont exacts au
verbe près** — `packages/opencode/src/session/prompt.ts:1034`
(`const handle = yield* retryTransientLaunch(spawner.spawn(cmd))`),
`packages/opencode/src/file/ripgrep.ts:356` (`retryTransientLaunch(spawner.spawn(yield* command(input.cwd, filesArgs(input))))`)
et `ripgrep.ts:387` (même forme, `searchArgs`). `ripgrep.ts:237` reste marqué « probable » et
**je ne l'ai pas vérifié** : la ligne demandée n'a pas été lue. La colonne « Redit P18 ? » du
tableau est un jugement du rédacteur, pas une donnée ; je ne la reprends pas à mon compte.
Conséquence : le reliquat est **réel et au moins de 3 sites**, mais sa taille exacte est
inconnue. Cela suffit à l'escalade P18-bis et ne suffit pas à chiffrer son effort.

## Regressions introduced

**Aucune régression cassante introduite par la révision.** C'est le point le plus favorable du
dossier et il mérite d'être énoncé comme tel.

**1. Le test connu-cassant est traité, non contourné, et le fichier est conservé.**
`shell-launch-retry.test.ts` est présent, 106 lignes, `:103` intact (donc la régression
existe toujours *en l'état du dépôt* et sera déclenchée par le patch — la proposition le
déclare, `proposal:471-475`, au lieu de le découvrir à l'exécution). Sa réécriture est
spécifiée ligne par ligne (`proposal:527-543`). Point que le validateur de la vague 2 n'avait
pas vu et qui va dans le bon sens : la suppression de `permanent()` (`:38-48`) est
**obligatoire** et pas seulement esthétique — avec `starts.count === 1`, la branche
`permanent` de `:64` devient inatteignable, et `noUnusedLocals` casserait le typecheck sur une
constante morte.

**2. Le retrait du retry externe ne rétrécit pas la couverture de retry — un point que la
révision argumente implicitement sans le prouver.** `shell.ts:498` est aujourd'hui
`const handle = yield* retryTransientLaunch(spawner.spawn(cmd(...)))` et `shell.ts:13` est
`import { retryTransientLaunch } from "@opencode-ai/core/process"`. Le budget de 8 tentatives
est fourni par le chokepoint `cross-spawn-spawner.ts:284-298`, qui l'applique à **tout** spawn
via `isTransientLaunchFailure` — donc y compris `pwsh.exe`, ce que `proposal:116-133` (§2.6)
établit et ce qui était la prémisse fausse du mandat initial. **Supprimer la couche externe
laisse le budget interne de 8 × 6 350 ms intact** : la couverture est conservée, seul le
doublage disparaît. C'est ce qui rend §5.1 défendable (« aucune n'est supprimée ») au lieu
d'être une affirmation.

**3. Le rayon du retag `EPERM` → `PermissionDenied` (§4.4) est le seul changement de
comportement observable hors P18. Je l'ai audité et il tient**, parce que `toTag` est local au
fichier et n'est jamais exporté (`cross-spawn-spawner.ts:31`, `const toTag = …` sans
`export`) : aucun autre module ne peut construire cette valeur. Ses consommateurs réels,
tous vérifiés :

| consommateur | citation | état après retag |
|---|---|---|
| `launch-retry.ts:9`/`:30` | `transientTag = /^(PermissionDenied\|Busy)$/` | `EPERM` satisfait déjà `transientCode` (`:10`, `:31`) ; les deux regex couvrent `EPERM` → prédicat `true` avant comme après. **Insensible.** |
| `packages/core/src/filesystem.ts:105-108` | `e.reason._tag === "PermissionDenied" \|\| e.reason._tag === "Busy" \|\| /^(EPERM\|EACCES\|EBUSY)$/.test(code)` | teste **déjà** les deux signaux → **insensible**. La ligne `:106` lit `e.cause.code`, ce qui confirme au passage l'arbitrage ci-dessus. |
| `packages/opencode/src/config/config.ts:625-628` | `Effect.catchIf((e) => e.reason._tag === "PermissionDenied", …)` autour de `fs.writeFileString(gitignore, …)` | chemin **filesystem** strict → un tag produit par le spawner ne l'atteint pas. **Inatteignable.** |
| `packages/core/src/util/effect-flock.ts:94` | `isPathGone = (e) => e.reason._tag === "NotFound" \|\| e.reason._tag === "Unknown"` | ne mentionne **pas** `PermissionDenied` ; porte sur des opérations de fichiers. **Inatteignable.** |

Conclusion : pour tout consommateur qui peut observer une erreur de **spawn**, le retag est
sans effet ; pour un consommateur **filesystem**, il est inatteignable. La revendication de
`proposal:487-504` est confirmée sur ses quatre consommateurs vérifiables.

**4. Coût du correctif.** Un test existant est réécrit (`:103`), un test nouveau est ajouté,
`process.ts` gagne une ligne dans un `export`, `launch-retry.ts` gagne 23 lignes,
`cross-spawn-spawner.ts` gagne deux lignes, `shell.ts:13` voit son import remplacé et
`shell.ts:498` son pipeline. Aucune nouvelle dépendance, aucun changement de forme de type
public. L'effort `S` annoncé est cohérent avec ce décompte.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

### Arbitrage du désaccord `cross-spawn-spawner.ts:86-93`

**L'agent de révision a raison, et le code de l'Objection 2 du validateur est
mécaniquement faux.** `cross-spawn-spawner.ts:86-93` construit l'erreur avec six champs
(`_tag`, `module`, `method`, `pathOrDescriptor`, `syscall`, `cause`) et **aucun `code`** ; le
cast `(error as { code?: unknown }).code` renvoie donc `undefined` sur un refus réel.
Corroboré par trois artefacts du dépôt : la fixture
`spawner-launch-retry.test.ts:15-16`, la fixture et le commentaire
`shell-launch-retry.test.ts:24`/`:32-35` (« the errno survives on the cause »), et le
commentaire `launch-retry.ts:19-21` suivi de la récursion effective `launch-retry.ts:31-33`.
L'objection reste juste dans ses **deux conclusions** (bannir l'`EPERM` figé, conditionner le
suffixe), toutes deux appliquées, mais son **code** est remplacé à juste titre — et
`errnoOf` est strictement supérieur, puisqu'il répare en plus la non-déterminisme de levier
que C-16 pose et que le cast ne traitait pas.

### P18 est-il référable ? — **OUI, avec escalade P18-bis**

Diagnostic réel confirmé de bout en bout : budget appliqué deux fois, 8 × 8 = **64 `launch()`**,
`50+100+200+400+800+1600+3200 = 6 350 ms` de délais internes (`launch-retry.ts:43`), pire cas
`8 × 6 350 + 6 350 ≈ 57 150 ms` (`launch-retry.ts:42`, `:48-55`), et échec final portant un
errno nu. La prémisse du mandat — « aucune politique de retry ne couvre le spawn de
`pwsh.exe` » — est bien **fausse**, et cette falsification est établie par la chaîne
`shell.ts:354` → `registry.ts:153` → `registry.ts:583` → `cross-spawn-spawner.ts:284-298`.
Une proposition dont la prémisse est fausse mais dont le diagnostic tient n'est pas un échec :
c'est une proposition **reformulée**, et la révision l'a reformulée au lieu de la défendre.
P18 n'est donc **pas refermé**, et le reste ouvert.

Décision d'arbitrage, motivée :

1. **P18 implémenteable en l'état.** Les 4 corrections sont traitées, le test cassant est
   réécrit et conservé, le retrait du retry externe ne réduit pas la couverture, et le rayon du
   retag est audité. Aucune reprise d'architecture n'est demandée par ce verdict.
2. **Escalade P18-bis obligatoire, pour 3 sites au minimum** — vérifiés verbatim :
   `prompt.ts:1034`, `ripgrep.ts:356`, `ripgrep.ts:387`, tous de la forme
   `retryTransientLaunch(spawner.spawn(...))`, donc la **même** multiplication 8 × 8 sur des
   spawns **non-git**, pour le même prix (~57 s) et le **même** message nu. `ripgrep.ts:237`
   est à confirmer. §4.1/§4.2 sont réutilisables **tel quel**.
3. **Timing de l'escalade — c'est le seul point qui relève de l'arbitrage humain.** Je
   recommande d'ouvrir P18-bis **maintenant**, et non au merge du correctif shell, pour une
   raison précise : la seconde moitié du défaut (l'errno nu) porte sur ces sites **exactement**
   comme sur le shell, et elle est aujourd'hui appliquée au shell par `proposal:335` — une
   correction d'**actionnabilité** qui sera — si P18-bis attend, elle aussi doit être dupliquée
   sur les trois sites. Ouvrir P18-bis après le merge oblige à ré-écrire ce message trois fois
   et à corriger trois fois `process.ts:88-95`. Attendre, c'est payer la duplication du
   correctif qu'on essaie précisément d'éliminer.
4. **Sévérité `low` à inscrire pour P18** (voir `COR-R18-1`) — le motif est établi
   indépendamment, il ne repose pas sur C-10.

`REVALIDATED-FAIL` est écarté : aucun des quatre `Required changes` n'est contesté dans son
fond, le désaccord ouvert est tranché en faveur de la révision, et le correctif est
applicable. `REVALIDATED-PASS` est écarté : `COR-R18-3` est un défaut de sûreté de type sur le
cœur du correctif et `COR-R18-2` une dépendance à une annotation mutante — deux motifs
suffisants pour exiger une seconde passe.

### Grille d'effort — vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| 1. `launchRefused` + `errnoOf`/`tagOf` (+ repli sur `detail`) | S | `packages/core/src/launch-retry.ts` (avant `:77`) | aucun — couvert par item 3 | `aucun` |
| 2. export de `launchRefused` | S | `packages/core/src/process.ts:88-95` | aucun | `aucun` |
| 3. retag `EPERM` → `PermissionDenied` | S | `packages/core/src/cross-spawn-spawner.ts:31-50` | assertion `PermissionDenied` dans `spawner-launch-retry.test.ts` | `spawner-launch-retry.test.ts` — `calls.count` 3 (`:78`) et 1 (`:86`) restent vrais ; à exécuter |
| 4. retirer le retry externe + message | S | `packages/opencode/src/tool/shell.ts:13` + `:498` | `shell-launch-refusal.test.ts` (nouveau, 7 assertions) | **`shell-launch-retry.test.ts:103` — RÉÉCRIRE** (`8 >= 5` → `toBe(1)`), supprimer `permanent`/`LAUNCH_BUDGET`/commentaire ; **ne pas supprimer le fichier** |
| 5. **P18-bis** — 3 sites non-git | M | `prompt.ts:1034`, `ripgrep.ts:356`, `:387` (+`:237` à confirmer) | idem item 4, par site | tests `prompt` / `ripgrep` à relire avant patch ; `aucun` connu à ce jour |
| 6. inscrire la sévérité `low` + l'attribution C-10 | S | `docs/harness-audit/CORRECTIONS.md`, `README.md` | aucun | `aucun` |

Ordre d'exécution imposé par les dépendances : item 2 avant item 4 (sinon l'import ne
résout pas) ; item 1 avant item 4 ; item 3 avant l'assertion de l'item 3 du tableau de tests ;
item 4 avant item 5 (le message doit exister une fois pour être réutilisé). Vérification
finale inchangée : `cd packages/core && bun test test/process` puis
`cd packages/opencode && bun test test/tool/`.

### Résidus non résolus, déclarés

- `COR-R18-3` — `tagOf` vs `PlatformError.SystemErrorTag` sous `strict` : **`open`**,
  non exécuté (mandat sans shell).
- `COR-R18-4` — exhaustivité du tableau §4.5 (`:237`, « 11 occurrences ») : **`open`**, non
  vérifiable sous l'interdiction grep. La taille du reliquat est donc **≥ 3 sites, bornée
  supérieure inconnue**.
- `proposal:135-157` — le comptage `FILES=11 / UV_SPAWN_TOTAL=1 / UV_SPAWN_PWSH=0 /
  EPERM_ANY=11 / EBUSY_ANY=3` est un recomptage shell du rédacteur : **non revérifié par moi**
  (mandat sans shell). Sans effet sur ce verdict, dont la thèse repose sur la duplication
  mécanique (§3) et non sur un volume — c'est d'ailleurs l'objet de RC4.
- Le désaccord `errno` est **tranché et clos** ; le défaut résiduel associé (`"unknown"` sur
  refus sans `code`) est consignable en une ligne si le correctif part.
