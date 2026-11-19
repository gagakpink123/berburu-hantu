import * as THREE from 'three';
import { computeLightningEnvelope, computeWeatherState, type WeatherState } from './rules';
import type { ProceduralTextureSet } from './textures';

interface BurstParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  life: number;
  maxScale: number;
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
}

interface FallingLeaf {
  x: number;
  y: number;
  z: number;
  fallSpeed: number;
  swayPhase: number;
  spinSpeed: number;
}

interface RainDrop {
  x: number;
  y: number;
  z: number;
  speed: number;
  len: number;
}

interface RainSplash {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  active: boolean;
}

const RAINBOW_HEX = [
  0xff3355, // Merah menyala
  0xff8c24, // Oranye
  0xffe438, // Kuning emas
  0x39ff7a, // Hijau mistis
  0x2af5ff, // Biru cyan
  0x8a5cff, // Nila / Indigo
  0xff52e5, // Magenta berpendar
];

export class EffectsManager {
  public readonly group = new THREE.Group();
  private readonly burstCapacity = 110;
  private readonly burstPool: BurstParticle[] = [];
  private readonly burstMesh: THREE.InstancedMesh;

  private readonly rings: ShockwaveRing[] = [];
  private readonly pebbles: ThrownPebble[] = [];

  private readonly fireflyCount = 22;
  private readonly fireflies: Firefly[] = [];
  private readonly fireflyMesh: THREE.InstancedMesh;

  private readonly leafCount = 18;
  private readonly leaves: FallingLeaf[] = [];
  private readonly leafMesh: THREE.InstancedMesh;

  private readonly rainCount = 140;
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
  private lightningTimer = 2.4;
  private lightningAge = 99;
  private lightningFlash = 0;
  private lastBoltX = -4;

  private readonly dummy = new THREE.Object3D();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor(textures: ProceduralTextureSet) {
    // 1. Pooled InstancedMesh for impact / rainbow explosion bursts
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

    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
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

    // 1b. Expanding rainbow shockwave rings
    const ringGeo = new THREE.RingGeometry(0.45, 0.72, 28);
    this.geometries.push(ringGeo);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: RAINBOW_HEX[i % RAINBOW_HEX.length],
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, active: false, age: 0, life: 0.45, maxScale: 4.0 });
    }

    // 1c. Genderuwo thrown pebbles (kerikil)
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

    // 2. Ambient mystical fireflies / dust motes
    const ffGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const ffMat = new THREE.MeshBasicMaterial({
      map: textures.softGlow,
      color: 0xa6ffaa,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.geometries.push(ffGeo);
    this.materials.push(ffMat);

    this.fireflyMesh = new THREE.InstancedMesh(ffGeo, ffMat, this.fireflyCount);
    this.fireflyMesh.frustumCulled = false;
    for (let i = 0; i < this.fireflyCount; i++) {
      const angle = -Math.PI * 0.45 + Math.random() * Math.PI * 0.9;
      const dist = 4 + Math.random() * 14;
      this.fireflies.push({
        baseX: Math.sin(angle) * dist,
        baseY: 0.55 + Math.random() * 3.6,
        baseZ: -Math.cos(angle) * dist,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.9,
      });
    }
    this.group.add(this.fireflyMesh);

    // 2b. Gently falling nocturnal leaves
    const leafGeo = new THREE.PlaneGeometry(0.22, 0.22);
    const leafMat = new THREE.MeshBasicMaterial({
      map: textures.leafTex,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      color: 0xb7c66b,
    });
    this.geometries.push(leafGeo);
    this.materials.push(leafMat);

    this.leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, this.leafCount);
    this.leafMesh.frustumCulled = false;
    for (let i = 0; i < this.leafCount; i++) {
      const angle = -Math.PI * 0.42 + Math.random() * Math.PI * 0.84;
      const dist = 3.5 + Math.random() * 13.5;
      this.leaves.push({
        x: Math.sin(angle) * dist,
        y: 1.0 + Math.random() * 6.5,
        z: -Math.cos(angle) * dist,
        fallSpeed: 0.42 + Math.random() * 0.52,
        swayPhase: Math.random() * Math.PI * 2,
        spinSpeed: 1.5 + Math.random() * 2.5,
      });
    }
    this.group.add(this.leafMesh);

    // 3. Thin low ground-hugging mist (kabut tipis diatas tanah — ankle-height, never obscuring ghosts)
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
      const angle = -Math.PI * 0.46 + (i / 11) * Math.PI * 0.92;
      const dist = 4.0 + (i % 3) * 3.5;
      const m = new THREE.Mesh(mistGeo, this.mistMat);
      const yPos = 0.18 + (i % 3) * 0.08;
      m.position.set(Math.sin(angle) * dist, yPos, -Math.cos(angle) * dist);
      // Slight 20-deg tilt toward viewer so thin ground mist reads crisply above grass without rising over ghosts
      m.rotation.x = -Math.PI / 2 + 0.34;
      m.rotation.z = ((i % 4) - 1.5) * 0.16;
      m.userData = { baseX: m.position.x, baseZ: m.position.z, phase: i * 0.72, speed: 0.24 + (i % 3) * 0.08 };
      this.mistPlanes.push(m);
      this.group.add(m);
    }

    // 3b. Slow drifting thin ambient mid-arena mist wisps (kabut tipis bergerak pelan)
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
      const angle = -Math.PI * 0.48 + (i / 9) * Math.PI * 0.96;
      const dist = 6.2 + (i % 4) * 3.0;
      const m = new THREE.Mesh(ambMistGeo, this.ambientMistMat);
      const yPos = 0.55 + (i % 3) * 0.34;
      m.position.set(Math.sin(angle) * dist, yPos, -Math.cos(angle) * dist);
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

    // 4. Temporary natural drizzle (gerimis) + ground splash rings
    const rainGeo = new THREE.PlaneGeometry(0.032, 0.56);
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
      const ang = -Math.PI * 0.48 + Math.random() * Math.PI * 0.96;
      const dist = 2.6 + Math.random() * 16.5;
      this.rainDrops.push({
        x: Math.sin(ang) * dist,
        y: Math.random() * 8.5,
        z: -Math.cos(ang) * dist,
        speed: 9.5 + Math.random() * 4.5,
        len: 0.75 + Math.random() * 0.65,
      });
    }
    this.group.add(this.rainMesh);

    const splashGeo = new THREE.RingGeometry(0.06, 0.11, 14);
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

    // 5. Distant sky forked lightning bolt (kilatan petir)
    const boltVerts = new Float32Array(26 * 6);
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(boltVerts, 3));
    this.geometries.push(boltGeo);
    this.lightningBoltMat = new THREE.LineBasicMaterial({
      color: 0xdff6ff,
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
    this.regenerateBoltGeometry(-4);
  }

  private regenerateBoltGeometry(centerX: number): void {
    const pos = this.lightningBolts.geometry.attributes.position as THREE.BufferAttribute;
    let x = centerX;
    let y = 19.5;
    const z = -30.5;
    let segIdx = 0;

    // Main jagged trunk (14 segments)
    for (let i = 0; i < 14; i++) {
      const nx = x + (Math.random() - 0.5) * 2.2;
      const ny = y - (0.7 + Math.random() * 0.55);
      pos.setXYZ(segIdx++, x, y, z);
      pos.setXYZ(segIdx++, nx, ny, z);

      // Side branches every few segments
      if (i % 3 === 1 && segIdx + 4 < 52) {
        const bx1 = nx + (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.1);
        const by1 = ny - (0.6 + Math.random() * 0.6);
        const bx2 = bx1 + (bx1 - nx) * 0.7;
        const by2 = by1 - 0.75;
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

  public spawnRainbowExplosion(origin: THREE.Vector3, isBoss = false): void {
    const count = isBoss ? 36 : 24;
    const baseSpeed = isBoss ? 6.5 : 4.8;
    const baseSize = isBoss ? 2.1 : 1.55;
    let spawned = 0;
    for (let i = 0; i < this.burstCapacity && spawned < count; i++) {
      const p = this.burstPool[i];
      if (p.active) continue;
      p.active = true;
      p.pos.copy(origin);
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.35) * Math.PI;
      const spd = baseSpeed * (0.45 + Math.random() * 0.9);
      p.vel.set(Math.cos(theta) * Math.cos(phi) * spd, Math.sin(phi) * spd + 1.35, Math.sin(theta) * Math.cos(phi) * spd);
      p.age = 0;
      p.life = (isBoss ? 0.9 : 0.68) * (0.75 + Math.random() * 0.5);
      p.size = baseSize * (0.7 + Math.random() * 0.9);
      p.color.setHex(RAINBOW_HEX[spawned % RAINBOW_HEX.length]);
      spawned += 1;
    }

    // Spawn 2 concentric prismatic shockwave rings
    let ringsSpawned = 0;
    for (const r of this.rings) {
      if (r.active) continue;
      r.active = true;
      r.age = 0;
      r.life = isBoss ? 0.65 : 0.45;
      r.maxScale = (isBoss ? 6.2 : 4.1) - ringsSpawned * 1.1;
      r.mesh.position.copy(origin);
      r.mesh.scale.setScalar(0.35);
      r.mat.color.setHex(ringsSpawned === 0 ? 0xff4df0 : 0x38f8ff);
      r.mat.opacity = 0.95;
      r.mesh.visible = true;
      ringsSpawned += 1;
      if (ringsSpawned >= 2) break;
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

  public update(
    dt: number,
    elapsed: number,
    camera: THREE.Camera,
    stormyLevel: boolean,
    onLightning?: (boltX: number) => void,
  ): { flash: number; boltX: number; weather: WeatherState } {
    const weather = computeWeatherState(elapsed, stormyLevel);

    // Update burst particles
    let anyBurstChanged = false;
    for (let i = 0; i < this.burstCapacity; i++) {
      const p = this.burstPool[i];
      if (!p.active) continue;
      anyBurstChanged = true;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.burstMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      p.vel.y -= 2.2 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = p.age / p.life;
      const scale = p.size * (1 - t * 0.7);
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

    // Update rainbow shockwave rings
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.quaternion.copy(camera.quaternion);
      r.mesh.scale.setScalar(0.35 + t * r.maxScale);
      r.mat.opacity = (1 - t) * 0.9;
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

    // Update fireflies
    for (let i = 0; i < this.fireflyCount; i++) {
      const f = this.fireflies[i];
      const t = elapsed * f.speed + f.phase;
      this.dummy.position.set(
        f.baseX + Math.sin(t * 0.9) * 0.9,
        f.baseY + Math.sin(t * 1.4) * 0.45,
        f.baseZ + Math.cos(t * 0.8) * 0.8,
      );
      this.dummy.quaternion.copy(camera.quaternion);
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.5);
      this.dummy.scale.setScalar(pulse);
      this.dummy.updateMatrix();
      this.fireflyMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.fireflyMesh.instanceMatrix.needsUpdate = true;

    // Update falling leaves
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
      this.dummy.scale.setScalar(1);
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

    // Update temporary natural drizzle streaks (gerimis) + ground splash rings
    const rainActive = weather.drizzleIntensity > 0.03;
    this.rainMesh.visible = rainActive;
    if (rainActive) {
      this.rainMat.opacity = weather.drizzleIntensity * 0.48;
      const slant = weather.windSway;
      for (let i = 0; i < this.rainCount; i++) {
        const d = this.rainDrops[i];
        d.y -= d.speed * dt;
        d.x += slant * d.speed * dt;
        if (d.y < 0.05) {
          d.y = 7.5 + Math.random() * 2.5;
          const ang = -Math.PI * 0.48 + Math.random() * Math.PI * 0.96;
          const dist = 2.6 + Math.random() * 16.5;
          d.x = Math.sin(ang) * dist;
          d.z = -Math.cos(ang) * dist;
        }
        this.dummy.position.set(d.x, d.y, d.z);
        this.dummy.quaternion.copy(camera.quaternion);
        this.dummy.rotateZ(-slant * 0.85);
        this.dummy.scale.set(1, d.len, 1);
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
      const baseCooldown = stormyLevel ? 5.2 + Math.random() * 5.8 : 8.5 + Math.random() * 7.5;
      this.lightningTimer = baseCooldown;
      this.lightningAge = 0;
      this.lastBoltX = -11 + Math.random() * 22;
      this.regenerateBoltGeometry(this.lastBoltX);
      this.lightningBolts.visible = true;
      onLightning?.(this.lastBoltX);
    }

    if (this.lightningAge < 0.72) {
      this.lightningAge += dt;
      this.lightningFlash = computeLightningEnvelope(this.lightningAge);
      this.lightningBoltMat.opacity = Math.min(1, this.lightningFlash * 1.18);
    } else {
      this.lightningFlash = 0;
      this.lightningBolts.visible = false;
    }

    return {
      flash: this.lightningFlash,
      boltX: this.lastBoltX,
      weather,
    };
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

