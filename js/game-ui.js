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
                        }
                    });

                    // Left-click also opens browser for convenience (gated)
                    card.addEventListener('click', (e) => {
                        if (typeof window !== 'undefined' && window.SHOW_SCROLL_DECK_BROWSER) {
                            showScrollDeckBrowser(element);
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

                // Click to view details
                scrollEl.addEventListener('click', () => {
                    showScrollInfoPopup(scrollName, scrollInfo, element);
                });

                container.appendChild(scrollEl);
            });
        }

        // Shared scroll info popup — used by common area and opponent active area
        function showScrollInfoPopup(scrollName, pattern, element) {
            const existing = document.getElementById('scroll-info-popup-overlay');
            if (existing) existing.remove();

            const elementColor = element === 'catacomb' ? '#9b59b6' : STONE_TYPES[element]?.color || '#aaa';
            const elementLabel = element ? element.charAt(0).toUpperCase() + element.slice(1) : 'Unknown';
            const elementImg   = STONE_TYPES[element]?.img || '';
            const scrollTitle  = pattern?.name || scrollName;
            const levelText    = pattern?.level ? `Level ${pattern.level}` : '';
            const description  = pattern?.description || 'No description available.';

            const overlay = document.createElement('div');
            overlay.id = 'scroll-info-popup-overlay';
            overlay.className = 'retro-dlg-overlay';
            overlay.style.zIndex = '2000';
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            const box = document.createElement('div');
            box.className = 'retro-dlg-box wide';
            box.style.cssText = `
                max-width: 380px;
                padding: 0;
                overflow: hidden;
                border: 2px solid ${elementColor};
                box-shadow: 0 0 24px ${elementColor}55, 0 4px 32px #000a;
            `;

            // ── Coloured header band ──────────────────────────────────
            const header = document.createElement('div');
            header.style.cssText = `
                background: ${elementColor}22;
                border-bottom: 2px solid ${elementColor};
                padding: 14px 18px 10px;
                display: flex;
                align-items: center;
                gap: 10px;
            `;
            if (elementImg) {
                const icon = document.createElement('img');
                icon.src = elementImg;
                icon.className = 'element-icon-sm';
                icon.alt = elementLabel;
                icon.style.cssText = 'width:28px;height:28px;object-fit:contain;flex-shrink:0;';
                header.appendChild(icon);
            }
            const headerText = document.createElement('div');
            headerText.style.cssText = 'flex:1;';
            headerText.innerHTML = `
                <div style="font-family:var(--font-pixel);font-size:11px;color:${elementColor};letter-spacing:2px;text-transform:uppercase;">${elementLabel}${levelText ? ' &nbsp;·&nbsp; ' + levelText : ''}</div>
                <div style="font-family:var(--font-terminal);font-size:20px;color:#e8dcc8;margin-top:3px;line-height:1.2;">${scrollTitle}</div>
            `;
            header.appendChild(headerText);
            box.appendChild(header);

            // ── Description ──────────────────────────────────────────
            const body = document.createElement('div');
            body.style.cssText = 'padding: 16px 18px 4px;';

            const desc = document.createElement('div');
            desc.style.cssText = `
                font-family: var(--font-terminal);
                font-size: 17px;
                color: #cfc9b8;
                line-height: 1.55;
                text-align: left;
            `;
            desc.textContent = description;
            body.appendChild(desc);
            box.appendChild(body);

            // ── Pattern visual ───────────────────────────────────────
            if (pattern?.patterns && typeof spellSystem?.createPatternVisual === 'function') {
                const sep = document.createElement('div');
                sep.style.cssText = `
                    margin: 14px 18px 0;
                    border-top: 1px solid ${elementColor}44;
                    padding-top: 12px;
                `;
                const patternLabel = document.createElement('div');
                patternLabel.style.cssText = `
                    font-family: var(--font-pixel);
                    font-size: 10px;
                    color: ${elementColor};
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    margin-bottom: 10px;
                    text-align: center;
                `;
                patternLabel.textContent = 'Stone Pattern';
                sep.appendChild(patternLabel);

                const patternWrap = document.createElement('div');
                patternWrap.style.cssText = 'display:flex;justify-content:center;padding-bottom:4px;';
                const visual = spellSystem.createPatternVisual(pattern, element);
                // Scale up the pattern SVG slightly for readability
                visual.style.transform = 'scale(1.3)';
                visual.style.transformOrigin = 'center top';
                visual.style.marginBottom = '20px';
                patternWrap.appendChild(visual);
                sep.appendChild(patternWrap);
                box.appendChild(sep);
            }

            // ── Close button ─────────────────────────────────────────
            const footer = document.createElement('div');
            footer.style.cssText = 'padding: 14px 18px 16px; text-align: center;';
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.className = 'retro-dlg-btn';
            closeBtn.onclick = () => overlay.remove();
            footer.appendChild(closeBtn);
            box.appendChild(footer);

            overlay.appendChild(box);
            document.body.appendChild(overlay);
        }
        // Expose globally so scroll-panels.js can call it
        window.showScrollInfoPopup = showScrollInfoPopup;

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
                        <button class="btn-shuffle">Shuffle Deck</button>
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
                    updateStatus(`${element.charAt(0).toUpperCase() + element.slice(1)} scroll deck shuffled!`);
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
                updateStatus(`Your hand is full (4 scrolls max)! Discard or use a scroll first.`);
                // Put scroll back
                deck.splice(index, 0, scrollName);
                return;
            }

            scrolls.hand.add(scrollName);
            spellSystem.updateScrollCount();
            updateScrollDeckUI();
            updateHUD();

            const scrollInfo = spellSystem.patterns?.[scrollName] || SCROLL_DEFINITIONS?.[scrollName];
            updateStatus(`Drew ${scrollInfo?.name || scrollName} from the ${element} deck!`);

            // Shuffle the deck after drawing (as requested)
            if (spellSystem.shuffleDeck) {
                spellSystem.shuffleDeck(deck);
                console.log(`📜 ${element} deck shuffled after drawing`);
            }

            // Broadcast so other clients update their deck/hand state
            if (isMultiplayer) {
                broadcastGameAction('scroll-collected', {
                    playerIndex: activePlayerIndex,
                    scrollName: scrollName,
                    shrineType: element
                });
                if (typeof syncPlayerState === 'function') syncPlayerState();
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
            updateApPips(currentAP);

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
                const hudPlayerDot  = document.getElementById('hud-player-dot');
                const hudPlayer     = hudPlayerName?.closest('.hud-player');
                if (hudPlayerName && typeof activePlayerIndex !== 'undefined') {
                    const isMyTurnNow = typeof isMultiplayer !== 'undefined' && isMultiplayer
                        && myPlayerIndex === activePlayerIndex;
                    if (isMyTurnNow) {
                        hudPlayerName.textContent = 'Your Turn';
                    } else {
                        const name = typeof getPlayerColorName === 'function'
                            ? getPlayerColorName(activePlayerIndex)
                            : `Player ${activePlayerIndex + 1}`;
                        hudPlayerName.textContent = `${name}'s Turn`;
                    }
                    if (hudPlayer) hudPlayer.classList.toggle('your-turn', isMyTurnNow);
                }

                // Update player dot color — must reflect the ACTIVE player, not the local player
                if (hudPlayerDot) {
                    const colorMap = {
                        'purple': '#9458f4',
                        'yellow': '#ffce00',
                        'red': '#ed1b43',
                        'blue': '#5894f4',
                        'green': '#69d83a'
                    };
                    // Prefer the active player's colour from allPlayersData
                    const activePlayerData = typeof allPlayersData !== 'undefined'
                        ? allPlayersData.find(p => p.player_index === activePlayerIndex)
                        : null;
                    const activeColorKey = activePlayerData?.color
                        || (typeof playerColor !== 'undefined' ? playerColor : null);
                    hudPlayerDot.style.background = (activeColorKey && colorMap[activeColorKey])
                        ? colorMap[activeColorKey]
                        : '#d9b08c';
                }
                // Update shrine dots for current player
                if (typeof activePlayerIndex !== 'undefined') {
                    updateShrineDots(activePlayerIndex);
                }
                // Update dock
                updateDockPlayers();
            } catch (e) {
                // Variables not ready yet
            }
        }

        function updateDockPlayers() {
            const container = document.getElementById('dock-players');
            if (!container) return;
            try {
                const pList = (typeof allPlayersData !== 'undefined' && allPlayersData?.length)
                    ? allPlayersData
                    : null;
                if (!pList) return;
                container.innerHTML = '';
                const colorMap = { purple:'#9458f4', yellow:'#ffce00', red:'#ed1b43', blue:'#5894f4', green:'#69d83a' };
                pList.forEach(p => {
                    const idx = p.player_index ?? 0;
                    const isActive = idx === (typeof activePlayerIndex !== 'undefined' ? activePlayerIndex : 0);
                    const card = document.createElement('div');
                    card.className = 'dock-player-card' + (isActive ? ' active-player' : '');
                    const color = colorMap[p.color] || '#888';
                    const apText = isActive ? ((typeof currentAP !== 'undefined' ? currentAP : '?') + 'AP') : '';
                    card.innerHTML = `<span class="dock-player-dot" style="background:${color};"></span><span class="dock-player-name">${p.username || ('P' + (idx + 1))}</span>${apText ? `<span class="dock-player-ap">${apText}</span>` : ''}`;
                    container.appendChild(card);
                });
            } catch (e) { /* not ready */ }
        }

        function updateShrineDots(playerIndex) {
            try {
                const scrollData = window.spellSystem?.playerScrolls?.[playerIndex];
                const activated = scrollData?.activated ?? new Set();
                ['earth', 'water', 'fire', 'wind', 'void'].forEach(el => {
                    const dot = document.getElementById('shrine-dot-' + el);
                    if (!dot) return;
                    dot.classList.toggle('complete', activated.has(el));
                });
            } catch (e) { /* spellSystem not ready */ }
        }

        function updateApPips(apValue) {
            document.querySelectorAll('.ap-pip').forEach(pip => {
                const n = parseInt(pip.dataset.pip, 10);
                pip.classList.toggle('filled', n <= apValue);
            });
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

            // Clean up any pre-existing ghost (prevents orphaned stamps if drag starts mid-drag)
            if (ghostStone) {
                ghostStone.remove();
                ghostStone = null;
            }

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

            const ghostImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            ghostImg.setAttribute('href', STONE_TYPES[type].img);
            ghostImg.setAttribute('x', -STONE_SIZE);
            ghostImg.setAttribute('y', -STONE_SIZE);
            ghostImg.setAttribute('width', STONE_SIZE * 2);
            ghostImg.setAttribute('height', STONE_SIZE * 2);
            ghostImg.style.mixBlendMode = 'screen';

            ghostStone.appendChild(circle);
            ghostStone.appendChild(ghostImg);
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
        let _statusFlashTimer = null;
        function updateStatus(msg) {
            if (msg === lastStatusMessage) return;
            lastStatusMessage = msg;
            const el = document.getElementById('status');
            if (!el) return;
            el.textContent = msg;
            // Brief gold flash to draw attention to new messages
            el.style.color = '#d9b08c';
            clearTimeout(_statusFlashTimer);
            _statusFlashTimer = setTimeout(() => { el.style.color = ''; }, 1800);
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
            overlay.className = 'retro-dlg-overlay';

            const modal = document.createElement('div');
            modal.className = 'retro-dlg-box';

            const title = document.createElement('div');
            title.textContent = 'Out of AP';
            title.className = 'retro-dlg-title';
            modal.appendChild(title);

            const message = document.createElement('div');
            message.textContent = "You're out of AP. Do you want to end your turn?";
            message.className = 'retro-dlg-line';
            modal.appendChild(message);

            const btnRow = document.createElement('div');
            btnRow.className = 'retro-dlg-btns';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Keep Playing';
            cancelBtn.className = 'retro-dlg-btn cancel';
            cancelBtn.onclick = () => overlay.remove();

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = 'End Turn';
            confirmBtn.className = 'retro-dlg-btn ok';
            confirmBtn.onclick = () => { overlay.remove(); endTurnBtn.click(); };

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

            // Delegated click handler for scroll card popups — added once per container.
            // innerHTML = '' only clears children, not listeners on the container itself,
            // so we guard with a data flag to avoid stacking listeners on re-calls.
            const attachScrollDelegate = (container) => {
                if (!container || container.dataset.scrollDelegated) return;
                container.dataset.scrollDelegated = 'true';
                container.addEventListener('click', (e) => {
                    const sc = e.target.closest('.opponent-scroll-card[data-scroll-name]');
                    if (!sc) return;
                    const sName = sc.dataset.scrollName;
                    showScrollInfoPopup(sName, spellSystem.patterns[sName], spellSystem.getScrollElement(sName));
                });
            };
            attachScrollDelegate(cardsContainer);
            attachScrollDelegate(newCardsContainer);

            // Build ordered list: self first, then others
            const playerOrder = [];
            playerOrder.push(myPlayerIndex);
            for (let i = 0; i < totalPlayers; i++) {
                if (i !== myPlayerIndex) playerOrder.push(i);
            }

            for (const i of playerOrder) {
                const isSelf = (i === myPlayerIndex);
                const playerData = allPlayersData.find(p => p.player_index === i);
                const playerName = getPlayerColorName(i);
                const playerColor = playerData ? PLAYER_COLORS[playerData.color] : '#666';
                const isActiveTurn = (i === activePlayerIndex);

                // Get player resources
                const pool = playerPools[i] || { earth: 0, water: 0, fire: 0, wind: 0, void: 0 };
                const ap = playerAPs[i] || { currentAP: 5, voidAP: 0 };
                const scrollData = spellSystem.playerScrolls[i] || { hand: new Set(), active: new Set(), activated: new Set() };

                const card = document.createElement('div');
                card.className = 'opponent-card' + (isActiveTurn ? ' active-turn' : '') + (isSelf ? ' self-card' : '');
                card.style.borderLeftColor = playerColor;

                // Header with name and AP
                const header = document.createElement('div');
                header.className = 'opponent-header';
                header.innerHTML = `
                    <span class="opponent-name" style="color: ${playerColor};">${playerName}${isSelf ? ' (you)' : ''}</span>
                    <span class="opponent-ap">AP: ${ap.currentAP}${ap.voidAP > 0 ? ` +${ap.voidAP}<img src="images/voidsymbol.png${IMG_V}" class="element-icon-sm" alt="void" style="vertical-align:middle;">` : ''}</span>
                `;
                card.appendChild(header);

                // Stones
                const stonesDiv = document.createElement('div');
                stonesDiv.className = 'opponent-stones';
                const stoneElements = ['earth', 'water', 'fire', 'wind', 'void'];
                let hasStones = false;
                stoneElements.forEach(element => {
                    if (pool[element] > 0) {
                        hasStones = true;
                        const stoneSpan = document.createElement('span');
                        stoneSpan.className = 'opponent-stone';
                        stoneSpan.style.color = STONE_TYPES[element].color;
                        stoneSpan.innerHTML = `<img src="${STONE_TYPES[element].img}" class="element-icon-sm" alt="${element}"> ${element}: ${pool[element]}/5`;
                        stonesDiv.appendChild(stoneSpan);
                    }
                });
                if (!hasStones) {
                    stonesDiv.innerHTML = '<span class="opponent-no-stones">No stones</span>';
                }
                card.appendChild(stonesDiv);

                // Win condition progress
                const activated = scrollData.activated ? scrollData.activated : new Set();
                const activatedCount = activated.size;
                const winDiv = document.createElement('div');
                winDiv.className = 'opponent-win-progress';
                const activatedSymbols = ['earth', 'water', 'fire', 'wind', 'void'].map(el => {
                    const done = activated.has(el);
                    const img = STONE_TYPES[el]?.img || '';
                    return `<img src="${img}" class="element-icon-sm win-pip${done ? ' win-pip-active' : ''}" alt="${el}" title="${el}">`;
                }).join('');
                winDiv.innerHTML = `<span class="opponent-win-label">Elements:</span> ${activatedSymbols} <span class="opponent-win-count">${activatedCount}/5</span>`;
                card.appendChild(winDiv);

                // Scrolls summary (hand count only - hand contents are private)
                const handSize = scrollData.hand ? scrollData.hand.size : 0;
                const activeSize = scrollData.active ? scrollData.active.size : 0;

                const scrollsSummary = document.createElement('div');
                scrollsSummary.className = 'opponent-scrolls-summary';
                scrollsSummary.textContent = `Hand: ${handSize} scroll${handSize !== 1 ? 's' : ''} (hidden)`;
                card.appendChild(scrollsSummary);

                // Active scrolls (visible to opponents)
                if (activeSize > 0) {
                    const activeScrollsDiv = document.createElement('div');
                    activeScrollsDiv.className = 'opponent-active-scrolls';

                    const activeTitle = document.createElement('div');
                    activeTitle.className = 'opponent-active-scrolls-title';
                    activeTitle.textContent = `Active Area (${activeSize}):`;
                    activeScrollsDiv.appendChild(activeTitle);

                    scrollData.active.forEach(scrollName => {
                        const pattern = spellSystem.patterns[scrollName];
                        const element = spellSystem.getScrollElement(scrollName);
                        const elementColor = element === 'catacomb' ? '#9b59b6' : STONE_TYPES[element]?.color || '#666';
                        const elementIconHTML = `<img src="${STONE_TYPES[element]?.img || ''}" class="element-icon-sm" alt="${element}" style="vertical-align:middle;">`;

                        const scrollCard = document.createElement('div');
                        scrollCard.className = 'opponent-scroll-card';
                        scrollCard.style.cursor = 'pointer';
                        scrollCard.title = 'Click to view scroll details';
                        scrollCard.dataset.scrollName = scrollName; // stored for clone re-wiring
                        scrollCard.innerHTML = `
                            <div class="opponent-scroll-name">${pattern ? pattern.name : scrollName}</div>
                            <div class="opponent-scroll-element" style="color: ${elementColor};">
                                ${elementIconHTML} ${element ? element.charAt(0).toUpperCase() + element.slice(1) : 'Unknown'}
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
                        // Click handled by delegated listener on the container (see attachScrollDelegate above)
                        activeScrollsDiv.appendChild(scrollCard);
                    });

                    card.appendChild(activeScrollsDiv);
                }

                if (cardsContainer) cardsContainer.appendChild(card);
                // Clone into new UI container — delegation listener on the container
                // handles clicks so no per-card event wiring is needed on the clone.
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
            // Reset ID counters so each new game starts from 1 (prevents cross-game ID drift).
            // Both clients must reset in sync — clearBoard is called from startMultiplayerGame
            // before any tile/stone placement, so this is safe.
            if (typeof nextTileId !== 'undefined') nextTileId = 1;
            if (typeof nextStoneId !== 'undefined') nextStoneId = 1;
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
                        updateStatus('Blocked by another player');
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
                                color: playerColor,
                                cosmetics: window.cosmeticsSystem?.getEquippedAll() || null
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
                    updateStatus('Player tiles must touch at least 2 unrevealed tiles!');
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

                // Remove ghost FIRST — prevents orphaned ghost stamps if anything below throws
                ghostStone.remove();
                ghostStone = null;
                isDraggingStone = false;
                snapIndicator.classList.remove('active');

                const capturedStoneId = draggedStoneId;
                const capturedStoneType = draggedStoneType;
                const capturedOriginalPos = draggedStoneOriginalPos;
                draggedStoneId = null;
                draggedStoneType = null;
                draggedStoneOriginalPos = null;

                const stonePos = findValidStonePosition(world.x, world.y);
                if (stonePos.valid) {
                    if (capturedStoneId === null) {
                        placeStone(stonePos.x, stonePos.y, capturedStoneType);
                        console.log(`📤 Placing stone from deck: type=${capturedStoneType}, before=${stoneCounts[capturedStoneType]}`);
                        stoneCounts[capturedStoneType]--;
                        console.log(`📤 After decrement: ${capturedStoneType}=${stoneCounts[capturedStoneType]}, playerPool.${capturedStoneType}=${playerPool[capturedStoneType]}`);
                        updateStoneCount(capturedStoneType);

                        // Sync resources after placing stone
                        syncPlayerState();
                        updateStatus('Placed ' + capturedStoneType + ' stone');
                    } else {
                        placeMovedStone(stonePos.x, stonePos.y, capturedStoneType, capturedStoneId);
                        if (isMultiplayer) {
                            broadcastGameAction('stone-move', {
                                stoneId: capturedStoneId,
                                x: stonePos.x,
                                y: stonePos.y,
                                stoneType: capturedStoneType
                            });
                        }
                        updateStatus('Moved ' + capturedStoneType + ' stone');
                    }
                } else {
                    if (capturedStoneId !== null) {
                        // Was a placed stone, couldn't place back
                        if (capturedOriginalPos) {
                            placeMovedStone(capturedOriginalPos.x, capturedOriginalPos.y, capturedStoneType, capturedStoneId);
                            updateStatus('Invalid placement! Stone returned to original spot.');
                        } else {
                            returnStoneToPool(capturedStoneType);
                        }
                    }
                }
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

                    // Tutorial gate: only allow movement to the designated hex(es)
                    const tutorialBlocked = window.isTutorialMode && window.tutorialAllowedHexes &&
                        ![...window.tutorialAllowedHexes].some(key => {
                            const [ax, ay] = key.split(',').map(Number);
                            return Math.abs(ax - finalPos.x) < 70 && Math.abs(ay - finalPos.y) < 70;
                        });

                    if (cannotEndTurnHere) {
                        console.log(`❌ Movement rejected: Cannot end turn on ${stoneAtFinal.type} stone at (${finalPos.x.toFixed(1)}, ${finalPos.y.toFixed(1)})`);
                        placePlayer(startPos.x, startPos.y);
                        updateStatus('Cannot end movement on a ' + stoneAtFinal.type + ' stone!');
                    } else if (tutorialBlocked) {
                        placePlayer(startPos.x, startPos.y);
                        if (window.TutorialMode) window.TutorialMode.showMovementHint();
                    } else if (moveCheck.canMove && totalCost <= getTotalAP()) {
                        console.log(`✅ Movement successful: ${playerPath.length - 1} hexes, cost ${totalCost} AP`);
                        // Store the last move for undo
                        lastMove = {
                            prevPos: { x: startPos.x, y: startPos.y },
                            newPos: { x: finalPos.x, y: finalPos.y },
                            apCost: totalCost
                        };
                        placePlayer(finalPos.x, finalPos.y);
                        // Notify tutorial that the player has moved
                        if (window.isTutorialMode && window.TutorialMode?.onPlayerMoved) {
                            window.TutorialMode.onPlayerMoved(finalPos.x, finalPos.y);
                        }
                        // Update Steam Vents alternation state before spending AP
                        if (typeof commitSteamVentsState === 'function') commitSteamVentsState(playerPath);
                        spendAP(totalCost); // Use void AP first, then regular AP

                        // Broadcast player movement to other players
                        broadcastGameAction('player-move', {
                            playerIndex: activePlayerIndex,
                            x: finalPos.x,
                            y: finalPos.y,
                            apSpent: totalCost,
                            cosmetics: window.cosmeticsSystem?.getEquippedAll() || null
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

                const centerX = boardSvg.clientWidth / 2;
                const centerY = boardSvg.clientHeight / 2;

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
                                    color: playerColor,
                                    cosmetics: window.cosmeticsSystem?.getEquippedAll() || null
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
                                updateStatus('Tiles cannot be moved in multiplayer.');
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
                    // Remove ghost FIRST — prevents orphaned ghost stamps if anything below throws
                    viewport.removeChild(ghostStone);
                    ghostStone = null;
                    isDraggingStone = false;
                    snapIndicator.classList.remove('active');

                    const capturedStoneId = draggedStoneId;
                    const capturedStoneType = draggedStoneType;
                    draggedStoneId = null;
                    draggedStoneType = null;

                    const stonePos = findValidStonePosition(world.x, world.y);
                    if (stonePos.valid) {
                        placeStone(stonePos.x, stonePos.y, capturedStoneType);

                        if (capturedStoneId === null) {
                            playerPool[capturedStoneType]--;
                            updateStoneCountDisplay(capturedStoneType);
                            syncPlayerState();
                        }
                        // Note: placeStone already calls broadcastGameAction('stone-place', ...) internally.
                    } else if (capturedStoneId !== null) {
                        playerPool[capturedStoneType]++;
                        updateStoneCountDisplay(capturedStoneType);
                        syncPlayerState();
                    }
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
                                    apSpent: totalCost,
                                    cosmetics: window.cosmeticsSystem?.getEquippedAll() || null
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

            // Block end-turn if the player has an unresolved scroll cascade.
            // They must choose where to place the overflowing scroll before ending.
            const turnPlayerIdx = isMultiplayer ? myPlayerIndex : activePlayerIndex;
            if (spellSystem && spellSystem.hasPendingCascade(turnPlayerIdx)) {
                updateStatus('Resolve your pending scroll cascade before ending your turn!');
                spellSystem.showPendingCascadePrompt(turnPlayerIdx);
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

            // Tutorial hook — fires after shrine stone collection so the tutorial
            // can detect which shrine the player just ended their turn on.
            if (window.isTutorialMode && window.TutorialMode?.onEndTurn) {
                window.TutorialMode.onEndTurn(playerPosition);
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
                        // Guard: skip null/undefined entries (e.g. sparse indices after a player disconnects)
                        const sortedPlayers = playerPositions
                            .map((p, idx) => ({ index: idx, color: p?.color, rank: COLOR_RANK[p?.color] || 999 }))
                            .filter((_, idx) => playerPositions[idx] != null)
                            .sort((a, b) => a.rank - b.rank);
                        if (sortedPlayers.length === 0) {
                            console.warn('⚠️ sortedPlayers is empty — cannot advance turn');
                            isEndingTurn = false;
                            return;
                        }
                        let currentSortedIndex = sortedPlayers.findIndex(p => p.index === activePlayerIndex);
                        if (currentSortedIndex === -1) {
                            console.warn('⚠️ activePlayerIndex', activePlayerIndex, 'not found in sortedPlayers — defaulting to first player');
                            currentSortedIndex = sortedPlayers.length - 1; // will wrap to 0
                        }
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
                        // Reflect fires first, then Psychic fires after all reflects fully resolve.
                        // Both use sequential onComplete chaining for interactive scrolls.
                        const reflectResult = spellSystem?.scrollEffects?.processReflectPending
                            ? spellSystem.scrollEffects.processReflectPending(activePlayerIndex, () => {
                                // All reflects done — now run Psychic stolen scrolls
                                if (spellSystem?.scrollEffects?.processPsychicPending) {
                                    spellSystem.scrollEffects.processPsychicPending(activePlayerIndex);
                                }
                              })
                            : null;
                        // If no reflects, start Psychic immediately
                        if (reflectResult === null && spellSystem?.scrollEffects?.processPsychicPending) {
                            spellSystem.scrollEffects.processPsychicPending(activePlayerIndex);
                        }
                        // Excavate teleport: if this player has a pending teleport, trigger it
                        if (spellSystem?.scrollEffects?.processExcavateTeleport) {
                            spellSystem.scrollEffects.processExcavateTeleport(activePlayerIndex);
                        }
                        // AP resets at the start of the new player's turn (only for the new active player)
                        if (activePlayerIndex === myPlayerIndex) {
                            currentAP = 5;
                            document.getElementById('ap-count').textContent = currentAP;
                            updateApPips(currentAP);
                            refreshVoidAP();
                            syncPlayerState();
                        }

                        // Note: reflect-triggered and psychic-triggered broadcasts are both sent
                        // inside processReflectPending/processPsychicPending respectively
                        // (one per scroll, immediately before its interactive selection begins), so
                        // remote clients receive them in order and can queue them sequentially.
                        if (isMultiplayer) {
                            if (Array.isArray(reflectResult) && typeof syncPlayerState === 'function') {
                                syncPlayerState();
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
                        updateApPips(currentAP);
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

                // Sort players by rank — guard against null/undefined entries (sparse indices after disconnect)
                const sortedPlayers = playerPositions
                    .map((p, idx) => ({ index: idx, color: p?.color, rank: COLOR_RANK[p?.color] || 999 }))
                    .filter((_, idx) => playerPositions[idx] != null)
                    .sort((a, b) => a.rank - b.rank);

                if (sortedPlayers.length === 0) {
                    console.warn('⚠️ sortedPlayers is empty — cannot advance turn (no placed player positions)');
                    isEndingTurn = false;
                    return;
                }

                // Find current player in sorted list
                let currentSortedIndex = sortedPlayers.findIndex(p => p.index === activePlayerIndex);
                if (currentSortedIndex === -1) {
                    console.warn('⚠️ activePlayerIndex', activePlayerIndex, 'not in sortedPlayers — defaulting to first player. Sorted:', sortedPlayers);
                    currentSortedIndex = sortedPlayers.length - 1; // wraps to 0 below
                }

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
                // Reflect fires first, then Psychic fires after all reflects fully resolve.
                const reflectResult = spellSystem?.scrollEffects?.processReflectPending
                    ? spellSystem.scrollEffects.processReflectPending(activePlayerIndex, () => {
                        // All reflects done — now run Psychic stolen scrolls
                        if (spellSystem?.scrollEffects?.processPsychicPending) {
                            spellSystem.scrollEffects.processPsychicPending(activePlayerIndex);
                        }
                      })
                    : null;
                // If no reflects, start Psychic immediately
                if (reflectResult === null && spellSystem?.scrollEffects?.processPsychicPending) {
                    spellSystem.scrollEffects.processPsychicPending(activePlayerIndex);
                }
                // Excavate teleport: if this player has a pending teleport, trigger it
                if (spellSystem?.scrollEffects?.processExcavateTeleport) {
                    spellSystem.scrollEffects.processExcavateTeleport(activePlayerIndex);
                }

                // AP resets at the start of the new player's turn (only for the new active player)
                if (activePlayerIndex === myPlayerIndex) {
                    currentAP = 5;
                    document.getElementById('ap-count').textContent = currentAP;
                    updateApPips(currentAP);
                    refreshVoidAP();
                    syncPlayerState();
                }

                // Note: reflect-triggered and psychic-triggered broadcasts are both handled
                // inside processReflectPending/processPsychicPending respectively
                if (isMultiplayer) {
                    if (Array.isArray(reflectResult) && typeof syncPlayerState === 'function') {
                        syncPlayerState();
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
                // Reflect fires first, then Psychic fires after all reflects fully resolve.
                const reflectResultSingle = spellSystem?.scrollEffects?.processReflectPending
                    ? spellSystem.scrollEffects.processReflectPending(activePlayerIndex, () => {
                        if (spellSystem?.scrollEffects?.processPsychicPending) {
                            spellSystem.scrollEffects.processPsychicPending(activePlayerIndex);
                        }
                      })
                    : null;
                if (reflectResultSingle === null && spellSystem?.scrollEffects?.processPsychicPending) {
                    spellSystem.scrollEffects.processPsychicPending(activePlayerIndex);
                }
                // Excavate teleport for single player
                if (spellSystem?.scrollEffects?.processExcavateTeleport) {
                    spellSystem.scrollEffects.processExcavateTeleport(activePlayerIndex);
                }
                // AP resets at start of new turn
                currentAP = 5;
                document.getElementById('ap-count').textContent = currentAP;
                updateApPips(currentAP);
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

        // scroll-inventory replaced by panel-btn-hand/active/common in scroll-panels.js
        const _legacyScrollBtn = document.getElementById('scroll-inventory');
        if (_legacyScrollBtn) _legacyScrollBtn.onclick = () => spellSystem.showInventory();

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
                && spellSystem.scrollEffects.hasFreedomActive(myPlayerIndex);
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
                    ? 'Standing on catacomb shrine, but no valid destinations! (must be revealed and have no stone on center)'
                    : 'Freedom active, but no valid shrine destinations! (must be revealed and have no stone on center)';
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
                        updateStatus('Cannot teleport there - a stone is blocking!');
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
                        updateStatus('Cannot teleport there - another player is in the way!');
                        updateCatacombIndicators();
                        return;
                    }

                    // Teleport player (no AP cost)
                    placePlayer(shrine.x, shrine.y);
                    updateStatus(`Teleported to another catacomb shrine!`);

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
                ? 'Standing on catacomb shrine. Click another revealed catacomb to teleport (free).'
                : 'Freedom active. Click another revealed shrine to teleport (free).';
            updateStatus(prompt);
        }

        // Expose for scroll effects (e.g. Freedom)
        window.updateCatacombIndicators = updateCatacombIndicators;

        // ── Scroll Reference Panel ────────────────────────────────────────────────
        // Read-only in-game encyclopedia of all scrolls pulled from scroll-definitions.js.
        // Toggling calls remove so the button acts as open/close.
        function showScrollReferencePopup() {
            const existing = document.getElementById('scroll-ref-overlay');
            if (existing) { existing.remove(); return; }

            const ELEMENT_ORDER = ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'];
            const elementColor = (el) => el === 'catacomb' ? '#c8a870' : (STONE_TYPES[el]?.color || '#aaa');

            const overlay = document.createElement('div');
            overlay.id = 'scroll-ref-overlay';
            overlay.className = 'retro-dlg-overlay';
            overlay.style.zIndex = '2000';
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

            const box = document.createElement('div');
            box.className = 'retro-dlg-box';
            box.style.cssText = `
                max-width: 540px; width: 95vw; max-height: 85vh;
                display: flex; flex-direction: column;
                padding: 0; overflow: hidden;
            `;

            // Header
            const header = document.createElement('div');
            header.style.cssText = `
                padding: 12px 16px; border-bottom: 1px solid #333;
                display: flex; align-items: center; justify-content: space-between;
                flex-shrink: 0;
            `;
            const titleEl = document.createElement('div');
            titleEl.textContent = 'Scroll Reference';
            titleEl.style.cssText = `font-family: var(--font-pixel); font-size: 12px; color: #e8dcc8; letter-spacing: 1px;`;
            const closeX = document.createElement('button');
            closeX.textContent = '×';
            closeX.className = 'retro-dlg-btn';
            closeX.style.cssText = `padding: 1px 10px; font-size: 20px; line-height: 1;`;
            closeX.onclick = () => overlay.remove();
            header.appendChild(titleEl);
            header.appendChild(closeX);
            box.appendChild(header);

            // Tab bar
            const tabBar = document.createElement('div');
            tabBar.style.cssText = `
                display: flex; flex-wrap: wrap; gap: 2px;
                padding: 8px 10px 0; background: #111; flex-shrink: 0;
                border-bottom: 1px solid #2a2a2a;
            `;
            ELEMENT_ORDER.forEach(el => {
                const c = elementColor(el);
                const tab = document.createElement('button');
                tab.dataset.element = el;
                tab.textContent = el.charAt(0).toUpperCase() + el.slice(1);
                tab.style.cssText = `
                    font-family: var(--font-pixel); font-size: 9px;
                    padding: 6px 11px; border: 1px solid ${c}44;
                    background: transparent; color: ${c}88; cursor: pointer;
                    border-radius: 3px 3px 0 0; letter-spacing: 1px;
                `;
                tab.addEventListener('click', () => switchTab(el));
                tabBar.appendChild(tab);
            });
            box.appendChild(tabBar);

            // Scroll list content
            const content = document.createElement('div');
            content.style.cssText = `overflow-y: auto; flex: 1; padding: 12px 14px;`;
            box.appendChild(content);

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            function switchTab(el) {
                const c = elementColor(el);

                // Update tab button styles
                tabBar.querySelectorAll('button[data-element]').forEach(btn => {
                    const bc = elementColor(btn.dataset.element);
                    const active = btn.dataset.element === el;
                    btn.style.background  = active ? `${bc}1a` : 'transparent';
                    btn.style.color       = active ? bc : `${bc}88`;
                    btn.style.borderColor = active ? bc : `${bc}44`;
                });

                // Build list
                content.innerHTML = '';
                const scrollNames = (typeof SCROLL_DECKS !== 'undefined' && SCROLL_DECKS[el]) || [];

                if (scrollNames.length === 0) {
                    content.innerHTML = `<div style="color:#555;font-family:var(--font-terminal);padding:20px;text-align:center;">No scrolls found.</div>`;
                    return;
                }

                scrollNames.forEach(scrollName => {
                    const pattern = spellSystem?.patterns?.[scrollName];
                    if (!pattern) return;

                    const card = document.createElement('div');
                    card.style.cssText = `
                        border-left: 3px solid ${c}; background: ${c}0d;
                        border-radius: 0 4px 4px 0; padding: 10px 12px;
                        margin-bottom: 8px; cursor: pointer;
                    `;
                    card.title = 'Click to see stone pattern';
                    card.addEventListener('click', () => showScrollInfoPopup(scrollName, pattern, el));

                    // Name + level row
                    const nameRow = document.createElement('div');
                    nameRow.style.cssText = `display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;`;

                    const nameEl = document.createElement('span');
                    nameEl.textContent = pattern.name;
                    nameEl.style.cssText = `font-family: var(--font-terminal); font-size: 17px; color: ${c};`;

                    const lvl = document.createElement('span');
                    lvl.textContent = `Lv ${pattern.level}`;
                    lvl.style.cssText = `font-family: var(--font-pixel); font-size: 8px; color: #666; letter-spacing: 1px;`;

                    nameRow.appendChild(nameEl);
                    nameRow.appendChild(lvl);
                    card.appendChild(nameRow);

                    const descEl = document.createElement('div');
                    descEl.textContent = pattern.description;
                    descEl.style.cssText = `font-family: var(--font-terminal); font-size: 14px; color: #aaa; line-height: 1.45;`;
                    card.appendChild(descEl);

                    const hint = document.createElement('div');
                    hint.textContent = 'click for pattern';
                    hint.style.cssText = `font-family: var(--font-pixel); font-size: 7px; color: ${c}55; margin-top: 5px; letter-spacing: 1px;`;
                    card.appendChild(hint);

                    content.appendChild(card);
                });
            }

            switchTab('earth');
        }

        window.showScrollReferencePopup = showScrollReferencePopup;

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

        // ─── Hidden cheat panel ──────────────────────────────────────────────
        // Activate: click the "AP" label in the HUD 5 times within 3 seconds
        (function initCheatPanel() {
            let clickCount = 0;
            let clickTimer = null;

            function openCheatPanel() {
                const existing = document.getElementById('cheat-panel');
                if (existing) { existing.remove(); return; }

                const panel = document.createElement('div');
                panel.id = 'cheat-panel';
                Object.assign(panel.style, {
                    position: 'fixed',
                    bottom: '60px',
                    right: '16px',
                    background: '#1a1a2e',
                    border: '1px solid #444',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    zIndex: '9999',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                    minWidth: '240px',
                    maxWidth: '280px'
                });

                function makeBtn(label, action) {
                    const btn = document.createElement('button');
                    btn.textContent = label;
                    Object.assign(btn.style, {
                        padding: '6px 10px',
                        background: '#2d2d44',
                        color: '#eee',
                        border: '1px solid #555',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        textAlign: 'left'
                    });
                    btn.onclick = action;
                    return btn;
                }

                panel.appendChild(makeBtn('Fill Stones', () => {
                    if (typeof window.fillstones === 'function') window.fillstones();
                }));
                panel.appendChild(makeBtn('Toggle Deck Browser', () => {
                    if (typeof window.showdeck === 'function') window.showdeck();
                }));

                // Place Anywhere toggle — uses the same globalPlacement buff as Avalanche,
                // but with expiresThisTurn:false so it persists until toggled off.
                const placeAnywhereBtn = makeBtn('Place Anywhere: OFF', () => {
                    if (!spellSystem || !spellSystem.scrollEffects) {
                        updateStatus('spellSystem not ready');
                        return;
                    }
                    const idx = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                        ? myPlayerIndex : activePlayerIndex;
                    const buff = spellSystem.scrollEffects.activeBuffs.globalPlacement;
                    if (buff && buff.playerIndex === idx && buff.cheatPersist) {
                        // Turn off
                        spellSystem.scrollEffects.activeBuffs.globalPlacement = null;
                        placeAnywhereBtn.textContent = 'Place Anywhere: OFF';
                        placeAnywhereBtn.style.color = '#eee';
                        updateStatus('Place anywhere: OFF');
                    } else {
                        // Turn on
                        spellSystem.scrollEffects.activeBuffs.globalPlacement = {
                            playerIndex: idx,
                            expiresThisTurn: false,
                            cheatPersist: true   // flag so we can toggle it off
                        };
                        placeAnywhereBtn.textContent = 'Place Anywhere: ON';
                        placeAnywhereBtn.style.color = '#6ef';
                        updateStatus('Place anywhere: ON — stones may be placed on any empty tile');
                    }
                });
                panel.appendChild(placeAnywhereBtn);

                // ── Overlay Editor ───────────────────────────────────────────
                const overlaySection = document.createElement('div');
                overlaySection.style.cssText = 'border-top:1px solid #444;padding-top:8px;display:flex;flex-direction:column;gap:6px;';

                const overlayTitle = document.createElement('div');
                overlayTitle.textContent = '🖼 Tile Image Overlays';
                overlayTitle.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;cursor:pointer;user-select:none;';
                let overlayOpen = false;
                const overlayBody = document.createElement('div');
                overlayBody.style.cssText = 'display:none;flex-direction:column;gap:6px;';
                overlayTitle.onclick = () => {
                    overlayOpen = !overlayOpen;
                    overlayBody.style.display = overlayOpen ? 'flex' : 'none';
                };
                overlaySection.appendChild(overlayTitle);
                overlaySection.appendChild(overlayBody);

                const ELEMENTS = ['earth', 'fire', 'water', 'wind', 'void', 'catacomb'];
                const EL_COLORS = { earth:'#69d83a', fire:'#ed1b43', water:'#5894f4', wind:'#ffce00', void:'#9458f4', catacomb:'#aaa' };
                let selectedEl = 'earth';

                // Element selector pills
                const pillRow = document.createElement('div');
                pillRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
                const pills = {};
                ELEMENTS.forEach(el => {
                    const pill = document.createElement('button');
                    pill.textContent = el;
                    pill.style.cssText = `padding:2px 6px;border-radius:10px;border:1px solid ${EL_COLORS[el]};background:#1a1a2e;color:${EL_COLORS[el]};font-size:11px;cursor:pointer;`;
                    pill.onclick = () => { selectedEl = el; refreshOverlayControls(); highlightPill(); };
                    pills[el] = pill;
                    pillRow.appendChild(pill);
                });
                overlayBody.appendChild(pillRow);

                function highlightPill() {
                    ELEMENTS.forEach(el => {
                        pills[el].style.background = el === selectedEl ? EL_COLORS[el] : '#1a1a2e';
                        pills[el].style.color = el === selectedEl ? '#111' : EL_COLORS[el];
                    });
                }
                highlightPill();

                // Image src input
                const srcRow = document.createElement('div');
                srcRow.style.cssText = 'display:flex;gap:4px;align-items:center;';
                const srcLabel = document.createElement('span');
                srcLabel.textContent = 'Src:';
                srcLabel.style.cssText = 'font-size:11px;color:#aaa;width:30px;flex-shrink:0;';
                const srcInput = document.createElement('input');
                srcInput.type = 'text';
                srcInput.placeholder = 'images/tiles/earth.png';
                srcInput.style.cssText = 'flex:1;background:#111;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 5px;font-size:11px;';
                srcInput.onchange = () => {
                    if (window.tileOverlaySettings?.[selectedEl]) {
                        window.tileOverlaySettings[selectedEl].src = srcInput.value.trim();
                        window.refreshAllTileOverlays?.();
                    }
                };
                srcRow.appendChild(srcLabel);
                srcRow.appendChild(srcInput);
                overlayBody.appendChild(srcRow);

                // Slider helper
                function makeOverlaySlider(label, min, max, step, key) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:5px;';
                    const lbl = document.createElement('span');
                    lbl.textContent = label;
                    lbl.style.cssText = 'font-size:11px;color:#aaa;width:38px;flex-shrink:0;';
                    const slider = document.createElement('input');
                    slider.type = 'range';
                    slider.min = min; slider.max = max; slider.step = step;
                    slider.style.cssText = 'flex:1;accent-color:#6ef;min-width:0;';
                    const val = document.createElement('span');
                    val.style.cssText = 'font-size:11px;color:#eee;width:36px;text-align:right;flex-shrink:0;';
                    slider.oninput = () => {
                        const v = parseFloat(slider.value);
                        val.textContent = step < 1 ? v.toFixed(2) : Math.round(v);
                        if (window.tileOverlaySettings?.[selectedEl]) {
                            window.tileOverlaySettings[selectedEl][key] = v;
                            window.refreshAllTileOverlays?.();
                        }
                    };
                    row.appendChild(lbl); row.appendChild(slider); row.appendChild(val);
                    overlayBody.appendChild(row);
                    return { slider, val };
                }

                const sliders = {
                    x:        makeOverlaySlider('X',       -80,  80,  1,    'x'),
                    y:        makeOverlaySlider('Y',       -80,  80,  1,    'y'),
                    rotation:    makeOverlaySlider('Rotate',  0,   360, 1,    'rotation'),
                    scale:       makeOverlaySlider('Scale',   0.1, 3,   0.05, 'scale'),
                    opacity:     makeOverlaySlider('Opacity', 0,   1,   0.01, 'opacity'),
                    tintOpacity: makeOverlaySlider('Tint',    0,   1,   0.01, 'tintOpacity'),
                };

                function refreshOverlayControls() {
                    const s = window.tileOverlaySettings?.[selectedEl];
                    if (!s) return;
                    srcInput.value = s.src || '';
                    sliders.x.slider.value = s.x;               sliders.x.val.textContent = s.x;
                    sliders.y.slider.value = s.y;               sliders.y.val.textContent = s.y;
                    sliders.rotation.slider.value = s.rotation; sliders.rotation.val.textContent = s.rotation;
                    sliders.scale.slider.value = s.scale;       sliders.scale.val.textContent = s.scale.toFixed(2);
                    sliders.opacity.slider.value = s.opacity;   sliders.opacity.val.textContent = s.opacity.toFixed(2);
                    const tint = s.tintOpacity ?? 0.22;
                    sliders.tintOpacity.slider.value = tint;    sliders.tintOpacity.val.textContent = tint.toFixed(2);
                }
                refreshOverlayControls();

                // Click-to-select tile mode
                let clickSelectActive = false;
                let clickSelectListener = null;
                const clickSelectBtn = document.createElement('button');
                clickSelectBtn.textContent = '🎯 Click Tile to Select';
                Object.assign(clickSelectBtn.style, { padding:'4px 8px', background:'#2d2d44', color:'#eee', border:'1px solid #555', borderRadius:'5px', cursor:'pointer', fontSize:'11px' });
                clickSelectBtn.onclick = () => {
                    clickSelectActive = !clickSelectActive;
                    clickSelectBtn.style.background = clickSelectActive ? '#3a5a3a' : '#2d2d44';
                    clickSelectBtn.textContent = clickSelectActive ? '🎯 Selecting... (click tile)' : '🎯 Click Tile to Select';
                    if (clickSelectActive) {
                        clickSelectListener = (e) => {
                            const tileEl = e.target.closest('[data-tile-id]');
                            if (!tileEl) return;
                            const tileId = parseInt(tileEl.getAttribute('data-tile-id'));
                            const tile = (typeof placedTiles !== 'undefined') && placedTiles.find(t => t.id === tileId);
                            if (tile && tile.shrineType && tile.shrineType !== 'player') {
                                selectedEl = tile.shrineType;
                                highlightPill();
                                refreshOverlayControls();
                            }
                            // Deactivate after one click
                            clickSelectActive = false;
                            clickSelectBtn.style.background = '#2d2d44';
                            clickSelectBtn.textContent = '🎯 Click Tile to Select';
                            document.removeEventListener('click', clickSelectListener, true);
                            clickSelectListener = null;
                        };
                        document.addEventListener('click', clickSelectListener, true);
                    } else if (clickSelectListener) {
                        document.removeEventListener('click', clickSelectListener, true);
                        clickSelectListener = null;
                    }
                };
                overlayBody.appendChild(clickSelectBtn);

                // Export button
                const exportBtn = document.createElement('button');
                exportBtn.textContent = '📋 Export Settings';
                Object.assign(exportBtn.style, { padding:'4px 8px', background:'#2d2d44', color:'#6ef', border:'1px solid #555', borderRadius:'5px', cursor:'pointer', fontSize:'11px' });
                exportBtn.onclick = () => {
                    const out = JSON.stringify(window.tileOverlaySettings, null, 2);
                    console.log('[OVERLAY EXPORT]\n' + out);
                    const pre = document.createElement('textarea');
                    pre.value = out;
                    pre.style.cssText = 'width:100%;height:120px;background:#111;color:#6ef;border:1px solid #444;border-radius:4px;font-size:10px;padding:4px;box-sizing:border-box;resize:vertical;';
                    // Replace or append export area
                    const existing = overlayBody.querySelector('.overlay-export-area');
                    if (existing) existing.remove(); else { pre.className = 'overlay-export-area'; overlayBody.appendChild(pre); pre.select(); }
                };
                overlayBody.appendChild(exportBtn);
                overlaySection.appendChild(overlayBody);
                panel.appendChild(overlaySection);

                // ── Inspect Tool ─────────────────────────────────────────────
                const inspectSection = document.createElement('div');
                inspectSection.style.cssText = 'border-top:1px solid #444;padding-top:8px;display:flex;flex-direction:column;gap:6px;';

                let inspectActive = false;
                let inspectListener = null;
                const inspectOut = document.createElement('div');
                inspectOut.style.cssText = 'display:none;font-size:10px;color:#6ef;background:#111;border:1px solid #444;border-radius:4px;padding:5px 7px;white-space:pre;font-family:monospace;line-height:1.5;';

                const inspectBtn = makeBtn('🔍 Inspect Tile: OFF', () => {
                    inspectActive = !inspectActive;
                    inspectBtn.textContent = inspectActive ? '🔍 Inspect Tile: ON' : '🔍 Inspect Tile: OFF';
                    inspectBtn.style.color = inspectActive ? '#6ef' : '#eee';
                    inspectOut.style.display = inspectActive ? 'block' : 'none';

                    if (inspectListener) {
                        document.removeEventListener('click', inspectListener, true);
                        inspectListener = null;
                    }
                    if (inspectActive) {
                        inspectListener = (e) => {
                            const tileEl = e.target.closest('[data-tile-id]');
                            if (!tileEl) return;
                            e.stopPropagation();
                            e.preventDefault();
                            const tileId = parseInt(tileEl.getAttribute('data-tile-id'));
                            const tile = (typeof placedTiles !== 'undefined') ? placedTiles.find(t => t.id === tileId) : null;
                            if (!tile) { inspectOut.textContent = `tile id=${tileId} not found`; return; }
                            const lines = [
                                `id:        ${tile.id}`,
                                `shrine:    ${tile.shrineType || '(hidden)'}`,
                                `flipped:   ${tile.flipped}`,
                                `pos:       x=${tile.x?.toFixed(1)}, y=${tile.y?.toFixed(1)}`,
                                `rotation:  ${tile.rotation ?? 0}`,
                                `isPlayer:  ${tile.isPlayerTile || false}`,
                            ];
                            const overlay = window.tileOverlaySettings?.[tile.shrineType];
                            if (overlay) {
                                lines.push(`overlay:   x=${overlay.x} y=${overlay.y} r=${overlay.rotation} s=${overlay.scale}`);
                                lines.push(`           op=${overlay.opacity} tint=${overlay.tintOpacity}`);
                            }
                            inspectOut.textContent = lines.join('\n');
                        };
                        document.addEventListener('click', inspectListener, true);
                    }
                });
                inspectSection.appendChild(inspectBtn);
                inspectSection.appendChild(inspectOut);
                panel.appendChild(inspectSection);

                // ── Sprite Effect Lab ─────────────────────────────────────────
                (function buildSpriteEffectLab() {
                    const section = document.createElement('div');
                    section.style.cssText = 'border-top:1px solid #444;padding-top:8px;display:flex;flex-direction:column;gap:6px;';

                    const title = document.createElement('div');
                    title.textContent = '✨ Sprite Effect Lab';
                    title.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;cursor:pointer;user-select:none;';
                    let open = false;
                    const body = document.createElement('div');
                    body.style.cssText = 'display:none;flex-direction:column;gap:6px;';
                    title.onclick = () => { open = !open; body.style.display = open ? 'flex' : 'none'; };
                    section.appendChild(title);
                    section.appendChild(body);

                    // State
                    let frames = [];
                    let animTimer = null;
                    let currentFrame = 0;
                    let cfg = { fps: 18, hueRotate: 0, brightness: 1, saturation: 1, scale: 1, trigger: 'stone_destroyed', stoneType: 'fire' };

                    // Preview canvas
                    const previewWrap = document.createElement('div');
                    previewWrap.style.cssText = 'display:flex;justify-content:center;align-items:center;background:#111;border:1px solid #333;border-radius:4px;height:100px;';
                    const canvas = document.createElement('canvas');
                    canvas.width = 80; canvas.height = 80;
                    canvas.style.cssText = 'image-rendering:pixelated;';
                    previewWrap.appendChild(canvas);
                    body.appendChild(previewWrap);
                    const ctx2 = canvas.getContext('2d');

                    function drawFrame() {
                        ctx2.clearRect(0, 0, canvas.width, canvas.height);
                        if (!frames.length) return;
                        const img = frames[currentFrame % frames.length];
                        const s = cfg.scale;
                        const w = img.width * s, h = img.height * s;
                        ctx2.save();
                        ctx2.filter = `hue-rotate(${cfg.hueRotate}deg) brightness(${cfg.brightness}) saturate(${cfg.saturation})`;
                        ctx2.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
                        ctx2.restore();
                    }

                    function startAnim() {
                        if (animTimer) clearInterval(animTimer);
                        if (!frames.length) return;
                        animTimer = setInterval(() => { currentFrame = (currentFrame + 1) % frames.length; drawFrame(); }, 1000 / cfg.fps);
                    }

                    // File upload
                    const uploadRow = document.createElement('div');
                    uploadRow.style.cssText = 'display:flex;gap:4px;align-items:center;';
                    const uploadLabel = document.createElement('span');
                    uploadLabel.textContent = 'Frames:';
                    uploadLabel.style.cssText = 'font-size:11px;color:#aaa;width:44px;flex-shrink:0;';
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.multiple = true;
                    fileInput.accept = 'image/png,image/webp';
                    fileInput.style.cssText = 'flex:1;font-size:10px;color:#eee;background:#111;border:1px solid #555;border-radius:4px;padding:2px;cursor:pointer;min-width:0;';
                    const frameCount = document.createElement('span');
                    frameCount.style.cssText = 'font-size:10px;color:#6ef;width:32px;text-align:right;flex-shrink:0;';
                    frameCount.textContent = '0 fr';
                    fileInput.onchange = () => {
                        const files = Array.from(fileInput.files).sort((a, b) => a.name.localeCompare(b.name));
                        frames = [];
                        currentFrame = 0;
                        let loaded = 0;
                        files.forEach((f, i) => {
                            const img = new Image();
                            img.onload = () => {
                                frames[i] = img;
                                loaded++;
                                if (loaded === files.length) {
                                    frameCount.textContent = `${loaded} fr`;
                                    // Fit first frame in preview
                                    const first = frames[0];
                                    cfg.scale = Math.min(1, 80 / Math.max(first.width, first.height));
                                    scaleSlider.value = cfg.scale.toFixed(2);
                                    scaleVal.textContent = cfg.scale.toFixed(2);
                                    startAnim();
                                }
                            };
                            img.src = URL.createObjectURL(f);
                        });
                    };
                    uploadRow.appendChild(uploadLabel);
                    uploadRow.appendChild(fileInput);
                    uploadRow.appendChild(frameCount);
                    body.appendChild(uploadRow);

                    // Slider helper
                    function makeSlider(label, min, max, step, key, initial, format) {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:5px;';
                        const lbl = document.createElement('span');
                        lbl.textContent = label;
                        lbl.style.cssText = 'font-size:11px;color:#aaa;width:44px;flex-shrink:0;';
                        const sl = document.createElement('input');
                        sl.type = 'range'; sl.min = min; sl.max = max; sl.step = step; sl.value = initial;
                        sl.style.cssText = 'flex:1;accent-color:#f96;min-width:0;';
                        const vl = document.createElement('span');
                        vl.style.cssText = 'font-size:11px;color:#eee;width:40px;text-align:right;flex-shrink:0;';
                        vl.textContent = format(initial);
                        sl.oninput = () => {
                            const v = parseFloat(sl.value);
                            cfg[key] = v;
                            vl.textContent = format(v);
                            if (key === 'fps') startAnim(); else drawFrame();
                        };
                        row.appendChild(lbl); row.appendChild(sl); row.appendChild(vl);
                        body.appendChild(row);
                        return { slider: sl, val: vl };
                    }

                    makeSlider('Hue',    0, 360, 1,    'hueRotate',  0,   v => `${Math.round(v)}°`);
                    makeSlider('Bright', 0.1, 3, 0.05, 'brightness', 1,   v => v.toFixed(2));
                    makeSlider('Satur',  0, 3,   0.05, 'saturation', 1,   v => v.toFixed(2));
                    const { slider: scaleSlider, val: scaleVal } = makeSlider('Scale', 0.1, 3, 0.05, 'scale', 1, v => v.toFixed(2));
                    makeSlider('FPS',    1, 60,  1,    'fps',        18,  v => `${Math.round(v)}`);

                    // Trigger + stone type
                    function makeSelect(label, key, options) {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:5px;';
                        const lbl = document.createElement('span');
                        lbl.textContent = label;
                        lbl.style.cssText = 'font-size:11px;color:#aaa;width:44px;flex-shrink:0;';
                        const sel = document.createElement('select');
                        sel.style.cssText = 'flex:1;background:#111;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 4px;font-size:11px;min-width:0;';
                        options.forEach(([val, text]) => {
                            const opt = document.createElement('option');
                            opt.value = val; opt.textContent = text;
                            if (val === cfg[key]) opt.selected = true;
                            sel.appendChild(opt);
                        });
                        sel.onchange = () => { cfg[key] = sel.value; };
                        row.appendChild(lbl); row.appendChild(sel);
                        body.appendChild(row);
                    }

                    makeSelect('Trigger', 'trigger', [
                        ['stone_destroyed', 'Stone destroyed'],
                        ['scroll_cast',     'Scroll cast'],
                        ['tile_placed',     'Tile placed'],
                        ['turn_end',        'Turn end'],
                    ]);
                    makeSelect('Stone', 'stoneType', [
                        ['fire',     'Fire'],
                        ['earth',    'Earth'],
                        ['water',    'Water'],
                        ['wind',     'Wind'],
                        ['void',     'Void'],
                        ['catacomb', 'Catacomb'],
                        ['any',      'Any'],
                    ]);

                    // Export
                    const exportBtn = document.createElement('button');
                    exportBtn.textContent = '📋 Export Config';
                    Object.assign(exportBtn.style, { padding:'4px 8px', background:'#2d2d44', color:'#f96', border:'1px solid #555', borderRadius:'5px', cursor:'pointer', fontSize:'11px' });
                    exportBtn.onclick = () => {
                        const out = JSON.stringify({
                            trigger:    cfg.trigger,
                            stoneType:  cfg.stoneType,
                            frames:     frames.length || '?',
                            fps:        Math.round(cfg.fps),
                            hueRotate:  Math.round(cfg.hueRotate),
                            brightness: parseFloat(cfg.brightness.toFixed(2)),
                            saturation: parseFloat(cfg.saturation.toFixed(2)),
                            scale:      parseFloat(cfg.scale.toFixed(2)),
                        }, null, 2);
                        const existing = body.querySelector('.sprite-export-area');
                        if (existing) { existing.remove(); return; }
                        const ta = document.createElement('textarea');
                        ta.className = 'sprite-export-area';
                        ta.value = out;
                        ta.style.cssText = 'width:100%;height:130px;background:#111;color:#f96;border:1px solid #444;border-radius:4px;font-size:10px;padding:4px;box-sizing:border-box;resize:vertical;';
                        body.appendChild(ta);
                        ta.select();
                    };
                    body.appendChild(exportBtn);
                    panel.appendChild(section);
                })();

                panel.appendChild(makeBtn('✕ Close', () => {
                    if (inspectListener) document.removeEventListener('click', inspectListener, true);
                    panel.remove();
                }));

                document.body.appendChild(panel);
            }

            document.addEventListener('click', function(e) {
                if (!e.target || !e.target.classList.contains('hud-ap-label')) return;
                clickCount++;
                clearTimeout(clickTimer);
                if (clickCount >= 5) {
                    clickCount = 0;
                    openCheatPanel();
                } else {
                    clickTimer = setTimeout(() => { clickCount = 0; }, 3000);
                }
            });
        })();

