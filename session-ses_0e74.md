# View session history in Opencode

**Session ID:** ses_0e74429e2ffeeiHB764A7p15WR
**Created:** 6/30/2026, 7:03:11 PM
**Updated:** 6/30/2026, 7:07:25 PM

---

## User

how to see session history in opencode

---

## Assistant

**Tool: webfetch**

---

## Assistant

**Tool: webfetch**

---

## Assistant

Run `opencode session list` to see all past sessions:

```
opencode session list
```

Add `-n 10` to limit to the 10 most recent. Use `--format json` for JSON output.

From inside the TUI, you can also use `/session list` to browse history.

---

## User

what top 10 opencode command open should must know

---

## Assistant

Based on the CLI docs, here are the top 10 most useful commands:

1. **`/init`** - Analyze your project and generate `AGENTS.md` so opencode understands your codebase
2. **`/undo`** / **`/redo`** - Revert or redo the last change made by opencode (run multiple times)
3. **`/share`** - Create a shareable link to your current conversation
4. **`opencide run <prompt>`** - Non-interactive mode, great for quick questions or scripting
5. **`opencode session list`** - Browse past sessions; `-n 10` for recent ones
6. **`opencode session delete <id>`** - Clean up old sessions
7. **`opencode stats`** - See token usage and cost across all sessions
8. **`opencode export <sessionID>`** - Export a session as JSON (add `--sanitize` to redact secrets)
9. **`opencode import <file|url>`** - Import a session from a local JSON file or share URL
10. **`@` (fuzzy file search)** - While chatting, type `@` to fuzzy-find and attach files to your prompt

Also worth knowing: `opencode -c` (or `--continue`) to pick up your last session, and `Tab` to toggle between plan/build mode in the TUI.

---

