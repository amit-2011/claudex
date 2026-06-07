#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getUpdateStatus, showTerminalBanner } from '../src/utils/version-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getPkg() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  } catch {
    return { name: 'promptpilot-ai', version: '0.0.0' };
  }
}

const pkg = getPkg();

function getVersion() {
  return pkg.version;
}

const [,, command, ...args] = process.argv;
const cwd = process.cwd();

async function main() {
  const versionCheck = getUpdateStatus(pkg.version).catch(() => null);

  switch (command) {
    case 'init': {
      const { runInit } = await import('../src/commands/init.js');
      await runInit(cwd);
      break;
    }

    case 'sync': {
      const { runSync } = await import('../src/commands/init.js');
      const templates = args.includes('--templates');
      await runSync(cwd, { templates });
      break;
    }

    case 'update-context': {
      const { runUpdateContext, runUpdateContextSinceLastSync } = await import('../src/commands/init.js');
      if (args.includes('--since-last-sync')) {
        await runUpdateContextSinceLastSync(cwd);
        break;
      }
      const changedFiles = args.filter((a) => a && !a.startsWith('--'));
      if (changedFiles.length === 0) break;
      await runUpdateContext(cwd, changedFiles);
      break;
    }

    case 'help': {
      const { runHelpReference } = await import('../src/commands/help.js');
      await runHelpReference();
      break;
    }

    case 'stats': {
      const { runStats } = await import('../src/commands/stats.js');
      await runStats(cwd);
      break;
    }

    case 'status': {
      const { runStatusLine } = await import('../src/commands/stats.js');
      await runStatusLine(cwd);
      break;
    }

    case '--version':
    case '-v': {
      console.log(getVersion());
      break;
    }

    case '--help':
    case '-h':
    case undefined: {
      printHelp();
      break;
    }

    default: {
      console.error(`\n  Unknown command: ${command}`);
      console.error(`  Run "npx promptpilot-ai --help" for usage.\n`);
      process.exit(1);
    }
  }

  if (process.stderr.isTTY) {
    const status = await versionCheck;
    if (status?.hasUpdate) showTerminalBanner(status.current, status.latest);
  }
}

function printHelp() {
  console.log(`
  \x1b[36mpromptpilot-ai\x1b[0m v${getVersion()} — Claude Code Context Layer

  \x1b[1mUsage:\x1b[0m

    npx promptpilot-ai init               Set up promptpilot-ai in the current project
    npx promptpilot-ai sync               Re-scan and update all context files
    npx promptpilot-ai sync --templates   Also refresh .claude/commands/*.md templates
    npx promptpilot-ai stats              Show context stats (files, size, modules)
    npx promptpilot-ai status             Print the one-line status bar (used by Claude Code)
    npx promptpilot-ai help               Full command reference with use-cases
    npx promptpilot-ai --version          Show version

  \x1b[1mAfter init, use these Claude Code slash commands:\x1b[0m

    /ask  <request>            Convert natural language to a prompt, plan, and execute
    /plan <request>            Generate a plan only — no execution
    /sync                      Trigger a context sync from within Claude Code
    /pp-stats                  Show the context stats dashboard
    /pp-help                   List all commands and their use-cases

  \x1b[1mExamples:\x1b[0m

    npx promptpilot-ai init
    /ask add a login page with email and password
    /plan refactor the auth module to use JWT instead of sessions
`);
}

main().catch((err) => {
  console.error(`\n  \x1b[31m✗\x1b[0m ${err.message}\n`);
  process.exit(1);
});
