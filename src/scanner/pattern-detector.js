import { readFileSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';

export function detectPatterns(files, cwd) {
  const sourceFiles = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !f.includes('node_modules'));

  return {
    fileNaming: detectFileNaming(sourceFiles),
    componentNaming: detectComponentNaming(sourceFiles),
    importStyle: detectImportStyle(sourceFiles, cwd),
    hasPathAliases: detectPathAliases(cwd),
    patterns: detectArchPatterns(sourceFiles),
    stateManagement: detectStateManagement(files, cwd),
    cssApproach: detectCSSApproach(files, cwd),
  };
}

function detectFileNaming(files) {
  const names = files.map((f) => basename(f, extname(f)));
  let kebab = 0, camel = 0, pascal = 0;

  for (const name of names) {
    if (name.includes('-')) kebab++;
    else if (/^[A-Z]/.test(name)) pascal++;
    else if (/^[a-z]/.test(name) && /[A-Z]/.test(name)) camel++;
  }

  const max = Math.max(kebab, camel, pascal);
  if (max === kebab) return 'kebab-case';
  if (max === pascal) return 'PascalCase';
  return 'camelCase';
}

function detectComponentNaming(files) {
  // Exclude Next.js/framework convention files like page.tsx, layout.tsx, loading.tsx, error.tsx
  const FRAMEWORK_RESERVED = ['page', 'layout', 'loading', 'error', 'not-found', 'route', 'middleware'];
  const componentFiles = files.filter((f) => {
    if (!/\.(tsx|jsx)$/.test(f)) return false;
    const base = basename(f, extname(f)).toLowerCase();
    return !FRAMEWORK_RESERVED.includes(base);
  });
  if (componentFiles.length === 0) return 'PascalCase';
  const pascalCount = componentFiles.filter((f) => /^[A-Z]/.test(basename(f))).length;
  return pascalCount > componentFiles.length * 0.5 ? 'PascalCase' : 'camelCase';
}

function detectImportStyle(files, cwd) {
  const sample = files.slice(0, 10);
  for (const file of sample) {
    try {
      const content = readFileSync(join(cwd, file), 'utf8').slice(0, 500);
      if (content.includes('import ') && content.includes(' from ')) return 'ESM';
      if (content.includes('require(')) return 'CJS';
    } catch {}
  }
  return 'ESM';
}

function detectPathAliases(cwd) {
  const tsconfigPath = join(cwd, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) return false;
  try {
    const content = readFileSync(tsconfigPath, 'utf8');
    const tsconfig = JSON.parse(content);
    return !!(tsconfig.compilerOptions?.paths && Object.keys(tsconfig.compilerOptions.paths).length > 0);
  } catch {
    return false;
  }
}

function detectArchPatterns(files) {
  const patterns = [];
  const allNames = files.map((f) => basename(f)).join(' ');

  if (/\.controller\.(ts|js)/.test(allNames)) patterns.push('Controller pattern');
  if (/\.service\.(ts|js)/.test(allNames)) patterns.push('Service layer');
  if (/\.repository\.(ts|js)/.test(allNames)) patterns.push('Repository pattern');
  if (/\.module\.(ts|js)/.test(allNames)) patterns.push('Module pattern');
  if (/\.middleware\.(ts|js)/.test(allNames)) patterns.push('Middleware pattern');
  if (/\.guard\.(ts|js)/.test(allNames)) patterns.push('Guard pattern');
  if (/\.dto\.(ts|js)/.test(allNames)) patterns.push('DTO pattern');
  if (/\.schema\.(ts|js)/.test(allNames)) patterns.push('Schema validation');
  if (/hook\.(ts|tsx|js|jsx)|use[A-Z]/.test(allNames)) patterns.push('Custom hooks');
  if (/context\.(ts|tsx|js|jsx)/.test(allNames)) patterns.push('React Context');
  if (/store\.(ts|js)|slice\.(ts|js)/.test(allNames)) patterns.push('State store');

  return patterns;
}

function detectStateManagement(files, cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.zustand) return 'Zustand';
    if (deps['@reduxjs/toolkit'] || deps.redux) return 'Redux Toolkit';
    if (deps.jotai) return 'Jotai';
    if (deps.recoil) return 'Recoil';
    if (deps['@tanstack/react-query'] || deps['react-query']) return 'TanStack Query';
    if (deps.swr) return 'SWR';
    if (deps.mobx) return 'MobX';
  } catch {}
  return null;
}

function detectCSSApproach(files, cwd) {
  const pkgPath = join(cwd, 'package.json');
  const hasTailwind = files.some((f) => f.includes('tailwind.config'));
  if (hasTailwind) return 'Tailwind CSS';

  const hasModules = files.some((f) => f.includes('.module.css') || f.includes('.module.scss'));
  if (hasModules) return 'CSS Modules';

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['styled-components']) return 'styled-components';
      if (deps['@emotion/react'] || deps['@emotion/styled']) return 'Emotion';
    } catch {}
  }

  if (files.some((f) => f.endsWith('.scss'))) return 'SCSS';
  return 'CSS';
}
