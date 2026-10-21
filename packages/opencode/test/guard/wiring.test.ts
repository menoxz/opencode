import { describe, expect, test } from "bun:test"

/**
 * Garde de câblage : `SessionPrompt` reçoit `Guard` par la **construction du layer**, jamais par un
 * `yield*` exécuté dans le corps d'une méthode.
 *
 * Pourquoi un test source et pas un test de type : un `yield* Guard.Service` placé dans le corps d'un
 * `Effect.fn` est **invisible au typecheck**. Mesuré le 2026-10-21 : `const probe: Effect.Effect<A> =
 * runLoop(...)` compile alors que `runLoop` exige `Guard.Service`. La panne n'apparaît donc qu'à
 * l'exécution, dans le contexte du handler serveur qui ne fournit pas `Guard` : 500 « Service not
 * found: @opencode/Guard » sur chaque prompt (err_fd391ce8 le 2026-10-20, err_f6c706d7 le 2026-10-21,
 * deux fois la même panne réintroduite en réécrivant le bloc des garde-fous).
 *
 * Le test est délibérément textuel : il doit rester vrai même si le typecheck ne voit rien.
 */
describe("wiring SessionPrompt × Guard", () => {
  const source = () => Bun.file(new URL("../../src/session/prompt.ts", import.meta.url)).text()

  test("Guard.Service n'est résolu qu'à la construction du layer", async () => {
    const text = await source()
    const code = text
      .split("\n")
      // Les commentaires expliquent justement le piège et citent la forme interdite : on les retire
      // avant de compter, sinon le test échouerait sur sa propre documentation. Le motif tolère les
      // fins de ligne CRLF mixtes de ce fichier (un `//.*$` ne mord pas sur un `\r` final).
      .map((line) => line.replace(/(^|\s)\/\/[^\r\n]*/g, "$1"))
      .join("\n")
    const matches = [...code.matchAll(/yield\*\s*Guard\.Service/g)]
    expect(matches).toHaveLength(1)
    // L'unique occurrence est la capture de construction, réutilisée ensuite comme `guard`.
    expect(code).toContain("const guard = yield* Guard.Service")
    expect(code).toContain("const guardService = guard")
  })

  test("le chargement des gardes lit la capture et non un service redemandé", async () => {
    const text = await source()
    expect(text).toContain("yield* guard.summary()")
    expect(text).not.toContain("(yield* Guard.Service)")
  })
})
