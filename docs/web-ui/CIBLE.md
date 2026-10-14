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

## 3. Le fil — la conception complète

**Objectif : la satisfaction de lecture.** Le fil n'est pas un journal technique qu'on subit, c'est un
texte qu'on lit — pour comprendre ce que l'agent a fait, ce qu'il a trouvé, et ce qu'il reste à faire.

### 3.1 La prémisse : le flux est en **lecture seule**

Ce qui défile dans le fil n'est pas un formulaire. Aucun de ses éléments ne prend de saisie, rien ne
s'y édite sur place, rien ne s'y relance d'un clic : c'est le **compte rendu** d'un travail, écrit par
le serveur, et l'écran ne peut que le donner à lire. Toute décision de cette section en découle.

**Une seule exception, et elle est motivée** : `question.asked`. Quand l'agent pose une question, il
est **bloqué** dessus — ne pas répondre arrête la conversation. Une question est donc un contrôle dans
le fil, le seul. (`permission.asked` n'est pas dans le fil : il vit dans le tiroir droit, cf. §2.)

### 3.2 Ce que le flux contient vraiment — mesuré, pas supposé

Relevé sur **4 conversations réelles de la copie** (273 messages, **7 782 parts**) :

| part | nombre | part du total | aujourd'hui |
|---|---|---|---|
| `tool` | 2 262 | **29 %** | rendu — une ligne, avec son titre |
| `step-start` | 1 447 | 19 % | **filtré** |
| `step-finish` | 1 440 | 19 % | **filtré** — porte `cost`, `tokens`, `reason`, `snapshot` |
| `reasoning` | 1 404 | 18 % | rendu, replié |
| `text` | 823 | **10,6 %** | rendu |
| `patch` | 400 | 5 % | **filtré** — porte les fichiers changés |
| `compaction` | 6 | — | **filtré** |

**Le texte est 10,6 % de ce qui défile.** Concevoir le fil comme une conversation de prose, c'est
cacher 90 % du contenu — puis s'étonner qu'on ne suive pas ce que fait l'agent. Les champs présents mais
jamais lus confirment le gaspillage : `tool.state.title` sur 2 242 parts, `tool.state.time` sur 2 262,
`cost` et `tokens` sur 1 440 étapes et sur 230 messages, `patch` sur 400 parts.

### 3.3 L'unité de lecture est **l'étape**, pas le message

Une « réponse » n'est pas un bloc : c'est une **suite d'étapes**, chacune étant un appel au modèle, avec
son coût, ses jetons, ses outils et son raisonnement propres. Tout regrouper dans une bulle de message
détruit la seule structure qui existe. Donc :

- un **tour** (le prompt de l'utilisateur → la réponse finie) regroupe ses étapes ;
- une **étape** est une ligne d'en-tête, puis son contenu.

### 3.4 Les trois niveaux d'attention

1. **Le prompt de l'utilisateur** — dans sa surface, texte conservé tel quel. C'est le seul texte de
   l'écran écrit par l'utilisateur lui-même, donc le seul mis en forme.
2. **La prose de l'agent** (`text`) — au corps le plus grand. C'est la seule chose écrite *pour être
   lue*. L'agent reste en **texte nu** : la dissymétrie dit qui a parlé.
3. **Le travail** (outils, raisonnement, patches) — replié à une ligne par étape, dépliable sur place.
   C'est 71 % du contenu, et ce n'est pas la lecture principale : c'est ce qu'on **vérifie**.

### 3.5 Ce qu'une étape montre, dans l'ordre

```
step 3 · 12 actions · 8,4 s · $0.12 · 31k tokens
   ├ reasoning · 2,1 s                    replié, dépliable
   ├ ⚙ bash « vitest run » · 1.2k lignes  une ligne par action
   ├ ✎ edit src/app.tsx · +12 −3
   └ La suite est en place ; reste le test du cas vide.   ← la prose, au grand corps
```

- **La ligne d'étape porte son prix.** `cost` et `tokens` sont là 1 440 fois et ne s'affichent jamais :
  « combien a coûté ce travail » est une question de lecteur, pas de comptable.
  → **Révisé en §9.3** : le prix quitte le fil et rejoint la section statistiques. Cette puce décrit
  l'état antérieur ; la règle en vigueur est en §9.3.
- **Le raisonnement donne sa durée** (`reasoning.time`, 1 404 occurrences), pas son volume.
- **Un patch est un contenu** (fichiers, ±lignes) ; un `snapshot` n'en est pas un — c'est une référence
  d'état. Le premier s'affiche, le second jamais.

### 3.6 Les textes qui ne sont **pas** de la prose

- `text.synthetic` (73 dans le relevé) : injecté, **pas dit par l'agent** ⇒ marqué comme tel, jamais
  présenté comme une réponse.
- `text.ignored` (70) : non envoyé au modèle ⇒ jamais présenté comme une réponse non plus.
- `retry` : une tentative échouée puis rejouée ⇒ **montrée**, sinon le fil ment sur ce qui s'est passé.
- `compaction` : coupe franche dans l'historique ⇒ montrée comme une borne, parce que ce qui suit ne
  s'appuie plus sur ce qui précède.

### 3.7 Le repos, le défilement, la densité

- **Rien ne déplace ce qu'on lit.** Déplier une étape ne bouge jamais le texte au-dessus : l'ancre est
  la ligne dépliée.
- **Le suivi automatique n'existe que si on est déjà en bas** ; sinon on ne bouge pas, et un seul
  contrôle permet d'y revenir.
- **Le fil est append-only à l'affichage.** Le serveur fournit `message.part.updated` et
  `message.part.delta` ; on **ajoute** au lieu de recharger. Aujourd'hui la webui recharge **tout** le
  fil à chaque événement citant l'identifiant de session : c'est ce qui fait sauter le défilement et
  clignoter le texte.
- **Une sortie d'outil est bornée** : N lignes, puis « +412 lignes » et le clic qui les révèle — jamais
  un déversement.
- **La densité suit l'importance** : prose à `--fs-base`, lignes d'action et en-têtes à `--fs-note`,
  rien en dessous. Une ligne d'action est **une ligne**, pas une carte.
- **L'air se met au-dessus de ce qui ouvre un bloc, jamais entre deux lignes du même bloc.** Deux
  appels d'outil qui se suivent restent au ras (1 px de padding chacun) ; un raisonnement, lui, *ouvre*
  un bloc et se détache par un peu d'air **au-dessus** (`margin-top` sur `.reasoning`, 8 px). Le pas
  **entre deux tours** est plus large encore (`.transcript { gap }`, 26 px) : c'est lui qui sépare deux
  échanges, pas le flux interne d'un tour (`.turn { gap: 0 }`).

### 3.8 Ce qui ne s'affiche **jamais** dans le fil

- `step-start` — 1 447 occurrences, **aucun contenu propre**.
- `snapshot`, un raisonnement vide, un texte vide.
- « +0 −0 · 0 fichier » — on écrit **« aucun changement »**, qui se lit comme un résultat.
- Le bruit de protocole (`step-start`/`step-finish` sans contenu), déjà banni ailleurs.
- Aucun compteur, badge ou bouton **au repos** : ce qui est rare se replie, ne s'annonce pas.

### 3.9 Les seules interactions du fil

| geste | nature |
|---|---|
| déplier / replier une étape, un raisonnement, une sortie longue | **lecture** |
| copier une commande, un chemin, un bloc | **lecture** |
| répondre à une question de l'agent (`question.asked`) | **écriture — la seule** |
| autoriser / refuser (`permission.asked`) | écriture, **hors du fil** (tiroir droit) |

## 4. Le rail

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

### Le pied du rail, et les vues

Le pied du rail garde ce qui n'est **pas** une vue : le dossier de travail, les statistiques de session
(un tiroir) et l'ouverture des **réglages**. Une préférence n'est pas une vue : ranger les deux dans une
même barre mélangerait ce qui se **règle** et ce qui se **remplace**.

Les **vues**, elles, sont au-dessus du chat : `Session` et `Logs`, qui **commutent le panneau
principal** — la conversation, ou le journal — comme les dialogues du TUI. Elles vivent là, et non dans
le rail, parce que c'est le contenu du chat qu'elles remplacent : on les cherche là où l'on regarde.

Le journal montre ce que la page a **réellement reçu** (`server.connected`, `server.heartbeat`,
`message.part.updated`…), et le plus récent en tête. C'est le seul journal qu'on puisse montrer
honnêtement : le serveur n'expose aucune route qui *lise* ses logs — `POST /log` ne fait qu'en écrire
un — et ses fichiers vivent hors du projet, donc hors de portée de `/file/content`. Ce panneau répond
donc à « il ne se passe rien à l'écran », qui est la question qu'on se pose vraiment.

---

## 5. Les réglages — une feuille qui gère

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
- **Un libellé de choix doit identifier sa valeur à lui seul.** Fermé, un `<select>` n'affiche que lui :
  si deux modèles portent le même nom chez deux fournisseurs, le contrôle affiche deux fois la même
  chose pour deux valeurs différentes, et l'utilisateur ne peut pas dire ce qu'il a choisi — le défaut
  même qu'on retire du champ de texte. Mesuré : **696 modèles pour 509 libellés distincts**, 141
  libellés portés par plusieurs modèles. D'où la forme `Nom · Fournisseur`, **toujours** — un libellé
  qui change de forme selon ses voisins se balaie moins vite qu'un libellé un peu plus long. Corollaire
  de forme : la liste est **plate**, sans `optgroup`. Le titre de groupe redirait au-dessus de chaque
  ligne ce que la ligne dit déjà, et une barre de sélection native ne cherche **pas** les titres de
  groupe au clavier — grouper rendrait `orcarouter` introuvable à la frappe.
- **Et réciproquement : ce qui est rare ne reste pas au premier plan.** Le bouton `credentials` et son
  badge « credentials ✓ » vivaient au pied du rail — un badge qui ne change jamais ne dit rien, il
  occupe — pour un réglage qu'on touche **une fois par serveur**. Ils sont descendus dans `General`,
  bloc *Server* : l'adresse, le nom, le mot de passe, et `Forget`, qui n'apparaît **que** s'il y a
  quelque chose à oublier. L'adresse est en **lecture seule** — elle vient de `location.origin` ou
  d'une variable de build, donc un champ de saisie donnerait l'illusion d'un effet. Et ce que la
  popover ne montrait pas, la page le montre : l'adresse du serveur et le nom déjà enregistré se
  **lisent**, sans avoir à les réécrire pour les voir.
- **Un cache de session nomme son point d'invalidation, ou n'existe pas.** `GET /config/providers`
  (531 ko) et `GET /agent` (1,27 Mo) ne se relisent plus à chaque ouverture de `General` : 1,8 Mo pour
  deux listes qui ne changent que si l'on écrit. L'invalidation appartient au **seul writer** qui peut
  les changer — `saveProvider` pour les modèles, `saveAgent` pour les agents. Sans ce point nommé, un
  cache montrerait une liste incomplète jusqu'au redémarrage : c'est le seul piège, et il se paie en
  nommant ce qui invalide, pas en se passant de cache.
- **Une charge utile qui porte des secrets se projette, jamais ne se stocke.** `GET /config/providers`
  rend 7 champs `key`/`apiKey` **en clair** ; `/api/model` en rend 580 — la route « sans secrets »
  n'existe pas, et c'est une limite du serveur, pas un choix d'écran. La projection ne lit que
  `name`, `id` et le libellé d'un modèle, et le reste est abandonné **avant** d'entrer dans un
  signal : jamais dans le DOM, un journal ou une infobulle.
- **Deux faits valent d'être dits, en pied de page** : où les réglages sont réellement écrits, et
  quelle version du serveur les sert. « Enregistré » sans dire **où** est le défaut qui coûte une
  heure de recherche — le fichier est `opencode.jsonc`, parce que le `.jsonc` gagne sur le `.json`
  quel que soit le mtime.
- **Un écran de réglages est une collection, puis le détail d'un de ses éléments — jamais une liste de
  formulaires.** Une liste plate de huit formulaires repliables ne montre pas la relation qui donne sa
  raison d'être à l'objet : un fournisseur existe **pour ses modèles**, et aucun modèle n'était
  visible. La règle générale : une section décompose sa donnée en **1 → n**, la collection se cherche,
  le détail se règle. Elle vaut pour chaque menu, pas seulement pour `Providers` : agents → le modèle
  d'un agent, serveurs MCP → l'état d'un serveur, plugins → la source d'un plugin.
- **Le contrôle de choix est cherchable, et sa liste défile avec notre barre.** Un `<select>` natif ne
  peut pas obéir : sa liste est dessinée par le système d'exploitation, donc ni champ de filtre ni
  barre de défilement stylisée — la barre par défaut est une barre d'application dans une interface
  qui n'en a pas. C'est un composant maison, et c'est une décision, pas une préférence. Quatre règles :
  le champ de filtre est la **première ligne de la liste ouverte** (il n'existe pas au repos, donc il
  ne coûte rien tant qu'on ne choisit pas), le filtre porte sur le **libellé** (jamais sur un titre de
  groupe, qui rendrait `orcarouter` introuvable à la frappe), le clavier est complet (↑↓ `Home` `End`
  `Entrée` `Échap`, `Tab` ferme), et la liste est bornée en hauteur — au-delà, elle défile. Un
  composant de choix qui ne s'utilise qu'à la souris est un composant en panne.

### La page `Providers` — la grille, puis le détail

Le fournisseur est le « 1 », ses modèles sont le « n ». Décidé **avant** de sonder l'API, parce qu'un
écran dessiné à partir de ce que la route rend finit par montrer la route au lieu du besoin.

```
┌ Providers ───────────────────────────────────────────────────────────────┐
│  [ search 228 providers                                    ]  7 ready     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                      │
│  │ ✳ OpenCode Go│ │ ✳ DeepSeek   │ │ ✳ OpenRouter │   ← la GRILLE (le n) │
│  │ 104 models   │ │ 12 models    │ │ 366 models   │                      │
│  │ ● ready      │ │ ● ready      │ │ ○ no key     │                      │
│  └──────────────┘ └──────────────┘ └──────────────┘                      │
└──────────────────────────────────────────────────────────────────────────┘
                     clic sur une tuile → le détail remplace la grille
┌ ← Providers / OpenCode Go ───────────────────────────────────────────────┐
│  THE PROVIDER (le 1)                                                     │
│    API keys   1  ••••••••••••  [ remove ]            Base URL [       ]  │
│               2  ••••••••••••  [ remove ]      ● ready   [ Save ]        │
│  ITS MODELS (le n)                          [ search 122 models      ]   │
│    ┌────────────────────────────────────────────────────────────────┐    │
│    │ ✓  grok/grok-4.3                              · default         │    │
│    │ ✓  deepseek-v4.1-flash                        ·                 │    │
│    │ –  kimi-k2                                    ·                 │    │
│    └────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Trois choses que ce dessin tranche.** La grille montre **vos** fournisseurs au repos (sept), et le
filtre cherche dans **tout** le catalogue (228) : un contrôle, deux états, aucun clic de plus — la
règle de fréquence veut que le rare se replie, pas que le fréquent coûte un clic. Le détail **remplace**
la grille au lieu de s'ajouter à côté : le rail vertical est déjà une colonne, une deuxième en ferait
trois. Chaque tuile dit son état en un mot **et** un point — un état qui ne se lit qu'en couleur ne se
lit pas.

**Ce que la mesure a changé** (routes et schéma relevés le 2026-10-13) :

| | Le besoin | Le verdict |
|---|---|---|
| R1 | lister les modèles d'**un** fournisseur | **tenu** — `models` est une carte dans `GET /config/providers` : 122 pour `orcarouter`, chaque entrée portant `name`, `cost`, `limit`, `capabilities`, `variants`. Aucun appel de plus. |
| R2 | écrire la clé et l'URL de base | **tenu, mais deux magasins.** La clé est un **identifiant** (`PUT /auth/{providerID}`, et `POST /auth/{id}/keys` pour une liste) ; `baseURL` est de la **configuration** (`provider.<id>.options.baseURL`, par `PATCH /global/config`). Un seul bouton `Save` écrit donc à deux endroits : c'est une chose à dire à l'écran, pas à cacher. |
| R3 | un modèle par défaut **par fournisseur** | **tombe.** Il n'existe pas : `Config.model` est **global** (`provider/modèle`). Le contrôle reste, mais il s'appelle « default for new sessions » et sa portée est nommée — sinon il promet un réglage que le fichier ne porte pas. |
| R4 | activer/désactiver un modèle, le régler | **tenu** — `whitelist` / `blacklist` sur le fournisseur décident des modèles disponibles, et `models.<id>` surcharge un modèle (`name`, `limit`, `cost`, `options`, `variants.<v>.disabled`). Par `PATCH /global/config` : `PATCH /config` matérialise un `config.json` **à la racine du dépôt** — mesuré. |

**Trois capacités que la cible ignorait, et qui la rendent meilleure.** Le serveur porte **plusieurs
clés par fournisseur, ordonnées, avec bascule automatique** sur `401/402/403/429` — le champ unique
actuel rate une fonction du serveur : la liste des clés remplace le champ, l'ordre est l'ordre de
bascule. `POST /provider/{id}/oauth/authorize` + `/oauth/callback` sont un vrai flux, donc `Connect`
peut exister au lieu du texte inerte d'aujourd'hui. Et `discover` fait chercher la liste des modèles
sur `{baseURL}/models` : un interrupteur qui répond à « mes modèles n'apparaissent pas ».

**Le catalogue ne se paie que si on le demande.** La grille au repos lit `GET /config/providers`
(531 ko, 49 ms) ; chercher dans les 228 paie `GET /provider` (6,7 Mo, 1 198 ms) **au premier caractère
tapé**, une fois par session. `GET /api/provider/{id}` ne sert à rien ici : 319 octets mais 1 086 ms,
et il **ne porte pas** la liste des modèles.

**Ce qui ne s'affiche pas** : le nombre de méthodes d'authentification au repos (une propriété de la
surface du serveur, pas une décision — il descend dans le détail s'il sert), aucun formulaire ouvert
au repos, aucune colonne d'actions (le libellé d'un modèle est l'information, ses actions se révèlent
au survol de la ligne), et jamais un état par la couleur seule.

## 6. Le style

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

## 7. Ce qui ne doit PAS apparaître

- Tout indicateur qui ne change pas une décision de l'utilisateur.
- Badge, compteur, pastille, icône décorative, halo d'ambiance.
- Titre de section qui redit son contenu ; action visible au repos ; colonne d'actions.
- Barre de statut, panneau « statut », carte de modèle, journal d'événements.
- Un état vide garni pour ne pas laisser de place : vide s'il n'y a rien, tel quel.

## 8. Règle d'arbitrage

En cas de doute : **on enlève**. Un élément ne revient que si son absence a gêné quelqu'un — et on
l'écrit ici, avec la raison.

Deux corollaires qui coûtent cher quand on les oublie :

1. **L'API n'est pas la cible.** Ce qui n'est pas fait tous les jours ne s'affiche pas au repos : un
   skill s'injecte, il ne se consulte pas ; un catalogue ne se parcourt pas tous les jours.
2. **Un principe appris s'applique à tout l'écran**, pas au seul composant où il a été appris.

---

## 9. La densité — peu par défaut, tout à la demande

**Le fil n'est pas un journal technique, c'est une conversation.** Un agent généraliste produit
surtout du matériel de vérification : 29 % d'outils, 19 % de bornes d'étape, 18 % de raisonnement,
5 % de patches — pour **10,6 % de texte** (mesuré, §3.2). Le lire tel quel, c'est lire 90 % de choses
qu'on ne lit pas.

### 9.1 Ce qui s'affiche — le flux

Le fil est un **flux**, dans l'ordre des faits :

1. **Le prompt de l'utilisateur** — sa surface, son texte tel quel.
2. **La prose de l'agent** — au corps de lecture, en markdown rendu (§12).
3. **Le travail** — **une ligne par fait**, en continu : icône de famille, libellé, contenu.

Rien n'est replié, rien n'est caché.

### 9.2 Pourquoi un flux, et pas un repli

> **Révision, mesurée à l'usage.** La version précédente repliait tout le travail derrière un
> contrôle unique nommé « work ». Le verdict de l'intéressé : *« tu as fait en sorte d'afficher peu
> mais au final tu n'affiches rien du tout »*. Le repli n'allégeait pas le fil, il le **vidait** — et
> un fil vidé n'est pas un fil discret, c'est un fil absent.

Ce qui allège, ce n'est pas de cacher, c'est de **tenir en une ligne**. D'où le flux :

- **Une ligne par fait** — un appel d'outil, une réflexion, un patch. C'est déjà la forme de
  `ToolLine`, `Reasoning` et `PatchLine` : le travail était *déjà* une ligne, le repli n'ajoutait rien
  qu'une disparition.
- **Le détail se déplie sur l'entrée elle-même**, jamais sur un conteneur qui emporterait ses voisines.
- **Aucune bordure, aucun séparateur, aucun encadré.** Une bordure par ligne transforme la liste en
  colonne de bandes et gêne la lecture — verdict d'usage, retiré.
- **Aucun écart entre les lignes non plus.** L'air qui sépare les **blocs** (la prose, les documents)
  est porté par ces blocs, via leurs marges — jamais par un `gap` entre les entrées, qui ajoutait de
  l'air entre **chaque** appel d'outil, y compris deux appels qui se suivent.

**Mesuré avant/après sur une même session de 795 appels d'outil** (l'ancienne feuille servie depuis
`183c26855`, puis `HEAD`, même session, même sonde) :

| | avant | après |
|---|---|---|
| hauteur d'une ligne | 28,4 px | **24,4 px** |
| écart entre deux appels consécutifs | 36,4 px | **24,4 px** |
| padding vertical d'une ligne | 3 px | **1 px** |
| hauteur de la pile | 70 475 px | **55 719 px** |

**14 756 px libérés sur cette seule session.** L'écart entre deux appels consécutifs vaut désormais
**exactement la hauteur d'une ligne** : plus un pixel d'air ajouté.
- **Aucune statistique** (§9.3) : le flux porte le *contenu*, jamais le *prix*.
- **Rien ne déplace ce qu'on lit** (§3.7) : le flux s'ajoute à la fin, il ne se réordonne pas.

**Ce qui reste, et pourquoi** — la distinction est le cœur de cette section :

| registre | exemples | sort |
|---|---|---|
| **contenu** — ce qui a changé, ce qui a été produit | `+12 −3`, `14 lines`, `2 files` | **reste** |
| **performance** — ce que ça a coûté | `2.8s`, `$0.0008`, `48.6k tokens`, `6 actions` | **part** |

Un « +12 −3 » décrit le fichier ; un « $0.0008 » décrit la facture. Le premier se lit, le second se
consulte.

### 9.3 Les statistiques déménagent

> **Révision de §3.5.** La ligne d'étape portait son prix (« step 3 · 6 actions · 2.8s · $0.0008 ·
> 48.6k tokens »). Mesuré puis jugé : c'est un registre de comptable, pas de lecteur, et un agent
> généraliste n'en fait pas son sujet.

**Toute** information statistique — **nombre de tours, temps d'exécution, jetons, coût** — quitte le
fil et vit dans **la section de §10**. Le fil n'affiche plus un seul nombre de ce registre. Le fil
devient ainsi **plus pauvre** que le lot précédent : c'est voulu, et c'est le sens de la demande.

---

## 10. Les statistiques — une section, pas le fil

**Une porte toujours au même endroit, un contenu qui ne bouge pas.**

- **La porte** : un bouton discret dans la tête du fil, **toujours présent** — parce que « d'accès
  facile et visible » exclut un panneau qui n'apparaît que quand quelque chose bloque.
- **Le contenu** : le tiroir droit, **en onglets**.

> **Révision de §2.** Le tiroir droit n'était ouvert que par une permission en attente. Il gagne une
> seconde raison d'exister : la consultation. Il **s'ouvre toujours de lui-même** sur une décision
> bloquante — ça ne change pas.

| onglet | contenu | quand |
|---|---|---|
| **Session** | les agrégats, puis le détail **par étape** | toujours |
| **Decisions** | les demandes en attente (permission) | seulement s'il y en a une |

**Le contenu de « Session »** — l'information ne disparaît pas, elle déménage :

```
turns      4
steps      31
time       6m 12s
tokens     1.2M  (in 1.1M · out 96k)
cost       $0.42
───────────────
step 1  6 actions  2.8 s  $0.0008  48.6k
step 2  2 actions  1.1 s  $0.0004  31.0k
…
```

La ligne d'étape rejetée du fil **est** le contenu de cette section : sa place naturelle est là où on
la cherche, pas là où on lit.

---

### 10.1 La barre sous le champ — trois faits, et leur provenance

§10 rangeait les statistiques dans la section, au motif qu'elles ne sont pas le fil. La règle tient,
mais elle laissait un vide : **les trois chiffres qu'on veut lire en écrivant** — où en est la session,
à quelle vitesse, et à quel point la fenêtre est pleine — demandaient d'ouvrir un tiroir. Ils vivent
donc **sous le champ**, et le détail par étape reste dans la section, qui ne se consulte pas en
écrivant.

- **Le volume** — `3 turns · 12 steps`. L'infobulle ajoute les actions de la session.
- **Le débit** — `145 tok/s`, les jetons **produits** divisés par la durée **mesurée** des étapes :
  un rapport honnête, pas une estimation de débit d'API.
- **Le cache** — `93% cached`, la part de l'entrée servie par le cache (`cache.read` face à l'entrée).
- **Le contexte** — `23% context`, `tokens.total` de la dernière étape face à la fenêtre du modèle.

Deux règles, et chacune répond à un défaut précis :

1. **Chaque groupe porte sa mesure en infobulle.** Un chiffre sans unité ni provenance n'est pas une
   information : « 47% » ne dit rien, « Share of the input served from the prompt cache » le dit.
2. **Un groupe dont la donnée manque disparaît.** Sans limite de fenêtre connue, il n'y a **pas** de
   remplissage de contexte — la barre se tait plutôt que d'afficher un « 0% » qui ferait croire à une
   fenêtre vide. Même règle pour le débit : une durée absente ne donne pas un zéro, elle ne donne rien.

La limite vient du **modèle choisi** (`limit.context`, projeté de `/config/providers` avec le
catalogue) : elle suit donc le choix de la saisie (§13.3) au lieu d'être figée.

---

### 10.2 La trajectoire — le diagnostic d'un tour

La vue `Logs` ne montre pas des événements bruts : elle montre la **trajectoire** de la session, un
bloc par tour. Le fil raconte ce qui s'est passé ; la trajectoire dit **comment** et **à quel prix**.

Un tour porte, dans cet ordre :

- **Ce qui a réellement servi** — l'agent, le mode et le modèle de la *réponse*, jamais ce qui a été
  *demandé*. Les deux diffèrent (bascule de modèle, agent qui en appelle un autre) et confondre les
  deux ferait dire à l'écran un modèle qui n'a pas produit la réponse.
- **Ce qui a été envoyé** — la taille du prompt en caractères, puis les injections que le serveur y a
  jointes. Elles se **relisent** dans le texte synthétique du prompt (`Context injections · …`),
  jamais recalculées : recalculer donnerait une seconde vérité.
- **Ce qui est revenu** — les jetons **séparés par origine** : entrée, sortie, cache. Un total unique
  ne dit pas si la fenêtre est pleine de neuf ou de déjà-vu.
- **Chaque étape** — ses outils dans l'ordre, son **motif d'arrêt** (`stop`, `tool-calls`, `length`…),
  ses jetons et sa durée. Le motif est la première chose qu'on cherche quand une réponse se coupe :
  une longueur atteinte ne se répare pas comme un arrêt normal.
- **L'erreur**, quand il y en a une, avec son message réel.

Deux règles : **une ligne ne dit qu'un fait, et son libellé à gauche** (on lit une trajectoire en
descendant une colonne, pas en cherchant le chiffre dans une phrase) ; et **une donnée absente
disparaît** (§10.1) — une réponse sans borne de fin n'a pas de durée, elle n'affiche pas un zéro.

Les **événements bruts** restent, repliés sous la trajectoire : ils servent quand elle ne suffit pas,
et les déplier par défaut noierait la lecture.

---

## 11. La couleur — une grammaire, pas une décoration

Couleur **sémantique par famille d'outil** — les douze familles existent déjà (`tool-icons.ts`), donc
la couleur suit la même grammaire que l'icône et ne peut pas diverger d'elle.

| famille | teinte | pourquoi celle-là |
|---|---|---|
| `read` | bleu | information **lue** — la couleur la plus neutre après le gris |
| `write` | ambre | ce qui **modifie** — la teinte d'avertissement, sans être l'alarme |
| `shell` | vert | ce qui **s'exécute** |
| `search` | cyan | ce qui **cherche** |
| `web` | violet | ce qui vient **d'ailleurs** |
| `subagent` | turquoise | un **autre agent** a travaillé |
| `ask` | indigo | la **marque** : l'agent s'adresse à vous |
| `plan` | ardoise | déclarer un **engagement** n'est pas agir |
| `skill` | rose | ce qui **s'injecte** |
| `goal` | orange | l'**objectif** |
| `todo` | gris-bleu | du **suivi**, sans relief |
| `generic` | gris | l'inconnu ne se déguise pas |

**Trois règles d'application**, sans quoi la couleur devient du bruit :

1. Elle teinte l'**icône** et un **filet de 2 px** — **jamais un fond**. Un fond coloré par ligne
   transforme une liste en mosaïque et rend la lecture plus difficile, pas plus facile.
2. Elle **ne porte jamais seule** une information : le libellé reste, le contraste tient sans elle.
3. **Rien de neuf n'apparaît au repos** (§8) : une ligne d'action repliée reste discrète ; la couleur
   se voit quand on ouvre le travail.

Le reste du fil suit la même sobriété : prose **neutre**, raisonnement **assourdi**, patch **ambre**,
borne **neutre**, erreur **rouge** (`--danger`), question **accent**.

---

## 12. Le markdown et les médias

### 12.1 Le markdown, rendu — et rendu **sûr**

La prose de l'agent est écrite en markdown : la rendre en texte brut oblige à lire des `**` et des
`#`. Le rendu couvre le sous-ensemble qui sert vraiment : titres `#` à `####`, paragraphes, listes
(ordonnées, non ordonnées, un niveau d'imbrication), blocs de code **avec leur langue**, code en
ligne, gras, italique, liens, citations, tableaux, filets.

**Rendu sûr par construction** : tout le texte est **échappé**, et seules les balises que le moteur
construit lui-même sont émises. Le markdown ne peut donc pas injecter de HTML — la sortie d'un modèle
est une donnée, jamais du balisage de confiance.

**La couleur sert la structure, pas la décoration** : les titres baissent en taille et en contraste
avec leur niveau, le code a un fond `--bg-0` et sa langue en marge, le code en ligne est teinté, les
liens prennent `--brand-1`, les citations un filet gauche, les tableaux un filet horizontal — et rien
d'autre.

### 12.2 Images et vidéos

**On rend quand on a les octets, on nomme quand on ne les a pas** — et on le dit :

| source | rendu |
|---|---|
| un lien markdown ou une URL http(s) vers une image | **image inline** |
| une URL http(s) vers une vidéo (`.mp4`, `.webm`, `.mov`, `.ogv`) | **lecteur inline** |
| une partie `file` portant une **data URL** (pièce jointe) | **image ou vidéo inline** |
| `tool.state.attachments` — le serveur joint lui-même les octets (**mesuré : 25 parties**, forme `{mime, url: "data:image/png;base64,…"}`) | **image ou vidéo inline** |
| un **chemin** seul, sans octets | **nommé**, pas rendu |

La dernière ligne est une **limite mesurée, pas un oubli** : `GET /file/content` rend
`{"type":"text","content":""}` sur une image — il lit du texte, il ne sert pas d'octets. Un
`read shot.png` ne peut donc pas s'afficher ; il devient une entrée de §12.3, ce qui est exact.

### 12.3 Les documents de la réponse

**À la fin du dernier step de la dernière réponse de l'agent**, un composant liste les **documents
produits ou touchés** : les fichiers des patches (`files[]`) et des écritures (`metadata.filediff`),
avec leur nom, leurs ±lignes, et la copie du chemin.

- Vide ⇒ **il n'existe pas** (§8 : pas d'état vide garni).
- Il porte le **contenu**, pas la performance : un nom, des ±lignes, un chemin — aucune statistique.
- Il ne se répète pas sur chaque tour : c'est le **bilan** de la réponse, à sa fin.

---

## 13. Le prompt de l'utilisateur — markdown aux deux bouts

Un prompt s'écrit en markdown : le montrer en texte brut oblige à lire des `**` et des `#`. Il passe
donc par le **même** moteur que la prose de l'agent (§12.1) — et à **deux** endroits, pas un.

### 13.1 Dans le fil

Le prompt garde sa surface (son cadre, son corps de lecture), et son texte est **rendu**. Une seule
chose devait être préservée : ses **retours à la ligne**. Le fil les affichait (`white-space: pre-wrap`)
avant ce lot ; le markdown écrase les retours simples, donc le rendre sans rien aurait **retiré** une
chose que le lecteur avait. D'où les **sauts durs** — `  ` ou `\` en fin de ligne, du markdown
standard : la coupure que l'auteur a marquée survit, les autres se rejoignent comme le markdown le veut.

### 13.2 À la saisie

**Un `textarea` ne peut pas rendre du markdown bloc** : un titre, une liste ou un bloc de code
changent la mise en page, donc le curseur décroche du texte et l'écriture devient fausse. La parade
n'est pas de renoncer, c'est de **séparer les deux registres** :

- le champ reste un `textarea` — le seul contrôle qui garde un curseur, une sélection et le
  copier-coller du système ;
- un **calque** est posé **dessous**, à métriques identiques, et le texte du champ est rendu
  **transparent** : le curseur reste celui du champ, ce qu'on lit vient du calque.

Trois règles, sans quoi le calque casse ce qu'il décore :

1. **Le calque ne change que la couleur.** Rien qui touche à la largeur ou à la hauteur — un poids,
   une taille, une italique décaleraient le curseur, et le défaut ne se verrait qu'en tapant.
2. **Les deux couches déclarent la même police, explicitement.** Un `textarea` n'hérite pas la police
   de l'application par défaut : s'il n'en reçoit pas, il prend celle du navigateur, et le calque, lui,
   en hérite. Les laisser diverger les désaligne.
3. **La concaténation des segments rend la source, caractère pour caractère.** C'est la propriété qui
   protège le curseur, et elle est testée sur toutes les formes reconnues.

Les marqueurs (`**`, `#`, `` ` ``) restent **visibles**, simplement atténués : on **écrit** dans ce
champ, on ne le lit pas — les masquer cacherait ce qu'on est en train de taper.

### 13.3 Les deux choix du prochain message

Le modèle et l'agent se choisissent **dans la saisie**, à côté du trombone, et ils partent avec le
message (`promptAsync` accepte `model` et `agent`) : changer de modèle ne passe donc pas par les
réglages, et n'écrit **rien** dans la configuration. Vides, ils valent « défaut du serveur » et l'envoi
n'ajoute aucune contrainte.

Ils sont **amorcés par ce que la session a réellement utilisé** : la dernière réponse d'agent porte
`providerID`, `modelID` et `agent`, seule description de l'état courant — la configuration ne donne
qu'un défaut **global**, sans portée par fournisseur. L'amorçage ne remplace jamais un choix explicite.

Le **coût est assumé et inégal** : le catalogue des modèles (531 ko, 49 ms) est payé **au montage**,
parce que le choix est là où l'on écrit ; la liste des agents (1,5 Mo) attend la **première
ouverture**, `Tab` compris — et `Tab` change au **même** appui, sinon la première pression ne ferait
que charger la liste, ce qui se lit comme une panne. Un libellé rogné porte son titre entier (un
modèle se nomme « Nom · Fournisseur »).

### 13.4 Les suggestions — `/` et `@`

- `/` **en tête** ouvre les commandes, et la requête se ferme au premier espace : écrire l'argument
  referme la liste sans aucun code de fermeture. `GET /command` pèse **1,95 Mo** de gabarits dont la
  liste n'affiche que le nom et la description ⇒ lu à la **première frappe**, et projeté aussitôt.
- `@` ouvre les fichiers, mais seulement s'il **commence un mot** : `moi@exemple.com` n'ouvre rien. La
  mention court jusqu'au **blanc suivant** — c'est le mot entier qui est remplacé, pas le seul curseur.
- La liste vit **au-dessus du champ, dans la même boîte** : elle **pousse** le champ au lieu de le
  recouvrir. Un menu flottant cacherait justement la ligne qu'on relit pour choisir.
- Le menu **consomme** les flèches, `Entrée` et `Échap` tant qu'il est ouvert — sinon `Entrée`
  enverrait le message au lieu de choisir la ligne.
- Le filtre des commandes regarde le **nom** puis la **description** : on cherche parfois « comment on
  fait un commit » sans connaître le nom du raccourci.

### 13.5 Le clavier

`Entrée` envoie, `Maj+Entrée` retourne à la ligne, `Tab` change l'agent, `↑`/`↓` remontent
l'historique des prompts, et **deux `Échap` rapprochés arrêtent le travail** — fenêtre de 700 ms,
parce qu'un `Échap` seul ferme les listes et ne peut donc pas porter l'arrêt. L'historique est
**dérivé des messages**, jamais tenu dans un signal à part : une liste séparée se désynchronise de la
session (changement, reprise, rechargement) et montrerait des prompts absents du fil.

L'indice « esc esc to stop » n'apparaît **que pendant que l'agent travaille** : ce qui est rare ne
s'affiche pas au repos (§9).

---

## 14. Les documents de la réponse — des cartes

§12.3 listait les documents ; ils prennent leur forme définitive :

- **Un badge de type** — les lettres de l'extension (`TS`, `JSON`, `MD`), teintées par **nature** de
  fichier : du code, des données, un style, de la documentation, un script, un média. La teinte dit la
  nature, **pas le langage** — une couleur par langage serait un vocabulaire que personne ne retient.
- **Un fichier sans extension n'a pas de lettres à montrer** (`Makefile`, `.gitignore`) : il porte un
  point, pas un badge inventé. Un point **en tête** est un nom, pas une extension.
- **Les ±lignes** quand il y en a, **le chemin copiable** au survol.
- **Le contenu, jamais la performance** : un nom, des ±lignes, un chemin. Aucune statistique — elles
  sont en §10.
- **Vide, il n'existe pas** (§8).