Load project context before doing anything:

1. Read `.claude/context/architecture.md` — understand project type, structure, and modules
2. Read `.claude/context/stack.md` — understand the tech stack, package manager, and available commands
3. Read `.claude/context/patterns.md` — understand naming conventions and architectural patterns
4. **Check if `.claude/context/bridge.md` exists** — if it does, read it. It maps frontend components to backend endpoints and tells you which files to touch on both sides.

Now analyze this request: **$ARGUMENTS**

Based on the request, identify which module(s) are involved and read the relevant file(s) from `.claude/context/modules/`.

**If bridge.md exists** — determine the scope:
- **UI/frontend task**: Find the relevant rows in the Endpoint Map. Read both the frontend component file AND the backend controller file listed there. Implement both sides if needed.
- **Backend task**: Find any frontend files that consume this endpoint and check if frontend changes are needed too.
- **New feature with no existing endpoint**: Plan to implement BOTH the backend endpoint AND the frontend call together in a single coordinated plan.

When implementing a frontend feature that calls an API:
- Check bridge.md first for an existing endpoint
- If endpoint exists: match the existing API contract exactly (same method, path, request/response shape)
- If endpoint does NOT exist: implement the backend endpoint first, then the frontend call to match it

---

## Step 1 — Restate

Restate the request as one precise technical sentence. Clarify any ambiguity based on the codebase context.
If this is a multi-repo task, state which repo(s) will be changed.

## Step 2 — Scope

List every file that will be created or modified, grouped by repo (frontend / backend).
For each file, state what change is needed.
Before listing a new file, confirm it does not already exist by checking the module context and bridge.md.

## Step 3 — Plan

Write a numbered implementation plan (3–7 steps). Each step should be specific and actionable.
If changes span both repos, order backend changes before frontend changes (implement the API contract first).

## Step 4 — Execute

Implement the plan step by step. Follow all rules from `.claude/context/patterns.md`:
- Match existing file naming, component naming, and import style
- Do not create components or utilities that already exist
- Use the package manager from `.claude/context/stack.md` for any installs
- For backend endpoints: follow the controller/service pattern already in use
- For frontend API calls: use the same fetch/axios/query pattern already in use in that repo

## Step 5 — Verify

Run the verification commands from `.claude/context/stack.md` (lint, type-check, tests) for each repo you changed.
Report the result. If any check fails, fix it before finishing.
