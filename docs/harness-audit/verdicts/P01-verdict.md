# Gabarit imposé — verdict de validation

## Proposal

`P01` — `AGENTS.md` fichier-scoped réinjecté dans chaque résultat de lecture —
`docs/harness-audit/proposals/P01-read-instruction-reminder.md`

## Validator

`validator-independent-01` — declaration : `independent`. Je n'ai pas rédigé la
proposition. Je n'ai modifié aucun fichier source : la seule écriture de cette session
est le présent verdict.

## Status

`PASS_WITH_CHANGES`

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | KO (2 défauts sur ~40 citations) | `instruction.ts:318` ne contient pas le commentaire cité (il est à `:303`, `:318` vaut `continue`) ; `instruction.ts:208-211` **saute** les instructions distantes, alors que la proposition les dit acceptées |
| le correctif supprime vraiment la cause | ok | `read.ts:357` (définition unique) + `read.ts:362/379/397/466` (4 ajouts) ; grep `reminder` : aucun autre site. `reminderFor` couvre les 4 |
| provenance de `loaded` établie, sans mécanisme supposé | ok | `read.ts:271` → `Instruction.resolve` `instruction.ts:287-332`, remontée `instruction.ts:304-329`, `results.push` `:325`, type `:66-70` = `{filepath; content}[]`. `read` calcule bien `signature` à `:135` et la perd (retour `:145` = `content` seul). **Exact** |
| première livraison préservée pour un fichier jamais lu | ok | `reminderFor` : `fresh` non vide ⇒ corps complet. Vrai par construction, aucun état préalable |
| invalidation sur modification entre deux lectures | ok (résiduel documenté) | clé `(sessionID, filepath, size:mtime)` avec `mtime` = `stat.mtime.getTime()` (`instruction.ts:131-135`) ; même preuve que `provenUnchanged` (`read.ts:408`) et que le cache disque `instruction.ts:137-141`. Fenêtre ms+size identique héritée, pas introduite |
| chemin `unchanged` (`read.ts:362`) traité, pas seulement le chemin normal | ok | proposition §4.3 : `reminderFor` appelé aux **quatre** sites, `362` inclus, réduit à `POINTER` ~160 octets. Le grep indépendant confirme l'exhaustivité de la liste |
| le résiduel injection hostile est dit explicitement | ok | §6 point 3 « la *première* injection est toujours en clair et hors bande […] toujours une fois » ; §4.5 « n'est ni validé ni corrigé ». C'est l'aveu demandé |
| tests proposés sont exécutables dans ce dépôt | KO (2 défauts) | `packages/opencode/test/tool/read.test.ts` existe (925 l.) ; `exec(dir, args, next = ctx)` `:98-104` et `ctx.messageID` `:48-50` sont surchargeables ⇒ T2/T3 constructibles. Mais T2 échoue pour la mauvaise raison sans surcharge de `messageID`, et **aucun test ne relit le même fichier** ⇒ `read.ts:362` jamais exercé |
| effort et coût annoncés réalistes | ok | « M » : 3 fichiers, 1 champ de type élargi, 4 sites. Vérifié : `read.test.ts:666` et `extract` `:32-33` exigent des `string` ⇒ le magasin dédié est bien nécessaire, pas un troisième mécanisme |
| non-régression des tests existants | ok (par lecture) | `read.test.ts:654-668` reste vert : `tmpdirScoped` frais ⇒ aucune signature enregistrée ⇒ `fresh` non vide ⇒ corps complet. `instruction.test.ts` **non cassé** : les assertions sur résultats non vides sont `results.length` (`:131`), `toHaveLength(1)` (`:161`, `:179`) et la projection `results[0].filepath` (`:132`, `:162`, `:181`) — l'ajout de `signature` ne les touche pas ; les 5 autres sont des `toEqual([])` (`:146`, `:163`, `:195`). **Aucun `toEqual` sur un objet peuplé.** Non exécuté : voir required change 6 |

## Objections

**O1 — `T2` est un faux piège d'échec : il sera rouge pour la mauvaise raison.**
La proposition écrit (l.352) que T2 doit produire « `already in context` ». Or `resolve` filtre
déjà en amont, sur `messageID` :

> `instruction.ts:316` — `if (set.has(found)) {`

avec `s.claims.get(messageID)` en `instruction.ts:311`. Les helpers de test réutilisent le
contexte par défaut, dont **un seul** `messageID` :

> `read.test.ts:48-50` — `const ctx = { sessionID: SessionID.make("ses_test"), messageID: MessageID.make("msg_test"), callID: "",`

Donc sur la seconde lecture, `loaded` vaut `[]`, et la première ligne de `reminderFor`
(`if (loaded.length === 0) return ""`) renvoie `""` : la sortie ne contiendra **ni**
`Test Instructions`, **ni** `already in context`. T2 échoue alors que le mécanisme est bon.
**À changer** : T2 et T3 doivent passer `next` avec un `messageID` **distinct et le même
`sessionID`** (le nouveau magasin est indexé par `sessionID`). Signature disponible :
`exec(dir, args, next = ctx)` (`read.test.ts:98-104`).

**O2 — aucun test proposé n'exerce `read.ts:362`, et l'affirmation contraire est fausse.**
§7 l.368 affirme « T2 prouve l'absence de réinjection **sur le chemin de retenue** ». Faux :
T2 lit « un *autre* fichier du même dossier ». Un fichier différent a un digest différent,
donc `ReadLedger.duplicateOf` (`read.ts:458-459`) ne s'active pas et le rendu part en
chemin **complet** (`read.ts:466`) — le chemin que la proposition ne prouve pas
d'invalidation. Le chemin `unchanged` (`read.ts:408 → 362`), qui est la moitié du coût et la
demande explicite du validateur, n'est couvert par **aucun** test.
**À changer** : ajouter un test qui relit **le même** fichier, et y asserter `POINTER` +
`Buffer.byteLength(output)` borné, en citant `read.ts:362` dans le nom.

**O3 — la citation de sécurité est une inversion du code.**
§6 l.324-325 justifie la menace par « les globs `instructions` de la config
(`instruction.ts:209-226`, qui acceptent des fichiers distants) ». Le code fait l'inverse :

> `instruction.ts:208-211` — `if (raw.startsWith("https://") || raw.startsWith("http://")) {` … `reason: "remote"` … `continue`

Les sources distantes sont **écartées**. La menace réelle est plus grave et n'est pas
nommée : un `AGENTS.md` **committé dans le dépôt** est trouvé par simple remontée de nom
depuis le fichier lu (`instruction.ts:305` via `find(current)`), lu et rendu (`instruction.ts:322-323`)
sans **aucun** contrôle de provenance. **À changer** : remplacer la référence 209-226 par la
chaîne `find → read → renderInstruction` et nommer le dépôt comme origine de la menace.

**O4 — une attribution de ligne fausse dans le bloc producteur.**
§2 l.53-54 montre `318: // Walk upward from the file being read…`. La ligne 318 vaut
`continue` ; le commentaire est à la **ligne 303**, et l'en-tête `instruction.ts:318-326`
devrait donc lire `instruction.ts:303` + `instruction.ts:321-326`. Les cinq autres lignes du
bloc (321-325) sont exactes.

**O5 — l'énoncé T3 est ambigu sur le fichier relu, ce qui laisse `read.ts:362` couvert ou
non selon l'interprétation.** T3 dit « Réécriture de l'`AGENTS.md` […] puis relecture » sans
dire *quel* fichier. Si c'est le même `test.txt`, `mtime`/`size` sont inchangés ⇒ `read.ts:408`
retient ⇒ c'est en fait le seul test qui touche `362`. L'ambiguïté doit être levée : nommer
le fichier et le chemin emprunté dans le critère de succès.

## Required changes

1. **T2 et T3 doivent surcharger `ctx` via le paramètre `next` de `exec`** avec un
   `messageID` distinct (même `sessionID`), sinon ils échouent sur le dédup
   `s.claims` (`instruction.ts:316`) et ne prouvent rien du nouveau magasin. *(O1)*
2. **Ajouter un test du chemin `unchanged`** : relire le **même** fichier une seconde fois,
   asserter `already in context` présent, `Test Instructions` absent, taille bornée ; le
   nommer avec la référence `read.ts:362`. Corriger la phrase l.368 qui attribue ce rôle
   à T2. *(O2)*
3. **Réécrire le §6 point 1** : supprimer l'affirmation « acceptent des fichiers distants »
   (`instruction.ts:208-211` les écarte) et nommer explicitement le `AGENTS.md` committé dans
   le dépôt comme origine de la menace, avec la chaîne `find → read → renderInstruction`.
   Conserver et renforcer la phrase existante sur le résiduel : le dédup ramène à **une**
   occurrence, il **ne valide pas** la première. *(O3)*
4. **Corriger l'attribution de ligne** `instruction.ts:318` → `instruction.ts:303`, et l'en-tête
   `318-326` → `303` + `321-326`. *(O4)*
5. **Nommer le fichier relu dans T3** et y indiquer le chemin d'exécution attendu. *(O5)*
6. **Ajouter une preuve d'exécution au dossier** : `bun test test/tool/read.test.ts` vert
   **sans modification**, et exécution effective des T1-T6. La proposition ne qualify
   elle-même rien de vérifié (`INFERE:`, l.299) ; un correctif non exécuté n'est pas livré.

## Implementation guidance

Ordre : `instruction.ts` (élargir `Interface.resolve` `:66-70` et propager `signature` depuis
`read` `:135` — ne jamais la recalculer sur le rendu, sinon `full`↔`summary`
`instruction.ts:41-54` collapsent) → `read-ledger.ts` (`instructionSeen`/`noteInstruction` à
côté de `put` `:310-321`, bornés par `MAX_SESSIONS`/`MAX_ENTRIES` `:60/:63`, **vidés par
`reset` `:483-491`** comme `entries`/`content`/`produced`, sinon un compaction laisse des
signatures mortes dans le même store) → `read.ts` (`reminderFor` aux **quatre** sites
`362/379/397/466`). Piège : `reset` est aussi le hook de test invoqué en `beforeEach`
(`read.test.ts:44-46`) ; oublier le vidage du nouveau store ferait dépendre T1-T6 de l'ordre.
Créer `packages/opencode/test/tool/read-instruction-reminder.test.ts` en copiant
`read.test.ts:1-46` (imports, `OPENCODE_READ_LEDGER_DIR`, `afterEach`/`beforeEach`,
`exec(dir, args, next)`).