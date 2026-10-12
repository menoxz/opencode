import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

// The backend is addressed through a dev proxy rather than directly: the server's CORS is
// opt-in (`packages/opencode/src/server/cors.ts:19` — `opts?.cors?.includes(origin)`), so a UI on
// another port would be refused. Proxying keeps the server ignorant of the UI, which is the
// architecture rule from docs/web-ui/WORKFLOW.md §2.
const BACKEND_PORT = process.env.OPENCODE_SERVER_PORT ?? "4096"
const target = `http://127.0.0.1:${BACKEND_PORT}`

const API_PREFIXES = [
  "/global",
  "/event",
  "/session",
  "/agent",
  "/config",
  "/path",
  "/mode",
  "/find",
  "/project",
  "/workspace",
  "/permission",
  "/mcp",
  "/log",
  "/file",
  "/skill",
]

export default defineConfig({
  plugins: [solid()],
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    proxy: Object.fromEntries(API_PREFIXES.map((prefix) => [prefix, { target, changeOrigin: true }])),
  },
  build: {
    target: "esnext",
    outDir: "dist",
    sourcemap: true,
  },
})
