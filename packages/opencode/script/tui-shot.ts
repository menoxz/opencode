/**
 * Capture écran de la TUI opencode (headless), pour vérifier visuellement un rendu
 * sans dépendre d'un terminal interactif : la TUI est lancée dans un PTY (bun-pty),
 * son flux ANSI est rejoué dans un émulateur minimal, et les trames sont imprimées
 * en texte.
 *
 * Usage:
 *   bun packages/opencode/script/tui-shot.ts --session <id> [--db <path>] [--cwd <dir>]
 *        [--cols 120] [--rows 40] [--wait 20] [--click "<texte>" ...] [--keys "<texte>"]
 *
 * --click déclenche un vrai clic souris (SGR 1006, supporté par la TUI) sur la
 * première ligne contenant le texte donné, puis réimprime une trame. Le passer
 * deux fois montre l'aller-retour d'un dépliage (referme au second clic).
 *
 * Exemple (vérifier un inspect_batch replié puis déplié) :
 *   bun packages/opencode/script/tui-shot.ts --session ses_xxx \
 *     --db %TEMP%/opencode/ib-viz.db --click inspect_batch --click inspect_batch
 */
import { spawn } from "bun-pty"

const argv = process.argv.slice(2)
const arg = (name: string, fallback?: string) => {
  const hits: string[] = []
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--" + name && argv[i + 1] !== undefined) hits.push(argv[++i])
  return hits.length > 0 ? hits : fallback === undefined ? [] : [fallback]
}
const one = (name: string, fallback?: string) => arg(name, fallback)[0]
const many = (name: string) => arg(name)

const session = one("session")
if (!session) {
  console.error("--session <id> requis")
  process.exit(2)
}
const db = one("db")
const cwd = one("cwd", process.cwd())
const cols = Number(one("cols", "120"))
const rows = Number(one("rows", "40"))
const wait = Number(one("wait", "20"))
const clicks = many("click")
const keys = one("keys")

// ---------------------------------------------------------------- émulateur ANSI
function cellWidth(cp: number): number {
  if (cp === 0) return 0
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2
  return 1
}

class Screen {
  grid: string[][] = []
  r = 0
  c = 0
  top = 0
  bottom: number
  modes: Record<number, boolean> = {}
  constructor(public rows: number, public cols: number) {
    this.bottom = rows - 1
    for (let y = 0; y < rows; y++) this.grid.push(Array(cols).fill(" "))
  }
  clearAll() {
    for (let y = 0; y < this.rows; y++) this.grid[y] = Array(this.cols).fill(" ")
  }
  scrollUp(n = 1) {
    for (let i = 0; i < n; i++) {
      this.grid.splice(this.top, 1)
      this.grid.splice(this.bottom, 0, Array(this.cols).fill(" "))
    }
  }
  scrollDown(n = 1) {
    for (let i = 0; i < n; i++) {
      this.grid.splice(this.bottom, 1)
      this.grid.splice(this.top, 0, Array(this.cols).fill(" "))
    }
  }
  newline() {
    if (this.r === this.bottom) this.scrollUp(1)
    else if (this.r < this.rows - 1) this.r++
  }
  put(ch: string, w: number) {
    if (this.c + w > this.cols) {
      this.c = 0
      this.newline()
    }
    this.grid[this.r][this.c] = ch
    for (let i = 1; i < w; i++) this.grid[this.r][this.c + i] = ""
    this.c += w
  }
  eraseLine(mode: number, y: number) {
    const from = mode === 0 ? this.c : 0
    const to = mode === 0 ? this.cols - 1 : mode === 1 ? this.c : this.cols - 1
    for (let x = from; x <= to && x < this.cols; x++) this.grid[y][x] = " "
  }
  eraseDisplay(mode: number) {
    if (mode >= 2) return this.clearAll()
    if (mode === 0) {
      this.eraseLine(0, this.r)
      for (let y = this.r + 1; y < this.rows; y++) for (let x = 0; x < this.cols; x++) this.grid[y][x] = " "
      return
    }
    this.eraseLine(1, this.r)
    for (let y = 0; y < this.r; y++) for (let x = 0; x < this.cols; x++) this.grid[y][x] = " "
  }
  lines(): string[] {
    return this.grid.map((row) => row.join("").replace(/\s+$/, ""))
  }
}

export function makeFeed(scr: Screen) {
  let buf = ""
  const csi = (params: string, final: string) => {
    const priv = params.startsWith("?") || params.startsWith(">")
    const nums = (priv ? params.slice(1) : params)
      .split(";")
      .map((p) => (p.includes(":") ? p.split(":")[0] : p))
      .map((p) => (p === "" ? 0 : Number(p)))
    const n = nums[0] || 1
    if (priv) {
      if (final === "h" || final === "l") for (const m of nums) scr.modes[m] = final === "h"
      return
    }
    switch (final) {
      case "H":
      case "f":
        scr.r = Math.min(scr.rows - 1, Math.max(0, (nums[0] || 1) - 1))
        scr.c = Math.min(scr.cols - 1, Math.max(0, (nums[1] || 1) - 1))
        break
      case "A":
        scr.r = Math.max(0, scr.r - n)
        break
      case "B":
        scr.r = Math.min(scr.rows - 1, scr.r + n)
        break
      case "C":
        scr.c = Math.min(scr.cols - 1, scr.c + n)
        break
      case "D":
        scr.c = Math.max(0, scr.c - n)
        break
      case "E":
        scr.r = Math.min(scr.rows - 1, scr.r + n)
        scr.c = 0
        break
      case "F":
        scr.r = Math.max(0, scr.r - n)
        scr.c = 0
        break
      case "G":
        scr.c = Math.min(scr.cols - 1, Math.max(0, n - 1))
        break
      case "d":
        scr.r = Math.min(scr.rows - 1, Math.max(0, n - 1))
        break
      case "J":
        scr.eraseDisplay(nums[0] ?? 0)
        break
      case "K":
        scr.eraseLine(nums[0] ?? 0, scr.r)
        break
      case "L":
        for (let i = 0; i < n; i++) scr.grid.splice(scr.r, 0, Array(scr.cols).fill(" "))
        for (let i = 0; i < n; i++) scr.grid.splice(scr.bottom + 1, 1)
        break
      case "M":
        for (let i = 0; i < n; i++) scr.grid.splice(scr.r, 1)
        for (let i = 0; i < n; i++) scr.grid.splice(scr.bottom, 0, Array(scr.cols).fill(" "))
        break
      case "S":
        scr.scrollUp(n)
        break
      case "T":
        scr.scrollDown(n)
        break
      case "X":
        for (let i = 0; i < n && scr.c + i < scr.cols; i++) scr.grid[scr.r][scr.c + i] = " "
        break
      case "r":
        scr.top = Math.max(0, (nums[0] || 1) - 1)
        scr.bottom = Math.min(scr.rows - 1, (nums[1] || scr.rows) - 1)
        break
      default:
        break
    }
  }
  return (chunk: string) => {
    buf += chunk
    let i = 0
    while (i < buf.length) {
      const ch = buf[i]
      if (ch === "\x1b") {
        const next = buf[i + 1]
        if (next === undefined) break
        if (next === "[") {
          let j = i + 2
          let params = ""
          while (j < buf.length && /[0-9;:?><=!"'$ ]/.test(buf[j])) params += buf[j++]
          if (j >= buf.length) break
          const final = buf[j]
          if (/[@-~]/.test(final)) {
            csi(params, final)
            i = j + 1
            continue
          }
          break
        }
        if (next === "]") {
          let j = i + 2
          while (j < buf.length && buf[j] !== "\x07" && !(buf[j] === "\x1b" && buf[j + 1] === "\\")) j++
          if (j >= buf.length) break
          i = buf[j] === "\x07" ? j + 1 : j + 2
          continue
        }
        if (next === "P" || next === "^" || next === "_") {
          let j = i + 2
          while (j < buf.length && !(buf[j] === "\x1b" && buf[j + 1] === "\\")) j++
          i = j >= buf.length ? buf.length : j + 2
          break
        }
        if (next === "(" || next === ")" || next === "*" || next === "+") {
          i += 3
          continue
        }
        i += 2
        continue
      }
      if (ch === "\r") {
        scr.c = 0
        i++
        continue
      }
      if (ch === "\n") {
        scr.newline()
        i++
        continue
      }
      if (ch === "\b") {
        scr.c = Math.max(0, scr.c - 1)
        i++
        continue
      }
      if (ch === "\t") {
        scr.c = Math.min(scr.cols - 1, scr.c + (8 - (scr.c % 8)))
        i++
        continue
      }
      const cp = buf.codePointAt(i)!
      const s = String.fromCodePoint(cp)
      if (cp < 32 || cp === 0x7f) {
        i += s.length
        continue
      }
      scr.put(s, cellWidth(cp))
      i += s.length
    }
    buf = buf.slice(i)
  }
}

// ---------------------------------------------------------------- exécution
const scr = new Screen(rows, cols)
const feed = makeFeed(scr)
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

const pty = spawn(process.execPath, ["run", "--conditions=browser", "./src/index.ts", "--session", session], {
  name: "xterm-256color",
  cols,
  rows,
  cwd,
  env: {
    ...(process.env as Record<string, string>),
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    ...(db ? { OPENCODE_DB: db } : {}),
  },
})
pty.onData((data) => feed(data))

function shot(title: string) {
  console.log("\n===== " + title + " =====")
  scr.lines().forEach((line, index) => {
    if (line.trim().length > 0) console.log(String(index + 1).padStart(2, " ") + "|" + line.slice(0, cols - 2))
  })
}
function click(x: number, y: number) {
  pty.write(`\x1b[<0;${x};${y}M` + `\x1b[<0;${x};${y}m`)
}
function findAnchor(text: string): { x: number; y: number } | undefined {
  const lines = scr.lines()
  for (let y = 0; y < lines.length; y++) {
    const x = lines[y].indexOf(text)
    if (x >= 0) return { x: x + 2, y: y + 1 }
  }
  return undefined
}

const main = async () => {
  await sleep(wait * 1000)
  shot(`trame initiale (${session})`)
  console.log("modes souris actifs :", JSON.stringify(scr.modes))
  if (keys) {
    pty.write(keys)
    await sleep(1500)
    shot("après touche(s) " + JSON.stringify(keys))
  }
  for (const anchor of clicks) {
    const pos = findAnchor(anchor)
    console.log(`clic ${JSON.stringify(anchor)} @ ${JSON.stringify(pos)}`)
    if (!pos) continue
    click(pos.x, pos.y)
    await sleep(2500)
    shot(`après clic ${JSON.stringify(anchor)}`)
  }
  pty.kill()
  await sleep(300)
  process.exit(0)
}

setTimeout(() => {
  console.error("!! délai global dépassé, arrêt du PTY")
  try {
    pty.kill()
  } catch {}
  process.exit(1)
}, (wait + 15 + clicks.length * 4) * 1000)

main()
