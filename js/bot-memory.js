// js/bot-memory.js — window.BotMemory — episodic "what happened after
// decisions like this" memory. Not part of the original docs/bot-roadmap.md
// plan — added alongside mctsPick() (bot.js) so a genuinely bad/unlikely
// line the search would otherwise explore blind can instead be nudged by
// what actually happened in similar past situations, closer to how a
// human recognizes "this looks like that time X happened" than to pure
// rollout-based search.
//
// Feeds mctsPick() a PRIOR, never a plan override: retrieveSimilar() only
// ever seeds the ROOT's UCB1 arms with a few bonus pseudo-visits (see
// mctsPick()'s own comment) — a bad or irrelevant retrieval gets
// overridden by real rollouts within a handful of iterations rather than
// permanently biasing the choice. This mirrors AlphaZero's policy-prior
// role, done with cheap similarity retrieval instead of a trained network.
//
// SHARED, via Supabase `bot_episodes` (same shape as bot_champion_weights:
// public SELECT, authenticated INSERT with created_by = auth.uid(),
// append-only) — this game is mostly played online, so a memory that never
// left one browser would barely help. On load: async, non-blocking fetch
// of the most recent rows into a local cache (refreshFromCommunity() —
// mirrors bot.js's own loadCommunityChampion() pattern). On capture(): the
// swing is always remembered LOCALLY first (localStorage,
// godaigo_bot_episodes — works immediately, offline, and for a
// not-logged-in session), then best-effort submitted to Supabase when a
// session exists — silent no-op otherwise, same as
// bot_champion_weights' own submit path, and capped at
// MAX_SUBMITS_PER_SESSION so an unattended arena training run can't flood
// the shared table.
//
// TESTABILITY CAVEAT (same honesty standard as bot-imitation.js's own):
// fingerprint()/distance()/actionKey()/capture()/retrieveSimilar() are pure
// and unit-tested (test-mcts.mjs's sibling). The actual Supabase round trip
// — submitEpisode()/refreshFromCommunity() — is written to mirror
// loadCommunityChampion()'s already-proven pattern exactly, but hasn't
// been exercised against a real logged-in browser session from this tool;
// that needs a real online smoke test the same way bot-imitation.js's own
// ActionLog-comparison logic does.
//
// Sources: bot self-play, via bot.js's botAct() calling
// recordFromBotDecision() after every real action. A human-play capture
// hook (mirroring bot-imitation.js's ActionLog-based comparison) is a
// natural next step but is NOT built here — this first pass only remembers
// the BOT's own decisions.
//
// LOAD ORDER: after bot.js (needs window.BotSystem.evaluateSnapshot) and
// after whichever script initializes the bare `supabase` global — see
// index.html. Safe to load never at all: every caller checks
// window.BotMemory?.x first, and every Supabase call is try/catch-guarded
// the same way bot.js's loadCommunityChampion() is.
(function () {
    'use strict';

    const STORAGE_KEY = 'godaigo_bot_episodes';
    const MAX_EPISODES = 500;       // per-cache cap (local AND the fetched shared batch)
    const MAX_SUBMITS_PER_SESSION = 25; // guards the shared table against an unattended arena run
    const REMOTE_FETCH_LIMIT = 300;
    // Only a decision whose IMMEDIATE evaluateSnapshot() swing (for the
    // deciding player, before vs after) clears this magnitude is
    // remembered — most actions are unremarkable; this is "extremely good
    // or extremely bad," matching what was actually asked for. Scaled
    // against WEIGHTS.evalActivated (400 by default): roughly a quarter of
    // one activation's worth of swing.
    const SWING_THRESHOLD = 100;

    const ELEMENTS = ['earth', 'water', 'fire', 'wind', 'void'];

    function loadLocalEpisodes() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    }
    function saveLocalEpisodes(list) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_EPISODES))); }
        catch (e) { /* storage full/unavailable — drop silently, never break a real decision over this */ }
    }

    // Compact, comparable-across-games feature vector. Deliberately reuses
    // evaluateSnapshot()'s own score as one field instead of reimplementing
    // its feature weighting — that function already encodes "how good is
    // this position," which is exactly what similarity should be measured
    // against.
    function fingerprint(snap, forIndex) {
        const p = snap?.players?.[forIndex];
        if (!p) return null;
        const poolTotal = ELEMENTS.reduce((s, el) => s + (p.pool[el] || 0), 0);
        const poolNeeded = ELEMENTS.reduce((s, el) =>
            s + (!p.activated.includes(el) && (snap.sourcePool[el] || 0) > 0 ? (p.pool[el] || 0) : 0), 0);
        return {
            activatedCount: p.activated.length,
            apRemaining: snap.turn.activePlayerIndex === forIndex ? snap.turn.ap : 0,
            poolTotal,
            poolNeeded,
            handPlusActive: (p.handCount || 0) + (p.activeCount || 0),
            evalScore: window.BotSystem?.evaluateSnapshot ? window.BotSystem.evaluateSnapshot(snap, forIndex) : 0,
        };
    }

    // Weighted absolute-difference distance — smaller is more similar.
    // Weights roughly balance each field's natural scale (evalScore can run
    // into the hundreds/low thousands; the rest are small counts).
    const FIELD_SCALE = { activatedCount: 200, apRemaining: 40, poolTotal: 15, poolNeeded: 25, handPlusActive: 60, evalScore: 1 };
    function distance(a, b) {
        if (!a || !b) return Infinity;
        let d = 0;
        for (const key of Object.keys(FIELD_SCALE)) {
            d += Math.abs((a[key] || 0) - (b[key] || 0)) / FIELD_SCALE[key];
        }
        return d;
    }

    // A generalized, position-independent action key — exact board
    // coordinates never repeat across games, but "cast this scroll" or
    // "place this stone type" does.
    function actionKey(action) {
        if (!action) return null;
        if (action.type === 'cast' || action.type === 'placeStone') {
            return `${action.type}:${action.scroll || action.stoneType || ''}`;
        }
        return action.type;
    }

    let localCache = loadLocalEpisodes();
    let remoteCache = []; // replaced wholesale on each refreshFromCommunity(), never appended-to
    let submitsThisSession = 0;

    // Best-effort share to the shared table — mirrors bot.js's
    // loadCommunityChampion()'s submit-side sibling exactly: only when
    // logged in (RLS requires auth.uid() = created_by), never blocks or
    // throws on failure, capped per session.
    async function submitEpisode(fpBefore, key, swing) {
        try {
            if (submitsThisSession >= MAX_SUBMITS_PER_SESSION) return;
            if (typeof supabase === 'undefined' || !supabase?.from) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) return;
            submitsThisSession++;
            await supabase.from('bot_episodes').insert({
                activated_count: fpBefore.activatedCount,
                ap_remaining: fpBefore.apRemaining,
                pool_total: fpBefore.poolTotal,
                pool_needed: fpBefore.poolNeeded,
                hand_plus_active: fpBefore.handPlusActive,
                eval_score: fpBefore.evalScore,
                action_key: key,
                swing,
                source: 'bot-arena',
                created_by: session.user.id,
            });
        } catch (e) { /* offline / RLS / network hiccup — this decision was already remembered locally */ }
    }

    // Records one episode when the swing clears SWING_THRESHOLD. before/
    // after are BotState/BotSim-shaped snapshots straddling ONE action;
    // forIndex is whoever acted. Always remembered locally first (works
    // offline / not-logged-in); the shared submit is fire-and-forget on top.
    function capture(before, after, action, forIndex) {
        const fpBefore = fingerprint(before, forIndex);
        const fpAfter = fingerprint(after, forIndex);
        if (!fpBefore || !fpAfter) return;
        const key = actionKey(action);
        if (!key) return;
        const swing = fpAfter.evalScore - fpBefore.evalScore;
        if (Math.abs(swing) < SWING_THRESHOLD) return;
        localCache.push({ fingerprint: fpBefore, actionKey: key, swing, source: 'bot-arena', ts: Date.now() });
        if (localCache.length > MAX_EPISODES) localCache = localCache.slice(-MAX_EPISODES);
        saveLocalEpisodes(localCache);
        submitEpisode(fpBefore, key, swing); // fire-and-forget — never awaited by the caller
    }

    // Public: called from bot.js's botAct() right after a real decision was
    // applied. Never lets a memory bug break a real decision.
    function recordFromBotDecision(before, after, action, forIndex) {
        try { capture(before, after, action, forIndex); } catch (e) { /* ignore */ }
    }

    // Async, non-blocking refresh of the shared cache — call once at load
    // and periodically (e.g. once per turn) is plenty; retrieveSimilar()
    // always reads whatever's currently cached, stale or empty being no
    // worse than v1's local-only behavior.
    async function refreshFromCommunity() {
        try {
            if (typeof supabase === 'undefined' || !supabase?.from) return;
            const { data, error } = await supabase
                .from('bot_episodes')
                .select('activated_count, ap_remaining, pool_total, pool_needed, hand_plus_active, eval_score, action_key, swing, source, created_at')
                .order('created_at', { ascending: false })
                .limit(REMOTE_FETCH_LIMIT);
            if (error || !Array.isArray(data)) return;
            remoteCache = data.map(row => ({
                fingerprint: {
                    activatedCount: row.activated_count,
                    apRemaining: row.ap_remaining,
                    poolTotal: row.pool_total,
                    poolNeeded: row.pool_needed,
                    handPlusActive: row.hand_plus_active,
                    evalScore: row.eval_score,
                },
                actionKey: row.action_key,
                swing: row.swing,
                source: row.source,
                ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
            }));
        } catch (e) { /* offline / RLS / network hiccup — keep whatever was already cached */ }
    }

    // Returns the K most similar past episodes to `snap` (for forIndex),
    // closest first, across BOTH this browser's own local cache and the
    // last-fetched shared batch. Cheap linear scan — both caches are
    // small (<=500/<=300) and this only runs once at MCTS's root, never
    // per rollout step.
    function retrieveSimilar(snap, forIndex, k = 5) {
        const fp = fingerprint(snap, forIndex);
        if (!fp) return [];
        const pool = localCache.length || remoteCache.length ? [...localCache, ...remoteCache] : [];
        if (!pool.length) return [];
        return pool
            .map(ep => ({ ep, d: distance(fp, ep.fingerprint) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, Math.max(0, k))
            .map(x => x.ep);
    }

    function clearAll() {
        localCache = [];
        remoteCache = [];
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }

    window.BotMemory = {
        fingerprint,
        distance,
        actionKey,
        recordFromBotDecision,
        retrieveSimilar,
        refreshFromCommunity,
        getEpisodes: () => [...localCache, ...remoteCache],
        clearAll,
        SWING_THRESHOLD,
    };

    // Kick off an initial background refresh — harmless no-op offline/
    // logged-out (see refreshFromCommunity's own guards).
    refreshFromCommunity();
})();
