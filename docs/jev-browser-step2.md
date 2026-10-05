# jev-ultrafast, étape 2 — la décision branchée sur une vraie page

Ce que livre cette étape, ce que ça a coûté, et ce qui reste à prouver.
Étape 1 (politique pure, verrou Command Code) : voir `docs/jev-ultrafast-browser-usage.md`.

## Ce qui est en place

`snapshot.ts` ferme la boucle entre le pilote de navigateur et la politique, en
n'emportant qu'une chose : le `uid` que le pilote publie déjà sur chaque snapshot.

- `toElements` transforme les entrées d'un snapshot d'accessibilité en table
  indexée, dans l'ordre du snapshot, en écartant ce que le pilote ne peut pas
  piloter (pas de `uid`, rôle structurel, `actionable: false`).
- `bind` réassocie chaque index au `uid` dont il vient, et **refuse** de
  fonctionner si les deux listes divergent : c'est la dérive détectée.
- `plan` transforme une décision validée en action de pilote —
  `click` / `fill` / `scroll` / `wait` / `done` / `blocked` — ou en `retry`.

Deux propriétés tenues par construction, pas par convention :

1. **Le modèle n'adresse pas la page.** Il renvoie un index dans la table
   observée ; l'index ne devient un `uid` qu'après validation. Aucun sélecteur,
   aucune coordonnée, aucune expression ne peut sortir de ce chemin.
2. **Aucune valeur n'est inventée.** `TYPE_TEXT` produit `{kind:"fill", uid}`,
   sans `value`. Le texte à taper appartient à la boucle, pas au modèle de
   décision — sinon la couche politique écrirait dans la page au nom du modèle,
   ce qui est précisément la ligne à ne pas franchir.

Le reste de la politique est inchangé : l'espace d'action, la validation argmax et
l'abstention motivée viennent de l'étape 1, et `policy.ts` compose le tout sans
être modifié.

## Mesure sur une page réelle, pas sur une théorie

`script/jev-browser-step.ts` prend un snapshot, construit l'espace d'action, pose
**une** requête, valide, et publie l'action résultante avec ce qu'elle a coûté.
Fixture : `script/fixtures/flights-search.json`, 21 entrées dans la forme du
pilote (18 actionnables après filtrage).

```
PAGE Google Flights https://www.google.com/travel/flights?hl=en
GOAL Book a one-way flight from Zurich to London on September 20, 2026 for one adult in economy.
ELEMENTS 16
QUESTIONS 4 / 20
CALL endpoint=https://api.commandcode.ai/provider/v1/systemone model=typesafe/jev
     status=200 elapsed_ms=764 request_bytes=5985 in_tokens=2840 out_tokens=473
DECIDED operation=SELECT confidence=0.5900
ACTION {"kind":"click","uid":"e2","reason":"click the combobox \"Trip type\""}
```

Ce que dit cette mesure, et ce qu'elle ne dit pas.

**Elle dit** que le chemin complet fonctionne sur une page réelle : une requête,
4 questions, 764 ms, 2 840 tokens d'entrée, une décision validée, une action dont
le `uid` existe dans le snapshot. Et que la décision est *bonne* : sur une
recherche de vol aller simple, cliquer d'abord sur « Trip type » est le
préalable — `One way` n'est pas encore coché dans l'observation. La confiance est
0.59, ce qui est honnête pour un premier pas ambigu.

**Elle ne dit pas** que la politique est plus rapide ou moins coûteuse que la
boucle LLM existante. 764 ms et 2 840 tokens sont les chiffres d'**une** décision
sur **une** page, sans comparaison. Le gain revendiqué par l'amont (−25 % de
tokens, 1 092 → 101 appels protocole) n'est toujours pas confirmé : l'amont écrit
lui-même que son test de significativité vaut p = 0.25 sur 3 paires, et le
1 092 → 101 est mesuré dans sa boucle CDP brute, pas derrière chrome-devtools-mcp.

Et le fan-out coûte plus qu'il ne rend : trois têtes ont coûté 7 942 tokens
d'entrée contre 5 354 pour deux. Sur cette page, il n'apporte rien — une seule
cible par opération suffirait. Il reste utile quand le même index doit être jugé
sous deux opérations à la fois ; il faudra mesurer si ce cas existe vraiment chez
nous avant de le payer par défaut.

## Ce qui manque, et c'est honnête

**La boucle n'a pas tourné sur une vraie page.** Chrome était injoignable
(`http://127.0.0.1:9223/json/version`, fetch failed) et je ne lance pas un
navigateur protégé sans votre accord. La fixture est un snapshot écrit à la main
dans la forme du pilote : elle prouve le chemin de décision, pas la découverte des
éléments. Reste à faire : la boucle `décider → plan → piloter → re-observer`, avec
re-décision à chaque observation, sur une vraie page.

**Le lecteur DOM n'est pas écrit.** C'est lui qui produit le `uid`, et il reste
hors de ce port. Tant qu'il appartient au pilote, la couverture se limite à ce que
le pilote sait piloter : shadow roots, frames, canvas, upload et onglets multiples
restent hors de portée.

## Reste ouvert

- La boucle sur une vraie page, avec mesure comparative contre la boucle LLM
  existante. C'est la seule chose qui-Saura dire si cette politique vaut son coût.
- `snapshot.js` de l'amont (lecture DOM atomique, identifiants de nœuds réels),
  si et seulement si la boucle se justifie.
- Décider si le fan-out doit être activé par défaut — les mesures actuelles
  plaident pour non.