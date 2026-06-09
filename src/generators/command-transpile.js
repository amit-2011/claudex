// Shared transpile helpers for targets that render slash commands as plain
// Markdown prompts (Gemini CLI, Antigravity) instead of running inside Claude
// Code, which has a dedicated interactive-question tool with side-by-side
// `preview` panes.
//
// The shared command templates (templates/commands/*.md) are authored for
// Claude. For example, /plan Phase 2b asks the model to present layout mockups
// "via the interactive question tool with each ASCII mockup placed in the
// option's `preview` field". Gemini CLI and Antigravity have no such tool, so a
// weaker model dumps the ASCII straight into chat and frequently hallucinates
// placeholder UI from an unrelated feature (the "context got lost" symptom).
//
// plainChatInteractive() rewrites those Claude-specific instructions into
// plain-chat equivalents: number the options inline, show each mockup in a
// fenced code block, and ask the user to reply with their choice. The match
// strings are copied verbatim from templates/commands/*.md — keep them in sync
// if that phrasing changes.

const PLAIN_CHAT_REWRITES = [
  [
    'ask the user with an interactive question. Options:',
    'ask the user (list these options inline and wait for their reply). Options:',
  ],
  [
    "Present them via the interactive question tool with each ASCII mockup placed in the option's `preview` field, so the user sees them side-by-side. Each option must include:",
    'Present the approaches inline in your reply: number each one and show its ASCII mockup in a fenced code block, then ask the user to reply with the number of the approach they want. Each option must include:',
  ],
  [
    '- The ASCII mockup as the preview content.',
    '- The ASCII mockup, shown inline under the option in a fenced code block.',
  ],
];

// Rewrite Claude-specific interactive-question phrasing in a command body into
// plain-chat equivalents. Uses literal substring replacement (no regex) so the
// match strings need no escaping.
export function plainChatInteractive(body) {
  let out = body;
  for (const [from, to] of PLAIN_CHAT_REWRITES) {
    out = out.split(from).join(to);
  }
  return out;
}
