// ============================================================
// bot-state.js — Stage 0 of docs/bot-roadmap.md
// ============================================================
// Observation + actuation layer for the bot. Contains NO strategy.
//   BotState.snapshot()      → pure-JSON game state (hidden info masked)
//   BotState.legalActions()  → canonical action list for the active player
//   BotState.applyAction(a)  → execute one action via the game's own functions
//   BotState.hexGrid()       → cached board hex positions
//   BotState.findPath(...)   → Dijkstra cheapest path between two hexes
//
// GOTCHA (see roadmap § KEY FACTS): game-core state (placedTiles,
// activePlayerIndex, getTotalAP, …) lives in the shared global LEXICAL scope,
// not on window — reference it as bare identifiers only.
//
// LOAD ORDER: after lobby.js, before bot.js.
// ============================================================

(function () {
    'use strict';

    const ELEMENTS = ['earth', 'water', 'fire', 'wind', 'void'];
    const HEX_NEAR = 5;   // px — "same hex" threshold (matches game-core usage)
    const HEX_STEP = 40;  // px — "adjacent hex" threshold

    function log(...args) { console.log('🧠 [BotState]', ...args); }

    // ----------------------------------------------------------------
    // Snapshot — pure JSON, safe to serialize / diff / feed to a learner.
    // Hidden information is masked: unrevealed tiles report shrineType null,
    // and opponents' hands are reported as counts only.
    // ----------------------------------------------------------------
    function snapshot() {
        const my = (typeof isMultiplayer !== 'undefined' && isMultiplayer &&
                    typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                   ? myPlayerIndex : activePlayerIndex;

        const players = playerPositions.map((p, i) => {
            if (!p) return null;
            const scrolls = window.spellSystem?.playerScrolls?.[i];
            const isSelf  = (i === activePlayerIndex);
            return {
                index: i,
                x: +p.x.toFixed(1), y: +p.y.toFixed(1),
                color: p.color,
                pool: { ...(playerPools[i] || { earth:0, water:0, fire:0, wind:0, void:0 }) },
                hand:       isSelf && scrolls ? [...scrolls.hand]   : null, // opponents' hands hidden
                handCount:  scrolls ? scrolls.hand.size   : 0,
                active:     scrolls ? [...scrolls.active] : [],             // active area is public
                activeCount: scrolls ? scrolls.active.size : 0,
                activated:  scrolls ? [...scrolls.activated] : [],
            };
        });

        return {
            version: 1,
            turn: {
                activePlayerIndex,
                myPlayerIndex: my,
                isMultiplayer: (typeof isMultiplayer !== 'undefined') ? !!isMultiplayer : false,
                ap: getTotalAP(),
            },
            sourcePool: { ...window.stonePools },
            tiles: placedTiles.map(t => ({
                id: t.id,
                x: +t.x.toFixed(1), y: +t.y.toFixed(1),
                revealed: !t.flipped,
                isPlayerTile: !!t.isPlayerTile,
                // MASKED when face-down — reading it would be cheating
                shrineType: t.flipped ? null : t.shrineType,
            })),
            stones: placedStones.map(s => ({ x: +s.x.toFixed(1), y: +s.y.toFixed(1), type: s.type })),
            players,
        };
    }

    // ----------------------------------------------------------------
    // Hex grid + Dijkstra cheapest path (stone terrain changes step costs).
    // ----------------------------------------------------------------
    let _grid = null, _gridAt = 0;
    function hexGrid() {
        // getAllHexagonPositions() is moderately expensive; cache briefly
        const now = Date.now();
        if (!_grid || now - _gridAt > 1500) { _grid = getAllHexagonPositions(); _gridAt = now; }
        return _grid;
    }

    function nearestHex(x, y) {
        let best = null, bd = Infinity;
        for (const h of hexGrid()) {
            const d = Math.hypot(h.x - x, h.y - y);
            if (d < bd) { bd = d; best = h; }
        }
        return bd < HEX_NEAR ? best : null;
    }

    // Dijkstra from (sx,sy) to (tx,ty). Step cost = canPlayerMoveToHex(dest).cost.
    // Returns [{x, y, cost}] (excluding start) or null when unreachable.
    function findPath(sx, sy, tx, ty) {
        const grid = hexGrid();
        const start = nearestHex(sx, sy), end = nearestHex(tx, ty);
        if (!start || !end) return null;
        if (start.key === end.key) return [];

        const dist = { [start.key]: 0 };
        const prev = {};
        const done = new Set();
        // board is small (≤ a few hundred hexes) — array scan beats a heap here
        const frontier = [start];

        while (frontier.length) {
            let bi = 0;
            for (let i = 1; i < frontier.length; i++)
                if (dist[frontier[i].key] < dist[frontier[bi].key]) bi = i;
            const cur = frontier.splice(bi, 1)[0];
            if (done.has(cur.key)) continue;
            done.add(cur.key);
            if (cur.key === end.key) break;

            for (const nb of grid) {
                if (done.has(nb.key)) continue;
                const d = Math.hypot(nb.x - cur.x, nb.y - cur.y);
                if (d <= HEX_NEAR || d >= HEX_STEP) continue; // not adjacent
                const mv = canPlayerMoveToHex(nb.x, nb.y, false);
                if (!mv.canMove) continue;
                const nd = dist[cur.key] + (mv.cost ?? 1);
                if (nd < (dist[nb.key] ?? Infinity)) {
                    dist[nb.key] = nd;
                    prev[nb.key] = cur;
                    frontier.push(nb);
                }
            }
        }

        if (!(end.key in dist)) return null;
        const path = [];
        let cur = end;
        while (cur.key !== start.key) {
            const mv = canPlayerMoveToHex(cur.x, cur.y, false);
            path.unshift({ x: cur.x, y: cur.y, cost: mv.cost ?? 1 });
            cur = prev[cur.key];
        }
        return path;
    }

    // ----------------------------------------------------------------
    // Legal action enumeration for the ACTIVE player.
    // Canonical forms — the only vocabulary bot strategy may use:
    //   {type:'cast', scroll}
    //   {type:'placeStone', x, y, stoneType, scroll, progress}
    //   {type:'move', x, y, cost}
    //   {type:'endTurn'}
    // NOT yet enumerated (Stage 2+): catacomb teleports, scroll-effect
    // sub-choices, hand→common moves.
    // ----------------------------------------------------------------
    function legalActions() {
        const actions = [];
        const player = playerPositions[activePlayerIndex];
        if (!player) return actions;
        const ap = getTotalAP();
        const pool = playerPools[activePlayerIndex] || {};
        const scrolls = window.spellSystem?.getPlayerScrolls?.(false);

        // ── cast: any hand/active scroll whose pattern is satisfied now ──
        // Casting costs 2 AP (activateScroll validates it — don't offer casts
        // the game will reject).
        if (scrolls && ap >= 2) {
            for (const name of [...scrolls.active, ...scrolls.hand]) {
                const def = window.SCROLL_DEFINITIONS?.[name];
                if (!def || def.level === 1) continue; // level 1 = response-only
                if (window.spellSystem.checkPattern(name)) {
                    actions.push({ type: 'cast', scroll: name });
                }
            }
        }

        // ── placeStone: every missing stone of every VIABLE pattern variant ──
        // A variant is viable when each of its cells is on the board and either
        // empty or already holding the right-type stone.
        if (scrolls) {
            const pHex = pixelToHex(player.x, player.y, TILE_SIZE);
            const grid = hexGrid();
            const seen = new Set(); // dedupe identical placements across scrolls
            for (const name of scrolls.hand) {
                const def = window.SCROLL_DEFINITIONS?.[name];
                if (!def || def.level === 1 || !Array.isArray(def.patterns)) continue;
                for (const variant of def.patterns) {
                    const cells = variant.map(req => {
                        const px = hexToPixel(pHex.q + req.q, pHex.r + req.r, TILE_SIZE);
                        return { x: px.x, y: px.y, type: req.type };
                    });
                    if (!cells.every(c => grid.some(h => Math.hypot(h.x - c.x, h.y - c.y) < HEX_NEAR))) continue;

                    let placed = 0, blocked = false;
                    const missing = [];
                    for (const c of cells) {
                        const here = placedStones.find(s => Math.hypot(s.x - c.x, s.y - c.y) < HEX_NEAR);
                        if (here && here.type === c.type) placed++;
                        else if (here) { blocked = true; break; } // wrong stone occupies the cell
                        else missing.push(c);
                    }
                    if (blocked) continue;
                    for (const c of missing) {
                        if ((pool[c.type] || 0) <= 0) continue;
                        // Same placement-range rule the drag-drop UI enforces —
                        // out-of-range placements would desync other clients
                        if (typeof isInPlacementRange === 'function' &&
                            !isInPlacementRange(c.x, c.y, c.type)) continue;
                        const key = `${c.x.toFixed(1)},${c.y.toFixed(1)},${c.type}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        actions.push({
                            type: 'placeStone', x: c.x, y: c.y, stoneType: c.type,
                            scroll: name,
                            progress: (placed + 1) / cells.length,
                        });
                    }
                }
            }
        }

        // ── move: each affordable adjacent hex ──
        if (ap > 0) {
            for (const h of hexGrid()) {
                const d = Math.hypot(h.x - player.x, h.y - player.y);
                if (d <= HEX_NEAR || d >= HEX_STEP) continue;
                const mv = canPlayerMoveToHex(h.x, h.y, false);
                if (!mv.canMove) continue;
                const cost = mv.cost ?? 1;
                if (cost <= ap) actions.push({ type: 'move', x: h.x, y: h.y, cost });
            }
        }

        // ── endTurn: always available while the button is live ──
        const btn = document.getElementById('end-turn');
        if (btn && !btn.disabled) actions.push({ type: 'endTurn' });

        return actions;
    }

    // ----------------------------------------------------------------
    // Apply one canonical action through the game's own code paths.
    // Returns {ok, reason?}. NEVER add rules knowledge here.
    // ----------------------------------------------------------------
    function applyAction(a) {
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer &&
            typeof myPlayerIndex !== 'undefined' && activePlayerIndex !== myPlayerIndex) {
            return { ok: false, reason: 'not this client\'s turn (multiplayer guard)' };
        }

        switch (a?.type) {
            case 'cast': {
                const scrolls = window.spellSystem.getPlayerScrolls(false);
                if (scrolls.hand.has(a.scroll)) window.spellSystem.moveToActive(a.scroll);
                window.spellSystem.castSpell();
                return { ok: true };
            }
            case 'placeStone': {
                const pool = playerPools[activePlayerIndex] || {};
                if ((pool[a.stoneType] || 0) <= 0) return { ok: false, reason: `no ${a.stoneType} stones` };
                placeStone(a.x, a.y, a.stoneType);
                pool[a.stoneType]--;
                if (typeof updateStoneCount === 'function') updateStoneCount(a.stoneType);
                if (typeof syncPlayerState === 'function') syncPlayerState();
                return { ok: true };
            }
            case 'move': {
                const player = playerPositions[activePlayerIndex];
                if (!player) return { ok: false, reason: 'pawn not found' };
                if (getTotalAP() < a.cost) return { ok: false, reason: 'not enough AP' };
                player.x = a.x;
                player.y = a.y;
                player.element.setAttribute('transform', `translate(${a.x}, ${a.y})`);
                spendAP(a.cost);
                if (typeof handlePlayerLanding === 'function') handlePlayerLanding(a.x, a.y);
                if (typeof broadcastPlayerMovement === 'function') {
                    broadcastPlayerMovement(activePlayerIndex, a.x, a.y, a.cost);
                }
                return { ok: true };
            }
            case 'endTurn': {
                const btn = document.getElementById('end-turn');
                if (!btn || btn.disabled) return { ok: false, reason: 'end-turn button unavailable' };
                btn.click();
                return { ok: true };
            }
            default:
                return { ok: false, reason: `unknown action type: ${a?.type}` };
        }
    }

    window.BotState = { snapshot, legalActions, applyAction, hexGrid, findPath };
    log('Loaded — window.BotState ready (snapshot / legalActions / applyAction)');
})();
