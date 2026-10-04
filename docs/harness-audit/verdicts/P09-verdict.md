# P09 — `bash` : troncature destructive au plafond, sans chemin de récupération

## Proposal

`P09` — troncature destructive au plafond de `bash`, sans chemin de récupération.
Fichier validé : `docs/harness-audit/proposals/P09-bash-artifact-first.md` (358 lignes).

Gabarit : `docs/harness-audit/VERDICT-TEMPLATE.md`.

## Validator

`validator-independent-p09` — `independent` : n'a pas rédigé la proposition. A uniquement lu
le gabarit, la proposition et le code source réel (`shell.ts`, `truncate.ts`,
`terminal-output.ts`, `tool.ts`, `processor.ts`, `lean-output-policy.ts`).

Aucun fichier source modifié. Seul artefact écrit :
`docs/harness-audit/verdicts/P09-verdict.md`.

## Status

`FAIL`

Le défaut décrit est réel, mais la proposition repose sur une statistique fausse, une
inférence non observée qu'elle-même déclare non observée, et elle n addresses pas le
contre-argument principal (exit 0 avec sortie en erreur). Le correctif proposé, tel quel,
n'est pas prouvable.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | KO | `truncate.ts:225` cité pour `Upstream reference (unverified; not opened)` — la ligne 225 n'existe pas : le fichier fait 158 lignes. La chaîne est en réalité à `truncate.ts:130`. `truncate.ts:17` cité pour `TRUNCATION_DIR` — la ligne est `export const DIR = TRUNCATION_DIR` ; `TRUNCATION_DIR` est importé en `truncate.ts:10` et défini dans `truncate-dir.ts`. `terminal-output.ts:58` cité pour `"[... omitted; see raw journal ...]"` — la ligne 58 est `const marker = "\n[... omitted; see raw journal ...]\n"` ; la citation est defendable mais la formulation de §4.3 étape 3 est imprécise. `truncate.ts:15-16` cité pour « 50 102 o / 4 000 c » — `truncate.ts:16` est bien `export const MAX_BYTES = 50 * 1024`, mais la colonne dit « plafond 50 102 o » pour le couple `truncate.ts` / `lean-output-policy.ts:4`, or `lean-output-policy.ts:4` est `LEAN_TERMINAL_MAX_CHARS = 4_000` (limite lean, jamais appliquée à `bash`) : la comparaison oppose deux plafonds qui ne s'appliquent pas au même outil. |
| le correctif supprime vraiment la cause | non-testé | La cause réelle est `shell.ts:505-510` (purge par la tête) + `shell.ts:517-519` (spill conditionné à `Buffer.byteLength(full) > limits.maxBytes`). Le correctif §4.2 étape 1 remplace les deux par un sink au premier chunk : sur le papier cela supprime la cause. Mais le patch proposé `const raw = yield* fs.readFileString(file ?? "")` (P09:192) n'est pas implémentable tel quel : `grep readFileString\|writeFileString` sur `shell.ts` ne retourne **aucun** résultat, et `AppFileSystem` n'expose `readFileStringSafe` (`packages/core/src/filesystem.ts:28`), pas `readFileString`, dans son interface déclarée. Le correctif est donc non compilable en l'état. |
| le correctif ne casse pas un comportement existant | non-testé | Le test 1 (§7) impose `metadata.truncated === true` pour une sortie de 200 000 caractères. Or `tail()` (`shell.ts:240-270`) plafonne à `maxLines = 2 000` (`truncate.ts:15`) : pour 200 000 caractères, `end.cut` est vrai et `cut` passe à `true` (`shell.ts:596`) — le test passerait, mais il ne prouve pas que les 200 000 octets sont sur disque tant que la lecture du fichier n'est pas comparée à la taille réelle du processus. Aucun test n'est exécutable en l'état (voir ligne suivante). |
| tests proposés sont exécutables dans ce dépôt | KO | §7 propose `bun test test/tool/shell-artifact-first.test.ts test/tool/terminal-output-no-fake-artifact.test.ts` : les deux fichiers sont « à créer », donc la commande est inexécutable avant le patch. Pire, la commande de non-régression cite `src/tool/lean-output-policy.test.ts` avec un chemin `src/` depuis `packages/opencode` : le fichier existe bien (`lean-output-policy.test.ts:58` `expect(LEAN_TERMINAL_MAX_CHARS).toBe(4_000)`, `:127` `expect(leanToolOutputBudget("bash")).toMatchObject({ maxChars: 4_000, direction: "tail" })`), la commande est donc correcte sur ce point. Le blocage réel est ailleurs : §7 exige `metadata.leanOutputBudget.outputPath` (`terminal-output.ts:264-271`) alors que ce bloc n'est produit que sous `flags.experimentalLeanOutputBudget` **et** `!terminal` (`processor.ts:587`), et `isLeanTerminalTool("bash")` renvoie `true` (`lean-output-policy.ts:39`). Donc `leanOutputBudget` n'est **jamais** écrit pour `bash` : le « signal de terrain » proposé est inatteignable, la mesure de succès est inapplicable. |
| effort et coût annoncés réalistes | KO | « 445 fichiers au lieu de 1 » (P09:265) et « 445 appels récupèrent aujourd'hui zéro octet » (P09:267-268) sont faux. Le code montre que l'artefact existe déjà pour **tout** appel dont la sortie dépasse `limits.maxBytes` : `full` s'accumule en `shell.ts:517`, le seuil est testé à `shell.ts:518`, `trunc.write(full)` s'exécute à `shell.ts:519`. En aval, `terminal-output.ts:233` écrit un fichier dès que `reduced` est vrai, et `reduced` est vrai dès que `useful !== extracted.text` — c'est-à-dire dès que le budget de `terminal-output.ts:224` (2 000 / 4 000 caractères) est dépassé. La borne réelle est 2 000 caractères, pas 4 000. Il n'existe donc pas de « 35 troncatures sans fichier » : chacune a un fichier, la question est de savoir si ce fichier est complet. |

## Objections

### O1 — La statistique « 36 troncatures, 1 seul artefact » est réfutée par le code

P09:104-105 et P09:99 (« n'a servi qu'une fois sur 36 ») affirment qu'un seul appel sur 36 a
produit un fichier. C'est faux. Deux chemins produisent un fichier, indépendamment :

`packages/opencode/src/tool/shell.ts:517-519` :
```ts
                full += chunk
                if (Buffer.byteLength(full, "utf-8") > limits.maxBytes) {
                  return trunc.write(full).pipe(
```

`packages/opencode/src/tool/terminal-output.ts:233` :
```ts
  const outputPath = reduced ? yield* input.store.write(raw) : undefined
```

avec `terminal-output.ts:232` :
```ts
  const reduced = incremental || useful !== extracted.text || initial !== useful || (structured && initial !== raw)
```

et `terminal-output.ts:148` qui fixe l'origine de `raw` :
```ts
  const raw = input.output
```

Or `isLeanTerminalTool` renvoie `true` pour `bash` (`lean-output-policy.ts:39`
`if (normalized === "bash") return true`) et `compactTerminalOutput` ne s'applique donc pas
seulement aux agents lean (`terminal-output.ts:142`). `processor.ts:581` appelle
`normalizeTerminalOutput` pour tout `toolCall`. Toute sortie `bash` dépassant le budget de
`terminal-output.ts:224` déclenche donc `store.write` et un `Received output saved to:`
(`terminal-output.ts:236`) — bien plus souvent qu'une fois sur 36.

Ce qui est vrai, et que la propositiondit à tort : le fichier produit par
`terminal-output.ts:233` est écrit depuis `raw = input.output`, c'est-à-dire depuis la sortie
**déjà bornée par `shell.ts`**. Le défaut réel est donc « l'artefact est incomplet », pas
« l'artefact est absent ». Conséquence : le correctif §4.2 étape 2
(`const outputPath = upstream ?? (reduced ? yield* input.store.write(raw) : undefined)`)
ne crée pas de nouvelle capacité, il change la source d'un fichier qui existe déjà.

Quoi changer : remplacer la statistique « 1/36 » par une mesure — poser un fichier issu de
`terminal-output.ts:233` et comparer `rawBytes` (`terminal-output.ts:260`) à la taille réelle
de la sortie du processus. Tant que cette mesure n'existe pas, le volume de marché du correctif
est inconnu. La proposition reconnaît elle-même ce résiduel (P09:349-357) tout en bâtissant
ses sections 1, 2, 6 et 7 sur la version mesurée de la statistique : c'est contradictoire.

### O2 — « exit 0 avec sortie en erreur » n'est pas traité ; le correctif l'aggrave

P09 ne contient aucune occurrence de `exit` dans une puce de risque : `grep "exit|code 0|exit=0|décision"`
sur le fichier ne retourne que P09:316 (« exit code 0 avec `0 fail` », la commande de test) et
P09:333 (« décision d'architecture »). Le risque demandé est absent des §5 et §6.

Le risque est réel et le code le montre. `terminal-output.ts:168-170` :
```ts
  const failed =
    [...hostExits, ...reportedExits].some((value) => value !== 0) ||
    [host, extracted.controls].some((value) => value.isError === true || value.success === false || /^(failed|error)$/i.test(String(value.status)))
```
et `terminal-output.ts:224` :
```ts
  const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES
```

`failed` dépend de l'exit code et `budget` dépend de `failed`. Le budget double quand aucun
signal d'échec n'est détecté dans le texte utile — c'est-à-dire quand `ERROR.test(useful)`
échoue. La regex d'erreur est `terminal-output.ts:28` :
```ts
const ERROR = /\b(error|failed|failure|fatal|exception|panic)\b|^\s*\(fail\)/i
```

Une commande qui sort en 0 en imprimant `E   no tests found` ou `npm ERR!` matche `error`
pour le second, mais `no tests found` ne matche pas. Le budget tombe alors à 2 000 et
`preview()` (`terminal-output.ts:54-67`) garde la tête, un éventuel extrait d'erreur, puis la
queue. Le modèle reçoit 2 000 caractères et un `exit=0` dans l'en-tête
(`terminal-output.ts:219`). Sa décision est déjà prise avant qu'il n'ait la ligne qui dit
« rien ne fonctionne ».

Le correctif artifact-first **augmente** ce risque sans le mentionner : en rendant le pointeur
inconditionnel, on substitue au texte d'erreur manquant une affirmation de succès
(`Full output saved to:`) que rien ne qualifie. P09 ne dit nulle part que le marqueur doit
porter l'état d'échec détecté, ni qu'un exit 0 avec `ERROR.test` vrai doit forcer
`budget = MAX_BYTES`.

Quoi changer : avant toute autre chose, ajouter au §4 un cas explicite — si `exit === 0` et que
la sortie complète contient un marqueur d'erreur détecté par `terminal-output.ts:28`, alors le
résultat rendu doit porter un indicateur d'échec, pas seulement un chemin. Sans cela, le
correctif transforme « sortie tronquée ambiguë » en « sortie tronquée mais signalée comme réussie ».

### O3 — Le mécanisme « Full output saved to » existe déjà, fonctionne, et n'est pas un Travaux à refaire

P09:87-99 présente ce mécanisme comme une capacité àmobILISER (« n'a servi qu'une fois sur 36 »).
Le code montre qu'il est actif sur tous les chemins de troncature de `shell.ts` :

`packages/opencode/src/tool/shell.ts:604-606` :
```ts
      if (cut && file) {
        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output
      }
```

`cut` est positionné par deux voies indépendantes : la purge du tampon
(`shell.ts:505-510`, `cut = true` à `shell.ts:509`) et le spill
(`shell.ts:523`, `cut = true`). `file` est créé par `trunc.write` dès que la sortie dépasse
`limits.maxBytes` (`shell.ts:519`) ou par `shell.ts:597-599` :
```ts
      if (!file && end.cut) {
        file = yield* trunc.write(raw)
      }
```

Le contrat de reprise existe et est testé : `truncate.ts:29-31`
```ts
export function savedOutputPath(text: string) {
  return text.match(/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/)?.[1]?.trim()
}
```
appelé par `terminal-output.ts:145` et `truncate.ts:127`. Et le pointeur **survit** au
post-traitement de `processor.ts:585`, car `stripTerminalArtifacts` ne retire que spinner,
compaction et braille (`processor.ts:51-53`) :
```ts
function stripTerminalArtifacts(text: string): string {
  return text.replace(REPEATED_SPINNER, "").replace(COMPACTION_TRUNCATION, "").replace(BRAILLE_RANGE, "").trim()
}
```

Le mécanisme fonctionne donc. Le problème réel est la **complétude** du fichier, pas son
existence ni son absence. Construire un second mécanisme « artifact-first » alors que le
premier est déjà câblé, testé dans `shell.test.ts:1173` et `:1189` et dans
`prompt.test.ts:2674`, ajoute un second chemin d'écriture sans supprimer la perte de tête.

Quoi changer : reformuler P09 comme un correctif de **complétude de l'artefact existant**,
pas comme l'introduction d'un chemin de récupération absent. Le §4.2 étape 1 reste valide
(spooler dès le premier chunk), mais elle doit être argumentée comme la correction de
`shell.ts:505-510`, pas comme la création d'un chemin de récupération.

### O4 — La séparation shell / troncature générique est correcte dans la table, fausse dans le correctif

La table §4.1 (P09:141-148) est saine : elle attribue à `shell.ts` le tampon roulant et
`preview()`, à la troncature générique la reconstruction de chemin et le court-circuit de
`tool.ts:188-190`, et renvoie les seconds à P16/P17. Cette séparation est confirmée par
`tool.ts:188-190` :
```ts
          if (result.metadata.truncated !== undefined) {
            return result
          }
```
`truncated` est toujours posé par `shell.ts:617`, donc `truncate.output` n'est jamais appelé
pour `bash` — affirmation exacte de P09:41-42.

Mais le correctif §4.2 étape 2 modifie `terminal-output.ts:233`, c'est-à-dire la couche de
post-traitement terminal, et P09:145jusque-là classe ce défaut comme « outillage `bash`
(post-traitement) ». C'est discutable : `terminal-output.ts` est la couche qui produit le
budget d'extrait, et P09:225-228 admet que `LEAN_TERMINAL_MAX_CHARS = 4_000` n'a « jamais
vocation à s'appliquer à `bash` » parce que `processor.ts:587` exclut `bash`. Le patch touche
donc un composant partagé par tous les outils terminaux (`lean-output-policy.ts:40-43` liste
`execute|read|stream_read`, `command_stream`, `command_status`) pour un défaut propre à
`bash`. Risque de régression croisée non traité : les tests cités pour la non-régression
(`shell.test.ts`, `shell-output-prompt.test.ts`) ne couvrent pas les autres outils terminaux.

Quoi change
r : restreindre l'étape 2 à `normalized === "bash"` (le même test que
`terminal-output.ts:150`), ou justifier explicitement le bénéfice pour les autres outils
terminaux et ajouter leurs tests.

### O5 — La moyenne de 1 511 caractères rend le gain faible et le coût disproportionné

P09:102-103 : 445 appels `bash`, 672 535 caractères, soit 1 511 caractères par tour, pour un
`max_out` de 4 000 caractères. Avec une moyenne à 38 % du plafond, la majorité des appels
n'atteint aucun seuil. Le seuil réel d'écriture de fichier est pourtant
`limits.maxBytes` = 50 KiB (`truncate.ts:16`), pas 4 000. Le budget d'extrait effectif est
2 000 caractères (`terminal-output.ts:224`). Avec une moyenne de 1 511 caractères, une
fraction minoritaire seulement franchit 2 000.

Le gain revendiqué (P09:267-268 : « 36 appels sur 445 récupèrent aujourd'hui zéro octet de la
sortie tronquée ») est donc doublement invalidé : il repose sur la statistique fausse de O1, et
il ne dit rien du nombre d'appels réellement au-dessus de 2 000 caractères. Le coût annoncé
— un fichier par appel, 445 fichiers au lieu de 1 — est en revanche exact et immédiat.

Quoi changer : mesurer la distribution (combien d'appels au-dessus de 2 000 caractères, au-dessus
de 50 KiB) avant d'annoncer un gain. Si la queue au-dessus de 2 000 caractères est mince, le
correctif doit être conditionné à un seuil, pas inconditionnel — ce qui contredit l'invariant
« si une sortie `bash` est réduite, l'octet intégral existe sur disque » (P09:157-158).

## Required changes

1. Corriger les citations fausses : `truncate.ts:225` → `truncate.ts:130` ;
   `truncate.ts:17` → `packages/opencode/src/tool/truncate-dir.ts` (définition de
   `TRUNCATION_DIR`) ; préciser `truncate.ts:15-16` comme `MAX_LINES = 2 000` /
   `MAX_BYTES = 50 * 1024` et cesser d'opposer ce plafond à `lean-output-policy.ts:4`, qui ne
   s'applique pas à `bash` (`processor.ts:587`).
2. Remplacer partout « 36 troncatures / 1 seul artefact » par une mesure exécutée, et
   reformuler le défaut comme « artefact incomplet » et non « artefact absent ». Le gain
   annoncé doit êtreConditionné à cette mesure.
3. Ajouter au §5/§6 le traitement explicite du cas `exit === 0` avec sortie en erreur : citer
   `terminal-output.ts:28`, `:168-170` et `:224`, et prescrire que le pointeur inconditionnel
   porte l'état d'échec détecté, ou que `budget` reste à `MAX_BYTES` dans ce cas.
4. Rendre le correctif §4.2 étape 1 implémentable : remplacer `fs.readFileString`
   (indisponible — `packages/core/src/filesystem.ts:28` n'expose que `readFileStringSafe`) par
   une API réellement présente sur `AppFileSystem`, ou par l'accumulation en mémoire qui évite
   toute relecture.
5. Restreindre l'étape 2 à `normalized === "bash"` (`terminal-output.ts:150`) ou étendre la
   non-régression aux autres outils terminaux de `lean-output-policy.ts:40-43`.
6. Remplacer le « signal de terrain » §7 (`metadata.leanOutputBudget.outputPath`,
   `terminal-output.ts:264-271`) par une mesure atteignable : ce bloc n'est jamais écrit pour
   `bash`, `processor.ts:587` excluant `bash` via `lean-output-policy.ts:39`. Utiliser
   `metadata.outputPath` (`shell.ts:618`) ou `terminalOutput.rawBytes`
   (`terminal-output.ts:260`).
7. Resoudre la question d'architecture laissée ouverte au §9 (P09:340-347) : le correctif §4
   rend la réouverture de `tool.ts:188-190` nécessaire, ce qui contredit « `truncate.ts` n'est
   pas modifié » et le renvoi de P17. Trancher avant l'implémentation.
8. Fournir la distribution de taille des sorties `bash` (combien d'appels au-dessus de
   2 000 caractères, combien au-dessus de 50 KiB) ou conditionner l'écriture du fichier à un
   seuil, et amender l'invariant P09:157-158 en conséquence.

## Implementation guidance

Ne pas implémenter avant les corrections 1-3 : le.statut du défaut (complet vs absent) et le
risque exit-0 changent la nature du patch. Ordre retenu si le défaut est reformulé en
« artefact incomplet » : (1) `shell.ts:505-510` — remplacer la purge par la tête par un sink
créé au premier chunk, en réutilisant le `createWriteStream` déjà importé
(`shell.ts:3`, `:524`) ; (2) `shell.ts:594-599` — ne réécrire que si `file` est absent, pour ne
pas doubler l'écriture ; (3) `terminal-output.ts:233` — court-circuiter `store.write` quand
`input.metadata.outputPath` est déjà une chaîne (`terminal-output.ts:144` montre que cette
donnée est déjà lue par la couche). Piège connu : `shell.test.ts:1173` et `:1189` assertent
`/Full output saved to:\s+\S+/`, et `processor-effect.test.ts:889` assert la présence de la
chaîne — le marqueur passant de conditionnel à inconditionnel, ces assertions doivent changer
de fixtures, pas être contournées. Test à créer : `test/tool/shell-artifact-first.test.ts`,
avec un contrôle de taille — comparer `Buffer.byteLength` du fichier à la taille de la sortie
du processus, seul contrôle qui distingue « fichier complet » de « fichier qui existe ».

---

### Traces de vérification

- Citations vérifiées verbatim : `terminal-output.ts:5-6`, `:28`, `:58`, `:148`, `:168-170`,
  `:224`, `:232-233`, `:236`, `:260`, `:264-271` ; `shell.ts:3`, `:29`, `:52-59`,
  `:215-238`, `:240-270`, `:355`, `:440-455`, `:463-486`, `:501-545`, `:594-599`, `:604-606`,
  `:617-618` ; `truncate.ts:10`, `:15-18`, `:29-31`, `:68-73`, `:127`, `:130` ;
  `processor.ts:51-53`, `:573-603` ; `tool.ts:178-199` ; `lean-output-policy.ts:1-12`,
  `:37-44`.
- Statuts de test existants relevés : `lean-output-policy.test.ts:58`, `:127` ;
  `shell.test.ts:1173`, `:1189` ; `prompt.test.ts:2674` ; `processor-effect.test.ts:889` ;
  `terminal-output.test.ts:140`, `:156`, `:172` ; `message-v2.test.ts:1570`.
- Fichiers de test cités par la proposition, existence vérifiée :
  `test/tool/shell.test.ts`, `test/tool/shell-output-prompt.test.ts`,
  `test/tool/shell-launch-retry.test.ts`, `src/tool/lean-output-policy.test.ts` — tous présents.
- Fichiers annoncés « à créer » par la proposition, absence vérifiée :
  `test/tool/shell-artifact-first.test.ts`, `test/tool/terminal-output-no-fake-artifact.test.ts`.

### Résiduels non vérifiés

- La statistique « 445 appels / 672 535 caractères / 1 511 par tour / 36 troncatures » provient
  d'une session auditée non fournie au validateur. Elle n'est ni confirmable ni infirmable ici ;
  ce qui est infirmé est son **interprétation** (O1), pas les chiffres bruts.
- Aucune commande de test n'a été exécutée : la proposition ne modifie aucun code et les tests
  qu'elle propose n'existent pas encore (§7). Les verdicts « non-testé » des lignes 4 et 5 du
  tableau `Checks` sont des verdicts d'absence de preuve, pas des verdicts d'échec.
