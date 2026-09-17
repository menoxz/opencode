# Session work plans

Non-trivial work uses three separate layers:

1. The task contract defines the complete outcome and verifiable Definition of Done.
2. `todowrite` records plan phases and detailed steps for the active phase.
3. Every todo change persists the complete plan in the session plan file under `.opencode/plans/` (or the global data directory outside a VCS worktree).

The prompt discovers that plan through a compact virtual `AGENTS.md` reference (`opencode://session/<id>/plan`). Only the reference, progress counts, and active phase are injected each turn; the full plan remains available on disk without consuming context repeatedly.

Continuation is action-oriented. Open objectives and unfinished todos describe progress but do not by themselves restart the model. The loop continues only for a concrete executable action or retry, waits for pending tools, and returns control for user input, completed reports, or no executable action. This prevents repeated reports and repeated requests for the same missing information.
