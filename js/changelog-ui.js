// changelog-ui.js: the lobby "Change Log" button and its release-notes modal.
//
// Data lives in /changelog.json (newest entry first). Each entry is
// { id, date, title, changes: [string] }. The button gets a "new" dot when
// the newest entry id differs from the one this browser last opened
// (localStorage godaigo_changelog_seen). No game deps; safe to load anywhere.
(function () {
    const SEEN_KEY = 'godaigo_changelog_seen';
    let _cache = null;

    function _esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    async function load() {
        if (_cache) return _cache;
        try {
            // no-store: a stale cached copy would hide a fresh update
            const res = await fetch('changelog.json', { cache: 'no-store' });
            const data = await res.json();
            _cache = Array.isArray(data.entries) ? data.entries : [];
        } catch (e) {
            console.warn('Change log: could not load changelog.json', e);
            _cache = [];
        }
        return _cache;
    }

    function _getSeen() {
        try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; }
    }

    function _setSeen(id) {
        try { localStorage.setItem(SEEN_KEY, id); } catch (e) {}
    }

    async function refreshBadge() {
        const btn = document.getElementById('changelog-btn');
        if (!btn) return;
        const entries = await load();
        const latest = entries[0]?.id;
        btn.classList.toggle('has-new', !!latest && latest !== _getSeen());
    }

    async function open() {
        document.getElementById('changelog-overlay')?.remove();
        const entries = await load();

        const body = entries.length
            ? entries.map(e => `
                <div class="changelog-entry">
                    <div class="changelog-entry-head">
                        <span class="changelog-entry-title">${_esc(e.title || 'Update')}</span>
                        <span class="changelog-entry-date">${_esc(e.date || '')}</span>
                    </div>
                    <ul>${(e.changes || []).map(c => `<li>${_esc(c)}</li>`).join('')}</ul>
                </div>`).join('')
            : '<div class="changelog-empty">No release notes yet.</div>';

        const overlay = document.createElement('div');
        overlay.id = 'changelog-overlay';
        overlay.innerHTML = `
            <div class="changelog-modal" role="dialog" aria-label="Change Log">
                <div class="changelog-title">Change Log</div>
                <div class="changelog-body">${body}</div>
                <button class="changelog-close">Close</button>
            </div>`;
        overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });
        overlay.querySelector('.changelog-close').addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);

        if (entries[0]?.id) _setSeen(entries[0].id);
        refreshBadge();
    }

    window.Changelog = { open, refreshBadge };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshBadge);
    } else {
        refreshBadge();
    }
})();
