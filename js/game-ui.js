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

        // Play n footstep sounds spaced ~160ms apart (for multi-hex moves).
        // Wind steps (cost 0) are excluded by the caller — only pass non-wind steps.
        function playFootsteps(n) {
            if (!n || n <= 0) return;
            window.SoundSystem?.playFootstep();
            for (let i = 1; i < n; i++) {
                setTimeout(() => window.SoundSystem?.playFootstep(), i * 160);
            }
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
                max-width: 480px;
                width: 90vw;
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
            const line1 = document.createElement('div');
            line1.style.cssText = `font-family:var(--font-pixel);font-size:11px;color:${elementColor};letter-spacing:2px;text-transform:uppercase;`;
            line1.textContent = elementLabel + (levelText ? ' · ' + levelText : '');
            headerText.appendChild(line1);
            const line2 = document.createElement('div');
            line2.style.cssText = 'font-family:var(--font-terminal);font-size:20px;color:#e8dcc8;margin-top:3px;line-height:1.2;word-break:break-word;';
            line2.textContent = scrollTitle;
            headerText.appendChild(line2);
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
                // Update shrine dots — always show the LOCAL player's win progress
                const shrineIndex = (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null)
                    ? myPlayerIndex
                    : (typeof activePlayerIndex !== 'undefined' ? activePlayerIndex : 0);
                updateShrineDots(shrineIndex);
                // Update dock
                updateDockPlayers();
            } catch (e) {
                // Variables not ready yet
            }
        }

        function updateDockPlayers() { /* removed — dock player roster was redundant with existing AP/turn displays */ }

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
            // Bot turns decide when to end on their own (BotSystem's own scoring
            // already weighs endTurn against remaining actions) — this modal is a
            // human nudge only. asBot() swaps myPlayerIndex to the bot's index
            // while impersonating, so isMyTurn() reads true and this would
            // otherwise block the host's screen for every bot turn that spends
            // its AP to 0 (the same class of bug as the scroll-overflow stall).
            if (window.BotDriver?.controlsActivePlayer?.()) return;
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


                // Scrolls summary: hand count + each scroll's ELEMENT only (name/
                // pattern stay private — element type is visible, same as a
                // face-down card showing its suit but not its rank).
                const handSize = scrollData.hand ? scrollData.hand.size : 0;
                const activeSize = scrollData.active ? scrollData.active.size : 0;

                const scrollsSummary = document.createElement('div');
                scrollsSummary.className = 'opponent-scrolls-summary';
                scrollsSummary.textContent = `Hand: ${handSize} scroll${handSize !== 1 ? 's' : ''}`;
                card.appendChild(scrollsSummary);

                if (handSize > 0 && scrollData.hand) {
                    const handElementsDiv = document.createElement('div');
                    handElementsDiv.className = 'opponent-hand-elements';
                    scrollData.hand.forEach(scrollName => {
                        const element = spellSystem.getScrollElement(scrollName);
                        const elementIcon = document.createElement('img');
                        elementIcon.src = element === 'catacomb'
                            ? 'images/Catacomb.png' + IMG_V
                            : (STONE_TYPES[element]?.img || '');
                        elementIcon.className = 'element-icon-sm';
                        elementIcon.alt = element || 'unknown';
                        elementIcon.title = element ? element.charAt(0).toUpperCase() + element.slice(1) : 'Unknown';
                        handElementsDiv.appendChild(elementIcon);
                    });
                    card.appendChild(handElementsDiv);
                }

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
                cardsContainer.innerHTML = '<div style="color: #ccc; font-size: 12px; text-align: center;">Waiting for opponents...</div>';
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
                    if (tileId !== null) window.SoundSystem?.play('placetile');

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

                        window.SoundSystem?.play('placetile');
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
                    window.SoundSystem?.play('error');
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

                const stonePos = findValidStonePosition(world.x, world.y, capturedStoneType);
                if (stonePos.valid) {
                    if (capturedStoneId === null) {
                        window._pendingFireDestroys = [];
                        placeStone(stonePos.x, stonePos.y, capturedStoneType);
                        window.SoundSystem?.play(capturedStoneType === 'earth' ? 'placeearthstone' : 'placestone');
                        // Track for undo — stone ID is nextStoneId-1 after placeStone increments it
                        lastMove = {
                            type: 'stone-place',
                            stoneId: nextStoneId - 1,
                            x: stonePos.x,
                            y: stonePos.y,
                            element: capturedStoneType,
                            destroyedByFire: window._pendingFireDestroys
                        };
                        window._pendingFireDestroys = null;
                        window.lastScrollAction = null;
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
                            window.SoundSystem?.play('error');
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
                    // A teleport may not land on a face-down tile — it doesn't
                    // reveal it, so ending there is illegal.
                    const onFlipped = destPos && typeof isPositionOnFlippedTile === 'function' &&
                        isPositionOnFlippedTile(destPos.x, destPos.y, getAllHexagonPositions());

                    if (!destPos || hasStone || hasPlayer || onFlipped) {
                        if (hasStone) updateStatus('Take Flight: cannot teleport onto a stone.');
                        else if (hasPlayer) updateStatus('Take Flight: another player is in the way.');
                        else if (onFlipped) updateStatus('Take Flight: cannot teleport onto a face-down tile.');
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
                        // Store the last move for undo (snapshot AP before spending)
                        lastMove = {
                            type: 'move',
                            prevPos: { x: startPos.x, y: startPos.y },
                            prevCurrentAP: currentAP,
                            prevVoidAP: voidAP
                        };
                        window.lastScrollAction = null;
                        // If any step in the path passed through a wind stone (cost 0), fire the wind ability sound
                        if (playerPath.slice(1).some(step => step.cost === 0)) {
                            window.SoundSystem?.play('windactivates');
                            if (window.isTutorialMode && window.TutorialMode?.onWindStoneUsed) {
                                window.TutorialMode.onWindStoneUsed();
                            }
                        }
                        // One footstep per non-wind step (cost > 0)
                        playFootsteps(playerPath.slice(1).filter(step => step.cost > 0).length);
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
                        window.SoundSystem?.play('error');
                        updateStatus('Cannot move there!');
                    } else {
                        console.log(`❌ Movement rejected: Insufficient AP (need ${totalCost}, have ${getTotalAP()})`);
                        placePlayer(startPos.x, startPos.y);
                        window.SoundSystem?.play('error');
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

                                // Store for undo (snapshot AP before spending)
                                lastMove = {
                                    type: 'move',
                                    prevPos: { x: startPos.x, y: startPos.y },
                                    prevCurrentAP: currentAP,
                                    prevVoidAP: voidAP
                                };
                                window.lastScrollAction = null;
                                window.SoundSystem?.playFootstep();
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
                            window.SoundSystem?.play('placetile');
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

                    const stonePos = findValidStonePosition(world.x, world.y, capturedStoneType);
                    if (stonePos.valid) {
                        placeStone(stonePos.x, stonePos.y, capturedStoneType);
                        window.SoundSystem?.play(capturedStoneType === 'earth' ? 'placeearthstone' : 'placestone');

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
                        // A teleport may not land on a face-down tile — it
                        // doesn't reveal it, so ending there is illegal.
                        const onFlipped = destPos && typeof isPositionOnFlippedTile === 'function' &&
                            isPositionOnFlippedTile(destPos.x, destPos.y, getAllHexagonPositions());

                        if (!destPos || hasStone || hasPlayer || onFlipped) {
                            if (hasStone) updateStatus('Take Flight: cannot teleport onto a stone.');
                            else if (hasPlayer) updateStatus('Take Flight: another player is in the way.');
                            else if (onFlipped) updateStatus('Take Flight: cannot teleport onto a face-down tile.');
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
                            // Store the last move for undo (snapshot AP before spending)
                            lastMove = {
                                type: 'move',
                                prevPos: { x: startPos.x, y: startPos.y },
                                prevCurrentAP: currentAP,
                                prevVoidAP: voidAP
                            };
                            window.lastScrollAction = null;
                            // One footstep per non-wind step (cost > 0)
                            playFootsteps(playerPath.slice(1).filter(step => step.cost > 0).length);
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

        // Player tile keyboard-placement preview state
        let tilePreviewActive = false;
        let tilePreviewPositions = [];
        let tilePreviewIndex = 0;
        let tilePreviewGhost = null;

        function buildValidPlayerTilePositions() {
            const largeHexSize = TILE_SIZE * 4;
            const offsets = [
                { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
                { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
            ];
            const valid = [];
            const seen = new Set();
            for (const tile of placedTiles) {
                const th = pixelToHex(tile.x, tile.y, largeHexSize);
                for (const off of offsets) {
                    const key = `${th.q + off.q},${th.r + off.r}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const pos = hexToPixel(th.q + off.q, th.r + off.r, largeHexSize);
                    const occupied = placedTiles.some(t =>
                        Math.sqrt(Math.pow(t.x - pos.x, 2) + Math.pow(t.y - pos.y, 2)) < TILE_SIZE
                    );
                    if (!occupied && countTouchingUnrevealedTiles(pos.x, pos.y) >= 2) {
                        valid.push(pos);
                    }
                }
            }
            // Sort clockwise by angle from board centre so ←/→ feel spatial
            valid.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
            return valid;
        }

        function showTilePreviewGhost(pos) {
            if (tilePreviewGhost) tilePreviewGhost.remove();
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'player-tile-preview');
            g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

            const tile = createTileGroup(TILE_SIZE, 0, false);
            g.appendChild(tile);

            // Dashed outline ring
            const outline = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            outline.setAttribute('class', 'preview-outline');
            outline.setAttribute('cx', 0);
            outline.setAttribute('cy', 0);
            outline.setAttribute('r', TILE_SIZE * 2);
            g.appendChild(outline);

            viewport.appendChild(g);
            tilePreviewGhost = g;
        }

        function cancelTilePreview() {
            if (tilePreviewGhost) { tilePreviewGhost.remove(); tilePreviewGhost = null; }
            tilePreviewActive = false;
            tilePreviewPositions = [];
        }

        // Player pawn keyboard-movement preview state
        let movePreviewActive = false;
        let movePreviewPositions = [];
        let movePreviewIndex = 0;
        let movePreviewGhost = null;

        function buildValidMovePositions() {
            if (!playerPosition) return [];
            const allHexes = getAllHexagonPositions();

            return allHexes
                .filter(h => {
                    const dist = Math.sqrt(Math.pow(h.x - playerPosition.x, 2) + Math.pow(h.y - playerPosition.y, 2));
                    return dist > 5 && dist < 40; // immediately adjacent only
                })
                .filter(h => {
                    // Tutorial gate
                    if (window.isTutorialMode && window.tutorialAllowedHexes) {
                        return [...window.tutorialAllowedHexes].some(key => {
                            const [ax, ay] = key.split(',').map(Number);
                            return Math.abs(ax - h.x) < 70 && Math.abs(ay - h.y) < 70;
                        });
                    }
                    return true;
                })
                .filter(h => {
                    const moveCheck = canPlayerMoveToHex(h.x, h.y, false);
                    if (!moveCheck.canMove) return false;
                    if (moveCheck.cost > getTotalAP()) return false;
                    // Can't end turn on a non-void stone
                    const stone = placedStones.find(s =>
                        Math.sqrt(Math.pow(s.x - h.x, 2) + Math.pow(s.y - h.y, 2)) < 5
                    );
                    if (stone && stone.type !== 'void') return false;
                    return true;
                })
                .sort((a, b) => {
                    const angleA = Math.atan2(a.y - playerPosition.y, a.x - playerPosition.x);
                    const angleB = Math.atan2(b.y - playerPosition.y, b.x - playerPosition.x);
                    return angleA - angleB;
                });
        }

        function showMovePreviewGhost(pos) {
            if (movePreviewGhost) movePreviewGhost.remove();
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'move-preview');
            g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', TILE_SIZE - 3);
            g.appendChild(circle);
            viewport.appendChild(g);
            movePreviewGhost = g;
        }

        function cancelMovePreview() {
            if (movePreviewGhost) { movePreviewGhost.remove(); movePreviewGhost = null; }
            movePreviewActive = false;
            movePreviewPositions = [];
        }

        // Catacomb teleport keyboard-preview state
        let cataPreviewActive = false;
        let cataPreviewDestinations = [];
        let cataPreviewIndex = 0;
        let cataPreviewGhost = null;

        function buildCatacombDestinations() {
            if (!playerPosition) return [];
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
            if (!currentShrine || !isCatacombLike(currentShrine)) return [];
            return placedTiles.filter(tile => {
                if (!isCatacombLike(tile)) return false;
                if (tile.flipped) return false;
                if (Math.abs(tile.x - currentShrine.x) <= 5 && Math.abs(tile.y - currentShrine.y) <= 5) return false;
                const hasStone = placedStones.some(s => Math.sqrt(Math.pow(s.x - tile.x, 2) + Math.pow(s.y - tile.y, 2)) < 5);
                const hasPlayer = playerPositions.some(p => p && Math.sqrt(Math.pow(p.x - tile.x, 2) + Math.pow(p.y - tile.y, 2)) < 5);
                return !hasStone && !hasPlayer;
            });
        }

        function showCataPreviewGhost(shrine) {
            if (cataPreviewGhost) cataPreviewGhost.remove();
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'catacomb-preview');
            g.setAttribute('transform', `translate(${shrine.x}, ${shrine.y})`);

            const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            outer.setAttribute('cx', 0);
            outer.setAttribute('cy', 0);
            outer.setAttribute('r', '18');
            outer.setAttribute('fill', '#8b4513');
            outer.setAttribute('stroke', '#fff');
            outer.setAttribute('stroke-width', '3');
            outer.setAttribute('stroke-dasharray', '8 4');
            g.appendChild(outer);

            const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            inner.setAttribute('cx', 0);
            inner.setAttribute('cy', 0);
            inner.setAttribute('r', '6');
            inner.setAttribute('fill', '#fff');
            g.appendChild(inner);

            viewport.appendChild(g);
            cataPreviewGhost = g;
        }

        function cancelCataPreview() {
            if (cataPreviewGhost) { cataPreviewGhost.remove(); cataPreviewGhost = null; }
            cataPreviewActive = false;
            cataPreviewDestinations = [];
        }

        function confirmCataTransport() {
            const shrine = cataPreviewDestinations[cataPreviewIndex];
            cancelCataPreview();
            // Re-verify destination is still clear
            const hasStone = placedStones.some(s => Math.sqrt(Math.pow(s.x - shrine.x, 2) + Math.pow(s.y - shrine.y, 2)) < 5);
            const hasPlayer = playerPositions.some(p => p && Math.sqrt(Math.pow(p.x - shrine.x, 2) + Math.pow(p.y - shrine.y, 2)) < 5);
            if (hasStone || hasPlayer) {
                updateStatus('Cannot teleport there — destination is now blocked!');
                updateCatacombIndicators();
                return;
            }
            placePlayer(shrine.x, shrine.y);
            updateStatus('Teleported to another catacomb shrine!');
            if (typeof isMultiplayer !== 'undefined' && isMultiplayer && typeof broadcastGameAction === 'function') {
                const playerIndex = (typeof myPlayerIndex !== 'undefined' && myPlayerIndex !== null) ? myPlayerIndex : activePlayerIndex;
                broadcastGameAction('catacomb-teleport', { playerIndex, x: shrine.x, y: shrine.y });
            }
            updateCatacombIndicators();
        }

        // Hand / Active / Common keyboard navigation state
        let handNavActive = false;
        let handNavIndex = 0;
        let activeNavActive = false;
        let activeNavIndex = 0;
        let commonNavActive = false;
        let commonNavIndex = 0;

        function getHandScrolls()   { return [...(window.spellSystem?.handScrolls   || [])]; }
        function getActiveScrolls() { return [...(window.spellSystem?.activeScrolls || [])]; }
        function getCommonScrolls() {
            return typeof window.spellSystem?.getCommonAreaScrolls === 'function'
                ? window.spellSystem.getCommonAreaScrolls() : [];
        }

        function clearScrollSelection() {
            document.querySelectorAll('.fsp-card-selected').forEach(c => c.classList.remove('fsp-card-selected'));
        }

        function highlightScrollCard(panelId, index) {
            clearScrollSelection();
            const body = document.getElementById(`fsp-body-${panelId}`);
            if (!body) return;
            const cards = body.querySelectorAll('.fsp-card');
            if (!cards.length) return;
            const card = cards[index];
            if (card) {
                card.classList.add('fsp-card-selected');
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }

        function cancelHandNav()   { handNavActive   = false; clearScrollSelection(); }
        function cancelActiveNav() { activeNavActive = false; clearScrollSelection(); }
        function cancelCommonNav() { commonNavActive = false; clearScrollSelection(); }

        function enterHandNav() {
            const sps = window.ScrollPanelSystem;
            const scrolls = getHandScrolls();
            if (!scrolls.length) { updateStatus('Hand is empty.'); return; }
            const el = document.getElementById('fsp-hand');
            if (!el || el.style.display === 'none') sps?.openPanel('hand');
            cancelActiveNav(); cancelCommonNav();
            handNavActive = true;
            handNavIndex = 0;
            highlightScrollCard('hand', 0);
            updateStatus(`Hand ${handNavIndex + 1}/${scrolls.length} — ← → pick · Enter=active · Tab=common · Space=activate · Esc cancel`);
        }

        function enterActiveNav() {
            const sps = window.ScrollPanelSystem;
            const scrolls = getActiveScrolls();
            if (!scrolls.length) { updateStatus('Active area is empty.'); return; }
            const el = document.getElementById('fsp-active');
            if (!el || el.style.display === 'none') sps?.openPanel('active');
            cancelHandNav(); cancelCommonNav();
            activeNavActive = true;
            activeNavIndex = 0;
            highlightScrollCard('active', 0);
            updateStatus(`Active ${activeNavIndex + 1}/${scrolls.length} — ← → pick · Tab=common · Space=activate · Esc cancel`);
        }

        function enterCommonNav() {
            const sps = window.ScrollPanelSystem;
            const scrolls = getCommonScrolls();
            if (!scrolls.length) { updateStatus('Common area is empty.'); return; }
            const el = document.getElementById('fsp-common');
            if (!el || el.style.display === 'none') sps?.openPanel('common');
            cancelHandNav(); cancelActiveNav();
            commonNavActive = true;
            commonNavIndex = 0;
            highlightScrollCard('common', 0);
            updateStatus(`Common ${commonNavIndex + 1}/${scrolls.length} — ← → pick · Space=activate · Esc cancel`);
        }

        // Stone placement keyboard-preview state
        // Keys 1-6 map to: earth, water, fire, wind, void, catacomb
        const STONE_KEY_ORDER = ['void', 'wind', 'fire', 'water', 'earth'];
        let stonePreviewActive = false;
        let stonePreviewType = null;
        let stonePreviewPositions = [];
        let stonePreviewIndex = 0;
        let stonePreviewGhost = null;

        function buildValidStonePositions(type) {
            const hexPositions = getAllHexagonPositions();
            // Temporarily set draggedStoneType so isInPlacementRange reads the right type
            const prevType = draggedStoneType;
            draggedStoneType = type;

            const valid = hexPositions.filter(pos => {
                const stoneHere = placedStones.some(s =>
                    Math.sqrt(Math.pow(s.x - pos.x, 2) + Math.pow(s.y - pos.y, 2)) < 5
                );
                if (stoneHere) return false;

                let playerHere = false;
                if (playerPosition) {
                    playerHere = Math.sqrt(Math.pow(playerPosition.x - pos.x, 2) + Math.pow(playerPosition.y - pos.y, 2)) < 5;
                }
                if (!playerHere && typeof playerPositions !== 'undefined') {
                    playerPositions.forEach(p => {
                        if (p && p.x != null) {
                            if (Math.sqrt(Math.pow(p.x - pos.x, 2) + Math.pow(p.y - pos.y, 2)) < 5) playerHere = true;
                        }
                    });
                }
                if (playerHere) return false;

                if (isPositionOnFlippedTile(pos.x, pos.y, hexPositions)) return false;
                if (!isInPlacementRange(pos.x, pos.y, type)) return false;
                return true;
            });

            draggedStoneType = prevType;

            // Sort by clockwise angle around the player so ←/→ sweeps in a circle
            if (playerPosition) {
                valid.sort((a, b) => {
                    const angleA = Math.atan2(a.y - playerPosition.y, a.x - playerPosition.x);
                    const angleB = Math.atan2(b.y - playerPosition.y, b.x - playerPosition.x);
                    return angleA - angleB;
                });
            }
            return valid;
        }

        function showStonePreviewGhost(pos, type) {
            if (stonePreviewGhost) stonePreviewGhost.remove();
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'stone-preview');
            g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', 0);
            circle.setAttribute('cy', 0);
            circle.setAttribute('r', STONE_SIZE);
            circle.setAttribute('fill', STONE_TYPES[type].color);
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '2');
            g.appendChild(circle);

            const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            img.setAttribute('href', STONE_TYPES[type].img);
            img.setAttribute('x', -STONE_SIZE);
            img.setAttribute('y', -STONE_SIZE);
            img.setAttribute('width', STONE_SIZE * 2);
            img.setAttribute('height', STONE_SIZE * 2);
            g.appendChild(img);

            viewport.appendChild(g);
            stonePreviewGhost = g;
        }

        function cancelStonePreview() {
            if (stonePreviewGhost) { stonePreviewGhost.remove(); stonePreviewGhost = null; }
            stonePreviewActive = false;
            stonePreviewType = null;
            stonePreviewPositions = [];
        }

        function enterStonePreview(type) {
            cancelTilePreview();
            cancelMovePreview();
            cancelCataPreview();
            const positions = buildValidStonePositions(type);
            if (positions.length === 0) {
                updateStatus(`No valid positions for ${type} stone!`);
                return;
            }
            stonePreviewType = type;
            stonePreviewPositions = positions;
            stonePreviewIndex = 0;
            stonePreviewActive = true;
            showStonePreviewGhost(positions[0], type);
            updateStatus(`${type} stone — pos 1 of ${positions.length} — ← → to move, Enter to place, ${STONE_KEY_ORDER.indexOf(type) + 1} or Esc to cancel`);
        }

        document.addEventListener('keydown', (e) => {
            // Don't fire game shortcuts while the player is typing in any input / textarea / contenteditable
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

            // Don't fire game shortcuts until the game board is actually active
            if (!document.getElementById('game-layout')?.classList.contains('active')) return;

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

            // Q: navigate Hand scrolls
            if ((e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (handNavActive) { cancelHandNav(); updateStatus('Hand navigation cancelled.'); }
                else enterHandNav();
            }

            // W: navigate Active scrolls
            if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (activeNavActive) { cancelActiveNav(); updateStatus('Active navigation cancelled.'); }
                else enterActiveNav();
            }

            // E: navigate Common scrolls
            if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (commonNavActive) { cancelCommonNav(); updateStatus('Common navigation cancelled.'); }
                else enterCommonNav();
            }

            // Tab: move selected card to Common Area
            if (e.key === 'Tab' && (handNavActive || activeNavActive)) {
                e.preventDefault();
                const sp = window.spellSystem;
                const sps = window.ScrollPanelSystem;
                if (handNavActive) {
                    const scrolls = getHandScrolls();
                    if (scrolls.length) {
                        const name = scrolls[handNavIndex];
                        cancelHandNav();
                        sp?.discardScroll(name);
                        sps?.refresh();
                        updateStatus(`${name} moved to common area.`);
                    }
                } else if (activeNavActive) {
                    const scrolls = getActiveScrolls();
                    if (scrolls.length) {
                        const name = scrolls[activeNavIndex];
                        cancelActiveNav();
                        sp?.discardScroll(name);
                        sps?.refresh();
                        updateStatus(`${name} moved to common area.`);
                    }
                }
            }

            // Space: cast selected card (hand or active nav)
            if (e.key === ' ' && (handNavActive || activeNavActive || commonNavActive)) {
                e.preventDefault();
                const sp = window.spellSystem;
                const sps = window.ScrollPanelSystem;
                let scrolls, idx;
                if (handNavActive)   { scrolls = getHandScrolls();   idx = handNavIndex; }
                else if (activeNavActive) { scrolls = getActiveScrolls(); idx = activeNavIndex; }
                else                 { scrolls = getCommonScrolls();  idx = commonNavIndex; }
                const name = scrolls[idx];
                if (name && sp) {
                    if (sp.checkPattern && sp.checkPattern(name)) {
                        cancelHandNav(); cancelActiveNav(); cancelCommonNav();
                        sp.castSpell();
                        sps?.refresh();
                    } else {
                        updateStatus(`Pattern not matched — place the required stones first.`);
                    }
                }
            }

            // H / A / C: toggle Hand / Active / Common scroll panels
            if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const sps = window.ScrollPanelSystem;
                if (sps) {
                    const el = document.getElementById('fsp-hand');
                    if (el && el.style.display !== 'none') sps.closePanel('hand');
                    else sps.openPanel('hand');
                }
            }
            if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const sps = window.ScrollPanelSystem;
                if (sps) {
                    const el = document.getElementById('fsp-active');
                    if (el && el.style.display !== 'none') sps.closePanel('active');
                    else sps.openPanel('active');
                }
            }
            if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const sps = window.ScrollPanelSystem;
                if (sps) {
                    const el = document.getElementById('fsp-common');
                    if (el && el.style.display !== 'none') sps.closePanel('common');
                    else sps.openPanel('common');
                }
            }

            // T key: catacomb Teleport preview
            if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (cataPreviewActive) {
                    confirmCataTransport();
                } else if (canTakeAction() && playerPosition) {
                    const dests = buildCatacombDestinations();
                    if (dests.length === 0) {
                        // Not on a catacomb, or no valid destinations — do nothing silently
                    } else {
                        cancelTilePreview();
                        cancelMovePreview();
                        cancelStonePreview();
                        cataPreviewDestinations = dests;
                        cataPreviewIndex = 0;
                        cataPreviewActive = true;
                        showCataPreviewGhost(dests[0]);
                        updateStatus(`Catacomb teleport — destination 1 of ${dests.length} — ← → to cycle, T to confirm, Esc to cancel`);
                    }
                }
            }

            // Number keys 1-6: stone placement preview
            if (/^[1-5]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const type = STONE_KEY_ORDER[parseInt(e.key) - 1];
                if (canTakeAction() && stoneCounts[type] > 0) {
                    if (stonePreviewActive && stonePreviewType === type) {
                        cancelStonePreview();
                        updateStatus('Stone placement cancelled.');
                    } else {
                        enterStonePreview(type);
                    }
                }
            }

            // Enter: drives tile-placement, movement, stone placement previews, and hand nav
            if (e.key === 'Enter') {
                // --- Hand nav: move to active ---
                if (handNavActive) {
                    const sp = window.spellSystem;
                    const sps = window.ScrollPanelSystem;
                    const scrolls = getHandScrolls();
                    if (scrolls.length) {
                        const name = scrolls[handNavIndex];
                        cancelHandNav();
                        sp?.moveToActive(name);
                        sps?.refresh();
                        updateStatus(`${name} moved to active area.`);
                    }
                    return;
                }

                // --- Stone placement: confirm ---
                if (stonePreviewActive) {
                    const pos = stonePreviewPositions[stonePreviewIndex];
                    const type = stonePreviewType;
                    cancelStonePreview();
                    window._pendingFireDestroys = [];
                    placeStone(pos.x, pos.y, type);
                    window.SoundSystem?.play(type === 'earth' ? 'placeearthstone' : 'placestone');
                    lastMove = { type: 'stone-place', stoneId: nextStoneId - 1, x: pos.x, y: pos.y, element: type, destroyedByFire: window._pendingFireDestroys };
                    window._pendingFireDestroys = null;
                    window.lastScrollAction = null;
                    stoneCounts[type]--;
                    updateStoneCount(type);
                    syncPlayerState();
                    updateStatus(`Placed ${type} stone`);
                    return;
                }

                // --- Tile placement: confirm ---
                if (tilePreviewActive) {
                    const pos = tilePreviewPositions[tilePreviewIndex];
                    cancelTilePreview();
                    const tileId = placeTile(pos.x, pos.y, 0, false, 'player', false, false, null);
                    if (tileId !== null) {
                        playerTilesAvailable--;
                        const countEl = document.getElementById('new-player-tile-count') || document.getElementById('player-tile-count');
                        if (countEl) countEl.textContent = playerTilesAvailable;
                        if (playerTileElements.length > 0) playerTileElements.shift().remove();
                        if (isMultiplayer) {
                            broadcastGameAction('player-tile-place', {
                                x: pos.x, y: pos.y,
                                playerIndex: myPlayerIndex,
                                color: playerColor,
                                cosmetics: window.cosmeticsSystem?.getEquippedAll() || null
                            });
                        }
                        updateStatus('Player tile placed!');
                    }
                    return;
                }

                // --- Movement: confirm ---
                if (movePreviewActive) {
                    const target = movePreviewPositions[movePreviewIndex];
                    cancelMovePreview();
                    const startPos = { x: playerPosition.x, y: playerPosition.y };
                    const actualCost = calculateTapMoveCost(startPos, target);
                    if (actualCost >= 0 && actualCost <= getTotalAP()) {
                        lastMove = { type: 'move', prevPos: startPos, prevCurrentAP: currentAP, prevVoidAP: voidAP };
                        window.lastScrollAction = null;
                        // Only play footstep if AP was spent (wind steps cost 0)
                        if (actualCost > 0) window.SoundSystem?.playFootstep();
                        placePlayer(target.x, target.y);
                        if (window.isTutorialMode && window.TutorialMode?.onPlayerMoved) {
                            window.TutorialMode.onPlayerMoved(target.x, target.y);
                        }
                        spendAP(actualCost);
                        if (isMultiplayer) {
                            broadcastGameAction('player-move', {
                                playerIndex: activePlayerIndex,
                                x: target.x, y: target.y,
                                apSpent: actualCost,
                                cosmetics: window.cosmeticsSystem?.getEquippedAll() || null
                            });
                        }
                        // Reveal hidden tile if stepped onto one
                        const allHexes = getAllHexagonPositions();
                        let landedHex = null, minD = Infinity;
                        allHexes.forEach(h => {
                            const d = Math.sqrt(Math.pow(h.x - target.x, 2) + Math.pow(h.y - target.y, 2));
                            if (d < minD) { minD = d; landedHex = h; }
                        });
                        if (landedHex && minD < 5 && landedHex.tiles) {
                            landedHex.tiles.filter(t => t.flipped && !t.isPlayerTile).forEach(t => revealTile(t.id));
                        }
                        updateStatus(`Moved (cost: ${actualCost} AP, ${getTotalAP()} AP remaining)`);
                    } else {
                        updateStatus('Could not move there!');
                    }
                    return;
                }

                // --- Tile placement: enter preview ---
                if (playerTilesAvailable > 0) {
                    if (isMultiplayer && (!isPlacementPhase || !canPlaceTile())) { notYourTurn(); return; }
                    const positions = buildValidPlayerTilePositions();
                    if (positions.length === 0) { updateStatus('No valid edge positions available for your tile!'); return; }
                    tilePreviewPositions = positions;
                    tilePreviewIndex = Math.floor(Math.random() * positions.length);
                    tilePreviewActive = true;
                    showTilePreviewGhost(tilePreviewPositions[tilePreviewIndex]);
                    updateStatus(`Tile position ${tilePreviewIndex + 1} of ${tilePreviewPositions.length} — ← → to move, Enter to confirm, Esc to cancel`);
                    return;
                }

                // --- Movement: enter preview ---
                if (canTakeAction() && playerPosition && getTotalAP() > 0 && !isDraggingPlayer && !isDraggingTile) {
                    const positions = buildValidMovePositions();
                    if (positions.length === 0) { updateStatus('No valid moves available!'); return; }
                    movePreviewPositions = positions;
                    movePreviewIndex = 0;
                    movePreviewActive = true;
                    showMovePreviewGhost(movePreviewPositions[0]);
                    const cost = canPlayerMoveToHex(movePreviewPositions[0].x, movePreviewPositions[0].y, false).cost;
                    updateStatus(`Move 1 of ${positions.length} (${cost} AP) — ← → to choose, Enter to confirm, Esc to cancel`);
                }
            }

            // Arrow keys: cycle tile-placement, movement, stone, catacomb, or scroll nav
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (!tilePreviewActive && !movePreviewActive && !stonePreviewActive && !cataPreviewActive && !handNavActive && !activeNavActive && !commonNavActive) return;
                e.preventDefault();
                const dir = e.key === 'ArrowRight' ? 1 : -1;
                if (handNavActive) {
                    const scrolls = getHandScrolls();
                    handNavIndex = (handNavIndex + dir + scrolls.length) % scrolls.length;
                    highlightScrollCard('hand', handNavIndex);
                    updateStatus(`Hand ${handNavIndex + 1}/${scrolls.length} — ← → pick · Enter=active · Tab=common · Space=activate · Esc cancel`);
                } else if (activeNavActive) {
                    const scrolls = getActiveScrolls();
                    activeNavIndex = (activeNavIndex + dir + scrolls.length) % scrolls.length;
                    highlightScrollCard('active', activeNavIndex);
                    updateStatus(`Active ${activeNavIndex + 1}/${scrolls.length} — ← → pick · Tab=common · Space=activate · Esc cancel`);
                } else if (commonNavActive) {
                    const scrolls = getCommonScrolls();
                    commonNavIndex = (commonNavIndex + dir + scrolls.length) % scrolls.length;
                    highlightScrollCard('common', commonNavIndex);
                    updateStatus(`Common ${commonNavIndex + 1}/${scrolls.length} — ← → pick · Space=activate · Esc cancel`);
                } else if (tilePreviewActive) {
                    tilePreviewIndex = (tilePreviewIndex + dir + tilePreviewPositions.length) % tilePreviewPositions.length;
                    showTilePreviewGhost(tilePreviewPositions[tilePreviewIndex]);
                    updateStatus(`Tile position ${tilePreviewIndex + 1} of ${tilePreviewPositions.length} — ← → to move, Enter to confirm, Esc to cancel`);
                } else if (stonePreviewActive) {
                    stonePreviewIndex = (stonePreviewIndex + dir + stonePreviewPositions.length) % stonePreviewPositions.length;
                    showStonePreviewGhost(stonePreviewPositions[stonePreviewIndex], stonePreviewType);
                    updateStatus(`${stonePreviewType} stone — pos ${stonePreviewIndex + 1} of ${stonePreviewPositions.length} — ← → to move, Enter to place, ${STONE_KEY_ORDER.indexOf(stonePreviewType) + 1} or Esc to cancel`);
                } else if (cataPreviewActive) {
                    cataPreviewIndex = (cataPreviewIndex + dir + cataPreviewDestinations.length) % cataPreviewDestinations.length;
                    showCataPreviewGhost(cataPreviewDestinations[cataPreviewIndex]);
                    updateStatus(`Catacomb teleport — destination ${cataPreviewIndex + 1} of ${cataPreviewDestinations.length} — ← → to cycle, T to confirm, Esc to cancel`);
                } else {
                    movePreviewIndex = (movePreviewIndex + dir + movePreviewPositions.length) % movePreviewPositions.length;
                    showMovePreviewGhost(movePreviewPositions[movePreviewIndex]);
                    const cost = canPlayerMoveToHex(movePreviewPositions[movePreviewIndex].x, movePreviewPositions[movePreviewIndex].y, false).cost;
                    updateStatus(`Move ${movePreviewIndex + 1} of ${movePreviewPositions.length} (${cost} AP) — ← → to choose, Enter to confirm, Esc to cancel`);
                }
            }

            // X: end turn
            if ((e.key === 'x' || e.key === 'X') && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const btn = document.getElementById('end-turn');
                if (btn && !btn.disabled) btn.click();
            }

            // Escape: cancel whichever preview or nav is active
            if (e.key === 'Escape') {
                if (tilePreviewActive) { cancelTilePreview(); updateStatus('Tile placement cancelled.'); }
                else if (movePreviewActive) { cancelMovePreview(); updateStatus('Move cancelled.'); }
                else if (stonePreviewActive) { cancelStonePreview(); updateStatus('Stone placement cancelled.'); }
                else if (cataPreviewActive) { cancelCataPreview(); updateStatus('Teleport cancelled.'); }
                else if (handNavActive) { cancelHandNav(); updateStatus('Hand navigation cancelled.'); }
                else if (activeNavActive) { cancelActiveNav(); updateStatus('Active navigation cancelled.'); }
                else if (commonNavActive) { cancelCommonNav(); updateStatus('Common navigation cancelled.'); }
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

            // Mid-transit across a stone — must move off before resting the
            // turn there (see isPlayerRestingOnStone). Exempt when stranded
            // (no legal move to escape it) — that's the one case where
            // ending the turn HAS to stay legal, or the game hard-deadlocks.
            if (typeof isPlayerRestingOnStone === 'function' && isPlayerRestingOnStone(turnPlayerIdx) &&
                !(typeof isPlayerStrandedOnStone === 'function' && isPlayerStrandedOnStone(turnPlayerIdx))) {
                updateStatus('Cannot end your turn while standing on a stone — move to an empty hex first.');
                window.SoundSystem?.play('error');
                return;
            }

            // R2 (docs/bot-roadmap.md, Runtime Track): shadow-mode backend validator.
            // Asks the server (which only knows the LAST persisted turn owner — see
            // persistCurrentTurnIndex below) whether it agrees this player currently
            // holds the turn. Logged only, never blocks — proves the backend-authority
            // path works before anything is made to depend on it.
            if (isMultiplayer && typeof supabase !== 'undefined' && currentGameId) {
                const endingPlayerIndex = activePlayerIndex;
                supabase.functions.invoke('validate-end-turn', {
                    body: { gameId: currentGameId, playerIndex: endingPlayerIndex }
                }).then(({ data, error }) => {
                    if (error) { console.warn('⚠️ [R2 shadow-validator] call failed:', error); return; }
                    if (data?.legal === false) {
                        console.warn(`⚠️ [R2 shadow-validator] DISAGREEMENT — DB says turn belongs to player ${data.currentTurnIndex}, client ended turn for player ${endingPlayerIndex}`);
                    } else {
                        console.log(`✅ [R2 shadow-validator] confirmed endTurn legal for player ${endingPlayerIndex}`);
                    }
                });
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
            window.SoundSystem?.play('endturn');

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
                            persistCurrentTurnIndex(activePlayerIndex);
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

            lastMove = null; window.lastScrollAction = null; // Clear undo history on new turn

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
                    persistCurrentTurnIndex(activePlayerIndex);
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
            // Resolve which action to undo: scroll-panel moves use window.lastScrollAction
            // (different closure), everything else uses lastMove.
            const scrollAction = window.lastScrollAction;
            const action = lastMove || (scrollAction ? { type: 'scroll-move', ...scrollAction } : null);

            if (!action) {
                window.SoundSystem?.play('error');
                updateStatus('Nothing to undo!');
                return;
            }

            if (action.type === 'move') {
                // --- Undo player movement ---
                placePlayer(action.prevPos.x, action.prevPos.y);
                // Restore exact AP snapshot (handles voidAP correctly)
                currentAP = action.prevCurrentAP;
                voidAP    = action.prevVoidAP;
                document.getElementById('ap-count').textContent = currentAP;
                if (typeof refreshVoidAP === 'function') refreshVoidAP();
                updateStatus(`Undid movement. AP restored to ${getTotalAP()}.`);
                if (isMultiplayer) {
                    broadcastGameAction('undo-move', {
                        playerIndex: activePlayerIndex,
                        x: action.prevPos.x,
                        y: action.prevPos.y,
                        apRestored: currentAP
                    });
                    if (typeof syncPlayerState === 'function') syncPlayerState();
                }

            } else if (action.type === 'stone-place') {
                // --- Undo stone placement: remove it from the board and return to pool ---
                const stone = placedStones.find(s => s.id === action.stoneId);
                if (stone) {
                    if (stone.element && stone.element.parentNode) stone.element.remove();
                    placedStones.splice(placedStones.findIndex(s => s.id === action.stoneId), 1);
                    returnStoneToPool(action.element);
                    stoneCounts[action.element] = (stoneCounts[action.element] || 0) + 1;
                    updateStoneCount(action.element);
                    updateTileClasses();
                    recheckAllStoneInteractions();
                    updateAllWaterStoneVisuals();
                    updateAllVoidNullificationVisuals();
                    syncPlayerState();
                    if (isMultiplayer) {
                        broadcastGameAction('stone-break', { stoneId: action.stoneId });
                    }
                }
                // Restore any stones that were destroyed by the fire placement
                if (action.destroyedByFire && action.destroyedByFire.length > 0) {
                    action.destroyedByFire.forEach(s => {
                        placeStoneVisually(s.x, s.y, s.type);
                        if (isMultiplayer) {
                            broadcastGameAction('stone-place', { x: s.x, y: s.y, stoneType: s.type });
                        }
                    });
                }
                updateStatus(`Undid ${action.element} stone placement.`);

            } else if (action.type === 'stone-break') {
                // --- Undo stone break: re-place it and restore AP ---
                currentAP = action.prevCurrentAP;
                voidAP    = action.prevVoidAP;
                document.getElementById('ap-count').textContent = currentAP;
                if (typeof refreshVoidAP === 'function') refreshVoidAP();
                placeStoneVisually(action.x, action.y, action.element);
                if (isMultiplayer) {
                    broadcastGameAction('stone-place', { x: action.x, y: action.y, stoneType: action.element });
                    if (typeof syncPlayerState === 'function') syncPlayerState();
                }
                updateStatus(`Undid ${action.element} stone break. AP restored to ${getTotalAP()}.`);

            } else if (action.type === 'scroll-move') {
                // --- Undo scroll area move (hand↔active↔common) ---
                const sp = window.spellSystem;
                if (sp && typeof sp._undoScrollMove === 'function') {
                    sp._undoScrollMove(action.scrollName, action.from, action.to, action.displacedScroll);
                    if (window.ScrollPanelSystem) window.ScrollPanelSystem.refresh();
                    updateStatus(`Undid scroll move: ${action.scrollName} returned to ${action.from}.`);
                }
            }

            // Clear undo history
            lastMove = null;
            window.lastScrollAction = null;
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
                window.SoundSystem?.play('collectstones');

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

        // Freedom ("only applies to you") is scoped by playerIndex in
        // activeBuffs.freedom, but the teleport indicators built from it are
        // DOM elements that persist until the next recompute — with no
        // recompute wired to the turn boundary, an indicator drawn during
        // the caster's turn (correctly, per hasFreedomActive at that moment)
        // stays on the board and clickable into whoever's turn comes next.
        // Its click handler only re-checked canTakeAction()/occupancy, never
        // eligibility, so any later player could click through it and
        // teleport for free even though Freedom was never active for them.
        // Both call sites below recompute fresh off CURRENT myPlayerIndex so
        // a stale indicator can't be exploited after control passes on.
        function catacombEligibility() {
            if (!playerPosition) return { shrine: null, isCatacombLike: () => false };
            const shrine = findShrineAtPosition(playerPosition.x, playerPosition.y);
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
            return { shrine, isCatacombLike };
        }

        function updateCatacombIndicators() {
            // Remove existing indicators
            activeTeleportIndicators.forEach(ind => ind.remove());
            activeTeleportIndicators = [];

            // Only allow teleport indicators on the active player's turn
            if (typeof canTakeAction === 'function' && !canTakeAction()) return;

            const { shrine: currentShrine, isCatacombLike } = catacombEligibility();
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
                indicator.setAttribute('r', '11');
                indicator.setAttribute('fill', '#8b4513');
                indicator.setAttribute('opacity', '0.5');
                indicator.setAttribute('stroke', '#fff');
                indicator.setAttribute('stroke-width', '2');
                indicator.setAttribute('class', 'teleport-indicator');
                indicator.style.cursor = 'pointer';
                indicator.style.animation = 'catacomb-teleport-pulse 3s ease-in-out infinite';

                // Add click handler for teleportation
                indicator.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (typeof canTakeAction === 'function' && !canTakeAction()) {
                        updateStatus('Not your turn.');
                        return;
                    }

                    // Re-validate departure eligibility fresh — see
                    // catacombEligibility()'s comment. This indicator's own
                    // closure captured currentShrine/isCatacombLike from
                    // whenever it was drawn (e.g. during another player's
                    // Freedom-active turn), so trusting that snapshot here
                    // would let a leftover indicator be exploited after
                    // control passes to whoever's turn it is now.
                    const fresh = catacombEligibility();
                    if (!fresh.shrine || !fresh.isCatacombLike(fresh.shrine)) {
                        updateStatus('Cannot teleport — no catacomb/Freedom access from here anymore.');
                        updateCatacombIndicators();
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

            // Rulings tab
            const rulingsTab = document.createElement('button');
            rulingsTab.dataset.element = 'rulings';
            rulingsTab.textContent = 'Rulings';
            rulingsTab.style.cssText = `
                font-family: var(--font-pixel); font-size: 9px;
                padding: 6px 11px; border: 1px solid #aaa4;
                background: transparent; color: #aaa8; cursor: pointer;
                border-radius: 3px 3px 0 0; letter-spacing: 1px;
            `;
            rulingsTab.addEventListener('click', () => switchTab('rulings'));
            tabBar.appendChild(rulingsTab);

            box.appendChild(tabBar);

            // Scroll list content
            const content = document.createElement('div');
            content.style.cssText = `overflow-y: auto; flex: 1; padding: 12px 14px;`;
            box.appendChild(content);

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            function switchTab(el) {
                const c = el === 'rulings' ? '#aaa' : elementColor(el);

                // Update tab button styles
                tabBar.querySelectorAll('button[data-element]').forEach(btn => {
                    const bc = btn.dataset.element === 'rulings' ? '#aaa' : elementColor(btn.dataset.element);
                    const active = btn.dataset.element === el;
                    btn.style.background  = active ? `${bc}1a` : 'transparent';
                    btn.style.color       = active ? bc : `${bc}88`;
                    btn.style.borderColor = active ? bc : `${bc}44`;
                });

                content.innerHTML = '';

                // Rulings tab — render official scroll rulings
                if (el === 'rulings') {
                    const rulings = typeof SCROLL_RULINGS !== 'undefined' ? SCROLL_RULINGS : {};
                    const scrollIds = Object.keys(rulings);
                    if (scrollIds.length === 0) {
                        content.innerHTML = `<div style="color:#ccc;font-family:var(--font-terminal);padding:20px;text-align:center;">No rulings recorded yet.</div>`;
                        return;
                    }
                    const sectionLabel = document.createElement('div');
                    sectionLabel.textContent = 'Official Scroll Rulings';
                    sectionLabel.style.cssText = `font-family:var(--font-pixel);font-size:9px;color:#aaa;letter-spacing:2px;margin-bottom:12px;text-transform:uppercase;`;
                    content.appendChild(sectionLabel);

                    scrollIds.forEach(scrollId => {
                        const pattern = spellSystem?.patterns?.[scrollId];
                        const scrollRulings = rulings[scrollId];
                        if (!pattern || !scrollRulings) return;
                        const rc = elementColor(pattern.element);

                        const card = document.createElement('div');
                        card.style.cssText = `
                            border-left: 3px solid ${rc}; background: ${rc}0d;
                            border-radius: 0 4px 4px 0; padding: 10px 12px;
                            margin-bottom: 8px;
                        `;

                        const nameRow = document.createElement('div');
                        nameRow.style.cssText = `display:flex;align-items:baseline;gap:8px;margin-bottom:8px;`;
                        const nameEl = document.createElement('span');
                        nameEl.textContent = pattern.name;
                        nameEl.style.cssText = `font-family:var(--font-terminal);font-size:17px;color:${rc};`;
                        const lvl = document.createElement('span');
                        lvl.textContent = `${pattern.element.charAt(0).toUpperCase() + pattern.element.slice(1)} Lv ${pattern.level}`;
                        lvl.style.cssText = `font-family:var(--font-pixel);font-size:8px;color:#ccc;letter-spacing:1px;`;
                        nameRow.appendChild(nameEl);
                        nameRow.appendChild(lvl);
                        card.appendChild(nameRow);

                        scrollRulings.forEach(ruling => {
                            const row = document.createElement('div');
                            row.style.cssText = `display:flex;gap:8px;margin-bottom:6px;`;
                            const bullet = document.createElement('span');
                            bullet.textContent = '•';
                            bullet.style.cssText = `color:${rc};font-size:14px;flex-shrink:0;margin-top:1px;`;
                            const text = document.createElement('span');
                            text.textContent = ruling;
                            text.style.cssText = `font-family:var(--font-terminal);font-size:14px;color:#bbb;line-height:1.45;`;
                            row.appendChild(bullet);
                            row.appendChild(text);
                            card.appendChild(row);
                        });

                        content.appendChild(card);
                    });
                    return;
                }

                // Build list
                const scrollNames = (typeof SCROLL_DECKS !== 'undefined' && SCROLL_DECKS[el]) || [];

                if (scrollNames.length === 0) {
                    content.innerHTML = `<div style="color:#ccc;font-family:var(--font-terminal);padding:20px;text-align:center;">No scrolls found.</div>`;
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
                    lvl.style.cssText = `font-family: var(--font-pixel); font-size: 8px; color: #ccc; letter-spacing: 1px;`;

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

        // Stop any currently-running local bot job (spectate/run/evolve) and
        // wait for it to actually finish — BotArena.isRunning() covers all
        // three, checked between turns/generations, which can take a few
        // seconds. Returns false (with a status message already shown) if it
        // couldn't be stopped in time. Shared by the dev cheat panel and the
        // Profile-header bot training panel below — hoisted out of either
        // panel's own IIFE so both call the same instance instead of two
        // independently-maintained copies of correctness-sensitive cleanup.
        async function stopAnyRunningBotJob() {
            if (!window.BotArena.isRunning()) return true;
            updateStatus('Stopping the current bot job…');
            for (let i = 0; i < 100 && window.BotArena.isRunning(); i++) {
                window.BotArena.stop();
                await new Promise(r => setTimeout(r, 300));
            }
            if (window.BotArena.isRunning()) {
                updateStatus('Could not stop the running bot job');
                return false;
            }
            return true;
        }

        // Leave the current online room if we're in one — bot jobs
        // (spectate/run/evolve) run local hot-seat games and would otherwise
        // collide with a live multiplayer session. Shared, see note above.
        async function leaveOnlineGameIfAny() {
            if (!isMultiplayer) return;
            updateStatus('Leaving the online game…');
            if (isHost && currentGameId) {
                try {
                    const { data: players } = await supabase.from('players')
                        .select('id, username').eq('game_id', currentGameId);
                    for (const p of (players || []).filter(p => window.isBotUsername?.(p.username))) {
                        await supabase.rpc('remove_player', { p_player_id: p.id });
                    }
                } catch (e) { console.warn('bot-row cleanup failed (continuing):', e); }
            }
            if (typeof _doLeaveGame === 'function') await _doLeaveGame();
        }

        // Run one weight-training cycle: evolve() a population, then CONFIRM
        // the champion actually beats the pre-training weights in a real
        // series before keeping it (reverting to the exact prior
        // localStorage value otherwise) — see the "Confirmation gate" note
        // at this function's cheat-panel call site for why. opts.nPlayers
        // (default 2) and opts.visual (default false, i.e. muted/fast) let
        // a caller choose training-game size and pacing without changing
        // the function's own default behavior for existing callers.
        async function runWeightTraining(preset, onProgress, opts = {}) {
            const { generations, gamesPerPair, popSize, confirmGames } = preset;
            const nPlayers = opts.nPlayers ?? 2;
            // 'all' = generalist: evolve across mixed 2–5-player arenas, then
            // confirm the champion across every size (confirmAcrossSizes),
            // instead of the fixed-count evolve + 2-player run() gate.
            const allSizes = nPlayers === 'all';
            const confirmSizes = [2, 3, 4, 5];
            const gamesPerSize = preset.gamesPerSize ?? 4;
            const visual = !!opts.visual;
            const baselineWeights = { ...window.BotSystem.WEIGHTS };
            let baselineStored = null;
            try { baselineStored = localStorage.getItem('godaigo_bot_weights'); } catch (e) {}
            await leaveOnlineGameIfAny();

            const pairs = popSize * (popSize - 1) / 2;
            const sampledPerGen = opts.gamesPerGen ?? popSize * 2;
            const confirmTotal = allSizes ? confirmSizes.length * gamesPerSize : confirmGames;
            const totalGames = ((allSizes || nPlayers > 2) ? sampledPerGen * generations : pairs * gamesPerPair * generations) + confirmTotal;
            const startedAt = Date.now();
            let gamesDone = 0, lastGen = 0, lastFitness = null;
            const report = (phase) => onProgress({
                phase, gamesDone, totalGames, startedAt,
                gen: lastGen, generations, fitness: lastFitness,
                nPlayers, popSize, mode: 'training',
            });

            const champion = await window.BotArena.evolve(generations, {
                gamesPerPair, popSize, nPlayers, visual,
                gamesPerGen: (allSizes || nPlayers > 2) ? sampledPerGen : undefined,
                onGeneration: (gen, total, fitness) => { lastGen = gen; lastFitness = fitness; report('training'); },
                onGame: () => { gamesDone++; report('training'); },
            });

            // stop() during the evolve phase only cuts THAT phase short —
            // run() resets the same shared _stopRequested flag the instant
            // it starts, so without this check a cancelled evolve() would
            // silently still run the full (un-stoppable) confirmation
            // series behind it. Treat an early stop like "did not improve":
            // discard whatever evolve() got to and revert to the exact
            // pre-training weights.
            if (window.BotArena.stopRequested()) {
                window.BotArena.applyWeights(baselineWeights);
                try {
                    if (baselineStored === null) localStorage.removeItem('godaigo_bot_weights');
                    else localStorage.setItem('godaigo_bot_weights', baselineStored);
                } catch (e) {}
                return { improved: false, record: 'stopped' };
            }

            report('confirming');
            let improved, record, confirmWins, confirmLosses, confirmDraws;
            if (allSizes) {
                // Generalist gate: champion vs a field of baselines at every
                // size (2–5), rotating seats. Kept only if it's a better
                // generalist overall, not just a better duelist.
                const confirm = await window.BotArena.confirmAcrossSizes(
                    champion, baselineWeights,
                    { sizes: confirmSizes, gamesPerSize, visual, seed: Date.now() % 100000,
                      onGame: () => { gamesDone++; report('confirming'); } });
                improved = confirm.improved;
                record = confirm.record;
                confirmWins = confirm.champWins; confirmLosses = confirm.baseWins; confirmDraws = confirm.draws;
            } else {
                const confirm = await window.BotArena.run(
                    champion, baselineWeights, confirmGames, Date.now() % 100000,
                    { visual, onGame: () => { gamesDone++; report('confirming'); } });
                improved = confirm.aFitness > confirm.bFitness;
                record = `${confirm.aWins}-${confirm.bWins}` + (confirm.draws ? ` (${confirm.draws} draws)` : '');
                confirmWins = confirm.aWins; confirmLosses = confirm.bWins; confirmDraws = confirm.draws;
            }

            if (improved) {
                window.BotArena.applyWeights(champion);
                if (opts.sourceBotId) {
                    // Launched from a specific Stable bot (game-ui.js's Train
                    // button) — this is self-play improvement over THAT bot's
                    // own prior weights, not a claim about the online
                    // champion, so it goes back into the bot's own row, not
                    // the shared community table.
                    try {
                        const { error } = await supabase.from('deployed_bots')
                            .update({ weights: champion }).eq('id', opts.sourceBotId);
                        if (error) console.warn('Could not save improved weights to the bot:', error);
                    } catch (e) { console.warn('Could not save improved weights to the bot:', e); }
                } else {
                    // Best-effort share to the community champion table — only
                    // when logged in (bot_champion_weights requires
                    // auth.uid() = created_by, same pattern as game_room/
                    // players). Never blocks or fails the local training result
                    // on account of this; a network hiccup or being logged out
                    // just means this run's improvement stays local, same as
                    // before this existed.
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session?.user?.id) {
                            await supabase.from('bot_champion_weights').insert({
                                weights: champion,
                                confirm_wins: confirmWins,
                                confirm_losses: confirmLosses,
                                confirm_draws: confirmDraws,
                                created_by: session.user.id,
                            });
                        }
                    } catch (e) { console.warn('Could not share champion to Supabase (continuing):', e); }
                }
            } else {
                window.BotArena.applyWeights(baselineWeights);
                try {
                    if (baselineStored === null) localStorage.removeItem('godaigo_bot_weights');
                    else localStorage.setItem('godaigo_bot_weights', baselineStored);
                } catch (e) {}
            }
            return { improved, record };
        }

        // ─── Hill Climb training (separate method from evolve() above) ──────
        // Wraps BotArena.hillClimb() the same way runWeightTraining() wraps
        // evolve() — a champion-anchored (1+λ) monotonic climber, distinct
        // from evolve()'s population GA (see docs/bot-roadmap.md § STAGE 3a
        // and the tools/arena-headless.mjs --hillclimb CLI this mirrors).
        // Two things this MUST get right, both hard-learned from the CLI's
        // own history (planning/current.md):
        //   1. Anchor explicitly to the ONLINE champion via a direct,
        //      awaited Supabase query — never trust window.BotSystem.WEIGHTS
        //      already holding it, since bot.js's own background
        //      loadCommunityChampion() fetch is async/racy and could still
        //      be in flight (or have silently no-opped) when this starts.
        //      ABORT with a clear error rather than silently falling back to
        //      whatever WEIGHTS currently holds — a hillclimb session that
        //      thinks it's anchored to the champion but is actually anchored
        //      to defaults produces a champion that beats defaults but loses
        //      online, with no indication anything went wrong.
        //   2. A round-level promotion is NOT trustworthy on its own (30-game
        //      trials are noisy) — always run a separate confirm series
        //      against the true baseline before ever applying/submitting.
        // hillClimb() itself is 2-player only (champion vs. mutant
        // challengers) — no nPlayers concept, unlike evolve().
        async function runHillClimbTraining(preset, onProgress, opts = {}) {
            const { rounds, lambda, gamesPerChallenge, confirmGames, confirmMargin } = preset;
            const visual = !!opts.visual;

            let baseline;
            try {
                if (typeof supabase === 'undefined' || !supabase?.from) throw new Error('no Supabase client on this page');
                const { data, error } = await supabase.from('bot_champion_weights')
                    .select('weights, win_rate').order('win_rate', { ascending: false }).limit(1);
                if (error) throw new Error(error.message);
                if (!data?.length || !data[0].weights || typeof data[0].weights !== 'object') throw new Error('no champion rows in bot_champion_weights');
                baseline = data[0].weights;
            } catch (e) {
                throw new Error(`Hill Climb needs the real online champion to anchor to, not defaults — couldn't fetch it (${e.message}). Try again when online.`);
            }

            const baselineWeights = { ...window.BotSystem.WEIGHTS };
            let baselineStored = null;
            try { baselineStored = localStorage.getItem('godaigo_bot_weights'); } catch (e) {}
            await leaveOnlineGameIfAny();

            const totalGames = rounds * lambda * gamesPerChallenge + confirmGames;
            const startedAt = Date.now();
            let gamesDone = 0, lastRound = 0, lastInfo = null;
            let lastChallenger = 0, totalChallengers = lambda;
            let lastGameNum = 0, lastGameTotal = gamesPerChallenge;
            // "How rounds have gone" summary the popup renders as a compact
            // chip strip — one entry per completed round, oldest first.
            const roundHistory = [];
            // Local-game color assignment (game-core.js's colorRankOrder):
            // player index 0 = Purple, 1 = Yellow (only the first two matter —
            // every trial here is 2-player). _playSeries alternates who's
            // player 0 each game (i%2===0), so this is recomputed from the
            // CURRENT game number every report, not a fixed assignment.
            // Hex values match config.js's PLAYER_COLORS exactly.
            function sideColors() {
                if (!lastGameNum) return { aName: '—', bName: '—', aHex: '#555', bHex: '#555' };
                const aIsPlayer0 = (lastGameNum - 1) % 2 === 0;
                return aIsPlayer0
                    ? { aName: 'Purple', bName: 'Yellow', aHex: '#9458f4', bHex: '#ffce00' }
                    : { aName: 'Yellow', bName: 'Purple', aHex: '#ffce00', bHex: '#9458f4' };
            }
            const report = (phase) => {
                const { aName, bName, aHex, bHex } = sideColors();
                onProgress({
                    phase, gamesDone, totalGames, startedAt, mode: 'hillclimb',
                    round: lastRound, rounds, info: lastInfo, roundHistory,
                    challenger: lastChallenger, totalChallengers,
                    gameNum: lastGameNum, gameTotal: lastGameTotal,
                    sideAColor: aName, sideBColor: bName, sideAHex: aHex, sideBHex: bHex,
                });
            };

            const result = await window.BotArena.hillClimb({
                champion: baseline, rounds, lambda, gamesPerChallenge, visual,
                // onRound alone only updates once per ROUND — a round is
                // lambda*gamesPerChallenge games (180 by default) played
                // sequentially in this one tab (no --shards parallelism like
                // the CLI), so without onChallenger/onGame the popup would sit
                // frozen for however long that takes, looking dead rather than
                // slow, AND never say which of the lambda challengers is
                // currently up (onGame's own game count resets to 1/N for
                // every challenger, so it alone can't distinguish them).
                onChallenger: (c, totalC, r, totalR) => { lastChallenger = c; totalChallengers = totalC; lastRound = r; lastGameNum = 0; report('training'); },
                onGame: (gameNum, gameTotal) => { gamesDone++; lastGameNum = gameNum; lastGameTotal = gameTotal; report('training'); },
                onRound: (round, total, info) => {
                    lastRound = round; lastInfo = info; gamesDone = info.gamesPlayed;
                    roundHistory.push({ round, promoted: info.promoted, winRate: info.bestWinRate, decided: info.bestDecided });
                    report('training');
                },
            });

            if (window.BotArena.stopRequested()) {
                window.BotArena.applyWeights(baselineWeights);
                try {
                    if (baselineStored === null) localStorage.removeItem('godaigo_bot_weights');
                    else localStorage.setItem('godaigo_bot_weights', baselineStored);
                } catch (e) {}
                return { improved: false, record: 'stopped', promotions: result.promotions };
            }

            lastGameNum = 0; lastGameTotal = confirmGames;
            report('confirming');
            const confirm = await window.BotArena.run(
                result.champion, baseline, confirmGames, Date.now() % 100000,
                { visual, onGame: (gameNum, gameTotal) => { gamesDone++; lastGameNum = gameNum; lastGameTotal = gameTotal; report('confirming'); } });
            const decided = confirm.aWins + confirm.bWins;
            const winRate = decided ? confirm.aWins / decided : 0;
            const improved = decided >= Math.ceil(confirmGames / 2) && winRate >= confirmMargin;
            const record = `${confirm.aWins}-${confirm.bWins}` + (confirm.draws ? ` (${confirm.draws} draws)` : '');

            if (improved) {
                window.BotArena.applyWeights(result.champion);
                let session = null;
                try {
                    const { data } = await supabase.auth.getSession();
                    session = data?.session || null;
                    if (session?.user?.id) {
                        await supabase.from('bot_champion_weights').insert({
                            weights: result.champion,
                            confirm_wins: confirm.aWins,
                            confirm_losses: confirm.bWins,
                            confirm_draws: confirm.draws,
                            created_by: session.user.id,
                        });
                    }
                } catch (e) { console.warn('Could not share champion to Supabase (continuing):', e); }

                if (opts.sourceBotId) {
                    // Launched from a specific Stable bot (game-ui.js's Train
                    // button) and it just beat the reigning online champion —
                    // write the champion weights back into that bot's own row
                    // (it's now carrying the weights that just became #1) and
                    // reward the achievement. 250 XP / 50 gold are new,
                    // ungrounded-in-precedent numbers (same as the
                    // capture-chance formula was) — bigger than the 100 XP for
                    // beating a regular player's deployed bot, since
                    // dethroning the actual #1 community champion is far
                    // rarer. Tunable later.
                    try {
                        const { error } = await supabase.from('deployed_bots')
                            .update({ weights: result.champion }).eq('id', opts.sourceBotId);
                        if (error) console.warn('Could not save champion weights to the bot:', error);
                    } catch (e) { console.warn('Could not save champion weights to the bot:', e); }
                    if (session?.user?.id) {
                        const desc = `"${opts.sourceBotNickname || 'Your bot'}" dethroned the online champion`;
                        try {
                            await supabase.rpc('update_user_xp', { p_user_id: session.user.id, p_xp_points: 250, p_description: desc });
                            await supabase.rpc('award_gold', { p_user_id: session.user.id, p_gold_amount: 50, p_description: desc });
                        } catch (e) { console.warn('Could not grant the champion-defeat reward:', e); }
                    }
                }
            } else {
                window.BotArena.applyWeights(baselineWeights);
                try {
                    if (baselineStored === null) localStorage.removeItem('godaigo_bot_weights');
                    else localStorage.setItem('godaigo_bot_weights', baselineStored);
                } catch (e) {}
            }
            return { improved, record, promotions: result.promotions };
        }

        // ─── Persistent training-status popup ───────────────────────────────
        // Small fixed-corner popup showing live progress for whichever
        // Start Training run is active — visible the moment
        // a run starts, independent of whether the full "Bot Training"
        // modal is open, same spirit as the always-visible floating Hand/
        // Active/Common scroll panels (.fsp-* in css/styles.css) rather than
        // requiring a full-screen overlay to stay open just to see progress.
        // Deliberately defined at THIS outer scope (not inside
        // openBotTrainingPanel()) so it survives the modal being closed and
        // reopened: everything inside openBotTrainingPanel() — including its
        // own renderProgress()/progressText — is recreated fresh every time
        // the modal opens, but the onProgress/onGeneration callbacks a
        // running job is actually invoking were captured at whichever
        // moment it started, so a closed-and-reopened modal's fresh (empty)
        // UI never hears from an in-flight run. This popup is attached
        // directly to document.body and referenced by a stable outer
        // variable, so it keeps receiving updates regardless.
        let trainingPopupEl = null;
        function fmtPopupTime(s) { return s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`; }

        function ensureTrainingPopup() {
            if (trainingPopupEl) return trainingPopupEl;
            const el = document.createElement('div');
            el.id = 'bot-training-status-popup';
            // Fixed-corner positioning is bespoke to this floating popup, but the
            // header row reuses the SAME .panel-header/.panel-title/.hud-toggle-btn
            // classes every other HUD panel (Hand/Active/opponent Players, etc.)
            // uses — same visual language, not a one-off popup style. No emoji
            // anywhere in here — player-facing, and the user explicitly asked
            // for plain design elements (color swatches / chips) instead.
            el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9998;'
                + 'background:#1a1a2e;border:1px solid #5a5;border-radius:8px;'
                + 'box-shadow:0 4px 16px rgba(0,0,0,0.6);overflow:hidden;'
                + 'min-width:280px;max-width:360px;font-size:11px;color:#ccc;display:none;';
            el.innerHTML = `
                <div class="panel-header" style="border-radius:7px 7px 0 0;">
                    <span class="panel-title">Bot Training</span>
                    <button id="bt-popup-expand" class="hud-toggle-btn" title="Open full panel">⤢</button>
                </div>
                <div style="padding:12px 14px;">
                    <div id="bt-popup-scenario" style="font-size:12px;font-weight:600;color:#eee;margin-bottom:2px;"></div>
                    <div id="bt-popup-phase" style="font-size:11px;color:#999;margin-bottom:10px;"></div>

                    <div id="bt-popup-matchup" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:#ddd;margin-bottom:8px;min-height:16px;"></div>

                    <div style="background:#0d0d18;border:1px solid #333;border-radius:5px;height:10px;overflow:hidden;margin-bottom:4px;">
                        <div id="bt-popup-bar" style="height:100%;background:linear-gradient(90deg,#8a6a3f,#d9b08c);width:0%;transition:width .25s ease-out;"></div>
                    </div>
                    <div id="bt-popup-progress-text" style="font-size:10px;color:#888;margin-bottom:10px;"></div>

                    <div id="bt-popup-history-label" style="font-size:10px;color:#888;margin-bottom:4px;display:none;">Round history — filled = promoted</div>
                    <div id="bt-popup-history" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:10px;"></div>

                    <div id="bt-popup-summary" style="font-size:11px;color:#aaa;margin-bottom:10px;"></div>

                    <div style="display:flex;gap:6px;">
                        <button id="bt-popup-end-early" style="flex:1;padding:4px 6px;background:#2d3a4a;color:#eee;border:1px solid #578;border-radius:4px;cursor:pointer;font-size:11px;">End Early → Test Now</button>
                        <button id="bt-popup-stop" style="padding:4px 8px;background:#442d2d;color:#eee;border:1px solid #755;border-radius:4px;cursor:pointer;font-size:11px;">Stop</button>
                    </div>
                </div>
            `;
            document.body.appendChild(el);
            el.querySelector('#bt-popup-expand').onclick = () => {
                if (typeof window._openBotTrainingPanel === 'function') window._openBotTrainingPanel();
            };
            el.querySelector('#bt-popup-end-early').onclick = () => {
                if (window.BotArena?.isRunning()) {
                    window.BotArena.endEarly();
                    updateStatus('Ending training early — running the confirmation match against the starting weights with the best result so far…');
                }
            };
            el.querySelector('#bt-popup-stop').onclick = () => {
                if (window.BotArena?.isRunning()) {
                    window.BotArena.stop();
                    updateStatus('Stopping — this run\'s result will be discarded, keeping the previous weights.');
                }
            };
            trainingPopupEl = el;
            return el;
        }

        function swatch(hex) {
            return `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${hex};flex-shrink:0;"></span>`;
        }

        // p: {phase, gamesDone, totalGames, startedAt, gen, generations,
        //     fitness, nPlayers, popSize, mode:'training'|'breeding'|'hillclimb',
        //     round, rounds, challenger, totalChallengers, gameNum, gameTotal,
        //     sideAColor/sideBColor/sideAHex/sideBHex, roundHistory, info}
        function showTrainingPopup(p) {
            const el = ensureTrainingPopup();
            el.style.display = 'block';
            const pct = p.totalGames ? Math.min(100, (p.gamesDone / p.totalGames) * 100) : 0;
            const elapsedS = (Date.now() - p.startedAt) / 1000;
            let scenarioLine, phaseLine, summaryLine, matchupHtml = '';
            const historyEl = el.querySelector('#bt-popup-history');
            const historyLabelEl = el.querySelector('#bt-popup-history-label');
            historyEl.innerHTML = '';
            historyLabelEl.style.display = 'none';

            if (p.mode === 'hillclimb') {
                scenarioLine = 'Hill Climb — champion-anchored';
                phaseLine = p.phase === 'confirming'
                    ? 'Confirming climbed champion vs. online baseline'
                    : `Round ${p.round}/${p.rounds}`;
                // The explicit "what is literally happening right now" line —
                // which challenger (or, once confirming, the climbed champion),
                // which game in its series, and a real color swatch for each
                // side THIS game. Colors come pre-computed from the current
                // game's parity (runHillClimbTraining's sideColors()) — sides
                // alternate every game, never a fixed assignment.
                if (p.gameNum) {
                    const [aLabel, bLabel] = p.phase === 'confirming'
                        ? ['Climbed champion', 'Online champion']
                        : [`Challenger ${p.challenger}/${p.totalChallengers}`, 'Champion'];
                    matchupHtml = `${swatch(p.sideAHex)} ${aLabel} <span style="color:#666;">vs</span> ${swatch(p.sideBHex)} ${bLabel}`
                        + `<span style="color:#777;margin-left:auto;">game ${p.gameNum}/${p.gameTotal}</span>`;
                } else if (p.challenger) {
                    matchupHtml = `Challenger ${p.challenger}/${p.totalChallengers} vs. Champion <span style="color:#777;">— starting…</span>`;
                }
                summaryLine = p.info
                    ? `${p.info.promotions} promotion${p.info.promotions === 1 ? '' : 's'} so far · this round's best challenger: ${Math.round(p.info.bestWinRate * 100)}%`
                    : 'Climbing…';
                // The "how have rounds gone" summary: one chip per completed
                // round (filled gold = promoted, hollow = held), plus a dashed
                // chip for whichever round is still in progress.
                if (p.roundHistory?.length || p.round > 0) {
                    historyLabelEl.style.display = 'block';
                    for (const h of p.roundHistory) {
                        const chip = document.createElement('span');
                        chip.title = `Round ${h.round}: ${h.promoted ? 'Promoted' : 'Held'} — ${Math.round(h.winRate * 100)}% of ${h.decided} decided`;
                        chip.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:2px;'
                            + (h.promoted ? 'background:#d9b08c;border:1px solid #d9b08c;' : 'background:#242438;border:1px solid #444;');
                        historyEl.appendChild(chip);
                    }
                    if (p.phase !== 'confirming' && p.round > p.roundHistory.length) {
                        const inProgress = document.createElement('span');
                        inProgress.title = `Round ${p.round}: in progress`;
                        inProgress.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:2px;border:1px dashed #888;background:transparent;';
                        historyEl.appendChild(inProgress);
                    }
                }
            } else {
                const playersLabel = p.nPlayers === 'all' ? 'all sizes (2–5)' : `${p.nPlayers || 2} players`;
                scenarioLine = `Training — ${playersLabel}, population ${p.popSize || '?'}`;
                phaseLine = p.phase === 'confirming'
                    ? (p.nPlayers === 'all'
                        ? 'Confirming: champion vs. baseline at every size'
                        : 'Confirming: new champion vs. starting weights')
                    : `Generation ${p.gen}/${p.generations}`;
                const bestFitness = Array.isArray(p.fitness) && p.fitness.length ? Math.max(...p.fitness) : null;
                summaryLine = bestFitness !== null ? `Best fitness so far: ${bestFitness.toFixed(1)}` : '';
            }

            el.querySelector('#bt-popup-scenario').textContent = scenarioLine;
            el.querySelector('#bt-popup-phase').textContent = phaseLine;
            el.querySelector('#bt-popup-matchup').innerHTML = matchupHtml;
            el.querySelector('#bt-popup-bar').style.width = `${pct}%`;
            el.querySelector('#bt-popup-progress-text').textContent =
                `Games: ${p.gamesDone}/${p.totalGames} (${pct.toFixed(0)}%) · ${fmtPopupTime(elapsedS)} elapsed`;
            el.querySelector('#bt-popup-summary').textContent = summaryLine || '';
            // Nothing left to "skip ahead to" once already confirming —
            // and breeding has no confirmation phase to jump to at all, so
            // End Early there just means "stop generating more generations
            // and download the current best now" (still meaningful, keep
            // the button, only the confirming-phase case hides it).
            const endEarlyBtn = el.querySelector('#bt-popup-end-early');
            if (endEarlyBtn) endEarlyBtn.style.display = p.phase === 'confirming' ? 'none' : 'block';
        }

        function hideTrainingPopup() {
            if (trainingPopupEl) trainingPopupEl.style.display = 'none';
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
                panel.appendChild(makeBtn('Download Action Log', () => {
                    if (typeof window.ActionLog?.download === 'function') window.ActionLog.download();
                    else updateStatus('Action log not available');
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

                // Bot Brain toggle — cycles Dumb → Smart → Hybrid.
                //   Dumb   = Stage-1 greedy scoring (default)
                //   Smart  = Stage-2 lookahead search (3 plies) on every action
                //   Hybrid = lookahead only when a cast/stone placement is on
                //            the table; plain movement stays greedy (cheap)
                // Persisted to localStorage; bot.js applies it at load, and we
                // also apply it live so no reload is needed.
                const BRAIN_ORDER = ['dumb', 'smart', 'hybrid'];
                const BRAIN_UI = {
                    dumb:   { label: '🤖 Bot Brain: Dumb (greedy)',    color: '#eee' },
                    smart:  { label: '🧠 Bot Brain: Smart (lookahead)', color: '#6ef' },
                    hybrid: { label: '🧠 Bot Brain: Hybrid',            color: '#fc6' },
                };
                function currentBrain() {
                    // default matches DEFAULT_WEIGHTS (hybrid, per arena evidence)
                    try { return localStorage.getItem('godaigo_bot_brain') || 'hybrid'; }
                    catch (e) { return 'hybrid'; }
                }
                function applyBrain(mode) {
                    const W = window.BotSystem?.WEIGHTS;
                    if (W) {
                        W.searchDepth = (mode === 'dumb') ? 0 : 3;
                        W.searchHybrid = (mode === 'hybrid') ? 1 : 0;
                    }
                    try { localStorage.setItem('godaigo_bot_brain', mode); } catch (e) {}
                }
                const brainBtn = makeBtn('', () => {
                    const next = BRAIN_ORDER[(BRAIN_ORDER.indexOf(currentBrain()) + 1) % BRAIN_ORDER.length];
                    applyBrain(next);
                    brainBtn.textContent = BRAIN_UI[next].label;
                    brainBtn.style.color = BRAIN_UI[next].color;
                    updateStatus(
                        next === 'dumb'  ? 'Bot brain: DUMB — one-step greedy scoring'
                      : next === 'smart' ? 'Bot brain: SMART — 3-ply lookahead on every action'
                      : 'Bot brain: HYBRID — lookahead for casts/stone placements, greedy movement');
                });
                brainBtn.textContent = BRAIN_UI[currentBrain()].label;
                brainBtn.style.color = BRAIN_UI[currentBrain()].color;
                panel.appendChild(brainBtn);

                // Shared prep for restartAsBots/restartAsEvolve, from ANY game
                // context: stop whatever bot session is already running, then
                // leave the online room if we're in one. Returns false (with a
                // status message) if prep failed, so the caller can bail before
                // starting its own bot session.
                async function stopAnyMatchAndLeaveMultiplayer() {
                    if (!window.BotArena) { updateStatus('BotArena not loaded'); return false; }
                    panel.remove(); // clear the panel; reopen any time via the AP label
                    if (!await stopAnyRunningBotJob()) return false;
                    await leaveOnlineGameIfAny();
                    return true;
                }

                // Start an all-bot spectator match with a CHOSEN player count.
                // The action log auto-downloads when the match ends.
                async function restartAsBots(n) {
                    if (!(await stopAnyMatchAndLeaveMultiplayer())) return;
                    try {
                        await window.BotArena.spectate(n);
                    } catch (err) {
                        console.error('Bot match failed:', err);
                        updateStatus('Bot match failed — see console');
                    }
                }

                // Start a VISUALIZED weight-evolution run with n players per
                // training game (2 = original pairwise round-robin; >2 samples
                // random N-player groupings each generation — see bot-arena.js).
                // Small defaults so a full run finishes in a few minutes, not
                // hours — tune further from the console with BotArena.evolve().
                async function restartAsEvolve(n) {
                    if (!(await stopAnyMatchAndLeaveMultiplayer())) return;
                    try {
                        const generations = 3;
                        const popSize = 6;
                        await window.BotArena.evolve(generations, {
                            nPlayers: n,
                            visual: true,
                            popSize,
                            gamesPerPair: 1,
                            gamesPerGen: n > 2 ? popSize * 2 : undefined,
                        });
                    } catch (err) {
                        console.error('Evolve run failed:', err);
                        updateStatus('Evolve run failed — see console');
                    }
                }

                const matchRow = document.createElement('div');
                matchRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
                const matchLabel = document.createElement('span');
                matchLabel.textContent = '🤖 Bot match:';
                matchLabel.style.cssText = 'font-size:12px;color:#aaa;';
                matchRow.appendChild(matchLabel);
                [2, 3, 4, 5].forEach(n => {
                    const b = document.createElement('button');
                    b.textContent = String(n);
                    b.title = `Restart as a ${n}-bot spectator match (leaves the online game if needed)`;
                    b.style.cssText = 'padding:4px 9px;background:#2d2d44;color:#eee;border:1px solid #555;border-radius:5px;cursor:pointer;font-size:13px;';
                    b.onclick = () => restartAsBots(n);
                    matchRow.appendChild(b);
                });
                const stopBtn = document.createElement('button');
                stopBtn.textContent = '⏹';
                stopBtn.title = 'Stop the running bot session (match or evolve — action log still downloads for a match)';
                stopBtn.style.cssText = 'padding:4px 9px;background:#442d2d;color:#eee;border:1px solid #755;border-radius:5px;cursor:pointer;font-size:13px;';
                stopBtn.onclick = () => {
                    if (window.BotArena?.isRunning()) { window.BotArena.stop(); updateStatus('Stopping bot session…'); }
                    else updateStatus('No bot session running');
                };
                matchRow.appendChild(stopBtn);
                panel.appendChild(matchRow);

                // 🧬 Evolve: same visualized-match core as Bot match above, but
                // plays a small weight-evolution run (3 generations, pop 6)
                // instead of a single game — watch the population improve live.
                // Champion weights are saved to localStorage['godaigo_bot_weights']
                // after every generation and picked up automatically on reload.
                const evolveRow = document.createElement('div');
                evolveRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
                const evolveLabel = document.createElement('span');
                evolveLabel.textContent = '🧬 Evolve:';
                evolveLabel.title = 'Watch a small weight-evolution run (3 generations, pop 6). Tune further from the console: BotArena.evolve(generations, {nPlayers, visual, popSize, gamesPerPair, gamesPerGen})';
                evolveLabel.style.cssText = 'font-size:12px;color:#aaa;';
                evolveRow.appendChild(evolveLabel);
                [2, 3, 4, 5].forEach(n => {
                    const b = document.createElement('button');
                    b.textContent = String(n);
                    b.title = `Evolve with ${n}-player training games (leaves the online game if needed)`;
                    b.style.cssText = 'padding:4px 9px;background:#2d2d44;color:#eee;border:1px solid #555;border-radius:5px;cursor:pointer;font-size:13px;';
                    b.onclick = () => restartAsEvolve(n);
                    evolveRow.appendChild(b);
                });
                panel.appendChild(evolveRow);

                // Same-size convenience: your seat handed to a bot, table
                // size kept. Use the numbered buttons above to pick a count.
                panel.appendChild(makeBtn('🔁 Restart bot game without player (same size)', () =>
                    restartAsBots(Math.max(2, Math.min(5, (playerPositions || []).filter(Boolean).length || 2)))));

                // Weight evolution (BotArena.evolve — roadmap Stage 3a): runs a
                // MUTED self-play arena in the background, then a CONFIRMATION
                // match against the weights in place before training started,
                // only applying/keeping the result if it actually won that
                // match. This mirrors the roadmap's own Stage 3a acceptance bar
                // ("champion beats the hand-tuned defaults...") — a single
                // game per evolve() pairing (the "quick" preset) is noisy
                // enough that its per-generation pick can win by luck, not by
                // being better, so nothing here should be trusted without
                // being checked against a real baseline first (see
                // docs/bot-roadmap.md's "Confirmation gate" note — v1 of this
                // button applied evolve()'s result unconditionally and could
                // silently make bots worse). evolve() itself still
                // auto-persists to localStorage every generation
                // (pre-existing, intentional design so a console-run evolve()
                // takes effect on reload) — this only decides whether to KEEP
                // what got written, reverting it if the result didn't hold up.
                // Leaves any online game first, same reasoning as the
                // bot-match buttons above: this plays local hot-seat games
                // under the hood. (runWeightTraining itself is hoisted above
                // initCheatPanel — shared with the bot training panel.)

                // Shared progress meter for whichever training preset is running.
                const progressWrap = document.createElement('div');
                progressWrap.style.cssText = 'display:none;flex-direction:column;gap:4px;';
                const progressBarOuter = document.createElement('div');
                progressBarOuter.style.cssText = 'background:#111;border:1px solid #444;border-radius:4px;height:8px;overflow:hidden;';
                const progressBarInner = document.createElement('div');
                progressBarInner.style.cssText = 'background:#6ef;height:100%;width:0%;';
                progressBarOuter.appendChild(progressBarInner);
                const progressText = document.createElement('div');
                progressText.style.cssText = 'font-size:11px;color:#aaa;white-space:pre-line;';
                progressWrap.appendChild(progressBarOuter);
                progressWrap.appendChild(progressText);

                function fmtTime(s) { return s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`; }
                function renderProgress(p) {
                    progressWrap.style.display = 'flex';
                    const pct = p.totalGames ? Math.min(100, (p.gamesDone / p.totalGames) * 100) : 0;
                    progressBarInner.style.width = pct.toFixed(1) + '%';
                    const elapsedS = (Date.now() - p.startedAt) / 1000;
                    const rate = p.gamesDone > 0 ? elapsedS / p.gamesDone : null;
                    const etaS = rate ? Math.max(0, (p.totalGames - p.gamesDone) * rate) : null;
                    const genLine = p.fitness
                        ? `gen ${p.gen}/${p.generations} · fitness ${p.fitness.map(f => f.toFixed(1)).join(', ')}`
                        : `gen ${p.gen}/${p.generations}`;
                    progressText.textContent =
                        `${p.phase === 'confirming' ? 'Confirming result' : 'Training'} — ${genLine}\n` +
                        `games ${p.gamesDone}/${p.totalGames} (${pct.toFixed(0)}%) · elapsed ${fmtTime(elapsedS)}` +
                        (etaS != null ? ` · ETA ~${fmtTime(etaS)}` : '');
                }
                function hideProgress() { progressWrap.style.display = 'none'; }

                // Two presets: "quick" is the fast sample (few minutes, noisy —
                // may often correctly report no improvement); "thorough" is a
                // real training run (~700 games, likely 1-2+ hours) closer to
                // the roadmap's own spec. Both share the confirmation gate
                // above, so neither can silently apply a worse result.
                const TRAIN_PRESETS = {
                    quick:    { label: '🧬 Train Weights (quick, ~55 games)',
                                generations: 3, gamesPerPair: 1, popSize: 6, confirmGames: 10 },
                    thorough: { label: '🧬 Train Weights (thorough, ~700 games, 1-2+ hrs)',
                                generations: 8, gamesPerPair: 3, popSize: 8, confirmGames: 20 },
                };
                let quickBtn, thoroughBtn;
                function makeTrainButton(key) {
                    const preset = TRAIN_PRESETS[key];
                    const btn = makeBtn(preset.label, async () => {
                        if (!window.BotArena) { updateStatus('BotArena not loaded'); return; }
                        if (window.BotArena.isEvolving()) { updateStatus('Already training — use ⏹ to stop it'); return; }
                        if (!await stopAnyRunningBotJob()) return;
                        quickBtn.disabled = true;
                        thoroughBtn.disabled = true;
                        btn.textContent = `${preset.label} — starting…`;
                        try {
                            const { improved, record } = await runWeightTraining(preset, (p) => {
                                renderProgress(p);
                                btn.textContent = p.phase === 'confirming'
                                    ? `${preset.label} — confirming…`
                                    : `${preset.label} — gen ${p.gen}/${preset.generations}`;
                            });
                            hideProgress();
                            updateStatus(improved
                                ? `Training complete — champion beat the starting weights ${record} in the confirmation ` +
                                  `match. New weights applied live and saved. (Board shows the last game — start a new ` +
                                  `game to keep playing.)`
                                : `Training finished but did not beat the starting weights (${record}) in the ` +
                                  `confirmation match — kept the previous weights. (Board shows the last game — start ` +
                                  `a new game to keep playing.)`);
                        } catch (err) {
                            console.error('Weight training failed:', err);
                            hideProgress();
                            updateStatus('Weight training failed — see console');
                        } finally {
                            quickBtn.disabled = false;
                            thoroughBtn.disabled = false;
                            btn.textContent = preset.label;
                        }
                    });
                    return btn;
                }
                quickBtn = makeTrainButton('quick');
                thoroughBtn = makeTrainButton('thorough');

                panel.appendChild(quickBtn);
                const thoroughRow = document.createElement('div');
                thoroughRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
                thoroughRow.appendChild(thoroughBtn);
                const trainStopBtn = document.createElement('button');
                trainStopBtn.textContent = '⏹';
                trainStopBtn.title = 'Stop training after the current generation finishes';
                trainStopBtn.style.cssText = 'padding:4px 9px;background:#442d2d;color:#eee;border:1px solid #755;border-radius:5px;cursor:pointer;font-size:13px;';
                trainStopBtn.onclick = () => {
                    if (window.BotArena?.isEvolving()) { window.BotArena.stop(); updateStatus('Stopping after this generation…'); }
                    else updateStatus('No training run in progress');
                };
                thoroughRow.appendChild(trainStopBtn);
                panel.appendChild(thoroughRow);
                panel.appendChild(progressWrap);

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
                        ['scroll_cast',     'Scroll activated'],
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

        // ─── Bot Training window ────────────────────────────────────────────
        // A lighter, player-facing sibling of the dev cheat panel's Train
        // Weights buttons: pick a player count and a speed, press Start —
        // plus a live roster of the current population, a generation-by-
        // generation log, and a click-through weight diagram per bot, so
        // the "what is actually happening" question has a real answer
        // on-screen instead of just a progress bar.
        // Activate: click the Profile modal's header ("Profile" —
        // <h2 class="gami-title">, always that exact text regardless of
        // which tab is active, see gamification-ui.js) 5 times within 3
        // seconds — same debounce pattern as the AP-label trigger above.
        (function initBotTrainingPanel() {
            let clickCount = 0;
            let clickTimer = null;
            const state = { n: 2, watchable: true, generations: 5, method: 'evolve', sourceBotId: null, sourceBotNickname: null };

            // Weight groupings mirror the section comments in bot.js's
            // DEFAULT_WEIGHTS — used purely for the drill-down diagram, so
            // a 50-number table reads as "these are about movement" instead
            // of one long undifferentiated list.
            const WEIGHT_CATEGORIES = [
                { name: 'Activating', keys: ['castBase', 'castUnactivated', 'castDeadElement', 'castAlreadyWon', 'castNoCredit', 'castLevel'] },
                { name: 'Stone placement', keys: ['placeBase', 'placeProgress', 'placeUnactivated', 'placeNoCredit', 'placeDoomed', 'planDeficitPenalty'] },
                { name: 'Movement', keys: ['moveBase', 'moveShrineValue', 'moveApPenalty', 'moveExplore', 'moveExploreGradient', 'moveExplorePath', 'moveRevisitPenalty', 'moveFixation'] },
                { name: 'Breaking a stone', keys: ['breakStoneBase', 'breakStoneApPenalty'] },
                { name: 'Returning home', keys: ['moveReturnHome'] },
                { name: 'Ending the turn', keys: ['endTurnBase', 'endTurnOnShrine', 'endTurnLowAp'] },
                { name: 'Discarding', keys: ['discardBase', 'discardActivated', 'discardDeadElement', 'discardLevel', 'discardVoluntary', 'discardResponseOnly'] },
                { name: 'Transmute', keys: ['transmuteTargetAP'] },
                { name: 'Placement phase', keys: ['placeTileBase', 'placeTileCentroidPenalty'] },
                { name: 'Shrine valuation', keys: ['shrineNeed', 'shrineUnactivated', 'shrineDeadSource'] },
                { name: 'Lookahead search (set by Bot Brain, not trained)', keys: ['searchDepth', 'searchBreadth', 'searchHybrid'] },
                { name: 'State evaluation (used only when search is active)', keys: ['evalWin', 'evalActivated', 'evalStoneNeeded', 'evalStone', 'evalScrollHeld', 'evalAp', 'evalUnsimCast', 'evalHiddenDist', 'evalHomeDist'] },
                { name: 'Opponent awareness', keys: ['evalOpponentThreat', 'evalCommonThreat'] },
            ];

            // Small inline "(?)" tooltip — native title attribute, no extra
            // wiring. Used next to jargon (Population, Generation, Fitness, ...).
            function infoIcon(text) {
                const s = document.createElement('span');
                s.textContent = ' ⓘ';
                s.title = text;
                s.style.cssText = 'color:#6ef;cursor:help;font-size:11px;';
                return s;
            }

            function openBotTrainingPanel() {
                const existing = document.getElementById('bot-training-overlay');
                if (existing) { existing.remove(); return; }
                if (!window.BotArena) { updateStatus('BotArena not loaded'); return; }

                // Stable's "Train" button (gamification-ui.js) signals which bot
                // this session is for via this one-shot window property — it
                // already applied that bot's weights before opening. Consumed
                // here into `state` (which persists across this modal being
                // closed/reopened mid-run, e.g. via the popup's expand button)
                // rather than read fresh every open, so a LATER unrelated open
                // (the secret 5-click trigger) doesn't inherit a stale bot.
                if (window._botTrainingSource) {
                    state.sourceBotId = window._botTrainingSource.id;
                    state.sourceBotNickname = window._botTrainingSource.nickname;
                    window._botTrainingSource = null;
                }

                // ── Shell: full-screen overlay + centered modal box ──────────
                const overlay = document.createElement('div');
                overlay.id = 'bot-training-overlay';
                Object.assign(overlay.style, {
                    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)',
                    zIndex: '9999', display: 'flex', alignItems: 'center', justifyContent: 'center',
                });
                overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

                const modal = document.createElement('div');
                Object.assign(modal.style, {
                    background: '#1a1a2e', border: '1px solid #444', borderRadius: '10px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7)', width: 'min(920px, 94vw)',
                    maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                });
                overlay.appendChild(modal);

                const header = document.createElement('div');
                header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #333;flex-shrink:0;';
                const title = document.createElement('div');
                title.textContent = 'Bot Training';
                title.style.cssText = 'font-size:15px;font-weight:bold;color:#eee;';
                header.appendChild(title);
                const closeBtn = document.createElement('button');
                closeBtn.textContent = '✕';
                closeBtn.style.cssText = 'background:none;border:1px solid #555;border-radius:5px;color:#ccc;cursor:pointer;padding:3px 10px;font-size:13px;';
                closeBtn.onclick = () => overlay.remove();
                header.appendChild(closeBtn);
                modal.appendChild(header);

                const body = document.createElement('div');
                body.style.cssText = 'padding:14px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;';
                modal.appendChild(body);

                const desc = document.createElement('div');
                desc.textContent = 'Trains the bots you play against. New weights are only kept if they beat the current ones in a confirmation match at the end. A small progress popup stays visible in the corner even after you close this panel — use it to check in or end the run early.';
                desc.style.cssText = 'font-size:11px;color:#999;';
                body.appendChild(desc);

                if (state.sourceBotId) {
                    const sourceBanner = document.createElement('div');
                    sourceBanner.textContent = `Training: "${state.sourceBotNickname}" — a win updates this bot in your Stable`
                        + (state.method === 'hillclimb' ? ' and, if it beats the online champion, dethrones them for a reward.' : '.');
                    sourceBanner.style.cssText = 'font-size:11px;color:#d9b08c;background:#2a2416;border:1px solid #5a4a2a;border-radius:5px;padding:6px 10px;';
                    body.appendChild(sourceBanner);
                }

                // ── Controls: Players / Speed / Repeat ───────────────────────
                const controls = document.createElement('div');
                controls.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
                body.appendChild(controls);

                // isDisabled: optional () => bool for a row disabled for a
                // reason OTHER than "a run is active" (e.g. Players is fixed
                // at 2 while Method is Hill Climb — that trainer has no
                // nPlayers concept). Returns {repaint} so other rows (Method)
                // can force a repaint of THIS row when their own value changes.
                function makeChoiceRow(label, options, getValue, setValue, help, isDisabled) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
                    const lbl = document.createElement('span');
                    lbl.textContent = label;
                    lbl.style.cssText = 'font-size:12px;color:#aaa;min-width:52px;';
                    row.appendChild(lbl);
                    if (help) row.appendChild(infoIcon(help));
                    const buttons = options.map(opt => {
                        const b = document.createElement('button');
                        b.textContent = opt.text;
                        if (opt.title) b.title = opt.title;
                        row.appendChild(b);
                        return { b, value: opt.value };
                    });
                    function repaint() {
                        const rowDisabled = !!isDisabled?.();
                        for (const { b, value } of buttons) {
                            const on = value === getValue();
                            b.style.cssText = `padding:4px 9px;border-radius:5px;cursor:${rowDisabled ? 'not-allowed' : 'pointer'};font-size:12px;opacity:${rowDisabled ? '0.45' : '1'};` +
                                `border:1px solid ${on ? '#6ef' : '#555'};background:${on ? '#2d4a4a' : '#2d2d44'};color:#eee;`;
                        }
                    }
                    for (const { b, value } of buttons) {
                        b.onclick = () => {
                            if (startBtnRef.disabled || isDisabled?.()) return; // locked while a run is active, or by another control
                            setValue(value);
                            repaint();
                        };
                    }
                    repaint();
                    controls.appendChild(row);
                    return { repaint };
                }

                // startBtnRef is read inside makeChoiceRow's onclick above, so it
                // needs to exist (even if reassigned below) before the rows are built.
                const startBtnRef = { disabled: false };

                // Method picked FIRST — Players' row below reads state.method
                // to decide whether it's disabled, so it needs to exist first.
                // Evolve = population GA (evolve() below) — noisier, ranks
                // siblings against each other. Hill Climb = champion-anchored
                // (1+λ) monotonic climber (hillClimb()) — holds the ONLINE
                // champion fixed as the opponent every mutant challenger must
                // clear a real margin against; the reliable trainer, same one
                // driving the CLI's --hillclimb sessions. 2-player only — no
                // nPlayers concept, unlike evolve().
                makeChoiceRow('Method:', [
                    { value: 'evolve', text: 'Evolve (GA)', title: 'Population-based genetic algorithm — a pool of weight-tables competes and breeds each generation.' },
                    { value: 'hillclimb', text: 'Hill Climb', title: 'Champion-anchored climber — mutant challengers must beat the CURRENT ONLINE CHAMPION by a real margin to be promoted. 2 players only. The more reliable trainer.' },
                ], () => state.method, (v) => { state.method = v; if (v === 'hillclimb') state.n = 2; playersRow.repaint(); });

                const playersRow = makeChoiceRow('Players:',
                    [2, 3, 4, 5].map(n => ({ value: n, text: String(n) })).concat([
                        { value: 'all', text: 'All', title: 'Generalist: train across arenas of every size (2–5 players) and confirm the champion across every size too. Best for real lobbies, which can be 2–5 players.' },
                    ]),
                    () => state.n, (v) => { state.n = v; },
                    'How many bots play each training game. "All" trains across mixed 2–5-player arenas and confirms the champion at every size. The POPULATION (the pool of competing weight-tables) is a separate number — see the roster below — this only controls how many are sampled into any one game. Fixed at 2 for Hill Climb, which has no population/nPlayers concept.',
                    () => state.method === 'hillclimb');

                makeChoiceRow('Speed:', [
                    { value: true, text: 'Watchable', title: 'Normal pacing — watch the board play out' },
                    { value: false, text: 'Extreme', title: 'Muted, minimal delay — much faster, nothing to watch (a true no-UI "headless" mode isn\'t possible in the browser tab the live game runs in)' },
                ], () => state.watchable, (v) => { state.watchable = v; });

                // For Evolve this is evolve()'s generation count; for Hill
                // Climb it's the number of climbing ROUNDS (each round plays
                // lambda=6 challengers × 30 games, same
                // proportional-not-literal-game-count caveat applies).
                makeChoiceRow('Repeat:',
                    [1, 5, 10, 20, 50].map(n => ({ value: n, text: String(n) })),
                    () => state.generations, (v) => { state.generations = v; },
                    'Evolve: number of GENERATIONS, not total games — each generation plays many games on its own. Hill Climb: number of climbing ROUNDS — each round plays 6 challengers × 30 games vs the champion. Either way this is proportionally, not literally, that many games.');

                const progressText = document.createElement('div');
                progressText.style.cssText = 'font-size:11px;color:#aaa;white-space:pre-line;display:none;';
                body.appendChild(progressText);

                function fmtTime(s) { return s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`; }
                function renderProgress(p) {
                    progressText.style.display = 'block';
                    const pct = p.totalGames ? Math.min(100, (p.gamesDone / p.totalGames) * 100) : 0;
                    const elapsedS = (Date.now() - p.startedAt) / 1000;
                    let genLine;
                    if (p.mode === 'hillclimb') {
                        genLine = p.phase === 'confirming' ? 'confirming vs. online baseline' : `round ${p.round}/${p.rounds}`;
                        if (p.gameNum) {
                            genLine += p.phase === 'confirming'
                                ? ` — climbed champ (${p.sideAColor}) vs. online champ (${p.sideBColor}), game ${p.gameNum}/${p.gameTotal}`
                                : ` — challenger ${p.challenger}/${p.totalChallengers} (${p.sideAColor}) vs. champion (${p.sideBColor}), game ${p.gameNum}/${p.gameTotal}`;
                        }
                    } else {
                        genLine = p.phase === 'confirming' ? 'Confirming result' : `gen ${p.gen}/${p.generations}`;
                    }
                    progressText.textContent = `${genLine} — games ${p.gamesDone}/${p.totalGames} (${pct.toFixed(0)}%) · ${fmtTime(elapsedS)}`;
                    // Also update the persistent corner popup — see its own
                    // comment for why it's a separate, outer-scope function
                    // rather than just this progressText element.
                    showTrainingPopup(p);
                }

                const actionRow = document.createElement('div');
                actionRow.style.cssText = 'display:flex;gap:8px;';
                body.appendChild(actionRow);

                const startBtn = document.createElement('button');
                startBtn.textContent = 'Start Training';
                startBtn.style.cssText = 'padding:6px 10px;background:#2d4a2d;color:#eee;border:1px solid #5a5;border-radius:5px;cursor:pointer;font-size:12px;';
                actionRow.appendChild(startBtn);

                const stopBtn = document.createElement('button');
                stopBtn.textContent = 'Stop';
                stopBtn.style.cssText = 'padding:5px 9px;background:#442d2d;color:#eee;border:1px solid #755;border-radius:5px;cursor:pointer;font-size:12px;';
                stopBtn.onclick = () => {
                    if (window.BotArena?.isRunning()) { window.BotArena.stop(); updateStatus('Stopping after the current generation…'); }
                    else updateStatus('No training run in progress');
                };
                actionRow.appendChild(stopBtn);

                // ── Live roster + generation log + weight-diagram drill-down ──
                // Populated by Start Training's Evolve method (Hill Climb has
                // no population concept). Population membership persists id/lineage across
                // generations (see bot-arena.js's newMember()/elites), so the
                // roster can show "same bot survived" vs "freshly bred" from
                // one generation to the next instead of just bare numbers.
                const insightRow = document.createElement('div');
                insightRow.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;';
                body.appendChild(insightRow);

                const rosterCol = document.createElement('div');
                rosterCol.style.cssText = 'flex:1 1 260px;min-width:240px;display:flex;flex-direction:column;gap:6px;';
                insightRow.appendChild(rosterCol);

                const rosterHeader = document.createElement('div');
                rosterHeader.style.cssText = 'font-size:12px;font-weight:bold;color:#ccc;';
                rosterHeader.textContent = 'Population';
                rosterHeader.appendChild(infoIcon('The pool of weight-tables currently competing. The top 2 by fitness survive unchanged into the next generation ("elite"); the rest are bred (crossover of the top 3, then mutated) and get a new #id. Click a row to see its weights.'));
                rosterCol.appendChild(rosterHeader);

                const rosterList = document.createElement('div');
                rosterList.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-height:220px;overflow-y:auto;';
                rosterCol.appendChild(rosterList);

                const genCol = document.createElement('div');
                genCol.style.cssText = 'flex:1 1 220px;min-width:200px;display:flex;flex-direction:column;gap:6px;';
                insightRow.appendChild(genCol);

                const genHeader = document.createElement('div');
                genHeader.style.cssText = 'font-size:12px;font-weight:bold;color:#ccc;';
                genHeader.textContent = 'Generations';
                genHeader.appendChild(infoIcon('One line per generation completed so far in the current run: which #id came out on top and its fitness. Fitness is win(±1) plus small bonuses for win-progress and avoiding stalls — not a plain score, so small differences are normal.'));
                genCol.appendChild(genHeader);

                const genLogEl = document.createElement('div');
                genLogEl.style.cssText = 'display:flex;flex-direction:column-reverse;gap:2px;max-height:220px;overflow-y:auto;font-size:11px;color:#aaa;font-family:monospace;';
                genCol.appendChild(genLogEl);

                const detailCol = document.createElement('div');
                detailCol.style.cssText = 'flex:1 1 320px;min-width:280px;display:none;flex-direction:column;gap:6px;';
                insightRow.appendChild(detailCol);

                const detailHeader = document.createElement('div');
                detailHeader.style.cssText = 'font-size:12px;font-weight:bold;color:#ccc;display:flex;align-items:center;justify-content:space-between;';
                detailCol.appendChild(detailHeader);

                const detailBody = document.createElement('div');
                detailBody.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;font-size:11px;';
                detailCol.appendChild(detailBody);

                // ── Roster/generation state for the CURRENT run ──────────────
                let currentRoster = [];   // latest members array (id, fitness, parentIds, w), best-first
                let genLog = [];          // [{gen, total, bestId, bestFitness}]
                let seenIds = new Set();  // ids ever shown this run — lets the roster mark "new this gen"
                let selectedMemberId = null;

                function resetInsights() {
                    currentRoster = [];
                    genLog = [];
                    seenIds = new Set();
                    selectedMemberId = null;
                    rosterList.innerHTML = '';
                    genLogEl.innerHTML = '';
                    detailCol.style.display = 'none';
                }

                function renderRoster() {
                    rosterList.innerHTML = '';
                    if (!currentRoster.length) {
                        const empty = document.createElement('div');
                        empty.textContent = 'No run in progress — start training or breeding to see the population here.';
                        empty.style.cssText = 'font-size:11px;color:#777;font-style:italic;';
                        rosterList.appendChild(empty);
                        return;
                    }
                    const maxFitness = Math.max(...currentRoster.map(m => m.fitness), 1);
                    for (const m of currentRoster) {
                        const row = document.createElement('div');
                        row.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;cursor:pointer;` +
                            `background:${m.id === selectedMemberId ? '#2d4a4a' : '#22223a'};border:1px solid ${m.id === selectedMemberId ? '#6ef' : '#333'};`;
                        row.onclick = () => { selectedMemberId = m.id; renderRoster(); renderDetail(); };

                        const idEl = document.createElement('div');
                        idEl.textContent = `#${m.id}`;
                        idEl.style.cssText = 'font-size:11px;color:#eee;font-weight:bold;min-width:28px;';
                        row.appendChild(idEl);

                        const barWrap = document.createElement('div');
                        barWrap.style.cssText = 'flex:1;background:#111;border-radius:3px;height:10px;overflow:hidden;position:relative;';
                        const bar = document.createElement('div');
                        const barPct = maxFitness !== 0 ? Math.max(0, Math.min(100, (m.fitness / maxFitness) * 100)) : 0;
                        bar.style.cssText = `height:100%;width:${barPct}%;background:${m.fitness >= 0 ? '#4a8' : '#a44'};`;
                        barWrap.appendChild(bar);
                        row.appendChild(barWrap);

                        const fitEl = document.createElement('div');
                        fitEl.textContent = m.fitness.toFixed(1);
                        fitEl.style.cssText = 'font-size:11px;color:#ccc;min-width:34px;text-align:right;';
                        row.appendChild(fitEl);

                        // Check "already seen" FIRST — an elite that was
                        // originally bred several generations ago must show
                        // as "surviving," not re-show its birth lineage every
                        // generation as if it had just been bred again.
                        const lineageEl = document.createElement('div');
                        lineageEl.style.cssText = 'font-size:10px;color:#888;min-width:64px;text-align:right;';
                        lineageEl.textContent = seenIds.has(m.id) ? 'elite (surviving)'
                            : (m.parentIds && m.parentIds.length === 2) ? `bred #${m.parentIds[0]}×#${m.parentIds[1]}`
                            : (m.parentIds && m.parentIds.length === 1) ? `mutated #${m.parentIds[0]}`
                            : 'seed';
                        row.appendChild(lineageEl);

                        rosterList.appendChild(row);
                        seenIds.add(m.id);
                    }
                }

                function renderGenLog() {
                    genLogEl.innerHTML = '';
                    for (const g of genLog) {
                        const line = document.createElement('div');
                        line.textContent = `gen ${g.gen}/${g.total} — best: #${g.bestId} (${g.bestFitness.toFixed(1)})`;
                        genLogEl.appendChild(line);
                    }
                }

                function weightBar(key, value, baseline) {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:6px;';
                    const keyEl = document.createElement('div');
                    keyEl.textContent = key;
                    keyEl.style.cssText = 'width:150px;flex-shrink:0;color:#aaa;font-family:monospace;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                    row.appendChild(keyEl);

                    const diffPct = baseline !== 0 ? ((value - baseline) / Math.abs(baseline)) * 100 : (value === 0 ? 0 : 100);
                    const barWrap = document.createElement('div');
                    barWrap.style.cssText = 'flex:1;background:#111;border-radius:3px;height:9px;overflow:hidden;';
                    const bar = document.createElement('div');
                    const width = Math.min(100, Math.abs(diffPct));
                    const color = diffPct > 0.5 ? '#4a8' : diffPct < -0.5 ? '#a44' : '#555';
                    bar.style.cssText = `height:100%;width:${width}%;background:${color};`;
                    barWrap.appendChild(bar);
                    row.appendChild(barWrap);

                    const valEl = document.createElement('div');
                    valEl.textContent = `${value} (base ${baseline}, ${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(0)}%)`;
                    valEl.style.cssText = 'width:130px;flex-shrink:0;color:#ccc;font-family:monospace;font-size:10px;text-align:right;';
                    row.appendChild(valEl);
                    return row;
                }

                function renderDetail() {
                    const member = currentRoster.find(m => m.id === selectedMemberId);
                    if (!member) { detailCol.style.display = 'none'; return; }
                    detailCol.style.display = 'flex';
                    detailHeader.innerHTML = '';
                    const label = document.createElement('span');
                    label.textContent = `#${member.id} weights (vs. hand-tuned default)`;
                    detailHeader.appendChild(label);
                    const closeDetail = document.createElement('button');
                    closeDetail.textContent = '✕';
                    closeDetail.style.cssText = 'background:none;border:1px solid #555;border-radius:4px;color:#ccc;cursor:pointer;padding:1px 7px;font-size:11px;';
                    closeDetail.onclick = () => { selectedMemberId = null; renderRoster(); renderDetail(); };
                    detailHeader.appendChild(closeDetail);

                    detailBody.innerHTML = '';
                    const defaults = window.BotSystem.DEFAULT_WEIGHTS;
                    for (const cat of WEIGHT_CATEGORIES) {
                        const keysPresent = cat.keys.filter(k => member.w[k] !== undefined);
                        if (!keysPresent.length) continue;
                        const catHeader = document.createElement('div');
                        catHeader.textContent = cat.name;
                        catHeader.style.cssText = 'font-size:10px;color:#789;text-transform:uppercase;letter-spacing:0.03em;margin-top:4px;';
                        detailBody.appendChild(catHeader);
                        for (const k of keysPresent) {
                            detailBody.appendChild(weightBar(k, member.w[k], defaults[k]));
                        }
                    }
                }

                // Wired into evolve()'s onGeneration (4th arg — richer roster
                // data, see bot-arena.js) by Start Training's Evolve method.
                function handleGeneration(gen, total, fitnessArr, members) {
                    currentRoster = members;
                    genLog.push({ gen, total, bestId: members[0].id, bestFitness: members[0].fitness });
                    renderRoster();
                    renderGenLog();
                    if (selectedMemberId != null) renderDetail(); // keep the open diagram live
                }

                const startBtnSep = document.createElement('div');
                startBtnSep.style.cssText = 'border-top:1px solid #333;margin:2px 0;';
                body.appendChild(startBtnSep);

                startBtn.onclick = async () => {
                    if (window.BotArena.isRunning()) { updateStatus('A bot job is already running — use Stop first'); return; }
                    if (!await stopAnyRunningBotJob()) return;
                    startBtnRef.disabled = true;
                    startBtn.disabled = true;
                    startBtn.textContent = 'Training…';
                    resetInsights();
                    renderRoster();
                    const trainedBotId = state.sourceBotId, trainedBotName = state.sourceBotNickname;
                    try {
                        if (state.method === 'hillclimb') {
                            const preset = { rounds: state.generations, lambda: 6, gamesPerChallenge: 30, confirmGames: 20, confirmMargin: 0.55 };
                            const { improved, record, promotions } = await runHillClimbTraining(preset, renderProgress, {
                                visual: state.watchable,
                                sourceBotId: trainedBotId, sourceBotNickname: trainedBotName,
                            });
                            progressText.style.display = 'none';
                            updateStatus(improved
                                ? (trainedBotId
                                    ? `"${trainedBotName}" dethroned the online champion ${record} in the confirmation match! +250 XP, +50 gold.`
                                    : `Hill Climb complete — ${promotions} promotion(s) this run, and the result beat the online champion ${record} in the confirmation match. New weights applied and saved.`)
                                : `Hill Climb finished (${promotions} promotion(s) this run) but did not beat the online champion by enough (${record}) — kept the previous weights.`);
                        } else {
                            const preset = { generations: state.generations, gamesPerPair: 1, popSize: 6, confirmGames: 10, gamesPerSize: 4 };
                            const { improved, record } = await runWeightTraining(preset, renderProgress, {
                                nPlayers: state.n, visual: state.watchable,
                                onGeneration: handleGeneration,
                                sourceBotId: trainedBotId, sourceBotNickname: trainedBotName,
                            });
                            progressText.style.display = 'none';
                            updateStatus(improved
                                ? (trainedBotId
                                    ? `"${trainedBotName}" improved ${record} in the confirmation match — saved to your Stable.`
                                    : `Training complete — champion beat the starting weights ${record} in the confirmation match. New weights applied and saved.`)
                                : `Training finished but did not beat the starting weights (${record}) — kept the previous weights.`);
                        }
                    } catch (err) {
                        console.error('Bot training failed:', err);
                        progressText.style.display = 'none';
                        updateStatus(`Bot training failed — ${err.message || 'see console'}`);
                    } finally {
                        startBtnRef.disabled = false;
                        startBtn.disabled = false;
                        startBtn.textContent = 'Start Training';
                        hideTrainingPopup();
                        // This run's source (if any) is done its job — clear it
                        // so a later, unrelated open (the secret 5-click
                        // trigger) doesn't inherit it.
                        state.sourceBotId = null;
                        state.sourceBotNickname = null;
                    }
                };

                // ── Deploy this bot ────────────────────────────────────────────
                // Takes whatever is CURRENTLY in window.BotSystem.WEIGHTS
                // (freshly trained, or just whatever's loaded) and publishes
                // it as an individually-owned, named row in the
                // `deployed_bots` table — the foundation step the whole Bot
                // Tycoon leaderboard/challenge economy depends on
                // (docs/bot-tycoon-proposal.md § SUGGESTED BUILD ORDER step 1).
                // Deliberately separate from Start Training — an explicit
                // publish action, not an automatic side effect of a good
                // result. Always available regardless of run state;
                // deploying doesn't touch BotArena at all.
                const deploySep = document.createElement('div');
                deploySep.style.cssText = 'border-top:1px solid #333;margin:2px 0;';
                body.appendChild(deploySep);

                const deployTitle = document.createElement('div');
                deployTitle.textContent = 'Deploy this bot';
                deployTitle.style.cssText = 'font-size:12px;font-weight:bold;color:#ccc;';
                body.appendChild(deployTitle);

                const deployDesc = document.createElement('div');
                deployDesc.textContent = 'Publish a bot as a named bot other players can challenge on the leaderboard. Requires being logged in. Each source (your live bot, or a specific captured bot) can only be deployed once — capture another bot if you want a second deploy.';
                deployDesc.style.cssText = 'font-size:11px;color:#999;';
                body.appendChild(deployDesc);

                // Source picker: your current live WEIGHTS (default), or a
                // captured bot from your collection (docs/bot-tycoon-proposal.md
                // build-order step 4) — reuses this exact same insert logic
                // below rather than a separate "deploy a capture" flow.
                // Each source can only be deployed ONCE per owner, ever (per
                // explicit user request — otherwise one live WEIGHTS table or
                // one capture could be redeployed under new names to flood
                // the leaderboard with clones of the same bot): a second
                // deployed bot requires capturing a genuinely different one
                // first. Already-used sources are filtered OUT of this list
                // entirely rather than shown disabled — there's nothing
                // useful to do with them here.
                const deploySourceRow = document.createElement('div');
                deploySourceRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
                body.appendChild(deploySourceRow);

                const deploySourceLabel = document.createElement('span');
                deploySourceLabel.textContent = 'Source:';
                deploySourceLabel.style.cssText = 'font-size:11px;color:#aaa;';
                deploySourceRow.appendChild(deploySourceLabel);

                const deploySourceSelect = document.createElement('select');
                deploySourceSelect.style.cssText = 'flex:1;padding:4px 6px;background:#2d2d44;color:#eee;border:1px solid #555;border-radius:5px;font-size:12px;';
                deploySourceRow.appendChild(deploySourceSelect);

                let capturedBotsCache = [];
                async function refreshCapturedBotsOptions() {
                    deploySourceSelect.innerHTML = '';
                    capturedBotsCache = [];
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session?.user?.id) {
                        deploySourceSelect.innerHTML = '<option value="">Current live bot (WEIGHTS)</option>';
                        return;
                    }

                    const { data: mine } = await supabase.from('deployed_bots')
                        .select('captured_bot_id').eq('owner', session.user.id);
                    const usedCapturedIds = new Set((mine || []).map(r => r.captured_bot_id).filter(id => id != null));
                    const liveAlreadyUsed = (mine || []).some(r => r.captured_bot_id == null);

                    if (!liveAlreadyUsed) {
                        const opt = document.createElement('option');
                        opt.value = '';
                        opt.textContent = 'Current live bot (WEIGHTS)';
                        deploySourceSelect.appendChild(opt);
                    }

                    const { data, error } = await supabase.from('captured_bots')
                        .select('id, source_nickname, weights, captured_at')
                        .eq('owner', session.user.id)
                        .order('captured_at', { ascending: false })
                        .limit(50);
                    if (!error && data) {
                        capturedBotsCache = data.filter(cb => !usedCapturedIds.has(cb.id));
                        for (const cb of capturedBotsCache) {
                            const opt = document.createElement('option');
                            opt.value = String(cb.id);
                            opt.textContent = `Captured: ${cb.source_nickname} (${new Date(cb.captured_at).toLocaleDateString()})`;
                            deploySourceSelect.appendChild(opt);
                        }
                    }

                    if (!deploySourceSelect.options.length) {
                        const opt = document.createElement('option');
                        opt.value = '';
                        opt.textContent = 'No available sources — capture a bot first';
                        deploySourceSelect.appendChild(opt);
                        deploySourceSelect.disabled = true;
                    } else {
                        deploySourceSelect.disabled = false;
                    }
                }

                const deployRow = document.createElement('div');
                deployRow.style.cssText = 'display:flex;gap:8px;align-items:center;';
                body.appendChild(deployRow);

                const nicknameInput = document.createElement('input');
                nicknameInput.type = 'text';
                nicknameInput.placeholder = 'Name your bot (max 24 characters)';
                nicknameInput.maxLength = 24;
                nicknameInput.style.cssText = 'flex:1;padding:5px 8px;background:#2d2d44;color:#eee;border:1px solid #555;border-radius:5px;font-size:12px;';
                deployRow.appendChild(nicknameInput);

                const deployBtn = document.createElement('button');
                deployBtn.textContent = 'Deploy';
                deployBtn.style.cssText = 'padding:6px 12px;background:#3a2d4a;color:#eee;border:1px solid #85a;border-radius:5px;cursor:pointer;font-size:12px;';
                deployRow.appendChild(deployBtn);

                deployBtn.onclick = async () => {
                    const nickname = nicknameInput.value.trim();
                    if (!nickname) { updateStatus('Name your bot before deploying.'); return; }
                    if (deploySourceSelect.disabled) { updateStatus('No available sources to deploy — capture a bot first.'); return; }
                    deployBtn.disabled = true;
                    deployBtn.textContent = 'Deploying…';
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session?.user?.id) {
                            updateStatus('Log in before deploying a bot — deployed bots are tied to your account.');
                            return;
                        }
                        const capturedId = deploySourceSelect.value;
                        const sourceWeights = capturedId
                            ? capturedBotsCache.find(cb => String(cb.id) === capturedId)?.weights
                            : { ...window.BotSystem.WEIGHTS };
                        if (!sourceWeights) { updateStatus('Selected captured bot could not be found — try refreshing.'); return; }

                        // Safety net against the dropdown's own filtering going
                        // stale (e.g. two tabs open) — each source (live WEIGHTS,
                        // or a specific captured bot) may only be deployed once
                        // per owner, ever. No DB-level constraint for this: some
                        // pre-existing rows already predate the captured_bot_id
                        // column and can't be retrofitted without touching real
                        // player data, so this check is the actual enforcement.
                        let dupeQuery = supabase.from('deployed_bots').select('id').eq('owner', session.user.id);
                        dupeQuery = capturedId ? dupeQuery.eq('captured_bot_id', Number(capturedId)) : dupeQuery.is('captured_bot_id', null);
                        const { data: dupes } = await dupeQuery.limit(1);
                        if (dupes?.length) {
                            updateStatus(capturedId
                                ? 'You already deployed this captured bot — capture a different one if you want another.'
                                : "You've already deployed your own bot — capture another player's bot if you want a second one.");
                            return;
                        }

                        const { error } = await supabase.from('deployed_bots').insert({
                            owner: session.user.id,
                            nickname,
                            weights: sourceWeights,
                            captured_bot_id: capturedId ? Number(capturedId) : null,
                        });
                        if (error) {
                            // 23505 = unique_violation — this owner already has a
                            // bot with this exact nickname (unique(owner, nickname)).
                            updateStatus(error.code === '23505'
                                ? `You already have a bot named "${nickname}" — pick a different name.`
                                : `Could not deploy: ${error.message}`);
                            return;
                        }
                        updateStatus(`"${nickname}" is deployed — other players can now challenge it.`);
                        nicknameInput.value = '';
                        refreshCapturedBotsOptions();
                    } catch (e) {
                        console.error('Deploy bot failed:', e);
                        updateStatus('Could not deploy — see console.');
                    } finally {
                        deployBtn.disabled = false;
                        deployBtn.textContent = 'Deploy';
                    }
                };

                // ── Challenge other bots ────────────────────────────────────────
                // Build-order step 2 (docs/bot-tycoon-proposal.md): the
                // challenger's own browser runs the WHOLE match locally against
                // a stored opponent weight table — no server execution needed
                // for either side, same reasoning that made step 1 tractable.
                // Two deliberate v1 simplifications (agreed with the user):
                // this is bot-vs-bot (your current WEIGHTS auto-plays one local
                // match against theirs), not an interactive human-vs-bot game;
                // and the target list is "top 10 by win rate" rather than the
                // proposal's full rank-window matchmaking, which needs the
                // unified leaderboard (step 3, not built yet).
                const challengeSep = document.createElement('div');
                challengeSep.style.cssText = 'border-top:1px solid #333;margin:2px 0;';
                body.appendChild(challengeSep);

                const challengeTitle = document.createElement('div');
                challengeTitle.textContent = 'Challenge other bots';
                challengeTitle.style.cssText = 'font-size:12px;font-weight:bold;color:#ccc;';
                body.appendChild(challengeTitle);

                const challengeDesc = document.createElement('div');
                challengeDesc.textContent = 'Your current live bot auto-plays one local match against another player\'s deployed bot. Win: you get XP, they get a little gold. Lose: they get more gold, you get none. Requires being logged in.';
                challengeDesc.style.cssText = 'font-size:11px;color:#999;';
                body.appendChild(challengeDesc);

                const challengeListEl = document.createElement('div');
                challengeListEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;';
                body.appendChild(challengeListEl);

                const challengeRefreshBtn = document.createElement('button');
                challengeRefreshBtn.textContent = 'Refresh list';
                challengeRefreshBtn.style.cssText = 'padding:4px 8px;background:#2d2d44;color:#ccc;border:1px solid #555;border-radius:5px;cursor:pointer;font-size:11px;align-self:flex-start;margin-top:4px;';
                body.appendChild(challengeRefreshBtn);

                async function renderChallengeList() {
                    challengeListEl.innerHTML = '<div style="font-size:11px;color:#777;font-style:italic;">Loading…</div>';
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const myId = session?.user?.id || null;
                        let query = supabase.from('deployed_bots')
                            .select('id, owner, nickname, weights, wins, losses, draws, win_rate')
                            .eq('is_active', true)
                            .order('win_rate', { ascending: false })
                            .limit(10);
                        if (myId) query = query.neq('owner', myId);
                        const { data, error } = await query;
                        // Scoped to the list widget itself, never the global
                        // status bar: this refresh also runs automatically
                        // after a challenge completes, and a load error here
                        // must never clobber that more important win/loss
                        // status message (this is exactly what happened during
                        // testing — a stubbed non-UUID test user id made this
                        // query fail, silently overwriting a genuine success
                        // message with a confusing "could not load" one).
                        if (error) { challengeListEl.innerHTML = `<div style="font-size:11px;color:#c88;">Could not load challengeable bots: ${error.message}</div>`; return; }
                        if (!data?.length) {
                            challengeListEl.innerHTML = '<div style="font-size:11px;color:#777;font-style:italic;">No other deployed bots yet — be the first to deploy one above.</div>';
                            return;
                        }
                        // deployed_bots.owner has no FK to user_profiles (only
                        // to auth.users), so PostgREST can't embed this — a
                        // second batch query resolves "who deployed this bot".
                        const ownerIds = [...new Set(data.map(b => b.owner).filter(Boolean))];
                        let ownerNameById = new Map();
                        if (ownerIds.length) {
                            const { data: owners } = await supabase.from('user_profiles')
                                .select('user_id, display_name').in('user_id', ownerIds);
                            ownerNameById = new Map((owners || []).map(o => [o.user_id, o.display_name]));
                        }
                        challengeListEl.innerHTML = '';
                        for (const bot of data) {
                            const row = document.createElement('div');
                            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;background:#22223a;border-radius:4px;';
                            const decided = bot.wins + bot.losses;
                            const pct = decided ? Math.round((bot.wins / decided) * 100) : 0;
                            const ownerName = ownerNameById.get(bot.owner) || 'Unknown';
                            const label = document.createElement('span');
                            label.textContent = `${bot.nickname} (by ${ownerName}) — ${bot.wins}-${bot.losses}${bot.draws ? `-${bot.draws}` : ''} (${pct}%)`;
                            label.style.cssText = 'flex:1;font-size:11px;color:#ddd;';
                            row.appendChild(label);
                            const btn = document.createElement('button');
                            btn.textContent = 'Challenge';
                            btn.style.cssText = 'padding:3px 8px;background:#3a2d4a;color:#eee;border:1px solid #85a;border-radius:4px;cursor:pointer;font-size:11px;';
                            btn.onclick = () => runChallenge(bot, btn);
                            row.appendChild(btn);
                            challengeListEl.appendChild(row);
                        }
                    } catch (e) {
                        console.error('Loading challengeable bots failed:', e);
                        challengeListEl.innerHTML = '<div style="font-size:11px;color:#c88;">Could not load challengeable bots — see console.</div>';
                    }
                }
                challengeRefreshBtn.onclick = renderChallengeList;

                // Reward scale deliberately matches the EXISTING economy rather
                // than inventing new numbers: 100 XP is exactly what any other
                // 2-player game win already pays (gamification.js
                // onGameComplete); 20 gold matches the daily-login baseline
                // (the "successful defense" case — the biggest reward here);
                // 8/10 gold are smaller fractions of that same baseline.
                async function runChallenge(targetBot, btn) {
                    if (window.BotArena.isRunning()) { updateStatus('A bot job is already running — use Stop first'); return; }
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session?.user?.id) { updateStatus('Log in before challenging a bot.'); return; }
                    if (!await stopAnyRunningBotJob()) return;
                    btn.disabled = true;
                    btn.textContent = 'Fighting…';
                    try {
                        await leaveOnlineGameIfAny();
                        const myWeights = { ...window.BotSystem.WEIGHTS };
                        const result = await window.BotArena.playMatch([myWeights, targetBot.weights], { visual: state.watchable, turnCap: 300 });
                        // winner: 0 = me (challenger), 1 = them (defending bot), null = draw.
                        const iWon = result.winner === 0;
                        const theyWon = result.winner === 1;
                        const botResult = theyWon ? 'win' : iWon ? 'loss' : 'draw';
                        const goldForOwner = theyWon ? 20 : iWon ? 8 : 10;

                        await supabase.rpc('record_deployed_bot_result', { p_bot_id: targetBot.id, p_result: botResult });
                        await supabase.rpc('award_gold', {
                            p_user_id: targetBot.owner,
                            p_gold_amount: goldForOwner,
                            p_description: `"${targetBot.nickname}" ${theyWon ? 'defended successfully' : iWon ? 'was defeated' : 'drew'} in a challenge`,
                        });
                        if (iWon) {
                            await supabase.rpc('update_user_xp', {
                                p_user_id: session.user.id,
                                p_xp_points: 100,
                                p_description: `Defeated "${targetBot.nickname}" in a bot challenge`,
                            });
                        }

                        updateStatus(iWon
                            ? `You beat "${targetBot.nickname}"! +100 XP.`
                            : theyWon
                                ? `"${targetBot.nickname}" defeated your bot. No XP this time.`
                                : `Your challenge against "${targetBot.nickname}" ended in a draw.`);
                        renderChallengeList(); // refresh records shown

                        // Offer a capture attempt regardless of win/loss — a
                        // close FIGHT is what matters (Pokemon's low-HP-easier-
                        // catch idea), not who won. Chance is genuinely new,
                        // ungrounded-in-precedent territory (unlike the reward
                        // amounts above) — 20% floor for a lopsided game up to
                        // 80% for a dead-even one, tunable later.
                        const [myActivated, theirActivated] = result.activated || [0, 0];
                        const closeness = Math.max(0, 5 - Math.abs(myActivated - theirActivated));
                        showCaptureAttempt(targetBot, Math.round(Math.min(80, 20 + closeness * 12)));
                    } catch (e) {
                        console.error('Challenge failed:', e);
                        updateStatus('Challenge failed — see console.');
                    } finally {
                        btn.disabled = false;
                        btn.textContent = 'Challenge';
                    }
                }

                // ── Capture Stones ──────────────────────────────────────────────
                // Build-order step 4 (docs/bot-tycoon-proposal.md). Stones are
                // bought from the Shop tab in the Profile modal
                // (js/gamification-ui.js) — moved there per explicit user
                // request ("they should be in the shop"). This panel only
                // shows the current count and lets you USE one right after a
                // challenge (see runChallenge() above and showCaptureAttempt()/
                // attemptCapture() below).
                const captureSep = document.createElement('div');
                captureSep.style.cssText = 'border-top:1px solid #333;margin:2px 0;';
                body.appendChild(captureSep);

                const captureTitle = document.createElement('div');
                captureTitle.textContent = 'Capture Stones';
                captureTitle.style.cssText = 'font-size:12px;font-weight:bold;color:#ccc;';
                body.appendChild(captureTitle);

                const captureDesc = document.createElement('div');
                captureDesc.textContent = 'Buy stones in the Shop, then use one right after a challenge to try copying that bot\'s weights into your collection — the closer the fight, the better your odds. Consumed whether the attempt succeeds or not.';
                captureDesc.style.cssText = 'font-size:11px;color:#999;';
                body.appendChild(captureDesc);

                const captureRow = document.createElement('div');
                captureRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
                body.appendChild(captureRow);

                const stoneCountEl = document.createElement('span');
                stoneCountEl.style.cssText = 'font-size:12px;color:#ddd;';
                captureRow.appendChild(stoneCountEl);

                const captureAttemptEl = document.createElement('div');
                captureAttemptEl.style.cssText = 'margin-top:6px;font-size:11px;color:#ccc;display:none;';
                body.appendChild(captureAttemptEl);

                async function refreshStoneCount() {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session?.user?.id) {
                        stoneCountEl.textContent = 'Log in to use capture stones.';
                        return null;
                    }
                    const { data, error } = await supabase.from('user_profiles')
                        .select('capture_stones').eq('user_id', session.user.id).single();
                    if (error || !data) { stoneCountEl.textContent = 'Capture stones: —'; return null; }
                    stoneCountEl.textContent = `Capture stones: ${data.capture_stones}`;
                    return { userId: session.user.id, stones: data.capture_stones };
                }

                // Offered as a follow-up right after a challenge (see
                // runChallenge() above) — not a standalone button, since the
                // odds are specific to how that one match just went.
                function showCaptureAttempt(targetBot, chancePct) {
                    captureAttemptEl.style.display = 'block';
                    captureAttemptEl.innerHTML = '';
                    const label = document.createElement('span');
                    label.textContent = `Attempt to capture "${targetBot.nickname}"? (${chancePct}% chance) `;
                    captureAttemptEl.appendChild(label);
                    const btn = document.createElement('button');
                    btn.textContent = 'Use Capture Stone';
                    btn.style.cssText = 'padding:3px 8px;background:#3a2d4a;color:#eee;border:1px solid #85a;border-radius:4px;cursor:pointer;font-size:11px;';
                    btn.onclick = () => attemptCapture(targetBot, chancePct, btn);
                    captureAttemptEl.appendChild(btn);
                }

                async function attemptCapture(targetBot, chancePct, btn) {
                    btn.disabled = true;
                    btn.textContent = 'Rolling…';
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session?.user?.id) { updateStatus('Log in to use a Capture Stone.'); return; }
                        const { data: profile, error: profErr } = await supabase.from('user_profiles')
                            .select('capture_stones').eq('user_id', session.user.id).single();
                        if (profErr || !profile) { updateStatus(`Could not check your Capture Stones: ${profErr?.message || 'unknown error'}`); return; }
                        if (profile.capture_stones < 1) { updateStatus('You have no Capture Stones — buy one above.'); return; }

                        // Consumed whether the roll succeeds or not.
                        await supabase.from('user_profiles')
                            .update({ capture_stones: profile.capture_stones - 1 }).eq('user_id', session.user.id);
                        await refreshStoneCount();

                        const success = Math.random() * 100 < chancePct;
                        if (success) {
                            const { error } = await supabase.from('captured_bots').insert({
                                owner: session.user.id,
                                source_nickname: targetBot.nickname,
                                source_bot_id: targetBot.id,
                                weights: targetBot.weights,
                            });
                            if (error) { updateStatus(`Capture roll succeeded but saving it failed: ${error.message}`); return; }
                            updateStatus(`Captured "${targetBot.nickname}"! Added to your collection.`);
                            refreshCapturedBotsOptions(); // so it's immediately selectable as a Deploy source
                        } else {
                            updateStatus(`"${targetBot.nickname}" broke free — capture failed.`);
                        }
                        captureAttemptEl.style.display = 'none';
                    } catch (e) {
                        console.error('Capture attempt failed:', e);
                        updateStatus('Capture attempt failed — see console.');
                    } finally {
                        btn.disabled = false;
                        btn.textContent = 'Use Capture Stone';
                    }
                }

                refreshCapturedBotsOptions();
                refreshStoneCount();
                renderChallengeList();
                renderRoster();
                document.body.appendChild(overlay);
            }

            document.addEventListener('click', function(e) {
                if (!e.target || !e.target.classList.contains('gami-title')) return;
                clickCount++;
                clearTimeout(clickTimer);
                if (clickCount >= 5) {
                    clickCount = 0;
                    openBotTrainingPanel();
                } else {
                    clickTimer = setTimeout(() => { clickCount = 0; }, 3000);
                }
            });

            // Bridge so the outer-scope training popup's "expand" button can
            // open the full modal without needing its own copy of the
            // 5x-click trigger — see showTrainingPopup()/ensureTrainingPopup().
            window._openBotTrainingPanel = openBotTrainingPanel;
        })();

