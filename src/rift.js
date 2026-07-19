// The Rift: a wall of collapsing energy that eats the canyon behind you.
// Since the camera faces forward, the threat is sold three ways -- the glowing
// curtain itself (glimpsed on hard curves), a red light that floods the walls
// as it closes, and the danger value it feeds to the HUD and post FX.

import * as THREE from 'three';
import { CFG } from './config.js';
import { centerX, centerY } from './path.js';

const RIFT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1,0));
    float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.0; a *= 0.5; }
    return s;
  }

  void main(){
    vec2 uv = vUv;
    float flow  = fbm(vec2(uv.x * 6.0,  uv.y * 3.0 - uTime * 1.6));
    float flow2 = fbm(vec2(uv.x * 15.0 + 5.0, uv.y * 6.0 - uTime * 3.0));
    float e = flow * 0.6 + flow2 * 0.4;

    float edge = smoothstep(0.0, 0.14, uv.x) * smoothstep(1.0, 0.86, uv.x);
    float vert = mix(1.15, 0.35, uv.y);
    float intensity = e * edge * vert;

    vec3 colA = vec3(1.0, 0.10, 0.28);
    vec3 colB = vec3(1.0, 0.52, 0.12);
    vec3 col = mix(colA, colB, e);
    col += vec3(1.0, 0.3, 0.45) * pow(e, 3.0);

    gl_FragColor = vec4(col * intensity * 1.5, 1.0);
  }
`;

export class Rift {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(96, CFG.wallHeight + 24, 1, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: RIFT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.light = new THREE.PointLight(CFG.colRift, 0, 260, 1.6);
    scene.add(this.light);

    this.z = 0;
    this.gap = CFG.riftStartGap;
  }

  reset(shipZ) {
    this.z = shipZ - CFG.riftStartGap;
    this.gap = CFG.riftStartGap;
  }

  knockback(m) {
    this.z -= m;
  }

  // Advance the rift; returns the current gap to the ship.
  update(dt, shipZ, baseSpeed, progress, t) {
    const riftSpeed = baseSpeed * (CFG.riftBase + CFG.riftRamp * progress);
    this.z += riftSpeed * dt;

    // Never let it fall so far back that it vanishes from the drama.
    const maxGap = 340;
    if (shipZ - this.z > maxGap) this.z = shipZ - maxGap;

    this.gap = shipZ - this.z;

    // Position the curtain across the corridor at its z.
    const cx = centerX(this.z);
    const cy = centerY(this.z);
    this.mesh.position.set(cx, cy + CFG.wallHeight * 0.42, this.z);
    this.mat.uniforms.uTime.value = t;

    // Red flood light ramps up hard as it closes in.
    const closeness = THREE.MathUtils.clamp(1 - this.gap / 150, 0, 1);
    this.light.position.set(cx, cy + CFG.wallHeight * 0.4, this.z + 8);
    this.light.intensity = closeness * closeness * 55;

    return this.gap;
  }

  // 0 (safe) .. 1 (about to be consumed) for HUD + post FX.
  danger() {
    return THREE.MathUtils.clamp(1 - this.gap / 120, 0, 1);
  }
}
