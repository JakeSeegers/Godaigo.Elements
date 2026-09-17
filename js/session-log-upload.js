// ============================================================
// session-log-upload.js — uploads this session's ActionLog to Supabase
// at the end of a game, but only when the player has opted in via the
// "Help Improve Godaigo?" consent prompt (js/lobby.js's
// promptLogConsentIfNeeded()) or the Settings → Privacy toggle
// (js/gamification-ui.js's _gami_toggleLogConsent()) — both read/write
// the same localStorage key, godaigo_log_consent ('granted'/'declined').
//
// Reuses the exact payload shape js/action-log.js's own download() button
// already builds ({meta, entries}) — this is a second destination for the
// same data, not a new log format.
//
// In multiplayer, only the HOST's consent flag gates the upload (one
// shared log per game, not per player) — callers pass isHostCall so only
// one client ever writes. Tutorial mode never calls this (it never
// reaches these hooks), consistent with tutorial never touching Supabase.
//
// LOAD ORDER: right after action-log.js (needs window.ActionLog) and
// after multiplayer-state.js (needs the shared `supabase` client global).
// ============================================================

(function () {
    'use strict';

    let _uploaded = false; // once-per-game guard, mirrors lobby.js's _gameOverXpAwarded idiom

    async function uploadSessionLogIfConsented(opts = {}) {
        if (_uploaded) return;
        if (window.isTutorialMode) return; // tutorial sessions are never real gameplay data

        try {
            if (localStorage.getItem('godaigo_log_consent') !== 'granted') return;
        } catch (e) { return; }

        // Multiplayer: only the host's client performs the write.
        if (opts.isMultiplayer && !opts.isHostCall) return;

        _uploaded = true;
        try {
            if (typeof supabase === 'undefined') return;
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id || null;
            if (!userId) return; // no authenticated user — shouldn't happen post-login

            const entries = (window.ActionLog && typeof window.ActionLog.entries === 'function')
                ? window.ActionLog.entries() : [];

            const meta = {
                exportedAt: new Date().toISOString(),
                isMultiplayer: !!opts.isMultiplayer,
                currentGameId: (typeof currentGameId !== 'undefined') ? currentGameId : null,
                players: (typeof allPlayersData !== 'undefined' && Array.isArray(allPlayersData))
                    ? allPlayersData.map(p => ({
                        index: p.player_index,
                        username: p.username,
                        isBot: !!(window.isBotUsername && window.isBotUsername(p.username)),
                      }))
                    : null,
                entryCount: entries.length,
            };

            const { error } = await supabase.from('game_session_logs').insert({
                user_id: userId,
                game_id: (opts.isMultiplayer && typeof currentGameId !== 'undefined') ? currentGameId : null,
                is_multiplayer: !!opts.isMultiplayer,
                player_count: (typeof totalPlayers !== 'undefined') ? totalPlayers : (meta.players?.length || null),
                log: { meta, entries },
            });
            if (error) console.warn('[session-log-upload] failed:', error.message);
        } catch (e) {
            console.warn('[session-log-upload] failed:', e);
        }
    }

    function resetSessionLogUploadGuard() {
        _uploaded = false;
    }

    window.uploadSessionLogIfConsented = uploadSessionLogIfConsented;
    window.resetSessionLogUploadGuard = resetSessionLogUploadGuard;
})();
