// ============================================================
// bot.js — Stage 1 utility bot for Godaigo (docs/bot-roadmap.md)
// ============================================================
// HOW TO USE:
//   Shift+R  → execute ONE bot action for the active player
//   Shift+B  → play out the WHOLE turn (loops actions until end of turn)
//   Console  → window.BotSystem.step() / .turn() / .rank() / .WEIGHTS
//
// HOW IT DECIDES (Stage 1 of the roadmap — no lookahead yet):
//   1. BotState.legalActions() enumerates every legal action
//   2. scoreAction() gives each a utility: Σ weight × feature
//   3. argmax wins. All strategy knobs live in WEIGHTS — tune the table,
//      not the code. Stage 3a evolution writes better weights to
//      localStorage['godaigo_bot_weights'], loaded over defaults at startup.
//
// Observation/actuation is bot-state.js (window.BotState). This file must
// never touch game internals directly except through BotState + snapshot.
//
// LOAD ORDER: after bot-state.js (which is after lobby.js)
// ============================================================

(function () {
    'use strict';

    function log(...args) { console.log('🤖 [Bot]', ...args); }

    const ELEMENTS = ['earth', 'water', 'fire', 'wind', 'void'];
    const POOL_CAP = 5;

    // ----------------------------------------------------------------
    // WEIGHTS — the single tuning surface. Stage 3a evolves this table.
    // Positive = more attractive. Rough scale: 100 ≈ "clearly best action".
    // ----------------------------------------------------------------
    const DEFAULT_WEIGHTS = {
        // casting
        castBase:          100,  // any satisfied pattern is usually worth firing
        castUnactivated:    80,  // scroll element not yet activated (win progress!)
        castDeadElement:   -60,  // source pool empty → effect fires but NO win credit
        castLevel:           2,  // per scroll level — mild preference for big scrolls

        // stone placement toward a pattern
        placeBase:          20,
        placeProgress:      45,  // × fraction of the variant complete AFTER this stone
        placeUnactivated:   25,  // building toward an unactivated element
        placeDeadElement:  -30,  // building toward an element with an empty source pool

        // movement
        moveBase:            2,
        moveShrineValue:    30,  // × (target shrine value ÷ (1 + remaining path cost))
        moveApPenalty:      -1,  // × step cost — cheap steps preferred
        moveExplore:        18,  // step lands on an unrevealed tile (reveals it — draws a scroll)
        moveExploreGradient: 0.15, // × px closed toward the nearest unrevealed tile

        // ending the turn
        endTurnBase:         1,  // always a legal fallback, never attractive by itself
        endTurnOnShrine:    55,  // standing on a collectible shrine centre: end = collect
        endTurnLowAp:        6,  // + when AP ≤ 1 — nothing useful left to do

        // shrine valuation (used inside move/endTurn features)
        shrineNeed:          1.0, // × (capacity − pool[element])
        shrineUnactivated:   2.5, // element not yet activated
        shrineDeadSource:  -3.0,  // source pool empty — collection yields nothing
    };

    // Evolved weights (Stage 3a) override defaults without code edits
    let WEIGHTS = { ...DEFAULT_WEIGHTS };
    try {
        const saved = JSON.parse(localStorage.getItem('godaigo_bot_weights') || 'null');
        if (saved && typeof saved === 'object') {
            WEIGHTS = { ...DEFAULT_WEIGHTS, ...saved };
            log('Loaded evolved weights from localStorage');
        }
    } catch (e) { /* corrupt save — keep defaults */ }

    // ----------------------------------------------------------------
    // Derived state helpers (read ONLY from the snapshot — never from
    // game internals, and never from hidden information)
    // ----------------------------------------------------------------
    function me(snap) { return snap.players[snap.turn.activePlayerIndex]; }

    function scrollElement(name) {
        return window.SCROLL_DEFINITIONS?.[name]?.element || null;
    }

    // Worth of collecting at a shrine of this element right now
    function shrineValue(snap, element) {
        const self = me(snap);
        if (!self) return 0;
        const need = Math.max(0, POOL_CAP - (self.pool[element] || 0));
        if (need === 0) return 0;                       // pool already full
        let v = WEIGHTS.shrineNeed * need;
        if (!self.activated.includes(element)) v += WEIGHTS.shrineUnactivated * need;
        if ((snap.sourcePool[element] || 0) <= 0) v += WEIGHTS.shrineDeadSource * need;
        return Math.max(0, v);
    }

    // Collectible shrine tiles: revealed, elemental, and worth something
    function collectibleShrines(snap) {
        return snap.tiles.filter(t =>
            t.revealed && !t.isPlayerTile &&
            ELEMENTS.includes(t.shrineType) &&
            shrineValue(snap, t.shrineType) > 0);
    }

    function shrineUnderfoot(snap) {
        const self = me(snap);
        if (!self) return null;
        return collectibleShrines(snap).find(t => Math.hypot(t.x - self.x, t.y - self.y) < 5) || null;
    }

    // ----------------------------------------------------------------
    // scoreAction — the Stage-1 utility function. Tune WEIGHTS, not this.
    // ----------------------------------------------------------------
    function scoreAction(a, snap, ctx) {
        const self = me(snap);
        switch (a.type) {

            case 'cast': {
                const el = scrollElement(a.scroll);
                const def = window.SCROLL_DEFINITIONS?.[a.scroll];
                let s = WEIGHTS.castBase + WEIGHTS.castLevel * (def?.level || 0);
                if (el && ELEMENTS.includes(el)) {
                    const dead = (snap.sourcePool[el] || 0) <= 0;
                    if (dead) s += WEIGHTS.castDeadElement;          // no win credit
                    else if (!self.activated.includes(el)) s += WEIGHTS.castUnactivated;
                }
                return s;
            }

            case 'placeStone': {
                const el = scrollElement(a.scroll);
                let s = WEIGHTS.placeBase + WEIGHTS.placeProgress * (a.progress || 0);
                if (el && ELEMENTS.includes(el)) {
                    if ((snap.sourcePool[el] || 0) <= 0) s += WEIGHTS.placeDeadElement;
                    else if (!self.activated.includes(el)) s += WEIGHTS.placeUnactivated;
                }
                return s;
            }

            case 'move': {
                // Value = best shrine reachable via this step: worth ÷ remaining cost.
                // ctx.paths caches Dijkstra results per target for this decision.
                let best = 0;
                for (const t of ctx.shrines) {
                    const path = ctx.paths.get(t.id);
                    if (!path || !path.length) continue;
                    const first = path[0];
                    if (Math.hypot(first.x - a.x, first.y - a.y) >= 5) continue; // step isn't on this path
                    const remaining = path.reduce((c, p) => c + p.cost, 0);
                    const v = shrineValue(snap, t.shrineType) / (1 + remaining);
                    if (v > best) best = v;
                }
                // Exploration: landing on an unrevealed tile flips it (scroll draw!);
                // otherwise reward closing distance to the nearest hidden tile.
                let explore = 0;
                if (ctx.hiddenTiles.length) {
                    const onHidden = ctx.hiddenTiles.some(t => Math.hypot(t.x - a.x, t.y - a.y) < 70);
                    if (onHidden) explore += WEIGHTS.moveExplore;
                    else {
                        const distFrom = p => Math.min(...ctx.hiddenTiles.map(t => Math.hypot(t.x - p.x, t.y - p.y)));
                        explore += WEIGHTS.moveExploreGradient * (distFrom(self) - distFrom(a));
                    }
                }
                return WEIGHTS.moveBase + WEIGHTS.moveShrineValue * best
                     + WEIGHTS.moveApPenalty * a.cost + explore;
            }

            case 'endTurn': {
                let s = WEIGHTS.endTurnBase;
                if (ctx.onShrine) {
                    s += WEIGHTS.endTurnOnShrine
                       + shrineValue(snap, ctx.onShrine.shrineType);
                }
                if (snap.turn.ap <= 1) s += WEIGHTS.endTurnLowAp;
                return s;
            }

            default: return -Infinity;
        }
    }

    // Rank all legal actions for the current position (debug + decision core)
    function rankActions() {
        const snap = window.BotState.snapshot();
        const self = me(snap);
        if (!self) return [];

        const ctx = {
            shrines: collectibleShrines(snap),
            onShrine: shrineUnderfoot(snap),
            hiddenTiles: snap.tiles.filter(t => !t.revealed && !t.isPlayerTile),
            paths: new Map(),
        };
        for (const t of ctx.shrines) {
            ctx.paths.set(t.id, window.BotState.findPath(self.x, self.y, t.x, t.y));
        }

        return window.BotState.legalActions()
            .map(a => ({ action: a, score: scoreAction(a, snap, ctx) }))
            .sort((x, y) => y.score - x.score);
    }

    // ----------------------------------------------------------------
    // One bot step: pick argmax, apply it. Returns the applied action or null.
    // ----------------------------------------------------------------
    function botAct() {
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer &&
            typeof myPlayerIndex !== 'undefined' && activePlayerIndex !== myPlayerIndex) {
            log('Not this client\'s turn — refusing to act (multiplayer guard)');
            return null;
        }

        const ranked = rankActions();
        if (!ranked.length) { log('No legal actions found'); return null; }

        const { action, score } = ranked[0];
        const label = action.type === 'cast'       ? `cast ${action.scroll}`
                    : action.type === 'placeStone' ? `place ${action.stoneType} for ${action.scroll} (${Math.round((action.progress||0)*100)}%)`
                    : action.type === 'move'       ? `move to (${action.x.toFixed(0)},${action.y.toFixed(0)}) cost ${action.cost}`
                    : 'end turn';
        log(`Best action [${score.toFixed(1)}]: ${label}  (of ${ranked.length} candidates)`);

        const res = window.BotState.applyAction(action);
        if (!res.ok) { log(`Action failed: ${res.reason}`); return null; }
        return action;
    }

    // ----------------------------------------------------------------
    // Whole-turn autopilot: loop steps until the turn ends (or safety cap).
    // Async with a small delay so reveals/casts/HUD settle between actions.
    // ----------------------------------------------------------------
    let _turnRunning = false;
    async function botTurn() {
        if (_turnRunning) { log('Turn already running'); return; }
        _turnRunning = true;
        const startingPlayer = activePlayerIndex;
        try {
            for (let i = 0; i < 30; i++) {                    // safety cap
                if (activePlayerIndex !== startingPlayer) break; // turn passed
                const applied = botAct();
                if (!applied) break;
                if (applied.type === 'endTurn') break;
                await new Promise(r => setTimeout(r, 350));
            }
        } finally {
            _turnRunning = false;
        }
        log('Turn autopilot finished');
    }

    // ----------------------------------------------------------------
    // Keyboard: Shift+R = one step, Shift+B = whole turn.
    // Same guards as game-ui.js (no lobby, no text inputs).
    // ----------------------------------------------------------------
    document.addEventListener('keydown', function (e) {
        if (!e.shiftKey) return;
        const key = e.key.toUpperCase();
        if (key !== 'R' && key !== 'B') return;

        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        if (!document.getElementById('game-layout')?.classList.contains('active')) return;

        e.preventDefault();
        if (key === 'R') { log('Shift+R — one bot step'); botAct(); }
        else             { log('Shift+B — bot plays out the turn'); botTurn(); }
    });

    // ----------------------------------------------------------------
    // Public API (console debugging + Stage 2/3 hooks)
    // ----------------------------------------------------------------
    window.BotSystem = {
        step:  botAct,        // one action
        turn:  botTurn,       // play out the whole turn
        rank:  rankActions,   // scored candidate list (top = what step() would do)
        score: scoreAction,   // (action, snapshot, ctx) → utility
        WEIGHTS,              // live tuning surface (Stage 3a evolves this)
        DEFAULT_WEIGHTS,
    };

    log('Loaded — Shift+R = one bot step, Shift+B = full bot turn');
})();
