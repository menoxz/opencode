# Parent-owned subagent cancellation

Use `task({ action: "cancel", task_id: "ses_..." })` to stop managed background
subagent work. `check` and `wait` also accept just `action` and `task_id`.
Legacy calls containing description, prompt and subagent_type remain valid.
Launch/resume (no action) still requires those three strings; validation runs
before permission requests or session creation. The provider-facing schema stays
a flat object for compatibility, with launch-only requirements enforced at runtime.

The target session must have `parentID === caller.sessionID`. Self, siblings,
grandchildren, unrelated and missing sessions are rejected before job access.
This ownership check is not bypassed by agent permission bypass flags.

Cancellation interrupts and awaits the managed BackgroundJob fiber, then invokes
the existing session cancellation operation and its normal cleanup. It performs
no direct OS process sweep/kill and does not stop arbitrary pre-existing servers,
delete sessions, undo file edits, or roll back commits. Managed command subprocesses
may be terminated by the existing cleanup. The reply includes persisted
partial transcript text; `check`/`wait` can retrieve it afterward. Cancellation
acknowledgement is protected from interruption while cleanup settles.

Completed, partial, blocked, error and already-cancelled jobs keep their original
status/results. Missing job records return `unknown` without claiming cancellation;
this is not a foreground-session or post-restart recovery API. Running cancellation
requires the normal `promptOps` context. Normal completion racing cancellation may
win and remains completed. Job cancellation returns its captured generation's
result rather than modifying a replacement job using the same ID. Task lifecycle
operations across definitions sharing the service serialize resume admission
against cancel per child session, without blocking unrelated children.

Tests (from `packages/opencode`):

```
bun test test/tool/task.test.ts test/background/job.test.ts --timeout 30000
bun typecheck
```
