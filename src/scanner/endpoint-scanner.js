import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', 'out']);

// NestJS decorator pattern: @Get('/path'), @Post(), etc.
const NESTJS_DECORATOR_RE = /@(Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*['"`]?([^'"`)\s]*)['"`]?\s*\)/g;
// Express/Fastify route pattern: router.get('/path', ...) or app.post(...)
const EXPRESS_ROUTE_RE = /(?:router|app)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

function walkFiles(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, results);
    else if (/\.(ts|js|mjs)$/.test(entry.name)) results.push(full);
  }
  return results;
}

function relPath(basePath, full) {
  return full.startsWith(basePath + '/') ? full.slice(basePath.length + 1) : full;
}

export function scanEndpoints(repoPath) {
  const files = walkFiles(repoPath);
  const endpoints = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const rel = relPath(repoPath, file);

    // NestJS: look for controller prefix + method decorators
    let controllerPrefix = '';
    const controllerMatch = content.match(/@Controller\s*\(\s*['"`]?([^'"`)\s]*)['"`]?\s*\)/);
    if (controllerMatch) controllerPrefix = '/' + controllerMatch[1].replace(/^\//, '');

    // Scan NestJS method decorators
    let match;
    NESTJS_DECORATOR_RE.lastIndex = 0;
    while ((match = NESTJS_DECORATOR_RE.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const subPath = match[2] ? '/' + match[2].replace(/^\//, '') : '';
      const fullPath = (controllerPrefix + subPath) || '/';

      // Find the handler function name (next identifier after the decorator)
      const afterDecorator = content.slice(match.index + match[0].length);
      const handlerMatch = afterDecorator.match(/\s*(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
      const handler = handlerMatch ? handlerMatch[1] : null;

      endpoints.push({ method, path: fullPath, file: rel, handler, source: 'nestjs' });
    }

    // Scan Express-style routes
    EXPRESS_ROUTE_RE.lastIndex = 0;
    while ((match = EXPRESS_ROUTE_RE.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const path = match[2];
      endpoints.push({ method, path, file: rel, handler: null, source: 'express' });
    }
  }

  return endpoints;
}
