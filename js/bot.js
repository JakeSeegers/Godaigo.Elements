// ============================================================
// bot.js — Scripted test bot for Godaigo
// ============================================================
// HOW TO USE:
//   Press Shift+R during an active game to execute one bot action
//   on behalf of the current active player.
//
// PRIORITY ORDER (per Shift+R press):
//   1. Cast a scroll if its pattern is already satisfied
//   2. Place one missing stone toward the best castable pattern
//   3. If standing on a shrine centre → end turn to collect stones
//   4. Move one hex step toward the nearest collectible shrine
//   5. Fallback: end turn
//
// LOAD ORDER: after lobby.js (depends on game-core.js + lobby.js globals)
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------------
    // Logging helper
    // ----------------------------------------------------------------
    function log(...args) {
        console.log('🤖 [Bot]', ...args);
    }

    // ----------------------------------------------------------------
    // Helpers: position of the active player
    // ----------------------------------------------------------------
    function botPos() {
        const player = playerPositions[activePlayerIndex];
        if (!player) return null;
        return { x: player.x, y: player.y };
    }

    // Convert player pixel position to an integer axial hex coordinate.
    // Uses pixelToHex + hexRound (both defined in game-core.js).
    function botHex(px, py) {
        return pixelToHex(px, py, TILE_SIZE);
    }

    // ----------------------------------------------------------------
    // BFS: find a walkable path from (sx,sy) to (tx,ty).
    // Returns an array of steps [{x, y, cost}], or null if unreachable.
    // ----------------------------------------------------------------
    function botFindPath(sx, sy, tx, ty) {
        const allHexes = getAllHexagonPositions();
        const THRESH = 5;

        let startHex = null, endHex = null;
        for (const h of allHexes) {
            if (Math.hypot(h.x - sx, h.y - sy) < THRESH) startHex = h;
            if (Math.hypot(h.x - tx, h.y - ty) < THRESH) endHex   = h;
        }
        if (!startHex || !endHex) return null;
        if (startHex.key === endHex.key) return [];

        const visited = new Set([startHex.key]);
        const queue   = [{ hex: startHex, path: [] }];

        while (queue.length > 0) {
            const { hex, path } = queue.shift();

            // neighbours = all hex positions within one hex step (~35 px)
            const neighbours = allHexes.filter(h => {
                if (visited.has(h.key)) return false;
                const d = Math.hypot(h.x - hex.x, h.y - hex.y);
                return d > THRESH && d < 40;
            });

            for (const nb of neighbours) {
                const mv = canPlayerMoveToHex(nb.x, nb.y, false);
                if (!mv.canMove) continue;

                const step = { x: nb.x, y: nb.y, cost: mv.cost ?? 1 };
                const newPath = [...path, step];

                if (nb.key === endHex.key) return newPath;

                visited.add(nb.key);
                queue.push({ hex: nb, path: newPath });
            }
        }
        return null; // unreachable
    }

    // ----------------------------------------------------------------
    // Move the active player one hex step (direct state update).
    // Mirrors what movePlayerAlongPath() does without requiring a drag.
    // ----------------------------------------------------------------
    function botMoveStep(x, y, cost) {
        const pi     = activePlayerIndex;
        const player = playerPositions[pi];
        if (!player) { log('Player pawn not found'); return false; }

        if (getTotalAP() < cost) {
            log(`Not enough AP (need ${cost}, have ${getTotalAP()})`);
            return false;
        }

        // Update pawn position
        player.x = x;
        player.y = y;
        player.element.setAttribute('transform', `translate(${x}, ${y})`);

        // Spend AP + update HUD
        spendAP(cost);

        // Reveal tiles underneath (lobby.js)
        if (typeof handlePlayerLanding === 'function') handlePlayerLanding(x, y);

        // Broadcast in multiplayer (lobby.js)
        if (typeof broadcastPlayerMovement === 'function') {
            broadcastPlayerMovement(pi, x, y, cost);
        }

        log(`Moved to (${x.toFixed(1)}, ${y.toFixed(1)}) — cost ${cost} AP, ${getTotalAP()} AP remaining`);
        return true;
    }

    // ----------------------------------------------------------------
    // Find the nearest revealed elemental shrine whose pool isn't full.
    // ----------------------------------------------------------------
    const ELEMENTAL_TYPES = ['earth', 'water', 'fire', 'wind', 'void'];

    function botFindTargetShrine() {
        const pos = botPos();
        if (!pos) return null;

        let best = null, bestDist = Infinity;

        for (const tile of placedTiles) {
            if (tile.isPlayerTile)                                    continue;
            if (tile.flipped)                                         continue; // unvisited
            if (!ELEMENTAL_TYPES.includes(tile.shrineType))           continue;

            // Skip if player pool is already at capacity for this type
            const cap = (typeof playerPoolCapacity !== 'undefined' ? playerPoolCapacity : {})[tile.shrineType] ?? 5;
            if ((playerPool[tile.shrineType] || 0) >= cap)            continue;

            const d = Math.hypot(tile.x - pos.x, tile.y - pos.y);
            if (d < bestDist) { bestDist = d; best = tile; }
        }
        return best;
    }

    // ----------------------------------------------------------------
    // Find the best scroll to build toward.
    //
    // Returns { scrollName, stones: [{x, y, type}], def } where
    // `stones` lists the pixel positions that need stones placed for
    // the chosen pattern variant, OR null if nothing buildable.
    //
    // Uses the same hex-round math as checkPattern() so positions
    // are guaranteed to match when castSpell() validates them.
    // ----------------------------------------------------------------
    function botPickScrollTarget() {
        if (!window.spellSystem || !window.SCROLL_DEFINITIONS) return null;

        const pos = botPos();
        if (!pos) return null;

        const playerHex = botHex(pos.x, pos.y);
        const { hand }  = window.spellSystem.getPlayerScrolls(false);
        const allHexes  = getAllHexagonPositions();

        for (const scrollName of hand) {
            const def = window.SCROLL_DEFINITIONS[scrollName];
            if (!def || !Array.isArray(def.patterns)) continue;

            // Level 1 scrolls can only be used as responses — skip
            if (def.level === 1) continue;

            for (const variant of def.patterns) {
                // Compute exact pixel positions using the same formula as checkPattern()
                const stonePositions = variant.map(req => {
                    const px = hexToPixel(playerHex.q + req.q, playerHex.r + req.r, TILE_SIZE);
                    return { x: px.x, y: px.y, type: req.type };
                });

                // All positions must land on valid hex cells on the board
                const allOnBoard = stonePositions.every(sp =>
                    allHexes.some(h => Math.hypot(h.x - sp.x, h.y - sp.y) < 5)
                );
                if (!allOnBoard) continue;

                // Bot must have at least one stone that still needs placing
                const anyMissing = stonePositions.some(sp => {
                    const alreadyThere = placedStones.some(
                        s => s.type === sp.type && Math.hypot(s.x - sp.x, s.y - sp.y) < 5
                    );
                    return !alreadyThere && (playerPool[sp.type] || 0) > 0;
                });

                if (anyMissing) {
                    return { scrollName, stones: stonePositions, def };
                }
            }
        }
        return null;
    }

    // ----------------------------------------------------------------
    // Check if the current stone layout satisfies ANY castable scroll
    // that the bot has (hand or active area). Returns the scroll name
    // or null.
    // ----------------------------------------------------------------
    function botFindCastableScroll() {
        if (!window.spellSystem) return null;

        const { hand, active } = window.spellSystem.getPlayerScrolls(false);
        const candidates       = [...active, ...hand]; // prefer already-active scrolls

        for (const name of candidates) {
            if (window.spellSystem.checkPattern(name)) return name;
        }
        return null;
    }

    // ----------------------------------------------------------------
    // Place one stone for the bot's target pattern.
    // Deducts from playerPool + updates UI + syncs MP state.
    // ----------------------------------------------------------------
    function botPlaceStone(x, y, type) {
        if ((playerPool[type] || 0) <= 0) {
            log(`No ${type} stones in pool`);
            return false;
        }

        log(`Placing ${type} stone at (${x.toFixed(1)}, ${y.toFixed(1)})`);
        placeStone(x, y, type);

        // Deduct from player pool (mirrors game-ui.js drag-drop logic)
        playerPool[type]--;
        if (typeof updateStoneCount === 'function') updateStoneCount(type);
        if (typeof syncPlayerState  === 'function') syncPlayerState();

        return true;
    }

    // ----------------------------------------------------------------
    // Main bot action — called once per Shift+R press.
    // ----------------------------------------------------------------
    function botAct() {
        const pos = botPos();
        if (!pos) {
            log('Active player pawn not found on board');
            return;
        }

        const px = pos.x, py = pos.y;
        log(`=== Bot step | pos=(${px.toFixed(1)},${py.toFixed(1)}) AP=${getTotalAP()} ===`);

        // ── Priority 1: Cast if pattern is satisfied ─────────────────
        const castable = botFindCastableScroll();
        if (castable) {
            // Ensure the scroll is in the active area before casting
            const { hand } = window.spellSystem.getPlayerScrolls(false);
            if (hand.has(castable)) {
                window.spellSystem.moveToActive(castable);
            }
            log(`Casting ${castable}`);
            window.spellSystem.castSpell();
            return;
        }

        // ── Priority 2: Place one stone toward a scroll pattern ───────
        const scrollTarget = botPickScrollTarget();
        if (scrollTarget) {
            for (const sp of scrollTarget.stones) {
                const alreadyThere = placedStones.some(
                    s => s.type === sp.type && Math.hypot(s.x - sp.x, s.y - sp.y) < 5
                );
                if (!alreadyThere && (playerPool[sp.type] || 0) > 0) {
                    botPlaceStone(sp.x, sp.y, sp.type);
                    return;
                }
            }
        }

        // ── Priority 3: Collect — if on shrine centre, end turn ───────
        const onShrine = placedTiles.find(t =>
            !t.isPlayerTile &&
            !t.flipped &&
            ELEMENTAL_TYPES.includes(t.shrineType) &&
            Math.hypot(t.x - px, t.y - py) < 5
        );
        if (onShrine) {
            log(`On ${onShrine.shrineType} shrine centre — ending turn to collect`);
            const btn = document.getElementById('end-turn');
            if (btn && !btn.disabled) btn.click();
            return;
        }

        // ── Priority 4: Move one step toward nearest shrine ───────────
        if (getTotalAP() > 0) {
            const shrine = botFindTargetShrine();
            if (shrine) {
                const path = botFindPath(px, py, shrine.x, shrine.y);
                if (path && path.length > 0) {
                    const step = path[0];
                    if (getTotalAP() >= step.cost) {
                        botMoveStep(step.x, step.y, step.cost);
                        return;
                    }
                } else if (path && path.length === 0) {
                    // Already at shrine (shouldn't reach here due to priority 3, but be safe)
                    log('Already at shrine (path empty), ending turn');
                    const btn = document.getElementById('end-turn');
                    if (btn && !btn.disabled) btn.click();
                    return;
                } else {
                    log(`No walkable path to ${shrine.shrineType} shrine`);
                }
            } else {
                log('No collectible shrine found (all full or no revealed shrines)');
            }
        } else {
            log('Out of AP — cannot move');
        }

        // ── Priority 5: Fallback — end turn ───────────────────────────
        log('No better action available — ending turn');
        const btn = document.getElementById('end-turn');
        if (btn && !btn.disabled) {
            btn.click();
        } else {
            log('End turn button not available (may already be disabled or not your turn)');
        }
    }

    // ----------------------------------------------------------------
    // Keyboard binding: Shift+R
    // Same guards as game-ui.js to prevent firing in lobby / text inputs.
    // ----------------------------------------------------------------
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'R' || !e.shiftKey) return;

        // Don't fire while typing
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

        // Don't fire unless the game is actually running
        if (!document.getElementById('game-layout')?.classList.contains('active')) return;

        e.preventDefault();
        log('Shift+R pressed — executing one bot step');
        botAct();
    });

    // ----------------------------------------------------------------
    // Public API (for browser-console debugging)
    // ----------------------------------------------------------------
    window.BotSystem = {
        /** Manually trigger one bot step */
        step:        botAct,
        /** Return the nearest collectible shrine tile */
        findShrine:  botFindTargetShrine,
        /** Return current bot (active player) position */
        pos:         botPos,
        /** Return the scroll the bot is currently building toward */
        pickScroll:  botPickScrollTarget,
        /** Check if any scroll is castable right now */
        castable:    botFindCastableScroll,
    };

    log('Loaded — press Shift+R in-game to advance one bot step');

})();
