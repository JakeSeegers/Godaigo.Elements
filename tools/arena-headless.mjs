#!/usr/bin/env node
// arena-headless.mjs — run BotArena self-play in headless Chromium, no open tab needed.
//
// Smoke mode (phase 1): a single A-vs-B series with the current default weights.
//   node tools/arena-headless.mjs --games 4 --seed 1
//
// Evolve mode (phase 2): weight evolution sharded across N parallel headless
// pages — each shard runs an independent BotArena.evolve() with its own seed
// and isolated storage, and all shard champions are written to one results file.
//   node tools/arena-headless.mjs --evolve --shards 4 --generations 3 --pop 6 --games-per-pair 1
//
// Confirm mode (phase 3): pick the best shard champion and prove it. Runs a
// round-robin playoff among the shard champions from an evolve results file,
// then a confirmation series of playoff-winner vs the CURRENT baseline weights
// (whatever the page loads: bot.js defaults, or the Supabase-served champion
// when reachable). Only endorses the champion if it beats the baseline —
// the same confirmation gate the cheat panel's Train Weights button applies.
//   node tools/arena-headless.mjs --confirm                     # newest evolve-*.json
//   node tools/arena-headless.mjs --confirm path/to/results.json
//
// HillClimb mode (the RELIABLE trainer): a champion-anchored (1+λ) climber,
// parallelized across the page pool. Unlike evolve (which scores bots by
// beating their near-identical siblings over 1 noisy game — a downhill random
// walk), this holds the champion FIXED and each round plays λ mutant
// challengers against it for N games each, promoting one ONLY if it clears a
// real win-rate margin. The champion is monotonic — it can only go up. The λ
// trials fan out across --shards pages, so this is where your cores earn their
// keep. Writes hillclimb-<ts>.json + apply-champion.txt (if improved).
//   node tools/arena-headless.mjs --hillclimb --shards 6 --hc-rounds 20
//   node tools/arena-headless.mjs --hillclimb path/to/champion.json   # seed from a file
//
// Options (all modes unless noted):
//   --hillclimb [file]  hillclimb mode; optional seed-champion json (else page weights)
//   --hc-rounds N       climbing rounds (default 20)
//   --hc-lambda N       challengers per round (default 6; trials fan across --shards)
//   --hc-games N        games each challenger plays vs the champion (default 30)
//   --hc-promote R      win-rate over decided games needed to promote (default 0.58)
//   --hc-sigma X        base mutation step (default 0.2; auto-widens on barren rounds)
//   --hc-confirm N      games in the final champion-vs-starting confirm (default 20)
//   --hc-confirm-margin R  win-rate margin to call the run IMPROVED (default 0.55;
//                       a 5-5 tie / fitness hair does NOT count — guards against noise)
//   --seed N            base RNG seed (default 1)
//   --players N         players per game, 2-5 (default 2)
//   --speed X           BotSystem.speedScale (default 0.1, arena normal)
//   --timeout M         watchdog: kill everything after M minutes (default 360 = 6h).
//                       hillclimb checkpoints every round to its output json, so a
//                       timeout/crash/Ctrl-C never loses the champion reached so far.
//   --headed            visible browser window(s) (debugging)
//   --verbose           stream the page's [Bot]/[BotArena] console lines
//   --games N           smoke mode: games in the series (default 4)
//   --shards N          evolve mode: parallel headless pages (default 4)
//   --generations N     evolve mode: generations per shard (default 3)
//   --pop N             evolve mode: population size per shard (default 6)
//   --games-per-pair N  evolve mode: games per round-robin pairing (default 1)
//   --out FILE          evolve/confirm mode: results JSON path (default tools/.cache/<mode>-<ts>.json)
//   --playoff-games N   confirm mode: games per champion pairing (default 2)
//   --confirm-games N   confirm mode: games in the final vs-baseline series (default 10)
//
// The game page needs supabase-js from unpkg; when that CDN is unreachable
// (offline, locked-down proxy) the script serves a cached copy from
// tools/.cache/ instead. On a machine with normal network the script caches
// it automatically on first run; to seed the cache by hand:
//   npm pack @supabase/supabase-js@2.39.3 && tar -xzf supabase-supabase-js-2.39.3.tgz \
//     package/dist/umd/supabase.js && mv package/dist/umd/supabase.js tools/.cache/supabase.js

import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const CACHE_DIR = join(ROOT, 'tools', '.cache');
const SUPABASE_CACHE = join(CACHE_DIR, 'supabase.js');

// ---------------------------------------------------------------- args
function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    if (i === -1) return fallback;
    const v = process.argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : v;
}
const OPTS = {
    evolve: !!arg('evolve', false),
    confirm: arg('confirm', false), // false | true (newest results) | path
    playoffGames: +arg('playoff-games', 2),
    confirmGames: +arg('confirm-games', 10),
    games: +arg('games', 4),
    seed: +arg('seed', 1),
    players: +arg('players', 2),
    speed: +arg('speed', 0.1),
    timeoutMs: +arg('timeout', 360) * 60_000, // watchdog cap in MINUTES (default 6h; hillclimb runs are multi-hour)
    headed: !!arg('headed', false),
    verbose: !!arg('verbose', false),
    shards: +arg('shards', 4),
    generations: +arg('generations', 3),
    pop: +arg('pop', 6),
    gamesPerPair: +arg('games-per-pair', 1),
    out: arg('out', null),
    // hillClimb mode (champion-anchored monotonic climber, parallelized)
    hillclimb: arg('hillclimb', false), // false | true (seed from page weights) | path to a seed champion json
    hcRounds: +arg('hc-rounds', 20),
    hcLambda: +arg('hc-lambda', 6),
    hcGames: +arg('hc-games', 30),
    hcPromote: +arg('hc-promote', 0.58),
    hcSigma: +arg('hc-sigma', 0.2),
    hcConfirm: +arg('hc-confirm', 20),          // games in the final champion-vs-starting confirm
    hcConfirmMargin: +arg('hc-confirm-margin', 0.55), // win rate over decided games needed to call it IMPROVED
};

// ---------------------------------------------------------------- hillclimb helpers
// Node-side mirrors of bot-arena.js's mulberry32 + mutate, so the parallel
// runner can generate challengers in Node (each trial is then dispatched to a
// page as a plain BotArena.run(challenger, champion) A/B series). Kept in exact
// sync with bot-arena.js: same brain-shape exclusions, same per-weight Gaussian.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function mutate(table, rng, sigma = 0.2) {
    const out = { ...table };
    for (const k of Object.keys(out)) {
        if (typeof out[k] !== 'number') continue;
        if (k === 'searchDepth' || k === 'searchBreadth' || k === 'searchHybrid') continue; // brain shape, not tuning
        const u1 = Math.max(rng(), 1e-9), u2 = rng();
        const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        out[k] = +(out[k] + gauss * sigma * Math.max(1, Math.abs(out[k]))).toFixed(3);
    }
    return out;
}

// ---------------------------------------------------------------- playwright
// Resolve the playwright package whether it's installed locally or globally.
async function loadPlaywright() {
    const localRequire = createRequire(import.meta.url);
    try { return localRequire('playwright'); } catch {}
    const globalRoot = execSync('npm root -g').toString().trim();
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
}

// ---------------------------------------------------------------- static server
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
};
function startServer() {
    const server = http.createServer(async (req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let filePath = normalize(join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
        if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        try {
            const s = await stat(filePath);
            if (s.isDirectory()) filePath = join(filePath, 'index.html');
            res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream' });
            createReadStream(filePath).pipe(res);
        } catch {
            res.writeHead(404); res.end('not found');
        }
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------------------------------------------------------------- page boot
// Open one game page in its own (storage-isolated) context and wait until the
// bot stack is loaded. `tag` prefixes its console/error lines.
async function bootGamePage(browser, url, tag) {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Third-party routes: fonts are cosmetic — kill them fast. supabase-js is
    // load-bearing — serve the cached copy, else fetch-and-cache from unpkg.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.route(/unpkg\.com\/@supabase\/supabase-js/, async route => {
        if (existsSync(SUPABASE_CACHE)) {
            return route.fulfill({ path: SUPABASE_CACHE, contentType: 'text/javascript' });
        }
        try {
            const resp = await route.fetch();
            const body = await resp.body();
            mkdirSync(CACHE_DIR, { recursive: true });
            writeFileSync(SUPABASE_CACHE, body);
            console.log(`[runner] cached supabase-js to ${SUPABASE_CACHE}`);
            return route.fulfill({ response: resp, body });
        } catch {
            console.error(`[runner] FATAL: supabase-js unreachable and no cache at ${SUPABASE_CACHE}`);
            console.error('[runner] seed the cache per the header comment, then rerun.');
            return route.abort();
        }
    });

    page.on('pageerror', e => console.error(`[${tag} error] ${e.message}`));
    page.on('console', msg => {
        const t = msg.text();
        const arena = t.includes('[BotArena]');
        if ((arena && (OPTS.verbose || !OPTS.evolve)) ||
            (OPTS.verbose && (t.includes('[Bot]') || msg.type() === 'error'))) {
            console.log(`[${tag}] ${t}`);
        }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => window.BotArena && window.BotSystem && window.BotState && window.BotSim,
        null, { timeout: 30_000 },
    );
    return page;
}

// ---------------------------------------------------------------- smoke mode
async function runSmoke(browser, url) {
    const page = await bootGamePage(browser, url, 'page');
    console.log(`[runner] game loaded; ${OPTS.games} game(s), seed ${OPTS.seed}, ${OPTS.players} players, speed ${OPTS.speed}`);

    const t0 = Date.now();
    const result = await page.evaluate(async ({ games, seed, players, speed }) => {
        // undefined weight tables = play with whatever WEIGHTS is currently
        // loaded (defaults, since a fresh context has no localStorage history).
        if (players === 2) {
            return await window.BotArena.run(undefined, undefined, games, seed, { speed });
        }
        // >2 players: no A/B series concept — play N playMatch games directly.
        const out = { games: [], turns: 0 };
        for (let g = 0; g < games; g++) {
            const r = await window.BotArena.playMatch(Array(players).fill(undefined), { seed: seed + g, speed });
            out.games.push({ winner: r.winner, turns: r.turns, activated: r.activated });
            out.turns += r.turns;
        }
        return out;
    }, OPTS);
    const elapsed = (Date.now() - t0) / 1000;

    console.log('[runner] --- result ---');
    console.log(JSON.stringify(result, (k, v) => (k === 'games' && Array.isArray(v) && v.length > 20 ? `${v.length} games` : v), 2));
    console.log(`[runner] ${OPTS.games} game(s) in ${elapsed.toFixed(1)}s (${(elapsed / OPTS.games).toFixed(1)}s/game)`);
}

// ---------------------------------------------------------------- evolve mode
async function runEvolveShard(browser, url, shardIndex) {
    const tag = `shard ${shardIndex}`;
    const page = await bootGamePage(browser, url, tag);
    // Each shard gets a well-separated seed: evolve() derives per-game seeds
    // as seed*100 + gen*10 + i + j, so consecutive base seeds would replay
    // overlapping game seeds across shards — space them out instead.
    const shardSeed = OPTS.seed + shardIndex * 7919;

    let lastFitness = null;
    await page.exposeFunction('__onGeneration', (gen, total, fitness) => {
        lastFitness = fitness;
        console.log(`[${tag}] generation ${gen}/${total} fitness: ${fitness.map(f => +f.toFixed(2)).join(', ')}`);
    });

    const t0 = Date.now();
    const champion = await page.evaluate(async ({ generations, pop, gamesPerPair, players, speed, shardSeed }) => {
        return await window.BotArena.evolve(generations, {
            popSize: pop,
            gamesPerPair,
            nPlayers: players,
            speed,
            seed: shardSeed,
            onGeneration: (gen, total, fitness) => window.__onGeneration(gen, total, fitness),
        });
    }, { ...OPTS, shardSeed });
    const elapsed = (Date.now() - t0) / 1000;

    console.log(`[${tag}] done in ${(elapsed / 60).toFixed(1)} min`);
    await page.context().close();
    return { shard: shardIndex, seed: shardSeed, elapsedSec: +elapsed.toFixed(1), championFitness: lastFitness?.[0] ?? null, champion };
}

async function runEvolve(browser, url) {
    const perShardGames = OPTS.players === 2
        ? OPTS.generations * (OPTS.pop * (OPTS.pop - 1) / 2) * OPTS.gamesPerPair
        : OPTS.generations * OPTS.pop * 3;
    console.log(`[runner] evolve: ${OPTS.shards} shard(s) × ${OPTS.generations} gen × pop ${OPTS.pop} × ${OPTS.gamesPerPair} game(s)/pair ≈ ${perShardGames} games per shard, in parallel`);

    const t0 = Date.now();
    const shards = await Promise.all(
        Array.from({ length: OPTS.shards }, (_, i) => runEvolveShard(browser, url, i)),
    );
    const elapsed = (Date.now() - t0) / 1000;

    const results = {
        when: new Date().toISOString(),
        opts: {
            shards: OPTS.shards, generations: OPTS.generations, pop: OPTS.pop,
            gamesPerPair: OPTS.gamesPerPair, players: OPTS.players, speed: OPTS.speed, seed: OPTS.seed,
        },
        totalMinutes: +(elapsed / 60).toFixed(1),
        shards,
    };
    mkdirSync(CACHE_DIR, { recursive: true });
    const outPath = OPTS.out || join(CACHE_DIR, `evolve-${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify(results, null, 2));

    console.log('[runner] --- evolve summary ---');
    for (const s of shards) {
        console.log(`[runner] shard ${s.shard}: champion fitness ${s.championFitness ?? '?'} (${(s.elapsedSec / 60).toFixed(1)} min)`);
    }
    console.log(`[runner] ${OPTS.shards} shards × ~${perShardGames} games in ${(elapsed / 60).toFixed(1)} min total`);
    console.log(`[runner] shard champions written to ${outPath}`);
    console.log('[runner] next: pick/confirm a champion against the baseline (phase 3) before trusting any of these.');
}

// ---------------------------------------------------------------- confirm mode
// Run a list of A-vs-B series tasks across a pool of pages, in parallel.
async function runSeriesPool(browser, url, tasks) {
    const poolSize = Math.min(OPTS.shards, tasks.length);
    const queue = tasks.map((t, i) => ({ ...t, index: i }));
    const results = new Array(tasks.length);
    await Promise.all(Array.from({ length: poolSize }, async (_, w) => {
        const page = await bootGamePage(browser, url, `worker ${w}`);
        let task;
        while ((task = queue.shift())) {
            console.log(`[runner] ${task.label} (${task.games} games) starting on worker ${w}`);
            const r = await page.evaluate(async ({ a, b, games, seed, speed }) => {
                const res = await window.BotArena.run(a, b, games, seed, { speed });
                return {
                    aWins: res.aWins, bWins: res.bWins, draws: res.draws,
                    avgTurns: res.avgTurns, aFitness: res.aFitness, bFitness: res.bFitness,
                };
            }, { a: task.a, b: task.b, games: task.games, seed: task.seed, speed: OPTS.speed });
            console.log(`[runner] ${task.label}: A ${r.aWins} — B ${r.bWins} (draws ${r.draws}, fitness ${r.aFitness.toFixed(2)} vs ${r.bFitness.toFixed(2)})`);
            results[task.index] = { label: task.label, ...r };
        }
        await page.context().close();
    }));
    return results;
}

function newestEvolveResults() {
    const files = readdirSync(CACHE_DIR).filter(f => /^evolve-.*\.json$/.test(f)).sort();
    if (!files.length) throw new Error(`no evolve-*.json results in ${CACHE_DIR} — run --evolve first`);
    return join(CACHE_DIR, files[files.length - 1]);
}

async function runConfirm(browser, url) {
    const resultsPath = typeof OPTS.confirm === 'string' ? OPTS.confirm : newestEvolveResults();
    const evolveResults = JSON.parse(readFileSync(resultsPath, 'utf8'));
    const champions = evolveResults.shards.map(s => ({ shard: s.shard, w: s.champion }));
    console.log(`[runner] confirm: ${champions.length} shard champion(s) from ${resultsPath}`);

    // Baseline = whatever WEIGHTS the page actually plays with today. Captured
    // explicitly because playMatch treats an undefined table as "leave WEIGHTS
    // alone" — mixing an explicit champion with undefined would leak the
    // champion's weights into the baseline's turns. The short settle wait gives
    // bot.js's async Supabase champion-load a chance to apply first (no-op offline).
    const basePage = await bootGamePage(browser, url, 'baseline');
    const baseline = await basePage.evaluate(async () => {
        await new Promise(r => setTimeout(r, 1500));
        return { ...window.BotSystem.WEIGHTS };
    });
    await basePage.context().close();

    // Playoff: round-robin among shard champions, evolve-style summed fitness.
    let playoff = null;
    let winner = champions[0];
    if (champions.length > 1) {
        const tasks = [];
        for (let i = 0; i < champions.length; i++) {
            for (let j = i + 1; j < champions.length; j++) {
                tasks.push({
                    label: `playoff: shard ${champions[i].shard} vs shard ${champions[j].shard}`,
                    a: champions[i].w, b: champions[j].w, i, j,
                    games: OPTS.playoffGames, seed: OPTS.seed + 500_000 + tasks.length * 101,
                });
            }
        }
        const results = await runSeriesPool(browser, url, tasks);
        const fitness = new Array(champions.length).fill(0);
        results.forEach((r, k) => { fitness[tasks[k].i] += r.aFitness; fitness[tasks[k].j] += r.bFitness; });
        const ranked = champions.map((c, i) => ({ ...c, fitness: +fitness[i].toFixed(2) })).sort((a, b) => b.fitness - a.fitness);
        console.log(`[runner] playoff ranking: ${ranked.map(r => `shard ${r.shard} (${r.fitness})`).join(' > ')}`);
        winner = ranked[0];
        playoff = { games: results, ranking: ranked.map(r => ({ shard: r.shard, fitness: r.fitness })) };
    }

    // Confirmation gate: playoff winner vs baseline.
    const [conf] = await runSeriesPool(browser, url, [{
        label: `confirmation: shard ${winner.shard} champion vs baseline`,
        a: winner.w, b: baseline, games: OPTS.confirmGames, seed: OPTS.seed + 900_000,
    }]);
    const confirmed = conf.aFitness > conf.bFitness;

    const outPath = OPTS.out || join(CACHE_DIR, `champion-${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify({
        when: new Date().toISOString(),
        source: resultsPath,
        playoff,
        confirmation: conf,
        confirmed,
        championShard: winner.shard,
        champion: winner.w,
    }, null, 2));

    console.log('[runner] --- confirm verdict ---');
    if (confirmed) {
        // A ready-to-paste browser-console line, so applying the champion is
        // copy file → paste in console → reload, nothing to hand-assemble.
        const applyPath = join(CACHE_DIR, 'apply-champion.txt');
        writeFileSync(applyPath,
            `// Paste this whole line into the game's browser console, then reload the page:\n` +
            `localStorage.setItem('godaigo_bot_weights', ${JSON.stringify(JSON.stringify(winner.w))});\n`);
        console.log(`[runner] CONFIRMED: shard ${winner.shard}'s champion beat the baseline ` +
            `(${conf.aWins}-${conf.bWins}, ${conf.draws} draws; fitness ${conf.aFitness.toFixed(2)} vs ${conf.bFitness.toFixed(2)}).`);
        console.log(`[runner] full details written to ${outPath}`);
        console.log('[runner] TO APPLY IT:');
        console.log(`[runner]   1. open ${applyPath}`);
        console.log('[runner]   2. copy the localStorage line, paste it into the game\'s browser console (F12), press Enter');
        console.log('[runner]   3. reload the game — bot.js loads the new weights automatically');
    } else {
        console.log(`[runner] NOT confirmed: baseline held (${conf.aWins}-${conf.bWins}, ${conf.draws} draws; ` +
            `fitness ${conf.aFitness.toFixed(2)} vs ${conf.bFitness.toFixed(2)}). Keep the current weights.`);
        console.log(`[runner] details written to ${outPath}`);
    }
}

// ---------------------------------------------------------------- hillclimb mode
// Champion-anchored (1+λ) monotonic climber, parallelized across the page pool.
// Node holds the champion; each round it spawns λ mutant challengers, dispatches
// their N-game trials-vs-champion across pages (runSeriesPool), then promotes the
// best ONLY if it clears the win-rate margin — so the champion can only go up.
// This mirrors BotArena.hillClimb() (in-page) but fans the trials across cores;
// the per-page trial is just the existing BotArena.run(challenger, champion).
async function runHillClimb(browser, url) {
    const N = OPTS.hcGames, lambda = OPTS.hcLambda, minDecided = Math.ceil(N / 2);
    const seedPath = typeof OPTS.hillclimb === 'string' ? OPTS.hillclimb : null;

    // Champion to improve on: a seed file if given, else whatever the page
    // currently plays (deployed defaults + Supabase champion if reachable).
    let champion;
    if (seedPath) {
        const j = JSON.parse(readFileSync(seedPath, 'utf8'));
        champion = j.champion || j; // champion-*.json has .champion; a bare weights file is itself
        console.log(`[runner] hillclimb: seeding champion from ${seedPath}`);
    } else {
        const p = await bootGamePage(browser, url, 'baseline');
        champion = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 1500)); return { ...window.BotSystem.WEIGHTS }; });
        await p.context().close();
        console.log('[runner] hillclimb: seeding champion from the page\'s current weights');
    }
    const baseline = { ...champion }; // round-0 reference for the final confirm

    const rng = mulberry32(OPTS.seed);
    let sigma = OPTS.hcSigma, promotions = 0, gamesPlayed = 0;
    const pool = Math.min(OPTS.shards, lambda);
    console.log(`[runner] hillclimb: ${OPTS.hcRounds} rounds × ${lambda} challengers × ${N} games ` +
        `(pool ${pool} page(s)), promote ≥ ${Math.round(OPTS.hcPromote * 100)}% of decided`);

    const t0 = Date.now();
    mkdirSync(CACHE_DIR, { recursive: true });
    const outPath = OPTS.out || join(CACHE_DIR, `hillclimb-${Date.now()}.json`);
    const roundLog = [];
    // Checkpoint after every round so a watchdog timeout / crash / Ctrl-C never
    // throws away hours of climbing — the current best champion is always on
    // disk at `outPath`, recoverable even if the run never reaches its verdict.
    function writeCheckpoint(status, extra = {}) {
        writeFileSync(outPath, JSON.stringify({
            when: new Date().toISOString(), status,
            rounds: OPTS.hcRounds, roundsDone: roundLog.length, lambda, gamesPerChallenge: N,
            promoteWinRate: OPTS.hcPromote, confirmGames: OPTS.hcConfirm, confirmMargin: OPTS.hcConfirmMargin,
            promotions, gamesPlayed, minutes: +((Date.now() - t0) / 60000).toFixed(1),
            roundLog, champion, ...extra,
        }, null, 2));
    }
    for (let round = 0; round < OPTS.hcRounds; round++) {
        const challengers = Array.from({ length: lambda }, () => mutate(champion, rng, sigma));
        const tasks = challengers.map((w, i) => ({
            label: `round ${round + 1}/${OPTS.hcRounds} challenger ${i + 1}/${lambda}`,
            a: w, b: champion, games: N, seed: (OPTS.seed * 1000003 + round * 1009 + i) >>> 0, ci: i,
        }));
        const results = await runSeriesPool(browser, url, tasks);
        // Best by net wins, tie-broken by sideFitness margin.
        let best = null;
        results.forEach((r, i) => {
            gamesPlayed += r.aWins + r.bWins + r.draws;
            const net = r.aWins - r.bWins, fit = r.aFitness - r.bFitness;
            if (!best || net > best.net || (net === best.net && fit > best.fit)) {
                best = { w: challengers[tasks[i].ci], aWins: r.aWins, bWins: r.bWins, draws: r.draws, net, fit };
            }
        });
        const rDecided = best.aWins + best.bWins;
        const rWinRate = rDecided ? best.aWins / rDecided : 0;
        let promoted = false;
        if (rDecided >= minDecided && rWinRate >= OPTS.hcPromote) {
            champion = best.w; promotions++; promoted = true; sigma = OPTS.hcSigma; // found a step up — reset the radius
            console.log(`[runner] round ${round + 1}: PROMOTED (${best.aWins}-${best.bWins}, ` +
                `${Math.round(rWinRate * 100)}% of ${rDecided} decided) — new champion #${promotions}`);
        } else {
            const prev = sigma; sigma = Math.min(0.8, sigma * 1.5); // barren — widen the search
            console.log(`[runner] round ${round + 1}: held (best ${best.aWins}-${best.bWins}, ` +
                `${Math.round(rWinRate * 100)}% of ${rDecided}) — sigma ${prev.toFixed(2)}→${sigma.toFixed(2)}`);
        }
        roundLog.push({ round: round + 1, promoted, best: `${best.aWins}-${best.bWins}`,
            winRate: +rWinRate.toFixed(3), decided: rDecided, sigma: +sigma.toFixed(3), promotions });
        writeCheckpoint('in-progress'); // hours of work survive a timeout/crash from here on
    }
    const minutes = ((Date.now() - t0) / 60000).toFixed(1);

    // Honest final check vs the champion we started from. Require a real
    // MARGIN — the climbed champion must win a supermajority of the DECIDED
    // games (hcConfirmMargin), not merely edge out a higher fitness. A bare
    // `aFitness > bFitness` stamps "IMPROVED" on a 5-5 / 2.64-vs-2.58 coin
    // flip, which is exactly the leaky-gate problem hillClimb exists to avoid.
    let conf = null, improved = false, winRate = 0, decided = 0;
    if (promotions === 0) {
        console.log('[runner] hillclimb: no challenger ever beat the champion — nothing changed.');
    } else {
        console.log(`[runner] hillclimb: final confirmation vs the starting champion (${OPTS.hcConfirm} games)…`);
        [conf] = await runSeriesPool(browser, url, [{
            label: 'final confirm vs starting champion', a: champion, b: baseline, games: OPTS.hcConfirm, seed: OPTS.seed + 900_001,
        }]);
        decided = conf.aWins + conf.bWins;
        winRate = decided ? conf.aWins / decided : 0;
        improved = decided >= Math.ceil(OPTS.hcConfirm / 2) && winRate >= OPTS.hcConfirmMargin;
    }

    writeCheckpoint('complete', { finalConfirm: conf, finalWinRate: +winRate.toFixed(3), improved });

    const marginPct = Math.round(OPTS.hcConfirmMargin * 100);
    console.log('[runner] --- hillclimb verdict ---');
    console.log(`[runner] ${promotions} promotion(s) over ${OPTS.hcRounds} rounds, ${gamesPlayed} games, ${minutes} min.`);
    if (improved) {
        const applyPath = join(CACHE_DIR, 'apply-champion.txt');
        writeFileSync(applyPath,
            `// Paste this whole line into the game's browser console, then reload the page:\n` +
            `localStorage.setItem('godaigo_bot_weights', ${JSON.stringify(JSON.stringify(champion))});\n`);
        console.log(`[runner] IMPROVED: climbed champion beat the starting one ${conf.aWins}-${conf.bWins} ` +
            `(${Math.round(winRate * 100)}% of ${decided} decided ≥ ${marginPct}% margin; fitness ${conf.aFitness.toFixed(2)} vs ${conf.bFitness.toFixed(2)}).`);
        console.log(`[runner] champion written to ${outPath}`);
        console.log('[runner] TO APPLY IT:');
        console.log(`[runner]   1. open ${applyPath}`);
        console.log('[runner]   2. paste the localStorage line into the game console (F12), press Enter');
        console.log('[runner]   3. reload the game — bot.js loads the new weights automatically');
    } else if (promotions > 0) {
        console.log(`[runner] TOO CLOSE TO CALL: ${conf.aWins}-${conf.bWins} ` +
            `(${Math.round(winRate * 100)}% of ${decided} decided, need ≥ ${marginPct}%). Within noise — do NOT ship this.`);
        console.log(`[runner] Details in ${outPath}. Try more --hc-rounds / --hc-games, a larger --hc-confirm, or the Phase-2 gauntlet.`);
    } else {
        console.log(`[runner] no change — no challenger ever beat the champion. Details in ${outPath}.`);
    }
}

// ---------------------------------------------------------------- main
async function main() {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/index.html`;
    console.log(`[runner] serving ${ROOT} at ${url}`);

    const browser = await chromium.launch({ headless: !OPTS.headed });
    const watchdog = setTimeout(() => {
        console.error(`[runner] watchdog: exceeded ${OPTS.timeoutMs / 60000} min — aborting.`);
        browser.close().finally(() => process.exit(1));
    }, OPTS.timeoutMs);

    try {
        if (OPTS.hillclimb) await runHillClimb(browser, url);
        else if (OPTS.confirm) await runConfirm(browser, url);
        else if (OPTS.evolve) await runEvolve(browser, url);
        else await runSmoke(browser, url);
    } finally {
        clearTimeout(watchdog);
        await browser.close();
        server.close();
    }
}

main().catch(e => { console.error(e); process.exit(1); });
