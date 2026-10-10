# Composant `schedule` — réveil planifié de l'agent

Statut : implémenté le 2026-10-10 (plugin). Décision d'architecture : plugin activable/désactivable
par configuration seule, sans aucune modification du code du harnais.

| Rôle | Fichier |
|---|---|
| Hôte plugin (hooks, boucle, verrou) | `.opencode/plugin/schedule.ts` |
| Logique pure (déclencheurs, persistance, formatage) | `.opencode/plugin/schedule-lib.ts` |
| Tests unitaires | `.opencode/tests/schedule.test.ts` |
| Test d'intégration (client SDK simulé) | `.opencode/tests/schedule-plugin.test.ts` |
| Spécification | `specs/schedule-plugin.md` (ce fichier) |

## 1. Objectif

Planifier des tâches qui **réveillent l'agent** plus tard, sans humain présent :

- `once` — à une date/heure donnée (ISO 8601, `+30m`, `45m`, epoch ms) ;
- `interval` — toutes les N secondes/minutes/heures/jours ;
- `cron` — expression 5 champs (min heure jour-du-mois mois jour-semaine), heure locale ;
- `event` — sur un événement du bus opencode (`session.idle`, `file.edited`, …), avec filtre
  `where` (sous-ensemble de propriétés) et anti-rebond `cooldown`.

Le réveil = envoi d'un prompt à une session opencode (session d'origine, session désignée, ou
nouvelle session) via le client SDK in-process fourni au plugin. Effet identique à un message
utilisateur : l'agent traite la demande normalement.

## 2. Architecture : pourquoi un plugin

- Le composant vit dans le dossier `plugin/` du projet : le harnais n'est pas modifié (aucun
  fichier de `packages/opencode`).
- Cycle de vie : chargé au démarrage par le système de plugins ; il reçoit le client SDK et
  retourne les hooks `event` (bus) et `tool` (outil `schedule`).
- Le fork ignore volontairement l'auto-découverte des plugins de projet (« ignoring
  auto-discovered project plugins », `packages/opencode/src/config/config.ts`) : l'activation
  passe par une entrée explicite de configuration (§3).
- Un échec de chargement du plugin est journalisé par le harnais et n'empêche ni le démarrage
  ni les autres plugins.
- Le plugin n'exporte qu'une chose : sa fabrique par défaut (contrat du chargeur pour les plugins
  « legacy » : chaque export serait sinon traité comme une fabrique).

## 3. Activation / désactivation (aucune modification de code)

Configuration globale `~/.config/opencodev2/opencode.jsonc`, tableau `plugin` :

```jsonc
"plugin": [
  /* … entrées existantes … */
  ["file:///C:/jeanluc/opencode-fork/.opencode/plugin/schedule.ts", { "enabled": true }]
]
```

Désactiver : `"enabled": false` (le plugin se charge mais ne crée ni timer ni outil), ou retirer
l'entrée. Redémarrer le serveur opencode : les entrées de configuration sont résolues au
démarrage (la mise à jour à chaud ne couvre que le code d'un plugin déjà chargé).

Options (2ᵉ élément du tuple) :

| option | défaut | rôle |
|---|---|---|
| `enabled` | `true` | `false` : plugin inerte |
| `storeDir` | `~/.local/share/opencodev2/schedule` (via `XDG_DATA_HOME`) | plans, journal, verrou |
| `tickSeconds` | `15` | période de la boucle de réveil (1–3600) |
| `maxSchedules` | `100` | nombre maximal de plans |
| `defaultAgent` | — | agent utilisé si le plan n'en définit pas |
| `allowEvents` | `true` | `false` : désactive les déclencheurs `event` |

## 4. Données manipulées

**`Schedule`** (un plan, persisté) : `id`, `name`, `enabled`, `trigger`, `prompt` (texte du
réveil), `agent?`, `model?`, `sessionID?` (cible), `freshSession?` (nouvelle session à chaque
réveil), `maxRuns?`, `expiresAt?`, `createdAt`, `updatedAt`, `runs` (compteur), `lastRunAt?`,
`lastStatus?`, `lastError?`, `nextAt?` (prochaine échéance), `lastEventAt?` (anti-rebond).

**`Trigger`** : `{type:"once", at}` | `{type:"interval", everyMs, firstAt?}` |
`{type:"cron", expr}` | `{type:"event", event, where?, cooldownMs?}`.

**`RunEntry`** (journal append-only) : `ts`, `id`, `name`, `status` (`ok`|`error`), `sessionID?`,
`detail?`.

**`LockInfo`** (verrou multi-processus `owner.json`) : `pid`, `startedAt`, `host`.

## 5. Entrées (ce que le composant reçoit, et de qui)

| entrée | fournie par | forme | usage |
|---|---|---|---|
| options du plugin | chargeur de plugins (config) | `{enabled, storeDir, tickSeconds, maxSchedules, defaultAgent, allowEvents}` | §3 |
| appels de l'outil `schedule` | le modèle, via le registre d'outils | `{action, …}` (voir ci-dessous) | créer / consulter / piloter les plans |
| événements du bus | serveur opencode (hook `event`) | `{type, properties}` | déclencheurs `event` |
| horloge | timer interne (tick) | — | déclencheurs `once` / `interval` / `cron` |
| état persisté | disque (`schedules.json`) | `StoreShape` | relu à chaque opération |

Actions de l'outil : `create` (`prompt` + un déclencheur parmi `after`, `every`, `cron`, `on` ;
options `name`, `firstAt`, `where`, `cooldown`, `agent`, `model`, `sessionID`, `freshSession`,
`maxRuns`, `expiresIn`), `list`, `get`, `pause`, `resume`, `delete`, `history`, `run` (réveil
manuel immédiat, sans consommer `runs`).

## 6. Sorties (ce que le composant émet, et vers qui)

| sortie | destinataire | transport |
|---|---|---|
| réveil : `session.create` puis `session.prompt` | serveur opencode | client SDK in-process (le prompt devient un message de session) |
| résultat d'action | modèle (tool call) | chaîne `{title, output}` |
| `schedules.json` | prochain démarrage, autres sessions/processus | fichier, écriture atomique (tmp + rename) |
| `runs.jsonl` | opérateur humain, action `history` | fichier append-only |
| `owner.json` | autres instances du plugin (verrou) | fichier |
| journal opérationnel | opérateur | stderr (`[schedule] …`) |

## 7. Cycle de vie

1. **Chargement** — le chargeur résout l'entrée `plugin` de la config globale (`file:///…/schedule.ts`),
   importe le module et l'appelle avec `PluginInput` (client SDK, `directory`, `worktree`) et les
   options. La fabrique normalise les options, relit `schedules.json`, tente de prendre le verrou
   propriétaire et démarre la boucle (`tick` immédiat, puis enchaînement par `setTimeout`).
   Instances multiples : une fabrique déjà installée est disposée (timers arrêtés, verrou libéré)
   avant l'installation de la nouvelle.
2. **Veille** — un tick toutes les `tickSeconds` (défaut 15 s) : battement de verrou, relecture du
   store, mise en file des échéances dues, traitement **séquentiel** (un réveil à la fois). Les
   événements du bus arrivent par le hook `event`, sont filtrés (`event`, `where`, `cooldown`) et
   mis en file de la même façon (relecture du store limitée à 1 fois / 5 s).
3. **Réveil** — `session.create` si nécessaire, puis `session.prompt` (texte du plan, agent et
   modèle éventuels). Le résultat est journalisé (`runs.jsonl`) et réécrit dans `schedules.json`
   après relecture, pour ne pas écraser les modifications d'un autre processus.
4. **Arrêt / rechargement** — timers `unref()`és (ils ne bloquent pas l'arrêt) ; à chaud, la
   fabrique disposée libère le verrou et laisse la place à la nouvelle instance.

## 8. Garanties et erreurs

- **Au moins une fois** : un plan dû pendant un arrêt se déclenche une fois au redémarrage, puis
  reprend sa grille (once : late-ok, une seule fois ; interval : décalage rattrapé en un tir).
- **Store corrompu** : mis en quarantaine (`schedules.json.corrupt-<ts>`), redémarrage à vide —
  jamais de perte silencieuse.
- **Échec de réveil** : statut `error` + `lastError` persistés, entrée `runs.jsonl` ; pas de
  retry serré — pour `once`, le run est consommé ; l'action `run` permet de retester à la main.
- **Verrou** : un seul processus exécute le planificateur temporel (les événements restent
  locaux au processus, par construction).
- **Bornes** : `maxSchedules` (100), durées ≤ 366 j, recherche cron ≤ 5 ans, `name` tronqué à 80 c.

## 9. Limites connues / non-objectifs

- Pas de retry immédiat après échec de réveil (cf. §8) ; pas de file distribuée.
- `cooldown` d'événement local au processus (pas partagé entre instances).
- Déclencheurs `event` : seulement les événements émis dans le processus du plugin.
- Pas d'interface TUI : pilotage par l'outil `schedule` ou édition du store à froid.

## 10. Tests

- Depuis `.opencode` : `bun test tests/schedule.test.ts` — logique pure : parseurs, cron,
  échéances, store, verrou, `wake` avec client simulé, création/validation des plans.
- `bun test tests/schedule-plugin.test.ts` — intégration fabrique : chargement inerte
  (`enabled:false`), create/list/run via l'outil, erreurs de réveil journalisées.
- État vérifié le 2026-10-10 : 22 pass / 0 fail (bun 1.4.2).
- Fumée : depuis `.opencode`, `bun -e "import('./plugin/schedule.ts')"` (résolution des imports).
