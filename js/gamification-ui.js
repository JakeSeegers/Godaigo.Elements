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
// Populated by _renderStable(), read by _gami_stableTrainBot() — the inline
// onclick handlers below can only pass simple values (id), not a whole
// weights object, so the fetched rows are kept here for lookup by id.
let _stableDeployedCache = [];

async function _renderStable(content) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        content.innerHTML = '<div class="gami-loading">Log in to see your Stable.</div>';
        return;
    }
    const userId = session.user.id;

    const [{ data: deployed }, { data: captured }] = await Promise.all([
        supabase.from('deployed_bots')
            .select('id, nickname, weights, wins, losses, draws, is_active, captured_bot_id, owner')
            .eq('owner', userId)
            .order('id', { ascending: false }),
        supabase.from('captured_bots')
            .select('id, source_nickname, captured_at')
            .eq('owner', userId)
            .order('captured_at', { ascending: false }),
    ]);
    _stableDeployedCache = deployed || [];
    // Each source (live WEIGHTS, or a specific captured bot) can only be
    // deployed once per owner — see js/game-ui.js's Deploy button for the
    // full rationale. Used here to grey out captures that are already spent.
    const usedCapturedIds = new Set((deployed || []).map(b => b.captured_bot_id).filter(id => id != null));

    const deployedHTML = (deployed || []).length ? deployed.map(bot => {
        const decided = bot.wins + bot.losses;
        const pct = decided ? Math.round((bot.wins / decided) * 100) : 0;
        return `
            <div class="gami-stable-row">
                <span class="gami-stable-name" style="cursor:pointer;text-decoration:underline dotted;" title="View this bot's elemental attributes" onclick="_gami_showBotPetals(${bot.id})">${_esc(bot.nickname)}</span>
                <span class="gami-stable-record">${bot.wins}-${bot.losses}${bot.draws ? `-${bot.draws}` : ''} (${pct}%)</span>
                <button class="gami-stable-btn" onclick="_gami_stableTrainBot(${bot.id})">Train</button>
                <button class="gami-stable-btn${bot.is_active ? '' : ' off'}"
                        onclick="_gami_stableToggleActive(${bot.id}, ${bot.is_active})">${bot.is_active ? 'Active' : 'Retired'}</button>
            </div>`;
    }).join('') : '<div class="gami-stable-empty">No deployed bots yet — deploy one from the in-game Bot Training panel.</div>';

    const capturedHTML = (captured || []).length ? captured.map(cb => {
        const alreadyDeployed = usedCapturedIds.has(cb.id);
        return `
        <div class="gami-stable-row">
            <span class="gami-stable-name">${_esc(cb.source_nickname)}</span>
            <span class="gami-stable-record">${new Date(cb.captured_at).toLocaleDateString()}</span>
            ${alreadyDeployed
                ? `<span class="gami-stable-record">Deployed</span>`
                : `<button class="gami-stable-btn" onclick="_gami_stableDeployCaptured(${cb.id}, '${_esc(cb.source_nickname).replace(/'/g, "\\'")}')">Deploy</button>`}
        </div>`;
    }).join('') : '<div class="gami-stable-empty">No captured bots yet — try capturing one after a challenge or a win.</div>';

    content.innerHTML = `
        <div class="gami-section-title">My Deployed Bots</div>
        <div class="gami-stable-list">${deployedHTML}</div>
        <div class="gami-section-title" style="margin-top:16px;">My Captured Bots</div>
        <div class="gami-stable-list">${capturedHTML}</div>
    `;
}

async function _gami_stableToggleActive(botId, currentlyActive) {
    // One leaderboard bot per player (design 2026-07-23): active = visible on
    // the leaderboard, so activating a bot benches every other one first.
    if (!currentlyActive) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
            const { error: benchErr } = await supabase.from('deployed_bots')
                .update({ is_active: false }).eq('owner', session.user.id).neq('id', botId);
            if (benchErr) { window.gami?.notify(`Could not bench your other bots: ${benchErr.message}`, 0, 'gold'); return; }
        }
    }
    const { error } = await supabase.from('deployed_bots')
        .update({ is_active: !currentlyActive }).eq('id', botId);
    if (error) { window.gami?.notify(`Could not update bot: ${error.message}`, 0, 'gold'); return; }
    gami_switchTab('stable');
}

// Launches the in-game Bot Training panel (js/game-ui.js) pre-loaded with
// this SPECIFIC bot's weights, so a successful run writes the improvement
// back into this bot's own deployed_bots row instead of just the ambient
// live weights — see runWeightTraining()/runHillClimbTraining()'s
// opts.sourceBotId handling and openBotTrainingPanel()'s consumption of
// window._botTrainingSource for the other half of this.
function _gami_stableTrainBot(botId) {
    const bot = _stableDeployedCache.find(b => b.id === botId);
    if (!bot) { window.gami?.notify('Could not find that bot — try refreshing.', 0, 'gold'); return; }
    if (!window.BotArena) { window.gami?.notify('Bot training is not available right now.', 0, 'gold'); return; }
    if (window.BotArena.isRunning()) { window.gami?.notify('A bot job is already running — stop it first.', 0, 'gold'); return; }
    if (typeof window._openBotTrainingPanel !== 'function') { window.gami?.notify('Bot training is not available right now.', 0, 'gold'); return; }

    window.BotArena.applyWeights(bot.weights || window.BotSystem?.WEIGHTS);
    window._botTrainingSource = { id: bot.id, nickname: bot.nickname };
    document.getElementById('gami-panel')?.remove();
    window._openBotTrainingPanel();
}

async function _gami_stableDeployCaptured(capturedId, sourceNickname) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const { data: cb, error: fetchErr } = await supabase.from('captured_bots')
        .select('weights').eq('id', capturedId).eq('owner', session.user.id).single();
    if (fetchErr || !cb) { window.gami?.notify('Could not find that captured bot.', 0, 'gold'); return; }

    // Each captured bot may only be deployed once per owner, ever — the
    // Deploy button in Stable already hides already-deployed captures, but
    // this is the actual enforcement (no DB-level constraint — see
    // js/game-ui.js's deployBtn.onclick for why).
    const { data: dupes } = await supabase.from('deployed_bots')
        .select('id').eq('owner', session.user.id).eq('captured_bot_id', capturedId).limit(1);
    if (dupes?.length) { window.gami?.notify('You already deployed this captured bot.', 0, 'gold'); gami_switchTab('stable'); return; }

    // deployed_bots has unique(owner, nickname) — a straight redeploy under
    // the name it was captured with is the common case, but ask for a
    // different name rather than silently failing on the rare collision.
    let nickname = sourceNickname;
    for (let attempt = 0; attempt < 5; attempt++) {
        if (/void\s*knight/i.test(nickname)) {
            nickname = window.prompt('That name is reserved for the Void Knight itself. Pick a different name:', `${sourceNickname} ${attempt + 2}`);
            if (!nickname) return;
            continue;
        }
        const { data: newBot, error } = await supabase.from('deployed_bots').insert({
            owner: session.user.id,
            nickname,
            weights: cb.weights,
            captured_bot_id: capturedId,
        }).select('id').single();
        if (!error) {
            // One leaderboard bot per player: the fresh deploy takes the slot.
            if (newBot?.id) {
                try {
                    await supabase.from('deployed_bots').update({ is_active: false })
                        .eq('owner', session.user.id).neq('id', newBot.id);
                } catch (e) { console.warn('Could not bench other bots (continuing):', e); }
            }
            window.gami?.notify(`"${nickname}" deployed as your leaderboard bot — other players can now challenge it.`, 0, 'gold');
            gami_switchTab('stable');
            return;
        }
        if (error.code !== '23505') { window.gami?.notify(`Could not deploy: ${error.message}`, 0, 'gold'); return; }
        // Nicknames are globally unique across all players now, not just per owner.
        nickname = window.prompt(`The name "${nickname}" is already taken (bot names are unique across all players). Pick a different name:`, `${sourceNickname} ${attempt + 2}`);
        if (!nickname) return;
    }
}

// ── Leaderboard tab ──────────────────────────────────────────

// Two SEPARATE sections (Players by XP, Bots by win rate), not one
// interleaved list — bots have no XP, only a win/loss/draw record, so
// there's no shared unit to sort them against players without inventing a
// conversion factor. docs/bot-tycoon-proposal.md build-order step 3;
// choice confirmed with the user rather than assumed.
// Latest void_knight row (the CURRENT Knight is the newest row), cached so
// the inline Challenge/Train onclick handlers can read it without refetching.
let _gamiVoidKnight = null;

async function _renderLeaderboard(content) {
    content.innerHTML = '<div class="gami-loading">Loading…</div>';
    const [playerRows, botRows, vkRes] = await Promise.all([
        window.gami.getLeaderboard(10),
        window.gami.getBotLeaderboard(10),
        supabase.from('void_knight').select('*').order('id', { ascending: false }).limit(1),
    ]);
    _gamiVoidKnight = vkRes?.data?.[0] || null;
    const hideBots = localStorage.getItem('godaigo_hide_bots') === '1';

    // Reigning-champion accolade line: the last bot (and owner) to dethrone
    // the Knight keeps the title until someone else does — even if community
    // training has since pushed the Knight past that bot's strength.
    let vkChampLine = 'Undefeated — no bot holds the champion title yet.';
    if (_gamiVoidKnight?.champion_name) {
        let ownerName = '';
        if (_gamiVoidKnight.champion_owner) {
            const { data: prof } = await supabase.from('user_profiles')
                .select('display_name').eq('user_id', _gamiVoidKnight.champion_owner).limit(1);
            if (prof?.[0]?.display_name) ownerName = ` by ${_esc(prof[0].display_name)}`;
        }
        vkChampLine = `Reigning champion: <b>${_esc(_gamiVoidKnight.champion_name)}</b>${ownerName}`;
    }

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
                <span class="gami-lb-name">${_esc(bot.nickname)} <span style="font-size:11px;color:#888;font-weight:normal;">by ${_esc(bot.owner_name || 'Unknown')}</span></span>
                <span class="gami-lb-xp">${pct}%</span>
                <span class="gami-lb-level">${bot.wins}-${bot.losses}${bot.draws ? `-${bot.draws}` : ''}</span>
            </div>
        `;
    }).join('') : '<div class="gami-loading">No deployed bots yet.</div>';

    // The Void Knight card — the system-owned public leader bot everyone can
    // Challenge (dethrone it: your active bot's weights get copied into it,
    // you take the champion title + gold) or Train (public-good hill climb
    // on ITS weights, small gold bounty on a confirmed improvement).
    const vkHTML = _gamiVoidKnight ? `
        <div style="border:1px solid #9458f4;border-radius:8px;padding:10px 12px;margin-bottom:10px;background:rgba(148,88,244,0.08);">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-weight:bold;color:#c9a6ff;">⚔️ The Void Knight</span>
                <span style="font-size:11px;color:#888;">grew stronger ${new Date(_gamiVoidKnight.created_at).toLocaleDateString()}</span>
                <span style="flex:1;"></span>
                <button class="gami-stable-btn" onclick="_gami_challengeLeader()" title="Your active deployed bot plays it head-to-head — win decisively to dethrone it">Challenge</button>
                <button class="gami-stable-btn" onclick="_gami_trainLeader()" title="Hill-climb the Knight's own weights — a confirmed improvement updates it for everyone (+25 gold)">Train</button>
            </div>
            <div style="font-size:11px;color:#999;margin-top:4px;">${vkChampLine}</div>
        </div>` : '';

    const botsSection = hideBots ? '' : `
        ${vkHTML}
        <div class="section-label" style="margin-bottom:6px;">Top Bots</div>
        <div class="gami-leaderboard">${botsHTML}</div>`;

    content.innerHTML = `
        <div class="section-label" style="margin-bottom:6px;">Top Players</div>
        <div class="gami-leaderboard">${playersHTML}</div>
        <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:16px;margin-bottom:6px;">
            <label style="font-size:11px;color:#999;cursor:pointer;user-select:none;">
                <input type="checkbox" id="gami-hide-bots"${hideBots ? ' checked' : ''}> Hide bots
            </label>
        </div>
        ${botsSection}
    `;
    const hideToggle = document.getElementById('gami-hide-bots');
    if (hideToggle) hideToggle.onchange = () => {
        try { localStorage.setItem('godaigo_hide_bots', hideToggle.checked ? '1' : '0'); } catch (e) {}
        gami_switchTab('leaderboard');
    };
}

// ── The Void Knight: challenge & train ────────────────────────
// Design (2026-07-23): the Void Knight is the system-owned public leader
// bot. CHALLENGE is pure evaluation — your ACTIVE deployed bot plays a
// mirror-paired local series against it; win >=55% of decided games over
// 20 and the Knight COPIES your bot's weights (a fork — you keep evolving
// yours independently), you take the reigning-champion accolade + gold.
// No XP: XP is only ever for winning games. TRAIN routes to the Bot
// Training panel in leader mode (hill climb anchored to the Knight's own
// weights — see runHillClimbTraining's opts.leaderWeights in game-ui.js).
const GAMI_VK_CHALLENGE_GAMES = 20;
const GAMI_VK_CHALLENGE_MARGIN = 0.55;
const GAMI_VK_DETHRONE_GOLD = 50;

async function _gami_challengeLeader() {
    const vk = _gamiVoidKnight;
    if (!vk?.weights) { window.gami?.notify('The Void Knight is unreachable right now — try again later.', 0, 'gold'); return; }
    if (typeof isMultiplayer !== 'undefined' && isMultiplayer) { window.gami?.notify('Leave your online game first — the challenge plays out locally.', 0, 'gold'); return; }
    if (!window.BotArena) { window.gami?.notify('Bot systems are not loaded on this page.', 0, 'gold'); return; }
    if (window.BotArena.isRunning()) { window.gami?.notify('A bot job is already running — stop it first.', 0, 'gold'); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) { window.gami?.notify('Log in to challenge the Void Knight.', 0, 'gold'); return; }
    const { data: myBots } = await supabase.from('deployed_bots')
        .select('id, nickname, weights').eq('owner', session.user.id).eq('is_active', true)
        .order('id', { ascending: false }).limit(1);
    const myBot = myBots?.[0];
    if (!myBot?.weights) { window.gami?.notify('You need an ACTIVE deployed bot to challenge with — deploy or activate one in your Stable.', 0, 'gold'); return; }

    document.getElementById('gami-panel')?.remove();
    const status = document.createElement('div');
    status.id = 'gami-vk-challenge-status';
    status.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:10000;background:#1a1a2e;border:1px solid #9458f4;border-radius:8px;color:#ddd;font-size:12px;padding:8px 12px;box-shadow:0 4px 16px rgba(0,0,0,0.6);';
    status.textContent = `⚔️ "${myBot.nickname}" vs The Void Knight — starting…`;
    document.body.appendChild(status);

    // BotArena.run swaps live WEIGHTS per turn and doesn't restore them —
    // snapshot and put them back no matter how the series ends.
    const savedWeights = { ...window.BotSystem.WEIGHTS };
    let wins = 0, losses = 0;
    try {
        const result = await window.BotArena.run(myBot.weights, vk.weights, GAMI_VK_CHALLENGE_GAMES, Date.now() % 100000, {
            onGame: (n, total, g) => {
                // g.winner is a seat index; sides alternate each game (even
                // game number → my bot was player 0) — same mapping run() uses.
                if (g && g.winner !== null) {
                    const mineWasP0 = (n - 1) % 2 === 0;
                    if ((g.winner === 0) === mineWasP0) wins++; else losses++;
                }
                status.textContent = `⚔️ "${myBot.nickname}" vs The Void Knight — game ${n}/${total} (${wins}-${losses})`;
            },
        });
        const decided = result.aWins + result.bWins;
        const winRate = decided ? result.aWins / decided : 0;
        const record = `${result.aWins}-${result.bWins}` + (result.draws ? ` (${result.draws} draws)` : '');
        if (window.BotArena.stopRequested()) { window.gami?.notify(`Challenge stopped early (${record}) — no result recorded.`, 0, 'gold'); return; }
        const won = decided >= Math.ceil(GAMI_VK_CHALLENGE_GAMES / 2) && winRate >= GAMI_VK_CHALLENGE_MARGIN;
        if (won) {
            const { error } = await supabase.from('void_knight').insert({
                weights: myBot.weights, update_type: 'dethrone', updated_by: session.user.id,
                champion_name: myBot.nickname, champion_owner: session.user.id,
                confirm_wins: result.aWins, confirm_losses: result.bWins, confirm_draws: result.draws,
            });
            if (error) { window.gami?.notify(`Won ${record}, but could not record the dethroning: ${error.message}`, 0, 'gold'); return; }
            try {
                await supabase.rpc('award_gold', {
                    p_user_id: session.user.id, p_gold_amount: GAMI_VK_DETHRONE_GOLD,
                    p_description: `"${myBot.nickname}" dethroned the Void Knight`,
                });
            } catch (e) { console.warn('[gami-ui] dethrone gold failed:', e); }
            window.gami?.notify(`"${myBot.nickname}" DETHRONED the Void Knight ${record}! The Knight now carries your bot's weights — the title is yours until someone takes it.`, GAMI_VK_DETHRONE_GOLD, 'gold');
        } else {
            window.gami?.notify(`The Void Knight held its ground — ${record}. Train your bot and challenge again.`, 0, 'gold');
        }
    } catch (e) {
        console.error('[gami-ui] Void Knight challenge failed:', e);
        window.gami?.notify('Challenge failed — see console.', 0, 'gold');
    } finally {
        window.BotArena.applyWeights(savedWeights);
        status.remove();
    }
}

function _gami_trainLeader() {
    const vk = _gamiVoidKnight;
    if (!vk?.weights) { window.gami?.notify('The Void Knight is unreachable right now — try again later.', 0, 'gold'); return; }
    if (!window.BotArena) { window.gami?.notify('Bot systems are not loaded on this page.', 0, 'gold'); return; }
    if (window.BotArena.isRunning()) { window.gami?.notify('A bot job is already running — stop it first.', 0, 'gold'); return; }
    if (typeof window._openBotTrainingPanel !== 'function') { window.gami?.notify('Bot training is not available right now.', 0, 'gold'); return; }
    window._botTrainingLeader = { weights: vk.weights };
    document.getElementById('gami-panel')?.remove();
    window._openBotTrainingPanel();
}

// ── Bot detail: the five-element "petals" view ────────────────
// Each bot's personality shown as five petals — one per element — scored by
// how far its weights deviate from stock DEFAULT_WEIGHTS along the
// pre-validated elemental weight bundles from docs/bot-tycoon-proposal.md
// § ELEMENTAL WEIGHT-BUNDLE ITEMS. Purely descriptive (a lens on the weight
// table); 50 = stock, higher = leans into that element's personality.
const GAMI_PETAL_BUNDLES = {
    earth: { color: '#69d83a', keys: { placeEarthBlock: 1, placeSelfBlockPenalty: 1, moveFixation: 1, moveExploreGradient: -1, moveExplore: -1, placeProgress: 1, castBase: 1 } },
    water: { color: '#5894f4', keys: { evalOpponentThreat: 1, evalCommonThreat: 1, discardResponseOnly: 1 } },
    fire:  { color: '#ed1b43', keys: { placeFireThreatBreak: 1, evalActivated: -1, endTurnOnShrine: -1, moveReturnHome: 1 } },
    wind:  { color: '#ffce00', keys: { placeWindPath: 1, moveExplorePath: 1, placeEarthBlock: -1, placeFireThreatBreak: -1 } },
    void:  { color: '#9458f4', keys: { searchDepth: 1, searchBreadth: 1, evalVoidHeld: 1, shrineVoidBonus: 1 } },
};

function _gami_petalScores(weights) {
    const defaults = window.BotSystem?.DEFAULT_WEIGHTS || {};
    const scores = {};
    for (const [el, bundle] of Object.entries(GAMI_PETAL_BUNDLES)) {
        let sum = 0, n = 0;
        for (const [k, dir] of Object.entries(bundle.keys)) {
            if (typeof weights?.[k] !== 'number' || typeof defaults[k] !== 'number') continue;
            const rel = (weights[k] - defaults[k]) / (Math.abs(defaults[k]) || 1);
            sum += dir * rel; n++;
        }
        // 0.5 = stock; tanh squash keeps wildly-mutated tables on the dial
        scores[el] = n ? Math.min(1, Math.max(0, 0.5 + 0.5 * Math.tanh((sum / n) * 1.5))) : 0.5;
    }
    return scores;
}

function _gami_showBotPetals(botId) {
    const bot = _stableDeployedCache.find(b => b.id === botId);
    if (!bot) { window.gami?.notify('Could not find that bot — try refreshing.', 0, 'gold'); return; }
    document.getElementById('gami-petals-overlay')?.remove();

    const scores = _gami_petalScores(bot.weights || {});
    const order = ['earth', 'water', 'fire', 'wind', 'void'];
    const cx = 110, cy = 112, rMax = 82;
    const petals = order.map((el, i) => {
        const angle = -90 + i * 72 + 90; // earth at the top, clockwise
        const len = 18 + scores[el] * (rMax - 18);
        const c = GAMI_PETAL_BUNDLES[el].color;
        return `<g transform="rotate(${angle} ${cx} ${cy})">
            <ellipse cx="${cx}" cy="${cy - len / 2}" rx="15" ry="${len / 2}" fill="${c}" fill-opacity="0.5" stroke="${c}" stroke-width="1.5"/>
        </g>`;
    }).join('');
    const labels = order.map((el, i) => {
        const a = (-90 + i * 72 + 90) * Math.PI / 180;
        const lx = cx + Math.sin(a) * (rMax + 16);
        const ly = cy - Math.cos(a) * (rMax + 16);
        return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${GAMI_PETAL_BUNDLES[el].color}" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${el.toUpperCase()} ${(scores[el] * 100).toFixed(0)}</text>`;
    }).join('');

    const decided = bot.wins + bot.losses;
    const pct = decided ? Math.round((bot.wins / decided) * 100) : 0;
    const overlay = document.createElement('div');
    overlay.id = 'gami-petals-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10001;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:#1a1a2e;border:1px solid #444;border-radius:10px;padding:16px 20px;max-width:320px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.7);">
            <div style="font-weight:bold;color:#eee;font-size:14px;margin-bottom:2px;">${_esc(bot.nickname)}</div>
            <div style="font-size:11px;color:#999;margin-bottom:6px;">${bot.wins}-${bot.losses}${bot.draws ? `-${bot.draws}` : ''} (${pct}%) · ${bot.is_active ? 'Active on the leaderboard' : 'Benched'}</div>
            <svg viewBox="0 0 220 224" width="240" height="244" xmlns="http://www.w3.org/2000/svg">
                <circle cx="${cx}" cy="${cy}" r="${rMax}" fill="none" stroke="#333" stroke-dasharray="3 3"/>
                ${petals}
                <circle cx="${cx}" cy="${cy}" r="10" fill="#1a1a2e" stroke="#666"/>
                ${labels}
            </svg>
            <div style="font-size:10px;color:#777;margin-top:4px;">50 = stock weights. Petals show how this bot's tuning leans across the five elements.</div>
            <button class="gami-stable-btn" style="margin-top:10px;" onclick="document.getElementById('gami-petals-overlay').remove()">Close</button>
        </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
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
                    <div class="gami-keybind-row"><kbd>Space</kbd><span>Activate selected scroll</span></div>
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
