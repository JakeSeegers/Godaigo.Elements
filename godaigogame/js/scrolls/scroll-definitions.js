/**
 * Scroll Definitions for Godaigo
 *
 * This file contains all scroll pattern definitions.
 * Each scroll has:
 * - name: Display name
 * - description: What the scroll does
 * - level: Power level (affects stone gains)
 * - element: The element type (earth, water, fire, wind, void, catacomb)
 * - patterns: Array of valid pattern configurations (relative hex coordinates)
 * - canCounter: (optional) Special scrolls that can counter other scrolls
 */

// Pattern templates shared across element types
const LEVEL_1_PATTERNS = [
    [{ q: 0, r: -1 }, { q: 0, r: 1 }],
    [{ q: 1, r: -1 }, { q: -1, r: 1 }],
    [{ q: 1, r: 0 }, { q: -1, r: 0 }]
];

const LEVEL_2_PATTERNS = [
    [{ q: -1, r: -1 }, { q: 1, r: 1 }],
    [{ q: 1, r: -2 }, { q: -1, r: 2 }],
    [{ q: 2, r: -1 }, { q: -2, r: 1 }]
];

const LEVEL_3_PATTERNS = [
    [{ q: 1, r: -1 }, { q: -1, r: 0 }, { q: 0, r: 1 }],
    [{ q: 0, r: -1 }, { q: 1, r: 0 }, { q: -1, r: 1 }]
];

const LEVEL_4_PATTERNS = [
    [{ q: 1, r: -2 }, { q: -2, r: 1 }, { q: 1, r: 1 }],
    [{ q: -1, r: -1 }, { q: 2, r: -1 }, { q: -1, r: 2 }]
];

const LEVEL_5_PATTERNS = [
    [{ q: 0, r: -1 }, { q: 0, r: 1 }, { q: 2, r: -1 }, { q: -2, r: 1 }],
    [{ q: 1, r: -1 }, { q: -1, r: 1 }, { q: -1, r: -1 }, { q: 1, r: 1 }],
    [{ q: 1, r: 0 }, { q: -1, r: 0 }, { q: 1, r: -2 }, { q: -1, r: 2 }]
];

// Helper to convert Roman numerals
function toRoman(num) {
    const romans = ['I', 'II', 'III', 'IV', 'V'];
    return romans[num - 1] || num.toString();
}

// Helper function to rotate hex coordinate by 60 degrees
function rotateHex(q, r, steps) {
    let nq = q, nr = r;
    for (let i = 0; i < steps; i++) {
        const tempQ = nq;
        nq = -nr;
        nr = -(-tempQ - nr);
    }
    return { q: nq, r: nr };
}

// Generate elemental scroll definitions
function generateElementalScrolls() {
    const scrolls = {};
    const elementTypes = ['earth', 'water', 'fire', 'wind', 'void'];
    const patternLevels = [LEVEL_1_PATTERNS, LEVEL_2_PATTERNS, LEVEL_3_PATTERNS, LEVEL_4_PATTERNS, LEVEL_5_PATTERNS];

    elementTypes.forEach(element => {
        patternLevels.forEach((patterns, level) => {
            const scrollName = `${element.toUpperCase()}_SCROLL_${level + 1}`;
            scrolls[scrollName] = {
                name: `${element.charAt(0).toUpperCase() + element.slice(1)} Scroll ${toRoman(level + 1)}`,
                description: `Stand in pattern to gain +${level + 1} ${element} stones (2 AP)`,
                level: level + 1,
                element: element,
                patterns: patterns.map(pattern =>
                    pattern.map(pos => ({ ...pos, type: element }))
                ),
                // Earth II (Iron Stance) can counter any scroll
                canCounter: (element === 'earth' && level === 1) ? 'any' : null
            };
        });
    });

    return scrolls;
}

// Generate catacomb scroll definitions (multi-element patterns)
function generateCatacombScrolls() {
    const catacombBase = {
        CATACOMB_SCROLL_1: [
            { q: -1, r: -1, type: "water" },
            { q: 1, r: 1, type: "water" },
            { q: 1, r: -2, type: "earth" },
            { q: -1, r: 2, type: "earth" }
        ],
        CATACOMB_SCROLL_2: [
            { q: -1, r: -1, type: "earth" },
            { q: 1, r: 1, type: "earth" },
            { q: 1, r: -2, type: "fire" },
            { q: -1, r: 2, type: "fire" }
        ],
        CATACOMB_SCROLL_3: [
            { q: -1, r: -1, type: "wind" },
            { q: 1, r: 1, type: "wind" },
            { q: 1, r: -2, type: "earth" },
            { q: -1, r: 2, type: "earth" }
        ],
        CATACOMB_SCROLL_4: [
            { q: -1, r: -1, type: "void" },
            { q: 1, r: 1, type: "void" },
            { q: 1, r: -2, type: "earth" },
            { q: -1, r: 2, type: "earth" }
        ],
        CATACOMB_SCROLL_5: [
            { q: -1, r: -1, type: "water" },
            { q: 1, r: 1, type: "water" },
            { q: 1, r: -2, type: "fire" },
            { q: -1, r: 2, type: "fire" }
        ],
        CATACOMB_SCROLL_6: [
            { q: -1, r: -1, type: "wind" },
            { q: 1, r: 1, type: "wind" },
            { q: 1, r: -2, type: "water" },
            { q: -1, r: 2, type: "water" }
        ],
        CATACOMB_SCROLL_7: [
            { q: -1, r: -1, type: "void" },
            { q: 1, r: 1, type: "void" },
            { q: 1, r: -2, type: "water" },
            { q: -1, r: 2, type: "water" }
        ],
        CATACOMB_SCROLL_8: [
            { q: -1, r: -1, type: "fire" },
            { q: 1, r: 1, type: "fire" },
            { q: 1, r: -2, type: "wind" },
            { q: -1, r: 2, type: "wind" }
        ],
        CATACOMB_SCROLL_9: [
            { q: -1, r: -1, type: "void" },
            { q: 1, r: 1, type: "void" },
            { q: 1, r: -2, type: "wind" },
            { q: -1, r: 2, type: "wind" }
        ],
        CATACOMB_SCROLL_10: [
            { q: -1, r: -1, type: "fire" },
            { q: 1, r: 1, type: "fire" },
            { q: 1, r: -2, type: "void" },
            { q: -1, r: 2, type: "void" }
        ]
    };

    const scrolls = {};

    Object.entries(catacombBase).forEach(([scrollName, basePattern]) => {
        const scrollNum = parseInt(scrollName.split('_')[2]);

        // Create 3 rotational variations (0, 120, 240 degrees)
        const variations = [
            basePattern,
            basePattern.map(pos => ({
                ...rotateHex(pos.q, pos.r, 2),
                type: pos.type
            })),
            basePattern.map(pos => ({
                ...rotateHex(pos.q, pos.r, 4),
                type: pos.type
            }))
        ];

        scrolls[scrollName] = {
            name: `Catacomb Scroll ${scrollNum}`,
            description: `Multi-element pattern: gain +2 of each stone type (2 AP)`,
            level: 2,
            element: 'catacomb',
            patterns: variations
        };
    });

    return scrolls;
}

// Build complete scroll definitions
const SCROLL_DEFINITIONS = {
    ...generateElementalScrolls(),
    ...generateCatacombScrolls()
};

// Initial deck configurations
const SCROLL_DECKS = {
    earth: ['EARTH_SCROLL_1', 'EARTH_SCROLL_2', 'EARTH_SCROLL_3', 'EARTH_SCROLL_4', 'EARTH_SCROLL_5'],
    water: ['WATER_SCROLL_1', 'WATER_SCROLL_2', 'WATER_SCROLL_3', 'WATER_SCROLL_4', 'WATER_SCROLL_5'],
    fire: ['FIRE_SCROLL_1', 'FIRE_SCROLL_2', 'FIRE_SCROLL_3', 'FIRE_SCROLL_4', 'FIRE_SCROLL_5'],
    wind: ['WIND_SCROLL_1', 'WIND_SCROLL_2', 'WIND_SCROLL_3', 'WIND_SCROLL_4', 'WIND_SCROLL_5'],
    void: ['VOID_SCROLL_1', 'VOID_SCROLL_2', 'VOID_SCROLL_3', 'VOID_SCROLL_4', 'VOID_SCROLL_5'],
    catacomb: ['CATACOMB_SCROLL_1', 'CATACOMB_SCROLL_2', 'CATACOMB_SCROLL_3', 'CATACOMB_SCROLL_4', 'CATACOMB_SCROLL_5',
               'CATACOMB_SCROLL_6', 'CATACOMB_SCROLL_7', 'CATACOMB_SCROLL_8', 'CATACOMB_SCROLL_9', 'CATACOMB_SCROLL_10']
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SCROLL_DEFINITIONS = SCROLL_DEFINITIONS;
    window.SCROLL_DECKS = SCROLL_DECKS;
}
