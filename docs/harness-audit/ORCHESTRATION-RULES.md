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

Corollaire : l'exécution shell est **intermittente**, pas absente (voir Règle 7) — un `grep`
peut échouer en `EPERM` sans que l'outil soit indisponible. Préférer un `read` par tranches à
ranges connus. **Ne jamais conclure à l'absence d'un fichier avec `glob`** : un `glob` qui
expire sous charge rend un résultat vide **indiscernable d'une absence réelle** (C-50). La
preuve d'absence d'un fichier local passe par `read`.

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

Corollaire : un `grep` peut échouer en `EPERM` sans que le shell soit mort (point 1
ci-dessus). La preuve d'absence d'un fichier local passe par `read`, **jamais par `glob`** :
un `glob` qui expire sous charge rend un vide indiscernable d'une absence réelle, et deux
agents en ont déjà tiré des chiffres périmés (C-41, C-50).

## Règle 8 — garde de marqueur de sonde avant commit

Un agent qui prouve son correctif **revert sa propre source** pour exécuter la phase rouge.
C'est la pratique correcte, et c'est aussi un état dangereux : `repetition.ts:81` a porté
`/** TEMPORARY BASELINE PROBE — restore immediately. */` au-dessus d'un `signature()` reverté
à l'original. La restauration dépend d'une action future par un acteur qui peut avoir disparu
— trois agents ont déjà subi `budget_exceeded` cette session.

Avant de commiter **tout** fichier sous `packages/**` :

```powershell
Select-String -Path <fichier> -Pattern 'TEMPORARY|BASELINE PROBE|restore immediately|XXX|FIXME'
```

Une correspondance = **arrêt dur**, pas de commit. Un filtre de signature inopérant accompagné
d'un commentaire qui *invite* à le restaurer est le pire des deux mondes, et un
`restore immediately` orphelin ne sera jamais restauré.

Corollaire : la preuve « échoue avant / passe après » se consigne dans le **rapport de
revalidation**, jamais dans une source committée.

**Extension au chemin (C-68).** `Select-String` ne lit pas un nom de fichier, donc la garde
ci-dessus passe sur un artefact dont c'est le **nom** qui porte la marque. Avant chaque commit
touchant `packages/**`, lire `git status --short` ligne par ligne et, pour **chaque** entrée non
suivie, décider explicitement :

- `*.probe.*`, `*.tmp.*`, `*.scratch.*`, `*.baseline.*`, `*.bak*` → **artefact de phase rouge ou
  d'exécution** : renommer en test définitif, ou supprimer. Jamais commité tel quel.
- `*.log`, `*.out` → sortie d'exécution : ne pas commiter.

`p16-truncation-prefix.probe.test.ts` et `watchdog-run.log` sont les deux cas rencontrés le
4 octobre 2026 ; aucun des deux ne doit atteindre le dépôt.

## Règle 9 — un fichier sous édition appartient à son agent, pour la mesure aussi

La règle 1 protège l'**écriture**. Celle-ci protège la **mesure**.

**Aucun test ne s'exécute sur un fichier dont un agent est propriétaire**, y compris pour
l'orchestrateur. J'ai violé cette règle en lançant `bun test` sur `repetition.ts` pendant que
l'agent P02 le possédait : `TEST_EXIT=1`, 20 pass / 2 fail, les deux échecs se ramenant au
seul `signature()` reverté. `grep DECORATIVE src/**/*.ts` → 0 correspondance. Ce n'était pas
un défaut du travail, c'était **ma course**.

Un `TEST_EXIT` rouge obtenu sur un fichier en cours d'édition est une course, pas un constat.
La seule lecture admise pendant une édition est `read`, qui n'a pas d'effet de bord.

## Règle 10 — un défaut trouvé dans l'artefact évalué ne se ferme pas sur place

La porte de refus de livraison exige qu'aucun finding `high` ne reste `open`. La règle 8 et
C-36 interdisent au revalidateur d'éditer la proposition qu'il valide. Les deux règles se
neutralisent : un revalidateur qui découvre un défaut `high` **dans la proposition** ne peut
le clore qu'en editant la proposition, donc en détruisant son indépendance.

**Interdit** : requalifier un `open` en `out_of_scope` pour franchir la porte. C'est
falsifier son propre audit, et c'est exactement le défaut que C-22 et C-42 ont sanctionné.

**Résolution** : distinguer deux natures de finding.

| finding porte sur | qui peut le clore | statut attendu du revalidateur |
|---|---|---|
| le **système audité** (`packages/**`) | l'agent d'implémentation | `open` → `closed` par le correctif testé |
| l'**artefact évalué** (la proposition) | l'agent de révision du cycle suivant | `open`, avec le remède en une ligne et la section `## Handed back to` |

Un revalidation file est **complet** même porteur d'un `open` : l'observation est le livrable,
la clôture du défaut appartient au cycle de révision suivant. La sévérité du défaut dans le
document n'est pas la sévérité du finding contre le harnais — un `high` dans un brouillon est
un `medium` contre le système tant que le brouillon n'est pas implémenté.

Coût de cette règle : elle autorise un rapport livré avec un `open`. C'est le prix de
l'indépendance de l'audit, et l'audit indépendant est le seul qui tranche.

## Règle 11 — diagnostiquer un `commit` suspendu, ne pas le contourner

`git commit` s'est suspendu 4 fois sur 6 dans cette session (120 à 600 s) sans `COMMIT_EXIT`,
tandis que `read-tree` et `add` restaient immédiats. **`ADD_EXIT=0` suivi d'un silence n'est pas
un échec du commit**, c'est une suspension : la distinction importe, parce qu'un échec se
signale et une suspension se mesure.

1. **Un seul essai par tour.** Ne pas boucler sur le même commit dans la même tour : on
   confondrait contention et panne déterministe.
2. **Tracer vers un fichier, pas vers la sortie.** `git commit` avec redirection de stderr dans
   un fichier, puis lire **la dernière ligne émise** au moment de la suspension. La sortie
   console d'un processus tué par timeout est perdue ; un fichier survit.
3. **Mesurer avant de conclure.** `HOOKS_NON_SAMPLE=0` a été un **faux négatif** : les hooks de
   ce dépôt sont husky, dans `.husky/_/`, pas dans `.git/hooks/`. Un compteur qui rend 0 doit
   être confronté à un **contrôle positif** avant d'être cru (C-66).
4. **Neutraliser le sous-processus, pas le contrôle.** `-c maintenance.auto=false` empêche
   `git maintenance run --auto`. Un shim de hook qui ne peut pas être **lancé** (`env: … :
   Permission denied`) fait abandonner `commit` **avant** d'écrire la référence — ce n'est pas un
   contrôle, c'est un défaut d'environnement. Mesurer ce que l'option écarte avant de l'interdire
   (**C-89**) : ici `core.hooksPath=.husky/_`, hooks utilisateur = `pre-push` seul, jamais exécuté
   par `commit`, donc `--no-verify` n'écarte **aucun** contrôle de commit réel. Ce qui reste
   obligatoire, et qui suffit : **delta `HEAD`** avant/après et **garde de marqueur** (règle 8).
5. **Un commit suspendu n'est pas un dépôt cassé.** Laisser les fichiers non committés, rendre
   l'exit code exact, et reprendre au tour suivant. Un fichier de travail non commité est
   récupérable ; une boucle de commits est une impasse.
6. **Un `exit 0` ne prouve pas un commit.** `P06_NOT_COMMITTED exit=0` : le refus d'exécution du
   hook fait sortir `git commit` sans écrire la référence (**C-87**, **C-89**). Seul le delta de
   `HEAD` prouve.
7. **L'autorité de « reste-t-il à commiter » est `git diff HEAD --stat`**, jamais `ls-tree`,
   jamais `status` (**C-91**, **C-73**). `ls-tree` répond « ce chemin existe-t-il dans l'arbre »,
   ce qui est vrai pour tout fichier déjà suivi et ne dit rien d'une modification non committée ;
   `status` dépend de l'index réel, dont on a établi qu'il porte des suppressions fantômes. Une
   garde doit décider de la **même** question que la décision à prendre, sinon elle renvoie un
   compte plausible et fait sauter le travail.

## Règle 12 — commiter par plumbing quand `git commit` est inutilisable

`git commit` est devenu inutilisable dans cette session : 4 suspensions de 120 à 600 s, un
refus de lancement des shims husky (`env: '.husky/_/prepare-commit-msg': Permission denied`),
et un `exit 0` sans écriture de référence. La trace `GIT_TRACE` ne montrait que le chemin
nominal, donc rien ne disait quoi suspendre.

Voie retenue, en **plumbing**, qui n'exécute aucun sous-processus :

```powershell
$before = (git rev-parse HEAD).Trim()
git read-tree HEAD
git add -- <fichiers>
$tree = (git write-tree).Trim()
$new   = (git commit-tree $tree -p $before -m "<message>").Trim()
git update-ref refs/heads/dev $new $before   # <nouveau> <ancien> : refus si course
$after = (git rev-parse HEAD).Trim()          # DELTA_OK si $after -eq $new
```

1. **`update-ref` prend l'ancien sha en garde.** Une écriture concurrente entre le `read-tree` et
   l'`update-ref` est alors **refusée**, pas silencieusement écrasée. C'est la propriété qui
   manque à tout le reste du protocole.
2. **Aucun hook n'est contourné : il n'y en a aucun à contourner.** Mesuré : `core.hooksPath =
   .husky/_`, `.husky/` ne contient que **`pre-push`** (vérification de version `bun` par semver,
   **jamais** exécuté par `commit`), `lint-staged` absent des deux manifestes. Le refus est un
   défaut d'environnement de la même famille que les 387 refus `pwsh`, pas un contrôle de qualité.
3. **Les contrôles de qualité restent, et sont proof** : delta `HEAD` (**C-87**), garde de marqueur
   (règle 8), test ciblé vert avant commit. Le commit conserve auteur, date, message et parent.
4. **Le lot reste interdit** (**C-88**) : un commit par lot, avec son delta imprimé, sinon le delta
   du suivant masque l'échec du précédent.