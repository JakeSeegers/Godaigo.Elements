// ============================================================
// bot-driver.js — lets the HOST's browser drive bot players
// ============================================================
// A "bot player" is an ordinary `players` table row whose username starts
// with BOT_USERNAME_PREFIX (added from the lobby via the host-only
// "🤖 Add Bot" button — see toggleBotPlayer() in lobby.js). It counts as a
// player everywhere: player count, color/index assignment, turn order.
//
// Since the bot has no client, the host's browser acts as its client:
// a watcher notices when it's a bot's turn and briefly IMPERSONATES the bot
// (swaps the shared `myPlayerIndex` / `playerColor` lexical bindings) so
// every existing isMyTurn()/canTakeAction()/broadcast path treats this
// client as the bot. Actions run through window.BotSystem (strategy) and
// window.BotState (actuation) exactly like a human-driven game.
//
// KNOWN v1 LIMITS (fine to ship, documented for future agents):
//   - If the bot's hand overflows at end of turn, the resolve modal appears
//     on the host's screen — the host resolves it on the bot's behalf.
//   - The bot never plays response (level 1) scrolls.
//   - While the bot is acting, the host's HUD temporarily reflects the bot.
//
// LOAD ORDER: after bot.js (last game script).
// ============================================================

(function () {
    'use strict';

    function log(...args) { console.log('🕹️ [BotDriver]', ...args); }

    // Shared with lobby.js (bot row creation, heartbeat, disconnect sweep)
    const PREFIX = '🤖';
    window.BOT_USERNAME_PREFIX = PREFIX;
    window.isBotUsername = (u) => typeof u === 'string' && u.startsWith(PREFIX);

    // ----------------------------------------------------------------
    // Which player indices are bots (from the DB rows all clients hold)
    // ----------------------------------------------------------------
    function botIndexSet() {
        const set = new Set();
        if (typeof allPlayersData !== 'undefined' && Array.isArray(allPlayersData)) {
            for (const p of allPlayersData) {
                if (window.isBotUsername(p.username) && p.player_index != null) set.add(p.player_index);
            }
        }
        return set;
    }

    function gameActive() {
        return document.getElementById('game-layout')?.classList.contains('active');
    }

    function iAmDriver() {
        return typeof isMultiplayer !== 'undefined' && isMultiplayer &&
               typeof isHost !== 'undefined' && isHost;
    }

    // ----------------------------------------------------------------
    // Impersonation: temporarily become the bot so every existing
    // myPlayerIndex-based gate and broadcast identifies as the bot.
    // ----------------------------------------------------------------
    // While impersonating a bot, the host's own player index + response AP are
    // preserved here so the response window can still let the host react to the
    // bot's spells AS THEMSELVES (see response-window.js localResponderIndex /
    // getPlayerAP). Null whenever no bot is being driven.
    let driverRealIndex = null;
    let driverAP = null; // { currentAP, voidAP } — the host's spendable response AP

    async function asBot(botIndex, fn) {
        const realIndex = myPlayerIndex;
        const realColor = playerColor;
        // Snapshot the host's identity + leftover AP BEFORE driveBotTurn clobbers
        // currentAP with the bot's fresh 5 AP.
        driverRealIndex = realIndex;
        driverAP = {
            currentAP: (typeof currentAP === 'number') ? currentAP : 0,
            voidAP:    (typeof voidAP === 'number') ? voidAP : 0,
        };
        myPlayerIndex = botIndex;
        const row = (typeof allPlayersData !== 'undefined')
            ? allPlayersData.find(p => p.player_index === botIndex) : null;
        if (row && row.color) playerColor = row.color;
        if (typeof updateEndTurnButtonVisibility === 'function') updateEndTurnButtonVisibility();
        try {
            await fn();
        } finally {
            myPlayerIndex = realIndex;
            playerColor = realColor;
            driverRealIndex = null;
            driverAP = null;
            if (typeof updateEndTurnButtonVisibility === 'function') updateEndTurnButtonVisibility();
            if (typeof updateTurnDisplay === 'function') updateTurnDisplay();
        }
    }

    // Spend from the host's preserved response AP (void first, mirroring spendAP).
    function spendDriverAP(cost) {
        if (!driverAP) return;
        let remaining = cost;
        if (driverAP.voidAP >= remaining) {
            driverAP.voidAP -= remaining;
        } else {
            remaining -= driverAP.voidAP;
            driverAP.voidAP = 0;
            driverAP.currentAP = Math.max(0, driverAP.currentAP - remaining);
        }
    }

    // ----------------------------------------------------------------
    // Placement phase: put the bot's player tile on a free hex adjacent
    // to the existing cluster (closest to the board centroid = compact).
    // ----------------------------------------------------------------
    function pickBotTilePosition() {
        const S = TILE_SIZE * 4; // large tile hex size
        if (!placedTiles.length) return null;
        const cx = placedTiles.reduce((s, t) => s + t.x, 0) / placedTiles.length;
        const cy = placedTiles.reduce((s, t) => s + t.y, 0) / placedTiles.length;
        const candidates = [];
        for (const t of placedTiles) {
            const h = pixelToHex(t.x, t.y, S);
            for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
                const p = hexToPixel(h.q + dq, h.r + dr, S);
                if (placedTiles.some(o => Math.hypot(o.x - p.x, o.y - p.y) < 40)) continue; // occupied
                if (candidates.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 40)) continue;  // dupe
                candidates.push(p);
            }
        }
        if (!candidates.length) return null;
        candidates.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
        return candidates[0];
    }

    async function placeBotTile(botIndex) {
        const pos = pickBotTilePosition();
        if (!pos) { log('No free position for bot tile!'); return; }
        log(`Placing bot ${botIndex}'s player tile at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
        await asBot(botIndex, async () => {
            // Same two steps as the human drag-drop path in game-ui.js:
            // placeTile handles pawn creation + placement bookkeeping/broadcasts,
            // and 'player-tile-place' shows the tile on the other clients.
            placeTile(pos.x, pos.y, 0, false, 'player');
            if (typeof broadcastGameAction === 'function') {
                broadcastGameAction('player-tile-place', {
                    x: pos.x, y: pos.y,
                    playerIndex: botIndex,
                    color: playerColor,
                    cosmetics: null
                });
            }
        });
    }

    // ----------------------------------------------------------------
    // Normal turns: reset the bot's AP (the turn-change handler only does
    // this for the local player), then let BotSystem play out the turn.
    // ----------------------------------------------------------------
    let lastDrivenTurnKey = null;

    async function driveBotTurn(botIndex) {
        const turnNo = (typeof currentTurnNumber !== 'undefined') ? currentTurnNumber : 0;
        const key = `${turnNo}:${botIndex}`;
        if (lastDrivenTurnKey === key) return;
        lastDrivenTurnKey = key;

        log(`Driving turn for bot player ${botIndex} (turn #${turnNo})`);
        if (typeof updateStatus === 'function') updateStatus('🤖 Bot is thinking...');
        await new Promise(r => setTimeout(r, 900)); // let turn-change effects settle

        await asBot(botIndex, async () => {
            currentAP = 5;
            const apEl = document.getElementById('ap-count');
            if (apEl) apEl.textContent = currentAP;
            if (typeof refreshVoidAP === 'function') refreshVoidAP();
            if (typeof syncPlayerState === 'function') syncPlayerState();

            await window.BotSystem.turn();

            // Safety net: never leave the game hanging on a stuck bot turn
            if (activePlayerIndex === botIndex) {
                log('Bot turn did not end on its own — forcing end turn');
                const btn = document.getElementById('end-turn');
                if (btn && !btn.disabled) btn.click();
            }
        });

        // The bot spent from this client's shared currentAP counter, and the
        // end-turn flow's local AP reset is gated on
        // activePlayerIndex === myPlayerIndex — which compared against the
        // BOT's index while impersonated. So when the bot hands the turn to
        // THIS player, redo what the turn-change handler would have done:
        // full AP, pips, and void AP recomputed from MY pool (not the bot's).
        if (typeof activePlayerIndex !== 'undefined' && activePlayerIndex === myPlayerIndex) {
            currentAP = 5;
            const apEl = document.getElementById('ap-count');
            if (apEl) apEl.textContent = currentAP;
            if (typeof updateApPips === 'function') updateApPips(currentAP);
            if (typeof refreshVoidAP === 'function') refreshVoidAP();
            if (typeof syncPlayerState === 'function') syncPlayerState();
            if (typeof updateStatus === 'function') updateStatus('Your turn!');
        } else if (typeof refreshVoidAP === 'function') {
            // Not my turn next — still restore void AP to MY pool's baseline
            refreshVoidAP();
        }

        // While impersonated, the stone panel and scroll counts rendered the
        // BOT's resources — re-render them for the local player now.
        try {
            if (typeof playerPool !== 'undefined' && typeof updateStoneCount === 'function') {
                Object.keys(playerPool).forEach(updateStoneCount);
            }
            window.spellSystem?.updateScrollCount?.();
        } catch (e) { /* cosmetic only */ }
    }

    // ----------------------------------------------------------------
    // Watcher: fires the right driver action whenever a bot is the
    // active player on the host's client.
    // ----------------------------------------------------------------
    let busy = false;
    const handledPlacement = new Set();

    setInterval(() => {
        if (busy) return;
        if (!gameActive()) { handledPlacement.clear(); lastDrivenTurnKey = null; return; }
        if (!iAmDriver()) return;

        const bots = botIndexSet();
        if (!bots.size || !bots.has(activePlayerIndex)) return;

        if (typeof isPlacementPhase !== 'undefined' && isPlacementPhase) {
            if (playerTilesPlaced.has(activePlayerIndex) || handledPlacement.has(activePlayerIndex)) return;
            handledPlacement.add(activePlayerIndex);
            busy = true;
            setTimeout(() => {
                placeBotTile(activePlayerIndex)
                    .catch(e => log('Bot tile placement failed:', e))
                    .finally(() => { busy = false; });
            }, 800);
        } else {
            busy = true;
            driveBotTurn(activePlayerIndex)
                .catch(e => log('Bot turn failed:', e))
                .finally(() => { busy = false; });
        }
    }, 700);

    // ----------------------------------------------------------------
    // Public API (console debugging + other modules)
    // ----------------------------------------------------------------
    window.BotDriver = {
        isBot: (i) => botIndexSet().has(i),
        botIndices: botIndexSet,
        controlsActivePlayer: () => iAmDriver() && botIndexSet().has(activePlayerIndex),
        // Response-window integration: identity + AP of the host behind a bot.
        driverRealIndex: () => driverRealIndex,
        getDriverAP: () => driverAP ? (driverAP.currentAP + driverAP.voidAP) : 0,
        spendDriverAP,
        _placeBotTile: placeBotTile,
        _driveBotTurn: driveBotTurn,
    };

    log('Loaded — host lobbies get a 🤖 Add Bot button; host client drives bot turns');
})();
