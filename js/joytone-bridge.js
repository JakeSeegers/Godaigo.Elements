(function () {
    'use strict';

    // ── Joytone Bridge ────────────────────────────────────────────────────
    // Embeds the Joytone generative-music app (joytone/index.html) in a
    // hidden same-origin iframe and drives it through its window.JoytoneAPI:
    //   • Game start  → boot: Five-Elements theme auto-plays, Grow + Drummer ON
    //   • Tile reveal → appends a seeded riff of that tile's element to the
    //     playlist (seed = gameId + tileId, so every client independently
    //     grows the SAME sequence — no extra network traffic). Each element
    //     variation can only ever be added once.
    //   • Shift+J+T   → toggles the full sequencer UI as a popup
    //   • Mute/volume → per-player, from the Settings tab (localStorage)

    const IFRAME_SRC = 'joytone/index.html';

    let iframe = null;
    let popup = null;
    let popupVisible = false;
    let gameActive = false;
    const handledTiles = new Set();   // tileIds already sent to joytone this game

    // Per-player audio prefs (never synced)
    let muted  = localStorage.getItem('godaigo_joytone_muted') === 'true';
    let volume = parseFloat(localStorage.getItem('godaigo_joytone_volume'));
    if (!(volume >= 0 && volume <= 1)) volume = 1;

    function api() {
        return iframe?.contentWindow?.JoytoneAPI || null;
    }

    // ── Iframe + popup shell ─────────────────────────────────────────────
    function buildDom() {
        popup = document.createElement('div');
        popup.id = 'joytone-popup';
        popup.style.cssText = [
            'display:none', 'position:fixed', 'inset:4vh 4vw', 'z-index:10050',
            'background:#0d0d11', 'border:1px solid #5566cc', 'border-radius:10px',
            'box-shadow:0 12px 60px rgba(0,0,0,.75)', 'overflow:hidden',
        ].join(';');

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
            'padding:6px 12px;background:#16161d;border-bottom:1px solid #2a2a35;' +
            'font:600 12px system-ui,sans-serif;color:#9fa8da';
        bar.innerHTML = '<span>🎹 Joytone — adaptive music (Shift+J+T to close)</span>';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:1px solid #444;border-radius:5px;' +
            'color:#ccc;cursor:pointer;padding:2px 9px;font-size:12px';
        closeBtn.addEventListener('click', hidePopup);
        bar.appendChild(closeBtn);

        iframe = document.createElement('iframe');
        iframe.id = 'joytone-frame';
        iframe.src = IFRAME_SRC;
        iframe.setAttribute('title', 'Joytone sequencer');
        iframe.style.cssText = 'width:100%;height:calc(100% - 31px);border:0;display:block;background:#111';

        popup.appendChild(bar);
        popup.appendChild(iframe);
        document.body.appendChild(popup);
    }

    function showPopup() {
        if (!popup) return;
        popup.style.display = 'block';
        popupVisible = true;
        api()?.onShown();
    }

    function hidePopup() {
        if (!popup) return;
        popup.style.display = 'none';
        popupVisible = false;
        api()?.onHidden();
    }

    function togglePopup() {
        popupVisible ? hidePopup() : showPopup();
    }

    // ── Game lifecycle ───────────────────────────────────────────────────
    // Suppressed = a bot job (Train Weights / Evolve / Breed) is running
    // MANY short-lived simulated games back to back — each one still hides/
    // shows #lobby-wrapper same as a real game, so without this the engine
    // would boot + start playback from scratch every single simulated game,
    // producing a stuttering mess instead of the coherent one-game
    // soundtrack this is designed around. Real gameplay (including watching
    // a single "Bot match" via spectate()) is never suppressed.
    let suppressed = false;

    async function startForGame() {
        if (gameActive) return;
        gameActive = true;
        handledTiles.clear();
        if (suppressed) return;
        const a = api();
        if (!a) return;
        a.setMute(muted);
        a.setVolume(volume);
        a.setPower?.(!muted);
        // Sync the child's per-frame animation loop to whether the popup is
        // actually on screen right now (almost always closed at game start —
        // that's the default) before boot() kicks off playback, so the
        // canvas/DOM redraw loop never spins for a view nobody can see.
        (popupVisible ? a.onShown : a.onHidden)?.();
        try { await a.boot(); } catch (e) { console.warn('Joytone boot failed:', e); }
    }

    function stopForLobby() {
        if (!gameActive) return;
        gameActive = false;
        handledTiles.clear();
        api()?.stop();
    }

    // Same trick sounds.js uses for login music: the lobby wrapper is hidden
    // exactly when a game (any mode — tutorial, local, multiplayer) begins.
    function watchLobby() {
        const lw = document.getElementById('lobby-wrapper');
        if (!lw) return;
        new MutationObserver(() => {
            if (lw.style.display === 'none') startForGame();
            else stopForLobby();
        }).observe(lw, { attributes: true, attributeFilter: ['style'] });
    }

    // ── Tile reveal → playlist ───────────────────────────────────────────
    // Called from revealTile() (local flips) and the tile-flip broadcast /
    // turn-change catch-up handlers in lobby.js (remote flips). Deduped by
    // tileId so double delivery is harmless.
    async function onTileRevealed(shrineType, tileId) {
        if (!gameActive || suppressed || tileId == null || !shrineType || shrineType === 'player') return;
        if (handledTiles.has(tileId)) return;
        handledTiles.add(tileId);
        const a = api();
        if (!a) return;
        const gameId = window.currentGameId || 'local';
        try {
            const genKey = await a.addTileTheme(shrineType, `${gameId}:${tileId}`);
            if (genKey) console.log(`🎵 Joytone: tile ${tileId} (${shrineType}) added "${genKey}" to the playlist`);
            else console.log(`🎵 Joytone: tile ${tileId} (${shrineType}) — all variations already in the playlist`);
        } catch (e) {
            console.warn('Joytone addTileTheme failed:', e);
        }
    }

    // ── Settings (per-player) ────────────────────────────────────────────
    // Mute (Settings tab toggle) and Power (the Joytone popup's own ⏻
    // button) are now the same signal: muting also powers the engine off
    // (and back on), and the popup's own button reports back here so the
    // Settings toggle stays correct no matter which control was used.
    function setMuted(m) {
        muted = !!m;
        localStorage.setItem('godaigo_joytone_muted', muted ? 'true' : 'false');
        api()?.setMute(muted);
        if (!suppressed) api()?.setPower(!muted);
    }

    // Called by the iframe itself (joytone/index.html) whenever ITS ⏻
    // button changes power state, so the Settings toggle reflects it too.
    // Ignored while suppressed: those power changes are OUR OWN
    // setSuppressed()-driven calls, not real user intent, and must never
    // overwrite the user's actual saved mute preference.
    function _onChildPowerChanged(isPowerOn) {
        if (suppressed) return;
        const newMuted = !isPowerOn;
        if (newMuted === muted) return;
        muted = newMuted;
        localStorage.setItem('godaigo_joytone_muted', muted ? 'true' : 'false');
        try { window._gami_refreshJoytoneToggle?.(); } catch (e) {}
    }

    function setPower(p) { api()?.setPower(!!p); }

    // Bot jobs (Train Weights / Evolve / Breed) play many short simulated
    // games back to back — silence the engine for the whole job rather
    // than letting it boot/restart on every individual simulated game (see
    // startForGame()'s suppressed check above). Idempotent; safe to call
    // with the same value repeatedly.
    function setSuppressed(s) {
        s = !!s;
        if (s === suppressed) return;
        suppressed = s;
        if (!gameActive) return; // nothing currently playing to (un)suppress
        api()?.setPower(suppressed ? false : !muted);
    }
    function isSuppressed() { return suppressed; }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, +v || 0));
        localStorage.setItem('godaigo_joytone_volume', String(volume));
        api()?.setVolume(volume);
    }

    // ── Shift+J+T popup shortcut ─────────────────────────────────────────
    const held = new Set();
    function onKeyDown(e) {
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
        const k = e.key?.toLowerCase();
        if (k) held.add(k);
        if (e.shiftKey && held.has('j') && held.has('t')) {
            e.preventDefault();
            held.clear();
            togglePopup();
        }
    }
    function onKeyUp(e) {
        const k = e.key?.toLowerCase();
        if (k) held.delete(k);
    }

    // Browsers require a user gesture before audio can start; game start is
    // always preceded by clicks, but keep retrying on gestures just in case.
    function onGesture() {
        if (gameActive) api()?.unlock().catch(() => {});
    }

    function init() {
        buildDom();
        watchLobby();
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('click', onGesture);
        window.addEventListener('blur', () => held.clear());
        console.log('🎹 JoytoneBridge loaded');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.JoytoneBridge = {
        onTileRevealed,
        setMuted,
        setVolume,
        setPower,
        setSuppressed,
        isSuppressed,
        isMuted: () => muted,
        getVolume: () => volume,
        togglePopup,
        _onChildPowerChanged,
        _state: () => api()?.getState(),
    };
})();
