import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function writeClaudeSettings(cwd, stack) {
  const settingsDir = join(cwd, '.claude');
  const settingsPath = join(settingsDir, 'settings.json');

  mkdirSync(settingsDir, { recursive: true });

  const pm = stack?.packageManager || 'npm';
  const language = stack?.language;

  const syncCommand = 'npx promptpilot-ai update-context --since-last-sync 2>/dev/null || true';

  const allow = new Set([
    'Bash(git:*)',
    'Bash(node:*)',
    'Read',
    'Edit',
    'Write',
  ]);

  // The package-manager binary — skip pseudo-managers that aren't real CLIs
  // (Dart `pub`, Swift `spm`, `cocoapods`, `xcode`); their tools are added below.
  if (!['pub', 'spm', 'cocoapods', 'xcode'].includes(pm)) allow.add(`Bash(${pm}:*)`);

  // npx is always needed for the auto-sync hook
  allow.add('Bash(npx:*)');

  if (language === 'PHP') {
    allow.add('Bash(php:*)');
    allow.add('Bash(composer:*)');
    allow.add('Bash(./vendor/bin/pint:*)');
    allow.add('Bash(./vendor/bin/pest:*)');
    allow.add('Bash(./vendor/bin/phpunit:*)');
  } else if (language === 'Python') {
    allow.add('Bash(python:*)');
    allow.add('Bash(python3:*)');
    allow.add('Bash(pip:*)');
    allow.add('Bash(pytest:*)');
    if (pm === 'poetry') allow.add('Bash(poetry:*)');
    if (pm === 'pipenv') allow.add('Bash(pipenv:*)');
    if (pm === 'uv') allow.add('Bash(uv:*)');
    if (pm === 'pdm') allow.add('Bash(pdm:*)');
  }

  // Mobile toolchains (Flutter / Android / iOS / React Native)
  if (language === 'Dart') {
    allow.add('Bash(flutter:*)');
    allow.add('Bash(dart:*)');
  }
  if (language === 'Kotlin' || language === 'Java') {
    allow.add('Bash(./gradlew:*)');
    allow.add('Bash(gradle:*)');
  }
  if (language === 'Swift') {
    allow.add('Bash(xcodebuild:*)');
    allow.add('Bash(swift:*)');
    allow.add('Bash(swiftlint:*)');
  }
  if (stack?.framework?.type === 'mobile') {
    // Emulator / simulator / device + E2E testing
    ['Bash(adb:*)', 'Bash(emulator:*)', 'Bash(xcrun:*)', 'Bash(pod:*)', 'Bash(maestro:*)'].forEach((p) => allow.add(p));
  }

  const settings = {
    permissions: {
      allow: [...allow],
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
