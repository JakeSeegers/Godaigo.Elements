/**
 * GodaigoBot — greedy scored-action bot player
 *
 * Architecture: each turn, score every legal action and execute the best one
 * repeatedly until AP = 0. Actions: move, place stone, cast scroll, end turn.
 *
 * Depends on:
 *   window.dijkstraPath, window.getCurrentAP, window.botPlaceStone,
 *   window.botExecuteMove, window.botEndTurn, window.spellSystem,
 *   window.getPlayerPools, window.getPlacedTiles, window.getPlacedStones,
 *   window.getPlayerPositions, window.getActivePlayerIndex,
 *   window.SCROLL_DEFINITIONS, window.getStoneCounts
 */

(function() {
    'use strict';

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    const STONE_RANK = { earth: 5, water: 4, fire: 3, wind: 2, void: 1 };
    const MOVE_AP_COST = 1;
    const STONE_PLACE_AP_COST = 1;
    const SCROLL_CAST_AP_COST = 2;
    const ACTION_DELAY_MS = 600; // ms between bot actions for visual pacing

    // Scrolls the bot can auto-execute (no interactive selection needed)
    const AUTO_EXECUTE_SCROLLS = new Set([
        'EARTH_SCROLL_3', // Mason's Savvy — draw earth stones
        'EARTH_SCROLL_5', // Avalanche — place anywhere
        'WATER_SCROLL_2', // Refreshing Thought — draw catacomb scroll
        'FIRE_SCROLL_2',  // Burning Motivation — +2 AP per stone placed
        'WIND_SCROLL_2',  // Respirate — draw wind stones
        'WIND_SCROLL_5',  // Freedom — shrine centers act as catacomb
        'VOID_SCROLL_3',  // Simplify — scrolls cost 1 AP
        'CATACOMB_SCROLL_1', // Mudslide
        'CATACOMB_SCROLL_2', // Mine
        'CATACOMB_SCROLL_3', // Call to Adventure
        'CATACOMB_SCROLL_5', // Steam Vents
        'CATACOMB_SCROLL_6', // Seed the Skies
        'CATACOMB_SCROLL_7', // Reflecting Pool
    ]);

    // Scrolls the bot can execute with scripted decisions (botMode context)
    const SCRIPTABLE_SCROLLS = new Set([
        'WATER_SCROLL_4', // Wandering River — change tile to void
        'WATER_SCROLL_5', // Control the Current — transform adjacent water stones
        'FIRE_SCROLL_5',  // Arson — destroy opponent's highest-value stone
        'VOID_SCROLL_2',  // Scholar's Insight — search for level 2 of needed element
        'VOID_SCROLL_5',  // Create — draw stones equal to rank
        'CATACOMB_SCROLL_8', // Plunder — discard opponent's active scroll
        'CATACOMB_SCROLL_9', // Quick Reflexes — get level 1 scroll
        'CATACOMB_SCROLL_10', // Combust — destroy stones on a tile
    ]);

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    let _activeBotIndex = null;
    let _actionQueue = [];
    let _running = false;

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------
    const GodaigoBot = {
        /**
         * Called when it's the bot's turn. Kicks off the turn loop.
         */
        onTurnStart(botIndex) {
            if (_running) return;
            _activeBotIndex = botIndex;
            console.log(`🤖 Bot turn started (playerIndex=${botIndex})`);
            _running = true;
            setTimeout(() => _runTurnLoop(botIndex), ACTION_DELAY_MS);
        },

        isRunning() { return _running; }
    };

    // -----------------------------------------------------------------------
    // Turn loop — greedy action selection
    // -----------------------------------------------------------------------
    function _runTurnLoop(botIndex) {
        if (!_isStillBotTurn(botIndex)) {
            _running = false;
            return;
        }

        const ap = window.getCurrentAP ? window.getCurrentAP() : 0;
        console.log(`🤖 loop tick: ap=${ap} botIdx=${botIndex} registered=${window._botPlayerIndices?.has(botIndex)}`);
        if (ap <= 0) {
            _endTurn();
            return;
        }

        const action = _pickBestAction(botIndex);
        if (!action) {
            console.log('🤖 No action found — ending turn');
            _endTurn();
            return;
        }

        _executeAction(action, botIndex, () => {
            setTimeout(() => _runTurnLoop(botIndex), ACTION_DELAY_MS);
        });
    }

    function _isStillBotTurn(botIndex) {
        const active = window.getActivePlayerIndex ? window.getActivePlayerIndex() : -1;
        return active === botIndex;
    }

    function _endTurn() {
        _running = false;
        _activeBotIndex = null;
        console.log('🤖 Bot ending turn');
        if (window.botEndTurn) window.botEndTurn();
    }

    // -----------------------------------------------------------------------
    // Action scoring
    // -----------------------------------------------------------------------
    function _pickBestAction(botIndex) {
        const ap = window.getCurrentAP ? window.getCurrentAP() : 0;
        const pool = (window.getPlayerPools ? window.getPlayerPools() : [])[botIndex] || {};
        const pos = (window.getPlayerPositions ? window.getPlayerPositions() : [])[botIndex];
        if (!pos) return null;

        const candidates = [];

        // --- Scroll casts (highest priority if pattern satisfied) ---
        if (ap >= SCROLL_CAST_AP_COST && window.spellSystem) {
            const scrolls = window.spellSystem.getPlayerScrolls
                ? window.spellSystem.getPlayerScrolls(false)
                : { hand: new Set(), active: new Set() };

            // Can only cast from active area
            for (const scrollId of scrolls.active) {
                const score = _scoreScroll(scrollId, botIndex);
                if (score > 0) candidates.push({ type: 'cast', scrollId, score });
            }

            // Move scrolls from hand to active if active has space
            for (const scrollId of scrolls.hand) {
                if (scrolls.active.size < (window.spellSystem.MAX_ACTIVE_SIZE || 2)) {
                    candidates.push({ type: 'move-to-active', scrollId, score: 5 });
                }
            }
        }

        // --- Stone placement ---
        if (ap >= STONE_PLACE_AP_COST) {
            const stoneMoves = _getStonePlacements(botIndex, pos, pool);
            candidates.push(...stoneMoves);
        }

        // --- Movement ---
        if (ap >= MOVE_AP_COST) {
            const moveMoves = _getMovementOptions(botIndex, pos, pool);
            candidates.push(...moveMoves);
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0];
    }

    // -----------------------------------------------------------------------
    // Action execution
    // -----------------------------------------------------------------------
    function _executeAction(action, botIndex, onDone) {
        switch (action.type) {
            case 'cast':
                _doCastScroll(action.scrollId, botIndex, onDone);
                break;
            case 'move-to-active':
                if (window.spellSystem?.moveScrollToActive) {
                    window.spellSystem.moveScrollToActive(action.scrollId, botIndex);
                }
                onDone();
                break;
            case 'place-stone':
                if (window.botPlaceStone) {
                    window.botPlaceStone(action.x, action.y, action.stoneType, botIndex);
                }
                onDone();
                break;
            case 'move':
                if (window.botExecuteMove) {
                    const result = window.botExecuteMove(action.x, action.y);
                    if (!result || !result.ok) {
                        console.log('🤖 Bot move failed:', result?.reason);
                    }
                }
                onDone();
                break;
            default:
                onDone();
        }
    }

    // -----------------------------------------------------------------------
    // Scroll scoring
    // -----------------------------------------------------------------------
    function _scoreScroll(scrollId, botIndex) {
        const pos = (window.getPlayerPositions ? window.getPlayerPositions() : [])[botIndex];
        if (!pos) return 0;

        // Pattern must be satisfied
        const satisfied = window.spellSystem?.patternSatisfied?.(scrollId, botIndex);
        if (!satisfied) return 0;

        // Only auto-execute or scriptable scrolls
        if (!AUTO_EXECUTE_SCROLLS.has(scrollId) && !SCRIPTABLE_SCROLLS.has(scrollId)) {
            // Fallback: give the bot stones equal to scroll level
            return 0; // skip for now; fallback handled by scroll-effects.js botMode
        }

        const def = window.SCROLL_DEFINITIONS?.[scrollId];
        if (!def) return 0;

        // Base score on scroll level
        let score = def.level * 10;

        // Bonus if this element hasn't been activated yet
        const activated = window.spellSystem?.playerScrolls?.[botIndex]?.activated || new Set();
        if (!activated.has(def.element)) score += 20;

        // Bonus for catacomb (activates 2 elements)
        if (def.element === 'catacomb') score += 15;

        return score;
    }

    // -----------------------------------------------------------------------
    // Stone placement candidates
    // -----------------------------------------------------------------------
    function _getStonePlacements(botIndex, pos, pool) {
        const candidates = [];
        const TILE_SIZE = 20;

        // Find best scroll to work toward (most stones already placed, fewest missing)
        const scrolls = window.spellSystem?.getPlayerScrolls?.(false);
        if (!scrolls) return candidates;

        const allScrolls = [...scrolls.active, ...scrolls.hand];
        if (allScrolls.length === 0) return candidates;

        // Pick scroll with fewest missing stones
        let bestScroll = null;
        let bestMissing = Infinity;
        for (const scrollId of allScrolls) {
            const missing = window.spellSystem?.missingStones?.(scrollId, botIndex) ?? Infinity;
            if (missing > 0 && missing < bestMissing) {
                bestMissing = missing;
                bestScroll = scrollId;
            }
        }

        if (!bestScroll) return candidates;

        const def = window.SCROLL_DEFINITIONS?.[bestScroll];
        if (!def) return candidates;

        // Find which stones are missing in any pattern variant
        const playerHex = typeof pixelToHex === 'function'
            ? pixelToHex(pos.x, pos.y, TILE_SIZE)
            : { q: Math.round(pos.x / (TILE_SIZE * Math.sqrt(3))), r: Math.round(pos.y / (TILE_SIZE * 1.5)) };

        const placedStones = window.getPlacedStones ? window.getPlacedStones() : [];

        for (const variant of (def.patterns || [])) {
            for (const req of variant) {
                if (!req || !req.type) continue;
                const stoneType = req.type;
                if ((pool[stoneType] || 0) <= 0) continue;

                const targetHex = { q: playerHex.q + req.q, r: playerHex.r + req.r };
                const targetPos = typeof hexToPixel === 'function'
                    ? hexToPixel(targetHex.q, targetHex.r, TILE_SIZE)
                    : { x: targetHex.q * TILE_SIZE * Math.sqrt(3) + targetHex.r * TILE_SIZE * Math.sqrt(3) / 2,
                        y: targetHex.r * TILE_SIZE * 1.5 };

                // Check if stone already placed here
                const alreadyPlaced = placedStones.some(s =>
                    Math.sqrt(Math.pow(s.x - targetPos.x, 2) + Math.pow(s.y - targetPos.y, 2)) < 5
                    && s.type === stoneType
                );
                if (alreadyPlaced) continue;

                // Distance 1 stones can be placed now; distance 2 require movement first
                const dist = Math.max(Math.abs(req.q), Math.abs(req.r), Math.abs(req.q + req.r));
                if (dist > 1) continue; // Skip — bot doesn't pre-place distance-2 stones yet

                const score = 15 + (STONE_RANK[stoneType] || 0) * 2;
                candidates.push({ type: 'place-stone', x: targetPos.x, y: targetPos.y, stoneType, score });
                break; // One candidate per variant is enough to avoid redundancy
            }
        }

        return candidates;
    }

    // -----------------------------------------------------------------------
    // Movement candidates — use Dijkstra to score destinations
    // -----------------------------------------------------------------------
    function _getMovementOptions(botIndex, pos, pool) {
        const candidates = [];
        const placedTiles = window.getPlacedTiles ? window.getPlacedTiles() : [];
        const revealedTiles = placedTiles.filter(t => !t.flipped && !t.isPlayerTile);

        // Target: unrevealed tiles adjacent to player (for exploration)
        const hiddenTiles = placedTiles.filter(t => t.flipped && !t.isPlayerTile);
        const stoneCounts = window.getStoneCounts ? window.getStoneCounts() : {};

        for (const tile of hiddenTiles) {
            const path = window.dijkstraPath?.(pos, { x: tile.x, y: tile.y });
            if (!path || path.length < 2) continue;
            const cost = path[path.length - 1].cost;
            const ap = window.getCurrentAP ? window.getCurrentAP() : 0;
            if (cost > ap) continue;

            // Higher score for tiles we can reach in 1 step
            const score = 8 - cost;
            if (score <= 0) continue;
            const dest = path[path.length - 1];
            candidates.push({ type: 'move', x: dest.x, y: dest.y, score });
        }

        // Target: shrine tiles to collect stones and cast scrolls
        const scrolls = window.spellSystem?.getPlayerScrolls?.(false);
        if (scrolls) {
            const allScrolls = [...scrolls.active, ...scrolls.hand];
            for (const scrollId of allScrolls) {
                const missing = window.spellSystem?.missingStones?.(scrollId, botIndex) ?? Infinity;
                if (missing === 0) continue; // Already satisfied

                const def = window.SCROLL_DEFINITIONS?.[scrollId];
                if (!def) continue;

                // Find shrines matching this element
                for (const tile of revealedTiles) {
                    if (tile.shrineType !== def.element) continue;
                    const path = window.dijkstraPath?.(pos, { x: tile.x, y: tile.y });
                    if (!path || path.length < 2) continue;
                    const cost = path[path.length - 1].cost;
                    const ap = window.getCurrentAP ? window.getCurrentAP() : 0;
                    if (cost > ap) continue;

                    // Score: shrine that has stones available
                    const available = stoneCounts[def.element] || 0;
                    if (available === 0) continue;
                    const score = 12 - cost + (STONE_RANK[def.element] || 0);
                    const dest = path[path.length - 1];
                    candidates.push({ type: 'move', x: dest.x, y: dest.y, score });
                }
            }
        }

        return candidates;
    }

    // -----------------------------------------------------------------------
    // Cast scroll — handle auto-execute and scriptable variants
    // -----------------------------------------------------------------------
    function _doCastScroll(scrollId, botIndex, onDone) {
        console.log(`🤖 Bot casting ${scrollId}`);
        if (SCRIPTABLE_SCROLLS.has(scrollId)) {
            // Inject botMode context so scroll-effects.js makes decisions automatically
            const prevContext = window._scrollBotContext;
            window._scrollBotContext = { botMode: true, playerIndex: botIndex };
            const result = window.spellSystem?.castSpecificScroll?.(scrollId);
            window._scrollBotContext = prevContext;
            onDone();
        } else if (AUTO_EXECUTE_SCROLLS.has(scrollId)) {
            const result = window.spellSystem?.castSpecificScroll?.(scrollId);
            // Wait for response window if it opened
            setTimeout(onDone, ACTION_DELAY_MS);
        } else {
            // Unknown — skip
            onDone();
        }
    }

    // -----------------------------------------------------------------------
    // Export
    // -----------------------------------------------------------------------
    window.GodaigoBot = GodaigoBot;
    console.log('🤖 GodaigoBot loaded');

})();
