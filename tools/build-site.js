#!/usr/bin/env node
// Build the public site into dist/: copies ONLY the files the game loads.
//
// GitHub Pages serves the whole repository, so docs, planning notes, SQL
// and repomix-output.txt are public there. Cloudflare Pages runs this as
// its build command (output directory: dist), so only the game is published.
//
//   node tools/build-site.js        -> dist/
//
// If the game starts loading a file from a new top-level place, add it to
// INCLUDE below (a missing file shows up as a 404 on the Cloudflare site).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

// Top-level files and folders the browser loads.
const INCLUDE = [
    'index.html',
    'changelog.json',
    'GodaigoLogoText.svg',
    'js',
    'css',
    'images',
    'assets',
    'sounds',
    'video',
    'LoreIntroClips',
    'joytone',
];

// Never published, even inside the folders above.
const SKIP_FILE = /\.(md|psd|kra|blend|py)$/i;
const SKIP_DIR = new Set(['.git', 'node_modules', '.cache']);

let files = 0, bytes = 0;
function copy(src, dst) {
    const st = fs.statSync(src);
    if (st.isDirectory()) {
        if (SKIP_DIR.has(path.basename(src))) return;
        fs.mkdirSync(dst, { recursive: true });
        for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dst, name));
        return;
    }
    if (SKIP_FILE.test(src)) return;
    fs.copyFileSync(src, dst);
    files++;
    bytes += st.size;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const item of INCLUDE) {
    const src = path.join(ROOT, item);
    if (!fs.existsSync(src)) { console.warn(`build-site: missing ${item}, skipped`); continue; }
    copy(src, path.join(OUT, item));
}
// Cache rules for Cloudflare (see tools/site-headers).
fs.copyFileSync(path.join(__dirname, 'site-headers'), path.join(OUT, '_headers'));
console.log(`build-site: ${files} files, ${(bytes / 1e6).toFixed(1)} MB -> dist/`);
