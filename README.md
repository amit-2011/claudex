# promptpilot-ai

Claude Code context layer — turns natural language into precise prompts using your codebase knowledge.

**No API key needed. Uses your own Claude Code plan.**

## What it does

1. **Setup** — Scans your project and generates `.claude/context/` files describing your architecture, stack, modules, and patterns
2. **Prompt enhancement** — `/ask` and `/plan` slash commands load the right context automatically before responding
3. **Multi-repo coordination** — In a workspace with separate frontend and backend repos, automatically maps API calls to controllers so Claude implements both sides together
4. **Auto-sync** — A git post-commit hook keeps context fresh as your code changes

## Quick start

### Single repo

```bash
# In your project directory (git repo or not)
npx promptpilot-ai@latest init
```

Then open the project in Claude Code:

```
/ask add a login page with email and password
/plan refactor the auth module to use JWT
```

### Multi-repo workspace (backend + frontend)

No `.git` at the root? No problem. Run init from your workspace root:

```
your-workspace/        ← run init here
  backend/             ← NestJS / Express
  admin/               ← Next.js / React
```

```bash
cd your-workspace
npx promptpilot-ai@latest init
```

promptpilot-ai will:
- Auto-detect `backend/` and `admin/` from their `package.json`
- Classify each repo as frontend or backend
- Scan backend controllers/routes and frontend API calls
- Generate a **bridge map** linking frontend components to backend endpoints

Then in Claude Code:

```
/ask add a user profile page
```

Claude reads `bridge.md`, finds the matching backend endpoint, reads both files, and implements the frontend **and** backend together in one pass.

## What gets created

### Single repo

```
your-project/
  .claude/
    commands/
      ask.md         ← /ask command
      plan.md        ← /plan command
      sync.md        ← /sync command
    context/
      architecture.md
      stack.md
      patterns.md
      modules/
        auth.md
        components.md
        ...
  CLAUDE.md          ← context index (auto-updated)
  .git/hooks/post-commit  ← auto-sync hook
```

### Multi-repo workspace

```
your-workspace/
  .claude/
    commands/
      ask.md
      plan.md
      sync.md
    context/
      bridge.md      ← frontend ↔ backend API map  ← NEW
  backend/
    .claude/
      context/
        architecture.md
        stack.md
        patterns.md
        modules/
  admin/
    .claude/
      context/
        architecture.md
        stack.md
        patterns.md
        modules/
```

### bridge.md example

```markdown
## Endpoint Map (3 matched)

| Method | Path     | Frontend File                    | Backend File                        | Handler      |
|--------|----------|----------------------------------|-------------------------------------|--------------|
| GET    | /users   | src/app/users/page.tsx           | src/users/users.controller.ts       | findAll()    |
| POST   | /auth/login | src/app/auth/login/page.tsx   | src/auth/auth.controller.ts         | login()      |

## Unmatched Frontend Calls
| Method | Path          | Frontend File                    |
|--------|---------------|----------------------------------|
| DELETE | /users/:id    | src/app/users/[id]/page.tsx      |
```

## Commands

| Command | Description |
|---|---|
| `npx promptpilot-ai init` | First-time setup — scan project(s) and generate context |
| `npx promptpilot-ai sync` | Re-scan after major restructuring, new modules, or new endpoints |

## Claude Code slash commands (after init)

| Command | Description |
|---|---|
| `/ask <request>` | Natural language → proper prompt → plan → execute (cross-repo aware) |
| `/plan <request>` | Generate a plan only — no execution until you approve |
| `/sync` | Trigger context sync from inside Claude Code |

## Supported stacks

**Frontend**
- Next.js (App Router + Pages Router)
- React (Vite SPA)
- Vue, Svelte, Astro, Remix

**Backend**
- NestJS
- Express
- Fastify, Hono, Koa

**Languages**
- TypeScript, JavaScript

## No git required

Works with or without a `.git` folder. If git is present, `git ls-files` is used for fast file scanning. If not, the filesystem is walked directly (skipping `node_modules`, `dist`, `.next`, etc.).

## Token savings

Without promptpilot-ai, Claude explores your codebase blindly — 8–12 file reads per task (~15,000–25,000 tokens).

With promptpilot-ai, the right context is pre-loaded — 2–3 reads per task (~4,000–8,000 tokens). **~60–70% fewer tokens per task.**

In multi-repo mode, bridge.md eliminates the back-and-forth of finding matching controllers — Claude goes straight to the right files on both sides.

## Context sync

The git post-commit hook auto-updates context for changed files after each commit.

For major changes (new module, new API endpoint, big refactor), run `npx promptpilot-ai sync` manually.

## License

MIT
