# Consecutive outgoing request prefix diagnostics

Enable only for a new controlled run: `OPENCODE_CACHE_PREFIX_DIAGNOSTICS=1`.
Default is off. `cache prefix comparison` uses the existing info log with a
session identifier, boundary, status, item counts and first changed section.
It never emits prompt text, tool names/arguments, paths, keys or fingerprints.
Do not enable the unrelated raw `OPENCODE_CONTEXT_FILE` capture for this purpose.

Snapshots use HMAC-SHA256 with an unexported random process key. They retain only
section labels and fingerprints, never payload references. Limits: 32 sessions
per instance, 1024 items/request, 8 MiB of string/binary input and 65536 traversal
nodes, depth 64; 10 minute idle expiry (swept every minute), session deletion and
instance disposal cleanup. No disk snapshots. An incomplete comparison reports
`bounded`, never equality/append beyond the inspected region. A changed inspected
item remains conclusive. Every visited property consumes a node, including
undefined properties omitted from JSON. Top-level projections use descriptors,
not full entries/spread, capped at 256 properties and 64 KiB of key text.
Accessors, throwing traps and budget exhaustion abort the projection; the abort
marker invalidates consecutive equality/append evidence.

**Engine limitation:** JavaScript enumeration may materialize own keys before
the first loop iteration. Arbitrary Proxy `ownKeys` traps can allocate or never
return; synchronous JavaScript cannot interrupt them. These are application
traversal/retention bounds, not hard engine-memory/CPU sandbox guarantees. Throwing
traps fail closed and getters are not intentionally invoked. Tests cover throwing
Proxies and incomplete comparisons. Inputs must be lowered request data, not
untrusted executable objects; stronger isolation requires a process boundary.

Extraction/hash/log-observer exceptions are caught only inside diagnostics,
without logging exception content. Actual compile/auth/transport errors propagate.

## Boundaries and interpretation

- AI SDK: `cache-prefix-adapters.ts:aiSDK` wraps the actual `doStream`, after the
  session's `ProviderTransform.message` middleware and SDK message/tool lowering.
  This is SDK call data, not vendor wire bytes. Headers/abort signals are excluded.
  Prompt order (including interleaved system messages) is preserved.
- Native: `native-runtime.ts:stream` passes an optional observer to `LLMClient.stream`.
  `route/client.ts` observes the single actual compile after tool lowering and
  transport preparation. It observes the
  serialized protocol body before transport. Transport envelopes (e.g. WebSocket)
  are not included. The offline native integration test compares it to the full
  transmitted HTTP body, including `stream:true`; undefined fields are omitted.
  This adapter does not request automatic
  multi-round continuation (`stopWhen` is absent). Transport retries are not
  separately observed. No diagnostic prepare call remains: auth/compile execute
  once. HTTP exposes the final overlay-applied JSON body from that preparation;
  other transports fall back to the compiled protocol body. Stateful-auth tests
  verify one authentication, one fetch, and equality with the transmitted body
  including an HTTP overlay, even when the observer throws. No session import is
  introduced in the llm package.

Comparison order is **options, system, tools, messages**, a diagnostic projection,
not the vendor's tokenization/serialization order. A common item count is not a
byte/token cache prefix. Appended conversation is `append`; changed options,
system, tools or message items report the first changed section. AI SDK system
items retain their position and are labeled `system`; OAuth instructions in
provider options are `options`. `complete=false` marks even bounded baselines.
Changing runtime starts a baseline rather than comparing incompatible formats.
Concurrent calls are compared in boundary-observation order, not response order.

## Inspected sources and limits of attribution

- `session/prompt.ts:2141-2250`: environment/instructions, preloaded skills,
  last-user-dependent skill summaries, security availability, task contract, goal
  reminder/advisories are assembled in that order. The contract cache key includes
  its full state; caching this computation does not make its text static.
- `session/system.ts:139`: environment includes the current date. No edit made.
- `session/llm/request.ts:75-99`: provider/agent prompt precedes assembled system
  fragments and user system text. Plugins may rewrite the first block; only an
  unchanged header allows consolidation of later blocks. OAuth places instructions
  in provider options (`:113`). No instruction relocation/reordering was attempted.
- `session/llm.ts` reads goal/todos through `WorkingState.current`; request assembly
  attaches that bounded card to the existing conversation tail, not a new system
  message. This can change a tail item legitimately.
- `session/tools.ts:131-144,238-387` collects built-ins and MCP selections;
  `session/llm/request.ts:191` already sorts the final tool catalog. No proven
  avoidable catalog-order churn required a correction. Catalog membership, schemas
  and descriptions can still change; sorting cannot stabilize them.
- `provider/transform.ts:345-391,434-448` marks first two system and last two
  non-system messages for applicable Anthropic-family caching, excluding gateway.
  Moving cache markers can themselves change structural items. `:1052-1063,1092`
  sets `store=false` for selected SDKs and session cache keys for OpenAI/Azure or
  explicit `setCacheKey`; storage policy is not a cache guarantee.

The reported historical plateau of 14163 cached input tokens while input grew is
an observation supplied by the user, not a reproduced result. No raw historical
outgoing snapshots are proven available; no live messages were read or session
changed/stopped. Its first changed fragment and root cause cannot be established
from current source or token counters. Dynamic system sources are structurally
known, but attribution to contract vs skills vs plugins requires future bounded
instrumentation at those source seams. This change promises neither a fixed cache
rate nor vendor cache hits. Next dependency: opt-in observations from an explicitly
authorized new run, correlated with provider usage, without raw payload capture.
