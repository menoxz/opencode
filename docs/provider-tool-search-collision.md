# Local tool_search versus OpenAI hosted tool search

## Verified failure (2026-09-07)

An OpenAI Responses-compatible provider rejected a continued request with
`input[57] missing required field arguments`. Persisted tool arguments in the
affected session were present. No session contents or credentials are needed
to reproduce the failure.

In `@ai-sdk/openai` 3.0.53, Responses conversion treats a tool call named
`tool_search` as hosted tool search even when its definition is a local function.
The hosted schema permits an absent `arguments` field, so a local input such as
`{query: "read"}` becomes a `tool_search_call` without `arguments` on the wire.
Local JSON results can additionally fail hosted output validation (`tools`
array missing). This is a name collision, not proof of lost arguments or a
model producing an invalid function input.

Evidence: the installed SDK's real `doGenerate` conversion with a synthetic
fetch capture emitted `tool_search_call` without `arguments` for the local
function definition and text result. No external inference call was made.

The compatibility boundary must distinguish local functions from hosted
provider tools, preserve the original arguments/results, and restore local
tool names on responses. Altering stored history, inserting fake arguments,
or retrying the identical invalid payload does not solve this collision.

## Implemented compatibility boundary

`packages/opencode/src/provider/responses-tool-search.ts` wraps OpenAI/Azure
Responses models when obtained from `Provider.getLanguage`. Local functions
use a collision-free wire alias; definitions, forced tool selection and replayed
calls/results agree on that alias. Streaming and nonstreaming responses restore
the local name before execution or persistence. Hosted provider tools and other
model adapters retain their original behavior.

Existing sessions are repaired on replay by the updated executable; their
stored arguments and results are not rewritten. An already running older
process needs to be relaunched with the updated binary before it benefits.

Tests: `bun test test/provider/responses-tool-search.test.ts` from
`packages/opencode`. The suite includes an unwrapped failure control using the
installed SDK, exact fixed wire arguments/results, streamed name restoration,
hosted/local coexistence and historical calls without a current definition.
