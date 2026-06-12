# Gemini CLI & Antigravity Support Plan — promptpilot-ai

Goal: add **Google Gemini CLI** and **Google Antigravity** as first-class AI-tool *targets*, alongside the existing **Claude Code** and **Cursor**. Same scan → context → standards → skills → commands → agents pipeline; new per-tool emitters write each tool's native config/rules/command files.

> **This is a tool-target change, not a tech-stack change.** The mobile plan added a new `framework.type`. This plan extends the orthogonal axis — `target` (which AI tool we write files *for*). Nothing in the scanner changes; only the generators and the target plumbing.

The single biggest lever: **promptpilot already writes a universal `AGENTS.md`** (see `src/generators/agents-md.js`), and the AGENTS.md prose already names Gemini CLI as a reader. Both new tools read `AGENTS.md`/`GEMINI.md`, so **baseline coverage is nearly free** — the generators only add the tool-specific niceties (native context file, scoped rules, slash commands, MCP, subagents, ignore file).

Confidence legend: **[C]** confirmed against a primary source · **[R]** a researched claim that was refuted and corrected · **[U]** unconfirmed — verify against a live build before coding.

---

## 0. The `target` model change (the spine)

Today `target` is a single string `'claude' | 'cursor' | 'both'`, threaded through every generator and branched as `target === 'claude' || target === 'both'`. `'both'` is binary and does not scale to four tools.

**Refactor `target` → a set of selected tools** and replace the binary idiom with a predicate.

| Item | Today | After |
|---|---|---|
| Value | `'claude' \| 'cursor' \| 'both'` | `string[]` e.g. `['claude','gemini']` (a `Set` internally) |
| Selection | `select(...)` single-choice (`init.js:131`) | `multiSelect` → array (Claude / Cursor / Gemini CLI / Antigravity) |
| Branch idiom | `target === 'claude' \|\| target === 'both'` | `wants(targets, 'claude')` helper |
| Detection | `detectExistingTarget()` checks `.claude`/`.cursor` | also detect `GEMINI.md`/`.gemini/`, `.agents/` |
| Persistence | implicit | persist the chosen set in `.pp-stats.json` so `sync` re-emits the same set |

`wants(targets, tool)` lives in one util; every generator call site (`writeOutputFiles`, `runMultiRepoInit`, `runUpdateContext`, skills/agents gates) swaps the string compare for it. Keep accepting the legacy `'claude'|'cursor'|'both'` strings in a `normalizeTarget()` shim so existing installs (and `detectExistingTarget`) keep working through the migration.

> Lower-risk alternative if a full refactor is undesirable: keep the string but expand the enum and add combo handling. Rejected — it makes "Claude + Gemini" unrepresentable and bloats every branch. The set refactor is the right call for 4 tools.

---

## Architecture touchpoints (shared across both new tools)

| File | Change |
|---|---|
| `src/commands/init.js` | `selectTarget()` → multi-select returning a tool set; `detectExistingTarget()` learns `gemini`/`antigravity`; `writeOutputFiles` + `runMultiRepoInit` route to the new generators via `wants()`; `maybeEnableStatusline` stays Claude-only; `maybeGenerateAgents` allows `gemini` (has subagents) but not `antigravity` (no file spec). |
| `src/generators/gemini-md.js` *(new)* | Root `GEMINI.md` (mirror of `claude-md.js`) + `@import` of per-module context. |
| `src/generators/gemini-context.js` *(new, or param `context.js`)* | Per-module context into `.gemini/context/*.md` (reuse `context.js` builders, different dir). |
| `src/generators/gemini-settings.js` *(new)* | `.gemini/settings.json` (nested v2): `context.fileName`, `mcpServers` scaffold, tool approval. Merge-preserving like `settings.js`. |
| `src/generators/gemini-commands.js` *(new)* | Transpile `templates/commands/*.md` → `.gemini/commands/*.toml` (`{{args}}`, not `$ARGUMENTS`). |
| `src/generators/antigravity-rules.js` *(new, Phase 2)* | `.agents/rules/*.md` glob-scoped rules (reuse `cursor-rules.js` per-module glob logic). |
| `src/generators/antigravity-workflows.js` *(new)* | `.agents/workflows/*.md` (Markdown, free-text args). |
| `src/generators/agents.js` | Also emit `.gemini/agents/*.md` (MD + YAML frontmatter — near 1:1 with `.claude/agents/`); gate on `wants(targets,'gemini')`. |
| `src/generators/agents-md.js` | Update the reader list prose to add Antigravity; for Gemini note AGENTS.md is opt-in (wired via `context.fileName`). |
| `src/generators/skills.js` | Add a Gemini skill writer (`.gemini/skills/<name>/SKILL.md`); optionally `.agents/skills/` for Antigravity (path **[U]**). |
| `src/utils/stats-cache.js` | `cacheDir()`/`writeStatsCache()` learn `.gemini` (ext `.md`) and the persisted target set. |
| `src/utils/version-check.js` | Optional Gemini/Antigravity update-notice file analog to the Cursor `.mdc` notice. |
| `bin/cli.js` | `--help` text + banner copy mention the new tools. |
| `src/commands/help.js`, `src/commands/stats.js` | User-facing strings that enumerate Claude/Cursor extend to 4 tools. |

**Zero-new-dependency note:** TOML for Gemini commands is *emitted*, never parsed — a small string builder (multi-line `prompt = """…"""` + escaping) suffices, consistent with the no-runtime-deps promise.

---

## TOOL 1 — Gemini CLI — effort **M** (first-class target `'gemini'`)

High confidence; conventions confirmed against `google-gemini/gemini-cli` main-branch docs.

### What Gemini reads

| Capability | Gemini CLI file | Notes |
|---|---|---|
| Root context (≈ CLAUDE.md) | `GEMINI.md` (project root; `~/.gemini/GEMINI.md` global) | Markdown, hierarchical concat, **[C]** |
| Per-module context (≈ `.claude/context/`) | dir-placed `GEMINI.md` **or** root `GEMINI.md` with `@./path.md` imports | `@import` in-body, relative/absolute, **[C]** |
| Scoped glob rules (≈ `.cursor/rules/*.mdc`) | **none** — positional/hierarchy only | no `globs:`/`alwaysApply:` system, **[C]** |
| Settings | `.gemini/settings.json` (nested v2 JSON) | precedence system→user→workspace, **[C]** |
| Context-file name override | `context.fileName` (string \| string[]) | add `"AGENTS.md"` to also read AGENTS.md, **[C]** |
| MCP | top-level `mcpServers{}` + global `mcp{}` | `command/args/env/cwd`, `url`/`httpUrl`, `includeTools`/`excludeTools`, `trust`, `timeout` 600000, **[C]** |
| Slash commands | `.gemini/commands/*.toml` | `prompt` (req) + `description`; subdir → `/ns:cmd`, **[C]** |
| Command args | `{{args}}` (**not** `$ARGUMENTS`); `!{…}` shell, `@{…}` file inject | **[C]** |
| Subagents | `.gemini/agents/*.md` (MD + YAML frontmatter) | `name`,`description`,`kind`,`tools?`,`model?` — near 1:1 w/ Claude, **[C]** |
| Skills | `.gemini/skills/<n>/SKILL.md` (+ `.agents/skills/` alias) | SKILL.md format ≈ Claude's, **[C]** |
| Ignore | `.geminiignore` (`.gitignore`-style) | **[C]** |
| Native AGENTS.md | **opt-in only** — add to `context.fileName` | maintainers **declined** making it default (**[R]**, tracker closed "not planned") |
| Status line | **none scriptable** (only `ui.footer.*` toggles) | no `statusline.js` analog — skip, **[C]** |

### Generators

1. **`gemini-md.js` + `.gemini/context/`** — clone `claude-md.js`'s marker-bounded block into `GEMINI.md`; reuse `context.js`'s `buildArchitecture/buildStack/buildPatterns/buildModule` to write `.gemini/context/{architecture,stack,patterns}.md` + `modules/*.md`, and have `GEMINI.md` pull them with `@./.gemini/context/architecture.md` … imports. Keeps the same marker/merge discipline (auto block + preserved hand edits).
2. **`gemini-settings.js`** — write/merge `.gemini/settings.json`:
   ```json
   { "context": { "fileName": ["AGENTS.md", "GEMINI.md"] },
     "mcpServers": {} }
   ```
   so AGENTS.md (already generated) is honored too. Merge-preserve existing keys exactly like `settings.js` does. Map the project package manager / test runner into a permissions hint via `tools.allowed` (e.g. `run_shell_command(git)`, `run_shell_command(<pm>)`) — **not** a Claude-style flat allowlist; **never** emit YOLO (CLI-flag-only).
3. **`gemini-commands.js`** — transpile each `templates/commands/*.md` (`ask`, `plan`, `sync`, `pp-stats`, `pp-help`) → `.gemini/commands/*.toml`: body becomes `prompt = """…"""`, first line → `description`, **rewrite `$ARGUMENTS` → `{{args}}`**, and rewrite the `.claude/context/...` path references to `.gemini/context/...` (or to `@{…}` file-injection for the load-context steps).
4. **`.geminiignore`** — emit a default mirroring our IGNORE list (`node_modules`, `dist`, `.next`, `vendor`, `__pycache__`, build dirs) so Gemini's file discovery skips noise. Create-if-absent only.
5. **Subagents** (reuse `agents.js`) — also write planner/builder/tester to `.gemini/agents/*.md` (MD + YAML frontmatter; map Claude's `tools:` list across). The `/ship` orchestrator becomes a `.gemini/commands/ship.toml` that drives the same plan→build→test delegation. Gate behind the agents opt-in, allowed for `gemini`.
6. **Skills** (extend `skills.js`) — add `writeGeminiSkill()` writing `.gemini/skills/<name>/SKILL.md` with the same frontmatter; bundled `reference.md` is supported (unlike Cursor, which inlines).

---

## TOOL 2 — Antigravity — effort **S→M, phased** (AGENTS.md adapter → first-class)

⚠️ Lower confidence. `antigravity.google/docs` is a JS-rendered SPA that resisted scraping; several first-pass claims were **refuted** by reachable primary sources (codelabs, the migration doc, release-notes). **The items marked [U] below MUST be confirmed against a live Antigravity build before coding the Phase-2 generator.**

### What Antigravity reads

| Capability | Antigravity file | Notes |
|---|---|---|
| Native rules | `AGENTS.md` (since **v1.20.3**, 2026-03-05) + `GEMINI.md` | "reads rules from AGENTS.md in addition to GEMINI.md", **[C]** |
| Global rules | `~/.gemini/GEMINI.md` | applied across workspaces, **[C]** |
| Scoped glob rules (≈ `.cursor/rules/*.mdc`) | **`.agents/rules/*.md`** (plural `.agents`) | 4 activation modes incl. **Glob** (`src/**/*.ts`) — a real Cursor analog, **[R→C]** (mode set); frontmatter keys **[U]** |
| Rule size limit | 12,000 chars/file | **[C]** |
| Slash commands → **"Workflows"** | `.agents/workflows/*.md` (workspace) · `~/.gemini/antigravity/global_workflows/` | Markdown; filename = command; YAML frontmatter w/ `description`; `// turbo` auto-run, **[C]**; plural dir default **[U]** |
| Workflow args | free-text after name; **no confirmed `$ARGUMENTS`/`$1`** | emit free-text-arg workflows, **[U]** |
| MCP | **`~/.gemini/config/mcp_config.json`** | `serverUrl` (not `url`/`httpUrl`), **no** top-level `timeout`, `disabled`, `authProviderType`, **[R]** path / **[U]** schema |
| Subagents | **none** (Agent Manager / Mission Control is a runtime **UI**, no file spec) | do **not** build a subagent generator, **[U]** |
| Skills | `.agents/skills/` *or* `~/.gemini/skills` *or* `~/.gemini/antigravity/skills` | path ambiguous, **[U]** |
| Ignore | **none** Antigravity-specific; `.gitignore` respected (`.geminiignore` is **not**) | **[C]** |
| Permissions | no declarative file — UI approval + `// turbo` / `// turbo-all` | **[C/partial]** |
| Status line | none documented | skip |

### Phasing

- **Phase 1 (effort S) — AGENTS.md + Workflows adapter.** Because Antigravity natively reads our already-generated `AGENTS.md`, the minimum viable target is: (a) keep emitting `AGENTS.md` (no change — update the reader-list prose), and (b) `antigravity-workflows.js` writes `.agents/workflows/*.md` by transforming `templates/commands/*.md` to Markdown workflows (drop `$ARGUMENTS`, pass request as free text, optionally seed a `// turbo` line for the sync workflow). This ships real value with only confirmed facts.
- **Phase 2 (effort M, gated on live verification) — first-class `'antigravity'`.** Add `antigravity-rules.js` emitting `.agents/rules/*.md` glob-scoped rules (reuse `cursor-rules.js`'s per-module `globs` logic; map our `globs`/`alwaysApply` to Antigravity's `trigger`/`globs` frontmatter), MCP scaffold at `~/.gemini/config/mcp_config.json` (`serverUrl`, no `timeout`), and skills under the confirmed skills path. **No subagent generator, no ignore file, no status line.**

> Do **not** share the Gemini CLI generator with Antigravity despite both using `GEMINI.md` — their MCP schemas (`serverUrl` vs `httpUrl`/`url`), command formats (MD Workflows vs TOML), rules systems (glob `.agents/rules` vs none), and ignore behavior diverge.

---

## Skills & multi-agent — per tool

| Feature | Claude | Cursor | Gemini CLI | Antigravity |
|---|---|---|---|---|
| Project skills (`design`/`devops`/`db`/`mobile`) | `.claude/skills/<n>/SKILL.md` | `.cursor/rules/<n>.mdc` | `.gemini/skills/<n>/SKILL.md` **[C]** | `.agents/skills/` *(path [U])* |
| Multi-agent pipeline (planner/builder/tester + ship) | `.claude/agents/*.md` + `/ship` skill | — (no equivalent) | `.gemini/agents/*.md` + `ship.toml` **[C]** | **none — Agent Manager is UI-only** |

`generateSkills()` grows a `writeGeminiSkill()`; `generateAgents()` adds a `.gemini/agents/` writer (the `target !== 'claude'` early-return becomes `!wants(targets,'claude') && !wants(targets,'gemini')`). Antigravity stays out of the agents path.

---

## Phasing & releases

| Phase | Scope | Effort | Release |
|---|---|---|---|
| 0 | `target` set refactor + `wants()` + multi-select + detection/persistence | S | v0.10.0 |
| 1 | Gemini CLI: `GEMINI.md` + `.gemini/context/` + `.gemini/settings.json` + `.geminiignore` | M | v0.10.0 |
| 2 | Gemini CLI: `.gemini/commands/*.toml` transpiler + `.gemini/agents/` + `.gemini/skills/` | M | v0.11.0 |
| 3 | Antigravity Phase 1: AGENTS.md reader-prose + `.agents/workflows/*.md` | S | v0.11.0 |
| 4 | Antigravity Phase 2: `.agents/rules/*.md` glob rules + MCP scaffold + skills *(after live verification)* | M | v0.12.0 |

Each phase = generator(s) + target plumbing + fixtures/tests, then publish. Phase 0 lands with Phase 1 so the multi-select ships meaningfully.

---

## Testing strategy

Fixture mini-projects under a test harness (reuse the existing scan fixtures). For each target, assert the **emitted files exist with the right paths and shape**:

- **Gemini:** `GEMINI.md` has the marker block + `@import` lines; `.gemini/settings.json` is valid JSON with `context.fileName` including `AGENTS.md`; `.gemini/commands/ask.toml` parses as TOML, has `prompt`/`description`, contains `{{args}}` and **zero** `$ARGUMENTS`; `.gemini/agents/planner.md` has valid YAML frontmatter; `.geminiignore` present.
- **Antigravity:** `.agents/workflows/sync.md` is Markdown with `description:` frontmatter and no `$ARGUMENTS`; (Phase 2) `.agents/rules/<module>.md` carries a glob trigger; AGENTS.md unchanged but reader-prose lists Antigravity.
- **Cross-target:** `target = ['claude','gemini']` emits both trees and a single shared `AGENTS.md`; `sync` re-emits exactly the persisted set; idempotency (running twice changes nothing); merge-preserve (hand edits outside markers / extra settings keys survive).

Run the adversarial-review workflow before each release. **Before coding Phase 4**, run a live-build verification pass on every Antigravity **[U]** item below.

---

## Key decisions / risks

- **`target` becomes a set, not a string.** One-time churn at every `target === …` site; mitigated by a `wants()` helper + `normalizeTarget()` back-compat shim. The clean foundation for 4+ tools.
- **AGENTS.md does the heavy lifting.** Both new tools read it (Gemini opt-in via `context.fileName`; Antigravity natively since v1.20.3), so generators are additive niceties, not the core value — de-risks the whole effort.
- **Gemini commands are TOML + `{{args}}`, not Markdown + `$ARGUMENTS`.** The transpiler is the one genuinely new piece of logic; keep it a pure string builder (no TOML dep).
- **Gemini has no glob-scoped rules; Antigravity does.** Per-module scoping for Gemini is positional (`@import` from root `GEMINI.md`); for Antigravity it maps onto `.agents/rules/*.md`.
- **No Antigravity subagents, ignore file, or status line.** Don't build generators for capabilities that have no file spec.
- **Antigravity docs are a non-scrapable SPA.** Phase the work so Phase 1 ships on confirmed facts only; gate Phase 2 behind live verification.

### Open items to verify before coding Antigravity Phase 2

1. ~~**[U]** `.agents` (plural) vs `.agent` (singular) for rules/workflows/skills~~ **RESOLVED (June 2026): it is `.agent` — SINGULAR.** The official rules-workflows docs and live builds read `.agent/rules/` + `.agent/workflows/`; v0.10.0 shipped with `.agents` (plural) and its workflows were invisible (the "/plan, /sync not showing" bug). Fixed + auto-migration in `migrateLegacyAgentsDir()`. Caution: `.agents` (plural) is the workspace dir of the separate **Antigravity CLI** (the Gemini CLI successor, May 2026) — the two products use different dirs.
2. **[U]** MCP config path `~/.gemini/config/mcp_config.json` and its schema (`serverUrl`, no `timeout`, `disabled`, `authProviderType`) — secondary sources only; confirm via the in-app "Open MCP Config" button.
3. **[U]** `.agents/rules/*.md` frontmatter key names (`trigger:` / `globs:`) and the four activation modes.
4. **[U]** AGENTS.md precedence vs GEMINI.md, nested-AGENTS.md opt-in, and any global `~/.gemini/AGENTS.md` — only "reads AGENTS.md in addition to GEMINI.md" is primary.
5. **[U]** Workflow argument-injection syntax — none confirmed; emit free-text-arg workflows until proven otherwise.
6. **[U]** Skill project-scope path (`.agents/skills/` vs `~/.gemini/skills/` vs `~/.gemini/antigravity/skills/`).

---

## Cross-tool capability matrix

| Capability | Claude Code | Cursor | **Gemini CLI** | **Antigravity** |
|---|---|---|---|---|
| Root context file | `CLAUDE.md` | — (rules only) | `GEMINI.md` **[C]** | `GEMINI.md` + `AGENTS.md` **[C]** |
| Per-module / scoped rules | `.claude/context/*.md` | `.cursor/rules/*.mdc` (glob) | dir-`GEMINI.md` / `@import`; **no glob** **[C]** | `.agents/rules/*.md` (glob + 3 modes) **[R→C]** |
| Settings file | `.claude/settings.json` | — | `.gemini/settings.json` (nested) **[C]** | `~/.gemini/config/mcp_config.json` (+UI) **[R]** |
| MCP key | (settings) | — | `mcpServers` + `mcp.*`, `httpUrl`/`url` **[C]** | `mcpServers`, **`serverUrl`**, no `timeout` **[R/U]** |
| Slash commands | `.claude/commands/*.md` `$ARGUMENTS` | — | `.gemini/commands/*.toml` **`{{args}}`** **[C]** | `.agents/workflows/*.md`, free-text, `// turbo` **[C/U]** |
| Subagents | `.claude/agents/*.md` | — | `.gemini/agents/*.md` (MD+frontmatter) **[C]** | **none (UI-only)** **[U]** |
| Project skills | `.claude/skills/` | `.cursor/rules/` | `.gemini/skills/` **[C]** | `.agents/skills/` **[U]** |
| Native AGENTS.md | — | — | **opt-in** via `context.fileName` **[C]** | **native** since v1.20.3 **[C]** |
| Ignore file | — | — | `.geminiignore` **[C]** | none (uses `.gitignore`) **[C]** |
| Status line | `pp-statusline.mjs` | — | none **[C]** | none |
| Recommended target | — | — | **first-class `'gemini'`** | **AGENTS.md+adapter → first-class** |
