# Règles d'orchestration du swarm

Ce fichier est normatif. Il existe parce que le swarm a produit un conflit réel,
consigné comme **C-21** dans `CORRECTIONS.md` : j'ai lancé des agents de révision
pendant que les auteurs de proposition écrivaient encore le même fichier.

## Le fait qui a rendu cette règle nécessaire

L'agent auteur de `P04` a rapporté que son fichier était passé de **496 à 711 lignes**,
et que les lignes 171-174 portaient une correction à sa propre citation
`processor.ts:945-959` qu'il n'avait pas écrite. Il a été arrêté par ce conflit.

Avec `hot_path.lean_dynamic_tools`, 14 agents tournaient simultanément et un seul
`glob` peut rester bloqué 30 s quand l'index git est saturé. La vague 3 a envoyé
**20 rédacteurs + 20 validateurs + 17 révisions**. À cette échelle, l'écriture concurrente
sur un même chemin n'est pas un risque théorique.

## Règle 1 — un fichier, un agent, un instant

**Un seul agent peut écrire un fichier donné à un instant donné.**

Avant de lancer une révision, une revalidation ou une implémentation sur `Pnn`, les
quatre conditions doivent être **toutes** vraies :

| # | condition | comment la vérifier |
|---|---|---|
| 1 | la proposition existe et son auteur est terminé | `subagent_list` : plus aucun `running` sur `Pnn proposition` |
| 2 | le verdict existe | `glob verdicts/Pnn-verdict.md` |
| 3 | aucun autre agent n'écrit ce fichier | pas de révision en vol sur le même `Pnn` |
| 4 | aucun `git index.lock` n'est détenu | `Test-Path .git/index.lock` |

Si les quatre ne sont pas vraies, **attends**. Un agent qui écrit sur un fichier en cours
de modification produit un artefact non fiable, et son marqueur
`> Révisé après verdict` devient un mensonge.

## Règle 2 — les 5 propositions à retraiter

Ces cinq propositions ont reçu une révision **pendant** que leur auteur écrivait. Leur
contenu est un mélange de deux agents et n'est pas fiable :

`P03` · `P04` · `P07` · `P13` · `P16`

Elles doivent être **réécrites depuis un fichier propre**, une fois leur verdict confirmé
et aucun agent auteur en cours. Leur marqueur de révision actuel est à traiter comme
nul.

## Règle 3 — pour l'implémentation, la règle se durcit

Un fichier **source**, un seul agent.

Deux implémentations concurrentes sur `shell.ts` ou `goal-contract.ts` ne produiraient pas
un patch mais un merge manuel que personne n'a validé. Le fichier source est le seul
endroit où cette erreur n'est pas réparable par une réécriture de proposition.

Corollaire : ne jamais confier à deux agents deux findings qui touchent le même fichier.
Voici les collisions connues à l'audit :

| fichier | findings concurrents |
|---|---|
| `src/tool/shell.ts` | P09, P12, P13, P14, P18 |
| `src/tool/truncate.ts` | P16, P17 |
| `src/session/compaction.ts` | P06, P10 |
| `src/tool/goal-contract.ts` | P11 (+ le test `goal-contract.test.ts`) |

## Règle 4 — interdire `git` aux agents

Trois agents ont échoué sur `EPERM: uv_spawn 'git.exe'` en tentant de committer malgré
l'interdiction. Les consignes d'orchestration doivent dire **« n'appelle ni git, ni
bash, ni pwsh »**, pas seulement « ne committe pas » : un agent qui lance `bash` pour
inspecter un diff finit par committer.

Corollaire : c'est à l'orchestrateur de committer, une fois la vague terminée. Cela évite
la contention sur `.git/index.lock` qui a fait échouer au moins six agents.

## Règle 5 — lire des fragments, jamais un fichier entier

Deux agents sont morts de budget en cherchant à relire un fichier de 700 lignes. Un
`read` par tranches de 120 lignes, avec `offset`/`limit` explicites, est plus rapide et
survit au plafond de temps.

Corollaire : `grep` échoue en `EPERM` sur cette machine. Préférer `read` avec des ranges
connus, ou `glob`.

## Règle 6 — vérifier ce qu'un validateur a infirmé

Un validateur qui trouve une citation fausse dans une proposition doit la remonter comme
objection **bloquante**. C'est cette règle qui a produit `C-02` (gain P05 mesuré à
−35 caractères au lieu de −240 tokens), `C-03`, `C-17` (le ratio 84× n'est pas causal) et
`C-18` (le patch P15 ne compile pas).

Ces quatre corrections ont été trouvées **par mesure**, pas par argument. C'est le seul
moyen fiable de valider une proposition d'outil interne.

## Règle 7 — le shell n'est pas indisponible, il est intermittent

La règle 2 ci-dessus est **abrogée sur le shell**, et maintenue sur `git`.

**Ce que la mesure dit.** L'agent de fidélité P09 a obtenu `pwsh 7.6.6` (exit 0),
`bun test test/tool/truncation.test.ts` (exit 0, 19 pass), `bun test
test/tool/terminal-output.test.ts` (exit 0, 14 pass) et son harnais `bun p09-fidelity.ts`
(`MEASURE_EXIT=0`, 6 sections `OK`). En face, le journal d'échecs enregistre 387 EPERM sur
`pwsh.EXE` et 445 `bash` dont 36 tronqués. La lecture correcte n'est pas « le shell est mort »
mais « **le shell échoue par intermittence** ».

**Règle révisée.**

1. Un agent **tente** l'exécution. En cas d'EPERM, il **relance une fois**, puis rapporte
   `BLOCKED` avec la sortie exacte de l'erreur. Ne jamais conclure à l'indisponibilité sur un
   seul échec.
2. L'interdiction **reste entière pour `git`** : c'est là que se trouve `index.lock`
   (11 processus git observés) et que le risque de corruption de l'index est réel. Seuls
   l'orchestrateur et son index alternatif commitent.
3. Un agent **n'écrit jamais** un fichier du dépôt par shell. Exécution de tests et de
   mesures uniquement ; toute écriture passe par l'outil de fichier.
4. **Pourquoi cette règle est obligatoire.** Interdire le shell supprime la seule voie de
   **vérification par exécution**, qui est la seule qui tranche. Conséquences déjà subies :
   `COR-R18-3` (typecheck de `tagOf` non établi) empêche `REVALIDATED-PASS` sur P18 ; P10 et
   P15 ont des résidus qui sont des « compilations prouvées par raisonnement et non par exit
   code » ; et C-44 montre qu'une suite instable ne peut pas servir de base de non-régression
   alors qu'on ne sait pas la mesurer deux fois. Une règle qui interdit la preuve est une règle
   qui produit des `INFERE`.

Corollaire : `grep` échoue en EPERM sur cette machine — préférer `read` avec des ranges
connus, ou `glob`.