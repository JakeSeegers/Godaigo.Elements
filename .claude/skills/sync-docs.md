# Skill: /sync-docs

## Trigger
User types `/sync-docs` or asks to "sync documentation" / "update the docs".

## Purpose
Keep the distributed documentation system in sync with source code after refactors.
Prevents doc drift without requiring a full codebase scan each session.

---

## Procedure

### Step 1 — Identify changed files
```bash
git diff --name-only HEAD~1  # files changed in last commit
# or
git diff --name-only         # unstaged changes
```

### Step 2 — Map changed files to their doc owners

| Changed file(s) | Update this doc |
|----------------|----------------|
| `js/game-core.js` | `js/INDEX.md` § game-core.js section |
| `js/game-ui.js` | `js/INDEX.md` § game-ui.js section |
| `js/lobby.js` | `js/INDEX.md` § lobby.js section + CLAUDE.md if Supabase tables changed |
| `js/tutorial-mode.js` | `js/INDEX.md` § tutorial-mode.js section |
| `js/scrolls/scroll-definitions.js` | `js/scrolls/INDEX.md` § scroll-definitions section |
| `js/scrolls/effects/scroll-effects.js` | `js/scrolls/INDEX.md` § scroll-effects section |
| `js/scrolls/response-window.js` | `js/scrolls/INDEX.md` § response-window section |
| `css/styles.css` | `css/INDEX.md` if z-index or new CSS class added |
| `css/variables.css` | `css/INDEX.md` § Token Reference |
| Any new `.js` file added | Add row to `js/INDEX.md` File Map + entry in `CLAUDE.md` Script Load Order |
| Any new Supabase table | Add to `CLAUDE.md` Supabase Tables + `js/INDEX.md` lobby section |
| Any new `window.*` global | Add to `js/INDEX.md` § Window Globals |
| Any bug fixed | Remove from `CLAUDE.md` Known Active Bugs |

### Step 3 — Update planning/current.md
Always update these fields at end of session:
- `## Last Committed Work` — brief summary of what changed
- `## Current Status` — what is working / tested
- `## Known Open Issues` — any regressions or unresolved items
- `## Next Likely Tasks` — what comes next
- `## Files Currently In Flight` — any uncommitted changes
- `*Last updated:*` — today's date

### Step 4 — Verify gotchas are still accurate
For each changed file, re-read the "gotchas" section in its INDEX.md and confirm:
- Are the described behaviors still true?
- Did the change fix a bug that was listed?
- Did the change introduce a new non-obvious behavior?

### Step 5 — Commit the docs
```bash
git add CLAUDE.md js/INDEX.md js/scrolls/INDEX.md css/INDEX.md docs/INDEX.md planning/current.md
git commit -m "docs: sync INDEX files after [brief description of what changed]"
```

---

## Quick Checklist (paste into PR description or commit message)

```
Docs sync checklist:
[ ] js/INDEX.md updated for changed JS files
[ ] js/scrolls/INDEX.md updated if scroll system changed
[ ] css/INDEX.md updated if z-index or new CSS classes added
[ ] CLAUDE.md updated if new globals, tables, or load-order changed
[ ] planning/current.md updated with session summary
[ ] Known bugs section reflects current state
[ ] No window.* globals added without INDEX.md entry
```

---

## Warning Signs (doc drift indicators)
- A function is called in source but not mentioned in any INDEX.md
- A `window.*` global is set but not in the Quick Reference table
- A CSS class has `tmode-` or `tutorial-` prefix but isn't in css/INDEX.md
- A Supabase `.from('tablename')` call references a table not in CLAUDE.md
- `planning/current.md` last-updated date is more than 3 sessions old
