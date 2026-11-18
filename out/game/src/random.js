// Vice Meridian — a seeded, deterministic RNG. Same seed => same city, same traffic, same
// autopilot, same screenshot frame every time. xorshift32.

export function createRandom(seed) {
  let state = (seed === undefined || seed === null) ? Date.now() * 1000 + Math.random() * 1000 : Number(seed) | 0;
  if (state === 0) state = 0x9e3779b9;
  return function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296);
  };
}

export function pick(random, choices) { return choices[Math.floor(random() * choices.length)]; }

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function rdist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
