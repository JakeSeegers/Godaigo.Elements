---
phase: 05-kinesthetic-tutorial-redesign
plan: 03
subsystem: ui
tags: [tutorial, kinesthetic, scripted-ai, trap-sequence, speech-bubble, vanilla-js]

# Dependency graph
requires:
  - 05-01 (hook call-sites in game-core.js)
  - 05-02 (kinesthetic STEPS array, onStoneBroken, onStonePlaced handlers)
provides:
  - runScriptedOpponentTrap() — Earth ring placement around player (200ms stone stagger)
  - runScriptedOpponentRetrap() — Second Earth ring shifted +1 tile east
  - showOpponentSpeechBubble() / removeOpponentSpeechBubble() — SVG speech bubble above ENEMY_POS
  - 5 new STEPS: opponent-trap, break-trap, opponent-retrap, wind-escape, fire-counter
  - window.placeStoneVisually exposed from game-core.js for tutorial use
affects:
  - Future: any plan adding more scripted AI steps can follow the same scripted-ai action pattern

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "scripted-ai action type: showStep() detects step.action === 'scripted-ai' and fires AI with 1200ms lead delay"
    - "Ring computation: hex inverse formula (r = centerY/(S*1.5), q = centerX/(S*SQ3) - r/2) converts pixel coords to axial hex coords"
    - "Stone stagger: 6 setTimeouts at 200ms intervals for visual drama; callback fires after all stones + 400ms buffer"
    - "Speech bubble: SVG <g> injected into #viewport at ENEMY_POS.y-55 with rect+text children"
    - "removeOpponentSpeechBubble() called at start of every showStep() to prevent stale bubbles"

key-files:
  created: []
  modified:
    - js/tutorial-mode.js
    - js/game-core.js

key-decisions:
  - "Stone IDs not tracked — onStoneBroken advances break-trap on ANY stone break, simplest correct approach"
  - "Retrap shifted +1 tile east (centerQ+1) rather than same center to avoid overlapping first ring"
  - "placeStoneVisually exposed as window global in same block as window.placeTile / window.spellSystem"
  - "Speech bubble uses SVG not HTML so it renders in board coordinate space and stays attached to the board viewport"
  - "1200ms delay before AI fires so player can read the modal before Earth stones animate in"

requirements-completed: [KINE-06, KINE-07, KINE-08, KINE-09, KINE-10, HINT-02]

# Metrics
duration: ~5 min
completed: 2026-04-29
---

# Phase 05 Plan 03: Scripted Opponent AI Trap Sequence Summary

**Scripted opponent AI with Earth stone ring trap, SVG speech bubble, and five new action-gated tutorial steps (opponent-trap, break-trap, opponent-retrap, wind-escape, fire-counter) teaching stone interaction mechanics**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-29T01:03:25Z
- **Completed:** 2026-04-29
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `runScriptedOpponentTrap(centerX, centerY, callback)` — converts player pixel position to axial hex coords, places 6 Earth stones at neighbor offsets with 200ms stagger, fires callback after all placed + 400ms buffer
- `runScriptedOpponentRetrap(centerX, centerY, callback)` — same but shifts trap center +1 tile east to avoid overlap
- `showOpponentSpeechBubble(text)` — injects SVG `<g>` with rect + text into board `#viewport` at `ENEMY_POS.y - 55`
- `removeOpponentSpeechBubble()` — removes element by id; called at start of every `showStep()` call
- `window.placeStoneVisually = placeStoneVisually` added in game-core.js window assignment block (line 4649)
- 5 new STEPS spliced between cast-avalanche (index 11) and hud (now index 17): opponent-trap, break-trap, opponent-retrap, wind-escape, fire-counter
- STEPS array: 14 → 19 total entries (indices 0-18); hud=17, finish=18
- `showStep()`: scripted-ai branch triggers runScriptedOpponentTrap or runScriptedOpponentRetrap with 1200ms lead delay and 800ms post-callback advance delay
- `actionHints` dict in `showModal()`: added `'scripted-ai': 'Watch the opponent\'s move…'`
- `onStoneBroken` already wired (Plan 05-02) to advance on stone-broken action — advances break-trap step
- `onStonePlaced` already wired (Plan 05-02) for stone-placed-wind and stone-placed-fire — advances wind-escape and fire-counter steps

## Task Commits

1. **Task 1: Add scripted opponent AI helper functions and expose placeStoneVisually** — `3fe6ee1`
2. **Task 2: Splice 5 trap/escape STEPS and wire AI trigger in showStep** — `80d4fd8`

## Files Created/Modified

- `js/tutorial-mode.js` — Added 4 helper functions (126 lines); spliced 5 STEPS entries (87 lines); expanded actionHints with scripted-ai; added scripted-ai trigger block in showStep; added removeOpponentSpeechBubble() call in showStep cleanup
- `js/game-core.js` — Added `window.placeStoneVisually = placeStoneVisually;` in window assignment block

## STEPS Array — Final Structure (19 steps)

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
| 12 | opponent-trap | scripted-ai | runScriptedOpponentTrap auto-advance |
| 13 | break-trap | stone-broken | onStoneBroken |
| 14 | opponent-retrap | scripted-ai | runScriptedOpponentRetrap auto-advance |
| 15 | wind-escape | stone-placed-wind | onStonePlaced('wind') |
| 16 | fire-counter | stone-placed-fire | onStonePlaced('fire') |
| 17 | hud | read | Next button |
| 18 | finish | read | Next button (Start Playing) |

Read-only count: 5 (indices 0, 2, 8, 17, 18) — within the 5 read-only cap.

## Deviations from Plan

None — plan executed exactly as written. Both tasks implemented per spec including all function signatures, hex inverse formula, neighbor offsets, and timing values.

## Known Stubs

None — all step gates are wired to real handlers.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. `window.placeStoneVisually` exposes a visual-only stone placement function; it adds no new attack surface since the function already existed in game-core.js scope and the tutorial only runs in single-player mode (T-05-03-01 accepted per plan threat register).

## Self-Check: PASSED

- `js/tutorial-mode.js` exists and modified (commits 3fe6ee1, 80d4fd8)
- `js/game-core.js` modified (commit 3fe6ee1)
- All 4 helper functions present: runScriptedOpponentTrap, runScriptedOpponentRetrap, showOpponentSpeechBubble, removeOpponentSpeechBubble
- All 5 new step IDs present: opponent-trap, break-trap, opponent-retrap, wind-escape, fire-counter
- window.placeStoneVisually assignment at game-core.js line 4649
- STEPS count: 19 (grep -c "id: '" returns 19)
