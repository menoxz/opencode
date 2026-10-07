# P19 — `turn_plan` : coût de planification non borné

## 1. Problem

Le protocole injecté à chaque étape oblige le modèle à déclarer un plan, y compris
sur les étapes où il n'a rien de nouveau à annoncer, et cette déclaration
garantit mécaniquement une itération de modèle supplémentaire.

## 2. Evidence

**Le protocole est injecté à chaque étape du run, sans condition.**

`packages/opencode/src/session/prompt.ts:1887`

```ts
            turnPlanCapsules.push(TurnPlan.instruction())
```

`packages/opencode/src/session/turn-plan.ts:213` (et `218`, qui le contredit) :

```ts
    "On every turn, declare with the `turn_plan` tool the BATCH this turn delivers, and finish that batch before you stop:",
...
    "Finish the batch in this turn. Declare only what genuinely remains: a plan that restates a step you could have completed wastes the turn.",
```

La première phrase impose la déclaration ; la dernière la déclare inutile dans le
cas le plus fréquent. Les deux sont dans le même bloc, et la première l'emporte :
`packages/opencode/src/session/turn-plan.test.ts:176-179` verrouille ce comportement.

```ts
describe("the protocol demands a plan every turn without displaying it", () => {
  test("still demands the plan on every turn, not only when work is left open", () => {
    expect(instruction()).toContain("On every turn")
```

**Mécanisme du coût : la déclaration fraîche s'accorde elle-même l'autorité
maximale, à l'étape où elle est la moins justifiée.**

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

Le commentaire du même bloc admet que l'observation n'existe pas encore. Le code
pourtant retourne `"execute"` — l'autorité que `decideRunDecision` interprète
comme « action exécutable », donc « ne pas s'arrêter ». C'est le renfoncement exact
du problème : chaque déclaration garantit au moins une étape de plus, sans
qu'aucune observation l'ait justifiée.

Cela contredit le principe d'autorité du module lui-même.

`packages/opencode/src/session/turn-plan.ts:23-25`

```ts
// Authority is the lowest of the loop. The plan may only refine the ambiguous
// "no executable action" case; it can never relax a wait, a user question, the
// step limit, or a safety stop.
```

**Et la branche qui viole cette règle est exactement celle qui déclenche le coût.**

`packages/opencode/src/session/continuation.ts:77-81`

```ts
  if (input.nextAction.kind === "none") {
    if (input.declaredIntent !== "execute") return { action: "stop", reason: "no-executable-action" }
    if (input.idleContinues >= (input.limit ?? AUTO_CONTINUE_LIMIT)) return { action: "stop", reason: "idle-budget" }
    return { action: "continue", reason: "declared-intent" }
  }
```

`declaredIntent === "execute"` convertit `none` en `continue`. C'est la seule
branche de code qui donne au plan le pouvoir d'empêcher l'arrêt, et c'est
précisément le cas `none` que `turn-plan.ts:23-25` prétend ne faire que « refine ».
Le plan s'accorde donc à lui-même l'autorité que son module lui refuse par
documentation.

**Le frein prévu (`idle-budget`) est neutralisé par l'outil lui-même.** Ordre
d'exécution réel dans une même itération de boucle : `prompt.ts:1857` remet
`idleContinues` à zéro dès qu'un tool call est présent ; `prompt.ts:1872` accorde
ensuite `"execute"` ; `continuation.ts:79` compare donc toujours `0 >= limit`, ce
qui est faux. Un appel `turn_plan` est un tool call : **chaque déclaration remet le
compteur à zéro juste avant de consommer le plafond.** La boucle est donc réellement
non bornée, et pas seulement bornée par `AUTO_CONTINUE_LIMIT`. **INFERE :** l'ordre
`1857` avant `1872` est établi par les numéros de ligne lus dans le même bloc de 60
lignes (`1852-1899`) ; la valeur effective de `AUTO_CONTINUE_LIMIT` n'a pas été
relevée et n'est pas nécessaire à l'argument puisque le compteur est remis à zéro
avant la comparaison. Vérification : relire `packages/opencode/src/session/prompt.ts:1853-1892`.

**Le coût en octets de la sortie est négligeable ; le coût est le tour, pas la
sortie.** Session auditée (485 étapes) : 342 appels, 218 560 caractères de sortie,
sortie max 903 caractères, soit 639 caractères en moyenne par appel. À environ
160 tokens par appel, 4 368 appels représenteraient ~700 k tokens de sortie
hebdomadaire — négligeable face aux 667 M de `cache_read`. **INFERE :** le ratio
caractères/tokens n'est pas mesuré ici, et P10
(`proposals/P10-token-estimation.md`, cité au fichier) porte précisément sur la
fiabilité de ce ratio. Vérification : compter les tokens réellement enregistrés sur
les parts `turn_plan` d'une session en base. C'est pourquoi la métrique principale
retenue plus bas est le **nombre de requêtes fournisseur**, directement mesurable,
et non une conversion en tokens.

**Les mesures de parc fournies** viennent du relevé d'audit transmis avec le
problème (`README.md:41` pour l'existence de P19) ; elles ne sont pas re-mesurées
ici et sont citées comme données d'entrée.

- Parc 7 jours : `turn_plan` = 4 368 appels sur 6 955 étapes, soit 0,628 appel par
  étape, **premier poste d'usage après `bash`**.
- Session auditée (485 étapes) : 342 appels de `turn_plan`, 218 560 caractères de
  sortie, sortie max 903 caractères. Cela signifie que **70 % des étapes se
  terminent par un `turn_plan`** : dans sept cas sur dix, la déclaration est la
  dernière action du tour.
- Le coût réel n'est pas l'appel : c'est le préfixe rejoué. `cache_read` = 667 M
  contre 147 M d'`input`, soit 667 / 814 = **81,9 %** du volume semaine déjà payé
  sous forme de préfixe (les 82 % de l'énoncé sont cet arrondi).

**Mesure directe sur la base du harnais** — base
`C:\Users\jeanl\.local\share\opencodev2\opencode.db`, table `part`, fenêtre de 7
jours ancrée sur `MAX(time_created)` = 1 791 058 973 387 :

| Mesure | Valeur |
| --- | --- |
| appels `turn_plan` sur 7 jours | 4 863 (81 sessions) |
| messages assistant sur la même fenêtre | 7 444 |
| ratio appels / étape | **0,653** — recoupe les 0,628 de l'énoncé |
| plans distincts (`intent`+`expect`) | **4 846 sur 4 863** |
| déclarations strictement identiques à la précédente | **8 (0,16 %)** |
| `intent` identique, `expect` affiné | 19 (0,39 %) |
| parts `turn_plan` cumulées (tout l'historique) | 8 978 |

Cette mesure est décisive pour le choix du correctif et son interprétation est
développée en sections 4 et 5.

**Le module est opt-in et désactivé par défaut.**

`packages/opencode/src/config/config.ts:340` : `... Default: false.`
`packages/opencode/src/session/turn-plan.ts:200-202` : `return input.flag || input.config === true`
`packages/opencode/src/tool/registry.ts:410` : l'outil n'est enregistré que si activé.

Donc les 4 368 appels prouvent que l'opérateur a explicitement activé le protocole.
Ce n'est pas une fuite, c'est un coût choisi — ce qui pèse sur le seuil de la
correction proposée en section 4.

## 3. Mechanism

1. `runLoop` calcule `turnPlanEnabled` une fois par run —
   `packages/opencode/src/session/prompt.ts:1753` — puis purge tout plan antérieur
   (`1755`), donc l'état ne survit pas au run.
2. À chaque itération de la boucle `while (true)`, si le protocole est actif,
   `TurnPlan.reminder(sessionID)` est appelé — `prompt.ts:1866`. Cette fonction ne
   rend la main qu'une fois par entrée et passe l'entrée en `reminded`
   (`turn-plan.ts:95-100`).
3. Chemin « premier sighting » (`prompt.ts:1867-1872`) : la capsule
   `renderCommitment` est poussée en queue (le segment système caché reste
   identique octet pour octet) **et `declaredIntent` vaut `"execute"`**, sans
   aucune lecture d'observation.
4. Chemin « settlement » (`prompt.ts:1873-1886`) : la sortie des tool parts du
   dernier assistant est concaténée, `settle()` compare à `expect` via
   `expectationMatches` (`turn-plan.ts:121-134`), puis `declaredIntent` vaut
   `"none"` si confirmé, `"execute"` si manqué (`turn-plan.ts:142-148`).
5. `decideRunDecision(idleContinues, declaredIntent, …)` reçoit ce signal —
   `continuation.ts:77-81`. Un `declaredIntent === "execute"` transforme
   `nextAction.kind === "none"` en `continue`, raison `declared-intent`.
6. Retour en étape 2. Un `declare()` (`turn-plan.ts:69-80`) réarme `reminded: false`
   et remplace l'entrée ; l'entrée est supprimée à `settle()` (`turn-plan.ts:127`).

Boucle fermée : déclaration → `reminded=false` → étape suivante `execute` forcé →
au moins une requête fournisseur supplémentaire → préfixe rejoué intégralement.
C'est cette boucle, pas le volume d'octets, qui produit le 0,628 appel/étape.

## 4. Proposal

Le correctif retire l'auto-attribution d'autorité, pas l'anticipation. La
déclaration reste demandée, reste rendue au modèle, reste réconciliée et reste
comparée à l'observation ; seule la promesse « ceci va te faire continuer »
disparaît.

**Partie A — `packages/opencode/src/session/prompt.ts:1872` : ne plus auto-attribuer
`"execute"` à une déclaration qui n'a pas encore été confrontée à une observation.**

```diff
             const commitment = TurnPlan.reminder(sessionID)
             if (commitment) {
               // First sighting: the plan predicted this step, so restate it as the
               // standing commitment instead of judging an observation that does not
               // exist yet.
               turnPlanCapsules.push(TurnPlan.renderCommitment(commitment))
-              declaredIntent = "execute"
+              // No declaredIntent: the plan has not been tested against anything, so
+              // it leaves `decideRunDecision` to its own inference. Handing a fresh
+              // prediction the "executable action" verdict made every declaration
+              // buy one more provider request by construction, and reset the
+              // idle-budget counter that is supposed to bound the loop.
             }
```

Effet : `declaredIntent` reste `undefined` sur ce chemin, ce que
`turn-plan.ts:146` traite déjà comme « le harnais garde sa propre inférence »
(`if (!plan || verdict === "no-plan") return undefined`). Aucun changement de
comportement sur le chemin « settlement », où le plan a, lui, été confronté à
l'observation.

**Il n'y a pas de Partie B.** Une déduplication des déclarations identiques avait
été envisagée en premier lieu ; la mesure de la section 2 l'invalide (8 cas sur
4 863, soit 0,16 %). Elle est exposée et rejetée en section 5 plutôt que livrée,
car du code qui ne supprime que huit appels par semaine serait un coût
d'entretien sans bénéfice.

**Inchangé volontairement :**

- `instruction()` (`turn-plan.ts:210-224`) n'est **pas** modifié. La contradiction
  interne signalée en section 2 reste, et `turn-plan.test.ts:176-179` continue de
  passer. Adoucir « On every turn » serait le correctif le plus rentable en
  surface, mais cela attaque directement l'anticipation demandée par le modèle.
  La mesure le confirme : **4 846 plans distincts sur 4 863** signifient que le
  modèle produit réellement un plan neuf et spécifique à chaque tour. La
  déclaration n'est pas une formalité répétée, c'est l'essentiel de la valeur de
  la brique. La garder intacte est le parti pris de cette proposition.
- La purge par run (`prompt.ts:1755`), la borne `MAX_SESSIONS` (`turn-plan.ts:40`)
  et l'appartenance de `turn_plan` aux entrées élidables au rejeu
  (`message-v2.ts:322`) sont conservées : elles sont correctes et sans rapport avec
  la fréquence.

## 5. Alternatives considered

**Cadence — obligation tous les N tours au lieu de chaque tour.** Rejetée. Le plan
est consommé exactement une fois (`turn-plan.ts:127`) et `declaredIntent` n'existe
que sur les deux étapes de sa vie. Espacer les déclarations crée des fenêtres où
`reminder()` ne rend rien et `settle()` ne rend rien : le mécanisme perd ses deux
seuls signaux, précisément ceux que la brique existe pour produire. Le sacrifice
porte sur la fonction, pas sur le coût.

**Budget plafonné par session.** Rejetée, et c'est la pire des quatre. Le modèle
n'a aucune raison de savoir à quel tour du plafond il se trouve ; il continue de
déclarer, reçoit un refus, et dépense un tour de plus. Un plafond non annoncé au
modèle convertit un coût en tokens invisible en un coût en tours visible, et
dégrade le plan en garde-fou qui produit des erreurs. Le plafond serait en outre
incompatible avec l'usage du plan : `declare()` remplace, il n'accumule pas
(`turn-plan.ts:65-68`), donc un plafond n'a rien à plafonner. La borne qui existe
déjà, `idle-budget`, est neutralisée comme montré en section 2 ; lui en ajouter une
de même nature n'aurait pas plus d'effet.

**Déduplication — ne pas déclarer un plan identique au précédent.** Rejetée sur
mesure, après avoir été ma proposition initiale. La requête
`W7_TURNS` ci-dessus compte 4 863 déclarations et **4 846 plans distincts** : seules
**8 déclarations (0,16 %)** sont strictement identiques à leur prédécesseur dans
la même session, et 19 (0,39 %) réutilisent le même `intent` avec un `expect`
affiné. L'hypothèse « beaucoup de plans quasi identiques et consécutifs » est donc
**réfutée par la mesure** sur ce parc. Le gain maximal de la déduplication est de
huit appels par semaine, contre 4 863 : invisible dans le bruit. Elle est
rejetée.

**Ne rien changer.** Écartée, mais elle devait être examinée. Deux mesures la
rendent minoritaire : `prompt.ts:1872` accorde une autorité que `turn-plan.ts:23-25`
déclare interdite au module, et ce faisant garantit une itération supplémentaire
par déclaration tout en réarmant le frein qui devait la borner. Ce n'est pas un
garde-fou affaibli, c'est un garde-fou qui n'a jamais mesuré ce qu'il promettait.
Elle reste recevable si le validateur juge que la poursuite garantie est
nécessaire — voir section 9.

## 6. Risks

- **Régression sur les tests existants.** `packages/opencode/src/session/turn-plan.test.ts:34-40`
  (« replaces the previous plan ») déclare `"first"` puis `"second"` : valeurs
  différentes, la déduplication ne s'active pas, le test est inchangé.
  `turn-plan.test.ts:42-50` (éviction) déclare `"old"` puis `"new"` : idem.
  `turn-plan.test.ts:108-123` teste `declaredIntent`, la fonction pure de
  `turn-plan.ts:142`, que la Partie A ne modifie pas — c'est le chemin
  « settlement », distinct du chemin modifié. `turn-plan.test.ts:176-179` teste
  `instruction()`, non modifiée.
  `packages/opencode/test/session/message-v2.test.ts:1706`
  teste le rejeu d'une part `turn_plan`, sans lien avec la Partie A.
  Le fichier le plus exposé, `packages/opencode/test/session/prompt.test.ts`, a été
  vérifié : `rg -n "declaredIntent|TurnPlan|turn_plan"
  packages/opencode/test/session/prompt.test.ts` ne renvoie **aucune**
  correspondance (exit 1). Aucun test de ce fichier n'énonce la poursuite
  garantie par `declaredIntent`, donc la Partie A n'en casse aucun. C'était le
  seul risque de régression que je ne pouvais pas écarter par lecture ; il est
  maintenant écarté.
- **Coût ajouté en tokens / latence.** Nul. La Partie A supprime une attribution
  dans un chemin déjà pris, ne coûte aucun token, aucune allocation, aucun
  aller-retour réseau. Les tokens d'entrée sont inchangés ; les `cache_read`
  baissent d'une requête fournisseur par déclaration non followed d'observation.
- **Sécurité.** Aucun risque ajouté, et un risque réduit : la Partie A abaisse
  l'autorité qu'un modèle peut s'accorder à lui-même, ce qui resserre le levier le
  plus large du module. Elle rend en outre son comportement conforme à la règle
  que `turn-plan.ts:23-25` s'impose à lui-même. Aucune permission, aucun
  contournement, aucune injection introduite. Le plan reste sans effet sur `wait`,
  question utilisateur, limite d'étapes et arrêt de sécurité (`continuation.ts:70-76`
  est évaluée avant la branche modifiée), tous ces garde-fous étant inchangés.

## 7. Tests

La Partie A supprime une affectation, pas une branche : elle ne crée aucun chemin
nouveau, donc aucun test unitaire de régression n'est requis pour la couvrir. Les
tests servent à prouver qu'elle ne casse rien et qu'elle produit l'effet voulu.

**Test 1 — non-régression des tests existants**

```
cd packages/opencode && bun test src/session/turn-plan.test.ts test/session/message-v2.test.ts
```

Sortie attendue : identique à la sortie d'avant le changement. En particulier
`turn-plan.test.ts:176-179` doit rester vert, ce qui prouve qu'aucune instruction
n'a été adoucie.

**Test 2 — la boucle n'est plus auto-guaranteée**
`cd packages/opencode && bun test src/session/turn-plan.test.ts` avec un cas ajouté
dans `describe("declaredIntent")` (`turn-plan.test.ts:108-123`) vérifiant que
`declaredIntent` reste `undefined` tant qu'aucune observation n'a été produite.

**Test 3 — critère principal, mesuré sur parc**

```
SELECT COUNT(*) FROM part
 WHERE time_created >= <now - 7 jours>
   AND data LIKE '%"tool":"turn_plan"%';
```

Critères de succès observables :

1. Les suites du test 1 sortent au même résultat qu'avant le changement.
2. `declaredIntent` vaut `undefined` sur le chemin « premier sighting » et reste
   `"none"` / `"execute"` selon l'observation sur le chemin « settlement ».
3. **Critère principal** : sur une fenêtre de 7 jours comparable, le ratio
   appels `turn_plan` / messages assistant passe sous 0,653, alors que le nombre
   total d'étapes et le `cache_read` par étape restent constants. Un ratio inchangé
   signalerait que `declaredIntent` n'était pas la cause et invaliderait la
   Partie A.

## 8. Effort

**XS** — une ligne supprimée et un commentaire remplacé, plus un cas de test. Le
reste du travail est la mesure de confirmation sur parc.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — un seul point à trancher, les autres étant clos par la mesure.

**Clos :** le rendement de la déduplication. Mesuré à 8 déclarations sur 4 863
(0,16 %), donc la Partie B est retirée de la proposition. L'hypothèse de plans
répétés est réfutée sur ce parc.

**Question ouverte :** la Partie A retire à `prompt.ts:1872` une autorité qui
peut aujourd'hui tenir ouverts des runs qui se seraient arrêtés. C'est un arbitrage
de qualité, pas une correction mécanique. Trois éléments pèsent en faveur de la
Partie A : elle rend le code conforme à la règle que le module s'impose
lui-même ; elle retire précisément l'étape où aucune observation n'a encore été
produite ; et elle préserve intégralement le contenu du plan, qui est la partie
mesurée comme utile (99,84 % de plans distincts). Si le validateur juge que la
poursuivance garantie est un garde-fou utile, alors **ne rien changer** devient le
verdict défendable, et la proposition se réduit à ce constat : la continuation est
auto-accordée, et `idle-budget` ne peut pas la borner parce que l'appel qui la
demande remet son propre compteur à zéro.