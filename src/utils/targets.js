// The set of AI tools promptpilot-ai can generate context for. `target` used to
// be a single string ('claude' | 'cursor' | 'both'); it is now a SET of tools so
// any combination (e.g. Claude + Gemini) is representable. `normalizeTargets`
// keeps back-compat with the old string form (and the legacy 'both').

export const TOOLS = ['claude', 'cursor', 'gemini', 'antigravity'];

const LABELS = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  gemini: 'Gemini CLI',
  antigravity: 'Antigravity',
};

// Accept a legacy string ('claude' | 'cursor' | 'both' | 'gemini' | 'antigravity'),
// an array of tools, or undefined; always return a de-duped array of valid tools.
export function normalizeTargets(input) {
  if (Array.isArray(input)) {
    const set = input.filter((t) => TOOLS.includes(t));
    return set.length ? [...new Set(set)] : ['claude'];
  }
  if (input === 'both') return ['claude', 'cursor'];
  if (TOOLS.includes(input)) return [input];
  return ['claude'];
}

// Does this target set include the given tool?
export function wants(targets, tool) {
  return normalizeTargets(targets).includes(tool);
}

export function toolLabel(tool) {
  return LABELS[tool] || tool;
}

// Single preference order used everywhere a "primary" tool must be chosen, so
// the stats cache, the .last-sync marker, and the cache's tool tag never disagree.
const PRIMARY_ORDER = ['claude', 'cursor', 'gemini', 'antigravity'];

export function primaryTool(targets) {
  const t = normalizeTargets(targets);
  return PRIMARY_ORDER.find((tool) => t.includes(tool)) || 'claude';
}

// Antigravity (IDE) reads `.agent` — SINGULAR. `.agents` (plural) belongs to
// the separate Antigravity CLI and was also our buggy v0.10.0 output dir.
const TOOL_DIR = { claude: '.claude', cursor: '.cursor', gemini: '.gemini', antigravity: '.agent' };

// The directory that holds the per-project sync marker + stats cache.
export function primaryDir(targets) {
  return TOOL_DIR[primaryTool(targets)];
}
