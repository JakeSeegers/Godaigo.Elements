#!/usr/bin/env node
// SessionStart hook (see .claude/settings.json).
// 1. Records the commit this session started from, so stop-check.js can see
//    everything the session changed, even after it commits and pushes.
// 2. Prints a short reminder of the house rules. SessionStart stdout is added
//    to Claude's context.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function git(cmd) {
    return execSync('git ' + cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) {}

try {
    const gitDir = git('rev-parse --git-dir');
    const baseFile = path.join(gitDir, 'claude-session-base');
    // New session (or /clear): start a fresh base. Resume/compact: keep it.
    const fresh = input.source === 'startup' || input.source === 'clear' || !fs.existsSync(baseFile);
    if (fresh) fs.writeFileSync(baseFile, git('rev-parse HEAD') + '\n');
} catch (e) {
    // Not a git checkout: skip the base, still print the rules.
}

console.log([
    'GODAIGO HOUSE RULES (full list: "HOUSE RULES" in CLAUDE.md). Short version:',
    '- Never use em dashes in anything you write (code, comments, docs, commit messages, game text).',
    '- Any change a player can see or feel needs an entry in changelog.json (simple English, no em dashes).',
    '- Start from planning/current.md and the INDEX.md files before reading source.',
    'A Stop hook (tools/claude-hooks/stop-check.js) checks the first two rules before you finish.'
].join('\n'));
