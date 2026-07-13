// ============================================================
// bot-effects.js — Stage 2.5 of docs/bot-roadmap.md
// ============================================================
// Drives the interactive choice UIs scroll effects open, instead of the
// bot cancelling every one of them (see docs/bot-roadmap.md
// § CHOICE-SPACE INVENTORY for the full list of 15 scrolls + Excavate).
// window.BotEffects.driveSelection() is tried FIRST by bot.js's
// waitForQuiescence(); returning false lets the existing cancel path
// (cancelSelectionMode()) handle anything not covered here.
//
// Never reimplements game rules: every choice below calls straight into
// the game's own selection APIs — selectionMode.handleXClick(...), or
// clicking the real modal <button>/<div> elements a human would click —
// exactly the BotState.applyAction() philosophy applied to scroll effects.
//
// Coverage so far:
//   - driveSelection(): tile-flip (Heavy Stomp / Call to Adventure),
//     scorched-earth (Combust), tile-swap (Shifting Sands), Create,
//     Scholar's Insight.
//   - driveTransmute(): the only scroll with an open-ended discard-for-AP
//     modal and NO selectionMode object (detected via DOM id directly,
//     same as scroll-effects.js's EFFECT_MODAL_IDS safety net).
//   - decideResponse(): response-scroll respond/pass, ARENA-ONLY (gated
//     on window.BotArena.isRunning()). Real multiplayer still goes
//     through response-window.js's existing "bots cannot respond" path,
//     untouched — extending this to live multiplayer games is a
//     deliberately separate, later step once this is arena-validated.
// NOT yet driven: Sacrificial Pyre, Inspiring Draught, Wandering River,
// Control the Current, Arson, Plunder, Quick Reflexes, and Excavate's
// deferred teleport — cast falls through to cancel for those. Telekinesis
// and Take Flight's destination step are drag-based (no click handler to
// call) and are out of scope until a programmatic hook exists.
//
// LOAD ORDER: after bot-sim.js, before bot.js (bot.js calls into this) —
// but this file must not reach into bot.js's closure; it reads game state
// via window.BotState.snapshot() only, same as bot.js does, so load order
// relative to bot.js doesn't actually matter as long as both are loaded
// before any bot action runs.
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
    // TRANSMUTE (Fire IV) — open-ended "discard for +2 AP each" modal.
    // No selectionMode object exists for this one; it's a raw DOM overlay
    // built by enterTransmuteMode(). Detect + drive via its buttons.
    // ----------------------------------------------------------------
    function driveTransmute() {
        const modal = document.getElementById('transmute-modal');
        if (!modal) return false;

        const casterIndex = typeof activePlayerIndex !== 'undefined' ? activePlayerIndex : 0;
        const pool = (typeof window.playerPools !== 'undefined' ? window.playerPools : null)?.[casterIndex];
        const maxTotalAP = 5 + (pool?.void || 0);
        const currentTotalAP = (typeof currentAP !== 'undefined' ? currentAP : 0)
            + (typeof voidAP !== 'undefined' ? voidAP : 0);

        const target = Math.min(maxTotalAP, window.BotSystem?.WEIGHTS?.transmuteTargetAP ?? 7);
        const buttons = [...modal.querySelectorAll('button')];
        const doneBtn = buttons.find(b => b.textContent === 'Done');

        if (currentTotalAP >= target) {
            doneBtn?.click();
            return true;
        }

        // Discard the stone type the bot is holding the MOST of first —
        // least likely to be needed for a specific pattern. Never touch
        // scrolls: Transmute's AP gain isn't worth a hand/active slot.
        const stoneButtons = buttons.filter(b => /^Discard 1 /.test(b.textContent) && !b.disabled);
        let best = null, bestCount = -1;
        stoneButtons.forEach(b => {
            const m = b.textContent.match(/\((\d+)\)$/);
            const count = m ? parseInt(m[1], 10) : 0;
            if (count > bestCount) { bestCount = count; best = b; }
        });

        if (best && bestCount > 0) {
            best.click();
            return true;
        }

        // Nothing left worth discarding for AP this pass — close out.
        doneBtn?.click();
        return true;
    }

    // ----------------------------------------------------------------
    // RESPONSE SCROLLS — arena-only respond/pass decision.
    //
    // In a local hot-seat game (no multiplayer, no BotDriver), response-
    // window.js's localResponderIndex() always resolves to the CASTER
    // (there's only one "local" identity for the single browser tab), so
    // openResponseWindow() always takes its "wait for others" branch and
    // the window silently times out — no responder is ever actually
    // asked. This drives the decision directly for an explicit opponent
    // index instead of relying on that local-identity assumption.
    //
    // v1 heuristic (not weight-scored — same spirit as the roadmap's
    // "v1 heuristic" language for this step):
    //   - A counter (Iron Stance / Psychic) is worth playing when the
    //     triggering cast would activate an element the CASTER hasn't
    //     activated yet (deny their win progress).
    //   - A pure response (Reflect / Unbidden Lamplight / Sigh of
    //     Recollection) is free value with no meaningful downside when
    //     used as a response (none of the three open further UI in the
    //     response path — see roadmap table), so play the cheapest one.
    //   - Otherwise pass.
    // ----------------------------------------------------------------
    function wouldGrantUnactivatedElement(rw, casterIndex) {
        const scrollData = rw.pendingScrollData;
        const def = scrollData?.spell || scrollData?.definition;
        if (!def) return false;
        const activated = window.spellSystem?.playerScrolls?.[casterIndex]?.activated;
        if (!activated) return false;
        if (def.element === 'catacomb' && def.patterns?.[0]) {
            return def.patterns[0].some(pos => !activated.has(pos.type));
        }
        return def.element ? !activated.has(def.element) : false;
    }

    function decideResponse(responderIndex, casterIndex) {
        const rw = window.spellSystem?.responseWindow;
        if (!rw || !rw.isResponseWindowOpen) return false;
        if (rw.respondingPlayers?.has(responderIndex)) return false;

        const check = rw.canPlayerRespond(responderIndex);
        if (!check.canRespond || check.validScrolls.length === 0) {
            log(`Player ${responderIndex}: passing (${check.reason || 'nothing to play'})`);
            rw.playerPasses(responderIndex);
            return true;
        }

        const counters = check.validScrolls.filter(s => s.isCounter);
        const responses = check.validScrolls.filter(s => !s.isCounter && s.isResponse);

        let choice = null;
        if (counters.length > 0 && wouldGrantUnactivatedElement(rw, casterIndex)) {
            choice = counters.reduce((a, b) => (a.cost <= b.cost ? a : b));
        } else if (responses.length > 0) {
            choice = responses.reduce((a, b) => (a.cost <= b.cost ? a : b));
        }

        if (choice) {
            log(`Player ${responderIndex}: responding with ${choice.name}`);
            rw.playerResponds(choice, responderIndex);
        } else {
            log(`Player ${responderIndex}: passing (nothing worth playing)`);
            rw.playerPasses(responderIndex);
        }
        return true;
    }

    // ----------------------------------------------------------------
    // Public entry point (selection modes / Create / Scholar's Insight).
    // Inspects whatever selection UI is CURRENTLY open and drives exactly
    // one step of it; the caller (bot.js waitForQuiescence) polls, so a
    // multi-step flow (Scholar's Insight, tile-swap's two clicks) resolves
    // across a couple of ticks naturally. Returns true if it acted, false
    // if nothing here recognizes the open UI (caller falls back to
    // cancelSelectionMode()). Transmute and response scrolls are driven
    // separately (driveTransmute/decideResponse) since they're detected and
    // called from different points in waitForQuiescence().
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

    window.BotEffects = { driveSelection, rankedElements, driveTransmute, decideResponse };
    log('Loaded — window.BotEffects ready (tile-flip, scorched-earth, tile-swap, Create, Scholar\'s Insight, Transmute, response scrolls)');
})();
