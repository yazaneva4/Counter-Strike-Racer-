// Sky, sun, fog and lights -- the synthwave-noir backdrop.
// The sky is a camera-locked dome with a hand-written gradient + a striped
// "burning horizon" sun baked straight into the shader, so it's always exactly
// on the horizon ahead of you and never gets eaten by fog.

import * as THREE from 'three';
import { CFG } from './config.js';

const SUN_DIR = new THREE.Vector3(0.05, 0.045, 1.0).normalize();

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    // Keep the dome pinned at the far plane regardless of camera translation.
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uSunDir;
  uniform float uTime;

  void main() {
    vec3 dir = normalize(vDir);
    float y = dir.y;

    // Vertical gradient: deep indigo zenith down to a magenta horizon.
    vec3 zenith  = vec3(0.055, 0.005, 0.150);
    vec3 midSky  = vec3(0.180, 0.030, 0.360);
    vec3 horizon = vec3(0.720, 0.090, 0.330);
    vec3 below   = vec3(0.030, 0.005, 0.080);

    vec3 col;
    if (y > 0.0) {
      float t = pow(clamp(y, 0.0, 1.0), 0.55);
      col = mix(mix(horizon, midSky, smoothstep(0.0, 0.28, y)), zenith, t);
    } else {
      col = mix(horizon, below, smoothstep(0.0, -0.22, y));
    }

    // The sun.
    float sd = dot(dir, normalize(uSunDir));
    // Horizontal retro stripes cut into the lower half of the disc.
    float stripe = smoothstep(0.35, 0.5, abs(fract((dir.y - uSunDir.y) * 46.0) - 0.5));
    float lower = smoothstep(0.0, -0.06, dir.y - uSunDir.y); // 1 below sun centre
    float mask = mix(1.0, stripe, lower);

    float core = smoothstep(0.9975, 0.9992, sd) * mask;
    float glow = pow(max(sd, 0.0), 90.0) * 0.9 * mask;
    float halo = pow(max(sd, 0.0), 8.0) * 0.35;

    vec3 sunCore = vec3(1.0, 0.86, 0.42);
    vec3 sunEdge = vec3(1.0, 0.36, 0.18);
    col += sunEdge * (glow + halo);
    col += sunCore * core * 2.0;

    // Faint drifting star/grain field up high.
    float g = fract(sin(dot(floor(dir.xy * 220.0), vec2(12.9898, 78.233))) * 43758.5453);
    col += vec3(step(0.9993, g)) * smoothstep(0.1, 0.6, y) * 0.6;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Environment {
  constructor(scene, renderer) {
    scene.fog = new THREE.FogExp2(CFG.fogColor, CFG.fogDensity);
    renderer.setClearColor(0x05010f, 1);

    const geo = new THREE.SphereGeometry(6000, 32, 16);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: SUN_DIR.clone() },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    // Lighting: a soft magenta/indigo hemisphere plus a warm key from the sun.
    const hemi = new THREE.HemisphereLight(0xff77dd, 0x120428, 0.55);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffb27a, 1.15);
    key.position.copy(SUN_DIR);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x2affff, 0.5);
    rim.position.set(-0.3, 0.2, -1);
    scene.add(rim);

    this.sunDir = SUN_DIR;
  }

  update(camera, t) {
    this.dome.position.copy(camera.position);
    this.mat.uniforms.uTime.value = t;
  }
}
