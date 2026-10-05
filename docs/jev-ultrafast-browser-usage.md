# jev-ultrafast pour les usages navigateur du fork — avis et plan de port

Source analysée : https://github.com/browser-use/jev-ultrafast (MIT), lisant `agent.py`,
`model.py`, `browser.py`, `snapshot.js`, `questions.py`, `docs/performance.md`, `pyproject.toml`.
Métadonnées lues via l'API GitHub : créé 2026-09-16, dernier push 2026-09-30, 4 437 Ko,
dépendance unique `browser-harness==0.1.13`, 190 issues ouvertes.

## Avis

**À adopter pour la forme, à refuser en tant que paquet.** Le gain réel du projet est
architectural — un espace d'action dynamique indexé, une seule requête System One par cycle de
décision, aucun screenshot dans la boucle, un petit LLM qui n'écrit que lorsqu'il faut taper du
texte. Cette forme est portable et colle exactement au client Jev déjà présent dans le fork.
Le paquet Python, lui, est un prototype MVP : son DOM reader ne couvre ni les shadow roots, ni les
frames, ni canvas, ni les uploads, ni les onglets multiples, et il ne sait pas faire ce que le fork
fait déjà (choisir un outil, un skill, route une requête) — il faudrait le réécrire en TS/Effect de
toute façon.

Deux réserves sur les chiffres, à garder en tête avant de promettre une vitesse :

- `performance.md` compare 3 paires sur **une seule tâche** (Google Flights) et l'écrit lui-même :
  *sign-test p = 0.25*. Le « −25 % » est un signal, pas une garantie.
- Les 22 000 étoiles pour un dépôt de 14 jours ne sont pas un indicateur de maturité technique.
  190 issues ouvertes non plus.

## Ce qui est vérifié chez nous

Sonde live exécutée contre le endpoint réellement configuré (`provider = command-code`,
`https://api.commandcode.ai/provider/v1/systemone`, modèle `typesafe/jev`), avec une table
d'éléments observés de 62 entrées façon espace d'action de jev-ultrafast :

| Propriété vérifiée | Résultat observé |
| --- | --- |
| Une seule requête renvoie opération **et** cible | oui (`operation` + `click_target`) |
| Tête opération, 7 options, probabilités normalisées | somme = 1.00 |
| Tête cible, 62 options, probabilités normalisées | somme = 0.99 / 1.00 |
| `choice` == argmax des probabilités | oui (indispensable pour `validate_choice`) |
| Élément retenu | `[2] Where from?` — cohérent avec un goal « Zurich → London » |
| Fan-out spéculatif : 3 têtes dans **une** requête | oui, les 3 têtes répondent |

Donc la charge technique du projet — la seule requête à choix multiples avec cibles par opération —
fonctionne bien sur notre fournisseur. `TYPESAFE_API_KEY` de l'environnement renvoie 401 sur
`api.typesafe.ai` ; le preset `command-code` et sa clé dédiée sont le chemin qui fonctionne.

Latence : non mesurée de façon fiable chez nous (la sonde l'expose mais mes extracted runs ne
l'ont pas rendue de façon stable). Chiffre du dépôt à titre indicatif : médiane 178 ms par requête.

## Ce qu'il faut prendre

1. **L'espace d'action dynamique.** Chaque observation produit une table `[1] button … [2] combobox …`
   et les questions `choice` sont construites *à partir de cette table*, jamais d'une liste fixe
   d'outils. C'est exactement la même idée que `src/jev/tools.ts`, appliquée à une page.
2. **La validation de la réponse.** `validate_choice` refuse la réponse si `choice` n'est pas
   l'argmax, si les probabilités ne somment pas à 1 (±0.02), si un id n'est pas dans `ids`.
   À porter tel quel : c'est la garde qui empêche une décision fantôme.
3. **Le rejeu après page périmée.** Fingerprint `page_key` + `guards` ; si la page a bougé entre
   l'observation et le clic, on re-observe au lieu de cliquer à l'aveugle.
4. **Le texte par un modèle séparé.** La décision reste un choix ; seule la *valeur* à taper est
   générée. Notre fork sait déjà appeler un modèle de texte OpenAI-compatible.

## Ce qu'il faut laisser

- **Le paquet Python et `browser-harness`.** Notre navigateur est le serveur MCP
  `chrome-devtools-mcp` (`brave_mcp\chrome-devtools-mcp-local\start.js`, Puppeteer). On ne remplace
  pas ça par un démon Python dans le même tour.
- **`validate_choice` comme preuve de réussite.** Un `DONE` choisi n'est pas une vérification. Le
  projet le dit ; il faut le garder dans la conception.
- **La promesse de 1 092 → 101 appels protocole.** C'est mesurée *à l'intérieur* de la boucle CDP
  brute. Tant qu'on passe par les outils MCP, ce chiffre ne se transposera pas. Le gain qui se
  transpose, c'est le nombre de requêtes LLM par décision.

## Plan de port

Étape 1 — la politique, sans navigateur. Nouveau sibling dans `src/jev/` :

```
src/jev/action-space.ts   # (page, goal, history) -> { elements, questions }
src/jev/validate.ts       # argmax + normalisation + ids, l'utilisateur JevSchema
```

Une seule requête `JevClient.decide` avec `questions.operation` + une tête `<op>_target` par
opération. Sûr par construction quand la clé est absente : le policy layer ne remplace rien, il
n'ajoute que des questions. Tests sur `questions` et `validate` uniquement, offline.

Étape 2 — l'exécution. Brancher sur l'outil `web-browser_*` existant pour validating la boucle
(uid stables, pas de CDP brut). On mesure : nombre de requêtes Jev par décision, étapes pour un
goal simple, taux de `DONE` prématurés.

Étape 3 — seulement si l'étape 2 tient. Snapshot DOM atomique et exécution CDP directe, en
portant `snapshot.js` tel quel (une seule lecture de page, des identifiants de nœuds réels,
jamais un sélecteur venu du modèle). C'est là que se trouve le gain de temps, et c'est aussi là
que se trouve le risque : il faut réimplémenter les gardes d'occultation et de géométrie.

Ce qu'il ne faut surtout pas faire : laisser la sortie du modèle devenir un sélecteur, une
coordonnée ou du JavaScript exécutable. Le projet tient cette ligne ; il faut la tenir aussi.

## Limites assumées

DOM reader limited aux contrôles HTML/ARIA courants. Shadow roots, frames, canvas, uploads,
nouvel onglet, scroll imbriqué, widgets clavier arbitraires : hors périmètre. Sur les pages
réellement complexes, il faudra retomber sur la boucle LLM classique du fork.

## Décision demandée

Deux options, pas plus :

- **A** — port TS/Effect de la seule politique (étape 1 puis 2), `web-browser_*` inchangé.
  Différenciation faible, risque faible, réversible.
- **B** — port complet avec exécution CDP native (étape 1 à 3), ce qui suppose de Court-circuiter
  le serveur MCP pour les usages navigateur. Différenciation forte, surface de risque nettement
  supérieure.

Je recommande **A** d'abord : la sonde live montre que la forme fonctionne chez nous, mais rien
n'a encore mesuré ce qu'elle vaut sur nos pages réelles.