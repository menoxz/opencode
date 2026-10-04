# P09 — revalidation 1 — `REVALIDATED-PASS_WITH_CHANGES`, **non implémentable**

## Proposal

`docs/harness-audit/proposals/P09-bash-artifact-first.md` (725 lignes, révision du 2026-10-04),
statut auto-déclaré **`NOT_IMPLEMENTABLE` — 6 résidus `open`**. Sujet : `bash` — règle d'écriture de
l'artefact de troncature.

Gabarit : `docs/harness-audit/REVALIDATION-BRIEFS.md`.

Revalidateur : **`independent`**. Je n'ai rédigé ni la proposition initiale, ni
`P09-verdict.md`, ni la révision. Je n'ai modifié aucun fichier sous `packages/**`, exécuté aucun
`git`, et je n'édite pas la proposition. Seul artefact écrit : ce fichier.

Décisions reprises sans rediscussion : **A-3** (propriétaire = `shell.ts`, contrepartie `collect()`),
**A-4** (fidélité mesurée), règle 7 (shell autorisé), règle 10 (un défaut trouvé dans la proposition
reste `open`), **C-50** (`read`, jamais `glob`), **C-66** (positif au moins une fois avant de croire
un zéro), **C-62** (on ne mesure pas un fichier qu'un agent édite).

---

## Revisions applied

Chaque `Required change` du verdict d'origine, point par point, avec la citation qui prouve le
traitement. Toutes les lignes ci-dessous sont **relues par moi**, pas reprises de la proposition.

| # | Exigence (verdict) | État | Preuve relue |
|---|---|---|---|
| 1 | Corriger `truncate.ts:225`→`:130`, `TRUNCATION_DIR`, `MAX_LINES`/`MAX_BYTES`, cesser d'opposer `maxBytes` à `LEAN_TERMINAL_MAX_CHARS` | **fait** | `truncate.ts:130` = ``Tool output was truncated. ${references.length ? "Received" : "Full"} output saved to: ${file}…`` → contient bien `Upstream reference (unverified; not opened): ${JSON.stringify(reference)}` ✓. `TRUNCATION_DIR` est défini à `truncation-dir.ts:4` (`path.join(Global.Path.data, "tool-output")`) ✓, importé `truncate.ts:10`, `DIR` `truncate.ts:17` ✓. `truncate.ts:15` `MAX_LINES = 2000`, `:16` `MAX_BYTES = 50 * 1024` ✓. L'opposition à `lean-output-policy.ts:4` est supprimée (§2.6, proposition:209) ✓. **Réserve** : la proposition cite `truncate.ts:44` pour `Truncate.limits()` — `:44` est la déclaration d'interface `readonly limits: …` ; l'implémentation est `truncate.ts:75-83`. Sans portée (finding **N-4**). |
| 2 | Remplacer « 36 troncatures / 1 artefact » par une mesure ; reformuler en « artefact incomplet » | **fait, mais la reformulation est contestée** | §2.1 donne la mesure (section A/B/C du rapport). La **première** moitié est exacte. La **seconde** moitié — « la présence de l'artefact est décidée par deux seuils disjoints, aucun ne correspondant à l'écart `s`/`p` » (proposition:314-316) — est **infirmée par le code** : voir **N-1** et **N-2**. La révision a **déplacé** le problème, elle ne l'a pas résolu. |
| 3 | Traiter `exit === 0` avec sortie en erreur ; le pointeur doit porter l'échec | **partiellement fait** | §6 R5 et test S4 existent ✓ ; l'en-tête `terminal-output.ts:233` porte déjà `${failed ? "; failed" : ""}` ✓ (relu). Mais le correctif d'étape 3 est **lui-même défectueux** : il négocie `effectiveFailed` dans une variable que rien ne consomme, et formate `failed` qui est `boolean \| undefined` (**N-3**). Le résidu reste donc `open`. |
| 4 | Rendre l'étape 1 implémentable (`fs.readFileString` n'existe pas) | **fait** | `packages/core/src/filesystem.ts:28` : `readonly readFileStringSafe: (path: string) => Effect.Effect<string \| undefined, Error>` — aucune `readFileString` dans l'interface déclarée (les lignes 56/86/119attaquent le service `node:fs`, pas `AppFileSystem`) ✓. `trunc.write` (`truncate.ts:68-73`) n'a **aucun** paramètre de taille et n'en applique aucun ✓, donc le disque porte bien la totalité de `raw`. La relecture est supprimée à juste titre. |
| 5 | Restreindre l'étape 2 à `normalized === "bash"` ou étendre la non-régression | **partiellement fait** | §4.2 « Périmètre strict » déclare la restriction ✓, mais le patch proposé (proposition:372-376) ne contient **aucune** garde `normalized === "bash"` — la restriction est déclarative (**N-5**, `low`/`medium`). |
| 6 | Remplacer le signal de terrain `leanOutputBudget.outputPath` (jamais écrit pour `bash`) | **fait** | `processor.ts:587` exige `!terminal`, et `lean-output-policy.ts:37-39` renvoie `true` pour `bash` → le bloc `leanOutputBudget` de `processor.ts:597-603` n'est jamais écrit pour `bash` ✓ (relu). Nouveau signal : `metadata.outputPath` (`shell.ts:618`) et `terminalOutput.rawBytes` (`terminal-output.ts:274`) — **les deux existent bel et bien** ✓. S1/S2 sont donc atteignables en surface. |
| 7 | Trancher la réouverture de `tool.ts:188-190` | **fait** | `tool.ts:188-190` = `if (result.metadata.truncated !== undefined) { return result }` ✓ (relu). `truncated` est toujours posé par `shell.ts:617` ✓. Arbitrage acté au §9 : porte maintenue fermée, P17 reste refermée. **Mais** il est faux que cette décision rende `:265` inatteignable : voir **N-2**. |
| 8 | Fournir la distribution des tailles, ou conditionner l'écriture à un seuil | **non fait — reconnu** | R6 assumé `open` (§6, proposition:519-525). L'invariant est bien réécrit en condition de perte (proposition:336-338) ✓. Rien n'est fourni. |

**Conclusion sur ce tableau** : 5 exigences traitées, 3 partiellement, 1 non traitée et reconnue.
Aucun `Required change` n'est **intact** → `REVALIDATED-FAIL` est exclu par la règle 2 de la clause
d'implémentabilité.

## Status

**Statut final : `REVALIDATED-PASS_WITH_CHANGES` — et la proposition reste `NOT_IMPLEMENTABLE`.**

Les deux ne se contredisent pas : le gabarit (§51-77) substitue à la clause « aucune nouvelle
objection » une règle de **statut**, où `REVALIDATED-PASS_WITH_CHANGES` **est** implémentable *si et
seulement si* aucun résidu n'est `open` (règle 1). J'en compte **quatorze** (§ Remaining objections, dont
les six déclarés, sept que j'ajoute et R10 que je refuse d'accepter). Un `open` unique suffit à interdire l'implémentation
(règle 3). Donc : statut de revalidation favorable, **implémentabilité négative**.

### Les trois questions tranches

1. **`terminal-output.ts:162` relu** : **oui**. La ligne est, verbatim,
   `  const raw = input.output`. L'hypothèse centrale d'origine (« `terminal-output.ts` écrit un
   `raw` tronqué ») est **infirmée** sur ce point : `raw` n'est pas un extrait, c'est la sortie telle
   que rendue par `bash` (`processor.ts:400` `output: value.result.value.output`, relayé par
   `processor.ts:581-583`). Rien dans cette couche ne tronque `raw`.
2. **Le nouveau motif des « deux seuils disjoints » tient-il** : **non**. Trois raisons, toutes
   vérifiées dans le code : les bornes ne sont pas disjointes (**N-1**) ; le « contrôle négatif » de
   §2.1 repose sur une paire de cellules du rapport de mesure **impossible** au regard de
   `terminal-output.ts:247`/`:265` (**N-2**) ; et §2.7 nie à tort le purge par la tête, qui est
   **inconditionnel** à `shell.ts:505-510` (**N-6**). Le défaut réel existe, mais c'est celui que le
   verdict d'origine avait formulé en O1 — « l'artefact en aval est écrit depuis une sortie déjà
   bornée » — et la révision l'a ré-étiqueté au lieu de le traiter.
3. **`collect()` : opposable ou seulement déclarative** : **seulement déclarative**. La moitié
   « sur le chemin » est **réelle et vérifiée** : `shell.ts:652`
   `const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)` précède
   `shell.ts:654` `yield* ask(ctx, scan)` et `shell.ts:658` `return yield* run(…)`, donc y compris
   pour une tentative **refusée** par `ask`. En revanche `scan` est un `const` local au `Effect`
   scopé et n'est **jamais** retourné : le critère **S5** est **inpassable** sans modifier la
   production pour rendre le balayage observable. Et l'orthogonalité est totale : `collect()`
   construit le balayage de permissions à partir de l'arbre de parsing, il n'a aucun rapport avec
   l'écriture d'artefact, qui vit dans `run()` (`shell.ts:594-621`). La « contrepartie obligatoire »
   d'A-3 attache donc une garantie à un point du fichier sans lien causal avec l'invariant.
   **Conclusion : `R11` ne peut pas rester `accepted`.**

### Mesures réellement obtenues par moi

| mesure | exit | fait observé |
|---|---|---|
| `bun test test/shell/shell.test.ts` (cwd `packages\opencode`) | **`SHELLTEST_EXIT=0`** | `12 pass`, `0 fail`, `26 expect() calls`, `Ran 12 tests across 1 file. [4.69s]` |
| `bun typecheck` (cwd `packages\opencode`) | **`TYPECHECK_EXIT=0`** | journal de 1 ligne, **aucune** ligne `error`, **aucune** occurrence `lean-advisory` → rien à signaler au titre de **C-62** |
| `bun --version` | `0` | `1.4.2` |

`test/tool/shell.test.ts`, `compaction.test.ts` et `test/plugin` **n'ont pas été rejouées** et ne sont
**pas** portées comme preuve de vert, conformément à l'état de mesure fourni.

### `P09-VERDICT-DATE-UNKNOWN` → `clos`

La date réelle du verdict est **établie** : `verdicts/P09-verdict.md` a été **créé le
2026-10-03 20:49:22** et **modifié le 2026-10-03 20:58:02** (`Get-Item`, aucune commande `git`).
Le rapport de mesure est daté du **2026-10-03** (mtime `22:28:39`, cohérent avec son en-tête) et la
proposition révisée du **2026-10-04** (mtime `00:58:11`). L'ordre réel est donc
**verdict → mesure → révision**. La révision qui « retient » la date **2026-10-04** (celle des
arbitrages opérateur) pour le verdict est **réfutée** par l'horodatage du fichier : la date du
verdict est le **2026-10-03**. Le résidu passe `residual` → `clos`, avec cette réserve : l'horodatage
établit la date d'écriture du fichier, pas celle de la rédaction du texte.

## Remaining objections

Statut en tête de chaque ligne, conformément à la règle 4. **Aucun n'est requalifié en
`out_of_scope` pour franchir la porte** (règle 10).

- **`open` — R2 (déclaré par la révision) — la base probatoire est contradictoire.** La section B du
  rapport annonce simultanément « 1 artefact de 35 129 o écrit pendant l'appel » et « `outputPath`
  retourné : **`null`** — le chemin est dans le *texte*, pas dans les métadonnées ». C'est impossible :
  `terminal-output.ts:247` `const outputPath = reduced ? yield* input.store.write(raw) : undefined` ;
  si un fichier a été écrit, `outputPath` est cette chaîne, `:250` la met dans `footer`, **et**
  `:265` `...(outputPath ? { outputPath } : {})` la met dans `metadata` — de même que `:278` et
  `:285`. Une de ces deux cellules est fausse, ou la sonde a lu un autre objet que
  `metadata.outputPath`. R2 étant le résidu qui fonde tout le nouveau motif, sa base doit être
  re-mesurée. **Remède (une ligne)** : rejouer la sonde B en imprimant séparément `reduced`, la
  variable locale `outputPath`, `metadata.outputPath` et `metadata.terminalOutput.outputPath`, sur
  **les deux** charges (35 129 o **et** 140 129 o), et publier ces quatre valeurs.
- **`open` — R3 (déclaré par la révision) — artefact non borné.** Confirmé et vérifié :
  `truncate.ts:68-73` n'a aucun paramètre de taille et n'en applique aucun ; la mesure a écrit
  140 129 o sans plafond. **Remède** : poser la borne dans `truncate.write` (P17) et faire dépendre
  l'étape 1 de P09 de cette borne, ou alors retirer l'étape 1 de P09.
- **`open` — R4 (déclaré par la révision) — l'affirmation « l'information est perdue avant arrivée »
  est fausse en partie ; le résidu, réduit, tient.** `processor.ts:581-583` ne reçoit bien que le
  `result` rendu, et `shell.ts:618` ne pose `outputPath` que si `cut && file` ✓. **Mais** la couche
  aval n'est pas passive : `terminal-output.ts:263-265` écrase `input.metadata.outputPath` par le
  chemin qu'elle vient d'écrire. L'information n'est donc pas « perdue avant arrivée » — elle
  **arrive**, puis est **détruite puis réécrite** par l'aval. **Remède** : reformuler R4 comme
  « `metadata.outputPath` n'est posé que si `cut && file` (bande sans chemin amont) **et** il est
  écrasé en aval (bande avec chemin dégradé) », deux défauts distincts, deux tests distincts.
- **`open` — R5 (déclaré par la révision) — le remède prescrit est lui-même défectueux.** Le texte
  est exact : `terminal-output.ts:30` `const ERROR = /\b(error|failed|failure|fatal|exception|panic)\b|^\s*\(fail\)/i`,
  `:238` `const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES`, `:233` en-tête
  ✓ — les trois relus. Mais l'étape 3 négocie `effectiveFailed` dans une variable que `:233` ne
  lit pas, et formate `failed`, qui vaut `boolean | undefined` (`tools.ExecutionError | undefined`
  au premier terme). Le correctif, tel qu'écrit, ne peut pas faire passer S4. **Remède** : produire
  `const effectiveFailed = failed ?? false` **avant** `:233`, l'utiliser dans le template, et faire
  porter l'indicateur au marqueur comme au chemin (`Received`/`Full`).
- **`open` — R6 (déclaré par la révision) — distribution non mesurée.** Confirmé : le § « Points non
  mesurés » de la révision l'énonce lui-même. Le « coût » annoncé est certain (un fichier par appel)
  et le gain est inconnu. **Remède** : mesurer la distribution sur un échantillon de sessions réelles,
  ou conditionner l'écriture à un seuil et amender l'invariant.
- **`open` — R7 (déclaré par la révision) — la double écriture est pire que décrit.** La révision dit
  que les deux artefacts divergent « quand le purge par la tête (`:503-510`) a joué **avant** le
  spill ». C'est faux : le purge est **inconditionnel** (`shell.ts:503-510`, exécuté sur chaque chunk
  **avant** le `if (file)` de `:514`), donc il joue **aussi et surtout après** le spill, et il joue
  dès que le flux cumulé dépasse `keep = 102 400` (`shell.ts:452`). Pour toute sortie > 102 400 o,
  `raw` (`:594`) est amputé de sa tête tandis que le fichier du spill (`:519`+sink) reste complet :
  les deux artefacts sont alors **divergents pour toute sortie > `keep`**, pas seulement dans un cas
  particulier — et `:265` fait pointer le modèle vers le mauvais. **Remède** : mesurer `raw` contre la
  sortie du processus sur une charge > 102 400 o, et traiter la divergence comme un défaut unique
  (interdiction d'écrire un second artefact quand un chemin amont existe).
- **`open` — N-1 (nouveau) — le motif « deux seuils disjoints » est mathématiquement faux.** Les
  bornes de `shell.ts` sont `2 000` lignes / `51 200` o (`truncate.ts:15-16`) ; les bornes de la couche
  aval sont **`MAX_BYTES = 4_000` caractères / `MAX_LINES = 120`** (`terminal-output.ts:7-8`, relus).
  `:246` `reduced` inclut `initial !== useful`, c'est-à-dire le dépassement de l'un ou l'autre. Donc
  **plus de 120 lignes ⟹ plus de 4 000 caractères ⟹ `reduced` ⟹ `:247` écrit un artefact**. Les deux
  seuils ne sont pas disjoints : le seuil aval est **inclus** dans l'amont. La population « un fichier
  existe parfois » n'est pas une bande, c'est **la quasi-totalité**. Le vrai défaut n'est pas « deux
  seuils », c'est « **la réduction est décidée sur `useful`, texte déjà réduit, et jamais sur l'écart
  s/p** ». **Remède** : réécrire l'invariant en « `reduced` doit être décidé sur l'écart entre la sortie
  du processus et les octets livrés », et supprimer le tableau des « quatre seuils » (§2.6) qui
  présente `2 000 / 4 000` comme le seuil « de présentation » en regard d'un seuil amont de
  `51 200` sans dire que le premier est un sous-ensemble du second.
- **`open` — N-2 (nouveau) — l'étape 2 du correctif est inopérante sur la population qu'elle vise.**
  Patch proposé (proposition:374-375) : `const upstream = … ; const outputPath = upstream ?? (reduced ? yield* input.store.write(raw) : undefined)`. Le spread de `terminal-output.ts:263-265` fait
  `metadata: { ...input.metadata, ...(outputPath ? { outputPath } : {}) }` — le chemin frais
  **écrase** le chemin amont. Donc, tant que `reduced` est vrai, `:247-265` réécrit un second
  artefact et **détruit** la propagation que l'étape 2 prétend établir. L'étape 2 ne peut produire son
  effet que si `reduced` est **faux**, c'est-à-dire si l'étape 1 (écriture au premier chunk) a déjà
  résolu la perte — or l'étape 1 est **suspendue à R6** par la révision elle-même. **Le correctif
  n'a aujourd'hui aucun chemin exécutable vers son propre invariant.** **Remède** : ajouter
  `outputPath: outputPath ?? input.metadata.outputPath` et ne déclencher `store.write` que si
  `references.length === 0`, ce qui rend l'étape 2 correcte **indépendamment** de l'étape 1.
- **`open` — N-3 (nouveau) — `p` est mal défini au §3, donc le chiffre-clef « 3 % » est le mauvais.**
  §3 définit « `p` = octets rendus au modèle » et annonce `s = 35 129`, `p = 1 148`, « le modèle
  reçoit 3 % de la sortie ». Or 1 148 o est la sortie **après** le budget d'extrait de la couche
  terminale ; la valeur qui **entre** dans cette couche est le `output` de `shell.ts` (mesure §4-A :
  `14 203` returned **à l'appelant**, relayé tel quel par `processor.ts:400`). Et l'artefact `s`
  lui-même n'est pas « la sortie du processus » : c'est un **sur-ensemble**, puisqu'il contient la
  chaîne `...output truncated...` et le pointeur (`shell.ts:604-605`). Les deux membres de `s − p`
  sont donc mal posés : 1 148/35 129 = 3.3 % et 1 148/14 203 = 8.1 %, et le rapport mesure
  aujourd'hui un champ (`terminalOutput.rawBytes`, `terminal-output.ts:274`) qui vaut **1 148**, pas
  l'octet produit. **Remède** : nommer trois quantités distinctes — `s` (sortie du processus),
  `r` (`result.output` de `shell.ts`), `d` (octets livrés) — et mesurer `s`, `r`, `d` sur les deux
  charges.
- **`open` — N-4 (nouveau, `low`) — la base verte désignée ne couvre pas le chemin corrigé.**
  `test/shell/shell.test.ts` est verte (`SHELLTEST_EXIT=0`, 12 pass / 0 fail, mesuré par moi) mais un
  `grep` de `truncated|Full output saved to|toBe\(false\)|toEqual\(` sur ce fichier ne renvoie que
  **3** lignes, **toutes** des `toBe(false)` sur `Shell.login` / `Shell.posix`
  (`shell.test.ts:36`, `:41`, `:42`) — contrôle positif satisfait (**C-66**) : le motif fonctionne, la
  suite ne contient **aucune** assertion sur `truncated` ni sur le marqueur. Ses 12 tests portent sur
  la résolution de noms de shell, la détection de shell de login et l'UTF-8 du pipe
  (`shell.test.ts:26-118`). Or l'étape 1 du correctif réécrit précisément `shell.ts:601-606`, le
  marqueur et `truncated`. **Une régression de l'étape 1 serait invisible pour cette base.** Les
  ancres `shell.test.ts:1173` / `:1189` citées par le verdict pour `/Full output saved to:\s+\S+/`
  appartiennent à un **autre** fichier que `test/shell/shell.test.ts`. **Remède** : désigner la base
  verte réelle et l'exécuter une fois avant tout patch ; ne pas appeler « non-régression » une suite
  qui n'exerce pas le code corrigé.
- **`open` — N-5 (nouveau, `low`) — la restriction de périmètre de l'étape 2 n'est pas dans le
  patch.** §4.2 annonce « restreint à `bash` », le code proposé ne teste pas `normalized === "bash"`
  (alors que `terminal-output.ts:163` en est le site naturel, et que c'est l'objet de l'exigence 5).
  **Remède** : écrire la garde dans le patch, ou justifier le bénéfice pour les outils listés par
  `lean-output-policy.ts:40-43` et étendre la non-régression à eux.
- **`open` — N-6 (nouveau) — `R11` (`collect()`) est `accepted` sans preuve, et S5 est inpassable.**
  Voir la question 3 ci-dessus : la présence sur le chemin est vérifiée et réelle, mais
  l'observabilité est nulle (`scan` n'est jamais retourné) et la garantie est sans lien causal avec
  l'invariant d'artefact. **Remède** : soit donner à `collect()` la couverture de test qu'elle
  mérite dans P12 (où `ask` est effectivement testé) et **retirer** la contrepartie d'A-3 du texte de
  P09, soit rendre `scan` observable et poser S5 dessus. En attendant, `R11` est `open`, pas
  `accepted`.
- **`open` — N-7 (nouveau) — les 7 « points non mesurés » ne portent aucun statut d'objection.**
  Règle 4 du gabarit : une objection sans statut est traitée comme `open`. Le tableau final de la
  révision ne contient donc pas de statut opposable pour : `terminal-output.ts:156` comme site
  d'appel distinct ; `MAX_BYTES = 4 000` / `MAX_LINES = 120` mesurés directement sur les constantes ;
  fidélité de `last` pendant le streaming ; coupure UTF-8 en frontière de chunk ; multi-appels
  concurrents sur `TRUNCATION_DIR` ; `TRUNCATION_DIR` absent ou non inscriptible ; retour POSIX.
  **Remède** : les inscrire au tableau des résidus avec `open` ou `out_of_scope` et une
  justification.
- **`out_of_scope` — R1 (dérive texte → chemin) — refusée comme objection de P09, confirmée.**
  `terminal-output.ts:156-160` : `const saved = Truncate.savedOutputPath(input.output)` puis
  `withinTruncationRoot(saved) ? saved : undefined` ✓ ; `truncate.ts:30` regex ✓. Le filtre rejette
  bien une extraction `{{…}}` pour `bash`. Décision d'homologation P16/périmètre validée, **sans
  effet sur ce dossier**.
- **`out_of_scope` — R8 (propriété de l'invariant) — tranchée.** A-3, `shell.ts`, et la double source
  (décision opérateur + validateur P12) sont ceux de **C-39**. Je n'ai rien à ajouter et ne
  rediscute pas.
- **`out_of_scope` — R9 (fidélité de l'artefact) — close par mesure.** **C-43** ; la fidélité
  octet-pour-octet est réelle sur les deux charges (35 129/35 129, 140 129/140 129, écart 0/0,
  `identical: true`, `firstDiffOffset: -1`, aucun U+FFFD). **Réserve** : cette fidélité est mesurée sur
  le **premier** artefact (celui du spill), pas sur `raw` — voir **N-2** et **R7**, où le second est
  celui que l'aval écrit et auquel le modèle est pointé.
- **`open` — R10 (injection via l'artefact) — je refuse cette formulation, et la raison est un
  défaut, pas une réserve.** `terminal-output.ts:157-160` ne construit `references` que depuis
  `metadata.outputPath` et une extraction **filtrée par `withinTruncationRoot`**. Or la mitigation
  invoquée (« le contenu d'un fichier n'est pas sanitisé », proposition:527-531) porte sur ces deux
  chemins-là. Si `:247` écrit un artefact **alors que `references` est vide**, ce second fichier est
  écrit à partir de `raw` — c'est-à-dire de texte que le processus contrôle — et aucun pont ne le
  déclare non fiable. C'est précisément le cas que crée la bande « `bash` » sans chemin amont » que
  R4 décrit. **Remède** : n'écrire un artefact depuis `raw` que si `references.length > 0`, sinon le
  rendu doit porter l'extrait complet. Tant que ce n'est pas écrit, R10 est un risque **ouvert**,
  pas accepté.
- **`out_of_scope` — R12, R13 (P09 jamais revalidée ; provenance de la source) — hors de ce cycle.**

**Décompte** : 14 résidus `open` (R2, R3, R4, R5, R6, R7, N-1, N-2, N-3, N-4, N-5, N-6, N-7, R10 — soit
14 lignes, dont R5 et N-3 portant sur le même écart mais des remèdes distincts), 4 `out_of_scope`,
0 `accepted` — R10 est refusée et requalifiée `open`, R11 est déclassée en `open`.

## Regressions introduced

Distinction explicite, exigée par le gabarit.

### Préexistant — dans le produit, avant toute proposition, et mesuré

- **Aucun octet perdu avant écriture, pour une sortie ≤ `keep`** : confirmé par la section A du
  rapport (35 129/35 129 et 140 129/140 129). C'est ce qui a fait écran à la révision.
- **Perte de tête amont pour toute sortie > `keep = 102 400`** : `shell.ts:452`, `:503-510`. Purge
  inconditionnelle, `cut = true`. **Préexistant**, et la révision le déclare à tort inexistant
  (**N-6 / R7**). Jamais mesuré en aval.
- **R5 — `exit === 0` avec marqueur d'erreur** : `terminal-output.ts:30`, `:238`, `:233`.
  **Préexistant**, repris tel quel du verdict d'origine (O2), non traité.
- **R3 — artefact non borné** : `truncate.ts:68-73`. **Préexistant**, mesuré (140 129 o sans
  plafond).
- **R7 — double écriture et écrasement du chemin** : `shell.ts:519` puis `terminal-output.ts:247`,
  puis `:265`. **Préexistant**, et la révision en sous-estime la portée.
- **`test/tool/shell.test.ts` instable** (63/32/1 puis 62/33/4) et les deux autres suites conditionnelles :
  **préexistant**, connu, et je n'en fais ni une porte ni une preuve.

### Introduit par la révision — comme conception, aucun code n'ayant été écrit

- **Un marqueur et un `truncated: true` inconditionnels.** L'étape 1 pose `cut = true` dès le premier
  chunk. `shell.ts:604-606` préfixe alors `...output truncated...` + `Full output saved to:` à
  **toute** sortie `bash`, y compris d'un octet, et `shell.ts:617` renvoie `truncated: true` pour tout
  le monde. C'est une **régression de comportement** (tout appel devient « tronqué »), introduite par
  le correctif lui-même. Aggravant : la seule suite verte désignée ne peut pas la voir (**N-4**).
- **Un risque de sécurité neuf par la formulation de R10** : en écrivant un artefact depuis `raw`
  quand `references` est vide, on crée un fichier dérivé de la sortie du processus **hors** du pont
  `withinTruncationRoot` — un fichier que rien ne déclare non fiable. Le risque était latent ;
  l'étape 2 et l'étape 1 le rendent atteignable.
- **Un coût I/O certain pour un gain non mesuré** : un fichier par appel, sans borne par fichier
  (R3), alors que la bande réellement préjudiciée n'est pas celle que la révision croyait
  mesurer (N-1). Introduit par l'étape 1, qui s'appuie sur une statistique qui n'existe plus.

### Non introduit — déclaré explicitement pour la règle 1 du gabarit

**Aucun test vert n'est cassé.** Mesures de ce cycle : `SHELLTEST_EXIT=0` (12 pass / 0 fail) et
`TYPECHECK_EXIT=0`. Aucun fichier sous `packages/**` n'a été touché par moi ; je n'ai donc cassé ni
vert ni rouge. Les tests rouges préexistants ne sont pas davantage dégradés par ce cycle, puisque
ce cycle n'écrit aucun code. La réserve `open` porte sur l'**absence de porte** (`test/shell/shell.test.ts`
n'exerce pas le chemin corrigé), pas sur un test cassé — ce qui est précisément ce que la règle 1
distingue.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

Et, par la règle 3 de la clause d'implémentabilité : **non implémentable**, avec 14 lignes de résidus
`open` — dont les six que la révision déclarait elle-même, tous confirmés `open` après vérification
de leur base probatoire, et sept que j'ajoute, plus R10 dont j'ai refusé l'acceptation. Aucun `Required change` n'est intact, donc
l'échec est exclu : aucun Required change n'est intact. Aucun résidu n'est levé, donc ce rapport ne peut pas être un succès plein.

Ce rapport est **complet** au sens de la règle 10 : l'observation est le livrable, la clôture appartient
au cycle de révision suivant.

## Handed back to

- **Agent de révision de P09** — auteur de `docs/harness-audit/proposals/P09-bash-artifact-first.md`,
  dernière écriture **2026-10-04 00:58:11** (le fichier ne porte pas d'identifiant d'agent ; le
  handle m'est inconnu et je ne l'invente pas). Reçoit, avec le remède en une ligne déjà inscrit
  ci-dessus : **N-1** (motif des deux seuils mathématiquement faux), **N-2** (l'étape 2 est inopérante,
  écrasement `:265`), **N-3** (`p` mal défini, chiffre-clef « 3 % » à corriger), **N-4** (base verte
  désignée hors sujet), **N-5** (restriction de périmètre absente du patch), **N-6** (`R11`
  déclassé, S5 inpassable), **N-7** (7 points non mesurés sans statut), plus la **correction de date**
  du verdict (2026-10-03, pas 2026-10-04) et la **reformulation de R4** et **R7**.
- **Agent de mesure** — auteur de `C:\Users\jeanl\AppData\Local\Temp\opencodev2\p09-fidelity-report.md`
  (233 lignes, dernière écriture **2026-10-03 22:28:39**). Reçoit la contradiction interne de la
  **section B** (**R2**) : deux cellules incompatibles avec `terminal-output.ts:247`/`:265`, à
  lever par une sonde qui imprime `reduced`, `outputPath` local, `metadata.outputPath` et
  `terminalOutput.outputPath` séparément, sur 35 129 o **et** 140 129 o.
- **P17** — porteuse de **R3** (borne par fichier dans `truncate.write`), dont P09 dépend par
  l'étape 1.
- **P12** — pour `collect()` : la couverture de test naturelle d'`ask` lui appartient ; la
  contrepartie d'A-3 devrait y être écrite plutôt que prescrite depuis P09 (**N-6**).

## Effort — vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| R2 — lever la contradiction de la section B, remesurer `raw` vs sortie du processus sur les deux charges | S | aucun (sonde hors dépôt) | `test/tool/terminal-output-path-propagation.test.ts` | aucun |
| N-1/N-2 — invariant réécrit sur l'écart `s/p` ; `:265` ne doit plus écraser le chemin amont ; écriture aval conditionnée à `references.length > 0` | M | `packages/opencode/src/tool/terminal-output.ts` | `test/shell/shell-artifact-consistency.test.ts` (S1, S2, S3) | oui — `test/tool/shell.test.ts` (in assertions `Full output saved to:`) ; relire `test/tool/terminal-output.test.ts` avant de patcher |
| R3 — borne par fichier (dépendance dure de l'étape 1) | M | `packages/opencode/src/tool/truncate.ts` (P17) | `test/tool/truncation-bounded.test.ts` | aucun connu |
| R5 — l'indicateur d'échec doit porter `exit === 0` + marqueur | S | `packages/opencode/src/tool/terminal-output.ts` | `test/tool/terminal-output-exit0.test.ts` | aucun connu (non exécuté ici) |
| N-3 — nommer et mesurer `s`, `r`, `d` au lieu d'un `p` unique | S | `packages/opencode/src/tool/terminal-output.ts` (métriques) | étendre le test ci-dessus | aucun |
| R6 — distribution des tailles de sortie `bash` (2 000 car. / 51 200 o / 102 400 o) | S | aucun (mesure sur sessions réelles) | rapport de distribution | aucun |
| R7 + R4 — un seul artefact, jamais plus petit que l'amont ; distinguer « sans chemin » de « chemin dégradé » | M | `packages/opencode/src/tool/shell.ts` + `terminal-output.ts` | `test/shell/shell-single-artifact.test.ts` | oui — même fichier que la ligne 2 du tableau |
| N-4 —(base de non-régression) | S | `packages/opencode/test/shell/` (ajout, pas de production) | `test/shell/shell-truncation-regression.test.ts` | aucun (ajout seul) ; mais `test/shell/shell.test.ts` doit rester vert à 12/0 |
| N-6 — rendre `collect()`/`ask` observable, ou retirer la contrepartie d'A-3 de P09 | M | `packages/opencode/src/tool/shell.ts` | `test/shell/collect-scope.test.ts` | oui — `test/shell/shell.test.ts` (vert, 12/0) : relire avant de patcher |
| N-5 — garde `normalized === "bash"` dans l'étape 2 | S | `packages/opencode/src/tool/terminal-output.ts` | extension du test de la ligne 2 | oui — `test/tool/shell.test.ts` (in assertions) |
