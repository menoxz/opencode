import { createMemo, Show } from "solid-js"
import { useLocal } from "@/context/local"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { Select } from "@opencode-ai/ui/select"
import { Tooltip } from "@opencode-ai/ui/tooltip"

type ModelState = ReturnType<typeof useLocal>["model"]

/** Sentinel value for "no reasoning variant selected", local to this component. */
const OFF = "off"

/**
 * Real model variants are free-form, provider-defined strings (see
 * `packages/opencode/src/plugin/github-copilot/models.ts` and
 * `packages/app/src/context/model-variant.test.ts`, which use keys like
 * "low" | "high" | "xhigh" | "fast" | "thinking"). There is no fixed enum.
 * This map only ranks the common effort/budget keywords from lightest to
 * heaviest; anything unrecognized falls back to its ordinal position within
 * the current model's own variant list so the intensity ramp still makes
 * sense.
 */
const KNOWN_RANK: Record<string, number> = {
  minimal: 0,
  low: 1,
  medium: 2,
  mid: 2,
  high: 3,
  xhigh: 4,
  extreme: 4,
  max: 4,
  maximum: 4,
}

/**
 * Informative fallback token budgets shown only when the current model does
 * not expose a real `thinking.budgetTokens` value for that variant. Actual
 * budgets are computed server-side from each provider's own capabilities
 * (`max_thinking_budget`), so they vary per model — these are just
 * reasonable ballpark figures for the common low/medium/high/max case.
 */
const FALLBACK_TOKENS: Record<string, string> = {
  low: "1024",
  medium: "4096",
  high: "8192",
  max: "16000",
}

function rankOf(mode: string, others: string[]): number {
  const known = KNOWN_RANK[mode.toLowerCase()]
  if (known !== undefined) return known
  const idx = others.indexOf(mode)
  if (idx < 0) return 0
  const span = Math.max(others.length - 1, 1)
  return (idx / span) * 4
}

function opacityFor(mode: string, others: string[]): number {
  if (mode === OFF) return 1
  const ratio = Math.min(rankOf(mode, others) / 4, 1)
  return 0.45 + ratio * 0.55
}

function labelFor(mode: string): string {
  if (mode === OFF) return "Off"
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

function iconFor(mode: string): "brain" | "dash" {
  return mode === OFF ? "dash" : "brain"
}

function readBudgetTokens(model: { variants?: Record<string, unknown> } | undefined, mode: string): number | undefined {
  const raw = model?.variants?.[mode]
  if (!raw || typeof raw !== "object") return undefined
  const thinking = (raw as Record<string, unknown>).thinking
  if (!thinking || typeof thinking !== "object") return undefined
  const budget = (thinking as Record<string, unknown>).budgetTokens
  return typeof budget === "number" ? budget : undefined
}

function tokensFor(model: { variants?: Record<string, unknown> } | undefined, mode: string): string | undefined {
  if (mode === OFF) return undefined
  const real = readBudgetTokens(model, mode)
  if (real !== undefined) return real.toLocaleString()
  return FALLBACK_TOKENS[mode.toLowerCase()]
}

/**
 * Dropdown to pick the reasoning/thinking variant for the currently selected
 * model. Backed by the existing `useLocal().model.variant` state (the same
 * one driving the inline variant `Select` in `prompt-input.tsx` and read by
 * `prompt-input/submit.ts` when sending a message) — this is a standalone,
 * reusable extraction of that control, not a new config channel.
 *
 * Renders nothing when the current model exposes no variants at all (e.g. a
 * plain non-reasoning model), since there would be nothing to choose from.
 */
export function ThinkingModeSelector(props: { model?: ModelState; class?: string }) {
  const local = useLocal()
  const model = props.model ?? local.model
  const language = useLanguage()

  const variants = createMemo(() => model.variant.list())
  const options = createMemo(() => [OFF, ...variants()])
  const current = createMemo(() => model.variant.current() ?? OFF)

  const select = (mode: string) => {
    model.variant.set(mode === OFF ? undefined : mode)
  }

  return (
    <Show when={variants().length > 0}>
      <Tooltip
        placement="top"
        value={language.t("command.model.variant.cycle")}
        class={`flex items-center gap-1.5 ${props.class ?? ""}`}
      >
        <Icon name={iconFor(current())} size="small" style={{ opacity: opacityFor(current(), variants()) }} />
        <Select
          options={options()}
          current={current()}
          label={(mode) => labelFor(mode)}
          onSelect={(mode) => mode && select(mode)}
          variant="ghost"
          size="normal"
          class="max-w-40 text-text-base"
          valueClass="truncate text-13-regular text-text-base"
        >
          {(mode) => {
            const value = mode ?? OFF
            const tokens = tokensFor(model.current(), value)
            return (
              <div class="w-full flex items-center justify-between gap-2">
                <span class="flex items-center gap-1.5">
                  <Icon name={iconFor(value)} size="small" style={{ opacity: opacityFor(value, variants()) }} />
                  <span class="text-13-regular">{labelFor(value)}</span>
                </span>
                <Show when={tokens}>
                  <span class="text-11-regular text-text-weaker">{tokens}</span>
                </Show>
              </div>
            )
          }}
        </Select>
      </Tooltip>
    </Show>
  )
}
