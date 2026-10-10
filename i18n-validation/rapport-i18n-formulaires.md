# Validation du fonctionnement de la traduction (i18n) des formulaires

- Genere le : 30/09/2026 05:15
- Langues controlees : fr, en (reference : fr)
- Formulaires analyses : 16 (ignores : 0)
- Verdict : **CONFORME**

## Recapitulatif des familles de constat

| Famille | Nombre |
|---|--:|
| manquante | 0 |
| non-declaree | 0 |
| vide | 0 |
| cognat | 1 |
| placeholder | 0 |
| mojibake | 0 |
| orpheline | 0 |
| parite | 0 |
| propriete | 0 |
| hors-t | 0 |
| non-traduit | 0 |
| table | 0 |

## Synthese par formulaire

| Formulaire | Composants | Chaines | couverture fr | couverture en | traduites | FAIL | WARN |
|---|--:|--:|--:|--:--:|--:|--:|
| `01M3QHN1VC5N8S6G8N2P82JV9B` | 17 | 20 | 20/20 | 20/20 | 20 | 0 | 0 |
| `01M3QHN6XP21YEBSVAPKYPBRZK` | 13 | 16 | 16/16 | 16/16 | 16 | 0 | 0 |
| `01M3QGVEVAYCABVW0ZGKE8W5ZF` | 14 | 15 | 15/15 | 15/15 | 14 | 0 | 1 |
| `01M3QHNCYVPDFW1XWMB94G1KQZ` | 14 | 15 | 15/15 | 15/15 | 15 | 0 | 0 |
| `01M3QHNF0VB9AVRRHQYPQ4KBM5` | 18 | 16 | 16/16 | 16/16 | 16 | 0 | 0 |
| `01M3QHNM9ND303NFG8K45KE1X7` | 18 | 21 | 21/21 | 21/21 | 21 | 0 | 0 |
| `01M3QHNQN8QMDNJW56AGDTA1WS` | 25 | 25 | 25/25 | 25/25 | 25 | 0 | 0 |
| `01M3QHNTM8ACZG9TNBHXMKM0KP` | 13 | 15 | 15/15 | 15/15 | 15 | 0 | 0 |
| `01M3QHNXFTZQVPWEJ5RBR4PZWB` | 13 | 15 | 15/15 | 15/15 | 15 | 0 | 0 |
| `01M3QHP1JJCT3Q56GHXFTBTF6C` | 18 | 21 | 21/21 | 21/21 | 21 | 0 | 0 |
| `01M3QHP5MCK1RRHWD2QPJFMK9J` | 17 | 20 | 20/20 | 20/20 | 20 | 0 | 0 |
| `01M3QHPASRGKN9SZ8HC71JFPFJ` | 21 | 20 | 20/20 | 20/20 | 20 | 0 | 0 |
| `01M3QHPDTSFBQEZSRAGCQX7G6B` | 38 | 43 | 43/43 | 43/43 | 43 | 0 | 0 |
| `01M3QHPHTHPD83KTS4MB75QJT8` | 21 | 24 | 24/24 | 24/24 | 24 | 0 | 0 |
| `01M3QHPP8SDX0ZBSAPCCCS0KTD` | 18 | 21 | 21/21 | 21/21 | 21 | 0 | 0 |
| `01M3QHPXSN1KH77694BN0SD8ND` | 18 | 21 | 21/21 | 21/21 | 21 | 0 | 0 |

## Detail par formulaire

### Vérifier la conformité des produits

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_controler_conformite_produits__Activity_1xlgjex.json`
- `name` racine : `01M3QHN1VC5N8S6G8N2P82JV9B` | display : `wizard`
- Composants : 17 | chaines rendues : 20
- Langue `fr` : dictionnaire 18 entrees | couverture 20/20 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 18 entrees | couverture 20/20 | traductions reelles 20 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 8 chaine(s) [button, select, textarea, checkbox] [en 8/8] ; description 1 chaine(s) [select] [en 1/1] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Vérifier la conformité des produits` | `Check the product compliance` |
| `description` | content (t()) | `Vérifier la conformité des produits` | `Check the product compliance` |
| `description` | content (t()) | `Contrôle de conformité des produits` | `Product compliance check` |
| `startButton` | label | `Commencer` | `Start` |
| `panneauProduitConcerne` | title | `Produit concerné` | `Product concerned` |
| `produitConcerne` | label | `Produit concerné par la demande` | `Product concerned by the application` |
| `produitConcerne` | description | `Sélectionnez le produit déclaré dans la liste `produits` du dossier en` | `Select the product declared in the `produits` list of the current file` |
| `next1` | label | `Suivant` | `Next` |
| `controleConformite` | title | `Contrôle de conformité` | `Compliance check` |
| `verdictConformite` | label | `Verdict de conformité du produit` | `Product compliance verdict` |
| `verdictConformite` | data.values[0].label | `Produit conforme` | `Compliant product` |
| `verdictConformite` | data.values[1].label | `Produit non conforme` | `Non-compliant product` |

### Enregistrer l’analyse requise

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_enregistrer_analyse_requise__Activity_1xd47fu.json`
- `name` racine : `01M3QHN6XP21YEBSVAPKYPBRZK` | display : `wizard`
- Composants : 13 | chaines rendues : 16
- Langue `fr` : dictionnaire 14 entrees | couverture 16/16 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 14 entrees | couverture 16/16 | traductions reelles 16 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 7 chaine(s) [button, select, checkbox] [en 7/7] ; description 2 chaine(s) [select] [en 2/2]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Enregistrer l’analyse requise` | `Record the required analysis` |
| `description` | content (t()) | `Enregistrer l’analyse requise` | `Record the required analysis` |
| `description` | content (t()) | `Enregistrement et orientation vers un laboratoire` | `Recording and referral to a laboratory` |
| `startButton` | label | `Commencer` | `Start` |
| `produitOrientation` | title | `Produit concerné` | `Product concerned` |
| `produitConcerne` | label | `Produit concerné par la demande` | `Product concerned by the application` |
| `produitConcerne` | description | `Sélectionnez le produit déclaré dans la liste `produits` du dossier en` | `Select the product declared in the `produits` list of the current file` |
| `next1` | label | `Suivant` | `Next` |
| `laboratoireOrientation` | title | `Laboratoire d’orientation` | `Referral laboratory` |
| `laboratoireOriente` | label | `Laboratoire reconnu par l’État` | `State-recognised laboratory` |
| `laboratoireOriente` | description | `Liste des laboratoires reconnus par l’État, configurée par la DCL.` | `List of State-recognised laboratories, configured by the DCL.` |
| `precedent2` | label | `Precedent` | `Previous` |

### Enregistrer l’exposition physique effective

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_enregistrer_exposition_hall__Activity_0mvp37e.json`
- `name` racine : `01M3QGVEVAYCABVW0ZGKE8W5ZF` | display : `wizard`
- Composants : 14 | chaines rendues : 15
- Langue `fr` : dictionnaire 14 entrees | couverture 15/15 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 14 entrees | couverture 15/15 | traductions reelles 14 | identiques au fr 1 | vides 0
- Inventaire des proprietes rendues : title 3 chaine(s) [panel] [en 3/3] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 6 chaine(s) [button, day, textfield, select, checkbox] [en 6/6] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1]

| Gravite | Fichier | Composant | Propriete | Constat |
|---|---|---|---|---|
| WARN | `dexp_enregistrer_exposition_hall__Activity_0mvp37e.json` | `statutExposition` (select) | `data.values[0].label` | en : identique au fr (non traduit) |

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Enregistrer l’exposition physique effective` | `Record the actual physical display` |
| `description` | content (t()) | `Enregistrer l’exposition physique effective` | `Record the actual physical display` |
| `description` | content (t()) | `Exposition effective dans le hall` | `Actual display in the hall` |
| `startButton` | label | `Commencer` | `Start` |
| `expositionPhysique` | title | `Exposition physique effective` | `Actual physical display` |
| `dateExpositionHall` | label | `Date d’exposition effective dans le hall` | `Actual display date in the hall` |
| `emplacementHall` | label | `Emplacement attribué dans le hall` | `Space assigned in the hall` |
| `statutExposition` | label | `Statut de l’exposition` | `Display status` |
| `statutExposition` | data.values[0].label | `Active` | `Active` |
| `statutExposition` | data.values[1].label | `Suspendue` | `Suspended` |
| `statutExposition` | data.values[2].label | `Terminée` | `Completed` |
| `next1` | label | `Suivant` | `Next` |

### Enregistrer l’invitation au dépôt physique

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_enregistrer_invitation_depot_physique__Activity_1fspi2r.json`
- `name` racine : `01M3QHNCYVPDFW1XWMB94G1KQZ` | display : `wizard`
- Composants : 14 | chaines rendues : 15
- Langue `fr` : dictionnaire 14 entrees | couverture 15/15 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 14 entrees | couverture 15/15 | traductions reelles 15 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 3 chaine(s) [panel] [en 3/3] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 6 chaine(s) [button, select, day, textarea, checkbox] [en 6/6] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Enregistrer l’invitation au dépôt physique` | `Record the physical deposit invitation` |
| `description` | content (t()) | `Enregistrer l’invitation au dépôt physique` | `Record the physical deposit invitation` |
| `description` | content (t()) | `Invitation au dépôt physique à la DCL` | `Invitation to physically deposit at the DCL` |
| `startButton` | label | `Commencer` | `Start` |
| `invitationDepot` | title | `Invitation au dépôt physique` | `Physical deposit invitation` |
| `lieuDepotPhysique` | label | `Lieu de dépôt physique` | `Physical deposit location` |
| `lieuDepotPhysique` | data.values[0].label | `Siège de la DCL` | `DCL head office` |
| `lieuDepotPhysique` | data.values[1].label | `Point de collecte de la DCL` | `DCL collection point` |
| `lieuDepotPhysique` | data.values[2].label | `Hall Consommer Local` | `Local consumption hall` |
| `dateLimiteDepot` | label | `Date limite de dépôt du produit` | `Product deposit deadline` |
| `consignesDepot` | label | `Consignes de dépôt et de préservation` | `Deposit and preservation instructions` |
| `next1` | label | `Suivant` | `Next` |

### Enregistrer la réception physique du produit

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_enregistrer_reception_physique__Activity_01ec0t7.json`
- `name` racine : `01M3QHNF0VB9AVRRHQYPQ4KBM5` | display : `wizard`
- Composants : 18 | chaines rendues : 16
- Langue `fr` : dictionnaire 15 entrees | couverture 16/16 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 15 entrees | couverture 16/16 | traductions reelles 16 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 3 chaine(s) [panel] [en 3/3] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 7 chaine(s) [button, day, textfield, select, textarea, checkbox] [en 7/7] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Enregistrer la réception physique du produit` | `Record the physical receipt of the product` |
| `description` | content (t()) | `Enregistrer la réception physique du produit` | `Record the physical receipt of the product` |
| `description` | content (t()) | `Réception du produit déposé à la DCL` | `Receipt of the product deposited at the DCL` |
| `startButton` | label | `Commencer` | `Start` |
| `receptionPhysique` | title | `Réception physique du produit` | `Physical receipt of the product` |
| `dateReceptionPhysique` | label | `Date de réception physique du produit` | `Physical receipt date` |
| `quantiteRecue` | label | `Quantité effectivement reçue` | `Quantity actually received` |
| `etatProduitReception` | label | `État du produit à la réception` | `Product condition on receipt` |
| `etatProduitReception` | data.values[0].label | `Conforme à l’annonce` | `As announced` |
| `etatProduitReception` | data.values[1].label | `Réserve — écart constaté` | `Reserved - discrepancy noted` |
| `etatProduitReception` | data.values[2].label | `Non conforme à l’annonce` | `Not as announced` |
| `observationsReception` | label | `Observations sur la réception` | `Receipt observations` |

### Enregistrer les résultats d’analyse

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_enregistrer_resultats_analyse__Activity_07a49ve.json`
- `name` racine : `01M3QHNM9ND303NFG8K45KE1X7` | display : `wizard`
- Composants : 18 | chaines rendues : 21
- Langue `fr` : dictionnaire 19 entrees | couverture 21/21 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 19 entrees | couverture 21/21 | traductions reelles 21 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 9 chaine(s) [button, select, textarea, file, checkbox] [en 9/9] ; description 1 chaine(s) [select] [en 1/1] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Enregistrer les résultats d’analyse` | `Record the analysis results` |
| `description` | content (t()) | `Enregistrer les résultats d’analyse` | `Record the analysis results` |
| `description` | content (t()) | `Enregistrement du résultat transmis par le demandeur` | `Recording of the result submitted by the applicant` |
| `startButton` | label | `Commencer` | `Start` |
| `panneauProduitConcerne` | title | `Produit concerné` | `Product concerned` |
| `produitConcerne` | label | `Produit concerné par la demande` | `Product concerned by the application` |
| `produitConcerne` | description | `Sélectionnez le produit déclaré dans la liste `produits` du dossier en` | `Select the product declared in the `produits` list of the current file` |
| `next1` | label | `Suivant` | `Next` |
| `analyseDemandee` | title | `Analyse demandée` | `Requested analysis` |
| `typeAnalyse` | label | `Type d’analyse` | `Analysis type` |
| `typeAnalyse` | data.values[0].label | `Analyse physico-chimique` | `Physico-chemical analysis` |
| `typeAnalyse` | data.values[1].label | `Analyse microbiologique` | `Microbiological analysis` |

### Examiner, qualifier et enregistrer l’instruction

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_examiner_qualifier_produit__Activity_0tf0uvt.json`
- `name` racine : `01M3QHNQN8QMDNJW56AGDTA1WS` | display : `wizard`
- Composants : 25 | chaines rendues : 25
- Langue `fr` : dictionnaire 21 entrees | couverture 25/25 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 21 entrees | couverture 25/25 | traductions reelles 25 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 5 chaine(s) [panel] [en 5/5] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 12 chaine(s) [button, select, textfield, textarea, checkbox] [en 12/12] ; description 2 chaine(s) [select] [en 2/2] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Examiner, qualifier et enregistrer l’instruction` | `Examine, qualify and record the processing` |
| `description` | content (t()) | `Examiner, qualifier et enregistrer l’instruction` | `Examine, qualify and record the processing` |
| `description` | content (t()) | `Instruction et affectation du dossier` | `File processing and assignment` |
| `startButton` | label | `Commencer` | `Start` |
| `panneauProduitConcerne` | title | `Produit concerné` | `Product concerned` |
| `produitConcerne` | label | `Produit concerné par la demande` | `Product concerned by the application` |
| `produitConcerne` | description | `Sélectionnez le produit déclaré dans la liste `produits` du dossier en` | `Select the product declared in the `produits` list of the current file` |
| `next1` | label | `Suivant` | `Next` |
| `qualificationInstruction` | title | `Qualification de l’instruction` | `Processing outcome` |
| `qualiteInstruction` | label | `Qualité de l’instruction` | `Processing quality` |
| `qualiteInstruction` | data.values[0].label | `Complète` | `Complete` |
| `qualiteInstruction` | data.values[1].label | `Incomplète — complément à demander` | `Incomplete - additional information requested` |

### Constituer le dossier physique du produit

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_integrer_pieces_dossier_physique__Activity_015xz5y.json`
- `name` racine : `01M3QHNTM8ACZG9TNBHXMKM0KP` | display : `wizard`
- Composants : 13 | chaines rendues : 15
- Langue `fr` : dictionnaire 13 entrees | couverture 15/15 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 13 entrees | couverture 15/15 | traductions reelles 15 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 7 chaine(s) [button, select, checkbox] [en 7/7] ; description 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Constituer le dossier physique du produit` | `Prepare the product physical file` |
| `description` | content (t()) | `Constituer le dossier physique du produit` | `Prepare the product physical file` |
| `description` | content (t()) | `Intégration des pièces au dossier physique` | `Integration of documents into the physical file` |
| `startButton` | label | `Commencer` | `Start` |
| `produit` | title | `Produit concerné` | `Product concerned` |
| `produitConcerne` | label | `Produit concerné par la demande` | `Product concerned by the application` |
| `produitConcerne` | description | `Sélectionnez le produit déclaré dans la liste `produits` du dossier en` | `Select the product declared in the `produits` list of the current file` |
| `next1` | label | `Suivant` | `Next` |
| `tracabiliteDossierPhysique` | title | `Constitution du dossier physique` | `Physical file preparation` |
| `dossierPhysiqueConstitue` | label | `Je confirme avoir téléchargé les pièces numériques utiles et les avoir` | `I confirm that I have downloaded the useful digital documents and inte` |
| `precedent2` | label | `Precedent` | `Previous` |
| `next2` | label | `Suivant` | `Next` |

### Enregistrer la mise en attente du produit

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_mettre_produit_en_attente_hall__Activity_053mt4u.json`
- `name` racine : `01M3QHNXFTZQVPWEJ5RBR4PZWB` | display : `wizard`
- Composants : 13 | chaines rendues : 15
- Langue `fr` : dictionnaire 14 entrees | couverture 15/15 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 14 entrees | couverture 15/15 | traductions reelles 15 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 3 chaine(s) [panel] [en 3/3] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 5 chaine(s) [button, select, day, checkbox] [en 5/5] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Enregistrer la mise en attente du produit` | `Record the product being put on hold` |
| `description` | content (t()) | `Enregistrer la mise en attente du produit` | `Record the product being put on hold` |
| `description` | content (t()) | `Attente de disponibilité du hall` | `Waiting for hall availability` |
| `startButton` | label | `Commencer` | `Start` |
| `attenteHall` | title | `Mise en attente de disponibilité du hall` | `Waiting for hall availability` |
| `motifAttenteHall` | label | `Motif de l’attente` | `Waiting reason` |
| `motifAttenteHall` | data.values[0].label | `Hall complet` | `Hall full` |
| `motifAttenteHall` | data.values[1].label | `Emplacement indisponible` | `No space available` |
| `motifAttenteHall` | data.values[2].label | `Produit non conforme à l’exposition` | `Non-compliant product` |
| `motifAttenteHall` | data.values[3].label | `Arrivée groupée de produits` | `Group arrival of products` |
| `datePrevueHall` | label | `Date prévue de disponibilité du hall` | `Expected hall availability date` |
| `next1` | label | `Suivant` | `Next` |

### Préciser l’analyse complémentaire et le résultat attendu

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_preciser_analyse_complementaire__Activity_0onlbzr.json`
- `name` racine : `01M3QHP1JJCT3Q56GHXFTBTF6C` | display : `wizard`
- Composants : 18 | chaines rendues : 21
- Langue `fr` : dictionnaire 19 entrees | couverture 21/21 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 19 entrees | couverture 21/21 | traductions reelles 21 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 9 chaine(s) [button, select, textarea, file, checkbox] [en 9/9] ; description 1 chaine(s) [select] [en 1/1] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Préciser l’analyse complémentaire et le résultat attendu` | `Specify the additional analysis and the expected result` |
| `description` | content (t()) | `Préciser l’analyse complémentaire et le résultat attendu` | `Specify the additional analysis and the expected result` |
| `description` | content (t()) | `Précision de l’analyse complémentaire` | `Specification of the additional analysis` |
| `startButton` | label | `Commencer` | `Start` |
| `panneauProduitConcerne` | title | `Produit concerné` | `Product concerned` |
| `produitConcerne` | label | `Produit concerné par la demande` | `Product concerned by the application` |
| `produitConcerne` | description | `Sélectionnez le produit déclaré dans la liste `produits` du dossier en` | `Select the product declared in the `produits` list of the current file` |
| `next1` | label | `Suivant` | `Next` |
| `analyseDemandee` | title | `Analyse demandée` | `Requested analysis` |
| `typeAnalyse` | label | `Type d’analyse` | `Analysis type` |
| `typeAnalyse` | data.values[0].label | `Analyse physico-chimique` | `Physico-chemical analysis` |
| `typeAnalyse` | data.values[1].label | `Analyse microbiologique` | `Microbiological analysis` |

### Proposer un rejet motivé du produit

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_proposer_rejet_motive__Activity_1hhje11.json`
- `name` racine : `01M3QHP5MCK1RRHWD2QPJFMK9J` | display : `wizard`
- Composants : 17 | chaines rendues : 20
- Langue `fr` : dictionnaire 18 entrees | couverture 20/20 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 18 entrees | couverture 20/20 | traductions reelles 20 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 8 chaine(s) [button, select, textarea, file, checkbox] [en 8/8] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1] ; data.values[4].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Proposer un rejet motivé du produit` | `Propose a reasoned rejection of the product` |
| `description` | content (t()) | `Proposer un rejet motivé du produit` | `Propose a reasoned rejection of the product` |
| `description` | content (t()) | `Proposition de rejet motivé` | `Reasoned rejection proposal` |
| `startButton` | label | `Commencer` | `Start` |
| `motifRejet` | title | `Motif du rejet` | `Rejection reason` |
| `codeMotifRejet` | label | `Code du motif de rejet` | `Rejection reason code` |
| `codeMotifRejet` | data.values[0].label | `Non conformité du produit` | `Non-compliant product` |
| `codeMotifRejet` | data.values[1].label | `Produit non éligible à l’exposition` | `Product ineligible for display` |
| `codeMotifRejet` | data.values[2].label | `Dossier incomplet` | `Incomplete file` |
| `codeMotifRejet` | data.values[3].label | `Pièce justificative manquante` | `Missing supporting document` |
| `codeMotifRejet` | data.values[4].label | `Retard du demandeur` | `Applicant delay` |
| `detailsMotifRejet` | label | `Détail motivé du rejet` | `Detailed rejection reason` |

### Ressoumission de la demande

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_resoumettre_demande__Activity_1x1krrc.json`
- `name` racine : `01M3QHPASRGKN9SZ8HC71JFPFJ` | display : `wizard`
- Composants : 21 | chaines rendues : 20
- Langue `fr` : dictionnaire 18 entrees | couverture 20/20 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 18 entrees | couverture 20/20 | traductions reelles 20 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 9 chaine(s) [button, textarea, file, select, checkbox] [en 9/9] ; description 1 chaine(s) [textarea] [en 1/1] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Ressoumission de la demande` | `Application resubmission` |
| `description` | content (t()) | `Ressoumission de la demande` | `Application resubmission` |
| `description` | content (t()) | `Reprise du dossier à la suite d’une demande de correction` | `File resumed after a correction request` |
| `startButton` | label | `Commencer` | `Start` |
| `correctionElements` | title | `Éléments à corriger` | `Elements to be corrected` |
| `elementsACorriger` | label | `Éléments demandés` | `Requested elements` |
| `elementsACorriger` | description | `Éléments à corriger ou résultat d’analyse à transmettre.` | `Elements to correct or analysis result to submit.` |
| `commentaireDemandeur` | label | `Commentaire du demandeur` | `Applicant comment` |
| `next1` | label | `Suivant` | `Next` |
| `resultatAnalyse` | title | `Résultat d’analyse transmis` | `Submitted analysis result` |
| `fileResultatAnalyse` | label | `Résultat d’analyse ou de laboratoire transmis` | `Submitted analysis or laboratory result` |
| `conformiteResultat` | label | `Conformité du résultat d’analyse` | `Analysis result conformity` |

### Soumettre la demande d’exposition

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_soumettre_demande_exposition__StartEvent_portail.json`
- `name` racine : `01M3QHPDTSFBQEZSRAGCQX7G6B` | display : `wizard`
- Composants : 38 | chaines rendues : 43
- Langue `fr` : dictionnaire 37 entrees | couverture 43/43 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 37 entrees | couverture 43/43 | traductions reelles 43 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 6 chaine(s) [panel] [en 6/6] ; content (t()) 7 chaine(s) [htmlelement] [en 7/7] ; label 20 chaine(s) [button, textfield, datagrid, select, file, checkbox] [en 20/20] ; description 5 chaine(s) [textfield, datagrid] [en 5/5] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1] ; data.values[4].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Soumettre la demande d’exposition` | `Submit the display application` |
| `description` | content (t()) | `Soumettre la demande d’exposition` | `Submit the display application` |
| `description` | content (t()) | `Dépôt de la demande et déclaration des produits` | `Application submission and product declaration` |
| `startButton` | label | `Commencer` | `Start` |
| `descriptionService` | title | `Description du service` | `Service description` |
| `descriptionServiceTexte` | content (t()) | `Objet de la demande` | `Purpose of the application` |
| `descriptionServiceTexte` | content (t()) | `L’exposition des produits locaux dans le hall Consommer Local est grat` | `Displaying local products in the local consumption hall is free of cha` |
| `descriptionServiceTexte` | content (t()) | `Des analyses externes peuvent être demandées par la DCL.` | `External analyses may be requested by the DCL.` |
| `descriptionServiceTexte` | content (t()) | `Après une instruction favorable, le dépôt physique du produit à la DCL` | `After a favourable processing outcome, physical deposit of the product` |
| `next1` | label | `Suivant` | `Next` |
| `demandeur` | title | `Demandeur` | `Applicant` |
| `nomComplet` | label | `Nom complet du demandeur connecté` | `Full name of the connected applicant` |

### Valider le rejet de produit non conforme

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_valider_rejet_produit__Activity_17dwtll.json`
- `name` racine : `01M3QHPHTHPD83KTS4MB75QJT8` | display : `wizard`
- Composants : 21 | chaines rendues : 24
- Langue `fr` : dictionnaire 22 entrees | couverture 24/24 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 22 entrees | couverture 24/24 | traductions reelles 24 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 9 chaine(s) [button, select, textarea, checkbox] [en 9/9] ; data.values[0].label 2 chaine(s) [select] [en 2/2] ; data.values[1].label 2 chaine(s) [select] [en 2/2] ; description 1 chaine(s) [textarea] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1] ; data.values[4].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Valider le rejet de produit non conforme` | `Confirm the rejection of the non-compliant product` |
| `description` | content (t()) | `Valider le rejet de produit non conforme` | `Confirm the rejection of the non-compliant product` |
| `description` | content (t()) | `Validation ou retour du rejet` | `Confirmation or return of the rejection` |
| `startButton` | label | `Commencer` | `Start` |
| `decisionRejet` | title | `Décision de la Directrice` | `Director decision` |
| `decisionDirectrice` | label | `Décision` | `Decision` |
| `decisionDirectrice` | data.values[0].label | `Valider le rejet` | `Confirm the rejection` |
| `decisionDirectrice` | data.values[1].label | `Retourner le dossier à l’agent pour réexamen` | `Return the file to the officer for review` |
| `observationDirectrice` | label | `Observation de la Directrice` | `Director observation` |
| `observationDirectrice` | description | `Obligatoire lorsque la décision retourne le dossier à l’agent.` | `Mandatory when the decision returns the file to the officer.` |
| `next1` | label | `Suivant` | `Next` |
| `motifRejet` | title | `Motif retenu` | `Reason retained` |

### Vérifier si une analyse est requise

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_verifier_analyse_requise__Activity_18p7f4w.json`
- `name` racine : `01M3QHPP8SDX0ZBSAPCCCS0KTD` | display : `wizard`
- Composants : 18 | chaines rendues : 21
- Langue `fr` : dictionnaire 19 entrees | couverture 21/21 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 19 entrees | couverture 21/21 | traductions reelles 21 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 9 chaine(s) [button, select, textarea, file, checkbox] [en 9/9] ; description 1 chaine(s) [select] [en 1/1] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Vérifier si une analyse est requise` | `Check whether an analysis is required` |
| `description` | content (t()) | `Vérifier si une analyse est requise` | `Check whether an analysis is required` |
| `description` | content (t()) | `Vérification du besoin d’analyse` | `Check of the analysis requirement` |
| `startButton` | label | `Commencer` | `Start` |
| `panneauProduitConcerne` | title | `Produit concerné` | `Product concerned` |
| `produitConcerne` | label | `Produit concerné par la demande` | `Product concerned by the application` |
| `produitConcerne` | description | `Sélectionnez le produit déclaré dans la liste `produits` du dossier en` | `Select the product declared in the `produits` list of the current file` |
| `next1` | label | `Suivant` | `Next` |
| `analyseDemandee` | title | `Analyse demandée` | `Requested analysis` |
| `typeAnalyse` | label | `Type d’analyse` | `Analysis type` |
| `typeAnalyse` | data.values[0].label | `Analyse physico-chimique` | `Physico-chemical analysis` |
| `typeAnalyse` | data.values[1].label | `Analyse microbiologique` | `Microbiological analysis` |

### Vérifier le besoin d’analyse complémentaire

- Fichier : `C:\jeanluc\intégrationATD\integration-atd\collecte_srs\DEMANDE D EXPOSITION DES PRODUITS LOCAUX DANS LE HALL CONSOMMER LOCAL\forms\dexp_verifier_besoin_analyse_complementaire__Activity_0hf9l28.json`
- `name` racine : `01M3QHPXSN1KH77694BN0SD8ND` | display : `wizard`
- Composants : 18 | chaines rendues : 21
- Langue `fr` : dictionnaire 19 entrees | couverture 21/21 | traductions reelles 0 | identiques au fr 0 | vides 0
- Langue `en` : dictionnaire 19 entrees | couverture 21/21 | traductions reelles 21 | identiques au fr 0 | vides 0
- Inventaire des proprietes rendues : title 4 chaine(s) [panel] [en 4/4] ; content (t()) 3 chaine(s) [htmlelement] [en 3/3] ; label 9 chaine(s) [button, select, textarea, file, checkbox] [en 9/9] ; description 1 chaine(s) [select] [en 1/1] ; data.values[0].label 1 chaine(s) [select] [en 1/1] ; data.values[1].label 1 chaine(s) [select] [en 1/1] ; data.values[2].label 1 chaine(s) [select] [en 1/1] ; data.values[3].label 1 chaine(s) [select] [en 1/1]

Rendu resolu (echantillon) :

| Composant | Propriete | fr | en |
|---|---|---|---|
| `stepIntro` | title | `Vérifier le besoin d’analyse complémentaire` | `Check whether an additional analysis is required` |
| `description` | content (t()) | `Vérifier le besoin d’analyse complémentaire` | `Check whether an additional analysis is required` |
| `description` | content (t()) | `Vérification de l’analyse complémentaire` | `Check of the additional analysis` |
| `startButton` | label | `Commencer` | `Start` |
| `panneauProduitConcerne` | title | `Produit concerné` | `Product concerned` |
| `produitConcerne` | label | `Produit concerné par la demande` | `Product concerned by the application` |
| `produitConcerne` | description | `Sélectionnez le produit déclaré dans la liste `produits` du dossier en` | `Select the product declared in the `produits` list of the current file` |
| `next1` | label | `Suivant` | `Next` |
| `analyseDemandee` | title | `Analyse demandée` | `Requested analysis` |
| `typeAnalyse` | label | `Type d’analyse` | `Analysis type` |
| `typeAnalyse` | data.values[0].label | `Analyse physico-chimique` | `Physico-chemical analysis` |
| `typeAnalyse` | data.values[1].label | `Analyse microbiologique` | `Microbiological analysis` |

## Semantique appliquee

- Le texte affiche est resolu par `i18n[langue][chaine]` (appariement exact, comme le moteur Form.io) ; a defaut, par la chaine portee par le composant (francais).
- Une cle quasi identique (espaces ou typographie) est signalee comme `cle non appariee` : le moteur ne l'appliquera pas telle quelle.
- Seules les proprietes reellement rendues par le type de composant sont controlees : un `htmlelement` n'affiche que son HTML, traduisible uniquement via `{{ t("...") }}`.
- `FAIL` : le rendu ne peut pas etre correct dans cette langue. `WARN` : rendu possible mais a verifier (cognat, entree morte, texte hors t(), chaine non declaree).
