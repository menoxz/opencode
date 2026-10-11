# Fiche item — gabarit

Copier en `items/<ID>.md` (ex. `items/H3.md`) au démarrage de l'item. Suivre **exactement**
ces 10 sections, dans cet ordre. Un validateur rejette une fiche incomplète.

## 1. Problem

Une phrase. Le défaut observé, sans jargon et sans nom de solution.

## 2. Evidence

Citations `fichier:ligne` obligatoires, extrait court (≤ 8 lignes) par citation.
Toute affirmation sans citation est invalide. Une inférence est marquée `INFERE:` avec sa
méthode de vérification.

## 3. Mechanism

Le chemin d'exécution de bout en bout qui produit le défaut — citer chaque étape, pas une
description.

## 4. Proposal

Le correctif en français. Préciser :
- fichiers modifiés, fonctions, comportement qui change ;
- code cible (≤ 15 lignes) en diff ou bloc TypeScript quand il est court ;
- ce qui reste **volontairement** inchangé, et pourquoi.

## 5. Alternatives considered

Au moins 2 options écartées, avec la raison du rejet.

## 6. Risks

Obligatoirement :
- régression possible sur les tests existants (nommer les fichiers) ;
- coût tokens / latence ajouté, chiffré ;
- risque de sécurité (injection, contournement de permission).

## 7. Acceptance (critère monotone)

Le critère d'acceptation **absolu** (jamais un ratio dont le dénominateur est une grandeur
que le patch fait baisser). Indiquer la commande de mesure et la valeur attendue, comparée
à `../BASELINE.md`.

## 8. Tests

Plan exécutable : chemin exact du test sous `packages/opencode/test/`, commande exacte
(`bun test --timeout 30000 …`), critère de succès observable. Inclure un test par mutation
quand le correctif est un cache ou un garde (prouver que l'invalidation marche).

## 9. Effort

`XS | S | M | L` + une phrase de justification.

## 10. Verdict self-assessment

`READY | NEEDS_REVIEW` et, si `NEEDS_REVIEW`, la question précise à trancher par le
validateur.
