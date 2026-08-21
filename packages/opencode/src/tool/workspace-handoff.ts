import path from "path"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID } from "@/session/schema"
import { InstanceState } from "@/effect/instance-state"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Git } from "@/git"
import type { GoalState } from "@/session/goal-state"

const CAPSULE_MAX_CHARS = 4_000
const forbiddenSegments = new Set([".git", "node_modules"])

const Parameters = Schema.Struct({
  path: Schema.String.annotate({ description: "Absolute directory for the target project/session" }),
  reason: Schema.String.annotate({ description: "Why the current workspace does not fit the request" }),
  instructions: Schema.optional(Schema.String).annotate({ description: "Optional continuation instructions; secrets are redacted" }),
  title: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  createIfMissing: Schema.optional(Schema.Boolean).annotate({ description: "Create the target directory when absent (default false)" }),
})

function normalize(value: string) {
  return path.resolve(value).replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase()
}

function isWithin(candidate: string, root: string) {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

export function handoffPermissionPlan(currentWorktree: string, targetDirectory: string, targetExists: boolean) {
  const permissions: Array<"external_directory" | "edit"> = []
  if (!isWithin(targetDirectory, currentWorktree)) permissions.push("external_directory")
  if (!targetExists) permissions.push("edit")
  return permissions
}

export function validateWorkspaceTarget(currentDirectory: string, targetDirectory: string) {
  if (!path.isAbsolute(targetDirectory)) return "Target workspace path must be absolute."
  const current = normalize(currentDirectory)
  const target = normalize(targetDirectory)
  if (current === target) return "Target workspace is already the current workspace."
  const root = normalize(path.parse(path.resolve(targetDirectory)).root)
  if (target === root) return "Target workspace cannot be a filesystem root."
  const segments = target.split("/")
  const forbidden = segments.find((segment) => forbiddenSegments.has(segment))
  if (forbidden) return `Target workspace cannot be inside ${forbidden}.`
}

function redact(value: string) {
  return value
    .replace(/\b(?:sk|ghp|gho|ghu|ghs|ghr|nvapi)-?[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED]")
    .replace(/\b(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
}

function clipped(value: unknown, max: number) {
  if (value === undefined || value === null) return ""
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return text.length <= max ? text : text.slice(0, max) + "\n... [capsule section truncated]"
}

export function buildHandoffCapsule(input: {
  sourceSessionID: string
  sourceDirectory: string
  targetDirectory: string
  reason: string
  instructions?: string
  goalState?: Pick<GoalState, "goal" | "dod" | "outOfScope" | "findings">
}) {
  const sections = [
    "# WORKSPACE HANDOFF",
    `Source session: ${input.sourceSessionID}`,
    `Source workspace: ${input.sourceDirectory}`,
    `Target workspace: ${input.targetDirectory}`,
    `Reason: ${clipped(input.reason, 500)}`,
    "",
    "## Objective", clipped(input.goalState?.goal, 700),
    "",
    "## Sticky findings", clipped(input.goalState?.findings, 1_200),
    "",
    "## Definition of Done", clipped(input.goalState?.dod, 800),
    "",
    "## Out of scope", clipped(input.goalState?.outOfScope, 400),
    "",
    "## Continuation instructions", clipped(input.instructions, 700),
    "",
    "Continue in this workspace. Revalidate paths and project conventions before mutation; preserve OPEN/RESIDUAL findings.",
  ].filter((line) => line !== "")
  return redact(sections.join("\n")).slice(0, CAPSULE_MAX_CHARS)
}

export const WorkspaceHandoffTool = Tool.define(
  "workspace_handoff",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const fs = yield* AppFileSystem.Service
    const git = yield* Git.Service
    const instances = yield* Effect.serviceOption(InstanceStore.Service)
    return {
      description: [
        "Create a new root session attached to another existing or newly created project directory.",
        "The source session remains intact; only a bounded redacted objective/findings capsule is transferred.",
        "Use when the request belongs to a different project. Never use as a simple cd.",
      ].join(" "),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (instances._tag === "None") return yield* Effect.fail(new Error("Workspace handoff is unavailable in this runtime."))
          const sourceContext = yield* InstanceState.context
          const targetDirectory = path.resolve(params.path)
          const validation = validateWorkspaceTarget(sourceContext.directory, targetDirectory)
          if (validation) return yield* Effect.fail(new Error(validation))
          if (handoffPermissionPlan(sourceContext.worktree, targetDirectory, true).includes("external_directory")) {
            yield* ctx.ask({ permission: "external_directory", patterns: [targetDirectory], always: [targetDirectory], metadata: { targetDirectory, reason: params.reason } })
          }
          const targetStat = yield* fs.stat(targetDirectory).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (targetStat && targetStat.type !== "Directory") {
            return yield* Effect.fail(new Error("Target workspace exists but is not a directory."))
          }
          if (!targetStat) {
            if (!params.createIfMissing) return yield* Effect.fail(new Error("Target workspace does not exist; set createIfMissing=true to create it."))
            yield* ctx.ask({ permission: "edit", patterns: [targetDirectory], always: ["*"], metadata: { targetDirectory, reason: params.reason } })
            yield* fs.ensureDir(targetDirectory)
          }
          const source = yield* sessions.get(ctx.sessionID)
          const messages = yield* sessions.messages({ sessionID: source.id })
          const lastUser = messages.findLast((message) => message.info.role === "user")
          const sessionModel = lastUser?.info.role === "user"
            ? { id: lastUser.info.model.modelID, providerID: lastUser.info.model.providerID, variant: lastUser.info.model.variant }
            : source.model
          if (!sessionModel) return yield* Effect.fail(new Error("Source session model is unavailable; cannot seed the target session."))
          const userModel = { modelID: sessionModel.id, providerID: sessionModel.providerID, variant: sessionModel.variant }
          const capsule = buildHandoffCapsule({
            sourceSessionID: source.id, sourceDirectory: source.directory, targetDirectory,
            reason: params.reason, instructions: params.instructions, goalState: source.goalState,
          })
          const targetContext = yield* instances.value.load({ directory: targetDirectory })
          const target = yield* sessions.create({
            title: params.title ?? `Handoff: ${source.title}`,
            agent: params.agent ?? source.agent ?? ctx.agent,
            model: sessionModel,
          }).pipe(Effect.provideService(InstanceRef, targetContext))
          const userID = MessageID.ascending()
          const user: MessageV2.User = {
            id: userID, role: "user", sessionID: target.id, agent: params.agent ?? source.agent ?? ctx.agent, model: userModel,
            time: { created: Date.now() },
          }
          yield* sessions.updateMessage(user).pipe(Effect.provideService(InstanceRef, targetContext))
          yield* sessions.updatePart({
            id: PartID.ascending(), messageID: userID, sessionID: target.id, type: "text", text: capsule,
          }).pipe(Effect.provideService(InstanceRef, targetContext))
          if (source.goalState?.goal) {
            yield* sessions.setGoalState({
              sessionID: target.id,
              goalState: {
                ...structuredClone(source.goalState), status: "edited", completion: undefined, anchorUserID: userID,
                version: source.goalState.version + 1, updatedAt: Date.now(),
              },
            }).pipe(Effect.provideService(InstanceRef, targetContext))
          }
          const [sourceStatus, targetStatus, branch] = yield* Effect.all([
            git.status(sourceContext.worktree).pipe(Effect.catch(() => Effect.succeed([]))),
            git.status(targetContext.worktree).pipe(Effect.catch(() => Effect.succeed([]))),
            git.branch(targetContext.worktree).pipe(Effect.catch(() => Effect.succeed(undefined))),
          ])
          const result = {
            status: "handed-off", sourceSessionID: source.id, targetSessionID: target.id,
            sourceWorkspace: source.directory, targetWorkspace: target.directory, targetWorktree: targetContext.worktree,
            targetProjectID: target.projectID, branch, sourceDirty: sourceStatus.length > 0, targetDirty: targetStatus.length > 0,
            capsuleChars: capsule.length, agent: target.agent,
            resumeCommand: `opencodev2 --session ${target.id} --agent ${target.agent ?? ctx.agent}`,
          }
          return {
            title: `Handoff → ${path.basename(targetDirectory)}`,
            metadata: result,
            output: JSON.stringify(result, null, 2),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
