#!/usr/bin/env node
// Sets GAME_VERSION in js/version.js to the current UTC time
// (YYYY-MM-DD.HHMM). Run it before every push that changes game files, so
// open browsers see the update and reload (see js/version.js). The Claude
// Stop hook (tools/claude-hooks/stop-check.js) reminds when it was skipped.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'js', 'version.js');
const d = new Date().toISOString(); // 2026-09-24T21:40:12.345Z
const version = `${d.slice(0, 10)}.${d.slice(11, 13)}${d.slice(14, 16)}`;
const src = fs.readFileSync(file, 'utf8');
const next = src.replace(/window\.GAME_VERSION = '[^']*';/, `window.GAME_VERSION = '${version}';`);
if (next === src && !src.includes(`'${version}'`)) {
    console.error('GAME_VERSION line not found in js/version.js');
    process.exit(1);
}
fs.writeFileSync(file, next);
console.log('GAME_VERSION =', version);
