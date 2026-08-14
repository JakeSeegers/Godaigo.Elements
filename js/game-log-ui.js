// ============================================================
// game-log-ui.js — player-facing readable Game Log panel.
// ============================================================
// Renders a colour-coded, human-readable history of PUBLIC actions into
// #game-log-content, fed live by js/action-log.js's onRecord() hook — every
// entry it already records (placeStone, move, cast/effect/response events,
// discardScroll, endTurn) is reused rather than duplicating any of those
// hooks here. This file only decides how to DESCRIBE and FILTER entries for
// players to read during the game.
//
// Deliberately excluded from the visible log (unlike the hidden dev-only
// "Download Action Log" cheat-panel button, which keeps everything):
//   - discardScroll: reveals which scroll left a player's hand. A player
//     already sees their own hand elsewhere, and must never see anyone
//     else's — so it's simplest and correct to just never show it here.
//   - sacrificial_pyre_response_opened/submitted: internal UI-state
//     bookkeeping, not narrative a player needs.
//   - original_countered / original_resolved: always immediately follow a
//     cast_execute (and, when relevant, a response_counter/counter_negated)
//     for the same scroll — the earlier line already tells the story, so
//     showing both would just repeat it.
//   - endTurn: the next turn's header line marks this boundary instead.
//
// Movement is collapsed to one summary line per (turn, player) instead of
// one line per hex stepped into — see pendingMove/flushPendingMove().
//
// LOAD ORDER: after action-log.js (needs window.ActionLog.onRecord/entries).
// ============================================================

(function () {
    'use strict';

    const PANEL_ID = 'game-log-panel';
    const CONTENT_ID = 'game-log-content';
    const BTN_ID = 'panel-btn-gamelog';

    // Same name→hex mapping used elsewhere (multiplayer-state.js's
    // updateTurnDisplay, etc.) — not imported from anywhere shared, just
    // duplicated the same small table rather than reach into another
    // module's closure for it.
    const PLAYER_HEX = { purple: '#9458f4', yellow: '#ffce00', red: '#ed1b43', blue: '#5894f4', green: '#69d83a' };

    const ELEMENT_COLOR_VAR = {
        earth: 'var(--earth-color)',
        water: 'var(--water-color)',
        fire: 'var(--fire-color)',
        wind: 'var(--wind-color)',
        void: 'var(--void-color)',
        catacomb: 'var(--catacomb-color)',
    };

    function elementOf(scrollName) {
        return window.SCROLL_DEFINITIONS?.[scrollName]?.element || null;
    }
    function scrollDisplayName(scrollName) {
        return window.SCROLL_DEFINITIONS?.[scrollName]?.name || scrollName || 'a scroll';
    }
    function elColor(element) {
        return ELEMENT_COLOR_VAR[element] || 'var(--text-primary)';
    }
    function playerColorHex(playerIndex) {
        try {
            if (typeof allPlayersData !== 'undefined' && Array.isArray(allPlayersData)) {
                const p = allPlayersData.find(pl => pl.player_index === playerIndex);
                if (p && p.color && PLAYER_HEX[p.color]) return PLAYER_HEX[p.color];
            }
        } catch (e) { /* solo/tutorial — fall through */ }
        try {
            if (typeof playerPositions !== 'undefined' && playerPositions[playerIndex]?.color) {
                return playerPositions[playerIndex].color;
            }
        } catch (e) { /* ignore */ }
        return 'var(--text-primary)';
    }
    function playerName(playerIndex) {
        return (typeof getPlayerColorName === 'function') ? getPlayerColorName(playerIndex) : `Player ${playerIndex + 1}`;
    }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function playerSpan(playerIndex) {
        return `<span style="color:${playerColorHex(playerIndex)}">${esc(playerName(playerIndex))}</span>`;
    }
    function aOrAn(word) {
        return /^[aeiou]/i.test(word || '') ? 'an' : 'a';
    }

    // ---- Movement collapsing ----
    let pendingMove = null; // { turn, player, count }

    function flushPendingMove() {
        if (!pendingMove || pendingMove.count <= 0) { pendingMove = null; return; }
        const n = pendingMove.count;
        appendLine(`Moved ${n} space${n === 1 ? '' : 's'}`, 'gl-move');
        pendingMove = null;
    }

    // ---- Turn headers ----
    let lastHeaderTurn = null;

    function ensureTurnHeader(entry) {
        if (entry.turn == null || entry.turn === lastHeaderTurn) return;
        lastHeaderTurn = entry.turn;
        const content = document.getElementById(CONTENT_ID);
        if (!content) return;
        const botTag = entry.actor === 'bot' ? ' (bot)' : '';
        const div = document.createElement('div');
        div.className = 'gl-turn-header';
        div.innerHTML = `Turn ${entry.turn} — ${playerSpan(entry.player)}${botTag}`;
        content.appendChild(div);
        content.scrollTop = content.scrollHeight;
    }

    function appendLine(html, className) {
        const content = document.getElementById(CONTENT_ID);
        if (!content) return;
        const div = document.createElement('div');
        div.className = 'gl-line ' + className;
        div.innerHTML = html;
        content.appendChild(div);
        content.scrollTop = content.scrollHeight;
    }

    // ---- Entry -> line. Returns null to omit. ----
    function describe(entry) {
        switch (entry.type) {
            case 'placeStone': {
                const el = entry.stoneType;
                return {
                    html: `Placed ${aOrAn(el)} <span style="color:${elColor(el)}">${esc(el)}</span> stone`,
                    className: 'gl-place',
                };
            }
            case 'cast_execute': {
                return {
                    html: `Cast <span style="color:${elColor(entry.element)}">${esc(scrollDisplayName(entry.scrollName))}</span>`,
                    className: 'gl-cast',
                };
            }
            case 'effect_execute': {
                if (entry.success === false) return null;
                const text = entry.message || `${scrollDisplayName(entry.scrollName)} resolved.`;
                return {
                    html: `<span style="color:${elColor(elementOf(entry.scrollName))}">${esc(text)}</span>`,
                    className: 'gl-effect',
                };
            }
            case 'response_counter': {
                return {
                    html: `${playerSpan(entry.casterIndex)} counters ${playerSpan(entry.player)}'s ` +
                        `${esc(scrollDisplayName(entry.triggeringScroll))} with ` +
                        `<span style="color:${elColor(elementOf(entry.scrollName))}">${esc(scrollDisplayName(entry.scrollName))}</span>!`,
                    className: 'gl-counter',
                };
            }
            case 'counter_negated': {
                return {
                    html: `${playerSpan(entry.player)} pays ${entry.ransomAP ?? 2} AP — negates ` +
                        `${playerSpan(entry.casterIndex)}'s ${esc(scrollDisplayName(entry.scrollName))}!`,
                    className: 'gl-negated',
                };
            }
            case 'response_resolved': {
                return {
                    html: `${playerSpan(entry.casterIndex)} responds with ` +
                        `<span style="color:${elColor(elementOf(entry.scrollName))}">${esc(scrollDisplayName(entry.scrollName))}</span>`,
                    className: 'gl-response',
                };
            }
            case 'original_countered':
            case 'original_resolved':
            case 'sacrificial_pyre_response_opened':
            case 'sacrificial_pyre_response_submitted':
            case 'discardScroll':
            case 'endTurn':
                return null;
            default:
                return null;
        }
    }

    function handle(entry) {
        ensureTurnHeader(entry);
        if (entry.type === 'move') {
            if (!pendingMove || pendingMove.turn !== entry.turn || pendingMove.player !== entry.player) {
                flushPendingMove();
                pendingMove = { turn: entry.turn, player: entry.player, count: 0 };
            }
            pendingMove.count++;
            return;
        }
        flushPendingMove();
        const line = describe(entry);
        if (line) appendLine(line.html, line.className);
    }

    // ---- Toggle button (beside #status, not the bottom dock — see index.html)
    // and the panel's own header close button — both drive the same open/
    // closed state, kept in sync via setOpen() rather than each toggling
    // independently. ----
    function wireToggle() {
        const btn = document.getElementById(BTN_ID);
        const panel = document.getElementById(PANEL_ID);
        const closeBtn = document.getElementById('game-log-close-btn');
        if (!btn || !panel || btn.dataset.wired) return;
        btn.dataset.wired = '1';

        function setOpen(open) {
            panel.style.display = open ? 'flex' : 'none';
            btn.classList.toggle('fsp-dock-btn-open', open);
            btn.textContent = open ? 'Hide Log' : 'Show Log';
        }

        btn.addEventListener('click', () => setOpen(panel.style.display === 'none'));
        if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));

        // Open by default — matches the panel's own default (display:flex,
        // no inline style, same as .right-panel) and the button's initial
        // fsp-dock-btn-open class set in index.html.
        setOpen(true);
    }

    function init() {
        wireToggle();
        // Backfill anything already recorded (normally empty this early —
        // defensive only) before subscribing for live updates.
        if (window.ActionLog?.entries) {
            for (const entry of window.ActionLog.entries()) handle(entry);
        }
        if (window.ActionLog?.onRecord) {
            window.ActionLog.onRecord(handle);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
