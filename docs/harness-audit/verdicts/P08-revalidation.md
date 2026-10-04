# P08 — revalidation cycle 4

**Artifact evaluated**: `docs/harness-audit/proposals/P08-retention-default.md` (530 lines, mtime `2026-10-04 08:24:13`, 29 006 bytes).
**Revalidator**: independent. No repair was performed on the artifact. `git` was not used.
**Real database**: `C:\Users\jeanl\.local\share\opencode\opencode.db`, all queries `sqlite3 -readonly`.
**Probe artifacts**: `C:\Users\jeanl\AppData\Local\Temp\opencodev2\p08-r1-r2-probe.log`, `p08-r1d-mtime.log`, `p08-r1d2.log`.

**Path correction, recorded once**: the citation path is
`packages/opencode/src/storage/maintenance.ts` and `packages/opencode/src/storage/maintenance.test.ts`,
NOT `src/session/`. `packages/opencode/test/session/maintenance.test.ts` does not exist. The proposal
cites the correct path (`:348`, `:355`, `:409`, `:411`); the c3 brief that introduced `src/session` did not.

---

## R1 — `P08-CENSUS-SQL-FREELIST-INVALIDE` → RESOLVED

The c4 SQL (`:258-259`) reads `freelist_count` from `pragma_freelist_count`, not from
`pragma_page_count`. Executed against the real database:

| # | Query | EXIT | Result |
|---|---|---|---|
| R1-A | `SELECT * FROM pragma_page_count;` | 0 | `998429` — one column, one row |
| R1-B | `SELECT * FROM pragma_freelist_count;` | 0 | `46` |
| R1-C | `SELECT page_count - freelist_count FROM pragma_page_count;` (old form) | **1** | `Parse error near line 1: no such column: freelist_count` |
| R1-E | `SELECT name FROM pragma_table_info('pragma_page_count');` | 0 | `page_count` |
| R1-F | `SELECT name FROM pragma_table_info('pragma_freelist_count');` | 0 | `freelist_count` |

R1-A/B are the exact statements the proposal prints as its positive control at `:272-273`; R1-E/F are
the authoritative column names and settle the question directly — `pragma_page_count` exposes
**only** `page_count`, and `freelist_count` lives in `pragma_freelist_count`. R1-C reproduces the old
form with the claimed error text and a non-zero exit, matching `:271` verbatim.

**c4 SQL executed as extracted from the file** (not retyped). The SQL is a TypeScript template literal
spanning `:258-259`; the trailing `,` after the closing backtick is a TS argument separator *outside*
the SQL, so extraction takes the literal's interior only:

```
SELECT (SELECT page_count FROM pragma_page_count) * (SELECT page_size FROM pragma_page_size) AS db,
((SELECT page_count FROM pragma_page_count) - (SELECT freelist_count FROM pragma_freelist_count)) * (SELECT page_size FROM pragma_page_size) AS free
```

Result: **EXIT=0**, header `db|free`, values **`4089565184 | 4089376768`**.

Cross-check: `998429 * 4096 = 4 089 565 184` and `(998429 - 46) * 4096 = 4 089 376 768`, both
reproduced independently (R2-D). `4089565184` matches the file size stated at `:159`.

Two extraction failures of mine are on the record and were **not** counted against the proposal:
the first run kept the markdown backticks (syntax error, EXIT=1) and the second kept the trailing TS
comma (`incomplete input`, EXIT=1). Both were extraction defects; the SQL itself is executable. Logged
in `p08-r1d-mtime.log:1-6`.

The census is a new file (`:238`, `src/storage/census.ts`), so no census source exists to be wrong;
what had to be true — that this SQL prepares and returns the two values — is now true on the real
database.

## R2 — `P08-E13-CHIFFRE-50POURCENT-NON-REPRODUIBLE` → RESOLVED

Recomputed with my own SQL, same method the file declares at `:173-175`:

```sql
SELECT coalesce(json_extract(data,'$.type'),'NULLTYPE') AS type, count(*), sum(length(data)) FROM part GROUP BY type;
SELECT count(*), sum(length(data)) FROM part;
SELECT coalesce(json_extract(data,'$.type'),'NULLTYPE') AS type, count(*), sum(length(data)) FROM part WHERE session_id='ses_106da869affe6n5CLpUQUcAyj4' GROUP BY type;
```

Base totals — **672 804 parts, 3 475 615 849 characters** (matches `:160`):

| type | rows | characters | share |
|---|---|---|---|
| tool | 190 947 | 2 953 691 159 | **84.982 %** |
| reasoning | 108 702 | 265 175 764 | **7.6285 %** |
| text | 74 393 | 187 562 336 | 5.396 % |
| step-finish | 143 031 | 25 626 989 | 0.737 % |
| patch | 10 529 | 20 341 347 | 0.585 % |
| file | 248 | 17 125 298 | 0.493 % |
| step-start | 143 783 | 6 005 619 | 0.173 % |
| compaction | 1 171 | 87 337 | 0.003 % |

Session `ses_106da869affe6n5CLpUQUcAyj4`: `reasoning` = **6 410 314**, session total = **30 251 627**
→ `6410314 / 30251627` = **21.190 %**.

File: `page_count = 998429`, `page_size = 4096`, product **4 089 565 184** (matches `:159`).

The on-disk footprint confirms 4 089 565 184 is the whole database, not just the main file:
`opencode.db` = 4 089 565 184, `opencode.db-wal` = 4 128 272, `opencode.db-shm` = 32 768,
sum **4 093 726 224** bytes = 4 093,7 Mo = 3 904,1 MiB. This matters for the open finding below:
`INFERE:` the legacy « base de 5 209 Mo » at `:166` is ~27 % above the real footprint **including**
WAL and shm, so it cannot be excused as a different accounting boundary. Command:
`Get-ChildItem -LiteralPath "C:\Users\jeanl\.local\share\opencode" -File | Where-Object Name -like "opencode.db*"
| Measure-Object -Property Length -Sum` (EXIT=0).

All four claims at `:160-163` reproduce exactly: 672 804 parts, 3 475 615 849 chars, 6 410 314 /
30 251 627 = 21,2 %, reasoning 7,6 % vs tool 85,0 %. The false "3 045 134 caractères = 50 % de la
session" no longer appears as a claim.

**Positive control for the JSON-type query form** (same database, same statement shape):
`json_extract(data,'$.type')='reasoning'` → **108 702 rows**; negative control
`'__no_such_type__'` → **0 rows**, both EXIT=0. The query discriminates, so the group-by is not
silently returning an empty set.

**Provenance block `:165-171` — honest, not a re-import of the bad number.** It (a) marks the three
legacy volume figures explicitly as *not re-measured*, (b) keeps the 50 % figure only as a cited
historical error, (c) states plainly that the reasoning figure was false and is replaced. The false
value is quarantined with its origin attached, not restated as fact. One defect survives inside that
block — see `P08-E13-VOLUMES-LEGALES-PERIMEES`.

## R3 — `P08-REECRITURE-DEPENDE-ENV-AMBIANT` → RESOLVED

**Does `schedule()` accept an env argument? No** — and the proposal says so correctly at `:437`.

```ts
// packages/opencode/src/storage/maintenance.ts:176-184
export function schedule(
  db: Runner,
  options: { intervalMs?: number; purge?: boolean } = {},
): () => void {
  ...
  const purge = options.purge ?? true
  const timer = setInterval(() => maintain(db, purge ? process.env : {}), options.intervalMs ?? CHECKPOINT_INTERVAL_MS)
```

The signature (`maintenance.ts:176-179`) has exactly two parameters and no env slot; `:184` forwards
ambient `process.env` whenever `purge` is true, and `:183` makes `purge` default to true. So
`schedule(db, { intervalMs: 5 })` reads the machine's environment. The proposal's diagnosis at
`:438-440` is correct: without pinning, `expect(... /DELETE/i).toBe(false)` at `:448` passes only by
the accident of the variable being absent on the author's machine.

**Can the prescribed test reach its pass state? Yes** — verified against the real code:

- `maintenance.ts:101` — `maintain(db, env = process.env, now = Date.now())`.
- `maintenance.ts:51-54` — `retentionDays` returns `undefined` when the variable is absent
  (`Number(undefined)` → `NaN`, `Number.isFinite(NaN)` false), so `:103` skips `purgeOldParts`.
- `maintenance.ts:65-72` — `purgeOldParts` is the only `DELETE` emitter (`DELETE FROM part WHERE …`),
  which is what makes the negative assertion at `:448` meaningful rather than vacuous.
- `maintenance.ts:44-48` — `checkpoint` emits only `PRAGMA wal_checkpoint(TRUNCATE)`, no `VACUUM`,
  so the assertion at `:450` is satisfiable.
- `maintenance.ts:111` — `resetPurgeClock()` exists and is the established neighbour convention
  (`maintenance.test.ts:76`, `:83`, `:93`, `:140`).

**Is the `delete`/`finally` restore complete for both branches? Yes.** `:441` captures
`ambient = process.env.OPENCODE_PART_RETENTION_DAYS` before anything; `:442` deletes it; `:452-453`
restores in `finally` with an explicit `ambient === undefined` branch (stay deleted) and an `else`
branch (reassign). Both outcomes of "was it set?" are covered, and the restore runs even if the
`schedule`/sleep/`stop` body throws.

**Does the direct assertion match the neighbouring convention? Yes.** The second assertion at
`:459` calls `StorageMaintenance.maintain(main, {})` with an explicit env object, exactly as
neighbours do at `maintenance.test.ts:85`, `:98`, `:100`, `:101`, `:107`. It is placed *after* the
`finally`, so the ambient variable is already restored and the assertion reads no ambient state —
which is the stated purpose at `:455-456`. `spy()`/`db.queries` usage matches the existing
`schedule` tests at `:113-121`, including the `intervalMs: 5` + short-sleep shape at `:115-116`.

**Was the test file modified by the revision agent? No.**

- `packages/opencode/src/storage/maintenance.test.ts` — LastWriteTime **2026-08-16 13:48:34**, length
  9 166 bytes. The proposal's LastWriteTime is **2026-10-04 08:24:13**. The test file predates the
  revision by 49 days and is far outside any c4 window.
- Content still uses the colocated `src/` import: `maintenance.test.ts:11`
  `import { StorageMaintenance } from "./maintenance"`.
- `packages/opencode/src/storage/maintenance.ts` — LastWriteTime **2026-08-16 13:48:02**, also
  untouched.
- `packages/opencode/src/shell/shell.ts` (2026-07-29 09:05:05),
  `packages/opencode/src/tool/shell.ts` (2026-10-04 06:15:57),
  `packages/plugin/src/shell.ts` (2026-05-25 23:08:18). `INFERE:` the `src/tool/shell.ts` timestamp
  predates the P08 rewrite by >2 h and belongs to another workstream; P08 contains zero occurrences
  of the string `shell` (grep over the proposal, include `P08-retention-default.md` → 0 matches, run
  under the same positive-control conditions below), so no revision step could have touched it.

**Positive controls for the zero-result searches** (a zero match proves nothing alone):

| search | result | positive control, same path + same include |
|---|---|---|
| `from "\./maintenance"`, path `packages/opencode/src/storage`, include `maintenance.test.ts` | **1** match (`:11`) | same search itself is the positive control |
| `from "\./maintenance"`, path `packages/opencode/test`, include `maintenance.test.ts` | **0** matches | `*.test.ts` files under `packages/opencode/test` = **340**; under `packages/opencode/src` = **68** — the glob/enumeration form works in both trees |
| pattern `shell`, path `docs/harness-audit/proposals`, include `P08-retention-default.md` | **0** matches | pattern `maintenance\.test\.ts`, same path + include → **17** matches |
| `json_extract` type query, real DB | 108 702 rows | negative control `__no_such_type__` → 0 rows |

---

## Final verdict

**REVALIDATED-PASS_WITH_CHANGES**

All three residues open at c3 are fixed against real code and real data, not reformulated:
`P08-CENSUS-SQL-FREELIST-INVALIDE` and `P08-E13-CHIFFRE-50POURCENT-NON-REPRODUIBLE` are confirmed by
execution on the 4 GB live database, and `P08-REECRITURE-DEPENDE-ENV-AMBIANT` is confirmed against the
real `schedule()`/`maintain()` signatures, with the prescribed test provably able to reach its pass
state. One minor residual remains, and it does not block implementation.

| id | severity | statut | evidence | statement |
|---|---|---|---|---|
| `P08-CENSUS-SQL-FREELIST-INVALIDE` | blocking | closed | `P08-retention-default.md:258-259`, `:271-273`; `sqlite3 -readonly` EXIT=0 for `pragma_page_count` (`998429`, sole column `page_count`) and `pragma_freelist_count` (`46`, column `freelist_count`); old form EXIT=1 `no such column: freelist_count`; c4 SQL as extracted from the file EXIT=0 → `db=4089565184 free=4089376768` | The freelist column is read from the right table-valued function, and the expression executes on the real database. |
| `P08-E13-CHIFFRE-50POURCENT-NON-REPRODUIBLE` | blocking | closed | `P08-retention-default.md:160-163`; my SQL: 672 804 parts / 3 475 615 849 chars, reasoning 265 175 764 = 7.6285 %, tool 2 953 691 159 = 84.982 %, session reasoning 6 410 314 / 30 251 627 = 21.190 %, `998429*4096` = 4 089 565 184 | Every figure at `:160-163` reproduces independently to the stated digit; the false 50 % claim is gone from the assertion text. |
| `P08-E13-PROVENANCE-HONESTE` | material | closed | `P08-retention-default.md:165-171` | The provenance block labels the three legacy volumes as not re-measured and keeps 50 % only as a cited historical error. Quarantined, not smuggled back in. |
| `P08-REECRITURE-DEPENDE-ENV-AMBIANT` | blocking | closed | `maintenance.ts:176-179` (no env parameter), `:183-184` (`purge ? process.env : {}`), `:101`, `:51-54`, `:65-72`, `:44-48`, `:111`; `P08-retention-default.md:441-454`, `:459`; neighbours `maintenance.test.ts:76,83,85,93,98,100,101,107,113-121,140` | The rewriter's diagnosis of ambient-env dependence is correct, the pin+restore covers both branches, and the second assertion follows the explicit-env convention of the neighbours. |
| `P08-TEST-FICHIER-INTACT` | material | closed | `maintenance.test.ts` mtime `2026-08-16 13:48:34` vs proposal mtime `2026-10-04 08:24:13`; `maintenance.test.ts:11` still `from "./maintenance"`; `maintenance.ts` mtime `2026-08-16 13:48:02`; `packages/opencode/test` holds 340 `*.test.ts` vs 68 under `src` | The revision agent modified nothing under `packages/**`; the colocated `src/` layout and its import are intact. |
| `P08-E13-VOLUMES-LEGALES-PERIMEES` | minor | **open** | `P08-retention-default.md:159` states 4 089 565 184 bytes (measured, verified), while `:166-167` still carries « base de 5 209 Mo » and « une session de 485 étapes pèse 6,1 Mo » as un-re-measured legacy orders of magnitude. On-disk footprint including WAL and shm = **4 093 726 224** bytes = 4 093,7 Mo, still ~27 % below 5 209 Mo | §E13 is titled « re-mesuré sur la base réelle » yet still carries a stale file size that no accounting boundary rescues: it exceeds the WAL-inclusive footprint too. The provenance label makes this non-deceptive, but a reader scanning §E13 sees two irreconcilable sizes. The 50 % figure itself is properly retired — this is only the leftover volume text. |

## Handed back to

One residual, listed for the revision author:

1. **`P08-E13-VOLUMES-LEGALES-PERIMEES`** (minor, open) — delete the three dead volume figures at
   `:166-167` (« base de 5 209 Mo », « 1 064 394 243 octets de parts sur les 1 000 sessions les plus
   récentes », « une session de 485 étapes pèse 6,1 Mo ») or restate them with an explicit pointer to
   the superseded snapshot date, so §E13 does not present an unmeasured 5 209 Mo beside its own
   verified 4 089 565 184-byte measurement. The « base de 5 209 Mo » figure has no defensible
   accounting boundary: the WAL-inclusive footprint is 4 093 726 224 bytes (4 093,7 Mo), so it is
   ~27 % high even counting `-wal` and `-shm`. The other two figures I could not refute or confirm —
   they are volumes of a superseded snapshot and are retired by the same edit.

**This does not block implementation.** The three residues that gated implementation are closed on
executed evidence: the census SQL runs (`EXIT=0`, `db=4089565184`, `free=4089376768`), the retention
figures are reproducible to the stated digit, and the prescribed test at `:436-463` reaches its pass
state against the real `schedule()`/`maintain()` contract. Residual 1 is a documentation-hygiene item
in a block that is already honestly labelled.

Nothing else is owed on R1, R2 or R3.

`RESIDUES_REMAINING = 1` (derived from the single `open` row in the findings table).