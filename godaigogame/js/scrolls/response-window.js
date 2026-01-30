/**
 * Response Window System for Godaigo
 *
 * When a player casts a scroll, a "response window" opens allowing other players
 * (and even the casting player) to respond with their own scrolls.
 *
 * Rules:
 * - Response costs normal 2 AP
 * - Responder must have valid scroll in active area AND valid pattern on board
 * - Earth II (Iron Stance) can counter any scroll
 * - Response window can be skipped if no player has a valid response
 * - Multiple responses create a "stack" resolved last-in-first-out
 */

class ResponseWindowSystem {
    constructor(spellSystem) {
        this.spellSystem = spellSystem;
        this.isResponseWindowOpen = false;
        this.responseStack = []; // Stack of pending scroll casts
        this.currentCaster = null; // Player who initiated the current scroll
        this.pendingScrollData = null; // Data about the scroll being responded to
        this.respondingPlayers = new Set(); // Players who have passed or responded
        this.responseTimeout = null;
        this.RESPONSE_TIMEOUT_MS = 15000; // 15 seconds to respond
        this.responseModalElement = null;
    }

    /**
     * Check if a player can respond to a scroll
     * @param {number} playerIndex - The player to check
     * @returns {object} { canRespond: boolean, validScrolls: array, reason: string }
     */
    canPlayerRespond(playerIndex) {
        // Check if player has enough AP (need 2 AP to respond)
        const playerAP = this.getPlayerAP(playerIndex);
        if (playerAP < 2) {
            return { canRespond: false, validScrolls: [], reason: 'Not enough AP (need 2)' };
        }

        // Get player's active scrolls and common area scrolls
        const playerScrolls = this.spellSystem.playerScrolls[playerIndex];
        if (!playerScrolls) {
            return { canRespond: false, validScrolls: [], reason: 'No scrolls available' };
        }

        const activeScrolls = Array.from(playerScrolls.active || []);
        const commonScrolls = this.spellSystem.getCommonAreaScrolls();
        const allCastableScrolls = [...activeScrolls, ...commonScrolls];

        if (allCastableScrolls.length === 0) {
            return { canRespond: false, validScrolls: [], reason: 'No scrolls in active area or common area' };
        }

        // Check which scrolls have valid patterns on the board
        const validScrolls = [];
        const playerPos = this.getPlayerPosition(playerIndex);

        if (!playerPos) {
            return { canRespond: false, validScrolls: [], reason: 'Player position not found' };
        }

        for (const scrollName of allCastableScrolls) {
            if (this.checkPatternForPlayer(scrollName, playerIndex)) {
                const scrollDef = this.spellSystem.patterns[scrollName];
                const isCounter = scrollDef?.canCounter === 'any';
                validScrolls.push({
                    name: scrollName,
                    definition: scrollDef,
                    isCounter: isCounter,
                    fromCommonArea: commonScrolls.includes(scrollName)
                });
            }
        }

        if (validScrolls.length === 0) {
            return { canRespond: false, validScrolls: [], reason: 'No valid patterns on board' };
        }

        return { canRespond: true, validScrolls, reason: null };
    }

    /**
     * Check if any player can respond (used to skip response window)
     * @param {number} excludePlayer - Player to exclude from check (usually the caster)
     * @returns {boolean}
     */
    canAnyPlayerRespond(excludePlayer = -1) {
        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 0;

        for (let i = 0; i < numPlayers; i++) {
            // Include ALL players in check (even the caster can respond to their own scroll)
            const result = this.canPlayerRespond(i);
            if (result.canRespond) {
                return true;
            }
        }
        return false;
    }

    /**
     * Open response window after a scroll is cast
     * @param {object} scrollData - Data about the cast scroll
     * @param {number} casterIndex - Index of the player who cast the scroll
     * @param {function} onComplete - Callback when response window closes
     */
    openResponseWindow(scrollData, casterIndex, onComplete) {
        // Check if anyone can respond
        if (!this.canAnyPlayerRespond()) {
            console.log('Response window skipped - no valid responses available');
            if (onComplete) onComplete({ skipped: true, responses: [] });
            return;
        }

        this.isResponseWindowOpen = true;
        this.currentCaster = casterIndex;
        this.pendingScrollData = scrollData;
        this.respondingPlayers.clear();
        this.responseStack = [{
            scrollData,
            casterIndex,
            isOriginal: true
        }];

        // Store callback
        this.onCompleteCallback = onComplete;

        // Show response window modal
        this.showResponseModal();

        // Broadcast in multiplayer
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
            this.broadcastResponseWindowOpened(scrollData, casterIndex);
        }

        // Start timeout timer
        this.startResponseTimeout();
    }

    /**
     * Show the response window modal overlay
     */
    showResponseModal() {
        // Remove existing modal if present
        if (this.responseModalElement) {
            this.responseModalElement.remove();
        }

        // Create overlay backdrop
        const overlay = document.createElement('div');
        overlay.id = 'response-window-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: '2000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'response-window-modal';
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '3px solid #e94560',
            borderRadius: '15px',
            padding: '25px',
            minWidth: '450px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
            color: 'white',
            boxShadow: '0 0 30px rgba(233, 69, 96, 0.5)'
        });

        // Header
        const header = document.createElement('div');
        header.style.textAlign = 'center';
        header.style.marginBottom = '20px';

        const title = document.createElement('h2');
        title.textContent = 'RESPONSE WINDOW';
        title.style.color = '#e94560';
        title.style.margin = '0 0 10px 0';
        title.style.textTransform = 'uppercase';
        title.style.letterSpacing = '3px';
        header.appendChild(title);

        // Show what scroll was cast
        const scrollInfo = document.createElement('div');
        const scrollDef = this.spellSystem.patterns[this.pendingScrollData.name];
        scrollInfo.innerHTML = `<strong>${this.getPlayerName(this.currentCaster)}</strong> cast <span style="color: ${this.getElementColor(scrollDef?.element)}">${scrollDef?.name || this.pendingScrollData.name}</span>`;
        scrollInfo.style.fontSize = '16px';
        scrollInfo.style.marginBottom = '10px';
        header.appendChild(scrollInfo);

        // Timer display
        const timerDiv = document.createElement('div');
        timerDiv.id = 'response-timer';
        timerDiv.style.fontSize = '24px';
        timerDiv.style.fontWeight = 'bold';
        timerDiv.style.color = '#f39c12';
        timerDiv.textContent = `${Math.ceil(this.RESPONSE_TIMEOUT_MS / 1000)}s`;
        header.appendChild(timerDiv);

        modal.appendChild(header);

        // Check if current player can respond
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : activePlayerIndex;
        const responseCheck = this.canPlayerRespond(myIndex);

        if (responseCheck.canRespond) {
            // Show available response scrolls
            const scrollsSection = document.createElement('div');
            scrollsSection.style.marginBottom = '20px';

            const scrollsHeader = document.createElement('h3');
            scrollsHeader.textContent = 'Your Available Responses:';
            scrollsHeader.style.color = '#16a085';
            scrollsHeader.style.marginBottom = '15px';
            scrollsSection.appendChild(scrollsHeader);

            responseCheck.validScrolls.forEach(scrollInfo => {
                const scrollCard = this.createScrollCard(scrollInfo);
                scrollsSection.appendChild(scrollCard);
            });

            modal.appendChild(scrollsSection);
        } else {
            // Show why player can't respond
            const noResponseDiv = document.createElement('div');
            noResponseDiv.style.textAlign = 'center';
            noResponseDiv.style.padding = '20px';
            noResponseDiv.style.color = '#95a5a6';
            noResponseDiv.innerHTML = `<p>You cannot respond:</p><p><em>${responseCheck.reason}</em></p>`;
            modal.appendChild(noResponseDiv);
        }

        // Pass button
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.gap = '15px';
        buttonContainer.style.marginTop = '20px';

        const passBtn = document.createElement('button');
        passBtn.textContent = 'Pass (No Response)';
        Object.assign(passBtn.style, {
            padding: '12px 30px',
            fontSize: '16px',
            backgroundColor: '#7f8c8d',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold'
        });
        passBtn.onmouseenter = () => passBtn.style.backgroundColor = '#95a5a6';
        passBtn.onmouseleave = () => passBtn.style.backgroundColor = '#7f8c8d';
        passBtn.onclick = () => this.playerPasses(myIndex);
        buttonContainer.appendChild(passBtn);

        modal.appendChild(buttonContainer);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        this.responseModalElement = overlay;
    }

    /**
     * Create a scroll card for the response modal
     */
    createScrollCard(scrollInfo) {
        const card = document.createElement('div');
        const elementColor = this.getElementColor(scrollInfo.definition?.element);

        Object.assign(card.style, {
            backgroundColor: '#2d2d44',
            border: scrollInfo.isCounter ? '2px solid #e74c3c' : '2px solid ' + elementColor,
            borderRadius: '10px',
            padding: '15px',
            marginBottom: '10px',
            cursor: 'pointer',
            transition: 'all 0.2s'
        });

        card.onmouseenter = () => {
            card.style.backgroundColor = '#3d3d54';
            card.style.transform = 'scale(1.02)';
        };
        card.onmouseleave = () => {
            card.style.backgroundColor = '#2d2d44';
            card.style.transform = 'scale(1)';
        };

        // Header
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'center';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = scrollInfo.definition?.name || scrollInfo.name;
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.color = elementColor;
        nameSpan.style.fontSize = '16px';
        headerDiv.appendChild(nameSpan);

        if (scrollInfo.isCounter) {
            const counterBadge = document.createElement('span');
            counterBadge.textContent = 'COUNTER';
            Object.assign(counterBadge.style, {
                backgroundColor: '#e74c3c',
                color: 'white',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold'
            });
            headerDiv.appendChild(counterBadge);
        }

        if (scrollInfo.fromCommonArea) {
            const commonBadge = document.createElement('span');
            commonBadge.textContent = 'COMMON';
            Object.assign(commonBadge.style, {
                backgroundColor: '#9b59b6',
                color: 'white',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                marginLeft: '5px'
            });
            headerDiv.appendChild(commonBadge);
        }

        card.appendChild(headerDiv);

        // Description
        const descDiv = document.createElement('div');
        descDiv.textContent = scrollInfo.definition?.description || '';
        descDiv.style.fontSize = '12px';
        descDiv.style.color = '#bdc3c7';
        descDiv.style.marginTop = '8px';
        card.appendChild(descDiv);

        // Cost info
        const costDiv = document.createElement('div');
        costDiv.textContent = '2 AP';
        costDiv.style.fontSize = '12px';
        costDiv.style.color = '#f39c12';
        costDiv.style.marginTop = '5px';
        card.appendChild(costDiv);

        // Click to respond
        card.onclick = () => this.playerResponds(scrollInfo);

        return card;
    }

    /**
     * Handle player choosing to respond with a scroll
     */
    playerResponds(scrollInfo) {
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : activePlayerIndex;

        // Double check they can still afford it
        if (this.getPlayerAP(myIndex) < 2) {
            this.showResponseError('Not enough AP!');
            return;
        }

        // Add response to stack
        this.responseStack.push({
            scrollData: {
                name: scrollInfo.name,
                definition: scrollInfo.definition
            },
            casterIndex: myIndex,
            isCounter: scrollInfo.isCounter,
            isOriginal: false
        });

        this.respondingPlayers.add(myIndex);

        // Broadcast response in multiplayer
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
            this.broadcastResponse(scrollInfo, myIndex);
        }

        // Check if this opens a new response window (others can respond to the response)
        if (this.canAnyPlayerRespond()) {
            // Update modal for next response round
            this.pendingScrollData = scrollInfo;
            this.currentCaster = myIndex;
            this.showResponseModal();
            this.startResponseTimeout();
        } else {
            // No more responses possible, resolve the stack
            this.resolveResponseStack();
        }
    }

    /**
     * Handle player passing (no response)
     */
    playerPasses(playerIndex) {
        this.respondingPlayers.add(playerIndex);

        // Broadcast pass in multiplayer
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
            this.broadcastPass(playerIndex);
        }

        // Check if all players have passed
        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 1;
        if (this.respondingPlayers.size >= numPlayers) {
            this.resolveResponseStack();
        } else {
            // Wait for other players
            this.showWaitingForOthers();
        }
    }

    /**
     * Show waiting message while other players decide
     */
    showWaitingForOthers() {
        const modal = document.getElementById('response-window-modal');
        if (!modal) return;

        // Update modal content
        modal.innerHTML = '';

        const waitDiv = document.createElement('div');
        waitDiv.style.textAlign = 'center';
        waitDiv.style.padding = '40px';

        const spinner = document.createElement('div');
        spinner.innerHTML = '&#x21bb;'; // Circular arrow
        spinner.style.fontSize = '48px';
        spinner.style.animation = 'spin 1s linear infinite';
        waitDiv.appendChild(spinner);

        const text = document.createElement('p');
        text.textContent = 'Waiting for other players...';
        text.style.fontSize = '18px';
        text.style.marginTop = '20px';
        waitDiv.appendChild(text);

        modal.appendChild(waitDiv);

        // Add spin animation if not already present
        if (!document.getElementById('response-spin-style')) {
            const style = document.createElement('style');
            style.id = 'response-spin-style';
            style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }
    }

    /**
     * Resolve the response stack (LIFO order)
     */
    resolveResponseStack() {
        this.clearResponseTimeout();
        this.closeResponseModal();

        // Process stack from top to bottom (LIFO)
        const results = [];
        let cancelled = false;

        while (this.responseStack.length > 0) {
            const entry = this.responseStack.pop();

            if (cancelled && !entry.isCounter) {
                // This scroll was countered
                results.push({
                    ...entry,
                    result: 'countered'
                });
                continue;
            }

            if (entry.isCounter && this.responseStack.length > 0) {
                // This is a counter - it cancels the next scroll in stack
                cancelled = true;
                results.push({
                    ...entry,
                    result: 'countered-target'
                });

                // Spend AP for the counter
                this.spendPlayerAP(entry.casterIndex, 2);
            } else {
                // Execute this scroll normally
                results.push({
                    ...entry,
                    result: 'resolved'
                });

                // Only execute if not countered
                if (!cancelled) {
                    this.executeScrollEffect(entry);
                }
                cancelled = false; // Reset for next scroll
            }
        }

        // Close response window state
        this.isResponseWindowOpen = false;
        this.pendingScrollData = null;
        this.currentCaster = null;

        // Call completion callback
        if (this.onCompleteCallback) {
            this.onCompleteCallback({
                skipped: false,
                responses: results
            });
        }
    }

    /**
     * Execute a scroll's effect
     */
    executeScrollEffect(entry) {
        // This delegates back to the main spell system
        // The actual effect execution is handled there
        if (this.spellSystem && typeof this.spellSystem.executeSpell === 'function') {
            // Note: We don't call executeSpell directly here because that would
            // open another response window. Instead, we'll emit an event that
            // the main game loop handles to apply effects without re-triggering responses.
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('scroll-resolved', {
                    detail: entry
                }));
            }
        }
    }

    /**
     * Close the response modal
     */
    closeResponseModal() {
        if (this.responseModalElement) {
            this.responseModalElement.remove();
            this.responseModalElement = null;
        }
    }

    /**
     * Start the response timeout timer
     */
    startResponseTimeout() {
        this.clearResponseTimeout();

        let remaining = this.RESPONSE_TIMEOUT_MS;
        const timerEl = document.getElementById('response-timer');

        this.responseTimeout = setInterval(() => {
            remaining -= 1000;
            if (timerEl) {
                timerEl.textContent = `${Math.ceil(remaining / 1000)}s`;
                if (remaining <= 5000) {
                    timerEl.style.color = '#e74c3c';
                }
            }

            if (remaining <= 0) {
                // Time's up - auto-pass for current player
                const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : activePlayerIndex;
                this.playerPasses(myIndex);
            }
        }, 1000);
    }

    /**
     * Clear the response timeout
     */
    clearResponseTimeout() {
        if (this.responseTimeout) {
            clearInterval(this.responseTimeout);
            this.responseTimeout = null;
        }
    }

    /**
     * Show error message in response modal
     */
    showResponseError(message) {
        const modal = document.getElementById('response-window-modal');
        if (!modal) return;

        const errorDiv = document.createElement('div');
        Object.assign(errorDiv.style, {
            backgroundColor: '#e74c3c',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            textAlign: 'center',
            marginBottom: '10px'
        });
        errorDiv.textContent = message;
        modal.insertBefore(errorDiv, modal.firstChild);

        setTimeout(() => errorDiv.remove(), 3000);
    }

    // Helper methods that interface with the game state
    getPlayerAP(playerIndex) {
        // In multiplayer, each player tracks their own AP
        // For now, use the global AP count
        if (typeof actionPoints !== 'undefined') {
            return actionPoints;
        }
        return 0;
    }

    spendPlayerAP(playerIndex, amount) {
        if (typeof spendAP === 'function') {
            spendAP(amount);
        }
    }

    getPlayerPosition(playerIndex) {
        if (typeof playerPositions !== 'undefined' && playerPositions[playerIndex]) {
            return playerPositions[playerIndex];
        }
        return null;
    }

    getPlayerName(playerIndex) {
        if (typeof playerPositions !== 'undefined' && playerPositions[playerIndex]?.username) {
            return playerPositions[playerIndex].username;
        }
        return `Player ${playerIndex + 1}`;
    }

    getElementColor(element) {
        const colors = {
            earth: '#69d83a',
            water: '#5894f4',
            fire: '#ed1b43',
            wind: '#ffce00',
            void: '#9458f4',
            catacomb: '#9b59b6'
        };
        return colors[element] || '#ffffff';
    }

    checkPatternForPlayer(scrollName, playerIndex) {
        // Delegate to spell system's pattern check for specific player
        if (this.spellSystem && typeof this.spellSystem.checkPatternForPlayer === 'function') {
            return this.spellSystem.checkPatternForPlayer(scrollName, playerIndex);
        }
        // Fallback to basic check if method doesn't exist
        if (this.spellSystem && typeof this.spellSystem.checkPattern === 'function') {
            return this.spellSystem.checkPattern(scrollName);
        }
        return false;
    }

    // Multiplayer broadcast methods
    broadcastResponseWindowOpened(scrollData, casterIndex) {
        if (typeof broadcastGameAction === 'function') {
            broadcastGameAction('response-window-opened', {
                scrollName: scrollData.name,
                casterIndex: casterIndex
            });
        }
    }

    broadcastResponse(scrollInfo, playerIndex) {
        if (typeof broadcastGameAction === 'function') {
            broadcastGameAction('scroll-response', {
                scrollName: scrollInfo.name,
                playerIndex: playerIndex,
                isCounter: scrollInfo.isCounter
            });
        }
    }

    broadcastPass(playerIndex) {
        if (typeof broadcastGameAction === 'function') {
            broadcastGameAction('response-pass', {
                playerIndex: playerIndex
            });
        }
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.ResponseWindowSystem = ResponseWindowSystem;
}
