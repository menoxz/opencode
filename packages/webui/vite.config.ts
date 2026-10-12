import { defineConfig } from "vitest/config"
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

export default defineConfig(({ mode }) => ({
  // `hot` must be off under Vitest: solid-refresh injects a `file:///@solid-refresh` module that
  // the test runner cannot resolve as a filename. Dev keeps hot reload.
  plugins: [solid({ hot: mode !== "test" })],
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    proxy: Object.fromEntries(API_PREFIXES.map((prefix) => [prefix, { target, changeOrigin: true }])),
  },
  build: {
    target: "esnext",
    outDir: "dist",
    // Measured in P5: a source map adds 392 kB next to a 67 kB bundle — six times the payload,
    // for a file no user needs. Kept out of production builds; Vite still maps in dev.
    sourcemap: mode !== "production",
  },
  // Component tests run on Vitest precisely because it reuses Vite's JSX transform. Bun cannot
  // run JSX files here: it needs `jsx: "react-jsx"` while Vite needs `jsx: "preserve"`, and the
  // two cannot share one tsconfig (measured — `--tsconfig-override` is ignored by Bun's test
  // runner, which keeps resolving `react/jsx-dev-runtime`).
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}))
