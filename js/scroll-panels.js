// ============================================
// FLOATING SCROLL PANELS
// ============================================
// Three independently floating panels: Hand | Active | Common
// Each is draggable, resizable, and collapsible.
// Replaces spellSystem.showInventory() modal.
// Triggered by #scroll-inventory dock button.
// ============================================

const ScrollPanelSystem = (() => {
    'use strict';

    // ---- Config ----
    const CAPACITY    = { hand: 2, active: 2, common: 5 };
    const STORAGE_KEY = 'godaigo_scroll_panels_v3';  // bumped so wider defaults take effect
    const EL_COLORS   = {
        earth: '#69d83a', water: '#5894f4', fire: '#ed1b43',
        wind: '#ffce00', void: '#9458f4', catacomb: '#9b59b6'
    };

    // Default positions — wider so card text is readable
    const DEFAULTS = {
        hand:   { x: 20,  y: 140, w: 300, h: 460, collapsed: false },
        active: { x: 336, y: 140, w: 300, h: 460, collapsed: false },
        common: { x: 652, y: 120, w: 320, h: 500, collapsed: false }
    };

    const panels = {};      // { id → { el, state, open } }
    let initialized = false;

    // ---- Persistence ----
    function loadStored() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
    }
    function saveState() {
        const out = {};
        Object.keys(panels).forEach(id => { out[id] = { ...panels[id].state }; });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(out)); } catch {}
    }

    // ---- Panel creation ----
    function createPanel(id, title) {
        const stored = loadStored()[id] || {};
        const state  = { ...DEFAULTS[id], ...stored };
        panels[id]   = { el: null, state, open: false };

        const el = document.createElement('div');
        el.className    = 'fsp';
        el.id           = 'fsp-' + id;
        el.dataset.panel = id;
        el.style.cssText = `left:${state.x}px; top:${state.y}px; width:${state.w}px;`;
        if (!state.collapsed) el.style.height = state.h + 'px';

        el.innerHTML = `
            <div class="fsp-header" data-drag-handle>
                <span class="fsp-title">${title}</span>
                <span class="fsp-badge" id="fsp-badge-${id}">0/0</span>
                <button class="fsp-btn fsp-collapse-btn" title="Collapse / expand">−</button>
                <button class="fsp-btn fsp-close-btn"    title="Close">✕</button>
            </div>
            <div class="fsp-body" id="fsp-body-${id}"></div>
            <div class="fsp-resize-handle" title="Drag to resize"></div>
        `;

        document.body.appendChild(el);
        panels[id].el = el;

        // Apply saved collapsed state
        if (state.collapsed) _applyCollapsed(id, true);

        // Wire buttons
        el.querySelector('.fsp-close-btn').addEventListener('click', e => { e.stopPropagation(); closePanel(id); });
        el.querySelector('.fsp-collapse-btn').addEventListener('click', e => { e.stopPropagation(); toggleCollapse(id); });

        // Drag & resize
        _makeDraggable(el, el.querySelector('[data-drag-handle]'), id);
        _makeResizable(el, el.querySelector('.fsp-resize-handle'), id);

        return el;
    }

    // ---- Drag ----
    function _makeDraggable(panel, handle, id) {
        let ox, oy, ol, ot, active = false;

        handle.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            if (e.target.classList.contains('fsp-btn')) return;
            active = true;
            ox = e.clientX; oy = e.clientY;
            ol = parseInt(panel.style.left) || 0;
            ot = parseInt(panel.style.top)  || 0;
            panel.style.transition = 'none';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        const onMove = e => {
            if (!active) return;
            const nx = Math.max(0, Math.min(window.innerWidth  - 60, ol + (e.clientX - ox)));
            const ny = Math.max(0, Math.min(window.innerHeight - 40, ot + (e.clientY - oy)));
            panel.style.left = nx + 'px';
            panel.style.top  = ny + 'px';
        };
        const onUp = () => {
            if (!active) return;
            active = false;
            document.body.style.userSelect = '';
            panels[id].state.x = parseInt(panel.style.left);
            panels[id].state.y = parseInt(panel.style.top);
            saveState();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    }

    // ---- Resize ----
    function _makeResizable(panel, handle, id) {
        let sx, sy, sw, sh, active = false;

        handle.addEventListener('mousedown', e => {
            e.stopPropagation();
            active = true;
            sx = e.clientX; sy = e.clientY;
            sw = panel.offsetWidth; sh = panel.offsetHeight;
            panel.style.transition = 'none';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        const onMove = e => {
            if (!active) return;
            const w = Math.max(180, sw + (e.clientX - sx));
            const h = Math.max(100, sh + (e.clientY - sy));
            panel.style.width  = w + 'px';
            panel.style.height = h + 'px';
        };
        const onUp = () => {
            if (!active) return;
            active = false;
            document.body.style.userSelect = '';
            panels[id].state.w = panel.offsetWidth;
            panels[id].state.h = panel.offsetHeight;
            saveState();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    }

    // ---- Collapse ----
    function _applyCollapsed(id, collapsed) {
        const { el, state } = panels[id];
        state.collapsed = collapsed;
        const body   = document.getElementById('fsp-body-' + id);
        const handle = el.querySelector('.fsp-resize-handle');
        const btn    = el.querySelector('.fsp-collapse-btn');
        if (collapsed) {
            if (body)   body.style.display   = 'none';
            if (handle) handle.style.display = 'none';
            if (btn)    btn.textContent       = '+';
            el.style.height = '';
        } else {
            if (body)   body.style.display   = '';
            if (handle) handle.style.display = '';
            if (btn)    btn.textContent       = '−';
            if (state.h) el.style.height = state.h + 'px';
        }
    }
    function toggleCollapse(id) {
        _applyCollapsed(id, !panels[id].state.collapsed);
        saveState();
    }

    // ---- Open / close ----
    function openPanel(id) {
        const p = panels[id];
        if (!p) return;
        p.open = true;
        p.el.style.display = 'flex';
        renderPanel(id);
    }

    function closePanel(id) {
        const p = panels[id];
        if (!p) return;
        p.open = false;
        p.el.style.display = 'none';
    }

    function toggle() {
        const anyOpen = Object.values(panels).some(p => p.open);
        if (anyOpen) {
            Object.keys(panels).forEach(closePanel);
        } else {
            Object.keys(panels).forEach(openPanel);
        }
    }

    // ---- Capacity badge + glow ----
    function _updateBadge(id, current, max) {
        const badge = document.getElementById('fsp-badge-' + id);
        if (badge) badge.textContent = current + '/' + max;
        const header = panels[id]?.el?.querySelector('.fsp-header');
        if (header) header.classList.toggle('fsp-over-capacity', current > max);
    }

    // ---- Scroll card builder ----
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

    function _buildCard(scrollName, area) {
        const sp = window.spellSystem;
        if (!sp) return null;

        const def = sp.patterns?.[scrollName] || window.SCROLL_DEFINITIONS?.[scrollName];
        if (!def) return null;

        const element  = typeof sp.getScrollElement === 'function'
            ? sp.getScrollElement(scrollName) : 'earth';
        const color    = EL_COLORS[element] || '#aaa';
        const iconSrc  = window.STONE_TYPES?.[element]?.img || '';
        const elLabel  = element ? element.charAt(0).toUpperCase() + element.slice(1) : '';
        const lvLabel  = def.level ? 'Lv. ' + (ROMAN[def.level] || def.level) : '';

        const canModify = (typeof isMultiplayer === 'undefined' || !isMultiplayer)
            || (typeof myPlayerIndex !== 'undefined' && typeof activePlayerIndex !== 'undefined'
                && myPlayerIndex === activePlayerIndex);

        const card = document.createElement('div');
        card.className = 'fsp-card';
        card.dataset.scrollName = scrollName;
        card.dataset.area = area;
        card.style.setProperty('--el-color', color);

        // ── Header: icon · name · level · tag ──────────────────────────
        const hdr = document.createElement('div');
        hdr.className = 'fsp-card-header';

        if (iconSrc) {
            const icon = document.createElement('img');
            icon.src = iconSrc;
            icon.className = 'fsp-card-icon';
            icon.alt = element;
            hdr.appendChild(icon);
        }

        const titleWrap = document.createElement('div');
        titleWrap.className = 'fsp-card-title';

        const nameEl = document.createElement('span');
        nameEl.className = 'fsp-card-name';
        nameEl.textContent = def.name || scrollName;
        titleWrap.appendChild(nameEl);

        const metaEl = document.createElement('span');
        metaEl.className = 'fsp-card-meta';
        metaEl.textContent = [elLabel, lvLabel].filter(Boolean).join(' · ');
        titleWrap.appendChild(metaEl);

        hdr.appendChild(titleWrap);

        if (def.isCounter) {
            const tag = document.createElement('span');
            tag.className = 'fsp-card-tag fsp-tag-counter';
            tag.textContent = 'COUNTER';
            hdr.appendChild(tag);
        } else if (def.isResponse) {
            const tag = document.createElement('span');
            tag.className = 'fsp-card-tag fsp-tag-response';
            tag.textContent = 'RESPONSE';
            hdr.appendChild(tag);
        }

        card.appendChild(hdr);

        // ── Description ─────────────────────────────────────────────────
        if (def.description) {
            const desc = document.createElement('div');
            desc.className = 'fsp-card-desc';
            desc.textContent = def.description;
            card.appendChild(desc);
        }

        // ── Stone pattern visual (scaled-down hex grid) ─────────────────
        if (def.patterns && typeof sp.createPatternVisual === 'function') {
            const patWrap = document.createElement('div');
            patWrap.className = 'fsp-card-pattern';
            try {
                const visual = sp.createPatternVisual(def, element);
                patWrap.appendChild(visual);
            } catch (e) { /* pattern rendering failed — skip */ }
            card.appendChild(patWrap);
        }

        // ── Action buttons ───────────────────────────────────────────────
        if (canModify) {
            const acts = document.createElement('div');
            acts.className = 'fsp-card-actions';

            if (area === 'hand') {
                // Hand → move to Active Area
                const toActive = document.createElement('button');
                toActive.className = 'fsp-card-btn';
                toActive.textContent = 'Move to Active Area';
                toActive.addEventListener('click', e => {
                    e.stopPropagation();
                    const dest = document.getElementById('fsp-active');
                    if (dest) animateCardMove(card, dest);
                    if (window.isTutorialMode && window.TutorialMode?.onScrollMoved) {
                        window.TutorialMode.onScrollMoved(scrollName, 'hand', 'active');
                    }
                    setTimeout(() => { sp.moveToActive(scrollName); refresh(); }, 60);
                });
                acts.appendChild(toActive);

                // Hand → move to Common Area
                const toCommon = document.createElement('button');
                toCommon.className = 'fsp-card-btn fsp-card-btn-alt';
                toCommon.textContent = 'Move to Common Area';
                toCommon.addEventListener('click', e => {
                    e.stopPropagation();
                    const dest = document.getElementById('fsp-common');
                    if (dest) animateCardMove(card, dest);
                    if (window.isTutorialMode && window.TutorialMode?.onScrollMoved) {
                        window.TutorialMode.onScrollMoved(scrollName, 'hand', 'common');
                    }
                    setTimeout(() => { sp.discardScroll(scrollName); refresh(); }, 60);
                });
                acts.appendChild(toCommon);
            }

            if (area === 'active') {
                // Active → move to Common Area
                const toCommon = document.createElement('button');
                toCommon.className = 'fsp-card-btn fsp-card-btn-alt';
                toCommon.textContent = 'Move to Common Area';
                toCommon.addEventListener('click', e => {
                    e.stopPropagation();
                    const dest = document.getElementById('fsp-common');
                    if (dest) animateCardMove(card, dest);
                    if (window.isTutorialMode && window.TutorialMode?.onScrollMoved) {
                        window.TutorialMode.onScrollMoved(scrollName, 'active', 'common');
                    }
                    setTimeout(() => { sp.discardScroll(scrollName); refresh(); }, 60);
                });
                acts.appendChild(toCommon);

                // Active → Cast (shown when pattern matches board)
                const patternMatches = typeof sp.checkPattern === 'function' && sp.checkPattern(scrollName);
                const castBtn = document.createElement('button');
                castBtn.className = 'fsp-card-btn fsp-card-btn-cast' + (patternMatches ? ' fsp-cast-ready' : ' fsp-cast-dim');
                castBtn.textContent = patternMatches ? 'Cast ✦' : 'Cast';
                castBtn.title = patternMatches ? 'Pattern matches — ready to cast!' : 'Place stones in the required pattern first';
                castBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    card.style.setProperty('--element-color', color);
                    card.classList.add('activating');
                    setTimeout(() => card.classList.remove('activating'), 400);
                    sp.castSpell();
                });
                acts.appendChild(castBtn);
            }

            if (area === 'common') {
                // Common → Cast (shown when pattern matches board)
                const patternMatches = typeof sp.checkPattern === 'function' && sp.checkPattern(scrollName);
                const castBtn = document.createElement('button');
                castBtn.className = 'fsp-card-btn fsp-card-btn-cast' + (patternMatches ? ' fsp-cast-ready' : ' fsp-cast-dim');
                castBtn.textContent = patternMatches ? 'Cast ✦' : 'Cast';
                castBtn.title = patternMatches ? 'Pattern matches — ready to cast!' : 'Place stones in the required pattern first';
                castBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    card.style.setProperty('--element-color', color);
                    card.classList.add('activating');
                    setTimeout(() => card.classList.remove('activating'), 400);
                    sp.castSpell();
                });
                acts.appendChild(castBtn);
            }

            if (acts.children.length) card.appendChild(acts);
        }

        // Click header area → open detail popup
        hdr.addEventListener('click', (e) => {
            if (e.target.closest('.fsp-card-btn')) return;
            if (typeof window.showScrollInfoPopup === 'function') {
                window.showScrollInfoPopup(scrollName, def, element);
            }
        });

        return card;
    }

    // ---- Render ----
    function renderPanel(id) {
        const sp   = window.spellSystem;
        const body = document.getElementById('fsp-body-' + id);
        if (!body || !sp) return;

        body.innerHTML = '';
        const frag = document.createDocumentFragment();

        if (id === 'hand') {
            const scrolls = [...(sp.handScrolls || [])];
            _updateBadge('hand', scrolls.length, CAPACITY.hand);
            if (!scrolls.length) {
                body.innerHTML = '<div class="fsp-empty">Hand is empty</div>';
                return;
            }
            scrolls.forEach(n => { const c = _buildCard(n, 'hand');   if (c) frag.appendChild(c); });

        } else if (id === 'active') {
            const scrolls = [...(sp.activeScrolls || [])];
            _updateBadge('active', scrolls.length, CAPACITY.active);
            if (!scrolls.length) {
                body.innerHTML = '<div class="fsp-empty">No active scrolls</div>';
                return;
            }
            scrolls.forEach(n => { const c = _buildCard(n, 'active'); if (c) frag.appendChild(c); });

        } else if (id === 'common') {
            const scrolls = typeof sp.getCommonAreaScrolls === 'function' ? sp.getCommonAreaScrolls() : [];
            _updateBadge('common', scrolls.length, CAPACITY.common);
            if (!scrolls.length) {
                body.innerHTML = '<div class="fsp-empty">Common area is empty</div>';
                return;
            }
            scrolls.forEach(n => { const c = _buildCard(n, 'common'); if (c) frag.appendChild(c); });
        }

        body.appendChild(frag);
    }

    function refresh() {
        Object.keys(panels).forEach(id => { if (panels[id].open) renderPanel(id); });
        _updateDockBtn();
    }

    function _updateDockBtn() {
        const sp = window.spellSystem;
        if (!sp) return;
        const handN   = sp.handScrolls?.size   || 0;
        const activeN = sp.activeScrolls?.size  || 0;
        const hSpan = document.getElementById('hand-count');
        const aSpan = document.getElementById('active-count');
        if (hSpan) hSpan.textContent = handN;
        if (aSpan) aSpan.textContent = activeN;

        // Light up panel buttons when their panel is open
        ['hand', 'active', 'common'].forEach(id => {
            const btn = document.getElementById('panel-btn-' + id);
            if (btn) btn.classList.toggle('fsp-dock-btn-open', !!(panels[id]?.open));
        });
    }

    // ---- Animation: card flies from source element to destination panel ----
    function animateCardMove(srcEl, destPanelEl) {
        if (!srcEl || !destPanelEl) return;

        const fromRect = srcEl.getBoundingClientRect();
        const destBody = destPanelEl.querySelector('.fsp-body');
        const toRect   = (destBody || destPanelEl).getBoundingClientRect();

        // Build ghost
        const ghost = srcEl.cloneNode(true);
        Object.assign(ghost.style, {
            position:      'fixed',
            left:          fromRect.left + 'px',
            top:           fromRect.top  + 'px',
            width:         fromRect.width + 'px',
            height:        fromRect.height + 'px',
            zIndex:        '9000',
            pointerEvents: 'none',
            margin:        '0',
            transition:    'none',
            opacity:       '1',
            boxShadow:     '0 4px 20px rgba(0,0,0,0.6)',
            borderRadius:  '4px'
        });
        document.body.appendChild(ghost);

        // Double-RAF ensures the initial position paints before the transition starts
        requestAnimationFrame(() => requestAnimationFrame(() => {
            ghost.style.transition = [
                'left 0.3s cubic-bezier(0.25,0.46,0.45,0.94)',
                'top  0.3s cubic-bezier(0.25,0.46,0.45,0.94)',
                'opacity 0.25s ease',
                'transform 0.3s ease'
            ].join(', ');
            ghost.style.left      = (toRect.left + 8)  + 'px';
            ghost.style.top       = (toRect.top  + 8)  + 'px';
            ghost.style.opacity   = '0';
            ghost.style.transform = 'scale(0.72)';
            setTimeout(() => ghost.remove(), 340);
        }));
    }

    // Animation: card falls to deck (called when a common-area scroll is displaced)
    function animateCardToDeck(srcEl) {
        if (!srcEl) return;
        const rect = srcEl.getBoundingClientRect();
        const ghost = srcEl.cloneNode(true);
        Object.assign(ghost.style, {
            position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
            width: rect.width + 'px', height: rect.height + 'px',
            zIndex: '9000', pointerEvents: 'none', margin: '0',
            transition: 'none', opacity: '1'
        });
        document.body.appendChild(ghost);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            ghost.style.transition = 'top 0.38s ease-in, opacity 0.3s ease, transform 0.38s ease';
            ghost.style.top       = (window.innerHeight + 60) + 'px';
            ghost.style.opacity   = '0';
            ghost.style.transform = 'scale(0.55) rotate(8deg)';
            setTimeout(() => ghost.remove(), 420);
        }));
    }

    // ---- Init ----
    function init() {
        if (initialized) return;
        initialized = true;

        createPanel('hand',   'Hand');
        createPanel('active', 'Active');
        createPanel('common', 'Common');

        // Wire the three dock panel buttons
        ['hand', 'active', 'common'].forEach(id => {
            const btn = document.getElementById('panel-btn-' + id);
            if (btn) btn.addEventListener('click', e => {
                e.preventDefault();
                if (panels[id].open) { closePanel(id); } else { openPanel(id); }
                _updateDockBtn();
            });
        });

        // Override spellSystem.showInventory so Transmute and other callers use panels
        const hookSpell = () => {
            if (!window.spellSystem) return false;
            window.spellSystem.showInventory = () => {
                Object.keys(panels).forEach(id => { if (!panels[id].open) openPanel(id); });
                refresh();
            };
            return true;
        };

        if (!hookSpell()) {
            const t = setInterval(() => { if (hookSpell()) clearInterval(t); }, 400);
        }

        // ── Hover preview: enlarged card that floats outside the panel ──────
        _initCardHoverPreview();

        // Expose globally
        window.ScrollPanelSystem = { toggle, refresh, openPanel, closePanel, animateCardMove, animateCardToDeck };
    }

    // ---- Hover preview panel ----
    function _initCardHoverPreview() {
        const preview = document.createElement('div');
        preview.className = 'fsp-card-preview';
        preview.style.display = 'none';
        document.body.appendChild(preview);

        let hideTimer = null;

        function showPreview(card) {
            clearTimeout(hideTimer);

            // Clone the card DOM (fast) then replace the pattern with a fresh
            // animated instance — cloneNode gives a static snapshot, not live animation
            const clone = card.cloneNode(true);
            clone.querySelector('.fsp-card-actions')?.remove();
            const elColor = card.style.getPropertyValue('--el-color');
            if (elColor) clone.style.setProperty('--el-color', elColor);

            // Rebuild pattern visual so cycling animations run properly
            const scrollName = card.dataset.scrollName;
            const sp = window.spellSystem;
            if (scrollName && sp) {
                const def = sp.patterns?.[scrollName] || window.SCROLL_DEFINITIONS?.[scrollName];
                const element = typeof sp.getScrollElement === 'function'
                    ? sp.getScrollElement(scrollName) : 'earth';
                const patWrap = clone.querySelector('.fsp-card-pattern');
                if (patWrap && def?.patterns && typeof sp.createPatternVisual === 'function') {
                    patWrap.innerHTML = '';
                    try {
                        const freshVisual = sp.createPatternVisual(def, element);
                        patWrap.appendChild(freshVisual);
                    } catch (e) {}
                }
            }

            preview.innerHTML = '';
            preview.appendChild(clone);
            preview.style.display = 'block';
            preview.style.setProperty('--el-color', elColor || '#888');

            // Position: prefer to the right of the parent panel; fall back to left
            const cardRect  = card.getBoundingClientRect();
            const panelEl   = card.closest('.fsp');
            const panelRect = panelEl ? panelEl.getBoundingClientRect() : cardRect;

            const previewW = 480;
            const gap      = 14;
            let left = panelRect.right + gap;
            if (left + previewW > window.innerWidth - 8) {
                left = panelRect.left - previewW - gap;
            }
            let top = cardRect.top;
            // Keep preview within viewport vertically
            const maxTop = window.innerHeight - preview.offsetHeight - 8;
            if (top > maxTop) top = Math.max(8, maxTop);

            preview.style.left = left + 'px';
            preview.style.top  = top  + 'px';
        }

        function hidePreview() {
            hideTimer = setTimeout(() => { preview.style.display = 'none'; }, 80);
        }

        // Delegation — works for dynamically rendered cards
        document.addEventListener('mouseover', e => {
            const card = e.target.closest('.fsp-card');
            if (card && card.closest('.fsp')) {   // only cards inside a panel (not the preview itself)
                showPreview(card);
            }
        });
        document.addEventListener('mouseout', e => {
            const card = e.target.closest('.fsp-card');
            if (card && card.closest('.fsp')) {
                hidePreview();
            }
        });
        // Keep preview alive while the mouse is over it
        preview.addEventListener('mouseover', () => clearTimeout(hideTimer));
        preview.addEventListener('mouseout',  hidePreview);
    }

    // Boot after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOMContentLoaded already fired; wait a tick for game-ui.js to set onclick
        setTimeout(init, 0);
    }

    return { init, toggle, refresh, openPanel, closePanel, animateCardMove, animateCardToDeck };
})();
