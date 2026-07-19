// Post-processing stack.
//
// Ideal path: UnrealBloomPass lights up every neon edge, then a custom grade
// pass adds chromatic aberration, vignette, film grain and the rift-danger red.
//
// Bloom needs floating-point render targets, and some drivers *claim* to support
// them but render them black (SwiftShader, some mobile/ANGLE configs). A plain
// extension check isn't enough -- those drivers advertise the extension and lie.
// So we actually probe it at runtime: render a bright quad into a half-float
// target, sample it in a shader, read it back. If it isn't bright, we drop to an
// all-8-bit path and synthesise a cheaper glow inside the grade shader instead.

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
    uGlow: { value: 0.0 }, // >0 = synthesise bloom here (8-bit fallback path)
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
    uniform float uChroma, uVignette, uDanger, uGlow, uTime;
    uniform vec2 uResolution;

    // Cheap approximate bloom: gather bright neighbours over three rings so
    // neon edges get a soft halo. Runs everywhere (plain 8-bit sampling).
    vec3 cheapGlow(vec2 uv){
      vec3 sum = vec3(0.0);
      const int N = 10;
      for (int i = 0; i < N; i++){
        float a = 6.2831853 * float(i) / float(N);
        vec2 d = vec2(cos(a), sin(a));
        vec3 s1 = texture2D(tDiffuse, uv + d * 0.0030).rgb;
        vec3 s2 = texture2D(tDiffuse, uv + d * 0.0075).rgb;
        vec3 s3 = texture2D(tDiffuse, uv + d * 0.0140).rgb;
        sum += max(s1 - 0.45, 0.0) * 0.80;
        sum += max(s2 - 0.45, 0.0) * 0.55;
        sum += max(s3 - 0.45, 0.0) * 0.32;
      }
      return sum / float(N);
    }

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

      // Synthetic glow for the no-float-target fallback.
      if (uGlow > 0.0) col += cheapGlow(uv) * (2.4 * uGlow);

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

    // The float-bloom path (UnrealBloomPass) renders black on more hardware than
    // its extension check admits, so the reliable all-8-bit path with an
    // in-shader glow is the DEFAULT. Opt into the fancier bloom with `?hd`
    // (only used if a runtime probe confirms float rendering actually works).
    // `?safe` is the explicit way to force the default path.
    const params = typeof location !== 'undefined'
      ? new URLSearchParams(location.search)
      : new URLSearchParams('');
    const wantHD = params.has('hd') && !params.has('safe');

    const floatOK = wantHD && floatTargetWorks(renderer);
    this.hasBloom = floatOK;

    // The composer's ping-pong targets: half-float when it truly works (better
    // bloom), otherwise plain 8-bit so the scene is never black.
    let composerTarget;
    if (!floatOK) {
      const dpr = renderer.getPixelRatio();
      composerTarget = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(size.x * dpr)),
        Math.max(1, Math.floor(size.y * dpr)),
        { type: THREE.UnsignedByteType }
      );
    }

    this.composer = new EffectComposer(renderer, composerTarget);
    this.composer.addPass(new RenderPass(scene, camera));

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
    // In the fallback path, the grade pass carries the glow itself.
    this.grade.uniforms.uGlow.value = this.hasBloom ? 0.0 : 1.0;
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

// Render a full-white quad into a half-float target, sample it in a shader into
// an 8-bit target, and read that back. Returns false if the "bright" result
// comes back black -- i.e. the driver can't actually render float colour.
function floatTargetWorks(renderer) {
  let ok = false;
  let rtF, rt8;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  try {
    rtF = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    rt8 = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: false });

    const cam = new THREE.Camera();
    const plane = new THREE.PlaneGeometry(2, 2);

    const brightScene = new THREE.Scene();
    const brightMat = new THREE.ShaderMaterial({
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }',
    });
    const brightMesh = new THREE.Mesh(plane, brightMat);
    brightScene.add(brightMesh);

    const copyScene = new THREE.Scene();
    const copyMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: rtF.texture } },
      vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D t; varying vec2 v; void main(){ gl_FragColor = texture2D(t, v); }',
    });
    const copyMesh = new THREE.Mesh(plane, copyMat);
    copyScene.add(copyMesh);

    renderer.setRenderTarget(rtF);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(brightScene, cam);

    renderer.setRenderTarget(rt8);
    renderer.clear();
    renderer.render(copyScene, cam);

    const buf = new Uint8Array(4 * 16);
    renderer.readRenderTargetPixels(rt8, 0, 0, 4, 4, buf);
    ok = buf[0] > 40 || buf[1] > 40 || buf[2] > 40;

    brightMat.dispose();
    copyMat.dispose();
    plane.dispose();
  } catch (e) {
    ok = false;
  } finally {
    if (rtF) rtF.dispose();
    if (rt8) rt8.dispose();
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
  }
  return ok;
}
