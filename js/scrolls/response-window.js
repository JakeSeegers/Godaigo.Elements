/**
 * Response Window System for Godaigo
 *
 * When a player casts a scroll, a "response window" opens allowing ONE other player
 * to respond with their own scroll.
 *
 * Rules:
 * - Response costs normal 2 AP
 * - Responder must have valid scroll in active area AND valid pattern on board
 * - Earth I (Iron Stance) can counter any scroll
 * - Response window can be skipped if no player has a valid response
 * - Only ONE response is allowed, then the stack resolves immediately
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
        // Determine player's available AP (responses may be free with buffs)
        const playerAP = this.getPlayerAP(playerIndex);

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
                const isResponse = scrollDef?.isResponse === true;

                // Only include scrolls that are counter scrolls OR response scrolls
                // Regular scrolls can't be cast as responses
                if (isCounter || isResponse) {
                    const cost = this.spellSystem?.getSpellCost ? this.spellSystem.getSpellCost(scrollDef, playerIndex) : 2;
                    if (playerAP < cost) continue;
                    validScrolls.push({
                        name: scrollName,
                        definition: scrollDef,
                        isCounter: isCounter,
                        isResponse: isResponse,
                        fromCommonArea: commonScrolls.includes(scrollName),
                        cost: cost
                    });
                }
            }
        }

        if (validScrolls.length === 0) {
            return { canRespond: false, validScrolls: [], reason: 'No valid responses you can afford' };
        }

        return { canRespond: true, validScrolls, reason: null };
    }

    /**
     * Check if any player can respond (used to skip response window)
     * @param {number} excludePlayer - Player to exclude from check (the caster cannot respond to their own scroll)
     * @returns {boolean}
     */
    canAnyPlayerRespond(excludePlayer = -1) {
        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 0;
        console.log(`Response window: checking ${numPlayers} players for valid responses (excluding player ${excludePlayer})`);

        for (let i = 0; i < numPlayers; i++) {
            // Skip the caster - you cannot respond to your own scroll
            if (i === excludePlayer) {
                console.log(`  Player ${i}: skipped (caster)`);
                continue;
            }
            const result = this.canPlayerRespond(i);
            console.log(`  Player ${i}: canRespond=${result.canRespond}, reason=${result.reason || 'can respond'}, validScrolls=${result.validScrolls.length}`);
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
        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 0;
        const hasOtherPlayer = numPlayers > 1;
        if (!hasOtherPlayer) {
            console.log('Response window skipped - only one player');
            if (onComplete) onComplete({ skipped: true, responses: [] });
            return;
        }

        // Quick check: can any non-caster player actually respond?
        // Skip the response window entirely if no one has valid counter/response scrolls.
        // This prevents the "waiting for players" screen from getting stuck when
        // no opponent can respond (e.g. passes are lost or delayed in multiplayer).
        if (!this.canAnyPlayerRespond(casterIndex)) {
            console.log('Response window skipped - no player can respond (no valid counter/response scrolls)');
            if (onComplete) onComplete({ skipped: true, responses: [] });
            return;
        }

        this.isResponseWindowOpen = true;
        this.currentCaster = casterIndex;
        this.pendingScrollData = scrollData;
        this.respondingPlayers.clear();
        // The caster counts as already having "responded" (they cast the spell)
        this.respondingPlayers.add(casterIndex);
        this.responseStack = [{
            scrollData,
            casterIndex,
            isOriginal: true
        }];

        // Store callback
        this.onCompleteCallback = onComplete;

        // Broadcast in multiplayer FIRST so other players see the window
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
            this.broadcastResponseWindowOpened(scrollData, casterIndex);
        }

        // For the caster, show "waiting for responses" instead of the response modal
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : activePlayerIndex;
        if (myIndex === casterIndex) {
            // Caster waits for others
            this.showWaitingForResponses(scrollData);
        } else {
            // Non-caster sees the response modal
            this.showResponseModal();
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

        // Determine border color based on scroll type
        let borderColor = elementColor;
        if (scrollInfo.isCounter) {
            borderColor = '#e74c3c'; // Red for counter
        } else if (scrollInfo.isResponse) {
            borderColor = '#f39c12'; // Orange for response
        }

        Object.assign(card.style, {
            backgroundColor: '#2d2d44',
            border: '2px solid ' + borderColor,
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
        } else if (scrollInfo.isResponse) {
            const responseBadge = document.createElement('span');
            responseBadge.textContent = 'RESPONSE';
            Object.assign(responseBadge.style, {
                backgroundColor: '#f39c12',
                color: 'white',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold'
            });
            headerDiv.appendChild(responseBadge);
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
        const displayCost = (scrollInfo && typeof scrollInfo.cost === 'number') ? scrollInfo.cost : 2;
        costDiv.textContent = `${displayCost} AP`;
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
     * NOTE: Only ONE response is allowed per scroll cast - no stack continuation
     */
    playerResponds(scrollInfo) {
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : activePlayerIndex;
        console.log(`playerResponds called: myIndex=${myIndex}, scroll=${scrollInfo.name}`);

        // Double check they can still afford it
        const myAP = this.getPlayerAP(myIndex);
        const cost = (scrollInfo && typeof scrollInfo.cost === 'number')
            ? scrollInfo.cost
            : (this.spellSystem?.getSpellCost ? this.spellSystem.getSpellCost(scrollInfo.definition, myIndex) : 2);
        console.log(`  Player AP: ${myAP}, cost=${cost}`);
        if (myAP < cost) {
            this.showResponseError(`Not enough AP! Need ${cost}, have ${myAP}`);
            return;
        }

        // Spend the AP for the response
        this.spendPlayerAP(myIndex, cost);
        console.log(`  Spent ${cost} AP for response`);

        // Quick Reflexes: reward react usage immediately on responder client
        if (this.spellSystem?.scrollEffects?.handleQuickReflexesReact) {
            this.spellSystem.scrollEffects.handleQuickReflexesReact(myIndex);
        }

        // Add response to stack
        this.responseStack.push({
            scrollData: {
                name: scrollInfo.name,
                definition: scrollInfo.definition,
                fromCommonArea: scrollInfo.fromCommonArea || false
            },
            casterIndex: myIndex,
            isCounter: scrollInfo.isCounter,
            isResponse: scrollInfo.isResponse,
            fromCommonArea: scrollInfo.fromCommonArea || false,
            isOriginal: false
        });
        console.log(`  Added to response stack, stack size: ${this.responseStack.length}`);

        // Broadcast response in multiplayer
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
            this.broadcastResponse(scrollInfo, myIndex);
            console.log(`  Broadcasted response`);
        }

        // Close the current modal
        this.closeResponseModal();

        const isCasterClient = !isMultiplayer || myIndex === this.currentCaster;
        if (isCasterClient) {
            // Only ONE response allowed - immediately resolve the stack
            console.log(`  One response received (caster client), resolving stack immediately`);
            this.resolveResponseStack();
        } else {
            // Non-caster: we sent our response, now wait for the caster
            // to receive it, resolve, and broadcast 'response-resolved'
            console.log(`  Response sent, waiting for caster to resolve`);
            this.clearResponseTimeout();
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

        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null;
        const isCasterClient = !isMultiplayer || myIndex === this.currentCaster;

        if (isCasterClient) {
            // Caster's client: check if all others responded, then resolve
            const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 1;
            if (this.respondingPlayers.size >= numPlayers) {
                this.resolveResponseStack();
            } else {
                this.showWaitingForOthers();
            }
        } else {
            // Non-caster's client: just close the modal and wait for
            // the caster to resolve and broadcast 'response-resolved'
            this.closeResponseModal();
            this.clearResponseTimeout();
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
     * Show waiting screen for the caster while others respond
     */
    showWaitingForResponses(scrollData) {
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
            border: '3px solid #27ae60',
            borderRadius: '15px',
            padding: '25px',
            minWidth: '400px',
            maxWidth: '500px',
            color: 'white',
            textAlign: 'center',
            boxShadow: '0 0 30px rgba(39, 174, 96, 0.5)'
        });

        const title = document.createElement('h2');
        title.textContent = 'SCROLL CAST';
        title.style.color = '#27ae60';
        title.style.margin = '0 0 15px 0';
        modal.appendChild(title);

        const scrollName = document.createElement('div');
        const scrollDef = this.spellSystem?.patterns?.[scrollData.name];
        scrollName.textContent = scrollDef?.name || scrollData.name;
        scrollName.style.fontSize = '20px';
        scrollName.style.fontWeight = 'bold';
        scrollName.style.color = this.getElementColor(scrollDef?.element);
        scrollName.style.marginBottom = '20px';
        modal.appendChild(scrollName);

        const waitDiv = document.createElement('div');
        waitDiv.style.padding = '20px';

        const spinner = document.createElement('div');
        spinner.innerHTML = '&#x21bb;';
        spinner.style.fontSize = '36px';
        spinner.style.animation = 'spin 1s linear infinite';
        waitDiv.appendChild(spinner);

        const text = document.createElement('p');
        text.textContent = 'Waiting for other players to respond...';
        text.style.fontSize = '16px';
        text.style.marginTop = '15px';
        text.style.color = '#bdc3c7';
        waitDiv.appendChild(text);

        modal.appendChild(waitDiv);

        // Timer display
        const timerDiv = document.createElement('div');
        timerDiv.id = 'response-timer';
        timerDiv.style.fontSize = '20px';
        timerDiv.style.fontWeight = 'bold';
        timerDiv.style.color = '#f39c12';
        timerDiv.style.marginTop = '10px';
        timerDiv.textContent = `${Math.ceil(this.RESPONSE_TIMEOUT_MS / 1000)}s`;
        modal.appendChild(timerDiv);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.responseModalElement = overlay;

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
     * FIFO for resolution: responses resolve first, then original scroll
     */
    resolveResponseStack() {
        this.clearResponseTimeout();
        this.closeResponseModal();

        // Process stack - responses first, then original
        const results = [];
        let cancelled = false;
        let originalScroll = null;

        // Separate responses from original
        const responses = [];
        while (this.responseStack.length > 0) {
            const entry = this.responseStack.pop();
            if (entry.isOriginal) {
                originalScroll = entry;
            } else {
                responses.push(entry);
            }
        }

        // Process responses first (FIFO - they were added in order)
        for (const entry of responses) {
            const scrollDef = entry.scrollData?.definition || this.spellSystem?.patterns?.[entry.scrollData?.name];

            if (entry.isCounter) {
                // This is a counter - it cancels the original scroll
                cancelled = true;
                const counterEntry = {
                    ...entry,
                    result: 'countered-original'
                };
                results.push(counterEntry);

                // AP was already spent when the counter was played (line ~439)
                // Do NOT spend again here — spendPlayerAP ignores playerIndex
                // and would charge the original caster's AP instead

                if (typeof window !== 'undefined' && window.logScrollEvent) {
                    window.logScrollEvent('response_counter', {
                        casterIndex: entry.casterIndex,
                        scrollName: entry.scrollData?.name,
                        triggeringScroll: originalScroll?.scrollData?.name || null
                    });
                }

                // Execute the counter's effect (if any) — must pass counterEntry so
                // the scroll-resolved listener sees result === 'countered-original'
                this.executeScrollEffect(counterEntry, originalScroll);
            } else if (entry.isResponse || scrollDef?.isResponse) {
                // This is a response scroll (like Unbidden Lamplight)
                // It executes but does NOT cancel the original
                const resolvedEntry = {
                    ...entry,
                    result: 'response-resolved'
                };
                results.push(resolvedEntry);

                // AP was already spent when the response was played (line ~439)
                // Do NOT spend again here — spendPlayerAP ignores playerIndex
                // and would charge the original caster's AP instead

                if (typeof window !== 'undefined' && window.logScrollEvent) {
                    window.logScrollEvent('response_resolved', {
                        casterIndex: entry.casterIndex,
                        scrollName: entry.scrollData?.name,
                        triggeringScroll: originalScroll?.scrollData?.name || null
                    });
                }

                // Execute the response scroll's effect, passing the original scroll info
                this.executeScrollEffect(resolvedEntry, originalScroll);
            }
        }

        // Now resolve the original scroll (if not cancelled)
        if (originalScroll) {
            if (cancelled) {
                if (typeof window !== 'undefined' && window.logScrollEvent) {
                    window.logScrollEvent('original_countered', {
                        casterIndex: originalScroll.casterIndex,
                        scrollName: originalScroll.scrollData?.name
                    });
                }
                results.push({
                    ...originalScroll,
                    result: 'countered'
                });
            } else {
                if (typeof window !== 'undefined' && window.logScrollEvent) {
                    window.logScrollEvent('original_resolved', {
                        casterIndex: originalScroll.casterIndex,
                        scrollName: originalScroll.scrollData?.name
                    });
                }
                const originalResolvedEntry = { ...originalScroll, result: 'resolved' };
                results.push(originalResolvedEntry);
                this.executeScrollEffect(originalResolvedEntry, null);
            }
        }

        // Close response window state
        this.isResponseWindowOpen = false;
        this.pendingScrollData = null;
        this.currentCaster = null;

        // Broadcast resolution to all clients so they close their windows
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
            this.broadcastResponseResolved(results, originalScroll);
        }

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
     * @param {object} entry - The scroll entry to execute
     * @param {object} triggeringScroll - For response scrolls, the original scroll that triggered this response
     */
    executeScrollEffect(entry, triggeringScroll = null) {
        // This delegates back to the main spell system
        // The actual effect execution is handled there
        if (this.spellSystem && typeof this.spellSystem.executeSpell === 'function') {
            // Note: We don't call executeSpell directly here because that would
            // open another response window. Instead, we'll emit an event that
            // the main game loop handles to apply effects without re-triggering responses.
            if (typeof window !== 'undefined') {
                // Resolve the scroll definition from scrollData: it may be stored
                // as .definition OR .spell depending on the source.
                const trigDef = triggeringScroll
                    ? (triggeringScroll.scrollData?.definition
                       || triggeringScroll.scrollData?.spell
                       || this.spellSystem.patterns?.[triggeringScroll.scrollData?.name])
                    : null;

                window.dispatchEvent(new CustomEvent('scroll-resolved', {
                    detail: {
                        ...entry,
                        // Promote fromCommonArea to top-level so the listener can access it directly
                        fromCommonArea: entry.fromCommonArea ?? entry.scrollData?.fromCommonArea ?? false,
                        triggeringScroll: triggeringScroll ? {
                            name: triggeringScroll.scrollData?.name,
                            casterIndex: triggeringScroll.casterIndex,
                            definition: trigDef
                        } : null
                    }
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
                this.clearResponseTimeout();
                // Time's up - force resolve
                const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : activePlayerIndex;
                const isCasterClient = !(typeof isMultiplayer !== 'undefined' && isMultiplayer) || myIndex === this.currentCaster;
                if (isCasterClient) {
                    // Caster: all remaining players are treated as passes — force resolve
                    console.log('⏰ Response timeout on caster client — force resolving');
                    this.resolveResponseStack();
                } else {
                    // Non-caster: auto-pass
                    this.playerPasses(myIndex);
                }
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
        // In multiplayer, each player tracks their own AP via playerAPs
        if (typeof playerAPs !== 'undefined' && playerAPs[playerIndex]) {
            const ap = playerAPs[playerIndex];
            return (ap.currentAP || 0) + (ap.voidAP || 0);
        }
        // Fallback to global currentAP for single player or active player
        if (typeof currentAP !== 'undefined') {
            const voidAP = typeof voidAPCount !== 'undefined' ? voidAPCount : 0;
            return currentAP + voidAP;
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

    broadcastResponseResolved(results, originalScroll = null) {
        if (typeof broadcastGameAction === 'function') {
            // Resolve the original scroll's definition for the broadcast so remote
            // clients can store it (e.g. for Reflect's deferred activation).
            let trigDef = null;
            if (originalScroll) {
                trigDef = originalScroll.scrollData?.definition
                    || originalScroll.scrollData?.spell
                    || this.spellSystem?.patterns?.[originalScroll.scrollData?.name]
                    || null;
            }
            broadcastGameAction('response-resolved', {
                results: results.map(r => ({
                    scrollName: r.scrollData?.name,
                    casterIndex: r.casterIndex,
                    result: r.result,
                    isResponse: r.isResponse
                })),
                triggeringScroll: originalScroll ? {
                    name: originalScroll.scrollData?.name,
                    casterIndex: originalScroll.casterIndex,
                    definition: trigDef
                } : null
            });
        }
    }

    /**
     * Handle remote response resolution - close window on all clients
     */
    handleRemoteResolved() {
        console.log('Remote response window resolved');
        this.clearResponseTimeout();
        this.closeResponseModal();
        this.isResponseWindowOpen = false;
        this.pendingScrollData = null;
        this.currentCaster = null;
        this.respondingPlayers.clear();
    }

    // Methods for handling remote multiplayer events

    /**
     * Show response modal for a non-casting player (called when receiving broadcast)
     */
    showResponseModalForOtherPlayer(scrollData, casterIndex) {
        this.isResponseWindowOpen = true;
        this.currentCaster = casterIndex;
        this.pendingScrollData = scrollData;
        this.respondingPlayers.clear();
        // The caster is already considered to have "responded" (they cast the spell)
        this.respondingPlayers.add(casterIndex);
        this.responseStack = [{
            scrollData,
            casterIndex,
            isOriginal: true
        }];

        // Only show the modal if THIS player can respond; otherwise auto-pass
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : activePlayerIndex;
        const responseCheck = this.canPlayerRespond(myIndex);
        if (responseCheck.canRespond) {
            this.showResponseModal();
            this.startResponseTimeout();
        } else {
            if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
                this.broadcastPass(myIndex);
            }
            // Mark as responded locally so caster can resolve
            this.respondingPlayers.add(myIndex);
            this.checkAllPlayersResponded();
        }
    }

    /**
     * Handle a remote player passing
     */
    handleRemotePass(playerIndex) {
        console.log(`Remote player ${playerIndex} passed`);
        this.respondingPlayers.add(playerIndex);

        // Check if all non-caster players have responded
        this.checkAllPlayersResponded();
    }

    /**
     * Handle a remote player responding with a scroll
     * NOTE: Only ONE response is allowed - resolve immediately after receiving it
     */
    handleRemoteResponse(scrollName, playerIndex, isCounter) {
        console.log(`Remote player ${playerIndex} responded with ${scrollName}`);

        const scrollDef = this.spellSystem.patterns[scrollName];
        this.responseStack.push({
            scrollData: { name: scrollName, definition: scrollDef },
            casterIndex: playerIndex,
            isCounter: isCounter,
            isResponse: scrollDef?.isResponse || false,
            isOriginal: false
        });

        // Close current modal
        this.closeResponseModal();

        // Only the caster's client should resolve the response stack.
        // Non-caster clients wait for the 'response-resolved' broadcast.
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null;
        const isCasterClient = !(typeof isMultiplayer !== 'undefined' && isMultiplayer) || myIndex === this.currentCaster;
        if (isCasterClient) {
            // Only ONE response allowed - immediately resolve the stack
            console.log(`  One response received from remote player (caster client), resolving stack immediately`);
            this.resolveResponseStack();
        } else {
            console.log(`  Response received, waiting for caster to resolve`);
            this.clearResponseTimeout();
        }
    }

    /**
     * Check if all players have responded and resolve if so
     */
    checkAllPlayersResponded() {
        // Only the caster's client should resolve the response stack.
        // Non-caster clients wait for the 'response-resolved' broadcast.
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null;
        const isCasterClient = !(typeof isMultiplayer !== 'undefined' && isMultiplayer) || myIndex === this.currentCaster;
        if (!isCasterClient) {
            return; // Non-caster: do nothing, wait for broadcast
        }

        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 1;

        // Count how many non-caster players should respond
        let expectedResponders = 0;
        for (let i = 0; i < numPlayers; i++) {
            if (i !== this.currentCaster) {
                expectedResponders++;
            }
        }

        const requiredResponders = expectedResponders + 1; // include caster (already counted)
        console.log(`Response check: ${this.respondingPlayers.size} responded, ${requiredResponders} expected`);

        if (this.respondingPlayers.size >= requiredResponders) {
            // All players have responded - resolve the stack
            this.resolveResponseStack();
        }
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.ResponseWindowSystem = ResponseWindowSystem;
}
