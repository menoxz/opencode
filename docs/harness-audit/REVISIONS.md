# Révisions exigées par les validateurs

Entrée de la vague 3. Chaque validateur a écrit ses corrections obligatoires dans son
verdict ; ce fichier en fait l'index. **Le verdict sur disque fait foi** — ce tableau
n'est qu'un aiguillage, il ne remplace pas la lecture du verdict.

## Résumé

| id | statut | corrections exigées | blocant pour l'implémentation |
|---|---|---|---|
| P01 | — | verdict non reçu | oui |
| P02 | `PASS_WITH_CHANGES` | section présente, format non numéroté | non |
| P03 | `PASS_WITH_CHANGES` | section présente, format non numéroté | non |
| P04 | `PASS_WITH_CHANGES` | 6 | **oui — 3 majeures** |
| P05 | `PASS_WITH_CHANGES` | 6 | non |
| P06 | `PASS_WITH_CHANGES` | 6 | non |
| P07 | `PASS_WITH_CHANGES` | 6 | non |
| P08 | `PASS_WITH_CHANGES` | 6 | **oui — R1 renversé** |
| P09 | — | verdict non reçu | oui |
| P10 | `PASS_WITH_CHANGES` | 4 | non |
| P11 | **`FAIL`** | 7 | **oui — proposition à reprendre** |
| P12 | — | verdict non reçu | oui |
| P13 | `PASS_WITH_CHANGES` | 2 | **oui — patch inexploitable tel qu'écrit** |
| P14 | — | verdict non reçu | oui |
| P15 | — | verdict non reçu | oui |
| P16 | `PASS_WITH_CHANGES` | 7 | non |
| P17 | `PASS_WITH_CHANGES` | 3 | non |
| P18 | `PASS_WITH_CHANGES` | 4 | non |
| P19 | `PASS_WITH_CHANGES` | 8 | non |
| P20 | — | verdict non reçu | oui |

## Les 4 blocages durs

### P04 — 3 objections majeures (verdict : `retry.ts:96-127` contredit la proposition)

1. Le plafonnement à 5 min casse le contrat de rate-limit, et l'argument « pas de 429 en
   cascade » est **une assertion non mesurée**. Pire : `GoUsageLimitError` a un quota
   **journalier** (`retry.ts:100-114` affiche « will reset in … day(s) ») — une fenêtre de
   plusieurs heures est **le cas nominal de ce dépôt**, pas un cas exotique. Le plafond la
   coupe en plein. Aggravant : la proposition **retire `retry.ts:114` et `:119-126`**, qui
   sont précisément l'information qui rendait la borne légitime.
2. Le compteur `attempt 10/10` est **arithmétiquement faux** : avec `RETRY_TOTAL_BUDGET_MS`
   le message produit `attempt 4/10`. **Le test 7 tel qu'écrit échoue.** La borne doit être
   en nombre de tentatives, pas en millisecondes.
3. Effort « S » faux : `auto-execute.ts:98-99` n'a ni provider ni parseur →
   `describeFailure` inexploitable sur ce site. Reclasser en `M` ou retirer le site.

### P08 — R1 renversé par le validateur

**Abandonner le défaut à 90 jours.** Basculer sur opt-in + census chiffré. La proposition
demandait « acceptez-vous qu'une installation standard supprime des sorties de plus de 90
jours, sans archive ? » ; le validateur répond non. Il faut aussi corriger le chemin
`exec` de R2a (confusion entre « `changes()` illisible » et échec réel) et passer l'effort
de `M` à `L`, R3 (compaction) devant devenir une proposition distincte.

### P11 — `FAIL`, proposition à reprendre

Sept corrections. Les trois qui commandent : reclasser l'effort (`L` si la cause doit être
supprimée), traiter l'auto-déverrouillage `out_of_scope` avant tout merge, et **corriger le
titre** — le type d'objectif n'est pas « choisi par le modèle », c'est `deliverable`, absent
par défaut. Deux cas de test manquants à ajouter, dont le DoD réécrit via `edit_objective`
après un refus.

### P19 — l'hypothèse centrale est réfutée par la base

L'agent a mesuré : **4 846 plans distincts sur 4 863 déclarations, 8 doublons exacts
(0,16 %)**. L'hypothèse « plans répétés » de la proposition est **infirmée par les
données**. Sept corrections restent, dont la réécriture du critère de test en grandeurs
monotones et le chiffrage du sacrifice avant fusion.

## Questions d'arbitrage humain (reportées telles quelles)

1. **P08** — accepter une suppression de données par défaut, sans archive ni export ?
2. **P11** — un DoD d'implémentation rédigé en termes d'observation doit-il bloquer sur un
   `critical` résiduel ? Si oui, il faut **typer les DoD** (effort L + migration ; ils sont
   aujourd'hui de simples `Schema.String`).
3. **P14** — l'aperçu est-il livrable sans filtre de secrets ? `grep metadata?.output` ne
   trouve **aucun** `redact`/`mask` sur le chemin `handle.all` → `preview()` →
   `metadata.output`. Le validateur doit trancher si le filtre est un préalable.
4. **P09 / P17** — qui possède l'invariant « la sortie complète existe sur disque »,
   `shell.ts` ou `terminal-output.ts` ?

## Résidus déjà consignés par les rédacteurs

`P06-F1` (chemin `goal-contract.ts` — corrigé dans `README.md`), `P06-F2` (accès à
`goalState` dans `processCompaction` non établi), `P08-R2B` (parts `reasoning` non bornées,
50 % d'une session), `P08-TESTS-EXISTANTS` (`maintenance.test.ts:139-147` encode la décision
renversée et devra être réécrit), `P09-UNBOUNDED-ARTIFACT-SIZE` (`trunc.write` n'applique
aucune borne de taille).