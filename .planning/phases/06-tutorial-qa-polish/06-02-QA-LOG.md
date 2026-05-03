# QA Log — Phase 6 Plan 02

**Date:** 2026-04-28
**Tutorial file:** js/tutorial-mode.js
**Steps audited:** 12–18

---

## Step 12 — opponent-trap

- **Step index:** 12
- **action:** `scripted-ai`
- **advance via:** `setTimeout(advance, 800)` called inside the `runScriptedOpponentTrap` callback, which is itself queued via `setTimeout(..., 1200)` when `step.id === 'opponent-trap'` (showStep lines ~671–677). So total auto-advance delay is ~2400 ms after modal renders (1200 ms AI delay + stone placement delays + 800 ms post-ring delay).
- **hook branch matches:** yes — the `scripted-ai` path is handled directly in `showStep()` (not via an external hook), so no hook-to-action mismatch is possible.
- **spotlight:** none
- **boardRing:** none (ring is implicitly placed by `runScriptedOpponentTrap` via `placeStoneVisually`, not the tutorial boardRing system)
- **concerns:** The earth stones placed by `runScriptedOpponentTrap` must not land on shrine tiles. Plan 01 hard-coded centerQ=1,centerR=0 to fix this. Verify visually at checkpoint that stones ring the player hex, not the shrine.

---

## Step 13 — break-trap

- **Step index:** 13
- **action:** `stone-broken`
- **advance via:** `onStoneBroken(stoneType, x, y)` — called from game-core.js line 2736 (`TutorialMode.onStoneBroken(stone.type, stone.x, stone.y)`) after stone confirmed removed. Handler checks `step.action === 'stone-broken'` (tutorial-mode.js line ~811), then calls `clearHintTimer()` + `clearPatternPoll()` + `setTimeout(advance, 400)`.
- **hook branch matches:** YES — grep confirms `TutorialMode.onStoneBroken` at game-core.js:2736, and handler branch at tutorial-mode.js: `if (step.action === 'stone-broken')`.
- **spotlight:** none
- **boardRing:** YES — `boardRing: true, boardRingTarget: PLAYER_POS` (added by this plan, Task 1). Ring renders at `hp(1,0)` (player start hex). `freeMove: true` so pawn is not restricted.
- **prepareStepEntry:** `window.addAP(5)` called before modal renders — tops player to 5 AP (cost to break one Earth stone).
- **concerns:** None. Ring and AP grant both verified by Task 1 automated checks.

---

## Step 14 — opponent-retrap

- **Step index:** 14
- **action:** `scripted-ai`
- **advance via:** `setTimeout(advance, 800)` inside `runScriptedOpponentRetrap` callback, queued 1200 ms after step renders (same pattern as step 12).
- **hook branch matches:** yes — handled directly in `showStep()` under `step.id === 'opponent-retrap'` (lines ~678–685).
- **spotlight:** none
- **boardRing:** none
- **prepareStepEntry:** `window.addAP(3)` called — grants 3 AP for movement after the second ring.
- **concerns:** Copy now correctly says "Wind and Fire stones to your pool" (Task 1). AP is 3 here (not 5), which is intentional — player cannot break through this ring by brute force (breaking Earth costs 5). Verify at checkpoint that players don't get confused.

---

## Step 15 — wind-escape

- **Step index:** 15
- **action:** `stone-placed-wind`
- **advance via:** `onStonePlaced(stoneType, x, y)` — called from game-core.js line 6430 (`TutorialMode.onStonePlaced(type, x, y)`). Handler branch: `else if (step.action === 'stone-placed-wind' && stoneType === 'wind')` (tutorial-mode.js line ~798–800), then `clearHintTimer()` + `setTimeout(advance, 400)`.
- **hook branch matches:** YES — grep confirms `TutorialMode.onStonePlaced` at game-core.js:6430; separate `stone-placed-wind` branch checks `stoneType === 'wind'` explicitly (no false-positive from earth/fire placements).
- **spotlight:** none
- **boardRing:** none
- **allowedHexes / freeMove:** Neither field present — movement is unrestricted. Confirmed by grep: no `allowedHexes` or `freeMove: false` in this step block.
- **prepareStepEntry:** `ss.playerPool.wind += 2` if `wind < 1` — ensures at least 2 wind stones in pool before modal renders.
- **concerns:** None.

---

## Step 16 — fire-counter

- **Step index:** 16
- **action:** `stone-placed-fire`
- **advance via:** `onStonePlaced(stoneType, x, y)` — branch: `else if (step.action === 'stone-placed-fire' && stoneType === 'fire')` (tutorial-mode.js line ~801–803), then `clearHintTimer()` + `setTimeout(advance, 400)`.
- **hook branch matches:** YES — same call-site at game-core.js:6430; `stone-placed-fire` branch checks `stoneType === 'fire'` explicitly.
- **spotlight:** none
- **boardRing:** none
- **allowedHexes / freeMove:** Neither field present — movement is unrestricted. Confirmed by grep: no `allowedHexes` or `freeMove: false` in this step block.
- **prepareStepEntry:** `ss.playerPool.fire += 2` if `fire < 1`. Safety net: if no earth stones exist on board, places one at `hp(3,0)` via `placeStoneVisually` so the fire-destroy interaction can trigger.
- **concerns:** Fire-destroy interaction relies on game-core.js stone adjacency logic. Step only gates on `stone-placed-fire`, not on whether an Earth stone was actually destroyed. The visual disappearance is a side effect of the fire placement, not verified by the gate. Should still produce the correct visual outcome in normal play. Verify at human checkpoint.

---

## Step 17 — hud

- **Step index:** 17
- **action:** `read`
- **advance via:** `tmode-next` button click → `advance()`. The `step.nextLabel` is `"I'm ready!"` (set in STEPS, line ~324). `showModal` renders the button when `step.nextLabel` is non-null and `step.action` is NOT in `actionHints`. `read` is NOT in `actionHints`, so the button renders. Button's `click` listener calls `advance()` (showModal line ~557).
- **hook branch matches:** yes — no external hook needed; `read`-action steps are fully modal-button-driven.
- **spotlight:** `#hud-ap-pips` — element exists in index.html (line 283: `<div class="hud-ap-pips" id="hud-ap-pips">`). Spotlight is non-blocking (action is `read`, not `click`).
- **concerns:** None. Next button wiring confirmed. AP pips element confirmed present.

---

## Step 18 — finish

- **Step index:** 18
- **action:** `read`
- **advance via:** `tmode-next` button click → `advance()`. `step.nextLabel` is `'Start Playing'`. Since index 18 is the last STEPS entry (`nextIdx = 18; STEPS.length = 19; nextIdx < STEPS.length` → false), `advance()` calls `finish()` instead of `showStep(19)`.
- **finish() behavior:** `closeModal()` → `clearSpotlight()` → `removeBoardRing()` → `hideExitButton()` → `window.isTutorialMode = false` → `window.location.reload()`. Page reloads cleanly to lobby/auth.
- **hook branch matches:** yes — no external hook; pure button-driven.
- **spotlight:** none
- **concerns:** None. Exit path is clean.

---

## Wiring Verification Summary

### game-core.js hook call-sites

| Hook | File | Line |
|------|------|------|
| `TutorialMode.onStoneBroken` | js/game-core.js | 2736 |
| `TutorialMode.onStonePlaced` | js/game-core.js | 6430 |

Both call-sites confirmed present.

### onStonePlaced branch structure (tutorial-mode.js ~791–804)

```
if (step.action === 'stone-placed' && (!step.stoneType || step.stoneType === stoneType))
  → earth stone gate (step 9 only)
else if (step.action === 'stone-placed-wind' && stoneType === 'wind')
  → step 15 gate
else if (step.action === 'stone-placed-fire' && stoneType === 'fire')
  → step 16 gate
```

No cross-contamination: fire placement cannot trigger wind gate and vice versa.

### onStoneBroken branch structure (tutorial-mode.js ~808–815)

```
if (step.action === 'stone-broken')
  → step 13 gate only
```

Single branch — only fires when the current step expects a stone break.

### Movement freedom for steps 15–16

- `wind-escape`: no `allowedHexes`, no `freeMove: false` — movement unrestricted.
- `fire-counter`: no `allowedHexes`, no `freeMove: false` — movement unrestricted.

Confirmed by grep: neither step contains the string `allowedHexes`.

### Spotlight element existence in index.html

| Step | Selector | Exists |
|------|----------|--------|
| 17 (hud) | `#hud-ap-pips` | YES (index.html:283) |
| 3 (move-pawn) | `#hud-ap-value` | YES (index.html:291) |
| 5 (earth-shrine) | `#end-turn` | YES (index.html:266) |
| 6,4 (open-scrolls, scroll-found) | `#panel-btn-hand` | YES (index.html:451) |
| 11 (cast-avalanche) | `#cast-spell` | YES (index.html:454) |

All spotlight selectors resolve to existing elements.

---

## Items Flagged for Human Checkpoint

1. **Step 12:** Confirm trap stones land on player-surrounding hexes (not shrine tiles).
2. **Step 13:** Confirm board ring appears at player pawn position (not shrine center). Confirm AP shows 5+.
3. **Step 14:** Confirm second ring appears east. Confirm wind/fire stones appear in dock before step 15.
4. **Step 16:** Confirm fire placement visually destroys an adjacent Earth stone (fire-destroy side effect, not gate-tested).
5. **Step 18:** Confirm page reloads cleanly to lobby/auth after "Start Playing" click.
