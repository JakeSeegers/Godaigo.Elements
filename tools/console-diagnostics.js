// ============================================================
// GODAIGO CONSOLE DIAGNOSTICS — paste-robust build
// ============================================================
// NOT loaded by index.html — paste-into-devtools-console tool for a real
// multiplayer playtest. The actual code below is deliberately ONE LINE
// with no embedded line breaks (everything after this comment block) —
// some copy/paste paths (clipboard hops through a chat UI, some remote/
// virtual-desktop input methods) submit a multi-line paste into the
// console as separate statements instead of one block, which breaks any
// script that spans multiple lines. A single line can't be split that
// way. If your devtools console shows a one-time "Warning: Don't paste
// code..." message instead of accepting the paste, type `allow pasting`
// and press Enter first, THEN paste again — that's Chrome's built-in
// self-XSS guard, unrelated to this file.
//
// HOW TO USE
//   1. Both human players: join the same room, start the game.
//   2. Open devtools (F12) -> Console in each browser.
//   3. Select ALL of this file's content (including this comment block)
//      and paste into the console, press Enter.
//   4. Confirm it loaded: type `typeof godaigoTest` and press Enter — it
//      must print "object", not "undefined". If it prints "undefined",
//      the paste didn't take; try re-copying and pasting again (see the
//      "allow pasting" note above).
//   5. godaigoTest.diag() in BOTH consoles — compare the printed
//      "Comparison fingerprint" numbers (turn state, scroll-state hash,
//      tile-board hash, players hash). Matching numbers = both clients
//      agree on game state. A mismatch = a real desync, and diag() also
//      runs the game's own existing window.dumpGameDebug() right after
//      for digging in.
//   6. godaigoTest.trafficAudit(30) on either client right when you
//      expect background chatter (e.g. right after a bot's heartbeat) —
//      watches network requests for 30s, prints a table by endpoint. The
//      direct test for the players-subscription fan-out bug that was
//      fixed: /players should show a small, steady count, not a
//      double-digit burst landing in the same second.
//   7. godaigoTest.simulateChannelDrop() pokes the connection badge
//      (bottom-left) to confirm it visibly reacts — purely local to that
//      one browser tab, cannot affect the other player or real game
//      state. godaigoTest.requestResync() triggers the game's own
//      existing, already-safe on-demand scroll-state resync early.
//
// Doesn't persist across a page reload — re-paste after refreshing.
// ============================================================
(function () { function rollingHash(str) { let h = 0; const s = String(str); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; } window.godaigoTest = { diag() { console.log('%c🔎 Godaigo Diagnostic — ' + new Date().toLocaleTimeString(), 'font-weight:bold;font-size:13px;color:#e6c79c'); console.group('📶 Connection health (js/connection-monitor.js)'); if (window.ConnectionMonitor) { console.log(window.ConnectionMonitor.getStatus()); } else { console.warn('window.ConnectionMonitor not found — did connection-monitor.js load on this page?'); } console.groupEnd(); console.group('🔑 Comparison fingerprint — same numbers on both consoles = in sync'); try { console.log('Turn:', { activePlayerIndex: typeof activePlayerIndex !== 'undefined' ? activePlayerIndex : null, currentTurnNumber: typeof currentTurnNumber !== 'undefined' ? currentTurnNumber : null, turnStartedAtMs: typeof turnStartedAtMs !== 'undefined' ? turnStartedAtMs : null, hostTrackedRoomStatus: typeof hostTrackedRoomStatus !== 'undefined' ? hostTrackedRoomStatus : '(n/a)' }); if (typeof spellSystem !== 'undefined' && spellSystem && spellSystem.getScrollStateSnapshot) { console.log('Scroll-state hash:', rollingHash(JSON.stringify(spellSystem.getScrollStateSnapshot()))); } if (typeof placedTiles !== 'undefined' && Array.isArray(placedTiles)) { const tileFp = placedTiles.map(t => t.id + ':' + (t.flipped ? 'H' : t.shrineType)).sort().join(','); console.log('Tile-board hash:', rollingHash(tileFp), '(' + placedTiles.length + ' tiles)'); } if (typeof allPlayersData !== 'undefined' && Array.isArray(allPlayersData)) { const playersFp = allPlayersData.map(p => p.player_index + ':' + p.username + ':' + p.color).sort().join(','); console.log('Players hash:', rollingHash(playersFp)); } } catch (e) { console.error('fingerprint failed:', e); } console.groupEnd(); if (typeof isHost !== 'undefined' && isHost && window.BotDriver && typeof allPlayersData !== 'undefined') { console.group('🤖 Bot status (host-only — you drive their turns)'); allPlayersData.forEach(p => { if (window.isBotUsername && window.isBotUsername(p.username)) { console.log(p.username, '— player_index', p.player_index, '— BotDriver.isBot():', window.BotDriver.isBot(p.player_index)); } }); console.groupEnd(); } if (typeof window.dumpGameDebug === 'function') { window.dumpGameDebug(); } else { console.warn('window.dumpGameDebug not found'); } }, trafficAudit(seconds) { seconds = seconds || 30; const counts = {}; const origFetch = window.fetch; const base = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : ''; window.fetch = function () { const url = String(arguments[0]); const key = url.replace(/[?&].*$/, '').replace(base, ''); counts[key] = (counts[key] || 0) + 1; return origFetch.apply(this, arguments); }; console.log('🕸️ Traffic audit started — watching for ' + seconds + 's...'); setTimeout(function () { window.fetch = origFetch; console.group('%c🕸️ Traffic audit results (' + seconds + 's)', 'font-weight:bold;color:#e6c79c'); console.table(counts); const total = Object.keys(counts).reduce((sum, k) => sum + counts[k], 0); console.log('Total requests:', total, '(' + (total / seconds).toFixed(1) + '/s average)'); console.groupEnd(); }, seconds * 1000); }, requestResync() { if (typeof broadcastGameAction !== 'function' || typeof myPlayerIndex === 'undefined') { console.warn('Not in an active multiplayer game.'); return; } broadcastGameAction('scroll-state-sync-request', { playerIndex: myPlayerIndex }); console.log('→ sent scroll-state-sync-request. Host should broadcast back an authoritative snapshot.'); }, simulateChannelDrop() { if (!window.ConnectionMonitor) { console.warn('ConnectionMonitor not loaded.'); return; } window.ConnectionMonitor.reportChannelStatus('game', 'CHANNEL_ERROR'); setTimeout(() => window.ConnectionMonitor.reportChannelStatus('game', 'CHANNEL_ERROR'), 50); console.log('→ reported two fake CHANNEL_ERRORs. Watch the bottom-left badge — should turn orange shortly. ' + 'This does NOT trigger lobby.js\'s real reconnect logic (that only runs from an actual ' + 'gameChannel.subscribe() callback) — it only proves the badge itself reacts. It self-heals on the ' + 'next successful ping (~12s) or the next real SUBSCRIBED event.'); } }; console.log('%c✅ godaigoTest loaded. Try: godaigoTest.diag() | godaigoTest.trafficAudit(30) | ' + 'godaigoTest.requestResync() | godaigoTest.simulateChannelDrop()', 'color:#69d83a;font-weight:bold'); })();
