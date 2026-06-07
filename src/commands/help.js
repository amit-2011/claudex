import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cyan, dim, bold, green } from '../utils/color.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function version() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')).version;
  } catch {
    return '';
  }
}

// Single source of truth for the command reference (CLI `help` + `/pp-help`).
const CLI = [
  ['init', 'First-time setup in a project — scan the codebase, generate context, pick Claude / Cursor / Both, and opt into the status bar.'],
  ['sync', 'Re-scan and regenerate all context after new modules, file restructuring, or a major refactor.'],
  ['sync --templates', 'After upgrading promptpilot-ai — also refresh the slash commands and the status bar script.'],
  ['stats', 'Show the context dashboard: size (KB + tokens), files, modules, last sync, and stale files.'],
  ['status', 'Print the one-line status bar. Claude Code runs this for you — you rarely call it directly.'],
  ['update-context <files>', 'Update only the modules touched by the given files. Run automatically by the git post-commit hook.'],
  ['update-context --since-last-sync', 'Update everything changed since the last sync. Run automatically by the Stop / SessionStart hooks.'],
  ['help', 'Show this full command reference with use-cases.'],
  ['--help', 'Quick usage summary.'],
  ['--version', 'Print the installed version.'],
];

const SLASH = [
  ['/ask <request>', 'Natural language → plan → execute, cross-repo aware. The daily driver for building or fixing.'],
  ['/plan <request>', 'Interactive planning only — shows UI mockups / approach, writes no code. Use before a big change.'],
  ['/sync', 'Trigger a context sync from inside Claude Code (same as `npx promptpilot-ai sync`).'],
  ['/pp-stats', 'Show the context dashboard inside Claude Code.'],
  ['/pp-help', 'Show this command reference inside Claude Code.'],
];

// Auto-invoked, project-aware. Generated (opt-in) only for the relevant stack.
const SKILLS = [
  ['design', 'Build UI the project way — detected component library, CSS approach, existing-component reuse.'],
  ['devops', 'Stack-aware Docker, CI (GitHub Actions), and deploy config from your package manager + commands.'],
  ['db', 'Models, migrations, and queries using the detected ORM and migrate command.'],
];

const WORKFLOW = [
  ['npx promptpilot-ai init', 'once per project'],
  ['/ask  or  /plan', 'while coding'],
  ['auto-sync on commit', '+ /sync after big changes'],
  ['/pp-stats', 'check context health'],
];

function renderTerminal() {
  const pad = Math.max(...CLI.map((r) => r[0].length), ...SLASH.map((r) => r[0].length)) + 2;
  const out = [];
  out.push('');
  out.push(`  ${bold(cyan('promptpilot-ai'))} v${version()} ${dim('— command reference')}`);

  out.push('');
  out.push(`  ${bold('CLI')} ${dim('(run in your terminal)')}`);
  for (const [cmd, use] of CLI) out.push(`    ${cyan(cmd.padEnd(pad))}${dim(use)}`);

  out.push('');
  out.push(`  ${bold('Slash commands')} ${dim('(inside Claude Code, after init)')}`);
  for (const [cmd, use] of SLASH) out.push(`    ${cyan(cmd.padEnd(pad))}${dim(use)}`);

  out.push('');
  out.push(`  ${bold('Skills')} ${dim('(auto-invoked + /name, project-aware — opt in at init)')}`);
  for (const [cmd, use] of SKILLS) out.push(`    ${cyan(('/' + cmd).padEnd(pad))}${dim(use)}`);

  out.push('');
  out.push(`  ${bold('Multi-agent pipeline')} ${dim('(Claude Code — opt in at init)')}`);
  out.push(`    ${cyan('/ship <feature>'.padEnd(pad))}${dim('plan → implement → test via planner/builder/tester subagents (parallel for multi-repo)')}`);

  out.push('');
  out.push(`  ${bold('Status bar')} ${dim('(Claude Code)')}`);
  out.push(`    ${dim('Live bottom bar: context size + files + modules + live context-window %.')}`);
  out.push(`    ${dim('Opt in during init; toggle via the statusLine block in .claude/settings.json.')}`);

  out.push('');
  out.push(`  ${bold('Typical workflow')}`);
  WORKFLOW.forEach(([step, note], i) => out.push(`    ${green(String(i + 1) + '.')} ${step.padEnd(pad + 2)}${dim(note)}`));
  out.push('');

  return out.join('\n');
}

function renderMarkdown() {
  const out = [`# promptpilot-ai — command reference`, ''];

  out.push('## CLI (run in your terminal)', '', '| Command | Use case |', '|---|---|');
  for (const [cmd, use] of CLI) out.push(`| \`${cmd}\` | ${use} |`);

  out.push('', '## Slash commands (inside Claude Code, after init)', '', '| Command | Use case |', '|---|---|');
  for (const [cmd, use] of SLASH) out.push(`| \`${cmd}\` | ${use} |`);

  out.push(
    '',
    '## Skills (auto-invoked + `/name`, project-aware — opt in at init)',
    '',
    '| Skill | Use case |',
    '|---|---|'
  );
  for (const [cmd, use] of SKILLS) out.push(`| \`/${cmd}\` | ${use} |`);

  out.push(
    '',
    '## Multi-agent pipeline (Claude Code — opt in at init)',
    '',
    '`/ship <feature>` orchestrates a **plan → implement → test** pipeline using three project-aware subagents (`planner`, `builder`, `tester`) that share the generated context. Independent frontend/backend work runs in parallel.'
  );

  out.push(
    '',
    '## Status bar (Claude Code)',
    '',
    'A live bottom bar showing context size + files + modules + the live context-window %. Opt in during `init`; toggle via the `statusLine` block in `.claude/settings.json`.'
  );

  out.push('', '## Typical workflow', '');
  WORKFLOW.forEach(([step, note], i) => out.push(`${i + 1}. \`${step}\` — ${note}`));

  return out.join('\n');
}

export async function runHelpReference() {
  console.log(process.stdout.isTTY ? renderTerminal() : renderMarkdown());
}
