// Vice Meridian — every tuning number, colour and world measurement in one place.
// The simulation runs in metres and seconds; the renderer uses the same units.
// Change a number here and the city, traffic and driving retune with it.

export const STEP = 1 / 60;
// Longest single simulation frame the fixed-step integrator will swallow. A headless
// capture runs at a few frames per second, so a raw dt would throw cars through walls.
export const MAX_FRAME = 0.15;

/** One grid: avenues run north-south (constant x), streets east-west (constant z). */
export const CITY = {
  pitch: 64,              // metres between adjacent avenues / streets
  roads: [-96, -32, 32, 96],
  roadHalf: 8,            // half-width of a road, metres
  sidewalk: 4.5,          // pavement width either side of a road
  curb: 0.15,             // kerb lip height, metres
  /** East of this the paving ends and the sand begins. */
  sandStart: 108,
  sandEnd: 132,
  waterStart: 134,
  /** City half-extent; roads run a little past it, the ocean sits beyond the surf. */
  bounds: 112,
  streetNames: {
    ns: ['Sabal Ave', 'Meridian Ave', 'Flamingo Ave', 'Marina Ave'],
    ew: ['Banyan St', 'Palmetto St', 'Tidewater St', 'Pier St'],
  },
};

export const DISTRICTS = [
  { name: 'Sabal Heights', x0: -150, x1: -40, z0: -150, z1: 150 },
  { name: 'Neon Mile', x0: -40, x1: 40, z0: -150, z1: 150 },
  { name: 'The Strand', x0: 40, x1: 112, z0: -150, z1: 150 },
];

export const PLAYER = {
  radius: 0.45,
  height: 1.8,
  walk: 3.4,
  run: 6.2,
  health: 100,
  maxHealth: 100,
};

export const VEHICLE = {
  /** Arcade car: forward acceleration, metres/s^2. */
  accel: 16,
  reverseAccel: 9,
  /** Civilian top speed, metres/s. */
  topSpeed: 38,
  brake: 28,
  /** Per-second speed retention, re-applied every step via pow. */
  drag: 0.92,
  /** Yaw-rate scale; steering weakens as speed rises. */
  steer: 2.6,
  grip: 9.5,
  handbrakeGrip: 2.4,
  driftGrip: 1.8,
  wheelBase: 2.6,
  width: 1.9,
  length: 4.6,
  height: 1.4,
  mass: 1400,
  health: 240,
};

export const LANES = [-4, 4];

export const TRAFFIC = {
  carCount: 24,
  minSpeed: 10,
  maxSpeed: 16,
  gap: 14,
  despawn: 260,
  turnChance: 0.3,
};

export const COPS = {
  maxUnits: 5,
  spawnInterval: 4,
  sirenColours: [0xff2b45, 0x2b6bff],
};

export const WANTED = {
  max: 5,
  decayBase: 8,
  sightRange: 44,
};

/** Neon Miami palette: magenta and cyan signs against a dusk sky. */
export const PALETTE = {
  asphalt: '#363740',
  sidewalk: '#d8cbb4',
  sand: '#e8d3ae',
  wall: ['#f6d9c9', '#e9e2c8', '#cfe6dd', '#e8cfe0', '#f3e3bd', '#d5dff0', '#f7c9b4'],
  neon: ['#ff4f9a', '#33e6ff', '#ffd166', '#a6ff4f', '#ff7a45', '#c77dff'],
  paint: [0xff2d55, 0xf0c53c, 0x2b4da8, 0xe8e8f0, 0x4a4a4a, 0xf7c9b4, 0x2a7d4c, 0x7d4a18],
  hudInk: '#f6f1e6',
  hudAccent: '#ffd166',
  hudDanger: '#ff3d5a',
  minimapRoads: '#3f3a46',
  minimapBlocks: '#5a5f74',
  minimapWater: '#1f6f8b',
  minimapSand: '#cbb387',
};

/** Dusk: deep indigo zenith, neon-magenta horizon, cyan haze, dim sun. */
export const TIME_OF_DAY = {
  sunDir: [-0.86, 0.12, 0.5],
  sunColor: 0xff9a6a,
  sunIntensity: 2.2,
  sky: { top: 0x141c3a, horizon: 0xff4f9a, haze: 0x33e6ff, sun: 0xffd2a0 },
  fogColor: 0x5a2a4a,
  fogNear: 45,
  fogFar: 420,
  ambient: 0x5a5a8a,
  ground: 0x2a1a34,
  ambientIntensity: 0.7,
  exposure: 1.4,
};

export const SHOTS = { start: 'start', play: 'play', end: 'end' };

export const SHOT_FRAMES = { start: 100, play: 120, end: 100 };

export const CAPTURE = { width: 1280, height: 800, jpegQuality: 92 };
