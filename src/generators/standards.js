// Stack-adaptive MANDATORY engineering standards, baked into every generated
// context file (AGENTS.md, CLAUDE.md, patterns.md, patterns.mdc) so the AI is
// held to the project's rules: no duplicate code, common functions, lint rules,
// backend API performance, and frontend UI consistency.

function langRule(language) {
  if (language === 'TypeScript') return 'TypeScript strict mode — no `any` / `unknown` / `object`; always use explicit types; no unused vars.';
  if (language === 'JavaScript') return 'Keep ESLint clean; consistent ESM imports; document public APIs.';
  if (language === 'Python') return "Follow PEP 8 with type hints; pass the project's configured linter and formatter.";
  if (language === 'PHP') return 'Follow PSR-12 conventions (`declare(strict_types=1)`, typed params and returns).';
  return 'Follow the project lint/format rules.';
}

// Redis (and other pure cache/KV stores) is not a "backend database" signal.
const isCacheOnly = (db) => db === 'Redis';

function realDatabase(stack) {
  return stack.database && !isCacheOnly(stack.database) ? stack.database : null;
}

export function detectSides(scanData) {
  const { stack = {}, modules = [] } = scanData || {};
  const ft = stack.framework?.type;
  // NOTE: do NOT use patterns.cssApproach as a frontend signal — the detector
  // defaults it to "CSS" for any JS/TS project, so it is always truthy.
  const hasFrontend =
    ['fullstack', 'spa'].includes(ft) ||
    modules.some((m) => ['ui', 'routes'].includes(m.type)) ||
    !!stack.uiLibrary;
  const hasBackend =
    ['fullstack', 'api'].includes(ft) ||
    modules.some((m) => ['api', 'database'].includes(m.type)) ||
    !!stack.orm ||
    !!realDatabase(stack);
  return { hasFrontend, hasBackend };
}

function hasPersistence(scanData) {
  const { stack = {}, modules = [] } = scanData || {};
  return !!(stack.orm || realDatabase(stack) || modules.some((m) => m.type === 'database'));
}

function dataAccessRule(stack) {
  const orm = stack.orm;
  const isDocument = orm === 'Mongoose' || stack.database === 'MongoDB';
  if (isDocument) {
    return `**Data access** — go through ${orm || 'the document store'}: avoid unbounded queries, project only the fields you need, index every query filter, and use sessions/transactions only when an operation truly needs atomicity.`;
  }
  if (orm) {
    return `**Data access** — go through ${orm}; parameterize any raw SQL; wrap multi-step writes in transactions.`;
  }
  return '**Data access** — no ORM detected: use a single DB module with **parameterized queries** (never string-concatenate SQL); wrap multi-step writes in transactions.';
}

export function buildMandatoryStandards(scanData, { compact = false } = {}) {
  const { stack = {}, patterns = {}, modules = [] } = scanData || {};
  const { hasFrontend, hasBackend } = detectSides(scanData);
  const persistence = hasPersistence(scanData);

  const uiPath = modules.filter((m) => m.type === 'ui' && m.path).map((m) => `\`${m.path}\``)[0] || 'the shared components directory';
  const styling = patterns.cssApproach || stack.uiLibrary || 'the project styling approach';
  const lib = stack.uiLibrary || 'the existing component library';
  const lint = stack.commands?.lint;
  const lintRef = lint ? `\`${lint}\`` : 'the project linter/formatter';
  const sm = patterns.stateManagement || stack.stateManagement;

  if (compact) {
    return [
      '- **No duplicate code** — reuse an existing implementation or extract a shared helper; never copy-paste.',
      `- **Use common functions/components**; code must pass ${lintRef}. ${langRule(stack.language)}`,
      hasBackend
        ? `- **Backend:** API performance is mandatory — ${persistence ? 'no N+1 queries, paginate lists, index hot columns, ' : 'paginate, cache, never block the hot path, '}reuse the service layer, validate every input.`
        : null,
      hasFrontend
        ? `- **Frontend:** UI consistency is mandatory — reuse components from ${uiPath}, use ${styling} only, no duplicate UI, accessible + responsive.`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const universal = [
    '**No duplicate code** — search for an existing implementation before writing new code; reuse it or extract a shared helper. Never copy-paste logic.',
    '**Use common / shared code** — prefer existing utilities, helpers, and components; put new shared logic in the shared utils/lib module so it is reused, not re-implemented.',
    `**Lint & format** — code MUST pass ${lintRef} with zero errors before it is done. ${langRule(stack.language)}`,
    `**Conventions** — match file naming (${patterns.fileNaming || 'the existing convention'}) and import style (${patterns.importStyle || 'the existing style'})${patterns.hasPathAliases ? '; use the configured path aliases instead of deep relative imports' : ''}.`,
    '**Tests** — do not break existing tests; add tests for new behavior.',
    '**Security** — never hardcode secrets, keys, or tokens (use environment variables); validate and sanitize all external input.',
  ];

  const perf = persistence
    ? '**API performance (mandatory)** — avoid N+1 queries (eager-load / join), paginate list endpoints, index frequently-queried columns, cache expensive reads, never block the hot path, and return only the fields the client needs.'
    : '**API performance (mandatory)** — paginate list endpoints, cache expensive work, never block the hot path, set sensible timeouts on upstream calls, and return only the fields the client needs.';

  const backend = [perf];
  if (persistence) backend.push(dataAccessRule(stack));
  backend.push('**Thin controllers** — keep business logic in services / use-cases and REUSE the existing service layer; do not duplicate business rules across endpoints.');
  backend.push('**Robust APIs** — validate every input (DTO / schema), use consistent HTTP status codes and a structured error shape, and handle errors explicitly.');

  const frontend = [
    `**UI consistency (mandatory)** — REUSE existing components from ${uiPath}; do not recreate them. Use ${lib} and ${styling} only — no ad-hoc inline styles or a second styling system.`,
    `**No duplicate UI** — extract shared components and styles into ${uiPath}; match the existing layout, spacing, and variant conventions for a consistent look and feel.`,
    '**Accessibility** — semantic HTML, a label for every input, visible keyboard focus, and sufficient color contrast.',
    `**Responsive** — mobile-first; verify at small / medium / large breakpoints.${sm ? ` Manage state via ${sm}; no ad-hoc global state.` : ''}`,
  ];

  const out = [
    '## Mandatory standards',
    '',
    'These are **non-negotiable**. Every change MUST comply before it is considered done.',
    '',
    '### Always',
    ...universal.map((r) => `- ${r}`),
  ];
  if (hasBackend) out.push('', '### Backend', ...backend.map((r) => `- ${r}`));
  if (hasFrontend) out.push('', '### Frontend', ...frontend.map((r) => `- ${r}`));
  return out.join('\n');
}
