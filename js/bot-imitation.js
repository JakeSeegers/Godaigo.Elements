// js/bot-imitation.js — window.BotImitation — HERMIT-ONLY "learn from my
// play" imitation learning.
//
// CONCEPT (docs/void-knight.md's deferred "Practice vs my bot" idea, built
// against real online games instead of a new local mode — see
// planning/current.md for the session that scoped this down): while a real
// online game with a bot in it is running, watch the HUMAN's own decisions.
// At each of the two decision types below, compare what the bot's own
// scoring would have picked to what the human actually did; when they
// disagree, nudge a PERSONAL weight table (never the shared community
// champion) a small step toward the human's choice, perceptron-style.
//
// v1 SCOPE — deliberately two decision types, not all of them:
//   - endTurn (should I have stopped here, or kept playing?)
//   - discardScroll (which scroll was actually worth keeping?)
// These are the two branches of bot.js's scoreAction() that were given an
// optional trace channel (see scoreAction()'s contrib() helper) — a cast/
// move/placeStone comparison would need the same treatment, deliberately
// left for a later increment so this first slice touches the least amount
// of the heavily-tuned scoring code. A move/cast/placeStone decision still
// COUNTS toward "did the human agree with the bot's overall top pick"
// (used to detect "the bot wanted to end the turn but the human kept
// playing" and vice versa), it just never contributes a feature-level nudge
// of its own.
//
// GATING: window.isHermit() (lobby.js) — same developer-only convention as
// the rest of the hermit tooling — AND an explicit opt-in toggle (off by
// default even for that account), surfaced in the hermit menu
// (game-ui.js's initHermitMenu). Never runs during BotArena self-play
// (there's no human to learn from), and only watches the LOCAL player's own
// turns in a REAL multiplayer game that actually contains a bot.
//
// TESTABILITY CAVEAT (same honesty standard as the response-scroll broadcast
// note in bot-roadmap.md): this can only be exercised against a REAL online
// game with a real bot seat, which this sandbox cannot reach (no Supabase
// egress). The scoreAction()/rankActions() instrumentation it depends on
// WAS verified here (headless, BotArena self-play, same-seed regression —
// see the branch's commit) to change nothing about existing bot behavior.
// The ActionLog-comparison/nudge logic itself needs a real online smoke
// test (a hermit account, a real room with "🤖 Add Bot", toggle on, play a
// few turns, confirm the stats badge counts sane numbers) before trusting it.
//
// Load order: after bot.js, bot-state.js, action-log.js, lobby.js (needs
// window.BotSystem/BotState, window.ActionLog, window.isHermit/
// isBotUsername) — see index.html.
(function () {
    'use strict';

    const ENABLED_KEY = 'godaigo_imitation_learning_enabled';
    const WEIGHTS_KEY = 'godaigo_bot_weights_mine';
    const LEARNING_RATE = 0.05;
    const POLL_MS = 300;

    function isHermitUser() {
        return typeof window.isHermit === 'function' && window.isHermit();
    }

    let enabled = false;
    try { enabled = localStorage.getItem(ENABLED_KEY) === '1'; } catch (e) { /* ignore */ }

    function setEnabled(v) {
        enabled = !!v && isHermitUser(); // never persists ON for a non-hermit account
        try { localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
        console.log(`🧠 [Imitation] ${enabled ? 'ON — watching your play' : 'OFF'}`);
        renderBadge();
    }
    function isEnabled() { return enabled && isHermitUser(); }

    // ── personal weight table — separate from the shared community champion ──
    function loadMyWeights() {
        try {
            const raw = localStorage.getItem(WEIGHTS_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        // First use: seed from whatever the bot is currently playing with.
        const bs = window.BotSystem;
        return { ...((bs && (bs.WEIGHTS || bs.DEFAULT_WEIGHTS)) || {}) };
    }
    function saveMyWeights(w) {
        try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w)); } catch (e) { /* ignore */ }
    }

    // ── session tally, reset each new game — drives the tiny badge ──
    let stats = { watched: 0, agreed: 0, nudged: 0 };
    function resetStats() { stats = { watched: 0, agreed: 0, nudged: 0 }; renderBadge(); }

    // ── eligibility: real online game, a bot is actually present, it's my turn ──
    function eligibleNow() {
        if (!isEnabled()) return false;
        if (typeof window.BotArena?.isRunning === 'function' && window.BotArena.isRunning()) return false;
        if (typeof isMultiplayer === 'undefined' || !isMultiplayer) return false;
        if (typeof myPlayerIndex === 'undefined' || myPlayerIndex == null) return false;
        if (typeof activePlayerIndex === 'undefined' || activePlayerIndex !== myPlayerIndex) return false;
        if (typeof allPlayersData === 'undefined' || !Array.isArray(allPlayersData)) return false;
        return allPlayersData.some(p => window.isBotUsername && window.isBotUsername(p.username));
    }

    // ── cached "what would the bot do right now", refreshed on a short poll
    // while it's my turn — by the time the human's action lands in
    // ActionLog we still have the position it was decided from. Same
    // poll-while-my-turn idiom bot-driver.js's watcher already uses.
    let pending = null; // { bestType, endTurnTrace, topDiscardScroll, discardTraceByScroll }
    let lastSeenGameId = undefined;
    function refreshPending() {
        // A fresh game means a fresh set of decisions to reason about — a
        // stale `pending`/tally from the previous game's final position must
        // never bleed into this game's first comparison. No dedicated
        // "game started" event exists in this codebase, so detect it the
        // same way the rest of this poll loop observes state: by watching
        // the one global that actually changes on join (multiplayer-state.js).
        const gid = (typeof currentGameId !== 'undefined') ? currentGameId : null;
        if (gid !== lastSeenGameId) { lastSeenGameId = gid; pending = null; resetStats(); }
        if (!eligibleNow()) { pending = null; return; }
        const bs = window.BotSystem;
        if (!bs || typeof bs.rank !== 'function') { pending = null; return; }
        try {
            const ranked = bs.rank(null, { withTrace: true });
            if (!ranked || !ranked.length) { pending = null; return; }
            const endTurnEntry = ranked.find(r => r.action.type === 'endTurn');
            const discardEntries = ranked.filter(r => r.action.type === 'discardScroll');
            pending = {
                bestType: ranked[0].action.type,
                endTurnTrace: endTurnEntry ? endTurnEntry.trace : null,
                topDiscardScroll: discardEntries.length ? discardEntries[0].action.scroll : null,
                discardTraceByScroll: Object.fromEntries(discardEntries.map(r => [r.action.scroll, r.trace])),
            };
        } catch (e) {
            console.warn('⚠️ [Imitation] refreshPending failed (non-fatal):', e);
            pending = null;
        }
    }
    let pollTimer = null;
    function ensurePolling() {
        if (pollTimer) return;
        pollTimer = setInterval(refreshPending, POLL_MS);
    }
    ensurePolling(); // harmless no-op every tick unless eligibleNow()

    // ── the perceptron-style nudge: push each traced weight a small step
    // toward whatever made the human's choice look better / the bot's
    // rejected pick look worse. Skips non-numeric / absent keys defensively
    // (a weights table missing a newer key shouldn't throw).
    function nudge(direction, trace) {
        if (!trace) return false;
        const w = loadMyWeights();
        let touched = false;
        for (const key of Object.keys(trace)) {
            if (typeof w[key] !== 'number') continue;
            w[key] = +(w[key] + direction * LEARNING_RATE * trace[key]).toFixed(4);
            touched = true;
        }
        if (touched) { saveMyWeights(w); stats.nudged++; renderBadge(); }
        return touched;
    }
    // Perceptron difference update between two traced candidates: nudge
    // every key present in EITHER trace by lr*(human[k]-bot[k]).
    function nudgeDiff(humanTrace, botTrace) {
        const w = loadMyWeights();
        const keys = new Set([...Object.keys(humanTrace || {}), ...Object.keys(botTrace || {})]);
        let touched = false;
        for (const key of keys) {
            if (typeof w[key] !== 'number') continue;
            const h = (humanTrace && humanTrace[key]) || 0;
            const b = (botTrace && botTrace[key]) || 0;
            if (h === b) continue;
            w[key] = +(w[key] + LEARNING_RATE * (h - b)).toFixed(4);
            touched = true;
        }
        if (touched) { saveMyWeights(w); stats.nudged++; renderBadge(); }
        return touched;
    }

    // ── the actual comparison, fired on every one of the human's own recorded
    // actions (ActionLog.onRecord) ──
    function onHumanAction(entry) {
        if (!isEnabled()) return;
        if (typeof myPlayerIndex === 'undefined' || entry.player !== myPlayerIndex) return;
        if (!pending) return; // nothing cached to compare against — skip, don't guess
        const snapshot = pending;
        pending = null; // this decision is spent; next poll tick builds a fresh one

        // Signal A — "should I have ended my turn here?" — meaningful for
        // EVERY action type, not just endTurn itself, since declining to end
        // when the bot wanted to is just as real a signal as ending when it
        // didn't.
        const botWantedEnd = snapshot.bestType === 'endTurn';
        const humanEnded = entry.type === 'endTurn';
        if (snapshot.endTurnTrace && botWantedEnd !== humanEnded) {
            stats.watched++;
            nudge(humanEnded ? +1 : -1, snapshot.endTurnTrace);
        } else if (snapshot.endTurnTrace && botWantedEnd === humanEnded) {
            stats.watched++; stats.agreed++; renderBadge();
        }

        // Signal B — "which scroll was actually worth discarding?" — only
        // meaningful when the human's action WAS a discard (forced-overflow
        // turns are discard-only, so this naturally only fires then).
        if (entry.type === 'discardScroll' && snapshot.topDiscardScroll) {
            const matched = entry.scroll === snapshot.topDiscardScroll;
            if (!matched) {
                nudgeDiff(snapshot.discardTraceByScroll[entry.scroll], snapshot.discardTraceByScroll[snapshot.topDiscardScroll]);
            }
        }
    }

    if (typeof window.ActionLog?.onRecord === 'function') {
        window.ActionLog.onRecord(onHumanAction);
    } else {
        console.warn('⚠️ [Imitation] ActionLog not loaded yet — load order issue, see file header');
    }

    // ── tiny hermit-only readout — never intrusive, just proof it's alive ──
    let badge = null;
    function renderBadge() {
        if (!isEnabled()) { if (badge) badge.style.display = 'none'; return; }
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'imitation-learning-badge';
            Object.assign(badge.style, {
                position: 'fixed', bottom: '10px', left: '10px', zIndex: '10000',
                background: '#1a1a2e', color: '#9fd9a0', border: '1px solid #444',
                borderRadius: '6px', padding: '4px 9px', fontSize: '11px',
                fontFamily: 'monospace', pointerEvents: 'none', opacity: '0.85',
            });
            document.body.appendChild(badge);
        }
        badge.style.display = 'block';
        badge.textContent = `🧠 learning — ${stats.watched} watched, ${stats.agreed} agreed, ${stats.nudged} nudged`;
    }

    window.BotImitation = {
        isHermitUser,
        setEnabled,
        isEnabled,
        resetStats,
        getStats: () => ({ ...stats }),
        getMyWeights: loadMyWeights,
        _refreshPending: refreshPending, // exposed for console/testing only
    };
    renderBadge();
    console.log('🧠 [Imitation] Loaded — hermit-only, off by default (see hermit menu)');
})();
