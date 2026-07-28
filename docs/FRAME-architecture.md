# FRAME — Une architecture de raisonnement par cadrage, ancrage et escalade

> **Statut :** Proposition de recherche (v1.0)
> **Type :** Document d'architecture (ADR étendu)
> **Langue :** FR
> **Thèse centrale :** *La limite dominante de la qualité d'une réponse — humaine ou
> machine — n'est pas la capacité logique, mais la **couverture du cadrage** :
> les hypothèses et points de vue qu'un raisonneur ne pense pas à vérifier.*

---

## 0. Résumé exécutif

La mode actuelle du **multi-modèles en fusion** (un prompt envoyé à deux modèles,
un troisième juge la réponse) affiche de bons résultats sur les benchmarks. Nous
soutenons que ce gain est **en grande partie une illusion durable d'amélioration** :
il repose sur une hypothèse — la décorrélation des erreurs — qui s'érode à mesure
que les modèles convergent, et il paie un surcoût de calcul (≈ 3×) rarement
justifié en production.

Le vrai mécanisme qui fonctionne n'est pas « plus de cerveaux qui calculent », mais
**plus de cadrages différents** combinés à un **contact avec le réel**. FRAME
internalise la diversité de cadrage dans un seul modèle (coût ≈ 1×), tranche par la
**vérification dans le réel** plutôt que par une autre opinion, et ne paie la
diversité externe coûteuse que **sur preuve de besoin**.

**En une phrase :** *un modèle qui cadre bien, le réel qui tranche, et la diversité
externe seulement quand le réel ne peut pas trancher.*

---

## 1. Le nom

**FRAME** — choisi parce que notre thèse est que la limite est le *cadrage*. C'est
aussi l'acronyme exact des cinq mécanismes :

| Lettre | Mécanisme (EN) | Rôle |
|---|---|---|
| **F** | **F**rame (cadrage multi-hypothèses) | Énumérer hypothèses et points de vue avant de répondre |
| **R** | **R**efute (auto-critique adverse) | Attaquer sa propre réponse pour révéler ses faiblesses |
| **A** | **A**ssess (décision routée) | Router selon confiance × enjeu × vérifiabilité |
| **M** | **M**easure against reality (ancrage) | Ancrer la vérification dans des faits exécutables/sourcés |
| **E** | **E**scalate (escalade décorrélée) | N'invoquer une diversité externe que sur preuve de besoin |

---

## 2. Contexte et problème

### 2.1 Ce qui est réel dans la fusion (à conserver)

- **Décorrélation des erreurs.** Deux modèles différents se trompent
  différemment ; si les erreurs sont indépendantes, un vote les filtre (théorème
  du jury de Condorcet). Mathématiquement solide — *tant que* l'indépendance tient.
- **Écart génération↔vérification.** Vérifier est souvent plus facile que produire.
  Un juge peut sélectionner la bonne réponse sans savoir la générer. Structurel
  et durable.

### 2.2 Ce qui est illusoire ou fragile (à ne pas ériger en défaut)

- **Corrélation croissante.** Architectures, données et distillation se
  ressemblent de plus en plus → erreurs corrélées → **les gains de l'ensemble
  s'effondrent**. La promesse de la fusion se dégrade avec le temps.
- **Biais du juge.** Biais de position, de verbosité, préférence pour soi-même ;
  contamination des benchmarks. Une part des gains rapportés est gonflée.
- **Coût.** ≈ 3× le calcul pour un gain marginal. À budget égal, un seul modèle
  plus fort qui réfléchit plus longtemps bat souvent l'ensemble.

### 2.3 Le recadrage décisif

Le mode d'échec dominant — humain comme machine — n'est presque jamais une erreur
de logique. C'est un **échec de cadrage** : un angle non pris, une hypothèse non
posée, un point de vue non vérifié (les « inconnues inconnues »).

Conséquence : **le bénéfice du multi-modèles vient de la diversité de cadrage, pas
de la multiplicité de calcul.** Donc on peut en capturer l'essentiel dans un seul
modèle — *sauf* le seul morceau non-illusoire : la décorrélation des angles morts,
qui exige une diversité réellement externe.

### 2.4 La limite de « tout énumérer »

On ne peut pas énumérer *toutes* les hypothèses : l'espace est non borné. Le
problème ne disparaît pas, il **se déplace** vers « générer les bonnes hypothèses
et élaguer » — ce qui demande la même intelligence. Pire : un modèle qui énumère
ses *propres* hypothèses partage ses *propres* biais. Il a **un angle mort sur ses
angles morts**. L'auto-énumération ne peut pas voir ce qu'elle est structurellement
incapable de voir. C'est précisément là, et seulement là, qu'une diversité externe
décorrélée garde une valeur irréductible.

---

## 3. Principe directeur

> Maximiser la **diversité de cadrage** au coût minimal, **ancrer la vérification
> dans le réel** plutôt que dans une autre opinion, et **n'escalader vers une
> diversité externe coûteuse que sur preuve de besoin.**

Tout le reste découle de ce principe.

---

## 4. Vue d'ensemble de l'architecture

FRAME est un pipeline à **trois étages activés progressivement**. Le coût n'augmente
que lorsque l'enjeu ou le désaccord le justifient.

```
                    ┌─────────────────────────────────────────┐
   prompt  ───────► │  ÉTAGE 1 — CADRAGE (1 seul modèle)       │
                    │  • énumère hypothèses + points de vue    │
                    │  • réponse + auto-critique adverse       │
                    │  • s'auto-note: confiance + angles morts │
                    └───────────────┬─────────────────────────┘
                                    │ confiance haute & vérifiable ?
                          ┌─────────┴─────────┐
                       OUI│                   │NON / enjeu élevé
                          ▼                   ▼
              ┌───────────────────┐  ┌──────────────────────────┐
              │ ÉTAGE 2 — RÉEL    │  │ ÉTAGE 3 — ESCALADE        │
              │ contact réel:     │  │ diversité EXTERNE réelle: │
              │ • exécuter test   │  │ • 2e modèle décorrélé     │
              │ • requêter donnée │  │   (archi/données ≠)       │
              │ • citer source    │  │ • ou outil spécialisé     │
              │ • compiler/lint   │  │ • ou humain               │
              └─────────┬─────────┘  │ juge = critères explicites│
                        │            │  + RE-ANCRAGE obligatoire │
                        │            └─────────┬─────────────────┘
                        └──────────┬───────────┘
                                   ▼
                              réponse + traçabilité
                       (hypothèses, vérifs faites, confiance)
```

---

## 5. Les étages en détail

### 5.1 Étage 1 — Cadrage (toujours actif, coût ≈ 1×)

Un **seul** modèle fort, discipliné par un protocole strict :

1. **Énumérer les hypothèses et points de vue** avant de répondre. Capture
   l'essentiel du bénéfice « plusieurs cerveaux » sans le surcoût.
2. **Réponse + auto-critique adverse** : « où cette réponse échoue-t-elle ?
   quel cas limite la casse ? quel point de vue n'ai-je pas pris ? »
3. **Auto-évaluation** : niveau de confiance + déclaration explicite de *ce qui
   n'a pas pu être vérifié*.

C'est le cœur économe de l'architecture : gros gain, coût marginal.

### 5.2 Étage 2 — Réel d'abord (par défaut si vérifiable, coût faible)

Le levier le plus durable, négligé autant par la fusion que par l'énumération :
**vérifier contre la réalité, pas contre un avis.**

| Nature de la réponse | Ancrage |
|---|---|
| Code | exécuter, compiler, linter, lancer les tests |
| Fait | citer une source vérifiable |
| Calcul | outil déterministe |
| Donnée | requêter la source de vérité |

**Règle non négociable :** une réponse *vérifiable* doit être ancrée avant sortie.
Le réel corrige plus d'erreurs que n'importe quel jury d'opinions.

### 5.3 Étage 3 — Escalade décorrélée (rare, coût 2-3×, sur preuve)

On ne paie la diversité externe **que** sur déclencheur mesurable :

- confiance Étage 1 basse, **ou**
- l'auto-critique a révélé un angle mort qu'elle ne peut lever seule, **ou**
- enjeu élevé (irréversible, sécurité, argent), **ou**
- réponse **non vérifiable** (ni test ni source possibles) — c'est exactement là
  que l'opinion d'un pair décorrélé reprend toute sa valeur.

Deux exigences :

- **Décorrélation réelle.** Le second raisonneur doit différer par
  l'architecture/les données. Un clone partage les angles morts et n'apporte rien
  (le piège « illusion »).
- **Jugement explicite + ré-ancrage.** Le juge n'évalue pas « lequel est mieux ? »
  mais un **jeu de critères explicites**, et toute réponse retenue **repasse par
  l'Étage 2** quand c'est possible.

---

## 6. Le routeur de décision (le cœur)

| Signal | Action | Coût |
|---|---|---|
| Confiance haute + vérifiable | Étage 1 → 2, sortir | ≈ 1× |
| Vérifiable mais peu sûr | Étage 2 (le réel tranche, pas un 2e avis) | faible |
| Non vérifiable + enjeu faible | Sortir avec confiance déclarée | ≈ 1× |
| **Non vérifiable + enjeu élevé** | **Étage 3 : diversité décorrélée** | 2-3× |
| Angle mort structurel détecté | Étage 3 ciblé | 2-3× |

**Insight clé :** la fusion multi-modèles **n'est pas l'architecture** — c'est une
*branche d'escalade rare*, réservée au seul cas où elle garde une valeur
non-illusoire : l'absence de vérification possible par le réel.

Le routeur s'implémente d'abord comme **règle déclarative** sur
`confiance × enjeu × vérifiabilité`, avant tout recours à du ML.

---

## 7. Alternatives considérées et rejetées

| Alternative | Pourquoi rejetée comme défaut | Statut dans FRAME |
|---|---|---|
| **Fusion systématique** (2 modèles + juge, toujours) | 3× le coût ; gains qui s'effondrent avec la corrélation ; biais de juge | Reléguée à l'Étage 3 (escalade rare) |
| **« Un seul modèle énumère tout »** | Espace d'hypothèses non borné ; angle mort sur ses propres angles morts | Gardée comme Étage 1, jugée insuffisante seule |
| **Self-consistency** (N tirages du même modèle, vote) | Réduit le bruit, pas l'angle mort systématique | Optionnel, marginal |

---

## 8. Risques, coûts et limites

- **Le routeur est le maillon faible.** Un modèle mal calibré (sur-confiant)
  n'escalade pas quand il faut. → *Mitigation :* calibrer le seuil sur des cas
  étiquetés ; biaiser vers l'escalade sur enjeu élevé, indépendamment de la
  confiance déclarée.
- **L'Étage 2 suppose un ancrage possible.** Les questions non vérifiables
  tombent en Étage 3, qui coûte. FRAME n'est économe que si une part suffisante
  des requêtes est ancrable.
- **Complexité opérationnelle.** Trois étages, un routeur, des outils. Justifié
  seulement si le volume/enjeu le mérite ; pour l'usage trivial, l'architecture
  **dégénère proprement en « Étage 1 seul »**.
- **Angle mort résiduel.** Même l'Étage 3 ne voit que ce que sa diversité permet
  de voir. FRAME réduit le risque, ne l'annule pas. Honnêteté épistémique : aucune
  architecture ne garantit la couverture complète.

---

## 9. Mesure et validation

Ne pas mesurer « l'accuracy brute », mais les bons KPI :

1. **% d'erreurs rattrapées par l'Étage 2** (valeur du grounding).
2. **Taux d'escalade vers l'Étage 3.** Trop haut → Étage 1 trop faible ou grounding
   absent. Quasi nul → routeur sur-confiant.
3. **Coût moyen par requête** à qualité constante.
4. **A/B honnête à budget de calcul égal** : FRAME vs. fusion systématique vs.
   modèle seul. Comparer à budget inégal fausse le verdict.

---

## 10. Feuille de route

1. **Spécifier le contrat de sortie de l'Étage 1** : schéma imposé (hypothèses,
   réponse, auto-critique, confiance, vérifiabilité). *Test :* la sortie respecte
   le schéma.
2. **Implémenter le routeur déclaratif** sur `confiance × enjeu × vérifiabilité`.
   *Test :* jeu de cas étiquetés.
3. **Brancher l'Étage 2** sur les vérificateurs disponibles (exécuteur de tests,
   recherche sourcée, outils déterministes).
4. **Définir le protocole d'Étage 3** : sélection d'un pair décorrélé, grille de
   critères du juge, ré-ancrage obligatoire.
5. **Instrumenter les KPI** de la section 9 et lancer l'A/B à budget égal.

---

## 11. Conclusion

FRAME rend opérationnelle une thèse simple : *la limite n'est pas la logique, c'est
la couverture du cadrage.* Il en tire une architecture qui n'est ni « plusieurs
modèles qui votent toujours » ni « un modèle qui prétend tout énumérer », mais une
**escalade disciplinée** : cadrer largement à coût faible, laisser le réel trancher,
et ne convoquer la diversité externe que là où le réel est muet — c'est-à-dire au
seul endroit où la fusion n'est pas une illusion.

---

*Document de recherche — FRAME v1.0. Fruit d'une réflexion conjointe sur les limites
des architectures de fusion multi-modèles.*
