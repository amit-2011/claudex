import { readFileSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';

export function detectPatterns(files, cwd, stack = {}) {
  const language = stack.language;

  if (language === 'Python') return detectPythonPatterns(files, cwd, stack);
  if (language === 'PHP') return detectPhpPatterns(files, cwd, stack);
  if (language === 'Dart') return detectDartPatterns(files, stack);
  if (language === 'Kotlin' || language === 'Java') return detectKotlinPatterns(files, stack);
  if (language === 'Swift') return detectSwiftPatterns(files, stack);
  return detectJsPatterns(files, cwd); // also covers React Native (TS/JS)
}

// ──────────────────────────── Dart / Flutter ────────────────────────────
function detectDartPatterns(files, stack) {
  const n = files.join(' ');
  const p = [];
  if (stack.stateManagement) p.push(`${stack.stateManagement} state management`);
  if (/_bloc\.dart|_cubit\.dart/.test(n)) p.push('BLoC / Cubit');
  if (/repository|_repo\.dart/.test(n)) p.push('Repository pattern');
  if (/_screen\.dart|screens?\//.test(n)) p.push('Screen widgets');
  if (/widgets?\//.test(n)) p.push('Reusable widgets');
  if (/\.g\.dart|\.freezed\.dart/.test(n)) p.push('Code generation (freezed / json_serializable)');
  return {
    fileNaming: 'snake_case',
    componentNaming: 'PascalCase (widgets / classes)',
    importStyle: "package: imports (relative within lib/)",
    hasPathAliases: false,
    patterns: p,
    stateManagement: stack.stateManagement || null,
    cssApproach: 'Flutter widgets (Material / Cupertino theming)',
  };
}

// ──────────────────────────── Kotlin / Java (Android) ────────────────────────────
function detectKotlinPatterns(files, stack) {
  const n = files.join(' ');
  const p = [];
  if (stack.uiLibrary?.includes('Compose')) p.push('Jetpack Compose UI');
  else if (stack.uiLibrary) p.push('XML layouts');
  if (/ViewModel\.(kt|java)|viewmodel/i.test(n)) p.push('MVVM (ViewModel + StateFlow/LiveData)');
  if (/Repository\.(kt|java)|repository/i.test(n)) p.push('Repository pattern');
  if (/UseCase\.(kt|java)|usecase/i.test(n)) p.push('Use cases (Clean Architecture)');
  if (/Dao\.(kt|java)|\/dao\//i.test(n)) p.push('Room DAOs');
  if (/Module\.(kt|java)/.test(n)) p.push('Hilt / Dagger modules');
  return {
    fileNaming: 'PascalCase (files match the public type)',
    componentNaming: 'PascalCase (classes), camelCase (functions)',
    importStyle: 'package imports',
    hasPathAliases: false,
    patterns: p,
    stateManagement: stack.stateManagement || null,
    cssApproach: stack.uiLibrary || null,
  };
}

// ──────────────────────────── Swift (iOS) ────────────────────────────
function detectSwiftPatterns(files, stack) {
  const n = files.join(' ');
  const p = [];
  if (stack.uiLibrary === 'SwiftUI') p.push('SwiftUI views');
  else if (stack.uiLibrary === 'UIKit') p.push('UIKit (UIViewController)');
  if (/ViewModel\.swift|viewmodel/i.test(n)) p.push('MVVM (ObservableObject / @Observable)');
  if (/Coordinator\.swift/.test(n)) p.push('Coordinator navigation');
  if (/Repository\.swift|repository/i.test(n)) p.push('Repository pattern');
  if (/Service\.swift|\/Services\//.test(n)) p.push('Service layer');
  return {
    fileNaming: 'PascalCase (files match the primary type)',
    componentNaming: 'PascalCase (types), camelCase (methods / properties)',
    importStyle: 'import modules',
    hasPathAliases: false,
    patterns: p,
    stateManagement: stack.stateManagement || null,
    cssApproach: stack.uiLibrary || null,
  };
}

// ──────────────────────────── JavaScript / TypeScript ────────────────────────────
function detectJsPatterns(files, cwd) {
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

// ──────────────────────────── Python ────────────────────────────
function detectPythonPatterns(files, cwd, stack) {
  const sourceFiles = files.filter((f) => f.endsWith('.py'));
  const names = sourceFiles.map((f) => basename(f, '.py'));
  const snake = names.filter((n) => /^[a-z][a-z0-9_]*$/.test(n)).length;
  const fileNaming = snake >= names.length * 0.5 ? 'snake_case' : 'mixed';

  return {
    fileNaming,
    componentNaming: 'PascalCase (classes), snake_case (functions)',
    importStyle: 'PEP 8 imports (stdlib → third-party → local)',
    hasPathAliases: false,
    patterns: detectPythonArchPatterns(sourceFiles, stack),
    stateManagement: null,
    cssApproach: null,
  };
}

function detectPythonArchPatterns(files, stack) {
  const patterns = [];
  const names = files.map((f) => basename(f)).join(' ');
  const fw = stack.framework?.name || '';

  if (fw.startsWith('Django')) {
    if (/\bmodels\.py/.test(names)) patterns.push('Django models (ORM)');
    if (/\bviews\.py/.test(names)) patterns.push('Django views');
    if (/\bserializers\.py/.test(names)) patterns.push('DRF serializers');
    if (/\burls\.py/.test(names)) patterns.push('URL routing (urls.py)');
    if (/\badmin\.py/.test(names)) patterns.push('Django admin');
    if (/\bforms\.py/.test(names)) patterns.push('Django forms');
    if (/\btasks\.py/.test(names)) patterns.push('Celery tasks');
  } else if (fw === 'FastAPI' || fw === 'Starlette') {
    if (/\brouters?\b|routes\.py/.test(names)) patterns.push('APIRouter modules');
    if (/\bschemas\.py|models\.py/.test(names)) patterns.push('Pydantic schemas');
    if (/\bdependencies\.py|deps\.py/.test(names)) patterns.push('Dependency injection');
    if (/\bcrud\.py/.test(names)) patterns.push('CRUD layer');
  } else if (fw === 'Flask') {
    if (/blueprint/i.test(names)) patterns.push('Flask blueprints');
    if (/\bmodels\.py/.test(names)) patterns.push('SQLAlchemy models');
  }
  if (/\bservice[s]?\.py|services\b/.test(names)) patterns.push('Service layer');
  if (/\brepositor/.test(names)) patterns.push('Repository pattern');
  if (/conftest\.py|test_/.test(names)) patterns.push('pytest fixtures');

  return patterns;
}

// ──────────────────────────── PHP / Laravel ────────────────────────────
function detectPhpPatterns(files, cwd, stack) {
  const sourceFiles = files.filter((f) => f.endsWith('.php'));

  return {
    fileNaming: 'PascalCase (classes), kebab-case (Blade views)',
    componentNaming: 'PascalCase (PSR-4 classes)',
    importStyle: 'PSR-4 namespaces (use statements)',
    hasPathAliases: detectComposerPsr4(cwd),
    patterns: detectPhpArchPatterns(sourceFiles, stack),
    stateManagement: null,
    cssApproach: detectLaravelCss(files, cwd),
  };
}

function detectComposerPsr4(cwd) {
  const p = join(cwd, 'composer.json');
  if (!existsSync(p)) return false;
  try {
    const composer = JSON.parse(readFileSync(p, 'utf8'));
    return !!composer.autoload?.['psr-4'];
  } catch {
    return false;
  }
}

function detectPhpArchPatterns(files, stack) {
  const patterns = [];
  const names = files.map((f) => f).join(' ');

  if (/Controller\.php/.test(names)) patterns.push('Controller pattern');
  if (/app\/Models\/|\/Models\//.test(names)) patterns.push('Eloquent models');
  if (/Request\.php/.test(names)) patterns.push('Form Request validation');
  if (/Resource\.php/.test(names)) patterns.push('API Resources');
  if (/Service\.php|\/Services\//.test(names)) patterns.push('Service layer');
  if (/Repository\.php/.test(names)) patterns.push('Repository pattern');
  if (/Middleware\.php|\/Middleware\//.test(names)) patterns.push('Middleware pattern');
  if (/Job\.php|\/Jobs\//.test(names)) patterns.push('Queued jobs');
  if (/Provider\.php|\/Providers\//.test(names)) patterns.push('Service providers');
  if (/database\/migrations\//.test(names)) patterns.push('Schema migrations');
  if (/\.blade\.php/.test(names)) patterns.push('Blade templates');
  if (/routes\/(web|api)\.php/.test(names)) patterns.push('Route files (web.php / api.php)');

  return patterns;
}

function detectLaravelCss(files, cwd) {
  const hasTailwind = files.some((f) => f.includes('tailwind.config'));
  if (hasTailwind) return 'Tailwind CSS';
  if (files.some((f) => f.endsWith('.scss'))) return 'SCSS';
  return null;
}

// ──────────────────────────── shared (JS) helpers ────────────────────────────
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
