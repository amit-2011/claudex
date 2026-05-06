import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function installGitHook(cwd) {
  let gitDir;
  try {
    gitDir = execSync('git rev-parse --git-dir', { cwd, encoding: 'utf8' }).trim();
  } catch {
    return { success: false, reason: 'Not a git repository' };
  }

  const resolvedGitDir = gitDir.startsWith('/') ? gitDir : join(cwd, gitDir);
  const hooksDir = join(resolvedGitDir, 'hooks');
  const hookPath = join(hooksDir, 'post-commit');

  mkdirSync(hooksDir, { recursive: true });

  const hookContent = buildHookScript();

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf8');
    if (existing.includes('claudex')) {
      return { success: true, reason: 'already installed' };
    }
    writeFileSync(hookPath, existing.trimEnd() + '\n\n' + hookContent);
  } else {
    writeFileSync(hookPath, '#!/bin/bash\n\n' + hookContent);
  }

  chmodSync(hookPath, '755');
  return { success: true, reason: 'installed' };
}

function buildHookScript() {
  return `# claudex: auto-update context on commit
if command -v npx &> /dev/null; then
  CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null)
  if [ -n "$CHANGED" ]; then
    npx claudex update-context $CHANGED 2>/dev/null || true
  fi
fi`;
}
