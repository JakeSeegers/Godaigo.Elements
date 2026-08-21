// ⚠️ DEAD FILE — NOT LOADED BY index.html. Found during a connectivity/
// performance audit (2026-08): every constant below is duplicated in a file
// that IS actually loaded, and this one has no <script src="js/config.js">
// tag anywhere in the repo (verified: index.html and every other *.html
// file). Editing this file has zero effect on the live game — don't spend
// time here expecting a change to show up. Real, live locations:
//   - SUPABASE_URL / SUPABASE_ANON_KEY / supabase client → js/multiplayer-state.js
//   - TILE_SIZE / SNAP_THRESHOLD / STONE_SIZE / STONE_TYPES / PLAYER_COLORS /
//     sourcePool / stone & source pool capacities / toRoman() → js/game-core.js
// Kept in place rather than deleted since removing it wasn't asked for and
// this audit's scope was connectivity/perf, not a repo cleanup pass — but
// treat it as historical, not authoritative. See js/INDEX.md and CLAUDE.md's
// Script Load Order, which previously (wrongly) listed this as script #1.
// ========================================
// SUPABASE MULTIPLAYER SETUP
// ========================================
const SUPABASE_URL = 'https://lovybwpypkaarstnvkbz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxvdnlid3B5cGthYXJzdG52a2J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMzI4NTgsImV4cCI6MjA4NDYwODg1OH0.lqobDTaopRJ5sA0yZQvzDwudq2x4zz9HMtTkSuJulFU';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// GAME CONSTANTS
// ========================================
const TILE_SIZE = 20;
const SNAP_THRESHOLD = 40;
const STONE_SIZE = 12;

const STONE_TYPES = {
    earth:    { color: '#69d83a', symbol: '▲', img: 'images/mountainsymbol.png' },
    water:    { color: '#5894f4', symbol: '◯', img: 'images/watersymbol.png'    },
    fire:     { color: '#ed1b43', symbol: '♦', img: 'images/firesymbol.png'     },
    wind:     { color: '#ffce00', symbol: '≋', img: 'images/windsymbol.png'     },
    void:     { color: '#9458f4', symbol: '✺', img: 'images/voidsymbol.png'     },
    catacomb: { color: '#8b4513', symbol: '✦', img: 'images/Catacomb.png'       }
};

const PLAYER_COLORS = {
    green: '#69d83a',
    blue: '#5894f4',
    red: '#ed1b43',
    yellow: '#ffce00',
    purple: '#9458f4'
};

// Elemental source pool - stones available from shrines (max 25 each)
const sourcePool = { earth: 20, water: 20, fire: 20, wind: 20, void: 20 };
const sourcePoolCapacity = { earth: 25, water: 25, fire: 25, wind: 25, void: 25 };
const playerPoolCapacity = { earth: 5, water: 5, fire: 5, wind: 5, void: 5 };
const stoneCapacity = playerPoolCapacity;

// Helper function to convert numbers to roman numerals
function toRoman(num) {
    const map = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
    return map[num] || num;
}
