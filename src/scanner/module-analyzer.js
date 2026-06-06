import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';

const SOURCE_DIRS = ['src', 'app', 'lib', 'packages', 'modules', 'api', 'server', 'client'];
const IGNORE_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.turbo',
  'vendor', 'storage', '.venv', 'venv', 'env', '.pytest_cache', '.mypy_cache', '.ruff_cache',
];
const TEST_PATTERNS = ['.test.', '.spec.', '__tests__', 'tests/', 'test/', '_test.py', 'test_'];
const CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml', '.toml', '.env'];

export function analyzeModules(files, tree, framework) {
  const sourceFiles = files.filter((f) => !isIgnored(f) && !isConfig(f));
  const strategy = pickStrategy(tree, framework);

  let modules;
  if (strategy === 'nestjs') modules = analyzNestJS(sourceFiles);
  else if (strategy === 'nextjs') modules = analyzeNextJS(sourceFiles, tree);
  else if (strategy === 'laravel') modules = analyzeLaravel(sourceFiles);
  else if (strategy === 'django') modules = analyzeDjango(sourceFiles, tree);
  else if (strategy === 'python') modules = analyzePython(sourceFiles, tree);
  else modules = analyzeByDirectory(sourceFiles, tree);

  return modules
    .filter((m) => m.files.length > 0)
    .map((m) => ({
      ...m,
      testFiles: sourceFiles.filter((f) => TEST_PATTERNS.some((p) => f.includes(p)) && f.includes(m.path || m.name)),
    }));
}

function pickStrategy(tree, framework) {
  const frameworkName = framework?.name;
  if (frameworkName === 'NestJS') return 'nestjs';
  if (frameworkName === 'Next.js') return 'nextjs';
  if (frameworkName === 'Laravel' || frameworkName === 'Lumen') return 'laravel';
  if (frameworkName?.startsWith('Django')) return 'django';
  if (['FastAPI', 'Flask', 'Starlette'].includes(frameworkName)) return 'python';
  return 'directory';
}

function analyzeByDirectory(files, tree) {
  const topDirs = getSourceDirs(tree);
  if (topDirs.length === 0) return [{ name: 'root', path: '', files, type: 'feature', deps: [] }];

  return topDirs.map((dir) => {
    const dirFiles = files.filter((f) => f.startsWith(dir + '/') || f === dir);
    const type = inferModuleType(dir, dirFiles);
    return {
      name: dir.replace('src/', '').replace('app/', ''),
      path: dir,
      files: dirFiles.filter((f) => !TEST_PATTERNS.some((p) => f.includes(p))),
      type,
      deps: [],
    };
  });
}

function analyzNestJS(files) {
  const moduleMap = {};

  for (const file of files) {
    const parts = file.split('/');
    const srcIdx = parts.indexOf('src');
    if (srcIdx === -1) continue;

    const moduleDir = parts[srcIdx + 1];
    if (!moduleDir || moduleDir.includes('.')) continue;

    const key = moduleDir;
    if (!moduleMap[key]) {
      moduleMap[key] = { name: key, path: `src/${key}`, files: [], type: 'feature', deps: [] };
    }
    moduleMap[key].files.push(file);
  }

  return Object.values(moduleMap);
}

function analyzeNextJS(files, tree) {
  const modules = [];
  const hasAppDir = files.some((f) => f.startsWith('app/') || f.startsWith('src/app/'));
  const hasPagesDir = files.some((f) => f.startsWith('pages/') || f.startsWith('src/pages/'));

  if (hasAppDir) {
    const prefix = files.some((f) => f.startsWith('src/app/')) ? 'src/app' : 'app';
    const routeFiles = files.filter((f) => f.startsWith(prefix + '/') && (f.endsWith('page.tsx') || f.endsWith('page.ts') || f.endsWith('route.ts') || f.endsWith('route.tsx')));
    modules.push({ name: 'routes (App Router)', path: prefix, files: routeFiles, type: 'routes', deps: [] });
  }

  if (hasPagesDir) {
    const prefix = files.some((f) => f.startsWith('src/pages/')) ? 'src/pages' : 'pages';
    modules.push({
      name: 'routes (Pages Router)',
      path: prefix,
      files: files.filter((f) => f.startsWith(prefix + '/')),
      type: 'routes',
      deps: [],
    });
  }

  const componentPaths = ['components', 'src/components', 'ui', 'src/ui'];
  for (const cp of componentPaths) {
    const compFiles = files.filter((f) => f.startsWith(cp + '/'));
    if (compFiles.length > 0) {
      modules.push({ name: 'components', path: cp, files: compFiles, type: 'ui', deps: [] });
      break;
    }
  }

  const libPaths = ['lib', 'src/lib', 'utils', 'src/utils', 'helpers', 'src/helpers'];
  for (const lp of libPaths) {
    const libFiles = files.filter((f) => f.startsWith(lp + '/'));
    if (libFiles.length > 0) {
      modules.push({ name: lp.replace('src/', ''), path: lp, files: libFiles, type: 'infra', deps: [] });
      break;
    }
  }

  const apiPaths = ['src/server', 'server', 'src/api', 'api'];
  for (const ap of apiPaths) {
    const apiFiles = files.filter((f) => f.startsWith(ap + '/') && !f.includes('/app/') && !f.includes('/pages/'));
    if (apiFiles.length > 0) {
      modules.push({ name: ap.replace('src/', ''), path: ap, files: apiFiles, type: 'api', deps: [] });
      break;
    }
  }

  if (modules.length === 0) return analyzeByDirectory(files, {});
  return modules;
}

function analyzeLaravel(files) {
  // Laravel groups code by responsibility under app/, routes/, database/, resources/.
  const groups = [
    { name: 'controllers', path: 'app/Http/Controllers', type: 'api' },
    { name: 'requests', path: 'app/Http/Requests', type: 'feature' },
    { name: 'middleware', path: 'app/Http/Middleware', type: 'infra' },
    { name: 'models', path: 'app/Models', type: 'database' },
    { name: 'services', path: 'app/Services', type: 'feature' },
    { name: 'jobs', path: 'app/Jobs', type: 'feature' },
    { name: 'events', path: 'app/Events', type: 'feature' },
    { name: 'providers', path: 'app/Providers', type: 'config' },
    { name: 'routes', path: 'routes', type: 'api' },
    { name: 'migrations', path: 'database/migrations', type: 'database' },
    { name: 'views', path: 'resources/views', type: 'ui' },
    { name: 'frontend', path: 'resources/js', type: 'ui' },
    { name: 'console', path: 'app/Console', type: 'infra' },
  ];

  const modules = groups
    .map((g) => ({ ...g, files: files.filter((f) => f.startsWith(g.path + '/')), deps: [] }))
    .filter((m) => m.files.length > 0);

  // Fall back to legacy app/Models living directly under app/
  if (!modules.some((m) => m.name === 'models')) {
    const legacyModels = files.filter((f) => /^app\/[A-Z][A-Za-z]*\.php$/.test(f));
    if (legacyModels.length) modules.push({ name: 'models', path: 'app', type: 'database', files: legacyModels, deps: [] });
  }

  return modules.length ? modules : analyzeByDirectory(files, {});
}

function analyzeDjango(files, tree) {
  // A Django "app" is a top-level package dir containing models.py / views.py / apps.py.
  const appDirs = new Set();
  for (const f of files) {
    const parts = f.split('/');
    if (parts.length < 2) continue;
    const base = parts[parts.length - 1];
    if (['models.py', 'views.py', 'apps.py', 'admin.py', 'serializers.py', 'urls.py'].includes(base)) {
      appDirs.add(parts.slice(0, parts.length - 1).join('/'));
    }
  }

  const modules = [...appDirs]
    .map((dir) => {
      const dirFiles = files.filter((f) => f.startsWith(dir + '/'));
      const hasModels = dirFiles.some((f) => f.endsWith('/models.py'));
      const hasViews = dirFiles.some((f) => f.endsWith('/views.py'));
      const isSettings = dirFiles.some((f) => f.endsWith('/settings.py') || f.endsWith('/wsgi.py') || f.endsWith('/asgi.py'));
      const type = isSettings ? 'config' : hasViews ? 'api' : hasModels ? 'database' : 'feature';
      return { name: dir.split('/').pop(), path: dir, type, files: dirFiles, deps: [] };
    })
    .filter((m) => m.files.length > 0);

  return modules.length ? modules : analyzeByDirectory(files, tree);
}

function analyzePython(files, tree) {
  // Group by the main package dir (app/src/api): each subdir is a module, and
  // loose top-level modules inside the package are collected as one module.
  const pkg = ['app', 'src', 'api'].find((d) => tree[d] && typeof tree[d] === 'object');
  if (!pkg) return analyzeByDirectory(files, tree);

  const sub = tree[pkg];
  const modules = [];
  const looseFiles = [];

  for (const key of Object.keys(sub)) {
    const path = `${pkg}/${key}`;
    if (sub[key] && typeof sub[key] === 'object' && !IGNORE_DIRS.includes(key)) {
      const dirFiles = files.filter((f) => f.startsWith(path + '/'));
      if (dirFiles.length) modules.push({ name: key, path, type: inferModuleType(key, dirFiles), files: dirFiles, deps: [] });
    } else if (key.endsWith('.py') && key !== '__init__.py') {
      looseFiles.push(path);
    }
  }

  if (looseFiles.length) modules.unshift({ name: pkg, path: pkg, type: 'feature', files: looseFiles, deps: [] });
  return modules.length ? modules : analyzeByDirectory(files, tree);
}

function getSourceDirs(tree) {
  const result = [];
  const isDir = (node) => node !== null && typeof node === 'object';

  for (const srcDir of SOURCE_DIRS) {
    if (isDir(tree[srcDir])) {
      const subDirs = Object.keys(tree[srcDir]).filter(
        (k) => isDir(tree[srcDir][k]) && !IGNORE_DIRS.includes(k)
      );
      if (subDirs.length > 0) {
        result.push(...subDirs.map((d) => `${srcDir}/${d}`));
        return result;
      }
      result.push(srcDir);
      return result;
    }
  }

  return Object.keys(tree).filter(
    (k) => isDir(tree[k]) && !IGNORE_DIRS.includes(k)
  );
}

function inferModuleType(dir, files) {
  const name = dir.toLowerCase().split('/').pop();
  if (['components', 'ui', 'views', 'pages', 'screens'].includes(name)) return 'ui';
  if (['routes', 'controllers', 'handlers', 'api'].includes(name)) return 'api';
  if (['models', 'entities', 'schemas', 'db', 'database', 'prisma'].includes(name)) return 'database';
  if (['utils', 'helpers', 'lib', 'shared', 'common'].includes(name)) return 'infra';
  if (['config', 'configs', 'settings', 'env'].includes(name)) return 'config';
  if (['hooks', 'composables', 'services'].includes(name)) return 'feature';
  return 'feature';
}

function isIgnored(f) {
  return IGNORE_DIRS.some((d) => f.startsWith(d + '/') || f === d);
}

function isConfig(f) {
  const ext = extname(f);
  return CONFIG_EXTENSIONS.includes(ext) && !f.includes('schema');
}
