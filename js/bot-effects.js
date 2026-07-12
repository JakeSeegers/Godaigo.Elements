// ============================================================
// bot-effects.js — Stage 2.5 of docs/bot-roadmap.md
// ============================================================
// Drives the scroll-effect selection choices bot.js's waitForQuiescence()
// used to just cancel. window.BotEffects.driveSelection() is tried FIRST
// by waitForQuiescence(); returning false lets the existing cancel path
// (cancelSelectionMode()) handle anything not covered here.
//
// Never reimplements game rules: every choice below calls straight into
// the game's own selection APIs — selectionMode.handleXClick(...), or
// clicking the real modal <button>/<div> elements a human would click —
// exactly the BotState.applyAction() philosophy applied to scroll effects.
//
// Coverage (see docs/bot-roadmap.md § STAGE 2.5 for the full 17-scroll
// inventory this is scoped against): this first increment drives
// tile-flip (Heavy Stomp / Call to Adventure), scorched-earth (Combust),
// tile-swap (Shifting Sands), Create, and Scholar's Insight. Response
// scrolls, Sacrificial Pyre, Inspiring Draught, Wandering River, Control
// the Current, Arson, Plunder, Quick Reflexes, and Excavate's deferred
// teleport are NOT yet driven — cast falls through to cancel for those,
// same as before this file existed. Telekinesis and Take Flight's
// destination step are drag-based (no click handler to call) and are out
// of scope until a programmatic hook exists.
//
// LOAD ORDER: after bot.js (index.html) — but this file must not reach
// into bot.js's closure; it reads game state via window.BotState.snapshot()
// only, same as bot.js does, so load order relative to bot.js doesn't
// actually matter, just after bot-state.js.
// ============================================================

(function () {
    'use strict';

    function log(...args) { console.log('🎯 [BotEffects]', ...args); }

    const ELEMENTS = ['earth', 'water', 'fire', 'wind', 'void'];
    const POOL_CAP = 5;

    // Small, independent tuning surface for effect *choices* (which tile,
    // which element, ...) — separate from bot.js's WEIGHTS because these are
    // one-off picks, not scored against move/cast/endTurn alternatives.
    const WEIGHTS = {
        needUnactivated: 2.5,
        needPoolRoom: 1.0,
        needDeadSource: -3.0,
    };

    function snap() { return window.BotState.snapshot(); }
    function self(s) { return s.players[s.turn.activePlayerIndex]; }

    // Value of gaining a stone/scroll of this element right now — same shape
    // as bot.js's shrineValue(), kept independent since this file must stand
    // alone from bot.js's closure.
    function elementNeed(s, me, element) {
        const room = Math.max(0, POOL_CAP - (me.pool[element] || 0));
        let v = WEIGHTS.needPoolRoom * room;
        if (!me.activated.includes(element)) v += WEIGHTS.needUnactivated * room;
        if ((s.sourcePool[element] || 0) <= 0) v += WEIGHTS.needDeadSource * room;
        return v;
    }

    // Elements ranked best-need-first for the active player right now.
    function rankedElements() {
        const s = snap();
        const me = self(s);
        if (!me) return [...ELEMENTS];
        return [...ELEMENTS].sort((a, b) => elementNeed(s, me, b) - elementNeed(s, me, a));
    }

    // ----------------------------------------------------------------
    // DOM helpers — click the real button/div a human would click. Only
    // elements with a live onclick handler are considered "clickable"
    // (disabled/empty-deck buttons never get one — see scroll-effects.js
    // showDeckSelectionModal/showCreateStoneModal), so this naturally skips
    // choices the game itself has ruled out.
    // ----------------------------------------------------------------
    function clickableDescendants(root) {
        return [...root.querySelectorAll('*')].filter(el => typeof el.onclick === 'function');
    }

    function clickMatching(root, predicate) {
        for (const el of clickableDescendants(root)) {
            if (predicate(el.textContent || '')) { el.click(); return true; }
        }
        return false;
    }

    // Try each element in priority order; click the first whose button/card
    // is actually present and clickable. Returns the element clicked, or null.
    function clickBestElement(root, priorityElements) {
        for (const el of priorityElements) {
            const label = el.charAt(0).toUpperCase() + el.slice(1);
            if (clickMatching(root, t => t.includes(label))) return el;
        }
        return null;
    }

    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    // ----------------------------------------------------------------
    // tile-flip (Heavy Stomp EARTH_SCROLL_4, Call to Adventure CATACOMB_SCROLL_3)
    // Choice: one eligible tile (no stones/players, not a player tile).
    // Heuristic: strongly prefer flipping a HIDDEN tile (reveals it — a
    // scroll draw, same value the bot already places on exploration via
    // WEIGHTS.moveExplore in bot.js) over hiding a revealed one, which only
    // ever removes board information/access.
    // ----------------------------------------------------------------
    function driveTileFlip(se, sm) {
        const tiles = sm.eligibleTiles || [];
        if (!tiles.length) return false;
        const me = self(snap());
        const hidden = tiles.filter(t => t.flipped);
        const pick = hidden.length
            ? hidden.reduce((a, b) => (!a || dist(me, b) < dist(me, a)) ? b : a, null)
            : tiles[0]; // no hidden tiles available — arbitrary pick among a genuinely bad option set
        sm.handleTileClick(pick);
        return true;
    }

    // ----------------------------------------------------------------
    // scorched-earth (Combust CATACOMB_SCROLL_10)
    // Choice: one tile with stones on it (destroys ALL stones there).
    // Heuristic v1: maximize stones destroyed. Does NOT yet protect the
    // bot's own in-progress plan cells (plan state lives in bot.js's
    // closure, not exposed here) — a known limitation, not a correctness
    // bug: worst case the bot burns its own half-built pattern.
    // ----------------------------------------------------------------
    function driveScorchedEarth(se, sm) {
        const tiles = sm.eligibleTiles || [];
        if (!tiles.length) return false;
        let best = tiles[0], bestCount = -1;
        for (const t of tiles) {
            const count = (typeof placedStones !== 'undefined' ? placedStones : [])
                .filter(st => Math.hypot(st.x - t.x, st.y - t.y) < (typeof TILE_SIZE !== 'undefined' ? TILE_SIZE * 4 : 80)).length;
            if (count > bestCount) { bestCount = count; best = t; }
        }
        sm.handleTileClick(best);
        return true;
    }

    // ----------------------------------------------------------------
    // tile-swap (Shifting Sands EARTH_SCROLL_2)
    // Choice: 2 eligible tiles to swap positions. No clear strategic value
    // model without deeper board reasoning (swapping revealed shrines
    // relocates them, which can help or hurt either player) — v1 just picks
    // the two eligible tiles closest to each other (least disruptive,
    // avoids randomly relocating a shrine to the far side of the board).
    // ----------------------------------------------------------------
    function driveTileSwap(se, sm) {
        const tiles = (sm.eligibleTiles || []).filter(t =>
            !(sm.selectedTiles || []).some(s => s.id === t.id));
        if (!tiles.length) return false;
        if (!(sm.selectedTiles || []).length) {
            // First click: pick a tile, prefer one with a partner nearby
            let bestPair = null, bestDist = Infinity;
            for (const a of tiles) {
                for (const b of tiles) {
                    if (a.id === b.id) continue;
                    const d = dist(a, b);
                    if (d < bestDist) { bestDist = d; bestPair = a; }
                }
            }
            sm.handleTileClick(bestPair || tiles[0]);
        } else {
            // Second click: nearest remaining eligible tile to the first pick
            const first = sm.selectedTiles[0];
            const nearest = tiles.reduce((a, b) => (!a || dist(first, b) < dist(first, a)) ? b : a, null);
            sm.handleTileClick(nearest);
        }
        return true;
    }

    // ----------------------------------------------------------------
    // Create (VOID_SCROLL_5) — modal, single click.
    // Choice: element type to draw rank-many stones of.
    // ----------------------------------------------------------------
    function driveCreateModal() {
        const modal = document.getElementById('create-stone-modal');
        if (!modal) return false;
        return !!clickBestElement(modal, rankedElements());
    }

    // ----------------------------------------------------------------
    // Scholar's Insight (VOID_SCROLL_2) — modal, two steps: pick a deck,
    // then pick a scroll card from it. Disambiguated from the deck picker
    // by the modal's own heading text (only Scholar's Insight uses this ID).
    // ----------------------------------------------------------------
    function driveScholarsInsight() {
        const modal = document.getElementById('scholars-insight-modal');
        if (!modal) return false;
        const heading = modal.querySelector('h3')?.textContent || '';
        if (heading.includes('Choose a Deck')) {
            return !!clickBestElement(modal, rankedElements());
        }
        // Deck browser: cards are <div>s with name/description/"Level N" text.
        // Prefer the highest-level scroll (bigger effect — mirrors bot.js's
        // mild castLevel preference for greedy cast scoring).
        const cards = clickableDescendants(modal);
        let best = null, bestLevel = -1;
        for (const card of cards) {
            const m = /Level (\d+)/.exec(card.textContent || '');
            const level = m ? parseInt(m[1], 10) : 0;
            if (level > bestLevel) { bestLevel = level; best = card; }
        }
        if (!best) return false;
        best.click();
        return true;
    }

    // ----------------------------------------------------------------
    // Public entry point. Inspects whatever selection UI is CURRENTLY open
    // and drives exactly one step of it; the caller (bot.js
    // waitForQuiescence) polls, so a multi-step flow (Scholar's Insight,
    // tile-swap's two clicks) resolves across a couple of ticks naturally.
    // Returns true if it acted, false if nothing here recognizes the open
    // UI (caller falls back to cancelSelectionMode()).
    // ----------------------------------------------------------------
    function driveSelection() {
        const se = window.spellSystem?.scrollEffects;
        if (!se) return false;

        const sm = se.selectionMode;
        let acted = false, kind = null;
        // NOTE: modal checks are independent of the selectionMode switch, not
        // "else" branches — Scholar's Insight (and others) set BOTH a
        // selectionMode (cleanup-only, type:'scholars-insight') AND a DOM
        // modal at the same time, so chaining these as else-if would let the
        // switch's default:break silently swallow it before the modal check
        // ever ran (found via arena testing: Scholar's Insight was always
        // falling through to cancel despite driveScholarsInsight() existing).
        switch (sm?.type) {
            case 'tile-flip':      acted = driveTileFlip(se, sm); kind = 'tile-flip'; break;
            case 'scorched-earth': acted = driveScorchedEarth(se, sm); kind = 'scorched-earth'; break;
            case 'tile-swap':      acted = driveTileSwap(se, sm); kind = 'tile-swap'; break;
            // telekinesis / take-flight-drag: drag-based, not driven yet.
            // water-transform / tile-element-change / excavate-teleport:
            // click-based but not yet implemented — falls through to cancel.
            default: break;
        }
        if (!acted && document.getElementById('create-stone-modal')) {
            acted = driveCreateModal(); kind = 'create';
        }
        if (!acted && document.getElementById('scholars-insight-modal')) {
            acted = driveScholarsInsight(); kind = 'scholars-insight';
        }

        if (acted) log(`Drove a ${kind} choice`);
        return acted;
    }

    window.BotEffects = { driveSelection, rankedElements };
    log('Loaded — window.BotEffects.driveSelection() ready (tile-flip, scorched-earth, tile-swap, Create, Scholar\'s Insight)');
})();
