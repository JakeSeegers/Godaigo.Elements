---
phase: 06-tutorial-qa-polish
plan: 02
subsystem: tutorial
tags: [qa, tutorial, copy-polish, board-ring, trap-sequence]
dependency_graph:
  requires: [06-01]
  provides: [QA-GATE-VERIFY, QA-COPY-TRAP, QA-SPOTLIGHT, QA-E2E-12-18]
  affects: [js/tutorial-mode.js]
tech_stack:
  added: []
  patterns: [boardRingTarget field on step objects, per-step freeMove ring without movement gating]
key_files:
  created:
    - .planning/phases/06-tutorial-qa-polish/06-02-QA-LOG.md
  modified:
    - js/tutorial-mode.js
decisions:
  - "boardRingTarget field defaults to EARTH_POS when absent — backward-compatible, no other steps affected"
  - "break-trap ring uses PLAYER_POS (hp(1,0)) not EARTH_POS — ring appears around the trapped player, not the shrine"
  - "freeMove:true on break-trap so pawn is not locked to a single hex while player scans the ring for stones to break"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-28"
  tasks_completed: 2
  files_changed: 1
---

# Phase 06 Plan 02: Tutorial QA Polish (Steps 12–18) Summary

Added board ring to break-trap step, polished copy for all 5 trap-sequence steps, and produced a full static QA audit log for steps 12–18.

## What Was Changed

### js/tutorial-mode.js

**1. boardRingTarget support in showStep**

The existing `boardRing` branch hardcoded `showBoardRing(EARTH_POS.x, EARTH_POS.y)`. Added a `boardRingTarget` field check so individual steps can override the ring center:

```javascript
const _ringTarget = step.boardRingTarget || EARTH_POS;
showBoardRing(_ringTarget.x, _ringTarget.y);
```

**2. break-trap step**

Added `boardRing: true, boardRingTarget: PLAYER_POS, freeMove: true`. The ring now pulses at `hp(1,0)` (the player start hex) rather than the shrine center. `freeMove: true` keeps movement unrestricted while the ring is displayed.

Updated copy: "Right-click any Earth stone in the ring" + "We've topped you up — you have enough" + touch device hint.

**3. opponent-trap step**

Updated copy to match new break-trap guidance: "Watch the ring drop into place. Then we'll show you how to escape." (removed misleading "5 AP to break" hint that pre-empted the break-trap step).

**4. opponent-retrap step**

Updated copy to acknowledge the auto-grants: "We've added some Wind and Fire stones to your pool. Use them next."

**5. wind-escape step**

Updated copy to confirm stones are already present: "Look at the dock — you have Wind stones now."

**6. fire-counter step**

Updated copy to explain the strategic value: "This is how Fire counters Earth — perfect for breaking traps without spending AP."

### .planning/phases/06-tutorial-qa-polish/06-02-QA-LOG.md

Static audit log covering all 7 steps (12–18). Documents:
- Action gate and hook wiring for each step
- Confirmed call-sites: `TutorialMode.onStoneBroken` at game-core.js:2736, `TutorialMode.onStonePlaced` at game-core.js:6430
- Confirmed `onStonePlaced` has three separate branches (stone-placed, stone-placed-wind, stone-placed-fire) with no cross-contamination
- Confirmed wind-escape and fire-counter have no `allowedHexes` (movement unrestricted)
- Confirmed all spotlight selectors (#hud-ap-pips, #panel-btn-hand, #cast-spell, #end-turn, #hud-ap-value) exist in index.html
- 5 items flagged for human-verify checkpoint

## Step Final Copy Reference

| Step | Key phrase added |
|------|-----------------|
| opponent-trap | "Watch the ring drop into place." |
| break-trap | "We've topped you up — you have enough." |
| opponent-retrap | "Wind and Fire stones to your pool." |
| wind-escape | "you have Wind stones now." |
| fire-counter | "This is how Fire counters Earth" |

## Human Verification Status

**PENDING** — Task 3 is a `checkpoint:human-verify`. Player must run through steps 12–18 in browser and confirm all 11 verification points pass with zero console errors.

## Deviations from Plan

None — all 5 copy edits and the boardRingTarget implementation were executed exactly as specified. No unexpected issues encountered.

## Known Stubs

None — all ring/copy changes are wired to live game state. No placeholder data.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- js/tutorial-mode.js: modified file exists
- .planning/phases/06-tutorial-qa-polish/06-02-QA-LOG.md: created file exists
- Task 1 commit 0e3b783: present in git log
- Task 2 commit 0bca3d0: present in git log
- All 9 automated Task 1 verification checks: PASS
- node --check js/tutorial-mode.js: exits 0
- All 7 QA log step coverage checks: PASS
