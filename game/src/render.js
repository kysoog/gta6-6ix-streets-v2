// Vice Meridian — the renderer: three.js r160, one WebGLRenderer with antialias, a follow
// camera with lag, instanced traffic and pedestrians, a DOM HUD (speed, minimap blip, wanted
// stars) and a shadow map that is refreshed only now and then, never every frame.

import * as THREE from 'three';
import { CITY, PALETTE, WANTED } from './config.js';

const TEXT = 'Vice Meridian — 1980s Miami Vice sandbox. WASD drive · Shift boost · Space handbrake · mouse drag orbits the chase camera · H horn';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.bias = -0.0004;
  renderer.shadowMap.normalBias = 0.02;
  // Shadows are cast by the static sun over a static city: refresh the shadow map only now and
  // then, never every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.4, 900);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;font-family:ui-sans-serif,system-ui,sans-serif;color:#f6f1e6;text-shadow:0 2px 4px #000;';
  canvas.parentNode.appendChild(hud);

  const status = document.getElementById('status') || (() => {
    const el = document.createElement('p');
    el.id = 'status'; el.role = 'status'; el.ariaLive = 'polite';
    el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
    document.body.appendChild(el);
    return el;
  })();

  // ---------- HUD ----------
  const speedEl = document.createElement('div');
  speedEl.style.cssText = 'position:absolute;left:16px;bottom:70px;font-size:20px;font-variant-numeric:tabular-nums;font-weight:700;';
  speedEl.textContent = '0 km/h';
  hud.appendChild(speedEl);

  const moneyEl = document.createElement('div');
  moneyEl.style.cssText = 'position:absolute;right:18px;top:16px;font-size:20px;font-variant-numeric:tabular-nums;';
  moneyEl.textContent = '$250';
  hud.appendChild(moneyEl);

  const modeEl = document.createElement('div');
  modeEl.style.cssText = 'position:absolute;right:18px;top:46px;font-size:12px;opacity:0.8;letter-spacing:0.16em;text-transform:uppercase;';
  modeEl.textContent = 'DRIVING';
  hud.appendChild(modeEl);

  const messages = document.createElement('div');
  messages.style.cssText = 'position:absolute;left:16px;bottom:130px;width:300px;font-size:13px;line-height:1.55;opacity:0.95;';
  messages.innerHTML = '';
  hud.appendChild(messages);

  const minimapWrap = document.createElement('div');
  minimapWrap.style.cssText = 'position:absolute;right:16px;bottom:70px;width:156px;height:156px;background:rgba(11,14,24,0.55);border:1px solid #4a4658;border-radius:2px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.6);';
  const minimap = document.createElement('canvas');
  minimap.width = 156; minimap.height = 156;
  minimap.style.display = 'block';
  minimapWrap.appendChild(minimap);
  hud.appendChild(minimapWrap);
  const mmCtx = minimap.getContext('2d');

  const wantedRow = document.createElement('div');
  wantedRow.style.cssText = 'position:absolute;left:16px;top:14px;display:flex;gap:8px;font-size:22px;line-height:1;';
  const stars = [];
  for (let i = 0; i < WANTED.max; i += 1) {
    const s = document.createElement('span');
    s.textContent = '\u2606';
    s.style.color = 'rgba(246,241,230,0.35)';
    wantedRow.appendChild(s);
    stars.push(s);
  }
  hud.appendChild(wantedRow);

  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:14px;font-size:12px;opacity:0.75;text-shadow:0 2px 4px #000;white-space:nowrap;letter-spacing:0.06em;';
  hint.textContent = TEXT;
  hud.appendChild(hint);

  const debugEl = document.createElement('div');
  debugEl.style.cssText = 'position:absolute;right:10px;bottom:10px;font-size:11px;line-height:1.4;opacity:0.5;text-align:right;text-shadow:0 1px 2px #000;';
  debugEl.textContent = '';
  hud.appendChild(debugEl);

  let shadowFrames = 0;

  // ---------- instanced pedestrians ----------
  const pedBodiesMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 1.05, 0.34),
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, vertexColors: true }), 64);
  const pedHeadsMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.9, metalness: 0 }), 64);
  pedHeadsMesh.castShadow = true;
  pedBodiesMesh.castShadow = true; pedBodiesMesh.receiveShadow = true;
  scene.add(pedBodiesMesh, pedHeadsMesh);
  const pedColors = [];
  for (let i = 0; i < 64; i += 1) {
    pedBodiesMesh.setMatrixAt(i, new THREE.Matrix4());
    pedHeadsMesh.setMatrixAt(i, new THREE.Matrix4());
    pedColors.push(new THREE.Color(0x6aa84f));
  }

  function syncPeds(peds) {
    for (let i = 0; i < peds.length; i += 1) {
      const ped = peds[i];
      const m = new THREE.Matrix4().makeRotationY(ped.yaw);
      m.setPosition(ped.x, 0.55, ped.z);
      m.multiply(new THREE.Matrix4().makeScale(1.1, 1.1, 1.1));
      pedBodiesMesh.setMatrixAt(i, m);
      const h = new THREE.Matrix4().makeRotationY(ped.yaw);
      h.setPosition(ped.x, 1.35, ped.z);
      h.multiply(new THREE.Matrix4().makeScale(1.1, 1.1, 1.1));
      pedHeadsMesh.setMatrixAt(i, h);
      const color = pedColors[i];
      color.set(ped.panic > 0 ? 0xe2432f : 0x6aa84f);
      pedBodiesMesh.setColorAt(i, color);
    }
    pedBodiesMesh.count = peds.length;
    pedHeadsMesh.count = peds.length;
    pedBodiesMesh.instanceMatrix.needsUpdate = true;
    pedBodiesMesh.instanceColor.needsUpdate = true;
    pedHeadsMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- tyre smoke ----------
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  smokeGeo.translate(0, 0.5, 0);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xddddee, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, 40);
  smokeMesh.frustumCulled = false;
  scene.add(smokeMesh);
  for (let i = 0; i < 40; i += 1) smokeMesh.setMatrixAt(i, new THREE.Matrix4());

  function syncSmoke(smoke) {
    let n = 0;
    for (const s of smoke) {
      const m = new THREE.Matrix4();
      m.setPosition(s.x, s.y, s.z);
      m.multiply(new THREE.Matrix4().makeScale(s.size, s.size, s.size));
      smokeMesh.setMatrixAt(n, m);
      n += 1;
    }
    smokeMesh.count = n;
    smokeMesh.instanceMatrix.needsUpdate = true;
  }

  let carsRef = null;

  function setCars(cars) {
    carsRef = cars;
    if (cars && cars.group) scene.add(cars.group);
    if (cars && typeof cars.sync === 'function') cars.sync();
  }

  const mmScale = 156 / (CITY.bounds * 2 + 96);
  function mapX(x, cx) { return 78 + (x - cx) * mmScale; }
  function mapY(z, cz) { return 78 + (z - cz) * mmScale; }

  function drawMinimapImpl(world, city) {
    const cx = world.car.x;
    const cz = world.car.z;
    const yaw = world.car.yaw;
    const c = mmCtx;
    c.clearRect(0, 0, 156, 156);
    c.fillStyle = '#141824'; c.fillRect(0, 0, 156, 156);
    c.strokeStyle = PALETTE.minimapRoads; c.lineWidth = 4;
    for (const x of CITY.roads) {
      c.beginPath(); c.moveTo(mapX(x, cx), mapY(-CITY.bounds - 40, cz)); c.lineTo(mapX(x, cx), mapY(CITY.bounds + 40, cz)); c.stroke();
    }
    for (const z of CITY.roads) {
      c.beginPath(); c.moveTo(mapX(-CITY.bounds - 40, cx), mapY(z, cz)); c.lineTo(mapX(CITY.bounds + 40, cx), mapY(z, cz)); c.stroke();
    }
    c.fillStyle = PALETTE.minimapSand;
    c.fillRect(mapX(CITY.sandStart, cx), mapY(-CITY.bounds - 40, cz), 32 * mmScale, (CITY.bounds * 2 + 80) * mmScale);
    c.fillStyle = PALETTE.minimapWater;
    c.fillRect(mapX(CITY.waterStart, cx), mapY(-CITY.bounds - 40, cz), 120 * mmScale, (CITY.bounds * 2 + 80) * mmScale);
    // player blip
    c.fillStyle = '#ffd166';
    c.beginPath(); c.arc(78, 78, 5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffd166'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(78, 78); c.lineTo(78 - Math.sin(yaw) * 14, 78 + Math.cos(yaw) * 14); c.stroke();
    for (const c2 of world.cars.cars) {
      c.fillStyle = c2.police ? '#ff3d5a' : '#b9c2d0';
      c.fillRect(mapX(c2.x, cx) - 1.5, mapY(c2.z, cz) - 1.5, 3, 3);
    }
    for (const ped of world.peds) {
      c.fillStyle = ped.panic > 0 ? '#ff3d5a' : '#6aa84f';
      c.fillRect(mapX(ped.x, cx) - 1, mapY(ped.z, cz) - 1, 2, 2);
    }
  }

  return {
    renderer, scene, camera, hud, status,
    syncPeds, setCars, syncSmoke,
    resize() {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    },
    announce(text) { status.textContent = text; },
    setDebug(text) { debugEl.textContent = text; },
    updateHUD(state, world, dt) {
      speedEl.textContent = `${Math.floor((world.car ? world.car.speed : 0) * 3.6)} km/h`;
      moneyEl.textContent = `$${Math.floor(state.money)}`;
      modeEl.textContent = 'DRIVING — SEDAN';
      const html = state.messages.map((m) => `<div>${m.text}</div>`).join('');
      messages.innerHTML = html;
      state.messages.forEach((m) => { m.t += dt; });
      state.messages = state.messages.filter((m) => m.t < 4);
      for (let i = 0; i < WANTED.max; i += 1) {
        const on = i < state.wanted;
        stars[i].textContent = on ? '\u2605' : '\u2606';
        stars[i].style.color = on ? '#ffd166' : 'rgba(246,241,230,0.35)';
        stars[i].style.textShadow = on ? '0 0 14px #ffd166' : '0 0 10px rgba(255,61,90,0)';
      }
      status.textContent = `Speed ${Math.floor((world.car ? world.car.speed : 0) * 3.6)} km/h, $${Math.floor(state.money)}`;
    },
    drawMinimap(world, city) {
      drawMinimapImpl(world, city);
    },
    shadowTick() {
      shadowFrames += 1;
      if (shadowFrames % 60 === 0) renderer.shadowMap.needsUpdate = true;
    },
  };
}
