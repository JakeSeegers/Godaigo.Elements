---
phase: 05-kinesthetic-tutorial-redesign
plan: 02
subsystem: ui
tags: [tutorial, kinesthetic, action-gated, pattern-polling, hint-timers, vanilla-js]

# Dependency graph
requires:
  - 05-01 (hook call-sites in game-core.js and scroll-panels.js)
provides:
  - onStonePlaced, onStoneBroken, onScrollMoved, onSpellCast handlers in TutorialMode
  - 14-step kinesthetic STEPS array with 5 read-only steps and 9 action-gated steps
  - Pattern-poll interval for EARTH_SCROLL_5 checkPattern
  - 15-second inactivity hint timer system
affects:
  - 05-03 (adds scripted AI scenario steps 12-17 between cast-avalanche and hud)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "clearPatternPoll() + clearHintTimer() called at start of every showStep() to prevent interval accumulation"
    - "setInterval(500ms) on pattern-built step polls spellSystem.checkPattern('EARTH_SCROLL_5')"
    - "startHintTimer(15000ms) fires updateStatus() after player inactivity on action-gated steps"
    - "onStonePlaced handles three action types: stone-placed, stone-placed-wind, stone-placed-fire"

key-files:
  created: []
  modified:
    - js/tutorial-mode.js

key-decisions:
  - "stone-placed-wind and stone-placed-fire handled in onStonePlaced via step.action branching rather than separate handlers — reduces API surface"
  - "onScrollMoved gates on toArea === 'active' only — moving to common area does not advance step 7"
  - "patternPollInterval and hintTimer both cleared at start of showStep() (T-05-02-02 mitigation)"
  - "STEPS array reduced from 15 to 14 entries — catacomb, getting-stones, stone-abilities, casting, scrolls-explained (read-only) steps removed; replaced with action-gated stone/pattern/spell flow"

requirements-completed: [KINE-01, KINE-02, KINE-03, KINE-04, KINE-05, HINT-01]

# Metrics
duration: ~3 min
completed: 2026-04-28
---

# Phase 05 Plan 02: Kinesthetic Hook Handlers and STEPS Redesign Summary

**Four new TutorialMode hook handlers, 14-step kinesthetic STEPS array (5 read-only, 9 action-gated), pattern-poll interval for Avalanche, and 15-second inactivity hint timer system**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-28T21:15:51Z
- **Completed:** 2026-04-28
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `onStonePlaced(stoneType, x, y)` — advances on stone-placed, stone-placed-wind, stone-placed-fire actions
- `onStoneBroken(stoneType, x, y)` — advances on stone-broken action
- `onScrollMoved(scrollName, fromArea, toArea)` — advances on scroll-moved action when `toArea === 'active'`
- `onSpellCast(scrollName)` — advances on spell-cast action
- All four handlers exported in public API return object
- `patternPollInterval` state var + `clearPatternPoll()` helper — no leaked intervals across step transitions
- `hintTimer` state var + `clearHintTimer()` + `startHintTimer(message)` helpers
- `clearPatternPoll()` and `clearHintTimer()` called at top of every `showStep()` call (threat T-05-02-02)
- `showStep()` starts `setInterval(500ms)` for pattern-built steps polling `spellSystem.checkPattern('EARTH_SCROLL_5')`
- `showStep()` starts 15-second hint timers for all non-read action types
- actionHints dict expanded with 7 new action types (scroll-moved, stone-placed, pattern-built, spell-cast, stone-broken, stone-placed-wind, stone-placed-fire)
- STEPS array replaced: 15 read-heavy steps → 14 kinesthetic steps with exactly 5 permitted read-only steps

## Task Commits

1. **Task 1: Add kinesthetic hook handlers and hint timer system** — `0eaf9d4`
2. **Task 2: Redesign STEPS array — action-gated steps, pattern polling, hint timers** — `bb6aee6`

## Files Created/Modified

- `js/tutorial-mode.js` — Added 4 handlers, 3 helpers, 2 state vars; replaced STEPS array; expanded actionHints; added showStep polling/hint logic

## STEPS Array — Final Structure

| Index | ID | Action | Gate |
|-------|----|--------|------|
| 0 | welcome | read | Next button |
| 1 | tile-placed | place-tile | onPlayerTilePlaced |
| 2 | camera | read | Next button |
| 3 | move-pawn | explore | onTileRevealed |
| 4 | scroll-found | click | attachClickAdvance |
| 5 | earth-shrine | end-turn | onEndTurn |
| 6 | open-scrolls | click | attachClickAdvance |
| 7 | scrolls-explained | scroll-moved | onScrollMoved (toArea=active) |
| 8 | how-to-win | read | Next button |
| 9 | place-stone | stone-placed | onStonePlaced('earth') |
| 10 | build-pattern | pattern-built | checkPattern poll |
| 11 | cast-avalanche | spell-cast | onSpellCast |
| 12 | hud | read | Next button |
| 13 | finish | read | Next button (Start Playing) |

Read-only count: 5 (indices 0, 2, 8, 12, 13)

## Deviations from Plan

None — plan executed exactly as written. The `onStonePlaced` wind/fire variant logic (Task 2 Step C) was incorporated directly into the function added in Task 1, since Task 2 specified replacing the Task 1 version. This is expected per the plan's Step C instruction ("Replace the onStonePlaced function added in Task 1 with...") — the final function matches the Task 2 specification.

## Known Stubs

None — all step gates are wired to real handlers. Steps 12-17 (scripted AI scenarios) are deferred to Plan 05-03, which will splice them between indices 11 and 12.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are confined to the tutorial IIFE in tutorial-mode.js. Threat T-05-02-02 (leaked setInterval) is mitigated per plan spec.

## Self-Check: PASSED

- `js/tutorial-mode.js` exists and modified
- Commits `0eaf9d4` and `bb6aee6` verified in git log
- `grep -c "action: 'read'"` returns 5
- `onStonePlaced`, `onStoneBroken`, `onScrollMoved`, `onSpellCast` all present in file and public API
- `checkPattern('EARTH_SCROLL_5')` in pattern-poll interval
- `startHintTimer` called in showStep for pattern-built and other action-gated steps
