import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

import { scanProject } from '../scanner/index.js';
import { generateContextFiles } from '../generators/context.js';
import { updateClaudeMd } from '../generators/claude-md.js';
import { writeClaudeSettings } from '../generators/settings.js';
import { installGitHook } from '../hooks/install.js';
import { select, input } from '../utils/prompt.js';
import { tick, cross, bold, cyan, dim, green, yellow, gray } from '../utils/color.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

export async function runInit(cwd) {
  printHeader();

  if (!isGitRepo(cwd)) {
    console.error(`\n  ${cross} This directory is not a git repository.`);
    console.error(`  Run ${cyan('git init')} first, then re-run ${cyan('npx claudex init')}.\n`);
    process.exit(1);
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
      console.error(`  ${cross} Failed to scan project. Make sure you have files committed to git.\n`);
      process.exit(1);
    }
  }

  await writeOutputFiles(cwd, scanData, isNew);

  printSuccess(cwd, scanData, isNew);
}

export async function runSync(cwd) {
  if (!isGitRepo(cwd)) {
    console.error(`\n  ${cross} Not a git repository.\n`);
    process.exit(1);
  }

  console.log(`\n  ${cyan('claudex')} — Syncing project context\n`);

  const scanData = await runScan(cwd);
  if (!scanData) {
    console.error(`  ${cross} No files found. Make sure files are committed to git.\n`);
    process.exit(1);
  }

  await writeOutputFiles(cwd, scanData, false);

  console.log(`\n  ${tick} Context updated.\n`);
}

export async function runUpdateContext(cwd, changedFiles) {
  if (!changedFiles.length) return;

  const { scanChangedFiles } = await import('../scanner/index.js');
  const { regenerateModuleFiles } = await import('../generators/context.js');

  const result = await scanChangedFiles(cwd, changedFiles);
  if (!result || !result.affectedModules.length) return;

  regenerateModuleFiles(cwd, result.affectedModules);
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

async function writeOutputFiles(cwd, scanData, isNew) {
  console.log(`\n  ${dim('Writing context files...')}\n`);

  const written = generateContextFiles(cwd, scanData);
  console.log(`  ${tick} ${cyan('architecture.md')}`);
  console.log(`  ${tick} ${cyan('stack.md')}`);
  console.log(`  ${tick} ${cyan('patterns.md')}`);

  if (written.length > 0) {
    console.log(`  ${tick} ${cyan('modules/')}${dim(` (${written.length} modules)`)}`);
    for (const m of written) {
      console.log(`    ${gray('•')} ${m.name} ${dim(`(${m.fileCount} files)`)}`);
    }
  } else if (isNew) {
    console.log(`  ${tick} ${cyan('modules/')} ${dim('(empty — add code and run npx claudex sync)')}`);
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

function copyCommandTemplates(cwd) {
  const commandsDir = join(cwd, '.claude', 'commands');
  mkdirSync(commandsDir, { recursive: true });

  const templateCommandsDir = join(TEMPLATES_DIR, 'commands');
  for (const file of readdirSync(templateCommandsDir)) {
    const dest = join(commandsDir, file);
    if (!existsSync(dest)) {
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
    const files = execSync('git ls-files', { cwd, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    const sourceFiles = files.filter((f) => /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f));
    return sourceFiles.length < 3;
  } catch {
    return true;
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

function printHeader() {
  console.log('');
  console.log(`  ${bold(cyan('claudex'))} — Claude Code Context Layer`);
  console.log(`  ${dim('─'.repeat(40))}`);
  console.log('');
}

function printSuccess(cwd, scanData, isNew) {
  const pm = scanData.stack.packageManager;
  console.log('');
  console.log(`  ${green('─'.repeat(40))}`);
  console.log(`  ${tick} ${bold('Ready!')} Open this project in Claude Code and try:`);
  console.log('');
  if (isNew) {
    console.log(`    ${cyan('/ask')} describe what you want to build`);
  } else {
    console.log(`    ${cyan('/ask')} what do you want to fix or build?`);
    console.log(`    ${cyan('/plan')} describe a feature to get a plan first`);
  }
  console.log('');
  console.log(`  ${dim('To update context after adding new modules:')}`);
  console.log(`    ${dim('npx claudex sync')}`);
  console.log('');
}
