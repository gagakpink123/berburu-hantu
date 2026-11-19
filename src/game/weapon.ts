import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';

interface LaserBeam {
  group: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
  auraMat: THREE.MeshBasicMaterial;
  active: boolean;
  start: THREE.Vector3;
  end: THREE.Vector3;
  dir: THREE.Vector3;
  totalDist: number;
  progress: number;
  duration: number;
}

export class ToyBlaster {
  public readonly group = new THREE.Group();
  private readonly weaponPivot = new THREE.Group();
  private readonly muzzleAnchor = new THREE.Object3D();
  private readonly muzzleFlash: THREE.Mesh;
  private readonly barrelCoreMat: THREE.MeshStandardMaterial;

  private recoilOffset = 0;
  private recoilRot = 0;
  private flashTimer = 0;
  private reloadTimer = 0;
  private swayX = 0;
  private swayY = 0;
  private aimNdcX = 0;
  private aimNdcY = 0;
  private idleTime = 0;

  private readonly beams: LaserBeam[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor(scene: THREE.Scene, textures: ProceduralTextureSet) {
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      this.materials.push(m);
      return m;
    };

    // Stylized Mystical-Arcade Laser Blaster materials
    const darkChassis = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1b232c, roughness: 0.48, metalness: 0.32 }),
    );
    const orangeAccent = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xff6b2b, roughness: 0.3, metalness: 0.18 }),
    );
    const tealShroud = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x109cb0, roughness: 0.28, metalness: 0.25 }),
    );
    const brassTrim = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe6b445, roughness: 0.32, metalness: 0.45 }),
    );
    this.barrelCoreMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x62fff5,
        emissive: 0x1ae8ff,
        emissiveIntensity: 2.0,
        roughness: 0.18,
      }),
    );

    // 1. Sleek tapered dark receiver body
    const receiver = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.088, 0.082, 0.34)), darkChassis);
    receiver.position.set(0, 0, 0.02);
    this.weaponPivot.add(receiver);

    // 2. Sculpted orange side armor plates
    const sideArmor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.052, 0.22)), orangeAccent);
    sideArmor.position.set(0, 0.01, -0.02);
    this.weaponPivot.add(sideArmor);

    // 3. Ergonomic angled grip
    const grip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.068, 0.14, 0.08)), darkChassis);
    grip.position.set(0, -0.09, 0.11);
    grip.rotation.x = 0.28;
    this.weaponPivot.add(grip);

    // 4. Tapered teal barrel shroud
    const shroud = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.072, 0.068, 0.28)), tealShroud);
    shroud.position.set(0, 0.024, -0.22);
    this.weaponPivot.add(shroud);

    // 5. Inner glowing laser accelerator barrel
    const innerBarrel = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.02, 0.024, 0.36, 12)),
      this.barrelCoreMat,
    );
    innerBarrel.rotation.x = Math.PI / 2;
    innerBarrel.position.set(0, 0.032, -0.25);
    this.weaponPivot.add(innerBarrel);

    // 6. Raised brass laser-sight spine & glowing prism crystal
    const topRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.028, 0.024, 0.24)), brassTrim);
    topRail.position.set(0, 0.066, -0.06);
    this.weaponPivot.add(topRail);

    const crystal = new THREE.Mesh(trackGeo(new THREE.OctahedronGeometry(0.024, 0)), this.barrelCoreMat);
    crystal.scale.set(0.75, 0.75, 1.5);
    crystal.position.set(0, 0.078, -0.18);
    this.weaponPivot.add(crystal);

    // 7. Barrel cooling fin rings + beveled octagonal muzzle emitter collar
    for (let f = 0; f < 3; f++) {
      const fin = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 8)), brassTrim);
      fin.rotation.x = Math.PI / 2;
      fin.position.set(0, 0.032, -0.31 - f * 0.032);
      this.weaponPivot.add(fin);
    }

    const muzzleCollar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.034, 0.032, 8)), tealShroud);
    muzzleCollar.rotation.x = Math.PI / 2;
    muzzleCollar.position.set(0, 0.032, -0.39);
    this.weaponPivot.add(muzzleCollar);

    const frontSight = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.032, 0.007, 8, 16)), brassTrim);
    frontSight.position.set(0, 0.032, -0.408);
    this.weaponPivot.add(frontSight);

    // 8. Twin compact side laser capacitors
    for (const sx of [-0.052, 0.052]) {
      const canister = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 10)),
        this.barrelCoreMat,
      );
      canister.rotation.x = Math.PI / 2;
      canister.position.set(sx, 0.015, -0.08);
      this.weaponPivot.add(canister);
    }

    // 9. Rear glowing energy meter cap
    const rearCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.034, 0.038, 0.035, 10)), tealShroud);
    rearCap.rotation.x = Math.PI / 2;
    rearCap.position.set(0, 0.02, 0.19);
    this.weaponPivot.add(rearCap);

    // Muzzle anchor & additive flash
    this.muzzleAnchor.position.set(0, 0.032, -0.43);
    this.weaponPivot.add(this.muzzleAnchor);

    const flashMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.softGlow,
        color: 0x62fff5,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.muzzleFlash = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.42, 0.42)), flashMat);
    this.muzzleFlash.position.set(0, 0.032, -0.45);
    this.weaponPivot.add(this.muzzleFlash);

    this.group.add(this.weaponPivot);
    // CENTERED bottom-center position with sleek natural slight elevation
    this.group.position.set(0, -0.34, -0.55);
    this.group.rotation.set(0.13, 0, 0);
    this.group.scale.setScalar(0.74);

    // Pre-allocated Laser Beam bolt pool in world scene
    const coreGeo = trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8));
    coreGeo.rotateX(Math.PI / 2); // align along +Z
    const auraGeo = trackGeo(new THREE.CylinderGeometry(0.095, 0.095, 1.0, 10));
    auraGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < 8; i++) {
      const boltGroup = new THREE.Group();
      const coreMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.98,
        }),
      );
      const auraMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x32f6ff,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const core = new THREE.Mesh(coreGeo, coreMat);
      const aura = new THREE.Mesh(auraGeo, auraMat);
      boltGroup.add(core);
      boltGroup.add(aura);
      boltGroup.visible = false;
      scene.add(boltGroup);
      this.beams.push({
        group: boltGroup,
        coreMat,
        auraMat,
        active: false,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        totalDist: 1,
        progress: 0,
        duration: 0.14,
      });
    }
  }

  public addCameraSway(dx: number, dy: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.055, -0.04, 0.04);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.055, -0.03, 0.03);
  }

  public setAimNdc(nx: number, ny: number): void {
    this.aimNdcX = THREE.MathUtils.clamp(nx, -1, 1);
    this.aimNdcY = THREE.MathUtils.clamp(ny, -1, 1);
  }

  public triggerShoot(targetWorldPoint: THREE.Vector3): void {
    this.recoilOffset = 0.09;
    this.recoilRot = 0.22;
    this.flashTimer = 0.11;
    this.barrelCoreMat.emissiveIntensity = 4.2;

    const beam = this.beams.find((b) => !b.active) ?? this.beams[0];
    this.muzzleAnchor.getWorldPosition(beam.start);
    beam.end.copy(targetWorldPoint);
    beam.dir.subVectors(beam.end, beam.start);
    beam.totalDist = Math.max(0.5, beam.dir.length());
    beam.dir.normalize();
    beam.progress = 0;
    beam.duration = Math.min(0.16, Math.max(0.085, beam.totalDist * 0.008));
    beam.active = true;

    beam.group.position.copy(beam.start);
    beam.group.lookAt(beam.end);
    beam.group.scale.set(1, 1, Math.min(4.2, beam.totalDist * 0.55));
    beam.coreMat.opacity = 1;
    beam.auraMat.opacity = 0.85;
    beam.group.visible = true;
  }

  public triggerReload(): void {
    this.reloadTimer = 0.72;
  }

  public update(dt: number, isPlaying: boolean): void {
    this.idleTime += dt;

    this.swayX = THREE.MathUtils.damp(this.swayX, 0, 10, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, 0, 10, dt);
    this.recoilOffset = THREE.MathUtils.damp(this.recoilOffset, 0, 18, dt);
    this.recoilRot = THREE.MathUtils.damp(this.recoilRot, 0, 16, dt);
    this.barrelCoreMat.emissiveIntensity = THREE.MathUtils.damp(
      this.barrelCoreMat.emissiveIntensity,
      1.5,
      12,
      dt,
    );

    const idleBobX = isPlaying ? Math.cos(this.idleTime * 2.1) * 0.004 : 0;
    const idleBobY = isPlaying ? Math.sin(this.idleTime * 4.2) * 0.005 : 0;

    let reloadSpin = 0;
    let reloadDrop = 0;
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      const t = 1 - this.reloadTimer / 0.72;
      reloadSpin = Math.sin(t * Math.PI) * 1.15;
      reloadDrop = -Math.sin(t * Math.PI) * 0.09;
    }

    // Center blaster tilts subtly toward cursor/crosshair aim!
    const aimYaw = -this.aimNdcX * 0.24;
    const aimPitch = this.aimNdcY * 0.16;

    this.weaponPivot.position.set(
      this.swayX + idleBobX,
      this.swayY + idleBobY + reloadDrop,
      this.recoilOffset,
    );
    this.weaponPivot.rotation.set(
      this.recoilRot + aimPitch - reloadSpin * 0.45,
      aimYaw - this.swayX * 0.35,
      reloadSpin,
    );

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      const ratio = this.flashTimer / 0.11;
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = ratio * 0.98;
      this.muzzleFlash.scale.setScalar(0.85 + (1 - ratio) * 0.85);
      this.muzzleFlash.rotation.z += dt * 22;
    } else {
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // Update flying laser beam streaks
    for (const b of this.beams) {
      if (!b.active) continue;
      b.progress += dt / b.duration;
      if (b.progress >= 1) {
        b.active = false;
        b.group.visible = false;
      } else {
        b.group.position.lerpVectors(b.start, b.end, b.progress);
        const fade = 1 - b.progress * 0.45;
        b.coreMat.opacity = fade;
        b.auraMat.opacity = fade * 0.8;
      }
    }
  }

  public dispose(): void {
    this.beams.forEach((b) => b.group.parent?.remove(b.group));
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
