---
name: fork-webui
description: Règles de la webui opencode (packages/webui) — API_PREFIXES et proxy Vite, GET /config/providers vs /provider, flux SSE et deltas, /global/event, message.part.updated, turnError, animations interdites, jetons CSS, barres de défilement, instance isolée 4097/5181. Utiliser dès qu'on modifie un écran, un composant, un événement ou un style de la webui.
---

# Webui

## Cible

`docs/web-ui/CIBLE.md` : un écran, cinq zones ; le tiroir droit n'existe que sur une permission en attente ; `step-start`/`step-finish` ne s'affichent jamais.

## Routes et proxy

**Toute route consommée doit figurer dans `API_PREFIXES`** (`packages/webui/vite.config.ts`) : sinon Vite rend `index.html` en **200**, l'erreur est avalée et l'écran reste **vide sans message** ⇒ sonder **par le proxy** et vérifier le `content-type`, jamais le seul status.

## Réglages

- **Liste de choix** dès que l'ensemble des valeurs est connu du serveur, jamais un champ libre.
- Modèles = `GET /config/providers` (**531 ko**) — jamais `GET /provider` (**6,7 Mo**) ni `/api/model` ; agents = `GET /agent` filtré `mode === "primary" && hidden !== true` ; interpréteurs = `GET /pty/shells` (absent du SDK ⇒ `fetch` direct + `/pty` dans le proxy). Projeter aussitôt en `{value,label}`.
- `GET /config/providers` : `providers` = **tableau**, `models` = **carte** par fournisseur ⇒ pas de second appel.
- Fournisseur = **deux magasins** : clé par `PUT /auth/{id}`, `baseURL` par la config ; un fournisseur créé n'apparaît qu'au rechargement ⇒ la grille fusionne la config déclarée ; aucun `DELETE` sur `/config` ⇒ l'écran le dit **avant** le clic.
- Providers : grille cherchable puis détail (`providers.tsx`). Contrôle de choix = `picker.tsx`, **jamais un `<select>` natif**.

## Flux

- Fil mis à jour **en place** par le flux, pas par relecture REST ; écouter `/global/event` — `/event` est borné à un dossier (`middleware/workspace-routing.ts:86-88`).
- Deltas appliqués **au plus une fois par image** (`createLatestGate`, `stream-sync.ts`) : brancher `setMessages` sur un événement fige la page (75 deltas/s ⇒ image bloquée **12 388 ms**).
- `message.part.updated` porte `properties.part` ; `message.part.delta` = `{sessionID, messageID, partID, field, delta}` ; `message.updated` = `{sessionID, info}`. Lire `properties` comme la partie ⇒ `id` indéfini, événement ignoré, fil muet. Lecture par **étape** (`groupTurns`/`groupSteps`).
- Réponse d'agent en échec sans partie ⇒ afficher `turnError(turn)` (`view-model.ts`, première `info.error`).
- `question.asked` = seule écriture du fil ; réponse **positionnelle** `{answers: string[][]}`.
- SSE : `EventSource` ne rappelle **jamais** `onerror` sur une socket ouverte sans rien livrer ⇒ garder le watchdog (silence > 30 s = flux remplacé + reconnexion).

## Affichage

- **Jamais d'animation d'entrée** sur un bloc du fil (fusion dans le tour utilisateur ⇒ rejoue à chaque image) ; seule la ligne `.injections.injecting` est stable ; une boucle (`spinner`, `caret`) peut aller partout.
- ±lignes d'une écriture = `edit.state.metadata.filediff` **uniquement** ; `bash.state.output` = sortie complète ⇒ borner à 12 lignes + « show N more lines ».
- Barres de défilement : **une** règle globale (`*::-webkit-scrollbar`) et **un** mécanisme (`scrollbar-width` désactive `::-webkit-scrollbar` dans Chromium).
- Toute taille passe par un **jeton** ; un jeton référencé mais non défini **hérite en silence** ⇒ inventorier le **utilisé contre le défini**.
- Le rare ne s'affiche pas au repos ; une action de premier plan reste au pied du rail, pas dans un panneau de réglages.

## Pièges de code

- Deux compositeurs (`home-composer`, `composer-inner`) ⇒ **compter les sites d'appel** avant de corriger.
- Un composant peut exister **sans être monté** ⇒ grep l'usage **et** le CSS avant de conclure « ça n'existe pas ».
- Comparer deux chemins **par leur texte** est faux ⇒ normaliser (`pathKey`), garder l'original pour le serveur.
- Un bouton sans effet visible est **pire** qu'un bouton mort ⇒ mesurer l'**effet** (largeur rendue), pas l'état.

## Vérifier sans toucher la config réelle

Instance isolée 4097/5181 (XDG isolés, `bun.exe` en chemin absolu, proxy par `OPENCODE_SERVER_PORT`) ; elle meurt avec le shell qui l'a lancée ⇒ sonder les **deux** ports avant d'accuser le code.

## Feature

Suivre la skill `opencode-webui-feature` (native : `opencode-fork-feature` ; plugin : `opencode-plugin-feature`). Copie **en anglais** dans `packages/webui/src/*`, nombres selon la langue ; commentaires et intitulés de test en français.
