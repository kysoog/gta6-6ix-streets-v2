// Vice Meridian — the city, built once from the seed: a grid of avenues and streets, nine
// pastel art-deco blocks, a seawall promenade, a sand beach with a pier out past the surf, the
// ocean at the map edge, palms, lamps, hydrants, neon signs and moored boats. Everything merges
// into one mesh per material; colliders, lanes and sign descriptors come back for the simulation.

import * as THREE from 'three';
import { CITY, PALETTE, LANES } from './config.js';
import { fillBlock, facadeMaterial, FACADE_TINTS } from './buildings.js';
import {
  asphaltTexture, sidewalkTexture, sandTexture, waterTexture, frondTexture, radialTexture,
} from './textures.js';

const ROAD = CITY.roads;

export function cityBlocks() {
  const blocks = [];
  const edges = [
    [-CITY.bounds - 32, ROAD[0]], [ROAD[0], ROAD[1]], [ROAD[1], ROAD[2]], [ROAD[2], ROAD[3]], [ROAD[3], CITY.bounds + 32],
  ];
  for (let iz = 0; iz < edges.length; iz += 1) {
    for (let ix = 0; ix < edges.length; ix += 1) {
      const [x0, x1] = edges[ix];
      const [z0, z1] = edges[iz];
      blocks.push({
        x0: x0 + CITY.roadHalf + CITY.sidewalk,
        x1: x1 - CITY.roadHalf - CITY.sidewalk,
        z0: z0 + CITY.roadHalf + CITY.sidewalk,
        z1: z1 - CITY.roadHalf - CITY.sidewalk,
      });
    }
  }
  return blocks.filter((b) => b.x1 - b.x0 > 8 && b.z1 - b.z0 > 8);
}

export function roadNetwork() {
  const segments = [];
  const extent = CITY.bounds + 40;
  for (const x of ROAD) segments.push({ axis: 'z', fixed: x, from: -extent, to: extent });
  for (const z of ROAD) segments.push({ axis: 'x', fixed: z, from: -extent, to: extent });
  return segments;
}

function boxUV(w, h, d, sw = 1, sh = 1, sd = 1, y = 0) {
  const g = new THREE.BoxGeometry(w, h, d, sw, sh, sd);
  g.translate(0, y, 0);
  return g;
}

function groundQuad(w, d, sw = 1, sd = 1) {
  const g = new THREE.PlaneGeometry(w, d, sw, sd);
  g.rotateX(-Math.PI / 2);
  return g;
}

function transformMatrix(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  // This vendored three build exposes makeRotationY rather than rotateY on Matrix4.
  if (rx || rz) {
    m.makeRotationX(rx);
    m.multiply(new THREE.Matrix4().makeRotationY(ry));
    m.multiply(new THREE.Matrix4().makeRotationZ(rz));
  } else {
    m.makeRotationY(ry);
  }
  // Matrix4.scale() in three r160 takes a Vector3, not three numbers (passing
  // numbers yields NaN and poisons every merged geometry).
  if (sx !== 1 || sy !== 1 || sz !== 1) m.multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
  m.setPosition(x, y, z);
  return m;
}

function mergeParts(list) {
  const parts = [];
  let total = 0;
  for (const item of list) {
    const geo = item.geometry;
    if (!geo) continue;
    // Boxes/cylinders are indexed: flatten first or the triangles are garbage.
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    const m = item.matrix || new THREE.Matrix4();
    g.applyMatrix4(m);
    const pos = g.attributes.position;
    if (!pos) continue;
    const uv = g.attributes.uv ? new Float32Array(g.attributes.uv.array) : null;
    const col = g.attributes.color ? new Float32Array(g.attributes.color.array) : null;
    parts.push({ pos: new Float32Array(pos.array), uv, col, count: pos.count });
    total += pos.count;
  }
  if (parts.length === 0) return new THREE.BufferGeometry();
  const merged = new THREE.BufferGeometry();
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const hasUV = parts.every((p) => p.uv);
  const hasCol = parts.every((p) => p.col);
  const uv = hasUV ? new Float32Array(total * 2) : null;
  const color = hasCol ? new Float32Array(total * 3) : null;
  let offset = 0;
  for (const p of parts) {
    position.set(p.pos, offset * 3);
    if (uv) uv.set(p.uv, offset * 2);
    if (color) color.set(p.col, offset * 3);
    offset += p.count;
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  if (uv) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (color) merged.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  // One NaN vertex poisons boundingSphere and frustum-culls the whole merged mesh.
  for (let i = 0; i < position.length; i += 1) if (!Number.isFinite(position[i])) position[i] = 0;
  merged.getAttribute('position').needsUpdate = true;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function instanced(geometry, material, matrices) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function buildCity(seed, random) {
  const group = new THREE.Group();
  group.name = 'city';
  const colliders = [];
  const signs = [];
  const pedRoutes = [];
  const allParts = [];

  // ---- ground: asphalt grid, pavements, kerbs ----
  const asphalt = new THREE.MeshStandardMaterial({
    map: asphaltTexture(), roughness: 0.8, metalness: 0.1, color: 0xffffff, envMapIntensity: 0.6,
  });
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.92, envMapIntensity: 0.3 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xc8c0b4, roughness: 0.9, metalness: 0.0 });

  const groundParts = [];
  const kerbParts = [];
  const roadway = groundQuad(CITY.bounds * 2 + 140, CITY.bounds * 2 + 140, CITY.pitch, CITY.pitch);
  groundParts.push({ geometry: roadway, matrix: transformMatrix(0, 0, 0) });

  const raised = CITY.curb;
  for (const block of cityBlocks()) {
    const w = block.x1 - block.x0 + CITY.sidewalk * 2;
    const d = block.z1 - block.z0 + CITY.sidewalk * 2;
    const slab = boxUV(w, raised, d, 6, 1, 6);
    slab.translate((block.x0 + block.x1) / 2, 0, (block.z0 + block.z1) / 2);
    groundParts.push({ geometry: slab, matrix: new THREE.Matrix4() });
    const lip = 0.2;
    for (const [dx, dz, aw, ad] of [
      [0, block.z1 + CITY.sidewalk, w + lip, lip],
      [0, block.z0 - CITY.sidewalk, w + lip, lip],
      [block.x1 + CITY.sidewalk, 0, lip, d],
      [block.x0 - CITY.sidewalk, 0, lip, d],
    ]) {
      kerbParts.push({ geometry: boxUV(aw, raised + 0.02, ad, 4, 1, 4), matrix: transformMatrix(dx, 0, dz) });
    }
  }

  // Sand beach between the last avenue and the surf.
  const beachWidth = CITY.sandEnd - CITY.sandStart;
  const beach = boxUV(beachWidth, CITY.bounds * 2 + 300, 0.05, 14, 1, 14);
  beach.translate(CITY.sandStart + beachWidth / 2, 0.02, 0);
  const beachMesh = new THREE.Mesh(beach, new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.98, envMapIntensity: 0.2 }));
  beachMesh.receiveShadow = true;
  group.add(beachMesh);

  // Promenade along the beach edge.
  const promenade = boxUV(24, 0.28, CITY.bounds * 2 + 300, 6, 1, 6);
  promenade.translate(CITY.sandStart - 12, 0, 0);
  groundParts.push({ geometry: promenade, matrix: new THREE.Matrix4() });

  const roadMesh = new THREE.Mesh(mergeParts(groundParts), asphalt);
  roadMesh.receiveShadow = true;
  roadMesh.name = 'streets';
  group.add(roadMesh);

  const kerbMesh = new THREE.Mesh(mergeParts(kerbParts), kerbMat);
  kerbMesh.receiveShadow = true;
  group.add(kerbMesh);

  // ---- ocean at the map edge: a rippling plane starting at the surf line ----
  const oceanGeo = new THREE.PlaneGeometry(1400, 1400, 40, 40);
  oceanGeo.rotateX(-Math.PI / 2);
  const waterMap = waterTexture();
  waterMap.repeat.set(48, 48);
  const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshStandardMaterial({
    map: waterMap, color: 0x9fe6e0, roughness: 0.12, metalness: 0.55, envMapIntensity: 1.4, transparent: true, opacity: 0.96,
  }));
  ocean.position.set(CITY.waterStart + 700, -0.3, 0);
  ocean.receiveShadow = false;
  ocean.name = 'ocean';
  group.add(ocean);
  const oceanBase = oceanGeo.attributes.position.array.slice();
  let oceanTime = 0;
  const waterUpdate = (dt) => {
    oceanTime += dt;
    const pos = oceanGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = oceanBase[i * 3];
      const z = oceanBase[i * 3 + 2];
      pos.array[i * 3 + 1] = Math.sin(x * 0.05 + oceanTime * 1.0) * 0.25 + Math.cos(z * 0.04 + oceanTime * 0.7) * 0.2;
    }
    pos.needsUpdate = true;
    oceanGeo.computeVertexNormals();
  };

  // ---- lane markings and crosswalks ----
  const markParts = [];
  const markMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.7, metalness: 0.0, transparent: true, opacity: 0.9 });
  const extent = CITY.bounds + 38;
  for (const x of ROAD) {
    for (let z = -extent; z < extent; z += 8) {
      if (ROAD.some((r) => Math.abs(z - r) < CITY.roadHalf + 2)) continue;
      markParts.push({ geometry: boxUV(0.3, 0.02, 3.6), matrix: transformMatrix(x, 0.01, z) });
    }
  }
  for (const z of ROAD) {
    for (let x = -extent; x < extent; x += 8) {
      if (ROAD.some((r) => Math.abs(x - r) < CITY.roadHalf + 2)) continue;
      markParts.push({ geometry: boxUV(3.6, 0.02, 0.3), matrix: transformMatrix(x, 0.01, z) });
    }
  }
  const dashes = new THREE.Mesh(mergeParts(markParts), markMat);
  dashes.renderOrder = 1;
  const barParts = [];
  const barMat = new THREE.MeshStandardMaterial({ color: 0xeeddb0, roughness: 0.7, metalness: 0.0 });
  for (const x of ROAD) {
    for (const z of ROAD) {
      for (let i = 0; i < 5; i += 1) {
        const oz = z + (i - 2) * 1.6;
        barParts.push({ geometry: boxUV(2.4, 0.02, 0.8), matrix: transformMatrix(x + CITY.roadHalf - 2.6, 0.012, oz) });
        barParts.push({ geometry: boxUV(2.4, 0.02, 0.8), matrix: transformMatrix(x - CITY.roadHalf + 2.6, 0.012, oz) });
      }
    }
  }
  const bars = new THREE.Mesh(mergeParts(barParts), barMat);
  bars.renderOrder = 1;
  const markings = new THREE.Group();
  markings.name = 'road markings';
  markings.add(dashes, bars);
  group.add(markings);

  // ---- buildings ----
  const blocks = cityBlocks();
  for (const block of blocks) {
    if (block.x0 > 100) continue; // beach block stays open
    const district = block.x0 > 60 ? 'beach' : 'sprawl';
    fillBlock(allParts, signs, colliders, block, random, district);
    const inset = CITY.sidewalk / 2;
    pedRoutes.push([
      { x: block.x0 - inset, z: block.z0 - inset },
      { x: block.x1 + inset, z: block.z0 - inset },
      { x: block.x1 + inset, z: block.z1 + inset },
      { x: block.x0 - inset, z: block.z1 + inset },
    ]);
  }

  const byMaterial = new Map();
  for (const p of allParts) {
    let list = byMaterial.get(p.material);
    if (list === undefined) { list = []; byMaterial.set(p.material, list); }
    list.push(p);
  }
  for (const [matName, list] of byMaterial) {
    let build;
    if (matName.startsWith('facade|')) {
      const [, tint, style] = matName.split('|');
      build = () => facadeMaterial(tint, style, matName.length * 7 + 3);
    } else {
      build = () => new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.85, metalness: 0.02, envMapIntensity: 0.4 });
    }
    const mesh = new THREE.Mesh(mergeParts(list), build());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = matName;
    group.add(mesh);
  }

  // ---- palms: trunks + fronds, two instanced meshes ----
  group.add(buildPalms(random, colliders));

  // ---- street furniture ----
  for (const mesh of buildFurniture()) group.add(mesh);

  // ---- pier out over the surf ----
  for (const mesh of buildPier(colliders).meshes) group.add(mesh);

  // ---- neon signs ----
  const signGroup = buildSigns(signs);
  group.add(signGroup.group);

  // ---- moored boats ----
  group.add(buildBoats(random));

  return {
    group, colliders, signs, water: { update: waterUpdate }, blocks, pedRoutes,
    landmarks: { pierHead: { x: CITY.sandStart + 86, z: 46 }, plaza: { x: 0, z: 0 } },
  };
}

// ---------- palms ----------

function buildPalms(random, colliders) {
  const group = new THREE.Group();
  group.name = 'palms';

  const trunkParts = [];
  const segments = 7;
  for (let i = 0; i < segments; i += 1) {
    const t = i / segments;
    const radius = 0.34 - t * 0.16;
    const seg = new THREE.CylinderGeometry(radius * 0.92, radius, 1.02, 7);
    seg.translate(Math.sin(t * 2.2) * 0.16 + t * t * 0.5, i * 1.02, Math.cos(t * 1.6) * 0.1);
    trunkParts.push({ geometry: seg });
  }
  const trunkGeometry = mergeParts(trunkParts);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x9a7b58, roughness: 0.95, metalness: 0.0 });

  const frondGeometry = makeFrondCluster();
  const frondMaterial = new THREE.MeshStandardMaterial({
    map: frondTexture(), transparent: true, alphaTest: 0.42, side: THREE.DoubleSide,
    roughness: 0.85, metalness: 0.0, color: 0xd8f0c0,
  });

  const trunks = [], fronds = [];
  const spots = [];
  for (let z = -CITY.bounds - 20; z <= CITY.bounds + 60; z += 13) {
    spots.push({ x: CITY.sandStart + 2.6 + random() * 1.6, z, scale: 0.9 + random() * 0.4 });
  }
  for (const x of ROAD) {
    for (let z = -CITY.bounds - 24; z < CITY.bounds + 24; z += 26) {
      spots.push({ x: x + CITY.roadHalf + 2.2, z: z + random() * 4, scale: 0.82 + random() * 0.35 });
      spots.push({ x: x - CITY.roadHalf - 2.2, z: z + 13 + random() * 4, scale: 0.82 + random() * 0.35 });
    }
  }
  for (const block of cityBlocks()) {
    if (block.x0 > 104) continue;
    spots.push({ x: block.x0 + 4, z: block.z0 + 4, scale: 0.95 + random() * 0.4 });
    spots.push({ x: block.x1 - 4, z: block.z1 - 4, scale: 0.95 + random() * 0.4 });
  }
  for (const spot of spots) {
    trunks.push(transformMatrix(spot.x, 0.2, spot.z, 0, random() * 6.28, 0, spot.scale, spot.scale, spot.scale));
    fronds.push(transformMatrix(spot.x, 0.2 + 6.9 * spot.scale, spot.z, 0, random() * 6.28, 0, spot.scale, spot.scale, spot.scale));
    colliders.push({ minX: spot.x - 0.4, maxX: spot.x + 0.4, minZ: spot.z - 0.4, maxZ: spot.z + 0.4, height: 7, soft: true });
  }
  const trunkMesh = instanced(trunkGeometry, trunkMaterial, trunks);
  trunkMesh.castShadow = true; trunkMesh.receiveShadow = true;
  const frondMesh = instanced(frondGeometry, frondMaterial, fronds);
  frondMesh.castShadow = true;
  group.add(trunkMesh, frondMesh);
  return group;
}

function makeFrondCluster() {
  const parts = [];
  const count = 9;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.4;
    const droop = 0.55 + (i % 3) * 0.22;
    const geometry = new THREE.PlaneGeometry(3.9, 1.5, 3, 1);
    const position = geometry.attributes.position;
    for (let v = 0; v < position.count; v += 1) {
      const x = position.getX(v);
      const t = Math.min(Math.max((x + 1.95) / 3.9, 0), 1);
      position.setY(v, position.getY(v) * (1 - t * 0.45));
      position.setZ(v, -Math.pow(t, 1.7) * 1.5 * droop);
    }
    geometry.computeVertexNormals();
    geometry.rotateZ(-0.22 - droop * 0.18);
    geometry.rotateY(angle);
    geometry.translate(Math.cos(angle) * 1.7, -0.2 - droop * 0.12, Math.sin(angle) * 1.7);
    parts.push({ geometry });
  }
  return mergeParts(parts);
}

// ---------- street furniture ----------

function buildFurniture() {
  const meshes = [];
  const poleMats = [], headMats = [], hydrantMats = [], binMats = [], benchParts = [];
  const lampSpots = [];
  for (const x of ROAD) {
    for (let z = -CITY.bounds - 20; z < CITY.bounds + 20; z += 21) {
      lampSpots.push({ x: x + CITY.roadHalf + 1.1, z });
      lampSpots.push({ x: x - CITY.roadHalf - 1.1, z: z + 10 });
    }
  }
  for (const z of ROAD) {
    for (let x = -CITY.bounds - 20; x < CITY.bounds + 20; x += 21) {
      lampSpots.push({ x, z: z + CITY.roadHalf + 1.1 });
      lampSpots.push({ x: x + 10, z: z - CITY.roadHalf - 1.1 });
    }
  }
  for (const spot of lampSpots) {
    poleMats.push(transformMatrix(spot.x, 0, spot.z));
    headMats.push(transformMatrix(spot.x, 6.4, spot.z));
  }

  const poleGeo = mergeParts([
    { geometry: new THREE.CylinderGeometry(0.09, 0.13, 6.4, 8), matrix: new THREE.Matrix4() },
    { geometry: boxUV(1.5, 0.12, 0.12, 1, 1, 0.12), matrix: transformMatrix(0.7, 0, 0) },
  ]);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.55, metalness: 0.7 });
  const poles = instanced(poleGeo, poleMat, poleMats);
  poles.castShadow = true;
  meshes.push(poles);

  const headGeo = new THREE.BoxGeometry(1.1, 0.18, 0.42);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffe0a8, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.1 });
  const headMeshes = headMats.map((m) => m.clone().multiply(transformMatrix(0.9, 0, 0)));
  meshes.push(instanced(headGeo, headMat, headMeshes));

  const poolParts = [];
  for (const spot of lampSpots) {
    const pl = new THREE.PlaneGeometry(4.4, 4.4);
    pl.rotateX(-Math.PI / 2);
    pl.translate(spot.x, 0.02, spot.z);
    poolParts.push({ geometry: pl });
  }
  const poolGeo = mergeParts(poolParts);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const pools = new THREE.Mesh(poolGeo, poolMat);
  pools.frustumCulled = false;
  meshes.push(pools);

  for (const block of cityBlocks()) {
    if (block.x0 > 104) continue;
    hydrantMats.push(transformMatrix(block.x0 - 1.6, 0.24, block.z0 - 1.6));
    hydrantMats.push(transformMatrix(block.x1 + 1.6, 0.24, block.z1 + 1.6));
  }
  const hydrantGeo = mergeParts([
    { geometry: new THREE.CylinderGeometry(0.16, 0.19, 0.72, 8) },
    { geometry: new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), matrix: new THREE.Matrix4().makeTranslation(0, 0.7, 0) },
    { geometry: boxUV(0.5, 0.1, 0.1, 1, 1, 0.42), matrix: new THREE.Matrix4().makeTranslation(0, 0.88, 0) },
  ]);
  meshes.push(instanced(hydrantGeo, new THREE.MeshStandardMaterial({ color: 0xe2432f, roughness: 0.6, metalness: 0.2 }), hydrantMats));

  for (let z = -CITY.bounds; z <= CITY.bounds; z += 11) {
    const x = CITY.sandStart - 5.2;
    const ry = Math.PI / 2;
    benchParts.push({ geometry: boxUV(2.6, 0.14, 0.62, 2, 1, 0.52), matrix: transformMatrix(x, 0.24, z, 0, ry, 0) });
    benchParts.push({ geometry: boxUV(2.6, 0.5, 0.12, 2, 1, 1.06), matrix: transformMatrix(x + 0.3, 0.24, z, 0, ry, 0) });
    benchParts.push({ geometry: boxUV(0.12, 0.52, 0.5, 1, 1, 0), matrix: transformMatrix(x, 0.24, z - 1.1, 0, ry, 0) });
    benchParts.push({ geometry: boxUV(0.12, 0.52, 0.5, 1, 1, 0), matrix: transformMatrix(x, 0.24, z + 1.1, 0, ry, 0) });
  }
  meshes.push(new THREE.Mesh(mergeParts(benchParts), new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.85, metalness: 0.05 })));

  for (let z = -CITY.bounds; z <= CITY.bounds; z += 22) {
    binMats.push(transformMatrix(CITY.sandStart - 7.6, 0.24, z + 4));
  }
  meshes.push(instanced(new THREE.CylinderGeometry(0.32, 0.28, 0.95, 10), new THREE.MeshStandardMaterial({ color: 0x2f6f5e, roughness: 0.7, metalness: 0.25 }), binMats));

  const trafficParts = [];
  for (const x of ROAD) {
    for (const z of ROAD) {
      for (const [dx, dz] of [[1, 1], [-1, -1]]) {
        const px = x + dx * (CITY.roadHalf + 1.4);
        const pz = z + dz * (CITY.roadHalf + 1.4);
        trafficParts.push({ geometry: new THREE.CylinderGeometry(0.1, 0.12, 5.4, 6), matrix: transformMatrix(px, 0.24, pz) });
        trafficParts.push({ geometry: boxUV(0.42, 1.15, 0.34, 1, 1, 0), matrix: transformMatrix(px, 5.2, pz) });
      }
    }
  }
  meshes.push(new THREE.Mesh(mergeParts(trafficParts), poleMat));
  return meshes;
}

// ---------- pier ----------

function buildPier(colliders) {
  const meshes = [];
  const deckParts = [], railParts = [], pilingMats = [];
  const startX = CITY.sandStart;
  const endX = CITY.sandStart + 96;
  const width = 13;
  const z = 46;

  const deck = boxUV(endX - startX, 0.55, width, 8, 1, 8);
  deck.translate((startX + endX) / 2, 0, z);
  deckParts.push({ geometry: deck });
  for (let x = startX + 1; x < endX; x += 1.2) {
    deckParts.push({ geometry: boxUV(0.16, 0.06, width, 1, 1, 0.55), matrix: transformMatrix(x, 0, z) });
  }
  for (let x = startX + 3; x < endX; x += 8) {
    for (const dz of [-width / 2 + 0.8, width / 2 - 0.8]) pilingMats.push(transformMatrix(x, -2.4, z + dz));
  }
  for (let x = startX + 1; x < endX; x += 2.4) {
    railParts.push({ geometry: boxUV(0.1, 1.05, 0.1, 1, 1, 0.55), matrix: transformMatrix(x, 0, z - width / 2 + 0.4) });
    railParts.push({ geometry: boxUV(0.1, 1.05, 0.1, 1, 1, 0.55), matrix: transformMatrix(x, 0, z + width / 2 - 0.4) });
  }
  railParts.push({ geometry: boxUV(endX - startX, 0.09, 0.09, 4, 1, 1.6), matrix: transformMatrix((startX + endX) / 2, 0, z - width / 2 + 0.4) });
  railParts.push({ geometry: boxUV(endX - startX, 0.09, 0.09, 4, 1, 1.6), matrix: transformMatrix((startX + endX) / 2, 0, z + width / 2 - 0.4) });

  meshes.push(new THREE.Mesh(mergeParts(deckParts), new THREE.MeshStandardMaterial({ color: 0xb08a63, roughness: 0.92, metalness: 0.0 })));
  meshes.push(new THREE.Mesh(mergeParts(railParts), new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.6, metalness: 0.3 })));
  meshes.push(instanced(new THREE.CylinderGeometry(0.36, 0.4, 5.2, 8), new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.95 }), pilingMats));

  const pavilion = [];
  const headX = endX - 12;
  for (const [dx, dz] of [[-5, -4.6], [5, -4.6], [-5, 4.6], [5, 4.6]]) {
    pavilion.push({ geometry: new THREE.CylinderGeometry(0.22, 0.26, 5.2, 8), matrix: transformMatrix(headX + dx, 0, z + dz) });
  }
  pavilion.push({ geometry: new THREE.CylinderGeometry(7.4, 0.4, 1.5, 6), matrix: transformMatrix(headX, 0, z) });
  meshes.push(new THREE.Mesh(mergeParts(pavilion), new THREE.MeshStandardMaterial({ color: 0xf3e6d2, roughness: 0.7 })));
  colliders.push({ minX: headX - 5.6, maxX: headX - 4.4, minZ: z - 5.2, maxZ: z - 4.0, height: 5 });
  colliders.push({ minX: headX + 4.4, maxX: headX + 5.6, minZ: z - 5.2, maxZ: z - 4.0, height: 5 });

  const wheel = [];
  const wheelX = endX + 34;
  const wheelZ = z - 6;
  for (const [dx, dz] of [[-3.4, 0], [3.4, 0]]) {
    wheel.push({ geometry: new THREE.CylinderGeometry(0.4, 0.5, 22, 6), matrix: transformMatrix(wheelX + dx, 0, wheelZ + dz) });
  }
  const rim = new THREE.TorusGeometry(11, 0.32, 6, 32);
  rim.translate(0, 22, 0);
  wheel.push({ geometry: rim, matrix: transformMatrix(wheelX, 0, wheelZ) });
  for (let i = 0; i < 12; i += 1) {
    const spoke = boxUV(0.16, 0.16, 21, 1, 1, 0);
    spoke.rotateY((i / 12) * Math.PI * 2);
    wheel.push({ geometry: spoke, matrix: transformMatrix(wheelX, 22, wheelZ) });
  }
  meshes.push(new THREE.Mesh(mergeParts(wheel), new THREE.MeshStandardMaterial({ color: 0xffd8e4, emissive: 0xff4f9a, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.3 })));

  return { meshes };
}

// ---------- neon signs ----------

function buildSigns(signs) {
  const group = new THREE.Group();
  group.name = 'neon signs';
  const glowParts = [];
  for (const sign of signs) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(sign.userData.width, sign.userData.height),
      new THREE.MeshBasicMaterial({ map: sign.userData.texture, transparent: true, toneMapped: false, side: THREE.DoubleSide }),
    );
    plane.position.copy(sign.position);
    plane.rotation.y = sign.rotation.y;
    group.add(plane);
    glowParts.push({
      geometry: new THREE.PlaneGeometry(sign.userData.width * 1.6, sign.userData.height * 2.6),
      matrix: transformMatrix(sign.position.x, sign.position.y, sign.position.z, 0, sign.rotation.y, 0),
      color: [1, 1, 1],
    });
  }
  if (glowParts.length > 0) {
    const merged = mergeParts(glowParts);
    const glowMat = new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true, toneMapped: false, side: THREE.DoubleSide, opacity: 0.55,
    });
    const glow = new THREE.Mesh(merged, glowMat);
    glow.name = 'sign glow';
    group.add(glow);
  }
  return { group };
}

// ---------- boats ----------

function buildBoats(random) {
  const group = new THREE.Group();
  group.name = 'marina';
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.42, metalness: 0.12 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b6f8a, roughness: 0.4, metalness: 0.3 });
  const boats = [];
  for (let i = 0; i < 6; i += 1) {
    const length = 6 + random() * 5;
    const beam = 2.2 + random() * 0.8;
    const positions = [
      -beam / 2, 0, -length / 2, beam / 2, 0, -length / 2, 0, 0, length / 2,
      -beam / 2, 0, -length / 2, 0, 0, length / 2, 0, 1.1, length / 2,
      beam / 2, 0, -length / 2, 0, 1.1, length / 2, 0, 0, length / 2,
      -beam / 2, 0, -length / 2, -beam / 2, 1.1, -length / 2, beam / 2, 1.1, -length / 2,
      -beam / 2, 0, -length / 2, beam / 2, 1.1, -length / 2, beam / 2, 0, -length / 2,
    ];
    const hull = new THREE.BufferGeometry();
    hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hull.computeVertexNormals();
    const mesh = new THREE.Mesh(hull, hullMat);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.6, 0.9, length * 0.3), trimMat);
    cabin.position.set(0, 1.35, -length * 0.1);
    const boat = new THREE.Group();
    boat.add(mesh, cabin);
    boat.position.set(CITY.waterStart + 12 + random() * 26, -0.2, -30 + i * 26 + random() * 10);
    boat.rotation.y = random() * 6.28;
    boat.userData.phase = random() * 6.28;
    boats.push(boat);
    group.add(boat);
  }
  group.userData.boats = boats;
  group.userData.update = (time) => {
    for (const boat of boats) {
      boat.position.y = -0.2 + Math.sin(time * 0.9 + boat.userData.phase) * 0.14;
      boat.rotation.z = Math.sin(time * 0.7 + boat.userData.phase) * 0.03;
      boat.rotation.x = Math.cos(time * 0.8 + boat.userData.phase) * 0.025;
    }
  };
  return group;
}

// ---------- traffic lanes ----------

export function trafficRoutes() {
  const routes = [];
  const extent = CITY.bounds + 30;
  for (const x of ROAD) {
    routes.push({ axis: 'z', lanes: LANES.slice(), x, from: -extent, to: extent });
    routes.push({ axis: 'z', lanes: LANES.slice(), x, from: extent, to: -extent });
  }
  for (const z of ROAD) {
    routes.push({ axis: 'x', lanes: LANES.slice(), z, from: -extent, to: extent });
    routes.push({ axis: 'x', lanes: LANES.slice(), z, from: extent, to: -extent });
  }
  return routes;
}
