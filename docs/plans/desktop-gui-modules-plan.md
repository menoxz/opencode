# Plan directeur — Refonte GUI Desktop par modules isolés (sous-agents)

> Document de référence pour le développement parallèle du GUI desktop (`packages/app` + `packages/desktop`) par sous-agents, chacun responsable d'un module isolé, intégrés ensemble à la fin.

## 1. Principe d'architecture : composants injectables

Chaque module est développé comme un **composant isolé, dans son propre fichier**, exporté puis importé/composé dans le fichier parent — exactement le pattern déjà en place dans le codebase (ex: `goal-tab.tsx`, `todo-tab.tsx`, `mcp-tab.tsx`, `thinking-mode-selector.tsx` importés dans `session-side-panel.tsx` / `prompt-input.tsx`).

Deux niveaux de composition, à utiliser selon le besoin :

- **Import direct** (par défaut) : `export function MonModule() {...}` dans un fichier dédié, importé où nécessaire. Suffisant pour la majorité des widgets UI.
- **Injection via Context** (façon service Angular) : pour un état/service partagé par plusieurs modules sans connaître son origine (ex: `useSync()`, `useCommand()`, `local.agent`). À utiliser quand un module a besoin d'un état global (session courante, SDK client, config) sans prop-drilling.

**Règle pour les sous-agents** : chaque module doit être livrable comme un ou plusieurs fichiers isolés, avec une interface d'export claire (props typées), sans modifier le fichier d'intégration parent au-delà d'un import + insertion — la logique d'intégration finale est faite séparément, après réception de tous les modules.

## 2. Référence visuelle : structure TUI

La sidebar TUI de référence (image fournie) présente cette structure verticale, à reproduire fidèlement dans le widget de détail de session (Module 1) :

```
Analyse rapidité et efficacité token   ← titre de la session (goal)

Context
488 849 tokens
49% used
55 tok/s
$75.43 spent

▶ TASK CONTRACT                        ← section repliable
▶ MCP (8 active)                       ← section repliable, compteur actifs
LSP
  • pyright  intellectLLM\orchestrator ← liste des serveurs LSP actifs
▶ Todo                                 ← section repliable

...

/C:\jeanluc                            ← chemin projet courant
• OpenCode 1.18.87                     ← version
```

Caractéristiques clés à reproduire :
- Sections **repliables** (chevron ▶/▼) : TASK CONTRACT, MCP, Todo
- Section **non repliable** mais listée : LSP (liste directe des serveurs actifs)
- Bloc **Context** toujours visible en haut : tokens, % utilisé, tok/s, coût
- Pied de panneau fixe : chemin du projet + version opencode

## 3. Les modules

### Module 1 — Widget détail de session (sidebar façon TUI)
- Reproduire exactement la structure ci-dessus : Context (tokens/%/tok-s/coût), TASK CONTRACT repliable, MCP repliable (avec compteur actifs/erreurs), LSP (liste des serveurs), Todo repliable.
- **Le Goal (TASK CONTRACT) doit être directement éditable depuis ce widget** — pas seulement affiché en lecture seule. Édition inline ou via un petit formulaire intégré (objectif, DoD, hors périmètre), qui appelle `edit_objectif`/les tools contract côté serveur.
- S'appuie sur l'existant : `goal-tab.tsx`, `mcp-tab.tsx`, `lsp-tab.tsx`, `todo-tab.tsx`, `session-context-usage.tsx` (déjà présents dans `packages/app/src/components/session/`) — à fusionner/adapter en un seul widget vertical plutôt que des onglets séparés.

### Module 2 — Paramétrage global
- Menu accessible **depuis une session active** (pas seulement au démarrage).
- Doit couvrir la configuration de tout ce que le TUI expose via commandes slash **non liées à la session courante**, notamment :
  - Skills
  - Serveurs MCP (activation/désactivation, configuration)
  - Providers (clés API, modèles disponibles)
  - Agents (personnalisation complète : prompt, modèle par défaut, permissions, outils autorisés)
  - Instructions globales / projet (AGENTS.md équivalent)
  - Plugins
  - Tout autre réglage global découvert en explorant les commandes slash du TUI (`/mcp`, `/agent`, `/plugin`, `/instructions`, etc. — à auditer en début de module)
- Le sous-agent doit lister exhaustivement les commandes slash TUI concernées avant de commencer, pour ne rien oublier.

### Module 3 — Widget preview fichier (amélioré, éditable)
- Reprendre le `file-preview.tsx` existant (actuellement lecture seule — le SDK v2 n'exposait pas d'endpoint d'écriture lors du dernier audit, **à revérifier**).
- Ajouter la possibilité d'**éditer le contenu du fichier** et de sauvegarder.
- Si l'endpoint d'écriture manque toujours côté SDK/serveur, le documenter clairement comme blocage et proposer l'alternative (ex: passer par un tool `edit`/`write` déjà exposé côté agent).

### Module 4 — Sidebar droite à icônes (navigation widgets)
- Liste d'icônes verticale (façon VS Code activity bar) permettant de basculer entre :
  - Le widget de détail de session (Module 1)
  - L'arbre du dossier courant (dossiers, sous-dossiers, fichiers)
- Doit rester compact, avec tooltips, et garder l'état de sélection au changement d'onglet/session.

### Module 5 — Widget de gestion de terminal
- Accessible via une icône dans le header.
- Terminal **réellement interactif** (pas un simple flux de sortie) : saisie clavier, gestion des signaux, redimensionnement — équivalent à un vrai terminal intégré (type xterm.js + PTY côté `packages/desktop/src/main`).
- Gestion **multi-terminaux** : ouverture, fermeture, navigation entre plusieurs sessions terminal (onglets ou liste).

### Module 6 — Features supplémentaires (au choix, argumentées)
- Libre, mais chaque proposition doit être justifiée :
  - **Pertinence** : quel problème utilisateur ça résout, pourquoi ce n'est pas déjà couvert par les modules 1-5 et 7.
  - **Intégration** : où ça s'insère dans l'interface sans la surcharger (sidebar ? palette de commandes ? statusbar ?).
- Le sous-agent propose et argumente avant d'implémenter — validation attendue avant développement complet.

### Module 7 — Chat (widget principal)
- Affichage des **outils appelés**, des **questions** (tool `question`), des **demandes de permission** — statut clair (en cours / accepté / refusé), résultat visible.
- Zone de saisie utilisateur (prompt) : **strictement sans emoji**, uniquement des **icônes professionnelles** (set d'icônes existant du design system, pas de pictos décoratifs).
- **Bloc "thinking"** : streaming en direct du contenu de réflexion du modèle, et **repliable** — comportement identique au TUI (`context/thinking.ts`, `ReasoningPart`), y compris le fait qu'il soit replié par défaut et extensible au clic.

## 4. Workflow d'exécution

1. **Phase modules isolés** : chaque sous-agent travaille sur son module dans des fichiers dédiés (nouveaux ou clairement délimités), sans toucher au routing/layout parent final.
2. **Phase intégration** : une fois tous les modules livrés, une passe d'intégration assemble les modules dans le layout final desktop (chat + preview fichier + sidebar simultanés, cf. objectif de layout déjà en cours).
3. **Validation** : chaque module doit être testable indépendamment (au minimum : rendu sans erreur, actions principales fonctionnelles) avant intégration — pas de "ça marchera à l'intégration".

## 5. Points de vigilance transverses (déjà identifiés cette session)

- Le pattern `activeTab`/`setActive` dans `packages/app/src/pages/session/helpers.ts` doit être étendu (pas dupliqué) si de nouveaux types d'onglets sont ajoutés — voir le bug déjà corrigé sur les tabs statiques (goal/todo/mcp/lsp/search/git).
- Le contrôle de sélection d'agent (`prompt-agent-control`) a un bug d'affichage non résolu dans la zone "DockTray top" de `prompt-input.tsx` — à garder en tête pour le Module 2 (personnalisation agent) et le Module 7 (chat), qui en dépendent potentiellement.
- Latence anormale du GUI desktop vs TUI (37s pour "hi") non encore diagnostiquée — à surveiller pendant le développement des modules, notamment Module 7 (chat).

## 6. Module 6 — Propositions

Méthodologie : chaque proposition ci-dessous s'appuie sur une preuve concrète trouvée dans le code (stub explicite, endpoint serveur manquant, donnée calculée mais jamais consommée par l'UI, point d'extension déclaré mais inutilisé) — pas une idée générique hors-sol. Vérification croisée effectuée avec les Modules 1 à 5 et 7 (section 3) pour exclure tout doublon.

### 6.1 Centre de notifications (historique) — effort faible

- **Pertinence** : `context/notification.tsx` maintient un historique indexé complet (turn-complete + erreurs, par session ET par projet, jusqu'à 500 entrées / 30 jours) mais seuls `unseenCount()`, `unseenHasError()` et `markViewed()` sont consommés dans toute l'UI (`sidebar-items.tsx`, `sidebar-project.tsx`, `layout.tsx`, `home.tsx`) — l'accesseur `.all()` qui retourne l'historique complet n'a **aucun consommateur** (recherche exhaustive : 0 résultat). Dès qu'une pastille est vue une fois (simple ouverture de session), la notification est perdue pour l'utilisateur alors que la donnée existe toujours en mémoire. Avec le système d'onglets multi-session du titlebar (`titlebar.tsx`, `tabsStore`), un utilisateur qui jongle entre plusieurs sessions/projets n'a aucun moyen de répondre à « qu'est-ce qui s'est terminé/a échoué pendant que j'étais sur un autre onglet ? ». Non couvert par le Module 1 (scope Context/TASK CONTRACT/MCP/LSP/Todo d'**une** session), ni le Module 7 (chat d'une session active).
- **Intégration** : icône cloche/historique montée dans le point d'ancrage **`#opencode-titlebar-left`** (`titlebar.tsx` ligne 609) — le seul des 3 emplacements de portail du titlebar (`opencode-titlebar-left/center/right`) qui n'a aujourd'hui **aucun consommateur** (`center` et `right` sont déjà remplis par `session-header.tsx`). Ouvre un popover (réutiliser le pattern déjà en place dans `status-popover.tsx`) listant les notifications récentes tous projets confondus, groupées par projet/session, chaque entrée redirigeant vers `/${directory}/session/${sessionID}` (même construction d'URL que `platform.notify()`).
- **Effort/risque** : **Faible**. Zéro travail serveur/SDK — 100% réutilisation de l'état client déjà calculé et indexé. Seul effort réel : un composant popover + rendu de liste (calqué sur `status-popover.tsx`). Risque faible (additif, lecture seule, ne modifie aucune forme de données existante).

### 6.2 Panneau « Problems » (diagnostics LSP) — effort faible à moyen

- **Pertinence** : `lsp.diagnostics()` (`packages/opencode/src/lsp/lsp.ts`) calcule déjà, pour chaque fichier, la liste complète des erreurs/avertissements LSP — donnée consommée aujourd'hui uniquement par les tools `write`/`edit`/`apply_patch` (`packages/opencode/src/tool/*.ts`) pour annoter **leur propre** résultat, et affichée ponctuellement dans le TUI (composant `Diagnostics`, `cli/cmd/tui/...`) mais **jamais comme vue globale**. Côté desktop, `session/lsp-tab.tsx` n'affiche que l'état de connexion des serveurs (pastille verte/rouge + id + racine) — aucune erreur/avertissement n'est visible tant que l'agent n'a pas lui-même édité le fichier concerné. Impossible aujourd'hui de savoir « qu'est-ce qui est cassé dans ce projet en ce moment » sans passer par une action de l'agent. Le Module 1 scope explicitement le bloc LSP comme « liste des serveurs actifs » (section 2 du plan) — les diagnostics sont une capacité additive, distincte.
- **Intégration** : deux insertions possibles, non exclusives : (a) badge compact dans `status-bar.tsx` à côté du `LSP: {lspCount()}` déjà existant (ex. « ⚠ 5 »), (b) extension de la section LSP repliable du widget Module 1 avec une liste groupée par fichier (même pattern visuel que `search-files.tsx` : liste + clic pour sauter à la ligne via `onOpenResult`).
- **Effort/risque** : **Faible à moyen**. La fonction serveur existe déjà et est bon marché à appeler ; il faut soit une nouvelle route HTTP légère (ex. `GET /lsp/diagnostics`), soit l'ajouter au flux de sync existant (`global-sync/types.ts` → nouveau champ `diagnostics` dans `State`, à côté du champ `lsp` actuel). Risque faible : lecture seule, aucune mutation, aucun nouveau processus externe (les clients LSP tournent déjà).

### 6.3 Git — brancher les opérations réelles (Stage/Commit/Push/Pull) — effort moyen à élevé

- **Pertinence** : `git-panel.tsx` est un onglet sidebar complet et déjà branché en lecture (`sdk.client.vcs.status()` fonctionne, la liste des changements groupés M/A/D/? s'affiche correctement) — mais les 5 handlers d'action (`handleStageAll`, `handleUnstageAll`, `handleCommit`, `handlePush`, `handlePull`) sont **tous** des stubs `console.log("... - not yet implemented")` (lignes 76-100). Les boutons sont cliquables, non désactivés, avec un vrai formulaire de message de commit — l'utilisateur croit agir sur son dépôt alors que rien ne se passe. C'est pire qu'une fonctionnalité absente. Vérification côté serveur : `packages/opencode/src/project/vcs.ts` (`Interface`) n'expose que `init/branch/defaultBranch/status/diff/diffRaw/apply` (`apply` = appliquer un patch pour les snapshots/undo, pas un commit) ; les routes HTTP réelles sont `vcs`, `vcs/status`, `vcs/diff`, `vcs/diff/raw`, `vcs/apply` — aucune primitive `stage/commit/push/pull` n'existe nulle part dans `packages/opencode/src/git/index.ts` non plus. Non couvert par un autre module (aucun des modules 1-5/7 ne mentionne Git).
- **Intégration** : aucune nouvelle surface UI nécessaire — `git-panel.tsx` existe déjà dans la sidebar ; il s'agit uniquement de brancher les 5 handlers existants sur de vraies opérations.
- **Effort/risque** : **Moyen à élevé**. Nécessite : nouvelles primitives dans le module Git bas niveau (add/commit/push/pull via subprocess, sur le même modèle Effect que `status`/`diff`), nouvelles méthodes `Vcs.Interface`, nouvelles routes HTTP + schémas (`groups/instance.ts`, `handlers/instance.ts`, `public.ts`), puis régénération du SDK JS (`packages/sdk/js/script/build.ts`, obligatoire par convention repo). Risque notable sur `push` spécifiquement : gestion des identifiants/agent SSH/token HTTPS depuis un sous-processus lancé par Electron, et remontée claire des erreurs (conflit, auth refusée) plutôt qu'un échec silencieux comme aujourd'hui.

### 6.4 Présence en arrière-plan / icône système (desktop uniquement) — effort moyen

- **Pertinence** : `packages/desktop/src/main/ipc.ts` expose déjà une intégration native riche (34+ canaux IPC : lecture presse-papiers image, ouverture de chemin, cycle de mise à jour, contrôle de focus fenêtre...) mais **aucune** API `Tray` n'est utilisée nulle part dans `packages/desktop/src/main` (recherche exhaustive dans `windows.ts` : 0 résultat pour Tray/tray/minimize). Or l'app dispose déjà d'un pipeline de notification complet (`context/notification.tsx` : compteurs non-vus par session/projet, sons configurables, notification OS via `platform.notify()`) qui perd toute utilité si la fenêtre est fermée/minimisée puisque le processus entier disparaît avec elle. Aucun des modules 1-5/7 ne touche au cycle de vie fenêtre/process — c'est un gap orthogonal, propre aux apps desktop.
- **Intégration** : surface entièrement nouvelle et isolée — icône dans la zone système (Electron `Tray` + `Menu` : Afficher/Nouvelle session/Quitter), badge reprenant le compteur de non-vus déjà calculé par `useNotification`. Un seul point de contact avec l'UI existante : un toggle « Réduire dans la zone système à la fermeture » ajouté à `settings-general.tsx` (page déjà existante, dans le giron du Module 2 pour ce seul toggle — la mécanique tray elle-même est un code process-main entièrement nouveau, pas un widget qui vient encombrer l'interface).
- **Effort/risque** : **Moyen**. Nouveau code process-main (`Tray`, `Menu`, assets d'icône avec badge), 2-3 nouveaux canaux IPC (`tray-set-badge`, `tray-enabled` get/set) sur le même pattern que l'existant (`ipcMain.handle`). Risque contenu (opt-in, guard `platform.platform === "desktop"` déjà utilisé partout dans `titlebar.tsx`) mais point d'attention réel : bien définir la sémantique « fermer = réduire » vs « fermer = quitter » pour ne pas surprendre l'utilisateur habitué à ce que la croix rouge quitte l'application (interception de l'évènement `close` dans `windows.ts`/`menu.ts`).

### 6.5 Recherche & remplacement multi-fichiers — effort moyen (dépendant du Module 3)

- **Pertinence** : `search-files.tsx` est déjà une recherche plein-texte fonctionnelle (regex, case-sensitive, whole-word, via `sdk.client.find.text`) groupée par fichier avec saut direct à la ligne — mais 100% lecture seule : aucune action de remplacement, pour un seul match ou en masse. Un développeur qui veut renommer une occurrence littérale à travers le projet doit sortir du GUI et le demander à l'agent, même pour un remplacement trivial. Aucun des modules 1-5/7 ne couvre cette action (le Module 3 traite l'édition d'**un seul fichier ouvert en preview**, pas une opération batch multi-fichiers).
- **Intégration** : extension du même onglet Search existant — un champ « Remplacer par » + actions « Remplacer » (par occurrence) / « Tout remplacer » sous la barre de recherche actuelle. Aucune nouvelle surface de navigation.
- **Effort/risque** : **Moyen, mais séquencé après le Module 3**. Cette fonctionnalité dépend exactement du même blocage déjà documenté par le Module 3 : « le SDK v2 n'exposait pas d'endpoint d'écriture lors du dernier audit » (reconfirmé ici : `file-preview.tsx` lignes 40-43 le documente explicitement). Tant que ce point n'est pas résolu par le Module 3, le remplacement multi-fichiers ne peut être qu'un wrapper autour du même contournement déjà identifié (passer par les tools `edit`/`write` de l'agent) — à ne démarrer qu'une fois le Module 3 livré, ou à livrer strictement sur le même endpoint d'écriture pour éviter deux implémentations divergentes.

### Tableau récapitulatif

| # | Proposition | Effort/risque | Dépendance technique bloquante |
|---|---|---|---|
| 6.1 | Centre de notifications (historique) | Faible | Aucune — 100% réutilisation client |
| 6.2 | Panneau Problems (diagnostics LSP) | Faible à moyen | Nouvelle route/sync pour exposer `lsp.diagnostics()` |
| 6.3 | Git — opérations réelles | Moyen à élevé | Nouvelles primitives Git + routes serveur + régénération SDK |
| 6.4 | Présence en arrière-plan (tray) | Moyen | Nouveau code Electron main (`Tray`/`Menu`) + IPC |
| 6.5 | Recherche & remplacement multi-fichiers | Moyen (séquencé) | Bloqué par le même endpoint d'écriture manquant que le Module 3 |

*Ces propositions sont soumises pour validation avant tout développement, conformément à la règle du Module 6 (section 3) : le sous-agent propose et argumente avant d'implémenter.*
