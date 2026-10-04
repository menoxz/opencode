# P08 — Census en lecture seule de la croissance de `opencode.db` (aucune purge par défaut)

> Re-scope après verdict PASS_WITH_CHANGES et arbitrage A-1 — purge par défaut abandonnée, census read-only seul, effort L retiré

**Périmètre réel, annoncé dès le titre** : cette proposition **ne supprime aucune donnée et ne
rend aucun octet**. Elle ne fait que **mesurer** et **journaliser**. La base continuera de
croître, y compris sur ses parts `reasoning` (§9, résiduel assumé). Toute politique de purge
reste à l'opérateur, via la variable d'environnement existante.

## 1. Problem

Rien ne borne la taille de la base locale, mais le seul remède disponible dans le dépôt
— la purge des parts — est aujourd'hui **invisible** : elle ne s'exécute que si une variable
d'environnement est renseignée à la main, sans valeur par défaut, et rien ne mesure la
croissance pour que l'opérateur décide en connaissance de cause.

## 2. Evidence

Toutes les citations ci-dessous ont été relues dans ce cycle. La seule affirmation non
citée est explicitement marquée `DÉRIVÉ` ou `INFERE` avec sa méthode de vérification.

**E1 — la rétention n'a aucune valeur par défaut** — `packages/opencode/src/storage/maintenance.ts:50-54`

```ts
/** Retention window in days, or undefined when retention is disabled. */
export function retentionDays(env: Record<string, string | undefined> = process.env): number | undefined {
  const raw = Number(env["OPENCODE_PART_RETENTION_DAYS"])
  return Number.isFinite(raw) && raw > 0 ? raw : undefined
}
```

`Number(undefined)` vaut `NaN` : sans variable, le retour est `undefined`, c'est-à-dire
« purge désactivée ». **Cet état est conservé tel quel** — il devient la politique.

**E2 — `maintain` ne purge que si la rétention est définie** — `packages/opencode/src/storage/maintenance.ts:101-108`

```ts
export function maintain(db: Runner, env: Record<string, string | undefined> = process.env, now = Date.now()): void {
  const days = retentionDays(env)
  if (days !== undefined && now - lastPurge >= PURGE_INTERVAL_MS) {
    lastPurge = now
    purgeOldParts(db, cutoff(days, now))
  }
  checkpoint(db)
}
```

La garde `days !== undefined` est **la frontière entre la voie A et la voie B**. La voie B
conserve cette ligne exactement telle quelle.

**E3 — `purge: false` est implémenté en passant un env vide** — `packages/opencode/src/storage/maintenance.ts:183-184`

```ts
  const purge = options.purge ?? true
  const timer = setInterval(() => maintain(db, purge ? process.env : {}), options.intervalMs ?? CHECKPOINT_INTERVAL_MS)
```

`'{}'` est le signal de désactivation. Toute nouvelle voie d'écriture doit respecter ce
partage, sinon elle armerait la purge d'une base qui n'a pas de table `part`.

**E4 — les bases secondaires sont explicitement purgées : off** — `packages/opencode/src/memory/store.ts:236`
et `packages/opencode/src/eval/metrics.ts:312`

```ts
    StorageMaintenance.schedule(sqlite, { purge: false })
```

**E5 — la base principale est la seule à purger** — `packages/opencode/src/storage/db.ts:286`

```ts
    StorageMaintenance.schedule(db)
```

**E6 — le module documente l'opt-in comme un invariant, pas comme un oubli** — `packages/opencode/src/storage/maintenance.ts:12-19`

```
 *  - `checkpoint` is lossless. It reclaims the WAL and runs automatically.
 *  - `purgeOldParts` destroys history. It is opt-in through
 *    `OPENCODE_PART_RETENTION_DAYS` and never runs unless asked, because
 *    silently deleting a user's transcripts to save disk is not a trade the
 *    harness gets to make on its own.
```

C'est l'argument que la voie A contredisait. La voie B s'y range.

**E7 — la purge existante ne supprime que les parts `tool`** — `packages/opencode/src/storage/maintenance.ts:65-72`

```ts
export function purgeOldParts(db: Runner, before: number): boolean {
  return attempt(() =>
    execute(
      db,
      `DELETE FROM part WHERE time_created < ${Math.floor(before)} AND json_extract(data, '$.type') = 'tool'`,
    ),
  )
}
```

**E8 — `checkpoint` est un `PRAGMA` mutateur : un census ne peut pas passer par lui** — `packages/opencode/src/storage/maintenance.ts:44-48`

```ts
export function checkpoint(db: Runner): boolean {
  const outcome = attempt(() => execute(db, "PRAGMA wal_checkpoint(TRUNCATE)"))
  if (!outcome) log.debug("wal checkpoint skipped, database busy")
  return outcome
}
```

`PRAGMA wal_checkpoint(TRUNCATE)` **écrit dans la base**. C'est la raison pour laquelle le
census ne peut pas être câblé sur `schedule()`/`maintain()` : il doit être un chemin d'appel
séparé (§4).

**E9 — l'ouverture recycle déjà le WAL** — `packages/opencode/src/storage/db.ts:255-259` et `:260-262`

```ts
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA busy_timeout = 5000")
  db.run("PRAGMA cache_size = -64000")
  db.run("PRAGMA foreign_keys = ON")
```

Puis `StorageMaintenance.checkpointOnOpen(db, dbPath)`. Ces écritures sont **antérieures et
indépendantes** du census : le census s'exécute après l'ouverture et n'y ajoute rien.

**E10 — aucun sous-commande de sauvegarde ni de compaction n'existe** — `packages/opencode/src/cli/cmd/db.ts:113-120`

```ts
export const DbCommand = cmd({
  command: "db",
  describe: "database tools",
  builder: (yargs: Argv) => {
    return yargs.command(QueryCommand).command(PathCommand).command(MigrateCommand).demandCommand()
  },
  handler: () => {},
})
```

Il n'existe ni `backup`, ni `compact`, ni `vacuum`. **C'est le motif du Required change 1 du
verdict** : sans filet de reprise, toute purge par défaut est un pari sans contrepartie.

**E11 — la table `part` n'a ni archivage ni soft-delete, et l'index de purge existe** —
`packages/opencode/src/session/session.sql.ts:107`

```ts
    index("part_time_created_idx").on(table.time_created),
```

**E12 — les parts `reasoning` sont des parts à part entière, et le rejeu les consomme** —
`packages/opencode/src/session/message-v2.ts:1013`, `:1125`, `:1149`

```
1013:         if (part.type !== "reasoning") return false
1125:         if (part.type === "reasoning") {
1149:             type: "reasoning",
```

**E13 — re-mesuré sur la base réelle** `C:\Users\jeanl\.local\share\opencode\opencode.db`
(`sqlite3 -readonly`, `EXIT=0`) : fichier de **4 089 565 184 octets** (`page_count = 998429`,
`page_size = 4096`) ; **672 804 parts** et **3 475 615 849 caractères** au total. La session la
plus lourde en `reasoning`, `ses_106da869affe6n5CLpUQUcAyj4`, porte **6 410 314 caractères** de
`reasoning` sur **30 251 627 caractères** de parts au total, soit **21,2 %**. Sur l'ensemble de
la base, `reasoning` ne pèse que **7,6 %** des caractères, contre **85,0 %** pour `tool`.

> Provenance : la version précédente (lignes 167-170) annonçait « base de 5 209 Mo », « 1 064 394 243
> octets de parts sur les 1 000 sessions les plus récentes », « une session de 485 étapes pèse 6,1 Mo
> », le tout « non re-mesuré ici », et **3 045 134 caractères = 50 % de la session**. Les trois
> volumes sont **re-mesurés** et périmés : empreinte `db`+`-wal`+`-shm` **4 093 726 224 o = 4 093,7 Mo**
> (4 089 565 184 + 4 128 272 + 32 768, `Get-Item`, `EXIT=0`) ; « 5 209 Mo » **abandonné** ; 1 000
> sessions les plus récentes (`time_created DESC`) **1 988 649 418 o** / 383 487 parts (`EXIT=0`) ;
> « 485 étapes / 6,1 Mo » **supprimé** : 0 session à 485 parts (`EXIT=0`; contrôle `= 10939` → 1).
>
> Méthode : `SELECT json_extract(data,'$.type') AS type, count(*), sum(length(data)) FROM part
> GROUP BY type`, puis regroupement par `session_id` trié sur la somme `reasoning` ; taille de
> fichier par `page_count * page_size`, et `freelist_count` via `pragma_freelist_count`.

### Résiduel assumé — `FINDING P08-R2B-REASONING-NON-BORNE` : `residual` (assumé)

La voie B **ne corrige pas** la croissance des parts `reasoning`. Elle la **mesure**. La
croissance reste non bornée, et c'est un choix, pas une lacune de cette proposition :

- **E13** : **6 410 314 caractères** de `reasoning` pour **une seule session** — la plus lourde,
  `ses_106da869affe6n5CLpUQUcAyj4` — sur **30 251 627 caractères** de parts, soit **21,2 %**, et
  non la moitié d'une session. Sur l'ensemble de la base, `reasoning` ne pèse que **7,6 %** des
  caractères, `tool` **85,0 %**. Ce qui grandit sans borner est donc bien réel, mais d'un ordre
  de grandeur inférieur à celui qu'annonçait le rapport d'audit initial.
- **E7** + **E12** : même purgée, la voie A ne toucherait que les parts `tool` ; les parts
  `reasoning` sont explicitement traitées au rejeu (`message-v2.ts:1125-1155`), donc les
  supprimer dégraderait la rejouabilité d'une session au lieu de libérer de l'espace.

**Statut : `residual`, assumé et documenté.** Toute politique de rétention sur `reasoning`
exigerait un seuil par **espace disque cible** et non par un âge, plus le filet
`opencode db backup` manquant (E10). Hors périmètre ici.

### Résiduel clos — `FINDING P08-VACUUM-COUT-NON-MESURE` : `out_of_scope`

Le coût d'un `VACUUM` complet et la durée d'une passe de purge sur 5,2 Go **n'ont pas été
mesurés**, et cette proposition **ne publie aucun chiffre pour eux**. Le version précédente
de ce document derivait des ordres de grandeur à partir du comportement SQLite documenté et
des `PRAGMA` observés en E9 ; ces valeurs sont **supprimées du raisonnement**, pas
reformulées : un chiffre déduit qui ressemble à une mesure oriente l'implémentation vers un
budget faux.

La voie B **n'exécute ni `VACUUM` ni purge**, donc ces durées n'entrent dans aucune décision
de ce document. Le point est marqué `out_of_scope`. S'il devait être rouvert, la mesure
serait : (a) chronométrer `opencode db query "VACUUM"` sur une copie de la base, (b) lire la
 taille avant/après via `SELECT (SELECT page_count FROM pragma_page_count) * (SELECT page_size
FROM pragma_page_size)`, (c) publier la durée **et** la taille, avec la base et le matériel.
Aucune de ces trois étapes n'a été faite ici.

## 3. Mechanism

Chemin d'exécution, de bout en bout, de la voie A retirée à la voie B livrée.

1. **Au démarrage**, `Client()` ouvre la base, applique les `PRAGMA` (E9), recycle le WAL
   (E9) puis appelle `StorageMaintenance.schedule(db)` — `db.ts:286`.
2. **Toutes les 5 minutes**, `setInterval` déclenche `maintain` (`maintenance.ts:184`).
3. `maintain` lit `retentionDays(process.env)` (E1). **Sans `OPENCODE_PART_RETENTION_DAYS`, le
   retour est `undefined`, donc le `if` de E2 est faux** : aucune purge.
4. `maintain` appelle malgré tout `checkpoint(db)` (E8), qui écrit un `PRAGMA
   wal_checkpoint(TRUNCATE)`. C'est le **seul** point d'écriture du chemin actuel, et il est
   sans rapport avec la rétention.
5. **Rien** ne mesure la taille de `part`, ni la répartition `tool` / `text` / `reasoning`, ni
   l'espace réellement libérable. L'opérateur ne peut donc pas arbitrer : il ne voit pas ce
   qu'il choisit de supprimer.

**L'étape 5 est le seul défaut que cette proposition corrige.**

Ce que la voie A retirait, et qui n'est plus proposé : le défaut à 90 jours, le
plafonnement par lots de 50 000 parts, la double boucle `changes()`, et le sous-commande
`compact`. Aucun de ces quatre éléments n'apparaît dans le §4.

## 4. Proposal

Trois modifications, toutes en lecture seule. **Aucun fichier n'est modifié sous
`packages/**` dans cette proposition** : c'est une spécification.

### 4.1 Nouveau fichier `packages/opencode/src/storage/census.ts`

```ts
export type Census = {
  totalParts: number
  byType: Record<string, { parts: number; chars: number }>
  dbBytes: number
  freelistBytes: number
}

/** Read-only. Emits SELECT statements exclusively: no DELETE, no VACUUM, no mutating PRAGMA.
 *  Ne propage jamais (§7, test 4) : un handle qui lève rend un `Census` vide (0 = verrouillé ou vide). */
export function census(db: Runner, before: number): Census {
  try {
  const grouped = query(
    db,
    `SELECT json_extract(data,'$.type') AS type, count(*) AS parts, COALESCE(sum(length(data)),0) AS chars
     FROM part WHERE time_created < ${Math.floor(before)}
     GROUP BY type`,
  )
  const sizes = query(
    db,
    `SELECT (SELECT page_count FROM pragma_page_count) * (SELECT page_size FROM pragma_page_size) AS db,
            ((SELECT page_count FROM pragma_page_count) - (SELECT freelist_count FROM pragma_freelist_count)) * (SELECT page_size FROM pragma_page_size) AS free`,
  )
  // ...reduce grouped into Census
  } catch {
    return { totalParts: 0, byType: {}, dbBytes: 0, freelistBytes: 0 }
  }
}
```

**Les deux seules requêtes sont des `SELECT`.** `pragma_page_count`, `pragma_freelist_count` et
`pragma_page_size` sont des fonctions table en **lecture seule** ; ce ne sont pas des `PRAGMA`
mutateurs et elles ne modifient pas la base. Elles sont de surcroît **distinctes** :
`pragma_page_count` n'expose qu'une seule colonne, `page_count`, et `freelist_count` appartient à
`pragma_freelist_count`. D'où les **deux sous-requêtes séparées** de l'expression `free` — écrire
`page_count - freelist_count` dans `pragma_page_count` ne se prépare sur aucune base réelle
(`no such column: freelist_count`, `EXIT=1`). Contrôle positif sur la base réelle
(`sqlite3 -readonly`, `EXIT=0`) : `SELECT * FROM pragma_page_count` rend `page_count = 998429`,
`SELECT * FROM pragma_freelist_count` rend `freelist_count = 46`. C'est pourquoi le census mesure
`freelistBytes` : il rend visible l'espace que le `journal_mode = WAL` de E9 laisse derrière lui,
sans jamais le rendre.

### 4.2 `maintenance.ts` — un chemin d'appel séparé, jamais `maintain()`

```ts
export function logRetentionOff(env: Record<string, string | undefined> = process.env): boolean {
  if (retentionDays(env) !== undefined) return false
  log.info("no retention configured — nothing is ever deleted", { census: "run `opencode db census` to measure" })
  return true
}
```

Câblé **hors de `maintain()`** et **hors de `schedule()`**. Justification : ces deux fonctions
appellent `checkpoint(db)` (E2, E8), qui écrit. Un census branché dessus **écrirait** et ne
serait plus un census. Ce test de lecture est le point le plus important de la conception.

`retentionDays` et `purgeOldParts` ne sont **pas** modifiés.

### 4.3 Nouveau sous-commande `CensusCommand` dans `cli/cmd/db.ts:117`

```
opencode db census [--before-iso <date>]
```

Ouvre la base **en lecture seule**, appelle `census()`, affiche le tableau, sort avec le
code 0. N'appelle ni `maintain`, ni `checkpoint`, ni `purgeOldParts`.

### 4.4 Ce qui reste volontairement inchangé

- **`purgeOldParts` (E7)** : identique, signature `boolean` comprise. L'opt-in E1 reste le seul
  chemin de suppression, et il reste vide tant que l'opérateur ne le remplit pas.
- **`checkpointOnOpen` (E9)** : antérieur au census, hors périmètre.
- **La table `part` (E11)** : aucune migration, aucune colonne, aucun index.

### 4.5 Le refus de purge est une décision tracée

Ce point est normatif, pas décoratif. Le version précédente de cette proposition proposait un
défaut à 90 jours ; le verdict l'a rejeté au motif qu'aucun filet n'existe (E10, E6). A-1
confirme le repli. Donc, dans le code livré :

- `retentionDays({}) === undefined` est **l'état par défaut voulu** (E1), pas un stub ;
- `logRetentionOff()` écrit un `log.info` **à chaque ouverture** lorsque la purge est
  désactivée (4.2), qui nomme la commande de mesure ;
- le `log.info` est la trace de la décision : l'absence de purge est **annoncée**, et l'opérateur
  reçoit le chemin exact pour la mesurer.

## 5. Alternatives considered

1. **Défaut à 90 jours sur les parts `tool` (voie A, re-scopée puis abandonnée).** Rejetée :
   c'est précisément ce que le verdict a mis en `KO` (Required change 1). `part` n'a ni
   archivage ni soft-delete (E11), aucun sous-commande de reprise n'existe (E10), et le module
   documente l'opt-in comme invariant (E6). Une politique par défaut sans filet n'est pas un
   défaut de rétention, c'est une perte de données silencieuse.
2. **Défaut borné par espace disque cible** au lieu d'un âge. Rejetée **pour ce cycle**, pas
   par principe : c'est la seule variante que le verdict qualifie d'acceptable à terme, mais
   elle exige le même filet que (1). Elle reste la candidate pour une proposition ultérieure,
   conditionnée à `opencode db backup`.
3. **Raccourcir les parts `tool` au lieu de les supprimer** (`json_set` pour tronquer la sortie
   de l'outil). Rejetée : elle écrit, donc elle n'est plus un census, et elle exigerait de relire
   `message-v2.ts:1125-1155` pour garantir la rejouabilité. Elle Sort du périmètre « lecture
   seule » qu'A-1 fixe.
4. **`PRAGMA incremental_vacuum` après purge** (ancien R3). Rejeté : sans effet sur une base
   en `auto_vacuum = NONE`, c'est-à-dire sur toutes les installations existantes. Retiré
   entièrement, conformément au Required change 5.
5. **Ne rien faire, garder le statu quo.** Rejeté : c'est l'omission que ce cycle remplace par
   une décision tracée (4.5). Le statu quo et le refus de purge produisent le même octet, mais
   seul le second dit pourquoi.

## 6. Risks

**Ce que le correctif peut casser :**

- **Régression sur les tests existants.** Un seul test est réécrit. Inventoraire relu de
  `maintenance.test.ts` (24 correspondances) : `retentionDays` (lignes 39, 43, 44, 45, 49),
  `purgeOldParts` (63, 70), `maintain` (78, 85, 98, 100, 101, 107), `schedule`/`purge:false`
  (142, 146). **Aucun de ces tests n'est modifié par la voie B**, parce que ni
  `retentionDays`, ni `purgeOldParts`, ni `maintain`, ni `schedule` ne changent de signature
  ni de comportement. Le seul risque réel est une collision de nom : `census` doit être un
  module séparé et ne pas être ré-exporté dans l'espace de noms `StorageMaintenance` sans
  vérification.
- **`maintenance.test.ts:139-147` doit être réécrit** — voir §7. Il est aujourd'hui un garde-fou
  *trop étroit* : il n'affirme l'absence de `DELETE` que pour `purge: false`, donc il laisse
  passer n'importe quelle écriture introduite sur le chemin par défaut.
- **`session-scope.ts:11`** : `SESSION_MAX_AGE_DAYS = 7` borne la **liste latérale**, pas les
  données. Le census rend visible cette différence : il compte des octets, pas des entrées de
  liste.

**Coût en tokens / latence ajouté, chiffré :**

- **Tokens : zéro.** Le census ne produit aucun appel modèle et n'entre dans aucun prompt.
- **Latence : un `SELECT` d'agrégation unique sur `part`, `WHERE time_created < <cutoff>`,
  `GROUP BY type`.** Le plan s'appuie sur `part_time_created_idx` (E11) — borne en `time_created`,
  pas en `id`, donc l'index reste utilisable. **Je ne chiffre pas la durée** : elle dépend de la
  taille de la base, du cache et du disque, et je n'ai pas de mesure (cf. `out_of_scope` en §2).
  Le census est **à la demande**, jamais sur le timer, donc il ne coûte rien à l'ouverture.
- **Écritures : zéro par construction**, vérifié par le test du §7 qui énumère les requêtes
  émises.

**Sécurité :** aucune surface nouvelle. Le census ouvre la base déjà ouverte, ne crée aucun
fichier, n'expose aucune donnée dans les logs (seuls des octets et des comptes), et ne touche
pas aux permissions. Aucun risque d'injection : les deux seules valeurs interpolées sont
`Math.floor(before)` et une constante ; le type `before` est `number`, pas une chaîne, ce qui
supprime la concatène utilisateur.

## 7. Tests

Fichier à créer : `packages/opencode/test/storage/census.test.ts`.

Commande exacte (`packages/opencode/package.json:10` = `"test": "bun test --timeout 30000"` ;
la racine `package.json:25` = `"echo 'do not run tests from root' && exit 1"` est évitée) :

```
cd packages/opencode && bun test test/storage/census.test.ts src/storage/maintenance.test.ts
```

1. **Preuve de lecture seule — le test central.** Appeler `census(spy, cutoff)` sur un spy qui
   enregistre les requêtes, puis affirmer :
   ```ts
   expect(db.queries.some((q) => /DELETE|UPDATE|INSERT|VACUUM/i.test(q))).toBe(false)
   expect(db.queries.some((q) => /PRAGMA\s+(?!page_count|page_size)/i.test(q))).toBe(false)
   expect(db.queries.every((q) => /^SELECT/i.test(q.trim()))).toBe(true)
   ```
   **Critère de succès** : les trois assertions passent, et le journal des requêtes ne contient
   **que** des `SELECT`. C'est la preuve exécutable que « un census qui écrit n'est plus un
   census ».
2. **Le census ne passe pas par `checkpoint`.** Spy sur un handle `: exec`, appeler `census`,
   affirmer que `PRAGMA wal_checkpoint` est absent. **Critère** : absent du journal.
3. **Comptage par type.** Injecter un `db` de test qui renvoie deux lignes `{type:"tool"}` et
   `{type:"reasoning"}`, affirmer que le `Census` les sépare. **Critère** :
   `byType.tool.chars === 100`, `byType.reasoning.chars === 100`, `dbBytes` repris tel quel.
4. **Reprise sur base verrouillée.** `census` sur un handle qui lève : la fonction renvoie un
   `Census` vide et **ne propage pas**. **Critère** : pas de throw. (Le census n'écrit pas,
   donc un verrou ne devrait pas le bloquer ; ce test verrouille ce contrat.)

### Réécriture de `maintenance.test.ts:139-147` — `P08-TESTS-EXISTANTS-A-REECRIRE`

État actuel relu (`packages/opencode/src/storage/maintenance.test.ts:139-147`) :

```ts
  test("purge:false never emits a DELETE — secondary databases have no `part` table", async () => {
    StorageMaintenance.resetPurgeClock()
    const db = spy()
    const stop = StorageMaintenance.schedule(db, { intervalMs: 5, purge: false })
    await new Promise((done) => setTimeout(done, 30))
    stop()
    expect(db.queries.length).toBeGreaterThan(0)
    expect(db.queries.some((q) => q.includes("DELETE"))).toBe(false)
  })
```

Ce test encode l'ancienne politique à **deux titres** : il ne couvre que le chemin
`purge: false` des bases secondaires, et il n'interdit que `DELETE` — il ne retiendrait ni un
`VACUUM`, ni un `PRAGMA` mutateur, ni une écriture sur le chemin **par défaut**, qui est
précisément le chemin que la voie B décrète inoffensif.

Il devient le **garde-fou de la nouvelle politique** et s'élargit à la fois en périmètre
(base principale, env par défaut) et en surface d'interdiction :

```ts
  test("no retention configured — the default path never deletes, and the census is read-only", async () => {
    StorageMaintenance.resetPurgeClock()
    const db = spy()
    // schedule() n'accepte pas d'env : maintenance.ts:184 fait maintain(db, purge ? process.env : {}).
    // On fixe donc explicitement un env VIDE, restauré en `finally`. Sans ce pin, l'assertion
    // tient sur l'absence fortuite de la variable DANS LA MACHINE, et rouge sur toute machine
    // où OPENCODE_PART_RETENTION_DAYS est posée : résultat non reproductible.
    const ambient = process.env.OPENCODE_PART_RETENTION_DAYS
    delete process.env.OPENCODE_PART_RETENTION_DAYS
    try {
      const stop = StorageMaintenance.schedule(db, { intervalMs: 5 })   // purge:true, env={}
      await new Promise((done) => setTimeout(done, 30))
      stop()
      // La nouvelle politique : rien n'est supprimé sans OPENCODE_PART_RETENTION_DAYS.
      expect(db.queries.some((q) => /DELETE/i.test(q))).toBe(false)
      // Le census ne peut pas être câblé sur ce chemin : checkpoint() y écrit.
      expect(db.queries.some((q) => /VACUUM/i.test(q))).toBe(false)
    } finally {
      if (ambient === undefined) delete process.env.OPENCODE_PART_RETENTION_DAYS
      else process.env.OPENCODE_PART_RETENTION_DAYS = ambient
    }
    // Même garde-fou sur un env VIDE passé EN ARGUMENT, comme les tests voisins
    // :85 / :98 / :100 / :101 / :107 — ici l'assertion porte sur `{}`, jamais sur l'ambiant.
    StorageMaintenance.resetPurgeClock()
    const main = spy()
    StorageMaintenance.maintain(main, {})
    expect(main.queries.some((q) => /DELETE/i.test(q))).toBe(false)
    // Secondary databases keep their existing guarantee.
    const secondary = spy()
    const stopSecondary = StorageMaintenance.schedule(secondary, { intervalMs: 5, purge: false })
    await new Promise((done) => setTimeout(done, 30))
    stopSecondary()
    expect(secondary.queries.some((q) => /DELETE/i.test(q))).toBe(false)
  })
```

**Traque de l'ancienne politique dans le reste du fichier.** Inventaire relu des 24
correspondances de `maintenance.test.ts`. Aucun autre test n'encode une purge par défaut :

| ligne | test | statut sous la voie B |
|---|---|---|
| 39, 43, 44, 45 | `retentionDays` sans variable / invalide / `0` / `-5` → `undefined` | **inchangé** : c'est désormais la politique affirmée, pas un défaut (E1) |
| 49 | `retentionDays` avec `"90"` → `90` | **inchangé** : l'opt-in reste possible |
| 63, 70 | `purgeOldParts` | **inchangé** : signature `boolean` préservée (E7) |
| 78 | `maintain(db, {})` | **inchangé** : aucun env, aucune purge |
| 85, 98, 100, 101, 107 | `maintain` avec `"90"` et horloge `PURGE_INTERVAL_MS` | **inchangé** : le comportement opt-in est identique |
| 139-147 | `purge:false` ne supprime rien | **réécrit** ci-dessus |

Le verdict signalait (Required change 3) que `maintenance.test.ts:70`,
`expect(StorageMaintenance.purgeOldParts(failing(), 0)).toBe(false)`, casserait si le type de
retour passait de `boolean` à `number`. **Sous la voie B ce risque disparaît par
suppression** : le plafonnement par lots n'est pas proposé, donc `purgeOldParts` garde son
type. Ce test est donc **fermé sans réécriture**, et il n'en reste qu'un à réécrire, pas deux.
C'est un écart avec le décompte initial, signalé ici plutôt que masqué.

## 8. Effort

`S` — un module nouveau d'environ 30 lignes en lecture seule, une fonction de log, un
sous-commande, un fichier de test et un test existant réécrit ; ni migration, ni changement de
timer, ni changement de signature.

> Le Required change 5 demandait de passer `M` à `L`. **Cet effort `L` était le prix de la
> voie A** (défaut à 90 jours, plafonnement par lots, compaction, filet de reprise). La voie B
> supprime R2a et R3, donc l'estimation retombe à `S`. La règle « effort `L` » n'est pas
> simplement révisée à la baisse : **elle est retirée avec la purge automatique**, qui en était
> le seul motif.

## 9. Verdict self-assessment

`READY`

Rien ne reste à trancher. Les six Required changes du verdict sont traités :

| # | Required change | Traitement |
|---|---|---|
| 1 | Abandonner le défaut à 90 jours | **Fait.** §1, §4.1, §4.2 : plus aucune purge par défaut, census en lecture seule, `log.info` d'avertissement (4.5). |
| 2 | Corriger le chemin `exec` de R2a | **Traité par suppression.** La boucle par lots n'est plus proposée, donc le défaut `changes()`-sur-`exec` n'a plus de surface. La fonction `purgeOldParts` (E7) reste inchangée et n'est atteignable qu'en opt-in sur la seule base principale (E5), donc jamais sur un handle `exec`. |
| 3 | Ajouter `maintenance.test.ts:69-71` à la régression | **Traité par suppression.** `:70` conserve `toBe(false)` car `purgeOldParts` garde son type `boolean` (E7). Aucune régression possible. Le vrai risque est `:139-147`, qui est réécrit en §7. |
| 4 | Établir ou corriger le coût annoncé de R2a | **Traité par suppression.** R2a n'est pas proposé. Le census reste en borne `time_created` et s'appuie donc sur `part_time_created_idx` (E11) — point du Required change 4 respecté par construction. Aucune durée n'est publiée. |
| 5 | Passer `M` à `L`, isoler R3 | **Fait, avec inversion.** R3 est retiré (§5.4) et l'effort passe à `S`, la voie A étant abandonnée (§8). |
| 6 | Annoncer le périmètre réel dans le titre et le résumé | **Fait.** Le titre annonce « census en lecture seule », « aucune purge par défaut » et la bannière ré-scope précise que la base continuera de croître. |

**Ce qui reste `residual` :**

- `P08-R2B-REASONING-NON-BORNE` — **`residual`, assumé.** La croissance des parts `reasoning`
  n'est pas bornée. **Mesuré** sur la base réelle `C:\Users\jeanl\.local\share\opencode\opencode.db`
  (`sqlite3 -readonly`, `EXIT=0` ; E13 re-mesuré) : la session la plus lourde en `reasoning`,
  `ses_106da869affe6n5CLpUQUcAyj4`, pèse **6 410 314 caractères** de `reasoning` sur
  **30 251 627 caractères** de parts au total, soit **21,2 %**. Sur l'ensemble de la base,
  `reasoning` ne pèse que **7,6 %** des caractères, contre **85,0 %** pour `tool`. *Méthode* :
  `SELECT json_extract(data,'$.type') AS type, count(*), sum(length(data)) FROM part GROUP BY type`,
  puis regroupement par `session_id` trié sur la somme `reasoning`. Le census la mesure, ne la
  corrige pas. La corriger exigerait un seuil par espace disque cible **et** le filet
  `opencode db backup` qui manque (E10).
- `P08-VACUUM-COUT-NON-MESURE` — **`out_of_scope`.** Aucun coût de `VACUUM` ni de passe de
  purge n'est publié ; les valeurs dérivées de la version précédente sont supprimées du
  raisonnement, avec la méthode de mesure consignée en §2 pour qui rouvrirait le point.