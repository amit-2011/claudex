import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function writeClaudeSettings(cwd, stack) {
  const settingsDir = join(cwd, '.claude');
  const settingsPath = join(settingsDir, 'settings.json');

  mkdirSync(settingsDir, { recursive: true });

  const pm = stack?.packageManager || 'npm';
  const pmPattern = `Bash(${pm}:*)`;
  const extraPm = pm !== 'npm' ? ', "Bash(npm:*)"' : '';

  const settings = {
    permissions: {
      allow: [
        `"${pmPattern}"${extraPm}`,
        '"Bash(git:*)"',
        '"Bash(node:*)"',
        '"Read"',
        '"Edit"',
        '"Write"',
      ].map((s) => s.replace(/"/g, '')),
    },
  };

  if (existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(readFileSync(settingsPath, 'utf8'));
      if (existing.permissions?.allow) {
        const merged = [...new Set([...existing.permissions.allow, ...settings.permissions.allow])];
        existing.permissions.allow = merged;
        writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
        return 'merged';
      }
    } catch {}
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return 'created';
}
