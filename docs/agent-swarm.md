# Agent Swarm Mode

An opencode agent mode that turns one mission into a coordinated swarm of parallel
worker agents, then aggregates their results into a single validated delivery.

There are two implementations of the mode:

1. **Native mode (recommended)** — built into the core runtime
   (`packages/opencode`): a real `swarm` tool that spawns sub-agent sessions
   in-process, runs them in parallel waves, and aggregates the results. Typed,
   unit-tested, permission-aware, observable via bus events. Enabled with
   `OPENCODE_EXPERIMENTAL_SWARM=true` (or `OPENCODE_EXPERIMENTAL=true`).
2. **Config-level mode** — a hot-reloadable plugin implementation
   (`.opencode/agent/*.md` + `.opencode/plugin/swarm.ts`) that dispatches
   workers as separate `opencode run --headless` subprocesses. No core changes
   required. See the "Config-level alternative" section below.

## Native mode (recommended)

### Components

| File | Role |
|---|---|
| `packages/opencode/src/tool/swarm.ts` | the `swarm` tool — wave planning, parallel execution, aggregation, bus events |
| `packages/opencode/src/agent/prompt/swarm.txt` | the `swarm` agent system prompt — the orchestrator decision tree |
| `packages/opencode/src/agent/agent.ts` | registers the native `swarm` agent (mode: primary) behind `experimentalSwarm` |
| `packages/opencode/src/effect/runtime-flags.ts` | `OPENCODE_EXPERIMENTAL_SWARM` flag |
| `packages/opencode/src/tool/registry.ts` | exposes the `swarm` tool when the flag is on |
| `packages/opencode/test/tool/swarm.test.ts` | unit + integration tests |

### Architecture

```
prompt ──▶ swarm agent (orchestrator)
            │ 1. decide: swarm or direct work?  (decision tree in swarm.txt)
            ▼
        decompose ──▶ tasks[] {id, description, prompt, subagent_type, depends?, optional?}
            │ 2. planSwarm(): topological waves (independent tasks share a wave)
            ▼
        execute waves ──▶ per task: child session under the parent (in-process)
            │              permissions derived from the subagent type
            │              bus events: swarm.started / swarm.task / swarm.completed
            ▼
        renderSwarmReport ──▶ <swarm> aggregated report (per-task status, output, errors)
            │ 3. aggregate: the orchestrator validates and synthesizes
            ▼
        final delivery in the conversation
```

Key properties:

- **Parallelism** — tasks in the same wave run concurrently
  (`concurrency`, default 4). `depends` edges push tasks into later waves.
- **Failure isolation** — a failed task does not kill the swarm: dependents of
  a failed required task are skipped (with the reason); `optional: true` tasks
  never block their dependents.
- **Session tree** — every task runs in its own child session
  (`[swarm] <description> (@<agent>)`), reviewable/resumable like `task`
  sub-agents. Background swarms run as one background job whose container
  session holds all children.
- **Permissions** — the tool asks for `swarm` + each `subagent_type`; child
  sessions derive permissions from the parent and the subagent type (the same
  machinery as the `task` tool); `swarm`/`task`/`todowrite` are disabled inside
  workers unless explicitly allowed.
- **Abort support** — aborting the run cancels every running child session.
- **Observability** — `swarm.started`, `swarm.task`, `swarm.completed` events
  are published on the native bus.

### Usage

```powershell
# enable the mode (once, per shell or in the environment)
$env:OPENCODE_EXPERIMENTAL_SWARM = "true"

# interactive: switch to the swarm agent and state the mission
opencode                       # then /agent swarm (or configure default_agent)
```

The `swarm` agent decides when a swarm is worth it (2–8 independent work
items), decomposes the goal, calls the `swarm` tool with the tasks, and
synthesizes the aggregated report into the final answer.

Note: if the workspace defines its own `.opencode/agent/swarm.md`, that
config-level agent overrides the native prompt (config wins over native, by
design). Delete it to use the native protocol.

### Testing

```powershell
bun test test/tool/swarm.test.ts test/agent/agent.test.ts   # from packages/opencode
bun typecheck
```

## Config-level alternative (plugin-based)

### Components

| File | Role |
|---|---|
| `.opencode/agent/swarm.md` | the mode itself — orchestrator system prompt with the full protocol |
| `.opencode/agent/swarm-worker.md` | worker contract — one bounded task, mandatory `subagent_result` bus report |
| `.opencode/plugin/swarm.ts` | orchestration machinery — `swarm_plan`, `swarm_dispatch`, `swarm_status`, `swarm_report` |
| `.opencode/plugin/swarm-lib.ts` | pure helpers (validation, waves, aggregation) — unit-tested |
| `.opencode/command/swarm.md` | `/swarm <mission>` slash command |
| `.opencode/tests/swarm.test.ts` | unit tests for the pure orchestration logic |

All components are config-level: no core runtime change, hot-reloadable
(agents via the config watcher, plugins via `opencode plugin reload`).

### Architecture

```
mission ──▶ swarm agent (orchestrator)
              │ 1. decompose
              ▼
        swarm_plan ──▶ .swarm/<run_id>/manifest.json   (tasks, deps, files)
              │ 2. dispatch (waves, concurrency 3)
              ▼
        swarm_dispatch ──▶ N × `opencode run --agent <type> --headless`  (parallel)
              │              each worker: stdin prompt, stdout headless_result JSON
              ▼
        .swarm/<run_id>/results/<task_id>.json + .md   (per worker)
              │              + webhook trigger on :8645 (opencode-trigger daemon)
              ▼
        swarm_report ──▶ .swarm/<run_id>/report.md     (aggregated, validated by orchestrator)
              │ 3. coordinate: bus_send/bus_receive/trigger_list (inter-agent bus)
              ▼
        final delivery in the workspace
```

### Protocol (reproducible)

1. **Decompose** — the orchestrator splits the mission into 2–6 self-contained
   tasks (`id`, `agent`, `prompt`, `depends_on`, `files`, `timeout_s`). Two tasks
   never claim the same file; dependencies are minimized (each dependency costs a
   parallelism wave).
2. **Plan** — `swarm_plan` validates (ids, cycles, file conflicts) and records the
   manifest. Returns the `run_id` and the wave schedule (Kahn topological waves).
3. **Dispatch** — `swarm_dispatch` executes the waves. Tasks in the same wave run in
   parallel as independent `opencode run --headless` sessions (one subprocess per
   task, prompt piped via stdin to avoid command-line length limits, per-task
   timeout with kill, orchestrator abort support). Results are written per task.
4. **Coordinate** — workers send `subagent_result` on the inter-agent bus
   (`bus_send_as`); the dispatch tool posts completion webhooks to the
   opencode-trigger daemon (`http://127.0.0.1:8645/webhook/swarm`); the orchestrator
   polls `swarm_status`, drains `bus_receive`, acks triggers.
5. **Aggregate** — `swarm_report` builds the aggregated report. The orchestrator
   then VERIFIES every claimed deliverable (files, tests, exit codes) before
   integrating; failed tasks get one reduced-scope retry.
6. **Deliver** — final answer with a task→status→deliverable table, the validation
   evidence, and an explicit list of what was not addressed.

### Run layout

```
.swarm/<run_id>/
├── manifest.json              mission + tasks (plan phase)
├── results/
│   ├── <task_id>.json         parsed headless_result + status + duration
│   └── <task_id>.md           human-readable result
└── report.md                  aggregated report
```

`.swarm/` is gitignored scratch space; deliverables land in the workspace.

### Usage

- Interactive: switch to the `swarm` agent (`/agents`) and state the mission, or
  use the slash command: `/swarm <mission>`.
- Headless: `opencode run --agent swarm --headless --dir <worktree> "<mission>"`.
- Watch: `swarm_status` (list runs / per-task state), `trigger_last` (async
  completions), `bus_receive` (worker messages).

### Prerequisites / knobs

- The dispatch tool resolves the opencode binary via `OPENCODE_BIN`, then the
  current executable, then the fork's `dist/bin`, then `opencode` on PATH.
- Worker sessions inherit the environment (model/auth/MCP from global config).
- Trigger webhooks require the opencode-trigger daemon on :8645 (optional —
  notifications are best-effort, the run never depends on it).
- Tune `concurrency` (default 3, max 8) and per-task `timeout_s` (default 600).
