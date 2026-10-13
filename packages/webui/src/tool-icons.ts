/**
 * Une icône par famille d'outil.
 *
 * Le nom technique (`bash`, `todowrite`, `turn_plan`) n'est pas un mot d'écran : l'icône porte le
 * sens, le nom reste en infobulle et en texte secondaire. Un outil inconnu reçoit l'icône
 * générique — jamais un carré vide, jamais son identifiant brut mis en avant.
 *
 * Le classement est **par famille**, pas par outil : `read`, `list` et `glob` font la même chose
 * du point de vue de qui lit (lire), et trois icônes différentes y ajouteraient du bruit.
 */

export type ToolIconName =
  | "read"
  | "write"
  | "shell"
  | "search"
  | "subagent"
  | "ask"
  | "plan"
  | "todo"
  | "skill"
  | "web"
  | "goal"
  | "generic"

const FAMILIES: Record<string, ToolIconName> = {
  read: "read",
  list: "read",
  glob: "read",
  write: "write",
  edit: "write",
  bash: "shell",
  shell: "shell",
  grep: "search",
  find: "search",
  task: "subagent",
  question: "ask",
  turn_plan: "plan",
  planning: "plan",
  plan_enter: "plan",
  plan_exit: "plan",
  todowrite: "todo",
  skill: "skill",
  skill_search: "skill",
  webfetch: "web",
  websearch: "web",
  complete_objective: "goal",
  create_objective: "goal",
  edit_objective: "goal",
  suggest_objectif: "goal",
  apply_contract_from_prompt: "goal",
}

export function toolIcon(tool: string): ToolIconName {
  return FAMILIES[tool] ?? "generic"
}

/**
 * Ce que fait l'outil, en un mot, pour l'infobulle. Un outil inconnu n'a pas de description
 * inventée : on rend son nom technique plutôt qu'une phrase fausse.
 */
const VERBS: Record<ToolIconName, string> = {
  read: "read",
  write: "write",
  shell: "command",
  search: "search",
  subagent: "subagent",
  ask: "question",
  plan: "plan",
  todo: "tasks",
  skill: "skill",
  web: "web",
  goal: "goal",
  generic: "tool",
}

export function toolVerb(tool: string): string {
  return VERBS[toolIcon(tool)]
}
