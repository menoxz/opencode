# Garde-fous injectables — spec

But : rendre une consigne **présente au moment où elle sert**, au lieu de l'espérer présente depuis le
début du tour. Un garde-fou est un fichier markdown court, découvert comme une skill, dont
l'**injection est conditionnée** par l'état réel du tour (tokens écoulés, pression de contexte,
compaction, appels d'outils, erreurs). Métaphore juste : réflexe, pas mémoire — le réflexe se
déclenche sur un stimulus mesurable, pas sur un espoir.

Mesure qui motive le dispositif : sur une session réelle, 13 steps ont dépassé 3 appels d'outils et
la règle « déléguer au-delà de 3 appels » ne s'est **jamais** déclenchée (0 sur 13). La consigne
existait, écrite en prose, et n'a jamais été convoquée. Un garde-fou à déclencheur mesurable aurait
tiré.

## Périmètre

Dans le périmètre : format de fichier, déclencheurs, point d'injection, budget anti-bruit,
observabilité, plan de test.
Hors périmètre : modification du comportement des skills, réécriture d'`AGENTS.md`, interface
graphique de réglage.

## Format de fichier

Dossier `~/.config/opencodev2/guards/` (global) et `<projet>/.opencode/guards/` (projet), un
`.md` par garde-fou, frontmatter YAML identique à celui des skills pour rester prévisible :

```markdown
---
name: delegate-before-diving
description: Rappelle la délégation quand un tour accumule des appels d'outils
when:
  tool_calls_in_turn: ">= 4"
  max_per_turn: 2
---
Au-delà de 3 appels d'outils dans le même tour, déléguer ou justifier en une ligne pourquoi non.
```

Le corps est injecté **verbatim**, comme les `jev.guard.rules` — pas de rendu, pas de substitution :
ce qui est écrit est ce qui arrive. `name` unique, `description` courte (sert au journal, pas au
classement).

## Déclencheurs — ce qui prédit réellement la dérive

Ce qui fait perdre une consigne n'est pas le nombre de steps en soi, c'est la **distance en tokens**
entre l'endroit où la consigne a été lue et l'endroit où la décision se prend. Un pas de 20 tokens et
un pas de 3 000 tokens (sortie d'outil) ne pèsent pas pareil. D'où le classement :

| Priorité | Déclencheur | Pourquoi celui-là | Seuil de départ |
|---|---|---|---|
| 1 | `since_last_tokens` | mesure directe de la décroissance de saillance ; indépendant de la taille des sorties d'outils | `>= 20000` |
| 2 | `context_ratio` | la dégradation s'aggrave avec le remplissage ; au-delà de 0,8 la compaction approche et réécrit l'historique | `>= 0.65` |
| 3 | `after_compaction` | après une compaction la consigne survit (segment système) mais **la preuve qui l'a déclenchée a disparu** ⇒ re-tirer une fois | `= true` |
| 4 | `tool_calls_in_turn` | proxy du risque « on avance sans arbitrer » ; c'est le cas mesuré à 0/13 | `>= 4` |
| 4b | `tool_calls` | cible un outil précis : « 12 appels à bash » n'a pas le même sens que « 12 appels » ; nom validé contre le registre, outil absent compté 0 | `{ bash: ">= 12" }` |
| 5 | `error_streak` | deux échecs consécutifs ⇒ la méthode en cours ne marche pas, la consigne de repli doit revenir | `>= 2` |
| 6 | `repeat_action` | même outil, mêmes arguments, deux fois ⇒ boucle ; le garde-fou casse la répétition | `>= 2` |
| 7 | `steps_in_turn` | borne haute du tour ; utile seulement si les tokens ne sont pas fiables | `>= 8` |
| 8 | `path_match` | cible le garde-fou sur les fichiers qu'il concerne (globs) ; évite d'injecter les règles `webui` sur une tâche `sqlite` | globs |
| 9 | `turns_since_injection` | filet de sécurité : une consigne utile ne doit pas disparaître pour toujours | `>= 3` |
| 10 | `agent` / `phase` | restreindre à un agent (plan, build, orchestrator) ou à une phase | liste |

Déclencheurs **explicitement écartés** : la fréquence « tous les N steps » (aveugle à la taille du
contexte, tire au mauvais moment), le tour absolu (un tour long et un tour court ne se comparent
pas), la position dans la session (sans rapport avec la dérive).

Les seuils sont écrits en opérateur + valeur (`">= 4"`, `"= true"`, `["src/**"]`) pour rester
compréhensibles sans lire le code, et parsés par un validateur strict : un opérateur inconnu refuse
la garde au chargement avec un message, il ne l'ignore pas en silence.

### Provenance de chaque signal dans le code

Aucun signal n'est à inventer : tous existent déjà dans la boucle de step.

| Signal | Source |
|---|---|
| `step`, `steps_in_turn` | compteur de boucle et `step++` (`session/prompt.ts:1957`) |
| `context_ratio`, `after_compaction` | `compaction.isOverflow({ tokens: lastFinished.tokens, model, messages })` (`session/prompt.ts:1994`) |
| `since_last_tokens` | `lastFinished.tokens`, entre deux injections de garde |
| `tool_calls_in_turn`, `repeat_action` | parties `tool` du tour (`hasToolCalls`, `session/prompt.ts:1850`) |
| `tool_calls` | nom d'outil des parties `tool` du tour (`part.tool`), compté par nom dans `guard/state.ts` |
| validation des noms d'outils | registre réel lu en optionnel (`Effect.serviceOption(ToolRegistry.Service).ids()`), sinon outil compté à zéro |
| `path_match` | chemins des parties `edit`/`read` du tour |
| `error_streak` | dernier `toolExitCode` non nul |
| injection | `system.push` (`session/prompt.ts:2349`) pour les instructions ; queue `<system-reminder>` pour le variable |

Le schéma de config actuel ne connaît que des chemins d'instruction en chaînes nues
(`instructions: Schema.Array(Schema.String)`, `config/config.ts:262`) : il ne porte aucune condition,
d'où une clé `guards` séparée, plutôt que de surcharger `instructions` d'un objet polymorphe qui
casserait les configs existantes.

## Où injecter, et pourquoi pas dans le segment système

Point d'injection retenu : la **queue volatile**, en message de rôle `user` ouvrant sur
`<system-reminder>`, exactement le mécanisme qui exclut déjà la guidance du calcul d'ancre de cache
(`provider/transform.ts:346-357`, `session/prompt-methodology.ts:5`).

Raison : le segment système doit rester **octet-stable** pour que le cache de préfixe tienne
(`session/prompt.ts:2349`). Un garde-fou qui tire à certains steps et pas à d'autres, injecté dans le
système, re-facturerait tout le préfixe à chaque changement. En queue, il profite en plus de la
position la plus récente — celle qui pèse le plus — et disparaît au step suivant, donc il ne
s'accumule pas.

Ordre dans la queue : les garde-fous passent **après** la guidance du harnais et **avant** rien
d'autre ; un garde-fou ne doit jamais précéder une consigne d'état (working-state, plan).

## Budget et anti-bruit

Deux garde-fous simultanés au maximum par step, et un plafond dur de 600 caractères injectés par
step, tous garde-fous confondus ; au-delà, les candidats sont triés par priorité de déclencheur puis
tronqués. Sans ce plafond, le dispositif recrée exactement le problème qu'il corrige : un mur de
consignes ignoré.

Règles de non-répétition :
- une même garde ne tire pas deux fois dans le même step ;
- `max_per_turn` (défaut 2) borne les répétitions sur un tour ;
- si la garde a déjà tiré à moins de `since_last_tokens / 2` tokens, elle ne retire pas.

## Observabilité — la condition pour que ce ne soit pas de la prose de plus

Chaque injection écrit une ligne de journal : `service=guard name=… reason=… step=… tokens=…`, et
l'injection porte `metadata.injection = "guard"` avec le nom, comme les instructions portent déjà
`metadata.injection = "instructions"` (`session/prompt.ts:2240-2254`). Sans cette trace, on ne peut
ni mesurer l'effet ni distinguer « n'a pas tiré » de « a tiré et n'a pas été suivi » — c'est
précisément l'angle mort qui a coûté cette session.

Instrument associé : `packages/opencode/script/session-rules.ts` compte déjà par step les appels
d'outils et la délégation ; il suffit d'y joindre les injections de garde pour obtenir, sur une même
session, le nombre de tirs et le comportement qui a suivi.

## Évaluation — testable sans modèle

Le cœur est une fonction pure :

```
shouldInject(guard, state) -> { inject: boolean, reasons: string[] }
```

avec `state = { step, turn, toolCallsInTurn, tokensSinceLastGuard, contextRatio, afterCompaction,
errorStreak, repeatAction, lastPaths, agent, phase, turnIndex }`. Aucune dépendance au modèle, donc
testable en table de cas : un fichier de déclencheurs → un verdict attendu. C'est ce qui empêche le
dispositif de dériver : la règle est du code, pas une consigne.

Tests prévus (`packages/opencode/test/guard/`), dans l'ordre de valeur :
1. table de déclencheurs : chaque opérateur, seuil atteint / non atteint, plusieurs conditions = ET ;
2. budget : deux gardes candidates ⇒ la plus prioritaire passe, l'autre est retenue ; plafond de
   caractères respecté ;
3. non-répétition : deux steps consécutifs ⇒ un seul tir ; `max_per_turn` respecté ;
4. `after_compaction` : un tir exactement au step qui suit la compaction ;
5. découverte : une garde créée pendant la session entre au catalogue après rechargement — reprendre
   le motif du test `arms watchers for a second instance` (`test/skill/skill.test.ts`) pour ne pas
   réintroduire les deux trous corrigés en `5f8ee05d2` / `c7dedab05` ;
6. un opérateur inconnu refuse la garde avec un message, au chargement.

## MVP proposé

Trois déclencheurs seulement dans la première version — `since_last_tokens`, `tool_calls_in_turn`,
`after_compaction` — plus le budget et le journal. Les sept autres attendent qu'un cas réel les
réclame : un déclencheur qu'on n'utilise pas est un paramètre qui pourrira sans bruit.

## État d'implémentation (2026-10-20)

Livré et testé — 26 tests verts (`test/guard`, `test/config/guard.test.ts`), typecheck du paquet à
exit 0 :

- `src/guard/triggers.ts` — `compileGuard` (refus explicite et nommé), `shouldInject` (raisons portant
  la valeur observée), `selectGuards` (priorité + plafonds). Commits `8ebf87c9d`, puis `3fb7a1962`
  pour `limits`.
- `tool_calls` — onzième déclencheur : nombre d'appels d'un outil nommé, nom validé contre le registre
  réel lu en optionnel, outil absent compté zéro et signalé (`44aed46ba`, `a4bd99538`). Aligné dans le
  dry-run avec une garde d'exemple qui tire sur données réelles (`84a15bd11`).
- `src/guard/parse.ts` — parse d'un fichier de garde, **partagé** par le service et le dry-run :
  `6c8eb5258`. Un dry-run qui n'emprunte pas le chemin du service annonce ce qui aurait dû se passer.
- `src/guard/index.ts` — service de découverte, veilleurs par instance, catalogue et `errors()` :
  `ab1622d0b`, un seul chemin de rechargement depuis `6c8eb5258`.
- `src/config/guard.ts` + entrée `guards` dans `Config.Info` : `23bca4b55`.
- `script/guards.ts` — dry-run qui rejoue la décision sur une session réelle : `cabcff470`.
- `.opencode/guards/` — deux gardes réelles (`delegate-before-diving`, `long-turn-recheck`).

### Limites de répétition

`limits: { max_per_turn: N }` dans le frontmatter, `N` entier ≥ 1. Clé inconnue refusée
(`unknown limit "x" (known: max_per_turn)`), valeur non entière ou nulle refusée. Sans `limits`, la
seule borne est le budget du step — comportement testé, pour qu'une garde sans quota ne devienne pas
silencieusement plafonnée.

### Bloc de configuration

```jsonc
"guards": { "enabled": true, "max_per_step": 2, "max_chars": 600, "disable": [], "paths": [] }
```

Toutes optionnelles, donc un fichier sans bloc `guards` garde la conduite actuelle ; `guards: {}` est
valide ; les plafonds non positifs sont refusés plutôt que ramenés à une valeur de secours.

### Signaux : ce qui est mesuré, ce qui ne l'est pas

Alimentés depuis les messages du tour (`guard/state.ts`) : `tool_calls_in_turn`, `tool_calls` (par
nom), `error_streak`, `repeat_action`, `path_match`, `since_last_tokens`, `context_ratio`
(fenêtre réelle du modèle, `prompt.ts`), `steps_in_turn`, `step`, `turn`.

**Non fournis par la boucle**, et donc déclarés manquants plutôt qu'inventés (`af8bab394`) :
`after_compaction` (aucun drapeau de compaction dans la boucle), `turns_since_injection` (demande un
compteur persistant à l'échelle de la session), `phase` (notion inexistante aujourd'hui). Une garde
qui n'en dépend que par eux **ne peut pas tirer** ; le dry-run et le journal le disent.

### Reste à faire

1. Câbler `after_compaction` et `turns_since_injection` — ce sont des fonctionnalités, pas des
   correctifs : drapeau de compaction exposé à la boucle de step, compteur persistant des tours.
2. Décider du sort de `phase` : soit une notion de phase existe (plan/build/orchestrator), soit le
   déclencheur est retiré de la spec plutôt que laissé inerte.

### Affichage du chargement dans le stream

Le bloc `Context injections` joint au message utilisateur porte une section de plus, écrite une fois
par tour :

```
Context injections · 5 section(s)
- core: system prompt (PROMPT_CORE) · agent build · 5592 chars
- env: environment · 391 chars
- instructions: instruction files · 1 source(s) · 7742 chars
- skills: skill summary · 6883 chars
- guards: 6 globale(s) · 5 locale(s) · 132 chars
```

L'origine par garde est décidée par le **répertoire** d'où vient le fichier (`global` = répertoire de
config, sinon `project`), jamais par son contenu : une garde du dépôt qui porte le nom d'une garde
globale la remplace, et l'affichage annonce donc l'origine réellement chargée. Le détail
(`global: … | local: …`) donne les noms.

Deux pièges consignés parce qu'ils ont coûté du temps :

- le producteur du bloc est le tableau `contextSections` (`session/prompt.ts`, autour de la ligne
  2378) — **pas** `contextSummary` ; une section ajoutée via `contextSummary.add` est enregistrée et
  jamais rendue ;
- le format est extrait dans `session/injection-format.ts` et testé **contre le parseur réel de la
  webui** (`packages/webui/src/injections.ts`, `parseInjections`) : un test côté serveur avec le
  format recopié à la main validerait ce qu'on a écrit, pas ce qui est lu.

### Vérification après redémarrage

- Une garde qui tire laisse une ligne `service=session.prompt name=… reasons=… step=… chars=… guard injected`,
  et le bloc `[garde-fou: <nom>]` arrive dans la queue volatile.
- Un step sans tir ne laisse **aucune** ligne `guard injected`.
- Les signaux manquants produisent une ligne `guard signals unavailable` **une fois par tour**, pas une
  par step.
- Une garde écrite sur `phase` ne tire jamais et le journal explique pourquoi — c'est le test de la
  promesse « aucune garde morte silencieuse ».
