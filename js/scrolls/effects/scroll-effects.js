/**
 * Scroll Effects System
 *
 * This file contains the effect definitions and execution logic for all scrolls.
 * Each scroll has an execute() function that performs its effect.
 */

const ScrollEffects = {
    // Active buffs that persist during a turn
    activeBuffs: {},

    // Current selection mode state
    selectionMode: null,

    // Initialize the effects system
    init(spellSystem) {
        this.spellSystem = spellSystem;
        this.activeBuffs = {};
        this.selectionMode = null;
        console.log('📜 Scroll Effects system initialized');
    },

    // Clear turn-based buffs (called on End Turn)
    clearTurnBuffs() {
        Object.keys(this.activeBuffs).forEach(key => {
            if (this.activeBuffs[key]?.expiresThisTurn) {
                if (key === 'controlTheCurrent' && this.selectionMode?.type === 'water-transform') {
                    this.selectionMode.cleanup();
                    this.selectionMode = null;
                }
                if (key === 'respirateWind') {
                    const buff = this.activeBuffs.respirateWind;
                    const pools = typeof playerPools !== 'undefined' ? playerPools : (typeof window !== 'undefined' && window.playerPools);
                    const source = typeof stonePools !== 'undefined' ? stonePools : (typeof window !== 'undefined' && window.stonePools);
                    const capacity = typeof sourcePoolCapacity !== 'undefined'
                        ? sourcePoolCapacity
                        : (typeof window !== 'undefined' && window.sourcePoolCapacity);
                    if (buff && pools && source) {
                        const pool = pools[buff.playerIndex];
                        if (pool && typeof pool.wind === 'number' && pool.wind > 0) {
                            const amount = pool.wind;
                            pool.wind = 0;
                            if (capacity && typeof capacity.wind === 'number') {
                                source.wind = Math.min(capacity.wind, (source.wind || 0) + amount);
                            } else {
                                source.wind = (source.wind || 0) + amount;
                            }
                            if (typeof updateStoneCount === 'function') {
                                updateStoneCount('wind');
                            }
                            if (typeof updateStatus === 'function') {
                                updateStatus('Respirate: returned all wind stones to the source pool.');
                            }
                            console.log(`🌬️ Respirate returned ${amount} wind stones to source`);
                        }
                    }
                }
                delete this.activeBuffs[key];
                console.log(`📜 Cleared buff: ${key}`);
            }
        });
    },

    // Clear Freedom buff for a player when their next turn starts
    clearFreedomForPlayer(playerIndex) {
        const buff = this.activeBuffs.freedom;
        if (!buff || buff.playerIndex !== playerIndex) return;
        delete this.activeBuffs.freedom;
        if (typeof updateCatacombIndicators === 'function') {
            updateCatacombIndicators();
        }
    },

    // Clear Quick Reflexes buff for a player when their next turn starts
    clearQuickReflexesForPlayer(playerIndex) {
        const buff = this.activeBuffs.quickReflexes;
        if (!buff || buff.playerIndex !== playerIndex) return;
        delete this.activeBuffs.quickReflexes;
    },

    // Cancel any active selection mode
    cancelSelectionMode() {
        if (this.selectionMode) {
            if (typeof this.selectionMode.cleanup === 'function') {
                this.selectionMode.cleanup();
            } else if (this.selectionMode.cancelBtn && this.selectionMode.cancelBtn.parentNode) {
                this.selectionMode.cancelBtn.parentNode.removeChild(this.selectionMode.cancelBtn);
            }
            this.selectionMode = null;
            updateStatus('Selection cancelled.');
        }

        // Safety: remove any orphaned cancel button
        const cancelEl = document.getElementById('scroll-cancel-btn');
        if (cancelEl && cancelEl.parentNode) {
            cancelEl.parentNode.removeChild(cancelEl);
        }
    },

    // Get the effect handler for a scroll
    getEffect(scrollName) {
        return this.effects[scrollName] || null;
    },

    // Execute a scroll's effect
    execute(scrollName, casterIndex, context = {}) {
        const effect = this.getEffect(scrollName);
        if (!effect) {
            console.warn(`No effect defined for scroll: ${scrollName}`);
            return { success: false, reason: 'No effect defined' };
        }

        try {
            return effect.execute(casterIndex, context, this);
        } catch (err) {
            console.error(`Error executing scroll effect ${scrollName}:`, err);
            return { success: false, reason: err.message };
        }
    },

    // Effect definitions for each scroll
    effects: {
        // ============================================
        // EARTH SCROLLS
        // ============================================

        /**
         * Earth Scroll I - Iron Stance
         * Counter the most recently cast scroll.
         */
        EARTH_SCROLL_1: {
            name: 'Iron Stance',
            description: 'Counter the most recently cast scroll. That scroll is cancelled.',
            isCounter: true,
            priority: 1,

            execute(casterIndex, context, system) {
                // This scroll's effect is handled by the response window system
                // When used as a counter, it marks the target scroll as cancelled
                console.log(`🛡️ Iron Stance activated by player ${casterIndex}`);

                // The actual counter logic is in response-window.js resolveResponseStack
                // This just needs to signal that it's a counter
                return {
                    success: true,
                    isCounter: true,
                    message: 'Iron Stance counters the scroll!'
                };
            }
        },

        /**
         * Earth Scroll II - Shifting Sands
         * Swap two tiles on the board.
         */
        EARTH_SCROLL_2: {
            name: 'Shifting Sands',
            description: 'Select two tiles to swap their positions. Tiles must have no stones or players on them.',
            isCounter: false,
            priority: 2,

            execute(casterIndex, context, system) {
                console.log(`🔀 Shifting Sands activated by player ${casterIndex}`);

                // Enter tile selection mode; pass payload so we can call onSelectionEffectComplete when done
                const payload = {
                    scrollName: context.scrollName || 'EARTH_SCROLL_2',
                    spell: context.spell,
                    effectName: 'Shifting Sands'
                };
                system.enterTileSwapMode(casterIndex, payload);

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select two tiles to swap...'
                };
            }
        },

        /**
         * Earth Scroll III - Mason's Savvy
         * Draw earth stones and enable extended placement range.
         */
        EARTH_SCROLL_3: {
            name: "Mason's Savvy",
            description: 'Draw up to 5 earth stones. This turn, place earth stones within 5 hexes of player.',
            isCounter: false,
            priority: 3,

            execute(casterIndex, context, system) {
                console.log(`🪨 Mason's Savvy activated by player ${casterIndex}`);

                // Draw up to 5 earth stones
                const drawn = system.drawStonesToPool('earth', 5, casterIndex);

                // Activate extended placement buff
                system.activeBuffs.earthExtendedPlacement = {
                    range: 5,
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                const message = `Drew ${drawn} earth stones! Extended placement (5 hex range) active this turn.`;
                updateStatus(message);

                return {
                    success: true,
                    stonesDrawn: drawn,
                    message: message
                };
            }
        },

        /**
         * Earth Scroll IV - Heavy Stomp
         * Flip a tile (reveal hidden or hide revealed).
         */
        EARTH_SCROLL_4: {
            name: 'Heavy Stomp',
            description: 'Select a tile to flip. Hidden tiles are revealed (draw scroll). Revealed tiles become hidden.',
            isCounter: false,
            priority: 4,

            execute(casterIndex, context, system) {
                console.log(`👣 Heavy Stomp activated by player ${casterIndex}`);

                // Enter tile flip selection mode
                system.enterTileFlipMode(casterIndex);

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a tile to flip...'
                };
            }
        },

        /**
         * Earth Scroll V - Avalanche
         * Enable global stone placement for this turn.
         */
        EARTH_SCROLL_5: {
            name: 'Avalanche',
            description: 'This turn, place any stones anywhere on the board (not just adjacent).',
            isCounter: false,
            priority: 5,

            execute(casterIndex, context, system) {
                console.log(`🏔️ Avalanche activated by player ${casterIndex}`);

                // Activate global placement buff
                system.activeBuffs.globalPlacement = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                const message = 'Avalanche! Place stones anywhere this turn.';
                updateStatus(message);

                return {
                    success: true,
                    message: message
                };
            }
        },

        // ============================================
        // WATER SCROLLS
        // ============================================

        /**
         * Water Scroll I - Reflect
         * Duplicate the effect of the scroll that was last cast this turn.
         */
        WATER_SCROLL_1: {
            name: 'Reflect',
            description: 'Duplicate the effect of the scroll that was last cast this turn.',
            isCounter: false,
            priority: 1,

            execute(casterIndex, context, system) {
                console.log(`🪞 Reflect activated by player ${casterIndex}`);

                // When cast as a response: defer effect to beginning of caster's next turn
                const triggeringScroll = context?.triggeringScroll;
                if (triggeringScroll && triggeringScroll.name) {
                    if (triggeringScroll.name === 'WATER_SCROLL_1') {
                        updateStatus('Reflect failed: Cannot reflect Reflect!');
                        return { success: false, reason: 'Cannot reflect Reflect' };
                    }
                    system.activeBuffs.reflectPending = {
                        playerIndex: casterIndex,
                        scrollName: triggeringScroll.name,
                        definition: triggeringScroll.definition
                    };
                    updateStatus(`Reflect: At the beginning of your next turn, you will activate ${triggeringScroll.definition?.name || triggeringScroll.name}.`);
                    return { success: true, deferred: true };
                }

                // Get the last scroll cast this turn (main-phase Reflect)
                const lastScroll = system.lastScrollCastThisTurn;
                if (!lastScroll || !lastScroll.name) {
                    updateStatus('Reflect failed: No scroll was cast this turn!');
                    return { success: false, reason: 'No scroll cast this turn' };
                }

                // Cannot reflect itself
                if (lastScroll.name === 'WATER_SCROLL_1') {
                    updateStatus('Reflect failed: Cannot reflect Reflect!');
                    return { success: false, reason: 'Cannot reflect Reflect' };
                }

                const scrollDef = lastScroll.definition;
                const scrollName = lastScroll.name;

                // Execute the reflected scroll's effect
                const displayName = scrollDef?.name || scrollName;
                updateStatus(`Reflecting ${displayName}!`);

                // Check if the reflected scroll has a special effect
                const effect = system.getEffect(scrollName);
                if (effect) {
                    console.log(`🪞 Reflecting special effect: ${effect.name}`);
                    // Execute the reflected scroll's special effect
                    const result = system.execute(scrollName, casterIndex, context);
                    return {
                        success: true,
                        reflected: scrollName,
                        message: `Reflected ${displayName}!`,
                        ...result
                    };
                }

                // No special effect - give base stone rewards
                if (scrollDef) {
                    const level = scrollDef.level || 1;
                    const element = scrollDef.element;

                    if (element && element !== 'catacomb') {
                        // Give stones based on scroll level
                        if (typeof stonePools !== 'undefined') {
                            const currentPlayerStones = typeof playerStoneCounts !== 'undefined'
                                ? playerStoneCounts[casterIndex]
                                : null;

                            if (currentPlayerStones) {
                                currentPlayerStones[element] = (currentPlayerStones[element] || 0) + level;
                                updateStatus(`Reflect! Gained +${level} ${element} stones from ${displayName}!`);

                                // Update UI
                                if (typeof updateStoneCountsUI === 'function') {
                                    updateStoneCountsUI();
                                }
                            }
                        }
                    } else if (element === 'catacomb' && scrollDef.patterns && scrollDef.patterns[0]) {
                        // Catacomb scroll - give +2 of each element in pattern
                        const elementCounts = {};
                        scrollDef.patterns[0].forEach(pos => {
                            elementCounts[pos.type] = (elementCounts[pos.type] || 0) + 1;
                        });

                        const currentPlayerStones = typeof playerStoneCounts !== 'undefined'
                            ? playerStoneCounts[casterIndex]
                            : null;

                        if (currentPlayerStones) {
                            Object.entries(elementCounts).forEach(([elem, count]) => {
                                currentPlayerStones[elem] = (currentPlayerStones[elem] || 0) + 2;
                            });
                            updateStatus(`Reflect! Gained catacomb scroll stones from ${displayName}!`);

                            if (typeof updateStoneCountsUI === 'function') {
                                updateStoneCountsUI();
                            }
                        }
                    }
                }

                return {
                    success: true,
                    reflected: scrollName,
                    message: `Reflected ${displayName}!`
                };
            }
        },

        /**
         * Water Scroll II - Refreshing Thought
         * Discard a scroll to common area, draw a scroll of that type.
         */
        WATER_SCROLL_2: {
            name: 'Refreshing Thought',
            description: 'Discard a scroll to the common area, then draw a scroll of that element type.',
            isCounter: false,
            priority: 2,

            execute(casterIndex, context, system) {
                console.log(`💧 Refreshing Thought activated by player ${casterIndex}`);

                // Enter scroll selection mode
                system.enterScrollDiscardMode(casterIndex, 'refreshing-thought');

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a scroll to discard...'
                };
            }
        },

        /**
         * Water Scroll III - Inspiring Draught
         * Draw 2 scrolls from any decks, put 1 back and shuffle.
         */
        WATER_SCROLL_3: {
            name: 'Inspiring Draught',
            description: 'Draw 2 scrolls from any decks, then put 1 back and shuffle that deck.',
            isCounter: false,
            priority: 3,

            execute(casterIndex, context, system) {
                console.log(`🍵 Inspiring Draught activated by player ${casterIndex}`);

                // In multiplayer, only open the modal for the casting player
                if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null) {
                    if (myPlayerIndex !== casterIndex) {
                        return { success: true, message: 'Inspiring Draught resolved for remote player.' };
                    }
                }

                // Draw 2 from one deck, then put 1 back (show all scrolls of that element)
                system.enterInspiringDraughtMode(casterIndex);

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a deck, then choose one scroll to put back.'
                };
            }
        },

        /**
         * Water Scroll IV - Wandering River
         * A tile becomes any element type until next turn.
         */
        WATER_SCROLL_4: {
            name: 'Wandering River',
            description: 'Select a tile. Until your next turn, that tile counts as any element type you choose.',
            isCounter: false,
            priority: 4,

            execute(casterIndex, context, system) {
                console.log(`🌊 Wandering River activated by player ${casterIndex}`);

                // Enter tile selection mode for element change
                system.enterTileElementChangeMode(casterIndex);

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a tile to change its element...'
                };
            }
        },

        /**
         * Water Scroll V - Control the Current
         * Click adjacent water stones to transform them into any element (free, no AP cost).
         */
        WATER_SCROLL_5: {
            name: 'Control the Current',
            description: 'This turn, click adjacent water stones to transform them into any other element (free).',
            isCounter: false,
            priority: 5,

            execute(casterIndex, context, system) {
                console.log(`🌀 Control the Current activated by player ${casterIndex}`);

                // Activate water transformation buff - enables clicking water stones to transform
                system.activeBuffs.controlTheCurrent = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                // Enter water stone selection mode
                system.enterWaterTransformMode(casterIndex);

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Click adjacent water stones to transform them!'
                };
            }
        },

        // ============================================
        // FIRE SCROLLS
        // ============================================

        /**
         * Fire Scroll I - Unbidden Lamplight
         * Response scroll - when opponent casts a scroll, send it to common area.
         * This is a response scroll (like Iron Stance) but doesn't cancel the scroll.
         */
        FIRE_SCROLL_1: {
            name: 'Unbidden Lamplight',
            description: 'Response: Send the triggering scroll to the common area (scroll still resolves).',
            isCounter: false, // Doesn't cancel the scroll, just redirects it
            isResponseOnly: true, // Can only be cast as a response
            priority: 1,

            execute(casterIndex, context, system) {
                console.log(`🕯️ Unbidden Lamplight activated by player ${casterIndex}`);

                // The context should contain the triggering scroll info
                const triggeringScroll = context?.triggeringScroll;

                if (triggeringScroll) {
                    // Mark the triggering scroll to go to common area
                    system.pendingCommonAreaRedirect = {
                        scrollName: triggeringScroll.name,
                        originalCasterIndex: triggeringScroll.casterIndex
                    };

                    const scrollDef = system.spellSystem?.patterns?.[triggeringScroll.name];
                    const scrollDisplayName = scrollDef?.name || triggeringScroll.name;
                    const message = `Unbidden Lamplight! ${scrollDisplayName} will go to common area after resolving.`;
                    updateStatus(message);

                    // Count as activating fire for win-condition indicator on player tile
                    if (system.spellSystem) {
                        system.spellSystem.ensurePlayerScrollsStructure(casterIndex);
                        system.spellSystem.playerScrolls[casterIndex].activated.add('fire');
                        if (typeof updatePlayerElementSymbols === 'function') {
                            updatePlayerElementSymbols(casterIndex);
                        }
                    }

                    return {
                        success: true,
                        redirectToCommon: triggeringScroll.name,
                        message: message
                    };
                }

                // Fallback if no triggering scroll (shouldn't happen in normal play)
                const message = 'Unbidden Lamplight activated!';
                updateStatus(message);
                if (system.spellSystem) {
                    system.spellSystem.ensurePlayerScrollsStructure(casterIndex);
                    system.spellSystem.playerScrolls[casterIndex].activated.add('fire');
                    if (typeof updatePlayerElementSymbols === 'function') {
                        updatePlayerElementSymbols(casterIndex);
                    }
                }
                return {
                    success: true,
                    message: message
                };
            }
        },

        /**
         * Fire Scroll II - Burning Motivation
         * Until end of turn, gain 2 AP for each stone you place. Stacks if activated multiple times.
         */
        FIRE_SCROLL_2: {
            name: 'Burning Motivation',
            description: 'Until end of turn, gain 2 AP for each stone you place. Stacks if activated multiple times.',
            isCounter: false,
            priority: 2,

            execute(casterIndex, context, system) {
                console.log(`🔥 Burning Motivation activated by player ${casterIndex}`);

                const existing = system.activeBuffs.burningMotivation;
                if (existing && existing.playerIndex === casterIndex) {
                    existing.stacks = (existing.stacks || 1) + 1;
                    updateStatus(`Burning Motivation! Stacks to ${existing.stacks} (gain ${existing.stacks * 2} AP per stone placed this turn).`);
                } else {
                    system.activeBuffs.burningMotivation = {
                        playerIndex: casterIndex,
                        stacks: 1,
                        expiresThisTurn: true
                    };
                    updateStatus('Burning Motivation! Gain 2 AP for each stone you place until end of turn (stacks if activated again).');
                }

                return {
                    success: true,
                    message: 'Burning Motivation active until end of turn.'
                };
            }
        },

        /**
         * Fire Scroll III - Sacrificial Pyre
         * Activate any scroll in hand ignoring pattern.
         */
        FIRE_SCROLL_3: {
            name: 'Sacrificial Pyre',
            description: 'Activate any scroll in your hand (ignoring pattern). The scroll goes to the common area.',
            isCounter: false,
            priority: 3,

            execute(casterIndex, context, system) {
                console.log(`🔥 Sacrificial Pyre activated by player ${casterIndex}`);

                // Enter scroll selection mode for sacrificial activation
                system.enterScrollSacrificeMode(casterIndex);

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a scroll to sacrifice and activate...'
                };
            }
        },

        /**
         * Fire Scroll IV - Transmute
         * Discard stones or scrolls to regain AP.
         */
        FIRE_SCROLL_4: {
            name: 'Transmute',
            description: 'Discard any number of stones or scrolls to regain 2 AP each.',
            isCounter: false,
            priority: 4,

            execute(casterIndex, context, system) {
                console.log(`🔥 Transmute activated by player ${casterIndex}`);

                // Only the caster should run Transmute UI/effects (avoid remote clients)
                if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
                    if (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null && myPlayerIndex !== casterIndex) {
                        return { success: true, message: 'Transmute resolved for remote player.' };
                    }
                }

                // Suppress void AP auto-sync while Transmute is open
                system.activeBuffs.suppressVoidAPSync = {
                    playerIndex: casterIndex
                };

                system.enterTransmuteMode(casterIndex);

                return {
                    success: true,
                    message: 'Select stones or scrolls to transmute into AP.'
                };
            }
        },

        /**
         * Fire Scroll V - Arson
         * Destroy a stone from opponent's pool.
         */
        FIRE_SCROLL_5: {
            name: 'Arson',
            description: "Destroy one elemental stone from an opponent's pool. Move Arson to the common area.",
            isCounter: false,
            priority: 5,

            execute(casterIndex, context, system) {
                console.log(`🔥 Arson activated by player ${casterIndex}`);

                // Enter opponent pool selection mode with completion payload
                system.enterArsonMode(casterIndex, {
                    scrollName: context?.scrollName || 'FIRE_SCROLL_5',
                    effectName: 'Arson',
                    spell: context?.spell
                });

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select an opponent and a stone type to destroy...'
                };
            }
        },

        // ============================================
        // WIND SCROLLS
        // ============================================

        /**
         * Wind Scroll I - Sigh of Recollection
         * Draw a scroll and a stone of the type that was just activated.
         * Draw one stone of each element if it was a Catacomb scroll.
         */
        WIND_SCROLL_1: {
            name: 'Sigh of Recollection',
            description: 'Draw a scroll and a stone of the type that was just activated, if available. Draw one stone of each if it was a Catacomb scroll.',
            isCounter: false,
            priority: 1,

            execute(casterIndex, context, system) {
                console.log(`🌬️ Sigh of Recollection activated by player ${casterIndex}`);

                // Determine the "activated" scroll:
                // - Response mode: use the triggering scroll
                // - Main phase: use the last scroll cast this turn
                let activatedName = null;
                let activatedDef = null;

                const triggeringScroll = context?.triggeringScroll;
                const scrollName = context?.scrollName || 'WIND_SCROLL_1';

                if (triggeringScroll && triggeringScroll.name) {
                    // Response mode: use the scroll that triggered this response
                    activatedName = triggeringScroll.name;
                    activatedDef = triggeringScroll.definition
                        || system.spellSystem?.patterns?.[triggeringScroll.name];
                    console.log(`🌬️ Using triggering scroll: ${activatedName}`);
                } else if (context?.previousScrollCast && context.previousScrollCast.name !== scrollName) {
                    // Main phase: use the scroll cast before this one (not ourselves)
                    activatedName = context.previousScrollCast.name;
                    activatedDef = context.previousScrollCast.definition
                        || system.spellSystem?.patterns?.[context.previousScrollCast.name];
                    console.log(`🌬️ Using previous scroll cast this turn: ${activatedName}`);
                } else if (system.lastScrollCastThisTurn && system.lastScrollCastThisTurn.name !== scrollName) {
                    // Fallback: use lastScrollCastThisTurn (only if it's not this scroll itself)
                    activatedName = system.lastScrollCastThisTurn.name;
                    activatedDef = system.lastScrollCastThisTurn.definition
                        || system.spellSystem?.patterns?.[system.lastScrollCastThisTurn.name];
                    console.log(`🌬️ Using lastScrollCastThisTurn fallback: ${activatedName}`);
                }

                if (!activatedName || !activatedDef) {
                    console.log(`🌬️ No valid scroll to recall (previousScrollCast=${context?.previousScrollCast?.name || 'none'}, lastScrollCast=${system.lastScrollCastThisTurn?.name || 'none'}, self=${scrollName})`);
                    updateStatus('Sigh of Recollection: No other scroll was activated to recall!');
                    return { success: false, reason: 'No scroll activated this turn' };
                }

                const activatedElement = activatedDef.element;
                const displayName = activatedDef.name || activatedName;
                console.log(`🌬️ Recalling: ${displayName} (element: ${activatedElement})`);

                // --- Draw a scroll from the activated element's deck ---
                let drawnScrollName = null;
                const deckElement = activatedElement === 'catacomb' ? 'catacomb' : activatedElement;
                if (system.spellSystem && typeof system.spellSystem.drawFromDeck === 'function') {
                    drawnScrollName = system.spellSystem.drawFromDeck(deckElement);
                }

                if (drawnScrollName) {
                    // Add to caster's hand
                    system.spellSystem.ensurePlayerScrollsStructure(casterIndex);
                    system.spellSystem.playerScrolls[casterIndex].hand.add(drawnScrollName);
                    system.spellSystem.updateScrollCount();

                    const drawnDef = system.spellSystem.patterns?.[drawnScrollName];
                    console.log(`🌬️ Drew scroll: ${drawnDef?.name || drawnScrollName} from ${deckElement} deck`);

                    // Broadcast in multiplayer
                    if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                        broadcastGameAction('scroll-collected', {
                            playerIndex: casterIndex,
                            scrollName: drawnScrollName,
                            shrineType: deckElement
                        });
                    }

                    // Update scroll deck UI
                    if (typeof updateScrollDeckUI === 'function') {
                        try { updateScrollDeckUI(); } catch (e) {}
                    }
                } else {
                    console.log(`🌬️ No scrolls left in ${deckElement} deck to draw`);
                }

                // --- Draw stone(s) based on activated element ---
                let stonesDrawn = {};
                if (activatedElement === 'catacomb' && activatedDef.patterns?.[0]) {
                    // Catacomb: draw 1 stone of each unique element in the pattern
                    const uniqueElements = [...new Set(activatedDef.patterns[0].map(p => p.type))];
                    uniqueElements.forEach(el => {
                        const drawn = system.drawStonesToPool(el, 1, casterIndex);
                        if (drawn > 0) stonesDrawn[el] = drawn;
                    });
                } else if (activatedElement) {
                    // Regular element: draw 1 stone of that type
                    const drawn = system.drawStonesToPool(activatedElement, 1, casterIndex);
                    if (drawn > 0) stonesDrawn[activatedElement] = drawn;
                }

                // Build status message
                const parts = [];
                if (drawnScrollName) {
                    const drawnDef = system.spellSystem?.patterns?.[drawnScrollName];
                    parts.push(`drew ${drawnDef?.name || drawnScrollName}`);
                }
                const stoneList = Object.entries(stonesDrawn).map(([el, n]) => `${n} ${el}`).join(', ');
                if (stoneList) {
                    parts.push(`+${stoneList} stone${Object.values(stonesDrawn).reduce((a, b) => a + b, 0) > 1 ? 's' : ''}`);
                }
                if (parts.length === 0) {
                    parts.push('nothing available to draw');
                }

                const message = `Sigh of Recollection (${displayName}): ${parts.join(', ')}!`;
                updateStatus(message);

                return {
                    success: true,
                    scrollDrawn: drawnScrollName,
                    stonesDrawn: stonesDrawn,
                    message: message
                };
            }
        },
        /**
         * Wind Scroll II - Respirate
         * Draw two wind stones. At end of turn, return all wind stones to the source.
         */
        WIND_SCROLL_2: {
            name: 'Respirate',
            description: 'Draw 2 wind stones. At end of turn, return all your wind stones to the source pool.',
            isCounter: false,
            priority: 2,

            execute(casterIndex, context, system) {
                console.log(`🌬️ Respirate activated by player ${casterIndex}`);

                const drawn = system.drawStonesToPool('wind', 2, casterIndex);
                system.activeBuffs.respirateWind = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                const message = `Respirate: drew ${drawn} wind stone${drawn === 1 ? '' : 's'}. All wind stones return to source at end of turn.`;
                updateStatus(message);

                return {
                    success: true,
                    stonesDrawn: drawn,
                    message: message
                };
            }
        },
        /**
         * Wind Scroll III - Freedom
         * Until your next turn, elemental shrine centers act as catacomb tiles.
         */
        WIND_SCROLL_3: {
            name: 'Freedom',
            description: 'Until your next turn, the centers of elemental shrines act as catacomb tiles.',
            isCounter: false,
            priority: 3,

            execute(casterIndex, context, system) {
                console.log(`🌬️ Freedom activated by player ${casterIndex}`);

                system.activeBuffs.freedom = {
                    playerIndex: casterIndex,
                    expiresNextTurn: true
                };

                if (typeof updateCatacombIndicators === 'function') {
                    updateCatacombIndicators();
                }

                // Broadcast to other players so they also get the buff
                if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                    broadcastGameAction('freedom-apply', {
                        playerIndex: casterIndex
                    });
                }

                const message = 'Freedom: elemental shrine centers act as catacomb tiles until your next turn.';
                updateStatus(message);

                return {
                    success: true,
                    message: message
                };
            }
        },
        /**
         * Wind Scroll IV - Take Flight
         * Teleport target player to an unoccupied space. Move this scroll to common area.
         */
        WIND_SCROLL_4: {
            name: 'Take Flight',
            description: 'Teleport target player to an unoccupied space of your choice. Move Take Flight to the common area.',
            isCounter: false,
            priority: 4,

            execute(casterIndex, context, system) {
                console.log(`🌬️ Take Flight activated by player ${casterIndex}`);

                system.enterTakeFlightMode(casterIndex, {
                    scrollName: context?.scrollName || 'WIND_SCROLL_4',
                    effectName: 'Take Flight',
                    spell: context?.spell
                });

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a player to teleport...'
                };
            }
        },

        /**
         * Wind Scroll V - Breath of Power
         * Move adjacent stones to another adjacent empty space until end of turn.
         */
        WIND_SCROLL_5: {
            name: 'Breath of Power',
            description: 'Until end of turn, you may move adjacent stones to another adjacent empty space.',
            isCounter: false,
            priority: 5,

            execute(casterIndex, context, system) {
                console.log(`🌬️ Breath of Power activated by player ${casterIndex}`);

                system.activeBuffs.breathOfPower = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                const message = 'Breath of Power: move adjacent stones to adjacent empty spaces this turn.';
                updateStatus(message);

                return {
                    success: true,
                    message: message
                };
            }
        },

        // ============================================
        // VOID SCROLLS
        // ============================================

        /**
         * Void Scroll I - Psychic
         * Counter the previous scroll (like Iron Stance), then play it during
         * your turn (like Reflect). Move Psychic to the common area.
         */
        VOID_SCROLL_5: {
            name: 'Create',
            description: 'Choose a stone type and draw stones equal to that stone\'s rank (Earth 5, Water 4, Fire 3, Wind 2, Void 1). Cannot exceed 5 of that type.',
            isCounter: false,
            priority: 5,
            execute(casterIndex, context, system) {
                console.log(`🔮 Create activated by player ${casterIndex}`);

                system.showCreateStoneModal(casterIndex);

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Choose a stone type to create...'
                };
            }
        },

        VOID_SCROLL_4: {
            name: 'Simplify',
            description: 'Scrolls cost 1 AP to activate until the end of your turn.',
            isCounter: false,
            priority: 4,
            execute(casterIndex, context, system) {
                console.log(`🔮 Simplify activated by player ${casterIndex}`);
                system.activeBuffs.simplify = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };
                const message = 'Simplify: scrolls now cost 1 AP to activate this turn!';
                updateStatus(message);
                return { success: true, message: message };
            }
        },

        VOID_SCROLL_3: {
            name: 'Telekinesis',
            description: 'Move a tile unoccupied by stones or players. It must be touching 2 other tiles. Cannot move a tile if it would strand an adjacent tile.',
            isCounter: false,
            priority: 3,
            execute(casterIndex, context, system) {
                console.log(`🔮 Telekinesis activated by player ${casterIndex}`);

                system.enterTelekinesisMode(casterIndex, {
                    scrollName: context?.scrollName || 'VOID_SCROLL_3',
                    effectName: 'Telekinesis',
                    spell: context?.spell
                });

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a tile to move (0/3)...'
                };
            }
        },

        VOID_SCROLL_2: {
            name: "Scholar's Insight",
            description: 'Search through a Scroll Deck and add a scroll of your choice to your hand. Shuffle that deck afterwards.',
            isCounter: false,
            priority: 2,
            execute(casterIndex, context, system) {
                console.log(`🔮 Scholar's Insight activated by player ${casterIndex}`);

                system.enterScholarsInsightMode(casterIndex, {
                    scrollName: context?.scrollName || 'VOID_SCROLL_2',
                    effectName: "Scholar's Insight",
                    spell: context?.spell
                });

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Choose a scroll deck to search...'
                };
            }
        },

        VOID_SCROLL_1: {
            name: 'Psychic',
            description: 'Counter the previous scroll, then play it during your turn. Move Psychic to the common area.',
            isCounter: true,
            priority: 1,

            execute(casterIndex, context, system) {
                console.log(`🔮 Psychic activated by player ${casterIndex}`);

                // When used as a counter in the response window, context.triggeringScroll
                // contains the scroll that was cancelled.
                const triggeringScroll = context?.triggeringScroll;

                if (triggeringScroll && triggeringScroll.name) {
                    // Cannot psychic yourself (edge case)
                    if (triggeringScroll.name === 'VOID_SCROLL_1') {
                        updateStatus('Psychic failed: Cannot psychic Psychic!');
                        return { success: false, reason: 'Cannot psychic Psychic' };
                    }

                    // Store the countered scroll to be played at the beginning of
                    // the caster's next turn (reuses the same mechanism as Reflect)
                    system.activeBuffs.psychicPending = {
                        playerIndex: casterIndex,
                        scrollName: triggeringScroll.name,
                        definition: triggeringScroll.definition
                    };

                    // Mark Psychic itself to go to common area.
                    // The disposition handler in multiplayer-state.js handles
                    // "countered-original" entries; we set a flag so it knows
                    // to force-common-area on the next handleScrollDisposition call.
                    system.pendingForceCommonArea = {
                        scrollName: context?.scrollName || 'VOID_SCROLL_1',
                        playerIndex: casterIndex
                    };

                    const displayName = triggeringScroll.definition?.name || triggeringScroll.name;
                    updateStatus(`Psychic! Countered ${displayName}. You will play it at the start of your next turn.`);

                    return {
                        success: true,
                        isCounter: true,
                        message: `Psychic countered ${displayName}!`
                    };
                }

                // Fallback: main-phase cast (no triggering scroll — just acts as counter signal)
                return {
                    success: true,
                    isCounter: true,
                    message: 'Psychic counters the scroll!'
                };
            }
        },

        // ========================================
        // CATACOMB SCROLL EFFECTS
        // ========================================

        CATACOMB_SCROLL_2: {
            name: 'Mine',
            description: 'If the center of this pattern is an elemental shrine, that shrine produces twice as many stones this turn (cannot exceed 5).',
            isCounter: false,
            priority: 2,
            execute(casterIndex, context, system) {
                console.log(`⛏️ Mine activated by player ${casterIndex}`);

                // Check if the caster is standing on an elemental shrine
                const playerPos = (typeof playerPositions !== 'undefined' && playerPositions[casterIndex])
                    ? playerPositions[casterIndex] : null;

                if (!playerPos) {
                    updateStatus('Mine: no player position found.');
                    return { success: true, message: 'Mine: no player position found.' };
                }

                const shrine = (typeof findShrineAtPosition === 'function')
                    ? findShrineAtPosition(playerPos.x, playerPos.y) : null;

                const elementalTypes = ['earth', 'water', 'fire', 'wind', 'void'];
                if (shrine && elementalTypes.includes(shrine.shrineType)) {
                    system.activeBuffs.mine = {
                        expiresThisTurn: true,
                        playerIndex: casterIndex,
                        shrineType: shrine.shrineType
                    };
                    const message = `Mine: ${shrine.shrineType} shrine will produce double stones this turn!`;
                    updateStatus(message);
                    return { success: true, message: message };
                } else {
                    const message = 'Mine: pattern center is not on an elemental shrine. No bonus applied.';
                    updateStatus(message);
                    return { success: true, message: message };
                }
            }
        },

        CATACOMB_SCROLL_3: {
            name: 'Call to Adventure',
            description: 'Until end of turn, when you reveal a tile, immediately draw Elemental Stones as if you had ended your turn on that tile\'s center.',
            isCounter: false,
            priority: 3,
            execute(casterIndex, context, system) {
                console.log(`🗺️ Call to Adventure activated by player ${casterIndex}`);

                system.activeBuffs.callToAdventure = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                const message = 'Call to Adventure: revealing tiles will grant shrine stones this turn!';
                updateStatus(message);

                return {
                    success: true,
                    message: message
                };
            }
        },

        CATACOMB_SCROLL_5: {
            name: 'Steam Vents',
            description: 'Until end of turn, spending an AP to move allows you to move two spaces instead of one.',
            isCounter: false,
            priority: 5,
            execute(casterIndex, context, system) {
                console.log(`♨️ Steam Vents activated by player ${casterIndex}`);

                system.activeBuffs.steamVents = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex,
                    freeStepBanked: false // tracks whether the next step is free (alternating)
                };

                const message = 'Steam Vents: each AP spent on movement moves you two spaces this turn!';
                updateStatus(message);

                return {
                    success: true,
                    message: message
                };
            }
        },

        CATACOMB_SCROLL_6: {
            name: 'Seed the Skies',
            description: 'Gather up to 5 water stones. This turn, you may place water and wind stones on any valid hex (not just adjacent).',
            isCounter: false,
            priority: 6,
            execute(casterIndex, context, system) {
                console.log(`🌧️ Seed the Skies activated by player ${casterIndex}`);

                const drawn = system.drawStonesToPool('water', 5, casterIndex);

                system.activeBuffs.waterWindGlobalPlacement = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                const message = `Seed the Skies: drew ${drawn} water stone${drawn === 1 ? '' : 's'}. Water and wind placement is global this turn.`;
                updateStatus(message);

                return {
                    success: true,
                    stonesDrawn: drawn,
                    message: message
                };
            }
        },

        CATACOMB_SCROLL_7: {
            name: 'Reflecting Pool',
            description: 'Regain 2 AP for each different stone type within 5 spaces of you. This can be used once per turn.',
            isCounter: false,
            priority: 7,
            execute(casterIndex, context, system) {
                console.log(`💧 Reflecting Pool activated by player ${casterIndex}`);

                // Once per turn guard
                const existing = system.activeBuffs.reflectingPool;
                if (existing && existing.playerIndex === casterIndex) {
                    const msg = 'Reflecting Pool already used this turn.';
                    updateStatus(msg);
                    return { success: false, message: msg };
                }

                const playerPos = (typeof playerPositions !== 'undefined' && playerPositions[casterIndex])
                    ? playerPositions[casterIndex] : null;
                if (!playerPos || typeof pixelToHex !== 'function') {
                    const msg = 'Reflecting Pool failed: player position not found.';
                    updateStatus(msg);
                    return { success: false, message: msg };
                }

                const playerHex = pixelToHex(playerPos.x, playerPos.y, TILE_SIZE);
                const types = new Set();
                if (Array.isArray(placedStones)) {
                    placedStones.forEach(stone => {
                        const stoneHex = pixelToHex(stone.x, stone.y, TILE_SIZE);
                        const dq = Math.abs(playerHex.q - stoneHex.q);
                        const dr = Math.abs(playerHex.r - stoneHex.r);
                        const ds = Math.abs((-playerHex.q - playerHex.r) - (-stoneHex.q - stoneHex.r));
                        const hexDistance = Math.max(dq, dr, ds);
                        if (hexDistance <= 5) types.add(stone.type);
                    });
                }

                const apGain = types.size * 2;
                if (typeof addAP === 'function') {
                    addAP(apGain);
                }

                system.activeBuffs.reflectingPool = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                const message = `Reflecting Pool: regained ${apGain} AP.`;
                updateStatus(message);

                return { success: true, message: message, apGained: apGain };
            }
        },

        CATACOMB_SCROLL_1: {
            name: 'Mudslide',
            description: 'Until end of turn, earth and water stones act as wind stones for movement (free movement).',
            isCounter: false,
            priority: 1,
            execute(casterIndex, context, system) {
                console.log(`🌊 Mudslide activated by player ${casterIndex}`);

                system.activeBuffs.mudslide = {
                    expiresThisTurn: true,
                    playerIndex: casterIndex
                };

                const message = 'Mudslide: earth and water stones grant free movement this turn!';
                updateStatus(message);

                return {
                    success: true,
                    message: message
                };
            }
        },

        CATACOMB_SCROLL_4: {
            name: 'Excavate',
            description: 'End your turn. You, your scrolls, and stones cannot be the target of any scroll until your next turn. At the beginning of your turn, you may teleport to any unoccupied hex.',
            isCounter: false,
            priority: 4,
            execute(casterIndex, context, system) {
                console.log(`⛏️ Excavate activated by player ${casterIndex}`);

                // Set immunity buff (persists until caster's next turn — NOT expiresThisTurn)
                system.activeBuffs.excavate = {
                    playerIndex: casterIndex
                };

                // Set pending teleport for the start of caster's next turn
                system.activeBuffs.excavateTeleport = {
                    playerIndex: casterIndex
                };

                const message = 'Excavate! You are immune to scrolls until your next turn. Your turn will now end.';
                updateStatus(message);

                // Broadcast immunity buff to other clients
                if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                    broadcastGameAction('excavate-immunity', {
                        playerIndex: casterIndex
                    });
                }

                // Programmatically end the turn after the current scroll resolution completes
                setTimeout(() => {
                    const endTurnBtn = document.getElementById('end-turn');
                    if (endTurnBtn) {
                        console.log('⛏️ Excavate: triggering end turn');
                        endTurnBtn.click();
                    }
                }, 100);

                return {
                    success: true,
                    message: message
                };
            }
        },

        CATACOMB_SCROLL_8: {
            name: 'Plunder',
            description: 'Choose a target player. Select one of their active scrolls and discard it to the common area.',
            isCounter: false,
            priority: 8,
            execute(casterIndex, context, system) {
                console.log(`🏴‍☠️ Plunder activated by player ${casterIndex}`);

                system.enterPlunderMode(casterIndex, {
                    scrollName: context?.scrollName || 'CATACOMB_SCROLL_8',
                    effectName: 'Plunder',
                    spell: context?.spell
                });

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a target player to plunder an active scroll from...'
                };
            }
        },

        CATACOMB_SCROLL_9: {
            name: 'Quick Reflexes',
            description: 'Until your next turn, level 1 scrolls cost 0 AP to activate. Each time you use a react scroll during this time, draw 1 void and 1 wind stone.',
            isCounter: false,
            priority: 9,
            execute(casterIndex, context, system) {
                console.log(`⚡ Quick Reflexes activated by player ${casterIndex}`);

                system.activeBuffs.quickReflexes = {
                    playerIndex: casterIndex
                };

                const message = 'Quick Reflexes: level 1 scrolls cost 0 AP until your next turn. React scrolls draw 1 void + 1 wind.';
                updateStatus(message);

                return {
                    success: true,
                    message: message
                };
            }
        },

        CATACOMB_SCROLL_10: {
            name: 'Combust',
            description: 'Select a tile and destroy all stones on it. Cannot target player tiles.',
            isCounter: false,
            priority: 10,
            execute(casterIndex, context, system) {
                console.log(`🔥 Combust activated by player ${casterIndex}`);

                system.enterScorchedEarthMode(casterIndex);

                return {
                    success: true,
                    requiresSelection: true,
                    message: 'Select a tile to destroy all stones on it...'
                };
            }
        },
    },

    // ============================================
    // TELEKINESIS MODE (Void Scroll III)
    // ============================================

    enterTelekinesisMode(casterIndex, completionPayload) {
        const self = this;
        const MAX_MOVES = 1;

        console.log(`🔮 Entering Telekinesis mode for player ${casterIndex}`);

        // Set up the telekinesis state so game-core/game-ui know about the rules
        window.telekinesisState = {
            active: true,
            movesLeft: MAX_MOVES,
            maxMoves: MAX_MOVES,
            casterIndex: casterIndex,
            movedTiles: []
        };

        // Enable tile dragging
        window.tileMoveMode = true;

        // Finish handler — turn off tile move mode and clean up
        const finishTelekinesis = () => {
            window.tileMoveMode = false;
            const movesDone = MAX_MOVES - (window.telekinesisState?.movesLeft ?? 0);
            window.telekinesisState = null;

            // Remove buttons
            const doneEl = document.getElementById('telekinesis-done-btn');
            if (doneEl && doneEl.parentNode) doneEl.parentNode.removeChild(doneEl);
            const cancelEl = document.getElementById('scroll-cancel-btn');
            if (cancelEl && cancelEl.parentNode) cancelEl.parentNode.removeChild(cancelEl);

            self.selectionMode = null;

            updateStatus(`Telekinesis complete! Moved ${movesDone} tile${movesDone === 1 ? '' : 's'}.`);

            // Signal that selection effect is complete
            if (completionPayload && self.spellSystem && typeof self.spellSystem.onSelectionEffectComplete === 'function') {
                self.spellSystem.onSelectionEffectComplete(completionPayload.scrollName, completionPayload.effectName, completionPayload.spell);
            }
        };

        // Expose so the tile-drop handler in game-ui can call it when moves run out
        window.finishTelekinesis = finishTelekinesis;

        // Create cancel button
        const cancelBtn = this.createCancelButton('Cancel', () => {
            window.tileMoveMode = false;
            window.telekinesisState = null;
            window.finishTelekinesis = null;
            const doneEl = document.getElementById('telekinesis-done-btn');
            if (doneEl && doneEl.parentNode) doneEl.parentNode.removeChild(doneEl);
            self.cancelSelectionMode();
        });

        // Create done button
        const doneBtn = document.createElement('button');
        doneBtn.id = 'telekinesis-done-btn';
        doneBtn.textContent = `Done (0/${MAX_MOVES})`;
        Object.assign(doneBtn.style, {
            position: 'fixed',
            bottom: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '2001',
            padding: '10px 24px',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        });
        doneBtn.onclick = () => finishTelekinesis();
        document.body.appendChild(doneBtn);

        // Minimal selection mode — just for cleanup if cancelSelectionMode is called
        this.selectionMode = {
            type: 'telekinesis',
            casterIndex: casterIndex,
            completionPayload: completionPayload,
            cleanup() {
                window.tileMoveMode = false;
                window.telekinesisState = null;
                window.finishTelekinesis = null;
                const d = document.getElementById('telekinesis-done-btn');
                if (d && d.parentNode) d.parentNode.removeChild(d);
                const c = document.getElementById('scroll-cancel-btn');
                if (c && c.parentNode) c.parentNode.removeChild(c);
            }
        };

        updateStatus(`Telekinesis: drag tiles to move them (0/${MAX_MOVES}). Tiles must touch 2+ other tiles.`);
    },

    // ============================================
    // SCHOLAR'S INSIGHT MODE (Void Scroll II)
    // ============================================

    enterScholarsInsightMode(casterIndex, completionPayload) {
        const self = this;
        const STONE_TYPES_LOCAL = {
            earth: { color: '#69d83a', symbol: '▲' },
            water: { color: '#5894f4', symbol: '◯' },
            fire: { color: '#ed1b43', symbol: '♦' },
            wind: { color: '#ffce00', symbol: '≋' },
            void: { color: '#9458f4', symbol: '✺' }
        };

        // Step 1: Show deck picker (which element deck to search)
        const showDeckPicker = () => {
            const existing = document.getElementById('scholars-insight-modal');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'scholars-insight-modal';
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0', left: '0', right: '0', bottom: '0',
                backgroundColor: 'rgba(0,0,0,0.8)',
                zIndex: '3000',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            });

            const modal = document.createElement('div');
            Object.assign(modal.style, {
                backgroundColor: '#1a1a2e',
                border: '2px solid #9458f4',
                borderRadius: '10px',
                padding: '20px',
                color: 'white',
                minWidth: '250px',
                maxWidth: '350px'
            });

            const titleEl = document.createElement('h3');
            titleEl.textContent = "Scholar's Insight: Choose a Deck";
            titleEl.style.marginBottom = '15px';
            titleEl.style.textAlign = 'center';
            titleEl.style.color = '#9458f4';
            modal.appendChild(titleEl);

            const subtitle = document.createElement('div');
            subtitle.textContent = 'Select an element deck to search through.';
            subtitle.style.color = '#bdc3c7';
            subtitle.style.fontSize = '13px';
            subtitle.style.marginBottom = '15px';
            subtitle.style.textAlign = 'center';
            modal.appendChild(subtitle);

            ['earth', 'water', 'fire', 'wind', 'void'].forEach(element => {
                const deck = self.spellSystem?.scrollDecks?.[element];
                const deckSize = deck ? deck.length : 0;
                const info = STONE_TYPES_LOCAL[element];

                const btn = document.createElement('button');
                btn.textContent = `${info.symbol} ${element.charAt(0).toUpperCase() + element.slice(1)} (${deckSize} scrolls)`;
                Object.assign(btn.style, {
                    display: 'block',
                    width: '100%',
                    padding: '10px',
                    margin: '5px 0',
                    backgroundColor: '#2d2d44',
                    color: info.color,
                    border: `1px solid ${info.color}`,
                    borderRadius: '5px',
                    cursor: deckSize > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    opacity: deckSize > 0 ? '1' : '0.4'
                });
                if (deckSize > 0) {
                    btn.onmouseenter = () => btn.style.backgroundColor = '#3d3d55';
                    btn.onmouseleave = () => btn.style.backgroundColor = '#2d2d44';
                    btn.onclick = () => {
                        overlay.remove();
                        showDeckBrowser(element);
                    };
                }
                modal.appendChild(btn);
            });

            // Cancel button
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            Object.assign(cancelBtn.style, {
                display: 'block',
                width: '100%',
                padding: '10px',
                margin: '10px 0 0 0',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
            });
            cancelBtn.onclick = () => {
                overlay.remove();
                self.cancelSelectionMode();
            };
            modal.appendChild(cancelBtn);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        };

        // Step 2: Show scrolls in chosen deck for selection
        const showDeckBrowser = (element) => {
            const deck = self.spellSystem?.scrollDecks?.[element];
            if (!deck || deck.length === 0) {
                updateStatus(`The ${element} scroll deck is empty!`);
                self.cancelSelectionMode();
                return;
            }

            const info = STONE_TYPES_LOCAL[element];
            const existing = document.getElementById('scholars-insight-modal');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'scholars-insight-modal';
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0', left: '0', right: '0', bottom: '0',
                backgroundColor: 'rgba(0,0,0,0.8)',
                zIndex: '3000',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            });

            const modal = document.createElement('div');
            Object.assign(modal.style, {
                backgroundColor: '#1a1a2e',
                border: `2px solid ${info.color}`,
                borderRadius: '10px',
                padding: '20px',
                color: 'white',
                minWidth: '300px',
                maxWidth: '450px',
                maxHeight: '80vh',
                overflowY: 'auto'
            });

            const titleEl = document.createElement('h3');
            titleEl.textContent = `${element.charAt(0).toUpperCase() + element.slice(1)} Deck (${deck.length} scrolls)`;
            titleEl.style.marginBottom = '5px';
            titleEl.style.textAlign = 'center';
            titleEl.style.color = info.color;
            modal.appendChild(titleEl);

            const subtitle = document.createElement('div');
            subtitle.textContent = 'Click a scroll to add it to your hand.';
            subtitle.style.color = '#bdc3c7';
            subtitle.style.fontSize = '13px';
            subtitle.style.marginBottom = '15px';
            subtitle.style.textAlign = 'center';
            modal.appendChild(subtitle);

            deck.forEach((scrollName, index) => {
                const scrollInfo = self.spellSystem?.patterns?.[scrollName];
                if (!scrollInfo) return;

                const card = document.createElement('div');
                Object.assign(card.style, {
                    backgroundColor: '#34495e',
                    border: '1px solid #555',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s'
                });
                card.onmouseenter = () => card.style.borderColor = info.color;
                card.onmouseleave = () => card.style.borderColor = '#555';

                const nameEl = document.createElement('div');
                nameEl.textContent = scrollInfo.name || scrollName;
                nameEl.style.fontWeight = 'bold';
                nameEl.style.color = info.color;
                nameEl.style.marginBottom = '4px';
                card.appendChild(nameEl);

                const descEl = document.createElement('div');
                descEl.textContent = scrollInfo.description || 'No description';
                descEl.style.fontSize = '12px';
                descEl.style.color = '#95a5a6';
                card.appendChild(descEl);

                const levelEl = document.createElement('div');
                levelEl.textContent = `Level ${scrollInfo.level || '?'}`;
                levelEl.style.fontSize = '11px';
                levelEl.style.color = '#7f8c8d';
                levelEl.style.marginTop = '4px';
                card.appendChild(levelEl);

                card.onclick = () => {
                    overlay.remove();
                    selectScroll(element, scrollName, index);
                };

                modal.appendChild(card);
            });

            // Back button
            const backBtn = document.createElement('button');
            backBtn.textContent = '← Back to Decks';
            Object.assign(backBtn.style, {
                display: 'inline-block',
                padding: '8px 14px',
                margin: '10px 8px 0 0',
                backgroundColor: '#2d2d44',
                color: 'white',
                border: '1px solid #555',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '13px'
            });
            backBtn.onclick = () => {
                overlay.remove();
                showDeckPicker();
            };
            modal.appendChild(backBtn);

            // Cancel button
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            Object.assign(cancelBtn.style, {
                display: 'inline-block',
                padding: '8px 14px',
                margin: '10px 0 0 0',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '13px'
            });
            cancelBtn.onclick = () => {
                overlay.remove();
                self.cancelSelectionMode();
            };
            modal.appendChild(cancelBtn);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        };

        // Step 3: Handle selection — add to hand (or trigger cascade), shuffle deck, broadcast
        const selectScroll = (element, scrollName, index) => {
            const sp = self.spellSystem;
            const deck = sp.scrollDecks[element];
            if (!deck) return;

            // Remove chosen scroll from deck
            deck.splice(index, 1);

            // Shuffle the deck afterwards
            if (sp.shuffleDeck) {
                sp.shuffleDeck(deck);
                console.log(`🔮 Scholar's Insight: ${element} deck shuffled after search`);
            }

            const scrolls = sp.getPlayerScrolls(false);
            const scrollInfo = sp.patterns?.[scrollName];

            if (scrolls.hand.size >= sp.MAX_HAND_SIZE) {
                // Hand full — trigger cascade system
                const canCascadeToActive = scrolls.active.size < sp.MAX_ACTIVE_SIZE;
                sp.showCascadePrompt(scrollName, scrollInfo, element, canCascadeToActive);
            } else {
                // Hand has room — add directly
                scrolls.hand.add(scrollName);
                sp.updateScrollCount();
            }

            if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
            if (typeof updateHUD === 'function') updateHUD();

            const displayName = scrollInfo?.name || scrollName;
            updateStatus(`Scholar's Insight: added "${displayName}" to your hand!`);

            // Broadcast in multiplayer
            if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                broadcastGameAction('scholars-insight', {
                    playerIndex: casterIndex,
                    element: element,
                    scrollName: scrollName
                });
            }

            // Clean up selection mode
            self.selectionMode = null;
        };

        // Set selection mode (allows cancellation)
        this.selectionMode = {
            type: 'scholars-insight',
            casterIndex: casterIndex,
            cleanup: () => {
                const modal = document.getElementById('scholars-insight-modal');
                if (modal) modal.remove();
            }
        };

        // Start by showing the deck picker
        showDeckPicker();
    },

    // ============================================
    // CREATE MODAL (Void Scroll V)
    // ============================================

    showCreateStoneModal(casterIndex) {
        const self = this;
        const STONE_RANKS = {
            earth: { rank: 5, color: '#69d83a', symbol: '▲' },
            water: { rank: 4, color: '#5894f4', symbol: '◯' },
            fire:  { rank: 3, color: '#ed1b43', symbol: '♦' },
            wind:  { rank: 2, color: '#ffce00', symbol: '≋' },
            void:  { rank: 1, color: '#9458f4', symbol: '✺' }
        };

        const existing = document.getElementById('create-stone-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'create-stone-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #9458f4',
            borderRadius: '10px',
            padding: '20px',
            color: 'white',
            minWidth: '250px',
            maxWidth: '350px'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Create: Choose a Stone Type';
        titleEl.style.marginBottom = '15px';
        titleEl.style.textAlign = 'center';
        titleEl.style.color = '#9458f4';
        modal.appendChild(titleEl);

        const subtitle = document.createElement('div');
        subtitle.textContent = 'Draw stones equal to that element\'s rank (max 5 in pool).';
        subtitle.style.color = '#bdc3c7';
        subtitle.style.fontSize = '13px';
        subtitle.style.marginBottom = '15px';
        subtitle.style.textAlign = 'center';
        modal.appendChild(subtitle);

        ['earth', 'water', 'fire', 'wind', 'void'].forEach(element => {
            const info = STONE_RANKS[element];
            const currentCount = (typeof stoneCounts !== 'undefined' ? stoneCounts[element] : 0) || 0;
            const capacity = 5;
            const room = capacity - currentCount;

            const btn = document.createElement('button');
            btn.textContent = `${info.symbol} ${element.charAt(0).toUpperCase() + element.slice(1)} — rank ${info.rank} (${currentCount}/${capacity})`;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '10px',
                margin: '5px 0',
                backgroundColor: '#2d2d44',
                color: info.color,
                border: `1px solid ${info.color}`,
                borderRadius: '5px',
                cursor: room > 0 ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 'bold',
                opacity: room > 0 ? '1' : '0.4'
            });

            if (room > 0) {
                btn.onmouseenter = () => btn.style.backgroundColor = '#3d3d55';
                btn.onmouseleave = () => btn.style.backgroundColor = '#2d2d44';
                btn.onclick = () => {
                    overlay.remove();
                    const drawn = self.drawStonesToPool(element, info.rank, casterIndex);
                    const message = `Create: drew ${drawn} ${element} stone${drawn === 1 ? '' : 's'} (rank ${info.rank})!`;
                    updateStatus(message);
                    console.log(`🔮 Create: drew ${drawn} ${element} stones (rank ${info.rank}) for player ${casterIndex}`);

                    // Broadcast in multiplayer
                    if (typeof broadcastGameAction === 'function') {
                        broadcastGameAction('create-stones', {
                            playerIndex: casterIndex,
                            element: element,
                            count: drawn
                        });
                    }
                };
            }
            modal.appendChild(btn);
        });

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        Object.assign(cancelBtn.style, {
            display: 'block',
            width: '100%',
            padding: '10px',
            margin: '10px 0 0 0',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px'
        });
        cancelBtn.onclick = () => {
            overlay.remove();
            updateStatus('Create cancelled.');
        };
        modal.appendChild(cancelBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    // ============================================
    // TILE SWAP MODE (Earth Scroll II)
    // ============================================

    enterTileSwapMode(casterIndex, completionPayload) {
        const self = this;
        console.log(`🔀 Entering tile swap mode for player ${casterIndex}`);

        // Get eligible tiles (no stones, no players, not player tiles)
        const eligibleTiles = this.getEligibleTilesForSwap();
        console.log(`   Found ${eligibleTiles.length} eligible tiles for swap`);

        if (eligibleTiles.length < 2) {
            updateStatus('Not enough eligible tiles to swap!');
            return;
        }

        // Highlight eligible tiles
        this.highlightTiles(eligibleTiles, '#69d83a');

        // Create cancel button
        const cancelBtn = this.createCancelButton('Cancel Swap', () => {
            self.cancelSelectionMode();
        });

        // Track selected tiles
        let selectedTiles = [];

        // Store selection mode state (completionPayload: { scrollName, spell, effectName } for onSelectionEffectComplete)
        this.selectionMode = {
            type: 'tile-swap',
            casterIndex: casterIndex,
            eligibleTiles: eligibleTiles,
            selectedTiles: selectedTiles,
            cancelBtn: cancelBtn,
            completionPayload: completionPayload || null,

            handleTileClick(tile) {
                console.log(`🔀 Tile clicked for swap: ${tile.id}`);

                // Re-validate: tile must be unoccupied (no stones, no players) at click time
                if (self.tileHasStones(tile) || self.tileHasPlayers(tile)) {
                    console.log(`   Tile ${tile.id} has stones or players - cannot swap`);
                    updateStatus('Cannot swap: tile has stones or players on it.');
                    return;
                }

                // Must also be in initial eligible set (e.g. not a player tile)
                if (!eligibleTiles.find(t => t.id === tile.id)) {
                    console.log(`   Tile ${tile.id} is NOT eligible`);
                    updateStatus('Cannot swap: tile has stones or players on it.');
                    return;
                }

                // Check if already selected
                const existingIndex = selectedTiles.findIndex(t => t.id === tile.id);
                if (existingIndex >= 0) {
                    // Deselect
                    selectedTiles.splice(existingIndex, 1);
                    self.unhighlightTile(tile);
                    self.highlightTile(tile, '#69d83a'); // Back to eligible highlight
                    updateStatus(`Deselected tile. Select ${2 - selectedTiles.length} more.`);
                    return;
                }

                // Select tile
                selectedTiles.push(tile);
                self.highlightTile(tile, '#2ecc71', 4); // Selected highlight
                console.log(`   Tile ${tile.id} selected. Total selected: ${selectedTiles.length}`);

                if (selectedTiles.length === 1) {
                    updateStatus('First tile selected. Select second tile to swap.');
                } else if (selectedTiles.length === 2) {
                    // Re-validate both tiles before swapping (state may have changed)
                    const t1 = selectedTiles[0], t2 = selectedTiles[1];
                    if (self.tileHasStones(t1) || self.tileHasPlayers(t1)) {
                        updateStatus('Cannot swap: first tile now has stones or players on it.');
                        selectedTiles.length = 0;
                        self.selectionMode.cleanup();
                        self.selectionMode = null;
                        return;
                    }
                    if (self.tileHasStones(t2) || self.tileHasPlayers(t2)) {
                        updateStatus('Cannot swap: second tile now has stones or players on it.');
                        selectedTiles.length = 0;
                        self.selectionMode.cleanup();
                        self.selectionMode = null;
                        return;
                    }
                    // Capture payload and cleanup FIRST (remove highlights while tile refs are still valid)
                    const payload = self.selectionMode.completionPayload;
                    self.selectionMode.cleanup();
                    self.selectionMode = null;

                    // Then perform swap (no DOM re-use of tile elements; highlights already cleared)
                    console.log(`   Performing swap between ${t1.id} and ${t2.id}`);
                    self.performTileSwap(t1, t2);

                    // Signal that selection effect is complete so game exits "waiting for tiles" phase
                    if (payload && self.spellSystem && typeof self.spellSystem.onSelectionEffectComplete === 'function') {
                        self.spellSystem.onSelectionEffectComplete(payload.scrollName, payload.effectName, payload.spell);
                    }
                }
            },

            cleanup() {
                // Remove highlights
                eligibleTiles.forEach(tile => self.unhighlightTile(tile));
                // Remove cancel button
                if (cancelBtn && cancelBtn.parentNode) {
                    cancelBtn.parentNode.removeChild(cancelBtn);
                }
            }
        };

        updateStatus('Select two tiles to swap (any distance).');
    },

    performTileSwap(tile1, tile2) {
        // Only swap unoccupied tiles (no stones, no players)
        if (this.tileHasStones(tile1) || this.tileHasPlayers(tile1)) {
            updateStatus('Cannot swap: tile has stones or players on it.');
            return;
        }
        if (this.tileHasStones(tile2) || this.tileHasPlayers(tile2)) {
            updateStatus('Cannot swap: tile has stones or players on it.');
            return;
        }

        // Swap positions
        const tempX = tile1.x;
        const tempY = tile1.y;

        tile1.x = tile2.x;
        tile1.y = tile2.y;
        tile2.x = tempX;
        tile2.y = tempY;

        // Update visual transforms
        if (tile1.element) {
            tile1.element.setAttribute('transform', `translate(${tile1.x}, ${tile1.y}) rotate(${tile1.rotation || 0})`);
        }
        if (tile2.element) {
            tile2.element.setAttribute('transform', `translate(${tile2.x}, ${tile2.y}) rotate(${tile2.rotation || 0})`);
        }

        // Broadcast in multiplayer
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
            broadcastGameAction('tile-swap', {
                tile1Id: tile1.id,
                tile2Id: tile2.id,
                tile1NewPos: { x: tile1.x, y: tile1.y },
                tile2NewPos: { x: tile2.x, y: tile2.y }
            });
        }

        // Ensure pulse is cleared on the two swapped tiles
        this.unhighlightTile(tile1);
        this.unhighlightTile(tile2);

        updateStatus('Tiles swapped!');
        console.log(`🔀 Swapped tiles: ${tile1.id} <-> ${tile2.id}`);
    },

    // ============================================
    // TILE FLIP MODE (Earth Scroll IV)
    // ============================================

    enterTileFlipMode(casterIndex) {
        const self = this;

        // Get eligible tiles (no stones, no players, not player tiles)
        const eligibleTiles = this.getEligibleTilesForFlip();

        if (eligibleTiles.length === 0) {
            updateStatus('No eligible tiles to flip!');
            return;
        }

        // Highlight eligible tiles
        this.highlightTiles(eligibleTiles, '#69d83a');

        // Create cancel button
        const cancelBtn = this.createCancelButton('Cancel Flip', () => {
            self.cancelSelectionMode();
        });

        // Store selection mode state
        this.selectionMode = {
            type: 'tile-flip',
            casterIndex: casterIndex,
            eligibleTiles: eligibleTiles,
            cancelBtn: cancelBtn,

            handleTileClick(tile) {
                // Check if tile is eligible
                if (!eligibleTiles.find(t => t.id === tile.id)) {
                    updateStatus('Cannot flip: tile has stones or players on it.');
                    return;
                }

                // Perform flip
                self.performTileFlip(tile, casterIndex);
                self.selectionMode.cleanup();
                self.selectionMode = null;
            },

            cleanup() {
                // Remove highlights
                eligibleTiles.forEach(tile => self.unhighlightTile(tile));
                // Remove cancel button
                if (cancelBtn && cancelBtn.parentNode) {
                    cancelBtn.parentNode.removeChild(cancelBtn);
                }
            }
        };

        updateStatus('Select a tile to flip (reveal/hide).');
    },

    performTileFlip(tile, casterIndex) {
        if (tile.flipped) {
            // Currently hidden -> reveal it
            if (typeof revealTile === 'function') {
                revealTile(tile.id);
                updateStatus(`Revealed ${tile.shrineType} shrine!`);
            } else {
                // Manual reveal
                tile.flipped = false;
                // The revealTile function should handle scroll drawing
                console.log(`👣 Revealed tile: ${tile.id} (${tile.shrineType})`);
            }
        } else {
            // Currently revealed -> hide it
            tile.flipped = true;

            // Update visual - need to recreate as flipped
            if (typeof recreateTileAsFlipped === 'function') {
                recreateTileAsFlipped(tile);
            }

            // Broadcast
            if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                broadcastGameAction('tile-hide', {
                    tileId: tile.id
                });
            }

            updateStatus(`Hid ${tile.shrineType} shrine tile.`);
            console.log(`👣 Hid tile: ${tile.id}`);
        }
    },

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    getEligibleTilesForSwap() {
        if (typeof placedTiles === 'undefined') return [];

        return placedTiles.filter(tile => {
            // Not a player tile
            if (tile.isPlayerTile) return false;

            // No stones on tile
            if (this.tileHasStones(tile)) return false;

            // No players on tile
            if (this.tileHasPlayers(tile)) return false;

            return true;
        });
    },

    getEligibleTilesForFlip() {
        // Same criteria as swap
        return this.getEligibleTilesForSwap();
    },

    // Wandering River: any non-player tile (revealed or unrevealed) can be transformed
    getEligibleTilesForWanderingRiver() {
        if (typeof placedTiles === 'undefined') return [];
        return placedTiles.filter(tile => {
            if (tile.isPlayerTile || tile.shrineType === 'player') return false;
            return true;
        });
    },

    tileHasStones(tile) {
        if (typeof placedStones === 'undefined') return false;

        // Use same radius as findTileAtPosition (game-core): TILE_SIZE * 4 covers full tile
        // TILE_SIZE * 2.5 was too small and missed stones on outer hexes
        const tileRadius = typeof TILE_SIZE !== 'undefined' ? TILE_SIZE * 4 : 80;

        return placedStones.some(stone => {
            const dist = Math.sqrt(Math.pow(stone.x - tile.x, 2) + Math.pow(stone.y - tile.y, 2));
            return dist < tileRadius;
        });
    },

    tileHasPlayers(tile) {
        if (typeof playerPositions === 'undefined') return false;

        // Match tileHasStones / findTileAtPosition radius
        const tileRadius = typeof TILE_SIZE !== 'undefined' ? TILE_SIZE * 4 : 80;

        return playerPositions.some(pos => {
            if (!pos) return false;
            const dist = Math.sqrt(Math.pow(pos.x - tile.x, 2) + Math.pow(pos.y - tile.y, 2));
            return dist < tileRadius;
        });
    },

    highlightTiles(tiles, color) {
        tiles.forEach(tile => this.highlightTile(tile, color));
    },

    highlightTile(tile, color, strokeWidth = 3) {
        if (!tile.element) return;

        // Try multiple selectors to find hex elements
        let hexes = tile.element.querySelectorAll('.hex-tile');
        if (hexes.length === 0) {
            hexes = tile.element.querySelectorAll('polygon');
        }

        hexes.forEach(hex => {
            hex.setAttribute('data-original-stroke', hex.getAttribute('stroke') || 'none');
            hex.setAttribute('data-original-stroke-width', hex.getAttribute('stroke-width') || '1');
            hex.setAttribute('stroke', color);
            hex.setAttribute('stroke-width', strokeWidth);
        });

        // Also add a pulsing animation
        tile.element.style.animation = 'tilePulse 1s ease-in-out infinite';

        // Add pulse animation if not already in DOM
        if (!document.getElementById('tile-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'tile-pulse-style';
            style.textContent = `
                @keyframes tilePulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `;
            document.head.appendChild(style);
        }
    },

    unhighlightTile(tile) {
        if (!tile.element) return;

        let hexes = tile.element.querySelectorAll('.hex-tile');
        if (hexes.length === 0) {
            hexes = tile.element.querySelectorAll('polygon');
        }

        hexes.forEach(hex => {
            const origStroke = hex.getAttribute('data-original-stroke') || 'none';
            const origWidth = hex.getAttribute('data-original-stroke-width') || '1';
            hex.setAttribute('stroke', origStroke);
            hex.setAttribute('stroke-width', origWidth);
        });

        tile.element.style.animation = '';
    },

    createCancelButton(text, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.id = 'scroll-cancel-btn';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 20px',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            zIndex: '1000'
        });
        btn.onclick = onClick;
        document.body.appendChild(btn);
        return btn;
    },

    drawStonesToPool(stoneType, count, playerIndex) {
        // Draw stones from source pool to player pool
        if (typeof stonePools === 'undefined') {
            console.warn('Stone pools not available');
            return 0;
        }

        // Determine the target player pool.
        // If an explicit playerIndex is given, use playerPools[playerIndex] directly
        // so that response scrolls (cast by a non-active player) modify the correct pool.
        let targetPool = null;
        const pools = typeof playerPools !== 'undefined' ? playerPools : (typeof window !== 'undefined' && window.playerPools);
        if (playerIndex !== undefined && playerIndex !== null && pools && pools[playerIndex]) {
            targetPool = pools[playerIndex];
        } else if (typeof stoneCounts !== 'undefined') {
            targetPool = stoneCounts;
        }

        if (!targetPool) {
            console.warn('No target player pool available');
            return 0;
        }

        // Get player pool capacity (default 5)
        const capacity = (typeof playerPoolCapacity !== 'undefined' && playerPoolCapacity[stoneType])
            ? playerPoolCapacity[stoneType]
            : 5;
        const currentCount = targetPool[stoneType] || 0;
        const roomInPool = capacity - currentCount;

        // Can only draw up to: min(requested, available in source, room in player pool)
        const sourceAvailable = stonePools[stoneType] || 0;
        const toDraw = Math.min(count, sourceAvailable, roomInPool);

        if (toDraw > 0) {
            stonePools[stoneType] -= toDraw;
            targetPool[stoneType] += toDraw;

            // Update UI
            if (typeof updateStoneCount === 'function') {
                updateStoneCount(stoneType);
            }

            console.log(`📜 Drew ${toDraw} ${stoneType} stones to player ${playerIndex ?? 'active'} pool (had ${currentCount}/${capacity})`);
        } else if (roomInPool <= 0) {
            console.log(`📜 Cannot draw ${stoneType} stones - pool is full (${currentCount}/${capacity})`);
        }

        return toDraw;
    },

    // Quick Reflexes: draw stones after using a react scroll
    handleQuickReflexesReact(casterIndex) {
        const buff = this.activeBuffs.quickReflexes;
        if (!buff || buff.playerIndex !== casterIndex) return;
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
            if (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null && myPlayerIndex !== casterIndex) {
                return; // Only the reacting player should draw locally in multiplayer
            }
        }

        const drawnVoid = this.drawStonesToPool('void', 1, casterIndex);
        const drawnWind = this.drawStonesToPool('wind', 1, casterIndex);

        if (typeof updateStatus === 'function') {
            updateStatus(`Quick Reflexes: drew ${drawnVoid} void and ${drawnWind} wind stone${(drawnVoid + drawnWind) === 1 ? '' : 's'}.`);
        }

        // Multiplayer sync
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
            broadcastGameAction('quick-reflexes-draw', {
                playerIndex: casterIndex,
                voidDrawn: drawnVoid,
                windDrawn: drawnWind
            });
        }
    },

    // Check if extended placement is active for a stone type
    hasExtendedPlacement(stoneType, playerIndex) {
        // Earth extended placement (5 hex range for earth stones)
        if (stoneType === 'earth' && this.activeBuffs.earthExtendedPlacement) {
            const buff = this.activeBuffs.earthExtendedPlacement;
            if (buff.playerIndex === playerIndex) {
                return { active: true, range: buff.range };
            }
        }
        return { active: false, range: 1 };
    },

    // Check if global placement is active
    hasGlobalPlacement(playerIndex) {
        if (this.activeBuffs.globalPlacement) {
            return this.activeBuffs.globalPlacement.playerIndex === playerIndex;
        }
        return false;
    },

    // Check if Breath of Power allows moving stones this turn
    hasWindStoneMove(playerIndex) {
        if (this.activeBuffs.breathOfPower) {
            return this.activeBuffs.breathOfPower.playerIndex === playerIndex;
        }
        return false;
    },

    // Check if Freedom is active (affects all players)
    hasFreedomActive() {
        return !!this.activeBuffs.freedom;
    },

    // Track last scroll cast this turn (for Reflect)
    lastScrollCastThisTurn: null,
    stonesPlacedThisTurn: 0,

    // Called when a scroll is cast - track it for Reflect
    recordScrollCast(scrollName, scrollDefinition) {
        this.lastScrollCastThisTurn = {
            name: scrollName,
            definition: scrollDefinition
        };
    },

    // Called when a stone is placed - track for Burning Motivation
    recordStonePlaced() {
        this.stonesPlacedThisTurn++;
    },

    // Clear turn tracking (called on End Turn)
    clearTurnTracking() {
        this.lastScrollCastThisTurn = null;
        this.stonesPlacedThisTurn = 0;
    },

    // At start of a player's turn: if they have a pending Reflect, run the stored scroll and count as water activation.
    // Returns { triggered: true, playerIndex, scrollName, definition } when a reflect was processed so caller can broadcast.
    processReflectPending(playerIndex) {
        const pending = this.activeBuffs.reflectPending;
        if (!pending || pending.playerIndex !== playerIndex) return null;
        const scrollName = pending.scrollName;
        const definition = pending.definition;
        delete this.activeBuffs.reflectPending;
        const displayName = definition?.name || scrollName;
        updateStatus(`Reflect triggers: activating ${displayName}!`);
        // Run the reflected scroll's ability with full context (spell + scrollName so effects can use it)
        const result = this.execute(scrollName, playerIndex, { spell: definition, scrollName });
        if (result.success && this.spellSystem) {
            this.spellSystem.ensurePlayerScrollsStructure(playerIndex);
            const activated = this.spellSystem.playerScrolls[playerIndex].activated;
            activated.add('water');
            // Also count the reflected scroll's element(s) as activated (same as normal cast)
            // Resolve definition from patterns if it lacks .element (may be effect def, not scroll def)
            const scrollDef = definition?.element ? definition : (this.spellSystem.patterns?.[scrollName] || definition);
            if (scrollDef) {
                if (scrollDef.element === 'catacomb' && scrollDef.patterns?.[0]) {
                    scrollDef.patterns[0].forEach(p => { if (p.type) activated.add(p.type); });
                } else if (scrollDef.element) {
                    activated.add(scrollDef.element);
                }
            }
            console.log(`🪞 processReflectPending activated elements for player ${playerIndex}:`, Array.from(activated));
            if (typeof updatePlayerElementSymbols === 'function') {
                updatePlayerElementSymbols(playerIndex);
            }
        }
        // Include full scroll definition (with element) for broadcast
        const fullDef = definition?.element ? definition : (this.spellSystem?.patterns?.[scrollName] || definition);
        return { triggered: true, playerIndex, scrollName, definition: fullDef };
    },

    // At start of a player's turn: if they have a pending Psychic, run the stolen scroll and count as void activation.
    // Returns { triggered: true, playerIndex, scrollName, definition } when processed so caller can broadcast.
    processPsychicPending(playerIndex) {
        const pending = this.activeBuffs.psychicPending;
        if (!pending || pending.playerIndex !== playerIndex) return null;
        const scrollName = pending.scrollName;
        const definition = pending.definition;
        delete this.activeBuffs.psychicPending;
        const displayName = definition?.name || scrollName;
        updateStatus(`Psychic triggers: activating ${displayName}!`);
        // Run the stolen scroll's ability
        const result = this.execute(scrollName, playerIndex, { spell: definition, scrollName });
        if (result.success && this.spellSystem) {
            this.spellSystem.ensurePlayerScrollsStructure(playerIndex);
            const activated = this.spellSystem.playerScrolls[playerIndex].activated;
            // Only count as void activation — the stolen scroll's element does NOT
            // count toward the win condition (same approach as Reflect counting only water).
            activated.add('void');
            console.log(`🔮 processPsychicPending activated void for player ${playerIndex}:`, Array.from(activated));
            if (typeof updatePlayerElementSymbols === 'function') {
                updatePlayerElementSymbols(playerIndex);
            }
        }
        const fullDef = definition?.element ? definition : (this.spellSystem?.patterns?.[scrollName] || definition);
        return { triggered: true, playerIndex, scrollName, definition: fullDef };
    },

    // ============================================
    // WATER SCROLL MODES
    // ============================================

    // Water V - Control the Current: This turn, transform water stones that are adjacent to you (no Done button; eligibility updates when you move)
    enterWaterTransformMode(casterIndex) {
        const self = this;

        const playerPos = typeof playerPositions !== 'undefined' ? playerPositions[casterIndex] : (typeof playerPosition !== 'undefined' ? playerPosition : null);
        if (!playerPos) {
            updateStatus('Cannot find player position!');
            return;
        }

        const initialAdjacent = this.getAdjacentWaterStones(playerPos, casterIndex);
        this.highlightStones(initialAdjacent, '#5894f4');

        this.selectionMode = {
            type: 'water-transform',
            casterIndex: casterIndex,
            highlightedStones: initialAdjacent,

            handleStoneClick(stone) {
                if (stone.type !== 'water') {
                    updateStatus('Only water stones can be transformed.');
                    return;
                }
                const pos = typeof playerPositions !== 'undefined' ? playerPositions[self.selectionMode.casterIndex] : (typeof playerPosition !== 'undefined' ? playerPosition : null);
                if (!pos) return;
                if (!self.isStoneAdjacentToPosition(stone.x, stone.y, pos.x, pos.y)) {
                    updateStatus('That water stone is not adjacent to you. Move next to it to transform it.');
                    return;
                }
                self.showWaterTransformPopup(stone, self.selectionMode.casterIndex, () => {
                    self.refreshWaterTransformHighlights();
                });
            },

            cleanup() {
                if (self.selectionMode && self.selectionMode.highlightedStones) {
                    self.selectionMode.highlightedStones.forEach(s => self.unhighlightStone(s));
                }
            }
        };

        updateStatus('Control the Current: transform adjacent water stones this turn. Move next to water stones to transform them.');
    },

    // Update which stones are highlighted based on current player position (call after move or after a transform)
    refreshWaterTransformHighlights() {
        if (!this.selectionMode || this.selectionMode.type !== 'water-transform') return;
        const casterIndex = this.selectionMode.casterIndex;
        const playerPos = typeof playerPositions !== 'undefined' ? playerPositions[casterIndex] : (typeof playerPosition !== 'undefined' ? playerPosition : null);
        if (!playerPos) return;
        const prev = this.selectionMode.highlightedStones || [];
        prev.forEach(s => this.unhighlightStone(s));
        const next = this.getAdjacentWaterStones(playerPos, casterIndex);
        this.highlightStones(next, '#5894f4');
        this.selectionMode.highlightedStones = next;
    },

    // Get water stones adjacent to player (same rule as break/place: exactly one hex step away)
    getAdjacentWaterStones(playerPos, playerIndex) {
        if (typeof placedStones === 'undefined') return [];

        return placedStones.filter(stone => {
            if (stone.type !== 'water') return false;
            return this.isStoneAdjacentToPosition(stone.x, stone.y, playerPos.x, playerPos.y);
        });
    },

    // Same hex-adjacency logic as game-core isAdjacentToPlayer (one hex step only)
    isStoneAdjacentToPosition(stoneX, stoneY, playerX, playerY) {
        const tileSize = typeof TILE_SIZE !== 'undefined' ? TILE_SIZE : 20;
        const playerHex = this.pixelToHex(playerX, playerY, tileSize);
        const targetHex = this.pixelToHex(stoneX, stoneY, tileSize);
        const dq = Math.abs(playerHex.q - targetHex.q);
        const dr = Math.abs(playerHex.r - targetHex.r);
        const ds = Math.abs((-playerHex.q - playerHex.r) - (-targetHex.q - targetHex.r));
        const hexDistance = Math.max(dq, dr, ds);
        return hexDistance === 1;
    },

    pixelToHex(x, y, s) {
        const q = (x * Math.sqrt(3) / 3 - y / 3) / s;
        const r = (y * 2 / 3) / s;
        return this.hexRound(q, r);
    },

    hexRound(q, r) {
        const s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        const rs = Math.round(s);
        const qDiff = Math.abs(rq - q);
        const rDiff = Math.abs(rr - r);
        const sDiff = Math.abs(rs - s);
        if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
        else if (rDiff > sDiff) rr = -rq - rs;
        return { q: rq, r: rr };
    },

    // Show popup to transform water stone
    showWaterTransformPopup(stone, casterIndex, onComplete) {
        const existing = document.getElementById('water-transform-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'water-transform-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #5894f4',
            borderRadius: '10px',
            padding: '20px',
            color: 'white',
            minWidth: '300px'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Transform Water Stone';
        titleEl.style.marginBottom = '10px';
        titleEl.style.textAlign = 'center';
        modal.appendChild(titleEl);

        const descEl = document.createElement('p');
        descEl.textContent = 'Choose an element to transform this water stone into:';
        descEl.style.marginBottom = '15px';
        descEl.style.fontSize = '14px';
        descEl.style.color = '#bdc3c7';
        modal.appendChild(descEl);

        const elements = ['earth', 'fire', 'wind', 'void']; // Not water - we're transforming FROM water
        const elementColors = {
            earth: '#69d83a',
            fire: '#ed1b43',
            wind: '#ffce00',
            void: '#9458f4'
        };

        elements.forEach(element => {
            // Check if source pool has stones available
            const available = typeof stonePools !== 'undefined' ? (stonePools[element] || 0) : 0;

            const btn = document.createElement('button');
            btn.textContent = `${element.charAt(0).toUpperCase() + element.slice(1)} (${available} available)`;
            btn.disabled = available <= 0;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '12px',
                margin: '8px 0',
                backgroundColor: available > 0 ? '#2d2d44' : '#1a1a1a',
                color: available > 0 ? elementColors[element] : '#555',
                border: `2px solid ${available > 0 ? elementColors[element] : '#333'}`,
                borderRadius: '5px',
                cursor: available > 0 ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 'bold'
            });

            if (available > 0) {
                btn.onmouseenter = () => btn.style.backgroundColor = '#3d3d54';
                btn.onmouseleave = () => btn.style.backgroundColor = '#2d2d44';
                btn.onclick = () => {
                    overlay.remove();
                    this.transformWaterStone(stone, element, casterIndex);
                    if (onComplete) onComplete();
                };
            }
            modal.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        Object.assign(cancelBtn.style, {
            marginTop: '15px',
            padding: '10px 20px',
            backgroundColor: '#7f8c8d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            width: '100%'
        });
        cancelBtn.onclick = () => overlay.remove();
        modal.appendChild(cancelBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    // Transform a water stone into another element
    transformWaterStone(stone, newElement, casterIndex) {
        // Return water stone to source pool
        if (typeof stonePools !== 'undefined') {
            stonePools.water = (stonePools.water || 0) + 1;
        }

        // Take stone from new element's source pool
        if (typeof stonePools !== 'undefined') {
            stonePools[newElement] = (stonePools[newElement] || 0) - 1;
        }

        // Update the stone's type and visual
        stone.type = newElement;

        // Update the stone's visual appearance
        if (stone.element) {
            const elementColors = {
                earth: '#69d83a',
                fire: '#ed1b43',
                wind: '#ffce00',
                void: '#9458f4'
            };

            const circle = stone.element.querySelector('circle');
            if (circle) {
                circle.setAttribute('fill', elementColors[newElement]);
            }
        }

        updateStatus(`Transformed water stone into ${newElement}!`);

        // Broadcast in multiplayer
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
            broadcastGameAction('water-stone-transformed', {
                stoneX: stone.x,
                stoneY: stone.y,
                newElement: newElement
            });
        }
    },

    // Highlight stones with click handlers
    highlightStones(stones, color) {
        stones.forEach(stone => this.highlightStone(stone, color));
    },

    highlightStone(stone, color) {
        if (!stone.element) return;
        const circle = stone.element.querySelector('circle');
        if (circle) {
            circle.setAttribute('data-original-stroke', circle.getAttribute('stroke') || 'none');
            circle.setAttribute('data-original-stroke-width', circle.getAttribute('stroke-width') || '0');
            circle.setAttribute('stroke', color);
            circle.setAttribute('stroke-width', '4');

            // Add pulsing animation class
            circle.style.animation = 'stonePulse 1s ease-in-out infinite';

            // Make clickable with cursor change
            stone.element.style.cursor = 'pointer';
            stone.element.style.pointerEvents = 'all';

            // Add direct click handler to stone element for more reliable clicking
            const self = this;
            stone._clickHandler = function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (self.selectionMode && self.selectionMode.handleStoneClick) {
                    self.selectionMode.handleStoneClick(stone);
                }
            };
            stone.element.addEventListener('click', stone._clickHandler);

            // Also handle touch for mobile
            stone._touchHandler = function(e) {
                e.preventDefault();
                if (self.selectionMode && self.selectionMode.handleStoneClick) {
                    self.selectionMode.handleStoneClick(stone);
                }
            };
            stone.element.addEventListener('touchend', stone._touchHandler);
        }

        // Add pulse animation if not already in DOM
        if (!document.getElementById('stone-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'stone-pulse-style';
            style.textContent = `
                @keyframes stonePulse {
                    0%, 100% { stroke-width: 4px; opacity: 1; }
                    50% { stroke-width: 6px; opacity: 0.8; }
                }
            `;
            document.head.appendChild(style);
        }
    },

    unhighlightStone(stone) {
        if (!stone.element) return;
        const circle = stone.element.querySelector('circle');
        if (circle) {
            const origStroke = circle.getAttribute('data-original-stroke') || 'none';
            const origWidth = circle.getAttribute('data-original-stroke-width') || '0';
            circle.setAttribute('stroke', origStroke);
            circle.setAttribute('stroke-width', origWidth);
            circle.style.animation = '';
        }

        // Remove click handlers
        if (stone._clickHandler) {
            stone.element.removeEventListener('click', stone._clickHandler);
            delete stone._clickHandler;
        }
        if (stone._touchHandler) {
            stone.element.removeEventListener('touchend', stone._touchHandler);
            delete stone._touchHandler;
        }

        // Reset cursor
        stone.element.style.cursor = '';
        stone.element.style.pointerEvents = '';
    },

    // Water II - Refreshing Thought: Discard a scroll to draw another
    enterScrollDiscardMode(casterIndex, mode) {
        const self = this;

        // Get player's scrolls
        const playerScrolls = this.spellSystem?.playerScrolls?.[casterIndex];
        if (!playerScrolls || playerScrolls.hand.size === 0) {
            updateStatus('No scrolls to discard!');
            return;
        }

        // Create scroll selection UI
        const scrollArray = Array.from(playerScrolls.hand);
        this.showScrollSelectionModal(scrollArray, 'Select a scroll to discard:', (selectedScroll) => {
            // Get scroll element type
            const scrollDef = this.spellSystem?.patterns?.[selectedScroll];
            const element = scrollDef?.element;

            // Remove from hand, add to common area using proper method
            playerScrolls.hand.delete(selectedScroll);
            if (this.spellSystem.discardToCommonArea) {
                this.spellSystem.discardToCommonArea(selectedScroll);
            }

            // Draw a new scroll of that element type
            if (element && this.spellSystem?.scrollDecks?.[element]?.length > 0) {
                const newScroll = this.spellSystem.scrollDecks[element].pop();
                playerScrolls.hand.add(newScroll);
                updateStatus(`Discarded ${scrollDef?.name || selectedScroll}. Drew a new ${element} scroll!`);
            } else {
                updateStatus(`Discarded ${scrollDef?.name || selectedScroll}. No ${element} scrolls left in deck!`);
            }

            // Update UI
            if (this.spellSystem?.updateScrollCount) {
                this.spellSystem.updateScrollCount();
            }
        });
    },

    // Water III - Inspiring Draught: Select 1 deck, draw 2 from it, add to hand, then show ALL scrolls
    // of that element and player chooses one to put back; that deck is then shuffled.
    enterInspiringDraughtMode(casterIndex) {
        const self = this;
        const spellSystem = this.spellSystem;
        if (!spellSystem) return;

        this.ensurePlayerScrollsStructure(casterIndex);
        const playerScrolls = spellSystem.playerScrolls[casterIndex];
        if (!playerScrolls) return;

        // Step 1: Select ONE deck to draw from
        this.showDeckSelectionModal(1, (selectedDecks) => {
            if (!selectedDecks || selectedDecks.length === 0) {
                updateStatus('No deck selected.');
                return;
            }
            const deckType = selectedDecks[0];
            const deck = spellSystem.scrollDecks?.[deckType];
            if (!deck || deck.length === 0) {
                updateStatus('That deck has no scrolls!');
                return;
            }

            // Step 2: Draw up to 2 scrolls from that deck (add to hand immediately)
            const drawnScrolls = [];
            for (let i = 0; i < 2 && deck.length > 0; i++) {
                const scroll = deck.pop();
                drawnScrolls.push(scroll);
                playerScrolls.hand.add(scroll);
            }

            if (drawnScrolls.length === 0) {
                updateStatus('No scrolls available to draw!');
                return;
            }

            // Step 3: Collect ALL scrolls the player has of this element (hand + active)
            const getScrollElement = spellSystem.getScrollElement.bind(spellSystem);
            const handOfType = [...playerScrolls.hand].filter(name => getScrollElement(name) === deckType);
            const activeOfType = [...(playerScrolls.active || [])].filter(name => getScrollElement(name) === deckType);
            const allOfElement = [...new Set([...handOfType, ...activeOfType])];

            if (allOfElement.length === 0) {
                updateStatus('No scrolls of that element to put back.');
                if (spellSystem.updateScrollCount) spellSystem.updateScrollCount();
                return;
            }

            const elementName = deckType.charAt(0).toUpperCase() + deckType.slice(1);

            // Step 4: Show modal - choose one scroll to put back; deck will be shuffled
            this.showScrollSelectionModal(
                allOfElement,
                `Choose one scroll to put back into the ${elementName} deck (deck will be shuffled):`,
                (selectedToReturn) => {
                    // Remove from hand or active
                    playerScrolls.hand.delete(selectedToReturn);
                    playerScrolls.active.delete(selectedToReturn);
                    // Put back into deck and shuffle
                    spellSystem.scrollDecks[deckType].push(selectedToReturn);
                    this.shuffleDeck(spellSystem.scrollDecks[deckType]);
                    updateStatus(`Put 1 scroll back into the ${elementName} deck and shuffled.`);
                    if (spellSystem.updateScrollCount) spellSystem.updateScrollCount();
                }
            );
        });
    },

    ensurePlayerScrollsStructure(playerIndex) {
        if (this.spellSystem && typeof this.spellSystem.ensurePlayerScrollsStructure === 'function') {
            this.spellSystem.ensurePlayerScrollsStructure(playerIndex);
        }
    },

    // Generic deck draw mode (e.g. other effects: select N decks, draw 1 from each)
    enterDeckDrawMode(casterIndex, drawCount) {
        const self = this;
        const drawnScrolls = [];
        const deckSources = [];

        this.showDeckSelectionModal(drawCount, (selectedDecks) => {
            selectedDecks.forEach(deckType => {
                if (this.spellSystem?.scrollDecks?.[deckType]?.length > 0) {
                    const scroll = this.spellSystem.scrollDecks[deckType].pop();
                    drawnScrolls.push({ scroll, deckType });
                }
            });

            if (drawnScrolls.length === 0) {
                updateStatus('No scrolls available to draw!');
                return;
            }

            if (drawnScrolls.length === 1) {
                const playerScrolls = this.spellSystem?.playerScrolls?.[casterIndex];
                if (playerScrolls) {
                    this.ensurePlayerScrollsStructure(casterIndex);
                    playerScrolls.hand.add(drawnScrolls[0].scroll);
                }
                updateStatus(`Drew 1 scroll (kept it).`);
                if (this.spellSystem?.updateScrollCount) this.spellSystem.updateScrollCount();
                return;
            }

            this.showScrollSelectionModal(
                drawnScrolls.map(d => d.scroll),
                'Select one scroll to put back:',
                (selectedToReturn) => {
                    const playerScrolls = this.spellSystem?.playerScrolls?.[casterIndex];
                    drawnScrolls.forEach(({ scroll, deckType }) => {
                        if (scroll === selectedToReturn) {
                            this.spellSystem.scrollDecks[deckType].push(scroll);
                            this.shuffleDeck(this.spellSystem.scrollDecks[deckType]);
                        } else {
                            if (playerScrolls) playerScrolls.hand.add(scroll);
                        }
                    });
                    updateStatus('Drew 2 scrolls, put 1 back.');
                    if (this.spellSystem?.updateScrollCount) this.spellSystem.updateScrollCount();
                }
            );
        });
    },

    // Water IV - Wandering River: Change tile element (any non-player tile)
    enterTileElementChangeMode(casterIndex) {
        const self = this;

        // Any tile except player tiles
        const eligibleTiles = this.getEligibleTilesForWanderingRiver();

        if (eligibleTiles.length === 0) {
            updateStatus('No tiles to modify!');
            return;
        }

        this.highlightTiles(eligibleTiles, '#5894f4');

        const cancelBtn = this.createCancelButton('Cancel', () => {
            self.cancelSelectionMode();
        });

        this.selectionMode = {
            type: 'tile-element-change',
            casterIndex: casterIndex,
            eligibleTiles: eligibleTiles,
            cancelBtn: cancelBtn,

            handleTileClick(tile) {
                if (!eligibleTiles.find(t => t.id === tile.id)) {
                    updateStatus('Cannot modify this tile.');
                    return;
                }

                // Show element selection
                self.showElementSelectionModal((selectedElement) => {
                    // Apply temporary element change (affects all players: anyone who reveals draws that element's scroll)
                    self.activeBuffs.wanderingRiver = self.activeBuffs.wanderingRiver || [];
                    const entry = {
                        tileId: tile.id,
                        originalElement: tile.shrineType,
                        newElement: selectedElement,
                        expiresNextTurn: true,
                        playerIndex: casterIndex
                    };
                    self.activeBuffs.wanderingRiver.push(entry);

                    // Visual indicator: tile looks like the chosen element (symbol + color)
                    self.applyWanderingRiverIndicator(tile, selectedElement);

                    // Broadcast so other players see and are affected by the transformation
                    if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                        broadcastGameAction('wandering-river-apply', {
                            tileId: tile.id,
                            newElement: selectedElement,
                            playerIndex: casterIndex
                        });
                    }

                    updateStatus(`Tile now counts as ${selectedElement} until your next turn!`);
                    self.selectionMode.cleanup();
                    self.selectionMode = null;
                });
            },

            cleanup() {
                eligibleTiles.forEach(tile => self.unhighlightTile(tile));
                if (cancelBtn && cancelBtn.parentNode) {
                    cancelBtn.parentNode.removeChild(cancelBtn);
                }
            }
        };

        updateStatus('Select a tile to change its element.');
    },

    // Effective tile element for game logic (Wandering River override)
    getEffectiveTileElement(tile) {
        if (!tile || !this.activeBuffs.wanderingRiver || !Array.isArray(this.activeBuffs.wanderingRiver)) return tile ? tile.shrineType : null;
        const id = Number(tile.id);
        const entry = this.activeBuffs.wanderingRiver.find(e => Number(e.tileId) === id);
        return entry ? entry.newElement : (tile.shrineType || null);
    },

    // Add visual indicator: tile looks like the chosen element (symbol + color)
    applyWanderingRiverIndicator(tile, newElement) {
        if (!tile || !tile.element) return;
        const stoneTypes = (typeof STONE_TYPES !== 'undefined') ? STONE_TYPES : { earth: { color: '#69d83a', symbol: '▲' }, water: { color: '#5894f4', symbol: '◯' }, fire: { color: '#ed1b43', symbol: '♦' }, wind: { color: '#ffce00', symbol: '≋' }, void: { color: '#9458f4', symbol: '✺' }, catacomb: { color: '#8b4513', symbol: '🔅' } };
        const info = stoneTypes[newElement] || { color: '#888', symbol: newElement.charAt(0).toUpperCase() };
        tile.element.classList.add('wandering-river-transformed', 'wandering-river-' + newElement);
        tile.element.setAttribute('data-wandering-river-element', newElement);
        let label = tile.element.querySelector('.wandering-river-label');
        if (label) label.remove();
        label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'wandering-river-label');
        label.setAttribute('x', 0);
        label.setAttribute('y', -8);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('fill', info.color);
        label.setAttribute('font-size', '16');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('stroke', '#000');
        label.setAttribute('stroke-width', '1');
        label.textContent = info.symbol;
        tile.element.appendChild(label);
    },

    // Remove Wandering River indicator when buff expires
    removeWanderingRiverIndicator(tile) {
        if (!tile || !tile.element) return;
        const el = tile.element.getAttribute('data-wandering-river-element');
        if (el) tile.element.classList.remove('wandering-river-' + el);
        tile.element.classList.remove('wandering-river-transformed');
        tile.element.removeAttribute('data-wandering-river-element');
        const label = tile.element.querySelector('.wandering-river-label');
        if (label) label.remove();
    },

    // Clear Wandering River buffs for a player when their next turn starts
    clearWanderingRiverForPlayer(playerIndex) {
        if (!this.activeBuffs.wanderingRiver || !Array.isArray(this.activeBuffs.wanderingRiver)) return;
        const removed = this.activeBuffs.wanderingRiver.filter(e => e.playerIndex === playerIndex);
        this.activeBuffs.wanderingRiver = this.activeBuffs.wanderingRiver.filter(e => e.playerIndex !== playerIndex);
        if (typeof placedTiles !== 'undefined') {
            removed.forEach(e => {
                const tid = Number(e.tileId);
                const tile = placedTiles.find(t => Number(t.id) === tid);
                if (tile) this.removeWanderingRiverIndicator(tile);
            });
        }
    },

    // ============================================
    // FIRE SCROLL MODES
    // ============================================

    // Fire III - Sacrificial Pyre: Activate scroll from hand ignoring pattern
    enterScrollSacrificeMode(casterIndex) {
        const self = this;

        // Get player's scrolls
        const playerScrolls = this.spellSystem?.playerScrolls?.[casterIndex];
        if (!playerScrolls || playerScrolls.hand.size === 0) {
            updateStatus('No scrolls to sacrifice!');
            return;
        }

        const scrollArray = Array.from(playerScrolls.hand);
        this.showScrollSelectionModal(scrollArray, 'Select a scroll to sacrifice and activate:', (selectedScroll) => {
            // Remove from hand
            playerScrolls.hand.delete(selectedScroll);

            // Add to common area (not discard) using proper method
            if (this.spellSystem.discardToCommonArea) {
                this.spellSystem.discardToCommonArea(selectedScroll);
            }

            // Execute the scroll's effect
            const result = self.execute(selectedScroll, casterIndex, {});

            const scrollDef = this.spellSystem?.patterns?.[selectedScroll];
            updateStatus(`Sacrificed ${scrollDef?.name || selectedScroll} to the pyre!`);

            if (this.spellSystem?.updateScrollCount) {
                this.spellSystem.updateScrollCount();
            }
        });
    },

        // Fire IV - Combust: Destroy stones on a tile
    enterScorchedEarthMode(casterIndex) {
        const self = this;

        // Get tiles that have stones on them (but not player tiles)
        const tilesWithStones = (typeof placedTiles !== 'undefined' ? placedTiles : []).filter(tile => {
            if (tile.isPlayerTile) return false;
            return this.tileHasStones(tile);
        });

        if (tilesWithStones.length === 0) {
            updateStatus('No tiles with stones to combust!');
            return;
        }

        this.highlightTiles(tilesWithStones, '#ed1b43');

        const cancelBtn = this.createCancelButton('Cancel', () => {
            self.cancelSelectionMode();
        });

        this.selectionMode = {
            type: 'scorched-earth',
            casterIndex: casterIndex,
            eligibleTiles: tilesWithStones,
            cancelBtn: cancelBtn,

            handleTileClick(tile) {
                if (!tilesWithStones.find(t => t.id === tile.id)) {
                    updateStatus('No stones on this tile to destroy.');
                    return;
                }

                // Destroy all stones on this tile
                self.destroyStonesOnTile(tile);
                updateStatus('Combust! All stones on the tile destroyed.');

                self.selectionMode.cleanup();
                self.selectionMode = null;
            },

            cleanup() {
                tilesWithStones.forEach(tile => self.unhighlightTile(tile));
                if (cancelBtn && cancelBtn.parentNode) {
                    cancelBtn.parentNode.removeChild(cancelBtn);
                }
            }
        };

        updateStatus('Select a tile to destroy all stones on it.');
    },

    // Fire IV - Transmute: discard stones/scrolls for AP
    enterTransmuteMode(casterIndex) {
        const self = this;
        const overlayId = 'transmute-modal';
        const existing = document.getElementById(overlayId);
        if (existing) existing.remove();

        const pools = typeof playerPools !== 'undefined' ? playerPools : (typeof window !== 'undefined' && window.playerPools);
        const source = typeof stonePools !== 'undefined' ? stonePools : (typeof window !== 'undefined' && window.stonePools);
        const sourceCap = typeof sourcePoolCapacity !== 'undefined' ? sourcePoolCapacity : (typeof window !== 'undefined' && window.sourcePoolCapacity);

        const playerScrolls = this.spellSystem?.playerScrolls?.[casterIndex];
        if (!playerScrolls) {
            updateStatus('Transmute failed: no scroll data for player.');
            return;
        }

        let totalGained = 0;
        const getMaxTotalAP = () => {
            const voidCap = pools?.[casterIndex]?.void || 0;
            return 5 + voidCap;
        };
        const getCurrentTotalAP = () => {
            return (typeof currentAP !== 'undefined' ? currentAP : 0) + (typeof voidAP !== 'undefined' ? voidAP : 0);
        };
        const clampVoidAPToPool = () => {
            if (typeof voidAP === 'undefined' || !pools?.[casterIndex]) return;
            const maxVoid = pools[casterIndex].void || 0;
            const oldVoid = voidAP;
            voidAP = Math.min(voidAP, maxVoid);
            if (oldVoid !== voidAP) {
                const display = document.getElementById('void-ap-display');
                if (display) {
                    if (voidAP > 0) {
                        display.textContent = `(+${voidAP} ✨ Void AP)`;
                        display.style.display = 'inline';
                    } else {
                        display.style.display = 'none';
                    }
                }
            }
        };

        const gainAPCapped = (amount) => {
            const maxTotal = getMaxTotalAP();
            const currentTotal = getCurrentTotalAP();
            const room = Math.max(0, maxTotal - currentTotal);
            const gain = Math.min(amount, room);
            if (gain <= 0) {
                updateStatus('Transmute: AP is already at max.');
                return 0;
            }
            if (typeof addAP === 'function') addAP(gain);
            return gain;
        };
        const atMaxAP = () => getCurrentTotalAP() >= getMaxTotalAP();

        const overlay = document.createElement('div');
        overlay.id = overlayId;
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #ed1b43',
            borderRadius: '10px',
            padding: '20px',
            color: 'white',
            minWidth: '320px',
            maxWidth: '420px'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Transmute';
        titleEl.style.marginBottom = '10px';
        titleEl.style.textAlign = 'center';
        titleEl.style.color = '#ed1b43';
        modal.appendChild(titleEl);

        const subtitle = document.createElement('div');
        subtitle.textContent = 'Discard stones or scrolls to gain 2 AP each.';
        subtitle.style.color = '#bdc3c7';
        subtitle.style.fontSize = '13px';
        subtitle.style.marginBottom = '10px';
        subtitle.style.textAlign = 'center';
        modal.appendChild(subtitle);

        const gainedEl = document.createElement('div');
        gainedEl.textContent = 'AP gained: 0';
        gainedEl.style.textAlign = 'center';
        gainedEl.style.marginBottom = '10px';
        modal.appendChild(gainedEl);

        const clearSuppress = () => {
            const sup = self.activeBuffs.suppressVoidAPSync;
            if (sup && sup.playerIndex === casterIndex) {
                delete self.activeBuffs.suppressVoidAPSync;
            }
        };

        const updateGained = () => {
            gainedEl.textContent = `AP gained: ${totalGained}`;
        };

        const sectionHeader = (text) => {
            const h = document.createElement('div');
            h.textContent = text;
            h.style.marginTop = '10px';
            h.style.marginBottom = '6px';
            h.style.fontWeight = 'bold';
            h.style.color = '#f39c12';
            return h;
        };

        // Stones
        modal.appendChild(sectionHeader('Stones'));
        const stoneTypes = ['earth', 'water', 'fire', 'wind', 'void'];
        stoneTypes.forEach(type => {
            const count = pools?.[casterIndex]?.[type] || 0;
            const btn = document.createElement('button');
            btn.textContent = `Discard 1 ${type} (${count})`;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '8px',
                margin: '4px 0',
                backgroundColor: '#2d2d44',
                color: 'white',
                border: '1px solid #444',
                borderRadius: '5px',
                cursor: count > 0 ? 'pointer' : 'not-allowed',
                opacity: count > 0 ? '1' : '0.4'
            });
            btn.onclick = () => {
                const available = pools?.[casterIndex]?.[type] || 0;
                if (atMaxAP()) {
                    updateStatus('Transmute: AP is already at max.');
                    return;
                }
                if (available <= 0) return;
                pools[casterIndex][type] = available - 1;
                if (source && sourceCap && typeof source[type] === 'number') {
                    source[type] = Math.min(sourceCap[type], source[type] + 1);
                }
                if (typeof updateStoneCount === 'function') updateStoneCount(type);
                if (type === 'void') clampVoidAPToPool();
                const gained = gainAPCapped(2);
                totalGained += gained;
                btn.textContent = `Discard 1 ${type} (${pools[casterIndex][type]})`;
                updateGained();
                if (typeof syncPlayerState === 'function') syncPlayerState();
            };
            modal.appendChild(btn);
        });

        // Scrolls
        modal.appendChild(sectionHeader('Scrolls'));
        const renderScrollButtons = (label, scrollSet) => {
            const arr = Array.from(scrollSet || []);
            if (arr.length === 0) {
                const empty = document.createElement('div');
                empty.textContent = `No ${label} scrolls`;
                empty.style.color = '#7f8c8d';
                empty.style.fontSize = '12px';
                empty.style.marginBottom = '4px';
                modal.appendChild(empty);
                return;
            }
            arr.forEach(scrollName => {
                const def = self.spellSystem?.patterns?.[scrollName];
                const btn = document.createElement('button');
                btn.textContent = `Discard ${def?.name || scrollName} (${label})`;
                Object.assign(btn.style, {
                    display: 'block',
                    width: '100%',
                    padding: '8px',
                    margin: '4px 0',
                    backgroundColor: '#2d2d44',
                    color: 'white',
                    border: '1px solid #444',
                    borderRadius: '5px',
                    cursor: 'pointer'
                });
                btn.onclick = () => {
                    if (atMaxAP()) {
                        updateStatus('Transmute: AP is already at max.');
                        return;
                    }
                    if (label === 'hand') playerScrolls.hand.delete(scrollName);
                    if (label === 'active') playerScrolls.active.delete(scrollName);
                    if (self.spellSystem?.discardToCommonArea) {
                        self.spellSystem.discardToCommonArea(scrollName);
                    }
                    if (self.spellSystem?.updateScrollCount) self.spellSystem.updateScrollCount();
                    if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI();
                    const gained = gainAPCapped(2);
                    totalGained += gained;
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    updateGained();
                    if (typeof syncPlayerState === 'function') syncPlayerState();
                };
                modal.appendChild(btn);
            });
        };

        renderScrollButtons('hand', playerScrolls.hand);
        renderScrollButtons('active', playerScrolls.active);

        // Done button
        const doneBtn = document.createElement('button');
        doneBtn.textContent = 'Done';
        Object.assign(doneBtn.style, {
            display: 'block',
            width: '100%',
            padding: '10px',
            margin: '10px 0 0 0',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px'
        });
        doneBtn.onclick = () => overlay.remove();
        modal.appendChild(doneBtn);

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        Object.assign(cancelBtn.style, {
            display: 'block',
            width: '100%',
            padding: '10px',
            margin: '8px 0 0 0',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px'
        });
        cancelBtn.onclick = () => overlay.remove();
        modal.appendChild(cancelBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Cleanup suppress flag when modal closes (Done or Cancel)
        const observer = new MutationObserver(() => {
            if (!document.body.contains(overlay)) {
                observer.disconnect();
                clearSuppress();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    },

    // Wind IV - Take Flight: Teleport any player to an unoccupied hex of your choice
    enterTakeFlightMode(casterIndex, completionPayload) {
        const self = this;
        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 1;

        // Build list of all players (including self, but exclude Excavate-immune opponents)
        const allPlayers = [];
        for (let i = 0; i < numPlayers; i++) {
            // Allow self-targeting, but skip immune opponents
            if (i !== casterIndex && this.hasExcavateImmunity(i)) continue;
            allPlayers.push(i);
        }

        if (allPlayers.length === 0) {
            updateStatus('No players to target!');
            return;
        }

        // Step 1: Select target player
        const showPlayerModal = () => {
            const existing = document.getElementById('take-flight-player-modal');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'take-flight-player-modal';
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0', left: '0', right: '0', bottom: '0',
                backgroundColor: 'rgba(0,0,0,0.8)',
                zIndex: '3000',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            });

            const modal = document.createElement('div');
            Object.assign(modal.style, {
                backgroundColor: '#1a1a2e',
                border: '2px solid #ffce00',
                borderRadius: '10px',
                padding: '20px',
                color: 'white',
                minWidth: '200px'
            });

            const titleEl = document.createElement('h3');
            titleEl.textContent = 'Take Flight: Select a player to teleport';
            titleEl.style.marginBottom = '15px';
            modal.appendChild(titleEl);

            allPlayers.forEach(playerIdx => {
                const name = (typeof getPlayerColorName === 'function')
                    ? getPlayerColorName(playerIdx)
                    : `Player ${playerIdx + 1}`;

                const btn = document.createElement('button');
                btn.textContent = playerIdx === casterIndex ? `${name} (you)` : name;
                Object.assign(btn.style, {
                    display: 'block',
                    width: '100%',
                    padding: '10px',
                    margin: '5px 0',
                    backgroundColor: '#2d2d44',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px'
                });
                btn.onclick = () => {
                    overlay.remove();
                    enterHexSelectionForPlayer(playerIdx);
                };
                modal.appendChild(btn);
            });

            // Cancel button
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            Object.assign(cancelBtn.style, {
                display: 'block',
                width: '100%',
                padding: '10px',
                margin: '10px 0 0 0',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
            });
            cancelBtn.onclick = () => {
                overlay.remove();
                self.cancelSelectionMode();
            };
            modal.appendChild(cancelBtn);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        };

        // Step 2: Drag the target pawn to an unoccupied hex
        const enterHexSelectionForPlayer = (targetPlayerIndex) => {
            const cancelBtn = self.createCancelButton('Cancel Take Flight', () => {
                if (window.takeFlightState?.onCancel) {
                    window.takeFlightState.onCancel();
                }
                self.cancelSelectionMode();
            });

            const targetPlayer = (typeof playerPositions !== 'undefined') ? playerPositions[targetPlayerIndex] : null;
            if (!targetPlayer) {
                updateStatus('Take Flight: target player not found.');
                if (cancelBtn && cancelBtn.parentNode) cancelBtn.parentNode.removeChild(cancelBtn);
                return;
            }

            const cleanup = () => {
                if (cancelBtn && cancelBtn.parentNode) {
                    cancelBtn.parentNode.removeChild(cancelBtn);
                }
                if (window.takeFlightState) {
                    window.takeFlightState.active = false;
                    window.takeFlightState = null;
                }
                self.selectionMode = null;
            };

            const onComplete = (destX, destY) => {
                const targetName = (typeof getPlayerColorName === 'function')
                    ? getPlayerColorName(targetPlayerIndex)
                    : `Player ${targetPlayerIndex + 1}`;
                updateStatus(`Take Flight! Teleported ${targetName} to a new location.`);
                console.log(`🌬️ Take Flight: player ${targetPlayerIndex} teleported to (${destX.toFixed(1)}, ${destY.toFixed(1)})`);

                // Broadcast teleport in multiplayer
                if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                    broadcastGameAction('take-flight', {
                        targetPlayerIndex: targetPlayerIndex,
                        x: destX,
                        y: destY
                    });
                }

                // Send Take Flight to common area using handleScrollDisposition
                if (self.spellSystem) {
                    const scrollName = completionPayload?.scrollName || 'WIND_SCROLL_4';
                    self.spellSystem.handleScrollDisposition(scrollName, false, true);
                }

                // Signal completion
                if (completionPayload && self.spellSystem && typeof self.spellSystem.onSelectionEffectComplete === 'function') {
                    self.spellSystem.onSelectionEffectComplete(completionPayload.scrollName, completionPayload.effectName, completionPayload.spell);
                }

                cleanup();
            };

            const onCancel = () => {
                updateStatus('Take Flight cancelled.');
                cleanup();
            };

            window.takeFlightState = {
                active: true,
                casterIndex,
                targetPlayerIndex,
                startPos: { x: targetPlayer.x, y: targetPlayer.y },
                onComplete,
                onCancel
            };

            self.selectionMode = {
                type: 'take-flight-drag',
                casterIndex,
                targetPlayerIndex,
                cancelBtn,
                cleanup
            };

            const targetName = (typeof getPlayerColorName === 'function')
                ? getPlayerColorName(targetPlayerIndex)
                : `Player ${targetPlayerIndex + 1}`;
            updateStatus(`Take Flight: Drag ${targetName} to an unoccupied hex.`);
        };

        showPlayerModal();
    },

    // Fire V - Arson: Destroy stone from opponent pool
    enterArsonMode(casterIndex, completionPayload = null) {
        const self = this;

        // Get opponents (exclude Excavate-immune players)
        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 1;
        const opponents = [];
        for (let i = 0; i < numPlayers; i++) {
            if (i !== casterIndex && !this.hasExcavateImmunity(i)) {
                opponents.push(i);
            }
        }

        if (opponents.length === 0) {
            updateStatus('No opponents to target!');
            return;
        }

        // Show opponent selection modal
        this.showOpponentSelectionModal(opponents, (selectedOpponent) => {
            // Get the stone types this opponent actually has (playerPools is per-player pool from game-core)
            const pools = typeof playerPools !== 'undefined' ? playerPools : (typeof window !== 'undefined' && window.playerPools);
            const opponentStones = pools && pools[selectedOpponent] ? pools[selectedOpponent] : null;
            if (!opponentStones) {
                updateStatus('Cannot access opponent stone pool!');
                return;
            }

            // Filter to only elements the opponent has > 0 stones
            const availableElements = ['earth', 'water', 'fire', 'wind', 'void'].filter(element =>
                opponentStones[element] && opponentStones[element] > 0
            );

            if (availableElements.length === 0) {
                const name = (typeof playerPositions !== 'undefined' && playerPositions[selectedOpponent]?.username)
                    ? playerPositions[selectedOpponent].username
                    : `Player ${selectedOpponent + 1}`;
                updateStatus(`${name} has no stones in their pool to destroy!`);
                return;
            }

            // Show element selection with only available elements
            self.showArsonElementModal(availableElements, opponentStones, (selectedElement) => {
                // Destroy one stone from opponent's pool
                self.destroyOpponentStone(selectedOpponent, selectedElement, completionPayload);
            });
        });
    },

    // Special element modal for Arson that shows only elements the opponent has
    showArsonElementModal(availableElements, opponentStones, onSelect) {
        const existing = document.getElementById('arson-element-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'arson-element-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #ed1b43',
            borderRadius: '10px',
            padding: '20px',
            color: 'white',
            minWidth: '280px'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Select a stone type to destroy:';
        titleEl.style.marginBottom = '15px';
        titleEl.style.color = '#ed1b43';
        modal.appendChild(titleEl);

        const elementColors = {
            earth: '#69d83a',
            water: '#5894f4',
            fire: '#ed1b43',
            wind: '#ffce00',
            void: '#9458f4'
        };

        availableElements.forEach(element => {
            const count = opponentStones[element] || 0;
            const btn = document.createElement('button');
            btn.textContent = `${element.charAt(0).toUpperCase() + element.slice(1)} (${count} in pool)`;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '12px',
                margin: '8px 0',
                backgroundColor: '#2d2d44',
                color: elementColors[element],
                border: `2px solid ${elementColors[element]}`,
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
            });
            btn.onmouseenter = () => btn.style.backgroundColor = '#3d3d54';
            btn.onmouseleave = () => btn.style.backgroundColor = '#2d2d44';
            btn.onclick = () => {
                overlay.remove();
                onSelect(element);
            };
            modal.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        Object.assign(cancelBtn.style, {
            marginTop: '15px',
            padding: '10px 20px',
            backgroundColor: '#7f8c8d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            width: '100%'
        });
        cancelBtn.onclick = () => overlay.remove();
        modal.appendChild(cancelBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    // ============================================
    // HELPER MODAL FUNCTIONS
    // ============================================

    showScrollSelectionModal(scrollNames, title, onSelect) {
        // Remove existing modal
        const existing = document.getElementById('scroll-select-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'scroll-select-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #5894f4',
            borderRadius: '10px',
            padding: '20px',
            maxWidth: '500px',
            color: 'white'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.marginBottom = '15px';
        modal.appendChild(titleEl);

        scrollNames.forEach(scrollName => {
            const scrollDef = this.spellSystem?.patterns?.[scrollName];
            const btn = document.createElement('button');
            btn.textContent = scrollDef?.name || scrollName;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '10px',
                margin: '5px 0',
                backgroundColor: '#2d2d44',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
            });
            btn.onmouseenter = () => btn.style.backgroundColor = '#3d3d54';
            btn.onmouseleave = () => btn.style.backgroundColor = '#2d2d44';
            btn.onclick = () => {
                overlay.remove();
                onSelect(scrollName);
            };
            modal.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        Object.assign(cancelBtn.style, {
            marginTop: '15px',
            padding: '10px 20px',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
        });
        cancelBtn.onclick = () => overlay.remove();
        modal.appendChild(cancelBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    showDeckSelectionModal(count, onSelect) {
        const existing = document.getElementById('deck-select-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'deck-select-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #5894f4',
            borderRadius: '10px',
            padding: '20px',
            color: 'white'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = count === 1
            ? 'Select 1 deck to draw 2 scrolls from:'
            : `Select ${count} deck(s) to draw from:`;
        titleEl.style.marginBottom = '15px';
        modal.appendChild(titleEl);

        const selected = [];
        const elements = ['earth', 'water', 'fire', 'wind', 'void'];
        const elementColors = {
            earth: '#69d83a',
            water: '#5894f4',
            fire: '#ed1b43',
            wind: '#ffce00',
            void: '#9458f4'
        };

        elements.forEach(element => {
            const deckSize = this.spellSystem?.scrollDecks?.[element]?.length || 0;
            const btn = document.createElement('button');
            btn.textContent = `${element.charAt(0).toUpperCase() + element.slice(1)} (${deckSize} left)`;
            btn.disabled = deckSize === 0;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '10px',
                margin: '5px 0',
                backgroundColor: deckSize > 0 ? '#2d2d44' : '#1a1a1a',
                color: deckSize > 0 ? elementColors[element] : '#555',
                border: 'none',
                borderRadius: '5px',
                cursor: deckSize > 0 ? 'pointer' : 'not-allowed'
            });

            if (deckSize > 0) {
                btn.onclick = () => {
                    if (selected.includes(element)) {
                        selected.splice(selected.indexOf(element), 1);
                        btn.style.backgroundColor = '#2d2d44';
                    } else if (selected.length < count) {
                        selected.push(element);
                        btn.style.backgroundColor = '#3d5a3d';
                    }
                };
            }
            modal.appendChild(btn);
        });

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Confirm';
        Object.assign(confirmBtn.style, {
            marginTop: '15px',
            padding: '10px 20px',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
        });
        confirmBtn.onclick = () => {
            overlay.remove();
            onSelect(selected);
        };
        modal.appendChild(confirmBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    showElementSelectionModal(onSelect) {
        const existing = document.getElementById('element-select-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'element-select-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #5894f4',
            borderRadius: '10px',
            padding: '20px',
            color: 'white'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Select an element:';
        titleEl.style.marginBottom = '15px';
        modal.appendChild(titleEl);

        const elements = ['earth', 'water', 'fire', 'wind', 'void'];
        const elementColors = {
            earth: '#69d83a',
            water: '#5894f4',
            fire: '#ed1b43',
            wind: '#ffce00',
            void: '#9458f4'
        };

        elements.forEach(element => {
            const btn = document.createElement('button');
            btn.textContent = element.charAt(0).toUpperCase() + element.slice(1);
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '10px',
                margin: '5px 0',
                backgroundColor: '#2d2d44',
                color: elementColors[element],
                border: `2px solid ${elementColors[element]}`,
                borderRadius: '5px',
                cursor: 'pointer'
            });
            btn.onclick = () => {
                overlay.remove();
                onSelect(element);
            };
            modal.appendChild(btn);
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    showOpponentSelectionModal(opponents, onSelect) {
        const existing = document.getElementById('opponent-select-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'opponent-select-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #ed1b43',
            borderRadius: '10px',
            padding: '20px',
            color: 'white',
            minWidth: '220px'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Select an opponent:';
        titleEl.style.marginBottom = '15px';
        titleEl.style.color = '#ed1b43';
        modal.appendChild(titleEl);

        opponents.forEach(opponentIndex => {
            // Get display name with username and color
            const name = (typeof getPlayerColorName === 'function')
                ? getPlayerColorName(opponentIndex)
                : (typeof playerPositions !== 'undefined' && playerPositions[opponentIndex]?.username)
                    ? playerPositions[opponentIndex].username
                    : `Player ${opponentIndex + 1}`;

            // Get the player's hex color for styling
            const playerHexColor = (typeof playerPositions !== 'undefined' && playerPositions[opponentIndex]?.color)
                ? playerPositions[opponentIndex].color
                : '#ffffff';

            const btn = document.createElement('button');
            btn.textContent = name;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '12px',
                margin: '6px 0',
                backgroundColor: '#2d2d44',
                color: playerHexColor,
                border: `1px solid ${playerHexColor}`,
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
            });
            btn.onmouseenter = () => btn.style.backgroundColor = '#3d3d54';
            btn.onmouseleave = () => btn.style.backgroundColor = '#2d2d44';
            btn.onclick = () => {
                overlay.remove();
                onSelect(opponentIndex);
            };
            modal.appendChild(btn);
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    // ============================================
    // STONE DESTRUCTION HELPERS
    // ============================================

    destroyStonesOnTile(tile) {
        if (typeof placedStones === 'undefined') return;

        // Use same radius as tileHasStones and findTileAtPosition: TILE_SIZE * 4
        const tileRadius = typeof TILE_SIZE !== 'undefined' ? TILE_SIZE * 4 : 80;

        // Find and remove ALL stones on this tile (iterate backwards for safe splice)
        for (let i = placedStones.length - 1; i >= 0; i--) {
            const stone = placedStones[i];
            const dist = Math.sqrt(Math.pow(stone.x - tile.x, 2) + Math.pow(stone.y - tile.y, 2));
            if (dist < tileRadius) {
                // Remove stone from DOM
                if (stone.element && stone.element.parentNode) {
                    stone.element.parentNode.removeChild(stone.element);
                }
                // Remove from array
                placedStones.splice(i, 1);
            }
        }

        // Broadcast in multiplayer
        if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
            broadcastGameAction('stones-destroyed', {
                tileId: tile.id
            });
        }
    },

    destroyOpponentStone(opponentIndex, stoneType, completionPayload = null) {
        const pools = typeof playerPools !== 'undefined' ? playerPools : (typeof window !== 'undefined' && window.playerPools);
        const opponentStones = pools && pools[opponentIndex] ? pools[opponentIndex] : null;
        if (!opponentStones) {
            updateStatus('Cannot access opponent stone pools.');
            return;
        }
        if (opponentStones[stoneType] > 0) {
            opponentStones[stoneType]--;
            const name = (typeof playerPositions !== 'undefined' && playerPositions[opponentIndex]?.username)
                ? playerPositions[opponentIndex].username
                : `Player ${opponentIndex + 1}`;
            updateStatus(`Arson! Destroyed 1 ${stoneType} stone from ${name}'s pool.`);

            if (typeof updateOpponentPanel === 'function') updateOpponentPanel();

            if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                broadcastGameAction('opponent-stone-destroyed', {
                    opponentIndex,
                    stoneType
                });
            }

            // Send Arson to common area after use
            if (completionPayload && this.spellSystem) {
                const scrollName = completionPayload.scrollName || 'FIRE_SCROLL_5';
                this.spellSystem.handleScrollDisposition(scrollName, false, true);
            }

            // Signal selection effect complete (triggers win check, broadcast)
            if (completionPayload && this.spellSystem && typeof this.spellSystem.onSelectionEffectComplete === 'function') {
                this.spellSystem.onSelectionEffectComplete(completionPayload.scrollName, completionPayload.effectName, completionPayload.spell);
            }
        } else {
            updateStatus(`${stoneType} pool is empty!`);
        }
    },

    // Catacomb Scroll 8 - Plunder: Discard a target player's active scroll to common area
    enterPlunderMode(casterIndex, completionPayload = null) {
        const self = this;
        // The scroll currently being cast — exclude it from plunderable lists
        // (it's still in the caster's active set until handleScrollDisposition runs)
        const castingScrollName = completionPayload?.scrollName || null;

        // Get all players (including self, but exclude Excavate-immune opponents)
        const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 1;
        const targets = [];
        for (let i = 0; i < numPlayers; i++) {
            // Allow self-targeting, but skip immune opponents
            if (i !== casterIndex && this.hasExcavateImmunity(i)) continue;
            targets.push(i);
        }

        if (targets.length === 0) {
            updateStatus('No players to target!');
            return;
        }

        // Step 1: Select target player
        this.showPlunderPlayerModal(targets, casterIndex, castingScrollName, (targetPlayerIndex) => {
            // Step 2: Get target's active scrolls
            if (!self.spellSystem) {
                updateStatus('Plunder: spell system unavailable.');
                return;
            }
            self.spellSystem.ensurePlayerScrollsStructure(targetPlayerIndex);
            const targetScrolls = self.spellSystem.playerScrolls[targetPlayerIndex];

            // Build plunderable list, excluding the scroll being cast if targeting self
            let activeScrollArray = targetScrolls ? Array.from(targetScrolls.active) : [];
            if (targetPlayerIndex === casterIndex && castingScrollName) {
                activeScrollArray = activeScrollArray.filter(s => s !== castingScrollName);
            }

            if (activeScrollArray.length === 0) {
                const name = (typeof playerPositions !== 'undefined' && playerPositions[targetPlayerIndex]?.username)
                    ? playerPositions[targetPlayerIndex].username
                    : `Player ${targetPlayerIndex + 1}`;
                updateStatus(`${name} has no active scrolls to plunder!`);
                // Still signal completion so scroll disposition happens
                if (completionPayload && self.spellSystem && typeof self.spellSystem.onSelectionEffectComplete === 'function') {
                    self.spellSystem.onSelectionEffectComplete(completionPayload.scrollName, completionPayload.effectName, completionPayload.spell);
                }
                return;
            }

            // Step 3: Show target's active scrolls for caster to choose
            self.showScrollSelectionModal(activeScrollArray, 'Select an active scroll to plunder:', (selectedScroll) => {
                // Remove from target's active area
                targetScrolls.active.delete(selectedScroll);

                // Discard to common area
                if (self.spellSystem.discardToCommonArea) {
                    self.spellSystem.discardToCommonArea(selectedScroll);
                }

                const scrollDef = self.spellSystem?.patterns?.[selectedScroll];
                const scrollDisplayName = scrollDef?.name || selectedScroll;
                const targetName = (typeof playerPositions !== 'undefined' && playerPositions[targetPlayerIndex]?.username)
                    ? playerPositions[targetPlayerIndex].username
                    : `Player ${targetPlayerIndex + 1}`;
                updateStatus(`Plunder! Sent ${scrollDisplayName} from ${targetName}'s active area to the common area.`);
                console.log(`🏴‍☠️ Plunder: moved ${selectedScroll} from player ${targetPlayerIndex}'s active to common area`);

                // Update UI
                if (self.spellSystem?.updateScrollCount) {
                    self.spellSystem.updateScrollCount();
                }
                if (typeof updateOpponentPanel === 'function') updateOpponentPanel();

                // Broadcast in multiplayer
                if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                    broadcastGameAction('scroll-plundered', {
                        casterIndex: casterIndex,
                        targetIndex: targetPlayerIndex,
                        scrollName: selectedScroll
                    });
                }

                if (typeof syncPlayerState === 'function') syncPlayerState();

                // Signal selection effect complete
                if (completionPayload && self.spellSystem && typeof self.spellSystem.onSelectionEffectComplete === 'function') {
                    self.spellSystem.onSelectionEffectComplete(completionPayload.scrollName, completionPayload.effectName, completionPayload.spell);
                }
            });
        });
    },

    // Plunder: player selection modal (allows targeting any player including self)
    showPlunderPlayerModal(targets, casterIndex, castingScrollName, onSelect) {
        const existing = document.getElementById('plunder-player-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'plunder-player-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #ff8c00',
            borderRadius: '10px',
            padding: '20px',
            color: 'white',
            minWidth: '200px'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Plunder: Select a target player';
        titleEl.style.marginBottom = '15px';
        titleEl.style.color = '#ff8c00';
        modal.appendChild(titleEl);

        targets.forEach(playerIdx => {
            const name = (typeof getPlayerColorName === 'function')
                ? getPlayerColorName(playerIdx)
                : (typeof playerPositions !== 'undefined' && playerPositions[playerIdx]?.username)
                    ? playerPositions[playerIdx].username
                    : `Player ${playerIdx + 1}`;

            // Get the player's hex color for styling
            const playerHexColor = (typeof playerPositions !== 'undefined' && playerPositions[playerIdx]?.color)
                ? playerPositions[playerIdx].color
                : '#ffffff';

            // Check if this player has plunderable active scrolls
            // Exclude the scroll being cast if this is the caster
            const sp = this.spellSystem;
            let activeCount = 0;
            if (sp) {
                sp.ensurePlayerScrollsStructure(playerIdx);
                const activeSet = sp.playerScrolls[playerIdx]?.active;
                if (activeSet) {
                    activeCount = activeSet.size;
                    if (playerIdx === casterIndex && castingScrollName && activeSet.has(castingScrollName)) {
                        activeCount--;
                    }
                }
            }

            const btn = document.createElement('button');
            btn.textContent = playerIdx === casterIndex ? `${name} (you) - ${activeCount} active` : `${name} - ${activeCount} active`;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '12px',
                margin: '6px 0',
                backgroundColor: activeCount > 0 ? '#2d2d44' : '#1a1a22',
                color: activeCount > 0 ? playerHexColor : '#666',
                border: activeCount > 0 ? `1px solid ${playerHexColor}` : '1px solid #333',
                borderRadius: '5px',
                cursor: activeCount > 0 ? 'pointer' : 'not-allowed',
                opacity: activeCount > 0 ? '1' : '0.5',
                fontSize: '14px',
                fontWeight: 'bold'
            });
            if (activeCount > 0) {
                btn.onmouseenter = () => btn.style.backgroundColor = '#3d3d54';
                btn.onmouseleave = () => btn.style.backgroundColor = '#2d2d44';
                btn.onclick = () => {
                    overlay.remove();
                    onSelect(playerIdx);
                };
            }
            modal.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        Object.assign(cancelBtn.style, {
            marginTop: '15px',
            padding: '10px 20px',
            backgroundColor: '#7f8c8d',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            width: '100%'
        });
        cancelBtn.onclick = () => overlay.remove();
        modal.appendChild(cancelBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    },

    // Check if water transformation buff is active (for Water V)
    hasWaterTransformation(playerIndex) {
        return this.activeBuffs.waterTransformation?.playerIndex === playerIndex;
    },

    // Check if Unbidden Lamplight is active (for Fire I)
    hasUnbiddenLamplight(casterIndex) {
        // Returns true if any OTHER player has lamplight active
        if (this.activeBuffs.unbiddenLamplight) {
            return this.activeBuffs.unbiddenLamplight.playerIndex !== casterIndex;
        }
        return false;
    },

    // Check if a player has Excavate immunity (cannot be targeted by scrolls)
    hasExcavateImmunity(playerIndex) {
        const buff = this.activeBuffs.excavate;
        return buff && buff.playerIndex === playerIndex;
    },

    // Clear Excavate immunity and trigger teleport option when a player's turn starts
    clearExcavateForPlayer(playerIndex) {
        const buff = this.activeBuffs.excavate;
        if (buff && buff.playerIndex === playerIndex) {
            delete this.activeBuffs.excavate;
            console.log(`⛏️ Excavate immunity cleared for player ${playerIndex}`);
        }
    },

    // Process Excavate teleport at start of turn (returns true if teleport is pending)
    processExcavateTeleport(playerIndex) {
        const buff = this.activeBuffs.excavateTeleport;
        if (!buff || buff.playerIndex !== playerIndex) return false;

        // Only trigger for the local player in multiplayer
        const localPlayer = (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof myPlayerIndex !== 'undefined')
            ? myPlayerIndex : (typeof activePlayerIndex !== 'undefined' ? activePlayerIndex : -1);
        if (playerIndex !== localPlayer) {
            // Not the local player — just clear the buff silently
            delete this.activeBuffs.excavateTeleport;
            return false;
        }

        delete this.activeBuffs.excavateTeleport;
        console.log(`⛏️ Excavate teleport available for player ${playerIndex}`);

        // Show teleport prompt modal
        this.showExcavateTeleportModal(playerIndex);
        return true;
    },

    // Excavate: modal asking if player wants to teleport
    showExcavateTeleportModal(playerIndex) {
        const self = this;

        const existing = document.getElementById('excavate-teleport-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'excavate-teleport-modal';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: '3000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#1a1a2e',
            border: '2px solid #8b4513',
            borderRadius: '10px',
            padding: '20px',
            color: 'white',
            minWidth: '280px',
            textAlign: 'center'
        });

        const titleEl = document.createElement('h3');
        titleEl.textContent = '⛏️ Excavate';
        titleEl.style.marginBottom = '10px';
        titleEl.style.color = '#8b4513';
        modal.appendChild(titleEl);

        const descEl = document.createElement('p');
        descEl.textContent = 'You emerge from the catacombs! You may teleport to any unoccupied hex on a revealed tile.';
        descEl.style.marginBottom = '15px';
        descEl.style.fontSize = '14px';
        modal.appendChild(descEl);

        const teleportBtn = document.createElement('button');
        teleportBtn.textContent = 'Teleport';
        Object.assign(teleportBtn.style, {
            display: 'block',
            width: '100%',
            padding: '12px',
            margin: '8px 0',
            backgroundColor: '#2d2d44',
            color: '#8b4513',
            border: '2px solid #8b4513',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
        });
        teleportBtn.onmouseenter = () => teleportBtn.style.backgroundColor = '#3d3d54';
        teleportBtn.onmouseleave = () => teleportBtn.style.backgroundColor = '#2d2d44';
        teleportBtn.onclick = () => {
            overlay.remove();
            self.enterExcavateTeleportMode(playerIndex);
        };
        modal.appendChild(teleportBtn);

        const stayBtn = document.createElement('button');
        stayBtn.textContent = 'Stay Here';
        Object.assign(stayBtn.style, {
            display: 'block',
            width: '100%',
            padding: '12px',
            margin: '8px 0',
            backgroundColor: '#2d2d44',
            color: '#999',
            border: '1px solid #555',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px'
        });
        stayBtn.onmouseenter = () => stayBtn.style.backgroundColor = '#3d3d54';
        stayBtn.onmouseleave = () => stayBtn.style.backgroundColor = '#2d2d44';
        stayBtn.onclick = () => {
            overlay.remove();
            updateStatus('Your turn begins!');
        };
        modal.appendChild(stayBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    },

    // Excavate: hex selection for teleport at start of turn
    enterExcavateTeleportMode(playerIndex) {
        const self = this;

        updateStatus('Excavate: Click any unoccupied hex on a revealed tile to teleport there.');

        this.selectionMode = {
            type: 'excavate-teleport',
            casterIndex: playerIndex,

            handleHexClick(hexPos) {
                const destX = hexPos.x;
                const destY = hexPos.y;

                // Check hex is on at least one revealed (non-player) tile
                const hasRevealedTile = hexPos.tiles && hexPos.tiles.some(t => !t.flipped && !t.isPlayerTile);
                if (!hasRevealedTile) {
                    updateStatus('Cannot teleport there - not on a revealed tile!');
                    return;
                }

                // Check not occupied by a stone
                const hasStone = (typeof placedStones !== 'undefined') && placedStones.some(s => {
                    const dist = Math.sqrt(Math.pow(s.x - destX, 2) + Math.pow(s.y - destY, 2));
                    return dist < 5;
                });
                if (hasStone) {
                    updateStatus('Cannot teleport there - a stone is on that space!');
                    return;
                }

                // Check not occupied by a player
                const hasPlayer = (typeof playerPositions !== 'undefined') && playerPositions.some(p => {
                    if (!p) return false;
                    const dist = Math.sqrt(Math.pow(p.x - destX, 2) + Math.pow(p.y - destY, 2));
                    return dist < 5;
                });
                if (hasPlayer) {
                    updateStatus('Cannot teleport there - a player is on that space!');
                    return;
                }

                // Teleport the player
                if (typeof placePlayer === 'function') {
                    placePlayer(destX, destY);
                }

                updateStatus(`Excavate: Teleported! Your turn begins.`);
                console.log(`⛏️ Excavate teleport: player ${playerIndex} to (${destX.toFixed(1)}, ${destY.toFixed(1)})`);

                // Broadcast in multiplayer
                if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                    broadcastGameAction('excavate-teleport', {
                        playerIndex: playerIndex,
                        x: destX,
                        y: destY
                    });
                }

                if (typeof syncPlayerState === 'function') syncPlayerState();

                self.selectionMode = null;
            },

            cleanup() {
                // No cancel button to clean up
            }
        };
    }
};

// Export for use
if (typeof window !== 'undefined') {
    window.ScrollEffects = ScrollEffects;
}
