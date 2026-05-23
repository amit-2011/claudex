<div align="center">

# 🧠 promptpilot-ai

### The AI context layer for your codebase

**Works with Claude Code · Cursor · Both**

[![npm](https://img.shields.io/npm/v/promptpilot-ai?color=blue&style=flat-square)](https://www.npmjs.com/package/promptpilot-ai)
[![license](https://img.shields.io/npm/l/promptpilot-ai?style=flat-square)](./LICENSE)
[![node](https://img.shields.io/node/v/promptpilot-ai?style=flat-square)](https://nodejs.org)

> Scan your project once → AI understands everything → no more blind file hunting

</div>

---

## 🤔 The Problem

Every time you ask Claude or Cursor to build something, it starts from zero:

```
AI: Let me look at your project structure...
AI: Reading package.json...
AI: Reading src/app/...
AI: Reading components/...
AI: Hmm, where is the auth module?
```

That's **8–12 file reads** (~25,000 tokens) just to understand context — before writing a single line of code.

---

## ✅ The Solution

Run `promptpilot-ai init` once. It scans your codebase and writes structured context files that AI tools read automatically.

```
AI: (reads .claude/context/architecture.md → knows everything)
AI: Got it. Here's the implementation plan...
```

**2–3 reads. ~6,000 tokens. Straight to the code.**

---

## 🚀 Quick Start

```bash
# In your project directory
npx promptpilot-ai@latest init
```

You'll be asked which AI tool you're using:

```
? Which AI tool are you using?
  ❯ Claude Code
    Cursor
    Both
```

That's it. Open your project in Claude or Cursor — context is loaded automatically.

---

## 🗂️ What Gets Generated

### For Claude Code

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

### For Cursor

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

> 💡 Cursor's `.mdc` rules use `alwaysApply: true` for global context and file-glob matching for module-level context — so you only pay for what's relevant.

---

## 🏗️ Multi-Repo Workspace (Frontend + Backend)

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

## 📊 Token Savings

| | Without promptpilot-ai | With promptpilot-ai |
|---|---|---|
| **File reads per task** | 8–12 | 2–3 |
| **Tokens per task** | ~25,000 | ~6,000 |
| **Savings** | — | **~70% fewer tokens** |
| **Multi-repo cross-lookup** | Manual, many reads | Auto via bridge.md |

---

## ⚡ Commands

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

---

## 🛠️ Supported Stacks

| Category | Supported |
|---|---|
| **Frontend** | Next.js (App + Pages Router), React (Vite), Vue, Svelte, Astro, Remix |
| **Backend** | NestJS, Express, Fastify, Hono, Koa |
| **Languages** | TypeScript, JavaScript |
| **Databases** | PostgreSQL, MySQL, MongoDB, SQLite |
| **ORMs** | Prisma, Drizzle, TypeORM |
| **Package Managers** | pnpm, npm, yarn |
| **Testing** | Vitest, Jest |

---

## 🔄 Keeping Context Fresh

| Trigger | What happens |
|---|---|
| `git commit` | Post-commit hook auto-updates changed modules |
| New module or endpoint | Run `npx promptpilot-ai sync` manually |
| Major refactor | Run `npx promptpilot-ai sync` manually |

---

## 🔔 Staying Updated

promptpilot-ai checks npm once a day (throttled, opt-out via `NO_UPDATE_NOTIFIER=1` or `CI=1`) and surfaces new versions in three places:

| Where | How you see it |
|---|---|
| **Terminal** | Rounded banner on stderr after any `promptpilot-ai` command (only in interactive terminals, not pipes/CI) |
| **Claude Code** | The existing `SessionStart` hook prints a one-line notice into Claude's context — Claude mentions it at the start of your first response |
| **Cursor** | A temporary `.cursor/rules/_promptpilot-update.mdc` is auto-generated with `alwaysApply: true` so Cursor surfaces it the next time you chat |

After upgrading the package (`npm i -g promptpilot-ai`), run:

```bash
npx promptpilot-ai sync --templates
```

This refreshes the slash command templates in your project, clears the notice file, and resets the cache. Zero runtime dependencies — version check uses native `fetch` only.

---

## ❓ FAQ

**Do I need an API key?**
No. Uses your existing Claude Code plan or Cursor subscription — no extra API keys.

**Does it work without git?**
Yes. Without `.git`, the filesystem is walked directly (skipping `node_modules`, `dist`, `.next`, etc.).

**Can I use it with both Claude and Cursor?**
Yes — select "Both" during init. It generates `.claude/` and `.cursor/rules/` simultaneously.

**Is it safe to commit the generated files?**
Yes, commit them. Teammates get context immediately without running init themselves.

---

## 📄 License

MIT

