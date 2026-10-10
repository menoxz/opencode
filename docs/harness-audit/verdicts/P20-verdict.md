# Gabarit imposé — verdict de validation

## Proposal

`P20` — `inspect_batch` sous-exploité ; `AGENTS.md` contredit la doctrine globale
Fichier validé : `docs/harness-audit/proposals/P20-batch-first-doctrine.md` (387 lignes).

## Validator

`space-bunny-free`, `independent` — n'a pas rédigé la proposition.
Aucun fichier source modifié pendant cette validation : seules des lectures, des
agrégations SQL `readonly` sur `C:\Users\jeanl\.local\share\opencode\opencode.db`
(lecture seule) et des exécutions de tests.

## Status

`FAIL`

Portée du statut : **B1 est défendable et livrable tel quel** après la correction de
forme du §Objection 3. **A1/A2 ne sont pas livrés** — leur justification repose sur un
dénominateur faux et sur une mesure non reproductible localement. Le FAIL porte sur (a),
pas sur (b).

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | KO (2 défauts sur ~45 citations) | `packages/opencode/AGENTS.md:110` n'existe pas comme citation `forkDetach` (grep `forkSpawn\|forkDetach\|fire-and-forget` sur `AGENTS.md` → **1 seul hit, ligne 112**) ; `tools.ts` est cité sans chemin alors que le fichier est `src/session/tools.ts`, pas `src/tool/tools.ts` (`read` de `src/tool/tools.ts` → `File not found`). Toutes les autres citations sont confirmées : `read.txt:12/13/14`, `read.ts:7,271,350,356,357,362,379,397,408,458,482`, `read-ledger.ts:60,63,76,280,290,295,306,310,324,375,416,422,434,446`, `inspect-batch.ts:48,263,266,278,279`, `lean-output-policy.ts:1-3`, `instruction.ts:19,88,186`, `skill/index.ts:459`, `prompt-budget.test.ts:30-31`, `arity.ts:149`, `clipboard.ts:42`, `context-budget.test.ts:421`, `opencodev2/AGENTS.md:3,7,22,23,26` |
| le correctif supprime vraiment la cause | KO (a) / ok (b) | (a) la mesure d'efficacité n'est pas reproductible : agrégation sur `opencode.db` (672 804 parts, 190 947 tool parts) → `inspect_batch` = **0 part d'outil**, `read` = 61 096 appels. (b) `AGENTS.md:15-17` prescribing `tmux` est bien supprimé par B1 |
| le correctif ne casse pas un comportement existant | non-testé (T4/T5 rouges avant même le diff) | `bun test test/tool/read.test.ts src/tool/read-ledger.test.ts` → **exit 1** (échec `tool.read documents > reads video metadata…`, `ffprobe failed`, sans rapport avec le diff) ; `bun test test/session/context-budget.test.ts` → **exit 1** (`a beforeEach/afterEach hook timed out for this test`). T3 → **exit 0** |
| tests proposés sont exécutables dans ce dépôt | KO | T3 exécutable et vert (exit 0). T4 et T5 sont exécutables mais **leurs critères « exit code 0 » sont inatteignables dans cet environnement** avant tout changement : T4 casse sur `ffprobe`, T5 sur un timeout de hook à 5 000 ms |
| effort et coût annoncés réalistes | KO | « Effort **S** » (§8) est faux pour T4/T5 : ce ne sont pas des tests à rejouer mais deux échecs de baselines à repair avant de pouvoir servir de garde-fou. Le reste de l'estimation (4 lignes de texte) est exact |

## Objections

### Objection 1 — DÉCISIVE — le dénominateur « caractères par action » est faux, et le gain annoncé s'effondre à 1,02× (a)

La question posée est tranchée par le code, et la réponse invalide la mesure de §2.1.

**Un `read` et une action d'`inspect_batch` ne coûtent PAS le même prix de préfixe
rejoué — ils coûtent le MÊME : un tour.** `read` est déjà dans le set d'exécution
parallèle :

- `packages/opencode/src/session/tools.ts:123` — `export const SAFE_PARALLEL_LOCAL_TOOL_IDS = [`
- `packages/opencode/src/session/tools.ts:124` — `  "read",`

et une vague `inspect_batch` exécute jusqu'à 16 actions **dans un seul appel d'outil** :

- `packages/opencode/src/tool/inspect-batch.ts:288` — `const completed = yield* Effect.forEach(`
- `packages/opencode/src/tool/inspect-batch.ts:304` — `return read.execute(`
- `packages/opencode/src/tool/inspect-batch.ts:315` — `              { concurrency },`

Donc N lectures parallèles = 1 tour, et une vague = 1 tour. Le « caractère par
action » n'est pas comparable au « caractère par appel » que si l'on connaît
`actions/appel` des deux côtés. Mesuré côté `read` sur `opencode.db`
(`bun:sqlite` en `readonly`, script d'agrégation) :

```
read-only  turns=31621  calls=51985  chars/turn=10581.1  calls/turn=1.64  chars/call=6436.2
```

**1,64 appel `read` par tour.** Le modèle groupe déjà. Avec les chiffres de la
proposition pour l'autre côté — 212 actions / 49 appels = 4,33 actions par vague, et
508 090 / 49 = 10 369 car./vague — le rapport par tour vaut :

    10 581,1 / 10 369,2 = 1,020×

**Le gain tombe de 1,602× à 1,020×**, soit 2 % — et uniquement parce que le tour est
la seule unité qui compte. La seconde moitié du signal est perdue en route : une
vague est plafonnée à 16 000 caractères (`lean-output-policy.ts:2`,
`LEAN_INSPECT_TOTAL_CHARS = 16_000`) et à 4 000 par résultat (`:3`), donc une partie
de la production de la vague est **tronquée** (`inspect-batch.ts:236` `const
truncated = result.output.length > maxChars`, `:242` `inspectionExcerpt(...)`). La
proposition ne mesure nulle part le taux de troncature, qui dégrade le numérateur de
`inspect_batch` et rend le ratio final inconnu — potentiellement < 1.

Corollaire : la chaîne causale du §3.1 (« `read.txt:12` l'emporte → N appels `read` »)
est réfutée par la mesure. 205 appels à 1,64 appel/tour, c'est déjà du regroupement.

### Objection 2 — DÉCISIVE — sur les 6 groupes dupliqués, le ledger est un gain de tour 8× supérieur à celui que P20 propose (a)

La proposition mesure elle-même le chemin de rétention à 10 599 / 8 = **1 325
car./appel** (§2.2) et le compare à une moyenne `read` de 3 839,7. Le même calcul, sur
la seule unité qui compte :

- tour `read` normal : 10 581 car./tour (mesuré)
- tour `read` retenu (stub) : 1 325 car./tour (chiffre de la proposition)

soit **~8× d'économie sur ce tour**, contre **1,02×** pour le regroupement. Le
mécanisme que P20 qualifie de « correct, il est consulté trop tard » (§3.1) est en
réalité le levier le plus fort disponible, et il est **déjà en service**. A1/A2
réorientent l'effort vers le levier le plus faible tout en promettant explicitement à
l'agent unüstub « court » (§4.1 A1) que le tour le moins cher rendAnnotations-annotations.
`read.ts:397` `output: ReadLedger.producedStub(filepath, entry) + reminder` —
le chemin le moins cher réexpédie quand même le bloc d'instructions entier (§2.3,
constaté et delegated à P01).

### Objection 3 — (b) le risque de réinjection systémique n'est PAS évalué, et le modèle de mécanisme de la proposition est faux

La proposition affirme en §2.6 et §3.2 étape 4 que le fichier est réinjecté « **à
chaque lecture** ». C'est faux. Le code dit **une fois par tour** :

- `packages/opencode/src/session/instruction.ts:96` — `      // Track which instruction files have already been attached for a given assistant message.`
- `packages/opencode/src/session/instruction.ts:97` — `      claims: new Map<MessageID, Set<string>>(),`

La clé est le **MessageID**, pas l'appel de lecture. Observation directe pendant cette
validation, cohérente avec ce code : dans un seul appel `inspect_batch`, la lecture de
`src/tool/inspect-batch.ts` a produit un `<system-reminder>…packages\opencode\AGENTS.md`
et la lecture de `test/session/context-budget.test.ts` un autre
`…packages\opencode\test\AGENTS.md` — **deux fichiers d'instruction distincts, chacun
une fois**, pas deux rappels du même fichier.

Conséquence directe sur B1, que R5 nie : B1 remplace 3 lignes par 6 et **allonge le
fichier d'environ +330 caractères**, multipliés **par tour** (`instruction.ts:96-97`,
concaténés par `read.ts:357` `const reminder = loaded.length > 0 ? …`). Contre une
moyenne de 10 581 car./tour, c'est ~3 % — négligeable. Mais contre un tour **retenu**
(1 325 car./tour), c'est **~25 %**, et ce sont exactement les tours bon marché que le
ledger produit. R5 qualifie le risque de « borné à une instruction textuelle » sans
quantifier ce delta par tour.

Aggravant : le test censé couvrir ce risque ne peut pas le voir. T5 renvoie vers
`test/session/context-budget.test.ts:421` `"loaded config: AGENTS.md + skills stay
within budget"` — or ce test écrit un `AGENTS.md` **synthétique** dans un répertoire
temporaire ; il ne lit jamais `packages/opencode/AGENTS.md`. T5 est une fausse
garantie, et il est actuellement rouge.

### Objection 4 — (b) B1 couple un fichier du dépôt à un serveur MCP d'environnement

La question « la suppression de `tmux` crée-t-elle une divergence entre la doc et ce
que les agents font ? » se tranche par l'inverse : le remplacement **respecte** la
doctrine globale. `opencodev2/AGENTS.md:22` prescrit
`` 1. Start a temporary dev server only via a managed terminal (`mcp-terminal command_run mode=async`); record its handle and port. ``
et B1 reprend lancement + handle ; `:23` prescribe l'arrêt par handle enregistré et B1
reprise ; `:26` interdit le détachement et `tmux new-session -d` est du détachement.
Aucune contradiction résiduelle.

En revanche, un risque réel et non déclaré : `packages/opencode/AGENTS.md` est un
fichier **versionné du dépôt** (`git ls-files --error-unmatch
packages/opencode/AGENTS.md` → exit 0) alors que `mcp-terminal_command_run`,
`mcp-terminal_terminal_read` et `mcp-terminal_command_cancel` sont des outils **MCP
d'environnement**, présents dans cette session mais dont la disponibilité n'est
garantie par aucun fichier du dépôt. B1 remplace un échec bruyant et détectable
(`tmux` absent) par une dépendance à un serveur qui peut ne pas être connecté — et ce
dépôt n'a aucun moyen de l'exprimer.

### Objection 5 — (b) le catalogue des contradictions (§2.7) est incomplet

`packages/opencode/test/AGENTS.md` existe et s'injecte aussi (`observation directe :
« Instructions from: …\packages\opencode\test\AGENTS.md »`). Le tableau §2.7 claim
couvrir « y compris les verdicts négatifs » et l'omet. Sans effet sur la décision B1,
mais le tableau se présente comme exhaustif.

### Objection 6 — l'objection « réinvention du ReadLedger » n'est PAS fondée

Vérifié pour être complet : P20 **ne propose pas** de refuser un `read` dont la clé est
déjà dans le ledger. §5.1 le rejette explicitement, §4.1 A3 est marqué « facultatif,
NON inclus par défaut … Rejeté par défaut », §2.3 délègue `read.ts:357` à P01. Le
mécanisme existe et est correct :

- `read.ts:408` — `if (seen && ReadLedger.provenUnchanged(seen, mtime, size)) return unchanged(seen)`
- `read.ts:379` — `output: ReadLedger.duplicateStub(filepath, where) + reminder,`
- `read.ts:458` — `const elsewhere = ReadLedger.duplicateOf(ctx.sessionID, contentDigest)`

Mon arbitrage : **description seulement, ledger inchangé.** Durcir produirait un faux
échec sur une relecture légitime et violerait le fail-open de `config.ts:393`
(« Deterministic and fail-open; it never suppresses a call that can mutate »). Réserve :
le §9.1 laisse A3 ouvert alors que le §4.1 livre A1+A2 — une proposition
d'implémentation ne doit pas déléguer une décision au validateur.

### Objection 7 — le point F3 est résolu et va dans le sens de la proposition

La proposition laisse F3 ouvert (« le point de troncure réel du catalogue d'outils
n'est pas établi »). Il l'est : la description de l'outil `read` reçue dans le
**prompt de cette session** contient `read.txt` **intégral**, y compris
`read.txt:12` `Call this tool in parallel…` et `read.txt:14` — soit 14 lignes, très
au-delà de 200 caractères. `DESCRIPTION_DISPLAY_CHARS = 200`
(`skill/index.ts:459`) ne concerne que le **formateur de skills** ; A1/A2
atteindront bien le modèle. F3 → closed, aucun risque de troncature.

## Required changes

1. **Refaire la mesure de §2.1 au dénominateur « par tour », pas « par action ».**
   Publier `Σ caractères / Σ tours` par classe de tour (`read-only`,
   `inspect_batch-only`, `mixte`), avec `calls/turn` et `actions/call` des deux côtés,
   plus le taux de troncure des vagues (`inspect-batch.ts:236,242`). Sans cela, le
   chiffre 1,602× du dossier est biaisé d'un facteur ~1,6 et la conclusion ne tient
   pas. Remplacer partout « caractères par action » par « caractères par tour ».
2. **Constater explicitement que `inspect_batch` a 0 usage enregistré** (0 part
   `tool='inspect_batch'` sur 190 947 tool parts dans `opencode.db`, 61 096 appels
   `read`). Justifier une incitation vers un outil jamais exercé à cette échelle, ou
   retirer A1/A2 de ce lot.
3. **Réordonner le remède.** Si le gain de tour du ledger stub est ~8× supérieur à
   celui du regroupement sur les groupes dupliqués, soit P20 recentre (a) sur le
   cohort de tours retenus, soit il justifie explicitement pourquoi le regroupement
   reste prioritaire une fois le dénominateur corrigé.
4. **Corriger la chaîne causale du §3.1** : « N appels `read` » est réfuté par la
   mesure (1,64 appel/tour). Remplacer par le fait mesuré.
5. **Corriger le modèle de réinjection** dans §2.6 et §3.2 étape 4 : une fois **par
   tour** (`instruction.ts:96-97`), pas à chaque lecture.
6. **Ajouter à R5 le delta par tour de B1** (~+330 caractères par tour, ~3 % d'un tour
   `read` normal, ~25 % d'un tour retenu par le ledger) et **remplacer T5** par un test
   qui mesure la taille réelle de `packages/opencode/AGENTS.md` dans le budget, pas un
   `AGENTS.md` synthétique.
7. **Résoudre A3 dans le texte** (§9.1) : « exclu, décision du validateur », au lieu
   d'une option ouverte dans un lot livré.
8. **Réparer ou remplacer T4 et T5** : `ffprobe failed` et le timeout de hook à
   5 000 ms sont des échecs de baseline indépendants du diff. Un critère « exit 0 »
   aujourd'hui inatteignable n'est pas une non-régression.
9. **Corriger deux citations** : `AGENTS.md:110` n'est pas un hit `forkDetach` (seul
   `:112` l'est) ; écrire `src/session/tools.ts` en entier plutôt que `tools.ts`.
10. **Ajouter `packages/opencode/test/AGENTS.md`** au catalogue §2.7, avec verdict.
11. **B1 : mentionner la dépendance MCP** dans le texte remplacé, ou justifier que
    `packages/opencode/AGENTS.md` peut presumer un serveur MCP d'environnement.

## Implementation guidance

Si B1 est livré avant re-travail de (a) : patch unique de 3 lignes dans
`packages/opencode/AGENTS.md:15-17` (fichier versionné, `git status` propre), puis
T6 (`rg -n "tmux" packages/opencode/AGENTS.md` → 0 ligne ; aujourd'hui `:15`, `:16`,
`:17` confirmées) — c'est le seul contrôle signifiant, et il est exécutable. Rejouer
`test/session/context-budget.test.ts` seulement après avoir_soigné le timeout de hook,
et ne pas compter dessus comme garantie. Ne pas toucher à `read-ledger.ts` : le
mécanisme est correct et testé ; seul `arity.ts:149` (`tmux: 2`) devient orphelin,
finding résiduel à statuer séparément. Pour (a), le fichier de test à créer reste
`test/tool/read-description.test.ts` (T1) mais ses assertions doivent porter sur le
texte réellement livré au modèle, c'est-à-dire `read.txt` complet — ce que F3 confirme
être la bonne cible.