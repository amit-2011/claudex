import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { normalizeTargets, primaryDir, primaryTool } from './targets.js';

// Lightweight cache of context stats, written at init/sync time so the
// status line and `stats` command never have to re-scan the codebase.
const CACHE_NAME = '.pp-stats.json';

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

// Per-tool location of the generated context, in stats-source preference order.
const STATS_SOURCES = {
  claude: { base: ['.claude', 'context'], ext: '.md', root: 'CLAUDE.md' },
  gemini: { base: ['.gemini', 'context'], ext: '.md', root: 'GEMINI.md' },
  cursor: { base: ['.cursor', 'rules'], ext: '.mdc' },
  antigravity: { base: ['.agents', 'rules'], ext: '.md' },
};

export function writeStatsCache(cwd, scanData, target = ['claude']) {
  try {
    const targets = normalizeTargets(target);
    const primary = primaryTool(targets);
    const src = STATS_SOURCES[primary];
    const ext = src.ext;
    const baseDir = join(cwd, ...src.base);

    let contextBytes = dirBytes(baseDir, ext);
    if (src.root) {
      try { contextBytes += statSync(join(cwd, src.root)).size; } catch {}
    }

    const modulesDir = join(baseDir, 'modules');
    const moduleSizes = (scanData.modules || []).map((m) => {
      let bytes = 0;
      try { bytes = statSync(join(modulesDir, moduleSlug(m.name, ext))).size; } catch {}
      return { name: m.name, path: m.path, files: (m.files || []).length, bytes };
    });

    const cache = {
      targets,
      target: primary, // back-compat for readers
      files: scanData.fileData?.totalFiles ?? 0,
      modules: (scanData.modules || []).length,
      moduleSizes,
      contextBytes,
      contextTokens: Math.round(contextBytes / 4),
      generatedAt: Date.now(),
    };

    const dir = join(cwd, primaryDir(targets));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, CACHE_NAME), JSON.stringify(cache));
    return cache;
  } catch {
    return null;
  }
}

export function readStatsCache(cwd) {
  for (const dir of ['.claude', '.cursor', '.gemini', '.agents']) {
    try {
      return JSON.parse(readFileSync(join(cwd, dir, CACHE_NAME), 'utf8'));
    } catch {}
  }
  return null;
}
