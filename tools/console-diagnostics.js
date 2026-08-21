// ============================================================
// GODAIGO CONSOLE DIAGNOSTICS
// ============================================================
// NOT loaded by index.html — this is a paste-into-devtools-console tool,
// not shipped game code. Written for a real 2-human + N-bot multiplayer
// playtest to verify the connectivity/performance work (see
// planning/current.md's "CONNECTIVITY & PERFORMANCE" entries) actually
// holds up, without needing deep manual digging under time pressure.
//
// HOW TO USE
//   1. Open the game in each of the two human players' browsers, join the
//      SAME room, start the game.
//   2. Open devtools (F12) → Console in EACH browser.
//   3. Paste this entire file into both consoles, press Enter. You'll see
//      a confirmation line.
//   4. Run `godaigoTest.diag()` in both consoles at any point (e.g. right
//      after a bot's turn, or if something looks wrong) and compare the
//      "Comparison fingerprint" numbers between the two — matching numbers
//      mean both clients agree on game state; a mismatch is a real desync
//      worth digging into with the rest of that same diag() output (it
//      also runs the game's own built-in window.dumpGameDebug()).
//   5. Run `godaigoTest.trafficAudit(30)` on either client right when you
//      expect background chatter (e.g. right after adding a bot, or a
//      minute into an active turn) to see actual request VOLUME grouped by
//      endpoint for the next 30s. This is the direct test for the
//      players-subscription fan-out bug that was fixed: a healthy session
//      should show a small, steady trickle of /players requests, not a
//      burst of 10+ near-identical calls landing in the same second.
//   6. godaigoTest.requestResync() / godaigoTest.simulateChannelDrop() are
//      small opt-in pokes — see their own comments below. Nothing here
//      mutates real game state except requestResync(), which uses an
//      already-existing, safe, built-in resync mechanism (the same one
//      that already runs periodically on its own).
//
// Safe to paste multiple times (just redefines the same object). Doesn't
// persist across page reloads — re-paste after refreshing.
// ============================================================

(function () {
    function rollingHash(str) {
        let h = 0;
        const s = String(str);
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return h;
    }

    window.godaigoTest = {
        // ---- Main diagnostic: connection health + a quick-compare
        // fingerprint + the game's own full state dump, all in one call.
        diag() {
            console.log('%c🔎 Godaigo Diagnostic — ' + new Date().toLocaleTimeString(),
                'font-weight:bold;font-size:13px;color:#e6c79c');

            console.group('📶 Connection health (js/connection-monitor.js)');
            if (window.ConnectionMonitor) {
                console.log(window.ConnectionMonitor.getStatus());
            } else {
                console.warn('window.ConnectionMonitor not found — did connection-monitor.js load on this page?');
            }
            console.groupEnd();

            console.group('🔑 Comparison fingerprint — same numbers on both consoles = in sync');
            try {
                console.log('Turn:', {
                    activePlayerIndex: typeof activePlayerIndex !== 'undefined' ? activePlayerIndex : null,
                    currentTurnNumber: typeof currentTurnNumber !== 'undefined' ? currentTurnNumber : null,
                    turnStartedAtMs:   typeof turnStartedAtMs   !== 'undefined' ? turnStartedAtMs   : null,
                    hostTrackedRoomStatus: typeof hostTrackedRoomStatus !== 'undefined' ? hostTrackedRoomStatus : '(n/a)'
                });
                if (typeof spellSystem !== 'undefined' && spellSystem && spellSystem.getScrollStateSnapshot) {
                    console.log('Scroll-state hash:', rollingHash(JSON.stringify(spellSystem.getScrollStateSnapshot())));
                }
                if (typeof placedTiles !== 'undefined' && Array.isArray(placedTiles)) {
                    const tileFp = placedTiles.map(t => t.id + ':' + (t.flipped ? 'H' : t.shrineType)).sort().join(',');
                    console.log('Tile-board hash:', rollingHash(tileFp), '(' + placedTiles.length + ' tiles)');
                }
                if (typeof allPlayersData !== 'undefined' && Array.isArray(allPlayersData)) {
                    const playersFp = allPlayersData.map(p => p.player_index + ':' + p.username + ':' + p.color).sort().join(',');
                    console.log('Players hash:', rollingHash(playersFp));
                }
            } catch (e) { console.error('fingerprint failed:', e); }
            console.groupEnd();

            if (typeof isHost !== 'undefined' && isHost && window.BotDriver && typeof allPlayersData !== 'undefined') {
                console.group('🤖 Bot status (host-only — you drive their turns)');
                allPlayersData.forEach(p => {
                    if (window.isBotUsername && window.isBotUsername(p.username)) {
                        console.log(p.username, '— player_index', p.player_index, '— BotDriver.isBot():', window.BotDriver.isBot(p.player_index));
                    }
                });
                console.groupEnd();
            }

            if (typeof window.dumpGameDebug === 'function') {
                window.dumpGameDebug(); // the game's own existing full-state dump
            } else {
                console.warn('window.dumpGameDebug not found');
            }
        },

        // ---- Network traffic auditor: hooks fetch for N seconds, reports
        // request counts grouped by endpoint (query string stripped so
        // repeats of the same call collapse into one row). Restores the
        // real fetch automatically when the window closes. This is the
        // direct test for the postgres_changes fan-out bug: run it right
        // when a bot heartbeat is expected (every ~15s) and check the
        // /players row in the printed table — it should be a small number
        // per heartbeat window, not a double-digit burst.
        trafficAudit(seconds) {
            seconds = seconds || 30;
            const counts = {};
            const origFetch = window.fetch;
            const base = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : '';
            window.fetch = function () {
                const url = String(arguments[0]);
                const key = url.replace(/[?&].*$/, '').replace(base, '');
                counts[key] = (counts[key] || 0) + 1;
                return origFetch.apply(this, arguments);
            };
            console.log('🕸️ Traffic audit started — watching for ' + seconds + 's...');
            setTimeout(function () {
                window.fetch = origFetch;
                console.group('%c🕸️ Traffic audit results (' + seconds + 's)', 'font-weight:bold;color:#e6c79c');
                console.table(counts);
                const total = Object.keys(counts).reduce((sum, k) => sum + counts[k], 0);
                console.log('Total requests:', total, '(' + (total / seconds).toFixed(1) + '/s average)');
                console.groupEnd();
            }, seconds * 1000);
        },

        // ---- Force an immediate scroll-state resync request to the host.
        // Uses the game's own existing, already-safe mechanism (the same
        // one the periodic sync uses on its own) — just triggers it now
        // instead of waiting. Good for confirming the on-demand resync
        // path still works after the recent debounce/throttle changes.
        requestResync() {
            if (typeof broadcastGameAction !== 'function' || typeof myPlayerIndex === 'undefined') {
                console.warn('Not in an active multiplayer game.');
                return;
            }
            broadcastGameAction('scroll-state-sync-request', { playerIndex: myPlayerIndex });
            console.log('→ sent scroll-state-sync-request. Host should broadcast back an authoritative snapshot.');
        },

        // ---- Feed ConnectionMonitor a fake channel-error report to verify
        // the badge reacts correctly, without needing to actually break
        // your network. Purely local to THIS browser tab — does not touch
        // gameChannel, does not broadcast anything, cannot affect the other
        // player or the real game state. Sends it twice (with a short
        // delay) because the monitor debounces over 2 consistent samples
        // before changing the displayed state, so a single call alone
        // won't visibly move the badge.
        simulateChannelDrop() {
            if (!window.ConnectionMonitor) { console.warn('ConnectionMonitor not loaded.'); return; }
            window.ConnectionMonitor.reportChannelStatus('game', 'CHANNEL_ERROR');
            setTimeout(() => window.ConnectionMonitor.reportChannelStatus('game', 'CHANNEL_ERROR'), 50);
            console.log('→ reported two fake CHANNEL_ERRORs. Watch the bottom-left badge — should turn orange shortly. ' +
                'This does NOT trigger lobby.js\'s real reconnect logic (that only runs from an actual ' +
                'gameChannel.subscribe() callback) — it only proves the badge itself reacts. It self-heals on the ' +
                'next successful ping (~12s) or the next real SUBSCRIBED event.');
        }
    };

    console.log('%c✅ godaigoTest loaded. Try: godaigoTest.diag() | godaigoTest.trafficAudit(30) | ' +
        'godaigoTest.requestResync() | godaigoTest.simulateChannelDrop()', 'color:#69d83a;font-weight:bold');
})();
