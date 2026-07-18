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
                <button class="gami-tab"        role="tab" onclick="gami_switchTab('shop')">Shop</button>
                <button class="gami-tab"        role="tab" onclick="gami_switchTab('stable')">Stable</button>
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
    gami_openPanelOnTab('settings');
}

/** Open the panel directly on a given tab (auth-bar Shop/Stable buttons,
 *  gami_openSettings). Toggles closed if already open on that same tab,
 *  otherwise switches to it — mirrors gami_openPanel()'s own toggle. */
function gami_openPanelOnTab(tab) {
    const existing = document.getElementById('gami-panel');
    if (existing) {
        const activeTab = existing.querySelector('.gami-tab.active');
        const label = { profile: 'Stats', cosmetics: 'Colours', emojis: 'Emojis', badges: 'Badges',
                         shop: 'Shop', stable: 'Stable', leaderboard: 'Board', settings: 'Settings' }[tab];
        if (activeTab && activeTab.textContent.trim() === label) {
            existing.remove();
        } else {
            gami_switchTab(tab);
        }
        return;
    }
    // gami_openPanel() ends on 'profile'; immediately switch to the target tab
    gami_openPanel();
    gami_switchTab(tab);
}

/** Switch the active tab and load its content */
async function gami_switchTab(tab) {
    const panel = document.getElementById('gami-panel');
    if (!panel) return;

    const tabs   = panel.querySelectorAll('.gami-tab');
    const tabIdx = ['profile', 'cosmetics', 'emojis', 'badges', 'shop', 'stable', 'leaderboard', 'settings'].indexOf(tab);
    tabs.forEach((btn, i) => btn.classList.toggle('active', i === tabIdx));

    const content = document.getElementById('gami-content');
    content.innerHTML = '<div class="gami-loading">Loading…</div>';

    try {
        if      (tab === 'profile')     await _renderProfile(content);
        else if (tab === 'cosmetics')        _renderCosmetics(content);
        else if (tab === 'emojis')           _renderEmojis(content);
        else if (tab === 'badges')      await _renderBadges(content);
        else if (tab === 'shop')        await _renderShop(content);
        else if (tab === 'stable')      await _renderStable(content);
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

// ── Shop tab ─────────────────────────────────────────────────

// docs/bot-tycoon-proposal.md: Capture Stones are sold here rather than
// buried in the in-game Bot Training panel — the user explicitly asked for
// this move ("they should be in the shop"). USING a stone stays contextual
// to wherever the capture opportunity happens (Bot Training's post-challenge
// flow, the win-screen picker) — only the purchase moved.
const GAMI_STONE_COST = 30; // matches the cost already established alongside the challenge-reward economy (game-ui.js)

async function _renderShop(content) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        content.innerHTML = '<div class="gami-loading">Log in to visit the shop.</div>';
        return;
    }
    const { data: profile } = await supabase.from('user_profiles')
        .select('gold, capture_stones').eq('user_id', session.user.id).single();
    const gold   = profile?.gold || 0;
    const stones = profile?.capture_stones || 0;
    const canAfford = gold >= GAMI_STONE_COST;

    content.innerHTML = `
        <div class="gami-cos-header">
            <span style="color:#eee;font-size:15px;font-weight:bold;">Shop</span>
            <span style="color:#d9b08c;font-size:14px;">${gold}g</span>
        </div>
        <div class="gami-section-title" style="margin-top:8px;">Capture Stones</div>
        <div style="color:#999;font-size:12px;margin-bottom:10px;">
            Use a stone after challenging a bot, or right on the win screen after
            a game with real bots, to try copying it into your Stable. The closer
            the fight, the better your odds — consumed whether the attempt
            succeeds or not.
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
            <span style="color:#ddd;font-size:13px;">You have <b>${stones}</b> Capture Stone${stones === 1 ? '' : 's'}.</span>
            <button id="gami-shop-buy-stone" class="gami-cos-btn buy${canAfford ? '' : ' cant-afford'}">${GAMI_STONE_COST}g</button>
        </div>
    `;
    document.getElementById('gami-shop-buy-stone').onclick = () => _gami_shopBuyStone(session.user.id, stones);
}

async function _gami_shopBuyStone(userId, currentStones) {
    const btn = document.getElementById('gami-shop-buy-stone');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
        // Same trick the existing emoji/cosmetics shops already use for gold
        // deduction — award_gold with a negative amount.
        const { error: goldErr } = await supabase.rpc('award_gold', {
            p_user_id: userId, p_gold_amount: -GAMI_STONE_COST,
            p_description: 'Bought a Capture Stone',
        });
        if (goldErr) { window.gami?.notify(`Could not buy stone: ${goldErr.message}`, 0, 'gold'); return; }
        const { error: stoneErr } = await supabase.from('user_profiles')
            .update({ capture_stones: currentStones + 1 }).eq('user_id', userId);
        if (stoneErr) { window.gami?.notify(`Gold was spent but the stone count update failed: ${stoneErr.message}`, 0, 'gold'); return; }
        window.gami?.notify('Bought a Capture Stone', -GAMI_STONE_COST, 'gold');
    } catch (e) {
        console.error('[gami-ui] buy stone failed:', e);
        window.gami?.notify('Could not buy stone — see console.', 0, 'gold');
    } finally {
        gami_switchTab('shop'); // repaint with fresh gold/stone counts
    }
}

// ── Stable tab ───────────────────────────────────────────────

// "My Deployed Bots" (retire/reactivate a published bot) and "My Captured
// Bots" (redeploy one from your collection under a new name). Deliberately
// NO training entry point here — the user asked to defer that mechanism to
// a later discussion ("we'll talk about the training mechanism").
async function _renderStable(content) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        content.innerHTML = '<div class="gami-loading">Log in to see your Stable.</div>';
        return;
    }
    const userId = session.user.id;

    const [{ data: deployed }, { data: captured }] = await Promise.all([
        supabase.from('deployed_bots')
            .select('id, nickname, wins, losses, draws, is_active')
            .eq('owner', userId)
            .order('id', { ascending: false }),
        supabase.from('captured_bots')
            .select('id, source_nickname, captured_at')
            .eq('owner', userId)
            .order('captured_at', { ascending: false }),
    ]);

    const deployedHTML = (deployed || []).length ? deployed.map(bot => {
        const decided = bot.wins + bot.losses;
        const pct = decided ? Math.round((bot.wins / decided) * 100) : 0;
        return `
            <div class="gami-stable-row">
                <span class="gami-stable-name">${_esc(bot.nickname)}</span>
                <span class="gami-stable-record">${bot.wins}-${bot.losses}${bot.draws ? `-${bot.draws}` : ''} (${pct}%)</span>
                <button class="gami-stable-btn${bot.is_active ? '' : ' off'}"
                        onclick="_gami_stableToggleActive(${bot.id}, ${bot.is_active})">${bot.is_active ? 'Active' : 'Retired'}</button>
            </div>`;
    }).join('') : '<div class="gami-stable-empty">No deployed bots yet — deploy one from the in-game Bot Training panel.</div>';

    const capturedHTML = (captured || []).length ? captured.map(cb => `
        <div class="gami-stable-row">
            <span class="gami-stable-name">${_esc(cb.source_nickname)}</span>
            <span class="gami-stable-record">${new Date(cb.captured_at).toLocaleDateString()}</span>
            <button class="gami-stable-btn" onclick="_gami_stableDeployCaptured(${cb.id}, '${_esc(cb.source_nickname).replace(/'/g, "\\'")}')">Deploy</button>
        </div>`).join('') : '<div class="gami-stable-empty">No captured bots yet — try capturing one after a challenge or a win.</div>';

    content.innerHTML = `
        <div class="gami-section-title">My Deployed Bots</div>
        <div class="gami-stable-list">${deployedHTML}</div>
        <div class="gami-section-title" style="margin-top:16px;">My Captured Bots</div>
        <div class="gami-stable-list">${capturedHTML}</div>
    `;
}

async function _gami_stableToggleActive(botId, currentlyActive) {
    const { error } = await supabase.from('deployed_bots')
        .update({ is_active: !currentlyActive }).eq('id', botId);
    if (error) { window.gami?.notify(`Could not update bot: ${error.message}`, 0, 'gold'); return; }
    gami_switchTab('stable');
}

async function _gami_stableDeployCaptured(capturedId, sourceNickname) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const { data: cb, error: fetchErr } = await supabase.from('captured_bots')
        .select('weights').eq('id', capturedId).eq('owner', session.user.id).single();
    if (fetchErr || !cb) { window.gami?.notify('Could not find that captured bot.', 0, 'gold'); return; }

    // deployed_bots has unique(owner, nickname) — a straight redeploy under
    // the name it was captured with is the common case, but ask for a
    // different name rather than silently failing on the rare collision.
    let nickname = sourceNickname;
    for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await supabase.from('deployed_bots').insert({
            owner: session.user.id,
            nickname,
            weights: cb.weights,
        });
        if (!error) {
            window.gami?.notify(`"${nickname}" deployed — other players can now challenge it.`, 0, 'gold');
            gami_switchTab('stable');
            return;
        }
        if (error.code !== '23505') { window.gami?.notify(`Could not deploy: ${error.message}`, 0, 'gold'); return; }
        nickname = window.prompt(`You already have a bot named "${nickname}". Pick a different name:`, `${sourceNickname} ${attempt + 2}`);
        if (!nickname) return;
    }
}

// ── Leaderboard tab ──────────────────────────────────────────

// Two SEPARATE sections (Players by XP, Bots by win rate), not one
// interleaved list — bots have no XP, only a win/loss/draw record, so
// there's no shared unit to sort them against players without inventing a
// conversion factor. docs/bot-tycoon-proposal.md build-order step 3;
// choice confirmed with the user rather than assumed.
async function _renderLeaderboard(content) {
    content.innerHTML = '<div class="gami-loading">Loading…</div>';
    const [playerRows, botRows] = await Promise.all([
        window.gami.getLeaderboard(10),
        window.gami.getBotLeaderboard(10),
    ]);

    const medals = ['#1', '#2', '#3'];

    const playersHTML = playerRows.length ? playerRows.map((row, i) => {
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
    }).join('') : '<div class="gami-loading">No players yet.</div>';

    // win_rate is (wins-losses)/decided, generated column-shaped — the
    // headline number here is a plain win PERCENTAGE instead (more readable
    // at a glance), computed from the same wins/losses columns.
    const botsHTML = botRows.length ? botRows.map((bot, i) => {
        const isMine = bot.owner === window.gami.userId;
        const decided = bot.wins + bot.losses;
        const pct = decided ? Math.round((bot.wins / decided) * 100) : 0;
        const rank = medals[i] || `#${i + 1}`;
        return `
            <div class="gami-lb-row ${isMine ? 'gami-lb-me' : ''}">
                <span class="gami-lb-rank">${rank}</span>
                <span class="gami-lb-name">${_esc(bot.nickname)}</span>
                <span class="gami-lb-xp">${pct}%</span>
                <span class="gami-lb-level">${bot.wins}-${bot.losses}${bot.draws ? `-${bot.draws}` : ''}</span>
            </div>
        `;
    }).join('') : '<div class="gami-loading">No deployed bots yet.</div>';

    content.innerHTML = `
        <div class="section-label" style="margin-bottom:6px;">Top Players</div>
        <div class="gami-leaderboard">${playersHTML}</div>
        <div class="section-label" style="margin-top:16px;margin-bottom:6px;">Top Bots</div>
        <div class="gami-leaderboard">${botsHTML}</div>
    `;
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
    const music     = localStorage.getItem('godaigo_music')       !== 'false';
    const joytoneMuted = window.JoytoneBridge ? window.JoytoneBridge.isMuted()
                                              : localStorage.getItem('godaigo_joytone_muted') === 'true';
    const joytoneVol   = Math.round((window.JoytoneBridge ? window.JoytoneBridge.getVolume() : 1) * 100);
    const crt = window.crtOverlay ? window.crtOverlay.getOptions()
                                  : { scanlines: true, vignette: true, grain: true, flicker: true };

    content.innerHTML = `
        <div class="gami-settings-list">
            <div class="gami-settings-section-label">— Audio —</div>
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
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Music</div>
                    <div class="gami-settings-desc">Login screen background music</div>
                </div>
                <button class="gami-toggle ${music ? 'on' : 'off'}"
                        onclick="_gami_toggleSetting('music', this)">${music ? 'ON' : 'OFF'}</button>
            </div>
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Adaptive Music</div>
                    <div class="gami-settings-desc">In-game Joytone soundtrack (grows as tiles flip) — only affects you</div>
                </div>
                <button class="gami-toggle ${joytoneMuted ? 'off' : 'on'}"
                        onclick="_gami_toggleJoytoneMute(this)">${joytoneMuted ? 'OFF' : 'ON'}</button>
            </div>
            <div class="gami-settings-row">
                <div class="gami-settings-label">
                    <div class="gami-settings-name">Adaptive Music Volume</div>
                    <div class="gami-settings-desc">Your personal volume for the Joytone soundtrack</div>
                </div>
                <input type="range" min="0" max="100" step="1" value="${joytoneVol}"
                       style="width:110px;accent-color:#5566cc;cursor:pointer"
                       oninput="_gami_joytoneVolume(this)">
            </div>
            <div class="gami-settings-section-label">— Display —</div>
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

            <div class="gami-settings-section-label">— Keyboard Controls —</div>
            <div class="gami-keybind-guide">
                <div class="gami-keybind-group">
                    <div class="gami-keybind-group-title">Board Actions</div>
                    <div class="gami-keybind-row"><kbd>X</kbd><span>End turn</span></div>
                    <div class="gami-keybind-row"><kbd>Enter</kbd><span>Place tile or move pawn (start / confirm)</span></div>
                    <div class="gami-keybind-row"><kbd>1</kbd><span>Void stone preview</span></div>
                    <div class="gami-keybind-row"><kbd>2</kbd><span>Wind stone preview</span></div>
                    <div class="gami-keybind-row"><kbd>3</kbd><span>Fire stone preview</span></div>
                    <div class="gami-keybind-row"><kbd>4</kbd><span>Water stone preview</span></div>
                    <div class="gami-keybind-row"><kbd>5</kbd><span>Earth stone preview</span></div>
                    <div class="gami-keybind-row"><kbd>T</kbd><span>Catacomb teleport preview (T again to confirm)</span></div>
                    <div class="gami-keybind-row"><kbd>← →</kbd><span>Cycle positions or scroll cards</span></div>
                    <div class="gami-keybind-row"><kbd>Esc</kbd><span>Cancel any active preview or navigation</span></div>
                </div>
                <div class="gami-keybind-group">
                    <div class="gami-keybind-group-title">Panel Toggles</div>
                    <div class="gami-keybind-row"><kbd>H</kbd><span>Toggle Hand panel</span></div>
                    <div class="gami-keybind-row"><kbd>A</kbd><span>Toggle Active panel</span></div>
                    <div class="gami-keybind-row"><kbd>C</kbd><span>Toggle Common panel</span></div>
                    <div class="gami-keybind-row"><kbd>Shift+J+T</kbd><span>Toggle Joytone music sequencer</span></div>
                </div>
                <div class="gami-keybind-group">
                    <div class="gami-keybind-group-title">Scroll Navigation</div>
                    <div class="gami-keybind-row"><kbd>Q</kbd><span>Navigate Hand scrolls</span></div>
                    <div class="gami-keybind-row"><kbd>W</kbd><span>Navigate Active scrolls</span></div>
                    <div class="gami-keybind-row"><kbd>E</kbd><span>Navigate Common scrolls</span></div>
                    <div class="gami-keybind-row"><kbd>← →</kbd><span>Cycle cards while in nav mode</span></div>
                    <div class="gami-keybind-row"><kbd>Enter</kbd><span>Move Hand card → Active</span></div>
                    <div class="gami-keybind-row"><kbd>Tab</kbd><span>Move card → Common Area</span></div>
                    <div class="gami-keybind-row"><kbd>Space</kbd><span>Cast selected scroll</span></div>
                    <div class="gami-keybind-row"><kbd>Esc</kbd><span>Exit navigation</span></div>
                </div>
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

function _gami_toggleJoytoneMute(btn) {
    const newMuted = !window.JoytoneBridge?.isMuted();
    window.JoytoneBridge?.setMuted(newMuted);
    btn.textContent = newMuted ? 'OFF' : 'ON';
    btn.className   = `gami-toggle ${newMuted ? 'off' : 'on'}`;
}

// Called by joytone-bridge.js when the Joytone popup's OWN ⏻ power button
// changes state, so this toggle reflects it even though the click didn't
// come from here. No-op if the Settings tab (or a different tab within it)
// isn't currently open — there's nothing to repaint.
window._gami_refreshJoytoneToggle = function () {
    const btn = document.querySelector('#gami-panel [onclick^="_gami_toggleJoytoneMute"]');
    if (!btn) return;
    const m = window.JoytoneBridge?.isMuted();
    btn.textContent = m ? 'OFF' : 'ON';
    btn.className   = `gami-toggle ${m ? 'off' : 'on'}`;
};

function _gami_joytoneVolume(input) {
    window.JoytoneBridge?.setVolume((+input.value || 0) / 100);
}

function _gami_toggleSetting(key, btn) {
    const current = localStorage.getItem(`godaigo_${key}`) !== 'false';
    const newVal  = !current;
    localStorage.setItem(`godaigo_${key}`, newVal ? 'true' : 'false');
    if (key === 'ui_sound')   window.uiSoundEnabled   = newVal;
    if (key === 'game_sound') window.gameSoundEnabled = newVal;
    if (key === 'music') {
        window.musicEnabled = newVal;
        if (!newVal) {
            window.SoundSystem?.fadeOutLoginMusic();
        } else {
            // Only restart if currently on the lobby/login screen
            const lw = document.getElementById('lobby-wrapper');
            if (lw && lw.style.display !== 'none') {
                window.SoundSystem?.startLoginMusic();
            }
        }
    }
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
