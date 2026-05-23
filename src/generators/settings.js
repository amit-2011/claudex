import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function writeClaudeSettings(cwd, stack) {
  const settingsDir = join(cwd, '.claude');
  const settingsPath = join(settingsDir, 'settings.json');

  mkdirSync(settingsDir, { recursive: true });

  const pm = stack?.packageManager || 'npm';
  const pmPattern = `Bash(${pm}:*)`;
  const extraPm = pm !== 'npm' ? ', "Bash(npm:*)"' : '';

  const syncCommand = 'npx promptpilot-ai update-context --since-last-sync 2>/dev/null || true';

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
    hooks: {
      Stop: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: syncCommand }],
        },
      ],
      SessionStart: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: syncCommand }],
        },
      ],
    },
  };

  if (existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(readFileSync(settingsPath, 'utf8'));
      let changed = false;

      if (existing.permissions?.allow) {
        const merged = [...new Set([...existing.permissions.allow, ...settings.permissions.allow])];
        if (merged.length !== existing.permissions.allow.length) {
          existing.permissions.allow = merged;
          changed = true;
        }
      } else {
        existing.permissions = settings.permissions;
        changed = true;
      }

      existing.hooks = existing.hooks || {};
      for (const event of ['Stop', 'SessionStart']) {
        const has = (existing.hooks[event] || []).some((entry) =>
          (entry.hooks || []).some((h) => h.command && h.command.includes('promptpilot-ai update-context'))
        );
        if (!has) {
          existing.hooks[event] = [...(existing.hooks[event] || []), ...settings.hooks[event]];
          changed = true;
        }
      }

      if (changed) writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
      return 'merged';
    } catch {}
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return 'created';
}
