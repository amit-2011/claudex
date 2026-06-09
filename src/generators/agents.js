import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

// Generates a project-aware multi-agent pipeline: planner → builder → tester
// custom subagents + a `/ship` orchestrator. Supported for Claude Code
// (.claude/agents/*.md + a ship skill) and Gemini CLI (.gemini/agents/*.md +
// a ship.toml command). Both use Markdown + YAML frontmatter for the agents.
// The agents "share context" by all reading the generated per-tool context and
// skills files; the orchestrator relays results between them.
// No reliable Cursor / Antigravity file-based subagent equivalent yet.

const AGENT_NAMES = ['planner', 'builder', 'tester'];

const CLAUDE_DIRS = { context: '.claude/context', skills: '.claude/skills' };
const GEMINI_DIRS = { context: '.gemini/context', skills: '.gemini/skills' };

// ── Claude Code ──────────────────────────────────────────────────────
export function generateAgents(cwd, scanData) {
  const ctx = ctxOf(scanData, CLAUDE_DIRS);
  const defs = [plannerAgent(ctx), builderAgent(ctx), testerAgent(ctx)];

  const dir = join(cwd, '.claude', 'agents');
  mkdirSync(dir, { recursive: true });
  for (const def of defs) {
    writeFileSync(join(dir, `${def.name}.md`), agentFile(def));
  }

  writeShipSkill(cwd, ctx);
  return [...AGENT_NAMES, 'ship'];
}

// ── Gemini CLI ───────────────────────────────────────────────────────
export function generateGeminiAgents(cwd, scanData) {
  const ctx = ctxOf(scanData, GEMINI_DIRS);
  const defs = [plannerAgent(ctx), builderAgent(ctx), testerAgent(ctx)];

  const dir = join(cwd, '.gemini', 'agents');
  mkdirSync(dir, { recursive: true });
  for (const def of defs) {
    writeFileSync(join(dir, `${def.name}.md`), agentFile(def));
  }

  writeShipCommand(cwd, ctx);
  return [...AGENT_NAMES, 'ship'];
}

function agentFile(def) {
  const fm = ['---', `name: ${def.name}`, `description: ${def.description}`, `tools: ${def.tools}`, '---', ''];
  return fm.join('\n') + def.body;
}

export function agentsInstalled(cwd) {
  return (
    AGENT_NAMES.some((n) => existsSync(join(cwd, '.claude', 'agents', `${n}.md`))) ||
    existsSync(join(cwd, '.claude', 'skills', 'ship', 'SKILL.md')) ||
    AGENT_NAMES.some((n) => existsSync(join(cwd, '.gemini', 'agents', `${n}.md`)))
  );
}

export function removeAgents(cwd) {
  for (const n of AGENT_NAMES) {
    try { rmSync(join(cwd, '.claude', 'agents', `${n}.md`), { force: true }); } catch {}
    try { rmSync(join(cwd, '.gemini', 'agents', `${n}.md`), { force: true }); } catch {}
  }
  try { rmSync(join(cwd, '.claude', 'skills', 'ship'), { recursive: true, force: true }); } catch {}
  try { rmSync(join(cwd, '.gemini', 'commands', 'ship.toml'), { force: true }); } catch {}
}

// ── context ──────────────────────────────────────────────────────────
function ctxOf(scanData, dirs) {
  const { stack = {}, patterns = {} } = scanData || {};
  const c = stack.commands || {};
  return {
    dirs,
    framework: stack.framework?.name || stack.language || 'this project',
    language: stack.language || 'the project language',
    pm: stack.packageManager || 'npm',
    testFramework: stack.testFramework,
    fileNaming: patterns.fileNaming || 'the existing convention',
    test: c.test,
    lint: c.lint,
    install: c.install,
  };
}

// ── agents ───────────────────────────────────────────────────────────
function plannerAgent(ctx) {
  return {
    name: 'planner',
    description: `Create a concise, step-by-step implementation plan for a feature or change in ${ctx.framework}. Use before writing code.`,
    tools: 'Read, Grep, Glob',
    body: `You are the **planner** for a ${ctx.framework} (${ctx.language}) project.

Before planning, read the shared project context so the plan fits this codebase:
- \`${ctx.dirs.context}/architecture.md\`, \`stack.md\`, \`patterns.md\`
- the relevant module file(s) in \`${ctx.dirs.context}/modules/\`
- for full-stack / multi-repo work, \`${ctx.dirs.context}/bridge.md\` (frontend ↔ backend endpoint map)

Then produce a SHORT, concrete plan:
1. **Files** to create / modify — exact paths, grouped by module.
2. **Reuse** — existing components, utilities, or endpoints to use (do not reinvent).
3. **Steps** in order. For multi-repo, tag each step \`[frontend]\` or \`[backend]\` — independent ones can run in parallel.
4. **Tests** to add (${ctx.testFramework || 'project test framework'}).

Output ONLY the plan as your final message — it is handed verbatim to the builder. Do NOT write code.`,
  };
}

function builderAgent(ctx) {
  return {
    name: 'builder',
    description: `Implement a feature in ${ctx.framework} from a plan, following the project's detected conventions. Use to write or modify code.`,
    tools: 'Read, Write, Edit, Grep, Glob, Bash',
    body: `You are the **builder** for a ${ctx.framework} (${ctx.language}, ${ctx.pm}) project.

You receive a plan. Before coding, read the shared context so you match conventions:
- \`${ctx.dirs.context}/patterns.md\` (naming, imports) and \`stack.md\`
- the relevant skill in \`${ctx.dirs.skills}/\` if present — \`design\` lists the reusable UI components and styling rules; \`db\` lists the ORM and migration workflow.

Implement the plan:
- **Reuse** existing components / utilities / endpoints — do not duplicate.
- Match file naming (**${ctx.fileNaming}**) and the project's import style.
- Keep changes scoped to the plan; don't refactor unrelated code.
- Run \`${ctx.install || ctx.pm + ' install'}\` only if you added dependencies.

Output a concise summary: files created/modified and what each change does. This summary is handed to the tester.`,
  };
}

function testerAgent(ctx) {
  const testCmd = ctx.test || 'the project test command';
  return {
    name: 'tester',
    description: `Write and run tests for a change in ${ctx.framework} using ${ctx.testFramework || 'the project test framework'}. Use to verify an implementation.`,
    tools: 'Read, Write, Edit, Grep, Glob, Bash',
    body: `You are the **tester** for a ${ctx.framework} project using ${ctx.testFramework || 'the project test framework'}.

You receive a summary of what the builder implemented.
1. Read the changed files and \`${ctx.dirs.context}/patterns.md\` for test conventions.
2. Add or extend tests with **${ctx.testFramework || 'the project test framework'}**, matching the existing test file naming and location.
3. Run them: \`${testCmd}\`.${ctx.lint ? ` Then run lint: \`${ctx.lint}\`.` : ''}
4. If a test fails, fix the test if it is wrong, otherwise report the exact failure for the builder to fix.

Output: the test files added + the final run result (pass / fail with the key output lines).`,
  };
}

// ── orchestrator ─────────────────────────────────────────────────────
function shipBody(ctx) {
  return `Run a coordinated pipeline to ship: $ARGUMENTS

You are the **orchestrator**. Run these steps IN ORDER, in THIS (main) conversation — subagents cannot spawn their own subagents, so you must drive the delegation:

1. **Plan** — delegate to the \`planner\` agent with the request. Show the returned plan to the user.
2. **Implement** — delegate to the \`builder\` agent, passing the plan verbatim.
   - If the plan marks independent \`[frontend]\` and \`[backend]\` work (multi-repo / bridge.md), spawn TWO \`builder\` agents IN PARALLEL, one per side, each with its slice of the plan.
3. **Test** — delegate to the \`tester\` agent, passing the builder's summary of changed files.
4. **Report** — summarize: plan → files changed → test result. If tests failed, offer to loop the failure back to the \`builder\`.

Each agent reads the shared \`${ctx.dirs.context}/\` and \`${ctx.dirs.skills}/\`, so they stay consistent without you re-explaining conventions. Keep your own messages short — let the agents do the work.`;
}

function writeShipSkill(cwd, ctx) {
  const dir = join(cwd, '.claude', 'skills', 'ship');
  mkdirSync(dir, { recursive: true });
  const fm = [
    '---',
    'name: ship',
    `description: Orchestrate a full plan → implement → test pipeline for a feature in ${ctx.framework} using the planner, builder, and tester subagents.`,
    'argument-hint: [feature description]',
    'disable-model-invocation: true',
    '---',
    '',
  ];
  writeFileSync(join(dir, 'SKILL.md'), fm.join('\n') + shipBody(ctx));
}

function writeShipCommand(cwd, ctx) {
  const dir = join(cwd, '.gemini', 'commands');
  mkdirSync(dir, { recursive: true });
  // Gemini custom command (TOML): $ARGUMENTS → {{args}} for the prompt body.
  const body = shipBody(ctx).replace(/\$ARGUMENTS/g, '{{args}}');
  const desc = `Orchestrate a plan → implement → test pipeline for ${ctx.framework}`;
  writeFileSync(
    join(dir, 'ship.toml'),
    `description = "${desc.replace(/"/g, '\\"')}"\nprompt = '''\n${body}\n'''\n`
  );
}
