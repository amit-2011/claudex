#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const [,, command, ...args] = process.argv;
const cwd = process.cwd();

async function main() {
  switch (command) {
    case 'init': {
      const { runInit } = await import('../src/commands/init.js');
      await runInit(cwd);
      break;
    }

    case 'sync': {
      const { runSync } = await import('../src/commands/init.js');
      await runSync(cwd);
      break;
    }

    case 'update-context': {
      const changedFiles = args.filter(Boolean);
      if (changedFiles.length === 0) break;
      const { runUpdateContext } = await import('../src/commands/init.js');
      await runUpdateContext(cwd, changedFiles);
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
}

function printHelp() {
  console.log(`
  \x1b[36mpromptpilot-ai\x1b[0m v${getVersion()} — Claude Code Context Layer

  \x1b[1mUsage:\x1b[0m

    npx promptpilot-ai init           Set up promptpilot-ai in the current project
    npx promptpilot-ai sync           Re-scan and update all context files
    npx promptpilot-ai --version      Show version

  \x1b[1mAfter init, use these Claude Code slash commands:\x1b[0m

    /ask  <request>            Convert natural language to a prompt, plan, and execute
    /plan <request>            Generate a plan only — no execution
    /sync                      Trigger a context sync from within Claude Code

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
