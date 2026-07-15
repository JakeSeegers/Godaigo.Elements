#!/usr/bin/env node
// arena-headless.mjs — run BotArena self-play games in headless Chromium.
//
// Phase 1: single headless instance smoke-runner.
//   node tools/arena-headless.mjs --games 4 --seed 1
//
// Options:
//   --games N     games in the A-vs-B series (default 4)
//   --seed N      base RNG seed (default 1)
//   --players N   players per game, 2-5 (default 2; >2 uses playMatch groups)
//   --speed X     BotSystem.speedScale for the run (default 0.1, arena normal)
//   --timeout M   max minutes for the whole series (default 30)
//   --headed      launch a visible browser window (debugging)
//   --verbose     stream the page's [Bot]/[BotArena] console lines
//
// The game page needs supabase-js from unpkg; when that CDN is unreachable
// (offline, locked-down proxy) the script serves a cached copy from
// tools/.cache/ instead. Seed the cache once with:
//   npm pack @supabase/supabase-js@2.39.3 && tar -xzf supabase-supabase-js-2.39.3.tgz \
//     package/dist/umd/supabase.js && mv package/dist/umd/supabase.js tools/.cache/supabase.js
// (on a machine with normal network the script caches it automatically on first run).

import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
    games: +arg('games', 4),
    seed: +arg('seed', 1),
    players: +arg('players', 2),
    speed: +arg('speed', 0.1),
    timeoutMs: +arg('timeout', 30) * 60_000,
    headed: !!arg('headed', false),
    verbose: !!arg('verbose', false),
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

// ---------------------------------------------------------------- main
async function main() {
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/index.html`;
    console.log(`[runner] serving ${ROOT} at ${url}`);

    const browser = await chromium.launch({ headless: !OPTS.headed });
    const page = await browser.newPage();

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
        } catch (e) {
            console.error(`[runner] FATAL: supabase-js unreachable and no cache at ${SUPABASE_CACHE}`);
            console.error('[runner] seed the cache per the header comment, then rerun.');
            return route.abort();
        }
    });

    page.on('pageerror', e => console.error(`[page error] ${e.message}`));
    page.on('console', msg => {
        const t = msg.text();
        if (t.includes('[BotArena]') || (OPTS.verbose && (t.includes('[Bot]') || msg.type() === 'error'))) {
            console.log(`[page] ${t}`);
        }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => window.BotArena && window.BotSystem && window.BotState && window.BotSim,
        null, { timeout: 30_000 },
    );
    console.log(`[runner] game loaded; starting ${OPTS.games} game(s), seed ${OPTS.seed}, ${OPTS.players} players, speed ${OPTS.speed}`);

    const t0 = Date.now();
    const result = await page.evaluate(async ({ games, seed, players, speed }) => {
        // undefined weight tables = play with whatever WEIGHTS is currently
        // loaded (defaults, since headless has no localStorage history).
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
    }, OPTS).catch(e => ({ error: e.message }));
    const elapsed = (Date.now() - t0) / 1000;

    await browser.close();
    server.close();

    if (result && result.error) {
        console.error(`[runner] run failed: ${result.error}`);
        process.exit(1);
    }
    console.log('[runner] --- result ---');
    console.log(JSON.stringify(result, (k, v) => (k === 'games' && Array.isArray(v) && v.length > 20 ? `${v.length} games` : v), 2));
    console.log(`[runner] ${OPTS.games} game(s) in ${elapsed.toFixed(1)}s (${(elapsed / OPTS.games).toFixed(1)}s/game)`);
}

main().catch(e => { console.error(e); process.exit(1); });
