# js/ — Module Index

> See parent: [CLAUDE.md](../CLAUDE.md)
> Scroll system submodule: [scrolls/INDEX.md](scrolls/INDEX.md)

---

## FILE MAP

| File | Lines (approx) | Responsibility |
|------|---------------|---------------|
| `config.js` | ~50 | Supabase client init, game constants (`TILE_SIZE=20`, `STONE_TYPES`, `PLAYER_COLORS`, `stoneCapacity=5`) |
| `game-core.js` | ~5000 | **Core engine**: `SpellSystem` class, tile placement, pawn movement, stone system, AP management, win conditions, turn logic, hex math |
| `game-ui.js` | ~3200 | **UI layer**: drag-drop for pawns/stones/tiles, HUD updates, panel collapse, scroll deck UI, opponent panel, common area |
| `lobby.js` | ~3500 | Auth (Supabase), multiplayer room management, `startGame()`, player ready system, broadcast handlers, mobile UI |
| `multiplayer-state.js` | ~200 | Shared state bucket: `myPlayerId`, `currentGameId`, `isMultiplayer`, `myPlayerIndex`, turn validation helpers |
| `tutorial.js` | ~200 | Legacy 7-step modal (in-game hint, session-dismissable). Do not confuse with `tutorial-mode.js`. |
| `tutorial-mode.js` | ~600 | Interactive guided tutorial: board auto-setup, spotlight system, step machine, movement gating, tile-reveal hooks |
| `parallax.js` | ~100 | Injects animated background layers (space drift + 4 clouds) with CSS keyframes. No game deps. |
| `gamification.js` | ~600 | `window.gami`: XP/gold engine, Supabase profile sync, daily login bonus, `onElementActivated()` |
| `gamification-ui.js` | ~800 | Profile modal (6 tabs: Stats, Colours, Emojis, Badges, Leaderboard, Settings) |
| `emoji-system.js` | ~500 | 83 emojis across 6 gold tiers, purchase validation, pawn overlay display |
| `cosmetics-system.js` | ~300 | Name colour cosmetics (6 tiers), localStorage persistence, equip/purchase logic |
| `crt-overlay.js` | ~400 | Canvas CRT effects: scanlines, vignette, grain, flicker. Per-user Supabase prefs. |

---

## game-core.js — Deep Notes

### SpellSystem class (instantiated as `spellSystem`, exposed as `window.spellSystem`)
- `playerScrolls[]` — per-player inventory: `{hand: Set, active: Set, activated: Set}`
- `scrollDecks{}` — draw piles per element; override via `window.tutorialDeckOverride` before `initializeDeck()`
- `onTileRevealed(element)` — draws top scroll from element deck into active player's hand
- `patternMatchesBoard(scroll, playerHex)` — checks if stone pattern exists around player position
- `activateScroll(scrollId, playerIndex)` — validates pattern + 2 AP, fires effect, tracks win condition

### Key standalone functions
- `hexToPixel(q, r, size)` → `{x, y}` — flat-top hex math. `size=TILE_SIZE(20)` for stones, `size=TILE_SIZE*4(80)` for tiles
- `pixelToHex(x, y, size)` → `{q, r}`
- `placeTile(x, y, rotation, flipped, shrineType, isPlayerTile, skipMP, forcedId)` — creates SVG tile group, assigns color, calls `placePlayer()` for player tiles. Fires `TutorialMode.onPlayerTilePlaced()` hook.
- `revealTile(tileId)` — flips hidden tile: fires `onTilePreReveal` (before visual), builds SVG, fires `onTileRevealed` (after visual), draws scroll
- `addAP(amount)` — respects max AP (5 + void bonus), updates HUD, calls `syncPlayerState()`
- `initializeDeck(numPlayers, seed)` — checks `window.tutorialDeckOverride` first; if set, uses it and nulls the override
- `generateSpiralPositions(n)` — returns world coords for n tiles in spiral order (defined in game-ui.js)

### gotchas
- `placedTiles[]` is the source of truth for board state. `tile.flipped=true` means hidden.
- `activePlayerIndex` governs whose turn it is. In single-player/tutorial, it's always 0.
- `playerPositions[]` entries hold `{x, y, element, color, index}`. Color is always stored as **hex** (`#9b59b6`), not name (`purple`). Bug was COLOR_RANK returning undefined when name stored instead of hex.
- `tileDeck[]` is consumed sequentially (no reshuffle after init). Index tracked by `deckIndex`.
- AP max is 5 by default; each void stone in player pool raises it by 1 (`updateVoidAP()`).
- `skipMultiplayerLogic=true` bypasses broadcast and turn-advance. Used for tutorial cosmetic placements and visual-only syncs from remote broadcasts.

---

## game-ui.js — Deep Notes

### Drag systems (3 independent state machines)
1. **Pawn drag** (`isDraggingPlayer`) — mousedown on `.player` SVG, constrained by AP and hex grid, calls `revealTile()` on unflipped destination
2. **Stone drag** (`isDraggingStone`) — mousedown on stone-card or placed stone SVG, drops onto hex grid
3. **Tile drag** (`isDraggingTile`) — mousedown on `.deck-tile` or placed tile (if `tileMoveMode`), snaps to valid positions

### Tutorial integration in game-ui.js
- Pawn drop handler checks `tutorialBlocked` (allowed hexes set) before accepting move
- Calls `TutorialMode.onPlayerMoved(x, y)` after successful pawn placement
- `startPlayerTileDrag()` is the entry for dragging player tiles from the deck

### generateSpiralPositions(n) — spiral order
Position 0 = `(0,0)` (center). For 1-player tutorial: 6 tiles, positions 0–5. Earth is always at position 0 when `tutorialDeckOverride` is active.

---

## lobby.js — Deep Notes

### startGame(numPlayers) — local single-player launch
1. `clearBoard()` → reset all state
2. Hide `#lobby-wrapper`, show `#game-layout`
3. `initializeDeck(numPlayers)` — checks tutorialDeckOverride
4. `initializePlayerTiles(numPlayers)` — creates draggable SVG tiles in left panel
5. Places `numPlayers * 6` tiles via `generateSpiralPositions()` + `placeTile()`
6. Exposed as `window.startGame` explicitly at bottom of file

### Auth flow
- Page load → `checkAuthSession()` → if session exists, `onAuthSuccess()` immediately (skips auth screen)
- Logged-in users go directly to `#multiplayer-lobby` → `#game-browser-panel`
- Tutorial button lives on `#auth-screen` only — logged-in users never see it

### Mobile UI
- `syncMobileStoneDeck()` uses `stoneCounts[type]` and `stoneCapacity`. `shuffledDeck` reference was a bug (fixed: replaced with `/25`).
- `updateIsMobile()` calls `initializeMobileUI()` which calls `syncMobileStoneDeck()` — triggered by `startGame()`.

### Host ready system
- Host is auto-marked ready in DB when creating room
- `updateReadyButton()` hides ready button for host
- `updatePlayerList()` shows Start button when `totalCount >= 2` (no longer requires `hostIsReady`)

---

## tutorial-mode.js — Deep Notes

### Module pattern
IIFE assigned to `const TutorialMode`, then `window.TutorialMode = TutorialMode`. Not a class.

### Step machine
- `STEPS[]` array, 15 entries (index 0–14)
- `action` field: `'read'` (button), `'click'` (spotlit element), `'move'` (position gate), `'explore'` (tile reveal gate), `'place-tile'` (tile placement gate)
- Blocking overlay ONLY created for `action:'click'` — all other actions leave the board interactive

### Tutorial hooks (called from game-core.js)
| Hook | Called from | When |
|------|------------|------|
| `onTilePreReveal(tile)` | `revealTile()`, before visual | Forces `tile.shrineType='earth'` on first flip in step 3 |
| `onTileRevealed(tile, ss)` | `revealTile()`, after visual | Advances step 3→4 after tile flip |
| `onPlayerTilePlaced()` | `placeTile()`, after pawn placed | Advances step 1→2 |
| `onPlayerMoved(x, y)` | game-ui.js, after pawn drop | Currently no-op |

### Board geometry constants
```js
const S = 80;  // largeHexSize = TILE_SIZE * 4
hp(q, r) = { x: S*√3*(q+r/2), y: S*1.5*r }  // matches hexToPixel(q,r,80)
EARTH_POS = hp(0,0) = {x:0, y:0}      // spiral position 0
PLAYER_POS = hp(1,0) = {x:138.6, y:0} // NOT used for auto-placement (removed)
```

### Deck override
Set `window.tutorialDeckOverride = ['earth','catacomb','water','fire','wind','void']` BEFORE `startGame()`. `initializeDeck()` checks this and returns early after applying it. The override is nulled after use.

---

## Window Globals — Quick Reference

```js
// Game state
window.spellSystem          // SpellSystem instance
window.isMultiplayer        // bool
window.myPlayerIndex        // int
window.isTutorialMode       // bool
window.tutorialAllowedHexes // Set<'x,y'> | null
window.tutorialDeckOverride // string[] | null

// Functions
window.startGame(n)         // launch local game with n players
window.placeTile(...)       // place a tile on the SVG board
window.placePlayer(x,y,c)  // place a pawn
window.revealTile(id)       // flip a hidden tile
window.addAP(n)             // add n action points (respects max)
window.movePlayerVisually(i,x,y,ms)  // animate pawn

// Modules
window.TutorialMode         // tutorial-mode.js public API
window.ScrollEffects        // scroll-effects.js namespace
window.SCROLL_DEFINITIONS   // all scroll metadata
window.SCROLL_DECKS         // scroll draw piles by element
window.gami                 // gamification service
window.crtOverlay           // CRT effect manager
window.emojiSystem          // emoji reactions
window.cosmeticsSystem      // name colour cosmetics

// Debug
window.dumpGameDebug()      // full state dump
window.KNOWN_BUGS           // array of bug objects
window.IMG_V                // cache-bust token e.g. '?v=2'
```
