// Vice Meridian — every texture is drawn here, on <canvas>, at load. No image files, no network.
// Each factory caches by key; sizes are small powers of two and the palette is sun-bleached
// Miami: coral, mint, cream, aqua, with warm sun and cool shade baked in.

import * as THREE from 'three';

const cache = new Map();

function canvas(size) {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  return element;
}

function finish(element, { repeat = 1, wrap = true, aniso = 4 } = {}) {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = aniso;
  if (wrap) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.repeat.set(repeat, repeat);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function remember(key, build) {
  let texture = cache.get(key);
  if (texture === undefined) {
    texture = build();
    cache.set(key, texture);
  }
  return texture;
}

/** Deterministic per-texture noise, so a reload paints the same facade. */
function noiseFor(seed) {
  let a = (seed | 0) + 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(context, size, count, alpha, seed) {
  const random = noiseFor(seed);
  for (let i = 0; i < count; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 0.4 + random() * 1.9;
    context.fillStyle = `rgba(${random() > 0.5 ? '255,255,255' : '0,0,0'},${alpha * (0.35 + random() * 0.65)})`;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
}

/** Sidewalk: pavers with expansion joints, the seam grid that reads at 1 metre. */
export function sidewalkTexture() {
  return remember('sidewalk', () => {
    const size = 256;
    const c = canvas(size);
    const g = c.getContext('2d');
    g.fillStyle = '#d8cbb4';
    g.fillRect(0, 0, size, size);
    const random = noiseFor(7);
    for (let y = 0; y < size; y += 64) {
      for (let x = 0; x < size; x += 64) {
        g.fillStyle = `rgba(255,246,228,${0.14 + random() * 0.16})`;
        g.fillRect(x + 1, y + 1, 62, 62);
      }
    }
    g.strokeStyle = 'rgba(120,108,92,0.42)';
    g.lineWidth = 2;
    for (let i = 0; i <= size; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(size, i); g.stroke();
    }
    speckle(g, size, 900, 0.05, 11);
    return finish(c);
  });
}

/** Asphalt: fine aggregate over a dark binder, faint tyre polish down the lanes. */
export function asphaltTexture() {
  return remember('asphalt', () => {
    const size = 256;
    const c = canvas(size);
    const g = c.getContext('2d');
    g.fillStyle = '#363740';
    g.fillRect(0, 0, size, size);
    speckle(g, size, 2600, 0.09, 3);
    const random = noiseFor(21);
    for (let i = 0; i < 22; i += 1) {
      g.strokeStyle = `rgba(${random() > 0.5 ? '210,205,200' : '22,22,28'},${0.02 + random() * 0.05})`;
      g.lineWidth = 1 + random() * 3;
      g.beginPath();
      g.moveTo(random() * size, 0);
      g.lineTo(random() * size, size);
      g.stroke();
    }
    return finish(c);
  });
}

/** Sand: warm and raked, with shell flecks and footprint dimples. */
export function sandTexture() {
  return remember('sand', () => {
    const size = 256;
    const c = canvas(size);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#ead6b0');
    grad.addColorStop(1, '#e2c99f');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const random = noiseFor(33);
    for (let i = 0; i < 200; i += 1) {
      const x = random() * size, y = random() * size;
      g.strokeStyle = `rgba(196,168,128,${0.05 + random() * 0.12})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 18, y + 4, x + 38, y - 2);
      g.stroke();
    }
    speckle(g, size, 1500, 0.07, 41);
    return finish(c);
  });
}

/** City water: turquoise shallows to deep teal with a caustic shimmer painted in. */
export function waterTexture() {
  return remember('water', () => {
    const size = 256;
    const c = canvas(size);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#2fb8b0');
    grad.addColorStop(0.5, '#1a97a8');
    grad.addColorStop(1, '#0f7b95');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const random = noiseFor(77);
    for (let i = 0; i < 120; i += 1) {
      const x = random() * size, y = random() * size;
      g.strokeStyle = `rgba(226,255,250,${0.05 + random() * 0.16})`;
      g.lineWidth = 1 + random() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 12, y - 5, x + 30, y + 1);
      g.stroke();
    }
    return finish(c);
  });
}

/** A stucco facade with punched windows: base tint, floor bands, glass panes, art-deco fins. */
export function facadeTexture(tint, style, seed) {
  const key = `facade:${tint}:${style}:${seed}`;
  return remember(key, () => {
    const size = 256;
    const c = canvas(size);
    const g = c.getContext('2d');
    const random = noiseFor(seed);
    g.fillStyle = tint;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i += 1) {
      g.fillStyle = `rgba(255,255,255,${0.01 + random() * 0.05})`;
      g.fillRect(random() * size, 0, 2 + random() * 10, size);
    }
    speckle(g, size, 700, 0.05, seed + 5);
    const floors = 4;
    const band = size / floors;
    for (let f = 0; f < floors; f += 1) {
      const y = f * band;
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(0, y + band - 6, size, 3);
      g.fillStyle = 'rgba(60,44,36,0.10)';
      g.fillRect(0, y + band - 3, size, 3);
    }
    const cols = style === 'office' ? 6 : style === 'deco' ? 4 : 3;
    const cellW = size / cols;
    for (let f = 0; f < floors; f += 1) {
      for (let x = 0; x < cols; x += 1) {
        const px = x * cellW;
        const py = f * band;
        const w = style === 'office' ? cellW * 0.66 : cellW * 0.48;
        const h = style === 'office' ? band * 0.42 : band * 0.5;
        const wx = px + (cellW - w) / 2;
        const wy = py + band * (style === 'office' ? 0.3 : 0.26);
        g.fillStyle = 'rgba(38,28,30,0.55)';
        g.fillRect(wx - 3, wy - 3, w + 6, h + 6);
        const glass = g.createLinearGradient(wx, wy, wx + w * 0.4, wy + h);
        glass.addColorStop(0, '#20303f');
        glass.addColorStop(0.55, '#3c566b');
        glass.addColorStop(1, '#16232e');
        g.fillStyle = glass;
        g.fillRect(wx, wy, w, h);
        g.fillStyle = 'rgba(255,232,200,0.16)';
        g.fillRect(wx, wy + h * 0.62, w, h * 0.16);
        if (style === 'hotel') {
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.fillRect(px + 2, wy + h + 4, cellW - 4, 3);
          g.fillStyle = 'rgba(30,26,30,0.22)';
          g.fillRect(px + 2, wy + h + 7, cellW - 4, 5);
        } else if (style === 'deco') {
          g.fillStyle = 'rgba(255,255,255,0.32)';
          g.fillRect(px + cellW * 0.06, py, cellW * 0.07, band);
        } else {
          g.fillStyle = 'rgba(255,255,255,0.22)';
          g.fillRect(px + cellW * 0.1, wy + h + 5, cellW * 0.8, 2);
        }
      }
    }
    return finish(c, { repeat: 1 });
  });
}

/** A glowing neon sign panel: tube letters over dark glass. */
export function neonSignTexture(text, colour, background) {
  const key = `sign:${text}:${colour}:${background}`;
  return remember(key, () => {
    const w = 512, h = 160;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = background;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const size = Math.min(88, Math.floor((w - 56) / Math.max(4, text.length) * 1.55));
    g.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    g.shadowColor = colour;
    g.shadowBlur = 34;
    g.fillStyle = colour;
    g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 16;
    g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 0;
    g.fillStyle = '#fffaf2';
    g.globalAlpha = 0.82;
    g.fillText(text, w / 2, h / 2 + 4);
    g.globalAlpha = 1;
    return finish(c, { wrap: false });
  });
}

/** Small saturated stripes for shopfronts and awnings. */
export function stripeTexture(a, b) {
  const key = `stripe:${a}:${b}`;
  return remember(key, () => {
    const size = 128;
    const c = canvas(size);
    const g = c.getContext('2d');
    g.fillStyle = a;
    g.fillRect(0, 0, size, size);
    g.fillStyle = b;
    for (let i = -size; i < size * 2; i += 32) {
      g.save();
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - size, size); g.lineTo(i - size, size);
      g.closePath();
      g.fill();
      g.restore();
    }
    return finish(c);
  });
}

/** Generic grime + tint for alleys and under-pier shadows. */
export function concreteTexture(tint = '#8f8b86') {
  return remember(`concrete:${tint}`, () => {
    const size = 128;
    const c = canvas(size);
    const g = c.getContext('2d');
    g.fillStyle = tint;
    g.fillRect(0, 0, size, size);
    speckle(g, size, 700, 0.08, 61);
    return finish(c);
  });
}

/** Palm frond: a serrated leaf blade on transparency. */
export function frondTexture() {
  return remember('frond', () => {
    const w = 128, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.translate(w / 2, h);
    g.strokeStyle = '#4a6b34';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(4, -h * 0.6, 0, -h + 6); g.stroke();
    for (let i = 0; i < 30; i += 1) {
      const t = i / 30;
      const y = -6 - t * (h - 20);
      const len = 52 * (1 - t * 0.72) + 12;
      const droop = 16 + t * 26;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(side * 2, y);
        g.quadraticCurveTo(side * len * 0.55, y - 8 - t * 6, side * len, y + droop);
        g.quadraticCurveTo(side * len * 0.5, y + 5, side * 2, y + 5);
        g.closePath();
        const shade = 0.5 + t * 0.4;
        g.fillStyle = `rgb(${Math.round(74 + 30 * shade)},${Math.round(112 + 44 * shade)},${Math.round(52 + 22 * shade)})`;
        g.fill();
      }
    }
    return finish(c, { wrap: false });
  });
}

/** Soft radial blob on transparency: contact shadows, headlight pools, sun bloom sprites. */
export function radialTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)', size = 128) {
  return remember(`radial:${inner}:${outer}:${size}`, () => {
    const c = canvas(size);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.55, inner.replace(/[\d.]+\)$/, '0.35)'));
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
}

/** Crosswalk: broad zebra bars on transparency, laid at each junction. */
export function crosswalkTexture() {
  return remember('crosswalk', () => {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.clearRect(0, 0, size, size);
    for (let i = 0; i < 8; i += 1) {
      g.fillStyle = 'rgba(244,238,220,0.62)';
      g.fillRect(0, i * 16 + 2, size, 9);
    }
    return finish(c, { wrap: false });
  });
}

/** Disposes every cached texture. */
export function disposeTextures() {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
