# P08 — Revalidation après re-scope (indépendant)

Re-scope sujet : `docs/harness-audit/proposals/P08-retention-default.md` (489 lignes).
Verdict d'origine : `docs/harness-audit/verdicts/P08-verdict.md` (`PASS_WITH_CHANGES`, 6 Required changes).
Arbitrage opposable : **A-1**, `docs/harness-audit/REVALIDATION-STATUS.md:75`.

> Je n'ai rédigé ni la proposition, ni son verdict, ni le re-scope. Je n'ai modifié aucun fichier
> sous `packages/**`, je n'ai exécuté aucune commande `git`, et je n'ai pas édité la proposition (C-36).

## Proposal

Ce que la proposition **prend maintenant pour périmètre**, annoncé dans son titre même
(`P08-retention-default.md:1`) :

> `# P08 — Census en lecture seule de la croissance de `opencode.db` (aucune purge par défaut)`

et sa bannière de re-scope (`:3`) :

> `Re-scope après verdict PASS_WITH_CHANGES et arbitrage A-1 — purge par défaut abandonnée, census read-only seul, effort L retiré`

Le mécanisme est un census SQL en lecture seule (`census()`, `:237-251`) câblé **hors** de
`maintain()` et **hors** de `schedule()` (`:259-269`), plus une fonction d'avertissement
`logRetentionOff()` (`:262-266`). Effort déclaré `S` (`:454-458`).

### A-1 est-elle respectée ?

**Oui.** A-1 tranche : « **Opt-in + census SQL read-only seul.** Aucune purge par défaut », et
« La proposition P08 se replie sur B […] Le refus de purge est désormais une décision tracée, pas
une omission ».

Trois contrôles indépendants, tous positifs :

1. **Aucune purge automatique.** La chaîne de rétention est inchangée et vérifiée ligne à ligne :
   `maintenance.ts:51` `retentionDays(env = process.env)` → `:52-53` `Number(raw)` puis
   `Number.isFinite(raw) && raw > 0`, donc `undefined` sans variable. `maintenance.ts:101-108`
   `maintain()` ne purge que si `days !== undefined`. `maintenance.ts:176-184` `schedule()` appelle
   `maintain(db, purge ? process.env : {})`. Aucun code n'injecte de `OPENCODE_PART_RETENTION_DAYS`.
   La purge automatique est donc réellement absente, pas seulement promises.
2. **Aucun garde-fou d'effort `L`.** Le bloc `§8` (`:460-464`) ne conserve pas `L` comme
  |Referentiel : il le **refuse explicitement** — « La règle « effort `L` » n'est pas simplement
   révisée à la baisse : **elle est retirée avec la purge automatique**, qui en était le seul
   motif. » La ligne d'effort unique du document est `S` (`:456`).
3. **Aucune trace de R1 en annexe.** Une recherche exhaustive des marqueurs `R1|Voie A|annexe|Annexe|
   effort L` sur les 489 lignes ne remonte que dix occurrences, dont aucune survivance de la voie A :
   les titres `:1` et `:3`, la justification de rejet « toute purge par défaut est un pari sans
   contrepartie » `:140`, la ligne 419 qui est le commentaire `// purge:true, env par défaut` du
   **nouveau** test, la ligne 436 (« 24 correspondances »), le bloc de refus `§8` `:460-463`, et les
   deux lignes du tableau `§9` `:474` et `:479` qui annoncent l'absence de purge par défaut. **Il n'y
   a pas d'annexe.** A-1 est respectée.

## Revisions applied

Les 6 Required changes du verdict, point par point, avec la preuve du traitement :

| # | Required change | Traitement vérifié |
|---|---|---|
| 1 | Abandonner le défaut à 90 jours | **Fait.** `:22-33` (E1) et `:35-42` (E2) citent `maintenance.ts:50-54` et `:101-108`, que j'ai relus : conformes au caractère littéral. `:1`, `:3`, `:474`, `:479` annoncent l'absence de purge par défaut. |
| 2 | Corriger le chemin `exec` de R2a | **Traité par suppression.** R2a (boucle par lots) n'est pas proposé ; `purgeOldParts` (`maintenance.ts:65-72`) reste inchangé et n'est atteignable qu'en opt-in sur la seule base principale. |
| 3 | Ajouter `maintenance.test.ts:69-71` à la régression | **Traité par suppression, et signalé.** `:447-452` explique que le risque disparaît car `purgeOldParts` conserve son type de retour. `:70` garde bien `toBe(false)` : vérifié, `maintenance.ts:65` déclare toujours `boolean`. Le document signale lui-même « un écart avec le décompte initial, signalé ici plutôt que masqué » `:452`. |
| 4 | Établir ou corriger le coût annoncé de R2a | **Traité par suppression.** Le census est borné en `time_created` (`:242`) et s'appuie donc sur l'index. Aucune durée publiée. |
| 5 | Passer `M` à `L`, isoler R3 | **Fait, avec inversion assumée.** R3 retiré (`:5.4`), effort descendu à `S`, `L` explicitement retiré `:460-464`. C'est l'inversion que A-1 a ordonnée. |
| 6 | Annoncer le périmètre réel dans le titre et le résumé | **Fait.** Le titre et la bannière `:3`, plus `:5-8` (« la base continuera de croître, y compris sur ses parts `reasoning` »). |

### La chaîne « le census n'écrit rien », ligne à ligne

L'affirmation centrale de l'agent est **juste quant au câblage, et fausse quant à
l'exécutabilité**.

- **Le `checkpoint()` écrit bien.** `maintenance.ts:44-48` : `checkpoint()` exécute
  `PRAGMA wal_checkpoint(TRUNCATE)` et `:107` `maintain()` l'appelle **inconditionnellement**.
  Toute fonction câblée sur ce chemin écrivrait donc. Le constat de l'agent est juste.
- **Le census est bien hors de ce chemin.** `:259-269` le place hors de `maintain()` et de
  `schedule()`, dont les corps relus (`:101-108`, `:176-184`) n'appellent que `purgeOldParts` et
  `checkpoint`. Aucun `census()` dans ces corps. **Vérifié.**
- **Les deux requêtes du census sont bien des `SELECT`** (`:241-243`, `:247-248`), et une
  troisième assertion `every(q => /^SELECT/i.test(q.trim()))` est présente `:377`, avec refus de
  `DELETE|UPDATE|INSERT|VACUUM` `:375` et refus de `PRAGMA` hors `page_count`/`page_size` `:376`.
  **Le test exécutable exigé existe et est correct.**

Mais la seconde requête **ne se prépare pas sur une base réelle** :

```sql
-- propositions/P08-retention-default.md:248
(SELECT page_count - freelist_count FROM pragma_page_count) * (SELECT page_size FROM pragma_page_size) AS free
```

Mesuré sur la base réelle, `sqlite3 -readonly`, `EXIT=1` :

```
$ sqlite3 -readonly $db "SELECT 'PGC_COLS=' || group_concat(name) FROM pragma_table_info('pragma_page_count');
                         SELECT 'FREELIST=' || (SELECT freelist_count FROM pragma_freelist_count);"
PGC_COLS=page_count
FREELIST=46
EXIT=0

$ sqlite3 -readonly $db "SELECT 'FREELIST=' || (SELECT page_count-freelist_count FROM pragma_page_count);"
Error: in prepare, no such column: freelist_count
  SELECT 'FREELIST=' || (SELECT page_count-freelist_count FROM pragma_page_count
                             error here ---^
EXIT=1
```

`pragma_page_count` n'expose **qu'une seule colonne**, `page_count`. `freelist_count` vit dans la
fonction table distincte `pragma_freelist_count`, qui répond `46`. La forme correcte est donc
`(SELECT page_count FROM pragma_page_count) - (SELECT freelist_count FROM pragma_freelist_count)`.

Conséquence : **le census échoue à se préparer sur toute base réelle**, donc `census()` lève sur le
chemin nominal. Le titre dit « read-only » et il l'est ; il ne fonctionne pas. C'est le défaut
majeur de cette revalidation. Noter que la méthode de mesure de `P08-VACUUM-COUT-NON-MESURE`
(`:196-197`) utilise, elle, la forme **correcte** `page_count * page_size` : l'incohérence est
interne au document.

## Status

| Objet | Statut | Preuve |
|---|---|---|
| A-1 respectée | **confirmé** | `maintenance.ts:51-53`, `:101-108`, `:176-184` relus ; 10 marqueurs R1/Voie A, aucune annexe |
| Census hors `maintain()`/`schedule()` | **confirmé** | `:259-269` ; corps de `maintain`/`schedule` relus, aucun appel `census()` |
| `checkpoint()` écrit (`wal_checkpoint(TRUNCATE)`) | **confirmé** | `maintenance.ts:44-48`, `:107` |
| Test exécutable « n'écrit rien » présent | **confirmé** | `:375-377` |
| SQL du census exécutable | **RÉFUTÉ** | `EXIT=1`, `no such column: freelist_count` |
| Fichier de test au chemin réel | **confirmé** | `packages/opencode/src/storage/maintenance.test.ts`, 246 lignes ; `:139-147` relu et identique à l'état « actuel » cité `:396-404` |
| Dossier `test/storage/` pour le nouveau test | **confirmé** | existe : `db.test.ts`, `storage.test.ts`, `db-migrations.test.ts`, `json-migration.test.ts`, `workspace-time-migration.test.ts` |
| Commandes de test §7 | **confirmées** | `packages/opencode/package.json:10` = `"test": "bun test --timeout 30000"` ; `package.json:25` racine = `"test": "echo 'do not run tests from root' && exit 1"` — les deux cités correctement |
| Chiffres E13 | **re-mesurés** |voir ci-dessous |

### E13 — re-mesuré, le shell étant autorisé (règle 7 d'`ORCHESTRATION-RULES.md`)

L'objection `P08-E13-NOT-REMEASURED` (« faute d'accès shell ») reposait sur une interdiction
levée. Elle est donc re-mesurée, et **ses quatre chiffres sont caducs**.

Base réelle : `C:\Users\jeanl\.local\share\opencode\opencode.db`, `sqlite3 -readonly`, `EXIT=0`.

| grandeur | mesuré | dans la proposition |
|---|---|---|
| taille du fichier | **3 900,1 Mo** (`-wal` 3,9 Mo) ; `page_count=998429`, `page_size=4096` | « 5 209 Mo » (état du dossier) — **non reproductible aujourd'hui** |
| parts, total | **672 804** parts | non chiffré |
| caractères, total | **3 475 615 849** | non chiffré |
| `tool` | 190 947 parts / **2 953 691 159 car.** (85,0 %) | — |
| `reasoning` | 108 702 parts / **265 175 764 car.** (7,6 %) | — |
| `freelist` | **46 pages = 188 416 octets** (0,005 % du fichier) | — |

Contrôle de cohérence : la somme des lignes par type vaut exactement `672 804`, et la somme des
caractères par type vaut exactement `3 475 615 849`.

Le chiffre le plus contestable, « 3 045 134 caractères = **50 % d'une session** » (`:484-485`), est
**non reproductible**. Session la plus lourde en `reasoning` aujourd'hui,
`ses_106da869affe6n5CLpUQUcAyj4` : `reasoning` = **6 410 314 car.** sur 1 728 parts, pour
**30 251 627 car.** de parts au total sur cette session, soit **21,2 %**, et non 50 %. Sur
l'ensemble : `reasoning` pèse 7,6 % de la base, `tool` 85,0 %.

La tendance, elle, est confirmée et plus marquée que le chiffreannounced : `NSESS=2352`, et les
**1 000 sessions les plus récentes** concentrent **1 988 649 418 caractères**, soit **57 %** de la
base dans 42 % des sessions.

## Remaining objections

Chaque objection porte son statut en tête de ligne, conformément à la règle d'implémentabilité.

- **`open` — `P08-CENSUS-SQL-FREELIST-INVALIDE`.** `:248` utilise `freelist_count` à l'intérieur de
  `pragma_page_count`, qui n'a qu'une colonne. Mesuré : `PGC_COLS=page_count`, puis
  `Error: in prepare, no such column: freelist_count`, `EXIT=1`. Le census ne s'exécute donc sur
  aucune base réelle, et le titre annonce une fonctionnalité qui lève. Correctif d'une ligne :
  `(SELECT page_count FROM pragma_page_count) - (SELECT freelist_count FROM pragma_freelist_count)`.
  **Bloquant.** Le test §7 ne l'attrape pas : le point 4 de §7 ne couvre qu'un handle qui lève, et un spy ne
  valide pas le SQL contre un schéma réel.
- **`open` — `P08-REECRITURE-DEPENDE-ENV-AMBIANT`.** Le test réécrit `:419` appelle
  `schedule(db, { intervalMs: 5 })` sans `purge`, donc `maintenance.ts:184` transmet `process.env`.
  Le garde-fou « rien n'est supprimé sans `OPENCODE_PART_RETENTION_DAYS` » tient donc sur
  l'absence de la variable **dans l'environnement de la machine**, non sur une assertion portant sur
  `{}`. Les tests voisins (`:85`, `:98`, `:100`, `:101`, `:107`) passent un env explicite ; le
  nouveau test, seul, dépend de l'ambiant. Sur une machine où la variable est posée, le test rouge
  pour une raison extérieure à la politique. Correctif : passer un env vide explicite.
- **`open` — `P08-E13-CHIFFRE-50POURCENT-NON-REPRODUIBLE`.** `:484-485` publie « 3 045 134
  caractères = 50 % d'une session » en `residual` `assumé`. Mesuré : 6 410 314 caractères de `reasoning`,
  soit **21,2 %** de la session la plus lourde du jour, et 7,6 % de la base. La mention « non
  re-mesurée ici » `:485` est honnête, mais un chiffre faux publié reste un chiffre faux : il est
  maintenant mesurable, donc remplaçable par une phrase. **Bloquant au sens de la règle 3.**
- **`accepted` — `P08-TESTS-EXISTANTS-A-REECRIRE`.** Le chemin réel est bien
  `packages/opencode/src/storage/maintenance.test.ts` (246 lignes), **pas** `test/` (C-40 respecté).
  `:139-147` est relu et **identique au caractère près** à l'« état actuel » cité `:396-404` : même
  titre, même `purge: false`, mêmes deux assertions. La réécriture proposée `:416-432` est
  structurellement saine : elle couvre le **chemin par défaut** (là où l'ancien ne couvrait que
  `purge: false` des bases secondaires), interdit `DELETE` **et** `VACUUM`, et **conserve** la
  garantie secondaire existante. Elle ne casse aucun autre cas du fichier : l'inventaire de `:435-445`
  recense 24 correspondances et les 23 autres sont classées `inchangé`, et ma relecture du fichier
  confirme qu'aucun autre cas n'encode de purge par défaut. **Réserve assumée** : la dépendance à
  l'environnement ci-dessus, qui n'est pas traitée.
- **`out_of_scope` — `P08-VACUUM-COUT-NON-MESURE`.** **Approuvé, sans réserve.** `:186-191` ne
  « reformule » pas les chiffres : il les **supprime** du raisonnement, ce qui est exactement la
  bonne pratique — un chiffre déduit qui ressemble à une mesure oriente vers un budget faux. Les
  trois étapes de mesure sont complètes et exécutables (`:195-197`) : (a) chronométrer `VACUUM` sur
  une **copie**, (b) lire la taille avant/après, (c) publier durée **et** taille avec base et
  matériel. La ligne « aucune de ces trois étapes n'a été faite ici » `:198` est exacte. La voie B
  n'exécute ni `VACUUM` ni purge, donc ces durées n'entrent dans aucune décision de ce document.
  **Justification écrite** : conforme à `out_of_scope`. J'ajoute que la mesure est aujourd'hui
  sans objet : `freelist = 46 pages` sur 3 900 Mo, soit 188 416 octets récupérables — un `VACUUM`
  n'aurait rien à rendre ici.
- **`out_of_scope` — `P08-R2B-REASONING-NON-BORNE`.** Classé `out_of_scope`, **et non `open`**,
  conformément à A-1 qui décide explicitement de ne pas borner cette croissance. La section `:483-486`
  le présente correctement comme `residual` **assumé** et non corrigé — « le census la mesure, ne la
  corrige pas » `:485` — et ne prétend à aucun remède. C'est bien un `out_of_scope` et non un point
  traité presented comme résolu. **Justification écrite** : la correction exigerait un seuil par
  espace disque cible **et** le filet `opencode db backup` qui manque (E10). Réserve indépendante :
  le chiffre publié est faux (voir ci-dessus), ce qui n'en fait pas un point `open` de cadrage.
- **`refused` — `P08-E13-NOT-REMEASURED`.** L'objection est fondée sur « pas d'accès shell ». Le
  shell est autorisé (règle 7 d'`ORCHESTRATION-RULES.md`) et **fonctionne** : `sqlite3 -readonly`,
  `EXIT=0`, quatre chiffres obtenus. Le **`grep` ne souffre d'aucun EPERM** sur cette machine — il a
  rendu ses résultats du premier coup (23 correspondances sur `maintenance.test.ts`, 10 sur la
  proposition, 5 sur `maintenance.ts`). La prémisse de l'objection est donc démontrée fausse, avec
  preuve ; elle est **refusée**. Les valeurs mesurées sont consignées plus haut.

## Regressions introduced

**Aucun test vert n'est cassé.**

- Le nouveau `packages/opencode/test/storage/census.test.ts` est un fichier **créé**, dans un dossier
  qui existe déjà. Il ne peut casser aucun test existant.
- La réécriture de `maintenance.test.ts:139-147` est confinée à un bloc `test()`. Les 23 autres cas
  du fichier sont inchangés, et aucun n'encode de purge par défaut : la réécriture ne modifie ni
  `maintenance.ts`, ni une signature, ni un timer. `purgeOldParts` conserve son type `boolean`
  (`maintenance.ts:65`), donc `maintenance.test.ts:70` reste vert sans retouche.
- Une réserve d'hygiène, déjà comptée comme `open` ci-dessus : le test réécrit dépend de
  `process.env`. Ce n'est pas une régression d'un test vert vers rouge dans l'environnement de
  référence, mais une fragilité à corriger avant merge.

Aucun Required change n'est intact : les 6 sont traités (table `## Revisions applied`). Le
`REVALIDATED-FAIL` ci-dessous ne repose donc **pas** sur des Required changes intacts, comme le
décrit la règle 2 du gabarit, mais sur un **défaut bloquant nouveau** découvert par ce revalidateur
et sur deux autres `open` : le document ne peut pas être implémenté en l'état.

## Final verdict

`REVALIDATED-FAIL`

Non implémentable : trois résidus `open` subsistent, dont un qui empêche le census de s'exécuter sur
une base réelle. La règle 3 du gabarit est explicite — « un résidu `open` unique suffit à interdire
l'implémentation. Ne le requalifie pas en `accepted` pour débloquer » — et je ne le requalifierai
pas. Le correctif du défaut principal tient en une ligne et ne remet en cause ni A-1, ni le
re-périmètre, ni aucun des 6 Required changes : une fois cette ligne corrigée, ce document redevient
`REVALIDATED-PASS_WITH_CHANGES` sous réserve du classement des deux autres `open`, dont un est une
simple phrase à réécrire.

Ce qui est **acquis** et n'est pas remis en cause : A-1 est respectée point par point ; le census est
réellement câblé hors de tout chemin qui écrit ; le test exécutable « le census n'écrit rien » est
présent et correctement écrit ; le refus de purge est une décision tracée, pas une omission.

## Effort

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| Corriger `freelist_count` → `pragma_freelist_count` dans la requête de tailles | `S` | `packages/opencode/src/storage/maintenance.ts` | dans `census.test.ts` | aucun |
| Créer `census()` : 2 `SELECT`, `Census`, `.reduce`, aucun `PRAGMA` mutateur | `S` | `packages/opencode/src/storage/maintenance.ts` | `packages/opencode/test/storage/census.test.ts` | aucun |
| Créer la sous-commande `opencode db census` | `S` | `packages/opencode/src/storage/maintenance.ts` (point de câblage) ; chemin CLI exact **non relu**, à confirmer à l'implémentation | dans `census.test.ts` | aucun |
| Créer `logRetentionOff()`, câblé hors `maintain()` et hors `schedule()` | `S` | `packages/opencode/src/storage/maintenance.ts` | dans `census.test.ts` | aucun |
| Réécrire le garde-fou `maintenance.test.ts:139-147` (chemin **par défaut**, `DELETE` + `VACUUM`) | `S` | `packages/opencode/src/storage/maintenance.test.ts` | réécriture en place | **oui** — relire les 24 correspondances du fichier et passer un env explicite au lieu de `process.env` |
| Corriger le chiffre E13 « 3 045 134 car. = 50 % d'une session » | `S` | `docs/harness-audit/proposals/P08-retention-default.md:483-486` | aucun | aucun |
