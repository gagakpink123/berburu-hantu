import * as THREE from 'three';
import { GHOST_DEFINITIONS } from './levels';
import {
  type FaceAttackSlot,
  assignFaceAttackSlots,
  computeFaceAttackEntranceState,
  computeGhostEntranceState,
  computeGhostFadeInOpacity,
  getFaceAttackSlotLayout,
  getIncomingFaceAttackSpawnSlot,
} from './rules';
import type { SpawnAnchor } from './environments';
import type { GhostTextureEntry } from './textures';
import type { GhostType, ScareMode, SpawnPattern } from './types';

const GHOST_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying float vViewZ;
  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewZ = max(0.0, -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const GHOST_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPhase;
  uniform float uHitFlash;
  uniform float uDissolve;
  uniform float uShadowReveal;
  uniform vec3 uHemiSkyColor;
  uniform vec3 uHemiGroundColor;
  uniform float uHemiIntensity;
  uniform vec3 uKeyColor;
  uniform float uKeyIntensity;
  uniform vec3 uFlashColor;
  uniform float uFlashIntensity;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uIsFaceAttack;
  uniform float uScareFactor;
  varying vec2 vUv;
  varying float vViewZ;

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
    vec4 baseTex = texture2D(uMap, vUv);
    if (baseTex.a < 0.14) discard;
    float cleanAlpha = smoothstep(0.14, 0.34, baseTex.a);

    // Subtle tonal balancing so photographic art blends organically into stormy Javanese nights
    float luma = dot(baseTex.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 balancedTex = mix(vec3(luma), baseTex.rgb, 0.85);

    // Scene hemisphere, moonlight key & lightning response matching level atmosphere (no neon/glow)
    vec3 hemiLight = mix(uHemiGroundColor, uHemiSkyColor, clamp(vUv.y * 0.85 + 0.15, 0.0, 1.0)) * (uHemiIntensity * 1.18);
    float heightShade = mix(0.62, 1.08, smoothstep(0.0, 0.72, vUv.y));
    vec3 keyLight = uKeyColor * (uKeyIntensity * 0.44 * heightShade);
    vec3 lightningTerm = uFlashColor * (uFlashIntensity * 0.76);
    vec3 arenaLight = (hemiLight + keyLight + lightningTerm + vec3(0.068)) * uScareFactor;
    vec3 faceFill = (uHemiSkyColor * 0.36 + uKeyColor * 0.40 + vec3(0.12)) * uScareFactor + lightningTerm * 0.52;
    vec3 activeLight = mix(arenaLight, faceFill, uIsFaceAttack);

    vec3 litRgb = balancedTex * activeLight;

    // Mystical entrance: dark smoky shadow condensation without glowing outlines
    float smokeReveal = 1.0;
    if (uDissolve < 0.995) {
      vec2 smokeUv = vUv * vec2(4.4, 5.8) + vec2(uPhase * 1.3, -uTime * 1.25);
      float n = fbmSmoke(smokeUv);
      float radialCore = length((vUv - vec2(0.5, 0.46)) * vec2(1.05, 0.82));
      float threshold = clamp(n * 0.62 + vUv.y * 0.24 + radialCore * 0.26, 0.0, 1.05);
      smokeReveal = smoothstep(threshold - 0.16, threshold + 0.08, uDissolve * 1.26);
      if (smokeReveal < 0.03) discard;

      float smokeEdge = smoothstep(0.04, 0.38, smokeReveal) * (1.0 - smoothstep(0.58, 1.0, smokeReveal));
      vec3 shadowForm = uFogColor * 0.38 + vec3(0.018, 0.022, 0.028);
      litRgb = mix(shadowForm, litRgb, clamp(uShadowReveal, 0.0, 1.0));
      litRgb = mix(litRgb, uFogColor * 0.45 + vec3(0.02), smokeEdge * 0.82);
    } else if (uShadowReveal < 0.995) {
      vec3 shadowForm = uFogColor * 0.38 + vec3(0.018, 0.022, 0.028);
      litRgb = mix(shadowForm, litRgb, clamp(uShadowReveal, 0.0, 1.0));
    }

    // Match exponential distance fog from scene so ghosts sit inside depth rather than floating on top
    float fogAmt = 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
    fogAmt = clamp(fogAmt * mix(0.88, 0.14, uIsFaceAttack), 0.0, 0.88);
    litRgb = mix(litRgb, uFogColor, fogAmt);

    // Subtle impact response flash on hit
    litRgb = mix(litRgb, vec3(0.92), clamp(uHitFlash * 0.48, 0.0, 0.55));

    // Ethereal lower-foot transparency fade on every ghost silhouette
    float footFade = mix(0.20, 1.0, smoothstep(0.0, 0.22, vUv.y));
    float finalAlpha = clamp(cleanAlpha * footFade * uOpacity * smokeReveal, 0.0, 1.0);
    if (finalAlpha < 0.02) discard;

    gl_FragColor = vec4(litRgb, finalAlpha);
  }
`;

export interface ActiveGhost {
  id: number;
  entityId: number;
  appearances: number;
  vanishCount: number;
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
  state: 'ambush' | 'spawning' | 'active' | 'face_attack' | 'dying' | 'despawning';
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
  isFaceAttack: boolean;
  faceAttackSlot: FaceAttackSlot | null;
  faceAttackX: number;
  faceAttackZ: number;
  faceAttackScaleBoost: number;
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

  private readonly _camForward = new THREE.Vector3();
  private readonly _camRight = new THREE.Vector3();
  private readonly lightingState = {
    hemiSkyColor: new THREE.Color(0x1b3048),
    hemiGroundColor: new THREE.Color(0x0d140d),
    hemiIntensity: 0.42,
    keyColor: new THREE.Color(0x9bb8f5),
    keyIntensity: 0.96,
    flashColor: new THREE.Color(0xbef5ff),
    flashIntensity: 0,
    fogColor: new THREE.Color(0x091318),
    fogDensity: 0.028,
    scareFactor: 1.0,
  };

  public updateLighting(input: {
    hemiSkyColor: THREE.Color;
    hemiGroundColor: THREE.Color;
    hemiIntensity: number;
    keyColor: THREE.Color;
    keyIntensity: number;
    flashColor: THREE.Color;
    flashIntensity: number;
    fogColor: THREE.Color;
    fogDensity: number;
    scareMode: ScareMode;
  }): void {
    this.lightingState.hemiSkyColor.copy(input.hemiSkyColor);
    this.lightingState.hemiGroundColor.copy(input.hemiGroundColor);
    this.lightingState.hemiIntensity = input.hemiIntensity;
    this.lightingState.keyColor.copy(input.keyColor);
    this.lightingState.keyIntensity = input.keyIntensity;
    this.lightingState.flashColor.copy(input.flashColor);
    this.lightingState.flashIntensity = input.flashIntensity;
    this.lightingState.fogColor.copy(input.fogColor);
    this.lightingState.fogDensity = input.fogDensity;
    this.lightingState.scareFactor =
      input.scareMode === 'santai' ? 1.24 : input.scareMode === 'horor' ? 0.9 : 1.04;

    for (const g of this.activeGhosts) {
      this.applyLightingUniforms(g.material, g.state === 'face_attack' || (g.isFaceAttack && g.state === 'dying'));
    }
  }

  private applyLightingUniforms(mat: THREE.ShaderMaterial, isFaceAttack: boolean): void {
    mat.uniforms.uHemiSkyColor.value.copy(this.lightingState.hemiSkyColor);
    mat.uniforms.uHemiGroundColor.value.copy(this.lightingState.hemiGroundColor);
    mat.uniforms.uHemiIntensity.value = this.lightingState.hemiIntensity;
    mat.uniforms.uKeyColor.value.copy(this.lightingState.keyColor);
    mat.uniforms.uKeyIntensity.value = this.lightingState.keyIntensity;
    mat.uniforms.uFlashColor.value.copy(this.lightingState.flashColor);
    mat.uniforms.uFlashIntensity.value = this.lightingState.flashIntensity;
    mat.uniforms.uFogColor.value.copy(this.lightingState.fogColor);
    mat.uniforms.uFogDensity.value = this.lightingState.fogDensity;
    mat.uniforms.uIsFaceAttack.value = isFaceAttack ? 1.0 : 0.0;
    mat.uniforms.uScareFactor.value = this.lightingState.scareFactor;
  }

  public spawnGhost(
    type: GhostType,
    anchor: SpawnAnchor,
    pattern: SpawnPattern,
    stayDuration: number,
    speedMul: number,
    scareMode: ScareMode,
    options?: {
      entityId?: number;
      initialHp?: number;
      appearances?: number;
      vanishCount?: number;
      faceAttack?: boolean;
      faceAttackSlot?: FaceAttackSlot;
      camera?: THREE.Camera;
    },
  ): ActiveGhost {
    const def = GHOST_DEFINITIONS[type];
    const texEntry = this.ghostTextures[type];

    const root = new THREE.Group();
    const visualGroup = new THREE.Group();
    root.add(visualGroup);

    const isFaceAttack = Boolean(options?.faceAttack);
    const faceAttackSlot: FaceAttackSlot | null = isFaceAttack
      ? (options?.faceAttackSlot ?? getIncomingFaceAttackSpawnSlot(this.getActiveFaceAttackCount()))
      : null;
    const faceLayout = faceAttackSlot ? getFaceAttackSlotLayout(faceAttackSlot) : null;
    const isGenderuwoAmbush = !isFaceAttack && type === 'genderuwo';
    const movePhase = Math.random() * Math.PI * 2;
    const initialFaceEntrance = isFaceAttack
      ? computeFaceAttackEntranceState({
          ghostType: type,
          ageSec: 0,
          elapsedSec: 0,
          wobbleAngle: 0,
          movePhase,
        })
      : null;
    const initialOpacity = initialFaceEntrance ? initialFaceEntrance.opacity : 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texEntry.texture },
        uTime: { value: 0 },
        uOpacity: { value: initialOpacity },
        uPhase: { value: movePhase },
        uHitFlash: { value: 0 },
        uDissolve: { value: isFaceAttack ? 1 : 0 },
        uShadowReveal: { value: isFaceAttack ? 1 : 0 },
        uHemiSkyColor: { value: this.lightingState.hemiSkyColor.clone() },
        uHemiGroundColor: { value: this.lightingState.hemiGroundColor.clone() },
        uHemiIntensity: { value: this.lightingState.hemiIntensity },
        uKeyColor: { value: this.lightingState.keyColor.clone() },
        uKeyIntensity: { value: this.lightingState.keyIntensity },
        uFlashColor: { value: this.lightingState.flashColor.clone() },
        uFlashIntensity: { value: this.lightingState.flashIntensity },
        uFogColor: { value: this.lightingState.fogColor.clone() },
        uFogDensity: { value: this.lightingState.fogDensity },
        uIsFaceAttack: { value: isFaceAttack ? 1.0 : 0.0 },
        uScareFactor: { value: this.lightingState.scareFactor },
      },
      vertexShader: GHOST_VERTEX,
      fragmentShader: GHOST_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: !isFaceAttack,
      side: THREE.DoubleSide,
    });

    const spriteMesh = new THREE.Mesh(this.planeGeoCache.get(type)!, mat);
    spriteMesh.castShadow = false;
    spriteMesh.receiveShadow = false;
    spriteMesh.renderOrder = faceLayout ? faceLayout.renderOrder : 6;
    visualGroup.add(spriteMesh);

    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const hitMesh = new THREE.Mesh(this.hitGeoCache.get(type)!, hitMat);
    const id = this.nextId++;
    hitMesh.userData = { ghostId: id };
    hitMesh.renderOrder = faceLayout ? faceLayout.renderOrder + 1 : 6;
    if (isFaceAttack) {
      // Constrain hitbox width per lane so center/left/right faces never steal adjacent clicks
      const hitWidthRatio = Math.min(0.38, 0.50 / Math.max(0.5, 4.95 * texEntry.aspect * 1.12));
      hitMesh.scale.set(hitWidthRatio, 0.92, 1);
    }
    visualGroup.add(hitMesh);

    const auraMat = new THREE.MeshBasicMaterial({
      map: this.glowTex,
      color: def.auraColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: !isFaceAttack,
      visible: false,
    });
    const auraMesh = new THREE.Mesh(this.auraGeo, auraMat);
    auraMesh.position.set(0, def.worldHeight * 0.52, -0.14);
    auraMesh.scale.setScalar(def.worldHeight * 0.96);
    auraMesh.renderOrder = faceLayout ? faceLayout.renderOrder - 1 : 4;
    auraMesh.visible = false;
    visualGroup.add(auraMesh);

    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: isGenderuwoAmbush || isFaceAttack ? 0 : 0.45,
    });
    const shadowMesh = new THREE.Mesh(this.shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.03;
    shadowMesh.scale.setScalar(def.isBoss ? 1.85 : 0.95);
    shadowMesh.visible = !isFaceAttack;
    root.add(shadowMesh);

    const initialHp = Math.max(1, Math.min(def.hp, options?.initialHp ?? def.hp));
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
    hpBarGroup.renderOrder = faceLayout ? faceLayout.renderOrder + 2 : 36;

    const initRatio = Math.max(0.001, initialHp / def.hp);
    hpFillMesh.scale.x = initRatio;
    hpFillMesh.position.x = -(1 - initRatio) * 0.51;
    if (initRatio <= 0.4) {
      hpFillMat.color.setHex(0xff3b47);
    } else if (initRatio <= 0.7) {
      hpFillMat.color.setHex(0xffb830);
    }
    hpBarGroup.visible = (!def.isBoss && initialHp < def.hp) || isFaceAttack;
    root.add(hpBarGroup);

    // Base & target world coordinates
    const basePos = anchor.anchorPos.clone();
    const targetPos = anchor.anchorPos.clone().add(anchor.peekOffset);
    if (pattern === 'jumpscare') {
      targetPos.lerp(new THREE.Vector3(0, 0, 0), 0.25);
    }

    // Kuntilanak perched on tree branch or standing atop tombstone
    const hangingInverted = !isFaceAttack && type === 'kuntilanak' && anchor.propType === 'perched_tree';
    const standingOnTomb = !isFaceAttack && type === 'kuntilanak' && anchor.propType === 'perched_tomb';

    if (type === 'buto_ijo' && !isFaceAttack) {
      // Buto Ijo starts far away behind the temple gate and zooms in toward player!
      basePos.set(0, 0, -24.5);
      targetPos.set(0, 0, -10.5);
    }

    if (isFaceAttack && options?.camera && faceLayout && initialFaceEntrance) {
      this._camForward.set(0, 0, -1).applyQuaternion(options.camera.quaternion);
      this._camRight.set(1, 0, 0).applyQuaternion(options.camera.quaternion);
      root.position
        .copy(options.camera.position)
        .addScaledVector(this._camForward, faceLayout.zDist)
        .addScaledVector(this._camRight, faceLayout.xOffset);
      root.quaternion.copy(options.camera.quaternion);
      const faceScale = (4.95 / def.worldHeight) * faceLayout.scaleBoost * initialFaceEntrance.scaleMultiplier;
      visualGroup.scale.setScalar(faceScale);
      visualGroup.position.set(
        initialFaceEntrance.tremorX,
        -0.81 * def.worldHeight * faceScale + initialFaceEntrance.tremorY,
        0,
      );
      visualGroup.rotation.z = initialFaceEntrance.rotationZ;
      hpBarGroup.scale.setScalar(0.22);
      hpBarGroup.position.set(0, -0.36, 0.08);
    } else {
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
    }

    this.group.add(root);

    const actor: ActiveGhost = {
      id,
      entityId: options?.entityId ?? id,
      appearances: options?.appearances ?? 1,
      vanishCount: options?.vanishCount ?? 0,
      type,
      hp: initialHp,
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
      opacity: initialOpacity,
      pattern,
      anchor,
      state: isFaceAttack ? 'face_attack' : isGenderuwoAmbush ? 'ambush' : 'spawning',
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
      idleSoundTimer: isFaceAttack ? 2.4 : 1.0 + Math.random() * 1.4,
      attackTimer: isFaceAttack
        ? 2.2
        : scareMode === 'santai'
          ? 3.8 + Math.random() * 1.4
          : scareMode === 'horor'
            ? 2.0 + Math.random() * 1.0
            : 2.4 + Math.random() * 1.0,
      scareMode,
      ragedStage: isFaceAttack ? 1 : 0,
      hangingInverted,
      isFaceAttack,
      faceAttackSlot,
      faceAttackX: faceLayout?.xOffset ?? 0,
      faceAttackZ: faceLayout?.zDist ?? 0.9,
      faceAttackScaleBoost: faceLayout?.scaleBoost ?? 1,
    };

    this.activeGhosts.push(actor);
    if (isFaceAttack) {
      this.syncFaceAttackSlots();
    }
    return actor;
  }

  private syncFaceAttackSlots(): void {
    const activeFaces = this.activeGhosts.filter((g) => g.state === 'face_attack');
    const assigned = assignFaceAttackSlots(activeFaces);
    for (const { item, slot } of assigned) {
      item.faceAttackSlot = slot;
      const layout = getFaceAttackSlotLayout(slot);
      item.spriteMesh.renderOrder = layout.renderOrder;
      item.hitMesh.renderOrder = layout.renderOrder + 1;
      item.auraMesh.renderOrder = layout.renderOrder - 1;
      item.hpBarGroup.renderOrder = layout.renderOrder + 2;
    }
  }

  public getFaceAttackSlotSummary(): string {
    const activeFaces = this.activeGhosts
      .filter((g) => g.state === 'face_attack' && g.faceAttackSlot !== null)
      .sort((a, b) => a.id - b.id);
    return activeFaces.map((g) => `${g.faceAttackSlot}:${g.type}`).join(',');
  }

  public getHitMeshes(): THREE.Object3D[] {
    return this.activeGhosts
      .filter((g) => g.state === 'spawning' || g.state === 'active' || g.state === 'face_attack')
      .map((g) => g.hitMesh);
  }

  public getActiveFaceAttackCount(): number {
    return this.activeGhosts.filter((g) => g.state === 'face_attack').length;
  }

  public hasActiveFaceAttack(): boolean {
    return this.getActiveFaceAttackCount() > 0;
  }

  public hasShakingFaceAttack(): boolean {
    return this.activeGhosts.some((g) => g.state === 'face_attack' && g.type !== 'kuntilanak');
  }

  public findById(id: number): ActiveGhost | undefined {
    return this.activeGhosts.find((g) => g.id === id);
  }

  public triggerHitReaction(ghost: ActiveGhost, newHp: number, killed: boolean): void {
    ghost.hp = newHp;
    ghost.hitFlashTimer = 0.14;
    if (ghost.state === 'face_attack' && ghost.type === 'kuntilanak') {
      ghost.wobbleVel = 0;
      ghost.wobbleAngle = 0;
    } else {
      ghost.wobbleVel = (Math.random() < 0.5 ? -1 : 1) * (ghost.isBoss ? 5.5 : 8.5);
    }
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
      const wasFaceAttack = ghost.state === 'face_attack';
      ghost.state = 'dying';
      ghost.hitFlashTimer = ghost.isBoss ? 0.28 : 0.2;
      ghost.dieTimer = ghost.isBoss ? 0.92 : 0.44;
      ghost.hpBarGroup.visible = false;
      if (wasFaceAttack) {
        this.syncFaceAttackSlots();
      }
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

      // Billboard toward camera (face_attack locks parallel to camera lens right in front of face)
      if (g.state === 'face_attack' || (g.isFaceAttack && g.state === 'dying')) {
        g.group.quaternion.copy(camera.quaternion);
      } else {
        const dx = camera.position.x - g.group.position.x;
        const dz = camera.position.z - g.group.position.z;
        g.group.rotation.y = Math.atan2(dx, dz);
      }

      g.material.uniforms.uTime.value = elapsed;
      if (g.hitFlashTimer > 0) {
        g.hitFlashTimer = Math.max(0, g.hitFlashTimer - dt);
        g.material.uniforms.uHitFlash.value = Math.min(1, g.hitFlashTimer / 0.14);
      } else {
        g.material.uniforms.uHitFlash.value = 0;
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

        if (g.age >= g.stayDuration) {
          g.state = 'despawning';
          g.age = 0;
        }
      } else if (g.state === 'face_attack') {
        // Close-up face appearance: Kuntilanak fades in slowly with ZERO shake; others zoom rapidly & bounce
        const layout = getFaceAttackSlotLayout(g.faceAttackSlot ?? 'center');
        g.faceAttackX = THREE.MathUtils.damp(g.faceAttackX, layout.xOffset, 10, dt);
        g.faceAttackZ = THREE.MathUtils.damp(g.faceAttackZ, layout.zDist, 10, dt);
        g.faceAttackScaleBoost = THREE.MathUtils.damp(g.faceAttackScaleBoost, layout.scaleBoost, 10, dt);

        const entrance = computeFaceAttackEntranceState({
          ghostType: g.type,
          ageSec: g.age,
          elapsedSec: elapsed,
          wobbleAngle: g.wobbleAngle,
          movePhase: g.movePhase,
        });
        if (!entrance.allowShake) {
          g.wobbleVel = 0;
          g.wobbleAngle = 0;
        }

        const targetScale = (4.95 / def.worldHeight) * g.faceAttackScaleBoost * entrance.scaleMultiplier;

        this._camForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        this._camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        g.group.position
          .copy(camera.position)
          .addScaledVector(this._camForward, g.faceAttackZ)
          .addScaledVector(this._camRight, g.faceAttackX);
        g.group.quaternion.copy(camera.quaternion);

        g.visualGroup.scale.setScalar(targetScale);
        g.visualGroup.position.set(
          entrance.tremorX,
          -0.81 * def.worldHeight * targetScale + entrance.tremorY,
          0,
        );
        g.visualGroup.rotation.z = entrance.rotationZ;
        g.hpBarGroup.scale.setScalar(0.22);
        g.hpBarGroup.position.set(0, -0.36, 0.08);
        g.hpBarGroup.visible = entrance.opacity > 0.2;
        g.opacity = entrance.opacity;
        g.material.uniforms.uDissolve.value = 1;
        g.material.uniforms.uShadowReveal.value = 1;

        // Periodic close-up pressure scare while ghost lingers in front of player
        g.attackTimer -= dt;
        if (g.attackTimer <= 0) {
          g.attackTimer = 2.6 + Math.random() * 0.8;
          if (entrance.allowShake) {
            g.wobbleVel = (Math.random() < 0.5 ? -1 : 1) * 8.0;
          }
          onGhostAttack(g);
        }
      } else if (g.state === 'dying') {
        g.dieTimer -= dt;
        const maxD = g.isBoss ? 0.92 : 0.44;
        const p = 1 - Math.max(0, g.dieTimer / maxD);
        if (g.isFaceAttack) {
          this._camForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
          this._camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
          g.group.position
            .copy(camera.position)
            .addScaledVector(this._camForward, g.faceAttackZ + p * 1.45)
            .addScaledVector(this._camRight, g.faceAttackX);
          g.visualGroup.rotation.z = g.type === 'kuntilanak' ? 0 : p * 0.28;
          g.opacity = Math.max(0, 1 - p * 1.35);
        } else if (g.type === 'pocong' || g.type === 'genderuwo') {
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
