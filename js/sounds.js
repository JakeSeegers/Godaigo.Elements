(function () {
    'use strict';

    const BASE = 'sounds/';
    const FOOTSTEP_DIR = 'sounds/footsteps/';

    // Sequential footstep rotation — cycles through all files so no step repeats consecutively
    const FOOTSTEP_FILES = [
        'step_cloth1.ogg',
        'step_cloth2.ogg',
        'step_cloth3.ogg',
        'step_cloth4.ogg',
        'step_lth1.ogg',
        'step_lth2.ogg',
        'step_lth33.ogg',
        'step_lth4.ogg',
        'step_metal.ogg',
        'step_metal (2).ogg',
        'step_metal (3).ogg',
        'step_metal (4).ogg',
    ];

    const SOUNDS = {
        click:          BASE + 'clicksounds.mp3',
        activatescroll: BASE + 'activatescroll.mp3',
        breakstone:     BASE + 'breakstone.mp3',
        collectstones:  BASE + 'collectstones.mp3',
        placestone:     BASE + 'placeearthstone.mp3',
        placetile:      BASE + 'placetile.mp3',
        scrollmove:     BASE + 'scrollmove.mp3',
        tilereveal:     BASE + 'tilereveal.mp3',
        wincondition:   BASE + 'wincondition.mp3',
        fireactivates:  BASE + 'fireactivates.mp3',
        wateractivates: BASE + 'wateractivates.mp3',
        windactivates:  BASE + 'windactivates.mp3',
        voidactivates:  BASE + 'voidactivates.mp3',
    };

    // Element-specific win-condition sounds; earth and catacomb fall back to generic
    const ELEMENT_WIN_SOUNDS = {
        fire:     'fireactivates',
        water:    'wateractivates',
        wind:     'windactivates',
        void:     'voidactivates',
        earth:    'wincondition',
        catacomb: 'wincondition',
    };

    let footstepIndex = 0;
    let winConditionLastPlayed = 0; // debounce — prevent double-fire within same cast

    function play(name, volume = 1.0) {
        const src = SOUNDS[name];
        if (!src) { console.warn(`SoundSystem: unknown sound "${name}"`); return; }
        const audio = new Audio(src);
        audio.volume = volume;
        audio.play().catch(() => {}); // silently ignore autoplay policy blocks
    }

    function playFootstep() {
        const file = FOOTSTEP_FILES[footstepIndex % FOOTSTEP_FILES.length];
        footstepIndex++;
        const audio = new Audio(FOOTSTEP_DIR + file);
        audio.volume = 0.7;
        audio.play().catch(() => {});
    }

    // Plays the element-specific win-condition sound (debounced so multi-add calls in one cast only fire once)
    function onWinCondition(element) {
        const now = Date.now();
        if (now - winConditionLastPlayed < 300) return;
        winConditionLastPlayed = now;
        const soundName = ELEMENT_WIN_SOUNDS[element] || 'wincondition';
        play(soundName);
    }

    window.SoundSystem = { play, playFootstep, onWinCondition };
    console.log('🔊 SoundSystem loaded');
})();
