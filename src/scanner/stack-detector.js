import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ──────────────────────────── Node.js / npm ────────────────────────────
const FRAMEWORK_MAP = {
  next: { name: 'Next.js', type: 'fullstack' },
  '@nestjs/core': { name: 'NestJS', type: 'api' },
  express: { name: 'Express', type: 'api' },
  fastify: { name: 'Fastify', type: 'api' },
  '@hono/node-server': { name: 'Hono', type: 'api' },
  hono: { name: 'Hono', type: 'api' },
  react: { name: 'React', type: 'spa' },
  vue: { name: 'Vue', type: 'spa' },
  '@angular/core': { name: 'Angular', type: 'spa' },
  svelte: { name: 'Svelte', type: 'spa' },
  remix: { name: 'Remix', type: 'fullstack' },
  '@remix-run/node': { name: 'Remix', type: 'fullstack' },
  astro: { name: 'Astro', type: 'fullstack' },
};

const ORM_MAP = {
  prisma: 'Prisma',
  '@prisma/client': 'Prisma',
  typeorm: 'TypeORM',
  drizzle: 'Drizzle',
  'drizzle-orm': 'Drizzle',
  sequelize: 'Sequelize',
  mongoose: 'Mongoose',
  knex: 'Knex',
  '@mikro-orm/core': 'MikroORM',
};

const DB_MAP = {
  pg: 'PostgreSQL', '@neondatabase/serverless': 'PostgreSQL (Neon)',
  mysql2: 'MySQL', mysql: 'MySQL',
  'better-sqlite3': 'SQLite', 'sqlite3': 'SQLite',
  mongodb: 'MongoDB', mongoose: 'MongoDB',
  redis: 'Redis', ioredis: 'Redis',
};

const TEST_MAP = {
  vitest: 'Vitest', jest: 'Jest', mocha: 'Mocha',
  '@playwright/test': 'Playwright', cypress: 'Cypress',
};

const UI_MAP = {
  '@shadcn/ui': 'shadcn/ui', '@radix-ui/react-primitive': 'shadcn/ui',
  '@mui/material': 'Material UI', 'antd': 'Ant Design',
  '@chakra-ui/react': 'Chakra UI', 'tailwindcss': 'Tailwind CSS',
};

const NODE_IMPORTANT = [
  'zod', 'react-query', '@tanstack/react-query', 'zustand', 'jotai', 'recoil',
  'axios', 'swr', 'react-hook-form', 'formik',
  'jsonwebtoken', 'bcrypt', 'passport',
  'socket.io', 'ws',
  'bull', 'bullmq',
  'stripe', '@stripe/stripe-js',
  'next-auth', '@auth/core',
  'react-router-dom', 'react-router',
  'date-fns', 'dayjs', 'luxon',
  'lodash', 'ramda',
];

// ──────────────────────────── PHP / Composer ────────────────────────────
const PHP_FRAMEWORK_MAP = {
  'laravel/framework': { name: 'Laravel', type: 'fullstack' },
  'laravel/lumen-framework': { name: 'Lumen', type: 'api' },
  'symfony/framework-bundle': { name: 'Symfony', type: 'fullstack' },
  'symfony/symfony': { name: 'Symfony', type: 'fullstack' },
  'cakephp/cakephp': { name: 'CakePHP', type: 'fullstack' },
  'codeigniter4/framework': { name: 'CodeIgniter', type: 'fullstack' },
  'slim/slim': { name: 'Slim', type: 'api' },
};

const PHP_TEST_MAP = {
  'pestphp/pest': 'Pest',
  'phpunit/phpunit': 'PHPUnit',
  'phpspec/phpspec': 'phpspec',
};

const PHP_IMPORTANT = [
  'laravel/sanctum', 'laravel/passport', 'laravel/fortify', 'laravel/jetstream',
  'laravel/breeze', 'laravel/horizon', 'laravel/telescope', 'laravel/scout',
  'livewire/livewire', 'inertiajs/inertia-laravel',
  'spatie/laravel-permission', 'spatie/laravel-medialibrary', 'spatie/laravel-data',
  'guzzlehttp/guzzle', 'predis/predis', 'doctrine/orm',
  'barryvdh/laravel-debugbar', 'laravel/sail',
];

// ──────────────────────────── Python ────────────────────────────
const PY_ORM_MAP = {
  sqlalchemy: 'SQLAlchemy',
  'tortoise-orm': 'Tortoise ORM',
  peewee: 'Peewee',
  pony: 'Pony ORM',
  'sqlmodel': 'SQLModel',
};

const PY_DB_MAP = {
  psycopg2: 'PostgreSQL', 'psycopg2-binary': 'PostgreSQL', psycopg: 'PostgreSQL', asyncpg: 'PostgreSQL',
  mysqlclient: 'MySQL', pymysql: 'MySQL', 'mysql-connector-python': 'MySQL', aiomysql: 'MySQL',
  pymongo: 'MongoDB', motor: 'MongoDB',
  redis: 'Redis', 'aioredis': 'Redis',
};

const PY_IMPORTANT = [
  'djangorestframework', 'django-ninja', 'celery', 'pydantic', 'pydantic-settings',
  'requests', 'httpx', 'aiohttp',
  'sqlalchemy', 'alembic', 'sqlmodel',
  'gunicorn', 'uvicorn', 'hypercorn',
  'redis', 'pandas', 'numpy', 'boto3',
  'python-dotenv', 'channels', 'strawberry-graphql', 'graphene',
  'pytest', 'black', 'ruff', 'mypy', 'flake8',
];

/**
 * Detects the project's tech stack. Supports Node.js (package.json),
 * PHP/Laravel (composer.json / artisan) and Python (requirements.txt,
 * pyproject.toml, Pipfile, manage.py). Returns a normalized shape so
 * downstream generators stay language-agnostic.
 */
export function detectStack(cwd, configFiles = []) {
  const hasComposer = existsSync(join(cwd, 'composer.json'));
  const hasArtisan = existsSync(join(cwd, 'artisan'));
  const hasManagePy = existsSync(join(cwd, 'manage.py'));
  const hasPyProject = existsSync(join(cwd, 'pyproject.toml'));
  const hasPkg = existsSync(join(cwd, 'package.json'));
  const hasPyOther = ['requirements.txt', 'Pipfile', 'setup.py', 'setup.cfg']
    .some((f) => existsSync(join(cwd, f)));

  // PHP/Laravel wins over package.json — Laravel ships a package.json for Vite assets.
  if (hasComposer || hasArtisan) return detectPhpStack(cwd);
  // Strong Python signals win over package.json (Django projects may bundle JS assets).
  if (hasManagePy || hasPyProject) return detectPythonStack(cwd);
  if (hasPkg) return detectNodeStack(cwd, configFiles);
  if (hasPyOther) return detectPythonStack(cwd);

  return { language: 'Unknown', framework: null };
}

// ════════════════════════════ Node.js ════════════════════════════
function detectNodeStack(cwd, configFiles) {
  const pkgPath = join(cwd, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return { language: 'Unknown', framework: null };
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };

  const hasTsConfig = configFiles.some((f) => f.includes('tsconfig'));
  const language = hasTsConfig || allDeps.typescript ? 'TypeScript' : 'JavaScript';

  const framework = detectFramework(allDeps);
  const orm = detectByMap(allDeps, ORM_MAP);
  const database = detectByMap(allDeps, DB_MAP);
  const testFramework = detectByMap(allDeps, TEST_MAP);
  const uiLibrary = detectByMap(allDeps, UI_MAP);
  const packageManager = detectPackageManager(cwd);
  const buildTool = detectBuildTool(allDeps, configFiles);

  const keyDeps = extractKeyDeps(allDeps, NODE_IMPORTANT, framework?.name);

  return {
    language,
    runtime: 'Node.js',
    framework,
    orm,
    database,
    testFramework,
    uiLibrary,
    packageManager,
    buildTool,
    keyDeps,
    commands: {
      install: `${packageManager} install`,
      dev: `${packageManager} run dev`,
      build: `${packageManager} run build`,
      test: `${packageManager} run test`,
      lint: `${packageManager} run lint`,
    },
    projectName: pkg.name || null,
    version: pkg.version || null,
  };
}

function detectFramework(deps) {
  for (const [pkg, meta] of Object.entries(FRAMEWORK_MAP)) {
    if (deps[pkg]) {
      const version = deps[pkg].replace(/[^0-9.]/g, '');
      return { ...meta, version, package: pkg };
    }
  }
  return null;
}

function detectByMap(deps, map) {
  for (const [pkg, name] of Object.entries(map)) {
    if (deps[pkg]) return name;
  }
  return null;
}

function detectPackageManager(cwd) {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function detectBuildTool(deps, configFiles) {
  if (configFiles.some((f) => f.includes('vite.config'))) return 'Vite';
  if (deps.turbopack || configFiles.some((f) => f.includes('turbo.json'))) return 'Turbopack';
  if (deps.webpack || configFiles.some((f) => f.includes('webpack'))) return 'Webpack';
  if (deps.esbuild) return 'esbuild';
  return null;
}

// ════════════════════════════ PHP / Laravel ════════════════════════════
function detectPhpStack(cwd) {
  let composer = {};
  try {
    composer = JSON.parse(readFileSync(join(cwd, 'composer.json'), 'utf8'));
  } catch {}

  const deps = { ...(composer.require || {}), ...(composer['require-dev'] || {}) };
  const hasArtisan = existsSync(join(cwd, 'artisan'));

  let framework = null;
  for (const [pkg, meta] of Object.entries(PHP_FRAMEWORK_MAP)) {
    if (deps[pkg]) {
      framework = { ...meta, version: cleanVersion(deps[pkg]), package: pkg };
      break;
    }
  }
  if (!framework && hasArtisan) framework = { name: 'Laravel', type: 'fullstack', version: null };

  const isLaravel = framework?.name === 'Laravel';
  const testFramework = detectByMap(deps, PHP_TEST_MAP);
  const database = detectPhpDatabase(cwd);
  const orm = isLaravel ? 'Eloquent'
    : deps['doctrine/orm'] ? 'Doctrine'
    : null;

  const phpVersion = cleanVersion(deps.php || composer.require?.php || '');
  const hasPint = !!deps['laravel/pint'] || existsSync(join(cwd, 'vendor/bin/pint'));
  const buildTool = existsSync(join(cwd, 'vite.config.js')) || existsSync(join(cwd, 'vite.config.ts'))
    ? 'Vite'
    : existsSync(join(cwd, 'webpack.mix.js')) ? 'Laravel Mix' : null;

  const commands = isLaravel
    ? {
        install: 'composer install',
        dev: 'php artisan serve',
        build: buildTool ? 'npm run build' : null,
        migrate: 'php artisan migrate',
        test: testFramework === 'Pest' ? './vendor/bin/pest' : 'php artisan test',
        lint: hasPint ? './vendor/bin/pint' : 'php -l',
      }
    : {
        install: 'composer install',
        dev: 'php -S localhost:8000',
        test: testFramework === 'Pest' ? './vendor/bin/pest' : './vendor/bin/phpunit',
        lint: 'php -l',
      };

  return {
    language: 'PHP',
    runtime: phpVersion ? `PHP ${phpVersion}` : 'PHP',
    framework,
    orm,
    database,
    testFramework: testFramework || (isLaravel ? 'PHPUnit' : null),
    uiLibrary: detectLaravelUi(deps),
    packageManager: 'composer',
    buildTool,
    keyDeps: extractKeyDeps(deps, PHP_IMPORTANT),
    commands,
    projectName: composer.name || null,
    version: composer.version || null,
  };
}

function detectLaravelUi(deps) {
  if (deps['livewire/livewire']) return 'Livewire';
  if (deps['inertiajs/inertia-laravel']) return 'Inertia.js';
  return null;
}

function detectPhpDatabase(cwd) {
  for (const envFile of ['.env', '.env.example']) {
    const p = join(cwd, envFile);
    if (!existsSync(p)) continue;
    try {
      const content = readFileSync(p, 'utf8');
      const match = content.match(/^\s*DB_CONNECTION\s*=\s*([^\s#]+)/m);
      if (match) {
        const conn = match[1].trim().toLowerCase();
        return { pgsql: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MySQL', sqlite: 'SQLite', sqlsrv: 'SQL Server' }[conn] || conn;
      }
    } catch {}
  }
  return null;
}

// ════════════════════════════ Python ════════════════════════════
function detectPythonStack(cwd) {
  const deps = readPythonDeps(cwd);
  const depNames = new Set(Object.keys(deps).map((d) => d.toLowerCase()));
  const hasManage = existsSync(join(cwd, 'manage.py'));

  let framework = null;
  if (depNames.has('django') || hasManage) {
    framework = { name: 'Django', type: 'fullstack', package: 'django', version: cleanVersion(deps.django || '') };
    if (depNames.has('djangorestframework')) framework.name = 'Django REST Framework';
  } else if (depNames.has('fastapi')) {
    framework = { name: 'FastAPI', type: 'api', package: 'fastapi', version: cleanVersion(deps.fastapi || '') };
  } else if (depNames.has('flask')) {
    framework = { name: 'Flask', type: 'api', package: 'flask', version: cleanVersion(deps.flask || '') };
  } else if (depNames.has('starlette')) {
    framework = { name: 'Starlette', type: 'api', package: 'starlette', version: cleanVersion(deps.starlette || '') };
  }

  const isDjango = framework?.name?.startsWith('Django');
  const orm = isDjango ? 'Django ORM'
    : depNames.has('sqlmodel') ? 'SQLModel'
    : detectByDepSet(depNames, PY_ORM_MAP)
    || (depNames.has('alembic') ? 'SQLAlchemy + Alembic' : null);
  const database = detectByDepSet(depNames, PY_DB_MAP) || (isDjango ? detectDjangoDatabase(cwd) : null);
  const testFramework = depNames.has('pytest') ? 'pytest' : 'unittest';
  const packageManager = detectPyPackageManager(cwd);
  const pyVersion = readPythonVersion(cwd);

  const commands = buildPythonCommands(cwd, framework, packageManager, testFramework, depNames);

  return {
    language: 'Python',
    runtime: pyVersion ? `Python ${pyVersion}` : 'Python',
    framework: framework || null,
    orm,
    database,
    testFramework,
    uiLibrary: null,
    packageManager,
    buildTool: null,
    keyDeps: extractKeyDeps(deps, PY_IMPORTANT),
    commands,
    projectName: readPyProjectName(cwd),
    version: null,
  };
}

function detectByDepSet(depNames, map) {
  for (const [name, label] of Object.entries(map)) {
    if (depNames.has(name)) return label;
  }
  return null;
}

/**
 * Reads Python dependencies (name → version spec) from requirements.txt,
 * pyproject.toml ([project] or [tool.poetry.dependencies]) and Pipfile.
 * Lightweight regex parsing — only names/versions matter for detection.
 */
function readPythonDeps(cwd) {
  const deps = {};
  // PyPI names are case-insensitive — normalize keys to lowercase so version
  // and keyDep lookups work regardless of how a package is spelled in the manifest.
  const add = (name, version) => { if (name) deps[name.toLowerCase()] = (version || '').trim(); };

  const reqPath = join(cwd, 'requirements.txt');
  if (existsSync(reqPath)) {
    try {
      for (const raw of readFileSync(reqPath, 'utf8').split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('-')) continue;
        const m = line.match(/^([A-Za-z0-9_.-]+)\s*(?:\[[^\]]*\])?\s*([<>=!~]=?.*)?/);
        if (m) add(m[1], m[2]);
      }
    } catch {}
  }

  const pyProjectPath = join(cwd, 'pyproject.toml');
  if (existsSync(pyProjectPath)) {
    try {
      const content = readFileSync(pyProjectPath, 'utf8');

      // PEP 621: dependencies = ["fastapi>=0.100", "uvicorn[standard]>=0.27"]
      // Bracket-matched extraction — naive regex breaks on `[extras]` inside items.
      const arrBody = extractTomlArray(content, 'dependencies');
      if (arrBody) {
        for (const item of arrBody.split(',')) {
          const s = item.trim().replace(/^["']|["']$/g, '');
          if (!s) continue;
          const m = s.match(/^([A-Za-z0-9_.-]+)\s*(?:\[[^\]]*\])?\s*(.*)$/);
          if (m) add(m[1], m[2]);
        }
      }

      // Poetry: [tool.poetry.dependencies] with `django = "^4.2"`
      const poetryBlock = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/);
      if (poetryBlock) {
        for (const raw of poetryBlock[1].split('\n')) {
          const m = raw.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["']?([^"'\n{]*)/);
          if (m && m[1].toLowerCase() !== 'python') add(m[1], m[2]);
        }
      }
    } catch {}
  }

  const pipfilePath = join(cwd, 'Pipfile');
  if (existsSync(pipfilePath)) {
    try {
      const content = readFileSync(pipfilePath, 'utf8');
      const block = content.match(/\[packages\]([\s\S]*?)(?:\n\[|$)/);
      if (block) {
        for (const raw of block[1].split('\n')) {
          const m = raw.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["']?([^"'\n{]*)/);
          if (m) add(m[1], m[2]);
        }
      }
    } catch {}
  }

  return deps;
}

/**
 * Extracts the body of a TOML array `<key> = [ ... ]`, correctly handling
 * nested brackets (e.g. PEP 508 extras like `uvicorn[standard]`).
 */
function extractTomlArray(content, key) {
  const re = new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*\\[`);
  const m = re.exec(content);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  for (; i < content.length && depth > 0; i++) {
    const ch = content[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
  }
  return content.slice(start, i - 1);
}

function detectPyPackageManager(cwd) {
  if (existsSync(join(cwd, 'poetry.lock'))) return 'poetry';
  if (existsSync(join(cwd, 'uv.lock'))) return 'uv';
  if (existsSync(join(cwd, 'Pipfile')) || existsSync(join(cwd, 'Pipfile.lock'))) return 'pipenv';
  if (existsSync(join(cwd, 'pdm.lock'))) return 'pdm';
  if (existsSync(join(cwd, 'pyproject.toml'))) {
    try {
      const content = readFileSync(join(cwd, 'pyproject.toml'), 'utf8');
      if (content.includes('[tool.poetry]')) return 'poetry';
      if (content.includes('[tool.pdm]')) return 'pdm';
    } catch {}
  }
  return 'pip';
}

function readPythonVersion(cwd) {
  // .python-version (pyenv)
  const pv = join(cwd, '.python-version');
  if (existsSync(pv)) {
    try {
      const v = readFileSync(pv, 'utf8').trim().split('\n')[0];
      if (v) return v;
    } catch {}
  }
  // pyproject requires-python / python = "^3.11"
  const pyProjectPath = join(cwd, 'pyproject.toml');
  if (existsSync(pyProjectPath)) {
    try {
      const content = readFileSync(pyProjectPath, 'utf8');
      const m = content.match(/requires-python\s*=\s*["']([^"']+)["']/)
        || content.match(/\bpython\s*=\s*["']([^"']+)["']/);
      if (m) return cleanVersion(m[1]) || m[1].trim();
    } catch {}
  }
  // runtime.txt (Heroku style): python-3.11.4
  const rt = join(cwd, 'runtime.txt');
  if (existsSync(rt)) {
    try {
      const m = readFileSync(rt, 'utf8').match(/(\d+\.\d+(?:\.\d+)?)/);
      if (m) return m[1];
    } catch {}
  }
  return null;
}

function readPyProjectName(cwd) {
  const pyProjectPath = join(cwd, 'pyproject.toml');
  if (existsSync(pyProjectPath)) {
    try {
      const m = readFileSync(pyProjectPath, 'utf8').match(/(?:^|\n)\s*name\s*=\s*["']([^"']+)["']/);
      if (m) return m[1];
    } catch {}
  }
  return null;
}

function detectDjangoDatabase(cwd) {
  // Best-effort: read DATABASE_URL or ENGINE hints from .env
  for (const envFile of ['.env', '.env.example']) {
    const p = join(cwd, envFile);
    if (!existsSync(p)) continue;
    try {
      const content = readFileSync(p, 'utf8');
      if (/postgres/i.test(content)) return 'PostgreSQL';
      if (/mysql/i.test(content)) return 'MySQL';
      if (/sqlite/i.test(content)) return 'SQLite';
    } catch {}
  }
  return null;
}

function buildPythonCommands(cwd, framework, packageManager, testFramework, depNames) {
  const run = packageManager === 'poetry' ? 'poetry run '
    : packageManager === 'pipenv' ? 'pipenv run '
    : packageManager === 'pdm' ? 'pdm run '
    : '';

  const install = packageManager === 'poetry' ? 'poetry install'
    : packageManager === 'pipenv' ? 'pipenv install'
    : packageManager === 'pdm' ? 'pdm install'
    : packageManager === 'uv' ? 'uv pip install -r requirements.txt'
    : 'pip install -r requirements.txt';

  const test = testFramework === 'pytest' ? `${run}pytest`
    : framework?.name?.startsWith('Django') ? `${run}python manage.py test`
    : `${run}python -m unittest`;

  const lint = depNames.has('ruff') ? `${run}ruff check .`
    : depNames.has('flake8') ? `${run}flake8 .`
    : depNames.has('black') ? `${run}black --check .`
    : null;

  if (framework?.name?.startsWith('Django')) {
    return {
      install,
      dev: `${run}python manage.py runserver`,
      migrate: `${run}python manage.py migrate`,
      test,
      lint,
    };
  }
  if (framework?.name === 'FastAPI' || framework?.name === 'Starlette') {
    const appModule = guessFastApiModule(cwd);
    return {
      install,
      dev: `${run}uvicorn ${appModule} --reload`,
      test,
      lint,
    };
  }
  if (framework?.name === 'Flask') {
    return {
      install,
      dev: `${run}flask run --debug`,
      test,
      lint,
    };
  }
  return {
    install,
    dev: `${run}python main.py`,
    test,
    lint,
  };
}

function guessFastApiModule(cwd) {
  for (const cand of ['main:app', 'app.main:app', 'app:app', 'src.main:app']) {
    const file = cand.split(':')[0].replace(/\./g, '/') + '.py';
    if (existsSync(join(cwd, file))) return cand;
  }
  return 'main:app';
}

// ──────────────────────────── shared helpers ────────────────────────────
function cleanVersion(spec) {
  if (!spec) return null;
  const v = String(spec).replace(/[^0-9.]/g, '').replace(/^\.+|\.+$/g, '');
  return v || null;
}

function extractKeyDeps(allDeps, important, frameworkName) {
  const result = {};
  for (const dep of important) {
    if (allDeps[dep]) result[dep] = allDeps[dep] || '*';
  }
  return result;
}
