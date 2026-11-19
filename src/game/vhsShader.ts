import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VHS_MYSTICAL_PRESET } from './rules';

export const VhsFilmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(2400, 1080) },
    uGlitch: { value: 0 },
    uGrainIntensity: { value: VHS_MYSTICAL_PRESET.grainBase },
    uScanlineIntensity: { value: VHS_MYSTICAL_PRESET.scanlineBase },
    uChromaticShift: { value: VHS_MYSTICAL_PRESET.chromaticBase },
    uVignetteStrength: { value: VHS_MYSTICAL_PRESET.vignetteBase },
    uLensDistortion: { value: 0.26 },
    uDamageFlash: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGlitch;
    uniform float uGrainIntensity;
    uniform float uScanlineIntensity;
    uniform float uChromaticShift;
    uniform float uVignetteStrength;
    uniform float uLensDistortion;
    uniform float uDamageFlash;

    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }

    void main() {
      // 0. Wide-angle barrel lens distortion (matches mapScreenNdcToWideLensNdc)
      vec2 ndc = (vUv - 0.5) * 2.0;
      float r2 = dot(ndc, ndc);
      float zoom = 1.0 / (1.0 + uLensDistortion * 2.0);
      vec2 distortedNdc = ndc * (1.0 + uLensDistortion * r2) * zoom;
      vec2 uv = distortedNdc * 0.5 + 0.5;

      // 1. Subtle nocturnal VHS tracking bar
      float barPos = fract(uTime * 0.09);
      float trackingBand = max(0.0, 1.0 - abs(uv.y - barPos) * 12.0);

      float lineId = floor(uv.y * 200.0);
      float tickT = floor(uTime * 11.0);
      float lineNoise = hash11(lineId + tickT * 17.3) - 0.5;
      float tearMask = step(0.985 - uGlitch * 0.14, hash11(floor(uv.y * 28.0) + tickT * 7.1));
      float horizOffset =
        lineNoise * (0.0004 + uGlitch * 0.0045) * trackingBand +
        lineNoise * tearMask * (0.0014 + uGlitch * 0.0075);

      vec2 sampleUv = clamp(vec2(uv.x + horizOffset, uv.y), 0.001, 0.999);

      // 2. Edge-only chromatic aberration (center & foreground weapon stay crisp)
      vec2 fromCenter = sampleUv - 0.5;
      float edgeDist2 = dot(fromCenter, fromCenter);
      float ca = uChromaticShift * (0.18 + edgeDist2 * 2.0) + uGlitch * 0.0012 + uDamageFlash * 0.0022;

      float r = texture2D(tDiffuse, vec2(min(0.999, sampleUv.x + ca), sampleUv.y)).r;
      float g = texture2D(tDiffuse, sampleUv).g;
      float b = texture2D(tDiffuse, vec2(max(0.001, sampleUv.x - ca), sampleUv.y)).b;
      vec3 color = vec3(r, g, b);

      // 3. Atmospheric horror night film scanline + subtle shadow contrast
      float scanline = sin(vUv.y * max(360.0, uResolution.y * 0.65) * 3.14159);
      color *= 1.0 - uScanlineIntensity * (0.5 - 0.5 * scanline);
      color += trackingBand * 0.008 * vec3(0.55, 0.85, 0.78);

      // Subtle cool midnight shadow tint so nocturnal corners feel eerie & mysterious
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = vec3(color.r * 0.92, color.g * 0.99, color.b * 1.08);
      color = mix(shadowTint, color, smoothstep(0.08, 0.45, luma));

      // 4. Mysterious nocturnal film grain
      float grain = hash12(vUv * 540.0 + vec2(fract(uTime * 37.0) * 313.0, fract(uTime * 53.0) * 419.0)) - 0.5;
      color += grain * (uGrainIntensity + uGlitch * 0.02);

      // 5. Dramatic corner vignette + crimson attack pulse
      float screenEdgeDist = length(vUv - 0.5);
      float vignette = smoothstep(0.92, 0.28, screenEdgeDist);
      color *= mix(1.0 - uVignetteStrength, 1.0, vignette);

      float edgeMask = smoothstep(0.24, 0.72, screenEdgeDist);
      color = mix(color, vec3(0.88, 0.12, 0.16), uDamageFlash * edgeMask * 0.58);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

export function createVhsFilmPass(width: number, height: number): ShaderPass {
  const pass = new ShaderPass(VhsFilmShader);
  pass.uniforms.uResolution.value.set(width, height);
  return pass;
}
