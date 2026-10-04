# Decision-focused terminal commands

The shared environment/shell guidance and every shell tool profile instruct agents to limit
output at the source, rather than relying on tool-result truncation. This also
applies to MCP terminal commands and agents with a custom prompt: the environment
guidance is injected independently of the overridable base agent prompt.

- Prefer native summary/quiet reporters, scoped queries and selected fields:
  `git diff --stat`, `git status --short`, or `gh --json` with explicit fields.
- Do not print full stack traces or debug logs by default. Keep the error
  message, relevant file/line, failure count and actual command exit code.
- When a command is noisy, capture stdout and stderr to a diagnostic log,
  wait for completion and return a bounded summary plus its path. Preserve
  the native exit status before any formatting command (`$LASTEXITCODE` on
  PowerShell). Logs remain subject to normal permissions and secret handling.
- Inspect a targeted trace when needed to diagnose the failure. Avoid piping
  a live producer to an early-closing truncator: that can change execution or
  obscure the actual failure. Never discard stderr to make output look clean.

Automatic terminal compaction is a fallback, not proof that a command was
appropriately scoped. These are model instructions, not an enforced guarantee
that every generated command will be concise.

Validation: `bun test test/tool/shell-output-prompt.test.ts` from
`packages/opencode` verifies the shared prompt and all four shell profiles.
