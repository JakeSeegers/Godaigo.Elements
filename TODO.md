# Godaigo – Project TODO

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
- **Shifting Sands (Earth II) – ability rule change** – Tiles with stones are still ineligible, but a tile with exactly one player is now a valid swap target (the player is carried along and recentered on the tile after the swap); tiles with 2+ players remain ineligible. Added dedicated `isTileEligibleForShiftingSands()` / `getEligibleTilesForShiftingSands()` in `scroll-effects.js` rather than loosening the shared `getEligibleTilesForSwap()` — Telekinesis (drag highlighting) and Heavy Stomp (`getEligibleTilesForFlip()`) both still call the shared function and keep the old, stricter no-players rule. Updated `scroll-definitions.js` description and the multiplayer `tile-swap` receiver in `lobby.js` to recenter the carried player on other clients (same `movedPlayers` shape as the existing `telekinesis-move` handler).
- **Take Flight (Wind IV) – destination rule + who chooses** – New destination rule: must be an unoccupied hex on a tile currently occupied by another player (not a player tile); cancels with no drag UI shown if no valid destination exists for the chosen target. New chooser rule: self-target still has the caster choose (as before); opponent-target now hands the choice to the TARGET instead. In real multiplayer (`isMultiplayer` true, target on a different client) that's a genuine hand-off — caster broadcasts `take-flight-choose-request`, the target's own client runs the drag UI (`ScrollEffects.enterTakeFlightChoiceAsTarget`) and broadcasts the result back (`take-flight`), which the caster's client (which stashed a `window.pendingTakeFlightCompletion`) uses to resolve its own `onSelectionEffectComplete`; either side can cancel via `take-flight-cancel-request`. Outside real multiplayer (solo/hotseat) the casting client still drives the drag directly for the opponent, same as the old behavior. Destination legality (`getValidTakeFlightDestinations()`/`isValidTakeFlightDestination()` in `scroll-effects.js`) is shared by the human drop-handler (`game-ui.js`) and the bot's `driveTakeFlightDrag()` so neither can propose an illegal drop.
- **Take Flight – bot response when it's the one choosing** – `driveTakeFlightDrag()` (`bot-effects.js`) now rolls a uniform-random valid destination instead of its old goal-seeking-toward-hidden-tiles heuristic, and responds immediately rather than never acting. It resolves ANY open `take-flight-drag` selection (not just self-targeted ones), so in local/arena play (`isMultiplayer` false) it also stands in for a bot-controlled opponent being targeted, since that drag still runs on the same page.
- **Take Flight – bot-driver.js integration for a bot added via the lobby's "Add Bot" button** – Corrects an earlier wrong assumption in this file: bots added this way (`js/bot-driver.js`, a real `players` row per bot, host's browser impersonates it via `asBot()`) are a completely different system from `bot.js`/`BotArena`'s Shift+B / arena-simulation tools, and were never covered by the `driveTakeFlightDrag()` fix above — the `take-flight-choose-request` broadcast only ever checked `myPlayerIndex === targetPlayerIndex` in `lobby.js`, which is never true for the host merely *driving* a bot (impersonation only happens transiently inside `asBot()`), so a targeted lobby-added bot silently did nothing. Fixed in two parts:
  - **Different client drives the bot** (a guest targets a bot the host drives): `lobby.js`'s listener falls back to `BotDriver.resolveTakeFlightChoice()` (`bot-driver.js`) when the target isn't the local human player; it checks `BotDriver.isBot(targetPlayerIndex)`, impersonates via `asBot()` (same discipline as `driveBotTurn()`), rolls a random valid destination via `ScrollEffects.getValidTakeFlightDestinations()`, and finalizes via `ScrollEffects.finalizeTakeFlightChoice()` — broadcasting `take-flight-cancel-request` instead if none exist.
  - **Same client is both caster and bot-driving host** (the common single-browser "host adds a bot, then plays as the human themselves" setup — turned out to be the actual repro): the broadcast round-trip above can never work here regardless of the fix, because `lobby.js`'s channel is `broadcast:{self:false}` — a client never receives its own sends. `enterTakeFlightMode()` (`scroll-effects.js`) now detects this case (`isHost && isMultiplayer && BotDriver.isBot(targetPlayerIndex)`) and skips the broadcast hand-off entirely: it still calls the normal local `_enterTakeFlightDrag()` setup, then immediately calls `BotEffects.driveSelection()` (dispatches on the `take-flight-drag` selectionMode it just opened) to resolve it synchronously, right then, with zero broadcast dependency.
- **Take Flight – dropped the hand-vs-active-area disposition rule** – The scroll now always stays in the caster's active area no matter who's targeted; removed the old "opponent target -> scroll moves to their hand" mutation from `finalizeTakeFlightChoice()` (`scroll-effects.js`) and the matching sync block from the `take-flight` broadcast receiver (`lobby.js`).

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

### Economy / purchases
- [ ] **Emoji/cosmetics purchases live in `localStorage`, not the database** –
  found while building Bot Tycoon capture stones (`docs/bot-tycoon-proposal.md`).
  `js/emoji-system.js`'s `purchaseEmoji()` deducts gold via the real
  `award_gold` RPC but then persists WHICH emojis you own to
  `localStorage['godaigo_emojis_' + userId]` (`loadInventory()`/
  `saveInventory()`), not to any Supabase table — same for cosmetics
  (`js/cosmetics-system.js`, same pattern). Consequence: clearing browser
  storage, switching browsers, or switching devices silently loses
  everything you've paid gold for, even though the gold deduction itself
  is real and permanent. The `shop_items` table and `user_profiles.inventory`
  jsonb column both exist in the schema and LOOK like they were meant for
  exactly this — `shop_items` has 0 rows and `inventory` is unused; neither
  is actually read by the current purchase code. Should be migrated to a
  real per-user, per-item ownership table (or at minimum write into
  `user_profiles.inventory`) so purchases survive across devices/sessions
  like gold and XP already do. Capture stones (`user_profiles.capture_stones`
  column + `captured_bots` table) were deliberately built the RIGHT way
  from the start rather than copying this pattern — see that entry in
  `planning/current.md`.

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

*Last updated: added Economy/purchases backlog item — emoji/cosmetics purchases persist to localStorage instead of the database, found while building Bot Tycoon capture stones.*
