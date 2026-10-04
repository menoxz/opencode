# Reproduire la connexion GitHub Copilot → opencodev2 (token importé depuis VS Code)

> **Fichier d'instructions destiné à un agent de codage.**
> Objectif : reproduire, de bout en bout, la connexion d'un abonnement GitHub Copilot
> à opencodev2 en réutilisant le token OAuth `gho_` que VS Code a déjà stocké dans le
> Gestionnaire d'informations d'identification Windows.
>
> Environnement cible : Windows (win32), shell pwsh 7+, binaire `opencodev2`
> (fork opencode, branche `dev`, repo `C:\jeanluc\opencode-fork`).

---

## 1. Contexte technique (à lire avant d'agir)

### 1.1 Principe

VS Code (via son extension d'authentification GitHub et GitHub Copilot) stocke le
token OAuth GitHub de l'utilisateur — format `gho_`, 40 caractères — dans le
**Gestionnaire d'informations d'identification Windows** (Credential Manager), sous la
cible :

```
git:https://github.com
```

opencodev2 fournit la commande `providers import-copilot` qui :

1. lit cette entrée via l'API Win32 `CredRead` (`advapi32.dll`, P/Invoke C#) ;
2. vérifie le token contre `https://api.githubcopilot.com/models`
   (réponse HTTP 2xx = abonnement Copilot actif) ;
3. enregistre le token dans `C:\Users\<user>\.local\share\opencode\auth.json` sous
   le provider `github-copilot` avec `{ type: "oauth", refresh: <token>,
   access: <token>, expires: 0 }`.

À l'exécution, le plugin interne `CopilotAuthPlugin`
(`packages/opencode/src/plugin/github-copilot/copilot.ts`) charge ce credential et
appelle `api.githubcopilot.com` avec des en-têtes d'intégration qui imitent
l'extension Copilot de VS Code :

```
Authorization: Bearer <token gho_>
Copilot-Integration-Id: vscode-chat
Editor-Version: vscode/1.96.0
Openai-Intent: conversation-edits
x-initiator: user | agent          (détecté dynamiquement)
Copilot-Vision-Request: true       (uniquement si des images sont envoyées)
User-Agent: opencode/<version>
```

C'est ce mimétisme d'en-têtes qui fait reconnaître l'abonnement par le backend
Copilot.

### 1.2 Fichiers sources de référence (fork)

| Rôle | Fichier |
|---|---|
| Commande CLI `import-copilot` (lecture CredRead + vérification + sauvegarde) | `packages/opencode/src/cli/cmd/providers.ts` (l. 523-656 : `WINDOWS_CREDENTIAL_SCRIPT`, `ProvidersImportCopilotCommand`) |
| Enregistrement de la sous-commande | `packages/opencode/src/cli/cmd/providers.ts` l. 248 |
| Plugin d'auth/exécution Copilot (en-têtes, models, chat.params) | `packages/opencode/src/plugin/github-copilot/copilot.ts` |
| Catalogue de modèles Copilot | `packages/opencode/src/plugin/github-copilot/models.ts` |

### 1.3 Emplacement des credentials

- auth.json opencode : `C:\Users\<user>\.local\share\opencode\auth.json`
- Credential Manager : cible `git:https://github.com` (type Generic, créée par
  VS Code / Git Credential Manager lors de la connexion GitHub)

---

## 2. Prérequis à vérifier avant de commencer

L'agent doit exécuter ces vérifications **dans l'ordre** et s'arrêter avec un
diagnostic précis si un prérequis manque.

### 2.1 Binaire opencodev2 disponible

```powershell
opencodev2 --version
```

- **Attendu** : un numéro de version s'affiche, sans erreur.
- **Si échec** : le binaire n'est pas installé. Reconstruire/déployer depuis le fork
  (voir skill `fork-build`, OBLIGATOIRE avant tout build :
  `skill("fork-build")`, repo `C:\jeanluc\opencode-fork`, branche `dev`).

### 2.2 VS Code a déjà été connecté à GitHub (token présent dans le Credential Manager)

Lister les credentials GitHub :

```powershell
cmdkey /list | Select-String -Pattern "github"
```

- **Attendu** : une ligne `Cible : LegacyGeneric:target=git:https://github.com`.
- **Si absent** : l'utilisateur n'a jamais authentifié GitHub dans VS Code/Git sur
  cette machine. **Blocage externe** : demander à l'utilisateur d'ouvrir VS Code,
  se connecter à GitHub (synchronisation des paramètres ou extension Copilot), puis
  relancer la vérification. Ne pas tenter de créer le token soi-même via le flow
  device-code sans demander confirmation (voir §6, variante B).

### 2.3 Abonnement Copilot actif sur le compte GitHub

Non vérifiable localement sans le token : c'est l'étape de vérification de la
commande (§4.3) qui le confirme. Si la vérification échoue, le compte n'a pas
d'abonnement Copilot actif → **blocage externe** (l'utilisateur doit souscrire ou
vérifier https://github.com/settings/copilot).

---

## 3. Procédure de reproduction

### Étape 1 — Vérifier l'état initial de auth.json

```powershell
$p = "$env:USERPROFILE\.local\share\opencode\auth.json"
if (Test-Path $p) {
  $j = Get-Content $p -Raw | ConvertFrom-Json
  $j.PSObject.Properties | ForEach-Object {
    "$($_.Name) => type=$($_.Value.type) expires=$($_.Value.expires)"
  }
} else { "auth.json absent: $p" }
```

Noter si `github-copilot` figure déjà. C'est le point de repère pour la fin.

### Étape 2 — Lancer l'import

```powershell
opencodev2 providers import-copilot
```

La commande est interactive (bannière "Import GitHub Copilot", spinners). Sur
Windows elle exécute successivement :

1. **Reading GitHub token from Windows Credential Manager...**
   exécute `powershell -NoProfile -Command $WINDOWS_CREDENTIAL_SCRIPT`
   (P/Invoke `CredRead("git:https://github.com")`, timeout 15 s).
2. **Verifying token against GitHub Copilot API...**
   `GET https://api.githubcopilot.com/models` avec
   `Authorization: Bearer <token>`, timeout 10 s.
3. **Saving credential to opencode auth.json...**
   `authSvc.set("github-copilot", { type: "oauth", refresh, access, expires: 0 })`.

**Résultat attendu** (dernière ligne) :

```
Done — you can now use GitHub Copilot with opencodev2. Run `opencodev2 auth list` to verify.
```

### Étape 3 — Vérifier la persistance

```powershell
opencodev2 providers list
```

- **Attendu** : `github-copilot` apparaît avec type `oauth`.
- Cross-check direct du fichier :

```powershell
$p = "$env:USERPROFILE\.local\share\opencode\auth.json"
$j = Get-Content $p -Raw | ConvertFrom-Json
$e = $j.'github-copilot'
"type=$($e.type) expires=$($e.expires) refreshLen=$($e.refresh.Length) prefix=$($e.refresh.Substring(0,4))"
```

- **Attendu** : `type=oauth expires=0 refreshLen=40 prefix=gho_`
  (le préfixe `gho_` = token OAuth GitHub ; jamais afficher le token complet).

### Étape 4 — Vérifier que l'inférence fonctionne réellement

Le test de vérité terrain : un appel de complétion via le provider.

```powershell
opencodev2 models github-copilot
```

> ⚠️ Syntaxe : `models [provider]` prend le provider en argument positionnel.
> `opencodev2 models list` échoue avec `Error: Provider not found: list`.

- **Attendu** : une liste de modèles `github-copilot/...` (ex. vérifié le
  2026-09-04 : 29 modèles, dont `github-copilot/gpt-5.5`,
  `github-copilot/claude-opus-5`, `github-copilot/gemini-3.8-flash`).
  La liste est résolue en direct par `CopilotModels.get()` qui interroge
  `api.githubcopilot.com/models` avec le token — si elle est non vide, le token
  est accepté par le backend.

Puis un test de bout en bout (selon l'interface disponible) :

```powershell
# Non interactif, via la CLI du fork — prompt trivial
opencodev2 run --model github-copilot/gpt-5.5 "Reply with exactly: OK"
```

> Ajuster l'identifiant exact du modèle à la sortie de
> `opencodev2 models github-copilot` (les modèles Copilot sont résolus
> dynamiquement). Le critère d'acceptation est une **réponse non vide du
> modèle** : cela prouve que les en-têtes d'intégration
> (`Copilot-Integration-Id: vscode-chat`, `Editor-Version`, ...) sont acceptés
> par le backend avec ce token.
>
> **Preuve d'exécution (2026-09-04, cette machine)** :
> ```
> $ opencodev2 run --model github-copilot/gpt-5.5 "Reply with exactly: OK"
> > build · gpt-5.5
> OK
> ```

---

## 4. Dépannage (symptômes observables → actions)

| Symptôme | Cause probable | Action de l'agent |
|---|---|---|
| `This command currently only supports Windows` | Plateforme non-Windows | Reproduire uniquement sur Windows ; sur Linux/macOS, le token VS Code vit dans un autre keyring (non couvert ici) |
| `No GitHub credential found` | Pas d'auth GitHub VS Code/Git sur la machine | Blocage externe → demander à l'utilisateur de se connecter dans VS Code d'abord (§2.2) |
| `The credential is not a valid GitHub OAuth token` | Le credential ne commence pas par `gho_` (ex. `ghp_` PAT classique) | Le PAT classique `ghp_` n'est pas accepté par l'API Copilot de la même façon ; utiliser le token OAuth de VS Code, ou la variante B (§6) |
| `Verification failed` / `token does not have access to GitHub Copilot` | Pas d'abonnement Copilot actif, ou token révoqué | Vérifier https://github.com/settings/copilot côté utilisateur ; si token révoqué, se reconnecter dans VS Code pour rafraîchir l'entrée du Credential Manager |
| `github-copilot` absent de `opencodev2 providers list` malgré un "Done" | Échec d'écriture de auth.json | Vérifier les droits sur `%USERPROFILE%\.local\share\opencode\`, relancer, inspecter stderr avec `--print-logs --log-level DEBUG` |
| Modèles listés mais réponses en erreur 401/403 à l'inférence | En-têtes d'intégration manquants côté plugin | Vérifier que `copilot.ts` contient bien `Copilot-Integration-Id: vscode-chat` et `Editor-Version` (commits `d7082c6c1`, `5db9ae5ac`, `04c0365f0`) ; sinon, c'est une régression du fork → corriger le plugin |
| Timeout pendant la vérification | Réseau/proxy bloquant `api.githubcopilot.com` | Vérifier la connectivité : `Invoke-WebRequest https://api.githubcopilot.com/models -Method GET` (attendu : 401 sans token = API joignable) |

---

## 5. Points de vigilance pour l'agent

1. **Ne jamais afficher ni logger le token complet** (secret). Les vérifications
   doivent se limiter au préfixe (`gho_`) et à la longueur.
2. **auth.json est un fichier de secrets** : ne pas le copier, l'envoyer, ou le
   committer. Ne pas modifier manuellement sauf si la commande échoue — dans ce
   cas préférer relancer la commande plutôt qu'un édition à la main.
3. **Ne pas créer d'entrées dans le Credential Manager soi-même** (pas de
   `cmdkey /generic` avec un token) : la source du token doit rester VS Code.
4. **Ne pas démarrer de serveur dev** pour ce test : tout est fait via la CLI
   `opencodev2`, aucune instance longue n'est nécessaire.
5. **Interactivité** : `import-copilot` est une commande interactive avec spinners ;
   dans un contexte non interactif, elle reste non bloquante (aucun prompt
   requis sur le chemin GitHub.com).
6. **Le test d'inférence (§3 étape 4)** consomme le quota Copilot de
   l'utilisateur : l'exécuter une seule fois, avec un prompt trivial
   (`"Reply with exactly: OK"`), et ne pas itérer en boucle.

---

## 6. Variante B — Flow OAuth device-code (sans VS Code)

Si le prérequis §2.2 est impossible (pas de VS Code connecté), le plugin propose un
flow OAuth standard **"Login with GitHub Copilot"** disponible via :

```powershell
opencodev2 providers login github-copilot
```

Mécanisme (dans `copilot.ts`, `methods[0]`, client ID `Ov23li8tweQw6odWQebz`) :

1. `POST https://github.com/login/device/code` avec `client_id` et
   `scope=read:user` → retourne `verification_uri` + `user_code`.
2. L'utilisateur ouvre l'URL et saisit le code.
3. Polling de `POST https://github.com/login/oauth/access_token` avec
   `grant_type=urn:ietf:params:oauth:grant-type:device_code` (respecte `interval`,
   gère `slow_down` selon RFC 8628 §3.5, marge de sécurité +3 s).
4. Au succès : `{ type: "oauth", refresh: <token>, access: <token>, expires: 0 }`
   est enregistré (même format que la variante A).

Supporte aussi GitHub Enterprise (`deploymentType=enterprise`, URL personnalisée →
base API `https://copilot-api.<domaine>`).

**Quand l'utiliser** : première machine, ou si l'utilisateur préfère un flow
dédifié. La variante A (import) reste la voie "réutilisation du login VS Code".

---

## 7. Critères d'acceptation (DoD)

- [ ] `opencodev2 providers list` affiche `github-copilot` (type `oauth`).
- [ ] `auth.json` contient l'entrée `github-copilot` avec `type=oauth`,
      `expires=0`, token 40 chars préfixé `gho_`.
- [ ] `opencodev2 models github-copilot` montre des modèles `github-copilot/*`.
- [ ] Un appel d'inférence avec un modèle Copilot renvoie une **réponse non vide**
      (preuve que les en-têtes d'intégration sont acceptés).
- [ ] Aucun secret affiché en clair dans la sortie de l'agent.

## 8. Traçabilité du code source (références exactes)

| Élément | Localisation |
|---|---|
| Client ID OAuth device-code | `copilot.ts` l. 12 (`Ov23li8tweQw6odWQebz`) |
| Script CredRead (P/Invoke `advapi32.dll`) | `providers.ts` l. 523-553 (`WINDOWS_CREDENTIAL_SCRIPT`) |
| Commande `import-copilot` | `providers.ts` l. 555-656 (`ProvidersImportCopilotCommand`) |
| Enregistrement yargs | `providers.ts` l. 248 |
| En-têtes d'intégration VS Code | `copilot.ts` l. 150-158 |
| Sélection API / fix modèles | `copilot.ts` l. 46-55 (`fix()`), `models.ts` |
| Commits de référence | `d7082c6c1` (import + fix models), `5db9ae5ac` (strip `service_tier`), `04c0365f0` (`Copilot-Integration-Id`) |
