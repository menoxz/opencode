export interface FileLinkMatch {
  text: string
  path: string
  line?: number
  start: number
  end: number
}

// Lookbehind (instead of a consuming leading-char group) keeps the boundary whitespace/
// punctuation out of the match so `start`/`end` line up exactly with `text`. Extensions are
// ordered longest-first so alternation can't shadow a longer one with a shorter prefix
// (e.g. "ts" matching first would truncate "tsx", "js" would truncate "json").
const FILE_PATH_REGEX =
  /(?<=^|[\s(`"'])((?:\.{1,2}\/|[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:java|json|yaml|html|toml|tsx|jsx|yml|css|sql|txt|ts|js|py|rs|go|md|sh))(?::(\d+)(?::\d+)?)?/g

export function detectFileLinks(text: string): FileLinkMatch[] {
  const regex = new RegExp(FILE_PATH_REGEX)
  const matches: FileLinkMatch[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      text: match[0],
      path: match[1],
      line: match[2] ? parseInt(match[2], 10) : undefined,
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}
