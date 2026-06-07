import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(__dirname, '..', '..', 'templates', 'pp-statusline.mjs');

const STATUSLINE = {
  type: 'command',
  command: 'node .claude/pp-statusline.mjs',
  refreshInterval: 5,
};

// Enable the promptpilot-ai status bar: copy the standalone script and wire it
// into .claude/settings.json. Never overrides a statusLine the user already set.
export function installStatusline(cwd) {
  const claudeDir = join(cwd, '.claude');
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

  copyFileSync(TEMPLATE, join(claudeDir, 'pp-statusline.mjs'));

  const settingsPath = join(claudeDir, 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }
  }

  if (settings.statusLine) {
    const ours = settings.statusLine.command && settings.statusLine.command.includes('pp-statusline');
    return { installed: ours, reason: ours ? 'updated' : 'existing statusLine kept' };
  }

  settings.statusLine = STATUSLINE;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { installed: true, reason: 'installed' };
}

// On upgrade (`sync --templates`), refresh the script ONLY if the user already
// opted in — never silently enable it for someone who declined.
export function refreshStatuslineScript(cwd) {
  const dest = join(cwd, '.claude', 'pp-statusline.mjs');
  if (!existsSync(dest)) return false;
  try { copyFileSync(TEMPLATE, dest); return true; } catch { return false; }
}
