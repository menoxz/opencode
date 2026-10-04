export * as OrchestratorPlanner from "."

import type { DAGStep } from "./index"

// Plans pré-configurés pour les workflows courants
export const PLANS = {
  codeReview: (repo: string, pr: number): DAGStep[] => [
    {
      id: "fetch-diff",
      description: "Récupérer le diff de la PR",
      agent: "explore",
      prompt: `Fetch the diff for PR #${pr} in ${repo} and return the changed files list`,
    },
    {
      id: "security-scan",
      description: "Analyse de sécurité",
      agent: "security",
      prompt: `Review the diff for PR #${pr} in ${repo} for security vulnerabilities`,
      depends: ["fetch-diff"],
    },
    {
      id: "code-quality",
      description: "Analyse qualité du code",
      agent: "general",
      prompt: `Review code quality for PR #${pr} in ${repo}`,
      depends: ["fetch-diff"],
    },
    {
      id: "merge-report",
      description: "Fusionner les rapports",
      agent: "general",
      prompt: `Merge security and quality reports for PR #${pr} in ${repo} into a final review`,
      depends: ["security-scan", "code-quality"],
    },
  ],

  deploy: (service: string): DAGStep[] => [
    {
      id: "build",
      description: `Build ${service}`,
      agent: "general",
      prompt: `Build the ${service} project`,
    },
    {
      id: "test",
      description: `Test ${service}`,
      agent: "general",
      prompt: `Run tests for ${service}`,
      depends: ["build"],
    },
    {
      id: "deploy",
      description: `Deploy ${service}`,
      agent: "general",
      prompt: `Deploy ${service} to production`,
      depends: ["test"],
    },
  ],
}
