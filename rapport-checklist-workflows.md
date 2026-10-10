# Validation — checklist workflows BPMN (GNSPD / Camunda 7)

- Date : 2026-09-30 12:48:48
- Cibles : C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\bpmn-to-be-autorisation-promotion-commerciale.bpmn
- Fichiers analysés : 1 · ignorés : 0
- Constats : 0 bloquant(s), 43 avertissement(s)

## Règles de la documentation appliquées

| Règle | Sévérité | Occurrences | Libellé | Source |
|---|---|---|---|---|
| CHK-B01 | bloquante | 0 | namespaces obligatoires déclarés (bpmn, bpmndi, dc, di, xsi, camunda, modeler) | bpmn-gnspd-documentation.md §1.2 |
| CHK-B02 | bloquante | 0 | aucun namespace `zeebe:` (ATD = Camunda Platform 7) | bpmn-gnspd-documentation.md §1.2 (INTERDIT) |
| CHK-B03 | avertissement | 2 | exporter="Camunda Modeler" et exporterVersion="5.42.0" | bpmn-gnspd-documentation.md §11 (structure globale) |
| CHK-B04 | avertissement | 1 | modeler:executionPlatformVersion="7.17.0" | bpmn-gnspd-documentation.md §11 (structure globale) |
| CHK-B05 | bloquante | 0 | messages Kafka déclarés à la racine via <bpmn:message> et messageRef résolus | bpmn-gnspd-documentation.md §11 + §2.2 + bpmn-integrator §3 |
| CHK-B06 | bloquante | 0 | collaboration avec les deux participants (XPORTAL / XFLOW) et processRef résolus | bpmn-gnspd-documentation.md §11 + §2.1 |
| CHK-B07 | bloquante | 0 | tous les <bpmn:messageFlow> référencent des éléments existants | bpmn-gnspd-documentation.md §11 + §2.1 |
| CHK-B08 | bloquante | 0 | les deux pools sont isExecutable="true" | bpmn-gnspd-documentation.md §11 + §12.1 |
| CHK-B09 | avertissement | 2 | XFlow a camunda:versionTag et camunda:historyTimeToLive | bpmn-gnspd-documentation.md §11 + bpmn-integrator §2 |
| CHK-B10 | bloquante | 0 | chaque processus a au moins un startEvent et un endEvent | bpmn-gnspd-documentation.md §11 (pools et processus) |
| CHK-B11 | bloquante | 0 | les id de tous les éléments sont uniques dans le fichier | bpmn-gnspd-documentation.md §11 (pools et processus) |
| CHK-B12 | bloquante | 0 | chaque tâche interactive a camunda:modelerTemplate | bpmn-gnspd-documentation.md §11 + §3 (catalogue GNSPD) |
| CHK-B13 | bloquante | 0 | camunda:type="external" et camunda:topic renseignés pour une tâche à template | bpmn-gnspd-documentation.md §11 (templates GNSPD) + §3 |
| CHK-B14 | avertissement | 27 | paramètres de tâche standards présents (8 : gnspdTaskIsVisible, gnspdTaskLabel, gnspdTaskStatus, gnspdTaskOrder, gnspdTaskKind, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire) | bpmn-gnspd-documentation.md §11 + bpmn-integrator §5 |
| CHK-B15 | avertissement | 0 | startEvent embarque la configuration KMS des 4 environnements (development, sandbox, preproduction, production) | bpmn-gnspd-documentation.md §11 + bpmn-integrator §11 |
| CHK-B16 | bloquante | 0 | conditions en JavaScript (language="javascript", sans faute de frappe, sans `$this.data`) | bpmn-gnspd-documentation.md §11 + §12.3 + bpmn-integrator §9 |
| CHK-B17 | avertissement | 0 | chaque gateway exclusive a une condition par sortie | bpmn-gnspd-documentation.md §11 (gateways et conditions) |
| CHK-B18 | avertissement | 0 | un chemin par défaut est prévu pour les cas imprévus | bpmn-gnspd-documentation.md §11 + bpmn-integrator PG-05 |
| CHK-B19 | bloquante | 0 | pas de deadlock possible (tous les chemins atteignent un endEvent) | bpmn-gnspd-documentation.md §11 + bpmn-integrator P7 |
| CHK-B20 | avertissement | 0 | la boucle de correction est modélisée des deux côtés (XFlow et XPortal) | bpmn-gnspd-documentation.md §11 (boucle de correction) |
| CHK-B21 | avertissement | 0 | la receiveTask « attendre resoumission » a sa receive task correspondante côté Portail | bpmn-gnspd-documentation.md §11 (boucle de correction) |
| CHK-B22 | avertissement | 6 | le payload de correction inclut le motif | bpmn-gnspd-documentation.md §11 (boucle de correction) |
| CHK-B23 | bloquante | 0 | section <bpmndi:BPMNDiagram> présente | bpmn-gnspd-documentation.md §11 (graphique) |
| CHK-B24 | bloquante | 0 | tous les éléments BPMN ont un BPMNShape ou BPMNEdge correspondant | bpmn-gnspd-documentation.md §11 + §12.7 |
| CHK-B25 | bloquante | 0 | les messageFlow ont leurs BPMNEdge | bpmn-gnspd-documentation.md §11 (graphique) + §10.3 |
| CHK-B26 | bloquante | 0 | noms de messages sémantiques (jamais `Message_xxxx`) | bpmn-gnspd-documentation.md §12.2 + bpmn-integrator §3 |
| CHK-B27 | bloquante | 0 | gateway de décision agent : sorties Approuvé, Correction, Rejeté | bpmn-gnspd-documentation.md §12.5 + bpmn-integrator §7 |
| CHK-B28 | avertissement | 0 | chaque `this.data.XXX` correspond à un champ de formulaire (nécessite --forms) | bpmn-gnspd-documentation.md §12.4 |
| CHK-B29 | avertissement | 2 | boucle de correction limitée (compteur de tentatives ou boundary timer) | bpmn-gnspd-documentation.md §12.8 |
| CHK-B30 | bloquante | 0 | XML bien formé | bpmn-gnspd-documentation.md §2 |
| CHK-B31 | bloquante | 0 | connectivité : sequenceFlow résolus, aucun nœud orphelin | bpmn-gnspd-documentation.md §11 + bpmn-integrator P7 |
| CHK-B32 | bloquante | 0 | adossement formKey ⇄ formulaire (startEvent XFlow sans formKey, userTask porteur, name racine = formKey) | AGENTS.md + lot-integration-gnspd R1→R7 |
| CHK-B33 | avertissement | 0 | convergence par ReceiveTask, jamais par merge d'ExclusiveGateway | bpmn-integrator §Patterns d'orchestration P2 |
| CHK-B34 | avertissement | 3 | notification PUIS SendMessage (jamais l'inverse) | bpmn-integrator §Patterns d'orchestration P3 |
| CHK-B35 | avertissement | 0 | appariement SendTask/ReceiveTask (message envoyé = message consommé) | bpmn-integrator §Patterns d'orchestration P8 |
| CHK-B37 | bloquante | 0 | type de tâche cohérent avec le niveau (serviceTask = system, userTask portail = citizen, userTask xflow = backoffice) | bpmn-gnspd-documentation.md §3.4 |
| CHK-B36 | bloquante | 0 | visibilité définie sur chaque tâche (userTask = true, toute autre tâche = false) | règle ATD de validation des BPMN configurés — element-template « Voir l'évènement » |
| CHK-B38 | bloquante | 0 | startEvent : visibilité « Oui » déclarée explicitement (gnspdTaskIsVisible = true) | consigne métier ATD (2026-09-27) + bpmn-gnspd-documentation.md §3.3 |

## Constats

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\bpmn-to-be-autorisation-promotion-commerciale.bpmn

| Emplacement | Règle | Sévérité | Observation |
|---|---|---|---|
| bpmn:definitions | CHK-B03 | avertissement | exporter=None (attendu "Camunda Modeler") |
| bpmn:definitions | CHK-B03 | avertissement | exporterVersion=None (attendu "5.42.0") |
| bpmn:definitions | CHK-B04 | avertissement | modeler:executionPlatformVersion=None (attendu "7.17.0") |
| Activity_1dqbh50 | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1ybnfz9 | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_029tj3y | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_10y8a89 | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1vr036a | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1xapqwe | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_00y1imk | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1ybnfz9 | CHK-B22 | avertissement | message de resoumission sans « motif » (variable ou paramètre attendu) |
| Process_portail | CHK-B29 | avertissement | boucle de correction sans compteur de tentatives ni boundary timer (§12.8) |
| Process_xflow | CHK-B09 | avertissement | camunda:versionTag absent sur XFlow |
| Process_xflow | CHK-B09 | avertissement | camunda:historyTimeToLive absent sur XFlow |
| Activity_0cwzfa8 | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1nui6br | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1plylgu | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0ox4zju | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0lzk181 | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0lohylf | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_15c75qg | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0lfq4iu | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_108n6mx | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1gzy6eu | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1cmw7ng | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0yjwocj | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0yh40vq | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0bbo9fa | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_1xtkz6v | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0oj9of2 | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_01nxe0u | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_08sva0w | CHK-B14 | avertissement | paramètres standards manquants : gnspdTaskOrder, gnspdCostVariable, gnspdCostTotal, gnspdCostUnitaire |
| Activity_0lohylf | CHK-B22 | avertissement | message de resoumission sans « motif » (variable ou paramètre attendu) |
| Activity_0yh40vq | CHK-B22 | avertissement | message de resoumission sans « motif » (variable ou paramètre attendu) |
| Activity_0bbo9fa | CHK-B22 | avertissement | message de resoumission sans « motif » (variable ou paramètre attendu) |
| Activity_0pr5f9y_tx | CHK-B22 | avertissement | message de resoumission sans « motif » (variable ou paramètre attendu) |
| Activity_0zpp1mb | CHK-B22 | avertissement | message de resoumission sans « motif » (variable ou paramètre attendu) |
| Process_xflow | CHK-B29 | avertissement | boucle de correction sans compteur de tentatives ni boundary timer (§12.8) |
| Activity_0lohylf | CHK-B34 | avertissement | SendMessage exécuté avant 1 notification(s) située(s) en aval (Activity_08sva0w) — P3 : notification PUIS SendMessage |
| Activity_0yh40vq | CHK-B34 | avertissement | SendMessage exécuté avant 1 notification(s) située(s) en aval (Activity_08sva0w) — P3 : notification PUIS SendMessage |
| Activity_0bbo9fa | CHK-B34 | avertissement | SendMessage exécuté avant 1 notification(s) située(s) en aval (Activity_08sva0w) — P3 : notification PUIS SendMessage |
| (plafond) | CHK-B14 | — | 2 constat(s) supplémentaire(s) non listé(s) |

## Verdict

**CONFORME** — 0 bloquant(s), 43 avertissement(s).
