import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', 'out']);

// fetch('/api/...') or fetch(`/api/...`)
const FETCH_RE = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g;
// axios.get('/api/...') axios.post(...) etc.
const AXIOS_RE = /axios\s*\.\s*(get|post|put|patch|delete|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
// useQuery(['key', '/api/...']) or similar
const USE_QUERY_RE = /use(?:Query|Mutation|InfiniteQuery)\s*\(\s*\[(?:[^\]]*,\s*)?['"`]([^'"`]+)['"`]/gi;
// Custom API helper: api.get('/...') or apiClient.post('/...')
const API_CLIENT_RE = /(?:api|apiClient|client|http)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

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
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) results.push(full);
  }
  return results;
}

function relPath(basePath, full) {
  return full.startsWith(basePath + '/') ? full.slice(basePath.length + 1) : full;
}

export function scanApiCalls(repoPath) {
  const files = walkFiles(repoPath);
  const calls = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const rel = relPath(repoPath, file);

    let match;

    FETCH_RE.lastIndex = 0;
    while ((match = FETCH_RE.exec(content)) !== null) {
      const path = match[1];
      if (!path.startsWith('/') && !path.startsWith('http')) continue;
      calls.push({ method: 'GET', path, file: rel, source: 'fetch' });
    }

    AXIOS_RE.lastIndex = 0;
    while ((match = AXIOS_RE.exec(content)) !== null) {
      calls.push({ method: match[1].toUpperCase(), path: match[2], file: rel, source: 'axios' });
    }

    USE_QUERY_RE.lastIndex = 0;
    while ((match = USE_QUERY_RE.exec(content)) !== null) {
      const path = match[1];
      if (path.startsWith('/')) {
        calls.push({ method: 'GET', path, file: rel, source: 'useQuery' });
      }
    }

    API_CLIENT_RE.lastIndex = 0;
    while ((match = API_CLIENT_RE.exec(content)) !== null) {
      calls.push({ method: match[1].toUpperCase(), path: match[2], file: rel, source: 'apiClient' });
    }
  }

  return calls;
}
