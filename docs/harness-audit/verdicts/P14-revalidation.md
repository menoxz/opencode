# P14 — Revalidation indépendante (après révision)

**Relecteur :** agent de revalidation, sans rôle dans la proposition initiale, le verdict
d'origine ni la révision.
**Sources :** `docs/harness-audit/proposals/P14-preview-tail-loss.md` (941 l., révisée),
`docs/harness-audit/verdicts/P14-verdict.md` (203 l., `PASS_WITH_CHANGES`),
`docs/harness-audit/CORRECTIONS.md` (C-36, C-50).

---

## Proposal

**P14** — *preview window loss in the shell tool*. Cible : `packages/opencode/src/tool/shell.ts`.

`preview()` (`shell.ts:235-238`) plafonne `metadata.output` à `MAX_METADATA_LENGTH`
(`shell.ts:29`) en ne gardant que la **queue** : `"...\n\n" + text.slice(-MAX)`. Or le point
de publication en flux fait `last = preview(last + chunk)` (`shell.ts:512`) : la troncature
est appliquée **à chaque chunk**. La v1 déduisait le fait de troncature d'une comparaison de
chaînes, `body !== (last || output)`, dans le bloc final (`shell.ts:611-621`).

**Le remède retenu par la révision :**

1. `preview()` devient une fonction qui **renseigne** — elle retourne `{ text, truncated }`
   au lieu de tronquer en silence ; le drapeau est produit par la fonction qui a tronqué.
2. Une fenêtre accumulée `previewWindow()` (tête 7 500 / queue 22 500 / marqueur) remplace
   l'appel par chunk ; le drapeau vaut `seen > 30 000`, total exact, **jamais une égalité de
   chaînes**.
3. `metadata` distingue `previewTruncated` (fenêtre) de `truncated` (lignes/octets, avec
   `outputPath`).
4. `cutStart()` : garde-fou de surrogate en coupe de tête.
5. §5.6 : la comparaison `body !== (last || output)` est **supprimée et nommée rejetée**.
6. §4.2 : marqueur de drain signalant une sortie encore ouverte à l'expiration du délai de grâce.

---

## Revisions applied

### Vérification des `Required changes` du verdict d'origine (RC1→RC6)

| RC | exigence | statut | preuve |
| --- | --- | --- | --- |
| RC1 | sévérité reclassée **basse** ; branche « approuver sans voir le préambule » supprimée | traité | plus aucune branche d'approbation avant aperçu dans §4/§6 ; §4.2-§4.3inguishedement |
| RC2 | test du drain sur condition **structurelle** (enfant détaché tenant le pipe, marge 25×, **aucun `Effect.sleep`**) | traité | conforme à `test/AGENTS.md:165` (« Using `Effect.sleep(N)` … as a "wait for the forked fiber to be ready" hack races the scheduler », avec renvoi PR #27622) et `:169` (« Wait on a **published readiness signal**, not wall-clock time ») |
| RC3 | le marqueur de drain n'atteint que le modèle, pas le TUI | traité | §4.2 lignes 459-473 le déclare noir sur blanc ; vérifié : `meta` ne concatène qu'à `output` (`shell.ts:608-610`) → `session/tools.ts:691` → `message-v2.ts:1035-1037`, alors que le TUI lit `metadata.output` (`index.tsx:2467`) |
| RC4 | `INFERE` TUI remplacé par la citation réelle | traité | `index.tsx:2462-2471` : `:2462` `function Shell(props: ToolProps<typeof ShellTool>)`, `:2467` `stripAnsi(props.metadata.output?.trim() ?? "")`, `:2469` `const maxLines = 10`, `:2471` `collapsed` — **exact** |
| RC5 | coût de republication par chunk **chiffré** | traité | naïf = une copie de ~30 000 caractères par chunk (1 600 chunks ⇒ ~1,6 Go de copies) ; fenêtre = O(1) après franchissement |
| RC6 | deux `INFERE` non relues supprimées ; ancres `truncate.ts` corrigées | traité | `truncate.ts:8-27` et `:40-59` confirment les nouvelles ancres `:13` / `:54` (les anciennes `:598` / `:127` sont hors fichier, le fichier en fait 158 l.) |

### Vérification de toutes les citations (une citation fausse serait bloquante)

**Aucune citation fausse détectée.** Toutes vérifiées par lecture littérale.

| Citation | Verdict |
| --- | --- |
| `shell.ts:512` `last = preview(last + chunk)` | exact |
| `shell.ts:454` `let last = ""` ; `:459` `let cut = false` | exact |
| `shell.ts:235-238` ancienne `preview()` | exact |
| `shell.ts:546` fin du `Stream.runForEach` ; `:573-577` commentaire drain ; `:578-581` `raceAll` | exact |
| `shell.ts:587-593` `meta.push` ; `:588-593` publication `metadata` | exact |
| `shell.ts:531` / `:542` publications par chunk | exact |
| `shell.ts:596` `metadata.output` amputé ; `:597` garde `expired` | exact |
| `shell.ts:601` garde-fou de republie si inchangé | exact |
| `shell.ts:608-610` `output = meta.concat(output).join("\n")` | exact |
| `shell.ts:611-621` bloc de résultat final | exact |
| `shell.ts:617` et `:614` (`output`/`truncated`) | exact |
| `session/tools.ts:691` `output: truncated.content` | exact |
| `message-v2.ts:1035-1037` `truncateToolOutput(part.state.output, …)` | exact |
| `message-v2.ts:1076-1086` payload de la partie outil | exact |
| `index.tsx:2462-2471` | exact (RC4) |
| `truncate.ts:13` / `:54` | exact |
| `test/AGENTS.md:165-169` | exact (RC2) |
| `package.json:9` `"typecheck": "tsgo --noEmit"` | exact |

**Réserve de précision** (basse, non bloquante) : le verdict d'origine ancre `truncated: false`
à `shell.ts:242` ; le `return { cut: false }` est en `shell.ts:245`, `:242` étant la garde
`if (lines.length <= maxLines && Buffer.byteLength(text, "utf-8") <= maxBytes)`. L'affirmation
reste vraie de `:242` (sortie sans coupe) ; l'ancrage est imprécis.

---

## Status

### 1. L'objection centrale : le défaut d'origine est confirmé

`shell.ts:512` tronque **à chaque chunk**, donc après le franchissement du budget `last` est
déjà une chaîne tronquée. Avec `body = last || preview(output)` (`shell.ts:611-621`) :

- **Plusieurs chunks** → `last` non vide → `body = last` → `body !== (last || output)` vaut
  `last !== last`, soit **`false`**, pour tout chunk ultérieur. **Confirmé.**
- **Une seule ligne** → `last = preview(chunk)` dès le premier chunk, donc `last === output`
  quand la sortie tient sous le budget → `body = last = output` → la condition vaut
  **`false`**. Elle ne devient **vraie** que dans le sous-cas `last === ""` (aucun chunk
  émis) **et** sortie > 30 000 — c'est-à-dire **précisément le cas où aucune troncature
  lignes/octets n'a eu lieu** et où `truncated: true` serait un mensonge.

Autrement dit : la condition ne produit **jamais** de `true` trustworthy. Le libellé
« une seule ligne → condition vraie » n'est vrai que dans le sous-cas où le drapeau ment ;
et partout où la troncature a réellement eu lieu, le signal reste muet. La conclusion
« rend `truncated` honnête était faux en l'état » est **justifiée**.

### 2. L'argument qui justifie la fenêtre est **FAUX** — mais la fenêtre reste justifiée

`proposals/P14-preview-tail-loss.md:363-368`, verbatim :

> On pourrait se contenter d'appeler `preview(last + chunk)` et de lire `.truncated`. Ce serait
> correct pour le drapeau, mais **faux pour le texte** : … chaque passage ajouterait un
> marqueur à l'intérieur du précédent — un marqueur par chunk. Le texte deviendrait illisible
> et **la taille exploserait**.

**Réfuté par exécution** (sonde `p14-probe4.js`, accumulateur naïf = `preview(last + chunk)`
à chaque chunk, identiquement à `shell.ts:512` ; auto-cohérent : `consistentLen=true` sur les
sept lignes).

| régime | total | marqueurs | tokens « characters omitted » | `omitted` annoncé | `omitted` réel | taille |
| --- | --- | --- | --- | --- | --- | --- |
| 7 × 9 000 | 63 000 | **1** | **1** | 9 071 | 33 000 | 30 071 |
| 1 600 × 130 | 208 000 | **1** | **1** | 200 | 178 000 | 30 070 |
| 8 × 30 000 | 240 000 | **1** | **1** | 30 072 | 210 000 | 30 072 |
| 3 000 × 40 | 120 000 | **1** | **1** | 110 | 90 000 | 30 070 |
| 40 000 × 1 | 40 000 | **1** | **1** | 70 | 10 000 | 30 069 |
| 1 × 200 000 | 200 000 | **1** | **1** | 170 000 | 170 000 | 30 073 |
| 2 × 22 501 | 45 002 | **1** | **1** | 15 002 | 15 002 | 30 072 |

- **Aucun emboîtement dans aucun régime** : `markers === 1` partout.
- **La taille n'explose pas** : elle reste bornée à `30 000 + |marqueur|`, soit 30 069-30 073.

*Pourquoi* : `preview()` tel que redéfini est une **fenêtre** (tête 7 500 + marqueur + queue
22 500). Re-prévisualiser sa sortie coupe à 7 500, c'est-à-dire à l'intérieur du **fragment
de tête**, très en amont de l'ancien marqueur (situé vers 7 500-7 570) ; `cutStart(text, 7500)`
jette donc l'ancien marqueur : il **ne peut pas** s'imbriquer. C'est l'ancienne `preview()`
de `shell.ts:235-238` (`"…\n\n" + text.slice(-MAX)`), **remplacée**, qui s'imbriquait.

**Ce que la fenêtre apporte réellement** (mesuré ci-dessus) : le **compte ment**. L'accumulateur
naïf annonce `omitted = 200` quand 178 000 caractères sont perdus, `110` quand 90 000 le sont.
Et surtout `seen > 30 000` est **incalculable** à partir d'une chaîne déjà tronquée. La fenêtre
est donc justifiée — mais **par une autre raison**, qui doit être écrite à la place de
l'argument actuel : *le total observé ne survit pas à la troncature ; seul un accumulateur non
tronqué le connaît.*

### 3. Défaut dans le croquis §4.1 : la fenêtre telle qu'écrite ne fonctionne pas

- `proposals/P14-preview-tail-loss.md:376` — `let raw: string | undefined = undefined`
- `proposals/P14-preview-tail-loss.md:385` — `raw += chunk`

Sur `undefined`, `+=` concatène la chaîne `"undefined"`, et le type du paramètre est
`string | undefined` → **erreur de compilation** (TS2532 / TS18048).

Exécuté tel quel : `undefinedPrefix: true`, `undefCount: 1`, et la fenêtre **ne tronque jamais**
— 9 009 / 139 / 49 / 10 / 22 510 caractères, `markers: 0`, `truncated: false` dans 5 régimes
sur 7. Le remède, tel qu'écrit, **échoue silencieusement**.

### 4. La coupe de queue glissante n'a aucun garde-fou de surrogate

`tail = (tail + chunk).slice(-TAIL)` (`:406`) et `text.slice(-tailLength)` (`:344`) peuvent
couper une paire de surrogates. `cutStart()` (`:328-337`) ne couvre que la **tête**. L'affirmation
« garde-fou de surrogate en coupe de tête **et** en coupe de queue glissante » est donc
**partiellement fausse**.

### 5. Le reste du remède tient

- Le drapeau `seen > 30 000` est bien un total exact, jamais une égalité de chaînes (`:481-483`).
- `cutStart` (`:328-337`) coupe bien avant tout `U+DC00`-`U+DFFF`.
- Le budget est **paramétré**, pas figé : `head = Math.floor(MAX_METADATA_LENGTH * HEAD_SHARE)`,
  `tailLength = MAX_METADATA_LENGTH - head` (`:341-342`).

### 6. Arbitrage de sécurité : `metadata.output` est-il exposé au fournisseur ?

**Non.** Tranché sur le chemin de sérialisation effectif.

| Étape | Preuve | Ce qui est transmis |
| --- | --- | --- |
| Le tool renvoie `output` **et** `metadata` | `session/tools.ts:691` — `output: truncated.content` ; `metadata` est un champ distinct de `ToolState` | deux champs distincts |
| Payload de la partie assistant | `message-v2.ts:1076-1086` — `{ type, state, toolCallId, input, output, … }` | — |
| **Que vaut `state` ?** | `message-v2.ts:1078` — `state: "output-available"` | un **littéral de chaîne**, pas `part.state` |
| Origine du texte `output` | `message-v2.ts:1035-1037` — `truncateToolOutput(part.state.output, …)` | le **texte** seul, jamais `metadata` |
| Usage local de `metadata` | `:1046` `todoSnapshotOrder(part.state.metadata)` ; `:1089` `part.state.metadata?.interrupted` / `?.output` (branche *erreur* seule) | interne au serveur |

`part.state.metadata` n'est **jamais** sérialisé vers le fournisseur : `state` est écrasé par un
statut, et le seul texte qui traverse est `output`. `metadata.output` reste un canal **local**
(TUI, persistance mémoire, arrêt de boucle). **F-3 reste `out_of_scope`** ; aucune promotion en
proposal séparé n'est nécessaire.

### 7. Mesures rejouées par moi (le shell a fonctionné)

| Mesure | Attendu | Observé |
| --- | --- | --- |
| `bun typecheck` (= `tsgo --noEmit`, `package.json:9`) | exit 0 | **TYPECHECK_EXIT=0** ; log 17 octets, **0** ligne `error TS` |
| `test/shell/shell.test.ts` (base verte, C-47) | 12 pass / 0 fail | **12 pass / 0 fail**, 26 assertions, 6,64 s, **EXIT=0**, bun 1.4.2 |
| `test/tool/shell.test.ts` | instable | **56 pass / 39 fail**, 95 tests, 143,6 s, **EXIT=1** |

**La prémisse « Non exécuté (aucun shell, EPERM) » du §12 est fausse** : le shell a fonctionné à
la première tentative, sans relance, et les trois mesures ont été produites. Le §12 doit être
corrigé.

---

## Remaining objections

| # | objection | statut | preuve / levée |
| --- | --- | --- | --- |
| 1 | Sévérité de l'objection centrale (perte de queue en flux) | `accepted` | reclassée basse, réserve tracée ; la perte de queue seule ne justifie pas P14 |
| 2 | RC2 — test du drain | `accepted` | réécrit sur condition structurelle, marge 25×, zéro `Effect.sleep`, conforme `test/AGENTS.md:165-169` |
| 3 | RC3 — visibilité du marqueur de drain | `accepted` | « modèle seulement, pas TUI » désormais explicite (§4.2, 459-473) et vérifié |
| 4 | RC4 — `INFERE` TUI | `accepted` | remplacé par `index.tsx:2462-2471`, citations exactes |
| 5 | RC5 — coût de republication par chunk | `accepted` | chiffré ; réserve : mesure analytique, non benchmarkée |
| 6 | RC6 — `INFERE` supprimées, ancres `truncate.ts` | `accepted` | `:13` / `:54` confirmées sur un fichier de 158 l. |
| 7 | `test/tool/shell.test.ts` instable, inutilisable comme référence | `accepted` | 39 échecs **pré-existants**, sans lien avec P14 ; réserve reportée plus bas |
| 8 | **§4.2 : l'argument « un marqueur par chunk » / « la taille exploserait » est faux** | `accepted` | réfuté par exécution sur 7 régimes (`markers === 1`, taille 30 069-30 073) ; **la fenêtre reste justifiée** par la raison mesurée (compte faux + `seen` incalculable). La réfutation est conservée dans le document ; l'argument doit être réécrit |
| 9 | **§4.1 croquis : `raw += chunk` sur `undefined`** | `accepted` | erreur de compilation **et** troncature silencieusement inopérante ; correctif d'un jeton, donné en RC-1 ci-dessous |
| 10 | **Coupe de queue glissante sans garde-fou de surrogate** | `accepted` | `slice(-tailLength)` peut couper une paire ; `cutStart` ne couvre que la tête ; `cutEnd()` symétrique à ajouter (RC-1) |
| 11 | Bornes de test non discriminantes | `accepted` | `marker(o).length` = 68 (o=1) … 73 (o≥100 000) ; les bornes `30 000+72+1` et `30 000+74+1` sont **valides** (vérifié : 30 069 ≤ 30 073 et 30 074 ≤ 30 075) mais **trop lâches** pour attraper une dérive de quelques caractères |
| 12 | **F-3** — secrets absents de `shell.ts` | `out_of_scope` | **arbitré §6** : `part.state.metadata` ne traverse pas vers le fournisseur (`message-v2.ts:1078`) |
| 13 | **F-4** — drain invisible au TUI | `out_of_scope` | comportement voulu et désormais explicite ; le corriger demanderait de pousser dans `last` (published preview) |
| 14 | **F-5** — fenêtre config-dépendante | `out_of_scope` | le budget est paramétré (`:341-342`), pas figé ; choix de portée assumé |
| 15 | §12 — « Non exécuté (aucun shell, EPERM) » | `refused` | **prémisse fausse** : shell fonctionnel, typecheck et deux suites rejoués |
| 16 | Verdict `:242` pour `truncated: false` | `accepted` | le `return` est en `:245` ; `:242` est la garde — ancre imprécise, affirmation vraie |

**Aucun `open`.** → **P14 est implémentable.**

**Required changes (à lever avant implémentation) :**

- **RC-1** — `proposals/P14-preview-tail-loss.md:385` : remplacer `raw += chunk` par
  `raw = (raw ?? "") + chunk` (ou initialiser `let raw = ""`). En l'état : erreur TS et fenêtre
  qui ne tronque jamais.
- **RC-2** — `proposals/P14-preview-tail-loss.md:363-368` : réécrire l'argument de la fenêtre avec
  la raison mesurée (le total observé ne survit pas à la troncature ; `omitted` et `seen > 30 000`
  sont incalculables sur une sortie tronquée), **supprimer** l'allégation « un marqueur par chunk »
  / « la taille exploserait », et ajouter `cutEnd()` symétrique de `cutStart()` pour la coupe de
  queue glissante.
- **RC-3** — `proposals/P14-preview-tail-loss.md` §12 : remplacer « Non exécuté (aucun shell,
  EPERM) » par les mesures rejouées ci-dessus.

---

## Regressions introduced

**Aucun test vert n'est cassé.** Déclaré explicitement, sur la base d'une exécution réelle.

Base factuelle : P14 est une **proposition** ; aucune ligne sous `packages/**` n'a été modifiée
(les seuls fichiers écrits sont des sondes sous `%LOCALAPPDATA%\Temp\opencodev2\`, hors dépôt).
La seule base verte a été rejouée par moi et est verte : `test/shell/shell.test.ts` =
**12 pass / 0 fail, EXIT=0**, identique à l'état C-47 annoncé.

`test/tool/shell.test.ts` est **rouge avant toute intervention** : **39 échecs**, dominés par des
timeouts à ~5 000 ms sur `tool.shell permissions > …` et `tool.shell basic [powershell]`. Ni P14 ni
cette revalidation n'y touchent ; l'écart avec les relevés du brief (63/32/1 puis 62/33/4) est de
l'instabilité de run à run, **pas** une régression introduite.

**Réserve à porter à l'implémentation** : `tool.shell truncation > full output is saved to file when
truncated` est actuellement **rouge**, et c'est exactement le bloc `:1162-1229` que le §6 invoque
pour garantir que le chemin lignes/octets reste inchangé. La garantie de non-régression de §6 est
donc **invérifiable contre une suite rouge**. Ce n'est ni un défaut de P14 ni un résidu de P14 et
cela ne crée pas de `open` (aucun code de P14 n'est en cause), mais l'implémentateur doit savoir
que ce bloc n'est pas un filet de sécurité aujourd'hui.

---

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

Implémentable : aucun résidu `open`, et la section précédente déclare explicitement qu'aucun test
**vert** n'est cassé.

---

## Grille d'effort pour la vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| RC-1 : corriger `raw += chunk` (croquis §4.1) | XS | `docs/harness-audit/proposals/P14-preview-tail-loss.md:385` | aucun (erreur de compilation) | aucun |
| RC-2 : réécrire l'argument §4.2 + ajouter `cutEnd()` | XS | `docs/harness-audit/proposals/P14-preview-tail-loss.md:363-368` | aucun (correction de raisonnement) | aucun |
| RC-3 : corriger §12 (mesures réelles) | XS | `proposals/P14-preview-tail-loss.md` §12 | aucun | aucun |
| `preview()` → `{ text, truncated }` + `cutStart` | S | `packages/opencode/src/tool/shell.ts:235-238` | `truncated: true` au-delà de 30 000 ; `cutStart` ne coupe jamais une paire de surrogates | `test/shell/shell.test.ts` (bloc aperçu) — relire avant patch |
| `previewWindow()` accumulatrice | M | `packages/opencode/src/tool/shell.ts:454`, `:512` | flux multi-chunks : `omitted` annoncé == total exact, **un seul** marqueur, tête et queue faithfules | `test/shell/shell.test.ts:1134` (progression) — **chemin le plus exposé** |
| Marqueur de drain (`drained`) | S | `packages/opencode/src/tool/shell.ts:500-546`, `:573-593` | enfant détaché tenant le pipe + marge 25×, **aucun `Effect.sleep`** ; présent dans `output`, absent de `metadata.output` | `test/shell/shell.test.ts` ; ne pas dégrader `test/tool/shell.test.ts:1161-1229` (déjà rouge) |
| `metadata` : `previewTruncated` vs `truncated` + `outputPath` | S | `packages/opencode/src/tool/shell.ts:596-621` | les deux causes distinctes ne sont jamais confondues ; `outputPath` présent quand `truncated` | `test/shell/shell.test.ts:1134` **et** `index.tsx:2462-2471` (le TUI lit `metadata.output`) |
| Suppression de `body !== (last \|\| output)` (§5.6) | XS | `packages/opencode/src/tool/shell.ts:611-621` | aucun test (suppression d'un chemin mort) | aucun |