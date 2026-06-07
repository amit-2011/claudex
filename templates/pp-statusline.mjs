#!/usr/bin/env node
// promptpilot-ai status line for Claude Code.
// Dependency-free + fast: reads the cached stats file (no codebase rescan)
// and merges live context-window data from Claude Code's stdin JSON.
// Managed by promptpilot-ai — refreshed on `npx promptpilot-ai sync --templates`.
import { readFileSync } from 'fs';
import { join } from 'path';

const ansi = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const cyan = (s) => ansi(36, s);
const dim = (s) => ansi(2, s);
const green = (s) => ansi(32, s);
const yellow = (s) => ansi(33, s);
const red = (s) => ansi(31, s);

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

async function readStdin() {
  if (process.stdin.isTTY) return {};
  try {
    const chunks = [];
    for await (const ch of process.stdin) chunks.push(ch);
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  } catch {
    return {};
  }
}

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

const data = await readStdin();
const cwd = data?.workspace?.current_dir || process.cwd();

const cache =
  readJson(join(cwd, '.claude', '.pp-stats.json')) || readJson(join(cwd, '.cursor', '.pp-stats.json'));
if (!cache || !cache.files) process.exit(0); // nothing generated yet — render nothing

let lastSyncMs = cache.generatedAt ?? null;
try {
  const ms = parseInt(readFileSync(join(cwd, '.claude', '.last-sync'), 'utf8'), 10);
  if (Number.isFinite(ms)) lastSyncMs = ms;
} catch {}

const left =
  cyan('📊 PP') +
  ' ' +
  dim(`${fmtBytes(cache.contextBytes)} · ${cache.files} files · ${cache.modules} mod · synced ${ago(Date.now() - lastSyncMs)}`);

const parts = [left];

const ctx = data?.context_window;
if (ctx && ctx.used_percentage != null) {
  const pct = Math.round(ctx.used_percentage);
  const used = ctx.total_input_tokens ?? ctx.current_usage?.input_tokens;
  const size = ctx.context_window_size;
  const dot = pct >= 85 ? '🔴' : pct >= 60 ? '🟡' : '🟢';
  const color = pct >= 85 ? red : pct >= 60 ? yellow : green;
  const usage = used && size ? ` (${fmtK(used)}/${fmtK(size)})` : '';
  parts.push(`${color(`ctx ${pct}%${usage}`)} ${dot}`);
}

if (data?.model?.display_name) parts.push(dim(data.model.display_name));

process.stdout.write('  ' + parts.join(dim('  │  ')) + '\n');
