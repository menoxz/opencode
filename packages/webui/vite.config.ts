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
  // Le parcours de dossiers (`GET /folder?path=…`), pour **choisir** un workspace au lieu de le
  // taper. Même piège que les autres : sans cette entrée, Vite rend `index.html` avec un 200 et le
  // parcours resterait vide sans erreur visible.
  "/folder",
  "/skill",
  // Les menus du rail. Sans ces deux entrées, Vite sert `index.html` avec un **status 200** : le
  // SDK croit recevoir du JSON, échoue à le parser, et la section reste vide sans erreur visible.
  "/command",
  "/plugin",
  // Le **schéma des outils** (`GET /experimental/tool`) : le panneau de détail d'une ligne de
  // trajectoire y lit les paramètres déclarés de l'outil. Même piège que les autres : sans cette
  // entrée, Vite rend `index.html` avec un 200 et le panneau resterait vide sans erreur visible.
  "/experimental",
  // Les interpréteurs installés (`GET /pty/shells`, 353 octets). La route existe côté serveur mais
  // **pas dans le SDK** : l'UI l'appelle en `fetch` direct, donc elle doit être proxifiée — sinon
  // Vite rend `index.html` avec un `200`, et la liste de choix reste silencieusement vide.
  "/pty",
  // Les réglages. Même piège, refait : `/provider/auth` retombait sur `index.html`, donc la section
  // « fournisseurs » s'affichait **vide et sans erreur**. Une route consommée doit être proxifiée —
  // l'oublier ne casse rien visiblement, ce qui est précisément ce qui le rend coûteux.
  "/provider",
  "/auth",
  // La question de l'agent — le **seul** contrôle du fil. Quatrième fois que ce piège se referme :
  // sans cette entrée, `client.question.list()` recevait `index.html` en 200, le parse échouait, le
  // `catch` l'avalait, et le fil n'affichait **aucun** contrôle — donc une session dont l'agent est
  // bloqué sur une question n'avait plus aucune sortie à l'écran. Trouvé en vérifiant au navigateur,
  // invisible aux tests : jsdom n'a pas de proxy.
  "/question",
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
