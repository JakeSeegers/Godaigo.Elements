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

        // discarding to resolve hand/active overflow (only offered when over capacity)
        discardBase:        10,
        discardActivated:   40,  // element already won — this copy has less value
        discardDeadElement: 30,  // source pool empty — no win credit ever again
        discardLevel:       -5,  // × scroll level — prefer to KEEP higher-level scrolls

        // placement phase: where to put the bot's starting player tile
        placeTileBase:            10,
        placeTileCentroidPenalty: -0.05, // × distance to cluster centroid — prefer compact placement

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

            case 'placeTile': {
                return WEIGHTS.placeTileBase + WEIGHTS.placeTileCentroidPenalty * (a.distToCentroid || 0);
            }

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

            case 'discardScroll': {
                const el = scrollElement(a.scroll);
                const def = window.SCROLL_DEFINITIONS?.[a.scroll];
                let s = WEIGHTS.discardBase + WEIGHTS.discardLevel * (def?.level || 0);
                if (el && ELEMENTS.includes(el)) {
                    if (self.activated.includes(el)) s += WEIGHTS.discardActivated;
                    if ((snap.sourcePool[el] || 0) <= 0) s += WEIGHTS.discardDeadElement;
                }
                // Never discard the scroll the current build plan needs
                if (_plan && a.scroll === _plan.scroll) s -= 1000;
                return s;
            }

            default: return -Infinity;
        }
    }

    // ----------------------------------------------------------------
    // Pattern plan (Stage 1.75): scroll patterns anchor to the hex the
    // caster STANDS ON when casting, and stones may only be placed
    // adjacent to the pawn — so multi-hex patterns need a plan: fix an
    // anchor (the casting spot), walk around placing each cell, return
    // to the anchor, cast. Without this the anchor drifts as the pawn
    // moves and the bot scatters stones that never complete anything.
    // ----------------------------------------------------------------
    let _plan = null; // { scroll, anchor:{q,r}, cells:[{q,r,x,y,type}] }

    function makePlan(snap) {
        const self = me(snap);
        if (!self || !self.hand) return null;
        const pHex = pixelToHex(self.x, self.y, TILE_SIZE);
        const grid = window.BotState.hexGrid();
        let best = null;
        for (const name of self.hand) {
            const def = window.SCROLL_DEFINITIONS?.[name];
            if (!def || def.level === 1 || !Array.isArray(def.patterns)) continue;
            const el = def.element;
            for (const variant of def.patterns) {
                const cells = variant.map(req => {
                    const px = hexToPixel(pHex.q + req.q, pHex.r + req.r, TILE_SIZE);
                    return { q: pHex.q + req.q, r: pHex.r + req.r, x: px.x, y: px.y, type: req.type };
                });
                if (!cells.every(c => grid.some(h => Math.hypot(h.x - c.x, h.y - c.y) < 5))) continue;
                let placed = 0, blocked = false;
                const need = {};
                for (const c of cells) {
                    const s = placedStones.find(st => Math.hypot(st.x - c.x, st.y - c.y) < 5);
                    if (s && s.type === c.type) placed++;
                    else if (s) { blocked = true; break; }
                    else need[c.type] = (need[c.type] || 0) + 1;
                }
                if (blocked) continue;
                // The pool must cover every missing stone NOW — half-built
                // shapes the bot can't finish are worse than nothing
                if (Object.entries(need).some(([t, n]) => (self.pool[t] || 0) < n)) continue;
                let score = placed * 10;
                if (!self.activated.includes(el) && (snap.sourcePool[el] || 0) > 0) score += 20;
                if ((snap.sourcePool[el] || 0) <= 0) score -= 50; // no win credit
                if (!best || score > best.score) best = { score, scroll: name, anchor: pHex, cells };
            }
        }
        return best ? { scroll: best.scroll, anchor: best.anchor, cells: best.cells } : null;
    }

    function planValid(snap) {
        if (!_plan) return false;
        const self = me(snap);
        if (!self) return false;
        const holding = (self.hand || []).includes(_plan.scroll) || self.active.includes(_plan.scroll);
        if (!holding) return false;
        for (const c of _plan.cells) {
            const s = placedStones.find(st => Math.hypot(st.x - c.x, st.y - c.y) < 5);
            if (s && s.type !== c.type) return false;                       // cell corrupted
            if (!s && (self.pool[c.type] || 0) <= 0) return false;          // can't supply anymore
        }
        return true;
    }

    // One walkable step toward any hex adjacent to `cell` (avoiding standing
    // on cells the plan still needs to fill). Returns a move action or null.
    function stepTowardCell(self, cell, missing, ap) {
        const grid = window.BotState.hexGrid();
        let bestPath = null;
        for (const h of grid) {
            const d = Math.hypot(h.x - cell.x, h.y - cell.y);
            if (d <= 5 || d >= 40) continue;                                 // must be adjacent to the cell
            if (missing.some(m => Math.hypot(m.x - h.x, m.y - h.y) < 5)) continue; // don't stand on an unfilled cell
            const path = window.BotState.findPath(self.x, self.y, h.x, h.y);
            if (!path || !path.length) continue;
            const cost = path.reduce((c, p) => c + p.cost, 0);
            if (!bestPath || cost < bestPath.cost) bestPath = { cost, step: path[0] };
        }
        if (bestPath && bestPath.step.cost <= ap) {
            return { type: 'move', x: bestPath.step.x, y: bestPath.step.y, cost: bestPath.step.cost };
        }
        return null;
    }

    // The next concrete action the plan dictates, or null (fall back to scoring)
    function planNextAction(snap) {
        if (!_plan || !planValid(snap)) { _plan = null; return null; }
        const self = me(snap);
        const missing = _plan.cells.filter(c =>
            !placedStones.some(st => st.type === c.type && Math.hypot(st.x - c.x, st.y - c.y) < 5));

        if (missing.length) {
            for (const c of missing) {
                if (typeof isInPlacementRange === 'function' && isInPlacementRange(c.x, c.y, c.type)) {
                    return { type: 'placeStone', x: c.x, y: c.y, stoneType: c.type, scroll: _plan.scroll,
                             progress: (_plan.cells.length - missing.length + 1) / _plan.cells.length };
                }
            }
            if (snap.turn.ap > 0) {
                // fill the farthest-from-anchor cells first so placed stones
                // (earth blocks movement!) don't wall off the rest of the shape
                const aPx = hexToPixel(_plan.anchor.q, _plan.anchor.r, TILE_SIZE);
                const ordered = [...missing].sort((a, b) =>
                    Math.hypot(b.x - aPx.x, b.y - aPx.y) - Math.hypot(a.x - aPx.x, a.y - aPx.y));
                for (const c of ordered) {
                    const mv = stepTowardCell(self, c, missing, snap.turn.ap);
                    if (mv) return mv;
                }
            }
            return null; // out of AP / unreachable — generic scoring takes over
        }

        // Shape complete → return to the anchor and cast
        const aPx = hexToPixel(_plan.anchor.q, _plan.anchor.r, TILE_SIZE);
        if (Math.hypot(self.x - aPx.x, self.y - aPx.y) >= 5) {
            if (snap.turn.ap > 0) {
                const path = window.BotState.findPath(self.x, self.y, aPx.x, aPx.y);
                if (path && path.length && path[0].cost <= snap.turn.ap) {
                    return { type: 'move', x: path[0].x, y: path[0].y, cost: path[0].cost };
                }
            }
            return null;
        }
        if (snap.turn.ap >= 2 && window.spellSystem.checkPattern(_plan.scroll)) {
            return { type: 'cast', scroll: _plan.scroll };
        }
        return null;
    }

    // Rank all legal actions for the current position (debug + decision core)
    function rankActions() {
        const snap = window.BotState.snapshot();
        const legal = window.BotState.legalActions();

        // Placement phase: no pawn placed yet, so me(snap) is null — the only
        // legal actions are placeTile candidates, scored without needing self.
        if (legal.length && legal[0].type === 'placeTile') {
            return legal
                .map(a => ({ action: a, score: scoreAction(a, snap, {}) }))
                .sort((x, y) => y.score - x.score);
        }

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

        return legal
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

        const snap = window.BotState.snapshot();

        // Hand/active overflow must resolve before anything else — including
        // the pattern plan below, which calls applyAction() directly and would
        // otherwise bypass legalActions()'s discard-only gate while over
        // capacity (see bot-state.js legalActions() overflow gate).
        const self0 = me(snap);
        if (self0) {
            const maxHand = window.spellSystem?.MAX_HAND_SIZE ?? 2;
            const maxActive = window.spellSystem?.MAX_ACTIVE_SIZE ?? 2;
            if (self0.handCount > maxHand || self0.activeCount > maxActive) {
                const ranked = rankActions(); // legalActions() returns discards only right now
                if (ranked.length) {
                    const { action } = ranked[0];
                    log(`Resolving scroll overflow: discard ${action.scroll} (from ${action.from})`);
                    const r = window.BotState.applyAction(action);
                    if (r.ok) return action;
                    log(`Discard failed (${r.reason})`);
                }
                return null;
            }
        }

        // The pattern plan takes priority: it's the only way multi-hex
        // patterns ever complete under the adjacent-only placement rule
        if (!_plan || !planValid(snap)) {
            _plan = makePlan(snap);
            if (_plan) log(`New plan: build ${_plan.scroll} anchored at hex (${_plan.anchor.q},${_plan.anchor.r})`);
        }
        const planAction = _plan ? planNextAction(snap) : null;
        if (planAction) {
            const label = planAction.type === 'cast' ? `cast ${planAction.scroll}`
                        : planAction.type === 'placeStone' ? `place ${planAction.stoneType} for ${planAction.scroll}`
                        : `move to (${planAction.x.toFixed(0)},${planAction.y.toFixed(0)})`;
            log(`Plan action: ${label}`);
            const r = window.BotState.applyAction(planAction);
            if (r.ok) {
                if (planAction.type === 'cast') _plan = null; // plan fulfilled
                return planAction;
            }
            log(`Plan action failed (${r.reason}) — falling back to scoring`);
            _plan = null;
        }

        const ranked = rankActions();
        if (!ranked.length) { log('No legal actions found'); return null; }

        const { action, score } = ranked[0];
        const label = action.type === 'placeTile'      ? `place player tile at (${action.x.toFixed(0)},${action.y.toFixed(0)})`
                    : action.type === 'cast'           ? `cast ${action.scroll}`
                    : action.type === 'placeStone'     ? `place ${action.stoneType} for ${action.scroll} (${Math.round((action.progress||0)*100)}%)`
                    : action.type === 'move'           ? `move to (${action.x.toFixed(0)},${action.y.toFixed(0)}) cost ${action.cost}`
                    : action.type === 'discardScroll'  ? `discard ${action.scroll} (from ${action.from})`
                    : 'end turn';
        log(`Best action [${score.toFixed(1)}]: ${label}  (of ${ranked.length} candidates)`);

        const res = window.BotState.applyAction(action);
        if (!res.ok) { log(`Action failed: ${res.reason}`); return null; }
        return action;
    }

    // ----------------------------------------------------------------
    // Quiescence: after a cast, multiplayer opens a ~15s response window;
    // some scroll effects enter selection modes or cascade prompts that
    // wait for input. The bot must NOT take its next action (or end its
    // turn) until this machinery settles — otherwise the stack resolves
    // after the turn has passed, attributed to the wrong player.
    // Resolves what it can (cascade prompt), cancels what it can't drive
    // (selection modes), and waits out the rest.
    // ----------------------------------------------------------------
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function waitForQuiescence() {
        const deadline = Date.now() + 25000;
        while (Date.now() < deadline) {
            // Cascade prompt (scroll drawn onto a full hand): choose like a
            // player would — keep the new scroll usable if possible
            const cascade = document.getElementById('cascade-popup');
            if (cascade) {
                const buttons = [...cascade.querySelectorAll('button')];
                const pick = buttons.find(b => b.textContent === 'To Active') ||
                             buttons.find(b => b.textContent === 'To Common');
                if (pick) { log(`Cascade prompt: choosing "${pick.textContent}"`); pick.click(); }
                await sleep(250);
                continue;
            }
            // Selection modes (Sacrificial Pyre, Telekinesis, Take Flight, …)
            // need input the bot can't give yet — cancel so the turn never wedges
            const se = window.spellSystem?.scrollEffects;
            if (se?.selectionMode || window.takeFlightState) {
                log('Cancelling a selection mode the bot cannot drive');
                se?.cancelSelectionMode?.();
                if (window.takeFlightState) window.takeFlightState = null;
                await sleep(250);
                continue;
            }
            // Response window after a cast (multiplayer): wait the stack out
            if (window.spellSystem?.responseWindow?.isResponseWindowOpen) {
                await sleep(400);
                continue;
            }
            return; // quiet — safe to act again
        }
        log('waitForQuiescence timed out — proceeding anyway');
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
                await waitForQuiescence();
                if (activePlayerIndex !== startingPlayer) break;
                const applied = botAct();
                if (!applied) break;
                if (applied.type === 'endTurn') break;
                await sleep(350);
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
        waitForQuiescence,    // settle response windows / selection modes / cascades
        WEIGHTS,              // live tuning surface (Stage 3a evolves this)
        DEFAULT_WEIGHTS,
    };

    log('Loaded — Shift+R = one bot step, Shift+B = full bot turn');
})();
