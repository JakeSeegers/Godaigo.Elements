# Roadmap: Godaigo Tutorial Improvements

**Project:** GTUT — Godaigo Tutorial Improvements + UI Redesign
**Phases:** 4
**Requirements mapped:** 11 / 11 ✓ (tutorial) + UI phase TBD
**Created:** 2026-04-27

---

## Phase 1: Earth Shrine Wiring

**Goal:** Wire the missing `onEndTurn` hook and insert the Earth Shrine tutorial step so players can collect stones within the tutorial — the foundational mechanic that all later steps depend on.

**Requirements:** WIRE-01, WIRE-02, WIRE-03

**Files in scope:**
- `js/game-core.js` — add `onEndTurn` hook call inside `endTurn()`
- `js/tutorial-mode.js` — insert new step, wire `onPlayerMoved` proximity check, wire `onEndTurn` handler

**Success criteria:**
1. `endTurn()` in game-core.js calls `window.TutorialMode?.onEndTurn?.()` when `window.isTutorialMode` is true
2. After flipping the Earth tile (step 4), a new step spotlights the board and instructs the player to walk to the shrine center and end their turn
3. When the player ends turn at `EARTH_POS`, the tutorial advances and shows they collected 5 earth stones
4. No JS console errors during steps 1–5 (renumbered)

**UI hint:** no

---

## Phase 2: Bug Fixes, E2E Verification & Copy

**Goal:** Fix the source pool win-condition bug, verify all 16 steps run cleanly end-to-end, and sharpen the tutorial copy so limits are explicit.

**Requirements:** BUG-01, BUG-02, E2E-01, E2E-02, E2E-03, COPY-01, COPY-02

**Files in scope:**
- `js/game-core.js` — `applyScrollEffects()` source pool guard
- `js/tutorial-mode.js` — step text copy edits, any dead-end fixes surfaced during playthrough
- Manual playthrough of all 16 steps

**Success criteria:**
1. Casting a scroll when its element's source pool is 0 does not add to `spellSystem.activated`; a status message appears instead
2. Steps 1–8 complete in sequence in a real browser session with no errors
3. Steps 9–16 complete in sequence in a real browser session with no errors
4. Tutorial exit from any step returns to lobby/home — no stranded board state
5. Step 7 (scroll inventory) text explicitly mentions "max 2 per area"
6. Step 9 (stone collection) text explicitly states per-type limits and 25-cap source pool

**UI hint:** no

---

## Phase 3: Dead Code Cleanup

**Goal:** Remove the deprecated `tutorial.js` modal system so the codebase has a single tutorial path and no dead load overhead.

**Requirements:** CLEAN-01

**Files in scope:**
- `js/tutorial.js` — delete file
- `index.html` — remove `<script src="js/tutorial.js">` tag
- Any remaining references to old modal IDs (`#tutorial-modal`, etc.)

**Success criteria:**
1. `tutorial.js` is deleted from the repo
2. `index.html` no longer loads `tutorial.js`
3. No JS console errors on page load (no missing-script errors)
4. No visual regressions on the lobby or game screens

**UI hint:** no

---

## Phase 4: HUD, Dock and Typography Redesign

**Goal:** Redesign the game's top HUD bar and bottom dock to match the v3 mockup design language: shrine progress dots (5 element slots in HUD), AP pip bar, stone pool chip display (`E 2/25` format) in the dock, player roster cards. Update global typography to Space Grotesk + JetBrains Mono with improved contrast and readability throughout the UI.

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05

**Depends on:** Phase 3

**Files in scope:**
- `css/styles.css` — design tokens (colors, fonts, spacing), HUD bar, dock, player cards, stone chips, AP pips, shrine dots
- `index.html` — font imports (Google Fonts), HUD structure, dock structure, player card markup
- `js/game-ui.js` — dynamic shrine dot updates, AP pip rendering, stone chip count updates

**Reference design:**
- `C:\Users\aikij\Downloads\Godaigo v3.html` — layout structure and component patterns
- `C:\Users\aikij\Downloads\godaigo-v3.css` — design tokens: `--bg:#0e0b18`, `--panel:#1d1831`, `--ink:#f3ecd8`, element colors, font variables

**Success criteria:**
1. HUD bar is ~56px tall, dark background, contains: shrine progress (5 colored dots), AP pip bar + number, turn indicator, End Turn button
2. Bottom dock is ~68px tall, contains: 5 stone chip counters (`E 2/25` format), player roster cards
3. Space Grotesk loaded and applied to headings/labels; JetBrains Mono applied to numbers/data
4. All text passes WCAG AA contrast (white on dark backgrounds, no gray-on-gray)
5. No visual regressions on lobby screen or tutorial modal

**UI hint:** yes — reference `C:\Users\aikij\Downloads\Godaigo v3.html` + `godaigo-v3.css` for design tokens

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 4 to break down)

---

## Milestone: Tutorial Complete

After all 3 phases pass verification:
- All 11 v1 requirements checked off
- Full tutorial playthrough recorded/tested
- `planning/current.md` updated with next session tasks
- Git tag: `tutorial-complete`
