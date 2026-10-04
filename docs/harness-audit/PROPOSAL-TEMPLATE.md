# Gabarit imposé — proposition de solution

Tout fichier de proposition doit suivre EXACTEMENT ces 9 sections, dans cet ordre.
Les titres sont literals. Un validateur rejette toute proposition qui les manque.

## 1. Problem

Une phrase. Le défaut observé, sans jargon et sans nom de solution.

## 2. Evidence

Citations `fichier:ligne` obligatoires. Extrait court (<= 8 lignes) par citation.
Toute affirmation sans citation est interdite. Si une affirmation est inférée, le marquer
`INFERE:` et dire comment la vérifier.

## 3. Mechanism

Comment le code produit le défaut. Le chemin d'exécution de bout en bout, pas une description.
Citer chaque étape.

## 4. Proposal

Le correctif proposé, en français. Décrire précisément :
- quels fichiers sont modifiés, quelles fonctions, quel comportement change ;
- le code cible quand il est court (<= 15 lignes) sous forme de diff ou de bloc TypeScript ;
- ce qui reste volontairement inchangé, et pourquoi.

## 5. Alternatives considered

Au moins 2 options écartées, avec la raison du rejet. Une proposition qui ne présente
aucune alternative est incomplète.

## 6. Risks

Ce que le correctif peut casser. Inclure obligatoirement :
- le risque de régression sur les tests existants (nommer les fichiers de test concernés) ;
- le coût en tokens / latence ajouté, chiffré ;
- tout risque de sécurité (injection, contournement de permission).

## 7. Tests

Plan de test exécutable et vérifiable :
- le test unitaire à écrire, avec son chemin exact sous `packages/opencode/test/` ;
- la commande exacte pour l'exécuter ;
- le critère de succès observable.

## 8. Effort

`XS | S | M | L` + une justification en une phrase.

## 9. Verdict self-assessment

`READY | NEEDS_REVIEW` — et si `NEEDS_REVIEW`, la question précise que le validateur doit trancher.