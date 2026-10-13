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
