import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { detectStack } from './stack-detector.js';

const FRONTEND_FRAMEWORKS = new Set(['Next.js', 'React', 'Vue', 'Angular', 'Svelte', 'Astro', 'Remix', 'Nuxt']);
const BACKEND_FRAMEWORKS = new Set(['NestJS', 'Express', 'Fastify', 'Hono', 'Koa']);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.next', 'build', 'coverage', '.turbo', 'out', '.cache']);

function classifyRole(stack) {
  if (!stack || !stack.framework) return 'unknown';
  const name = stack.framework.name;
  if (FRONTEND_FRAMEWORKS.has(name)) return 'frontend';
  if (BACKEND_FRAMEWORKS.has(name)) return 'backend';
  if (stack.framework.type === 'api') return 'backend';
  if (stack.framework.type === 'spa' || stack.framework.type === 'fullstack') return 'frontend';
  return 'unknown';
}

function looksLikeRepo(dirPath) {
  return existsSync(join(dirPath, 'package.json')) || existsSync(join(dirPath, '.git'));
}

export function detectSubRepos(cwd) {
  let entries;
  try {
    entries = readdirSync(cwd, { withFileTypes: true });
  } catch {
    return [];
  }

  const repos = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const dirPath = join(cwd, entry.name);
    if (!looksLikeRepo(dirPath)) continue;

    const stack = detectStack(dirPath, []);
    const role = classifyRole(stack);

    repos.push({
      name: entry.name,
      path: dirPath,
      role,
      stack,
    });
  }

  return repos;
}
