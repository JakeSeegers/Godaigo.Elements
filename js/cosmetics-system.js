// ============================================================
// COSMETICS SYSTEM  (js/cosmetics-system.js)
// Currently: name colours only.  No XP impact.
//
// Public API: window.cosmeticsSystem
// ============================================================

(function () {
    'use strict';

    // Gradient text: the name is painted with a background clipped to the
    // letters. anim = optional CSS animation (keyframes in css/styles.css).
    function gradText(stops, anim, size) {
        return [
            `background:linear-gradient(90deg,${stops})`,
            `background-size:${size || '100%'} 100%`,
            '-webkit-background-clip:text',
            'background-clip:text',
            '-webkit-text-fill-color:transparent',
            anim ? `animation:${anim}` : '',
        ].filter(Boolean).join(';') + ';';
    }

    // Every name style. `group` is the shop heading. Prices must match
    // cosmetic_price() in sql/cosmetics.sql. `value` is kept for the solid
    // colours (older code read it).
    const NAME_COLORS = [
        { id: 'name_gold',     group: 'Colours',  name: 'Gold',          cost: 50,  value: '#FFD700', style: 'color:#FFD700;' },
        { id: 'name_crimson',  group: 'Colours',  name: 'Crimson',       cost: 50,  value: '#ff3355', style: 'color:#ff3355;' },
        { id: 'name_blue',     group: 'Colours',  name: 'Electric Blue', cost: 50,  value: '#00aaff', style: 'color:#00aaff;' },
        { id: 'name_emerald',  group: 'Colours',  name: 'Emerald',       cost: 50,  value: '#00ee88', style: 'color:#00ee88;' },
        { id: 'name_purple',   group: 'Colours',  name: 'Royal Purple',  cost: 75,  value: '#cc44ff', style: 'color:#cc44ff;' },
        { id: 'name_rainbow',  group: 'Colours',  name: 'Rainbow',       cost: 200, value: 'rainbow',
          style: gradText('#f00,#f70,#ff0,#0f0,#00f,#80f,#f00', 'nameRainbow 3s linear infinite', '200%') },

        { id: 'name_el_earth', group: 'Elements', name: 'Earth',         cost: 100, style: gradText('#4e7a2e,#69d83a,#a08c62') },
        { id: 'name_el_water', group: 'Elements', name: 'Water',         cost: 100, style: gradText('#2f6fd8,#5894f4,#cfe8ff') },
        { id: 'name_el_fire',  group: 'Elements', name: 'Fire',          cost: 100, style: gradText('#c8102e,#ed1b43,#ffb347') },
        { id: 'name_el_wind',  group: 'Elements', name: 'Wind',          cost: 100, style: gradText('#e0b800,#ffce00,#fffbe0') },
        { id: 'name_el_void',  group: 'Elements', name: 'Void',          cost: 100, style: gradText('#6a34c0,#b98cff,#6a34c0') },

        { id: 'name_silver',   group: 'Metals',   name: 'Silver',        cost: 75,  style: gradText('#9aa3ad,#f4f7fa,#9aa3ad') },
        { id: 'name_bronze',   group: 'Metals',   name: 'Bronze',        cost: 75,  style: gradText('#8a5424,#e0a868,#8a5424') },
        { id: 'name_obsidian', group: 'Metals',   name: 'Obsidian',      cost: 100,
          style: gradText('#6a6a84 0%,#6a6a84 40%,#e6e6f5 50%,#6a6a84 60%,#6a6a84 100%', 'nameShine 4s linear infinite', '250%') },

        { id: 'name_shimmer',  group: 'Animated', name: 'Gold Shimmer',  cost: 150,
          style: gradText('#d4a017 0%,#d4a017 40%,#fff6c8 50%,#d4a017 60%,#d4a017 100%', 'nameShine 3s linear infinite', '250%') },
        { id: 'name_ember',    group: 'Animated', name: 'Ember',         cost: 175,
          style: 'color:#ff7a1a;animation:nameEmber 1.6s ease-in-out infinite;' },
        { id: 'name_tide',     group: 'Animated', name: 'Tide',          cost: 175,
          style: gradText('#1e4fa8,#5894f4,#6fe0e0,#cfe8ff,#5894f4,#1e4fa8', 'nameTide 4s ease-in-out infinite alternate', '300%') },
        { id: 'name_voidpulse',group: 'Animated', name: 'Void Pulse',    cost: 175,
          style: 'color:#b98cff;animation:nameVoidPulse 3s ease-in-out infinite;' },
        { id: 'name_glitch',   group: 'Animated', name: 'CRT Glitch',    cost: 250,
          style: 'color:#e8f7ff;display:inline-block;animation:nameGlitch 4s steps(1,end) infinite;' },
    ];

    // ── Storage ───────────────────────────────────────────────
    // Owned and equipped colours live on the server (user_profiles
    // .cosmetics_owned / .name_color, sql/cosmetics.sql) so other players
    // see them, e.g. on the leaderboard. They change only through the
    // buy_cosmetic / equip_cosmetic RPCs. window.gami.profile holds the copy
    // loaded at sign-in (select *), updated here after each change.

    function getUserId() { return window.gami?.userId || null; }

    function loadData() {
        const prof = window.gami?.profile;
        if (!prof) return { owned: [], equipped: {} };
        return {
            owned: Array.isArray(prof.cosmetics_owned) ? prof.cosmetics_owned : [],
            equipped: prof.name_color ? { namecolor: prof.name_color } : {},
        };
    }

    function getEquipped(catKey) { return loadData().equipped[catKey] || null; }
    function getEquippedAll()    { return loadData().equipped || {}; }

    // ── Purchase / equip ──────────────────────────────────────

    async function purchaseItem(id) {
        const item = NAME_COLORS.find(i => i.id === id);
        if (!item) return { ok: false, msg: 'Item not found' };
        if (!getUserId() || !window.gami?.profile) return { ok: false, msg: 'Not logged in' };

        const data = loadData();
        if (data.owned.includes(id)) return { ok: false, msg: 'Already owned' };

        const gold = window.gami.profile.gold || 0;
        if (gold < item.cost) return { ok: false, msg: `Need ${item.cost}g (you have ${gold}g)` };

        const { data: newGold, error } = await supabase.rpc('buy_cosmetic', { p_id: id });
        if (error) {
            return { ok: false, msg: /enough gold/.test(error.message) ? 'Not enough gold' : 'Purchase failed' };
        }
        window.gami.profile.gold = typeof newGold === 'number' ? newGold : gold - item.cost;
        window.gami.profile.cosmetics_owned = [...data.owned, id];
        return { ok: true };
    }

    // Toggle: equipping the colour that is already on takes it off.
    async function equipItem(id) {
        const data = loadData();
        if (!data.owned.includes(id) || !window.gami?.profile) return;
        const next = data.equipped.namecolor === id ? null : id;
        const { error } = await supabase.rpc('equip_cosmetic', { p_id: next });
        if (error) { window.gami?.notify?.('Could not change colour', 0, 'gold'); return; }
        window.gami.profile.name_color = next;
    }

    // One-time carry-over: before the server stored colours, the equipped
    // colour lived in localStorage (godaigo_cosmetics_<uid>). If this browser
    // still has one and the server has none, equip it on the server (which
    // checks ownership). Runs once per account per browser.
    function carryOverLocalEquip() {
        const uid = getUserId();
        const prof = window.gami?.profile;
        if (!uid || !prof) return false;
        const doneKey = `godaigo_cosmetics_migrated_${uid}`;
        try {
            if (localStorage.getItem(doneKey)) return true;
            localStorage.setItem(doneKey, '1');
            const old = JSON.parse(localStorage.getItem(`godaigo_cosmetics_${uid}`) || 'null');
            const id = old?.equipped?.namecolor;
            const owned = Array.isArray(prof.cosmetics_owned) ? prof.cosmetics_owned : [];
            if (id && !prof.name_color && owned.includes(id)) {
                supabase.rpc('equip_cosmetic', { p_id: id }).then(({ error }) => {
                    if (error) return;
                    prof.name_color = id;
                    window.loadMainLeaderboard?.();
                });
            }
        } catch (e) {}
        return true;
    }
    const carryTimer = setInterval(() => { if (carryOverLocalEquip()) clearInterval(carryTimer); }, 2000);

    // ── Name color helper ─────────────────────────────────────

    function getNameColorStyle(equippedId) {
        const nc   = equippedId || getEquipped('namecolor');
        const item = NAME_COLORS.find(i => i.id === nc);
        return item ? item.style : '';
    }


    // ── Other players' name colours ──────────────────────────
    // name_color is public on user_profiles, so a room loads every human
    // seat's colour once (loadNameColors) and the waiting room, opponent
    // panel, turn display and Game Log colour usernames with it. Bots have
    // no user_id and stay plain. Your own colour always comes from your
    // live profile, so equipping shows at once.
    const nameColorCache = new Map(); // user_id -> name_color id (or null)

    async function loadNameColors(userIds) {
        const ids = [...new Set((userIds || []).filter(Boolean))].filter(id => !nameColorCache.has(id));
        if (!ids.length) return false;
        try {
            const { data, error } = await supabase.from('user_profiles').select('user_id, name_color').in('user_id', ids);
            if (error) return false;
            ids.forEach(id => nameColorCache.set(id, null));
            (data || []).forEach(r => nameColorCache.set(r.user_id, r.name_color || null));
            return (data || []).some(r => r.name_color);
        } catch (e) { return false; }
    }

    function styleForUser(userId) {
        if (!userId) return '';
        const id = userId === getUserId() ? (window.gami?.profile?.name_color || null) : nameColorCache.get(userId);
        return id ? getNameColorStyle(id) : '';
    }

    function escHtml(v) {
        return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // "Username (Colour)" for a seat as HTML, with the username in that
    // player's name colour. Same text as getPlayerColorName().
    function seatNameHtml(playerIndex) {
        const text = typeof getPlayerColorName === 'function' ? getPlayerColorName(playerIndex) : `Player ${playerIndex + 1}`;
        let row = null;
        try { row = (typeof allPlayersData !== 'undefined' ? allPlayersData : []).find(p => p.player_index === playerIndex); } catch (e) {}
        const style = styleForUser(row?.user_id);
        const m = String(text).match(/^(.*) (\([^()]*\))$/);
        if (!style || !m) return escHtml(text);
        return `<span style="${style}">${escHtml(m[1])}</span> ${escHtml(m[2])}`;
    }

    // ── Panel UI ──────────────────────────────────────────────

    let panelEl = null;
    let isPanelOpen = false;

    function buildPanel() {
        if (panelEl) return;
        panelEl = document.createElement('div');
        panelEl.id = 'cosmetics-panel';
        panelEl.innerHTML = `
            <div class="cos-header">
                <span class="cos-title">Name Colours</span>
                <button class="cos-close" onclick="window.cosmeticsSystem.closePanel()">✕</button>
            </div>
            <div class="cos-gold-bar"><span id="cos-gold-amt">-</span>g</div>
            <div class="cos-body" id="cos-body"></div>
        `;
        document.body.appendChild(panelEl);
    }

    function renderPanel() {
        const data     = loadData();
        const equipped = data.equipped.namecolor;
        const gold     = window.gami?.profile?.gold || 0;

        const goldEl = document.getElementById('cos-gold-amt');
        if (goldEl) goldEl.textContent = window.gami?.profile?.gold ?? '-';

        const body = document.getElementById('cos-body');
        if (!body) return;

        body.innerHTML = NAME_COLORS.map((item, n) => {
            const heading = (n === 0 || NAME_COLORS[n - 1].group !== item.group)
                ? `<div class="cos-group">${item.group}</div>` : '';
            const owned      = data.owned.includes(item.id);
            const isEquipped = equipped === item.id;
            const canAfford  = gold >= item.cost;

            const previewStyle = item.style;

            let actionHTML;
            if (owned) {
                actionHTML = `<button class="cos-btn ${isEquipped ? 'cos-equipped-btn' : 'cos-equip-btn'}"
                    onclick="window.cosmeticsSystem.handleEquip('${item.id}')">
                    ${isEquipped ? '✓ On' : 'Equip'}
                </button>`;
            } else {
                actionHTML = `<button class="cos-btn cos-buy-btn ${canAfford ? '' : 'cos-cant-afford'}"
                    onclick="window.cosmeticsSystem.handleBuy('${item.id}')">
                    ${item.cost}g
                </button>`;
            }

            return heading + `
                <div class="cos-item ${isEquipped ? 'cos-item-equipped' : ''}">
                    <div class="cos-preview">
                        <span style="${previewStyle}font-weight:bold;font-size:15px;line-height:36px;">Aa</span>
                    </div>
                    <div class="cos-info">
                        <div class="cos-name">${item.name}</div>
                    </div>
                    <div class="cos-action">${actionHTML}</div>
                </div>
            `;
        }).join('');
    }

    // ── Public API ────────────────────────────────────────────

    window.cosmeticsSystem = {
        togglePanel() { isPanelOpen ? this.closePanel() : this.openPanel(); },

        openPanel() {
            buildPanel();
            renderPanel();
            panelEl.classList.add('open');
            isPanelOpen = true;
        },

        closePanel() {
            panelEl?.classList.remove('open');
            isPanelOpen = false;
        },

        async handleBuy(id) {
            const result = await purchaseItem(id);
            renderPanel();
            window.gami?.notify(result.ok ? 'Purchased!' : result.msg, 0, 'gold');
        },

        async handleEquip(id) {
            await equipItem(id);
            renderPanel();
            window.loadMainLeaderboard?.();
        },

        getEquippedAll,
        getEquipped,
        getNameColorStyle,
        loadNameColors,
        styleForUser,
        seatNameHtml,
        getItems() { return NAME_COLORS; },
        getData:    loadData,
    };

})();
