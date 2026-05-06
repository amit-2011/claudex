import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';

const SOURCE_DIRS = ['src', 'app', 'lib', 'packages', 'modules', 'api', 'server', 'client'];
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.turbo'];
const TEST_PATTERNS = ['.test.', '.spec.', '__tests__', 'tests/', 'test/'];
const CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml', '.toml', '.env'];

export function analyzeModules(files, tree, framework) {
  const sourceFiles = files.filter((f) => !isIgnored(f) && !isConfig(f));
  const strategy = pickStrategy(tree, framework);

  let modules;
  if (strategy === 'nestjs') modules = analyzNestJS(sourceFiles);
  else if (strategy === 'nextjs') modules = analyzeNextJS(sourceFiles, tree);
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

function getSourceDirs(tree) {
  const result = [];

  for (const srcDir of SOURCE_DIRS) {
    if (tree[srcDir] && typeof tree[srcDir] === 'object') {
      const subDirs = Object.keys(tree[srcDir]).filter(
        (k) => typeof tree[srcDir][k] === 'object' && !IGNORE_DIRS.includes(k)
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
    (k) => typeof tree[k] === 'object' && !IGNORE_DIRS.includes(k)
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
