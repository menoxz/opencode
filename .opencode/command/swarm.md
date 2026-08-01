---
description: Run a mission as an Agent Swarm — decompose, dispatch parallel workers, coordinate, aggregate
---

Run the mission below in **Agent Swarm mode**. Act as the swarm orchestrator:
first read the swarm agent protocol in `.opencode/agent/swarm.md` (or
`~/.config/opencode/agent/swarm.md`) and follow its pipeline exactly:
decompose the mission into 2–6 independent tasks, `swarm_plan`, `swarm_dispatch`
(parallel waves), coordinate via the inter-agent bus, `swarm_report`, then
validate the results and deliver the final answer.

Mission: $ARGUMENTS
