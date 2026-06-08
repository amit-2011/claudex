import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildMandatoryStandards } from './standards.js';

export function generateContextFiles(cwd, { fileData, stack, modules, patterns, stateManagement }) {
  if (patterns.stateManagement) stack = { ...stack, stateManagement: patterns.stateManagement };
  const contextDir = join(cwd, '.claude', 'context');
  const modulesDir = join(contextDir, 'modules');

  mkdirSync(contextDir, { recursive: true });
  mkdirSync(modulesDir, { recursive: true });

  writeFileSync(join(contextDir, 'architecture.md'), buildArchitecture(fileData, stack, modules));
  writeFileSync(join(contextDir, 'stack.md'), buildStack(stack, patterns));
  writeFileSync(
    join(contextDir, 'patterns.md'),
    buildPatterns(patterns, stack) + '\n\n' + buildMandatoryStandards({ stack, patterns, modules })
  );

  const written = [];
  for (const mod of modules) {
    const filename = mod.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() + '.md';
    writeFileSync(join(modulesDir, filename), buildModule(mod));
    written.push({ name: mod.name, filename, fileCount: mod.files.length });
  }

  return written;
}

export function regenerateModuleFiles(cwd, modules) {
  const modulesDir = join(cwd, '.claude', 'context', 'modules');
  mkdirSync(modulesDir, { recursive: true });

  for (const mod of modules) {
    const filename = mod.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() + '.md';
    writeFileSync(join(modulesDir, filename), buildModule(mod));
  }
}

function buildArchitecture(fileData, stack, modules) {
  const framework = stack.framework;
  const type = framework?.type === 'fullstack' ? 'Full-Stack Web App'
    : framework?.type === 'api' ? 'Backend API'
    : framework?.type === 'spa' ? 'Single-Page Application'
    : framework?.type === 'mobile' ? `Mobile App (${framework?.name || stack.language})`
    : framework?.type === 'library' ? `${stack.language || ''} Library / CLI`.trim()
    : `${stack.language || 'Unknown'} Project`;

  const IGNORE = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage', 'vendor', 'storage', '__pycache__', '.venv', 'venv'];
  const topDirs = Object.keys(fileData.tree).filter(
    (k) => typeof fileData.tree[k] === 'object' && fileData.tree[k] !== null && !IGNORE.includes(k)
  );

  const dirDescriptions = topDirs.map((d) => `- \`${d}/\` — ${describeDir(d, framework)}`);

  const moduleList = modules.map((m) => `- **${m.name}** (${m.files.length} files) — ${describeModuleType(m.type)}`);

  return `# Project Architecture

## Project Type
${type}

## Framework
${framework ? `${framework.name}${framework.version ? ` ${framework.version}` : ''}` : 'None detected'}

## Language
${stack.language}

## Entry Points
${fileData.entryPoints.length > 0 ? fileData.entryPoints.map((e) => `- \`${e}\``).join('\n') : '- Not detected'}

## Directory Structure
${dirDescriptions.join('\n')}

## Modules
${moduleList.join('\n')}

## Config Files
${fileData.configFiles.map((c) => `- \`${c}\``).join('\n')}

## Total Files
${fileData.totalFiles} tracked files
`;
}

function buildStack(stack, patterns) {
  const depList = Object.entries(stack.keyDeps || {})
    .map(([pkg, ver]) => {
      const v = String(ver).replace(/[^0-9.]/g, '');
      return `- \`${pkg}${v ? '@' + v : ''}\``;
    })
    .join('\n');

  return `# Tech Stack

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
}

export function commandsBlock(stack) {
  const c = stack.commands;
  if (!c) {
    const pm = stack.packageManager || 'npm';
    return [
      `${pm} install`.padEnd(34) + '# Install dependencies',
      `${pm} run dev`.padEnd(34) + '# Start development server',
      `${pm} run build`.padEnd(34) + '# Production build',
      `${pm} run test`.padEnd(34) + '# Run tests',
      `${pm} run lint`.padEnd(34) + '# Lint code',
    ].join('\n');
  }
  const labels = {
    install: 'Install dependencies',
    dev: 'Start / run the app',
    android: 'Run on Android',
    ios: 'Run on iOS',
    build: 'Production build',
    migrate: 'Run database migrations',
    test: 'Run tests',
    lint: 'Lint code',
  };
  const order = ['install', 'dev', 'android', 'ios', 'build', 'migrate', 'test', 'lint'];
  return order
    .filter((k) => c[k])
    .map((k) => {
      const cmd = `${c[k]}`;
      return (cmd.length >= 33 ? cmd + '  ' : cmd.padEnd(34)) + `# ${labels[k]}`;
    })
    .join('\n');
}

function buildPatterns(patterns, stack) {
  const archPatterns = patterns.patterns.length > 0
    ? patterns.patterns.map((p) => `- ${p}`).join('\n')
    : '- No specific patterns detected';

  return `# Code Patterns

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
`.replace(/\n\n+/g, '\n\n');
}

function buildModule(mod) {
  const fileList = mod.files.map((f) => `- \`${f}\``).join('\n');
  const testList = mod.testFiles?.length > 0
    ? mod.testFiles.map((f) => `- \`${f}\``).join('\n')
    : '- None found';

  return `# ${capitalize(mod.name)} Module

## Type
${describeModuleType(mod.type)}

## Files
${fileList || '- No files yet'}

## Test Files
${testList}

## Dependencies
${mod.deps.length > 0 ? mod.deps.map((d) => `- ${d}`).join('\n') : '- Not analyzed — check imports in the files above'}

## Notes
- When modifying this module, check existing patterns in the files above first
- Do not duplicate logic that already exists in this module
`;
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

export function describeDir(d, framework) {
  const fw = framework?.name || '';
  const appDesc = fw === 'Next.js' ? 'Next.js App Router routes and layouts'
    : fw === 'Laravel' || fw === 'Lumen' ? 'Laravel application core (Models, Http controllers, Providers)'
    : fw === 'Flask' || fw === 'FastAPI' ? 'Application package (routers, models, schemas)'
    : 'Application source code';

  return {
    // shared / Node
    src: 'Application source code',
    app: appDesc,
    pages: 'Next.js Pages Router',
    components: 'Reusable UI components',
    widgets: 'Reusable UI widgets',
    screens: 'App screens',
    Sources: 'Swift source code',
    lib: fw === 'Flutter' ? 'Flutter application source (Dart)' : 'Shared utilities and helpers',
    utils: 'Utility functions',
    server: 'Server-side code',
    api: 'API routes or controllers',
    public: 'Static assets',
    prisma: 'Database schema and migrations',
    tests: 'Test files',
    test: 'Test files',
    scripts: 'Build and utility scripts',
    docs: 'Documentation',
    config: 'Configuration files',
    // Laravel
    routes: 'Route definitions (web.php, api.php)',
    resources: 'Blade views, JS/CSS assets, language files',
    database: 'Migrations, seeders, factories',
    bootstrap: 'Framework bootstrap files',
    // Django / Python
    templates: 'HTML templates',
    static: 'Static assets (CSS, JS, images)',
    migrations: 'Database migrations',
    apps: 'Django applications',
    core: 'Core application logic',
    services: 'Service layer',
    schemas: 'Pydantic / data schemas',
    models: 'Data models',
  }[d] || 'Project files';
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
