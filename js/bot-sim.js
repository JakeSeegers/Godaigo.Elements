// ============================================================
// bot-sim.js — Stage 2 of docs/bot-roadmap.md: forward model
// ============================================================
// PURE simulation over the Stage-0 snapshot JSON: no DOM, no game
// globals, no hidden information. Everything a search needs to ask
// "what would the state look like after this action?" without
// touching the live game.
//
//   BotSim.simulate(snap, action) → snap'   (input never mutated)
//   BotSim.legalActions(snap)     → Action[] (pure mirror of BotState.legalActions)
//   BotSim.isTerminal(snap) / BotSim.winner(snap)
//   BotSim.evaluateFor(snap, i)   → heuristic value of snap for player i
//   BotSim.validate(opts)         → live-game harness (async, IMPURE by design):
//                                   mirrors random real actions and diffs
//                                   predicted vs real snapshots
//
// WHAT IS MODELLED EXACTLY (validated by BotSim.validate):
//   move        pawn xy, AP − cost, tile reveal (as shrineType:'unknown' —
//               never invents the hidden element), scroll draw on reveal
//   endTurn     shrine collection (rank-based, source/pool capped), turn
//               advance in COLOR_RANK order, AP reset to 5 + void stones
//   placeStone  pool decrement + the fire-destruction interaction rules
//   discard     hand/active removal
//
// WHAT IS ONLY PARTIALLY MODELLED:
//   cast        AP cost, hand→active, win-condition activation (incl. the
//               empty-source-pool rule and catacomb component elements) are
//               exact. The scroll EFFECT is simulated only for scrolls in
//               SIMULATED_SCROLLS; anything else is recorded in
//               snap.sim.unsimulatedCasts so a search can score it with a
//               flat heuristic instead of pretending to know the outcome.
//
// KNOWN ACCEPTED DIVERGENCES (deliberate, all rare and all logged):
//   - scroll-effect side effects of non-whitelisted casts
//   - catacomb reveal's +1 AP (element of a hidden tile is unknowable)
//   - active buffs (Mudslide, Simplify, Mason's Savvy, …) — not in snapshot
//   - fire-destruction re-check cascades beyond the placed stone's neighbors
//
// The only globals read are STATIC data (window.SCROLL_DEFINITIONS) and,
// inside validate() only, the live BotState/BotSystem.
//
// LOAD ORDER: after bot-state.js, before bot.js.
// ============================================================

(function () {
    'use strict';

    function log(...args) { console.log('🔮 [BotSim]', ...args); }

    const ELEMENTS = ['earth', 'water', 'fire', 'wind', 'void'];
    const TILE = 20;               // TILE_SIZE — small board hex size
    const HEX_NEAR = 5;            // px — "same hex"
    const HEX_STEP = 40;           // px — "adjacent hex" upper bound
    const STONE_NEIGHBOR_MAX = 50; // px — getNeighborStones() window (5..50)
    const POOL_CAP = 5;            // per-element player pool capacity
    const SOURCE_CAP = 25;         // per-element source pool capacity
    const CAST_COST = 2;           // SPELL_AP_COST (buff discounts not modelled)
    const MAX_HAND = 2, MAX_ACTIVE = 2;
    const BASE_AP = 5;

    // Shrine collection amounts (replenishShrineStones in game-ui.js)
    const REPLENISH = { void: 1, wind: 2, fire: 3, water: 4, earth: 5 };

    // Turn order (end-turn handler in game-ui.js sorts players by this)
    const COLOR_RANK = {
        '#9458f4': 1, '#ffce00': 2, '#ed1b43': 3, '#5894f4': 4, '#69d83a': 5
    };

    // Placeholder for a scroll whose identity the simulator cannot know
    // (drawn from a face-down tile's deck during simulation)
    const UNKNOWN_SCROLL = '?unknown?';

    // Scrolls whose EFFECT is simulated. Anything absent gets the universal
    // cast bookkeeping only + an entry in snap.sim.unsimulatedCasts. Add a
    // scroll here ONLY together with harness evidence that its simulation
    // matches the real effect.
    const SIMULATED_SCROLLS = new Set();

    // Small-hex offsets making up one large tile (getAllHexagonPositions):
    // hidden non-player tiles expose only the outer ring; revealed/player
    // tiles expose all 13. Trapezoid offsets become walkable "bridge" hexes
    // only where the trapezoids of TWO OR MORE tiles coincide (hidden tiles
    // contribute too) — landing on one reveals the hidden neighbours.
    const RING_OFFSETS = [[2, -1], [1, 1], [-1, 2], [-2, 1], [-1, -1], [1, -2]];
    const ALL_OFFSETS = [
        [0, 0],
        [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
        ...RING_OFFSETS
    ];
    const TRAPEZOID_OFFSETS = [[2, 0], [0, 2], [-2, 2], [-2, 0], [0, -2], [2, -2]];

    // ----------------------------------------------------------------
    // Pure helpers
    // ----------------------------------------------------------------
    // Flat-top axial → pixel (matches game-core hexToPixel; linear in q,r so
    // relative offsets can be added straight to a pixel position)
    function hexToPixel(q, r, s) {
        return { x: s * Math.sqrt(3) * (q + r / 2), y: s * 1.5 * r };
    }
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const clone = snap => JSON.parse(JSON.stringify(snap));

    function simNotes(snap) {
        if (!snap.sim) snap.sim = { unsimulatedCasts: [], notes: [], turnsEnded: 0 };
        if (snap.sim.turnsEnded == null) snap.sim.turnsEnded = 0;
        return snap.sim;
    }

    function activePlayer(snap) { return snap.players[snap.turn.activePlayerIndex]; }

    function stoneAt(snap, x, y) {
        return snap.stones.find(s => dist(s.x, s.y, x, y) < HEX_NEAR) || null;
    }
    function neighborStones(snap, x, y) {
        return snap.stones.filter(s => {
            const d = dist(s.x, s.y, x, y);
            return d > HEX_NEAR && d < STONE_NEIGHBOR_MAX;
        });
    }
    function hasAdjacentVoid(snap, x, y) {
        return neighborStones(snap, x, y).some(s => s.type === 'void');
    }

    // ----------------------------------------------------------------
    // Walkable hex grid derived purely from the snapshot (memoized per
    // snapshot object). Entries: {x, y, key, tileIds:[…]}.
    // ----------------------------------------------------------------
    const _gridCache = new WeakMap();
    function grid(snap) {
        let g = _gridCache.get(snap);
        if (g) return g;
        const byKey = new Map();
        const addHex = (t, q, r, map) => {
            const p = hexToPixel(q, r, TILE);
            const x = t.x + p.x, y = t.y + p.y;
            const key = `${Math.round(x)},${Math.round(y)}`;
            let entry = map.get(key);
            if (!entry) { entry = { x, y, key, tileIds: [] }; map.set(key, entry); }
            if (!entry.tileIds.includes(t.id)) entry.tileIds.push(t.id);
            return entry;
        };
        for (const t of snap.tiles) {
            const offsets = (!t.revealed && !t.isPlayerTile) ? RING_OFFSETS : ALL_OFFSETS;
            for (const [q, r] of offsets) addHex(t, q, r, byKey);
        }
        // Trapezoid bridges: walkable only where ≥2 tiles' trapezoids coincide
        const traps = new Map();
        for (const t of snap.tiles) {
            for (const [q, r] of TRAPEZOID_OFFSETS) addHex(t, q, r, traps);
        }
        for (const [key, entry] of traps) {
            if (entry.tileIds.length >= 2 && !byKey.has(key)) byKey.set(key, entry);
        }
        g = [...byKey.values()];
        _gridCache.set(snap, g);
        return g;
    }

    // ----------------------------------------------------------------
    // Movement cost model — pure mirror of canPlayerMoveToHex()
    // ----------------------------------------------------------------
    // Water chaining (getChainedAbility): flood fill through connected,
    // non-voided water; adjacent non-voided wind ⇒ free, earth ⇒ blocked.
    function chainedAbility(snap, x, y) {
        const stone = stoneAt(snap, x, y);
        if (!stone || stone.type !== 'water') return null;
        if (hasAdjacentVoid(snap, x, y)) return null;

        const visited = new Set([`${stone.x.toFixed(1)},${stone.y.toFixed(1)}`]);
        const queue = [stone];
        let hasWind = false, hasEarth = false;
        while (queue.length) {
            const cur = queue.shift();
            for (const nb of neighborStones(snap, cur.x, cur.y)) {
                if (nb.type === 'wind' && !hasAdjacentVoid(snap, nb.x, nb.y)) hasWind = true;
                else if (nb.type === 'earth' && !hasAdjacentVoid(snap, nb.x, nb.y)) hasEarth = true;
                else if (nb.type === 'water') {
                    const key = `${nb.x.toFixed(1)},${nb.y.toFixed(1)}`;
                    if (!visited.has(key) && !hasAdjacentVoid(snap, nb.x, nb.y)) {
                        visited.add(key);
                        queue.push(nb);
                    }
                }
            }
        }
        if (hasWind) return 'wind'; // wind outranks earth
        if (hasEarth) return 'earth';
        return null;
    }

    function canMoveTo(snap, x, y) {
        const ai = snap.turn.activePlayerIndex;
        const occupied = snap.players.some((p, i) =>
            p && i !== ai && dist(p.x, p.y, x, y) < HEX_NEAR);
        if (occupied) return { canMove: false, cost: Infinity };

        // Mirror of canPlayerMoveToHex()'s isOpponentTileCenter() block —
        // another player's tile centre is off-limits (your own stays
        // reachable, needed for the win condition).
        const onOpponentTileCenter = snap.tiles.some(t =>
            t.isPlayerTile && t.playerIndex !== null && t.playerIndex !== ai &&
            dist(t.x, t.y, x, y) < HEX_NEAR);
        if (onOpponentTileCenter) return { canMove: false, cost: Infinity };

        const stone = stoneAt(snap, x, y);
        if (!stone) return { canMove: true, cost: 1 };

        if (stone.type === 'water') {
            const chained = chainedAbility(snap, x, y);
            if (chained === 'wind') return { canMove: true, cost: 0 };
            if (chained === 'earth') return { canMove: false, cost: Infinity };
            return { canMove: true, cost: 2 };
        }
        if (stone.type === 'earth') {
            return hasAdjacentVoid(snap, x, y)
                ? { canMove: true, cost: 1 }
                : { canMove: false, cost: Infinity };
        }
        if (stone.type === 'wind') {
            return hasAdjacentVoid(snap, x, y)
                ? { canMove: true, cost: 1 }
                : { canMove: true, cost: 0 };
        }
        return { canMove: true, cost: 1 }; // fire, void — baseline
    }

    // ----------------------------------------------------------------
    // Pattern check — pure mirror of spellSystem.checkPatternForPlayer()
    // ----------------------------------------------------------------
    function checkPattern(snap, scrollName, playerIndex = snap.turn.activePlayerIndex) {
        const def = window.SCROLL_DEFINITIONS?.[scrollName];
        const p = snap.players[playerIndex];
        if (!def || !Array.isArray(def.patterns) || !p) return false;
        return def.patterns.some(variant => variant.every(req => {
            const off = hexToPixel(req.q, req.r, TILE);
            const s = stoneAt(snap, p.x + off.x, p.y + off.y);
            return s && s.type === req.type;
        }));
    }

    // ----------------------------------------------------------------
    // Fire interaction rules (processStoneInteractions), applied to a
    // freshly placed stone. Net effect of the real code:
    //  - a placed non-fire/non-void stone adjacent to any fire that has no
    //    adjacent void is destroyed (covers the water-mimicry special case:
    //    every branch of it destroys the water too)
    //  - a placed fire with no adjacent void destroys all adjacent
    //    non-fire/non-void stones
    // Destroyed stones return to the SOURCE pool (returnStoneToPool).
    // Not modelled: re-check cascades beyond the placement neighborhood.
    // ----------------------------------------------------------------
    function destroyStone(snap, stone) {
        snap.stones = snap.stones.filter(s => s !== stone);
        if ((snap.sourcePool[stone.type] || 0) < SOURCE_CAP) {
            snap.sourcePool[stone.type]++;
        }
    }

    // Would a stone placed here survive the fire-interaction rules?
    // (fire and void are never destroyed on placement; anything else dies
    // next to a fire that has no adjacent void). Lets planners AVOID doomed
    // cells instead of discovering them by wasting stones.
    function stoneWouldSurvive(snap, x, y, type) {
        if (type === 'fire' || type === 'void') return true;
        return !neighborStones(snap, x, y).some(nb =>
            nb.type === 'fire' && !hasAdjacentVoid(snap, nb.x, nb.y));
    }

    function applyFireInteractions(snap, placed) {
        if (placed.type === 'fire') {
            if (!hasAdjacentVoid(snap, placed.x, placed.y)) {
                for (const nb of neighborStones(snap, placed.x, placed.y)) {
                    if (nb.type !== 'void' && nb.type !== 'fire') destroyStone(snap, nb);
                }
            }
            return;
        }
        if (placed.type === 'void') return;
        const killer = neighborStones(snap, placed.x, placed.y).some(nb =>
            nb.type === 'fire' && !hasAdjacentVoid(snap, nb.x, nb.y));
        if (killer) destroyStone(snap, placed);
    }

    // ----------------------------------------------------------------
    // Action simulators — each takes the CLONED snapshot and mutates it
    // ----------------------------------------------------------------
    function drawScrollOnReveal(snap, playerIndex) {
        // revealTile → onTileRevealed draws the tile element's top deck
        // scroll into the revealing player's hand — even past MAX_HAND
        // (overflow lingers as a pending cascade the player resolves later,
        // so the snapshot really does show handCount > capacity).
        const p = snap.players[playerIndex];
        if (!p) return;
        if (p.hand) p.hand.push(UNKNOWN_SCROLL);
        p.handCount++;
    }

    function simMove(snap, a) {
        const p = activePlayer(snap);
        p.x = a.x; p.y = a.y;
        snap.turn.ap -= (a.cost ?? 1);

        // Landing on any hex of a face-down tile reveals it (handlePlayerLanding)
        const here = grid(snap).find(h => dist(h.x, h.y, a.x, a.y) < HEX_NEAR);
        if (here) {
            for (const id of here.tileIds) {
                const t = snap.tiles.find(t => t.id === id);
                if (t && !t.revealed && !t.isPlayerTile) {
                    t.revealed = true;
                    t.shrineType = 'unknown'; // NEVER invent the hidden element
                    drawScrollOnReveal(snap, snap.turn.activePlayerIndex);
                    simNotes(snap).notes.push(`revealed tile ${t.id} (element unknown; catacomb +1 AP not modelled)`);
                }
            }
        }
    }

    function simEndTurn(snap) {
        const ai = snap.turn.activePlayerIndex;
        const p = snap.players[ai];

        // Shrine collection: standing on a revealed elemental shrine CENTRE
        if (p) {
            const shrine = snap.tiles.find(t =>
                !t.isPlayerTile && t.revealed && dist(t.x, t.y, p.x, p.y) < HEX_NEAR);
            if (shrine && shrine.shrineType && shrine.shrineType !== 'catacomb') {
                if (shrine.shrineType === 'unknown') {
                    simNotes(snap).notes.push('endTurn on an unknown-element shrine — collection not modelled');
                } else if (ELEMENTS.includes(shrine.shrineType)) {
                    const el = shrine.shrineType;
                    const amount = Math.min(
                        REPLENISH[el],
                        snap.sourcePool[el] || 0,
                        POOL_CAP - (p.pool[el] || 0)
                    );
                    if (amount > 0) {
                        snap.sourcePool[el] -= amount;
                        p.pool[el] = (p.pool[el] || 0) + amount;
                    }
                }
            }
        }

        // Advance the turn in COLOR_RANK order (end-turn handler in game-ui.js)
        const order = snap.players
            .map((pl, i) => pl ? { i, rank: COLOR_RANK[pl.color] || 999 } : null)
            .filter(Boolean)
            .sort((a, b) => a.rank - b.rank);
        let next = ai;
        if (order.length > 1) {
            const cur = order.findIndex(o => o.i === ai);
            next = order[(cur === -1 ? order.length - 1 : cur + 1) % order.length].i;
        }
        snap.turn.activePlayerIndex = next;
        const nextPool = snap.players[next]?.pool || {};
        snap.turn.ap = BASE_AP + (nextPool.void || 0); // AP reset + refreshVoidAP

        // Search support: a state evaluator must know the turn boundary was
        // crossed — otherwise the AP reset makes endTurn look like free value
        // (especially in single-player, where activePlayerIndex doesn't change).
        simNotes(snap).turnsEnded++;
    }

    function simPlaceStone(snap, a) {
        const p = activePlayer(snap);
        if ((p.pool[a.stoneType] || 0) <= 0) return; // guard mirrors applyAction
        p.pool[a.stoneType]--;
        const placed = { x: +a.x.toFixed(1), y: +a.y.toFixed(1), type: a.stoneType };
        snap.stones.push(placed);
        applyFireInteractions(snap, placed);
    }

    function simCast(snap, a) {
        const ai = snap.turn.activePlayerIndex;
        const p = snap.players[ai];
        const def = window.SCROLL_DEFINITIONS?.[a.scroll];
        const activatedBefore = p.activated.length;
        snap.turn.ap -= CAST_COST;

        // moveToActive if cast from hand; the scroll STAYS in active after the
        // cast (handleScrollDisposition: no auto-discard)
        if (p.hand) {
            const hi = p.hand.indexOf(a.scroll);
            if (hi !== -1) {
                p.hand.splice(hi, 1); p.handCount--;
                p.active.push(a.scroll); p.activeCount++;
            }
        }

        // Win-condition activation (applyScrollEffects):
        //  - catacomb scrolls credit each component element, no source guard
        //  - otherwise credit only while the element's SOURCE pool has stones
        if (def) {
            if (def.element === 'catacomb' && def.patterns?.[0]) {
                for (const el of new Set(def.patterns[0].map(c => c.type))) {
                    if (!p.activated.includes(el)) p.activated.push(el);
                }
            } else if (ELEMENTS.includes(def.element)) {
                if ((snap.sourcePool[def.element] || 0) > 0 &&
                    !p.activated.includes(def.element)) {
                    p.activated.push(def.element);
                }
            }
        }

        // The effect itself: whitelist-gated honesty about what we can't model.
        // grantedNew lets an evaluator credit the flat stand-in value ONLY for
        // casts that advanced the win condition — otherwise a search farms the
        // flat value by re-casting an already-won scroll forever (the same
        // infinite-recast loop Stage 1's castAlreadyWon weight fixed).
        if (!SIMULATED_SCROLLS.has(a.scroll)) {
            simNotes(snap).unsimulatedCasts.push({
                scroll: a.scroll,
                grantedNew: p.activated.length > activatedBefore,
            });
        }
        // (no whitelisted effects implemented yet)
    }

    function simDiscard(snap, a) {
        const p = activePlayer(snap);
        if (a.from === 'hand' && p.hand) {
            const i = p.hand.indexOf(a.scroll);
            if (i !== -1) { p.hand.splice(i, 1); p.handCount--; }
        } else {
            const i = p.active.indexOf(a.scroll);
            if (i !== -1) { p.active.splice(i, 1); p.activeCount--; }
        }
        // Discards land in the shared common area (castable by anyone)
        if (!snap.commonArea) snap.commonArea = [];
        if (a.scroll !== UNKNOWN_SCROLL && !snap.commonArea.includes(a.scroll)) {
            snap.commonArea.push(a.scroll);
        }
    }

    function simulate(snap, action) {
        const next = clone(snap);
        switch (action?.type) {
            case 'move':          simMove(next, action); break;
            case 'endTurn':       simEndTurn(next); break;
            case 'placeStone':    simPlaceStone(next, action); break;
            case 'cast':          simCast(next, action); break;
            case 'discardScroll': simDiscard(next, action); break;
            default:
                simNotes(next).notes.push(`unsupported action type: ${action?.type}`);
        }
        return next;
    }

    // ----------------------------------------------------------------
    // Terminal test — win = all 5 elements activated AND pawn on the
    // centre of the player's own tile (checkWinCondition in game-core.js)
    // ----------------------------------------------------------------
    function winner(snap) {
        for (const p of snap.players) {
            if (!p) continue;
            if (!ELEMENTS.every(el => p.activated.includes(el))) continue;
            const home = snap.tiles.find(t => t.isPlayerTile && t.playerIndex === p.index);
            if (home && dist(home.x, home.y, p.x, p.y) < HEX_NEAR) return p.index;
        }
        return null;
    }
    const isTerminal = snap => winner(snap) !== null;

    // ----------------------------------------------------------------
    // Pure legal-action enumeration — mirror of BotState.legalActions()
    // reading only the snapshot. Placement phase is NOT handled (the
    // snapshot doesn't carry it; search isn't used there).
    // ----------------------------------------------------------------
    function legalActions(snap) {
        const actions = [];
        const p = activePlayer(snap);
        if (!p) return actions;
        const ap = snap.turn.ap;
        const hand = p.hand || [];

        // Overflow gate: over-capacity hand/active ⇒ discard-only
        if (p.handCount > MAX_HAND || p.activeCount > MAX_ACTIVE) {
            if (p.handCount > MAX_HAND) for (const name of hand)
                actions.push({ type: 'discardScroll', scroll: name, from: 'hand' });
            if (p.activeCount > MAX_ACTIVE) for (const name of p.active)
                actions.push({ type: 'discardScroll', scroll: name, from: 'active' });
            return actions;
        }

        // Rule (mirrors isPlayerRestingOnStone in game-core.js): a hex with a
        // stone on it is transit-only — cast/placeStone/endTurn all require
        // being at rest, so none of them are legal until the pawn moves to
        // an empty hex. 'move' and 'discardScroll' are unaffected.
        const pawnOnStone = !!stoneAt(snap, p.x, p.y);

        // Casts (2 AP, pattern satisfied, never level-1 response scrolls) —
        // hand, active, and the shared common area (castable by anyone)
        if (!pawnOnStone && ap >= CAST_COST) {
            for (const name of new Set([...p.active, ...hand, ...(snap.commonArea || [])])) {
                const def = window.SCROLL_DEFINITIONS?.[name];
                if (!def || def.level === 1) continue; // also skips UNKNOWN_SCROLL
                if (checkPattern(snap, name)) actions.push({ type: 'cast', scroll: name });
            }
        }

        // Stone placements toward viable pattern variants (adjacent-only range).
        const g = grid(snap);
        const seen = new Set();
        for (const name of pawnOnStone ? [] : hand) {
            const def = window.SCROLL_DEFINITIONS?.[name];
            if (!def || def.level === 1 || !Array.isArray(def.patterns)) continue;
            for (const variant of def.patterns) {
                const cells = variant.map(req => {
                    const off = hexToPixel(req.q, req.r, TILE);
                    return { x: p.x + off.x, y: p.y + off.y, type: req.type };
                });
                if (!cells.every(c => g.some(h => dist(h.x, h.y, c.x, c.y) < HEX_NEAR))) continue;
                let placed = 0, blocked = false;
                const missing = [];
                for (const c of cells) {
                    const here = stoneAt(snap, c.x, c.y);
                    if (here && here.type === c.type) placed++;
                    else if (here) { blocked = true; break; }
                    else missing.push(c);
                }
                if (blocked) continue;
                for (const c of missing) {
                    if ((p.pool[c.type] || 0) <= 0) continue;
                    const d = dist(p.x, p.y, c.x, c.y);
                    if (d <= HEX_NEAR || d >= HEX_STEP) continue; // base placement range: adjacent to pawn
                    // Not on any face-down tile, no pawn standing there
                    // (mirrors findValidStonePosition)
                    const hex = g.find(h => dist(h.x, h.y, c.x, c.y) < HEX_NEAR);
                    if (hex && hex.tileIds.some(id => {
                        const t = snap.tiles.find(tt => tt.id === id);
                        return t && !t.revealed && !t.isPlayerTile;
                    })) continue;
                    if (snap.players.some(pl => pl && dist(pl.x, pl.y, c.x, c.y) < HEX_NEAR)) continue;
                    const key = `${c.x.toFixed(1)},${c.y.toFixed(1)},${c.type}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    actions.push({
                        type: 'placeStone', x: c.x, y: c.y, stoneType: c.type,
                        scroll: name, progress: (placed + 1) / cells.length,
                    });
                }
            }
        }

        // Moves
        if (ap > 0) {
            for (const h of g) {
                const d = dist(h.x, h.y, p.x, p.y);
                if (d <= HEX_NEAR || d >= HEX_STEP) continue;
                const mv = canMoveTo(snap, h.x, h.y);
                if (mv.canMove && mv.cost <= ap) {
                    actions.push({ type: 'move', x: h.x, y: h.y, cost: mv.cost });
                }
            }
        }

        // Voluntary discards (cycle a slot to the common area)
        for (const name of hand) {
            if (name === UNKNOWN_SCROLL) continue;
            actions.push({ type: 'discardScroll', scroll: name, from: 'hand', voluntary: true });
        }
        for (const name of p.active) {
            if (name === UNKNOWN_SCROLL) continue;
            actions.push({ type: 'discardScroll', scroll: name, from: 'active', voluntary: true });
        }

        // Stranded exception (mirrors isPlayerStrandedOnStone in
        // game-core.js): resting on a stone with zero moves enumerated above
        // must still allow ending the turn, or the search sees a dead end
        // with no legal action at all.
        const strandedOnStone = pawnOnStone && !actions.some(act => act.type === 'move');
        if (!pawnOnStone || strandedOnStone) actions.push({ type: 'endTurn' });
        return actions;
    }

    // ----------------------------------------------------------------
    // Snapshot diff — the validation currency. Returns [{path, pred, real}].
    // Wildcards: shrineType 'unknown' matches anything; hands containing
    // UNKNOWN_SCROLL compare by count only.
    // ----------------------------------------------------------------
    function diffSnapshots(pred, real) {
        const diffs = [];
        const push = (path, a, b) => diffs.push({ path, pred: a, real: b });

        if (pred.turn.activePlayerIndex !== real.turn.activePlayerIndex)
            push('turn.activePlayerIndex', pred.turn.activePlayerIndex, real.turn.activePlayerIndex);
        if (pred.turn.ap !== real.turn.ap)
            push('turn.ap', pred.turn.ap, real.turn.ap);

        for (const el of ELEMENTS) {
            if ((pred.sourcePool[el] || 0) !== (real.sourcePool[el] || 0))
                push(`sourcePool.${el}`, pred.sourcePool[el], real.sourcePool[el]);
        }

        // Tiles: revealed flags + shrineType (with 'unknown' wildcard)
        for (const rt of real.tiles) {
            const pt = pred.tiles.find(t => t.id === rt.id);
            if (!pt) { push(`tiles[${rt.id}]`, 'missing', 'present'); continue; }
            if (pt.revealed !== rt.revealed) push(`tiles[${rt.id}].revealed`, pt.revealed, rt.revealed);
            else if (rt.revealed && pt.shrineType !== 'unknown' && pt.shrineType !== rt.shrineType)
                push(`tiles[${rt.id}].shrineType`, pt.shrineType, rt.shrineType);
        }

        // Stones: greedy multiset match with positional tolerance
        const unmatched = [...pred.stones];
        for (const rs of real.stones) {
            const i = unmatched.findIndex(ps => ps.type === rs.type && dist(ps.x, ps.y, rs.x, rs.y) < 2);
            if (i === -1) push(`stones(${rs.type}@${rs.x},${rs.y})`, 'absent', 'present');
            else unmatched.splice(i, 1);
        }
        for (const ps of unmatched) push(`stones(${ps.type}@${ps.x},${ps.y})`, 'present', 'absent');

        // Players
        real.players.forEach((rp, i) => {
            const pp = pred.players[i];
            if (!rp || !pp) { if (!!rp !== !!pp) push(`players[${i}]`, !!pp, !!rp); return; }
            if (dist(pp.x, pp.y, rp.x, rp.y) >= 2) push(`players[${i}].pos`, `${pp.x},${pp.y}`, `${rp.x},${rp.y}`);
            for (const el of ELEMENTS) {
                if ((pp.pool[el] || 0) !== (rp.pool[el] || 0))
                    push(`players[${i}].pool.${el}`, pp.pool[el], rp.pool[el]);
            }
            if (pp.handCount !== rp.handCount) push(`players[${i}].handCount`, pp.handCount, rp.handCount);
            if (pp.activeCount !== rp.activeCount) push(`players[${i}].activeCount`, pp.activeCount, rp.activeCount);
            const predActivated = [...pp.activated].sort().join(',');
            const realActivated = [...rp.activated].sort().join(',');
            if (predActivated !== realActivated) push(`players[${i}].activated`, predActivated, realActivated);
            // Hand identity (self only) — count-only when a draw was unknowable
            if (pp.hand && rp.hand && !pp.hand.includes(UNKNOWN_SCROLL)) {
                const ph = [...pp.hand].sort().join(','), rh = [...rp.hand].sort().join(',');
                if (ph !== rh) push(`players[${i}].hand`, ph, rh);
            }
        });

        return diffs;
    }

    // ----------------------------------------------------------------
    // Validation harness (roadmap Stage 2 step 3) — IMPURE, live game only.
    // Plays seeded random legal actions; before applying each for real it
    // predicts the outcome with simulate(), then diffs prediction vs the
    // real post-action snapshot. Casts of non-whitelisted scrolls count as
    // "accepted" divergences (the whitelist gate is the design, not a bug).
    //
    // Usage (browser console, in a running local/tutorial game):
    //   await BotSim.validate({ actions: 300, seed: 1 })
    // ----------------------------------------------------------------
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // policy 'random' = uniform over legal actions (unbiased state coverage);
    // policy 'greedy' = the Stage-1 bot's ranked choice with ε-random mixed in
    // (reaches casts/placeStones that random walks almost never produce).
    async function validate({ actions = 300, seed = 1, delay = 60, maxPerTurn = 25,
                              policy = 'random', epsilon = 0.2 } = {}) {
        if (!window.BotState || !window.BotSystem) {
            throw new Error('BotSim.validate needs a live game with BotState/BotSystem loaded');
        }
        const rng = mulberry32(seed);
        const stats = {};   // per action type: {steps, diverged, accepted}
        const details = []; // first N divergence reports
        const bump = (type, key) => {
            stats[type] = stats[type] || { steps: 0, diverged: 0, accepted: 0 };
            stats[type][key]++;
        };

        let sinceTurnEnd = 0;
        for (let n = 0; n < actions; n++) {
            await window.BotSystem.waitForQuiescence();
            const before = window.BotState.snapshot();
            let legal = window.BotState.legalActions();
            if (!legal.length) { log('validate: no legal actions — stopping'); break; }
            if (legal[0].type === 'placeTile') { log('validate: placement phase — stopping'); break; }

            // Random play never ends a turn on its own often enough; force it
            // occasionally so endTurn (collection + AP reset) gets coverage.
            let pick;
            if (sinceTurnEnd >= maxPerTurn) {
                pick = legal.find(a => a.type === 'endTurn') || legal[Math.floor(rng() * legal.length)];
            } else if (policy === 'greedy' && rng() >= epsilon) {
                // Prefer casts, then the most pattern-completing placement —
                // greedy ranking alone wanders off before patterns finish, so
                // cast coverage would stay at zero without this.
                const casts = legal.filter(a => a.type === 'cast');
                const places = legal.filter(a => a.type === 'placeStone')
                    .sort((a, b) => (b.progress || 0) - (a.progress || 0));
                if (casts.length) pick = casts[0];
                else if (places.length && rng() < 0.7) pick = places[0];
                else {
                    const ranked = window.BotSystem.rank();
                    pick = ranked.length ? ranked[0].action : legal[Math.floor(rng() * legal.length)];
                }
            } else {
                pick = legal[Math.floor(rng() * legal.length)];
            }

            const predicted = simulate(before, pick);
            const res = window.BotState.applyAction(pick);
            if (!res.ok) {
                bump(pick.type, 'steps'); bump(pick.type, 'diverged');
                details.push({ n, action: pick, error: `applyAction failed: ${res.reason}` });
                continue;
            }
            sinceTurnEnd = pick.type === 'endTurn' ? 0 : sinceTurnEnd + 1;

            await window.BotSystem.waitForQuiescence();
            await sleep(delay);
            const after = window.BotState.snapshot();
            let diffs = diffSnapshots(predicted, after);

            // Catacomb reveal: revealTile() grants +1 AP, but a hidden tile's
            // element is unknowable by design — that specific ±1 AP diff is an
            // accepted (documented) divergence, not a model bug.
            const revealedCatacombs = after.tiles.filter(t => {
                const b = before.tiles.find(bt => bt.id === t.id);
                return b && !b.revealed && t.revealed && t.shrineType === 'catacomb';
            }).length;
            let acceptedReveal = false;
            if (revealedCatacombs > 0) {
                const apDiff = diffs.find(d => d.path === 'turn.ap' && d.real - d.pred === revealedCatacombs);
                if (apDiff) { diffs = diffs.filter(d => d !== apDiff); acceptedReveal = true; }
            }

            const accepted = (pick.type === 'cast' && !SIMULATED_SCROLLS.has(pick.scroll)) ||
                             (acceptedReveal && diffs.length === 0);
            bump(pick.type, 'steps');
            if (diffs.length) {
                bump(pick.type, accepted ? 'accepted' : 'diverged');
                if (details.length < 60) details.push({ n, action: pick, accepted, diffs });
            }
        }

        const report = { stats, details };
        log('validate report:', JSON.stringify(stats, null, 2));
        for (const [type, s] of Object.entries(stats)) {
            const pct = s.steps ? (100 * s.diverged / s.steps).toFixed(1) : '0';
            log(`  ${type}: ${s.diverged}/${s.steps} diverged (${pct}%)${s.accepted ? `, ${s.accepted} accepted (whitelist-gated casts)` : ''}`);
        }
        return report;
    }

    // ----------------------------------------------------------------
    // Public API
    // ----------------------------------------------------------------
    window.BotSim = {
        simulate, legalActions, isTerminal, winner,
        checkPattern, canMoveTo, grid, diffSnapshots, validate,
        stoneWouldSurvive,
        SIMULATED_SCROLLS, UNKNOWN_SCROLL,
    };
    log('Loaded — window.BotSim ready (simulate / legalActions / isTerminal / validate)');
})();
