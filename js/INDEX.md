# js/ — Module Index

> See parent: [CLAUDE.md](../CLAUDE.md)
> Scroll system submodule: [scrolls/INDEX.md](scrolls/INDEX.md)

---

## FILE MAP

| File | Lines (approx) | Responsibility |
|------|---------------|---------------|
| `config.js` | ~50 | Supabase client init, game constants (`TILE_SIZE=20`, `STONE_TYPES`, `PLAYER_COLORS`, `stoneCapacity=5`) |
| `game-core.js` | ~5000 | **Core engine**: `SpellSystem` class, tile placement, pawn movement, stone system, AP management, win conditions, turn logic, hex math |
| `game-ui.js` | ~3200 | **UI layer**: drag-drop for pawns/stones/tiles, HUD updates, panel collapse, scroll deck UI, opponent panel, common area. `initBotTrainingPanel()` builds the player-facing "🧬 Bot Training" full-screen modal (`#bot-training-overlay`, triggered by clicking the Profile modal's header 5× in 3s): Players (2/3/4/5/**All**)/Speed/Repeat controls with explainer tooltips — "All" is the generalist mode: `runWeightTraining()` sends `nPlayers:'all'` so training spans mixed 2–5-player arenas and the end gate becomes `BotArena.confirmAcrossSizes()` (champion vs a field of baselines at every size) instead of the fixed-count evolve + 2-player run() gate; breeding rejects "All" (it maps player-count to population size). A Population roster (clickable rows keyed by `bot-arena.js`'s member `id`s, fitness bar, lineage label — "elite (surviving)" / "bred #X×#Y" / "mutated #X" / "seed") and a Generations log, both fed by the shared `handleGeneration(gen, total, fitnessArr, members)` callback wired into `runWeightTraining`'s/`evolve()`'s `onGeneration`. Clicking a roster row opens a weight-diagram detail view (`weightBar()`) grouped by `WEIGHT_CATEGORIES`, comparing that member's weights against `BotSystem.DEFAULT_WEIGHTS`. A separate, outer-scope persistent popup (`ensureTrainingPopup()`/`showTrainingPopup()`/`hideTrainingPopup()`, `#bot-training-status-popup`, fixed bottom-right) shows scenario + progress info for whichever run is active and survives the modal being closed/reopened (unlike the modal's own contents, which are rebuilt fresh each open) — has "End Early → Test Now" (`BotArena.endEarly()`, hidden once the confirming phase starts) and "Stop" (`BotArena.stop()`) buttons, plus an "⤢" button (`window._openBotTrainingPanel`) to reopen the full modal. |
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
| `sounds.js` | ~220 | `window.SoundSystem`: SFX playback, footsteps, login-screen music (muted-autoplay trick) |
| `bot-state.js` | ~300 | `window.BotState`: bot observation/actuation layer — `snapshot()` (pure-JSON state, hidden info masked), `legalActions()`, `applyAction()` (incl. resolving castSpell's multi-match selection popup), Dijkstra `findPath()`. No strategy. Stage 0 of `docs/bot-roadmap.md`. `legalActions()` includes `{type:'teleport', x, y, shrineType}` — catacomb/Freedom shrine hops (free, 0 AP), mirroring `game-ui.js`'s `catacombEligibility()`/`updateCatacombIndicators()` exactly; `applyAction()` executes it via `placePlayer()`, never reimplemented. `applyAction('placeStone')` requires the target to be a REAL board hex (hexGrid() membership) — bot callers pass raw coordinates, and a plan's cells are only board-validated at plan creation, so a Telekinesis/Shifting Sands tile move mid-plan previously let bots place stones onto the empty space where the tile used to be (isInPlacementRange is pure distance; the human drag path gets this check implicitly from grid snapping). `legalActions()` also enumerates TACTICAL placeStone candidates (Stage 4: `scroll:null, tactical:true`) — held earth/wind/fire onto empty hexes adjacent to the pawn, the same freedom a human's drag-drop has; scored purely on terrain-control value in bot.js, never mirrored in bot-sim's own legalActions (root-only, same accepted gap as breakStone/teleport). |
| `bot-sim.js` | ~520 | `window.BotSim`: Stage 2 forward model — PURE `simulate(snap, action)`, `legalActions(snap)`, `isTerminal/winner`, movement-cost + pattern + fire-interaction models, and the `validate()` mirror-and-diff harness (0% divergence measured for move/endTurn/placeStone). Cast effects whitelist-gated via `SIMULATED_SCROLLS`. `simulate()` also handles `teleport` (pure position update) so Hybrid-brain search correctly values teleporting as the immediate root decision — but `legalActions(snap)` itself doesn't yet GENERATE teleport candidates for deeper simulated plies (same category of gap as `breakStone`). |
| `bot.js` | ~400 | `window.BotSystem`: utility-scored bot. Scores every legal action via `WEIGHTS` table (win-condition aware: unactivated elements, empty-source-pool rule, exploration). Stage 2 lookahead: `searchPick()` beam search over BotSim, enabled by `WEIGHTS.searchDepth > 0` (default 0 = greedy), leaves valued by `evaluateSnapshot()`. Cheat-panel "Bot Brain" toggle (AP label 5×) cycles Dumb/Smart/Hybrid via `localStorage['godaigo_bot_brain']`. Shift+R = one step, Shift+B = full turn. Stages 1–2 of `docs/bot-roadmap.md`. Also scores `teleport` (`teleportBase` + `teleportShrineValue`, Stage 5; `teleportRevisitPenalty` applies the same recency-decayed revisit memory movement uses to teleport destinations — both ends of an applied hop are recorded — so free catacomb hops can't ping-pong while fresh destinations keep the full nudge) and values held void pool stones for their standing AP bonus (`evalVoidHeld`/`shrineVoidBonus`/`placeVoidSpendPenalty`, Stage 4). Stage 4 terrain control: `tacticalContext()` (built once per decision, root-only — opponents' cheapest-path hex sets, own objective-path hexes, opponent "loaded gun" threat stones from PUBLIC scrolls) feeds `tacticalPlaceBonus()` into both greedy scoring and searchPick's root — `placeEarthBlock` (wall an opponent's path), `placeWindPath` (pave own route with free movement), `placeFireThreatBreak` (burn a stone a satisfied opponent pattern needs), `placeSelfBlockPenalty`, `placeTacticalStarvesPlan`. `collectibleShrines()` excludes stone-occupied centres (collection = resting there, banned on stones); `botTurn()` steps off a stone before finishing if affordable (endTurn is rejected while resting — a wedged arena game otherwise). |
| `bot-effects.js` | ~900 | `window.BotEffects`: Stage 2.5 scroll-effect usage — **DONE, full choice-space inventory covered**. `driveSelection()` drives every scroll-effect selection choice (tile-flip, scorched-earth, tile-swap, Create, Scholar's Insight, Quick Reflexes, Sacrificial Pyre, Inspiring Draught, Wandering River, Arson, Plunder, Control the Current, Excavate, Take Flight, Telekinesis) instead of `waitForQuiescence()` just cancelling them. Most call the game's own `selectionMode.handleXClick()`/modal `<button>` `onclick` directly, never reimplementing validity — `scroll-select-modal` is shared by Sacrificial Pyre / Inspiring Draught's put-back / Plunder's scroll-pick, routed by the exact heading text each call sets. `rankedOpponents(filterFn)` is the shared "hit the biggest threat" targeting helper for Arson/Plunder. Control the Current (persistent whole-turn ability, no "Done" button) needed a matching non-blocking exception in `bot.js`'s `waitForQuiescence()` rather than a normal driver. Take Flight and Telekinesis are genuinely drag-only at the UI layer (no `handleXClick`/`onComplete(x,y)` covering the actual move) — their drivers call the SAME functions the real drop handler calls (`placePlayer()`/`movePlayerVisually()` + `takeFlightState.onComplete()`; `startTileDrag()` + `placeTile()` + move-counter bookkeeping) instead of simulating drag events or reimplementing game rules. `driveTransmute()` drives Transmute's open-ended discard-for-AP modal (no `selectionMode` object — detected via DOM id, like `EFFECT_MODAL_IDS`). `decideResponse(responderIndex, casterIndex)` drives response-scroll respond/pass — called from `bot.js` (arena, gated on `BotArena.isRunning()`) AND `bot-driver.js`'s `respondForBots()` (real multiplayer, ticks alongside the turn watcher). Relies on an AP-accounting fix in `game-core.js`'s `syncPlayerState()` + `response-window.js`'s `getPlayerAP`/`spendPlayerAP` so a non-active responder's AP is tracked correctly instead of falling back to whichever player is currently active. Full choice-space inventory + scope rationale: `docs/bot-roadmap.md` § CHOICE-SPACE INVENTORY / STAGE 2.5. |
| `bot-arena.js` | ~460 | `window.BotArena`: Stage 3a self-play arena. Shared core `playMatch(weightsPerPlayer, opts)` plays one game for 2–5 players (an `undefined` weights entry leaves WEIGHTS untouched — how `spectate()` uses whatever's currently loaded), calling `ensureLocalMode()` up front so a stale `isMultiplayer=true` from an incomplete online-game leave can never gate the end-turn button and kill a local match. Trap-loop stall restart: if ≥2 bots each end 7 consecutive own turns parked on one revealed elemental tile (each on its own tile), the round is aborted and replayed from scratch with a derived seed (same weights) instead of grinding to the turn cap; `opts.maxStallRestarts` (default 3) caps retries, after which the game is returned as a draw with `result.stalled:true` (`result.restarts` = restarts consumed). A second stall detector shares the same restart machinery: `opts.stallNoCastRounds` (default 15) full rounds with NO bot casting a single scroll (deltas of `BotSystem.castsApplied()`) also aborts+restarts — catches zero-progress loops camping can't see, e.g. free catacomb-teleport ping-pong where the tile alternates every turn. `run(weightsA, weightsB, nGames, seed)` = muted 2-player A/B batch (seeded decks, alternating sides, `sideFitness()`-shaped `aFitness`/`bFitness`); pass `opts.visual:true` to watch it instead. `evolve(generations, opts)` = Gaussian weight evolution — `opts.nPlayers` 2 (default) keeps the original exhaustive pairwise round-robin, >2 samples `opts.gamesPerGen` random N-player groupings per generation, and `'all'` (GENERALIST mode) is the >2 sampling path but each sampled game also draws a fresh player count 2..min(5,popSize) so one run spans arenas of every size at once; `opts.visual:true` watches training games live via the same core as `spectate()`; `opts.onGeneration`/`opts.onGame` progress callbacks feed the cheat panel's Train Weights progress meters. `confirmAcrossSizes(champion, baseline, opts)` = the GENERALIST confirmation gate: instead of run()'s single 2-player duel, it pits the champion against a FIELD of baselines at every size in `opts.sizes` (default [2,3,4,5], `opts.gamesPerSize` default 4), rotating which seat the champion holds for fairness; "improved" = champion total seat-fitness (`seatFitness()`, the N-player generalization of `sideFitness()`) beats the mean baseline seat-fitness across ALL sizes — a better generalist, not just a better duelist. Returns per-size records + aggregate `champWins/baseWins/draws` (with `aWins/bWins` aliases). `runWeightTraining()` (game-ui.js) routes the panel's "All" Players choice through `evolve({nPlayers:'all'})` + this gate; fixed 2–5 counts still use the 2-player run() gate. Population members carry a stable `id` + `parentIds` (`newMember()`/`_nextPopId`) so elites keep their identity across generations and bred children record which parent(s) produced them — `onGeneration(gen, total, fitnessArr, members)` gained a 4th argument exposing this (`members` = ranked `{id, fitness, parentIds, w}`), consumed by game-ui.js's Bot Training modal roster/lineage display; existing 3-arg callers unaffected. `spectate(n)` = watchable 2–5-bot match with normal visuals + auto action-log download. `stop()` is shared across all four (cheat panel "🤖 Bot match" + "🧬 Evolve" rows, both with a 2/3/4/5 player-count selector, plus the Train Weights buttons) — a HARD abort, `runWeightTraining()` discards the result and reverts. `endEarly()` is a separate SOFT-stop, `evolve()`-only: cuts the generation loop short but `champion` stays genuinely usable (only advances after a generation finishes ranking), so the caller's normal confirm-or-download flow still runs on whatever was reached — drives game-ui.js's Bot Training popup "End Early" button. `applyWeights()` applies a table to the live WEIGHTS object in place. First measurements: hybrid search beat greedy 12-3-5 → hybrid is now the default brain. |
| `bot-driver.js` | ~200 | `window.BotDriver`: multiplayer bot player, any number of bots per room (up to the 5-player cap). Bot = a `players` row with username prefix `🤖` (host-only lobby buttons → `addBotPlayer()`/`removeBotPlayer()` in lobby.js, each bot named `🤖 Bot N`). The host's client drives it: a watcher recomputes the live set of bot indices every tick and impersonates whichever one is active (`myPlayerIndex`/`playerColor` shared lexical bindings) during its placement + turns so all existing isMyTurn/broadcast paths just work — no per-bot code, so N bots need no changes here. All bots share whatever champion weights `window.BotSystem.WEIGHTS` currently holds (Supabase community champion or local training — see `bot.js`). `respondForBots()` ticks alongside the same watcher, independent of turn state, looping over every bot and calling `BotEffects.decideResponse()` when a response window opens against someone else's cast — no impersonation needed, since response AP is spent via each bot's own tracked `playerAPs[]` entry. Host heartbeats bot rows; disconnect sweep skips them. |
| `joytone-bridge.js` | ~250 | `window.JoytoneBridge`: adaptive in-game music. Hidden iframe of `joytone/index.html` (full Joytone DAW). Boots the Five-Elements theme on game start (Grow + Drummer ON); each tile reveal appends a seeded riff of that element (seed = `gameId:tileId` → identical sequence on every client, each variation added at most once). Shift+J+T toggles the sequencer popup. Per-player mute/volume in Settings (localStorage `godaigo_joytone_*`) — mute and the popup's own ⏻ power button are now the SAME signal (`setMuted()` drives real power on/off via `JoytoneAPI.setPower()`; the popup notifies back via `_onChildPowerChanged()` so Settings stays in sync either direction). `setSuppressed(bool)`/`isSuppressed()`: bot-arena.js's `run()`/`evolve()` (Train Weights, Evolve, Breed) suppress unconditionally for their whole duration — those play many short simulated games back to back, which would otherwise reboot the engine every game; `spectate()` (one continuous game) is deliberately left unsuppressed. Talks to `window.JoytoneAPI`, an adapter appended inside `joytone/index.html`. |

---

## game-core.js — Deep Notes

### SpellSystem class (instantiated as `spellSystem`, exposed as `window.spellSystem`)
- `playerScrolls[]` — per-player inventory: `{hand: Set, active: Set, activated: Set}`
- `scrollDecks{}` — draw piles per element; override via `window.tutorialDeckOverride` before `initializeDeck()`
- `onTileRevealed(element)` — draws top scroll from element deck into active player's hand
- `patternMatchesBoard(scroll, playerHex)` — checks if stone pattern exists around player position
- `activateScroll(scrollId, playerIndex)` — validates pattern + 2 AP, fires effect, tracks win condition

### Key standalone functions
- `checkWinCondition(playerIndex, {announce})` — THE win gate (also `window.checkWinCondition`): all 5 elements activated AND pawn on own player-tile centre ("player shrine"). Called from every activation path and every movement-completion path (placePlayer move branch, broadcastPlayerMovement in lobby.js, movePlayerVisually). `announce:true` prompts the local player to return home when elements are complete. Helpers: `isPlayerAtOwnShrine()`, `getPlayerShrineTile()`, `updateShrineReturnBeacon()`.
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
window.SoundSystem          // SFX + login music
window.JoytoneBridge        // adaptive music (onTileRevealed, setMuted, setVolume, togglePopup)
window.BotState             // bot observation/actuation (snapshot, legalActions, applyAction)
window.BotSystem            // bot strategy (step, turn, rank, WEIGHTS)
window.BotDriver            // multiplayer bot player driver (host client only)
window.isBotUsername(u)     // true when a players-row username marks a bot (🤖 prefix)

// Debug
window.dumpGameDebug()      // full state dump
window.KNOWN_BUGS           // array of bug objects
window.IMG_V                // cache-bust token e.g. '?v=2'
```
