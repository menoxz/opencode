---
description: Livrer le besoin ci-dessous par le workflow de codage agentic (cible → DAG → délégation → preuve → commit)
agent: coding-orchestrator
---

Applique le workflow de codage agentic au besoin ci-dessous, dans ce workspace.

Protocole : `.opencode/agent/coding-orchestrator.md` (pipeline P0 → P9) et
`specs/agentic-coding-workflow.md` (spec). Suis les phases dans l'ordre : pré-vol (4 réponses),
cible écrite, cartographie bornée, plan/DAG, délégation en micro-tâches avec contrat de résultat,
intégration, vérification par preuve (commande + exit code), commit, puis rapport court.

Rappel : les règles de fond restent `AGENTS.md` (global + workspace) — ce workflow n'en fixe que
l'ordre d'exécution et ce qui se délègue.

Besoin : $ARGUMENTS
