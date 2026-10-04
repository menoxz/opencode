# P19 — `turn_plan` : autorégération d'autorité — **décision = ne rien changer**

> Révisé après verdict PASS_WITH_CHANGES du 2026-10-03 — critère de succès réordonné, sacrifice chiffré ou retiré (O1/O2/O3), O5 traitée

## 1. Problem

Le module `turn_plan` accorde à une déclaration qu'il n'a encore confrontée à
aucune observation l'autorité `execute`, qui transforme un tour sans action
exécutable en tour supplémentaire ; dans la même itération, l'appel de
`turn_plan` remet le compteur de budget d'inactivité à zéro, si bien que la
continuation est auto-accordée et son frein réarmé par ce qui la demande.

## 2. Evidence

**Le défaut est réel et localisé à une ligne.**

`packages/opencode/src/session/prompt.ts:1866-1872`

```ts
            const commitment = TurnPlan.reminder(sessionID)
            if (commitment) {
              // First sighting: the plan predicted this step, so restate it as the
              // standing commitment instead of judging an observation that does not
              // exist yet.
              turnPlanCapsules.push(TurnPlan.renderCommitment(commitment))
              declaredIntent = "execute"
```

Le commentaire admet que l'observation n'existe pas encore ; le code retourne
`"execute"`. Les deux seules affectations de `declaredIntent` sont
`prompt.ts:1872` (ce chemin) et `prompt.ts:1885`
(`TurnPlan.declaredIntent(...)`, chemin « settlement », où le plan **a** été
confronté à la sortie des tools). La variable est déclarée `undefined` en
`prompt.ts:1864`.

**L'autorité obtenue est exactement celle que le module s'interdit.**

`packages/opencode/src/session/turn-plan.ts:23-25`

```ts
// Authority is the lowest of the loop. The plan may only refine the ambiguous
// "no executable action" case while the idle budget allows; it can never relax a
// wait, a user question, the step limit, or a safety stop.
```

**Et c'est cette autorité qui empêche l'arrêt.**

`packages/opencode/src/session/continuation.ts:77-81`

```ts
  if (input.nextAction.kind === "none") {
    if (input.declaredIntent !== "execute") return { action: "stop", reason: "no-executable-action" }
    if (input.idleContinues >= (input.limit ?? AUTO_CONTINUE_LIMIT)) return { action: "stop", reason: "idle-budget" }
    return { action: "continue", reason: "declared-intent" }
  }
```

**Le frein `idle-budget` est réarmé par ce qui le consomme.** Dans le même bloc,
`prompt.ts:1853-1857` calcule `hasToolCalls` et remet `idleContinues` à zéro dès
qu'un tool call est présent ; `prompt.ts:1872` accorde ensuite `"execute"` ;
`continuation.ts:79` compare donc `0 >= 4`, ce qui est faux. Un appel
`turn_plan` est un tool call : chaque déclaration remet son propre compteur à
zéro juste avant de le consommer.

**Toutes les bornes survivent par ailleurs** (correction O5.2). `continuation.ts:5`
fixe `AUTO_CONTINUE_LIMIT = 4`, `continuation.ts:71` arrête sur
`stepLimitReached`, `continuation.ts:74-76` arrête sur `await_tool`, `ask_user`
et `report`, `continuation.ts:82` referme le cas `execute`/`retry`. La boucle
n'est donc **pas** « réellement non bornée » : cette formulation de la version
initiale était excessive et est **retirée**. L'énoncé exact, plus étroit et
exact, est : *chaque déclaration remet `idleContinues` à zéro, donc le budget
d'inactivité ne peut pas atteindre 4 tant que le modèle déclare*.

**Le protocole est injecté par le code, pas par une configuration opérateur.**
`packages/opencode/src/session/turn-plan.ts:210` (`instruction()`) construit
`<turn_plan_protocol>` et `prompt.ts:1887` le pousse **inconditionnellement** dès
que le protocole est actif ; `prompt.ts:1753` calcule l'activation une fois par
run via `TurnPlan.enabled({ flag, config })`, dont l'unique implémentation est
`turn-plan.ts:200-202` (`return input.flag || input.config === true`). La config
ne fait donc que basculer un booléen : `packages/opencode/src/config/config.ts:340`
(`… Default: false.`). Aucun levier opérateur n'existe pour adoucir le texte
injecté.

**Bornes et عضamences du module, citées pour ce qui reste inchangé.**
`turn-plan.ts:40` (`MAX_SESSIONS = 200`), `turn-plan.ts:27`
(`MAX_FIELD_CHARS = 240`), `packages/opencode/src/tool/registry.ts:410`
(enregistrement conditionnel de l'outil), `prompt.ts:1755` (purge de tout plan
antérieur au début d'un run), `packages/opencode/src/session/message-v2.ts:322`
(`turn_plan` parmi les entrées élidables au rejeu).

**La contradiction interne du protocole est réelle et n'est pas levée.**
`turn-plan.ts:213` (« On every turn, declare with the `turn_plan` tool the BATCH
this turn delivers ») contre `turn-plan.ts:218` (« Declare only what genuinely
remains: a plan that restates a step you could have completed wastes the turn. ») :
même tableau, lignes 5 et 11. Tranchée en section 4.4.

**Le module est opt-in et désactivé par défaut.** `config.ts:340`,
`turn-plan.ts:200-202`, `registry.ts:410`. Les appels observés sur le parc
prouvent que l'opérateur l'a explicitement activé : ce n'est pas une fuite, c'est
un coût choisi.

### 2.1 Grandeurs mesurées sur base, et leur statut probatoire

La révision précédente a mesuré sur
`C:\Users\jeanl\.local\share\opencodev2\opencode.db`, table `part`, fenêtre de
7 jours ancrée sur `MAX(time_created)` = 1 791 062 004 630, par un agent
indépendant de l'auteur.

**Statut : `HÉRITÉ`.** Ces valeurs ne sont **pas re-mesurées dans cette
révision** — le mandat impose `read` seul, sans shell. Elles sont conservées
comme ordres de grandeur, jamais comme seuil d'acceptation.

| Grandeur | Valeur (héritée) |
| --- | --- |
| appels `turn_plan` | 5 126 (102 sessions) |
| plans distincts (`intent`+`expect`) | 5 111 → 99,71 % |
| déclarations strictement identiques à la précédente (même session) | **8 (0,16 %)** |
| `intent` identique, `expect` affiné | 11 (0,21 %) |
| tours assistant porteurs d'au moins un appel | 5 125 |
| tours assistant porteurs d'une part texte | 5 941 |

Un seul triplet est retenu dans tout le document : **5 126 appels / 5 941 tours
porteurs d'une part texte = 0,863 appel par tour**, population = messages
assistant ayant au moins une part texte dans la fenêtre. Les deux autres
triplets de la version initiale (4 368 / 6 955 « étapes », 4 863 / 7 444
« messages ») sont **retirés** : leurs dénominateurs n'étaient pas définis, et le
premier est justement le ratio invalide que le verdict sanctionne en O1.

**« 70 % des étapes se terminent par un `turn_plan` » est indécidable sur cette
base** (correction O4). 0,705 est un **nombre d'appels par tour**, pas une part
de tours finissant par une déclaration. Rien dans le code n'installe un
invariant « un appel `turn_plan` par message assistant » : `registry.ts:410`
enregistre l'outil sans contrainte, et le protocole demande explicitement des
appels groupés (`turn-plan.ts:213`, « parallel tool calls », verrouillé par
`turn-plan.test.ts:176-179`). Deux déclarations dans un même tour sont légales.
**INFERE :** croiser premier et dernier tool call d'un tour exigerait
`hasToolCalls` (`prompt.ts:1853`) et `lastAssistant?.finish` (`prompt.ts:1899`)
par tour, donc un état d'exécution instrumenté, pas une requête SQL.
Vérification : instrumenter la boucle comme en section 7.1.

**« premier poste d'usage après `bash` » est retiré** (correction O5.1).
`docs/harness-audit/README.md:31` donne pour `bash` « 71 % **des appels** » ;
`docs/harness-audit/README.md:41` donne pour `turn_plan` « 0,70 appel par
étape ». Ce sont deux unités différentes — une part d'appels et un ratio par
tour — et elles ne se comparent pas.

**Le sacrifice de la ligne 1872 est chiffrable en borne, pas en fréquence, sur
le code seul.** Trois faits vérifiés ce jour suffisent à le borner :

1. `prompt.ts:1910-1916` conditionne l'appel à `decideRunDecision` par
   `!hasToolCalls` ; `prompt.ts:1920` en tire `nextAction: { kind: hasToolCalls
   ? "await_tool" : "none" }`. Le cas `"none"` de `continuation.ts:77-81` est
   donc **atteint exclusivement** sur des tours sans tool call.
   **Conséquence : pour le sacrifice, `(Q) ≡ (R)`** — le compte demandé par le
   verdict (« `reason === "declared-intent" && hasToolCalls === false` ») n'est
   pas un sous-ensemble de `(R)`, c'est **tout** `(R)`. Il n'existe aucune
   poursuite `declared-intent` avec tool calls à protéger.
2. `turn-plan.ts:97-99` : `reminder()` rend la main une seule fois (il pose
   `reminded = true`) ; `turn-plan.ts:127` supprime l'entrée à `settle()`.
   **Une déclaration produit donc au plus une poursuite `declared-intent`** :
   `(R) ≤ nombre de déclarations`. Sur le parc hérité, la borne est donc
   ≤ 5 126 par semaine.
3. `turn-plan.ts:121-134` et `turn-plan.ts:142-148` décrivent la consommation et
   la décision de règlement ; `prompt.ts:1885` est le seul appelant.

Ces trois bornes sont **structurelles**, pas statistiques : elles valent pour
tout corpus, présent ou à venir. Aucune n'est un substitut à la fréquence.

## 3. Mechanism

1. `runLoop` calcule `turnPlanEnabled` une fois par run — `prompt.ts:1753` — puis
   purge tout plan antérieur (`prompt.ts:1755`) : l'état ne survit pas au run.
2. Chaque itération, si le protocole est actif, `TurnPlan.reminder(sessionID)` est
   appelé — `prompt.ts:1866` — et ne rend la main qu'une fois par entrée
   (`turn-plan.ts:95-100`).
3. Chemin « premier sighting » (`prompt.ts:1867-1872`) : la capsule
   `renderCommitment` est poussée en queue — le segment système caché reste
   identique octet pour octet — et `declaredIntent = "execute"` (`:1872`), sans
   aucune lecture d'observation.
4. Chemin « settlement » (`prompt.ts:1873-1886`) : les sorties des tool parts du
   dernier assistant sont concaténées, `settle()` compare à `expect` via
   `expectationMatches` (`turn-plan.ts:121-134`), puis `declaredIntent` vaut
   `"none"` si confirmé et `"execute"` si manqué (`prompt.ts:1885` →
   `turn-plan.ts:142-148`).
5. `decideRunDecision` reçoit le signal — `prompt.ts:1920-1931`,
   `continuation.ts:77-81`. `declaredIntent === "execute"` transforme
   `nextAction.kind === "none"` en `continue`, raison `declared-intent`,
   `idleContinues` est incrémenté (`prompt.ts:1929`) et l'événement est journalisé
   en clair (`prompt.ts:1931`).
6. Un `declare()` (`turn-plan.ts:69-80`) réarme `reminded: false` et remplace
   l'entrée ; l'entrée est supprimée à `settle()` (`turn-plan.ts:127`). Retour en
   étape 2.

Boucle fermée : déclaration → `reminded = false` → étape suivante forcée → au
moins une requête fournisseur supplémentaire → préfixe rejoué.

## 4. Proposal

**Aucun fichier n'est modifié. La décision est de ne rien changer, et elle est
démontrée, pas supposée.**

### 4.1 O1 — critère de succès réordonné : des grandeurs monotones, jamais un ratio

Le verdict a raison : tout ratio dont le dénominateur est un coût que le patch
réduit est invalide par construction. La Partie A supprime ~une itération par
déclaration ; le dénominateur baisse ; le ratio monte **sur un succès**. Cette
famille de critère est **interdite** dans ce document.

Les trois grandeurs monotones retenues, toutes déjà journalisées ou déjà
comptees :

| # | Grandeur | Site | Sens attendu après correctif |
| --- | --- | --- | --- |
| G1 | tours où `decision.reason === "declared-intent"` | `prompt.ts:1931` | **→ 0** |
| G2 | nombre total d'étapes | `prompt.ts:1948` (`step++`) | ne croît pas |
| G3 | total `cache_read` | journal de session | ne croît pas |

**G1 est le critère de succès. Il échoue avant et passe après**, et c'est la
seule preuve directe que la cause visée a été supprimée :

- **Avant le correctif** : `count(reason === "declared-intent") > 0` dès que le
  corpus de rejeu contient au moins un arrêt texte suivant une déclaration.
  Le critère est donc **ÉCHOUÉ** sur le code actuel — il énonce un état que le
  code courant ne satisfait pas.
- **Après le correctif** : ce compte est **nul** par construction, la ligne
  `prompt.ts:1872` ayant disparu et `declaredIntent` restant `undefined` sur ce
  chemin — état que `turn-plan.ts:146` traite déjà comme « le harnais garde sa
  propre inférence », sans changement sur le chemin « settlement »
  (`prompt.ts:1885`).
- **Cas limite, énoncé pour ne pas tricher** : si le corpus de rejeu donne
  `(R) = 0` **avant** le correctif, G1 est **sans objet** sur ce corpus et la
  Partie A n'est **pas** justifiée par lui. Un critère qui passe avant et après
  ne prouve rien.

G2 et G3 sont des **contrôles de non-régression**, pas des critères de succès :
une variation de G2 sans variation de G1 signalerait que `declaredIntent` n'était
pas la cause, et invaliderait le correctif.

### 4.2 O2 — sacrifice : la mesure est spécifiée, la borne est chiffrée, le gain n'est pas retenu

Le verdict a raison sur le fond : la version précédente tranchait un arbitrage
de qualité et le présentait comme une mesure. **L'affirmation qualitative
« aucun risque de régression » est retirée** : elle n'est pas mesurée et ne peut
pas l'être ici.

Ce qui remplace l'affirmation retirée, et qui est vérifiable :

1. **Méthode de mesure, exacte.** Déployer un build instrumenté de
   `prompt.ts` qui écrit un événement par passage dans `prompt.ts:1920-1931`,
   portant `sessionID`, `step`, `reason`, `hasToolCalls` (`prompt.ts:1853`),
   `declaredIntent` (`prompt.ts:1864`), `lastAssistant?.finish`
   (`prompt.ts:1899`). Compter sur 7 jours et par session :
   - **(R)** `reason === "declared-intent"` — le sacrifice ;
   - **(Q)** `reason === "declared-intent" && hasToolCalls === false` — le risque
     de régression du verdict ;
   - **(E)** `reason === "executable-action" | "retry" | "pending-tools"` — le
     contrôle (`continuation.ts:48`, `:49`).
2. **Identité vérifiée, pas seulement borne :** d'après `prompt.ts:1910-1916` et
   `prompt.ts:1920`, **`(Q) ≡ (R)`**. Le risque de régression n'est pas une
   fraction de `(R)` : c'est la totalité de `(R)`. Toute la charge de la mesure
   porte donc sur un seul compteur.
3. **Borne structurelle chiffrée :** `(R) ≤ nombre de déclarations`, une
   déclaration ne pouvant produire qu'une poursuite
   (`turn-plan.ts:97-99`, `turn-plan.ts:127`). Sur le parc hérité : **≤ 5 126
   par semaine** au maximum théorique, aucune occurrence n'étant mesurée.
4. **Fréquence réelle : non mesurée, et non estimée.** Cette révision n'a ni
   shell ni accès à la base. Aucune inférence de fréquence n'est tirée des
   valeurs héritées, et **aucun gain n'est annoncé**.

**Ce qui en décide la non-livraison.** Le verdict conditionne la Partie A au
chiffre de `(Q)` et prescrit « sans ce chiffre, livrer B seule ». B est
elle-même retirée par la mesure de la section 2.1 (8 déclarations identiques sur
5 126, soit 0,16 % : gain maximal huit appels par semaine, incompatibility avec
un coût d'entretien). **La consigne ramène donc à zéro : rien n'est livré.** Ce
n'est pas un arbitrage de qualité : c'est l'absence de toute voie livrable une
fois A et B écartées, chacune pour une raison mesurable.

### 4.3 O3 — sans objet : le court-circuit de déduplication n'existe pas dans ce dépôt

O3 décrit un code absent. `declare()` relu en entier ce jour,
`packages/opencode/src/session/turn-plan.ts:69-80` :

```ts
export function declare(sessionID: string, plan: TurnPlan, step?: number): TurnPlan | undefined {
  const normalized = normalize(plan)
  if (!normalized) return undefined
  // Re-insert so the eviction order below follows recency, not first write.
  plans.delete(sessionID)
  if (plans.size >= MAX_SESSIONS) {
    const oldest = plans.keys().next()
    if (!oldest.done) plans.delete(oldest.value)
  }
  plans.set(sessionID, { plan: normalized, step, declaredAt: Date.now(), reminded: false })
  return normalized
}
```

Aucune sortie anticipée avant `plans.delete` (`:73`) : la ligne
`if (live && JSON.stringify(live.plan) === JSON.stringify(normalized)) return live.plan`
reproduite en O3 **n'est pas dans le fichier**. `plans.delete` précède toujours
`plans.set` (`:78`), donc l'ordre de récence documenté à `:72` est respecté par
construction. La régression O3 est **sans objet**, et non « corrigée » : rien
n'ajoute de déduplication, donc rien ne peut casser la récence. Conséquence à ne
pas perdre de vue : la proposition ne s'appuie pas sur O3 pour justifier quoi que
ce soit.

### 4.4 O5.3 — l'instruction `turn-plan.ts:213` est tranchée ici, pas reportée

**Décision : `turn-plan.ts:213` reste inchangée.** Trois raisons citées :

- elle est **verrouillée par un test** : `turn-plan.test.ts:176-179`
  (`expect(instruction()).toContain("On every turn")`) ;
- elle est **injectée sans condition** par le code (`prompt.ts:1887`), donc
  aucun levier opérateur ne peut l'adoucir ;
- `renderCommitment` et le protocole sont la fonction même de la brique : les
  adoucir détruirait ce qu'elle mesure.

**La phrase « le correctif le plus rentable en surface » est retirée** : elle
n'est pas soutenable, l'adoucissement supposant de casser `turn-plan.test.ts:176-179`.

La contradiction avec `turn-plan.ts:218` est donc **acceptée et consignée** comme
constat ouvert en section 9. Elle n'est pas levée, et aucun levier ne lui est
associé dans ce document. Le point est **tranché** : il ne reste pas ouvert à un
arbitrage ultérieur.

**Inchangé volontairement :** la purge par run (`prompt.ts:1755`), la borne
`MAX_SESSIONS = 200` (`turn-plan.ts:40`), l'appartenance de `turn_plan` aux
entrées élidables au rejeu (`message-v2.ts:322`), `instruction()`
(`turn-plan.ts:210`), la récence d'éviction (`turn-plan.ts:72-78`), et la
fonction pure `declaredIntent()` (`turn-plan.ts:142-148`). Aucune n'a de rapport
avec l'autorité de la ligne 1872.

## 5. Alternatives considered

**Partie A — supprimer `declaredIntent = "execute"` à `prompt.ts:1872`.** Une
ligne supprimée, un commentaire remplacé, effort `XS`. **Non livrable.** Motif
chiffré : le sacrifice est borné structurellement (section 4.2) mais sa
fréquence n'est pas mesurée ; le verdict subordonne la livraison à ce chiffre, et
prescrit B seule en son absence ; B est elle-même sans rendement mesurable.
Maintenue ci-dessous comme **option re-soumettible**, avec sa condition de
réouverture en section 7.

**Partie B — déduplication : ne pas déclarer un plan identique au précédent.**
Rejetée sur mesure, après avoir été la proposition initiale : 8 déclarations
strictement identiques sur 5 126 (0,16 %) et 11 affinés (0,21 %). Gain maximal :
**huit appels par semaine**. Du code qui supprime huit appels par semaine serait
un coût d'entretien sans bénéfice. Le raisonnement de la version initiale —
« plans répétés » — est réfuté par la base.

**Cadence — obligation tous les N tours au lieu de chaque tour.** Rejetée. Le
plan est consommé exactement une fois (`turn-plan.ts:127`) et `declaredIntent`
n'existe que sur les deux étapes de sa vie. Espacer les déclarations crée des
fenêtres où `reminder()` ne rend rien et `settle()` ne rend rien : le mécanisme
perd ses deux seuls signaux, ceux que la brique existe pour produire. Le
sacrifice porte sur la fonction, pas sur le coût.

**Budget plafonné par session.** Rejetée. Le modèle n'a aucune raison de savoir
à quel tour du plafond il se trouve ; il déclare, reçoit un refus, et dépense un
tour de plus. Le plafond convertirait un coût en tokens invisible en un coût en
tours visible. De plus `declare()` remplace et n'accumule pas
(`turn-plan.ts:64-68`) : un plafond n'a rien à plafonner.

**Adoucir « On every turn » (`turn-plan.ts:213`).** Rejetée, voir section 4.4.

**Ne rien changer.** **Retenue.** C'est la seule des cinq qui ne dépende d'aucune
grandeur non mesurée, et la seule que la consigne du verdict laisse ouverte une
fois A et B écartées. Elle ne solde pas le défaut — la ligne 1872 reste
l'infraction à `turn-plan.ts:23-25` — mais elle refuse de la corriger sans
mesure.

**Objections du validateur, traitement chacune.**

- **O1 — traitée, corrigée.** Le critère 0,628 et tout ratio à dénominateur
  coût-réducteur sont **supprimés** ; le critère est désormais G1
  (`declared-intent` → 0), qui **échoue avant** et **passe après**, avec son cas
  limite énoncé (section 4.1).
- **O2 — traitée par retrait de l'affirmation et chiffrage de la borne.** Le
  « risque qualitatif » est retiré ; il est remplacé par la méthode exacte, par
  l'identité vérifiée `(Q) ≡ (R)`, et par la borne structurelle
  `(R) ≤ nombre de déclarations`. La Partie A n'est pas livrée, conformément à la
  consigne « sans ce chiffre, livrer B seule », et B étant sans rendement, rien
  n'est livré.
- **O3 — écartée sur le code.** `declare()` (`turn-plan.ts:69-80`) ne contient
  aucun court-circuit de déduplication ; `plans.delete` (`:73`) précède toujours
  `plans.set` (`:78`). Le défaut décrit n'existe pas dans ce dépôt.
- **O4 — traitée.** « 70 % des étapes se terminent par un `turn_plan` » est
  retiré ; un seul triplet est retenu (0,863 appel par tour, dénominateur
  défini), et les valeurs héritées sont marquées comme telles.
- **O5 — traitée en ses trois points.** (1) « premier poste d'usage après `bash` »
  retiré, `README.md:31` et `README.md:41` étant dans deux unités différentes ;
  (2) « réellement non bornée » retiré, bornes survivantes citées
  (`continuation.ts:5` via `:79`, `:71`, `:74-76`, `:82`) et l'énoncé réel
  réécrit ; (3) l'instruction `turn-plan.ts:213` **tranchée** en section 4.4, et
  le renvoi erroné à la « section 9, point 2 » supprimé.

## 6. Risks

Aucun correctif n'étant livré, aucune régression n'est introduite. Les risques
ci-dessous sont ceux **de l'état actuel**, que ce dossier laisse en place, et
ceux de la réouverture.

- **Régression sur les tests existants : aucune**, rien n'est modifié.
  `packages/opencode/src/session/turn-plan.test.ts:34-40` (« replaces the previous
  plan ») déclare `"first"` puis `"second"` ; `:42-50` (éviction) déclare `"old"`
  puis des `"new"` distincts, et ne passe par aucun chemin de déduplication ;
  `:108-123` teste `declaredIntent()` — la fonction pure de
  `turn-plan.ts:142-148`, que la ligne 1872 ne touche pas ; `:176-179` teste
  `instruction()`. `packages/opencode/test/session/message-v2.test.ts:1706` teste
  le rejeu d'une part `turn_plan`. Aucun de ces fichiers n'énonce la poursuite
  garantie par `declaredIntent` : **la suite ne peut pas, à elle seule, détecter
  la régression que la Partie A créerait.** C'est un argument de plus contre une
  livraison sans mesure, et la raison pour laquelle le critère de succès est un
  compteur de parc et non un test unitaire.
- **Coût en tokens / latence du dossier « ne rien changer » : le statu quo.**
  5 126 appels `turn_plan` sur 7 jours (hérité, non re-mesuré ici). Les
  `cache_read` de la semaine ne sont pas re-mesurés dans cette révision.
  **Aucun chiffre de surcoût n'est annoncé ici** : l'énoncé d'origine estimait
  160 tokens de sortie par appel, non mesuré, et P10
  (`proposals/P10-token-estimation.md`) porte précisément sur la fiabilité des
  conversions caractères/tokens — raison pour laquelle aucune conversion n'est
  employée comme critère dans ce document.
- **Sécurité : aucun risque ajouté, un risque laissé en place.** La ligne 1872
  est le levier le plus large du module : un modèle peut s'accorder à lui-même
  l'autorité qui empêche l'arrêt. Aucune permission, aucun contournement, aucune
  injection n'est en jeu de ce côté, et les garde-fous (`continuation.ts:71`,
  `:74-76`, `:82`) sont indépendants du chemin `declaredIntent`.
- **Risque de la décision elle-même :** ne rien changer laisse en place une
  continuation auto-accordée dont le frein est réarmé par ce qui le consomme
  (section 2). Le risque est celui du statu quo, borné par `stepLimitReached`
  (`continuation.ts:71`) et par la limite de pas de l'agent, et entièrement
  réversible : la correction est une ligne.
- **Risque de méthode :** en acceptant « ne rien changer » sur l'impossibilité
  d'une mesure de fréquence, on accepte de ne pas corriger une infraction réelle.
  C'est un arbitrage **explicite, daté, et chiffré en borne** (section 4.2), avec
  une condition de réouverture (section 7) — pas une clôture.

## 7. Tests

Aucun test n'est écrit : aucun correctif n'est livré. Les points ci-dessous sont
les conditions de réouverture, et sont exécutables tels quels.

### 7.1 — La mesure du sacrifice, seule voie vers la Partie A

Instrumenter `packages/opencode/src/session/prompt.ts` pour écrire un événement
à chaque passage dans `prompt.ts:1920-1931`, contenant `sessionID`, `step`,
`reason`, `hasToolCalls` (`prompt.ts:1853`), `declaredIntent` (`prompt.ts:1864`)
et `lastAssistant?.finish` (`prompt.ts:1899`). Compter sur 7 jours et par session
les trois grandeurs `(R)`, `(Q)`, `(E)` définies en section 4.2.

**Contrainte structurelle à respecter dans la mesure :** `(Q) ≡ (R)`
(`prompt.ts:1910-1916`, `prompt.ts:1920`). Un instrument qui rapporte `(Q) < (R)`
signale un bug dans l'instrument, pas dans le harnais.

**Règle de décision, pré-registrée :** la Partie A n'est livrée que si
l'opérateur fixe **avant** l'exécution le seuil de `(Q)` qu'il accepte comme
taux d'exécutions écourtées, **et** que ce seuil est tenu à l'identique sur le
corps de sessions de comparaison. Sans seuil fixé à l'avance, le dossier reste
« ne rien changer » : c'est la correction 2 du verdict, appliquée telle quelle.

### 7.2 — Critère de succès du futur correctif : échoue avant, passe après

Aucun ratio n'est employé (section 4.1).

1. **G1 — critère de succès, seul criterion opposable :**
   `count(reason === "declared-intent")` sur le corps de rejeu vaut **0** après
   le correctif. **Avant le correctif il est > 0** et le critère est donc
   **ÉCHOUÉ** ; après, il est **atteint**. Si la mesure de 7.1 donne `(R) = 0`
   avant le correctif, ce critère est **sans objet** sur ce corps et la Partie A
   n'est pas justifiée par lui.
2. **G2 — contrôle :** le nombre total d'étapes (`prompt.ts:1948`) ne croît pas.
3. **G3 — contrôle :** le total `cache_read` ne croît pas.

Une variation de G2 ou G3 sans variation de G1 invalide le correctif.

### 7.3 — Verrou de non-régression à ajouter **avec** le correctif, jamais avant

Si et seulement si 7.1 ouvre la voie, ajouter dans le fichier existant
`packages/opencode/src/session/continuation.test.ts` un cas qui épingle le
comportement que la Partie A rend effectif — `decideRunDecision` avec
`nextAction: { kind: "none" }` et `declaredIntent: undefined` doit rendre
`{ action: "stop", reason: "no-executable-action" }` (`continuation.ts:78`).

**Aucun câblage d'import nouveau n'est requis** : l'alias `@/session/...` est
résolu dans `test/session/` (22 imports), fait vérifié par le validateur. Le cas
s'ajoute tel quel à un fichier de test déjà existant et n'ouvre aucune nouvelle
dépendance de chemin.

Ce test est un **verrou**, pas un critère de succès : il passe avant **et**
après le correctif, et sert à empêcher qu'une modification ultérieure de
`continuation.ts:77-81` ne ré-accorde l'autorité sans qu'aucun test ne le voie.
Le test qui vérifie `declaredIntent()` reste `turn-plan.test.ts:108-123` et n'est
pas touché.

**Commande d'exécution, depuis `packages/opencode` :**

```
bun test src/session/turn-plan.test.ts src/session/continuation.test.ts test/session/prompt.test.ts test/session/message-v2.test.ts
```

**Résultat attendu sur le dépôt courant, sans aucun patch :** sortie verte.
C'est le seul constat que la suite permet d'obtenir ici, et il ne vaut pas
validation fonctionnelle.

### 7.4 — Alignement du registre, hors périmètre

`README.md:41` annonce « 0,70 appel par étape » alors que ce document ne retient
qu'un seul triplet, 0,863 appel par tour (section 2.1), sur une population
différente. Les deux doivent être alignés sur un triplet unique — numérateur,
dénominateur, population. **Non appliqué ici** : le mandat porte sur
`proposals/**` et sur l'absence de modification de `packages/**` ; `README.md` est
partagé avec les 19 autres vagues de révision. Signalé comme résiduel.

## 8. Effort

**XS** — zéro patch ; le travail restant est l'instrumentation de 7.1, qui est de
la mesure et non de conception.

## 9. Verdict self-assessment

**READY** — la décision est « ne rien changer », elle est démontrée, et les
huit corrections du verdict sont appliquées ou documentées comme sans objet.

**Clos par la mesure ou par le code :**

- Le rendement de la déduplication : 8 déclarations identiques sur 5 126
  (0,16 %), et 11 affinés (0,21 %) — Partie B retirée (section 5).
- Le critère invalide : remplacé par G1, une grandeur monotone qui échoue avant
  et passe après, avec son cas limite énoncé (section 4.1, 7.2).
- Le sacrifice de la Partie A : l'affirmation qualitative est **retirée** ; elle
  est remplacée par une méthode de mesure exacte, l'identité vérifiée
  `(Q) ≡ (R)` et la borne structurelle `(R) ≤ nombre de déclarations`
  (section 4.2). La Partie A n'est pas livrée, la consigne du verdict ramenant à
  livrer B seule, et B étant sans rendement mesurable, à ne rien livrer.
- L'incohérence « réellement non bornée » : bornes survivantes citées
  (`continuation.ts:5` via `:79`, plus `:71`, `:74-76`, `:82`) et renvoi erroné à
  la « section 9, point 2 » supprimé.
- L'instruction `turn-plan.ts:213` : **tranchée, conservée**, sans faux levier
  (section 4.4).
- La régression O3 : **sans objet**, le court-circuit de déduplication étant
  absent de `declare()` (`turn-plan.ts:69-80`).

**Constats ouverts, transmis tels quels :**

1. `prompt.ts:1872` accorde une autorité que `turn-plan.ts:23-25` déclare
   interdite, et `continuation.ts:79` ne peut pas la borner. Correction
   disponible, non livrable sans la mesure 7.1 et sans seuil pré-fixé.
2. La contradiction interne `turn-plan.ts:213` / `turn-plan.ts:218` est réelle et
   **n'est pas levée**, par décision assumée : l'instruction est verrouillée par
   `turn-plan.test.ts:176-179` et injectée sans condition (`prompt.ts:1887`).
   Le protocole conserve donc une consigne qui demande de déclarer là où le plan
   dit lui-même que la déclaration est inutile.
3. Les grandeurs de la section 2.1 sont `HÉRITÉ` : elles n'ont pas été
   re-mesurées dans cette révision, faute d'accès shell au mandat. Aucun
   critère d'acceptation ne repose sur elles.
4. `README.md:41` et ce document divergent (7.4), hors périmètre.

**Point de méthode, à retenir pour la suite de l'audit :** un critère
d'acceptation dont le dénominateur est un coût que le patch réduit est invalide
par construction ; une correction qui retire une autorité ne peut pas être
validée par un test unitaire lorsque aucun test n'énonce cette autorité (§6) ; et
une borne structurelle, même correcte, ne remplace pas une fréquence mesurée
lorsqu'une décision de livraison en dépend.