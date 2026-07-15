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
// Options (both modes unless noted):
//   --seed N            base RNG seed (default 1)
//   --players N         players per game, 2-5 (default 2)
//   --speed X           BotSystem.speedScale (default 0.1, arena normal)
//   --timeout M         watchdog: kill everything after M minutes (default 120)
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
    timeoutMs: +arg('timeout', 120) * 60_000,
    headed: !!arg('headed', false),
    verbose: !!arg('verbose', false),
    shards: +arg('shards', 4),
    generations: +arg('generations', 3),
    pop: +arg('pop', 6),
    gamesPerPair: +arg('games-per-pair', 1),
    out: arg('out', null),
};

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
        if (OPTS.confirm) await runConfirm(browser, url);
        else if (OPTS.evolve) await runEvolve(browser, url);
        else await runSmoke(browser, url);
    } finally {
        clearTimeout(watchdog);
        await browser.close();
        server.close();
    }
}

main().catch(e => { console.error(e); process.exit(1); });
