# Tool search reliability

`tool_search` is the lean catalog's only escape hatch to reach a tool that is not
currently exposed. Its reliability is bounded by two separate stages, and they
must be measured apart:

1. **Retrieval** — is the right tool found?
2. **Activation** — is a requested tool actually exposed on the next model step?

## Retrieval

`ToolCatalog` (packages/opencode/src/session/tool-catalog.ts) ranks with an
explicit strength order before any lexical score:

| reason | meaning | priority |
| --- | --- | --- |
| `exact_id` | the query is the tool id verbatim | 3 |
| `normalized_id` | the query equals the whole id after `[\s_-]+`/case normalization | 2 |
| `id_token` | the query shares a token with the id | 1 |
| `lexical` | BM25 over `id + description` | 0 |

Ties break on the id, not the registration order, so a catalog reshuffle cannot
change the winner. `scoreBM25` is lexical only: the memory search layer forces
`vectorScore: 0`, so an activation policy cannot assume semantic matching.
Guarantee: an available, authorized tool is always reachable by its exact id
(`resolveExact`), regardless of lexical scoring. Ambiguous normalized ids are
reported, never guessed.

## Escape hatch

`tool_search` has three modes:

- `search` (default, backward compatible with `{query, limit}`) — natural
  language; results carry a `state` (`already_available` or `reserved`) and the
  `match` reason. Reserving a tool only guarantees it is requested; exposure is
  the next stage's responsibility.
- `browse` — paginated, stable id order over authorized tools; the fallback when
  lexical retrieval misses. Filters on explicit `source`/`server` metadata, not
  on parsing the id.
- `activate` — exact ids via `resolveExact`, used after a browse page.

## Benchmark

```
cd packages/opencode
bun run script/bench-tool-search.ts
bun test test/session/tool-search-benchmark.test.ts
```

The corpus separates three tiers:

- **identity**: query == id, expected 100% at rank 1.
- **lexical**: query shares a content token, expected >= 90% in the top 5.
- **paraphrase**: no shared token; measured and reported, no threshold. This is
  the current lexical ceiling. Raising it requires supplying embeddings to the
  retrieval layer, which is deliberately out of scope here.

## Known limits

- Activation is available on the next model step: one round trip of latency.
- In lean `enforce` mode a retrieval miss with no fallback exposes only the core
  toolset; `browse` + `activate` is the recovery path.
- There is no telemetry of search/activation success, so the real-world failure
  rate is not measured; the benchmark is a regression signal, not a metric.
- Exposure is verified only by the selection that builds the next request; a
  reservation can still be dropped by a later permission filter. Tracked as a
  residual risk.
