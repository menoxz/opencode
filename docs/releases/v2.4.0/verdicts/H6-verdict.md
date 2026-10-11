# Verdict de validation — H6

## Proposal

`H6` — Shell persistant (fin du spawn par commande). Fiche validée : `docs/releases/v2.4.0/items/H6.md` (204 lignes).

## Validator

Agent indépendant : n'a ni rédigé ni relu la fiche avant de l'auditer. Aucun fichier source
modifié ; seules des lectures et des `grep` ont été exécutés.

## Status

`PASS_WITH_CHANGES`

Le diagnostic est exact et vérifié dans le code : la fiche cite correctement ses quatre ancres
(`tool/shell.ts:627`, `tool/shell.ts:416-437`, `src/shell/shell.ts:101-109`,
`tool/shell/prompt.ts:277-278`) et corrige au passage le chemin erroné du BACKLOG
(`tool/shell/shell.ts` → `src/shell/shell.ts`, ce dernier existant réellement). Le risque d'état
résiduel est **tranché** (isolation par sous-shell + reset `cwd` documenté) et la compatibilité du
prompt de l'outil est traitée — c'est la réponse à l'exigence BACKLOG. Deux points empêchent
`PASS` : la réinitialisation du `cwd` est décrite par **deux politiques contradictoires** (§4 vs
§8.4), et le seuil de mesure n'est pas identique entre §7 et §8.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok — 4/4 | `tool/shell.ts:627` = `const handle = yield* spawner.spawn(cmd(input.shell, input.command, input.cwd, input.env)).pipe(` ; `tool/shell.ts:416` = `export function cmd(shell: string, command: string, cwd: string, env: NodeJS.ProcessEnv)` et `:417-420` = `ChildProcess.make(shell, ["-NoLogo","-NoProfile","-NonInteractive","-Command", …])` ; `src/shell/shell.ts:101-108` = `function win()` … `[which("pwsh"), which("powershell"), gitbash(), process.env.COMSPEC || "cmd.exe"]` ; `tool/shell/prompt.ts:277-278` = intro `"Executes a given bash command in a persistent shell session …"`. Le chemin corrigé `src/shell/shell.ts` **existe** (confirmé) ; le chemin BACKLOG `tool/shell/shell.ts` n'existe pas. Aucun numéro de ligne décalé |
| le correctif supprime bien la cause racine | ok | la cause est le `spawn` neuf par commande (`tool/shell.ts:627`) ; §4 remplace ce point par un registre `shellSessions.run(sessionID, …)` qui garde le process et écrit sur `stdin` |
| le critère §7 est ABSOLU et MONOTONE / dérivé de la baseline | ok, avec réserve | §7 : « rafale de 5 commandes triviales … temps mural médian ≤ 800 ms », référence « 5 × 272,6 ms ≈ 1 363 ms (⇒ −41 %, ≥ 40 % requis) ». Seuil en **ms absolus**, non un ratio : valide. La valeur n'est pas ajustée pour passer : `800 / 1363 = 0,587` couvre bien l'exigence −40 %. Réserve : l'instrument du §8 compare à `0.6 × BASELINE_burst` (= 818 ms), un second seuil (O2) |
| les tests §8 sont exécutables ici | ok | nouveau fichier `packages/opencode/test/tool/shell-session.test.ts`, commande `bun test --timeout 30000 ./test/tool/shell-session.test.ts` depuis `packages/opencode` — répertoire et convention confirmés (`test/tool/shell.test.ts`, `shell-launch-retry.test.ts`, `shell-output-prompt.test.ts` existent), aucun alias `@/…` requis |
| les régressions potentielles sont nommées et réelles | ok | les six fichiers cités §6 existent : `test/tool/shell.test.ts`, `shell-launch-retry.test.ts`, `shell-output-prompt.test.ts`, `terminal-output.test.ts`, `terminal-output-truncation-root.test.ts`, `test/tool/registry.test.ts` (glob vérifié). Le mécanisme de régression le plus probable (budget de retry déplacé au spawn) est explicitement signalé |
| les `INFERE:` sont dûment marqués avec méthode | ok | §2 marque `INFERE:` l'origine du coût `pwsh` **et** donne la méthode (20 échantillons, comparer les médianes) ; §10 marque `INFERE:` la sémantique du `Set-Location` dans un script block enfant |
| l'effort §9 est réaliste | ok | `M` justifié par un registre à cycle de vie (spawn paresseux, framing `stdin`/marqueur, reset, finalizer) touchant le cœur du lancement de process |

## Objections

### O1 — MAJEUR. Le `cwd` obéit à deux politiques incompatibles (§4 vs §8)

§4 énonce deux mécanismes distincts pour le `cwd` :
(a) « le répertoire courant est **réinitialisé explicitement** à `input.cwd` avant chaque envoi »
(enveloppe `stdin` : `Set-Location -LiteralPath <cwd>; & { <command> }`, l.106) ;
(b) « Réinitialisation (kill + respawn) si `cwd`, `env` ou `shell` **diffèrent** de la session
courante » (l.86-87).
Les deux se contredisent : si (a) remet le `cwd` à `input.cwd` à **chaque** commande, le `cwd` ne
peut jamais « différer de la session courante » de façon à déclencher (b). Pire, le test §8.4
**enterre** (b) comme comportement attendu — « changer `cwd` de la commande suivante ⇒ nouveau
process (PID différent) » — ce qui, comme l'outil pose un `workdir` **par commande**, détruirait le
gain de H6 dès la première commande utilisant `workdir` (respawn = 273 ms repayés).

**Ce qu'il faut changer** : choisir une seule politique et l'aligner partout. La cohérente avec
l'objectif de performance est (a) seule : le process persiste, le `cwd` est réinitialisé par
`Set-Location` à chaque commande (**pas** de respawn sur changement de `cwd`) ; §8.4 doit tester
cela (`cwd` de la commande *n+1* = `input.cwd`, **même** PID). Le respawn ne se justifie que pour
un changement de `shell`/`env` ou un process mort ; l'écrire ainsi.

### O2 — MINEUR. Deux seuils différents entre §7 et §8

§7 fixe le critère à `≤ 800 ms` ; §8.2 l'exprime comme `median ≤ 800 ms` mais la « commande de
mesure » du §7 dit que le test « l'asservit à `< 0.6 × BASELINE_burst` » (= 818 ms si
`BASELINE_burst = 1363`). Un même test à deux seuils (818 au §7, 800 au §8) est un point de
désaccord à figer.

**Ce qu'il faut changer** : un seul seuil, exprimé en ms absolus (`≤ 800`) et relevé de
`BASELINE.md`, à l'identique dans la fiche et dans le test.

### O3 — MINEUR. Texte résiduel (brouillon) dans le cas de test §8.1

Le cas 1 contient une rature laissée en clair : « … écrit par la commande 1 puis relu… **non** :
l'état ne survit pas ». C'est un brouillon d'auteur, pas une consigne exécutable.

**Ce qu'il faut changer** : le réécrire comme intention finale — mesurer le PID hôte via le
registre ; succès = `pid2 === pid1` et compteur de spawns = 1.

### O4 — MINEUR. Le prompt à réécrire n'est cité que dans une de ses deux branches

`tool/shell/prompt.ts:277-278` est l'intro du retour **bash** ; le shell effectivement retenu sur
Windows est `pwsh`, dont la branche (au-dessus, ~l. 258-275) porte une autre intro. §4 dit
« remplacer la phrase `persistent shell session` » mais ne fixe pas la branche.

**Ce qu'il faut changer** : préciser que **les deux** intros (bash et powershell) doivent décrire
un process persistant à état **non conservé** entre commandes.

## Required changes

1. **Trancher le `cwd`** (O1) : une seule politique — reset par `Set-Location` à chaque commande,
   pas de respawn sur changement de `cwd` — et corriger §8.4 en conséquence (succès = PID
   **identique**, `cwd` réinitialisé).
2. **Unifier le seuil** (O2) : `≤ 800 ms` partout, valeur relevée de `BASELINE.md`.
3. **Nettoyer §8.1** (O3) : retirer la rature, ne garder que le critère observable.
4. **Citer les deux branches du prompt** (O4) et transformer le risque de framing `stdin` (§6 :
   « séparateur non falsifiable, pas de concaténation naïve ») en **critère d'implémentation** du
   §8, pas seulement en risque.
5. Compléter §6 : préciser le comportement quand `env` change (fréquent) — clé de session
   `shell`+`cwd`+`env`, respawn documenté, sinon le process résident par session n'est pas borné.

## Implementation guidance

Ordre : (1) figer la politique `cwd`/`env` **avant** d'écrire le test ; (2) écrire
`shell-session.test.ts` d'abord, avec le cas d'isolation par mutation (§8.3) — il doit **échouer**
si le sous-shell est neutralisé, c'est la preuve que le garde fonctionne et pas seulement qu'il est
présent ; (3) brancher ensuite le registre sur `tool/shell.ts:627` ; (4) relancer les six tests de
régression du §6. Piège connu : `shell-launch-retry.test.ts` vérifie le budget de retry **au
spawn** — déplacer le spawn dans un registre déplace ce point d'application, c'est la régression la
plus probable. Vérifier que le finalizer ferme le process à la fin de session (pas de `pwsh`
orphelin) et que la commande transmise reste **identique octet pour octet** pour la validation
tree-sitter (§4 « volontairement inchangé »).
