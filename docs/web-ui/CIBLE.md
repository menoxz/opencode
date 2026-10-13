# Cible — interface web d'opencodev2

> Une **cible**, pas un statut : ce que l'écran doit être. Les comptes rendus de lot, avec leurs
> mesures et leurs dates, sont dans `PROGRESS.md`. Corrige ce fichier directement — il se juge contre
> le réel, jamais contre l'historique.

## 1. En une phrase

Un écran : la conversation. Tout le reste est un tiroir.

## 2. L'écran

Quatre zones permanentes, **un** tiroir conditionnel, et rien d'autre à l'écran.

| # | Zone | Contenu | Par défaut |
|---|------|---------|------------|
| 1 | Rail gauche | nom du produit, « New session », plugins, workspaces | visible, repliable |
| 2 | Centre — le fil | le message de l'utilisateur, la réponse de l'agent, les actions | visible |
| 3 | Bas du centre | la saisie et les pièces jointes | visible |
| 4 | Pied du rail | le dossier de travail, les identifiants, l'accès aux réglages | visible |

Ni barre haute, ni bandeau d'état, ni barre de statut : l'état de la connexion est un point, sans
texte. **Une feuille n'est pas une zone** — les réglages s'ouvrent par-dessus la conversation et se
referment par Échap, le bouton ou le voile.

**Le tiroir droit n'existe que sur une permission en attente.** Il n'y a pas de panneau de détail
d'action permanent à ouvrir : le détail d'une action s'ouvre **sur place**, dans le fil.

### Ce qui se lit dans le fil

- Le message de **l'utilisateur** est rendu dans sa surface, texte conservé tel quel : un prompt est
  souvent structuré, et le reformater efface sa mise en forme. **L'agent reste en texte nu** — la
  dissymétrie dit qui a parlé. C'est le seul texte de l'écran écrit par l'utilisateur lui-même.
- Les **injections de contexte** sont repliées par défaut et lues comme une structure : une ligne par
  source, son volume, sa part du total, la troncature signalée. C'est la seule surface qui répond à
  « qu'est-ce qui consomme ma fenêtre ? ».
- Une **action de l'agent** est une ligne, jamais une carte. Une **icône par famille** — lecture,
  écriture, commande, recherche, sous-agent, question, plan, tâches, compétence, web, objectif — pas
  par outil : `read`, `list` et `glob` font la même chose pour qui les lit. Dessinées en **primitives
  SVG** : un glyphe Unicode dépend de la police du système, une primitive non. L'inconnu a une icône
  générique, jamais un carré vide.
- Le détail d'une session s'ouvre sur sa ligne, lu dans ses champs réels : agent, modèle, jetons,
  coût, fichiers changés. **« aucun changement »** plutôt que « +0 −0 · 0 fichier », qui se lit comme
  un résultat.

## 3. Le rail

**L'ordre suit la fréquence d'usage, pas la disponibilité technique.** C'est la règle qui gouverne
ce document : une donnée exposée par le serveur n'est pas une raison de l'afficher.

| ordre | partie | question | contenu |
|---|---|---|---|
| 1 | Nouvelle session | « je veux parler » | un bouton, premier élément, sans clic |
| 2 | Plugins | « quel accès ajouté ? » | un bouton par plugin — **vide s'il n'y en a aucun** |
| 3 | Workspaces | « où ai-je travaillé ? » | dossiers repliables, **4 sessions visibles** |
| 4 | Pied | « où est-ce que je travaille ? » | dossier, identifiants, réglages |

- **Le libellé est l'information.** Les actions d'une ligne (renommer, supprimer) apparaissent **au
  survol, en superposition sur le libellé** — elles ne consomment aucune place au repos. L'infobulle
  porte le nom complet et l'activité.
- **Une session se lit *sous* son dossier**, par une indentation franche. Le libellé est le chemin
  **relatif** ; l'absolu reste en infobulle.
- **Un dossier se replie**, ouvert par défaut : on replie pour dégager, on ne déplie pas pour
  découvrir. Au-delà de **4 sessions**, « show more » ; « show less » pour replier.
- **Le survol ne déplace rien.** Une action qui apparaît en modifiant la grille fait bouger toute la
  ligne : elle occupe sa place en permanence et se révèle par l'opacité.
- Un plugin est **un bouton d'accès, pas un catalogue**. Une compétence ne se consulte pas, elle
  s'injecte : la rendre navigable serait une erreur de nature, pas de présentation.

## 4. Les réglages — une feuille qui gère

Un panneau de réglages sert à **configurer**, pas à consulter. Un interrupteur inerte est un
mensonge : si la feuille est ouverte, elle écrit.

**La copie d'écran est en anglais** (`General`, `Ask first`, `Save`, `MCP servers`) ; la prose de ce
document, comme les commentaires du code, reste en français. Une valeur technique n'est pas un mot
d'écran : une énumération affiche « Ask first », jamais `manual` ; un interrupteur affiche « on »,
jamais `true`.

- **Chaque section porte une icône, à droite de rien — à gauche de son libellé.** Dans une colonne de
  sept entrées, l'œil cherche une forme avant de lire un mot ; sans elle il faut relire la colonne
  entière pour retrouver `Providers`. La forme dit la **nature** de ce qu'on règle, jamais l'objet.
- **La feuille a une taille de fenêtre, pas de contenu.** Largeur `min(1120px, 100vw - 64px)`,
  hauteur `min(86vh, 880px)`, `max-height: none`. Un `max-height` seul laisse la feuille prendre la
  hauteur de la section affichée : « Models » tient en trois lignes, « Providers » en porte 228, et
  changer de section redimensionnerait la fenêtre sous le curseur. C'est la règle de la navigation
  verticale, appliquée à l'autre axe.
- **Navigation verticale** : une colonne de sections à gauche, le contenu à droite. C'est la
  convention (Réglages Système, VS Code, GitHub, Linear, Notion, Slack). La barre horizontale est
  réservée aux onglets, quand ils sont peu et qu'ils ne grandissent pas. **Ce qui peut croître se
  dessine pour croître** : une disposition qui tient à cinq sections et casse à douze n'est pas
  finie.
- **Une section est un moment, pas un objet.** `General` a absorbé `Models` : `model`, `small_model`
  et `default_agent` ne règlent pas « les modèles », ils règlent **ce qu'une nouvelle session prend
  par défaut**. Une section nommée d'après la chose range le réglage à côté de la question qu'il
  répond.
- **Une page longue se lit en blocs nommés**, dans l'ordre de **fréquence d'usage** : `Defaults`
  (ce qu'on change le plus souvent), `Identity`, `Environment`. Un titre est du chrome : 12 px,
  capitales, moins contrasté que le contenu — jamais plus grand que lui.
- **Une section ne charge ses données qu'à sa sélection.** `/provider` rend 6,7 Mo et n'est jamais
  appelé ; `/provider/auth` suffit. **Aucun catalogue** : le poids d'un écran ne se paie pas pour un
  nombre qui ne change aucune décision.
- **Grammaire d'une ligne** : le libellé à gauche, son contrôle à droite, sa description dessous.
  L'utilisateur balaie une colonne de libellés, pas un tas de champs.
- **Ce qui se replie se replie.** Huit fournisseurs ouverts d'un coup, c'est huit formulaires
  concurrents ; un seul ouvert à la fois, c'est une décision à la fois.
- **Ce qui est sain ne s'annonce pas.** Six serveurs MCP connectés sur sept ne produisent qu'une
  ligne : seuls les défauts sont nommés.
- **Une action de premier plan ne se range pas dans un panneau.** Le dossier de travail a été mis
  ici, puis **retiré** : on change de dépôt plusieurs fois par jour, et le pied du rail porte déjà le
  geste. Un panneau de réglages est l'endroit de ce qui n'a **pas** besoin d'être au premier plan ;
  y ranger une action quotidienne ne la range pas, il l'enterre. Ce qui manquait n'était pas un
  second endroit, c'était ce qui accompagne le geste : le champ du rail ne disait ni ce qu'on y écrit
  ni qu'un dossier inconnu rend un rail vide **sans erreur** (200, zéro session). Il a maintenant un
  libellé, une infobulle qui dit sa conséquence, et une complétion alimentée par `GET /project`
  (962 octets) — jamais une liste déroulante, qui occuperait la place en permanence.
- **Quand l'ensemble des valeurs valides est connu, le contrôle est un choix, jamais une saisie.** Un
  champ de texte pour un modèle oblige à aller chercher `opencode-go/deepseek-v4.1-flash` ailleurs et
  à le recopier sans faute, alors que le serveur publie la liste. Quatre des cinq réglages de
  `General` sont donc des `select` alimentés par le serveur : modèles (`GET /config/providers`,
  531 ko, 49 ms, groupés par fournisseur), agents (`GET /agent` → les **primaires** seulement, le
  schéma l'exige : « must be a primary agent »), interpréteurs (`GET /pty/shells`, 353 o, appelé en
  `fetch` direct — la route n'est **pas** dans le SDK, mesuré). `GET /provider` (6,7 Mo, 1 198 ms)
  fait le même travail pour douze fois le prix : il n'est pas utilisé. Le seul champ de texte restant
  est `Username`, qui n'a pas d'ensemble fini. L'option **vide** est un état, pas une absence : elle
  remet le réglage au défaut du serveur (`config.ts:513` retire la clé quand la valeur est la chaîne
  vide). Et une valeur que le serveur accepte mais ne publie pas s'affiche **quand même** — sinon le
  contrôle montrerait autre chose que ce qui est écrit.
- **Une charge utile qui porte des secrets se projette, jamais ne se stocke.** `GET /config/providers`
  rend 7 champs `key`/`apiKey` **en clair** ; `/api/model` en rend 580 — la route « sans secrets »
  n'existe pas, et c'est une limite du serveur, pas un choix d'écran. La projection ne lit que
  `name`, `id` et le libellé d'un modèle, et le reste est abandonné **avant** d'entrer dans un
  signal : jamais dans le DOM, un journal ou une infobulle.
- **Deux faits valent d'être dits, en pied de page** : où les réglages sont réellement écrits, et
  quelle version du serveur les sert. « Enregistré » sans dire **où** est le défaut qui coûte une
  heure de recherche — le fichier est `opencode.jsonc`, parce que le `.jsonc` gagne sur le `.json`
  quel que soit le mtime.

## 5. Le style

**Monochrome sombre. Aucune couleur d'accent**, sauf une couleur d'attention réservée à une demande
d'accord et une couleur d'échec. Bordures fines translucides ; pas de cartes empilées, pas d'ombres,
pas de dégradés décoratifs. Le vide fait partie du dessin.

### La typographie est une échelle de quatre, en `rem`

| jeton | valeur (racine 16 px) | rôle |
|---|---|---|
| `--fs-title` | `1rem` — 16 | titres de section, nom du produit |
| `--fs-base` | `0.875rem` — 14 | **primaire** : sessions, actions, corps du message |
| `--fs-note` | `0.8125rem` — 13 | descriptions, chemins, libellés secondaires |
| `--fs-meta` | `0.75rem` — 12 | horodatages, libellés en capitales |

1. **Le contenu primaire vaut exactement la taille du `body`.** Au-delà de quatre niveaux, l'œil ne
   distingue plus une hiérarchie, il voit du bruit.
2. **Un rôle, un jeton — jamais une valeur.** Une taille écrite à la main est une taille qu'on ne
   pourra plus changer.
3. **`rem`, jamais `px` ni `vw`.** En `px` fixes, le réglage de taille de police du navigateur est
   ignoré partout ; en `vw`, le même outil ne se lit pas pareil en 1440 et en 2560. Le mécanisme
   correct est `rem`.
4. **La taille signale l'importance ; la casse et l'interlettrage signalent le chrome.** Le chrome
   n'est pas plus grand que le contenu — il est moins contrasté et plus espacé.

### Le contraste se mesure, il ne se suppose pas

Tout texte passe **4,5:1** sur les trois fonds. Un jeton corrigé chez une autre source doit être
**remesuré sur ses propres fonds** : la même valeur passe sur un fond et échoue sur l'autre.

## 6. Ce qui ne doit PAS apparaître

- Tout indicateur qui ne change pas une décision de l'utilisateur.
- Badge, compteur, pastille, icône décorative, halo d'ambiance.
- Titre de section qui redit son contenu ; action visible au repos ; colonne d'actions.
- Barre de statut, panneau « statut », carte de modèle, journal d'événements.
- Un état vide garni pour ne pas laisser de place : vide s'il n'y a rien, tel quel.

## 7. Règle d'arbitrage

En cas de doute : **on enlève**. Un élément ne revient que si son absence a gêné quelqu'un — et on
l'écrit ici, avec la raison.

Deux corollaires qui coûtent cher quand on les oublie :

1. **L'API n'est pas la cible.** Ce qui n'est pas fait tous les jours ne s'affiche pas au repos : un
   skill s'injecte, il ne se consulte pas ; un catalogue ne se parcourt pas tous les jours.
2. **Un principe appris s'applique à tout l'écran**, pas au seul composant où il a été appris.