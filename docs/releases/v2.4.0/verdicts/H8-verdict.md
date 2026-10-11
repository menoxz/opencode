# Verdict de validation — H8

## Proposal

`H8` — Retry non destructif et garde-fous. Fiche validée : `docs/releases/v2.4.0/items/H8.md` (217 lignes).

## Validator

Agent indépendant : n'a ni rédigé ni relu la fiche avant de l'auditer. Aucun fichier source
modifié ; seules des lectures et des `grep` ont été exécutés.

## Status

`PASS_WITH_CHANGES`

Le diagnostic est exact et vérifié : le retry enveloppe bien la réouverture complète du stream
(`processor.ts:972` remet `currentText` à zéro, `:976` rouvre `llm.stream`, `:1001` enveloppe le tout dans
`Effect.retry(SessionRetry.policy({…}))`), la politique de session n'a **aucun plafond d'attempts**
(`retry.ts:190` `Schedule.fromStepWithMetadata`, arrêt uniquement via `Cause.done` quand l'erreur n'est
plus retryable), et le timeout d'inactivité est bien désactivé par défaut (`llm.ts:523-529`,
`runtime-flags.ts:68`). Le critère §7 est **absolu et monotone** (token ≤, ms ≤, booléen), sans ratio à
dénominateur réduit — conforme à la leçon P19/O1.
Le statut n'est pas `PASS` : la **valeur par défaut proposée (120 s) réintroduit la régression que la fiche
cite elle-même** (O1), et la garde de retry est indexée sur un champ volatil qui ne capte pas tous les cas
visés (O2). Ces deux défauts sont corrigeables dans le document.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok, 1 décalage | `processor.ts:972/976/1001` verbatim ; `retry.ts:25-29` verbatim (INITIAL_DELAY 2000, FACTOR 2, MAX_DELAY_NO_HEADERS 30_000, MAX_DELAY 2_147_483_647, MIN_DELAY 1) ; `:190` `Schedule.fromStepWithMetadata(` ; `executor.ts:35` `const MAX_RETRIES = 2` ; `:347-358` verbatim ; `llm.ts:523-529` verbatim ; `runtime-flags.ts:68` verbatim ; `llm.ts:514-522` verbatim. Décalage : §7.2 cite `llm.ts:41` pour `StreamTimeoutError`, la classe est déclarée `:42` (le `:41` est le commentaire) |
| le correctif supprime bien la cause racine | partiel | la garde proposée s'indexe sur `ctx.currentText`, or ce champ est un `TextPart` **volatil** : posé `processor.ts:793`, remis à `undefined` dès la fermeture d'un bloc de texte `:847` et `:884`, et à l'entrée du gen `:972`. Une erreur après la fin d'un bloc de texte laisse `currentText === undefined` ⇒ la garde retente quand même de zéro (O2) |
| le critère §7 est ABSOLU et MONOTONE | ok | §7.1 `billed_tokens_after_error <= billed_tokens_reference` (absolu) ; §7.2 `wall_ms <= timeout + marge` (absolu) ; §7.3 résilience booléenne. Aucun ratio ; aucun dénominateur réduit par le patch |
| les tests §8 sont exécutables ici | ok | `packages/opencode/test/session/` existe ; commande `bun test --timeout 30000 ./test/session/retry-non-destructive.test.ts` valide ; le mutant §8.2 (neutraliser `currentText === undefined`) est un vrai test par mutation |
| les régressions potentielles sont nommées et réelles | ok | les 6 fichiers listés §6 existent : `test/session/{retry,processor-effect,llm,llm-native}.test.ts` et `src/session/{prompt-budget,step-limit}.test.ts` |
| les `INFERE:` de la fiche sont marqués avec méthode de vérification | partiel | §10 porte bien un `INFERE:` (« la fiche n'a pas pu prouver » la reprise de stream côté provider), mais **sans méthode de vérification** ; l'alternative (ii) est écartée sans protocole de test |
| l'effort §9 est réaliste | ok | `M` : la garde touche le cycle de vie du stream (`processor.process`) et l'alignement des deux couches exige de raisonner sur leur composition |

## Objections

### O1 — CRITIQUE. Le timeout par défaut de 120 s réintroduit la régression que la fiche cite

§4 propose `const streamTimeoutMs = flags.streamTimeoutMs ?? 120_000 // 120 s, débrayable`. Or la fiche
cite, deux paragraphes plus haut, la preuve exacte qui interdit cette valeur : le commentaire
`llm.ts:514-522` documente qu'activer la borne par défaut **a cassé un tour sain** — « `question …
asking`, then permissions and reads, then **120003ms** later `stream produced no event within 120000ms` ».
Un défaut à 120 000 ms reproduit littéralement ce cas : tout tour qui attend une réponse humaine ≥ 120 s
est coupé. §6 et §10 le reconnaissent (« doit rester au-dessus du temps de réponse humaine »), mais le
chiffre retenu contredit l'aveu.

**Ce qu'il faut changer** : ne pas activer la borne par défaut sur la valeur citée. Soit l'armer seulement
**après** le premier événement de stream (une panne « stream qui cale » est, par définition, postérieure au
premier chunk), ce qui exclut la fenêtre d'attente utilisateur ; soit choisir un défaut très supérieur au
temps de réponse humaine et le documenter comme tel. Trancher dans la fiche, pas au §10.

### O2 — MAJEUR. La garde de retry est indexée sur un champ volatil

§4 propose :

```ts
Effect.retry({
  while: () => ctx.currentText === undefined || ctx.currentText === "",
  schedule: SessionRetry.policy({ ... }),
}),
```

`ctx.currentText` n'est pas un indicateur « du contenu a été streamé » : c'est le `TextPart` courant,
effacé dès qu'un bloc de texte se ferme (`processor.ts:847`, `:884`) et à l'entrée du gen (`:972`). Donc,
pour toute erreur survenue **après** la fermeture d'un bloc de texte (cas fréquent : le modèle écrit un
paragraphe, puis le provider renvoie un 5xx), la garde voit `undefined` et **retente de zéro** — exactement
la double facturation que la fiche veut supprimer. De plus `ctx.currentText === ""` n'est jamais vrai
(`currentText` est un objet, pas une chaîne). Le critère §7.1 étant un total de tokens, il ne détecte ce
trou que si le scénario place l'erreur précisément pendant le streaming.

**Ce qu'il faut changer** : indexer la garde sur un drapeau **persistant par step** — p. ex. un booléen
`ctx.streamed` posé au premier `text-delta`/`tool-call` (`handleEvent`) et remis à zéro seulement à
l'entrée du step — et non sur `currentText`. Ajouter un cas §8 couvrant « erreur après la fermeture d'un
bloc de texte » (le mutant §8.2 doit le reproduire).

### O3 — MAJEUR. Le troisième correctif (alignement des couches de retry) n'a ni critère ni test

§4 annonce trois correctifs alignés, dont « **Alignement des couches** : plafonner la composition
(`executor MAX_RETRIES` × politique de session) pour que le nombre total de tentatives soit borné », et le
BACKLOG l'exige explicitement (« aligner les deux couches de retry »). Or §7 ne contient **aucun** critère
pour cet axe, et §8 ne le teste pas : le cas 3 se contente de « total de tentatives borné », sans valeur.
Les deux couches composent bien (`executor.ts:35` `MAX_RETRIES = 2`, `retry.ts:190` sans plafond), mais
rien ne vérifie la borne.

**Ce qu'il faut changer** : ajouter au §7 un critère absolu (p. ex. `total_attempts <= executor.MAX_RETRIES
+ session_budget`, ou un plafond de session explicite) et un cas §8 qui compte les tentatives effectives
sur un provider qui échoue en boucle retryable.

### O4 — MINOR. `INFERE:` sans méthode, et `llm.ts:41` décalé

§10 signale correctement un `INFERE:` (« reprise de stream côté provider non prouvée ») mais ne donne
aucune méthode pour le lever ; et §7.2 cite `llm.ts:41` pour `StreamTimeoutError` alors que la classe est
en `:42`.

**Ce qu'il faut changer** : assortir l'`INFERE:` d'un protocole (p. ex. rejouer un stream tronqué auprès du
modèle openai-compatible et observer la reprise) ; corriger `:41` → `:42`.

## Required changes

1. **Remplacer le défaut `120_000`** par une borne qui n'attrape pas la fenêtre d'attente utilisateur
   (armement après le premier événement, ou défaut ≫ temps de réponse humaine), tranché dans le §4/§6.
2. **Réindexer la garde de retry** sur un drapeau persistant par step (posé au premier delta de contenu,
   remis à zéro à l'entrée du step) au lieu de `ctx.currentText`, et retirer la comparaison `=== ""`.
3. **Ajouter un critère §7 et un cas §8** pour l'alignement des deux couches de retry (nombre total de
   tentatives borné).
4. **Étayer l'`INFERE:` du §10** par une méthode de vérification et corriger `llm.ts:41` → `:42`.

## Implementation guidance

Ordre : (1) d'abord la garde de retry dans `processor.ts` — introduire un drapeau `ctx.streamed` par step
(posé dans `handleEvent`, sur `text-delta` et `tool-call`, `processor.ts:793`/`:490`), remis à zéro à
`processor.ts:972`, puis conditionner `Effect.retry` (`:1001`) ; (2) vérifier que le mutant §8.2 reproduit
la double facturation ; (3) traiter ensuite le timeout par défaut (`llm.ts:523`, `runtime-flags.ts:68`) en
**armant après le premier événement** pour ne pas rejouer la régression documentée `llm.ts:514-522` ;
(4) en dernier, plafonner `executor.ts:35` × `retry.ts:190` et compter les tentatives.
Pièges : (a) `Effect.retry` avec `while` **et** `schedule` est valide (l'API accepte un objet
`{ while, schedule }`) ; (b) ne pas casser la résilience pré-premier-chunk — l'erreur avant tout contenu
doit continuer à être retentée (`retry.ts:80-82` : les 5xx sont explicitement retryables) ; (c) le test §8.4
doit observer le `StreamTimeoutError` (`llm.ts:42`) et non un simple `Effect.fail` vide, la fiche insiste
(`llm.ts:512` « `Stream.fail` (not empty) is required so runDrain fails »).
