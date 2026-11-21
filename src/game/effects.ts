import * as THREE from 'three';
import {
  computeLightningCooldownSec,
  computeLightningEnvelope,
  computeMeteorCooldownSec,
  computeWeatherState,
  getGhostEntranceProfile,
  getGhostExplosionProfile,
  type WeatherState,
} from './rules';
import type { ProceduralTextureSet } from './textures';
import type { GhostType } from './types';

interface BurstParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
}

interface AshParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
}

interface SmokeParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  startSize: number;
  endSize: number;
  color: THREE.Color;
}

interface EnergyShard {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
}

interface SpiritWisp {
  active: boolean;
  center: THREE.Vector3;
  angle: number;
  angularSpeed: number;
  radius: number;
  radialVel: number;
  riseSpeed: number;
  yOffset: number;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
}

interface CoreFlash {
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  haloMesh: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  sigilMesh: THREE.Mesh;
  sigilMat: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  life: number;
  coreScale: number;
  spinDir: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  life: number;
  maxScale: number;
  tiltX: number;
  tiltY: number;
}

interface ThrownPebble {
  mesh: THREE.Mesh;
  active: boolean;
  start: THREE.Vector3;
  end: THREE.Vector3;
  age: number;
  life: number;
}

interface Firefly {
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  speed: number;
  scaleBias: number;
}

interface FallingLeaf {
  x: number;
  y: number;
  z: number;
  fallSpeed: number;
  swayPhase: number;
  spinSpeed: number;
  scaleBias: number;
}

interface RainDrop {
  x: number;
  y: number;
  z: number;
  speed: number;
  len: number;
  widthScale: number;
  slantJitter: number;
}

interface RainSplash {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  active: boolean;
}

interface SkyMeteor {
  group: THREE.Group;
  headMat: THREE.MeshBasicMaterial;
  tailMat: THREE.MeshBasicMaterial;
  start: THREE.Vector3;
  end: THREE.Vector3;
  age: number;
  life: number;
  active: boolean;
}

const ASH_HEX = [0x6e747a, 0x8d949b, 0xa8afb6, 0x575c61, 0x5efce4, 0xffb85c];
const SMOKE_HEX = [0x07080b, 0x0e1015, 0x151820, 0x1b1e28];
const SHARD_HEX = [0xffffff, 0xe8fbff, 0x8ef9ff, 0x4bf2d8, 0xc792ff];
const WISP_HEX = [0x4bf2d8, 0x9b6dff, 0x7effb2, 0xcaf7ff, 0xffffff];
const FIREFLY_SATURATED_HEX = [0x00d95f, 0xe69500, 0x00c9a7, 0xd4a400, 0x1ee048];
const LEAF_SATURATED_HEX = [0x2a8c28, 0xb85f12, 0x678a1a, 0x99331a, 0x3b7d22];

function randomRainScatter(): { x: number; y: number; z: number } {
  // Fully randomized spatial scatter in front of player (safely beyond 2.4m from camera lens)
  const angle = -Math.PI * 0.36 + Math.random() * Math.PI * 0.72;
  const dist = 2.8 + Math.pow(Math.random(), 0.78) * 17.5;
  return {
    x: Math.sin(angle) * dist + (Math.random() - 0.5) * 1.4,
    y: 0.1 + Math.random() * 9.4,
    z: Math.min(-2.4, -Math.cos(angle) * dist + (Math.random() - 0.5) * 0.8),
  };
}

export class EffectsManager {
  public readonly group = new THREE.Group();

  private readonly burstCapacity = 120;
  private readonly burstPool: BurstParticle[] = [];
  private readonly burstMesh: THREE.InstancedMesh;

  private readonly ashCapacity = 110;
  private readonly ashPool: AshParticle[] = [];
  private readonly ashMesh: THREE.InstancedMesh;

  private readonly smokeCapacity = 84;
  private readonly smokePool: SmokeParticle[] = [];
  private readonly smokeMesh: THREE.InstancedMesh;

  private readonly shardCapacity = 128;
  private readonly shardPool: EnergyShard[] = [];
  private readonly shardMesh: THREE.InstancedMesh;

  private readonly wispCapacity = 64;
  private readonly wispPool: SpiritWisp[] = [];
  private readonly wispMesh: THREE.InstancedMesh;

  private readonly coreFlashes: CoreFlash[] = [];

  private readonly explosionLight: THREE.PointLight;
  private explosionLightIntensity = 0;

  private readonly rings: ShockwaveRing[] = [];
  private readonly pebbles: ThrownPebble[] = [];

  private readonly fireflyCount = 24;
  private readonly fireflies: Firefly[] = [];
  private readonly fireflyMesh: THREE.InstancedMesh;

  private readonly leafCount = 20;
  private readonly leaves: FallingLeaf[] = [];
  private readonly leafMesh: THREE.InstancedMesh;

  private readonly rainCount = 190;
  private readonly rainDrops: RainDrop[] = [];
  private readonly rainMesh: THREE.InstancedMesh;
  private readonly rainMat: THREE.MeshBasicMaterial;
  private readonly rainSplashes: RainSplash[] = [];
  private splashTimer = 0;

  private readonly mistPlanes: THREE.Mesh[] = [];
  private readonly mistMat: THREE.MeshBasicMaterial;
  private readonly ambientMistPlanes: THREE.Mesh[] = [];
  private readonly ambientMistMat: THREE.MeshBasicMaterial;

  private readonly lightningBolts: THREE.LineSegments;
  private readonly lightningBoltMat: THREE.LineBasicMaterial;
  private readonly lightningGlowMesh: THREE.Mesh;
  private readonly lightningGlowMat: THREE.MeshBasicMaterial;
  private lightningTimer = 0.45;
  private lightningAge = 99;
  private lightningFlash = 0;
  private lastBoltX = 4.5;

  private readonly meteors: SkyMeteor[] = [];
  private meteorTimer = 10.5;

  private readonly dummy = new THREE.Object3D();
  private readonly _dirVec = new THREE.Vector3();
  private readonly _upVec = new THREE.Vector3(0, 1, 0);
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor(textures: ProceduralTextureSet) {
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

    // 1. Pooled white light / spawn / miss glow bursts
    const burstGeo = new THREE.PlaneGeometry(0.32, 0.32);
    const burstMat = new THREE.MeshBasicMaterial({
      map: textures.softGlow,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.geometries.push(burstGeo);
    this.materials.push(burstMat);

    this.burstMesh = new THREE.InstancedMesh(burstGeo, burstMat, this.burstCapacity);
    this.burstMesh.frustumCulled = false;
    this.burstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.burstCapacity; i++) {
      this.burstMesh.setMatrixAt(i, zeroMat);
      this.burstMesh.setColorAt(i, new THREE.Color(0xffffff));
      this.burstPool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 0.5,
        size: 1,
        color: new THREE.Color(0xffffff),
      });
    }
    this.group.add(this.burstMesh);

    // 1b. Dark billowing black smoke plumes (rendered above core halo so rich dark soot clouds frame the flash!)
    const smokeGeo = new THREE.PlaneGeometry(0.92, 0.92);
    const smokeMat = new THREE.MeshBasicMaterial({
      map: textures.smokeCloud,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.geometries.push(smokeGeo);
    this.materials.push(smokeMat);

    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, this.smokeCapacity);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.renderOrder = 14;
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.smokeCapacity; i++) {
      this.smokeMesh.setMatrixAt(i, zeroMat);
      this.smokeMesh.setColorAt(i, new THREE.Color(0x0b0d12));
      this.smokePool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 0.9,
        startSize: 0.95,
        endSize: 2.85,
        color: new THREE.Color(0x0b0d12),
      });
    }
    this.group.add(this.smokeMesh);

    // 1c. Tumbling charred ash & mystical ember flakes (clearly readable around smoke clouds)
    const ashGeo = new THREE.PlaneGeometry(0.21, 0.14);
    const ashMat = new THREE.MeshBasicMaterial({
      map: textures.smokeCloud,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.geometries.push(ashGeo);
    this.materials.push(ashMat);

    this.ashMesh = new THREE.InstancedMesh(ashGeo, ashMat, this.ashCapacity);
    this.ashMesh.frustumCulled = false;
    this.ashMesh.renderOrder = 15;
    this.ashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.ashCapacity; i++) {
      this.ashMesh.setMatrixAt(i, zeroMat);
      this.ashMesh.setColorAt(i, new THREE.Color(0x899097));
      this.ashPool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        age: 0,
        life: 1.1,
        size: 1,
        color: new THREE.Color(0x899097),
      });
    }
    this.group.add(this.ashMesh);

    // 1d. Scattering high-speed white/spectral energy shards (serpihan partikel energi)
    const shardGeo = new THREE.PlaneGeometry(0.052, 0.46);
    const shardMat = new THREE.MeshBasicMaterial({
      map: textures.softGlow,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.geometries.push(shardGeo);
    this.materials.push(shardMat);

    this.shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, this.shardCapacity);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.renderOrder = 16;
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.shardCapacity; i++) {
      this.shardMesh.setMatrixAt(i, zeroMat);
      this.shardMesh.setColorAt(i, new THREE.Color(0xffffff));
      this.shardPool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 0.6,
        size: 1,
        color: new THREE.Color(0xffffff),
      });
    }
    this.group.add(this.shardMesh);

    // 1e. Spiraling mystical spirit wisps rising out of vanquished ghosts
    const wispGeo = new THREE.PlaneGeometry(0.32, 0.32);
    const wispMat = new THREE.MeshBasicMaterial({
      map: textures.softGlow,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.geometries.push(wispGeo);
    this.materials.push(wispMat);

    this.wispMesh = new THREE.InstancedMesh(wispGeo, wispMat, this.wispCapacity);
    this.wispMesh.frustumCulled = false;
    this.wispMesh.renderOrder = 16;
    this.wispMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.wispCapacity; i++) {
      this.wispMesh.setMatrixAt(i, zeroMat);
      this.wispMesh.setColorAt(i, new THREE.Color(0x4bf2d8));
      this.wispPool.push({
        active: false,
        center: new THREE.Vector3(),
        angle: 0,
        angularSpeed: 4,
        radius: 0.5,
        radialVel: 0.4,
        riseSpeed: 1.8,
        yOffset: 0,
        age: 0,
        life: 1.2,
        size: 1,
        color: new THREE.Color(0x4bf2d8),
      });
    }
    this.group.add(this.wispMesh);

    // 1f. Tri-layer mystical white core flash + spectral halo + rotating spirit seal starburst
    const coreGeo = new THREE.PlaneGeometry(1.0, 1.0);
    this.geometries.push(coreGeo);
    for (let i = 0; i < 4; i++) {
      const coreMat = new THREE.MeshBasicMaterial({
        map: textures.softGlow,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const haloMat = new THREE.MeshBasicMaterial({
        map: textures.softGlow,
        color: i % 2 === 0 ? 0x4bf2d8 : 0xa855f7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const sigilMat = new THREE.MeshBasicMaterial({
        map: textures.mysticSigil,
        color: 0xdffcff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(coreMat, haloMat, sigilMat);
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      const haloMesh = new THREE.Mesh(coreGeo, haloMat);
      const sigilMesh = new THREE.Mesh(coreGeo, sigilMat);
      coreMesh.visible = false;
      haloMesh.visible = false;
      sigilMesh.visible = false;
      coreMesh.renderOrder = 13;
      sigilMesh.renderOrder = 12;
      haloMesh.renderOrder = 11;
      this.group.add(haloMesh, sigilMesh, coreMesh);
      this.coreFlashes.push({
        coreMesh,
        coreMat,
        haloMesh,
        haloMat,
        sigilMesh,
        sigilMat,
        active: false,
        age: 0,
        life: 0.55,
        coreScale: 2.5,
        spinDir: i % 2 === 0 ? 1 : -1,
      });
    }

    // Dynamic white-spectral light burst illuminating surroundings when ghosts are hit/defeated
    this.explosionLight = new THREE.PointLight(0xeefcff, 0, 22, 1.35);
    this.group.add(this.explosionLight);

    // 1g. Multi-stage crisp thin mystical shockwave rings
    const ringGeo = new THREE.RingGeometry(0.76, 0.84, 40);
    this.geometries.push(ringGeo);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 15;
      this.group.add(mesh);
      this.rings.push({
        mesh,
        mat,
        active: false,
        age: 0,
        life: 0.5,
        maxScale: 4.0,
        tiltX: 0,
        tiltY: 0,
      });
    }

    // 1f. Genderuwo thrown pebbles (kerikil)
    const pebbleGeo = new THREE.DodecahedronGeometry(0.11, 0);
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: 0x4b4640,
      roughness: 0.9,
      metalness: 0.05,
    });
    this.geometries.push(pebbleGeo);
    this.materials.push(pebbleMat);
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(pebbleGeo, pebbleMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pebbles.push({
        mesh,
        active: false,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        age: 0,
        life: 0.55,
      });
    }

    // 2. Ambient saturated, dimmer & slightly transparent floating light motes (partikel cahaya)
    const ffGeo = new THREE.PlaneGeometry(0.11, 0.11);
    const ffMat = new THREE.MeshBasicMaterial({
      map: textures.softGlow,
      color: 0xffffff,
      transparent: true,
      opacity: 0.34, // Reduced luminance & slightly transparent
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.geometries.push(ffGeo);
    this.materials.push(ffMat);

    this.fireflyMesh = new THREE.InstancedMesh(ffGeo, ffMat, this.fireflyCount);
    this.fireflyMesh.frustumCulled = false;
    for (let i = 0; i < this.fireflyCount; i++) {
      const angle = -Math.PI * 0.35 + Math.random() * Math.PI * 0.7;
      const dist = 4.6 + Math.random() * 13.5;
      this.fireflies.push({
        baseX: Math.sin(angle) * dist,
        baseY: 0.55 + Math.random() * 3.6,
        baseZ: Math.min(-3.0, -Math.cos(angle) * dist),
        phase: Math.random() * Math.PI * 2,
        speed: 0.55 + Math.random() * 0.85,
        scaleBias: 0.72 + Math.random() * 0.48,
      });
      this.fireflyMesh.setColorAt(
        i,
        new THREE.Color(FIREFLY_SATURATED_HEX[i % FIREFLY_SATURATED_HEX.length]),
      );
    }
    if (this.fireflyMesh.instanceColor) {
      this.fireflyMesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.fireflyMesh);

    // 2b. Saturated, slightly transparent falling nocturnal leaves
    const leafGeo = new THREE.PlaneGeometry(0.20, 0.20);
    const leafMat = new THREE.MeshBasicMaterial({
      map: textures.leafTex,
      transparent: true,
      opacity: 0.54, // Slightly transparent
      alphaTest: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: 0xffffff,
    });
    this.geometries.push(leafGeo);
    this.materials.push(leafMat);

    this.leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, this.leafCount);
    this.leafMesh.frustumCulled = false;
    for (let i = 0; i < this.leafCount; i++) {
      const angle = -Math.PI * 0.35 + Math.random() * Math.PI * 0.7;
      const dist = 4.2 + Math.random() * 12.8;
      this.leaves.push({
        x: Math.sin(angle) * dist,
        y: 0.8 + Math.random() * 6.8,
        z: Math.min(-2.9, -Math.cos(angle) * dist),
        fallSpeed: 0.40 + Math.random() * 0.52,
        swayPhase: Math.random() * Math.PI * 2,
        spinSpeed: 1.4 + Math.random() * 2.4,
        scaleBias: 0.78 + Math.random() * 0.44,
      });
      this.leafMesh.setColorAt(
        i,
        new THREE.Color(LEAF_SATURATED_HEX[i % LEAF_SATURATED_HEX.length]),
      );
    }
    if (this.leafMesh.instanceColor) {
      this.leafMesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.leafMesh);

    // 3. Thin low ground-hugging mist (kabut tipis diatas tanah)
    const mistGeo = new THREE.PlaneGeometry(7.2, 3.8);
    this.mistMat = new THREE.MeshBasicMaterial({
      map: textures.mistPuff,
      color: 0x7d9bb0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.geometries.push(mistGeo);
    this.materials.push(this.mistMat);

    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI * 0.36 + (i / 11) * Math.PI * 0.72;
      const dist = 4.5 + (i % 3) * 3.5;
      const m = new THREE.Mesh(mistGeo, this.mistMat);
      const yPos = 0.18 + (i % 3) * 0.08;
      m.position.set(Math.sin(angle) * dist, yPos, Math.min(-2.8, -Math.cos(angle) * dist));
      m.rotation.x = -Math.PI / 2 + 0.34;
      m.rotation.z = ((i % 4) - 1.5) * 0.16;
      m.userData = { baseX: m.position.x, baseZ: m.position.z, phase: i * 0.72, speed: 0.24 + (i % 3) * 0.08 };
      this.mistPlanes.push(m);
      this.group.add(m);
    }

    // 3b. Slow drifting thin ambient mid-arena mist wisps
    const ambMistGeo = new THREE.PlaneGeometry(8.6, 2.2);
    this.ambientMistMat = new THREE.MeshBasicMaterial({
      map: textures.mistPuff,
      color: 0x6c8ba1,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.geometries.push(ambMistGeo);
    this.materials.push(this.ambientMistMat);

    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI * 0.38 + (i / 9) * Math.PI * 0.76;
      const dist = 6.5 + (i % 4) * 3.0;
      const m = new THREE.Mesh(ambMistGeo, this.ambientMistMat);
      const yPos = 0.55 + (i % 3) * 0.34;
      m.position.set(Math.sin(angle) * dist, yPos, Math.min(-3.0, -Math.cos(angle) * dist));
      m.lookAt(0, yPos, 0);
      m.userData = {
        baseX: m.position.x,
        baseZ: m.position.z,
        phase: i * 1.15,
        speed: 0.09 + (i % 3) * 0.035,
      };
      this.ambientMistPlanes.push(m);
      this.group.add(m);
    }

    // 4. Short, randomly scattered fine drizzle droplets (gerimis pendek acak) + splash rings
    const rainGeo = new THREE.PlaneGeometry(0.036, 0.17);
    this.rainMat = new THREE.MeshBasicMaterial({
      map: textures.rainStreak,
      color: 0xcbe9ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.geometries.push(rainGeo);
    this.materials.push(this.rainMat);

    this.rainMesh = new THREE.InstancedMesh(rainGeo, this.rainMat, this.rainCount);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.rainCount; i++) {
      const p = randomRainScatter();
      this.rainDrops.push({
        x: p.x,
        y: p.y,
        z: p.z,
        speed: 6.8 + Math.random() * 5.6,
        len: 0.55 + Math.random() * 0.85,
        widthScale: 0.72 + Math.random() * 0.56,
        slantJitter: (Math.random() - 0.5) * 0.14,
      });
    }
    this.group.add(this.rainMesh);

    const splashGeo = new THREE.RingGeometry(0.05, 0.095, 14);
    this.geometries.push(splashGeo);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xb7e3ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(splashGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.rainSplashes.push({ mesh, mat, age: 0, life: 0.34, active: false });
    }

    // 5. Distant sky forked lightning bolt (kilatan petir) + cloud-sheet glow halo
    const boltVerts = new Float32Array(26 * 6);
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(boltVerts, 3));
    this.geometries.push(boltGeo);
    this.lightningBoltMat = new THREE.LineBasicMaterial({
      color: 0xeaf8ff,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.materials.push(this.lightningBoltMat);
    this.lightningBolts = new THREE.LineSegments(boltGeo, this.lightningBoltMat);
    this.lightningBolts.visible = false;
    this.group.add(this.lightningBolts);

    const boltGlowGeo = new THREE.PlaneGeometry(18, 13);
    this.lightningGlowMat = new THREE.MeshBasicMaterial({
      map: textures.softGlow,
      color: 0xa2d6ff,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.geometries.push(boltGlowGeo);
    this.materials.push(this.lightningGlowMat);
    this.lightningGlowMesh = new THREE.Mesh(boltGlowGeo, this.lightningGlowMat);
    this.lightningGlowMesh.position.set(4.5, 13.5, -25.5);
    this.lightningGlowMesh.visible = false;
    this.group.add(this.lightningGlowMesh);
    this.regenerateBoltGeometry(4.5);

    // 6. Rare falling meteors (bintang berekor) in the upper night sky
    const meteorHeadGeo = new THREE.PlaneGeometry(0.42, 0.42);
    const meteorTailGeo = new THREE.PlaneGeometry(0.18, 4.4);
    meteorTailGeo.translate(0, 2.2, 0); // Tail trails upward behind the meteor head
    this.geometries.push(meteorHeadGeo, meteorTailGeo);

    for (let i = 0; i < 2; i++) {
      const mGroup = new THREE.Group();
      const headMat = new THREE.MeshBasicMaterial({
        map: textures.softGlow,
        color: 0xf0fcff,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const tailMat = new THREE.MeshBasicMaterial({
        map: textures.rainStreak,
        color: 0x9ae8ff,
        transparent: true,
        opacity: 0,
        fog: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(headMat, tailMat);
      const head = new THREE.Mesh(meteorHeadGeo, headMat);
      const tail = new THREE.Mesh(meteorTailGeo, tailMat);
      mGroup.add(tail, head);
      mGroup.visible = false;
      this.group.add(mGroup);
      this.meteors.push({
        group: mGroup,
        headMat,
        tailMat,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        age: 0,
        life: 1.0,
        active: false,
      });
    }
    this.meteorTimer = 8.5 + Math.random() * 8.0;
  }

  private regenerateBoltGeometry(centerX: number): void {
    const pos = this.lightningBolts.geometry.attributes.position as THREE.BufferAttribute;
    let x = centerX;
    let y = 20.5;
    const z = -24.5;
    let segIdx = 0;

    for (let i = 0; i < 14; i++) {
      const nx = x + (Math.random() - 0.5) * 2.8;
      const ny = y - (0.72 + Math.random() * 0.52);
      pos.setXYZ(segIdx++, x, y, z);
      pos.setXYZ(segIdx++, nx, ny, z);

      if (i % 3 === 1 && segIdx + 4 < 52) {
        const bx1 = nx + (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 1.3);
        const by1 = ny - (0.55 + Math.random() * 0.65);
        const bx2 = bx1 + (bx1 - nx) * 0.78;
        const by2 = by1 - 0.85;
        pos.setXYZ(segIdx++, nx, ny, z);
        pos.setXYZ(segIdx++, bx1, by1, z);
        pos.setXYZ(segIdx++, bx1, by1, z);
        pos.setXYZ(segIdx++, bx2, by2, z);
      }

      x = nx;
      y = ny;
    }

    while (segIdx < 52) {
      pos.setXYZ(segIdx++, x, y, z);
    }
    pos.needsUpdate = true;
    this.lightningGlowMesh.position.set(centerX, 13.8, z - 1.2);
  }

  public spawnBurst(
    origin: THREE.Vector3,
    count: number,
    colorHex: number,
    speed = 3.2,
    size = 1.0,
    life = 0.55,
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.burstCapacity && spawned < count; i++) {
      const p = this.burstPool[i];
      if (p.active) continue;
      p.active = true;
      p.pos.copy(origin);
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.3) * Math.PI;
      const spd = speed * (0.4 + Math.random() * 0.85);
      p.vel.set(Math.cos(theta) * Math.cos(phi) * spd, Math.sin(phi) * spd + 1.0, Math.sin(theta) * Math.cos(phi) * spd);
      p.age = 0;
      p.life = life * (0.7 + Math.random() * 0.6);
      p.size = size * (0.65 + Math.random() * 0.85);
      p.color.setHex(colorHex);
      spawned += 1;
    }
  }

  /**
   * Dramatic, mystical & epic ghost impact / defeat explosion:
   * - Blinding white core soul-flash + spectral tosca/violet outer halo
   * - Dynamic PointLight illuminating surrounding props & mist
   * - Multi-angle tilted shockwave rings (white, tosca, violet)
   * - Dense billowing dark black smoke clouds
   * - Swirling charred ash + glowing mystical embers
   * - Spiraling spectral spirit wisps ascending in a vortex
   * - High-velocity scattering energy shard streaks
   */
  public spawnGhostExplosion(origin: THREE.Vector3, isKill: boolean, isBoss = false): void {
    const profile = getGhostExplosionProfile(isKill, isBoss);
    const scaleMul = isBoss ? 1.32 : isKill ? 1.1 : 0.78;

    const safeOrigin = origin.clone();
    safeOrigin.z = Math.min(safeOrigin.z, -2.5);

    // 1. Dynamic environmental flash light + tri-layer core flare, rotating spirit sigil & spectral halo
    this.explosionLight.position.copy(safeOrigin).add(new THREE.Vector3(0, 0.35, 0.55));
    this.explosionLightIntensity = Math.max(this.explosionLightIntensity, profile.lightIntensity);
    this.spawnBurst(safeOrigin, profile.burstCount, 0xffffff, 2.6 * scaleMul, 0.95 * scaleMul, isKill ? 0.24 : 0.16);

    const flashSlot = this.coreFlashes.find((cf) => !cf.active) ?? this.coreFlashes[0];
    if (flashSlot) {
      flashSlot.active = true;
      flashSlot.age = 0;
      flashSlot.life = isBoss ? 0.44 : isKill ? 0.34 : 0.22;
      flashSlot.coreScale = profile.coreScale * 0.78;
      flashSlot.coreMesh.position.copy(safeOrigin);
      flashSlot.haloMesh.position.copy(safeOrigin);
      flashSlot.sigilMesh.position.copy(safeOrigin);
      flashSlot.haloMat.color.setHex(isBoss ? 0xa855f7 : isKill ? 0x38f8e2 : 0x7ef7ff);
      flashSlot.sigilMat.color.setHex(isBoss ? 0xf6d4ff : 0xdffcff);
      flashSlot.coreMat.opacity = 0.96;
      flashSlot.haloMat.opacity = 0.52;
      flashSlot.sigilMat.opacity = isKill ? 0.78 : 0.56;
      flashSlot.coreMesh.visible = true;
      flashSlot.haloMesh.visible = true;
      flashSlot.sigilMesh.visible = true;
    }

    // 2. Dense dark billowing black smoke clouds (spread into a wide turbulent soot wreath framing the light burst)
    let smokeSpawned = 0;
    for (let i = 0; i < this.smokeCapacity && smokeSpawned < profile.smokeCount; i++) {
      const sm = this.smokePool[i];
      if (sm.active) continue;
      sm.active = true;
      const ringAng = (smokeSpawned / Math.max(1, profile.smokeCount)) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const offsetR = (0.35 + Math.random() * 0.65) * scaleMul;
      sm.pos.copy(safeOrigin).add(
        new THREE.Vector3(Math.cos(ringAng) * offsetR, (Math.random() - 0.35) * 0.8 * scaleMul, (Math.random() - 0.5) * 0.4),
      );
      const radial = (1.1 + Math.random() * 1.9) * scaleMul;
      sm.vel.set(Math.cos(ringAng) * radial, 0.8 + Math.random() * 1.8 * scaleMul, Math.sin(ringAng) * radial * 0.32);
      sm.age = 0;
      sm.life = (isKill ? 1.35 : 0.75) * (0.8 + Math.random() * 0.45);
      sm.startSize = (0.85 + Math.random() * 0.45) * scaleMul;
      sm.endSize = (2.15 + Math.random() * 0.95) * scaleMul;
      sm.color.setHex(SMOKE_HEX[smokeSpawned % SMOKE_HEX.length]);
      smokeSpawned += 1;
    }

    // 3. Swirling charred ash + glowing mystical embers bursting out past smoke
    let ashSpawned = 0;
    for (let i = 0; i < this.ashCapacity && ashSpawned < profile.ashCount; i++) {
      const a = this.ashPool[i];
      if (a.active) continue;
      a.active = true;
      a.pos.copy(safeOrigin).add(
        new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.4) * 0.65, (Math.random() - 0.5) * 0.3),
      );
      const theta = Math.random() * Math.PI * 2;
      const spd = (1.9 + Math.random() * 3.1) * scaleMul;
      a.vel.set(Math.cos(theta) * spd, 1.1 + Math.random() * 2.5 * scaleMul, Math.sin(theta) * spd * 0.38);
      a.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      a.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      a.age = 0;
      a.life = (isKill ? 1.55 : 0.88) * (0.75 + Math.random() * 0.5);
      a.size = (0.95 + Math.random() * 0.95) * (isBoss ? 1.2 : 1.0);
      a.color.setHex(ASH_HEX[ashSpawned % ASH_HEX.length]);
      ashSpawned += 1;
    }

    // 4. High-velocity scattering energy shard streaks flying boldly beyond smoke clouds
    let shardSpawned = 0;
    for (let i = 0; i < this.shardCapacity && shardSpawned < profile.shardCount; i++) {
      const sh = this.shardPool[i];
      if (sh.active) continue;
      sh.active = true;
      sh.pos.copy(safeOrigin);
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.25) * Math.PI * 0.82;
      const spd = (4.6 + Math.random() * 4.8) * scaleMul;
      sh.vel.set(
        Math.cos(theta) * Math.cos(phi) * spd,
        Math.sin(phi) * spd + 1.8,
        Math.min(1.5, Math.sin(theta) * Math.cos(phi) * spd * 0.4),
      );
      sh.age = 0;
      sh.life = (isKill ? 0.72 : 0.42) * (0.7 + Math.random() * 0.5);
      sh.size = (0.85 + Math.random() * 0.9) * scaleMul;
      sh.color.setHex(SHARD_HEX[shardSpawned % SHARD_HEX.length]);
      shardSpawned += 1;
    }

    // 5. Spiraling mystical soul wisps ascending in a wide spectral vortex
    let wispSpawned = 0;
    for (let i = 0; i < this.wispCapacity && wispSpawned < profile.wispCount; i++) {
      const w = this.wispPool[i];
      if (w.active) continue;
      w.active = true;
      w.center.copy(safeOrigin);
      w.angle = (wispSpawned / Math.max(1, profile.wispCount)) * Math.PI * 2 + Math.random() * 0.5;
      w.angularSpeed = (wispSpawned % 2 === 0 ? 1 : -1) * (4.2 + Math.random() * 3.6);
      w.radius = 0.45 + Math.random() * 0.55;
      w.radialVel = (0.85 + Math.random() * 1.1) * scaleMul;
      w.riseSpeed = (1.55 + Math.random() * 1.95) * scaleMul;
      w.yOffset = (Math.random() - 0.5) * 0.45;
      w.age = 0;
      w.life = (isKill ? 1.35 : 0.72) * (0.8 + Math.random() * 0.45);
      w.size = (0.75 + Math.random() * 0.75) * scaleMul;
      w.color.setHex(WISP_HEX[wispSpawned % WISP_HEX.length]);
      wispSpawned += 1;
    }

    // 6. Multi-angle crisp thin shockwave rings (white flash + spectral tosca + arcane violet)
    const ringColors = [0xffffff, 0x38f8e2, 0xa855f7, 0xdcfaff];
    let ringsSpawned = 0;
    for (const r of this.rings) {
      if (r.active) continue;
      r.active = true;
      r.age = -ringsSpawned * 0.04;
      r.life = (isBoss ? 0.56 : isKill ? 0.44 : 0.28) + ringsSpawned * 0.04;
      r.maxScale = (isBoss ? 3.8 : isKill ? 2.85 : 1.7) - ringsSpawned * 0.42;
      r.tiltX = ringsSpawned === 0 ? 0.12 : (Math.random() - 0.5) * 1.15;
      r.tiltY = ringsSpawned === 0 ? -0.1 : (Math.random() - 0.5) * 1.15;
      r.mesh.position.copy(safeOrigin);
      r.mesh.scale.setScalar(0.28);
      r.mat.color.setHex(ringColors[ringsSpawned % ringColors.length]);
      r.mat.opacity = isKill ? 0.72 : 0.6;
      r.mesh.visible = true;
      ringsSpawned += 1;
      if (ringsSpawned >= profile.ringCount) break;
    }
  }

  /**
   * Mystical ghost materialization VFX (efek disolusi asap & muncul dari bayangan):
   * - Dark billowing shadow-smoke shrouding the ghost's silhouette as it condenses
   * - Spiraling spectral wisps rising from ground shadow into the body
   * - Low ground shadow-portal ring pulsing gently beneath the anchor
   */
  public spawnGhostEntranceEffect(
    origin: THREE.Vector3,
    ghostType: GhostType,
    isBoss: boolean,
    worldHeight: number,
    auraColorHex: number,
  ): void {
    const profile = getGhostEntranceProfile(isBoss, ghostType);
    const scaleMul = profile.shadowBurstScale;
    const safeOrigin = origin.clone();
    safeOrigin.z = Math.min(safeOrigin.z, -2.5);

    // 1. Dark rising shadow-smoke veil
    let smokeSpawned = 0;
    for (let i = 0; i < this.smokeCapacity && smokeSpawned < profile.smokeCount; i++) {
      const sm = this.smokePool[i];
      if (sm.active) continue;
      sm.active = true;
      const ang = (smokeSpawned / Math.max(1, profile.smokeCount)) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const r = (0.28 + Math.random() * 0.55) * scaleMul;
      sm.pos.set(
        safeOrigin.x + Math.cos(ang) * r,
        Math.max(0.12, safeOrigin.y + Math.random() * worldHeight * 0.72),
        safeOrigin.z + Math.sin(ang) * r * 0.45,
      );
      sm.vel.set(-Math.cos(ang) * 0.32, 0.55 + Math.random() * 0.75, (Math.random() - 0.5) * 0.2);
      sm.age = 0;
      sm.life = (isBoss ? 1.5 : 1.05) * (0.85 + Math.random() * 0.35);
      sm.startSize = (0.8 + Math.random() * 0.45) * scaleMul;
      sm.endSize = (1.65 + Math.random() * 0.65) * scaleMul;
      sm.color.setHex(SMOKE_HEX[smokeSpawned % SMOKE_HEX.length]);
      smokeSpawned += 1;
    }

    // 2. Spiraling spectral shadow wisps rising around the emerging figure
    let wispSpawned = 0;
    for (let i = 0; i < this.wispCapacity && wispSpawned < profile.wispCount; i++) {
      const w = this.wispPool[i];
      if (w.active) continue;
      w.active = true;
      w.center.set(safeOrigin.x, Math.max(0.2, safeOrigin.y + 0.15), safeOrigin.z);
      w.angle = (wispSpawned / Math.max(1, profile.wispCount)) * Math.PI * 2;
      w.angularSpeed = (wispSpawned % 2 === 0 ? 1 : -1) * (3.2 + Math.random() * 2.4);
      w.radius = (0.85 + Math.random() * 0.45) * scaleMul;
      w.radialVel = -0.55 * scaleMul; // Coils inward onto the ghost as it materializes
      w.riseSpeed = (0.95 + Math.random() * 1.15) * (worldHeight * 0.55);
      w.yOffset = Math.random() * 0.35;
      w.age = 0;
      w.life = isBoss ? 1.35 : 0.98;
      w.size = (0.65 + Math.random() * 0.45) * scaleMul;
      w.color.setHex(wispSpawned % 3 === 0 ? 0x162229 : auraColorHex);
      wispSpawned += 1;
    }

    // 3. Drifting dark shadow-ash particles lifting off the ground
    let ashSpawned = 0;
    for (let i = 0; i < this.ashCapacity && ashSpawned < profile.ashCount; i++) {
      const a = this.ashPool[i];
      if (a.active) continue;
      a.active = true;
      a.pos.set(
        safeOrigin.x + (Math.random() - 0.5) * 1.2 * scaleMul,
        Math.max(0.1, safeOrigin.y + Math.random() * 0.55),
        safeOrigin.z + (Math.random() - 0.5) * 0.4,
      );
      a.vel.set((Math.random() - 0.5) * 0.65, 1.45 + Math.random() * 1.3, (Math.random() - 0.5) * 0.2);
      a.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      a.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      a.age = 0;
      a.life = isBoss ? 1.4 : 1.0;
      a.size = (0.75 + Math.random() * 0.55) * scaleMul;
      a.color.setHex(ashSpawned % 3 === 0 ? auraColorHex : 0x2a3038);
      ashSpawned += 1;
    }

    // 4. Ground shadow-portal ripple opening beneath the ghost
    let ringsSpawned = 0;
    for (const r of this.rings) {
      if (r.active) continue;
      r.active = true;
      r.age = -ringsSpawned * 0.08;
      r.life = isBoss ? 1.05 : 0.78;
      r.maxScale = (1.9 + ringsSpawned * 0.7) * scaleMul;
      r.tiltX = -Math.PI * 0.44;
      r.tiltY = 0;
      r.mesh.position.set(safeOrigin.x, Math.max(0.08, safeOrigin.y + 0.08), safeOrigin.z);
      r.mesh.scale.setScalar(0.24);
      r.mat.color.setHex(ringsSpawned === 0 ? auraColorHex : 0x1e3844);
      r.mat.opacity = 0.52;
      r.mesh.visible = true;
      ringsSpawned += 1;
      if (ringsSpawned >= profile.ringCount) break;
    }
  }

  public spawnPebbleThrow(fromPos: THREE.Vector3, targetPos: THREE.Vector3): void {
    let thrown = 0;
    for (const pb of this.pebbles) {
      if (pb.active) continue;
      pb.active = true;
      pb.age = 0;
      pb.life = 0.52 + thrown * 0.12;
      pb.start.copy(fromPos).add(new THREE.Vector3((thrown - 0.5) * 0.5, 1.1 + thrown * 0.25, 0.3));
      pb.end.copy(targetPos).add(new THREE.Vector3((thrown - 0.5) * 0.75, -0.35 + thrown * 0.15, -0.8));
      pb.mesh.position.copy(pb.start);
      pb.mesh.visible = true;
      thrown += 1;
      if (thrown >= 2) break;
    }
  }

  private spawnSkyMeteor(): void {
    const m = this.meteors.find((item) => !item.active);
    if (!m) return;
    const fromLeft = Math.random() < 0.5;
    const z = -(38 + Math.random() * 14);
    const startX = fromLeft ? -(14 + Math.random() * 14) : 14 + Math.random() * 14;
    const endX = startX + (fromLeft ? 16 + Math.random() * 10 : -(16 + Math.random() * 10));
    const startY = 15.5 + Math.random() * 4.5;
    const endY = 7.5 + Math.random() * 3.5;

    m.active = true;
    m.age = 0;
    m.life = 0.85 + Math.random() * 0.5;
    m.start.set(startX, startY, z);
    m.end.set(endX, endY, z);
    m.group.position.copy(m.start);

    // Align tail opposite the velocity vector
    this._dirVec.subVectors(m.end, m.start).normalize();
    const angle = Math.atan2(this._dirVec.y, this._dirVec.x);
    m.group.rotation.set(0, 0, angle + Math.PI * 0.5);
    m.group.visible = true;
  }

  public update(
    dt: number,
    elapsed: number,
    camera: THREE.Camera,
    stormyLevel: boolean,
    onLightning?: (boltX: number) => void,
    menuBackdrop = false,
  ): { flash: number; boltX: number; weather: WeatherState; meteorActive: boolean } {
    const weather = computeWeatherState(elapsed, stormyLevel, menuBackdrop);

    // Decay explosion light bloom smoothly
    if (this.explosionLightIntensity > 0) {
      this.explosionLightIntensity = Math.max(0, this.explosionLightIntensity - dt * 22);
      this.explosionLight.intensity = this.explosionLightIntensity;
    }

    // Update tri-layer mystical core flashes, rotating spirit seals & spectral halos
    for (const cf of this.coreFlashes) {
      if (!cf.active) continue;
      cf.age += dt;
      const t = cf.age / cf.life;
      if (t >= 1) {
        cf.active = false;
        cf.coreMesh.visible = false;
        cf.haloMesh.visible = false;
        cf.sigilMesh.visible = false;
        continue;
      }
      cf.coreMesh.quaternion.copy(camera.quaternion);
      cf.haloMesh.quaternion.copy(camera.quaternion);
      cf.sigilMesh.quaternion.copy(camera.quaternion);
      cf.sigilMesh.rotateZ(cf.age * 3.4 * cf.spinDir);

      // Inner blinding flash peaks fast and implodes cleanly, spirit sigil & subtle outer halo expand outward
      const coreEnv = t < 0.14 ? t / 0.14 : Math.max(0, 1 - (t - 0.14) / 0.36);
      const haloEnv = Math.sin(Math.min(1, t) * Math.PI);
      cf.coreMesh.scale.setScalar(Math.max(0.05, cf.coreScale * (0.45 + coreEnv * 0.65)));
      cf.coreMat.opacity = Math.pow(coreEnv, 1.5);
      cf.haloMesh.scale.setScalar(cf.coreScale * (0.65 + t * 1.05));
      cf.haloMat.opacity = haloEnv * 0.42;
      cf.sigilMesh.scale.setScalar(cf.coreScale * (0.65 + (1 - Math.pow(1 - t, 2)) * 1.55));
      cf.sigilMat.opacity = Math.max(0, (1 - t) * 0.72);
    }

    // Update white glow bursts (near-camera safety fade prevents clipping camera near-plane)
    let anyBurstChanged = false;
    for (let i = 0; i < this.burstCapacity; i++) {
      const p = this.burstPool[i];
      if (!p.active) continue;
      anyBurstChanged = true;
      p.age += dt;
      if (p.age >= p.life || p.pos.z > -1.6) {
        p.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.burstMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      p.vel.y -= 1.5 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = p.age / p.life;
      const scale = p.size * (1 - t * 0.72);
      this.dummy.position.copy(p.pos);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.burstMesh.setMatrixAt(i, this.dummy.matrix);
      this.burstMesh.setColorAt(i, p.color);
    }
    if (anyBurstChanged) {
      this.burstMesh.instanceMatrix.needsUpdate = true;
      if (this.burstMesh.instanceColor) this.burstMesh.instanceColor.needsUpdate = true;
    }

    // Update dark billowing black smoke plumes
    let anySmokeChanged = false;
    for (let i = 0; i < this.smokeCapacity; i++) {
      const sm = this.smokePool[i];
      if (!sm.active) continue;
      anySmokeChanged = true;
      sm.age += dt;
      if (sm.age >= sm.life || sm.pos.z > -1.8) {
        sm.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      const t = sm.age / sm.life;
      sm.vel.multiplyScalar(Math.max(0, 1 - dt * 1.6));
      sm.vel.y += 0.5 * dt;
      sm.pos.addScaledVector(sm.vel, dt);
      sm.pos.x += Math.sin(elapsed * 2.8 + i) * 0.25 * dt;
      const easeOut = 1 - Math.pow(1 - t, 2);
      const fadeEnvelope = t < 0.16 ? t / 0.16 : Math.max(0, 1 - (t - 0.16) / 0.84);
      const size = THREE.MathUtils.lerp(sm.startSize, sm.endSize, easeOut) * Math.max(0.18, fadeEnvelope * 1.05);
      this.dummy.position.copy(sm.pos);
      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.scale.setScalar(size);
      this.dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, this.dummy.matrix);
      this.smokeMesh.setColorAt(i, sm.color);
    }
    if (anySmokeChanged) {
      this.smokeMesh.instanceMatrix.needsUpdate = true;
      if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    }

    // Update tumbling ash & ember flakes
    let anyAshChanged = false;
    for (let i = 0; i < this.ashCapacity; i++) {
      const a = this.ashPool[i];
      if (!a.active) continue;
      anyAshChanged = true;
      a.age += dt;
      if (a.age >= a.life || a.pos.z > -1.6) {
        a.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.ashMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      const t = a.age / a.life;
      a.vel.x *= Math.max(0, 1 - dt * 2.0);
      a.vel.z *= Math.max(0, 1 - dt * 2.6);
      a.vel.y -= 1.25 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.pos.x += Math.sin(elapsed * 4.5 + i) * 0.42 * dt;
      a.rot.x += a.spin.x * dt;
      a.rot.y += a.spin.y * dt;
      a.rot.z += a.spin.z * dt;
      this.dummy.position.copy(a.pos);
      this.dummy.rotation.copy(a.rot);
      this.dummy.scale.setScalar(a.size * (1 - t * 0.72));
      this.dummy.updateMatrix();
      this.ashMesh.setMatrixAt(i, this.dummy.matrix);
      this.ashMesh.setColorAt(i, a.color);
    }
    if (anyAshChanged) {
      this.ashMesh.instanceMatrix.needsUpdate = true;
      if (this.ashMesh.instanceColor) this.ashMesh.instanceColor.needsUpdate = true;
    }

    // Update scattering energy shards (rapid drag + near-camera clip guard)
    let anyShardChanged = false;
    for (let i = 0; i < this.shardCapacity; i++) {
      const sh = this.shardPool[i];
      if (!sh.active) continue;
      anyShardChanged = true;
      sh.age += dt;
      if (sh.age >= sh.life || sh.pos.z > -1.7) {
        sh.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.shardMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      sh.vel.multiplyScalar(Math.max(0, 1 - dt * 2.4));
      sh.vel.y -= 3.6 * dt;
      sh.pos.addScaledVector(sh.vel, dt);
      const t = sh.age / sh.life;
      this._dirVec.copy(sh.vel).normalize();
      this.dummy.position.copy(sh.pos);
      this.dummy.quaternion.setFromUnitVectors(this._upVec, this._dirVec);
      this.dummy.scale.set(sh.size * (1 - t * 0.65), sh.size * (1.25 - t * 0.7), sh.size);
      this.dummy.updateMatrix();
      this.shardMesh.setMatrixAt(i, this.dummy.matrix);
      this.shardMesh.setColorAt(i, sh.color);
    }
    if (anyShardChanged) {
      this.shardMesh.instanceMatrix.needsUpdate = true;
      if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;
    }

    // Update spiraling mystical soul wisps
    let anyWispChanged = false;
    for (let i = 0; i < this.wispCapacity; i++) {
      const w = this.wispPool[i];
      if (!w.active) continue;
      anyWispChanged = true;
      w.age += dt;
      if (w.age >= w.life) {
        w.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.wispMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      const t = w.age / w.life;
      w.angle += w.angularSpeed * dt;
      w.radius += w.radialVel * dt * (1 - t * 0.7);
      w.yOffset += w.riseSpeed * dt;
      const wx = w.center.x + Math.cos(w.angle) * w.radius;
      const wy = w.center.y + w.yOffset;
      const wz = w.center.z + Math.sin(w.angle) * w.radius * 0.75;
      if (wz > -1.8) {
        w.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.wispMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      this.dummy.position.set(wx, wy, wz);
      this.dummy.quaternion.copy(camera.quaternion);
      const pulse = Math.sin(Math.min(1, t) * Math.PI);
      this.dummy.scale.setScalar(w.size * (0.4 + pulse * 0.9));
      this.dummy.updateMatrix();
      this.wispMesh.setMatrixAt(i, this.dummy.matrix);
      this.wispMesh.setColorAt(i, w.color);
    }
    if (anyWispChanged) {
      this.wispMesh.instanceMatrix.needsUpdate = true;
      if (this.wispMesh.instanceColor) this.wispMesh.instanceColor.needsUpdate = true;
    }

    // Update multi-angle mystical shockwave rings
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      if (r.age < 0) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.visible = true;
      const t = r.age / r.life;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.quaternion.copy(camera.quaternion);
      if (r.tiltX !== 0 || r.tiltY !== 0) {
        r.mesh.rotateX(r.tiltX);
        r.mesh.rotateY(r.tiltY);
      }
      const eased = 1 - Math.pow(1 - t, 2.2);
      r.mesh.scale.setScalar(0.32 + eased * r.maxScale);
      r.mat.opacity = (1 - t) * 0.72;
    }

    // Update Genderuwo thrown pebbles
    for (const pb of this.pebbles) {
      if (!pb.active) continue;
      pb.age += dt;
      const t = pb.age / pb.life;
      if (t >= 1) {
        pb.active = false;
        pb.mesh.visible = false;
        continue;
      }
      pb.mesh.position.lerpVectors(pb.start, pb.end, t);
      pb.mesh.position.y += Math.sin(t * Math.PI) * 1.15;
      pb.mesh.rotation.x += dt * 12;
      pb.mesh.rotation.y += dt * 9;
    }

    // Update saturated, softly glowing floating light motes
    for (let i = 0; i < this.fireflyCount; i++) {
      const f = this.fireflies[i];
      const t = elapsed * f.speed + f.phase;
      this.dummy.position.set(
        f.baseX + Math.sin(t * 0.9) * 0.9,
        f.baseY + Math.sin(t * 1.4) * 0.45,
        f.baseZ + Math.cos(t * 0.8) * 0.8,
      );
      this.dummy.quaternion.copy(camera.quaternion);
      const pulse = (0.45 + 0.35 * Math.sin(t * 2.2)) * f.scaleBias;
      this.dummy.scale.setScalar(pulse);
      this.dummy.updateMatrix();
      this.fireflyMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.fireflyMesh.instanceMatrix.needsUpdate = true;

    // Update saturated, slightly transparent falling leaves
    for (let i = 0; i < this.leafCount; i++) {
      const lf = this.leaves[i];
      lf.y -= lf.fallSpeed * dt;
      if (lf.y < 0.08) {
        lf.y = 6.2 + Math.random() * 2.2;
      }
      const swayX = Math.sin(elapsed * 1.4 + lf.swayPhase) * 0.55;
      const swayZ = Math.cos(elapsed * 1.1 + lf.swayPhase) * 0.35;
      this.dummy.position.set(lf.x + swayX, lf.y, lf.z + swayZ);
      this.dummy.rotation.set(
        elapsed * lf.spinSpeed,
        lf.swayPhase + elapsed * 0.9,
        Math.sin(elapsed * 2 + lf.swayPhase) * 0.7,
      );
      this.dummy.scale.setScalar(lf.scaleBias);
      this.dummy.updateMatrix();
      this.leafMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;

    // Update thin low ground mist + slow drifting ambient mid-arena mist wisps
    this.mistMat.opacity = weather.mistOpacity;
    for (const m of this.mistPlanes) {
      const { baseX, baseZ, phase, speed } = m.userData as {
        baseX: number;
        baseZ: number;
        phase: number;
        speed: number;
      };
      m.position.x = baseX + Math.sin(elapsed * speed + phase) * 1.6;
      m.position.z = baseZ + Math.cos(elapsed * speed * 0.7 + phase) * 0.6;
    }
    this.ambientMistMat.opacity = weather.ambientMistOpacity;
    for (const m of this.ambientMistPlanes) {
      const { baseX, baseZ, phase, speed } = m.userData as {
        baseX: number;
        baseZ: number;
        phase: number;
        speed: number;
      };
      m.position.x = baseX + Math.sin(elapsed * speed + phase) * 2.5;
      m.position.z = baseZ + Math.cos(elapsed * speed * 0.8 + phase) * 0.9;
    }

    // Update short, randomly scattered drizzle droplets
    const rainActive = weather.drizzleIntensity > 0.03;
    this.rainMesh.visible = rainActive;
    if (rainActive) {
      this.rainMat.opacity = weather.drizzleIntensity * (menuBackdrop ? 0.56 : 0.44);
      const slant = weather.windSway;
      for (let i = 0; i < this.rainCount; i++) {
        const d = this.rainDrops[i];
        d.y -= d.speed * dt;
        d.x += (slant + d.slantJitter) * d.speed * dt;
        if (d.y < 0.05) {
          const p = randomRainScatter();
          d.y = 7.4 + Math.random() * 2.6;
          d.x = p.x;
          d.z = p.z;
          d.len = 0.55 + Math.random() * 0.85;
          d.speed = 6.8 + Math.random() * 5.6;
        }
        this.dummy.position.set(d.x, d.y, d.z);
        this.dummy.quaternion.copy(camera.quaternion);
        this.dummy.rotateZ(-(slant + d.slantJitter) * 0.85);
        this.dummy.scale.set(d.widthScale, d.len, 1);
        this.dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;

      this.splashTimer -= dt * (0.5 + weather.drizzleIntensity * 1.5);
      if (this.splashTimer <= 0) {
        this.splashTimer = 0.07;
        const sp = this.rainSplashes.find((s) => !s.active);
        if (sp) {
          const ang = -Math.PI * 0.45 + Math.random() * Math.PI * 0.9;
          const dist = 3.2 + Math.random() * 10.5;
          sp.active = true;
          sp.age = 0;
          sp.mesh.position.set(Math.sin(ang) * dist, 0.03, -Math.cos(ang) * dist);
          sp.mesh.scale.setScalar(0.35);
          sp.mat.opacity = 0.35 * weather.drizzleIntensity;
          sp.mesh.visible = true;
        }
      }
    }

    for (const sp of this.rainSplashes) {
      if (!sp.active) continue;
      sp.age += dt;
      const t = sp.age / sp.life;
      if (t >= 1) {
        sp.active = false;
        sp.mesh.visible = false;
        continue;
      }
      sp.mesh.scale.setScalar(0.35 + t * 1.75);
      sp.mat.opacity = (1 - t) * 0.34 * Math.max(0.25, weather.drizzleIntensity);
    }

    // Natural temporary lightning strike + double-flicker envelope synchronized with thunder audio
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = computeLightningCooldownSec(stormyLevel, menuBackdrop);
      this.lightningAge = 0;
      this.lastBoltX = menuBackdrop ? 0.5 + Math.random() * 11.5 : -11 + Math.random() * 22;
      this.regenerateBoltGeometry(this.lastBoltX);
      this.lightningBolts.visible = true;
      this.lightningGlowMesh.visible = true;
      onLightning?.(this.lastBoltX);
    }

    if (this.lightningAge < 0.72) {
      this.lightningAge += dt;
      this.lightningFlash = computeLightningEnvelope(this.lightningAge);
      this.lightningBoltMat.opacity = Math.min(1, this.lightningFlash * 1.25);
      this.lightningGlowMat.opacity = Math.min(0.68, this.lightningFlash * 0.62);
    } else {
      this.lightningFlash = 0;
      this.lightningBolts.visible = false;
      this.lightningGlowMesh.visible = false;
    }

    // Rare falling meteors (bintang berekor) across the night sky
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.meteorTimer = computeMeteorCooldownSec();
      this.spawnSkyMeteor();
    }

    let meteorActive = false;
    for (const m of this.meteors) {
      if (!m.active) continue;
      m.age += dt;
      const t = m.age / m.life;
      if (t >= 1) {
        m.active = false;
        m.group.visible = false;
        continue;
      }
      meteorActive = true;
      m.group.position.lerpVectors(m.start, m.end, t);
      const fade = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / 0.82);
      m.headMat.opacity = fade * 0.95;
      m.tailMat.opacity = fade * 0.75;
      const tailStretch = 0.55 + Math.sin(t * Math.PI) * 0.75;
      m.group.scale.set(1, tailStretch, 1);
    }

    return {
      flash: this.lightningFlash,
      boltX: this.lastBoltX,
      weather,
      meteorActive,
    };
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
