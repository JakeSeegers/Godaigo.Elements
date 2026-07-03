'use strict';

/**
 * Headless test environment for the Godaigo scroll/response interaction layer.
 *
 * Loads the REAL game files (scroll-definitions, scroll-effects,
 * response-window, multiplayer-state) into a Node `vm` context with a minimal
 * DOM stub, fake timers, and a recording broadcast layer, so response-window
 * resolution and pending-buff behavior can be exercised without a browser.
 *
 * Real code under test: ScrollEffects (including the Psychic / Reflect /
 * Unbidden Lamplight effects), ResponseWindowSystem, and the scroll-resolved
 * listener from multiplayer-state.js.
 * Faked: the DOM, timers, Supabase broadcasts, and a small spellSystem facade
 * standing in for game-core's SpellSystem (pattern checks always pass, scroll
 * cost is always 2 AP, applyScrollEffects/handleScrollDisposition record their
 * calls instead of mutating board state).
 *
 * Player 0 is the original caster ("victim" in Psychic scenarios); player 1 is
 * the responder. Tests run in hotseat semantics (isMultiplayer = false,
 * myPlayerIndex = null), which is the mode where the resolving client owns all
 * state — the same code path the caster's client runs in multiplayer.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

const GAME_FILES = [
    'js/scrolls/scroll-definitions.js',
    'js/scrolls/effects/scroll-effects.js',
    'js/scrolls/response-window.js',
    'js/multiplayer-state.js'
];

const sources = GAME_FILES.map(rel => ({
    rel,
    code: fs.readFileSync(path.join(ROOT, rel), 'utf8')
}));

function makeElement(tagName) {
    return {
        tagName,
        id: undefined,
        style: {},
        children: [],
        parentNode: null,
        textContent: '',
        innerHTML: '',
        onclick: null,
        onmouseenter: null,
        onmouseleave: null,
        title: '',
        disabled: false,
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        insertBefore(child, ref) {
            child.parentNode = this;
            const i = this.children.indexOf(ref);
            if (i === -1) this.children.push(child);
            else this.children.splice(i, 0, child);
            return child;
        },
        removeChild(child) {
            const i = this.children.indexOf(child);
            if (i !== -1) this.children.splice(i, 1);
            child.parentNode = null;
            return child;
        },
        remove() {
            if (this.parentNode) this.parentNode.removeChild(this);
        },
        setAttribute() {},
        addEventListener() {},
        querySelector() { return null; },
        classList: { add() {}, remove() {}, toggle() {} }
    };
}

function walk(el, visit) {
    visit(el);
    for (const child of el.children) walk(child, visit);
}

function createGameEnv() {
    const status = [];       // updateStatus messages
    const broadcasts = [];   // broadcastGameAction calls
    const warnings = [];     // console.warn/error from game code
    const docListeners = {};
    const winListeners = {};
    const timers = new Map();
    let timerSeq = 1;

    const body = makeElement('body');
    const head = makeElement('head');

    const document = {
        body,
        head,
        createElement: tag => makeElement(tag),
        getElementById(id) {
            let found = null;
            for (const root of [body, head]) {
                walk(root, el => { if (!found && el.id === id) found = el; });
            }
            return found;
        },
        addEventListener(type, cb) {
            (docListeners[type] = docListeners[type] || []).push(cb);
        },
        querySelector() { return null; }
    };

    class CustomEvent {
        constructor(type, opts) {
            this.type = type;
            this.detail = opts ? opts.detail : undefined;
        }
    }

    const window = {
        supabase: { createClient: () => ({}) },
        addEventListener(type, cb) {
            (winListeners[type] = winListeners[type] || []).push(cb);
        },
        dispatchEvent(event) {
            for (const cb of winListeners[event.type] || []) cb(event);
            return true;
        }
    };

    const debug = !!process.env.TEST_DEBUG;
    const fakeConsole = {
        log: (...a) => { if (debug) console.log(...a); },
        info: (...a) => { if (debug) console.info(...a); },
        warn: (...a) => { warnings.push(a.map(String).join(' ')); if (debug) console.warn(...a); },
        error: (...a) => { warnings.push(a.map(String).join(' ')); if (debug) console.error(...a); }
    };

    const context = {
        console: fakeConsole,
        window,
        document,
        CustomEvent,
        setInterval(fn) { const id = timerSeq++; timers.set(id, fn); return id; },
        clearInterval(id) { timers.delete(id); },
        setTimeout(fn) { const id = timerSeq++; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); },
        // Game globals normally defined by game-core / game-ui / lobby
        playerPositions: [
            { x: 0, y: 0, username: 'Caster', color: '#9458f4' },
            { x: 100, y: 0, username: 'Responder', color: '#ffce00' }
        ],
        playerAPs: [
            { currentAP: 5, voidAP: 0 },
            { currentAP: 5, voidAP: 0 }
        ],
        activePlayerIndex: 0,
        updateStatus: msg => status.push(String(msg)),
        broadcastGameAction: (event, payload) => broadcasts.push({ event, payload }),
        syncPlayerState() {},
        updateCommonAreaUI() {},
        updatePlayerElementSymbols() {},
        updateStoneCount() {},
        updateScrollDeckUI() {}
    };
    // Matches production semantics: spendAP charges the local player's AP
    context.spendAP = amount => {
        const idx = context.activePlayerIndex;
        if (context.playerAPs[idx]) context.playerAPs[idx].currentAP -= amount;
    };

    vm.createContext(context);
    for (const { rel, code } of sources) {
        vm.runInContext(code, context, { filename: rel });
    }
    // Fire DOMContentLoaded so multiplayer-state registers the scroll-resolved listener
    for (const cb of docListeners['DOMContentLoaded'] || []) cb();

    const defs = vm.runInContext('SCROLL_DEFINITIONS', context);
    const ScrollEffects = vm.runInContext('ScrollEffects', context);
    const ResponseWindowSystem = vm.runInContext('ResponseWindowSystem', context);

    const spellSystem = {
        patterns: defs,
        playerScrolls: {},
        commonArea: { earth: null, water: null, fire: null, wind: null, void: null, catacomb: null },
        MAX_ACTIVE_SIZE: 2,
        applied: [],       // applyScrollEffects calls (original-scroll resolutions)
        dispositions: [],  // handleScrollDisposition calls
        ensurePlayerScrollsStructure(i) {
            if (!this.playerScrolls[i]) {
                this.playerScrolls[i] = { hand: new Set(), active: new Set(), activated: new Set() };
            }
        },
        getCommonAreaScrolls() { return Object.values(this.commonArea).filter(Boolean); },
        getScrollElement(name) { return this.patterns[name] ? this.patterns[name].element : undefined; },
        discardToCommonArea(name) {
            const el = this.getScrollElement(name);
            if (el) this.commonArea[el] = name;
        },
        updateScrollCount() {},
        executeSpell() {},
        getSpellCost() { return 2; },
        checkPatternForPlayer() { return true; },
        applyScrollEffects(name, spell, fromCommonArea = false) { this.applied.push({ name, fromCommonArea }); },
        handleScrollDisposition(name, fromCommonArea = false) { this.dispositions.push({ name, fromCommonArea }); },
        hasPendingCascade() { return false; },
        showLevelComplete() {}
    };
    spellSystem.ensurePlayerScrollsStructure(0);
    spellSystem.ensurePlayerScrollsStructure(1);

    ScrollEffects.init(spellSystem);
    spellSystem.scrollEffects = ScrollEffects;
    const responseWindow = new ResponseWindowSystem(spellSystem);
    spellSystem.responseWindow = responseWindow;
    context.spellSystem = spellSystem; // global read by the scroll-resolved listener

    return {
        context,
        defs,
        ScrollEffects,
        responseWindow,
        spellSystem,
        status,
        broadcasts,
        warnings,
        document,
        run: code => vm.runInContext(code, context),

        // Advance all fake interval timers by n ticks (1 tick = 1 interval firing)
        tick(times = 1) {
            for (let i = 0; i < times; i++) {
                for (const fn of [...timers.values()]) fn();
            }
        },

        getById: id => document.getElementById(id),

        findButton(text) {
            let found = null;
            walk(body, el => {
                if (!found && el.tagName === 'button' && String(el.textContent).includes(text)) found = el;
            });
            return found;
        },

        // Stage a response scenario exactly the way openResponseWindow /
        // handleRemoteResponse build it: player 0 cast `originalName`,
        // player 1 responded with `responseName`.
        stageResponse(originalName, responseName) {
            const responseDef = defs[responseName];
            responseWindow._resolving = false;
            responseWindow.isResponseWindowOpen = true;
            responseWindow.currentCaster = 0;
            responseWindow.pendingScrollData = { name: originalName };
            responseWindow.responseStack = [
                {
                    scrollData: { name: originalName, definition: defs[originalName] },
                    casterIndex: 0,
                    isOriginal: true
                },
                {
                    scrollData: { name: responseName, definition: responseDef },
                    casterIndex: 1,
                    isCounter: responseDef.canCounter === 'any',
                    isResponse: responseDef.isResponse === true,
                    fromCommonArea: false,
                    isOriginal: false
                }
            ];
        }
    };
}

module.exports = { createGameEnv };
