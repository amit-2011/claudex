import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', 'out',
  'vendor', 'storage', '__pycache__', '.venv', 'venv', 'env',
]);

// NestJS decorator pattern: @Get('/path'), @Post(), etc.
const NESTJS_DECORATOR_RE = /@(Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*['"`]?([^'"`)\s]*)['"`]?\s*\)/g;
// Express/Fastify route pattern: router.get('/path', ...) or app.post(...)
const EXPRESS_ROUTE_RE = /(?:router|app)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

// Laravel: Route::get('/path', [Controller::class, 'method']) / Route::post('path', 'Ctrl@method')
const LARAVEL_ROUTE_RE = /Route::(get|post|put|patch|delete|any|options)\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*(.+?))?\)/gis;
// Laravel resource controllers: Route::resource('users', UserController::class)
const LARAVEL_RESOURCE_RE = /Route::(resource|apiResource)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z0-9_\\]+)::class/gi;

// Flask / FastAPI decorators: @app.get('/path'), @router.post('/path')
const PY_DECORATOR_RE = /@(?:app|router|blueprint|bp|api)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
// Flask classic: @app.route('/path', methods=['GET', 'POST'])
const FLASK_ROUTE_RE = /@(?:app|blueprint|bp)\s*\.\s*route\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*methods\s*=\s*\[([^\]]*)\])?/gi;
// Django urls.py: path('users/', views.list_users, name='...') / re_path(r'^...$', view)
const DJANGO_PATH_RE = /\b(?:path|re_path|url)\s*\(\s*[r]?['"]([^'"]*)['"]\s*,\s*([A-Za-z0-9_.]+)/gi;

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
    else if (/\.(ts|js|mjs|php|py)$/.test(entry.name)) results.push(full);
  }
  return results;
}

function relPath(basePath, full) {
  return full.startsWith(basePath + '/') ? full.slice(basePath.length + 1) : full;
}

function ensureLeadingSlash(p) {
  if (!p) return '/';
  return p.startsWith('/') ? p : '/' + p;
}

const RESOURCE_VERBS = [
  { method: 'GET', suffix: '' },
  { method: 'POST', suffix: '' },
  { method: 'GET', suffix: '/{id}' },
  { method: 'PUT', suffix: '/{id}' },
  { method: 'DELETE', suffix: '/{id}' },
];

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
    const ext = extname(file);
    let match;

    if (ext === '.ts' || ext === '.js' || ext === '.mjs') {
      // NestJS: controller prefix + method decorators
      let controllerPrefix = '';
      const controllerMatch = content.match(/@Controller\s*\(\s*['"`]?([^'"`)\s]*)['"`]?\s*\)/);
      if (controllerMatch) controllerPrefix = '/' + controllerMatch[1].replace(/^\//, '');

      NESTJS_DECORATOR_RE.lastIndex = 0;
      while ((match = NESTJS_DECORATOR_RE.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const subPath = match[2] ? '/' + match[2].replace(/^\//, '') : '';
        const fullPath = (controllerPrefix + subPath) || '/';
        const afterDecorator = content.slice(match.index + match[0].length);
        const handlerMatch = afterDecorator.match(/\s*(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
        endpoints.push({ method, path: fullPath, file: rel, handler: handlerMatch ? handlerMatch[1] : null, source: 'nestjs' });
      }

      EXPRESS_ROUTE_RE.lastIndex = 0;
      while ((match = EXPRESS_ROUTE_RE.exec(content)) !== null) {
        endpoints.push({ method: match[1].toUpperCase(), path: match[2], file: rel, handler: null, source: 'express' });
      }
    } else if (ext === '.php') {
      LARAVEL_ROUTE_RE.lastIndex = 0;
      while ((match = LARAVEL_ROUTE_RE.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const path = ensureLeadingSlash(match[2]);
        const handler = parseLaravelHandler(match[3]);
        const methods = method === 'ANY' ? ['GET', 'POST'] : [method];
        for (const m of methods) {
          endpoints.push({ method: m, path, file: rel, handler, source: 'laravel' });
        }
      }

      LARAVEL_RESOURCE_RE.lastIndex = 0;
      while ((match = LARAVEL_RESOURCE_RE.exec(content)) !== null) {
        const base = ensureLeadingSlash(match[2]);
        const controller = match[3].split('\\').pop();
        for (const { method, suffix } of RESOURCE_VERBS) {
          endpoints.push({ method, path: base + suffix, file: rel, handler: `${controller}`, source: 'laravel' });
        }
      }
    } else if (ext === '.py') {
      PY_DECORATOR_RE.lastIndex = 0;
      while ((match = PY_DECORATOR_RE.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const path = ensureLeadingSlash(match[2]);
        endpoints.push({ method, path, file: rel, handler: findPyHandler(content, match.index + match[0].length), source: 'python' });
      }

      FLASK_ROUTE_RE.lastIndex = 0;
      while ((match = FLASK_ROUTE_RE.exec(content)) !== null) {
        const path = ensureLeadingSlash(match[1]);
        const methods = match[2]
          ? match[2].split(',').map((m) => m.replace(/['"\s]/g, '').toUpperCase()).filter(Boolean)
          : ['GET'];
        const handler = findPyHandler(content, match.index + match[0].length);
        for (const m of methods) {
          endpoints.push({ method: m, path, file: rel, handler, source: 'flask' });
        }
      }

      if (/urls?\.py$/.test(rel) || /urlpatterns/.test(content)) {
        DJANGO_PATH_RE.lastIndex = 0;
        while ((match = DJANGO_PATH_RE.exec(content)) !== null) {
          const path = ensureLeadingSlash(match[1].replace(/[\^$]/g, ''));
          endpoints.push({ method: 'ANY', path, file: rel, handler: match[2], source: 'django' });
        }
      }
    }
  }

  return endpoints;
}

function parseLaravelHandler(raw) {
  if (!raw) return null;
  const s = raw.trim();
  // [UserController::class, 'index']
  let m = s.match(/\[\s*([A-Za-z0-9_\\]+)::class\s*,\s*['"]([^'"]+)['"]/);
  if (m) return `${m[1].split('\\').pop()}@${m[2]}`;
  // 'UserController@index'
  m = s.match(/['"]([A-Za-z0-9_\\]+@[A-Za-z0-9_]+)['"]/);
  if (m) return m[1].split('\\').pop();
  return null;
}

function findPyHandler(content, fromIndex) {
  const after = content.slice(fromIndex, fromIndex + 400);
  const m = after.match(/(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
  return m ? m[1] : null;
}
