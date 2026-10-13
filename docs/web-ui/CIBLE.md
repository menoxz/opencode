# Cible — interface web d'opencodev2

> Document de **cible**, pas de statut (le statut vit dans `PROGRESS.md`).
> Corrige-le directement : c'est le contrat dont je repars, et rien ne se construit avant.

## 1. En une phrase

Un écran : la conversation. Tout le reste est un tiroir.

## 2. L'écran, de haut en bas — cinq zones, pas plus

| # | Zone | Contenu | Par défaut |
|---|------|---------|------------|
| 1 | Barre haute | nom du produit à gauche ; l'état de connexion = un point de couleur, sans texte | visible |
| 2 | Tiroir gauche | liste des sessions ; recherche ; un bouton « nouveau » | visible, repliable |
| 3 | Centre | le fil : messages utilisateur et agent. Rien d'autre | visible |
| 4 | Bas du centre | saisie : un champ, un bouton envoyer, un bouton joindre | visible |
| 5 | Tiroir droit | détail d'un appel d'outil, ou demande de permission | fermé |

## 3. Style

- Monochrome sombre. Couleur d'accent : **aucune**.
- Une seule police. Deux tailles : texte, et petit.
- Bordures fines translucides. Pas de cartes empilées, pas d'ombres, pas de dégradés décoratifs.
- Le vide fait partie du dessin.

## 4. Ce qui ne doit PAS apparaître

- Tout indicateur qui ne change pas une décision de l'utilisateur.
- Barre de statut permanente. Panneau « Statut ». Carte de modèle.
- Badge, compteur, pastille, icône décorative.
- Titre de section qui redit son contenu.
- Plus d'une action visible par élément.

## 5. Règle d'arbitrage

En cas de doute : **on enlève**. Un élément ne revient que si son absence a gêné quelqu'un — et on l'écrit ici, avec la raison.

## 6. Existant

Je ne rafistole pas l'écran actuel. Je repars du centre (zones 3 et 4), je le finis proprement, puis je n'ajoute 2 et 5 qu'ensuite. Les composants hors cible (barre de statut, panneau statut, carte de modèle, pastilles) sont retirés, pas laissés « au cas où ».

## 7. À corriger (toi)

- …

## 8. Inventaire de l'existant — ce qui sort de la cible

Constaté dans `packages/webui/src/app.tsx`, `components.tsx` et `styles.css` (état actuel du dépôt).

| Élément actuel | Zone | Verdict |
|---|---|---|
| `StatusBar` + `.statusbar .dot` (ok/warn/error) | aucune | retirer — barre permanente |
| `StatusPanel` + onglet « status » | 5 | retirer |
| Onglet « events » (journal brut) | 5 | retirer — debug, pas UX |
| `ModelCard` | 2 | retirer |
| `.badge` — 6 tonalités (running/completed/ok/error/warn/off) | partout | retirer |
| `.pill.warn` | 4 | retirer |
| `.sessionRow .dot.run` | 2 | retirer |
| `.tab .t-dot` | 5 | retirer |
| `FolderRow` compteur | 2 | retirer le compteur |
| `TitleBar` badge `env` : `.pulse` + libellé « SSE connecté » | 1 | point seul, sans texte |
| `TitleBar` pastilles `traffic` (3 `<i/>`), `version`, `context` | 1 | retirer — décor de fenêtre |
| `Brand` — redit « opencodev2 » + tagline « agent généraliste » | 2 | retirer — le nom est déjà en zone 1 |
| `SectionLabel` compteur (`trailing`) | 2 | retirer |
| Panneau d'authentification | aucune | garder, mais hors écran (s'ouvre à la demande) |

Après soustraction, il reste exactement : `SessionRow` (sans pastille), `ChatMessage`, `ToolCall`, `PermissionPanel`, la saisie et les pièces jointes.

---

## 9. Détail des zones (livré 2026-10-13)

Six zones traitées, chacune à partir de **données relevées sur le serveur** — jamais d'une supposition.

### 1. Le prompt de l'utilisateur

C'est le seul texte de l'écran qu'il a écrit lui-même : il se reconnaît au premier regard. Surface à lui,
dans la largeur de lecture, texte conservé tel quel — un prompt est souvent structuré, et le reformater
efface sa mise en forme. L'agent, lui, reste en texte nu : la dissymétrie dit qui a parlé.

### 2. Les injections de contexte

Le serveur joint au message une partie `synthetic` qui décrit ce qui a été injecté. **Deux formes
coexistent**, toutes deux relevées :

```
Context injections · 3 section(s)          Instruction injections · 2 source(s)
- core: system prompt (PROMPT_CORE) · …    Instructions from: …\opencodev2\AGENTS.md
- env: environment · 391 chars              Instructions from: …\packages\opencode\AGENTS.md
- instructions: instruction files · …
```

La seconde s'affichait **comme si l'utilisateur l'avait écrite** : corrigé. Les deux sont lues comme une
structure — une ligne par section, son volume, sa part du total, la troncature signalée — et repliées par
défaut. C'est la seule surface qui répond à « qu'est-ce qui consomme ma fenêtre ? ».

### 3. Les actions de l'agent

Une **icône par famille**, pas par outil : `read`/`list`/`glob` font la même chose du point de vue de qui
lit. Familles : lecture, écriture, commande, recherche, sous-agent, question, plan, tâches, compétence,
web, objectif — et une générique pour l'inconnu, jamais un carré vide. Dessinées en primitives SVG : un
glyphe Unicode dépend de la police du système, une primitive non. Une ligne, pas une carte ; le détail
s'ouvre sur place.

### 4. Le rail : sessions par dossier

Le regroupement n'est pas décoratif : sur 19 sessions, **16 sous `packages/opencode`, 3 à la racine**. Le
libellé est le chemin **relatif**, l'absolu reste en infobulle. Un dossier se replie (ouvert par défaut :
on replie pour dégager, on ne déplie pas pour découvrir).

### 5. La ligne de session : plus ou moins d'informations

Chaque ligne s'ouvre sur son détail, lu depuis les champs réels de la session : `agent`, `model`, `tokens`
(entrée / sortie / cache), `cost`, `summary` (fichiers changés). « aucun changement » plutôt que
« +0 −0 · 0 fichier », qui se lit comme un résultat.

### 6. La configuration

Une **feuille posée sur la conversation**, ouverte à la demande depuis le rail, refermée par Échap, le
bouton ou le voile. Trois sections : général (modèle, petit modèle, utilisateur), agents (34 sur ce
serveur, les `hidden` écartés), serveurs MCP — dont seuls les **non-connectés** sont nommés.

Deux décisions :

- **Elle consulte, elle n'édite pas.** Aucun point d'écriture n'a été relevé côté serveur : un
  interrupteur inerte serait un mensonge.
- **Pas de catalogue.** `GET /provider` rend **6,7 Mo** (228 fournisseurs, 8 775 modèles) pour deux
  nombres qui ne changent aucune décision. Mesuré : c'est lui qui gelait l'ouverture. Section et appel
  retirés.

### Ce que ça change dans la cible

Le §2 disait cinq zones. Il y en a **quatre permanentes plus un bandeau conditionnel**, et la
configuration s'ajoute en feuille — pas en sixième zone. Un panneau qui ne sert pas tous les jours n'a
pas à occuper l'écran tous les jours.

---

## 10. Le rail, en trois parties (2026-10-13)

Le rail n'avait qu'une responsabilité de fait : lister des sessions. Il en porte maintenant trois, et
chacune répond à une question différente.

| # | Partie | Question à laquelle elle répond | Contenu | Défilement |
|---|--------|--------------------------------|---------|-----------|
| A | Menus | « Que peut faire le harnais, hors session ? » | menus par provenance ; plugins ; réglages ; identifiants | non — figée en haut |
| B | Workspaces | « Où ai-je travaillé, et sur quoi ? » | dossiers ajoutés, repliables, contenant leurs sessions | **oui — la seule qui défile** |
| C | Pied | « Où est-ce que je travaille ? » | le dossier de travail | non — figée en bas |

### A. Menus — ce qui n'est pas une session

Mesuré : `GET /command` rend **210 entrées**, chacune avec sa provenance ; `GET /plugin` rend un
**objet** `{ version, runtime, origins, hooks }` et **4 origines**. Trois provenances réelles se
séparent : `command` (les tiennes), `mcp` (apportées par un serveur), `skill` (apportées par une
compétence).

- **210 entrées ne se déplient pas.** La partie est repliée par défaut. C'est un menu, pas un contenu.
- **La provenance est l'information utile**, pas le nombre. Confondre les trois sources effacerait la
  seule chose qui aide à retrouver une entrée.
- **Une entrée n'existe que si elle agit.** Une commande s'exécute sur la session active
  (`POST /session/{id}/command`) ; sans session active, elle est inerte et le dit.
- **719 ko compressés, donc pas au montage.** Mesuré : `GET /command` pèse 736 669 octets gzip
  (1,99 Mo décodé) — 210 entrées dont la plupart portent un gabarit inutile à un menu. Chargé au
  **premier dépliage**, jamais à l'ouverture de l'écran : c'est la règle de `/provider` (6,7 Mo) à
  une autre échelle. Conséquence assumée : avant le premier clic, la section n'affiche pas de compte
  — un nombre qu'on ne connaît pas ne s'invente pas.
- **Le proxy doit lister la route.** Défaut réel : `/command` absent de `API_PREFIXES`
  (`vite.config.ts`) faisait servir `index.html` avec un **status 200** ; le SDK croyait recevoir du
  JSON, échouait à le parser, et la section restait vide **sans erreur visible**.

### B. Workspaces — dossiers et sessions

Un **workspace** est un dossier ajouté. Il contient ses sessions, repliées ou dépliées à souhait.

- **Icônes** : un dossier et une session se distinguent par une **primitive SVG**, pas par un glyphe
  (`▾`, `▸`) dont le rendu dépend de la police du système.
- **Indentation** : une session se lit *sous* son dossier, pas au même niveau — la hiérarchie se voit.
- **Interlignage serré** : une liste de navigation se parcourt, elle ne se lit pas ; l'air se gagne
  dans les titres, pas entre les lignes.
- **Survol qui ne déplace rien.** Le défaut réel : `display: none → flex` sur les actions faisait
  changer la grille, donc la colonne du titre rétrécissait et **toute la ligne bougeait**. Les actions
  occupent désormais leur place en permanence et se révèlent par l'opacité ; le padding ne change pas
  au survol.

### C. Pied — le dossier de travail

Il **définit** ce que la partie B affiche. C'est le seul endroit où l'on écrit un chemin.

### Ce qui ne revient pas

Un compteur sur chaque dossier (le compte se lit dans le pli), une icône décorative, un titre de
section qui redit son contenu, une action visible au repos.
