# Current Active Work

> This file is the session start point. Update it at the end of every work session.
> Claude: read this first, then drill into the relevant INDEX.md before touching source.

---

## Active Branch
`claude/earth-blocking-fire-tactics-bpinp3` → remote: `JakeSeegers/Godaigo.Elements`
(continues from `claude/merge-bot-branches-safe-3p`, which merged
`claude/bot-crash-three-player-2wcy9j` (base: `4.10.progresscheck`) with
`claude/masons-savvy-range-bug-ep7hjm` — see that branch's note in git
history for the bot-arena.js conflict resolution.)

## Last Committed Work
- **BOT STAGE 4 COMPLETE: earth-blocking / fire-interference tactics +
  wind-for-movement placement** — `js/bot-state.js`, `js/bot.js`,
  `docs/bot-roadmap.md`, `js/INDEX.md`. User request: build the roadmap's
  § STAGE 4 scoped design, plus "placing wind stones for movement is an
  important strategy." The roadmap's premise that placement is dictated by
  the bot's own pattern turned out to be a Stage-0 VOCABULARY gap, not a
  game rule — humans can drag any held stone onto any valid in-range hex —
  so `legalActions()` now also enumerates TACTICAL placeStone candidates
  (`scroll:null, tactical:true`: held earth/wind/fire onto empty hexes
  adjacent to the pawn; ≤ ~18 candidates, range buffs deliberately not
  exploited). `bot.js`: `tacticalContext(snap)` built once per real
  decision, root-only per the scoped design (never per search leaf) —
  opponents' cheapest-path hex sets toward their next objective (nearest
  needed shrine / home when complete; `pathToOrNear()` falls back to a hex
  adjacent to targets our `canPlayerMoveToHex` can't enter), the bot's own
  objective-path hexes, and "loaded gun" threat stones (stones inside a
  currently-satisfied pattern an opponent could cast NOW — common area +
  their PUBLIC active area only, hand names stay hidden). Fed through
  `tacticalPlaceBonus()` into BOTH brains at the root: greedy
  `scoreAction()` via `ctx.tac`, and `searchPick()` root scores (same
  pattern as revisitPenalty). New weights: `placeTacticalBase` (−4),
  `placeEarthBlock` (+45/opponent blocked), `placeSelfBlockPenalty` (−40),
  `placeWindPath` (+12), `placeFireThreatBreak` (+70/threat stone,
  mirrors the fire-burn void-guard rule), `placeTacticalStarvesPlan`
  (−500). Guards shipped with it: hybrid's search trigger and botTurn's
  `productive` bookkeeping both ignore tactical candidates (near-always
  legal — would degenerate hybrid into always-on search / mask stalls).
  **Wedge found via arena regression and fixed before committing:** wind
  paving initially turned ~30% of arena games into bogus draws — the own
  path's DESTINATION (target shrine centre) got paved, and the collect leg
  looped "step on (free) → endTurn rejected (resting on a stone is
  transit-only) → step off → replan" until the 30-action cap expired with
  the pawn on the stone, where the arena's forced endTurn is also
  rejected. Fixed: `collectibleShrines()` excludes stone-occupied centres
  (collection = resting there), `ownPathHexes` excludes revealed
  tile-centre hexes (wind pays on corridors, never on hexes the bot must
  rest on), and `botTurn()` steps off a stone before finishing when a
  stone-free hex is affordable. Verified headless with exact weighted
  deltas + negative controls (wind 8 vs −4 on/off path; earth 41 vs −4,
  back to −4 with the opponent gone; fire 66 vs −4 once the opponent's
  scroll is removed); arena regression 10 + 8 games ALL decisive (5-5-0,
  4-4-0), zero stalls/stuck/page errors, ~10 terrain placements per game.
- **BOT FIX: stones placed on the void left behind by a moved tile
  (Telekinesis / Shifting Sands)** — `js/bot-state.js`, `js/bot.js`,
  `js/INDEX.md`. User screenshot: a tile was Telekinesis'd away and bots
  kept placing stones onto the black empty space where it used to be.
  Root cause chain: a bot's build plan validates its cells against the
  board grid only when the plan is MADE (`viablePatternAt`); Telekinesis
  eligibility requires the tile to be stone-free, so the move is legal
  mid-plan; `planValid()` re-checks holding/corruption/fire-survival every
  turn but never board membership; and `applyAction('placeStone')` checked
  stones/pawns/face-down/range but not "is this a real hex" —
  `isInPlacementRange()` is pure distance+buffs, and
  `isPositionOnFlippedTile()` returns false when there's NO hex at all.
  Humans were never affected because drag-drop snaps to
  `getAllHexagonPositions()` — the bot plan path passes raw coordinates
  straight through. Fixed at both layers: `applyAction('placeStone')` now
  rejects any target not on a board hex (authoritative gate for every bot
  path — plans, arena, effects, console), and `planValid()` re-checks all
  plan cells against the live grid so a plan whose tile moved away dies
  immediately and the bot replans instead of burning an attempt. Verified
  headless: staged pawn on a revealed tile, moved the tile 5000px away →
  placement rejected ('not on the board'), zero stones created; moved the
  tile back → the IDENTICAL placement succeeds; negative control (fixes
  stashed) reproduces the bug exactly — the void placement succeeds and a
  floating stone appears; 2-game arena regression clean (plans still
  work).
- **BOT: catacomb teleport ping-pong fix + arena no-cast stall cap** —
  `js/bot.js`, `js/bot-arena.js`, `js/INDEX.md`. User report: bots get
  stuck teleporting back and forth between catacomb tiles (it's free
  movement), and the arena never restarts those games — the camping
  detector above can't see it (catacombs aren't elemental tiles, and
  alternating tiles resets the per-tile streak every turn). Two fixes:
  (1) WEIGHTS-level: new `teleportRevisitPenalty` (-60) applies the SAME
  recency-decayed `revisitPenalty()` movement already uses to teleport
  destinations, in both greedy `scoreAction()` and `searchPick()`'s root.
  Teleports previously had NO anti-oscillation memory at all — applied
  hops now record BOTH ends into `recentPositions` (origin first, so "hop
  straight back" always draws the strongest k=1 penalty). `teleportBase`
  is only +5, so a return hop scores -55 (firmly vetoed) while a hop
  somewhere NEW keeps the full +5 nudge — teleporting for movement stays
  encouraged, per the user's constraint. (2) ARENA-level: second stall
  detector sharing the existing restart machinery — if
  `opts.stallNoCastRounds` (default 15) full rounds pass with NO bot
  casting a single scroll, the round aborts and restarts with a derived
  seed, exactly like the camping stall. Cast detection via a new
  monotonic `BotSystem.castsApplied()` counter (incremented at both
  apply sites in bot.js — plan-driven and scored casts; the arena reads
  deltas, so no reset is needed). Verified headless: score of a
  return-hop = base + full penalty (-55) vs. +5 for a fresh destination
  with identical history; a castless stubbed game stalls at exactly
  3 rounds with `stallNoCastRounds:3` and consumes its restart budget;
  a high cap (50 rounds) never false-fires inside a 12-turn cap; the
  camping-detector tests and a real 2-game batch still pass (the
  camping tests now pin `stallNoCastRounds:999` to isolate detectors,
  since their stub bots never cast).
- **BOT FIX: host's response window auto-cleared when a bot submitted first
  (real multiplayer with lobby bots)** — `js/scrolls/response-window.js`,
  `js/scrolls/INDEX.md`. User report: with a bot in the game, the host's
  own response window got auto-cleared as if the host were a bot. Two
  related causes, both "UI teardown not gated on WHO submitted": (1)
  `playerPasses()`/`playerResponds()` on a non-arbitrator client
  unconditionally ran `closeResponseModal()`/`clearResponseTimeout()` —
  but the host's client is the one that submits passes/responses ON BEHALF
  OF every bot (`bot-driver.js`'s `respondForBots()` →
  `BotEffects.decideResponse()` → `rw.playerPasses(botIndex)`), so a bot's
  pass within 700ms of the window opening wiped the host's own still-open
  modal and its countdown. Only the host runs `respondForBots()`, matching
  the "maybe only the host" in the report exactly. (2) The arbitrator-side
  variant: when a host-driven bot is the CASTER, the host client
  arbitrates, so any other player's pass/response lands in
  `checkAllPlayersResponded()` → `showWaitingForOthers()`, which replaced
  the host's open response options with the waiting spinner mid-decision.
  Fixed by gating all three teardown paths on the local human
  (`localResponderIndex()`): modal close + timer clear only when the
  submitter IS the human at this screen; the waiting spinner only once
  that human has themselves submitted. Human-vs-human play is unchanged
  (`BotDriver.driverRealIndex()` is null outside impersonation, so
  `localResponderIndex()` = plain `myPlayerIndex`). Arena/local games are
  unchanged too (their teardown runs through `resolveResponseStack()`,
  which still closes everything at resolution). Verified headless
  (Playwright, real `ResponseWindowSystem` against a staged 3-player
  multiplayer identity): bot pass leaves the host's modal + countdown
  intact and the host's own pass still closes both; while arbitrating for
  a bot caster, a remote pass no longer clobbers the host's response UI;
  negative control (fix stashed) reproduces all 4 failures.
- **BOT ARENA: trap-loop stall restart** — `js/bot-arena.js`, `js/INDEX.md`.
  User request: arena/evolution games where bots wedge into a stable camp
  (each parked on an elemental tile, neither moving) previously ground on to
  the full 200-turn cap before registering as a draw. `playMatch()` is now a
  wrapper around `_playMatchOnce()`: after each player's turn, a per-player
  streak counter tracks consecutive own turns ended on the SAME revealed
  elemental tile (closest-center-within-`TILE_SIZE*5.5` rule mirroring
  game-core's unexported `findTileAtPosition()`, filtered to
  revealed + earth/water/fire/wind/void — never reads `shrineType` off a
  face-down tile). When ≥2 players' streaks hit 7 (`STALL_TURNS`/
  `STALL_MIN_BOTS`), the round aborts (`result.stalled:true`) and playMatch
  restarts it from scratch with a DERIVED seed (`baseSeed + attempt*1000003`
  — replaying the identical seed would deterministically walk back into the
  same trap). `opts.maxStallRestarts` (default 3) caps retries so a
  pathological weight table can't spin forever; a round still stalled after
  the budget is returned as-is (winner null → draw, `result.restarts` =
  restarts consumed). Discarded attempts never reach
  run()/evolve()/spectate() stats, so nothing double-counts. Applies to ALL
  playMatch callers (run/evolve/spectate/playGame) uniformly. Verified
  headless (Playwright, stubbed Supabase CDN): stubbed bot turns parking
  both bots on two different elemental tiles trigger the abort exactly on
  turn 14 (7 own turns each) and consume the full restart budget
  (`stalled:true, restarts:1` with `maxStallRestarts:1`, 2 abort logs +
  1 restart log); negative control with only ONE bot parked runs to its
  turnCap untouched (`stalled:false, restarts:0`); a real 2-game
  `BotArena.run()` batch completes clean with zero page errors.
- **DOC CLEANUP: Track B was already done, just never marked as such** —
  `planning/current.md`. User asked "what's next" in the bot plan; while
  answering, re-checked the stale "Track B (generalize
  playGame()/run()/evolve() past 2 players) remains unscoped/unbuilt" note
  against the actual code rather than trusting the doc. Confirmed directly
  in `bot-arena.js`: `playMatch(weightsPerPlayer, opts)` is genuinely
  N-player (2-5) generic (derives player count from
  `weightsPerPlayer.length`); `evolve()` takes `opts.nPlayers` and samples
  N-player groupings when >2; `playGame()` is now just a thin 2-player
  backward-compat wrapper around `playMatch()`. `run()` intentionally
  stays 2-player-only — not a gap, since the confirmation gate is always a
  pairwise champion-vs-baseline comparison regardless of training player
  count. This work happened earlier (the N-player `playMatch()`
  unification, already in "Last Committed Work" further below) — the
  Track B note just never got updated to reflect it. Corrected both the
  detailed note and the item's own stale "Track A DONE, Tracks B/C not
  started" summary line.
- **BOT TRAINING UI: persistent progress popup + "End Early" control** —
  `js/bot-arena.js`, `js/game-ui.js`, `js/INDEX.md`. User request: the
  "🧬 Bot Training" panel should show info about the current run and stay
  visible like a popup (comparing it to the always-visible Hand panel),
  plus let the user end training early and force the confirmation match
  against the starting weights rather than just aborting. Clarified via
  AskUserQuestion: the popup should appear automatically whenever ANY
  training/breeding run is active (not just while the big modal happens
  to be open), and "End Early" should live in the popup itself.
  `bot-arena.js` gained a SEPARATE soft-stop flag, `endEarly()`/
  `_endEarlyRequested`, checked in `evolve()`'s generation and per-game
  loops alongside the existing `_stopRequested`. Deliberately distinct
  from `stop()`: the existing Stop button is a hard abort that
  `runWeightTraining()` treats as "discard everything, revert to the
  starting weights" — End Early needs the opposite semantics, cutting the
  generation loop short while still returning a genuinely usable
  champion (`evolve()` only advances `champion` after a generation
  finishes ranking, so an early exit never returns a half-computed
  result), so the caller's normal confirm-or-download flow runs on
  whatever was reached so far.
  `game-ui.js` gained a new persistent corner popup
  (`ensureTrainingPopup()`/`showTrainingPopup()`/`hideTrainingPopup()`),
  deliberately defined at the OUTER scope (same level as
  `runWeightTraining()`/`stopAnyRunningBotJob()`, not inside
  `openBotTrainingPanel()`) so it survives the main modal being closed
  and reopened — everything inside the modal itself (including its own
  progress text) is rebuilt fresh every time it opens, so a
  closed-and-reopened modal can't show a run that's already in flight;
  this popup is attached directly to `document.body` and referenced by a
  stable outer variable instead, so the SAME onProgress callback a
  running job captured at start time keeps reaching it regardless.
  Shows: training vs. breeding, player count, population size,
  generation/confirming phase, games done, elapsed time, and best
  fitness so far. "End Early → Test Now" hides itself once the confirming
  phase starts (nothing left to skip ahead to); for breeding, which has
  no confirmation phase at all, it just means "stop generating more
  generations and download the current best now." An "⤢" button
  reopens the full modal via a small `window._openBotTrainingPanel`
  bridge. Deliberately NOT done: hoisting the modal's own roster/
  generation-log state to the same outer-scope persistence — reopening
  the modal mid-run still shows an empty roster until the next
  generation tick populates it fresh; scoped as a pre-existing, secondary
  rough edge rather than risking a bigger refactor of the lineage-tracking
  display built earlier this session.
  Verified against the real running game: a fast breeding run
  (population 2) confirms the popup shows correct scenario/progress
  info, survives the modal being closed, End Early genuinely cuts the
  run short (1 of 20 requested generations completed) without breaking
  the file download, and the popup hides on completion. A direct
  `runWeightTraining()` call with a small preset (population 2, to avoid
  the sandbox's slow per-generation cost at the UI's hardcoded
  population-6 preset) confirms the training-path mechanism specifically:
  End Early stops the generation loop early (1 of 10 requested) AND
  correctly transitions into the confirming phase, producing a real
  confirmation record (`"0-2"`) rather than a discarded `"stopped"`
  result. 10-game arena regression shows no errors.
- **BOT STAGE 2.5 FULLY COMPLETE: drive Excavate, Take Flight, and
  Telekinesis — the entire choice-space inventory is now covered** —
  `js/bot-effects.js`, `docs/bot-roadmap.md`, `js/INDEX.md`. User request:
  "let's move forward with the take flight - telekinesis - excavate
  system." Excavate (CATACOMB_SCROLL_4) turned out to be misfiled in
  earlier notes as "drag-based" — it never was. Its deferred teleport
  (fires at the start of the caster's NEXT turn via
  `processExcavateTeleport()`) is a clean 2-step flow identical in shape
  to everything else: a Teleport/Stay Here prompt (always take it — free
  repositioning, no downside) then a `handleHexClick(hexPos)`
  selectionMode exactly like tile-flip/tile-swap. Candidate hexes come
  from `BotState.hexGrid()`, filtered to the SAME rule `handleHexClick()`
  itself enforces (revealed non-player tile, no stone, no player);
  heuristic picks whichever candidate is closest to the bot's current
  objective (home if all 5 activated, else nearest hidden tile). Can't
  land ON a player tile at all, so unlike catacomb/Freedom teleport this
  never doubles as a direct win.
  Take Flight (WIND_SCROLL_4) and Telekinesis (VOID_SCROLL_4) genuinely
  ARE drag-only at the UI layer — no `handleXClick()`/`onComplete(x,y)`
  API covers the actual move, unlike every other effect driven so far.
  Rather than simulating raw mouse drag events (fragile, timing-dependent,
  and against the "never reimplement game rules" philosophy this whole
  file follows), both drivers call the EXACT SAME functions the real drop
  handler calls, in the same order, just triggered directly:
  - **Take Flight**: v1 ALWAYS targets self — a downside-free "teleport
    anywhere unoccupied" (the scroll stays in the caster's active area
    for self-targeting), while opponent-targeting has a real strategic
    tradeoff (denial value vs. handing them a scroll for their hand)
    deliberately left unscoped rather than guessed at.
    `window.takeFlightState.onComplete(x,y)` only finalizes scroll
    disposition/broadcast — it does NOT move the pawn itself. The real
    drop handler (`game-ui.js`) calls `placePlayer()` (self-target) or
    `movePlayerVisually()` (opponent-target) FIRST, then `onComplete()` —
    the driver mirrors both calls exactly. Any hex works as a destination
    (no revealed/tile-type restriction, unlike Excavate), so a direct
    teleport home is legal and correctly wins via `placePlayer()`'s own
    `checkWinCondition()` once all 5 elements are activated.
  - **Telekinesis**: no target-picker — goes straight into drag mode.
    Mirrors `startTileDrag(tileId, event)` (pickup — removes the tile
    from `placedTiles` + DOM, exactly what a human mousedown does) then
    `placeTile(x, y, rotation, flipped, shrineType, false, false,
    tileId)` with the SAME tile id (drop — re-adds it at the new
    position). `findNearestSnapPoint()` already enforces the "must touch
    1 other tile" rule internally whenever
    `window.telekinesisState.active` is true, so no extra validation
    logic was needed. The move-counter/broadcast bookkeeping the real
    mouseup handler does inline (no separate function exists for it) is
    mirrored explicitly. No clear strategic value model for which tile to
    move or where (same reasoning `driveTileSwap` already uses for
    Shifting Sands) — v1 picks the least-disruptive relocation: an
    eligible tile moved to an empty slot immediately adjacent to its own
    current position. **Bug caught during testing, fixed before
    verifying:** the first eligible tile isn't a safe default — an
    interior tile deep in a compact cluster never has a free adjacent
    slot (that's what makes it interior), so trying only `eligible[0]`
    silently did nothing useful against a real board layout (11 eligible
    tiles, 0 moved). Fixed by dry-running the destination check
    (`findNearestSnapPoint` is side-effect-free) across ALL eligible
    tiles first and only starting the real pickup once a tile+destination
    pair is confirmed to work.
  Verified against a real running game (direct `enterX`/`processX`
  invocation, same testing style as every other effect here): Excavate
  completes both steps and teleports to a valid revealed hex; Take Flight
  completes both steps, moves the pawn, and correctly keeps the scroll in
  the caster's active area; Telekinesis correctly skips the boxed-in tile
  and moves a different eligible one instead, tile count unchanged
  before/after (no duplication/loss), all drag-state cleared afterward.
  10-game arena regression shows no errors.
- **BOT STAGE 2.5 COMPLETE: drive Control the Current, the last selection
  effect** — `js/bot-effects.js`, `js/bot.js`, `docs/bot-roadmap.md`.
  Different SHAPE of problem from every other scroll effect driven so
  far: Control the Current (WATER_SCROLL_5) is a persistent whole-turn
  ability with no "Done" button (`selectionMode.type: 'water-transform'`),
  meant to coexist with the rest of the bot's turn (opportunistically
  transform an adjacent water stone while moving) rather than resolve
  once. `bot.js`'s `waitForQuiescence()` previously cancelled ANY
  selectionMode `driveSelection()` couldn't act on — for this persistent
  mode that would have prematurely ended the effect's whole-turn duration
  the instant no water stone happened to be adjacent yet, discarding any
  benefit from moving toward one later. Fixed with a targeted exception:
  when `driveSelection()` returns false AND `selectionMode.type ===
  'water-transform'`, treat it as quiescent (just `return`) instead of
  cancelling — every other undriven selection is still cancelled exactly
  as before. New `driveWaterTransform()` recomputes eligible stones FRESH
  via `se.getAdjacentWaterStones()` on every call rather than trusting
  `selectionMode.highlightedStones` — that cache is only refreshed by
  `placePlayer()`'s move branch (game-core.js), which `bot-state.js`'s
  `move` action bypasses (mutates position directly instead), so trusting
  the cached list would have silently missed stones that became adjacent
  after a bot move. The actual end-of-effect cleanup is unchanged —
  `clearTurnBuffs()` (`scroll-effects.js`, called on End Turn) already
  tears the selectionMode down correctly; this fix only stops something
  ELSE from doing it prematurely. Verified against a real running game:
  casting with no water stone adjacent — `waitForQuiescence()` returns in
  ~1ms (not the 25s timeout, not a cancel) and the selectionMode
  survives; placing a stone adjacent afterward — the next call correctly
  drives the transform and the mode stays active for further use;
  simulating End Turn's `clearTurnBuffs()` correctly clears it. 10-game
  arena regression shows no errors. **Stage 2.5 is now 12/12 selection
  effects driven** — only the 2 drag-based scrolls (Telekinesis, Take
  Flight) and Excavate's deferred teleport remain, needing a programmatic
  drag hook before they can even be scoped.
- **BOT STAGE 2.5: drive 3 more scroll effects (Wandering River, Arson,
  Plunder)** — `js/bot-effects.js`, `docs/bot-roadmap.md`. Continuation of
  the Stage 2.5 remainder after fixing the two stale doc entries below
  (which had wrongly reported this stage's status). Wandering River
  (WATER_SCROLL_4): picks the eligible tile closest to the bot, then the
  most-needed element via the existing `clickBestElement()` helper. Needed
  a guard against re-clicking the tile every polling tick, since
  `selectionMode.type` stays `'tile-element-change'` through BOTH the
  tile-pick and element-pick steps (only clears once the element modal
  resolves), and the dispatcher's `switch(sm?.type)` always runs before
  the modal-check chain — without the guard the switch would keep firing
  first, destroying and recreating a fresh `element-select-modal` forever
  instead of the modal driver ever getting a turn. Arson (FIRE_SCROLL_5)
  and Plunder (CATACOMB_SCROLL_8) share a new `rankedOpponents(filterFn)`
  helper: "hit the biggest threat" — most activated elements, tie-broken
  by total pool size, never self (a plain voluntary discard already covers
  what self-targeted Plunder would do). Arson destroys the target's
  largest stockpiled available element; Plunder takes their highest-level
  active scroll — the inverse of `pickWeakestButton`'s existing "give up
  MY OWN weakest" logic already used for Sacrificial Pyre/Inspiring
  Draught. Plunder's scroll-pick step shares `scroll-select-modal` with
  those two, routed by heading text via the existing dispatcher. Verified
  against a real running game (direct `enterX` invocation, same style
  used for the earlier 3 effects): all three complete both steps and
  produce the expected board/state changes (buff applied, stone
  destroyed, scroll moved to common area). 10-game arena regression shows
  no errors. **Deliberately NOT included: Control the Current**
  (WATER_SCROLL_5) — architecturally different from every effect driven so
  far: a persistent whole-turn ability with no "Done" button, meant to
  coexist with the rest of the bot's turn (opportunistically transform an
  adjacent water stone while moving) rather than a one-shot pick.
  `waitForQuiescence()` cancels any selectionMode `driveSelection()` can't
  act on — for this persistent mode that would prematurely end the
  effect's whole-turn duration the instant no water stone happens to be
  adjacent yet. Needs a `waitForQuiescence()` change (treat it as
  non-blocking), not just a driver function — scoped precisely in
  `bot-roadmap.md` rather than rushed in alongside the other 3.
- **DOC CLEANUP: corrected two stale bot-response entries + the "elemental
  lockout" bug's root-cause diagnosis** — `docs/bot-roadmap.md`,
  `js/scrolls/response-window.js`, `planning/current.md`. Found while
  answering "what other bot work needs progressing": `bot-roadmap.md`'s
  STAGE STATUS table and `response-window.js`'s own header comment both
  still claimed response scrolls were unstarted / bots couldn't respond,
  though that shipped in an earlier session
  (`BotEffects.decideResponse()`, wired into both the arena and
  `bot-driver.js`'s `respondForBots()`). While correcting the "elemental
  lockout" task-list entry (which cited bot response support as the fix),
  traced the actual mechanic in `game-core.js`'s
  `handleScrollDisposition()`/`discardToCommonArea()`: casting a
  common-area scroll never clears its slot for anyone, bot or human — only
  a LATER discard of another scroll of that same element does, which
  always unconditionally overwrites regardless of what's currently there.
  So bot response support, already shipped, never touched this gap at
  all; the real cause is ordinary draw variance in how often a
  matching-element scroll gets discarded again, not a fixable exclusion
  bug. Corrected the entry's diagnosis accordingly rather than leaving a
  stale "not started" fix plan pointing at something already done.
- **BOT STAGE 5: catacomb/Freedom teleport action** — `js/bot-state.js`,
  `js/bot-sim.js`, `js/bot.js`, `docs/bot-roadmap.md`. User question: why
  can't bots use catacomb tiles to teleport? Answer: they weren't in the
  bot's action vocabulary at all — `legalActions()` never enumerated them
  (explicitly flagged as a gap in the file's own comment), so no scoring
  could ever make a bot choose one. This is the Track C item flagged
  unscoped/unbuilt in the opponent-awareness entry below. Added
  `{type:'teleport', x, y, shrineType}`: `bot-state.js`'s `legalActions()`
  mirrors `game-ui.js`'s `catacombEligibility()`/`updateCatacombIndicators()`
  exactly (origin must be a revealed catacomb shrine, or ANY revealed
  elemental shrine while Freedom is active; destination must be a
  different revealed, unoccupied catacomb-like shrine) — checks
  `t.flipped` before ever touching `t.shrineType`, per the DO-NOT-LIST
  rule. `applyAction()` re-validates fresh and calls `placePlayer()`
  directly, never reimplementing the teleport (same discipline as
  `breakStone` reusing `attemptBreakStone()`) — this also means a
  home-adjacent teleport can register a win via `placePlayer()`'s own
  `checkWinCondition()` call, same as walking there would.
  `bot-sim.js` gained `simTeleport()` (pure position update, free, wired
  into `simulate()`'s switch) so Hybrid-brain search correctly values
  teleporting as the immediate root decision — root's candidate list
  always comes from the real `BotState.legalActions()`, which does see
  teleport. Known limitation, same category as `breakStone`: `bot-sim.js`'s
  own pure `legalActions(snap)` — used for deeper search plies, since
  those can't call the real DOM-reading function on a hypothetical
  snapshot — doesn't generate teleport candidates yet, partly because the
  Freedom-buff state isn't carried in the snapshot schema at all. A
  multi-step plan that hops through a catacomb mid-sequence won't be
  discovered by lookahead; the immediate "should I teleport now" decision
  is unaffected. `bot.js` gained `teleportBase` (small flat nudge — it's
  free, rarely worth declining) and `teleportShrineValue` (× shrineValue of
  the destination, Freedom-elemental case only — plain catacomb
  destinations have no resource value). Verified against a real running
  game: staged two injected catacomb tiles — `legalActions()` offers
  exactly the one valid destination, `scoreAction()`'s score matches
  `teleportBase` exactly for a plain destination, `applyAction()` moves
  the pawn with zero AP spent, `BotSim.simulate()` mirrors the same
  position change. Negative control: zero candidates from a plain non-shrine
  hex even with catacombs revealed elsewhere. Freedom case: zero candidates
  from an elemental shrine without the buff, one with it stubbed active,
  score correctly includes the shrineValue bonus (not just the flat base).
  10-game self-play regression shows no errors, normal win/draw mix.
- **BOT WEIGHTS: value held void stones for their standing AP bonus; scoped
  earth/fire tactics as follow-up** — `js/bot.js`, `docs/bot-roadmap.md`.
  User question: should place/break weights differ per stone type, since
  each element has a distinct ability? Investigated per-element: wind's
  free movement already prices correctly for free (feeds into `a.cost` in
  the existing generic `moveApPenalty` term); water's value is entirely
  borrowed from whatever it's chained to (mimics earth/wind depending on
  the adjacent stone), so a static weight can't represent it and was
  deliberately left alone. Void's standing AP bonus (`voidAP = pool.void`
  each turn, game-core.js) WAS a real gap — the evaluator priced void pool
  stones identically to every other element's (generic need-based terms
  only). Added 3 weights: `evalVoidHeld` (`evaluateSnapshot()`, additive on
  top of the existing per-element terms — different value source, not a
  replacement) so Hybrid-brain search naturally discounts spending void
  stones (BotSim.simulate() already decrements pool on placeStone);
  `shrineVoidBonus` (`shrineValue()`, void only) so real movement/endTurn
  scoring — which stays greedy even under Hybrid ("plain movement stays
  greedy") — pulls toward void shrines harder; `placeVoidSpendPenalty`
  (`scoreAction()`'s placeStone case) mirrors the same cost for the
  non-search "Dumb" brain fallback. Verified: `evaluateSnapshot()`/`score()`
  called directly with synthetic snapshots via `window.BotSystem` — each
  new term's contribution matched the exact expected weighted delta;
  10-game self-play regression (`BotArena.run`) shows no errors, normal
  win/draw mix. Earth (path-blocking) and fire (destroying an opponent's
  stones) are real opponent-facing tactics the bot doesn't reason about at
  all today, but need more than a quick weight: placement position is
  dictated by the bot's own pattern (`legalActions()` generates candidates
  relative to the bot's own hex, not free placement anywhere), and the
  natural home for a leaf-level bonus (`evaluateSnapshot()`) can't afford
  fresh per-opponent Dijkstra pathfinding at search-leaf call volume (root
  scores every legal action, then expands `searchBreadth` children per ply
  down to `searchDepth`). Fire-vs-common-area-scrolls already works for
  free today, incidentally — `BotSim.simulate()` already models fire
  destroying adjacent non-fire/non-void stones, and `evaluateSnapshot()`'s
  existing `commonAreaThreat()` re-checks opponent pattern satisfaction on
  the post-simulated snapshot. Fire-vs-opponent-hand-scrolls is infeasible
  regardless — opponent hand scroll NAMES are hidden by design (only
  `handElements` is public). Full scoped design (cache each opponent's
  cheapest-path hex set once per decision, not per search leaf; check
  membership cheaply in `scoreAction()`'s root-level placeStone scoring):
  docs/bot-roadmap.md § STAGE 4.
- **BOT ARENA UX: population lineage tracking + Bot Training panel rebuilt as
  a full modal** — `js/bot-arena.js`, `js/game-ui.js`. Follow-up to a user
  Q&A about exactly how `evolve()`/N-player training works (population size
  vs. player-count selector, "Repeat" = generations not total games,
  confirmation is always a 2-player gate regardless of training player-
  count) — the user then asked to surface this mechanism in the UI: "build
  out the bot training window to show more of these metrics... a roster
  list with names... click on a 'player' and see a diagram of its weights."
  `evolve()`'s population members are now `{id, w, parentIds}` objects
  (`newMember()`/`_nextPopId` counter) instead of bare weight tables — the
  top-2 elites literally keep the same object/id across generations, bred
  children get a fresh id and `parentIds:[idA,idB]` (or `[idA]` for
  self-crossover). `onGeneration()` gained a 4th argument (`members`,
  ranked best-first) carrying this; existing 3-arg callers (dev cheat
  panel) untouched. The player-facing "🧬 Bot Training" panel (`.gami-title`
  ×5 trigger, unchanged) is now a full-screen modal instead of a small
  floating panel: Players/Speed/Repeat controls gained explainer tooltips,
  plus a new Population roster (clickable rows: id, fitness bar, lineage
  label) and Generations log fed by a shared `handleGeneration()` callback,
  and a click-through weight-diagram detail view (`weightBar()`) grouping
  `WEIGHT_CATEGORIES` and comparing the selected member's weights against
  `BotSystem.DEFAULT_WEIGHTS`. Caught on self-review before testing: the
  lineage label must check "is this id already seen" BEFORE falling back to
  its birth-parentage text, or a long-surviving elite re-shows its original
  "bred #X×#Y" forever instead of "elite (surviving)". Verified: a headless
  data-layer test confirms elites keep their id/empty-parentIds across
  generations while bred children get correct `parentIds`
  (`repro_population_ids.js`); a headless UI test running the real "Start
  Breeding" flow (population tied to the Players selector, fast at
  population 2) confirms the modal renders 2 roster rows, a generation-log
  entry, and — after clicking a row — the weight-diagram detail view with
  category headers, a `castBase` row, and a valid lineage label, zero page
  errors (`repro_modal_ui_breed.js`). The slower "Start Training" path
  (hardcoded `popSize:6`, ~25 games) was not separately re-verified after
  the rewrite — it shares the identical `handleGeneration` code path as the
  now-verified breeding path, just with a bigger/slower population.
- **BOT FIX: non-host clients rendered bots' tiles at the wrong position
  with the wrong player's color** — `js/bot-state.js`. User report,
  distinct from the placement-freeze entry below (same general area, real
  3-bot 4-5-player game): two human players in the SAME game disagreed on
  which color a given bot was. `BotState.applyAction('placeTile')` read
  `activePlayerIndex` AFTER calling `placeTile()` to build the visual
  `player-tile-place` broadcast every OTHER client renders the tile/pawn/
  color from — but `placeTile()`'s own multiplayer branch (game-core.js)
  already synchronously advances `activePlayerIndex` to the NEXT player as
  part of processing THIS placement (turn-tracking broadcast + local
  advance both happen inside that one call). So the broadcast went out
  under the WRONG index — whoever's turn is next, not the bot that
  actually placed — while `color` (read from the still-correct
  `playerColor` global) was right. Effect: the HOST's own screen was
  always correct (renders its own/its bots' placements directly, not
  through this broadcast); every OTHER client received a tile positioned
  under the wrong index carrying the RIGHT color — bot 2's tile shows up
  as player 3's, in bot 2's color — compounding per bot with 3 host-driven
  bots placing back to back. Only non-host humans were affected, and each
  has independently-corrupted local state, matching the report exactly.
  Fixed: capture `activePlayerIndex` into `placingIndex` BEFORE calling
  `placeTile()`. Verified both directions (fix reports the correct index
  despite `activePlayerIndex` genuinely having advanced by the time of the
  broadcast; negative control via `git stash` reproduces the wrong-index
  broadcast). Also checked: the other 3 human-placement broadcast call
  sites (game-ui.js, mouse/touch/keyboard paths) already correctly use the
  stable `myPlayerIndex` instead of `activePlayerIndex` — this was a
  bot-only bug.
- **BOT FIX: real multiplayer placement phase could freeze forever on one
  player (surfaced by the new multi-bot lobby feature)** — `js/game-core.js`.
  User report: a real 4-player game (2 bots + 2 humans, using the new
  multi-bot lobby) got permanently stuck waiting for one bot's tile
  placement. `placeTile()`'s own existing comment already documented the
  exact race: "if another player's broadcast arrived first, [captured
  playerPositions.length] is wrong" — and correctly corrected
  `playerPositions[]` and the placed tile's own `ownTile.playerIndex` to
  use `myPlayerIndex` instead. It missed that `tilePlayerIndex` itself
  (the SAME stale snapshot) is what's actually used for
  `playerTilesPlaced.add()` and the `player-tile-placed` broadcast
  everyone else receives. When the race hits, a placement gets silently
  attributed to the WRONG (usually already-placed) index, so the true
  placer's index never reaches `playerTilesPlaced`, and every client waits
  forever for a player who already placed — a permanent freeze, not a
  delay. Likely made much easier to hit by this session's earlier
  multi-bot change: host-driven bots place off a fixed 800ms timer tied
  only to `activePlayerIndex`, with no check that this client's own
  `playerPositions` has caught up with prior remote placements yet (unlike
  humans, naturally paced by noticing the UI update) — more players in a
  room means more chances for a remote placement broadcast to still be in
  flight when a bot's turn comes up. Fixed: `tilePlayerIndex = myPlayerIndex`
  alongside the two existing corrections. Verified: staged the exact race
  (stale empty `playerPositions`, correct `activePlayerIndex`/
  `myPlayerIndex`=2) and confirmed `playerTilesPlaced`/tile ownership now
  correctly record player 2; negative control (`git stash`) reproduces the
  bug without the fix — `playerTilesPlaced` incorrectly records the
  already-placed player 0 instead of 2, matching the reported symptom.
  Separately investigated and ruled out (verified empirically, not just
  reasoned): a "board runs out of valid 2-unrevealed-neighbor placement
  spots by the 3rd/4th player" theory — a real 4-player placement sequence
  left 11+ valid candidates for the last player, no exhaustion.
- **BOT STAGE 2.5: drive 3 more scroll effects (Sacrificial Pyre,
  Inspiring Draught, Quick Reflexes)** — `js/bot-effects.js`. All three
  modal ids were already in scroll-effects.js's `EFFECT_MODAL_IDS`, so
  `waitForQuiescence()` already detected them as open — only needed the
  driver functions + `driveSelection()` dispatch wiring, no `bot.js`
  changes. Sacrificial Pyre and Inspiring Draught's put-back step share
  `scroll-select-modal` with Plunder (not yet driven) — routed by the
  exact heading text each effect's `showScrollSelectionModal()` call
  sets. Shared "give up one of these scrolls" heuristic: prefer a
  response-only scroll first (dead weight in the main phase regardless —
  same reasoning as `bot.js`'s `discardResponseOnly` weight), else the
  lowest-level one. Quick Reflexes reuses the existing `rankedElements()`
  need heuristic. Also cleaned up a stray duplicate `bot-effects.js` row
  in `js/INDEX.md` left over from the earlier branch merge, and fixed a
  stale claim there/in `bot-effects.js`'s own header that response
  scrolls were still arena-only (they were extended to real multiplayer
  in an earlier session; the comment just never got updated).
  Verified headless against a real local game (not mocked): Sacrificial
  Pyre correctly sacrifices a staged response-only scroll over a
  non-response one; Quick Reflexes correctly picks the scroll matching
  the pool's most-drained element; Inspiring Draught completes both
  steps end to end, keeping the higher-level of the two drawn scrolls;
  confirmed Plunder's differently-titled `scroll-select-modal` is
  correctly left undriven (no cross-contamination).
- **JOYTONE: silence during bot training runs + connect power button to
  Settings toggle** — `joytone/index.html`, `js/joytone-bridge.js`,
  `js/bot-arena.js`, `js/gamification-ui.js`. Train Weights/Evolve/Breed
  play many short simulated games back to back, each hiding/showing
  `#lobby-wrapper` same as a real game — previously this rebooted the
  Joytone engine and restarted playback from scratch on every single
  simulated game regardless of watch speed; the old "mute" approach
  (nulling `window.JoytoneBridge` inside `muteEnvironment()`, muted runs
  only) never actually worked since it only stopped OTHER code calling
  in, not the internal watcher or already-playing audio. Added real
  `setSuppressed()`/`isSuppressed()`: `startForGame()`/`onTileRevealed()`
  no-op while suppressed (immediately powering off anything already
  playing); `run()`/`evolve()` suppress unconditionally for their whole
  duration regardless of `opts.visual`. `spectate()` (one continuous game,
  the "watch bots for fun" flow) deliberately untouched. Separately: the
  Joytone popup's own ⏻ power button and Settings' "Adaptive Music" ON/OFF
  toggle were previously independent and could disagree — unified so
  muting via Settings also powers the real engine off/on (actual audio-cut
  + CPU savings, not just gain), and the popup's button notifies the
  parent (`_onChildPowerChanged`) so Settings reflects it if open;
  programmatic suppression-driven power changes are explicitly excluded
  from that sync so a training run never corrupts the player's real saved
  preference. Verified headless: mute↔power drive each other both
  directions, suppression powers off an active session immediately and
  guards against the mute-toggle corrupting state while suppressed, and a
  real `evolve()` run stays suppressed for its whole duration.
- **MULTIPLAYER: allow more than one bot player in a real lobby** —
  `index.html`, `js/lobby.js`, `js/bot-driver.js` (comments only),
  `js/INDEX.md`, `docs/bot-roadmap.md`. The lobby's "🤖 Add Bot" button was
  a 0/1 toggle (`toggleBotPlayer()`) — once a bot existed, the same button
  became "Remove Bot" with no way to add a second. Split into
  `addBotPlayer()`/`removeBotPlayer()`, two separate buttons: Add always
  inserts another distinct `🤖 Bot N` row up to the room's existing
  5-player cap; Remove drops the most recently added one (unchanged RPC
  call from before). `bot-driver.js` needed zero logic changes — its
  watcher already recomputes the live bot-index set every tick and drives
  whichever one is active rather than assuming a single hardcoded bot; all
  bots already share whatever `window.BotSystem.WEIGHTS` currently holds
  (the Supabase community champion from the entry above, or local
  training) — this was correctly wired already, just never exercised with
  more than one bot. Verified with a stateful mock of the `players` table:
  4 sequential `addBotPlayer()` calls produce `🤖 Bot 1`-`4`, a 5th is
  rejected with "Room is full!", `removeBotPlayer()` removes the most
  recent, and the Add/Remove button visibility + `(N)` count label update
  correctly across empty/partial/full room states.
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
2. **Stage 2.5 — scroll-effect usage: FULLY DONE.** Step 1 (inventory) is
   **DONE** — full table of all 17 selection-mode/response scrolls in
   bot-roadmap.md § STAGE 2.5. Step 2 (`js/bot-effects.js`) is **DONE**:
   every selection effect is driven (tile-flip, scorched-earth, tile-swap,
   Create, Scholar's Insight, Quick Reflexes, Sacrificial Pyre, Inspiring
   Draught, Wandering River, Arson, Plunder, Control the Current, Excavate,
   Take Flight, Telekinesis), A/B-measured in the arena (fewer draws, no
   regressions vs. baseline on identical seeds). Step 3 (response scrolls)
   is **DONE** — arena AND real multiplayer, via `bot-driver.js`'s
   `respondForBots()`. Nothing left in Stage 2.5's original scope. Full
   plan + writeups: bot-roadmap § STAGE 2.5.
3. Later: rerun hybrid-vs-greedy at 100 games + run BotArena.evolve()
   at scale (wants R5 server-side execution to be practical).
4. **Opponent-awareness — Tracks A, B, and C all DONE.** Track A:
   `evaluateSnapshot()` now scores opponent threat —
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
   Track B (generalize `playGame()`/`run()`/`evolve()` past 2 players) is
   **DONE** — this note just never got updated when it happened. Confirmed
   directly in `bot-arena.js`: `playMatch(weightsPerPlayer, opts)` derives
   player count from `weightsPerPlayer.length` and is genuinely N-player
   (2-5) generic; `evolve()` takes `opts.nPlayers` and samples N-player
   groupings when >2; `playGame()` is now just a thin 2-player backward-
   compat wrapper around `playMatch()` (kept for console/roadmap scripts
   that reference its old signature directly). `run()` deliberately stays
   2-player-only — not a gap, a design choice, since the confirmation gate
   (champion vs. baseline) is always a pairwise comparison regardless of
   how many players a training run itself uses. Track C (catacomb/Freedom
   teleport action) is **DONE** — see the BOT STAGE 5 entry above. Neither
   track has open work remaining.
5. **KNOWN ISSUE, still open, DIAGNOSIS CORRECTED: response-only (level-1)
   scrolls can sit stuck in a common-area element slot for a long stretch
   ("elemental lockout").** Original theory (now stale): the fix was "give
   bots response-scroll support" (`response-window.js`'s `isBotPlayer()`
   hard-exclusion). That support shipped (STAGE 2.5 step 3,
   `BotEffects.decideResponse()`, arena + real multiplayer) — but it does
   **NOT** close this gap, because casting a common-area scroll (main-phase
   by anyone, or as a response) was never what clears its slot. Confirmed
   directly in `game-core.js`'s `handleScrollDisposition()`: *"Common area
   scrolls are permanent shared resources — casting them does NOT remove
   them from the common area. They only leave when replaced by a new
   scroll of the same element type."* — an explicit, unconditional game
   rule, true for humans and bots alike, unrelated to who's allowed to
   respond. The ACTUAL mechanic (`discardToCommonArea()`): any discard of a
   scroll of that element, by anyone, ALWAYS unconditionally overwrites the
   slot (old occupant goes to the bottom of its deck) — a same-element
   discard is never wasted. So the real bottleneck isn't casting/responding
   at all, it's simply whether anyone ever draws-then-discards another
   scroll of that specific element again — ordinary draw variance, not a
   bot-specific exclusion bug. Confirmed on real data: in a 200-turn drawn
   arena game (seed 40000, game 6 of a 30-game batch), `EARTH_SCROLL_1` and
   `FIRE_SCROLL_1` each landed in their element's common-area slot around
   the 65-70% mark and were never replaced for the rest of the game, while
   every other element's slot kept churning normally. A real bot-side
   mitigation would mean specifically valuing "does discarding this scroll
   displace a bad common-area occupant" as its own signal (separate from
   the existing per-scroll dead/activated discard checks, which only look
   at the scroll being discarded, never at what's currently sitting in that
   element's slot) — not yet scoped, and it's unclear this is worth scoping
   given the underlying cause is draw variance rather than a fixable logic
   gap.

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

*Last updated: 2026-07-14 (latest: bots can no longer place stones on the empty space left by a Telekinesis/Shifting-Sands-moved tile — applyAction('placeStone') now requires a real board hex and planValid() re-checks plan cells against the live grid; before that: catacomb teleport ping-pong is now penalized in the weights (teleportRevisitPenalty — return hops score -55, fresh hops keep +5) and the arena gained a second stall detector — 15 rounds with no one casting anything restarts the round, catching the free-teleport loops the elemental-tile camping detector can't see; before that: fixed the host's response window being auto-cleared when a lobby bot submitted its pass/response first — UI teardown in response-window.js is now gated on the local human, not whoever's submission this client happened to process; before that: arena trap-loop stall restart — two bots each camped on an elemental tile for 7 straight turns now aborts and replays the round with a derived seed instead of grinding to the 200-turn cap; corrected a stale planning note — opponent-awareness Track B, generalizing playGame()/run()/evolve() past 2 players, was actually already done via the earlier N-player playMatch() unification, just never marked as such; also merged: the Bot Training panel now has a persistent corner popup showing live scenario/progress that survives the main modal being closed, plus a new "End Early" control (BotArena.endEarly(), distinct from the existing hard Stop) that cuts a training/breeding run short while still running the confirmation match or downloading the champion with whatever was reached so far; Stage 2.5 scroll-effect driving is now FULLY COMPLETE — Excavate, Take Flight, and Telekinesis were the last 3, all genuinely drag-only or previously misfiled as such, driven by calling the exact same functions the real UI drop handlers call rather than simulating drag events; earlier this session: Control the Current (needed a waitForQuiescence() architecture change for its persistent whole-turn nature), 3 more selection effects (Wandering River, Arson, Plunder), a stale-doc cleanup that corrected the "elemental lockout" bug's root-cause diagnosis, the catacomb/Freedom teleport bot action (closing Track C), void-stone-value weights, and the Bot Training modal rebuild with population lineage tracking — see "Last Committed Work" above for full details on each)*
