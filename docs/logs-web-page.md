# Logs web — page `/logs`

Page HTML **autonome** servie par le serveur `opencodev2`, volontairement indépendante
de l'UI web embarquée (`packages/app`). C'est un document unique (pas de bundler, pas de
framework) qui lit l'API HTTP publique et affiche, pour chaque session :

- la **trajectoire brute** : tous les messages et toutes les parties, y compris les parties
  synthétiques que le transcript masque ;
- le **contexte injecté** : provenance des instructions (fichiers AGENTS.md), et sections
  `core` / `env` / `instructions` / `skills` avec leur taille réelle et l'indicateur de troncature.

Elle s'appuie uniquement sur `GET /session` et `GET /session/{id}/message`, donc elle
fonctionne contre n'importe quelle version du serveur exposant ces deux routes.

## Accès en 3 étapes

1. **Avoir un serveur en marche** (binaire installé) :

   ```powershell
   & "$env:APPDATA\npm\opencodev2.exe" serve --port 4096 --hostname 127.0.0.1
   ```

   Le port est libre : n'importe quel port libre convient. `4096` sert à la fois l'UI web
   embarquée et `/logs`. En développement, l'équivalent est `bun dev:serve` à la racine du dépôt.

2. **Ouvrir la page** :

   ```
   http://127.0.0.1:4096/logs
   ```

   Sans paramètre, la page liste les sessions et affiche la trajectoire + le contexte injecté.
   `/logs` est servi directement en HTML (`content-type: text/html`) sans le bundle de l'UI,
   donc il est léger et n'entre pas en conflit avec la route attrape-tout de la Web UI.

3. **Cibler une session précise** (optionnel) :

   ```
   http://127.0.0.1:4096/logs?session=<sessionID>
   ```

   `<sessionID>` a la forme `ses_...` (visible dans le TUI ou dans `GET /session`). La page
   possède aussi un champ de filtre pour retrouver une session à la souris.

## Vérification rapide (sans navigateur)

```powershell
curl.exe -s -o NUL -w "%{http_code} %{content_type}`n" http://127.0.0.1:4096/logs
# attendu : 200 text/html; charset=utf-8
```

## Repères dans la page

- Bloc `CONTEXT · injected prompt context` : sections `core`, `env`, `instructions`, `skills`.
  Chaque section est dépliée par défaut ; la ligne de résumé affiche le libellé, le nombre de
  caractères et, le cas échéant, un marqueur `truncated` (taille réelle > contenu stocké).
- Bloc `INJECT · instructions` : liste des fichiers d'instructions injectés (`Instructions from:`).
- La trajectoire affiche les parties mêmes masquées du transcript (ex. porteur de contexte),
  ce qui en fait un journal fidèle plutôt qu'un rendu utilisateur.

## Bon à savoir

- La page est **pilotée côté client** : elle interroge l'API au chargement. Sur une très grosse
  session (plusieurs centaines de messages volumineux), le rendu peut prendre quelques secondes.
- Les porteurs de contexte persistés **avant** la version 2.3.36 gardent la limite de stockage
  historique (8000 caractères par section) ; seuls les messages postérieurs au déploiement
  stockent le contenu intégral. La page affiche dans ce cas le marqueur `truncated` avec la
  taille réelle, donc l'écart reste visible et explicite.
