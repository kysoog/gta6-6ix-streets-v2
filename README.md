# Vice Meridian

1980s Miami Vice open-world crime sandbox built on three.js (r160) — my entry for the make.fun bounty [gta6-01](https://make.fun/bounty/gta6-01).

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kysoog/gta6-6ix-streets-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kysoog/gta6-6ix-streets-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon magenta and cyan signage, palm silhouettes, pastel art-deco blocks, wet asphalt reflections, a dusk-gradient sky with fog matched to the horizon, and an ocean at the map edge. Drive the grid, drift through junctions, watch the traffic and the pedestrians.

## Play

```
node serve.ts
# open http://localhost:8080
```

Or let the entry shoot itself:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| Control | Action |
|---------|--------|
| W / S | accelerate / brake-reverse |
| A / D | steer |
| Shift | boost |
| Space | handbrake drift |
| Mouse drag | orbit the chase camera |
| H | horn |

The chase camera follows the car with lag and settles behind it when you let go of the mouse. Speed and money show on the HUD; the minimap in the lower right marks your car as a yellow blip with traffic and pedestrians as dots.

## Tech

- three.js r160, `WebGLRenderer` with antialias, vendored under `game/vendor/`
- Vertex-colour gradient sky dome (shader), tone-mapped off so neon stays neon; fog matched to the sky
- Instanced meshes for palms and traffic, one draw call per class
- `MeshStandardMaterial` asphalt with an environment map baked from the sky
- Emissive neon materials (`toneMapped: false`) on every sign
- Shadow map refreshed occasionally, never every frame
- All textures drawn procedurally on `<canvas>` — no image or network assets
- Fixed 60 Hz simulation step; headless capture driven by `main.ts` via Chromium DevTools

---

<sub>Entered on [make.fun](https://make.fun/?ref=9qknf5gs&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
