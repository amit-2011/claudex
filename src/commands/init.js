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
import { generateAgentsMd, generateRootAgentsMd } from '../generators/agents-md.js';
import { installStatusline, refreshStatuslineScript } from '../generators/statusline.js';
import { generateSkills, skillsInstalled } from '../generators/skills.js';
import { generateAgents, generateGeminiAgents, agentsInstalled } from '../generators/agents.js';
import { generateGemini, writeGeminiSettings, generateGeminiCommands, regenerateGeminiModuleFiles } from '../generators/gemini.js';
import { generateAntigravity, generateAntigravityWorkflows, regenerateAntigravityRules, antigravityInstalled } from '../generators/antigravity.js';
import { writeStatsCache } from '../utils/stats-cache.js';
import { installGitHook } from '../hooks/install.js';
import { select, multiSelect, input } from '../utils/prompt.js';
import { tick, cross, bold, cyan, dim, green, yellow, gray } from '../utils/color.js';
import { checkVersionAndNotify, clearVersionCache } from '../utils/version-check.js';
import { wants, normalizeTargets, primaryDir } from '../utils/targets.js';

const COMMANDS_DIR = () => join(TEMPLATES_DIR, 'commands');

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

  const targets = await selectTargets();
  console.log('');

  // Multi-repo mode: root folder with sub-repos (backend + frontend)
  const subRepos = detectSubRepos(cwd);
  if (subRepos.length >= 2) {
    await runMultiRepoInit(cwd, subRepos, targets);
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

  await writeOutputFiles(cwd, scanData, isNew, targets);

  if (wants(targets, 'claude')) {
    await maybeEnableStatusline(cwd);
  }
  await maybeGenerateSkills(cwd, scanData, targets);
  if (wants(targets, 'claude') || wants(targets, 'gemini')) {
    await maybeGenerateAgents(cwd, scanData, targets);
  }

  printSuccess(cwd, scanData, isNew, targets);
}

async function maybeGenerateAgents(cwd, scanData, targets) {
  console.log('');
  const choice = await select('Generate a multi-agent pipeline (planner → builder → tester + /ship)?', [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ]);
  if (!choice.value) return;

  const where = [];
  let names = [];
  if (wants(targets, 'claude')) { names = generateAgents(cwd, scanData); where.push('.claude/agents/ + /ship skill'); }
  if (wants(targets, 'gemini')) { names = generateGeminiAgents(cwd, scanData); where.push('.gemini/agents/ + ship.toml'); }

  if (names.length && where.length) {
    console.log(`\n  ${tick} Agents generated ${dim(`(${names.join(', ')})`)} ${dim('→ ' + where.join(', '))}`);
    console.log(`    ${dim('Use')} ${cyan('/ship')} ${dim('<feature>')} ${dim('to run plan → implement → test')}`);
  }
}

async function maybeGenerateSkills(cwd, scanData, targets) {
  console.log('');

  // Antigravity has no separate skill files — that guidance is already baked into
  // .agent/rules/. If no skill-capable tool is selected, don't prompt.
  const skillTargets = ['claude', 'gemini', 'cursor'].filter((t) => wants(targets, t));
  if (!skillTargets.length) {
    console.log(`  ${dim('Skill guidance for Antigravity is embedded in .agent/rules/ — no separate skill files.')}`);
    return;
  }

  const choice = await select('Generate project-aware skills (design, devops, db)?', [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ]);
  if (!choice.value) return;

  const names = generateSkills(cwd, scanData, targets);
  if (!names.length) {
    console.log(`\n  ${dim('No applicable skills for this stack')}`);
    return;
  }
  const where = skillTargets
    .map((t) => (t === 'cursor' ? '.cursor/rules/' : `.${t}/skills/`))
    .join(' + ');
  console.log(`\n  ${tick} Skills generated ${dim(`(${names.join(', ')})`)} ${dim('→ ' + where)}`);
}

async function maybeEnableStatusline(cwd) {
  console.log('');
  const choice = await select('Show a promptpilot-ai status bar in Claude Code?', [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ]);
  if (!choice.value) return;
  const res = installStatusline(cwd);
  if (res.installed) {
    console.log(`\n  ${tick} Status bar enabled ${dim('(.claude/pp-statusline.mjs)')}`);
  } else {
    console.log(`\n  ${dim('Status bar: kept your existing statusLine config')}`);
  }
}

async function selectTargets() {
  const chosen = await multiSelect('Which AI tools are you using?', [
    { label: 'Claude Code', value: 'claude' },
    { label: 'Cursor', value: 'cursor' },
    { label: 'Gemini CLI', value: 'gemini' },
    { label: 'Antigravity', value: 'antigravity' },
  ]);
  return chosen.map((c) => c.value);
}

async function runMultiRepoInit(cwd, subRepos, target = ['claude']) {
  const targets = normalizeTargets(target);
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
    if (wants(targets, 'claude')) {
      generateContextFiles(repo.path, repo.scanData);
      updateClaudeMd(repo.path, repo.scanData);
      writeClaudeSettings(repo.path, repo.scanData.stack);
    }
    if (wants(targets, 'cursor')) {
      generateCursorRules(repo.path, repo.scanData);
    }
    if (wants(targets, 'gemini')) {
      generateGemini(repo.path, repo.scanData);
      writeGeminiSettings(repo.path);
    }
    if (wants(targets, 'antigravity')) {
      generateAntigravity(repo.path, repo.scanData);
    }
    installGitHook(repo.path);
    const repoAgents = generateAgentsMd(repo.path, repo.scanData, targets);
    writeStatsCache(repo.path, repo.scanData, targets);
    console.log(`  ${tick} ${cyan(repo.name + '/')} context ${dim(`+ AGENTS.md (${repoAgents})`)}`);
  }

  // Write root-level slash commands
  if (wants(targets, 'claude')) copyCommandTemplates(cwd);
  if (wants(targets, 'gemini')) generateGeminiCommands(cwd, COMMANDS_DIR());
  if (wants(targets, 'antigravity')) generateAntigravityWorkflows(cwd, COMMANDS_DIR());

  // One root .gitignore covers every sub-repo's per-machine state (bare patterns).
  if (ensureGitignore(cwd)) console.log(`  ${tick} ${cyan('.gitignore')} ${dim('(ignore per-machine .last-sync / .pp-stats.json)')}`);
  const untrackedRoot = untrackLocalState(cwd);
  if (untrackedRoot.length) console.log(`  ${tick} ${dim(`Untracked ${untrackedRoot.length} per-machine file(s) from git`)}`);

  if (frontend && backend) {
    const frontendData = scanResults.find((r) => r.name === frontend.name);
    const backendData = scanResults.find((r) => r.name === backend.name);
    if (frontendData && backendData) {
      generateBridgeFile(cwd, frontendData, backendData);
      console.log(`  ${tick} ${cyan('.claude/context/bridge.md')} ${dim('(frontend ↔ backend API map)')}`);
    }
  }

  const rootAgents = generateRootAgentsMd(
    cwd,
    scanResults.map((r) => ({ name: r.name, role: r.role, framework: r.scanData?.stack?.framework?.name }))
  );
  console.log(`  ${tick} ${cyan('AGENTS.md')} ${dim(`(workspace root — ${rootAgents})`)}`);

  console.log('');
  console.log(`  ${green('─'.repeat(40))}`);

  if (wants(targets, 'claude')) {
    console.log(`  ${tick} ${bold('Ready!')} Open this folder in Claude Code and try:`);
    console.log('');
    console.log(`    ${cyan('/ask')} add a user profile page`);
    console.log(`    ${dim('Claude will read bridge.md and coordinate both repos')}`);
  }
  if (wants(targets, 'cursor')) {
    console.log(`  ${tick} ${bold('Ready!')} Open this folder in Cursor — rules are auto-loaded from ${cyan('.cursor/rules/')}`);
  }
  if (wants(targets, 'gemini')) {
    console.log(`  ${tick} ${bold('Ready!')} Open this folder with Gemini CLI — context is in ${cyan('GEMINI.md')} + ${cyan('.gemini/')}`);
  }
  if (wants(targets, 'antigravity')) {
    console.log(`  ${tick} ${bold('Ready!')} Open this folder in Antigravity — rules in ${cyan('.agent/rules/')}, AGENTS.md auto-loaded`);
  }
  console.log('');
}

export async function runSync(cwd, opts = {}) {
  if (!isGitRepo(cwd)) {
    console.log(`\n  ${yellow('No git repo found')} ${dim('— scanning filesystem directly')}`);
  }

  console.log(`\n  ${cyan('promptpilot-ai')} — Syncing project context\n`);

  const targets = detectExistingTargets(cwd);

  const subRepos = detectSubRepos(cwd);
  if (subRepos.length >= 2) {
    await runMultiRepoInit(cwd, subRepos, targets);
    if (opts.templates) refreshTemplates(cwd, targets);
    if (opts.templates) clearVersionCache(cwd);
    return;
  }

  const scanData = await runScan(cwd);
  if (!scanData) {
    console.error(`  ${cross} No files found.\n`);
    process.exit(1);
  }

  await writeOutputFiles(cwd, scanData, false, targets);

  if (skillsInstalled(cwd)) {
    const names = generateSkills(cwd, scanData, targets);
    if (names.length) console.log(`  ${tick} Skills refreshed ${dim(`(${names.join(', ')})`)}`);
  }

  if (agentsInstalled(cwd)) {
    let names = [];
    if (wants(targets, 'claude')) names = generateAgents(cwd, scanData);
    if (wants(targets, 'gemini')) names = generateGeminiAgents(cwd, scanData);
    if (names.length) console.log(`  ${tick} Agents refreshed ${dim(`(${names.join(', ')})`)}`);
  }

  if (opts.templates) {
    refreshTemplates(cwd, targets);
    clearVersionCache(cwd);
    console.log(`  ${tick} Templates refreshed ${dim('(slash commands updated)')}`);
  }

  console.log(`\n  ${tick} Context updated.\n`);
}

function refreshTemplates(cwd, targets) {
  if (wants(targets, 'claude')) {
    copyCommandTemplates(cwd, { force: true });
    refreshStatuslineScript(cwd);
  }
  if (wants(targets, 'gemini')) generateGeminiCommands(cwd, COMMANDS_DIR(), { force: true });
  if (wants(targets, 'antigravity')) generateAntigravityWorkflows(cwd, COMMANDS_DIR(), { force: true });
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
    const targets = detectExistingTargets(cwd);
    if (wants(targets, 'claude')) regenerateModuleFiles(cwd, result.affectedModules);
    if (wants(targets, 'cursor')) regenerateCursorModuleFiles(cwd, result.affectedModules);
    if (wants(targets, 'gemini')) regenerateGeminiModuleFiles(cwd, result.affectedModules);
    if (wants(targets, 'antigravity')) regenerateAntigravityRules(cwd, result.affectedModules);
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
  const targets = detectExistingTargets(cwd);
  return join(cwd, primaryDir(targets), '.last-sync');
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

async function writeOutputFiles(cwd, scanData, isNew, target = ['claude']) {
  const targets = normalizeTargets(target);
  console.log(`\n  ${dim('Writing context files...')}\n`);

  const printModules = (written, dir) => {
    if (written.length > 0) {
      console.log(`  ${tick} ${cyan(`${dir}/modules/`)}${dim(` (${written.length} modules)`)}`);
      for (const m of written) console.log(`    ${gray('•')} ${m.name} ${dim(`(${m.fileCount} files)`)}`);
    } else if (isNew) {
      console.log(`  ${tick} ${cyan(`${dir}/modules/`)} ${dim('(empty — add code and run sync)')}`);
    }
  };

  if (wants(targets, 'claude')) {
    const written = generateContextFiles(cwd, scanData);
    console.log(`  ${tick} ${cyan('.claude/context/architecture.md')}`);
    console.log(`  ${tick} ${cyan('.claude/context/stack.md')}`);
    console.log(`  ${tick} ${cyan('.claude/context/patterns.md')}`);
    printModules(written, '.claude/context');

    copyCommandTemplates(cwd);

    const mdStatus = updateClaudeMd(cwd, scanData);
    console.log(`\n  ${tick} CLAUDE.md ${dim(mdStatus)}`);

    writeClaudeSettings(cwd, scanData.stack);
    console.log(`  ${tick} .claude/settings.json`);
  }

  if (wants(targets, 'cursor')) {
    const cursorWritten = generateCursorRules(cwd, scanData);
    console.log(`  ${tick} ${cyan('.cursor/rules/architecture.mdc')}`);
    console.log(`  ${tick} ${cyan('.cursor/rules/stack.mdc')}`);
    console.log(`  ${tick} ${cyan('.cursor/rules/patterns.mdc')}`);
    printModules(cursorWritten, '.cursor/rules');
  }

  if (wants(targets, 'gemini')) {
    const geminiWritten = generateGemini(cwd, scanData);
    console.log(`  ${tick} ${cyan('GEMINI.md')} ${dim('+ .gemini/context/ (architecture, stack, patterns)')}`);
    printModules(geminiWritten, '.gemini/context');
    writeGeminiSettings(cwd);
    console.log(`  ${tick} ${cyan('.gemini/settings.json')} ${dim('(reads AGENTS.md + GEMINI.md)')}`);
    const cmds = generateGeminiCommands(cwd, COMMANDS_DIR());
    if (cmds.length) console.log(`  ${tick} ${cyan('.gemini/commands/')} ${dim(`(${cmds.length} TOML commands)`)}`);
    console.log(`  ${tick} ${cyan('.geminiignore')}`);
  }

  if (wants(targets, 'antigravity')) {
    const agWritten = generateAntigravity(cwd, scanData);
    console.log(`  ${tick} ${cyan('.agent/rules/')} ${dim('(architecture, stack, patterns — glob-scoped)')}`);
    printModules(agWritten, '.agent/rules');
    const flows = generateAntigravityWorkflows(cwd, COMMANDS_DIR());
    if (flows.length) console.log(`  ${tick} ${cyan('.agent/workflows/')} ${dim(`(${flows.length} workflows)`)}`);
  }

  const agentsMdStatus = generateAgentsMd(cwd, scanData, targets);
  console.log(`  ${tick} AGENTS.md ${dim(`${agentsMdStatus} — mandatory standards + Project rules (all AI tools)`)}`);

  const hookResult = installGitHook(cwd);
  if (hookResult.success) {
    console.log(`  ${tick} Git hook ${dim('(post-commit auto-sync)')}`);
  }

  writeStatsCache(cwd, scanData, targets);

  // Per-machine state (sync marker + stats cache) must never be committed — it
  // churns per developer and causes merge conflicts on shared repos.
  if (ensureGitignore(cwd)) {
    console.log(`  ${tick} .gitignore ${dim('(ignore per-machine .last-sync / .pp-stats.json)')}`);
  }
  const untracked = untrackLocalState(cwd);
  if (untracked.length) {
    console.log(`  ${tick} ${dim(`Untracked ${untracked.length} per-machine file(s) from git (working copies kept)`)}`);
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
    { label: 'Next.js', value: 'nextjs', type: 'fullstack', lang: 'node' },
    { label: 'React SPA (Vite)', value: 'react', type: 'spa', lang: 'node' },
    { label: 'NestJS', value: 'nestjs', type: 'api', lang: 'node' },
    { label: 'Express', value: 'express', type: 'api', lang: 'node' },
    { label: 'Node.js CLI / Library', value: 'node', type: 'library', lang: 'node' },
    { label: 'Laravel (PHP)', value: 'laravel', type: 'fullstack', lang: 'php' },
    { label: 'Django (Python)', value: 'django', type: 'fullstack', lang: 'python' },
    { label: 'FastAPI (Python)', value: 'fastapi', type: 'api', lang: 'python' },
    { label: 'Flask (Python)', value: 'flask', type: 'api', lang: 'python' },
  ]);
  console.log('');

  const langKind = framework.lang;

  let language;
  if (langKind === 'node') {
    language = await select('Language', [
      { label: 'TypeScript', value: 'typescript' },
      { label: 'JavaScript', value: 'javascript' },
    ]);
    console.log('');
  } else if (langKind === 'php') {
    language = { label: 'PHP', value: 'php' };
  } else {
    language = { label: 'Python', value: 'python' };
  }

  let packageManager;
  if (langKind === 'node') {
    packageManager = await select('Package manager', [
      { label: 'pnpm', value: 'pnpm' },
      { label: 'npm', value: 'npm' },
      { label: 'yarn', value: 'yarn' },
    ]);
    console.log('');
  } else if (langKind === 'php') {
    packageManager = { label: 'Composer', value: 'composer' };
  } else {
    packageManager = await select('Package manager', [
      { label: 'pip', value: 'pip' },
      { label: 'Poetry', value: 'poetry' },
      { label: 'Pipenv', value: 'pipenv' },
      { label: 'uv', value: 'uv' },
    ]);
    console.log('');
  }

  let database = { label: 'None', value: 'none' };
  let orm = { label: 'None', value: 'none' };

  const backendish = ['nextjs', 'nestjs', 'express', 'laravel', 'django', 'fastapi', 'flask'].includes(framework.value);
  if (backendish) {
    database = await select('Database', [
      { label: 'None', value: 'none' },
      { label: 'PostgreSQL', value: 'postgresql' },
      { label: 'MySQL', value: 'mysql' },
      { label: 'MongoDB', value: 'mongodb' },
      { label: 'SQLite', value: 'sqlite' },
    ]);
    console.log('');

    if (database.value !== 'none') {
      // Laravel and Django ship a built-in ORM — no prompt needed.
      if (framework.value === 'laravel') {
        orm = { label: 'Eloquent', value: 'eloquent' };
      } else if (framework.value === 'django') {
        orm = { label: 'Django ORM', value: 'django-orm' };
      } else {
        orm = await select('ORM / Query Builder', ormChoices(langKind));
        console.log('');
      }
    }
  }

  let testing;
  if (langKind === 'php') {
    testing = await select('Testing', [
      { label: 'Pest', value: 'pest' },
      { label: 'PHPUnit', value: 'phpunit' },
      { label: 'None', value: 'none' },
    ]);
  } else if (langKind === 'python') {
    testing = await select('Testing', [
      { label: 'pytest', value: 'pytest' },
      { label: 'unittest', value: 'unittest' },
      { label: 'None', value: 'none' },
    ]);
  } else {
    testing = await select('Testing', [
      { label: 'Vitest', value: 'vitest' },
      { label: 'Jest', value: 'jest' },
      { label: 'None', value: 'none' },
    ]);
  }
  console.log('');

  return { framework, language, packageManager, database, orm, testing };
}

function ormChoices(langKind) {
  if (langKind === 'python') {
    return [
      { label: 'SQLAlchemy', value: 'sqlalchemy' },
      { label: 'SQLModel', value: 'sqlmodel' },
      { label: 'Tortoise ORM', value: 'tortoise' },
      { label: 'Raw SQL', value: 'none' },
    ];
  }
  if (langKind === 'php') {
    return [
      { label: 'Doctrine', value: 'doctrine' },
      { label: 'Raw SQL', value: 'none' },
    ];
  }
  return [
    { label: 'Prisma', value: 'prisma' },
    { label: 'Drizzle', value: 'drizzle' },
    { label: 'TypeORM', value: 'typeorm' },
    { label: 'Raw SQL', value: 'none' },
  ];
}

function buildScanDataFromConfig(config) {
  const { framework, language, packageManager, database, orm, testing } = config;

  const frameworkNames = {
    nextjs: { name: 'Next.js', type: 'fullstack' },
    react: { name: 'React', type: 'spa' },
    nestjs: { name: 'NestJS', type: 'api' },
    express: { name: 'Express', type: 'api' },
    node: { name: 'Node.js', type: 'library' },
    laravel: { name: 'Laravel', type: 'fullstack' },
    django: { name: 'Django', type: 'fullstack' },
    fastapi: { name: 'FastAPI', type: 'api' },
    flask: { name: 'Flask', type: 'api' },
  };

  const languageLabel = { typescript: 'TypeScript', javascript: 'JavaScript', php: 'PHP', python: 'Python' }[language.value];
  const runtime = language.value === 'php' ? 'PHP' : language.value === 'python' ? 'Python' : 'Node.js';

  const stack = {
    language: languageLabel,
    runtime,
    framework: frameworkNames[framework.value],
    packageManager: packageManager.value,
    database: database.value !== 'none' ? database.label : null,
    orm: orm.value !== 'none' ? orm.label : null,
    testFramework: testing.value !== 'none' ? testing.label : null,
    uiLibrary: null,
    buildTool: framework.value === 'react' || framework.value === 'laravel' ? 'Vite' : null,
    keyDeps: {},
    commands: buildConfigCommands(framework.value, packageManager.value),
  };

  const modules = buildDefaultModules(framework.value, language.value);
  const patterns = buildConfigPatterns(framework.value, language.value);

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

function buildConfigCommands(fw, pm) {
  if (fw === 'laravel') {
    return { install: 'composer install', dev: 'php artisan serve', build: 'npm run build', migrate: 'php artisan migrate', test: 'php artisan test', lint: './vendor/bin/pint' };
  }
  if (fw === 'django' || fw === 'fastapi' || fw === 'flask') {
    const run = pm === 'poetry' ? 'poetry run ' : pm === 'pipenv' ? 'pipenv run ' : '';
    const install = pm === 'poetry' ? 'poetry install' : pm === 'pipenv' ? 'pipenv install' : pm === 'uv' ? 'uv pip install -r requirements.txt' : 'pip install -r requirements.txt';
    if (fw === 'django') return { install, dev: `${run}python manage.py runserver`, migrate: `${run}python manage.py migrate`, test: `${run}pytest`, lint: `${run}ruff check .` };
    if (fw === 'fastapi') return { install, dev: `${run}uvicorn main:app --reload`, test: `${run}pytest`, lint: `${run}ruff check .` };
    return { install, dev: `${run}flask run --debug`, test: `${run}pytest`, lint: `${run}ruff check .` };
  }
  return { install: `${pm} install`, dev: `${pm} run dev`, build: `${pm} run build`, test: `${pm} run test`, lint: `${pm} run lint` };
}

function buildConfigPatterns(fw, langValue) {
  if (langValue === 'php') {
    return {
      fileNaming: 'PascalCase (classes), kebab-case (Blade views)',
      componentNaming: 'PascalCase (PSR-4 classes)',
      importStyle: 'PSR-4 namespaces (use statements)',
      hasPathAliases: true,
      patterns: getDefaultPatterns(fw),
      stateManagement: null,
      cssApproach: 'Tailwind CSS',
    };
  }
  if (langValue === 'python') {
    return {
      fileNaming: 'snake_case',
      componentNaming: 'PascalCase (classes), snake_case (functions)',
      importStyle: 'PEP 8 imports (stdlib → third-party → local)',
      hasPathAliases: false,
      patterns: getDefaultPatterns(fw),
      stateManagement: null,
      cssApproach: null,
    };
  }
  return {
    fileNaming: 'kebab-case',
    componentNaming: 'PascalCase',
    importStyle: 'ESM',
    hasPathAliases: langValue === 'typescript',
    patterns: getDefaultPatterns(fw),
    stateManagement: null,
    cssApproach: 'Tailwind CSS',
  };
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
    laravel: [
      { name: 'controllers', path: 'app/Http/Controllers', files: [], type: 'api', deps: [], testFiles: [] },
      { name: 'models', path: 'app/Models', files: [], type: 'database', deps: [], testFiles: [] },
      { name: 'routes', path: 'routes', files: [], type: 'api', deps: [], testFiles: [] },
      { name: 'views', path: 'resources/views', files: [], type: 'ui', deps: [], testFiles: [] },
      { name: 'migrations', path: 'database/migrations', files: [], type: 'database', deps: [], testFiles: [] },
    ],
    django: [
      { name: 'core', path: 'core', files: [], type: 'config', deps: [], testFiles: [] },
      { name: 'api', path: 'api', files: [], type: 'api', deps: [], testFiles: [] },
      { name: 'users', path: 'users', files: [], type: 'feature', deps: [], testFiles: [] },
    ],
    fastapi: [
      { name: 'routers', path: 'app/routers', files: [], type: 'api', deps: [], testFiles: [] },
      { name: 'models', path: 'app/models', files: [], type: 'database', deps: [], testFiles: [] },
      { name: 'schemas', path: 'app/schemas', files: [], type: 'feature', deps: [], testFiles: [] },
    ],
    flask: [
      { name: 'routes', path: 'app/routes', files: [], type: 'api', deps: [], testFiles: [] },
      { name: 'models', path: 'app/models', files: [], type: 'database', deps: [], testFiles: [] },
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
    laravel: ['Controller pattern', 'Eloquent models', 'Form Request validation', 'Blade templates', 'Route files (web.php / api.php)'],
    django: ['Django models (ORM)', 'Django views', 'URL routing (urls.py)', 'Django admin'],
    fastapi: ['APIRouter modules', 'Pydantic schemas', 'Dependency injection'],
    flask: ['Flask blueprints', 'SQLAlchemy models'],
  };
  return patterns[frameworkValue] || [];
}

function detectNewProject(cwd) {
  try {
    const files = execSync('git ls-files', { cwd, encoding: 'utf8', stdio: 'pipe' }).trim().split('\n').filter(Boolean);
    const sourceFiles = files.filter((f) => /\.(ts|tsx|js|jsx|py|php|go|rs|dart|kt|java|swift)$/.test(f));
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

// Per-machine, non-deterministic files promptpilot writes into each tool dir.
// They must be git-ignored so multiple developers on one repo don't churn /
// conflict on them. Bare patterns (no slash) match at any depth → also cover
// monorepo sub-repos like `frontend/.claude/.last-sync`.
const GITIGNORE_MARKER = '# promptpilot-ai — per-machine local state (do not commit)';
const LOCAL_STATE_PATTERNS = ['.last-sync', '.pp-stats.json', '_promptpilot-update.mdc'];
const LOCAL_STATE_RE = /(?:^|\/)(\.last-sync|\.pp-stats\.json|_promptpilot-update\.mdc)$/;

// Append the ignore patterns to .gitignore (idempotent; skips ones already
// present). Returns true if it changed the file.
function ensureGitignore(cwd) {
  if (!isGitRepo(cwd)) return false;
  const path = join(cwd, '.gitignore');
  let existing = '';
  if (existsSync(path)) existing = readFileSync(path, 'utf8');
  if (existing.includes(GITIGNORE_MARKER)) return false;

  const present = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = LOCAL_STATE_PATTERNS.filter((p) => !present.has(p));
  if (!missing.length) return false;

  const block = `${GITIGNORE_MARKER}\n${missing.join('\n')}\n`;
  const out = existing.trim() ? existing.trimEnd() + '\n\n' + block : block;
  try {
    writeFileSync(path, out);
    return true;
  } catch {
    return false;
  }
}

// If any per-machine file was previously committed (e.g. before this fix), stop
// tracking it so it leaves the repo on the next commit. `--cached` keeps the
// working copy. Returns the list of untracked paths.
function untrackLocalState(cwd) {
  if (!isGitRepo(cwd)) return [];
  try {
    const all = execSync('git ls-files', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter(Boolean);
    const files = all.filter((f) => LOCAL_STATE_RE.test(f));
    if (!files.length) return [];
    execSync(`git rm --cached --quiet -- ${files.map((f) => JSON.stringify(f)).join(' ')}`, { cwd, stdio: 'ignore' });
    return files;
  } catch {
    return [];
  }
}

function detectExistingTargets(cwd) {
  const t = [];
  // Gate each tool on an artifact promptpilot actually writes — never a bare
  // `.claude/` (a Claude-Code user may commit one without opting into promptpilot).
  if (existsSync(join(cwd, '.claude', 'context')) || existsSync(join(cwd, 'CLAUDE.md'))) t.push('claude');
  if (existsSync(join(cwd, '.cursor', 'rules'))) t.push('cursor');
  if (existsSync(join(cwd, 'GEMINI.md')) || existsSync(join(cwd, '.gemini', 'context'))) t.push('gemini');
  if (antigravityInstalled(cwd)) t.push('antigravity'); // covers `.agent` + legacy `.agents` (v0.10.0)
  return t.length ? t : ['claude'];
}

function printHeader() {
  console.log('');
  console.log(`  ${bold(cyan('promptpilot-ai'))} — AI Context Layer`);
  console.log(`  ${dim('─'.repeat(40))}`);
  console.log('');
}

function printSuccess(cwd, scanData, isNew, target = ['claude']) {
  const targets = normalizeTargets(target);
  console.log('');
  console.log(`  ${green('─'.repeat(40))}`);

  if (wants(targets, 'claude')) {
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

  if (wants(targets, 'cursor')) {
    console.log(`  ${tick} ${bold('Ready for Cursor!')} Rules auto-loaded from ${cyan('.cursor/rules/')}`);
    console.log(`    ${dim('Cursor reads these automatically when you open files in each module')}`);
    console.log('');
  }

  if (wants(targets, 'gemini')) {
    console.log(`  ${tick} ${bold('Ready for Gemini CLI!')} Context in ${cyan('GEMINI.md')}; commands in ${cyan('.gemini/commands/')}`);
    console.log(`    ${dim('Run')} ${cyan('gemini')} ${dim('in this folder — try /ask or /plan')}`);
    console.log('');
  }

  if (wants(targets, 'antigravity')) {
    console.log(`  ${tick} ${bold('Ready for Antigravity!')} Rules in ${cyan('.agent/rules/')}; workflows in ${cyan('.agent/workflows/')}`);
    console.log(`    ${dim('AGENTS.md is auto-loaded; run /ask or /plan as a workflow')}`);
    console.log('');
  }

  console.log(`  ${dim('To update context after adding new modules:')}`);
  console.log(`    ${dim('npx promptpilot-ai sync')}`);
  console.log('');
}
