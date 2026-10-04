# Verdict de validation — P19

## Proposal

`P19` — `turn_plan` : coût de planification non borné.
Fichier validé : `docs/harness-audit/proposals/P19-turn-plan-cost.md` (376 lignes).

## Validator

`opencodev2 / agent Space Bunny` — `independent` : n'a ni rédigé, ni relu la
proposition avant de l'auditer. Aucun fichier source modifié pendant la
validation ; seules des lectures et des `grep` ont été exécutés.

## Status

`PASS_WITH_CHANGES`

Le diagnostic central de la proposition est **exact et vérifié dans le code** :
`prompt.ts:1872` accorde `"execute"` à une déclaration qui n'a été confrontée à
aucune observation, ce qui transforme `continuation.ts:77-78` en continuation
inconditionnelle. Le mécanisme, lui, est réel et correctement décrit.

Le statut n'est pas `PASS` pour deux raisons indépendantes, chacune
bloquante par elle-même : (a) le critère de succès proposé est invalide et se
déplace dans le mauvais sens quand le patch réussit ; (b) la Partie A retire une
autorité de poursuite sans une seule mesure du risque de régression. Ce sont des
défauts de méthode, pas de diagnostic : corrigeables dans le document.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok — 22/22 | `src/session/turn-plan.ts:213`, `:218`, `:23-25`, `:27`, `:40`, `:69-80`, `:121-134`, `:142-148`, `:200-202` ; `src/session/prompt.ts:1753`, `:1755`, `:1857`, `:1866`, `:1867-1872`, `:1872`, `:1887`, `:1920-1931`, `:1929` ; `src/session/continuation.ts:77-81` ; `src/config/config.ts:340` ; `src/tool/registry.ts:410` ; `src/session/message-v2.ts:322` ; `src/session/turn-plan.test.ts:34-40`, `:42-50`, `:108-123`, `:176-179` ; `test/session/message-v2.test.ts:1706` |
| le protocole est injecté par le code, pas par la config opérateur | ok | `turn-plan.ts:210 instruction()` construit `<turn_plan_protocol>` ; `prompt.ts:1887` le pousse inconditionnellement. La config ne fait que basculer un booléen : `~/.config/opencodev2/opencode.json:1192` et `.jsonc:1189` → `"turn_plan": true`. Aucun `AGENTS.md` ni fichier de config ne contient le texte du protocole (grep sur `~/.config/opencodev2` : aucun hit sur « On every turn » / « BATCH this turn ») |
| la proposition connaît et évalue ce risque | ok | §2 le traite correctement : « Le module est opt-in et désactivé par défaut », « Ce n'est pas une fuite, c'est un coût choisi ». Aucune modification de config opérateur n'est proposée |
| le correctif supprime vraiment la cause | ok | `prompt.ts:1867-1872` est le **seul** chemin qui accorde `declaredIntent = "execute"` sans passer par `TurnPlan.declaredIntent()` (`prompt.ts:1885`) ; `continuation.ts:77-78` en fait la condition de `continue` |
| la contradiction interne du protocole est réelle | ok | `turn-plan.ts:213` (« On every turn ») contre `turn-plan.ts:218` (« Declare only what genuinely remains ») — même tableau, lignes 5 et 11 |
| le correctif ne casse pas un comportement existant | ok | grep sur `test/session/*.test.ts` : **zéro** occurrence de `declaredIntent`, `TurnPlan`, `declared-intent`. Le risque résiduel annoncé par la proposition (« je n'ai pas lu ce fichier ») est levé. `turn-plan.test.ts:107-122` teste `declaredIntent()` pur, que ni A ni B ne touche |
| tests proposés sont exécutables dans ce dépôt | ok | l'alias `@/session/...` est résolu dans `test/session/` (22 imports, ex. `test/session/overflow.test.ts:5`) ; le chemin `test/session/turn-plan-dedup.test.ts` est cohérent avec `prompt.test.ts` / `message-v2.test.ts` déjà présents |
| effort et coût annoncés réalistes | KO | coût en tokens自有 : gains non garantis, sacrifice non chiffré (O1, O2, O3) |
| options distinctes et correctement comparées | ok | déduplication / cadence / plafond sont trois leviers réellement distincts ; cadence et plafond sont rejetés pour de bonnes raisons (`turn-plan.ts:127` rend le plan consommable une seule fois ; le refus non annoncé coûterait un tour). Réserve de forme seulement (O5) |
| sacrifice chiffré | KO | aucun chiffre de régression (§9 point 2 est qualitatif) |

## Objections

### O1 — CRITIQUE. Le critère de succès est invalide et va à l'encontre du résultat recherché (§7.3)

La proposition exige : « après la Partie A, le rapport appels/étapes de `turn_plan`
sur le même parc de 7 jours passe **sous 0,628** ».

Le dénominateur est le nombre de tours de boucle : `prompt.ts:1745` `let step = 0`,
`prompt.ts:1948` `step++`. Or la Partie A supprime précisément ~une itération par
déclaration. Le numérateur (4 368 appels) est produit par le protocole et ne
baisse pas ; le dénominateur (6 955 étapes) **baisse**. Le ratio monte donc sur un
succès.

Preuve chiffrée : 4 368 / 6 955 = 0,628. Si les itérations supprimées sont de
l'ordre du nombre de déclarations, 4 368 / (6 955 − 4 368) = **1,69**. Le critère
réussi échoue, le critère échoué passe.

**Ce qu'il faut changer** : remplacer tout ratio dont le dénominateur est un coût
réduit par le patch. Les grandeurs monotones disponibles sont (a) le nombre total
d'étapes (`prompt.ts:1948`), (b) le total `cache_read`, (c) le nombre de tours où
`decision.reason === "declared-intent"` — déjà journalisé en clair à
`prompt.ts:1931` (`slog.info("auto-continue", { step, idleContinues, reason })`).
Ce troisième compte est la preuve directe que la cause visée a été supprimée.

### O2 — CRITIQUE. La Partie A retire un garde-fou sans chiffrer ce qu'elle sacrifie

La Partie A supprime l'unique chemin qui maintient un run ouvert quand la boucle
n'a plus rien d'exécutable : `continuation.ts:77-78`
`if (input.declaredIntent !== "execute") return { action: "stop", ... }`.
`turn-plan.ts:23-25` prétend que le plan ne fait que « refine » ce cas ambigu ;
la branche retirée fait de la prédiction elle-même le verdict.

Le §9 point 2 admet le fait — « `prompt.ts:1872` peut aujourd'hui tenir des runs
ouverts qui se seraient arrêtés » — puis tranche sur un argument qualitatif
(« le plan n'a à ce stade rien été confronté à une observation »). C'est un
arbitrage de qualité, et il est Presented comme tel ; il n'est pas chiffré. La
section 6 qualifie le risque tokens/latence de « négatif dans les deux parties »
sans jamais poser le risque symétrique : des exécutions écourtées qui, elles,
cassent.

Or la mesure est faisable et bon marché : `slog.info("auto-continue", …)` existe
déjà (`prompt.ts:1931`). Le nombre de tours dont la seule raison de continuer est
`"declared-intent"` **est le sacrifice的直接** — exactement la grandeur que la
Partie A supprime, et elle est déjà dans les logs.

**Ce qu'il faut changer** : avant fusion, compter sur un échantillon de sessions
les tours où `reason === "declared-intent"` et `hasToolCalls === false`. Ce
compte est le risque de régression maximal. Le fixer comme seuil bloquant. Sans
lui, livrer B seule — ce que la proposition reconnaît elle-même comme recevable
(§5, « Ne rien changer »).

### O3 — MAJEUR. La Partie B casse silencieusement l'ordre de récence LRU, ce qu'aucun test ne couvre

`declare()` est documenté comme réinsérant pour que l'éviction suive la récence :

```ts
// turn-plan.ts:72
  // Re-insert so the eviction order below follows recency, not first write.
  plans.delete(sessionID)
```

Le code de la Partie B retourne **avant** ce `plans.delete` :

```ts
if (live && JSON.stringify(live.plan) === JSON.stringify(normalized)) return live.plan
```

Conséquence : une déclaration identique ne rafraîchit plus la position de
récence. Sous pression de `MAX_SESSIONS` (`turn-plan.ts:40` = 200), la session la
moins récemment *réaffirmée* est évictée — ce qui est une autre politique que celle
documentée à la ligne 72. Le test d'éviction existant
(`turn-plan.test.ts:42-50`) déclare `"old"` puis des `"new"` distincts : il ne
passe pas par le chemin de déduplication et **ne détecte pas ce changement**.

**Ce qu'il faut changer** : soit déplacer le contrôle de déduplication après le
`plans.delete` / rafraîchissement de récence, soit documenter le changement de
politique d'éviction et ajouter un test qui le verrouille.

### O4 — MAJEUR. Le numérateur est mal interprété, et le dénominateur entre en collision avec le registre d'audit

§2 : « **70 % des étapes se terminent par un `turn_plan`** : dans sept cas sur
dix, la déclaration est la dernière action du tour ». Ce n'est pas ce qui a été
mesuré. 342 appels / 485 étapes = 0,705 est un **nombre d'appels par tour**, pas
une proportion de tours finissant par une déclaration. Rien dans le code
n'installe un invariant « un appel `turn_plan` par message assistant » :
`registry.ts:410` enregistre l'outil sans contrainte, et le protocole demande
explicitement des appels groupés (`turn-plan.ts:213`, « parallel tool calls »
verrouillé par `turn-plan.test.ts:184`). Deux déclarations dans un même tour sont
légales, et après Partie A elles deviennent *plus* probables (une déclaration de
la tour N n'est plus suivie d'une itération forcée). L'inférence « dernière action
du tour » n'est donc pas établie.

Dans le même ordre : `docs/harness-audit/README.md:41` annonce pour P19
« **0,70** appel par étape » tandis que §2 annonce 0,628. Ce sont deux
populations (session auditée 342/485 vs parc 7 j 4 368/6 955) mais le même mot,
« par étape ». Le critère §7.3 se compare à 0,628 pendant que le registre affiche
0,70.

### O5 — MINEUR. Trois formulations non soutenues par le code

1. « **premier poste d'usage après `bash`** » (§2) n'a aucune citation. La donnée
   voisine, `README.md:31`, donne 71 % **des appels** pour `bash` : part
   d'appels, donc pas comparable à un ratio appels/tours.
2. « La boucle de la section 3 est donc **réellement non bornée**, et pas
   seulement bornée par `AUTO_CONTINUE_LIMIT` » (§2) est contredit par
   `continuation.ts:5` (`AUTO_CONTINUE_LIMIT = 4`), `continuation.ts:79` et
   `continuation.ts:71` (`stepLimitReached` → `stop`). L'argument réel est plus
   étroit et correct : chaque déclaration remets `idleContinues` à zéro
   (`prompt.ts:1857` filtre `hasToolCalls` **avant** `prompt.ts:1872`), donc le
   budget d'inactivité ne peut pas atteindre 4 quand le modèle déclare. Le dire
   ainsi ; « non bornée » est excessif et sera cité contre la proposition.
3. §4 renvoie le débat sur l'adoucissement de « On every turn » à « la section 9,
   point 2 » — or ce point traite de l'autorité `execute`, pas de l'instruction.
   Le levier le plus rentable en surface n'est débattu nulle part, alors qu'il est
   le seul des trois qui entre en conflit direct avec
   `turn-plan.ts:218` (« Declare only what genuinely remains ») et ne peut donc
   pas être simplement reporté. Texte corrompu à signaler au passage dans le §5 :
   « incompatible avec leusi-même du plan », « n'a rien à EPL ».

## Required changes

1. **Remplacer le critère §7.3** par des grandeurs monotones : nombre total
   d'étapes (`prompt.ts:1948`), total `cache_read`, et nombre de tours où
   `decision.reason === "declared-intent"` (`prompt.ts:1931`). Interdire tout
   ratio dont le dénominateur est un coût que le patch réduit.
2. **Chiffrer le sacrifice de la Partie A avant fusion** : compter sur un
   échantillon les tours `reason === "declared-intent" && hasToolCalls === false`.
   Le fixer comme seuil d'acceptation explicite. Sans ce chiffre, livrer B seule.
3. **Corriger la Partie B** pour préserver (ou assumer et tester) la récence
   d'éviction de `turn-plan.ts:72-78`, et ajouter le test qui la verrouille.
4. **Réécrire la mesure « 70 % des étapes se terminent par un `turn_plan` »** en
   « 0,705 appel par tour », ou mesurer la distribution réelle (part des tours
   portant ≥ 1 appel).
5. **Aligner `README.md:41` et §2** sur un seul triplet (numérateur,
   dénominateur, population).
6. **Retirer ou étayer** « premier poste d'usage après `bash` », en distinguant
   part d'appels et ratio par tour.
7. **Réécrire « réellement non bornée »** (bornes survivantes : `continuation.ts:5`
   via `:79`, et `:71`) et corriger le renvoi erroné à « section 9, point 2 ».
8. **Trancher l'instruction `turn-plan.ts:213`** dans la proposition même : soit
   on l'adoucit en assumant le conflit avec `:218`, soit on acte qu'elle reste et
   on retire la phrase « le correctif le plus rentable en surface ». Ne pas
   laisser le point ouvert.

## Implementation guidance

Patcher **A seule** d'abord, mesurer O1/O2, puis décider de B — ne pas les
livrer ensemble, seule A est mesurable par construction. Ordre : (1) supprimer
`declaredIntent = "execute"` en `prompt.ts:1872` ; (2) `bun test src/session/turn-plan.test.ts test/session/prompt.test.ts test/session/message-v2.test.ts`
depuis `packages/opencode` — aucun de ces trois fichiers n'asserte
`declaredIntent`, la régression est donc détectable uniquement par le parc ; (3)
rejouer l'échantillon `reason === "declared-intent"` ; (4) seulement ensuite, B,
avec le correctif de récence de O3 et le fichier
`packages/opencode/test/session/turn-plan-dedup.test.ts` déjà écrit dans §7 (ses
trois cas sont corrects : la « refine » couvre `expect` modifié, le « after
settle » est légitime puisque `settle()` supprime l'entrée à
`turn-plan.ts:127`). Piège connu : ne pas oublier que
`turn-plan.test.ts:176-179` doit rester vert — c'est le verrou qui empêche
d'adoucir « On every turn » par accident.
