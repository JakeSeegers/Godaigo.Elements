---
phase: 06-tutorial-qa-polish
plan: 01
subsystem: tutorial
tags: [bug-fix, tutorial, trap-sequence, ap, stones]
dependency_graph:
  requires: []
  provides: [QA-TRAP-POS, QA-TRAP-AP, QA-TRAP-STONES]
  affects: [js/tutorial-mode.js]
tech_stack:
  added: []
  patterns: [per-step resource grants via prepareStepEntry, hard-coded hex coordinates]
key_files:
  created: []
  modified:
    - js/tutorial-mode.js
decisions:
  - "Hard-code trap ring centers at (q=1,r=0) and (q=2,r=0) instead of inverting pixel coords — eliminates small-hex/large-hex grid mismatch"
  - "prepareStepEntry helper pattern: single dispatch function called before modal renders, one case per step ID"
  - "window.addAP(5) called unconditionally on break-trap entry (clamped at maxAP=5 by the API, so safe)"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-28"
  tasks_completed: 1
  files_changed: 1
---

# Phase 06 Plan 01: Tutorial Trap Sequence Bug Fixes Summary

Fixed three show-stopper bugs in tutorial steps 12–16 that made the kinesthetic trap sequence unwinnable.

## What Was Changed

### runScriptedOpponentTrap

**Before:** Inverted player pixel coords `(centerX, centerY)` back to hex `(q,r)` using `r = centerY / (S*1.5)` and `q = centerX/(S*SQ3) - r/2`. This worked only when `playerPosition` is on the large-hex (S=80) grid. After movement, the pawn's pixel coords come from the small-hex grid (s=20), so the inversion produced wrong (q,r) values and stones landed on adjacent shrine tiles instead of around the pawn.

**After:** Hard-coded `centerQ = 1, centerR = 0` (the locked tutorial player start hex). The `centerX, centerY` parameters are retained for signature compatibility but unused. The six earth stones now reliably ring hp(2,0), hp(1,1), hp(0,1), hp(0,0), hp(1,-1), hp(2,-1) — the correct neighbors of the player start hex.

### runScriptedOpponentRetrap

**Before:** Computed `centerQ = Math.round(q) + 1` from pixel-derived `q` — inherited the same grid inversion bug.

**After:** Hard-coded `centerQ = 2, centerR = 0` (one hex east of the first ring). The second ring now predictably surrounds hp(3,0), hp(2,1), hp(1,1), hp(1,0), hp(2,-1), hp(3,-1).

## prepareStepEntry Pattern

A new `prepareStepEntry(stepId)` helper was inserted in the Step machine section just before `showStep`. It is called at the top of `showStep(index)` immediately after `currentStep = index` and before `clearSpotlight()` — ensuring resources are granted before the modal renders so the modal copy is accurate.

| Step ID | Action |
|---------|--------|
| `break-trap` | `window.addAP(5)` — tops up to 5 AP so player can afford one Earth break |
| `opponent-retrap` | `window.addAP(3)` — grants 3 AP so player can move 1–2 hexes |
| `wind-escape` | `ss.playerPool.wind += 2` if wind < 1; calls `updateHUD()` / `updateStonePoolDisplay()` |
| `fire-counter` | `ss.playerPool.fire += 2` if fire < 1; fallback: places one earth stone at hp(3,0) if board has zero earth stones |

## playerPool / spellSystem Shape

No unexpected discoveries. `window.spellSystem.playerPool` follows the `{ earth, water, fire, wind, void }` shape documented in CLAUDE.md globals. Optional chaining (`ss?.playerPool`) guards against tutorial entry before spellSystem initializes. UI refresh functions `updateHUD` and `updateStonePoolDisplay` are called via `typeof` guards (browser globals, not imported).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Shortened break-trap comment to satisfy 200-char regex window**
- **Found during:** Verification run
- **Issue:** The plan's acceptance-criteria regex `/break-trap[\s\S]{0,200}window\.addAP\(\s*5\s*\)/` requires the AP grant within 200 chars of the string `break-trap`. Initial implementation with a multi-line comment placed `window.addAP(5)` at ~250 chars.
- **Fix:** Collapsed the two comments above `window.addAP(5)` into a single short comment — no behavioral change.
- **Files modified:** js/tutorial-mode.js
- **Commit:** 65acc57

## Known Stubs

None — all resource grants are wired to live game-core APIs (window.addAP, window.placeStoneVisually, spellSystem.playerPool).

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- js/tutorial-mode.js: modified file exists
- Commit 65acc57: present in git log
- All 10 automated verification checks: PASS
- node --check js/tutorial-mode.js: exits 0
