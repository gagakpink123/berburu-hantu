import * as THREE from 'three';
import { GHOST_DEFINITIONS } from './levels';
import { computeGhostEntranceState, computeGhostFadeInOpacity } from './rules';
import type { SpawnAnchor } from './environments';
import type { GhostTextureEntry } from './textures';
import type { GhostType, ScareMode, SpawnPattern } from './types';

const GHOST_HOLOGRAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GHOST_HOLOGRAM_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPhase;
  uniform vec3 uAuraColor;
  uniform float uHitFlash;
  uniform float uRaged;
  uniform float uGlowBoost;
  uniform float uDissolve;
  uniform float uShadowReveal;
  uniform float uEdgeGlow;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbmSmoke(vec2 p) {
    float v = 0.0;
    float amp = 0.52;
    for (int i = 0; i < 3; i++) {
      v += amp * valueNoise(p);
      p = p * 2.08 + vec2(7.3, 11.1);
      amp *= 0.48;
    }
    return v;
  }

  void main() {
    // Periodic holographic glitch pulse (intensifies briefly on hit)
    float pulseA = max(0.0, sin(uTime * 2.1 + uPhase) * sin(uTime * 6.7 + uPhase * 1.9));
    float burst = pow(pulseA, 9.0);
    float glitchAmt = clamp(burst * 0.85 + uHitFlash * 0.95, 0.0, 1.0);

    float bandY = floor(vUv.y * 26.0);
    float sliceRand = hash12(vec2(bandY, floor(uTime * 14.0 + uPhase)));
    float sliceMask = step(0.68 - glitchAmt * 0.42, sliceRand);
    float xShift = (sliceRand - 0.5) * (0.008 + 0.042 * glitchAmt) * sliceMask;

    vec2 uvMain = vec2(clamp(vUv.x + xShift, 0.002, 0.998), vUv.y);
    float rgbSplit = 0.0032 + 0.0085 * glitchAmt;

    vec4 baseTex = texture2D(uMap, uvMain);
    if (baseTex.a < 0.14) discard;

    float rCh = texture2D(uMap, vec2(clamp(uvMain.x + rgbSplit, 0.002, 0.998), uvMain.y)).r;
    float bCh = texture2D(uMap, vec2(clamp(uvMain.x - rgbSplit, 0.002, 0.998), uvMain.y)).b;
    vec3 texRgb = mix(baseTex.rgb, vec3(rCh, baseTex.g, bCh), 0.38 + 0.42 * glitchAmt);

    // Subtle hologram horizontal scanlines & upward energy sweep
    float scanline = 0.90 + 0.10 * sin(vUv.y * 190.0 - uTime * 9.5);
    float sweep = smoothstep(0.18, 0.0, abs(fract(vUv.y - uTime * 0.42 + uPhase * 0.1) - 0.5));

    // Edge glow detection from alpha gradient around silhouette
    vec2 px = vec2(0.012, 0.012);
    float aL = texture2D(uMap, clamp(uvMain - vec2(px.x, 0.0), 0.0, 1.0)).a;
    float aR = texture2D(uMap, clamp(uvMain + vec2(px.x, 0.0), 0.0, 1.0)).a;
    float aD = texture2D(uMap, clamp(uvMain - vec2(0.0, px.y), 0.0, 1.0)).a;
    float aU = texture2D(uMap, clamp(uvMain + vec2(0.0, px.y), 0.0, 1.0)).a;
    float edgeRim = clamp((1.0 - min(min(aL, aR), min(aD, aU))) * 1.25, 0.0, 1.0);

    vec3 holoGlowColor = mix(uAuraColor, vec3(0.32, 0.95, 0.88), 0.35);
    if (uRaged > 0.5) {
      holoGlowColor = mix(holoGlowColor, vec3(1.0, 0.38, 0.28), 0.55);
    }

    // Preserve clear character art with semi-holographic glow, scanline shimmer & subtle glitch tint
    vec3 litRgb = texRgb * (0.94 + 0.14 * uGlowBoost) * scanline;
    litRgb += holoGlowColor * (0.14 * edgeRim * uGlowBoost + 0.11 * sweep + 0.06 * glitchAmt);

    // Mystical entrance: swirling smoke-dissolve + emergence from pitch-dark shadow silhouette
    float smokeReveal = 1.0;
    if (uDissolve < 0.995) {
      vec2 smokeUv = uvMain * vec2(4.4, 5.8) + vec2(uPhase * 1.3, -uTime * 1.25);
      float n = fbmSmoke(smokeUv);
      float radialCore = length((uvMain - vec2(0.5, 0.46)) * vec2(1.05, 0.82));
      float threshold = clamp(n * 0.62 + uvMain.y * 0.24 + radialCore * 0.26, 0.0, 1.05);
      smokeReveal = smoothstep(threshold - 0.16, threshold + 0.08, uDissolve * 1.26);
      if (smokeReveal < 0.03) discard;

      float smokeEdge = smoothstep(0.04, 0.38, smokeReveal) * (1.0 - smoothstep(0.58, 1.0, smokeReveal));
      vec3 shadowForm = vec3(0.025, 0.035, 0.05) + holoGlowColor * (edgeRim * 0.42);
      litRgb = mix(shadowForm, litRgb, clamp(uShadowReveal, 0.0, 1.0));
      litRgb = mix(litRgb, vec3(0.03, 0.04, 0.05) + holoGlowColor * (0.85 * uEdgeGlow), smokeEdge * 0.9);
    } else if (uShadowReveal < 0.995) {
      vec3 shadowForm = vec3(0.025, 0.035, 0.05) + holoGlowColor * (edgeRim * 0.42);
      litRgb = mix(shadowForm, litRgb, clamp(uShadowReveal, 0.0, 1.0));
    }

    litRgb = mix(litRgb, vec3(1.0), clamp(uHitFlash * 0.72, 0.0, 0.85));

    // Semi-hologram translucency while keeping faces & forms readable
    float holoAlpha = mix(0.84, 0.95, scanline) * (0.94 + 0.06 * edgeRim);
    float finalAlpha = clamp(baseTex.a * holoAlpha * uOpacity * smokeReveal, 0.0, 1.0);
    if (finalAlpha < 0.02) discard;

    gl_FragColor = vec4(litRgb, finalAlpha);
  }
`;

export interface ActiveGhost {
  id: number;
  type: GhostType;
  hp: number;
  maxHp: number;
  isBoss: boolean;
  group: THREE.Group;
  visualGroup: THREE.Group;
  spriteMesh: THREE.Mesh;
  hitMesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  auraMesh: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  hpBarGroup: THREE.Group;
  hpFillMesh: THREE.Mesh;
  hpFillMat: THREE.MeshBasicMaterial;
  opacity: number;

  pattern: SpawnPattern;
  anchor: SpawnAnchor;
  state: 'ambush' | 'spawning' | 'active' | 'dying' | 'despawning';
  age: number;
  ambushDuration: number;
  pebblesThrown: number;
  stayDuration: number;
  spawnDuration: number;
  dieTimer: number;
  hitFlashTimer: number;
  wobbleAngle: number;
  wobbleVel: number;
  baseWorldPos: THREE.Vector3;
  targetWorldPos: THREE.Vector3;
  movePhase: number;
  speedMul: number;
  idleSoundTimer: number;
  attackTimer: number;
  scareMode: ScareMode;
  ragedStage: number;
  hangingInverted: boolean;
}

export class GhostManager {
  public readonly group = new THREE.Group();
  public activeGhosts: ActiveGhost[] = [];
  private nextId = 1;

  private readonly shadowGeo = new THREE.CircleGeometry(0.65, 14);
  private readonly auraGeo = new THREE.PlaneGeometry(1.5, 1.5);
  private readonly hpBgGeo = new THREE.PlaneGeometry(1.1, 0.14);
  private readonly hpFillGeo = new THREE.PlaneGeometry(1.02, 0.08);
  private readonly planeGeoCache = new Map<GhostType, THREE.PlaneGeometry>();
  private readonly hitGeoCache = new Map<GhostType, THREE.PlaneGeometry>();

  constructor(
    private readonly ghostTextures: Record<GhostType, GhostTextureEntry>,
    private readonly shadowTex: THREE.Texture,
    private readonly glowTex: THREE.Texture,
  ) {
    (Object.keys(GHOST_DEFINITIONS) as GhostType[]).forEach((type) => {
      const def = GHOST_DEFINITIONS[type];
      const aspect = this.ghostTextures[type]?.aspect ?? 0.55;
      const w = def.worldHeight * aspect;
      const h = def.worldHeight;
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(0, h / 2, 0); // bottom-center pivot
      this.planeGeoCache.set(type, g);

      const hg = new THREE.PlaneGeometry(w * 1.12, h * 1.06);
      hg.translate(0, h / 2, 0);
      this.hitGeoCache.set(type, hg);
    });
  }

  public spawnGhost(
    type: GhostType,
    anchor: SpawnAnchor,
    pattern: SpawnPattern,
    stayDuration: number,
    speedMul: number,
    scareMode: ScareMode,
  ): ActiveGhost {
    const def = GHOST_DEFINITIONS[type];
    const texEntry = this.ghostTextures[type];

    const root = new THREE.Group();
    const visualGroup = new THREE.Group();
    root.add(visualGroup);

    const isGenderuwoAmbush = type === 'genderuwo';
    const movePhase = Math.random() * Math.PI * 2;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texEntry.texture },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPhase: { value: movePhase },
        uAuraColor: { value: new THREE.Color(def.auraColor) },
        uHitFlash: { value: 0 },
        uRaged: { value: 0 },
        uGlowBoost: { value: scareMode === 'santai' ? 1.15 : 0.95 },
        uDissolve: { value: 0 },
        uShadowReveal: { value: 0 },
        uEdgeGlow: { value: 0 },
      },
      vertexShader: GHOST_HOLOGRAM_VERTEX,
      fragmentShader: GHOST_HOLOGRAM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const spriteMesh = new THREE.Mesh(this.planeGeoCache.get(type)!, mat);
    spriteMesh.castShadow = false;
    spriteMesh.receiveShadow = false;
    spriteMesh.renderOrder = 6;
    visualGroup.add(spriteMesh);

    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const hitMesh = new THREE.Mesh(this.hitGeoCache.get(type)!, hitMat);
    const id = this.nextId++;
    hitMesh.userData = { ghostId: id };
    visualGroup.add(hitMesh);

    const auraMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: def.auraColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const auraMesh = new THREE.Mesh(this.auraGeo, auraMat);
    auraMesh.position.set(0, def.worldHeight * 0.52, -0.14);
    auraMesh.scale.setScalar(def.worldHeight * 0.96);
    auraMesh.renderOrder = 4;
    visualGroup.add(auraMesh);

    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: isGenderuwoAmbush ? 0 : 0.45,
    });
    const shadowMesh = new THREE.Mesh(this.shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.03;
    shadowMesh.scale.setScalar(def.isBoss ? 1.85 : 0.95);
    root.add(shadowMesh);

    const hpBarGroup = new THREE.Group();
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x0b1015, transparent: true, opacity: 0.85, depthTest: false });
    const hpBg = new THREE.Mesh(this.hpBgGeo, hpBgMat);
    hpBarGroup.add(hpBg);

    const hpFillMat = new THREE.MeshBasicMaterial({
      color: def.isBoss ? 0x39ff7a : 0xff6b3d,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const hpFillMesh = new THREE.Mesh(this.hpFillGeo, hpFillMat);
    hpFillMesh.position.z = 0.01;
    hpBarGroup.add(hpFillMesh);
    hpBarGroup.position.set(0, def.worldHeight + 0.35, 0.04);
    hpBarGroup.visible = false;
    hpBarGroup.renderOrder = 20;
    root.add(hpBarGroup);

    // Base & target world coordinates
    const basePos = anchor.anchorPos.clone();
    const targetPos = anchor.anchorPos.clone().add(anchor.peekOffset);
    if (pattern === 'jumpscare') {
      targetPos.lerp(new THREE.Vector3(0, 0, 0), 0.25);
    }

    // Kuntilanak perched on tree branch or standing atop tombstone
    const hangingInverted = type === 'kuntilanak' && anchor.propType === 'perched_tree';
    const standingOnTomb = type === 'kuntilanak' && anchor.propType === 'perched_tomb';

    if (type === 'buto_ijo') {
      // Buto Ijo starts far away behind the temple gate and zooms in toward player!
      basePos.set(0, 0, -24.5);
      targetPos.set(0, 0, -10.5);
    }

    root.position.copy(basePos);
    if (hangingInverted) {
      // Hang upside-down from tree branch!
      visualGroup.position.y = anchor.peekOffset.y + def.worldHeight;
      visualGroup.rotation.z = Math.PI;
    } else if (standingOnTomb) {
      visualGroup.position.y = anchor.peekOffset.y;
    } else if (pattern === 'emerge') {
      visualGroup.position.y = -def.worldHeight * 0.9;
    } else if (pattern === 'float') {
      visualGroup.position.y = def.hoverHeight + 1.8;
    } else {
      visualGroup.position.y = def.hoverHeight;
    }

    this.group.add(root);

    const actor: ActiveGhost = {
      id,
      type,
      hp: def.hp,
      maxHp: def.hp,
      isBoss: Boolean(def.isBoss),
      group: root,
      visualGroup,
      spriteMesh,
      hitMesh,
      material: mat,
      auraMesh,
      shadowMesh,
      hpBarGroup,
      hpFillMesh,
      hpFillMat,
      opacity: 0,
      pattern,
      anchor,
      state: isGenderuwoAmbush ? 'ambush' : 'spawning',
      age: 0,
      ambushDuration: isGenderuwoAmbush ? 1.05 : 0,
      pebblesThrown: 0,
      stayDuration,
      spawnDuration: type === 'buto_ijo' ? 2.15 : pattern === 'jumpscare' ? 0.85 : 1.18,
      dieTimer: 0,
      hitFlashTimer: 0,
      wobbleAngle: 0,
      wobbleVel: 0,
      baseWorldPos: basePos,
      targetWorldPos: targetPos,
      movePhase,
      speedMul,
      idleSoundTimer: 1.0 + Math.random() * 1.4,
      attackTimer:
        scareMode === 'santai'
          ? 3.8 + Math.random() * 1.4
          : scareMode === 'horor'
            ? 2.0 + Math.random() * 1.0
            : 2.4 + Math.random() * 1.0,
      scareMode,
      ragedStage: 0,
      hangingInverted,
    };

    this.activeGhosts.push(actor);
    return actor;
  }

  public getHitMeshes(): THREE.Object3D[] {
    return this.activeGhosts
      .filter((g) => g.state === 'spawning' || g.state === 'active')
      .map((g) => g.hitMesh);
  }

  public findById(id: number): ActiveGhost | undefined {
    return this.activeGhosts.find((g) => g.id === id);
  }

  public triggerHitReaction(ghost: ActiveGhost, newHp: number, killed: boolean): void {
    ghost.hp = newHp;
    ghost.hitFlashTimer = 0.14;
    ghost.wobbleVel = (Math.random() < 0.5 ? -1 : 1) * (ghost.isBoss ? 5.5 : 8.5);
    ghost.hpBarGroup.visible = !ghost.isBoss && newHp > 0;
    const ratio = Math.max(0, ghost.hp / ghost.maxHp);
    ghost.hpFillMesh.scale.x = Math.max(0.001, ratio);
    ghost.hpFillMesh.position.x = -(1 - ratio) * 0.51;
    if (ratio <= 0.4) {
      ghost.hpFillMat.color.setHex(0xff3b47);
    } else if (ratio <= 0.7) {
      ghost.hpFillMat.color.setHex(0xffb830);
    }

    if (killed) {
      ghost.state = 'dying';
      ghost.hitFlashTimer = ghost.isBoss ? 0.28 : 0.2;
      ghost.dieTimer = ghost.isBoss ? 0.92 : 0.44;
      ghost.hpBarGroup.visible = false;
    }
  }

  public update(
    dt: number,
    elapsed: number,
    camera: THREE.Camera,
    onIdleSound: (ghost: ActiveGhost) => void,
    onPebbleThrow: (ghost: ActiveGhost) => void,
    onGhostAttack: (ghost: ActiveGhost) => void,
    onDespawned: (ghost: ActiveGhost, wasKilled: boolean) => void,
    onStartEmerge?: (ghost: ActiveGhost) => void,
  ): void {
    const toRemove: number[] = [];

    for (const g of this.activeGhosts) {
      g.age += dt;
      const def = GHOST_DEFINITIONS[g.type];

      // Always billboard toward camera horizontally
      const dx = camera.position.x - g.group.position.x;
      const dz = camera.position.z - g.group.position.z;
      g.group.rotation.y = Math.atan2(dx, dz);

      g.material.uniforms.uTime.value = elapsed;
      g.material.uniforms.uRaged.value = g.ragedStage > 0 ? 1.0 : 0.0;
      if (g.hitFlashTimer > 0) {
        g.hitFlashTimer = Math.max(0, g.hitFlashTimer - dt);
        g.material.uniforms.uHitFlash.value = Math.min(1, g.hitFlashTimer / 0.14);
      } else {
        g.material.uniforms.uHitFlash.value = 0;
      }

      // Eerie breathing spectral aura around every ghost
      const auraBase = g.isBoss ? 0.36 : 0.28;
      const auraPulse = auraBase + Math.sin(elapsed * 2.4 + g.movePhase) * 0.06;
      if (g.state === 'spawning' || g.state === 'active') {
        (g.auraMesh.material as THREE.MeshBasicMaterial).opacity = auraPulse * g.opacity;
        const auraScale = def.worldHeight * (0.94 + Math.sin(elapsed * 2.1 + g.movePhase) * 0.08);
        g.auraMesh.scale.setScalar(auraScale);
      }

      const springForce = -g.wobbleAngle * 36 - g.wobbleVel * 6.5;
      g.wobbleVel += springForce * dt;
      g.wobbleAngle += g.wobbleVel * dt;

      if (g.state === 'ambush') {
        g.opacity = 0;
        // Genderuwo throws pebbles from behind cover before revealing himself!
        if (g.pebblesThrown === 0 && g.age >= 0.08) {
          g.pebblesThrown = 1;
          onPebbleThrow(g);
        } else if (g.pebblesThrown === 1 && g.age >= 0.52) {
          g.pebblesThrown = 2;
          onPebbleThrow(g);
        }
        if (g.age >= g.ambushDuration) {
          g.state = 'spawning';
          g.age = 0;
          g.opacity = 0.01;
          (g.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.02;
          onStartEmerge?.(g);
        }
      } else if (g.state === 'spawning') {
        const t = Math.min(1, g.age / g.spawnDuration);
        const eased = 1 - Math.pow(1 - t, 3);
        const entrance = computeGhostEntranceState(g.age, g.spawnDuration);
        const fadeDuration = g.type === 'buto_ijo' ? 1.05 : g.pattern === 'jumpscare' ? 0.45 : 0.72;
        const smoothFade = computeGhostFadeInOpacity(g.age, fadeDuration);
        g.opacity = smoothFade;
        g.material.uniforms.uDissolve.value = entrance.dissolveReveal;
        g.material.uniforms.uShadowReveal.value = entrance.shadowReveal;
        g.material.uniforms.uEdgeGlow.value = entrance.edgeGlow;
        (g.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * smoothFade;

        if (g.type === 'buto_ijo') {
          // Dramatic towering approach from behind the temple gate
          g.group.position.lerpVectors(g.baseWorldPos, g.targetWorldPos, eased);
          g.visualGroup.scale.setScalar(0.55 + 0.45 * eased);
          g.visualGroup.position.y = Math.abs(Math.sin(t * Math.PI * 3)) * 0.16;
        } else {
          g.group.position.lerpVectors(g.baseWorldPos, g.targetWorldPos, eased);
          if (g.pattern === 'fade' || g.pattern === 'teleport') {
            // Shimmering ghostly materialization from darkness
            const flicker = 0.88 + 0.12 * Math.sin(t * Math.PI * 5);
            g.opacity = smoothFade * flicker;
            g.visualGroup.scale.setScalar(0.76 + 0.24 * eased);
            g.visualGroup.position.y = def.hoverHeight + (1 - eased) * 0.28;
          } else if (g.hangingInverted) {
            g.visualGroup.position.y = g.anchor.peekOffset.y + def.worldHeight + (1 - eased) * 0.45;
            g.visualGroup.rotation.z = Math.PI + Math.sin(t * Math.PI) * 0.14;
          } else if (g.anchor.propType === 'perched_tomb') {
            g.visualGroup.position.y = g.anchor.peekOffset.y + (1 - eased) * 0.35;
          } else if (g.pattern === 'emerge') {
            // Rising smoothly out of misty soil with eerie tilt
            g.visualGroup.position.y = THREE.MathUtils.lerp(-def.worldHeight * 0.85, def.hoverHeight, eased);
            g.visualGroup.scale.set(0.84 + 0.16 * eased, 0.88 + 0.12 * eased, 1);
            g.visualGroup.rotation.z = Math.sin(t * Math.PI * 2) * 0.08 * (1 - t);
          } else if (g.pattern === 'float') {
            // Descending gracefully through nocturnal mist
            g.visualGroup.position.y = THREE.MathUtils.lerp(def.hoverHeight + 2.1, def.hoverHeight, eased);
            g.visualGroup.rotation.z = Math.sin(t * Math.PI) * 0.09;
          } else if (g.pattern === 'jumpscare') {
            // Eased dramatic lunge without jarring pop
            g.visualGroup.scale.setScalar(0.82 + 0.24 * Math.sin(t * Math.PI * 0.72) + 0.18 * eased);
          } else {
            // Peek: smooth lean out from behind prop
            g.visualGroup.rotation.z = (1 - eased) * (g.anchor.peekOffset.x >= 0 ? -0.18 : 0.18);
          }
        }

        if (t >= 1) {
          g.state = 'active';
          g.age = 0;
          g.opacity = 1;
          g.material.uniforms.uDissolve.value = 1;
          g.material.uniforms.uShadowReveal.value = 1;
          g.material.uniforms.uEdgeGlow.value = 0;
          (g.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.45;
          g.visualGroup.scale.setScalar(1);
          g.visualGroup.rotation.z = g.hangingInverted ? Math.PI : 0;
        }
      } else if (g.state === 'active') {
        g.idleSoundTimer -= dt;
        if (g.idleSoundTimer <= 0) {
          g.idleSoundTimer = g.type === 'tuyul' ? 2.1 + Math.random() * 1.4 : (g.isBoss ? 2.4 : 2.9) + Math.random() * 2.0;
          onIdleSound(g);
        }

        g.attackTimer -= dt;
        if (g.attackTimer <= 0) {
          const baseCd = g.scareMode === 'santai' ? 4.8 : g.scareMode === 'horor' ? 2.8 : 3.6;
          g.attackTimer = (g.isBoss ? baseCd * 0.78 : baseCd) + Math.random() * 1.2;
          g.wobbleVel = (Math.random() < 0.5 ? -1 : 1) * 7.2;
          g.hitFlashTimer = 0.08;
          onGhostAttack(g);
        }

        const mt = elapsed * g.speedMul + g.movePhase;

        if (g.type === 'tuyul') {
          // Tuyul: scurries playfully side-to-side at proportional readable pace
          const shyCycle = Math.sin(g.age * 1.05);
          const hideFactor = shyCycle < -0.58 ? (shyCycle + 0.58) / -0.42 : 0; // 0..1 when hiding
          const scurryX = Math.sin(mt * 2.2) * 1.85;
          g.group.position.x = THREE.MathUtils.lerp(g.targetWorldPos.x + scurryX, g.baseWorldPos.x, hideFactor * 0.82);
          g.group.position.z = THREE.MathUtils.lerp(g.targetWorldPos.z, g.baseWorldPos.z - 0.45, hideFactor * 0.72);
          g.visualGroup.position.y = Math.abs(Math.sin(mt * 4.4)) * 0.16 - hideFactor * 0.42;
          g.visualGroup.rotation.z = g.wobbleAngle + Math.sin(mt * 4.2) * 0.08;
          g.opacity = 1 - hideFactor * 0.35;
        } else if (g.type === 'pocong') {
          // Pocong: rhythmic proportional hops & eerie swaying
          const hopWave = Math.abs(Math.sin(mt * 2.15));
          g.visualGroup.position.y = hopWave * 0.68;
          const stretch = 1 + hopWave * 0.09;
          const squash = 1 / Math.sqrt(stretch);
          g.visualGroup.scale.set(squash, stretch, 1);
          const showoffStep = Math.max(0, Math.sin(g.age * 0.75)) * 1.2;
          g.group.position.x =
            THREE.MathUtils.lerp(g.targetWorldPos.x, g.targetWorldPos.x * 0.65, showoffStep * 0.32) +
            Math.sin(mt * 1.15) * 0.85;
          g.group.position.z = g.targetWorldPos.z + showoffStep;
          g.visualGroup.rotation.z = g.wobbleAngle + Math.sin(mt * 2.3) * 0.12;
        } else if (g.type === 'kuntilanak') {
          if (g.hangingInverted) {
            // Hanging upside down from tree branch & swaying gently
            g.group.position.x = g.anchor.anchorPos.x + g.anchor.peekOffset.x;
            g.group.position.z = g.anchor.anchorPos.z + g.anchor.peekOffset.z;
            g.visualGroup.position.y = g.anchor.peekOffset.y + def.worldHeight + Math.sin(mt * 1.4) * 0.07;
            g.visualGroup.rotation.z = Math.PI + g.wobbleAngle + Math.sin(mt * 1.15) * 0.08;
          } else if (g.anchor.propType === 'perched_tomb') {
            // Standing eerily atop tombstone
            g.group.position.x = g.anchor.anchorPos.x;
            g.group.position.z = g.anchor.anchorPos.z + 0.08;
            g.visualGroup.position.y = g.anchor.peekOffset.y + Math.sin(mt * 1.5) * 0.06;
            g.visualGroup.rotation.z = g.wobbleAngle + Math.sin(mt * 1.0) * 0.05;
          } else {
            // Gliding smoothly in eerie figure-8 through night mist
            g.group.position.x = g.targetWorldPos.x + Math.sin(mt * 0.95) * 1.55;
            g.group.position.z = g.targetWorldPos.z + Math.cos(mt * 0.72) * 0.68;
            g.visualGroup.position.y = def.hoverHeight + Math.sin(mt * 1.45) * 0.28;
            g.visualGroup.rotation.z = g.wobbleAngle + Math.sin(mt * 0.95) * 0.08;
          }
        } else if (g.type === 'genderuwo') {
          // Heavy deliberate stalking stride toward shooter
          const lungeWave = Math.max(0, Math.sin(g.age * 0.65 - 0.5));
          const closeZ = THREE.MathUtils.lerp(g.targetWorldPos.z, -4.4, lungeWave * 0.68);
          const closeX = THREE.MathUtils.lerp(g.targetWorldPos.x, g.targetWorldPos.x * 0.5, lungeWave * 0.62);
          g.group.position.x = closeX + Math.sin(mt * 0.85) * 0.85;
          g.group.position.z = closeZ;
          g.visualGroup.position.y = Math.abs(Math.sin(mt * 1.75)) * 0.11;
          g.visualGroup.rotation.z = g.wobbleAngle + Math.sin(mt * 1.75) * 0.05;
        } else if (g.type === 'buto_ijo') {
          // Boss Buto Ijo: imposing giant stride & periodic size surge
          const rageBoost = g.hp <= 2 ? 1.25 : g.hp <= 3 ? 1.12 : 1.0;
          const bt = elapsed * rageBoost + g.movePhase;
          const zoomCycle = 0.5 + 0.5 * Math.sin(g.age * 0.42);
          g.group.position.x = Math.sin(bt * 0.52) * 3.6;
          g.group.position.z = THREE.MathUtils.lerp(-14.0, -7.8, zoomCycle);
          g.visualGroup.position.y = Math.abs(Math.sin(bt * 1.5)) * 0.14;
          g.visualGroup.rotation.z = g.wobbleAngle + Math.sin(bt * 1.5) * 0.04;

          const giantSurge = Math.max(0, Math.sin(g.age * 0.78 - 0.4));
          const giantScale = 1.0 + giantSurge * (g.hp <= 2 ? 0.48 : 0.36);
          g.visualGroup.scale.setScalar(giantScale);
        }

        const hRatio = Math.max(0.42, 1 - g.visualGroup.position.y * 0.22);
        g.shadowMesh.scale.setScalar((g.isBoss ? 1.9 : 0.95) * hRatio);

        if (!g.isBoss && g.age >= g.stayDuration) {
          g.state = 'despawning';
          g.age = 0;
        }
      } else if (g.state === 'dying') {
        g.dieTimer -= dt;
        const maxD = g.isBoss ? 0.92 : 0.44;
        const p = 1 - Math.max(0, g.dieTimer / maxD);
        if (g.type === 'pocong' || g.type === 'genderuwo') {
          g.visualGroup.rotation.z = p * (Math.PI * 0.48);
          g.visualGroup.position.y = Math.max(0, (1 - p) * 0.35);
          g.opacity = Math.max(0, 1 - p * 1.15);
        } else if (g.type === 'buto_ijo') {
          g.visualGroup.rotation.z = Math.sin(p * 24) * 0.16;
          g.visualGroup.scale.set(1 + p * 0.42, Math.max(0.25, 1 - p * 0.65), 1);
          g.opacity = Math.max(0, 1 - p * 1.08);
        } else {
          g.visualGroup.rotation.y = p * Math.PI * 3.5;
          g.visualGroup.scale.setScalar(1 + p * 0.42);
          g.visualGroup.position.y += dt * 1.5;
          g.opacity = Math.max(0, 1 - p * 1.15);
        }
        const dyingAura = p < 0.25 ? 0.85 : Math.max(0, (1 - p) * 0.72);
        (g.auraMesh.material as THREE.MeshBasicMaterial).opacity = dyingAura;
        g.auraMesh.scale.setScalar(def.worldHeight * (1.05 + p * 0.65));
        (g.shadowMesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.45;
        if (g.dieTimer <= 0) {
          toRemove.push(g.id);
          onDespawned(g, true);
        }
      } else if (g.state === 'despawning') {
        const p = Math.min(1, g.age / 0.45);
        if (g.pattern === 'peek') {
          g.group.position.lerpVectors(g.targetWorldPos, g.baseWorldPos, p);
        }
        g.opacity = 1 - p;
        (g.auraMesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * (g.isBoss ? 0.36 : 0.26);
        (g.shadowMesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.45;
        if (p >= 1) {
          toRemove.push(g.id);
          onDespawned(g, false);
        }
      }

      g.material.uniforms.uOpacity.value = g.opacity;
    }

    if (toRemove.length > 0) {
      this.activeGhosts = this.activeGhosts.filter((g) => {
        if (!toRemove.includes(g.id)) return true;
        this.disposeGhost(g);
        return false;
      });
    }
  }

  private disposeGhost(g: ActiveGhost): void {
    this.group.remove(g.group);
    g.material.dispose();
    (g.hitMesh.material as THREE.Material).dispose();
    (g.auraMesh.material as THREE.Material).dispose();
    (g.shadowMesh.material as THREE.Material).dispose();
    g.hpBarGroup.children.forEach((c) => {
      const m = c as THREE.Mesh;
      if (m.material && !Array.isArray(m.material)) m.material.dispose();
    });
  }

  public clearAll(): void {
    for (const g of this.activeGhosts) {
      this.disposeGhost(g);
    }
    this.activeGhosts = [];
  }

  public dispose(): void {
    this.clearAll();
    this.shadowGeo.dispose();
    this.auraGeo.dispose();
    this.hpBgGeo.dispose();
    this.hpFillGeo.dispose();
    this.planeGeoCache.forEach((g) => g.dispose());
    this.hitGeoCache.forEach((g) => g.dispose());
  }
}
