---
phase: 05-kinesthetic-tutorial-redesign
plan: 01
subsystem: ui
tags: [tutorial, hooks, game-core, scroll-panels, vanilla-js]

# Dependency graph
requires: []
provides:
  - onStonePlaced hook call-site in game-core.js placeStone()
  - onStoneBroken hook call-site in game-core.js attemptBreakStone()
  - onSpellCast hook call-site in game-core.js executeSpell()
  - onScrollMoved hook call-sites in scroll-panels.js (hand→active, hand→common, active→common)
affects:
  - 05-02 (tutorial-mode.js step gating — consumes these hooks)
  - 05-03 (tutorial step logic — consumes these hooks)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tutorial hook pattern: if (window.isTutorialMode && window.TutorialMode?.hookName) { window.TutorialMode.hookName(args); }"

key-files:
  created: []
  modified:
    - js/game-core.js
    - js/scroll-panels.js

key-decisions:
  - "Hook inserted after placedStones.push() in placeStone() — stone object is in array before tutorial fires"
  - "Hook inserted after placedStones.splice() but before returnStoneToPool() in attemptBreakStone() — stone ref still valid, pool not yet updated"
  - "onSpellCast inserted after spendAP + logScrollEvent and before scrollData construction — AP already spent, spell is committed"
  - "onScrollMoved fires synchronously before setTimeout so tutorial gate can react before the actual move completes"

patterns-established:
  - "All tutorial hooks use optional-chaining (?.) so a missing or erroring TutorialMode method does not crash the calling function"

requirements-completed: [HOOK-01, HOOK-02, HOOK-03, HOOK-04]

# Metrics
duration: 10min
completed: 2026-04-28
---

# Phase 05 Plan 01: Tutorial Hook Call-Sites Summary

**Four isTutorialMode-guarded hook call-sites wired into placeStone, attemptBreakStone, executeSpell, and three scroll-panel move buttons**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-28
- **Completed:** 2026-04-28
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- onStonePlaced fires in placeStone() immediately after placedStones.push()
- onStoneBroken fires in attemptBreakStone() immediately after placedStones.splice()
- onSpellCast fires in executeSpell() after AP is spent and scroll event logged
- onScrollMoved fires in scroll-panels.js for all three move directions before the 60ms setTimeout

## Task Commits

1. **Task 1: Add onStonePlaced and onStoneBroken hooks in game-core.js** - `3ad097b` (feat)
2. **Task 2: Add onSpellCast and onScrollMoved hooks** - `6918f2d` (feat)

## Files Created/Modified
- `js/game-core.js` - Added onStonePlaced, onStoneBroken, onSpellCast tutorial hooks
- `js/scroll-panels.js` - Added three onScrollMoved tutorial hook calls in renderScrollCard button handlers

## Decisions Made
- Hook order in attemptBreakStone: fires after splice (stone removed) but before returnStoneToPool — stone reference is still valid for reading type/x/y
- Hook order in executeSpell: fires after spendAP (spell is committed, no way to cancel) and before scrollData/response window — tutorial knows the spell was cast before effects apply
- onScrollMoved fires before setTimeout so tutorial gate reacts before the underlying scroll state changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- attemptBreakStone's remove block matched two locations in the file; resolved by using more surrounding context (the updateStatus line with the hammer emoji) to uniquely identify the target.

## Next Phase Readiness
- All four hook call-sites are in place and guarded by isTutorialMode
- Plan 05-02 (tutorial-mode.js step gating) can now wire onStonePlaced, onStoneBroken, onSpellCast, onScrollMoved handlers to advance tutorial steps

---
*Phase: 05-kinesthetic-tutorial-redesign*
*Completed: 2026-04-28*
