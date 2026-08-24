// ============================================
// THE HERMIT — HUD layout editor (dev tool)
// ============================================
// Lets you drag the buttons/indicators in the dock bar (bottom) and the
// HUD bar (top) around by feel, add resizable spacer blocks to open up
// breathing room between groups, persists the result across reloads
// (localStorage), and exports it as JSON so a chosen layout can be
// hardcoded back into index.html permanently.
//
// Open/close: Shift+H, or the "TheHermit: Layout Editor" button in the
// hidden cheat panel (5 clicks on the AP label — see game-ui.js).
//
// Not a general-purpose page editor — it only knows about the specific
// buttons/indicators listed in ZONES below (each already a real element
// in index.html) plus any spacer blocks you add yourself. Reordering
// happens by physically moving DOM nodes (appendChild/insertBefore)
// within one of the four flex containers tracked in ZONES; the browser's
// own flex layout does the rest, so this needs no coordinate math and
// can't produce an invalid state.
// ============================================

(function () {
    'use strict';

    const STORAGE_KEY = 'godaigo_hermit_layout_v1';

    // zone.id is just a label used in the exported JSON / localStorage —
    // zone.selector is how the container is actually found in the DOM.
    // itemIds lists every button/indicator this tool knows how to move in
    // that zone; anything not listed here (other than spacer blocks, which
    // are tracked separately via data-hermit-spacer) is left completely alone.
    const ZONES = [
        {
            id: 'dock-actions',
            selector: '.dock-actions',
            itemIds: [
                'hud-scroll-decks-pips', 'panel-btn-hand', 'panel-btn-active',
                'panel-btn-common', 'panel-btn-opponents', 'cast-spell',
                'undo-move', 'dock-turn-indicator', 'end-turn', 'elemental-stones-btn',
            ],
        },
        {
            id: 'hud-left',
            selector: '.hud-section.left',
            itemIds: ['leave-game', 'scroll-reference-btn', 'panel-btn-gamelog'],
        },
        {
            id: 'hud-center',
            selector: '.hud-section.center',
            itemIds: ['hud-shrine-progress'],
        },
        {
            id: 'hud-right',
            selector: '.hud-section.right',
            itemIds: [
                'hud-ap-pips', 'hud-ap-container', 'hud-timer',
                'emoji-panel-btn', 'cosmetics-panel-btn', 'settings-panel-btn',
            ],
        },
    ];

    function zoneEl(zone) { return document.querySelector(zone.selector); }

    // One-time DOM cleanup: every tracked item becomes a direct child of its
    // zone container, regardless of whatever wrapper divs index.html nested
    // it in (only real case today: .hud-left's 3 buttons live inside a
    // .hud-player wrapper). The drag-reorder logic below only reasons about
    // direct children of a zone, so this has to hold before edit mode, saved-
    // layout restore, or export can work correctly.
    function normalizeDOM() {
        ZONES.forEach(zone => {
            const container = zoneEl(zone);
            if (!container) return;
            zone.itemIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.parentElement !== container) container.appendChild(el);
            });
        });
        // Clean up wrapper divs left empty by the reparenting above (today:
        // .hud-section.left's original .hud-player wrapper).
        document.querySelectorAll('.hud-player').forEach(el => {
            if (!el.children.length && !el.id) el.remove();
        });
    }

    function allTrackedIds() { return ZONES.flatMap(z => z.itemIds); }

    // ---- Spacer blocks ----
    // Purely visual flex items with no game function — just breathing room
    // you can drop between groups of buttons. Not part of index.html; they
    // only exist once you add one, and are recreated from localStorage on
    // load. Width-adjustable in edit mode via the +/- controls, deletable
    // via the ×; invisible chrome-wise outside edit mode (see ensureStyle).
    let spacerCounter = 0;
    const MIN_SPACER = 8, MAX_SPACER = 240, SPACER_STEP = 8;

    function createSpacer(width) {
        width = Math.min(MAX_SPACER, Math.max(MIN_SPACER, width || 24));
        const el = document.createElement('div');
        el.className = 'hermit-spacer';
        el.id = 'hermit-spacer-' + (Date.now().toString(36)) + '-' + (spacerCounter++);
        el.dataset.hermitSpacer = '1';
        el.dataset.hermitSpacerWidth = String(width);
        Object.assign(el.style, { width: width + 'px', flexShrink: '0', alignSelf: 'stretch', position: 'relative' });

        const controls = document.createElement('div');
        controls.className = 'hermit-spacer-controls';
        Object.assign(controls.style, {
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
            display: 'none', gap: '2px', marginBottom: '2px', whiteSpace: 'nowrap',
        });

        function ctrlBtn(label, title, onClick) {
            const b = document.createElement('button');
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                width: '18px', height: '18px', lineHeight: '16px', padding: '0',
                fontSize: '11px', background: '#2d2d44', color: '#ffce00',
                border: '1px solid #665', borderRadius: '3px', cursor: 'pointer',
            });
            // stopPropagation so clicking a control doesn't get swallowed by
            // the spacer's own drag handling.
            b.addEventListener('mousedown', e => e.stopPropagation());
            b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
            return b;
        }

        controls.appendChild(ctrlBtn('−', 'Shrink', () => resizeSpacer(el, -SPACER_STEP)));
        controls.appendChild(ctrlBtn('+', 'Grow', () => resizeSpacer(el, SPACER_STEP)));
        controls.appendChild(ctrlBtn('×', 'Remove spacer', () => { el.remove(); saveCurrentLayout(); }));
        el.appendChild(controls);

        if (editing) wireDraggable(el);
        return el;
    }

    function resizeSpacer(el, delta) {
        const next = Math.min(MAX_SPACER, Math.max(MIN_SPACER, parseInt(el.dataset.hermitSpacerWidth, 10) + delta));
        el.dataset.hermitSpacerWidth = String(next);
        el.style.width = next + 'px';
        saveCurrentLayout();
    }

    // Reads the saved {zoneId: [entries in order]} map and moves/creates
    // each element into place. A plain string entry is a tracked static
    // item's id — appendChild on an already-attached node MOVES it, so
    // replaying ids in saved order reproduces that exact order, and an id
    // saved under a different zone than normalizeDOM's default is a real
    // cross-zone move (dock button parked in the HUD bar, etc.), not just a
    // same-zone reorder. A {spacer:true, width} entry has no pre-existing
    // element — one is created fresh each load.
    function applySavedLayout() {
        let saved;
        try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { saved = null; }
        if (!saved) return;
        const tracked = allTrackedIds();
        ZONES.forEach(zone => {
            const container = zoneEl(zone);
            const order = saved[zone.id];
            if (!container || !Array.isArray(order)) return;
            order.forEach(entry => {
                if (entry && typeof entry === 'object' && entry.spacer) {
                    container.appendChild(createSpacer(entry.width));
                } else if (typeof entry === 'string' && tracked.includes(entry)) {
                    const el = document.getElementById(entry);
                    if (el) container.appendChild(el);
                }
            });
        });
    }

    function serializeChild(el) {
        if (el.dataset.hermitSpacer !== undefined) {
            return { spacer: true, width: parseInt(el.dataset.hermitSpacerWidth, 10) || 24 };
        }
        return el.id;
    }

    function currentLayout() {
        const layout = {};
        ZONES.forEach(zone => {
            const container = zoneEl(zone);
            if (!container) { layout[zone.id] = []; return; }
            // Filter against the static itemIds list (plus any spacer) —
            // not the live data-hermit-item attribute, which is only set
            // while edit mode is actually on, and this needs to work from
            // the console (window.TheHermit.exportLayout()) without
            // opening the panel first.
            layout[zone.id] = Array.from(container.children)
                .filter(el => zone.itemIds.includes(el.id) || el.dataset.hermitSpacer !== undefined)
                .map(serializeChild);
        });
        return layout;
    }

    function saveCurrentLayout() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentLayout())); } catch {}
    }

    // ---- Drag-to-reorder ----
    let draggedEl = null;
    let editing   = false;

    // Standard "which sibling should the dragged element land before"
    // recipe for a horizontal flex row, using the mouse's X position against
    // each candidate's own midpoint.
    function elementAfterDropPoint(container, x) {
        const candidates = Array.from(container.querySelectorAll(':scope > [data-hermit-item]'))
            .filter(el => el !== draggedEl);
        return candidates.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: -Infinity, element: null }).element;
    }

    function onDragStart(e) {
        draggedEl = e.currentTarget;
        draggedEl.classList.add('hermit-dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Firefox requires data actually be set for the drag to start.
        e.dataTransfer.setData('text/plain', draggedEl.id || '');
    }

    function onDragEnd() {
        if (draggedEl) draggedEl.classList.remove('hermit-dragging');
        draggedEl = null;
        saveCurrentLayout();
    }

    function onZoneDragOver(e) {
        if (!draggedEl) return;
        e.preventDefault();
        const container = e.currentTarget;
        const after = elementAfterDropPoint(container, e.clientX);
        if (after == null) container.appendChild(draggedEl);
        else if (after !== draggedEl.nextSibling) container.insertBefore(draggedEl, after);
    }

    function onZoneDrop(e) { e.preventDefault(); }

    // Shared by static tracked items and spacer blocks alike.
    function wireDraggable(el) {
        el.dataset.hermitItem = '1';
        el.draggable = true;
        el.addEventListener('dragstart', onDragStart);
        el.addEventListener('dragend', onDragEnd);
    }
    function unwireDraggable(el) {
        delete el.dataset.hermitItem;
        el.draggable = false;
        el.removeEventListener('dragstart', onDragStart);
        el.removeEventListener('dragend', onDragEnd);
    }

    function enterEditMode() {
        if (editing) return;
        editing = true;
        normalizeDOM();
        document.body.classList.add('hermit-edit-mode');
        allTrackedIds().forEach(id => { const el = document.getElementById(id); if (el) wireDraggable(el); });
        document.querySelectorAll('[data-hermit-spacer]').forEach(wireDraggable);
        ZONES.forEach(zone => {
            const container = zoneEl(zone);
            if (!container) return;
            container.addEventListener('dragover', onZoneDragOver);
            container.addEventListener('drop', onZoneDrop);
        });
    }

    function exitEditMode() {
        if (!editing) return;
        editing = false;
        document.body.classList.remove('hermit-edit-mode');
        allTrackedIds().forEach(id => { const el = document.getElementById(id); if (el) unwireDraggable(el); });
        document.querySelectorAll('[data-hermit-spacer]').forEach(unwireDraggable);
        ZONES.forEach(zone => {
            const container = zoneEl(zone);
            if (!container) return;
            container.removeEventListener('dragover', onZoneDragOver);
            container.removeEventListener('drop', onZoneDrop);
        });
    }

    // ---- Floating panel ----
    let panelEl = null;

    function ensureStyle() {
        if (document.getElementById('hermit-style')) return;
        const style = document.createElement('style');
        style.id = 'hermit-style';
        style.textContent = `
            .hermit-edit-mode [data-hermit-item] {
                outline: 1px dashed rgba(255, 206, 0, 0.65);
                outline-offset: 2px;
                cursor: grab;
                border-radius: 3px;
            }
            .hermit-edit-mode [data-hermit-item]:hover { outline-color: #ffce00; }
            .hermit-dragging { opacity: 0.35; cursor: grabbing !important; }
            .hermit-spacer { background: transparent; }
            .hermit-edit-mode .hermit-spacer {
                background: repeating-linear-gradient(45deg, rgba(255,206,0,0.12), rgba(255,206,0,0.12) 4px, transparent 4px, transparent 8px);
                min-height: 20px;
            }
            .hermit-edit-mode .hermit-spacer-controls { display: flex !important; }
        `;
        document.head.appendChild(style);
    }

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'hermit-panel';
        Object.assign(panel.style, {
            position: 'fixed', top: '90px', right: '16px', zIndex: '9998',
            background: '#1a1a2e', border: '1px solid #555', borderRadius: '8px',
            padding: '10px 14px', display: 'flex', flexDirection: 'column',
            gap: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            minWidth: '240px', maxWidth: '320px', fontFamily: 'sans-serif',
        });

        const title = document.createElement('div');
        title.textContent = '🏹 TheHermit — Layout Editor';
        Object.assign(title.style, { color: '#e8dcc8', fontSize: '13px', fontWeight: 'bold' });
        panel.appendChild(title);

        const hint = document.createElement('div');
        hint.textContent = 'Drag any dashed-outline button/indicator or spacer to move it — within a bar or between them. Each spacer shows −/+/× controls above it. Saved automatically.';
        Object.assign(hint.style, { color: '#aaa', fontSize: '11px', lineHeight: '1.4' });
        panel.appendChild(hint);

        function makeBtn(label, action) {
            const btn = document.createElement('button');
            btn.textContent = label;
            Object.assign(btn.style, {
                padding: '6px 10px', background: '#2d2d44', color: '#eee',
                border: '1px solid #555', borderRadius: '5px', cursor: 'pointer',
                fontSize: '12px', textAlign: 'left',
            });
            btn.onclick = action;
            return btn;
        }

        // Row of small per-zone "add spacer" buttons — a spacer has to start
        // somewhere, and dropping it straight into the intended bar beats
        // always adding to dock-actions and dragging it across every time.
        const spacerRow = document.createElement('div');
        Object.assign(spacerRow.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' });
        const ZONE_LABELS = { 'dock-actions': 'Dock', 'hud-left': 'HUD L', 'hud-center': 'HUD C', 'hud-right': 'HUD R' };
        ZONES.forEach(zone => {
            const b = document.createElement('button');
            b.textContent = '+ Spacer: ' + (ZONE_LABELS[zone.id] || zone.id);
            Object.assign(b.style, {
                padding: '5px 8px', background: '#243318', color: '#c8e6a0',
                border: '1px solid #4a6a2a', borderRadius: '5px', cursor: 'pointer', fontSize: '11px',
            });
            b.onclick = () => {
                const container = zoneEl(zone);
                if (!container) return;
                container.appendChild(createSpacer(24));
                saveCurrentLayout();
            };
            spacerRow.appendChild(b);
        });
        panel.appendChild(spacerRow);

        panel.appendChild(makeBtn('Export Layout', () => {
            const out = JSON.stringify(currentLayout(), null, 2);
            console.log('[HERMIT LAYOUT EXPORT]\n' + out);
            let pre = panel.querySelector('.hermit-export-area');
            if (pre) { pre.remove(); return; }
            pre = document.createElement('textarea');
            pre.className = 'hermit-export-area';
            Object.assign(pre.style, {
                width: '100%', height: '160px', background: '#111', color: '#6ef',
                border: '1px solid #444', borderRadius: '4px', fontSize: '10px',
                padding: '4px', boxSizing: 'border-box', resize: 'vertical',
            });
            pre.value = out;
            panel.appendChild(pre);
            pre.select();
        }));

        panel.appendChild(makeBtn('Reset to Default Layout', () => {
            if (!confirm('Discard the saved layout (including any spacers) and reload?')) return;
            try { localStorage.removeItem(STORAGE_KEY); } catch {}
            location.reload();
        }));

        panel.appendChild(makeBtn('Close (Shift+H)', () => hide()));

        return panel;
    }

    function show() {
        ensureStyle();
        if (!panelEl) panelEl = buildPanel();
        if (!panelEl.isConnected) document.body.appendChild(panelEl);
        enterEditMode();
    }

    function hide() {
        exitEditMode();
        if (panelEl?.isConnected) panelEl.remove();
    }

    function toggle() {
        if (panelEl?.isConnected) hide();
        else show();
    }

    // Shift+H — same style of hidden shortcut as Shift+R/Shift+B (bot.js)
    // and Shift+J+T (joytone-bridge.js). Ignored while typing in a field.
    document.addEventListener('keydown', e => {
        if (!e.shiftKey || e.key !== 'H' && e.key !== 'h') return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        toggle();
    });

    // Reapply whatever layout was saved from a previous session, immediately
    // (this script runs after the HUD markup, so the elements already exist)
    // — independent of whether the editor is ever opened this session.
    normalizeDOM();
    applySavedLayout();

    window.TheHermit = { toggle, show, hide, exportLayout: currentLayout };
})();
