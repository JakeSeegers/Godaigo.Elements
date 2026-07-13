# Current Active Work

> This file is the session start point. Update it at the end of every work session.
> Claude: read this first, then drill into the relevant INDEX.md before touching source.

---

## Active Branch
`claude/merge-bot-branches-safe-3p` → remote: `JakeSeegers/Godaigo.Elements`
(merges `claude/bot-crash-three-player-2wcy9j` (base: `4.10.progresscheck`) with
`claude/masons-savvy-range-bug-ep7hjm`, which had independently diverged from
the same lineage and gone further on Stage 2.5. The two branches' bot-arena.js
rewrites conflicted directly: masons-savvy's `playMatch()` unification dropped
the `ensureLocalMode()` fix below (it predates that branch's fork point) —
restored during the merge, see bot-arena.js.)

## Last Committed Work
- **BOT ARENA: Supabase-backed champion persistence ("Start Training" now
  actually improves the deployed game, not just one browser)** —
  `js/bot.js`, `js/game-ui.js`, new Supabase table on the live `Godaigo`
  project. Correction to a claim made earlier in the same work: this
  app's Supabase RLS is NOT wide open (an earlier read of a stale repo SQL
  file was wrong) — every table already gates writes behind
  `auth.role()='authenticated'` or `auth.uid()=owner`. New
  `bot_champion_weights(weights jsonb, confirm_wins/losses/draws int,
  win_rate generated column, created_by uuid, created_at)` follows the
  same pattern: anyone can `SELECT`, `INSERT` requires
  `auth.uid() = created_by`, no `UPDATE`/`DELETE` policy — an append-only
  log, "best" picked by `win_rate`, nobody can overwrite another entry.
  **Write** (`runWeightTraining`'s `improved` branch): when Start Training
  beats the local baseline in a real confirmation match AND the player is
  logged in, also submits the champion + confirmation record — best-effort,
  never blocks/fails the local result if logged out or offline. **Read**
  (`bot.js`, async/non-blocking): fetches the highest-`win_rate` champion
  on load and merges it over `WEIGHTS` once resolved (Bot Brain preference
  re-applied after, so it still always wins over any submitted table's
  `searchDepth`/`searchHybrid`). Explicit design choice per user
  direction: **always** prefer the community champion, not just as a
  fallback when local storage is empty — a fresh device benefits
  immediately, and a device's own local training can be superseded by a
  better community submission on the next load. Found + fixed during
  testing: the fetch initially used `window.supabase`, which stays the raw
  `createClient` factory forever (`config.js`'s
  `const supabase = window.supabase.createClient(...)` never attaches the
  initialized client to `window` — a top-level `const` doesn't). Every
  other Supabase call site in this codebase already correctly used the
  bare `supabase` global; this one silently no-opped until fixed. Verified:
  migration applied + schema/RLS confirmed live, `win_rate` math sanity-
  checked via a throwaway insert/select/delete, `get_advisors` shows no
  new findings, and a targeted-mock headless test confirms the fetch
  actually overwrites live `WEIGHTS` + `localStorage`. Deliberately left
  alone per explicit user request: the file-based "Breed from champion
  files" section (see entry below) still does NOT touch Supabase or live
  weights — that flow is staying local/manual for now.
- **BOT ARENA: file-based champion breeding (Supabase alternative) +
  visual-run modal fix** — `js/bot-arena.js`, `js/game-ui.js`. Follow-up to
  the Supabase discussion below: rather than a shared backend (no server
  code path exists for this static-hosted game, and the existing Supabase
  schema has no RLS at all), the Bot Training panel gained a "Breed from
  champion files" section — upload up to 2 previously-downloaded champion
  `.json` files as parents, pick a repeat count (1/5/10/20/50
  generations), Start Breeding: population size = the panel's Players
  selector (2-5) per explicit design (a 5-player breed = population of 5,
  2 uploaded + 3 crossover-bred — every generation is one real game with
  the whole population, which `evolve()`'s existing group-sampling already
  reduces to correctly when popSize===nPlayers, no core loop change
  needed). `evolve()` gained `opts.seedWeights` (0-2 tables) to seed the
  population instead of always starting from live WEIGHTS; with 2 seeds,
  remaining slots are bred via the existing `crossover()` between them.
  Breeding explicitly does NOT touch this browser's live bot weights
  (saves/restores around the call, since `evolve()` itself unconditionally
  writes `localStorage` every generation) — the downloaded file is the
  entire deliverable, no confirm-vs-baseline gate needed since nothing
  gets kept live. Also fixed, found while testing: the earlier stray-modal
  sweep only cleared a LEFTOVER modal from before a bot job started —
  `muteEnvironment()` (which stubs `showEndTurnPrompt`) is only called for
  MUTED runs, so any VISUAL/Watchable run (new panel's Watchable speed,
  and the pre-existing "Evolve" cheat-panel button) left the real modal
  live, popping up fresh every time any bot emptied its AP. `playMatch()`
  now stubs it unconditionally for every game's duration regardless of
  visual/muted. Verified: headless watch-loop confirms the modal never
  appears during a Watchable evolve() run; full breed-flow test (upload 2
  synthetic champions, breed 1 generation, confirm download fires and live
  weights/localStorage revert to the pre-breed baseline, not the bred
  result).
- **BOT ARENA UX + EVOLUTION: stray modal sweep, crossover, player-facing
  training panel, un-stoppable confirm phase** — `js/bot-arena.js`,
  `js/game-ui.js`. Four related fixes from a user Q&A session:
  (1) `playMatch()` now removes any stray `#end-turn-empty-ap-modal` at
  startup — `showEndTurnPrompt()` being stubbed during a bot job only
  blocks NEW popups, so a real "out of AP?" modal left up from whatever
  game the human was just in sat unclicked for the whole run (reported as
  "menus that would remain unclicked" during Train Weights, regression
  from an earlier version that apparently swept this).
  (2) `evolve()`'s `mutate()`-only reproduction (top-2 elites, rest =
  mutate(single elite)) replaced with uniform crossover across the top-3
  pool + mutation — two different good strategies can now combine instead
  of only drifting apart independently; top-2 still carry over unchanged
  (pure elitism preserved). New `crossover(a, b, rng)`.
  (3) New player-facing "🧬 Bot Training" panel — click the Profile
  modal's header (`.gami-title`, always literal text "Profile" regardless
  of active tab) 5× within 3s, same debounce as the dev cheat panel's
  AP-label trigger. Lets a player pick 2-5 players and Watchable/Extreme
  speed, then Start/Stop — reuses the same confirmation-gated
  `runWeightTraining()` the existing "Train Weights" buttons use ("Extreme"
  = muted + minimal delay, same mechanism Train Weights already used; a
  true no-DOM headless mode isn't possible in the tab the live static site
  runs in, so it's labeled honestly instead of promised). Hoisted
  `stopAnyRunningBotJob`/`leaveOnlineGameIfAny`/`runWeightTraining` out of
  the dev cheat panel's per-open closure so both panels share one instance
  instead of drifting copies of this correctness-sensitive cleanup;
  `runWeightTraining` gained optional `{nPlayers, visual}`, defaulting to
  prior behavior for existing callers.
  (4) Fixed: clicking Stop during the evolve() phase of Train Weights only
  cut that phase short — `run()` resets the same shared `_stopRequested`
  flag the instant it starts, so the confirmation series behind it ran to
  completion regardless, un-stoppable (could be 10-20+ un-cancellable
  games). Exposed `BotArena.stopRequested()`; `runWeightTraining` now
  checks it before starting confirmation and reverts to the pre-training
  weights instead. Fixes both the new panel and the pre-existing cheat-panel
  buttons. Also discussed but NOT built (deferred pending user direction):
  Supabase persistence for champion weights (currently `localStorage` only
  — the only way evolved weights currently reach every player is the
  existing manual "copy champion JSON from console → paste into
  `DEFAULT_WEIGHTS` → commit → GitHub Pages redeploy" path; this app's
  Supabase schema has no RLS at all today, so an auto-apply-from-Supabase
  design needs a fitness-must-improve gate before any open anon-write table
  could safely drive live gameplay for every visitor).
  Verified: 4 targeted headless Playwright repros (stray-modal sweep,
  crossover-enabled evolve() at popSize 4, new panel's full click-through
  including Start/Stop, existing cheat panel + its own Train Weights/Stop
  still work unchanged after the hoist).
- **BOT FIX: spectator match dying after turn 1 (stale isMultiplayer identity)** —
  `js/bot-arena.js`. `BotArena.spectate()`/`playGame()` never reset
  `isMultiplayer`/`myPlayerIndex` before starting a LOCAL match — they relied
  entirely on a prior online game having been left cleanly. If that leave
  didn't fully complete (its `remove_player` RPC can throw), a local bot
  match inherited a stale `isMultiplayer=true` with a mismatched
  `myPlayerIndex`, which made `updateEndTurnButtonVisibility()` gate the
  end-turn button on real-multiplayer turn ownership instead of "always
  enabled locally" — silently disabling it and killing the match the instant
  a bot force-ended its turn. Reported symptom: a real 3-bot spectator match
  ending after turn 1 ("stuck on turn 0 (end-turn button unavailable)").
  Fixed with `ensureLocalMode()`, called at the start of `playGame()` and
  `spectate()` (covers `run()`/`evolve()` too). Verified by staging the
  exact stale state and confirming the match dies at turn 1 without the fix,
  runs the full turn cap with it.
- **RULES CHANGE: opponent hand scrolls show element type, not just count** —
  `js/game-ui.js` (`updateOpponentPanel()`), `js/bot-state.js` (`snapshot()`),
  `css/styles.css`. Previously the opponent panel showed "Hand: N scrolls
  (hidden)" with zero breakdown; now each hand scroll renders as an element
  icon (name/pattern still hidden) — same idea as a card game showing suit
  but not rank. `BotState.snapshot()` now exposes `players[i].handElements`
  (public for all players) alongside the existing `hand` (still `null` for
  opponents) and `handCount`. Not yet consumed by any scoring logic — this
  is the observability half of the "bot should react to opponent threats"
  discussion (see bot-roadmap.md), the evaluator half is unscoped/unbuilt.
  Verified: snapshot correctly reports `handElements` without leaking scroll
  names, UI renders one icon per opponent hand scroll.
- **RULES CHANGE: player tiles are off-limits for stones/opponent movement** —
  `js/game-core.js`, `js/game-ui.js`, `js/bot.js`, `js/bot-sim.js`. Two new
  rules: (1) stones can never be placed on a player tile or its bridge hexes
  (own or opponent's) — gated once in `isInPlacementRange()` via the new
  `isPositionOnPlayerTile()`, so all 6 call sites (drag-drop, keyboard
  cycling, bot legalActions/applyAction, plan-building) inherit it
  automatically; (2) a player may not move onto the CENTRE hex of another
  player's tile (their own centre stays reachable, required to win) — gated
  in `canPlayerMoveToHex()` via the new `isOpponentTileCenter()`, inherited
  by every caller (bot pathfinding/Dijkstra, drag movement, keyboard
  movement). `bot-sim.js`'s pure movement-cost mirror updated to match, so
  search/lookahead stays accurate. Considered and rejected an end-turn-based
  version of rule 2 first (blocked ending turn while standing on an
  opponent's tile) — abandoned after finding it could soft-lock a bot with
  0 AP on an opponent's tile in the local arena (no turn-timer safety net
  there, unlike real multiplayer); the user simplified to a movement
  restriction instead, which has no such risk since the tile is simply
  never enterable. Verified: direct function tests (own-centre movable,
  opponent-centre blocked, own/opponent placement blocked, bridge hex
  blocked, normal hexes unaffected) all pass; 15-game arena regression
  batch shows 14 decisive wins, 0 errors, 0 stuck turns, win rates
  comparable to pre-change baselines. Documented in
  docs/game-design-document.md and docs/INDEX.md.
- **BOT FIX: per-bot memory was shared across bot players (the actual
  "trapped in loops" bug)** — `js/bot.js`. Found from a real user's
  downloaded 2-bot-vs-2-bot action log showing an identical 6-hex
  hub-and-spoke movement path repeated turn after turn forever. Root cause:
  `_plan`/`_recentPositions`/`cellFailCount`/`cursedCells` were single
  shared module variables — fine for real multiplayer (one bot identity
  per tab) but broken for the cheat panel's local hot-seat/spectate modes,
  where ONE bot.js instance drives multiple bot players alternately, so
  each player's anti-oscillation memory got overwritten by the OTHER
  player's moves every turn switch. Fixed by keying all per-bot state
  behind `mem(playerIndex)`. Also added a coarser safety net: `botTurn()`
  detects when a player repeats last turn's exact move sequence and
  `botAct()` skips movement for one turn when that happens. Verified: 0
  exact-repeat occurrences across two fresh 15-game arena batches (previously
  reproducible every batch); circuit breaker fired 7x in one batch,
  correctly picking productive alternatives. **Follow-up flagged, not yet
  fixed:** a related within-turn oscillation from hybrid search staying
  engaged too broadly during exploration — see bot-roadmap.md § STAGE 1.
- **BOT FIX: placement phase was dead code outside real multiplayer** —
  `js/bot-state.js`. Root cause of a fresh "bots get stuck immediately"
  report: `legalActions()`/`applyAction()`'s `placeTile` handling both
  gated on `isPlacementPhase`, a flag ONLY set by the real multiplayer
  lobby flow — the local `startGame()` never touches it, and BotArena
  never caught this because its own placement helper bypasses BotState
  entirely for placement. Tutorial Mode has no such bypass, so a bot
  driven from the console right after "Play Tutorial" got zero legal
  actions forever ("No legal actions found" on every step — indistinguishable
  from a stuck loop to a human tester). Fixed by falling back to "this
  player has no pawn placed yet" (observable state) when the flag isn't
  meaningfully set. Verified: the same repro now plays 15 real turns,
  3/5 elements activated, no errors. Full writeup: bot-roadmap.md § STAGE 0.
- **BOT STAGE 2.5 (first increment): scroll-effect selection driving** —
  `js/bot-effects.js` (new), wired into `js/bot.js`'s `waitForQuiescence()`.
  Drives 5 of 12 selection-mode effects instead of cancelling them:
  tile-flip (Heavy Stomp / Call to Adventure), scorched-earth (Combust),
  tile-swap (Shifting Sands), Create, Scholar's Insight — all by calling
  the game's own `selectionMode.handleXClick()`/modal buttons directly,
  same philosophy as `BotState.applyAction()`. Found + fixed a real
  dispatch bug via arena testing (Scholar's Insight's cleanup-only
  selectionMode was silently swallowing the modal check before it ran).
  Measured on 8 arena games (same seeds, with/without `BotEffects`): fewer
  draws, higher fitness for the side benefiting from driven effects — no
  regressions. Remaining 7 selection scrolls + response-scroll playing are
  scoped in bot-roadmap.md § STAGE 2.5 but not yet built.
- **BOT FIX: doomed piecemeal placeStone loop** — `js/bot.js`. Reported
  symptom: bots in testing "easily get stuck doing nothing or going around
  in circles." Reproduced via `BotArena.run()` bot-vs-bot batches (not
  reachable from single-turn console testing): a 200-turn game deadlocked
  as a draw with one side stuck at 0/5 elements for the ENTIRE game — 228
  `placeStone` actions, 0 `cast` actions, 178 of them feeding stones into an
  already-won `WIND_SCROLL_5` pattern that could never grant win credit
  again. Root cause: `castAlreadyWon` only guards the `cast` action; the
  anchored `_plan` system's credit gate only protects plan-driven
  placements; the greedy fallback and default hybrid-search path both pull
  raw candidates from `BotState.legalActions()`, which has no win-credit
  awareness. Fixed with a shared `hasWinCredit()` check + hard veto
  (`placeNoCredit: -500`) applied in both `scoreAction()` and
  `searchPick()` (root + every recursive ply). Confirmed on the exact
  reproducing seed: 200-turn draw → 42-turn decisive win. Full writeup:
  docs/bot-roadmap.md § Stage 1 fixed-bugs list (5th entry).
- **MASON'S SAVVY PLACEMENT RANGE FIX** — `js/game-core.js`, `js/game-ui.js`:
  `findValidStonePosition()` read the stone type off the module-global
  `draggedStoneType`, but both the mouse and touch drop handlers nulled
  that global *before* calling it, so `isInPlacementRange()` always saw
  `stoneType = null` and silently skipped the earth-only extended-range
  check (Mason's Savvy) and the water/wind one (Seed the Skies), falling
  back to plain adjacency. The keyboard placement-preview path passed the
  type explicitly and worked fine — hence the "inconsistent" symptom.
  Fix: `findValidStonePosition(x, y, stoneTypeOverride)` now takes an
  explicit override; both drop handlers pass the captured type before
  nulling the global. Verified headless via Playwright (stubbed Supabase
  client, tutorial board): same distance-3 earth-stone drop with the buff
  active went from `valid: false` → `valid: true`.
- **BOT STAGE 2.5 (later increments): Transmute driving + response scrolls in
  real multiplayer** — `js/bot-effects.js`, `js/bot-driver.js`,
  `js/response-window.js`(-adjacent), `js/game-core.js`. Added
  `driveTransmute()` (open-ended discard-for-AP modal, no `selectionMode`
  object) and `decideResponse(responderIndex, casterIndex)` (v1 respond/pass
  heuristic, no bluffing). Wired into both the arena (`bot.js`
  `waitForQuiescence`, gated on `BotArena.isRunning()`) and real multiplayer
  (`bot-driver.js`'s new `respondForBots()`), which required removing the
  "bots never count as responders" carve-out in response-window.js and fixing
  an AP-accounting gap for non-active responders (`syncPlayerState()`/
  `spendPlayerAP()`). Full writeup: bot-roadmap.md § STAGE 2.5.
- **BOT ARENA: N-player playMatch() unification** — `js/bot-arena.js`,
  `js/game-ui.js`. Extracted `playMatch(weightsPerPlayer, opts)` as the
  single game-runner both `run()`/`evolve()` (previously 2-player only) and
  `spectate()` (previously its own separate loop) call, so `run()`/`evolve()`
  gained `opts.visual` (watch training games live) and `evolve()` gained
  `opts.nPlayers` (2–5; >2 samples random N-player groupings per generation
  instead of exhaustive pairwise). New "🧬 Evolve" cheat-panel row alongside
  "🤖 Bot match". **Merge note:** this rewrite was built on a fork of
  bot-arena.js that predated `ensureLocalMode()` (the stale-isMultiplayer fix
  above) and the `sideFitness()`/`stuckTurns`/progress-callback machinery
  from later commits on this branch — the merge re-added all three to the
  unified `playMatch()`/`run()`/`evolve()` rather than losing them.
- **BOT STAGE 2 (forward model + lookahead)** — `js/bot-sim.js` (new):
  pure `simulate(snap, action)` over the Stage-0 snapshot (move incl.
  tile-reveal-as-unknown, endTurn incl. shrine collection + COLOR_RANK turn
  order, placeStone incl. fire-destruction rules, cast with whitelist-gated
  effects), pure `legalActions(snap)`, `isTerminal/winner`, and a
  `validate()` mirror-and-diff harness. Validated headless (Playwright +
  tutorial board): 0% divergence for move/endTurn/placeStone/discard
  (~750 mirrored actions) — roadmap target was <1%. Lookahead in `bot.js`:
  `searchPick()` beam search + `evaluateSnapshot()`, enabled by
  `WEIGHTS.searchDepth > 0` (**default 0 = greedy unchanged**; flip only on
  Stage-3a arena evidence). Also fixed `BotState.applyAction('cast')`
  silently no-opping when castSpell's multi-match selection popup appears.
  Full details + new gotchas: docs/bot-roadmap.md § STAGE 2.

## Previously Committed Work
- **NEW WIN CONDITION (rules change):** winning now requires activating all 5 elements
  AND returning the pawn to the centre of your own player tile (the "player shrine").
  Single gate: `checkWinCondition(playerIndex, {announce})` in `game-core.js` (also on
  `window`). All former `activated.size === 5` checks route through it; movement paths
  (placePlayer move branch, broadcastPlayerMovement, movePlayerVisually) call it on
  arrival. Includes: shrine beacon (pulsing ring on the player tile), "return to your
  shrine" status prompt, bot support (`WEIGHTS.moveReturnHome`, snapshot tiles carry
  `playerIndex`), tutorial + docs text updates.
  This also fixes the original bug where a `requiresSelection` scroll (e.g. Control the
  Current) as the 5th element never triggered the win screen — the win check now runs
  before the early return in `applyScrollEffects()`.
- Joytone adaptive music integration: `joytone/` (embedded music app + MIDI/sf2 assets),
  `js/joytone-bridge.js` (hidden iframe, Shift+J+T popup, tile-reveal → seeded riff,
  per-player mute/volume in Settings). Details: js/INDEX.md § joytone-bridge.js.
- Tutorial system: player places own tile, explores freely, first flip forced to Earth
- Distributed docs system: CLAUDE.md, js/INDEX.md, js/scrolls/INDEX.md, css/INDEX.md,
  docs/INDEX.md, planning/current.md, .claude/skills/sync-docs.md

## Current Status
Tutorial functional through step 4 (Earth tile reveal + scroll drawn). Steps 5–14
exist in code but are untested end-to-end. Docs system fully in place.

---

## NEXT SESSION TASK LIST (priority order)

### 0. Bot track (see docs/bot-roadmap.md)
1. ~~Stage 3a — self-play arena~~ **DONE** (`js/bot-arena.js`). First
   measurements: HYBRID search beat greedy **12-3-5** over 20 games →
   hybrid is now the default bot brain (searchDepth 3 + searchHybrid 1).
   Full always-on search LOST 1-3-4 — don't enable without new evidence.
   Arena runs also flushed out + fixed 5 real bot bugs (stale hex-grid
   cache, cul-de-sac freezes, hand-only planning, missing common-area
   casts/voluntary discards, anti-freeze vs shrine collection) — details
   in bot-roadmap § STAGE 3a.
2. **IN PROGRESS: Stage 2.5 — scroll-effect usage.** Step 1 (inventory) is
   **DONE** — full table of all 17 selection-mode/response scrolls in
   bot-roadmap.md § STAGE 2.5. Step 2 (`js/bot-effects.js`) is **STARTED**:
   5 of 12 selection effects driven (tile-flip, scorched-earth, tile-swap,
   Create, Scholar's Insight), A/B-measured in the arena (fewer draws, no
   regressions vs. baseline on identical seeds). NEXT: the remaining 7
   click/modal-based scrolls (Sacrificial Pyre, Inspiring Draught,
   Wandering River, Control the Current, Arson, Plunder, Quick Reflexes,
   Excavate's deferred teleport), then decide an approach for the 2
   drag-based ones (Telekinesis, Take Flight), then step 3 (response
   scrolls). Also still open: the `EFFECT_MODAL_IDS` missing
   `'transmute-modal'` bug found during inventorying. Full plan:
   bot-roadmap § STAGE 2.5.
3. Later: rerun hybrid-vs-greedy at 100 games + run BotArena.evolve()
   at scale (wants R5 server-side execution to be practical).
4. **Opponent-awareness — Track A DONE (evaluator term), Tracks B/C not
   started.** Track A: `evaluateSnapshot()` now scores opponent threat —
   `opponentProgress(snap, oppIndex)` mirrors the bot's own
   activated+home-distance terms for every opponent (MAX across opponents,
   not sum, so it doesn't dilute in 3-5p); `commonAreaThreat(snap, forIndex)`
   flags any live common-area scroll an opponent's CURRENT board could cast
   right now, via `BotSim.checkPattern(snap, scroll, playerIndex)` (already
   parameterized for any player, just unused before). New weights
   `evalOpponentThreat: 0.3`, `evalCommonThreat: 80`. Found and fixed a real
   bug along the way: `bot-sim.js`'s `simDiscard()` didn't model common-area
   REPLACEMENT (one scroll per element, old one bumped to deck bottom) — it
   just pushed onto an unbounded array, so the denial mechanic could never
   register in simulation. Verified: `evaluateSnapshot()` delta exactly
   matches each new weight in isolation; a constructed scenario (opponent's
   board satisfies a common scroll, bot holds a dead-to-it same-element
   scroll) makes `searchPick()` correctly choose the denial discard
   (score 436) vs. ignoring it entirely with the terms zeroed (picks a plain
   move instead, 464) — a real behavior change, not just a score delta. A/B
   arena batch (30 games, same seed, weights on vs. zeroed): 12-13-5 vs.
   13-12-5, avg turns 69.3 vs. 70.2 — statistically identical, **no
   regression**. Not yet reachable from hybrid search's non-search branch
   (greedy `scoreAction()` has no opponent awareness) — flagged, not closed.
   Tracks B (generalize `playGame()`/`run()`/`evolve()` past 2 players) and C
   (catacomb/Freedom teleport action) remain unscoped/unbuilt as originally
   planned.
5. **KNOWN ISSUE, not yet fixed: response-only (level-1) scrolls can
   permanently clog a common-area element slot ("elemental lockout").**
   Neither bot can ever cast OR respond with a level-1 scroll (main-phase
   casting is blocked by rule — "Level 1 scrolls can only be used as
   responses" — and `response-window.js`'s `isBotPlayer()` hard-excludes
   bots from ever being considered as responders). The bot already has a
   mitigation for holding them (`discardResponseOnly: +25` nudges voluntary
   discard) — but discarding just moves the dead scroll into the shared
   common-area slot for its element, and nothing ever displaces it again
   unless someone discards ANOTHER scroll of that same element there.
   Confirmed on real data: in a 200-turn drawn arena game (seed 40000, game
   6 of a 30-game batch), `EARTH_SCROLL_1` and `FIRE_SCROLL_1` each landed in
   their element's common-area slot around the 65-70% mark and were never
   replaced for the rest of the game — while every other element's slot kept
   churning normally. This reduces both players' win paths for that element
   for the remainder of the game and is a real, verified contributor to
   draws (independent of the opponent-threat work above — same draw rate
   with or without it on this seed). Real fix is full response-scroll
   support (see bot-roadmap § STAGE 2.5 step 3, not started — needs
   `response-window.js`'s bot-exclusion removed, priority/no-bluff response
   logic per user's explicit call: bots should only pass-or-respond, no
   bluffing). Cheaper interim mitigation not yet scoped.

### 1. Tutorial — Earth Shrine Step (MEDIUM, tutorial-mode.js)
After step 4 (scroll found), the tutorial should:
- Guide player to walk to the **center hex of the earth tile** (the shrine center)
- Tell them to **End Turn** there to collect 5 earth stones
- The `#end-turn` button spotlight already exists in step 8 (`getting-stones`) — but
  the flow needs an explicit "now go stand on the shrine center and end your turn" step
  BEFORE the stone-abilities explanation.
- Hook to use: `onPlayerMoved(x,y)` is currently a no-op — wire it up to detect when
  the pawn is within ~20px of `EARTH_POS` (the revealed earth tile center) and set a
  flag. Then detect end-turn from `onEndTurn` hook (doesn't exist yet — needs adding
  in `game-core.js` where `endTurn()` is called).
- Alternatively: advance automatically when `stoneCounts.earth` increases (check after
  end-turn resolves).

### 2. Source Pool Win Condition Bug (HIGH, game-core.js)
**Rule (from game design doc):** If the source pool for an element has 0 stones remaining,
casting a scroll of that element still works (effect fires) but does NOT count toward
the player's win condition. The win condition only registers if ≥1 stone of that type
exists in the source pool at cast time.

**Where to fix:** `applyScrollEffects()` in `game-core.js`, specifically the block that
calls `spellSystem.activated.add(element)` (the win-condition tracking). Before that
add call, check `stoneCounts[element] > 0` (stoneCounts = source pool). If 0, skip
the add but still run the scroll effect. Show a status message like:
"Scroll cast! (No [element] stones in the source pool — win condition not awarded.)"

**Relevant variables:**
- `stoneCounts` = source pool (global, 0–25 per element)
- `spellSystem.activated` = Set of elements the active player has won
- The `cancelled` flag already exists for a different case (empty hand on Sacrificial
  Pyre) — do NOT reuse it here; add a separate `noWinCondition` flag or inline check.

### 3. Tutorial — Clarify Stone/Scroll Limits
The tutorial text is vague. Make these explicit at the appropriate steps:
- **Player stone pool**: max **5** of each element type (shown as `X/5` in left panel)
- **Source pool**: max **25** of each element type (shared across all players)
- **Hand size**: max **2** scrolls
- **Active area**: max **2** scrolls
- **Source pool + win condition**: if source pool for an element hits 0, casting a
  scroll of that element won't count toward your win — acknowledge this in the
  "getting stones" step of the tutorial.

---

## Known Open Issues
- `onPlayerMoved` hook in game-ui.js exists but tutorial-mode.js treats it as no-op
- Steps 5–14 of tutorial untested in full sequence

(`TRANS-WIN-CON` and `TRANS-DOUBLE-DISP` confirmed cleared — removed from this list.)

## Files Currently In Flight
None — all changes committed and pushed.

## How To Resume
1. `git log --oneline -5` to confirm last commits
2. `npx serve -p 3333` → open `http://localhost:3333`
3. Click "Play Tutorial" on auth screen (do not log in)
4. Play through to step 4 to confirm baseline, then work on task list above

---

*Last updated: 2026-07-13 (Start Training now persists champions to a new Supabase table and auto-applies the best community one on load, closing the "training only helps one browser" gap; file-based champion breeding via the Bot Training panel stays local/manual by design; fixed the out-of-AP modal appearing during Watchable/visual bot runs, not just stale leftovers; evolve() crossover between elites; fixed Stop being ignored during Train Weights' confirmation phase)*
