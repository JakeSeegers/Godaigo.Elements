        // ========================================
        // MULTIPLAYER LOBBY FUNCTIONS
        // ========================================

        let isHost = false; // Track if this player is the host

        let isJoining = false; // Prevent double-joins

        // Join the lobby
        async function joinLobby() {
            // Prevent double-joins
            if (isJoining) {
                console.log('Already joining, please wait...');
                return;
            }

            const usernameInput = document.getElementById('username-input');
            const username = usernameInput.value.trim();

            if (!username) {
                alert('Please enter a username!');
                return;
            }

            // Disable input and button, show loading spinner
            isJoining = true;
            const joinButton = document.getElementById('join-button');
            const loadingDiv = document.getElementById('join-loading');
            joinButton.disabled = true;
            usernameInput.disabled = true;
            loadingDiv.style.display = 'block';

            try {
                // First, clean up any stale players (older than 10 minutes)
                // Increased timeout for development - players won't be kicked while debugging
                await supabase
                    .from('players')
                    .delete()
                    .lt('last_seen', new Date(Date.now() - 600000).toISOString());

                // Check game room status — only reset if truly abandoned (no players left)
                const { data: room } = await supabase
                    .from('game_room')
                    .select('status')
                    .eq('id', 1)
                    .single();

                if (room && (room.status === 'playing' || room.status === 'finished')) {
                    // Count how many players are still in the DB
                    const { data: activePlayers } = await supabase
                        .from('players')
                        .select('id');

                    if (activePlayers && activePlayers.length > 0) {
                        // Game is in progress with real players — don't nuke it
                        alert('⚠️ A game is currently in progress with other players.\n\nPlease wait for it to finish, or use "Reset Lobby" to force-clear.');
                        isJoining = false;
                        joinButton.disabled = false;
                        usernameInput.disabled = false;
                        loadingDiv.style.display = 'none';
                        return;
                    }

                    // No players left — safe to reset this abandoned game
                    await supabase
                        .from('game_room')
                        .update({ status: 'waiting', current_turn_index: 0 })
                        .eq('id', 1);
                }

                // Check if username is already taken
                const { data: existingPlayers } = await supabase
                    .from('players')
                    .select('*')
                    .order('created_at', { ascending: true });

                const usernameTaken = existingPlayers && existingPlayers.some(p => p.username === username);
                if (usernameTaken) {
                    alert('Username already taken! Please choose a different name.');
                    // Re-enable inputs
                    isJoining = false;
                    joinButton.disabled = false;
                    usernameInput.disabled = false;
                    loadingDiv.style.display = 'none';
                    return;
                }

                // Insert player into database
                const { data, error } = await supabase
                    .from('players')
                    .insert([{ username, is_ready: false }])
                    .select()
                    .single();

                if (error) throw error;

                myPlayerId = data.id;
                isMultiplayer = true;

                // After insertion, check if we're the first player (host)
                // The host is simply the player with the oldest created_at timestamp
                const { data: allPlayersAfterInsert } = await supabase
                    .from('players')
                    .select('*')
                    .order('created_at', { ascending: true });

                // We're host if we're the first player (by creation time)
                isHost = allPlayersAfterInsert && allPlayersAfterInsert[0].id === myPlayerId;

                console.log('✅ Joined lobby as:', username, 'ID:', myPlayerId, isHost ? '(HOST)' : '');

                // Hide join form, show ready controls
                document.getElementById('join-form').style.display = 'none';
                document.getElementById('ready-controls').style.display = 'block';

                // Start listening for updates
                subscribeToLobby();
                updateHeartbeat();
                startLobbyPoll(); // Auto-refresh player list every 10s while in lobby
                updatePlayerList(); // Initial update to show host controls

            } catch (error) {
                console.error('Error joining lobby:', error);
                alert('Failed to join lobby: ' + error.message);

                // Re-enable inputs on error
                isJoining = false;
                joinButton.disabled = false;
                usernameInput.disabled = false;
                loadingDiv.style.display = 'none';
            }
        }

        // Leave the current game
        async function leaveGame() {
            if (!myPlayerId) return;

            const confirmed = confirm('⚠️ Leave Game?\n\nYou will be removed from this game and cannot rejoin.\n\nAre you sure?');
            if (!confirmed) return;

            try {
                console.log('👋 Leaving game...');

                // Delete myself from players table
                const { error } = await supabase
                    .from('players')
                    .delete()
                    .eq('id', myPlayerId);

                if (error) throw error;

                // Reset local state
                myPlayerId = null;
                myPlayerIndex = null;
                isHost = false;
                isMultiplayer = false;

                // Stop activity monitoring
                stopTurnTimerMonitoring();
                stopLobbyPoll();

                // Unsubscribe from channels
                if (playersSubscription) {
                    playersSubscription.unsubscribe();
                    playersSubscription = null;
                }
                if (gameRoomSubscription) {
                    gameRoomSubscription.unsubscribe();
                    gameRoomSubscription = null;
                }
                if (gameChannel) {
                    gameChannel.unsubscribe();
                    gameChannel = null;
                }

                // Reset UI
                document.getElementById('join-form').style.display = 'block';
                document.getElementById('ready-controls').style.display = 'none';
                document.getElementById('username-input').value = '';
                document.getElementById('leave-game').style.display = 'none';

                // Hide game, show lobby
                document.querySelector('.game-container').style.display = 'none';
                document.getElementById('multiplayer-lobby').style.display = 'block';

                // Clear the board
                clearBoard(true);

                console.log('✅ Left game successfully');
                alert('You have left the game.');

            } catch (error) {
                console.error('Error leaving game:', error);
                alert('Failed to leave game: ' + error.message);
            }
        }

        // Reset the entire lobby (clear all players and reset game room)
        async function resetLobby() {
            const confirmed = confirm('⚠️ Reset Lobby?\n\nThis will:\n- Remove all players from the lobby\n- Reset the game room to waiting state\n- Clear the board if game has started\n\nAre you sure?');

            if (!confirmed) return;

            try {
                console.log('📄 Resetting lobby...');

                // Delete all players (get all IDs first, then delete)
                const { data: allPlayers } = await supabase
                    .from('players')
                    .select('id');

                if (allPlayers && allPlayers.length > 0) {
                    const { error: playersError } = await supabase
                        .from('players')
                        .delete()
                        .in('id', allPlayers.map(p => p.id));

                    if (playersError) throw playersError;
                }

                // Reset game room status
                const { error: roomError } = await supabase
                    .from('game_room')
                    .update({ status: 'waiting', current_turn_index: 0 })
                    .eq('id', 1);

                if (roomError) throw roomError;

                // Reset local state
                myPlayerId = null;
                isHost = false;
                isJoining = false;
                isMultiplayer = false;

                // Stop lobby polling
                stopLobbyPoll();

                // Unsubscribe from channels
                if (playersSubscription) {
                    playersSubscription.unsubscribe();
                    playersSubscription = null;
                }
                if (gameRoomSubscription) {
                    gameRoomSubscription.unsubscribe();
                    gameRoomSubscription = null;
                }

                // Reset UI - show join form, hide ready controls
                document.getElementById('join-form').style.display = 'block';
                document.getElementById('ready-controls').style.display = 'none';
                document.getElementById('join-loading').style.display = 'none';
                document.getElementById('join-button').disabled = false;
                document.getElementById('username-input').disabled = false;
                document.getElementById('username-input').value = '';

                // Hide game, show lobby
                document.querySelector('.game-container').style.display = 'none';
                document.getElementById('multiplayer-lobby').style.display = 'block';

                // Clear the board if it was started
                clearBoard(true);

                console.log('✅ Lobby reset complete!');
                alert('✅ Lobby has been reset! You can now join again.');

            } catch (error) {
                console.error('Error resetting lobby:', error);
                alert('Failed to reset lobby: ' + error.message);
            }
        }

        // Handle game over - mark game as finished and show win screen
        async function handleGameOver(winnerPlayerIndex, winType = 'scrolls') {
            if (!isMultiplayer) return;

            try {
                console.log('🏆 Game Over! Winner:', winnerPlayerIndex, 'Type:', winType);

                // Show win screen immediately for the winner
                showGameOverToAll(winnerPlayerIndex, winType);

                // Update game room status to 'finished'
                const { error } = await supabase
                    .from('game_room')
                    .update({
                        status: 'finished'
                    })
                    .eq('id', 1);

                if (error) {
                    console.error('Error updating game over state:', error);
                }
            } catch (error) {
                console.error('Error handling game over:', error);
            }
        }

        // Show game over notification to all players
        function showGameOverToAll(winnerPlayerIndex, winType = 'scrolls') {
            console.log('Game over for winner index:', winnerPlayerIndex, 'Type:', winType);

            // Check if notification already exists
            const existingNotification = document.getElementById('game-over-notification');
            if (existingNotification) {
                return; // Don't show duplicate
            }

            const notification = document.createElement('div');
            notification.id = 'game-over-notification';
            Object.assign(notification.style, {
                position: 'fixed', left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#2c3e50', padding: '40px',
                borderRadius: '15px', boxShadow: '0 0 30px rgba(0,0,0,0.8)',
                zIndex: '1000', color: 'white', textAlign: 'center', minWidth: '500px',
                border: '3px solid gold'
            });

            const title = document.createElement('h1');
            title.textContent = 'GAME OVER';
            title.style.marginTop = '0';
            title.style.color = 'gold';
            title.style.fontSize = '42px';
            title.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
            notification.appendChild(title);

            // Show which player won using the new getPlayerColorName function
            const winnerName = getPlayerColorName(winnerPlayerIndex);

            const playerName = document.createElement('div');
            playerName.textContent = `${winnerName} wins!`;
            playerName.style.fontSize = '28px';
            playerName.style.fontWeight = 'bold';
            playerName.style.color = 'gold';
            playerName.style.marginBottom = '10px';
            notification.appendChild(playerName);

            const msg = document.createElement('div');
            if (winType === 'last_standing') {
                msg.textContent = 'Every other player left. You win!';
            } else {
                msg.textContent = 'All five elements have been mastered!';
            }
            msg.style.fontSize = '24px';
            msg.style.marginBottom = '10px';
            notification.appendChild(msg);

            // Only show elements if won by collecting scrolls
            if (winType === 'scrolls') {
                const elements = document.createElement('div');
                elements.style.fontSize = '32px';
                elements.style.margin = '20px 0';
                elements.innerHTML = '▲ ◯ ♦ ≋ ✺';
                notification.appendChild(elements);
            }

            const subtitle = document.createElement('div');
            subtitle.textContent = 'The path of balance is complete.';
            subtitle.style.fontSize = '16px';
            subtitle.style.fontStyle = 'italic';
            subtitle.style.color = '#bdc3c7';
            subtitle.style.marginBottom = '20px';
            notification.appendChild(subtitle);

            const lobbyBtn = document.createElement('button');
            lobbyBtn.textContent = 'Return to Lobby';
            lobbyBtn.style.padding = '12px 24px';
            lobbyBtn.style.fontSize = '16px';
            lobbyBtn.style.backgroundColor = 'gold';
            lobbyBtn.style.color = '#2c3e50';
            lobbyBtn.style.border = 'none';
            lobbyBtn.style.borderRadius = '5px';
            lobbyBtn.style.cursor = 'pointer';
            lobbyBtn.style.fontWeight = 'bold';
            lobbyBtn.onclick = async () => {
                try {
                    // Clean up: delete all players and reset game room for a fresh lobby
                    const { data: allP } = await supabase.from('players').select('id');
                    if (allP && allP.length > 0) {
                        await supabase.from('players').delete().in('id', allP.map(p => p.id));
                    }
                    await supabase.from('game_room').update({ status: 'waiting', current_turn_index: 0 }).eq('id', 1);
                } catch (err) {
                    console.error('Post-game cleanup error:', err);
                }
                window.location.reload();
            };
            notification.appendChild(lobbyBtn);

            document.body.appendChild(notification);
        }

        // Toggle ready status
        async function toggleReady() {
            if (!myPlayerId) return;
            
            try {
                // Get current ready state
                const { data: currentPlayer } = await supabase
                    .from('players')
                    .select('is_ready')
                    .eq('id', myPlayerId)
                    .single();
                
                const newReadyState = !currentPlayer.is_ready;
                
                // Update ready state
                const { error } = await supabase
                    .from('players')
                    .update({ is_ready: newReadyState })
                    .eq('id', myPlayerId);
                
                if (error) throw error;
                
                // Update button
                const readyButton = document.getElementById('ready-button');
                if (newReadyState) {
                    readyButton.textContent = 'Not Ready';
                    readyButton.style.background = '#f44336';
                } else {
                    readyButton.textContent = "I'm Ready!";
                    readyButton.style.background = '#4CAF50';
                }
                
            } catch (error) {
                console.error('Error toggling ready:', error);
            }
        }

        // Subscribe to lobby updates
        function subscribeToLobby() {
            // Unsubscribe from any existing channels first
            if (playersSubscription) {
                playersSubscription.unsubscribe();
            }
            if (gameRoomSubscription) {
                gameRoomSubscription.unsubscribe();
            }
            
            // Subscribe to players table
            playersSubscription = supabase
                .channel('players-channel-' + Math.random())
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'players' },
                    async (payload) => {
                        console.log('Players update:', payload);

                        // Handle our own player being deleted (kicked or lobby reset)
                        if (payload.eventType === 'DELETE' && payload.old.id === myPlayerId) {
                            console.log('📄 You were removed from the lobby (kicked or reset detected)');

                            // Check if we're in a game - if so, need to reset game state first
                            const gameContainer = document.querySelector('.game-container');
                            const inGame = gameContainer && gameContainer.style.display !== 'none';

                            if (inGame) {
                                console.log('⏰ Kicked during game - resetting to lobby');
                                // Call resetToLobby to properly clean up game state
                                if (typeof resetToLobby === 'function') {
                                    resetToLobby();
                                }
                            }

                            // Reset local state
                            myPlayerId = null;
                            myPlayerIndex = null;
                            isHost = false;
                            isMultiplayer = false;

                            // Unsubscribe from channels
                            if (playersSubscription) {
                                playersSubscription.unsubscribe();
                                playersSubscription = null;
                            }
                            if (gameRoomSubscription) {
                                gameRoomSubscription.unsubscribe();
                                gameRoomSubscription = null;
                            }
                            if (gameChannel) {
                                gameChannel.unsubscribe();
                                gameChannel = null;
                            }

                            // Show alert and reload the page to fully reset
                            alert('⚠️ You were kicked from the game (timeout). The page will refresh.');

                            // Reload the page to return to a clean state
                            setTimeout(() => {
                                window.location.reload();
                            }, 500);

                            return; // Don't update player list since we're no longer in lobby
                        }

                        // Handle other players leaving during game
                        if (payload.eventType === 'DELETE' && payload.old.id !== myPlayerId) {
                            console.log('👋 Another player left:', payload.old);

                            // Show notification if game is in progress
                            const { data: room } = await supabase
                                .from('game_room')
                                .select('status')
                                .eq('id', 1)
                                .single();

                            if (room && room.status === 'playing') {
                                const leftPlayer = allPlayersData.find(p => p.id === payload.old.id);
                                const playerName = leftPlayer ? getPlayerColorName(leftPlayer.player_index) : 'A player';
                                updateStatus(`👋 ${playerName} left the game`);

                                // Check if I'm the only player left
                            const { data: remainingPlayers } = await supabase
                                .from('players')
                                .select('id, username, player_index, color');

                                console.log('💥 Remaining players after deletion:', remainingPlayers);
                                console.log('📍 My player ID:', myPlayerId);

                                if (remainingPlayers && remainingPlayers.length === 1 && remainingPlayers[0].id === myPlayerId) {
                                    console.log('I am the last player remaining - win by default!');
                                    console.log('My player index:', myPlayerIndex);

                                    // Mark game as finished with me as winner
                                    if (myPlayerIndex !== null && myPlayerIndex !== undefined) {
                                        console.log('Calling handleGameOver with index:', myPlayerIndex);
                                        await handleGameOver(myPlayerIndex, 'last_standing');
                                    } else {
                                        console.error('Cannot win - myPlayerIndex is null/undefined');
                                    }
                                } else {
                                    console.log('Still', remainingPlayers?.length || 0, 'players in game');
                                }

                                // Update placement-phase tracking if a player was kicked/left
                                if (remainingPlayers) {
                                    totalPlayers = remainingPlayers.length;
                                    allPlayersData = remainingPlayers;

                                    if (isPlacementPhase) {
                                        const remainingIndices = new Set(
                                            remainingPlayers
                                                .map(p => p.player_index)
                                                .filter(i => i !== null && i !== undefined)
                                        );

                                        // Drop placements for players that left
                                        playerTilesPlaced = new Set(
                                            Array.from(playerTilesPlaced).filter(idx => remainingIndices.has(idx))
                                        );

                                        // If all remaining players have placed, complete placement phase (host only)
                                        if (isHost && playerTilesPlaced.size >= totalPlayers && totalPlayers > 0) {
                                            isPlacementPhase = false;
                                            const sorted = Array.from(remainingIndices).sort((a, b) => a - b);
                                            activePlayerIndex = sorted[0];
                                            const startedAt = Date.now();
                                            turnStartedAtMs = startedAt;
                                            broadcastGameAction('placement-complete', {
                                                playerIndex: activePlayerIndex,
                                                turnStartedAt: startedAt
                                            });
                                            updateTurnDisplay();
                                        }
                                    }
                                }
                            }
                        }

                        // Update our local isHost status when players change
                        // Check if we're now the first player (host)
                        if (myPlayerId) {
                            const { data: allPlayers } = await supabase
                                .from('players')
                                .select('*')
                                .order('created_at', { ascending: true });

                            if (allPlayers && allPlayers.length > 0) {
                                const wasHost = isHost;
                                isHost = allPlayers[0].id === myPlayerId;

                                // Notify if we became host
                                if (!wasHost && isHost) {
                                    console.log('⚠️ You are now the host!');
                                }
                            }
                        }

                        updatePlayerList();
                    }
                )
                .subscribe();
            
            // Subscribe to game_room table
            gameRoomSubscription = supabase
                .channel('game-room-channel-' + Math.random())
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'game_room' },
                    (payload) => {
                        console.log('Game room update:', payload);
                        if (payload.new && payload.new.status === 'playing') {
                            handleGameStart();
                        } else if (payload.new && payload.new.status === 'finished') {
                            // Game ended - win screen is shown by handleGameOver directly
                            console.log('🏁 Game finished!');
                        }
                    }
                )
                .subscribe();
            
            // Initial update
            updatePlayerList();
        }

        // Update player list display
        async function updatePlayerList() {
            try {
                const { data: players, error } = await supabase
                    .from('players')
                    .select('*')
                    .order('created_at', { ascending: true });

                if (error) throw error;

                const container = document.getElementById('players-container');
                if (!players || players.length === 0) {
                    container.innerHTML = '<p style="color: #999; font-style: italic;">No players yet...</p>';
                    return;
                }

                container.innerHTML = players.map((p, index) => {
                    const isMe = p.id === myPlayerId;
                    const readyIcon = p.is_ready ? '✓' : '○';
                    const readyColor = p.is_ready ? '#4CAF50' : '#999';
                    const meLabel = isMe ? ' <span style="color: #ffd700;">(You)</span>' : '';
                    // First player in the list (index 0) is the host
                    const hostLabel = index === 0 ? ' <span style="color: #FF9800;">👑 Host</span>' : '';

                    return `
                        <div style="padding: 10px; margin: 5px 0; background: ${isMe ? '#444' : '#3a3a3a'}; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                            <span>${p.username}${hostLabel}${meLabel}</span>
                            <span style="color: ${readyColor}; font-size: 20px;">${readyIcon}</span>
                        </div>
                    `;
                }).join('');

                // Show/hide host settings panel
                const hostSettings = document.getElementById('host-settings');
                const totalCount = players.length;

                if (isHost && totalCount >= 2 && totalCount <= 5) {
                    hostSettings.style.display = 'block';
                } else {
                    hostSettings.style.display = 'none';
                }

                // Update status
                const statusDiv = document.getElementById('lobby-status');

                if (totalCount < 2) {
                    statusDiv.textContent = 'Waiting for more players... (need at least 2)';
                    statusDiv.style.color = '#999';
                } else if (totalCount > 5) {
                    statusDiv.textContent = 'Too many players! Maximum is 5.';
                    statusDiv.style.color = '#f44336';
                } else {
                    statusDiv.textContent = `${totalCount} players in lobby. Host can start the game!`;
                    statusDiv.style.color = '#4CAF50';
                }
                
            } catch (error) {
                console.error('Error updating player list:', error);
            }
        }

        // Host starts the game manually
        async function hostStartGame() {
            if (!isHost) {
                alert('Only the host can start the game!');
                return;
            }

            try {
                const { data: players, error } = await supabase
                    .from('players')
                    .select('*');

                if (error) throw error;

                // Validate player count
                if (players.length < 2) {
                    alert('Need at least 2 players to start!');
                    return;
                }

                if (players.length > 5) {
                    alert('Too many players! Maximum is 5.');
                    return;
                }

                console.log('🎮 Host starting game with', players.length, 'players...');

                // Get turn timer settings
                const timeoutSelect = document.getElementById('timeout-setting');
                const turnTimeLimit = parseInt(timeoutSelect.value, 10) * 1000; // seconds -> ms
                const kickCheckbox = document.getElementById('kick-on-timeout');
                const kickMode = !!(kickCheckbox && kickCheckbox.checked);

                console.log('⚠️ Turn time limit set to:', turnTimeLimit / 1000, 'seconds');
                console.log('👢 Kick on turn timeout:', kickMode);

                // Randomly assign player indices and colors
                const colorRankOrder = ['purple', 'yellow', 'red', 'blue', 'green'];
                const shuffledIndices = [...Array(players.length).keys()].sort(() => Math.random() - 0.5);

                // Update game room status to trigger game start and store turn-timer settings
                const startedAtIso = new Date().toISOString();

                // Try writing extended fields; if the DB schema doesn't have them, fall back gracefully.
                let { error: roomError } = await supabase
                    .from('game_room')
                    .update({
                        status: 'playing',
                        current_turn_index: 0,
                        inactivity_timeout: turnTimeLimit,        // reused as turn time limit (ms)
                        kick_on_turn_timeout: kickMode,
                        turn_started_at: startedAtIso
                    })
                    .eq('id', 1);

                if (roomError) {
                    console.warn('⚠️ Failed to write extended turn timer fields to game_room. Trying without optional fields...', roomError);
                    // Try without kick_on_turn_timeout and turn_started_at
                    let fallback = await supabase
                        .from('game_room')
                        .update({
                            status: 'playing',
                            current_turn_index: 0,
                            inactivity_timeout: turnTimeLimit
                        })
                        .eq('id', 1);

                    if (fallback.error) {
                        console.warn('⚠️ Second fallback failed, trying minimal update...', fallback.error);
                        // Minimal fallback - just status and turn index
                        fallback = await supabase
                            .from('game_room')
                            .update({
                                status: 'playing',
                                current_turn_index: 0
                            })
                            .eq('id', 1);
                    }

                    roomError = fallback.error;
                }

                if (roomError) throw roomError;

                // Also set local host timer baseline immediately
                gameInactivityTimeout = turnTimeLimit;
                kickOnTurnTimeout = kickMode;
                turnStartedAtMs = Date.now();

                // Assign colors and indices to players
                for (let i = 0; i < players.length; i++) {
                    const player = players[i];
                    const assignedIndex = shuffledIndices[i];
                    const assignedColor = colorRankOrder[assignedIndex];

                    await supabase
                        .from('players')
                        .update({
                            player_index: assignedIndex,
                            color: assignedColor
                        })
                        .eq('id', player.id);
                }

                console.log('✅ Game started by host!');

            } catch (error) {
                console.error('Error starting game:', error);
                alert('Failed to start game: ' + error.message);
            }
        }

        // Check if game should start (DEPRECATED - now host-controlled)
        async function checkGameStart() {
            try {
                const { data: players, error } = await supabase
                    .from('players')
                    .select('*');
                
                if (error) throw error;
                
                // Need at least 2 players, max 5
                if (players.length < 2 || players.length > 5) return;
                
                // Check if all ready
                const allReady = players.every(p => p.is_ready);
                if (!allReady) return;
                
                console.log('🎮 All players ready! Starting game...');
                
                // Randomly assign player indices and colors
                const colorRankOrder = ['purple', 'yellow', 'red', 'blue', 'green'];
                const shuffledIndices = [...Array(players.length).keys()].sort(() => Math.random() - 0.5);
                
                // Update game room status
                const { error: roomError } = await supabase
                    .from('game_room')
                    .update({ status: 'playing', current_turn_index: 0 })
                    .eq('id', 1);
                
                if (roomError) throw roomError;
                
                // Assign colors and indices to players
                for (let i = 0; i < players.length; i++) {
                    const player = players[i];
                    const assignedIndex = shuffledIndices[i];
                    const assignedColor = colorRankOrder[assignedIndex];
                    
                    await supabase
                        .from('players')
                        .update({ 
                            player_index: assignedIndex, 
                            color: assignedColor 
                        })
                        .eq('id', player.id);
                }
                
            } catch (error) {
                console.error('Error checking game start:', error);
            }
        }

        // Handle game start
        async function handleGameStart() {
            try {
                // Wait for player_index to be assigned (retry up to 10 times)
                let myPlayer = null;
                let attempts = 0;
                
                while (attempts < 10) {
                    const { data, error } = await supabase
                        .from('players')
                        .select('*')
                        .eq('id', myPlayerId)
                        .single();
                    
                    if (error) throw error;
                    
                    if (data.player_index !== null && data.player_index !== undefined) {
                        myPlayer = data;
                        break;
                    }
                    
                    console.log(`⏳ Waiting for player index assignment (attempt ${attempts + 1}/10)...`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    attempts++;
                }
                
                if (!myPlayer || myPlayer.player_index === null) {
                    throw new Error('Player index was not assigned');
                }
                
                myPlayerIndex = myPlayer.player_index;
                
                // Get all players
                const { data: allPlayers } = await supabase
                    .from('players')
                    .select('*')
                    .order('player_index', { ascending: true });
                
                console.log('🎮 Starting multiplayer game!');
                console.log('My index:', myPlayerIndex);
                console.log('My color:', myPlayer.color);
                console.log('All players:', allPlayers);
                
                // Get game room settings (turn timer)
                // We select '*' for forward/backward compatibility if columns are missing.
                const { data: room } = await supabase
                    .from('game_room')
                    .select('*')
                    .eq('id', 1)
                    .single();

                if (room && room.inactivity_timeout !== null && room.inactivity_timeout !== undefined) {
                    gameInactivityTimeout = room.inactivity_timeout; // reused as turn time limit (ms)
                    console.log('⚠️ Loaded turn time limit:', gameInactivityTimeout / 1000, 'seconds');
                }

                if (room && room.kick_on_turn_timeout !== null && room.kick_on_turn_timeout !== undefined) {
                    kickOnTurnTimeout = !!room.kick_on_turn_timeout;
                    console.log('👢 kickOnTurnTimeout:', kickOnTurnTimeout);
                }

                // Set turn started time
                if (room && room.turn_started_at) {
                    const ts = new Date(room.turn_started_at).getTime();
                    if (!Number.isNaN(ts)) {
                        turnStartedAtMs = ts;
                    } else {
                        turnStartedAtMs = Date.now();
                    }
                } else {
                    turnStartedAtMs = Date.now();
                }

                // Derive deck seed from player IDs - this is deterministic and shared
                // Sort player IDs and hash them to get a consistent seed
                const sortedPlayerIds = allPlayers.map(p => p.id).sort().join('');
                let gameDeckSeed = 0;
                for (let i = 0; i < sortedPlayerIds.length; i++) {
                    gameDeckSeed = ((gameDeckSeed << 5) - gameDeckSeed + sortedPlayerIds.charCodeAt(i)) | 0;
                }
                gameDeckSeed = Math.abs(gameDeckSeed);
                console.log('🎴 Derived deck seed from player IDs:', gameDeckSeed);

                // Hide lobby, show new game layout
                document.getElementById('lobby-wrapper').style.display = 'none';
                document.getElementById('game-layout').classList.add('active');
                updateDeckIndicatorVisibility();

                // Show leave game and end turn buttons in multiplayer
                document.getElementById('leave-game').style.display = 'inline-block';
                document.getElementById('end-turn').style.display = 'inline-block';

                // Show timer HUD element
                document.getElementById('hud-timer').style.display = 'flex';

                // Initialize new UI elements
                initializeNewUI();

                // Start turn timer monitoring (turn-based timeout)
                startTurnTimerMonitoring();

                // Initialize game with multiplayer players and shared deck seed
                startMultiplayerGame(allPlayers, gameDeckSeed);
                
            } catch (error) {
                console.error('Error handling game start:', error);
                alert('Failed to start game: ' + error.message);
            }
        }

        // Update heartbeat (keep player active)
        function updateHeartbeat() {
            if (!myPlayerId) return;

            // REMOVED: Automatic heartbeat was preventing timeout kicks
            // Players' last_seen is updated only when they make moves via recordActivity()
            // This allows the inactivity timeout to properly detect and kick inactive players

            // setInterval(async () => {
            //     // Don't update if we're no longer in the lobby
            //     if (!myPlayerId) return;

            //     try {
            //         await supabase
            //             .from('players')
            //             .update({ last_seen: new Date().toISOString() })
            //             .eq('id', myPlayerId);
            //     } catch (error) {
            //         console.error('Heartbeat error:', error);
            //     }
            // }, 30000); // Every 30 seconds
        }

        // Clean up on page unload (synchronous to ensure it completes)
        window.addEventListener('beforeunload', (e) => {
            if (myPlayerId) {
                // Use navigator.sendBeacon for reliable cleanup during page unload
                const supabaseUrl = supabase.supabaseUrl;
                const supabaseKey = supabase.supabaseKey;

                // Direct REST API call using fetch with keepalive
                fetch(`${supabaseUrl}/rest/v1/players?id=eq.${myPlayerId}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json'
                    },
                    keepalive: true // This ensures the request completes even if page closes
                });
            }
        });

        // Auto-refresh player list when tab becomes visible again
        // (catches missed real-time events while tab was in background)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && myPlayerId) {
                console.log('🔄 Tab visible — refreshing player list');
                updatePlayerList();
            }
        });

        // Periodic lobby poll — re-fetch player list every 10s while in lobby (not in-game)
        let lobbyPollInterval = null;

        function startLobbyPoll() {
            stopLobbyPoll(); // Clear any existing interval
            lobbyPollInterval = setInterval(() => {
                if (!myPlayerId) {
                    stopLobbyPoll();
                    return;
                }
                // Only poll while in lobby phase (not during an active game)
                const lobbyVisible = document.getElementById('multiplayer-lobby').style.display !== 'none';
                if (lobbyVisible) {
                    updatePlayerList();
                } else {
                    // Game started — stop polling
                    stopLobbyPoll();
                }
            }, 10000);
        }

        function stopLobbyPoll() {
            if (lobbyPollInterval) {
                clearInterval(lobbyPollInterval);
                lobbyPollInterval = null;
            }
        }

        // Auto-detect and clean up stale lobby state on page load
        (async function checkLobbyStateOnLoad() {
            try {
                const { data: room } = await supabase
                    .from('game_room')
                    .select('status')
                    .eq('id', 1)
                    .single();

                if (room && (room.status === 'playing' || room.status === 'finished')) {
                    // Check if any players are actually still in the game
                    const { data: players } = await supabase
                        .from('players')
                        .select('id');

                    if (!players || players.length === 0) {
                        // Abandoned game — auto-reset so next joiner gets a clean lobby
                        console.log('🧹 Stale game detected (no players) — auto-resetting lobby');
                        await supabase
                            .from('game_room')
                            .update({ status: 'waiting', current_turn_index: 0 })
                            .eq('id', 1);
                    } else {
                        console.log(`ℹ️ Game in progress with ${players.length} player(s)`);
                    }
                }
            } catch (err) {
                console.error('Lobby state check error:', err);
            }
        })();

        // Secret keyboard sequence "reset" to reveal the Reset Lobby button
        (function() {
            const SECRET = 'reset';
            let buffer = '';
            document.addEventListener('keydown', (e) => {
                // Only listen while lobby is visible
                const lobbyEl = document.getElementById('multiplayer-lobby');
                if (!lobbyEl || lobbyEl.style.display === 'none') return;
                // Ignore if user is typing in an input field
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                buffer += e.key.toLowerCase();
                // Keep only the last N characters
                if (buffer.length > SECRET.length) {
                    buffer = buffer.slice(-SECRET.length);
                }
                if (buffer === SECRET) {
                    const btn = document.getElementById('reset-lobby-btn');
                    if (btn) {
                        btn.style.display = btn.style.display === 'none' ? '' : 'none';
                        buffer = '';
                    }
                }
            });
        })();

        let gameChannel = null; // Global reference to the game broadcast channel

        // Set up broadcast channel for real-time game synchronization
        function setupGameBroadcast() {
            if (gameChannel) {
                gameChannel.unsubscribe();
            }

            // Create a channel for this game room
            gameChannel = supabase.channel('game-room-1', {
                config: {
                    broadcast: { self: false } // Don't receive our own broadcasts
                }
            });

            // Listen for tile flip events
            gameChannel.on('broadcast', { event: 'tile-flip' }, ({ payload }) => {
                console.log('📄 Received tile flip broadcast:', payload);
                const { tileId, shrineType } = payload;
                // Find the tile and flip it
                const tile = document.querySelector(`[data-tile-id="${tileId}"]`);
                if (tile) {
                    console.log(`✅ Found tile ${tileId}, flipping to ${shrineType}`);
                    flipTileVisually(tile, shrineType);
                    // Re-apply Wandering River indicator if this tile was transformed (flip replaced the element)
                    if (typeof placedTiles !== 'undefined' && spellSystem && spellSystem.scrollEffects) {
                        const tileObj = placedTiles.find(t => Number(t.id) === Number(tileId));
                        const wr = spellSystem.scrollEffects.activeBuffs.wanderingRiver;
                        const entry = Array.isArray(wr) ? wr.find(e => Number(e.tileId) === Number(tileId)) : null;
                        if (tileObj && entry && entry.newElement) {
                            spellSystem.scrollEffects.applyWanderingRiverIndicator(tileObj, entry.newElement);
                        }
                    }
                } else {
                    console.error(`❌ Could not find tile with id ${tileId} in DOM`);
                }
            });

            // Wandering River: other players see and are affected by the transformation (clear at caster's next turn)
            gameChannel.on('broadcast', { event: 'wandering-river-apply' }, ({ payload }) => {
                console.log('📄 Received wandering-river-apply:', payload);
                const { tileId, newElement, playerIndex } = payload;
                if (!spellSystem || !spellSystem.scrollEffects) return;
                spellSystem.scrollEffects.activeBuffs.wanderingRiver = spellSystem.scrollEffects.activeBuffs.wanderingRiver || [];
                spellSystem.scrollEffects.activeBuffs.wanderingRiver.push({
                    tileId: tileId,
                    newElement: newElement,
                    playerIndex: playerIndex,
                    expiresNextTurn: true
                });
                if (typeof placedTiles !== 'undefined') {
                    const tile = placedTiles.find(t => Number(t.id) === Number(tileId));
                    if (tile && tile.element) {
                        spellSystem.scrollEffects.applyWanderingRiverIndicator(tile, newElement);
                    }
                }
            });

            // Take Flight (Wind IV): teleport a player to a new position
            gameChannel.on('broadcast', { event: 'take-flight' }, ({ payload }) => {
                console.log('📄 Received take-flight:', payload);
                const { targetPlayerIndex, x, y } = payload;
                if (typeof movePlayerVisually === 'function') {
                    movePlayerVisually(targetPlayerIndex, x, y, 0);
                } else {
                    // Fallback
                    const target = playerPositions[targetPlayerIndex];
                    if (target) {
                        target.x = x;
                        target.y = y;
                        if (target.element) {
                            target.element.setAttribute('transform', `translate(${x}, ${y})`);
                        }
                    }
                }
                console.log(`🌬️ Take Flight: player ${targetPlayerIndex} teleported to (${x.toFixed(1)}, ${y.toFixed(1)})`);
            });

            // Catacomb/Freedom teleport: sync shrine teleports
            gameChannel.on('broadcast', { event: 'catacomb-teleport' }, ({ payload }) => {
                console.log('📄 Received catacomb-teleport:', payload);
                const { playerIndex, x, y } = payload;
                if (typeof movePlayerVisually === 'function') {
                    movePlayerVisually(playerIndex, x, y, 0);
                } else {
                    const target = playerPositions[playerIndex];
                    if (target) {
                        target.x = x;
                        target.y = y;
                        if (target.element) {
                            target.element.setAttribute('transform', `translate(${x}, ${y})`);
                        }
                    }
                }
                console.log(`🔅 Catacomb teleport: player ${playerIndex} to (${x.toFixed(1)}, ${y.toFixed(1)})`);
            });

            // Freedom (Wind III): other players receive the buff so shrine teleport works for everyone
            gameChannel.on('broadcast', { event: 'freedom-apply' }, ({ payload }) => {
                console.log('📄 Received freedom-apply:', payload);
                const { playerIndex } = payload;
                if (!spellSystem || !spellSystem.scrollEffects) return;
                spellSystem.scrollEffects.activeBuffs.freedom = {
                    playerIndex: playerIndex,
                    expiresNextTurn: true
                };
                if (typeof updateCatacombIndicators === 'function') {
                    updateCatacombIndicators();
                }
            });

            // Listen for stone placement events
            gameChannel.on('broadcast', { event: 'stone-place' }, ({ payload }) => {
                console.log('📄 Received stone placement:', payload);
                const { x, y, stoneType } = payload;
                placeStoneVisually(x, y, stoneType);
            });

            // Listen for stone move events
            gameChannel.on('broadcast', { event: 'stone-move' }, ({ payload }) => {
                console.log('📄 Received stone move:', payload);
                const { stoneId, x, y, stoneType } = payload;
                moveStoneVisually(stoneId, x, y, stoneType);
            });

            // Listen for stone break events
            gameChannel.on('broadcast', { event: 'stone-break' }, ({ payload }) => {
                console.log('📄 Received stone break:', payload);
                const { stoneId } = payload;
                breakStoneVisually(stoneId);
            });

            // Listen for player tile placement events
            gameChannel.on('broadcast', { event: 'player-tile-place' }, ({ payload }) => {
                console.log('📄 Received player tile placement:', payload);
                const { x, y, playerIndex, color } = payload;
                placePlayerTileVisually(x, y, playerIndex, color);
            });

            // Listen for player movement events
            gameChannel.on('broadcast', { event: 'player-move' }, ({ payload }) => {
                console.log('📄 Received player movement:', payload);
                const { playerIndex, x, y, apSpent } = payload;
                movePlayerVisually(playerIndex, x, y, apSpent);
            });

            // Listen for turn change events
            gameChannel.on('broadcast', { event: 'turn-change' }, ({ payload }) => {
                console.log('📄 Received turn-change:', payload.playerIndex, 'turnNumber:', payload.turnNumber, 'myPlayerIndex:', myPlayerIndex, 'isPlacementPhase:', isPlacementPhase);

                // Validate turn number for desync detection
                if (typeof payload.turnNumber === 'number') {
                    const expectedTurn = lastReceivedTurnNumber + 1;

                    if (payload.turnNumber > expectedTurn) {
                        // We missed some turns! Log warning
                        console.warn(`⚠️ DESYNC DETECTED: Expected turn ${expectedTurn}, received turn ${payload.turnNumber}. Missed ${payload.turnNumber - expectedTurn} turn(s).`);
                        updateStatus(`⚠️ Turn sync issue detected - auto-correcting...`);
                    } else if (payload.turnNumber < lastReceivedTurnNumber) {
                        // Received an old turn? Ignore it
                        console.warn(`⚠️ Received outdated turn ${payload.turnNumber} (current: ${lastReceivedTurnNumber}). Ignoring.`);
                        return;
                    }

                    lastReceivedTurnNumber = payload.turnNumber;
                }

                activePlayerIndex = payload.playerIndex;
                if (payload.turnStartedAt) {
                    turnStartedAtMs = payload.turnStartedAt;
                } else {
                    turnStartedAtMs = Date.now();
                }
                // Wandering River clears at the beginning of the caster's next turn
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
                // Excavate teleport: if it's my turn and I have a pending teleport, trigger it
                if (activePlayerIndex === myPlayerIndex && spellSystem?.scrollEffects?.processExcavateTeleport) {
                    spellSystem.scrollEffects.processExcavateTeleport(activePlayerIndex);
                }

                // AP resets at the start of the new player's turn
                if (activePlayerIndex === myPlayerIndex) {
                    currentAP = 5;
                    document.getElementById('ap-count').textContent = currentAP;
                    if (typeof refreshVoidAP === 'function') refreshVoidAP();
                    if (typeof syncPlayerState === 'function') syncPlayerState();
                }

                updateEndTurnButtonVisibility();
            updateDeckIndicatorVisibility();
                updateOpponentPanel(); // Update opponent panel on turn change

                if (isPlacementPhase) {
                    // During placement, update status for tile placement
                    if (canPlaceTile()) {
                        updateStatus(`Your turn! Place your player tile (${playerTilesPlaced.size}/${totalPlayers} placed)`);
                        setInventoryOpen(true);
                        console.log(`✅ My turn to place tile`);
                    } else {
                        const nextColorName = getPlayerColorName(activePlayerIndex);
                        updateStatus(`Waiting for ${nextColorName} to place their tile... (${playerTilesPlaced.size}/${totalPlayers})`);
                        console.log(`⏳ Waiting for player ${activePlayerIndex} to place`);
                    }
                } else {
                    // Normal gameplay turn display
                    updateTurnDisplay();
                }
            });

            // Listen for player tile placement during placement phase
            gameChannel.on('broadcast', { event: 'player-tile-placed' }, ({ payload }) => {
                console.log('📄 Player tile placed:', payload);
                const { playerIndex } = payload;
                playerTilesPlaced.add(playerIndex);

                // Don't check completion here - let placement-complete event handle it
                if (isPlacementPhase && playerTilesPlaced.size < totalPlayers) {
                    // Update status during placement phase
                    if (canPlaceTile()) {
                        updateStatus(`Your turn! Place your player tile (${playerTilesPlaced.size}/${totalPlayers} placed)`);
                        setInventoryOpen(true);
                    } else {
                        const nextColorName = getPlayerColorName(activePlayerIndex);
                        updateStatus(`Waiting for ${nextColorName} to place their tile... (${playerTilesPlaced.size}/${totalPlayers})`);
                    }
                }
            });

            // Listen for placement phase completion
            gameChannel.on('broadcast', { event: 'placement-complete' }, ({ payload }) => {
                console.log('📄 Placement phase complete');
                isPlacementPhase = false;
                activePlayerIndex = payload.playerIndex; // Set to first player
                if (payload.turnStartedAt) {
                    turnStartedAtMs = payload.turnStartedAt;
                } else {
                    turnStartedAtMs = Date.now();
                }

                if (isMyTurn()) {
                    updateStatus(`✅ All tiles placed! It's your turn!`);
                } else {
                    const firstPlayerColorName = getPlayerColorName(activePlayerIndex);
                    updateStatus(`✅ All tiles placed! Waiting for ${firstPlayerColorName}'s turn...`);
                }

                // Ensure standard turn UI becomes visible after placement phase
                updateTurnDisplay();
                updateDeckIndicatorVisibility();

            });

            // Listen for spell cast events
            gameChannel.on('broadcast', { event: 'spell-cast' }, ({ payload }) => {
                console.log('📄 Received spell cast:', payload);
                const { playerIndex, spellName, element, elements, level, isCatacomb } = payload;

                // Update that player's activated elements display
                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                const playerScrollData = spellSystem.playerScrolls[playerIndex];

                if (isCatacomb) {
                    // Catacomb activates multiple elements
                    elements.forEach(el => {
                        playerScrollData.activated.add(el);
                    });
                } else {
                    // Regular spell activates one element
                    playerScrollData.activated.add(element);
                }

                // Update the element symbols display for that player
                updatePlayerElementSymbols(playerIndex);

                // Show notification
                const playerName = getPlayerColorName(playerIndex);
                if (isCatacomb) {
                    updateStatus(`✨ ${playerName} cast ${spellName}! Activated: ${elements.join(', ')}`);
                } else {
                    updateStatus(`✨ ${playerName} cast ${spellName}! Activated ${element} (level ${level})`);
                }
            });

            // Listen for scroll effect broadcasts (for scrolls with special effects)
            gameChannel.on('broadcast', { event: 'scroll-effect' }, ({ payload }) => {
                console.log('📄 Received scroll-effect:', payload);
                const { playerIndex, scrollName, effectName, element, activatedElements } = payload;

                // Update that player's activated elements
                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                const playerScrollData = spellSystem.playerScrolls[playerIndex];

                if (activatedElements && Array.isArray(activatedElements)) {
                    // Add all activated elements (for catacomb scrolls or multi-element effects)
                    activatedElements.forEach(el => {
                        playerScrollData.activated.add(el);
                    });
                } else if (element) {
                    // Single element activation
                    playerScrollData.activated.add(element);
                }

                // Update the element symbols display for that player
                updatePlayerElementSymbols(playerIndex);

                // Show notification
                const playerName = getPlayerColorName(playerIndex);
                const activatedStr = activatedElements ? activatedElements.join(', ') : element;
                updateStatus(`✨ ${playerName} used ${effectName}! Activated: ${activatedStr}`);
            });

            // Reflect triggered at start of turn: run the reflected scroll's effect and update activated elements
            gameChannel.on('broadcast', { event: 'reflect-triggered' }, ({ payload }) => {
                console.log('📄 Received reflect-triggered:', payload);
                const { playerIndex, scrollName, element, elements, isCatacomb } = payload;
                if (typeof spellSystem === 'undefined') return;

                // Execute the reflected scroll's effect on this client so the
                // Reflect caster sees stones / abilities applied locally.
                if (spellSystem.scrollEffects && scrollName) {
                    const definition = spellSystem.patterns?.[scrollName];
                    if (definition) {
                        console.log(`🪞 Running reflected scroll effect locally: ${scrollName} for player ${playerIndex}`);
                        spellSystem.scrollEffects.execute(scrollName, playerIndex, {
                            spell: definition,
                            scrollName: scrollName
                        });
                    }
                }

                // Update activated elements
                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                const activated = spellSystem.playerScrolls[playerIndex].activated;
                if (isCatacomb && elements && elements.length) {
                    elements.forEach(el => activated.add(el));
                } else if (element) {
                    activated.add(element);
                }
                // Fallback: look up the scroll's element from definitions if not provided
                if (!element && !isCatacomb && scrollName) {
                    const scrollDef = spellSystem.patterns?.[scrollName];
                    if (scrollDef?.element && scrollDef.element !== 'catacomb') {
                        activated.add(scrollDef.element);
                    }
                }
                activated.add('water');
                console.log(`🪞 Reflect activated elements for player ${playerIndex}:`, Array.from(activated));
                updatePlayerElementSymbols(playerIndex);

                // Update stone UI if this is my reflect
                if (playerIndex === myPlayerIndex) {
                    Object.keys(stoneCounts).forEach(updateStoneCount);
                }

                const playerName = getPlayerColorName(playerIndex);
                const displayName = scrollName ? (scrollName.replace(/_/g, ' ').toLowerCase()) : 'scroll';
                updateStatus(`🪞 ${playerName}'s Reflect triggered: activated ${displayName} (counts as water + ${element || 'reflected element'}).`);

                // Check win condition after Reflect activates elements
                if (activated.size === 5 && playerIndex === myPlayerIndex) {
                    spellSystem.showLevelComplete(playerIndex);
                    if (typeof handleGameOver === 'function') {
                        handleGameOver(playerIndex);
                    }
                }
            });

            // Psychic triggered at start of turn: run the stolen scroll's effect and update activated elements
            gameChannel.on('broadcast', { event: 'psychic-triggered' }, ({ payload }) => {
                console.log('📄 Received psychic-triggered:', payload);
                const { playerIndex, scrollName, element, elements, isCatacomb } = payload;
                if (typeof spellSystem === 'undefined') return;

                // Execute the stolen scroll's effect on this client
                if (spellSystem.scrollEffects && scrollName) {
                    const definition = spellSystem.patterns?.[scrollName];
                    if (definition) {
                        console.log(`🔮 Running psychic scroll effect locally: ${scrollName} for player ${playerIndex}`);
                        spellSystem.scrollEffects.execute(scrollName, playerIndex, {
                            spell: definition,
                            scrollName: scrollName
                        });
                    }
                }

                // Update activated elements
                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                const activated = spellSystem.playerScrolls[playerIndex].activated;
                if (isCatacomb && elements && elements.length) {
                    elements.forEach(el => activated.add(el));
                } else if (element) {
                    activated.add(element);
                }
                activated.add('void');
                console.log(`🔮 Psychic activated elements for player ${playerIndex}:`, Array.from(activated));
                updatePlayerElementSymbols(playerIndex);

                if (playerIndex === myPlayerIndex) {
                    Object.keys(stoneCounts).forEach(updateStoneCount);
                }

                const playerName = getPlayerColorName(playerIndex);
                const displayName = scrollName ? (scrollName.replace(/_/g, ' ').toLowerCase()) : 'scroll';
                updateStatus(`🔮 ${playerName}'s Psychic triggered: activated ${displayName} (counts as void + ${element || 'stolen element'}).`);

                if (activated.size === 5 && playerIndex === myPlayerIndex) {
                    spellSystem.showLevelComplete(playerIndex);
                    if (typeof handleGameOver === 'function') {
                        handleGameOver(playerIndex);
                    }
                }
            });

            // Listen for undo move events
            gameChannel.on('broadcast', { event: 'undo-move' }, ({ payload }) => {
                console.log('📄 Received undo move:', payload);
                const { playerIndex, x, y, apRestored } = payload;

                // Visually move the player back
                movePlayerVisually(playerIndex, x, y, -apRestored); // Negative to show AP restored

                // Note: AP update will come via player-state-update broadcast (from syncPlayerState)
                // which is sent right after the undo-move broadcast

                const playerName = getPlayerColorName(playerIndex);
                updateStatus(`⟲ ${playerName} undid their move (restored ${apRestored} AP)`);
            });

            // Listen for player state updates (AP and resources)
            gameChannel.on('broadcast', { event: 'player-state-update' }, ({ payload }) => {
                console.log('📄 Received player state update:', payload);
                const { playerIndex, currentAP, voidAP, resources } = payload;

                // Update tracked state for this player
                if (!playerAPs[playerIndex]) {
                    playerAPs[playerIndex] = { currentAP: 5, voidAP: 0 };
                }
                playerAPs[playerIndex].currentAP = currentAP;
                playerAPs[playerIndex].voidAP = voidAP;

                // Update resources
                if (!playerPools[playerIndex]) {
                    playerPools[playerIndex] = { earth: 0, water: 0, fire: 0, wind: 0, void: 0 };
                }
                Object.assign(playerPools[playerIndex], resources);
                updateOpponentPanel(); // Update opponent panel when player state changes
            });

            // Listen for scroll collection events
            gameChannel.on('broadcast', { event: 'scroll-collected' }, ({ payload }) => {
                console.log('📄 Received scroll collection:', payload);
                const { playerIndex, scrollName, shrineType } = payload;

                // Remove from the deck (scroll was drawn by the other player)
                const deckIndex = spellSystem.scrollDecks[shrineType].indexOf(scrollName);
                if (deckIndex > -1) {
                    spellSystem.scrollDecks[shrineType].splice(deckIndex, 1);
                }

                // Add to that player's hand (reinforce structure first)
                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                spellSystem.playerScrolls[playerIndex].hand.add(scrollName);
                spellSystem.validateScrollState();
                spellSystem.updateScrollCount();

                const playerName = getPlayerColorName(playerIndex);
                updateStatus(`📜 ${playerName} collected a ${shrineType} scroll!`);
                updateOpponentPanel();
                if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
            });

            // Listen for Scholar's Insight (Void II) — remote player searched a deck
            gameChannel.on('broadcast', { event: 'scholars-insight' }, ({ payload }) => {
                console.log("📄 Received Scholar's Insight:", payload);
                const { playerIndex, element, scrollName } = payload;

                // Remove chosen scroll from the deck
                const deck = spellSystem.scrollDecks[element];
                if (deck) {
                    const idx = deck.indexOf(scrollName);
                    if (idx > -1) {
                        deck.splice(idx, 1);
                    }
                    // Shuffle the deck (same as the caster did)
                    if (spellSystem.shuffleDeck) {
                        spellSystem.shuffleDeck(deck);
                    }
                }

                // Add to that player's hand
                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                spellSystem.playerScrolls[playerIndex].hand.add(scrollName);
                spellSystem.validateScrollState();
                spellSystem.updateScrollCount();

                const playerName = getPlayerColorName(playerIndex);
                updateStatus(`📜 ${playerName} used Scholar's Insight to search the ${element} deck!`);
                updateOpponentPanel();
                if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
            });

            // Listen for Create (Void V) — remote player drew stones
            gameChannel.on('broadcast', { event: 'create-stones' }, ({ payload }) => {
                console.log('📄 Received Create stones:', payload);
                const { playerIndex, element, count } = payload;

                // Update source pool (stones were drawn from source)
                if (typeof stonePools !== 'undefined' && stonePools[element] !== undefined) {
                    stonePools[element] = Math.max(0, stonePools[element] - count);
                }

                // If this is OUR player, the stones are already drawn locally
                // For remote players, update their pool display
                if (playerIndex !== myPlayerIndex) {
                    const playerName = getPlayerColorName(playerIndex);
                    updateStatus(`${playerName} used Create to draw ${count} ${element} stone${count === 1 ? '' : 's'}!`);
                } else {
                    // Our action — already handled locally, just sync source pool
                }

                if (typeof updateSourcePoolDisplay === 'function') updateSourcePoolDisplay();
                updateOpponentPanel();
            });

            // Listen for Quick Reflexes draws (Wind/Void)
            gameChannel.on('broadcast', { event: 'quick-reflexes-draw' }, ({ payload }) => {
                console.log('📄 Received Quick Reflexes draw:', payload);
                const { playerIndex, voidDrawn, windDrawn } = payload;

                // Update source pools
                if (typeof stonePools !== 'undefined') {
                    if (stonePools.void !== undefined) stonePools.void = Math.max(0, stonePools.void - (voidDrawn || 0));
                    if (stonePools.wind !== undefined) stonePools.wind = Math.max(0, stonePools.wind - (windDrawn || 0));
                }

                // Update target player's pool (if not local, since local already applied)
                if (playerIndex !== myPlayerIndex) {
                    if (!playerPools[playerIndex]) playerPools[playerIndex] = { earth: 0, water: 0, fire: 0, wind: 0, void: 0 };
                    playerPools[playerIndex].void = Math.min(5, (playerPools[playerIndex].void || 0) + (voidDrawn || 0));
                    playerPools[playerIndex].wind = Math.min(5, (playerPools[playerIndex].wind || 0) + (windDrawn || 0));
                    const playerName = getPlayerColorName(playerIndex);
                    updateStatus(`${playerName} drew ${voidDrawn || 0} void and ${windDrawn || 0} wind stones (Quick Reflexes).`);
                }

                if (typeof updateSourcePoolDisplay === 'function') updateSourcePoolDisplay();
                updateOpponentPanel();
            });

            // Listen for scroll move events (hand <-> active)
            gameChannel.on('broadcast', { event: 'scroll-move' }, ({ payload }) => {
                console.log('📄 Received scroll move:', payload);
                const { playerIndex, scrollName, toLocation } = payload;

                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                const scrolls = spellSystem.playerScrolls[playerIndex];
                if (toLocation === 'active') {
                    scrolls.hand.delete(scrollName);
                    scrolls.active.add(scrollName);
                    console.log(`📜 ${getPlayerColorName(playerIndex)} moved ${scrollName} to active area`);
                } else {
                    scrolls.active.delete(scrollName);
                    scrolls.hand.add(scrollName);
                    console.log(`📜 ${getPlayerColorName(playerIndex)} moved ${scrollName} back to hand`);
                }
                spellSystem.validateScrollState();
                spellSystem.updateScrollCount();
                updateOpponentPanel();
                if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
            });

            // Listen for scroll discard events
            gameChannel.on('broadcast', { event: 'scroll-discard' }, ({ payload }) => {
                console.log('📄 Received scroll discard:', payload);
                const { playerIndex, scrollName } = payload;

                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                const scrolls = spellSystem.playerScrolls[playerIndex];
                scrolls.hand.delete(scrollName);
                scrolls.active.delete(scrollName);
                spellSystem.validateScrollState();
                spellSystem.updateScrollCount();
                console.log(`📜 ${getPlayerColorName(playerIndex)} discarded ${scrollName}`);
                updateOpponentPanel();
                if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
            });

            // Listen for common area updates
            gameChannel.on('broadcast', { event: 'common-area-update' }, ({ payload }) => {
                console.log('📄 Received common area update:', payload);
                const { element, scrollName, replacedScroll } = payload;

                // If there was a scroll being replaced, put it back in the deck
                if (replacedScroll) {
                    spellSystem.scrollDecks[element].push(replacedScroll);
                    console.log(`📜 Common area: ${replacedScroll} returned to deck`);
                }

                spellSystem.commonArea[element] = scrollName;
                console.log(`📜 Common area: ${scrollName} now in ${element} slot`);
                spellSystem.validateScrollState();
                spellSystem.updateScrollCount();

                if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI();
                if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
                updateOpponentPanel();
            });

            // Response window events for scroll responses
            gameChannel.on('broadcast', { event: 'response-window-opened' }, ({ payload }) => {
                console.log('📄 Received response window opened:', payload);
                const { scrollName, casterIndex } = payload;

                // Only show response window if I'm NOT the caster
                if (myPlayerIndex !== casterIndex && spellSystem.responseWindow) {
                    const scrollDef = spellSystem.patterns[scrollName];
                    const scrollData = { name: scrollName, spell: scrollDef };

                    // Show the response window for this player
                    spellSystem.responseWindow.showResponseModalForOtherPlayer(scrollData, casterIndex);
                }
            });

            gameChannel.on('broadcast', { event: 'response-pass' }, ({ payload }) => {
                console.log('📄 Received response pass:', payload);
                const { playerIndex } = payload;

                // Update response window state
                if (spellSystem.responseWindow) {
                    spellSystem.responseWindow.handleRemotePass(playerIndex);
                }
            });

            gameChannel.on('broadcast', { event: 'scroll-response' }, ({ payload }) => {
                console.log('📄 Received scroll response:', payload);
                const { scrollName, playerIndex, isCounter } = payload;

                // Update response window state
                if (spellSystem.responseWindow) {
                    spellSystem.responseWindow.handleRemoteResponse(scrollName, playerIndex, isCounter);
                }
            });

            gameChannel.on('broadcast', { event: 'scroll-countered' }, ({ payload }) => {
                console.log('📄 Received scroll countered:', payload);
                const { scrollName, casterIndex } = payload;
                updateStatus(`${getPlayerColorName(casterIndex)}'s scroll was countered!`);
            });

            gameChannel.on('broadcast', { event: 'response-resolved' }, ({ payload }) => {
                console.log('📄 Received response resolved:', payload);
                // Close the response window on this client
                if (spellSystem.responseWindow) {
                    spellSystem.responseWindow.handleRemoteResolved();
                }

                // Process response scroll effects (like Unbidden Lamplight / Reflect)
                if (payload.results && payload.triggeringScroll) {
                    for (const result of payload.results) {
                        if (result.result === 'response-resolved' && result.isResponse) {
                            console.log(`ℹ️ Processing remote response scroll: ${result.scrollName}`);
                            // Only execute the response scroll effect on the RESPONDER's client.
                            // The responder's client owns the pools/decks that need modifying.
                            // Other clients will be synced via broadcasts (scroll-collected, stone-sync, etc.)
                            if (spellSystem.scrollEffects && result.casterIndex === myPlayerIndex) {
                                const scrollDef = spellSystem.patterns?.[result.scrollName];
                                // Ensure triggeringScroll has its definition (resolve from
                                // broadcast payload or local patterns)
                                const trigScroll = { ...payload.triggeringScroll };
                                if (!trigScroll.definition && trigScroll.name) {
                                    trigScroll.definition = spellSystem.patterns?.[trigScroll.name];
                                }
                                spellSystem.scrollEffects.execute(result.scrollName, result.casterIndex, {
                                    spell: scrollDef,
                                    triggeringScroll: trigScroll
                                });
                            } else {
                                console.log(`ℹ️ Skipping response effect for ${result.scrollName} (responder is player ${result.casterIndex}, I am ${myPlayerIndex})`);
                            }
                        } else if (result.result === 'countered-original') {
                            // Counter scroll (like Psychic) — execute its effect on this
                            // client so the counter-caster gets psychicPending / buffs set.
                            console.log(`ℹ️ Processing remote counter scroll: ${result.scrollName}, counter-caster: ${result.casterIndex}`);
                            if (spellSystem.scrollEffects) {
                                const scrollDef = spellSystem.patterns?.[result.scrollName];
                                const trigScroll = { ...payload.triggeringScroll };
                                if (!trigScroll.definition && trigScroll.name) {
                                    trigScroll.definition = spellSystem.patterns?.[trigScroll.name];
                                }
                                spellSystem.scrollEffects.execute(result.scrollName, result.casterIndex, {
                                    spell: scrollDef,
                                    scrollName: result.scrollName,
                                    triggeringScroll: trigScroll
                                });
                                // Clear pendingForceCommonArea — the caster's client
                                // already called discardToCommonArea and broadcast the
                                // common-area-update, so we must NOT call it again here.
                                if (spellSystem.scrollEffects.pendingForceCommonArea?.scrollName === result.scrollName) {
                                    delete spellSystem.scrollEffects.pendingForceCommonArea;
                                }
                            }
                            // If this is MY counter scroll, remove it from my active scrolls.
                            // (The common area update arrives separately via common-area-update broadcast.)
                            if (result.casterIndex === myPlayerIndex) {
                                spellSystem.ensurePlayerScrollsStructure(myPlayerIndex);
                                const myScrolls = spellSystem.playerScrolls[myPlayerIndex];
                                if (myScrolls.active.has(result.scrollName)) {
                                    myScrolls.active.delete(result.scrollName);
                                    console.log(`📜 Removed ${result.scrollName} from my active scrolls (counter sent to common area)`);
                                }
                                spellSystem.updateScrollCount();
                            }
                        }
                    }
                }
            });

            // Listen for tile swap events (Shifting Sands scroll effect)
            gameChannel.on('broadcast', { event: 'tile-swap' }, ({ payload }) => {
                console.log('📄 Received tile swap:', payload);
                const { tile1Id, tile2Id, tile1NewPos, tile2NewPos } = payload;

                const tile1 = placedTiles.find(t => t.id === tile1Id);
                const tile2 = placedTiles.find(t => t.id === tile2Id);

                if (tile1 && tile2) {
                    // Update positions
                    tile1.x = tile1NewPos.x;
                    tile1.y = tile1NewPos.y;
                    tile2.x = tile2NewPos.x;
                    tile2.y = tile2NewPos.y;

                    // Update visuals
                    if (tile1.element) {
                        tile1.element.setAttribute('transform', `translate(${tile1.x}, ${tile1.y}) rotate(${tile1.rotation || 0})`);
                    }
                    if (tile2.element) {
                        tile2.element.setAttribute('transform', `translate(${tile2.x}, ${tile2.y}) rotate(${tile2.rotation || 0})`);
                    }

                    updateStatus('Tiles were swapped by Shifting Sands!');
                }
            });

            // Listen for Telekinesis tile moves (Void III)
            gameChannel.on('broadcast', { event: 'telekinesis-move' }, ({ payload }) => {
                console.log('📄 Received telekinesis move:', payload);
                const { tileId, newPos, movedPlayers } = payload;

                const tile = placedTiles.find(t => t.id === tileId);
                if (tile) {
                    tile.x = newPos.x;
                    tile.y = newPos.y;
                    if (tile.element) {
                        tile.element.setAttribute('transform', `translate(${newPos.x}, ${newPos.y}) rotate(${tile.rotation || 0})`);
                    }
                }

                // Move players that were on the tile
                if (movedPlayers && movedPlayers.length > 0) {
                    movedPlayers.forEach(mp => {
                        if (typeof movePlayerVisually === 'function') {
                            movePlayerVisually(mp.playerIndex, mp.newX, mp.newY, 0);
                        } else if (typeof window !== 'undefined' && typeof window.movePlayerVisually === 'function') {
                            window.movePlayerVisually(mp.playerIndex, mp.newX, mp.newY, 0);
                        }
                    });
                }

                // Refresh catacomb indicators in case shrine positions changed
                if (typeof updateCatacombIndicators === 'function') {
                    updateCatacombIndicators();
                }

                updateStatus('A tile was moved by Telekinesis!');
            });

            // Listen for tile hide events (Heavy Stomp scroll effect)
            gameChannel.on('broadcast', { event: 'tile-hide' }, ({ payload }) => {
                console.log('📄 Received tile hide:', payload);
                const { tileId } = payload;

                const tile = placedTiles.find(t => t.id === tileId);
                if (tile && !tile.flipped) {
                    recreateTileAsFlipped(tile);
                    updateStatus(`${tile.shrineType} shrine was hidden by Heavy Stomp!`);
                }
            });

            // Listen for scroll effect events (generic notification)
            gameChannel.on('broadcast', { event: 'scroll-effect' }, ({ payload }) => {
                console.log('📄 Received scroll effect:', payload);
                const { playerIndex, scrollName, effectName, element, activatedElements } = payload;

                // Track activated element(s) for the remote player (win condition + tile symbols)
                if (typeof spellSystem !== 'undefined' && playerIndex != null) {
                    spellSystem.ensurePlayerScrollsStructure(playerIndex);
                    if (!spellSystem.playerScrolls[playerIndex]) return;
                    // Use activatedElements array if provided (catacomb scrolls send component elements)
                    const elements = activatedElements || (element ? [element] : []);
                    elements.forEach(el => spellSystem.playerScrolls[playerIndex].activated.add(el));
                    updatePlayerElementSymbols(playerIndex);
                }

                if (playerIndex !== myPlayerIndex) {
                    const playerName = getPlayerColorName(playerIndex);
                    updateStatus(`📜 ${playerName} activated ${effectName}!`);
                }
            });

            // Listen for Arson stone destruction on opponent's client
            // Listen for Plunder scroll events (Catacomb Scroll 8)
            gameChannel.on('broadcast', { event: 'scroll-plundered' }, ({ payload }) => {
                console.log('📄 Received scroll-plundered:', payload);
                const { casterIndex, targetIndex, scrollName } = payload;

                // Remove the scroll from the target's active area
                spellSystem.ensurePlayerScrollsStructure(targetIndex);
                const targetScrolls = spellSystem.playerScrolls[targetIndex];
                if (targetScrolls) {
                    targetScrolls.active.delete(scrollName);
                }

                // Common area update is handled by the separate common-area-update broadcast
                spellSystem.validateScrollState();
                spellSystem.updateScrollCount();
                updateOpponentPanel();
                if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();

                // If I'm the target, notify me
                if (targetIndex === myPlayerIndex) {
                    const scrollDef = SCROLL_DEFINITIONS?.[scrollName];
                    const scrollDisplayName = scrollDef?.name || scrollName;
                    const casterName = getPlayerColorName(casterIndex);
                    updateStatus(`🏴‍☠️ ${casterName} used Plunder: sent your ${scrollDisplayName} to the common area!`);
                    // Refresh my scroll UI
                    Object.keys(stoneCounts).forEach(updateStoneCount);
                }
            });

            // Listen for Excavate teleport events (Catacomb Scroll 4)
            gameChannel.on('broadcast', { event: 'excavate-teleport' }, ({ payload }) => {
                console.log('📄 Received excavate-teleport:', payload);
                const { playerIndex, x, y } = payload;
                if (typeof movePlayerVisually === 'function') {
                    movePlayerVisually(playerIndex, x, y, 0);
                } else {
                    const target = playerPositions[playerIndex];
                    if (target) {
                        target.x = x;
                        target.y = y;
                        if (target.element) {
                            target.element.setAttribute('transform', `translate(${x}, ${y})`);
                        }
                    }
                }
                console.log(`⛏️ Excavate teleport: player ${playerIndex} to (${x.toFixed(1)}, ${y.toFixed(1)})`);
            });

            // Listen for Excavate immunity buff (so other clients know player is immune)
            gameChannel.on('broadcast', { event: 'excavate-immunity' }, ({ payload }) => {
                console.log('📄 Received excavate-immunity:', payload);
                const { playerIndex } = payload;
                if (spellSystem?.scrollEffects) {
                    spellSystem.scrollEffects.activeBuffs.excavate = {
                        playerIndex: playerIndex
                    };
                    spellSystem.scrollEffects.activeBuffs.excavateTeleport = {
                        playerIndex: playerIndex
                    };
                }
            });

            gameChannel.on('broadcast', { event: 'opponent-stone-destroyed' }, ({ payload }) => {
                console.log('📄 Received opponent-stone-destroyed:', payload);
                const { opponentIndex, stoneType } = payload;

                // Update the local pool for the targeted player
                if (playerPools[opponentIndex] && playerPools[opponentIndex][stoneType] > 0) {
                    playerPools[opponentIndex][stoneType]--;
                }

                // If I'm the targeted opponent, refresh my stone UI
                if (opponentIndex === myPlayerIndex) {
                    Object.keys(stoneCounts).forEach(updateStoneCount);
                    const casterName = getPlayerColorName(activePlayerIndex);
                    updateStatus(`🔥 ${casterName} used Arson: destroyed 1 ${stoneType} stone from your pool!`);
                }

                if (typeof updateOpponentPanel === 'function') updateOpponentPanel();
            });

            // Listen for water stone transformation (Control the Current - Water V)
            gameChannel.on('broadcast', { event: 'water-stone-transformed' }, ({ payload }) => {
                console.log('📄 Received water-stone-transformed:', payload);
                const { stoneX, stoneY, newElement } = payload;

                // Find the stone at this location
                if (typeof placedStones !== 'undefined' && typeof STONE_TYPES !== 'undefined') {
                    const stone = placedStones.find(s =>
                        Math.abs(s.x - stoneX) < 1 && Math.abs(s.y - stoneY) < 1
                    );

                    if (stone && stone.element && STONE_TYPES[newElement]) {
                        // Update stone type
                        stone.type = newElement;

                        // Remove any water stone indicators (mimicry/chain rings) before transformation
                        const mimicryIndicator = stone.element.querySelector('.mimicry-indicator');
                        if (mimicryIndicator) {
                            mimicryIndicator.remove();
                        }
                        const chainIndicator = stone.element.querySelector('.chain-indicator');
                        if (chainIndicator) {
                            chainIndicator.remove();
                        }

                        // Update visual appearance - update both color and symbol
                        const circle = stone.element.querySelector('circle');
                        const text = stone.element.querySelector('text');

                        if (circle) {
                            circle.setAttribute('fill', STONE_TYPES[newElement].color);
                        }

                        if (text) {
                            text.textContent = STONE_TYPES[newElement].symbol;
                        }

                        console.log(`🌀 Transformed water stone at (${stoneX.toFixed(1)}, ${stoneY.toFixed(1)}) to ${newElement}`);
                    } else {
                        console.warn(`⚠️ Could not find stone at (${stoneX}, ${stoneY}) to transform`);
                    }
                }
            });

            // Listen for stones destroyed (Combust - Catacomb X)
            gameChannel.on('broadcast', { event: 'stones-destroyed' }, ({ payload }) => {
                console.log('📄 Received stones-destroyed:', payload);
                const { tileId, stoneIds } = payload;

                // Remove the destroyed stones from the board
                if (typeof placedStones !== 'undefined' && stoneIds && stoneIds.length > 0) {
                    stoneIds.forEach(stoneId => {
                        const stoneIndex = placedStones.findIndex(s => s.id === stoneId);
                        if (stoneIndex !== -1) {
                            const stone = placedStones[stoneIndex];

                            // Remove visual element
                            if (stone.element && stone.element.parentNode) {
                                stone.element.parentNode.removeChild(stone.element);
                            }

                            // Remove from array
                            placedStones.splice(stoneIndex, 1);
                            console.log(`💥 Removed stone ${stoneId} from board`);
                        }
                    });

                    console.log(`🔥 Combust destroyed ${stoneIds.length} stone${stoneIds.length === 1 ? '' : 's'} on tile ${tileId}`);
                }
            });

            // Listen for periodic turn sync from host (for desync recovery)
            gameChannel.on('broadcast', { event: 'turn-sync' }, ({ payload }) => {
                const { playerIndex, turnNumber, turnStartedAt } = payload;

                // Check if we're desynced
                if (activePlayerIndex !== playerIndex) {
                    console.warn(`⚠️ DESYNC CORRECTED: Local activePlayerIndex was ${activePlayerIndex}, host says ${playerIndex}`);
                    activePlayerIndex = playerIndex;
                    updateTurnDisplay();
                }

                if (typeof turnNumber === 'number' && lastReceivedTurnNumber !== turnNumber) {
                    console.warn(`⚠️ DESYNC CORRECTED: Local turn was ${lastReceivedTurnNumber}, host says ${turnNumber}`);
                    lastReceivedTurnNumber = turnNumber;
                }

                if (turnStartedAt && Math.abs(turnStartedAtMs - turnStartedAt) > 2000) {
                    console.warn(`⚠️ Turn timer desync corrected (diff: ${Math.abs(turnStartedAtMs - turnStartedAt)}ms)`);
                    turnStartedAtMs = turnStartedAt;
                }
            });

            // Listen for periodic common area sync from host (for desync recovery)
            gameChannel.on('broadcast', { event: 'common-area-sync' }, ({ payload }) => {
                const { commonArea } = payload;

                if (!commonArea || typeof spellSystem === 'undefined') return;

                // Compare and auto-correct any differences
                let corrected = false;
                Object.keys(commonArea).forEach(element => {
                    const hostScroll = commonArea[element];
                    const localScroll = spellSystem.commonArea[element];

                    if (hostScroll !== localScroll) {
                        console.warn(`⚠️ COMMON AREA DESYNC CORRECTED: ${element} slot was "${localScroll}", host says "${hostScroll}"`);
                        spellSystem.commonArea[element] = hostScroll;
                        corrected = true;
                    }
                });

                if (corrected) {
                    // Update UI after corrections
                    if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI();
                    if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
                    spellSystem.validateScrollState();
                    spellSystem.updateScrollCount();
                }
            });

            // Listen for Reflect buff applied (passive buff for next turn)
            gameChannel.on('broadcast', { event: 'reflect-buff-applied' }, ({ payload }) => {
                console.log('📄 Received reflect-buff-applied:', payload);
                const { playerIndex, scrollName, scrollDefinition } = payload;

                // Apply the Reflect buff to the spell system
                if (typeof spellSystem !== 'undefined' && spellSystem.scrollEffects) {
                    spellSystem.scrollEffects.activeBuffs.reflectPending = {
                        playerIndex: playerIndex,
                        scrollName: scrollName,
                        definition: scrollDefinition
                    };
                    console.log(`🛡️ Reflect buff applied to player ${playerIndex}: will reflect "${scrollName}" on their next turn`);
                }
            });

            // Listen for game reset (placement timeout or other critical errors)
            gameChannel.on('broadcast', { event: 'game-reset' }, ({ payload }) => {
                console.log('📄 Received game-reset:', payload);
                const { reason, kickedPlayerIndex } = payload;

                // If I'm the kicked player, skip this - I'll handle it via DELETE event
                if (typeof kickedPlayerIndex !== 'undefined' && kickedPlayerIndex === myPlayerIndex) {
                    console.log('⏰ I am the kicked player - waiting for DELETE event to handle reset');
                    return;
                }

                if (reason === 'placement-timeout') {
                    const kickedPlayerName = typeof kickedPlayerIndex !== 'undefined'
                        ? getPlayerColorName(kickedPlayerIndex)
                        : 'A player';
                    updateStatus(`⏰ ${kickedPlayerName} timed out during tile placement — returning to lobby`);
                } else {
                    updateStatus('🔄 Game reset — returning to lobby');
                }

                // Reset to lobby (for non-kicked players)
                if (typeof resetToLobby === 'function') {
                    setTimeout(() => {
                        resetToLobby();
                        // Refresh player list to show updated lobby without the kicked player
                        if (typeof refreshPlayerList === 'function') {
                            refreshPlayerList();
                        }
                    }, 1000);
                }
            });

            // Subscribe to the channel
            gameChannel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Connected to game broadcast channel');
                }
            });
        }

        // Reset game back to lobby (used for placement timeout or critical errors)
        function resetToLobby() {
            console.log('🔄 Resetting game back to lobby');

            // Stop turn timer monitoring
            if (typeof stopTurnTimerMonitoring === 'function') {
                stopTurnTimerMonitoring();
            }

            // Clear the board
            if (typeof clearBoard === 'function') {
                clearBoard(true);
            }

            // Reset viewport to default position
            if (typeof viewportX !== 'undefined') viewportX = 0;
            if (typeof viewportY !== 'undefined') viewportY = 0;
            if (typeof viewportScale !== 'undefined') viewportScale = 1;
            if (typeof updateViewport === 'function') {
                updateViewport();
            }

            // Hide game, show lobby
            document.getElementById('lobby-wrapper').style.display = 'block';
            document.getElementById('game-layout').classList.remove('active');

            // Hide leave game and end turn buttons
            const leaveBtn = document.getElementById('leave-game');
            const endTurnBtn = document.getElementById('end-turn');
            if (leaveBtn) leaveBtn.style.display = 'none';
            if (endTurnBtn) endTurnBtn.style.display = 'none';

            // Hide timer HUD
            const timerHud = document.getElementById('hud-timer');
            if (timerHud) timerHud.style.display = 'none';

            // Reset game state variables
            isPlacementPhase = false;
            playerTilesPlaced.clear();
            activePlayerIndex = 0;
            currentTurnNumber = 0;
            lastReceivedTurnNumber = 0;

            updateStatus('🏠 Returned to lobby');

            // Refresh player list to show updated lobby (e.g., without kicked player)
            if (typeof refreshPlayerList === 'function') {
                setTimeout(() => refreshPlayerList(), 500);
            }
        }

        // Broadcast a game action to all other players
        function broadcastGameAction(event, payload) {
            if (!gameChannel || !isMultiplayer) return;

            gameChannel.send({
                type: 'broadcast',
                event: event,
                payload: payload
            });
        }

        // Start multiplayer game
        function startMultiplayerGame(allPlayers, sharedDeckSeed = null) {
            // Clear the board first (skip confirmation in multiplayer)
            clearBoard(true);

            // Reset color assignments for this game
            gameSessionColors.clear();

            // Store player data globally for color name lookups
            allPlayersData = allPlayers;

            const numPlayers = allPlayers.length;
            console.log(`🎮 Starting multiplayer game with ${numPlayers} players`);
            console.log('All players:', allPlayers);

            // Find my player data
            const myPlayer = allPlayers.find(p => p.id === myPlayerId);
            if (!myPlayer) {
                console.error('Could not find my player data!');
                return;
            }

            // Set my assigned color
            playerColor = myPlayer.color;
            console.log(`🎨 I am player ${myPlayer.player_index + 1} (${playerColor})`);

            // Set activePlayerIndex to first player (player_index 0 = purple/void)
            activePlayerIndex = 0;

            // Initialize placement phase tracking
            totalPlayers = numPlayers;
            playerTilesPlaced = new Set();
            isPlacementPhase = true;
            console.log(`🎮 Placement phase initialized: activePlayerIndex=${activePlayerIndex}, totalPlayers=${totalPlayers}, myPlayerIndex=${myPlayer.player_index}`);

            // Set up broadcast channel for game actions
            setupGameBroadcast();

            // Initialize deck with shared seed for multiplayer synchronization
            initializeDeck(numPlayers, sharedDeckSeed);
            console.log(`🎴 Deck initialized with seed: ${sharedDeckSeed}`);

            // In multiplayer, only show MY player tile
            initializeMyPlayerTile(myPlayer.player_index, myPlayer.color);

            Object.keys(stoneCounts).forEach(updateStoneCount);
            updateVoidAP(); // Initialize void AP display
            drawDeckTile();
            updateViewport();
            boardSvg.style.cursor = 'grab';

            // Calculate number of tiles (6 per player)
            const numTiles = numPlayers * 6;

            // Place hidden tiles in spiral pattern
            const spiralPositions = generateSpiralPositions(numTiles);
            console.log(`Placing ${numTiles} tiles for ${numPlayers} player(s)`);
            spiralPositions.forEach((pos, index) => {
                console.log(`Tile ${index + 1}: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
                placeTile(pos.x, pos.y, 0, true); // Place as flipped (hidden)
            });

            // Center and fit the board to view
            fitBoardToView();

            // Show appropriate message based on turn order
            if (myPlayer.player_index === 0) {
                updateStatus(`🎮 You are Player ${myPlayer.player_index + 1} (${playerColor})! It's your turn - drag your player tile to the board to start.`);
            } else {
                updateStatus(`⏳ You are Player ${myPlayer.player_index + 1} (${playerColor}). Waiting for other players to place their tiles...`);
            }

            // Initialize opponent panel
            updateOpponentPanel();

            // Tutorial: show welcome overview
            if (typeof tutorialSystem !== 'undefined') {
                tutorialSystem.showStep('welcome');
            }
        }


        // Start game with selected number of players (local mode)
        function startGame(numPlayers) {
            // Clear the board first
            clearBoard();

            // Reset color assignments for this game
            gameSessionColors.clear();
            playerColor = null;
            console.log(`🎨 Starting game with ${numPlayers} player(s). Colors will be assigned as player tiles are placed.`);

            // Hide lobby, show new game layout
            document.getElementById('lobby-wrapper').style.display = 'none';
            document.getElementById('game-layout').classList.add('active');
            updateDeckIndicatorVisibility();

            // Initialize new UI elements
            initializeNewUI();

            // Calculate number of tiles (6 per player)
            const numTiles = numPlayers * 6;

            // Initialize
            initializeDeck(numPlayers); // Shuffle the tile deck
            initializePlayerTiles(numPlayers); // Create player tiles
            Object.keys(stoneCounts).forEach(updateStoneCount);
            updateVoidAP(); // Initialize void AP display
            drawDeckTile();
            updateViewport();
            boardSvg.style.cursor = 'grab';

            // Place hidden tiles in spiral pattern
            const spiralPositions = generateSpiralPositions(numTiles);
            console.log(`Placing ${numTiles} tiles for ${numPlayers} player(s)`);
            spiralPositions.forEach((pos, index) => {
                console.log(`Tile ${index + 1}: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
                placeTile(pos.x, pos.y, 0, true); // Place as flipped (hidden)
            });

            // Center and fit the board to view
            fitBoardToView();

            updateStatus(`Game started with ${numPlayers} player(s) (${numTiles} tiles). Drag a player tile from the Player Tiles deck to start.`);

            // Initialize / refresh mobile UI based on current viewport (supports devtools device toolbar)
            updateIsMobile();
            window.addEventListener('resize', updateIsMobile);
            try { window.matchMedia('(max-width: 768px)').addEventListener('change', updateIsMobile); } catch (e) {}
}

        // Mobile UI initialization and tab switching
        function initializeMobileUI() {
            const tabButtons = document.querySelectorAll('.mobile-tab-btn');
            const tilesPanel = document.getElementById('mobile-tiles-panel');
            const stonesPanel = document.getElementById('mobile-stones-panel');
            let currentTab = 'tiles';

            // Tab switching logic
            tabButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const tab = btn.dataset.tab;

                    // Update active tab button
                    tabButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Show/hide panels
                    if (tab === 'tiles') {
                        tilesPanel.classList.add('active');
                        stonesPanel.classList.remove('active');
                        currentTab = 'tiles';
                        syncMobileTileDeck();
                    } else {
                        stonesPanel.classList.add('active');
                        tilesPanel.classList.remove('active');
                        currentTab = 'stones';
                        syncMobileStoneDeck();
                    }
                });
            });

            // Swipe gesture for tab switching
            let touchStartX = 0;
            let touchEndX = 0;

            const mobileContainer = document.querySelector('.mobile-deck-container');

            mobileContainer.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            mobileContainer.addEventListener('touchend', (e) => {
                touchEndX = e.changedTouches[0].screenX;
                handleSwipe();
            }, { passive: true });

            function handleSwipe() {
                const swipeThreshold = 50;
                const diff = touchStartX - touchEndX;

                if (Math.abs(diff) > swipeThreshold) {
                    if (diff > 0 && currentTab === 'tiles') {
                        // Swiped left - switch to stones
                        tabButtons[1].click();
                    } else if (diff < 0 && currentTab === 'stones') {
                        // Swiped right - switch to tiles
                        tabButtons[0].click();
                    }
                }
            }

            // Initialize with tiles tab active
            syncMobileTileDeck();
            syncMobileStoneDeck();
        }

        
        // Programmatically open a mobile deck tab (tiles/stones)
        function openMobileTab(tab) {
            if (!isMobile) return;
            const tabButtons = document.querySelectorAll('.mobile-tab-btn');
            const tilesPanel = document.getElementById('mobile-tiles-panel');
            const stonesPanel = document.getElementById('mobile-stones-panel');

            tabButtons.forEach(b => b.classList.remove('active'));
            const btn = Array.from(tabButtons).find(b => b.dataset.tab === tab);
            if (btn) btn.classList.add('active');

            if (tab === 'tiles') {
                tilesPanel.classList.add('active');
                stonesPanel.classList.remove('active');
                syncMobileTileDeck();
            } else {
                stonesPanel.classList.add('active');
                tilesPanel.classList.remove('active');
                syncMobileStoneDeck();
            }
        }

        function setMobileDeckCollapsed(collapsed) {
            const container = document.querySelector('.mobile-deck-container');
            if (!container) return;
            if (collapsed) container.classList.add('collapsed');
            else container.classList.remove('collapsed');
        }


// Sync mobile tile deck with desktop deck
        function syncMobileTileDeck() {
            if (!isMobile) return;

            const mobileGrid = document.getElementById('mobile-tile-grid');
            mobileGrid.innerHTML = '';

            // Add player tiles
            playerTileElements.forEach((tileElement, index) => {
                const clone = tileElement.cloneNode(true);
                clone.style.touchAction = 'none';
                clone.addEventListener('touchstart', (e) => {
                    if (playerTilesAvailable <= 0) return;
                    if (isMultiplayer && isPlacementPhase && !canPlaceTile()) {
                        notYourTurn();
                        return;
                    }
                    e.preventDefault();
                    startPlayerTileDrag(index, e);
                }, { passive: false });

                mobileGrid.appendChild(clone);
            });

            // Update count
            document.getElementById('mobile-tile-count').textContent = playerTilesAvailable;
        }

        // Sync mobile stone deck with desktop deck
        function syncMobileStoneDeck() {
            if (!isMobile) return;

            const mobileGrid = document.getElementById('mobile-stone-grid');
            mobileGrid.innerHTML = '';

            ['earth', 'water', 'fire', 'wind', 'void'].forEach(type => {
                const stoneItem = document.createElement('div');
                stoneItem.className = 'stone-deck-item';
                stoneItem.style.touchAction = 'none';

                stoneItem.innerHTML = `
                    <svg width="40" height="40">
                        <circle cx="20" cy="20" r="12" fill="${STONE_TYPES[type].color}" class="stone-piece"/>
                        <text x="20" y="20" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="14" font-weight="bold">${STONE_TYPES[type].symbol}</text>
                    </svg>
                    <div class="stone-count">${playerPool[type]}/${stoneCapacity}</div>
                    <div class="source-count">${stoneCounts[type]}/${Object.keys(shuffledDeck).filter(key => shuffledDeck[key].stoneType === type).length}</div>
                `;

                stoneItem.addEventListener('touchstart', (e) => {
                    if (stoneCounts[type] <= 0) return;
                    e.preventDefault();

                    isDraggingFromDeck = true;
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

                mobileGrid.appendChild(stoneItem);
            });
        }

        // Lock screen orientation to portrait on mobile (if supported)
        if (isMobile && screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('portrait').catch(err => {
                console.log('Could not lock orientation:', err);
            });
        }
    
        // Initialize button visibility on load
        try { updateEndTurnButtonVisibility(); } catch (e) {}
