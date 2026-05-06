Run the following shell command to regenerate all project context files:

```bash
npx claudex sync
```

This will:
1. Re-scan the entire codebase
2. Update `.claude/context/architecture.md`
3. Update `.claude/context/stack.md`
4. Update `.claude/context/patterns.md`
5. Regenerate all module files in `.claude/context/modules/`
6. Update `CLAUDE.md`

Run this command after:
- Adding a new module or major feature
- Significant refactoring or file restructuring
- Adding major new dependencies

After the sync completes, the context files will reflect the current state of the project.
