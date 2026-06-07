import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

// Lightweight cache of context stats, written at init/sync time so the
// status line and `stats` command never have to re-scan the codebase.
const CACHE_NAME = '.pp-stats.json';

function cacheDir(cwd, target) {
  return join(cwd, target === 'cursor' ? '.cursor' : '.claude');
}

function dirBytes(dir, ext) {
  let bytes = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) bytes += dirBytes(p, ext);
      else if (e.name.endsWith(ext)) {
        try { bytes += statSync(p).size; } catch {}
      }
    }
  } catch {}
  return bytes;
}

function moduleSlug(name, ext) {
  return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() + ext;
}

export function writeStatsCache(cwd, scanData, target = 'claude') {
  try {
    const isCursor = target === 'cursor';
    const ext = isCursor ? '.mdc' : '.md';
    const baseDir = isCursor ? join(cwd, '.cursor', 'rules') : join(cwd, '.claude', 'context');

    let contextBytes = dirBytes(baseDir, ext);
    if (!isCursor) {
      try { contextBytes += statSync(join(cwd, 'CLAUDE.md')).size; } catch {}
    }

    const modulesDir = join(baseDir, 'modules');
    const moduleSizes = (scanData.modules || []).map((m) => {
      let bytes = 0;
      try { bytes = statSync(join(modulesDir, moduleSlug(m.name, ext))).size; } catch {}
      return { name: m.name, path: m.path, files: (m.files || []).length, bytes };
    });

    const cache = {
      target,
      files: scanData.fileData?.totalFiles ?? 0,
      modules: (scanData.modules || []).length,
      moduleSizes,
      contextBytes,
      contextTokens: Math.round(contextBytes / 4),
      generatedAt: Date.now(),
    };

    const dir = cacheDir(cwd, target);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, CACHE_NAME), JSON.stringify(cache));
    return cache;
  } catch {
    return null;
  }
}

export function readStatsCache(cwd) {
  for (const dir of ['.claude', '.cursor']) {
    try {
      return JSON.parse(readFileSync(join(cwd, dir, CACHE_NAME), 'utf8'));
    } catch {}
  }
  return null;
}
