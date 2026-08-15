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
// LOAD ORDER: after action-log.js (needs window.ActionLog.onRecord/entries)
// AND after scroll-panels.js, whose init() creates #game-log-content (see
// createPanel('gamelog', ...) there) before this file's own DOMContentLoaded
// handler runs — both listen on the same event, so registration order
// (i.e. script tag order in index.html) is what makes this reliable; in
// practice it barely matters since onRecord() only ever fires during real
// gameplay, long after both have finished initializing.
// ============================================================

(function () {
    'use strict';

    // The panel itself (drag/resize/collapse/close/open, the
    // #panel-btn-gamelog toggle button) is now built and wired entirely by
    // js/scroll-panels.js's createPanel('gamelog', 'Game Log', {bodyId:
    // 'game-log-content', ...}) — this file only ever writes into that body.
    const CONTENT_ID = 'game-log-content';

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

    // ---- Repeat-line multiplier ----
    // Consecutive identical lines ("Placed an earth stone" three times in a
    // row) collapse into one line with a "×N" suffix instead of repeating
    // verbatim — a signature (className+html) identifies "identical", so a
    // change in stone type/scroll/wording always breaks the streak. Reset on
    // every new turn header (see ensureTurnHeader) so a streak never spans a
    // turn boundary — a fresh turn's first action must never just bump last
    // turn's count. baseHtml is kept separate from the element's rendered
    // innerHTML so re-rendering with an incremented count never compounds
    // the previous "×N" into the text itself.
    let lastLine = null; // { el, signature, baseHtml, count } | null

    function _multiplierSuffix(count) {
        return count > 1 ? ` <span class="gl-mult">×${count}</span>` : '';
    }

    // Re-fits the panel to its (now taller) content when autofit is on —
    // js/scroll-panels.js's fitPanel() itself is a no-op when it's off, or
    // when the panel is currently collapsed, so this is always safe to call.
    function _fit() {
        window.ScrollPanelSystem?.fitPanel?.('gamelog');
    }

    function ensureTurnHeader(entry) {
        if (entry.turn == null || entry.turn === lastHeaderTurn) return;
        lastHeaderTurn = entry.turn;
        lastLine = null; // a new turn's first line must never extend last turn's streak
        const content = document.getElementById(CONTENT_ID);
        if (!content) return;
        const botTag = entry.actor === 'bot' ? ' (bot)' : '';
        const div = document.createElement('div');
        div.className = 'gl-turn-header';
        div.innerHTML = `Turn ${entry.turn} — ${playerSpan(entry.player)}${botTag}`;
        content.appendChild(div);
        content.scrollTop = content.scrollHeight;
        _fit();
    }

    function appendLine(html, className) {
        const content = document.getElementById(CONTENT_ID);
        if (!content) return;
        const signature = className + '|' + html;

        if (lastLine && lastLine.signature === signature && lastLine.el.isConnected) {
            lastLine.count++;
            lastLine.el.innerHTML = lastLine.baseHtml + _multiplierSuffix(lastLine.count);
            content.scrollTop = content.scrollHeight;
            _fit();
            return;
        }

        const div = document.createElement('div');
        div.className = 'gl-line ' + className;
        div.innerHTML = html;
        content.appendChild(div);
        content.scrollTop = content.scrollHeight;
        lastLine = { el: div, signature, baseHtml: html, count: 1 };
        _fit();
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

    function init() {
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
