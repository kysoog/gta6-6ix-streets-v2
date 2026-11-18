// Vice Meridian — art-deco city blocks: pastel stucco hotels and offices, stepped Streamline
// Moderne roofs, vertical fins, neon sign strips above the shopfronts. Each block gets one or
// two towers; everything merges into one mesh per (tint, style) material. Colliders are AABBs
// in XZ that the physics pass reads; signs are plain descriptors the sign builder turns into
// glowing planes.

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { facadeTexture, neonSignTexture } from './textures.js';

export const FACADE_TINTS = PALETTE.wall;
export const STYLES = ['hotel', 'office', 'deco'];

export function facadeMaterial(tint, style, size) {
  return new THREE.MeshStandardMaterial({
    map: facadeTexture(tint, style, size),
    roughness: 0.8,
    metalness: 0.05,
    envMapIntensity: 0.4,
  });
}

function buildingMatrix(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.makeRotationY(ry);
  // three r160: Matrix4.scale() needs a Vector3; three numbers produce NaN.
  if (sx !== 1 || sy !== 1 || sz !== 1) m.multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}

/** One building: a shopfront base, a tapered tower, a stepped deco crown and a spire. */
export function makeBuilding(x0, z0, x1, z1, height, tint, style, seed, signText, signColour) {
  const parts = [];
  const signs = [];
  const sx = (x0 + x1) / 2;
  const sz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  const base = 3.4;
  const towerH = Math.max(2, height - base);
  const towerW = w * 0.62;
  const towerD = d * 0.62;

  parts.push({ geometry: new THREE.BoxGeometry(w, base, d), matrix: buildingMatrix(sx, base / 2, sz), name: 'base' });
  parts.push({ geometry: new THREE.BoxGeometry(towerW, towerH, towerD), matrix: buildingMatrix(sx, base + towerH / 2, sz), name: 'tower' });

  let tierW = towerW * 0.72, tierD = towerD * 0.72, tierY = base + towerH;
  for (let t = 0; t < 3; t += 1) {
    const tierH = 1.6 + t * 0.6;
    parts.push({ geometry: new THREE.BoxGeometry(tierW, tierH, tierD), matrix: buildingMatrix(sx, tierY + tierH / 2, sz), name: 'crown' });
    tierY += tierH;
    tierW *= 0.78; tierD *= 0.78;
  }
  parts.push({ geometry: new THREE.CylinderGeometry(0.18, 0.02, 2.2, 8), matrix: buildingMatrix(sx, tierY + 1.1, sz), name: 'spire' });

  // Neon sign band above the shopfront, facing south toward the avenue.
  if (signText) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.85, 1.6),
      new THREE.MeshBasicMaterial({ map: neonSignTexture(signText, signColour, '#0c0f18'), transparent: true, toneMapped: false, side: THREE.DoubleSide }),
    );
    plane.position.set(sx, base + 0.55, sz - d / 2 - 0.42);
    plane.userData = { width: w * 0.85, height: 1.6, texture: plane.material.map };
    signs.push(plane);
  }

  return { parts, signs };
}

/**
 * Fill one buildable block: 1-2 buildings inset from the pavement, each with a collider and a
 * neon sign. Pushes {geometry, matrix, material} onto parts, sign planes onto signs and AABB
 * colliders onto colliders.
 */
export function fillBlock(parts, signs, colliders, block, random, style) {
  const { x0, x1, z0, z1 } = block;
  const innerX0 = x0 + 6, innerX1 = x1 - 6;
  const innerZ0 = z0 + 6, innerZ1 = z1 - 6;
  const tint = FACADE_TINTS[Math.floor(random() * FACADE_TINTS.length)];
  const buildingStyle = style === 'beach' ? 'hotel' : STYLES[Math.floor(random() * STYLES.length)];
  const seed = Math.floor(random() * 1e6);

  const towers = [];
  if (innerX1 - innerX0 > 22 && innerZ1 - innerZ0 > 22) {
    towers.push({ x: innerX0 + 7, z: innerZ0 + 7, w: 13, d: 13 });
    towers.push({ x: innerX1 - 7 - 13, z: innerZ1 - 7 - 13, w: 13, d: 13 });
  } else {
    towers.push({ x: (innerX0 + innerX1) / 2, z: (innerZ0 + innerZ1) / 2, w: Math.min(16, innerX1 - innerX0), d: Math.min(16, innerZ1 - innerZ0) });
  }

  for (const t of towers) {
    const height = 14 + random() * 18;
    const signText = signName(random);
    const signColour = PALETTE.neon[Math.floor(random() * PALETTE.neon.length)];
    const b = makeBuilding(t.x - t.w / 2, t.z - t.d / 2, t.x + t.w / 2, t.z + t.d / 2, height, tint, buildingStyle, seed, signText, signColour);
    const matBase = `facade|${tint}|${buildingStyle}`;
    for (const p of b.parts) {
      p.material = `${matBase}|${p.name}`;
      parts.push(p);
    }
    for (const plane of b.signs) signs.push(plane);
    colliders.push({
      minX: t.x - t.w / 2 - 1, maxX: t.x + t.w / 2 + 1,
      minZ: t.z - t.d / 2 - 1, maxZ: t.z + t.d / 2 + 1,
      height: height + 2,
    });
  }
}

const STREET_WORDS = ['Neon', 'Ocean', 'Palm', 'Surf', 'Coco', 'Surfside', 'Breeze', 'Tide', 'Art', 'Deco', 'Meridian', 'Sabal', 'Vista', 'Marina'];
const SIGN_WORDS = ['MOTEL', 'DINER', 'BAR', 'LOUNGE', 'PALACE', 'COURT', 'INN', 'CLUB', 'HOTEL', 'CAFE', 'THEATRE', 'APTS'];

export function signName(random) {
  return `${pick(random, STREET_WORDS)} ${pick(random, SIGN_WORDS)}`;
}

function pick(random, choices) { return choices[Math.floor(random() * choices.length)]; }
