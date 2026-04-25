        // ========================================
        // AUTH SYSTEM (Supabase Auth)
        // ========================================

        // On page load: restore an existing session so the user doesn't have to log in again
        async function checkAuthSession() {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                onAuthSuccess(session.user);
            }
        }

        async function authLogin() {
            const username = document.getElementById('auth-username').value.trim();
            const password = document.getElementById('auth-password').value;
            if (!username || !password) { showAuthError('Please enter a username and password.'); return; }

            setAuthLoading(true);
            const email = username.toLowerCase() + '@godaigo.game';
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            setAuthLoading(false);

            if (error) { showAuthError(error.message); return; }
            onAuthSuccess(data.user);
        }

        async function authRegister() {
            const username = document.getElementById('auth-username').value.trim();
            const password = document.getElementById('auth-password').value;
            if (!username) { showAuthError('Please enter a username.'); return; }
            if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
            if (!/^[a-zA-Z0-9_\-\.]+$/.test(username)) {
                showAuthError('Username may only contain letters, numbers, _, -, .');
                return;
            }

            setAuthLoading(true);
            const email = username.toLowerCase() + '@godaigo.game';
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });
            setAuthLoading(false);

            if (error) {
                // Replace the internal fake email with just the username in error messages
                showAuthError(error.message.replace(email, username));
                return;
            }
            if (data.session) {
                onAuthSuccess(data.user);
            } else {
                // Email confirmation is still enabled in Supabase dashboard
                showAuthError('Registration failed: email confirmation is required. Please disable it in your Supabase Authentication settings.');
            }
        }

        async function authSignOut() {
            await supabase.auth.signOut();
            if (window.crtOverlay) window.crtOverlay.loadForUser(null);
            document.getElementById('multiplayer-lobby').style.display = 'none';
            document.getElementById('auth-screen').style.display = 'block';
            document.getElementById('auth-bar').style.display = 'none';
            // Stop browser auto-refresh and hide panels so the next user starts fresh
            stopBrowserRefresh();
            const browserPanel = document.getElementById('game-browser-panel');
            const waitingPanel = document.getElementById('waiting-room-panel');
            if (browserPanel) browserPanel.style.display = 'none';
            if (waitingPanel) waitingPanel.style.display = 'none';
            const readyControls = document.getElementById('ready-controls');
            if (readyControls) readyControls.style.display = 'none';
            document.getElementById('auth-password').value = '';
            document.getElementById('auth-error').style.display = 'none';
        }

        function onAuthSuccess(user) {
            // Derive display username from metadata (set on register) or from synthetic email
            const username = user.user_metadata?.username
                || user.email?.replace('@godaigo.game', '')
                || 'Player';

            // Store globally so all lobby functions use it without reading the DOM
            lobbyUsername = username;

            // Keep the hidden input in sync (some code paths still read it as a fallback)
            const usernameInput = document.getElementById('username-input');
            if (usernameInput) usernameInput.value = username;

            // Show signed-in bar inside the lobby
            const authBar = document.getElementById('auth-bar');
            const authBarName = document.getElementById('auth-bar-name');
            if (authBarName) authBarName.textContent = `Signed in as ${username}`;
            if (authBar) authBar.style.display = 'flex';

            // Swap screens
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('multiplayer-lobby').style.display = 'block';

            // Show the game browser (Panel A)
            showGameBrowser();

            // Initialise gamification profile and award daily login gold
            if (window.gami) {
                window.gami.init(user.id, username).then(() => {
                    window.gami.onDailyLogin();
                    window.loadMainLeaderboard?.();
                });
            }

            // Load CRT settings for this user
            if (window.crtOverlay) {
                window.crtOverlay.loadForUser(user.id);
            }
        }

        function showAuthError(msg) {
            const el = document.getElementById('auth-error');
            if (!el) return;
            el.textContent = msg;
            el.style.display = 'block';
        }

        function setAuthLoading(on) {
            const loading = document.getElementById('auth-loading');
            const loginBtn = document.getElementById('auth-login-btn');
            const regBtn = document.getElementById('auth-register-btn');
            if (loading) loading.style.display = on ? 'block' : 'none';
            if (loginBtn) loginBtn.disabled = on;
            if (regBtn) regBtn.disabled = on;
        }

        // ========================================
        // MULTIPLAYER LOBBY FUNCTIONS
        // ========================================

        let isHost = false; // Track if this player is the host

        let isJoining = false; // Prevent double-joins

        let lobbyUsername = ''; // Username from auth — set in onAuthSuccess, read everywhere instead of the hidden input
        let localReadyState = false; // Tracked locally to avoid re-reading from DB in toggleReady

        // ========================================
        // GAME BROWSER & ROOM MANAGEMENT
        // ========================================

        // --- Panel toggle helpers ---

        function showGameBrowser() {
            const browserPanel = document.getElementById('game-browser-panel');
            const waitingPanel = document.getElementById('waiting-room-panel');
            if (browserPanel) browserPanel.style.display = 'block';
            if (waitingPanel) waitingPanel.style.display = 'none';
            // Unlock + clear room-name-input so the player can choose a fresh name next time
            const roomNameInput = document.getElementById('room-name-input');
            if (roomNameInput) {
                roomNameInput.disabled = false;
                roomNameInput.style.opacity = '';
                roomNameInput.value = '';
            }
            refreshGameBrowser();
            startBrowserRefresh(); // auto-refresh every 5 seconds
        }

        function showWaitingRoom(gameId, joinCode, isPrivate, roomName) {
            currentGameId = gameId;
            currentJoinCode = joinCode || null;
            const browserPanel = document.getElementById('game-browser-panel');
            const waitingPanel = document.getElementById('waiting-room-panel');
            if (browserPanel) browserPanel.style.display = 'none';
            if (waitingPanel) waitingPanel.style.display = 'block';
            // Display the room name (static — set once at creation)
            const roomNameValue = document.getElementById('room-name-value');
            if (roomNameValue) roomNameValue.textContent = roomName || 'Game Room';
            // Show/hide room code section
            const codeDisplay = document.getElementById('room-code-display');
            if (isPrivate && joinCode) {
                codeDisplay.style.display = 'block';
                document.getElementById('room-code-value').textContent = joinCode;
            } else {
                if (codeDisplay) codeDisplay.style.display = 'none';
            }
            // Update badge
            const badge = document.getElementById('room-type-badge');
            if (badge) badge.textContent = isPrivate ? 'PRIVATE' : 'PUBLIC';
            stopBrowserRefresh();
        }

        function copyRoomCode() {
            if (currentJoinCode) navigator.clipboard?.writeText(currentJoinCode);
            updateStatus('Room code copied!');
        }

        function setBrowserStatus(msg) {
            const el = document.getElementById('browser-status');
            if (el) el.textContent = msg;
        }

        // --- Create room ---

        async function hostPublicGame()    { await createRoom(false); }
        async function createPrivateRoom() { await createRoom(true);  }

        async function createRoom(isPrivate) {
            const username = lobbyUsername;
            if (!username) { alert('Not signed in — please sign in first'); return; }

            // Read custom room name; fall back to "<username>'s Game" if left blank
            const roomNameRaw = document.getElementById('room-name-input')?.value.trim();
            const roomName = roomNameRaw || (username + "'s Game");

            // --- Auto-clean stale player entries for this username ---
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
            const { data: existingPlayers } = await supabase
                .from('players')
                .select('id, game_id, created_at')
                .eq('username', username);
            if (existingPlayers?.length) {
                const gameIds = existingPlayers.map(p => p.game_id).filter(Boolean);
                if (gameIds.length) {
                    const { data: waitingRooms } = await supabase
                        .from('game_room')
                        .select('id')
                        .in('id', gameIds)
                        .eq('status', 'waiting');
                    if (waitingRooms?.length) {
                        // Only auto-clean entries older than 2 minutes (stale sessions)
                        const staleIds = existingPlayers
                            .filter(p => p.created_at < twoMinutesAgo)
                            .map(p => p.id);
                        if (staleIds.length) {
                            await supabase.from('players').delete().in('id', staleIds);
                            console.log('🧹 Auto-cleaned stale player entries:', staleIds);
                        } else {
                            setBrowserStatus('You\'re already in a waiting room. Leave it first before creating a new one.');
                            return;
                        }
                    }
                }
            }

            setBrowserStatus('Creating room…');
            await supabase.rpc('cleanup_stale_rooms');
            const { data, error } = await supabase.rpc('create_game_room',
                { p_is_private: isPrivate, p_host_name: roomName });
            if (error || !data?.length) {
                console.error('❌ create_game_room RPC failed:', error);
                setBrowserStatus('Error creating room: ' + (error?.message || 'no data returned — see Supabase SQL Editor'));
                return;
            }
            const { room_id, join_code } = data[0];

            // Lock the room-name input — can't rename mid-game; unlocked again on leaveRoom()
            const roomNameInput = document.getElementById('room-name-input');
            if (roomNameInput) {
                roomNameInput.disabled = true;
                roomNameInput.style.opacity = '0.5';
            }

            const ok = await joinRoomAsPlayer(room_id, username);
            if (!ok) return;
            isHost = true;
            showWaitingRoom(room_id, join_code, isPrivate, roomName);
        }

        // --- Join by code ---

        async function joinByCode() {
            const code = document.getElementById('join-code-input').value.trim().toUpperCase();
            if (code.length !== 6) { setBrowserStatus('Enter a 6-character room code'); return; }
            setBrowserStatus('Looking up room…');
            const { data: room } = await supabase
                .from('game_room')
                .select('id,status,is_private,join_code,host_name')
                .eq('join_code', code)
                .single();
            if (!room) { setBrowserStatus('Room not found — check the code and try again'); return; }
            if (room.status !== 'waiting') { setBrowserStatus('That game has already started'); return; }
            const username = lobbyUsername;
            if (!username) { alert('Not signed in — please sign in first'); return; }
            const ok = await joinRoomAsPlayer(room.id, username);
            if (!ok) return;
            showWaitingRoom(room.id, room.join_code, room.is_private, room.host_name);
        }

        // --- Join a public game from browser ---

        async function joinPublicGame(gameId) {
            const username = lobbyUsername;
            if (!username) { alert('Not signed in — please sign in first'); return; }
            const { data: room } = await supabase
                .from('game_room')
                .select('id,status,is_private,join_code,host_name')
                .eq('id', gameId)
                .single();
            if (!room || room.status !== 'waiting') { refreshGameBrowser(); return; }
            const ok = await joinRoomAsPlayer(gameId, username);
            if (!ok) return;
            showWaitingRoom(gameId, null, false, room.host_name);
        }

        // --- Shared join helper ---

        async function joinRoomAsPlayer(gameId, username) {
            // Auto-clean stale entries for this username; block only if last_seen is recent (active session)
            // A player is considered active if their heartbeat fired within the last 90 seconds.
            // last_seen may be NULL for a brand-new row that hasn't heartbeated yet — treat NULL as stale
            // unless the row was created within the last 30 seconds (to avoid stomping a fresh join).
            const ninetySecondsAgo = new Date(Date.now() - 90 * 1000).toISOString();
            const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
            const { data: existing } = await supabase
                .from('players')
                .select('id, username, created_at, last_seen')
                .eq('game_id', gameId);
            const match = existing?.filter(p => p.username === username) || [];
            if (match.length) {
                const stale = match.filter(p => {
                    // Active = last_seen is recent, OR row is brand-new (< 30s) with no last_seen yet
                    if (p.last_seen && p.last_seen > ninetySecondsAgo) return false; // active
                    if (!p.last_seen && p.created_at > thirtySecondsAgo) return false; // brand-new
                    return true; // stale
                });
                const active = match.filter(p => !stale.includes(p));
                if (stale.length) {
                    await supabase.from('players').delete().in('id', stale.map(p => p.id));
                    console.log('🧹 Auto-cleaned stale entry for', username);
                }
                if (active.length) {
                    setBrowserStatus('That username is already in this room');
                    return false;
                }
            }
            const { data, error } = await supabase
                .from('players')
                .insert([{ username, is_ready: false, game_id: gameId }])
                .select()
                .single();
            if (error) { setBrowserStatus('Could not join: ' + error.message); return false; }
            myPlayerId = data.id;
            localReadyState = false;
            updateReadyButton(false);
            currentGameId = gameId;  // must be set BEFORE subscribeToLobby so filters use the correct room ID
            isMultiplayer = true;
            // Determine host: first player by creation time
            const { data: all } = await supabase
                .from('players')
                .select('*')
                .eq('game_id', gameId)
                .order('created_at', { ascending: true });
            isHost = all?.[0]?.id === myPlayerId;
            // Host is implicitly ready — their action is clicking Start, not toggling ready
            if (isHost) {
                localReadyState = true;
                await supabase.from('players').update({ is_ready: true }).eq('id', myPlayerId);
            }
            document.getElementById('ready-controls').style.display = 'block';
            updateReadyButton(localReadyState);
            subscribeToLobby();
            updateHeartbeat();
            startLobbyPoll();
            updatePlayerList();
            console.log('✅ Joined room', gameId, 'as', username, isHost ? '(HOST)' : '');
            return true;
        }

        // --- Leave room (return to game browser) ---

        async function leaveRoom() {
            const leavingRoomId = currentGameId; // capture before we null it out
            const leavingAsHost = isHost;

            // If we're mid-game, reset game state first before returning to lobby
            const gameContainer = document.querySelector('.game-container');
            const inGame = gameContainer && gameContainer.style.display !== 'none';
            if (inGame && typeof resetToLobby === 'function') {
                resetToLobby();
            }

            if (myPlayerId) {
                await supabase.from('players').delete().eq('id', myPlayerId);
            }

            // If the host leaves, delete the game_room entirely so it disappears from
            // other players' browser lists immediately rather than lingering as an empty room.
            if (leavingAsHost && leavingRoomId) {
                const { error: roomDeleteErr } = await supabase
                    .from('game_room')
                    .delete()
                    .eq('id', leavingRoomId);
                if (roomDeleteErr) {
                    console.warn('⚠️ Could not delete game_room on host leave:', roomDeleteErr.message);
                } else {
                    console.log('🗑️ Deleted game_room', leavingRoomId, '(host left waiting room)');
                }
            }

            myPlayerId = null;
            currentGameId = null;
            currentJoinCode = null;
            isHost = false;
            isMultiplayer = false;
            isJoining = false;
            stopLobbyPoll();
            if (playersSubscription) { playersSubscription.unsubscribe(); playersSubscription = null; }
            if (gameRoomSubscription) { gameRoomSubscription.unsubscribe(); gameRoomSubscription = null; }
            if (gameChannel) { gameChannel.unsubscribe(); gameChannel = null; }
            document.getElementById('ready-controls').style.display = 'none';
            showGameBrowser();
        }

        // --- Public game browser ---

        let browserRefreshInterval = null;

        async function refreshGameBrowser() {
            const refreshBtn = document.getElementById('refresh-browser-btn');
            if (refreshBtn) refreshBtn.textContent = '…';

            // Sweep stale players from waiting rooms (disconnected without clean logout)
            const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data: waitingRooms } = await supabase
                .from('game_room').select('id').eq('status', 'waiting');
            if (waitingRooms?.length) {
                await supabase
                    .from('players')
                    .delete()
                    .in('game_id', waitingRooms.map(r => r.id))
                    .lt('last_seen', staleTime);
            }

            const { data: rooms } = await supabase
                .from('game_room')
                .select('id,host_name,created_at')
                .eq('status', 'waiting')
                .eq('is_private', false)
                .order('created_at', { ascending: false });

            if (refreshBtn) refreshBtn.textContent = 'Refresh';

            const list = document.getElementById('public-games-list');
            if (!list) return;

            if (!rooms?.length) {
                list.innerHTML = '<p style="color:#666;font-style:italic;text-align:center;padding:20px 0;margin:0;">No public games open. Host one!</p>';
                return;
            }

            // Fetch player counts for each room in one query
            const ids = rooms.map(r => r.id);
            const { data: players } = await supabase
                .from('players')
                .select('game_id')
                .in('game_id', ids);
            const counts = {};
            (players || []).forEach(p => { counts[p.game_id] = (counts[p.game_id] || 0) + 1; });

            // Auto-delete ghost rooms (exist in game_room but have no players)
            // Only delete rooms older than 60s to avoid racing with a player who is mid-join
            const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
            const ghostIds = rooms
                .filter(r => !counts[r.id] && r.created_at < sixtySecondsAgo)
                .map(r => r.id);
            if (ghostIds.length) {
                supabase.from('game_room').delete().in('id', ghostIds).then(() => {
                    console.log('🗑️ Cleaned up', ghostIds.length, 'empty ghost room(s):', ghostIds);
                });
            }

            // Only show rooms that actually have players in them
            const liveRooms = rooms.filter(r => (counts[r.id] || 0) > 0);
            if (!liveRooms.length) {
                list.innerHTML = '<p style="color:#666;font-style:italic;text-align:center;padding:20px 0;margin:0;">No public games open. Host one!</p>';
                return;
            }

            list.innerHTML = liveRooms.map(r => `
                <div class="game-room-card" onclick="joinPublicGame(${r.id})">
                    <div class="game-room-host">${_esc(r.host_name || 'Unnamed Game')}</div>
                    <div class="game-room-count">${counts[r.id]} / 5</div>
                    <button class="game-room-join-btn">Join</button>
                </div>`).join('');
        }

        function startBrowserRefresh() {
            stopBrowserRefresh();
            browserRefreshInterval = setInterval(refreshGameBrowser, 5000);
        }
        function stopBrowserRefresh() {
            clearInterval(browserRefreshInterval);
            browserRefreshInterval = null;
        }

        // Simple HTML escape helper
        function _esc(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // ── Retro dialog helpers ──────────────────────────────────
        /**
         * Show a retro-styled confirm dialog.
         * onOk is called if the player clicks OK; nothing happens on Cancel.
         */
        function showRetroConfirm(title, lines, onOk) {
            const id = 'retro-confirm-overlay';
            if (document.getElementById(id)) return; // prevent duplicates

            const bodyLines = lines.map(l => `<div class="retro-dlg-line">${l}</div>`).join('');
            const el = document.createElement('div');
            el.id        = id;
            el.className = 'retro-dlg-overlay';
            el.innerHTML = `
                <div class="retro-dlg-box">
                    <div class="retro-dlg-title">${title}</div>
                    <div class="retro-dlg-body">${bodyLines}</div>
                    <div class="retro-dlg-btns">
                        <button class="retro-dlg-btn ok"     id="retro-confirm-ok">OK</button>
                        <button class="retro-dlg-btn cancel" id="retro-confirm-cancel">Cancel</button>
                    </div>
                </div>`;

            document.body.appendChild(el);

            document.getElementById('retro-confirm-ok').onclick = () => {
                el.remove();
                onOk();
            };
            document.getElementById('retro-confirm-cancel').onclick = () => el.remove();
        }

        // ========================================
        // END GAME BROWSER & ROOM MANAGEMENT
        // ========================================

        // Sequence tracking for detecting out-of-order messages and deduplication
        let scrollEventSequence = 0;
        const receivedSequences = new Set();

        // Periodically clean old sequence IDs (keep last 1000 to prevent memory leak)
        setInterval(() => {
            if (receivedSequences.size > 1000) {
                const arr = Array.from(receivedSequences);
                receivedSequences.clear();
                // Keep most recent 500
                arr.slice(-500).forEach(id => receivedSequences.add(id));
                console.log('🧹 Cleaned old event IDs from deduplication cache');
            }
        }, 30000); // Every 30 seconds

        // Join the lobby
        async function joinLobby() {
            // Prevent double-joins
            if (isJoining) {
                console.log('Already joining, please wait...');
                return;
            }

            const username = lobbyUsername;

            if (!username) {
                alert('Not signed in — please sign in first');
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
                        alert('A game is currently in progress with other players.\n\nPlease wait for it to finish, or use "Reset Lobby" to force-clear.');
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
                localReadyState = false;
                updateReadyButton(false);

                // After insertion, check if we're the first player (host)
                // The host is simply the player with the oldest created_at timestamp
                const { data: allPlayersAfterInsert } = await supabase
                    .from('players')
                    .select('*')
                    .order('created_at', { ascending: true });

                // We're host if we're the first player (by creation time)
                isHost = allPlayersAfterInsert && allPlayersAfterInsert[0].id === myPlayerId;

                // Host is implicitly ready — their action is clicking Start, not toggling ready
                if (isHost) {
                    localReadyState = true;
                    await supabase.from('players').update({ is_ready: true }).eq('id', myPlayerId);
                }

                console.log('✅ Joined lobby as:', username, 'ID:', myPlayerId, isHost ? '(HOST)' : '');

                // Hide join form, show ready controls
                document.getElementById('join-form').style.display = 'none';
                document.getElementById('ready-controls').style.display = 'block';
                updateReadyButton(localReadyState);

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
        function leaveGame() {
            if (!myPlayerId) return;

            showRetroConfirm(
                'Leave Game?',
                ['You will be removed from this game', 'and cannot rejoin.'],
                _doLeaveGame
            );
        }

        async function _doLeaveGame() {
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

                // Stop polling and subscriptions
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

                // Reset UI state
                const readyCtrl = document.getElementById('ready-controls');
                if (readyCtrl) readyCtrl.style.display = 'none';
                currentGameId = null;
                currentJoinCode = null;

                // resetToLobby handles: clearBoard, stopTurnTimerMonitoring,
                // hiding game-layout, showing lobby-wrapper, hiding leave/end-turn buttons
                resetToLobby();

                // Return to game browser panel
                showGameBrowser();

                console.log('✅ Left game successfully');

            } catch (error) {
                console.error('Error leaving game:', error);
                showRetroConfirm('Leave Failed', [error.message], () => {});
            }
        }

        // Reset the entire lobby (clear all players and reset game room)
        function resetLobby() {
            showRetroConfirm(
                'Reset Lobby?',
                ['Remove all players', 'Reset room to waiting state', 'Clear the board'],
                _doResetLobby
            );
        }

        async function _doResetLobby() {
            try {
                console.log('📄 Resetting lobby...');

                // Delete all players in the current room
                const { data: allPlayers } = await supabase
                    .from('players')
                    .select('id')
                    .eq('game_id', currentGameId);

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
                    .eq('id', currentGameId);

                if (roomError) throw roomError;

                // Reset local state
                myPlayerId = null;
                currentGameId = null;
                currentJoinCode = null;
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

                // Reset UI — return to game browser
                document.getElementById('ready-controls').style.display = 'none';

                // Hide game, show lobby
                document.querySelector('.game-container').style.display = 'none';
                document.getElementById('multiplayer-lobby').style.display = 'block';

                // Clear the board if it was started
                clearBoard(true);

                // Return to the game browser
                showGameBrowser();

                console.log('✅ Lobby reset complete!');
                alert('Lobby has been reset! You can now host or join again.');

            } catch (error) {
                console.error('Error resetting lobby:', error);
                alert('Failed to reset lobby: ' + error.message);
            }
        }

        // Guard: XP is awarded once per game session — prevents double-award from
        // multiple handleGameOver calls (game-core direct + broadcast echo + DB subscription)
        let _gameOverXpAwarded = false;

        // Handle game over - mark game as finished and show win screen
        async function handleGameOver(winnerPlayerIndex, winType = 'scrolls') {
            if (!isMultiplayer) return;

            try {
                console.log('🏆 Game Over! Winner:', winnerPlayerIndex, 'Type:', winType);

                // Award gamification XP FIRST — before showing the overlay — so the async RPC
                // completes before any page reload triggered by "Return to Lobby" can cancel it
                if (!_gameOverXpAwarded) {
                    _gameOverXpAwarded = true;
                    const isWinner = (winnerPlayerIndex === myPlayerIndex);
                    console.log(`[XP] Attempting to award XP — isWinner=${isWinner}, userId=${window.gami?.userId}, totalPlayers=${totalPlayers}`);
                    if (window.gami?.userId) {
                        await window.gami.onGameComplete(isWinner, totalPlayers);
                    } else {
                        console.warn('[XP] gami.userId not set — XP skipped. gami object:', window.gami);
                    }
                } else {
                    console.log('[XP] handleGameOver called again — XP already awarded this session, skipping.');
                }

                // Show win screen after XP is secured
                showGameOverToAll(winnerPlayerIndex, winType);

                // Update game room status to 'finished' and store winner index
                const { error } = await supabase
                    .from('game_room')
                    .update({
                        status: 'finished',
                        current_turn_index: winnerPlayerIndex
                    })
                    .eq('id', currentGameId);

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

            const overlay = document.createElement('div');
            overlay.id = 'game-over-notification';
            overlay.className = 'game-over-overlay';

            const box = document.createElement('div');
            box.className = 'game-over-box';

            const title = document.createElement('div');
            title.textContent = 'GAME OVER';
            title.className = 'game-over-title';
            box.appendChild(title);

            const winnerName = getPlayerColorName(winnerPlayerIndex);
            const playerName = document.createElement('div');
            playerName.textContent = `${winnerName} wins!`;
            playerName.className = 'game-over-winner';
            playerName.style.color = '#d9b08c';
            box.appendChild(playerName);

            const msg = document.createElement('div');
            msg.textContent = winType === 'last_standing'
                ? 'Every other player left. You win!'
                : 'All five elements have been mastered!';
            msg.className = 'game-over-msg';
            box.appendChild(msg);

            if (winType === 'scrolls') {
                const elements = document.createElement('div');
                elements.className = 'game-over-elements';
                elements.innerHTML = ['earth','water','fire','wind','void'].map(el =>
                    `<img src="images/${el === 'earth' ? 'mountainsymbol' : el === 'water' ? 'watersymbol' : el === 'fire' ? 'firesymbol' : el === 'wind' ? 'windsymbol' : 'voidsymbol'}.png" class="element-icon-sm" alt="${el}">`
                ).join(' ');
                box.appendChild(elements);
            }

            const subtitle = document.createElement('div');
            subtitle.textContent = 'The path of balance is complete.';
            subtitle.className = 'game-over-subtitle';
            box.appendChild(subtitle);

            // XP reward line — shown after onGameComplete resolves
            const xpLine = document.createElement('div');
            xpLine.id = 'game-over-xp-line';
            xpLine.style.cssText = `
                font-family: var(--font-pixel, monospace); font-size: 9px;
                color: #f0c040; letter-spacing: 1px; margin: 8px 0 4px;
                min-height: 16px;
            `;
            const isWinner = (winnerPlayerIndex === myPlayerIndex);
            const n = Math.max(2, totalPlayers || 2);
            const xpAmt = isWinner ? 75 + (n - 1) * 25 : 20 + (n - 1) * 10;
            xpLine.textContent = isWinner ? `+${xpAmt} XP  —  VICTORY` : `+${xpAmt} XP  —  GAME COMPLETE`;
            box.appendChild(xpLine);

            const lobbyBtn = document.createElement('button');
            lobbyBtn.textContent = 'Return to Lobby';
            lobbyBtn.className = 'retro-dlg-btn ok';
            lobbyBtn.onclick = async () => {
                try {
                    const roomId = currentGameId;
                    if (roomId) {
                        const { data: allP } = await supabase.from('players').select('id').eq('game_id', roomId);
                        if (allP && allP.length > 0) {
                            await supabase.from('players').delete().in('id', allP.map(p => p.id));
                        }
                        await supabase.from('game_room').update({ status: 'waiting', current_turn_index: 0 }).eq('id', roomId);
                    }
                } catch (err) {
                    console.error('Post-game cleanup error:', err);
                }
                window.location.reload();
            };
            box.appendChild(lobbyBtn);

            overlay.appendChild(box);
            document.body.appendChild(overlay);
        }

        // Update the ready button to reflect current state clearly
        function updateReadyButton(isReady) {
            const readyButton = document.getElementById('ready-button');
            if (!readyButton) return;
            // The host's action is starting the game, not toggling ready — hide it for them
            if (isHost) {
                readyButton.style.display = 'none';
                return;
            }
            readyButton.style.display = '';
            if (isReady) {
                readyButton.textContent = '✓ Ready';
                readyButton.style.background = '#4CAF50';
                readyButton.title = 'Click to cancel ready';
            } else {
                readyButton.textContent = 'Not Ready';
                readyButton.style.background = '#f44336';
                readyButton.title = 'Click to mark yourself ready';
            }
        }

        // Toggle ready status
        async function toggleReady() {
            if (!myPlayerId) return;

            try {
                const newReadyState = !localReadyState;

                // Update ready state
                const { error } = await supabase
                    .from('players')
                    .update({ is_ready: newReadyState })
                    .eq('id', myPlayerId);

                if (error) throw error;

                localReadyState = newReadyState;
                updateReadyButton(newReadyState);

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
            
            // Subscribe to players table (scoped to this room)
            playersSubscription = supabase
                .channel('players-' + currentGameId + '-' + Math.random())
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'players',
                      filter: `game_id=eq.${currentGameId}` },
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
                            alert('You were kicked from the game (timeout). The page will refresh.');

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
                                .eq('id', currentGameId)
                                .single();

                            if (room && room.status === 'playing') {
                                const leftPlayer = allPlayersData.find(p => p.id === payload.old.id);
                                const playerName = leftPlayer ? getPlayerColorName(leftPlayer.player_index) : 'A player';
                                updateStatus(`${playerName} left the game`);

                                // Check if I'm the only player left (scoped to this room)
                            const { data: remainingPlayers } = await supabase
                                .from('players')
                                .select('id, username, player_index, color')
                                .eq('game_id', currentGameId);

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
                        // Check if we're now the first player (host) within this room
                        if (myPlayerId) {
                            const { data: allPlayers } = await supabase
                                .from('players')
                                .select('*')
                                .eq('game_id', currentGameId)
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
            
            // Subscribe to game_room table (scoped to this room)
            gameRoomSubscription = supabase
                .channel('game-room-sub-' + currentGameId + '-' + Math.random())
                .on('postgres_changes',
                    { event: '*', schema: 'public', table: 'game_room',
                      filter: `id=eq.${currentGameId}` },
                    (payload) => {
                        console.log('Game room update:', payload);
                        if (payload.new && payload.new.status === 'playing') {
                            handleGameStart();
                        } else if (payload.new && payload.new.status === 'finished') {
                            // Game ended - show win screen to all players who didn't trigger it themselves
                            console.log('🏁 Game finished!');
                            const winnerIndex = payload.new.current_turn_index ?? 0;
                            // Only show if we're not the winner (winner already saw it via handleGameOver)
                            if (winnerIndex !== myPlayerIndex) {
                                showGameOverToAll(winnerIndex, 'scrolls');
                            }
                        }
                    }
                )
                .subscribe();

            // Initial update
            updatePlayerList();

            // Fallback: poll once after subscription is established in case we missed
            // the status='playing' update while the Realtime channel was connecting
            setTimeout(async () => {
                if (!currentGameId) return;
                if (document.getElementById('game-layout')?.classList.contains('active')) return;
                const { data: room } = await supabase
                    .from('game_room')
                    .select('status')
                    .eq('id', currentGameId)
                    .single();
                if (room?.status === 'playing') {
                    console.log('🔄 Fallback poll: detected game already started — joining now');
                    handleGameStart();
                }
            }, 2000);
        }

        // Update player list display
        async function updatePlayerList() {
            if (!currentGameId) return; // Not in a room yet
            try {
                const { data: players, error } = await supabase
                    .from('players')
                    .select('*')
                    .eq('game_id', currentGameId)
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
                    const hostLabel = index === 0 ? ' <span style="color: #FF9800;">Host</span>' : '';
                    // Apply local player's equipped name colour; other players keep default
                    const nameStyle = isMe
                        ? (window.cosmeticsSystem?.getNameColorStyle() || '')
                        : '';

                    return `
                        <div style="padding: 10px; margin: 5px 0; background: ${isMe ? '#444' : '#3a3a3a'}; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="${nameStyle}">${p.username}${hostLabel}${meLabel}</span>
                            <span style="color: ${readyColor}; font-size: 20px;">${readyIcon}</span>
                        </div>
                    `;
                }).join('');

                // Update room player count in the info bar
                const playerCountEl = document.getElementById('room-player-count');
                if (playerCountEl) playerCountEl.textContent = `${players.length} / 5`;

                // Show/hide host settings panel
                const hostSettings = document.getElementById('host-settings');
                const totalCount = players.length;

                // Host settings (and Start button) appear as soon as there are enough players
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
                } else if (isHost) {
                    statusDiv.textContent = `${totalCount} players in lobby. Ready to start!`;
                    statusDiv.style.color = '#4CAF50';
                } else {
                    statusDiv.textContent = `${totalCount} players in lobby. Waiting for host to start...`;
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

            // Disable the button immediately to prevent double-clicks
            const startBtn = document.getElementById('host-start-button');
            if (startBtn) startBtn.disabled = true;

            try {
                const { data: players, error } = await supabase
                    .from('players')
                    .select('*')
                    .eq('game_id', currentGameId);

                if (error) throw error;

                // Validate player count
                if (players.length < 2) {
                    if (startBtn) startBtn.disabled = false;
                    alert('Need at least 2 players to start!');
                    return;
                }

                if (players.length > 5) {
                    if (startBtn) startBtn.disabled = false;
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
                    .eq('id', currentGameId);

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
                        .eq('id', currentGameId);

                    if (fallback.error) {
                        console.warn('⚠️ Second fallback failed, trying minimal update...', fallback.error);
                        // Minimal fallback - just status and turn index
                        fallback = await supabase
                            .from('game_room')
                            .update({
                                status: 'playing',
                                current_turn_index: 0
                            })
                            .eq('id', currentGameId);
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

                // Host transitions immediately; non-host players receive the trigger via Realtime
                await handleGameStart();

            } catch (error) {
                console.error('Error starting game:', error);
                if (startBtn) startBtn.disabled = false; // allow retry
                alert('Failed to start game: ' + error.message);
            }
        }

        // Handle game start
        async function handleGameStart() {
            // Guard against duplicate calls (host's direct call + Realtime subscription racing)
            if (document.getElementById('game-layout').classList.contains('active')) {
                console.log('🔁 handleGameStart: game already active — skipping duplicate call');
                return;
            }
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
                
                // Get all players in this room
                const { data: allPlayers } = await supabase
                    .from('players')
                    .select('*')
                    .eq('game_id', currentGameId)
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
                    .eq('id', currentGameId)
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

        // Update heartbeat (keep player active while in waiting room only)
        let _heartbeatInterval = null;
        function updateHeartbeat() {
            if (!myPlayerId) return;
            if (_heartbeatInterval) clearInterval(_heartbeatInterval);
            _heartbeatInterval = setInterval(async () => {
                if (!myPlayerId) { clearInterval(_heartbeatInterval); return; }
                // Skip heartbeat during active game — in-game inactivity timeout uses last_seen
                if (document.getElementById('game-layout')?.classList.contains('active')) return;
                try {
                    await supabase
                        .from('players')
                        .update({ last_seen: new Date().toISOString() })
                        .eq('id', myPlayerId);
                } catch (e) { /* ignore */ }
            }, 30000); // Every 30 seconds
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

            // Create a channel scoped to this specific game room
            gameChannel = supabase.channel('game-room-' + currentGameId, {
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
                const { x, y, playerIndex, color, cosmetics } = payload;
                placePlayerTileVisually(x, y, playerIndex, color, cosmetics || null);
            });

            // Listen for player movement events
            gameChannel.on('broadcast', { event: 'player-move' }, ({ payload }) => {
                console.log('📄 Received player movement:', payload);
                const { playerIndex, x, y, apSpent, cosmetics } = payload;
                // Cache remote cosmetics so movePlayerVisually can apply landing effects
                if (cosmetics) {
                    window._remotePlayerCosmetics = window._remotePlayerCosmetics || {};
                    window._remotePlayerCosmetics[playerIndex] = cosmetics;
                }
                movePlayerVisually(playerIndex, x, y, apSpent);
                // Defensively flip any hidden tiles at the destination.
                // This ensures tile reveals are visible even if the tile-flip broadcast
                // arrives out of order or is lost. Uses the shared deck state to determine
                // shrine type (both clients drew from the same seed, so shrineType matches).
                if (typeof getAllHexagonPositions === 'function' && typeof placedTiles !== 'undefined') {
                    const allHexes = getAllHexagonPositions();
                    let nearestHex = null;
                    let nearestDist = Infinity;
                    allHexes.forEach(hexPos => {
                        const d = Math.sqrt(Math.pow(hexPos.x - x, 2) + Math.pow(hexPos.y - y, 2));
                        if (d < nearestDist) { nearestDist = d; nearestHex = hexPos; }
                    });
                    if (nearestHex && nearestDist < 5 && nearestHex.tiles) {
                        nearestHex.tiles
                            .filter(t => t.flipped && !t.isPlayerTile)
                            .forEach(t => {
                                const el = document.querySelector(`[data-tile-id="${t.id}"]`);
                                if (el && typeof flipTileVisually === 'function') {
                                    console.log(`🔄 Proactively flipping tile ${t.id} at received player position`);
                                    flipTileVisually(el, t.shrineType);
                                }
                            });
                    }
                }
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
                        updateStatus(`Turn sync issue detected - auto-correcting...`);
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
                // Clear all turn-based buffs (expiresThisTurn) on every client when the turn changes.
                // This is a defensive cleanup: reflect-triggered / psychic-triggered execute() on
                // ALL clients, so non-caster clients can end up with stale activeBuffs entries
                // (e.g. steamVents set for the reflect caster). Without this call those entries
                // linger until the next time clearTurnBuffs() fires on that client.
                // Safe to call multiple times — idempotent (no-op if already cleared).
                if (spellSystem?.scrollEffects?.clearTurnBuffs) {
                    spellSystem.scrollEffects.clearTurnBuffs();
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
                    updateStatus(`All tiles placed! It's your turn!`);
                } else {
                    const firstPlayerColorName = getPlayerColorName(activePlayerIndex);
                    updateStatus(`All tiles placed! Waiting for ${firstPlayerColorName}'s turn...`);
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
                    updateStatus(`${playerName} cast ${spellName}! Activated: ${elements.join(', ')}`);
                } else {
                    updateStatus(`${playerName} cast ${spellName}! Activated ${element} (level ${level})`);
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
                updateStatus(`${playerName} used ${effectName}! Activated: ${activatedStr}`);

                // Check win condition — all 5 elements activated
                if (spellSystem.playerScrolls[playerIndex].activated.size === 5) {
                    console.log(`🏆 Win condition met for player ${playerIndex} (detected via scroll-effect broadcast)`);
                    // For the winner's own echo: showLevelComplete already ran locally and
                    // showGameOverToAll is guarded by #game-over-notification. Safe to call again.
                    // For observers: handleGameOver → showGameOverToAll shows the win screen.
                    handleGameOver(playerIndex);
                }
            });

            // Simplify applied by opponent
            gameChannel.on('broadcast', { event: 'simplify-applied' }, ({ payload }) => {
                const { playerIndex } = payload;
                if (spellSystem?.scrollEffects) {
                    spellSystem.scrollEffects.activeBuffs.simplify = { expiresThisTurn: true, playerIndex };
                }
                const playerName = getPlayerColorName(playerIndex);
                updateStatus(`Simplify: ${playerName}'s scrolls cost 1 AP to cast until their next turn.`);
            });

            // Reflect triggered at start of turn: run the reflected scroll's effect and update activated elements.
            // Multiple reflect-triggered events for the same player are queued and processed one at a time
            // so that interactive scrolls fully resolve before the next one starts.
            {
                const reflectQueue = []; // pending { playerIndex, scrollName } entries
                let reflectRunning = false;

                const runNextReflectTrigger = () => {
                    if (reflectRunning || reflectQueue.length === 0) return;
                    const { playerIndex, scrollName } = reflectQueue.shift();
                    reflectRunning = true;

                    const advance = () => {
                        reflectRunning = false;
                        runNextReflectTrigger();
                    };

                    // Execute the reflected scroll's effect on this client.
                    // Interactive scrolls (requiresSelection) should only run on the Reflect caster's
                    // own client (playerIndex === myPlayerIndex). On other clients, skip execute() —
                    // the caster's client handles the UI selection and syncs state via syncPlayerState.
                    let wasInteractive = false;
                    if (spellSystem.scrollEffects && scrollName) {
                        const definition = spellSystem.patterns?.[scrollName];
                        if (definition) {
                            const isCaster = (playerIndex === myPlayerIndex);
                            console.log(`🪞 Running reflected scroll effect locally: ${scrollName} for player ${playerIndex} (isCaster=${isCaster})`);
                            const result = spellSystem.scrollEffects.execute(scrollName, playerIndex, {
                                spell: definition,
                                scrollName: scrollName,
                                onComplete: advance,
                                // Flag so interactive scroll effects skip UI on non-caster clients
                                psychicRemoteClient: !isCaster
                            });
                            wasInteractive = !!(result?.requiresSelection);
                            if (wasInteractive && !isCaster) {
                                console.log(`🪞 Interactive scroll on non-caster client — advancing queue immediately`);
                                wasInteractive = false;
                            }
                        }
                    }

                    // Update activated elements (Reflect only counts as water, not the reflected scroll's elements)
                    spellSystem.ensurePlayerScrollsStructure(playerIndex);
                    const activated = spellSystem.playerScrolls[playerIndex].activated;
                    activated.add('water');
                    console.log(`🪞 Reflect activated water for player ${playerIndex}:`, Array.from(activated));
                    updatePlayerElementSymbols(playerIndex);

                    if (playerIndex === myPlayerIndex) {
                        Object.keys(stoneCounts).forEach(updateStoneCount);
                    }

                    const playerName = getPlayerColorName(playerIndex);
                    const displayName = scrollName ? (scrollName.replace(/_/g, ' ').toLowerCase()) : 'scroll';
                    updateStatus(`🪞 ${playerName}'s Reflect triggered: activated ${displayName} (counts as water only).`);

                    if (activated.size === 5 && playerIndex === myPlayerIndex) {
                        spellSystem.showLevelComplete(playerIndex);
                        if (typeof handleGameOver === 'function') {
                            handleGameOver(playerIndex);
                        }
                    }

                    // For non-interactive scrolls, advance the queue immediately
                    if (!wasInteractive) advance();
                };

                gameChannel.on('broadcast', { event: 'reflect-triggered' }, ({ payload }) => {
                    console.log('📄 Received reflect-triggered:', payload);
                    const { playerIndex, scrollName } = payload;
                    if (typeof spellSystem === 'undefined') return;

                    // Enqueue and start processing if not already running
                    reflectQueue.push({ playerIndex, scrollName });
                    runNextReflectTrigger();
                });
            }

            // Psychic triggered at start of turn: run the stolen scroll's effect and update activated elements.
            // Multiple psychic-triggered events for the same player are queued and processed one at a time
            // so that interactive scrolls (e.g. Heavy Stomp) fully resolve before the next one starts.
            {
                const psychicQueue = []; // pending { playerIndex, scrollName } entries
                let psychicRunning = false;

                const runNextPsychicTrigger = () => {
                    if (psychicRunning || psychicQueue.length === 0) return;
                    const { playerIndex, scrollName } = psychicQueue.shift();
                    psychicRunning = true;

                    const advance = () => {
                        psychicRunning = false;
                        runNextPsychicTrigger();
                    };

                    // Execute the stolen scroll's effect on this client.
                    // Interactive scrolls (requiresSelection) should only run on the Psychic caster's
                    // own client (playerIndex === myPlayerIndex). On other clients, skip execute() —
                    // the caster's client handles the UI selection and broadcasts state changes via syncPlayerState.
                    let wasInteractive = false;
                    if (spellSystem.scrollEffects && scrollName) {
                        const definition = spellSystem.patterns?.[scrollName];
                        if (definition) {
                            const isCaster = (playerIndex === myPlayerIndex);
                            console.log(`🔮 Running psychic scroll effect locally: ${scrollName} for player ${playerIndex} (isCaster=${isCaster})`);
                            const result = spellSystem.scrollEffects.execute(scrollName, playerIndex, {
                                spell: definition,
                                scrollName: scrollName,
                                // onComplete advances the queue when interactive effects finish
                                onComplete: advance,
                                // Flag so interactive scroll effects can skip UI on non-caster clients
                                psychicRemoteClient: !isCaster
                            });
                            wasInteractive = !!(result?.requiresSelection);
                            // If the scroll is interactive but we're not the caster, the execute()
                            // should have returned early (due to psychicRemoteClient flag) without
                            // opening any UI. Treat as non-interactive so the queue advances immediately.
                            if (wasInteractive && !isCaster) {
                                console.log(`🔮 Interactive scroll on non-caster client — advancing queue immediately (state synced via syncPlayerState)`);
                                wasInteractive = false;
                            }
                        }
                    }

                    // Update activated elements (Psychic only counts as void, not the stolen scroll's elements)
                    spellSystem.ensurePlayerScrollsStructure(playerIndex);
                    const activated = spellSystem.playerScrolls[playerIndex].activated;
                    activated.add('void');
                    console.log(`🔮 Psychic activated void for player ${playerIndex}:`, Array.from(activated));
                    updatePlayerElementSymbols(playerIndex);

                    if (playerIndex === myPlayerIndex) {
                        Object.keys(stoneCounts).forEach(updateStoneCount);
                    }

                    const playerName = getPlayerColorName(playerIndex);
                    const displayName = scrollName ? (scrollName.replace(/_/g, ' ').toLowerCase()) : 'scroll';
                    updateStatus(`🔮 ${playerName}'s Psychic triggered: activated ${displayName} (counts as void only).`);

                    if (activated.size === 5 && playerIndex === myPlayerIndex) {
                        spellSystem.showLevelComplete(playerIndex);
                        if (typeof handleGameOver === 'function') {
                            handleGameOver(playerIndex);
                        }
                    }

                    // For non-interactive scrolls, advance the queue immediately
                    if (!wasInteractive) advance();
                };

                gameChannel.on('broadcast', { event: 'psychic-triggered' }, ({ payload }) => {
                    console.log('📄 Received psychic-triggered:', payload);
                    const { playerIndex, scrollName } = payload;
                    if (typeof spellSystem === 'undefined') return;

                    // Enqueue and start processing if not already running
                    psychicQueue.push({ playerIndex, scrollName });
                    runNextPsychicTrigger();
                });
            }

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

                // Update resources only when provided (null means sender is not the
                // active player and should not overwrite our own pool values)
                if (resources != null) {
                    if (!playerPools[playerIndex]) {
                        playerPools[playerIndex] = { earth: 0, water: 0, fire: 0, wind: 0, void: 0 };
                    }
                    Object.assign(playerPools[playerIndex], resources);
                }
                updateOpponentPanel(); // Update opponent panel when player state changes
            });

            // Listen for scroll collection events (with deduplication)
            gameChannel.on('broadcast', { event: 'scroll-collected' }, ({ payload }) => {
                console.log('📄 Received scroll collection:', payload);
                const { playerIndex, scrollName, shrineType, _seq, _timestamp } = payload;

                // DEDUPLICATION: Check if we've already processed this event
                const eventId = `scroll-collected-${playerIndex}-${scrollName}-${_timestamp || Date.now()}`;
                if (receivedSequences.has(eventId)) {
                    console.warn('⚠️  Duplicate scroll-collected event ignored:', eventId);
                    return;
                }
                receivedSequences.add(eventId);

                // Check if scroll is already in player's hand (idempotency check)
                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                if (spellSystem.playerScrolls[playerIndex].hand.has(scrollName)) {
                    console.warn('⚠️  Scroll already in hand, skipping:', scrollName);
                    return;
                }

                // Remove from the deck (scroll was drawn by the other player)
                const deckIndex = spellSystem.scrollDecks[shrineType]?.indexOf(scrollName);
                if (deckIndex > -1) {
                    spellSystem.scrollDecks[shrineType].splice(deckIndex, 1);
                } else {
                    console.warn(`⚠️  Scroll ${scrollName} not found in ${shrineType} deck (might have been removed already)`);
                }

                // Add to that player's hand
                spellSystem.playerScrolls[playerIndex].hand.add(scrollName);
                spellSystem.validateScrollState();
                spellSystem.updateScrollCount();

                const playerName = getPlayerColorName(playerIndex);
                updateStatus(`${playerName} collected a ${shrineType} scroll!`);
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
                updateStatus(`${playerName} used Scholar's Insight to search the ${element} deck!`);
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

            // Listen for Quick Reflexes deck search — remote player found a level 1 scroll
            gameChannel.on('broadcast', { event: 'quick-reflexes-search' }, ({ payload }) => {
                console.log('📄 Received Quick Reflexes search:', payload);
                const { playerIndex, element, scrollName, stonesDrawn, buffActive } = payload;

                // Remove chosen scroll from that element's deck and shuffle
                const deck = spellSystem.scrollDecks?.[element];
                if (deck) {
                    const idx = deck.indexOf(scrollName);
                    if (idx > -1) deck.splice(idx, 1);
                    if (spellSystem.shuffleDeck) spellSystem.shuffleDeck(deck);
                }

                // Add scroll to that player's hand
                spellSystem.ensurePlayerScrollsStructure(playerIndex);
                spellSystem.playerScrolls[playerIndex].hand.add(scrollName);
                spellSystem.validateScrollState();
                spellSystem.updateScrollCount();

                // Update source pool (stones were drawn from it)
                if (typeof stonePools !== 'undefined' && stonePools[element] !== undefined) {
                    stonePools[element] = Math.max(0, stonePools[element] - (stonesDrawn || 0));
                }

                // Update remote player's stone pool display
                if (playerIndex !== myPlayerIndex) {
                    if (!playerPools[playerIndex]) playerPools[playerIndex] = { earth: 0, water: 0, fire: 0, wind: 0, void: 0 };
                    playerPools[playerIndex][element] = Math.min(5, (playerPools[playerIndex][element] || 0) + (stonesDrawn || 0));
                }

                // Apply the quickReflexes buff on this client so that getSpellCost()
                // correctly prices level-1 scrolls at 0 AP during affordability checks
                // in the response window (canAnyPlayerRespond / canPlayerRespond).
                if (buffActive && spellSystem.scrollEffects) {
                    spellSystem.scrollEffects.activeBuffs.quickReflexes = {
                        playerIndex: playerIndex
                    };
                    console.log(`⚡ Applied quickReflexes buff for player ${playerIndex} on remote client`);
                }

                const playerName = getPlayerColorName(playerIndex);
                const scrollDef = spellSystem.patterns?.[scrollName];
                const displayName = scrollDef?.name || scrollName;
                updateStatus(`⚡ ${playerName} used Quick Reflexes: found "${displayName}", drew ${stonesDrawn || 0} ${element} stone${stonesDrawn === 1 ? '' : 's'}.`);

                if (typeof updateSourcePoolDisplay === 'function') updateSourcePoolDisplay();
                if (typeof updateScrollDeckUI === 'function') updateScrollDeckUI();
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
                const { element, scrollName, replacedScroll, _timestamp } = payload;

                // DEDUPLICATION: Check if we've already processed this event
                const eventId = `common-area-${element}-${scrollName}-${_timestamp || Date.now()}`;
                if (receivedSequences.has(eventId)) {
                    console.warn('⚠️  Duplicate common-area-update event ignored:', eventId);
                    return;
                }
                receivedSequences.add(eventId);

                // IDEMPOTENCY: Check if common area already has this scroll
                if (spellSystem.commonArea[element] === scrollName) {
                    console.warn('⚠️  Common area already has this scroll, skipping update');
                    return;
                }

                // If there was a scroll being replaced, put it back in the deck
                if (replacedScroll) {
                    // Check if it's not already in the deck (avoid duplicates)
                    if (!spellSystem.scrollDecks[element]?.includes(replacedScroll)) {
                        spellSystem.scrollDecks[element].push(replacedScroll);
                        console.log(`📜 Common area: ${replacedScroll} returned to deck`);
                    } else {
                        console.warn(`⚠️  ${replacedScroll} already in deck, not adding again`);
                    }
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
                const { scrollName, casterIndex, commonArea: commonAreaSnapshot } = payload;

                // Only show response window if I'm NOT the caster
                if (myPlayerIndex !== casterIndex && spellSystem.responseWindow) {
                    // Apply the common area snapshot from the caster's client before
                    // checking canPlayerRespond — prevents a race condition where a
                    // preceding common-area-update (e.g. Psychic moving there) hasn't
                    // arrived yet, causing the response check to miss available scrolls.
                    if (commonAreaSnapshot) {
                        const elements = ['earth', 'water', 'fire', 'wind', 'void', 'catacomb'];
                        elements.forEach(el => {
                            const incomingScroll = commonAreaSnapshot[el] ?? null;
                            if (spellSystem.commonArea[el] !== incomingScroll) {
                                console.log(`📜 Applying common area snapshot: ${el} = ${incomingScroll}`);
                                spellSystem.commonArea[el] = incomingScroll;
                            }
                        });
                    }

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

            // Cascade forfeit: active player timed out with an unresolved scroll cascade
            gameChannel.on('broadcast', { event: 'cascade-forfeit' }, ({ payload }) => {
                console.log('📄 Received cascade-forfeit:', payload);
                const { playerIndex } = payload;
                const playerName = getPlayerColorName(playerIndex);
                updateStatus(`⏰ ${playerName} ran out of time with an unresolved scroll cascade — they forfeit!`);
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

                                // Track activated element for win condition (response scrolls count too!)
                                spellSystem.ensurePlayerScrollsStructure(result.casterIndex);
                                const activatedEls = (scrollDef?.element === 'catacomb' && scrollDef?.patterns?.[0])
                                    ? [...new Set(scrollDef.patterns[0].map(pos => pos.type))]
                                    : scrollDef?.element ? [scrollDef.element] : [];
                                activatedEls.forEach(el => {
                                    spellSystem.playerScrolls[result.casterIndex].activated.add(el);
                                });
                                if (typeof updatePlayerElementSymbols === 'function') {
                                    updatePlayerElementSymbols(result.casterIndex);
                                }

                                // Broadcast activation so the caster's client (and any others)
                                // updates this player's shrine win-condition symbols
                                if (activatedEls.length > 0 && typeof broadcastGameAction === 'function') {
                                    broadcastGameAction('scroll-effect', {
                                        playerIndex: result.casterIndex,
                                        scrollName: result.scrollName,
                                        effectName: scrollDef?.name || result.scrollName,
                                        element: scrollDef?.element,
                                        activatedElements: activatedEls
                                    });
                                }
                            } else {
                                console.log(`ℹ️ Skipping response effect for ${result.scrollName} (responder is player ${result.casterIndex}, I am ${myPlayerIndex})`);
                            }
                        } else if (result.result === 'countered-original') {
                            // Counter scroll (like Psychic or Iron Stance) resolved on the non-caster client.
                            //
                            // DO NOT re-execute the counter scroll's effect here.
                            // The flow is:
                            //   1. Caster's client runs resolveResponseStack() → fires scroll-resolved event
                            //   2. multiplayer-state.js listener executes the counter effect (e.g. Psychic)
                            //      and broadcasts psychic-buff-applied / scroll-effect
                            //   3. Non-caster clients receive those broadcasts and apply state (psychicPending, etc.)
                            //
                            // Re-executing here caused a double psychicPending entry for the counter-caster,
                            // which made the stolen scroll fire TWICE on the counter-caster's next turn —
                            // appearing as if the original caster's scroll ability was still activating.
                            console.log(`ℹ️ Processing remote counter scroll: ${result.scrollName}, counter-caster: ${result.casterIndex}`);

                            // If this is MY counter scroll, remove it from my active scrolls.
                            // Psychic goes to common area (arrives via common-area-update broadcast from caster).
                            // Iron Stance stays in active (nothing to remove).
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

                    // Safety: clear any stuck tile-swap selectionMode on this client —
                    // the authoritative swap just arrived via broadcast, so no local selection needed.
                    if (spellSystem?.scrollEffects?.selectionMode?.type === 'tile-swap') {
                        spellSystem.scrollEffects.selectionMode.cleanup?.();
                        spellSystem.scrollEffects.selectionMode = null;
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

            // Note: scroll-effect handling (activated tracking, symbols, win check, status) is
            // handled by the earlier scroll-effect listener above. No duplicate handler here.

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

            // Listen for scroll-used: handles scroll disposition on remote clients
            // Only handles forceToCommonArea=true (e.g. Arson forcing itself into the common area).
            // fromCommonArea=true events are intentionally ignored — common area scrolls are permanent
            // shared resources and stay after being cast; they're only replaced by a new scroll of the
            // same element type being discarded to the common area.
            gameChannel.on('broadcast', { event: 'scroll-used' }, ({ payload }) => {
                const { playerIndex, scrollName, fromCommonArea, forceToCommonArea } = payload;
                if (playerIndex === myPlayerIndex) return; // Caster already handled it locally

                spellSystem.ensurePlayerScrollsStructure(playerIndex);

                if (fromCommonArea) {
                    // Common area scrolls persist after casting — nothing to clear
                    return;
                }

                if (!forceToCommonArea) return; // Nothing to do for normal active-area disposition

                // forceToCommonArea=true: scroll pushed itself to common area (e.g. Arson)
                const playerScrolls = spellSystem.playerScrolls[playerIndex];
                if (playerScrolls && playerScrolls.active.has(scrollName)) {
                    playerScrolls.active.delete(scrollName);
                    console.log(`📜 Remote scroll-used: moved ${scrollName} from player ${playerIndex}'s active to common area`);
                }
                spellSystem.discardToCommonArea(scrollName);
                spellSystem.updateScrollCount();
                if (typeof updateCommonAreaUI === 'function') updateCommonAreaUI();
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

                    // If it's now our turn, reset AP — the normal turn-change broadcast
                    // that does this was missed due to the reconnect
                    if (playerIndex === myPlayerIndex) {
                        console.warn('⚠️ DESYNC: Resetting AP for recovered turn');
                        currentAP = maxAP;
                        if (typeof refreshVoidAP === 'function') refreshVoidAP();
                        if (typeof updateAPDisplay === 'function') updateAPDisplay();
                    }
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

                // Build a set of scrolls already in local play (hand or active).
                // If the host's broadcast still shows a scroll in the common area but we have
                // it in a player's hand/active, the host state is stale — do NOT restore it.
                const inLocalPlay = new Set();
                for (const p of spellSystem.playerScrolls) {
                    if (!p) continue;
                    p.hand.forEach(s => inLocalPlay.add(s));
                    p.active.forEach(s => inLocalPlay.add(s));
                }

                // Compare and auto-correct any differences
                let corrected = false;
                Object.keys(commonArea).forEach(element => {
                    const hostScroll = commonArea[element];
                    const localScroll = spellSystem.commonArea[element];

                    if (hostScroll !== localScroll) {
                        // Don't restore a scroll that's already been drawn into play locally
                        if (hostScroll && inLocalPlay.has(hostScroll)) {
                            console.log(`[common-area-sync] Skipping restore of ${hostScroll} in ${element} — already in local play`);
                            return;
                        }
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

                // Apply the Reflect buff to the spell system (push to array)
                if (typeof spellSystem !== 'undefined' && spellSystem.scrollEffects) {
                    if (!Array.isArray(spellSystem.scrollEffects.activeBuffs.reflectPending)) {
                        spellSystem.scrollEffects.activeBuffs.reflectPending = [];
                    }
                    spellSystem.scrollEffects.activeBuffs.reflectPending.push({
                        playerIndex: playerIndex,
                        scrollName: scrollName,
                        definition: scrollDefinition
                    });
                    console.log(`🛡️ Reflect buff applied to player ${playerIndex}: will reflect "${scrollName}" on their next turn`);
                }
            });

            // Listen for Psychic buff applied (passive buff for next turn)
            gameChannel.on('broadcast', { event: 'psychic-buff-applied' }, ({ payload }) => {
                console.log('📄 Received psychic-buff-applied:', payload);
                const { playerIndex, scrollName, scrollDefinition } = payload;

                // Apply the Psychic buff to the spell system (push to array)
                if (typeof spellSystem !== 'undefined' && spellSystem.scrollEffects) {
                    if (!Array.isArray(spellSystem.scrollEffects.activeBuffs.psychicPending)) {
                        spellSystem.scrollEffects.activeBuffs.psychicPending = [];
                    }
                    spellSystem.scrollEffects.activeBuffs.psychicPending.push({
                        playerIndex: playerIndex,
                        scrollName: scrollName,
                        definition: scrollDefinition
                    });
                    console.log(`🔮 Psychic buff applied to player ${playerIndex}: will activate "${scrollName}" at start of their next turn`);
                }
            });

            // Listen for scroll state sync from host (authoritative source)
            gameChannel.on('broadcast', { event: 'scroll-state-sync' }, ({ payload }) => {
                if (typeof spellSystem !== 'undefined' && spellSystem.applyScrollStateSnapshot) {
                    const corrected = spellSystem.applyScrollStateSnapshot(payload.snapshot);
                    // Only log if corrections were made
                    if (corrected) {
                        console.log('📊 Scroll state synchronized with host (corrections applied)');
                    }
                }
            });

            // Listen for scroll state sync requests (from clients who detected issues)
            gameChannel.on('broadcast', { event: 'scroll-state-sync-request' }, ({ payload }) => {
                // Only host responds to sync requests
                if (myPlayerIndex === 0 && typeof spellSystem !== 'undefined') {
                    console.log(`⚠️  Sync request from player ${payload.playerIndex} - sending authoritative state`);
                    const snapshot = spellSystem.getScrollStateSnapshot();
                    broadcastGameAction('scroll-state-sync', { snapshot });
                }
            });

            // Aggressive scroll state validation and sync (every 3 seconds)
            setInterval(() => {
                if (!isMultiplayer || !spellSystem) return;

                // Validate current state (only logs if errors found)
                const hasErrors = spellSystem.validateScrollState();

                // If I'm the host (player 0), broadcast authoritative state
                if (myPlayerIndex === 0) {
                    const snapshot = spellSystem.getScrollStateSnapshot();
                    broadcastGameAction('scroll-state-sync', { snapshot });
                }

                // If errors found and I'm not the host, immediately request sync
                if (hasErrors && myPlayerIndex !== 0) {
                    console.warn('⚠️  Errors detected - immediately requesting sync from host');
                    broadcastGameAction('scroll-state-sync-request', { playerIndex: myPlayerIndex });
                }
            }, 3000); // Every 3 seconds (more aggressive)

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

            // ── Emoji reactions ──────────────────────────────────────────
            // Received when another player fires an emoji.
            // Show it floating above their pawn on every client except the sender
            // (sender already called showEmojiOverPawn locally before broadcasting).
            gameChannel.on('broadcast', { event: 'emoji' }, ({ payload }) => {
                const { playerIndex, display, isText } = payload;
                if (typeof window.emojiSystem !== 'undefined') {
                    window.emojiSystem.showEmojiOverPawn(playerIndex, display, !!isText);
                }
            });

            // Subscribe to the channel
            gameChannel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Connected to game broadcast channel');
                }
            });
        }

        // ----------------------------------------------------------------
        // Multiplayer hooks called by game-core.js
        // ----------------------------------------------------------------

        // Called by game-core.js executeMovement() after a successful move.
        // game-ui.js drag/tap handlers broadcast directly, but game-core.js uses
        // this function as a named hook so it is safe to define it once here.
        function broadcastPlayerMovement(playerIndex, x, y, apSpent) {
            broadcastGameAction('player-move', { playerIndex, x, y, apSpent });
        }

        // Called by game-core.js executeMovement() after landing on a hex.
        // Mirrors the tile-reveal logic in game-ui.js drag/tap handlers so that
        // the game-core.js movement path also reveals hidden tiles correctly.
        function handlePlayerLanding(x, y) {
            if (typeof getAllHexagonPositions !== 'function' || typeof placedTiles === 'undefined') return;
            const allHexes = getAllHexagonPositions();
            let nearestHex = null;
            let nearestDist = Infinity;
            allHexes.forEach(hexPos => {
                const d = Math.sqrt(Math.pow(hexPos.x - x, 2) + Math.pow(hexPos.y - y, 2));
                if (d < nearestDist) { nearestDist = d; nearestHex = hexPos; }
            });
            if (nearestHex && nearestDist < 5 && nearestHex.tiles) {
                nearestHex.tiles
                    .filter(t => t.flipped && !t.isPlayerTile)
                    .forEach(t => {
                        if (typeof revealTile === 'function') revealTile(t.id);
                    });
            }
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

            // Add sequence number for scroll-related events to detect out-of-order delivery
            const isScrollEvent = event.includes('scroll') || event.includes('shrine') || event.includes('common-area');
            if (isScrollEvent) {
                scrollEventSequence++;
                payload._seq = scrollEventSequence;
                payload._timestamp = Date.now();
            }

            gameChannel.send({
                type: 'broadcast',
                event: event,
                payload: payload
            });
        }

        // Start multiplayer game
        function startMultiplayerGame(allPlayers, sharedDeckSeed = null) {
            // Reset all per-game resources so leftover state from a previous session doesn't carry over
            if (typeof window.resetGameResources === 'function') {
                window.resetGameResources();
            }

            // Reset XP dedup flag so the next game can award XP fresh
            _gameOverXpAwarded = false;

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
                updateStatus(`You are Player ${myPlayer.player_index + 1} (${playerColor}). Drag your player tile to the board to start!`);
            } else {
                updateStatus(`You are Player ${myPlayer.player_index + 1} (${playerColor}). Waiting for other players to place their tiles...`);
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

        // Expose startGame globally so tutorial-mode.js can call it without auth
        window.startGame = startGame;

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
                        <image href="${STONE_TYPES[type].img}" x="8" y="8" width="24" height="24" style="mix-blend-mode:screen"/>
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

        // ── Auth init ──────────────────────────────────────────────────
        // Wire Enter key on auth fields to trigger login
        ['auth-username', 'auth-password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') authLogin(); });
        });

        // Restore an existing Supabase Auth session (auto-login on page reload)
        checkAuthSession();
