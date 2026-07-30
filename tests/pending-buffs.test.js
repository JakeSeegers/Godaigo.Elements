'use strict';

/**
 * Unit tests for the deferred Psychic/Reflect activation queue
 * (ScrollEffects.addPendingBuff / removePendingBuff) and the effect
 * chain-depth budget in ScrollEffects.execute.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGameEnv } = require('./harness/game-env');

test('addPendingBuff dedups echoes of the same event by eventId', () => {
    const env = createGameEnv();
    const fx = env.ScrollEffects;

    assert.equal(fx.addPendingBuff('psychic', 1, 'EARTH_SCROLL_4', env.defs.EARTH_SCROLL_4, 'ev-1'), true);
    assert.equal(fx.addPendingBuff('psychic', 1, 'EARTH_SCROLL_4', env.defs.EARTH_SCROLL_4, 'ev-1'), false, 'same eventId is an echo');
    assert.equal(fx.activeBuffs.psychicPending.length, 1);
});

test('addPendingBuff allows a genuine repeat (same scroll, new eventId)', () => {
    const env = createGameEnv();
    const fx = env.ScrollEffects;

    fx.addPendingBuff('psychic', 1, 'EARTH_SCROLL_4', env.defs.EARTH_SCROLL_4, 'ev-1');
    assert.equal(fx.addPendingBuff('psychic', 1, 'EARTH_SCROLL_4', env.defs.EARTH_SCROLL_4, 'ev-2'), true,
        'the double-Psychic-same-scroll line of play queues twice');
    assert.equal(fx.activeBuffs.psychicPending.length, 2);
});

test('addPendingBuff without an eventId falls back to name dedup (errs on dropping)', () => {
    const env = createGameEnv();
    const fx = env.ScrollEffects;

    fx.addPendingBuff('reflect', 0, 'FIRE_SCROLL_2', env.defs.FIRE_SCROLL_2, null);
    assert.equal(fx.addPendingBuff('reflect', 0, 'FIRE_SCROLL_2', env.defs.FIRE_SCROLL_2, null), false);
    assert.equal(fx.activeBuffs.reflectPending.length, 1);
});

test('addPendingBuff backfills a missing definition from a later echo', () => {
    const env = createGameEnv();
    const fx = env.ScrollEffects;

    fx.addPendingBuff('psychic', 1, 'EARTH_SCROLL_4', null, 'ev-1');
    fx.addPendingBuff('psychic', 1, 'EARTH_SCROLL_4', env.defs.EARTH_SCROLL_4, 'ev-1');
    assert.equal(fx.activeBuffs.psychicPending.length, 1);
    assert.ok(fx.activeBuffs.psychicPending[0].definition, 'definition upgraded from echo');
});

test('removePendingBuff removes by eventId, falling back to name match', () => {
    const env = createGameEnv();
    const fx = env.ScrollEffects;

    fx.addPendingBuff('psychic', 1, 'EARTH_SCROLL_4', env.defs.EARTH_SCROLL_4, 'ev-1');
    fx.addPendingBuff('psychic', 1, 'EARTH_SCROLL_4', env.defs.EARTH_SCROLL_4, 'ev-2');

    fx.removePendingBuff('psychic', 1, 'EARTH_SCROLL_4', 'ev-2');
    // Array.from in the test realm — the queue itself is a vm-realm array
    assert.deepEqual(Array.from(fx.activeBuffs.psychicPending, p => p.eventId), ['ev-1'], 'removed the id-matched entry');

    fx.removePendingBuff('psychic', 1, 'EARTH_SCROLL_4', 'ev-unknown');
    assert.equal(fx.activeBuffs.psychicPending.length, 0, 'unknown id falls back to name match');

    // Removing from an empty queue is a no-op
    fx.removePendingBuff('psychic', 1, 'EARTH_SCROLL_4', null);
    assert.equal(fx.activeBuffs.psychicPending.length, 0);
});

test('Psychic cannot counter Psychic', () => {
    const env = createGameEnv();
    const result = env.ScrollEffects.execute('VOID_SCROLL_1', 1, {
        scrollName: 'VOID_SCROLL_1',
        triggeringScroll: { name: 'VOID_SCROLL_1', casterIndex: 0, definition: env.defs.VOID_SCROLL_1 }
    });
    assert.equal(result.success, false);
    assert.equal((env.ScrollEffects.activeBuffs.psychicPending || []).length, 0);
});

test('effect chains deeper than the budget are aborted instead of looping', () => {
    const env = createGameEnv();
    let executions = 0;
    env.ScrollEffects.effects.TEST_LOOP = {
        name: 'Test Loop',
        execute(casterIndex, context, system) {
            executions++;
            return system.execute('TEST_LOOP', casterIndex, context);
        }
    };

    const result = env.ScrollEffects.execute('TEST_LOOP', 0, {});

    assert.equal(result.success, false);
    assert.match(result.reason, /chain too deep/i);
    assert.ok(executions <= env.ScrollEffects.MAX_EFFECT_CHAIN_DEPTH, 'loop stopped at the budget');
    assert.equal(env.ScrollEffects._chainDepth, 0, 'depth counter unwinds cleanly');
});

test('legitimate shallow chains still execute (depth budget is not too tight)', () => {
    const env = createGameEnv();
    env.ScrollEffects.effects.TEST_INNER = {
        name: 'Test Inner',
        execute() { return { success: true }; }
    };
    env.ScrollEffects.effects.TEST_OUTER = {
        name: 'Test Outer',
        execute(casterIndex, context, system) {
            return system.execute('TEST_INNER', casterIndex, context);
        }
    };

    const result = env.ScrollEffects.execute('TEST_OUTER', 0, {});
    assert.equal(result.success, true, 'a two-level chain (e.g. Reflect duplicating a scroll) is fine');
    assert.equal(env.ScrollEffects._chainDepth, 0);
});
