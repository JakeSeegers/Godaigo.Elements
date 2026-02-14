// ========================================
// SUPABASE MULTIPLAYER SETUP
// ========================================
const SUPABASE_URL = 'https://lovybwpypkaarstnvkbz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxvdnlid3B5cGthYXJzdG52a2J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMzI4NTgsImV4cCI6MjA4NDYwODg1OH0.lqobDTaopRJ5sA0yZQvzDwudq2x4zz9HMtTkSuJulFU';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Multiplayer state
let myPlayerId = null;
let myPlayerIndex = null;
let totalPlayers = 0; // Total number of players in the game
let playerTilesPlaced = new Set(); // Track which player indices have placed tiles
let isPlacementPhase = false;
// Mobile deck initial state is set later after isMobile is computed
let allPlayersData = []; // Store all player data from database (id, player_index, color, username)

// Turn synchronization
let currentTurnNumber = 0; // Increments with each turn change (for desync detection)
let lastReceivedTurnNumber = 0; // Last turn number received from broadcast

// Helper function to get player display name (Username (Color))
function getPlayerColorName(playerIndex) {
    const colorNames = {
        'purple': 'Purple',
        'yellow': 'Yellow',
        'red': 'Red',
        'blue': 'Blue',
        'green': 'Green'
    };

    let username = null;
    let colorName = null;

    // Try to get from database player data first
    if (allPlayersData.length > 0) {
        const player = allPlayersData.find(p => p.player_index === playerIndex);
        if (player) {
            username = player.username;
            if (player.color) {
                colorName = colorNames[player.color] || player.color;
            }
        }
    }

    // Fallback to playerPositions if player tile is placed
    if (!colorName && typeof playerPositions !== 'undefined' && playerPositions[playerIndex]) {
        const hexColorNames = {
            '#9458f4': 'Purple',
            '#ffce00': 'Yellow',
            '#ed1b43': 'Red',
            '#5894f4': 'Blue',
            '#69d83a': 'Green'
        };
        colorName = hexColorNames[playerPositions[playerIndex].color] || 'Player ' + (playerIndex + 1);
    }

    // Build display name: "Username (Color)" or just "Color" or "Player X"
    if (username && colorName) {
        return username + ' (' + colorName + ')';
    } else if (colorName) {
        return colorName;
    } else if (username) {
        return username;
    } else {
        return 'Player ' + (playerIndex + 1);
    }
}

// Check if it's the current player's turn (for multiplayer)
// This is for GAME ACTIONS (moving, placing stones, etc), NOT tile placement
function isMyTurn() {
    if (!isMultiplayer) return true; // In local mode, always allow actions
    if (isPlacementPhase) return false; // During placement phase, no game actions allowed
    return myPlayerIndex === activePlayerIndex;
}

// Show/hide End Turn button based on whose turn it is
function updateEndTurnButtonVisibility() {
    const btn = document.getElementById('end-turn');
    if (!btn) return;

    // Always show the button, but disable when not your turn
    btn.style.display = '';
    if (!isMultiplayer) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        return;
    }

    const canEnd = isMyTurn();
    btn.disabled = !canEnd;
    btn.style.opacity = canEnd ? '' : '0.5';
    btn.style.cursor = canEnd ? '' : 'not-allowed';
}

// Hide deck indicators during play (keep deck panel for stones/player pool)
function updateDeckIndicatorVisibility() {
    const gameContainer = document.querySelector('.game-container');
    const inGame = gameContainer && gameContainer.style.display !== 'none';
    const hide = inGame && !isPlacementPhase; // hide during main play

    const tileDeckHeader = document.getElementById('tile-deck-header');
    const tileDeckContainer = document.getElementById('tile-deck-container');
    const playerTilesHeader = document.getElementById('player-tiles-header');

    if (tileDeckHeader) tileDeckHeader.style.display = hide ? 'none' : '';
    if (tileDeckContainer) tileDeckContainer.style.display = hide ? 'none' : '';
    if (playerTilesHeader) playerTilesHeader.style.display = hide ? 'none' : '';
}

// Inventory panel toggle (unified for desktop + mobile)
let isInventoryOpen = false;

function setInventoryOpen(open) {
    isInventoryOpen = !!open;
    const gameContainer = document.querySelector('.game-container');
    if (!gameContainer) return;

    gameContainer.classList.toggle('inventory-open', isInventoryOpen);
    gameContainer.classList.toggle('inventory-collapsed', !isInventoryOpen);

    const btn = document.getElementById('inventory-toggle');
    if (btn) {
        btn.textContent = isInventoryOpen ? '🎒 Inventory (hide)' : '🎒 Inventory';
    }
}

function toggleInventory() {
    setInventoryOpen(!isInventoryOpen);
}

// Close button inside inventory (useful on mobile where bottom controls may be off-screen)
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('inventory-close');
    if (closeBtn) closeBtn.addEventListener('click', () => setInventoryOpen(false));

    // Listen for scroll-resolved events from response window system
    window.addEventListener('scroll-resolved', (event) => {
        const entry = event.detail;
        if (entry && entry.scrollData) {
            // Apply the scroll effects for scrolls that resolved from the response stack
            if (typeof spellSystem !== 'undefined') {
                const scrollName = entry.scrollData.name;
                // Resolve scrollDef: may be stored as .definition, .spell, or looked up from patterns
                const scrollDef = entry.scrollData.definition
                    || entry.scrollData.spell
                    || spellSystem.patterns[scrollName];
                const fromCommonArea = entry.fromCommonArea ?? entry.scrollData?.fromCommonArea ?? false;

                // For response scrolls (like Unbidden Lamplight / Reflect / Sigh of Recollection),
                // pass the triggering scroll context
                if (entry.result === 'response-resolved' && entry.triggeringScroll) {
                    console.log(`Applying response scroll effects: ${scrollName} (triggered by ${entry.triggeringScroll.name})`);

                    // In multiplayer, only execute the response effect on the responder's own client.
                    // The caster's client resolves the stack but shouldn't modify another player's pools.
                    // Non-caster/non-responder clients receive the effect via the 'response-resolved' broadcast.
                    const isLocalPlayer = !isMultiplayer || (typeof myPlayerIndex !== 'undefined' && myPlayerIndex === entry.casterIndex);

                    if (isLocalPlayer && spellSystem.scrollEffects) {
                        const effect = spellSystem.scrollEffects.getEffect(scrollName);
                        if (effect) {
                            spellSystem.scrollEffects.execute(scrollName, entry.casterIndex, {
                                spell: scrollDef,
                                triggeringScroll: entry.triggeringScroll
                            });
                        }
                    } else {
                        console.log(`Skipping response effect execution for ${scrollName} (responder is player ${entry.casterIndex}, I am ${myPlayerIndex})`);
                    }

                    // Handle scroll disposition for the response scroll
                    spellSystem.handleScrollDisposition(scrollName, fromCommonArea);
                } else if (entry.result === 'resolved' && entry.isOriginal) {
                    // Original scroll resolved (after response window) - apply its full effect
                    console.log(`Original scroll resolved: ${scrollName} - applying effects`);
                    spellSystem.applyScrollEffects(scrollName, scrollDef, fromCommonArea);
                } else if (entry.result === 'resolved' && !entry.isOriginal) {
                    // Regular resolved scroll (non-original)
                    console.log(`Applying resolved scroll effects: ${scrollName}`);
                    spellSystem.applyScrollEffects(scrollName, scrollDef);
                } else if (entry.result === 'countered-original') {
                    // Counter scroll was cast - execute its effect (e.g. Psychic stores the stolen scroll)
                    const counterCasterIdx = entry.casterIndex;
                    console.log(`Counter scroll resolved: ${scrollName}, counter-caster: ${counterCasterIdx}`);
                    if (spellSystem.scrollEffects) {
                        const effect = spellSystem.scrollEffects.getEffect(scrollName);
                        if (effect) {
                            spellSystem.scrollEffects.execute(scrollName, counterCasterIdx, {
                                spell: scrollDef,
                                scrollName: scrollName,
                                triggeringScroll: entry.triggeringScroll
                            });
                        }
                    }
                    // Check if the effect flagged this scroll to go to common area (e.g. Psychic)
                    const forceCommon = spellSystem.scrollEffects?.pendingForceCommonArea;
                    const shouldForceCommon = forceCommon && forceCommon.scrollName === scrollName;
                    if (shouldForceCommon) {
                        delete spellSystem.scrollEffects.pendingForceCommonArea;
                    }
                    // Handle disposition using the COUNTER-CASTER's scrolls (not the
                    // active player's, since the counter scroll belongs to the responder)
                    spellSystem.ensurePlayerScrollsStructure(counterCasterIdx);
                    const counterScrolls = spellSystem.playerScrolls[counterCasterIdx];
                    if (shouldForceCommon) {
                        if (counterScrolls.active.has(scrollName)) {
                            counterScrolls.active.delete(scrollName);
                        }
                        spellSystem.discardToCommonArea(scrollName);
                    }
                    spellSystem.updateScrollCount();
                    if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI();
                }
            }
        }
    });
});



// Check if current player can place their tile during placement phase
// This is ONLY for player tile placement
function canPlaceTile() {
    if (!isMultiplayer) return true;
    if (!isPlacementPhase) return false; // Player tiles can only be placed during placement phase
    // During placement phase, only the active player can place their tile
    return myPlayerIndex === activePlayerIndex && !playerTilesPlaced.has(myPlayerIndex);
}

// Check if player can take actions (turn AND no pending cascade)
function canTakeAction() {
    if (!isMyTurn()) return false;
    // Check for pending cascade
    const playerIdx = isMultiplayer ? myPlayerIndex : activePlayerIndex;
    if (typeof spellSystem !== 'undefined' && spellSystem.hasPendingCascade(playerIdx)) {
        return false;
    }
    return true;
}

// Show "not your turn" or "cascade pending" message
function notYourTurn() {
    // First check for pending cascade
    const playerIdx = isMultiplayer ? myPlayerIndex : activePlayerIndex;
    if (typeof spellSystem !== 'undefined' && spellSystem.hasPendingCascade(playerIdx)) {
        updateStatus(`📜 You must cascade a scroll before taking other actions!`);
        // Re-show the cascade prompt
        spellSystem.showPendingCascadePrompt(playerIdx);
        return;
    }

    if (isPlacementPhase) {
        const activeColor = getPlayerColorName(activePlayerIndex);
        updateStatus(`⏳ Waiting for ${activeColor} to place their tile... (${playerTilesPlaced.size}/${totalPlayers})`);
    } else {
        const activeColor = getPlayerColorName(activePlayerIndex);
        updateStatus(`⏳ Not your turn! It's ${activeColor}'s turn.`);
    }
}

// Update turn display when turn changes
function updateTurnDisplay() {
    if (!isMultiplayer) return;

    updateEndTurnButtonVisibility();
    updateDeckIndicatorVisibility();

    const myColorName = getPlayerColorName(myPlayerIndex);
    const activeColorName = getPlayerColorName(activePlayerIndex);

    if (isMyTurn()) {
        updateStatus(`✅ It's your turn! You are ${myColorName}.`);
        console.log('✅ My turn now!');
    } else {
        updateStatus(`⏳ Waiting... ${activeColorName}'s turn.`);
        console.log(`⏳ Waiting for player ${activePlayerIndex + 1}`);
    }

    // Note: Each player always sees their own inventory (stones/scrolls/AP)
    // We don't update inventory here - it stays showing the local player's resources
}

let isMultiplayer = false;
let gameRoomSubscription = null;
let playersSubscription = null;
let gameStateSubscription = null;
