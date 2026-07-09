# Godaigo Bot — Improvement Roadmap

> Written for AI consumption. An agent picking up ANY stage below should read this
> file top to bottom first, then the KEY FACTS section twice.
> Parent index: [docs/INDEX.md](INDEX.md) · Game modules: [js/INDEX.md](../js/INDEX.md)

---

## STAGE STATUS

| Stage | Name | Status | Files |
|-------|------|--------|-------|
| 0 | Game-state API (snapshot / legal actions / apply) | **DONE** | `js/bot-state.js` |
| 1 | Utility-scored bot (replaces rule ladder) | **DONE** | `js/bot.js` |
| 1.5 | Multiplayer bot player (host-driven) | **DONE** | `js/bot-driver.js` + lobby.js `toggleBotPlayer()` |
| 2 | Forward model + lookahead search | TODO | `js/bot-sim.js` (new) |
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
   contains all five of `earth, water, fire, wind, void`. Casting a scroll of an
   element whose SOURCE pool is 0 should still fire the effect but NOT award the
   win-condition element (see `planning/current.md` task 2 — check whether that
   rule is implemented in `applyScrollEffects()` before relying on it).

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
{ type:'endTurn' }
```

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

v1 limits (acceptable, fix opportunistically): bot hand-overflow modal falls
to the host to resolve; bots never play response scrolls; the host's HUD
mirrors the bot while it acts.

---

## STAGE 2 — Forward model + lookahead (TODO)

Goal: `simulate(snapshot, action) → snapshot'` as PURE functions (no DOM, no
globals), then search.

Build order (each step is independently commit-able):

1. **`js/bot-sim.js`** exposing `window.BotSim = { simulate, isTerminal, winner }`.
   Input/output is exclusively the Stage-0 snapshot JSON. Never touch live game
   state from this file.
2. Implement, in this order (easiest → hardest):
   a. `move` (pawn xy + AP − cost; if target tile was unrevealed, mark revealed
      but DO NOT invent its element — model it as `shrineType:'unknown'` and
      treat as a probability node or heuristic bump),
   b. `endTurn` (collection when on shrine centre: refill active player's pool
      from sourcePool up to capacity; AP reset; advance activePlayerIndex),
   c. `placeStone` (append stone, decrement pool),
   d. `cast` for SIMPLE scrolls only: consume pattern stones per the game's
      disposal rule, add element to `activated` if sourcePool > 0.
      Maintain a whitelist `SIMULATED_SCROLLS`; any scroll not on it gets a flat
      heuristic value instead of simulation (`+CAST_VALUE`), which keeps the
      model honest about what it doesn't know.
3. **Validation harness before any search**: play 50 seeded random-action games
   where every applied real action (via `BotState.applyAction`) is mirrored in
   the simulator; diff the real `BotState.snapshot()` against the simulated one
   after each action and log divergences. Fix until move/endTurn/placeStone
   diverge in <1% of steps. Scroll casts may diverge (whitelist-gated) — that's
   accepted and logged, not fixed.
4. **Search, within one turn only** (small tree: AP ≤ 5–10):
   depth-limited exhaustive search over own-turn actions, leaf-evaluated with
   the Stage-1 scoring function on the simulated snapshot. Wire it in as
   `WEIGHTS.searchDepth > 0 ? searchPick() : greedyPick()`.
5. **Multi-turn MCTS (optional)**: UCT over turns; unknown face-down tiles and
   opponent hands are DETERMINIZED — sample K plausible completions (uniform
   over the unseen tile-deck distribution), run the search per sample, majority-vote
   the root action. K=8 is plenty. Rollout policy = Stage-1 greedy.

Acceptance: search bot beats greedy Stage-1 bot ≥60% over 100 arena games (Stage 3a
harness) with the same weights.

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
