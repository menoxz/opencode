# Veille du 2026-10-10 — ce qu'une conversation DeepSeek révèle du harnais opencodev2

> Document de **veille et d'analyse**, pas une proposition au sens de `PROPOSAL-TEMPLATE.md`.
> Il ne suit donc pas les 9 sections, et il ne prétend pas être implémentable en l'état :
> il désigne des surfaces et des mesures à instruire.

## Source

Conversation partagée `https://chat.deepseek.com/share/l8zk58jv2zjft8scxk`
(« La différence de qualité d'output entre deux modèles LLM dépend de quoi ? » → « Et pour les skills et AGENTS.md ? »).

Le fil ne parle jamais d'opencodev2. Il parle de **modèles, de skills, de `AGENTS.md`,
de presets de raisonnement et de contexte long**. C'est précisément pour ça qu'il est
exploitable ici : ses conclusions portent sur le harnais, pas sur le fork.

## État de la mesure — à lire avant toute citation

- Branche `dev`, HEAD `77ae24463`, **137 entrées** modifiées/supprimées dans l'arbre de
  travail, `AGENTS.md` racine supprimé (non committé), pas de `.git/index.lock`.
- Tous les `fichier:ligne` ci-dessous sont ceux de **cet instant** et peuvent bouger.
  L'audit P01→P20 est en vol. **Deux registres de statut coexistent et se contredisent** (§7a).
- Trois reconnaissances ont été déléguées et **les trois ont livré** (skills/instructions ;
  paramètres provider ; compaction). La troisième a livré en dernier et a **rectifié une
  première version trop pessimiste de §5** — la réinjection en tête existe déjà.

## Ce que le fil établit, et qui a été vérifié à la source

Les chiffres du fil proviennent de l'article Vercel *« AGENTS.md outperforms skills in our
agent evals »*. Ils ont été relus dans l'article original, pas repris du fil :

| configuration | taux de réussite | vs baseline |
|---|---|---|
| baseline (aucune doc) | 53 % | — |
| skill, comportement par défaut | 53 % | **+0 pp** |
| skill + instruction explicite d'invocation | 79 % | +26 pp |
| `AGENTS.md` avec index de docs compressé (8 Ko) | **100 %** | +47 pp |

Trois faits supplémentaires du même article, tous décisifs :

1. **56 % des cas n'ont jamais invoqué la skill**, alors qu'elle était disponible.
2. En l'absence d'instruction explicite, la skill **ne fait pas mieux que l'absence totale
   de documentation**. Sur le sous-score *tests*, le défaut fait **moins bien que la
   baseline** (58 % contre 63 %) : une skill non utilisée n'est pas neutre, elle est du bruit.
3. La **formulation est fragile** : « You MUST invoke the skill » fait lire la doc en premier
   et rater le contexte projet ; « Explore project first, then invoke skill » réussit mieux.
   Même skill, même doc, résultat différent.

Théorie avancée par les auteurs, et c'est la partie actionnable : le contexte passif gagne
parce qu'**il n'y a pas de point de décision**, qu'il est **disponible à chaque tour**, et
qu'il **ne crée aucun problème d'ordonnancement**.

Réserve honnête : c'est un jeu d'évals sur Next.js 16, pas sur opencodev2. Le chiffre est un
signal, pas une preuve locale. Ce qui suit le convertit en mesures locales.

---

## §1 — Le canal passif est tronqué à 6 lignes par défaut

**Constat.** Le harnais réduit chaque fichier d'instruction à ses **6 premières lignes non
vides**, et c'est le mode **par défaut**.

```ts
// packages/opencode/src/session/instruction.ts:43-48
if (mode === "full") return `Instructions from: ${filepath}\n${content}`
const lines = content
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, 6)
```

```ts
// packages/opencode/src/session/context-rollout.ts:53-54
injectionSkills: "short",
injectionInstructions: "summary",
```

Conséquence chiffrée : `packages/opencode/AGENTS.md` pèse **7 109 caractères / 136 lignes**
(mesuré). À `CHARS_PER_TOKEN = 4` (`session/overflow.ts:11`), cela vaut **≈ 1 777 tokens**
dont **6 lignes seulement** sont injectées — soit ~1,5 % du fichier, et **0 % à partir de
la ligne 7**.

**Pourquoi c'est le point le plus coûteux du lot.** Le harnais mise son architecture sur le
canal que la mesure externe dit le moins fiable (les skills, §2) tout en amputant le canal
que la même mesure dit le plus fiable. Et le fichier d'instruction est **le seul endroit où
une règle s'applique sans décision du modèle** (`system.ts:28-29` : « Everything else is
loaded via skills on demand »).

**Effet de bord déjà présent dans l'audit.** `P20` est rescopée à « un seul diff dans §4
(`packages/opencode/AGENTS.md:15-17`, `tmux` → terminal géré) » (`CORRECTIONS.md:45`, C-35).
Or **la ligne 15 n'est jamais injectée** sous le profil par défaut. La proposition est donc
inert par défaut : son correctif existe, mais le canal ne le transporte pas. Ce n'est pas un
défaut de P20, c'est un défaut de la surface sur laquelle P20 s'appuie.

**Piste.** Deux niveaux :
- *Immédiat, sans code* : `instruction_injection.agents` accepte déjà `"full" | "summary" |
  "off"` (`config/instruction-injection.ts:5,10`) — le plafond de 6 lignes est donc levable
  par configuration.
- *Structurel* : remplacer le seuil de 6 lignes par un **budget en caractères** avec avis de
  troncature explicite, plutôt qu'une coupe muette à 6. Un plafond silencieux est ce que le
  fil appelle un point de décision caché : l'utilisateur croit avoir écrit une règle.

**Risque.** Le bloc d'instruction est **réinjecté à chaque pas** (`session/prompt.ts:2199-2201`)
et atterrit dans le préfixe mis en cache par le provider. Passer de ~50 à ~1 800 tokens est
absorbable **si** le bloc est stable (le cache le prend en charge) et coûteux s'il varie.
À mesurer, pas à supposer.

**Portée réelle — correction du tour 4.** Cette install **n'est pas concernée** : le § I1
ci-dessous établit que `C:\Users\jeanl\.config\opencodev2\opencode.json|jsonc` fixe
`instruction_injection.agents = "full"`. Le défaut à 6 lignes ne frappait donc que les
workspaces **sans** cet override — poste neuf, autre profil, ou projet qui écrase la clé. Le
correctif reste utile pour eux, et l'avis de troncature rend désormais toute coupe visible au
lieu de muette. Autrement dit : mon §1 décrivait un défaut réel du **harnais**, pas de votre
installation — la nuance manquait dans la première version de ce document.

## §2 — 73 % des skills n'ont jamais été chargées, et le dépôt le sait déjà

**Constat.** Le commentaire du code porte la mesure locale :

```ts
// packages/opencode/src/session/system.ts:294-295
// usage recency so the whole list (193 skills, 73 % never loaded once in
// 45 days) is not emitted when the turn carries no user text.
```

**193 skills, 73 % jamais chargées en 45 jours.** La mesure externe dit 56 % ; le harnais
mesure 73 % sur son propre corpus. Les deux convergent, et l'ordre de grandeur est plus
mauvais ici.

**Correction, apportée après lecture du code : le budget par usage existe déjà.**
`src/skill/usage.ts:1-19` **est** ce mécanisme. Le module documente la même mesure
(« 193 skills are installed, only 58 were ever loaded in 45 days, and 141 (73 %) have never
been loaded once ») et se donne pour objet de garantir que « the budget is always applied »,
avec `DISCOVERY_RESERVE = 10` pour qu'une skill neuve reste découvrable. Ma recommandation
initiale — « brancher la télémétrie qui existe déjà » — était donc **déjà satisfaite** : les
73 % ne sont pas un angle mort du harnais, c'est la justification écrite de ce module.

Ce qui reste réellement ouvert est plus étroit. Le déclenchement est **consultatif** :
`system.ts:302-304` ne fait que constater qu'une skill existe quand la tâche correspond, et
rien ne vérifie qu'une skill annoncée a été chargée. La seule rétroaction est un post-mortem
sans effet (`memory/post-mortem.ts:310-311`, déclenché `session/prompt.ts:2661-2674`).
Recherches d'absence : `failed to load a skill`, `should have loaded`, `missedSkill`,
`noSkillLoaded` → **0 correspondance**.

**Piste, dans l'ordre de rentabilité :**
1. **Corriger la formulation du déclencheur** (`system.ts:302-304`) — **fait**, voir
   « Implémentation » en fin de document.
2. **Vérifier le chargement** : rien ne constate qu'une skill annoncée a été chargée, alors
   que la mesure externe montre que 56 % des cas ne l'invoquent jamais.
3. **Convertir les échecs récurrents en contexte passif** plutôt qu'en nouvelle skill : c'est
   la recommandation explicite de l'article pour la connaissance horizontale.

**Réserve.** Une skill n'est pas toujours un échec : l'article reconnaît que les skills
gagnent sur les **workflows verticaux explicitement déclenchés** (« migre ma version »,
« passe à l'App Router »). La cible n'est donc pas « supprimer les skills », c'est
**arrêter de compter sur elles pour la connaissance générale**.

## §3 — Le catalogue de skills est reconstruit à chaque tour, dans le préfixe mis en cache

```ts
// packages/opencode/src/session/prompt.ts:2294-2296
// Inject available skills every turn so the agent can always discover them
const skillsStart = Date.now()
const skillsKey = `skills:${skillRev}:${agent.name}:${createHash("sha1").update(lastUserText ?? "").digest("hex")}`
```

La clé de cache **hache le dernier texte utilisateur** : le bloc change dès que l'utilisateur
change de sujet. Or il est poussé dans `system` (`prompt.ts:2341`), c'est-à-dire dans le
**préfixe mis en cache par le provider** — et `provider/transform.ts:346-366` documente
qu'un **seul octet qui varie dans `system` refacture toute la conversation**.

Le cache local est `injectionCache`, créé par `runLoop` (`prompt.ts:1732`) : il est
**porté par un run**, pas par la session. Il ne protège donc pas la frontière du cache
provider d'un tour à l'autre.

**Piste.** Ancrer le catalogue **une fois par session** (ou par palier), et laisser les
sélecteurs (Jev, `SkillSelect`, `SkillUsage`) seulement **classer** un ensemble stable,
jamais changer l'ensemble à chaque tour. Le fil classe l'« ordonnancement » et la
« disponibilité » comme les deux causes de la supériorité du passif : un catalogue qui bouge
réintroduit exactement le coût que le passif évite.

**Correction : ce n'est pas un trou de code, c'est une divergence de doctrine.**
Les chemins Jev (`jev/skills.ts:18`) et sélecteur LLM (`system.ts:245-278`) sont **sans plafond
par conception** — `config/jev.ts:165` le documente noir sur blanc (« there is NO fixed cap: it
may inject none, a few, or all, exactly as the request justifies »). Le plafond
`MAX_RELEVANT_SKILLS = 30` (`system.ts:34`) appartient à la branche de **repli déterministe**,
dont `skill/usage.ts:12` dit qu'elle « guarantees the budget is always applied ». Le ratchet CI
(`prompt-budget.test.ts:28,48-74`) encode donc un invariant de repli comme s'il était global :
c'est un écart entre le test et la doctrine, pas un défaut du code.

## §4 — Aucun garde-fou contre un paramètre silencieusement inopérant

Le fil documente, pour DeepSeek, une famille de pièges : `temperature` **ignoré** en mode
`thinking`, `top_p` avec un plancher à 0,95, un paramètre `tools` qui « **ne produit pas
d'erreur et ne prend pas effet** », un `reasoning_effort` sur une échelle 1–100.
Le point commun est le plus important : **le modèle accepte un contrôle et n'en fait rien.**

Le harnais a la même asymétrie, vérifiée :

```ts
// packages/opencode/src/session/llm/request.ts:179-183
temperature: input.model.capabilities.temperature
  ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
  : undefined,
topP: input.agent.topP ?? ProviderTransform.topP(input.model),
topK: ProviderTransform.topK(input.model),
```

`temperature` est **conditionnée par une capacité du modèle**. `topP` et `topK` **ne le sont
pas** : elles partent quel que soit le modèle et quel que soit le mode de raisonnement.

Et il n'existe **aucune** détection ni alerte :

- pas de drapeau de capacité par mode (« ce modèle ignore la température en mode
  raisonnement ») : `config/provider.ts:5-71` et `packages/core/src/models-dev.ts:44-95`
  n'ont que des booléens plats (`reasoning`, `temperature`) ;
- pas de chemin d'avertissement : une recherche `not supported | unsupported | ignored |
  silently | warn(` sur `src/provider` et `packages/llm/src/protocols` ne rend que
  `unsupportedContent` (contenu de message, sans rapport) ;
- les protocoles natifs émettent `temperature`/`top_p` **sans exclusion mutuelle** avec le
  mode raisonnement (`openai-chat.ts:283-287`, `openai-responses.ts:437-438`,
  `anthropic-messages.ts:464-465`) ;
- une régression de *drop* silencieux est **déjà enregistrée en test**
  (`test/provider/transform.test.ts:3806-3811`).

**Même famille, un cran plus loin : une troncature de sortie n'est pas marquée.** Quand le
modèle s'arrête sur la longueur, `finish === "length"` ne laisse aucune trace sur le message
(`processor.ts:728`, `message-v2.ts:669`) alors que le prompt est relancé automatiquement
(`prompt.ts:114,1883-1887`, borné par `AUTO_CONTINUE_LIMIT = 4`, `continuation.ts:5,61-84`).
Le modèle comme l'utilisateur voient une réponse complète qui ne l'est pas.

**Pourquoi c'est un défaut de harnais et pas un détail provider.** Le dépôt a déjà payé
cette classe de faute, deux fois, sous une autre forme : **C-03** (deux flags
`experimental.*_advisory` qui ne pilotent rien, `runtime-flags.ts:4`), et le constat C-04/C-29
sur un garde-fou dont la portée réelle était nulle. La leçon du fil est la généralisation :
**un contrôle déclaré qui ne fait rien est pire qu'un contrôle absent**, parce qu'il produit
de la confiance sans effet.

**Piste**, alignée sur la doctrine du dépôt (drapeau *default-off* + helper de garde pur) :
1. conditionner `topP`/`topK` comme l'est déjà `temperature` (`request.ts:182-183`) ;
2. émettre **un** avertissement journalisé quand un paramètre posé est écarté ou sans effet
   pour le mode actif — le point d'insertion naturel est le hook `chat.params`
   (`request.ts:169-189`) ;
3. ajouter le drapeau `RuntimeFlags` correspondant (`effect/runtime-flags.ts:16-56`) pour
   pouvoir prouver le comportement avant de l'activer.

**Note de cadrage.** Le harnais n'a **pas** de présets numériques d'effort : les paliers sont
littéraux — `["none","minimal","low","medium","high","xhigh","max"]`
(`packages/llm/src/schema/ids.ts:26`) — et le « preset » est en réalité le mécanisme de
**variantes par famille de provider** (`provider/transform.ts:545-553,651`). La question du
fil (« comment trouver le bon preset ? ») reste donc ouverte ici : rien ne relie un palier
d'effort à un résultat mesuré.

## §5 — Le motif « checkpoint → réinjection en tête » existe déjà ; ce qui manque est plus étroit

Le fil cite le plugin `dsh-context-checkpoint` comme remède à la perte de conclusions en
contexte long : à la limite → résumé écrit sur disque → compaction → **réinjection en tête
du contexte**.

**Ce motif est déjà en place, et je le corrige par rapport à ma première lecture.**
`filterCompacted` reconstruit la liste dans l'ordre
`[compaction-user, summary, ...queue retenue..., reste]` :

```ts
// packages/opencode/src/session/message-v2.ts:1365-1371
if (tailIndex >= 0 && tailIndex < compactionIndex && summaryIndex > compactionIndex) {
  return [
    ...result.slice(compactionIndex, summaryIndex + 1),
    ...result.slice(tailIndex, compactionIndex),
    ...result.slice(summaryIndex + 1),
  ]
}
```

Le résumé est un message assistant `summary: true` (`compaction.ts:835`), chaîné par
`prior.at(-1)?.summary` (`compaction.ts:705`), et il **survit au redémarrage** puisqu'il est
persisté en SQLite (`storage/db.ts:35`) et réinjecté à chaque tour
(`prompt.ts:1746,1779,2783`). Le gabarit préserve en outre explicitement ce que le fil
reprochait aux compactions de perdre :

```
// packages/opencode/src/session/compaction.ts:74-78
## DoD (unmet)
- [each Definition-of-Done item still unproven, or "(none) — every item is proven"]

## Findings
- [FINDING <id> [severity/status]: summary, or "(none)"]
```

avec la règle `:97` « Copy DoD wording and finding ids verbatim from `<task-contract>` ;
… Never invent a DoD item or a finding id ».

**Les résidus réels, tous dans les mêmes lignes :**

- **Aucun checkpoint hors session.** `grep checkpoint` ne rend que le **WAL SQLite**
  (`storage/maintenance.ts:46,216`). Le seul passage inter-session est l'outil
  `workspace_handoff.ts:97-186` (capsule de 4 000 caractères, `:14`), et il **refuse la même
  racine** (`:46`) : reprendre après incident **dans le même dossier** n'a pas de chemin.
  `ContextLedger` est en mémoire de module et invalidé par la compaction
  (`context-ledger.ts:33`, `compaction.ts:1047`).
- **Aucun filet quand `goalState` est absent** (`prompt.ts:2407`) : le résumé reste le seul
  porteur des conclusions.
- **La purge d'outils n'est pas consignée.** `prune` efface les sorties d'outils au-delà de
  `PRUNE_PROTECT = 40_000` (`compaction.ts:44,601-649`) et les remplace par
  « [Old tool result content cleared] » (`message-v2.ts:1035-1036`) **sans reporter dans le
  résumé ce qui a été perdu** (`compaction.ts:636-643`). C'est exactement la perte
  silencieuse que le fil attribue au contexte long.

**Le coût reste un sujet distinct** : la compaction est délibérément tardive —
`session/overflow.ts:15-20` chiffre **≈ 2,50 $ par compaction à 256k** contre
**≈ 0,06 $/tour** économisé, soit un retour sur investissement à **~40 tours**. Un checkpoint
durable et bon marché découplerait « sauver les conclusions » de « payer une compaction ».

**Comparaison directe** : `P06` visait « résumé de compaction sans section DoD/findings,
troncature silencieuse à 10 » (`README.md:28`). Le code porte maintenant les sections, et
`CLOSURE-MATRIX.md:73` enregistre **6/6 implémentations mergées**, P06 inclus. Voir §7a.

## §6 — Le comptage de tokens est une constante, et son repli oublie le raisonnement

```ts
// packages/opencode/src/session/overflow.ts:7-11
const COMPACTION_BUFFER = 20_000
const DEFAULT_THRESHOLD = 0.95
const READ_HEAVY_FRACTION = 0.8
const READ_HEAVY_MIN_TOKENS = 20_000
const CHARS_PER_TOKEN = 4
```

```ts
// packages/opencode/src/session/overflow.ts:46-50
function tokenCount(tokens: MessageV2.Assistant["tokens"]) {
  // Prefer provider-reported total when it is non-zero; otherwise use the already-recorded parts.
  return tokens.total || tokens.input + tokens.output + tokens.cache.read + tokens.cache.write
}
```

Deux défauts distincts :

1. **`CHARS_PER_TOKEN = 4` est global** : le harnais estime le remplissage sans distinguer le
   code, le JSON, le chinois ou le base64. Le fil donne l'illustration exacte du risque — un
   tokenizer différent change le nombre de tokens pour le même texte. Une estimation fausse
   décale le seuil : compacte trop tôt (paye 2,50 $ pour rien) ou trop tard (dépasse la
   fenêtre).
2. **Le repli omet `tokens.reasoning`.** Quand le provider ne rend pas de total, la
   recomposition `input + output + cache.read + cache.write` **ignore les tokens de
   raisonnement**. Sur un modèle qui réfléchit beaucoup, le contexte est donc
   **sous-estimé**, et un seuil sous-estimé compacte **trop tard** — précisément le mode
   d'échec que le fil décrit en creux (« réduire la sur-réflexion, économiser 50–80 % de
   tokens ») : ici le raisonnement consomme du contexte **sans être compté**.

Le défaut (1) est déjà la matière de `P10` (« `CHARS_PER_TOKEN` global + cliff `readHeavy` à
20k », `README.md:32`), qui est **`REVALIDATED-FAIL`** et donc **non implémenté**
(`verdicts/P10-revalidation.md:50`). Le défaut (2) n'est pas nommé dans `P10` : c'est une
ligne, `overflow.ts:49`.

## §7 — Les registres de l'audit se contredisent, et la doctrine recommande un outil qu'elle disqualifie

Même famille que la leçon centrale du fil (*une instruction périmée est plus coûteuse qu'une
absence d'instruction*).

**(a) Deux registres de statut divergent, et le plus ancien se proclame « source de vérité ».**
`MATRIX.md:3` s'annonce comme « Source de vérité du suivi », et sa colonne `implémentation`
vaut `—` pour les 20 lignes (`MATRIX.md:26-45`). Or :

- `CLOSURE-MATRIX.md:73` — « **Implémentations mergées — 6 / 6 mesurées** : P02, P05, P06,
  P14, P15, P16 », avec P06 à « 6 pass / 0 fail, `EXIT=0` » ;
- `compaction.ts:56-98` porte effectivement le contrat de résumé de P06 ;
- l'historique porte `c59fabf47 … + implementations P02/P05/P06/P14/P16` ;
- `CLOSURE-MATRIX.md:69` va plus loin : **6 / 20 implémentables**, 4 au plafond C-37,
  `P10` et `P18` inimplémentables pour résidus `open`.

Le défaut n'est donc pas « le registre est faux » mais **« il y a deux registres, et le plus
ancien se proclame souverain »** — dans le sens qui fait perdre du travail : il annonce à
faire ce qui est fait. À noter que le dépôt a déjà corrigé exactement cette faute ailleurs :
**P05** portait sur un DoD réémis deux fois dans le prompt (`README.md:27`). La duplication a
été traitée dans le prompt, pas dans les registres.

**(b) La doctrine recommande un outil que ses propres corrections interdisent.**
`ORCHESTRATION-RULES.md:81-82` puis `:123-124` :

> Corollaire : `grep` échoue en `EPERM` sur cette machine. Préférer `read` avec des ranges
> connus, **ou `glob`**.

Mais la Règle 7 du **même fichier** (`:94-103`) établit que le shell est *intermittent* et non
mort — ce qui abroge la prémisse « grep échoue » —, et `CORRECTIONS.md:60` (C-50) interdit
explicitement `glob` pour prouver une absence : « le `glob` a déjà menti **deux fois de
suite** … La preuve d'absence d'un fichier local passe par `read` ».

Le document contredit donc : (1) sa propre règle 7, (2) une correction mesurée du même audit,
et il recommande l'outil que cette correction disqualifie. Ce n'est pas de la théorie : deux
agents ont bâti des chiffres périmés sur un `glob` vide (C-41, C-50).

Et le dépôt a déjà payé la fragilité de formulation une fois de façon nette : **C-52** — un
agent a déduit de `packages/opencode/AGENTS.md:88` (« Use `Effect.void` instead of
`Effect.succeed(undefined)` ») une **interdiction générale de `Effect.succeed`**, alors que la
règle ne porte que sur l'idiome `undefined`. C'est le « wording is fragile » de l'article
Vercel, observé ici, sur ce corpus, avec un contre-exemple dans le dépôt (`bridge.ts:72`).

## §8 — Une barrière de livraison dont l'état de succès est inatteignable

`CORRECTIONS.md:42` (C-32) mesure : après **20 propositions, 20 verdicts et 5 revalidations**,
**0 candidat implémentable**, parce que la clause `REVALIDATED-PASS` exige qu'« aucune
nouvelle objection ne subsiste » — ce qui rétrograde automatiquement toute objection
résiduelle, même classée `accepted`. C-37 en tire une politique de sortie (3 cycles maximum,
`NOT-IMPLEMENTABLE` comme issue légitime) ; le résultat est désormais **6 / 20 implémentables
et 4 au plafond** (`CLOSURE-MATRIX.md:69,71`).

**Lien avec le fil.** Le fil dit : formuler des directives **concrètes et testables**
(« exécuter `pnpm test` avant de finir » bat « assurez-vous que les tests passent »). Vrai —
mais une porte **testable et inatteignable** est pire qu'une porte vague : elle a transformé
20 travaux corrects en 0 livraison pendant plusieurs vagues. La testabilité doit porter sur un
état **atteignable**. La règle de remplacement proposée par C-37 (implémentable si et
seulement si chaque résidu est `accepted`/`out_of_scope` et qu'aucun n'est `open`) est la
bonne forme ; elle est maintenant appliquée, et c'est ce qui a débloqué les 6 livraisons.

---

## Déjà couvert par P01→P20 — ne pas recompter

| thème du fil | proposition existante | statut |
|---|---|---|
| estimation de tokens / seuil de contexte | `P10` | **`REVALIDATED-FAIL`, non implémenté** ; n'inclut pas le trou `reasoning` (§6.2) |
| compaction qui perd DoD/findings | `P06` | **mergée**, mesurée 6/0 (§5, §7a) |
| relecture/réinjection d'`AGENTS.md` à chaque lecture | `P01` | verdict en vol |
| `AGENTS.md` contredisant la doctrine globale | `P20` | R2 bloque, et §1 le rend inert par défaut |
| coût des sous-agents / contrat | `P07` | ratio 84× infirmé (C-17) |
| discipline « batch first » | `P20` | même |

## Recommandation ordonnée

1. **§1 — trancher le mode d'injection des instructions.** C'est le levier le plus fort, il est
   mesuré à l'extérieur (100 % vs 53 %), et il existe déjà un interrupteur de configuration.
   Décider : `full` par défaut, ou budget en caractères avec avis de troncature.
2. **§2 — brancher la télémétrie d'usage sur le catalogue de skills**, puis corriger la
   formulation du déclencheur (`system.ts:302-304`). Le harnais possède déjà les deux
   données : 193 skills, 73 % jamais chargées.
3. **§7 — ramener les registres à une seule source** (`MATRIX.md` vs `CLOSURE-MATRIX.md`) et
   retirer de `ORCHESTRATION-RULES.md` les deux corollaires qui recommandent `glob`. Coût très
   faible, effet immédiat sur tous les agents qui lisent ces fichiers.
4. **§6.2 / §4 — deux garde-fous d'une ligne** derrière `RuntimeFlags` : compter
   `tokens.reasoning` dans le repli (`overflow.ts:49`), conditionner `topP`/`topK`
   (`request.ts:182-183`) et journaliser l'écart.
5. **§5 — checkpoint durable** (reprise après incident hors session) et consignation de ce que
   `prune` efface. Effort plus lourd, à séquencer après 1–3.

## Résidus et incertitudes

- **Une seule des trois reconnaissances a été relue de première main** sur ses citations
  nouvelles. Vérifiées par moi : `instruction.ts:43-48`, `context-rollout.ts:53-54`,
  `system.ts:28-29,294-295,302-304`, `compaction.ts:56-98,315-326,705`, `overflow.ts:7-11,46-50`,
  `message-v2.ts:1365-1371`, `request.ts:179-183`, `prompt.ts:2294-2298`,
  `config/instruction-injection.ts:5,10`, `CLOSURE-MATRIX.md:68-74`, `MATRIX.md:3`.
  **Non relues par moi** (rapport de reconnaissance) : `processor.ts:728`,
  `message-v2.ts:669,1035-1036`, `compaction.ts:44,601-649`, `storage/db.ts:35`,
  `workspace-handoff.ts:14,46`, `model-post-mortem.ts:310-311`, `transform.ts:346-366,545-553,651`,
  `models-dev.ts:44-95`. La ligne 88 de `packages/opencode/AGENTS.md` est citée d'après C-52.
- **Aucune exécution** : je n'ai lancé ni test, ni typecheck, ni build — l'arbre porte 137
  entrées modifiées, et la règle C-60 du dépôt interdit de mesurer un état instable.
  Tous les constats sont donc **des lectures de code**, pas des mesures d'exécution.
- **Le chiffre Vercel est externe** (évals Next.js 16) : il motive, il ne prouve pas.
  Aucune des affirmations ci-dessus ne repose sur lui seul.
- **`AGENTS.md` racine supprimé** dans l'arbre de travail : je n'ai pas déterminé si c'est
  volontaire. À vérifier avant de citer un fichier d'instruction racine.

---

## Implémentation du 2026-10-10

Les quatre points ont été implémentés sur l'arbre `dev` (HEAD `77ae24463`), qui était **déjà
sale** : 61 fichiers non committés, refactor en vol, `packages/opencode/src/session/system.ts`
portant 108 lignes non committées. Un **jeu de référence a donc été mesuré avant toute
écriture**, faute de quoi aucun échec n'aurait été attribuable (règle C-60 du dépôt).

| # | changement | fichiers | preuve |
|---|---|---|---|
| 1 | `renderInstruction` : budget de `4 000` caractères au lieu d'une coupe muette à 6 lignes, avec **avis de troncature nommant le fichier à lire** | `packages/opencode/src/session/instruction.ts` | 2 tests ajoutés, **rouges avant / verts après** ; suite → **15 pass / 0 fail / 1 todo** |
| 2 | intro du catalogue : « Explore the project enough to understand its shape first, then use the skill tool … » | `packages/opencode/src/session/system.ts:304` | 1 test ajouté ; suite → **3 pass / 3 fail**, les 3 échecs étant **exactement** ceux du jeu de référence |
| 3 | `MATRIX.md` ne duplique plus les statuts, ne se déclare plus « source de vérité » ; ne porte plus que la correspondance `id → proposition → verdict` et des renvois | `docs/harness-audit/MATRIX.md` | suppression de la copie divergente (colonnes `statut`/`implémentation` fausses) |
| 4 | les deux corollaires `glob` remplacés : shell **intermittent**, preuve d'absence par `read`, **jamais** par `glob` (C-50) | `docs/harness-audit/ORCHESTRATION-RULES.md:81-85,126-130` | le fichier ne recommande plus l'outil que C-50 disqualifie |

### Jeu de référence, mesuré avant écriture

| suite | avant | après |
|---|---|---|
| `test/session/instruction.test.ts` + `test/session/system.test.ts` | 15 pass / **3 fail** / 1 todo (19 tests) | 18 pass / 3 fail / 1 todo (22 tests) |
| `test/session/instruction.test.ts` seul | vert | **15 pass / 0 fail / 1 todo** |
| `test/session/system.test.ts` seul | 2 pass / 3 fail | 3 pass / 3 fail — **mêmes 3 échecs** |
| `test/session/context-budget.test.ts` | 2 pass / **1 fail** (entrée `(unnamed)`, 5 000 ms) | **2 pass / 0 fail** |
| `test/session/context-rollout.test.ts` | non mesuré avant | 10 pass / 0 fail |
| `bun typecheck` | — | **exit 0** |

Les trois échecs préexistants de `system.test.ts` sont : `core policy requires targeted
inspection…`, `Jev skill selection > a trivial prompt selects no skill…`,
`Jev skill selection > a relevant prompt keeps only the skills Jev affirms`.

**`src/session/prompt-budget.test.ts` échoue aussi, et c'est démontrablement préexistant** :
l'assertion est `tokens(PROMPT_CORE) < 900` (`prompt-budget.test.ts:44`) et `core.txt` mesure
**5 592 caractères ≈ 1 398 tokens** sur cet arbre. Le fichier `core.txt` fait partie des 61
modifications en vol et **n'a pas été touché** par ce travail.

**Ce que je n'ai pas implémenté, et pourquoi.** Le plafond de skills sur les chemins Jev et
sélecteur LLM n'a pas été touché : ce n'est pas un défaut (§3), c'est un choix documenté, et
la zone est exactement celle que le refactor en vol réécrit (`system.ts`, 108 lignes non
committées, dont un cache `skillSelection`). Y ajouter une écriture concurrente produirait
l'artefact non attribuable que **C-21** sanctionne. Idem pour `P20` : il reste inert par défaut
(§1) et sa correction appartient à l'agent qui possède `packages/opencode/AGENTS.md`.

**Aucun commit n'a été fait.** Deux raisons : le worktree porte le travail non committé d'un
autre swarm (dont `MATRIX.md`, déjà modifié avant mon intervention, et
`ORCHESTRATION-RULES.md`, fichier **non suivi** créé par lui), et `ORCHESTRATION-RULES.md`
Règle 12 documente que `git commit` est inutilisable sur cette machine — le commit est la
tâche de l'orchestrateur. Mes modifications restent donc dans l'arbre, séparables par leur
chemin.

**Fins de ligne : rien à corriger.** `git diff --check` signale du « trailing whitespace » sur
`instruction.ts` et `system.ts`, mais ces fichiers sont **intégralement en CRLF** (373 et 434
CRLF, **0 LF nu**), conversion apportée par le refactor en vol. Preuve que ce n'est pas moi :
un fichier préalablement en LF aurait laissé ~336 LF nus après l'insertion d'un bloc CRLF, or
il y en a zéro. Le témoin `src/tool/shell.ts` (non touché, LF) ne produit **aucune** alerte.

---

## Audit des instructions et configs existantes (tour 4)

Constat à l'origine de ce tour : les points 1–4 ont porté sur le **code** du harnais, pas sur ce
qui pilote réellement l'agent. Les deux surfaces qui comptent ont donc été auditées ici.

Périmètre : `C:\Users\jeanl\.config\opencodev2\` — `AGENTS.md` (6 941 o, 84 l.),
`opencode.json` (33 103 o), `opencode.jsonc` (33 275 o), quatre `*.instructions.md` — plus
`.opencode/opencode.jsonc` du dépôt (346 o).

### I1 — `opencode.json` est partiellement mort, et une édition du matin n'a jamais pris

Le chargeur **global** fusionne trois fichiers, dans cet ordre :

```ts
// packages/opencode/src/config/config.ts:578-580
result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "config.json"), env))
result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "opencode.json"), env))
result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "opencode.jsonc"), env))
```

**`opencode.jsonc` gagne donc sur `opencode.json` quel que soit le mtime.** Et
`globalConfigFile()` (`config.ts:462-470`) renvoie le premier existant de
`["opencode.jsonc", "opencode.json", "config.json"]` : c'est aussi **`.jsonc` que le harnais
écrit** quand un modèle est changé depuis l'interface. Deux fichiers, deux auteurs (la main et
la machine), et c'est le plus ancien qui gagne.

Mesure de la divergence, clé par clé (700 clés contre 703) — le « 45 lignes » d'un diff texte
est trompeur :

| catégorie | clés | effet |
|---|---|---|
| uniquement `.json` | `disabled_providers`, `jev.skills.enabled`, `jev.tools.enabled` | **survivent** : aucune collision |
| uniquement `.jsonc` | `mcp.computer-use.*` (5 clés), `jev.decision_model` | **survivent** |
| **valeurs différentes** | `small_model` | **collision** — `.jsonc` gagne |

`small_model` : `.json` = `opencode-go/deepseek-v4.1-flash`, `.jsonc` = `opencode-go/deepseek-v4-flash`.
Or `.json` a été modifié **le 2026-10-10 à 10:08** et un backup dédié existe
(`opencode.json.bak-smallmodel-20261010-100811`) : **l'édition du matin est sans effet**.

La clé est bien consommée (`config.ts:204` ; `provider.ts:1913-1920`), et `opencode-go` est un
provider intégré légitime (documenté `packages/web/src/content/docs/go.mdx:156`, catalogue
`packages/opencode/test/tool/fixtures/models-api.json:28003`, icône UI, et
`src/decision/model.test.ts:14` teste précisément `parseModelRef("opencode-go/deepseek-v4.1-flash")`).
La valeur résout donc : le défaut est **la collision**, pas une référence morte. À noter au
passage que `provider.ts:1919` **avale** l'échec de résolution (`catchTag(ProviderModelNotFoundError)
→ undefined`) : si l'identifiant était faux, le réglage serait inerte **sans aucun signal** —
même famille que le §4.

**Tranché et appliqué le 2026-10-10** : la valeur voulue est `opencode-go/deepseek-v4.1-flash`,
désormais écrite dans `.jsonc` (l.11). Vérification : `.jsonc` 33 275 → 33 277 o, LF préservé
(0 CRLF), sha256 `647C8929…` → `94686A31…`, sauvegarde
`opencode.jsonc.bak-20261010-smallmodel`, et **collisions restantes = 0** — les 9 clés additives
continuent de provenir des deux fichiers, elles ne s'écrasent pas. Le piège est fermé : une
seule valeur pour `small_model`, et c'est celle qui gagne.

### I1-bis — Vérifié, et **non** défectueux : `vision_model` sur un provider désactivé

`attachment.image.vision_model = "github-copilot/gpt-4.1"` alors que
`disabled_providers = ["github-copilot"]` : `isProviderAllowed` (`provider.ts:1325-1329`) écarte
bien le provider, donc le modèle de vision **ne résout pas**, et `prompt.ts:406` ne laisse
qu'une ligne de log. Le soupçon était sérieux — mais il ne tient pas : ce fallback ne sert que
lorsque le modèle principal ne lit pas les images (`prompt.ts:413` teste
`visionModel.capabilities.input.image`), et le modèle global déclare
`"modalities":{"input":["text","image"]}`. Les images passent donc par le modèle principal et la
référence morte est sans effet. **Consigné comme vérifié, pas comme défaut** : c'est exactement
le faux positif qu'une inspection s'arrêtant au premier constat aurait produit.

### I2 — Deux références pendantes dans l'`AGENTS.md` global

- `C:\jeanluc\AGENTS.md` est cité **deux fois** — l.4 comme override, §7 l.82 comme
  « spécification d'exploitation … Gagne pour la conduite » — et **le fichier n'existe pas**.
  Une consigne qui désigne un document supérieur absent fait chercher un cadre inexistant :
  c'est exactement le motif que ce fichier condamne lui-même au §6 (« règle périmée ⇒ consigne
  morte suivie comme instruction »).
- La citation `prompt.ts:2261` pour « injecté en entier à chaque tour » est **fausse** :
  l'appel est `prompt.ts:2201`, la jointure `:2323`. À `:2261` se trouve un commentaire sur la
  séparation `system`/`volatile`. Un pointeur faux est la faute que l'audit du dépôt sanctionne
  par **C-02** et **C-25**.

### I3 — Les presets de raisonnement existent mais ne sont jamais appliqués

`deepseek/deepseek-v4.1-flash` déclare quatre variantes (`reasoningEffort` =
`low|medium|high|max`), mais les trois agents (`build`, `plan`, `orchestrator`) ne définissent
**ni `variant`, ni `model`, ni `temperature`**. Or la variante n'est appliquée que si elle est
choisie :

```ts
// packages/opencode/src/session/llm/request.ts:143-144
!input.small && input.model.variants && input.user.model.variant
  ? input.model.variants[input.user.model.variant]
```

**Aucun `reasoningEffort` n'est donc envoyé par défaut** : les presets sont inertes sauf
sélection explicite en session. C'est la réponse structurelle à la question du fil
(« comment trouver le bon preset ? ») : ils sont écrits, mais rien ne les relie à un usage ni à
une mesure — et le §4 montre que le harnais ne saurait de toute façon pas signaler qu'ils sont
sans effet.

### I4 — Corrections appliquées à l'`AGENTS.md` global

Quatre corrections factuelles, au style du fichier (`⇒`, une ligne, aucune prose ajoutée) :

| l. | avant | après |
|---|---|---|
| 4 | `C:\jeanluc\AGENTS.md` en tête des overrides | marqué **absent au 2026-10-10** ⇒ ne pas le chercher |
| 5 | « Injecté en entier à chaque tour (`prompt.ts:2261`) » | « selon `instruction_injection.agents` (`full` ici ⇒ fichier entier, `prompt.ts:2201`, joint `:2323`) », défaut harnais `summary` |
| 22 | `command-code/deepseek v4.1 flash` | identifiant exact `command-code/deepseek/deepseek-v4.1-flash` |
| 23 | (absent) | presets `variants`, **aucun `reasoningEffort` envoyé par défaut** |
| 25 | layer `opencodev2/opencode.json` seul | ordre réel de la fusion, **`.jsonc` gagne**, le harnais écrit dans `.jsonc` |

Fichier : **6 941 → 7 658 octets**, 83 → 84 lignes, **LF préservé** (0 CRLF, 0 BOM), sha256
`3DB5B63E…` → `B08FEE94…`. Sauvegarde : `AGENTS.md.bak-20261010-before-facts`.

### Résidus de ce tour

- Les quatre `*.instructions.md` (`caveman-auto`, `context-quality`, `hotreload`,
  `preflight-gate`) et `session-memory.md` n'ont **pas** été audités.
- `.opencode/opencode.jsonc` du dépôt a été lu : il ne touche pas `instruction_injection` (donc
  `full` s'applique bien ici) et fixe `context_rollout.replay_reasoning: "off"`. Aucune
  contradiction relevée — mais aucune de ses clés n'est documentée dans l'`AGENTS.md` global.
- Le conflit `small_model` a été tranché par l'utilisateur et appliqué (I1). Les 9 clés
  additives restent réparties sur deux fichiers : elles survivent à la fusion, mais la
  lisibilité en souffre — une consolidation reste souhaitable, sans urgence.
- `opencode.json`/`.jsonc` exigent un redémarrage de session pour être relus (§1 du fichier
  d'instructions) ; les corrections d'`AGENTS.md`, elles, sont à chaud.

---

## Presets par agent et compilation du binaire (tour 5)

### I5 — `variant` seul est inerte : il faut aussi `model`

Le schéma d'agent prévient que `variant` « applies only when using the agent's configured
model » (`config/agent.ts:24-26`). Le code est encore plus strict que la description :

```ts
// packages/opencode/src/session/prompt.ts:1103-1111
const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))
const same = ag.model && model.providerID === ag.model.providerID && model.modelID === ag.model.modelID
const full = !input.variant && ag.variant && same ? yield* provider.getModel(...) : undefined
const variant = input.variant ?? (ag.variant && full?.variants?.[ag.variant] ? ag.variant : undefined)
```

`same` est *falsy* dès que `ag.model` est absent ; `full` reste alors `undefined` et `variant`
vaut `undefined`. **Poser `variant` sans `model` ne fait donc rien** — ni erreur, ni
avertissement. Les deux clés sont pourtant de premier ordre dans le frontmatter
(`KNOWN_KEYS`, `config/agent.ts:75-76`), donc rien ne signale l'omission. C'est le même motif
que le §4 : un contrôle déclaré, sans effet et sans signal.

### Barème appliqué (2026-10-10)

Aucun preset n'était recommandé nulle part : c'est une **proposition motivée**, pas un optimum
mesuré. Elle n'utilise pas `low` — sur ces agents, une erreur silencieuse coûte plus cher que
les tokens économisés, et `medium` est le palier le moins cher qui reste correct.

| preset | agents | critère |
|---|---|---|
| `max` | `plan`, `architect`, `product-manager`, `security`, `hacker`, `eval` | le livrable **est** le raisonnement (analyse, arbitrage, audit) ; pas de boucle d'outils qui multiplie le coût |
| `high` | `build`, `orchestrator`, `autonome`, `debugger`, `refactor`, `togo-atd`, `swarm` | travail soutenu, sessions longues : profondeur forte sans taxer chaque tour |
| `medium` | `lean`, `designer`, `docker`, `pytest`, `qa`, `web-explorer`, 5×`linkedin-*`, `swarm-worker` | bornés, opératoires |
| *inchangés* | `duplicate-pr` (`opencode/claude-haiku-4-5`), `triage` (`opencode/gpt-5.4-nano`) | modèle déjà épinglé et délibérément bon marché ; leurs variants ne sont pas déclarés dans cette config — y ajouter un preset serait inerte ou invalide |

**Prix du choix** : `variant` exigeant `model`, les 25 agents sont désormais **épinglés** sur
`command-code/deepseek/deepseek-v4.1-flash`. Changer le modèle global ne les suivra plus : il
faudra reprendre leurs `model`. Ce coût est écrit dans l'`AGENTS.md` global.

### Écritures et vérifications

- `opencode.jsonc` : `build` → `high`, `plan` → `max`, `orchestrator` → `high` ; JSON reparse OK.
- 25 fichiers d'agents (`~/.config/opencodev2/agents/` ×22, `.opencode/agent/` ×3) : `model` +
  `variant` insérés dans le frontmatter. Vérifié fichier par fichier : **exactement un**
  `model:` et **un** `variant:` par fichier, fins de ligne d'origine préservées (CRLF ou LF,
  jamais mélangées). Sauvegarde du dossier : `agents.bak-20261010-presets` ; les 3 fichiers du
  dépôt sont suivis par git, donc git est le filet.
- `packages/opencode/package.json` : `2.3.66` → `2.3.67` (remplacement ciblé, aucun reformatage,
  delta 0 octet) ; `bun.lock` ne référence pas la version, rien à synchroniser.

### Binaire 2.3.67

`bun run --cwd packages/opencode build --minify=false --splitting=false` avec
`OPENCODE_VERSION=2.3.67` dans la **même** commande (piège documenté : sinon `0.0.0-dev-*`).

- 11 cibles compilées, `BUILD_EXIT=0`, `Smoke test passed: 2.3.67`.
- `dist/bin/opencode.exe` : 242 985 472 o, sha256 `EEFE761A…`, contrôle positif
  `& dist\bin\opencode.exe --version` → **2.3.67**.
- **Déployé** : `%APPDATA%\npm\opencodev2.exe` = 242 985 472 o, sha256 `EEFE761A…` — **identique
  à la source** (vérifié), ancien binaire conservé en
  `opencodev2.exe.bak-20261010-123608.old`. Contrôle positif `opencodev2 --version` → **2.3.67**.
  Le PID 14436 était **déjà terminé** au moment de l'arrêt : aucun processus n'a été tué.
  `debug info` n'a **pas** été lancé, le skill `fork-build` le déconseillant juste après un
  déploiement.
- **Non mesuré** : l'effet de bout en bout des presets. Le câblage est établi par lecture
  (`prompt.ts:1104-1111`) et la config reparse, mais **aucune requête n'a été observée** portant
  un `reasoningEffort`. La preuve serait un événement `SessionEvent.ModelSwitched`
  (`prompt.ts:1141-1147`) ou la charge utile envoyée au provider.
- Nuance à ne pas perdre : l'arbre porte **141 entrées non committées**. Le build compile le
  *répertoire de travail*, donc 2.3.67 contient ces 141 modifications — dont mes correctifs
  `instruction.ts`/`system.ts` — et pas seulement ce qui est commité.
