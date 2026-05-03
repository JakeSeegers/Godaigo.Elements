# Current Active Work

> This file is the session start point. Update it at the end of every work session.
> Claude: read this first, then drill into the relevant INDEX.md before touching source.

---

## Active Branch
`4.10.progresscheck` → remote: `JakeSeegers/Godaigo.Elements`

## Last Committed Work
- Tutorial system: player places own tile, explores freely, first flip forced to Earth
- Distributed docs system: CLAUDE.md, js/INDEX.md, js/scrolls/INDEX.md, css/INDEX.md,
  docs/INDEX.md, planning/current.md, .claude/skills/sync-docs.md

## Current Status
Tutorial functional through step 4 (Earth tile reveal + scroll drawn). Steps 5–14
exist in code but are untested end-to-end. Docs system fully in place.

---

## NEXT SESSION TASK LIST (priority order)

### 1. Tutorial — Earth Shrine Step (MEDIUM, tutorial-mode.js)
After step 4 (scroll found), the tutorial should:
- Guide player to walk to the **center hex of the earth tile** (the shrine center)
- Tell them to **End Turn** there to collect 5 earth stones
- The `#end-turn` button spotlight already exists in step 8 (`getting-stones`) — but
  the flow needs an explicit "now go stand on the shrine center and end your turn" step
  BEFORE the stone-abilities explanation.
- Hook to use: `onPlayerMoved(x,y)` is currently a no-op — wire it up to detect when
  the pawn is within ~20px of `EARTH_POS` (the revealed earth tile center) and set a
  flag. Then detect end-turn from `onEndTurn` hook (doesn't exist yet — needs adding
  in `game-core.js` where `endTurn()` is called).
- Alternatively: advance automatically when `stoneCounts.earth` increases (check after
  end-turn resolves).

### 2. Source Pool Win Condition Bug (HIGH, game-core.js)
**Rule (from game design doc):** If the source pool for an element has 0 stones remaining,
casting a scroll of that element still works (effect fires) but does NOT count toward
the player's win condition. The win condition only registers if ≥1 stone of that type
exists in the source pool at cast time.

**Where to fix:** `applyScrollEffects()` in `game-core.js`, specifically the block that
calls `spellSystem.activated.add(element)` (the win-condition tracking). Before that
add call, check `stoneCounts[element] > 0` (stoneCounts = source pool). If 0, skip
the add but still run the scroll effect. Show a status message like:
"Scroll cast! (No [element] stones in the source pool — win condition not awarded.)"

**Relevant variables:**
- `stoneCounts` = source pool (global, 0–25 per element)
- `spellSystem.activated` = Set of elements the active player has won
- The `cancelled` flag already exists for a different case (empty hand on Sacrificial
  Pyre) — do NOT reuse it here; add a separate `noWinCondition` flag or inline check.

### 3. Tutorial — Clarify Stone/Scroll Limits
The tutorial text is vague. Make these explicit at the appropriate steps:
- **Player stone pool**: max **5** of each element type (shown as `X/5` in left panel)
- **Source pool**: max **25** of each element type (shared across all players)
- **Hand size**: max **2** scrolls
- **Active area**: max **2** scrolls
- **Source pool + win condition**: if source pool for an element hits 0, casting a
  scroll of that element won't count toward your win — acknowledge this in the
  "getting stones" step of the tutorial.

---

## Known Open Issues
- `TRANS-WIN-CON`: Transmute (Fire IV) doesn't always stamp fire symbol on player tile
- `TRANS-DOUBLE-DISP`: Transmute inventory display stale after discard
- `onPlayerMoved` hook in game-ui.js exists but tutorial-mode.js treats it as no-op
- Steps 5–14 of tutorial untested in full sequence

## Files Currently In Flight
None — all changes committed and pushed.

## How To Resume
1. `git log --oneline -5` to confirm last commits
2. `npx serve -p 3333` → open `http://localhost:3333`
3. Click "Play Tutorial" on auth screen (do not log in)
4. Play through to step 4 to confirm baseline, then work on task list above

---

*Last updated: 2026-04-25*
