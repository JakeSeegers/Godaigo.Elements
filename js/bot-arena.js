// ============================================================
// bot-arena.js — Stage 3a of docs/bot-roadmap.md: self-play arena
// ============================================================
// Runs full LOCAL 2-player games where both players are bot-driven, with a
// separate WEIGHTS table per player. Used to A/B bot brains (search vs
// greedy vs hybrid), measure Stage-2.5 effect-usage increments, and evolve
// weights.
//
//   await BotArena.run(weightsA, weightsB, nGames, seed, opts)
//       → { aWins, bWins, draws, avgTurns, games:[{winner, turns, side}] }
//   await BotArena.evolve(generations, opts)
//       → champion weight table (also saved to
//         localStorage['godaigo_bot_weights'] + logged as JSON)
//
// HOW A GAME RUNS (local hot-seat — no Supabase, no multiplayer):
//   resetGameResources() + startGame(2) reset everything; Math.random is
//   temporarily seeded (mulberry32) so tile/scroll deck shuffles are
//   reproducible per game. Both player tiles are placed at the two
//   mutually-farthest placement candidates (fair, deterministic). Then
//   turns alternate: swap WEIGHTS to the active player's table, refill AP
//   (the local hot-seat path never auto-resets AP for >1 players — that
//   code is multiplayer-only), run BotSystem.turn(), check BotSim.winner.
//   Sides alternate between games to cancel first-mover advantage.
//
// SUPPRESSED DURING A RUN (saved/restored): win-screen modal
// (spellSystem.showLevelComplete), end-turn AP prompt, SoundSystem,
// JoytoneBridge, gamification (window.gami — otherwise arena games would
// farm real XP onto the logged-in profile). BotSystem.speedScale is set
// from opts.speed (default 0.1 ≈ 35ms between actions).
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

    // ----------------------------------------------------------------
    // Environment guard: everything the arena mutes, saved and restored
    // even if a game throws.
    // ----------------------------------------------------------------
    function muteEnvironment() {
        const saved = {
            random: Math.random,
            sound: window.SoundSystem,
            joytone: window.JoytoneBridge,
            gami: window.gami,
            endTurnPrompt: window.showEndTurnPrompt,
            levelComplete: window.spellSystem?.showLevelComplete,
            speedScale: window.BotSystem.speedScale,
        };
        window.SoundSystem = null;
        window.JoytoneBridge = null;
        window.gami = null; // never grant real XP/gold for arena games
        window.showEndTurnPrompt = () => {};
        if (window.spellSystem) {
            window.spellSystem.showLevelComplete = function (playerIndex) {
                log(`(win screen suppressed for player ${playerIndex})`);
            };
        }
        return function restore() {
            Math.random = saved.random;
            window.SoundSystem = saved.sound;
            window.JoytoneBridge = saved.joytone;
            window.gami = saved.gami;
            window.showEndTurnPrompt = saved.endTurnPrompt;
            if (window.spellSystem && saved.levelComplete) {
                window.spellSystem.showLevelComplete = saved.levelComplete;
            }
            window.BotSystem.speedScale = saved.speedScale;
        };
    }

    function setWeights(table) {
        const W = window.BotSystem.WEIGHTS;
        for (const k of Object.keys(W)) delete W[k];
        Object.assign(W, window.BotSystem.DEFAULT_WEIGHTS, table);
    }

    // ----------------------------------------------------------------
    // Player-tile placement: the two mutually-farthest free hexes adjacent
    // to the tile cluster (large-tile grid). Deterministic and symmetric —
    // neither bot gets a positional edge from placement luck.
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
                candidates.push(p);
            }
        }
        return candidates;
    }

    function placeBothPlayerTiles() {
        const cands = placementCandidates();
        if (cands.length < 2) throw new Error('arena: not enough placement candidates');
        let best = null;
        for (let i = 0; i < cands.length; i++) {
            for (let j = i + 1; j < cands.length; j++) {
                const d = Math.hypot(cands[i].x - cands[j].x, cands[i].y - cands[j].y);
                if (!best || d > best.d) best = { d, a: cands[i], b: cands[j] };
            }
        }
        placeTile(best.a.x, best.a.y, 0, false, 'player'); // → player 0
        placeTile(best.b.x, best.b.y, 0, false, 'player'); // → player 1
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

    // ----------------------------------------------------------------
    // One full game. weights0/weights1 are keyed by PLAYER INDEX.
    // Returns { winner: 0 | 1 | null, turns }.
    // ----------------------------------------------------------------
    async function playGame(weights0, weights1, gameSeed, opts) {
        const turnCap = opts.turnCap ?? 200;

        // Seed ALL shuffle randomness (tile deck, scroll decks) for this game
        Math.random = mulberry32(gameSeed);

        if (typeof resetGameResources === 'function') resetGameResources();
        window.BotSystem.resetMemory();
        startGame(2);
        await sleep(30);
        placeBothPlayerTiles();
        await sleep(30);
        activePlayerIndex = 0;

        for (let turn = 0; turn < turnCap; turn++) {
            const idx = activePlayerIndex;
            setWeights(idx === 0 ? weights0 : weights1);
            refillAP();
            await window.BotSystem.turn();

            const w = window.BotSim.winner(window.BotState.snapshot());
            if (w !== null) return { winner: w, turns: turn + 1 };

            if (activePlayerIndex === idx) {
                // Bot didn't end its own turn (stuck/no actions) — force it
                const r = window.BotState.applyAction({ type: 'endTurn' });
                if (!r.ok) {
                    log(`game seed ${gameSeed}: stuck on turn ${turn} (${r.reason}) — draw`);
                    return { winner: null, turns: turn + 1 };
                }
                await sleep(20);
            }
        }
        return { winner: null, turns: turnCap };
    }

    // ----------------------------------------------------------------
    // Public: run an A-vs-B series. Sides alternate each game (game i even:
    // A = player 0; odd: A = player 1) to cancel first-mover advantage.
    // ----------------------------------------------------------------
    let _running = false;
    async function run(weightsA, weightsB, nGames = 10, seed = 0, opts = {}) {
        if (_running) throw new Error('BotArena already running');
        if (!window.BotSim || !window.BotState || !window.BotSystem) {
            throw new Error('BotArena needs BotState/BotSim/BotSystem loaded');
        }
        _running = true;
        const restore = muteEnvironment();
        window.BotSystem.speedScale = opts.speed ?? 0.1;

        const result = { aWins: 0, bWins: 0, draws: 0, avgTurns: 0, games: [] };
        try {
            for (let i = 0; i < nGames; i++) {
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
                result.games.push({ winner: g.winner, turns: g.turns, aIsPlayer0 });
                result.avgTurns += g.turns / nGames;
                log(`game ${i + 1}/${nGames}: ${g.winner === null ? 'draw' : (aWon ? 'A' : 'B') + ' wins'} in ${g.turns} turns  (A=${result.aWins} B=${result.bWins} D=${result.draws})`);
                await sleep(0); // yield between games — keep the tab responsive
            }
        } finally {
            restore();
            _running = false;
        }
        log('run complete:', JSON.stringify({ aWins: result.aWins, bWins: result.bWins, draws: result.draws, avgTurns: +result.avgTurns.toFixed(1) }));
        return result;
    }

    // ----------------------------------------------------------------
    // Evolution loop (roadmap Stage 3a step 2).
    // population 8 = current WEIGHTS + 7 Gaussian mutations (σ = 20% of
    // each weight's magnitude); fitness = round-robin wins; next gen =
    // top-2 elites + 6 fresh mutations of them. Champion persisted to
    // localStorage['godaigo_bot_weights'] after every generation.
    // NOTE: a full roadmap-spec generation (28 pairs × 10 games) takes
    // hours in-browser — gamesPerPair is configurable; server-side
    // execution is Stage R5's job.
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

    async function evolve(generations = 5, opts = {}) {
        const gamesPerPair = opts.gamesPerPair ?? 2;
        const popSize = opts.popSize ?? 8;
        const seed = opts.seed ?? 1;
        const rng = mulberry32(seed);

        let population = [{ ...window.BotSystem.WEIGHTS }];
        while (population.length < popSize) population.push(mutate(population[0], rng));

        for (let gen = 0; gen < generations; gen++) {
            const fitness = new Array(population.length).fill(0);
            for (let i = 0; i < population.length; i++) {
                for (let j = i + 1; j < population.length; j++) {
                    const r = await run(population[i], population[j], gamesPerPair, seed * 100 + gen * 10 + i + j, opts);
                    fitness[i] += r.aWins;
                    fitness[j] += r.bWins;
                }
            }
            const ranked = population
                .map((w, i) => ({ w, f: fitness[i] }))
                .sort((a, b) => b.f - a.f);
            log(`generation ${gen + 1}/${generations} fitness:`, ranked.map(r => r.f).join(', '));

            const champion = ranked[0].w;
            try { localStorage.setItem('godaigo_bot_weights', JSON.stringify(champion)); } catch (e) {}
            log('champion weights (paste into bot.js DEFAULT_WEIGHTS to make permanent):\n' + JSON.stringify(champion));

            const elites = [ranked[0].w, ranked[1].w];
            population = [...elites];
            while (population.length < popSize) {
                population.push(mutate(elites[population.length % 2], rng));
            }
        }
        return population[0];
    }

    window.BotArena = { run, evolve, playGame };
    log('Loaded — window.BotArena ready (run / evolve)');
})();
