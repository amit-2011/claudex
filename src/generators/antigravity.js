import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, renameSync, rmdirSync } from 'fs';
import { join } from 'path';
import {
  buildArchitecture,
  buildStack,
  buildPatterns,
  buildModule,
  moduleFilename,
} from './context.js';
import { buildMandatoryStandards } from './standards.js';
import { plainChatInteractive } from './command-transpile.js';

// Generates config for Google Antigravity (agent-first IDE, Gemini-based).
// Antigravity natively reads the universal AGENTS.md (since v1.20.3), so the
// project rules + standards come for free from agents-md.js. Here we add the
// two tool-specific niceties:
//   - .agent/rules/*.md  — glob-scoped rules (the Cursor .mdc analog)
//   - .agent/workflows/*.md — Markdown slash commands ("Workflows")
//
// Conventions confirmed against antigravity.google/docs/rules-workflows:
//   - workspace dir is `.agent` (SINGULAR). v0.10.0 wrongly wrote `.agents`
//     (plural) — Antigravity never read it, so /plan and /sync were invisible.
//     migrateLegacyAgentsDir() moves those files over. NOTE: `.agents` (plural)
//     is the workspace dir of the separate Antigravity CLI (the Gemini CLI
//     successor) — never delete non-empty `.agents` content.
//   - rule frontmatter keys `trigger:` / `globs:` and the four activation modes
//   - workflow `description:` must be a single-line plain string (folded block
//     scalars like `description: >` crash Antigravity's workflow parser and
//     hide ALL slash commands)
//   - workflows have no confirmed arg-placeholder syntax → free-text args
//   - 12,000-char limit per rule file (our files are well under)

// ── .agent/rules/*.md (glob-scoped) ───────────────────────────────────
export function generateAntigravity(cwd, { fileData, stack, modules, patterns }) {
  if (patterns?.stateManagement) stack = { ...stack, stateManagement: patterns.stateManagement };
  migrateLegacyAgentsDir(cwd);

  const rulesDir = join(cwd, '.agent', 'rules');
  const modulesDir = join(rulesDir, 'modules');
  mkdirSync(modulesDir, { recursive: true });

  writeFileSync(
    join(rulesDir, 'architecture.md'),
    rule({ alwaysOn: true, desc: 'Project architecture — read before structural changes' }, buildArchitecture(fileData, stack, modules))
  );
  writeFileSync(
    join(rulesDir, 'stack.md'),
    rule({ alwaysOn: true, desc: 'Tech stack, package manager, and common commands' }, buildStack(stack, patterns))
  );
  writeFileSync(
    join(rulesDir, 'patterns.md'),
    rule(
      { alwaysOn: true, desc: 'Code conventions + MANDATORY standards — always follow' },
      buildPatterns(patterns, stack) + '\n\n' + buildMandatoryStandards({ stack, patterns, modules })
    )
  );

  const written = [];
  for (const mod of modules) {
    const filename = moduleFilename(mod.name);
    writeFileSync(
      join(modulesDir, filename),
      rule({ globs: mod.path ? `${mod.path}/**` : '', desc: `Context for the ${mod.name} module` }, buildModule(mod))
    );
    written.push({ name: mod.name, filename, fileCount: mod.files.length });
  }

  return written;
}

export function regenerateAntigravityRules(cwd, modules) {
  migrateLegacyAgentsDir(cwd);
  const modulesDir = join(cwd, '.agent', 'rules', 'modules');
  mkdirSync(modulesDir, { recursive: true });
  for (const mod of modules) {
    writeFileSync(
      join(modulesDir, moduleFilename(mod.name)),
      rule({ globs: mod.path ? `${mod.path}/**` : '', desc: `Context for the ${mod.name} module` }, buildModule(mod))
    );
  }
}

// Antigravity rule frontmatter. Always-on rules apply to every request; glob
// rules apply only when matching files are touched (the Cursor-rules analog).
function rule({ alwaysOn = false, globs = '', desc = '' }, content) {
  const fm = ['---', `description: ${desc}`];
  if (alwaysOn || !globs) {
    fm.push('trigger: always_on');
  } else {
    fm.push('trigger: glob', `globs: ${globs}`);
  }
  fm.push('---', '');
  return fm.join('\n') + content;
}

// ── .agent/workflows/*.md (Markdown slash commands) ──────────────────
// Transpiled from the shared Markdown command templates: rewrite .claude/ paths
// to the Antigravity equivalents and drop $ARGUMENTS (free-text args).
export function generateAntigravityWorkflows(cwd, templateCommandsDir, { force = false } = {}) {
  migrateLegacyAgentsDir(cwd);
  const dir = join(cwd, '.agent', 'workflows');
  mkdirSync(dir, { recursive: true });

  const written = [];
  for (const file of readdirSync(templateCommandsDir)) {
    if (!file.endsWith('.md')) continue;
    const name = file.replace(/\.md$/, '');
    const dest = join(dir, file);
    if (!force && existsSync(dest)) continue;

    const md = readFileSync(join(templateCommandsDir, file), 'utf8');
    writeFileSync(dest, toWorkflow(name, md));
    written.push(name);
  }
  return written;
}

function toWorkflow(name, md) {
  const body = plainChatInteractive(
    stripFrontmatter(md)
      .replace(/\$ARGUMENTS/g, 'the request provided with this command')
      .replace(/!`([^`]+)`/g, '`$1`')             // drop Claude exec marker → plain code span
      .replace(/\.claude\/context\//g, '.agent/rules/')
      .replace(/\.claude\/skills\//g, '.agent/skills/')
      .trim()
  );

  // Antigravity workflows begin with YAML frontmatter carrying `description:`;
  // the filename (minus .md) is the command name.
  return `---\ndescription: ${describeWorkflow(name)}\n---\n\n${body}\n`;
}

// Drop a leading YAML frontmatter block (Claude templates like pp-help/pp-stats
// start with one) so we don't emit double frontmatter in the workflow file.
function stripFrontmatter(md) {
  return md.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function describeWorkflow(name) {
  return {
    ask: 'Natural language to plan to execute, cross-repo aware',
    plan: 'Interactive planning only — shows the approach, writes no code',
    sync: 'Re-scan and regenerate all project context',
    'pp-stats': 'Show the context stats dashboard',
    'pp-help': 'List all commands and their use-cases',
  }[name] || `promptpilot-ai ${name} command`;
}

// ── helpers ───────────────────────────────────────────────────────────
export function antigravityInstalled(cwd) {
  return (
    existsSync(join(cwd, '.agent', 'rules')) ||
    existsSync(join(cwd, '.agent', 'workflows')) ||
    hasLegacyAgentsDir(cwd)
  );
}

// v0.10.0 wrote into `.agents/` (plural) — a dir Antigravity never reads.
export function hasLegacyAgentsDir(cwd) {
  return existsSync(join(cwd, '.agents', 'rules')) || existsSync(join(cwd, '.agents', 'workflows'));
}

// Move the v0.10.0 output (`.agents/rules`, `.agents/workflows`, plus the
// per-machine `.last-sync` / `.pp-stats.json` markers) to `.agent/`. Only the
// emptied dirs are removed — `.agents/` itself may belong to the Antigravity
// CLI (skills/, mcp_config.json, hooks.json), so anything we didn't write
// stays untouched and `.agents/` is only deleted when it ends up empty.
export function migrateLegacyAgentsDir(cwd) {
  const legacy = join(cwd, '.agents');
  if (!existsSync(legacy)) return false;

  let moved = false;
  for (const sub of ['rules', 'workflows']) {
    if (moveTree(join(legacy, sub), join(cwd, '.agent', sub))) {
      moved = true;
      fixLegacyPathRefs(join(cwd, '.agent', sub)); // bodies reference `.agents/...` paths
    }
  }
  for (const marker of ['.last-sync', '.pp-stats.json']) {
    const src = join(legacy, marker);
    if (!existsSync(src)) continue;
    const dest = join(cwd, '.agent', marker);
    try {
      mkdirSync(join(cwd, '.agent'), { recursive: true });
      if (!existsSync(dest)) renameSync(src, dest);
      moved = true;
    } catch {}
  }
  try { rmdirSync(legacy); } catch {} // only succeeds when empty — by design
  return moved;
}

// v0.10.0-generated bodies point at `.agents/rules/` etc. — rewrite to `.agent/`.
function fixLegacyPathRefs(dir) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) { fixLegacyPathRefs(p); continue; }
      if (!entry.name.endsWith('.md')) continue;
      const md = readFileSync(p, 'utf8');
      const fixed = md.replace(/\.agents\/(rules|workflows|skills)\//g, '.agent/$1/');
      if (fixed !== md) writeFileSync(p, fixed);
    }
  } catch {}
}

// Recursively move a directory's files, skipping any path that already exists
// at the destination; removes source dirs that end up empty.
function moveTree(srcDir, destDir) {
  if (!existsSync(srcDir)) return false;
  let moved = false;
  let entries;
  try {
    mkdirSync(destDir, { recursive: true });
    entries = readdirSync(srcDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    try {
      if (entry.isDirectory()) {
        moved = moveTree(src, dest) || moved;
      } else if (!existsSync(dest)) {
        renameSync(src, dest);
        moved = true;
      }
    } catch {}
  }
  try { rmdirSync(srcDir); } catch {}
  return moved;
}
