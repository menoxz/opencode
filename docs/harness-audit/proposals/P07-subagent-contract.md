# P07 — contrat de retour du sous-agent

> Révisé après verdict PASS_WITH_CHANGES du 2026-10-03 — réécriture complète (fichier corrompu, C-21), C-25 et C-20 traitées

Réécriture intégrale depuis le verdict. Rien du fichier précédent n'est conservé : selon C-21, deux agents ont
écrit ce fichier simultanément, et ni son contenu ni son bandeau n'étaient fiables.

**Traçabilité des citations.** Les 28 citations validées par le verdict ont été rouvertes par tranches pendant
cette révision. Trois écarts en découlent, tous documentés ci-dessous :

- `session.ts:942-943` était **fausse**. Elle est remplacée par `session.ts:936-937`, relue (§2 E7).
- `task.ts:236`, **jamais lue par le validateur**, a été relue et est reproduite mot pour mot en §2 E3.
- Une citation de la version précédente ne correspondait à aucun contenu relu et a été **supprimée** plutôt que
  recopiée (§2 E1, §5.2).

## 1. Problem

Le sous-agent qui travaille pour son parent ne lui rend pas sa DoD. Le chemin de retour est complet et
fonctionnel, mais la preuve que l'enfant a produite est transportée dans un metadata que personne ne relit, et
jamais fusionnée dans l'état d'objectif du parent.

## 2. Evidence

### E1 — Le schéma exporté est laxiste, mais le contrat de lancement est déjà appliqué ailleurs

`task.ts:52-59` déclare les champs de base, `task.ts:62-65` la structure qui les regroupe, `task.ts:66` le champ
`command`. `task.ts:69-81` est le schéma **exporté** ; `task.ts:78-80` y documente `timeout_minutes`.
`task.ts:83-88` définit `LaunchParameters`, qui rend `description`, `prompt` et `subagent_type` **obligatoires**.
`task.ts:90-92` assure l'échappement de balisage, `task.ts:94-108` le rendu de sortie.

`task.ts:741-746` confirme que `Parameters` est bien le schéma exposé au modèle et le type d'entrée du runner :

```ts
741:     return {
742:       description: DESCRIPTION + BACKGROUND_DESCRIPTION,
743:       parameters: Parameters,
744:       execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
```

**Le laxisme est réel mais n'est pas un défaut de contrat.** Les obligations portées par `task.ts:83-88` ne sont
pas vérifiées au moment de la validation de l'appel — elles le sont par le garde de décodage de `task.ts:391-399`,
qui produit une erreur **nommée** et un message précis :

```ts
391:      const params = yield* Schema.decodeUnknownEffect(LaunchParameters)(input).pipe(
392:        Effect.mapError(
393:          () =>
394:            new Tool.InvalidArgumentsError({
395:              tool: id,
396:              detail: "Launch/resume requires description, prompt, and subagent_type strings",
397:            }),
398:        ),
399:      )
```

`task.ts:404-410` rejette en outre un prompt porteur d'un marqueur d'élision, `task.ts:413-423` demande la
permission, `task.ts:425-428` résout l'agent, `task.ts:430` relit la session parent.

**Conclusion de cette section, contre-intuitive mais établie : il n'y a pas de trou de validation à combler
ici.** Un lancement incomplet échoue déjà, avec un message qui nomme les trois champs manquants. C'est ce qui
motive le rejet du volet (b) en §4.

### E2 — Le budget est résolvement indépendant de l'appel

`task.ts:110-118` résout une durée depuis l'environnement, `task.ts:124-128` l'applique, `task.ts:148-161`
compose le message de dépassement, `task.ts:163-168` extrait le texte de l'enfant. `task.ts:694-695` est le point
de résolution unique :

```ts
694:    const minutes = next.budgetMinutes ?? taskBudgetMinutes()
```

La durée demandée par l'appel n'y figure pas. `task.ts:303-305` est la signature d'entrée du runner et
`task.ts:315` traite `input.action` comme discriminant applicatif ; `task.ts:326-330` est la branche d'attente,
où le délai est exprimé en millisecondes.

Le court-circuit en `??` est ici **structurellement incapable** de distinguer deux mondes : dès qu'un budget
d'agent est présent, la valeur résolue est la même quelle que soit l'issue de la discussion. Toute assertion
construite sur ce court-circuit ne prouve rien — c'est pourquoi aucun test de §7 ne porte sur lui.

### E3 — L'enveloppe de retour ne transporte que du texte — *angle mort C-25 refermé*

**C-25.** Le validateur n'a ouvert aucune plage de `task.ts:170-300`. Son silence sur `task.ts:236` était un
**angle mort, pas une validation**. La ligne a donc été relue directement. `task.ts:223-288` est
`backgroundMessage`, et `task.ts:236` est la **balise d'ouverture** de l'enveloppe :

```ts
235:  return [
236:    `<task id="${input.sessionID}" state="${input.state}">`,
237:    `<summary>${escapeTaskMarkup(title)}</summary>`,
238:    `<${tag}>`,
239:    escapeTaskMarkup(input.text),
240:    `</${tag}>`,
```

**Ce que `task.ts:236` démontre, et rien de plus :** l'enveloppe de fond est un conteneur de balises portant un
identifiant de session, un état, un titre et un texte échappé. Elle ne porte **aucun champ structuré**.

**Argument retiré.** La version précédente de ce fichier tirait de cette ligne un levier de correction —
restreindre l'enveloppe à quelques balises. Cet argument est **supprimé**. Même en réduisant l'enveloppe, la
preuve de l'enfant continuerait de se perdre en amont, à `task.ts:511-513` (§2 E4) : la perte n'est pas dans le
format de sortie, elle est dans l'absence de fusion. Une citation ne peut pas porter à la fois une description et
un correctif qu'elle ne démontre pas. `task.ts:236` est conservée **comme description**, et seulement comme telle.

### E4 — La preuve de l'enfant est transportée, jamais fusionnée

`task-evidence.ts:39-43` construit le tableau `allTests` à partir de la preuve de l'enfant :

```ts
39:  const allTests = (input.goalState?.completion?.evidence ?? []).map((item) => ({
40:    command: item.proof.slice(0, 1_000),
41:    outcome: "passed" as const,
42:    summary: item.dod.slice(0, 500),
43:  }))
```

`task-evidence.ts:44-48` traite les residuals, `task-evidence.ts:66-67` sérialise le tout dans le packet.
`task.ts:561-620` montre le chemin de fond : `task.ts:579` écrit le packet en `metadata.evidence_packet`, et
`task.ts:593-597` puis `task.ts:607` referment ce chemin.

Côté parent, `task.ts:505-507` court-circuite puis fusionne, et `task.ts:509-517` est l'unique écriture d'état
d'objectif de ce chemin :

```ts
506:            if (!current.goalState || packet.findings.length === 0) return
...
509:            yield* sessions.setGoalState({
510:              sessionID: ctx.sessionID,
511:              goalState: {
512:                ...current.goalState,
513:                findings,
```

**Deux faits distincts, tous deux vérifiés :**

1. `task.ts:511-513` **ne fusionne que `findings`**. Aucune ligne de ce chemin ne reprend `allTests`.
2. `task.ts:506` aggrave la situation : l'écriture n'a lieu que si le packet porte **au moins un finding**. Un
   enfant qui produit des preuves sans finding ne déclenche donc aucune écriture du tout.

`task.ts:490-491` normalise l'état en amont de cela. La preuve de l'enfant est produite, tronquée, sérialisée,
transmise — et jamais appliquée.

### E5 — Le chemin de retour enfant → parent est complet et correct

Ce chemin est vérifié et **n'est pas en cause** :

`task.ts:531-553` (boucle de l'enfant) → `task.ts:549` (fin de boucle) → `task.ts:485-521`
(`persistEvidence`) → `task.ts:506-517` → `task.ts:722-726` (`output`) → `task.ts:94-108`.

`task.ts:549-552` termine la boucle et capture le texte ; `task.ts:676-677` et `task.ts:699-707` composent la
sortie, `:699-707` étant la branche `partial` / `wall_clock` ; `task.ts:710-721` termine cette composition.
`task.ts:672-731` couvre cet assemblage de sortie.

Ce maillon fonctionne de bout en bout. **Le défaut n'est pas ce chemin : il est dans ce qu'il écrit à son
dernier étage** (E4).

### E6 — L'enfant tourne sous un agent et un jeu d'outils réduits

`task.ts:541` fixe l'agent de l'enfant (`agent: next.name`) ; `task.ts:543-545` retire `todowrite` et `task` du
jeu d'outils, sauf permission explicite ; `task.ts:694-695` est le point de résolution du budget. `task.ts:451-467`
construit la session enfant, `task.ts:456-460` portant le bloc `permission`.

`subagent-summary.ts:1-11` pose le contrat de rapport causal — `outcome`, `decisions`, `evidence`, `changes`,
`findings`, `residuals/unverified`, `next` — et `subagent-summary.ts:26-30` sélectionne le contrat applicable,
retournant un contrat vide hors mode lean.

**Conséquence arithmétique, à énoncer correctement.** Un « pas parent » et un « pas enfant » ne sont pas la même
unité : le parent travaille avec son gros contexte système et son transcript complet, l'enfant dans un contexte
restreint où la règle `subagent-summary.ts:16-17` interdit explicitement de renvoyer une sortie complète. Le
rapport des coûts **par pas** mesure donc la forme de la boucle, pas l'efficacité d'une validation.

**Le ratio qui portait la conclusion économique de la version précédente est abandonné.** Il compare des unités non
comparables, et il n'est pas reproductible : la requête d'audit qui le produit n'est ni jointe ni décrite. Une
métrique qui porte une conclusion économique sans requête reproductible n'est pas vérifiable. Aucun chiffre de ce
ratio n'est conservé ici.

### E7 — Le répertoire de l'enfant vient du contexte d'instance — *correction C-25*

**Citation fausse retirée.** `session.ts:942-943` était citée pour `input.directory`. Elle est **fausse** :
`input.directory` se trouve en réalité à **`session.ts:936-937`**.

`session.ts:670-689` est `Session.create`. Son type d'entrée énumère `parentID`, `title`, `agent`, `model`,
`permission`, `workspaceID` — **pas** `directory`. Le corps fixe le répertoire depuis le contexte d'instance :

```ts
680:      return yield* createNext({
681:        parentID: input?.parentID,
682:        directory: ctx.directory,
683:        path: sessionPath(ctx.worktree, ctx.directory),
```

`session.ts:936-937` appartient à un **filtre de listage** de sessions, pas à la signature de création. Il
n'est pas le seul : `grep input.directory` sur `src/session` rend six lectures, réparties sur quatre sites —
`:553` (construction de l'`Info`), `:936-937`, `:942-943` et `:984` (filtres de listage). `session.ts:219`
appartient au même ensemble d'appels.

## 3. Mechanism

L'appel `task` part du parent (`task.ts:303-305`). Le cheminement réel :

1. **Validation du schéma exporté.** `task.ts:69-81` accepte des champs de lancement optionnels (§2 E1).
2. **Garde de décodage.** `task.ts:391-399` applique les obligations de `task.ts:83-88` et produit, en cas
   d'échec, une `Tool.InvalidArgumentsError` nommée, au message de `task.ts:396`. `task.ts:404-410` rejette un
   prompt tronqué, `task.ts:413-423` demande la permission, `task.ts:425-428` résout l'agent, `task.ts:430` relit
   la session parent.
3. **Création de l'enfant.** `task.ts:451-467` crée la session sous l'agent de `task.ts:541`, avec les outils
   réduits de `task.ts:543-545` et le répertoire hérité du contexte (`session.ts:682`).
4. **Boucle.** `task.ts:531-553` exécute la session complète de l'enfant ; `task.ts:549-552` en sort avec le texte.
5. **Persistance.** `task.ts:485-521` construit le packet ; `task.ts:505-507` court-circuite sur l'absence de
   finding ; `task.ts:509-517` écrit un `goalState` parent où seuls les **findings** sont fusionnés.
6. **Rendu.** `task.ts:722-726` appelle `output` (`task.ts:94-108`) ; le packet part en `metadata.evidencePacket`
   (foreground) ou en `metadata.evidence_packet` (`task.ts:579`, chemin de fond), et l'enveloppe de fond
   (`task.ts:236`) n'encode que des balises.
7. **Effet final.** Le parent reçoit une preuve qu'aucun code applicatif ne relit. **Une DoD d'enfant est perdue
   à chaque délégation.**

Le défaut n'est **ni** le transport (`task-evidence.ts:39-43` fait son travail), **ni** le chemin de retour
(E5, complet et correct), **ni** la validation (E1, le garde fonctionne). Il manque **une seule chose** : la
fusion de `tests` au point `task.ts:511-513`.

## 4. Proposal

### (a) Fusionner la preuve de l'enfant dans l'état d'objectif du parent — *recommandé*

Seule ligne manquante du mécanisme complet. `task-evidence.ts:39-43` produit `allTests`, déjà tronqué à la
construction (`slice(0, 1_000)` sur la preuve, `slice(0, 500)` sur l'énoncé). Au point `task.ts:511-513`, à
l'intérieur de `persistEvidence`, homologuer le champ `tests` du packet vers `goalState.completion.evidence`, en
conservant la troncature déjà appliquée à la source.

Deux conséquences du code existant sont à traiter dans le même lot, faute de quoi le correctif resterait
partiel :

- `task.ts:506` conditionne l'écriture à `packet.findings.length > 0`. Un enfant qui rapporte des preuves sans
  finding ne produirait toujours aucune écriture ; la condition doit inclure la présence de `tests`.
- `task.ts:514` incrémente `version`. Toute écriture supplémentaire doit le faire, sinon deux révisions
  concurrentes de l'état d'objectif deviennent indiscernables.

Découpage volontaire : **`tests` seul**. Les findings et les residuals suivent dans un lot distinct — un finding
importé ne peut pas hériter d'un statut `CLOSED`, la clôture exigeant une preuve indépendante.

### (b) Durcir le schéma exporté — *écarté, sur la base de E1*

`task.ts:69-81` exporte un schéma laxiste ; `task.ts:83-88` porte les obligations mais hors du chemin de
validation de l'appel. Ramener le premier sur le second déplacerait l'échec au bon moment.

**Je ne le recommande pas.** `task.ts:391-399` produit déjà une erreur nommée dont le message de `task.ts:396`
énumère les trois champs attendus. Déplacer ce contrôle dans le schéma remplacerait ce message par une erreur de
schéma générique : c'est une **régression d'observabilité** pour un défaut qui n'en est pas un. Le gain de
précision temporelle ne compense pas la perte du message actionnable.

Si le validateur juge néanmoins ce durcissement souhaitable, la forme à employer est un `Schema.Union` en
**forme tableau** (`[Launch, FollowUp]`) ; la forme variadique à deux arguments n'est pas celle que cette
révision a pu vérifier dans le dossier, et devra être confirmée par relecture du dépôt **et** par le typecheck
avant intégration.

### (c) Héritage du parent — **écarté : le correctif serait inerte, établi par lecture**

Le mécanisme de création est établi (`session.ts:670-689`, §2 E7) : `Session.create` ne prend pas `directory` et
hérite de `ctx.directory`. La question suivante — un outil ou le modèle lit-il le répertoire depuis la **ligne de
session** ou depuis le **contexte d'instance** ? — est désormais répond par lecture, et non plus supposée :

- `prompt.ts:719` récupère le contexte d'instance et `prompt.ts:731` inscrit le chemin du message enfant
  directement depuis celui-ci : `path: { cwd: ctx.directory, root: ctx.worktree }`. `session: Session.Info` est
  bien déstructuré à `prompt.ts:715` et `prompt.ts:718`, mais n'est pas la source du `cwd`.
- `system.ts:97` procède de même et `system.ts:103` publie `Working directory: ${ctx.directory}` dans le bloc
  `<env>` présenté au modèle.

**Conséquence :** ni les outils ni le modèle ne lisent `session.directory`. Parent et enfant créés dans la même
instance partagent le même contexte d'instance, donc le même répertoire. Transmettre `directory` à la création
modifierait une colonne en base sans qu'aucun comportement observable ne change. **Le volet (c) est écarté, sur
preuve et non sur inférence.**

**Ce qui le rouvrirait :** que le modèle **veut** hériter du répertoire du parent. Le mécanisme technique existe
déjà par le contexte d'instance ; rien dans le code ne sépare un parent de son enfant. C'est une question de
produit, hors périmètre de cette proposition.

## 5. Alternatives considered

1. **Fusionner toute la preuve de l'enfant** (findings, tests, residuals) d'un seul bloc. Rejeté : un finding
   importé ne peut pas hériter du statut `CLOSED`.
2. **Restreindre l'enveloppe de retour `task.ts:236`.** Rejeté après relecture — voir §2 E3. La ligne décrit une
   forme de conteneur ; elle ne répare pas la perte, qui est en amont.
3. **Faire de `timeout_minutes` un plafond d'exécution** en l'injectant dans `task.ts:694-695`. Rejeté :
   `task.ts:78-80` le documente dans un cadre d'attente, et `task.ts:326-330` l'applique déjà à une attente en
   millisecondes. Le câbler cumulerait deux sémantiques distinctes et rendrait `action=wait` silencieux sur
   l'exécution.
4. **Rendre `task_id` obligatoire au niveau du schéma.** Rejeté : `task.ts:315` traite `input.action` comme
   optionnel, donc l'exigence ne peut pas être globale ; elle ne vaudrait que sur la branche de suivi.
5. **Corriger le coût de délégation.** Rejeté deux fois, voir §2 E6.

## 6. Risks

**Régression sur les tests existants.** Le volet (a) ne touche aucun message d'erreur ni aucune annotation, donc
`test/cli/tui/task-contract-compact.test.ts` et `test/tool/tasks-description.test.ts` ne sont pas exposés par la
fusion elle-même. Le risque est sémantique : ajouter une écriture d'état d'objectif par fin de sous-agent peut
entrer en conflit avec une rédaction concurrente. La protection existante est le verrou de `task.ts:503`, déjà
posé autour du bloc d'écriture ; la condition de `task.ts:506` et l'incrément de version de `task.ts:514` doivent
être traités dans le même lot que la fusion, sinon deux révisions concurrentes deviennent indiscernables.

**Coût en tokens / latence.** (a) ne coûte **aucun token** au repos : c'est une affectation dans un chemin déjà
exécuté à chaque sous-agent. Elle ajoute une écriture d'état d'objectif par fin de sous-agent, sérialisée par le
verrou de `task.ts:503` — latence ajoutée nulle en pratique, mémoire inchangée. La taille mémoire est bornée dès
la construction (`task-evidence.ts:62` plafonne `tests` à 32 entrées).

**Sécurité.** (a) fait entrer dans l'état d'objectif du parent des chaînes **produites par un sous-agent**, donc
non fiables par construction. Elles doivent rester **bornées** — comme le fait déjà `task-evidence.ts:40` et
`task-evidence.ts:42` — et **jamais** interprétées comme une instruction. La troncature est appliquée à la
construction ; la fusion ne doit pas la désappliquer. Un rapport de sous-agent qui porterait un texte d'instruction
resterait ainsi du texte, jamais une directive exécutée.

## 7. Tests

Créer sous `packages/opencode/test/`. Chaque test est **discriminant** : son prédicat d'échec est nommé, et il
échoue sur le code d'origine pour passer sur le code corrigé.

### T1 — la preuve de l'enfant atteint l'état d'objectif du parent (volet a) — *discriminant*

`test/tool/task-evidence-merge.test.ts`. Enfant dont `completion.evidence` contient une preuve, et **sans finding**.

| | `goalState.completion.evidence` du parent | `metadata.evidencePacket` |
|---|---|---|
| **avant correctif** | **vide** — `task.ts:511-513` ne fusionne que `findings`, et `task.ts:506` court-circuite sans finding | présent |
| **après correctif** | contient la preuve de l'enfant | présent |

Critère de succès : la première assertion **échoue** sur le code d'origine. L'absence de finding est délibérée :
elle active simultanément les deux causes de la perte identifiées en §2 E4.

### T2 — la fusion reste bornée et n'altère pas la troncature (volet a)

`test/tool/task-evidence-merge.test.ts`. Une preuve d'enfant dépassant 1 000 caractères, plus de 32 entrées.
Critère : la valeur fusionnée est tronquée aux mêmes bornes que `task-evidence.ts:40` et `task-evidence.ts:62`,
et aucun champ n'est interprété comme une instruction. Couvre le risque d'injection de §6.

### T4 — garde de non-régression du message d'erreur (volets a et b)

`test/tool/task-decode-guard.test.ts`. Un lancement sans `subagent_type`. Critère : échec portant
`Tool.InvalidArgumentsError` et le texte de `task.ts:396`. Ce comportement est **déjà** produit par
`task.ts:391-399` : ce test ne prouve aucun correctif, il garantit que la fusion de (a) ne l'altère pas. Il
devient un test de preuve seulement si (b) est retenu.

### T5 — garde de non-régression du répertoire (volet c)

`test/tool/task-child-directory.test.ts`. Un appel d'outil de l'enfant qui rapporte son répertoire. Critère : le
répertoire observé est celui du **contexte d'instance**, et non celui de la ligne de session. C'est déjà le
comportement du code, établi par `prompt.ts:719` et `prompt.ts:731` pour le chemin du message, et par
`system.ts:97` et `system.ts:103` pour le bloc `<env>` présenté au modèle. Ce test ne prouve aucun correctif : il
garantit qu'une évolution future ne détourne pas le `cwd` vers `session.directory`.

Commande : `bun test test/tool/task-evidence-merge.test.ts test/tool/task-decode-guard.test.ts test/tool/task-child-directory.test.ts`

Régression : `bun test test/cli/tui/task-contract-compact.test.ts test/tool/tasks-description.test.ts` **avant**
intégration.

## 8. Effort

**S** — un fichier de production, un lot de tests, deux suites à rejouer. (a) tient dans une affectation et deux
conditions ; (b) est écarté ; (c) est écarté sur preuve. Seul (a) entre dans ce compte.

## 9. Verdict self-assessment

**READY** pour (a), avec T1 et T2, qui discriminent.

**`NEEDS_REVIEW` sur un point précis.** (b) est écarté par ce document, sur la base de `task.ts:391-399` et du
message de `task.ts:396`. **La question que le validateur doit trancher :** un message d'erreur qui énumère
nommément les trois champs manquants, mais arrive après le décodage, est-il jugé acceptable ? Si la fréquence des
lancements mal formés est élevée, le coût d'un aller-retour peut dominer le bénéfice de la précision temporelle.
Le dossier ne contient aucune mesure de cette fréquence — c'est la donnée manquante.

**Sur (c) :** l'inférence d'inerce n'est plus une supposition. `prompt.ts:731` inscrit le chemin du message
enfant depuis `ctx.directory`, et `system.ts:103` publie ce même `ctx.directory` au modèle ; ni l'un ni l'autre ne
lit `session.directory`. (c) est donc **écarté sur preuve**. Ce qui le rouvrirait est une demande de produit — que
le modèle *voudrait* hériter du répertoire du parent — et non une lacune de code.

**Sur l'ordre de livraison :** (a) seul d'abord — monofichier, sans dépendance de schéma, avec T1-T2
discriminants. Puis T4 et T5 comme gardes de non-régression. Puis (b), seulement si le validateur le demande.

**Contentieux avec la version précédente, conservé pour le dossier :** le volet de câblage de `timeout_minutes`
et l'argument d'enveloppe ont été retirés. Le premier parce que `task.ts:78-80` et `task.ts:326-330` documentent
et appliquent déjà ce délai dans un cadre d'attente ; le second parce que `task.ts:236` ne décrit qu'une forme de
conteneur. Ils sont signalés ici pour que le validateur ne les retrouve pas ailleurs.

**Angle mort refermé :** `task.ts:236` a été relue (§2 E3). Elle prouve une chose précise et bornée — une
enveloppe de balises portant `id`, `state`, un titre et du texte, sans champ structuré. L'argument qui en dépendait
a été **retiré**, non recopié.