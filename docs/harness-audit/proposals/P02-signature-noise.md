# P02 — `description` dans la clé de signature rend `FAILURE_LIMIT` inatteignable

## 1. Problem

Le frein à boucle compare des appels d'outil sur l'intégralité de leurs arguments, y compris
un champ `description` libre et obligatoire que le modèle réécrit à chaque tour ; deux tentatives
du même échec ne produisent donc jamais la même clé, et le blocage au bout de trois échecs ne se
produit jamais.

## 2. Evidence

**(a) Le seuil existe et n'est pas atteignable en pratique pour les outils à `description`.**

`packages/opencode/src/tool/repetition.ts:43`

```ts
export const FAILURE_LIMIT = 3
```

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

**(d) `description` est obligatoire, libre, et n influence pas l'exécution.**

`packages/opencode/src/tool/shell/prompt.ts:11` (extrait) et `:29`

```ts
  bash: "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\n…
```

```ts
    description: Schema.String.annotate({ description }),
```

Les trois paramètres siblings sont `command`, `timeout`, `workdir`
(`packages/opencode/src/tool/shell/prompt.ts:24-28`) : `description` n'est ni lu ni utilisé par
l'exécution, il est seulement recopié dans les métadonnées de sortie
(`packages/opencode/src/tool/shell.ts:540-545`).

**(e) L'outil s'enregistre sous l'id de la famille shell, pas sous un id littéral.**

`packages/opencode/src/tool/shell.ts:350-351`

```ts
export const ShellTool = Tool.define(
  ShellID.ToolID,
```

**(f) Le point d'entrée du frein est bien le Tool.define de `tool.ts`.**

`packages/opencode/src/tool/tool.ts:153-155` (échecs de décodage, clés sur les args bruts) et
`:162` / `:179` / `:183-185` (chemin nominal) :

```ts
              const verdict = ToolRepetition.inspect(ctx.sessionID, id, args)
              if (verdict.blocked) return new RepeatedCallError({ tool: id, detail: ToolRepetition.explain(verdict) })
              ToolRepetition.record(ctx.sessionID, id, args, { ok: false, digest: "" })
```

**(g) Mesure sur le journal d'échecs de cette machine — la preuve fournie au brief n'est pas
reproductible.**

Commande : comptage sur `C:\Users\jeanl\.config\opencode\failure-journal\987d8a4073210e235a9ca87b42a0b429a5543723.jsonl`
(comptage de lignes, `Select-String` sur le motif littéral, `[regex]::Matches` sur `seen (\d+)x`).
Résultat : `JOURNAL_LINES=1253`, `JOURNAL_BASH1=138` lignes contenant
`bash exited with 1: (no output)`, `JOURNAL_SEEN_ENTRIES=0`.

Donc : le fichier contient bien 138 occurrences de l'échec bash déterministe (le chiffre « 1 252
entrées » est proche mais pas exact : 1 253), mais **la chaîne littérale `[seen 390x] …` n'y
existe pas** et le motif `seen (\d+)x` n'y apparaît aucune fois. Le compteur `seen` affiché dans
mon environnement provient d'une autre source que ce fichier.

`INFERE:` le compteur `seen Nx` agrégé par le harnais est produit par une source distincte du
fichier `.jsonl` cité (table d'agrégation en mémoire ou autre journal).
**Méthode de vérification** : `rg -n "seen " --glob "*.ts" packages/opencode/src` puis
`rg -n "failure-journal" --glob "*.ts" packages/opencode/src`, pour localiser l'écrivain et son
schéma d'agrégation, et comparer son format de sortie au libellé `[seen Nx]`.

**Ce que cette mesure change :** la conclusion de la section 1 ne s'appuie pas sur le journal.
Elle s'appuie sur (b)+(c)+(d) : un champ libre dans les args rend la clé non reproductible par
construction. Le journal n'est qu'un corroborant de fréquence, et son chiffre exact reste non
vérifié.

## 3. Mechanism

1. Le modèle émet un appel `bash` avec `{command, timeout?, workdir?, description}` — `description`
   est obligatoire (`shell/prompt.ts:29`) et libre en formulation (`shell/prompt.ts:11`).
2. `Tool.define` installe le frein sur **tout** chemin d'exécution (`tool.ts:127`), sans couche
   optionnelle : le module est un registre par session, actif inconditionnellement
   (`repetition.ts:67`, `:69`).
3. Avant d'exécuter, `tool.ts:162` appelle `ToolRepetition.inspect(ctx.sessionID, id, decoded)`.
4. `inspect` calcule `signature(tool, args)` (`repetition.ts:120`), c'est-à-dire
   `tool + "\u0000" + stableStringify(args)` (`repetition.ts:83`), qui sérialise **toutes** les clés
   non-`undefined`, triées (`repetition.ts:75-78`).
5. La clé inclut donc la formulation exacte de `description`. Le registre ne contient aucune entrée
   pour `(id, command, timeout, workdir, description_v2)`.
6. `inspect` rend `{ blocked: false }` (`repetition.ts:121`), l'appel part, la commande échoue de
   façon déterministe, et `record` (`tool.ts:179`) incrémente `failures` sur **une entrée
   orpheline** (`repetition.ts:161-163`).
7. Au tour suivant, le modèle réécrit `description` (autre formulation, même 5-10 mots) → nouvelle
   clé → `repetition.ts:121` court-circuite encore. `FAILURE_LIMIT - 1 = 2` n'est jamais atteint
   sur une même entrée.
8. Le ledger ne conserve que `WINDOW = 24` entrées (`repetition.ts:37`, éviction `:172-176`), donc
   l'entrée orpheline est de surcroît éjectée : la règle de failure est structurellement inopérante
   pour tout outil à champ descriptif libre, sans que l'utilisateur voie d'erreur.

Le même défaut s'applique, par le même chemin, à `task` : `description` y est un libellé de 3-5 mots
(`task.ts:53-55`) distinct de `prompt` (`task.ts:56-58`) qui, lui, est la charge utile et reste dans
la clé.

## 4. Proposal

**Choix : liste d'exclusion de clés de premier niveau, globale, limitée à `description` au premier
lot.** C'est la variante la moins risquée : une seule clé, un seul fichier, aucune édition
d'outschéma, aucune table d'ids à maintenir, aucun comportement modifié pour les outils qui n'ont
pas ce champ.

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

Pourquoi seulement `description`, et pourquoi au premier niveau :

- **Le filtre est superficiel, pas récursif.** `tasks` déclare `description` dans `Patch`
  (`tasks.ts:28`, `:30`), un champ d'item décrivant le contenu réel d'une tâche à écrire. Le filtre
  de `signature` ne touche que `args` lui-même, donc `Patch.description` reste dans la clé : aucune
  perte de discrimination sur `tasks`.
- **`description` est le seul champ de premier niveau, parmi ceux inventoriés, qui soit vérifiable
  comme non sémantique pour *tous* les outils qui le déclarent.** Pour la famille shell il n'entre
  dans aucun calcul (`shell/prompt.ts:24-29`) ; pour `task` il est redondant avec `prompt`
  (`task.ts:53-58`), qui reste dans la clé.
- **`prompt`, `title`, `reason`, `summary` sont volontairement conservés.** Ce sont des champs
  réels d'outils où ils décident du comportement : `prompt` est la consigne du sous-agent
  (`task.ts:56-58`) et le texte utilisateur du contrat d'objectif (`goal-contract.ts:63-65`,
  `:69-71`). Les retirer globalement fusionnerait deux tâches de sous-agents distinctes sous une
  même clé, produisant un **faux blocage** — régression de sûreté, pas gain.

**Inventaire des champs d'args purement descriptifs ou générés.** Source : balayage
`grep -E '^\s+(description|prompt|title|reason|note|summary|justification|comment|label|steps|objective)\s*:\s*Schema\.(String|optional|Array|Struct|Literals|Record)'`
sur `packages/opencode/src/tool/`. La colonne « sémantique » répond à une seule question : le champ
change-t-il l'effet de l'appel ? Seuls les champs non sémantiques sont retirés de la clé ; tous les
autres en sont exclus, y compris lorsqu'ils *paraissent* décoratifs.

| champ | déclarations | sémantique ? | décision |
| --- | --- | --- | --- |
| `description` (1er niveau) | `shell/prompt.ts:29` — obligatoire, formulation libre imposée par `shell/prompt.ts:11` ; `task.ts:53-55` — libellé de 3-5 mots | **Non.** Famille shell : les seuls champs lus sont `command`, `timeout`, `workdir` (`shell/prompt.ts:24-28`) ; `description` n'est jamais lue, seulement recopiée dans les métadonnées de sortie (`shell.ts:540-545`). `task` : redondante avec `prompt` (`task.ts:56-58`), qui reste dans la clé. | **Exclu de la clé, niveau 1** |
| `description` (imbriqué) | `tasks.ts:30`, dans `Patch` (`tasks.ts:28-38`) | **Oui.** Décrit le contenu réel d'une tâche écrite, à distinguer d'un autre contenu. | Conservé — le filtre est superficiel, non récursif |
| `prompt` | `task.ts:56-58` ; `goal-contract.ts:69-71` | **Oui.** Consigne du sous-agent ; texte utilisateur du contrat d'objectif. | Conservé |
| `objective` | `goal-contract.ts:63-65` | **Oui.** Contenu de l'objectif créé ou édité. | Conservé |
| `title` | `environment.ts:31` ; `workspace-handoff.ts:21` | **Non.** Libellé d'onglet (`environment`) ou de session (`handoff`) ; aucun calcul. | Conservé au lot 1 — voir l'arbitrage V1 |
| `reason` | `workspace-handoff.ts:19` ; `goal-contract.ts:470` (imbriqué) | **Oui** au top-level : le motif du transfert. `goal-contract.ts:470` est imbriqué dans un tableau, donc hors de portée du filtre. | Conservé |
| `summary` | `environment.ts:17` ; `goal-contract.ts:456` (imbriqué) | **Oui.** `goal-contract.ts:456` est le résumé d'un constat de finding, imbriqué dans `findings`. `environment.ts:17` est le résumé d'observation : non sémantique, laissé au lot 1. | Conservé — et hors de portée du filtre de niveau 1 |
| `steps` | `environment.ts:38-40` | **Oui.** Corps de la recette mémorisée. | Conservé |
| `scope`, `evidence`, `dod` | `goal-contract.ts:457-458`, `goal-contract.ts:469` | **Oui.** Portée, preuves, énoncé d'un DoD. | Conservés |

**Ce que le lot 1 corrige et ce qu'il laisse.** Corrigé : le chemin dominant, la famille shell
enregistrée sous `ShellID.ToolID` (`shell.ts:350-351`) et `task` (`task.ts:291-292`), qui
concentrent le volume d'échecs identiques. Non corrigé : `title` et `environment.summary`, qui
restent dans la clé et conservent le défaut. Ce lot est donc une **amélioration, pas une
invariant**.

Ce qui reste **inchangé**, et pourquoi :

- `stableStringify` (`:72-79`) : sa sémantique de tri et de filtrage `undefined` est correcte ; le
  filtre d'exclusion se place en amont, dans `signature`, pour ne pas affecter `Entry.args`
  (`repetition.ts:155`) qui alimente le texte d'explication `preview` (`:110-113`, `:129`). Le modèle
  doit continuer de voir les arguments qu'il a réellement envoyés.
- `FAILURE_LIMIT`, `REPEAT_LIMIT`, `WINDOW`, `MAX_SESSIONS` (`:37-46`) : la sémantique est bonne ;
  seul l'espace de clés était faux.
- Les schémas d'outils : rendre `description` optionnel déplacerait le problème vers le modèle et
  ne changerait rien à la clé tant que le champ est présent.
- `tool.ts` : aucune édition. `inspect`/`record` reçoivent les args décodés et la correction est
  interne à la clé.

**Refus serveur au-delà de N erreurs identiques sur un même `tool_call_id` : écarté, et
l'instrument disponible ne le permet pas.** `ctx.callID` est joint aux attributs d'observation
(`tool.ts:132`), mais c'est l'identifiant de *cette invocation* : deux tentatives identiques de la
même commande ont deux `callID` différents. Compter les échecs par `callID` donnerait 1 par clé et
ne dépasserait jamais N. Le besoin réel — « N échecs identiques malgré des args différents » — est
déjà couvert par la présente correction, qui rend la clé stable précisément dans ce cas. Il ne
s'agit donc pas d'une omission mais d'un mécanisme qui serait inerte.

## 5. Alternatives considered

**A. Table d'exclusion par id d'outil** (`{ shell: ["description"], task: ["description"] }`).
Rejetée comme lot initial. Les ids ne sont pas des littéraux dans le code : la famille shell
s'enregistre sous `ShellID.ToolID` (`shell.ts:350-351`) et `task` sous une constante locale
(`task.ts:291-292`), dont les valeurs exactes n'ont pas été résolues dans ce tour. Une table
clé-valeur introduirait un couplage fragile (un renommage d'id casse silencieusement le frein) et
n'apporte rien sur le lot 1, puisque `description` est en top-level et non sémantique partout où
il apparaît.

**B. Hacher uniquement les champs sémantiques déclarés** (liste blanche : `command`, `filePath`,
`path`, `pattern`, …). Rejetée. C'est une liste blanche, donc il faut la maintenir à chaque
nouvel outil ; un champ oublié **efface toute discrimination** et fait fusionner des requêtes
légitimes sous une clé, avec un faux blocage dès la 3ᵉ occurrence. Une liste noire de 1 entrée ne
peut pas faire échouer un outil absent de la liste.

**C. Normaliser le texte de `description`** (minuscules, ponctuation, troncature à N mots) avant
signature. Rejetée. La levée de bail est un problème de *stabilité de clé*, pas de similarité : un
modèle qui écrit « Tests unitaires » puis « Tests unitaires du module repetition » donnerait deux
clés distinctes. La normalisation ne garantit rien, alors que l'exclusion garantit l'égalité
quand elle est voulue.

**D. Compter les échecs par hachage de sortie d'erreur plutôt que par clé d'entrée.** Rejetée pour
ce lot. Le hachage de sortie existe déjà pour le chemin nominal (`tool.ts:183-185`,
`repetition.ts:165-167`) mais est explicitement écrasé à `""` sur les chemins d'échec
(`tool.ts:155`, `:179`) : les compteurs d'échec portent aujourd'hui sur les args, pas sur l'erreur.
Changer cette clé est un refonte du modèle de comptage, avec un impact sur la règle IDLE-OUTPUT,
pour un bénéfice nul une fois la clé d'entrée stabilisée.

## 6. Risks

- **Régression sur les tests existants.** `packages/opencode/src/tool/repetition.test.ts`
  (156 lignes) teste `signature` aux lignes 21-41 et `inspect`/`record` aux lignes 43-156. Les
  arguments utilisés sont `{ filePath, oldString, newString }` (`:16`) et
  `{ filePath, offset, limit }` (`:17`) : **aucun ne contient `description`**, donc aucun des
  jugements existants ne change et aucun n'a besoin d'être réécrit. C'est vérifiable par
  relecture, pas par présomption. Surfaces de régression secondaires, à exécuter sans modification
  attendue : `packages/opencode/test/tool/tool-define.test.ts`,
  `packages/opencode/test/tool/registry.test.ts`, `packages/opencode/test/tool/shell.test.ts`,
  `packages/opencode/test/tool/shell-output-prompt.test.ts`,
  `packages/opencode/test/tool/shell-launch-retry.test.ts`.
- **Coût en tokens : nul, mesurable par construction.** La signature n'entre jamais dans le prompt ;
  elle ne vit que comme clé d'un `Map` en mémoire (`repetition.ts:67`, `:69`, `:120`, `:147`). Le
  modèle ne voit donc ni chaîne supplémentaire ni champ supplémentaire.
- **Latence ajoutée : une projection d'objets par appel, soit O(nombre de clés d'entrée).** Pour
  la famille shell, 4 clés (`shell/prompt.ts:24-29`) : quelques dizaines de nanosecondes par appel
  d'outil, négligeable devant un aller-retour modèle. Je ne chiffre pas de pourcentage de latence
  sans banc : la mesure à produire est `bun run bench:test` (`package.json:17`) avant/après, sur le
  même jeu de tests.
- **Faux positifs plus fréquents.** C'est le vrai risque du correctif : `bash "bun test"` échoué 2
  fois sera désormais bloqué au 3ᵉ essai même si le modèle réécrit `description`. C'est le
  comportement voulu par `FAILURE_LIMIT` et conforme à l'en-tête du module
  (`repetition.ts:18-20`), mais cela touche `bash`, l'outil le plus utilisé. Atténuation : le texte
  d'erreur déjà produit (`repetition.ts:188-194`) ordonne explicitement de relire l'état et d'élargir
  les arguments, et la règle IDLE-OUTPUT (`:26-28`) garantit qu'un appel dont la sortie **change**
  n'est jamais bloqué (`:166`) : un `bun test` dont le nombre d'échecs évolue reste autorisé.
- **Sécurité — surface de contournement.** Aucun contournement de permission n'est possible : le
  frein ne remplace pas un contrôle d'accès, il refuse une exécution répétée
  (`tool.ts:163-164`). Aucun risque d'injection : la valeur retirée de la clé n'est jamais
  réinterprétée, seulement omise, et `stableStringify` reste le seul sérialiseur
  (`repetition.ts:72-79`). Un attaquant qui varie `description` pour Fool le frein n'existe plus
  après le correctif, ce qui est une **amélioration** de la résistance à l'abus de budget ; à
  l'inverse, un acteur malveillant pourrait utiliser `description` comme canal covert
  aujourd'hui — le correctif le supprime.
- **Limite de la correction, à assumer explicitement.** Un champ décoratif renommé ou ajouté par la
  suite réintroduit le défaut sans que rien ne le signale. Le remède est le test de non-régression
  en section 7, pas une garantie structurelle.

## 7. Tests

**Test unitaire à écrire : `packages/opencode/test/tool/repetition-signature.test.ts`** (nouveau
fichier ; `packages/opencode/test/tool/` existe et accueille déjà les tests d'outils —
`apply_patch.test.ts`, `shell.test.ts`, `tool-define.test.ts`, …). Emplacement retenu plutôt
qu'un ajout à `src/tool/repetition.test.ts` pour respecter le chemin exigé par le gabarit sans
dissocier le test de régression de la suite existante.

**Commande exacte**, depuis `C:\jeanluc\opencode-fork\packages\opencode` :

```
bun test test/tool/repetition-signature.test.ts
```

(`bun test` est bien le runner : `package.json:10` déclare `"test": "bun test --timeout 30000"`.)

**Cas, et critère de succès observable pour chacun :**

1. `description` ne change pas la clé — `signature("bash", {command:"bun test", description:"A"})`
   égale `signature("bash", {command:"bun test", description:"B"})`. Succès : les deux `toBe` passent.
2. La règle de failure devient atteignable — deux `record(..., { ok: false })` avec deux
   `description` différentes, puis `inspect` rend `blocked: true` et `reason: "failure"`.
   Succès : le 3ᵉ appel est refusé, alors qu'avant correctif il passait.
3. Les champs sémantiques discriminent toujours — deux `command` différentes ne produisent pas la
   même clé. Succès : `not.toBe`.
4. Le filtre est superficiel, pas récursif — `signature("tasks", { updates: [{ description: "x" }] })`
   diffère de `signature("tasks", { updates: [{ description: "y" }] })`. Succès : `not.toBe`.
5. Non-régression de la suite existante — `bun test src/tool/repetition.test.ts` reste entièrement
   vert. Succès : 0 échec, même nombre de tests qu'avant.

**Contrôle négatif (anti-test de mutation) :** réintroduire temporairement `description` dans
`stableStringify` au lieu de `signature`, ou neutraliser le `.filter`, doit faire échouer le cas 1
et le cas 2. Un test qui passe dans les deux sens ne prouve rien ; ce contrôle fait partie de la
définition de « done ».

## 8. Effort

**XS** — un fichier, une fonction, dix lignes ajoutées et une constante d'une ligne, plus un fichier
de test ; aucune modification de schéma, de registre ou d'outil.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — la correction et son test sont spécifiés et vérifiables, mais deux points
doivent être tranchés par le validateur :

1. **Périmètre de la liste d'exclusion.** Je ne propose d'exclure que `description`, parce que c'est
   le seul champ de premier niveau vérifié non sémantique partout où il apparaît. Les champs
   décoratifs des autres outils — `title` (`environment.ts:31`, `workspace-handoff.ts:21`), `reason`
   (`workspace-handoff.ts:19`), `summary` (`goal-contract.ts:436`, `environment.ts:17`) — restent
   dans la clé et conservent le défaut. Le validateur doit trancher : faut-il les traiter dans un
   lot 2 par table d'id (option A), au prix du couplage aux ids `ShellID.ToolID`
   (`shell.ts:351`) et à la constante locale de `task.ts:292` dont je n'ai pas résolu la valeur, ou
   les laisser en l'état ?
2. **La mesure fournie au brief n'est pas reproductible.** Le fichier journal cité contient 1 253
   lignes et 138 occurrences de `bash exited with 1: (no output)`, mais **zéro** occurrence du motif
   `seen (\d+)x` ; le libellé `[seen 390x]` et le compte « 1 252 » ne sont donc pas confirmés par
   cette source. La thèse de la proposition ne dépend pas de cette mesure, mais le validateur
   doit dire laquelle faire produire, et par quel script.