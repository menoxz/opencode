# P11 — La barrière anti-clôture est inactive par défaut : `deliverable` vaut `undefined` sur le chemin outils, et `out_of_scope` sans preuve la neutralise en un appel

> Révisé cycle 2 après REVALIDATED-FAIL du 2026-10-03 (`verdicts/P11-revalidation.md`) — RC#1..RC#4 et O1..O3 traités, verdict le plus récent absorbé.

Le cycle 1 a répondu à la chaîne antérieure : il a traité les 7 corrections du verdict d'origine
et laissé intactes 3 des 4 `Required changes` du verdict le plus récent, dont RC#1 — une
affirmation de sûreté fausse recopiée verbatim. **RC#1 est ici traité par fermeture, pas par
reformulation** (§4.3). Les constats de fond sont confirmés mot pour mot et repris avec leurs
citations.

## Traçabilité des correctifs exigés avant revalidation

| # | Exigence | Traitement | Citation qui prouve le traitement |
|---|---|---|---|
| **RC#1** / O1, bloquant | borner **ou fermer** `out_of_scope` + preuve creuse | **fermé** — **R3** exige une preuve *substantive* sur `finding.evidence` (`goal-evidence.ts:41` et `:52`), et **R1 clause 2** rattrape `closed` au niveau de la barrière, sans dépendre de `:51` | `goal-evidence.ts:41` n'exige que `incomingEvidence.length === 0`, donc `evidence: ["x"]` suffit ; `goal-contract.ts:458` `evidence: Schema.optional(Schema.Array(Schema.String))`, sans contrainte ; `goal-contract.ts:529-531` ne retient que `status === "residual"` ; `goal-contract.ts:609` ne compte que `status === "open"` |
| **RC#2** / O2, bloquant | T4 = **extension** de `goal-evidence.test.ts`, 3 tests nommés | **fait** — T4 renommé, base `3 pass → 5 pass`, les 3 tests nommés | `goal-evidence.test.ts:9` `describe("sticky goal findings")` ; `:10-12`, `:14-20`, `:22-27` |
| **RC#3** | remplacer l'`INFERE` du §7.2 | **fait** — §7.2 cite les deux bases mesurées, aucun `INFERE` ne subsiste | `P11-verdict.md:39` et `:111` ; §7.2 |
| **RC#4** | trancher §9.2, consigner la décision dans `README.md:33` | **fait** — A-2 tranché dans R5 (§4.5) et §8 ; texte de merge donné pour `README.md:33` | `README.md:33` : *« barrière anti-clôture conditionnée au type d'objectif **choisi par le modèle** »* — voie correcte (C-27), garantie fausse (C-06) |
| **O3** (cycle 2) | supprimer le `test` `:35-38` **entier**, avec un critère de comptage | **fait** — T1 impose la suppression du bloc entier et porte `3 tests → 2 tests` | `goal-residual.test.ts:35-38`, dont l'unique assertion est `:37` |
| **O4** (cycle 2) | « 9 appels » est faux, c'est 8 | **corrigé** — 8 appels comptés, 7 survivants | `goal-residual.test.ts:21`, `:22`, `:26`, `:27`, `:28`, `:29`, `:31`, `:37` |
| **O5** (cycle 2) | `README.md:33` décrit une garantie que le patch ne porte pas | **corrigé** — texte de remplacement fourni | `README.md:33` ; `goal-state.ts:29` `Schema.optional(...)` |

## 1. Problem

Un objectif peut être déclaré terminé en laissant un défaut grave (`high`/`critical`) déclaré
`residual`, ou déclaré `out_of_scope` avec une preuve d'un seul caractère : la garde censée
l'interdire est inerte dans le cas le plus fréquent, parce que le champ dont elle dépend
n'existe pas sur le chemin outils, et parce que l'issue de sortie `out_of_scope` est acceptée
sans preuve vérifiable.

## 2. Evidence

Toutes les citations sont relues par `read` sur le code de cette révision, ligne à ligne.
`:NNN` sans préfixe = `packages/opencode/src/tool/goal-contract.ts` (C-01 : `src/session/goal-contract.ts`
**n'existe pas** ; la barrière de clôture est bien `:609-628`).

**E1 — la garde est conditionnée à un champ que le chemin outils n'écrit pas.** `:519-532`

```ts
/** For an implementation objective, a high-severity finding left `residual` is a
 *  renamed unresolved defect, not completion: the model must close it with
 *  evidence, mark it `out_of_scope` as an explicit scope decision, or record the
 *  objective as `blocked` for an obstacle outside its control. Audits, plans and
 *  plain answers are unaffected — documenting a defect can be their result. */
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

**E2 — le champ est un `regex` sur du texte utilisateur, absent par défaut (C-06).**
`src/session/goal-state.ts:29`

```ts
deliverable: Schema.optional(Schema.Literals(["answer", "audit", "plan", "implementation"])),
```

`src/session/goal-state.ts:122-129`

```ts
/** Classify the deliverable kind from the mission text. Conservative: only clear
 *  mutation verbs make it an implementation, so closure is not over-blocked. */
export function inferDeliverable(text: string): GoalDeliverable {
  if (IMPLEMENTATION_HINTS.test(text)) return "implementation"
  if (PLAN_HINTS.test(text)) return "plan"
  if (AUDIT_HINTS.test(text)) return "audit"
  return "answer"
}
```

Le champ est **optionnel** et l'inférence est un **dérivé de texte**, jamais une décision du
harnais. Tout le document suppose donc son **absence**, jamais sa présence (C-06).

**E3 — aucun paramètre d'outil ne porte `deliverable`.** `:42-50` (`CreateParameters`) et
`:52-60` (`EditParameters`) ; ni `objective`, ni `dod`, ni `outOfScope` ne mentionnent le champ.
`nextGoalState` (`:199-222`) retourne `{ ...previous, status, source, goal, dod, outOfScope,
compressed, version, updatedAt }` (`:211-221`) et **ne construit aucune clé `deliverable`** ;
`:208` `const dod = normalizeGoalList(input.dod)` ne normalise que des chaînes.
Conséquence : `previous.deliverable === undefined` sur tout objectif créé ou réédité par un outil,
et `:528` rend la garde inerte.

**E4 — les DoD ne sont pas typés, et le champ est remplacé en entier.** `:44`
`dod: Schema.optional(Schema.mutable(Schema.Array(Schema.String)))`, description
`"Definition of Done items"` ; `:54-56` la même déclaration sous `EditParameters`, description
`"Replace DoD list when provided"`. `src/session/goal-state.ts:25`
`dod: Schema.Array(Schema.String)`. Aucun item ne porte `kind`/`polarity` : **remplacement
intégral, sans fusion, sans validation**.

**E5 — `out_of_scope` est un littéral légal, et son `evidence` n'est contrainte par rien.** `:452-459`

```ts
findings: Schema.optional(Schema.Array(Schema.Struct({
  id: Schema.String,
  severity: Schema.Literals(["info", "low", "medium", "high", "critical"]),
  status: Schema.Literals(["open", "closed", "residual", "out_of_scope"]),
  summary: Schema.String,
  scope: Schema.optional(Schema.String),
  evidence: Schema.optional(Schema.Array(Schema.String)),
}))).annotate({ description: "Stable findings. OPEN blocks completion; closure requires independent evidence." }),
```

`:458` est la ligne du constat central : aucune longueur, aucun motif, aucun jeton
ré-observable.

**E6 — l'implémentation n'exige qu'une preuve *non vide*.** `src/session/goal-evidence.ts:34-47`

```ts
    const previous = merged.get(id)
    const incomingEvidence = unique(item.evidence)
    if (!previous) {
      order.push(id)
      merged.set(id, {
        ...item,
        id,
        status: item.status === "closed" && incomingEvidence.length === 0 ? "open" : item.status,
        evidence: incomingEvidence,
```

`:41` ne teste que `incomingEvidence.length === 0`. `:51-53` (branche *finding existant*) :
`closed`, `residual` et `out_of_scope` ne s'écrasent qu'`&& incomingEvidence.length > 0`.

**E7 — la seule barrière de non-contournabilité de la preuve est branchée sur le DoD, pas sur
le finding.** `goal-evidence.ts:48-53` n'a aucun contrôle de qualité ; côté contrat,
`goal-contract.ts:485-491` définit le seul prédicat de preuve re-observable :

```ts
function proofIsSubstantive(proof: string): boolean {
  const value = proof.trim()
  if (value.length < 12) return false
  if (VAGUE_PROOF.test(value)) return false
  // Something re-observable: a command, a path, a number, a status, a URL, a hash.
  return /[\d]|[\\/]|https?:|exit|passed|failed|\bcode\b|\bscore\b|\btest/i.test(value)
}
```

et son **unique** branchement est `goal-contract.ts:691-694` :

```ts
if (dodItems.length > 0) {
  const weak = evidence.filter((item) => !proofIsSubstantive(item.proof))
  const provenByEvidence = (item: string) =>
    evidence.some((entry) => proofIsSubstantive(entry.proof) && matchesDodItem(entry.dod, item))
```

`:723` *« Completion refused: the DoD is not backed by verifiable evidence. »* et `:725`
*« Proof is an assertion, not an artifact, for: … »* ne concernent donc que
`evidence: [{ dod, proof }]`, jamais `finding.evidence`.

**E8 — le contrat publié exige déjà la preuve du finding.** `:450` *« One entry per DoD item,
each carrying a verifiable artifact. Required — completion is refused without it. »* et `:459`
*« Stable findings. OPEN blocks completion; closure requires independent evidence. »* — R1 et R3
alignent l'implémentation sur un contrat déjà exposé au modèle.

**E9 — le refus existe et enseigne déjà le geste correct.** `:620-628`

```ts
if (findingsChanged) yield* sessions.setGoalState({ sessionID: ctx.sessionID, goalState: pending })
return responseResult({
  status: "error", action: "complete", updatedFields: findingsChanged ? ["findings"] : [],
  warnings: [
    "Completion refused: sticky findings remain OPEN.",
    ...openFindings.map((finding) => `${finding.id}: ${finding.summary}`),
    "Close each finding with independent evidence, or explicitly mark it RESIDUAL/OUT-OF-SCOPE with evidence.",
  ], goalState: pending,
})
```

**E10 — le second refus, lui, est conditionné au type d'objectif.** `:653-657` puis `:671`

```ts
// An implementation objective is not done while a high-severity defect
// it surfaced is merely relabelled `residual`. Audits may legitimately
// end with documented defects, so the rule is scoped to implementation.
const blockingResidual = blockingResidualFindings(previous.deliverable, findings)
if (blockingResidual.length > 0) {
```

```ts
warnings: [
  "Completion refused: an implementation objective cannot close with high-severity findings left residual.",
```

## 3. Mechanism

Deux portes indépendantes, chacune neutralisable en un appel.

1. L'agent appelle `complete_objective` avec un finding `critical`, `status: "residual"` —
   littéral légal (`:455`).
2. `mergeGoalFindings` crée le finding. **Porte 1 :** `goal-evidence.ts:41` ne rétrograde que
   `closed` sans preuve ; `residual` est conservé tel quel. Le finding n'est donc pas `open`, et
   `:609` `const openFindings = findings.filter((finding) => finding.status === "open")` suivi de
   `:610` `if (openFindings.length > 0)` ne le voit pas.
3. Le second garde passe. **Porte 2 :** `:656`
   `blockingResidualFindings(previous.deliverable, findings)` avec
   `previous.deliverable === undefined` (E2, E3) → `:528` renvoie `[]` → `:657` inerte.
   **La barrière est désactivée par défaut.**
4. Les contrôles de preuve DoD (`:691-694`, `:717-730`) passent ou échouent indépendamment de la
   gravité des findings. La clôture aboutit.

**Porte 1, variante `out_of_scope`** — sur le *même* appel, remplacer `residual` par
`out_of_scope` avec `evidence: ["x"]` : `:41` conserve `out_of_scope` (E6) ; `:529-531` ne retient
que `status === "residual"` → `[]` ; `:609` ne compte que `open` → la clôture passe. Le taux de R2
actuel est exactement `incomingEvidence.length === 0`, et `"x"` le satisfait.

**Porte 1, variante `closed`** — `closed` `high`/`critical` avec une preuve creuse passe aussi :
`:41` conserve `closed`, `:609` ne compte que `open`, `:530` ne retient que `residual`.

**Porte 2** — réécrire le DoD avant de refermer : le champ est *« Replace DoD list when provided »*
(`:55`) et `nextGoalState` (`:211-221`) n'en valide pas le contenu.

**Pourquoi le cycle 1 est en faute.** R1 + R2 ferment la voie `residual`. Ce qui restait n'était pas
une porte, c'était **le même évadement par le même mécanisme, avec un seuil plus bas** : tout ce
que R2 exige est une chaîne non vide, et `goal-contract.ts:458` ne borne pas cette chaîne. Une
affirmation de non-contournabilité au-delà de ce seuil est une affirmation de sûreté non
vérifiable ; elle est **supprimée** de ce document et le seuil est **fermé** par R3 et R1 clause 2.

## 4. Proposal

Ordre de patch : **R2 seul** (une ligne, indépendant) → **R3** (trois lignes + déplacement du
prédicat, ferme O1) → **R1** (garde inconditionnelle, avec ses tests) → **T5/T6** bout en bout →
**R4** (trace de décision, §4.6).

**Dépendance nommée, parce que l'ordre n'est pas libre.** La **seconde** clause de R1 appelle
`proofIsSubstantive`, donc elle exige **R3**, qui déplace et exporte ce prédicat : R1 et R3 se
mergent dans le même patch, R3 d'abord. La **première** clause de R1 — celle que le verdict exige —
ne dépend de rien : elle ne lit que `severity` et `status`, jamais une preuve, et reste mergable
seule.

### R1 — garde inconditionnelle : le classifieur disparaît

`:519-532`, commentaire + signature + corps, à réécrire ainsi :

```ts
/** A high-severity finding left `residual` is a renamed unresolved defect, not
 *  completion: the model must close it with evidence, mark it `out_of_scope`
 *  as an explicit evidence-backed scope decision, or record the objective as
 *  `blocked` for an obstacle outside its control. The rule is no longer
 *  conditioned on an objective-type field: that field is absent on the tool
 *  path and derived from user text elsewhere, so conditioning on it made the
 *  gate inert exactly where it was needed.
 *
 *  Second clause: any other non-`open` exit whose proof is hollow is the same
 *  rename. `mergeGoalFindings` already reclassifies `residual` and
 *  `out_of_scope`; `closed` is deliberately left alone there so that
 *  `goal-evidence.test.ts:14-20` keeps passing on the proof
 *  "independent re-audit ses_b PASS", which is not substantive. Checking it
 *  here instead leaves that test untouched: the helper default of
 *  `goal-residual.test.ts:10`, "probe exit 1", is 12 characters and contains
 *  `exit`, so it passes `proofIsSubstantive` and `goal-residual.test.ts:29`
 *  stays green. */
export function blockingResidualFindings(findings: readonly GoalFinding[]): GoalFinding[] {
  return findings.filter(
    (finding) =>
      (finding.status === "residual" && (finding.severity === "high" || finding.severity === "critical")) ||
      ((finding.severity === "high" || finding.severity === "critical") &&
        finding.status !== "open" &&
        !(finding.evidence ?? []).some(proofIsSubstantive)),
  )
}
```

- site d'appel `:656` : `const blockingResidual = blockingResidualFindings(findings)` (C-06 : le
  patch ne doit **pas** suporter la présence du champ) ;
- commentaire `:653-655` : à réécrire, il affirme encore *« so the rule is scoped to
  implementation »*, ce qui devient faux ;
- message `:671` : *« an implementation objective cannot close with high-severity findings left
  residual »* → *« a high-severity finding is left residual or closed without a re-observable
  proof »*.

**Effet mesuré sur l'évasion `residual`** (le point du verdict). Avant R1 : `residual` survit à
`goal-evidence.ts:41`, n'est pas compté par `:609`, et `:656` renvoie `[]` via `:528` → la clôture
passe. Après R1 : `:656` appelle `blockingResidualFindings(findings)` **sans** `deliverable`, et le
filtre `:529-531` retient le `residual` `high`/`critical` → `:657` bloque. R2 ferme le même cas
**indépendamment** : sans preuve, `goal-evidence.ts:41` ramène le statut à `open` → `:610` bloque.

**Effet mesuré sur l'évasion `closed`.** `:41` conserve `closed` avec une preuve creuse, `:609`
ne compte que `open` et `:530` que `residual` : le cas passait. Après la clause 2, la barrière
`:657` le retient, puisque `closed !== "open"` et qu'aucune preuve ne satisfait
`proofIsSubstantive`.

**Pourquoi c'est la suppression de la cause.** Aucune chaîne n'entre dans la première décision :
le prédicat porte sur `severity` et `status`, dont le mauvais choix (`residual`) est précisément ce
qu'on veut bloquer.

**Volontairement inchangé.** `deliverable` et `inferDeliverable` restent en place : les retirer
touche le schéma public `GoalState` et l'affichage, sans gain de sûreté une fois R1 appliqué. Dette
consignée en §6.5.

### R2 — un statut non-`open` privé de preuve redevient `open`

`src/session/goal-evidence.ts:41`

```diff
-        status: item.status === "closed" && incomingEvidence.length === 0 ? "open" : item.status,
+        status: item.status !== "open" && incomingEvidence.length === 0 ? "open" : item.status,
```

Un finding **nouveau** déclaré `residual`, `out_of_scope` ou `closed` **sans preuve** revient à
`open` et tombe sous la barrière `:609-628`. Indépendant de R1 et de R3, donc mergable seul.

### R3 — un statut non-`open` exige une preuve **substantive** (ferme O1, RC#1)

`goal-contract.ts:485-491` définit déjà le seul prédicat de preuve re-observable du dépôt, mais
`:691-694` est son **unique** branchement et il ne porte que sur `evidence: [{ dod, proof }]`.
`finding.evidence` (`:458`) n'est jamais examiné. R3 étend ce contrôle au chemin *finding* :

1. **Déplacer** `VAGUE_PROOF` (`:482-483`) et `proofIsSubstantive` (`:485-491`) de
   `src/tool/goal-contract.ts` vers `src/session/goal-evidence.ts`, et **importer** depuis
   `goal-contract.ts`. Sens de dépendance conservé : `goal-contract.ts` utilise déjà
   `mergeGoalFindings` (`:607`) ; l'inverse créerait un cycle. Déplacement, pas duplication.
2. `src/session/goal-evidence.ts:41` (branche *finding nouveau*) et `:52` (branche *finding
   existant*) :

```diff
-        status: item.status !== "open" && incomingEvidence.length === 0 ? "open" : item.status,
+        status: item.status !== "open" && !incomingEvidence.some(proofIsSubstantive) ? "open" : item.status,
```

```diff
-    else if ((item.status === "residual" || item.status === "out_of_scope") && incomingEvidence.length > 0) status = item.status
+    else if ((item.status === "residual" || item.status === "out_of_scope") && incomingEvidence.some(proofIsSubstantive)) status = item.status
```

**Bornage exact de R3, vérifié test par test.** R3 est délibérément **borné à `:41` et `:52`**, la
branche `:51` (`closed`) restant intacte, et la raison est mesurable : la preuve
`"independent re-audit ses_b PASS"` que `goal-evidence.test.ts:17-18` utilise pour exiger
`closed` **échoue** à `proofIsSubstantive` (ni chiffre, ni `/`, ni `exit`/`passed`/`failed`, ni
`code`/`score`/`test`). Étendre R3 à `:51` casserait donc `goal-evidence.test.ts:14-20` : ce n'est
pas une préférence, c'est une contrainte mesurée sur le test existant. **La branche `closed` n'est
pourtant pas laissée ouverte** : elle est rattrapée un cran plus haut, à la barrière, par la clause 2
de R1, ce qui n'exige pas de toucher `:51`.

**Ce que R3 ferme.** `out_of_scope` `high`/`critical` avec `evidence: ["x"]`, ou
`evidence: ["voir §3 du rapport"]` (19 caractères, ≥ 12, mais aucun jeton re-observable) :
`:41` ramène à `open` → `:610` bloque ; et si le finding existait déjà, `:52` refuse la transition.
Avec R1 clause 1, `residual` est retenu par `:529-531` quelle que soit sa preuve ; avec la clause 2,
aucun statut non-`open` ne passe sans preuve re-observable. Il n'y a donc **plus aucun statut de
sortie** accessible par une chaîne creuse.

### R4 — `deliverable` devient un champ mort (hors périmètre, documenté)

Après R1, `deliverable` n'a plus d'entrée dans la décision : `:528` disparaît, `:656` ne lit plus
`previous.deliverable`. Le champ et `inferDeliverable` restent. Consigné en §6.5.

### R5 — le seuil d'effort falsifiable (arbitrage A-2)

**Ce n'est pas un assouplissement de la barrière.** `:609-628` refuse aujourd'hui tout goal dont
une DoD n'est pas un artefact vérifiable, et R2/R3 resserrent cette exigence. Le seuil chiffré
d'effort est donc **conforme** à `:691-694` et `:723` : il est fourni comme `proof` d'un item DoD,
et `proofIsSubstantive` l'accepte parce qu'il contient un chiffre et le mot `test`. Un seuil non
chiffré serait refusé par `:723` — c'est exactement ce que l'arbitrage A-2 tranche. La forme
obligatoire d'un item d'effort devient : *« un seuil chiffré, un état initial, une mesure
d'acceptation et la commande qui la produit »* (§8).

### R6 — trace de décision : `README.md:33` (arbitrage RC#4)

`README.md:33` porte aujourd'hui *« barrière anti-clôture conditionnée au type d'objectif **choisi
par le modèle** »*. La voie est correcte (C-27) mais la **garantie** est fausse (C-06 : le champ
est absent par défaut, et R1 le supprime de la décision). Au merge, cette cellule devient : *«
barrière anti-clôture inconditionnelle sur les findings `high`/`critical` ; `out_of_scope` et
`closed` exigent une preuve re-observable »*.

## 5. Alternatives considered

**5.1 — Garder la garde conditionnelle et typer les DoD (effort `L`).** Rejeté **sur le fond**.
Même typé, `:54-56` remplace *tout* le tableau `dod` et `:211-221` n'en valide pas le contenu : un
agent retire l'item d'engagement et le verrou saute. Il faudrait de plus une **autorité d'écriture**
hors de la surface d'édition du modèle — plus volumineux que R1+R2+R3 réunis, tout en laissant la
chaîne contrôlée par le modèle *dans* la décision. Confirmé par `P11-revalidation.md:167-195`,
qui refuse tout lot `L` pour P11.

**5.2 — Interdire `out_of_scope` sur `high`/`critical`.** Rejeté. L'option du verdict pour O1
(`P11-revalidation.md:81-84`) supprime un statut utile : un audit légitime doit pouvoir déclarer un
défaut critique hors périmètre de la mission. R3+R1 clause 2 obtiennent la même garantie sans
supprimer le statut, et couvrent aussi `residual` et `closed`, que 5.2 laisserait passer. Ils sont
aussi plus petits : deux lignes de prédicat contre une validation de schéma.

**5.3 — Borner l'affirmation au lieu de fermer le chemin.** Rejeté, et c'est le cœur de RC#1.
C'était l'issue de secours proposée par le verdict (`P11-revalidation.md:83-84`) ; elle est
insuffisante parce qu'elle laisse en place un évadement à coût 1 et déplace le risque vers un
futur lot — précisément ce que `P11-revalidation.md:192-195` interdit. Le cycle 1 avait choisi
cette issue **et** avait attribué le traitement à un mécanisme qui ne s'y branche pas.

**5.4 — Supprimer `deliverable` et `inferDeliverable` du schéma.** Rejeté (cf. R4) : coût de
surface publique sans gain de sûreté post-R1.

**5.5 — Statut `residual` borné dans le temps.** Rejeté : introduit une horloge dans un contrat de
preuve et n'apporte rien à la non-contournabilité.

## 6. Risks

**6.1 — Sur-blocage des objectifs `audit` / `plan` / `answer` (risque principal, délibéré).**
Coût assumé de R1 : le commentaire `:519-523` exemptait explicitement ces trois types, *«
documenting a defect can be their result »*. Après R1, un audit qui déclare un défaut `critical`
en `residual` **est** bloqué. Atténuation : le message `:626` enseigne déjà le geste correct —
*« explicitly mark it RESIDUAL/OUT-OF-SCOPE with evidence »* — et l'issue coûte **un appel**, pas
une boucle. Le **taux réel n'est pas mesuré** dans ce dépôt, le revalidateur le confirme
(`P11-revalidation.md:135-136`). Mesure proposée, chiffrée : rejouer 20 sessions d'audit et compter
les reclassifications `residual` → `out_of_scope` ; seuil d'alerte **> 30 %** des clôtures
d'audit, qui déclencherait la réécriture de la taxonomie.

**6.2 — Régression sur les tests existants.** Fichiers concernés :
`packages/opencode/src/tool/goal-residual.test.ts` (**8** appels de
`blockingResidualFindings(` aux lignes `:21`, `:22`, `:26`, `:27`, `:28`, `:29`, `:31`, `:37` ;
le bloc `:35-38` est supprimé, il reste donc **7** appels à réécrire, et `:37` **ne compile plus**
contre la nouvelle signature), `packages/opencode/src/session/goal-evidence.test.ts` (ajouts purs,
aucun retrait), `packages/opencode/test/tool/goal-contract.test.ts`,
`packages/opencode/test/tool/registry.test.ts`, `packages/opencode/test/tool/parameters.test.ts`.
Base rouge préexistante : **8 échecs**, dont 4 snapshots dus au champ Lean `causedBy`, sans rapport
avec P11 (§7.2). Le critère de non-régression est « **0 nouvel échec** », pas « suite verte ».

**6.3 — Coût tokens / latence.** **0 token ajouté, 0 appel modèle ajouté** : R1 retire un
paramètre, R2 remplace un littéral par un prédicat, R3 ajoute un `.some()` sur un tableau de
chaînes **déjà borne par la taille de la mission**, R4/R5/R6 ne touchent à rien. Le seul surcoût
runtime est un test de regex de longueur 12 par chaîne de preuve, une fois par finding à la fusion.
**< 1 ms par clôture** est une estimation, pas une mesure : commande de vérification
`bun test ./src/tool/goal-residual.test.ts` avant et après, comparaison du temps affiché par
`bun test`, seuil d'acceptation **< 20 % d'écart**.

**6.4 — Sécurité / contournement.** R2 ferme la sortie à preuve **vide** ; R3 ferme la sortie à
preuve **creuse** ; R1 clause 1 ferme la sortie par réécriture du DoD ; R1 clause 2 ferme `closed` à
preuve creuse. Aucun permission nouvelle, aucun champ d'autorisation touché. Aucun évadement par
statut de finding n'est connu et non traité.

**6.5 — Dette.** `deliverable` devient un champ mort (R4) : coût de maintenance, aucun risque de
sûreté.

## 7. Tests

Commande, depuis `packages/opencode` :

```
bun test ./src/tool/goal-residual.test.ts ./src/session/goal-evidence.test.ts ./test/tool/goal-contract.test.ts ./test/tool/registry.test.ts ./test/tool/parameters.test.ts
```

### 7.1 — Nouveaux cas

| id | Fichier | Cas | Critère observable |
|---|---|---|---|
| **T1** | `packages/opencode/src/tool/goal-residual.test.ts` | Réécrire les **7** appels survivants (`:21`, `:22`, `:26`, `:27`, `:28`, `:29`, `:31`) vers la signature à un paramètre, et **supprimer le `test` `:35-38` entier** — pas seulement son assertion `:37`. Un `test` sans assertion passe, la suppression serait invisible. | **`exit 0` ET `3 tests → 2 tests`** (critère de **comptage**, pas seulement de code de sortie ; base mesurée `P11-verdict.md:39`) **ET `0` appel à deux arguments**, les 7 réécrits étant à un seul argument |
| **T2** | `packages/opencode/src/tool/goal-residual.test.ts` | `blockingResidualFindings([finding({ severity: "critical" })])` → longueur **1** ; idem `"high"` → **1**. | 1 élément : la garde n'est plus conditionnelle |
| **T3** | `packages/opencode/src/tool/goal-residual.test.ts` | `out_of_scope` `critical` **avec la preuve par défaut** `["probe exit 1"]` → longueur **0** (elle est substantive) ; `out_of_scope` `critical` avec `["x"]` → **1** (clause 2) ; `open` `critical` avec `["x"]` → **0** ; `closed` `critical` avec `["x"]` → **1** (clause 2) ; `closed` `critical` avec `["probe exit 1"]` → **0** | ces 5 longueurs, qui prouvent que la clause 2 ne casse pas `:29` et `:31` et ferme ce qu'elles laissaient passer |
| **T4** (RC#2) | `packages/opencode/src/session/goal-evidence.test.ts` — **extension d'un fichier existant de 28 lignes**, pas un fichier nouveau | **Base à préserver, nommée :** `describe("sticky goal findings")` `:9`, et ses **3 tests** — *« a narrower empty pass never erases an existing finding »* `:10-12`, *« refuses to close without evidence and closes monotonically with evidence »* `:14-20`, *« deduplicates retries and preserves first-seen ordering »* `:22-27`. **Ajouter 2 tests :** (a) finding **nouveau** `{ status: "out_of_scope", evidence: [] }` → `open` ; (b) finding **nouveau** `{ status: "out_of_scope", evidence: ["x"] }` → `open` (**R3**, preuve creuse) ; puis finding **existant** `open` + `{ status: "out_of_scope", evidence: ["x"] }` → reste `open` (**R3** sur `goal-evidence.ts:52`) ; puis `{ status: "out_of_scope", evidence: ["src/tool/goal-contract.ts:455"] }` → `out_of_scope` conservé. | **`3 pass → 5 pass`**, et **les 3 tests préexistants sont inchangés** — vérifié par le fait que les 2 ajouts ne modifient aucune des lignes `:10-27` |
| **T5** | `packages/opencode/test/tool/goal-contract.test.ts` | Scénario d'évasion principal : refus d'une clôture pour finding `critical` `residual`, puis `edit_objective({ dod: ["Inventorier les constats et documenter l'état actuel"] })`, puis nouvelle tentative. | la clôture est **refusée** ; la réécriture du DoD ne débloque rien. Piège : écrire explicitement un DoD d'engagement, sinon le test passe pour une preuve de non-régression alors qu'il prouve l'inverse — `MINIMAL_DOD_ITEM` est *« Produire une réponse utile et actionnable alignée avec la demande en cours. »* (`src/cli/cmd/tui/routes/session/goal-edit-parser.ts:1`), sans verbe d'engagement |
| **T6** | `packages/opencode/test/tool/goal-contract.test.ts` | Clôture avec le DoD **par défaut** `MINIMAL_DOD_ITEM` et un finding `critical` `residual`. | la clôture est **refusée**. Prouve que la garde ne dépend plus du texte du DoD (avant R1 ce cas passait, la garde étant inerte) |
| **T7** (RC#1) | `packages/opencode/test/tool/goal-contract.test.ts` | Clôture avec un finding `out_of_scope` `critical` et `evidence: ["x"]`, en nomination explicite du DoD. | la clôture est **refusée** — par `:610` après R3, ou par `:657` après R1 clause 2. C'est le test qui prouve la fermeture de O1 de bout en bout |

### 7.2 — Non-régression

Critère de succès, **atteignable** : **0 nouvel échec** parmi les 8 préexistants listés
ci-dessous. La suite ne peut pas être verte : exiger « `goal-contract.test.ts` passe » est
inatteignable, deux de ses tests sont rouges avant tout patch pour une cause tierce.

État préexistant **mesuré** par le validateur (`verdicts/P11-verdict.md:39` et `:111`), et non
estimé :

- `bun test ./src/tool/goal-residual.test.ts` → **exit 0, 5 tests, 15 `expect()` calls, 0 fail**
  (log `p11-goalresidual-baseline.log`) ;
- `src/session/goal-evidence.test.ts` → **3 tests verts** ; la relecture confirme 28 lignes, un seul
  `describe` `:9`, 3 `test` `:10`, `:14`, `:22`.

Ces deux lignes **clôtent** la réserve du cycle 1 (RC#3) : aucun `INFERE` ne subsiste ici.

Base rouge de la suite large, également mesurée (`P11-verdict.md:40`, commande
`bun test ./test/tool/goal-contract.test.ts ./test/tool/registry.test.ts ./test/tool/parameters.test.ts`,
**exit 1**, `86 pass / 8 fail`, `snapshots: 12 passed, 4 failed`, `94 tests across 3 files`) :

1. `create_objectif creates goalState with structured response` — `error: tool not found: create_objectif`
2. `edit_objectif updates only provided fields` — même cause
3. `tool parameters > JSON Schema (wire shape) > apply_patch` — snapshot
4. `tool parameters > JSON Schema (wire shape) > edit` — snapshot
5. `tool parameters > JSON Schema (wire shape) > task` — snapshot (champ Lean `causedBy`)
6. `tool parameters > JSON Schema (wire shape) > write` — snapshot (même cause)
7. `tool parameters > task > rejects missing prompt`
8. `(fail) (unnamed) [5000.65ms]` — hook `beforeEach`/`afterEach` timeout

Les échecs 3-6 ont une **cause unique et étrangère à P11** (ajout du champ Lean `causedBy`) : base
rouge périmée, pas régression. Si le patch touche les schémas de paramètres d'outils, ces 4
snapshots sont à mettre à jour **sans être imputés à P11**.

## 8. Effort

**`M`**, avec les seuils chiffrés falsifiables exigés par l'arbitrage A-2 — l'label seul n'est pas
un DoD d'effort acceptable, et chaque seuil est vérifiable parce qu'il satisfait
`proofIsSubstantive` (`:485-491`) et serait donc refusé par `:723` sans lui :

| seuil | valeur | base mesurée | commande qui produit la mesure |
|---|---|---|---|
| expressions de production | **≤ 6** sur **≤ 3** fichiers | R1 `:528`+signature+`:656`+`:671`+commentaire `:653-655` ; R2 `:41` ; R3 `:41`+`:52`+déplacement `:482-491` ; R4/R5/R6 = 0 | diff du patch |
| lignes de test ajoutées | **≤ 70** | T4 + 2 tests, T5, T6, T7 | idem |
| `goal-residual.test.ts` | **3 tests → 2 tests**, `0` appel à deux arguments | 5 tests / 15 `expect` (`P11-verdict.md:39`) | `bun test ./src/tool/goal-residual.test.ts` |
| `goal-evidence.test.ts` | **3 pass → 5 pass** | 3 tests (28 lignes, relu) | `bun test ./src/session/goal-evidence.test.ts` |
| non-régression | **0 nouvel échec** sur 8 | `86 pass / 8 fail` (`P11-verdict.md:40`) | `bun test ./test/tool/goal-contract.test.ts ./test/tool/registry.test.ts ./test/tool/parameters.test.ts` |
| latence | **< 20 % d'écart** | à établir au premier run | `bun test ./src/tool/goal-residual.test.ts` avant / après |

Tout dépassement d'un de ces seuils **rejette le label `M`** et renvoie la proposition en
revision ; le lot `L` est **refusé** (`P11-revalidation.md:167-169`).

## 9. Verdict self-assessment

`NEEDS_REVIEW` — sur **un seul** point, qui n'est pas un défaut de la proposition :

1. **Le sort de la branche `closed` de `goal-evidence.ts:51`.** R3 ne la touche pas, pour la
   raison mesurée du §4.3 : la réécrire casserait `goal-evidence.test.ts:14-20`. La clause 2 de R1
   la rattrape à la barrière, ce qui laisse un **dette de symétrie** : `closed` est réclassifié par
   la barrière et non par `mergeGoalFindings`, donc les deux Statutes ne sont pas d'accord, et un
   client qui lit `finding.status === "closed"` verra un statut que le contrat refuse. Le validateur
   doit trancher si cette dette doit être soldée dans P11 (et par la réécriture du test) ou portée
   comme dette assumée.

Décision de conception tracée au merge (RC#4) : voir R6 et `README.md:33`.

Objections **non traitées**, avec statut explicite :

| id | Objet | Statut | Motif |
|---|---|---|---|
| Dette de symétrie `closed` (§9.1) | statut que la barrière refuse mais que `mergeGoalFindings` accepte | **`residual`** | l'évasion est fermée par la clause 2 de R1 ; ce qui reste est une divergence de lecture, soldable seulement en réécrivant `goal-evidence.test.ts:14-20`. Décision de surface de test, renvoyée au validateur |
| Taux de sur-blocage `audit`/`plan`/`answer` | non mesuré | **`residual`** | non mesurable par `read` ; seuil d'alerte chiffré posé en §6.1 |
| Réécriture de `deliverable` hors de `GoalState` | dette de schéma | **`out_of_scope`** | R4 : aucun risque de sûreté post-R1 |
| Lot `L` (DoD typé + autorité d'écriture) | option de la version précédente | **`refused`** | `P11-revalidation.md:167-195` ; `M` est déjà le contenu intégral |
| Traces de base rouge (`86 pass / 8 fail`, 4 snapshots) | non rejouables sans shell | **`accepted`** | mesures héritées du validateur, reprises telles quelles en §7.2, pas rejouées par ce réacteur |