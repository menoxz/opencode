# P08 — Rétention par défaut et bornage de la croissance de `opencode.db`

## Proposal

`P08` — Rétention par défaut et bornage de la croissance de `opencode.db`.
Fichier validé : `docs/harness-audit/proposals/P08-retention-default.md` (509 lignes).

## Validator

`validator-independent` — `independent` : ce validateur n'a pas rédigé la proposition.
Il n'a modifié aucun fichier source ; seul ce verdict est produit.

## Status

`PASS_WITH_CHANGES`

Le travail d'analyse est solide : les citations sont exactes, le mécanisme R2a/R3 est
juste, et la question de rejouabilité (point 2) est réellement sans danger technique.
Le blocage porte sur un seul point : **le défaut à 90 jours**. Il n'est pas validable
en l'état parce qu'aucun mécanisme de reprise n'existe dans le dépôt, et parce qu'il
inverse une invariant que le code lui-même documente comme interdite.

## Checks

| check | résultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok | E1 `maintenance.ts:50-54` ; E2 `:101-108` ; E3 `:183-184` ; E6 `:60-72` ; E11 `db.ts:255-259` ; E12 `db.ts:260-262` + `:298-305` ; E13 `session-scope.ts:10-14` ; E14 `message-v2.ts:1012-1015` ; E15 `maintenance.ts:33` ; E16 `:26`, `:96`, `:98` ; tests `:38-40`, `:42-46`, `:61-67`, `:75-80`, `:139-147` ; `packages/opencode/package.json:10` ; `package.json:25` — tous relus et conformes |
| le correctif supprime vraiment la cause | ok | E11 confirmée : `VACUUM|auto_vacuum|incremental_vacuum|wal_autocheckpoint` sur `packages/` → **aucun résultat**. R3 comble donc un vide réel, et `db.ts:260-262` (`checkpointOnOpen`) ne fait que recycler le WAL — **pas de doublon** (voir objection 3, levée) |
| le correctif ne casse pas un comportement existant | KO | `maintenance.test.ts:70` — `expect(StorageMaintenance.purgeOldParts(failing(), 0)).toBe(false)` casse si R2a change le type de retour `boolean → number`. Ce test est absent de la liste de régression de la §6 |
| le correctif ne casse pas un comportement existant (2) | KO | R2a sur connexion de type `exec` : `attemptValue(() => changedRows(db)) ?? 0` fait renvoyer `0` (car `exec` renvoie `undefined`), donc la boucle sort après **un seul lot de 50 000**, silencieusement. Plafond de lots inopérant sur ce chemin |
| tests proposés sont exécutables dans ce dépôt | ok | `cd packages/opencode && bun test test/storage/maintenance-retention.test.ts` — `packages/opencode/package.json:10` = `"test": "bun test --timeout 30000"` ; racine `package.json:25` = `"echo 'do not run tests from root' && exit 1`, correctement évitée |
| effort et coût annoncés réalistes | KO | `M` est sous-estimé : R2a remplace la clause `WHERE` par un `id IN (SELECT …)` qui **perd l'usage de `part_time_created_idx`** (`session.sql.ts:107`), impose deux helpers (`scalar`, `changedRows`) non définis, et R3 n'apporte **rien** à l'installation de 5 209 Mo visée (`auto_vacuum = NONE`) — voir objection 4 |
| point 2 — session purgée encore lisible et rejouable | ok | `maintenance.ts:69` ne supprime que `json_extract(data,'$.type') = 'tool'`. Le texte et le raisonnement survivent. Aucune paire `tool_use` orpheline n'est créée : `message-v2.ts:1112-1113` exige un `tool_result` pour chaque `tool_use`, **or les deux blocs vivent dans les mêmes lignes `tool`**, supprimées ensemble. Pas de 400 Anthropic |
| point 5 — politique `reasoning` distinguishable de `tool` | ok | R2b : variable distincte `OPENCODE_REASONING_RETENTION_DAYS`, **défaut off**, filtre `DELETE` distinct ; `message-v2.ts:1012-1015` confirme la présence de signatures de thinking, et `:1029`/`:1125` confirment les deux types de parts traités par le rejeu |

## Objections

### 1. KO — Le défaut à 90 jours est irréversible, sans filet, et contredit une invariant
   documentée dans le dépôt

Le module se justifie lui-même en ces termes :

`packages/opencode/src/storage/maintenance.ts:15-18`

```
 *  - `purgeOldParts` destroys history. It is opt-in through
 *    `OPENCODE_PART_RETENTION_DAYS` and never runs unless asked, because
 *    silently deleting a user's transcripts to save disk is not a trade the
 *    harness gets to make on its own.
```

R1 fait de ce « never runs unless asked » le **défaut**. Or aucune reprise n'existe :

- `grep backup|Backup|BACKUP` sur `packages/opencode/src` → 10 résultats, **tous hors
  sujet** : `tool/websearch.ts:17` (chaîne de doc « use live crawling as backup ») et
  `cli/cmd/tui/config/tui-migrate.ts:102-107`, qui sauvegarde `file + ".tui-migration.bak"`
  — un fichier de **configuration TUI**, pas la base.
- `cli/cmd/db.ts:113-120` : `DbCommand` n'expose que `QueryCommand`, `PathCommand`,
  `MigrateCommand`. **Aucun sous-commande `backup`, `compact` ni `vacuum` n'existe.**
- `session.sql.ts:90-109` : `part` n'a ni colonne d'archivage ni soft-delete ; les cascades
  partent de `message`/`session` vers `part` (`session.sql.ts:89`, `:96-97`, `:80`), donc
  rien ne peut récupérer une part supprimée.

Conséquence directe : la §6 « Rollback » de la proposition (« restauration du fichier
`opencode.db` depuis une copie », ligne 446) **suppose une copie que le dépôt ne produit
nulle part**. Le seul filet réel, reconnu par la proposition elle-même (lignes 436-438),
est `sqlite3 .recover` — exécuté à la main, hors produit.

Aggravant : l'argument E10 (`SESSION_MAX_AGE_DAYS = 7`, `session-scope.ts:11`) ne prouve
que l'absence dans la **liste latérale**, pas l'absence de données. La proposition le
concede elle-même (ligne 256) : la perte se remarque « en ouvrant une session par son
identifiant ».

Ce qui change : **adopter l'alternative de repli que la proposition propose déjà** (§9,
lignes 507-509) comme défaut de R1 — rétention **opt-in**, plus le census chiffré de R2b
et un avertissement au démarrage. Le correctif de croissance reste R2a + R3. Si
l'opérateur veut malgré tout une politique par défaut, elle doit être bornée par **espace
disponible** (`PRAGMA page_count` vs `page_count - freelist_count`, seuil en Mo) et non
par un âge, et s'armer après un `log.info` explicite, jamais par `lastPurge = 0`.

### 2. KO — Le plafonnement par lots de R2a est silencieusement inopérant sur les connexions `exec`

`maintenance.ts:33` : `type Runner = { run: (query: string) => unknown } | { exec: (query: string) => unknown }`
et `maintenance.ts:36` : `return "run" in db ? db.run(query) : db.exec(query)`.

Le code proposé lit `const rows = attemptValue(() => changedRows(db)) ?? 0` puis
`if (rows < PURGE_BATCH_ROWS) break`. Sur une connexion de type `exec`, `db.exec(...)`
renvoie `undefined` (cf. le spy de test `maintenance.test.ts:152-155`, dont `exec` renvoie
`queries.push(...)`, un nombre, pas des lignes). `attemptValue` avale l'échec
(`maintenance.ts:158-164`), `?? 0` transforme l'échec en « lot partiel », et la boucle
sort après **un seul lot** — sans journal, sans erreur. Le plafond `PURGE_MAX_BATCHES = 8`
(400 000 parts) n'est donc jamais atteint sur ce chemin, et la garantie de bornage
annoncée aux lignes 298-300 est fausse.

Ce n'est pas latent seulement si quelqu'un arme un jour `purge: true` sur une base
secondaire ; c'est aussi le défaut du test existant `maintenance.test.ts:146`, qui
n'affirme l'absence de `DELETE` que pour `purge: false`.

Ce qui change :renommer le booléen en un discriminant explicite — ne jamais confondre
« je n'ai pas pu lire `changes()` » et « le lot était partiel ». Retourner un état
triple (`done` / `more` / `unknown`) et, dans le cas `unknown`, soit stopper avec un
`log.warn`, soit continuer sans plafond claimed. Ajouter le cas `exec` au test 4 de la §7.

### 3. Le `VACUUM` n'est PAS déjà fait par `db.ts:260-262` — objection levée, la
   proposition a raison

`db.ts:260-262` est `StorageMaintenance.checkpointOnOpen(db, dbPath)`, qui recycle le
fichier `-wal` et **jamais** le fichier principal : `maintenance.ts:147-151` choisit
`PASSIVE` ou `TRUNCATE` selon `WAL_TRUNCATE_THRESHOLD_BYTES` (`maintenance.ts:123`), et
`close()` refait un `TRUNCATE` (`db.ts:302`). Aucune trace de `VACUUM` ou `auto_vacuum`
dans `packages/`. R3 n'est donc pas un travail déjà fait, et le refus argumenté de mettre
la compaction sur le timer (lignes 351-355) est la bonne décision : un `VACUUM` est bien
la seule opération SQLite qui bloque lecteurs et écrivains pendant toute sa durée.

### 4. KO — L'effort `M` est sous-estimé, et R3 ne sert pas l'installation visée

Deux raisons, toutes deux vérifiables :

- `session.sql.ts:107` : `index("part_time_created_idx").on(table.time_created)`. Le
  commentaire de `maintenance.ts:90-92` fonde justement la borne de coût sur cet index.
  Mais la forme R2a `DELETE FROM part WHERE id IN (SELECT id FROM part WHERE time_created <
  <b> AND … ORDER BY time_created LIMIT 50 000)` **ne peut plus exploiter cet index pour la
  suppression** : il passe par la clé primaire `id`. Le gain annoncé (lignes 298-300,
  « parcours d'index et non un scan ») n'est pas établi pour la requête R2a.
- R3 fait `PRAGMA incremental_vacuum(...)`, qui est un **no-op sur une base en
  `auto_vacuum = NONE`** — donc sur toutes les installations existantes (E11). La
  proposition l'admet (lignes 356-359) et renvoie la conversion manuelle « hors
  périmètre » (ligne 367). Résultat : sur la base de 5 209 Mo qui motive P08,
  `opencode db compact` ne rend **aucun octet**, et la conversion exige un `VACUUM` complet
  de plusieurs minutes. R3 est correct mais ne livre pas la valeur promise à l'installation
  cible ; il faut soit le dire dans le titre (« outillage futur »), soit mesurer et publier
  le coût de la conversion.

Ce qui change : gonfler l'estimation à `L` et isoler R3 dans une proposition distincte,
ou remplacer `incremental_vacuum` par la procédure de conversion complète, explicitement
bornée et manuelle. Préciser aussi que `retentionDays` devient du code mort conservé
seulement pour `maintenance.test.ts:37-51` (lignes 205-206) — à assumer ou à supprimer.

### 5. Point 5 — `reasoning` a bien une politique distincte, mais P08 ne corrige pas la
   croissance qu'elle prétend mesurer

R2b est cohérent avec le point 2 : variable séparée, défaut **off**, `DELETE` filtré sur
`type = 'reasoning'`, et le census est bien couvert par l'index
`part WHERE time_created >= <now - 7d>` (`session.sql.ts:107`). Rien à corriger sur la
distinction.

Mais E17 mesure le `reasoning` à **50 % d'une session**, et R2b est lui-même qualifié de
« proposition de cadrage, pas un correctif de croissance » (lignes 330-331). Combiné à
E11 (aucun `VACUUM`) et à R3 inopérant sur l'existant, **la conclusion honnête est que P08,
tel que présenté, ne borne pas la croissance de la base** : il supprime une partie des
parts `tool` sans rendre d'octet, et laisse la moitié du volume intacte.

Ce qui change : annoncer le périmètre réel dans le titre et le résumé — « parts `tool`
seulement ; la base continuera de croître » — ou verser le cas 3 de R2b (plafond à
l'écriture) dans le périmètre, après lecture de `message-v2.ts:1125-1155` que la
proposition désigne elle-même comme la lecture préalable.

## Required changes

1. **R1 : abandonner le défaut à 90 jours.** Basculer sur l'opt-in + census chiffré R2b +
   avertissement au démarrage (repli §9, lignes 507-509). Une politique par défaut n'est
   acceptable que si elle est bornée par **espace disque cible** plutôt que par un âge, et
   si le dépôt fournit d'abord un filet : `opencode db backup` (nouveau sous-commande de
   `cli/cmd/db.ts:117`) ou au minimum `opencode db export-parts`. Sans filet, R1 reste
   bloqué quoi que valent 90 ou 30 jours. Justification : `maintenance.ts:15-18`,
   `cli/cmd/db.ts:113-120`, `session.sql.ts:89,96-97`.
2. **R2a : corriger le chemin `exec`** — ne plus confondre « `changes()` illisible » et
   « lot partiel » ; état triple explicite + `log.warn`, et cas `exec` ajouté au test 4
   de la §7. Justification : `maintenance.ts:33,36,158-164`.
3. **R2a : ajouter `maintenance.test.ts:69-71` à la liste de régression de la §6** —
   `expect(StorageMaintenance.purgeOldParts(failing(), 0)).toBe(false)` casse avec le type
   de retour `number`. Ce test est aujourd'hui absent de la §6.
4. **R2a : établir ou corriger le coût annoncé** — la forme `id IN (SELECT … ORDER BY
   time_created LIMIT)` n'exploite pas `part_time_created_idx` pour la suppression
   (`session.sql.ts:107`, `maintenance.ts:90-92`). Fournir un `EXPLAIN QUERY PLAN` sur une
   base de test, ou revenir à une borne en `time_created` par lot.
5. **Section 8 : passer `M` à `L`** et isoler R3 (compaction) dans une proposition distincte,
   en indiquant que `PRAGMA incremental_vacuum` est sans effet sur toute installation
   existante (`auto_vacuum = NONE`, E11) et que la conversion est manuelle.
6. **Titre et résumé : annoncer le périmètre réel** — parts `tool` uniquement, et
   acknowledge que la base continuera de croître (E17 : `reasoning` = 50 %).

## Implementation guidance

Ordre de patches : **(1) R2a seul** (batching + correction `exec` + mise à jour de
`maintenance.test.ts:69-71`), vérifiable immédiatement par `bun test
src/storage/maintenance.test.ts` sans toucher à `retentionDays` ; **(2) R3** dans
`maintenance.ts` + un sous-commande `CompactCommand` ajouté à `DbCommand.builder`
(`cli/cmd/db.ts:117`), avec le garde `auto_vacuum = 2` ; **(3) R2b census**, read-only,
journalisé ; **(4) R1 seulement après le change 1**, et dans ce cas armer la purge par une
premiere passe explicite plutôt que par `lastPurge = 0`.

Piège connu : `lastPurge = 0` (`maintenance.ts:98`) rend la condition
`now - lastPurge >= PURGE_INTERVAL_MS` toujours vraie à la première passe — c'est
l'instant où la purge s'arme sur une base de 5,2 Go. Conserver `resetPurgeClock()`
(`maintenance.ts:111`) et s'en servir dans les tests plutôt que de `Date.now()`.

Fichier de test à créer : `packages/opencode/test/storage/maintenance-retention.test.ts`
comme annoncé §7 ; y ajouter le cas `exec` (change 2) et le cas base verrouillée
attendu à `0`/explicitement typé (change 3).