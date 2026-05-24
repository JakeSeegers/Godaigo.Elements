/**
 * Response Window System for Godaigo
 *
 * When a player casts a scroll, a "response window" opens allowing ALL other players
 * with valid response scrolls to respond simultaneously. After all eligible players
 * have either responded or passed, the winner is determined by element rank:
 *   Void (5) > Wind (4) > Fire (3) > Water (2) > Earth (1)
 * Only the highest-ranked response executes. Ties are impossible because each scroll
 * exists only once in the game.
 *
 * New rule: A response scroll that is in a player's HAND can be moved to their active
 * area during the response window, but only if they have an open active slot. The
 * response window includes these hand scrolls as clickable options with a badge.
 *
 * Rules:
 * - Response costs normal 2 AP
 * - Responder must have valid scroll (active, common, or hand+open-slot) AND valid pattern
 * - Earth I (Iron Stance) / Void I (Psychic) are counter scrolls — they cancel the original
 * - All other response scrolls execute alongside the original
 * - All non-caster players submit (respond or pass) before resolution begins
 */

// Element rank for response arbitration: higher = wins over lower
const ELEMENT_RANK = { void: 5, wind: 4, fire: 3, water: 2, earth: 1 };

/**
 * Get the element rank for a scroll name like 'WIND_SCROLL_1' → 4
 */
function getScrollElementRank(scrollName) {
    const element = (scrollName || '').split('_')[0].toLowerCase();
    return ELEMENT_RANK[element] ?? 0;
}

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
            const patternOk = this.checkPatternForPlayer(scrollName, playerIndex);
            if (patternOk) {
                const scrollDef = this.spellSystem.patterns[scrollName];
                const isCounter = scrollDef?.canCounter === 'any';
                const isResponse = scrollDef?.isResponse === true;

                // Only include scrolls that are counter scrolls OR response scrolls
                // Regular scrolls can't be cast as responses
                if (isCounter || isResponse) {
                    const cost = this.spellSystem?.getSpellCost ? this.spellSystem.getSpellCost(scrollDef, playerIndex) : 2;
                    if (playerAP < cost) {
                        console.log(`  ↳ ${scrollName}: pattern OK, isResponse=${isResponse} but can't afford (AP=${playerAP}, cost=${cost})`);
                        continue;
                    }
                    validScrolls.push({
                        name: scrollName,
                        definition: scrollDef,
                        isCounter: isCounter,
                        isResponse: isResponse,
                        fromCommonArea: commonScrolls.includes(scrollName),
                        cost: cost
                    });
                } else {
                    console.log(`  ↳ ${scrollName}: pattern OK but not a counter/response scroll`);
                }
            } else {
                console.log(`  ↳ ${scrollName}: pattern NOT matched for player ${playerIndex}`);
            }
        }

        // Also check hand scrolls — usable if active area has an open slot
        // (new rule: response scrolls in hand can be moved to active during the response window)
        const hasOpenActiveSlot = (playerScrolls.active?.size ?? 0) < (this.spellSystem.MAX_ACTIVE_SIZE ?? 2);
        if (hasOpenActiveSlot) {
            for (const scrollName of (playerScrolls.hand || new Set())) {
                const patternOk = this.checkPatternForPlayer(scrollName, playerIndex);
                if (patternOk) {
                    const scrollDef = this.spellSystem.patterns[scrollName];
                    const isCounter = scrollDef?.canCounter === 'any';
                    const isResponse = scrollDef?.isResponse === true;
                    if (isCounter || isResponse) {
                        const cost = this.spellSystem?.getSpellCost ? this.spellSystem.getSpellCost(scrollDef, playerIndex) : 2;
                        if (playerAP < cost) {
                            console.log(`  ↳ ${scrollName} (hand): pattern OK, isResponse=${isResponse} but can't afford (AP=${playerAP}, cost=${cost})`);
                            continue;
                        }
                        validScrolls.push({
                            name: scrollName,
                            definition: scrollDef,
                            isCounter,
                            isResponse,
                            fromCommonArea: false,
                            fromHand: true,
                            cost
                        });
                        console.log(`  ↳ ${scrollName} (hand): valid response — will move to active on use`);
                    }
                }
            }
        }

        if (validScrolls.length === 0) {
            return { canRespond: false, validScrolls: [], reason: `No valid responses you can afford (AP=${playerAP})` };
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
        // Scroll definition opts out of response window entirely (e.g. Excavate)
        const _castDef = this.spellSystem?.patterns?.[scrollData.name];
        if (_castDef?.skipResponseWindow) {
            console.log(`Response window skipped - ${scrollData.name} has skipResponseWindow`);
            if (onComplete) onComplete({ skipped: true, responses: [] });
            return;
        }

        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 0;
        const hasOtherPlayer = numPlayers > 1;
        if (!hasOtherPlayer) {
            console.log('Response window skipped - only one player');
            if (onComplete) onComplete({ skipped: true, responses: [] });
            return;
        }

        // Quick check: can any non-caster player actually respond?
        // In SINGLE-PLAYER we skip the response window when no one can respond.
        // In MULTIPLAYER we do NOT skip here — this check runs on the caster's client
        // using its local snapshot of opponent scroll state, which can lag behind due
        // to in-flight `scroll-move` broadcasts. Skipping would block valid Iron Stance
        // counters that arrived just before the winning scroll was cast.
        // Each non-caster client already checks their own state locally inside
        // showResponseModalForOtherPlayer() and auto-passes instantly if they can't
        // respond, so no one is ever stuck waiting.
        const _inMultiplayer = typeof isMultiplayer !== 'undefined' && isMultiplayer;
        if (!_inMultiplayer && !this.canAnyPlayerRespond(casterIndex)) {
            console.log('Response window skipped - no player can respond (no valid counter/response scrolls)');
            if (onComplete) onComplete({ skipped: true, responses: [] });
            return;
        }

        // Excavate: caster's scrolls cannot be responded to this turn
        if (window.spellSystem?.scrollEffects?.hasExcavateNoResponse?.(casterIndex)) {
            console.log('Response window skipped - caster has Excavate no-response buff');
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
            scrollsHeader.textContent = 'Your Available Responses (ranked by priority):';
            scrollsHeader.style.color = '#16a085';
            scrollsHeader.style.marginBottom = '15px';
            scrollsSection.appendChild(scrollsHeader);

            // Sort highest-rank first so the player sees their strongest option at top
            const sorted = [...responseCheck.validScrolls].sort(
                (a, b) => getScrollElementRank(b.name) - getScrollElementRank(a.name)
            );
            sorted.forEach(scrollInfo => {
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
        const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
        const def = scrollInfo.definition;
        const element = def?.element || 'earth';
        const elementColor = this.getElementColor(element);
        const iconSrc = window.STONE_TYPES?.[element]?.img || '';
        const elLabel = element ? element.charAt(0).toUpperCase() + element.slice(1) : '';
        const lvLabel = def?.level ? 'Lv. ' + (ROMAN[def.level] || def.level) : '';
        const metaText = [elLabel, lvLabel].filter(Boolean).join(' · ');

        // Determine border color based on scroll type
        let borderColor = elementColor;
        if (scrollInfo.isCounter) borderColor = '#e74c3c';
        else if (scrollInfo.isResponse) borderColor = '#f39c12';

        const card = document.createElement('div');
        Object.assign(card.style, {
            backgroundColor: '#2d2d44',
            border: '2px solid ' + borderColor,
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '10px',
            cursor: 'pointer',
            transition: 'all 0.2s'
        });
        card.onmouseenter = () => { card.style.backgroundColor = '#3d3d54'; card.style.transform = 'scale(1.02)'; };
        card.onmouseleave = () => { card.style.backgroundColor = '#2d2d44'; card.style.transform = 'scale(1)'; };

        // ── Header: icon · name + meta · badges ──────────────────────────
        const headerDiv = document.createElement('div');
        Object.assign(headerDiv.style, { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' });

        if (iconSrc) {
            const icon = document.createElement('img');
            icon.src = iconSrc;
            Object.assign(icon.style, { width: '26px', height: '26px', flexShrink: '0' });
            headerDiv.appendChild(icon);
        }

        const titleWrap = document.createElement('div');
        Object.assign(titleWrap.style, { flex: '1', minWidth: '0' });

        const nameSpan = document.createElement('div');
        nameSpan.textContent = def?.name || scrollInfo.name;
        Object.assign(nameSpan.style, { fontWeight: 'bold', color: elementColor, fontSize: '15px' });
        titleWrap.appendChild(nameSpan);

        if (metaText) {
            const metaSpan = document.createElement('div');
            metaSpan.textContent = metaText;
            Object.assign(metaSpan.style, { fontSize: '11px', color: '#95a5a6', marginTop: '2px' });
            titleWrap.appendChild(metaSpan);
        }
        headerDiv.appendChild(titleWrap);

        // Badges (counter / response / common)
        const badgesWrap = document.createElement('div');
        Object.assign(badgesWrap.style, { display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: '0' });
        const makeBadge = (text, bg) => {
            const b = document.createElement('span');
            b.textContent = text;
            Object.assign(b.style, { backgroundColor: bg, color: 'white', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center' });
            return b;
        };
        if (scrollInfo.isCounter)      badgesWrap.appendChild(makeBadge('COUNTER',  '#e74c3c'));
        if (scrollInfo.isResponse)     badgesWrap.appendChild(makeBadge('RESPONSE', '#f39c12'));
        if (scrollInfo.fromCommonArea) badgesWrap.appendChild(makeBadge('COMMON',   '#9b59b6'));
        if (scrollInfo.fromHand) badgesWrap.appendChild(makeBadge('IN HAND', '#e67e22'));
        if (badgesWrap.children.length) headerDiv.appendChild(badgesWrap);

        card.appendChild(headerDiv);

        // ── Description ───────────────────────────────────────────────────
        if (def?.description) {
            const descDiv = document.createElement('div');
            descDiv.textContent = def.description;
            Object.assign(descDiv.style, { fontSize: '12px', color: '#bdc3c7', marginBottom: '8px' });
            card.appendChild(descDiv);
        }

        // ── Pattern visual ────────────────────────────────────────────────
        const sp = window.spellSystem;
        if (def?.patterns && sp && typeof sp.createPatternVisual === 'function') {
            try {
                const visual = sp.createPatternVisual(def, element);
                if (visual) {
                    const patWrap = document.createElement('div');
                    Object.assign(patWrap.style, {
                        display: 'flex', justifyContent: 'center',
                        margin: '8px 0', padding: '6px',
                        backgroundColor: '#1a1a2e', borderRadius: '6px'
                    });
                    patWrap.appendChild(visual);
                    card.appendChild(patWrap);
                }
            } catch (e) { /* skip if pattern rendering fails */ }
        }

        // ── AP cost ───────────────────────────────────────────────────────
        const displayCost = (scrollInfo && typeof scrollInfo.cost === 'number') ? scrollInfo.cost : 2;
        const costDiv = document.createElement('div');
        costDiv.textContent = `${displayCost} AP`;
        Object.assign(costDiv.style, { fontSize: '12px', color: '#f39c12', marginTop: '6px' });
        card.appendChild(costDiv);

        // Hand-scroll note
        if (scrollInfo.fromHand) {
            const handNote = document.createElement('div');
            handNote.textContent = '📋 Will move from Hand → Active Area';
            Object.assign(handNote.style, { fontSize: '11px', color: '#e67e22', marginTop: '4px', fontStyle: 'italic' });
            card.appendChild(handNote);
        }

        // Click to respond
        card.onclick = () => this.playerResponds(scrollInfo);

        return card;
    }

    /**
     * Handle player choosing to respond with a scroll.
     * If the scroll is fromHand, it is moved to the active area first.
     * Resolution is deferred until ALL eligible players have responded or passed.
     */
    playerResponds(scrollInfo) {
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : activePlayerIndex;
        console.log(`playerResponds called: myIndex=${myIndex}, scroll=${scrollInfo.name}, fromHand=${scrollInfo.fromHand}`);

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

        // If scroll is in hand, move it to active area now
        if (scrollInfo.fromHand && this.spellSystem) {
            const pScrolls = this.spellSystem.playerScrolls[myIndex];
            if (pScrolls) {
                pScrolls.hand.delete(scrollInfo.name);
                pScrolls.active.add(scrollInfo.name);
                this.spellSystem.updateScrollCount();
                console.log(`  Moved ${scrollInfo.name} from hand to active area`);
            }
        }

        // Spend the AP for the response
        this.spendPlayerAP(myIndex, cost);
        console.log(`  Spent ${cost} AP for response`);

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

        // Mark this player as submitted (same pool as passes)
        this.respondingPlayers.add(myIndex);

        // Broadcast response in multiplayer (includes fromHand so receiver can sync state)
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
            this.broadcastResponse(scrollInfo, myIndex);
            console.log(`  Broadcasted response`);
        }

        // Close the current modal and show "waiting" screen while others decide
        this.closeResponseModal();

        const isCasterClient = !(typeof isMultiplayer !== 'undefined' && isMultiplayer) || myIndex === this.currentCaster;
        if (isCasterClient) {
            // Wait for all other eligible players before arbitrating
            console.log(`  Response submitted (caster client) — waiting for all players`);
            this.checkAllPlayersResponded();
        } else {
            // Non-caster: sent our response, wait for caster to arbitrate and broadcast result
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
            // Caster's client: check if all non-casters have submitted
            this.checkAllPlayersResponded();
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
        // For the local player, currentAP is always the live authoritative value.
        // playerAPs[myPlayerIndex] can be a stale snapshot (e.g. from the start of their
        // last turn), which would let the affordability check pass even when currentAP is 0
        // and cause spendAP to drive AP negative.
        if (typeof myPlayerIndex !== 'undefined' && playerIndex === myPlayerIndex
                && typeof currentAP !== 'undefined') {
            const localVoidAP = typeof voidAP !== 'undefined' ? voidAP : 0;
            return currentAP + localVoidAP;
        }
        // For other players, use the synced playerAPs snapshot
        if (typeof playerAPs !== 'undefined' && playerAPs[playerIndex]) {
            const ap = playerAPs[playerIndex];
            return (ap.currentAP || 0) + (ap.voidAP || 0);
        }
        // Fallback
        if (typeof currentAP !== 'undefined') {
            return currentAP;
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
            // Include the current common area state so receiving clients can apply it
            // before checking canPlayerRespond — avoids a race condition where
            // common-area-update (e.g. Psychic moving there) hasn't arrived yet.
            const commonAreaSnapshot = this.spellSystem?.commonArea
                ? { ...this.spellSystem.commonArea }
                : null;
            broadcastGameAction('response-window-opened', {
                scrollName: scrollData.name,
                casterIndex: casterIndex,
                commonArea: commonAreaSnapshot
            });
        }
    }

    broadcastResponse(scrollInfo, playerIndex) {
        if (typeof broadcastGameAction === 'function') {
            broadcastGameAction('scroll-response', {
                scrollName: scrollInfo.name,
                playerIndex: playerIndex,
                isCounter: scrollInfo.isCounter,
                fromHand: scrollInfo.fromHand ?? false
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
     * Handle a remote player responding with a scroll.
     * Defers resolution until all eligible players have submitted.
     * @param {string} scrollName
     * @param {number} playerIndex
     * @param {boolean} isCounter
     * @param {boolean} fromHand - if true, move scroll from hand to active on this client
     */
    handleRemoteResponse(scrollName, playerIndex, isCounter, fromHand = false) {
        console.log(`Remote player ${playerIndex} responded with ${scrollName} (fromHand=${fromHand})`);

        // If scroll came from hand, sync the hand→active move on this client
        if (fromHand && this.spellSystem) {
            const pScrolls = this.spellSystem.playerScrolls[playerIndex];
            if (pScrolls) {
                pScrolls.hand.delete(scrollName);
                pScrolls.active.add(scrollName);
                this.spellSystem.updateScrollCount();
                if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI();
            }
        }

        const scrollDef = this.spellSystem.patterns[scrollName];
        this.responseStack.push({
            scrollData: { name: scrollName, definition: scrollDef },
            casterIndex: playerIndex,
            isCounter: isCounter,
            isResponse: scrollDef?.isResponse || false,
            fromCommonArea: false,
            isOriginal: false
        });

        // Mark this player as submitted
        this.respondingPlayers.add(playerIndex);

        // Only the caster's client arbitrates. Non-caster clients wait for 'response-resolved'.
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null;
        const isCasterClient = !(typeof isMultiplayer !== 'undefined' && isMultiplayer) || myIndex === this.currentCaster;
        if (isCasterClient) {
            // Wait for all other eligible players before resolving
            console.log(`  Response from player ${playerIndex} received (caster client) — checking all submitted`);
            this.checkAllPlayersResponded();
        } else {
            console.log(`  Response received, waiting for caster to resolve`);
            this.clearResponseTimeout();
        }
    }

    /**
     * Check if all non-caster players have submitted (responded or passed).
     * Only the caster's client calls this; non-casters wait for 'response-resolved'.
     * When all have submitted, arbitrates by element rank and resolves.
     */
    checkAllPlayersResponded() {
        const myIndex = typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : null;
        const isCasterClient = !(typeof isMultiplayer !== 'undefined' && isMultiplayer) || myIndex === this.currentCaster;
        if (!isCasterClient) {
            return; // Non-caster: do nothing, wait for broadcast
        }

        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 1;

        // All non-caster players must submit (respond or pass) before we arbitrate
        let expectedResponders = 0;
        for (let i = 0; i < numPlayers; i++) {
            if (i !== this.currentCaster) expectedResponders++;
        }
        const requiredResponders = expectedResponders + 1; // +1 for caster (already in set)
        console.log(`Response check: ${this.respondingPlayers.size} submitted, ${requiredResponders} expected`);

        if (this.respondingPlayers.size >= requiredResponders) {
            // All players have submitted — arbitrate by element rank
            this._arbitrateAndResolve();
        } else {
            // Still waiting — show the waiting screen if we're not already
            this.showWaitingForOthers();
        }
    }

    /**
     * Sort submitted responses by element rank (Void > Wind > Fire > Water > Earth).
     * Only the highest-ranked response executes; others' AP is already spent.
     * Then delegates to resolveResponseStack() for effect execution and broadcast.
     */
    _arbitrateAndResolve() {
        // Separate responses from original
        const responses = this.responseStack.filter(e => !e.isOriginal);
        const original  = this.responseStack.find(e => e.isOriginal);

        if (responses.length > 1) {
            // Sort descending by element rank
            responses.sort((a, b) =>
                getScrollElementRank(b.scrollData?.name) - getScrollElementRank(a.scrollData?.name)
            );
            const winner  = responses[0];
            const losers  = responses.slice(1);
            console.log(`⚖️ Arbitration: winner = ${winner.scrollData?.name} (rank ${getScrollElementRank(winner.scrollData?.name)})`);
            losers.forEach(l => console.log(`  ✗ Loser (AP spent, no effect): ${l.scrollData?.name}`));
            // Rebuild stack: original first, then winner (pop() is LIFO → winner resolved first)
            this.responseStack = [];
            if (original) this.responseStack.push(original);
            this.responseStack.push(winner);
        }
        // If 0 or 1 responses, stack is already correct — just resolve
        this.resolveResponseStack();
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.ResponseWindowSystem = ResponseWindowSystem;
}
