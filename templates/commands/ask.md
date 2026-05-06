Load project context before doing anything:

1. Read `.claude/context/architecture.md` — understand project type, structure, and modules
2. Read `.claude/context/stack.md` — understand the tech stack, package manager, and available commands
3. Read `.claude/context/patterns.md` — understand naming conventions and architectural patterns

Now analyze this request: **$ARGUMENTS**

Based on the request, identify which module(s) are involved and read the relevant file(s) from `.claude/context/modules/`.

---

## Step 1 — Restate

Restate the request as one precise technical sentence. Clarify any ambiguity based on the codebase context.

## Step 2 — Scope

List every file that will be created or modified. For each file, state what change is needed.
Before listing a new file, confirm it does not already exist by checking the module context.

## Step 3 — Plan

Write a numbered implementation plan (3–7 steps). Each step should be specific and actionable.

## Step 4 — Execute

Implement the plan step by step. Follow all rules from `.claude/context/patterns.md`:
- Match existing file naming, component naming, and import style
- Do not create components or utilities that already exist
- Use the package manager from `.claude/context/stack.md` for any installs

## Step 5 — Verify

Run the verification commands from `.claude/context/stack.md` (lint, type-check, tests).
Report the result. If any check fails, fix it before finishing.
