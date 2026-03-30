# Godaigo – Project TODO - This TODO is innacurate and needs to be corrected. Many of these things are already fixed

High-level task list for the Godaigo game project. Update this as you complete or add work.

---

## 🔴 In progress / Broken

### Wandering River (Water IV) – **not fixed, still broken**
- Intended: transform any non–player tile to count as a chosen element until the start of your next turn. Flip gives that element’s scroll; end turn on tile gives that element’s stones; red fire indicator; buff clears at beginning of your next turn.
- Current state: little progress; behavior is still wrong or missing. Needs full pass:
  - [ ] Tile selection mode: confirm clicks register and selection + element picker complete.
  - [ ] Buff storage: confirm `activeBuffs.wanderingRiver` is written/read with correct `tileId` (id type consistency).
  - [ ] Scroll on flip: `revealTile()` uses effective element for `onTileRevealed`; confirm void (and other) scrolls are granted when flipping a transformed tile.
  - [ ] Stone on end turn: shrine replenish uses effective element; confirm standing on transformed tile gives correct stones.
  - [ ] Indicator: red fire symbol (♦) and red styling; re-apply after tile reveal (element is replaced on reveal).
  - [ ] Clearing: clear at start of caster’s next turn (multi and single player); confirm `clearWanderingRiverForPlayer` is called in all end-turn paths and on receiving turn-change in multiplayer.

---

## ✅ Completed (other)

- **End-of-turn scroll overflow** – Modal to resolve hand/active overflow; “make space” flow (active → common, then hand → active).
- **Scroll / UI** – Stone formation display, common area/opponent popout toggles, Shifting Sands fix, spell selection close button, scroll state validation, Inspiring Draught fix, initial stone counts for testing.

---

## 🔲 To do / Backlog

### **Complete ability code for all scrolls (Water, Fire, Wind, Void, Catacomb)**
- Implement or finish the **effect logic** for every scroll in `js/scrolls/effects/scroll-effects.js` so each scroll’s ability works as designed.
- **Water (5):** I–III and V have effects; **IV (Wandering River)** is broken (see above). Ensure all five are correct.
- **Fire (5):** I–V have effect stubs; verify and complete behavior for each (e.g. Unbidden Lamplight, Arson, Sacrificial Pyre, Scorched Earth, Burning Motivation).
- **Wind (5):** All five entries exist in `effects`; verify each ability works correctly.
- **Void (5):** All five entries exist in `effects`; verify each ability works correctly.
- **Earth (5):** I–V have effects; verify Iron Stance, Shifting Sands, Heavy Stomp, etc. are complete.
- **Catacomb (10):** All ten entries exist in `effects`; verify each ability works correctly.
- Use `js/scrolls/scroll-definitions.js` and `docs/game-design-document.md` for names, descriptions, and intended behavior.

### Game design & content
- [ ] **Reaction phase** – Allow responses with scroll activations (see design doc).
- [ ] **Game phases** – Expand Main Phase, Reaction Phase, etc. in code and UI.
- [ ] **Balance / content** – Scroll balance, deck sizes, stone counts (beyond test values).

### Scroll system
- [ ] **Scroll limits** – Confirm MAX_HAND_SIZE / MAX_ACTIVE_SIZE (currently 2/2) and any per-mode overrides.
- [ ] **Common area rules** – Max one scroll per element; clarify behavior when full.
- [ ] **Catacomb / multi-element** – Ensure all catacomb patterns and win-condition contributions work as designed.

### Multiplayer & sync
- [ ] **Wandering River in MP** – Turn-change and clear logic when receiving `turn-change` from network (lobby.js).
- [ ] **Scroll overflow modal in MP** – Overflow modal and Done path sync state correctly with other clients.
- [ ] **Tile flip / reveal sync** – Effective element (Wandering River) consistent when tile is revealed by another client.

### UI / UX
- [ ] **Indicators** – Any other “transformed” or temporary effects that need a clear indicator.
- [ ] **Accessibility** – Keyboard/screen reader support, focus management in modals.
- [ ] **Mobile / responsive** – Touch, viewport, and layout on small screens.

### Code quality & docs
- [ ] **TODO/FIXME in code** – Search codebase for inline TODOs and either implement or move to this file.
- [ ] **Tests** – Unit or integration tests for SpellSystem, scroll effects, turn/overflow logic.
- [ ] **Design doc** – Keep `docs/game-design-document.md` in sync with implemented rules.

### Optional / polish
- [ ] **Save / load** – Save game state (tiles, scrolls, turn, AP) and resume.
- [ ] **Replay or log** – Optional action log or replay for debugging and clarity.
- [ ] **Performance** – Profile and optimize if needed.

---

## 📁 Key files

| Area              | Files |
|-------------------|--------|
| Core game logic   | `js/game-core.js` |
| UI & input        | `js/game-ui.js` |
| Scroll effects    | `js/scrolls/effects/scroll-effects.js` |
| Scroll data       | `js/scrolls/scroll-definitions.js` |
| Multiplayer       | `js/lobby.js`, `js/multiplayer-state.js` |
| Styles            | `css/board.css`, `css/styles.css` |
| Design            | `docs/game-design-document.md` |

---

*Last updated: Wandering River marked broken; added full scroll-ability task for Water, Fire, Wind, Void, Catacomb (and Earth verification).*
