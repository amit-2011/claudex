import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  buildArchitecture,
  buildStack,
  buildPatterns,
  buildModule,
  moduleFilename,
} from './context.js';
import { buildMandatoryStandards } from './standards.js';

// Generates config for Google Antigravity (agent-first IDE, Gemini-based).
// Antigravity natively reads the universal AGENTS.md (since v1.20.3), so the
// project rules + standards come for free from agents-md.js. Here we add the
// two tool-specific niceties:
//   - .agents/rules/*.md  — glob-scoped rules (the Cursor .mdc analog)
//   - .agents/workflows/*.md — Markdown slash commands ("Workflows")
//
// [U] CONVENTIONS TO VERIFY against a live Antigravity build before relying on
// them (docs are a non-scrapable SPA — values below are the best-confirmed):
//   - rules dir is `.agents` (plural, current default) w/ legacy `.agent`
//   - rule frontmatter keys `trigger:` / `globs:` and the four activation modes
//   - workflows have no confirmed arg-placeholder syntax → free-text args
//   - 12,000-char limit per rule file (our files are well under)

// ── .agents/rules/*.md (glob-scoped) ─────────────────────────────────
export function generateAntigravity(cwd, { fileData, stack, modules, patterns }) {
  if (patterns?.stateManagement) stack = { ...stack, stateManagement: patterns.stateManagement };

  const rulesDir = join(cwd, '.agents', 'rules');
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
  const modulesDir = join(cwd, '.agents', 'rules', 'modules');
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

// ── .agents/workflows/*.md (Markdown slash commands) ─────────────────
// Transpiled from the shared Markdown command templates: rewrite .claude/ paths
// to the Antigravity equivalents and drop $ARGUMENTS (free-text args).
export function generateAntigravityWorkflows(cwd, templateCommandsDir, { force = false } = {}) {
  const dir = join(cwd, '.agents', 'workflows');
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
  const body = stripFrontmatter(md)
    .replace(/\$ARGUMENTS/g, 'the request provided with this command')
    .replace(/!`([^`]+)`/g, '`$1`')             // drop Claude exec marker → plain code span
    .replace(/\.claude\/context\//g, '.agents/rules/')
    .replace(/\.claude\/skills\//g, '.agents/skills/')
    .trim();

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
  return existsSync(join(cwd, '.agents', 'rules')) || existsSync(join(cwd, '.agents', 'workflows'));
}
