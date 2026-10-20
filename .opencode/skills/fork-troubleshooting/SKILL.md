---
name: fork-troubleshooting
description: Ordre de diagnostic du fork quand une page pilotée est muette, qu'un port reste pris, ou qu'un navigateur ne répond pas — /json/list, santé des serveurs, CPU, sondes CDP bornées, Vite orphelin, dialogs natifs, console opencode.ai. Utiliser avant de suspecter le code devant un symptôme « rien ne se passe ».
---

# Dépannage — ordre de diagnostic

## Page pilotée muette

`/json/list` → santé des **deux** serveurs → CPU des processus, **avant** de suspecter le code : `Runtime.evaluate` peut expirer sur toutes ses requêtes alors que la page est saine.

## Sonde CDP

- Borner chaque appel (`Promise.race`), journaliser par étape.
- `scrollIntoView({block:'center'})` **puis** mesurer.
- Sonde **idempotente** ou repartir d'un rechargement.
- Capture = une **zone**, jamais la page entière (plein écran : 15 à 40 s).
- Activation utilisateur = `Input.dispatchMouseEvent`, pas `.click()` ; pour ouvrir ou sélectionner, `.click()` d'abord.

## Port pris

Vite : tuer le parent `bun` **ne tue pas** l'enfant `node …/vite.js`, qui garde le port ⇒ arrêter le processus `vite` lui-même.

## Dialogs

Jamais `window.confirm` dans du code piloté par navigateur : le dialogue survit à tout et rien ne le ferme côté agent.

## Console opencode.ai

Viser le **libellé exact**, liste noire `credit|pay|billing|delete|revoke`, sélecteurs bornés au `[role="dialog"]`.

## Server unreachable affiché à tort

Le sondage de santé peut afficher « server unreachable » pendant qu'un flux bloque la page : mesurer le CPU et le silence SSE (watchdog > 30 s) avant de conclure à une panne serveur.
