Load project context before doing anything:

1. Read `.claude/context/architecture.md` — understand project type, structure, and modules
2. Read `.claude/context/stack.md` — understand the tech stack and conventions
3. Read `.claude/context/patterns.md` — understand naming conventions and architectural patterns
4. **Check if `.claude/context/bridge.md` exists** — if it does, read it to understand the frontend ↔ backend API map before planning.

Now analyze this request: **$ARGUMENTS**

Based on the request, identify which module(s) are involved and read the relevant file(s) from `.claude/context/modules/`.

If bridge.md exists: identify whether this task touches the frontend, backend, or both. If it needs an API, find it in the bridge endpoint map or plan to create it.

---

## Restatement

One precise technical sentence describing what needs to be done.

## Files to Change

For each file:
- `path/to/file.ts` — what changes (create / modify / delete)

Check module context files to confirm no existing file already handles this.

## Implementation Steps

Numbered steps (3–7), specific and actionable. Include:
- Which file to touch in each step
- What function/component/route to create or modify
- Any dependency installs needed (use the correct package manager)

## Testing

How to verify this works:
- Test command to run
- What to look for in the output
- Any manual verification steps

---

⚠️ **STOP HERE. Do not implement anything.**
Present this plan and wait for the user to approve before making any changes.
