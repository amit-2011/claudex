import { statSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { readStatsCache } from '../utils/stats-cache.js';
import { cyan, dim, bold, green, yellow, gray } from '../utils/color.js';

// ── formatting helpers ──────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtK(n) {
  if (n == null) return '';
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`.replace('.0k', 'k');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

function ago(ms) {
  if (ms == null || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const visibleLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;

// ── stats computation ───────────────────────────────────────────────
function readLastSync(cwd, target) {
  const dir =
    target === 'cursor' ? '.cursor'
    : target === 'gemini' ? '.gemini'
    : target === 'antigravity' ? '.agents'
    : '.claude';
  try {
    const ms = parseInt(readFileSync(join(cwd, dir, '.last-sync'), 'utf8'), 10);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function gitChangedFiles(cwd) {
  const out = [];
  for (const cmd of ['git diff --name-only HEAD', 'git ls-files --others --exclude-standard']) {
    try {
      const r = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      r.split('\n').filter(Boolean).forEach((f) => out.push(f));
    } catch {}
  }
  return [...new Set(out)];
}

const SOURCE_RE = /\.(ts|tsx|js|jsx|py|php|vue|svelte|astro)$/;

function computeStale(cwd, cache) {
  const changed = gitChangedFiles(cwd).filter((f) => SOURCE_RE.test(f));
  if (!changed.length) return { count: 0, modules: [] };
  const mods = cache.moduleSizes || [];
  const hit = new Set();
  let count = 0;
  for (const f of changed) {
    const m = mods.find((mm) => mm.path && (f === mm.path || f.startsWith(mm.path + '/')));
    if (m) { hit.add(m.name); count++; }
  }
  return { count, modules: [...hit] };
}

export function computeStats(cwd) {
  const cache = readStatsCache(cwd);
  if (!cache) return null;
  const lastSyncMs = readLastSync(cwd, cache.target) ?? cache.generatedAt ?? null;
  const stale = computeStale(cwd, cache);
  return { ...cache, lastSyncMs, staleFiles: stale.count, staleModules: stale.modules };
}

// ── status line (single line, ANSI) ─────────────────────────────────
export function formatStatusLine(stats, claude = {}) {
  if (!stats) return '';

  const left = `${cyan('📊 PP')} ${dim(
    `${fmtBytes(stats.contextBytes)} · ${stats.files} files · ${stats.modules} mod · synced ${ago(
      Date.now() - stats.lastSyncMs
    )}`
  )}`;
  const stale = stats.staleFiles > 0 ? ' ' + yellow(`⚠ ${stats.staleFiles} stale`) : '';

  const parts = [left + stale];

  const ctx = claude.context_window;
  if (ctx && ctx.used_percentage != null) {
    const pct = Math.round(ctx.used_percentage);
    const used = ctx.total_input_tokens ?? ctx.current_usage?.input_tokens;
    const size = ctx.context_window_size;
    const dot = pct >= 85 ? '🔴' : pct >= 60 ? '🟡' : '🟢';
    const color = pct >= 85 ? (s) => `\x1b[31m${s}\x1b[0m` : pct >= 60 ? yellow : green;
    const usage = used && size ? ` (${fmtK(used)}/${fmtK(size)})` : '';
    parts.push(`${color(`ctx ${pct}%${usage}`)} ${dot}`);
  }

  if (claude.model?.display_name) parts.push(dim(claude.model.display_name));

  return '  ' + parts.join(dim('  │  '));
}

// ── dashboard (box for TTY, markdown otherwise) ──────────────────────
function renderBox(stats) {
  const lines = [];
  lines.push(bold(cyan('promptpilot-ai · context')));
  lines.push(dim('─'.repeat(38)));
  lines.push(`Files scanned     ${green(String(stats.files))}`);
  lines.push(
    `Context size      ~${fmtBytes(stats.contextBytes)}  ${dim(`(~${fmtK(stats.contextTokens)} tokens)`)}`
  );
  lines.push(`Modules           ${green(String(stats.modules))}`);
  lines.push(`Last sync         ${ago(Date.now() - stats.lastSyncMs)}`);
  lines.push(
    `Stale             ${
      stats.staleFiles > 0
        ? yellow(`${stats.staleFiles} files (${stats.staleModules.join(', ')})`)
        : green('none')
    }`
  );

  const mods = [...(stats.moduleSizes || [])].sort((a, b) => b.bytes - a.bytes);
  if (mods.length) {
    lines.push('');
    const maxBytes = Math.max(...mods.map((m) => m.bytes), 1);
    const nameW = Math.min(Math.max(...mods.map((m) => m.name.length), 6), 14);
    for (const m of mods) {
      const filled = Math.round((m.bytes / maxBytes) * 10);
      const bar = cyan('█'.repeat(filled)) + gray('░'.repeat(10 - filled));
      lines.push(
        `${m.name.padEnd(nameW)}  ${bar}  ${dim(`${String(m.files).padStart(3)} files  ${fmtBytes(m.bytes)}`)}`
      );
    }
  }

  const contentWidth = Math.max(...lines.map(visibleLen));
  const innerWidth = contentWidth + 4;
  const top = dim('╭' + '─'.repeat(innerWidth) + '╮');
  const bot = dim('╰' + '─'.repeat(innerWidth) + '╯');
  const body = lines
    .map((l) => dim('│') + '  ' + l + ' '.repeat(contentWidth - visibleLen(l)) + '  ' + dim('│'))
    .join('\n');
  return '\n' + top + '\n' + body + '\n' + bot + '\n';
}

function renderMarkdown(stats) {
  const staleVal =
    stats.staleFiles > 0 ? `${stats.staleFiles} files — ${stats.staleModules.join(', ')}` : 'none';
  const rows = [
    '**promptpilot-ai · context**',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Files scanned | ${stats.files} |`,
    `| Context size | ~${fmtBytes(stats.contextBytes)} (~${fmtK(stats.contextTokens)} tokens) |`,
    `| Modules | ${stats.modules} |`,
    `| Last sync | ${ago(Date.now() - stats.lastSyncMs)} |`,
    `| Stale (uncommitted) | ${staleVal} |`,
  ];

  const mods = [...(stats.moduleSizes || [])].sort((a, b) => b.bytes - a.bytes);
  if (mods.length) {
    rows.push('', '| Module | Files | Size |', '|---|---|---|');
    for (const m of mods) rows.push(`| ${m.name} | ${m.files} | ${fmtBytes(m.bytes)} |`);
  }
  return rows.join('\n');
}

// ── CLI handlers ─────────────────────────────────────────────────────
export async function runStats(cwd) {
  const stats = computeStats(cwd);
  const tty = process.stdout.isTTY;
  if (!stats) {
    console.log(
      tty
        ? `\n  ${yellow('No promptpilot-ai context found.')} Run ${cyan('npx promptpilot-ai init')} first.\n`
        : 'No promptpilot-ai context found. Run `npx promptpilot-ai init` first.'
    );
    return;
  }
  console.log(tty ? renderBox(stats) : renderMarkdown(stats));
}

export async function runStatusLine(cwd) {
  const stats = computeStats(cwd);
  let claude = {};
  if (!process.stdin.isTTY) {
    try {
      const chunks = [];
      for await (const ch of process.stdin) chunks.push(ch);
      if (chunks.length) claude = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {}
  }
  const line = formatStatusLine(stats, claude);
  if (line) process.stdout.write(line + '\n');
}
