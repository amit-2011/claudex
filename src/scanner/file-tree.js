import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, extname } from 'path';

const ENTRY_NAMES = ['index', 'main', 'app', 'server', 'cli'];
const CONFIG_NAMES = [
  'package.json', 'tsconfig.json', 'tsconfig.base.json',
  'vite.config.ts', 'vite.config.js', 'next.config.ts', 'next.config.js',
  'nest-cli.json', '.env.example', 'drizzle.config.ts', 'prisma/schema.prisma',
  'tailwind.config.ts', 'tailwind.config.js', 'eslint.config.js', '.eslintrc.json',
  'jest.config.ts', 'vitest.config.ts', 'docker-compose.yml', 'Dockerfile',
];

export function scanFileTree(cwd) {
  let raw;
  try {
    raw = execSync('git ls-files', { cwd, encoding: 'utf8' });
  } catch {
    return null;
  }

  const files = raw.split('\n').filter(Boolean);
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
