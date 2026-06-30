---
name: multi-shell-tasks
description: Use when running shell commands across platforms (pwsh vs bash/zsh) or when defining/running repeatable project tasks (build, test, lint, run) via opencode config `tasks` or a workspace tasks.json. Covers shell portability pitfalls and the `tasks` tool.
---

# Multi-Shell & Tasks

Two related concerns for every agent in this repo: (1) shell commands are **not
portable** across platforms, and (2) repeatable project commands should run
through the **`tasks` tool**, not hand-typed one-liners.

## 1. Shell portability

The active shell is resolved from config `shell` or the platform default. Never
assume bash — on Windows the default is **PowerShell 7 (pwsh)**.

| Concern            | POSIX (bash/zsh/sh)      | PowerShell (pwsh)                         |
| ------------------ | ------------------------ | ----------------------------------------- |
| Last/first N lines | `tail -n` / `head -n`    | `Select-Object -Last N` / `-First N`      |
| Search text        | `grep`                   | `Select-String`                           |
| List/find files    | `ls` / `find`            | `Get-ChildItem` (recurse: `-Recurse`)     |
| Env var            | `$VAR` / `${VAR}`        | `$env:VAR`                                |
| Command chaining   | `a && b`, `a \|\| b`     | `a; b` (pwsh7 also supports `&&` / `\|\|`) |
| Path separator     | `/`                      | `\` (but `/` usually works too)           |
| Quote interpolate  | double quotes            | double quotes; single = verbatim          |

Rules:
- **Detect the shell first**; do not paste bash idioms into pwsh.
- `grep`/`glob` from a tool's cwd may not resolve — prefer **absolute paths** or
  `Get-ChildItem`/`Select-String` on Windows.
- Prefer cross-platform tooling (bun, node, git) over shell-specific builtins.
- Quote any path containing spaces.

## 2. The `tasks` tool

Define repeatable commands once, run them anywhere. Sources (merged; config
wins on key collision):

1. The `tasks` key of opencode config:
   ```jsonc
   {
     "tasks": {
       "build":  { "command": "bun run build", "group": "build" },
       "test":   { "command": "bun test", "group": "test", "dependsOn": ["build"] },
       "lint":   { "command": "bunx tsc --noEmit", "group": "lint" }
     }
   }
   ```
2. A workspace **`tasks.json`** (VSCode-style `{ "version", "tasks": [...] }`),
   in the project root or `.vscode/`. `label`→name, `command`+`args`→command
   line, `group`/`options.cwd|env|shell` mapped onto the task.

Task fields: `command` (required), `description`, `cwd`, `shell`, `env`,
`group`, `dependsOn` (run in order first), `timeout` (ms, default 120000).

### Usage
- **List**: call the `tasks` tool with `action: "list"` to see what's defined.
- **Run**: call with `action: "run"` and `name: "<task>"`. Dependencies run
  first (cycle-guarded); the chain stops on the first non-zero exit. Live
  status (running/done/failed) streams to the UI; the final result lists each
  step's exit code, duration, and output.

### When to prefer tasks over raw shell
- The command is repeated (build/test/lint/run) or has dependencies.
- You want consistent cwd/env and visible per-step status.
- You want portability — the task's `shell` is resolved per platform.

Use a raw shell command only for genuine one-offs (a quick `git status`, an
`ls`), and even then respect the portability table above.
