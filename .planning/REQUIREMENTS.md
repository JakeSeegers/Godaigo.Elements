# Requirements: Godaigo Tutorial Improvements

**Defined:** 2026-04-27
**Core Value:** New player completes the full tutorial end-to-end without hitting a broken step, dead end, or confusing gap.

## v1 Requirements

### Step Wiring

- [ ] **WIRE-01**: `onEndTurn` hook exists in `game-core.js` and fires when the active player ends their turn during tutorial mode
- [ ] **WIRE-02**: Tutorial detects when the player pawn is at the Earth shrine center (`EARTH_POS`) at turn end and triggers stone collection confirmation
- [ ] **WIRE-03**: New tutorial step (Earth Shrine) inserted between current steps 4 and 5 — guides player to walk to shrine center and end turn

### Bug Fixes

- [ ] **BUG-01**: Source pool win-condition check added in `applyScrollEffects()` — casting a scroll when source pool for that element is 0 does NOT count toward win condition
- [ ] **BUG-02**: Status message displayed to player when source pool win-condition is blocked (pool empty)

### End-to-End Verification

- [ ] **E2E-01**: Steps 1–8 run without JS errors or dead ends in a full playthrough
- [ ] **E2E-02**: Steps 9–16 (renumbered after shrine step insertion) run without JS errors or dead ends
- [ ] **E2E-03**: Tutorial exit from any step lands back on lobby/home (not a stranded board state)

### Copy & UX Clarity

- [ ] **COPY-01**: Tutorial step text for the Hand/Active Area step explicitly states the 2-scroll-per-area limit
- [ ] **COPY-02**: Tutorial step text for the stone collection step explicitly states the per-type stone limits (Earth=5, Water=4, Fire=3, Wind=2, Void=1) and source pool cap (max 25 shared)

### Cleanup

- [ ] **CLEAN-01**: `tutorial.js` dead modal code removed from codebase and `index.html` script load

## v1 Requirements — Phase 5: Kinesthetic Tutorial Redesign

### Action Gating — Every Step Must Be Earned

- [ ] **KINE-01**: Replace every `action: 'read'` step with an action-gated equivalent — no step advances via Next button unless the player has performed the required physical action
- [ ] **KINE-02**: Stone placement step — after collecting Earth stones (step 5), player must drag at least one Earth stone adjacent to their pawn before the tutorial advances
- [ ] **KINE-03**: Avalanche casting requirement — player must move the Avalanche scroll to Active Area, build the required stone pattern on the board, and cast it before the tutorial advances
- [ ] **KINE-04**: Scroll move hook — tutorial detects when player moves a scroll from hand → active (via `onScrollMoved` hook); used to gate the "move your scroll to Active Area" step
- [ ] **KINE-05**: Pattern-built detection — tutorial detects when the Avalanche pattern is built on the board (via existing `checkPattern` or board-scan logic); gates the "now cast it" prompt

### Scripted Opponent AI — Trap & Escape Sequence

- [ ] **KINE-06**: After player successfully casts Avalanche, a scripted opponent AI turn fires: places Earth stones in a ring around the player's pawn using `placeTile` calls, simulating an earth trap
- [ ] **KINE-07**: Player must break at least one Earth stone to escape the ring (right-click to break) — tutorial detects via `onStoneBroken` hook and advances when a stone is broken from the trap ring
- [ ] **KINE-08**: Opponent re-traps — after player breaks free, scripted AI fires a second trap (same ring pattern, shifted one tile) to create urgency and repeat the mechanic
- [ ] **KINE-09**: Wind stone discovery — tutorial hints that the player can place a Wind stone to move for free; player must place a Wind stone within or adjacent to the second trap ring to advance (zero-AP movement lesson)
- [ ] **KINE-10**: Fire stone counter — tutorial prompts player to use Fire stone to destroy adjacent Earth stones; player must place a Fire stone adjacent to an Earth stone to advance (demonstrates Fire's destroy-adjacent-stone rule)

### New Hooks Required

- [ ] **HOOK-01**: `onStonePlaced(stoneType, hex)` hook in `game-core.js` (inside `addStone` or equivalent stone-placement function) — fires when a stone is placed on the board during tutorial mode
- [ ] **HOOK-02**: `onStoneBroken(stoneType, hex)` hook in `game-core.js` (inside `removeStone` or break-stone handler) — fires when a stone is removed/broken during tutorial mode
- [ ] **HOOK-03**: `onScrollMoved(scrollName, fromArea, toArea)` hook in `game-ui.js` or `scroll-panels.js` — fires when player moves a scroll between areas (hand→active, hand→common, active→common) during tutorial mode
- [ ] **HOOK-04**: `onSpellCast(scrollName)` hook in `game-core.js` (inside `castSpell()`) — fires when player successfully casts a scroll during tutorial mode

### Hint System

- [ ] **HINT-01**: Each action-gated step shows a dismissible hint after 15 seconds of inactivity explaining what action is needed (not a blocker — player can keep trying)
- [ ] **HINT-02**: Scripted AI trap steps include a speech-bubble indicator above the opponent pawn to make the AI action feel intentional (cosmetic only, not interactive)

## v2 Requirements

### Future Enhancements

- **V2-01**: Tutorial progress persists across page refresh (resume from last step)
- **V2-02**: "Skip tutorial" option on lobby screen for returning players
- **V2-03**: Tutorial replay button available from main menu

## Out of Scope

| Feature | Reason |
|---------|--------|
| Transmute bugs (TRANS-WIN-CON, TRANS-DOUBLE-DISP) | Tracked separately in TODO.md; not tutorial-flow blockers |
| Multiplayer tutorial | No design exists for 2-player guided mode |
| Voice narration re-recording | Audio assets out of scope |
| Tutorial analytics/completion tracking | Future milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIRE-01 | Phase 1 | Pending |
| WIRE-02 | Phase 1 | Pending |
| WIRE-03 | Phase 1 | Pending |
| BUG-01 | Phase 2 | Pending |
| BUG-02 | Phase 2 | Pending |
| E2E-01 | Phase 2 | Pending |
| E2E-02 | Phase 2 | Pending |
| E2E-03 | Phase 2 | Pending |
| COPY-01 | Phase 2 | Pending |
| COPY-02 | Phase 2 | Pending |
| CLEAN-01 | Phase 3 | Pending |
