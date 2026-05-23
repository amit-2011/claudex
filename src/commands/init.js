import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

import { scanProject } from '../scanner/index.js';
import { detectSubRepos } from '../scanner/multi-repo.js';
import { generateContextFiles } from '../generators/context.js';
import { generateCursorRules } from '../generators/cursor-rules.js';
import { generateBridgeFile } from '../generators/bridge.js';
import { updateClaudeMd } from '../generators/claude-md.js';
import { writeClaudeSettings } from '../generators/settings.js';
import { installGitHook } from '../hooks/install.js';
import { select, input } from '../utils/prompt.js';
import { tick, cross, bold, cyan, dim, green, yellow, gray } from '../utils/color.js';
import { checkVersionAndNotify, clearVersionCache } from '../utils/version-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

function currentPkgVersion() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

export async function runInit(cwd) {
  printHeader();

  const hasGit = isGitRepo(cwd);
  if (!hasGit) {
    console.log(`  ${yellow('No git repo found')} ${dim('— scanning filesystem directly')}\n`);
  }

  const target = await selectTarget();
  console.log('');

  // Multi-repo mode: root folder with sub-repos (backend + frontend)
  const subRepos = detectSubRepos(cwd);
  if (subRepos.length >= 2) {
    await runMultiRepoInit(cwd, subRepos, target);
    return;
  }

  const isNew = detectNewProject(cwd);

  let scanData;
  if (isNew) {
    console.log(`  ${yellow('No existing source files detected.')} Let's configure your new project.\n`);
    const config = await collectNewProjectConfig();
    scanData = buildScanDataFromConfig(config);
  } else {
    console.log(`  ${dim('Existing project detected. Scanning...')}\n`);
    scanData = await runScan(cwd);
    if (!scanData) {
      console.error(`  ${cross} Failed to scan project.\n`);
      process.exit(1);
    }
  }

  await writeOutputFiles(cwd, scanData, isNew, target);

  printSuccess(cwd, scanData, isNew, target);
}

async function selectTarget() {
  const choice = await select('Which AI tool are you using?', [
    { label: 'Claude Code', value: 'claude' },
    { label: 'Cursor', value: 'cursor' },
    { label: 'Both', value: 'both' },
  ]);
  return choice.value;
}

async function runMultiRepoInit(cwd, subRepos, target = 'claude') {
  const frontend = subRepos.find((r) => r.role === 'frontend');
  const backend = subRepos.find((r) => r.role === 'backend');

  console.log(`  ${dim('Multi-repo workspace detected:')}\n`);
  for (const repo of subRepos) {
    const roleLabel = repo.role === 'frontend' ? cyan('frontend') : repo.role === 'backend' ? yellow('backend') : dim('unknown');
    console.log(`    ${tick} ${bold(repo.name)} ${dim(`(${repo.stack?.framework?.name || repo.role})`)} — ${roleLabel}`);
  }
  console.log('');

  const scanResults = [];
  for (const repo of subRepos) {
    process.stdout.write(`  ${dim(`Scanning ${repo.name}...`)}  `);
    const data = await scanProject(repo.path);
    if (data) {
      console.log(`${tick} ${data.fileData.totalFiles} files`);
      scanResults.push({ ...repo, scanData: data });
    } else {
      console.log(`${dim('skipped (no source files)')}`);
    }
  }

  console.log(`\n  ${dim('Writing context files...')}\n`);

  // Write context for each sub-repo into its own folder
  for (const repo of scanResults) {
    if (target === 'claude' || target === 'both') {
      generateContextFiles(repo.path, repo.scanData);
      updateClaudeMd(repo.path, repo.scanData.stack, repo.scanData.modules);
      writeClaudeSettings(repo.path, repo.scanData.stack);
      installGitHook(repo.path);
    }
    if (target === 'cursor' || target === 'both') {
      generateCursorRules(repo.path, repo.scanData);
      if (target === 'cursor') {
        installGitHook(repo.path);
      }
    }
    console.log(`  ${tick} ${cyan(repo.name + '/')} context`);
  }

  // Write root-level context + bridge
  if (target === 'claude' || target === 'both') {
    copyCommandTemplates(cwd);
  }

  if (frontend && backend) {
    const frontendData = scanResults.find((r) => r.name === frontend.name);
    const backendData = scanResults.find((r) => r.name === backend.name);
    if (frontendData && backendData) {
      generateBridgeFile(cwd, frontendData, backendData);
      const bridgePath = target === 'cursor' ? '.cursor/bridge.md' : '.claude/context/bridge.md';
      console.log(`  ${tick} ${cyan(bridgePath)} ${dim('(frontend ↔ backend API map)')}`);
    }
  }

  console.log('');
  console.log(`  ${green('─'.repeat(40))}`);

  if (target === 'claude' || target === 'both') {
    console.log(`  ${tick} ${bold('Ready!')} Open this folder in Claude Code and try:`);
    console.log('');
    console.log(`    ${cyan('/ask')} add a user profile page`);
    console.log(`    ${dim('Claude will read bridge.md and coordinate both repos')}`);
  }
  if (target === 'cursor' || target === 'both') {
    console.log(`  ${tick} ${bold('Ready!')} Open this folder in Cursor — rules are auto-loaded from ${cyan('.cursor/rules/')}`);
  }
  console.log('');
}

export async function runSync(cwd, opts = {}) {
  if (!isGitRepo(cwd)) {
    console.log(`\n  ${yellow('No git repo found')} ${dim('— scanning filesystem directly')}`);
  }

  console.log(`\n  ${cyan('promptpilot-ai')} — Syncing project context\n`);

  const target = detectExistingTarget(cwd);

  const subRepos = detectSubRepos(cwd);
  if (subRepos.length >= 2) {
    await runMultiRepoInit(cwd, subRepos, target);
    if (opts.templates) refreshTemplates(cwd, target);
    if (opts.templates) clearVersionCache(cwd);
    return;
  }

  const scanData = await runScan(cwd);
  if (!scanData) {
    console.error(`  ${cross} No files found.\n`);
    process.exit(1);
  }

  await writeOutputFiles(cwd, scanData, false, target);

  if (opts.templates) {
    refreshTemplates(cwd, target);
    clearVersionCache(cwd);
    console.log(`  ${tick} Templates refreshed ${dim('(slash commands updated)')}`);
  }

  console.log(`\n  ${tick} Context updated.\n`);
}

function refreshTemplates(cwd, target) {
  if (target === 'claude' || target === 'both') {
    copyCommandTemplates(cwd, { force: true });
  }
}

export async function runUpdateContext(cwd, changedFiles) {
  if (!changedFiles.length) {
    await checkVersionAndNotify(cwd, currentPkgVersion());
    return;
  }

  const { scanChangedFiles } = await import('../scanner/index.js');
  const { regenerateModuleFiles } = await import('../generators/context.js');
  const { regenerateCursorModuleFiles } = await import('../generators/cursor-rules.js');

  const result = await scanChangedFiles(cwd, changedFiles);
  if (result && result.affectedModules.length) {
    const target = detectExistingTarget(cwd);
    if (target === 'claude' || target === 'both') {
      regenerateModuleFiles(cwd, result.affectedModules);
    }
    if (target === 'cursor' || target === 'both') {
      regenerateCursorModuleFiles(cwd, result.affectedModules);
    }
    writeLastSyncMarker(cwd);
  }

  await checkVersionAndNotify(cwd, currentPkgVersion());
}

export async function runUpdateContextSinceLastSync(cwd) {
  const changed = collectChangedFilesSinceLastSync(cwd);
  if (!changed.length) {
    await checkVersionAndNotify(cwd, currentPkgVersion());
    return;
  }
  await runUpdateContext(cwd, changed);
}

function getLastSyncPath(cwd) {
  const target = detectExistingTarget(cwd);
  const dir = target === 'cursor' ? '.cursor' : '.claude';
  return join(cwd, dir, '.last-sync');
}

function writeLastSyncMarker(cwd) {
  try {
    const markerPath = getLastSyncPath(cwd);
    const dir = dirname(markerPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(markerPath, String(Date.now()));
  } catch {}
}

function collectChangedFilesSinceLastSync(cwd) {
  const markerPath = getLastSyncPath(cwd);
  let sinceMs = 0;
  if (existsSync(markerPath)) {
    try {
      sinceMs = parseInt(readFileSync(markerPath, 'utf8'), 10) || 0;
    } catch {}
  }

  const files = new Set();

  // Git-tracked changes: working tree + recent commits since marker
  if (isGitRepo(cwd)) {
    try {
      const diff = execSync('git diff --name-only HEAD', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      diff.split('\n').filter(Boolean).forEach((f) => files.add(f));
    } catch {}
    try {
      const untracked = execSync('git ls-files --others --exclude-standard', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      untracked.split('\n').filter(Boolean).forEach((f) => files.add(f));
    } catch {}
    if (sinceMs > 0) {
      try {
        const sinceSec = Math.floor(sinceMs / 1000);
        const committed = execSync(`git log --since=${sinceSec} --name-only --pretty=format:`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        committed.split('\n').filter(Boolean).forEach((f) => files.add(f));
      } catch {}
    }
  }

  // Filter to files modified after marker (mtime check) when marker exists
  if (sinceMs > 0) {
    return [...files].filter((rel) => {
      try {
        const abs = join(cwd, rel);
        if (!existsSync(abs)) return false;
        return statSync(abs).mtimeMs > sinceMs;
      } catch {
        return false;
      }
    });
  }

  return [...files];
}

async function runScan(cwd) {
  process.stdout.write(`  ${dim('Detecting stack...')}      `);
  const data = await scanProject(cwd);
  if (!data) return null;

  const fw = data.stack.framework?.name || data.stack.language;
  console.log(`${tick} ${bold(fw)} + ${data.stack.language}`);

  process.stdout.write(`  ${dim('Analyzing structure...')}  `);
  console.log(`${tick} ${data.fileData.totalFiles} files across ${data.modules.length} modules`);

  process.stdout.write(`  ${dim('Detecting patterns...')}   `);
  const pts = data.patterns.patterns.slice(0, 2).join(', ') || 'Standard';
  console.log(`${tick} ${data.patterns.fileNaming}, ${data.patterns.importStyle}, ${pts}`);

  return data;
}

async function writeOutputFiles(cwd, scanData, isNew, target = 'claude') {
  console.log(`\n  ${dim('Writing context files...')}\n`);

  if (target === 'claude' || target === 'both') {
    const written = generateContextFiles(cwd, scanData);
    console.log(`  ${tick} ${cyan('.claude/context/architecture.md')}`);
    console.log(`  ${tick} ${cyan('.claude/context/stack.md')}`);
    console.log(`  ${tick} ${cyan('.claude/context/patterns.md')}`);

    if (written.length > 0) {
      console.log(`  ${tick} ${cyan('.claude/context/modules/')}${dim(` (${written.length} modules)`)}`);
      for (const m of written) {
        console.log(`    ${gray('•')} ${m.name} ${dim(`(${m.fileCount} files)`)}`);
      }
    } else if (isNew) {
      console.log(`  ${tick} ${cyan('.claude/context/modules/')} ${dim('(empty — add code and run sync)')}`);
    }

    copyCommandTemplates(cwd);

    const mdStatus = updateClaudeMd(cwd, scanData.stack, scanData.modules);
    console.log(`\n  ${tick} CLAUDE.md ${dim(mdStatus)}`);

    writeClaudeSettings(cwd, scanData.stack);
    console.log(`  ${tick} .claude/settings.json`);

    const hookResult = installGitHook(cwd);
    if (hookResult.success) {
      console.log(`  ${tick} Git hook ${dim('(post-commit auto-sync)')}`);
    }
  }

  if (target === 'cursor' || target === 'both') {
    const cursorWritten = generateCursorRules(cwd, scanData);
    console.log(`  ${tick} ${cyan('.cursor/rules/architecture.mdc')}`);
    console.log(`  ${tick} ${cyan('.cursor/rules/stack.mdc')}`);
    console.log(`  ${tick} ${cyan('.cursor/rules/patterns.mdc')}`);

    if (cursorWritten.length > 0) {
      console.log(`  ${tick} ${cyan('.cursor/rules/modules/')}${dim(` (${cursorWritten.length} modules)`)}`);
      for (const m of cursorWritten) {
        console.log(`    ${gray('•')} ${m.name} ${dim(`(${m.fileCount} files)`)}`);
      }
    } else if (isNew) {
      console.log(`  ${tick} ${cyan('.cursor/rules/modules/')} ${dim('(empty — add code and run sync)')}`);
    }

    if (target === 'cursor') {
      const hookResult = installGitHook(cwd);
      if (hookResult.success) {
        console.log(`  ${tick} Git hook ${dim('(post-commit auto-sync)')}`);
      }
    }
  }
}

function copyCommandTemplates(cwd, { force = false } = {}) {
  const commandsDir = join(cwd, '.claude', 'commands');
  mkdirSync(commandsDir, { recursive: true });

  const templateCommandsDir = join(TEMPLATES_DIR, 'commands');
  for (const file of readdirSync(templateCommandsDir)) {
    const dest = join(commandsDir, file);
    if (force || !existsSync(dest)) {
      copyFileSync(join(templateCommandsDir, file), dest);
    }
  }
}

async function collectNewProjectConfig() {
  const framework = await select('Framework', [
    { label: 'Next.js', value: 'nextjs', type: 'fullstack' },
    { label: 'React SPA (Vite)', value: 'react', type: 'spa' },
    { label: 'NestJS', value: 'nestjs', type: 'api' },
    { label: 'Express', value: 'express', type: 'api' },
    { label: 'Node.js CLI / Library', value: 'node', type: 'library' },
  ]);
  console.log('');

  const language = await select('Language', [
    { label: 'TypeScript', value: 'typescript' },
    { label: 'JavaScript', value: 'javascript' },
  ]);
  console.log('');

  const packageManager = await select('Package manager', [
    { label: 'pnpm', value: 'pnpm' },
    { label: 'npm', value: 'npm' },
    { label: 'yarn', value: 'yarn' },
  ]);
  console.log('');

  let database = { label: 'None', value: 'none' };
  let orm = { label: 'None', value: 'none' };

  if (['nextjs', 'nestjs', 'express'].includes(framework.value)) {
    database = await select('Database', [
      { label: 'None', value: 'none' },
      { label: 'PostgreSQL', value: 'postgresql' },
      { label: 'MySQL', value: 'mysql' },
      { label: 'MongoDB', value: 'mongodb' },
      { label: 'SQLite', value: 'sqlite' },
    ]);
    console.log('');

    if (database.value !== 'none') {
      orm = await select('ORM / Query Builder', [
        { label: 'Prisma', value: 'prisma' },
        { label: 'Drizzle', value: 'drizzle' },
        { label: 'TypeORM', value: 'typeorm' },
        { label: 'Raw SQL', value: 'none' },
      ]);
      console.log('');
    }
  }

  const testing = await select('Testing', [
    { label: 'Vitest', value: 'vitest' },
    { label: 'Jest', value: 'jest' },
    { label: 'None', value: 'none' },
  ]);
  console.log('');

  return { framework, language, packageManager, database, orm, testing };
}

function buildScanDataFromConfig(config) {
  const { framework, language, packageManager, database, orm, testing } = config;

  const frameworkNames = {
    nextjs: { name: 'Next.js', type: 'fullstack' },
    react: { name: 'React', type: 'spa' },
    nestjs: { name: 'NestJS', type: 'api' },
    express: { name: 'Express', type: 'api' },
    node: { name: 'Node.js', type: 'library' },
  };

  const stack = {
    language: language.value === 'typescript' ? 'TypeScript' : 'JavaScript',
    runtime: 'Node.js',
    framework: frameworkNames[framework.value],
    packageManager: packageManager.value,
    database: database.value !== 'none' ? database.label : null,
    orm: orm.value !== 'none' ? orm.label : null,
    testFramework: testing.value !== 'none' ? testing.label : null,
    uiLibrary: null,
    buildTool: framework.value === 'react' ? 'Vite' : null,
    keyDeps: {},
  };

  const modules = buildDefaultModules(framework.value, language.value);

  const patterns = {
    fileNaming: 'kebab-case',
    componentNaming: 'PascalCase',
    importStyle: 'ESM',
    hasPathAliases: language.value === 'typescript',
    patterns: getDefaultPatterns(framework.value),
    stateManagement: null,
    cssApproach: 'Tailwind CSS',
  };

  const fileData = {
    files: [],
    tree: {},
    entryPoints: [],
    configFiles: [],
    extensions: {},
    totalFiles: 0,
  };

  return { fileData, stack, modules, patterns };
}

function buildDefaultModules(frameworkValue, language) {
  const ext = language === 'typescript' ? 'ts' : 'js';
  const xext = language === 'typescript' ? 'tsx' : 'jsx';

  const moduleMap = {
    nextjs: [
      { name: 'routes', path: 'src/app', files: [], type: 'routes', deps: [], testFiles: [] },
      { name: 'components', path: 'src/components', files: [], type: 'ui', deps: [], testFiles: [] },
      { name: 'lib', path: 'src/lib', files: [], type: 'infra', deps: [], testFiles: [] },
    ],
    react: [
      { name: 'pages', path: 'src/pages', files: [], type: 'routes', deps: [], testFiles: [] },
      { name: 'components', path: 'src/components', files: [], type: 'ui', deps: [], testFiles: [] },
      { name: 'hooks', path: 'src/hooks', files: [], type: 'feature', deps: [], testFiles: [] },
      { name: 'utils', path: 'src/utils', files: [], type: 'infra', deps: [], testFiles: [] },
    ],
    nestjs: [
      { name: 'auth', path: 'src/auth', files: [], type: 'feature', deps: [], testFiles: [] },
      { name: 'users', path: 'src/users', files: [], type: 'feature', deps: [], testFiles: [] },
      { name: 'common', path: 'src/common', files: [], type: 'infra', deps: [], testFiles: [] },
    ],
    express: [
      { name: 'routes', path: 'src/routes', files: [], type: 'api', deps: [], testFiles: [] },
      { name: 'middleware', path: 'src/middleware', files: [], type: 'infra', deps: [], testFiles: [] },
      { name: 'models', path: 'src/models', files: [], type: 'database', deps: [], testFiles: [] },
    ],
    node: [
      { name: 'lib', path: 'src/lib', files: [], type: 'feature', deps: [], testFiles: [] },
      { name: 'utils', path: 'src/utils', files: [], type: 'infra', deps: [], testFiles: [] },
    ],
  };

  return moduleMap[frameworkValue] || moduleMap.node;
}

function getDefaultPatterns(frameworkValue) {
  const patterns = {
    nextjs: ['Server Components', 'Client Components', 'Route Handlers'],
    react: ['Custom hooks', 'React Context'],
    nestjs: ['Controller pattern', 'Service layer', 'Module pattern', 'DTO pattern'],
    express: ['Middleware pattern', 'Router pattern'],
    node: [],
  };
  return patterns[frameworkValue] || [];
}

function detectNewProject(cwd) {
  try {
    const files = execSync('git ls-files', { cwd, encoding: 'utf8', stdio: 'pipe' }).trim().split('\n').filter(Boolean);
    const sourceFiles = files.filter((f) => /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f));
    return sourceFiles.length < 3;
  } catch {
    return false; // No git — let scanProject determine structure via filesystem walk
  }
}

function isGitRepo(cwd) {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function detectExistingTarget(cwd) {
  const hasClaude = existsSync(join(cwd, '.claude'));
  const hasCursor = existsSync(join(cwd, '.cursor', 'rules'));
  if (hasClaude && hasCursor) return 'both';
  if (hasCursor) return 'cursor';
  return 'claude';
}

function printHeader() {
  console.log('');
  console.log(`  ${bold(cyan('promptpilot-ai'))} — AI Context Layer`);
  console.log(`  ${dim('─'.repeat(40))}`);
  console.log('');
}

function printSuccess(cwd, scanData, isNew, target = 'claude') {
  console.log('');
  console.log(`  ${green('─'.repeat(40))}`);

  if (target === 'claude' || target === 'both') {
    console.log(`  ${tick} ${bold('Ready for Claude Code!')} Try:`);
    console.log('');
    if (isNew) {
      console.log(`    ${cyan('/ask')} describe what you want to build`);
    } else {
      console.log(`    ${cyan('/ask')} what do you want to fix or build?`);
      console.log(`    ${cyan('/plan')} describe a feature to get a plan first`);
    }
    console.log('');
  }

  if (target === 'cursor' || target === 'both') {
    console.log(`  ${tick} ${bold('Ready for Cursor!')} Rules auto-loaded from ${cyan('.cursor/rules/')}`);
    console.log(`    ${dim('Cursor reads these automatically when you open files in each module')}`);
    console.log('');
  }

  console.log(`  ${dim('To update context after adding new modules:')}`);
  console.log(`    ${dim('npx promptpilot-ai sync')}`);
  console.log('');
}
