# P08 — revalidation cycle 7 (independent)

Target: `docs/harness-audit/proposals/P08-retention-default.md` (535 lines).
Scope of this cycle: only `P08-C5-CENSUS-ERROR-CONTRACT`, raised by cycle 6, plus
regression control on everything cycle 4-6 closed.

## Final verdict

**REVALIDATED-PASS**

`RESIDUES_REMAINING = 0`.

Cycle 6's blocking contradiction is resolved. Option A was implemented as described and
the §4.1 prescription and the §7 test now describe the same function. No new contradiction,
no regressed figure, no mis-declared anchor.

## Why test 4 is now reachable — the one sentence

Both `query()` calls sit inside the `try` opened at `:251` and closed at `:264`, so a throwing
handle is intercepted before it can cross the function boundary and the handler returns the
neutral `Census` at `:265` — the exact object §7 test 4 (`:410-412`) demands, with « pas de
throw » satisfied by construction rather than by a weakened assertion.

Evidence, `census()` body verbatim (`:248-267`):

```
248: /** Read-only. Emits SELECT statements exclusively: no DELETE, no VACUUM, no mutating PRAGMA.
249:  *  Ne propage jamais (§7, test 4) : un handle qui lève rend un `Census` vide (0 = verrouillé ou vide). */
250: export function census(db: Runner, before: number): Census {
251:   try {
252:   const grouped = query(
253:     db,
254:     `SELECT json_extract(data,'$.type') AS type, count(*) AS parts, COALESCE(sum(length(data)),0) AS chars
255:      FROM part WHERE time_created < ${Math.floor(before)}
256:      GROUP BY type`,
257:   )
258:   const sizes = query(
259:     db,
260:     `SELECT (SELECT page_count FROM pragma_page_count) * (SELECT page_size FROM pragma_page_size) AS db,
261:             ((SELECT page_count FROM pragma_page_count) - (SELECT freelist_count FROM pragma_freelist_count)) * (SELECT page_size FROM pragma_page_size) AS free`,
262:   )
263:   // ...reduce grouped into Census
264:   } catch {
265:     return { totalParts: 0, byType: {}, dbBytes: 0, freelistBytes: 0 }
266:   }
267: }
```

Escape-path audit: the only calls in the body are the two `query()` at `:252` and `:258`,
and `:263`'s elided reduce sits *inside* the `try`. Both the success-path `Census` and every
failure therefore terminate within `:251`–`:266`. No path lets an error escape `census()`.
Not blocking.

`throw` occurrences in `:248-268` = **0**, identical-form positive control
`try {` in the same range = **1** (`rg -n -F`, range filter `^(24[89]|25[0-9]|26[0-8]):`).

## SQL literals — extracted from the file, not retyped

Extraction: `Get-Content` lines 254-256 and 260-261, backticks stripped, `${…}` bound to a
constant, trailing source comma stripped, executed through `sqlite3 -readonly` against
`C:\Users\jeanl\.local\share\opencode\opencode.db`.

```
SELECT (SELECT page_count FROM pragma_page_count) * (SELECT page_size FROM pragma_page_size) AS db,
       ((SELECT page_count FROM pragma_page_count) - (SELECT freelist_count FROM pragma_freelist_count)) * (SELECT page_size FROM pragma_page_size) AS free
```

→ **EXIT=0**, `db=4089565184 free=4089376768`. Matches R1's mandated pair.

Negative control, same text with only `pragma_freelist_count` → `pragma_page_count`:
**EXIT=1**, `Error: in prepare, no such column: freelist_count`.

`SELECT * FROM pragma_page_count` → EXIT=0, single column `998429`;
`SELECT * FROM pragma_freelist_count` → EXIT=0, `46`.
Page geometry → EXIT=0, `PC=998429 PS=4096 PROD=4089565184 FREE=46`.

Broken form absent from the file: `freelist_count FROM pragma_page_count` = **0** hits;
identical-form positive control `freelist_count FROM pragma_freelist_count` = **1** hit.

## Line count and anchor arithmetic

`LINES=535` (`Get-Content … .Count`). The declared +5 (530→535) is fully accounted for, with
no unexplained line:

| Added | Location | Count |
|---|---|---|
| JSDoc line | `:249` | +1 |
| `try {` | `:251` | +1 |
| `} catch {` | `:264` | +1 |
| neutral `return` | `:265` | +1 |
| *(elided reduce at `:263` is pre-existing, not added)* | | |
| **total** | | **+5** |

Old span `:249-262` = 14 lines → new `:250-267` = 18 lines = +4, plus the +1 JSDoc line that
pushed the definition from `:249` to `:250`. The two figures reconcile exactly.

Every declared anchor verified at its new position:

| Anchor | Verdict | Observed |
|---|---|---|
| `:249-262`→`:250-267` | correct | `export function census` at `:250`, closing `}` at `:267` |
| `:405-407`→`:410-412` | correct | test 4 occupies `:410`, `:411`, `:412` |
| `:379-488`→`:384-493` | correct | `:384` = `## 7. Tests`; `:494` = `## 8. Effort` |
| `:414-422`→`:419-427` | correct | `:419` = `test("purge:false never emits a DELETE…`; `:427` = `})`; fence `:428` |
| `:434-467`→`:439-472` | correct | `:439` = `test("la purge reste impossible…`; `:472` = `})`; fence `:473` |
| unmoved `:158`–`:163`, `:165-171`, `:168-169`, `:184-185`, `:152-187` | correct | all read in place, §E13 intact |

**No anchor is wrong.**

## `:159` and the three percentages, quoted

`:159-163` verbatim:

```
159: (`sqlite3 -readonly`, `EXIT=0`) : fichier de **4 089 565 184 octets** (`page_count = 998429`,
160: `page_size = 4096`) ; **672 804 parts** et **3 475 615 849 caractères** au total. La session la
161: plus lourde en `reasoning`, `ses_106da869affe6n5CLpUQUcAyj4`, porte **6 410 314 caractères** de
162: `reasoning` sur **30 251 627 caractères** de parts au total, soit **21,2 %**. Sur l'ensemble de
163: la base, `reasoning` ne pèse que **7,6 %** des caractères, contre **85,0 %** pour `tool`.
```

Reproduced from the live DB, all EXIT=0:
`TOTALS parts=672804 chars=3475615849` · per-type `reasoning 265175764` /
`tool 2953691159` · session `SES r=6410314` / `SES all=30251627` · `998429 * 4096 = 4089565184`.

Derived: reasoning **7.6296 %**, tool **84.9832 %**, session **21.1900 %**. The proposal's
published one-decimal figures (7,6 % / 85,0 % / 21,2 %) are the correct roundings.

> Info, not a proposal defect: the brief's own four-decimal values (7.6285 %, 84.982 %) are
> each ~0.001 low against the measured ratios. The document publishes only the rounded forms,
> so nothing in the proposal is wrong. R2's raw counts all reproduce exactly.

## Read-only status and wiring

Within the census body `:250-267`, using `rg -n -F` with the range filter
`^(25[0-9]|26[0-7]):`, whole-document totals as the positive control:

| Term | Body | Document | Verdict |
|---|---|---|---|
| `DELETE` | 0 | 10 | absent from census |
| `VACUUM` | 0 | 9 | absent from census |
| `wal_checkpoint` | 0 | 4 | not introduced |
| `INSERT` | 0 | 1 | absent |
| `UPDATE` | 0 | 1 | absent |
| `DROP` | 0 | 0 | absent |
| `query(` | **2** | 2 | positive control passes |

Table-valued read functions present: `pragma_page_count` (7), `pragma_freelist_count` (5),
`pragma_page_size` (4). `:270-272` states in the document that all three are read-only
functions, not mutating `PRAGMA`. Census remains **SELECT-only**.

Wiring — `census(` occurs at exactly three places: `:250` (definition), `:304` (the separate
read-only CLI path), `:395` (the test). Positive control `export function census` = 1.
`:292` states « Câblé **hors de `maintain()`** et **hors de `schedule()`** ». `maintain()`
(`maintenance.ts:101-108`) calls only `purgeOldParts()` and `checkpoint(db)`; it never
references `census`. The census therefore cannot run on the `checkpoint()` path that emits
`PRAGMA wal_checkpoint(TRUNCATE)` (`maintenance.ts:44-48`, the write at `:45`).

## §E13 volume coherence

No two irreconcilable sizes. The two large figures are explicitly *different quantities*,
each labelled at its own line, and they reconcile arithmetically:

- `:159` `4 089 565 184 octets` — the `db` file alone (`Get-Item`, EXIT=0: `4089565184`).
- `:168` `4 093 726 224 o = 4 093,7 Mo` — the `db`+`-wal`+`-shm` **trio**, with its own
  decomposition printed at `:169`: `4 089 565 184 + 4 128 272 + 32 768`. Measured trio:
  `db=4089565184 wal=4128272 shm=32768 sum=4093726224`. Sums exactly.
- `:169` « 5 209 Mo » explicitly **abandonné** — a struck figure, not a competing claim.
- `:170` 1000 most recent sessions (`time_created DESC`) = `1 988 649 418 o` / `383 487 parts`.
  Reproduced EXIT=0 by the same bare-column ordering the document names: `BARE parts=383487
  chars=1988649418`.
- `:171` « 485 étapes / 6,1 Mo » **supprimé**. `SELECT count(*) … HAVING count(*)=485` →
  EXIT=0, `N485=0`; identical-form positive control `HAVING count(*)=10939` → EXIT=0, `N10939=1`.

Provenance block `:165-171` coherent: each struck figure is named, marked abandoned, and
paired with the measurement that replaced it plus the exit code that produced it.

## R3 and the Option-A justification

- `schedule()` takes no env parameter: `maintenance.ts:176-179` is
  `schedule(db: Runner, options: { intervalMs?: number; purge?: boolean } = {})`.
- `maintenance.ts:184` is `maintain(db, purge ? process.env : {})` — `process.env` forwarded.
- Both `finally` outcomes covered in the proposal's test: `:456` `} finally {`, `:457`
  `if (ambient === undefined) delete process.env.OPENCODE_PART_RETENTION_DAYS`,
  `:458` `else process.env.OPENCODE_PART_RETENTION_DAYS = ambient`. Both the *undefined* and
  the *defined* ambient branch are present.
  - `finally` in `maintenance.ts` = **0** hits; identical-form positive control `try` = **3**
    hits. The source has no `finally` at all; the clause concerns the proposal's test code.
  - `finally` in the proposal = **2** hits (`:443` comment, `:456` code); identical-form
    positive control `try {` = **2** hits.
- Option A's precedent is real: `maintenance.ts:44-48` already absorbs a busy database via
  `attempt(() => execute(db, "PRAGMA wal_checkpoint(TRUNCATE)"))` at `:45` and returns the
  neutral `false` at `:47`. `census()` now follows the established house pattern of degrading
  to a neutral value instead of propagating. Cited at `:99` (E8) and `:442`.

## C-54 is accurate and not a P08 residue

`docs/harness-audit/CORRECTIONS.md:63` states « base **3 900 Mo** (et non 5 209) ».
`Get-Item` on `.local\share\opencode\opencode.db` → `4089565184` bytes = `3900.1` MiB: C-54's
figure reproduces exactly. `opencodev2\opencode.db` → `5646573568` bytes = `5385` MiB, matching
neither C-54's 3 900 Mo nor the struck 5 209 Mo. Cycle 4's flag stays withdrawn.

> Info: that second path is a live database and grew between cycles (the brief recorded
> `5 636 284 416` / `5 375,2 Mo`). It is not referenced by any figure the proposal asserts, so
> the drift changes no conclusion. Flagged only so the next revalidator does not mistake the
> difference for a discrepancy.

## Findings

| id | severity | statut | evidence | statement |
|---|---|---|---|---|
| P08-C5-CENSUS-ERROR-CONTRACT | blocking→none | **closed** | proposal `:251`, `:264`, `:265`, `:410-412` | §4.1 and §7 test 4 now agree. Both `query()` calls are inside the `try`; the `catch` returns the neutral `Census`, so « pas de throw » holds by construction and test 4 is reachable. |
| P08-C6-JSDOC-NON-PROPAGATION | minor | **closed** | proposal `:249` | The non-propagation contract is now stated in the JSDoc, and matches the implementation at `:264-265`. |
| P08-C7-LINE-COUNT | minor | **closed** | `LINES=535`; `:249`/`:251`/`:264`/`:265` | 530→535 is real and fully accounted for: +1 JSDoc, +1 `try`, +1 `catch`, +1 `return`. |
| P08-C8-ANCHORS | minor | **closed** | `:250`, `:267`, `:384`, `:410`, `:419`, `:439`, `:472`, `:494` | All five moved anchors and all unmoved anchors land on the content claimed. No anchor is wrong. |
| P08-C9-SQL-UNCHANGED | material | **closed** | `EXIT=0` `db=4089565184 free=4089376768`; `EXIT=1` `no such column: freelist_count` | Literals extracted from `:254-256`/`:260-261` run clean; the R1 negative form fails. The exact +5 delta also proves nothing inside the literals changed. |
| P08-C10-READ-ONLY | material | **closed** | body counts 0 for `DELETE`/`VACUUM`/`wal_checkpoint`/`INSERT`/`UPDATE`/`DROP`; control `query(`=2 | Census remains SELECT-only, no mutating `PRAGMA`, no `wal_checkpoint` introduced. |
| P08-C11-WIRING | material | **closed** | `:250`, `:292`, `:304`, `maintenance.ts:101-108` | `census(` is defined once and reached only from the separate CLI path and the test; never from `maintain()`/`schedule()`. |
| P08-C12-E13-VOLUMES | minor | **closed** | `:159`, `:168-171`; `sum=4093726224`; `BARE parts=383487 chars=1988649418`; `N485=0` / `N10939=1` | No two irreconcilable sizes: `db` alone and the `db+wal+shm` trio are distinct labelled quantities that sum correctly. Struck figures are marked abandoned and replaced by measured ones. |
| P08-C13-C54 | minor | **closed** | `CORRECTIONS.md:63`; `Get-Item` → `4089565184` = `3900.1` MiB | C-54 is accurate. It describes the audited `db` file; cycle 4's residue flag remains withdrawn. |
| P08-C14-PCT-ROUNDING | info | **out_of_scope** | proposal `:163`; measured 7.6296 % / 84.9832 % / 21.1900 % | The document's 7,6 % / 85,0 % / 21,2 % are correct roundings. The brief's four-decimal variants sit ~0.001 low; no proposal text is affected. |
| P08-C15-V2-DB-DRIFT | info | **out_of_scope** | `Get-Item` → `5646573568` bytes = 5385 MiB | A live path grew since cycle 4. No figure the proposal asserts depends on it. |

**Cycle-6 open findings: 1. Cycle-7 residual findings: 0.**

`RESIDUES_REMAINING = 0`, justified as follows: the only finding cycle 6 left open was the
error-contract contradiction, and it is closed by direct observation of the implemented body
(`:251`/`:264`/`:265`) against the unchanged test (`:410-412`). Every other item on the
contract re-measured against the live database and the live source, and every declared figure
reproduced. The two entries above are `info`/`out_of_scope`: neither is a defect in the
proposal, neither blocks implementation, and neither is a residue of P08 — one concerns the
brief's rounding, the other a file outside the proposal's evidence chain.

### Inference marked

- **INFERE:** « The SQL literals are byte-identical to the pre-revision version » and
  « §7 test 4 is byte-unchanged ». `git` is forbidden for this cycle and the previous
  revision is not on disk, so byte-identity cannot be diffed directly. Verify with
  `git diff -- docs/harness-audit/proposals/P08-retention-default.md` once version control is
  permitted: the diff should show exactly five added lines, at `:249`, `:251`, `:264`, `:265`
  and one context shift, with zero modifications inside `:254-256` and `:260-261`. The
  arithmetic corroborates it — a +5 delta accounted for line-for-line by the four declared
  insertions leaves no room for an edit inside the literals — and the literals execute
  `EXIT=0` with R1's mandated output.

## Handed back to

The P08 implementation pass. The proposal is implementable as written: `census()` has a
single, coherent, non-propagating error contract, emits read-only `SELECT` statements only, and
is wired on a call path disjoint from `maintain()`/`schedule()`. No change is requested.

Two instructions for whoever implements it:

1. Preserve the `try`/`catch` shape of `:251`–`:266` verbatim. The catch at `:264` is load-bearing
   for §7 test 4 (`:410-412`); any future edit that lets a `query()` failure escape re-opens a
   blocking finding.
2. Reproduce the measurements in this verdict rather than retyping them from the proposal — the
   percentage and volume figures were taken from `sqlite3 -readonly` against the live database,
   and the brief's four-decimal variants are known to drift (P08-C14).