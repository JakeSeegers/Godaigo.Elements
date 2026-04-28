        // ========================================
        // GAME CONSTANTS
        // ========================================
        const TILE_SIZE = 20;
        const SNAP_THRESHOLD = 40;
        const STONE_SIZE = 12;

        // Cache-bust token for image assets — bump when replacing an image file
        window.IMG_V = '?v=2';
        const IMG_V = window.IMG_V;

        const STONE_TYPES = {
            earth:    { color: '#69d83a', symbol: '▲', img: 'images/mountainsymbol.png' + IMG_V },
            water:    { color: '#5894f4', symbol: '◯', img: 'images/watersymbol.png'    + IMG_V },
            fire:     { color: '#ed1b43', symbol: '♦', img: 'images/firesymbol.png'     + IMG_V },
            wind:     { color: '#ffce00', symbol: '≋', img: 'images/windsymbol.png'     + IMG_V },
            void:     { color: '#9458f4', symbol: '✺', img: 'images/voidsymbol.png'     + IMG_V },
            catacomb: { color: '#c8a870', symbol: '✦', img: 'images/Catacomb.png'       + IMG_V }
        };

        // Spell System for pattern-based stone generation
        class SpellSystem {
            constructor() {
                this.SPELL_AP_COST = 2;

                // Per-player scroll inventories: { hand: Set, active: Set, activated: Set }
                // hand = scrolls in player's hand (private, max 4)
                // active = scrolls in active area (visible to opponents: name + element only, max 2)
                // activated = elements that have been used for win condition tracking
                this.playerScrolls = [];
                this.MAX_HAND_SIZE = 2;
                this.MAX_ACTIVE_SIZE = 2;

                // Common area - shared scrolls any player can activate
                // Max 1 scroll per element type. When a new scroll of same element enters,
                // the old one goes to bottom of deck
                this.commonArea = {
                    earth: null,
                    water: null,
                    fire: null,
                    wind: null,
                    void: null,
                    catacomb: null
                };

                // Scroll decks - use external definitions if available, otherwise use defaults
                if (typeof SCROLL_DECKS !== 'undefined') {
                    // Deep copy the external deck definitions
                    this.scrollDecks = {};
                    Object.keys(SCROLL_DECKS).forEach(element => {
                        this.scrollDecks[element] = [...SCROLL_DECKS[element]];
                    });
                } else {
                    // Fallback to inline definitions
                    this.scrollDecks = {
                        earth: ['EARTH_SCROLL_1', 'EARTH_SCROLL_2', 'EARTH_SCROLL_3', 'EARTH_SCROLL_4', 'EARTH_SCROLL_5'],
                        water: ['WATER_SCROLL_1', 'WATER_SCROLL_2', 'WATER_SCROLL_3', 'WATER_SCROLL_4', 'WATER_SCROLL_5'],
                        fire: ['FIRE_SCROLL_1', 'FIRE_SCROLL_2', 'FIRE_SCROLL_3', 'FIRE_SCROLL_4', 'FIRE_SCROLL_5'],
                        wind: ['WIND_SCROLL_1', 'WIND_SCROLL_2', 'WIND_SCROLL_3', 'WIND_SCROLL_4', 'WIND_SCROLL_5'],
                        void: ['VOID_SCROLL_1', 'VOID_SCROLL_2', 'VOID_SCROLL_3', 'VOID_SCROLL_4', 'VOID_SCROLL_5'],
                        catacomb: ['CATACOMB_SCROLL_1', 'CATACOMB_SCROLL_2', 'CATACOMB_SCROLL_3', 'CATACOMB_SCROLL_4', 'CATACOMB_SCROLL_5', 'CATACOMB_SCROLL_6', 'CATACOMB_SCROLL_7', 'CATACOMB_SCROLL_8', 'CATACOMB_SCROLL_9', 'CATACOMB_SCROLL_10']
                    };
                }

                // Shuffle all decks at initialization
                this.shuffleAllDecks();

                this.initializePatterns();
                this.updateScrollCount();

                // Initialize response window system
                this.responseWindow = null;
                if (typeof ResponseWindowSystem !== 'undefined') {
                    this.responseWindow = new ResponseWindowSystem(this);
                    console.log('Response window system initialized');
                }

                // Initialize scroll effects system (use window.ScrollEffects – set by scroll-effects.js)
                this.scrollEffects = null;
                const SE = (typeof window !== 'undefined' && window.ScrollEffects) || (typeof ScrollEffects !== 'undefined' && ScrollEffects);
                if (SE) {
                    SE.init(this);
                    this.scrollEffects = SE;
                    console.log('Scroll effects system initialized');
                }

                // Pending cascade state - blocks all actions until resolved
                // Stored per player: { playerIndex: { scrollName, scrollInfo, shrineType, canCascadeToActive } }
                this.pendingCascades = {};
            }

            // Check if a player has a pending cascade that must be resolved
            hasPendingCascade(playerIndex) {
                return !!this.pendingCascades[playerIndex];
            }

            // Get the pending cascade for a player
            getPendingCascade(playerIndex) {
                return this.pendingCascades[playerIndex] || null;
            }

            // Set a pending cascade for a player
            setPendingCascade(playerIndex, cascadeData) {
                this.pendingCascades[playerIndex] = cascadeData;
                console.log(`📜 Pending cascade set for player ${playerIndex}:`, cascadeData?.scrollName);
            }

            // Clear a pending cascade for a player
            clearPendingCascade(playerIndex) {
                delete this.pendingCascades[playerIndex];
                console.log(`📜 Pending cascade cleared for player ${playerIndex}`);
            }

            // Show the cascade prompt for a player (used when they try to take an action with pending cascade)
            showPendingCascadePrompt(playerIndex) {
                const cascade = this.pendingCascades[playerIndex];
                if (!cascade) return false;

                this.showCascadePrompt(
                    cascade.scrollName,
                    cascade.scrollInfo,
                    cascade.shrineType,
                    cascade.canCascadeToActive
                );
                return true;
            }

            // Fisher-Yates shuffle algorithm
            shuffleDeck(deck) {
                for (let i = deck.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [deck[i], deck[j]] = [deck[j], deck[i]];
                }
                return deck;
            }

            shuffleAllDecks() {
                Object.keys(this.scrollDecks).forEach(element => {
                    this.shuffleDeck(this.scrollDecks[element]);
                });
                console.log('🎴 All scroll decks shuffled');
            }

            // Draw a scroll from the top of a specific element's deck
            drawFromDeck(element) {
                if (!this.scrollDecks[element] || this.scrollDecks[element].length === 0) {
                    return null;
                }
                return this.scrollDecks[element].shift(); // Remove and return first element
            }

            // Discard a scroll to the common area
            // If a scroll of the same element is already there, it goes to bottom of deck
            discardToCommonArea(scrollName) {
                const element = this.getScrollElement(scrollName);
                if (!element) return;

                let replacedScroll = null;

                // If there's already a scroll of this element in common area, send it to deck
                // Guard: don't push to deck if it's the same scroll being discarded (avoids duplicates)
                if (this.commonArea[element] && this.commonArea[element] !== scrollName) {
                    replacedScroll = this.commonArea[element];
                    this.scrollDecks[element].push(replacedScroll); // Add old scroll to bottom of deck
                    console.log(`📜 Common area: Replaced ${replacedScroll} with ${scrollName} (old scroll to deck)`);
                } else {
                    console.log(`📜 Common area: Added ${scrollName}`);
                }

                // Place new scroll in common area
                this.commonArea[element] = scrollName;

                // Update the scroll deck UI
                try {
                    if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
                } catch (e) {}

                // Broadcast in multiplayer
                if (isMultiplayer) {
                    broadcastGameAction('common-area-update', {
                        element: element,
                        scrollName: scrollName,
                        replacedScroll: replacedScroll
                    });
                }
            }

            // Direct discard to deck (used internally, not for player discards)
            discardToDeck(scrollName) {
                const element = this.getScrollElement(scrollName);
                if (element && this.scrollDecks[element]) {
                    this.scrollDecks[element].push(scrollName); // Add to end of deck
                    console.log(`📜 Discarded ${scrollName} to bottom of ${element} deck`);

                    // Update the scroll deck UI
                    try {
                        if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
                    } catch (e) {}
                }
            }

            // Get all scrolls in common area (returns array of scroll names)
            getCommonAreaScrolls() {
                return Object.values(this.commonArea).filter(scroll => scroll !== null);
            }

            // Get the element type from a scroll name
            getScrollElement(scrollName) {
                if (scrollName.startsWith('EARTH')) return 'earth';
                if (scrollName.startsWith('WATER')) return 'water';
                if (scrollName.startsWith('FIRE')) return 'fire';
                if (scrollName.startsWith('WIND')) return 'wind';
                if (scrollName.startsWith('VOID')) return 'void';
                if (scrollName.startsWith('CATACOMB')) return 'catacomb';
                return null;
            }
            
            // Get active player's scroll collection
            // In multiplayer, show MY scrolls for display, but use activePlayerIndex for game logic
            getPlayerScrolls(forDisplay = false) {
                // For display in multiplayer, show my own scrolls
                const displayIndex = (forDisplay && isMultiplayer && myPlayerIndex !== null) ? myPlayerIndex : activePlayerIndex;

                this.ensurePlayerScrollsStructure(displayIndex);
                return this.playerScrolls[displayIndex];
            }

            // Reinforce scroll state: ensure hand/active/activated are Sets (prevents "disappearing" from bad state)
            ensurePlayerScrollsStructure(playerIndex) {
                if (playerIndex == null || playerIndex < 0) return;
                if (!this.playerScrolls[playerIndex]) {
                    this.playerScrolls[playerIndex] = {
                        hand: new Set(),
                        active: new Set(),
                        activated: new Set()
                    };
                    return;
                }
                const p = this.playerScrolls[playerIndex];
                if (!(p.hand instanceof Set)) p.hand = new Set(Array.isArray(p.hand) ? p.hand : []);
                if (!(p.active instanceof Set)) p.active = new Set(Array.isArray(p.active) ? p.active : []);
                if (!(p.activated instanceof Set)) p.activated = new Set(Array.isArray(p.activated) ? p.activated : []);
            }

            // Validate scroll state and log warnings (helps catch sync bugs)
            validateScrollState() {
                const n = typeof totalPlayers !== 'undefined' ? totalPlayers : Math.max(2, (this.playerScrolls && this.playerScrolls.length) || 0);
                for (let i = 0; i < n; i++) {
                    this.ensurePlayerScrollsStructure(i);
                }
                const inHand = new Map();
                const inActive = new Map();
                let errorsFound = false;

                for (let i = 0; i < (this.playerScrolls && this.playerScrolls.length) || 0; i++) {
                    const p = this.playerScrolls[i];
                    if (!p || !p.hand || !p.active) continue;
                    p.hand.forEach(name => {
                        if (inHand.has(name)) {
                            console.warn('[Scroll state] ⚠️ DUPLICATE:', name, 'in hand of both player', inHand.get(name), 'and', i);
                            errorsFound = true;
                        }
                        inHand.set(name, i);
                    });
                    p.active.forEach(name => {
                        if (inActive.has(name)) {
                            console.warn('[Scroll state] ⚠️ DUPLICATE:', name, 'in active of both player', inActive.get(name), 'and', i);
                            errorsFound = true;
                        }
                        if (inHand.has(name)) {
                            console.warn('[Scroll state] ⚠️ DUPLICATE:', name, 'in both hand and active areas');
                            errorsFound = true;
                        }
                        inActive.set(name, i);
                    });
                }
                const commonElements = ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'];
                commonElements.forEach(element => {
                    const name = this.commonArea[element];
                    if (!name) return;
                    if (inHand.has(name)) {
                        console.warn('[Scroll state] ⚠️ DUPLICATE:', name, 'in common area (' + element + ') and in hand of player', inHand.get(name));
                        errorsFound = true;
                    }
                    if (inActive.has(name)) {
                        console.warn('[Scroll state] ⚠️ DUPLICATE:', name, 'in common area (' + element + ') and in active of player', inActive.get(name));
                        errorsFound = true;
                    }
                });

                // If errors found in multiplayer and we're not the host, request sync
                if (errorsFound && typeof isMultiplayer !== 'undefined' && isMultiplayer) {
                    console.warn('⚠️ Scroll state errors detected! Requesting sync from host...');
                    if (typeof broadcastGameAction === 'function' && typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== 0) {
                        broadcastGameAction('scroll-state-sync-request', { playerIndex: myPlayerIndex });
                    }
                }

                return errorsFound;
            }

            // Generate complete scroll state snapshot for syncing
            getScrollStateSnapshot() {
                const snapshot = {
                    players: [],
                    commonArea: {},
                    decks: {}
                };

                // Capture each player's scrolls
                for (let i = 0; i < this.playerScrolls.length; i++) {
                    const p = this.playerScrolls[i];
                    if (!p) continue;
                    snapshot.players[i] = {
                        hand: Array.from(p.hand || []),
                        active: Array.from(p.active || []),
                        activated: Array.from(p.activated || [])
                    };
                }

                // Capture common area
                ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'].forEach(element => {
                    snapshot.commonArea[element] = this.commonArea[element] || null;
                });

                // Capture full decks (host is authoritative, clients should match exactly)
                Object.keys(this.scrollDecks || {}).forEach(element => {
                    snapshot.decks[element] = [...(this.scrollDecks[element] || [])];
                });

                return snapshot;
            }

            // Apply scroll state snapshot from authoritative source
            applyScrollStateSnapshot(snapshot) {
                let corrected = false;
                const activatedChangedPlayers = [];

                // Apply player scrolls
                if (snapshot.players) {
                    for (let i = 0; i < snapshot.players.length; i++) {
                        if (!snapshot.players[i]) continue;
                        this.ensurePlayerScrollsStructure(i);
                        const p = this.playerScrolls[i];
                        const snap = snapshot.players[i];

                        // Sync hand
                        const newHand = new Set(snap.hand || []);
                        if (!this.setsEqual(p.hand, newHand)) {
                            console.log(`🔄 Player ${i} hand corrected:`, Array.from(p.hand), '→', Array.from(newHand));
                            p.hand = newHand;
                            corrected = true;
                        }

                        // Sync active
                        const newActive = new Set(snap.active || []);
                        if (!this.setsEqual(p.active, newActive)) {
                            console.log(`🔄 Player ${i} active corrected:`, Array.from(p.active), '→', Array.from(newActive));
                            p.active = newActive;
                            corrected = true;
                        }

                        // Sync activated (win condition tracking) - additive only.
                        // Never remove locally-tracked activations: a non-host player may have
                        // pre-tracked an element during an interactive scroll (e.g. Take Flight)
                        // before the host's periodic sync fires, which would otherwise wipe it.
                        const newActivated = new Set(snap.activated || []);
                        const prevActivatedSize = p.activated.size;
                        newActivated.forEach(el => p.activated.add(el));
                        if (p.activated.size !== prevActivatedSize) {
                            console.log(`🔄 Player ${i} activated updated (additive):`, Array.from(newActivated), '→', Array.from(p.activated));
                            corrected = true;
                            activatedChangedPlayers.push(i);
                        }
                    }
                }

                // Apply common area
                if (snapshot.commonArea) {
                    // Build a set of scrolls already in players' hands/active areas locally.
                    // If a scroll is here, the player just drew/played it and the host's
                    // periodic broadcast is stale — don't put it back in the common area.
                    const inLocalPlay = new Set();
                    for (const p of this.playerScrolls) {
                        if (!p) continue;
                        p.hand.forEach(s => inLocalPlay.add(s));
                        p.active.forEach(s => inLocalPlay.add(s));
                    }

                    ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'].forEach(element => {
                        const newScroll = snapshot.commonArea[element] || null;
                        if (newScroll && inLocalPlay.has(newScroll)) {
                            // Host state is stale — this scroll was already drawn by a player
                            console.log(`[sync] Skipping common area restore for ${element}: ${newScroll} is already in local play`);
                            return;
                        }
                        if (this.commonArea[element] !== newScroll) {
                            console.log(`🔄 Common area ${element} corrected:`, this.commonArea[element], '→', newScroll);
                            this.commonArea[element] = newScroll;
                            corrected = true;
                        }
                    });
                }

                // Apply decks (sync full deck contents from host)
                if (snapshot.decks) {
                    Object.keys(snapshot.decks).forEach(element => {
                        const newDeck = snapshot.decks[element] || [];
                        const currentDeck = this.scrollDecks[element] || [];

                        // Compare deck contents (order matters for deck draw)
                        if (!this.arraysEqual(currentDeck, newDeck)) {
                            console.log(`🔄 ${element} deck corrected: ${currentDeck.length} scrolls → ${newDeck.length} scrolls`);
                            this.scrollDecks[element] = [...newDeck];
                            corrected = true;
                        }
                    });
                }

                if (corrected) {
                    // Only update UI and validate, no console spam
                    this.validateScrollState();
                    this.updateScrollCount();
                    if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI();
                    if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
                    // Refresh win-condition markers and check win condition for any player
                    // whose activated set gained elements via this sync
                    if (typeof updatePlayerElementSymbols === 'function') {
                        activatedChangedPlayers.forEach(playerIdx => {
                            updatePlayerElementSymbols(playerIdx);
                            // Win condition: all 5 elements activated
                            if (this.playerScrolls?.[playerIdx]?.activated?.size === 5) {
                                console.log(`🏆 Win condition met for player ${playerIdx} (detected via state sync)`);
                                this.showLevelComplete(playerIdx);
                                if (typeof isMultiplayer !== 'undefined' && isMultiplayer &&
                                    typeof handleGameOver === 'function') {
                                    handleGameOver(playerIdx);
                                }
                            }
                        });
                    }
                }

                return corrected;
            }

            // Helper: compare two sets for equality
            setsEqual(set1, set2) {
                if (set1.size !== set2.size) return false;
                for (const item of set1) {
                    if (!set2.has(item)) return false;
                }
                return true;
            }

            // Helper: compare two arrays for equality (order matters)
            arraysEqual(arr1, arr2) {
                if (arr1.length !== arr2.length) return false;
                for (let i = 0; i < arr1.length; i++) {
                    if (arr1[i] !== arr2[i]) return false;
                }
                return true;
            }

            // Comprehensive scroll audit - finds ALL scrolls and reports discrepancies
            auditScrolls() {
                const allScrolls = new Map(); // scrollName -> locations[]
                const issues = [];

                // Count scrolls in each location
                const countScroll = (scrollName, location) => {
                    if (!scrollName) return;
                    if (!allScrolls.has(scrollName)) {
                        allScrolls.set(scrollName, []);
                    }
                    allScrolls.get(scrollName).push(location);
                };

                // Check player hands and active areas
                for (let i = 0; i < (this.playerScrolls?.length || 0); i++) {
                    const p = this.playerScrolls[i];
                    if (!p) continue;
                    const playerName = typeof getPlayerColorName === 'function' ? getPlayerColorName(i) : `Player ${i}`;

                    (p.hand || new Set()).forEach(scroll => countScroll(scroll, `${playerName} hand`));
                    (p.active || new Set()).forEach(scroll => countScroll(scroll, `${playerName} active`));
                }

                // Check common area
                ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'].forEach(element => {
                    const scroll = this.commonArea[element];
                    if (scroll) countScroll(scroll, `Common (${element})`);
                });

                // Check decks
                Object.keys(this.scrollDecks || {}).forEach(element => {
                    (this.scrollDecks[element] || []).forEach(scroll => {
                        countScroll(scroll, `${element} deck`);
                    });
                });

                // Analyze results
                console.log('\n🔍 SCROLL AUDIT REPORT\n');

                let duplicates = 0;
                allScrolls.forEach((locations, scrollName) => {
                    if (locations.length > 1) {
                        console.warn(`⚠️  DUPLICATE: ${scrollName} exists in ${locations.length} locations:`, locations);
                        issues.push({ scroll: scrollName, issue: 'duplicate', locations });
                        duplicates++;
                    }
                });

                if (duplicates === 0) {
                    console.log('✅ No duplicates found');
                } else {
                    console.warn(`⚠️  Found ${duplicates} duplicated scrolls!`);
                }

                // Count total scrolls by element
                const elementCounts = { earth: 0, water: 0, fire: 0, wind: 0, void: 0, catacomb: 0 };
                allScrolls.forEach((locations, scrollName) => {
                    const element = this.getScrollElement(scrollName);
                    if (element && elementCounts.hasOwnProperty(element)) {
                        elementCounts[element] += locations.length; // Count all instances (including duplicates)
                    }
                });

                console.log('\n📊 Total Scroll Counts (across all locations):');
                Object.entries(elementCounts).forEach(([element, count]) => {
                    console.log(`  ${element}: ${count} scrolls found`);
                });

                console.log('\n');

                return { issues, elementCounts, allScrolls };
            }

            // Compatibility getters for existing code
            // collectedScrolls now returns both hand AND active scrolls combined
            get collectedScrolls() {
                const scrolls = this.getPlayerScrolls(true);
                const combined = new Set([...scrolls.hand, ...scrolls.active]);
                return combined;
            }

            get activatedScrollTypes() {
                return this.getPlayerScrolls(true).activated;
            }

            // Get scrolls in hand only
            get handScrolls() {
                return this.getPlayerScrolls(true).hand;
            }

            // Get scrolls in active area only
            get activeScrolls() {
                return this.getPlayerScrolls(true).active;
            }

            // Move scroll from hand to active area (0 AP cost)
            moveToActive(scrollName) {
                const scrolls = this.getPlayerScrolls(false); // Use active player for game logic

                // Check active area limit
                if (scrolls.active.size >= this.MAX_ACTIVE_SIZE) {
                    updateStatus(`Active area full! Max ${this.MAX_ACTIVE_SIZE} scrolls. Move one to active or common area first.`);
                    return false;
                }

                if (scrolls.hand.has(scrollName)) {
                    scrolls.hand.delete(scrollName);
                    scrolls.active.add(scrollName);
                    console.log(`📜 Moved ${scrollName} to active area`);
                    this.updateScrollCount();

                    // Broadcast in multiplayer
                    if (isMultiplayer) {
                        broadcastGameAction('scroll-move', {
                            playerIndex: activePlayerIndex,
                            scrollName: scrollName,
                            toLocation: 'active'
                        });
                    }
                    return true;
                }
                return false;
            }

            // Move scroll from active area back to hand - DISABLED
            // Scrolls cannot be returned to hand once placed in active area
            moveToHand(scrollName) {
                // Per game rules, scrolls cannot be moved back to hand once in active area
                updateStatus(`Scrolls cannot be returned to hand! Discard to Common Area instead.`);
                return false;
            }

            // Discard a scroll from hand or active area to common area
            discardScroll(scrollName) {
                const scrolls = this.getPlayerScrolls(false);
                let removed = false;

                if (scrolls.hand.has(scrollName)) {
                    scrolls.hand.delete(scrollName);
                    removed = true;
                } else if (scrolls.active.has(scrollName)) {
                    scrolls.active.delete(scrollName);
                    removed = true;
                }

                if (removed) {
                    // Send to common area instead of deck
                    this.discardToCommonArea(scrollName);
                    this.updateScrollCount();
                    try {
                        if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI();
                    } catch (e) {}

                    // Broadcast in multiplayer
                    if (isMultiplayer) {
                        broadcastGameAction('scroll-discard', {
                            playerIndex: activePlayerIndex,
                            scrollName: scrollName
                        });
                    }
                    return true;
                }
                return false;
            }

            initializePatterns() {
                // Use external scroll definitions if available
                if (typeof SCROLL_DEFINITIONS !== 'undefined') {
                    this.patterns = SCROLL_DEFINITIONS;
                    console.log('📜 Loaded scroll definitions from external file');
                    return;
                }

                // Fallback to inline definitions
                console.log('📜 Using inline scroll definitions (external file not loaded)');

                // Corrected patterns from user's visual editor
                const level1Patterns = [
                    [{ q: 0, r: -1 }, { q: 0, r: 1 }],
                    [{ q: 1, r: -1 }, { q: -1, r: 1 }],
                    [{ q: 1, r: 0 }, { q: -1, r: 0 }]
                ];

                const level2Patterns = [
                    [{ q: -1, r: -1 }, { q: 1, r: 1 }],
                    [{ q: 1, r: -2 }, { q: -1, r: 2 }],
                    [{ q: 2, r: -1 }, { q: -2, r: 1 }]
                ];

                const level3Patterns = [
                    [{ q: 1, r: -1 }, { q: -1, r: 0 }, { q: 0, r: 1 }],
                    [{ q: 0, r: -1 }, { q: 1, r: 0 }, { q: -1, r: 1 }]
                ];

                const level4Patterns = [
                    [{ q: 1, r: -2 }, { q: -2, r: 1 }, { q: 1, r: 1 }],
                    [{ q: -1, r: -1 }, { q: 2, r: -1 }, { q: -1, r: 2 }]
                ];

                const level5Patterns = [
                    [{ q: 0, r: -1 }, { q: 0, r: 1 }, { q: 2, r: -1 }, { q: -2, r: 1 }],
                    [{ q: 1, r: -1 }, { q: -1, r: 1 }, { q: -1, r: -1 }, { q: 1, r: 1 }],
                    [{ q: 1, r: 0 }, { q: -1, r: 0 }, { q: 1, r: -2 }, { q: -1, r: 2 }]
                ];

                this.patterns = {};
                const elementTypes = ['earth', 'water', 'fire', 'wind', 'void'];

                elementTypes.forEach(element => {
                    [level1Patterns, level2Patterns, level3Patterns, level4Patterns, level5Patterns].forEach((patterns, level) => {
                        const scrollName = `${element.toUpperCase()}_SCROLL_${level + 1}`;
                        this.patterns[scrollName] = {
                            name: `${element.charAt(0).toUpperCase() + element.slice(1)} Scroll ${toRoman(level + 1)}`,
                            description: `Stand in pattern to gain +${level + 1} ${element} stones (2 AP)`,
                            level: level + 1,
                            element: element,
                            patterns: patterns.map(pattern =>
                                pattern.map(pos => ({ ...pos, type: element }))
                            ),
                            // Earth II can counter any scroll
                            canCounter: (element === 'earth' && level === 1) ? 'any' : null
                        };
                    });
                });

                // Add catacomb scrolls (multi-element patterns)
                // Each gets 3 rotational variations like level 2 scrolls
                const catacombBase = {
                    CATACOMB_SCROLL_1: [
                        { q: -1, r: -1, type: "water" },
                        { q: 1, r: 1, type: "water" },
                        { q: 1, r: -2, type: "earth" },
                        { q: -1, r: 2, type: "earth" }
                    ],
                    CATACOMB_SCROLL_2: [
                        { q: -1, r: -1, type: "earth" },
                        { q: 1, r: 1, type: "earth" },
                        { q: 1, r: -2, type: "fire" },
                        { q: -1, r: 2, type: "fire" }
                    ],
                    CATACOMB_SCROLL_3: [
                        { q: -1, r: -1, type: "wind" },
                        { q: 1, r: 1, type: "wind" },
                        { q: 1, r: -2, type: "earth" },
                        { q: -1, r: 2, type: "earth" }
                    ],
                    CATACOMB_SCROLL_4: [
                        { q: -1, r: -1, type: "void" },
                        { q: 1, r: 1, type: "void" },
                        { q: 1, r: -2, type: "earth" },
                        { q: -1, r: 2, type: "earth" }
                    ],
                    CATACOMB_SCROLL_5: [
                        { q: -1, r: -1, type: "water" },
                        { q: 1, r: 1, type: "water" },
                        { q: 1, r: -2, type: "fire" },
                        { q: -1, r: 2, type: "fire" }
                    ],
                    CATACOMB_SCROLL_6: [
                        { q: -1, r: -1, type: "wind" },
                        { q: 1, r: 1, type: "wind" },
                        { q: 1, r: -2, type: "water" },
                        { q: -1, r: 2, type: "water" }
                    ],
                    CATACOMB_SCROLL_7: [
                        { q: -1, r: -1, type: "void" },
                        { q: 1, r: 1, type: "void" },
                        { q: 1, r: -2, type: "water" },
                        { q: -1, r: 2, type: "water" }
                    ],
                    CATACOMB_SCROLL_8: [
                        { q: -1, r: -1, type: "fire" },
                        { q: 1, r: 1, type: "fire" },
                        { q: 1, r: -2, type: "wind" },
                        { q: -1, r: 2, type: "wind" }
                    ],
                    CATACOMB_SCROLL_9: [
                        { q: -1, r: -1, type: "void" },
                        { q: 1, r: 1, type: "void" },
                        { q: 1, r: -2, type: "wind" },
                        { q: -1, r: 2, type: "wind" }
                    ],
                    CATACOMB_SCROLL_10: [
                        { q: -1, r: -1, type: "fire" },
                        { q: 1, r: 1, type: "fire" },
                        { q: 1, r: -2, type: "void" },
                        { q: -1, r: 2, type: "void" }
                    ]
                };

                // Generate 3 rotational variations for each catacomb scroll
                Object.entries(catacombBase).forEach(([scrollName, basePattern]) => {
                    const scrollNum = parseInt(scrollName.split('_')[2]);

                    // Helper function to rotate hex coordinate by 60 degrees
                    const rotateHex = (q, r, steps) => {
                        // Rotate counter-clockwise by steps * 60 degrees
                        let nq = q, nr = r;
                        for (let i = 0; i < steps; i++) {
                            const tempQ = nq;
                            nq = -nr;
                            nr = -(-tempQ - nr);
                        }
                        return { q: nq, r: nr };
                    };

                    // Create 3 rotational variations (0°, 120°, 240°)
                    const variations = [
                        basePattern, // 0° rotation
                        basePattern.map(pos => ({ // 120° rotation (2 steps)
                            ...rotateHex(pos.q, pos.r, 2),
                            type: pos.type
                        })),
                        basePattern.map(pos => ({ // 240° rotation (4 steps)
                            ...rotateHex(pos.q, pos.r, 4),
                            type: pos.type
                        }))
                    ];

                    this.patterns[scrollName] = {
                        name: `Catacomb Scroll ${scrollNum}`,
                        description: `Multi-element pattern: gain +2 of each stone type (2 AP)`,
                        level: 2,
                        element: 'catacomb',
                        patterns: variations
                    };
                });
            }

            onTileRevealed(shrineType) {
                if (shrineType === 'player') return null;
                if (!this.scrollDecks[shrineType] || this.scrollDecks[shrineType].length === 0) {
                    return null;
                }

                // Draw from top of the element's deck
                const selected = this.drawFromDeck(shrineType);
                if (!selected) return null;

                const scrolls = this.getPlayerScrolls(false);
                const scrollInfo = this.patterns[selected];

                // Always add to hand immediately so the player can still act this turn.
                // If the hand now exceeds the limit the end-of-turn overflow modal will
                // prompt for a cascade before the turn advances.
                scrolls.hand.add(selected);
                this.updateScrollCount();

                // Broadcast scroll collection in multiplayer
                if (isMultiplayer) {
                    broadcastGameAction('scroll-collected', {
                        playerIndex: activePlayerIndex,
                        scrollName: selected,
                        shrineType: shrineType
                    });
                }

                if (scrolls.hand.size > this.MAX_HAND_SIZE) {
                    // Over limit — remind the player they must cascade before ending their turn
                    updateStatus(`Picked up "${scrollInfo?.name || selected}" — hand is over the limit. Cascade a scroll before ending your turn!`);
                } else {
                    this.showScrollNotification(scrollInfo, shrineType);
                }

                return scrollInfo;
            }

            // Show cascade prompt when hand is full
            // canCascadeToActive: true = Active area has room, false = must go to Common Area
            showCascadePrompt(newScrollName, newScrollInfo, shrineType, canCascadeToActive) {
                // Store as pending cascade so it blocks actions and can be re-shown
                const playerIdx = isMultiplayer ? myPlayerIndex : activePlayerIndex;
                this.setPendingCascade(playerIdx, {
                    scrollName: newScrollName,
                    scrollInfo: newScrollInfo,
                    shrineType: shrineType,
                    canCascadeToActive: canCascadeToActive
                });

                // Create overlay backdrop (prevents clicking elsewhere)
                const overlay = document.createElement('div');
                overlay.id = 'cascade-overlay';
                Object.assign(overlay.style, {
                    position: 'fixed',
                    top: '0', left: '0', right: '0', bottom: '0',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    zIndex: '1001'
                });

                const popup = document.createElement('div');
                popup.id = 'cascade-popup';
                Object.assign(popup.style, {
                    position: 'fixed', left: '50%', top: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: '#2c3e50', padding: '20px',
                    borderRadius: '10px', boxShadow: '0 0 20px rgba(0,0,0,0.5)',
                    zIndex: '1002', minWidth: '400px', maxWidth: '600px',
                    maxHeight: '80vh', overflowY: 'auto', color: 'white'
                });

                const title = document.createElement('h2');
                title.textContent = canCascadeToActive
                    ? 'Hand Full! Cascade a Scroll'
                    : 'All Slots Full! Cascade to Common Area';
                title.style.textAlign = 'center';
                title.style.color = canCascadeToActive ? '#f39c12' : '#e74c3c';
                title.style.marginTop = '0';
                popup.appendChild(title);

                const subtitle = document.createElement('p');
                if (canCascadeToActive) {
                    subtitle.innerHTML = `You found "<strong>${newScrollInfo.name}</strong>" but your hand is full (${this.MAX_HAND_SIZE}/${this.MAX_HAND_SIZE}).<br>Choose a scroll to cascade to your <strong>Active Area</strong> or <strong>Common Area</strong>:`;
                } else {
                    subtitle.innerHTML = `You found "<strong>${newScrollInfo.name}</strong>" but hand (${this.MAX_HAND_SIZE}/${this.MAX_HAND_SIZE}) and active (${this.MAX_ACTIVE_SIZE}/${this.MAX_ACTIVE_SIZE}) are full.<br>Choose a scroll to cascade to the <strong>Common Area</strong>:`;
                }
                subtitle.style.textAlign = 'center';
                subtitle.style.color = '#bdc3c7';
                popup.appendChild(subtitle);

                const self = this;
                const scrolls = this.getPlayerScrolls(false);

                // Create a card for each scroll in hand + active (if applicable) + the new scroll
                let allScrollOptions = [...scrolls.hand, newScrollName];
                if (!canCascadeToActive) {
                    // When both are full, also include active scrolls as cascade options
                    allScrollOptions = [...scrolls.hand, ...scrolls.active, newScrollName];
                }

                allScrollOptions.forEach(scrollName => {
                    const pattern = this.patterns[scrollName];
                    const element = this.getScrollElement(scrollName);
                    const isNew = scrollName === newScrollName;
                    const isInActive = scrolls.active.has(scrollName);
                    const elementColor = element === 'catacomb' ? '#9b59b6' : STONE_TYPES[element]?.color || '#666';

                    const card = document.createElement('div');
                    Object.assign(card.style, {
                        backgroundColor: isNew ? '#1a3a1a' : (isInActive ? '#3a2a1a' : '#34495e'),
                        border: isNew ? '2px solid #27ae60' : (isInActive ? '2px solid #f39c12' : '1px solid #555'),
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '10px',
                        color: 'white'
                    });

                    const header = document.createElement('div');
                    header.style.display = 'flex';
                    header.style.justifyContent = 'space-between';
                    header.style.alignItems = 'center';
                    header.style.marginBottom = '8px';

                    const nameSpan = document.createElement('span');
                    let prefix = '';
                    if (isNew) prefix = 'NEW: ';
                    else if (isInActive) prefix = '⚡ ACTIVE: ';
                    nameSpan.textContent = prefix + (pattern ? pattern.name : scrollName);
                    nameSpan.style.fontWeight = 'bold';
                    nameSpan.style.color = elementColor;
                    header.appendChild(nameSpan);
                    card.appendChild(header);

                    if (pattern) {
                        const desc = document.createElement('div');
                        desc.textContent = pattern.description;
                        desc.style.fontSize = '12px';
                        desc.style.color = '#95a5a6';
                        desc.style.marginBottom = '10px';
                        card.appendChild(desc);
                    }

                    // Button container
                    const buttonRow = document.createElement('div');
                    buttonRow.style.display = 'flex';
                    buttonRow.style.gap = '10px';
                    buttonRow.style.justifyContent = 'flex-end';

                    // Cascade to Active button (only if active has room and scroll isn't already in active)
                    if (canCascadeToActive && !isInActive) {
                        const toActiveBtn = document.createElement('button');
                        toActiveBtn.textContent = 'To Active';
                        Object.assign(toActiveBtn.style, {
                            backgroundColor: '#f39c12',
                            color: 'white',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        });
                        toActiveBtn.onmouseenter = () => toActiveBtn.style.backgroundColor = '#e67e22';
                        toActiveBtn.onmouseleave = () => toActiveBtn.style.backgroundColor = '#f39c12';

                        toActiveBtn.onclick = () => {
                            if (scrollName === newScrollName) {
                                // Cascade new scroll directly to active
                                scrolls.active.add(newScrollName);

                                if (isMultiplayer) {
                                    broadcastGameAction('scroll-collected', {
                                        playerIndex: activePlayerIndex,
                                        scrollName: newScrollName,
                                        shrineType: shrineType
                                    });
                                    broadcastGameAction('scroll-move', {
                                        playerIndex: activePlayerIndex,
                                        scrollName: newScrollName,
                                        toLocation: 'active'
                                    });
                                }
                                updateStatus(`Cascaded new scroll "${newScrollInfo.name}" to Active Area`);
                            } else {
                                // Cascade existing scroll to active, add new to hand
                                scrolls.hand.delete(scrollName);
                                scrolls.active.add(scrollName);
                                scrolls.hand.add(newScrollName);

                                if (isMultiplayer) {
                                    broadcastGameAction('scroll-move', {
                                        playerIndex: activePlayerIndex,
                                        scrollName: scrollName,
                                        toLocation: 'active'
                                    });
                                    broadcastGameAction('scroll-collected', {
                                        playerIndex: activePlayerIndex,
                                        scrollName: newScrollName,
                                        shrineType: shrineType
                                    });
                                }
                                updateStatus(`Cascaded "${self.patterns[scrollName]?.name || scrollName}" to Active, kept "${newScrollInfo.name}" in hand`);
                            }

                            self.updateScrollCount();
                            self.clearPendingCascade(playerIdx);
                            document.body.removeChild(overlay);
                        };
                        buttonRow.appendChild(toActiveBtn);
                    }

                    // Cascade to Common Area button
                    const toCommonBtn = document.createElement('button');
                    toCommonBtn.textContent = 'To Common';
                    Object.assign(toCommonBtn.style, {
                        backgroundColor: '#e74c3c',
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    });
                    toCommonBtn.onmouseenter = () => toCommonBtn.style.backgroundColor = '#c0392b';
                    toCommonBtn.onmouseleave = () => toCommonBtn.style.backgroundColor = '#e74c3c';

                    toCommonBtn.onclick = () => {
                        if (scrollName === newScrollName) {
                            // Cascade new scroll to common area
                            self.discardToCommonArea(newScrollName);
                            updateStatus(`Cascaded new scroll "${newScrollInfo.name}" to Common Area`);
                        } else {
                            // Cascade existing scroll to common, add new to hand
                            if (isInActive) {
                                scrolls.active.delete(scrollName);
                            } else {
                                scrolls.hand.delete(scrollName);
                            }
                            self.discardToCommonArea(scrollName);
                            scrolls.hand.add(newScrollName);

                            if (isMultiplayer) {
                                broadcastGameAction('scroll-discard', {
                                    playerIndex: activePlayerIndex,
                                    scrollName: scrollName
                                });
                                broadcastGameAction('scroll-collected', {
                                    playerIndex: activePlayerIndex,
                                    scrollName: newScrollName,
                                    shrineType: shrineType
                                });
                            }
                            updateStatus(`Cascaded "${self.patterns[scrollName]?.name || scrollName}" to Common Area, kept "${newScrollInfo.name}"`);
                        }

                        self.updateScrollCount();
                        self.clearPendingCascade(playerIdx);
                        document.body.removeChild(overlay);
                    };
                    buttonRow.appendChild(toCommonBtn);

                    card.appendChild(buttonRow);
                    popup.appendChild(card);
                });

                overlay.appendChild(popup);
                document.body.appendChild(overlay);
            }

            // End-of-turn overflow: hand or active over capacity. Player must move scrolls to active or common until within limits.
            // Smart flow: if active is full, they can move active→common first to "make space", then move hand→active.
            showEndTurnOverflowModal(onResolved) {
                const overlay = document.createElement('div');
                overlay.id = 'end-turn-overflow-overlay';
                overlay.className = 'retro-dlg-overlay';
                overlay.style.zIndex = '1001';

                const popup = document.createElement('div');
                popup.id = 'end-turn-overflow-popup';
                popup.className = 'retro-dlg-box wide';

                const title = document.createElement('div');
                title.textContent = 'Scroll Overflow';
                title.className = 'retro-dlg-title';
                popup.appendChild(title);

                const subtitle2 = document.createElement('div');
                subtitle2.textContent = 'Resolve Before Ending Turn';
                subtitle2.className = 'retro-dlg-title';
                subtitle2.style.fontSize = '13px';
                subtitle2.style.marginTop = '-8px';
                popup.appendChild(subtitle2);

                const subtitle = document.createElement('p');
                subtitle.id = 'end-turn-overflow-subtitle';
                subtitle.className = 'retro-dlg-line';
                subtitle.style.marginBottom = '12px';
                popup.appendChild(subtitle);

                const content = document.createElement('div');
                content.id = 'end-turn-overflow-content';
                popup.appendChild(content);

                const self = this;

                // Single delegated click: read scroll name from button so the right scroll is always used
                content.addEventListener('click', function overflowContentClick(e) {
                    const btn = e.target && e.target.closest && e.target.closest('button[data-scroll-name]');
                    if (!btn) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const name = btn.getAttribute('data-scroll-name');
                    const action = btn.getAttribute('data-action');
                    if (!name) return;
                    if (action === 'to-common') {
                        if (self.discardScroll(name)) {
                            self.updateScrollCount();
                            try { if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI(); } catch (err) {}
                            renderContent();
                        }
                    } else if (action === 'to-active') {
                        if (self.moveToActive(name)) {
                            self.updateScrollCount();
                            renderContent();
                        }
                    }
                });

                function renderContent() {
                    content.innerHTML = '';
                    const scrolls = self.getPlayerScrolls(false);
                    const handOver = scrolls.hand.size > self.MAX_HAND_SIZE;
                    const activeOver = scrolls.active.size > self.MAX_ACTIVE_SIZE;
                    const hasRoomInActive = scrolls.active.size < self.MAX_ACTIVE_SIZE;

                    subtitle.textContent = `Hand: ${scrolls.hand.size}/${self.MAX_HAND_SIZE}  |  Active: ${scrolls.active.size}/${self.MAX_ACTIVE_SIZE}`;
                    if (handOver) subtitle.textContent += '  (hand over limit)';
                    if (activeOver) subtitle.textContent += '  (active over limit)';

                    const stillOverflow = handOver || activeOver;

                    // Hand scrolls: can move to Active (if room) or Common
                    [...scrolls.hand].forEach(scrollName => {
                        const pattern = self.patterns[scrollName];
                        const element = self.getScrollElement(scrollName);
                        const elementColor = element === 'catacomb' ? '#9b59b6' : STONE_TYPES[element]?.color || '#aaa';

                        const card = document.createElement('div');
                        Object.assign(card.style, {
                            background: '#1a1a2a',
                            border: '2px solid #444',
                            borderLeft: `4px solid ${elementColor}`,
                            padding: '10px 14px',
                            marginBottom: '10px',
                        });

                        const nameSpan = document.createElement('div');
                        nameSpan.textContent = 'Hand: ' + (pattern ? pattern.name : scrollName);
                        Object.assign(nameSpan.style, {
                            fontFamily: 'var(--font-terminal)', fontSize: '20px',
                            color: elementColor, marginBottom: '4px'
                        });
                        card.appendChild(nameSpan);
                        if (pattern) {
                            const desc = document.createElement('div');
                            desc.textContent = pattern.description;
                            Object.assign(desc.style, {
                                fontFamily: 'var(--font-terminal)', fontSize: '16px',
                                color: '#aaa', marginBottom: '10px', lineHeight: '1.3'
                            });
                            card.appendChild(desc);
                        }

                        const buttonRow = document.createElement('div');
                        buttonRow.style.display = 'flex';
                        buttonRow.style.gap = '10px';
                        buttonRow.style.justifyContent = 'flex-end';

                        if (hasRoomInActive) {
                            const toActiveBtn = document.createElement('button');
                            toActiveBtn.type = 'button';
                            toActiveBtn.setAttribute('data-scroll-name', scrollName);
                            toActiveBtn.setAttribute('data-action', 'to-active');
                            toActiveBtn.textContent = 'To Active';
                            toActiveBtn.className = 'retro-dlg-btn ok';
                            buttonRow.appendChild(toActiveBtn);
                        }

                        const toCommonBtn = document.createElement('button');
                        toCommonBtn.type = 'button';
                        toCommonBtn.setAttribute('data-scroll-name', scrollName);
                        toCommonBtn.setAttribute('data-action', 'to-common');
                        toCommonBtn.textContent = 'To Common';
                        toCommonBtn.className = 'retro-dlg-btn cancel';
                        buttonRow.appendChild(toCommonBtn);

                        card.appendChild(buttonRow);
                        content.appendChild(card);
                    });

                    // Active scrolls: can move to Common only (frees space so hand→active becomes possible)
                    [...scrolls.active].forEach(scrollName => {
                        const pattern = self.patterns[scrollName];
                        const element = self.getScrollElement(scrollName);
                        const elementColor = element === 'catacomb' ? '#9b59b6' : STONE_TYPES[element]?.color || '#aaa';

                        const card = document.createElement('div');
                        Object.assign(card.style, {
                            background: '#1a1a2a',
                            border: '2px solid #d9b08c',
                            borderLeft: `4px solid ${elementColor}`,
                            padding: '10px 14px',
                            marginBottom: '10px',
                        });

                        const nameSpan = document.createElement('div');
                        nameSpan.textContent = 'Active: ' + (pattern ? pattern.name : scrollName);
                        Object.assign(nameSpan.style, {
                            fontFamily: 'var(--font-terminal)', fontSize: '20px',
                            color: elementColor, marginBottom: '4px'
                        });
                        card.appendChild(nameSpan);
                        if (pattern) {
                            const desc = document.createElement('div');
                            desc.textContent = pattern.description;
                            Object.assign(desc.style, {
                                fontFamily: 'var(--font-terminal)', fontSize: '16px',
                                color: '#aaa', marginBottom: '10px', lineHeight: '1.3'
                            });
                            card.appendChild(desc);
                        }

                        const toCommonBtn = document.createElement('button');
                        toCommonBtn.type = 'button';
                        toCommonBtn.setAttribute('data-scroll-name', scrollName);
                        toCommonBtn.setAttribute('data-action', 'to-common');
                        toCommonBtn.textContent = 'To Common';
                        toCommonBtn.className = 'retro-dlg-btn cancel';
                        card.appendChild(toCommonBtn);
                        content.appendChild(card);
                    });

                    const doneRow = document.createElement('div');
                    doneRow.style.marginTop = '16px';
                    doneRow.style.textAlign = 'center';

                    const doneBtn = document.createElement('button');
                    doneBtn.type = 'button';
                    doneBtn.textContent = stillOverflow ? 'Resolve overflow first' : 'Done – End Turn';
                    doneBtn.disabled = stillOverflow;
                    doneBtn.className = 'retro-dlg-btn' + (stillOverflow ? '' : ' ok');
                    if (stillOverflow) doneBtn.style.opacity = '0.5';
                    doneBtn.onclick = () => {
                        if (stillOverflow) return;
                        document.body.removeChild(overlay);
                        onResolved();
                    };
                    doneRow.appendChild(doneBtn);
                    content.appendChild(doneRow);
                }

                renderContent();
                overlay.appendChild(popup);
                document.body.appendChild(overlay);
            }

            showScrollNotification(scrollInfo, elementType) {
                const stoneType = STONE_TYPES[elementType];
                const color = stoneType ? stoneType.color : '#9458f4';
                const symbolImg = stoneType ? `<img src="${stoneType.img}" class="element-icon-sm" alt="${elementType}" style="vertical-align:middle;">` : '';

                const overlay = document.createElement('div');
                overlay.className = 'retro-dlg-overlay';
                overlay.id = 'scroll-found-overlay';

                const box = document.createElement('div');
                box.className = 'retro-dlg-box wide';

                const title = document.createElement('div');
                title.textContent = 'New Scroll Found!';
                title.className = 'retro-dlg-title';
                title.style.color = color;
                box.appendChild(title);

                const card = document.createElement('div');
                card.className = 'si-card';

                const nameRow = document.createElement('div');
                nameRow.className = 'si-card-header';
                const nameEl = document.createElement('div');
                nameEl.innerHTML = `<span style="color:${color}">${symbolImg}</span> ${scrollInfo.name}`;
                nameEl.className = 'si-card-name';
                nameRow.appendChild(nameEl);
                card.appendChild(nameRow);

                const desc = document.createElement('div');
                desc.textContent = scrollInfo.description;
                desc.className = 'si-card-desc';
                card.appendChild(desc);

                const patternVisual = this.createPatternVisual(scrollInfo, elementType);
                card.appendChild(patternVisual);

                box.appendChild(card);

                const closeBtn = document.createElement('button');
                closeBtn.textContent = 'Got it!';
                closeBtn.className = 'retro-dlg-btn ok';
                closeBtn.style.width = '100%';
                closeBtn.onclick = () => overlay.remove();
                box.appendChild(closeBtn);

                overlay.appendChild(box);
                document.body.appendChild(overlay);
            }

            checkPattern(patternName) {
                // Use the active player's position by default
                return this.checkPatternForPlayer(patternName, activePlayerIndex);
            }

            // Check pattern for a specific player (used by response window)
            checkPatternForPlayer(patternName, playerIndex) {
                const pattern = this.patterns[patternName];
                if (!pattern) return false;

                // Get the player's position
                let pos;
                if (playerIndex === activePlayerIndex && playerPosition) {
                    // Use global playerPosition for active player
                    pos = playerPosition;
                } else if (playerPositions && playerPositions[playerIndex]) {
                    // Use playerPositions array for other players
                    pos = playerPositions[playerIndex];
                } else {
                    return false;
                }

                const playerHex = pixelToHex(pos.x, pos.y, TILE_SIZE);

                console.log(`  Checking ${patternName} for player ${playerIndex}...`);

                return pattern.patterns.some((patternVariant, variantIdx) => {
                    const allMatch = patternVariant.every((req, reqIdx) => {
                        const checkHex = hexToPixel(playerHex.q + req.q, playerHex.r + req.r, TILE_SIZE);
                        const stone = placedStones.find(s => {
                            const dist = Math.sqrt(Math.pow(s.x - checkHex.x, 2) + Math.pow(s.y - checkHex.y, 2));
                            const matches = dist < 5 && s.type === req.type;
                            if (matches) {
                                console.log(`    ✓ Found ${s.type} stone at (${req.q}, ${req.r})`);
                            }
                            return matches;
                        });
                        if (!stone) {
                            console.log(`    ✗ Missing ${req.type} stone at (${req.q}, ${req.r})`);
                        }
                        return !!stone;
                    });

                    if (allMatch) {
                        console.log(`    ✓✓✓ PATTERN VARIANT ${variantIdx + 1} MATCHED!`);
                    }
                    return allMatch;
                });
            }

            // Get current spell AP cost (may be reduced by buffs)
            getSpellCost(spell = null, playerIndex = activePlayerIndex) {
                // Quick Reflexes: level 1 scrolls cost 0 until caster's next turn
                if (spell && spell.level === 1 && this.scrollEffects?.activeBuffs?.quickReflexes) {
                    const qr = this.scrollEffects.activeBuffs.quickReflexes;
                    if (qr.playerIndex === playerIndex) {
                        return 0;
                    }
                }
                // Simplify: scrolls cost 1 for the caster this turn
                if (this.scrollEffects?.activeBuffs?.simplify) {
                    const buff = this.scrollEffects.activeBuffs.simplify;
                    if (buff.playerIndex === playerIndex) {
                        return 1;
                    }
                }
                return this.SPELL_AP_COST;
            }

            castSpell() {
                // Scrolls in Active Area OR Common Area can be activated
                const activeScrollsList = Array.from(this.getPlayerScrolls(false).active);
                const commonAreaScrolls = this.getCommonAreaScrolls();
                const allCastableScrolls = [...activeScrollsList, ...commonAreaScrolls];
                if (typeof window !== 'undefined' && window.logScrollEvent) {
                    window.logScrollEvent('cast_attempt', {
                        playerIndex: activePlayerIndex,
                        active: activeScrollsList,
                        common: commonAreaScrolls
                    });
                }

                if (allCastableScrolls.length === 0) {
                    updateStatus("No scrolls available! Move scrolls to Active Area or use Common Area scrolls.");
                    return false;
                }

                // Debug: Log player position and nearby stones (throttled)
                if (shouldDebugLog('castSpellDebug', 1000)) {
                    console.log('✨ Attempting to cast spell...');
                    console.log(`Player position: (${playerPosition.x.toFixed(1)}, ${playerPosition.y.toFixed(1)})`);
                    console.log(`Active scrolls: ${activeScrollsList.join(', ')}`);
                    console.log(`Common area scrolls: ${commonAreaScrolls.join(', ')}`);

                    if (playerPosition) {
                        const playerHex = pixelToHex(playerPosition.x, playerPosition.y, TILE_SIZE);
                        console.log(`Player hex: q=${playerHex.q}, r=${playerHex.r}`);

                        // Log nearby stones
                        console.log('Nearby stones:');
                        const nearbyStones = [];
                        placedStones.forEach(stone => {
                            const stoneHex = pixelToHex(stone.x, stone.y, TILE_SIZE);
                            const relQ = stoneHex.q - playerHex.q;
                            const relR = stoneHex.r - playerHex.r;
                            nearbyStones.push({ type: stone.type, q: relQ, r: relR });
                            console.log(`  ${stone.type} at relative (${relQ}, ${relR})`);
                        });

                        // Check each castable scroll and show why it doesn't match
                        console.log('\nChecking castable scrolls (Active + Common Area):');
                        for (const scrollName of allCastableScrolls) {
                            const pattern = this.patterns[scrollName];
                            console.log(`\n${scrollName} requires:`);
                            pattern.patterns.forEach((patternVariant, idx) => {
                                const coords = patternVariant.map(p => `(${p.q},${p.r}) ${p.type}`).join(' + ');
                                const matches = patternVariant.every(req => {
                                    return nearbyStones.some(s => s.q === req.q && s.r === req.r && s.type === req.type);
                                });
                                console.log(`  Pattern ${idx + 1}: ${coords} - ${matches ? '✓ MATCH' : '✗ no match'}`);
                            });
                        }
                    }
                }

                const matchingSpells = [];
                // Check scrolls in Active Area AND Common Area
                for (const scrollName of allCastableScrolls) {
                    if (this.checkPattern(scrollName)) {
                        console.log(`\n✓ Pattern match found: ${scrollName}`);
                        const isFromCommonArea = commonAreaScrolls.includes(scrollName);
                        matchingSpells.push({ name: scrollName, spell: this.patterns[scrollName], fromCommonArea: isFromCommonArea });
                    }
                }

                if (matchingSpells.length === 0) {
                    updateStatus("No valid spell pattern found! Check console for details.");
                    console.log('\n✗ No matching patterns');
                    return false;
                }

                matchingSpells.sort((a, b) => b.spell.level - a.spell.level);

                // Level 1 scrolls can only be used during the response window
                const mainPhaseSpells = matchingSpells.filter(s => s.spell.level !== 1);
                if (mainPhaseSpells.length === 0) {
                    updateStatus('Level 1 scrolls can only be used as responses.');
                    return false;
                }

                // Filter by affordability based on each spell's actual cost
                const affordableSpells = mainPhaseSpells.filter(({ spell }) => {
                    const cost = this.getSpellCost(spell, activePlayerIndex);
                    return canAfford(cost);
                });

                if (typeof window !== 'undefined' && window.logScrollEvent) {
                    window.logScrollEvent('cast_matches', {
                        playerIndex: activePlayerIndex,
                        matches: matchingSpells.map(m => ({ name: m.name, level: m.spell.level, element: m.spell.element })),
                        affordable: affordableSpells.map(m => ({ name: m.name, level: m.spell.level, element: m.spell.element }))
                    });
                }

                if (affordableSpells.length === 0) {
                    const minCost = Math.min(...matchingSpells.map(({ spell }) => this.getSpellCost(spell, activePlayerIndex)));
                    updateStatus(`Not enough AP! Need ${minCost} AP to cast.`);
                    return false;
                }

                if (affordableSpells.length > 1) {
                    // Always show selection when multiple scrolls match
                    this.showSpellSelection(affordableSpells);
                } else {
                    this.executeSpell(affordableSpells[0]);
                }
                return true;
            }

            showSpellSelection(spells) {
                const popup = document.createElement('div');
                Object.assign(popup.style, {
                    position: 'fixed', left: '50%', top: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: '#2c3e50', padding: '20px',
                    borderRadius: '10px', boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                    zIndex: '1000', color: 'white', minWidth: '300px'
                });

                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.justifyContent = 'space-between';
                header.style.marginBottom = '12px';
                const title = document.createElement('h3');
                title.textContent = 'Select Scroll to Cast';
                title.style.textAlign = 'center';
                title.style.margin = '0';
                title.style.flex = '1';
                header.appendChild(title);
                const closeBtn = document.createElement('button');
                closeBtn.textContent = '\u00D7';
                closeBtn.title = 'Close';
                closeBtn.style.cssText = 'background:none;border:none;color:white;font-size:24px;cursor:pointer;line-height:1;padding:0 8px;';
                closeBtn.onclick = () => document.body.removeChild(popup);
                header.appendChild(closeBtn);
                popup.appendChild(header);

                spells.forEach(({name, spell, fromCommonArea}) => {
                    const btn = document.createElement('button');
                    const sourceLabel = fromCommonArea ? ' [Common]' : '';
                    btn.textContent = `${spell.name} (+${spell.level} ${spell.element})${sourceLabel}`;
                    btn.style.width = '100%';
                    btn.style.marginBottom = '10px';
                    if (fromCommonArea) {
                        btn.style.borderLeft = '4px solid #9b59b6'; // Purple border for common area
                    }
                    btn.onclick = () => {
                        document.body.removeChild(popup);
                        this.executeSpell({name, spell, fromCommonArea});
                    };
                    popup.appendChild(btn);
                });

                document.body.appendChild(popup);
            }

            executeSpell({name, spell, fromCommonArea = false}) {
                const cost = this.getSpellCost(spell, activePlayerIndex);
                if (!canAfford(cost)) {
                    updateStatus(`Not enough AP! Need ${cost} AP to cast.`);
                    return false;
                }
                // Spend AP first (may be reduced by buffs)
                spendAP(cost);
                if (typeof window !== 'undefined' && window.logScrollEvent) {
                    window.logScrollEvent('cast_execute', {
                        playerIndex: activePlayerIndex,
                        scrollName: name,
                        element: spell.element,
                        level: spell.level,
                        cost,
                        fromCommonArea
                    });
                }

                const scrollData = { name, spell, fromCommonArea, casterIndex: activePlayerIndex };

                // Open response window when 2+ players so the react phase always runs (others can respond or pass)
                const numPlayers = typeof playerPositions !== 'undefined' ? playerPositions.length : 0;
                if (this.responseWindow && numPlayers > 1) {
                    console.log('Opening response window (react phase)');
                    this.responseWindow.openResponseWindow(scrollData, activePlayerIndex, (result) => {
                        this.handleResponseWindowComplete(scrollData, result);
                    });
                    return; // Don't apply effects yet
                }

                // No response window needed - apply effects immediately
                console.log('Response window skipped - no valid responses available');
                this.applyScrollEffects(name, spell, fromCommonArea);
            }

            // Handle the completion of response window
            handleResponseWindowComplete(originalScrollData, result) {
                if (result.skipped) {
                    // No responses - apply original scroll effects
                    this.applyScrollEffects(originalScrollData.name, originalScrollData.spell, originalScrollData.fromCommonArea);
                    return;
                }

                // Process resolved scrolls from the stack
                // The response window already handles the LIFO resolution
                // We just need to check if the original scroll was countered
                const wasCountered = result.responses.some(r =>
                    r.isOriginal && r.result === 'countered'
                );

                if (wasCountered) {
                    updateStatus(`Your ${originalScrollData.spell.name} was countered!`);
                    // Broadcast the counter in multiplayer
                    if (isMultiplayer) {
                        broadcastGameAction('scroll-countered', {
                            scrollName: originalScrollData.name,
                            casterIndex: originalScrollData.casterIndex
                        });
                    }
                    // Still need to handle scroll disposition for countered scroll
                    this.handleScrollDisposition(originalScrollData.name, originalScrollData.fromCommonArea);
                } else {
                    // Original not countered: already applied by scroll-resolved listener when event fired.
                    // Nothing to do here (avoids double-apply).
                }
            }

            // Apply the actual scroll effects (separated from executeSpell for response window support)
            applyScrollEffects(name, spell, fromCommonArea = false) {
                // Handle scroll disposition (remove from player and decide where it goes)
                this.handleScrollDisposition(name, fromCommonArea);

                // Save the previous scroll cast (before recording this one) for effects like Sigh of Recollection
                const previousScrollCast = this.scrollEffects ? this.scrollEffects.lastScrollCastThisTurn : null;

                // Track this scroll for Reflect (Water I) effect
                if (this.scrollEffects) {
                    this.scrollEffects.recordScrollCast(name, spell);
                }

                // Check if this scroll has a special effect (Earth scrolls, etc.)
                // Lazy-init: get ScrollEffects from window or global (in case load order / scope hid it at construction)
                if (!this.scrollEffects) {
                    const SE = (typeof window !== 'undefined' && window.ScrollEffects) || (typeof ScrollEffects !== 'undefined' && ScrollEffects);
                    if (SE) {
                        SE.init(this);
                        this.scrollEffects = SE;
                        console.log('Scroll effects system initialized (lazy)');
                    }
                }
                if (this.scrollEffects) {
                    console.log(`📜 Looking up effect for: "${name}", effects keys:`, Object.keys(this.scrollEffects.effects));
                    const effect = this.scrollEffects.getEffect(name);
                    console.log(`📜 getEffect("${name}") returned:`, effect ? effect.name : null);
                    if (effect) {
                        console.log(`📜 Executing special effect for ${name}: ${effect.name}`);
                        // Wrap execute in try/catch so win-condition tracking always runs even if the
                        // effect throws (e.g. DOM error inside enterTransmuteMode or similar)
                        let result = { success: false, requiresSelection: false };
                        try {
                            result = this.scrollEffects.execute(name, activePlayerIndex, { spell, scrollName: name, previousScrollCast }) || result;
                        } catch (execErr) {
                            console.error(`❌ Effect execute threw for "${name}":`, execErr);
                            // Continue below to still track win condition and broadcast
                        }
                        if (typeof window !== 'undefined' && window.logScrollEvent) {
                            window.logScrollEvent('effect_execute', {
                                playerIndex: activePlayerIndex,
                                scrollName: name,
                                effectName: effect.name,
                                success: result?.success,
                                requiresSelection: !!result?.requiresSelection,
                                message: result?.message
                            });
                        }

                        // Refresh all stone count UI after scroll effect (effects may modify pools)
                        ['earth', 'water', 'fire', 'wind', 'void'].forEach(t => updateStoneCount(t));

                        // Track activated element(s) for win condition regardless of effect result
                        // (but skip if the effect was cancelled, e.g. Sacrificial Pyre with empty hand)
                        if (result.cancelled) {
                            console.log(`📜 Effect cancelled — skipping win-condition tracking for ${name}`);
                            return;
                        }
                        if (spell.element === 'catacomb' && spell.patterns && spell.patterns[0]) {
                            // Catacomb scrolls activate each component element
                            const elements = new Set(spell.patterns[0].map(pos => pos.type));
                            elements.forEach(el => {
                                this.getPlayerScrolls(false).activated.add(el);
                                if (typeof window.gami?.onElementActivated === 'function') {
                                    window.gami.onElementActivated(el, Array.from(this.getPlayerScrolls(false).activated));
                                }
                            });
                        } else {
                            // Source pool guard: if the shared element source pool is fully depleted,
                            // the scroll fires but cannot count toward the win condition — there are
                            // no remaining stones of this element for anyone to use.
                            const elementSourcePool = window.stonePools?.[spell.element] ?? 1;
                            if (elementSourcePool > 0) {
                                this.getPlayerScrolls(false).activated.add(spell.element);
                                if (typeof window.gami?.onElementActivated === 'function') {
                                    window.gami.onElementActivated(spell.element, Array.from(this.getPlayerScrolls(false).activated));
                                }
                            } else {
                                updateStatus(`The ${spell.element} shrine source is depleted — scroll effect cast, but win condition not met.`);
                                console.warn(`📜 Win condition skipped for ${spell.element}: source pool is empty.`);
                            }
                        }
                        updatePlayerElementSymbols(activePlayerIndex);

                        // If effect requires selection, don't continue with broadcast yet
                        if (result.requiresSelection) {
                            return; // Selection mode will call onSelectionEffectComplete when done
                        }

                        // Broadcast the effect in multiplayer
                        if (isMultiplayer) {
                            // For catacomb scrolls, send component elements for win condition tracking
                            const activatedElements = (spell.element === 'catacomb' && spell.patterns && spell.patterns[0])
                                ? [...new Set(spell.patterns[0].map(pos => pos.type))]
                                : [spell.element];
                            broadcastGameAction('scroll-effect', {
                                playerIndex: activePlayerIndex,
                                scrollName: name,
                                effectName: effect.name,
                                element: spell.element,
                                activatedElements: activatedElements
                            });
                            syncPlayerState();
                        }

                        // Check win condition
                        if (this.getPlayerScrolls(false).activated.size === 5) {
                            this.showLevelComplete(activePlayerIndex);
                            if (isMultiplayer) {
                                handleGameOver(activePlayerIndex);
                            }
                        }
                        return;
                    } else {
                        console.warn(`📜 No effect defined for scroll "${name}" – using default (give stones). Add effect in scroll-effects.js for "${name}".`);
                    }
                } else {
                    console.warn('📜 Scroll effects not available – using default (give stones). Is js/scrolls/effects/scroll-effects.js loaded?');
                }

                // Default behavior: give stones based on scroll level
                if (spell.element === 'catacomb') {
                    // Catacomb scrolls give +2 of each element type in the pattern
                    const elementCounts = {};
                    spell.patterns[0].forEach(pos => {
                        elementCounts[pos.type] = (elementCounts[pos.type] || 0) + 1;
                    });

                    const rewards = [];
                    Object.entries(elementCounts).forEach(([element, count]) => {
                        playerPool[element] = Math.min(
                            playerPoolCapacity[element],
                            playerPool[element] + count
                        );
                        updateStoneCount(element);

                        // Track activated element for win condition (for active player)
                        this.getPlayerScrolls(false).activated.add(element);
                        rewards.push(`+${count} ${element}`);
                    });

                    updatePlayerElementSymbols(activePlayerIndex);
                    updateStatus(`Catacomb spell cast! Added ${rewards.join(', ')} stones!`);
                } else {
                    // Regular element scrolls
                    playerPool[spell.element] = Math.min(
                        playerPoolCapacity[spell.element],
                        playerPool[spell.element] + spell.level
                    );
                    updateStoneCount(spell.element);

                    // Track activated element for win condition — source pool guard applies here too
                    const elementSourcePoolDefault = window.stonePools?.[spell.element] ?? 1;
                    if (elementSourcePoolDefault > 0) {
                        this.getPlayerScrolls(false).activated.add(spell.element);
                        updateStatus(`Spell cast! Added +${spell.level} ${spell.element} stones!`);
                    } else {
                        updateStatus(`The ${spell.element} shrine source is depleted — scroll effect cast, but win condition not met.`);
                        console.warn(`📜 Win condition skipped for ${spell.element}: source pool is empty (default path).`);
                    }
                    updatePlayerElementSymbols(activePlayerIndex);
                }

                // Broadcast spell cast in multiplayer
                if (isMultiplayer) {
                    if (spell.element === 'catacomb') {
                        const elementCounts = {};
                        spell.patterns[0].forEach(pos => {
                            elementCounts[pos.type] = (elementCounts[pos.type] || 0) + 1;
                        });
                        broadcastGameAction('spell-cast', {
                            playerIndex: activePlayerIndex,
                            spellName: name,
                            elements: Object.keys(elementCounts),
                            isCatacomb: true
                        });
                    } else {
                        broadcastGameAction('spell-cast', {
                            playerIndex: activePlayerIndex,
                            spellName: name,
                            element: spell.element,
                            level: spell.level,
                            isCatacomb: false
                        });
                    }

                    // Sync resources after spell adds stones
                    syncPlayerState();
                }

                // Check if THIS player has won (activated all 5 elements)
                if (this.getPlayerScrolls(false).activated.size === 5) {
                    this.showLevelComplete(activePlayerIndex);

                    // In multiplayer, mark game as finished in database
                    if (isMultiplayer) {
                        handleGameOver(activePlayerIndex);
                    }
                }
            }

            // Called by scroll effects when a selection-based effect (e.g. Shifting Sands) is completed
            onSelectionEffectComplete(scrollName, effectName, spell) {
                // Update element symbols on player tile
                if (typeof updatePlayerElementSymbols === 'function') {
                    updatePlayerElementSymbols(activePlayerIndex);
                }

                // Gamification hook for element activation via interactive scroll
                if (typeof window.gami?.onElementActivated === 'function') {
                    const activatedEl = (spell.element === 'catacomb' && spell.patterns && spell.patterns[0])
                        ? [...new Set(spell.patterns[0].map(pos => pos.type))]
                        : [spell.element];
                    activatedEl.forEach(el => {
                        window.gami.onElementActivated(el, Array.from(this.getPlayerScrolls(false).activated));
                    });
                }

                if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                    // Determine activated elements (for catacomb scrolls)
                    const activatedElements = (spell.element === 'catacomb' && spell.patterns && spell.patterns[0])
                        ? [...new Set(spell.patterns[0].map(pos => pos.type))]
                        : [spell.element];

                    broadcastGameAction('scroll-effect', {
                        playerIndex: activePlayerIndex,
                        scrollName: scrollName,
                        effectName: effectName,
                        element: spell.element,
                        activatedElements: activatedElements
                    });
                    if (typeof syncPlayerState === 'function') syncPlayerState();
                }
                if (this.getPlayerScrolls(false).activated.size === 5) {
                    this.showLevelComplete(activePlayerIndex);
                    if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof handleGameOver === 'function') {
                        handleGameOver(activePlayerIndex);
                    }
                }
            }

            // Handle scroll disposition after casting
            // Scrolls normally stay in active area after being cast
            // If Unbidden Lamplight was used in response, the scroll goes to common area
            handleScrollDisposition(scrollName, fromCommonArea = false, forceToCommonArea = false) {
                const scrolls = this.getPlayerScrolls(false);

                // Common area scrolls are permanent shared resources — casting them does NOT
                // remove them from the common area. They only leave when replaced by a new scroll
                // of the same element type. So fromCommonArea=true requires no action here.

                // Check if Unbidden Lamplight has marked this scroll to go to caster's hand
                const redirect = this.scrollEffects?.pendingHandRedirect;
                if (redirect && redirect.scrollName === scrollName) {
                    // Remove from the ORIGINAL CASTER's active area
                    const originalCasterIndex = redirect.originalCasterIndex;
                    if (originalCasterIndex !== undefined && this.playerScrolls[originalCasterIndex]) {
                        const originalCasterScrolls = this.playerScrolls[originalCasterIndex];
                        if (originalCasterScrolls.active.has(scrollName)) {
                            originalCasterScrolls.active.delete(scrollName);
                        }
                    } else if (scrolls.active.has(scrollName)) {
                        scrolls.active.delete(scrollName);
                    }

                    // Add to lamplight caster's hand — bypasses hand size limit intentionally
                    const lamplightCasterIndex = redirect.redirectToPlayerIndex;
                    this.ensurePlayerScrollsStructure(lamplightCasterIndex);
                    this.playerScrolls[lamplightCasterIndex].hand.add(scrollName);

                    // Clear the pending redirect
                    this.scrollEffects.pendingHandRedirect = null;

                    // If hand is now over the limit, trigger cascade prompt so player resolves it
                    const lamplightScrolls = this.playerScrolls[lamplightCasterIndex];
                    if (lamplightScrolls.hand.size > this.MAX_HAND_SIZE) {
                        const scrollInfo = this.getScrollInfo ? this.getScrollInfo(scrollName) : null;
                        const canCascadeToActive = lamplightScrolls.active.size < this.MAX_ACTIVE_SIZE;
                        updateStatus(`Unbidden Lamplight sent "${scrollName}" to your hand — hand is over the limit. Cascade a scroll before ending your turn!`);
                        if (lamplightCasterIndex === (isMultiplayer ? myPlayerIndex : activePlayerIndex)) {
                            this.showCascadePrompt(scrollName, scrollInfo, null, canCascadeToActive);
                        }
                    } else {
                        updateStatus('Unbidden Lamplight sent the scroll to your hand!');
                    }
                } else if (forceToCommonArea) {
                    // Explicit request to send to common area.
                    // Guard: only discard if the scroll is still in active — if Lamplight already
                    // redirected it to hand, the scroll is gone from active and we must not override.
                    if (scrolls.active.has(scrollName)) {
                        scrolls.active.delete(scrollName);
                        this.discardToCommonArea(scrollName);
                    }
                }
                // Otherwise, scroll remains in player's active area - NO auto-discard!

                // Update scroll UI
                this.updateScrollCount();
                updateCommonAreaUI();

                // Broadcast in multiplayer
                if (isMultiplayer) {
                    broadcastGameAction('scroll-used', {
                        playerIndex: activePlayerIndex,
                        scrollName: scrollName,
                        fromCommonArea: fromCommonArea,
                        forceToCommonArea: forceToCommonArea
                    });
                }
            }

            showLevelComplete(playerIndex) {
                // Guard: only one win overlay at a time
                if (document.querySelector('.game-over-overlay')) return;

                const overlay = document.createElement('div');
                overlay.className = 'game-over-overlay';

                const box = document.createElement('div');
                box.className = 'game-over-box';

                const title = document.createElement('div');
                title.textContent = 'VICTORY';
                title.className = 'game-over-title';
                box.appendChild(title);

                const playerColor = playerPositions[playerIndex]?.color;
                const colorNames = {
                    '#9458f4': 'Purple wins!',
                    '#ffce00': 'Yellow wins!',
                    '#ed1b43': 'Red wins!',
                    '#5894f4': 'Blue wins!',
                    '#69d83a': 'Green wins!'
                };
                const playerName = document.createElement('div');
                playerName.textContent = colorNames[playerColor] || `Player ${playerIndex + 1} wins!`;
                playerName.className = 'game-over-winner';
                playerName.style.color = playerColor || '#d9b08c';
                box.appendChild(playerName);

                const msg = document.createElement('div');
                msg.textContent = 'You have mastered all five elements!';
                msg.className = 'game-over-msg';
                box.appendChild(msg);

                const elements = document.createElement('div');
                elements.className = 'game-over-elements';
                elements.innerHTML = ['earth','water','fire','wind','void'].map(el =>
                    `<img src="images/${el === 'earth' ? 'mountainsymbol' : el === 'water' ? 'watersymbol' : el === 'fire' ? 'firesymbol' : el === 'wind' ? 'windsymbol' : 'voidsymbol'}.png" class="element-icon-sm" alt="${el}">`
                ).join(' ');
                box.appendChild(elements);

                const subtitle = document.createElement('div');
                subtitle.textContent = 'The path of balance is complete.';
                subtitle.className = 'game-over-subtitle';
                box.appendChild(subtitle);

                if (isMultiplayer) {
                    const n = Math.max(2, (typeof playerPositions !== 'undefined' ? playerPositions.length : 2));
                    const xpAmt = 75 + (n - 1) * 25;
                    const xpLine = document.createElement('div');
                    xpLine.style.cssText = `font-family: var(--font-pixel, monospace); font-size: 9px;
                        color: #f0c040; letter-spacing: 1px; margin: 8px 0 4px;`;
                    xpLine.textContent = `+${xpAmt} XP  —  VICTORY`;
                    box.appendChild(xpLine);
                }

                const btnRow = document.createElement('div');
                btnRow.className = 'game-over-btns';

                if (isMultiplayer) {
                    const lobbyBtn = document.createElement('button');
                    lobbyBtn.textContent = 'Return to Lobby';
                    lobbyBtn.className = 'retro-dlg-btn ok';
                    lobbyBtn.onclick = () => window.location.reload();
                    btnRow.appendChild(lobbyBtn);
                } else {
                    const closeBtn = document.createElement('button');
                    closeBtn.textContent = 'Continue Playing';
                    closeBtn.className = 'retro-dlg-btn cancel';
                    closeBtn.onclick = () => overlay.remove();
                    btnRow.appendChild(closeBtn);
                }

                box.appendChild(btnRow);
                overlay.appendChild(box);
                document.body.appendChild(overlay);
            }

            createPatternVisual(scroll, elementType) {
                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.justifyContent = 'center';
                container.style.alignItems = 'center';
                container.style.padding = '15px';
                container.style.backgroundColor = '#2c3e50';
                container.style.borderRadius = '5px';
                container.style.marginTop = '10px';
                container.style.position = 'relative';

                // Create SVG
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '200');
                svg.setAttribute('height', '200');
                svg.setAttribute('viewBox', '-100 -100 200 200');

                const hexSize = 15;

                // Helper to create hex points
                const createHexPoints = (cx, cy, size) => {
                    const points = [];
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 3) * i - Math.PI / 6;
                        points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
                    }
                    return points.join(' ');
                };

                // Helper to convert axial to pixel
                const axialToPixel = (q, r) => {
                    const x = hexSize * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
                    const y = hexSize * (3/2 * r);
                    return { x, y };
                };

                // Draw background hexes in a grid (static layer)
                const backgroundGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                for (let q = -2; q <= 2; q++) {
                    for (let r = -2; r <= 2; r++) {
                        if (Math.abs(q + r) <= 2) {
                            const pos = axialToPixel(q, r);
                            const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                            hex.setAttribute('points', createHexPoints(pos.x, pos.y, hexSize));
                            hex.setAttribute('fill', '#34495e');
                            hex.setAttribute('stroke', '#2c3e50');
                            hex.setAttribute('stroke-width', '2');
                            backgroundGroup.appendChild(hex);
                        }
                    }
                }
                svg.appendChild(backgroundGroup);

                // Draw player hex (static layer)
                const playerHex = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                playerHex.setAttribute('cx', '0');
                playerHex.setAttribute('cy', '0');
                playerHex.setAttribute('r', hexSize * 0.5);
                playerHex.setAttribute('fill', '#fff');
                playerHex.setAttribute('stroke', '#333');
                playerHex.setAttribute('stroke-width', '2');
                svg.appendChild(playerHex);

                // Create pattern groups for each variation (animated layers)
                const patternGroups = [];
                scroll.patterns.forEach((patternVariation, idx) => {
                    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    group.style.opacity = idx === 0 ? '1' : '0';
                    group.style.transition = 'opacity 0.5s ease-in-out';

                    patternVariation.forEach(pos => {
                        const pixelPos = axialToPixel(pos.q, pos.r);
                        const stoneHex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                        stoneHex.setAttribute('points', createHexPoints(pixelPos.x, pixelPos.y, hexSize));
                        // Use pos.type if available (for catacomb multi-element), otherwise use elementType
                        const stoneType = pos.type || elementType;
                        stoneHex.setAttribute('fill', darkenHex(STONE_TYPES[stoneType].color, 0.55));
                        stoneHex.setAttribute('stroke', STONE_TYPES[stoneType].color);
                        stoneHex.setAttribute('stroke-width', '1.5');
                        group.appendChild(stoneHex);

                        // Add element image
                        const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                        symbol.setAttribute('href', STONE_TYPES[stoneType].img);
                        symbol.setAttribute('x', pixelPos.x - hexSize);
                        symbol.setAttribute('y', pixelPos.y - hexSize);
                        symbol.setAttribute('width', hexSize * 2);
                        symbol.setAttribute('height', hexSize * 2);
                        // No opacity reduction — symbol renders at full strength
                        group.appendChild(symbol);
                    });

                    patternGroups.push(group);
                    svg.appendChild(group);
                });

                // Add pattern indicator text
                const indicatorText = document.createElement('div');
                indicatorText.style.position = 'absolute';
                indicatorText.style.bottom = '5px';
                indicatorText.style.right = '10px';
                indicatorText.style.fontSize = '11px';
                indicatorText.style.color = '#95a5a6';
                indicatorText.style.fontStyle = 'italic';
                indicatorText.textContent = `Pattern 1/${patternGroups.length}`;
                container.appendChild(indicatorText);

                // Cycle through patterns
                let currentPatternIdx = 0;
                const cycleInterval = setInterval(() => {
                    // Fade out current
                    patternGroups[currentPatternIdx].style.opacity = '0';
                    
                    // Move to next
                    currentPatternIdx = (currentPatternIdx + 1) % patternGroups.length;
                    
                    // Fade in next
                    patternGroups[currentPatternIdx].style.opacity = '1';
                    
                    // Update indicator
                    indicatorText.textContent = `Pattern ${currentPatternIdx + 1}/${patternGroups.length}`;
                }, 2500); // Change pattern every 2.5 seconds

                // Store interval ID so we can clean it up if needed
                container.dataset.intervalId = cycleInterval;

                container.appendChild(svg);
                return container;
            }

            showInventory() {
                // Remove any existing inventory popup so we don't stack them
                const existingPopup = document.getElementById('scroll-inventory-popup');
                if (existingPopup) existingPopup.remove();

                const popup = document.createElement('div');
                popup.id = 'scroll-inventory-popup'; // used by Transmute to refresh this popup
                Object.assign(popup.style, {
                    position: 'fixed', left: '50%', top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: '1001', minWidth: '450px', maxWidth: '600px', maxHeight: '80vh',
                    overflowY: 'auto'
                });

                const title = document.createElement('h2');
                title.textContent = 'Scroll Inventory';
                title.className = 'si-title';
                title.style.color = '#3498db';
                popup.appendChild(title);

                const subtitle = document.createElement('div');
                subtitle.textContent = `Hand: ${this.handScrolls.size}/${this.MAX_HAND_SIZE} | Active: ${this.activeScrolls.size}/${this.MAX_ACTIVE_SIZE}`;
                subtitle.className = 'si-subtitle';
                popup.appendChild(subtitle);

                const closeBtn = document.createElement('button');
                closeBtn.textContent = '×';
                closeBtn.className = 'si-close';
                closeBtn.onclick = () => document.body.removeChild(popup);
                popup.appendChild(closeBtn);

                const self = this;

                // Helper to create a scroll card with move button
                const createScrollCard = (scrollName, scroll, element, location) => {
                    const scrollDiv = document.createElement('div');
                    scrollDiv.className = 'si-card' + (location === 'active' ? ' si-card-active' : '');

                    const headerRow = document.createElement('div');
                    headerRow.className = 'si-card-header';

                    const nameDiv = document.createElement('div');
                    nameDiv.textContent = scroll.name;
                    nameDiv.className = 'si-card-name';
                    headerRow.appendChild(nameDiv);

                    const canModify = !isMultiplayer || (myPlayerIndex === activePlayerIndex);
                    if (canModify) {
                        if (location === 'hand') {
                            const moveBtn = document.createElement('button');
                            moveBtn.textContent = 'To Active';
                            moveBtn.className = 'si-btn si-btn-active-area';
                            moveBtn.onclick = () => {
                                self.moveToActive(scrollName);
                                document.body.removeChild(popup);
                                self.showInventory();
                            };
                            headerRow.appendChild(moveBtn);
                        }

                        const discardBtn = document.createElement('button');
                        discardBtn.textContent = 'To Common';
                        discardBtn.className = 'si-btn si-btn-common';
                        discardBtn.onclick = () => {
                            self.discardScroll(scrollName);
                            document.body.removeChild(popup);
                            self.showInventory();
                        };
                        headerRow.appendChild(discardBtn);
                    }

                    scrollDiv.appendChild(headerRow);

                    const scrollDesc = document.createElement('div');
                    scrollDesc.textContent = scroll.description;
                    scrollDesc.className = 'si-card-desc';
                    scrollDiv.appendChild(scrollDesc);

                    const patternVisual = this.createPatternVisual(scroll, element);
                    scrollDiv.appendChild(patternVisual);

                    const patternInfo = document.createElement('div');
                    patternInfo.className = 'si-pattern-box';

                    const patternTitle = document.createElement('div');
                    patternTitle.textContent = 'Required Pattern (one of these):';
                    patternTitle.className = 'si-pattern-title';
                    patternInfo.appendChild(patternTitle);

                    const isCatacomb = element === 'catacomb';
                    scroll.patterns.slice(0, 3).forEach((pattern, idx) => {
                        const patternLine = document.createElement('div');
                        const coords = isCatacomb
                            ? pattern.map(pos => `${pos.type.charAt(0).toUpperCase()}(${pos.q},${pos.r})`).join(' + ')
                            : pattern.map(pos => `(${pos.q},${pos.r})`).join(' + ');
                        patternLine.textContent = `${idx + 1}. Stones at: ${coords}`;
                        patternLine.className = 'si-pattern-line';
                        patternInfo.appendChild(patternLine);
                    });

                    if (scroll.patterns.length > 3) {
                        const moreText = document.createElement('div');
                        moreText.textContent = `... and ${scroll.patterns.length - 3} more rotations`;
                        moreText.className = 'si-pattern-more';
                        patternInfo.appendChild(moreText);
                    }

                    scrollDiv.appendChild(patternInfo);
                    return scrollDiv;
                };

                // ACTIVE AREA SECTION
                const activeSection = document.createElement('div');
                activeSection.className = 'si-section si-active';

                const activeHeader = document.createElement('h3');
                activeHeader.textContent = `Active Area (${this.activeScrolls.size}/${this.MAX_ACTIVE_SIZE}) - Visible to opponents`;
                activeHeader.className = 'si-section-header';
                activeSection.appendChild(activeHeader);

                const activeScrollsList = Array.from(this.activeScrolls);
                if (activeScrollsList.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.textContent = 'No scrolls in active area. Move scrolls here to prepare for activation.';
                    emptyMsg.className = 'si-empty';
                    activeSection.appendChild(emptyMsg);
                } else {
                    activeScrollsList.forEach(scrollName => {
                        const scroll = this.patterns[scrollName];
                        const element = this.getScrollElement(scrollName);
                        activeSection.appendChild(createScrollCard(scrollName, scroll, element, 'active'));
                    });
                }
                popup.appendChild(activeSection);

                // COMMON AREA SECTION
                const commonSection = document.createElement('div');
                commonSection.className = 'si-section si-common';

                const commonAreaScrolls = this.getCommonAreaScrolls();
                const commonHeader = document.createElement('h3');
                commonHeader.textContent = `Common Area (${commonAreaScrolls.length}/6) - Shared`;
                commonHeader.className = 'si-section-header';
                commonSection.appendChild(commonHeader);

                const commonSubtitle = document.createElement('div');
                commonSubtitle.textContent = 'Discarded scrolls go here. Any player can activate these on their turn.';
                commonSubtitle.className = 'si-common-note';
                commonSection.appendChild(commonSubtitle);

                if (commonAreaScrolls.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.textContent = 'No scrolls in common area yet. Discarded scrolls will appear here.';
                    emptyMsg.className = 'si-empty';
                    commonSection.appendChild(emptyMsg);
                } else {
                    const elementTypes = ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'];
                    elementTypes.forEach(element => {
                        if (this.commonArea[element]) {
                            const scrollName = this.commonArea[element];
                            const scroll = this.patterns[scrollName];

                            const scrollDiv = document.createElement('div');
                            scrollDiv.className = 'si-common-item';

                            const color = element === 'catacomb' ? '#9b59b6' : STONE_TYPES[element].color;
                            const iconHTML = `<img src="${STONE_TYPES[element].img}" class="element-icon-sm" alt="${element}" style="vertical-align:middle;">`;

                            const nameDiv = document.createElement('div');
                            nameDiv.innerHTML = `<span style="color:${color}">${iconHTML}</span> ${scroll.name}`;
                            nameDiv.className = 'si-common-item-name';
                            scrollDiv.appendChild(nameDiv);

                            const descDiv = document.createElement('div');
                            descDiv.textContent = scroll.description;
                            descDiv.className = 'si-common-item-desc';
                            scrollDiv.appendChild(descDiv);

                            if (scroll.patterns) {
                                const patternVisual = this.createPatternVisual(scroll, element);
                                scrollDiv.appendChild(patternVisual);
                            }

                            commonSection.appendChild(scrollDiv);
                        }
                    });
                }
                popup.appendChild(commonSection);

                // HAND SECTION
                const handSection = document.createElement('div');
                handSection.className = 'si-section si-hand';

                const handHeader = document.createElement('h3');
                handHeader.textContent = `Hand (${this.handScrolls.size}/${this.MAX_HAND_SIZE}) - Private`;
                handHeader.className = 'si-section-header';
                handSection.appendChild(handHeader);

                const handScrollsList = Array.from(this.handScrolls);
                if (handScrollsList.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.textContent = 'No scrolls in hand. Reveal shrine tiles to collect scrolls!';
                    emptyMsg.className = 'si-empty';
                    handSection.appendChild(emptyMsg);
                } else {
                    const elementTypes = ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'];
                    elementTypes.forEach(element => {
                        const elementScrolls = handScrollsList.filter(s => this.getScrollElement(s) === element);
                        if (elementScrolls.length > 0) {
                            const elementLabel = document.createElement('div');
                            const color = element === 'catacomb' ? '#9b59b6' : STONE_TYPES[element].color;
                            const iconHTML = `<img src="${STONE_TYPES[element].img}" class="element-icon-sm" alt="${element}" style="vertical-align:middle;">`;
                            elementLabel.innerHTML = `<span style="color:${color}">${iconHTML} ${element.charAt(0).toUpperCase() + element.slice(1)}</span>`;
                            elementLabel.className = 'si-element-label';
                            handSection.appendChild(elementLabel);

                            elementScrolls.forEach(scrollName => {
                                const scroll = this.patterns[scrollName];
                                handSection.appendChild(createScrollCard(scrollName, scroll, element, 'hand'));
                            });
                        }
                    });
                }
                popup.appendChild(handSection);

                const infoText = document.createElement('div');
                infoText.innerHTML = '<strong>Tip:</strong> Move scrolls from Hand to Active Area (0 AP) to prepare for casting. Scrolls in Active Area stay there after casting. Scrolls cannot be moved back to Hand — discard to Common Area instead. Common Area scrolls are shared (max 1 per element).';
                infoText.className = 'si-tip';
                popup.appendChild(infoText);

                document.body.appendChild(popup);
            }

            updateScrollCount() {
                const total = this.handScrolls.size + this.activeScrolls.size;
                const scrollCountEl = document.getElementById('scroll-count');
                if (scrollCountEl) scrollCountEl.textContent = total;

                // Update HUD (safely - may not be ready during initialization)
                try {
                    if (typeof updateHUD === 'function') updateHUD();
                } catch (e) {
                    // Ignore - HUD not ready yet
                }

                // Update scroll deck UI (safely)
                try {
                    if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
                } catch (e) {
                    // Ignore - UI not ready yet
                }
            }
        }

        function toRoman(num) {
            const map = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
            return map[num] || num;
        }

        // Core game state - declare these FIRST
        let placedTiles = [];
        let placedStones = [];
        let playerPositions = []; // Array of {x, y, element, color} for each player
        let activePlayerIndex = 0; // Which player is currently active
        
        // Player pools - one per player
        let playerPools = []; // Each entry is player's stone pool (for testing: start with 5 of each)
        const playerPoolCapacity = { earth: 5, water: 5, fire: 5, wind: 5, void: 5 };
        const INITIAL_PLAYER_STONES = { earth: 0, water: 0, fire: 0, wind: 0, void: 0 };

        // Elemental source pool - stones available from shrines (max 25 each)
        const sourcePool = { earth: 20, water: 20, fire: 20, wind: 20, void: 20 };
        const sourcePoolCapacity = { earth: 25, water: 25, fire: 25, wind: 25, void: 25 };

        // Initialize spell system (after activePlayerIndex is defined)
        const spellSystem = new SpellSystem();

        // Compatibility: playerPool and stoneCounts refer to active player's pool
        // In multiplayer, playerPool shows MY pool (for display), but operations use activePlayerIndex
        Object.defineProperty(window, 'playerPool', {
            get() {
                // In multiplayer, show my own pool in the UI
                const displayIndex = (isMultiplayer && myPlayerIndex !== null) ? myPlayerIndex : activePlayerIndex;
                if (!playerPools[displayIndex]) {
                    playerPools[displayIndex] = { ...INITIAL_PLAYER_STONES };
                }
                return playerPools[displayIndex];
            }
        });
        Object.defineProperty(window, 'stoneCounts', {
            get() {
                // In multiplayer, show my own pool in the UI
                const displayIndex = (isMultiplayer && myPlayerIndex !== null) ? myPlayerIndex : activePlayerIndex;
                if (!playerPools[displayIndex]) {
                    playerPools[displayIndex] = { ...INITIAL_PLAYER_STONES };
                }
                return playerPools[displayIndex];
            }
        });
        const stoneCapacity = playerPoolCapacity;

        // Expose sourcePool as stonePools for scroll effects system
        window.stonePools = sourcePool;
        // Expose playerPools so scroll effects (e.g. Arson) can read opponent pools
        window.playerPools = playerPools;

        const boardSvg = document.getElementById('boardSvg');
        // Improve mobile interactions: prevent browser gestures from stealing touches
        boardSvg.style.touchAction = 'none';
        const viewport = document.getElementById('viewport');
        const deckTileSvg = document.getElementById('deckTile');
        const snapIndicator = document.getElementById('snapIndicator');
        
        // Compatibility: make playerPosition work as before for active player
        Object.defineProperty(window, 'playerPosition', {
            get() { return playerPositions[activePlayerIndex] || null; },
            set(val) { 
                if (val === null) {
                    playerPositions = [];
                    activePlayerIndex = 0;
                }
            }
        });
        
        let playerColor = null; // Current player's color (when placing their tile)
        let gameSessionColors = new Set(); // Colors used in the current game
        let currentAP = 5;
        let voidAP = 0; // Bonus AP from void stones (used first)
        let lastMove = null; // Stores { prevPos: {x, y}, newPos: {x, y}, apCost: number }

        // Track each player's AP for multiplayer display
        let playerAPs = []; // Each entry is { currentAP: 5, voidAP: 0 }

        // Track player activity for timeout/kick system
        let playerLastActivity = {}; // { playerId: timestamp }
        let activityCheckInterval = null;
        let gameInactivityTimeout = 120000;
        // Turn timer settings (reuses gameInactivityTimeout as the turn time limit, in ms)
        let kickOnTurnTimeout = true;
        let turnStartedAtMs = Date.now();
        let turnTimeoutInterval = null;
        let turnSyncInterval = null; // Host's periodic turn sync broadcast
        let commonAreaSyncInterval = null; // Host's periodic common area sync broadcast
 // Default 2 minutes in milliseconds (set by host)
        let myLastActivity = Date.now(); // Track my own activity
        let timerDisplayInterval = null;

        const PLAYER_COLORS = {
            green: '#69d83a',
            blue: '#5894f4',
            red: '#ed1b43',
            yellow: '#ffce00',
            purple: '#9458f4'
        };

        // Mobile detection and touch support
        let isMobile = false;
        let mobileUIInitialized = false;
        function computeIsMobile() {
            return (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                || window.matchMedia('(max-width: 768px)').matches
                || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
                || window.matchMedia('(pointer: coarse)').matches);
        }
        function updateIsMobile() {
            const next = computeIsMobile();
            if (next === isMobile && mobileUIInitialized) return;
            isMobile = next;

            // Initialize mobile UI once when we enter mobile mode
            if (isMobile && !mobileUIInitialized) {
                initializeMobileUI();
                mobileUIInitialized = true;
            }

            // Keep mobile decks in sync if mobile is active
            if (isMobile) {
                syncMobileTileDeck();
                syncMobileStoneDeck();
            }
        }

        // Touch state for gestures
        let touchStartTime = 0;
        let touchStartPos = { x: 0, y: 0 };
        let initialTouches = [];
        let initialRotation = 0;
        let isGestureRotating = false;
        let isPinching = false;
        let pinchStartDist = 0;
        let pinchStartScale = 1;
        let pinchStartMid = { x: 0, y: 0 };
        let pinchLastMid = { x: 0, y: 0 };
        let stoneLongPressTimer = null; // for long-press stone break on mobile

        // Helper function to get event coordinates (works for both mouse and touch)
        function getEventCoords(e) {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        }

        // Calculate angle between two touch points
        function getTouchAngle(touch1, touch2) {
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            return Math.atan2(dy, dx) * (180 / Math.PI);
        }

        // Snap angle to nearest 60 degrees (6 positions for hexagon)
        function snapToHexRotation(degrees) {
            const step = 60;
            return Math.round(degrees / step) % 6;
        }

        function updateVoidAP() {
            // Void AP display only — does NOT increase voidAP beyond current value.
            // New void stones load as "spent" so they don't grant extra AP mid-turn.
            // voidAP can only decrease here (if stones were lost/broken).
            const oldVoidAP = voidAP;
            const poolVoid = playerPool.void;
            if (voidAP > poolVoid) {
                // Stones were lost — clamp voidAP down
                voidAP = poolVoid;
            }
            // Otherwise leave voidAP as-is (new stones are "spent" until next turn)
            console.log(`📄 updateVoidAP: ${oldVoidAP} → ${voidAP} (pool=${poolVoid})`);
            const display = document.getElementById('void-ap-display');
            if (display) {
                if (voidAP > 0) {
                    display.textContent = `(+${voidAP} Void AP)`;
                    display.style.display = 'inline';
                } else {
                    display.style.display = 'none';
                }
            }

            // Update HUD
            if (typeof updateHUD === 'function') updateHUD();
        }

        // Refresh void AP to match pool — called only at turn start
        function refreshVoidAP() {
            voidAP = playerPool.void;
            console.log(`🔄 refreshVoidAP: voidAP set to ${voidAP} (pool=${playerPool.void})`);
            const display = document.getElementById('void-ap-display');
            if (display) {
                if (voidAP > 0) {
                    display.textContent = `(+${voidAP} Void AP)`;
                    display.style.display = 'inline';
                } else {
                    display.style.display = 'none';
                }
            }
            if (typeof updateHUD === 'function') updateHUD();
        }

        function getTotalAP() {
            return currentAP + voidAP;
        }

        function spendAP(cost) {
            console.log(`⚡ spendAP called: cost=${cost}, before: voidAP=${voidAP}, currentAP=${currentAP}`);
            // Spend void AP first, then regular AP
            if (voidAP >= cost) {
                voidAP -= cost;
            } else {
                const remainingCost = cost - voidAP;
                voidAP = 0;
                currentAP -= remainingCost;
            }
            console.log(`⚡ spendAP after: voidAP=${voidAP}, currentAP=${currentAP}, total=${getTotalAP()}`);
            const apCountEl = document.getElementById('ap-count');
            if (apCountEl) apCountEl.textContent = currentAP;

            // Update void AP display (but don't reset from pool - that would undo the spend!)
            const display = document.getElementById('void-ap-display');
            if (display) {
                if (voidAP > 0) {
                    display.textContent = `(+${voidAP} Void AP)`;
                    display.style.display = 'inline';
                } else {
                    display.style.display = 'none';
                }
            }

            // Update HUD
            if (typeof updateHUD === 'function') updateHUD();

            // Sync AP state in multiplayer
            syncPlayerState();

            // Prompt to end turn if out of AP (only on active player's turn)
            try {
                const canPrompt = (typeof isMyTurn === 'function') ? isMyTurn() : true;
                if (canPrompt && (typeof isPlacementPhase === 'undefined' || !isPlacementPhase) && getTotalAP() === 0) {
                    if (typeof window !== 'undefined' && typeof window.showEndTurnPrompt === 'function') {
                        window.showEndTurnPrompt();
                    }
                }
            } catch (e) {}
        }

        function addAP(amount) {
            if (amount <= 0) return;
            const maxAP = 5;
            const roomInCurrent = maxAP - currentAP;
            const addToCurrent = Math.min(amount, roomInCurrent);
            currentAP += addToCurrent;
            const overflow = amount - addToCurrent;
            // Overflow can only recharge void AP if the player has void stones (void AP cap = playerPool.void)
            if (overflow > 0 && typeof playerPool !== 'undefined' && playerPool.void > 0) {
                const maxVoidAP = playerPool.void;
                const addToVoid = Math.min(overflow, maxVoidAP - voidAP);
                if (addToVoid > 0) voidAP += addToVoid;
            }
            const apCountEl = document.getElementById('ap-count');
            if (apCountEl) apCountEl.textContent = currentAP;
            const voidDisplay = document.getElementById('void-ap-display');
            if (voidDisplay) {
                if (voidAP > 0) {
                    voidDisplay.textContent = `(+${voidAP} Void AP)`;
                    voidDisplay.style.display = 'inline';
                } else {
                    voidDisplay.style.display = 'none';
                }
            }
            if (typeof updateHUD === 'function') updateHUD();
            if (typeof syncPlayerState === 'function') syncPlayerState();
        }
        if (typeof window !== 'undefined') window.addAP = addAP;

        function canAfford(cost) {
            return getTotalAP() >= cost;
        }

        function attemptBreakStone(stoneId) {
            const stone = placedStones.find(s => s.id === stoneId);
            if (!stone) {
                console.log('❌ Stone not found');
                return;
            }

            console.log(`🔨 attemptBreakStone called for stone id=${stoneId}, type=${stone.type}, position=(${stone.x.toFixed(1)}, ${stone.y.toFixed(1)})`);

            // Check if stone is adjacent to player
            if (!playerPosition) {
                updateStatus('❌ No player on board!');
                console.log('❌ No player on board!');
                return;
            }

            const isAdj = isAdjacentToPlayer(stone.x, stone.y);
            console.log(`🔨 Adjacency check: ${isAdj}`);
            
            if (!isAdj) {
                updateStatus('❌ Stone must be adjacent to player to break!');
                console.log('❌ Stone must be adjacent to player to break!');
                return;
            }

            // Calculate break cost based on stone rank
            const STONE_RANK = {
                'void': 1,
                'wind': 2,
                'fire': 3,
                'water': 4,
                'earth': 5
            };

            const breakCost = STONE_RANK[stone.type];

            if (!canAfford(breakCost)) {
                updateStatus(`❌ Not enough AP! Need ${breakCost} AP to break ${stone.type} stone (have ${getTotalAP()} AP)`);
                return;
            }

            // Break the stone
            spendAP(breakCost);

            // Broadcast stone break to other players
            if (isMultiplayer) {
                broadcastGameAction('stone-break', {
                    stoneId: stoneId
                });
            }

            // Remove stone from board
            const stoneElement = stone.element;
            if (stoneElement && stoneElement.parentNode) {
                stoneElement.remove();
            }

            // Remove from placedStones array
            const index = placedStones.findIndex(s => s.id === stoneId);
            if (index !== -1) {
                placedStones.splice(index, 1);
            }

            // Return stone to source pool
            returnStoneToPool(stone.type);

            // Update interactions since a stone was removed
            updateTileClasses();
            recheckAllStoneInteractions();
            updateAllWaterStoneVisuals();
            updateAllVoidNullificationVisuals();

            updateStatus(`🔨 Broke ${stone.type} stone! Cost: ${breakCost} AP (${getTotalAP()} AP remaining)`);
            console.log(`🔨 Broke ${stone.type} stone (id=${stoneId}), cost=${breakCost} AP`);
        }

        let isDraggingTile = false;
        let isDraggingStone = false;
        let draggedTileId = null;
        let draggedTileRotation = 0;
        let draggedTileFlipped = false;
        let draggedTileShrineType = null;
        let draggedTileOriginalPos = null; // Store original position for snap-back
        let draggedStoneId = null;
        let draggedStoneType = null;
        let draggedStoneOriginalPos = null; // Store original position for stone move
        let ghostTile = null;
        let ghostStone = null;
        let currentRotation = 0;
        let currentFlipped = true; // Start with tiles hidden (flipped)
        let tileMoveMode = false; // Tiles are locked by default

        // Telekinesis state — set by Void Scroll III to track tile moves
        // { active: true, movesLeft: 3, maxMoves: 3, casterIndex: N, movedTiles: [] }
        window.telekinesisState = null;


        // Tile deck - 4 of each shrine type (24 tiles total for 1 player)
        let tileDeck = [];
        let deckIndex = 0;
        let deckSeed = null; // Shared seed for multiplayer deck synchronization

        // Player tile deck
        let playerTilesAvailable = 0;
        let playerTileElements = [];

        // Seeded random number generator (Mulberry32)
        // This ensures all players get the same shuffle with the same seed
        function seededRandom(seed) {
            return function() {
                let t = seed += 0x6D2B79F5;
                t = Math.imul(t ^ t >>> 15, t | 1);
                t ^= t + Math.imul(t ^ t >>> 7, t | 61);
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        }

        function initializeDeck(numPlayers = 1, seed = null) {
            // Tutorial mode: use a fixed deck order so earth lands at the center position
            if (window.tutorialDeckOverride) {
                tileDeck = [...window.tutorialDeckOverride];
                window.tutorialDeckOverride = null;
                deckIndex = 0;
                const countEl = document.getElementById('deck-count');
                if (countEl) countEl.textContent = `0/${tileDeck.length}`;
                console.log('🎓 Tutorial deck applied:', tileDeck.join(', '));
                return;
            }

            const shrineTypes = ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'];
            const tilesPerType = numPlayers; // 1 of each type per player

            tileDeck = [];

            shrineTypes.forEach(type => {
                for (let i = 0; i < tilesPerType; i++) {
                    tileDeck.push(type);
                }
            });

            // Use seeded shuffle if seed provided (multiplayer), otherwise random
            if (seed !== null) {
                deckSeed = seed;
                const rng = seededRandom(seed);
                // Seeded Fisher-Yates shuffle
                for (let i = tileDeck.length - 1; i > 0; i--) {
                    const j = Math.floor(rng() * (i + 1));
                    [tileDeck[i], tileDeck[j]] = [tileDeck[j], tileDeck[i]];
                }
                console.log(`🎴 Deck initialized with seed ${seed}:`, tileDeck.join(', '));
            } else {
                // Random shuffle for single player
                for (let i = tileDeck.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [tileDeck[i], tileDeck[j]] = [tileDeck[j], tileDeck[i]];
                }
                console.log(`🎴 Deck initialized (random):`, tileDeck.join(', '));
            }

            deckIndex = 0;
        }

        function drawNextTileFromDeck() {
            if (deckIndex >= tileDeck.length) {
                updateStatus('No more tiles in deck!');
                return null;
            }
            const shrineType = tileDeck[deckIndex];
            deckIndex++;
            document.getElementById('deck-count').textContent = `${deckIndex}/${tileDeck.length}`;
            updateStatus(`Drew ${shrineType} tile (${deckIndex}/${tileDeck.length} used)`);
            return shrineType;
        }

        let viewportX = 0;
        let viewportY = 0;
        let viewportScale = 1;
        let viewportRotation = 0;
        let isPanning = false;
        let panStartX = 0;
        let panStartY = 0;
        let lastPanX = 0;
        let lastPanY = 0;
        let isRotatingBoard = false;
        let rotateStartX = 0;
        let rotateStartRotation = 0;
        let isRotatingTile = false;
        let rotateTileStartX = 0;
        let rotateTileStartRotation = 0;
        let leftButtonDown = false;
        let rightButtonDown = false;

        function updateViewport() {
            const centerX = boardSvg.clientWidth / 2;
            const centerY = boardSvg.clientHeight / 2;
            viewport.setAttribute('transform',
                `translate(${centerX}, ${centerY}) rotate(${viewportRotation}) translate(${viewportX - centerX}, ${viewportY - centerY}) scale(${viewportScale})`);
        }

        // Fit all placed tiles into view, centered
        function fitBoardToView() {
            if (placedTiles.length === 0) return;

            // Calculate bounding box of all tiles
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            placedTiles.forEach(tile => {
                // Each tile is roughly TILE_SIZE * 2.5 in radius
                const tileRadius = TILE_SIZE * 2.5;
                minX = Math.min(minX, tile.x - tileRadius);
                maxX = Math.max(maxX, tile.x + tileRadius);
                minY = Math.min(minY, tile.y - tileRadius);
                maxY = Math.max(maxY, tile.y + tileRadius);
            });

            const boardWidth = maxX - minX;
            const boardHeight = maxY - minY;
            const boardCenterX = (minX + maxX) / 2;
            const boardCenterY = (minY + maxY) / 2;

            // Get available screen space
            const svgRect = boardSvg.getBoundingClientRect();
            const screenWidth = svgRect.width;
            const screenHeight = svgRect.height;

            // Add padding (10% on each side)
            const paddingFactor = 0.8;
            const scaleX = (screenWidth * paddingFactor) / boardWidth;
            const scaleY = (screenHeight * paddingFactor) / boardHeight;
            const newScale = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

            // Center the board
            const screenCenterX = screenWidth / 2;
            const screenCenterY = screenHeight / 2;

            viewportScale = newScale;
            viewportX = screenCenterX - boardCenterX * newScale;
            viewportY = screenCenterY - boardCenterY * newScale;

            console.log(`📐 fitBoardToView: board=(${boardWidth.toFixed(0)}x${boardHeight.toFixed(0)}), screen=(${screenWidth.toFixed(0)}x${screenHeight.toFixed(0)}), scale=${newScale.toFixed(2)}`);

            updateViewport();
        }

        function screenToWorld(screenX, screenY) {
            const centerX = boardSvg.clientWidth / 2;
            const centerY = boardSvg.clientHeight / 2;
            let x = screenX - centerX;
            let y = screenY - centerY;
            const rad = -viewportRotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rotatedX = x * cos - y * sin;
            const rotatedY = x * sin + y * cos;
            const scaledX = rotatedX / viewportScale;
            const scaledY = rotatedY / viewportScale;
            const worldX = scaledX - (viewportX - centerX) / viewportScale;
            const worldY = scaledY - (viewportY - centerY) / viewportScale;
            return { x: worldX, y: worldY };
        }

        function hexToPixel(q, r, s) {
            const width = s * Math.sqrt(3);
            const height = 2 * s;
            const x = width * (q + r / 2);
            const y = height * (3/4) * r;
            return { x, y };
        }

        function pixelToHex(x, y, s) {
            const q = (x * Math.sqrt(3)/3 - y / 3) / s;
            const r = (y * 2/3) / s;
            return hexRound(q, r);
        }

        function hexRound(q, r) {
            let s = -q - r;
            let rq = Math.round(q);
            let rr = Math.round(r);
            let rs = Math.round(s);
            const qDiff = Math.abs(rq - q);
            const rDiff = Math.abs(rr - r);
            const sDiff = Math.abs(rs - s);
            if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
            else if (rDiff > sDiff) rr = -rq - rs;
            return { q: rq, r: rr };
        }

        function createHexagonPoints(cx, cy, s) {
            const points = [];
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                const x = cx + s * Math.cos(angle);
                const y = cy + s * Math.sin(angle);
                points.push(`${x},${y}`);
            }
            return points.join(' ');
        }

        function createTrapezoidPoints(cx, cy, s, direction) {
            const hexVertices = [];
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                hexVertices.push({
                    x: cx + s * Math.cos(angle),
                    y: cy + s * Math.sin(angle)
                });
            }
            const indices = [
                [1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 0],
                [4, 5, 0, 1], [5, 0, 1, 2], [0, 1, 2, 3]
            ][direction];
            return indices.map(idx => `${hexVertices[idx].x},${hexVertices[idx].y}`).join(' ');
        }

        function createTileGroup(s, rotation = 0, flipped = false) {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('transform', `rotate(${rotation * 60})`);

            if (flipped) {
                // Flipped side: only outer ring of hexagons + trapezoids (no center, no inner ring)
                const hexagons = [
                    { q: 2, r: -1 }, { q: 1, r: 1 }, { q: -1, r: 2 },
                    { q: -2, r: 1 }, { q: -1, r: -1 }, { q: 1, r: -2 }
                ];

                hexagons.forEach(hex => {
                    const pos = hexToPixel(hex.q, hex.r, s);
                    const points = createHexagonPoints(pos.x, pos.y, s);
                    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    polygon.setAttribute('points', points);
                    polygon.setAttribute('class', 'hex-tile flipped');
                    g.appendChild(polygon);
                });

                const trapezoids = [
                    { q: 2, r: 0, dir: 1 }, { q: 0, r: 2, dir: 2 },
                    { q: -2, r: 2, dir: 3 }, { q: -2, r: 0, dir: 4 },
                    { q: 0, r: -2, dir: 5 }, { q: 2, r: -2, dir: 0 }
                ];

                trapezoids.forEach(trap => {
                    const pos = hexToPixel(trap.q, trap.r, s);
                    const points = createTrapezoidPoints(pos.x, pos.y, s, trap.dir);
                    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    polygon.setAttribute('points', points);
                    polygon.setAttribute('class', 'hex-tile trapezoid flipped');
                    g.appendChild(polygon);
                });

                // Add empty center hex for visual reference (no fill)
                const centerPos = hexToPixel(0, 0, s);
                const centerPoints = createHexagonPoints(centerPos.x, centerPos.y, s);
                const centerPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                centerPolygon.setAttribute('points', centerPoints);
                centerPolygon.setAttribute('class', 'hex-tile empty-center');
                g.appendChild(centerPolygon);
            } else {
                // Normal side: all hexagons
                const hexagons = [
                    { q: 0, r: 0, class: 'center-hex' },
                    { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
                    { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
                    { q: 2, r: -1 }, { q: 1, r: 1 }, { q: -1, r: 2 },
                    { q: -2, r: 1 }, { q: -1, r: -1 }, { q: 1, r: -2 }
                ];

                hexagons.forEach(hex => {
                    const pos = hexToPixel(hex.q, hex.r, s);
                    const points = createHexagonPoints(pos.x, pos.y, s);
                    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    polygon.setAttribute('points', points);
                    polygon.setAttribute('class', `hex-tile ${hex.class || ''}`);
                    g.appendChild(polygon);
                });

                const trapezoids = [
                    { q: 2, r: 0, dir: 1 }, { q: 0, r: 2, dir: 2 },
                    { q: -2, r: 2, dir: 3 }, { q: -2, r: 0, dir: 4 },
                    { q: 0, r: -2, dir: 5 }, { q: 2, r: -2, dir: 0 }
                ];

                trapezoids.forEach(trap => {
                    const pos = hexToPixel(trap.q, trap.r, s);
                    const points = createTrapezoidPoints(pos.x, pos.y, s, trap.dir);
                    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    polygon.setAttribute('points', points);
                    polygon.setAttribute('class', 'hex-tile trapezoid');
                    g.appendChild(polygon);
                });
            }

            return g;
        }

        function drawDeckTile() {
            deckTileSvg.innerHTML = '';
            const tile = createTileGroup(6, currentRotation, currentFlipped);
            tile.setAttribute('transform', 'translate(75, 75)');
            deckTileSvg.appendChild(tile);
        }

        function initializePlayerTiles(numPlayers) {
            const playerTileDeck = document.getElementById('new-player-tile-deck') || document.getElementById('player-tile-deck');
            playerTileDeck.innerHTML = '';
            playerTileElements = [];
            playerTilesAvailable = numPlayers;
            const countEl = document.getElementById('new-player-tile-count') || document.getElementById('player-tile-count');
            if (countEl) countEl.textContent = numPlayers;

            for (let i = 0; i < numPlayers; i++) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '150');
                svg.setAttribute('height', '150');
                svg.setAttribute('class', 'deck-tile player-tile-deck-item');
                svg.setAttribute('data-player-index', i);

                const tile = createTileGroup(6, 0, false); // Player tiles are not flipped
                tile.setAttribute('transform', 'translate(75, 75)');
                svg.appendChild(tile);

                playerTileDeck.appendChild(svg);
                playerTileElements.push(svg);

                // Add mousedown event for dragging
                svg.addEventListener('mousedown', (e) => {
                    if (playerTilesAvailable <= 0) return;
                    if (e.button === 0) {
                        startPlayerTileDrag(i, e);
                    }
                });

                // Add touch support for mobile
                svg.addEventListener('touchstart', (e) => {
                    if (playerTilesAvailable <= 0) return;
                    e.preventDefault();
                    startPlayerTileDrag(i, e);
                }, { passive: false });
            }
            if (isMobile) syncMobileTileDeck();

        }

        // Initialize a single player tile for multiplayer (only MY tile)
        function initializeMyPlayerTile(playerIndex, color) {
            const playerTileDeck = document.getElementById('new-player-tile-deck') || document.getElementById('player-tile-deck');
            playerTileDeck.innerHTML = '';
            playerTileElements = [];
            playerTilesAvailable = 1;
            const countEl = document.getElementById('new-player-tile-count') || document.getElementById('player-tile-count');
            if (countEl) countEl.textContent = '1';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '150');
            svg.setAttribute('height', '150');
            svg.setAttribute('class', 'deck-tile player-tile-deck-item');
            svg.setAttribute('data-player-index', playerIndex);

            const tile = createTileGroup(6, 0, false);
            tile.setAttribute('transform', 'translate(75, 75)');
            svg.appendChild(tile);

            // Add color indicator to show which player this is
            const colorCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            colorCircle.setAttribute('cx', '75');
            colorCircle.setAttribute('cy', '75');
            colorCircle.setAttribute('r', '12');
            colorCircle.setAttribute('fill', color);
            colorCircle.setAttribute('stroke', '#000');
            colorCircle.setAttribute('stroke-width', '2');
            svg.appendChild(colorCircle);

            playerTileDeck.appendChild(svg);
            playerTileElements.push(svg);

            // Add mousedown event for dragging
            svg.addEventListener('mousedown', (e) => {
                if (playerTilesAvailable <= 0) return;
                // Placement tiles can only be dragged during the placement phase
                if (!isPlacementPhase) return;
                // In multiplayer, only allow drag if it's your turn to place
                if (isMultiplayer && !canPlaceTile()) {
                    notYourTurn();
                    return;
                }
                if (e.button === 0) {
                    startPlayerTileDrag(playerIndex, e);
                }
            });

            // Add touch support for mobile
            svg.addEventListener('touchstart', (e) => {
                if (playerTilesAvailable <= 0) return;
                if (!isPlacementPhase) return;
                if (isMultiplayer && !canPlaceTile()) {
                    notYourTurn();
                    return;
                }
                e.preventDefault();
                startPlayerTileDrag(playerIndex, e);
            }, { passive: false });
            if (isMobile) syncMobileTileDeck();

        }

        function startPlayerTileDrag(playerIndex, e) {
            isDraggingTile = true;
            draggedTileId = null;
            draggedTileRotation = 0;
            draggedTileFlipped = false;
            draggedTileShrineType = 'player'; // Mark as player tile
            draggedTileOriginalPos = null;

            const rect = boardSvg.getBoundingClientRect();
            const coords = getEventCoords(e);
            const screenX = coords.x - rect.left;
            const screenY = coords.y - rect.top;
            const world = screenToWorld(screenX, screenY);

            ghostTile = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            ghostTile.setAttribute('class', 'ghost-tile');
            ghostTile.setAttribute('transform', `translate(${world.x}, ${world.y})`);
            const tile = createTileGroup(TILE_SIZE, 0, false);
            ghostTile.appendChild(tile);
            viewport.appendChild(ghostTile);
        }

        function getAllHexagonPositions() {
            const positions = new Map();
            const trapezoidMap = new Map();

            placedTiles.forEach(tile => {
                const s = TILE_SIZE;

                // For flipped tiles, only include outer ring hexagons
                // For normal tiles and player tiles, include all hexagons
                // Player tiles look revealed but allow walking off them
                let hexagons;
                if (tile.flipped && !tile.isPlayerTile) {
                    hexagons = [
                        { q: 2, r: -1 }, { q: 1, r: 1 }, { q: -1, r: 2 },
                        { q: -2, r: 1 }, { q: -1, r: -1 }, { q: 1, r: -2 }
                    ];
                } else {
                    hexagons = [
                        { q: 0, r: 0 },
                        { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
                        { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
                        { q: 2, r: -1 }, { q: 1, r: 1 }, { q: -1, r: 2 },
                        { q: -2, r: 1 }, { q: -1, r: -1 }, { q: 1, r: -2 }
                    ];
                }

                hexagons.forEach(hex => {
                    const localPos = hexToPixel(hex.q, hex.r, s);
                    const globalX = tile.x + localPos.x;
                    const globalY = tile.y + localPos.y;
                    const roundedX = Math.round(globalX * 100) / 100;
                    const roundedY = Math.round(globalY * 100) / 100;
                    const key = `${roundedX},${roundedY}`;
                    if (!positions.has(key)) {
                        positions.set(key, { x: globalX, y: globalY, key, tiles: [tile] });
                    } else {
                        // Track which tiles contribute to this position
                        const existing = positions.get(key);
                        if (!existing.tiles.includes(tile)) {
                            existing.tiles.push(tile);
                        }
                    }
                });

                const trapezoids = [
                    { q: 2, r: 0 }, { q: 0, r: 2 }, { q: -2, r: 2 },
                    { q: -2, r: 0 }, { q: 0, r: -2 }, { q: 2, r: -2 }
                ];

                trapezoids.forEach(trap => {
                    const localPos = hexToPixel(trap.q, trap.r, s);
                    const globalX = tile.x + localPos.x;
                    const globalY = tile.y + localPos.y;
                    const roundedX = Math.round(globalX * 100) / 100;
                    const roundedY = Math.round(globalY * 100) / 100;
                    const key = `${roundedX},${roundedY}`;
                    if (!trapezoidMap.has(key)) {
                        trapezoidMap.set(key, { count: 1, x: globalX, y: globalY, key, tiles: [tile] });
                    } else {
                        const existing = trapezoidMap.get(key);
                        existing.count += 1;
                        if (!existing.tiles.includes(tile)) {
                            existing.tiles.push(tile);
                        }
                        if (existing.count >= 2 && !positions.has(key)) {
                            positions.set(key, { x: globalX, y: globalY, key, tiles: existing.tiles });
                        }
                    }
                });
            });

            return Array.from(positions.values());
        }

        function isPositionOnFlippedTile(x, y, hexPositions) {
            // Find the hex position that matches this x,y
            const matchingPos = hexPositions.find(pos => {
                const dist = Math.sqrt(Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2));
                return dist < 5;
            });

            if (!matchingPos || !matchingPos.tiles) return false;

            // Check if ANY of the tiles contributing to this position are flipped (and not player tile)
            return matchingPos.tiles.some(tile => tile.flipped && !tile.isPlayerTile);
        }

        function findValidStonePosition(x, y) {
            const hexPositions = getAllHexagonPositions();
            let nearest = null;
            let minDist = Infinity;

            hexPositions.forEach(pos => {
                const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                if (dist < minDist) {
                    minDist = dist;
                    nearest = pos;
                }
            });

            if (nearest && minDist < TILE_SIZE * 2) {
                const occupied = placedStones.some(stone => {
                    const dist = Math.sqrt(Math.pow(stone.x - nearest.x, 2) + Math.pow(stone.y - nearest.y, 2));
                    return dist < 5;
                });

                // Block placement on any player (active or other players)
                let anyPlayerHere = false;
                if (playerPosition) {
                    const d = Math.sqrt(Math.pow(playerPosition.x - nearest.x, 2) + Math.pow(playerPosition.y - nearest.y, 2));
                    if (d < 5) anyPlayerHere = true;
                }
                if (typeof playerPositions !== 'undefined' && playerPositions.length) {
                    playerPositions.forEach(pos => {
                        if (pos && pos.x != null && pos.y != null) {
                            const d = Math.sqrt(Math.pow(pos.x - nearest.x, 2) + Math.pow(pos.y - nearest.y, 2));
                            if (d < 5) anyPlayerHere = true;
                        }
                    });
                }

                const onFlippedTile = isPositionOnFlippedTile(nearest.x, nearest.y, hexPositions);

                // Check if position is valid for placement based on active buffs
                const inPlacementRange = playerPosition && isInPlacementRange(nearest.x, nearest.y, draggedStoneType);

                if (!occupied && !anyPlayerHere && !onFlippedTile && inPlacementRange) {
                    return { x: nearest.x, y: nearest.y, valid: true };
                }
            }

            return { x: x, y: y, valid: false };
        }

        // Lightweight log throttling for noisy debug statements
        const _debugLogTimes = {};
        function shouldDebugLog(key, minIntervalMs = 250) {
            if (typeof window !== 'undefined' && window.DEBUG_LOG_VERBOSE) return true;
            const now = Date.now();
            const last = _debugLogTimes[key] || 0;
            if (now - last >= minIntervalMs) {
                _debugLogTimes[key] = now;
                return true;
            }
            return false;
        }
        if (typeof window !== 'undefined') {
            window.shouldDebugLog = shouldDebugLog;
        }

        // Scroll event log buffer (low-noise timeline for debugging)
        if (typeof window !== 'undefined') {
            window._scrollEventLog = window._scrollEventLog || [];
            window.logScrollEvent = function logScrollEvent(type, details = {}) {
                const entry = {
                    ts: new Date().toISOString(),
                    type,
                    details
                };
                window._scrollEventLog.push(entry);
                if (window._scrollEventLog.length > 200) {
                    window._scrollEventLog.shift();
                }
            };
            window.dumpScrollEvents = function dumpScrollEvents() {
                const log = window._scrollEventLog || [];
                console.group(`📜 Scroll Event Log (${log.length} events)`);
                log.forEach((e, i) => {
                    const time = new Date(e.ts).toLocaleTimeString();
                    const type = e.type.padEnd(20);
                    const details = JSON.stringify(e.details);
                    console.log(`#${i + 1} [${time}] ${type} ${details}`);
                });
                console.groupEnd();
            };

            // Clean scroll diagnostics - shows current state + recent events
            window.scrollDiag = function scrollDiag() {
                console.log('\n' + '═'.repeat(80));
                console.log('📊 SCROLL DIAGNOSTICS');
                console.log('═'.repeat(80));

                // Current scroll state
                if (typeof spellSystem !== 'undefined') {
                    console.log('\n📦 CURRENT STATE:\n');

                    for (let i = 0; i < (spellSystem.playerScrolls?.length || 0); i++) {
                        const p = spellSystem.playerScrolls[i];
                        if (!p) continue;
                        const playerName = typeof getPlayerColorName === 'function' ? getPlayerColorName(i) : `Player ${i}`;
                        const isMe = i === (typeof myPlayerIndex !== 'undefined' ? myPlayerIndex : -1);
                        const hand = Array.from(p.hand || []);
                        const active = Array.from(p.active || []);
                        const activated = Array.from(p.activated || []);

                        console.log(`${playerName} ${isMe ? '(YOU)' : ''}`);
                        console.log(`  Hand:    ${hand.length ? hand.join(', ') : '(empty)'}`);
                        console.log(`  Active:  ${active.length ? active.join(', ') : '(empty)'}`);
                        console.log(`  Win:     ${activated.length}/5 → ${activated.length ? activated.join(', ') : '(none)'}`);
                    }

                    console.log('\n🏛️  COMMON AREA:\n');
                    ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'].forEach(element => {
                        const scrollName = spellSystem.commonArea?.[element];
                        if (scrollName) {
                            console.log(`  ${element}: ${scrollName}`);
                        }
                    });

                    console.log('\n📚 DECKS:\n');
                    Object.keys(spellSystem.scrollDecks || {}).forEach(element => {
                        const count = (spellSystem.scrollDecks[element] || []).length;
                        console.log(`  ${element}: ${count} scrolls remaining`);
                    });
                }

                // Recent events
                const log = window._scrollEventLog || [];
                const recent = log.slice(-30);

                console.log('\n📜 RECENT EVENTS (last 30):\n');
                recent.forEach((e) => {
                    const time = new Date(e.ts).toLocaleTimeString();
                    const icon = {
                        'scroll_collected': '📥',
                        'scroll_cast': '⚡',
                        'scroll_moved': '➡️',
                        'scroll_discarded': '🗑️',
                        'effect_execute': '✨',
                        'response_counter': '🛡️',
                        'response_resolved': '⚔️',
                        'original_countered': '❌',
                        'original_resolved': '✅'
                    }[e.type] || '•';

                    let summary = e.type;
                    if (e.details.scrollName) summary += ` ${e.details.scrollName}`;
                    if (e.details.playerIndex !== undefined) {
                        const name = typeof getPlayerColorName === 'function' ? getPlayerColorName(e.details.playerIndex) : `P${e.details.playerIndex}`;
                        summary += ` [${name}]`;
                    }

                    console.log(`${icon} [${time}] ${summary}`);
                });

                console.log('\n' + '═'.repeat(80));
                console.log('Run scrollDiag() again to refresh');
                console.log('═'.repeat(80));
            };

            // Quick alias
            window.sd = window.scrollDiag;

            // Scroll audit command
            window.auditScrolls = function() {
                if (typeof spellSystem !== 'undefined' && spellSystem.auditScrolls) {
                    return spellSystem.auditScrolls();
                } else {
                    console.error('spellSystem not available');
                }
            };

            window.SHOW_SCROLL_FINDER_UI = false;
            window.SHOW_SCROLL_DECK_BROWSER = false;
            window.showScrollFinderUI = function () {
                window.SHOW_SCROLL_FINDER_UI = true;
                console.log('✅ Scroll finder UI enabled');
            };
            window.hideScrollFinderUI = function () {
                window.SHOW_SCROLL_FINDER_UI = false;
                console.log('✅ Scroll finder UI hidden');
            };
            window.showScrollDeckBrowserUI = function () {
                window.SHOW_SCROLL_DECK_BROWSER = true;
                console.log('✅ Scroll deck browser enabled');
            };
            window.hideScrollDeckBrowserUI = function () {
                window.SHOW_SCROLL_DECK_BROWSER = false;
                console.log('✅ Scroll deck browser hidden');
            };
            // Short commands
            window.showdeck = function () {
                window.SHOW_SCROLL_DECK_BROWSER = !window.SHOW_SCROLL_DECK_BROWSER;
                console.log(window.SHOW_SCROLL_DECK_BROWSER ? '✅ Scroll deck browser enabled' : '✅ Scroll deck browser hidden');
            };
            window.givePlayersFiveStones = function () {
                const pools = typeof playerPools !== 'undefined' ? playerPools : null;
                if (!pools) return;
                const count = typeof playerPositions !== 'undefined' ? playerPositions.length : pools.length;
                for (let i = 0; i < count; i++) {
                    if (!pools[i]) pools[i] = { ...INITIAL_PLAYER_STONES };
                    pools[i].earth = 5;
                    pools[i].water = 5;
                    pools[i].fire = 5;
                    pools[i].wind = 5;
                    pools[i].void = 5;
                }
                ['earth', 'water', 'fire', 'wind', 'void'].forEach(t => {
                    if (typeof updateStoneCount === 'function') updateStoneCount(t);
                });
                if (typeof updateVoidAP === 'function') updateVoidAP();
                if (typeof syncPlayerState === 'function') syncPlayerState();
                console.log('✅ Gave all players 5 stones each');
            };
            window.fillstones = function () {
                window.givePlayersFiveStones();
            };
            window.showDebugCommands = function () {
                console.log('Commands:');
                console.log('- dumpGameDebug()  /  debug()     — full game state snapshot (replaces dumpScrollDebug)');
                console.log('- dumpScrollDebug()               — alias for dumpGameDebug');
                console.log('- dumpScrollEvents()');
                console.log('- showScrollFinderUI()');
                console.log('- hideScrollFinderUI()');
                console.log('- showScrollDeckBrowserUI()');
                console.log('- hideScrollDeckBrowserUI()');
                console.log('- showdeck()  // toggle scroll deck browser');
                console.log('- givePlayersFiveStones()');
                console.log('- fillstones()');
                console.log('- window.KNOWN_BUGS              — list of open bug tickets');
                console.log('- window.DEBUG_LOG_VERBOSE = true/false');
            };
            window.help = function () {
                window.showDebugCommands();
            };
        }

        // ─────────────────────────────────────────────────────────────────────
        // KNOWN BUGS TODO LOG
        // ─────────────────────────────────────────────────────────────────────
        window.KNOWN_BUGS = [
            {
                id: 'TRANS-WIN-CON',
                status: 'open',
                title: 'Transmute win-condition marker',
                description: 'Casting Transmute (Fire IV) does not always display the fire ♦ symbol on the player shrine tile. Belt-and-suspenders tracking added inside execute(); still investigating root cause.'
            },
            {
                id: 'TRANS-DOUBLE-DISP',
                status: 'open',
                title: 'Transmute inventory display stale after discard',
                description: 'After transmuting a scroll from hand/active, the scroll inventory popup may still show the discarded scroll if the popup was open before Transmute. State is correct; Done button now refreshes the popup.'
            },
            {
                id: 'TURN-ORDER-NULL',
                status: 'fixed',
                title: 'Turn order crash on null playerPositions entries',
                description: 'If playerPositions has null/undefined entries (e.g. sparse indices after disconnect), COLOR_RANK[p.color] throws TypeError. Fixed with optional-chain guard p?.color and length guard.'
            },
            {
                id: 'COLOR-RANK-MP',
                status: 'fixed',
                title: 'Multiplayer turn order rank always 999 (wrong color key in playerPositions)',
                description: 'In multiplayer, playerPositions stored string color names (\'purple\', \'yellow\') instead of hex values (\'#9458f4\'), so COLOR_RANK lookups returned undefined → rank 999 for every player → non-deterministic turn order. Fixed: placePlayer() now always receives assignedColor (hex) not playerColor (string).'
            }
        ];
        (function printKnownBugs() {
            if (window.KNOWN_BUGS.length === 0) return;
            console.group('%c📋 Known Bugs (' + window.KNOWN_BUGS.length + ') — run dumpGameDebug() for full state', 'color:#e67e22;font-weight:bold');
            window.KNOWN_BUGS.forEach(function(b) {
                console.log('%c[' + b.status.toUpperCase() + '] ' + b.id + ': ' + b.title, 'color:#f39c12;font-weight:bold');
                console.log('   ' + b.description);
            });
            console.groupEnd();
        })();

        // ─────────────────────────────────────────────────────────────────────
        // COMPREHENSIVE GAME DEBUG TOOL  (replaces the old dumpScrollDebug)
        // ─────────────────────────────────────────────────────────────────────
        if (typeof window !== 'undefined') {
            window.dumpGameDebug = function dumpGameDebug() {
                try {
                    const ss = spellSystem;
                    const activeIdx  = typeof activePlayerIndex  !== 'undefined' ? activePlayerIndex  : null;
                    const myIdx      = typeof myPlayerIndex      !== 'undefined' ? myPlayerIndex      : null;
                    const numP       = typeof totalPlayers       !== 'undefined' ? totalPlayers       : 0;
                    const poolsArr   = typeof playerPools        !== 'undefined' ? playerPools        : [];
                    const posArr     = typeof playerPositions    !== 'undefined' ? playerPositions    : [];

                    // ── helpers ───────────────────────────────────────────────
                    const sumScrolls = (idx) => {
                        if (!ss?.playerScrolls?.[idx]) return { hand: [], active: [], activated: [] };
                        const p = ss.playerScrolls[idx];
                        return {
                            hand:      p.hand      ? Array.from(p.hand)      : [],
                            active:    p.active    ? Array.from(p.active)    : [],
                            activated: p.activated ? Array.from(p.activated) : []
                        };
                    };

                    // Turn order reconstruction
                    const COLOR_RANK_D = { '#9458f4': 1, '#ffce00': 2, '#ed1b43': 3, '#5894f4': 4, '#69d83a': 5 };
                    const sortedD = posArr
                        .map((p, idx) => ({ index: idx, color: p?.color, rank: COLOR_RANK_D[p?.color] || 999 }))
                        .filter((_, idx) => posArr[idx] != null)
                        .sort((a, b) => a.rank - b.rank);
                    const curSortIdx = sortedD.findIndex(p => p.index === activeIdx);

                    // Timer
                    const turnStarted = typeof turnStartedAtMs !== 'undefined' ? turnStartedAtMs : null;
                    const elapsed     = turnStarted ? Math.floor((Date.now() - turnStarted) / 1000) : null;
                    const limitSec    = typeof TURN_TIME_LIMIT_MS !== 'undefined' ? TURN_TIME_LIMIT_MS / 1000 : '?';

                    // Response window
                    const rw = ss?.responseWindow;
                    const rwState = rw ? {
                        open:      rw.isResponseWindowOpen,
                        caster:    rw.currentCaster,
                        pending:   rw.pendingScrollData?.name || null,
                        responded: Array.from(rw.respondingPlayers || []),
                        stack:     (rw.responseStack || []).map(e => ({
                            name:       e.scrollData?.name,
                            caster:     e.casterIndex,
                            isCounter:  !!e.isCounter,
                            isResponse: !!e.isResponse,
                            isOriginal: !!e.isOriginal,
                            result:     e.result
                        }))
                    } : null;

                    // ── output ────────────────────────────────────────────────
                    console.group('%c🔍 dumpGameDebug() — Full Game Snapshot', 'color:#d4ac0d;font-weight:bold;font-size:14px');

                    // Players & multiplayer
                    console.group('👥 Players & Multiplayer');
                    console.log('activePlayerIndex:', activeIdx, ' | myPlayerIndex:', myIdx, ' | totalPlayers:', numP);
                    console.log('isMultiplayer:', typeof isMultiplayer !== 'undefined' ? isMultiplayer : '?',
                                ' | isHost:',   typeof isHost          !== 'undefined' ? isHost         : '?');
                    console.log('currentGameId:', typeof currentGameId  !== 'undefined' ? currentGameId  : '?');
                    console.log('allPlayersData:', typeof allPlayersData !== 'undefined' ? allPlayersData : []);
                    console.groupEnd();

                    // Turn state
                    console.group('⏱️ Turn State');
                    console.log('currentTurnNumber:',      typeof currentTurnNumber       !== 'undefined' ? currentTurnNumber       : '?');
                    console.log('lastReceivedTurnNumber:', typeof lastReceivedTurnNumber  !== 'undefined' ? lastReceivedTurnNumber  : '?');
                    console.log('turnStartedAt:',          turnStarted ? new Date(turnStarted).toISOString() + ' (' + elapsed + 's elapsed, limit ' + limitSec + 's)' : '?');
                    console.log('isEndingTurn:',    typeof isEndingTurn    !== 'undefined' ? isEndingTurn    : '?');
                    console.log('isPlacementPhase:', typeof isPlacementPhase !== 'undefined' ? isPlacementPhase : '?');
                    console.log('playerTilesPlaced:', typeof playerTilesPlaced !== 'undefined' ? Array.from(playerTilesPlaced) : '?');
                    console.groupEnd();

                    // Turn order
                    console.group('🔄 Turn Order');
                    console.log('sorted:', sortedD.map(p => '[' + p.index + '] ' + (p.color || '?') + ' rank' + p.rank).join(' → '));
                    console.log('currentSortedIndex:', curSortIdx,
                        curSortIdx === -1 ? ' ⚠️ ACTIVE PLAYER NOT FOUND IN SORT — TURN ORDER BUG' :
                        curSortIdx >= 0 && sortedD.length > 0 ? ' → next: [' + sortedD[(curSortIdx + 1) % sortedD.length].index + ']' : '');
                    console.groupEnd();

                    // AP
                    console.group('⚡ AP');
                    console.log('currentAP:', typeof currentAP !== 'undefined' ? currentAP : '?',
                                ' | voidAP:', typeof voidAP   !== 'undefined' ? voidAP     : '?');
                    console.groupEnd();

                    // Scroll state per player
                    console.group('📜 Scroll State (all players)');
                    const printCount = Math.max(numP, ss?.playerScrolls?.length || 0, posArr.length);
                    for (let i = 0; i < printCount; i++) {
                        const scrollData = sumScrolls(i);
                        const isMe       = i === myIdx    ? ' ← ME'          : '';
                        const isActive   = i === activeIdx ? ' ← ACTIVE TURN' : '';
                        const cascade    = ss?.hasPendingCascade?.(i) ? ' ⚠️ CASCADE PENDING' : '';
                        console.group('Player ' + i + isMe + isActive + cascade);
                        console.log('hand:',      scrollData.hand.length      ? scrollData.hand      : '(empty)');
                        console.log('active:',    scrollData.active.length    ? scrollData.active    : '(empty)');
                        console.log('activated:', scrollData.activated.length ? scrollData.activated : '(none)');
                        console.groupEnd();
                    }
                    console.groupEnd();

                    // Stone pools
                    console.group('💎 Stone Pools');
                    for (let i = 0; i < Math.max(numP, poolsArr.length); i++) {
                        const isMe     = i === myIdx     ? ' ← ME'          : '';
                        const isActive = i === activeIdx ? ' ← ACTIVE TURN' : '';
                        console.log('Player ' + i + isMe + isActive + ':', poolsArr[i] || '(no pool)');
                    }
                    const srcPool = (typeof stonePools !== 'undefined') ? stonePools : (window.stonePools || null);
                    console.log('sourcePool (board):', srcPool);
                    console.groupEnd();

                    // Common area
                    console.group('🌐 Common Area');
                    console.log('scrolls:', ss?.getCommonAreaScrolls ? ss.getCommonAreaScrolls() : '?');
                    if (ss?.commonArea) console.log('raw:', ss.commonArea);
                    console.groupEnd();

                    // Active buffs
                    console.group('✨ Active Buffs');
                    const buffs = ss?.scrollEffects?.activeBuffs || {};
                    const bKeys = Object.keys(buffs);
                    if (bKeys.length === 0) console.log('(none)');
                    else bKeys.forEach(k => console.log(k + ':', buffs[k]));
                    console.groupEnd();

                    // Response window
                    console.group('🪟 Response Window');
                    if (!rwState) console.log('(not initialized)');
                    else {
                        console.log('open:', rwState.open, ' | caster:', rwState.caster, ' | pending:', rwState.pending);
                        console.log('responded:', rwState.responded);
                        if (rwState.stack.length > 0) console.log('stack:', rwState.stack);
                    }
                    console.groupEnd();

                    // Player positions
                    console.group('🗺️ Player Positions (' + posArr.length + ')');
                    posArr.forEach(function(p, i) {
                        if (p) console.log('Player ' + i + ': x=' + (p.x != null ? p.x.toFixed(1) : '?') + ' y=' + (p.y != null ? p.y.toFixed(1) : '?') + ' color=' + p.color + ' element=' + p.element);
                        else   console.log('Player ' + i + ': (not placed)');
                    });
                    console.groupEnd();

                    // Known bugs
                    const bugs = window.KNOWN_BUGS || [];
                    if (bugs.length > 0) {
                        console.group('📋 Known Bugs (' + bugs.length + ')');
                        bugs.forEach(function(b, i) {
                            console.log('%c' + (i + 1) + '. [' + b.status.toUpperCase() + '] ' + b.id + ': ' + b.title, 'color:#f39c12;font-weight:bold');
                            console.log('   ' + b.description);
                        });
                        console.groupEnd();
                    }

                    console.groupEnd(); // end main group
                } catch (e) {
                    console.error('dumpGameDebug failed:', e);
                }
            };

            // Aliases so old muscle memory still works
            window.debug        = window.dumpGameDebug;
            window.dumpScrollDebug = window.dumpGameDebug;
        }

        function isAdjacentToPlayer(x, y) {
            if (!playerPosition) return false;

            // Get hex coordinates for both positions
            const playerHex = pixelToHex(playerPosition.x, playerPosition.y, TILE_SIZE);
            const targetHex = pixelToHex(x, y, TILE_SIZE);

            // Calculate axial distance
            const dq = Math.abs(playerHex.q - targetHex.q);
            const dr = Math.abs(playerHex.r - targetHex.r);
            const ds = Math.abs((-playerHex.q - playerHex.r) - (-targetHex.q - targetHex.r));

            // Adjacent means distance = 1 in hex coordinates
            const hexDistance = Math.max(dq, dr, ds);

            const isAdj = hexDistance === 1;
            if (shouldDebugLog('isAdjacentToPlayer', 500)) {
                console.log(`📍 isAdjacentToPlayer: player=(${playerHex.q},${playerHex.r}), target=(${targetHex.q},${targetHex.r}), distance=${hexDistance}, adjacent=${isAdj}`);
            }

            return isAdj;
        }

        // Check if a position is within valid stone placement range (considering buffs)
        function isInPlacementRange(x, y, stoneType) {
            if (!playerPosition) return false;

            // Get current player index (use activePlayerIndex in single player, myPlayerIndex in multiplayer)
            const currentPlayerIdx = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null) ? myPlayerIndex : activePlayerIndex;

            // Check for global placement buff (Avalanche - any stone anywhere)
            if (spellSystem && spellSystem.scrollEffects && spellSystem.scrollEffects.hasGlobalPlacement(currentPlayerIdx)) {
                console.log(`ℹ️ Global placement active - allowing stone at any position`);
                return true;
            }

            // Seed the Skies: allow water/wind stones anywhere this turn
            if (stoneType && spellSystem && spellSystem.scrollEffects) {
                const buff = spellSystem.scrollEffects.activeBuffs?.waterWindGlobalPlacement;
                if (buff && buff.playerIndex === currentPlayerIdx && (stoneType === 'water' || stoneType === 'wind')) {
                    console.log(`ℹ️ Seed the Skies active - allowing ${stoneType} stone at any position`);
                    return true;
                }
            }

            // Check for extended placement buff (Mason's Savvy - earth stones within 5 hexes)
            if (stoneType && spellSystem && spellSystem.scrollEffects) {
                const extended = spellSystem.scrollEffects.hasExtendedPlacement(stoneType, currentPlayerIdx);
                if (extended.active) {
                    // Calculate hex distance
                    const playerHex = pixelToHex(playerPosition.x, playerPosition.y, TILE_SIZE);
                    const targetHex = pixelToHex(x, y, TILE_SIZE);

                    const dq = Math.abs(playerHex.q - targetHex.q);
                    const dr = Math.abs(playerHex.r - targetHex.r);
                    const ds = Math.abs((-playerHex.q - playerHex.r) - (-targetHex.q - targetHex.r));
                    const hexDistance = Math.max(dq, dr, ds);

                    if (hexDistance <= extended.range) {
                        console.log(`🎯 Extended placement active - allowing ${stoneType} stone at distance ${hexDistance} (max ${extended.range})`);
                        return true;
                    }
                }
            }

            // Default: must be adjacent to player
            return isAdjacentToPlayer(x, y);
        }

        function findNearestHexPosition(x, y) {
            // Similar to findValidStonePosition, but doesn't care about stones/player
            // Used for player movement pathfinding
            const hexPositions = getAllHexagonPositions();
            let nearest = null;
            let minDist = Infinity;

            hexPositions.forEach(pos => {
                const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                if (dist < minDist) {
                    minDist = dist;
                    nearest = pos;
                }
            });

            if (nearest && minDist < TILE_SIZE * 2) {
                return { x: nearest.x, y: nearest.y, valid: true };
            }

            return { x: x, y: y, valid: false };
        }

        function findNearestSnapPoint(x, y, isPlayerTile = false) {
            const largeHexSize = TILE_SIZE * 4;
            const hexCoords = pixelToHex(x, y, largeHexSize);
            const snapPos = hexToPixel(hexCoords.q, hexCoords.r, largeHexSize);
            const distance = Math.sqrt(Math.pow(x - snapPos.x, 2) + Math.pow(y - snapPos.y, 2));

            if (distance < SNAP_THRESHOLD) {
                // Check if a tile already exists at this position
                const tileExists = placedTiles.some(tile => {
                    const dist = Math.sqrt(Math.pow(tile.x - snapPos.x, 2) + Math.pow(tile.y - snapPos.y, 2));
                    return dist < TILE_SIZE; // Tiles are considered overlapping if centers are very close
                });

                if (tileExists) {
                    return { x: x, y: y, snapped: false }; // Don't snap if position is occupied
                }

                // PLAYER TILE SPECIAL RULE: Must touch at least 2 unrevealed tiles
                if (isPlayerTile) {
                    const touchingUnrevealedCount = countTouchingUnrevealedTiles(snapPos.x, snapPos.y);
                    if (touchingUnrevealedCount < 2) {
                        console.log(`❌ Player tile at (${snapPos.x.toFixed(1)}, ${snapPos.y.toFixed(1)}) only touches ${touchingUnrevealedCount} unrevealed tile(s), need 2+`);
                        return { x: x, y: y, snapped: false }; // Don't allow placement
                    }
                    console.log(`✅ Player tile at (${snapPos.x.toFixed(1)}, ${snapPos.y.toFixed(1)}) touches ${touchingUnrevealedCount} unrevealed tiles`);
                }

                // TELEKINESIS RULE: Must touch at least 1 other tile
                if (window.telekinesisState && window.telekinesisState.active) {
                    const touchingCount = countTouchingTiles(snapPos.x, snapPos.y);
                    if (touchingCount < 1) {
                        console.log(`❌ Telekinesis: tile at (${snapPos.x.toFixed(1)}, ${snapPos.y.toFixed(1)}) touches ${touchingCount} tile(s), need 1+`);
                        return { x: x, y: y, snapped: false };
                    }
                    console.log(`✅ Telekinesis: tile at (${snapPos.x.toFixed(1)}, ${snapPos.y.toFixed(1)}) touches ${touchingCount} tiles`);
                }

                return { x: snapPos.x, y: snapPos.y, snapped: true };
            }
            return { x: x, y: y, snapped: false };
        }

        function countTouchingUnrevealedTiles(tileX, tileY) {
            // Get the 6 adjacent tile positions in the large hex grid
            const largeHexSize = TILE_SIZE * 4;
            const tileHex = pixelToHex(tileX, tileY, largeHexSize);
            
            const adjacentOffsets = [
                { q: 1, r: 0 },   // East
                { q: 0, r: 1 },   // Southeast
                { q: -1, r: 1 },  // Southwest
                { q: -1, r: 0 },  // West
                { q: 0, r: -1 },  // Northwest
                { q: 1, r: -1 }   // Northeast
            ];

            let unrevealedCount = 0;

            adjacentOffsets.forEach(offset => {
                const adjQ = tileHex.q + offset.q;
                const adjR = tileHex.r + offset.r;
                const adjPos = hexToPixel(adjQ, adjR, largeHexSize);

                // Check if there's an unrevealed (flipped) tile at this position
                const adjacentTile = placedTiles.find(tile => {
                    const dist = Math.sqrt(Math.pow(tile.x - adjPos.x, 2) + Math.pow(tile.y - adjPos.y, 2));
                    return dist < TILE_SIZE;
                });

                if (adjacentTile && adjacentTile.flipped) {
                    unrevealedCount++;
                }
            });

            return unrevealedCount;
        }

        // Count ALL adjacent tiles (revealed or unrevealed) — used by Telekinesis
        function countTouchingTiles(tileX, tileY) {
            const largeHexSize = TILE_SIZE * 4;
            const tileHex = pixelToHex(tileX, tileY, largeHexSize);
            const adjacentOffsets = [
                { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
                { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
            ];
            let count = 0;
            adjacentOffsets.forEach(offset => {
                const adjPos = hexToPixel(tileHex.q + offset.q, tileHex.r + offset.r, largeHexSize);
                const found = placedTiles.find(t => {
                    const dist = Math.sqrt(Math.pow(t.x - adjPos.x, 2) + Math.pow(t.y - adjPos.y, 2));
                    return dist < TILE_SIZE;
                });
                if (found) count++;
            });
            return count;
        }

        function tileHasStones(tileId) {
            const tile = placedTiles.find(t => t.id === tileId);
            if (!tile) return false;

            const s = TILE_SIZE;
            const hexagons = [
                { q: 0, r: 0 },
                { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
                { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
                { q: 2, r: -1 }, { q: 1, r: 1 }, { q: -1, r: 2 },
                { q: -2, r: 1 }, { q: -1, r: -1 }, { q: 1, r: -2 }
            ];

            return hexagons.some(hex => {
                const localPos = hexToPixel(hex.q, hex.r, s);
                const globalX = tile.x + localPos.x;
                const globalY = tile.y + localPos.y;

                return placedStones.some(stone => {
                    const dist = Math.sqrt(Math.pow(stone.x - globalX, 2) + Math.pow(stone.y - globalY, 2));
                    return dist < 5;
                });
            });
        }

        // Check if any player is standing on a tile (by tile id)
        function tileHasPlayersById(tileId) {
            const tile = placedTiles.find(t => t.id === tileId);
            if (!tile || typeof playerPositions === 'undefined') return false;
            const tileRadius = TILE_SIZE * 4;
            return playerPositions.some(pos => {
                if (!pos) return false;
                const dist = Math.sqrt(Math.pow(pos.x - tile.x, 2) + Math.pow(pos.y - tile.y, 2));
                return dist < tileRadius;
            });
        }

        // Bridge check: would removing this tile leave any of its neighbors with 0 neighbors?
        // Used by Telekinesis to prevent stranding tiles (and players on them).
        function tileIsBridge(tileId) {
            const tile = placedTiles.find(t => t.id === tileId);
            if (!tile) return false;
            const largeHexSize = TILE_SIZE * 4;
            const tileHex = pixelToHex(tile.x, tile.y, largeHexSize);
            const adjacentOffsets = [
                { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
                { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
            ];

            // Find all neighbors of this tile
            const neighbors = [];
            adjacentOffsets.forEach(offset => {
                const adjPos = hexToPixel(tileHex.q + offset.q, tileHex.r + offset.r, largeHexSize);
                const found = placedTiles.find(t => {
                    if (t.id === tileId) return false; // exclude self
                    const dist = Math.sqrt(Math.pow(t.x - adjPos.x, 2) + Math.pow(t.y - adjPos.y, 2));
                    return dist < TILE_SIZE;
                });
                if (found) neighbors.push(found);
            });

            // For each neighbor, count how many neighbors IT would have without this tile
            for (const neighbor of neighbors) {
                const nHex = pixelToHex(neighbor.x, neighbor.y, largeHexSize);
                let otherNeighborCount = 0;
                adjacentOffsets.forEach(offset => {
                    const adjPos = hexToPixel(nHex.q + offset.q, nHex.r + offset.r, largeHexSize);
                    const found = placedTiles.find(t => {
                        if (t.id === tileId) return false; // exclude the tile being removed
                        if (t.id === neighbor.id) return false; // exclude self
                        const dist = Math.sqrt(Math.pow(t.x - adjPos.x, 2) + Math.pow(t.y - adjPos.y, 2));
                        return dist < TILE_SIZE;
                    });
                    if (found) otherNeighborCount++;
                });
                if (otherNeighborCount === 0) return true; // This neighbor would be stranded
            }
            return false;
        }

        function updateTileClasses() {
            placedTiles.forEach(tile => {
                if (tileHasStones(tile.id)) {
                    tile.element.classList.add('has-stones');
                } else {
                    tile.element.classList.remove('has-stones');
                }
            });
        }

        function createShrineMarker(shrineType) {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'shrine-marker');

            // Color mapping for shrine types
            const shrineColors = {
                'earth': '#69d83a',
                'water': '#5894f4',
                'fire': '#ed1b43',
                'wind': '#ffce00',
                'void': '#9458f4',
                'catacomb': '#8b4513'
            };

            // Create a circle background
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '0');
            circle.setAttribute('cy', '0');
            circle.setAttribute('r', '8');
            circle.setAttribute('fill', shrineColors[shrineType]);
            circle.setAttribute('opacity', '0.6');
            circle.setAttribute('stroke', shrineColors[shrineType]);
            circle.setAttribute('stroke-width', '2');
            g.appendChild(circle);

            // Element image on shrine indicator
            const shrineImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            shrineImg.setAttribute('href', STONE_TYPES[shrineType]?.img || '');
            shrineImg.setAttribute('x', '-8');
            shrineImg.setAttribute('y', '-8');
            shrineImg.setAttribute('width', '16');
            shrineImg.setAttribute('height', '16');
            // Catacomb symbol is not bright enough for screen blend — use normal so it's visible
            shrineImg.style.mixBlendMode = shrineType === 'catacomb' ? 'normal' : 'screen';
            g.appendChild(shrineImg);

            return g;
        }

        let nextTileId = 1; // Global counter for unique tile IDs

        function placeTile(x, y, rotation = 0, flipped = false, shrineType = null, isPlayerTile = false, skipMultiplayerLogic = false, forcedTileId = null) {
            console.log(`   placeTile called: x=${x.toFixed(1)}, y=${y.toFixed(1)}, rotation=${rotation}, flipped=${flipped}, shrineType=${shrineType}, isPlayerTile=${isPlayerTile}, skipMP=${skipMultiplayerLogic}`);
            const tileId = (forcedTileId !== null && forcedTileId !== undefined) ? forcedTileId : nextTileId++;
            if (forcedTileId !== null && forcedTileId !== undefined) {
                nextTileId = Math.max(nextTileId, forcedTileId + 1);
            }
            console.log(`   Assigned tileId: ${tileId}`);
            let tilePlayerIndex = null; // Will be set if this is a player tile
            const tileGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            tileGroup.setAttribute('class', isPlayerTile ? 'placed-tile player-tile' : 'placed-tile');
            tileGroup.setAttribute('data-tile-id', tileId);
            tileGroup.setAttribute('transform', `translate(${x}, ${y})`);

            const tile = createTileGroup(TILE_SIZE, rotation, flipped);
            tileGroup.appendChild(tile);

            // Draw from deck if shrine type not provided
            if (shrineType === null) {
                shrineType = drawNextTileFromDeck();
                if (shrineType === null) {
                    // No more tiles in deck
                    return null;
                }
            }

            // Tag revealed tiles with shrine type so CSS hover matches element color.
            // Hidden (flipped) tiles stay untagged — their element is unknown to the player.
            if (!flipped && shrineType !== 'player') {
                tileGroup.setAttribute('data-shrine', shrineType);
            }

            // Check if this is the player tile
            if (shrineType === 'player') {
                isPlayerTile = true;

                const playerIndex = playerPositions.length;
                let assignedColor;

                // In multiplayer, use the pre-assigned playerColor
                // In local mode, assign colors in rank order
                // skipMultiplayerLogic = true means playerColor is already hex (from placePlayerTileVisually),
                // so skip the name→hex lookup to avoid PLAYER_COLORS[hexValue] = undefined.
                if (isMultiplayer && playerColor && !skipMultiplayerLogic) {
                    assignedColor = PLAYER_COLORS[playerColor];
                    playerColor = assignedColor; // Normalise to hex so placePlayer always gets a hex value
                    console.log(`🎨 Multiplayer - Using assigned color: ${playerColor}`);
                } else if (isMultiplayer && playerColor && skipMultiplayerLogic) {
                    assignedColor = playerColor; // already hex
                    console.log(`🎨 Multiplayer (visual-only) - Color already hex: ${playerColor}`);
                } else {
                    // Local game - assign next color in rank order
                    const colorRankOrder = ['purple', 'yellow', 'red', 'blue', 'green'];
                    if (playerIndex < 5) {
                        const colorName = colorRankOrder[playerIndex];
                        assignedColor = PLAYER_COLORS[colorName];
                        gameSessionColors.add(colorName);
                        playerColor = assignedColor;
                        console.log(`🎨 Local game - Player ${playerIndex + 1} color assigned: ${colorName} (${assignedColor})`);
                    } else {
                        console.warn('⚠️ Maximum 5 players reached!');
                        assignedColor = '#fff'; // Fallback to white
                        playerColor = assignedColor;
                    }
                }

                // Add color tint overlay to player tile
                const tintOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                tintOverlay.setAttribute('cx', 0);
                tintOverlay.setAttribute('cy', 0);
                tintOverlay.setAttribute('r', TILE_SIZE * 2); // Cover the whole tile
                tintOverlay.setAttribute('fill', assignedColor);
                tintOverlay.setAttribute('opacity', '0.15'); // Light tint
                tintOverlay.setAttribute('pointer-events', 'none'); // Don't interfere with clicks
                tileGroup.appendChild(tintOverlay);

                // Store the player index for later use
                tilePlayerIndex = playerIndex;
                
                // Add a group for element symbols on the player tile
                const symbolsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                symbolsGroup.setAttribute('class', 'player-tile-element-symbols');
                tileGroup.appendChild(symbolsGroup);
            }

            // Only add shrine marker if NOT flipped and NOT player tile (revealed tiles show shrine)
            if (!flipped && shrineType !== 'player') {
                const shrineMarker = createShrineMarker(shrineType);
                tileGroup.appendChild(shrineMarker);
            }

            tileGroup.addEventListener('mousedown', (e) => {
                // Don't interfere with player dragging
                if (isDraggingPlayer) return;

            if (shouldDebugLog('tileClicked', 500)) {
                console.log(`🖱️ Tile clicked: tileId=${tileId}, position=(${x.toFixed(1)}, ${y.toFixed(1)}), shrine=${shrineType}, flipped=${flipped}, isPlayerTile=${isPlayerTile}, tileMoveMode=${tileMoveMode}`);
            }

                // Player tiles cannot be dragged once placed
                if (isPlayerTile) {
                    console.log(`   ✗ Cannot drag: player tiles are locked in place`);
                    return;
                }

                // Only allow dragging placed tiles if tileMoveMode is enabled
                if (!tileMoveMode) {
                    console.log(`   ✗ Cannot drag: tile move mode is OFF`);
                    return;
                }

                // During Telekinesis, also block tiles that have players on them or are bridges
                const tkActive = window.telekinesisState && window.telekinesisState.active;
                const tkBlockPlayer = tkActive && tileHasPlayersById(tileId);
                const tkBlockBridge = tkActive && tileIsBridge(tileId);

                if (e.button === 0 && !tileHasStones(tileId) && !tkBlockPlayer && !tkBlockBridge && !isPanning && !isDraggingStone && !isDraggingPlayer) {
                    console.log(`   ✓ Starting drag for tile ${tileId} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
                    e.stopPropagation();
                    e.preventDefault();
                    startTileDrag(tileId, e);
                } else {
                    if (tkBlockPlayer) {
                        console.log(`   ✗ Cannot drag: tile has a player on it`);
                        updateStatus('Cannot move a tile with a player on it!');
                    } else if (tkBlockBridge) {
                        console.log(`   ✗ Cannot drag: removing tile would strand a neighbor`);
                        updateStatus('Cannot move this tile — it would strand an adjacent tile!');
                    } else {
                        console.log(`   ✗ Cannot drag: hasStones=${tileHasStones(tileId)}, isPanning=${isPanning}, isDraggingStone=${isDraggingStone}`);
                    }
                }
            });

            // Touch support: start tile drag on tap/drag
            tileGroup.addEventListener('touchstart', (e) => {
                // Don't interfere with player dragging
                if (isDraggingPlayer) return;
                // Player tiles cannot be dragged once placed
                if (isPlayerTile) return;
                // Only allow dragging if tileMoveMode is enabled
                if (!tileMoveMode) return;
                if (tileHasStones(tileId) || isPanning || isDraggingStone || isDraggingPlayer) return;
                // During Telekinesis, block tiles that have players on them or are bridges
                if (window.telekinesisState && window.telekinesisState.active) {
                    if (tileHasPlayersById(tileId) || tileIsBridge(tileId)) return;
                }

                if (e.touches && e.touches.length === 1) {
                    e.stopPropagation();
                    e.preventDefault();
                    const t = e.touches[0];
                    startTileDrag(tileId, {
                        clientX: t.clientX,
                        clientY: t.clientY,
                        button: 0,
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    });
                }
            }, { passive: false });


            viewport.insertBefore(tileGroup, snapIndicator);

            placedTiles.push({
                id: tileId,
                x: x,
                y: y,
                rotation: rotation,
                flipped: flipped,
                element: tileGroup,
                shrineType: shrineType,
                isPlayerTile: isPlayerTile,
                playerIndex: isPlayerTile ? tilePlayerIndex : null // Track which player owns this tile
            });

            updateTileClasses();

            // Place player marker on player tile
            if (isPlayerTile) {
                // Create new player pawn at this tile's position.
                // playerColor is always hex by this point (normalised above for both
                // multiplayer and local paths), so playerPositions stores hex values
                // and COLOR_RANK lookups in game-ui.js work correctly.
                placePlayer(x, y, playerColor);

                // In multiplayer, ensure this player's pawn ends up at playerPositions[myPlayerIndex]
                // regardless of simultaneous placements by other players.  placePlayer() always
                // push()es to the end; if another player's broadcast arrived first, the index is wrong.
                if (isMultiplayer && !skipMultiplayerLogic &&
                        myPlayerIndex !== null && myPlayerIndex !== undefined) {
                    const placed = playerPositions.pop();
                    if (placed) {
                        placed.index = myPlayerIndex;
                        while (playerPositions.length < myPlayerIndex) playerPositions.push(null);
                        playerPositions[myPlayerIndex] = placed;
                        console.log(`🔧 Relocated local pawn to playerPositions[${myPlayerIndex}]`);
                    }
                }

                // In multiplayer, broadcast tile placement and track placement phase
                // Skip this logic if we're just placing visually from a broadcast
                if (isMultiplayer && !skipMultiplayerLogic) {
                    console.log(`🎮 Player ${tilePlayerIndex} placed tile. Before: activePlayerIndex=${activePlayerIndex}, placed=${Array.from(playerTilesPlaced)}`);
                    playerTilesPlaced.add(tilePlayerIndex);

                    // Broadcast that this player placed their tile
                    broadcastGameAction('player-tile-placed', {
                        playerIndex: tilePlayerIndex
                    });

                    // Check if all players have placed tiles
                    if (playerTilesPlaced.size === totalPlayers) {
                        isPlacementPhase = false;
                        activePlayerIndex = 0; // Reset to first player for normal gameplay
                        console.log('✅ All players have placed their tiles. Game begins!');

                        // Broadcast placement phase end and turn reset
                        const startedAt = Date.now();
                        turnStartedAtMs = startedAt;
                        broadcastGameAction('placement-complete', {
                            playerIndex: 0,
                            turnStartedAt: startedAt
                        });

                        if (isMyTurn()) {
                            updateStatus(`All tiles placed! It's your turn!`);
                        } else {
                            const nextColorName = getPlayerColorName(activePlayerIndex);
                            updateStatus(`All tiles placed! Waiting for ${nextColorName}'s turn...`);
                        }
                    } else {
                        // Advance to next player in turn order
                        const oldIndex = activePlayerIndex;
                        activePlayerIndex = (activePlayerIndex + 1) % totalPlayers;
                        console.log(`📄 Advancing turn: ${oldIndex} -> ${activePlayerIndex} (total: ${totalPlayers})`);

                        // Broadcast turn change during placement phase
                        const startedAt = Date.now();
                    turnStartedAtMs = startedAt;
                    currentTurnNumber++;
                    broadcastGameAction('turn-change', {
                        playerIndex: activePlayerIndex,
                        turnStartedAt: startedAt,
                        turnNumber: currentTurnNumber
                    });
                        console.log(`📡 Broadcasted turn-change to player ${activePlayerIndex}`);

                        if (canPlaceTile()) {
                            updateStatus(`Your turn! Place your player tile (${playerTilesPlaced.size}/${totalPlayers} placed)`);
                        setInventoryOpen(true);
                            console.log(`✅ My turn to place (myPlayerIndex=${myPlayerIndex})`);
                        } else {
                            const nextColorName = getPlayerColorName(activePlayerIndex);
                            updateStatus(`Waiting for ${nextColorName} to place their tile... (${playerTilesPlaced.size}/${totalPlayers})`);
                            console.log(`⏳ Waiting for player ${activePlayerIndex} (myPlayerIndex=${myPlayerIndex})`);
                        }
                    }
                } else {
                    updateStatus(`Player ${tilePlayerIndex + 1} tile placed!`);
                }

                // Tutorial hook: advance when the local player places their tile on the board
                if (!skipMultiplayerLogic &&
                        window.isTutorialMode && window.TutorialMode?.onPlayerTilePlaced) {
                    window.TutorialMode.onPlayerTilePlaced();
                }
            }

            return tileId;
        }

        // Find the tile at a given world position
        function findTileAtPosition(worldX, worldY) {
            // A tile covers 19 hexes; use a large radius so clicking anywhere on the tile counts
            // TILE_SIZE * 5.5 ensures the whole tile (including edges) is clickable
            const tileRadius = TILE_SIZE * 5.5;
            let closestTile = null;
            let closestDist = Infinity;

            for (const tile of placedTiles) {
                if (tile.isPlayerTile) continue; // Skip player tiles
                const dist = Math.sqrt(Math.pow(tile.x - worldX, 2) + Math.pow(tile.y - worldY, 2));
                if (dist < tileRadius && dist < closestDist) {
                    closestTile = tile;
                    closestDist = dist;
                }
            }
            return closestTile;
        }

        // Handle board clicks when in selection mode (for scroll effects like tile swap/flip)
        function handleSelectionModeClick(worldX, worldY) {
            if (!spellSystem || !spellSystem.scrollEffects) return false;
            const selectionMode = spellSystem.scrollEffects.selectionMode;
            if (!selectionMode) return false;

            // Check if this is a stone selection mode (e.g., Water V - Control the Current)
            if (selectionMode.handleStoneClick) {
                // Find the stone at the click position
                const stone = findStoneAtPosition(worldX, worldY);
                if (stone) {
                    selectionMode.handleStoneClick(stone);
                    return true; // Click was handled
                }
            }

            // Check if this is a hex selection mode (e.g., Excavate teleport — any hex, not just tile center)
            if (selectionMode.handleHexClick) {
                const allHexes = getAllHexagonPositions();
                let closestHex = null;
                let minDist = Infinity;
                allHexes.forEach(hexPos => {
                    const dist = Math.sqrt(Math.pow(hexPos.x - worldX, 2) + Math.pow(hexPos.y - worldY, 2));
                    if (dist < minDist) {
                        minDist = dist;
                        closestHex = hexPos;
                    }
                });
                if (closestHex && minDist < TILE_SIZE * 1.5) {
                    selectionMode.handleHexClick(closestHex);
                } else {
                    updateStatus('No hex at that position.');
                }
                return true;
            }

            // Check if this is a tile selection mode
            if (selectionMode.handleTileClick) {
                // Find the tile at the click position
                const tile = findTileAtPosition(worldX, worldY);
                if (!tile) {
                    updateStatus('No tile at that position.');
                    return true; // Still consumed the click
                }

                // Pass to selection mode handler
                selectionMode.handleTileClick(tile);
            }
            return true; // Click was handled
        }

        // Find a stone at a world position
        function findStoneAtPosition(worldX, worldY) {
            if (typeof placedStones === 'undefined') return null;

            // Increased radius for more permissive stone clicking
            const stoneRadius = typeof HEX_SIZE !== 'undefined' ? HEX_SIZE * 2.5 : 50;
            let closestStone = null;
            let closestDist = Infinity;

            for (const stone of placedStones) {
                const dist = Math.sqrt(Math.pow(stone.x - worldX, 2) + Math.pow(stone.y - worldY, 2));
                if (dist < stoneRadius && dist < closestDist) {
                    closestStone = stone;
                    closestDist = dist;
                }
            }
            return closestStone;
        }

        // ── Tile Image Overlay System ─────────────────────────────────────────
        // Per-element image overlays rendered as SVG <image> clipped to hex shape.
        // Settings are stored in window.tileOverlaySettings and persist across reveals.

        window.tileOverlaySettings = window.tileOverlaySettings || {
            earth:    { src: 'images/Tiles/pixelearth.png',    x: 0, y: 0,   rotation: 60,  scale: 1.05, opacity: 0.41, tintOpacity: 0.22 },
            fire:     { src: 'images/Tiles/pixelfire.png',     x: 0, y: 0,   rotation: 0,   scale: 1.2,  opacity: 0.6,  tintOpacity: 0.22 },
            water:    { src: 'images/Tiles/pixelwater.png',    x: 0, y: 0,   rotation: 233, scale: 1.25, opacity: 0.49, tintOpacity: 0.22 },
            wind:     { src: 'images/Tiles/pixelwind.png',     x: 0, y: 0,   rotation: 0,   scale: 1.2,  opacity: 0.6,  tintOpacity: 0.22 },
            void:     { src: 'images/Tiles/pixelvoid.png',     x: 0, y: 0,   rotation: 31,  scale: 1.2,  opacity: 0.6,  tintOpacity: 0.22 },
            catacomb: { src: 'images/Tiles/pixelcatacomb.png', x: 3, y: -1,  rotation: 0,   scale: 1,    opacity: 0.6,  tintOpacity: 1.0 },
        };

        const ELEMENT_TINTS = {
            earth: '#4a8a2a', fire: '#cc2200', water: '#1a6ab5',
            wind:  '#c8a800', void: '#6a30b0', catacomb: '#888888'
        };

        function makeTileHexPoints(R) {
            const pts = [];
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i - Math.PI / 6;
                pts.push(`${(R * Math.cos(a)).toFixed(2)},${(R * Math.sin(a)).toFixed(2)}`);
            }
            return pts.join(' ');
        }

        function addTileOverlay(tileGroup, shrineType) {
            if (!shrineType || !window.tileOverlaySettings) return;
            const settings = window.tileOverlaySettings[shrineType];
            if (!settings || !settings.src) return;

            const tileId = tileGroup.getAttribute('data-tile-id');
            const clipId = `tile-overlay-clip-${tileId}`;
            const R = TILE_SIZE * 4.0; // 80 units — matches tile boundary for clean hex crop

            // Per-tile clipPath inside the tile group — coordinates are unambiguously tile-local
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clip.setAttribute('id', clipId);
            const clipHex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            clipHex.setAttribute('points', makeTileHexPoints(R));
            clip.appendChild(clipHex);
            defs.appendChild(clip);
            tileGroup.appendChild(defs);

            // Wrapper: clip acts as a fixed hex viewport; image moves freely inside it
            const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            wrapper.setAttribute('class', 'tile-overlay');
            wrapper.setAttribute('data-element', shrineType);
            wrapper.setAttribute('clip-path', `url(#${clipId})`);

            // Elemental tint layer (colored hex fill behind the image)
            if (ELEMENT_TINTS[shrineType]) {
                const tint = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                tint.setAttribute('points', makeTileHexPoints(R));
                tint.setAttribute('fill', ELEMENT_TINTS[shrineType]);
                tint.setAttribute('opacity', settings.tintOpacity ?? 0.22);
                tint.setAttribute('stroke', 'none');
                wrapper.appendChild(tint);
            }

            // Image layer — freely transforms within the clipped viewport
            const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', settings.src);
            img.setAttribute('href', settings.src);
            img.setAttribute('x', -R);
            img.setAttribute('y', -R);
            img.setAttribute('width', R * 2);
            img.setAttribute('height', R * 2);
            img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
            img.setAttribute('opacity', settings.opacity);
            img.setAttribute('transform',
                `translate(${settings.x},${settings.y}) rotate(${settings.rotation}) scale(${settings.scale})`);

            wrapper.appendChild(img);
            tileGroup.appendChild(wrapper);
        }

        // Clone a tileGraphic group with fills removed — used to render hex lines on top of overlay
        function createStrokeOnlyClone(tileGraphic) {
            const clone = tileGraphic.cloneNode(true);
            clone.setAttribute('class', 'tile-overlay-lines');
            clone.querySelectorAll('polygon').forEach(p => {
                p.setAttribute('fill', 'none');
                p.style.fill = 'none';
            });
            return clone;
        }

        function refreshAllTileOverlays() {
            document.querySelectorAll('.tile-overlay, .tile-overlay-lines').forEach(el => el.remove());
            document.querySelectorAll('[id^="tile-overlay-clip-"]').forEach(el => el.closest('defs')?.remove());
            if (typeof placedTiles !== 'undefined') {
                placedTiles.forEach(tile => {
                    if (!tile.flipped && tile.shrineType && tile.element) {
                        const shrineMarker = tile.element.querySelector('.shrine-marker');
                        const tileGraphic = tile.element.querySelector('g[transform^="rotate"]');
                        // addTileOverlay appends to end; move overlay before shrineMarker to get correct order:
                        // tileGraphic → overlay → strokeClone → shrineMarker
                        addTileOverlay(tile.element, tile.shrineType);
                        const overlay = tile.element.querySelector('.tile-overlay');
                        if (overlay && shrineMarker) tile.element.insertBefore(overlay, shrineMarker);
                        if (tileGraphic) {
                            const strokeClone = createStrokeOnlyClone(tileGraphic);
                            tile.element.insertBefore(strokeClone, shrineMarker);
                        }
                    }
                });
            }
        }
        window.refreshAllTileOverlays = refreshAllTileOverlays;
        window.addTileOverlay = addTileOverlay;

        function revealTile(tileId) {
            const tile = placedTiles.find(t => t.id === tileId);
            if (!tile || !tile.flipped) {
                console.log(`⚠️ revealTile called for tile ${tileId}, but tile is ${tile ? 'already revealed' : 'not found'}`);
                return; // Already revealed or doesn't exist
            }

            console.log(`📡 Broadcasting tile flip: tileId=${tileId}, shrineType=${tile.shrineType}`);
            // Broadcast tile flip to other players
            broadcastGameAction('tile-flip', {
                tileId: tileId,
                shrineType: tile.shrineType
            });

            // Tutorial pre-reveal hook: runs BEFORE the visual is built so the
            // tutorial can override tile.shrineType and the visual + scroll both reflect it.
            if (window.isTutorialMode && window.TutorialMode?.onTilePreReveal) {
                window.TutorialMode.onTilePreReveal(tile);
            }

            // Remove the old tile element
            tile.element.remove();

            // Create new revealed tile group
            const tileGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            tileGroup.setAttribute('class', 'placed-tile');
            tileGroup.setAttribute('data-tile-id', tileId);
            tileGroup.setAttribute('data-shrine', tile.shrineType);
            tileGroup.setAttribute('transform', `translate(${tile.x}, ${tile.y})`);

            const tileGraphic = createTileGroup(TILE_SIZE, tile.rotation, false);
            tileGroup.appendChild(tileGraphic);

            // Layer order: base fills → overlay image → hex lines → shrine symbol
            addTileOverlay(tileGroup, tile.shrineType);
            tileGroup.appendChild(createStrokeOnlyClone(tileGraphic));
            const shrineMarker = createShrineMarker(tile.shrineType);
            tileGroup.appendChild(shrineMarker);

            tileGroup.addEventListener('mousedown', (e) => {
                if (!tileMoveMode) return;
                if (e.button === 0 && !tileHasStones(tileId) && !isPanning && !isDraggingStone) {
                    e.stopPropagation();
                    e.preventDefault();
                    startTileDrag(tileId, e);
                }
            });

            viewport.insertBefore(tileGroup, snapIndicator);

            // Update tile data
            tile.flipped = false;
            tile.element = tileGroup;

            // Catacomb tile reveal: refund 1 AP
            const isCatacombReveal = tile.shrineType === 'catacomb';
            if (isCatacombReveal) {
                console.log(`⚡ Catacomb tile revealed — refunding 1 AP`);
                addAP(1);
            }

            // Tutorial hook: let tutorial pre-arrange the scroll deck before we draw
            if (window.isTutorialMode && window.TutorialMode?.onTileRevealed) {
                window.TutorialMode.onTileRevealed(tile, spellSystem);
            }

            // Scroll discovery: use effective element (Wandering River) so transformed tiles give the chosen element's scroll
            const effectiveType = spellSystem.scrollEffects?.getEffectiveTileElement?.(tile) ?? tile.shrineType;
            const scrollInfo = spellSystem.onTileRevealed(effectiveType);

            // Call to Adventure: immediately draw shrine stones when revealing a tile
            const ctaBuff = spellSystem.scrollEffects?.activeBuffs?.callToAdventure;
            const elementalTypes = ['earth', 'water', 'fire', 'wind', 'void'];
            let ctaDrawn = 0;
            if (ctaBuff && ctaBuff.playerIndex === activePlayerIndex && elementalTypes.includes(effectiveType)) {
                const STONE_RANK = { 'void': 1, 'wind': 2, 'fire': 3, 'water': 4, 'earth': 5 };
                const amount = STONE_RANK[effectiveType] || 0;
                ctaDrawn = spellSystem.scrollEffects.drawStonesToPool(effectiveType, amount, activePlayerIndex);
                if (ctaDrawn > 0) {
                    syncPlayerState();
                    console.log(`🗺️ Call to Adventure: drew ${ctaDrawn} ${effectiveType} stones on tile reveal`);
                }
            }

            const apBonus = isCatacombReveal ? ' +1 AP!' : '';
            if (scrollInfo && ctaDrawn > 0) {
                updateStatus(`Revealed ${effectiveType} shrine! Found ${scrollInfo.name}! Call to Adventure: +${ctaDrawn} ${effectiveType} stone${ctaDrawn > 1 ? 's' : ''}!${apBonus}`);
            } else if (scrollInfo) {
                updateStatus(`Revealed ${effectiveType} shrine! Found ${scrollInfo.name}!${apBonus}`);
            } else if (ctaDrawn > 0) {
                updateStatus(`Revealed ${effectiveType} shrine! Call to Adventure: +${ctaDrawn} ${effectiveType} stone${ctaDrawn > 1 ? 's' : ''}!${apBonus}`);
            } else {
                updateStatus(`Revealed ${effectiveType} shrine!${apBonus}`);
            }

            // Re-apply Wandering River indicator on the new element (reveal replaced tile.element)
            const wr = spellSystem.scrollEffects?.activeBuffs?.wanderingRiver;
            if (Array.isArray(wr)) {
                const entry = wr.find(e => Number(e.tileId) === Number(tile.id));
                if (entry && entry.newElement && typeof spellSystem.scrollEffects.applyWanderingRiverIndicator === 'function') {
                    spellSystem.scrollEffects.applyWanderingRiverIndicator(tile, entry.newElement);
                }
            }
        }

        // Make revealTile available globally for scroll effects
        window.revealTile = revealTile;
        // Expose placePlayer and movePlayerVisually for scroll effects (e.g. Take Flight)
        window.placePlayer = placePlayer;
        window.movePlayerVisually = movePlayerVisually;
        // Expose placeTile and spellSystem for tutorial mode
        window.placeTile  = placeTile;
        window.spellSystem = spellSystem;
        // Expose tileMoveMode for scroll effects (e.g. Telekinesis)
        Object.defineProperty(window, 'tileMoveMode', {
            get() { return tileMoveMode; },
            set(v) { tileMoveMode = v; },
            configurable: true
        });

        // Visual-only tile flip (called when receiving broadcast from other players)
        function flipTileVisually(tileElement, shrineType) {
            const tileId = parseInt(tileElement.getAttribute('data-tile-id'));
            const tile = placedTiles.find(t => t.id === tileId);
            if (!tile || !tile.flipped) return;

            // Same visual logic as revealTile but without broadcasting
            tile.element.remove();

            const tileGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            tileGroup.setAttribute('class', 'placed-tile');
            tileGroup.setAttribute('data-tile-id', tileId);
            tileGroup.setAttribute('data-shrine', shrineType);
            tileGroup.setAttribute('transform', `translate(${tile.x}, ${tile.y})`);

            const tileGraphic = createTileGroup(TILE_SIZE, tile.rotation, false);
            tileGroup.appendChild(tileGraphic);

            // Layer order: base fills → overlay image → hex lines → shrine symbol
            addTileOverlay(tileGroup, shrineType);
            tileGroup.appendChild(createStrokeOnlyClone(tileGraphic));
            const shrineMarker = createShrineMarker(shrineType);
            tileGroup.appendChild(shrineMarker);

            tileGroup.addEventListener('mousedown', (e) => {
                if (!tileMoveMode) return;
                if (e.button === 0 && !tileHasStones(tileId) && !isPanning && !isDraggingStone) {
                    e.stopPropagation();
                    e.preventDefault();
                    startTileDrag(tileId, e);
                }
            });

            viewport.insertBefore(tileGroup, snapIndicator);

            tile.flipped = false;
            tile.element = tileGroup;
            tile.shrineType = shrineType; // Update the tile's shrine type to match the revealed type
            console.log(`📄 flipTileVisually: Updated tile ${tileId} shrineType to ${shrineType}`);
        }

        // Recreate a revealed tile as flipped (hidden) - used by Heavy Stomp scroll effect
        function recreateTileAsFlipped(tile) {
            if (!tile || tile.flipped) return; // Already flipped

            const tileId = tile.id;
            console.log(`🙈 recreateTileAsFlipped: Hiding tile ${tileId} (${tile.shrineType})`);

            // Remove old tile element
            if (tile.element) {
                tile.element.remove();
            }

            // Create new flipped tile group
            const tileGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            tileGroup.setAttribute('class', 'placed-tile');
            tileGroup.setAttribute('data-tile-id', tileId);
            tileGroup.setAttribute('transform', `translate(${tile.x}, ${tile.y})`);

            // Create flipped (hidden) tile graphic
            const tileGraphic = createTileGroup(TILE_SIZE, tile.rotation, true);
            tileGroup.appendChild(tileGraphic);

            // Add mousedown handler for tile dragging
            tileGroup.addEventListener('mousedown', (e) => {
                if (e.button === 0 && !tileHasStones(tileId) && !isPanning && !isDraggingStone) {
                    e.stopPropagation();
                    e.preventDefault();
                    startTileDrag(tileId, e);
                }
            });

            viewport.insertBefore(tileGroup, snapIndicator);

            // Update tile data
            tile.flipped = true;
            tile.element = tileGroup;
        }

        // Make it available globally for scroll effects
        window.recreateTileAsFlipped = recreateTileAsFlipped;

        function startTileDrag(tileId, e) {
            if (tileHasStones(tileId)) return;
            isDraggingTile = true;
            draggedTileId = tileId;
            draggedTileShrineType = null;
            draggedTileOriginalPos = null;
            const tile = placedTiles.find(t => t.id === tileId);
            if (tile) {
                draggedTileRotation = tile.rotation;
                draggedTileFlipped = tile.flipped || false;
                draggedTileShrineType = tile.shrineType; // Preserve shrine type
                draggedTileOriginalPos = { x: tile.x, y: tile.y }; // Store original position
                tile.element.remove();
                placedTiles = placedTiles.filter(t => t.id !== tileId);
            }

            const rect = boardSvg.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const world = screenToWorld(screenX, screenY);

            ghostTile = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            ghostTile.setAttribute('class', 'ghost-tile');
            ghostTile.setAttribute('transform', `translate(${world.x}, ${world.y})`);
            const tileContent = createTileGroup(TILE_SIZE, draggedTileRotation, draggedTileFlipped);
            ghostTile.appendChild(tileContent);
            viewport.appendChild(ghostTile);
        }

        let isDraggingPlayer = false;
        let ghostPlayer = null;
        let playerPath = [];
        let pathLine = null;
        let pathCostLabels = [];

        
        // Finalize a pawn move based on the currently drawn playerPath (used by touch + mouse).
        function movePlayerAlongPath() {
            if (!isDraggingPlayer || !ghostPlayer || playerPath.length < 2) return;

            const activePlayer = playerPositions[activePlayerIndex];
            if (!activePlayer) return;

            const finalPos = playerPath[playerPath.length - 1];

            // Basic legality check for destination (revealed/unrevealed rules are enforced in canPlayerMoveToHex)
            const canMoveCheck = canPlayerMoveToHex(finalPos.x, finalPos.y, true);
            if (!canMoveCheck.canMove) {
                console.log(`❌ Invalid move end: ${canMoveCheck.reason || 'cannot move there'}`);
                // cleanup happens below
            } else {
                // Total cost for the selected path (Steam Vents discount applied inside)
                const totalCost = calculatePathCost();

                // Make sure player has enough AP
                const availableAP = getCurrentAP ? getCurrentAP() : currentAP;
                if (totalCost > availableAP) {
                    console.log(`❌ Not enough AP: need ${totalCost}, have ${availableAP}`);
                } else {
                    // Update Steam Vents alternation state before spending AP
                    commitSteamVentsState(playerPath);
                    // Spend AP and apply the move
                    if (typeof spendAP === 'function') spendAP(totalCost);

                    // Move pawn visually + state
                    activePlayer.x = finalPos.x;
                    activePlayer.y = finalPos.y;
                    activePlayer.element.setAttribute('transform', `translate(${finalPos.x}, ${finalPos.y})`);
                    if (ghostPlayer) ghostPlayer.setAttribute('transform', `translate(${finalPos.x}, ${finalPos.y})`);

                    console.log(`✅ Movement successful: ${playerPath.length - 1} hexes, cost ${totalCost} AP`);

                    // Record activity + broadcast movement (multiplayer)
                    try {
                        recordActivity && recordActivity('move', { x: finalPos.x, y: finalPos.y, apSpent: totalCost });
                    } catch (e) {}

                    if (typeof broadcastPlayerMovement === 'function' && !isSpectator) {
                        try {
                            broadcastPlayerMovement(activePlayerIndex, finalPos.x, finalPos.y, totalCost);
                        } catch (e) {}
                    }

                    // Tile reveal / shrine resolution (reuse existing landing handler if present)
                    try {
                        if (typeof handlePlayerLanding === 'function') {
                            handlePlayerLanding(finalPos.x, finalPos.y);
                        } else if (typeof checkTileRevealsAtPosition === 'function') {
                            checkTileRevealsAtPosition(finalPos.x, finalPos.y);
                        }
                    } catch (e) {
                        console.warn('Landing/reveal handler error:', e);
                    }
                }
            }

            // Cleanup (match mouseup behavior)
            isDraggingPlayer = false;
            clearPlayerPath();
            if (ghostPlayer) {
                ghostPlayer.remove();
                ghostPlayer = null;
            }
        }

function clearPlayerPath() {
            // Remove polyline
            if (pathLine) {
                pathLine.remove();
                pathLine = null;
            }
            // Remove step/cost labels
            if (pathCostLabels && pathCostLabels.length) {
                pathCostLabels.forEach(label => {
                    try { label.remove(); } catch (e) {}
                });
            }
            pathCostLabels = [];
            playerPath = [];
            snapIndicator.classList.remove('active');
        }


        function placePlayer(x, y, color = null) {
            if (color) {
                // Creating a NEW player pawn with this color
                console.log(`🎨 Creating new player ${playerPositions.length + 1} at (${x.toFixed(1)}, ${y.toFixed(1)}) with color ${color}`);

                const playerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                playerGroup.setAttribute('class', 'player');
                playerGroup.setAttribute('transform', `translate(${x}, ${y})`);
                playerGroup.style.pointerEvents = 'all';
                playerGroup.style.touchAction = 'none';

                // Invisible larger hit area for easier touch targeting
                const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                hitArea.setAttribute('cx', 0);
                hitArea.setAttribute('cy', 0);
                hitArea.setAttribute('r', TILE_SIZE * 0.8); // Much larger touch target
                hitArea.setAttribute('fill', 'transparent');
                hitArea.setAttribute('stroke', 'none');
                hitArea.style.pointerEvents = 'all';
                playerGroup.appendChild(hitArea);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', 0);
                circle.setAttribute('cy', 0);
                circle.setAttribute('r', TILE_SIZE * 0.4);
                circle.setAttribute('class', 'player-marker');
                circle.setAttribute('fill', color);
                circle.setAttribute('stroke', '#000');
                circle.setAttribute('stroke-width', '2');

                playerGroup.appendChild(circle);

                // Store the player index for this group
                const playerIndex = playerPositions.length;

                // Add drag handler
                playerGroup.addEventListener('mousedown', (e) => {
                    // Only draggable if this is the active player (check dynamically)
                    const thisPlayerIndex = playerPositions.findIndex(p => p && p.element === playerGroup);
                    const tf = (typeof window !== 'undefined') ? window.takeFlightState : null;
                    if (tf && tf.active && tf.targetPlayerIndex === thisPlayerIndex) {
                        e.stopPropagation();
                        e.preventDefault();
                        startPlayerDrag(e, { playerIndex: thisPlayerIndex, ignoreTurnCheck: true, isTakeFlight: true });
                        return;
                    }
                    if (thisPlayerIndex === activePlayerIndex) {
                        e.stopPropagation();
                        e.preventDefault();
                        startPlayerDrag(e);
                    }
                });

            // Touch support: start player drag on tap/drag
	            playerGroup.addEventListener('touchstart', (e) => {
	                console.log('👆 Player pawn touchstart detected!', {touches: e.touches?.length, target: e.target});
	                if (!(e.touches && e.touches.length === 1)) return;
	                // Mirror mousedown behavior: only the active player pawn can be dragged
	                const thisPlayerIndex = playerPositions.findIndex(p => p && p.element === playerGroup);
	                console.log(`   thisPlayerIndex=${thisPlayerIndex}, activePlayerIndex=${activePlayerIndex}`);
                    const tf = (typeof window !== 'undefined') ? window.takeFlightState : null;
                    if (tf && tf.active && tf.targetPlayerIndex === thisPlayerIndex) {
                        // Set flag IMMEDIATELY to prevent other handlers from interfering
                        isDraggingPlayer = true;
                        e.stopPropagation();
                        e.preventDefault();
                        const t = e.touches[0];
                        console.log('   ✅ Starting take-flight drag from touch');
                        startPlayerDrag({
                            clientX: t.clientX,
                            clientY: t.clientY,
                            button: 0,
                            preventDefault: () => {},
                            stopPropagation: () => {}
                        }, { playerIndex: thisPlayerIndex, ignoreTurnCheck: true, isTakeFlight: true });
                        return;
                    }
	                if (thisPlayerIndex === activePlayerIndex) {
                    // Set flag IMMEDIATELY to prevent other handlers from interfering
                    isDraggingPlayer = true;
                    e.stopPropagation();
                    e.preventDefault();
                    const t = e.touches[0];
                    console.log('   ✅ Starting player drag from touch');
                    startPlayerDrag({
                        clientX: t.clientX,
                        clientY: t.clientY,
                        button: 0,
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    });
                } else {
                    console.log('   ❌ Not active player, ignoring touch');
                }
            }, { passive: false });

                playerGroup.addEventListener('mouseenter', (e) => {
                    e.stopPropagation();
                });

                playerGroup.addEventListener('mouseleave', (e) => {
                    e.stopPropagation();
                });

                viewport.appendChild(playerGroup);
                playerPositions.push({ x, y, element: playerGroup, color, index: playerIndex });

            } else {
                // Moving the ACTIVE player
                const activePlayer = playerPositions[activePlayerIndex];
                if (!activePlayer) {
                    console.error('No active player to move!');
                    return;
                }
                
                activePlayer.element.remove();

                const playerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                playerGroup.setAttribute('class', 'player');
                playerGroup.setAttribute('transform', `translate(${x}, ${y})`);
                playerGroup.style.pointerEvents = 'all';
                playerGroup.style.touchAction = 'none';

                // Invisible larger hit area for easier touch targeting
                const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                hitArea.setAttribute('cx', 0);
                hitArea.setAttribute('cy', 0);
                hitArea.setAttribute('r', TILE_SIZE * 0.8);
                hitArea.setAttribute('fill', 'transparent');
                hitArea.setAttribute('stroke', 'none');
                hitArea.style.pointerEvents = 'all';
                playerGroup.appendChild(hitArea);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', 0);
                circle.setAttribute('cy', 0);
                circle.setAttribute('r', TILE_SIZE * 0.4);
                circle.setAttribute('class', 'player-marker');
                circle.setAttribute('fill', activePlayer.color);
                circle.setAttribute('stroke', '#000');
                circle.setAttribute('stroke-width', '2');

                playerGroup.appendChild(circle);

                // Store the player index for event handlers
                const thisPlayerIdx = activePlayerIndex;

                playerGroup.addEventListener('mousedown', (e) => {
                    // Only draggable if this is the active player
                    const currentIdx = playerPositions.findIndex(p => p && p.element === playerGroup);
                    if (currentIdx === activePlayerIndex) {
                        e.stopPropagation();
                        e.preventDefault();
                        startPlayerDrag(e);
                    }
                });

	            // Touch support: start player drag on tap/drag
	            playerGroup.addEventListener('touchstart', (e) => {
	                console.log('👆 Player pawn touchstart (path2) detected!', {touches: e.touches?.length});
	                if (!(e.touches && e.touches.length === 1)) return;
	                // Mirror mousedown behavior: only active player can be dragged
	                const currentIdx = playerPositions.findIndex(p => p && p.element === playerGroup);
	                console.log(`   currentIdx=${currentIdx}, activePlayerIndex=${activePlayerIndex}`);
	                if (currentIdx === activePlayerIndex) {
                    // Set flag IMMEDIATELY to prevent other handlers from interfering
                    isDraggingPlayer = true;
                    e.stopPropagation();
                    e.preventDefault();
                    const t = e.touches[0];
                    console.log('   ✅ Starting player drag from touch (path2)');
                    startPlayerDrag({
                        clientX: t.clientX,
                        clientY: t.clientY,
                        button: 0,
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    });
                } else {
                    console.log('   ❌ Not active player, ignoring touch (path2)');
                }
            }, { passive: false });

                playerGroup.addEventListener('mouseenter', (e) => {
                    e.stopPropagation();
                });

                playerGroup.addEventListener('mouseleave', (e) => {
                    e.stopPropagation();
                });

                viewport.appendChild(playerGroup);

                activePlayer.x = x;
                activePlayer.y = y;
                activePlayer.element = playerGroup;

                // Control the Current: update which water stones are highlighted after move
                if (spellSystem && spellSystem.scrollEffects && typeof spellSystem.scrollEffects.refreshWaterTransformHighlights === 'function') {
                    spellSystem.scrollEffects.refreshWaterTransformHighlights();
                }
            }

            // Update catacomb teleport indicators
            updateCatacombIndicators();
        }

        // Visual-only player tile placement (called when receiving broadcast from other players)
        function placePlayerTileVisually(x, y, playerIndex, colorName, cosmetics) {
            console.log(`📄 Placing other player's tile: player ${playerIndex}, color ${colorName}, at (${x.toFixed(1)}, ${y.toFixed(1)})`);

            // Temporarily set playerColor to the other player's color
            const originalColor = playerColor;
            playerColor = colorName;

            // Place the player tile - skip multiplayer logic since this is visual-only
            placeTile(x, y, 0, false, 'player', true, true);

            // Relocate the newly pushed pawn from the end of playerPositions to the
            // correct slot.  placeTile → placePlayer always push()es, so simultaneous
            // local placement means index .length is wrong.
            const placed = playerPositions.pop();
            if (placed) {
                placed.index = playerIndex;
                while (playerPositions.length < playerIndex) playerPositions.push(null);
                playerPositions[playerIndex] = placed;
                console.log(`🔧 Relocated remote pawn to playerPositions[${playerIndex}]`);
            }

            // Fix placedTiles entry — placeTile captured playerPositions.length (wrong for
            // remote tiles); patch it to the correct playerIndex so tooltips are right.
            const lastTile = placedTiles[placedTiles.length - 1];
            if (lastTile && lastTile.isPlayerTile) {
                lastTile.playerIndex = playerIndex;
            }

            // Restore our color
            playerColor = originalColor;

            console.log(`✅ Other player's tile placed successfully (visual only)`);
        }

        // Visual-only player movement (called when receiving broadcast from other players)
        function movePlayerVisually(playerIndex, x, y, apSpent) {
            const player = playerPositions[playerIndex];
            if (!player) {
                console.error(`Cannot move player ${playerIndex} - not found`);
                return;
            }

            // Remove old player element
            player.element.remove();

            // Create new player element at new position
            const playerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            playerGroup.setAttribute('class', 'player');
            playerGroup.setAttribute('transform', `translate(${x}, ${y})`);
            playerGroup.style.pointerEvents = 'all';
            playerGroup.style.touchAction = 'none';

            // Invisible larger hit area for easier touch targeting
            const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hitArea.setAttribute('cx', 0);
            hitArea.setAttribute('cy', 0);
            hitArea.setAttribute('r', TILE_SIZE * 0.8);
            hitArea.setAttribute('fill', 'transparent');
            hitArea.setAttribute('stroke', 'none');
            hitArea.style.pointerEvents = 'all';
            playerGroup.appendChild(hitArea);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', TILE_SIZE * 0.4);
            circle.setAttribute('class', 'player-marker');
            circle.setAttribute('fill', player.color);
            circle.setAttribute('stroke', '#000');
            circle.setAttribute('stroke-width', '2');

            playerGroup.appendChild(circle);

            playerGroup.addEventListener('mousedown', (e) => {
                const tf = (typeof window !== 'undefined') ? window.takeFlightState : null;
                if (tf && tf.active && tf.targetPlayerIndex === playerIndex) {
                    e.stopPropagation();
                    e.preventDefault();
                    startPlayerDrag(e, { playerIndex, ignoreTurnCheck: true, isTakeFlight: true });
                    return;
                }
                if (activePlayerIndex === playerIndex) {
                    e.stopPropagation();
                    e.preventDefault();
                    startPlayerDrag(e);
                }
            });

	            // Touch support: start player drag on tap/drag
	            playerGroup.addEventListener('touchstart', (e) => {
	                console.log('👆 Player pawn touchstart (path3) detected!', {touches: e.touches?.length, playerIndex});
	                if (!(e.touches && e.touches.length === 1)) return;
                    const tf = (typeof window !== 'undefined') ? window.takeFlightState : null;
                    if (tf && tf.active && tf.targetPlayerIndex === playerIndex) {
                        // Set flag IMMEDIATELY to prevent other handlers from interfering
                        isDraggingPlayer = true;
                        e.stopPropagation();
                        e.preventDefault();
                        const t = e.touches[0];
                        console.log('   ✅ Starting take-flight drag from touch (path3)');
                        startPlayerDrag({
                            clientX: t.clientX,
                            clientY: t.clientY,
                            button: 0,
                            preventDefault: () => {},
                            stopPropagation: () => {}
                        }, { playerIndex, ignoreTurnCheck: true, isTakeFlight: true });
                        return;
                    }
	                // Mirror mousedown behavior: only active player can be dragged
	                console.log(`   playerIndex=${playerIndex}, activePlayerIndex=${activePlayerIndex}`);
	                if (activePlayerIndex === playerIndex) {
                    // Set flag IMMEDIATELY to prevent other handlers from interfering
                    isDraggingPlayer = true;
                    e.stopPropagation();
                    e.preventDefault();
                    const t = e.touches[0];
                    console.log('   ✅ Starting player drag from touch (path3)');
                    startPlayerDrag({
                        clientX: t.clientX,
                        clientY: t.clientY,
                        button: 0,
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    });
                } else {
                    console.log('   ❌ Not active player, ignoring touch (path3)');
                }
            }, { passive: false });

            viewport.appendChild(playerGroup);

            // Update player position
            player.x = x;
            player.y = y;
            player.element = playerGroup;

            console.log(`📄 Moved player ${playerIndex} to (${x.toFixed(1)}, ${y.toFixed(1)}), spent ${apSpent} AP`);
        }

        // Visual-only stone break (called when receiving broadcast from other players)
        function breakStoneVisually(stoneId) {
            const stone = placedStones.find(s => s.id === stoneId);
            if (!stone) {
                console.log(`⚠️ Cannot break stone ${stoneId} - not found`);
                return;
            }

            console.log(`🔨 Breaking stone visually: id=${stoneId}, type=${stone.type}`);

            // Remove stone from board
            const stoneElement = stone.element;
            if (stoneElement && stoneElement.parentNode) {
                stoneElement.remove();
            }

            // Remove from placedStones array
            const index = placedStones.findIndex(s => s.id === stoneId);
            if (index !== -1) {
                placedStones.splice(index, 1);
            }

            // Return stone to source pool
            returnStoneToPool(stone.type);

            // Update interactions since a stone was removed
            updateTileClasses();
            recheckAllStoneInteractions();
            updateAllWaterStoneVisuals();
            updateAllVoidNullificationVisuals();

            console.log(`✅ Stone ${stoneId} broken visually`);
        }

        // Record player activity (kept for analytics/debug; NOT used for kicking)
        function recordActivity() {
            if (!myPlayerId) return;
            myLastActivity = Date.now();
            playerLastActivity[myPlayerId] = myLastActivity;
            // Turn timeout is based on turn start time, not activity.
            console.log('📡 Activity recorded locally');
        }


        // Update turn timer display (shared by everyone; enforced by host)
        function updateTimerDisplay() {
            const timerElement = document.getElementById('inactivity-timer');
            const hudTimer = document.getElementById('hud-timer');
            const hudTimerValue = document.getElementById('hud-timer-value');

            if (!gameInactivityTimeout || gameInactivityTimeout === 0) {
                if (timerElement) timerElement.style.display = 'none';
                if (hudTimer) hudTimer.style.display = 'none';
                return;
            }

            // Only show timer when it's my turn (during placement phase, this means "canPlaceTile()")
            const isMyActiveTurn = isPlacementPhase ? canPlaceTile() : isMyTurn();
            if (!isMyActiveTurn) {
                if (timerElement) timerElement.style.display = 'none';
                // Keep HUD timer visible but show waiting state
                if (hudTimerValue) hudTimerValue.textContent = '--:--';
                if (hudTimer) hudTimer.classList.remove('warning');
                return;
            }

            const now = Date.now();
            const elapsed = now - (turnStartedAtMs || now);
            const timeRemaining = gameInactivityTimeout - elapsed;

            if (timeRemaining <= 0) {
                if (timerElement) timerElement.style.display = 'none';
                if (hudTimerValue) hudTimerValue.textContent = '0:00';
                return;
            }

            // Show timer
            if (timerElement) timerElement.style.display = 'inline-block';

            // Calculate percentage remaining
            const percentRemaining = (timeRemaining / gameInactivityTimeout) * 100;

            // Format time
            const secondsRemaining = Math.ceil(timeRemaining / 1000);
            const minutes = Math.floor(secondsRemaining / 60);
            const seconds = secondsRemaining % 60;
            const timeText = minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;

            // Update HUD timer
            if (hudTimerValue) hudTimerValue.textContent = timeText;
            if (hudTimer) {
                if (percentRemaining <= 25) {
                    hudTimer.classList.add('warning');
                } else {
                    hudTimer.classList.remove('warning');
                }
            }

            // Color-code old timer based on time remaining
            let color, bgColor, label;
            if (percentRemaining > 75) {
                color = '#fff';
                bgColor = '#4CAF50';
                label = '⚠️';
            } else if (percentRemaining > 50) {
                color = '#000';
                bgColor = '#FFEB3B';
                label = '⚠️';
            } else if (percentRemaining > 25) {
                color = '#fff';
                bgColor = '#FF9800';
                label = '⚠️';
            } else {
                color = '#fff';
                bgColor = '#f44336';
                label = '💎';
            }

            if (timerElement) {
                timerElement.style.backgroundColor = bgColor;
                timerElement.style.color = color;
                timerElement.textContent = `${label} ${timeText}`;
            }
        }

        // Start timer display updates
        function startTimerDisplay() {
            // Clear any existing interval
            if (timerDisplayInterval) {
                clearInterval(timerDisplayInterval);
            }

            // Update display every second
            timerDisplayInterval = setInterval(updateTimerDisplay, 1000);
            updateTimerDisplay(); // Initial update
        }

        // Stop timer display
        function stopTimerDisplay() {
            if (timerDisplayInterval) {
                clearInterval(timerDisplayInterval);
                timerDisplayInterval = null;
            }
            const timerElement = document.getElementById('inactivity-timer');
            if (timerElement) {
                timerElement.style.display = 'none';
            }
        }

        // Turn timeout enforcement (host only)
        async function checkTurnTimeout() {
            if (!isMultiplayer) return;
            if (!isHost) return;
            if (!gameInactivityTimeout || gameInactivityTimeout === 0) return; // disabled

            // Only enforce during active game
            const { data: room, error: roomErr } = await supabase
                .from('game_room')
                .select('status')
                .eq('id', currentGameId)
                .single();

            if (roomErr) {
                console.warn('⚠️ Turn timeout: failed to read room status', roomErr);
                return;
            }

            if (!room || room.status !== 'playing') return;

            const now = Date.now();
            const elapsed = now - (turnStartedAtMs || now);
            if (elapsed < gameInactivityTimeout) return;

            // Time is up — either kick active player or auto-advance
            console.log('⏰ Turn timer expired. kickOnTurnTimeout:', kickOnTurnTimeout, 'activePlayerIndex:', activePlayerIndex, 'isPlacementPhase:', isPlacementPhase);

            // SPECIAL CASE: During placement phase, timeout should kick all players back to lobby
            if (isPlacementPhase) {
                console.log('⏰ Turn timeout during placement phase — resetting game to lobby');
                updateStatus('⏰ Player tile placement timed out — returning all players to lobby');

                // First, kick the AFK player from the lobby
                const { data: allPlayers } = await supabase
                    .from('players')
                    .select('id, username, player_index');

                const afkPlayer = allPlayers?.find(p => p.player_index === activePlayerIndex);

                if (afkPlayer) {
                    console.log(`👢 Kicking AFK player: ${afkPlayer.username} (index ${afkPlayer.player_index})`);
                    const { error: kickErr } = await supabase
                        .from('players')
                        .delete()
                        .eq('id', afkPlayer.id);

                    if (kickErr) {
                        console.error('❌ Failed to kick AFK player:', kickErr);
                    } else {
                        console.log(`✅ AFK player ${afkPlayer.username} removed from lobby`);
                    }
                }

                // Reset game room to waiting status
                const { error: resetErr } = await supabase
                    .from('game_room')
                    .update({ status: 'waiting' })
                    .eq('id', currentGameId);

                if (resetErr) {
                    console.error('❌ Failed to reset game room:', resetErr);
                }

                // Wait a moment for DELETE event to propagate to all clients
                await new Promise(resolve => setTimeout(resolve, 500));

                // Broadcast game-reset event to all players
                if (typeof broadcastGameAction === 'function') {
                    broadcastGameAction('game-reset', {
                        reason: 'placement-timeout',
                        kickedPlayerIndex: activePlayerIndex
                    });
                }

                // Reset local game state (host)
                if (typeof resetToLobby === 'function') {
                    resetToLobby();
                }
                return;
            }

            // SPECIAL CASE: If the active player has an unresolved scroll cascade, they forfeit.
            // (They must place the overflowing scroll before ending their turn; if time runs out, they lose.)
            const hasCascade = typeof spellSystem !== 'undefined' && spellSystem.hasPendingCascade(activePlayerIndex);
            if (hasCascade) {
                const forfeiterName = typeof getPlayerColorName === 'function'
                    ? getPlayerColorName(activePlayerIndex) : `Player ${activePlayerIndex + 1}`;
                console.log(`⏰ Cascade forfeit: ${forfeiterName} ran out of time with unresolved cascade`);
                updateStatus(`⏰ ${forfeiterName} ran out of time with an unresolved scroll cascade — forfeiting!`);
                if (typeof broadcastGameAction === 'function') {
                    broadcastGameAction('cascade-forfeit', { playerIndex: activePlayerIndex });
                }
                // Remove the forfeiting player from the game (same as kick path)
                const { data: forfeitPlayers } = await supabase
                    .from('players')
                    .select('id, username, player_index')
                    .eq('game_id', currentGameId);
                const forfeitPlayer = forfeitPlayers?.find(p => p.player_index === activePlayerIndex);
                if (forfeitPlayer) {
                    await supabase.from('players').delete().eq('id', forfeitPlayer.id);
                }
                await hostAdvanceToNextPlayerAndRestartTimer();
                return;
            }

            // NORMAL GAME PHASE: Use existing kick/auto-advance logic
            if (kickOnTurnTimeout) {
                // Kick active player
                const { data: allPlayers } = await supabase
                    .from('players')
                    .select('id, username, player_index');

                const activePlayer = allPlayers?.find(p => p.player_index === activePlayerIndex);

                if (activePlayer) {
                    const { error: kickErr } = await supabase
                        .from('players')
                        .delete()
                        .eq('id', activePlayer.id);

                    if (kickErr) {
                        console.error('❌ Failed to kick player (turn timeout):', kickErr);
                        return;
                    }

                    updateStatus(`⏰ ${activePlayer.username} was kicked (turn timer expired)`);
                } else {
                    console.warn('⚠️ Turn timeout expired but active player not found in DB');
                }
            } else {
                updateStatus('⏰ Turn timer expired — auto-passing turn.');
            }

            // Advance to next available player and restart the timer
            await hostAdvanceToNextPlayerAndRestartTimer();
        }

        async function hostAdvanceToNextPlayerAndRestartTimer() {
            // Fetch remaining players and choose the next index based on player_index ordering
            const { data: remainingPlayers, error } = await supabase
                .from('players')
                .select('player_index')
                .order('player_index', { ascending: true });

            if (error) {
                console.error('❌ Failed to read players to advance turn:', error);
                return;
            }

            const indices = (remainingPlayers || [])
                .map(p => p.player_index)
                .filter(i => i !== null && i !== undefined)
                .sort((a, b) => a - b);

            if (indices.length === 0) return;

            // Find next index after current; wrap around
            let nextIndex = indices.find(i => i > activePlayerIndex);
            if (nextIndex === undefined) nextIndex = indices[0];

            activePlayerIndex = nextIndex;

            // Restart timer anchored to host time
            const started = Date.now();
            turnStartedAtMs = started;
            currentTurnNumber++;

            // Broadcast turn change with shared turn start timestamp and turn number
            broadcastGameAction('turn-change', {
                playerIndex: activePlayerIndex,
                turnStartedAt: started,
                turnNumber: currentTurnNumber
            });

            // Update local display as host
            if (isPlacementPhase) {
                // During placement phase, turn display is handled in the turn-change receiver
            } else {
                updateTurnDisplay();
            }
        }

        // Start turn timer monitoring (host enforcement + local display)
        function startTurnTimerMonitoring() {
            // Stop any existing
            stopTurnTimerMonitoring();

            // Ensure we have a baseline turn start
            if (!turnStartedAtMs) turnStartedAtMs = Date.now();

            // Host enforces every second
            if (isHost) {
                turnTimeoutInterval = setInterval(() => {
                    // avoid unhandled promise rejections
                    checkTurnTimeout().catch(err => console.error('Turn timeout check failed:', err));
                }, 1000);

                // Host also broadcasts periodic sync every 5 seconds
                turnSyncInterval = setInterval(() => {
                    if (isMultiplayer && typeof broadcastGameAction === 'function') {
                        broadcastGameAction('turn-sync', {
                            playerIndex: activePlayerIndex,
                            turnNumber: currentTurnNumber,
                            turnStartedAt: turnStartedAtMs
                        });
                        console.log(`🔄 Turn sync broadcast: turn ${currentTurnNumber}, player ${activePlayerIndex}`);
                    }
                }, 5000);

                // Host also broadcasts common area sync every 10 seconds
                commonAreaSyncInterval = setInterval(() => {
                    if (isMultiplayer && typeof broadcastGameAction === 'function' && typeof spellSystem !== 'undefined') {
                        // Get current common area state
                        const commonAreaState = {};
                        Object.keys(spellSystem.commonArea).forEach(element => {
                            commonAreaState[element] = spellSystem.commonArea[element];
                        });

                        broadcastGameAction('common-area-sync', {
                            commonArea: commonAreaState
                        });
                        console.log(`🔄 Common area sync broadcast:`, commonAreaState);
                    }
                }, 10000);
            }

            // Everyone updates display every second
            startTimerDisplay();
        }

        // Stop turn timer monitoring
        function stopTurnTimerMonitoring() {
            if (turnTimeoutInterval) {
                clearInterval(turnTimeoutInterval);
                turnTimeoutInterval = null;
            }
            if (turnSyncInterval) {
                clearInterval(turnSyncInterval);
                turnSyncInterval = null;
            }
            if (commonAreaSyncInterval) {
                clearInterval(commonAreaSyncInterval);
                commonAreaSyncInterval = null;
            }
            stopTimerDisplay();
        }

        // Sync current player state (AP and resources) in multiplayer
        function syncPlayerState() {
            if (!isMultiplayer) return;

            // Record activity
            recordActivity();

            // Use global currentAP/voidAP only when we ARE the active player;
            // otherwise fall back to last-known stored values for that player.
            const isMyTurn = (myPlayerIndex === activePlayerIndex);
            const apToSend = isMyTurn ? currentAP : (playerAPs[activePlayerIndex]?.currentAP ?? 5);
            const voidApToSend = isMyTurn ? voidAP : (playerAPs[activePlayerIndex]?.voidAP ?? 0);

            // Update local tracking
            if (!playerAPs[activePlayerIndex]) {
                playerAPs[activePlayerIndex] = { currentAP: 5, voidAP: 0 };
            }
            if (isMyTurn) {
                playerAPs[activePlayerIndex].currentAP = currentAP;
                playerAPs[activePlayerIndex].voidAP = voidAP;
            }

            // Only broadcast resources when it's our own turn.
            // When it's not our turn, we must not broadcast the other player's
            // resource pool — we may have modified it locally (e.g. during
            // processPsychicPending), and broadcasting those values would cause
            // the active player's client to double-apply pool changes (e.g.
            // Respirate drawing wind stones twice).
            const activeResources = isMyTurn
                ? (playerPools[activePlayerIndex] || { ...INITIAL_PLAYER_STONES })
                : null;
            broadcastGameAction('player-state-update', {
                playerIndex: activePlayerIndex,
                currentAP: apToSend,
                voidAP: voidApToSend,
                resources: activeResources
            });
        }

        // Show tooltip with player's AP and resources
        function updatePlayerElementSymbols(playerIndex = null) {
            // If no player index specified, use active player
            if (playerIndex === null) {
                playerIndex = activePlayerIndex;
            }
            
            // Find THIS player's tile
            const playerTile = placedTiles.find(t => t.isPlayerTile && t.playerIndex === playerIndex);
            if (!playerTile) {
                console.log(`No player tile found for player ${playerIndex}`);
                return;
            }

            const symbolsGroup = playerTile.element.querySelector('.player-tile-element-symbols');
            if (!symbolsGroup) return;

            // Clear existing symbols
            symbolsGroup.innerHTML = '';

            // Get activated elements for THIS specific player
            const playerScrollData = spellSystem.playerScrolls[playerIndex];
            if (!playerScrollData) return;
            
            const activatedElements = Array.from(playerScrollData.activated);
            
            if (activatedElements.length === 0) return;

            // Arrange symbols in a tight pentagon pattern inside the tile's center hex
            // Keep radius well within TILE_SIZE (20) so symbols never bleed outside the tile
            const radius = TILE_SIZE * 0.75; // ~15 units — inside the center hex (r=20)
            const angleStep = (Math.PI * 2) / 5;
            const elementOrder = ['earth', 'water', 'fire', 'wind', 'void'];

            activatedElements.forEach(element => {
                const index = elementOrder.indexOf(element);
                const angle = angleStep * index - Math.PI / 2; // Start at top
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                // Outline ring so the pip is visible against any background
                const symbolBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                symbolBg.setAttribute('cx', x);
                symbolBg.setAttribute('cy', y);
                symbolBg.setAttribute('r', '9');
                symbolBg.setAttribute('fill', '#000');
                symbolBg.setAttribute('stroke', STONE_TYPES[element].color);
                symbolBg.setAttribute('stroke-width', '1.5');
                symbolsGroup.appendChild(symbolBg);

                // Element image (screen blend so black bg is transparent)
                const imgEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                imgEl.setAttribute('href', STONE_TYPES[element].img);
                imgEl.setAttribute('x', x - 9);
                imgEl.setAttribute('y', y - 9);
                imgEl.setAttribute('width', '18');
                imgEl.setAttribute('height', '18');
                imgEl.setAttribute('clip-path', `circle(9px at center)`);
                imgEl.style.mixBlendMode = 'screen';
                symbolsGroup.appendChild(imgEl);
            });

            console.log(`🎨 Updated player ${playerIndex}'s TILE with ${activatedElements.length} element symbol(s): ${activatedElements.join(', ')}`);

            // Refresh Players panel win-condition progress
            if (typeof updateOpponentPanel === 'function') updateOpponentPanel();
        }

        // Expose on window so scroll-effects.js (outside this IIFE) can call it
        window.updatePlayerElementSymbols = updatePlayerElementSymbols;

        function startPlayerDrag(e, options = {}) {
            const takeFlight = !!options.isTakeFlight || ((typeof window !== 'undefined') && window.takeFlightState?.active);
            const playerIndex = (typeof options.playerIndex === 'number') ? options.playerIndex : activePlayerIndex;

            // Check if it's this player's turn (unless Take Flight drag)
            if (!takeFlight && !isMyTurn()) {
                notYourTurn();
                return;
            }

            const draggedPlayer = playerPositions[playerIndex];
            if (!draggedPlayer) {
                console.warn('startPlayerDrag: player not found', playerIndex);
                return;
            }

            isDraggingPlayer = true;
            playerPath = [{ x: draggedPlayer.x, y: draggedPlayer.y, cost: 0 }];
            lastAttemptedHex = null; // Reset logging state
            draggedPlayer.element.remove();

            const rect = boardSvg.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const world = screenToWorld(screenX, screenY);

            ghostPlayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            ghostPlayer.setAttribute('class', 'player stone-ghost');
            ghostPlayer.setAttribute('transform', `translate(${world.x}, ${world.y})`);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', TILE_SIZE * 0.4);
            circle.setAttribute('class', 'player-marker');

            ghostPlayer.appendChild(circle);
            viewport.appendChild(ghostPlayer);

            // Create path line (normal movement only)
            if (!takeFlight) {
                pathLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                pathLine.setAttribute('id', 'player-path');
                pathLine.setAttribute('fill', 'none');
                pathLine.setAttribute('stroke', '#58a4f4');
                pathLine.setAttribute('stroke-width', '3');
                pathLine.setAttribute('stroke-dasharray', '5,5');
                pathLine.setAttribute('opacity', '0.7');
                viewport.insertBefore(pathLine, ghostPlayer);
            }
        }

        let lastAttemptedHex = null;

        // Find if target is reachable through a chain of wind stones/water-with-wind
        function findWindPath(startX, startY, targetX, targetY) {
            // BFS to find path through wind stones
            const queue = [{x: startX, y: startY, path: []}];
            const visited = new Set();
            visited.add(`${startX.toFixed(1)},${startY.toFixed(1)}`);

            while (queue.length > 0) {
                const current = queue.shift();

                // Get all wind stones and water-with-wind adjacent to current position
                const windStones = getAdjacentWindStones(current.x, current.y);

                // Also check water with chained wind
                const neighbors = getNeighborStones(current.x, current.y);
                const waterWithWind = neighbors.filter(n => {
                    if (n.type !== 'water') return false;
                    const chainedAbility = getChainedAbility(n.x, n.y);
                    return chainedAbility === 'wind';
                });

                const allWindSources = [...windStones, ...waterWithWind];

                for (const windSource of allWindSources) {
                    const key = `${windSource.x.toFixed(1)},${windSource.y.toFixed(1)}`;

                    // Skip if nullified by void
                    const hasVoid = hasAdjacentStoneType(windSource.x, windSource.y, 'void');
                    if (hasVoid) continue;

                    // Check if target is adjacent to this wind source
                    const windNeighbors = getNeighborHexPositions(windSource.x, windSource.y);
                    const canReachTarget = windNeighbors.some(n =>
                        Math.sqrt(Math.pow(n.x - targetX, 2) + Math.pow(n.y - targetY, 2)) < 5
                    );

                    if (canReachTarget) {
                        // Found a path!
                        return [...current.path, windSource];
                    }

                    // Continue searching through this wind source
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push({
                            x: windSource.x,
                            y: windSource.y,
                            path: [...current.path, windSource]
                        });
                    }
                }
            }

            return null; // No path found
        }

        function findGeneralPath(startX, startY, targetX, targetY, maxCost) {
            // A* pathfinding to find cheapest path through any hex
            const openSet = [{x: startX, y: startY, path: [], cost: 0, priority: 0}];
            const visited = new Map();

            while (openSet.length > 0) {
                // Get node with lowest priority (cost + heuristic)
                openSet.sort((a, b) => a.priority - b.priority);
                const current = openSet.shift();

                const key = `${current.x.toFixed(1)},${current.y.toFixed(1)}`;

                // Skip if we've visited this with lower cost
                if (visited.has(key) && visited.get(key) <= current.cost) continue;
                visited.set(key, current.cost);

                // Check if we reached the target
                const distToTarget = Math.sqrt(Math.pow(current.x - targetX, 2) + Math.pow(current.y - targetY, 2));
                if (distToTarget < 5) {
                    return { path: current.path, cost: current.cost };
                }

                // Explore neighbors
                const neighbors = getNeighborHexPositions(current.x, current.y);
                for (const neighbor of neighbors) {
                    const moveCheck = canPlayerMoveToHex(neighbor.x, neighbor.y);

                    if (moveCheck.canMove) {
                        const newCost = current.cost + moveCheck.cost;

                        // Skip if would exceed max cost
                        if (newCost > maxCost) continue;

                        const neighborKey = `${neighbor.x.toFixed(1)},${neighbor.y.toFixed(1)}`;

                        // Skip if already visited with lower cost
                        if (visited.has(neighborKey) && visited.get(neighborKey) <= newCost) continue;

                        // Calculate heuristic (straight-line distance to target)
                        const heuristic = Math.sqrt(Math.pow(neighbor.x - targetX, 2) + Math.pow(neighbor.y - targetY, 2)) / TILE_SIZE;

                        openSet.push({
                            x: neighbor.x,
                            y: neighbor.y,
                            path: [...current.path, {x: neighbor.x, y: neighbor.y, cost: moveCheck.cost}],
                            cost: newCost,
                            priority: newCost + heuristic
                        });
                    }
                }
            }

            return null; // No path found
        }

        function getAdjacentWindStones(x, y) {
            const neighbors = getNeighborHexPositions(x, y);
            const windStones = [];

            neighbors.forEach(neighborPos => {
                const stone = placedStones.find(s => {
                    const dist = Math.sqrt(Math.pow(s.x - neighborPos.x, 2) + Math.pow(s.y - neighborPos.y, 2));
                    if (dist >= 5) return false;

                    // Check if it's wind or water mimicking wind
                    const effectiveType = getEffectiveStoneType(s);
                    return effectiveType === 'wind';
                });
                if (stone) {
                    windStones.push(stone);
                }
            });

            return windStones;
        }

        function getAdjacentEarthStones(x, y) {
            const neighbors = getNeighborHexPositions(x, y);
            const earthStones = [];

            neighbors.forEach(neighborPos => {
                const stone = placedStones.find(s => {
                    const dist = Math.sqrt(Math.pow(s.x - neighborPos.x, 2) + Math.pow(s.y - neighborPos.y, 2));
                    if (dist >= 5) return false;

                    // Check if it's earth or water mimicking earth
                    const effectiveType = getEffectiveStoneType(s);
                    return effectiveType === 'earth';
                });
                if (stone) {
                    earthStones.push(stone);
                }
            });

            return earthStones;
        }

        // Get the chained ability for a water stone by flood-filling through connected water
        function getChainedAbility(x, y) {
            // Only water stones can receive chained abilities
            const stone = placedStones.find(s => {
                const dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2));
                return dist < 5;
            });

            if (!stone || stone.type !== 'water') {
                return null; // Not a water stone
            }

            // Check if THIS water stone is nullified by void
            const waterNullified = hasAdjacentStoneType(x, y, 'void');
            if (waterNullified) {
                return null; // Water's chaining ability is nullified by adjacent void
            }

            // Flood fill through connected water to find wind/earth sources
            const visited = new Set();
            const queue = [{x, y}];
            visited.add(`${x.toFixed(1)},${y.toFixed(1)}`);

            let hasWind = false;
            let hasEarth = false;

            while (queue.length > 0) {
                const current = queue.shift();
                const neighbors = getNeighborStones(current.x, current.y);

                for (const neighbor of neighbors) {
                    const key = `${neighbor.x.toFixed(1)},${neighbor.y.toFixed(1)}`;

                    // Check if this neighbor is a source stone (wind or earth, not nullified by void)
                    if (neighbor.type === 'wind') {
                        const voidNullified = hasAdjacentStoneType(neighbor.x, neighbor.y, 'void');
                        if (!voidNullified) {
                            hasWind = true;
                        }
                    } else if (neighbor.type === 'earth') {
                        const voidNullified = hasAdjacentStoneType(neighbor.x, neighbor.y, 'void');
                        if (!voidNullified) {
                            hasEarth = true;
                        }
                    }

                    // If neighbor is water and not visited, add to queue to continue flood fill
                    if (neighbor.type === 'water' && !visited.has(key)) {
                        // Check if this water is nullified by void
                        const neighborWaterNullified = hasAdjacentStoneType(neighbor.x, neighbor.y, 'void');
                        if (!neighborWaterNullified) {
                            visited.add(key);
                            queue.push({x: neighbor.x, y: neighbor.y});
                        }
                    }
                }
            }

            // Wind outranks earth
            if (hasWind) return 'wind';
            if (hasEarth) return 'earth';
            return null; // No chained ability
        }

        function updatePlayerPath(x, y) {
            const targetPos = findNearestHexPosition(x, y);
            if (!targetPos.valid) return;

            const startPos = playerPath[0];
            if (!startPos) return;

            const targetKey = `${Math.round(targetPos.x)},${Math.round(targetPos.y)}`;

            // No-op if cursor hasn't moved to a different hex
            if (targetKey === lastAttemptedHex) return;
            lastAttemptedHex = targetKey;

            // Cursor on start hex → reset path to just the origin
            if (Math.hypot(targetPos.x - startPos.x, targetPos.y - startPos.y) < 5) {
                playerPath = [{ x: startPos.x, y: startPos.y, cost: 0 }];
                _applyPathToLine();
                updatePathLabels();
                return;
            }

            // Cursor is on an existing path node → backtrack to that point
            for (let i = playerPath.length - 1; i >= 1; i--) {
                if (Math.hypot(playerPath[i].x - targetPos.x, playerPath[i].y - targetPos.y) < 5) {
                    playerPath = playerPath.slice(0, i + 1);
                    _applyPathToLine();
                    updatePathLabels();
                    return;
                }
            }

            // Cursor is already at the end of the path → nothing to do
            const lastPos = playerPath[playerPath.length - 1];
            if (Math.hypot(lastPos.x - targetPos.x, lastPos.y - targetPos.y) < 5) return;

            // Find the shortest affordable path from start to the cursor hex using Dijkstra
            const newPath = _dijkstraPath(startPos, targetPos);
            if (newPath) playerPath = newPath;

            _applyPathToLine();
            updatePathLabels();
        }

        /**
         * Dijkstra shortest-path from startPos to targetPos across placed hexes.
         * Returns a playerPath array [{x, y, cost}] or null if unreachable / unaffordable.
         */
        function _dijkstraPath(startPos, targetPos) {
            const hexes = getAllHexagonPositions();
            const SNAP_R = TILE_SIZE * 0.6;
            const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;
            const startKey = key(startPos.x, startPos.y);
            const targetKey = key(targetPos.x, targetPos.y);
            const totalAP = getTotalAP();

            // Snap a theoretical neighbour position to the nearest actual placed hex
            const snapNeighbor = (nx, ny) => {
                let best = null, bestD = SNAP_R;
                for (const h of hexes) {
                    const d = Math.hypot(h.x - nx, h.y - ny);
                    if (d < bestD) { bestD = d; best = h; }
                }
                return best;
            };

            const dist     = new Map([[startKey, 0]]);
            const prev     = new Map([[startKey, null]]);
            const costMap  = new Map([[startKey, 0]]);
            const posMap   = new Map([[startKey, startPos]]);
            const queue    = [{ cost: 0, key: startKey }];

            while (queue.length) {
                // Simple priority queue — board is small so this is fast enough
                queue.sort((a, b) => a.cost - b.cost);
                const curr = queue.shift();
                if (curr.key === targetKey) break;
                if (curr.cost > (dist.get(curr.key) ?? Infinity)) continue;

                const currPos = posMap.get(curr.key);
                for (const nb of getNeighborHexPositions(currPos.x, currPos.y)) {
                    const snapped = snapNeighbor(nb.x, nb.y);
                    if (!snapped) continue;

                    const nKey = key(snapped.x, snapped.y);
                    const moveCheck = canPlayerMoveToHex(snapped.x, snapped.y);
                    if (!moveCheck.canMove) continue;

                    const newDist = curr.cost + moveCheck.cost;
                    if (newDist > totalAP) continue;
                    if (newDist >= (dist.get(nKey) ?? Infinity)) continue;

                    dist.set(nKey, newDist);
                    prev.set(nKey, curr.key);
                    costMap.set(nKey, moveCheck.cost);
                    posMap.set(nKey, snapped);
                    queue.push({ cost: newDist, key: nKey });
                }
            }

            if (!dist.has(targetKey)) return null;

            // Reconstruct path by following parent pointers
            const path = [];
            let k = targetKey;
            while (k !== null) {
                const p = posMap.get(k);
                path.unshift({ x: p.x, y: p.y, cost: costMap.get(k) });
                k = prev.get(k);
            }
            return path;
        }

        /** Sync the SVG polyline to the current playerPath */
        function _applyPathToLine() {
            if (!pathLine) return;
            if (playerPath.length > 1) {
                pathLine.setAttribute('points', playerPath.map(p => `${p.x},${p.y}`).join(' '));
            } else {
                pathLine.setAttribute('points', '');
            }
        }

        function updatePathLabels() {
            // Remove old labels
            pathCostLabels.forEach(label => label.remove());
            pathCostLabels = [];

            if (playerPath.length < 2) return;

            // Calculate cumulative costs and remaining AP for each segment
            const steamBuff = getSteamVentsBuff();
            let cumulativeCost = 0;
            let banked = steamBuff ? steamBuff.freeStepBanked : false;

            for (let i = 1; i < playerPath.length; i++) {
                const currentSegment = playerPath[i];
                const stepCost = currentSegment.cost;
                if (steamBuff && stepCost > 0 && banked) {
                    banked = false; // free step
                } else {
                    cumulativeCost += stepCost;
                    if (steamBuff && stepCost > 0) banked = true;
                }
                const remainingAP = currentAP - cumulativeCost;

                // Calculate midpoint between this segment and previous
                const prevSegment = playerPath[i - 1];
                const midX = (currentSegment.x + prevSegment.x) / 2;
                const midY = (currentSegment.y + prevSegment.y) / 2;

                // Create label
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', midX);
                label.setAttribute('y', midY - 8); // Offset above the line
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('fill', remainingAP >= 0 ? '#2ecc71' : '#e74c3c');
                label.setAttribute('font-size', '14');
                label.setAttribute('font-weight', 'bold');
                label.setAttribute('stroke', '#000');
                label.setAttribute('stroke-width', '0.5');
                label.setAttribute('paint-order', 'stroke');
                label.textContent = remainingAP;

                viewport.appendChild(label);
                pathCostLabels.push(label);
            }
        }

        function getNeighborHexPositions(x, y) {
            const neighbors = [];
            const s = TILE_SIZE;
            const dirs = [
                { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
            ];

            for (const dir of dirs) {
                const pos = hexToPixel(dir.q, dir.r, s);
                neighbors.push({ x: x + pos.x, y: y + pos.y });
            }
            return neighbors;
        }

        function calculatePathCost() {
            let totalCost = 0;
            const steamBuff = getSteamVentsBuff();
            if (steamBuff) {
                // Steam Vents: every other AP-costing step is free
                // Start from the buff's current banked state
                let banked = steamBuff.freeStepBanked;
                for (let i = 1; i < playerPath.length; i++) {
                    const stepCost = playerPath[i].cost;
                    if (stepCost > 0 && banked) {
                        // This step is free (banked from previous paid step)
                        banked = false;
                    } else {
                        totalCost += stepCost;
                        if (stepCost > 0) banked = true; // Bank a free step for next
                    }
                }
            } else {
                for (let i = 1; i < playerPath.length; i++) {
                    totalCost += playerPath[i].cost;
                }
            }
            return totalCost;
        }

        function getSteamVentsBuff() {
            const buff = spellSystem?.scrollEffects?.activeBuffs?.steamVents;
            return (buff && buff.playerIndex === activePlayerIndex) ? buff : null;
        }

        function hasSteamVentsBuff() {
            return !!getSteamVentsBuff();
        }

        // After committing movement, update the Steam Vents banked state
        // so future moves in the same turn remember the alternation
        function commitSteamVentsState(path) {
            const buff = getSteamVentsBuff();
            if (!buff) return;
            let banked = buff.freeStepBanked;
            for (let i = 1; i < path.length; i++) {
                const stepCost = path[i].cost;
                if (stepCost > 0 && banked) {
                    banked = false;
                } else if (stepCost > 0) {
                    banked = true;
                }
            }
            buff.freeStepBanked = banked;
            console.log(`♨️ Steam Vents: freeStepBanked now = ${banked}`);
        }
        if (typeof window !== 'undefined') window.commitSteamVentsState = commitSteamVentsState;

        // Calculate movement cost for tap-to-move (simple BFS pathfinding)
        function calculateTapMoveCost(startPos, endPos) {
            const allHexes = getAllHexagonPositions();
            if (allHexes.length === 0) return -1;

            // Find start and end hexes
            let startHex = null, endHex = null;
            allHexes.forEach(hex => {
                const startDist = Math.sqrt(Math.pow(hex.x - startPos.x, 2) + Math.pow(hex.y - startPos.y, 2));
                const endDist = Math.sqrt(Math.pow(hex.x - endPos.x, 2) + Math.pow(hex.y - endPos.y, 2));
                if (startDist < 5) startHex = hex;
                if (endDist < 5) endHex = hex;
            });

            if (!startHex || !endHex) return -1;
            if (startHex.key === endHex.key) return 0;

            // BFS to find shortest path
            const visited = new Set();
            const steamBuff = getSteamVentsBuff();
            const startBanked = steamBuff ? steamBuff.freeStepBanked : false;
            const queue = [{ hex: startHex, cost: 0, banked: startBanked }];
            visited.add(startHex.key);

            while (queue.length > 0) {
                const { hex, cost, banked } = queue.shift();

                // Find adjacent hexes (within ~35 units - one hex step)
                const neighbors = allHexes.filter(h => {
                    if (visited.has(h.key)) return false;
                    const dist = Math.sqrt(Math.pow(h.x - hex.x, 2) + Math.pow(h.y - hex.y, 2));
                    return dist > 5 && dist < 40; // Adjacent hex distance
                });

                for (const neighbor of neighbors) {
                    const moveCheck = canPlayerMoveToHex(neighbor.x, neighbor.y, false);
                    if (!moveCheck.canMove) continue;

                    let newCost = cost;
                    let newBanked = banked;
                    const stepCost = moveCheck.cost || 1;
                    if (steamBuff && stepCost > 0 && newBanked) {
                        newBanked = false; // free step
                    } else {
                        newCost += stepCost;
                        if (steamBuff && stepCost > 0) newBanked = true;
                    }
                    visited.add(neighbor.key);

                    if (neighbor.key === endHex.key) {
                        return newCost;
                    }

                    queue.push({ hex: neighbor, cost: newCost, banked: newBanked });
                }
            }

            return -1; // No path found
        }

        let nextStoneId = 1; // Global counter for unique stone IDs

        // Returns a darkened version of a hex color (factor 0–1)
        function darkenHex(hex, factor) {
            const c = hex.replace('#', '');
            const r = Math.round(parseInt(c.slice(0, 2), 16) * factor);
            const g = Math.round(parseInt(c.slice(2, 4), 16) * factor);
            const b = Math.round(parseInt(c.slice(4, 6), 16) * factor);
            return `rgb(${r},${g},${b})`;
        }

        function placeStone(x, y, type) {
            const stoneId = nextStoneId++;
            console.log(`   Placing stone: id=${stoneId}, type=${type}, position=(${x.toFixed(1)}, ${y.toFixed(1)})`);

            // Broadcast stone placement to other players
            broadcastGameAction('stone-place', {
                x: x,
                y: y,
                stoneType: type
            });

            const stoneGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            stoneGroup.setAttribute('class', 'stone');
            stoneGroup.setAttribute('data-stone-id', stoneId);
            stoneGroup.setAttribute('transform', `translate(${x}, ${y})`);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', STONE_SIZE);
            circle.setAttribute('class', 'stone-piece');
            circle.setAttribute('fill', darkenHex(STONE_TYPES[type].color, 0.55));
            circle.setAttribute('stroke', STONE_TYPES[type].color);
            circle.setAttribute('stroke-width', '1.5');

            const stoneImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            stoneImg.setAttribute('href', STONE_TYPES[type].img);
            stoneImg.setAttribute('x', -STONE_SIZE);
            stoneImg.setAttribute('y', -STONE_SIZE);
            stoneImg.setAttribute('width', STONE_SIZE * 2);
            stoneImg.setAttribute('height', STONE_SIZE * 2);
            // No opacity reduction — symbol renders at full strength

            stoneGroup.appendChild(circle);
            stoneGroup.appendChild(stoneImg);

            stoneGroup.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (e.button !== 0) return;

                const currentPlayerIdx = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                    ? myPlayerIndex
                    : activePlayerIndex;
                const canMoveStone = spellSystem
                    && spellSystem.scrollEffects
                    && typeof spellSystem.scrollEffects.hasWindStoneMove === 'function'
                    && spellSystem.scrollEffects.hasWindStoneMove(currentPlayerIdx);

                if (canMoveStone) {
                    startStoneDrag(stoneId, e);
                    return;
                }

                // Stone dragging disabled - stones can only be placed from pool or broken (right-click)
                updateStatus('Right-click to break this stone (costs AP based on rank)');
            });

            // Touch support: long-press to break stone
            stoneGroup.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();

                const currentPlayerIdx = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                    ? myPlayerIndex
                    : activePlayerIndex;
                const canMoveStone = spellSystem
                    && spellSystem.scrollEffects
                    && typeof spellSystem.scrollEffects.hasWindStoneMove === 'function'
                    && spellSystem.scrollEffects.hasWindStoneMove(currentPlayerIdx);

                if (canMoveStone && e.touches && e.touches.length === 1) {
                    const t = e.touches[0];
                    startStoneDrag(stoneId, {
                        clientX: t.clientX,
                        clientY: t.clientY,
                        button: 0,
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    });
                    return;
                }

                updateStatus('Long-press to break this stone (costs AP based on rank)');
                clearTimeout(stoneLongPressTimer);
                stoneLongPressTimer = setTimeout(() => {
                    attemptBreakStone(stoneId);
                }, 650);
            }, { passive: false });

            stoneGroup.addEventListener('touchend', (e) => {
                clearTimeout(stoneLongPressTimer);
                stoneLongPressTimer = null;
            });

            stoneGroup.addEventListener('contextmenu', (e) => {
                e.stopPropagation();
                e.preventDefault();
                attemptBreakStone(stoneId);
            });

            stoneGroup.addEventListener('mouseenter', (e) => {
                e.stopPropagation();
                
                // Check if stone is adjacent to player and show break cost
                const stone = placedStones.find(s => s.id === stoneId);
                if (stone && playerPosition && isAdjacentToPlayer(stone.x, stone.y)) {
                    const STONE_RANK = { 'void': 1, 'wind': 2, 'fire': 3, 'water': 4, 'earth': 5 };
                    const breakCost = STONE_RANK[stone.type];
                    const canAffordBreak = getTotalAP() >= breakCost;
                    
                    stoneGroup.style.cursor = 'pointer';
                    stoneGroup.style.filter = canAffordBreak ? 'brightness(1.3)' : 'brightness(0.7)';
                    
                    updateStatus(`Right-click to break ${stone.type} stone (${breakCost} AP)${canAffordBreak ? '' : ' - Not enough AP!'}`);
                }
            });

            stoneGroup.addEventListener('mouseleave', (e) => {
                e.stopPropagation();
                stoneGroup.style.filter = '';
            });

            viewport.appendChild(stoneGroup);

            placedStones.push({
                id: stoneId,
                x: x,
                y: y,
                type: type,
                element: stoneGroup
            });

            // Track for Burning Motivation: grant AP per stone placed (until end of turn, stacks)
            if (typeof spellSystem !== 'undefined' && spellSystem.scrollEffects) {
                const buff = spellSystem.scrollEffects.activeBuffs?.burningMotivation;
                if (buff && buff.playerIndex === activePlayerIndex && buff.stacks > 0) {
                    const apGain = buff.stacks * 2;
                    if (apGain > 0 && typeof addAP === 'function') {
                        addAP(apGain);
                        if (typeof updateStatus === 'function') {
                            updateStatus(`Burning Motivation! +${apGain} AP for placing a stone.`);
                        }
                    }
                }
            }

            updateTileClasses();
            processStoneInteractions(x, y, type);

            // Re-check all fire stones in case void was moved away
            recheckAllStoneInteractions();

            // Update visuals for all water stones (mimicry indicators)
            updateAllWaterStoneVisuals();

            // Control the Current: if a water stone was just placed during water-transform mode,
            // refresh highlights so the new stone gets its click handler attached immediately
            if (type === 'water' &&
                spellSystem?.scrollEffects?.selectionMode?.type === 'water-transform') {
                spellSystem.scrollEffects.refreshWaterTransformHighlights();
            }

            // Update void nullification indicators
            updateAllVoidNullificationVisuals();

            return stoneId;
        }

        // Place a moved stone without broadcasting or pool changes
        function placeMovedStone(x, y, type, stoneId) {
            const resolvedId = (stoneId != null) ? stoneId : nextStoneId++;
            if (resolvedId >= nextStoneId) nextStoneId = resolvedId + 1;

            const stoneGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            stoneGroup.setAttribute('class', 'stone');
            stoneGroup.setAttribute('data-stone-id', resolvedId);
            stoneGroup.setAttribute('transform', `translate(${x}, ${y})`);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', STONE_SIZE);
            circle.setAttribute('class', 'stone-piece');
            circle.setAttribute('fill', darkenHex(STONE_TYPES[type].color, 0.55));
            circle.setAttribute('stroke', STONE_TYPES[type].color);
            circle.setAttribute('stroke-width', '1.5');

            const stoneImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            stoneImg.setAttribute('href', STONE_TYPES[type].img);
            stoneImg.setAttribute('x', -STONE_SIZE);
            stoneImg.setAttribute('y', -STONE_SIZE);
            stoneImg.setAttribute('width', STONE_SIZE * 2);
            stoneImg.setAttribute('height', STONE_SIZE * 2);
            // No opacity reduction — symbol renders at full strength

            stoneGroup.appendChild(circle);
            stoneGroup.appendChild(stoneImg);

            stoneGroup.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (e.button !== 0) return;

                const currentPlayerIdx = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                    ? myPlayerIndex
                    : activePlayerIndex;
                const canMoveStone = spellSystem
                    && spellSystem.scrollEffects
                    && typeof spellSystem.scrollEffects.hasWindStoneMove === 'function'
                    && spellSystem.scrollEffects.hasWindStoneMove(currentPlayerIdx);

                if (canMoveStone) {
                    startStoneDrag(resolvedId, e);
                    return;
                }

                updateStatus('Right-click to break this stone (costs AP based on rank)');
            });

            // Touch support: long-press to break stone (or drag if Wind II is active)
            stoneGroup.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();

                const currentPlayerIdx = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                    ? myPlayerIndex
                    : activePlayerIndex;
                const canMoveStone = spellSystem
                    && spellSystem.scrollEffects
                    && typeof spellSystem.scrollEffects.hasWindStoneMove === 'function'
                    && spellSystem.scrollEffects.hasWindStoneMove(currentPlayerIdx);

                if (canMoveStone && e.touches && e.touches.length === 1) {
                    const t = e.touches[0];
                    startStoneDrag(resolvedId, {
                        clientX: t.clientX,
                        clientY: t.clientY,
                        button: 0,
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    });
                    return;
                }

                updateStatus('Long-press to break this stone (costs AP based on rank)');
                clearTimeout(stoneLongPressTimer);
                stoneLongPressTimer = setTimeout(() => {
                    attemptBreakStone(resolvedId);
                }, 650);
            }, { passive: false });

            stoneGroup.addEventListener('touchend', (e) => {
                clearTimeout(stoneLongPressTimer);
                stoneLongPressTimer = null;
            });

            stoneGroup.addEventListener('contextmenu', (e) => {
                e.stopPropagation();
                e.preventDefault();
                attemptBreakStone(resolvedId);
            });

            viewport.appendChild(stoneGroup);

            placedStones.push({
                id: resolvedId,
                x: x,
                y: y,
                type: type,
                element: stoneGroup
            });

            updateTileClasses();
            processStoneInteractions(x, y, type);
            recheckAllStoneInteractions();
            updateAllWaterStoneVisuals();
            updateAllVoidNullificationVisuals();

            return resolvedId;
        }

        // Visual-only stone move (called when receiving broadcast from other players)
        function moveStoneVisually(stoneId, x, y, stoneType) {
            const stone = placedStones.find(s => s.id === stoneId);
            if (stone) {
                stone.x = x;
                stone.y = y;
                if (stone.element) {
                    stone.element.setAttribute('transform', `translate(${x}, ${y})`);
                }
                updateTileClasses();
                processStoneInteractions(x, y, stone.type);
                recheckAllStoneInteractions();
                updateAllWaterStoneVisuals();
                updateAllVoidNullificationVisuals();
                return;
            }

            if (stoneType) {
                placeMovedStone(x, y, stoneType, stoneId);
            } else {
                console.log(`⚠️ Cannot move stone ${stoneId} - not found`);
            }
        }

        // Visual-only stone placement (called when receiving broadcast from other players)
        function placeStoneVisually(x, y, stoneType) {
            // Same logic as placeStone but without broadcasting
            const stoneId = nextStoneId++;
            const stoneGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            stoneGroup.setAttribute('class', 'stone');
            stoneGroup.setAttribute('data-stone-id', stoneId);
            stoneGroup.setAttribute('transform', `translate(${x}, ${y})`);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', STONE_SIZE);
            circle.setAttribute('class', 'stone-piece');
            circle.setAttribute('fill', darkenHex(STONE_TYPES[stoneType].color, 0.55));
            circle.setAttribute('stroke', STONE_TYPES[stoneType].color);
            circle.setAttribute('stroke-width', '1.5');

            const stoneImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            stoneImg.setAttribute('href', STONE_TYPES[stoneType].img);
            stoneImg.setAttribute('x', -STONE_SIZE);
            stoneImg.setAttribute('y', -STONE_SIZE);
            stoneImg.setAttribute('width', STONE_SIZE * 2);
            stoneImg.setAttribute('height', STONE_SIZE * 2);
            // No opacity reduction — symbol renders at full strength

            stoneGroup.appendChild(circle);
            stoneGroup.appendChild(stoneImg);

            stoneGroup.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (e.button !== 0) return;

                const currentPlayerIdx = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                    ? myPlayerIndex
                    : activePlayerIndex;
                const canMoveStone = spellSystem
                    && spellSystem.scrollEffects
                    && typeof spellSystem.scrollEffects.hasWindStoneMove === 'function'
                    && spellSystem.scrollEffects.hasWindStoneMove(currentPlayerIdx);

                if (canMoveStone) {
                    startStoneDrag(stoneId, e);
                    return;
                }

                updateStatus('Right-click to break this stone (costs AP based on rank)');
            });

            // Touch support: long-press to break stone
            stoneGroup.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.preventDefault();

                const currentPlayerIdx = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                    ? myPlayerIndex
                    : activePlayerIndex;
                const canMoveStone = spellSystem
                    && spellSystem.scrollEffects
                    && typeof spellSystem.scrollEffects.hasWindStoneMove === 'function'
                    && spellSystem.scrollEffects.hasWindStoneMove(currentPlayerIdx);

                if (canMoveStone && e.touches && e.touches.length === 1) {
                    const t = e.touches[0];
                    startStoneDrag(stoneId, {
                        clientX: t.clientX,
                        clientY: t.clientY,
                        button: 0,
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    });
                    return;
                }

                updateStatus('Long-press to break this stone (costs AP based on rank)');
                clearTimeout(stoneLongPressTimer);
                stoneLongPressTimer = setTimeout(() => {
                    attemptBreakStone(stoneId);
                }, 650);
            }, { passive: false });

            stoneGroup.addEventListener('touchend', (e) => {
                clearTimeout(stoneLongPressTimer);
                stoneLongPressTimer = null;
            });

            stoneGroup.addEventListener('contextmenu', (e) => {
                e.stopPropagation();
                e.preventDefault();
                attemptBreakStone(stoneId);
            });

            viewport.appendChild(stoneGroup);

            placedStones.push({
                id: stoneId,
                x: x,
                y: y,
                type: stoneType,
                element: stoneGroup
            });

            updateTileClasses();
            processStoneInteractions(x, y, stoneType);
            recheckAllStoneInteractions();
            updateAllWaterStoneVisuals();
            updateAllVoidNullificationVisuals();
        }

        function updateAllWaterStoneVisuals() {
            // Update all water stones to show what they're mimicking
            placedStones.forEach(stone => {
                if (stone.type === 'water') {
                    updateWaterStoneVisual(stone);
                }
            });
        }

        function updateAllVoidNullificationVisuals() {
            // Update all stones to show if they're nullified by void
            placedStones.forEach(stone => {
                // Remove any existing nullification indicator
                const existingNullIndicator = stone.element.querySelector('.void-nullification-indicator');
                if (existingNullIndicator) {
                    existingNullIndicator.remove();
                }

                // Check if this stone is nullified by adjacent void
                // (Only fire, wind, and earth have abilities that can be nullified)
                if (stone.type === 'fire' || stone.type === 'wind' || stone.type === 'earth') {
                    const hasVoid = hasAdjacentStoneType(stone.x, stone.y, 'void');
                    if (hasVoid) {
                        // Add nullification indicator (X or crossed-out effect)
                        const nullIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        nullIndicator.setAttribute('cx', 0);
                        nullIndicator.setAttribute('cy', 0);
                        nullIndicator.setAttribute('r', STONE_SIZE + 3);
                        nullIndicator.setAttribute('class', 'void-nullification-indicator');
                        nullIndicator.setAttribute('fill', 'none');
                        nullIndicator.setAttribute('stroke', STONE_TYPES['void'].color);
                        nullIndicator.setAttribute('stroke-width', '2');
                        nullIndicator.setAttribute('stroke-dasharray', '2,2');
                        nullIndicator.setAttribute('opacity', '0.6');

                        // Insert before other elements
                        stone.element.insertBefore(nullIndicator, stone.element.firstChild);

                        console.log(`✨ ${stone.type} at (${stone.x.toFixed(1)}, ${stone.y.toFixed(1)}) is nullified by void`);
                    }
                }
            });
        }

        function updateWaterStoneVisual(waterStone) {
            const effectiveType = getEffectiveStoneType(waterStone);
            const chainedAbility = getChainedAbility(waterStone.x, waterStone.y);

            // Remove any existing indicators
            const existingIndicator = waterStone.element.querySelector('.mimicry-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            const existingChainIndicator = waterStone.element.querySelector('.chain-indicator');
            if (existingChainIndicator) {
                existingChainIndicator.remove();
            }

            // Determine what to show: chained ability takes precedence over mimicry
            // because chaining uses wind-outranks-earth logic
            const displayAbility = chainedAbility || (effectiveType !== 'water' ? effectiveType : null);

            if (displayAbility) {
                const isChained = !!chainedAbility;
                const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                indicator.setAttribute('cx', 0);
                indicator.setAttribute('cy', 0);
                indicator.setAttribute('r', STONE_SIZE + 3);
                indicator.setAttribute('class', isChained ? 'chain-indicator' : 'mimicry-indicator');
                indicator.setAttribute('fill', 'none');
                indicator.setAttribute('stroke', STONE_TYPES[displayAbility].color);
                indicator.setAttribute('stroke-width', '2');
                indicator.setAttribute('stroke-dasharray', isChained ? '5,2' : '3,3');
                if (isChained) {
                    indicator.setAttribute('opacity', '0.7');
                }

                // Insert before other elements
                waterStone.element.insertBefore(indicator, waterStone.element.firstChild);

                if (isChained) {
                    console.log(`💧 Water at (${waterStone.x.toFixed(1)}, ${waterStone.y.toFixed(1)}) has chained ${displayAbility} ability`);
                } else {
                    console.log(`💧 Water at (${waterStone.x.toFixed(1)}, ${waterStone.y.toFixed(1)}) is mimicking ${displayAbility}`);
                }
            }
        }

        function getNeighborStones(x, y) {
            const neighbors = [];
            const hexPositions = getAllHexagonPositions();

            hexPositions.forEach(pos => {
                const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                if (dist > 5 && dist < TILE_SIZE * 2.5) {
                    const stone = placedStones.find(s => {
                        const stoneDist = Math.sqrt(Math.pow(s.x - pos.x, 2) + Math.pow(s.y - pos.y, 2));
                        return stoneDist < 5;
                    });
                    if (stone) {
                        neighbors.push(stone);
                    }
                }
            });

            return neighbors;
        }

        function hasAdjacentStoneType(x, y, type) {
            const neighbors = getNeighborStones(x, y);
            return neighbors.some(s => s.type === type);
        }

        // Stone rank for water mimicry priority (lower = higher priority)
        const STONE_RANK = {
            'void': 1,
            'wind': 2,
            'fire': 3,
            'water': 4,
            'earth': 5
        };

        // Get the effective type of a stone (considering water mimicry)
        function getEffectiveStoneType(stone) {
            if (stone.type !== 'water') {
                return stone.type;
            }

            // Water mimics adjacent stones
            const neighbors = getNeighborStones(stone.x, stone.y);
            if (neighbors.length === 0) {
                return 'water'; // No neighbors, just water
            }

            // Find highest-ranked adjacent stone (lowest rank number)
            let bestRank = Infinity;
            let mimicType = 'water';

            neighbors.forEach(neighbor => {
                const rank = STONE_RANK[neighbor.type] || 999;
                if (rank < bestRank && neighbor.type !== 'water') {
                    bestRank = rank;
                    mimicType = neighbor.type;
                }
            });

            return mimicType;
        }

        function recheckAllStoneInteractions() {
            // Re-check interactions for all fire stones on the board
            // This ensures fire destroys adjacent stones when void is removed
            const fireStones = placedStones.filter(s => s.type === 'fire');

            fireStones.forEach(stone => {
                const fireHasVoid = hasAdjacentStoneType(stone.x, stone.y, 'void');
                if (!fireHasVoid) {
                    // Fire is not nullified, check what it should destroy
                    const neighbors = getNeighborStones(stone.x, stone.y);
                    const stonesToDestroy = [];
                    neighbors.forEach(neighbor => {
                        // Fire destroys ALL stones except void and fire
                        // (Water is NOT protected - fire destroys water)
                        if (neighbor.type !== 'void' && neighbor.type !== 'fire') {
                            stonesToDestroy.push(neighbor.id);
                        }
                    });

                    // Destroy adjacent stones (using direct removal to avoid recursion)
                    stonesToDestroy.forEach(targetId => {
                        const target = placedStones.find(s => s.id === targetId);
                        if (target) {
                            target.element.remove();
                            placedStones = placedStones.filter(s => s.id !== targetId);
                            returnStoneToPool(target.type);
                            updateStatus(`Fire destroyed ${target.type} stone!`);
                        }
                    });
                }
            });
        }

        function processStoneInteractions(x, y, type) {
            const neighbors = getNeighborStones(x, y);

            // Special case: water stone placed with both fire and a higher-priority stone
            // Water mimics the higher-priority stone, then gets destroyed by fire
            if (type === 'water') {
                const hasActiveFire = neighbors.some(n => n.type === 'fire' && !hasAdjacentStoneType(n.x, n.y, 'void'));
                if (hasActiveFire) {
                    // Check what the water would mimic
                    const effectiveType = getEffectiveStoneType({ x, y, type: 'water' });
                    // If water is mimicking something other than water or fire, it gets destroyed
                    if (effectiveType !== 'water' && effectiveType !== 'fire') {
                        const stoneToRemove = placedStones.find(s => s.x === x && s.y === y);
                        if (stoneToRemove) {
                            setTimeout(() => {
                                removeStone(stoneToRemove.id);
                                updateStatus(`Water mimicked ${effectiveType}, then was destroyed by fire!`);
                            }, 100);
                        }
                        return; // Stop processing other interactions
                    }
                }
            }

            // Fire destroys adjacent non-void, non-fire stones
            // But only if fire itself is not nullified by an adjacent void
            if (type === 'fire') {
                const fireHasVoid = hasAdjacentStoneType(x, y, 'void');

                if (!fireHasVoid) {
                    const stonesToDestroy = [];
                    neighbors.forEach(neighbor => {
                        // Don't destroy void or fire
                        // Fire destroys ALL other stones, even if they're voided
                        if (neighbor.type !== 'void' && neighbor.type !== 'fire') {
                            stonesToDestroy.push(neighbor);
                        }
                    });

                    // Destroy all adjacent stones (voided or not)
                    stonesToDestroy.forEach(stone => {
                        removeStone(stone.id);
                        updateStatus(`Fire destroyed ${stone.type} stone!`);
                    });
                }
            }

            // Fire also checks incoming threats
            neighbors.forEach(neighbor => {
                if (neighbor.type === 'fire' && type !== 'void' && type !== 'fire') {
                    const hasVoid = hasAdjacentStoneType(neighbor.x, neighbor.y, 'void');
                    if (!hasVoid) {
                        const stoneToRemove = placedStones.find(s => s.x === x && s.y === y);
                        if (stoneToRemove) {
                            removeStone(stoneToRemove.id);
                            updateStatus(`Fire destroyed ${type} stone!`);
                        }
                    }
                }
            });
        }

        function removeStone(stoneId) {
            const stone = placedStones.find(s => s.id === stoneId);
            if (stone) {
                stone.element.remove();
                placedStones = placedStones.filter(s => s.id !== stoneId);
                returnStoneToPool(stone.type);
                updateTileClasses();

                // Re-check all fire stones to see if they should activate
                recheckAllStoneInteractions();

                // Update all water stone visuals since chaining may have changed
                updateAllWaterStoneVisuals();

                // Update void nullification indicators
                updateAllVoidNullificationVisuals();
            }
        }

        
        function isHexOccupiedByOtherPlayer(x, y) {
            if (!Array.isArray(playerPositions) || typeof activePlayerIndex !== 'number') return false;
            return playerPositions.some((p, idx) => {
                if (!p) return false;
                if (idx === activePlayerIndex) return false; // ignore self
                const dist = Math.hypot(p.x - x, p.y - y);
                return dist < 5; // same positional threshold used elsewhere
            });
        }

        function canPlayerMoveToHex(x, y, logBlocked = false) {
            // Block movement onto hexes occupied by other players (prevents moving "through" players as pathing is step-wise)
            if (isHexOccupiedByOtherPlayer(x, y)) {
                if (logBlocked) console.log(`❌ Cannot move to (${x.toFixed(1)}, ${y.toFixed(1)}): occupied by another player`);
                return { canMove: false, cost: Infinity };
            }

            const stone = placedStones.find(s => {
                const dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2));
                return dist < 5;
            });

            if (!stone) return { canMove: true, cost: 1 };

            // Mudslide buff: earth and water stones act as wind stones (free movement)
            const mudslideBuff = spellSystem?.scrollEffects?.activeBuffs?.mudslide;
            if (mudslideBuff && mudslideBuff.playerIndex === activePlayerIndex) {
                if (stone.type === 'earth' || stone.type === 'water') {
                    // Treat as wind stone — free movement, unless nullified by void
                    const hasVoid = hasAdjacentStoneType(x, y, 'void');
                    if (hasVoid) return { canMove: true, cost: 1 };
                    console.log(`🌊 Mudslide: ${stone.type} stone at (${x.toFixed(1)}, ${y.toFixed(1)}) acts as wind (free movement)`);
                    return { canMove: true, cost: 0 };
                }
            }

            // Handle water stones with chaining
            if (stone.type === 'water') {
                const chainedAbility = getChainedAbility(x, y);
                console.log(`💧 Water at (${x.toFixed(1)}, ${y.toFixed(1)}) has chained ability: ${chainedAbility || 'none'}`);

                if (chainedAbility === 'wind') {
                    // Wind chains through water - free movement
                    console.log(`✓ Wind chaining active - water becomes free movement`);
                    return { canMove: true, cost: 0 };
                } else if (chainedAbility === 'earth') {
                    // Earth chains through water - blocks movement
                    console.log(`✓ Earth chaining active - water blocks movement`);
                    if (logBlocked) console.log(`❌ Cannot move to (${x.toFixed(1)}, ${y.toFixed(1)}): Water has chained Earth ability (blocks movement)`);
                    return { canMove: false, cost: Infinity };
                }

                // No chaining effects, normal water cost
                console.log(`💧 No chaining - normal water cost (2 AP)`);
                return { canMove: true, cost: 2 };
            }

            // Handle non-water stones based on their ACTUAL type, not mimicry
            // (Mimicry is visual only, doesn't affect movement)

            // Earth blocks movement (unless nullified by void)
            if (stone.type === 'earth') {
                const hasVoid = hasAdjacentStoneType(x, y, 'void');
                if (hasVoid) return { canMove: true, cost: 1 }; // Nullified by void, reverts to baseline
                if (logBlocked) console.log(`❌ Cannot move to (${x.toFixed(1)}, ${y.toFixed(1)}): Earth stone blocks movement (needs adjacent Void to nullify)`);
                return { canMove: false, cost: Infinity };
            }

            // Wind is free (0 cost) - ability overrides baseline
            if (stone.type === 'wind') {
                const hasVoid = hasAdjacentStoneType(x, y, 'void');
                if (hasVoid) return { canMove: true, cost: 1 }; // Nullified by void, reverts to baseline
                return { canMove: true, cost: 0 }; // Wind ability: free movement
            }

            // All other stones (void, fire, etc.) cost 1 AP (baseline)
            return { canMove: true, cost: 1 };
        }

        function startStoneDrag(stoneId, e) {
            // Check if it's this player's turn and no pending cascade
            if (!canTakeAction()) {
                notYourTurn();
                return;
            }

            const stone = placedStones.find(s => s.id === stoneId);
            if (!stone) {
                console.log('❌ Stone not found for dragging');
                return;
            }

            // Check if stone is adjacent to player
            if (!playerPosition) {
                updateStatus('❌ No player on board!');
                return;
            }

            if (!isAdjacentToPlayer(stone.x, stone.y)) {
                updateStatus('❌ Can only move stones adjacent to player!');
                console.log(`❌ Cannot drag stone id=${stoneId}: not adjacent to player`);
                return;
            }

            console.log(`✅ Starting drag for stone id=${stoneId}, type=${stone.type} (adjacent to player)`);

            // Clean up any pre-existing ghost (prevents orphaned stamps)
            if (ghostStone) {
                ghostStone.remove();
                ghostStone = null;
            }

            isDraggingStone = true;
            draggedStoneId = stoneId;
            draggedStoneType = stone.type;
            draggedStoneOriginalPos = { x: stone.x, y: stone.y };
            stone.element.remove();
            placedStones = placedStones.filter(s => s.id !== stoneId);
            updateTileClasses();

            // Re-check all fire stones to see if they should activate/deactivate
            recheckAllStoneInteractions();

            // Update all water stone visuals since chaining may have changed
            updateAllWaterStoneVisuals();

            // Update void nullification indicators
            updateAllVoidNullificationVisuals();

            const rect = boardSvg.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const world = screenToWorld(screenX, screenY);

            ghostStone = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            ghostStone.setAttribute('class', 'stone stone-ghost');
            ghostStone.setAttribute('transform', `translate(${world.x}, ${world.y})`);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', STONE_SIZE);
            circle.setAttribute('class', 'stone-piece');
            circle.setAttribute('fill', darkenHex(STONE_TYPES[draggedStoneType].color, 0.55));
            circle.setAttribute('stroke', STONE_TYPES[draggedStoneType].color);
            circle.setAttribute('stroke-width', '1.5');

            const ghostImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            ghostImg.setAttribute('href', STONE_TYPES[draggedStoneType].img);
            ghostImg.setAttribute('x', -STONE_SIZE);
            ghostImg.setAttribute('y', -STONE_SIZE);
            ghostImg.setAttribute('width', STONE_SIZE * 2);
            ghostImg.setAttribute('height', STONE_SIZE * 2);
            // No opacity reduction — symbol renders at full strength

            ghostStone.appendChild(circle);
            ghostStone.appendChild(ghostImg);
            viewport.appendChild(ghostStone);
        }

        function updateStoneCount(type) {
            // Update old UI
            const oldEl = document.getElementById(type + '-count');
            if (oldEl) oldEl.textContent = stoneCounts[type] + '/' + stoneCapacity[type];
            updateSourceCount(type);

            // Update new UI
            const newCountEl = document.getElementById('new-' + type + '-count');
            if (newCountEl) newCountEl.textContent = stoneCounts[type] + '/' + stoneCapacity[type];
            const newSourceEl = document.getElementById('new-' + type + '-source');
            if (newSourceEl) newSourceEl.textContent = sourcePool[type] + '/' + (sourcePoolCapacity[type] ?? 25);

            // Update dock stone chip for this element
            const dockChipEl = document.getElementById('dock-' + type + '-count');
            if (dockChipEl) dockChipEl.textContent = sourcePool[type] ?? '--';

            // Refresh Players panel so self-card stone counts stay in sync
            if (typeof updateOpponentPanel === 'function') updateOpponentPanel();

            // Update void AP whenever void stones change
            if (type === 'void') {
                // If Transmute is open, suppress void AP auto-sync for that player
                const displayIndex = (typeof isMultiplayer !== 'undefined' && isMultiplayer && myPlayerIndex !== null)
                    ? myPlayerIndex : activePlayerIndex;
                const suppress = spellSystem?.scrollEffects?.activeBuffs?.suppressVoidAPSync;
                if (suppress && suppress.playerIndex === displayIndex) {
                    console.log(`💨 Void stones changed to ${playerPool.void}, suppressing void AP sync`);
                } else {
                    console.log(`💨 Void stones changed to ${playerPool.void}, updating void AP to match`);
                    updateVoidAP();
                }
            }
        }

        // Expose updateStoneCount for scroll effects system
        window.updateStoneCount = updateStoneCount;

        // Reset all per-game state so a new game starts clean (no leftover resources)
        function resetGameResources() {
            // Remove any leftover game-over overlays from a previous game
            document.querySelectorAll('.game-over-overlay').forEach(el => el.remove());

            // Remove all stone SVG elements still on the board from the previous game
            document.querySelectorAll('.stone').forEach(el => el.remove());
            placedStones.length = 0;

            // Stone pools
            playerPools.length = 0;
            sourcePool.earth = 20;
            sourcePool.water = 20;
            sourcePool.fire  = 20;
            sourcePool.wind  = 20;
            sourcePool.void  = 20;

            // AP
            currentAP = 5;
            voidAP    = 0;
            playerAPs.length = 0;

            // Scroll state (hands, activated elements)
            spellSystem.playerScrolls = [];

            // Reset common area (clear stale cards from previous game)
            spellSystem.commonArea = { earth: null, water: null, fire: null, wind: null, void: null, catacomb: null };

            // Reset scroll decks to full from definitions (or fallback)
            if (typeof SCROLL_DECKS !== 'undefined') {
                spellSystem.scrollDecks = {};
                Object.keys(SCROLL_DECKS).forEach(element => {
                    spellSystem.scrollDecks[element] = [...SCROLL_DECKS[element]];
                });
            } else {
                spellSystem.scrollDecks = {
                    earth: ['EARTH_SCROLL_1','EARTH_SCROLL_2','EARTH_SCROLL_3','EARTH_SCROLL_4','EARTH_SCROLL_5'],
                    water: ['WATER_SCROLL_1','WATER_SCROLL_2','WATER_SCROLL_3','WATER_SCROLL_4','WATER_SCROLL_5'],
                    fire:  ['FIRE_SCROLL_1','FIRE_SCROLL_2','FIRE_SCROLL_3','FIRE_SCROLL_4','FIRE_SCROLL_5'],
                    wind:  ['WIND_SCROLL_1','WIND_SCROLL_2','WIND_SCROLL_3','WIND_SCROLL_4','WIND_SCROLL_5'],
                    void:  ['VOID_SCROLL_1','VOID_SCROLL_2','VOID_SCROLL_3','VOID_SCROLL_4','VOID_SCROLL_5'],
                    catacomb: ['CATACOMB_SCROLL_1','CATACOMB_SCROLL_2','CATACOMB_SCROLL_3','CATACOMB_SCROLL_4','CATACOMB_SCROLL_5']
                };
            }
            spellSystem.shuffleAllDecks();

            // Scroll effect buffs and interactive-scroll states
            if (spellSystem.scrollEffects) {
                spellSystem.scrollEffects.activeBuffs = {};
            }
            window.telekinesisState = null;
            window.takeFlightState  = null;

            console.log('🔄 Game resources reset (scroll decks and common area cleared)');
        }
        window.resetGameResources = resetGameResources;

