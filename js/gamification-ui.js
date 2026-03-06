// ============================================================
// GAMIFICATION UI  (js/gamification-ui.js)
// Vanilla JS modal panel: Profile · Badges · Leaderboard
//
// Entry point: gami_openPanel()
//   Called from the "⚔ Stats" button in the auth bar (index.html).
// ============================================================

/** Toggle the stats panel open / closed */
function gami_openPanel() {
    const existing = document.getElementById('gami-panel');
    if (existing) { existing.remove(); return; }
    if (!window.gami?.userId) return;

    const overlay = document.createElement('div');
    overlay.id        = 'gami-panel';
    overlay.className = 'gami-overlay';
    overlay.innerHTML = `
        <div class="gami-modal" role="dialog" aria-label="Stats panel">
            <div class="gami-header">
                <h2 class="gami-title">⚔ Stats</h2>
                <button class="gami-close" aria-label="Close" onclick="document.getElementById('gami-panel').remove()">×</button>
            </div>
            <div class="gami-tabs" role="tablist">
                <button class="gami-tab active" role="tab" onclick="gami_switchTab('profile')">Profile</button>
                <button class="gami-tab"         role="tab" onclick="gami_switchTab('badges')">Badges</button>
                <button class="gami-tab"         role="tab" onclick="gami_switchTab('leaderboard')">Leaderboard</button>
            </div>
            <div id="gami-content" class="gami-content">
                <div class="gami-loading">Loading…</div>
            </div>
        </div>
    `;

    // Close on backdrop click
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    gami_switchTab('profile');
}

/** Switch the active tab and load its content */
async function gami_switchTab(tab) {
    const panel = document.getElementById('gami-panel');
    if (!panel) return;

    // Update tab button states
    const tabs   = panel.querySelectorAll('.gami-tab');
    const tabIdx = ['profile', 'badges', 'leaderboard'].indexOf(tab);
    tabs.forEach((btn, i) => btn.classList.toggle('active', i === tabIdx));

    const content = document.getElementById('gami-content');
    content.innerHTML = '<div class="gami-loading">Loading…</div>';

    try {
        if (tab === 'profile')     await _renderProfile(content);
        else if (tab === 'badges') await _renderBadges(content);
        else                       await _renderLeaderboard(content);
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
    const xpPercent   = Math.round(xpIntoLevel / 10);   // 0–100
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
                <span class="gami-stat-val">${(profile.gold || 0).toLocaleString()} 💰</span>
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

// ── Badges tab ───────────────────────────────────────────────

async function _renderBadges(content) {
    const badges = await window.gami.getBadgesWithStatus();
    if (!badges.length) {
        content.innerHTML = '<div class="gami-loading">No badges available.</div>';
        return;
    }

    const cards = badges.map(b => `
        <div class="gami-badge-card ${b.earned ? 'earned' : 'locked'}" title="${_esc(b.description)}">
            <div class="gami-badge-icon">${b.earned ? b.icon : '🔒'}</div>
            <div class="gami-badge-name">${_esc(b.name)}</div>
            <div class="gami-badge-desc">${_esc(b.description)}</div>
            ${b.xp_reward  ? `<div class="gami-badge-reward">+${b.xp_reward} XP</div>` : ''}
            ${b.gold_reward ? `<div class="gami-badge-reward">+${b.gold_reward} 💰</div>` : ''}
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

    const medals = ['🥇', '🥈', '🥉'];
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

// ── Utility ───────────────────────────────────────────────────

function _esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
