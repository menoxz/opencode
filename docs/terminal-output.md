# Compact terminal results

`experimentalLeanOutputBudget` gates deterministic terminal compaction in the
processor's `tool-result` event and direct/aborted `completeToolCall` completion,
before message persistence. Both paths share normalization; processor-local weak
identity evidence bound to the part and exact output skips a second journal write
or polling update. Tool-supplied version markers are not trusted. Already settled calls
remain unchanged on duplicate completion. Abort/error metadata and attachments
are preserved. It applies to all agents when enabled, not just the lean profile;
the flag-off path is unchanged.

Supported tools: bash; MCP terminal command run/chain/status/wait, stream
start/read, terminal read, SSH run; developer native terminal execute/read/stream
read. Other control actions remain untouched. No model summary or delegation.

Results retain actual exit/duration when supplied, controls, a Unicode-safe
head/failure-context/tail excerpt, and a raw journal reference when reduced.
Unknown commands and payload fields receive previews, not inferred summaries.
Only recognized test formats for test/build commands drop obvious pass noise.
Exit zero never implies tests passed. Bash stdout, including JSON, is data, never
control metadata. Executor exit aliases take precedence over reported MCP exits;
executor failures cannot be cleared by reported success. MCP claims remain visible
as reported controls. Attachments and existing error metadata survive.

Journals use Truncate's seven-day retention. No referenced path is automatically
opened, even inside the Truncate directory or when supplied in metadata. Paths
are unverified upstream references, not authorization to read files. No stat,
size-check/read, symlink following or cross-session journal lookup occurs.
When received text is newly reduced, that entire received text is always saved
in a new journal labeled `Received output saved to:`; it is not claimed to be
the full upstream process log. `outputPath` points to this new journal when made;
`upstreamOutputPaths` retains upstream references. Missing/expired references do
not suppress journaling. An upstream excerpt cannot recover omitted evidence;
there is no trusted journal registry. This can store an extra received excerpt
alongside an existing upstream journal, deliberately favoring evidence integrity.

Polling uses instance-disposed state shared across processor handles, keyed by
session, tool and the complete scalar query. Only explicit command/terminal IDs
(or a target matching a returned terminal ID) qualify. Streams require an
explicit cumulative declaration. Strictly growing exact prefixes produce a delta;
equal, rotated, delta-only and ambiguous results receive ordinary previews.
Failed results always replay failure context, not just a delta. Returned handle
changes also invalidate prefix reuse; unknown duration units are not labeled ms.
The latest complete raw response is journaled on reduction. At most 16 snapshots
of 128 KiB each live for up to 30 minutes (expired on next use). Restarts/eviction
simply disable delta optimization. Independent command runs never deduplicate.

The terminal text target is 4,000 UTF-8 bytes / 120 lines (2,000 bytes for
recognized non-failing test output). Operational controls are retained rather
than discarded to satisfy a cosmetic budget. Historical summary mode replays the
compact operational summary and journal; explicit off, recent and pinned results
retain their existing behavior.
