# Godaigo Tutorial Improvements

## What This Is

A focused improvement initiative for the interactive tutorial in Godaigo — a browser-based multiplayer hex-tile strategy game. The tutorial (`tutorial-mode.js`) guides new players through all core mechanics in 15 scripted steps, but has critical bugs, missing wiring, and untested steps that leave new players stranded mid-tutorial.

## Core Value

A new player can complete the full tutorial from start to finish without hitting a broken step, dead end, or confusing gap — and arrive at the live game feeling confident.

## Requirements

### Validated

- ✓ Tutorial boots and runs steps 1–4 (welcome → tile place → camera → Earth scroll reveal) — existing
- ✓ Spotlight/dim overlay system works — existing
- ✓ Tutorial board auto-builds (Earth tile at center, pawns placed) — existing
- ✓ First tile flip forced to Earth V (Avalanche) — existing
- ✓ Tutorial exit reloads page — existing

### Active

- [ ] Player can walk to Earth shrine center, end turn, and collect 5 earth stones within the tutorial
- [ ] Source pool win-condition is correctly blocked when source pool is empty
- [ ] Steps 5–14 run end-to-end without errors or dead ends
- [ ] Stone and scroll limits are clearly communicated in tutorial text
- [ ] Dead tutorial.js modal code is removed

### Out of Scope

- Transmute bugs (TRANS-WIN-CON, TRANS-DOUBLE-DISP) — separate bug track in TODO.md, not tutorial-specific
- Multiplayer tutorial mode — no scope for 2-player guided mode yet
- Tutorial voice narration re-recording — audio assets out of scope for this milestone

## Context

- Stack: Vanilla JS, SVG board, Supabase. No build step. Scripts load in order via index.html.
- Tutorial entry: `tutorial-mode.js` (step 15 interactive flow) + `tutorial.js` (deprecated 7-step modal, still loaded)
- Hooks into game-core: `onPlayerTilePlaced()`, `onTilePreReveal()`, `onTileRevealed()`, `showMovementHint()`
- Missing hook: `onEndTurn()` — must be added to `game-core.js` `endTurn()` function
- Missing step: after Earth scroll is found, player should be guided to shrine center to collect stones
- `tutorialAllowedHexes` restricts pawn movement during move steps
- Current known state: steps 1–4 tested; steps 5–14 exist but unverified

## Constraints

- **Tech stack**: Vanilla JS, no framework, no build step — edits are live immediately
- **Script load order**: tutorial-mode.js loads after game-core.js and lobby.js — must not break that dependency chain
- **Supabase**: Tutorial runs without DB writes — all state is local JS

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Add `onEndTurn` hook to game-core.js | Tutorial needs to detect when player ends turn on shrine center to trigger stone collection | Pending |
| Insert Earth Shrine step between steps 4 and 5 | Players need to know how to collect stones before stone/scroll mechanics are explained | Pending |
| Remove tutorial.js modal code | Dead code — tutorial-mode.js superseded it; keeping it adds confusion and load bloat | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-27 after initialization*
