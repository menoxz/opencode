# P02 — champ décoratif de premier niveau dans la clé de signature : `description` rend `FAILURE_LIMIT` inatteignable (lot 1 sur 4)

> Révisé cycle 2 après REVALIDATED-PASS_WITH_CHANGES du 2026-10-03 — R1 (digest) et R2 (4 instances de premier niveau) traitées

Date = date de cette révision : `P02-revalidation.md` ne porte aucun horodatage interne (recherche
d'un motif de date dans le verdict : 5 occurrences, toutes en prose, aucune date). Le cycle 2 lève
R1 (texte et cas de test), R2 (requalification de `summary`, comptage à 4, cause de la conservation
de la liste) et R3, R4. **Aucune objection `open`.**

## 0. Statut des objections du cycle 2

| objection | exigence du verdict | traitement dans ce document | statut |
| --- | --- | --- | --- |
| **R1** — `record(..., { ok: false })` ne typecheck pas | écrire `{ ok: false, digest: "" }` dans le cas 2, et le dire | §7 cas 2 : le littéral corrigé **et** un encadré « exigence de compilation » citant `Outcome.digest` comme requis, avec la convention observée dans la suite existante | `closed` |
| **R2** — `goal-contract.ts:436` qualifié à tort d'imbriqué | requalifier en premier niveau, compter **4** et non 3, et ajouter un cas de non-regression couvrant `summary` | §4 tableau (`summary` : **premier niveau**, et **sémantique**) ; §2 (a) et le titre : 4 instances ; §7 cas 6 : le filtre ne doit pas retirer `summary`/`title`/`reason` | `closed` |
| **R3** — citations `task.ts:53-55` / `task.ts:53-58` trop larges | resserrer les plages | §3 et §5 : `task.ts:53-54` pour `description`, `:56-58` pour `prompt` | `closed` |
| **R4** — « canal covert » de §6 plus fort que sa preuve | resserrer la formulation | §6 : le canal est une **variation** de clé, pas un transport de secret ; la citation est retirée | `closed` |
| RC5 (cond. 3) — qualification « instances **connues** » | vérifier ligne à ligne `title`/`summary`/`reason`, **ou** retirer la qualification | Les deux sont faits : vérification ligne à ligne (§4 tableau, colonnes « sémantique ? » avec consommateurs), et la formulation « instance connue, non corrigée » disparaît au profit d'un verdict par instance | `closed` |

**Résidus, aucun `open`.** Deux réserves de fait, non bloquantes et non levables par `read` :
(1) la **baseline `bun test` n'est pas établie** — aucune commande n'a été exécutée (méthode
`read` seul), donc l'item « casser un test existant » de §8 reste établi **par lecture** ;
(2) le **risque structurel** de §6 (« un champ décoratif ajouté ou renommé par la suite
réintroduit le défaut ») reste ouvert par construction, et c'est un choix de conception assumé, pas
une objection.

**Périmètre réel, énoncé d'emblée.** La classe de défaut est « un champ libre de **premier niveau**
sérialisé dans la clé de détection de répétition **sans que sa variation change le résultat de
l'appel** ». Ce lot n'en corrige **qu'une instance sur quatre** : `description`. Les trois autres —
`title`, `summary`, `reason` — ont été **vérifiées ligne à ligne dans ce cycle** et se sont révélées
**sémantiques** (§4) : leur variation change le résultat, les retirer fusionnerait des appels
distincts sous une même clé et produirait un **faux blocage**. Le lot 1 corrige donc l'unique
instance réellement porteuse du défaut ; le reliquat n'est pas un backlog de correction mais une
décision argumentée, ce qui est une information plus forte que « à planifier ».

## 1. Problem

Le frein à boucle compare des appels d'outil sur l'intégralité de leurs arguments, y compris un
champ `description` libre et obligatoire que le modèle réécrit à chaque tour ; deux tentatives du
même échec ne produisent donc jamais la même clé, et le blocage au bout de trois échecs ne se
produit jamais.

## 2. Evidence

**(a) Le seuil existe et n'est pas atteignable pour tout outil dont les args portent un champ libre
de premier niveau sans effet sur le résultat — `description` en est le cas avéré.**

`packages/opencode/src/tool/repetition.ts:43`

```ts
export const FAILURE_LIMIT = 3
```

Le décompte de premier niveau est de **quatre instances distinctes**, et non trois :
`description`, `title`, `summary`, `reason`. Le cycle 2 les a qualifiées une à une (§4) :

| champ de premier niveau | déclarations | effet de sa variation sur le résultat |
| --- | --- | --- |
| `description` | `shell/prompt.ts:29`, `task.ts:53-54`, `task.ts:85` | **nul** — libellé recopié dans la sortie |
| `title` | `environment.ts:31`, `workspace-handoff.ts:21` | **non nul** — titre de recette exigé (`environment.ts:156`) ; titre de la session créée (`workspace-handoff.ts:144`) |
| `summary` | `environment.ts:17`, `goal-contract.ts:436` | **non nul** — résumé exigé pour `observe` (`environment.ts:72`) ; persisting dans `goalState` (`goal-contract.ts:740`) |
| `reason` | `workspace-handoff.ts:19` | **non nul** — métadonnées de permission (`workspace-handoff.ts:119`, `:127`), capsule de transfert (`:140`) |

Une seule instance satisfait la condition « la variation ne change rien » : `description`. Le défaut
reste donc **structurellement présent sur les trois autres**, mais ce n'est plus le même défaut :
c'est un coût de clé assumé, contre un vrai faux blocage si on les retirait.

**(b) La clé est l'outil plus les arguments sérialisés en entier, sans filtrage de métadonnées.**

`packages/opencode/src/tool/repetition.ts:82-84`

```ts
export function signature(tool: string, args: unknown): string {
  return `${tool}\u0000${stableStringify(args)}`
}
```

`packages/opencode/src/tool/repetition.ts:75-78` — le seul filtre appliqué est `undefined` :

```ts
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
```

**(c) Le comptage se fait sur cette clé, avant exécution.**

`packages/opencode/src/tool/repetition.ts:120` puis `:123`

```ts
  const entry = ledger(sessionID).get(signature(tool, args))
  if (!entry) return { blocked: false }
  if (entry.failures >= FAILURE_LIMIT - 1)
```

**(d) `description` est obligatoire, libre, et n'influence pas l'exécution.**

`packages/opencode/src/tool/shell/prompt.ts:11` (extrait) et `:29`

```ts
  bash: "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\n…
```

```ts
    description: Schema.String.annotate({ description }),
```

Les trois paramètres siblings sont `command`, `timeout`, `workdir`
(`packages/opencode/src/tool/shell/prompt.ts:24-28`) : `description` n'est ni lu ni utilisé par
l'exécution, il est seulement recopié dans le résultat — `ctx.metadata({ metadata: { output: last,
description: input.description } })` (`packages/opencode/src/tool/shell.ts:540-545`) puis
`title: input.description` et `metadata.description` sur le chemin nominal
(`packages/opencode/src/tool/shell.ts:612`, `:616`). Aucun de ces trois emplacements ne relit la
valeur pour décider quoi que ce soit.

**(e) L'outil s'enregistre sous l'id de la famille shell, lui-même un littéral.**

`packages/opencode/src/tool/shell.ts:350-351`

```ts
export const ShellTool = Tool.define(
  ShellID.ToolID,
```

`packages/opencode/src/tool/shell/id.ts:14-17`

```ts
// Keep the exposed tool ID and permission key as "bash" for compatibility with
// existing plugins, users, and saved permissions. Rename with opencode 2.0.
export const ToolID = "bash"
export type ToolID = typeof ToolID
```

**(f) Le point d'entrée du frein est bien le Tool.define de `tool.ts`.**

`packages/opencode/src/tool/tool.ts:153-155` (échecs de décodage, clés sur les args bruts) et
`:162` / `:179` / `:183-186` (chemin nominal) :

```ts
              const verdict = ToolRepetition.inspect(ctx.sessionID, id, args)
              if (verdict.blocked) return new RepeatedCallError({ tool: id, detail: ToolRepetition.explain(verdict) })
              ToolRepetition.record(ctx.sessionID, id, args, { ok: false, digest: "" })
```

Le chemin nominal incrémente `failures` en `:179` (`if (!permission && !interrupted)`) et écrit le
digest de succès en `:183-186`. `toolInfo.execute` est réécrit à `:127`, donc le frein couvre tout
appel d'outil sans couche optionnelle.

**(g) Mesure sur le journal d'échecs de cette machine — corroborant de fréquence, partiellement
reproductible.**

Chemin mesuré : `C:\Users\jeanl\.config\opencode\failure-journal\987d8a4073210e235a9ca87b42a0b429a5543723.jsonl`
(comptage de lignes, `Select-String` sur le motif littéral, `[regex]::Matches` sur `seen (\d+)x`).

| mesure | première mesure | recompte du validateur | recompte de la révision |
|---|---|---|---|
| lignes du fichier | `1253` | `1267` | `1290` |
| `bash exited with 1: (no output)` | `138` | `138` | `138` |
| motif `seen (\d+)x` | `0` | `0` | `0` |

Lecture honnête : **`138` et `0` sont reproductibles** — ils se rejouent à l'identique sur les trois
comptages, et ce sont les deux affirmations substantielles de la section. **Le nombre de lignes ne
l'est pas** : c'est le journal d'échecs **vivant de la session en cours** (le chemin est celui
référencé par le harness lui-même), il grandit pendant qu'on le compte. Toute borne basse est donc
un plancher de forme « ≥ N au moment de la mesure », pas une valeur rejouable. Le brief annonçait
« 1 252 entrées », la première mesure a donné 1 253 : les trois valeurs sont des planchers successifs
du même fichier en croissance, pas une contradiction.

**(h) Origine du libellé `[seen Nx]` — résolu, et ce n'est pas le journal.**

`C:\Users\jeanl\.config\opencodev2\plugin\failure-journal.mjs:325-343`

```js
    "experimental.chat.system.transform": async (_input, output) => {
      …
      const items = recurring().slice(0, maxInjected)
      …
          …items.flatMap((r) => {
            const out = [`- [seen ${r.count}x] ${r.error}`]
```

`r.count` vient de `recurring()`, une agrégation ; le résultat est poussé dans `output.system`
(`:343`) et n'est **jamais écrit dans le fichier `.jsonl`**. L'entrée de journal elle-même ne porte
que `id`, `at`, `tool`, `cwd`, `exit`, `detected`, `command`, `error`
(`failure-journal.mjs:310-318`).

Donc `seen = 0` n'est pas une contradiction, c'est le comportement attendu. Le compteur `seen` est un
**texte de prompt injecté**, produit par un greffon au niveau utilisateur situé **hors de ce dépôt**.

**Ce que cette mesure change :** la conclusion de la section 1 ne s'appuie ni sur le journal ni sur
le compteur. Elle s'appuie sur (b)+(c)+(d) : un champ libre dans les args rend la clé non
reproductible par construction. Les 138 entrées et le compteur agrégé ne sont que des corroborants
de fréquence, dans deux supports différents.

**(i) Le compteur `failures` n'est remis à zéro que sur un succès, et le digest est vide sur le
chemin d'échec — fait vérifié, il borne ce que §6 peut promettre.**

`packages/opencode/src/tool/repetition.ts:161-168`

```ts
  if (!outcome.ok) {
    entry.failures += 1
    entry.idle = 0
  } else {
    entry.failures = 0
    entry.idle = entry.digest === outcome.digest ? entry.idle + 1 : 0
    entry.digest = outcome.digest
  }
```

Et les deux seuls appels de `record` sur échec transmettent un digest vide :
`tool.ts:155` et `tool.ts:179` passent tous deux `{ ok: false, digest: "" }`.

Conséquence : la règle IDLE-OUTPUT (`repetition.ts:22-24`, analyse en `:26-28`) protège le compteur
`idle` par comparaison de digest (`:166`), mais **elle ne protège pas le compteur `failures`**, qui
est incrémenté sans condition (`:162`) et remis à zéro uniquement sur succès (`:165`). Le §6 doit
donc dire exactement cela, et l'option « réinitialiser `failures` sur digest changeant » est **hors
de portée de ce patch** : sur le chemin d'échec le digest est la chaîne vide, il n'y a rien à
comparer.

## 3. Mechanism

1. Le modèle émet un appel `bash` avec `{command, timeout?, workdir?, description}` — `description`
   est obligatoire (`shell/prompt.ts:29`) et libre en formulation (`shell/prompt.ts:11`).
2. `Tool.define` installe le frein sur **tout** chemin d'exécution (`tool.ts:127`), sans couche
   optionnelle : le module est un registre par session, actif inconditionnellement
   (`repetition.ts:67`, `:69`), ce que l'en-tête du module énonce lui-même (`:30`).
3. Avant d'exécuter, `tool.ts:162` appelle `ToolRepetition.inspect(ctx.sessionID, id, decoded)`.
4. `inspect` calcule `signature(tool, args)` (`repetition.ts:120`), c'est-à-dire
   `tool + "\u0000" + stableStringify(args)` (`repetition.ts:83`), qui sérialise **toutes** les clés
   non-`undefined`, triées (`repetition.ts:75-78`).
5. La clé inclut donc la formulation exacte de `description`. Le registre ne contient aucune entrée
   pour `(id, command, timeout, workdir, description_v2)`.
6. `inspect` rend `{ blocked: false }` (`repetition.ts:121`), l'appel part, la commande échoue de
   façon déterministe, et `record` (`tool.ts:179`) incrémente `failures` sur **une entrée orpheline**
   (`repetition.ts:161-163`).
7. Au tour suivant, le modèle réécrit `description` (autre formulation, même 5-10 mots) → nouvelle
   clé → `repetition.ts:121` court-circuite encore. `FAILURE_LIMIT - 1 = 2` n'est jamais atteint
   sur une même entrée.
8. Le ledger ne conserve que `WINDOW = 24` entrées (`repetition.ts:37`, éviction `:172-176`), donc
   l'entrée orpheline est de surcroît éjectée : la règle de failure est structurellement inopérante
   pour tout outil à champ descriptif libre, sans que l'utilisateur voie d'erreur.

Le même défaut s'applique, par le même chemin, à `task` : `description` y est un libellé de 3-5 mots
(`task.ts:53-54`) distinct de `prompt` (`task.ts:56-58`) qui, lui, est la charge utile et reste dans
la clé. Sur le chemin de reprise, les deux redeviennent obligatoires (`task.ts:85`, `:86`).

## 4. Proposal

**Choix : liste d'exclusion de clés de premier niveau, globale, limitée à `description`.** C'est la
variante la moins risquée : une seule clé, un seul fichier, aucune édition de schéma d'outil, aucune
table d'ids à maintenir, aucun comportement modifié pour les outils qui n'ont pas ce champ.

Fichier modifié : `packages/opencode/src/tool/repetition.ts` uniquement.
Fonction modifiée : `signature` (`:82`). Aucune autre fonction, aucun autre fichier.

```ts
/** Top-level arg fields carrying no execution semantics: excluded from the key. */
const DECORATIVE = new Set(["description"])

/** Signature of one tool call: tool identity plus its semantic arguments. */
export function signature(tool: string, args: unknown): string {
  const semantic =
    args !== null && typeof args === "object" && !Array.isArray(args)
      ? Object.fromEntries(Object.entries(args as Record<string, unknown>).filter(([k]) => !DECORATIVE.has(k)))
      : args
  return `${tool}\u0000${stableStringify(semantic)}`
}
```

Pourquoi `description` seule, et pourquoi au premier niveau :

- **Le filtre est superficiel, pas récursif.** `tasks` déclare `description` dans `Patch`
  (`tasks.ts:28`, `:30`), un champ d'item décrivant le contenu réel d'une tâche à écrire. Le filtre
  de `signature` ne touche que `args` lui-même, donc `Patch.description` reste dans la clé : aucune
  perte de discrimination sur `tasks`.
- **C'est le seul champ de premier niveau vérifié comme sans effet sur le résultat, pour *tous* les
  outils qui le déclarent.** Famille shell : il n'entre dans aucun calcul
  (`shell/prompt.ts:24-29`), il est seulement recopié (`shell.ts:540-545`, `:612`, `:616`). `task` :
  il est redondant avec `prompt` (`task.ts:56-58`), qui reste dans la clé.
- **Les trois autres instances de premier niveau sont sémantiques — vérifié, pas supposé.**
  `title` est une entrée **exigée** de `recipe_save` (`environment.ts:156`, sinon erreur `:158`,
  `:160`) et devient le titre de la session créée par `workspace_handoff` (`workspace-handoff.ts:144`)
  ; `summary` est **exigé** pour `observe` (`environment.ts:72`, `:74`, `:76`), est persisté dans
  l'observation (`:82`, `:105`), et pour `complete_objective` il est persisté dans `goalState`
  (`goal-contract.ts:740`) puis rendu dans le texte de confirmation (`:750`) ; `reason` alimente les
  demandes de permission (`workspace-handoff.ts:119`, `:127`), le texte de la capsule (`:80`, `:140`).
  Les retirer de la clé fusionnerait sous une même clé deux appels dont le résultat diffère
  (`create`-différent, `observe`-différente, permission-d différente) : **faux blocage**.
- **`prompt` reste conservé** : c'est la consigne du sous-agent (`task.ts:56-58`) et le texte
  utilisateur du contrat d'objectif (`goal-contract.ts:63-65`, `:69-71`). Le retirer produirait le
  même faux blocage, en pire.

**Inventaire des champs d'args purement descriptifs ou générés.** La colonne « sémantique ? » répond
à une seule question : **la variation de la valeur change-t-elle le résultat de l'appel ?** Seul un
champ de premier niveau répondant « non » est retiré de la clé ; tout le reste en est exclu, y
compris lorsqu'il *paraît* décoratif. Chaque ligne « sémantique » porte le consommateur qui le prouve.

| champ | déclarations | sémantique ? | décision |
| --- | --- | --- | --- |
| `description` (1er niveau) | `shell/prompt.ts:29` — obligatoire, formulation libre imposée par `shell/prompt.ts:11` ; `task.ts:53-54` et `:85` — libellé de 3-5 mots | **Non.** Famille shell : les seuls champs lus sont `command`, `timeout`, `workdir` (`shell/prompt.ts:24-28`) ; `description` n'est jamais relue, seulement recopiée dans le résultat (`shell.ts:540-545`, `:612`, `:616`). `task` : redondante avec `prompt` (`task.ts:56-58`), qui reste dans la clé. | **Exclu de la clé, niveau 1** |
| `description` (imbriqué) | `tasks.ts:30`, dans `Patch` (`tasks.ts:28-38`), atteint par `Parameters.task` (`tasks.ts:57-62`) | **Oui.** Décrit le contenu réel d'une tâche écrite, à distinguer d'un autre contenu. | Conservé — le filtre est superficiel, non récursif |
| `prompt` | `task.ts:56-58` ; `goal-contract.ts:63-65`, `:69-71` | **Oui.** Consigne du sous-agent ; texte utilisateur du contrat d'objectif. | Conservé |
| `objective` | `goal-contract.ts:63-65` | **Oui.** Contenu de l'objectif créé ou édité. | Conservé |
| `title` (1er niveau) | `environment.ts:31` ; `workspace-handoff.ts:21` | **Oui — vérifié.** `environment.ts:156` refuse `recipe_save` sans `title` (erreur `:158`, `:160`). `workspace-handoff.ts:144` en fait le titre de la session créée. Deux `title` différents ⇒ deux recettes / deux sessions différentes. | Conservé — exclusion **refusée** sur preuve |
| `reason` (1er niveau) | `workspace-handoff.ts:19` | **Oui — vérifié.** Métadonnées des deux `ctx.ask` de permission (`workspace-handoff.ts:119`, `:127`), texte de la capsule (`:80`) et capsule transmise (`:140`). | Conservé — exclusion **refusée** sur preuve |
| `reason` (imbriqué) | `goal-contract.ts:470`, dans `unverified` (`goal-contract.ts:466-472`) | **Oui** (motif d'un DoD non prouvé, rendu en `goal-contract.ts:752`). Hors de portée d'un filtre de niveau 1 de toute façon. | Conservé — imbriqué |
| `summary` (1er niveau) | `environment.ts:17` ; `goal-contract.ts:436` | **Oui — vérifié.** `environment.ts:72` refuse `observe` sans `summary` (erreur `:74`, `:76`) ; la valeur est persistée (`:82`, `:105`) et rendue (`:108`). `goal-contract.ts:436` est **la racine des paramètres de `complete_objective`** (`CompleteParameters`, `goal-contract.ts:435` ; `parameters:` en `:573` ; `Tool.define<typeof CompleteParameters, …>` en `:778` et `:782`) — donc **premier niveau, pas imbriqué** — et sa valeur est persistée dans `goalState` (`:740`) puis rendue (`:750`). | Conservé — exclusion **refusée** sur preuve |
| `steps` | `environment.ts:38-40` | **Oui.** Corps de la recette mémorisée. | Conservé |
| `scope`, `evidence`, `dod`, `summary` (finding) | `goal-contract.ts:457-458`, `goal-contract.ts:456`, `:469` | **Oui.** Portée, preuves, énoncé d'un DoD ; `summary` d'un finding est imbriqué dans le tableau `findings` et sert à son rendu (`goal-contract.ts:604`, `:625`, `:672`). | Conservés |

**Ce que le lot 1 corrige et ce qu'il laisse.** Corrigé : `description` au premier niveau, donc le
chemin dominant — la famille shell enregistrée sous l'id `"bash"` (`shell/id.ts:16`, consommé par
`shell.ts:350-351`) et `task` (`task.ts:32`, consommé par `task.ts:291-292`), qui concentrent le
volume d'échecs identiques. Non corrigé : `title`, `summary` et `reason` au premier niveau, qui
restent dans la clé **parce qu'ils sont sémantiques** — ce n'est plus une liste « à planifier » mais
trois décisions argumentées, chacune adossée à un consommateur. La clause « quatre instances, une
corrigée » est donc exacte : le défaut de *classe* survit sur ces outils, le défaut de *champ
décoratif* n'y existe pas.

Ce qui reste **inchangé**, et pourquoi :

- `stableStringify` (`:72-79`) : sa sémantique de tri et de filtrage `undefined` est correcte ; le
  filtre d'exclusion se place en amont, dans `signature`, pour ne pas affecter `Entry.args`
  (`repetition.ts:155`) qui alimente le texte d'explication `preview` (`:110-113`, `:129`). Le modèle
  doit continuer de voir les arguments qu'il a réellement envoyé.
- `FAILURE_LIMIT`, `REPEAT_LIMIT`, `WINDOW`, `MAX_SESSIONS` (`:37-46`) : la sémantique est bonne ;
  seul l'espace de clés était faux. En particulier `record` (`:161-168`) n'est **pas** modifié : voir
  §6 et §9 pour la décision de conception que ce lot prend à son sujet.
- `Outcome` (`:48-52`) : **inchangé**. `digest` reste un champ **requis** ; le patch n'ajoute aucun
  cas qui violerait cette exigence (voir §7).
- Les schémas d'outils : rendre `description` optionnel déplacerait le problème vers le modèle et
  ne changerait rien à la clé tant que le champ est présent.
- `tool.ts` : aucune édition. `inspect`/`record` reçoivent les args décodés et la correction est
  interne à la clé.

**Refus serveur au-delà de N erreurs identiques sur un même `tool_call_id` : écarté, et
l'instrument disponible ne le permet pas.** `ctx.callID` est joint aux attributs d'observation
(`tool.ts:132`), mais c'est l'identifiant de *cette invocation* : deux tentatives identiques de la
même commande ont deux `callID` différents. Compter les échecs par `callID` donnerait 1 par clé et
ne dépasserait jamais N. Le besoin réel — « N échecs identiques sur la même commande » — est
exactement ce que la correction de clé adresse, et il se pose du côté du modèle, qui reçoit le
`RepeatedCallError` (`tool.ts:163-164`, texte en `repetition.ts:188-194`). Le backend n'a rien à
apprendre de plus et ne peut rien appliquer de plus.

**Décision de conception explicite sur `entry.failures`.** Ce lot choisit de réécrire
l'atténuation, et **n'ajoute pas** la réinitialisation sur changement de digest, pour une raison
vérifiable : sur le chemin d'échec, `tool.ts:155` et `tool.ts:179` transmettent
`{ ok: false, digest: "" }` et `record` (`:161-167`) n'écrit `entry.digest` que dans la branche
succès. Un digest d'échec n'existe pas ; `entry.failures = 0` « sur digest changeant » serait donc du
code mort. Fournir un vrai digest d'échec suppose de modifier `tool.ts` (calcul du digest sur la
sortie d'erreur) et de redéfinir ce que « même erreur » signifie — un autre changement de modèle de
comptage, hors périmètre d'un patch d'une fonction. Reporté, et nommé en §9.

## 5. Alternatives considered

1. **Table par id d'outil (`{ bash: [...], task: [...] }`) — écartée.** Une table par id **est**
   techniquement praticable : les ids sont des littéraux (`shell/id.ts:16`, consommé par
   `shell.ts:350-351` ; `task.ts:32`, consommé par `task.ts:291-292`), et l'obstacle est un autre :
   la table doit être tenue à jour à chaque ajout de champ, et elle devrait alors porter les quatre
   instances — dont trois sont sémantiques (§4) et n'ont donc rien à y faire. Une table d'exclusion
   qui ne contient qu'une entrée est plus coûteuse à maintenir qu'un `Set` d'une ligne.
2. **Rendre `description` optionnel dans les schémas — écartée.** Le champ resterait présent dans
   les args émis par le modèle ; la clé ne changerait pas. Le problème est l'espace de clés, pas le
   contrat d'outils.
3. **Filtrer dans `stableStringify` — écartée, et c'est un piège actif.** `Entry.args`
   (`repetition.ts:155`) est produit par le même appel et alimente `preview` (`:110-113`, `:129`) :
   le texte de bloc montrerait au modèle un `description` qu'il n'a pas envoyé. Le filtre doit rester
   dans `signature`.
4. **Ajouter la réinitialisation de `failures` sur changement de digest — écartée pour ce lot**, voir
   §4 : aucun digest n'est disponible sur le chemin d'échec (`tool.ts:155`, `:179` →
   `{ ok: false, digest: "" }`), la condition serait toujours fausse.
5. **Compter les échecs sur le message d'erreur plutôt que sur les args — écartée.** Les compteurs
   d'échec portent aujourd'hui sur les args (`tool.ts:155`, `:179`) ; changer cette clé est une
   refonte du modèle de comptage, avec impact sur la règle IDLE-OUTPUT, pour un bénéfice nul une fois
   la clé d'entrée stabilisée.
6. **Exclure aussi `title`, `summary`, `reason` — écartée, sur preuve.** Vérification ligne à ligne
   (§4) : les trois sont sémantiques. Les exclure fusionnerait des appels à résultat différent sous
   une clé unique et produirait des **faux blocages** — une régression de sûreté, pas un gain.

## 6. Risks

- **Régression sur les tests existants.** `packages/opencode/src/tool/repetition.test.ts`
  (156 lignes) teste `signature` aux lignes 21-41 et `inspect`/`record` aux lignes 43-156. Les
  arguments utilisés sont `EDIT_ARGS` `{ filePath, oldString, newString }` (`:16`) et
  `READ_ARGS` `{ filePath, offset, limit }` (`:17`), plus `{ a: 1, b: 2 }` (`:23`) et
  `{ filePath: "/a" }` (`:37`) : **aucun ne contient `description`**, donc aucun des jugements
  existants ne change et aucun n'a besoin d'être réécrit. C'est vérifiable par relecture, pas par
  présomption. Surfaces de régression secondaires, à exécuter sans modification attendue :
  `packages/opencode/test/tool/tool-define.test.ts` (args `{ questions: [{ options: ["a"] }] }`
  en `:138`, `{ nope: "same" }` en `:177` — aucun ne porte la clé),
  `packages/opencode/test/tool/registry.test.ts`, `packages/opencode/test/tool/shell.test.ts`,
  `packages/opencode/test/tool/shell-output-prompt.test.ts`,
  `packages/opencode/test/tool/shell-launch-retry.test.ts`.
  **Réserve : la baseline `bun test` n'est pas établie** (aucune commande exécutée, méthode `read`
  seul) ; cette non-régression est établie par lecture, pas par exécution.
- **Coût en tokens : nul, mesurable par construction.** La signature n'entre jamais dans le prompt ;
  elle ne vit que comme clé d'un `Map` en mémoire (`repetition.ts:67`, `:69`, `:120`, `:147`). Le
  modèle ne voit donc ni chaîne supplémentaire ni champ supplémentaire.
- **Latence ajoutée : une projection d'objets par appel, soit O(nombre de clés d'entrée).** Pour
  la famille shell, 4 clés (`shell/prompt.ts:24-29`) : quelques dizaines de nanosecondes par appel
  d'outil, négligeable devant un aller-retour modèle. Je ne chiffre pas de pourcentage de latence
  sans banc : la mesure à produire est `bun run bench:test` (`package.json:16`) avant/après, sur le
  même jeu de tests.
- **Faux positifs plus fréquents — risque réel, et la règle IDLE-OUTPUT ne le couvre pas.** C'est
  le vrai risque du correctif : `bash "bun test"` échoué 2 fois sera désormais bloqué au 3ᵉ essai
  même si le modèle réécrit `description`. C'est le comportement voulu par `FAILURE_LIMIT` et
  conforme à l'en-tête du module (`repetition.ts:18-20`), mais cela touche `bash`, l'outil le plus
  utilisé. **Précision obligatoire** : une commande qui échoue 3 fois **en évoluant** (`127 → 95 →
  3` tests rouges) sera elle aussi bloquée, parce que `entry.failures` est incrémenté sans condition
  (`repetition.ts:162`) et n'est remis à zéro que sur un **succès** (`:165`) ; la règle IDLE-OUTPUT
  (`:22-24`, analyse en `:26-28`) ne compare le digest que pour le compteur `idle` (`:166`). Sur le
  chemin d'échec le digest est de surcroît la chaîne vide (`tool.ts:155`, `:179`), donc aucune
  discrimination n'est possible en l'état. Atténuation réelle, elle : le texte d'erreur déjà produit
  (`repetition.ts:188-194`) ordonne explicitement de relire l'état et d'élargir les arguments. Ce
  lot **ne** change pas `record` ; la fausse promesse à éviter serait d'écrire que « la sortie qui
  change protège le compteur d'échecs », et elle n'est pas écrite.
- **Sécurité — ce que le canal `description` est, et ce qu'il n'est pas.** Aucun contournement de
  permission n'est possible : le frein ne remplace pas un contrôle d'accès, il refuse une exécution
  répétée (`tool.ts:163-164`). Aucun risque d'injection : la valeur retirée de la clé n'est jamais
  réinterprétée, seulement omise, et `stableStringify` reste le seul sérialiseur
  (`repetition.ts:72-79`). Formulation resserrée, conformément au constat du revalidateur :
  aujourd'hui `description` est **déjà** dans la clé, donc il constitue un canal de **variation** —
  varied pour éviter `FAILURE_LIMIT` — et **non** un canal de transport. Aucun secret ne transite
  par lui : dans ce dépôt, `description` entre par le schéma (`shell/prompt.ts:29`) et n'est recopié
  que dans le résultat de l'appel (`shell.ts:540-545`, `:612`, `:616`) ; il n'est écrit dans aucun
  journal. Lcapes réel de ce canal : le frein est une garde de **coût**, pas un contrôle d'accès ;
  l'y échapper n'accorde aucun privilège, seulement des appels d'outils supplémentaires. Le
  correctif supprime ce canal de variation, ce qui est une amélioration de la résistance à l'abus de
  budget.
- **Limite de la correction, à assumer explicitement.** Un champ libre de premier niveau ajouté ou
  renommé par la suite réintroduit le défaut sans que rien ne le signale ; `title`, `summary` et
  `reason` sont **déjà** dans ce cas, pour une raison différente et documentée (§4) : ils sont
  sémantiques, et les retirer créerait un faux blocage plus grave que celui qu'on corrige. Le remède
  immédiat est le test de non-régression §7 cas 6, qui épingle l'ensemble conservé ; ce n'est pas une
  garantie structurelle.

## 7. Tests

**Test unitaire à écrire : `packages/opencode/test/tool/repetition-signature.test.ts`** (nouveau
fichier ; `packages/opencode/test/tool/` existe et accueille déjà les tests d'outils —
`apply_patch.test.ts`, `shell.test.ts`, `tool-define.test.ts`, `goal-contract.test.ts`, …, listing
relevé par glob sur ce répertoire). Emplacement retenu plutôt qu'un ajout à
`src/tool/repetition.test.ts` pour respecter le chemin exigé par le gabarit sans dissocier le test
de régression de la suite existante.

**Commande exacte**, depuis `C:\jeanluc\opencode-fork\packages\opencode` :

```
bun test test/tool/repetition-signature.test.ts
```

(`bun test` est bien le runner : `package.json:10` déclare `"test": "bun test --timeout 30000"`.)

### 7.1 Exigence de compilation — `Outcome.digest` est un champ **requis**

> **Le cas 2 doit écrire `{ ok: false, digest: "" }`.** `{ ok: false }` seul **ne compile pas** et ne
> runte pas. Le type est `packages/opencode/src/tool/repetition.ts:48-52` :
>
> ```ts
> export type Outcome = {
>   ok: boolean
>   /** Digest of the tool output, used to detect a call that learned nothing. */
>   digest: string
> }
> ```
>
> `digest` n'est pas optionnel. La convention de la suite existante est univoque — `{ ok: false,
> digest: "" }` à `repetition.test.ts:46`, `:49`, `:60`, `:65`, `:70`, `:75`, `:119`, `:120` — et
> c'est le même littéral que transmettent les deux sites de production sur échec (`tool.ts:155`,
> `:179`). Le correctif est d'**une ligne** : ajouter `digest: ""`. Cette ligne est la différence
> entre un cas de test qui prouve le point central du patch (la règle `FAILURE` devient atteignable)
> et un fichier qui ne compile pas.

### 7.2 Cas, et critère de succès observable pour chacun

1. `description` ne change pas la clé — `signature("bash", {command:"bun test", description:"A"})`
   égale `signature("bash", {command:"bun test", description:"B"})`. Succès : les deux `toBe` passent.
2. **La règle de failure devient atteignable.** Deux `record` avec `{ ok: false, digest: "" }`
   (**champ `digest` obligatoire, voir §7.1**) et deux `description` différentes, puis `inspect` rend
   `blocked: true` et `reason: "failure"`. Succès : le 3ᵉ appel est refusé, alors qu'avant correctif il
   passait.

   ```ts
   test("the failure rule becomes reachable across description rewrites", () => {
     // `digest` is REQUIRED by `Outcome` (repetition.ts:48-52): `{ ok: false }` does not typecheck.
     const A = { command: "bun test", description: "Run the unit tests" }
     const B = { command: "bun test", description: "Execute the test suite" }
     ToolRepetition.record(SESSION, "bash", A, { ok: false, digest: "" })
     ToolRepetition.record(SESSION, "bash", B, { ok: false, digest: "" })

     const verdict = ToolRepetition.inspect(SESSION, "bash", B)
     expect(verdict.blocked).toBe(true)
     if (!verdict.blocked) throw new Error("unreachable")
     expect(verdict.reason).toBe("failure")
   })
   ```
3. Les champs sémantiques discriminent toujours — deux `command` différentes ne produisent pas la
   même clé. Succès : `not.toBe`.
4. Le filtre est superficiel, pas récursif — forme **réelle** de l'outil `tasks`, dont la clé est
   `task: Patch` (`tasks.ts:57-62`) et `Patch.description` est déclaré à `tasks.ts:30` :
   `signature("tasks", { task: { description: "x" } })` diffère de
   `signature("tasks", { task: { description: "y" } })`. Succès : `not.toBe`. (La forme
   `{ updates: [{ description }] }` utilisée dans la version initiale de cette proposition est
   **fausse** : `tasks` n'a pas de champ `updates` ; un tel cas resterait vert sans jamais passer par
   une forme d'args qu'un outil émet réellement.)
5. Non-régression de la suite existante — `bun test src/tool/repetition.test.ts` reste entièrement
   vert. Succès : 0 échec, même nombre de tests qu'avant.
6. **Non-régression de la liste d'exclusion (ajouté au cycle 2, exigé par R2).** Le filtre ne doit
   retirer ni `summary`, ni `title`, ni `reason` au premier niveau : ces trois champs sont vérifiés
   **sémantiques** (§4) et les retirer produirait un faux blocage. Succès : trois `not.toBe`.

   ```ts
   test("the filter leaves verified-semantic top-level fields alone", () => {
     // `signature` treats the tool id as an opaque string, so plain labels are enough here.
     // `complete_objective` summary: TOP-LEVEL (CompleteParameters root, goal-contract.ts:435,
     // :573, :782) and persisted into goalState (:740) / rendered (:750).
     expect(ToolRepetition.signature("complete_objective", { summary: "A" })).not.toBe(
       ToolRepetition.signature("complete_objective", { summary: "B" }),
     )
     // `environment` title: required by recipe_save (environment.ts:156).
     expect(ToolRepetition.signature("environment", { title: "A", objective: "O" })).not.toBe(
       ToolRepetition.signature("environment", { title: "B", objective: "O" }),
     )
     // `workspace_handoff` reason: permission metadata (workspace-handoff.ts:119, :127).
     expect(ToolRepetition.signature("workspace_handoff", { reason: "A", path: "/p" })).not.toBe(
       ToolRepetition.signature("workspace_handoff", { reason: "B", path: "/p" }),
     )
   })
   ```

**Contrôle négatif (anti-test de mutation) :** réintroduire temporairement `description` dans
`stableStringify` au lieu de `signature`, ou neutraliser le `.filter`, doit faire échouer le cas 1
et le cas 2 ; étendre le `Set` à `summary`/`title`/`reason` doit faire échouer le cas 6. Un test qui
passe dans les deux sens ne prouve rien ; ce contrôle fait partie de la définition de « done ».

## 8. Effort

**XS** — un fichier, une fonction, dix lignes ajoutées et une constante d'une ligne, plus un fichier
de test (6 cas) ; aucune modification de schéma, de registre, d'outil, de type, ni de `record`.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — la correction et ses six tests sont spécifiés et vérifiables ; **un** point reste
à trancher par le validateur, explicité dans le corps :

1. **Sortie évolutive et compteur `failures`.** Ce lot choisit explicitement de **ne pas** remettre
   `failures` à zéro sur changement de digest, faute de digest disponible sur le chemin d'échec
   (`tool.ts:155`, `:179` → `{ ok: false, digest: "" }` ; `repetition.ts:161-168`). Le coût est
   explicité en §6 : une commande qui échoue 3 fois en évoluant est bloquée. Si ce coût est jugé trop
   élevé, le correctif consiste à faire porter un digest d'échec par `tool.ts` avant de remettre
   `failures` à zéro — un second lot, pas un ajustement de ce patch.

Tranché au cycle 2, donc **absent** de cette liste :

- **Périmètre de la liste d'exclusion.** Les quatre instances de premier niveau ont été vérifiées
  ligne à ligne (§4). `description` est sans effet sur le résultat → exclue. `title`, `summary` et
  `reason` sont sémantiques (exigence, persistance ou métadonnées de permission, avec consommateur
  cité) → conservées, exclusion refusée sur preuve. Il n'y a donc **pas** de lot 2 « à planifier »
  sur ces champs ; le cas 6 du §7 épingle cet ensemble pour qu'un ajout ultérieur de la liste soit
  détecté.
- **La mesure du brief est localisée et la thèse ne l'utilise pas.** Le libellé `[seen 390x]`
  provient de `C:\Users\jeanl\.config\opencodev2\plugin\failure-journal.mjs:335`, construit à partir
  de `recurring()` et injecté dans le prompt via `experimental.chat.system.transform` (`:325-343`) :
  c'est un texte de prompt, jamais une ligne du fichier `.jsonl`. Les « 1 252 entrées » du brief
  correspondent à un plancher de 1 253 lignes au `Get-Content` de ce fichier (recompté à 1 267 puis
  1 290 — fichier vivant, cf. §2 (g)), dont 138 occurrences de l'échec bash déterministe, chiffre
  stable sur les trois comptages, et **zéro** occurrence du motif `seen \d+x`, lui aussi stable.
