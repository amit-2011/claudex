**Language:** Respond in the same language the user used in their request (English, Hinglish, Spanish, etc.). Keep code, file paths, commands, and identifiers in English.

---

Load project context before doing anything:

1. Read `.claude/context/architecture.md` — understand project type, structure, and modules
2. Read `.claude/context/stack.md` — understand the tech stack and conventions
3. Read `.claude/context/patterns.md` — understand naming conventions and architectural patterns
4. **Check if `.claude/context/bridge.md` exists** — if it does, read it to understand the frontend ↔ backend API map before planning.

Now analyze this request: **$ARGUMENTS**

Identify which module(s) are involved and read the relevant file(s) from `.claude/context/modules/`.

If bridge.md exists: identify whether this task touches the frontend, backend, or both. If it needs an API, find it in the bridge endpoint map or plan to create it.

---

## Phase 1 — Restate & Detect

Output exactly two short lines in this phase, nothing more:

1. **Restatement:** one precise technical sentence describing what needs to be done.
2. **Task type:** `UI` / `Backend` / `Both`.

Detect as **UI** if the request mentions: page, screen, component, form, modal, button, layout, dashboard, table, sidebar, header, card, list view, navigation — or it affects files matching `*.tsx` / `*.jsx` / `*.vue` / `*.svelte` — or the involved module is a frontend module per `architecture.md`.

If task type is **Backend** only → skip Phase 2 and go directly to Phase 3.

---

## Phase 2 — Interactive design (UI / Both tasks only)

### 2a. Reuse check — prevent duplicate components

From the relevant frontend module file in `.claude/context/modules/`, list every existing component, hook, or utility that could fulfill part of this request (cite file path + 1-line purpose).

- If one or more matches exist → ask the user with an interactive question. Options:
  - **Reuse `<ExistingComponent>` (path)** — describe how it would be composed/extended for this task.
  - **Create new** — describe why the existing one does not fit.
    Wait for the answer before continuing.
- If no match exists → state "No reusable match found — will design new" and proceed to 2b.

Never propose a new component when a reusable one exists without asking first. This is the duplicate-code guard.

### 2b. Layout approaches — visual selection

Generate **2–3 distinct layout approaches** for the UI. For each approach, draw an **ASCII mockup** using box-drawing characters (`┌ ┐ └ ┘ ─ │ ├ ┤ ┬ ┴ ┼`) showing the key regions: header, sidebar, main area, cards, forms, tables, etc. Keep each mockup under 20 lines, monospace-aligned.

Present them via the interactive question tool with each ASCII mockup placed in the option's `preview` field, so the user sees them side-by-side. Each option must include:

- A short label (e.g., "Sidebar + main", "Top tabs + grid", "Split view", "Stacked cards").
- A 1-sentence tradeoff (information density, navigation depth, mobile behavior, scan-ability, etc.).
- The ASCII mockup as the preview content.

Wait for the user to select one approach before continuing.

---

## Phase 3 — Final Plan

Output this section only **after** Phase 2 selections are made (or immediately after Phase 1 for backend-only tasks).

### Restatement (refined)

One sentence reflecting the chosen approach.

### Reusable components

List existing components / hooks / utilities that will be used as-is or composed. Cite file paths. If none, write "None — fully new surface".

### New components

Only list components that have no existing match in the codebase. For each: name, target location (per `patterns.md`), and 1-line purpose.

### Files to Change

For each file:

- `path/to/file.ts` — what changes (create / modify / delete)

### Implementation Steps

3–7 numbered steps. Each step must specify:

- Which file to touch
- What function / component / route to create or modify
- Any dependency installs needed (use the package manager from `stack.md`)

For tasks spanning both repos, order backend changes before frontend changes so the API contract exists first.

### Testing

- Test command to run (from `stack.md`)
- What to look for in the output
- Any manual verification steps (e.g., visit `/route`, click X, confirm Y)

---

⚠️ **STOP HERE. Do not implement anything.**
Present this final plan and wait for the user to approve before making any changes.
