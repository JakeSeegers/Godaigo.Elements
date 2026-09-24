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
            try { h.cb(msg); } catch (e) { console.warn(`[replay] handler for ${move.event} failed:`, e); }
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
    async function open(matchId) {
        if (state) { console.warn('[replay] already running; reload to start another'); return; }
        const { data: match, error } = await supabase.rpc('get_match_replay', { p_match_id: matchId });
        if (error || !match) { alert('Could not load this replay: ' + (error?.message || 'not found')); return; }
        const seats = (match.seats || []).slice().sort((a, b) => a.index - b.index);
        if (!seats.length) { alert('This replay has no players recorded.'); return; }
        log(`match ${match.id}: ${match.moves.length} moves, ${seats.length} seats`);

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

        state = { match, moves: match.moves || [], index: 0, playing: false, speed: 1, timer: null, handlers };
        buildControls();
        setTimeout(play, 1500); // let the board finish its intro animation
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

    async function renderList() {
        const overlay = document.getElementById('replay-browser');
        if (!overlay) return;
        overlay.querySelectorAll('.replay-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === browserTab));
        const list = overlay.querySelector('.replay-list');
        list.innerHTML = '<div class="replay-empty">Loading...</div>';
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
                </div>
                <div class="replay-list"></div>
                <div class="replay-note">Games are kept for 30 days. Posted games are kept until you remove them. Posting shows the whole game, with every player's name, to everyone.</div>
                <button class="replay-close">Close</button>
            </div>`;
        overlay.addEventListener('click', async (ev) => {
            const t = ev.target;
            if (t === overlay || t.classList.contains('replay-close')) { overlay.remove(); return; }
            if (t.classList.contains('replay-tab')) { browserTab = t.dataset.tab; renderList(); return; }
            if (t.classList.contains('replay-watch')) {
                t.disabled = true; t.textContent = 'Loading...';
                overlay.remove();
                open(+t.dataset.id);
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

    window.Replay = { open, openBrowser, play, pause, step, get state() { return state; } };
})();
