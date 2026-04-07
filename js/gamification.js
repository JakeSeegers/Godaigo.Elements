// ============================================================
// GAMIFICATION SERVICE  (js/gamification.js)
// Adapted from Gamify/gamification_service.js for Godaigo.
//
// Uses the global `supabase` client (config.js).
// Exposes window.gami for lobby.js / game-core.js to call.
//
// XP rewards:
//   game_complete     : 20 + (numPlayers-1)×10  (loss)
//   game_win          : 75 + (numPlayers-1)×25  (win)
//
// Gold rewards (no leaderboard impact):
//   daily_login       : +20 gold (once per calendar day)
//   level_up          : +50 gold per level (handled in DB function)
// ============================================================

window.gami = (function () {

    // ── Internal state ────────────────────────────────────────
    let _userId  = null;
    let _profile = null;   // cached user_profiles row

    // ── Helpers ───────────────────────────────────────────────

    function _log(...args) {
        console.log('[gami]', ...args);
    }

    /** Fire-and-forget INSERT into user_activities */
    function _logActivity(activityType, xpAwarded, goldAwarded, description, metadata) {
        if (!_userId) return;
        supabase.from('user_activities').insert({
            user_id:       _userId,
            activity_type: activityType,
            xp_awarded:    xpAwarded    || 0,
            gold_awarded:  goldAwarded  || 0,
            description:   description  || activityType,
            metadata:      metadata     || {}
        }).then(({ error }) => {
            if (error) console.error('[gami] activity log error:', error);
        });
    }

    /** Update a subset of profile.stats in the DB (fire-and-forget) */
    function _patchStats(patch) {
        if (!_userId || !_profile) return;
        const stats = Object.assign({}, _profile.stats || {}, patch);
        _profile.stats = stats;
        supabase.from('user_profiles')
            .update({ stats, updated_at: new Date().toISOString() })
            .eq('user_id', _userId)
            .then(({ error }) => {
                if (error) console.error('[gami] stats patch error:', error);
            });
    }

    // ── Public API ────────────────────────────────────────────

    const api = {

        // Expose userId for UI (read-only intent)
        get userId() { return _userId; },
        get profile() { return _profile; },

        /**
         * init(userId, displayName)
         * Called from onAuthSuccess in lobby.js.
         * Gets or creates the user_profiles row.
         */
        async init(userId, displayName) {
            _userId = userId;

            let { data: profile, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error && error.code === 'PGRST116') {
                // Profile doesn't exist yet — create it
                const { data: newProfile, error: createErr } = await supabase
                    .from('user_profiles')
                    .insert({
                        user_id:      userId,
                        display_name: displayName || 'Player',
                        total_xp:     0,
                        current_level: 1,
                        gold:         0,
                        badges_earned: [],
                        inventory:    [],
                        stats: {
                            games_played:      0,
                            games_won:         0,
                            scrolls_cast:      0,
                            elements_activated: 0,
                            streak:            0,
                            last_active:       null
                        }
                    })
                    .select()
                    .single();

                if (createErr) {
                    console.error('[gami] profile create error:', createErr);
                    return;
                }
                profile = newProfile;
                _log('new profile created for', displayName);
            } else if (error) {
                console.error('[gami] profile fetch error:', error);
                return;
            }

            _profile = profile;
            _log('init complete — level', profile.current_level, 'xp', profile.total_xp);
        },

        /**
         * onDailyLogin()
         * Awards 20 gold once per calendar day.
         * Does NOT award XP (login is not a meaningful game action).
         */
        async onDailyLogin() {
            if (!_userId || !_profile) return;

            const today     = new Date().toDateString();
            const lastActive = _profile.stats?.last_active;
            if (lastActive === today) return; // Already collected today

            const { error } = await supabase.rpc('award_gold', {
                p_user_id:     _userId,
                p_gold_amount: 20,
                p_description: 'Daily login reward'
            });
            if (error) { console.error('[gami] daily login gold error:', error); return; }

            // Log a daily_login activity so the "Dedicated" badge can count it
            _logActivity('daily_login', 0, 20, 'Daily login');

            // Update streak and last_active in stats
            const yesterday = new Date(Date.now() - 86_400_000).toDateString();
            const streak    = (lastActive === yesterday)
                ? (_profile.stats?.streak || 0) + 1
                : 1;

            _patchStats({ last_active: today, streak });
            if (_profile) _profile.gold = (_profile.gold || 0) + 20;

            api.notify('Daily reward! +20', 20, 'gold');
            _log('daily login gold awarded');
        },

        /**
         * onScrollCast(scrollName, element)
         * Called via window.logScrollEvent (already fired from game-core.js).
         * Tracks count for badge purposes only — no XP.
         */
        onScrollCast(scrollName, element) {
            if (!_userId) return;
            // Fire-and-forget
            _logActivity('scroll_cast', 0, 0, `Cast ${scrollName || element || 'scroll'}`);
            _patchStats({ scrolls_cast: (_profile?.stats?.scrolls_cast || 0) + 1 });
        },

        /**
         * onElementActivated(element, allActivated)
         * Tracks activations for badge purposes only — no XP.
         */
        onElementActivated(element, allActivated) {
            if (!_userId) return;
            _logActivity('element_activated', 0, 0, `Activated ${element}`, { element });
            _patchStats({ elements_activated: (_profile?.stats?.elements_activated || 0) + 1 });
        },

        /**
         * onGameComplete(isWinner, numPlayers)
         * XP scales with player count:
         *   Loss: 20 + (n-1)*10   →  2p=30, 3p=40, 4p=50, 5p=60
         *   Win:  75 + (n-1)*25   →  2p=100, 3p=125, 4p=150, 5p=175
         */
        async onGameComplete(isWinner, numPlayers) {
            if (!_userId) return;
            const n   = Math.max(2, numPlayers || 2);
            const xp  = isWinner
                ? 75  + (n - 1) * 25
                : 20  + (n - 1) * 10;

            try {
                // Award XP
                const { error: xpErr } = await supabase.rpc('update_user_xp', {
                    p_user_id:     _userId,
                    p_xp_points:   xp,
                    p_description: isWinner
                        ? `Game win (${n} players)`
                        : `Game complete — ${n} players`
                });
                if (xpErr) { console.error('[gami] game complete xp error:', xpErr); return; }

                // Log game_complete (badge: First Steps, Veteran)
                _logActivity('game_complete', xp, 0,
                    `Completed game with ${n} players`, { num_players: n, won: isWinner });

                // Log game_win (badge: First Victory, Champion, Master)
                if (isWinner) {
                    _logActivity('game_win', 0, 0,
                        `Won game with ${n} players`, { num_players: n });
                }

                // Update stats
                const stats = Object.assign({}, _profile?.stats || {});
                stats.games_played = (stats.games_played || 0) + 1;
                if (isWinner) stats.games_won = (stats.games_won || 0) + 1;
                _patchStats(stats);
                if (_profile) _profile.total_xp = (_profile.total_xp || 0) + xp;

                const msg = isWinner
                    ? `Victory! +${xp} XP`
                    : `Game complete. +${xp} XP`;
                api.notify(msg, xp, 'xp');
                _log('game complete —', msg);
            } catch (err) {
                console.error('[gami] onGameComplete error:', err);
            }
        },

        /** Fetch a fresh profile from the DB */
        async getProfile() {
            if (!_userId) return null;
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', _userId)
                .single();
            if (error) { console.error('[gami] getProfile error:', error); return _profile; }
            _profile = data;
            return data;
        },

        /** Top N players ordered by total XP */
        async getLeaderboard(limit) {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('display_name, total_xp, current_level, user_id')
                .order('total_xp', { ascending: false })
                .limit(limit || 10);
            if (error) { console.error('[gami] leaderboard error:', error); return []; }
            return data || [];
        },

        /** All badges merged with the current user's earned status */
        async getBadgesWithStatus() {
            const { data: badges, error } = await supabase
                .from('badges')
                .select('*')
                .eq('is_active', true)
                .order('xp_reward', { ascending: true });
            if (error) { console.error('[gami] badges error:', error); return []; }

            const earnedIds = _profile?.badges_earned || [];
            return (badges || []).map(b => ({
                ...b,
                earned: earnedIds.includes(b.id)
            }));
        },

        /**
         * Show a slide-in toast at the bottom-right.
         * type: 'xp' | 'gold'
         */
        notify(message, amount, type) {
            const toast = document.createElement('div');
            toast.className = 'gami-toast';
            toast.innerHTML =
                `<span class="gami-toast-icon">${type === 'gold' ? '💰' : '⚡'}</span>${message}`;
            document.body.appendChild(toast);

            requestAnimationFrame(() => toast.classList.add('gami-toast-show'));

            setTimeout(() => {
                toast.classList.remove('gami-toast-show');
                setTimeout(() => toast.remove(), 400);
            }, 3000);
        }
    };

    return api;
})();

// ── Hook into window.logScrollEvent (already called by game-core.js executeSpell) ──
// This intercepts scroll casts with zero changes to game-core.js.
window.logScrollEvent = function (eventType, data) {
    if (eventType === 'cast_execute' && window.gami?.userId) {
        window.gami.onScrollCast(data?.scrollName, data?.element);
    }
};
