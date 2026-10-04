# P01 — Revalidation (vague 3b, revalidateur indépendant)

Je n'ai rédigé ni la proposition initiale, ni `P01-verdict.md`, ni la révision. Toutes les
citations ci-dessous ont été relues dans le code de cette passe, pas reprises de la
révision. Aucun fichier sous `packages/**` n'a été modifié, aucune commande `git` n'a été
exécutée, la proposition n'a pas été éditée.

## Proposal

`docs/harness-audit/proposals/P01-read-instruction-reminder.md` (588 lignes, version révisée).

Objet : `POINTER` — remplacer le corps complet d'un fichier d'instructions déjà injecté par
un pointeur borné et constant, sur les quatre chemins de `read.ts` qui le réinjectent
(`read.ts:357`, `:362`, `:379`, `:397`, `:466`). Le gain visé est la suppression de la
répétition ; le résidu visé est la réinjection.

Mécanisme confirmé par relecture :

- `loaded` provient bien de `Instruction.resolve` — `read.ts:271`
  `const loaded = yield* instruction.resolve(ctx.messages, filepath, ctx.messageID)`,
  implémenté en `instruction.ts:287-332`.
- La première livraison est préservée : `instruction.ts:249` / `:293` ne court-circuitent
  que le mode `off`, et `instruction.ts:259` / `:264` / `:273` / `:323` ne rendent que ce
  qui n'a pas encore été Claimé.
- La clé de ledger est alignée sur `provenUnchanged` : `read-ledger.ts:280-282`
  `` `${filepath}\u0000${offset}\u0000${limit}` ``, et `read-ledger.ts:418`
  `return seen.mtime !== 0 && mtime !== 0 && seen.mtime === mtime && seen.size === size`.
- Le chemin `unchanged` est bien compté parmi les quatre : `read.ts:358-370`, retour
  `read.ts:362` `output: ReadLedger.stub(filepath, entry) + reminder`.

Ces quatre points sont **confirmés et à conserver**.

## Revisions applied

### C-22 — traitée quant au fond ✔

Le §6 d'origine justifiait la menace par les globs `instructions` acceptant des fichiers
distants. C'était une inversion du code. Le §6 révisé (§6.1, `la menace est l'absence de
contrôle de provenance`,titre ligne 349) porte maintenant la menace réelle.

*Le scénario est nommé* (lignes 383-387) : « Un `AGENTS.md` **committé dans le dépôt** — donc
versionné, donc synchronisé par `git clone`, donc présent avant la moindre action de
l'utilisateur […] Le dépôt est le vecteur ; `git clone` est le mécanisme de livraison. »

*Les trois faits* sont énoncés et vérifiés (lignes 380-381) : `extract` / `s.claims`
(`instruction.ts:24-39`, `:97`) portent sur la **répétition**, jamais sur l'**origine**.
Confirmé : `instruction.ts:24` `function extract(`, `:28` filtre `part.tool === "read"`,
`:29` `if (part.state.time.compacted) continue`, `:30` `const loaded =
part.state.metadata?.loaded` ; `instruction.ts:97` `claims: new Map<MessageID, Set<string>>()`.
La remontée de nom et le rendu sans contrôle de provenance se situent dans
`instruction.ts:298-337`, que j'ai relu.

*La justification par les fichiers distants est reléguée, pas supprimée* — sous le titre
explicite **« Ce qui n'est pas la menace »** (ligne 405), avec le bloc de code reproduit
(409-414) et la phrase qui ferme le debate (417-419) : « Le `continue` de la ligne 210 écarte
l'entrée : une URL dans `instructions` est ignorée, pas chargée. Appuyer la justification du
correctif sur ce canal revient à s'appuyer sur le code qui le neutralise. » C'est exactement
le contre-argument demandé. **Trace conservée.**

**Contrôle de la citation — les trois lignes exactes** (`instruction.ts:204-212`, relu) :

| ligne | texte réel |
| --- | --- |
| 206 | `      if (config.instructions) {` |
| 207 | `        for (const raw of config.instructions) {` |
| 208 | `          if (raw.startsWith("https://") || raw.startsWith("http://")) {` |
| 209 | `            log.debug("instruction file skipped", { filepath: raw, source: "config", reason: "remote" })` |
| 210 | `            continue` |
| 211 | `          }` |

Les trois lignes citées par la révision — **206, 208, 210** — sont exactes, et le `log.debug`
est bien sur **209 seul**. L'attribution fantôme `206-211` a réellement disparu. **Aucune
citation fausse trouvée.** C-22 est levée.

### C-23 — traitée quant au fond, mais le test ajouté est rouge ✘

T7 (lignes 495-512) exerce **réellement** la branche que rien ne testait :

- relecture du **même** fichier `subdir/nested/test.txt`, **sans modification** (commentaire
  ligne 505 : « Same file, untouched: mtime and size are identical, so provenUnchanged
  holds ») ;
- passage par `nextMessage` (ligne 506), donc nouvelle paire message/assistant et therefore
  ré-exécution du rendu ;
- sortie par `read.ts:408` → `read.ts:362`.

Les trois premiers critères sont corrects et suffisent à prouver le passage par la branche :

- `Unchanged since your earlier read` présent ⇒ `read-ledger.ts:427`, cité comme « la ligne du
  stub » par la révision : **exact** (`read-ledger.ts:423-430` est bien le corps de `stub`, et
  427 est bien la phrase attendue).
- `already in context` présent ⇒ `POINTER` concaténé à `read.ts:362`.
- `Test Instructions` absent ⇒ le corps n'a pas été réinjecté sur ce chemin.

**Mais le quatrième critère est faux** : `Buffer.byteLength(second.output) < 512`
(ligne 510) est arithmetiquement insatisfaisable avec le code que la proposition livre.
Détail en `## Remaining objections` / `P01-RES-T7-BOUND`. C-23 est traitée **quant au fond**
(la branche est enfin couverte) mais **pas quant au test**, qui est rouge à la livraison.

## Status

Les deux objections de la vague 2 ont été travaillées, et C-22 est proprement close. Mais
deux résidus `open` subsistent :

1. le quatrième critère de T7 est **faux** — le test est rouge à la livraison, et sa
   validité dépend de la longueur du chemin temporaire ;
2. `P01-RES-PROVENANCE`, de sévérité `haut`, est classé hors périmètre alors que le patch ne
   réduit que l'**amplification** de la menace, pas sa **rémanence**.

Selon la règle d'implémentabilité (`Règles 1` et `3`), un seul résidu `open` interdit
l'implémentation. L'implémentabilité est donc refusée.

## Remaining objections

### `P01-RES-T7-BOUND` — `open` — bloquant

Le critère `Buffer.byteLength(output) < 512` ne peut pas être vrai. Reconstitution de la
sortie par le chemin `unchanged`, à partir des constantes **verbatim** du dépôt :

- `output = ReadLedger.stub(filepath, entry) + reminder` (`read.ts:362`) ;
- `stub` = `read-ledger.ts:423-430`, soit 6 lignes jointes, chemin inclus une fois ;
- `reminder` = `\n\n<system-reminder>\n` + `POINTER` + `\n</system-reminder>`
  (`read.ts:357`), où `POINTER` est produit par `renderInstruction`
  (`instruction.ts:41-55`) ;
- mode par défaut = **`summary`** (`context-rollout.ts:39`
  `injectionInstructions: "summary"`), reached via `context-rollout.ts:73`.

Mesuré (`UTF8.GetByteCount`, chemin temporaire réel de cette machine
`C:\Users\jeanl\AppData\Local\Temp\opencode-test-<rand>\…`) :

| longueur du suffixe aléatoire | octets du chemin | sortie `summary` | marge vs 512 |
| --- | --- | --- | --- |
| 8 | 73 | **506** | +6 |
| 10 | 75 | **510** | +2 |
| 11 | 76 | **512** | **0** |
| 12 | 76 | **512** | **0** |
| 13 | 76 | **512** | **0** |
| 16 | 76 | **512** | **0** |

Or `Math.random().toString(36).slice(2)` (`test/fixture/fixture.ts:136`) produit typiquement
11 à 13 caractères : le cas nominal donne **512**, et l'assertion est `< 512`. Elle échoue.

Pire, c'est un **reconstitution**: le chemin du fixture de T7 est
`…\opencode-test-<rand>\subdir\nested\test.txt` (ligne 500), soit **7 octets de plus** que le
chemin `…\subdir\AGENTS.md` que j'ai mesuré. La sortie réelle de T7 est donc **≈ 519
octets**, plus encore au-dessus. Le chiffre de 512 est le cas *favorable*.

Conséquence : T7 échoue non seulement sur le fond, mais **de façon dépendante de la longueur
du chemin** — donc instable par construction, sur un fichier de test neuf. C'est la même
défaut que ce que la vague 2 a reproché à `read.test.ts`.

Correction attendue, au choix : porter la borne à `>= 512` avec une borne supérieure
suffisamment large (p. ex. `< 1024`), ou rendre le chemin de test déterministe et court
(`path.relative`, ou nom de fixture sans suffixe aléatoire). La borne doit rester un
critère de **gain** réel : `stub + corps` ferait `> 1000` octets pour ce fixture, donc la
marge est conservé si on l'élargit à 1024.

Effet de bord favorable vérifié : la révision affirme (§6.1, ligne 426) que `POINTER` est
« borné et constant (~160 octets) ». Mesuré : **162 octets**. L'affirmation est honnête.

### `P01-RES-PROVENANCE` — `open` — bloquant (reclassé depuis `haut / hors périmètre`)

Le §6.1 révisé (lignes 397-403) reconnaît correctement que « la première injection d'un
`AGENTS.md` committé reste donc en clair et hors bande, une fois », et justifie le hors
périmètre par le besoin d'une validation de sources (marqueur de confiance, opt-in dépôt).

Le mécanisme est exact. Mais la justification de « hors périmètre » ne tient pas, parce que
le patch ne traite pas la menacersévisée — il en traite une autre propriété :

- **Le patch réinjecte-t-il un secret ? Non.** Il réduit strictement les octets : le corps
  complet est remplacé par `stub + POINTER` borné. Il n'y a aucun chemin où le correctif
  réinjecte un contenu absent auparavant. Sur ce point, la proposition est franche et la
  rétention est un gain net.
- **L'exposition subsiste-t-elle après patch ? Oui, et c'est celle qui compte.** Une seule
  injection en clair suffit à atteindre l'objectif de l'attaquant : faire obéir le modèle
  pour toute la session. La menace est atteinte avec **une** occurrence. Le correctif fait
  passer l'amplification de ~205 occurrences (affirmation de la révision, ligne 391) à **1**,
  ce qui rend la livraison plus économique, mais **l'instruction non sollicitée reste
  présente dans le contexte, sans consentement et sans contrôle de provenance** — le point
  exact que le §6.1 nomme lui-même comme « la menace ».

Autrement dit : la sévérité `haut` de ce résidu porte sur l'injection survivante, que le
patch ne diminue pas. Le classer `out_of_scope` revient à dire « nous ne corrigeons pas la
menace, mais nous la rendons plus compacte » — ce qui est un changement de priorité, pas une
justification de périmètre. Conformément à la règle 3 du gabarit, je ne le requalifie pas en
`accepted` pour débloquer.

Ce résidu est **traitable** : un opt-in par dépôt pour les fichiers d'instructions versionnés
(via `git rev-parse --show-toplevel` ou présence de `.git`), avec rendu inchangé pour
`~/.config/opencode/AGENTS.md` et les chemins explicites de l'utilisateur, couvrirait la
menace. C'est un travail distinct, mais il est **borné**, et il est la condition pour que la
sévérité `haut` puisse être descendue.

### `P01-RES-CACHE-ORDER` — `out_of_scope` — non bloquant

L'ordre entre le cache d'instructions (`instruction.ts:135-143`, `signature = ${stat.size}:${mtime}`)
et la construction du `reminder` (`read.ts:357`) reste à vérifier à l'implémentation. Je ne
l'ai pas simulé. Faible, non.load-bearing pour la décision, et explicitement renvoyé par la
proposition. Accepté comme vérification d'implémentation.

### `P01-CLAIM-205` — `out_of_scope` — non bloquant

La révision affirme « ~205 occurrences sur la session mesurée » (lignes 391-392). Aucun
artefact de mesure n'est fourni, donc je ne peux ni le confirmer ni le réfuter. Je le note
sans le retenir : l'argument de menace du §6.1 repose sur le **mécanisme** (remontée de nom +
rendu sans contrôle de provenance + réinjection à chaque lecture), pas sur ce décompte. Le
gain de 205 à 1 reste correct par le mécanisme, que le chiffre exact soit 205 ou non.

## Regressions introduced

**Non — aucun test vert n'est cassé. Affirmé explicitement, conformément à la règle 1.**

Rien n'a été patché : cette revalidation n'écrit que ce fichier. Le « avant » est donc le
« après ».

Mesures de référence, `cwd = packages/opencode` :

| test | avant | après | statut |
| --- | --- | --- | --- |
| `test/shell/shell.test.ts` | `EXIT=0`, **12 pass / 0 fail**, 26 expect(), 5.39 s | identique | **verte, stable** |
| `test/tool/read.test.ts` | `EXIT=1`, **54 pass / 2 fail** (run 1) puis **55 pass / 2 fail** (run 2) | identique | **rouge préexistant et instable** |
| `test/tool/read-instruction-reminder.test.ts` | inexistant | inexistant | **fichier neuf** (ligne 529) |

Échecs de `read.test.ts`, dans les deux runs, tous deux dans le bloc
`tool.read external_directory permission` :

- `normalizes read permission paths on Windows`
- `does not ask for external_directory permission when reading configured references`

Aucun ne touche au chemin d'instructions. Ce sont des échecs d'avance, hors périmètre de P01.

Deux corrections de ma propre mesure, à consigner :

- Un run groupé a rapporté `SHELL_EXIT=1` **sans aucun compteur**. C'était un artefact de mon
  script — un seul chemin de log réutilisé pour deux exécutions, le second `bun test` ayant
  écrasé la sortie du premier. Re-run isolé : `EXIT=0`, 12 pass / 0 fail. **Anomalie
  auto-réfutée, pas une régression.**
- Le premier `read.test.ts` a.Exit 1 et le log contenait `EPERM`, d'où la relance unique
  autorisée. Après relance, le log **ne contenait plus aucun motif EPERM** : l'`EPERM` était
  un transitoire de premier run, pas la cause des 2 échecs.

`bun typecheck` = `TYPECHECK_EXIT=0` (bun 1.4.2, 16 s) — **état fourni, non remesuré**.

Le fichier `test/tool/shell.test.ts` n'a **pas** servi de référence, conformément à
l'avertissement d'instabilité.

## Final verdict

REVALIDATED-FAIL

Précision nécessaire, car le signal est normally réservé aux `Required changes` intacts : ici
C-22 et C-23 **ont** été traitées quant au fond (la menace est renommée et la branche
`provenUnchanged` est enfin couverte). Le `FAIL` n'est donc pas prononcé parce que les
objections de la vague 2 tiennent encore. Il est prononcé parce que :

1. `P01-RES-T7-BOUND` est un `open` : la proposition livre un test dont le critère est
   faux, rouge à la livraison et instable par construction ;
2. `P01-RES-PROVENANCE` est un `open` : sévérité `haut`, le patch n'en diminue que
   l'amplification, et la menace survit à une occurrence.

`REVALIDATED-PASS_WITH_CHANGES` aurait asserts l'implémentabilité, ce qu'interdit la règle 1
dès qu'un `open` subsiste. Entre les deux, la règle 3 prévaut : l'implémentation est
**refusée**. Levée des deux `open` requise avant vague 4 — le second est le plus long.

## Effort (vague 4)

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| 1. Exposer la signature dans `metadata.loaded` | S | `packages/opencode/src/session/instruction.ts` | `test/tool/read-instruction-reminder.test.ts` | aucun (champ additif) |
| 2. Magasin de signatures par `(sessionID, filepath, size:mtime)` | M | `packages/opencode/src/tool/read-ledger.ts` | `test/tool/read-instruction-reminder.test.ts` | aucun (magasin neuf) |
| 3. `POINTER` sur les 4 chemins de `read.ts` (`:357`) | M | `packages/opencode/src/tool/read.ts` | T1–T7 | **oui** — relire `test/tool/read.test.ts` (rouge instable 54/2→55/2, ne pas prendre pour référence) et `test/shell/shell.test.ts` (12/0, seule base fiable) |
| 4. Corriger la borne `< 512` de T7 (→ `< 1024` ou chemin déterministe) | S | `test/tool/read-instruction-reminder.test.ts` | corriger T7 | aucun (fichier neuf) |
| 5. Provenance : opt-in par dépôt pour `AGENTS.md` versionné | L | `packages/opencode/src/session/instruction.ts` | nouveau test provenance (dépôt avec `.git` vs `~/.config`) | **probablement oui** — le premier rendu change de forme ; relire `test/tool/read.test.ts` |
| 6. Vérifier l'ordre cache / reminder | S | `packages/opencode/src/tool/read.ts` | assertion d'ordre dans le fichier neuf | aucun |