# Crossy Road: Custom Edition

A browser remake of Crossy Road built with [Three.js](https://threejs.org), with
dynamic weather and support for your own 3D characters.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # static build in dist/ (works from any folder, e.g. GitHub Pages)
```

## How to play

- **Arrows / WASD** to hop. On touch screens, tap to hop forward or swipe to hop in a direction.
- **Esc** pauses, **Space** retries after a game over.
- Cross roads, rivers (ride the logs, hop on lily pads) and railways (watch the flashing signal).
- Don't fall behind or stand still too long — the eagle is watching.

## Dynamic weather

Weather changes every 20–40 seconds during a run and blends smoothly between states. Each one changes the gameplay:

| Weather | Effect |
| --- | --- |
| ☀️ Clear | Normal conditions |
| 🌧️ Rain | Wet roads: traffic is 20% faster, reduced visibility |
| ⛈️ Thunderstorm | Dark skies, faster traffic and river. Lightning strikes are marked on the ground by a flashing ring — move off it or get zapped |
| ❄️ Snowfall | Snow settles on the ground and trees; traffic and logs slow down |
| 🌫️ Thick Fog | You can only see a few lanes ahead |
| 🌬️ Gale | The river runs 70% faster; trees sway |
| 🔥 Heatwave | Traffic is 35% faster |

You can also lock the game to a single weather type from the main menu.

## Custom characters (FBX / VRM)

Click **＋ Import FBX / VRM** on the main menu (or drag and drop files onto it).

- Models are scaled to character size automatically and saved in your browser (IndexedDB), so they stay after a reload.
- **VRM** (0.x and 1.0) models get their arms lowered from the T-pose, and their spring bones (hair, clothes) animate.
- **FBX** models play their idle animation if the file contains one (otherwise the first animation). Textures must be embedded in the FBX; missing external textures fall back to the material colour.
- If a model faces the wrong way, use the **⟳** button on its card. **✕** deletes it.

## Distance records

The game records the furthest distance (rows crossed) and the number of runs for **every character**, including imported ones. Records are shown on each character card, in the in-game HUD and on the game-over screen, and are stored in `localStorage`.

## Project layout

| File | Purpose |
| --- | --- |
| `src/main.js` | Game loop, player movement, camera, UI |
| `src/world.js` | Procedural lanes: grass, roads, rivers, railways |
| `src/weather.js` | Weather states, transitions, particles, lightning |
| `src/characters.js` | Built-in characters plus FBX/VRM import, normalisation and thumbnails |
| `src/models.js` | Voxel meshes for the world and built-in characters |
| `src/storage.js` | IndexedDB (imported models) and localStorage (records) |
| `src/audio.js` | Synthesised sound effects |
