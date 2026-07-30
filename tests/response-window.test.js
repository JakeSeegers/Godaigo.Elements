'use strict';

/**
 * Response-window resolution tests, driven through the real
 * ResponseWindowSystem + ScrollEffects + scroll-resolved listener.
 *
 * These cover the manual playtest checklist for the Psychic ransom:
 *   - victim can't afford the ransom → no prompt, counter + steal proceed
 *   - pay → Psychic negated, original resolves, no steal queued
 *   - decline → counter + steal proceed, victim AP untouched
 *   - timeout → same as decline
 * plus the double-resolution race guard and Iron Stance / response scrolls.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv } = require('./harness/game-env');

const ORIGINAL = 'EARTH_SCROLL_4';  // Heavy Stomp — the scroll being countered
const PSYCHIC = 'VOID_SCROLL_1';
const IRON_STANCE = 'EARTH_SCROLL_1';
const LAMPLIGHT = 'FIRE_SCROLL_1';

function armCallback(env) {
    const state = { calls: 0, last: null };
    env.responseWindow.onCompleteCallback = r => { state.calls++; state.last = r; };
    return state;
}

function pendingPsychics(env) {
    return env.ScrollEffects.activeBuffs.psychicPending || [];
}

test('Psychic vs broke victim: no ransom prompt, counter + steal proceed', () => {
    const env = createGameEnv();
    env.context.playerAPs[0].currentAP = 1; // below PSYCHIC_RANSOM_AP
    env.spellSystem.playerScrolls[1].active.add(PSYCHIC);
    env.stageResponse(ORIGINAL, PSYCHIC);
    const cb = armCallback(env);

    env.responseWindow.resolveResponseStack();

    assert.equal(env.getById('psychic-ransom-overlay'), null, 'no ransom prompt for a broke victim');
    const pending = pendingPsychics(env);
    assert.equal(pending.length, 1, 'stolen scroll queued exactly once');
    assert.equal(pending[0].playerIndex, 1);
    assert.equal(pending[0].scrollName, ORIGINAL);
    assert.ok(pending[0].eventId, 'pending entry carries an eventId');

    assert.equal(env.spellSystem.commonArea.void, PSYCHIC, 'Psychic moved to common area');
    assert.ok(!env.spellSystem.playerScrolls[1].active.has(PSYCHIC), 'Psychic left responder active area');
    assert.ok(env.spellSystem.playerScrolls[1].activated.has('void'), 'counter counts as void activation');

    assert.equal(cb.calls, 1);
    const results = cb.last.responses.map(r => r.result);
    assert.ok(results.includes('countered-original'));
    assert.ok(results.includes('countered'));
    assert.equal(env.spellSystem.applied.length, 0, 'countered original never applies its effects');
});

test('Psychic ransom paid: Psychic negated, original resolves, no steal', () => {
    const env = createGameEnv();
    env.context.playerAPs[0].currentAP = 5;
    env.spellSystem.playerScrolls[1].active.add(PSYCHIC);
    env.stageResponse(ORIGINAL, PSYCHIC);
    const cb = armCallback(env);

    env.responseWindow.resolveResponseStack();

    assert.ok(env.getById('psychic-ransom-overlay'), 'ransom prompt shown');
    assert.equal(cb.calls, 0, 'resolution deferred while prompt is open');

    const payBtn = env.findButton('Negate Psychic');
    assert.ok(payBtn, 'pay button present');
    payBtn.onclick();

    assert.equal(env.context.playerAPs[0].currentAP, 3, 'victim paid 2 AP');
    assert.equal(pendingPsychics(env).length, 0, 'no steal queued');
    assert.deepEqual(env.spellSystem.applied.map(a => a.name), [ORIGINAL], 'original scroll resolved');
    assert.equal(env.spellSystem.commonArea.void, PSYCHIC, 'negated Psychic still moves to common area');
    assert.ok(!env.spellSystem.playerScrolls[1].active.has(PSYCHIC), 'Psychic left responder active area');
    assert.ok(!env.spellSystem.playerScrolls[1].activated.has('void'), 'negated Psychic grants no void activation');

    assert.equal(cb.calls, 1);
    const results = cb.last.responses.map(r => r.result);
    assert.ok(results.includes('counter-negated'));
    assert.ok(results.includes('resolved'));
    assert.equal(env.getById('psychic-ransom-overlay'), null, 'prompt closed');
});

test('Psychic ransom declined: counter + steal proceed, AP untouched', () => {
    const env = createGameEnv();
    env.context.playerAPs[0].currentAP = 5;
    env.spellSystem.playerScrolls[1].active.add(PSYCHIC);
    env.stageResponse(ORIGINAL, PSYCHIC);
    const cb = armCallback(env);

    env.responseWindow.resolveResponseStack();
    const declineBtn = env.findButton('Decline');
    assert.ok(declineBtn, 'decline button present');
    declineBtn.onclick();

    assert.equal(env.context.playerAPs[0].currentAP, 5, 'no AP spent on decline');
    assert.equal(pendingPsychics(env).length, 1, 'steal queued');
    assert.equal(env.spellSystem.applied.length, 0, 'original countered');
    assert.equal(cb.calls, 1);
    assert.ok(cb.last.responses.map(r => r.result).includes('countered'));
});

test('Psychic ransom timeout defaults to decline', () => {
    const env = createGameEnv();
    env.context.playerAPs[0].currentAP = 5;
    env.spellSystem.playerScrolls[1].active.add(PSYCHIC);
    env.stageResponse(ORIGINAL, PSYCHIC);
    const cb = armCallback(env);

    env.responseWindow.resolveResponseStack();
    assert.ok(env.getById('psychic-ransom-overlay'));

    env.tick(15); // 15 x 1s interval firings = full RESPONSE_TIMEOUT_MS

    assert.equal(env.getById('psychic-ransom-overlay'), null, 'prompt closed on timeout');
    assert.equal(env.context.playerAPs[0].currentAP, 5, 'no AP spent');
    assert.equal(pendingPsychics(env).length, 1, 'steal queued (decline path)');
    assert.equal(cb.calls, 1);
});

test('Iron Stance counter gets no ransom prompt', () => {
    const env = createGameEnv();
    env.context.playerAPs[0].currentAP = 5;
    env.spellSystem.playerScrolls[1].active.add(IRON_STANCE);
    env.stageResponse(ORIGINAL, IRON_STANCE);
    const cb = armCallback(env);

    env.responseWindow.resolveResponseStack();

    assert.equal(env.getById('psychic-ransom-overlay'), null, 'ransom is Psychic-only');
    assert.equal(cb.calls, 1);
    assert.ok(cb.last.responses.map(r => r.result).includes('countered'));
    assert.equal(pendingPsychics(env).length, 0, 'Iron Stance steals nothing');
    assert.equal(env.spellSystem.applied.length, 0);
});

test('response scroll (Unbidden Lamplight) resolves alongside the original; stale coupling flags are cleared', () => {
    const env = createGameEnv();
    env.spellSystem.playerScrolls[1].active.add(LAMPLIGHT);
    env.stageResponse(ORIGINAL, LAMPLIGHT);
    const cb = armCallback(env);

    env.responseWindow.resolveResponseStack();

    assert.equal(cb.calls, 1);
    const results = cb.last.responses.map(r => r.result);
    assert.ok(results.includes('response-resolved'));
    assert.ok(results.includes('resolved'), 'response scrolls do not cancel the original');
    assert.deepEqual(env.spellSystem.applied.map(a => a.name), [ORIGINAL]);
    assert.ok(!env.ScrollEffects.pendingCommonAreaRedirect,
        'unconsumed pendingCommonAreaRedirect cleared at end of resolution');
});

test('double resolution is guarded (timeout vs late response race)', () => {
    const env = createGameEnv();
    env.context.playerAPs[0].currentAP = 5;
    env.spellSystem.playerScrolls[1].active.add(PSYCHIC);
    env.stageResponse(ORIGINAL, PSYCHIC);
    const cb = armCallback(env);

    env.responseWindow.resolveResponseStack();
    assert.ok(env.getById('psychic-ransom-overlay'), 'prompt open, resolution in flight');

    // A second trigger (e.g. timeout firing while the prompt is open) is a no-op
    env.responseWindow.resolveResponseStack();
    assert.equal(cb.calls, 0, 'duplicate trigger did not resolve anything');

    // A late remote response can no longer pollute the drained stack
    env.responseWindow.handleRemoteResponse(IRON_STANCE, 1, true);
    assert.equal(env.responseWindow.responseStack.length, 0, 'late response ignored mid-resolution');

    // A late remote pass is also ignored
    env.responseWindow.handleRemotePass(1);

    env.findButton('Negate Psychic').onclick();
    assert.equal(cb.calls, 1, 'completion callback fired exactly once');
    assert.equal(env.spellSystem.applied.length, 1, 'original applied exactly once');

    // Even after completion, a re-trigger stays inert until a new window opens
    env.responseWindow.resolveResponseStack();
    assert.equal(cb.calls, 1);
    assert.equal(env.spellSystem.applied.length, 1);
});
