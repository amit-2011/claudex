import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Generates project-aware skills (Claude Code) and equivalent Cursor rules.
// Each skill is pre-filled from the scan data so the AI inherits the project's
// stack and conventions instead of re-deriving them every task.

const SKILL_NAMES = ['design', 'devops', 'db', 'mobile'];

export function generateSkills(cwd, scanData, target = 'claude') {
  const ctx = buildCtx(cwd, scanData);
  const skills = [designSkill(ctx), devopsSkill(ctx), dbSkill(ctx), mobileSkill(ctx)].filter(Boolean);

  const written = [];
  for (const skill of skills) {
    if (target === 'claude' || target === 'both') writeClaudeSkill(cwd, skill);
    if (target === 'cursor' || target === 'both') writeCursorRule(cwd, skill);
    written.push(skill.name);
  }
  return written;
}

export function skillsInstalled(cwd) {
  return SKILL_NAMES.some(
    (n) =>
      existsSync(join(cwd, '.claude', 'skills', n, 'SKILL.md')) ||
      existsSync(join(cwd, '.cursor', 'rules', `${n}.mdc`))
  );
}

// ── writers ──────────────────────────────────────────────────────────
function writeClaudeSkill(cwd, skill) {
  const dir = join(cwd, '.claude', 'skills', skill.name);
  mkdirSync(dir, { recursive: true });

  const fm = ['---', `name: ${skill.name}`, `description: ${skill.description}`];
  if (skill.whenToUse) fm.push(`when_to_use: ${skill.whenToUse}`);
  if (skill.allowedTools) fm.push(`allowed-tools: ${skill.allowedTools}`);
  fm.push('---', '');

  let body = skill.body;
  if (skill.reference) body += `\n\n## Bundled reference\nSee [reference.md](reference.md) for ready-to-adapt snippets for this stack.\n`;

  writeFileSync(join(dir, 'SKILL.md'), fm.join('\n') + body);
  if (skill.reference) writeFileSync(join(dir, 'reference.md'), skill.reference);
}

function writeCursorRule(cwd, skill) {
  const dir = join(cwd, '.cursor', 'rules');
  mkdirSync(dir, { recursive: true });

  // Cursor has no bundled files — inline the reference into the rule body.
  let body = skill.body;
  if (skill.reference) body += `\n\n## Reference\n\n${skill.reference}`;

  const globLine = skill.globs ? `globs: ${skill.globs}` : 'globs:';
  const content = `---\ndescription: ${skill.description}\n${globLine}\nalwaysApply: false\n---\n\n${body}`;
  writeFileSync(join(dir, `${skill.name}.mdc`), content);
}

// ── context ──────────────────────────────────────────────────────────
function buildCtx(cwd, scanData) {
  const { stack = {}, modules = [], patterns = {} } = scanData || {};
  const runtime =
    stack.runtime || (stack.language === 'Python' ? 'Python' : stack.language === 'PHP' ? 'PHP' : 'Node.js');
  return {
    cwd,
    framework: stack.framework?.name || stack.language || 'this project',
    frameworkType: stack.framework?.type,
    language: stack.language,
    runtime,
    pm: stack.packageManager || 'npm',
    uiLibrary: stack.uiLibrary,
    cssApproach: patterns.cssApproach,
    stateManagement: patterns.stateManagement || stack.stateManagement,
    orm: stack.orm,
    database: stack.database,
    fileNaming: patterns.fileNaming,
    componentNaming: patterns.componentNaming,
    cmds: stack.commands || {},
    uiPaths: pathsOfType(modules, ['ui', 'routes']),
    componentPaths: pathsOfType(modules, ['ui']),
    dbPaths: pathsOfType(modules, ['database']),
    devopsFiles: detectDevopsFiles(cwd),
  };
}

// ── reusable-component enumeration (makes the design skill precise) ───
function looseJson(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}

function aliasInfo(cwd) {
  for (const f of ['tsconfig.json', 'jsconfig.json']) {
    try {
      const j = JSON.parse(looseJson(readFileSync(join(cwd, f), 'utf8')));
      const paths = j.compilerOptions?.paths || {};
      for (const [k, v] of Object.entries(paths)) {
        const prefix = k.replace(/\/?\*$/, '');
        const base = (Array.isArray(v) ? v[0] : v).replace(/^\.\//, '').replace(/\/?\*$/, '');
        if (prefix && base) return { prefix, base };
      }
    } catch {}
  }
  return null;
}

function toImportPath(relFile, alias) {
  const noExt = relFile.replace(/\.(tsx?|jsx?|vue|svelte)$/, '');
  if (alias && (noExt === alias.base || noExt.startsWith(alias.base + '/'))) {
    return `${alias.prefix}/${noExt.slice(alias.base.length).replace(/^\//, '')}`;
  }
  return noExt;
}

function collectExports(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part || /^type\s/.test(part)) continue;
      const name = part.split(/\s+as\s+/).pop().trim();
      if (/^[A-Z][\w$]*$/.test(name)) names.add(name);
    }
  }
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Z][\w$]*)/g)) {
    names.add(m[1]);
  }
  return [...names];
}

function walkSource(dir, acc, cap) {
  if (acc.length >= cap) return;
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (acc.length >= cap) return;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkSource(p, acc, cap);
    else if (/\.(tsx|ts|jsx|js|vue|svelte)$/.test(e.name) && !/\.(test|spec|d)\./.test(e.name)) acc.push(p);
  }
}

function enumerateComponents(cwd, componentPaths, alias) {
  const out = [];
  for (const rel of componentPaths) {
    const files = [];
    walkSource(join(cwd, rel), files, 80);
    for (const absFile of files) {
      if (out.length >= 24) break;
      let src = '';
      try { src = readFileSync(absFile, 'utf8'); } catch { continue; }
      const names = collectExports(src);
      if (names.length) out.push({ importPath: toImportPath(absFile.slice(cwd.length + 1), alias), names: names.slice(0, 6) });
    }
  }
  return out;
}

function findCn(cwd, alias) {
  for (const rel of ['src/lib/utils.ts', 'src/lib/utils.js', 'src/utils.ts', 'src/utils.js', 'lib/utils.ts', 'app/lib/utils.ts']) {
    try {
      if (/export\s+(?:function|const)\s+cn\b/.test(readFileSync(join(cwd, rel), 'utf8'))) return toImportPath(rel, alias);
    } catch {}
  }
  return null;
}

function pathsOfType(modules, types) {
  return modules.filter((m) => types.includes(m.type) && m.path).map((m) => m.path);
}

function detectDevopsFiles(cwd) {
  const candidates = [
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
    '.github/workflows', '.gitlab-ci.yml', 'vercel.json', 'netlify.toml', 'fly.toml', 'Procfile',
  ];
  return candidates.filter((f) => existsSync(join(cwd, f)));
}

const globsFrom = (paths, fallback) => (paths.length ? paths.map((p) => `${p}/**`).join(',') : fallback);
const list = (arr, empty) => (arr.length ? arr.map((x) => `\`${x}\``).join(', ') : empty);

// ── design ───────────────────────────────────────────────────────────
function designSkill(ctx) {
  if (ctx.frameworkType === 'mobile') return null; // mobile UI guidance lives in the mobile skill
  const isUi =
    ctx.uiPaths.length || ctx.uiLibrary || ctx.cssApproach || ['fullstack', 'spa'].includes(ctx.frameworkType);
  if (!isUi) return null;

  const styling = ctx.cssApproach || ctx.uiLibrary || 'the project default';
  const where = list(ctx.uiPaths, '`src/components/`');

  const alias = aliasInfo(ctx.cwd);
  const comps = enumerateComponents(ctx.cwd, ctx.componentPaths, alias);
  const cnImport = findCn(ctx.cwd, alias);

  let intel = '';
  if (comps.length) {
    intel += `\n\n## Reusable components (use these — do NOT recreate)\n${comps
      .map((c) => `- \`${c.names.join('`, `')}\` — \`${c.importPath}\``)
      .join('\n')}`;
  }
  if (cnImport) intel += `\n\n## Utilities\n- \`cn()\` — className merge helper — \`${cnImport}\``;
  if (alias) {
    const ex = comps[0];
    intel += `\n\n## Imports\n- Use the \`${alias.prefix}/*\` path alias${
      ex ? ` (e.g. \`import { ${ex.names[0]} } from "${ex.importPath}"\`)` : ''
    }.`;
  }

  const body = `# Design / UI work for ${ctx.framework}

## Detected setup
- Framework: ${ctx.framework}
- UI library: ${ctx.uiLibrary || 'none — plain components'}
- Styling: ${styling}
- Components / views live in: ${where}
- Component naming: ${ctx.componentNaming || 'PascalCase'}
- State management: ${ctx.stateManagement || 'none detected'}${intel}

## Rules
1. **Reuse first.** Compose from the reusable components listed above before writing anything new. Do not recreate what exists.
2. **Styling:** use ${styling} only — no ad-hoc inline styles or a second CSS system. Merge classes with \`cn()\`${cnImport ? '' : ' if available'}.
3. **Naming:** components use ${ctx.componentNaming || 'PascalCase'}; files use ${ctx.fileNaming || 'the existing convention'}.
4. **Accessibility:** semantic HTML, label every input, ARIA where needed, keyboard focus states, sufficient color contrast.
5. **Responsive:** mobile-first; verify at small / medium / large breakpoints.
6. Keep components small and composable; lift shared UI into ${where}.

## Building a page or feature UI
- Break the design into reusable pieces and compose from the components above.
- Match the spacing, layout, and variant conventions already used in ${where}.`;

  return {
    name: 'design',
    description: `Build and modify UI for ${ctx.framework} — pages, components, layouts, and styling with ${styling}. Use when the request involves UI, components, pages, layout, design, styling, or mockups.`,
    whenToUse: 'Triggered on: UI, component, page, layout, responsive, accessibility, design, mockup, style, theme.',
    allowedTools: 'Read Grep',
    globs: globsFrom(ctx.uiPaths, 'src/components/**,src/app/**,resources/views/**'),
    body,
  };
}

// ── devops ───────────────────────────────────────────────────────────
function devopsSkill(ctx) {
  if (ctx.frameworkType === 'mobile') return null; // mobile build/release lives in the mobile skill
  const c = ctx.cmds;
  const body = `# DevOps for ${ctx.framework}

## Detected setup
- Runtime: ${ctx.runtime} (${ctx.language || 'unknown language'})
- Package manager: ${ctx.pm}
- Install: \`${c.install || installCmd(ctx)}\`
- Build: \`${c.build || '(none)'}\`
- Test: \`${c.test || '(none)'}\`
- Lint: \`${c.lint || '(none)'}\`
- Existing infra: ${list(ctx.devopsFiles, 'none detected')}

## Rules
1. Use the project's package manager (**${ctx.pm}**) consistently in every script and image — never mix package managers.
2. **Dockerfiles:** multi-stage (deps → build → runtime), a slim/alpine base matching ${ctx.runtime}, copy the lockfile and install with a frozen lockfile, run as a non-root user, EXPOSE the app port, add a healthcheck.
3. **CI:** cache the package-manager store, then run install → lint (\`${c.lint || 'n/a'}\`) → test (\`${c.test || 'n/a'}\`) → build (\`${c.build || 'n/a'}\`).
4. **Secrets** via environment variables / CI secrets — never hardcode. Ship a \`.env.example\`.
5. Reuse and extend the existing infra files above instead of duplicating them.`;

  return {
    name: 'devops',
    description: `Docker, CI/CD, and deployment for ${ctx.framework} (${ctx.pm}, ${ctx.runtime}). Use for Dockerfile, docker-compose, GitHub Actions, CI pipelines, build/deploy, or environment config.`,
    whenToUse: 'Triggered on: docker, dockerfile, compose, CI, pipeline, github actions, deploy, build image, kubernetes, env, secrets.',
    allowedTools: 'Read Grep',
    globs: 'Dockerfile,docker-compose*.yml,docker-compose*.yaml,.github/workflows/**,*.dockerfile',
    body,
    reference: devopsReference(ctx),
  };
}

function installCmd(ctx) {
  if (ctx.runtime === 'Python') return ctx.pm === 'poetry' ? 'poetry install' : 'pip install -r requirements.txt';
  if (ctx.runtime === 'PHP') return 'composer install';
  return ctx.pm === 'npm' ? 'npm ci' : `${ctx.pm} install --frozen-lockfile`;
}

function devopsReference(ctx) {
  const c = ctx.cmds;
  if (ctx.runtime === 'Python') {
    return `## Dockerfile (Python)
\`\`\`dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "-m", "app"]   # adapt: uvicorn main:app / gunicorn / manage.py runserver
\`\`\`

## GitHub Actions
\`\`\`yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12', cache: 'pip' }
      - run: ${c.install || 'pip install -r requirements.txt'}
      - run: ${c.lint || 'ruff check .'}
      - run: ${c.test || 'pytest'}
\`\`\``;
  }
  if (ctx.runtime === 'PHP') {
    return `## Dockerfile (PHP / Laravel)
\`\`\`dockerfile
FROM php:8.3-fpm-alpine AS base
WORKDIR /var/www
RUN apk add --no-cache git unzip && docker-php-ext-install pdo pdo_mysql
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --prefer-dist
COPY . .
EXPOSE 9000
CMD ["php-fpm"]
\`\`\`

## GitHub Actions
\`\`\`yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.3' }
      - run: composer install --prefer-dist --no-progress
      - run: ${c.lint || './vendor/bin/pint --test'}
      - run: ${c.test || 'php artisan test'}
\`\`\``;
  }
  // Node
  const install = ctx.pm === 'npm' ? 'npm ci' : `${ctx.pm} install --frozen-lockfile`;
  const lock =
    ctx.pm === 'pnpm' ? 'pnpm-lock.yaml' : ctx.pm === 'yarn' ? 'yarn.lock' : 'package-lock.json';
  return `## Dockerfile (Node, multi-stage)
\`\`\`dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ${lock} ./
RUN ${install}
COPY . .
RUN ${c.build || `${ctx.pm} run build`}

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["${ctx.pm}", "start"]
\`\`\`

## GitHub Actions
\`\`\`yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: '${ctx.pm}' }
      - run: ${install}
      - run: ${c.lint || `${ctx.pm} run lint`}
      - run: ${c.test || `${ctx.pm} run test`}
      - run: ${c.build || `${ctx.pm} run build`}
\`\`\``;
}

// ── db ───────────────────────────────────────────────────────────────
function dbSkill(ctx) {
  if (ctx.frameworkType === 'mobile') return null; // mobile persistence lives in the mobile skill
  if (!ctx.orm && !ctx.database && !ctx.dbPaths.length) return null;

  const orm = ctx.orm || 'raw SQL';
  const where = list(ctx.dbPaths, '`models/` or the schema directory');
  const migrate = ctx.cmds.migrate;

  const body = `# Database work for ${ctx.framework}

## Detected setup
- Database: ${ctx.database || 'unknown'}
- ORM / query builder: ${orm}
- Migrate command: ${migrate ? `\`${migrate}\`` : '(none detected)'}
- Models / schema live in: ${where}

## Rules
1. Use **${orm}** for all data access — avoid raw SQL unless ${orm} can't express it (then always parameterize).
2. Schema changes go through migrations${migrate ? ` (\`${migrate}\`)` : ''} — never hand-edit the database.
3. Models follow the existing conventions in ${where} (naming, relations, timestamps, soft-deletes).
4. ${ormRule(orm)}
5. Index foreign keys and frequently-queried columns; avoid N+1 by eager-loading relations.`;

  return {
    name: 'db',
    description: `Database models, migrations, schema, and queries for ${ctx.framework} using ${orm}. Use for migrations, models, schema changes, tables, or database queries.`,
    whenToUse: `Triggered on: migration, model, schema, database, query, table, relation, ${orm}.`,
    allowedTools: 'Read Grep',
    globs: globsFrom(ctx.dbPaths, 'prisma/**,**/models/**,**/migrations/**,**/schema*'),
    body,
  };
}

function ormRule(orm) {
  const map = {
    Prisma: 'Prisma: edit `schema.prisma`, then `prisma migrate dev`; use the generated client and its types.',
    Drizzle: 'Drizzle: update the schema, then generate + run migrations via drizzle-kit; use typed queries.',
    TypeORM: 'TypeORM: update entities, generate a migration, then run it; use the repository API.',
    Eloquent: 'Eloquent: `artisan make:model -m`; guard mass-assignment with `$fillable` / `$guarded`; define relations.',
    'Django ORM': 'Django ORM: edit `models.py`, then `makemigrations` + `migrate`; query via querysets, not raw SQL.',
    SQLAlchemy: 'SQLAlchemy: update the models, create an Alembic revision, then `alembic upgrade head`.',
    SQLModel: 'SQLModel: update the models and run your Alembic migration flow; use typed sessions.',
    'Tortoise ORM': 'Tortoise ORM: update models and run Aerich migrations.',
    Doctrine: 'Doctrine: update entities, generate a migration with the Doctrine migrations bundle, then run it.',
  };
  return map[orm] || 'Follow the project\'s existing migration workflow; keep schema and code in sync.';
}

// ── mobile (run / test on emulator / performance / build) ────────────
function mobileSkill(ctx) {
  if (ctx.frameworkType !== 'mobile') return null;
  const name = ctx.framework;
  const isRN = name === 'React Native' || name === 'Expo';
  const isFlutter = name === 'Flutter';
  const isAndroid = name === 'Android';
  const isIos = name === 'iOS';
  const c = ctx.cmds || {};

  const list = isRN ? 'FlatList / FlashList' : isFlutter ? 'ListView.builder / Sliver lists' : isAndroid ? 'LazyColumn / RecyclerView' : isIos ? 'List / LazyVStack / UITableView' : 'a virtualized list';
  const off = isRN ? 'keep heavy work off the JS thread' : isFlutter ? 'use isolates / compute() for heavy work' : isAndroid ? 'use coroutines + Dispatchers.IO (never block the main thread)' : isIos ? 'use async/await off the main actor' : 'offload heavy work off the UI thread';
  const shot = isFlutter ? 'flutter screenshot' : isIos ? 'xcrun simctl io booted screenshot shot.png' : 'adb exec-out screencap -p > shot.png';
  const runCmd = c.android || c.dev || 'the run command';

  const body = `# Mobile dev, testing & performance for ${name}

## Detected setup
- Platform: ${name} (${ctx.language})
- Run: \`${c.dev || 'n/a'}\`${c.android ? ` · Android: \`${c.android}\`` : ''}${c.ios ? ` · iOS: \`${c.ios}\`` : ''}
- Test: \`${c.test || 'n/a'}\` · Build: \`${c.build || 'n/a'}\` · Lint: \`${c.lint || 'n/a'}\`
- UI: ${ctx.uiLibrary || 'platform default'} · State: ${ctx.stateManagement || 'n/a'} · Storage: ${ctx.database || 'n/a'}

## Performance (mandatory)
- Virtualize long lists with ${list}; avoid needless re-renders/rebuilds; ${off}; cache & right-size images; keep 60fps (no jank).

## Run & test on an emulator / simulator
1. Start a device, then run the app: \`${runCmd}\`.
   - Android: \`emulator -list-avds\` → \`emulator -avd <name>\`; verify with \`adb devices\`.
   - iOS (macOS only): \`xcrun simctl list devices\` → boot one → run.
2. Unit / widget tests: \`${c.test || 'the test command'}\`.
3. UI / E2E: prefer **Maestro** — write a flow in \`.maestro/<flow>.yaml\` and run \`maestro test .maestro/<flow>.yaml\`.${isRN ? ' (Detox also works for React Native.)' : ''}
4. Verify visually: capture a screenshot — \`${shot}\` — then review the image.
5. On failure, read logs: \`adb logcat\` (Android) / simulator logs (iOS).

## Build / release
- Debug build: \`${c.build || 'the build command'}\`. Release builds need signing (Android keystore / iOS provisioning profile) — never commit signing secrets.

## Requirements
- The machine must have the SDK + an emulator/simulator installed. **iOS simulator requires macOS + Xcode.** These are not provided by the tool.`;

  return {
    name: 'mobile',
    description: `Run, test on an emulator/simulator, and optimize the ${name} app — performance, builds, and UI/E2E testing. Use for running the app, emulator/simulator, tests, builds, or performance work.`,
    whenToUse: 'Triggered on: run, emulator, simulator, device, test, e2e, maestro, detox, build, release, apk, ipa, performance, jank, fps, screenshot.',
    allowedTools: 'Read Grep Bash',
    globs: '',
    body,
  };
}

// ── cleanup helper (optional, exported for completeness) ──────────────
export function removeSkills(cwd) {
  for (const n of SKILL_NAMES) {
    try { rmSync(join(cwd, '.claude', 'skills', n), { recursive: true, force: true }); } catch {}
    try { rmSync(join(cwd, '.cursor', 'rules', `${n}.mdc`), { force: true }); } catch {}
  }
}
