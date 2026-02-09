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
    earth: { color: '#69d83a', symbol: '▲' },
    water: { color: '#5894f4', symbol: '◯' },
    fire: { color: '#ed1b43', symbol: '♦' },
    wind: { color: '#ffce00', symbol: '≋' },
    void: { color: '#9458f4', symbol: '✺' },
    catacomb: { color: '#8b4513', symbol: '🔅' }
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
