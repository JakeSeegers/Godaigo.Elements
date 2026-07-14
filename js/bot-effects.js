// ============================================================
// bot-effects.js — Stage 2.5 scroll-effect usage (docs/bot-roadmap.md)
// ============================================================
// Drives the interactive choice UIs scroll effects open, instead of the
// bot cancelling every one of them (see docs/bot-roadmap.md
// § CHOICE-SPACE INVENTORY for the full list of 15 scrolls + Excavate).
// Scoped narrowly this increment, per the roadmap's "start with a few,
// expand opportunistically" build order:
//   - driveTransmute(): the only scroll with an open-ended discard-for-AP
//     modal and NO selectionMode object (detected via DOM id directly,
//     same as scroll-effects.js's EFFECT_MODAL_IDS safety net).
//   - decideResponse(): response-scroll respond/pass, ARENA-ONLY (gated
//     on window.BotArena.isRunning()). Real multiplayer still goes
//     through response-window.js's existing "bots cannot respond" path,
//     untouched — extending this to live multiplayer games is a
//     deliberately separate, later step once this is arena-validated.
//
// Every other selection-mode scroll in the inventory still falls through
// to today's cancel-and-continue in bot.js's waitForQuiescence().
//
// LOAD ORDER: after bot-sim.js, before bot.js (bot.js calls into this)
// ============================================================

(function () {
    'use strict';

    function log(...args) { console.log('🎭 [BotEffects]', ...args); }

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

    window.BotEffects = { driveTransmute, decideResponse };
    log('Loaded — window.BotEffects ready (driveTransmute / decideResponse)');
})();
