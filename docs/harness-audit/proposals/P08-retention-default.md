# P08 — Rétention par défaut et bornage de la croissance de `opencode.db`

## 1. Problem

Rien ne borne la taille de la base locale : la purge des parts ne s'exécute que si une variable
d'environnement est renseignée à la main, cette variable n'a aucune valeur par défaut, et aucun
mécanisme ne rend l'espace libéré par un `DELETE` — la base d'un installateur standard atteint
5 209 Mo, dont 1 064 394 243 octets de parts sur les seules 1 000 sessions les plus récentes.

## 2. Evidence

**E1 — la rétention n'a pas de défaut** — `packages/opencode/src/storage/maintenance.ts:50-54`

```ts
/** Retention window in days, or undefined when retention is disabled. */
export function retentionDays(env: Record<string, string | undefined> = process.env): number | undefined {
  const raw = Number(env["OPENCODE_PART_RETENTION_DAYS"])
  return Number.isFinite(raw) && raw > 0 ? raw : undefined
}
```

`Number(undefined)` vaut `NaN` : sans variable, le retour est `undefined`, c'est-à-dire « purge
désactivée ».

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

**E3 — `purge: false` est implémenté en passant un env vide** — `packages/opencode/src/storage/maintenance.ts:183-184`

```ts
  const purge = options.purge ?? true
  const timer = setInterval(() => maintain(db, purge ? process.env : {}), options.intervalMs ?? CHECKPOINT_INTERVAL_MS)
```

C'est le point décisif pour la conception : « `{}` » est le signal de désactivation, et il est
partagé avec l'argument `env` de `maintain`. Un défaut dans `retentionDays` casserait donc aussi
la garde des bases secondaires.

**E4 — cette garde est verrouillée par un test** — `packages/opencode/src/storage/maintenance.test.ts:139-147`

```ts
  test("purge:false never emits a DELETE — secondary databases have no `part` table", async () => {
    ...
    const stop = StorageMaintenance.schedule(db, { intervalMs: 5, purge: false })
    ...
    expect(db.queries.some((q) => q.includes("DELETE"))).toBe(false)
  })
```

**E5 — les trois seuls points d'entrée de la maintenance** — `packages/opencode/src/storage/db.ts:286`
(`StorageMaintenance.schedule(db)`, base principale), `packages/opencode/src/memory/store.ts:236`
(`schedule(sqlite, { purge: false })`), `packages/opencode/src/eval/metrics.ts:312`
(idem). Recherche `purgeOldParts|retentionDays|StorageMaintenance|PURGE_INTERVAL_MS|OPENCODE_PART_RETENTION_DAYS`
sur `packages/opencode` : aucun autre appelant de `purgeOldParts` que `maintain`
(`maintenance.ts:105`) et son test.

**E6 — la purge ne touche que les parts `tool`** — `packages/opencode/src/storage/maintenance.ts:60-72`

```ts
/**
 * Drop message parts older than the cutoff. Only `tool` parts are removed: they
 * hold the large outputs (172 MB over 45 days in the audit) while text and
 * reasoning parts are what make an old session still readable.
 */
export function purgeOldParts(db: Runner, before: number): boolean {
  return attempt(() =>
    execute(db,
      `DELETE FROM part WHERE time_created < ${Math.floor(before)} AND json_extract(data, '$.type') = 'tool'`),
  )
}
```

**E7 — il n'existe aucun autre `DELETE` dans tout `src`** — recherche `DELETE FROM` sur
`packages/opencode/src/**/*.ts` : 5 résultats, tous dans `maintenance.test.ts` (lignes 64, 87, 103,
108) et le seul `maintenance.ts:69`. Aucune expiration de session, de message ou de partie n'existe.

**E8 — la purge est destructive, sans filet** — `packages/opencode/src/session/session.sql.ts:90-109` :
la table `part` est `(id, message_id, session_id, time_created/updated, data)` ; pas de colonne
d'archivage ni de suppression douce. Les cascades existent mais dans l'autre sens :
`part.message_id → message` (lignes 96-97), `message.session_id → session` (ligne 80). Aucun
`recycle bin`, aucune table d'archive.

**E9 — l'export est manuel et initiated par l'utilisateur** —
`packages/opencode/src/cli/cmd/tui/config/keybind.ts:86` (`session_export: keybind("<leader>x", "Export session to editor")`),
`packages/opencode/src/cli/cmd/tui/routes/session/index.tsx:1419` (toast « Session exported to … ») et
`packages/opencode/src/server/shared/logs-page.ts:226` (`async function exportSession(id)`).
Aucun export automatique de la base : les seules écritures d'archive trouvées sont les journaux
`idle-*.json` du daemon (`src/daemon/idle.ts:270`), sans rapport avec `part`.
`INFERE:` aucune rétention supérieure (sauvegarde, rotation, cloud) n'existe pour les parts —
vérifiable par `rg -n "export|backup|archive" packages/opencode/src/storage packages/opencode/src/session`
qui ne renvoie que les gestionnaires d'export manuels ci-dessus.

**E10 — la liste de sessions ne montre que 7 jours** —
`packages/opencode/src/cli/cmd/tui/context/session-scope.ts:10-14`

```ts
/** Sessions updated before the cut-off are not listed. */
export const SESSION_MAX_AGE_DAYS = 7
/** Ceiling on sessions fetched per folder, so one busy folder cannot flood the list. */
export const SESSION_FETCH_LIMIT = 200
```

**E11 — aucun `VACUUM` nulle part** — recherche `VACUUM|auto_vacuum|incremental_vacuum|wal_autocheckpoint`
sur `packages/` : aucun résultat. `packages/opencode/src/storage/db.ts:255-259` pose uniquement :

```ts
    db.run("PRAGMA journal_mode = WAL")
    db.run("PRAGMA synchronous = NORMAL")
    db.run("PRAGMA busy_timeout = 5000")
    db.run("PRAGMA cache_size = -64000")
    db.run("PRAGMA foreign_keys = ON")
```

`auto_vacuum` reste donc à sa valeur SQLite par défaut (`NONE`).

**E12 — `db.ts:260-262` est un checkpoint de WAL, pas une compaction** —
`packages/opencode/src/storage/db.ts:260-262`

```ts
    // Adaptive: PASSIVE normally, TRUNCATE once the WAL has drifted. The old
    // unconditional PASSIVE never shrank the file — see storage/maintenance.ts.
    StorageMaintenance.checkpointOnOpen(db, dbPath)
```

`checkpointOnOpen` (`maintenance.ts:147-151`) choisit entre `PASSIVE` et `TRUNCATE` selon
`WAL_TRUNCATE_THRESHOLD_BYTES = 64 Mo` (`maintenance.ts:123`) ; `close()` refait un `TRUNCATE`
(`db.ts:298-305`). Ces opérations concernent le fichier `-wal`, jamais le fichier principal : la
haute-marque du `opencode.db` n'est jamais baissée.

**E13 — les parts `reasoning` sont affichées à l'utilisateur** —
`packages/opencode/src/cli/cmd/tui/feature-plugins/system/session-v2.tsx:333`
(`<Match when={part.type === "reasoning"}>`) et
`packages/opencode/src/cli/cmd/tui/feature-plugins/system/session-logs.tsx:45-46,183`
(`case "reasoning": … <OutputField label="reasoning" value={props.part.text} …>`).
Les supprimer dégrade une lecture de session existante.

**E14 — les parts `reasoning` portent des métadonnées de signature** —
`packages/opencode/src/session/message-v2.ts:1012-1015`

```ts
      const hasSignedReasoning = msg.parts.some((part) => {
        if (part.type !== "reasoning") return false
        return part.metadata?.anthropic?.signature != null
      })
```

Toute transformation du stockage de `data` touche donc un chemin qui manipule des thinking signés.

**E15 — l'API de maintenance n'accepte que des chaînes SQL brutes** —
`packages/opencode/src/storage/maintenance.ts:33` : `type Runner = { run: (query: string) => unknown } | { exec: (query: string) => unknown }`.
Aucun paramètre lié : toute valeur interpolée doit être validée numériquement avant concaténation.

**E16 — cadence actuelle** — `maintenance.ts:26` (`CHECKPOINT_INTERVAL_MS = 5 * 60_000`),
`maintenance.ts:96` (`PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000`), `maintenance.ts:98` (`let lastPurge = 0`).
Conséquence : à la première passe, `now - 0 >= PURGE_INTERVAL_MS` est toujours vrai.

**E17 — mesures terrain fournies par l'audit (non re-mesurées ici)** : base de 5 209 Mo ;
1 064 394 243 octets de parts sur les 1 000 sessions les plus récentes ; une session de 485 étapes
pèse 6,1 Mo ; les parts `reasoning` d'une session pèsent 3 045 134 caractères, soit 50 % de la
session. `INFERE:` la part « 0 % de valeur après compaction » se vérifie en comparant
`src/session/compaction.ts` (le résumé ne réécrit pas les parts) et
`src/session/message-v2.ts:1125-1155` (reconstruction des parts `reasoning` au rejeu) : vérifier que
le chemin de reprise post-compaction ne lit pas `part.type === "reasoning"`.

## 3. Mechanism

1. Au démarrage, `Client()` ouvre la base, pose les PRAGMA de E11, puis appelle
   `StorageMaintenance.schedule(db)` (`db.ts:286`). Le booléen `purge` y vaut `true` par défaut
   (`maintenance.ts:183`).
2. Le timer tourne toutes les 5 minutes (`maintenance.ts:26,184`) et appelle `maintain(db, process.env)`.
3. `maintain` appelle `retentionDays(env)` (E1). Sans variable d'environnement : `undefined`.
4. La branche de purge est donc sautée **à chaque tick, définitivement**. Seul `checkpoint(db)`
   s'exécute (`maintenance.ts:107`).
5. Résultat : aucun `DELETE FROM part` n'est jamais émis sur une installation standard (E7) ;
   la table `part` ne fait que croître — 1 064 394 243 octets pour 1 000 sessions (E17).
6. Chaque insertion écrit dans le WAL ; le checkpoint le recopie dans le fichier principal
   (E12) mais ne rend pas la haute-marque : le fichier principal garde la taille atteinte.
7. Aucun `VACUUM` n'existe (E11) : même après une purge manuelle
   (`OPENCODE_PART_RETENTION_DAYS=90 opencode …`), les pages libérées restent dans la freelist et
   le fichier garde sa taille. La rétention existante est donc **inopérante sur l'empreinte
   disque** tant qu'aucun compacteur n'est ajouté — c'est ce qui explique une base de 5 209 Mo
   alors que le mécanisme de purge « existe ».
8. Les bases secondaires (mémoire, eval) passent par le même timer avec `purge: false`
   (`memory/store.ts:236`, `eval/metrics.ts:312`), qui n'a pas de table `part` : toute politique de
   purge par défaut doit rester inerte pour elles (E3, E4).

## 4. Proposal

Trois changements, tous dans `packages/opencode/src/storage/maintenance.ts` (plus les tests), sans
ajout de dépendance. Rien dans `db.ts` n'est obligatoire : `checkpointOnOpen` (E12) est conservé tel
quel.

### R1 — une rétention par défaut de 90 jours sur les parts `tool`, désactivable explicitement

Nouveau parseur à côté de `retentionDays` (que l'on garde tel quel pour ne pas casser
`maintenance.test.ts:37-51`) :

```ts
/** Purge tool parts older than 90 days unless the operator opts out. */
export const DEFAULT_PART_RETENTION_DAYS = 90

export type Retention = { days: number; enabled: boolean; source: "env" | "default" | "off" }

export function retention(env: Record<string, string | undefined> = process.env): Retention {
  const raw = env["OPENCODE_PART_RETENTION_DAYS"]
  if (raw === undefined) return { days: DEFAULT_PART_RETENTION_DAYS, enabled: true, source: "default" }
  if (raw === "off" || raw === "false" || raw === "0" || raw === "-1")
    return { days: 0, enabled: false, source: "off" }
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed > 0) return { days: parsed, enabled: true, source: "env" }
  return { days: DEFAULT_PART_RETENTION_DAYS, enabled: true, source: "default" }
}
```

et la surcharge de `schedule` qui today surcharge « désactivé » par « env vide » (E3) :

```ts
  const env = purge ? process.env : { OPENCODE_PART_RETENTION_DAYS: "off" }
  const timer = setInterval(() => maintain(db, env), options.intervalMs ?? CHECKPOINT_INTERVAL_MS)
```

`maintain` passe de `retentionDays(env)` à `retention(env)` et journalise le passage en cours :

```ts
  const policy = retention(env)
  if (policy.enabled && now - lastPurge >= PURGE_INTERVAL_MS) {
    const cutoff = cutoff(policy.days, now)
    log.info("purging old tool parts", { cutoff, retentionDays: policy.days, source: policy.source })
    purgeOldParts(db, cutoff)
  }
  checkpoint(db)
```

**Pourquoi 90 jours est acceptable en risque utilisateur.** Ce qui est perdu : les *sorties
d'outils* (contenus de fichiers, stdout de commandes) des sessions de plus de 9 mois. Ce qui
survit : la session, ses messages, le texte, le raisonnement — le `DELETE` est filtré sur
`json_extract(data,'$.type') = 'tool'` (E6), et c'est le point défendu par le commentaire de
E6. Quatre faits font descendre le risque à un niveau acceptable :

- **La purge est irréversible et sans filet** (E8) : ni soft-delete, ni table d'archive, ni
  `recycle bin`. Donc pas d'argument « on pourraAlways récupérer » — l'argument doit porter sur le
  *périmètre* de ce qui est détruit, pas sur une promesse de récupération.
- **Rien de ce qui est purgé n'est visible dans l'UI par défaut** : la liste de sessions est
  plafonnée à 7 jours et à 200 entrées par dossier (E10). Une session de plus de 90 jours n'est
  plus listée depuis longtemps ; la perte ne peut donc pas être remarquée par une absence dans une
  liste, seulement en ouvrant une session par son identifiant.
- **90 jours est la plus petite fenêtre qui survive à une absence normale** (vacances, mission de
  deux semaines, projet parked). Une fenêtre de 30 jours tuerait des données utils après une simple
  coupure d'usage ; c'est la vraie borne de risque, pas 90.
- **Le désarmement est instantané et sans migration** : `OPENCODE_PART_RETENTION_DAYS=off` (une
  chaîne déjà reconnue par le code existant, cf. la liste de test de `maintenance.test.ts:42-46`)
  suffit, et l'export manuel existe *avant* que la purge ne se déclenche (E9), donc un opérateur
  inquiet peut extraire une session avant que la fenêtre ne passe.

Ce qui est **volontairement inchangé** : la clause `type = 'tool'` (E6, verrouillée par
`maintenance.test.ts:61-67`), la cadence `PURGE_INTERVAL_MS` (E16), le `TRUNCATE` de checkpoint.

### R2 — bornage du temps de verrou, par lots, et separated du raisonnement

Deux ajouts distincts.

**R2a — purge par lots.** `lastPurge = 0` (E16) fait que la **première** passe après mise à jour
d'une installation existante purge immédiatement l'intégralité de l'historique des parts `tool` dans une seule
transaction d'écriture — sur une base de 5,2 Go. C'est le pire scénario possible du changement
proposé. Le.batch divise le travail :

```ts
export const PURGE_BATCH_ROWS = 50_000
export const PURGE_MAX_BATCHES = 8

export function purgeOldParts(db: Runner, before: number): number {
  const boundary = Math.floor(before)
  let deleted = 0
  for (let batch = 0; batch < PURGE_MAX_BATCHES; batch++) {
    if (!attempt(() => execute(db,
      `DELETE FROM part WHERE id IN (SELECT id FROM part WHERE time_created < ${boundary}` +
      ` AND json_extract(data, '$.type') = 'tool' ORDER BY time_created LIMIT ${PURGE_BATCH_ROWS})`)))
      break
    const rows = attemptValue(() => changedRows(db)) ?? 0   // "SELECT changes()" sur la même connexion
    deleted += rows
    if (rows < PURGE_BATCH_ROWS) break
  }
  log.info("purged tool parts", { boundary, deleted })
  return deleted
}
```

Plafond : 8 × 50 000 = 400 000 parts par passe, une passe toutes les 6 h au maximum (E16). Le
`SELECT … ORDER BY time_created LIMIT` s'appuie sur `part_time_created_idx`
(`session.sql.ts:105-107`), donc le coût reste un parcours d'index et non un scan de la table.

**R2b — parts `reasoning` : ni purge par défaut, ni compression.** Le raisonnement est *affiché*
(E13) : le purger par défaut, c'est régresser la lisibilité d'une session ancienne — exactement ce
que E6 refuse de faire pour le texte. Le compressor, c'est toucher `data`, une colonne typée
`PartData` (`session.sql.ts:100`) qui porte des signatures de thinking signés (E14) : chaque
lecteur devrait passer par une décompression, et un raisonnement stocké paresseusement ou tronqué
corrompt la reprise d'un thinking Anthropic. Le ratio mesuré (50 % de la session, E17) est réel, mais
la correction honnête est ailleurs.

Ce qui est proposé : **une census, pas une suppression.** Un relevé read-only par cycle de purge,
borné à la semaine écoulée par l'index existant, qui rend la question décidable par des chiffres au
lieu d'une intuition :

```sql
SELECT json_extract(data,'$.type') AS type, count(*) AS rows, sum(length(data)) AS bytes
FROM part WHERE time_created >= <now - 7d> GROUP BY 1
```

Trois lectures possibles de ce relevé, par ordre de risque croissant :

1. l'opérateur fixe `OPENCODE_REASONING_RETENTION_DAYS` (défaut **off**, donc comportement
   strictement nul sur les installations existantes) et la purge raisonnement devient un `DELETE`
   filtré sur `type = 'reasoning'`, exécuté par le même `maintain` ;
2. le raisonnement est purgé **au moment où la session entière est hors rétention** — mais il
   n'existe aucune purge de session (E7), donc il n'y a pas de grant à révoquer aujourd'hui ;
3. un plafond à l'écriture (les N derniers reasoning par message), qui est la vraie correction de
   la cause mais change ce que l'utilisateur voit dans le log (E13) et relève d'une proposition
   distincte : `INFERE:` la correction sûre dépend de `message-v2.ts:1125-1155`, à lire avant de la proposer.

R2b reste donc **opt-in, mesuré d'abord**. C'est une proposition de cadrage, pas un correctif de
croissance ; le correctif de croissance est R1 + R2a + R3.

### R3 — récupeur d'espace, explicite et borné, jamais automatique

État réel : aucun `VACUUM`/`auto_vacuum` dans le dépôt (E11) ; `db.ts:260-262` ne fait que
recycler le WAL (E12). Conséquence directe : même activé, le mécanisme de rétention ne rend pas un
octet au système de fichiers. Il faut donc un compacteur — mais il ne doit pas être dans le chemin
par défaut.

```ts
export function compact(db: Runner, pages = 8192): boolean {
  const before = attemptValue(() => scalar(db, "PRAGMA freelist_count")) ?? 0
  if (before === 0) return false                      // rien à faire : aucun coût
  const ok = attempt(() => execute(db, `PRAGMA incremental_vacuum(${Math.max(1, Math.floor(pages))})`))
  log.info("reclaimed freelist pages", { before, after: attemptValue(() => scalar(db, "PRAGMA freelist_count")) })
  return ok
}
```

Trois conditions, non négociables :

- **jamais sur le timer** : `compact()` est appelé par une action explicite
  (`opencode db compact`), jamais par `maintain()` (E2), jamais par `checkpointOnOpen` (E12). Un
  `VACUUM` est la seule opération SQLite qui bloque les lecteurs et les écrivains pendant toute sa
  durée ; le mettre sur un timer de 5 minutes transforme une opération rare en panne périodique.
- **no-op si `PRAGMA auto_vacuum` ≠ 2 (`INCREMENTAL`)** : `incremental_vacuum` ne fait rien sur une
  base en `NONE`, qui est notre cas (E11). Il faut donc dire la vérité à l'utilisateur plutôt que
  d'émettre un `PRAGMA` inopérant. `INFERE:` comportement documenté par SQLite ; à vérifier par
  `PRAGMA auto_vacuum;` avant et après sur une base de test, pas sur celle de l'opérateur.
- **la conversion d'une base existante est une opération manuelle** : passer une base déjà
  peuplée de 5 209 Mo de `NONE` à `INCREMENTAL` exige un `VACUUM` complet, qui réécrit
  l'intégralité du fichier. `INFERE:` coût — espace libre supplémentaire requis égal à la taille de
  la base au pic (≈ 5,2 Go par-dessus le fichier existant), durée de l'ordre de plusieurs minutes,
  verrou exclusif pendant toute l'opération, les autres connexions attendant au plus
  `busy_timeout = 5000` ms (`db.ts:257`) avant d'échouer en `SQLITE_BUSY`. Méthode de mesure :
  `Measure-Command { sqlite3 copie.db 'VACUUM' }` sur une **copie** ; la base de 5,2 Go n'est pas
  touchée par cette proposition (hors périmètre).

## 5. Alternatives considered

1. **Étendre `purgeOldParts` aux parts `reasoning` (et/ou `text`) par défaut.** Rejeté. Le
   raisonnement est affiché à l'utilisateur (E13) et le commentaire de E6 documente
   explicitement `tool` comme le seul profil affichable comme gros volume de données. Étendre la
   clause supprime la garantie de « session ancienne encore lisible » et casse
   `maintenance.test.ts:61-67`. Une régression de lisibilité n'est pas un gain d'espace.
2. **Compresser `data` (zstd) pour les parts `reasoning`.** Rejeté. `data` est une colonne texte
   typée `PartData` (`session.sql.ts:100`) lue par tous les chemins de session ; la compression
   impose un chemin de décompression partout et un risque de corruption sur les signatures de
   thinking (E14). Rapport effort/risque défavorable, pour un gain qui ne fait qu'une fraction de
   la taille du WAL déjà rétréci par `checkpoint`.
3. **`VACUUM` automatique sur le timer de maintenance.** Rejeté : coût réel non borné (≈ taille de
   la base en I/O), verrou exclusif le temps de l'opération, et un `PRAGMA` qui peut expire par
   `busy_timeout` (E11, `db.ts:257`). Une opération de reprise manuelle ne doit jamais devenir une
   panne périodique. D'où R3.
4. **`PRAGMA auto_vacuum = INCREMENTAL` par défaut sur les nouvelles bases.** Écarté *de cette
   proposition*, à traiter séparément : il n'aide que les bases créées après le changement (donc
   aucune des installations existantes, dont celle de 5 209 Mo), impose un surcoût d'écriture
   permanent, et ne peut pas s'activer sans `VACUUM` sur l'existant. Utile, mais ce n'est pas le
   défaut qui manque.
5. **Supprimer les sessions entières au-delà de la rétention (cascade `part → message → session`,
   `session.sql.ts:80,96-97`).** Rejeté, et c'est le plus radical des choix : cela donnerait une
   empreinte réellement bornée, mais supprimerait les métadonnées de session que l'UI et le
   routage indexent. Une session listée et vide est pire qu'une session lisible au tool output près.
6. **Rester en opt-in et se contenter d'un avertissement** (« votre base fait 5,2 Go, définissez
   `OPENCODE_PART_RETENTION_DAYS` »). Rejeté : c'est l'état actuel, mesuré comme fail (`docs/harness-audit/README.md:30`).
   Un avertissement que personne ne lit n'a jamais borné quoi que ce soit ; et le census de R2b rend
   le message chiffré, donc actionnable.

## 6. Risks

**Régression sur les tests existants (fichiers concernés, avec lignes).**

- `packages/opencode/src/storage/maintenance.test.ts:38-40` — « is disabled by default: destroying
  history is opt-in » **doit devenir** « defaults to 90 days ». C'est le test qui encode la décision
  à renverser ; il est le premier à mettre à jour, sinon `bun test` échoue immédiatement.
- `packages/opencode/src/storage/maintenance.test.ts:75-80` — « checkpoints without purging when
  retention is disabled » passe `maintain(db, {})`. Après R1, `{}` signifie « 90 jours » et le test
  casse. Correction : passer `{ OPENCODE_PART_RETENTION_DAYS: "off" }`. Le test lui-même est bon,
  c'est son `env` qui devient faux.
- `packages/opencode/src/storage/maintenance.test.ts:139-147` — « `purge:false` never emits a
  DELETE ». Doit **continuer à passer** : c'est le test qui prouve que la correction E3 empêche R1
  de purger la base mémoire/eval (qui n'ont pas de table `part`). Si ce test casse, R1 a un défaut
  de conception, pas un défaut de test.
- `packages/opencode/src/storage/maintenance.test.ts:42-46` (valeurs aberrantes) et `:82-90`,
  `:92-109` (purge cadence) restent valides tels quels, `retentionDays` n'étant pas modifié.
- `packages/opencode/src/storage/maintenance.test.ts:61-67` verrouille la clause `tool` : à ne pas
  toucher.
- `packages/opencode/test/storage/db.test.ts` et `packages/opencode/test/storage/db-migrations.test.ts`
  : sans effet tant qu'aucun PRAGMA n'est ajouté à `db.ts` ; à rejouer si R3 est poussé jusque-là.

**Coût en tokens / latence ajouté, chiffré.** Zéro token : aucun prompt, aucun appel LLM, aucun
outil n'est touché (E7 : aucun `DELETE` ailleurs, donc aucune nouvelle écriture en session).
Latence sur le chemin d'une requête : zéro — le timer est hors du chemin critique et `unref`'d`
(`maintenance.ts:184-185`), cadence 5 min (`maintenance.ts:26`) ; le surcoût par tick est une
conversion `Number()` (`maintenance.ts:52`). Écriture : au plus 400 000 parts par passe
(R2a), une passe par 6 h au maximum (E16), donc au plus 1,6 M parts/jour — le temps de verrou
d'écriture est borné par transaction, donc indépendant de la taille de la base. Durée réelle d'une
passe : `INFERE:` à mesurer, méthode `SELECT count(*) FROM part WHERE time_created < <cutoff> AND
json_extract(data,'$.type')='tool'` sur la base de l'opérateur en lecture seule.

**Sécurité.** `Runner` n'accepte que des chaînes SQL brutes (E15) : le nouveau tri-état doit
convertir `"off"`/`"0"` en booléen **avant** toute interpolation — une implémentation naïve qui
concatène `env["OPENCODE_PART_RETENTION_DAYS"]` dans la requête est une injection. Le
`PURGE_BATCH_ROWS` est une constante littérale, jamais une variable d'environnement. Aucune
élévation, aucune écriture hors du répertoire data. Effet de bord assumé : un `VACUUM` ou une
suppression rend des pages récupérables par un `sqlite3 .recover` local exécuté par un autre
processus du même compte utilisateur — sans portée multi-utilisateur (base locale par
utilisateur), à revoir si un mode partagé est introduit.

**Blast radius.** Le pire cas est la **première passe après mise à jour** sur une installation
existante (`lastPurge = 0`, E16) : c'est exactement l'instant où la purge par défaut s'arme chez
5 209 Mo. Le plafonnement par lots de R2a + le `log.info` explicite sont la réponse ; à défaut, le
correctif serait deployed avec un risque de gel d'écriture à l'ouverture de la TUI.

**Rollback.** `OPENCODE_PART_RETENTION_DAYS=off` (une valeur, effet immédiat, aucune migration) ;
ou restauration du fichier `opencode.db` depuis une copie. Le nom de variable et son format
numérique sont conservés, donc aucune configuration existante ne casse.

## 7. Tests

Nouveau fichier (chemin imposé par le gabarit, hors des tests colocalisés) :
`packages/opencode/test/storage/maintenance-retention.test.ts`. Il suit le motif déjà éprouvé dans
`packages/opencode/src/storage/maintenance.test.ts:191-246` : une vraie base `bun:sqlite` dans un
`mkdtempSync`, une table `part(id TEXT, message_id TEXT, session_id TEXT, time_created INTEGER,
data TEXT)`, et des lignes d'âges distincts.

1. **défaut 90 j, parts `tool` seules** — insérer une part `tool` à `now - 91 j`, une part `tool` à
   `now - 1 j`, une part `text` et une part `reasoning` à `now - 91 j` ; une passe de `maintain` →
   `SELECT type, count(*) …` ne renvoie plus qu'une seule ligne `tool`, la `tool` récente et les deux
   anciennes non-`tool` sont intactes. Critère observable : le décompte par type.
2. **désactivation explicite** — `maintain(db, { OPENCODE_PART_RETENTION_DAYS: "off" })` n'émet aucun
   `DELETE FROM part`.
3. **garde des bases secondaires** — `schedule(db, { intervalMs: 5, purge: false })` avec un
   `process.env` *sans* variable : aucune requête contenant `DELETE` (protège `memory/store.ts:236`
   et `eval/metrics.ts:312`).
4. **plafonnement par lots** — 120 000 parts `tool` anciennes → la passe émet ≥ 3 `DELETE`, chacun
   limité à `PURGE_BATCH_ROWS`, et s'arrête dès qu'un lot renvoie moins de `PURGE_BATCH_ROWS` lignes.
5. **base verrouillée** — runner qui lève : `purgeOldParts` renvoie `0`/false et ne propage pas
   l'exception.
6. **`compact`** — base avec freelist : `PRAGMA freelist_count` diminue après `compact()` ; base sans
   freelist : aucun `PRAGMA incremental_vacuum` émis.
7. **pas de régression du checkpoint** — la passe émet toujours `PRAGMA wal_checkpoint(TRUNCATE)`
   (`maintenance.ts:45`).

Commande d'exécution :

```
cd packages/opencode && bun test test/storage/maintenance-retention.test.ts
```

`packages/opencode/package.json:10` définit `"test": "bun test --timeout 30000"` ; la commande
ci-dessus est donc un sous-ensemble de la suite officielle. Critère de succès : code de sortie 0,
`N pass / 0 fail`, plus la suite existante inchangeée sauf les deux tests à réécrire :

```
cd packages/opencode && bun test src/storage/maintenance.test.ts
```

Ne pas exécuter `bun test` depuis la racine (`package.json:25` : le script racine échoue
délibérément).

## 8. Effort

`M` — un fichier source touched (`maintenance.ts`, ~40 lignes ajoutées, 3 signatures modifiées),
deux suites de tests mises à jour, une suite créée, aucune dépendance, aucune migration de schéma.

## 9. Verdict self-assessment

`NEEDS_REVIEW`

**Question à trancher par le validateur :** l'opérateur accepte-t-il qu'une installation standard,
sans aucune configuration, supprime les sorties d'outils de plus de 90 jours — c'est-à-dire
accepte-t-il que le défaut passe de « jamais, silencieusement » à « 90 jours, annoncé dans les
logs, désarmable par `OPENCODE_PART_RETENTION_DAYS=off` » ? Ma recommandation est oui, pour les
raisons E6/E8/E10 : le périmètre détruit est le seul gros volume non lisible en soi, il est hors de
la fenêtre d'affichage par défaut depuis deux ordres de grandeur, et la réversibilité est immédiate.
Si la réponse est non, la variante de repli à valider est : rétention par défaut désactivée +
avertissement chiffré au démarrage (census R2b) proposant explicitement le réglage — c'est
l'alternative 6 de la section 5, et elle ne borne rien en l'absence d'action de l'utilisateur.