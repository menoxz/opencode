# P03 — Revalidation (réécriture complète, vague 4)

Revalidateur indépendant. Je n'ai rédigé ni la proposition d'origine, ni son verdict, ni la
révision. Je n'ai écrit aucun fichier sous `packages/**`, n'ai touché à aucun registre et
n'exécute aucune commande `git`.

## Proposal

`docs/harness-audit/proposals/P03-mcp-catalog-health-gate.md` — 817 lignes, 9 sections,
lue intégralement par plages exactes. Provenance : `CORRECTIONS.md:31` (**C-21**, défaut
d'orchestration) et `REVALIDATION-STATUS.md:16` / `:52` la classent parmi les 5 révisions
corrompues à refaire ; `CORRECTIONS.md:70` (**C-61**) la compte parmi les 6 jamais
revalidées. Cette revalidation est donc l'acte que C-21 exigeait.

Objet : ne pas livrer au modèle les outils d'un serveur MCP dont le compteur de santé
`healthFailures` est non nul alors que son statut est encore `connected`.

Les 7 Required changes du verdict d'origine sont, à l'exception de ce qui touche O7/O8,
effectivement traités **dans le texte** — vérifié et non repris (§ *Revisions applied*).

## Revisions applied

Vérification par lecture de la source, pas par reprise des declarations.

**O1 — chemins `src/` + fichier neuf — VÉRIFIÉ TRAITÉ.**
`proposition:645` `### Test 1 — packages/opencode/src/mcp/catalog-health-gate.test.ts
(**fichier neuf**)` ; `:650` explique la séparation `src/` (unitaires) / `test/`
(intégration) ; `:652` mesure l'absence de collision. `:703` et `:721` utilisent
`src/session/tools-allowlist.test.ts` et `src/mcp/reconnect-policy.test.ts`, qui existent
tous deux (`read` réussi sur chacun). La ligne `proposition:815` consigne le chemin fautif
`test/mcp/reconnect-policy.test.ts` comme supprimé.

**O2 — suppression des « outils fantômes », bénéfice `slots` +5 — VÉRIFIÉ TRAITÉ.**
Source lue : `tools.ts:767` `const slots = Math.max(0, configuredMax - requiredCount -
activations.get(input.session.id).size)` et `tools.ts:253` (`requiredCount` … `+ 1`).
Le mécanisme de gain est arithmétiquement cohérent avec la source.

**O3 — chiffrage séparé par mode, `INFERE` conservés — VÉRIFIÉ TRAITÉ.**
`tool-catalog.ts:298` `if (!options.enabled) return { tools: catalog.tools, mode: "full",
reason: "disabled" }` cité verbatim, et `:296` `const threshold = options.threshold ?? 30` :
la distinction de mode invoquée par le chiffrage existe bien dans la source.

**O4 — borne de latence 30 000 ms — VÉRIFIÉ TRAITÉ.**
`index.ts:840` `const healthInterval = cfg.experimental?.mcp_health_interval_ms ??
defaultMcpHealthIntervalMs` et `index.ts:847` `Effect.delay(Duration.millis(healthInterval))`.
`reconnect-policy.test.ts:10-12` verrouille `defaultMcpHealthIntervalMs` à `30_000`.
La borne annoncée `proposition:618` est donc étayée, et non posée.

**O5 — `tool-catalog.ts:107` / `:114` citées verbatim — VÉRIFIÉ TRAITÉ, citations exactes.**
`:107` est bien `ttlMs = 30_000,` et `:114` bien
`if (cached && now - cached.createdAt < ttlMs) return { catalog: cached, hit: true }`.
Les étiquettes de plage `:103-108` et `:113-118` sont exactes.

**O6 — trois étiquettes de plage réparées, élision supprimée — VÉRIFIÉ TRAITÉ.**
(a) `tools.ts:206-219` est la plage exacte : `206` `const mcpServers = …`, `:210`
`if (!item.execute) continue`, `:213`/`:214`/`:217` les champs d'entrée ; l'étiquette
faultive `211-216` est absente du texte vivant. (b) `index.ts:266-273` : les 6 seules
occurrences sont des méta-mentions (`:175` note de correction, `:782` ligne de résidu,
`:801` traçabilité, `:814`-`:816` tableau des citations supprimées) — **aucune citation
vivante**. (c) `reconnect-policy.test.ts` `:10-12`, `:18-21`, `:23-25` sont les trois
plages réelles de ce fichier, lues et correctes ; « ligne 5 » a disparu.

**O11 / O12** : le seuil « 4 pass / 0 fail après » et l'invariant « exit ≠ 0 et 0 test
exécuté avant » sont énoncés (§7 et `:696`). **L'invariant d'avant-état est confirmé par
mesure** : `bun test src/mcp/catalog-health-gate.test.ts` dans `packages/opencode` →
`CATALOG_HEALTH_GATE_BEFORE_EXIT=1`, sortie `The following filters did not match any test
files … 1621 files were searched`, donc **0 test exécuté**. Le seuil « après » reste, lui,
invérifiable tant que le fichier n'existe pas — c'est normal et non bloquant.

**Aucune citation fausse constatée.** Les trois citations que j'ai soumises à contrôle
loupe (`tool-catalog.ts:107`/`:114`, `tools.ts:206-219`, `reconnect-policy.test.ts:10-12`)
sont exactes au caractère près. J'ai vérifié aussi le contrôle positif annoncé `:696` :
`Select-String` sur `src/mcp/index.ts` donne **8** occurrences de `healthFailures`
(les lignes 202, 362, 724, 804, 807, 808, 809, 896) et **0** pour `isCatalogEligible`,
`readiness`, `unavailable_tools` — les trois zéros sont donc des zéros réels, la recherche
fonctionnant (conformément à **C-66**, un zéro n'est cru que si le motif a matché au moins
une fois ailleurs).

## Status

- `bun typecheck` → **`TYPECHECK_EXIT=0`** (état fourni, non rejoué ; bun 1.4.2).
- Avant-état du fichier de test neuf : **exit 1, 0 test exécuté** (mesuré par moi).
- `test/shell/shell.test.ts` : **12 pass / 0 fail**, verte et stable (**C-47**,
  `CORRECTIONS.md:57`). C'est la base de non-régression de la vague 4.
- `test/tool/shell.test.ts` : **instable** (64/31/2 puis 65/30/3, 44 `Repeated call
  blocked`). Jamais employée comme porte par ce dossier ; la proposition la contourne par
  construction et le motif est exact.
- La proposition déclare 12 résidus et « aucun `open` ». **Cette déclaration est fausse
  pour trois d'entre eux** (O7, O8, O9 ci-dessous).

## Remaining objections

Statut en tête de chaque ligne, conformément à la règle 4 du gabarit.

| statut | objection | fondement |
| --- | --- | --- |
| `accepted` | O1 chemins `src/` + fichier neuf | traité, `:645` `:650` `:703` `:721` `:815` |
| `accepted` | O2 outils fantômes, `slots` +5 | traité, `tools.ts:767` `:253` |
| `accepted` | O3 chiffrage par mode | traité, `tool-catalog.ts:298` `:296` |
| `accepted` | O4 borne 30 000 ms | traité, `index.ts:840` `:847`, `reconnect-policy.test.ts:10-12` |
| `accepted` | O5 `tool-catalog.ts:107`/`:114` | traité, citations exactes |
| `accepted` | O6 trois étiquettes + élision | traité, aucune citation vivante fautive |
| `accepted` | O11 seuil 4/0 après | énoncé, invérifiable avant implémentation |
| `accepted` | O12 invariant d'avant-état | **confirmé par mesure** (exit 1, 0 test) |
| **`open`** | **O7 seuil `> 0` — arbitrage inexistant** | `:753` dit « Le validateur tranche » ; `:745` porte `NEEDS_REVIEW` ; la ligne de résidu `:783` ne cite ni validateur ni opérateur, ni date, ni fichier. Le verdict d'origine qualifiait ce point de « décision de conception », non objection classée. Recherche d'un arbitrage : `CORRECTIONS.md` → 2 occurrences de `P03` (**C-21**, **C-61**), aucune sur le seuil ; `REVISIONS.md` → **0** correspondance pour `mcp`/`catalog`/`health`/`isCatalogEligible` ; `REVALIDATION-STATUS.md:52` → `C-21 — refaire depuis un fichier propre`. Une recommandation n'est pas un arbitrage, et une proposition ne s'auto-arbitre pas. **Bloquant.** |
| **`open`** | **O8 déduplication harnais — décision non citée** | la ligne de résidu `:784` affirme « Décision du validateur : « pas de déduplication exigée » » **sans aucune citation** (ni fichier, ni ligne, ni date) ; le sujet est posé à `:755` et n'est repris nulle part ailleurs. Même recherche, même absence dans les trois registres. Cite-la ou classe `open`. **Bloquant.** |
| **`open`** | **O9 valeurs de tokens `INFERE` — argument d'impact non mesuré** | `:610-614` : « Tokens retirés : `INFERE` ~4 000-5 000 par requête ». Ce chiffre est le **gargument d'impact** du correctif (le gain de tokens par requête est la justification du gate), pas un simple encadrement : il est `INFERE`, non mesuré, et sert à chiffrer le bénéfice. Le seuil `open` s'applique. Mesure de levée possible et peu coûteuse : compter les entrées réellement écartées sur un catalogue réel. **Bloquant.** |
| `refused` | O10 « `test/shell/shell.test.ts` non mesurée » | **prémisse fausse.** `CORRECTIONS.md:57` (**C-47**) : `bun test test/shell/shell.test.ts` → **12 pass / 0 fail, `SHELL_TEST_EXIT=0`** ; verte donc stable, et désignée « base de non-régression de la vague 4 ». La proposition affirme pourtant « non mesurée » à `:403` et `:602`. Un `out_of_scope` fondé sur une absence de mesure inexistante est mal fondé : l'objection est **réfutable**, donc `refused`. Réserve de forme, non bloquante : les deux passages fautifs doivent être rectifiés, la base correcte étant `test/shell/shell.test.ts` (12/0) et non `test/tool/shell.test.ts`. |

**Trois résidus `open`** (O7, O8, O9). Un seul suffit à interdire l'implémentation ; il y en a
trois.

## Regressions introduced

**Aucun test vert n'est cassé.** Je le déclare explicitement, comme l'exige la règle 1.

Justification : le correctif est un `export` pur ajouté à `src/mcp/index.ts` et un filtre
dans `tools()` ; les tests listés aux `:597`-`:603` sont analysés et les assertions
concernées (`lifecycle.test.ts:275`/`:306` sur `catalogVersion`) ne bougent pas puisque
`catalogVersion` n'est pas touché. À froid `healthFailures` est vide, donc
`isCatalogEligible(0) === true` et le comportement reste identique.

Réserve honnête : je n'ai **pas exécuté** la suite de tests existante après correctif —
elle n'existe pas encore. Mon affirmation porte sur l'analyse du périmètre, pas sur une
exécution. Elle devra être confirmée par la porte non-régression
`bun test test/shell/shell.test.ts` (12/0) au moment de l'implémentation. Aucun test déjà
rouge ne casse davantage : le correctif ne touche ni `src/tool/shell.ts` ni
`packages/core/src/launch-retry.ts`.

## Final verdict

REVALIDATED-FAIL

Les 7 Required changes du verdict d'origine sont,intacts ou non : O1→O6 sont vérifiés
traités, et les deux questions de §9 ont reçu une réponse. Le motif du `FAIL` n'est donc
**pas** des Required changes intacts, mais les trois résidus `open` O7, O8 et O9 : la
règle 1 interdit `REVALIDATED-PASS_WITH_CHANGES` dès qu'un `open` subsiste, et
`REVALIDATED-FAIL` est la seule chaîne non implémentable.

Ce qui débloque, par ordre de coût croissant, sans nouvelle réécriture :

1. **O7** — un validateur ou l'opérateur tranche le seuil (`> 0` ou `> 1`) et la décision
   est écrite dans un registre, avec auteur et date. Le test `:662`/`:666` attend `> 0` :
   trancher `> 1` impose de réécrire ces assertions.
2. **O8** — produire la décision de déduplication invoquée à `:784`, ou la retirer.
3. **O9** — mesurer le nombre d'entrées écartées sur un catalogue réel, ou requalifier le
   chiffre en borne non opposable en retirant sa portée d'argument d'impact.
4. **O10** — rectifier « non mesurée » en `:403` et `:602` (base réelle : 12/0, **C-47**).

## Grille d'effort — P03

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| `isCatalogEligible(failures)` — export pur, seuil de retrait | XS | `packages/opencode/src/mcp/index.ts` (ajout à côté de `shouldDisconnectAfterHealthFailures`, `:202`) | inclus dans le fichier neuf | aucun — aucun `expect` existant ne référence ce symbole (`:597`) |
| `readiness()` — surface de diagnostic par serveur | S | `packages/opencode/src/mcp/index.ts` | inclus dans le fichier neuf | aucun |
| filtre catalogue sur `s.healthFailures` dans `tools()` | S | `packages/opencode/src/mcp/index.ts` (boucle `:1139`, filtre `:1135-1137`) | inclus dans le fichier neuf | `test/tool/mcp.test.ts` — comportement identique à froid, mais relire avant patcher |
| `unavailable_tools` — ligne d'annonce, échappement `<>` | S | `packages/opencode/src/mcp/index.ts` | inclus dans le fichier neuf | `test/mcp/lifecycle.test.ts:275`/`:306` (`catalogVersion`) — ne pas l.incrementer |
| fichier de test neuf, 4 tests, seuil 4/0 | S | `packages/opencode/src/mcp/catalog-health-gate.test.ts` (**créer**) | `isCatalogEligible(0) === true` ; `(1) === false` ; `(2) === false` ; table `[0..4] → [true,false,false,false,false]` | aucun — fichier inexistant, avant-état exit 1 / 0 test |
| porte de non-régression | XS | — (`test/shell/shell.test.ts`) | aucune écriture | aucun — **12 pass / 0 fail** (**C-47**) ; ne jamais utiliser `test/tool/shell.test.ts`, instable |
| levée de O9 (mesure du gain de tokens) | M | `packages/opencode/src/mcp/index.ts` (instrumentation éphémère, à retirer) | aucun fichier, mesure ponctuelle | aucun — ne pas committer d'instrumentation |
| arbitrage O7 / O8 | XS | aucun — écriture de registre | aucun | aucun |