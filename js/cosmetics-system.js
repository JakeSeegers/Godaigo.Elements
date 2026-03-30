// ============================================================
// COSMETICS SYSTEM  (js/cosmetics-system.js)
// Currently: name colours only.  No XP impact.
//
// Public API: window.cosmeticsSystem
// ============================================================

(function () {
    'use strict';

    const NAME_COLORS = [
        { id: 'name_gold',    name: 'Gold',         cost: 50,  value: '#FFD700' },
        { id: 'name_crimson', name: 'Crimson',       cost: 50,  value: '#ff3355' },
        { id: 'name_blue',    name: 'Electric Blue', cost: 50,  value: '#00aaff' },
        { id: 'name_emerald', name: 'Emerald',       cost: 50,  value: '#00ee88' },
        { id: 'name_purple',  name: 'Royal Purple',  cost: 75,  value: '#cc44ff' },
        { id: 'name_rainbow', name: 'Rainbow',       cost: 200, value: 'rainbow' },
    ];

    // ── Storage ───────────────────────────────────────────────

    function getUserId() { return window.gami?.userId || null; }

    function storageKey() {
        const uid = getUserId();
        return uid ? `godaigo_cosmetics_${uid}` : null;
    }

    function loadData() {
        const key = storageKey();
        if (!key) return { owned: [], equipped: {} };
        try { return JSON.parse(localStorage.getItem(key) || '{"owned":[],"equipped":{}}'); }
        catch { return { owned: [], equipped: {} }; }
    }

    function saveData(data) {
        const key = storageKey();
        if (key) localStorage.setItem(key, JSON.stringify(data));
    }

    function getEquipped(catKey) { return loadData().equipped[catKey] || null; }
    function getEquippedAll()    { return loadData().equipped || {}; }

    // ── Purchase / equip ──────────────────────────────────────

    async function purchaseItem(id) {
        const item = NAME_COLORS.find(i => i.id === id);
        if (!item) return { ok: false, msg: 'Item not found' };

        const data = loadData();
        if (data.owned.includes(id)) return { ok: false, msg: 'Already owned' };

        const userId = getUserId();
        if (!userId) return { ok: false, msg: 'Not logged in' };

        const gold = window.gami?.profile?.gold || 0;
        if (gold < item.cost) return { ok: false, msg: `Need ${item.cost}g (you have ${gold}g)` };

        const { error } = await supabase.rpc('award_gold', {
            p_user_id:     userId,
            p_gold_amount: -item.cost,
            p_description: `Name colour: ${item.name}`
        });
        if (error) return { ok: false, msg: 'Purchase failed' };

        if (window.gami?.profile) window.gami.profile.gold -= item.cost;
        data.owned.push(id);
        saveData(data);
        return { ok: true };
    }

    function equipItem(id) {
        const data = loadData();
        if (!data.owned.includes(id)) return;
        data.equipped.namecolor = (data.equipped.namecolor === id) ? null : id;
        if (!data.equipped.namecolor) delete data.equipped.namecolor;
        saveData(data);
    }

    // ── Name color helper ─────────────────────────────────────

    function getNameColorStyle(equippedId) {
        const nc   = equippedId || getEquipped('namecolor');
        const item = NAME_COLORS.find(i => i.id === nc);
        if (!item) return '';
        if (item.value === 'rainbow') {
            return [
                'background:linear-gradient(90deg,#f00,#f70,#ff0,#0f0,#00f,#80f,#f00)',
                'background-size:200%',
                '-webkit-background-clip:text',
                '-webkit-text-fill-color:transparent',
                'background-clip:text',
                'animation:nameRainbow 3s linear infinite',
            ].join(';') + ';';
        }
        return `color:${item.value};`;
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
                <span class="cos-title">🎨 Name Colours</span>
                <button class="cos-close" onclick="window.cosmeticsSystem.closePanel()">✕</button>
            </div>
            <div class="cos-gold-bar">💰 <span id="cos-gold-amt">—</span>g</div>
            <div class="cos-body" id="cos-body"></div>
        `;
        document.body.appendChild(panelEl);
    }

    function renderPanel() {
        const data     = loadData();
        const equipped = data.equipped.namecolor;
        const gold     = window.gami?.profile?.gold || 0;

        const goldEl = document.getElementById('cos-gold-amt');
        if (goldEl) goldEl.textContent = window.gami?.profile?.gold ?? '—';

        const body = document.getElementById('cos-body');
        if (!body) return;

        body.innerHTML = NAME_COLORS.map(item => {
            const owned      = data.owned.includes(item.id);
            const isEquipped = equipped === item.id;
            const canAfford  = gold >= item.cost;

            const previewStyle = item.value === 'rainbow'
                ? 'background:linear-gradient(90deg,#f00,#f70,#ff0,#0f0,#00f,#80f);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;background-size:200%;animation:nameRainbow 3s linear infinite;'
                : `color:${item.value};`;

            let actionHTML;
            if (owned) {
                actionHTML = `<button class="cos-btn ${isEquipped ? 'cos-equipped-btn' : 'cos-equip-btn'}"
                    onclick="window.cosmeticsSystem.handleEquip('${item.id}')">
                    ${isEquipped ? '✓ On' : 'Equip'}
                </button>`;
            } else {
                actionHTML = `<button class="cos-btn cos-buy-btn ${canAfford ? '' : 'cos-cant-afford'}"
                    onclick="window.cosmeticsSystem.handleBuy('${item.id}')">
                    💰 ${item.cost}g
                </button>`;
            }

            return `
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

        handleEquip(id) {
            equipItem(id);
            renderPanel();
        },

        getEquippedAll,
        getEquipped,
        getNameColorStyle,
        getItems() { return NAME_COLORS; },
        getData:    loadData,
    };

})();
