# Godaigo Bot — Improvement Roadmap

> Written for AI consumption. An agent picking up ANY stage below should read this
> file top to bottom first, then the KEY FACTS section twice.
> Parent index: [docs/INDEX.md](INDEX.md) · Game modules: [js/INDEX.md](../js/INDEX.md)

---

## TWO INDEPENDENT TRACKS

This roadmap now has two tracks that can progress in parallel — they touch
different concerns and neither blocks the other:

- **STRATEGY TRACK** (Stages 2–3c below): makes the bot *smarter* — lookahead,
  weight evolution, learning. Runs fine inside the current host-browser model.
- **RUNTIME TRACK** (Stages R1–R5, new section below STAGE 1.5): moves *where*
  the bot executes — off the host player's browser and onto a backend, so a
  human host is no longer required for bots to play. Does not change bot
  intelligence at all; Stage 1's `scoreAction()` moves verbatim.

## STAGE STATUS

| Stage | Name | Status | Files |
|-------|------|--------|-------|
| 0 | Game-state API (snapshot / legal actions / apply) | **DONE** | `js/bot-state.js` |
| 1 | Utility-scored bot (replaces rule ladder) | **DONE** | `js/bot.js` |
| 1.5 | Multiplayer bot player (host-driven) | **DONE** | `js/bot-driver.js` + lobby.js `toggleBotPlayer()` |
| R1 | Narrow driver to pure adapter | **DONE** | `js/bot-driver.js` |
| R2 | One backend path for move validation (shadow-mode, `endTurn` only) | **DONE** | `validate-end-turn` edge fn + `persistCurrentTurnIndex()` |
| R3 | Backend-authoritative turn validation | TODO | Supabase edge function + game-core.js call sites |
| R4 | Replace host-browser impersonation with backend-driven bot turns | TODO | `js/bot-driver.js` (removed), backend service |
| R5 | Server-side bot execution + bot-vs-bot | TODO | backend service running `bot.js` logic headless |
| 2 | Forward model + lookahead search | **DONE** (steps 1–4; step 5 MCTS optional, not started) | `js/bot-sim.js` + `bot.js` searchPick |
| 3a | Weight evolution via self-play arena | **DONE** (run + evolve built; first measurements taken; large-scale evolution awaits R5; cheat-panel "🧬 Train Weights" button runs a modest preset without the console) | `js/bot-arena.js`, `js/game-ui.js` cheat panel |
| 2.5 | Scroll-effect usage: selection targets + response scrolls | TODO (after 3a) | `js/bot-effects.js` (new) + bot-sim whitelist |
| 3b | Human game logging → eval set / cloning data | TODO | `js/bot-logger.js` (new) + Supabase table |
| 3c | Neural RL (optional, last) | TODO | — |

---

## KEY FACTS & GOTCHAS (read twice — violating these breaks everything)

1. **Game globals are NOT on `window`.** `game-core.js` is a classic script whose
   state lives in top-level `let`/`const` (`placedTiles`, `placedStones`,
   `playerPositions`, `activePlayerIndex`, `sourcePool`, `playerPools`,
   `playerPoolCapacity`, `getTotalAP()`, `spendAP()`, `canPlayerMoveToHex()`,
   `getAllHexagonPositions()`, `hexToPixel()`, `pixelToHex()`, `placeStone()`).
   Classic scripts share the global *lexical* environment, so later scripts
   (bot-state.js, bot.js) reference them as **bare identifiers**.
   `window.placedTiles` is `undefined` — do not use it. Exceptions that ARE on
   window: `window.spellSystem`, `window.SCROLL_DEFINITIONS`, `window.placedStones`,
   `window.placeStone`, `window.stonePools`, `window.playerPools`,
   `window.updateStoneCount`, `window.revealTile`.

2. **Two different "pools" — do not confuse them:**
   - `playerPool` (window getter) = the DISPLAY player's personal stone pool
     `{earth,water,fire,wind,void}`, capacity 5 each (`playerPoolCapacity`).
     In multiplayer it shows MY pool, not necessarily the active player's.
     For the active player's pool always use `playerPools[activePlayerIndex]`.
   - `window.stonePools` (alias of internal `sourcePool`) = the SHARED source
     pool, capacity 25 each. **`stoneCounts` is NOT the source pool** despite
     what some older notes say — it is another alias of the display player's pool.

3. **Win condition** = a player's `spellSystem.playerScrolls[i].activated` Set
   contains all five of `earth, water, fire, wind, void` AND their pawn stands on
   the centre of their own player tile (the "player shrine"). The shared gate is
   `checkWinCondition(playerIndex)` in game-core.js; movement paths call it on
   arrival. Bot support: snapshot tiles carry `playerIndex` for player tiles, and
   bot.js walks home via `WEIGHTS.moveReturnHome` once all five are activated.
   Casting a scroll of an element whose SOURCE pool is 0 should still fire the
   effect but NOT award the win-condition element (see `planning/current.md`
   task 2 — check whether that rule is implemented in `applyScrollEffects()`
   before relying on it).

4. **Scroll rules the bot must respect:**
   - `SCROLL_DEFINITIONS[name].level === 1` → response-only, never proactively castable.
   - Patterns are RELATIVE TO THE CASTER'S HEX: `def.patterns` is an array of
     variants; each variant is an array of `{q, r, type}` offsets from the
     player's hex (`pixelToHex(pos.x, pos.y, TILE_SIZE)`). The same stones can
     satisfy a pattern from one standing position and not another — so WHERE the
     pawn stands when casting matters.
   - Casting: `spellSystem.moveToActive(name)` (if in hand) then
     `spellSystem.castSpell()` (no args — it scans the active area).
   - Pattern check: `spellSystem.checkPattern(name)` → boolean, uses the
     current pawn position.

5. **Movement**: `canPlayerMoveToHex(x, y)` → `{canMove, cost}` evaluates the
   DESTINATION hex only (terrain/stone cost), not adjacency — safe to call for
   any hex during path search. Hex grid positions come from
   `getAllHexagonPositions()` (each has `.x .y .key`); two hexes are adjacent
   when their pixel distance is >5 and <40. Stone terrain changes costs, so use
   Dijkstra (cheapest), not BFS (fewest hops).

6. **Collection**: ending the turn while standing on a revealed elemental
   shrine CENTRE (tile.x/tile.y within ~5px) collects stones from the source
   pool. End turn = click `#end-turn` (never reimplement turn logic).

7. **Multiplayer**: only act when `!isMultiplayer || activePlayerIndex === myPlayerIndex`.
   Acting for a remote player desyncs the game. All mutating actions must go
   through `BotState.applyAction()` which uses the game's own broadcast paths.

8. **Hidden information discipline**: face-down tiles DO have `tile.shrineType`
   in memory, but `BotState.snapshot()` deliberately masks it (`shrineType: null`
   when `revealed: false`). Never let bot logic read `tile.shrineType` of a
   flipped tile directly — that is cheating, and it poisons any learned weights.

9. **Testing without an account**: open the game → "Play Tutorial" (no login) →
   the board auto-sets-up. `window.BotSystem.step()` / `.turn()` from the console
   drive the bot. `Shift+R` = one action, `Shift+B` = play out the whole turn.

---

## STAGE 0 — Game-state API (DONE — contract reference)

`js/bot-state.js`, exposed as `window.BotState`. Loaded after lobby.js,
before bot.js. Contains NO strategy — only observation and actuation.

```js
BotState.snapshot()      // → pure-JSON state (see shape below). Cheap; call freely.
BotState.legalActions()  // → Action[] for the active player, canonical form
BotState.applyAction(a)  // → {ok:boolean, reason?:string}; executes via game functions
BotState.hexGrid()       // → cached list of {x,y,key} board hexes
BotState.findPath(sx,sy,tx,ty) // → Dijkstra cheapest path [{x,y,cost}] | null
```

Snapshot shape (version 1):

```js
{
  version: 1,
  turn: { activePlayerIndex, myPlayerIndex, isMultiplayer, ap },
  sourcePool: { earth, water, fire, wind, void },          // shared, cap 25
  tiles:  [{ id, x, y, revealed, isPlayerTile, shrineType }], // shrineType null when !revealed
  stones: [{ x, y, type }],
  players:[{ index, x, y, color,
             pool: {earth,water,fire,wind,void},           // cap 5 each
             hand: [names] | null,                         // null for opponents (hidden)
             handCount, activeCount,
             active: [names],                              // public
             activated: [elements] }]                      // public, win progress
}
```

Action forms (the ONLY vocabulary later stages may use):

```js
{ type:'cast',       scroll:'EARTH_SCROLL_3' }
{ type:'placeStone', x, y, stoneType:'earth', scroll, progress } // progress = placed/total after this stone
{ type:'move',       x, y, cost }                                // one adjacent hex step
{ type:'breakStone', stoneId, x, y, stoneType, cost }             // cost = STONE_BREAK_COST[stoneType] (void 1..earth 5)
{ type:'discardScroll', scroll, from:'hand'|'active' }           // only legal while hand/active is over capacity
{ type:'endTurn' }
```

`legalActions()` gates on overflow: when hand/active is over
`spellSystem.MAX_HAND_SIZE`/`MAX_ACTIVE_SIZE`, it returns discard-only actions
(cast/placeStone/move/breakStone/endTurn are withheld) until the bot discards
back down. `bot.js`'s `botAct()` checks this before even consulting the
pattern-plan (which calls `applyAction()` directly and would otherwise bypass
the gate). This is what lets the bot resolve its own end-of-turn scroll
overflow instead of surfacing `showEndTurnOverflowModal()` — see the fixed
bug below.

**`breakStone` (added after a real playtest got a bot stuck in a movement
loop):** the bot didn't know `attemptBreakStone()` exists — the same
right-click/long-press action a human uses to clear a blocking stone (AP
cost by rank, `game-core.js`'s `STONE_RANK`). A bot boxed in by an earth
stone (movement-blocking, see `canPlayerMoveToHex`) with nothing else legal
had no way out and no reason to sit and wait — this is a genuine Stage-0
vocabulary gap, same class as the common-area-cast/voluntary-discard gaps
below, not a hand-authored "avoid earth stones" rule. `bot-state.js` now
enumerates it (adjacent stone, affordable AP) and `bot.js` scores it with
two new weights (`breakStoneBase`, `breakStoneApPenalty`) — evolution decides
when it's worth an earth stone's 5 AP, same as everything else in the table.
Not yet mirrored in `bot-sim.js`, so hybrid-brain lookahead search can't plan
around it yet — only the greedy scoreAction() path considers it.

Not yet enumerated (Stage 2+ work): catacomb teleports, scroll-effect
sub-choices (target selection inside effects), hand→common moves.

---

## STAGE 1 — Utility-scored bot (DONE — contract reference)

`js/bot.js`. Every legal action gets `score = Σ weight × feature`; argmax wins.
All weights live in the exported `BotSystem.WEIGHTS` object — **later stages
tune this table; they should not need to touch the scoring code.**

Feature summary (see `scoreAction()` in bot.js for the authoritative list):
- cast: flat bonus; + `castUnactivated` if the scroll's element is not yet in
  the caster's activated set AND `sourcePool[element] > 0`; − `castDeadElement`
  when the source pool for that element is 0 (fires the effect but no win credit).
- placeStone: `progress` toward completing the chosen variant; + unactivated-element
  bonus; − small AP-less panic factor.
- move: value of the best reachable target (shrine worth ÷ path cost);
  shrine worth grows with (capacity − pool) and unactivated-element need.
- endTurn: small floor value; + big bonus when standing on a collectible shrine
  centre (ending the turn IS the collect action).

**FIXED bugs found via direct play-testing (not code review — run the bot for
10+ turns and watch what it actually does):**
- **Infinite re-cast loop.** `cast` scored the same regardless of whether the
  element was already in `self.activated` — since a satisfied pattern usually
  stays satisfied on the board, the bot would recast an already-won scroll
  forever instead of exploring for elements it still needed (observed:
  plateaued at 2/5 elements, never progressed). Fixed with `castAlreadyWon`
  (-120), well below `endTurn`/`move`.
- **Cursed-cell placement loop.** In a 2-bot test, one bot got stuck placing
  the same stone at the same hex every action, forever (source pool cycling
  13→25 while nothing ever stuck). Root cause: an adjacent active fire stone
  (`processStoneInteractions` in game-core.js) destroyed the stone immediately
  after every placement, and the plan logic just saw "still missing" and
  retried the identical doomed cell. Rather than modeling fire-adjacency
  rules in bot.js (would duplicate game logic — see DO-NOT list), added a
  failure-counting blacklist: if the cell targeted last cycle is still
  missing on this cycle, count it; past `CELL_FAIL_LIMIT` (2), blacklist the
  cell and abandon the plan. `makePlan()` skips any variant using a
  blacklisted cell. This is a general "reality disagrees with the plan
  repeatedly, stop trusting it" safety net — it doesn't need to know *why*
  a cell won't hold a stone, just that it doesn't.
- **Movement oscillation.** Found via a real game's downloaded action log
  (`js/action-log.js` — see Runtime Track note below): the bot ping-ponged
  between two hexes every single turn from turn ~4 onward, never casting,
  placing, or exploring again for the rest of the game. Root cause: the two
  hexes were *exactly* equidistant (151px) from the only remaining reachable
  unrevealed tile, so `moveExploreGradient`'s distance-closed term scored
  both directions identically — a true tie with nothing to break it. Fixed
  (v1) with `moveRevisitPenalty`: a small rolling history (`_recentPositions`)
  that penalizes stepping back onto a recently visited hex.
- **Movement oscillation, round 2 (v1's fix was incomplete).** A second
  downloaded action log showed the SAME 2-hex ping-pong still happening —
  now 5 round-trips inside a single turn. v1's penalty was a flat "is this
  hex anywhere in the last N visited?" check; in a clean A↔B cycle, once
  the window fills, BOTH A and B are simultaneously "recently visited," so
  every candidate gets the identical penalty and the tie comes right back.
  Fixed by weighting the penalty by recency instead of applying it flat —
  `revisitPenalty()` divides `moveRevisitPenalty` by how many steps ago that
  exact hex was visited, so "undo the move I just made" (1 step ago, full
  penalty) is now punished far more than "revisit somewhere from 3+ steps
  back" (partial penalty). A strict 2-cycle only ever has one way to
  "continue the cycle" — reverse the immediately previous step — so this
  directly and specifically kills it, whereas v1's flat check could not.
  `_recentPositions` window widened 4 → 6 to also dampen slightly longer
  (3-hex) cycles, though only the recency-decay actually fixes 2-cycles.

All four found by literally running `window.BotSystem.turn()`/`.step()` in a loop in the
browser console and inspecting `snapshot()`/`rank()` between turns — cheaper
and more revealing than reasoning about the scoring code in the abstract.
Worth repeating before investing in Stage 2/3a: structural bugs like these
make weight-tuning or lookahead search pointless (a smarter search over a
broken scorer just finds the same bugs faster).

---

## STAGE 1.5 — Multiplayer bot player (DONE — contract reference)

A bot is an ordinary `players` table row whose username starts with
`window.BOT_USERNAME_PREFIX` ('🤖'). Host-only lobby button "🤖 Add Bot"
(`toggleBotPlayer()` in lobby.js) inserts/removes it (`is_ready: true`).
Because it's a real row it counts everywhere: player count, Start-button
condition, index/color assignment, `totalPlayers`, turn order.

The HOST's browser is the bot's client (`js/bot-driver.js`): a 700ms watcher
notices bot turns and IMPERSONATES the bot — temporarily reassigning the
shared lexical bindings `myPlayerIndex` and `playerColor` — so every existing
`isMyTurn()` / `canTakeAction()` / broadcast path identifies as the bot. The
driver resets the bot's AP at turn start (the turn-change handler only resets
the local player's), places the bot's player tile during the placement phase,
and force-ends stuck turns as a safety net.

Keep-alive: the host heartbeats bot rows' `last_seen`; the disconnect sweep
skips `isBotUsername()` rows.

The bot does NOT need a separate Supabase login/session. Its `players` row IS
its identity; all in-game sync is broadcast-based and keyed by
`activePlayerIndex` (`syncPlayerState` → 'player-state-update'), which
impersonation satisfies. Anything actually keyed by `myPlayerId` (heartbeat,
ready flag) is lobby plumbing the host handles on the bot's behalf.

Async cast machinery: `BotSystem.waitForQuiescence()` runs between bot
actions. It (a) auto-resolves cascade prompts by clicking `#cascade-popup`
buttons (prefers "To Active"), (b) cancels scroll selection modes
(`scrollEffects.selectionMode`, `window.takeFlightState`) the bot can't
drive, and (c) waits out the multiplayer response window
(`spellSystem.responseWindow.isResponseWindowOpen`, ~15s) so the stack
resolves while the bot is still impersonated. Legality guards in
bot-state.js mirror the UI: casts need ≥2 AP, stone placements must pass
`isInPlacementRange()`.

v1 limits (acceptable, fix opportunistically): bots never play response
scrolls; selection-mode scrolls are cast but their optional targeted effect is
cancelled; the host's HUD mirrors the bot while it acts.

**FIXED (was a v1 limit):** bot hand/active overflow at end of turn used to
surface `showEndTurnOverflowModal()` on the host's screen. That modal is
fire-and-forget (not awaited), so `asBot()`'s `finally` restored the host's
real identity *before* the modal resolved — the host then saw their OWN
scrolls (not the bot's) in the Hand/Active panels, and discarding them never
reduced the bot's overflow (`getPlayerScrolls(false)` is keyed on
`activePlayerIndex`, still the bot), so the banner's End Turn button stayed
disabled forever and the game stalled. Fixed by giving the bot a
`discardScroll` action (Stage 0 vocabulary, above) and gating
`legalActions()`/`botAct()` so the bot discards down to capacity BEFORE ever
clicking End Turn — the modal now never appears for a bot turn.

---

## RUNTIME TRACK — moving bot execution off the host browser

Motivation: today the host's browser is both a human client and the bot's
runtime (impersonation swaps `myPlayerIndex`/`playerColor`). That's fine for
dev but means a bot game requires a human host tab to stay open, and any host
UI bug can leak into bot turns. The fix is layered, not a rewrite — Stage 0's
contract (`BotState.snapshot/legalActions/applyAction`) already IS the seam;
these stages move what sits on each side of that seam without touching
`bot.js` scoring logic.

### R1 — Audit the driver is a pure adapter (DONE)
Audited `js/bot-driver.js`. Turn-driving (`asBot`, `driveBotTurn`, the watcher)
was already clean — detect, snapshot, `BotSystem` decision,
`BotState.applyAction()`, restore identity, no leaked strategy.

One real leak found and fixed: the placement-phase path
(`pickBotTilePosition()` + `placeBotTile()`) implemented an actual heuristic
(place adjacent to the tile cluster, closest to centroid) directly in the
driver, and executed it by calling `placeTile()`/`broadcastGameAction()`
directly, bypassing `BotState.applyAction()` entirely — the only path in the
whole driver that did. Fixed by adding `placeTile` to the Stage 0 vocabulary:
`bot-state.js`'s `legalActions()` now enumerates candidate hexes during
placement phase (`placementCandidates()`), `bot.js` scores them
(`placeTileBase`/`placeTileCentroidPenalty` weights — same "closest to
centroid" preference, now tunable), and `applyAction()` executes the chosen
one. `bot-driver.js`'s `placeBotTile()` is now just `asBot(botIndex, () =>
window.BotSystem.step())`, identical in shape to `driveBotTurn()`.

### R2 — One backend path for move validation (DONE, shadow-mode)
Deployed a Supabase edge function (`validate-end-turn`, project
`lovybwpypkaarstnvkbz`) that accepts `{gameId, playerIndex}` and checks it
against `game_room.current_turn_index` — the first real server-held-state
check, scoped to one action type (`endTurn`) as the roadmap intended.

**Prerequisite discovered mid-implementation:** `game_room.current_turn_index`
existed as a column but was only ever written at game start/reset and at
game-end (winner display) — never during actual turn-to-turn play, which runs
entirely on the `broadcastGameAction` realtime channel and never touches the
DB. A validator checking a column nobody updates mid-game would be validating
against permanently stale data, so this had to be fixed first: added
`persistCurrentTurnIndex(playerIndex)` (`js/lobby.js`, next to
`broadcastGameAction`) and wired it into all four `turn-change` broadcast
sites (`js/game-ui.js` ×2 — the overflow-modal and non-overflow endTurn
paths — and `js/game-core.js` ×2 — placement-phase advance and the
turn-timeout kick handler). It's an additive fire-and-forget side write; if it
fails, only a console warning fires, nothing about turn-passing itself
changes.

**Current wiring is shadow-mode only, as the roadmap specified** ("proof of
path, not a full rewrite"): `js/game-ui.js`'s end-turn click handler calls
`supabase.functions.invoke('validate-end-turn', ...)` with the OLD
`activePlayerIndex` (the player who's ending their turn) right before
advancing state, and only logs the result (`console.log` on agreement,
`console.warn` on disagreement) — it never blocks or gates ending the turn.
Verified end-to-end in the browser: correct CORS handling (edge function
needs an explicit `OPTIONS` handler — Supabase functions don't add this for
you), correct `legal:true`/`legal:false` responses against a real
`game_room` row, and correct client-side logging for both cases.

**Not yet done, deliberately deferred to R3:** nothing actually enforces the
validator's answer, and only `endTurn` is covered. R3 extends this to real
enforcement across the full action vocabulary.

### R3 — Backend-authoritative validation (TODO)
Extend R2's edge function to cover all action types in the Stage 0 vocabulary
(`cast`, `placeStone`, `move`, `endTurn`). Once the backend can independently
recompute "is this action legal from this snapshot," the browser's role
shrinks to rendering + input capture; illegal actions get rejected
server-side instead of trusted client-side. Do this incrementally per action
type — ship each one behind the others still being client-trusted.

### R4 — Replace host-browser impersonation (TODO)
Once R3 is solid, bot turns no longer need a browser pretending to be the
bot: the backend can call the same validated action path directly using the
bot's `playerIndex`, driven by a scheduled/triggered function instead of
`bot-driver.js`'s 700ms watcher. At this point `bot-driver.js` can be
deleted — its job (impersonate, apply, restore) no longer exists once the
backend applies bot actions directly.

### R5 — Server-side bot execution + bot-vs-bot (TODO)
Run `bot.js`'s `scoreAction()`/pick logic inside the backend function/service
(same pure code, new host environment — Node or a Supabase edge function).
Once no human browser is required to drive a bot, two bot players can play
each other with zero open tabs. This unlocks self-play at scale for Stage 3a's
arena (`js/bot-arena.js`) to run server-side instead of in a suppressed page.

**Sequencing relative to the Strategy Track:** R1–R5 can run interleaved with
Stages 2/3 at any point — they don't depend on each other. Recommended order
if working both: do R1 (cheap audit) any time, R2 next real backend step,
then pick up whichever track has more immediate value (smarter bot vs. bot
independent of host browser).

**Do NOT** attempt R4/R5 before R2/R3 land — moving execution backend-side
before the backend can validate actions just relocates the trust problem
instead of fixing it.

---

## STAGE 2 — Forward model + lookahead (DONE except optional MCTS)

Goal: `simulate(snapshot, action) → snapshot'` as PURE functions (no DOM, no
globals), then search. Steps 1–4 below are DONE; step 5 (MCTS) is optional
and not started.

1. **`js/bot-sim.js` (DONE)** — `window.BotSim = { simulate, legalActions,
   isTerminal, winner, checkPattern, canMoveTo, grid, diffSnapshots, validate,
   SIMULATED_SCROLLS }`. Input/output is exclusively the Stage-0 snapshot
   JSON; the only globals read are static `SCROLL_DEFINITIONS` (and, inside
   `validate()` only, the live BotState/BotSystem). Includes a PURE
   `legalActions(snap)` mirror of BotState's (search needs to enumerate from
   SIMULATED states) and a pure movement-cost model (earth block, wind free,
   water chaining flood fill, void nullification, other-player occupancy).
2. **Simulated actions (DONE)**: `move` (incl. tile reveal as
   `shrineType:'unknown'` — never invents the element; reveal draw goes to
   HAND even past capacity, matching the real pending-cascade behaviour),
   `endTurn` (rank-based shrine collection capped by source/pool; turn
   advance in COLOR_RANK order; AP reset to 5 + void stones), `placeStone`
   (pool decrement + the fire-destruction interaction rules),
   `discardScroll`, and `cast` (AP, hand→active, win-condition activation
   incl. the empty-source-pool rule and catacomb component elements are
   EXACT; the effect itself is whitelist-gated: scrolls not in
   `SIMULATED_SCROLLS` — currently all of them — are recorded in
   `snap.sim.unsimulatedCasts` instead of pretended-simulated).
3. **Validation harness (DONE)** — `BotSim.validate({actions, seed, policy})`
   runs in a live game: picks seeded random (or ε-greedy 'builder') legal
   actions, predicts each with `simulate()`, applies it for real via
   `BotState.applyAction`, diffs predicted vs settled real snapshot.
   Measured (tutorial board, headless Chromium): move 0/550+, endTurn 0/120+,
   placeStone 0/60+, discard 0/9 — 0% divergence, target was <1%. Cast
   effect side-effects divert as designed and are counted "accepted".
   A second mode mirrors the REAL bot's own action stream (plan builds +
   casts included) by wrapping `BotState.applyAction` — see the Playwright
   driver pattern in the session notes below.
4. **Search, within one turn only (DONE)** — `searchPick()` in bot.js:
   depth-limited beam search (`WEIGHTS.searchDepth` plies,
   `WEIGHTS.searchBreadth` children per node) over own-turn actions; an
   endTurn edge is a leaf. Leaves valued by `evaluateSnapshot()` (bot.js),
   all knobs in `WEIGHTS.eval*`. Wired exactly as planned:
   `WEIGHTS.searchDepth > 0 ? searchPick() : greedyPick()` — **default is 0
   (greedy)** until the Stage-3a arena can measure the acceptance criterion.
   Enable from the console (`BotSystem.WEIGHTS.searchDepth = 3`, ≈10ms per
   decision on the tutorial board) or via the cheat panel (click the HUD
   "AP" label 5×): **Bot Brain** cycles Dumb (greedy) → Smart (search every
   action) → Hybrid (`WEIGHTS.searchHybrid`: search only when a cast or
   stone placement is among the legal actions; plain movement stays greedy).
   Persisted in `localStorage['godaigo_bot_brain']`, applied by bot.js at
   load — and it deliberately overrides evolved weights.
5. **Multi-turn MCTS (optional, not started)**: UCT over turns; unknown
   face-down tiles and opponent hands are DETERMINIZED — sample K plausible
   completions (uniform over the unseen tile-deck distribution), run the
   search per sample, majority-vote the root action. K=8 is plenty.
   Rollout policy = Stage-1 greedy.

Acceptance — MEASURED (BotArena, 2×10 games, seeds 11/23, alternating
sides): **HYBRID search beat greedy 12-3 with 5 draws** (80% of decided
games; 60% counting draws as non-wins) → default flipped to hybrid
(`searchDepth: 3, searchHybrid: 1`). **FULL search LOST its series 1-3-4**
— always-on lookahead's movement choices fight the plan/path logic; do NOT
enable `searchHybrid: 0` by default without new evidence. Caveat: 20 games,
not the spec's 100 — rerun at scale once R5 makes games cheap.

**Gotchas found while building Stage 2 (all fixed, don't re-break):**
- `getAllHexagonPositions()` also emits **trapezoid bridge hexes** at
  large-tile offsets `(±2,0),(0,±2),(-2,2),(2,-2)` wherever ≥2 tiles'
  trapezoids coincide — hidden tiles contribute too, and landing on one
  reveals them. A grid model without these misses real moves AND reveals.
- `castSpell()` opens a "Select Scroll to Cast" popup when several scrolls
  match at once, and previously `BotState.applyAction('cast')` returned
  `ok:true` while the cast silently no-opped — the bot then looped on it.
  applyAction now clicks the requested scroll's button (or reports failure).
- A state evaluator must NOT credit AP across a simulated endTurn
  (`snap.sim.turnsEnded`) — in single-player the activePlayerIndex doesn't
  change, so the AP reset otherwise makes passing the turn look like free
  value and the search ends every turn instantly.
- The flat heuristic for unsimulated cast effects must only count casts that
  granted a NEW activation (`unsimulatedCasts[].grantedNew`), or the search
  farms the flat value by re-casting an already-won scroll — the same
  infinite-recast loop Stage 1's `castAlreadyWon` fixed for greedy.
- Reveal-drawn scrolls go to the hand even when it's full (pending cascade);
  catacomb reveals also grant +1 AP, which is unknowable pre-reveal and is
  an accepted, documented divergence.

---

## STAGE 2.5 — Scroll-effect usage (TODO — sequenced AFTER 3a)

The bot casts scrolls but wastes their power: selection-mode effects are
cancelled (`waitForQuiescence` cancels any `selectionMode` /
`takeFlightState` it can't drive), response scrolls (level 1) are never
played, and the Stage-2 simulator treats all effects as unknown. Weight
evolution (3a) CANNOT fix any of this — a weight can't pick a Telekinesis
target. This stage adds the missing capability. Build 3a FIRST: every
increment below must be A/B-measured in the arena (with vs. without),
otherwise there is no way to tell whether effect-driving actually wins games.

Build order (each step independently commit-able and arena-measurable):

1. **Inventory the choice space.** From `js/scrolls/effects/scroll-effects.js`,
   list every scroll whose `execute()` returns `requiresSelection:true` (or
   sets `tileMoveMode`/`takeFlightState`), and for each: what is being chosen
   (tile, stone, pawn, hand scroll), what makes a choice valid, and what the
   game-visible outcome is. Write the table into this file before coding.
2. **`js/bot-effects.js`** — `window.BotEffects.driveSelection(scrollName)`:
   when a selection mode opens during a BOT cast, enumerate the valid
   choices via the game's own selection APIs (never reimplement validity),
   score them with simple `WEIGHTS.effect*` heuristics, and apply the best
   one. Wire into `waitForQuiescence`: try `BotEffects.driveSelection()`
   first, fall back to today's cancel for scrolls it doesn't know.
   Start with the 3–4 most-drawn scrolls; expand opportunistically.
3. **Response scrolls.** Hook the response window for bot players: when
   `ResponseWindowSystem` opens against a bot holding a castable response
   scroll, decide respond/pass by score (v1 heuristic: respond when the
   cast would grant the caster their 4th or 5th element, or when the
   response is free-ish and the bot is ahead). This also removes the "bots
   never count as responders" carve-out in response-window.js — coordinate
   both sides.
4. **Whitelist effects in the simulator.** For each scroll whose effect the
   bot can now drive, implement it in `BotSim` and add it to
   `SIMULATED_SCROLLS` — ONLY together with harness evidence
   (`BotSim.validate`) that the simulation matches reality. This is what
   lets `searchPick()` plan around effects instead of scoring them blind.

Acceptance per increment: arena win rate vs. the pre-increment bot improves
(same weights, same seeds); no increment may regress the Stage-1 fixed bugs
(recast loops, oscillation, overflow stalls).

## STAGE 3a — Self-play arena (DONE) — original plan below

`js/bot-arena.js`: `BotArena.run(weightsA, weightsB, nGames, seed, opts)`
plays local hot-seat 2-player games (no Supabase, no multiplayer), both
players bot-driven, per-player weight tables (swapped into
`BotSystem.WEIGHTS` each turn), seeded `Math.random` per game (deck
shuffles reproducible), alternating sides per game, turn cap → draw.
Winner via `BotSim.winner`. Mutes sound/music/`window.gami` (no arena XP
farming) and the win modal during runs; restores everything after.
`BotArena.evolve(generations, opts)` implements the evolution loop below
(configurable `gamesPerPair` — a full spec generation is hours in-browser;
serious evolution wants R5's server-side execution).

Support added for the arena: `BotSystem.speedScale` (delay scaling; arena
default 0.1 ≈ 35ms/action) and `BotSystem.resetMemory()` (per-game wipe of
plan/oscillation-history/cursed-cells — positions repeat across games).

**Cheat-panel UI (no console needed):** two "🧬 Train Weights" buttons
(`js/game-ui.js` cheat panel, opened via 5 clicks on the HUD AP label), both
built on a shared `runWeightTraining(preset, onProgress)` helper:
- **quick**: `{generations:3, gamesPerPair:1, popSize:6}` — 45 games, a few
  minutes. Noisy (1 game/pairing) — may correctly report no improvement often.
- **thorough**: `{generations:8, gamesPerPair:3, popSize:8}` — ~672 training
  games + 20 confirmation games, likely 1-2+ hours; closer to the roadmap's
  own spec scale (28 pairs × N games/generation).

Both share a live progress meter (bar + generation/fitness/games-done/ETA
text), driven by new `opts.onGame`/`opts.onGeneration` callbacks on
`run()`/`evolve()`. Leaves any online game first via a shared
`leaveOnlineGameIfAny()` helper (also used by the existing bot-match
buttons), and `evolve()` checks `BotArena.stop()`'s flag once per generation
so the panel's ⏹ button can cancel a training run in progress (previously
only `spectate()` was cancellable) — note this only interrupts the `evolve()`
phase; the confirmation match after it always runs to completion, since it's
short relative to either preset.

**On running training concurrently:** deliberately NOT built. `BotArena`
plays local (no-Supabase) games in one browser tab's single JS thread against
shared mutable global state (`placedTiles`, `activePlayerIndex`,
`window.spellSystem`, ...) — two `playGame()` calls can't run concurrently in
one tab, and real multiplayer rooms wouldn't help (network overhead, and a
bot still needs a browser tab to drive it via impersonation until R4/R5 land
— see Runtime Track above). The only available "parallelism" today is
manually opening multiple tabs, each running an independent `evolve()` call —
each tab has an isolated `window`, so that's genuinely concurrent, but
`localStorage['godaigo_bot_weights']` is shared across tabs of the same
origin (last write wins) and there's no cross-tab result comparison, so this
is a DIY console workaround, not something worth building UI around. Real
concurrent self-play at scale is Stage R5's job.

**Confirmation gate (added after a v1 of this button silently made bots
worse):** a single game per `evolve()` pairing is noisy — the per-generation
winner can win by luck, not by being a better strategy — so v1 of the button
applied and persisted whatever evolve() returned unconditionally. That's
exactly the thing this roadmap's own Stage 3a acceptance criterion (below —
"champion beats the hand-tuned defaults ≥55%...") exists to prevent; the
button had just skipped the check for convenience. Fixed: after evolve()
returns, the button runs a 10-game confirmation match (`BotArena.run()`)
between the champion and whatever weights were live before training started,
via the new `BotArena.applyWeights()` export, and only keeps the result
(applies it live, leaves localStorage as evolve() wrote it) if the champion's
`aFitness` actually beat the baseline's in that match — otherwise it reverts
both the live `WEIGHTS` object and `localStorage['godaigo_bot_weights']` to
their pre-training snapshot. `evolve()`'s own per-generation auto-persist to
localStorage is unchanged (pre-existing, intentional — see below) since the
console/manual training workflow it was built for already expects a human to
judge the logged fitness before trusting a result; only the one-click UI path
needed the automated check.

**Tutorial interference (found via a real playtest — running from inside an
active tutorial got stuck in a loop, then the page reloaded on its own):**
`spectate()` already neutralized `window.isTutorialMode` before running local
games ("its hooks force tile elements... and its spotlight overlays obscure
the board"), but `playGame()` — the function `run()`/`evolve()` (and so the
Train Weights button) actually use — never did. Every `TutorialMode` hook
call site (`game-core.js`, `game-ui.js`, `scroll-panels.js`) is gated on
`window.isTutorialMode`, so leaving it `true` meant a bot racing through
moves/casts/end-turns across dozens of games could satisfy the tutorial's
remaining scripted steps in seconds — and `tutorial-mode.js`'s `finish()`
calls `window.location.reload()` once the step sequence runs out, which
would kill an in-progress training run outright. Fixed by factoring the
neutralization into a shared `neutralizeTutorialMode()` and calling it at
the top of `playGame()` (once per game, not just once per `run()`/`evolve()`
call, in case something re-triggers tutorial state mid-run) as well as
`spectate()`.

**Fitness shaping (added after the first evolution runs):** `evolve()`
originally used pure win-count as fitness — a bot that stalled into a
200-turn turn-cap draw scored identically to one that played sharply and
still drew, so evolution had zero selection pressure against stalling.
`run()`/`playGame()` now also track each side's win-condition progress
(elements activated at game end) and stuck-turn count (turns force-ended
because `botTurn()` never chose to end them itself), and `sideFitness()`
combines win/loss ±1 with a small progress reward and stuck-turn penalty
(`opts.progressWeight`/`opts.stuckPenalty`, defaults 0.3/0.15) into
`aFitness`/`bFitness`, which `evolve()` now selects on instead of raw wins.
This is reward SHAPING, not a hand-authored rule about any specific
trap (e.g. the earth-stone boxed-in case) — it mirrors the "win ±1, small
per-turn penalty" reward already specified below for Stage 3c, tested
cheaply in the arena before RL makes it expensive to iterate on.

**Six real bot/infra bugs found by the first arena runs** (all fixed —
games went from 100% frozen draws to ~50-turn completions):
1. `BotState.hexGrid()`'s TIME-based cache (1.5s) served pre-reveal grids;
   at bot speed whole games fit in one stale window and pawns froze on a
   board that no longer existed. Now invalidated by board change.
2. Euclidean-only exploration froze pawns in cul-de-sacs (every legal move
   "increased distance" even when it was the only way out). Now scored by
   real cheapest path (`ctx.explorePath`, `WEIGHTS.moveExplorePath`), with
   a multi-source path field for search leaf evaluation.
3. `makePlan()` was hand-only; games dead-ended when the only source of a
   needed element was a scroll parked in the ACTIVE area (casts leave it
   there) or the COMMON area. Plans now consider hand+active+common, gated
   on actual win credit — which also fixed a plan-level infinite recast
   loop (the plan had no `castAlreadyWon` equivalent) and made catacomb
   dual-credit count.
4. Stage-0 vocabulary gaps: casts from the common area and voluntary
   discards (cycle a jammed 2-slot hand to the common area) didn't exist,
   so bots plateaued at 2/5 elements with dead scrolls in hand forever.
5. The anti-freeze rule (clear stale revisit memory when endTurn wins with
   AP to spare) initially overrode SHRINE COLLECTION and caused a cost-0
   wind-stone ping-pong; now thresholded to fallback-scored endTurns only.
6. `ResponseWindowSystem.isBotPlayer()` (`js/scrolls/response-window.js`)
   identifies bots via multiplayer's `allPlayersData`, which is never
   populated in the arena's local hot-seat games — every seat there IS a
   bot, but isBotPlayer() silently returned false for all of them. Any cast
   whose response/counter happened to be formed for another bot opened a
   REAL response window with no one able to click Pass, stalling ~15s
   (`RESPONSE_TIMEOUT_MS`) per eligible cast. `run()`/`spectate()` now
   monkey-patch `isBotPlayer` to `() => true` for the duration of the local
   match (restored after), same save/restore pattern as the other muted
   systems.

## STAGE 3a — original plan (for reference)

Goal: the "slowly evolving" learner, no ML infrastructure.

1. **`js/bot-arena.js`** exposing `window.BotArena.run(botA_weights, botB_weights, nGames, seed)`
   → `{aWins, bWins, draws, avgTurns}`. Requirements:
   - Headless-ish: run in the normal page but suppress rendering where cheap
     (skip animations; call the same startGame(2) local path the tutorial uses).
   - Seeded determinism: `initializeDeck(numPlayers, seed)` already accepts a
     seed; route ALL bot randomness through one seeded PRNG (mulberry32 — copy
     the one in `joytone/index.html`'s adapter).
   - Turn cap (e.g. 200) → draw, so degenerate weight sets can't hang the loop.
2. **Evolution loop** (`BotArena.evolve(generations)`):
   - population = 8 weight tables; gen 0 = current `BotSystem.WEIGHTS` + 7
     Gaussian mutations (σ = 20% of each weight's magnitude);
   - fitness = wins in round-robin (each pair plays 10 games, seeds 0–9);
   - next gen = top 2 elites + 6 fresh mutations of them;
   - persist the champion after every generation to
     `localStorage['godaigo_bot_weights']` AND log it to console as JSON so a
     human can paste it into bot.js as the new default.
3. bot.js already loads `localStorage['godaigo_bot_weights']` over its built-in
   defaults at startup — evolution results take effect on reload without code edits.

Acceptance: after ≥20 generations, champion beats the hand-tuned defaults ≥55%
over 100 fresh-seeded games.

## STAGE 3b — Human game logging (TODO)

- On every applied human action (hook the same UI paths `BotState.applyAction`
  wraps — pawn drop, stone drop, cast button, end turn), append
  `{ gameId, playerIndex, snapshot: BotState.snapshot(), action }` to a buffer;
  flush to a new Supabase table `bot_training_games` at end of turn.
- Mind privacy: no display names in the payload, just player indices.
- First use: an offline eval — "% of positions where the bot's argmax matches
  the human's choice" — report per feature-weight set. Second use (much later):
  behavioral cloning.

## STAGE 3c — Neural RL (OPTIONAL, do LAST)

Only worth starting once Stage 2's simulator can run ≥1000 self-play games/minute
in a worker or Node (jsdom). Then: featurize the snapshot (fixed-size vector:
per-element pools, activated flags, hand one-hots, pawn-to-shrine distances),
PPO or DQN via tensorflow.js, reward = win ±1 with small per-turn penalty.
If Stage 2 MCTS exists, prefer AlphaZero-style (policy prior + value net) over
model-free RL. Do not attempt without the arena (3a) as the evaluation gate.

---

## DO-NOT LIST (for every future stage)

- Do NOT reimplement game rules inside bot.js — actuate only via `BotState.applyAction`.
- Do NOT read `tile.shrineType` of unrevealed tiles (cheating; poisons learning).
- Do NOT act in multiplayer when it isn't this client's turn.
- Do NOT tune strategy by editing `scoreAction()` — tune `BotSystem.WEIGHTS`.
- Do NOT block the main thread with long loops — yield between arena games
  (`await new Promise(r => setTimeout(r))`).
- Do NOT trust `stoneCounts` to be the source pool (it isn't; use `window.stonePools`).
- Do NOT let Runtime Track code (R2+) reach into DOM state or bot-driver.js
  internals — it only knows the Stage-0 snapshot/action vocabulary, same as
  the strategy code.
- Do NOT skip straight to R4/R5 (removing impersonation, server-side bots)
  before R2/R3 (backend validation) exist — see Runtime Track sequencing note.
