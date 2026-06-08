import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describeDir, commandsBlock } from './context.js';
import { buildMandatoryStandards } from './standards.js';

export function generateCursorRules(cwd, { fileData, stack, modules, patterns }) {
  if (patterns?.stateManagement) stack = { ...stack, stateManagement: patterns.stateManagement };

  const rulesDir = join(cwd, '.cursor', 'rules');
  const modulesDir = join(rulesDir, 'modules');

  mkdirSync(rulesDir, { recursive: true });
  mkdirSync(modulesDir, { recursive: true });

  writeFileSync(join(rulesDir, 'architecture.mdc'), buildArchitectureMdc(fileData, stack, modules));
  writeFileSync(join(rulesDir, 'stack.mdc'), buildStackMdc(stack, patterns));
  writeFileSync(join(rulesDir, 'patterns.mdc'), buildPatternsMdc(patterns, stack, modules));

  const written = [];
  for (const mod of modules) {
    const filename = mod.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() + '.mdc';
    writeFileSync(join(modulesDir, filename), buildModuleMdc(mod));
    written.push({ name: mod.name, filename, fileCount: mod.files.length });
  }

  return written;
}

export function regenerateCursorModuleFiles(cwd, modules) {
  const modulesDir = join(cwd, '.cursor', 'rules', 'modules');
  mkdirSync(modulesDir, { recursive: true });

  for (const mod of modules) {
    const filename = mod.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() + '.mdc';
    writeFileSync(join(modulesDir, filename), buildModuleMdc(mod));
  }
}

function mdc(description, alwaysApply, globs, content) {
  const globLine = globs ? `globs: ${globs}` : 'globs:';
  return `---\ndescription: ${description}\n${globLine}\nalwaysApply: ${alwaysApply}\n---\n\n${content}`;
}

function buildArchitectureMdc(fileData, stack, modules) {
  const framework = stack.framework;
  const type =
    framework?.type === 'fullstack' ? 'Full-Stack Web App'
    : framework?.type === 'api' ? 'Backend API'
    : framework?.type === 'spa' ? 'Single-Page Application'
    : `${stack.language || 'Unknown'} Project`;

  const IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage', 'vendor', 'storage', '__pycache__', '.venv', 'venv'];
  const topDirs = Object.keys(fileData.tree || {}).filter(
    (k) => typeof fileData.tree[k] === 'object' && fileData.tree[k] !== null && !IGNORE.includes(k)
  );

  const dirDescriptions = topDirs.map((d) => `- \`${d}/\` — ${describeDir(d, framework)}`);

  const moduleList = modules.map(
    (m) => `- **${m.name}** (${m.files.length} files) — ${describeModuleType(m.type)}`
  );

  const content = `# Project Architecture

## Project Type
${type}

## Framework
${framework ? `${framework.name}${framework.version ? ` ${framework.version}` : ''}` : 'None detected'}

## Language
${stack.language}

## Entry Points
${fileData.entryPoints?.length > 0 ? fileData.entryPoints.map((e) => `- \`${e}\``).join('\n') : '- Not detected'}

## Directory Structure
${dirDescriptions.join('\n')}

## Modules
${moduleList.join('\n')}

## Config Files
${(fileData.configFiles || []).map((c) => `- \`${c}\``).join('\n')}

## Total Files
${fileData.totalFiles} tracked files
`;

  return mdc('Project architecture overview — read before making structural changes', true, '', content);
}

function buildStackMdc(stack, patterns) {
  const depList = Object.entries(stack.keyDeps || {})
    .map(([pkg, ver]) => {
      const v = String(ver).replace(/[^0-9.]/g, '');
      return `- \`${pkg}${v ? '@' + v : ''}\``;
    })
    .join('\n');

  const content = `# Tech Stack

## Runtime
${stack.runtime || 'Node.js'}

## Language
${stack.language}

## Framework
${stack.framework ? `${stack.framework.name}` : 'None'}

## Package Manager
${stack.packageManager}

## Build Tool
${stack.buildTool || 'Default'}

## Database
${stack.database || 'None'}

## ORM / Query Builder
${stack.orm || 'None'}

## UI Library
${stack.uiLibrary || 'None'}

## State Management
${patterns?.stateManagement || stack.stateManagement || 'None detected'}

## Test Framework
${stack.testFramework || 'None'}

## Key Dependencies
${depList || 'None detected'}

## Common Commands
\`\`\`
${commandsBlock(stack)}
\`\`\`
`;

  return mdc('Tech stack, package manager, and common commands', true, '', content);
}

function buildPatternsMdc(patterns, stack, modules = []) {
  const archPatterns =
    patterns.patterns?.length > 0
      ? patterns.patterns.map((p) => `- ${p}`).join('\n')
      : '- No specific patterns detected';

  const content = `# Code Patterns & Conventions

## File Naming
${patterns.fileNaming}

## Class / Component Naming
${patterns.componentNaming}

## Import / Module Style
${patterns.importStyle}

## Path Aliases / Autoload
${patterns.hasPathAliases ? 'Yes — follow the project autoload/alias mapping (tsconfig paths / composer PSR-4)' : 'No — use standard relative / namespaced imports'}

## CSS Approach
${patterns.cssApproach || 'N/A'}

## Architectural Patterns
${archPatterns}

## Rules for New Code
- Match the existing file naming convention: **${patterns.fileNaming}**
- Classes / components must use **${patterns.componentNaming}** naming
- Follow the project's import style: **${patterns.importStyle}**
${patterns.hasPathAliases ? '- Use configured path aliases / PSR-4 namespaces instead of deep relative imports' : ''}
${stack.uiLibrary === 'Tailwind CSS' ? '- Use Tailwind CSS classes — do not write custom CSS unless necessary' : ''}
- Before creating a new class, component, or utility, search for an existing one that can be reused
`.replace(/\n\n+/g, '\n\n') + '\n\n' + buildMandatoryStandards({ stack, patterns, modules });

  return mdc('Code conventions, naming rules, and MANDATORY standards — always follow these', true, '', content);
}

function buildModuleMdc(mod) {
  const fileList = mod.files.map((f) => `- \`${f}\``).join('\n');
  const testList =
    mod.testFiles?.length > 0 ? mod.testFiles.map((f) => `- \`${f}\``).join('\n') : '- None found';

  const globs = mod.path ? `${mod.path}/**` : '';

  const content = `# ${capitalize(mod.name)} Module

## Type
${describeModuleType(mod.type)}

## Files
${fileList || '- No files yet'}

## Test Files
${testList}

## Dependencies
${mod.deps?.length > 0 ? mod.deps.map((d) => `- ${d}`).join('\n') : '- Not analyzed — check imports in the files above'}

## Notes
- When modifying this module, check existing patterns in the files above first
- Do not duplicate logic that already exists in this module
`;

  return mdc(`Context for the ${mod.name} module`, false, globs, content);
}

function describeModuleType(type) {
  const map = {
    feature: 'Business logic feature',
    ui: 'UI components',
    api: 'API routes / controllers',
    database: 'Database models / schema',
    infra: 'Shared utilities / infrastructure',
    config: 'Configuration',
    routes: 'Page routes',
  };
  return map[type] || type;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
