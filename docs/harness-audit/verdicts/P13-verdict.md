# P13 — mutation de fichier détectée par liste fixe de commandes (`bash`)

Proposition validée : `docs/harness-audit/proposals/P13-mutation-detection.md`

# Validator

`validateur-independant-p13` — `independent` : n'a pas rédigé la proposition.
Aucune modification de fichier source pendant cette validation ; seules des lectures et
une exécution de test ont été faites.

# Status

`PASS_WITH_CHANGES`

Le diagnostic est exact et la sévérité est correctement calibrée (voir `Objections` #1 :
la liste **n'ouvre pas** de permission). Cinq corrections sont obligatoires avant
implémentation ; aucune ne remet en cause le choix de la stratégie (b).

# Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | KO (mineur) | 3 défauts sur ~30 citations ; voir `Objections` #2. Aucune citation n'est fausse, 3 sont condensées ou décalées d'une unité. |
| le correctif supprime vraiment la cause | ok | `src/tool/shell.ts:409` est bien la porte unique : `if (cmd && (FILES.has(cmd) \|\| (shellKind === "cmd" && CMD_FILES.has(cmd))))`. `grep "FILES.has"` sur `packages/opencode/src` ne renvoie qu'un seul site d'appel (`shell.ts:409`), donc ouvrir cette porte suffit. |
| le correctif ne casse pas un comportement existant | non-testé (base déjà rouge) | `bun test test/tool/shell.test.ts` → **exit 1**, `68 pass / 27 fail / 3 errors`, 95 tests, dont 26 échecs dans `describe("tool.shell permissions")` (`shell.test.ts:215`) **avant toute modification**. Le critère de succès §7 (« le bloc … passe sans modification de ses assertions ») est donc inatteignable en l'état. Log : `%TEMP%/opencodev2/p13-shell-test.log`. |
| tests proposés sont exécutables dans ce dépôt | KO | §7 prescrit `bun test test/tool/shell/shell.test.ts` ; ce chemin **n'existe pas**. La suite réelle est `packages/opencode/test/shell/shell.test.ts` (que §6 cite correctement). `glob packages/opencode/test/**/shell*.test.ts` → `test/tool/shell.test.ts`, `test/shell/shell.test.ts`, `test/tool/shell-output-prompt.test.ts`, `test/tool/shell-launch-retry.test.ts`. |
| effort et coût annoncés réalistes | KO | Aucun taux de faux positif n'est mesuré dans P13 (§5(a) dit « ~100 % » sans mesure, et ce chiffre est **surestimé** ; §5(b) ne donne qu'une borne qualitative). Voir `Objections` #3. |
| périmètre réel de la nouvelle demande (`external_directory`) | ok, et plus étroit qu'annoncé | `shell.ts:413` `if (!resolved \|\| containsPath(resolved, instance)) continue` + `project/instance-context.ts:19-23` (`ctx.directory` **ou** `ctx.worktree`) : une cible littérale dans le projet **ou le worktree** ne produit aucune demande. L'`INFERE` de P13 §2 est donc **vérifiée**, et devient un fait. |
| modèle de permission : un rejet bloque-t-il silencieusement ? | non — arrêt franc, avec effet de bord non documenté | `permission/index.ts:262-267` attend une `Deferred` ; `:282-286` `reject` → `RejectedError` ; `:288-297` **rejette en plus toutes les demandes en attente de la même session**. |
| mode `always` : rend-il le contrôle sans effet ? | oui, et P13 ne le voit pas à sa vraie portée | `shell.ts:421` + `permission/arity.ts:135` (`python: 2`) ⇒ clé `"python -c *"` ; `permission/index.ts:304-310` pousse une règle `allow` sur ce motif. Voir `Objections` #4. |
| comportement par défaut de `external_directory` | absent de P13 | `agent/agent.ts:119-121` `"external_directory": { "*": "ask" }` mais `agent/agent.ts:356-370` force `{ [Truncate.GLOB]: "allow" }` pour tout agent sans refus explicite ⇒ **auto-accordé par défaut**. P13 §6 annonce « une invite de plus » sans cette condition. |
| la proposition admet-elle ne pas être une barrière de sécurité | ok | §6 §1 : « **Ce correctif n'est pas une barrière de sécurité.** … Toute présentation de ce correctif comme un contrôle d'accès serait fausse ». Déclaration complète et juste. |
| le patch tel qu'écrit est implémentable tel quel | KO | `prefix` et `dynamic` ne sont **pas exportés** (`shell.ts:189`, `shell.ts:196`), et `positionalWriteArgs` / `extractPathLiterals` sont utilisés sans être définis. Voir `Objections` #5 et #6. |

# Objections

## 1. La sévérité est bien calibrée — FILES n'ouvre aucune permission

C'était le point décisif. La liste ne sert **qu'à classer** la commande pour alimenter
`scan.dirs` ; elle n'ouvre rien. Chemin réel, de bout en bout :

1. `shell.ts:652` `collect(...)` ; `shell.ts:409` porte **seule** la liste.
2. `shell.ts:410-416` : `pathArgs` → `argPath` → `shell.ts:413` `if (!resolved || containsPath(resolved, instance)) continue` ⇒ **seuls les chemins externes survivent** → `shell.ts:414-415` `scan.dirs.add`.
3. `shell.ts:653` `if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)`.
4. `shell.ts:654` `yield* ask(ctx, scan)` → `shell.ts:278-290` : si `scan.dirs.size > 0`,
   `ctx.ask({ permission: "external_directory", patterns: globs, always: globs })` (`:285`).
5. `shell.ts:292-298` : `ctx.ask({ permission: ShellID.ToolID, … })` — alimenté **indépendamment**
   de la liste par `shell.ts:419-422` pour toute commande non-`CWD`. `shell/id.ts:16`
   `export const ToolID = "bash"`.

Donc `python -c "…"` déclenche **déjà** la permission `bash` aujourd'hui, et ne déclenche
**pas** `external_directory`. P13 décrit cela correctement (« Conséquence exacte : `python -c …`
**décline déjà** la permission `bash` »). **Aucun correctif de sécurité n'est en jeu : c'est un
trou de classification, pas un contournement.** La proposition ne surestime pas la gravité.
Ce qui suit ne remet donc pas ce verdict en cause : ce sont des défauts d'implémentation et
d'honnêteté chiffrée, pas de cadrage.

## 2. Trois citations décalées ou condensées (aucune fausse)

- §6 « `ctx.ask` est appelé avec `metadata: {}` (`shell.ts:287` et `:297`) » : `metadata: {}`
  est en réalité aux lignes **`288`** et **`297`** ; `287` est `always: globs,`.
- §5(c) « `BashArity.prefix` retombe sur `tokens.slice(0, 1)` » pour la clé `python -c *` :
  faux chemin. `permission/arity.ts:135` définit `python: 2`, donc `arity.ts:5` renvoie
  `tokens.slice(0, 2)` = `["python","-c"]`. La **clé annoncée est juste**, la justification est
  mauvaise. Corrigible en une phrase.
- §2 et §5(b) : les blocs `FILES` (`shell.ts:42-63`) et `CMD_FILES` (`:64-77`) sont cités en
  regroupant plusieurs entrées sur une ligne ; le fichier réel en met une par ligne. Contenu
  vérifié membre par membre, identique. `shell.ts:52-54` (le commentaire sur les alias
  PowerShell) est lui **verbatim exact**.

## 3. Aucun taux de faux positif n'est mesuré, et le chiffre de rejet de (a) est surestimé

P13 §5(a) rejette l'extension de `FILES` sur un « ~100 % des usages d'interpréteur ». Non
chiffré, et faux dans le sens inverse : `shell.ts:413` + `instance-context.ts:19-23` filtrent
toute cible **dans** le projet ou le worktree. `python script.py` sur `script.py` ne produit
**rien**. Le coût réel de (a) se limite aux scripts appelés par chemin absolu ou parent
(`python ../build/x.py`) — réel, mais non mesuré et bien inférieur à « ~100 % ».

Symétriquement, §5(b) ne fournit qu'une borne qualitative (« `charge inline ∧ littéral de
chemin hors instance` »), jamais un taux. La recommandation (b) est **juste** — je la confirme :
(b) ajoute une nouvelle catégorie (`WRITE_UTILS` + drapeaux inline) qui n'existe pas dans `FILES`,
là où (a) ne fait qu'élargir une liste existante — mais elle est **affirmée, pas démontrée**.
Il faut l'une des deux choses : un taux mesuré, ou la mention explicite « non mesuré ».

## 4. `always` ne limite pas la détection : il la neutralise après coup — et P13 le sous-évalue

P13 §9 note « `always: "python -c *"` couvre alors aussi les charges inline en écriture ».
Vrai, mais présenté comme un aside sur l'option retenue, alors que c'est **la** raison pour
laquelle le mécanisme perd son effet après la première approbation :

- `shell.ts:421` `scan.always.add(BashArity.prefix(tokens).join(" ") + " *")` ⇒ `"python -c *"`.
- `permission/index.ts:304-310` : une réponse `always` pousse une règle
  `{ permission, pattern: "python -c *", action: "allow" }` dans `approved`.
- Toute `python -c` ultérieure **n'atteint plus jamais** `evaluate` : `:241`
  `if (rule.action === "allow") continue`. Comme les charges sans littéral de chemin ne
  produisent **aucune** demande `external_directory`, une seule approbation « always » couvre
  des commandes que le détecteur ne voit plus.

Aggravant : l'UI montre une seule commande (`shell.ts:420` `scan.patterns.add(source(node))`)
et l'octroi porte sur un motif générique. C'est un problème d'hygiène de permission à traiter
explicitement (clé `python -c *` trop large, cf. `Objections` #5), pas une note de bas de page.

## 5. Le patch est inexploitable en l'état : `prefix`/`dynamic` ne sont pas exportés

P13 §4 impose « un seul site, ligne 409 », « sans dépendance », et `FILES`, `ask`,
`BashArity.prefix` **inchangés**. Or le module projeté réutilise `prefix()` et `dynamic()` :

```
shell.ts:189   function dynamic(text: string, ps: boolean) {
shell.ts:196   function prefix(text: string) {
```

Aucune des deux n'est `export` (vérifié sur le fichier réel). Le fichier
`src/tool/shell/mutation.ts` ne peut donc pas les importer sans modifier `shell.ts` — ce qui
contredit la contrainte « un seul site ». De plus `positionalWriteArgs(tokens)` (P13 ligne 195)
et `extractPathLiterals` (lignes 195, 201) sont **appelés mais jamais définis**, donc le
comportement sous PowerShell n'est pas spécifié : le repli `pathArgs` (`shell.ts:203`) est
précisément le code qui filtre `SWITCHES`/`FLAGS` (`shell.ts:224-229`), et il n'est atteint que
si `paths` est vide.

## 6. `WRITE_UTILS` n'atteint pas les cibles qu'il annonce, et `of=` y est mort

P13 §4 annonce « `extractPathLiterals` … y compris après … `of=` » et liste `dd` dans
`WRITE_UTILS`. Or la ligne 195 de P13 :

```ts
const literal = inline ? payloads.map(extractPathLiterals).flat() : positionalWriteArgs(tokens)
```

`extractPathLiterals` n'est appliqué que dans la branche **inline**. `dd of=C:\out bs=1M`
n'est pas inline : la branche des utilitaires est prise, `of=` n'est donc jamais extrait par le
seul mécanisme qui sait le lire. Pire, le diff contourne `pathArgs` dès que `paths` est non vide :

```ts
const args = inline.paths.length ? inline.paths : pathArgs(command, ps, shellKind === "cmd")
```

`tee`, `dd`, `patch`, `install` entrent par `WRITE_UTILS` avec `inline === false`, donc
`paths = positionalWriteArgs(tokens)` ; si cette fonction rend une liste non vide, `pathArgs`
— qui seul normalise les interrupteurs PowerShell — est sauté. Le comportement de
`out-file -Path C:\x -Encoding utf8 t.txt` n'est donc pas défini.

# Required changes

1. **Élever l'analyse `always` dans `Risks`.** Reprendre `Objections` #4 : montrer
   `shell.ts:421` + `permission/arity.ts:135` + `permission/index.ts:304-310` et conclure
   qu'une approbation `always` de `bash` pour `python -c *` désactive définitivement la
   détection. Indiquer le remède envisagé (resserrer la clé d'octroi, ou ne pas exposer
   `always` pour cette catégorie).
2. **Corriger la justification de la clé d'octroi** : remplacer « retombe sur
   `tokens.slice(0, 1)` » par le fait vérifié `python: 2` → `tokens.slice(0, 2)` (§2 #2).
3. **Corriger les citations `:287` → `:288`**, et remplacer « ~100 % » par une borne
   vérifiable (cible hors `directory` **et** hors `worktree`), ou écrire « non mesuré ».
4. **Trancher l'export.** Soit exporter `prefix`/`dynamic` depuis `shell.ts` et corriger la
   contrainte « un seul site », soit duplicer ~10 lignes dans `mutation.ts` et le dire. Fournir
   les définitions de `positionalWriteArgs` et `extractPathLiterals`, et préciser le contrat
   `detectWritePaths` sous PowerShell (interrupteurs, valeurs de drapeaux).
5. **Corriger la commande de régression §7** : `test/tool/shell/shell.test.ts` →
   `test/shell/shell.test.ts`, et remplacer le critère « le bloc … passe » par une comparaison
   de référence (*baseline* 68 pass / 27 fail / 3 errors sur `test/tool/shell.test.ts`),
   sinon le critère est inatteignable.
6. **Soit implémenter `of=`, soit retirer `dd`/`patch`/`install` de `WRITE_UTILS`** tant que
   la branche non-inline ne le couvre pas (§6 de la présente revue). Le tableau doit annoncer
   `tee`/`tee-object`/`out-file` correctement extraits, ou rien.

# Implementation guidance

Ordre : (1) créer `src/tool/shell/mutation.ts` avec `INLINE`/`WRITE_UTILS` et **toutes** les
fonctions définies, sans I/O ; (2) lever la dépendance `prefix`/`dynamic` (voir changement 4) ;
(3) appliquer le patch unique en `shell.ts:409` en conservant `log.info("resolved path", …)`
(`shell.ts:412`), que le diff de P13 omet ; (4) tests.

Piège connu : le diff de P13 remplace `pathArgs` dès que `inline.paths` est non vide, donc un
utilitaire de `WRITE_UTILS` perd la normalisation des interrupteurs PowerShell
(`shell.ts:224-229`) — c'est le défaut #6, il se voit sur `out-file`, pas sur `python -c`.

Fichiers de test : créer `test/tool/shell-mutation-detect.test.ts` (table pure sur
`detectWritePaths`, les 8 cas de P13 §7 sont corrects) et
`test/tool/shell-mutation-detect.integration.test.ts`. Pour l'intégration, copier le harnais de
`ctx.ask` de `test/tool/shell.test.ts:215` et utiliser une cible **hors** `worktree`, sinon
`shell.ts:413` filtre tout et le test passe à vide. Rejouer `bun test test/tool/shell.test.ts`
en comparant au *baseline* (68/27/3), pas à zéro.