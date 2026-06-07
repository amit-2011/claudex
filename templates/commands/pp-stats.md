---
allowed-tools: Bash(npx promptpilot-ai stats:*)
description: Show promptpilot-ai context stats — files, size, modules, staleness
---

**Language:** Respond in the same language the user used in their request (English, Hinglish, Spanish, etc.). Keep code, file paths, commands, and identifiers in English.

---

Display the promptpilot-ai context dashboard below to the user verbatim. Do not summarize, re-format, or comment on it unless the user asks a follow-up question.

!`npx promptpilot-ai stats`

If the output says no context was found, tell the user to run `npx promptpilot-ai init` first.
