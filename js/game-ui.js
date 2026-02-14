        // ============================================
        // NEW UI FUNCTIONS
        // ============================================

        function initializeNewUI() {
            console.log('🎨 Initializing new UI...');

            // Setup panel toggle buttons
            const toggleLeftBtn = document.getElementById('toggle-left-panel');
            const toggleRightBtn = document.getElementById('toggle-right-panel');
            const gameLayout = document.getElementById('game-layout');

            if (toggleLeftBtn) {
                toggleLeftBtn.addEventListener('click', () => {
                    gameLayout.classList.toggle('left-collapsed');
                    toggleLeftBtn.textContent = gameLayout.classList.contains('left-collapsed') ? '\u25B6' : '\u25C0';
                });
                toggleLeftBtn.textContent = gameLayout.classList.contains('left-collapsed') ? '\u25B6' : '\u25C0';
            }

            if (toggleRightBtn) {
                toggleRightBtn.addEventListener('click', () => {
                    gameLayout.classList.toggle('right-collapsed');
                    toggleRightBtn.textContent = gameLayout.classList.contains('right-collapsed') ? '\u25C0' : '\u25B6';
                });
                toggleRightBtn.textContent = gameLayout.classList.contains('right-collapsed') ? '\u25C0' : '\u25B6';
            }

            // Setup stone card drag handlers for new UI
            const stoneCards = document.querySelectorAll('.stone-card');
            stoneCards.forEach(card => {
                const element = card.dataset.element;
                if (element) {
                    setupStoneDragFromCard(card, element);
                }
            });

            // Setup scroll deck UI
            initializeScrollDeckUI();

            // Common area popout: expanded = show stone patterns, minimized = names only
            let commonAreaExpanded = false;
            const toggleCommonAreaBtn = document.getElementById('toggle-common-area');
            const commonAreaContainer = document.getElementById('common-area-container');
            if (toggleCommonAreaBtn && commonAreaContainer) {
                function setCommonAreaToggleLabel() {
                    toggleCommonAreaBtn.textContent = commonAreaExpanded ? '\u25C0' : '\u25B6';
                    toggleCommonAreaBtn.title = commonAreaExpanded ? 'Minimize common area (hide patterns)' : 'Expand common area (show stone patterns)';
                    commonAreaContainer.classList.toggle('common-area-expanded', commonAreaExpanded);
                    commonAreaContainer.dataset.expanded = commonAreaExpanded ? 'true' : 'false';
                }
                toggleCommonAreaBtn.addEventListener('click', () => {
                    commonAreaExpanded = !commonAreaExpanded;
                    setCommonAreaToggleLabel();
                    updateCommonAreaUI();
                });
                setCommonAreaToggleLabel();
            }

            // Opponent active scrolls: show/hide stone patterns (same idea as common area popout)
            let opponentPatternsExpanded = false;
            const toggleOpponentPatternsBtn = document.getElementById('toggle-opponent-patterns');
            const rightPanel = document.getElementById('right-panel');
            if (toggleOpponentPatternsBtn && rightPanel) {
                function setOpponentPatternsToggleLabel() {
                    toggleOpponentPatternsBtn.textContent = opponentPatternsExpanded ? '\u25C0' : '\u25B6';
                    toggleOpponentPatternsBtn.title = opponentPatternsExpanded ? 'Hide opponent scroll patterns' : 'Show opponent active scroll patterns';
                    rightPanel.dataset.opponentPatternsExpanded = opponentPatternsExpanded ? 'true' : 'false';
                }
                toggleOpponentPatternsBtn.addEventListener('click', () => {
                    opponentPatternsExpanded = !opponentPatternsExpanded;
                    setOpponentPatternsToggleLabel();
                    updateOpponentPanel();
                });
                setOpponentPatternsToggleLabel();
            }

            // Initial HUD update
            updateHUD();
        }

        // Initialize scroll deck UI with right-click handlers
        function initializeScrollDeckUI() {
            const deckCards = document.querySelectorAll('.scroll-deck-card');
            deckCards.forEach(card => {
                const element = card.dataset.element;
                if (element) {
                    // Right-click to browse deck (gated by console flag)
                    card.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        if (typeof window !== 'undefined' && window.SHOW_SCROLL_DECK_BROWSER) {
                            showScrollDeckBrowser(element);
                        } else {
                            updateStatus('Scroll deck browser is disabled. Use showScrollDeckBrowserUI() to enable.');
                        }
                    });

                    // Left-click also opens browser for convenience (gated)
                    card.addEventListener('click', (e) => {
                        if (typeof window !== 'undefined' && window.SHOW_SCROLL_DECK_BROWSER) {
                            showScrollDeckBrowser(element);
                        } else {
                            updateStatus('Scroll deck browser is disabled. Use showScrollDeckBrowserUI() to enable.');
                        }
                    });
                }
            });

            // Update deck counts initially
            updateScrollDeckUI();
        }

        // Update scroll deck UI to show current deck counts and common area
        function updateScrollDeckUI() {
            if (!spellSystem) return;

            const elements = ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'];
            elements.forEach(element => {
                const countEl = document.getElementById(`${element}-deck-count`);
                const cardEl = document.getElementById(`${element}-scroll-deck`);
                if (countEl && spellSystem.scrollDecks) {
                    const count = spellSystem.scrollDecks[element]?.length || 0;
                    countEl.textContent = count;

                    // Add empty class if deck is empty
                    if (cardEl) {
                        cardEl.classList.toggle('empty', count === 0);
                    }
                }
            });

            // Update common area display
            updateCommonAreaUI();
        }

        // Update common area UI
        function updateCommonAreaUI() {
            if (!spellSystem) return;

            const container = document.getElementById('common-area-container');
            if (!container) return;
            if (container.dataset.expanded === undefined) container.dataset.expanded = 'false';

            const commonScrolls = spellSystem.getCommonAreaScrolls();

            if (commonScrolls.length === 0) {
                container.innerHTML = '<div class="common-area-empty">No scrolls in common area</div>';
                return;
            }

            container.innerHTML = '';
            commonScrolls.forEach(scrollName => {
                const scrollInfo = spellSystem.patterns?.[scrollName] || SCROLL_DEFINITIONS?.[scrollName];
                if (!scrollInfo) return;

                const element = spellSystem.getScrollElement(scrollName);
                const scrollEl = document.createElement('div');
                scrollEl.className = `common-area-scroll ${element}`;
                scrollEl.title = scrollInfo.description || '';

                const nameEl = document.createElement('div');
                nameEl.className = 'common-area-scroll-name';
                nameEl.textContent = scrollInfo.name || scrollName;
                scrollEl.appendChild(nameEl);

                // Stone formation / pattern display only when common area is expanded (popout mode)
                const isExpanded = container.dataset.expanded === 'true';
                if (isExpanded && scrollInfo.patterns && typeof spellSystem.createPatternVisual === 'function') {
                    const patternVisual = spellSystem.createPatternVisual(scrollInfo, element);
                    patternVisual.classList?.add?.('common-area-pattern');
                    patternVisual.style.marginTop = '6px';
                    patternVisual.style.padding = '8px';
                    if (patternVisual.style) patternVisual.style.maxWidth = '100%';
                    scrollEl.appendChild(patternVisual);
                }

                // Click to view details or take from common area
                scrollEl.addEventListener('click', () => {
                    showCommonAreaScrollDetails(scrollName, scrollInfo, element);
                });

                container.appendChild(scrollEl);
            });
        }

        // Show details for a common area scroll
        function showCommonAreaScrollDetails(scrollName, scrollInfo, element) {
            const modal = document.createElement('div');
            modal.className = 'scroll-browse-modal';
            modal.innerHTML = `
                <div class="scroll-browse-content">
                    <div class="scroll-browse-header">
                        <h3>${scrollInfo.name || scrollName}</h3>
                        <button class="scroll-browse-close">&times;</button>
                    </div>
                    <div style="padding: 16px;">
                        <div style="color: var(--text-secondary); margin-bottom: 8px;">
                            <strong>Element:</strong> ${element.charAt(0).toUpperCase() + element.slice(1)}
                        </div>
                        <div style="color: var(--text-secondary); margin-bottom: 8px;">
                            <strong>Level:</strong> ${scrollInfo.level || 'N/A'}
                        </div>
                        <div style="color: var(--text-primary); line-height: 1.5;">
                            ${scrollInfo.description || 'No description available.'}
                        </div>
                        <div id="common-area-detail-pattern" style="margin-top: 12px;"></div>
                    </div>
                    <div class="scroll-browse-footer">
                        <button class="btn-close">Close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Add stone formation / pattern display (match other scrolls)
            const patternContainer = modal.querySelector('#common-area-detail-pattern');
            if (patternContainer && scrollInfo.patterns && typeof spellSystem.createPatternVisual === 'function') {
                const patternVisual = spellSystem.createPatternVisual(scrollInfo, element);
                patternContainer.appendChild(patternVisual);
            }

            // Close handlers
            modal.querySelector('.scroll-browse-close').addEventListener('click', () => modal.remove());
            modal.querySelector('.btn-close').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        }

        // Show scroll deck browser modal
        function showScrollDeckBrowser(element) {
            if (!spellSystem || !spellSystem.scrollDecks) return;

            const deck = spellSystem.scrollDecks[element];
            if (!deck || deck.length === 0) {
                updateStatus(`The ${element} scroll deck is empty!`);
                return;
            }

            const modal = document.createElement('div');
            modal.className = 'scroll-browse-modal';
            modal.innerHTML = `
                <div class="scroll-browse-content">
                    <div class="scroll-browse-header">
                        <h3>${element.charAt(0).toUpperCase() + element.slice(1)} Scroll Deck (${deck.length})</h3>
                        <button class="scroll-browse-close">&times;</button>
                    </div>
                    <div class="scroll-browse-list" id="scroll-browse-list">
                        <!-- Scrolls will be added here -->
                    </div>
                    <div class="scroll-browse-footer">
                        <button class="btn-shuffle">📜 Shuffle Deck</button>
                        <button class="btn-close">Close</button>
                    </div>
                </div>
            `;

            const listEl = modal.querySelector('#scroll-browse-list');

            // Add each scroll in the deck
            deck.forEach((scrollName, index) => {
                const scrollInfo = spellSystem.patterns?.[scrollName] || SCROLL_DEFINITIONS?.[scrollName];
                if (!scrollInfo) return;

                const item = document.createElement('div');
                item.className = 'scroll-browse-item';
                item.innerHTML = `
                    <div class="scroll-name">${scrollInfo.name || scrollName}</div>
                    <div class="scroll-desc">${scrollInfo.description || 'No description'}</div>
                    <div class="scroll-level">Level ${scrollInfo.level || '?'} • Position ${index + 1} in deck</div>
                `;

                // Click to draw this scroll
                item.addEventListener('click', () => {
                    drawScrollFromDeck(element, scrollName, index);
                    modal.remove();
                });

                listEl.appendChild(item);
            });

            document.body.appendChild(modal);

            // Close handlers
            modal.querySelector('.scroll-browse-close').addEventListener('click', () => modal.remove());
            modal.querySelector('.btn-close').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

            // Shuffle handler
            modal.querySelector('.btn-shuffle').addEventListener('click', () => {
                if (spellSystem.shuffleDeck && spellSystem.scrollDecks[element]) {
                    spellSystem.shuffleDeck(spellSystem.scrollDecks[element]);
                    updateStatus(`📜 ${element.charAt(0).toUpperCase() + element.slice(1)} scroll deck shuffled!`);
                    modal.remove();
                    // Reopen to show new order
                    showScrollDeckBrowser(element);
                }
            });
        }

        // Draw a specific scroll from a deck (for testing)
        function drawScrollFromDeck(element, scrollName, index) {
            if (!spellSystem || !spellSystem.scrollDecks) return;

            const deck = spellSystem.scrollDecks[element];
            if (!deck || index >= deck.length) return;

            // Remove scroll from deck at specified index
            deck.splice(index, 1);

            // Add to player's hand
            const scrolls = spellSystem.getPlayerScrolls(false);

            // Check hand limit
            if (scrolls.hand.size >= 4) {
                updateStatus(`❌ Your hand is full (4 scrolls max)! Discard or use a scroll first.`);
                // Put scroll back
                deck.splice(index, 0, scrollName);
                return;
            }

            scrolls.hand.add(scrollName);
            spellSystem.updateScrollCount();
            updateScrollDeckUI();
            updateHUD();

            const scrollInfo = spellSystem.patterns?.[scrollName] || SCROLL_DEFINITIONS?.[scrollName];
            updateStatus(`📜 Drew ${scrollInfo?.name || scrollName} from the ${element} deck!`);

            // Shuffle the deck after drawing (as requested)
            if (spellSystem.shuffleDeck) {
                spellSystem.shuffleDeck(deck);
                console.log(`📜 ${element} deck shuffled after drawing`);
            }

            // Broadcast in multiplayer (for testing only - in real game this wouldn't be allowed)
            if (isMultiplayer) {
                broadcastGameAction('scroll-drawn-test', {
                    element: element,
                    scrollName: scrollName,
                    playerIndex: activePlayerIndex
                });
            }
        }

        function updateHUD() {
            // Guard: Don't update if game variables aren't initialized yet
            try {
                if (typeof currentAP === 'undefined' || typeof voidAP === 'undefined') {
                    return;
                }
            } catch (e) {
                return; // Variables not ready yet
            }

            // Update AP
            const hudApValue = document.getElementById('hud-ap-value');
            if (hudApValue) hudApValue.textContent = currentAP;

            // Update Void AP display
            const hudVoidAp = document.getElementById('hud-void-ap');
            if (hudVoidAp) {
                hudVoidAp.textContent = voidAP > 0 ? `+${voidAP}` : '';
            }

            // Update scroll counts - only if spellSystem is fully initialized
            try {
                if (typeof spellSystem !== 'undefined' && spellSystem && spellSystem.handScrolls) {
                    const hudHandCount = document.getElementById('hud-hand-count');
                    const hudActiveCount = document.getElementById('hud-active-count');
                    const hudCommonCount = document.getElementById('hud-common-count');

                    if (hudHandCount) hudHandCount.textContent = spellSystem.handScrolls.size || 0;
                    if (hudActiveCount) hudActiveCount.textContent = spellSystem.activeScrolls ? spellSystem.activeScrolls.size : 0;
                    if (hudCommonCount && spellSystem.getCommonAreaScrolls) hudCommonCount.textContent = spellSystem.getCommonAreaScrolls().length;
                }
            } catch (e) {
                // spellSystem not ready yet
            }

            // Update player name/turn indicator
            try {
                const hudPlayerName = document.getElementById('hud-player-name');
                const hudPlayerDot = document.getElementById('hud-player-dot');
                if (hudPlayerName && typeof activePlayerIndex !== 'undefined') {
                    if (typeof isMultiplayer !== 'undefined' && isMultiplayer) {
                        const isMyTurnNow = myPlayerIndex === activePlayerIndex;
                        hudPlayerName.textContent = isMyTurnNow ? 'Your Turn' : `Player ${activePlayerIndex + 1}'s Turn`;
                    } else {
                        hudPlayerName.textContent = `Player ${activePlayerIndex + 1}`;
                    }
                }

                // Update player dot color
                if (hudPlayerDot && typeof playerColor !== 'undefined' && playerColor) {
                    const colorMap = {
                        'purple': '#9458f4',
                        'yellow': '#ffce00',
                        'red': '#ed1b43',
                        'blue': '#5894f4',
                        'green': '#69d83a'
                    };
                    hudPlayerDot.style.background = colorMap[playerColor] || '#d9b08c';
                }
            } catch (e) {
                // Variables not ready yet
            }
        }

        function setupStoneDragFromCard(card, element) {
            card.addEventListener('mousedown', (e) => {
                if (stoneCounts[element] <= 0) {
                    updateStatus(`No ${element} stones available!`);
                    return;
                }
                // Start dragging a new stone from the deck
                startStoneDragFromDeck(e, element);
            });
        }

        function startStoneDragFromDeck(e, type) {
            // Check if it's this player's turn and no pending cascade
            if (!canTakeAction()) {
                notYourTurn();
                return;
            }

            if (stoneCounts[type] <= 0) {
                updateStatus(`No ${type} stones available!`);
                return;
            }

            e.preventDefault();
            isDraggingFromDeck = true;
            isDraggingStone = true;
            draggedStoneId = null;
            draggedStoneType = type;

            // Create ghost stone at cursor position
            const rect = boardSvg.getBoundingClientRect();
            const coords = getEventCoords(e);
            const screenX = coords.x - rect.left;
            const screenY = coords.y - rect.top;
            const world = screenToWorld(screenX, screenY);

            ghostStone = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            ghostStone.setAttribute('class', 'stone stone-ghost');
            ghostStone.setAttribute('transform', `translate(${world.x}, ${world.y})`);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', STONE_SIZE);
            circle.setAttribute('class', 'stone-piece');
            circle.setAttribute('fill', STONE_TYPES[type].color);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', 0);
            text.setAttribute('y', 0);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', '#fff');
            text.setAttribute('font-size', '14');
            text.setAttribute('font-weight', 'bold');
            text.textContent = STONE_TYPES[type].symbol;

            ghostStone.appendChild(circle);
            ghostStone.appendChild(text);
            viewport.appendChild(ghostStone);
        }

        function updateSourceCount(type) {
            document.getElementById(type + '-source').textContent = 'Source: ' + sourcePool[type] + '/' + sourcePoolCapacity[type];
        }

        function returnStoneToPool(type) {
            // Return a stone to the SOURCE pool (not player pool)
            // This happens when stones are removed from board or destroyed
            const maxStones = sourcePoolCapacity[type];
            if (sourcePool[type] < maxStones) {
                sourcePool[type]++;
                updateSourceCount(type);
                console.log(`♻️ Returned ${type} stone to source pool (${sourcePool[type]}/${maxStones})`);
            } else {
                console.log(`⚠️ Cannot return ${type} stone to source pool: already at maximum (${maxStones})`);
            }
        }

        let lastStatusMessage = null;
        function updateStatus(msg) {
            if (msg === lastStatusMessage) return;
            lastStatusMessage = msg;
            document.getElementById('status').textContent = msg;
        }

        let endTurnPromptShown = false;
        function resetEndTurnPrompt() {
            endTurnPromptShown = false;
        }

        window.showEndTurnPrompt = function () {
            if (endTurnPromptShown) return;
            const endTurnBtn = document.getElementById('end-turn');
            if (!endTurnBtn || endTurnBtn.disabled) return;

            endTurnPromptShown = true;

            const existing = document.getElementById('end-turn-empty-ap-modal');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'end-turn-empty-ap-modal';
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0', left: '0', right: '0', bottom: '0',
                backgroundColor: 'rgba(0,0,0,0.6)',
                zIndex: '3000',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            });

            const modal = document.createElement('div');
            Object.assign(modal.style, {
                backgroundColor: '#1a1a2e',
                border: '2px solid #f39c12',
                borderRadius: '10px',
                padding: '20px',
                color: 'white',
                minWidth: '260px',
                maxWidth: '360px',
                textAlign: 'center'
            });

            const title = document.createElement('h3');
            title.textContent = 'Out of AP';
            title.style.marginTop = '0';
            modal.appendChild(title);

            const message = document.createElement('div');
            message.textContent = "You're out of AP. Do you want to end your turn?";
            message.style.margin = '10px 0 16px';
            modal.appendChild(message);

            const btnRow = document.createElement('div');
            btnRow.style.display = 'flex';
            btnRow.style.gap = '8px';
            btnRow.style.justifyContent = 'center';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Keep Playing';
            Object.assign(cancelBtn.style, {
                padding: '8px 12px',
                backgroundColor: '#2d2d44',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
            });
            cancelBtn.onclick = () => {
                overlay.remove();
            };

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = 'End Turn';
            Object.assign(confirmBtn.style, {
                padding: '8px 12px',
                backgroundColor: '#e67e22',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
            });
            confirmBtn.onclick = () => {
                overlay.remove();
                endTurnBtn.click();
            };

            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(confirmBtn);
            modal.appendChild(btnRow);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        };

        // Update the opponent panel with current game state
        function updateOpponentPanel() {
            const panel = document.getElementById('opponent-panel');
            const rightPanelEl = document.getElementById('right-panel');
            const cardsContainer = document.getElementById('opponent-cards');
            const newCardsContainer = document.getElementById('new-opponent-cards');
            if (rightPanelEl && rightPanelEl.dataset.opponentPatternsExpanded === undefined) {
                rightPanelEl.dataset.opponentPatternsExpanded = 'false';
            }

            // Only show in multiplayer with more than 1 player
            if (!isMultiplayer || totalPlayers <= 1) {
                if (panel) panel.classList.remove('visible');
                return;
            }

            if (panel) {
                panel.classList.add('visible');
            }
            if (cardsContainer) cardsContainer.innerHTML = '';
            if (newCardsContainer) newCardsContainer.innerHTML = '';

            // Get all players except myself
            for (let i = 0; i < totalPlayers; i++) {
                if (i === myPlayerIndex) continue; // Skip myself

                const playerData = allPlayersData.find(p => p.player_index === i);
                const playerName = getPlayerColorName(i);
                const playerColor = playerData ? PLAYER_COLORS[playerData.color] : '#666';
                const isActiveTurn = (i === activePlayerIndex);

                // Get player resources
                const pool = playerPools[i] || { earth: 0, water: 0, fire: 0, wind: 0, void: 0 };
                const ap = playerAPs[i] || { currentAP: 5, voidAP: 0 };
                const scrollData = spellSystem.playerScrolls[i] || { hand: new Set(), active: new Set() };

                const card = document.createElement('div');
                card.className = 'opponent-card' + (isActiveTurn ? ' active-turn' : '');
                card.style.borderLeftColor = playerColor;

                // Header with name and AP
                const header = document.createElement('div');
                header.className = 'opponent-header';
                header.innerHTML = `
                    <span class="opponent-name" style="color: ${playerColor};">${playerName}</span>
                    <span class="opponent-ap">AP: ${ap.currentAP}${ap.voidAP > 0 ? ` +${ap.voidAP}✺` : ''}</span>
                `;
                card.appendChild(header);

                // Stones
                const stonesDiv = document.createElement('div');
                stonesDiv.className = 'opponent-stones';
                const stoneElements = ['earth', 'water', 'fire', 'wind', 'void'];
                stoneElements.forEach(element => {
                    if (pool[element] > 0) {
                        const stoneSpan = document.createElement('span');
                        stoneSpan.className = 'opponent-stone';
                        stoneSpan.style.color = STONE_TYPES[element].color;
                        stoneSpan.textContent = `${STONE_TYPES[element].symbol} ${pool[element]}`;
                        stonesDiv.appendChild(stoneSpan);
                    }
                });
                if (stonesDiv.children.length === 0) {
                    stonesDiv.innerHTML = '<span style="color: #666; font-size: 11px;">No stones</span>';
                }
                card.appendChild(stonesDiv);

                // Scrolls summary (hand count only - hand contents are private)
                const handSize = scrollData.hand ? scrollData.hand.size : 0;
                const activeSize = scrollData.active ? scrollData.active.size : 0;

                const scrollsSummary = document.createElement('div');
                scrollsSummary.className = 'opponent-scrolls-summary';
                scrollsSummary.textContent = `📜 Hand: ${handSize} scroll${handSize !== 1 ? 's' : ''} (hidden)`;
                card.appendChild(scrollsSummary);

                // Active scrolls (visible to opponents)
                if (activeSize > 0) {
                    const activeScrollsDiv = document.createElement('div');
                    activeScrollsDiv.className = 'opponent-active-scrolls';

                    const activeTitle = document.createElement('div');
                    activeTitle.className = 'opponent-active-scrolls-title';
                    activeTitle.textContent = `⚡ Active Area (${activeSize}):`;
                    activeScrollsDiv.appendChild(activeTitle);

                    scrollData.active.forEach(scrollName => {
                        const pattern = spellSystem.patterns[scrollName];
                        const element = spellSystem.getScrollElement(scrollName);
                        const elementColor = element === 'catacomb' ? '#9b59b6' : STONE_TYPES[element]?.color || '#666';
                        const elementSymbol = element === 'catacomb' ? '🔅' : STONE_TYPES[element]?.symbol || '?';

                        const scrollCard = document.createElement('div');
                        scrollCard.className = 'opponent-scroll-card';
                        scrollCard.innerHTML = `
                            <div class="opponent-scroll-name">${pattern ? pattern.name : scrollName}</div>
                            <div class="opponent-scroll-element" style="color: ${elementColor};">
                                ${elementSymbol} ${element ? element.charAt(0).toUpperCase() + element.slice(1) : 'Unknown'}
                            </div>
                            <div class="opponent-scroll-pattern-wrap"></div>
                        `;
                        const patternWrap = scrollCard.querySelector('.opponent-scroll-pattern-wrap');
                        const showPatterns = (document.getElementById('right-panel')?.dataset.opponentPatternsExpanded === 'true');
                        if (showPatterns && pattern?.patterns && typeof spellSystem.createPatternVisual === 'function' && patternWrap) {
                            const patternVisual = spellSystem.createPatternVisual(pattern, element);
                            patternVisual.classList?.add?.('opponent-scroll-pattern');
                            patternWrap.appendChild(patternVisual);
                        }
                        activeScrollsDiv.appendChild(scrollCard);
                    });

                    card.appendChild(activeScrollsDiv);
                }

                if (cardsContainer) cardsContainer.appendChild(card);
                // Clone card for new UI
                if (newCardsContainer) newCardsContainer.appendChild(card.cloneNode(true));
            }

            // If no opponents to show
            if (cardsContainer && cardsContainer.children.length === 0) {
                cardsContainer.innerHTML = '<div style="color: #666; font-size: 12px; text-align: center;">Waiting for opponents...</div>';
            }
            if (newCardsContainer && newCardsContainer.children.length === 0) {
                newCardsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px;">Waiting for opponents...</div>';
            }

            // Update HUD
            if (typeof updateHUD === 'function') updateHUD();
        }

        function clearBoard(skipConfirm = false) {
            if (!skipConfirm && !confirm('Clear all tiles and stones from the board?')) {
                return;
            }
            
            placedTiles.forEach(tile => tile.element.remove());
            placedStones.forEach(stone => stone.element.remove());
            
            // Clear all player pawns
            playerPositions.forEach(player => {
                if (player && player.element) player.element.remove();
            });
            
            placedTiles = [];
            placedStones = [];
            playerPositions = [];
            activePlayerIndex = 0;
            updateStatus('Board cleared');
        }

        // Event Handlers - Tile Deck
        deckTileSvg.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                e.preventDefault();
                isRotatingTile = true;
                rotateTileStartX = e.clientX;
                rotateTileStartRotation = currentRotation;
                return;
            }

            isDraggingTile = true;
            draggedTileId = null;
            draggedTileRotation = currentRotation;
            draggedTileFlipped = currentFlipped;
            draggedTileShrineType = null; // Draw from deck
            const rect = boardSvg.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const world = screenToWorld(screenX, screenY);

            ghostTile = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            ghostTile.setAttribute('class', 'ghost-tile');
            ghostTile.setAttribute('transform', `translate(${world.x}, ${world.y})`);
            const tile = createTileGroup(TILE_SIZE, currentRotation, currentFlipped);
            ghostTile.appendChild(tile);
            viewport.appendChild(ghostTile);
        });

        deckTileSvg.addEventListener('contextmenu', (e) => e.preventDefault());

        // Event Handlers - Stone Decks
        ['earth', 'water', 'fire', 'wind', 'void'].forEach(type => {
            const deckElement = document.getElementById(type + '-deck');

            // Mouse handler
            deckElement.addEventListener('mousedown', (e) => {
                if (stoneCounts[type] <= 0) return;

                isDraggingStone = true;
                draggedStoneId = null;
                draggedStoneType = type;

                const rect = boardSvg.getBoundingClientRect();
                const coords = getEventCoords(e);
                const screenX = coords.x - rect.left;
                const screenY = coords.y - rect.top;
                const world = screenToWorld(screenX, screenY);

                ghostStone = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                ghostStone.setAttribute('class', 'stone stone-ghost');
                ghostStone.setAttribute('transform', `translate(${world.x}, ${world.y})`);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', 0);
                circle.setAttribute('cy', 0);
                circle.setAttribute('r', STONE_SIZE);
                circle.setAttribute('class', 'stone-piece');
                circle.setAttribute('fill', STONE_TYPES[type].color);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', 0);
                text.setAttribute('y', 0);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('fill', '#fff');
                text.setAttribute('font-size', '14');
                text.setAttribute('font-weight', 'bold');
                text.textContent = STONE_TYPES[type].symbol;

                ghostStone.appendChild(circle);
                ghostStone.appendChild(text);
                viewport.appendChild(ghostStone);
            });

            // Touch handler
            deckElement.addEventListener('touchstart', (e) => {
                if (stoneCounts[type] <= 0) return;
                e.preventDefault();

                isDraggingStone = true;
                draggedStoneId = null;
                draggedStoneType = type;

                const rect = boardSvg.getBoundingClientRect();
                const coords = getEventCoords(e);
                const screenX = coords.x - rect.left;
                const screenY = coords.y - rect.top;
                const world = screenToWorld(screenX, screenY);

                ghostStone = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                ghostStone.setAttribute('class', 'stone stone-ghost');
                ghostStone.setAttribute('transform', `translate(${world.x}, ${world.y})`);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', 0);
                circle.setAttribute('cy', 0);
                circle.setAttribute('r', STONE_SIZE);
                circle.setAttribute('class', 'stone-piece');
                circle.setAttribute('fill', STONE_TYPES[type].color);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', 0);
                text.setAttribute('y', 0);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('fill', '#fff');
                text.setAttribute('font-size', '14');
                text.setAttribute('font-weight', 'bold');
                text.textContent = STONE_TYPES[type].symbol;

                ghostStone.appendChild(circle);
                ghostStone.appendChild(text);
                viewport.appendChild(ghostStone);
            }, { passive: false });
        });

        // Event Handlers - Board (throttled to animation frames)
        let pendingBoardMove = false;
        let lastBoardMove = null;
        boardSvg.addEventListener('mousemove', (e) => {
            lastBoardMove = { clientX: e.clientX, clientY: e.clientY };
            if (pendingBoardMove) return;
            pendingBoardMove = true;
            requestAnimationFrame(() => {
                pendingBoardMove = false;
                if (!lastBoardMove) return;

                const rect = boardSvg.getBoundingClientRect();
                const screenX = lastBoardMove.clientX - rect.left;
                const screenY = lastBoardMove.clientY - rect.top;
                const world = screenToWorld(screenX, screenY);

                if (isDraggingTile && ghostTile) {
                    const isPlayerTile = (draggedTileShrineType === 'player');
                    const snapResult = findNearestSnapPoint(world.x, world.y, isPlayerTile);
                    ghostTile.setAttribute('transform', `translate(${snapResult.x}, ${snapResult.y})`);

                    if (snapResult.snapped) {
                        snapIndicator.setAttribute('cx', snapResult.x);
                        snapIndicator.setAttribute('cy', snapResult.y);
                        snapIndicator.classList.add('active');
                    } else {
                        snapIndicator.classList.remove('active');
                    }
                } else if (isDraggingStone && ghostStone) {
                    const stonePos = findValidStonePosition(world.x, world.y);
                    ghostStone.setAttribute('transform', `translate(${stonePos.x}, ${stonePos.y})`);

                    if (stonePos.valid) {
                        snapIndicator.setAttribute('cx', stonePos.x);
                        snapIndicator.setAttribute('cy', stonePos.y);
                        snapIndicator.classList.add('active');
                    } else {
                        snapIndicator.classList.remove('active');
                    }
                } else if (isDraggingPlayer && ghostPlayer) {
                    const tf = (typeof window !== 'undefined') ? window.takeFlightState : null;
                    const playerPos = findNearestHexPosition(world.x, world.y);

                    if (tf && tf.active) {
                        if (playerPos.valid) {
                            ghostPlayer.setAttribute('transform', `translate(${playerPos.x}, ${playerPos.y})`);
                            snapIndicator.setAttribute('cx', playerPos.x);
                            snapIndicator.setAttribute('cy', playerPos.y);
                            snapIndicator.classList.add('active');
                        } else {
                            snapIndicator.classList.remove('active');
                        }
                        tf.hoverPos = playerPos;
                        return;
                    }

                    // Prevent the ghost and path preview from moving "through" other players.
                    // If the nearest hex is occupied, clamp the ghost to the last valid path node.
                    if (playerPos.valid && isHexOccupiedByOtherPlayer(playerPos.x, playerPos.y)) {
                        const last = (playerPath && playerPath.length) ? playerPath[playerPath.length - 1] : playerPosition;
                        ghostPlayer.setAttribute('transform', `translate(${last.x}, ${last.y})`);
                        snapIndicator.classList.remove('active');
                        updateStatus('❌ Blocked by another player');
                        return;
                    }

                    ghostPlayer.setAttribute('transform', `translate(${playerPos.x}, ${playerPos.y})`);

                    if (playerPos.valid) {
                        updatePlayerPath(playerPos.x, playerPos.y);

                        const totalCost = calculatePathCost();
                        const moveCheck = canPlayerMoveToHex(playerPos.x, playerPos.y);

                        if (moveCheck.canMove && totalCost <= getTotalAP()) {
                            snapIndicator.setAttribute('cx', playerPos.x);
                            snapIndicator.setAttribute('cy', playerPos.y);
                            snapIndicator.classList.add('active');
                        } else {
                            snapIndicator.classList.remove('active');
                        }

                        // Update status with path cost
                        updateStatus(`Path cost: ${totalCost} AP (${getTotalAP() - totalCost} remaining)`);
                    } else {
                        snapIndicator.classList.remove('active');
                    }
                }
            });
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) leftButtonDown = false;
            if (e.button === 2) rightButtonDown = false;

            if (isDraggingTile && ghostTile) {
                const rect = boardSvg.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const world = screenToWorld(screenX, screenY);

                const isPlayerTile = (draggedTileShrineType === 'player');
                const snapResult = findNearestSnapPoint(world.x, world.y, isPlayerTile);
                if (snapResult.snapped) {
                    if (window.shouldDebugLog ? window.shouldDebugLog('placeTile', 500) : true) {
                        console.log(`📍 Placing tile: rotation=${draggedTileRotation}, flipped=${draggedTileFlipped}, shrine=${draggedTileShrineType}`);
                    }
                    const tileId = placeTile(snapResult.x, snapResult.y, draggedTileRotation, draggedTileFlipped, draggedTileShrineType, false, false, draggedTileId);
                    console.log(`   Tile placed with ID: ${tileId}`);

                    // If this was a player tile from the deck and it was successfully placed
                    if (draggedTileShrineType === 'player' && draggedTileId === null && tileId !== null) {
                        playerTilesAvailable--;
                        const countEl = document.getElementById('new-player-tile-count') || document.getElementById('player-tile-count');
                        if (countEl) countEl.textContent = playerTilesAvailable;

                        // Remove the first available player tile from the deck visually
                        if (playerTileElements.length > 0) {
                            const tileToRemove = playerTileElements.shift();
                            tileToRemove.remove();
                        }

                        // Broadcast player tile placement in multiplayer
                        if (isMultiplayer) {
                            broadcastGameAction('player-tile-place', {
                                x: snapResult.x,
                                y: snapResult.y,
                                playerIndex: myPlayerIndex,
                                color: playerColor
                            });
                        }
                    }

                    // TELEKINESIS: track moves
                    const tkState = window.telekinesisState;
                    if (tkState && tkState.active && draggedTileId !== null && draggedTileOriginalPos) {
                        // Broadcast in multiplayer
                        if (isMultiplayer && typeof broadcastGameAction === 'function') {
                            broadcastGameAction('telekinesis-move', {
                                tileId: draggedTileId,
                                newPos: { x: snapResult.x, y: snapResult.y },
                                oldPos: { x: draggedTileOriginalPos.x, y: draggedTileOriginalPos.y },
                                movedPlayers: []
                            });
                        }

                        tkState.movesLeft--;
                        tkState.movedTiles.push(draggedTileId);
                        console.log(`🔮 Telekinesis: ${tkState.maxMoves - tkState.movesLeft}/${tkState.maxMoves} moves`);

                        // Update Done button if present
                        const doneBtn = document.getElementById('telekinesis-done-btn');
                        if (doneBtn) {
                            const movesDone = tkState.maxMoves - tkState.movesLeft;
                            doneBtn.textContent = `Done (${movesDone}/${tkState.maxMoves})`;
                        }

                        updateStatus(`Telekinesis: tile moved! (${tkState.maxMoves - tkState.movesLeft}/${tkState.maxMoves})`);

                        // Refresh catacomb indicators
                        if (typeof updateCatacombIndicators === 'function') updateCatacombIndicators();

                        if (tkState.movesLeft <= 0) {
                            // All moves used — finish telekinesis
                            if (typeof window.finishTelekinesis === 'function') {
                                window.finishTelekinesis();
                            }
                        }
                    }
                } else if (draggedTileId !== null && draggedTileOriginalPos) {
                    // If this was a placed tile that couldn't be re-placed, restore it to its original position
                    const tkActive = window.telekinesisState && window.telekinesisState.active;
                    updateStatus(tkActive
                        ? 'Invalid placement! Tiles must touch at least 2 other tiles. Tile snapped back.'
                        : 'Invalid placement! Tile snapped back to original position.');
                    placeTile(draggedTileOriginalPos.x, draggedTileOriginalPos.y, draggedTileRotation, draggedTileFlipped, draggedTileShrineType, false, false, draggedTileId);
                } else if (isPlayerTile) {
                    // Player tile couldn't be placed - show why
                    updateStatus('⚠️ Player tiles must touch at least 2 unrevealed tiles!');
                }

                ghostTile.remove();
                ghostTile = null;
                isDraggingTile = false;
                draggedTileId = null;
                draggedTileOriginalPos = null;
                snapIndicator.classList.remove('active');
            } else if (isDraggingStone && ghostStone) {
                const rect = boardSvg.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const world = screenToWorld(screenX, screenY);

                const stonePos = findValidStonePosition(world.x, world.y);
                if (stonePos.valid) {
                    if (draggedStoneId === null) {
                        placeStone(stonePos.x, stonePos.y, draggedStoneType);
                        console.log(`📤 Placing stone from deck: type=${draggedStoneType}, before=${stoneCounts[draggedStoneType]}`);
                        stoneCounts[draggedStoneType]--;
                        console.log(`📤 After decrement: ${draggedStoneType}=${stoneCounts[draggedStoneType]}, playerPool.${draggedStoneType}=${playerPool[draggedStoneType]}`);
                        updateStoneCount(draggedStoneType);

                        // Sync resources after placing stone
                        syncPlayerState();
                        updateStatus('Placed ' + draggedStoneType + ' stone');
                    } else {
                        placeMovedStone(stonePos.x, stonePos.y, draggedStoneType, draggedStoneId);
                        if (isMultiplayer) {
                            broadcastGameAction('stone-move', {
                                stoneId: draggedStoneId,
                                x: stonePos.x,
                                y: stonePos.y,
                                stoneType: draggedStoneType
                            });
                        }
                        updateStatus('Moved ' + draggedStoneType + ' stone');
                    }
                } else {
                    if (draggedStoneId !== null) {
                        // Was a placed stone, couldn't place back
                        if (draggedStoneOriginalPos) {
                            placeMovedStone(draggedStoneOriginalPos.x, draggedStoneOriginalPos.y, draggedStoneType, draggedStoneId);
                            updateStatus('Invalid placement! Stone returned to original spot.');
                        } else {
                            returnStoneToPool(draggedStoneType);
                        }
                    }
                }

                ghostStone.remove();
                ghostStone = null;
                isDraggingStone = false;
                draggedStoneId = null;
                draggedStoneType = null;
                draggedStoneOriginalPos = null;
                snapIndicator.classList.remove('active');
            } else if (isDraggingPlayer && ghostPlayer) {
                const tf = (typeof window !== 'undefined') ? window.takeFlightState : null;
                const rect = boardSvg.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const world = screenToWorld(screenX, screenY);

                const playerPos = findNearestHexPosition(world.x, world.y);
                const totalCost = calculatePathCost();
                const startPos = playerPath[0];

                if (tf && tf.active) {
                    const targetIndex = tf.targetPlayerIndex;
                    const destPos = playerPos && playerPos.valid ? { x: playerPos.x, y: playerPos.y } : null;
                    const origin = tf.startPos || startPos;

                    const hasStone = destPos && placedStones.some(s => {
                        const dist = Math.sqrt(Math.pow(s.x - destPos.x, 2) + Math.pow(s.y - destPos.y, 2));
                        return dist < 5;
                    });
                    const hasPlayer = destPos && playerPositions.some((p, idx) => {
                        if (!p) return false;
                        if (idx === targetIndex) return false;
                        const dist = Math.sqrt(Math.pow(p.x - destPos.x, 2) + Math.pow(p.y - destPos.y, 2));
                        return dist < 5;
                    });

                    if (!destPos || hasStone || hasPlayer) {
                        if (hasStone) updateStatus('Take Flight: cannot teleport onto a stone.');
                        else if (hasPlayer) updateStatus('Take Flight: another player is in the way.');
                        else updateStatus('Take Flight: invalid destination.');

                        if (origin) {
                            if (targetIndex === activePlayerIndex) {
                                placePlayer(origin.x, origin.y);
                            } else if (typeof movePlayerVisually === 'function') {
                                movePlayerVisually(targetIndex, origin.x, origin.y, 0);
                            }
                        }
                    } else {
                        if (targetIndex === activePlayerIndex) {
                            placePlayer(destPos.x, destPos.y);
                        } else if (typeof movePlayerVisually === 'function') {
                            movePlayerVisually(targetIndex, destPos.x, destPos.y, 0);
                        }

                        if (tf.onComplete) {
                            tf.onComplete(destPos.x, destPos.y);
                        }
                    }

                    ghostPlayer.remove();
                    ghostPlayer = null;
                    if (pathLine) {
                        pathLine.remove();
                        pathLine = null;
                    }
                    // Clean up path labels
                    pathCostLabels.forEach(label => label.remove());
                    pathCostLabels = [];
                    playerPath = [];
                    isDraggingPlayer = false;
                    snapIndicator.classList.remove('active');
                } else if (playerPos.valid && playerPath.length > 1) {

                    const finalPos = playerPath[playerPath.length - 1];
                    const moveCheck = canPlayerMoveToHex(finalPos.x, finalPos.y, true);

                    // Check if there's a stone at the final position that you CAN'T end turn on
                    const stoneAtFinal = placedStones.find(s => {
                        const dist = Math.sqrt(Math.pow(s.x - finalPos.x, 2) + Math.pow(s.y - finalPos.y, 2));
                        return dist < 5;
                    });

                    // Can't end turn on: earth, wind, water, fire
                    // CAN end turn on: void (or empty hex)
                    const cannotEndTurnHere = stoneAtFinal && stoneAtFinal.type !== 'void';

                    if (cannotEndTurnHere) {
                        console.log(`❌ Movement rejected: Cannot end turn on ${stoneAtFinal.type} stone at (${finalPos.x.toFixed(1)}, ${finalPos.y.toFixed(1)})`);
                        placePlayer(startPos.x, startPos.y);
                        updateStatus('Cannot end movement on a ' + stoneAtFinal.type + ' stone!');
                    } else if (moveCheck.canMove && totalCost <= getTotalAP()) {
                        console.log(`✅ Movement successful: ${playerPath.length - 1} hexes, cost ${totalCost} AP`);
                        // Store the last move for undo
                        lastMove = {
                            prevPos: { x: startPos.x, y: startPos.y },
                            newPos: { x: finalPos.x, y: finalPos.y },
                            apCost: totalCost
                        };
                        placePlayer(finalPos.x, finalPos.y);
                        // Update Steam Vents alternation state before spending AP
                        if (typeof commitSteamVentsState === 'function') commitSteamVentsState(playerPath);
                        spendAP(totalCost); // Use void AP first, then regular AP

                        // Broadcast player movement to other players
                        broadcastGameAction('player-move', {
                            playerIndex: activePlayerIndex,
                            x: finalPos.x,
                            y: finalPos.y,
                            apSpent: totalCost
                        });

                        // Check if player stepped on a hidden tile - reveal it!
                        // Use the ACTUAL player position after placement
                        const actualPlayerPos = { x: playerPosition.x, y: playerPosition.y };
                        if (window.shouldDebugLog ? window.shouldDebugLog('playerLanded', 500) : true) {
                            console.log(`📍 Player landed at (${actualPlayerPos.x.toFixed(1)}, ${actualPlayerPos.y.toFixed(1)})`);
                        }
                        console.log(`   finalPos from path: (${finalPos.x.toFixed(1)}, ${finalPos.y.toFixed(1)})`);

                        // Use getAllHexagonPositions which properly handles trapezoids
                        const allHexes = getAllHexagonPositions();
                        
                        // Find the hex position where the player landed
                        let playerHex = null;
                        let minDist = Infinity;
                        allHexes.forEach(hexPos => {
                            const dist = Math.sqrt(Math.pow(hexPos.x - actualPlayerPos.x, 2) + Math.pow(hexPos.y - actualPlayerPos.y, 2));
                            if (dist < minDist) {
                                minDist = dist;
                                playerHex = hexPos;
                            }
                        });

                        if (playerHex && minDist < 5 && playerHex.tiles) {
                            console.log(`   Player is on hex at (${playerHex.x.toFixed(1)}, ${playerHex.y.toFixed(1)}), dist=${minDist.toFixed(2)}`);
                            console.log(`   This hex is contributed to by ${playerHex.tiles.length} tile(s)`);
                            
                            // Find flipped tiles that contribute to this hex position
                            const flippedTiles = playerHex.tiles.filter(t => t.flipped && !t.isPlayerTile);
                            console.log(`   Flipped tiles at this hex:`, flippedTiles.map(t => ({id: t.id, x: t.x, y: t.y, flipped: t.flipped})));

                            if (flippedTiles.length > 0) {
                                // If multiple flipped tiles share this hex, choose the one whose center is closest to player
                                let tileToReveal = flippedTiles[0];
                                if (flippedTiles.length > 1) {
                                    let minTileDist = Infinity;
                                    flippedTiles.forEach(tile => {
                                        const tileDist = Math.sqrt(Math.pow(tile.x - actualPlayerPos.x, 2) + Math.pow(tile.y - actualPlayerPos.y, 2));
                                        console.log(`     Flipped tile id=${tile.id} at (${tile.x.toFixed(1)}, ${tile.y.toFixed(1)}): dist to center=${tileDist.toFixed(1)}`);
                                        if (tileDist < minTileDist) {
                                            minTileDist = tileDist;
                                            tileToReveal = tile;
                                        }
                                    });
                                    console.log(`   Multiple flipped tiles - choosing closest at (${tileToReveal.x.toFixed(1)}, ${tileToReveal.y.toFixed(1)})`);
                                }
                                console.log(`✨ Revealing tile id=${tileToReveal.id} at (${tileToReveal.x.toFixed(1)}, ${tileToReveal.y.toFixed(1)})`);
                                revealTile(tileToReveal.id);
                            } else {
                                console.log(`   No flipped tiles at this hex position`);
                                updateStatus(`Moved ${playerPath.length - 1} hexes (cost: ${totalCost} AP, ${getTotalAP()} AP remaining)`);
                            }
                        } else {
                            console.log(`   ❌ Player not on any valid hex (minDist=${minDist.toFixed(2)})`);
                            updateStatus(`Moved ${playerPath.length - 1} hexes (cost: ${totalCost} AP, ${getTotalAP()} AP remaining)`);
                        }
                    } else if (!moveCheck.canMove) {
                        console.log(`❌ Movement rejected: Path blocked at (${finalPos.x.toFixed(1)}, ${finalPos.y.toFixed(1)})`);
                        placePlayer(startPos.x, startPos.y);
                        updateStatus('Cannot move there!');
                    } else {
                        console.log(`❌ Movement rejected: Insufficient AP (need ${totalCost}, have ${getTotalAP()})`);
                        placePlayer(startPos.x, startPos.y);
                        updateStatus(`Not enough AP! (need ${totalCost}, have ${getTotalAP()})`);
                    }
                } else {
                    placePlayer(startPos.x, startPos.y);
                }

                ghostPlayer.remove();
                ghostPlayer = null;
                if (pathLine) {
                    pathLine.remove();
                    pathLine = null;
                }
                // Clean up path labels
                pathCostLabels.forEach(label => label.remove());
                pathCostLabels = [];
                playerPath = [];
                isDraggingPlayer = false;
                snapIndicator.classList.remove('active');
            }

            if (isPanning) {
                isPanning = false;
                boardSvg.style.cursor = 'grab';
            }
            if (isRotatingBoard) {
                isRotatingBoard = false;
                boardSvg.style.cursor = 'grab';
            }
            if (isRotatingTile) {
                isRotatingTile = false;
            }
        });

        // Clean up ghost when mouse leaves the board
        boardSvg.addEventListener('mouseleave', () => {
            snapIndicator.classList.remove('active');
        });

        // Touch event support for mobile
        
        // Touch handlers extracted for reuse (board + document)
        let touchStartWorldPos = null; // Store world position for tap-to-move

        function handleBoardTouchStart(e) {
            touchStartTime = Date.now();
            const coords = getEventCoords(e);
            touchStartPos = { x: coords.x, y: coords.y };

            // Store world position for potential tap-to-move
            if (e.touches.length === 1) {
                const rect = boardSvg.getBoundingClientRect();
                const screenX = coords.x - rect.left;
                const screenY = coords.y - rect.top;
                touchStartWorldPos = screenToWorld(screenX, screenY);
            }

            // Single-finger pan (only when not interacting with a tile/player/stone)
            if (e.touches.length === 1 && !isDraggingTile && !isDraggingStone && !isDraggingPlayer) {
                const targetClass = e.target?.getAttribute && e.target.getAttribute('class');
                const isStone = targetClass && (targetClass.includes('stone') || e.target.closest('.stone'));
                const isPlayer = targetClass && (targetClass.includes('player') || e.target.closest('.player'));
                const isTile = e.target && (e.target.closest('.placed-tile') || e.target.closest('.tile'));
                if (!isStone && !isPlayer && !isTile) {
                    e.preventDefault();
                    isPanning = true;
                    panStartX = coords.x;
                    panStartY = coords.y;
                    lastPanX = viewportX;
                    lastPanY = viewportY;
                    boardSvg.style.cursor = 'grabbing';
                }
            }


            if (e.touches.length === 2 && !isDraggingTile && !isDraggingPlayer) {
                // Two-finger pinch zoom / pan (board)
                e.preventDefault();
                isPinching = true;
                isGestureRotating = false;

                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                pinchStartDist = Math.hypot(dx, dy) || 1;
                pinchStartScale = viewportScale;

                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                pinchStartMid = { x: midX, y: midY };
                pinchLastMid = { x: midX, y: midY };
            }
        
        }

        function handleBoardTouchMove(e) {
            e.preventDefault(); // Prevent scrolling

            if (e.touches.length === 2 && isPinching) {
                // Pinch zoom / pan board
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                const dist = Math.hypot(dx, dy) || 1;

                // Midpoint pan
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const midDeltaX = midX - pinchLastMid.x;
                const midDeltaY = midY - pinchLastMid.y;
                pinchLastMid = { x: midX, y: midY };

                // Apply pan in world space
                viewportX += midDeltaX / viewportScale;
                viewportY += midDeltaY / viewportScale;

                // Apply zoom anchored near screen midpoint (approx)
                let newScale = pinchStartScale * (dist / pinchStartDist);
                newScale = Math.max(0.25, Math.min(3.0, newScale));

                const centerX = boardSvg.width.baseVal.value / 2;
                const centerY = boardSvg.height.baseVal.value / 2;

                // Keep pinch midpoint roughly stable during zoom
                const k = (1 / viewportScale) - (1 / newScale);
                viewportX += (midX - centerX) * k;
                viewportY += (midY - centerY) * k;

                viewportScale = newScale;
                updateViewport();
                return;
            }

            else if (e.touches.length === 1) {
                // Single touch - pan or drag
                if (isPanning && !isDraggingTile && !isDraggingStone && !isDraggingPlayer) {
                    const dx = e.touches[0].clientX - panStartX;
                    const dy = e.touches[0].clientY - panStartY;
                    const rad = -viewportRotation * Math.PI / 180;
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);
                    const rotatedDx = dx * cos - dy * sin;
                    const rotatedDy = dx * sin + dy * cos;
                    viewportX = lastPanX + rotatedDx;
                    viewportY = lastPanY + rotatedDy;
                    updateViewport();
                    return;
                }
                // Single touch - handle drag
                const rect = boardSvg.getBoundingClientRect();
                const screenX = e.touches[0].clientX - rect.left;
                const screenY = e.touches[0].clientY - rect.top;
                const world = screenToWorld(screenX, screenY);

                if (isDraggingTile && ghostTile) {
                    const isPlayerTile = (draggedTileShrineType === 'player');
                    const snapResult = findNearestSnapPoint(world.x, world.y, isPlayerTile);
                    ghostTile.setAttribute('transform', `translate(${snapResult.x}, ${snapResult.y})`);

                    if (snapResult.snapped) {
                        snapIndicator.setAttribute('cx', snapResult.x);
                        snapIndicator.setAttribute('cy', snapResult.y);
                        snapIndicator.classList.add('active');
                    } else {
                        snapIndicator.classList.remove('active');
                    }
                } else if (isDraggingStone && ghostStone) {
                    const stonePos = findValidStonePosition(world.x, world.y);
                    ghostStone.setAttribute('transform', `translate(${stonePos.x}, ${stonePos.y})`);

                    if (stonePos.valid) {
                        snapIndicator.setAttribute('cx', stonePos.x);
                        snapIndicator.setAttribute('cy', stonePos.y);
                        snapIndicator.classList.add('active');
                    } else {
                        snapIndicator.classList.remove('active');
                    }
                } else if (isDraggingPlayer && ghostPlayer) {
                    const tf = (typeof window !== 'undefined') ? window.takeFlightState : null;
                    const playerPos = findNearestHexPosition(world.x, world.y);

                    if (tf && tf.active) {
                        if (playerPos.valid) {
                            ghostPlayer.setAttribute('transform', `translate(${playerPos.x}, ${playerPos.y})`);
                            snapIndicator.setAttribute('cx', playerPos.x);
                            snapIndicator.setAttribute('cy', playerPos.y);
                            snapIndicator.classList.add('active');
                        } else {
                            snapIndicator.classList.remove('active');
                        }
                        tf.hoverPos = playerPos;
                        return;
                    }

                    ghostPlayer.setAttribute('transform', `translate(${playerPos.x}, ${playerPos.y})`);

                    if (playerPos.valid) {
                        updatePlayerPath(playerPos.x, playerPos.y);

                        const totalCost = calculatePathCost();
                        const moveCheck = canPlayerMoveToHex(playerPos.x, playerPos.y);

                        if (moveCheck.canMove && totalCost <= getTotalAP()) {
                            snapIndicator.setAttribute('cx', playerPos.x);
                            snapIndicator.setAttribute('cy', playerPos.y);
                            snapIndicator.classList.add('active');
                        } else {
                            snapIndicator.classList.remove('active');
                        }

                        updateStatus(`Path cost: ${totalCost} AP (${getTotalAP() - totalCost} remaining)`);
                    } else {
                        snapIndicator.classList.remove('active');
                    }
                }
            }
        
        }

        function handleBoardTouchEnd(e) {
            const touchDuration = Date.now() - touchStartTime;
            const coords = e.changedTouches[0];
            const rect = boardSvg.getBoundingClientRect();
            const screenX = coords.clientX - rect.left;
            const screenY = coords.clientY - rect.top;

            // Check if this was a tap (short touch without much movement)
            const distMoved = Math.sqrt(
                Math.pow(coords.clientX - touchStartPos.x, 2) +
                Math.pow(coords.clientY - touchStartPos.y, 2)
            );
            const isTap = touchDuration < 300 && distMoved < 10;

            if (isPanning) {
                isPanning = false;
                boardSvg.style.cursor = 'grab';
            }

            // TAP-TO-MOVE: If tapped on a valid hex and not doing anything else, move player there
            console.log(`📱 Tap-to-move check: isTap=${isTap}, isDraggingTile=${isDraggingTile}, isDraggingStone=${isDraggingStone}, isDraggingPlayer=${isDraggingPlayer}, ghostTile=${!!ghostTile}, ghostStone=${!!ghostStone}, playerPosition=${!!playerPosition}, canTakeAction=${canTakeAction()}`);
            if (isTap && !isDraggingTile && !isDraggingStone && !isDraggingPlayer && !ghostTile && !ghostStone && playerPosition && canTakeAction()) {
                const world = screenToWorld(screenX, screenY);
                const targetHex = findNearestHexPosition(world.x, world.y);
                console.log(`📱 Tap target: world=(${world.x.toFixed(1)}, ${world.y.toFixed(1)}), targetHex valid=${targetHex.valid}`);

                if (targetHex.valid) {
                    // Check if we tapped on the player's current position (within small radius)
                    const distFromPlayer = Math.sqrt(
                        Math.pow(targetHex.x - playerPosition.x, 2) +
                        Math.pow(targetHex.y - playerPosition.y, 2)
                    );

                    if (distFromPlayer > 5) { // Not tapping on current position
                        // Calculate path cost using simple distance (1 AP per hex)
                        const hexDist = Math.round(distFromPlayer / 17.3); // Approximate hex distance
                        const pathCost = Math.max(1, hexDist);

                        // Check if move is valid
                        const moveCheck = canPlayerMoveToHex(targetHex.x, targetHex.y, true);

                        // Check for stone at destination
                        const stoneAtTarget = placedStones.find(s => {
                            const dist = Math.sqrt(Math.pow(s.x - targetHex.x, 2) + Math.pow(s.y - targetHex.y, 2));
                            return dist < 5;
                        });
                        const cannotEndTurnHere = stoneAtTarget && stoneAtTarget.type !== 'void';

                        if (cannotEndTurnHere) {
                            updateStatus('Cannot end movement on a ' + stoneAtTarget.type + ' stone!');
                        } else if (!moveCheck.canMove) {
                            updateStatus(moveCheck.reason || 'Cannot move there');
                        } else if (pathCost > getTotalAP()) {
                            updateStatus(`Not enough AP (need ~${pathCost}, have ${getTotalAP()})`);
                        } else {
                            // Calculate actual path cost by building path
                            const startPos = { x: playerPosition.x, y: playerPosition.y };
                            const actualCost = calculateTapMoveCost(startPos, targetHex);

                            if (actualCost > 0 && actualCost <= getTotalAP()) {
                                console.log(`📱 Tap-to-move: from (${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}) to (${targetHex.x.toFixed(1)}, ${targetHex.y.toFixed(1)}), cost=${actualCost}`);

                                // Store for undo
                                lastMove = {
                                    prevPos: { x: startPos.x, y: startPos.y },
                                    newPos: { x: targetHex.x, y: targetHex.y },
                                    apCost: actualCost
                                };

                                placePlayer(targetHex.x, targetHex.y);
                                spendAP(actualCost);

                                // Broadcast in multiplayer
                                if (isMultiplayer) {
                                    broadcastGameAction('player-move', {
                                        playerIndex: activePlayerIndex,
                                        x: targetHex.x,
                                        y: targetHex.y,
                                        apSpent: actualCost
                                    });
                                }

                                // Check for hidden tile reveal
                                const allHexes = getAllHexagonPositions();
                                let playerHex = null;
                                let minDist = Infinity;
                                allHexes.forEach(hexPos => {
                                    const dist = Math.sqrt(Math.pow(hexPos.x - targetHex.x, 2) + Math.pow(hexPos.y - targetHex.y, 2));
                                    if (dist < minDist) {
                                        minDist = dist;
                                        playerHex = hexPos;
                                    }
                                });

                                if (playerHex && minDist < 5 && playerHex.tiles) {
                                    const flippedTiles = playerHex.tiles.filter(t => t.flipped && !t.isPlayerTile);
                                    flippedTiles.forEach(tileInfo => {
                                        revealTile(tileInfo.id);
                                    });
                                }

                                updateStatus(`Moved (cost: ${actualCost} AP, ${getTotalAP()} AP remaining)`);
                            } else if (actualCost <= 0) {
                                updateStatus('No valid path to that hex');
                            } else {
                                updateStatus(`Not enough AP (need ${actualCost}, have ${getTotalAP()})`);
                            }
                        }
                    }
                }
            }

            if (isTap && isDraggingTile && ghostTile) {
                // Tap to flip
                draggedTileFlipped = !draggedTileFlipped;

                // Regenerate ghost tile with new flip state
                const oldTransform = ghostTile.getAttribute('transform');
                const translateMatch = oldTransform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
                const currentX = translateMatch ? parseFloat(translateMatch[1]) : 0;
                const currentY = translateMatch ? parseFloat(translateMatch[2]) : 0;

                viewport.removeChild(ghostTile);
                ghostTile = createTileGroup(draggedTileRotation, draggedTileFlipped, draggedTileShrineType);
                ghostTile.classList.add('ghost-tile');
                ghostTile.setAttribute('transform', `translate(${currentX}, ${currentY})`);
                viewport.appendChild(ghostTile);
            } else {
                // Handle drop (same logic as mouseup)
                const world = screenToWorld(screenX, screenY);

                if (isDraggingTile && ghostTile) {
                    const isPlayerTile = (draggedTileShrineType === 'player');
                    const snapResult = findNearestSnapPoint(world.x, world.y, isPlayerTile);
                    if (snapResult.snapped) {
                        console.log(`Placing tile: rotation=${draggedTileRotation}, flipped=${draggedTileFlipped}, shrine=${draggedTileShrineType}`);
                        const tileId = placeTile(snapResult.x, snapResult.y, draggedTileRotation, draggedTileFlipped, draggedTileShrineType, false, false, draggedTileId);

                        if (draggedTileShrineType === 'player' && draggedTileId === null && tileId !== null) {
                            playerTilesAvailable--;
                            const countEl = document.getElementById('new-player-tile-count') || document.getElementById('player-tile-count');
                            if (countEl) countEl.textContent = playerTilesAvailable;
                            if (isMobile) document.getElementById('mobile-tile-count').textContent = playerTilesAvailable;

                            if (playerTileElements.length > 0) {
                                const tileToRemove = playerTileElements.shift();
                                tileToRemove.remove();
                            }

                            if (isMultiplayer) {
                                // Broadcast for other clients to place the player tile visually.
                                broadcastGameAction('player-tile-place', {
                                    x: snapResult.x,
                                    y: snapResult.y,
                                    playerIndex: myPlayerIndex,
                                    color: playerColor
                                });
                            }
                        }

                        // TELEKINESIS: track moves and move players with tiles (touch handler)
                        const tkStateTouch = window.telekinesisState;
                        if (tkStateTouch && tkStateTouch.active && draggedTileId !== null && draggedTileOriginalPos) {
                            if (isMultiplayer && typeof broadcastGameAction === 'function') {
                                broadcastGameAction('telekinesis-move', {
                                    tileId: draggedTileId,
                                    newPos: { x: snapResult.x, y: snapResult.y },
                                    oldPos: { x: draggedTileOriginalPos.x, y: draggedTileOriginalPos.y },
                                    movedPlayers: []
                                });
                            }
                            tkStateTouch.movesLeft--;
                            tkStateTouch.movedTiles.push(draggedTileId);
                            const doneBtnT = document.getElementById('telekinesis-done-btn');
                            if (doneBtnT) doneBtnT.textContent = `Done (${tkStateTouch.maxMoves - tkStateTouch.movesLeft}/${tkStateTouch.maxMoves})`;
                            updateStatus(`Telekinesis: tile moved! (${tkStateTouch.maxMoves - tkStateTouch.movesLeft}/${tkStateTouch.maxMoves})`);
                            if (typeof updateCatacombIndicators === 'function') updateCatacombIndicators();
                            if (tkStateTouch.movesLeft <= 0 && typeof window.finishTelekinesis === 'function') {
                                window.finishTelekinesis();
                            }
                        } else if (draggedTileId !== null) {
                            // Moving already-placed non-player tiles is not synced in multiplayer; revert to avoid desync.
                            if (isMultiplayer && draggedTileOriginalPos) {
                                updateStatus('⚠️ Tiles cannot be moved in multiplayer.');
                                placeTile(draggedTileOriginalPos.x, draggedTileOriginalPos.y, draggedTileRotation, draggedTileFlipped, draggedTileShrineType, false, false, draggedTileId);
                            }
                        }
                    } else if (draggedTileOriginalPos && draggedTileId !== null) {
                        const tkActiveTouch = window.telekinesisState && window.telekinesisState.active;
                        updateStatus(tkActiveTouch
                            ? 'Invalid placement! Tiles must touch at least 2 other tiles. Tile snapped back.'
                            : 'Invalid placement! Tile snapped back to original position.');
                        placeTile(draggedTileOriginalPos.x, draggedTileOriginalPos.y, draggedTileRotation, draggedTileFlipped, draggedTileShrineType, false, false, draggedTileId);
                    } else if (draggedTileShrineType === 'player') {
                        updateStatus('Player tiles must touch 2+ adjacent unrevealed tiles');
                    }

                    viewport.removeChild(ghostTile);
                    ghostTile = null;
                    isDraggingTile = false;
                    draggedTileId = null;
                    draggedTileOriginalPos = null;
                    snapIndicator.classList.remove('active');
                } else if (isDraggingStone && ghostStone) {
                    const stonePos = findValidStonePosition(world.x, world.y);
                    if (stonePos.valid) {
                        const stoneId = placeStone(stonePos.x, stonePos.y, draggedStoneType);

                        if (draggedStoneId === null) {
                            playerPool[draggedStoneType]--;
                            updateStoneCountDisplay(draggedStoneType);
                            syncPlayerState();
                        }

                        if (isMultiplayer && stoneId) {
                            broadcastStonePlace(stoneId, stonePos.x, stonePos.y, draggedStoneType);
                        }
                    } else if (draggedStoneId !== null) {
                        playerPool[draggedStoneType]++;
                        updateStoneCountDisplay(draggedStoneType);
                        syncPlayerState();
                    }

                    viewport.removeChild(ghostStone);
                    ghostStone = null;
                    isDraggingStone = false;
                    draggedStoneId = null;
                    snapIndicator.classList.remove('active');
                } else if (isDraggingPlayer && ghostPlayer) {
                    const tf = (typeof window !== 'undefined') ? window.takeFlightState : null;
                    const playerPos = findNearestHexPosition(world.x, world.y);
                    const startPos = playerPath[0];
                    let movementSuccessful = false;

                    if (tf && tf.active) {
                        const targetIndex = tf.targetPlayerIndex;
                        const destPos = playerPos && playerPos.valid ? { x: playerPos.x, y: playerPos.y } : null;
                        const origin = tf.startPos || startPos;

                        const hasStone = destPos && placedStones.some(s => {
                            const dist = Math.sqrt(Math.pow(s.x - destPos.x, 2) + Math.pow(s.y - destPos.y, 2));
                            return dist < 5;
                        });
                        const hasPlayer = destPos && playerPositions.some((p, idx) => {
                            if (!p) return false;
                            if (idx === targetIndex) return false;
                            const dist = Math.sqrt(Math.pow(p.x - destPos.x, 2) + Math.pow(p.y - destPos.y, 2));
                            return dist < 5;
                        });

                        if (!destPos || hasStone || hasPlayer) {
                            if (hasStone) updateStatus('Take Flight: cannot teleport onto a stone.');
                            else if (hasPlayer) updateStatus('Take Flight: another player is in the way.');
                            else updateStatus('Take Flight: invalid destination.');

                            if (origin) {
                                if (targetIndex === activePlayerIndex) {
                                    placePlayer(origin.x, origin.y);
                                } else if (typeof movePlayerVisually === 'function') {
                                    movePlayerVisually(targetIndex, origin.x, origin.y, 0);
                                }
                            }
                        } else {
                            if (targetIndex === activePlayerIndex) {
                                placePlayer(destPos.x, destPos.y);
                            } else if (typeof movePlayerVisually === 'function') {
                                movePlayerVisually(targetIndex, destPos.x, destPos.y, 0);
                            }

                            if (tf.onComplete) {
                                tf.onComplete(destPos.x, destPos.y);
                            }
                        }
                    } else if (playerPath.length > 1 && playerPos.valid) {
                        const totalCost = calculatePathCost();
                        const finalPos = playerPath[playerPath.length - 1];
                        const moveCheck = canPlayerMoveToHex(finalPos.x, finalPos.y, true);

                        // Check if there's a stone at the final position that you CAN'T end turn on
                        const stoneAtFinal = placedStones.find(s => {
                            const dist = Math.sqrt(Math.pow(s.x - finalPos.x, 2) + Math.pow(s.y - finalPos.y, 2));
                            return dist < 5;
                        });
                        const cannotEndTurnHere = stoneAtFinal && stoneAtFinal.type !== 'void';

                        if (cannotEndTurnHere) {
                            updateStatus('Cannot end movement on a ' + stoneAtFinal.type + ' stone!');
                        } else if (!moveCheck.canMove) {
                            updateStatus(moveCheck.reason || 'Cannot move to this position');
                        } else if (totalCost > getTotalAP()) {
                            updateStatus(`Not enough AP (need ${totalCost}, have ${getTotalAP()})`);
                        } else {
                            // Store the last move for undo
                            lastMove = {
                                prevPos: { x: startPos.x, y: startPos.y },
                                newPos: { x: finalPos.x, y: finalPos.y },
                                apCost: totalCost
                            };
                            placePlayer(finalPos.x, finalPos.y);
                            spendAP(totalCost);
                            movementSuccessful = true;

                            // Broadcast player movement to other players
                            if (isMultiplayer) {
                                broadcastGameAction('player-move', {
                                    playerIndex: activePlayerIndex,
                                    x: finalPos.x,
                                    y: finalPos.y,
                                    apSpent: totalCost
                                });
                            }

                            // Check if player stepped on a hidden tile - reveal it!
                            const actualPlayerPos = { x: playerPosition.x, y: playerPosition.y };
                            const allHexes = getAllHexagonPositions();

                            let playerHex = null;
                            let minDist = Infinity;
                            allHexes.forEach(hexPos => {
                                const dist = Math.sqrt(Math.pow(hexPos.x - actualPlayerPos.x, 2) + Math.pow(hexPos.y - actualPlayerPos.y, 2));
                                if (dist < minDist) {
                                    minDist = dist;
                                    playerHex = hexPos;
                                }
                            });

                            if (playerHex && minDist < 5 && playerHex.tiles) {
                                const flippedTiles = playerHex.tiles.filter(t => t.flipped && !t.isPlayerTile);
                                flippedTiles.forEach(tileInfo => {
                                    revealTile(tileInfo.id);
                                });
                            }
                        }
                    }

                    // If movement failed or was cancelled, restore player to start position
                    if (!movementSuccessful && startPos) {
                        placePlayer(startPos.x, startPos.y);
                    }

                    if (ghostPlayer) {
                        viewport.removeChild(ghostPlayer);
                        ghostPlayer = null;
                    }
                    clearPlayerPath();
                    isDraggingPlayer = false;
                    snapIndicator.classList.remove('active');
                }
            }

            isGestureRotating = false;
            isPinching = false;
            initialTouches = [];
        
        }

boardSvg.addEventListener('touchstart', handleBoardTouchStart, { passive: false });

        boardSvg.addEventListener('touchmove', handleBoardTouchMove, { passive: false });

        boardSvg.addEventListener('touchend', handleBoardTouchEnd, { passive: false });
        // Ensure deck-origin drags keep updating even when touch target isn't the board SVG
        document.addEventListener('touchmove', (e) => {
            if (isDraggingTile || isDraggingPlayer || isDraggingStone || isPanning || isPinching) {
                handleBoardTouchMove(e);
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (isDraggingTile || isDraggingPlayer || isDraggingStone || isPanning || isPinching) {
                handleBoardTouchEnd(e);
            }
        }, { passive: false });

        document.addEventListener('touchcancel', (e) => {
            if (isDraggingTile || isDraggingPlayer || isDraggingStone || isPanning || isPinching) {
                handleBoardTouchEnd(e);
            }
        }, { passive: false });


        boardSvg.addEventListener('mousedown', (e) => {
            if (window.shouldDebugLog ? window.shouldDebugLog('boardMouseDown', 300) : true) {
                console.log(`🖱️ boardSvg mousedown: button=${e.button}, shift=${e.shiftKey}, target=${e.target.tagName}`);
            }

            if (e.button === 0) leftButtonDown = true;
            if (e.button === 2) rightButtonDown = true;

            // Check for scroll effect selection mode (tile swap, tile flip, etc.)
            if (e.button === 0 && spellSystem && spellSystem.scrollEffects && spellSystem.scrollEffects.selectionMode) {
                const rect = boardSvg.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const world = screenToWorld(screenX, screenY);

                if (handleSelectionModeClick(world.x, world.y)) {
                    e.preventDefault();
                    e.stopPropagation();
                    return; // Click was handled by selection mode
                }
            }

            // SHIFT+CLICK: Debug mode - pin hex coordinates
            if (e.shiftKey && e.button === 0) {
                if (window.shouldDebugLog ? window.shouldDebugLog('shiftClick', 500) : true) {
                    console.log(`📍 SHIFT+CLICK DETECTED!`);
                }
                e.preventDefault();
                e.stopPropagation();
                const rect = boardSvg.getBoundingClientRect();
                const screenX = e.clientX - rect.left;
                const screenY = e.clientY - rect.top;
                const world = screenToWorld(screenX, screenY);
                
                if (window.shouldDebugLog ? window.shouldDebugLog('shiftClickPos', 500) : true) {
                    console.log(`📍 DEBUG: Shift+Click at screen (${screenX.toFixed(1)}, ${screenY.toFixed(1)})`);
                }
                console.log(`   World coordinates: (${world.x.toFixed(1)}, ${world.y.toFixed(1)})`);
                
                // Find nearest hex position
                const hexPos = findNearestHexPosition(world.x, world.y);
                if (hexPos.valid) {
                    console.log(`   Nearest hex: (${hexPos.x.toFixed(1)}, ${hexPos.y.toFixed(1)})`);
                    
                    // Find all hexagon positions to see which tiles contribute
                    const allHexes = getAllHexagonPositions();
                    const matchingHex = allHexes.find(h => {
                        const dist = Math.sqrt(Math.pow(h.x - hexPos.x, 2) + Math.pow(h.y - hexPos.y, 2));
                        return dist < 5;
                    });
                    
                    if (matchingHex && matchingHex.tiles) {
                        console.log(`   This hex is contributed by ${matchingHex.tiles.length} tile(s):`);
                        matchingHex.tiles.forEach((tile, i) => {
                            console.log(`     [${i}] Tile at (${tile.x.toFixed(1)}, ${tile.y.toFixed(1)}): flipped=${tile.flipped}, shrine=${tile.shrineType}, id=${tile.id}`);
                        });
                    }
                }
                
                // Create visual debug marker
                const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                marker.setAttribute('class', 'debug-marker');
                marker.setAttribute('transform', `translate(${world.x}, ${world.y})`);
                
                // Draw crosshair
                const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line1.setAttribute('x1', '-10');
                line1.setAttribute('y1', '0');
                line1.setAttribute('x2', '10');
                line1.setAttribute('y2', '0');
                line1.setAttribute('stroke', '#ff00ff');
                line1.setAttribute('stroke-width', '2');
                marker.appendChild(line1);
                
                const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line2.setAttribute('x1', '0');
                line2.setAttribute('y1', '-10');
                line2.setAttribute('x2', '0');
                line2.setAttribute('y2', '10');
                line2.setAttribute('stroke', '#ff00ff');
                line2.setAttribute('stroke-width', '2');
                marker.appendChild(line2);
                
                // Draw circle
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', '0');
                circle.setAttribute('cy', '0');
                circle.setAttribute('r', '5');
                circle.setAttribute('fill', 'none');
                circle.setAttribute('stroke', '#ff00ff');
                circle.setAttribute('stroke-width', '2');
                marker.appendChild(circle);
                
                // Add text label
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', '12');
                text.setAttribute('y', '5');
                text.setAttribute('fill', '#ff00ff');
                text.setAttribute('font-size', '10');
                text.setAttribute('font-weight', 'bold');
                text.textContent = `(${world.x.toFixed(0)}, ${world.y.toFixed(0)})`;
                marker.appendChild(text);
                
                viewport.appendChild(marker);
                debugMarkers.push(marker);
                
                updateStatus(`DEBUG: Pinned (${world.x.toFixed(1)}, ${world.y.toFixed(1)}) - Check console for details`);
                return; // Don't start panning
            }

            // Don't start panning if we're already dragging something
            if (isDraggingTile || isDraggingStone || isDraggingPlayer) return;

            const targetClass = e.target.getAttribute('class');
            const isStone = targetClass && (targetClass.includes('stone') || e.target.closest('.stone'));
            const isPlayer = targetClass && (targetClass.includes('player') || e.target.closest('.player'));

            if (e.button === 0 && (e.target === boardSvg || e.target === viewport || e.target.tagName === 'polygon') && !isStone && !isPlayer) {
                e.preventDefault();
                isPanning = true;
                panStartX = e.clientX;
                panStartY = e.clientY;
                lastPanX = viewportX;
                lastPanY = viewportY;
                boardSvg.style.cursor = 'grabbing';
            } else if (e.button === 2 && (e.target === boardSvg || e.target === viewport)) {
                e.preventDefault();
                isRotatingBoard = true;
                rotateStartX = e.clientX;
                rotateStartRotation = viewportRotation;
                boardSvg.style.cursor = 'grabbing';
            }
        });

        boardSvg.addEventListener('contextmenu', (e) => e.preventDefault());

        let pendingDocumentMove = false;
        let lastDocumentMove = null;
        document.addEventListener('mousemove', (e) => {
            lastDocumentMove = { clientX: e.clientX, clientY: e.clientY };
            if (pendingDocumentMove) return;
            pendingDocumentMove = true;
            requestAnimationFrame(() => {
                pendingDocumentMove = false;
                if (!lastDocumentMove) return;

                if (isPanning) {
                    const dx = lastDocumentMove.clientX - panStartX;
                    const dy = lastDocumentMove.clientY - panStartY;
                    const rad = -viewportRotation * Math.PI / 180;
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);
                    const rotatedDx = dx * cos - dy * sin;
                    const rotatedDy = dx * sin + dy * cos;
                    viewportX = lastPanX + rotatedDx;
                    viewportY = lastPanY + rotatedDy;
                    updateViewport();
                } else if (isRotatingBoard) {
                    const dx = lastDocumentMove.clientX - rotateStartX;
                    viewportRotation = rotateStartRotation + (dx / 100) * 90;
                    updateViewport();
                } else if (isRotatingTile) {
                    const dx = lastDocumentMove.clientX - rotateTileStartX;
                    const steps = Math.round(dx / 60);
                    currentRotation = (rotateTileStartRotation - steps + 6) % 6; // Reversed direction: subtract instead of add
                    drawDeckTile();
                }
            });
        });

        // Debug mode: array to store debug markers
        let debugMarkers = [];

        document.addEventListener('keydown', (e) => {
            console.log(`Key pressed: ${e.key}, isDraggingTile=${isDraggingTile}, ghostTile=${!!ghostTile}, shift=${e.shiftKey}`);
            if (e.key === 'f' || e.key === 'F') {
                console.log(`F key detected! isDraggingTile=${isDraggingTile}, ghostTile exists=${!!ghostTile}, shift=${e.shiftKey}`);
                
                // SHIFT+F: Debug mode - show tile coordinates
                if (e.shiftKey && isDraggingTile && ghostTile) {
                    if (window.shouldDebugLog ? window.shouldDebugLog('tileDragged', 500) : true) {
                        console.log(`📍 DEBUG: Tile being dragged`);
                    }
                    console.log(`   draggedTileId: ${draggedTileId}`);
                    console.log(`   draggedTileShrineType: ${draggedTileShrineType}`);
                    console.log(`   draggedTileFlipped: ${draggedTileFlipped}`);
                    console.log(`   draggedTileRotation: ${draggedTileRotation}`);
                    if (draggedTileOriginalPos) {
                        console.log(`   Original position: (${draggedTileOriginalPos.x.toFixed(1)}, ${draggedTileOriginalPos.y.toFixed(1)})`);
                    }
                    
                    // Get current ghost position
                    const transform = ghostTile.getAttribute('transform');
                    console.log(`   Current ghost transform: ${transform}`);
                    
                    updateStatus(`DEBUG: Tile ID=${draggedTileId}, shrine=${draggedTileShrineType}, flipped=${draggedTileFlipped}`);
                }
                // Normal F: Flip the tile
                else if (!e.shiftKey && isDraggingTile && ghostTile) {
                    console.log(`Before flip: draggedTileFlipped=${draggedTileFlipped}`);
                    // Flip the tile being dragged
                    draggedTileFlipped = !draggedTileFlipped;
                    console.log(`After flip: draggedTileFlipped=${draggedTileFlipped}`);

                    // Update the ghost tile visual
                    ghostTile.innerHTML = '';
                    const tile = createTileGroup(TILE_SIZE, draggedTileRotation, draggedTileFlipped);
                    ghostTile.appendChild(tile);

                    updateStatus(`Tile ${draggedTileFlipped ? 'flipped' : 'unflipped'}`);
                    console.log(`Tile visual updated`);
                } else {
                    console.log(`Cannot flip - not dragging a tile or no ghost tile`);
                }
            }
        });

        boardSvg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = boardSvg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldBefore = screenToWorld(mouseX, mouseY);
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            viewportScale = Math.max(0.1, Math.min(10, viewportScale * zoomFactor));
            const worldAfter = screenToWorld(mouseX, mouseY);
            viewportX += (worldAfter.x - worldBefore.x) * viewportScale;
            viewportY += (worldAfter.y - worldBefore.y) * viewportScale;
            updateViewport();
        });

        let isEndingTurn = false; // Double-click guard for end-turn button

        document.getElementById('end-turn').onclick = function() {
            resetEndTurnPrompt();
            // Prevent double-click from advancing turn twice
            if (isEndingTurn) return;

            // In multiplayer, only allow ending turn if it's your turn
            if (!canTakeAction()) {
                notYourTurn();
                return;
            }

            isEndingTurn = true;

            // Replenish shrine stones BEFORE clearing buffs (Mine buff doubles output)
            if (playerPosition) {
                const shrine = findShrineAtPosition(playerPosition.x, playerPosition.y);
                if (shrine && shrine.shrineType !== 'catacomb') {
                    const effectiveType = spellSystem?.scrollEffects?.getEffectiveTileElement?.(shrine) ?? shrine.shrineType;
                    replenishShrineStones(effectiveType);
                }
            }

            // Cancel any active selection mode (tile swap/flip in progress)
            if (spellSystem && spellSystem.scrollEffects) {
                spellSystem.scrollEffects.cancelSelectionMode();
                // Clear turn-based buffs (like extended placement, global placement)
                spellSystem.scrollEffects.clearTurnBuffs();
                // Clear turn tracking (for Reflect and Burning Motivation)
                spellSystem.scrollEffects.clearTurnTracking();
            }

            // End-of-turn overflow: if hand or active scroll count exceeds capacity, show resolve modal first
            const scrolls = spellSystem.getPlayerScrolls(false);
            const handOver = scrolls.hand.size > spellSystem.MAX_HAND_SIZE;
            const activeOver = scrolls.active.size > spellSystem.MAX_ACTIVE_SIZE;
            if (handOver || activeOver) {
                spellSystem.showEndTurnOverflowModal(function doEndTurn() {
                    lastMove = null;
                    if (playerPositions.length > 1) {
                        const COLOR_RANK = {
                            '#9458f4': 1, '#ffce00': 2, '#ed1b43': 3, '#5894f4': 4, '#69d83a': 5
                        };
                        const sortedPlayers = [...playerPositions].map((p, idx) => ({
                            index: idx,
                            rank: COLOR_RANK[p.color] || 999
                        })).sort((a, b) => a.rank - b.rank);
                        const currentSortedIndex = sortedPlayers.findIndex(p => p.index === activePlayerIndex);
                        const nextSortedIndex = (currentSortedIndex + 1) % sortedPlayers.length;
                        activePlayerIndex = sortedPlayers[nextSortedIndex].index;

                        // Broadcast turn change FIRST in multiplayer
                        if (isMultiplayer) {
                            const startedAt = Date.now();
                            turnStartedAtMs = startedAt;
                            currentTurnNumber++;
                            broadcastGameAction('turn-change', {
                                playerIndex: activePlayerIndex,
                                turnStartedAt: startedAt,
                                turnNumber: currentTurnNumber
                            });
                        }

                        // Wandering River ends at the beginning of your next turn: clear when we switch TO that player
                        if (spellSystem?.scrollEffects?.clearWanderingRiverForPlayer) {
                            spellSystem.scrollEffects.clearWanderingRiverForPlayer(activePlayerIndex);
                        }
                        if (spellSystem?.scrollEffects?.clearFreedomForPlayer) {
                            spellSystem.scrollEffects.clearFreedomForPlayer(activePlayerIndex);
                        }
                        if (spellSystem?.scrollEffects?.clearQuickReflexesForPlayer) {
                            spellSystem.scrollEffects.clearQuickReflexesForPlayer(activePlayerIndex);
                        }
                        if (spellSystem?.scrollEffects?.clearExcavateForPlayer) {
                            spellSystem.scrollEffects.clearExcavateForPlayer(activePlayerIndex);
                        }
                        const reflectResult = spellSystem?.scrollEffects?.processReflectPending
                            ? spellSystem.scrollEffects.processReflectPending(activePlayerIndex) : null;
                        const psychicResult = spellSystem?.scrollEffects?.processPsychicPending
                            ? spellSystem.scrollEffects.processPsychicPending(activePlayerIndex) : null;
                        // Excavate teleport: if this player has a pending teleport, trigger it
                        if (spellSystem?.scrollEffects?.processExcavateTeleport) {
                            spellSystem.scrollEffects.processExcavateTeleport(activePlayerIndex);
                        }
                        // AP resets at the start of the new player's turn
                        currentAP = 5;
                        document.getElementById('ap-count').textContent = currentAP;
                        refreshVoidAP();
                        syncPlayerState();

                        // Broadcast reflect/psychic triggers after turn-change
                        if (isMultiplayer) {
                            if (reflectResult?.triggered && reflectResult.definition) {
                                const def = reflectResult.definition;
                                broadcastGameAction('reflect-triggered', {
                                    playerIndex: reflectResult.playerIndex,
                                    scrollName: reflectResult.scrollName,
                                    element: def.element,
                                    elements: def.element === 'catacomb' ? def.patterns?.[0]?.map(p => p.type) : null,
                                    isCatacomb: def.element === 'catacomb'
                                });
                                if (typeof syncPlayerState === 'function') syncPlayerState();
                            }
                            if (psychicResult?.triggered && psychicResult.definition) {
                                const def = psychicResult.definition;
                                broadcastGameAction('psychic-triggered', {
                                    playerIndex: psychicResult.playerIndex,
                                    scrollName: psychicResult.scrollName,
                                    element: def.element,
                                    elements: def.element === 'catacomb' ? def.patterns?.[0]?.map(p => p.type) : null,
                                    isCatacomb: def.element === 'catacomb'
                                });
                                if (typeof syncPlayerState === 'function') syncPlayerState();
                            }
                        }

                        const nextPlayerColorName = getPlayerColorName(activePlayerIndex);
                        Object.keys(stoneCounts).forEach(updateStoneCount);
                        spellSystem.updateScrollCount();
                        updateStatus(`Turn ended. Now ${nextPlayerColorName}'s turn! AP restored.`);
                        console.log(`📄 Switched to player ${activePlayerIndex + 1} (${nextPlayerColorName})`);
                    } else {
                        // Single player: AP resets for next turn
                        currentAP = 5;
                        document.getElementById('ap-count').textContent = currentAP;
                        refreshVoidAP();
                        updateStatus('Turn ended. AP restored.');
                    }
                    isEndingTurn = false;
                });
                return;
            }

            // Shrine replenishment already handled above (before clearTurnBuffs, so Mine buff applies)

            lastMove = null; // Clear undo history on new turn

            // Switch to next player based on color rank
            if (playerPositions.length > 1) {
                // Color rank order: void(1) -> wind(2) -> fire(3) -> water(4) -> earth(5)
                const COLOR_RANK = {
                    '#9458f4': 1, // purple/void
                    '#ffce00': 2, // yellow/wind
                    '#ed1b43': 3, // red/fire
                    '#5894f4': 4, // blue/water
                    '#69d83a': 5  // green/earth
                };

                // Sort players by rank
                const sortedPlayers = [...playerPositions].map((p, idx) => ({
                    index: idx,
                    rank: COLOR_RANK[p.color] || 999
                })).sort((a, b) => a.rank - b.rank);

                // Find current player in sorted list
                const currentSortedIndex = sortedPlayers.findIndex(p => p.index === activePlayerIndex);
                
                // Move to next player in sorted order (wrap around)
                const nextSortedIndex = (currentSortedIndex + 1) % sortedPlayers.length;
                activePlayerIndex = sortedPlayers[nextSortedIndex].index;

                // Broadcast turn change FIRST in multiplayer so the receiver
                // updates activePlayerIndex before any follow-up broadcasts arrive
                if (isMultiplayer) {
                    const startedAt = Date.now();
                    turnStartedAtMs = startedAt;
                    currentTurnNumber++;
                    broadcastGameAction('turn-change', {
                        playerIndex: activePlayerIndex,
                        turnStartedAt: startedAt,
                        turnNumber: currentTurnNumber
                    });
                }

                // Wandering River ends at the beginning of your next turn
                if (spellSystem?.scrollEffects?.clearWanderingRiverForPlayer) {
                    spellSystem.scrollEffects.clearWanderingRiverForPlayer(activePlayerIndex);
                }
                if (spellSystem?.scrollEffects?.clearFreedomForPlayer) {
                    spellSystem.scrollEffects.clearFreedomForPlayer(activePlayerIndex);
                }
                if (spellSystem?.scrollEffects?.clearQuickReflexesForPlayer) {
                    spellSystem.scrollEffects.clearQuickReflexesForPlayer(activePlayerIndex);
                }
                if (spellSystem?.scrollEffects?.clearExcavateForPlayer) {
                    spellSystem.scrollEffects.clearExcavateForPlayer(activePlayerIndex);
                }
                const reflectResult = spellSystem?.scrollEffects?.processReflectPending
                    ? spellSystem.scrollEffects.processReflectPending(activePlayerIndex) : null;
                const psychicResult = spellSystem?.scrollEffects?.processPsychicPending
                    ? spellSystem.scrollEffects.processPsychicPending(activePlayerIndex) : null;
                // Excavate teleport: if this player has a pending teleport, trigger it
                if (spellSystem?.scrollEffects?.processExcavateTeleport) {
                    spellSystem.scrollEffects.processExcavateTeleport(activePlayerIndex);
                }

                // AP resets at the start of the new player's turn
                currentAP = 5;
                document.getElementById('ap-count').textContent = currentAP;
                refreshVoidAP();
                syncPlayerState();

                // Broadcast reflect/psychic triggers after turn-change
                if (isMultiplayer) {
                    if (reflectResult?.triggered && reflectResult.definition) {
                        const def = reflectResult.definition;
                        broadcastGameAction('reflect-triggered', {
                            playerIndex: reflectResult.playerIndex,
                            scrollName: reflectResult.scrollName,
                            element: def.element,
                            elements: def.element === 'catacomb' ? def.patterns?.[0]?.map(p => p.type) : null,
                            isCatacomb: def.element === 'catacomb'
                        });
                        if (typeof syncPlayerState === 'function') syncPlayerState();
                    }
                    if (psychicResult?.triggered && psychicResult.definition) {
                        const def = psychicResult.definition;
                        broadcastGameAction('psychic-triggered', {
                            playerIndex: psychicResult.playerIndex,
                            scrollName: psychicResult.scrollName,
                            element: def.element,
                            elements: def.element === 'catacomb' ? def.patterns?.[0]?.map(p => p.type) : null,
                            isCatacomb: def.element === 'catacomb'
                        });
                        if (typeof syncPlayerState === 'function') syncPlayerState();
                    }
                }

                const nextPlayerColorName = getPlayerColorName(activePlayerIndex);

                // Update UI to show new player's inventory
                Object.keys(stoneCounts).forEach(updateStoneCount);
                spellSystem.updateScrollCount();

                updateStatus(`Turn ended. Now ${nextPlayerColorName}'s turn! AP restored.`);
                console.log(`📄 Switched to player ${activePlayerIndex + 1} (${nextPlayerColorName})`);
                isEndingTurn = false;
            } else {
                // Single player: your next turn starts now; clear buffs then restore AP
                if (spellSystem && spellSystem.scrollEffects && spellSystem.scrollEffects.clearWanderingRiverForPlayer) {
                    spellSystem.scrollEffects.clearWanderingRiverForPlayer(activePlayerIndex);
                }
                if (spellSystem?.scrollEffects?.clearFreedomForPlayer) {
                    spellSystem.scrollEffects.clearFreedomForPlayer(activePlayerIndex);
                }
                if (spellSystem?.scrollEffects?.clearQuickReflexesForPlayer) {
                    spellSystem.scrollEffects.clearQuickReflexesForPlayer(activePlayerIndex);
                }
                if (spellSystem?.scrollEffects?.clearExcavateForPlayer) {
                    spellSystem.scrollEffects.clearExcavateForPlayer(activePlayerIndex);
                }
                if (spellSystem?.scrollEffects?.processReflectPending) {
                    spellSystem.scrollEffects.processReflectPending(activePlayerIndex);
                }
                if (spellSystem?.scrollEffects?.processPsychicPending) {
                    spellSystem.scrollEffects.processPsychicPending(activePlayerIndex);
                }
                // Excavate teleport for single player
                if (spellSystem?.scrollEffects?.processExcavateTeleport) {
                    spellSystem.scrollEffects.processExcavateTeleport(activePlayerIndex);
                }
                // AP resets at start of new turn
                currentAP = 5;
                document.getElementById('ap-count').textContent = currentAP;
                refreshVoidAP();
                updateStatus('Turn ended. AP restored.');
                isEndingTurn = false;
            }
        };

        
        // Inventory toggle button
        const invBtn = document.getElementById('inventory-toggle');
        if (invBtn) invBtn.onclick = toggleInventory;
document.getElementById('undo-move').onclick = function() {
            if (!lastMove) {
                updateStatus('No move to undo!');
                return;
            }

            // Restore previous position
            placePlayer(lastMove.prevPos.x, lastMove.prevPos.y);

            // Restore AP
            currentAP += lastMove.apCost;
            document.getElementById('ap-count').textContent = currentAP;

            // Refresh void AP display in case void stones changed
            if (typeof refreshVoidAP === 'function') {
                refreshVoidAP();
            }

            updateStatus(`Undid movement. Restored ${lastMove.apCost} AP (now ${currentAP} AP).`);

            // Broadcast undo in multiplayer
            if (isMultiplayer) {
                broadcastGameAction('undo-move', {
                    playerIndex: activePlayerIndex,
                    x: lastMove.prevPos.x,
                    y: lastMove.prevPos.y,
                    apRestored: lastMove.apCost
                });

                // Sync player state so other players see updated AP
                if (typeof syncPlayerState === 'function') {
                    syncPlayerState();
                }
            }

            // Clear the undo history (can only undo once)
            lastMove = null;
        };

        document.getElementById('scroll-inventory').onclick = function() {
            spellSystem.showInventory();
        };

        document.getElementById('cast-spell').onclick = function() {
            if (!canTakeAction()) {
                notYourTurn();
                return;
            }
            spellSystem.castSpell();
        };

        document.getElementById('leave-game').onclick = function() {
            leaveGame();
        };

        function findShrineAtPosition(x, y) {
            // Check each tile to see if player is on the center hex (shrine location)
            // Skip player tiles - we want the actual shrine tile
            for (const tile of placedTiles) {
                // Skip player tiles (shrineType === 'player')
                if (tile.shrineType === 'player') continue;

                const dist = Math.sqrt(Math.pow(tile.x - x, 2) + Math.pow(tile.y - y, 2));
                // Center hex is at the tile's position (0,0 offset)
                if (dist < 5) {
                    console.log(`🔍 findShrineAtPosition(${x.toFixed(1)}, ${y.toFixed(1)}): Found ${tile.shrineType} shrine at tile ${tile.id}`);
                    return tile;
                }
            }
            console.log(`🔍 findShrineAtPosition(${x.toFixed(1)}, ${y.toFixed(1)}): No shrine found`);
            return null;
        }

        function replenishShrineStones(shrineType) {
            // Stone rank determines replenishment amount
            const STONE_RANK = {
                'void': 1,
                'wind': 2,
                'fire': 3,
                'water': 4,
                'earth': 5
            };

            let replenishAmount = STONE_RANK[shrineType];

            // Mine buff: double output for the buffed shrine type
            const mineBuff = spellSystem?.scrollEffects?.activeBuffs?.mine;
            if (mineBuff && mineBuff.playerIndex === activePlayerIndex && mineBuff.shrineType === shrineType) {
                replenishAmount *= 2;
                console.log(`⛏️ Mine: doubling ${shrineType} shrine output to ${replenishAmount}`);
            }

            // Calculate how many stones we can actually transfer
            // Limited by: source pool availability, player pool capacity, and replenish amount
            const availableInSource = sourcePool[shrineType];
            const spaceInPlayer = playerPoolCapacity[shrineType] - playerPool[shrineType];
            const actualReplenished = Math.min(replenishAmount, availableInSource, spaceInPlayer);

            if (actualReplenished > 0) {
                // Transfer from source pool to player pool
                sourcePool[shrineType] -= actualReplenished;
                playerPool[shrineType] += actualReplenished;
                updateStoneCount(shrineType);

                // Sync resources in multiplayer
                syncPlayerState();

                updateStatus(`Shrine activated! Transferred ${actualReplenished} ${shrineType} stone${actualReplenished > 1 ? 's' : ''} from source to player pool. (Source: ${sourcePool[shrineType]}/${sourcePoolCapacity[shrineType]}, Player: ${playerPool[shrineType]}/${playerPoolCapacity[shrineType]}). AP restored.`);
            } else if (spaceInPlayer === 0) {
                updateStatus(`Shrine activated but player pool is full! (${playerPool[shrineType]}/${playerPoolCapacity[shrineType]}). AP restored.`);
            } else if (availableInSource === 0) {
                updateStatus(`Shrine activated but source pool is empty! (${sourcePool[shrineType]}/${sourcePoolCapacity[shrineType]}). AP restored.`);
            }
        }

        let activeTeleportIndicators = [];

        function updateCatacombIndicators() {
            // Remove existing indicators
            activeTeleportIndicators.forEach(ind => ind.remove());
            activeTeleportIndicators = [];

            // Only allow teleport indicators on the active player's turn
            if (typeof canTakeAction === 'function' && !canTakeAction()) return;

            // Check if player is on a catacomb shrine
            if (!playerPosition) return;

            const currentShrine = findShrineAtPosition(playerPosition.x, playerPosition.y);
            const freedomActive = spellSystem && spellSystem.scrollEffects
                && typeof spellSystem.scrollEffects.hasFreedomActive === 'function'
                && spellSystem.scrollEffects.hasFreedomActive();
            const elementalTypes = ['earth', 'water', 'fire', 'wind', 'void'];
            const isCatacombLike = (tile) => {
                if (!tile) return false;
                if (tile.shrineType === 'catacomb') return true;
                if (freedomActive && elementalTypes.includes(tile.shrineType)) return true;
                return false;
            };

            if (!currentShrine || !isCatacombLike(currentShrine)) return;

            // Find all other REVEALED catacomb shrines (not flipped) WITHOUT stones on them
            const otherCatacombs = placedTiles.filter(tile => {
                if (!isCatacombLike(tile)) return false;
                if (tile.flipped) return false; // Only revealed catacombs
                if (Math.abs(tile.x - currentShrine.x) <= 5 && Math.abs(tile.y - currentShrine.y) <= 5) return false; // Same catacomb
                
                // Check if there's a stone at the catacomb center
                const hasStone = placedStones.some(stone => {
                    const dist = Math.sqrt(Math.pow(stone.x - tile.x, 2) + Math.pow(stone.y - tile.y, 2));
                    return dist < 5; // Stone is at the center of this catacomb
                });

                // Check if another player is standing there
                const hasPlayer = playerPositions.some(p => {
                    if (!p) return false;
                    const dist = Math.sqrt(Math.pow(p.x - tile.x, 2) + Math.pow(p.y - tile.y, 2));
                    return dist < 5;
                });
                
                return !hasStone && !hasPlayer; // Only allow teleport to unoccupied shrines
            });

            if (otherCatacombs.length === 0) {
                const message = currentShrine.shrineType === 'catacomb'
                    ? '🔅 Standing on catacomb shrine, but no valid destinations! (must be revealed and have no stone on center)'
                    : '🔅 Freedom active, but no valid shrine destinations! (must be revealed and have no stone on center)';
                updateStatus(message);
                return;
            }

            // Create visual indicators for teleport destinations
            otherCatacombs.forEach(shrine => {
                const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                indicator.setAttribute('cx', shrine.x);
                indicator.setAttribute('cy', shrine.y);
                indicator.setAttribute('r', '15');
                indicator.setAttribute('fill', '#8b4513');
                indicator.setAttribute('opacity', '0.5');
                indicator.setAttribute('stroke', '#fff');
                indicator.setAttribute('stroke-width', '2');
                indicator.setAttribute('class', 'teleport-indicator');
                indicator.style.cursor = 'pointer';
                indicator.style.animation = 'pulse 1s infinite';

                // Add click handler for teleportation
                indicator.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (typeof canTakeAction === 'function' && !canTakeAction()) {
                        updateStatus('Not your turn.');
                        return;
                    }

                    // Double-check no stone was placed since indicators were created
                    const hasStoneNow = placedStones.some(stone => {
                        const dist = Math.sqrt(Math.pow(stone.x - shrine.x, 2) + Math.pow(stone.y - shrine.y, 2));
                        return dist < 5;
                    });
                    
                    if (hasStoneNow) {
                        updateStatus('🔅 Cannot teleport there - a stone is blocking!');
                        updateCatacombIndicators();
                        return;
                    }

                    // Double-check no player moved there since indicators were created
                    const hasPlayerNow = playerPositions.some(p => {
                        if (!p) return false;
                        const dist = Math.sqrt(Math.pow(p.x - shrine.x, 2) + Math.pow(p.y - shrine.y, 2));
                        return dist < 5;
                    });

                    if (hasPlayerNow) {
                        updateStatus('🔅 Cannot teleport there - another player is in the way!');
                        updateCatacombIndicators();
                        return;
                    }

                    // Teleport player (no AP cost)
                    placePlayer(shrine.x, shrine.y);
                    updateStatus(`🔅 Teleported to another catacomb shrine!`);

                    // Broadcast teleport so other clients stay in sync
                    if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                        const playerIndex = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                            ? myPlayerIndex
                            : activePlayerIndex;
                        broadcastGameAction('catacomb-teleport', {
                            playerIndex,
                            x: shrine.x,
                            y: shrine.y
                        });
                    }

                    // Update indicators for new position
                    updateCatacombIndicators();
                });

                viewport.appendChild(indicator);
                activeTeleportIndicators.push(indicator);
            });

            const prompt = currentShrine.shrineType === 'catacomb'
                ? '🔅 Standing on catacomb shrine. Click another revealed catacomb to teleport (free).'
                : '🔅 Freedom active. Click another revealed shrine to teleport (free).';
            updateStatus(prompt);
        }

        // Expose for scroll effects (e.g. Freedom)
        window.updateCatacombIndicators = updateCatacombIndicators;

        // Generate spiral tile positions starting from center
        // Based on the spiral pattern from the image: 1(center), 2(SE), 3(SW), 4(W), 5(NW), 6(NE), 7(E), then ring 2...
        function generateSpiralPositions(numTiles) {
            const positions = [];
            const largeHexSize = TILE_SIZE * 4; // Grid size for tile snapping

            // Predefined spiral path in axial coordinates (q, r)
            // 6 tiles per player (one of each shrine type)
            const spiralPath = [
                { q: 0, r: 0 },    // 1 - Center
                { q: 0, r: 1 },    // 2 - SE
                { q: -1, r: 1 },   // 3 - SW
                { q: -1, r: 0 },   // 4 - W
                { q: 0, r: -1 },   // 5 - NW
                { q: 1, r: -1 },   // 6 - NE (1 player complete - 6 tiles)
                { q: 1, r: 0 },    // 7 - E
                { q: 1, r: 1 },    // 8 - SE (ring 2)
                { q: 0, r: 2 },    // 9
                { q: -1, r: 2 },   // 10
                { q: -2, r: 2 },   // 11
                { q: -2, r: 1 },   // 12 (2 players complete - 12 tiles)
                { q: -2, r: 0 },   // 13
                { q: -1, r: -1 },  // 14
                { q: 0, r: -2 },   // 15
                { q: 1, r: -2 },   // 16
                { q: 2, r: -2 },   // 17
                { q: 2, r: -1 },   // 18 (3 players complete - 18 tiles)
                { q: 2, r: 0 },    // 19
                { q: 2, r: 1 },    // 20
                { q: 1, r: 2 },    // 21 (ring 3)
                { q: 0, r: 3 },    // 22
                { q: -1, r: 3 },   // 23
                { q: -2, r: 3 },   // 24 (4 players complete - 24 tiles)
                { q: -3, r: 3 },   // 25
                { q: -3, r: 2 },   // 26
                { q: -3, r: 1 },   // 27
                { q: -3, r: 0 },   // 28
                { q: -2, r: -1 },  // 29
                { q: -1, r: -2 },  // 30 (5 players complete - 30 tiles)
                { q: 0, r: -3 },   // 31 (extra positions for future)
                { q: 1, r: -3 },   // 32
                { q: 2, r: -3 },   // 33
                { q: 3, r: -3 },   // 34
                { q: 3, r: -2 },   // 35
                { q: 3, r: -1 },   // 36
            ];

            // Convert to pixel positions
            for (let i = 0; i < Math.min(numTiles, spiralPath.length); i++) {
                const pos = hexToPixel(spiralPath[i].q, spiralPath[i].r, largeHexSize);
                positions.push({ x: pos.x, y: pos.y });
            }

            return positions;
        }


