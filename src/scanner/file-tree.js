import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, extname } from 'path';

const ENTRY_NAMES = ['index', 'main', 'app', 'server', 'cli', 'manage', 'wsgi', 'asgi', 'artisan'];
const CONFIG_NAMES = [
  // Node.js
  'package.json', 'tsconfig.json', 'tsconfig.base.json',
  'vite.config.ts', 'vite.config.js', 'next.config.ts', 'next.config.js',
  'nest-cli.json', '.env.example', 'drizzle.config.ts', 'prisma/schema.prisma',
  'tailwind.config.ts', 'tailwind.config.js', 'eslint.config.js', '.eslintrc.json',
  'jest.config.ts', 'vitest.config.ts', 'docker-compose.yml', 'Dockerfile',
  // PHP / Laravel
  'composer.json', 'artisan', 'phpunit.xml', 'phpunit.xml.dist', 'pint.json', 'webpack.mix.js',
  // Python
  'requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg',
  'manage.py', 'pytest.ini', 'tox.ini', 'environment.yml',
  // Mobile — Flutter / Android / iOS / React Native
  'pubspec.yaml', 'analysis_options.yaml',
  'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradle/libs.versions.toml',
  'Package.swift', 'Podfile', 'Podfile.lock',
  'app.json', 'app.config.js', 'app.config.ts', 'metro.config.js', 'eas.json',
];

const WALK_SKIP = new Set([
  'node_modules', '.git', 'dist', '.next', 'build', 'coverage', '.turbo', 'out', '.cache',
  // PHP
  'vendor', 'storage',
  // Python
  '__pycache__', '.venv', 'venv', 'env', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.eggs',
  // Mobile build artifacts
  '.dart_tool', 'Pods', 'DerivedData', '.gradle', 'Carthage', '.expo', 'Flutter',
]);

function walkDir(dir, base, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (WALK_SKIP.has(entry.name)) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkDir(join(dir, entry.name), rel, results);
    else results.push(rel);
  }
  return results;
}

export function scanFileTree(cwd) {
  let files;
  try {
    const raw = execSync('git ls-files', { cwd, encoding: 'utf8', stdio: 'pipe' });
    files = raw.split('\n').filter(Boolean);
  } catch {
    files = walkDir(cwd, '');
  }

  if (!files.length) return null;
  const tree = buildTree(files);
  const entryPoints = detectEntryPoints(files);
  const configFiles = detectConfigFiles(files, cwd);
  const extensions = countExtensions(files);

  return { files, tree, entryPoints, configFiles, extensions, totalFiles: files.length };
}

function buildTree(files) {
  const tree = {};
  for (const file of files) {
    const parts = file.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = null;
  }
  return tree;
}

function detectEntryPoints(files) {
  return files.filter((f) => {
    const base = f.split('/').pop().replace(/\.[^.]+$/, '');
    return ENTRY_NAMES.includes(base.toLowerCase());
  });
}

function detectConfigFiles(files, cwd) {
  return CONFIG_NAMES.filter((c) => files.includes(c) || existsSync(join(cwd, c)));
}

function countExtensions(files) {
  const counts = {};
  for (const f of files) {
    const ext = extname(f).slice(1);
    if (ext) counts[ext] = (counts[ext] || 0) + 1;
  }
  return counts;
}

export function getTopLevelDirs(tree) {
  return Object.keys(tree).filter((k) => typeof tree[k] === 'object' && tree[k] !== null);
}
