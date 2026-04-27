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
