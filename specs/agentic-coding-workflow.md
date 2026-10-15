# Spec — Workflow de codage agentic (orchestration + délégation)

Entrée : le **besoin de l'utilisateur**, formulé en une phrase incomplète.
Sortie : la **solution livrée dans l'arbre de travail**, vérifiée par une preuve exécutable et
versionnée, plus un rapport court.

Le workflow n'invente aucune règle : il fixe l'**ordre d'exécution** et le **partage du travail**
des règles déjà en vigueur dans `~/.config/opencodev2/AGENTS.md` (global) et `AGENTS.md` (workspace).

## 1. Artefacts

| Fichier | Rôle |
|---|---|
| `.opencode/agent/coding-orchestrator.md` | le pipeline P0 → P9, la table de sélection des workers, le contrat de résultat |
| `.opencode/command/deliver.md` | point d'entrée (`/deliver <besoin>`) : route le besoin vers l'agent |
| `specs/agentic-coding-workflow.md` | ce document : phases, seuils, preuves, anti-patterns |

Découverte : les agents d'un projet sont lus dans `.opencode/agent/*.md` (id = nom de fichier,
`mode: primary` pour être sélectionnable). Les commandes sont lues dans `.opencode/command/*.md` et
acceptent en frontmatter `description`, `agent`, `model`, `subtask` (`packages/opencode/src/config/command.ts`).
Aucun rebuild n'est nécessaire : ces fichiers sont de la configuration, pas du code embarqué.

## 2. Phases

| Phase | Fait | Preuve de sortie |
|---|---|---|
| P0 Pré-vol | 4 réponses : résultat attendu, où, preuve, réversible | une ligne par réponse ; gate `ask` si non réversible |
| P1 Cible | cible écrite en un écran, surtout par soustraction | cible relue par l'utilisateur, une fois, après livraison |
| P2 Cartographie | `glob`/`grep`/`inspect_batch`/`read` bornés | liste des fichiers et des sites d'appel |
| P3 Plan/DAG | `todowrite` + tâches `{id, agent, fichiers, depends_on, timeout}` | plan écrit avant tout fan-out > 2 |
| P4 Fan-out | délégation `task`, contrats de micro-tâche | JSON de résultat par enfant |
| P5 Intégration | le parent assemble, ne ré-audite pas | diff cohérent, périmètre élagué |
| P6 Vérification | commande + exit code / test / mesure | sortie d'outil citée, jamais une affirmation |
| P7 Versionnement | commit ciblé, message relu | `git log -1 --format=%s` affiché |
| P8 Mémoire | `memory_store` / `AGENTS.md` / skill / `tasks` | une ligne écrite au bon endroit |
| P9 Livraison | rapport court, décision posée une fois | résultat, preuve, reste |

## 3. Seuils (quand déléguer, quand s'abstenir)

- **Déléguer** : exploration > 3 appels d'outils, ou > 2 fichiers, ou travail indépendant et parallélisable.
- **Ne pas déléguer** : tâche triviale, ou travail étroitement séquentiel (le sous-agent coûte plus
  qu'il ne rend : contexte à reconstruire, résultat à re-vérifier).
- **Fan-out > 2** : le plan est écrit d'abord. Aucun fichier possédé par deux tâches (sinon
  séquencement), aucune dépendance qui ne soit réelle, aucun cycle.
- **Mission large et réellement parallèle (≥ 3 lots)** : l'agent `swarm` (outils `swarm_*`, mode
  natif gardé par `OPENCODE_EXPERIMENTAL_SWARM`) est le chemin lourd ; sinon le même découpage se
  reproduit avec l'outil `task`. Ne pas monter un swarm pour un besoin qui tient en un lot.

## 4. Micro-tâche (prompt envoyé à un worker)

Contexte frais ⇒ le prompt contient tout :

```
But        : <une phrase, artefact attendu>
Périmètre  : <chemins absolus, fichiers possédés — et interdiction d'en toucher d'autres>
Instructions: <méthode imposée, pièges connus de ce dépôt>
Sortie     : <forme ET taille : JSON, tableau, 5 lignes max, chemin du fichier écrit>
Preuve     : <ce qui prouve le résultat : commande, exit code, mesure>
Interdit   : élargir le périmètre, appeler `task`, modifier un fichier non listé
```

## 5. Contrat de résultat d'un worker

JSON du skill `subagent-contract` (`agent`, `task`, `status`, `deliverables`, `metrics`, `errors`,
`warnings`), chemins absolus, < 50 Ko. Si les outils de bus sont exposés :
`bus_send_as(msg_type="subagent_result")`. **Sinon** — profil sans bus — le dernier message du
worker **est** ce JSON : un contrat qui dépend d'un outil non exposé ne se déclenche jamais, donc
le repli est écrit dans l'agent, il n'est pas supposé.

Enfant en échec ou silencieux : une relance à périmètre réduit, puis on intègre ce qui marche.
Un enfant en échec n'est pas une mission en échec.

## 6. Anti-patterns (chacun a coûté une mesure réelle)

| Anti-pattern | Règle |
|---|---|
| Traiter un « inspiré de X » comme une cible | X est une référence ; écrire la cible, sinon le vide se remplit des idées de l'agent |
| Ordonner une interface par disponibilité technique | ordonner par fréquence d'usage ; le rare se replie, l'inutile disparaît |
| Conclure à une absence depuis un relevé partiel | énumérer la surface entière avant de conclure |
| Décider d'un contrôle d'après un chiffre lu dans une capture | la référence donne la forme, jamais les données : mesurer le jeu réel |
| Conclure « ça n'existe pas » sans grep des sites d'appel | un composant peut exister et n'être monté nulle part |
| Mesurer dans le même lot que les éditions contrôlées | mesurer **après**, sinon on lit un fichier à moitié écrit |
| Lire la réponse du commit avant celle de l'edit | un `edit` « file not found » ne fait rien ; le commit ciblé ne commite rien — sans erreur |
| `oldString` vide, ou ancré à deux extrémités éloignées | ancrer sur un bloc court et contigu, puis vérifier par nombre de lignes **et** grep |
| Prendre un `200` pour un succès | vérifier le corps et le `content-type` |
| `Get-ChildItem -Recurse` depuis la racine | `glob` (indexé) ou chemin explicite ; l'expiration d'un shell tue ses enfants |
| Croire un enfant sur parole | vérifier toute affirmation critique (fichier existe, test passe) |
| Finir sur du travail fini non commité | commit dans le lot, message relu |

## 7. Limites assumées

- Le workflow n'exécute rien par lui-même : il est porté par le prompt de l'agent. Sa garantie est
  procédurale (phases, seuils, contrats), pas un moteur.
- Un profil qui n'expose pas `task` ne peut pas déléguer : le pipeline retombe alors sur P0 → P3 →
  P6 → P7 → P9 en séquentiel, et le dit.
- La vérification dépend du dépôt : sans point de mesure exécutable, la limite est écrite, jamais maquillée.
