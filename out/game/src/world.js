// Vice Meridian — the simulation: the player's car, ambient traffic, pedestrians and XZ
// collision against the city colliders. Fixed 60 Hz step driven from main.js.

import { VEHICLE, TRAFFIC, PLAYER } from './config.js';
import { clamp, rdist2 } from './random.js';
import { Cars, updatePlayerCar } from './cars.js';
import { trafficRoutes } from './city.js';

export function createWorld(city, audio) {
  const colliders = city.colliders.slice();
  const pedRoutes = city.pedRoutes.slice();
  const cars = new Cars();
  const peds = [];
  let time = 0;

  const state = {
    wanted: 0,
    health: PLAYER.maxHealth,
    mode: 'driving',
    money: 250,
    messages: [],
  };

  const smoke = [];
  const SMOKE_MAX = 40;
  const player = {
    x: -40, z: -70, yaw: 0,
    health: PLAYER.maxHealth, radius: PLAYER.radius, height: PLAYER.height,
    inCar: true,
  };

  const car = cars.spawn(0, player.x, player.z, 0, 0, 0, false);
  car.paintColor = 0x33e6ff; // neon cyan player car, visible at dusk
  player.car = car;

  function message(text) {
    state.messages.push({ text, t: 0 });
    if (state.messages.length > 8) state.messages.shift();
  }

  function circleRect(cx, cz, r, box) {
    const closestX = clamp(cx, box.minX, box.maxX);
    const closestZ = clamp(cz, box.minZ, box.maxZ);
    const dx = cx - closestX, dz = cz - closestZ;
    return dx * dx + dz * dz <= r * r;
  }

  function collidesCircle(cx, cz, r) {
    for (const box of colliders) {
      if (box.soft) continue;
      if (circleRect(cx, cz, r, box)) return box;
    }
    return null;
  }

  function moveCircle(cx, cz, r, dx, dz) {
    let x = cx, z = cz;
    if (!collidesCircle(x + dx, z + dz, r)) return { x: x + dx, z: z + dz, blocked: false };
    if (!collidesCircle(x + dx, z, r)) { x += dx; return { x, z, blocked: false }; }
    if (!collidesCircle(x, z + dz, r)) { z += dz; return { x, z, blocked: false }; }
    return { x, z, blocked: true };
  }

  function routePoints(route) {
    const points = [];
    const steps = Math.abs(route.to - route.from) / 8;
    const forward = route.to > route.from;
    for (let s = 0; s <= steps; s += 1) {
      const t = forward ? s / steps : 1 - s / steps;
      const v = route.from + (route.to - route.from) * t;
      points.push({
        x: route.axis === 'x' ? v : route.fixed ?? route.x,
        z: route.axis === 'x' ? route.fixed ?? route.z : v,
      });
    }
    return points;
  }

  function spawnTraffic() {
    const routes = trafficRoutes();
    for (let i = 0; i < TRAFFIC.carCount; i += 1) {
      const route = routes[Math.floor(Math.random() * routes.length)];
      const lane = route.lanes[Math.floor(Math.random() * route.lanes.length)];
      const forward = route.to > route.from;
      const start = {
        x: route.axis === 'x' ? route.from : route.x + lane,
        z: route.axis === 'x' ? route.z + lane : route.from,
      };
      const c = cars.spawn(Math.floor(Math.random() * 3), start.x, start.z, forward ? 0 : Math.PI,
        TRAFFIC.minSpeed + Math.random() * 6, lane, false);
      c.route = routePoints(route);
      c.routeIndex = 0;
      c.targetSpeed = TRAFFIC.minSpeed + Math.random() * (TRAFFIC.maxSpeed - TRAFFIC.minSpeed);
    }
  }
  spawnTraffic();

  function spawnPed() {
    const attempts = pedRoutes.length * 4;
    for (let a = 0; a < attempts; a += 1) {
      const ri = Math.floor(Math.random() * pedRoutes.length);
      const route = pedRoutes[ri];
      const si = Math.floor(Math.random() * route.length);
      peds.push({
        x: route[si].x, z: route[si].z, yaw: Math.random() * Math.PI * 2,
        route, routeIndex: si, panic: 0, radius: 0.34,
      });
      return;
    }
  }
  for (let i = 0; i < 30; i += 1) spawnPed();

  function updatePeds(step) {
    const px = car.x, pz = car.z;
    for (const ped of peds) {
      const dx = px - ped.x, dz = pz - ped.z;
      if (dx * dx + dz * dz < 900) ped.panic = 8;
      if (ped.panic > 0) {
        ped.panic -= step;
        const away = Math.atan2(-dx, -dz);
        ped.yaw = away;
        const move = PLAYER.run * step;
        const res = moveCircle(ped.x, ped.z, ped.radius, -Math.sin(away) * move, Math.cos(away) * move);
        ped.x = res.x; ped.z = res.z;
        continue;
      }
      const target = ped.route[ped.routeIndex];
      const tdx = target.x - ped.x, tdz = target.z - ped.z;
      const tdist = Math.hypot(tdx, tdz);
      if (tdist < 3) { ped.routeIndex = (ped.routeIndex + 1) % ped.route.length; continue; }
      ped.yaw = Math.atan2(-tdx, tdz);
      const move = PLAYER.walk * step;
      const res = moveCircle(ped.x, ped.z, ped.radius, -Math.sin(ped.yaw) * move, Math.cos(ped.yaw) * move);
      ped.x = res.x; ped.z = res.z;
    }
  }

  function update(step, input) {
    if (input.justHorn && audio) audio.horn();

    car.handbrake = input.handbrake;
    const slip = updatePlayerCar(car, {
      forward: input.forward, back: input.back,
      left: input.left, right: input.right, handbrake: input.handbrake,
    }, step);

    // Tyre smoke when the rear breaks loose at speed.
    if (slip > 0.7 && car.speed > 5 && smoke.length < SMOKE_MAX && Math.floor(time * 60) % 4 === 0) {
      smoke.push({
        x: car.x - Math.sin(car.yaw) * 1.4 + (Math.random() - 0.5) * 0.6,
        z: car.z + Math.cos(car.yaw) * 1.4 + (Math.random() - 0.5) * 0.6,
        y: 0.16, life: 0.45 + Math.random() * 0.3, size: 0.25 + Math.random() * 0.2,
      });
    }

    const hit = collidesCircle(car.x, car.z, 2.4);
    if (hit) {
      const res = moveCircle(car.x, car.z, 2.4, -Math.sin(car.yaw) * 1.2, Math.cos(car.yaw) * 1.2);
      car.x = res.x; car.z = res.z;
      car.velocity.x *= 0.35; car.velocity.z *= 0.35;
      if (res.blocked) car.yaw += Math.PI * 0.5;
      if (slip > 0.5) message('Crunch.');
    }

    cars.updateTraffic(step);
    updatePeds(step);

    for (let i = smoke.length - 1; i >= 0; i -= 1) {
      const s = smoke[i];
      s.y += 0.4 * step;
      s.size += 0.4 * step;
      s.life -= step;
      if (s.life <= 0) smoke.splice(i, 1);
    }

    player.x = car.x; player.z = car.z; player.yaw = car.yaw;
    player.health = state.health;

    for (const m of state.messages) m.t += step;
    state.messages = state.messages.filter((m) => m.t < 4);
    time += step;

    return { slip, smoke };
  }

  return {
    state, player, car, cars, peds, colliders, update, smoke,
    time: () => time,
    tick: (dt) => { time += dt; },
  };
}
