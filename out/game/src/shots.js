// Vice Meridian — shot autopilot: three staged scenes (start, play, end) that run the real
// simulation forward under scripted input, deterministic per seed. window.__shotReady flips
// once the scene has settled, and the capture driver shoots the frame. Live sim, no posed
// dioramas.

import * as THREE from 'three';
import { createRandom } from './random.js';
import { updatePlayerCar } from './cars.js';
import { VEHICLE } from './config.js';

const SETTLE = { start: 100, play: 140, end: 100 };

export function makeShots(world, input, renderer, scene, camera, sky, announce) {
  const scenes = {};

  scenes.start = (seed) => {
    const random = createRandom(seed);
    let frame = 0;
    const cx = random() * 40 - 20;
    const cz = random() * 40 - 20;
    const car = world.car;
    car.x = cx; car.z = cz; car.yaw = 0;
    car.velocity = { x: 0, z: 0 }; car.speed = 0;
    car.paintColor = 0x33e6ff;
    const title = document.createElement('div');
    title.id = 'shot-title';
    title.style.cssText = 'position:absolute;inset:0;z-index:40;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f6f1e6;text-align:center;';
    title.innerHTML = '<div style="font-size:56px;font-weight:900;letter-spacing:0.35em;text-transform:uppercase;color:#f6f1e6;text-shadow:0 4px 20px #000;">VICE MERIDIAN</div><div style="font-size:18px;opacity:0.85;letter-spacing:0.3em;margin-top:12px;text-transform:uppercase;">dusk on the neon mile</div>';
    document.body.appendChild(title);
    return {
      enter() { title.style.display = 'flex'; },
      step(dt) {
        frame += 1;
        const settled = frame >= SETTLE.start - 8;
        const angle = settled ? Math.PI + 0.35 : frame * 0.05;
        const radius = settled ? 26 : 50 + Math.sin(frame * 0.07) * 4;
        const height = settled ? 13 : 24 + Math.sin(frame * 0.09) * 3;
        camera.position.set(cx + Math.sin(angle) * radius, height, cz + Math.cos(angle) * radius);
        camera.lookAt(cx, settled ? 1.2 : 1, cz);
        sky.follow(cx, cz);
        world.update(1 / 60, { forward: false, back: false, left: false, right: false, handbrake: false, justHorn: false });
        if (frame === 1) announce('Vice Meridian — dusk on the neon mile');
        if (frame >= SETTLE.start) window.__shotReady = true;
      },
      exit() {
        title.style.display = 'none';
        document.getElementById('shot-title')?.remove();
      },
    };
  };

  scenes.play = (seed) => {
    const random = createRandom(seed);
    let frame = 0;
    const car = world.car;
    car.x = -28; car.z = -40; car.yaw = 0;
    car.velocity = { x: 0, z: 0 }; car.speed = 26;
    velocityAlong(car, car.speed);
    car.paintColor = 0xffd166;
    input.state.forward = true;
    input.state.handbrake = true;
    let steerDir = 1;
    return {
      enter() {},
      step(dt) {
        frame += 1;
        if (frame % 70 === 0) steerDir = random() < 0.5 ? -1 : 1;
        input.state.left = steerDir < 0;
        input.state.right = steerDir > 0;
        const { slip } = world.update(1 / 60, {
          forward: true, back: false, left: input.state.left, right: input.state.right,
          handbrake: true, justHorn: false,
        });
        sky.follow(car.x, car.z);
        followCamera(camera, car, 1 / 60);
        if (frame >= SETTLE.play) window.__shotReady = true;
      },
      exit() {
        input.state.forward = false; input.state.left = false; input.state.right = false;
        input.state.handbrake = false;
      },
    };
  };

  scenes.end = (seed) => {
    const random = createRandom(seed);
    let frame = 0;
    const car = world.car;
    car.x = 0; car.z = -10; car.yaw = 0;
    car.velocity = { x: 0, z: 0 }; car.speed = 0;
    car.paintColor = 0x33e6ff;
    return {
      enter() {},
      step(dt) {
        frame += 1;
        // Wide city overview at dusk: the Neon Mile in the centre, the ocean at the map's east edge.
        const angle = 0.55 + Math.sin(frame * 0.015) * 0.06;
        const radius = 175;
        camera.position.set(-Math.sin(angle) * radius - 20, 72, Math.cos(angle) * radius - 10);
        camera.lookAt(40, 0, -12);
        sky.follow(40, -12);
        world.update(1 / 60, { forward: false, back: false, left: false, right: false, handbrake: false, justHorn: false });
        if (frame >= SETTLE.end) window.__shotReady = true;
      },
      exit() {},
    };
  };

  let audioScream = null;
  return {
    run(shotName, seed) {
      const sceneFn = scenes[shotName];
      if (!sceneFn) throw new Error(`unknown shot: ${shotName}`);
      return sceneFn(seed);
    },
    /** Called by main.js once the audio context is live, so the drift shot can howl. */
    setScream(fn) { audioScream = fn; },
  };
}

function velocityAlong(car, speed) {
  car.velocity.x = -Math.sin(car.yaw) * speed;
  car.velocity.z = Math.cos(car.yaw) * speed;
}

function followCamera(camera, car, step) {
  const ideal = new THREE.Vector3(
    car.x + Math.sin(car.yaw) * 7, 3.2, car.z - Math.cos(car.yaw) * 7,
  );
  camera.position.lerp(ideal, Math.min(step * 10, 1));
  camera.lookAt(car.x - Math.sin(car.yaw) * 10, 1.2, car.z + Math.cos(car.yaw) * 10);
}
