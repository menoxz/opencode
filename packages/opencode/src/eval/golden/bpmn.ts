/**
 * BPMN 2.0 fingerprint — structural rules and layout rules.
 *
 * These answer two disjoint questions and both are required. Measured on real
 * synthetic sample artifacts: a file can carry 29 structural
 * errors and still be imported by bpmn-js 17.11.1 without a single warning while
 * being drawn with overlapping labels; and conversely a structurally perfect file
 * can be drawn with a task 35% hidden behind a flow label. "It validates" and
 * "it reads correctly" are not the same claim.
 *
 * Layout rules are computed from the diagram interchange (DI) geometry, which is
 * explicit in the file, so they are deterministic and need no browser. Their
 * limit is stated in LAYOUT_SCOPE below.
 *
 * @module eval/golden/bpmn
 */

import { childrenNamed, flatten, parseXml, type XmlElement } from "./xml"
import type { Finding } from "./fingerprint"

/**
 * Two boxes are reported as overlapping when the intersection covers more than
 * this fraction of the smaller box. Chosen because real observed defects ranged
 * from 19% to 67% coverage, while legitimate adjacency is 0%.
 */
const OVERLAP_THRESHOLD = 0.1

/**
 * Layout rules only see geometry the file declares. Labels without explicit
 * `dc:Bounds` are positioned by the renderer at draw time and are therefore out
 * of scope — they are not silently treated as defect-free, they are not measured.
 */
export const LAYOUT_SCOPE = "DI-declared geometry only (shapes, and labels carrying explicit dc:Bounds)"

interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface Shape {
  /** id of the BPMN element this shape draws. */
  element: string
  box: Box
}

/** A text box the file positions explicitly, on a shape or along an edge. */
interface Label {
  /** id of the element the label belongs to. */
  owner: string
  box: Box
}

const FLOW_NODE_TAGS = new Set([
  "task",
  "userTask",
  "serviceTask",
  "scriptTask",
  "manualTask",
  "sendTask",
  "receiveTask",
  "businessRuleTask",
  "callActivity",
  "subProcess",
  "startEvent",
  "endEvent",
  "intermediateCatchEvent",
  "intermediateThrowEvent",
  "boundaryEvent",
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "eventBasedGateway",
  "complexGateway",
])

const GATEWAY_TAGS = new Set([
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "eventBasedGateway",
  "complexGateway",
])

/** Compute every BPMN finding for one artifact. */
export function bpmnFindings(source: string): Finding[] {
  const roots = parseXml(source)
  const all = flatten(roots)
  return [...structuralFindings(all), ...layoutFindings(all)]
}

/**
 * Flow nodes of the model.
 *
 * Matching on the local name alone is not enough: `zeebe:userTask` is an
 * extension marker nested in `bpmn:extensionElements` and shares the local name
 * `userTask` with a real task. A flow node is, per the BPMN specification, a
 * direct child of a process or sub-process — that test is prefix-independent and
 * cannot be fooled by a vendor extension.
 */
function flowNodes(all: XmlElement[]): XmlElement[] {
  return all
    .filter((e) => e.local === "process" || e.local === "subProcess")
    .flatMap((container) => container.children.filter((c) => FLOW_NODE_TAGS.has(c.local)))
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

function structuralFindings(all: XmlElement[]): Finding[] {
  const findings: Finding[] = []
  const processes = all.filter((e) => e.local === "process")
  const flows = all.filter((e) => e.local === "sequenceFlow")
  const ids = all.map((e) => e.attrs.id).filter((id): id is string => Boolean(id))
  const known = new Set(ids)

  for (const [id, count] of countBy(ids)) {
    if (count > 1) findings.push({ code: "BPMN_DUPLICATE_ID", detail: `id "${id}" declared ${count} times` })
  }

  for (const flow of flows) {
    for (const ref of ["sourceRef", "targetRef"] as const) {
      const target = flow.attrs[ref]
      if (target && !known.has(target))
        findings.push({
          code: "BPMN_FLOW_DANGLING_REF",
          detail: `sequenceFlow "${flow.attrs.id}" ${ref} points to unknown id "${target}"`,
        })
    }
  }

  const incoming = countBy(flows.map((f) => f.attrs.targetRef).filter(Boolean) as string[])
  const outgoing = countBy(flows.map((f) => f.attrs.sourceRef).filter(Boolean) as string[])

  for (const process of processes) {
    const nodes = process.children.filter((c) => FLOW_NODE_TAGS.has(c.local))
    if (nodes.length === 0) continue
    const label = process.attrs.id || "(anonymous process)"

    if (!nodes.some((n) => n.local === "startEvent"))
      findings.push({ code: "BPMN_PROCESS_NO_START_EVENT", detail: `process "${label}" has no start event` })
    if (!nodes.some((n) => n.local === "endEvent"))
      findings.push({ code: "BPMN_PROCESS_NO_END_EVENT", detail: `process "${label}" has no end event` })

    for (const node of nodes) {
      const id = node.attrs.id ?? ""
      const into = incoming.get(id) ?? 0
      const outOf = outgoing.get(id) ?? 0

      if (into === 0 && outOf === 0)
        findings.push({ code: "BPMN_NODE_ORPHAN", detail: `${node.local} "${id}" is connected to nothing` })
      if (into === 0 && outOf > 0 && node.local !== "startEvent" && node.local !== "boundaryEvent")
        findings.push({ code: "BPMN_NODE_NO_INCOMING", detail: `${node.local} "${id}" has no incoming flow` })
      if (outOf === 0 && into > 0 && node.local !== "endEvent")
        findings.push({ code: "BPMN_NODE_NO_OUTGOING", detail: `${node.local} "${id}" has no outgoing flow` })
      if (!node.attrs.name?.trim())
        findings.push({ code: "BPMN_NODE_UNNAMED", detail: `${node.local} "${id}" has no name` })

      if (!GATEWAY_TAGS.has(node.local)) continue
      if (into === 1 && outOf === 1)
        findings.push({
          code: "BPMN_GATEWAY_POINTLESS",
          detail: `${node.local} "${id}" neither splits nor merges (1 in, 1 out)`,
        })
      if (node.local === "exclusiveGateway" && outOf > 1)
        findings.push(...missingConditions(node, flows))
    }
  }

  return findings
}

function missingConditions(gateway: XmlElement, flows: XmlElement[]): Finding[] {
  const id = gateway.attrs.id ?? ""
  const fallback = gateway.attrs.default
  return flows
    .filter((f) => f.attrs.sourceRef === id && f.attrs.id !== fallback)
    .filter((f) => childrenNamed(f, "conditionExpression").length === 0)
    .map((f) => ({
      code: "BPMN_GATEWAY_MISSING_CONDITION",
      detail: `flow "${f.attrs.id}" out of exclusiveGateway "${id}" has no condition and is not the default`,
    }))
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layoutFindings(all: XmlElement[]): Finding[] {
  const shapes = readShapes(all)
  const labels = readLabels(all)
  const byElement = new Map(shapes.map((s) => [s.element, s]))
  const containers = containerIds(all)
  const attachedTo = boundaryHosts(all)

  const findings: Finding[] = [
    ...shapeOverlaps(shapes, containers, attachedTo),
    ...labelOverlaps(labels, shapes, containers),
    ...labelCollisions(labels),
    ...containmentBreaks(all, byElement),
  ]

  const drawn = new Set(shapes.map((s) => s.element))
  for (const node of flowNodes(all)) {
    const id = node.attrs.id ?? ""
    if (!drawn.has(id))
      findings.push({ code: "BPMN_NODE_NO_DI", detail: `${node.local} "${id}" has no BPMNShape and is never drawn` })
  }

  return findings
}

function readShapes(all: XmlElement[]): Shape[] {
  return all
    .filter((e) => e.local === "BPMNShape" && e.attrs.bpmnElement)
    .flatMap((shape) => {
      const box = readBounds(childrenNamed(shape, "Bounds")[0])
      if (!box) return []
      return [{ element: shape.attrs.bpmnElement, box }]
    })
}

/**
 * Labels carrying explicit `dc:Bounds`, on shapes and on edges alike. Edge labels
 * matter: a flow label drifting over a task is a real, observed defect that no
 * structural rule can see.
 */
function readLabels(all: XmlElement[]): Label[] {
  return all
    .filter((e) => (e.local === "BPMNShape" || e.local === "BPMNEdge") && e.attrs.bpmnElement)
    .flatMap((element) => {
      const label = childrenNamed(element, "BPMNLabel")[0]
      const box = label ? readBounds(childrenNamed(label, "Bounds")[0]) : undefined
      if (!box) return []
      return [{ owner: element.attrs.bpmnElement, box }]
    })
}

/** Boundary event id → the activity it is attached to and legitimately sits on. */
function boundaryHosts(all: XmlElement[]): Map<string, string> {
  return new Map(
    all
      .filter((e) => e.local === "boundaryEvent" && e.attrs.id && e.attrs.attachedToRef)
      .map((e) => [e.attrs.id, e.attrs.attachedToRef] as const),
  )
}

function readBounds(element: XmlElement | undefined): Box | undefined {
  if (!element) return undefined
  const x = Number(element.attrs.x)
  const y = Number(element.attrs.y)
  const width = Number(element.attrs.width)
  const height = Number(element.attrs.height)
  if ([x, y, width, height].some((n) => !Number.isFinite(n))) return undefined
  return { x, y, width, height }
}

/** Participants and lanes are drawn as containers; overlapping them is normal. */
function containerIds(all: XmlElement[]): Set<string> {
  return new Set(
    all
      .filter((e) => e.local === "participant" || e.local === "lane" || e.local === "subProcess")
      .map((e) => e.attrs.id)
      .filter((id): id is string => Boolean(id)),
  )
}

function shapeOverlaps(shapes: Shape[], containers: Set<string>, attachedTo: Map<string, string>): Finding[] {
  const drawable = shapes.filter((s) => !containers.has(s.element))
  const findings: Finding[] = []
  for (let a = 0; a < drawable.length; a++) {
    for (let b = a + 1; b < drawable.length; b++) {
      const first = drawable[a]
      const second = drawable[b]
      // A boundary event is drawn on the border of its host by definition.
      if (attachedTo.get(first.element) === second.element) continue
      if (attachedTo.get(second.element) === first.element) continue
      const ratio = overlapRatio(first.box, second.box)
      if (ratio <= OVERLAP_THRESHOLD) continue
      findings.push({
        code: "BPMN_LAYOUT_SHAPE_OVERLAP",
        detail: `"${first.element}" and "${second.element}" overlap at ${percent(ratio)}`,
      })
    }
  }
  return findings
}

function labelOverlaps(labels: Label[], shapes: Shape[], containers: Set<string>): Finding[] {
  const drawable = shapes.filter((s) => !containers.has(s.element))
  const findings: Finding[] = []
  for (const label of labels) {
    for (const shape of drawable) {
      if (shape.element === label.owner) continue
      const ratio = overlapRatio(label.box, shape.box)
      if (ratio <= OVERLAP_THRESHOLD) continue
      findings.push({
        code: "BPMN_LAYOUT_LABEL_OVERLAP",
        detail: `label of "${label.owner}" covers ${percent(ratio)} of "${shape.element}"`,
      })
    }
  }
  return findings
}

function labelCollisions(labels: Label[]): Finding[] {
  const findings: Finding[] = []
  for (let a = 0; a < labels.length; a++) {
    for (let b = a + 1; b < labels.length; b++) {
      const ratio = overlapRatio(labels[a].box, labels[b].box)
      if (ratio <= OVERLAP_THRESHOLD) continue
      findings.push({
        code: "BPMN_LAYOUT_LABEL_COLLISION",
        detail: `labels of "${labels[a].owner}" and "${labels[b].owner}" overlap at ${percent(ratio)}, text is unreadable`,
      })
    }
  }
  return findings
}

/**
 * An element declared inside a process must be drawn inside the participant that
 * references that process. This is how an annotation ends up floating outside its
 * pool while every structural check stays green.
 */
function containmentBreaks(all: XmlElement[], byElement: Map<string, Shape>): Finding[] {
  const findings: Finding[] = []
  for (const participant of all.filter((e) => e.local === "participant")) {
    const pool = byElement.get(participant.attrs.id ?? "")
    const processRef = participant.attrs.processRef
    if (!pool || !processRef) continue

    const process = all.find((e) => e.local === "process" && e.attrs.id === processRef)
    if (!process) continue

    for (const child of process.children) {
      const shape = byElement.get(child.attrs.id ?? "")
      if (!shape) continue
      if (contains(pool.box, shape.box)) continue
      findings.push({
        code: "BPMN_LAYOUT_OUTSIDE_POOL",
        detail: `"${child.attrs.id}" (${child.local}) is drawn outside pool "${participant.attrs.id}"`,
      })
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function overlapRatio(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return 0
  const smallest = Math.min(a.width * a.height, b.width * b.height)
  if (smallest <= 0) return 0
  return (width * height) / smallest
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

function countBy(values: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const value of values) out.set(value, (out.get(value) ?? 0) + 1)
  return out
}
