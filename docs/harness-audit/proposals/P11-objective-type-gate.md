# P11 — La barrière anti-clôture est conditionnée au type d'objectif, que le modèle choisit

> **Écart de chemin à signaler au coordinateur.** La matrice `docs/harness-audit/README.md:33`
> et le brief désignent `packages/opencode/src/session/goal-contract.ts:519`. Ce fichier
> n'existe pas. Le code réel est `packages/opencode/src/tool/goal-contract.ts`, et les
> numéros de ligne 519/530 tombent exactement dessus. Tous les « `:NNN` » de ce document
> sans préfixe renvoient donc à `src/tool/goal-contract.ts`, sauf mention explicite d'un autre
> fichier. Le chemin de la matrice est
> périmé et devra être corrigé au passage.

## 1. Problem

La seule barrière qui empêche un agent de clore son objectif en laissant un défaut grave
(`high`/`critical`) laissé `residual` ne s'applique que si l'objectif a été classé
« implementation » ; or ce classement est déduit d'une expression régulière appliquée au
texte libre de la mission, texte que le modèle rédige lui-même — reformuler la mission
désactive donc la garde.

## 2. Evidence

**E1 — la barrière est conditionnée au type d'objectif.** `src/tool/goal-contract.ts:524-532`

```ts
export function blockingResidualFindings(
  deliverable: string | undefined,
  findings: readonly GoalFinding[],
): GoalFinding[] {
  if (deliverable !== "implementation") return []
  return findings.filter(
    (finding) => finding.status === "residual" && (finding.severity === "high" || finding.severity === "critical"),
  )
}
```

**E2 — le type est un regex sur du texte libre, pas un champ déclaré.** `src/session/goal-state.ts:116-129`

```ts
const IMPLEMENTATION_HINTS =
  /(?<![a-z0-9])(implement|impl[ée]mente|corrige|corriger|fix|r[ée]pare|ajoute|...|improve|...)(?![a-z0-9])/i
...
export function inferDeliverable(text: string): GoalDeliverable {
  if (IMPLEMENTATION_HINTS.test(text)) return "implementation"
  if (PLAN_HINTS.test(text)) return "plan"
  if (AUDIT_HINTS.test(text)) return "audit"
  return "answer"
}
```

Le commentaire `:122-123` assume le choix : *« Conservative: only clear mutation verbs make it
an implementation, so closure is not over-blocked. »* La priorité est donnée aux verbes de
mutation, mais **tout texte sans verbe d'action est classé `answer`** — donc non bloqué.

**E3 — un seul écrivain pour `deliverable`, et il lit la source utilisateur.** `src/session/prompt.ts:2739`

```ts
deliverable: existing?.deliverable ?? inferDeliverable(sourceText),
```

`src/session/prompt.ts:2726-2730` montre que la goal est justement la première ligne non vide de
`sourceText` (sinon la chaîne de repli `« Continuer la tâche demandée par l'utilisateur »`).
`sourceText` est donc le prompt utilisateur brut : **le niveau de garde est fixé par l'utilisateur
ou par le modèle qui reformule, pas par un arbitrage interne du harnais.**

**E4 — le champ est optionnel et le chemin outils ne l'écrit pas.** `src/session/goal-state.ts:29`
`deliverable: Schema.optional(Schema.Literals(["answer", "audit", "plan", "implementation"]))`.
`src/tool/goal-contract.ts:199-222` (`nextGoalState`) ne construit aucune clé `deliverable` ; il
reprend `...previous`, donc un objectif créé ou réédité via `create_objective` /
`edit_objective` / `apply_contract_from_prompt` reste à `undefined`. Or E1 retourne `[]` dès que
`deliverable !== "implementation"` : **`undefined` désactive la garde.** `INFERE:` un
`edit_objective` qui remplace `objective` et `dod` sans repasser par `prompt.ts:2739` laisse
`deliverable` à sa valeur antérieure. Vérifier par : ajouter
`console.error(JSON.stringify(previous))` dans `completeToolDefinition` avant `:656`, créer un
objectif via `edit_objective`, puis lire `previous.deliverable` au refus.

**E5 — le refus qui en découle.** `src/tool/goal-contract.ts:671`
`« Completion refused: an implementation objective cannot close with high-severity findings left residual. »`

**E6 — le point d'appel unique.** `src/tool/goal-contract.ts:656`
`const blockingResidual = blockingResidualFindings(previous.deliverable, findings)`

**E7 — les DoD ne sont pas typés.** `src/tool/goal-contract.ts:44` et `:54`
`Schema.optional(Schema.mutable(Schema.Array(Schema.String)))`, sans descripteur par item.
`src/session/goal-state.ts:25` `dod: Schema.Array(Schema.String)`. Aucun item ne porte de
`kind`/`polarity` : le harnais ne peut pas distinguer un DoD « livrer le correctif » d'un DoD
« documenter l'audit » autrement que par le texte.

**E8 — le précédent de classification par texte de DoD existe déjà.** `src/tool/goal-contract.ts:509-517`
`DELIVERY_ONLY_DOD` + `isDeliveryOnlyDod()` + `evidenceGatedDodItems()`, consommés en `:598`
(`const dodItems = evidenceGatedDodItems(previous.dod ?? [])`). Le mécanisme proposé n'introduit
donc pas de famille nouvelle, il en réutilise une.

**E9 — garde-fous existants, à préserver intacts.** `:624` findings OPEN bloquent ;
`:643` jobs background en cours bloquent ; `:709` refuse `blocked` sans obstacle externe déclaré
par item ; `:723` refuse l'absence de preuve ; `:450` rend `evidence` obligatoire par item DoD.
`src/session/goal-evidence.ts:41` rétrograde en `open` tout `closed` sans preuve.

## 3. Mechanism

1. L'utilisateur énonce la mission. `ensureGoalState` (`src/session/prompt.ts:2731-2744`)
   construit le `GoalState` et pose `deliverable: existing?.deliverable ?? inferDeliverable(sourceText)` (`:2739`).
2. `inferDeliverable` teste `IMPLEMENTATION_HINTS` sur `sourceText` (`src/session/goal-state.ts:125`).
   Le texte contient-il un verbe de mutation ? non → `answer`/`plan`/`audit`.
3. L'agent travaille. Il découvre un défaut `critical` et le déclare `status: "residual"` dans
   l'appel `complete_objective` (`src/tool/goal-contract.ts:452-459` autorise explicitement
   `residual` comme statut).
4. `mergeGoalFindings` (`src/session/goal-contract.ts:607`) conserve le statut `residual` ; le
   finding n'est donc pas dans `openFindings`, donc le garde `:624` ne l'attrape pas.
5. Le garde `:643` passe (aucun job en cours).
6. `blockingResidualFindings(previous.deliverable, findings)` est appelé en `:656`. Avec
   `deliverable !== "implementation"`, la ligne `:528` renvoie `[]` → `blockingResidual.length === 0`
   → le garde `:657` est inerte.
7. La clôture passe les contrôles evidence (`:691-732`) et l'objectif est `completed` (`:734-748`).
8. **Bascule :** l'agent, au tour suivant ou après un `edit_objective`, formule la mission avec un
   verbe de mutation (`corriger`, `fix`, `rendre plus fiable`, …). `inferDeliverable` renvoie alors
   `implementation`, et la même clôture se fait refuser. L'agent « découvre » la garde et itère.
   Symétriquement, un objectif d'observation dont le DoD contient un verbe d'action est bloqué à tort.

Chemin d'évasion confirmé de bout en bout : l agent contrôle l'entrée de `inferDeliverable`
(E3) et, sur le chemin outils, la laisse à `undefined` (E4).

## 4. Proposal

**Règle inconditionnelle proposée :** la barrière s'applique dès qu'un item du **DoD** porte un
verbe d'engagement (livrer, corriger, réparer, déployer). Elle ne dépend plus d'aucun champ de
type d'objectif. Un audit dont le DoD est intégralement observationnel n'a aucun item
d'engagement et n'est jamais bloqué — c'est le **contenu contractuel**, et non un libellé de
type choisi par le modèle, qui commande.

Le DoD est-il typé ? **Non** (E7). Le correctif n'exige donc pas de changement de schéma : on
s'appuie sur le précédent `DELIVERY_ONLY_DOD` (E8), lui aussi un regex sur le texte d'un item de
DoD. Le typage des DoD (`{ text, kind: "commit" | "observe" }`) est une option de fond
discutée en §5.2, hors périmètre de la correction minimale.

**Fichiers modifiés :**

- `src/tool/goal-contract.ts` — remplacer `blockingResidualFindings` (`:519-532`) par la version
  ci-dessous ; mettre à jour l'appel `:656`.
- `src/tool/goal-contract.ts:653-655` — réécrire le commentaire d'intention.
- `src/tool/goal-contract.ts:671` — nouveau libellé de refus.
- `src/tool/goal-residual.test.ts:19-38` — réécrire (signature modifiée, cf. §6).

**Code cible** (2 blocs, 15 lignes au total) :

```ts
// Verbes d'engagement : l'item promet de livrer un changement, pas de le décrire.
const COMMITTING_DOD =
  /(?<![a-z0-9])(corrige|corriger|corrig|fix|r[ée]pare|r[ée]parer|livre|livrer|d[ée]ploie|r[ée]sout|livraison|ship|deploy|patch|int[ée]gre|assure|garantir|am[ée]liore|rends plus fiable|...)(?![a-z0-9])/i

export function blockingResidualFindings(
  dod: readonly string[],
  findings: readonly GoalFinding[],
): GoalFinding[] {
  const commits = dod.some((item) => !isDeliveryOnlyDod(item) && COMMITTING_DOD.test(item))
  if (!commits) return []
  return findings.filter(
    (finding) => finding.status === "residual" && (finding.severity === "high" || finding.severity === "critical"),
  )
}
```

Appel, `:656` : `const blockingResidual = blockingResidualFindings(previous.dod ?? [], findings)`

**Précédence explicite (anti-faux-positif).** Un DoD d'observation qui contient un verbe — cas
réel : *« Documenter comment corriger le bug de régression »* — serait bloqué à tort. Une
deuxième expression régulière est donc évaluée **en premier** et l'emporte :

```ts
const OBSERVATION_DOD = /(?<![a-z0-9])(documente|documenter|recense|recenser|liste|lister|identifie|identifier|constate|constater|audit|audite|report|d[ée]cri|decribe|explique|expliquer|inventorie|inventorier)(?![a-z0-9])/i
```

`hasCommittingDodItem(dod)` devient `dod.some(i => COMMITTING_DOD.test(i) && !OBSERVATION_DOD.test(i))` :
un item qui **nomme** la réparation est observé, un item qui **promet** la réparation est engagé.
C'est une heuristique ; elle est explicite, testée, et lisible dans un avertissement de refus.

**Ce qui reste volontairement inchangé :**

- `deliverable` / `inferDeliverable` sont conservés intacts. Ils pilotent d'autres comportements
  (`src/session/prompt.ts:2739`) et E4 montre qu'ils ne sont pas fiables ; les supprimer est hors
  périmètre. La garde n'y touche plus.
- Les cinq garde-fous E9 sont inchangés. En particulier `evidence` reste obligatoire (`:450`) :
  la règle proposée ne dispense d'aucune preuve, elle ajoute une condition de plus.
- `goal-evidence.ts:41` est inchangé : un `closed` sans preuve reste rétrogradé en `open`, donc
  bloqué par `:624`. La seule façon de neutraliser un finding reste donc de produire la preuve.

**Chemin de sortie anti-boucle.** Le refus n'est jamais un cul-de-sac ; chaque issue est une action
distincte de `complete_objective`, et le refus les énumère (`:673` déjà le fait pour le cas
courant). Les trois issues, dans l'ordre où le harnais les accepte :

1. **Fermer avec preuve** — `findings: [{ id, status: "closed", evidence: ["<artefact>"] }]`.
   `mergeGoalFindings` accepte le `closed` uniquement avec preuve (`goal-evidence.ts:41`).
2. **Décision de périmètre explicite** — `status: "out_of_scope"`. `src/tool/goal-residual.test.ts:31`
   existente montre déjà que `out_of_scope` n'est jamais bloquant : c'est une trace, pas un déni.
3. **Obstacle externe** — `outcome: "blocked"` + `unverified: [{ dod, reason }]`, contrôlé par `:709`
   (raison ≥ 12 caractères, un item non prouvé = un obstacle nommé).

**Décision de conception assumée :** modifier le DoD via `edit_objective` **ne déverrouille pas**
l'objectif, tant qu'un item d'engagement subsiste. Un agent ne peut donc pas s'auto-absoudre en
réécrivant son contrat. Le prix à payer est un aller-retour supplémentaire quand le DoD initial
était mal rédigé ; le remède est l'issue 2 ou 3, toutes deux tracées. Sans cette décision, le
correctif serait un contournement de plus.

## 5. Alternatives considered

**5.1 — Rendre `deliverable` un champ déclaré, non dérivé (ajouter `deliverable` à
`CreateParameters`/`EditParameters`).** Rejeté comme correctif *suffisant*. Le champ serait
toujours choisi par le modèle, donc la même reformulation du contrat désactive la garde. Il déplace le
problème sans le fermer. Utile comme durcissement complémentaire (empêcher un `answer` sur un DoD
d'engagement), mais pas comme unique correction.

**5.2 — Typer les items de DoD : `{ text: string, kind: "commit" | "observe" }`.** Rejeté pour ce
lot, **mais c'est la seule option qui ferme la faille de fond**. Un `kind` déclaré reste déclaré
par le modèle : le regex est contournable, un champ ne l'est pas. Rejeté parce que (a) E7 montre
que cela touche `CreateParameters`, `EditParameters`, `PromptParameters`,
`nextGoalState`, `goal-state.ts:25`, `serializeGoalStateCompressed`, l'injection de prompt et les
deux suites de tests, donc plusieurs lots ; (b) migration des états persistés existants, dont le
champ est `optional` (E4) ; (c) le harnais ne peut pas forcer un `kind` sans une authority de
validation qui n'existe pas aujourd'hui. **Si le validateur veut la fermeture durable plutôt que
le correctif minimal, c'est cette voie qu'il doit choisir.**

**5.3 — Supprimer la condition et toujours bloquer.** Rejeté : le contre-argument du brief est
fondé. Un audit dont le résultat *est* un inventaire de défauts graves se retrouve bloqué en
permanence, avec seulement trois issues dont deux consistent à réécrire l'historique. Cela crée
exactement le risque de boucle du point 3, et plus grave : `goal-state.ts:119-120` classe
explicitement l'audit comme un livrable à part entière.

**5.4 — Bloquer sur `deliverable === "implementation" || deliverable === undefined`.** Rejeté :
`undefined` est précisément l'état que produisent les outils (E4) et `answer` couvre le même
contrournement par reformulation. Le trou reste ouvert par le texte.

## 6. Risks

**Régression sur les tests existants — nominatif.** `src/tool/goal-residual.test.ts:19-38`
appelle `blockingResidualFindings("implementation", ...)` et `blockingResidualFindings(deliverable, ...)`
sur une liste de littéraux. Le changement de signature **casse ces assertions à la compilation**
(c'est le test le plus directement impacté, et il faut le réécrire, pas l'ajuster). Les assertions
`src/tool/goal-residual.test.ts:21-31` (high/critical bloquent, medium/low/open/closed/out_of_scope ne bloquent pas) sont
conservées telles quelles, seul l'argument change. `src/session/goal-deliverable.test.ts:6-22`
n'est pas touché : `inferDeliverable` reste inchangé. `src/tool/goal-contract.test.ts` doit être
exécuté en entier pour vérifier qu'aucun autre appelant n'existe.

**Faux positifs.** Un DoD d'observation contenant un verbe d'engagement bloque à tort.
Atténué par la précédence `OBSERVATION_DOD` (§4) ; reste une heuristique sur du texte libre, donc
 imparfaite dans les deux sens. Scénario le plus probable : DoD de style
*« Documenter puis corriger le cas de régression »` — il contient les deux verbes. La précédence
donne raison à l'item observé. Un DoD réellement mixte (observer **et** corriger) sera traité
comme observé : c'est une sous-bloque, à accepter.

**Coût tokens / latence.** Nul sur le prompt : aucune modification de prompt, aucune injection,
`inferDeliverable` reste appelé au même endroit. En clôture, une passe de regex sur une poignée
d'items de DoD courts (longueur typique 40-120 caractères) : négligeable devant le coût de
`mergeGoalFindings` (`JSON.stringify` de tous les findings, `goal-contract.ts:608`) et devant
`proofIsSubstantive` appelé sur chaque preuve (`:692`). Aucun aller-retour réseau. Deux regex
précompilées au niveau module : aucun coût de compilation par appel.

**Sécurité.** Le correctif **resserre** une barrière d'intégrité, il ne l'élargit pas : aucune
permission, aucun appel réseau, aucune écriture disque touchés. Le refus de garde est
informationnel (`responseResult`, `:666-676`), il n'écrit que le `goalState` déjà écrit par les
autres gardes. Pas de surface d'injection : les regex sont littérales, sans capture ni
interpolation de contenu utilisateur, sans quantificateur imbriqué ni alternance ambiguë — donc
pas de ReDoS. Aucun secret exposé. Les motifs reprennent la convention de
`goal-state.ts:117` (lookarounds explicites, car `\b` est ASCII et casse les verbes accentués :
`INFERE:` le fait que `\b` est ASCII se déduit de la lecture, pas d'une exécution ; vérifier par
`bun -e "console.log(/b/\b/.test('éb'))"` → attendu `false`).

**Risque résiduel non fermé (déclaré).** Un modèle qui rédige délibérément un DoD entièrement
observationnel pour un travail d'implémentation contourne encore la règle. La règle ferme la
reformulation *involontaire* et le trou `undefined` (E4) ; elle ne ferme pas l'**intention
malveillante**. Seule l'option 5.2 avec une autorité de validation ferme cela.

## 7. Tests

**Fichier à créer :** `packages/opencode/test/tool/goal-residual-commit.test.ts`

**Commande exacte :**

```
cd packages/opencode && bun test test/tool/goal-residual-commit.test.ts
```

**Critère de succès observable :** code de sortie `0`, `N/N` tests réussis, `0` échec.

**Cas, dont chacun est une assertion observable :**

1. DoD d'engagement + finding `critical` `residual` → `blockingResidualFindings` retourne 1 élément.
2. DoD d'engagement + finding `high` `residual` → 1 élément.
3. DoD d'engagement + `medium`/`low` `residual` → 0 élément (seuil de sévérité inchangé).
4. DoD d'engagement + finding `out_of_scope` `critical` → 0 élément (issue 2 toujours ouverte).
5. **DoD purement observationnel** (ex. `["Inventorier les failles de régression du module auth", "Rapporter les résultats avec citations fichier:ligne"]`) + finding `critical` `residual` → **0 élément** (c'est le contre-argument du point 2 : il tient).
6. **DoD observationnelOverrides engagement** (ex. `["Documenter comment corriger le bug de régression"]`) + `critical` `residual` → 0 élément (précédence `OBSERVATION_DOD`).
7. DoD contenant `undefined` / liste vide → 0 élément, **sans levée** (régression E4 : l'ancien code rendait `[]` pour `undefined`, le nouveau ne doit pas planter).
8. Item pur livraison (`« Rapport final de livraison »`) seul → 0 élément (réutilisation de `isDeliveryOnlyDod`, E8).

**Régression à exécuter en plus :**

```
cd packages/opencode && bun test src/tool/goal-residual.test.ts src/session/goal-deliverable.test.ts test/tool/goal-contract.test.ts
```

**Critère :** `goal-deliverable.test.ts` passe sans modification (prouve que `inferDeliverable` est
intouché) ; `goal-contract.test.ts` passe ; `goal-residual.test.ts` passe **après** réécriture des
arguments (§6).

## 8. Effort

**M** — la mécanique tient en ~15 lignes dans un fichier, mais la réécriture de
`goal-residual.test.ts`, la précédence anti-faux-positif et les 8 cas de test à tenir sont le
vrai coût ; aucune migration de données n'est requise.

## 9. Verdict self-assessment

**NEEDS_REVIEW**

Le défaut est **établi et le correctif minimal est vérifiable** : la garde est bien conditionnée à
un champ dérivé d'un regex sur du texte que le modèle contrôle (E1, E2, E3, E4), et la
substitution par un prédicat sur le **contenu du DoD** referme le chemin d'évasion principal en
réutilisant un mécanisme déjà présent dans le fichier (E8).

Ce qui exige un arbitrage humain, et que je ne tranche pas à la place du validateur :

**Question unique à trancher — un item de DoD est-il censé promettre une livraison, ou simplement
la nommer ?** Plus précisément : *un objectif d'implémentation dont le DoD est intégralement
rédigé en termes d'observation (« analyser », « documenter », « inventorier ») doit-il être
bloqué sur un finding `critical` `residual` ?*

- **Non** (position de cette proposition, `COMMITTING_DOD`) : correctif minimal, régression
  possible sur un DoD mal rédigé, boucle possible mais bornée à trois issues tracées. Effort M.
- **Oui** : il faut alors typer les DoD (§5.2) et/ou introduire une autorité de validation qui
  refuse un `kind: "observe"` incohérent avec le travail constaté. Effort L, migration des états
  persistés comprise, mais **faille réellement fermée** — y compris contre l'intention
  délibérée, que `COMMITTING_DOD` ne ferme pas (§6, risque résiduel).

Je recommande **Non + lot de typage des DoD en P11-bis**, mais la décision engage un lot de
migration : elle n'appartient pas au rédacteur.