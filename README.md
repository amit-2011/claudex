# clodex

Claude Code context layer — turns natural language into precise prompts using your codebase knowledge.

**No API key needed. Uses your own Claude Code plan.**

## What it does

1. **Setup** — Scans your project and generates `.claude/context/` files describing your architecture, stack, modules, and patterns
2. **Prompt enhancement** — `/ask` and `/plan` slash commands load the right context automatically before responding
3. **Auto-sync** — A git post-commit hook keeps context fresh as your code changes

## Quick start

```bash
# In your project directory
npx clodex@latest init
```

Then open the project in Claude Code:

```
/ask add a login page with email and password
/plan refactor the auth module to use JWT
```

## What gets created

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

## Commands

| Command | Description |
|---|---|
| `npx clodex init` | First-time setup — scan project and generate context |
| `npx clodex sync` | Re-scan after major restructuring or new modules |

## Claude Code slash commands (after init)

| Command | Description |
|---|---|
| `/ask <request>` | Natural language → proper prompt → plan → execute |
| `/plan <request>` | Generate a plan only — no execution until you approve |
| `/sync` | Trigger context sync from inside Claude Code |

## Supported stacks

- **Next.js** (App Router + Pages Router)
- **React** (Vite SPA)
- **NestJS**
- **Express**
- **Node.js** (CLI / Library)

More stacks coming soon.

## Token savings

Without clodex, Claude explores your codebase blindly — 8–12 file reads per task (~15,000–25,000 tokens).

With clodex, the right context is pre-loaded — 2–3 reads per task (~4,000–8,000 tokens). **~60–70% fewer tokens per task.**

## Context sync

The git post-commit hook auto-updates context for changed files after each commit.

For major changes (new module, big refactor), run `npx clodex sync` manually.

## License

MIT
