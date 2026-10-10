# P07 — revalidation vague 4 (3ᵉ vague, sur proposition révisée une seconde fois)

Révalidateur indépendant. Je n'ai rédigé ni la proposition initiale, ni aucun verdict, ni aucune révision ; je
n'édite ni la proposition ni le code (**C-36**). Aucun `git`, aucun commit, aucun fichier modifié sous
`packages/**`.

**Objet exact de cette revalidation.** La revalidation précédente (`verdicts/P07-revalidation.md`, 195 lignes) a
porté `REVALIDATED-PASS_WITH_CHANGES` sur une proposition de **403 lignes**, avec deux résidus `open` : `N1` et
`N2`. Le texte à valider aujourd'hui en compte **384** (relecture intégrale, fichier entier porté au contexte) et
annonce `RESIDUES_REMAINING=0`. Je vérifie les deux corrections **sur le disque**, pas sur le rapport de l'agent
de révision.

**Base de mesure, mesurée par moi.** `bun typecheck` dans `packages/opencode` → **`TYPECHECK_EXIT=0`** (log :
`C:\Users\jeanl\AppData\Local\Temp\opencodev2\p07-typecheck.log`, contenu unique `$ tsgo --noEmit`, aucune erreur).
Contrairement à la 1re lecture de la c2, **cette vague ne voit aucune erreur** dans `src/tool/shell.ts` : **C-62
n'est pas déclenché**, je n'ai donc rien à signaler de ce chef et surtout rien à corriger. Je n'ai lancé **aucun**
test, et en particulier aucun test qui touche `src/tool/shell.ts` (interdiction absolue, deux agents y travaillent).
La base verte opposable `test/shell/shell.test.ts` **12 pass / 0 fail** est reprise de l'état de mesure fourni et
**je ne l'ai pas rejouée** ; elle ne fonde aucune affirmation de ce rapport. Codes de sortie de mes sondes :
`rg input.directory` → `0` (6 lignes) ; `rg input?.directory` → `0` (7 lignes) ; `rg ctx.directory` sur `src/tool`
→ `0` (1 ligne) ; `rg session.directory` sur `src` → `0` (10 lignes) ; sonde `T3` → **`RG_EXIT=1`**, qui est le
code de non-match de `rg` et non une erreur, avec témoins positifs `T1`/`T2`/`T4` → `RG_EXIT=0` (**C-66**,
**C-123**, motif **ASCII**).

## Proposal

| champ | valeur |
| --- | --- |
| fichier | `docs/harness-audit/proposals/P07-subagent-contract.md` |
| taille validée | **384 lignes** (réécriture complète, `:3`) |
| taille validée par la c2 | 403 lignes |
| taille validée par la vague 3b | 638 lignes |
| volet unique | §4(a) `:223-239` — homologuer `tests` du packet vers `goalState.completion.evidence` au point `task.ts:511-513` |
| volets écartés | §4(b) schéma exporté `:241` ; §4(c) héritage du répertoire `:256` |
| tests retenus | T1 `:316`, T2 `:328`, T4 `:334`, T5 `:341` |

**Décalage de numérotation à ne pas lire comme une régression.** La c2 citait le titre de §4(b) en `:240` ; il est
en `:241` aujourd'hui. La correction de `N1` a inséré deux lignes en `:194-195`, ce qui décale la numérotation
aval. Aucune citation de la c2 n'est devenue fausse de ce fait : `P07:241` porte bien « ### (b) Durcir le schéma
exporté — *écarté, sur la base de E1* », et `P07:256` porte bien l'écartement de §4(c).

## Revisions applied

**N1 — traité, et le chiffre est exact.** `P07:192` affirmait « **le seul endroit** du fichier où
`input.directory` apparaît ». Le texte courant dit : « Il n'est pas le seul : `grep input.directory` sur
`src/session` rend six lectures, réparties sur quatre sites — `:553` (construction de l'`Info`), `:936-937`,
`:942-943` et `:984` (filtres de listage) ».

Je **recompte moi-même**, et le recomptage est cette fois-ci en motif littéral, comme le texte l'annonce :

```
rg -n "input\.directory" packages/opencode/src/session      → RG_EXIT=0
  session.ts:553   directory: input.directory,
  session.ts:936         input.directory
  session.ts:937           ? or(...conds, and(isNull(SessionTable.path), eq(SessionTable.directory, input.directory)))!
  session.ts:942     if (input.directory) {
  session.ts:943       conditions.push(eq(SessionTable.directory, input.directory))
  session.ts:984     conditions.push(eq(SessionTable.directory, input.directory))
```

**Six lectures, quatre sites : le compte et les emplacements annoncés sont exacts au numéro de ligne près.**
`:553` est bien la construction de l'`Info` (`directory: input.directory`), `:936-937`/`:942-943`/`:984` sont bien
des filtres de listage. La clause d'unicité a disparu et l'argument de §4(c) — le `cwd` ne vient pas du filtre —
ne s'appuie plus sur aucune cardinalité. **La correction est juste ; je n'ai pas à la refaire.**

**N2 — traité, suppression effective et sans renvoi pendouillant.** La sonde est en motif **ASCII** `T3`, sur le
fichier lui-même, avec témoins positifs dans le même fichier et la même commande :

```
rg -n --fixed-strings T3 <proposition>  → RG_EXIT=1  COUNT=0   (non-match, pas une erreur)
rg -n --fixed-strings T1 <proposition>  → RG_EXIT=0  COUNT=3   (témoin positif)
rg -n --fixed-strings T2 <proposition>  → RG_EXIT=0  COUNT=3   (témoin positif)
rg -n --fixed-strings T4 <proposition>  → RG_EXIT=0  COUNT=2   (témoin positif)
```

Le zéro est donc **positivement contrôlé** (**C-66**, **C-123**) : la commande fonctionne et rend `T1`, `T2`, `T4`.
Contrôle structurel par relecture : `:328` est `### T2 — la fusion reste bornée…` et `:334` est `### T4 — garde de
non-régression du message d'erreur (volets a et b)` ; la jonctionannounced est bien `T2 → T4`.

**Le contrôle que la c2 n'avait pas fait, et qui était le vrai risque du N2 : le renvoi pendoulant.** Je vérifie
que rien, dans le texte restant, ne continue de désigner T3 :

- `:349` — la commande de §7 ne cite que trois fichiers : `task-evidence-merge.test.ts`,
  `task-decode-guard.test.ts`, `task-child-directory.test.ts`. Aucun n'était le fichier de T3, et aucun n'est
  orphelin.
- `:79` — la phrase que l'agent de révision dit avoir reprise dit désormais « **aucun test de §7 ne porte sur
  lui** », ce qui est exact depuis la suppression : le seul test qui visait le court-circuit `??` était T3.
- `:361` — « **READY** pour (a), avec T1 et T2, qui discriminent. » — énumération cohérente.
- `:374` — « (a) seul d'abord […] avec T1-T2 discriminants. Puis T4 et T5 comme gardes de non-régression. » —
  énumération cohérente, sans T3.

La suppression est donc **propre** : ni bloc résiduel, ni renvoi, ni énumération incohérente.

**R1 — toujours traité.** §4(b) reste écarté sur preuve de E1 (`:241`), la garde de décodage reste conservée et
motivée par son message actionnable (`:246-248`, `task.ts:396`), et la forme variadique à deux arguments reste
explicitement écartée au profit d'une forme tableau (`:251-253`, « la forme variadique à deux arguments n'est
pas celle que cette révision a pu vérifier dans le dossier »). Aucun des trois défauts aggravants de la vague 3b
n'est revenu.

**R2 — traité, mais par un chemin différent de celui de la c2 : c'est le seul point où N2 aurait pu casser une
exigence, et je l'ai cherché explicitement.** La c2 classait `R2` `accepted` parce que T3 (`:333-351` alors)
portait les trois conditions discriminantes. T3 n'existe plus. L'exigence « rendre T3 discriminant » devient donc
sans objet, et je ne peux pas la déclaré satisfaite au même titre qu'avant. Je vérifie ce qui reste à la place :
`:77-79` affirme que le court-circuit `??` de `task.ts:694-695` est « **structurellement incapable** de distinguer
deux mondes » et qu'« aucun test de §7 ne porte sur lui » — ce qui est exact, T3 ayant été le seul test de cette
cible. Le mécanisme de budget est écarté comme correctif en `:283-286` (alternative 3). Aucun test résiduel ne
revendique donc cette cible, et aucun §9 ne la revendique. **R2 reste traité** : la non-discrimination est
maintenant **argumentée** au lieu d'être **testée**, ce qui est cohérent avec le retrait du test. J'ai vérifié
`task.ts:694` `const minutes = next.budgetMinutes ?? taskBudgetMinutes()` et `:695` `withBudget(runTask(), minutes)`
— le « ?? » visceral est réel, la conclusion du texte est juste.

**R3 — toujours traité, prémisse mesurée une seconde fois.** §4(c) reste écarté « établi par lecture » (`:256`).
Je rejoue les trois lectures qui fondent cet écart, au caractère près : `prompt.ts:719` `const ctx = yield*
InstanceState.context`, `prompt.ts:731` `path: { cwd: ctx.directory, root: ctx.worktree }`, `session: Session.Info`
bien déstructuré en `prompt.ts:715`/`:718` sans être la source du `cwd` ; `system.ts:97` même contexte,
`system.ts:103` `  Working directory: ${ctx.directory}`. Et je rejoue les deux **comptes** que la c2 avait mesurés :
`rg ctx.directory` sur `src/tool` → **une seule** ligne, `registry.ts:245  directory: ctx.directory,` ;
`rg --fixed-strings session.directory` sur `packages/opencode/src` → **10** lignes, toutes dans des chemins
d'affichage (`acp/agent.ts:652`, `cli/cmd/session.ts:144`, `cli/cmd/tui/routes/session/index.tsx:734`,
`session-nav-panel.tsx:162`, `session-nav.ts:178,221,242,243,293,296`), **aucune** dans le chemin de lancement.
Les deux chiffres de la c2 se reproduisent exactement ; la prémisse de la vague 3b reste réfutée.

**Les affirmations de la c2 qui portaient sur des lignes de code ont toutes tenu.** Je les relis une à une :
`task.ts:506` `if (!current.goalState || packet.findings.length === 0) return` ✓ ; `task.ts:509-517` écrit le
`goalState` parent ✓ ; `task.ts:511-513` `goalState: { …current.goalState, findings,` ✓ ; `task.ts:514`
`version: current.goalState.version + 1` ✓ ; `task-evidence.ts:40` `item.proof.slice(0, 1_000)` ✓, `:42`
`item.dod.slice(0, 500)` ✓, `:62` `tests: allTests.slice(0, 32)` ✓, `:39-43` et `:44-48` conformes ✓ ;
`task.ts:391-399` applique `Schema.decodeUnknownEffect(LaunchParameters)` et produit la `Tool.InvalidArgumentsError`
au message de `:396` ✓ ; `task.ts:549-552` sort de boucle avec le texte ✓ ; `task.ts:579` porte bien
`evidence_packet: packet` dans le `metadata` du chemin de fond ✓ ; `task.ts:722-726` appelle `output` ✓ ;
`task.ts:741-744` expose `Parameters` et `execute` ✓ ; `session.ts:670-690` — `create` **ne prend pas**
`directory` et passe `directory: ctx.directory` en `:682`, `:683` `path: sessionPath(ctx.worktree, ctx.directory)`,
le bloc cité par `P07:186-189` est reproduit au numéro de ligne près ✓ ; `session.ts:219` est bien
`directory: Schema.String` dans `Info` ✓. **Aucune des affirmations de la c2 sur le code n'est tombée.**

## Status

Statuts posés selon la table du gabarit (`REVALIDATION-BRIEFS.md:61-66`), où `open` seul est bloquant. Je n'emploie
pas `refused` : aucune objection n'a été démontrée fausse — `N1` et `N2` étaient **fondées**, et l'agent de
révision les a corrigées au lieu de les contester.

| résidu | exigence | statut courant | preuve |
| --- | --- | --- | --- |
| **R1** | réécrire §4(a) en `Schema.Union` tableau + garde conservée | **`accepted`** | §4(b) écarté `:241` ; garde motivée `:246-248` ; variadique écartée `:251-253` |
| **R2** | rendre T3 discriminant | **`accepted`** | T3 supprimé sous N2 ; sa cible est désormais **argumentée** comme non discriminant (`:77-79`) au lieu d'être testée ; `task.ts:694-695` relus |
| **R3** | asserter le cwd effectif ; conditionner (c) à la preuve | **`accepted`** | §4(c) écarté `:256` ; `prompt.ts:719`/`:731`, `system.ts:97`/`:103` relus ; `ctx.directory` sur `src/tool` = **1** ; `session.directory` sur `src` = **10**, toutes affichage |
| **R5** | corriger `942-943` → `936-937` ; vérifier `task.ts:236` | **`accepted`** | remplacement `:11`, `:936-937` exacte ; argument de l'enveloppe retiré `:99-103` |
| **N1** | retirer l'unicité fausse de `:192` | **`accepted`** | **fermé** — `P07:192-195` ; recomptage indépendant : **6 lectures / 4 sites**, emplacements exacts |
| **N2** | supprimer le bloc T3 | **`accepted`** | **fermé** — `T3` → `COUNT=0` (ASCII, témoins `T1`/`T2`/`T4` positifs) ; jonction `T2` `:328` → `T4` `:334` ; renvois `:79`/`:349`/`:361`/`:374` cohérents |
| **I1** | (nouveau, `info`) | **`accepted`** | voir `## Remaining objections` |
| **I2** | (nouveau, `info`) | **`accepted`** | voir `## Remaining objections` |

**Zéro résidu `open`.** La proposition est donc **implémentable** au sens de la règle d'implémentabilité
(`REVALIDATION-BRIEFS.md:69-71`).

## Remaining objections

**Aucune objection `open`, `out_of_scope` ou `refused`.** Les deux résidus `open` de la c2 sont clos et vérifiés. Je
lève deux observations de rang `info`, tracées pour la suite du cycle, qui **ne bloquent rien** et que je ne fais
volontairement pas monter en `open` : ni l'une ni l'autre n'est une affirmation fausse, et les requalifier en
`open` ferait chuter le document pour un motif qui n'existe pas.

**`I1` — `info`, statut `accepted` — la formulation de `:194-195` est plus lâche que son compte.**
`P07:194-195` ajoute « `session.ts:219` appartient au même ensemble d'appels ». `session.ts:219` est
`directory: Schema.String,` dans la déclaration du schéma `Info` : c'est un **champ déclaré**, pas une lecture de
`input.directory`, et `grep input.directory` ne le rend pas. Un lecteur qui le compterait comme un cinquième site
obtiendrait « 5 sites » là où le texte annonce « quatre sites ». **Aucune contradiction de cardinalité n'est
énoncée** — l'énumération des quatre sites est close avant cette phrase, et elle est exacte — mais la locution
« même ensemble d'appels » est imprécise sur un point qui est précisément celui que `N1` portait. Remède, une
ligne : écrire « `:219` est la déclaration du champ dans le schéma `Info`, et non une lecture ; `:553` en est la
construction ».

**`I2` — `info`, statut `accepted` — le compte est exact sous le motif annoncé, et ne l'est pas sous un motif élargi.**
Le texte annonce le motif qu'il a utilisé (`grep input.directory`, littéral) : sous ce motif, **six** lectures et
**quatre** sites, ce que mon recomptage confirme à la ligne près. Mais le motif élargi `input?.directory` rend
**sept** lignes sur **cinq** sites, la septième étant `session.ts:983  if (input?.directory) {`, qui précède le
`:984` annoncé dans le même filtre de listage. Je n'ai pas trouvé de contradiction : une affirmation de compte
accompagnée de son motif et vérifiable par ce motif n'est pas fausse, et le nombre annoncé est juste. Je trace
l'écart parce qu'un futur lecteur pourrait élargir le motif et lire « sept » contre « six » sans voir la
différence. Remède, une ligne, facultatif : préciser « six lectures sous le motif littéral `input.directory` ; le
champ est aussi lu en `:983` via `input?.directory` ».

## Regressions introduced

**Aucune régression introduite, et aucun test vert cassé.** Déclaration exigée par la règle 1 du gabarit.

- **Préexistant, non introduit :** les deux erreurs `TS2339` dans `src/tool/shell.ts:701`/`:705` vues par la 1re
  lecture de la c2 sont **absentes** de ma lecture de cette vague (`TYPECHECK_EXIT=0`). Elles portaient sur un
  fichier en cours d'édition concaténée par un autre agent ; le cycle s'est refermé. Je ne les ai pas corrigées et
  je n'avais rien à signaler — **C-62 n'a pas de fait généré cette vague**, contrairement à la c2.
- **Introduit par cette révision : rien.** La révision c3 est **textuelle** — elle porte sur
  `docs/harness-audit/proposals/`, et je n'ai trouvé dans le document aucune instruction modifiant un fichier de
  `packages/**` autre que le fichier de production déjà visé par §4(a) et ses tests, non encore écrits. Aucun
  fichier du dépôt n'a été touché par ce que j'ai validé, donc aucun test vert ne peut avoir été cassé par cette
  révision.
- **Contrôle de non-régression que je n'ai pas joué, et que je dis ne pas avoir joué :** `test/shell/shell.test.ts`
  (12 pass / 0 fail) et les deux suites de non-régression nommées par la proposition (`:351-352`,
  `test/cli/tui/task-contract-compact.test.ts`, `test/tool/tasks-description.test.ts`) — **non exécutées**. La
  première est interdite cette vague ; les deux autres sont, par construction, des portes d'**intégration** du
  correctif §4(a), qui n'existe pas encore. Elles ne mesurent donc aucune régression de la révision.

## Final verdict

**REVALIDATED-PASS_WITH_CHANGES**

Les deux corrections annoncées sont **réellement sur le disque et justes**. `N1` est fermé par un recomptage
indépendant qui confirme le chiffre et les emplacements mot pour mot : six lectures, quatre sites, `:553`,
`:936-937`, `:942-943`, `:984`. `N2` est fermé par une sonde `T3` à zéro positivement contrôlée en motif ASCII,
par la jonction structurelle `T2` `:328` → `T4` `:334`, et par un audit des quatre endroits qui auraient pu
conserver un renvoi pendouillant (`:79`, `:349`, `:361`, `:374`) — **aucun n'en conserve**. `R1`, `R2` et `R3`
restent traités, `R2` par un chemin différent que je signale (sa cible est désormais argumentée, plus testée, ce
qui est cohérent avec la suppression de T3 et ne laisse aucune revendication orpheline). Les affirmations de la c2
qui portaient sur des lignes de code ont **toutes** tenu, et j'ai reproduit ses deux comptes à l'identique.

**Implémentable en l'état** : aucun résidu `open`, `out_of_scope` ou `refused` ; `## Regressions introduced`
déclare qu'aucun test vert n'est cassé. Les deux réserves `I1`/`I2` sont de forme et n'empêchent pas
l'implémentation ; je les trace sans les gonfler, et je me les remets à moi-même plutôt que de les laisser au
prochain cycle sous forme d'objection de seconde catégorie.

## Handed back to

L'agent de révision de **P07** (vague 4). Aucun nom d'agent n'est enregistré dans les documents lus (`P07:3` ne
mentionne que le verdict et la date), je le désigne donc par sa fonction.

**Aucune correction n'est requise pour rendre la proposition implémentable.** Les deux corrections de la c2
(`N1` `:192`, `N2` `:333-351`) sont en place et vérifiées. Restent deux précisions de forme, **facultatives**,
aucune ne touchant `packages/**` :

1. `P07:194-195` — distinguer la déclaration `session.ts:219` (champ du schéma `Info`) d'une lecture de
   `input.directory`, pour que « quatre sites » ne soit pas lu comme cinq (voir `I1`).
2. `P07:193` — préciser que les six lectures valent sous le motif littéral `input.directory`, et que `:983` lit le
   même champ via `input?.directory` (voir `I2`).

Je n'ai ni édité la proposition ni ne le ferai (**C-36**) : la main lui revient.

## Grille d'effort

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| `I1` — distinguer `session.ts:219` (déclaration) d'une lecture, `:194-195` | 1 ligne | `docs/harness-audit/proposals/P07-subagent-contract.md` | aucun (correction de texte) | non |
| `I2` — préciser le motif littéral du compte, `:193` | 1 ligne | `docs/harness-audit/proposals/P07-subagent-contract.md` | aucun (correction de texte) | non |
| volet (a) — fusion de `tests` vers `goalState.completion.evidence`, `task.ts:511-513` | 1 affectation + 2 conditions | `packages/opencode/src/tool/task.ts` | `test/tool/task-evidence-merge.test.ts` (T1 `:316`, T2 `:328`) | non — `TYPECHECK_EXIT=0`, aucune suite verte jouée ni cassée |