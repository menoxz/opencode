---
name: fork-server-api
description: API HTTP et configuration du serveur opencode — PATCH /config qui fusionne sans supprimer, SDK config.update, disabled_providers, prompts en file silencieuse, EOL CRLF/LF, ConfigMarkdown et cache gray-matter, erreur session_message.seq. Utiliser dès qu'on touche une route, la config, la base sqlite, un fournisseur ou un fin de ligne.
---

# API et configuration du serveur

## Config : ce qui persiste et ce qui ne s'efface pas

- `PATCH /config|/global/config` **fusionne** : un agent ajouté persiste, un agent omis n'est pas retiré, `model: null` est refusé ⇒ **aucune suppression par l'API**. Seul le fichier le permet, et un serveur en cours ne le relit pas.
- Corps **sur le fil** = `Config.Info` **à plat** (`groups/global.ts:102`) : `{disabled_providers:[…]}` écrit, `{config:{…}}` rend **200 et n'écrit rien**.
- SDK : `client.global.config.update({ config: { … } })` — le paramètre s'appelle `config`, le corps part à plat. Sans ce nom, corps vide ⇒ 200 pour une écriture nulle. `/config` (projet) **matérialise** un `config.json` ⇒ un panneau de réglages vise `/global/config`.

## Fournisseurs

Un abonnement mort (clé expirée, fonds épuisés) ⇒ `disabled_providers` : sinon ses modèles `discover` restent proposables, le composeur webui adopte le modèle de la dernière réponse de session, et l'erreur se répète à chaque envoi.

## Chemins et fichiers

- Paramètre contenant des `/` ⇒ `encodeURIComponent` ; un 200 sans vérifier le **corps** n'est rien (repli SPA).
- `GET /path` rend **deux** bases : `directory` = dossier d'instance, `worktree` = racine du projet ⇒ un chemin du dépôt se résout sous `worktree`. `GET /file/content` résout **sous la racine du projet** seulement (absolu ⇒ vide, hors projet ⇒ 500).
- SDK : `client.find.files()` (et **non** `find.file`), `client.file.read()` ; `GET /command` = **1,95 Mo** ⇒ projeter aussitôt.

## Veilleurs

- Fichiers : opt-in `OPENCODE_EXPERIMENTAL_FILEWATCHER=true` (défaut `false`) ⇒ redémarrage ; sans lui, aucune écriture externe n'émet d'événement.
- Hot-reload MCP : preuve d'armement = `service=mcp … MCP config watchers active` dans le log ; sans cette ligne, un changement de `mcp` n'agit qu'au redémarrage.

## Prompt en file

`prompt_async` rend **204 même quand aucun tour ne démarre** : session occupée ⇒ `PromptQueue` (`session/prompt.ts:1742-1789`), erreurs avalées (`handlers/session.ts:346-358`) ⇒ prompt **invisible** jusqu'au prochain tour. Ce n'est ni une panne ni un bug de l'UI.

## Fins de ligne

`src/cli/cmd/tui/routes/session/index.tsx` est commité en **CRLF** ⇒ ne pas le convertir ; vérifier `git diff --stat`. Un blob **LF** relu dans un arbre **CRLF** transforme une édition de 3 lignes en diff de 200 : `git ls-files --eol` (`i/lf w/crlf`) **avant** d'éditer, et écrire ces fichiers en LF — l'outil d'édition suit le fichier, pas le blob.

## ConfigMarkdown

`matter(t, {})` avec options explicites **obligatoire** : gray-matter 4.0.3 remplit son cache avant de parser (`index.js:47`), donc un YAML invalide y laisse l'objet vide et le parse suivant rend `{}` au lieu de lever ⇒ une skill chargée disparaît du catalogue au rechargement. Ne pas revenir à `matter(t)` seul.

## Base en avance sur le code

`500 NOT NULL constraint failed: session_message.seq` sur chaque invite ⇒ comparer `sqlite_master.sql` au DDL de `migration/*` ; recette de réparation réversible dans `docs/HARNESS.md`.
