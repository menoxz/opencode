# Verdict de validation — H2

## Proposal
`H2` — Cache de prompt explicite sur le provider réellement utilisé. Fiche validée : `docs/releases/v2.4.0/items/H2.md` (289 lignes).

## Validator
Agent indépendant : n'a ni rédigé ni relu la fiche avant de l'auditer. Aucun fichier source
modifié ; seules des lectures et des `grep` ont été exécutés.

## Status
`PASS_WITH_CHANGES`
Le diagnostic client est exact et vérifié ligne à ligne : pour `opencode-go/deepseek-v4.1-flash`,
la garde `transform.ts:464-476` court-circuite `applyCaching` et `transform.ts:1119-1121` ne pose
pas `promptCacheKey`. Le correctif est le plus léger possible (élargir une seule condition sous un
déclencheur de capacité), le critère §7 est un **écart absolu**, jamais un ratio, et la question
irrésolue côté serveur est honnêtement marquée `INFERE:`. Le statut n'est pas `PASS` pour une raison
actionnable : la fiche renvoie la preuve de §7.2 « au test du §8 », or le §8 décrit un serveur
*scripté* qui fabrique lui-même `cached_tokens` — un mock ne peut pas répondre à l'`INFERE:`.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok — 13/13 | `provider/transform.ts:461` (`export function message`), `:464-476` (garde), `:475` (`msgs = applyCaching(...)`), `:386-394` (bloc `openaiCompatible`/`copilot`/`alibaba`), `:1119-1121`, `:1185-1189`, `:1165` (`includes("gpt-5")`), `:1192` (venice), `:1196` (openrouter), `:1088` (azure) ; `provider/provider.ts:1151` (`?? "@ai-sdk/openai-compatible"`), `:1441-1443` (famille deepseek) ; `packages/llm/src/cache-policy.ts:42` (`RESPECTS_INLINE_HINTS`), `:100` — toutes relues et conformes |
| le correctif supprime bien la cause racine | ok (volet client) | la cause côté client est « aucun marqueur de cache émis » ; le patch pose `promptCacheKey` pour la famille compatible sous un déclencheur borné et **ne touche pas** la garde `applyCaching` (`:464-476`). La cause côté serveur (cache-t-il ?) reste, à raison, une question ouverte `INFERE:` |
| le critère §7 est ABSOLU et MONOTONE | ok | §7.2 mesure `uncached = prompt_tokens − cached_tokens`, **écart absolu**, exige `uncached_2 < uncached_1` et `cached_2 > 0` (contrôle positif `uncached_2 === uncached_1` sans patch). Aucun ratio à dénominateur réduit par le patch : le piège de l'objection O1 de `P19-verdict.md` est explicitement écarté (H2.md:228-229) |
| les tests §8 sont exécutables ici | ok, réserve | `packages/opencode/test/provider/` existe (`transform.test.ts`, `cache-anchor.test.ts`) ; les cas 1-2 reproduisent le motif `ProviderTransform.options({...})` de `transform.test.ts:41-45` ; le motif `Bun.serve` cité au cas 3 est bien `test/session/system.test.ts:182-193`. Réserve : le cwd (`packages/opencode`) n'est pas indiqué |
| les régressions potentielles sont nommées et réelles | ok | `test/provider/transform.test.ts` (tests `setCacheKey` à `:49`, `:58`, `:67`), `test/provider/cache-anchor.test.ts`, `test/session/cache-prefix.test.ts`, `test/session/llm.test.ts` existent tous |
| les `INFERE:` sont dûment marqués avec méthode | ok | §2 `INFERE:` (H2.md:103-112) : méthode en 3 étapes — intercepter le corps sortant, rejouer deux appels identiques et lire `usage.cached_tokens`, renoncer si HTTP 400. Méthode correcte et bornée |
| l'effort §9 est réaliste | ok | `M` justifié : patch court, coût réel = la preuve (rejeu instrumenté, non-altération) |

## Objections

### O1 — MAJEUR. La preuve de §7.2 est renvoyée « au test du §8 », mais le §8 ne peut pas la produire

H2.md:116 affirme que le relevé `cached_tokens` « **doit être établi par le test du §8**, pas supposé
ici », et H2.md:244 renvoie de même à l'étape `INFERE:` du §2. Or le §8 cas 3 (H2.md:264-266) décrit
un « serveur local (`Bun.serve`) qui répond `usage.prompt_tokens_details.cached_tokens` = 0 au 1ᵉʳ
appel puis > 0 au 2ᵉ lorsque la clé est présente ». Un serveur scripté **fabrique la réponse qu'il
est censé observer** : il prouve que le client émet la clé (`§8.1`) et que le champ round-trip, mais
il ne peut pas dire si le serveur `opencode-go` réel honore un champ de cache — c'est précisément la
question `INFERE:` de H2.md:103-110, dont la méthode (étape 2) exige un **rejeu contre l'endpoint
réel** et la lecture de `usage` réel.

**Ce qu'il faut changer** : séparer explicitement (a) le test de plomberie `§8.3` — mock, à étiqueter
comme tel, qui ne prouve que l'émission ; et (b) une **mesure de rejeu live** contre
`opencode-go/deepseek-v4.1-flash` (usage enregistré, deux appels identiques) comme seule preuve
admissible de §7.2 / de l'`INFERE:`. Tant que (b) n'existe pas, §7.2 doit être déclaré reporté, non
« établi par le §8 ».

### O2 — MINEUR. Plages de lignes incohérentes pour `transform.test.ts` et pour `options()`

- H2.md:203 cite `transform.test.ts:49-72` ; H2.md:208-209 cite `:5-72`. Les tests `promptCacheKey`
  réels vont de `:40` à `:83` (vérifié : `:40` `setCacheKey true`, `:49` `false`, `:58` `undefined`,
  `:67` `{}`, `:72` provider `openai`) ; la ligne 5 n'est pas un test. Aligner sur `:40-83`.
- H2.md:131 cite `options()` à `transform.ts:1075-1205` ; le corps commence en réalité à `:1070`
  (`const result: Record<string, any> = {}`), la signature juste avant. Citer la ligne de signature.

### O3 — MINEUR. La commande de test ne fixe pas le répertoire courant

`bun test --timeout 30000 ./test/provider/...` doit être lancé depuis `packages/opencode`
(`bunfig.toml` bloque l'exécution depuis la racine du dépôt). Non précisé (§7 ligne 242, §8 ligne 252).

## Required changes

1. **Séparer la plomberie de la preuve** : étiqueter `§8.3` comme mock (émission de la clé seulement)
   et ajouter une **mesure de rejeu live** contre l'endpoint réel (`opencode-go/deepseek-v4.1-flash`,
   `usage.cached_tokens` enregistré) comme seul support de §7.2 / de l'`INFERE:` ; sinon, requalifier
   §7.2 en `cached_2 === 0` documenté (voir H2.md:286-288).
2. **Aligner les citations** : `transform.test.ts:40-83` (au lieu de `:49-72`/`:5-72`) ; citer la
   ligne de signature de `options()` (≈ `:1068`), pas `:1075`.
3. **Fixer le cwd** `packages/opencode` dans les commandes de §7 et §8.

## Implementation guidance

Ordre : (1) trancher le déclencheur — (a) `providerOptions?.setCacheKey` (aucun changement dans
`provider.ts`, mais piloté par l'opérateur) ou (b) capacité catalogue exposée à `provider.ts:1441`
(nouveau champ, aucun provider en dur dans `transform.ts`) ; (2) n'élargir **que** la condition
`promptCacheKey` (`transform.ts:1119`), jamais la garde `applyCaching` (`:464-476`) ; (3) écrire le
test par mutation (déclencheur actif → clé présente ; désactivé → `undefined`).

Pièges : ne pas casser `transform.test.ts:49/58/67` (`setCacheKey` faux/absent ⇒ `undefined`) ni
`cache-anchor.test.ts` (le modèle anthropic doit garder `applyCaching`). Garder strictement
`input.sessionID` comme clé (pas de clé partagée inter-sessions).

Tests à ne pas oublier (depuis `packages/opencode`) :
`bun test --timeout 30000 ./test/provider/prompt-cache-openai-compatible.test.ts ./test/provider/transform.test.ts ./test/provider/cache-anchor.test.ts ./test/session/cache-prefix.test.ts`
