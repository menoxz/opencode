/**
 * `withdrawableUserID` décide quels prompts peuvent être **annulés** pendant qu'une
 * exécution est en vol — la seule situation où une file ou un steer existe. Revert refusait
 * cette annulation (`assertNotBusy`), donc le prompt restait en attente et était servi
 * quand même : la garde doit distinguer ce que le modèle a déjà vu de ce qu'il n'a pas vu.
 */
import { expect, test } from "bun:test"
import type { MessageV2 } from "@/session/message-v2"
import type { MessageID } from "@/session/schema"
import { PromptQueue } from "@/session/prompt-queue"

// Les identifiants sont marqués (`MessageID`) ; les fixtures restent des chaînes lisibles.
const withdrawable = (messages: MessageV2.WithParts[], id: string, busy = true) =>
  PromptQueue.withdrawableUserID(messages, id as MessageID, busy)

const user = (id: string, parts: MessageV2.Part[] = []): MessageV2.WithParts =>
  ({
    info: {
      id,
      sessionID: "ses_x",
      role: "user",
      time: { created: 1 },
      agent: "build",
      model: { providerID: "p", modelID: "m" },
    } as unknown as MessageV2.User,
    parts,
  }) as MessageV2.WithParts

const assistant = (id: string, parentID: string, finish?: string): MessageV2.WithParts =>
  ({
    info: {
      id,
      sessionID: "ses_x",
      role: "assistant",
      parentID,
      mode: "build",
      agent: "build",
      time: { created: 2, completed: finish ? 3 : undefined },
      finish,
    } as unknown as MessageV2.Assistant,
    parts: [],
  }) as MessageV2.WithParts

const text = (extra: Record<string, unknown> = {}): MessageV2.Part =>
  ({ id: "prt_1", sessionID: "ses_x", messageID: "msg_x", type: "text", text: "suite", ...extra }) as MessageV2.Part

const steer = () => text({ metadata: { steer: true } })
const compaction = () => ({ id: "prt_c", sessionID: "ses_x", messageID: "msg_x", type: "compaction" }) as MessageV2.Part

test("un prompt en file derrière le tour en cours est annulable", () => {
  const messages = [user("msg_a"), user("msg_b")]
  expect(withdrawable(messages, "msg_b")).toBe(true)
})

test("le prompt que l'exécution sert n'est jamais annulable", () => {
  const messages = [user("msg_a"), user("msg_b")]
  expect(withdrawable(messages, "msg_a")).toBe(false)
})

test("un steer non encore servi est annulable, un steer servi ne l'est plus", () => {
  const pending = [user("msg_a"), user("msg_b", [steer()])]
  expect(withdrawable(pending, "msg_b")).toBe(true)

  const served = [user("msg_a"), user("msg_b", [steer()]), assistant("msg_c", "msg_a", "tool-calls")]
  expect(withdrawable(served, "msg_b")).toBe(false)
})

test("un message déjà répondu n'est pas une annulation mais un revert", () => {
  const messages = [user("msg_a"), assistant("msg_b", "msg_a", "tool-calls")]
  expect(withdrawable(messages, "msg_a")).toBe(false)
  expect(withdrawable(messages, "msg_b")).toBe(false)
})

test("les messages du runtime ne sont pas des prompts annulables", () => {
  const messages = [user("msg_a"), user("msg_b", [compaction()])]
  expect(withdrawable(messages, "msg_b")).toBe(false)
})

test("un identifiant absent n'annule rien", () => {
  expect(withdrawable([user("msg_a")], "msg_zzz")).toBe(false)
})

test("au repos, le revert classique garde la main : rien n'est supprimé", () => {
  const messages = [user("msg_a"), user("msg_b")]
  expect(withdrawable(messages, "msg_b", false)).toBe(false)
})
