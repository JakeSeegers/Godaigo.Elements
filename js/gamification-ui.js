// ============================================================
// GAMIFICATION UI  (js/gamification-ui.js)
// Vanilla JS modal panel: Profile · Cosmetics · Emojis · Badges · Leaderboard
//
// Entry point: gami_openPanel()
//   Called from the "👤 Profile" button in the auth bar (index.html).
// ============================================================

/** Toggle the profile panel open / closed */
function gami_openPanel() {
    const existing = document.getElementById('gami-panel');
    if (existing) { existing.remove(); return; }
    if (!window.gami?.userId) return;

    const overlay = document.createElement('div');
    overlay.id        = 'gami-panel';
    overlay.className = 'gami-overlay';
    overlay.innerHTML = `
        <div class="gami-modal" role="dialog" aria-label="Profile panel">
            <div class="gami-header">
                <h2 class="gami-title">Profile</h2>
                <button class="gami-close" aria-label="Close" onclick="document.getElementById('gami-panel').remove()">×</button>
            </div>
            <div class="gami-tabs" role="tablist">
                <button class="gami-tab active" role="tab" onclick="gami_switchTab('profile')">Stats</button>
                <button class="gami-tab"        role="tab" onclick="gami_switchTab('cosmetics')">Colours</button>
                <button class="gami-tab"        role="tab" onclick="gami_switchTab('emojis')">Emojis</button>
                <button class="gami-tab"        role="tab" onclick="gami_switchTab('badges')">Badges</button>
                <button class="gami-tab"        role="tab" onclick="gami_switchTab('leaderboard')">Board</button>
                <button class="gami-tab"        role="tab" onclick="gami_switchTab('settings')">Settings</button>
            </div>
            <div id="gami-content" class="gami-content">
                <div class="gami-loading">Loading…</div>
            </div>
        </div>
    `;

    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    gami_switchTab('profile');
}

/** Open the panel directly on the Settings tab (usable from in-game HUD) */
function gami_openSettings() {
    const existing = document.getElementById('gami-panel');
    if (existing) {
        // Panel already open — if we're already on settings, close it; otherwise switch to it
        const activeTab = existing.querySelector('.gami-tab.active');
        if (activeTab && activeTab.textContent.trim() === 'Settings') {
            existing.remove();
        } else {
            gami_switchTab('settings');
        }
        return;
    }
    // Open panel, but land on settings tab instead of profile
    gami_openPanel();
    // gami_openPanel ends on 'profile'; immediately switch to settings
    gami_switchTab('settings');
}

/** Switch the active tab and load its content */
async function gami_switchTab(tab) {
    const panel = document.getElementById('gami-panel');
    if (!panel) return;

    const tabs   = panel.querySelectorAll('.gami-tab');
    const tabIdx = ['profile', 'cosmetics', 'emojis', 'badges', 'leaderboard', 'settings'].indexOf(tab);
    tabs.forEach((btn, i) => btn.classList.toggle('active', i === tabIdx));

    const content = document.getElementById('gami-content');
    content.innerHTML = '<div class="gami-loading">Loading…</div>';

    try {
        if      (tab === 'profile')     await _renderProfile(content);
        else if (tab === 'cosmetics')        _renderCosmetics(content);
        else if (tab === 'emojis')           _renderEmojis(content);
        else if (tab === 'badges')      await _renderBadges(content);
        else if (tab === 'settings')         _renderSettings(content);
        else                            await _renderLeaderboard(content);
    } catch (err) {
        console.error('[gami-ui] render error:', err);
        content.innerHTML = '<div class="gami-loading">Failed to load. Please try again.</div>';
    }
}

// ── Profile tab ──────────────────────────────────────────────

async function _renderProfile(content) {
    const profile = await window.gami.getProfile();
    if (!profile) {
        content.innerHTML = '<div class="gami-loading">Could not load profile.</div>';
        return;
    }

    const xpIntoLevel = profile.total_xp % 1000;
    const xpPercent   = Math.round(xpIntoLevel / 10);
    const stats       = profile.stats || {};
    const winRate     = stats.games_played > 0
        ? Math.round((stats.games_won / stats.games_played) * 100)
        : 0;
    const earnedCount = (profile.badges_earned || []).length;

    content.innerHTML = `
        <div class="gami-profile-row">
            <div class="gami-level-badge">
                <span class="gami-level-num">${profile.current_level}</span>
                <span class="gami-level-label">Level</span>
            </div>
            <div class="gami-profile-info">
                <div class="gami-display-name">${_esc(profile.display_name)}</div>
                <div class="gami-xp-bar-wrap">
                    <div class="gami-xp-bar" style="width:${xpPercent}%"></div>
                </div>
                <div class="gami-xp-text">${xpIntoLevel.toLocaleString()} / 1,000 XP to next level</div>
            </div>
        </div>

        <div class="gami-stats-grid">
            <div class="gami-stat">
                <span class="gami-stat-val">${(profile.total_xp || 0).toLocaleString()}</span>
                <span class="gami-stat-lbl">Total XP</span>
            </div>
            <div class="gami-stat">
                <span class="gami-stat-val">${(profile.gold || 0).toLocaleString()}</span>
                <span class="gami-stat-lbl">Gold</span>
            </div>
            <div class="gami-stat">
                <span class="gami-stat-val">${stats.games_played || 0}</span>
                <span class="gami-stat-lbl">Games Played</span>
            </div>
            <div class="gami-stat">
                <span class="gami-stat-val">${stats.games_won || 0}</span>
                <span class="gami-stat-lbl">Games Won</span>
            </div>
            <div class="gami-stat">
                <span class="gami-stat-val">${winRate}%</span>
                <span class="gami-stat-lbl">Win Rate</span>
            </div>
            <div class="gami-stat">
                <span class="gami-stat-val">${earnedCount}</span>
                <span class="gami-stat-lbl">Badges Earned</span>
            </div>
        </div>
    `;
}

// ── Cosmetics tab ────────────────────────────────────────────

function _renderCosmetics(content) {
    const cs = window.cosmeticsSystem;
    if (!cs) { content.innerHTML = '<div class="gami-loading">Cosmetics not loaded.</div>'; return; }

    const items    = cs.getItems();
    const data     = cs.getData();
    const equipped = data.equipped?.namecolor || null;
    const owned    = data.owned || [];
    const gold     = window.gami?.profile?.gold || 0;

    content.innerHTML = `
        <div class="gami-cos-header">
            <span style="color:#eee;font-size:15px;font-weight:bold;">Name Colours</span>
            <span style="color:#d9b08c;font-size:14px;">${gold}g</span>
        </div>
        <div class="gami-cos-list">
            ${items.map(item => {
                const isOwned    = owned.includes(item.id);
                const isEquipped = equipped === item.id;
                const canAfford  = gold >= item.cost;

                const previewStyle = item.value === 'rainbow'
                    ? 'background:linear-gradient(90deg,#f00,#f70,#ff0,#0f0,#00f,#80f);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:nameRainbow 3s linear infinite;font-weight:bold;font-size:18px;'
                    : `color:${item.value};font-weight:bold;font-size:18px;`;

                let actionHTML;
                if (isOwned) {
                    actionHTML = `<button class="gami-cos-btn${isEquipped ? ' equipped' : ''}"
                        onclick="_gami_cosmeticsEquip('${item.id}')">
                        ${isEquipped ? '✓ On' : 'Equip'}
                    </button>`;
                } else {
                    actionHTML = `<button class="gami-cos-btn buy${canAfford ? '' : ' cant-afford'}"
                        onclick="_gami_cosmeticsBuy('${item.id}')">
                        ${item.cost}g
                    </button>`;
                }

                return `
                    <div class="gami-cos-item${isEquipped ? ' active' : ''}">
                        <div class="gami-cos-preview"><span style="${previewStyle}">Aa</span></div>
                        <div class="gami-cos-name">${item.name}</div>
                        <div class="gami-cos-action">${actionHTML}</div>
                    </div>`;
            }).join('')}
        </div>`;
}

// ── Emojis tab ───────────────────────────────────────────────

function _renderEmojis(content) {
    const es = window.emojiSystem;
    if (!es) { content.innerHTML = '<div class="gami-loading">Emoji system not loaded.</div>'; return; }

    es.reloadInventory();
    const inventory = es.getInventory();
    const items     = es.getItems();
    const tiers     = es.getTiers();
    const gold      = window.gami?.profile?.gold || 0;
    const inGame    = !!document.getElementById('game-layout')?.classList.contains('active');

    const owned = items.filter(e => inventory.has(e.id));

    let html = '<div class="gami-section-title">My Emojis</div>';

    if (owned.length === 0) {
        html += `<div style="color:#ccc;font-style:italic;padding:8px 0 16px;">No emojis yet — buy some below!</div>`;
    } else {
        html += `<div class="gami-emoji-grid">`;
        for (const item of owned) {
            const cls = 'gami-emoji-btn' + (item.isText ? ' text-emoji' : '');
            if (inGame) {
                html += `<button class="${cls}" onclick="_gami_emojisUse('${item.id}')" title="${_esc(item.name)}">${_esc(item.display)}</button>`;
            } else {
                html += `<div class="${cls} inactive" title="${_esc(item.name)} (join a game to use)">${_esc(item.display)}</div>`;
            }
        }
        html += `</div>`;
        if (!inGame) html += `<div style="color:#ccc;font-size:12px;padding:4px 0 14px;">Join a game to use emojis</div>`;
    }

    html += `<div class="gami-section-title" style="margin-top:4px;">Shop <span style="color:#d9b08c;float:right;">${gold}g</span></div>`;

    for (const tier of tiers) {
        const tierItems = items.filter(e => e.tier === tier.id);
        html += `
            <div class="gami-tier-section">
                <div class="gami-tier-header" style="border-left-color:${tier.color};">
                    <span style="color:${tier.color};font-weight:bold;font-size:11px;">${tier.badge}</span>
                    <span style="color:#ccc;margin-left:6px;font-size:13px;">${tier.name}</span>
                    <span style="color:${tier.color};margin-left:auto;font-size:12px;">${tier.cost}g</span>
                </div>
                <div class="gami-emoji-shop-grid">`;
        for (const item of tierItems) {
            const isOwned = inventory.has(item.id);
            const cls = 'gami-shop-emoji' + (item.isText ? ' text-emoji' : '');
            if (isOwned) {
                html += `
                    <div class="gami-shop-item owned" title="${_esc(item.name)}">
                        <span class="${cls}">${_esc(item.display)}</span>
                        <div class="gami-shop-name">${_esc(item.name)}</div>
                        <div class="gami-shop-owned">✓</div>
                    </div>`;
            } else {
                html += `
                    <div class="gami-shop-item" title="${_esc(item.name)} — ${item.cost}g">
                        <button class="${cls}" onclick="_gami_emojisBuy('${item.id}')">${_esc(item.display)}</button>
                        <div class="gami-shop-name">${_esc(item.name)}</div>
                        <button class="gami-shop-buy-btn" style="border-color:${tier.color};color:${tier.color};"
                                onclick="_gami_emojisBuy('${item.id}')">${item.cost}g</button>
                    </div>`;
            }
        }
        html += `</div></div>`;
    }

    content.innerHTML = html;
}

// ── Badges tab ───────────────────────────────────────────────

async function _renderBadges(content) {
    const badges = await window.gami.getBadgesWithStatus();
    if (!badges.length) {
        content.innerHTML = '<div class="gami-loading">No badges available.</div>';
        return;
    }

    const cards = badges.map(b => `
        <div class="gami-badge-card ${b.earned ? 'earned' : 'locked'}" title="${_esc(b.description)}">
            <div class="gami-badge-icon">${b.earned ? b.icon : '?'}</div>
            <div class="gami-badge-name">${_esc(b.name)}</div>
            <div class="gami-badge-desc">${_esc(b.description)}</div>
            ${b.gold_reward ? `<div class="gami-badge-reward">+${b.gold_reward}g</div>` : ''}
        </div>
    `).join('');

    content.innerHTML = `<div class="gami-badges-grid">${cards}</div>`;
}

// ── Leaderboard tab ──────────────────────────────────────────

async function _renderLeaderboard(content) {
    const rows = await window.gami.getLeaderboard(10);
    if (!rows.length) {
        content.innerHTML = '<div class="gami-loading">No players yet.</div>';
        return;
    }

    const medals = ['#1', '#2', '#3'];
    const items  = rows.map((row, i) => {
        const isMe = row.user_id === window.gami.userId;
        const rank = medals[i] || `#${i + 1}`;
        return `
            <div class="gami-lb-row ${isMe ? 'gami-lb-me' : ''}">
                <span class="gami-lb-rank">${rank}</span>
                <span class="gami-lb-name">${_esc(row.display_name)}</span>
                <span class="gami-lb-xp">${(row.total_xp || 0).toLocaleString()} XP</span>
                <span class="gami-lb-level">Lv.${row.current_level}</span>
            </div>
        `;
    }).join('');

    content.innerHTML = `<div class="gami-leaderboard">${items}</div>`;
}

// ── Main-page leaderboard widget ──────────────────────────────

async function loadMainLeaderboard() {
    const el = document.getElementById('main-leaderboard-body');
    if (!el) return;
    el.innerHTML = '<div class="gami-loading">Loading…</div>';

    const raw = await window.gami?.getLeaderboard(20);
    const rows = (raw || []).filter(r => (r.total_xp || 0) > 0).slice(0, 10);
    if (!rows.length) {
        el.innerHTML = '<div class="gami-loading" style="padding:12px;">No ranked players yet.</div>';
        return;
    }

    const medals = ['#1', '#2', '#3'];
    el.innerHTML = rows.map((row, i) => {
        const isMe = row.user_id === window.gami.userId;
        const rank = medals[i] || `#${i + 1}`;
        return `
            <div class="gami-lb-row ${isMe ? 'gami-lb-me' : ''}">
                <span class="gami-lb-rank">${rank}</span>
                <span class="gami-lb-name">${_esc(row.display_name)}</span>
                <span class="gami-lb-xp">${(row.total_xp || 0).toLocaleString()} XP</span>
                <span class="gami-lb-level">Lv.${row.current_level}</span>
            </div>`;
    }).join('');
}

window.loadMainLeaderboard = loadMainLeaderboard;

// ── Profile modal action helpers (called from onclick) ────────

async function _gami_cosmeticsBuy(id) {
    await window.cosmeticsSystem.handleBuy(id);
    gami_switchTab('cosmetics');
}

function _gami_cosmeticsEquip(id) {
    window.cosmeticsSystem.handleEquip(id);
    gami_switchTab('cosmetics');
}

function _gami_emojisUse(id) {
    window.emojiSystem.useEmoji(id);
    document.getElementById('gami-panel')?.remove();
}

async function _gami_emojisBuy(id) {
    await window.emojiSystem.purchaseEmoji(id);
    gami_switchTab('emojis');
}

// ── Settings tab ─────────────────────────────────────────────

function _renderSettings(content) {
    const uiSound   = localStorage.getItem('godaigo_ui_sound')   !== 'false';
    const gameSound = localStorage.getItem('godaigo_game_sound') !== 'false';
    const crt = window.crtOverlay ? window.crtOverlay.getOptions()
                                  : { scanlines: true, vignette: true, grain: true, flicker: true };

    content.innerHTML = `
        <div class="gami-settings-list">
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">UI Sounds</div>
                    <div class="gami-settings-desc">Button click sound effects</div>
                </div>
                <button class="gami-toggle ${uiSound ? 'on' : 'off'}"
                        onclick="_gami_toggleSetting('ui_sound', this)">${uiSound ? 'ON' : 'OFF'}</button>
            </div>
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Game Sounds</div>
                    <div class="gami-settings-desc">In-game audio effects</div>
                </div>
                <button class="gami-toggle ${gameSound ? 'on' : 'off'}"
                        onclick="_gami_toggleSetting('game_sound', this)">${gameSound ? 'ON' : 'OFF'}</button>
            </div>
            <div style="font-family:var(--font-terminal);font-size:17px;color:#ccc;padding:8px 0 2px;letter-spacing:1px;">— Display —</div>
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Scanlines</div>
                    <div class="gami-settings-desc">Horizontal CRT scan-line overlay</div>
                </div>
                <button class="gami-toggle ${crt.scanlines ? 'on' : 'off'}"
                        onclick="_gami_toggleCrt('scanlines', this)">${crt.scanlines ? 'ON' : 'OFF'}</button>
            </div>
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Vignette</div>
                    <div class="gami-settings-desc">Dark edges around the screen</div>
                </div>
                <button class="gami-toggle ${crt.vignette ? 'on' : 'off'}"
                        onclick="_gami_toggleCrt('vignette', this)">${crt.vignette ? 'ON' : 'OFF'}</button>
            </div>
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Film Grain</div>
                    <div class="gami-settings-desc">Animated noise texture</div>
                </div>
                <button class="gami-toggle ${crt.grain ? 'on' : 'off'}"
                        onclick="_gami_toggleCrt('grain', this)">${crt.grain ? 'ON' : 'OFF'}</button>
            </div>
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Flicker</div>
                    <div class="gami-settings-desc">Subtle screen brightness variation</div>
                </div>
                <button class="gami-toggle ${crt.flicker ? 'on' : 'off'}"
                        onclick="_gami_toggleCrt('flicker', this)">${crt.flicker ? 'ON' : 'OFF'}</button>
            </div>
        </div>
    `;
}

function _gami_toggleCrt(key, btn) {
    if (!window.crtOverlay) return;
    const newVal = !window.crtOverlay.getOptions()[key];
    window.crtOverlay.setOption(key, newVal);
    window.crtOverlay.saveForUser(window.gami?.userId || null);
    btn.textContent = newVal ? 'ON' : 'OFF';
    btn.className   = `gami-toggle ${newVal ? 'on' : 'off'}`;
}

function _gami_toggleSetting(key, btn) {
    const current = localStorage.getItem(`godaigo_${key}`) !== 'false';
    const newVal  = !current;
    localStorage.setItem(`godaigo_${key}`, newVal ? 'true' : 'false');
    if (key === 'ui_sound')   window.uiSoundEnabled   = newVal;
    if (key === 'game_sound') window.gameSoundEnabled = newVal;
    btn.textContent = newVal ? 'ON' : 'OFF';
    btn.className   = `gami-toggle ${newVal ? 'on' : 'off'}`;
}

// ── Utility ───────────────────────────────────────────────────

function _esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
