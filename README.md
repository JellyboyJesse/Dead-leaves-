# Leaf Fall

A wind-driven sequencer. Leaves hang on a canopy grid, the wind and gusts decide when each one lets go, and the leaf plays its note when it lands. Every note's envelope is a staged leaf-decay model: soluble material leaches first, the cellulose waits through a microbial lag then breaks down, and lignin is the long tail. On screen, landed leaves brown and fade the same way, ending as vein skeletons.

## Sound engine

All sound runs in one AudioWorklet (`www/js/leaf-worklet.js`).

- **Seven engines, chosen per tree:** FM bell, Karplus-Strong pluck (optionally bowed), tuned-noise rustle, stretched additive glass, modal wood, detuned drone with needle clicks, and a grain swarm.
- **Decay drives timbre, not just volume:** brightness follows the soluble and cellulose pools, so high partials die first.
- **Lignin tail layer:** none, sub octave, earth rumble or metal ring.
- **Each leaf is different:** size and water content shift pitch, brightness and envelope; position sets stereo pan; scale-degree wander.
- **The ground plays too:** litter rustle and crackle scale with how much is on the ground, wind is audible, rain leaches and brightens every ringing note, and priming speeds decay as litter builds up.
- **Space:** a generated reverb whose high end is damped by the litter, then a limiter.

## Running it

- **In a browser:** `npm run serve`, then open http://localhost:8080. It needs a local server (not `file://`) because of the AudioWorklet.
- **Android:** every push to `main` builds an APK with GitHub Actions and attaches it to a Release, the same pipeline as Solfège Pulses. The fixed debug key lets each new APK install over the last.
- **Test page:** `pages.yml` publishes `www/` to GitHub Pages. That needs a public repo (or a paid plan) and Settings > Pages > Source set to GitHub Actions.

## Tests

- `node tests/engine-test.mjs [--wav]` runs every engine outside the browser and checks for NaNs, clipping, loudness and decay. `--wav` writes samples to `tests/out/`.
- `python3 tests/browser-test.py` loads the app in headless Chromium at phone size, plays it and saves screenshots.

## Files

- `www/js/species.js`: tree library, parameter ranges, scales, the staged decay model
- `www/js/state.js`: forest settings, built-in presets, saving
- `www/js/forest.js`: canopy, wind, gusts, rain and building each leaf's note
- `www/js/scene.js`: drawing
- `www/js/ui.js`: grid and editors
- `www/js/audio.js`: audio graph

Decay rates are plausible ballparks for temperate leaf litter, tuned for sound rather than fitted to data.
