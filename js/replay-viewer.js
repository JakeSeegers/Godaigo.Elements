// replay-viewer.js: plays back a recorded online game (Phase 3, step 2).
//
// How it works: a replay is the recorded stream of game messages
// (match_moves, see match-recorder.js) fed back into the game's OWN receive
// handlers, so the board updates exactly as it did for the players, with no
// separate copy of the game rules (bot-sim.js is not used).
//
//   1. Fetch the match with get_match_replay (sql/replay-access.sql).
//   2. Switch Supabase to "offline": channel() returns a fake channel, and
//      from()/rpc() return empty results, so nothing is ever sent or saved.
//   3. Start the game the normal way (startMultiplayerGame) from the recorded
//      seats + deck seed. setupGameBroadcast() registers its handlers on the
//      fake channel.
//   4. Set myPlayerIndex to SPECTATOR (a seat nobody has), so every handler
//      treats every recorded move as "someone else's" and applies it.
//   5. Dispatch the moves in order, timed like the real game (long pauses
//      are shortened), with play / pause / speed / step controls.
// Leaving the replay reloads the page, which restores everything.
//
// Players open it from the lobby "Replays" button (openBrowser below): their
// own games, and games other players posted publicly.
(function () {
    const SPECTATOR = -1;
    const MAX_GAP_MS = 1500;      // longest pause between moves at 1x speed
    // Messages a spectator must not act on: prompts meant for a real player,
    // requests to other players, and the placement-timeout reset.
    const SKIP_EVENTS = new Set([
        'response-window-opened',
        'scroll-state-sync-request',
        'take-flight-choose-request',
        'take-flight-cancel-request',
        'game-reset',
    ]);

    let state = null; // { match, moves, index, playing, speed, timer, handlers }

    function log(...a) { console.log('[replay]', ...a); }

    // ── Offline Supabase ─────────────────────────────────────────
    function makeFakeChannel(handlers) {
        const ch = {
            on(type, filter, cb) {
                if (type === 'broadcast') handlers.push({ event: filter?.event, cb });
                return ch;
            },
            subscribe() { return ch; },
            unsubscribe() { return Promise.resolve('ok'); },
            send() { return Promise.resolve('ok'); },
            track() { return Promise.resolve('ok'); },
            untrack() { return Promise.resolve('ok'); },
            presenceState() { return {}; },
        };
        return ch;
    }

    function goOffline(handlers) {
        const empty = { data: null, error: null, count: 0 };
        const builder = new Proxy(function () {}, {
            get(_t, prop) {
                if (prop === 'then') return (res) => Promise.resolve(empty).then(res);
                if (prop === 'catch' || prop === 'finally') return () => builder;
                return () => builder;
            },
            apply() { return builder; },
        });
        supabase.channel = () => makeFakeChannel(handlers);
        supabase.from = () => builder;
        supabase.rpc = () => Promise.resolve(empty);
        try { supabase.removeChannel = () => Promise.resolve('ok'); } catch (e) {}
    }

    // ── Controls ─────────────────────────────────────────────────
    function buildControls() {
        document.getElementById('replay-controls')?.remove();
        const bar = document.createElement('div');
        bar.id = 'replay-controls';
        bar.innerHTML = `
            <span class="replay-title"></span>
            <button data-act="play">Pause</button>
            <button data-act="step">Step</button>
            <select data-act="speed">
                <option value="0.5">0.5x</option>
                <option value="1" selected>1x</option>
                <option value="2">2x</option>
                <option value="4">4x</option>
                <option value="8">8x</option>
            </select>
            <span class="replay-progress"></span>
            <button data-act="restart">Restart</button>
            <button data-act="exit">Exit replay</button>`;
        document.body.appendChild(bar);
        bar.querySelector('[data-act=play]').onclick = () => (state.playing ? pause() : play());
        bar.querySelector('[data-act=step]').onclick = () => { pause(); step(); };
        bar.querySelector('[data-act=speed]').onchange = (e) => { state.speed = +e.target.value || 1; };
        bar.querySelector('[data-act=restart]').onclick = () => {
            const id = state.match.id;
            try { sessionStorage.setItem('godaigo_replay_autostart', String(id)); } catch (e) {}
            location.reload();
        };
        bar.querySelector('[data-act=exit]').onclick = () => location.reload();
        updateControls();
    }

    function updateControls() {
        const bar = document.getElementById('replay-controls');
        if (!bar || !state) return;
        const names = (state.match.players || []).map(p => p.username).join(' vs ');
        bar.querySelector('.replay-title').textContent = `Replay #${state.match.id}: ${names}`;
        bar.querySelector('.replay-progress').textContent =
            state.index >= state.moves.length ? 'End of game' : `Move ${state.index} / ${state.moves.length}`;
        bar.querySelector('[data-act=play]').textContent = state.playing ? 'Pause' : 'Play';
    }

    // ── Playback ─────────────────────────────────────────────────
    function dispatch(move) {
        if (SKIP_EVENTS.has(move.event)) return;
        const msg = { type: 'broadcast', event: move.event, payload: move.payload || {} };
        for (const h of state.handlers) {
            if (h.event !== move.event && h.event !== '*') continue;
            try { h.cb(msg); } catch (e) {
                console.warn(`[replay] handler for ${move.event} failed:`, e);
                state.errors.push(`${move.event}: ${e?.message || e}`);
            }
        }
    }

    function step() {
        if (!state || state.index >= state.moves.length) { pause(); updateControls(); return false; }
        dispatch(state.moves[state.index]);
        state.index++;
        updateControls();
        return true;
    }

    function scheduleNext() {
        clearTimeout(state.timer);
        if (!state.playing || state.index >= state.moves.length) { state.playing = false; updateControls(); return; }
        const prev = state.moves[state.index - 1];
        const next = state.moves[state.index];
        const gap = prev ? Math.min(MAX_GAP_MS, Math.max(0, (next.t || 0) - (prev.t || 0))) : 0;
        state.timer = setTimeout(() => { if (step()) scheduleNext(); }, gap / state.speed);
    }

    function play() { if (!state) return; state.playing = true; updateControls(); scheduleNext(); }
    function pause() { if (!state) return; state.playing = false; clearTimeout(state.timer); updateControls(); }

    // ── Entry point ──────────────────────────────────────────────
    // opts.check: used by the replay check (runCheck below): no controls, no
    // autoplay, errors are thrown instead of shown.
    async function open(matchId, opts = {}) {
        if (state) { console.warn('[replay] already running; reload to start another'); return; }
        const { data: match, error } = await supabase.rpc('get_match_replay', { p_match_id: matchId });
        if (error || !match) {
            if (opts.check) throw new Error('could not load: ' + (error?.message || 'not found'));
            alert('Could not load this replay: ' + (error?.message || 'not found'));
            return;
        }
        const seats = (match.seats || []).slice().sort((a, b) => a.index - b.index);
        if (!seats.length) { alert('This replay has no players recorded.'); return; }
        log(`match ${match.id}: ${match.moves.length} moves, ${seats.length} seats`);

        // Name colours and pawn decorations of the recorded players: load them
        // while the server is still reachable (the replay goes offline next).
        try { await window.cosmeticsSystem?.loadNameColors(seats.map(x => x.user_id)); } catch (e) {}

        const handlers = [];
        goOffline(handlers);

        // Start the game the normal way, seen from the first seat...
        const allPlayers = seats.map(s => ({
            id: 'replay-seat-' + s.index,
            player_index: s.index,
            color: s.color,
            username: s.username,
            user_id: s.user_id || null,
        }));
        isMultiplayer = true;
        isHost = false;
        currentGameId = 'replay-' + match.id;
        myPlayerId = allPlayers[0].id;
        myPlayerIndex = allPlayers[0].player_index;

        document.getElementById('lobby-wrapper').style.display = 'none';
        document.getElementById('multiplayer-lobby')?.style && (document.getElementById('multiplayer-lobby').style.display = 'none');
        document.getElementById('game-layout').classList.add('active');
        if (typeof updateDeckIndicatorVisibility === 'function') updateDeckIndicatorVisibility();
        if (typeof initializeNewUI === 'function') initializeNewUI();
        // The game start asks about sharing game logs; a replay must not.
        window.promptLogConsentIfNeeded = () => {};
        startMultiplayerGame(allPlayers, match.deck_seed, match.settings?.scarce_tiles !== false);

        // ...then become a pure spectator: no seat, nothing to drag.
        myPlayerIndex = SPECTATOR;
        const tray = document.getElementById('new-player-tile-deck') || document.getElementById('player-tile-deck');
        if (tray) tray.innerHTML = '';
        ['end-turn', 'leave-game'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        if (typeof updateStatus === 'function') updateStatus('Watching a replay');

        state = { match, moves: match.moves || [], index: 0, playing: false, speed: 1, timer: null, handlers, errors: [] };
        if (opts.check) return;
        buildControls();
        setTimeout(play, 1500); // let the board finish its intro animation
    }

    // ── Replay check (hermit) ────────────────────────────────────
    // Anti-cheat plan part 2: replay a finished match at full speed, take the
    // same board fingerprint the players' browsers took at each turn change
    // (MatchWitness.fingerprint), and look at the winner on the replayed
    // board. Runs inside a hidden iframe (index.html?replaycheck=ID) so each
    // match gets a fresh page; the result is posted to the parent window,
    // which compares it with the reported fingerprints (checkMatch below).
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function runCheck(matchId) {
        await open(matchId, { check: true });
        if (!state) throw new Error('replay did not start');
        await sleep(300);
        const fps = {};
        let last = currentTurnNumber;
        while (step()) {
            // Some handlers finish on a short timer; give them a moment, like
            // the real game's 100 ms fingerprint watcher.
            await sleep(25);
            if (currentTurnNumber !== last) {
                last = currentTurnNumber;
                if (!(last in fps)) fps[last] = window.MatchWitness?.fingerprint() || null;
            }
        }
        await sleep(1500);
        const w = state.match.winner_index;
        let activated = [], atShrine = null;
        if (typeof w === 'number') {
            try { activated = [...(spellSystem.playerScrolls?.[w]?.activated || [])].sort(); } catch (e) {}
            try { atShrine = !!isPlayerAtOwnShrine(w); } catch (e) {}
        }
        return {
            fps,
            moves: state.moves.length,
            errorCount: state.errors.length,
            errors: state.errors.slice(0, 10),
            final: { winner: w, winType: state.match.win_type, activated, atShrine },
        };
    }

    // Parent side: run one match in a hidden iframe and wait for its result.
    function runInFrame(matchId, timeoutMs = 180000) {
        return new Promise((resolve) => {
            const frame = document.createElement('iframe');
            frame.style.cssText = 'position:fixed;left:-4000px;top:0;width:1400px;height:900px;border:0;';
            frame.setAttribute('aria-hidden', 'true');
            const done = (result) => {
                clearTimeout(timer);
                window.removeEventListener('message', onMsg);
                frame.remove();
                resolve(result);
            };
            const onMsg = (ev) => {
                if (ev.origin !== location.origin || ev.source !== frame.contentWindow) return;
                if (ev.data?.type === 'godaigo-replay-check' && ev.data.matchId === matchId) done(ev.data);
            };
            const timer = setTimeout(() => done({ error: 'timed out' }), timeoutMs);
            window.addEventListener('message', onMsg);
            // The folder URL, not index.html: some servers redirect index.html
            // to the folder and drop the query string.
            frame.src = new URL('.', location.href).pathname + '?replaycheck=' + encodeURIComponent(matchId);
            document.body.appendChild(frame);
        });
    }

    const PARTS = ['tiles', 'stones', 'pawns', 'activated'];

    // Compare the replay with the reported fingerprints and store the result
    // on the match (save_match_check). Turn 1 is skipped: players' browsers
    // take it in the middle of the opening tile placement.
    async function checkMatch(matchId) {
        const run = await runInFrame(matchId);
        let status, detail;
        if (run.error || !run.result) {
            status = 'error';
            detail = { error: run.error || 'no result' };
        } else {
            const r = run.result;
            const { data: reported } = await supabase.rpc('get_match_fingerprints', { p_match_id: matchId });
            const mismatches = [];
            let compared = 0, skippedFormat = 0;
            for (const f of (reported || [])) {
                if (!(f.turn > 1)) continue;
                if (!f.fp || f.fp.length !== 32) { skippedFormat++; continue; }
                const mine = r.fps[f.turn];
                compared++;
                if (mine === f.fp) continue;
                mismatches.push({
                    turn: f.turn, seat: f.seat,
                    parts: mine ? PARTS.filter((_, i) => mine.slice(i * 8, i * 8 + 8) !== f.fp.slice(i * 8, i * 8 + 8)) : ['missing'],
                });
            }
            // The recorded winner must have won on the replayed board too.
            const fin = r.final || {};
            const scrollWin = typeof fin.winner === 'number' && (!fin.winType || fin.winType === 'scrolls');
            const winnerOk = !scrollWin || ((fin.activated || []).length >= 5 && fin.atShrine === true);
            status = mismatches.length || !winnerOk ? 'mismatch'
                   : compared ? 'ok'
                   : 'no_data';
            detail = {
                compared, skippedFormat, mismatches: mismatches.slice(0, 30),
                firstMismatchTurn: mismatches.length ? Math.min(...mismatches.map(m => m.turn)) : null,
                winnerOk, final: fin, moves: r.moves, replayErrors: r.errorCount, errors: r.errors,
            };
        }
        const { error } = await supabase.rpc('save_match_check', { p_match_id: matchId, p_status: status, p_detail: detail });
        if (error) console.warn('[replay-check] save failed:', error.message);
        log(`check ${matchId}: ${status}`, detail);
        return { status, detail };
    }

    // Inside the iframe: index.html?replaycheck=ID runs the check and reports.
    async function frameEntry() {
        const id = +new URLSearchParams(location.search).get('replaycheck');
        if (!id || window.parent === window) return;
        const post = (payload) => window.parent.postMessage({ type: 'godaigo-replay-check', matchId: id, ...payload }, location.origin);
        try {
            ['boot-splash', 'lore-intro'].forEach(x => document.getElementById(x)?.remove());
            document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) {} });
            // Wait for sign-in and the lobby start-up, so nothing resets the
            // game after the replay has started.
            for (let i = 0; i < 60; i++) {
                const { data } = await supabase.auth.getSession();
                if (data?.session && window.gami?.userId) break;
                await sleep(500);
            }
            await sleep(1500);
            post({ result: await runCheck(id) });
        } catch (e) {
            post({ error: String(e?.message || e) });
        }
    }
    if (new URLSearchParams(location.search).has('replaycheck')) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', frameEntry);
        else frameEntry();
    }

    // "Restart" reloads the page and reopens the same replay once it's ready.
    function autostart() {
        let id = null;
        try { id = sessionStorage.getItem('godaigo_replay_autostart'); sessionStorage.removeItem('godaigo_replay_autostart'); } catch (e) {}
        if (!id) return;
        const wait = setInterval(async () => {
            const { data } = await supabase.auth.getSession();
            if (!data?.session) return;
            clearInterval(wait);
            open(+id);
        }, 1000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autostart);
    else autostart();

    // ── Replay browser (lobby "Replays" button) ─────────────────
    // Two lists: my finished games (with Watch + Post publicly / Remove from
    // public) and games other players posted (Watch). Data comes from
    // list_my_matches / list_public_matches (sql/replay-access.sql).
    let browserTab = 'mine';

    function esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function fmtDuration(sec) {
        if (!(sec > 0)) return '';
        const m = Math.floor(sec / 60), s = sec % 60;
        return m ? `${m} min` : `${s} s`;
    }

    function fmtWhen(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch (e) { return ''; }
    }

    function rowHtml(m, mine) {
        const players = (m.players || []).slice().sort((a, b) => a.index - b.index).map(p => {
            const won = m.winner_index === p.index;
            return `<span class="replay-player${won ? ' won' : ''}" style="--pc:${esc(p.color)}">${won ? '👑 ' : ''}${esc(p.username)}</span>`;
        }).join('<span class="replay-vs">vs</span>');
        const info = [fmtWhen(m.started_at), fmtDuration(m.duration_s),
                      m.status === 'abandoned' ? 'not finished' : ''].filter(Boolean).join(' · ');
        const post = mine
            ? `<button class="replay-post" data-id="${m.id}" data-public="${m.is_public ? 1 : 0}">${m.is_public ? 'Remove from public' : 'Post publicly'}</button>`
            : '';
        return `
            <div class="replay-row">
                <div class="replay-row-main">
                    <div class="replay-players">${players}</div>
                    <div class="replay-info">${esc(info)}${mine && m.is_public ? ' · <b>public</b>' : ''}</div>
                </div>
                <div class="replay-row-actions">
                    <button class="replay-watch" data-id="${m.id}">Watch</button>
                    ${post}
                </div>
            </div>`;
    }

    // Hermit "Check" tab: replay verification status per match.
    function checkSummary(m) {
        const d = m.check_detail || {};
        if (!m.check_status) return 'not checked';
        if (m.check_status === 'ok') return `ok (${d.compared} turns match)`;
        if (m.check_status === 'no_data') return `no fingerprints to compare${d.skippedFormat ? ` (${d.skippedFormat} old format)` : ''}${d.winnerOk === false ? ', winner NOT confirmed' : ''}`;
        if (m.check_status === 'error') return 'error: ' + (d.error || 'unknown');
        const parts = [...new Set((d.mismatches || []).flatMap(x => x.parts))].join(', ');
        return [d.firstMismatchTurn ? `differs from turn ${d.firstMismatchTurn} (${parts})` : '',
                d.winnerOk === false ? 'winner NOT confirmed on the replayed board' : ''].filter(Boolean).join('; ');
    }

    function checkRowHtml(m) {
        const players = (m.players || []).slice().sort((a, b) => a.index - b.index)
            .map(p => `${m.winner_index === p.index ? '👑 ' : ''}${esc(p.username)}`).join(' vs ');
        const flags = [m.desync_count ? `${m.desync_count} desync reports` : '', m.disputed ? 'disputed' : ''].filter(Boolean).join(' · ');
        return `
            <div class="replay-row">
                <div class="replay-row-main">
                    <div class="replay-players">#${m.id} ${players}</div>
                    <div class="replay-info">${esc([fmtWhen(m.started_at), fmtDuration(m.duration_s), flags].filter(Boolean).join(' · '))}</div>
                    <div class="replay-check replay-check-${esc(m.check_status || 'none')}">${esc(checkSummary(m))}</div>
                </div>
                <div class="replay-row-actions">
                    <button class="replay-watch" data-id="${m.id}">Watch</button>
                    <button class="replay-run-check" data-id="${m.id}">Check</button>
                </div>
            </div>`;
    }

    // Hermit "Players" tab (Phase 4): one row per player from
    // hermit_player_overview (sql/hermit-players.sql), most suspicious first.
    // "Games" opens that player's games with Watch / Check.
    let playerDays = 30;

    function playerRowHtml(pl) {
        const nameStyle = pl.name_color ? (window.cosmeticsSystem?.getNameColorStyle(pl.name_color) || '') : '';
        const rate = pl.games ? Math.round(100 * pl.wins / pl.games) : 0;
        const stats = [`${pl.games} games`, `${pl.wins} wins (${rate}%)`,
            pl.fastest_win_s ? `fastest win ${fmtDuration(pl.fastest_win_s)}` : '',
            pl.last_standing_wins ? `${pl.last_standing_wins} last-standing` : '',
            pl.abandoned ? `${pl.abandoned} unfinished` : '',
            pl.top_opponent && pl.top_opponent_wins ? `most wins vs ${pl.top_opponent} (${pl.top_opponent_wins})` : '',
            `${pl.checked_games}/${pl.games} checked`].filter(Boolean).join(' · ');
        const flags = (pl.flags || []).map(f => `<li>${esc(f)}</li>`).join('');
        return `
            <div class="replay-player-block" data-user="${esc(pl.user_id)}">
                <div class="replay-row">
                    <div class="replay-row-main">
                        <div class="replay-players"><span class="replay-score${pl.score >= 4 ? ' high' : pl.score > 0 ? ' some' : ''}">${pl.score}</span>
                            <span style="${nameStyle}">${esc(pl.name)}</span></div>
                        <div class="replay-info">${esc(stats)}</div>
                        ${flags ? `<ul class="replay-flags">${flags}</ul>` : ''}
                    </div>
                    <div class="replay-row-actions">
                        <button class="replay-player-games" data-user="${esc(pl.user_id)}">Games</button>
                    </div>
                </div>
                <div class="replay-player-matches"></div>
            </div>`;
    }

    async function togglePlayerGames(userId, btn) {
        const block = btn.closest('.replay-player-block');
        const box = block?.querySelector('.replay-player-matches');
        if (!box) return;
        if (box.innerHTML) { box.innerHTML = ''; btn.textContent = 'Games'; return; }
        box.innerHTML = '<div class="replay-empty">Loading...</div>';
        const { data, error } = await supabase.rpc('hermit_player_matches', { p_user: userId, p_limit: 30 });
        if (error) { box.innerHTML = `<div class="replay-empty">Could not load: ${esc(error.message)}</div>`; return; }
        const rows = Array.isArray(data) ? data : [];
        checkRows = rows.concat(checkRows.filter(r => !rows.some(x => x.id === r.id)));
        box.innerHTML = rows.map(checkRowHtml).join('') || '<div class="replay-empty">No games.</div>';
        btn.textContent = 'Hide games';
    }

    let checkRows = [];
    let checking = false;

    async function runChecks(ids) {
        if (checking) return;
        checking = true;
        const status = document.querySelector('#replay-browser .replay-check-progress');
        try {
            for (let i = 0; i < ids.length; i++) {
                if (status) status.textContent = `Checking #${ids[i]} (${i + 1} of ${ids.length})...`;
                await checkMatch(ids[i]);
            }
        } finally {
            checking = false;
            if (status) status.textContent = '';
            if (browserTab === 'check') renderList();
        }
    }

    async function renderList() {
        const overlay = document.getElementById('replay-browser');
        if (!overlay) return;
        overlay.querySelectorAll('.replay-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === browserTab));
        const list = overlay.querySelector('.replay-list');
        list.innerHTML = '<div class="replay-empty">Loading...</div>';
        if (browserTab === 'players') {
            const { data, error } = await supabase.rpc('hermit_player_overview', { p_days: playerDays });
            if (browserTab !== 'players') return;
            if (error) { list.innerHTML = `<div class="replay-empty">Could not load: ${esc(error.message)}</div>`; return; }
            const rows = Array.isArray(data) ? data : [];
            list.innerHTML = `
                <div class="replay-check-bar">
                    <label>Last <select class="replay-player-days">
                        ${[7, 30, 90].map(d => `<option value="${d}"${d === playerDays ? ' selected' : ''}>${d} days</option>`).join('')}
                    </select></label>
                </div>
                <div class="replay-note">Built only from server records of online games. The number is a warning score: replay-unconfirmed and disputed wins count most, then very fast wins, most wins against one player, waiting wins and out-of-sync games. A score is a reason to watch the games, not proof.</div>
                ${rows.map(playerRowHtml).join('') || '<div class="replay-empty">No online games in this period.</div>'}`;
            const sel = list.querySelector('.replay-player-days');
            if (sel) sel.onchange = () => { playerDays = +sel.value || 30; renderList(); };
            return;
        }
        if (browserTab === 'check') {
            const { data, error } = await supabase.rpc('list_matches_for_check', { p_limit: 50 });
            if (browserTab !== 'check') return;
            if (error) { list.innerHTML = `<div class="replay-empty">Could not load: ${esc(error.message)}</div>`; return; }
            checkRows = Array.isArray(data) ? data : [];
            list.innerHTML = `
                <div class="replay-check-bar">
                    <button class="replay-check-all">Check all unchecked</button>
                    <span class="replay-check-progress">${checking ? 'Checking...' : ''}</span>
                </div>
                <div class="replay-note">Replays each game in a hidden frame and compares its board, turn by turn, with the fingerprints the players' browsers reported. Also checks the winner on the replayed board.</div>
                ${checkRows.map(checkRowHtml).join('') || '<div class="replay-empty">No finished games.</div>'}`;
            return;
        }
        const mine = browserTab === 'mine';
        const { data, error } = await supabase.rpc(mine ? 'list_my_matches' : 'list_public_matches', { p_limit: 30 });
        if (!document.getElementById('replay-browser') || (browserTab === 'mine') !== mine) return;
        if (error) { list.innerHTML = `<div class="replay-empty">Could not load games: ${esc(error.message)}</div>`; return; }
        const rows = Array.isArray(data) ? data : [];
        list.innerHTML = rows.length
            ? rows.map(m => rowHtml(m, mine)).join('')
            : `<div class="replay-empty">${mine
                ? 'No games yet. Your online games show up here when they end.'
                : 'Nobody has posted a game yet. Post one of yours from "My games".'}</div>`;
    }

    function openBrowser(tab) {
        document.getElementById('replay-browser')?.remove();
        if (tab) browserTab = tab;
        const overlay = document.createElement('div');
        overlay.id = 'replay-browser';
        overlay.innerHTML = `
            <div class="replay-modal" role="dialog" aria-label="Replays">
                <div class="replay-modal-title">Replays</div>
                <div class="replay-tabs">
                    <button class="replay-tab" data-tab="mine">My games</button>
                    <button class="replay-tab" data-tab="public">Public</button>
                    ${window.isHermit?.() ? '<button class="replay-tab" data-tab="check">Check</button><button class="replay-tab" data-tab="players">Players</button>' : ''}
                </div>
                <div class="replay-list"></div>
                <div class="replay-note">Games are kept for 30 days. Posted games are kept until you remove them. Posting shows the whole game, with every player's name, to everyone.</div>
                <button class="replay-close">Close</button>
            </div>`;
        overlay.addEventListener('click', async (ev) => {
            const t = ev.target;
            if (t === overlay || t.classList.contains('replay-close')) {
                if (checking) return; // closing would drop the running check's frame results
                overlay.remove(); return;
            }
            if (t.classList.contains('replay-tab')) { browserTab = t.dataset.tab; renderList(); return; }
            if (t.classList.contains('replay-watch')) {
                t.disabled = true; t.textContent = 'Loading...';
                overlay.remove();
                open(+t.dataset.id);
                return;
            }
            if (t.classList.contains('replay-run-check')) { runChecks([+t.dataset.id]); return; }
            if (t.classList.contains('replay-player-games')) { togglePlayerGames(t.dataset.user, t); return; }
            if (t.classList.contains('replay-check-all')) {
                runChecks(checkRows.filter(m => !m.check_status).map(m => m.id));
                return;
            }
            if (t.classList.contains('replay-post')) {
                const makePublic = t.dataset.public !== '1';
                if (makePublic && !confirm('Post this game publicly? Everyone will be able to watch it, with every player\'s name.')) return;
                t.disabled = true;
                const { error } = await supabase.rpc('set_match_public', { p_match_id: +t.dataset.id, p_public: makePublic });
                if (error) { alert('Could not change this game: ' + error.message); t.disabled = false; return; }
                renderList();
            }
        });
        document.body.appendChild(overlay);
        renderList();
    }

    window.Replay = { open, openBrowser, checkMatch, runCheck, play, pause, step, get state() { return state; } };
})();
