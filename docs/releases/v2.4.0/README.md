# Version 2.4.0 — performance d'exécution du harnais

Programme de correction des goulots d'étranglement du harnais opencodev2 **indépendants
de la vitesse du modèle** : conflits de requêtes, travail synchrone évitable, cache de
prompt, I/O, sérialisation. Chantier dérivé de `docs/harness-audit/` — là où cet audit
traite 20 failles de justesse et de coût de contexte, ce dossier traite le **débit et
l'efficacité d'exécution**, mesurés sur `dev` le 2026-10-11.

- Version courante : `2.3.74` (`packages/opencode/package.json:3`)
- Version cible : `2.4.0`
- Modèle en service qui conditionne le diagnostic : `opencode-go/deepseek-v4.1-flash`
  (`~/.config/opencodev2/opencode.jsonc:3`, API openai-compatible ⇒ hors couverture du
  cache explicite actuel, cf. H2)

## Fichiers du programme

| fichier | rôle | autorité |
|---|---|---|
| `BACKLOG.md` | spécification des 8 correctifs (H1..H8) : preuve, correctif, critère d'acceptation | source de vérité du **quoi** |
| `PROGRESS.md` | statut de chaque item, validateur, commit, gain mesuré | **seule** source de vérité du **où en est** |
| `BASELINE.md` | mesures de référence figées avant toute modification | référence de non-régression |
| `items/<id>.md` | fiche détaillée d'un correctif, ouverte au démarrage de l'item | spec d'implémentation |

Hérité de `docs/harness-audit/MATRIX.md` : **une donnée de statut n'est écrite qu'à un
seul endroit** — `PROGRESS.md`. `BACKLOG.md` décrit, il ne statue pas. `BASELINE.md`
mesure, il ne décide pas.

## Contrat

1. **Un item = une fiche = un fichier.** La fiche est créée depuis `items/_TEMPLATE.md`
   au démarrage de l'item, pas avant.
2. **Preuve obligatoire.** Toute affirmation cite `fichier:ligne` avec un extrait court.
   Une inférence est marquée `INFERE:` et sa méthode de vérification est donnée.
3. **Un validateur indépendant par item.** Il n'a pas rédigé la fiche, n'a modifié aucun
   fichier source (lectures et `grep` seulement). Il écrit le statut dans `PROGRESS.md`.
4. **Livraison par artefact.** Le fichier sur disque est la preuve. Un résultat annoncé
   mais non écrit est considéré comme non livré.
5. **Critère d'acceptation monotone.** Interdit tout ratio dont le dénominateur est une
   grandeur que le correctif fait baisser (leçon de `verdicts/P19-verdict.md` O1 : un
   ratio appels/étapes *monte* quand le patch réussit). On mesure des grandeurs
   absolues : total de tokens, `cache_read`, latence, nombre de `spawn`.

## Phases et points de passage (gates)

| # | phase | sortie observable | gate |
|---|---|---|---|
| 0 | Cadrage & baseline | `BASELINE.md` rempli, mesures figées et datées | **G0** baseline figée |
| 1 | Spécification | 8 fiches `items/H*.md` complètes (10 sections) | **G1** toutes spec'd |
| 2 | Validation indépendante | une ligne de statut par item dans `PROGRESS.md` | **G2** ≥ 1 item `PASS` |
| 3 | Implémentation | correctif + test par item, par vagues | **G3** typecheck exit 0 + tests verts |
| 4 | Mesure du gain | delta chiffré vs `BASELINE.md`, consigné dans `PROGRESS.md` | **G4** gain ≥ seuil de l'item |
| 5 | Build & déploiement | binaire `2.4.0` déployé, `--version` vérifié | **G5** accord explicite de l'opérateur |
| 6 | Clôture | programme clos, règle durable dans `AGENTS.md`, mémoire | — |

Un gate non franchi arrête la phase : on ne passe pas à la suivante en « attendant ».

## Vagues d'implémentation (éviter les conflits de fichiers)

Un même fichier touché par deux items = deux vagues, jamais une seule. Ordre imposé par
les dépendances :

| vague | items | fichiers | pourquoi cet ordre |
|---|---|---|---|
| A | **H3**, **H7** | `session/system.ts`, `session/prompt.ts`, `session/working-state.ts` | stabiliser le préfixe avant de le mettre en cache (H3 avant H2) |
| B | **H2** | `provider/transform.ts`, `session/llm/request.ts` | dépend de A : cacher un préfixe instable ne sert à rien |
| C | **H4**, **H5**, **H6** | `session/processor.ts`, `snapshot/index.ts`, `session/instruction.ts`, `tool/shell.ts`, `sync/index.ts`, `session/projectors*.ts`, `storage/` | latence locale, risque isolé, mesurable seule |
| D | **H1**, **H8** | `session/llm.ts`, `session/processor.ts`, `session/retry.ts` | la boucle : le plus fort gain, le plus fort risque — en dernier |

**H1 doit se concevoir après A–C.** Passer d'un step provider par tour à une continuation
multi-step native court-circuite des mécanismes que le harnais pilote aujourd'hui
(`turn_plan`, `continuation`, `stall-watch`, compaction). La fiche H1 doit prouver, point
par point, que chaque mécanisme reste exercé.

## Rôles et délégation

- **Rédacteur** (1 par item) : produit la fiche, n'implémente pas.
- **Validateur** (1 par item, indépendant) : statue `PASS` / `PASS_WITH_CHANGES` /
  `FAIL`, écrit les objections numérotées dans `verdicts/<ID>.md`. Il **ne modifie pas**
  `PROGRESS.md` (écriture concurrente interdite) : l'orchestrateur consolide ce registre
  depuis les verdicts.
- **Implémenteur** : applique la fiche validée + son test, par vague.
- **Measurer** : instrumente et chiffre le delta vs `BASELINE.md`.

Délégation via l'outil `task`. Chaque sous-agent reçoit : périmètre de fichiers exact,
critère de sortie (forme et taille du livrable), chemins de preuve déjà rassemblés.

## Règles d'exécution propres au dépôt (pièges déjà payés)

- Tests **depuis `packages/opencode`** ; le flag `--timeout 30000` est **obligatoire**
  (`skill fork-build`, `skill opencode-fork-feature`).
- Typecheck : `bun run typecheck` (`tsgo --noEmit`), **jamais** `tsc` directement.
- Fin de ligne **LF** : `edit`/`write` écrivent en LF ; ne jamais passer par `Set-Content`
  ou une redirection (CRLF ⇒ diff gonflé à tout le fichier).
- D'autres sessions travaillent dans le même worktree : `git add` **ciblé par pathspec**,
  `git status` juste avant de committer, ne jamais tuer le git d'une autre session.
- Un changement dans `packages/opencode/src/**` exige **rebuild + redéploiement** du
  binaire (`skill fork-build`) ; un plugin livré en config n'en exige pas.

## Déploiement (gate G5)

1. Bump `2.4.0` par le script de release du dépôt (`chore(release): v2.4.0`).
2. Build versionné, remplacement du binaire installé, vérification `--version`.
3. **Accord explicite requis** avant tout remplacement de binaire, push ou publication :
   l'action touche le système en service (cf. `AGENTS.md` §0.4 et §7).

## Journal

| date | événement |
|---|---|
| 2026-10-11 | Création du programme. 8 items issus de l'audit de performance. Phase 0 ouverte. |
