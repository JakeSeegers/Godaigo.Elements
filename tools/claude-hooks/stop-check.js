#!/usr/bin/env node
// Stop hook (see .claude/settings.json). Checks the house rules against
// everything this session changed (since the commit session-start.js saved):
//   1. no em dashes in added lines
//   2. game files changed => changelog.json changed too
// On a problem it returns {"decision":"block"} so Claude keeps working and
// fixes it. It blocks only once per stop (stop_hook_active), so it can never
// loop forever.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EM_DASH = '\u2014';
// Files a player can see or feel. Docs, planning, tools and hooks are not.
const GAME_PATH = /^(index\.html|js\/|css\/|sounds\/|assets\/|images\/|video\/|LoreIntroClips\/|joytone\/|sql\/)/;
const CHANGELOG = 'changelog.json';

function git(cmd) {
    return execSync('git ' + cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) {}
if (input.stop_hook_active) process.exit(0);

let base;
try {
    const gitDir = git('rev-parse --git-dir').trim();
    base = fs.readFileSync(path.join(gitDir, 'claude-session-base'), 'utf8').trim();
    git('cat-file -e ' + base + '^{commit}');
} catch (e) {
    process.exit(0); // no recorded base: nothing to compare against
}

// Only this session's own work: non-merge commits on the first-parent chain
// since the base, plus uncommitted and untracked changes. Work that came in
// through a merge (git pull of other sessions) is skipped. Known gap: a
// fast-forward pull puts other commits on the first-parent chain too.
const commits = git(`rev-list --first-parent --no-merges ${base}..HEAD`).split('\n').filter(Boolean);
const patches = commits.map(c => git(`show -U0 --no-color --format= ${c}`));
patches.push(git('diff -U0 --no-color HEAD'));

const changed = new Set();
for (const p of patches) {
    for (const l of p.split('\n')) {
        const m = l.match(/^\+\+\+ b\/(.*)$/) || l.match(/^--- a\/(.*)$/);
        if (m) changed.add(m[1]);
    }
}
const untracked = git('ls-files --others --exclude-standard').split('\n').filter(Boolean);
untracked.forEach(f => changed.add(f));
if (!changed.size) process.exit(0);

const problems = [];

// 1. Em dashes in added lines (tracked patches + whole untracked files).
// An added line counts only if it is still in the file now, so a later fix
// clears it and the reported line numbers are current.
const added = new Map(); // file -> Set of added line texts containing an em dash
let file = null;
for (const l of patches.join('\n').split('\n')) {
    if (l.startsWith('+++ ')) { file = l.slice(4).replace(/^b\//, ''); continue; }
    if (l.startsWith('+') && l.includes(EM_DASH) && file) {
        if (!added.has(file)) added.set(file, new Set());
        added.get(file).add(l.slice(1));
    }
}
const hits = [];
for (const [f, texts] of added) {
    let lines;
    try { lines = fs.readFileSync(f, 'utf8').split('\n'); } catch (e) { continue; }
    lines.forEach((t, i) => { if (texts.has(t.replace(/\r$/, ''))) hits.push(`${f}:${i + 1}`); });
}
for (const f of untracked) {
    try {
        fs.readFileSync(f, 'utf8').split('\n').forEach((t, i) => {
            if (t.includes(EM_DASH)) hits.push(`${f}:${i + 1}`);
        });
    } catch (e) {}
}
if (hits.length) {
    problems.push(
        `Em dashes found in ${hits.length} line(s) this session added or changed. ` +
        `House rule: never use em dashes. Rewrite them (comma, colon, period, parentheses, or " - "). ` +
        `First ones: ${hits.slice(0, 15).join(', ')}`
    );
}

// 2. Changelog entry for player-facing changes
const gameFiles = [...changed].filter(f => GAME_PATH.test(f));
if (gameFiles.length && !changed.has(CHANGELOG)) {
    problems.push(
        `Game files changed this session (${gameFiles.slice(0, 8).join(', ')}${gameFiles.length > 8 ? ', ...' : ''}) ` +
        `but ${CHANGELOG} did not. House rule: add a player-facing release note (simple English, no em dashes) ` +
        `to today's entry, or a new entry at the top. If the change truly has no player-visible effect ` +
        `(pure refactor, dev-only tool), say so to the user instead.`
    );
}

if (problems.length) {
    process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: 'House rules check (tools/claude-hooks/stop-check.js):\n- ' + problems.join('\n- ') +
                '\nFix these, then commit and push again if you already pushed.'
    }));
}
process.exit(0);
