// Post-processing stack. Bloom lights up every neon edge; a custom final pass
// adds chromatic aberration (scaling with speed/boost), a vignette, film grain,
// and a red danger pulse driven by how close the rift is.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './config.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uChroma: { value: 0.0015 },
    uVignette: { value: 0.65 },
    uDanger: { value: 0.0 },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uChroma, uVignette, uDanger, uTime;
    uniform vec2 uResolution;

    void main(){
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      float d = length(dir);

      // Chromatic aberration -- splits harder toward the edges and with speed.
      vec2 off = dir * uChroma * (0.4 + d);
      float r = texture2D(tDiffuse, uv + off).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - off).b;
      vec3 col = vec3(r, g, b);

      // Vignette.
      float vig = smoothstep(0.95, 0.32, d);
      col *= mix(1.0, vig, uVignette);

      // Rift danger -- red bleeds in from the edges and pulses.
      float pulse = 0.55 + 0.45 * sin(uTime * 9.0);
      float edge = smoothstep(0.25, 0.8, d);
      col = mix(col, col + vec3(0.75, 0.0, 0.12) * edge * (0.55 + 0.45 * pulse), uDanger);

      // Film grain.
      float gr = fract(sin(dot(uv * uResolution, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
      col += (gr - 0.5) * 0.035;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const size = renderer.getSize(new THREE.Vector2());

    // EffectComposer defaults to half-float render targets. Most GPUs support
    // those, but some drivers/software renderers (e.g. SwiftShader) can't render
    // to a float colour buffer, which yields a black screen. Detect that and
    // fall back to plain 8-bit targets so the game renders everywhere.
    const gl = renderer.getContext();
    // `?safe` forces the lowest-common-denominator path (no float targets, no
    // bloom). Handy if a driver claims float support but renders it black --
    // some software renderers advertise the extension yet don't honour it.
    const forceSafe = typeof location !== 'undefined' &&
      new URLSearchParams(location.search).has('safe');
    const floatRT = !forceSafe && (renderer.capabilities.isWebGL2
      ? (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
      : gl.getExtension('EXT_color_buffer_half_float'));
    let composerTarget;
    if (!floatRT) {
      const dpr = renderer.getPixelRatio();
      composerTarget = new THREE.WebGLRenderTarget(
        Math.floor(size.x * dpr),
        Math.floor(size.y * dpr),
        { type: THREE.UnsignedByteType }
      );
    }

    this.composer = new EffectComposer(renderer, composerTarget);
    this.composer.addPass(new RenderPass(scene, camera));

    // UnrealBloomPass always allocates half-float targets internally, so it only
    // works where floating-point colour buffers render. On hardware/drivers
    // without them we skip bloom rather than show a black screen.
    this.hasBloom = !!floatRT;
    if (this.hasBloom) {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(size.x, size.y),
        CFG.bloomStrength,
        CFG.bloomRadius,
        CFG.bloomThreshold
      );
      this.composer.addPass(this.bloom);
    }

    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uResolution.value.set(size.x, size.y);
    this.composer.addPass(this.grade);

    this.composer.addPass(new OutputPass());

    // Normalise all internal targets/passes to the current CSS size.
    this.setSize(size.x, size.y);
  }

  setSize(w, h) {
    // composer.setSize resizes its ping-pong targets and every pass (incl.
    // bloom) at the effective device resolution.
    this.composer.setSize(w, h);
    const dpr = this.composer.renderer.getPixelRatio();
    this.grade.uniforms.uResolution.value.set(w * dpr, h * dpr);
  }

  // speed01: 0..1, boost: 0..1, danger: 0..1
  update(dt, t, speed01, boost, danger) {
    const u = this.grade.uniforms;
    u.uTime.value = t;
    const targetChroma = CFG.chromaBase + speed01 * CFG.chromaSpeed + boost * CFG.chromaBoost;
    u.uChroma.value += (targetChroma - u.uChroma.value) * Math.min(1, dt * 6);
    u.uDanger.value += (danger - u.uDanger.value) * Math.min(1, dt * 5);
    if (this.hasBloom) this.bloom.strength = CFG.bloomStrength + boost * 0.5 + danger * 0.3;
  }

  render() {
    this.composer.render();
  }
}
