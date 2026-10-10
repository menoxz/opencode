# P04 — revalidation (vague 4)

`revalidateur-independant-p04-revalidation` — `independent`. Je n'ai rédigé ni la proposition
initiale, ni son verdict, ni sa révision. Aucun fichier sous `packages/**` n'a été modifié ;
aucune commande `git` n'a été exécutée. Seul ce fichier est écrit.

## Proposal

`P04` — `Retry-After` non borné (24,855 j) et absence de borne sur le nombre d'appels.

Fichier relu : `docs/harness-audit/proposals/P04-retry-after-unbounded.md`.

**Fait factuel sur la taille du fichier.** Le fichier fait **561 lignes**, pas 726. Le verdict
d'origine annonçait **494 lignes** (`P04-verdict.md:6`). Les « 726 lignes » du brief **et** de la
note d'intégrité C-21 (`proposal:5`, « Le fichier précédent faisait 726 lignes ») désignent donc la
version *d'avant* réécriture. Je n'en fais pas une objection : la réécriture est bien intégrale
(§ 2.9 retire 11 citations), mais le compte du brief est faux et le lecteur qui s'y fie
chercher un texte plus long.

**Ce que la révision change de fond** : plafond par classe de cause au lieu d'un plafond global à
5 min, budget **en nombre de tentatives** au lieu de millisecondes, quota explicitement excepté,
heure de reset conservée, deux sites d'outil sortis du périmètre, effort reclassé `S` → `M`.

## Revisions applied

Lecture de `P04-verdict.md` (`:29`, `:31`, `:33` ; Required changes `:43-49`) puis vérification de
chaque exigence dans le code, point par point.

| # | Exigence du verdict | Traitement dans la révision | État, preuve |
|---|---|---|---|
| RC1 | Mesurer les `Retry-After` réels **ou** exceptionner nommément `account_rate_limit` ; conserver l'heure de reset ; test non-amorçant du nombre d'appels | § 4.1 plafond par classe, § 4.2 « `action.message` passe avant `action.reason` », § 4.3 compte, § 7.3/§ 7.4/§ 7.6 | **INTACT** sur 3 volets — voir R1, R2, R3 |
| RC2 | Réconcilier `attempt 10/10` / « 10ᵉ erreur » / test 7, ou borner en tentatives | § 4.3 : `RETRY_MAX_ATTEMPTS = 10`, plus aucun budget en ms | **complet quant au fond** — mécanisme relu ligne à ligne, réserve R5 (numérateur `n` non déclaré) |
| RC3 | Reclasser en `M` ou sortir `auto-execute.ts:98-99` | § 4.5 sortie du périmètre, § 8 `M` | **complet** — `M` confirmé par moi (§ ci-dessous), les deux sites vérifiés |
| RC4 | Étendre l'ensemble fermé de causes à `retry.ts:141/150/153/156` | § 4.2 : `rate_limited_text`, `rate_limited_http`, `provider_overloaded`, `rate_limited_code` | **complet** — les 4 formes sont nommées et mappées aux lignes citées |
| RC5 | Corriger « trois chemins » et décrire `:68` | § 2.2 table à **cinq** chemins, § 4.1 `:68` passe à 5 min | **complet** — § 2.2 vérifié contre `retry.ts:42-73` (cinq sorties : `:50`, `:59`, `:64`, `:68`, `:72`) ; **mais** un nouvel off-by-one est introduit en § 4.1 (R13) |
| RC6 | Corriger `processor.ts:945-959` → `945-955` | § 2.9 : citation **retirée** faute de relecture | **complet** — j'ai relu : le bloc va bien de `945` (`events.publish(SessionEvent.Step.Failed`) à `955` (`ctx.assistantMessage.error = error`) ; `:956-958` est le `bus.publish`. Le retrait est conforme à la règle « supprime celle que tu ne peux pas relire », aucune citation fausse ne subsiste |
| RC7 | Assertion de non-régression du message provider **+** vérifier la commande `bun test` | § 7.7 (assertion `Overloaded`) ; commande § 7 | **complet** — assertion présente ; commande **exécutée par moi** ci-dessous |

**Les 3 objections MAJEURES, une par une.**

*Objection 1 (régression du quota journalier).* **Fondement exact, traitement incomplet.** Le
mécanisme d'exception nommée est réel dans le texte (§ 4.1 : plafond par classe ; § 4.3 :
`RETRY_QUOTA_MAX_DELAY`), et l'ordre demandé — l'heure de reset avant `action.reason` — est
**effectivement présent** : § 4.2 § « Trois règles non négociables », première règle,
« **`action.message` passe avant `action.reason`** », et le code produit bien cette action
(`retry.ts:119-126`, `reason` en `:120`, `message` — l'heure de reset — en `:123`, `link` en
`:125`). Mais (a) la constante n'est **câblée à aucune sortie de `delay()`** et le § 4.1
**contredit** le § 4.3 (R1) ; (b) la conservation de l'heure de reset n'est que **conditionnelle**
(R2). Objection **non soldée**.

*Objection 2 (`attempt 10/10` arithmétiquement faux).* **Traitée.** Le budget en ms a disparu :
`attemptsSpent += 1` puis `if (attemptsSpent >= maxAttempts)`. Il n'existe plus de constante en
millisecondes qui puisse tronquer le compteur — j'ai relu `retry.ts:183-233` et confirmé qu'il n'y a
aujourd'hui **aucune** comparaison à `meta.attempt` ni aucun budget cumulé dans `policy()`. La seule
faiblesse est que le numérateur du template est la variable non déclarée `n` (R5), donc la propriété
« vrai par construction » est rendue **possible** par le mécanisme mais pas encore **énoncée** dans
le texte.

*Objection 3 (effort `S` sous-evalué).* **Traitée, et `M` est confirmé** — voir § Effort.

## Status

Statut final : **1 Required change intact sur 7** (RC1), 6 résidus `open`.

**Objection majeure 3 — décompte d'effort, vérifié.** `M` est **confirmé**, et le raisonnement de
§ 8 est même incomplet en bienfaisant :

- « `delay()` doit apprendre la cause » — exact : § 4.3 appelle
  `delay(meta.attempt, …, cause)`, donc la signature change et **7 sites d'appel de test** cassent
  (R7) ;
- « la table `describeFailure` à 9 entrées » — exact, j'ai compté `FailureCause` : `account_quota`,
  `free_tier_limit`, `provider_overloaded`, `rate_limited_http`, `rate_limited_code`,
  `rate_limited_text`, `server_5xx`, `launch_denied`, `transient_other` = **9** ;
- **deux travaille en plus que le § 8 n'énumère pas** : `HINT` est référencé (proposal:339) et
  **jamais défini** ; `classify` est appelé (proposal:372) et **jamais défini** (seul son type de
  sortie est énuméré). C'est le travail réel de `M` (R5) ;
- les deux sites d'outil sortent bien du périmètre, et la justification est **vérifiée** :
  `auto-execute.ts:98` intercepte en `Effect.catch((err: unknown) =>` sans `provider` ni `parse`
  dans la portée, et `prompt.ts:871` n'a que `` `Tool execution failed: ${error.message}` `` —
  il faudrait faire descendre un couple `provider` + `parse` de l'appelant. L'effort `M` est donc
  correct **et** la sortie de périmètre est justifiée (R12 pour le chemin de fichier).

**Exécutions de cette revalidation (règle 7, `ORCHESTRATION-RULES.md:94-96` — « le shell n'est pas
indisponible, il est intermittent », règle 2 abrogée sur le shell, maintenue sur `git`).**

1. **Arithmétique recalculée par moi** (`bun -e`, log `p04-arith.log`, `ARITH_EXIT=0`) :
   `days=24.85513480324074` ; décomposition `24 j 20 h 31 min 23,647 s = 2147483647 ms` **exacte** ;
   `attempt 21` → `2097152000` **non plafonné** ; `attempt 22` → `4194304000` plafonné à
   `2147483647` ; `first_capped_attempt=22` ; `retry-after-ms: 999999999999` et
   `retry-after: 2147484` → `2147483647` **dès l'essai 1**. Les trois affirmations chiffrées du § 2.1
   et du § 2.2 sont **confirmées par mon propre calcul**, pas seulement par celui de l'agent.
2. **`bun test test/session/retry.test.ts`** dans `packages/opencode` → **`BUNTEST_EXIT=0`**,
   `bun test v1.4.2 (744846f84)`, **`31 pass` / `0 fail` / `41 expect() calls`**,
   `Ran 31 tests across 1 file. [11.74s]`. Le socle est **vert** : les deux tests que le patch casse
   sont aujourd'hui verts, et `:87-117` survit bien (`retry-after-ms: "0"` ⇒ `safeDelay(0)` = 1 ms,
   deux `step(error)` en `:107-108`, `attempt: 2` attendu en `:110-114`).

**P04-F3 — tranché.** Le brief annonce `FAIL` ; le fichier sur disque dit autre chose. J'ai lu
`P04-verdict.md:15` : le statut est **`PASS_WITH_CHANGES`**. Le brief est **en erreur**, le
faisable est le document. La révision elle-même signale l'écart en tête (proposal:10-13) et § 9, et
elle est sans effet : les 3 MAJEURES et les 7 Required changes sont identiques dans les deux
lectures, et c'est ce contenu-là que j'ai revalidé.

## Remaining objections

**R1 — `open` — Required change 1, volet « exception nommée » : `RETRY_QUOTA_MAX_DELAY` n'est câblée à
aucune sortie de `delay()`, et § 4.1 contredit § 4.3.** `RETRY_QUOTA_MAX_DELAY = 86_400_000`
(= 24 h, arithmétique exacte vérifiée) est déclarée en § 4.1 et **référencée nulle part ailleurs
comme plafond effectif**. § 4.1 assigne les plafonds **par branche** : « Les quatre chemins à
en-tête exploitable (`:50`, `:59`, `:64`) et la branche non bornée `:68` passent
`RETRY_AFTER_MAX_DELAY` ; `:72` garde `RETRY_MAX_DELAY_NO_HEADERS` et **reste inchangé** ». Aucun
§ n'assigne `RETRY_QUOTA_MAX_DELAY` à une ligne. Or un quota est une `APIError`
(`retryable()` : `:78` ouvre le bloc `APIError`, `:83` et `:96` sont à l'intérieur ; § 2.6 le
constate), donc `policy()` `:196` la passe à `delay()` et elle sort par `:59` — plafond
`RETRY_AFTER_MAX_DELAY` = 300 000 ms selon § 4.1. Si aucun en-tête n'est exploitable, elle sort par
`:72` — 30 s, « inchangé ». Dans les deux cas la constante de quota est **morte**. Conséquence :
`retry-after: 21600` ⇒ 300 000 ms, `attemptsSpent` = 1, `Cause.fail` ⇒ **la régression de
l'objection 1 est reproduite par le patch censé la corriger**. § 4.3 affirme l'inverse
(« `retry-after: 21600` ⇒ `wait = 21 600 000 ms` sous `RETRY_QUOTA_MAX_DELAY` »), § 4.4 la reprend en
tableau : c'est une **contradiction interne**, et la lecture § 4.1 est celle qui spécifie le code.
Ajout : le brief localise la constante en `retry.ts:302` — **`:302` n'existe nulle part** dans la
proposition (seule la ligne-document 302 porte `export const RETRY_QUOTA_MAX_DELAY`, coïncidence ;
`RETRY_MAX_DELAY` lui reste déclaré en § 4.1 alors qu'il n'a plus aucun plafond à porter).
*Correctif attendu* : faire dépendre le plafond de la **cause** et non de la branche — les quatre
chemins à en-tête doivent prendre `quota ? RETRY_QUOTA_MAX_DELAY : RETRY_AFTER_MAX_DELAY`, et `:72`
idem. Le plafond devient alors par classe, ce qui est l'intention déclarée.

**R2 — `open` — Required change 1, volet « heure de reset » : la conservation est conditionnelle, pas
garantie.** § 4.2 énonce la conservation **sans condition** (« l'heure de reset […] **survit** dans le
message terminal »). Or elle ne survit que si `retry.action` existe. Le repli `retry.ts:129` —
`return { message: error.data.message.includes("Overloaded") ? … : error.data.message` — est atteint
par **toute** `APIError` quota qui ne contient pas les corps magiques (`FreeUsageLimitError`,
`GoUsageLimitError`) : un vrai 429 de quota, ou un 5xx de quota, tombe sur `:129`, qui ne renvoie
**aucun `action`**. La cause y vaut alors `transient_other`, le plafond de quota ne s'applique pas
(300 000 ms), `Cause.fail` à `attemptsSpent = 1`, et le détail retombe sur `input.retry?.message` —
la chaîne fournisseur seule. Le modèle reçoit donc « quota épuisé » **sans heure de levée**, pour
un quota qui aujourd'hui attend 6 h et aboutit. La règle du § 4.2 est donc vraie dans un cas
particulier et fausse en général, et Required change 1 exige la conservation, pas sa possibilité.

**R3 — `open` — Required change 1, volet « test non-amorçant » : le test 4 est une boucle non bornée
et pend.** § 7.4 : « On appelle `step(429)` en boucle jusqu'à `Cause.done`/`Cause.fail` et on
**compte** les appels `set` ». Aucun plafond d'itérations n'est donné, et § 7.4 reconnaît
lui-même le problème — « Ce test échoue dans le monde d'aujourd'hui (boucle infinie) » — en le
présentant comme une qualité (« il distingue les deux mondes »). En réalité `retryable()` accepte
ce 429 aujourd'hui (`retry.ts:82` : `apiError()` force `isRetryable: true`, donc le garde de
retryabilité laisse passer), donc la boucle **ne se termine pas** : le test *pend* au lieu d'*échouer*.
Un test qui pend ne discrimine rien, il bloque la suite. *Correctif attendu* :
`for (let i = 0; i < 12; i++)`, puis `expect(calls).toBe(10)` et `expect(done).toBe(true)`.

**R4 — `open` — le chemin terminal supprime `retry.action` et n'émet plus aucun statut pour le quota.**
§ 4.3 remplace la sortie par `Cause.fail(describeFailure({ provider: opts.provider, cause, retry }))`,
et `describeFailure` renvoie `{ message, cause }` — **pas d'`action`**. Or pour le quota,
`attemptsSpent >= 1` déclenche `Cause.fail` **avant** tout `opts.set(...)` : le canal qui porte
aujourd'hui `action.reason`, `action.title`, `action.label`, `action.link` vers l'UI
(`retry.ts:223-228` → `processor.ts:1020-1026`, relu) **n'est jamais émis pour un quota**, alors
qu'il l'est à chaque essai aujourd'hui. Le § 6 ne mentionne pas cette perte. Elle est réelle :
le « quota épuisé » reste dans le message, mais la fiche actionnable (titre, bouton, lien) disparaît.
*Correctif attendu* : appeler `opts.set({ attempt: meta.attempt, message: retry.message, action:
retry.action, next: now + wait })` juste avant `Cause.fail` (une ligne), ou déclarer § 6 que la fiche
de quota est volontairement abandonnée.

**R5 — `open` — le § 4.2 ne compile pas : `HINT`, `classify` et le numérateur `n` n'existent nulle
part.** L'extrait `proposal:321-345` référence `HINT[input.cause]` (`:339`) sans jamais définir `HINT`
— seulement un commentaire de prose ; le § 4.3 appelle `classify(retry, error)` (`:372`) sans jamais
définir `classify` — seul le **type** de sortie est énuméré ; et le template `:341` interpole
`` `attempt ${n}/${attempts}` `` où **`n` n'est jamais déclaré**. C'est précisément le numérateur
qui porte toute la propriété de l'objection 2 : sans lui, « `attempt 10/10` vrai par construction »
n'est **pas énoncée**. C-46 établissant `bun typecheck` ⇒ `TYPECHECK_EXIT=0`, ce point est
vérifiable et devrait l'avoir été. *Correctif attendu* : `const n = attemptsSpent`, la table `HINT`
(9 entrées), et `function classify(retry: Retryable, error: Err): FailureCause` avec sa table.

**R6 — `open` — contradiction interne : § 4.6 dit que `retryable()` n'est pas réécrit, § 8 s'appuie sur
le fait contraire.** § 4.6 : « **`retryable()` `:78-158` : aucune de ses formes n'est réécrite ; P04
ne fait qu'**observer** sa sortie pour la classer** ». § 8 : « c'est le fait que **`delay()` doit
apprendre la cause** (signature `delay(attempt, error, cause)` […] donc **`retryable()` doit exposer
la cause`** ». Les deux ne peuvent pas être vrais : `delay()` ne peut recevoir que ce que
`retryable()`/`classify()` a produit, donc `retryable()` doit exposer la cause. La règle
« non négociable » n° 3 du § 4.2 (« ensemble fermé sur les formes que le code produit déjà ») en
dépend aussi. Et § 4.6 « aucun changement de contrat d'événement » ne tient que si le champ ajouté à
`Retryable` (`:13-23`) est **optionnel et additif** — sinon `processor.ts:1012-1014` et le statut
affiché changent.

**R7 — `accepted` — sept sites `delay()` supplémentaires ne sont pas listés.** Comptage exact
(`Select-String` sur `retry.test.ts`, 10 occurrences, lignes 36/42/47/53/60/65/71/76/79/84) : sous
`delay(attempt, error, cause)`, les sept sites `:36`, `:42`, `:47`, `:53`, `:60`, `:65`, `:71`
cassent au typecheck. Le § 6 n'en nomme que deux (`:79` et `:84`). Réserve assumée et tracée par le
nouveau fichier de test du § 7, mais la liste de migration est incomplète → `accepted`.

**R8 — `accepted` — `classify()` doit exposer un discriminant sur `Retryable`.** `Retryable`
(`retry.ts:13-23`) est consommé pour la charge utile UI par `processor.ts:1012-1014`. Le § 4.6
promet « aucun changement de contrat d'événement », vrai uniquement pour un champ optionnel
additif. Réserve assumée (additif) mais non écrite → `accepted`.

**R9 — `refused` — P04-F5 : le caractère « `INFERE` sans méthode de vérification » est faux.** Le § 2.10
fournit une **méthode** : « **Comment le vérifier :** `read` de
`packages/core/src/launch-retry.ts:23-77` et du point d'appel de `isTransientLaunchFailure` », et il
borne lui-même l'impact : « Tant que ce lien n'est pas relu, `launch_denied` est une **cause
possible sans importance** : le § 7 la teste par `policy()` directement, ce qui est valide quoi qu'il
arrive du lien réel. » Un `INFERE` **avec** méthode n'est pas un `INFERE` sans méthode. Le lien reste
non exécuté, donc `launch_denied` est une cause à existence non prouvée : c'est un **résidu
`accepted`** (impact de conception nul, la cause est testée directement), pas un `open`.

**R10 — `refused` — P04-F3 : le statut du brief est faux.** `P04-verdict.md:15` = `PASS_WITH_CHANGES`,
lu. Le brief annonce `FAIL` : l'objection est **démontrée fausse**. Sans effet sur le résultat, la
révision signalant l'écart elle-même et le contenu opératoire (3 MAJEURES, 7 Required changes) ayant
été revalidé tel quel.

**R11 — `accepted` — P04-F2 : l'absence de mesure n'est pas une excuse, mais le substitut est
incomplet.** Sur le **volet « mesurer »** : il faut des appels réels à des fournisseurs réels en quota
épuise pour observer un `Retry-After` de fenêtre longue ; ce n'est pas reproductible en CI, et le
verdict lui-même prévoit l'alternative (« ou exceptionner nommément »). Le dépôt ne contient aucun
fixture de réponse fournisseur exploitable — `apiError()` (`retry.test.ts:19-27`) prend les en-têtes
**à la main** — donc aucune mesure de distribution n'est possible non plus. Ce n'est donc pas un
blocage d'outillage : la règle 7 m'autorisait le shell, et je l'ai utilisé avec succès dans cette
session. Le résidu qui subsiste ne porte pas sur la mesure mais sur le **substitut** — c'est-à-dire
R1. Classé `accepted` pour la mesure (justifiée et non exigible), le défaut restant est porté par R1.

**R12 — `accepted` — chemin de fichier faux pour `auto-execute.ts`.** Le fichier est
`packages/opencode/src/session/auto-execute.ts` — **pas** `src/tool/` ; ni le verdict ni la
proposition ne donnent de chemin (ils écrivent `auto-execute.ts:98-99`), et mon premier réflexe a
été `src/tool/`, qui n'existe pas. Le contenu est exact : `:98` `Effect.catch((err: unknown) =>`,
`:99` `` Effect.succeed({ error: `Tool execution failed: ${err}` }) ``, `:100` `),`. Le § 4.5 est donc
juste sur le fond ; seul le chemin manque, ce qui rend sa « preuve » inutilisable telle quelle.

**R13 — `accepted` — off-by-one et texte corrompu.** § 4.1 écrit « Les **quatre** chemins à en-tête
exploitable (`:50`, `:59`, `:64`) » et en liste **trois** — exactement l'erreur d'énumération que RC5
demandait de corriger en § 2.2, réintroduite ailleurs. § 7.8 dit encore « Les **six… huit** classes »
(proposal:517), résidu visible de la correction C-16. Fragments corrompus : `sansfassement`
(:264), `ne peut_plus` (:389), « un quota journalier est légitime et**IW** temporary » (:455),
`(§ 10,.Required change 1)` (:486). Cosmétique, fond intact.

**R14 — `closed` — P04-F1 confirmé par moi, C-42 exact.** `packages/core/src/launch-retry.ts:8-10`
contient **trois** regex : `:8` `const transientLaunch = /EPERM|EACCES|EBUSY|operation not permitted|uv_spawn|Access is denied|Accès refusé|error launching/i` → **huit** alternatives ; `:9` `const transientTag = /^(PermissionDenied|Busy)$/` ;
`:10` `const transientCode = /^(EPERM|EACCES|EBUSY)$/`. Le fichier est dans **`packages/core/src/`**, pas
`packages/opencode/src/session/`. C-16 est donc **abrogée** : elle en compte six et omet
`Accès refusé` et `error launching`. `retry.ts:8` vaut bien
`export type Err = ReturnType<NamedError["toObject"]>` (§ 2.8 exact). Le § 2.8 de la révision est
correct et **plus fort** que C-16 ; le test négatif du § 7.8 est la bonne contre-mesure.

**R15 — `closed` — P04-F4 : commande exécutée.** `bun test test/session/retry.test.ts` dans
`packages/opencode` ⇒ **`BUNTEST_EXIT=0`**, `bun test v1.4.2 (744846f84)`, `31 pass`, `0 fail`,
`41 expect() calls`, `Ran 31 tests across 1 file. [11.74s]`. La forme `cmd /d /c` conseillée par le
verdict (`:24`) est donc validée, et la réserve du verdict sur l'environnement (`bun test v1.3.14` en
échec récurrent) ne se vérifie plus : `bun` est **1.4.2** et la suite est verte. Réserve : la seconde
moitié de la commande du § 7 (`test\session\retry-bounds.test.ts`) **n'existe pas encore** — elle
sera à créer — donc la commande du § 7 n'est prouvée que pour sa moitié existante.

**Citations conservées — relevé.** Vérifiées une à une : `retry.ts:25-29`, `:31-33`, `:35-40`,
`:42-73` (les cinq sorties `:50`, `:59`, `:64`, `:68`, `:72`), `:72` borné à 30 s, `:78-82`, `:83`/`:87`,
`:96-100`, `:101-112` dont `:104` `Math.floor(seconds / 86_400)`, `:114` (message de reset),
`:117-127` dont `:120`/`:123`/`:125`, `:129`, `:132-143`/`:141`, `:145-158`/`:150`/`:153`/`:156`/`:158`,
`:183-233` (`:184` `provider`, `:187` `parse`, `:190`, `:192`, `:193`, `:194`, `:196`, `:197`,
`:211-222`, `:223-228`, `:229`), `processor.ts:934-936`, `:945-955`, `:976`, `:978-982`,
`:1001-1031`, `:1020-1026`, `:1032`, `prompt.ts:871`, `auto-execute.ts:98-100`,
`launch-retry.ts:8`/`:9`/`:10`/`:12`, `retry.test.ts:17`, `:19-27`, `:33`, `:74-80`, `:82-85`,
`:87-117`, `:91`, `:107-108`, `:110-114`. **Une seule citation fausse : `:302`, apportée par le
brief et absente du document** (R1). Aucune des citations conservées par la révision n'est fausse.

## Regressions introduced

**Je ne peux pas déclarer qu'aucun test vert n'est cassé : deux tests verts le sont, par design.**

1. **`retry.test.ts:79`** — `expect(SessionRetry.delay(1, longError)).toBe(700000)` avec
   `retry-after-ms: "700000"` ; le plafond à 300 000 ms le rend **rouge** (attendu 300 000). Vert
   aujourd'hui (mesuré : `31 pass / 0 fail`).
2. **`retry.test.ts:84`** — `expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_MAX_DELAY)`
   ; le même plafond le rend **rouge**. Vert aujourd'hui (idem).
3. **`retry.test.ts:36`, `:42`, `:47`, `:53`, `:60`, `:65`, `:71`** — **non déclaré** par le § 6 :
   les sept autres appels à deux arguments de `delay()` cassent au typecheck dès que la signature
   devient `delay(attempt, error, cause)` (R7).
4. **Régression de comportement, non déclarée** : pour un quota, `Cause.fail` à `attemptsSpent = 1`
   précède tout `opts.set`, donc plus aucun statut `{ type: "retry", action }` n'est publié et la
   fiche actionnable disparaît (R4).
5. **Régression fonctionnelle déjà signalée, mais reconduite** : la borne de compte + plafond par
   branche fait échouer un quota légitime de 6 h en 5 min (R1) — c'est l'objection 1 reproduite par le
   correctif.

Les points 1 et 2 sont **correctement déclarés** au § 6 avec la consigne de réécriture (et non
d'ajuster par seuil, conformément à C-15) : ils ne sont pas un blocage en soi, ils sont le coût
annoncé du changement de politique. Les points 3 et 4 sont **non déclarés**.

## Final verdict

`REVALIDATED-FAIL`

Un seul Required change reste **intact** : **RC1**, sur trois de ses quatre volets — l'exception
nommée n'est pas câblée et se contredit d'un paragraphe à l'autre (R1), la conservation de l'heure de
reset est conditionnelle et présentée comme inconditionnelle (R2), le test non-amorçant pend au lieu
d'échouer (R3). RC2 à RC7 sont complets quant au fond ; RC7 est désormais complet **et vérifié par
exécution** (R15). Auxquels s'ajoutent quatre `open` non issus du verdict d'origine : le canal
`action` perdu sur le chemin quota (R4), le § 4.2 non compilable et le numérateur du compteur non
déclaré (R5), la contradiction `retryable()` réécrit / non réécrit (R6). Six `open` au total : par la
règle d'implémentabilité, **P04 n'est pas implémentable en l'état**. `P04-F5` et `P04-F3` sont
**refusés** (caractères faux, avec preuve) ; `P04-F1` et `P04-F4` sont **clos** ; `P04-F2` est un
volet justifié mais dont le substitif est incomplet (le défaut est porté par R1).

Ce n'est pas un « PASS_WITH_CHANGES » déguisé : l'objection majeure 1 n'est pas soldée, et
la régression qu'elle décrivait — un quota légitime qui aboutit devient un échec — est celle que le
patch reproduit. Correctif de sortie : **R5, R6, R1, R2, R4, R3** (dans cet ordre), puis relecture.

## Grille d'effort pour la vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| 1. Définir `HINT`, `classify()`, `n = attemptsSpent` (R5) | M | `packages/opencode/src/session/retry.ts` (nouveau bloc) | `test/session/retry-bounds.test.ts` cas 8 | `aucun` — mais `bun typecheck` doit rester `TYPECHECK_EXIT=0` |
| 2. Faire porter le plafond par la **cause** dans `delay()` (R1) | S | `packages/opencode/src/session/retry.ts:42-73`, `:35-40` | `retry-bounds.test.ts` cas 1, 2, 3 (quota 6 h ⇒ `21_600_000`) | `aucun` (nouveau fichier) |
| 3. Exposer la cause depuis `retryable()`/`classify()`, réconcilier § 4.6 (R6) | M | `retry.ts:13-23`, `:75-159` | cas dans `retry.test.ts` `describe("session.retry.retryable")` | relire `retry.test.ts:121-421` |
| 4. Garantir l'heure de reset sur **toute** forme quota (R2) | S | `retry.ts:83-129` | `retry-bounds.test.ts` cas 6 bis (quota sans en-tête ⇒ message contient `It will reset in`) | `aucun` |
| 5. Rétablir `set` + `action` avant `Cause.fail` sur le quota (R4) | S | `retry.ts:223-228` + `:183-233` | `retry-bounds.test.ts` cas 3 ter (`set` appelé, `action.link` présent) | **`retry.test.ts:87-117`** (attend `attempt: 2` — à relire avant patch) |
| 6. Borner la boucle du test de compte (R3) | S | `test/session/retry-bounds.test.ts` cas 4 | le test lui-même : `for (i < 12)`, `calls === 10`, `done === true` | `aucun` |
| 7. Réécrire les deux tests rouges (déclaré § 6) | S | `packages/opencode/test/session/retry.test.ts:74-85` | — | **`retry.test.ts:79` et `:84`** (verts, cassés par design) |
| 8. Migrer les 7 sites `delay()` restants (R7) | S | `test/session/retry.test.ts:36,42,47,53,60,65,71` | aucun | ces 7 lignes (vertes aujourd'hui) |
| 9. `provider` + `parse` aux deux sites d'outil (hors périmètre P04) | L | `packages/opencode/src/session/auto-execute.ts:98-100`, `packages/opencode/src/session/prompt.ts:871` | hors périmètre | hors périmètre — proposition séparée (P04-bis) |