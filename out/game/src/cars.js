// Vice Meridian — vehicles: an arcade driving model (acceleration, steering that scales with
// speed, handbrake drift, tyre smoke) plus traffic cars cruising the road network. Every car of
// a type is one InstancedMesh (body paint, trim, emissive lights); all traffic costs a handful
// of draw calls and per-instance colour/matrices are streamed each frame.

import * as THREE from 'three';
import { VEHICLE, LANES, PALETTE } from './config.js';

export const CAR_TYPES = [
  { name: 'sedan', length: 4.4, width: 1.7, height: 1.45 },
  { name: 'coupe', length: 4.3, width: 1.8, height: 1.25 },
  { name: 'suv', length: 4.6, width: 1.95, height: 1.65 },
  { name: 'cruiser', length: 4.5, width: 1.85, height: 1.55 },
];

const PAINT = [0xff2d55, 0xf0c53c, 0x2b4da8, 0xe8e8f0, 0x4a4a4a, 0xf7c9b4, 0x2a7d4c, 0x7d4a18];

function carBody(type) {
  const l = type.length, w = type.width, h = type.height;
  const pts = [];
  const quad = (a, b, c, d) => { pts.push(...a, ...b, ...c, ...a, ...c, ...d); };
  const box = (x0, x1, y0, y1, z0, z1) => {
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  };
  box(-w / 2, w / 2, 0.14, 0.6, -l / 2, l / 2);
  const cabin = -l / 2 + 0.9;
  box(-w * 0.42, w * 0.42, 0.6, h, cabin, l / 2);
  const hood = l / 2 - 1.1;
  const hoodGeo = [];
  const tri = (a, b, c) => { pts.push(...a, ...b, ...c); };
  tri([-w * 0.42, 0.6, cabin], [w * 0.42, 0.6, cabin], [w * 0.34, 0.6, hood]);
  tri([-w * 0.42, 0.6, cabin], [w * 0.34, 0.6, hood], [-w * 0.34, 0.6, hood]);
  tri([-w * 0.42, h, cabin], [w * 0.42, h, cabin], [w * 0.34, h * 0.6, hood]);
  tri([-w * 0.42, h, cabin], [w * 0.34, h * 0.6, hood], [-w * 0.34, h * 0.6, hood]);
  // sides of hood
  tri([w * 0.42, 0.6, cabin], [w * 0.42, h, cabin], [w * 0.34, h * 0.6, hood]);
  tri([w * 0.42, 0.6, cabin], [w * 0.34, h * 0.6, hood], [w * 0.34, 0.6, hood]);
  tri([-w * 0.42, h, cabin], [-w * 0.42, 0.6, cabin], [-w * 0.34, h * 0.6, hood]);
  tri([-w * 0.42, 0.6, cabin], [-w * 0.34, h * 0.6, hood], [-w * 0.34, 0.6, hood]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return g;
}

function carTypeMesh(type, count) {
  const bodyGeo = carBody(type);
  const l = type.length, w = type.width, h = type.height;
  const trim = [];
  const light = (x, z, colour) => {
    const hh = 0.14, ww = 0.22;
    trim.push(x - ww, 0.32 - hh, z, x + ww, 0.32 - hh, z, x + ww, 0.32 + hh, z,
      x - ww, 0.32 - hh, z, x + ww, 0.32 + hh, z, x - ww, 0.32 + hh, z);
  };
  light(-w / 2 + 0.25, -l / 2 - 0.05, 0xff2a2a);
  light(w / 2 - 0.25, -l / 2 - 0.05, 0xff2a2a);
  light(-w / 2 + 0.25, l / 2 + 0.05, 0xfff4ea);
  light(w / 2 - 0.25, l / 2 + 0.05, 0xfff4ea);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(trim, 3));
  tg.computeVertexNormals();

  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.35, envMapIntensity: 0.8, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f29, roughness: 0.55, metalness: 0.5, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false, side: THREE.DoubleSide });
  const headGlow = new THREE.MeshBasicMaterial({ color: 0xfff4ea, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });

  const headPts = [];
  const headLight = (x) => {
    const h = 0.3;
    headPts.push(x - h, 0.42, l / 2 + 0.05, x + h, 0.42, l / 2 + 0.05, x + h, 0.72, l / 2 + 0.05,
      x - h, 0.42, l / 2 + 0.05, x + h, 0.72, l / 2 + 0.05, x - h, 0.72, l / 2 + 0.05);
  };
  headLight(-w / 2 + 0.25); headLight(w / 2 - 0.25);
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute('position', new THREE.Float32BufferAttribute(headPts, 3));
  headGeo.computeVertexNormals();

  const bodies = new THREE.InstancedMesh(bodyGeo, paint, Array(count).fill(new THREE.Matrix4()));
  const trims = new THREE.InstancedMesh(tg, dark, Array(count).fill(new THREE.Matrix4()));
  const lights = new THREE.InstancedMesh(tg, glow, Array(count).fill(new THREE.Matrix4()));
  const headlights = new THREE.InstancedMesh(headGeo, headGlow, Array(count).fill(new THREE.Matrix4()));
  bodies.castShadow = true; bodies.receiveShadow = true;
  trims.castShadow = true; trims.receiveShadow = true;
  return { bodies, trims, lights, headlights, type, paint, count };
}

export function createCar(typeIndex, x, z, yaw, speed, lane, police) {
  return {
    id: Symbol(), typeIndex, x, z, y: 0.3, yaw, speed, lane, targetSpeed: speed,
    velocity: { x: 0, z: 0 }, handbrake: false, health: VEHICLE.health,
    onFire: false, route: [], routeIndex: 0, police: !!police,
    paintColor: PAINT[Math.floor(Math.random() * PAINT.length)],
    drift: 0,
  };
}

export class Cars {
  constructor() {
    this.types = CAR_TYPES.map((type, i) => carTypeMesh(type, 40));
    for (const mesh of this.types) {
      mesh.bodies.visible = false; mesh.trims.visible = false; mesh.lights.visible = false;
    }
    this.cars = [];
    this.nextId = 0;
    this.group = new THREE.Group();
    this.group.name = 'cars';
    for (const mesh of this.types) this.group.add(mesh.bodies, mesh.trims, mesh.lights, mesh.headlights);
  }

  spawn(typeIndex, x, z, yaw, speed, lane = 0, police = false) {
    const ti = ((typeIndex % CAR_TYPES.length) + CAR_TYPES.length) % CAR_TYPES.length;
    const car = createCar(ti, x, z, yaw, speed, lane, police);
    car.id = this.nextId++;
    this.cars.push(car);
    return car;
  }

  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  sync() {
    for (const mesh of this.types) {
      const bodies = [], trims = [], lights = [], headlights = [], colors = [];
      this.cars.forEach((car) => {
        if (CAR_TYPES[car.typeIndex] !== mesh.type) return;
        const m = new THREE.Matrix4().makeRotationY(car.yaw);
        m.setPosition(car.x, 0.3, car.z);
        bodies.push(m); trims.push(m); lights.push(m); headlights.push(m);
        colors.push(new THREE.Color(car.paintColor));
      });
      const on = bodies.length > 0;
      const n = Math.max(bodies.length, 1);
      mesh.bodies.count = n; mesh.trims.count = n; mesh.lights.count = n; mesh.headlights.count = n;
      mesh.bodies.visible = on; mesh.trims.visible = on; mesh.lights.visible = on; mesh.headlights.visible = on;
      if (!on) return;
      for (let i = 0; i < bodies.length; i += 1) {
        mesh.bodies.setMatrixAt(i, bodies[i]);
        mesh.trims.setMatrixAt(i, trims[i]);
        mesh.lights.setMatrixAt(i, lights[i]);
        mesh.headlights.setMatrixAt(i, headlights[i]);
        mesh.bodies.setColorAt(i, colors[i]);
      }
      mesh.bodies.instanceMatrix.needsUpdate = true;
      if (mesh.bodies.instanceColor) mesh.bodies.instanceColor.needsUpdate = true;
      mesh.trims.instanceMatrix.needsUpdate = true;
      mesh.lights.instanceMatrix.needsUpdate = true;
    }
  }

  /** Advance every traffic car one step along its route. */
  updateTraffic(step) {
    for (const car of this.cars) {
      const type = CAR_TYPES[car.typeIndex];
      const accel = car.police ? VEHICLE.accel * 1.2 : VEHICLE.accel * 0.5;
      const top = car.police ? VEHICLE.topSpeed * 1.08 : VEHICLE.topSpeed * 0.85;
      if (car.speed < car.targetSpeed) car.speed = Math.min(car.targetSpeed, car.speed + accel * step);
      else if (car.speed > car.targetSpeed) car.speed = Math.max(car.targetSpeed, car.speed - VEHICLE.brake * step);
      car.speed = Math.min(car.speed, top);
      car.speed *= Math.pow(VEHICLE.drag, step);

      if (car.routeIndex < car.route.length) {
        const target = car.route[car.routeIndex];
        const dx = target.x - car.x, dz = target.z - car.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 7) { car.routeIndex += 1; continue; }
        const wantYaw = Math.atan2(-dx, dz);
        let err = wantYaw - car.yaw;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        car.yaw += err * VEHICLE.steer * Math.min(dist / 14, 1) * step * 0.5;
      }
      car.x -= Math.sin(car.yaw) * car.speed * step;
      car.z += Math.cos(car.yaw) * car.speed * step;
    }
    this.sync();
  }
}

// ---------- player car physics ----------

/** Advance the player's car one fixed step. input: {forward, back, left, right, handbrake}. Returns slip (0..1) for smoke. */
export function updatePlayerCar(car, input, step) {
  const forward = -Math.sin(car.yaw);
  const dirZ = Math.cos(car.yaw);
  const acc = input.forward ? VEHICLE.accel : input.back ? -VEHICLE.reverseAccel : 0;
  car.velocity.x += forward * acc * step;
  car.velocity.z += dirZ * acc * step;

  const speed = Math.hypot(car.velocity.x, car.velocity.z);
  car.velocity.x *= Math.pow(VEHICLE.drag, step);
  car.velocity.z *= Math.pow(VEHICLE.drag, step);

  const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (Math.abs(steerInput) > 0.01 && speed > 0.6) {
    const speedFactor = Math.max(0.15, 1 - Math.min(speed / VEHICLE.topSpeed, 0.8));
    car.yaw += steerInput * VEHICLE.steer * speedFactor * step;
  }
  // Re-align velocity with the new yaw (tyres grip along the car's facing).
  const f2 = -Math.sin(car.yaw), d2 = Math.cos(car.yaw);
  const along = car.velocity.x * f2 + car.velocity.z * d2;
  const lat = car.velocity.x * (-d2) + car.velocity.z * (-(-f2));
  const grip = input.handbrake ? VEHICLE.handbrakeGrip : VEHICLE.grip;
  const keep = Math.max(0, 1 - grip * step);
  const newLat = lat * keep;
  const slip = Math.abs(newLat) / Math.max(0.1, Math.abs(lat) + 0.01);
  car.velocity.x = f2 * along + (-d2) * newLat;
  car.velocity.z = d2 * along + (f2) * newLat;

  car.x += car.velocity.x * step;
  car.z += car.velocity.z * step;
  car.speed = Math.hypot(car.velocity.x, car.velocity.z);
  car.drift = input.handbrake ? Math.min(1, slip * 1.5) : 0;
  return car.drift;
}
