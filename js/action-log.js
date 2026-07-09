// ============================================================
// action-log.js — lightweight, in-memory record of every player's
// meaningful actions (bot AND human), downloadable from the cheat panel
// for bot diagnostics. Nothing here is persisted to Supabase — it lives
// only in this tab's memory for the current session, capped so a long
// game can't leak memory.
//
// Hooks the FUNCTIONS shared by both human and bot code paths (placeStone,
// broadcastPlayerMovement, spellSystem's cast/discard via the existing
// logScrollEvent hook) rather than any one caller's code, so it captures
// both without touching bot.js / bot-state.js / game-ui.js's own logic.
//
// LOAD ORDER: last (after bot-driver.js) so everything it wraps already
// exists as a global by the time this file runs.
// ============================================================

(function () {
    'use strict';

    const MAX_ENTRIES = 3000;
    const log = [];

    function actorLabel(playerIndex) {
        try {
            if (typeof allPlayersData !== 'undefined' && Array.isArray(allPlayersData)) {
                const p = allPlayersData.find(p => p.player_index === playerIndex);
                if (p) return (window.isBotUsername && window.isBotUsername(p.username)) ? 'bot' : 'human';
            }
        } catch (e) { /* solo/tutorial mode has no allPlayersData — default below */ }
        return 'human';
    }

    function record(type, extra) {
        try {
            const player = (typeof activePlayerIndex !== 'undefined') ? activePlayerIndex : null;
            log.push(Object.assign({
                turn: (typeof currentTurnNumber !== 'undefined') ? currentTurnNumber : null,
                player,
                actor: player != null ? actorLabel(player) : null,
                type,
            }, extra));
            if (log.length > MAX_ENTRIES) log.shift();
        } catch (e) {
            console.warn('⚠️ [ActionLog] record failed:', e);
        }
    }

    // ── placeStone: shared by human drag-drop and BotState.applyAction ──
    if (typeof window.placeStone === 'function') {
        const origPlaceStone = window.placeStone;
        window.placeStone = function (x, y, type) {
            const id = origPlaceStone.apply(this, arguments);
            record('placeStone', { x: +x.toFixed(1), y: +y.toFixed(1), stoneType: type });
            return id;
        };
        // Classic-script bare identifiers and window.X are the same binding for
        // function declarations, but keep both in sync defensively.
        try { placeStone = window.placeStone; } catch (e) { /* ignore */ }
    }

    // ── movement: shared by human tile-move and BotState.applyAction ──
    if (typeof broadcastPlayerMovement === 'function') {
        const origMove = broadcastPlayerMovement;
        broadcastPlayerMovement = function (playerIndex, x, y, apSpent) {
            record('move', { x: +x.toFixed(1), y: +y.toFixed(1), apSpent });
            return origMove.apply(this, arguments);
        };
    }

    // ── casts/effects: chain onto the existing logScrollEvent hook (already
    // fired by game-core.js/response-window.js for every scroll event) —
    // whitelist to the highest-signal types so the download stays succinct ──
    const WHITELISTED_SCROLL_EVENTS = new Set([
        'cast_execute', 'effect_execute', 'response_resolved', 'original_countered', 'original_resolved',
    ]);
    const prevLogScrollEvent = window.logScrollEvent;
    window.logScrollEvent = function (type, details) {
        if (typeof prevLogScrollEvent === 'function') {
            try { prevLogScrollEvent(type, details); } catch (e) { /* don't let another hook's error break logging */ }
        }
        if (WHITELISTED_SCROLL_EVENTS.has(type)) {
            record(type, details);
        }
    };

    // ── discard: no existing shared hook — wrap spellSystem's method once it
    // exists (it's constructed after this script may have already run) ──
    function hookSpellSystemDiscard() {
        if (!window.spellSystem || window.spellSystem.__actionLogDiscardHooked || typeof window.spellSystem.discardScroll !== 'function') return false;
        window.spellSystem.__actionLogDiscardHooked = true;
        const origDiscard = window.spellSystem.discardScroll.bind(window.spellSystem);
        window.spellSystem.discardScroll = function (scrollName) {
            const ok = origDiscard(scrollName);
            if (ok) record('discardScroll', { scroll: scrollName });
            return ok;
        };
        return true;
    }
    let discardHookAttempts = 0;
    const discardHookTimer = setInterval(() => {
        if (hookSpellSystemDiscard() || ++discardHookAttempts > 40) clearInterval(discardHookTimer);
    }, 250);

    // ── endTurn: listen on document during the CAPTURE phase so this fires
    // BEFORE the button's own onclick advances activePlayerIndex — ancestor
    // capturing listeners always run before the target's own listeners,
    // regardless of script load order (unlike a second listener on the
    // button itself, which would fire after and see the NEW active player) ──
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'end-turn') record('endTurn', {});
    }, true);

    // ── Download as JSON: a header with game/player context, then entries ──
    function download() {
        const meta = {
            exportedAt: new Date().toISOString(),
            isMultiplayer: (typeof isMultiplayer !== 'undefined') ? isMultiplayer : null,
            currentGameId: (typeof currentGameId !== 'undefined') ? currentGameId : null,
            players: (typeof allPlayersData !== 'undefined' && Array.isArray(allPlayersData))
                ? allPlayersData.map(p => ({
                    index: p.player_index,
                    username: p.username,
                    isBot: !!(window.isBotUsername && window.isBotUsername(p.username)),
                  }))
                : null,
            entryCount: log.length,
        };
        const blob = new Blob([JSON.stringify({ meta, entries: log }, null, 1)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `godaigo-action-log-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    window.ActionLog = { record, download, entries: () => log.slice() };
    console.log('📋 [ActionLog] Loaded — window.ActionLog.download() or the cheat panel button');
})();
