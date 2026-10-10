# Validation — checklist formulaires Form.io (GNSPD/GNDAD)

- Date : 2026-09-30 12:48:47
- Cibles : C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms
- Formulaires analysés : 9 · fichiers ignorés : 0
- Constats : 0 bloquant(s), 0 avertissement(s)

## Règles de la documentation appliquées

| Règle | Sévérité | Occurrences | Libellé | Source |
|---|---|---|---|---|
| CHK-F01 | bloquante | 0 | type racine = "form" | formio-gnspd/models/CONFIG-DEPLOYMENT.md §4 |
| CHK-F02 | bloquante | 0 | `name` racine non vide et = camunda:formKey du BPMN_TO-BE | formio-gnspd/models/CONFIG-DEPLOYMENT.md §1 + AGENTS.md (lot-integration-gnspd R1→R7) |
| CHK-F03 | bloquante | 0 | wizard : 1er panel `stepIntro` + `startButton` action=submit hidden=true | formio-gnspd/models/WIZARD.md (« Règles critiques » + anti-patterns bloquants) |
| CHK-F04 | bloquante | 0 | wizard : dernier panel = récap sécurisé + checkbox `luEtApprouve` required | formio-gnspd/models/VALIDATION.md §2 + SECURITY-RECAP.md §4 (checklist 8.1/8.2) |
| CHK-F05 | bloquante | 0 | aucune clé réservée Form.io (`submit`, `form`, `data`) | formio-gnspd/models/CONFIG-DEPLOYMENT.md §5 |
| CHK-F06 | bloquante | 0 | `config` racine = 5 blocs (development, sandbox, preproduction, production, preprod) | formio-gnspd/models/CONFIG-DEPLOYMENT.md §2 (checklist 7.1) |
| CHK-F07 | bloquante | 0 | chaque bloc `config` porte `users` avec les 6 propriétés attendues | formio-gnspd/models/CONFIG-DEPLOYMENT.md §3 (checklist 7.2) |
| CHK-F08 | bloquante | 0 | sections `i18n.fr` ET `i18n.en` présentes et non vides | formio-gnspd/models/I18N.md §1 (checklist 9.2) |
| CHK-F09 | avertissement | 0 | clés i18n = chaînes réellement affichées (pas de clé technique) | formio-gnspd/models/I18N.md §2 (détection heuristique) |
| CHK-F10 | avertissement | 0 | aucune chaîne orpheline dans `i18n` (clé jamais affichée) | formio-gnspd/models/I18N.md §8 |
| CHK-F11 | bloquante | 0 | `htmlelement.content` traduit via {{ t('...') }} et clé présente dans i18n.fr | formio-gnspd/models/I18N.md §4 et §12 |
| CHK-F12 | bloquante | 0 | `innerHTML` / `outerHTML` / `insertAdjacentHTML` interdits (XSS) | formio-gnspd/models/SECURITY-RECAP.md §1 (erreur plateforme JS_INNERHTML_WRITE) |
| CHK-F13 | bloquante | 0 | `disabled: true` + `validate.required: true` interdit | formio-gnspd/models/VALIDATION.md §1 |
| CHK-F14 | bloquante | 0 | pays / région / préfecture / commune / profession → composant `select` | formio-gnspd/models/VALIDATION.md §4 |
| CHK-F15 | bloquante | 0 | composants `file` stricts (key file*, storage url, fileKey files, url portail, options "{}", image false, authenticate/fileFormName absents) | formio-gnspd/models/FILE-UPLOAD.md (« Règles critiques ») |
| CHK-F16 | avertissement | 0 | objet `validate` bien typé (required booléen, pattern compilable, minLength ≤ maxLength) | documentation/guide-validation-formio.md §1 |
| CHK-F17 | bloquante | 0 | `key` de composant non vide et unique (+ `id` uniques) | documentation/FormIO.md §2 (anatomie d'un composant) + Form.io (clés racine) |
| CHK-F18 | avertissement | 0 | `select` : valeurs d'options sans doublon | documentation/guide-validation-formio.md §1.C (validations par sélection) |
| CHK-F19 | avertissement | 0 | `i18n.fr` / `i18n.en` = dictionnaires plats de chaînes | formio-gnspd/models/I18N.md §5 (sections séparées, jamais fusionnées) |
| CHK-F20 | avertissement | 0 | `title` racine présent (titre du formulaire) | documentation/FormIO.md §1 (structure du schéma racine) |
| CHK-F21 | bloquante | 0 | formulaire de soumission : actions `soumission-de-la-demande-sp` ET `calcul-des-frais` présentes | formio-integrator/references/doc-officielle-gndad-formio.md §4 + documentation/Guide_Integration_Formulaires_PStudio_v1.md §12 (checklist 8.3) |
| CHK-F22 | bloquante | 0 | formulaire de paiement : actions `calcul-des-frais` ET `soumission-de-la-tache` présentes | formio-integrator/references/doc-officielle-gndad-formio.md §4 + formio-integrator/SKILL.md §12.2 (checklist 8.3) |
| CHK-F23 | bloquante | 0 | `config.<bloc>.users` : valeurs = chemins `user.*` acceptés par la plateforme (pas `user.phone`) | formio-integrator/references/doc-officielle-gndad-formio.md §2.6 (CONFIG_USERS_INVALID_PATH) |
| CHK-F24 | bloquante | 0 | tout template `{{ config.users.X }}` référence une clé définie dans `config.<bloc>.users` | formio-integrator/references/doc-officielle-gndad-formio.md §2 (STRUCT_TEMPLATE_USERS_KEY_MISSING) |
| CHK-F25 | bloquante | 0 | clé de composant = identifiant valide (lettres/chiffres/underscore, commence par une lettre) | formio-integrator/references/doc-officielle-gndad-formio.md §2.10 (CONVENTIONS_KEY_INVALID_FORMAT) |
| CHK-F26 | bloquante | 0 | champs JS avancés (customConditional, calculateValue, customDefaultValue, validate.custom) : aucun appel réseau, stockage, fenêtre ou DOM | formio-integrator/references/doc-officielle-gndad-formio.md §2.13 (codes JS_*) |
| CHK-F27 | bloquante | 0 | contenu HTML rendu : pas de script inline, gestionnaire d'événement inline ni URL `javascript:` | formio-integrator/references/doc-officielle-gndad-formio.md §2.10 (CONVENTIONS_HTML_UNSAFE) |
| CHK-F28 | bloquante | 0 | parité des environnements : chaque environnement officiel porte exactement les mêmes clés `users` que `development` | message plateforme mesuré le 2026-09-24 sur la modale « Valider » (« La structure "users" de "<env>" doit être identique à "development" (mêmes clés) ») + formio-integrator/references/doc-officielle-gndad-formio.md §2.6 (blocs `users`) |
| CHK-F29 | bloquante | 0 | formulaire de tâche (adossé à un `userTask`) : action racine `soumission-de-la-tache` présente | formio-gnspd/models/VALIDATION.md §3 (actions par nature : resoumission / instruction agent) + formio-integrator/references/doc-officielle-gndad-formio.md §4 l.167 (« soumission-de-la-tache » sur resoumission / traitement / paiement) + exemples/templates/srs-template.md l.226 |
| CHK-F30 | bloquante | 0 | formulaire de paiement : aucune action étrangère au paiement — seules `calcul-des-frais` (ou l'alias `calculate-costs`) et `soumission-de-la-tache` sont admises | consigne métier ATD (2026-09-27) : « les formulaires de paiement ne doivent rien contenir d'autre que les actions requises pour le paiement » |

## Constats

Aucun constat : les formulaires respectent les règles vérifiées.
### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_apposer_le_visa_du_chef_de_division_dans_l_e_parapheur_pstudio_xflow.json

Conforme aux règles vérifiées.

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_formaliser_les_elements_a_completer_ou_a_corriger_releves_lors_du_cont.json

Conforme aux règles vérifiées.

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_payer_les_frais.json

Conforme aux règles vérifiées.

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_resoumission_de_la_demande.json

Conforme aux règles vérifiées.

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_soumettre_la_demande_d_autorisation_de_promotion_commercial.json

Conforme aux règles vérifiées.

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_valider_le_refus.json

Conforme aux règles vérifiées.

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_verifier_la_completude_du_dossier_et_decider_s_il_est_complet_ou_a_cor.json

Conforme aux règles vérifiées.

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_verifier_la_conformite_du_projet_d_autorisation_transmis.json

Conforme aux règles vérifiées.

### C:\jeanluc\intégrationATD\integration-atd\projects\MDCCQ\DCIC\autorisation-promotion-commerciale\forms\dapc_verifier_le_projet_et_decider_l_octroi_la_correction_ou_le_refus_defin.json

Conforme aux règles vérifiées.

## Verdict

**CONFORME** — 0 bloquant(s), 0 avertissement(s).
