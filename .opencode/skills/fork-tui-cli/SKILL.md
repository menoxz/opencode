---
name: fork-tui-cli
description: Règles du TUI et du CLI opencode — rendu bash borné, badge QUEUED/STEER, annulation d'une file (withdrawableUserID), inspect_batch replié, exit code par toolExitCode, retry 408/425/429, capture tui-shot sur copie VACUUM INTO, rebuild après src/**. Utiliser dès qu'on modifie un composant du TUI, une commande CLI ou l'affichage d'un résultat d'outil.
---

# TUI et CLI

## Routes et thème

Route standard = `routes/session/index.tsx` (**CRLF**, ne pas convertir). Deux crans d'opacité **dérivés du thème** (`theme.textLow`), jamais un gris figé.

## Rendu d'un outil

- bash : commande bornée à 1 ligne + `· +N lines`, sortie par la **fin** (5 lignes), un même clic déplie les deux ; jamais de troncature de caractères.
- `inspect_batch` : une ligne repliée `inspect_batch · N actions ▸`, chevron seulement s'il y a à révéler.
- `run` : `TOOL_RULES.bash.view.final` reste `true` (sinon `exit 1` s'affiche comme un succès) ; code de sortie par `toolExitCode`, partagé par le texte **et** la couleur.

## File de prompts

- Le badge `QUEUED` se décide par le **statut**, jamais en retirant la visibilité ; `STEER` par `metadata.steer` seulement.
- Annuler une file/un steer : `session.revert` sur un message **non servi** est une **suppression** (`withdrawableUserID`, `session/prompt-queue.ts` → `SessionRevert.withdraw`), jamais un revert avec snapshot — `assertNotBusy` rendait l'appel impossible pendant que le prompt existait, et un `void` côté TUI faisait passer le refus pour une annulation. Tout message non servi au-delà de la cible part avec elle.

## Retry

408/425/429 et erreurs de transport réessayés, `AbortError` jamais, plafond 10 ; délai **serveur** non plafonné et pas de reprise après facturation (`docs/HARNESS.md`).

## Preuve visuelle

`bun packages/opencode/script/tui-shot.ts --session <id> --db <copie> --wait 45` — ~15-20 s avant la première peinture, une trame plus tôt est vide ; base = **copie** `VACUUM INTO`, jamais la vraie.

## Build

`packages/opencode/src/**` ⇒ rebuild + redéploiement (skill `fork-build`) ; les fragments de prompt sont **embarqués** dans le binaire ⇒ même contrainte.
