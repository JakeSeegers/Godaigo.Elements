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
| 3a | Weight evolution via self-play arena | TODO | `js/bot-arena.js` (new) |
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
{ type:'discardScroll', scroll, from:'hand'|'active' }           // only legal while hand/active is over capacity
{ type:'endTurn' }
```

`legalActions()` gates on overflow: when hand/active is over
`spellSystem.MAX_HAND_SIZE`/`MAX_ACTIVE_SIZE`, it returns discard-only actions
(cast/placeStone/move/endTurn are withheld) until the bot discards back down.
`bot.js`'s `botAct()` checks this before even consulting the pattern-plan
(which calls `applyAction()` directly and would otherwise bypass the gate).
This is what lets the bot resolve its own end-of-turn scroll overflow instead
of surfacing `showEndTurnOverflowModal()` — see the fixed bug below.

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
   Enable from the console: `BotSystem.WEIGHTS.searchDepth = 3` (≈10ms per
   decision at depth 3 on the tutorial board).
5. **Multi-turn MCTS (optional, not started)**: UCT over turns; unknown
   face-down tiles and opponent hands are DETERMINIZED — sample K plausible
   completions (uniform over the unseen tile-deck distribution), run the
   search per sample, majority-vote the root action. K=8 is plenty.
   Rollout policy = Stage-1 greedy.

Acceptance (still open, needs 3a): search bot beats greedy Stage-1 bot ≥60%
over 100 arena games with the same weights. Flip the `searchDepth` default
only on that evidence.

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

## STAGE 3a — Weight evolution via self-play (TODO)

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
