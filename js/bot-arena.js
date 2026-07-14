// ============================================================
// bot-arena.js — Stage 3a of docs/bot-roadmap.md: self-play arena
// ============================================================
// Runs full LOCAL games (2–5 players) where every player is bot-driven,
// with a separate WEIGHTS table per player. Used to A/B bot brains (search
// vs greedy vs hybrid), measure Stage-2.5 effect-usage increments, watch
// bots play, and evolve weights.
//
//   await BotArena.run(weightsA, weightsB, nGames, seed, opts)
//       → { aWins, bWins, draws, avgTurns, aFitness, bFitness,
//           games:[{winner, turns, side}] }
//       aFitness/bFitness are the SELECTION SIGNAL evolve() uses (see
//       sideFitness() below) — win/loss ±1 plus a small reward for
//       win-condition progress and a small penalty per stuck turn, NOT a
//       plain win tally. opts.progressWeight (default 0.3) and
//       opts.stuckPenalty (default 0.15) tune those terms.
//       opts.onGame?(gameNumber, totalGames, gameResult) — optional per-game
//       progress callback (also fires once per game inside evolve(), since
//       evolve() forwards opts straight through to every run() call it makes).
//       opts.visual (default false): play every game with normal
//       pacing/visuals via the SAME playMatch() core spectate() uses,
//       instead of muted/fast.
//   await BotArena.evolve(generations, opts)
//       → champion weight table (also saved to
//         localStorage['godaigo_bot_weights'] + logged as JSON)
//       opts.onGeneration?(genNumber, totalGenerations, fitnessArray) — optional
//       progress callback. BotArena.stop() cancels between generations.
//       BotArena.applyWeights(table) applies a table to the LIVE WEIGHTS
//       object in place (no reload needed) — the cheat panel's "Train Weights"
//       button uses this on evolve()'s result.
//       opts.nPlayers (2–5, default 2): 2 stays the original exhaustive
//       pairwise round-robin (sideFitness-based, richer than plain win/loss);
//       >2 samples opts.gamesPerGen random N-player groupings per generation
//       instead (exhaustive C(popSize,N) explodes), crediting the winner's
//       population slot with +1 fitness.
//   await BotArena.spectate(nPlayers, opts)
//       → { winner, turns } — watch nPlayers bots play one full game with
//         normal visuals (win screen included), auto-downloads the action
//         log when it ends.
//   BotArena.stop() — interrupts run()/evolve()/spectate(), whichever is
//   active (shared _stopRequested flag, checked in every loop below).
//
// SHARED CORE: playMatch(weightsPerPlayer, opts) plays exactly one game for
// weightsPerPlayer.length players (2–5), swapping in each player's weight
// table on their turn (an `undefined` entry leaves WEIGHTS untouched — how
// spectate() gets "whatever's currently loaded" instead of a fixed table).
// opts.visual controls pacing (sleep durations, turnCap default) only —
// muting environment (sound/gami/win-modal) and any status/ActionLog UI
// bookkeeping is the CALLER's job (run/evolve mute+stay silent, spectate
// keeps everything on and drives the status bar + log download).
//
// STALL RESTART: if two (or more) bots each end STALL_TURNS (7) consecutive
// own turns parked on one revealed elemental tile (each on its own tile —
// they don't have to share one), the game is declared a trap-loop stall and
// the whole round is RESTARTED from scratch with a derived seed (same
// weights), instead of grinding on to the 200-turn cap just to record a
// meaningless draw. opts.maxStallRestarts (default 3) caps the retries; a
// game still stalled after the last retry is returned as-is (winner null,
// result.stalled true) so a pathological weight table can't loop forever.
// result.restarts reports how many restarts the returned game consumed.
//
// HOW A GAME RUNS (local hot-seat — no Supabase, no multiplayer):
//   ensureLocalMode() + resetGameResources() + startGame(n) reset
//   everything; Math.random is temporarily seeded (mulberry32) so
//   tile/scroll deck shuffles are reproducible per game. Player tiles are
//   placed at the N mutually-farthest placement candidates (fair,
//   deterministic — placePlayerTilesSpread). Turns cycle through all N
//   players; each player's weights are swapped in right before their turn;
//   AP is refilled every turn (the local hot-seat path never auto-resets AP
//   for >1 players — that code is multiplayer-only). A stuck player (no
//   legal action ends their turn) gets a forced endTurn click, verified to
//   actually advance activePlayerIndex before trusting it — see the comment
//   in playMatch().
//
// SUPPRESSED DURING A MUTED (non-visual) RUN: win-screen modal
// (spellSystem.showLevelComplete), end-turn AP prompt, SoundSystem,
// JoytoneBridge, gamification (window.gami — otherwise arena games would
// farm real XP onto the logged-in profile). spectate() and visual
// run()/evolve() keep sounds/music/animations/win-screen, only muting gami.
//
// LOAD ORDER: after bot.js.
// ============================================================

(function () {
    'use strict';

    function log(...args) { console.log('🏟️ [BotArena]', ...args); }
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Pick k distinct indices from [0, poolSize) via a seeded partial
    // Fisher-Yates shuffle (deterministic given the same rng stream).
    function sampleDistinct(poolSize, k, rng) {
        const idx = Array.from({ length: poolSize }, (_, i) => i);
        const n = Math.min(k, poolSize);
        for (let i = 0; i < n; i++) {
            const j = i + Math.floor(rng() * (idx.length - i));
            [idx[i], idx[j]] = [idx[j], idx[i]];
        }
        return idx.slice(0, n);
    }

    // Force local-mode identity before any local bot match. isMultiplayer/
    // myPlayerIndex are only ever reset by a CLEAN online-game leave
    // (lobby.js's _doLeaveGame()) — if that leave never fully completes (e.g.
    // its remove_player RPC throws), a bot match started right after inherits
    // a STALE isMultiplayer=true with a stale myPlayerIndex. startGame() does
    // not touch either. With isMultiplayer stuck true,
    // updateEndTurnButtonVisibility() (multiplayer-state.js) then gates the
    // end-turn button on real-multiplayer turn ownership (myPlayerIndex ===
    // activePlayerIndex) instead of "always enabled locally" — silently
    // disabling it for whichever bot doesn't match the stale identity, which
    // kills the match the instant a bot falls back to force-ending its turn.
    // Observed: a real 3-bot spectator match ending after turn 1, logged as
    // "stuck on turn 0 (end-turn button unavailable)". Called from
    // playMatch() itself (not just spectate()) so run()/evolve() are covered
    // too, regardless of which top-level entry point started the match.
    //
    // Resetting the JS variables alone isn't enough, though: the end-turn
    // BUTTON's actual DOM `disabled` attribute is only ever refreshed by
    // updateEndTurnButtonVisibility() itself — nothing calls that as a side
    // effect of an assignment to isMultiplayer. If the button was left
    // disabled by whatever real state the tab was in right before this
    // match started (e.g. a real multiplayer game where it wasn't this
    // client's turn), it stays disabled — applyAction('endTurn')
    // (bot-state.js) checks the raw DOM property, not isMultiplayer —
    // and the very first forced end-turn fails, which playMatch() treats
    // as "stuck" and ends the WHOLE match after just one turn. This is
    // specifically why "🔁 Restart bot game without player" (the only
    // caller that ever starts a match from an EXISTING session rather than
    // a fresh page load) could still die after turn 1 even with
    // isMultiplayer/myPlayerIndex correctly reset — headless testing never
    // catches it because a freshly loaded page never has a stale-disabled
    // button to begin with. Force a DOM refresh right here instead of
    // relying on some other code path to do it eventually.
    function ensureLocalMode() {
        if (typeof isMultiplayer !== 'undefined') isMultiplayer = false;
        if (typeof myPlayerIndex !== 'undefined') myPlayerIndex = null;
        if (typeof updateEndTurnButtonVisibility === 'function') updateEndTurnButtonVisibility();
    }

    // ----------------------------------------------------------------
    // Environment guard: everything a MUTED (non-visual) run mutes, saved
    // and restored even if a game throws.
    // ----------------------------------------------------------------
    function muteEnvironment() {
        const rw = window.spellSystem?.responseWindow;
        const saved = {
            random: Math.random,
            sound: window.SoundSystem,
            gami: window.gami,
            endTurnPrompt: window.showEndTurnPrompt,
            levelComplete: window.spellSystem?.showLevelComplete,
            speedScale: window.BotSystem.speedScale,
            isBotPlayer: rw?.isBotPlayer,
        };
        window.SoundSystem = null;
        // Joytone is handled separately (see suppressJoytone() / run() /
        // evolve()) — nulling window.JoytoneBridge here only stopped OTHER
        // code from calling into it, it never actually silenced audio
        // already playing or stopped the internal lobby-wrapper watcher
        // from booting a fresh engine on every simulated game.
        window.gami = null; // never grant real XP/gold for arena games
        window.showEndTurnPrompt = () => {};
        if (window.spellSystem) {
            window.spellSystem.showLevelComplete = function (playerIndex) {
                log(`(win screen suppressed for player ${playerIndex})`);
            };
        }
        // ResponseWindowSystem.isBotPlayer() identifies bots via multiplayer's
        // `allPlayersData` (lobby.js), which doesn't exist in the arena's local
        // hot-seat games — every seat here IS a bot, but isBotPlayer() silently
        // returns false for all of them, so the "skip window — bots can't
        // respond" gate never fires. Any cast whose response/counter happens to
        // be formed for another bot then opens a REAL window that sits out the
        // full 15s timeout with no one able to click Pass. Tell it the truth
        // for the duration of the run.
        if (rw) rw.isBotPlayer = () => true;
        return function restore() {
            Math.random = saved.random;
            window.SoundSystem = saved.sound;
            window.gami = saved.gami;
            window.showEndTurnPrompt = saved.endTurnPrompt;
            if (window.spellSystem && saved.levelComplete) {
                window.spellSystem.showLevelComplete = saved.levelComplete;
            }
            window.BotSystem.speedScale = saved.speedScale;
            if (rw && saved.isBotPlayer) rw.isBotPlayer = saved.isBotPlayer;
        };
    }

    // Silence Joytone for the WHOLE run() / evolve() job, regardless of
    // opts.visual — unlike spectate() (one continuous game, keeps the
    // soundtrack on purpose), run()/evolve() play many short simulated
    // games back to back, each triggering its own #lobby-wrapper hide/show
    // cycle that would otherwise reboot the engine and restart playback
    // from scratch every single game. See joytone-bridge.js's
    // setSuppressed()/startForGame().
    function suppressJoytone() {
        window.JoytoneBridge?.setSuppressed(true);
        return () => window.JoytoneBridge?.setSuppressed(false);
    }

    function setWeights(table) {
        const W = window.BotSystem.WEIGHTS;
        for (const k of Object.keys(W)) delete W[k];
        Object.assign(W, window.BotSystem.DEFAULT_WEIGHTS, table);
    }

    // Neutralize an in-progress tutorial before running ANY local bot game
    // (playMatch() calls this unconditionally, visual or muted — NOT just
    // for visual runs). Every TutorialMode hook call site
    // (game-core.js/game-ui.js/scroll-panels.js) is gated on
    // `window.isTutorialMode`, so clearing it fully stops the tutorial's own
    // step-advance machinery from reacting to bot actions. This matters even
    // muted: a bot racing through moves/casts/end-turns across dozens of
    // background games can satisfy the tutorial's remaining scripted steps
    // in seconds, and tutorial-mode.js's finish() calls
    // window.location.reload() once its step sequence runs out, killing the
    // run outright regardless of whether anyone's watching.
    function neutralizeTutorial() {
        if (!window.isTutorialMode) return;
        window.isTutorialMode = false;
        window.tutorialAllowedHexes = null;
        document.querySelectorAll('[class^="tmode"], [class*=" tmode"]').forEach(el => el.remove());
    }

    // ----------------------------------------------------------------
    // Player-tile placement: N mutually-farthest free hexes adjacent to the
    // tile cluster (large-tile grid), greedy max–min. Deterministic and
    // symmetric — no bot gets a positional edge from placement luck.
    // ----------------------------------------------------------------
    function placementCandidates() {
        const S = TILE_SIZE * 4;
        const candidates = [];
        for (const t of placedTiles) {
            const h = pixelToHex(t.x, t.y, S);
            for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
                const p = hexToPixel(h.q + dq, h.r + dr, S);
                if (placedTiles.some(o => Math.hypot(o.x - p.x, o.y - p.y) < 40)) continue;
                if (candidates.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 40)) continue;
                // Game rule (same as the drag-drop path): player tiles must
                // touch at least 2 unrevealed tiles at placement time
                if (typeof countTouchingUnrevealedTiles === 'function' &&
                    countTouchingUnrevealedTiles(p.x, p.y) < 2) continue;
                candidates.push(p);
            }
        }
        return candidates;
    }

    // Spread n player tiles as far apart as possible (greedy max–min):
    // start from the farthest pair, then repeatedly add the candidate whose
    // minimum distance to the already-chosen spots is largest.
    function placePlayerTilesSpread(n) {
        const cands = placementCandidates();
        if (cands.length < n) throw new Error(`arena: only ${cands.length} placement candidates for ${n} players`);
        let pair = null;
        for (let i = 0; i < cands.length; i++) {
            for (let j = i + 1; j < cands.length; j++) {
                const d = Math.hypot(cands[i].x - cands[j].x, cands[i].y - cands[j].y);
                if (!pair || d > pair.d) pair = { d, a: cands[i], b: cands[j] };
            }
        }
        const chosen = [pair.a, pair.b];
        while (chosen.length < n) {
            let best = null;
            for (const c of cands) {
                if (chosen.includes(c)) continue;
                const minD = Math.min(...chosen.map(p => Math.hypot(p.x - c.x, p.y - c.y)));
                if (!best || minD > best.minD) best = { minD, c };
            }
            chosen.push(best.c);
        }
        for (const p of chosen.slice(0, n)) placeTile(p.x, p.y, 0, false, 'player');
    }

    // The local hot-seat path never auto-resets AP when playerPositions
    // has >1 entries (that branch is gated on multiplayer's myPlayerIndex),
    // so the arena refills at the start of every turn. addAP caps regular
    // AP at 5 and tops void AP up to the active player's void-stone count —
    // equivalent to the real per-turn reset + refreshVoidAP.
    function refillAP() {
        const missing = 15; // > max possible (5 + 5 void) — addAP clamps
        if (typeof addAP === 'function') addAP(missing);
    }

    // Shared "should we stop early" flag — set by stop(), checked by every
    // loop in run()/evolve()/spectate() so one Stop button covers all three.
    let _stopRequested = false;
    function stop() { _stopRequested = true; }

    // ----------------------------------------------------------------
    // Trap-loop stall detection: bots sometimes wedge each other into a
    // stable non-position (e.g. both camped on a shrine with full pools,
    // neither willing to move first) that takes the full 200-turn cap to
    // "resolve" as a draw. If STALL_MIN_BOTS players each end STALL_TURNS
    // consecutive own turns standing on the SAME revealed elemental tile
    // (each has their own tile — they needn't share one), the round is
    // restarted instead (see playMatch()).
    // ----------------------------------------------------------------
    const STALL_TURNS = 7;
    const STALL_MIN_BOTS = 2;
    const ELEMENTAL_SHRINES = ['earth', 'water', 'fire', 'wind', 'void'];

    // The revealed elemental tile the position stands on, else null.
    // Same closest-center-within-radius rule as game-core's
    // findTileAtPosition() (a tile covers 19 hexes; TILE_SIZE*5.5 spans the
    // whole tile including edges), which isn't exported — plus the
    // revealed + elemental filters this check needs. Never reads shrineType
    // off an unrevealed tile (t.flipped = face-down).
    function elementalTileAt(x, y) {
        const tileRadius = TILE_SIZE * 5.5;
        let closest = null, closestDist = Infinity;
        for (const t of placedTiles) {
            if (t.isPlayerTile) continue;
            const d = Math.hypot(t.x - x, t.y - y);
            if (d < tileRadius && d < closestDist) { closest = t; closestDist = d; }
        }
        if (!closest || closest.flipped) return null;
        return ELEMENTAL_SHRINES.includes(closest.shrineType) ? closest : null;
    }

    // ----------------------------------------------------------------
    // SHARED CORE: one full game for weightsPerPlayer.length players (2–5).
    // weightsPerPlayer[i] is that player's weight table; an `undefined`
    // entry means "don't touch WEIGHTS for this player's turn" (how
    // spectate() plays with whatever's currently loaded/toggled instead of
    // a fixed table). opts.visual only affects PACING (sleep durations,
    // turnCap default) — muting the environment and any status/log UI is
    // the caller's job.
    // Returns { winner: 0..n-1 | null, turns, activated: [n0..], stuckTurns:
    // {0: n, 1: n, ...}, stalled }. `activated` = each player's
    // elements-activated count at game end (win progress, 0-5) and
    // `stuckTurns` = how many times each player's turn had to be
    // force-ended because botTurn() never chose to end it itself (stuck/no
    // productive action). Both feed sideFitness() so a bot that stalls
    // scores worse than one that plays actively, even when neither wins
    // outright — see docs/bot-roadmap.md Stage 3a fitness note. `stalled` =
    // the game was aborted by the two-bots-camped trap-loop detector (see
    // STALL_TURNS above); playMatch() (the public wrapper below) restarts
    // stalled rounds rather than returning them, so callers only ever see
    // stalled:true when the restart budget ran out.
    // ----------------------------------------------------------------
    async function _playMatchOnce(weightsPerPlayer, opts = {}) {
        const nPlayers = weightsPerPlayer.length;
        const visual = !!opts.visual;
        const turnCap = opts.turnCap ?? (visual ? 300 : 200);
        const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
        const stuckTurns = {};
        for (let i = 0; i < nPlayers; i++) stuckTurns[i] = 0;
        // Per-player camping streak for the trap-loop detector: which
        // elemental tile this player ended their last turn on, and for how
        // many consecutive own turns they've stayed on that same tile.
        const camp = {};
        for (let i = 0; i < nPlayers; i++) camp[i] = { tileId: null, count: 0 };

        // Seed ALL shuffle randomness (tile deck, scroll decks) for this game
        Math.random = mulberry32(seed);

        neutralizeTutorial();
        ensureLocalMode();
        // A real "out of AP, end turn?" modal from whatever game the human
        // was just in doesn't get cleared by muting/stubbing
        // showEndTurnPrompt() (that only stops NEW popups) — any instance
        // already in the DOM sits there, unclicked, for the whole bot job.
        document.getElementById('end-turn-empty-ap-modal')?.remove();
        if (typeof resetGameResources === 'function') resetGameResources();
        window.BotSystem.resetMemory();
        startGame(nPlayers);
        await sleep(visual ? 300 : 30);
        placePlayerTilesSpread(nPlayers);
        await sleep(visual ? 300 : 30);
        activePlayerIndex = 0;
        if (visual) { try { currentTurnNumber = 1; } catch (e) {} } // local games never advance it — the log needs it

        // Every seat in a bot-arena game is a bot, so the "you're out of AP,
        // end turn?" modal (a human-click nudge — see showEndTurnPrompt's own
        // comment) can never be answered here. muteEnvironment() already
        // stubs it, but only for MUTED runs — a visual run (Watchable
        // training, spectate) left the real one live, popping up and sitting
        // there unclicked every time a bot emptied its AP. Suppress it
        // unconditionally for the lifetime of this one game, regardless of
        // visual/muted (spectate() also stubs it for its own longer-lived
        // reasons — this nests safely underneath that).
        const savedShowEndTurnPrompt = window.showEndTurnPrompt;
        window.showEndTurnPrompt = () => {};

        const result = { winner: null, turns: 0, activated: new Array(nPlayers).fill(0), stuckTurns, stalled: false };
        try {
            for (let turn = 0; turn < turnCap && !_stopRequested; turn++) {
                if (visual) { try { currentTurnNumber = turn + 1; } catch (e) {} }
                const idx = activePlayerIndex;
                if (weightsPerPlayer[idx] !== undefined) setWeights(weightsPerPlayer[idx]);
                refillAP();
                await window.BotSystem.turn();
                result.turns = turn + 1;

                const snap = window.BotState.snapshot();
                result.activated = snap.players.map(p => p.activated.length);
                const w = window.BotSim.winner(snap);
                if (w !== null) { result.winner = w; break; }

                // Trap-loop detector: extend/reset this player's camping
                // streak based on where they ended this turn, then stall out
                // if enough players are camped simultaneously.
                const pos = playerPositions[idx];
                const campTile = pos ? elementalTileAt(pos.x, pos.y) : null;
                const streak = camp[idx];
                if (campTile && streak.tileId === campTile.id) {
                    streak.count++;
                } else {
                    streak.tileId = campTile ? campTile.id : null;
                    streak.count = campTile ? 1 : 0;
                }
                const camped = Object.values(camp).filter(c => c.count >= STALL_TURNS).length;
                if (camped >= STALL_MIN_BOTS) {
                    result.stalled = true;
                    log(`match seed ${seed}: ${camped} bots each parked on an elemental tile for ${STALL_TURNS} straight turns — trap loop, aborting round on turn ${turn + 1}`);
                    break;
                }

                if (activePlayerIndex === idx) {
                    // Bot didn't end its own turn (stuck/no actions) — force it.
                    // applyAction({type:'endTurn'}) reports ok:true just from
                    // clicking the button, NOT from activePlayerIndex actually
                    // advancing — a click that gets swallowed (e.g. an unresolved
                    // scroll-overflow banner, or some other gate) would otherwise
                    // look like success and this loop would silently re-run the
                    // SAME stuck player for the rest of turnCap.
                    stuckTurns[idx]++;
                    const r = window.BotState.applyAction({ type: 'endTurn' });
                    await sleep(200);
                    if (!r.ok || activePlayerIndex === idx) {
                        log(`match seed ${seed}: stuck on turn ${turn} (${r.reason || 'endTurn did not advance activePlayerIndex'})`);
                        break;
                    }
                    await sleep(visual ? 50 : 20);
                }
            }
        } finally {
            window.showEndTurnPrompt = savedShowEndTurnPrompt;
        }
        return result;
    }

    // ----------------------------------------------------------------
    // Public playMatch(): _playMatchOnce() plus the stall-restart loop.
    // A round aborted by the trap-loop detector is replayed from scratch
    // with a DERIVED seed — replaying the identical seed would just walk
    // the same deterministic decisions back into the same trap. Capped by
    // opts.maxStallRestarts (default 3): a round still stalled after the
    // last retry is returned as-is (winner null → counts as a draw) so a
    // pathological weight table can't spin restarts forever. Restarted
    // attempts are discarded entirely — only the final attempt's result
    // (with result.restarts = how many restarts it took) reaches the
    // caller, so run()/evolve()/spectate() stats never double-count a
    // restarted round.
    // ----------------------------------------------------------------
    async function playMatch(weightsPerPlayer, opts = {}) {
        const baseSeed = opts.seed ?? Math.floor(Math.random() * 1e9);
        const maxStallRestarts = opts.maxStallRestarts ?? 3;
        let result;
        for (let attempt = 0; ; attempt++) {
            const seed = (baseSeed + attempt * 1000003) >>> 0; // deterministic per-restart reshuffle
            result = await _playMatchOnce(weightsPerPlayer, { ...opts, seed });
            result.restarts = attempt;
            if (!result.stalled || _stopRequested || attempt >= maxStallRestarts) break;
            log(`restarting stalled round (restart ${attempt + 1}/${maxStallRestarts}, next seed ${(baseSeed + (attempt + 1) * 1000003) >>> 0})`);
        }
        if (result.stalled) log(`round still stalled after ${result.restarts} restart(s) — returning it as a draw`);
        return result;
    }

    // Backward-compat 2-player wrapper (console/roadmap scripts reference
    // this signature directly).
    async function playGame(weights0, weights1, gameSeed, opts = {}) {
        return playMatch([weights0, weights1], { ...opts, seed: gameSeed });
    }

    // ----------------------------------------------------------------
    // Per-side fitness for one game: +1 win / -1 loss / 0 draw, plus a small
    // reward for win-condition progress (elements activated, 0-5) and a
    // small penalty per turn the side got stuck with nothing productive to
    // do. This is reward SHAPING, not a hand-authored rule about any
    // specific trap — it makes evolution's selection pressure notice
    // stalling/passivity at all, which pure win/loss fitness could not
    // (a 200-turn stalled draw scored identically to a sharp, decisive
    // draw). Mirrors the "win ±1, small per-turn penalty" reward the
    // roadmap specifies for the eventual Stage 3c RL reward.
    // ----------------------------------------------------------------
    function sideFitness(result, sideIsPlayer0, opts = {}) {
        const progressWeight = opts.progressWeight ?? 0.3;
        const stuckPenalty = opts.stuckPenalty ?? 0.15;
        const idx = sideIsPlayer0 ? 0 : 1;
        const win = result.winner === null ? 0 : (result.winner === idx ? 1 : -1);
        const progress = (result.activated?.[idx] ?? 0) / 5;
        const stuck = result.stuckTurns?.[idx] ?? 0;
        return win + progressWeight * progress - stuckPenalty * stuck;
    }

    // ----------------------------------------------------------------
    // Internal: play an A-vs-B series, checking _stopRequested each game.
    // No _running guard or flag resets — that's the caller's job (run() as
    // a top-level entry point; evolve()'s 2-player path calls this directly
    // so a mid-evolve stop() isn't undone between pairwise matchups).
    // Computes aFitness/bFitness via sideFitness() (not just win tallies)
    // and fires opts.onGame per game, same as before the N-player refactor.
    // ----------------------------------------------------------------
    async function _playSeries(weightsA, weightsB, nGames, seed, opts) {
        const result = { aWins: 0, bWins: 0, draws: 0, avgTurns: 0, aFitness: 0, bFitness: 0, games: [] };
        for (let i = 0; i < nGames && !_stopRequested; i++) {
            const aIsPlayer0 = i % 2 === 0;
            const g = await playGame(
                aIsPlayer0 ? weightsA : weightsB,
                aIsPlayer0 ? weightsB : weightsA,
                seed * 1000 + i,
                opts
            );
            const aWon = g.winner !== null && ((g.winner === 0) === aIsPlayer0);
            if (g.winner === null) result.draws++;
            else if (aWon) result.aWins++;
            else result.bWins++;
            result.aFitness += sideFitness(g, aIsPlayer0, opts);
            result.bFitness += sideFitness(g, !aIsPlayer0, opts);
            result.games.push({ winner: g.winner, turns: g.turns, aIsPlayer0 });
            result.avgTurns += g.turns / nGames;
            log(`game ${i + 1}/${nGames}: ${g.winner === null ? 'draw' : (aWon ? 'A' : 'B') + ' wins'} in ${g.turns} turns  (A=${result.aWins} B=${result.bWins} D=${result.draws})`);
            if (typeof opts.onGame === 'function') {
                try { opts.onGame(i + 1, nGames, g); } catch (e) { /* UI callback errors never abort a run */ }
            }
            await sleep(0); // yield between games — keep the tab responsive
        }
        return result;
    }

    // ----------------------------------------------------------------
    // Public: run an A-vs-B series. Sides alternate each game (game i even:
    // A = player 0; odd: A = player 1) to cancel first-mover advantage.
    // opts.visual: play every game with normal pacing/visuals (muted by
    // default, like before).
    // ----------------------------------------------------------------
    let _running = false;
    async function run(weightsA, weightsB, nGames = 10, seed = 0, opts = {}) {
        if (_running || _spectating || _evolving) throw new Error('BotArena already running');
        if (!window.BotSim || !window.BotState || !window.BotSystem) {
            throw new Error('BotArena needs BotState/BotSim/BotSystem loaded');
        }
        _running = true;
        _stopRequested = false;
        const visual = !!opts.visual;
        const restore = visual ? null : muteEnvironment();
        const unsuppressJoytone = suppressJoytone();
        window.BotSystem.speedScale = opts.speed ?? (visual ? 1 : 0.1);
        try {
            const result = await _playSeries(weightsA, weightsB, nGames, seed, { ...opts, visual });
            log('run complete:', JSON.stringify({
                aWins: result.aWins, bWins: result.bWins, draws: result.draws,
                avgTurns: +result.avgTurns.toFixed(1),
                aFitness: +result.aFitness.toFixed(2), bFitness: +result.bFitness.toFixed(2),
            }));
            return result;
        } finally {
            if (restore) restore();
            unsuppressJoytone();
            _running = false;
        }
    }

    // ----------------------------------------------------------------
    // Evolution loop (roadmap Stage 3a step 2).
    // population = opts.seedWeights (0-2 tables; defaults to current WEIGHTS
    // when omitted) + (popSize-1) more filled by breeding those seeds (see
    // above); next gen = top-2 elites carried over unchanged, rest bred via
    // uniform crossover across the top-3 pool (see crossover()) then
    // mutated. Champion persisted to localStorage['godaigo_bot_weights']
    // after every generation — callers that don't want this run's result to
    // affect the browser's LIVE bot weights must save/restore around the
    // call themselves (see the Bot Training panel's "breed" flow).
    //
    // opts.nPlayers (2–5, default 2):
    //   2 → the ORIGINAL exhaustive pairwise round-robin (every population
    //   pair plays opts.gamesPerPair games, sideFitness-based — unchanged
    //   from before).
    //   >2 → exhaustive C(popSize, nPlayers) explodes fast, so each
    //   generation instead samples opts.gamesPerGen (default popSize*3)
    //   random N-player groupings (seeded, reproducible) and credits the
    //   winner's population slot with +1 fitness.
    // opts.visual: play every training game with normal pacing/visuals via
    // playMatch() — same core spectate() uses — instead of muted/fast.
    // opts.onGeneration?(genNumber, totalGenerations, fitnessArray) —
    // optional progress hook so a caller (e.g. the cheat-panel UI) can
    // report progress without polling; purely observational, never gates
    // the loop.
    //
    // NOTE: a full roadmap-spec generation (28 pairs × 10 games) takes
    // hours in-browser even muted, and MUCH longer visualized — gamesPerPair
    // /gamesPerGen are configurable; server-side execution is Stage R5's job.
    // ----------------------------------------------------------------
    function mutate(table, rng, sigma = 0.2) {
        const out = { ...table };
        for (const k of Object.keys(out)) {
            if (typeof out[k] !== 'number') continue;
            if (k === 'searchDepth' || k === 'searchBreadth' || k === 'searchHybrid') continue; // brain shape, not tuning
            // Box-Muller gaussian × 20% of the weight's magnitude (min 1 so
            // zero-weights can still move off zero)
            const u1 = Math.max(rng(), 1e-9), u2 = rng();
            const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            out[k] = +(out[k] + gauss * sigma * Math.max(1, Math.abs(out[k]))).toFixed(3);
        }
        return out;
    }

    // Uniform crossover: each weight independently inherited from parent a or
    // b (a real-valued weight vector has no meaningful "gene order" to cut a
    // single split point on, unlike a bitstring/chromosome GA). Lets two
    // different good strategies combine instead of only drifting apart via
    // mutation of a single elite — e.g. one elite good at pattern-building,
    // another good at collecting, can now produce a child that inherits both.
    function crossover(a, b, rng) {
        const out = { ...a };
        for (const k of Object.keys(out)) {
            if (typeof out[k] !== 'number') continue;
            if (k === 'searchDepth' || k === 'searchBreadth' || k === 'searchHybrid') continue; // brain shape, not tuning
            out[k] = rng() < 0.5 ? a[k] : b[k];
        }
        return out;
    }

    let _evolving = false;
    function isEvolving() { return _evolving; }

    async function evolve(generations = 5, opts = {}) {
        if (_running || _spectating || _evolving) throw new Error('BotArena already running');
        if (!window.BotSim || !window.BotState || !window.BotSystem) {
            throw new Error('BotArena needs BotState/BotSim/BotSystem loaded');
        }
        const gamesPerPair = opts.gamesPerPair ?? 2;
        const popSize = opts.popSize ?? 8;
        const seed = opts.seed ?? 1;
        const nPlayers = Math.max(2, Math.min(5, opts.nPlayers ?? 2));
        const visual = !!opts.visual;
        const rng = mulberry32(seed);

        _evolving = true;
        _stopRequested = false; // same stop() flag spectate() uses — shared "cancel a local bot job" signal
        const restore = visual ? null : muteEnvironment();
        const unsuppressJoytone = suppressJoytone();
        window.BotSystem.speedScale = opts.speed ?? (visual ? 1 : 0.1);

        // Every population member is tracked as {id, w, parentIds} so a UI
        // can show a stable roster across generations, not just a bare
        // fitness-number array: id is assigned once when a table is first
        // created (seed, mutation, or crossover child) and an ELITE keeps
        // its id when carried over unchanged into the next generation — a
        // fresh mutation/crossover child always gets a NEW id and records
        // parentIds (empty for a seed/pure mutation-of-one, [idA, idB] for
        // a crossover child) so lineage can be shown. Purely a display
        // concern — ids never affect selection/breeding logic itself.
        let _nextPopId = 1;
        function newMember(w, parentIds) { return { id: _nextPopId++, w, parentIds: parentIds || [] }; }

        // opts.seedWeights (0-2 uploaded/carried-over weight tables) seeds
        // the initial population instead of the live WEIGHTS. With exactly
        // 2 seeds, the rest of the population is bred via crossover between
        // them (then mutated) — same reasoning as the elite breeding pool
        // below, just applied to externally-supplied parents instead of a
        // generation's own winners. With 0 or 1, behaves exactly as before
        // (mutations of the single available table).
        const seeds = (opts.seedWeights && opts.seedWeights.length) ? opts.seedWeights : [{ ...window.BotSystem.WEIGHTS }];
        let population = seeds.map(w => newMember(w));
        while (population.length < popSize) {
            if (seeds.length >= 2) {
                const pa = seeds[Math.floor(rng() * seeds.length)];
                const pb = seeds[Math.floor(rng() * seeds.length)];
                population.push(newMember(mutate(pa === pb ? pa : crossover(pa, pb, rng), rng)));
            } else {
                population.push(newMember(mutate(seeds[0], rng)));
            }
        }
        let champion = population[0].w;

        try {
            for (let gen = 0; gen < generations && !_stopRequested; gen++) {
                const fitness = new Array(population.length).fill(0);

                if (nPlayers === 2) {
                    for (let i = 0; i < population.length && !_stopRequested; i++) {
                        for (let j = i + 1; j < population.length && !_stopRequested; j++) {
                            if (visual && typeof updateStatus === 'function') {
                                updateStatus(`🧬 Evolve gen ${gen + 1}/${generations}: pop#${i} vs pop#${j}`);
                            }
                            const r = await _playSeries(population[i].w, population[j].w, gamesPerPair, seed * 100 + gen * 10 + i + j, { ...opts, visual });
                            fitness[i] += r.aFitness;
                            fitness[j] += r.bFitness;
                        }
                    }
                } else {
                    const gamesPerGen = opts.gamesPerGen ?? popSize * 3;
                    for (let g = 0; g < gamesPerGen && !_stopRequested; g++) {
                        const idxs = sampleDistinct(population.length, nPlayers, rng);
                        const weightsPerPlayer = idxs.map(i => population[i].w);
                        const gameSeed = seed * 100000 + gen * 1000 + g;
                        if (visual && typeof updateStatus === 'function') {
                            updateStatus(`🧬 Evolve gen ${gen + 1}/${generations}, game ${g + 1}/${gamesPerGen}: pop ${idxs.join(',')}`);
                        }
                        const result = await playMatch(weightsPerPlayer, { ...opts, seed: gameSeed, visual });
                        if (result.winner !== null) fitness[idxs[result.winner]]++;
                        log(`gen ${gen + 1} game ${g + 1}/${gamesPerGen} (pop ${idxs.join(',')}): ${result.winner === null ? 'draw' : 'pop#' + idxs[result.winner] + ' wins'} in ${result.turns} turns`);
                        if (typeof opts.onGame === 'function') {
                            try { opts.onGame(g + 1, gamesPerGen, result); } catch (e) { /* UI callback errors never abort training */ }
                        }
                        await sleep(0);
                    }
                }

                const ranked = population
                    .map((p, i) => ({ id: p.id, w: p.w, parentIds: p.parentIds, f: fitness[i] }))
                    .sort((a, b) => b.f - a.f);
                log(`generation ${gen + 1}/${generations} fitness:`, ranked.map(r => r.f).join(', '));
                if (typeof opts.onGeneration === 'function') {
                    // 3rd arg (bare fitness numbers) kept exactly as before for
                    // existing callers; 4th arg is the richer per-member roster
                    // (id/fitness/lineage/weights, already best-first) for a UI
                    // that wants to show more than just numbers.
                    try {
                        opts.onGeneration(gen + 1, generations, ranked.map(r => r.f),
                            ranked.map(r => ({ id: r.id, fitness: r.f, parentIds: r.parentIds, w: r.w })));
                    } catch (e) { /* UI callback errors never abort training */ }
                }

                champion = ranked[0].w;
                try { localStorage.setItem('godaigo_bot_weights', JSON.stringify(champion)); } catch (e) {}
                log('champion weights (paste into bot.js DEFAULT_WEIGHTS to make permanent):\n' + JSON.stringify(champion));

                // Pure elitism: the top 2 survive completely unchanged (same
                // id — they ARE the same table), so a generation can never
                // lose the best table found so far. The rest of the
                // population is bred from a slightly wider pool (top 3) via
                // crossover + mutation — a fresh id each, with parentIds set
                // — so two different good strategies can combine instead of
                // only mutating apart from a single elite each.
                const elites = [ranked[0], ranked[1]];
                const breedingPool = ranked.slice(0, Math.min(3, ranked.length));
                population = elites.map(r => ({ id: r.id, w: r.w, parentIds: r.parentIds }));
                while (population.length < popSize) {
                    const pa = breedingPool[Math.floor(rng() * breedingPool.length)];
                    const pb = breedingPool[Math.floor(rng() * breedingPool.length)];
                    const child = pa.id === pb.id ? pa.w : crossover(pa.w, pb.w, rng);
                    population.push(newMember(mutate(child, rng), pa.id === pb.id ? [pa.id] : [pa.id, pb.id]));
                }
            }
        } finally {
            if (restore) restore();
            unsuppressJoytone();
            _evolving = false;
        }
        return champion;
    }

    // ----------------------------------------------------------------
    // Spectator mode: watch nPlayers (2–5) bots play a full LOCAL game with
    // all the normal visuals (win screen included), then auto-download the
    // action log. Unlike run(), nothing visual is muted and pacing is
    // watchable. All players share whatever weights are currently loaded
    // (an evolved localStorage table, or the Bot Brain toggle) — playMatch()
    // is given an array of `undefined` entries so it never overwrites that.
    // Start from the cheat panel (AP label 5×) or the console:
    //   BotArena.spectate(3)            — 3 bots, normal pacing
    //   BotArena.spectate(4, {speed:2}) — 4 bots, double-time delays
    //   BotArena.stop()                 — end the match early (also cancels
    //                                      an in-progress run()/evolve(),
    //                                      which check the same flag)
    // ----------------------------------------------------------------
    let _spectating = false;
    function isSpectating() { return _spectating; }
    function isRunning() { return _running || _spectating || _evolving; }

    async function spectate(nPlayers = 2, opts = {}) {
        if (_running || _spectating || _evolving) throw new Error('BotArena already running');
        nPlayers = Math.max(2, Math.min(5, nPlayers | 0)); // 5 player colors exist
        if (!window.BotSim || !window.BotState || !window.BotSystem) {
            throw new Error('BotArena needs BotState/BotSim/BotSystem loaded');
        }
        _spectating = true;
        _stopRequested = false;

        // Keep sounds, music, animations, and the WIN SCREEN — only mute
        // gamification so bot games can't farm XP onto a logged-in profile.
        const savedGami = window.gami;
        const savedPrompt = window.showEndTurnPrompt;
        const savedSpeed = window.BotSystem.speedScale;
        const rw = window.spellSystem?.responseWindow;
        const savedIsBotPlayer = rw?.isBotPlayer;
        window.gami = null;
        window.showEndTurnPrompt = () => {};
        window.BotSystem.speedScale = opts.speed ?? 1;
        // Same fix as run()'s muteEnvironment(): isBotPlayer() only knows about
        // multiplayer's allPlayersData, so in this local all-bot match it thinks
        // every seat is human and lets real response windows open — 15s of dead
        // air per eligible cast with no one to click Pass.
        if (rw) rw.isBotPlayer = () => true;

        const roster = Array.from({ length: nPlayers }, (_, i) =>
            ({ index: i, username: `🤖 Bot ${i + 1}`, isBot: true }));
        window.ActionLog?.clear?.();
        window.ActionLog?.setRoster?.(roster);

        let result;
        try {
            if (typeof updateStatus === 'function') {
                updateStatus(`🤖 Bot match: ${nPlayers} bots playing. Open the cheat panel to stop or download the log.`);
            }
            result = await playMatch(Array(nPlayers).fill(undefined), { ...opts, visual: true, turnCap: opts.turnCap ?? 300 });
        } finally {
            window.gami = savedGami;
            window.showEndTurnPrompt = savedPrompt;
            window.BotSystem.speedScale = savedSpeed;
            if (rw && savedIsBotPlayer) rw.isBotPlayer = savedIsBotPlayer;
            _spectating = false;
        }

        const label = result.winner !== null ? `🏆 Bot ${result.winner + 1} wins in ${result.turns} turns!`
                    : _stopRequested ? `⏹ Bot match stopped after ${result.turns} turns`
                    : `🤝 Draw — turn cap (${result.turns}) reached`;
        log(label);
        if (typeof updateStatus === 'function') updateStatus(`${label} Downloading action log…`);
        try { window.ActionLog?.download?.(); } catch (e) { log('log download failed:', e); }
        return result;
    }

    window.BotArena = {
        run, evolve, playGame, playMatch, spectate, stop,
        isSpectating, isEvolving, isRunning,
        stopRequested: () => _stopRequested, // was stop() called for the run in progress (or the one that just ended)?
        applyWeights: setWeights, // apply an {…} weight table to the LIVE WEIGHTS object in place
    };
    log('Loaded — window.BotArena ready (run / evolve / spectate)');
})();
