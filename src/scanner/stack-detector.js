import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ──────────────────────────── Node.js / npm ────────────────────────────
const FRAMEWORK_MAP = {
  // Mobile (must precede `react` — RN projects also depend on react)
  expo: { name: 'Expo', type: 'mobile' },
  'react-native': { name: 'React Native', type: 'mobile' },
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

// ──────────────────────────── React Native / Expo ────────────────────────────
const RN_DATA_MAP = {
  '@react-native-async-storage/async-storage': 'AsyncStorage',
  'react-native-mmkv': 'MMKV',
  realm: 'Realm',
  '@nozbe/watermelondb': 'WatermelonDB',
  watermelondb: 'WatermelonDB',
  'expo-sqlite': 'SQLite (Expo)',
  '@op-engineering/op-sqlite': 'SQLite (op-sqlite)',
  'op-sqlite': 'SQLite (op-sqlite)',
  'react-native-sqlite-storage': 'SQLite',
};

const RN_UI_MAP = {
  'react-native-paper': 'React Native Paper',
  tamagui: 'Tamagui',
  nativewind: 'NativeWind',
  '@gluestack-ui/themed': 'Gluestack UI',
  '@rneui/themed': 'React Native Elements',
  'react-native-elements': 'React Native Elements',
  '@shopify/restyle': 'Restyle',
  '@ui-kitten/components': 'UI Kitten',
  'native-base': 'NativeBase',
};

const RN_IMPORTANT = [
  '@react-navigation/native', 'expo-router', 'react-native-navigation',
  '@react-navigation/native-stack', '@react-navigation/bottom-tabs',
  'react-native-reanimated', 'react-native-gesture-handler', 'react-native-safe-area-context',
  '@tanstack/react-query', 'zustand', 'jotai', 'redux', '@reduxjs/toolkit',
  'axios', 'react-native-svg', '@shopify/flash-list',
  'expo-notifications', 'react-native-vision-camera', 'expo-image', 'detox',
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
  // Flutter (Dart) — pubspec.yaml at root.
  if (existsSync(join(cwd, 'pubspec.yaml'))) return detectFlutterStack(cwd);

  const hasGradle = ['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts'].some((f) => existsSync(join(cwd, f)));
  const hasIosProject = existsSync(join(cwd, 'Package.swift')) || existsSync(join(cwd, 'Podfile')) || hasXcodeProject(cwd);

  // React Native / Expo and JS apps go through the Node path. A NATIVE Android/iOS
  // repo can carry a tooling-only package.json (husky, fastlane, commitlint) — only
  // take the Node path if it's a real JS app, otherwise fall through to native.
  if (hasPkg && (isJsApp(cwd) || (!hasGradle && !hasIosProject))) {
    return detectNodeStack(cwd, configFiles);
  }
  if (hasGradle) return detectAndroidStack(cwd);
  if (hasIosProject) return detectIosStack(cwd);
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

  if (framework?.type === 'mobile') return buildReactNativeStack(cwd, pkg, allDeps, language, framework);

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

// True only for a real JS/RN app — used so a native Android/iOS repo carrying a
// tooling-only package.json (husky, fastlane, commitlint) is not misrouted to Node.
function isJsApp(cwd) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    if (deps['react-native'] || deps.expo) return true;
    return !!detectFramework(deps);
  } catch {
    return true; // unreadable manifest → default to the Node path
  }
}

// ════════════════════════════ React Native / Expo ════════════════════════════
function buildReactNativeStack(cwd, pkg, allDeps, language, framework) {
  const isExpo = framework.name === 'Expo' || !!allDeps.expo;
  const packageManager = detectPackageManager(cwd);
  const navigation = allDeps['expo-router'] ? 'Expo Router'
    : allDeps['@react-navigation/native'] ? 'React Navigation'
    : allDeps['react-native-navigation'] ? 'React Native Navigation'
    : null;
  const stateManagement = allDeps.zustand ? 'Zustand'
    : (allDeps['@reduxjs/toolkit'] || allDeps.redux) ? 'Redux Toolkit'
    : allDeps.jotai ? 'Jotai'
    : allDeps.mobx ? 'MobX'
    : (allDeps['@tanstack/react-query'] || allDeps['react-query']) ? 'TanStack Query'
    : null;

  return {
    language,
    runtime: isExpo ? 'Expo (React Native)' : 'React Native',
    framework,
    orm: null,
    database: detectByMap(allDeps, RN_DATA_MAP),
    testFramework: detectByMap(allDeps, TEST_MAP),
    uiLibrary: detectByMap(allDeps, RN_UI_MAP),
    navigation,
    stateManagement,
    packageManager,
    buildTool: null,
    keyDeps: extractKeyDeps(allDeps, [...NODE_IMPORTANT, ...RN_IMPORTANT]),
    commands: {
      install: `${packageManager} install`,
      dev: isExpo ? 'npx expo start' : `${packageManager} start`,
      android: isExpo ? 'npx expo run:android' : `${packageManager} run android`,
      ios: isExpo ? 'npx expo run:ios' : `${packageManager} run ios`,
      test: `${packageManager} run test`,
      lint: `${packageManager} run lint`,
    },
    projectName: pkg.name || null,
    version: pkg.version || null,
  };
}

// ════════════════════════════ Flutter (Dart) ════════════════════════════
const FLUTTER_STATE = { flutter_riverpod: 'Riverpod', hooks_riverpod: 'Riverpod', riverpod: 'Riverpod', flutter_bloc: 'BLoC', bloc: 'BLoC', provider: 'Provider', get: 'GetX', flutter_mobx: 'MobX', mobx: 'MobX', stacked: 'Stacked', redux: 'Redux' };
const FLUTTER_DATA = { drift: 'Drift', isar: 'Isar', objectbox: 'ObjectBox', hive: 'Hive', floor: 'Floor', sqflite: 'sqflite', sembast: 'Sembast', shared_preferences: 'SharedPreferences' };
const FLUTTER_IMPORTANT = ['dio', 'http', 'retrofit', 'chopper', 'graphql_flutter', 'go_router', 'auto_route', 'beamer', 'get_it', 'injectable', 'freezed', 'json_serializable', 'build_runner', 'flutter_hooks', 'flutter_screenutil', 'intl', 'cached_network_image', 'firebase_core', 'flutter_local_notifications', 'permission_handler', 'mockito', 'bloc_test', 'patrol'];

function detectFlutterStack(cwd) {
  const deps = readPubspecDeps(cwd);
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);
  const isFlutter = has('flutter') || existsSync(join(cwd, 'lib', 'main.dart'));
  const routing = has('go_router') ? 'go_router' : has('auto_route') ? 'auto_route' : has('beamer') ? 'beamer' : null;

  return {
    language: 'Dart',
    runtime: isFlutter ? 'Flutter' : 'Dart',
    framework: { name: isFlutter ? 'Flutter' : 'Dart', type: isFlutter ? 'mobile' : 'library', version: readPubspecVersion(cwd) },
    orm: null,
    database: pickFrom(deps, FLUTTER_DATA),
    testFramework: 'flutter_test',
    uiLibrary: 'Material / Cupertino',
    navigation: routing,
    stateManagement: pickFrom(deps, FLUTTER_STATE),
    packageManager: 'pub',
    buildTool: null,
    keyDeps: pickKeys(deps, FLUTTER_IMPORTANT),
    commands: {
      install: 'flutter pub get',
      dev: 'flutter run',
      android: 'flutter run -d android',
      ios: 'flutter run -d ios',
      build: 'flutter build apk',
      test: 'flutter test',
      lint: 'dart analyze',
    },
    projectName: readPubspecField(cwd, 'name'),
    version: readPubspecVersion(cwd),
  };
}

// ════════════════════════════ Native Android (Kotlin/Java) ════════════════════════════
const ANDROID_IMPORTANT = ['retrofit', 'okhttp', 'ktor', 'hilt', 'dagger', 'koin', 'room', 'sqldelight', 'datastore', 'coroutines', 'glide', 'coil', 'workmanager', 'firebase', 'moshi', 'gson', 'navigation', 'compose'];

function detectAndroidStack(cwd) {
  const g = readGradleText(cwd).toLowerCase();
  const has = (s) => g.includes(s);
  const kotlin = has('org.jetbrains.kotlin') || has('kotlin-android') || has('kotlin(') || existsSync(join(cwd, 'app/src/main/kotlin'));
  const language = kotlin ? 'Kotlin' : 'Java';
  const compose = has('androidx.compose') || has('"compose"') || has('compose-bom');
  const database = (has('androidx.room') || has('room-runtime') || has('"room"')) ? 'Room'
    : has('sqldelight') ? 'SQLDelight'
    : has('realm') ? 'Realm'
    : has('datastore') ? 'DataStore (Preferences)'
    : null;

  return {
    language,
    runtime: `Android (${language})`,
    framework: { name: 'Android', type: 'mobile', version: null },
    orm: null,
    database,
    testFramework: 'JUnit',
    uiLibrary: compose ? 'Jetpack Compose' : 'Android Views (XML)',
    navigation: has('androidx.navigation') ? 'Jetpack Navigation' : null,
    stateManagement: (has('viewmodel') || has('lifecycle')) ? 'ViewModel + StateFlow/LiveData (MVVM)' : null,
    packageManager: 'gradle',
    buildTool: 'Gradle',
    keyDeps: collectBySubstring(g, ANDROID_IMPORTANT),
    commands: {
      install: './gradlew dependencies',
      dev: './gradlew installDebug',
      android: './gradlew installDebug',
      build: './gradlew assembleDebug',
      test: './gradlew test',
      lint: has('detekt') ? './gradlew detekt' : has('ktlint') ? './gradlew ktlintCheck' : './gradlew lint',
    },
    projectName: null,
    version: null,
  };
}

// ════════════════════════════ Native iOS (Swift) ════════════════════════════
const SWIFT_IMPORTANT = ['Alamofire', 'Moya', 'RxSwift', 'Realm', 'GRDB', 'SnapKit', 'Kingfisher', 'SDWebImage', 'Swinject', 'Factory', 'ComposableArchitecture', 'Firebase', 'Quick', 'Nimble'];

function detectIosStack(cwd) {
  const t = readSwiftText(cwd);
  const lower = t.toLowerCase();
  const has = (s) => lower.includes(s.toLowerCase());
  const pm = existsSync(join(cwd, 'Package.swift')) ? 'spm'
    : existsSync(join(cwd, 'Podfile')) ? 'cocoapods'
    : 'xcode';
  const ui = has('snapkit') ? 'UIKit' : detectIosUi(cwd);
  const database = has('realm') ? 'Realm' : has('grdb') ? 'GRDB' : has('sqlite.swift') ? 'SQLite.swift' : null;

  return {
    language: 'Swift',
    runtime: 'iOS (Swift)',
    framework: { name: 'iOS', type: 'mobile', version: null },
    orm: null,
    database,
    testFramework: has('quick') ? 'Quick/Nimble' : 'XCTest',
    uiLibrary: ui,
    navigation: null,
    stateManagement: has('composablearchitecture') ? 'TCA (Composable Architecture)' : null,
    packageManager: pm,
    buildTool: 'Xcode',
    keyDeps: collectBySubstring(t, SWIFT_IMPORTANT),
    commands: {
      install: pm === 'cocoapods' ? 'pod install' : pm === 'spm' ? 'swift package resolve' : 'xcodebuild -resolvePackageDependencies',
      dev: 'open the .xcworkspace / .xcodeproj in Xcode and Run (or build + boot a simulator with xcodebuild + xcrun simctl)',
      build: 'xcodebuild build -scheme App',
      test: 'xcodebuild test -scheme App -destination "platform=iOS Simulator,name=iPhone 15"',
      lint: has('swiftlint') ? 'swiftlint' : 'swiftformat --lint .',
    },
    projectName: null,
    version: null,
  };
}

// ──────────────────────────── mobile parsing helpers ────────────────────────────
function pickFrom(deps, map) {
  for (const [name, label] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(deps, name)) return label;
  }
  return null;
}
function pickKeys(deps, list) {
  const r = {};
  for (const k of list) if (Object.prototype.hasOwnProperty.call(deps, k)) r[k] = '*';
  return r;
}
function collectBySubstring(text, list) {
  const lower = text.toLowerCase();
  const r = {};
  for (const k of list) if (lower.includes(k.toLowerCase())) r[k] = '*';
  return r;
}

function readPubspecDeps(cwd) {
  const deps = {};
  try {
    const lines = readFileSync(join(cwd, 'pubspec.yaml'), 'utf8').split('\n');
    let inDeps = false;
    let baseIndent = null; // indent of the first dependency line — only siblings count
    for (const line of lines) {
      if (/^(dependencies|dev_dependencies):\s*$/.test(line)) { inDeps = true; baseIndent = null; continue; }
      if (/^\S/.test(line)) { inDeps = false; baseIndent = null; continue; } // top-level key closes the block
      if (!inDeps || !line.trim() || /^\s*#/.test(line)) continue;
      const m = line.match(/^(\s+)([A-Za-z0-9_]+):/);
      if (!m) continue;
      const indent = m[1].length;
      if (baseIndent === null) baseIndent = indent;
      if (indent === baseIndent) deps[m[2].toLowerCase()] = '*'; // skip nested keys (e.g. `sdk:`)
    }
  } catch {}
  return deps;
}
function readPubspecField(cwd, field) {
  try {
    const m = readFileSync(join(cwd, 'pubspec.yaml'), 'utf8').match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
function readPubspecVersion(cwd) {
  const v = readPubspecField(cwd, 'version');
  return v ? cleanVersion(v) : null;
}
function readGradleText(cwd) {
  let text = '';
  for (const f of ['build.gradle', 'build.gradle.kts', 'app/build.gradle', 'app/build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradle/libs.versions.toml']) {
    try { text += readFileSync(join(cwd, f), 'utf8') + '\n'; } catch {}
  }
  return text;
}
function readSwiftText(cwd) {
  let text = '';
  for (const f of ['Package.swift', 'Podfile', 'Cartfile']) {
    try { text += readFileSync(join(cwd, f), 'utf8') + '\n'; } catch {}
  }
  return text;
}
function hasXcodeProject(cwd) {
  try { return readdirSync(cwd).some((f) => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace')); }
  catch { return false; }
}

// Best-effort UIKit vs SwiftUI: storyboards/xibs ⇒ UIKit; `import SwiftUI` ⇒ SwiftUI.
function detectIosUi(cwd) {
  const files = [];
  walkLimited(cwd, '', files, 120);
  if (files.some((f) => /\.(storyboard|xib)$/.test(f))) return 'UIKit';
  let sawSwiftUI = false, sawUIKit = false;
  for (const f of files.filter((f) => f.endsWith('.swift')).slice(0, 40)) {
    try {
      const c = readFileSync(join(cwd, f), 'utf8');
      if (/import\s+SwiftUI/.test(c)) sawSwiftUI = true;
      if (/import\s+UIKit|UIViewController/.test(c)) sawUIKit = true;
    } catch {}
  }
  if (sawSwiftUI && sawUIKit) return 'SwiftUI + UIKit';
  if (sawSwiftUI) return 'SwiftUI';
  if (sawUIKit) return 'UIKit';
  return 'SwiftUI / UIKit (undetermined)';
}

function walkLimited(dir, base, acc, cap) {
  if (acc.length >= cap) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (acc.length >= cap) return;
    if (['Pods', 'DerivedData', '.build', '.git', 'Carthage', 'build', 'node_modules'].includes(e.name)
      || e.name.endsWith('.xcodeproj') || e.name.endsWith('.xcworkspace')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) walkLimited(join(dir, e.name), rel, acc, cap);
    else if (/\.(swift|storyboard|xib)$/.test(e.name)) acc.push(rel);
  }
}

// ──────────────────────────── shared helpers ────────────────────────────
function cleanVersion(spec) {
  if (!spec) return null;
  // Extract the first semver-like token so build metadata (1.0.0+1) and ranges
  // (>=3.0.0 <4.0.0) don't get concatenated into garbage.
  const m = String(spec).match(/\d+(?:\.\d+){0,2}/);
  return m ? m[0] : null;
}

function extractKeyDeps(allDeps, important, frameworkName) {
  const result = {};
  for (const dep of important) {
    if (allDeps[dep]) result[dep] = allDeps[dep] || '*';
  }
  return result;
}
