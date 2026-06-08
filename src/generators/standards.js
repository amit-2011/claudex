// Stack-adaptive MANDATORY engineering standards, baked into every generated
// context file (AGENTS.md, CLAUDE.md, patterns.md, patterns.mdc) so the AI is
// held to the project's rules: no duplicate code, common functions, lint rules,
// backend API performance, and frontend UI consistency.

function langRule(language) {
  if (language === 'TypeScript') return 'TypeScript strict mode — no `any` / `unknown` / `object`; always use explicit types; no unused vars.';
  if (language === 'JavaScript') return 'Keep ESLint clean; consistent ESM imports; document public APIs.';
  if (language === 'Python') return "Follow PEP 8 with type hints; pass the project's configured linter and formatter.";
  if (language === 'PHP') return 'Follow PSR-12 conventions (`declare(strict_types=1)`, typed params and returns).';
  if (language === 'Dart') return 'Follow Dart style; pass `dart analyze` and `dart format`; prefer `const` constructors.';
  if (language === 'Kotlin') return 'Follow Kotlin conventions; pass ktlint/detekt; embrace null-safety and immutability.';
  if (language === 'Java') return 'Follow standard Java conventions; keep the linter clean; null-safe, final where possible.';
  if (language === 'Swift') return 'Follow the Swift API Design Guidelines; pass swiftlint/swiftformat; use value types where sensible.';
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
  if (stack.framework?.type === 'mobile') return buildMobileStandards(scanData, { compact });
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

// ── mobile (React Native / Expo / Flutter / Android / iOS) ───────────
function buildMobileStandards(scanData, { compact }) {
  const { stack = {}, patterns = {}, modules = [] } = scanData || {};
  const name = stack.framework?.name || 'mobile';
  const isRN = name === 'React Native' || name === 'Expo';
  const isFlutter = name === 'Flutter';
  const isAndroid = name === 'Android';
  const isIos = name === 'iOS';

  const lint = stack.commands?.lint;
  const lintRef = lint ? `\`${lint}\`` : 'the project linter';
  const uiMods = modules.filter((m) => ['ui', 'routes'].includes(m.type) && m.path);
  const uiMod = uiMods.find((m) => /component|widget|\bui\b/i.test(m.path)) || uiMods[0];
  const uiPath = uiMod ? `\`${uiMod.path}\`` : 'the shared components/widgets directory';
  const styling = patterns.cssApproach || stack.uiLibrary || 'the project styling approach';
  const store = stack.database || 'the platform secure/local storage';
  const state = patterns.stateManagement || stack.stateManagement || 'a single, consistent state-management approach';

  const isCompose = isAndroid && !!stack.uiLibrary?.includes('Compose');
  const isUIKit = isIos && stack.uiLibrary === 'UIKit';
  const list = isRN ? 'FlatList / FlashList' : isFlutter ? 'ListView.builder / Sliver lists' : isAndroid ? 'LazyColumn / RecyclerView' : isIos ? 'List / UITableView / UICollectionView' : 'a virtualized list';
  const memo = isRN ? 'React.memo, useMemo/useCallback, stable list keys'
    : isFlutter ? 'const widgets and selective rebuilds (select / Consumer)'
    : isAndroid ? (isCompose ? '@Stable/@Immutable, remember, derivedStateOf' : 'the ViewHolder pattern + DiffUtil; keep onBindViewHolder light')
    : isIos ? (isUIKit ? 'cell reuse (dequeueReusableCell) + diffable data sources; keep cellForRow light' : 'value types and tightly-scoped @State/@Observable')
    : 'memoization';
  const off = isRN ? 'keep work off the JS thread (InteractionManager / background tasks)' : isFlutter ? 'use isolates / compute() for heavy work' : isAndroid ? 'use coroutines + Dispatchers.IO (never block the main thread)' : isIos ? 'use async/await off the main actor (Task)' : 'offload heavy work off the UI thread';
  const conv = isAndroid ? 'Material 3' : isIos ? 'Apple HIG' : 'Material (Android) + Apple HIG (iOS)';
  const sr = isAndroid ? 'TalkBack' : isIos ? 'VoiceOver' : 'TalkBack & VoiceOver';
  const term = isFlutter ? 'widgets' : (isAndroid && stack.uiLibrary?.includes('Compose')) ? 'composables' : isIos ? 'views' : 'components';

  if (compact) {
    return [
      '- **No duplicate code** — reuse an existing widget/component or extract a shared one; never copy-paste.',
      `- **Use common ${term}**; code must pass ${lintRef}. ${langRule(stack.language)}`,
      `- **Mobile performance (mandatory):** virtualize lists (${list}), avoid needless re-renders (${memo}), ${off}, cache images, target 60fps.`,
      `- **UI consistency (mandatory):** reuse ${term} from ${uiPath}, ${styling} only, follow ${conv}, accessible (${sr}) + responsive (safe areas, dark mode).`,
      `- **State & data:** use ${state}; persist via ${store}; handle offline + loading/error states.`,
    ].join('\n');
  }

  return [
    '## Mandatory standards',
    '',
    'These are **non-negotiable**. Every change MUST comply before it is considered done.',
    '',
    '### Always',
    '- **No duplicate code** — reuse an existing implementation or extract a shared helper; never copy-paste.',
    `- **Use common / shared ${term}** — prefer existing ones; put new shared UI/logic in ${uiPath} or a shared module.`,
    `- **Lint & format** — code MUST pass ${lintRef} with zero errors. ${langRule(stack.language)}`,
    '- **Tests** — do not break existing tests; add tests for new behavior.',
    '- **Security** — never hardcode secrets/keys/tokens; validate all external input; keep sensitive data in the secure store (Keychain / Keystore), not plain storage.',
    '',
    '### Performance (mandatory)',
    `- Virtualize long lists with ${list} — never render large lists eagerly.`,
    `- Avoid unnecessary re-renders / rebuilds: ${memo}.`,
    `- Never block the UI / main thread — ${off}.`,
    '- Cache and right-size images; lazy-load heavy screens; keep frames at 60fps (avoid jank).',
    '',
    '### UI consistency (mandatory)',
    `- REUSE the design-system ${term} from ${uiPath}; do not recreate them. Use ${styling} only — no ad-hoc styles or a second styling system.`,
    `- Follow platform conventions (${conv}); respect safe areas / notches, dark mode, and dynamic type.`,
    '- Responsive across device sizes and orientation.',
    `- Accessibility: label every control, logical focus order, sufficient contrast, and screen-reader support (${sr}).`,
    '',
    '### State & data',
    `- Manage state with ${state}; avoid ad-hoc global state.`,
    `- Persist via ${store}; design for offline with explicit loading / error / empty states.`,
    '',
    '### Platform correctness',
    '- Request and handle permissions properly; handle app lifecycle & background/foreground transitions; support deep links and restore navigation state.',
  ].join('\n');
}
