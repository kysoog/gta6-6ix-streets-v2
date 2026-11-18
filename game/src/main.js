// Vice Meridian — boot and main loop. Two modes:
//   normal:   playable drive (WASD, Shift boost, Space handbrake, mouse drag orbits the chase cam)
//   shot:     ?shot=start|play|end&seed=N — staged autopilot; window.__shotReady when ready
//             for the capture driver. Everything here is the live simulation.
import * as THREE from 'three';
import { STEP, MAX_FRAME } from './config.js';
import { createRandom } from './random.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createSky } from './sky.js';
import { buildCity } from './city.js';
import { createWorld } from './world.js';
import { makeShots } from './shots.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10);
const isShot = shotName !== null;

const render = createRenderer(canvas, (text) => {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
});
const { renderer, scene, camera, updateHUD, drawMinimap, syncPeds, setCars, shadowTick, syncSmoke } = render;

const audio = createAudio();
let audioStarted = false;

const sky = createSky(scene, renderer);

const city = buildCity(seed, createRandom(seed));
scene.add(city.group);

const world = createWorld(city, audio);
scene.add(world.cars.group);

setCars(world.cars);

const input = createInput();
const shots = makeShots(world, input, renderer, scene, camera, sky, render.announce);
let shotScene = null;
if (isShot) shotScene = shots.run(shotName, seed);

sky.follow(0, 0);

window.addEventListener('click', () => {
  if (!audioStarted) { audio.start(); audioStarted = true; }
});

let lastTime = performance.now();
let delta = 0;
let dtEma = 0;
let camInit = false;
let shotFrame = 0;

function followCamera(target, step) {
  // Orbit offset from mouse drag, decaying back to behind the car.
  const orbitYaw = input.state.camYaw * 0.5;
  const ideal = new THREE.Vector3(
    target.x + Math.sin(target.yaw + orbitYaw) * 7, 3.2, target.z - Math.cos(target.yaw + orbitYaw) * 7,
  );
  if (!camInit) { camera.position.copy(ideal); camInit = true; }
  camera.position.lerp(ideal, Math.min(step * 10, 1));
  camera.lookAt(target.x - Math.sin(target.yaw + orbitYaw) * 10, 1.4, target.z + Math.cos(target.yaw + orbitYaw) * 10);
}

function simStep(dt, shotInput) {
  const curInput = shotInput || input.read();
  const result = world.update(dt, curInput);
  const pos = world.car;
  followCamera(pos, dt);
  syncPeds(world.peds);
  syncSmoke(result.smoke);
  world.cars.sync();
  updateHUD(world.state, world, dt);
  drawMinimap(world, city);
  shadowTick();
  audio.engineLoop(pos.speed);
  audio.sirenLoop(world.state.wanted > 0);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!audioStarted) { audio.start(); audioStarted = true; }
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), MAX_FRAME);
  lastTime = now;
  dtEma = dtEma * 0.9 + dt * 0.1;

  if (isShot) {
    shotScene.step(STEP);
    shotFrame += 1;
    simStep(STEP, { ...input.state, camYaw: 0 });
    renderer.render(scene, camera);
    return;
  }

  delta += dt;
  while (delta >= STEP) {
    simStep(STEP, null);
    delta -= STEP;
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(frame);

window.__dbg = { scene, camera, renderer, world, city };
