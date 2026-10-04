BUILD: `./packages/sdk/js/script/build.ts` → regen JS SDK
RULES: parallel_tools|branch=dev|no_local_main_ref(use origin/dev)|auto_exec(unless blocked by safety/missing info)
PRE_FLIGHT: skill("fork-build") OBLIGATOIRE avant tout build|deploy|rebuild

COMMITS: `type(scope): summary`  type=feat|fix|docs|chore|refactor|test  scope=core|opencode|tui|app|desktop|sdk|plugin
ex: `fix(tui): simplify thinking toggle styling`

STYLE:
- Single fn unless composable/reusable. Inline single-use values (no extracted const used once).
- Extract helper only if reused/complex boundary/clear independent name. No preemptive extraction.
- NO: try/catch|any type|else|unnecessary destructuring
- PREFER: Bun APIs(Bun.file())|type inference|fn array methods(flatMap|filter|map)+type guards|const>let|ternaries/early returns>reassignment/else
- src/config: follow `export * as ConfigX from "./x"` pattern
- Main fn=happy path; details→helpers below. sync unless effectful.
- Prefer Schema.UnknownFromJsonString / Schema.decodeUnknownOption over JSON.parse+Effect.try
- Comments: non-obvious constraints only.
- Drizzle: snake_case fields (no string redef).
```
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
})
```

TEST: no mocks|test impl not logic|run from pkg dirs(not root)
TYPECHECK: `bun typecheck` from pkg dirs, never `tsc` directly
