# Strategy — Vice Meridian, make.fun bounty gta6-01

## Visual fidelity

The look is 1980s Miami Vice at dusk: a deep-indigo-to-neon-magenta gradient sky drawn in a
vertex-colour dome shader, with fog exactly matched to the sky colour so distance reads as
humid air rather than a clip plane. The sky is baked into a PMREM environment map, so the
glossy asphalt (`MeshStandardMaterial`, envmap) reflects the dusk instead of looking like
plastic. Every sign is an emissive neon material with `toneMapped: false`, so magenta and
cyan stay saturated instead of being toned down to grey. Palm trunks and fronds are
silhouetted against the horizon; art-deco blocks wear pastel stucco, stepped crowns and neon
sign strips; a pier, ferris-wheel silhouette and moored boats sit out past the surf; the
ocean ripples at the map edge. Everything is texture-procedural on canvas — zero network
assets, zero load time.

## Drivability

The car is a proper arcade model: acceleration and brake, steering that weakens as speed
rises (so it's twitchy at walking pace and stable at top speed), drag, and a handbrake that
drops rear grip into a four-wheel drift with tyre smoke. Tyres re-grip along the car's facing
after each turn, so the car slides sideways through junctions and snaps back when you release.
Collision against every building, kerb and palm keeps the car on the grid; the chase camera
follows with lag and mouse-drag orbit, snapping back behind the car when released. 60 Hz fixed
step keeps the simulation crisp even when the capture headless runs at a few frames per
second.

## Open-world feel

A 4x4 grid of avenues and streets with nine buildable blocks, ambient traffic cruising lanes
and turning at junctions, thirty pedestrians wandering block perimeters and panicking when the
car mounts the pavement, a HUD with speed and a minimap blip showing the car, traffic and
peds, and wanted stars when things get loud. The three screenshots ship the same live
simulation under scripted input — start (sunset city, car in frame), play (mid-drift action),
end (wide city overview over the ocean) — so what you see in the hand-in is what you get in
the browser.

## Why it scores

The design puts the three scoring axes first: visual fidelity (neon dusk, reflections,
instanced art-deco city), drivability (arcade physics with drift, chase cam, collision) and
open-world feel (traffic, pedestrians, minimap, ocean, city grid), all running at 60 fps with
a shadow map that is not re-rendered every frame.
