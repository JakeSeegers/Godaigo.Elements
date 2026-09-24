#!/usr/bin/env node
// Stop hook (see .claude/settings.json). Checks the house rules against
// everything this session changed (since the commit session-start.js saved):
//   1. no em dashes in added lines
//   2. game files changed => reminder to update today's changelog summary
//   3. changelog.json shape: one entry per date, newest first, max 5 lines
//   4. game files changed => js/version.js GAME_VERSION bumped (so open
//      browsers pick up the update, see js/version.js)
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
const VERSION_FILE = 'js/version.js';
// Game files the browser downloads (sql/ runs on the server, not in the page).
const CLIENT_PATH = /^(index\.html|js\/|css\/|sounds\/|assets\/|images\/|video\/|LoreIntroClips\/|joytone\/|changelog\.json)/;
const MAX_LINES = 5; // per daily entry, see CLAUDE.md HOUSE RULES #2

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

// 2. Release-note reminder for game changes. Not every change needs a line
// (small ones are grouped, internal ones skipped), so this blocks only once
// and lets Claude either update today's summary or tell the user why not.
const gameFiles = [...changed].filter(f => GAME_PATH.test(f));
if (gameFiles.length && !changed.has(CHANGELOG)) {
    problems.push(
        `Game files changed this session (${gameFiles.slice(0, 8).join(', ')}${gameFiles.length > 8 ? ', ...' : ''}) ` +
        `but ${CHANGELOG} did not. If players will notice this change, update TODAY's entry ` +
        `(one entry per day, max ${MAX_LINES} lines, rewrite it as a summary of the day). ` +
        `If players will not notice it, do not add a note; tell the user you skipped it and why.`
    );
}

// 3. changelog.json shape (only when this session touched it)
if (changed.has(CHANGELOG)) {
    try {
        const data = JSON.parse(fs.readFileSync(CHANGELOG, 'utf8'));
        const entries = Array.isArray(data.entries) ? data.entries : null;
        if (!entries) throw new Error('"entries" must be an array');
        const seen = new Set();
        let prev = null;
        entries.forEach((e, i) => {
            const where = `entry ${i} (${e.date || 'no date'})`;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) problems.push(`${CHANGELOG}: ${where} needs date as YYYY-MM-DD.`);
            if (e.id !== e.date) problems.push(`${CHANGELOG}: ${where} id must equal its date.`);
            if (seen.has(e.date)) problems.push(`${CHANGELOG}: more than one entry for ${e.date}. Merge them into one summary.`);
            seen.add(e.date);
            if (prev && e.date > prev) problems.push(`${CHANGELOG}: entries must be newest first (${e.date} is after ${prev}).`);
            prev = e.date;
            if (!Array.isArray(e.changes) || !e.changes.length) problems.push(`${CHANGELOG}: ${where} needs a non-empty "changes" list.`);
            else if (e.changes.length > MAX_LINES) problems.push(`${CHANGELOG}: ${where} has ${e.changes.length} lines (max ${MAX_LINES}). Merge or drop the small ones.`);
        });
    } catch (err) {
        problems.push(`${CHANGELOG} is not valid: ${err.message}`);
    }
}

// 4. Version bump for changed client files.
const clientFiles = [...changed].filter(f => CLIENT_PATH.test(f) && f !== VERSION_FILE);
if (clientFiles.length && !changed.has(VERSION_FILE)) {
    problems.push(
        `Client files changed this session (${clientFiles.slice(0, 8).join(', ')}${clientFiles.length > 8 ? ', ...' : ''}) ` +
        `but ${VERSION_FILE} did not. Run "node tools/bump-version.js" and commit it with the change, ` +
        `so players' open browsers pick up the update.`
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
