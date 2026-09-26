// social.js: friends list, online status, game invites and player cards.
//
// Server: sql/friends.sql (friend_links, friend_invites, RPCs
// send_friend_request / respond_friend_request / remove_friend / my_friends /
// touch_last_seen / set_hide_online / send_game_invite / my_game_invites /
// dismiss_game_invite / get_player_card).
//
// Online status: Supabase Realtime presence on channel "godaigo-online",
// keyed by user id, payload { status: 'lobby' | 'room' | 'game' }. Players
// who "appear offline" (user_profiles.hide_online) never join it.
// last_seen_at (touch_last_seen every 3 min) covers "last seen 2 h ago".
//
// Invites go through the database (never broadcast), polled every 10 s
// while signed in; a pop-up shows only when you are free in the lobby.
//
// Player cards: click any element with data-player-card="<user id>"
// (leaderboard, waiting room, in-game names, friends list).
(function () {
    'use strict';

    const PRESENCE_CHANNEL = 'godaigo-online';
    const INVITE_POLL_MS = 10000;
    const FRIENDS_POLL_MS = 60000;
    const SEEN_EVERY_MS = 3 * 60 * 1000;

    let myId = null;
    let presence = null;      // realtime channel
    let online = new Map();   // user id -> status
    let myStatus = null;
    let friends = [];         // rows from my_friends()
    let shownInvites = new Set();
    let started = false;

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const nameStyle = (colorId) => (colorId && window.cosmeticsSystem?.getNameColorStyle?.(colorId)) || '';
    const hidden = () => !!window.gami?.profile?.hide_online;

    // Where am I right now: 'game' (board open: game, tutorial, replay),
    // 'room' (waiting room) or 'lobby'.
    function whereAmI() {
        try {
            if (document.getElementById('game-layout')?.classList.contains('active')) return 'game';
            if (typeof currentGameId !== 'undefined' && currentGameId) return 'room';
        } catch (e) {}
        return 'lobby';
    }

    function timeAgo(iso) {
        if (!iso) return '';
        const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
        if (s < 90) return 'just now';
        if (s < 3600) return `${Math.round(s / 60)} min ago`;
        if (s < 86400) return `${Math.round(s / 3600)} h ago`;
        return `${Math.round(s / 86400)} days ago`;
    }

    // ── Presence ─────────────────────────────────────────────────
    function joinPresence() {
        if (presence || hidden() || !myId) return;
        try {
            presence = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: myId } } });
            presence.on('presence', { event: 'sync' }, () => {
                const state = presence.presenceState();
                online = new Map();
                for (const [uid, metas] of Object.entries(state)) {
                    const st = metas?.[metas.length - 1]?.status || 'lobby';
                    online.set(uid, st);
                }
                renderPanel();
            });
            presence.subscribe((s) => {
                if (s === 'SUBSCRIBED') { myStatus = null; updateMyStatus(); }
            });
        } catch (e) { presence = null; }
    }

    function leavePresence() {
        if (!presence) return;
        try { presence.untrack(); supabase.removeChannel(presence); } catch (e) {}
        presence = null;
        online = new Map();
        myStatus = null;
    }

    function updateMyStatus() {
        if (!presence) return;
        const st = whereAmI();
        if (st === myStatus) return;
        myStatus = st;
        try { presence.track({ status: st }); } catch (e) {}
        renderPanel();
    }

    function statusOf(f) {
        if (f.hidden) return { cls: 'off', text: 'Offline' };
        const st = online.get(f.user_id);
        if (st === 'game') return { cls: 'game', text: 'In a game' };
        if (st === 'room') return { cls: 'on', text: 'In a waiting room' };
        if (st) return { cls: 'on', text: 'Online' };
        return { cls: 'off', text: f.last_seen_at ? `Last seen ${timeAgo(f.last_seen_at)}` : 'Offline' };
    }

    // ── Data ─────────────────────────────────────────────────────
    async function loadFriends() {
        try {
            const { data, error } = await supabase.rpc('my_friends');
            if (!error) friends = data || [];
        } catch (e) {}
        updateBadge();
        renderPanel();
    }

    function updateBadge() {
        const btn = document.getElementById('friends-btn');
        if (!btn) return;
        const n = friends.filter(f => f.state === 'incoming').length;
        btn.textContent = n ? `Friends (${n})` : 'Friends';
        btn.classList.toggle('has-requests', n > 0);
    }

    // ── Modal helpers ────────────────────────────────────────────
    function overlay(id) {
        document.getElementById(id)?.remove();
        const o = document.createElement('div');
        o.id = id;
        o.className = 'social-overlay';
        o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
        document.body.appendChild(o);
        return o;
    }

    // ── Friends panel ────────────────────────────────────────────
    function openFriends() {
        const o = overlay('social-friends');
        o.innerHTML = `
            <div class="social-modal" role="dialog" aria-label="Friends">
                <div class="social-title">Friends</div>
                <div class="social-add">
                    <input type="text" class="acct-input" id="social-add-name" placeholder="Add a friend by username" maxlength="40">
                    <button class="acct-btn" id="social-add-btn">Add</button>
                </div>
                <div class="social-msg" id="social-msg"></div>
                <div class="social-list" id="social-list"><div class="social-empty">Loading...</div></div>
                <label class="social-hide"><input type="checkbox" id="social-hide" ${hidden() ? 'checked' : ''}>
                    Appear offline (friends will not see when you are online)</label>
                <div class="acct-actions"><button class="acct-btn" data-close>Close</button></div>
            </div>`;
        o.querySelector('[data-close]').onclick = () => o.remove();
        const input = o.querySelector('#social-add-name');
        const add = async () => {
            const name = input.value.trim();
            if (!name) return;
            await sendRequest(null, name);
            input.value = '';
        };
        o.querySelector('#social-add-btn').onclick = add;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        o.querySelector('#social-hide').onchange = (e) => setHidden(e.target.checked);
        o.querySelector('#social-list').addEventListener('click', onListClick);
        loadFriends();
    }

    function msg(text) {
        const el = document.getElementById('social-msg');
        if (el) el.textContent = text || '';
    }

    const SEND_TEXT = {
        sent: 'Friend request sent.',
        accepted: 'You are now friends!',
        already: 'You are already friends.',
        pending: 'You already sent a request. Waiting for them to accept.',
        not_found: 'No player with that name.',
        self: 'That is you!',
        limit: 'You have too many open requests. Wait for some to be answered.',
    };

    async function sendRequest(userId, name) {
        const { data, error } = await supabase.rpc('send_friend_request', { p_user: userId, p_name: name });
        const text = error ? 'Could not send: ' + error.message : (SEND_TEXT[data] || 'Done.');
        msg(text);
        await loadFriends();
        return { result: data, text };
    }

    function friendRow(f) {
        const name = `<span class="social-name" data-player-card="${esc(f.user_id)}" style="${nameStyle(f.name_color)}">${esc(f.name)}</span>`;
        if (f.state === 'incoming') {
            return `<div class="social-row">${name}<span class="social-sub">wants to be friends</span>
                <span class="social-actions"><button class="acct-btn" data-act="accept" data-id="${esc(f.user_id)}">Accept</button>
                <button class="acct-btn acct-btn-secondary" data-act="decline" data-id="${esc(f.user_id)}">Decline</button></span></div>`;
        }
        if (f.state === 'outgoing') {
            return `<div class="social-row">${name}<span class="social-sub">request sent</span>
                <span class="social-actions"><button class="acct-btn acct-btn-secondary" data-act="cancel" data-id="${esc(f.user_id)}">Cancel</button></span></div>`;
        }
        const st = statusOf(f);
        const canInvite = whereAmI() === 'room' && st.cls === 'on';
        return `<div class="social-row"><span class="social-dot ${st.cls}"></span>${name}<span class="social-sub">${esc(st.text)}</span>
            <span class="social-actions">
                ${canInvite ? `<button class="acct-btn" data-act="invite" data-id="${esc(f.user_id)}">Invite</button>` : ''}
                <button class="acct-btn acct-btn-secondary social-remove" data-act="remove" data-id="${esc(f.user_id)}" data-name="${esc(f.name)}" title="Remove friend">&times;</button>
            </span></div>`;
    }

    function renderPanel() {
        const list = document.getElementById('social-list');
        if (!list) return;
        const incoming = friends.filter(f => f.state === 'incoming');
        const outgoing = friends.filter(f => f.state === 'outgoing');
        const rank = (f) => ({ on: 0, game: 1, off: 2 }[statusOf(f).cls]); // free first: they can be invited
        const mine = friends.filter(f => f.state === 'friend')
            .sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
        let html = '';
        if (incoming.length) html += `<div class="social-head">Requests</div>` + incoming.map(friendRow).join('');
        html += `<div class="social-head">Friends${mine.length ? ` (${mine.length})` : ''}</div>`;
        html += mine.length ? mine.map(friendRow).join('')
            : '<div class="social-empty">No friends yet. Add someone by their username, or click a name on the leaderboard.</div>';
        if (outgoing.length) html += `<div class="social-head">Sent requests</div>` + outgoing.map(friendRow).join('');
        if (whereAmI() !== 'room' && mine.length) html += '<div class="social-note">Tip: create a room first, then invite friends who are online.</div>';
        list.innerHTML = html;
    }

    async function onListClick(e) {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const id = b.dataset.id;
        b.disabled = true;
        if (b.dataset.act === 'accept' || b.dataset.act === 'decline') {
            await supabase.rpc('respond_friend_request', { p_user: id, p_accept: b.dataset.act === 'accept' });
            msg(b.dataset.act === 'accept' ? 'You are now friends!' : '');
        } else if (b.dataset.act === 'cancel') {
            await supabase.rpc('remove_friend', { p_user: id });
        } else if (b.dataset.act === 'remove') {
            if (!confirm(`Remove ${b.dataset.name} from your friends?`)) { b.disabled = false; return; }
            await supabase.rpc('remove_friend', { p_user: id });
        } else if (b.dataset.act === 'invite') {
            const { data, error } = await supabase.rpc('send_game_invite', { p_user: id });
            msg(error ? 'Could not invite: ' + error.message
                : ({ sent: 'Invite sent!', no_room: 'Create or join a room first.', too_many: 'Wait a moment before inviting again.',
                     not_friends: 'You can only invite friends.' }[data] || ''));
            b.disabled = false;
            return;
        }
        loadFriends();
    }

    async function setHidden(hide) {
        const { error } = await supabase.rpc('set_hide_online', { p_hide: hide });
        if (error) { msg('Could not save: ' + error.message); return; }
        if (window.gami?.profile) window.gami.profile.hide_online = hide;
        if (hide) leavePresence();
        else { joinPresence(); supabase.rpc('touch_last_seen').then(() => {}, () => {}); }
        msg(hide ? 'You now appear offline.' : 'Friends can see when you are online.');
    }

    // ── Game invites ─────────────────────────────────────────────
    async function pollInvites() {
        if (!myId || whereAmI() !== 'lobby') return;
        let rows = [];
        try {
            const { data, error } = await supabase.rpc('my_game_invites');
            if (error) return;
            rows = data || [];
        } catch (e) { return; }
        const inv = rows.find(r => !shownInvites.has(r.id));
        if (inv) showInvite(inv);
    }

    function showInvite(inv) {
        shownInvites.add(inv.id);
        document.getElementById('social-invite')?.remove();
        const el = document.createElement('div');
        el.id = 'social-invite';
        el.innerHTML = `
            <div class="social-invite-text"><b>${esc(inv.from_name)}</b> invited you to their game!</div>
            <div class="social-invite-actions">
                <button class="acct-btn" data-act="join">Join</button>
                <button class="acct-btn acct-btn-secondary" data-act="no">No thanks</button>
            </div>`;
        document.body.appendChild(el);
        try { window.SoundSystem?.play?.('activatescroll', 0.6); } catch (e) {}
        const done = () => { el.remove(); supabase.rpc('dismiss_game_invite', { p_id: inv.id }).then(() => {}, () => {}); };
        el.querySelector('[data-act=no]').onclick = done;
        el.querySelector('[data-act=join]').onclick = async () => {
            done();
            if (whereAmI() !== 'lobby') { alert('Leave your current room or game first, then accept the invite.'); return; }
            document.getElementById('social-friends')?.remove();
            if (typeof window.joinPublicGame === 'function') await window.joinPublicGame(inv.game_id);
        };
        setTimeout(() => el.remove(), 60000);
    }

    // ── Player cards ─────────────────────────────────────────────
    async function openCard(userId) {
        if (!userId) return;
        const o = overlay('social-card');
        o.innerHTML = '<div class="social-modal"><div class="social-empty">Loading...</div></div>';
        const { data: c, error } = await supabase.rpc('get_player_card', { p_user: userId });
        if (!document.body.contains(o)) return;
        if (error || !c) { o.innerHTML = '<div class="social-modal"><div class="social-empty">Could not load this player.</div></div>'; return; }
        const f = { user_id: c.user_id, hidden: false, last_seen_at: c.last_seen_at };
        const status = c.friend_state === 'friend' ? statusOf(f).text : '';
        const winPct = c.games ? Math.round(100 * c.wins / c.games) : 0;
        const friendBtn = {
            none: '<button class="acct-btn" data-act="add">Add friend</button>',
            outgoing: '<button class="acct-btn" disabled>Request sent</button>',
            incoming: '<button class="acct-btn" data-act="accept">Accept friend request</button>',
            friend: '<button class="acct-btn acct-btn-secondary" disabled>Friends</button>',
            self: '',
        }[c.friend_state] || '';
        const replays = (c.replays || []).map(r =>
            `<div class="social-replay"><span>${esc(new Date(r.started_at).toLocaleDateString())}${r.won ? ' · <b>won</b>' : ''}</span>
             <button class="acct-btn" data-act="watch" data-id="${r.id}">Watch</button></div>`).join('');
        o.innerHTML = `
            <div class="social-modal social-card" role="dialog" aria-label="Player card">
                <div class="social-card-name" style="${nameStyle(c.name_color)}">${esc(c.name)}</div>
                ${status ? `<div class="social-card-status">${esc(status)}</div>` : ''}
                <div class="social-stats">
                    <div><span>Level</span><b>${c.level ?? 1}</b></div>
                    <div><span>Ladder</span><b>${c.rank ? '#' + c.rank : '-'}</b></div>
                    <div><span>Games</span><b>${c.games}</b></div>
                    <div><span>Wins</span><b>${c.wins}${c.games ? ` (${winPct}%)` : ''}</b></div>
                    <div><span>Elements</span><b>${c.elements}</b></div>
                    <div><span>Joined</span><b>${esc(new Date(c.member_since).toLocaleDateString())}</b></div>
                </div>
                ${replays ? `<div class="social-head">Public replays</div>${replays}` : ''}
                <div class="social-msg" id="social-card-msg"></div>
                <div class="acct-actions">${friendBtn}<button class="acct-btn acct-btn-secondary" data-close>Close</button></div>
            </div>`;
        o.querySelector('[data-close]').onclick = () => o.remove();
        o.querySelector('.social-card').addEventListener('click', async (e) => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            if (b.dataset.act === 'watch') {
                if (whereAmI() !== 'lobby') { alert('Replays can be watched from the lobby.'); return; }
                document.querySelectorAll('.social-overlay').forEach(x => x.remove());
                window.Replay?.open(+b.dataset.id);
                return;
            }
            b.disabled = true;
            if (b.dataset.act === 'add') {
                const r = await sendRequest(c.user_id, null);
                const m = document.getElementById('social-card-msg');
                if (m) m.textContent = r.text;
                b.textContent = r.result === 'accepted' ? 'Friends' : 'Request sent';
            } else if (b.dataset.act === 'accept') {
                await supabase.rpc('respond_friend_request', { p_user: c.user_id, p_accept: true });
                b.textContent = 'Friends';
                loadFriends();
            }
        });
    }

    // Any element with data-player-card="<user id>" opens that player's card.
    document.addEventListener('click', (e) => {
        const el = e.target.closest?.('[data-player-card]');
        if (!el || !el.dataset.playerCard || !myId) return;
        e.preventDefault();
        e.stopPropagation();
        openCard(el.dataset.playerCard);
    }, true);

    // ── Start once signed in ─────────────────────────────────────
    function start() {
        if (started) return;
        const id = window.gami?.userId;
        if (!id || !window.gami?.profile) return;
        started = true;
        myId = id;
        joinPresence();
        loadFriends();
        supabase.rpc('touch_last_seen').then(() => {}, () => {});
        setInterval(updateMyStatus, 3000);
        setInterval(pollInvites, INVITE_POLL_MS);
        setInterval(loadFriends, FRIENDS_POLL_MS);
        setInterval(() => { if (!hidden()) supabase.rpc('touch_last_seen').then(() => {}, () => {}); }, SEEN_EVERY_MS);
    }
    const waitStart = setInterval(() => { start(); if (started) clearInterval(waitStart); }, 1000);

    window.Social = { openFriends, openCard, whereAmI, isOnline: (id) => online.has(id) };
})();
