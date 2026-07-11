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
            commonArea: window.spellSystem?.getCommonAreaScrolls?.() || [], // shared, public, castable by anyone
            tiles: placedTiles.map(t => ({
                id: t.id,
                x: +t.x.toFixed(1), y: +t.y.toFixed(1),
                revealed: !t.flipped,
                isPlayerTile: !!t.isPlayerTile,
                playerIndex: t.isPlayerTile ? (t.playerIndex ?? null) : null, // public — whose shrine
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
    let _grid = null, _gridKey = '';
    function hexGrid() {
        // getAllHexagonPositions() is moderately expensive — cache it, but
        // invalidate on BOARD CHANGE, never on time. A time-based cache
        // (formerly 1.5s) served pre-reveal grids to every caller right
        // after a tile flip; at bot/arena speed whole games fit inside one
        // stale window and the bot "froze" on hexes that no longer matched
        // the board. Key covers: tile count, reveal count, and positions
        // (tiles can move via Telekinesis / Shifting Sands).
        let key = placedTiles.length + ':';
        let revealed = 0, posHash = 0;
        for (const t of placedTiles) {
            if (!t.flipped) revealed++;
            posHash = (posHash + Math.round(t.x * 10) * 31 + Math.round(t.y * 10)) | 0;
        }
        key += revealed + ':' + posHash;
        if (!_grid || key !== _gridKey) { _grid = getAllHexagonPositions(); _gridKey = key; }
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
    //   {type:'placeTile', x, y, distToCentroid}                    // placement phase only
    //   {type:'cast', scroll}
    //   {type:'placeStone', x, y, stoneType, scroll, progress}
    //   {type:'move', x, y, cost}
    //   {type:'discardScroll', scroll, from:'hand'|'active'}
    //   {type:'endTurn'}
    // NOT yet enumerated (Stage 2+): catacomb teleports, scroll-effect
    // sub-choices.
    // ----------------------------------------------------------------

    // Free hexes adjacent to the existing placed-tile cluster, on the LARGE
    // player-tile hex grid (TILE_SIZE * 4) — distinct from hexGrid()'s small
    // board grid used for in-turn movement. Player tiles have no pawn/AP yet,
    // so this is enumerated separately from the mid-turn actions below.
    function placementCandidates() {
        const S = TILE_SIZE * 4;
        if (!placedTiles.length) return [];
        const cx = placedTiles.reduce((s, t) => s + t.x, 0) / placedTiles.length;
        const cy = placedTiles.reduce((s, t) => s + t.y, 0) / placedTiles.length;
        const candidates = [];
        for (const t of placedTiles) {
            const h = pixelToHex(t.x, t.y, S);
            for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
                const p = hexToPixel(h.q + dq, h.r + dr, S);
                if (placedTiles.some(o => Math.hypot(o.x - p.x, o.y - p.y) < 40)) continue; // occupied
                if (candidates.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 40)) continue;  // dupe
                // Same rule the drag-drop path enforces: a player tile must
                // touch at least 2 unrevealed tiles at placement time
                if (typeof countTouchingUnrevealedTiles === 'function' &&
                    countTouchingUnrevealedTiles(p.x, p.y) < 2) continue;
                candidates.push({ x: p.x, y: p.y, distToCentroid: Math.hypot(p.x - cx, p.y - cy) });
            }
        }
        return candidates;
    }

    function legalActions() {
        // ── placement phase: this player hasn't placed their tile yet ──
        if (typeof isPlacementPhase !== 'undefined' && isPlacementPhase &&
            typeof playerTilesPlaced !== 'undefined' && !playerTilesPlaced.has(activePlayerIndex)) {
            return placementCandidates().map(c => ({ type: 'placeTile', x: c.x, y: c.y, distToCentroid: c.distToCentroid }));
        }

        const actions = [];
        const player = playerPositions[activePlayerIndex];
        if (!player) return actions;
        const ap = getTotalAP();
        const pool = playerPools[activePlayerIndex] || {};
        const scrolls = window.spellSystem?.getPlayerScrolls?.(false);

        // ── overflow gate: hand/active over capacity blocks everything else ──
        // The end-of-turn overflow modal only resolves through discards; if we
        // let cast/move/endTurn stay legal here the caller could act (or end
        // the turn) while still over capacity, which either wedges the UI
        // modal or clicks End Turn into a no-op. Discard-only until resolved.
        if (scrolls) {
            const maxHand = window.spellSystem.MAX_HAND_SIZE;
            const maxActive = window.spellSystem.MAX_ACTIVE_SIZE;
            const handOver = scrolls.hand.size > maxHand;
            const activeOver = scrolls.active.size > maxActive;
            if (handOver || activeOver) {
                if (handOver) for (const name of scrolls.hand) {
                    actions.push({ type: 'discardScroll', scroll: name, from: 'hand' });
                }
                if (activeOver) for (const name of scrolls.active) {
                    actions.push({ type: 'discardScroll', scroll: name, from: 'active' });
                }
                return actions;
            }
        }

        // ── cast: any hand/active/COMMON-AREA scroll whose pattern is
        // satisfied now. Common-area scrolls are shared and castable by
        // anyone (castSpell scans them natively); without them a bot whose
        // hand jams up with already-won scrolls can never progress again.
        // Casting costs 2 AP (activateScroll validates it — don't offer casts
        // the game will reject).
        if (scrolls && ap >= 2) {
            const common = window.spellSystem.getCommonAreaScrolls?.() || [];
            for (const name of new Set([...scrolls.active, ...scrolls.hand, ...common])) {
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
                        // Mirror the FULL validity the drag-drop path enforces
                        // (findValidStonePosition): in range, not on any
                        // face-down tile, no pawn standing there. applyAction
                        // re-checks these; enumerating illegal cells would
                        // desync other clients.
                        if (typeof isInPlacementRange === 'function' &&
                            !isInPlacementRange(c.x, c.y, c.type)) continue;
                        if (typeof isPositionOnFlippedTile === 'function' &&
                            isPositionOnFlippedTile(c.x, c.y, grid)) continue;
                        if (playerPositions.some(p => p && Math.hypot(p.x - c.x, p.y - c.y) < HEX_NEAR)) continue;
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

        // ── voluntary discard: cycle a hand/active scroll to the common area
        // (legal any time via spellSystem.discardScroll — the same move the
        // overflow flow uses). This is how a bot frees a hand slot jammed
        // with an already-won or dead-source scroll; scoring's
        // discardVoluntary penalty keeps it rare.
        if (scrolls) {
            for (const name of scrolls.hand) {
                actions.push({ type: 'discardScroll', scroll: name, from: 'hand', voluntary: true });
            }
            for (const name of scrolls.active) {
                actions.push({ type: 'discardScroll', scroll: name, from: 'active', voluntary: true });
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
            case 'placeTile': {
                if (typeof isPlacementPhase === 'undefined' || !isPlacementPhase) {
                    return { ok: false, reason: 'not placement phase' };
                }
                if (typeof countTouchingUnrevealedTiles === 'function' &&
                    countTouchingUnrevealedTiles(a.x, a.y) < 2) {
                    return { ok: false, reason: 'player tiles must touch 2+ unrevealed tiles' };
                }
                placeTile(a.x, a.y, 0, false, 'player');
                if (typeof broadcastGameAction === 'function') {
                    broadcastGameAction('player-tile-place', {
                        x: a.x, y: a.y,
                        playerIndex: activePlayerIndex,
                        color: playerColor,
                        cosmetics: null
                    });
                }
                return { ok: true };
            }
            case 'cast': {
                const scrolls = window.spellSystem.getPlayerScrolls(false);
                if (scrolls.hand.has(a.scroll)) window.spellSystem.moveToActive(a.scroll);
                const ok = window.spellSystem.castSpell();
                // When several scrolls match at once castSpell() opens a
                // "Select Scroll to Cast" popup instead of executing — pick
                // the scroll this action asked for (otherwise the cast
                // silently no-ops and the caller loops on it forever).
                const title = [...document.querySelectorAll('h3')]
                    .find(h => h.textContent === 'Select Scroll to Cast');
                const popup = title?.parentElement?.parentElement;
                if (popup) {
                    const displayName = window.spellSystem.patterns?.[a.scroll]?.name ||
                                        window.SCROLL_DEFINITIONS?.[a.scroll]?.name || a.scroll;
                    const btn = [...popup.querySelectorAll('button')]
                        .find(b => b.textContent.startsWith(displayName));
                    if (btn) { btn.click(); return { ok: true }; }
                    popup.querySelector('button[title="Close"]')?.click();
                    return { ok: false, reason: `selection popup had no option for ${a.scroll}` };
                }
                return ok === false
                    ? { ok: false, reason: 'castSpell() reported failure' }
                    : { ok: true };
            }
            case 'placeStone': {
                const pool = playerPools[activePlayerIndex] || {};
                if ((pool[a.stoneType] || 0) <= 0) return { ok: false, reason: `no ${a.stoneType} stones` };
                // Enforce the same validity the drag-drop path does — callers
                // (plans, effects, harnesses) may request cells legalActions
                // never offered. Placing on a face-down tile is illegal.
                if (placedStones.some(s => Math.hypot(s.x - a.x, s.y - a.y) < HEX_NEAR)) {
                    return { ok: false, reason: 'cell already holds a stone' };
                }
                if (playerPositions.some(p => p && Math.hypot(p.x - a.x, p.y - a.y) < HEX_NEAR)) {
                    return { ok: false, reason: 'a pawn occupies that hex' };
                }
                if (typeof isPositionOnFlippedTile === 'function' &&
                    isPositionOnFlippedTile(a.x, a.y, hexGrid())) {
                    return { ok: false, reason: 'cannot place a stone on a face-down tile' };
                }
                if (typeof isInPlacementRange === 'function' &&
                    !isInPlacementRange(a.x, a.y, a.stoneType)) {
                    return { ok: false, reason: 'out of placement range' };
                }
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
            case 'discardScroll': {
                const ok = window.spellSystem.discardScroll(a.scroll);
                return ok ? { ok: true } : { ok: false, reason: `${a.scroll} not in hand/active` };
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
