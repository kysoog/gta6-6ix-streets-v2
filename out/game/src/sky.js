// Vice Meridian — the dusk sky: a gradient dome (indigo zenith, neon-magenta horizon, cyan
// haze, a hard sun) drawn in a shader, the matching fog, a directional sun, and an environment
// map baked from the dome so wet asphalt and chrome reflect the sky. The dome and sprite are
// toneMapped: false so magenta and cyan stay saturated at dusk.

import * as THREE from 'three';
import { TIME_OF_DAY } from './config.js';
import { radialTexture } from './textures.js';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  vec4 projected = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = projected;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vDirection;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 dir = normalize(vDirection);
  float up = clamp(dir.y, -1.0, 1.0);
  // Gradient: strongest colour change in the first 15 degrees above the horizon.
  float t = pow(clamp(up, 0.0, 1.0), 0.45);
  vec3 color = mix(uHorizon, uTop, t);
  // Haze band hugging the horizon: humid Miami air at dusk.
  float haze = exp(-max(up, 0.0) * 7.0);
  color = mix(color, uHaze, haze * 0.8);
  // Below the horizon: a dim ground bounce, no black seam at the waterline.
  color = mix(color, uHaze * 0.3, clamp(-up * 2.2, 0.0, 1.0));

  // Sun: small hard disc, bloom, forward-scatter wash.
  float cosAngle = dot(dir, normalize(uSunDir));
  float disc = smoothstep(0.9990, 0.9995, cosAngle);
  float bloom = pow(max(cosAngle, 0.0), 900.0) * 0.5 + pow(max(cosAngle, 0.0), 60.0) * 0.3;
  float scatter = pow(max(cosAngle, 0.0), 6.0) * 0.35;
  color += uSunColor * (disc * 5.0 + bloom + scatter);

  // Ordered dither keeps the wide gradient free of banding.
  color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}`;

export function createSky(scene, renderer) {
  const sky = TIME_OF_DAY.sky;
  const uniforms = {
    uTop: { value: new THREE.Color(sky.top) },
    uHorizon: { value: new THREE.Color(sky.horizon) },
    uHaze: { value: new THREE.Color(sky.haze) },
    uSunColor: { value: new THREE.Color(TIME_OF_DAY.sunColor) },
    uSunDir: { value: new THREE.Vector3(...TIME_OF_DAY.sunDir).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
  dome.scale.setScalar(1400);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);

  // Environment map from a second dome: sky becomes the reflection in glass, chrome, wet asphalt.
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), material.clone());
  envDome.material.uniforms = uniforms;
  envDome.scale.setScalar(100);
  envScene.add(envDome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTarget = pmrem.fromScene(envScene, 0.02, 0.1, 300);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1.0;
  pmrem.dispose();
  envDome.geometry.dispose();

  const sun = new THREE.DirectionalLight(TIME_OF_DAY.sunColor, TIME_OF_DAY.sunIntensity);
  const sunDir = new THREE.Vector3(...TIME_OF_DAY.sunDir).normalize();
  sun.position.copy(sunDir).multiplyScalar(200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowSize = 140;
  sun.shadow.camera.left = -shadowSize;
  sun.shadow.camera.right = shadowSize;
  sun.shadow.camera.top = shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.HemisphereLight(TIME_OF_DAY.ambient, TIME_OF_DAY.ground, TIME_OF_DAY.ambientIntensity);
  scene.add(ambient);

  scene.fog = new THREE.Fog(TIME_OF_DAY.fogColor, TIME_OF_DAY.fogNear, TIME_OF_DAY.fogFar);
  scene.background = new THREE.Color(TIME_OF_DAY.fogColor);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,214,160,0.9)', 'rgba(255,180,120,0)', 256),
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }));
  glow.scale.setScalar(220);
  glow.position.copy(sunDir).multiplyScalar(1000);
  glow.renderOrder = -999;
  scene.add(glow);

  return {
    sun, ambient, dome, uniforms,
    /** Keeps the shadow frustum centred on the action without re-rendering shadows each frame. */
    follow(x, z) {
      sun.position.set(x + sunDir.x * 200, sunDir.y * 200, z + sunDir.z * 200);
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
    },
  };
}
