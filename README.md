<div align="center">

# promptpilot-ai

### AI context layer for your codebase

**Works with Claude Code · Cursor · Both**

[![npm](https://img.shields.io/npm/v/promptpilot-ai?color=blue&style=flat-square)](https://www.npmjs.com/package/promptpilot-ai)
[![license](https://img.shields.io/npm/l/promptpilot-ai?style=flat-square)](./LICENSE)
[![node](https://img.shields.io/node/v/promptpilot-ai?style=flat-square)](https://nodejs.org)

</div>

![promptpilot-ai hero](https://cdn.jsdelivr.net/npm/promptpilot-ai/assets/hero.png)

<div align="center">

> Scan your project once → AI understands everything → no more blind file hunting

</div>

---

## The Pitch

Every AI coding task starts the same way: Claude or Cursor reads 8–12 files to "understand" your project before writing useful code. That's **~25,000 tokens spent on context-hunting**, every single task.

`promptpilot-ai` scans your codebase **once** and writes structured markdown context files that Claude Code and Cursor read automatically.

| | Without promptpilot-ai | With promptpilot-ai |
|---|---|---|
| File reads per task | 8–12 | 2–3 |
| Tokens per task | ~25,000 | ~6,000 |
| Savings | — | **70% fewer tokens** |
| Multi-repo cross-lookup | Manual, many reads | Auto via `bridge.md` |

---

## Quick Start

```bash
npx promptpilot-ai@latest init
```

Pick your AI tool and you're done:

```
? Which AI tool are you using?
  ❯ Claude Code
    Cursor
    Both
```

Open your project in Claude Code or Cursor — context loads automatically.

![promptpilot-ai terminal demo](https://cdn.jsdelivr.net/npm/promptpilot-ai/assets/terminal-demo.png)

---

## How It Works

```mermaid
flowchart LR
    A[Your Codebase] -->|scan once| B[promptpilot-ai]
    B -->|generates| C[.claude/context/<br/>.cursor/rules/]
    C -->|auto-loaded by| D[Claude Code / Cursor]
    D -->|~6K tokens per task| E[Faster, cheaper AI]
```

1. **Scan** — walks your project, detects stack, modules, naming patterns
2. **Generate** — writes structured markdown context files (architecture, stack, patterns, per-module)
3. **AI reads** — Claude Code / Cursor auto-load context before any task

---

## What Gets Generated

<details>
<summary><strong>For Claude Code</strong></summary>

```
your-project/
├── CLAUDE.md                        ← context index (auto-loaded by Claude)
├── .claude/
│   ├── settings.json                ← permissions pre-configured
│   ├── commands/
│   │   ├── ask.md                   ← /ask slash command
│   │   ├── plan.md                  ← /plan slash command
│   │   └── sync.md                  ← /sync slash command
│   └── context/
│       ├── architecture.md          ← project structure
│       ├── stack.md                 ← tech stack & commands
│       ├── patterns.md              ← naming & code conventions
│       └── modules/
│           ├── auth.md
│           ├── components.md
│           └── ...
└── .git/hooks/post-commit           ← auto-sync on commit
```

</details>

<details>
<summary><strong>For Cursor</strong></summary>

```
your-project/
└── .cursor/
    └── rules/
        ├── architecture.mdc         ← always loaded (alwaysApply: true)
        ├── stack.mdc                ← always loaded
        ├── patterns.mdc             ← always loaded
        └── modules/
            ├── auth.mdc             ← loaded when you open auth files
            ├── components.mdc       ← loaded when you open component files
            └── ...
```

Cursor's `.mdc` rules use `alwaysApply: true` for global context and file-glob matching for module-level context — so you only pay for what's relevant.

</details>

---

## Multi-Repo Workspace (Frontend + Backend)

```
your-workspace/        ← run init here
  backend/             ← NestJS / Express
  frontend/            ← Next.js / React
```

```bash
cd your-workspace
npx promptpilot-ai@latest init
```

promptpilot-ai auto-detects both repos and generates a **bridge map**:

```markdown
## Endpoint Map

| Method | Path        | Frontend File               | Backend File                    | Handler   |
|--------|-------------|-----------------------------|---------------------------------|-----------|
| GET    | /users      | src/app/users/page.tsx      | src/users/users.controller.ts   | findAll() |
| POST   | /auth/login | src/app/auth/login/page.tsx | src/auth/auth.controller.ts     | login()   |
```

Now when you say `/ask add a user profile page`, AI reads `bridge.md`, finds the matching endpoint, and implements **both** frontend and backend in one pass.

---

## Commands

### CLI

| Command | Description |
|---|---|
| `npx promptpilot-ai init` | First-time setup — scan project and generate context |
| `npx promptpilot-ai sync` | Re-scan after major restructuring or new modules |
| `npx promptpilot-ai sync --templates` | Also refresh `.claude/commands/*.md` slash command templates (use after a promptpilot-ai upgrade) |

### Claude Code Slash Commands (after init)

| Command | Description |
|---|---|
| `/ask <request>` | Natural language → plan → execute (cross-repo aware) |
| `/plan <request>` | **Interactive planning** — detects UI vs backend, shows 2–3 layout approaches as ASCII mockups for you to pick, then delivers the final plan with reusable-component reuse enforced |
| `/sync` | Trigger a context sync from inside Claude Code |

> All slash commands respond in the same language you write your request in (English, Hindi, Hinglish, Spanish, etc.). Code, paths, and identifiers stay in English.

---

## Supported Stacks

| Category | Supported |
|---|---|
| **Frontend** | Next.js (App + Pages Router), React (Vite), Vue, Svelte, Astro, Remix |
| **Backend (Node)** | NestJS, Express, Fastify, Hono, Koa |
| **Backend (PHP)** | Laravel, Lumen, Symfony |
| **Backend (Python)** | Django, Django REST Framework, FastAPI, Flask |
| **Languages** | TypeScript, JavaScript, PHP, Python |
| **Databases** | PostgreSQL, MySQL, MongoDB, SQLite |
| **ORMs** | Prisma, Drizzle, TypeORM, Eloquent, Django ORM, SQLAlchemy, SQLModel, Tortoise |
| **Package Managers** | pnpm, npm, yarn · Composer · pip, Poetry, Pipenv, uv |
| **Testing** | Vitest, Jest · PHPUnit, Pest · pytest, unittest |

> **Cross-language bridge:** a JS/TS frontend (Next.js/React) paired with a Laravel or Python backend is auto-detected in multi-repo workspaces — `bridge.md` maps frontend `fetch`/`axios` calls to Laravel `Route::` / FastAPI / Flask / Django endpoints.

---

## Keeping Context Fresh

| Trigger | What happens |
|---|---|
| `git commit` | Post-commit hook auto-updates changed modules |
| New module or endpoint | Run `npx promptpilot-ai sync` manually |
| Major refactor | Run `npx promptpilot-ai sync` manually |
| promptpilot-ai upgrade | Run `npx promptpilot-ai sync --templates` to refresh slash commands |

promptpilot-ai checks npm for new versions once a day (throttled, opt-out via `NO_UPDATE_NOTIFIER=1` or `CI=1`) and surfaces updates in your terminal, inside Claude Code via `SessionStart`, and in Cursor via an auto-generated `.cursor/rules/_promptpilot-update.mdc`.

---

## FAQ

**Do I need an API key?**
No. Uses your existing Claude Code plan or Cursor subscription — no extra API keys.

**Does it work without git?**
Yes. Without `.git`, the filesystem is walked directly (skipping `node_modules`, `dist`, `.next`, etc.).

**Can I use it with both Claude and Cursor?**
Yes — select "Both" during init. It generates `.claude/` and `.cursor/rules/` simultaneously.

**Is it safe to commit the generated files?**
Yes, commit them. Teammates get context immediately without running init themselves.

---

## License

MIT
