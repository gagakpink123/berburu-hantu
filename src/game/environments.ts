import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';
import type { LevelConfig, PropAnchorType, SpawnPattern } from './types';

export interface SpawnAnchor {
  id: string;
  propType: PropAnchorType;
  anchorPos: THREE.Vector3;
  peekOffset: THREE.Vector3;
  baseAngle: number; // angle around camera in XZ plane (-1.08 .. +1.08 inside 135° arena)
  distance: number;
  allowedPatterns: SpawnPattern[];
}

export interface FlyingCrow {
  obj: THREE.Group;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  height: number;
  speed: number;
  phase: number;
}

export interface PerchedCrow {
  body: THREE.Group;
  head: THREE.Mesh;
  phase: number;
}

export interface GroundCrawler {
  segments: THREE.Mesh[];
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  phase: number;
}

export interface BuiltEnvironment {
  group: THREE.Group;
  spawnAnchors: SpawnAnchor[];
  flickerLights: Array<{ light: THREE.PointLight; baseIntensity: number; phase: number; flameMesh?: THREE.Mesh }>;
  swayingObjects: Array<{ obj: THREE.Object3D; baseRotZ: number; phase: number; amp: number }>;
  cloudLayers: Array<{ obj: THREE.Object3D; baseX: number; speed: number; range: number; baseOpacity: number }>;
  flyingCrows: FlyingCrow[];
  perchedCrows: PerchedCrow[];
  crawlers: GroundCrawler[];
  moonMesh: THREE.Group;
  starField: THREE.Points;
  dispose: () => void;
}

export function buildLevelEnvironment(
  level: LevelConfig,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): BuiltEnvironment {
  const group = new THREE.Group();
  const spawnAnchors: SpawnAnchor[] = [];
  const flickerLights: BuiltEnvironment['flickerLights'] = [];
  const swayingObjects: BuiltEnvironment['swayingObjects'] = [];
  const cloudLayers: BuiltEnvironment['cloudLayers'] = [];
  const flyingCrows: FlyingCrow[] = [];
  const perchedCrows: PerchedCrow[] = [];
  const crawlers: GroundCrawler[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Shared materials calibrated for PBR depth, metallic/roughness contrast, and micro-relief
  const stoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc2cbd4,
      map: textures.stoneCarving,
      roughness: 0.88,
      metalness: 0.05,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.048,
    }),
  );
  const darkStoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2c3338,
      roughness: 0.92,
      metalness: 0.05,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.055,
    }),
  );
  const mossMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x223d27,
      roughness: 0.95,
      metalness: 0.02,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.035,
    }),
  );
  const barkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.barkColor,
      roughness: 0.92,
      metalness: 0.03,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.05,
    }),
  );
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.woodColor,
      roughness: 0.72,
      metalness: 0.06,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.025,
    }),
  );
  const shingleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.roofShingle,
      roughness: 0.82,
      metalness: 0.04,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.035,
    }),
  );
  const ironMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x262c33,
      roughness: 0.36,
      metalness: 0.78,
    }),
  );
  const copperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x87562f,
      roughness: 0.32,
      metalness: 0.72,
    }),
  );
  const isJungleGreen = level.id === 4 || level.id === 5 || level.id === 6;
  const foliageDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: level.id === 10 ? 0x1e1817 : level.id === 9 ? 0x20192b : isJungleGreen ? 0x173626 : 0x1f4028,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  const foliageMidMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: level.id === 10 ? 0x2b201d : level.id === 9 ? 0x2b213a : isJungleGreen ? 0x214c34 : 0x2d5a36,
      roughness: 0.82,
      metalness: 0.02,
    }),
  );
  const bananaStemMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4c6834,
      roughness: 0.74,
      metalness: 0.03,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.02,
    }),
  );
  const bananaLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.bananaLeafTex,
      color: level.id >= 9 ? 0x706980 : level.id >= 4 ? 0x73a876 : 0x95cf84,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      roughness: 0.58,
      metalness: 0.02,
    }),
  );
  const bambooMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x737945,
      roughness: 0.55,
      metalness: 0.08,
    }),
  );
  const rattanMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2e2014,
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  const brickMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9b5ad,
      map: textures.brickWall,
      roughness: 0.9,
      metalness: 0.04,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.055,
    }),
  );
  const rustedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb8a399,
      map: textures.rustedIron,
      roughness: 0.62,
      metalness: 0.52,
      bumpMap: textures.bumpNoise,
      bumpScale: 0.04,
    }),
  );
  const magmaMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff7b2e,
      map: textures.lavaGlow,
      emissive: 0xff4208,
      emissiveMap: textures.lavaGlow,
      emissiveIntensity: 1.85,
      roughness: 0.4,
      metalness: 0.05,
    }),
  );
  const lanternThemeHex =
    level.id === 6
      ? 0x4af2ff
      : level.id === 7
        ? 0xff7b29
        : level.id === 8
          ? 0x6ea8ff
          : level.id === 9
            ? 0xb95cff
            : level.id === 10
              ? 0xff4e1f
              : level.id >= 4
                ? 0x2bff88
                : 0xff8c24;
  const lanternGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffd07a,
      emissive: lanternThemeHex,
      emissiveIntensity: 2.35,
      roughness: 0.25,
    }),
  );
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    }),
  );
  const crowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x15181f,
      roughness: 0.5,
      metalness: 0.18,
    }),
  );
  const crawlerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: level.id === 10 ? 0x3b241d : 0x294626,
      roughness: 0.42,
      metalness: 0.2,
    }),
  );

  // Ground plane calibrated per location (swamp water for L6, canyon chasm for L8, stone/basalt/moss for others)
  if (level.id === 6) {
    const waterGeo = trackGeo(new THREE.PlaneGeometry(140, 140, 1, 1));
    const waterMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x071a20,
        roughness: 0.14,
        metalness: 0.42,
        bumpMap: textures.bumpNoise,
        bumpScale: 0.015,
      }),
    );
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    group.add(water);

    // Foreground muddy landing bank beneath player feet
    const shoreGeo = trackGeo(new THREE.CylinderGeometry(6.8, 7.8, 0.36, 16));
    const shore = new THREE.Mesh(shoreGeo, mossMat);
    shore.position.set(0, -0.08, 1.2);
    shore.scale.set(1.6, 1, 0.72);
    group.add(shore);
  } else if (level.id === 8) {
    // Deep misty canyon floor far below + solid foreground cliff ledge + distant cliff plateau
    const abyssGeo = trackGeo(new THREE.PlaneGeometry(160, 160, 1, 1));
    const abyssMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x080c17,
        roughness: 0.94,
        metalness: 0.04,
      }),
    );
    const abyss = new THREE.Mesh(abyssGeo, abyssMat);
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = -9.5;
    group.add(abyss);

    const nearCliff = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(28, 10, 11.5)), darkStoneMat);
    nearCliff.position.set(0, -5.0, 0.2);
    group.add(nearCliff);

    const farCliff = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(34, 10, 22)), darkStoneMat);
    farCliff.position.set(0, -5.0, -24.5);
    group.add(farCliff);
  } else {
    const groundGeo = trackGeo(new THREE.PlaneGeometry(140, 140, 1, 1));
    const useStoneGround =
      level.id === 1 || level.id === 5 || level.id === 7 || level.id === 9 || level.id === 10;
    const groundTint =
      level.id === 10
        ? 0x453533
        : level.id === 9
          ? 0x5c5368
          : level.id === 7
            ? 0x5d564f
            : level.id >= 4
              ? 0x67756d
              : 0x68727c;
    const groundMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: groundTint,
        map: useStoneGround ? textures.groundStone : textures.groundMoss,
        bumpMap: textures.bumpNoise,
        bumpScale: 0.05,
        roughness: 0.88,
        metalness: 0.04,
      }),
    );
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
  }

  // Winding stepping-stone path (skip over water/chasm on L6/L8)
  if (level.id !== 6 && level.id !== 8) {
    const paverGeo = trackGeo(new THREE.CylinderGeometry(0.42, 0.52, 0.06, 7));
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const dist = 2.6 + t * 9.8;
      const curveX = Math.sin(t * Math.PI * 1.4) * 2.1 + (i % 2 === 0 ? -0.25 : 0.25);
      const paver = new THREE.Mesh(paverGeo, i % 3 === 0 ? stoneMat : i % 2 === 0 ? darkStoneMat : mossMat);
      paver.position.set(curveX, 0.025, -dist);
      paver.rotation.y = i * 0.85;
      paver.scale.set(0.85 + (i % 3) * 0.28, 1, 0.72 + (i % 2) * 0.34);
      group.add(paver);
    }
  }

  // Sculpted 3D Grass & Fern Tufts (keep confined to solid ground on L6 & L8, sparse on volcanic L10)
  const grassCount = level.id === 10 ? 48 : level.id === 6 || level.id === 8 ? 52 : 132;
  const grassGeo = trackGeo(new THREE.ConeGeometry(0.032, 0.22, 4));
  grassGeo.translate(0, 0.11, 0);
  const grassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  const gDummy = new THREE.Object3D();
  const gColor = new THREE.Color();
  for (let i = 0; i < grassCount; i += 4) {
    const ang = -1.24 + (((i * 37) % 100) / 100) * 2.48;
    const dist =
      level.id === 8
        ? 3.1 + ((i * 53) % 100) * 0.019
        : level.id === 6
          ? 2.8 + ((i * 53) % 100) * 0.016
          : 4.6 + ((i * 53) % 125) * 0.095;
    const cx = Math.sin(ang) * dist + (((i % 5) - 2) * 0.22);
    const cz = -Math.cos(ang) * dist + (((i % 3) - 1) * 0.18);
    for (let b = 0; b < 4 && i + b < grassCount; b++) {
      const bladeAng = (b / 4) * Math.PI * 2 + i * 0.3;
      gDummy.position.set(cx + Math.cos(bladeAng) * 0.055, 0, cz + Math.sin(bladeAng) * 0.055);
      gDummy.rotation.set(Math.sin(bladeAng) * 0.42, bladeAng, Math.cos(bladeAng) * 0.42);
      const s = 0.72 + ((i + b) % 4) * 0.18;
      gDummy.scale.set(s, s * (0.85 + (b % 2) * 0.25), s);
      gDummy.updateMatrix();
      grassInst.setMatrixAt(i + b, gDummy.matrix);
      gColor.setHSL(
        level.id === 10 ? 0.05 : level.id === 9 ? 0.74 : level.id >= 4 ? 0.39 : 0.29 + (b % 3) * 0.02,
        0.38 + (i % 3) * 0.06,
        0.10 + (b % 3) * 0.025,
      );
      grassInst.setColorAt(i + b, gColor);
    }
  }
  grassInst.computeBoundingSphere();
  if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
  group.add(grassInst);

  let activePointLights = 0;

  const addContactShadow = (parent: THREE.Group, radius: number) => {
    const disc = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(radius, 12)), shadowMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.022;
    parent.add(disc);
  };

  // --- Shared Sculpted Geometries for Realistic Multi-Part Props ---
  // Gunungan / Javanese arched tombstone slab (beveled ExtrudeGeometry)
  const gununganShape = new THREE.Shape();
  gununganShape.moveTo(-0.44, 0);
  gununganShape.lineTo(0.44, 0);
  gununganShape.lineTo(0.4, 0.92);
  gununganShape.quadraticCurveTo(0.36, 1.32, 0.0, 1.56);
  gununganShape.quadraticCurveTo(-0.36, 1.32, -0.4, 0.92);
  gununganShape.closePath();
  const tombstoneSlabGeo = trackGeo(
    new THREE.ExtrudeGeometry(gununganShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.03,
      bevelSegments: 2,
    }),
  );
  tombstoneSlabGeo.translate(0, 0, -0.11);

  // Lotus finial (LatheGeometry) shared by tombstones and statues
  const finialPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.18, 0.0),
    new THREE.Vector2(0.14, 0.08),
    new THREE.Vector2(0.2, 0.16),
    new THREE.Vector2(0.09, 0.34),
    new THREE.Vector2(0.0, 0.44),
  ];
  const lotusFinialGeo = trackGeo(new THREE.LatheGeometry(finialPoints, 10));

  // Hammered oil lamp vessel (LatheGeometry)
  const dishPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.08, 0.02),
    new THREE.Vector2(0.21, 0.11),
    new THREE.Vector2(0.18, 0.16),
    new THREE.Vector2(0.11, 0.14),
    new THREE.Vector2(0.0, 0.11),
  ];
  const oilDishGeo = trackGeo(new THREE.LatheGeometry(dishPoints, 12));

  // Banana pseudostem with tapered waist (LatheGeometry)
  const bananaStemPoints = [
    new THREE.Vector2(0.23, 0.0),
    new THREE.Vector2(0.18, 0.65),
    new THREE.Vector2(0.15, 1.45),
    new THREE.Vector2(0.12, 2.35),
    new THREE.Vector2(0.06, 2.58),
  ];
  const bananaStemGeo = trackGeo(new THREE.LatheGeometry(bananaStemPoints, 10));

  // Sculpted arching banana leaf plane with midrib camber
  const bananaLeafGeo = trackGeo(new THREE.PlaneGeometry(0.86, 2.25, 2, 4));
  bananaLeafGeo.translate(0, 1.08, 0);
  {
    const posAttr = bananaLeafGeo.attributes.position;
    for (let v = 0; v < posAttr.count; v++) {
      const lx = posAttr.getX(v);
      const ly = posAttr.getY(v);
      const t = ly / 2.2;
      // Arched tropical droop along length + gentle V-fold across blade width
      posAttr.setZ(v, -t * t * 0.78 + Math.abs(lx) * 0.14);
    }
    bananaLeafGeo.computeVertexNormals();
  }

  // --- Composite 3D Prop Builders ---
  const createRockCluster = (x: number, z: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    const specs: Array<[number, number, number, number, number, number, boolean]> = [
      [0, 0.28, 0, 0.46, 0.2, 0.5, false],
      [-0.4, 0.18, 0.22, 0.29, 1.1, 0.2, true],
      [0.38, 0.21, -0.18, 0.31, 2.2, -0.3, false],
      [0.14, 0.11, 0.36, 0.16, 0.7, 0.4, true],
      [-0.22, 0.1, -0.34, 0.15, 1.8, -0.2, false],
    ];
    specs.forEach(([rx, ry, rz, rad, ryRot, rxRot, mossy]) => {
      const rock = new THREE.Mesh(
        trackGeo(new THREE.DodecahedronGeometry(rad, 1)),
        mossy ? mossMat : darkStoneMat,
      );
      rock.position.set(rx, ry, rz);
      rock.rotation.set(rxRot, ryRot, 0);
      rock.scale.set(1.25, 0.72, 1.0);
      g.add(rock);
    });
    addContactShadow(g, 0.85);
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  };

  const createBananaTree = (x: number, z: number, rotY: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(bananaStemGeo, bananaStemMat);
    g.add(stem);

    // Dried fibrous leaf-sheath collar rings near top of stem
    for (let r = 0; r < 3; r++) {
      const collar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.14 - r * 0.015, 0.022, 5, 10)), rattanMat);
      collar.rotation.x = Math.PI / 2 + 0.12;
      collar.position.y = 1.65 + r * 0.32;
      g.add(collar);
    }

    // Young side shoot (anakan pisang)
    const youngStem = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.065, 0.12, 1.55, 8)), bananaStemMat);
    youngStem.position.set(0.32, 0.76, 0.14);
    youngStem.rotation.z = -0.14;
    g.add(youngStem);

    // 7 broad arching banana leaves with curved petiole stalks
    for (let i = 0; i < 7; i++) {
      const yaw = (i / 7) * Math.PI * 2 + 0.18;
      const pivot = new THREE.Group();
      pivot.position.set(0, 2.34 + (i % 2) * 0.14, 0);
      pivot.rotation.y = yaw;
      const petiole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.018, 0.032, 0.45, 6)), bananaStemMat);
      petiole.position.set(0, 0.18, 0.12);
      petiole.rotation.x = 0.55;
      pivot.add(petiole);

      const leaf = new THREE.Mesh(bananaLeafGeo, bananaLeafMat);
      leaf.rotation.x = 1.04 + (i % 3) * 0.14;
      pivot.add(leaf);
      g.add(pivot);
      swayingObjects.push({ obj: pivot, baseRotZ: 0, phase: x + i * 0.9, amp: 0.032 });
    }

    // Curved fruiting peduncle + bunch of green bananas + teardrop jantung pisang
    const stalkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 2.35, 0.05),
      new THREE.Vector3(0.24, 2.28, 0.18),
      new THREE.Vector3(0.3, 1.98, 0.24),
    ]);
    const stalk = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(stalkCurve, 8, 0.025, 6, false)), bananaStemMat);
    g.add(stalk);

    const bananaGreenMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x628b39, roughness: 0.55 }));
    for (let b = 0; b < 4; b++) {
      const finger = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.028, 0.11, 4, 6)), bananaGreenMat);
      finger.position.set(0.27 + (b - 1.5) * 0.045, 2.08, 0.23);
      finger.rotation.z = (b - 1.5) * 0.18;
      g.add(finger);
    }

    const blossomMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x5c1a27, roughness: 0.52 }));
    const jantung = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.11, 0.34, 8)), blossomMat);
    jantung.rotation.x = Math.PI;
    jantung.position.set(0.3, 1.82, 0.24);
    g.add(jantung);

    addContactShadow(g, 1.2);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.scale.setScalar(scale);
    return g;
  };

  const createTombstone = (x: number, z: number, rotY: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    // Stepped stone foundation + collar
    const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.22, 0.22, 0.72)), darkStoneMat);
    base.position.y = 0.11;
    g.add(base);

    const collar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.0, 0.14, 0.48)), stoneMat);
    collar.position.y = 0.29;
    g.add(collar);

    // Gunungan beveled main stela
    const slab = new THREE.Mesh(tombstoneSlabGeo, stoneMat);
    slab.position.y = 0.35;
    g.add(slab);

    // Recessed carved stone plaque + lotus finial crest
    const plaque = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.5, 0.68, 0.28)), darkStoneMat);
    plaque.position.y = 0.92;
    g.add(plaque);

    const finial = new THREE.Mesh(lotusFinialGeo, darkStoneMat);
    finial.position.y = 1.9;
    g.add(finial);

    // Mossy grave curb border + earth mound + small foot-stone
    const mound = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 0.15, 1.48)), mossMat);
    mound.position.set(0, 0.075, 0.92);
    g.add(mound);

    const footStone = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.44, 0.18)), darkStoneMat);
    footStone.position.set(0, 0.22, 1.62);
    footStone.rotation.x = -0.1;
    g.add(footStone);

    addContactShadow(g, 1.1);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.scale.setScalar(scale);
    return g;
  };

  const createBush = (x: number, z: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    const offsets = [
      [0, 0.44, 0, 0.68],
      [-0.48, 0.33, 0.18, 0.5],
      [0.5, 0.35, -0.15, 0.52],
      [0.12, 0.56, 0.36, 0.42],
      [-0.22, 0.52, -0.28, 0.38],
    ];
    offsets.forEach(([ox, oy, oz, r], i) => {
      const m = new THREE.Mesh(
        trackGeo(new THREE.DodecahedronGeometry(r, 1)),
        i % 2 === 0 ? foliageDarkMat : foliageMidMat,
      );
      m.position.set(ox, oy, oz);
      g.add(m);
    });
    addContactShadow(g, 1.05);
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  };

  const createKambojaTree = (x: number, z: number, rotY: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    // Gnarled curved main trunk (TubeGeometry along spline)
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.08, 0.85, 0.05),
      new THREE.Vector3(0.06, 1.75, -0.04),
      new THREE.Vector3(0, 2.35, 0),
    ]);
    const trunk = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(trunkCurve, 10, 0.22, 8, false)), barkMat);
    g.add(trunk);

    // Three organic forked branches
    const branchSpecs: Array<Array<[number, number, number]>> = [
      [[0, 2.15, 0], [-0.45, 2.68, 0.14], [-1.05, 3.15, 0.22]],
      [[0, 2.2, 0], [0.5, 2.75, -0.12], [1.05, 3.22, -0.18]],
      [[0, 2.25, 0], [0.06, 2.82, 0.42], [0.12, 3.25, 0.78]],
    ];
    branchSpecs.forEach((pts) => {
      const c = new THREE.CatmullRomCurve3(pts.map(([px, py, pz]) => new THREE.Vector3(px, py, pz)));
      const b = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(c, 8, 0.1, 7, false)), barkMat);
      g.add(b);
    });

    // Exposed gnarled surface roots
    for (let r = 0; r < 4; r++) {
      const ra = (r / 4) * Math.PI * 2 + 0.4;
      const root = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.12, 0.65, 6)), barkMat);
      root.position.set(Math.cos(ra) * 0.28, 0.14, Math.sin(ra) * 0.28);
      root.rotation.y = -ra;
      root.rotation.z = 1.05;
      g.add(root);
    }

    const canopySpots = [
      [-1.02, 3.28, 0.22, 0.88],
      [1.02, 3.36, -0.16, 0.92],
      [0, 3.78, 0, 1.06],
      [0.12, 3.3, 0.76, 0.74],
      [-0.55, 3.55, -0.52, 0.72],
    ];
    canopySpots.forEach(([cx, cy, cz, r], i) => {
      const leaf = new THREE.Mesh(
        trackGeo(new THREE.IcosahedronGeometry(r, 1)),
        i >= 2 ? foliageMidMat : foliageDarkMat,
      );
      leaf.position.set(cx, cy, cz);
      leaf.rotation.set(i * 0.35, i * 0.8, i * 0.22);
      leaf.scale.set(1.06, 0.68, 0.96);
      g.add(leaf);
    });

    // White-gold kamboja flowers on canopy + fallen blossoms on ground
    const blossomMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf9f3d8, roughness: 0.45 }));
    for (let i = 0; i < 6; i++) {
      const fl = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.085, 0)), blossomMat);
      fl.position.set((i - 2.5) * 0.38, 3.4 + (i % 2) * 0.24, 0.56 - (i % 3) * 0.2);
      g.add(fl);
    }
    for (let i = 0; i < 4; i++) {
      const fallen = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.05, 0)), blossomMat);
      fallen.position.set(Math.cos(i * 1.7) * 0.75, 0.03, Math.sin(i * 1.7) * 0.68);
      fallen.scale.y = 0.45;
      g.add(fallen);
    }

    addContactShadow(g, 1.5);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.scale.setScalar(scale);
    swayingObjects.push({ obj: g, baseRotZ: 0, phase: x + z, amp: 0.012 });
    return g;
  };

  const createBanyanTree = (x: number, z: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.65, 1.06, 4.5, 10)), barkMat);
    trunk.position.y = 2.25;
    g.add(trunk);

    // 6 sculpted buttress root fins gripping the soil
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 + 0.2;
      const root = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 1.45, 0.95)), barkMat);
      root.position.set(Math.cos(ang) * 0.78, 0.62, Math.sin(ang) * 0.78);
      root.rotation.y = -ang;
      root.rotation.x = 0.28;
      g.add(root);
    }

    // Spreading primary boughs
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const boughCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 3.6, 0),
        new THREE.Vector3(Math.cos(a) * 1.1, 4.15, Math.sin(a) * 1.1),
        new THREE.Vector3(Math.cos(a) * 1.9, 4.45, Math.sin(a) * 1.9),
      ]);
      const bough = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(boughCurve, 7, 0.22, 7, false)), barkMat);
      g.add(bough);
    }

    const canopies = [
      [0, 5.2, 0, 2.15],
      [-1.6, 4.55, 0.62, 1.52],
      [1.65, 4.65, -0.45, 1.55],
      [0.12, 4.75, 1.45, 1.4],
      [-0.75, 4.85, -1.25, 1.38],
    ];
    canopies.forEach(([cx, cy, cz, r], i) => {
      const dome = new THREE.Mesh(
        trackGeo(new THREE.IcosahedronGeometry(r, 1)),
        i % 2 === 0 ? foliageDarkMat : foliageMidMat,
      );
      dome.position.set(cx, cy, cz);
      dome.rotation.set(i * 0.25, i * 0.75, 0);
      dome.scale.set(1.05, 0.66, 1.0);
      g.add(dome);
    });

    // Sinuous hanging aerial roots (akar gantung)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rad = 1.32 + (i % 2) * 0.48;
      const vineCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.07 * (i % 2 === 0 ? 1 : -1), -1.1, 0.05),
        new THREE.Vector3(-0.04, -2.55, -0.04),
      ]);
      const vine = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(vineCurve, 7, 0.032, 5, false)), barkMat);
      vine.position.set(Math.cos(a) * rad, 4.05, Math.sin(a) * rad);
      g.add(vine);
      swayingObjects.push({ obj: vine, baseRotZ: 0, phase: i * 1.1 + x, amp: 0.04 });
    }

    // Small mossy stone shrine / offering stone at tree base
    const shrine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.52, 0.22, 0.42)), stoneMat);
    shrine.position.set(0.85, 0.11, 0.85);
    g.add(shrine);

    addContactShadow(g, 2.4);
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  };

  const createOilLamp = (x: number, z: number, withLight: boolean): THREE.Group => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.058, 0.082, 1.68, 8)), bambooMat);
    pole.position.y = 0.84;
    g.add(pole);

    // Bamboo internode rings (ruas bambu)
    for (const ry of [0.45, 0.95, 1.45]) {
      const node = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.072, 0.014, 5, 10)), rattanMat);
      node.rotation.x = Math.PI / 2;
      node.position.y = ry;
      g.add(node);
    }

    // Hammered copper oil bowl (LatheGeometry)
    const dish = new THREE.Mesh(oilDishGeo, copperMat);
    dish.position.y = 1.66;
    g.add(dish);

    // Wrought-iron lantern protective ribs & cap
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const strut = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5)), ironMat);
      strut.position.set(Math.cos(a) * 0.16, 1.94, Math.sin(a) * 0.16);
      g.add(strut);
    }
    const cap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.24, 0.16, 8)), ironMat);
    cap.position.y = 2.22;
    g.add(cap);

    const flame = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.09, 0.26, 7)), lanternGlowMat);
    flame.position.y = 1.92;
    g.add(flame);

    // Cap dynamic point lights per arena to 2 for lightweight fragment shading while keeping emissive flames
    if (withLight && activePointLights < 2) {
      activePointLights += 1;
      const pLight = new THREE.PointLight(lanternThemeHex, isSoftwareGl ? 3.2 : 3.5, 13.5, 1.65);
      pLight.position.y = 2.05;
      g.add(pLight);
      flickerLights.push({ light: pLight, baseIntensity: 3.35, phase: x * 1.7 + z, flameMesh: flame });
    }
    addContactShadow(g, 0.48);
    g.position.set(x, 0, z);
    return g;
  };

  const createJogloHouse = (x: number, z: number, rotY: number): THREE.Group => {
    const g = new THREE.Group();
    // Stepped stone foundation + front pendopo steps
    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.8, 0.42, 4.6)), stoneMat);
    plinth.position.y = 0.21;
    g.add(plinth);

    const step = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.22, 0.65)), darkStoneMat);
    step.position.set(0, 0.11, 2.5);
    g.add(step);

    // Paneled wooden gebyok walls
    const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.1, 2.32, 0.22)), woodMat);
    backWall.position.set(0, 1.56, -1.75);
    g.add(backWall);

    const leftWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 2.32, 3.7)), woodMat);
    leftWall.position.set(-2.45, 1.56, 0);
    g.add(leftWall);

    const rightWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 2.32, 3.7)), woodMat);
    rightWall.position.set(2.45, 1.56, 0);
    g.add(rightWall);

    // 4 Carved Soko Guru teak pillars sitting on stone umpak pedestals
    for (const px of [-2.32, -0.88, 0.88, 2.32]) {
      const umpak = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.22, 0.22, 6)), darkStoneMat);
      umpak.position.set(px, 0.52, 1.9);
      g.add(umpak);

      const pillar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.125, 2.22, 8)), woodMat);
      pillar.position.set(px, 1.72, 1.9);
      g.add(pillar);
    }

    // Horizontal cross-beam (blandar)
    const blandar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.1, 0.16, 0.18)), woodMat);
    blandar.position.set(0, 2.74, 1.9);
    g.add(blandar);

    // Warm glowing lattice window (kisi-kisi jendela)
    const winMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffd27d, emissive: 0xff9838, emissiveIntensity: 0.95, roughness: 0.35 }),
    );
    const winFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.12, 0.98, 0.08)), woodMat);
    winFrame.position.set(1.3, 1.65, -1.62);
    g.add(winFrame);
    const win = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.94, 0.8)), winMat);
    win.position.set(1.3, 1.65, -1.56);
    g.add(win);

    // 2-tier Joglo Shingled Roof + sculpted wuwungan ridge cap
    const lowerRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(4.45, 1.38, 4)), shingleMat);
    lowerRoof.rotation.y = Math.PI / 4;
    lowerRoof.position.y = 3.42;
    g.add(lowerRoof);

    const upperRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(2.25, 1.65, 4)), shingleMat);
    upperRoof.rotation.y = Math.PI / 4;
    upperRoof.position.y = 4.55;
    g.add(upperRoof);

    const ridgeCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.16, 0.42, 6)), copperMat);
    ridgeCap.position.y = 5.45;
    g.add(ridgeCap);

    addContactShadow(g, 3.5);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };

  const createOldWell = (x: number, z: number): THREE.Group => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.96, 1.08, 0.92, 14, 1, true)), stoneMat);
    ring.position.y = 0.46;
    g.add(ring);

    const rim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.96, 0.12, 8, 16)), darkStoneMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.92;
    g.add(rim);

    // Reflective dark well water
    const water = new THREE.Mesh(
      trackGeo(new THREE.CircleGeometry(0.89, 14)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x0b2226, roughness: 0.08, metalness: 0.45 })),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.36;
    g.add(water);

    for (const px of [-0.9, 0.9]) {
      const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.075, 0.09, 1.98, 8)), woodMat);
      post.position.set(px, 1.38, 0);
      g.add(post);
    }

    // Windlass axle + coiled rope + hanging wooden bucket (timba)
    const beam = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.068, 0.068, 2.04, 8)), woodMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.y = 2.08;
    g.add(beam);

    const coil = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 8)), rattanMat);
    coil.rotation.z = Math.PI / 2;
    coil.position.set(0, 2.08, 0);
    g.add(coil);

    const rope = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.85, 5)), rattanMat);
    rope.position.set(0, 1.62, 0.06);
    g.add(rope);

    const bucket = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.12, 0.28, 8)), woodMat);
    bucket.position.set(0, 1.15, 0.06);
    g.add(bucket);

    // Small pitched well gable roof (atap sumur)
    const roofL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.35, 0.08, 1.15)), shingleMat);
    roofL.position.set(0, 2.68, -0.45);
    roofL.rotation.x = 0.52;
    g.add(roofL);
    const roofR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.35, 0.08, 1.15)), shingleMat);
    roofR.position.set(0, 2.68, 0.45);
    roofR.rotation.x = -0.52;
    g.add(roofR);

    addContactShadow(g, 1.4);
    g.position.set(x, 0, z);
    return g;
  };

  const createStoneStatue = (x: number, z: number, rotY: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.56, 0.48, 1.56)), darkStoneMat);
    plinth.position.y = 0.24;
    g.add(plinth);

    // Lotus padmasana base (LatheGeometry)
    const padmaPts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.68, 0.0),
      new THREE.Vector2(0.58, 0.12),
      new THREE.Vector2(0.64, 0.24),
      new THREE.Vector2(0.52, 0.3),
      new THREE.Vector2(0.0, 0.3),
    ];
    const padma = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(padmaPts, 10)), stoneMat);
    padma.position.y = 0.48;
    g.add(padma);

    const torso = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.46, 0.58, 1.28, 9)), stoneMat);
    torso.position.y = 1.4;
    g.add(torso);

    // Carved stone shoulder pauldrons & sash
    const sash = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.52, 0.08, 6, 12)), darkStoneMat);
    sash.rotation.x = Math.PI / 2 + 0.35;
    sash.position.y = 1.42;
    g.add(sash);

    const head = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.41, 1)), stoneMat);
    head.position.y = 2.28;
    g.add(head);

    // Javanese temple crown (Mahkota via LatheGeometry)
    const crown = new THREE.Mesh(lotusFinialGeo, darkStoneMat);
    crown.scale.set(1.65, 1.45, 1.65);
    crown.position.y = 2.58;
    g.add(crown);

    // Guardian stone club (Gada) resting beside pedestal
    const gada = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.07, 1.35, 8)), darkStoneMat);
    gada.position.set(0.68, 0.92, 0.28);
    gada.rotation.z = -0.18;
    g.add(gada);

    if (level.id >= 4) {
      const eyeMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x55ff8c }));
      for (const ex of [-0.14, 0.14]) {
        const eye = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 6, 6)), eyeMat);
        eye.position.set(ex, 2.34, 0.36);
        g.add(eye);
      }
    }

    addContactShadow(g, 1.25);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.scale.setScalar(scale);
    return g;
  };

  const createTempleGate = (x: number, z: number, rotY: number): THREE.Group => {
    const g = new THREE.Group();
    // Stepped stone threshold stairs
    for (let s = 0; s < 3; s++) {
      const st = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4 + s * 0.4, 0.16, 2.4 - s * 0.4)), darkStoneMat);
      st.position.set(0, 0.08 + s * 0.14, 0.6 - s * 0.1);
      g.add(st);
    }

    // Authentic tiered Javanese Paduraksa towers
    for (const side of [-2.05, 2.05]) {
      const tower = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.42, 4.3, 1.42)), stoneMat);
      tower.position.set(side, 2.15, 0);
      g.add(tower);

      // 4 Cascading horizontal volcanic-stone cornice ledges
      for (let tier = 0; tier < 4; tier++) {
        const w = 1.72 - tier * 0.08;
        const ledge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.24, w)), darkStoneMat);
        ledge.position.set(side, 1.1 + tier * 1.05, 0);
        g.add(ledge);
      }

      // Stepped pyramid roof spire
      const spire1 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.18, 0.9, 4)), stoneMat);
      spire1.rotation.y = Math.PI / 4;
      spire1.position.set(side, 4.75, 0);
      g.add(spire1);

      const spire2 = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.75, 0.95, 4)), darkStoneMat);
      spire2.rotation.y = Math.PI / 4;
      spire2.position.set(side, 5.45, 0);
      g.add(spire2);

      // Carved anglo stone brazier on pedestal with glowing supernatural fire
      const brazierBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 0.95, 0.65)), darkStoneMat);
      brazierBase.position.set(side, 0.47, 1.05);
      g.add(brazierBase);

      const brazier = new THREE.Mesh(oilDishGeo, stoneMat);
      brazier.scale.setScalar(1.65);
      brazier.position.set(side, 0.95, 1.05);
      g.add(brazier);

      const greenFlame = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.24, 0.62, 7)), lanternGlowMat);
      greenFlame.position.set(side, 1.45, 1.05);
      g.add(greenFlame);
    }

    // Stepped Kala-head lintel arch across gate opening
    const lintel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.85, 1.5)), stoneMat);
    lintel.position.set(0, 4.2, 0);
    g.add(lintel);
    const kalaCrest = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.05, 1.15, 4)), darkStoneMat);
    kalaCrest.rotation.y = Math.PI / 4;
    kalaCrest.position.set(0, 5.1, 0.1);
    g.add(kalaCrest);

    addContactShadow(g, 3.4);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };

  const createBambooFence = (x: number, z: number, rotY: number): THREE.Group => {
    const g = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const h = 1.08 + ((i + 2) % 3) * 0.1;
      const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.062, h, 8)), bambooMat);
      post.position.set(i * 0.52, h * 0.5, 0);
      g.add(post);

      // Bamboo node + rattan joint lashing
      for (const ry of [0.36, 0.84]) {
        const lash = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.066, 0.014, 5, 8)), rattanMat);
        lash.rotation.x = Math.PI / 2;
        lash.position.set(i * 0.52, ry, 0.02);
        g.add(lash);
      }
    }
    for (const ry of [0.36, 0.84]) {
      const rail = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 2.45, 7)), bambooMat);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, ry, 0.055);
      g.add(rail);
    }
    // Diagonal brace
    const brace = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 1.35, 6)), bambooMat);
    brace.position.set(0, 0.6, 0.065);
    brace.rotation.z = 1.15;
    g.add(brace);

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };

  // --- New Composite 3-12 Part Landmark & Prop Builders for Levels 6-10 ---
  const createSwampTree = (x: number, z: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    // Main trunk starting above stilt root arch
    const trunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.24, 0.38, 3.3, 8)), barkMat);
    trunk.position.y = 2.4;
    g.add(trunk);

    // 5 Arched mangrove stilt roots entering dark swamp water
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const stiltCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * 0.25, 1.55, Math.sin(a) * 0.25),
        new THREE.Vector3(Math.cos(a) * 0.85, 0.85, Math.sin(a) * 0.85),
        new THREE.Vector3(Math.cos(a) * 1.25, 0.0, Math.sin(a) * 1.25),
      ]);
      const stilt = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(stiltCurve, 7, 0.075, 6, false)), barkMat);
      g.add(stilt);
    }

    // Gnarled canopy domes & hanging moss strands
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const dome = new THREE.Mesh(trackGeo(new THREE.IcosahedronGeometry(1.15, 1)), foliageDarkMat);
      dome.position.set(Math.cos(a) * 0.75, 4.1 + (i % 2) * 0.35, Math.sin(a) * 0.75);
      dome.scale.set(1.1, 0.65, 1.0);
      g.add(dome);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      const mossStrand = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.03, 1.4, 5)), mossMat);
      mossStrand.position.set(Math.cos(a) * 1.05, 3.15, Math.sin(a) * 1.05);
      g.add(mossStrand);
      swayingObjects.push({ obj: mossStrand, baseRotZ: 0, phase: x + i, amp: 0.045 });
    }

    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  };

  const createBambooBridge = (x: number, z: number, rotY: number): THREE.Group => {
    const g = new THREE.Group();
    // Wooden support pilings driven into swamp floor
    for (const px of [-0.95, 0.95]) {
      for (const pz of [-4.2, -1.4, 1.4, 4.2]) {
        const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.1, 1.65, 7)), woodMat);
        post.position.set(px, 0.65, pz);
        post.rotation.z = (pz > 0 ? 1 : -1) * 0.04;
        g.add(post);
      }
    }
    // Uneven bamboo cross planks
    for (let i = 0; i < 16; i++) {
      const pz = -4.5 + i * 0.6;
      const plank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.9, 0.08, 0.42)), i % 3 === 0 ? bambooMat : woodMat);
      plank.position.set(0, 0.38 + Math.sin(i * 0.4) * 0.03, pz);
      plank.rotation.z = ((i % 3) - 1) * 0.025;
      g.add(plank);
    }
    // Bamboo handrails
    for (const px of [-0.92, 0.92]) {
      const rail = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 9.2, 6)), bambooMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(px, 1.32, 0);
      g.add(rail);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };

  const createReedCluster = (x: number, z: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    const headMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.9 }));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 0.14 + (i % 3) * 0.14;
      const h = 1.25 + (i % 3) * 0.32;
      const stalk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.015, 0.024, h, 5)), bambooMat);
      stalk.position.set(Math.cos(a) * r, h * 0.5, Math.sin(a) * r);
      stalk.rotation.z = Math.cos(a) * 0.12;
      g.add(stalk);
      if (i % 2 === 0) {
        const head = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.036, 0.18, 4, 6)), headMat);
        head.position.set(Math.cos(a) * (r + 0.05), h - 0.15, Math.sin(a) * r);
        g.add(head);
      }
    }
    swayingObjects.push({ obj: g, baseRotZ: 0, phase: x * 0.7 + z, amp: 0.038 });
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  };

  const createSmokestack = (x: number, z: number): THREE.Group => {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.5, 1.5, 2.5)), darkStoneMat);
    plinth.position.y = 0.75;
    g.add(plinth);

    const shaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.68, 1.05, 8.6, 12)), brickMat);
    shaft.position.y = 5.6;
    g.add(shaft);

    for (const ry of [3.2, 5.6, 8.0, 9.6]) {
      const t = (ry - 1.5) / 8.6;
      const rad = THREE.MathUtils.lerp(1.05, 0.68, Math.max(0, Math.min(1, t))) + 0.03;
      const band = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(rad, 0.05, 6, 14)), ironMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = ry;
      g.add(band);
    }

    const crown = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.84, 0.72, 0.45, 12)), darkStoneMat);
    crown.position.y = 9.95;
    g.add(crown);

    addContactShadow(g, 1.9);
    g.position.set(x, 0, z);
    return g;
  };

  const createBoilerTank = (x: number, z: number, rotY: number): THREE.Group => {
    const g = new THREE.Group();
    // Brick cradles
    for (const cz of [-0.75, 0.75]) {
      const cradle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.55, 0.55, 0.38)), brickMat);
      cradle.position.set(0, 0.275, cz);
      g.add(cradle);
    }
    const tank = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.76, 0.76, 2.45, 14)), rustedMat);
    tank.rotation.x = Math.PI / 2;
    tank.position.y = 1.1;
    g.add(tank);

    const dome = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 0.55, 10)), copperMat);
    dome.position.set(0, 1.95, 0.25);
    g.add(dome);

    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2.15, 0.25),
      new THREE.Vector3(0.55, 2.35, 0.25),
      new THREE.Vector3(0.85, 1.6, 0.25),
      new THREE.Vector3(0.85, 0.0, 0.25),
    ]);
    const pipe = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(pipeCurve, 9, 0.065, 6, false)), copperMat);
    g.add(pipe);

    const valve = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.18, 0.025, 6, 10)), ironMat);
    valve.position.set(0.52, 1.45, 0.7);
    g.add(valve);

    addContactShadow(g, 1.65);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };

  const createCogwheelProp = (x: number, z: number, rotY: number, radius = 0.95): THREE.Group => {
    const g = new THREE.Group();
    const rim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(radius, 0.11, 6, 18)), rustedMat);
    g.add(rim);
    const hub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(radius * 0.24, radius * 0.24, 0.24, 10)), ironMat);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spoke = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, radius * 1.85, 0.08)), rustedMat);
      spoke.rotation.z = a;
      g.add(spoke);
    }
    for (let t = 0; t < 12; t++) {
      const a = (t / 12) * Math.PI * 2;
      const tooth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.15, 0.2, 0.18)), ironMat);
      tooth.position.set(Math.cos(a) * (radius + 0.12), Math.sin(a) * (radius + 0.12), 0);
      tooth.rotation.z = a - Math.PI / 2;
      g.add(tooth);
    }
    g.position.set(x, radius + 0.08, z);
    g.rotation.y = rotY;
    g.rotation.x = -0.14;
    return g;
  };

  const createBrickArchWall = (x: number, z: number, rotY: number): THREE.Group => {
    const g = new THREE.Group();
    for (const px of [-1.45, 1.45]) {
      const col = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.85, 3.4, 0.72)), brickMat);
      col.position.set(px, 1.7, 0);
      g.add(col);
      const cap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.02, 0.24, 0.85)), darkStoneMat);
      cap.position.set(px, 3.5, 0);
      g.add(cap);
    }
    const lintel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.78, 0.74)), brickMat);
    lintel.position.set(0, 3.7, 0);
    g.add(lintel);
    const brokenTooth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.55, 0.65)), brickMat);
    brokenTooth.position.set(-0.95, 4.32, 0);
    g.add(brokenTooth);

    addContactShadow(g, 2.2);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };

  const createCliffSpire = (x: number, z: number, height: number, rotY: number, isVolcanic = false): THREE.Group => {
    const g = new THREE.Group();
    const mat = isVolcanic ? darkStoneMat : stoneMat;
    const main = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(1.45, height, 6)), mat);
    main.position.y = height * 0.5;
    main.scale.set(1.15, 1, 0.88);
    g.add(main);

    const shardL = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.82, height * 0.65, 5)), darkStoneMat);
    shardL.position.set(-0.95, height * 0.3, 0.25);
    shardL.rotation.z = 0.16;
    g.add(shardL);

    const shardR = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.75, height * 0.55, 5)), mat);
    shardR.position.set(0.9, height * 0.26, -0.2);
    shardR.rotation.z = -0.14;
    g.add(shardR);

    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };

  const createSuspensionBridge = (x: number, startZ: number, endZ: number): THREE.Group => {
    const g = new THREE.Group();
    const span = Math.abs(endZ - startZ);
    const midZ = (startZ + endZ) * 0.5;
    // 4 Timber/bamboo end pylons
    for (const pz of [startZ, endZ]) {
      for (const px of [-1.45, 1.45]) {
        const post = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.15, 3.1, 8)), woodMat);
        post.position.set(px, 1.45, pz);
        g.add(post);
      }
      const cross = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 7)), bambooMat);
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0, 2.75, pz);
      g.add(cross);
    }
    // Sagging wooden plank deck
    const plankCount = 20;
    for (let i = 0; i < plankCount; i++) {
      const t = i / (plankCount - 1);
      const pz = THREE.MathUtils.lerp(startZ, endZ, t);
      const sag = -Math.sin(t * Math.PI) * 0.72;
      const plank = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 0.09, 0.45)), i % 2 === 0 ? woodMat : bambooMat);
      plank.position.set(0, 0.08 + sag, pz);
      plank.rotation.z = Math.sin(i * 0.7) * 0.03;
      g.add(plank);
    }
    // Dual catenary handrail ropes + suspender ropes
    for (const px of [-1.28, 1.28]) {
      const ropeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(px, 2.5, startZ),
        new THREE.Vector3(px, 1.35, midZ),
        new THREE.Vector3(px, 2.5, endZ),
      ]);
      const rope = new THREE.Mesh(trackGeo(new THREE.TubeGeometry(ropeCurve, 14, 0.035, 6, false)), rattanMat);
      g.add(rope);
      for (let s = 1; s < 7; s++) {
        const t = s / 7;
        const sz = THREE.MathUtils.lerp(startZ, endZ, t);
        const topY = 2.5 - Math.sin(t * Math.PI) * 1.15;
        const botY = 0.08 - Math.sin(t * Math.PI) * 0.72;
        const h = Math.max(0.4, topY - botY);
        const vert = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.014, 0.014, h, 4)), rattanMat);
        vert.position.set(px, botY + h * 0.5, sz);
        g.add(vert);
      }
    }
    // Gentle bridge sway
    swayingObjects.push({ obj: g, baseRotZ: 0, phase: 0.4, amp: 0.014 });
    g.position.set(x, 0, 0);
    // Keep span referenced to prevent unused warning
    void span;
    return g;
  };

  const createStupa = (x: number, z: number, scale = 1): THREE.Group => {
    const g = new THREE.Group();
    const base1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 0.45, 2.1)), darkStoneMat);
    base1.position.y = 0.225;
    g.add(base1);
    const base2 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.88, 0.96, 0.35, 12)), stoneMat);
    base2.position.y = 0.625;
    g.add(base2);

    const bellPoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.82, 0.0),
      new THREE.Vector2(0.76, 0.45),
      new THREE.Vector2(0.56, 0.92),
      new THREE.Vector2(0.28, 1.25),
      new THREE.Vector2(0.0, 1.32),
    ];
    const bell = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(bellPoints, 12)), stoneMat);
    bell.position.y = 0.8;
    g.add(bell);

    const harmika = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.28, 0.42)), darkStoneMat);
    harmika.position.y = 2.18;
    g.add(harmika);

    const spire = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.16, 0.72, 8)), darkStoneMat);
    spire.position.y = 2.68;
    g.add(spire);

    addContactShadow(g, 1.45);
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  };

  const createCandiTower = (x: number, z: number): THREE.Group => {
    const g = new THREE.Group();
    // Stepped temple terrace plinth
    const tier0 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.4, 0.65, 5.4)), darkStoneMat);
    tier0.position.y = 0.325;
    g.add(tier0);
    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(4.4, 2.9, 4.0)), stoneMat);
    body.position.y = 2.1;
    g.add(body);
    // Recessed Kala shrine doorway
    const doorway = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.35, 1.85, 0.5)), darkStoneMat);
    doorway.position.set(0, 1.55, 1.9);
    g.add(doorway);
    // 3 Receding stepped Candi roof tiers
    for (let t = 0; t < 3; t++) {
      const w = 4.6 - t * 0.95;
      const tier = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.65, w * 0.9)), t % 2 === 0 ? darkStoneMat : stoneMat);
      tier.position.y = 3.8 + t * 0.65;
      g.add(tier);
    }
    const ratna = new THREE.Mesh(lotusFinialGeo, darkStoneMat);
    ratna.scale.set(2.2, 2.4, 2.2);
    ratna.position.y = 5.45;
    g.add(ratna);

    addContactShadow(g, 3.8);
    g.position.set(x, 0, z);
    return g;
  };

  const createVolcanicFissure = (x: number, z: number, rotY: number, length = 4.2): THREE.Group => {
    const g = new THREE.Group();
    const glowStrip = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.68, length)), magmaMat);
    glowStrip.rotation.x = -Math.PI / 2;
    glowStrip.position.y = 0.025;
    g.add(glowStrip);

    // Basalt crust ridges flanking the magma crack
    for (const side of [-0.42, 0.42]) {
      const crust = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.14, length * 0.92)), darkStoneMat);
      crust.position.set(side, 0.06, 0);
      crust.rotation.z = side > 0 ? -0.25 : 0.25;
      g.add(crust);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  };

  // --- Mystical Javanese Fauna Builders (Burung Gagak & Hewan Melata) ---
  const createPerchedCrow = (x: number, y: number, z: number, rotY: number, phase: number): void => {
    const root = new THREE.Group();
    const body = new THREE.Group();
    const torso = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.085, 0.22, 4, 8)), crowMat);
    torso.rotation.x = 0.65;
    body.add(torso);

    const head = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.078, 8, 8)), crowMat);
    head.position.set(0, 0.15, 0.08);
    const beakMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b3830, roughness: 0.5 }));
    const beak = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.034, 0.12, 5)), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0, 0.095);
    head.add(beak);
    body.add(head);

    const tail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.11, 0.022, 0.18)), crowMat);
    tail.position.set(0, -0.05, -0.15);
    tail.rotation.x = -0.45;
    body.add(tail);

    root.add(body);
    root.position.set(x, y, z);
    root.rotation.y = rotY;
    group.add(root);
    perchedCrows.push({ body, head, phase });
  };

  const createFlyingCrow = (
    centerX: number,
    centerZ: number,
    radiusX: number,
    radiusZ: number,
    height: number,
    speed: number,
    phase: number,
  ): void => {
    const crowGroup = new THREE.Group();
    const body = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.085, 0.25, 4, 7)), crowMat);
    body.rotation.x = Math.PI / 2;
    crowGroup.add(body);

    const tailFan = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.11, 0.18, 4)), crowMat);
    tailFan.rotation.x = -Math.PI / 2;
    tailFan.scale.y = 0.2;
    tailFan.position.z = -0.22;
    crowGroup.add(tailFan);

    const wingGeo = trackGeo(new THREE.BoxGeometry(0.5, 0.022, 0.18));
    const leftWing = new THREE.Mesh(wingGeo, crowMat);
    leftWing.position.set(-0.24, 0, 0);
    crowGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, crowMat);
    rightWing.position.set(0.24, 0, 0);
    crowGroup.add(rightWing);

    group.add(crowGroup);
    flyingCrows.push({
      obj: crowGroup,
      leftWing,
      rightWing,
      centerX,
      centerZ,
      radiusX,
      radiusZ,
      height,
      speed,
      phase,
    });
  };

  const createGroundCrawler = (
    centerX: number,
    centerZ: number,
    radiusX: number,
    radiusZ: number,
    speed: number,
    phase: number,
  ): void => {
    const segments: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const rad = i === 0 ? 0.08 : 0.072 - i * 0.008;
      const seg = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(rad, 7, 7)), crawlerMat);
      seg.scale.set(1.0, 0.65, 1.35);
      seg.position.set(centerX, 0.05, centerZ);
      group.add(seg);
      segments.push(seg);
    }
    crawlers.push({ segments, centerX, centerZ, radiusX, radiusZ, speed, phase });
  };

  // --- Full Moon with Realistic Lunar Texture + Halo Corona ---
  const moonGroup = new THREE.Group();
  const moonTint =
    level.id === 10
      ? 0xffb89c
      : level.id === 9
        ? 0xdfbeff
        : level.id === 8
          ? 0xc4d8ff
          : level.id === 7
            ? 0xf5d6ba
            : level.id === 6
              ? 0xb5f3ff
              : level.id >= 4
                ? 0xb4ffd0
                : level.id === 3
                  ? 0xffe8c2
                  : 0xeaf2ff;
  const moonOrb = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(2.65, 18, 18)),
    trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.moonSurface,
        color: moonTint,
        fog: false,
      }),
    ),
  );
  moonGroup.add(moonOrb);

  const moonInnerHalo = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(9.5, 9.5)),
    trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.softGlow,
        color: moonTint,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  moonInnerHalo.position.z = -0.4;
  moonGroup.add(moonInnerHalo);

  const coronaTint =
    level.id === 10
      ? 0xff6b3d
      : level.id === 9
        ? 0xa866ff
        : level.id === 8
          ? 0x6394ff
          : level.id === 7
            ? 0xd99b66
            : level.id === 6
              ? 0x52d6ff
              : level.id >= 4
                ? 0x5cff9d
                : 0x8bb6ff;
  const moonOuterCorona = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(17.5, 17.5)),
    trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.softGlow,
        color: coronaTint,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  moonOuterCorona.position.z = -0.8;
  moonGroup.add(moonOuterCorona);
  moonGroup.position.set(level.id % 2 === 0 ? -7.5 : 7.5, 14.8, -35);
  group.add(moonGroup);

  // --- Natural Night Starfield (random positions, slightly dim, non-uniform sizes, selective twinkle) ---
  const starCount = 240;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starAlphas = new Float32Array(starCount);
  const starTwinkleSpeeds = new Float32Array(starCount);
  const starTwinklePhases = new Float32Array(starCount);
  const sColor = new THREE.Color();
  for (let s = 0; s < starCount; s++) {
    const yaw = (Math.random() * 2 - 1) * Math.PI * 0.78;
    const elev = 0.09 + Math.pow(Math.random(), 0.85) * 0.62;
    const rad = 52 + Math.random() * 14;
    starPositions[s * 3] = Math.sin(yaw) * Math.cos(elev) * rad;
    starPositions[s * 3 + 1] = Math.sin(elev) * rad + 2.2;
    starPositions[s * 3 + 2] = -Math.cos(yaw) * Math.cos(elev) * rad;

    const tintRoll = Math.random();
    const hue = tintRoll < 0.45 ? 0.6 : tintRoll < 0.78 ? 0.56 : 0.11;
    const sat = 0.08 + Math.random() * 0.24;
    const light = 0.54 + Math.random() * 0.26;
    sColor.setHSL(hue, sat, light);
    starColors[s * 3] = sColor.r;
    starColors[s * 3 + 1] = sColor.g;
    starColors[s * 3 + 2] = sColor.b;

    // Non-uniform natural sizes: mostly tiny specks with sparse slightly larger stars
    const sizeRoll = Math.random();
    starSizes[s] = sizeRoll < 0.72 ? 0.9 + Math.random() * 0.95 : 1.9 + Math.random() * 1.45;
    // Slightly dim ambient magnitude so the night sky remains dark and eerie
    starAlphas[s] = 0.18 + Math.random() * 0.36;
    // Only ~38% of stars gently twinkle at varied frequencies
    starTwinkleSpeeds[s] = Math.random() < 0.38 ? 1.5 + Math.random() * 2.7 : 0.0;
    starTwinklePhases[s] = Math.random() * Math.PI * 2;
  }
  const starGeo = trackGeo(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
  starGeo.setAttribute('aAlpha', new THREE.BufferAttribute(starAlphas, 1));
  starGeo.setAttribute('aTwinkleSpeed', new THREE.BufferAttribute(starTwinkleSpeeds, 1));
  starGeo.setAttribute('aTwinklePhase', new THREE.BufferAttribute(starTwinklePhases, 1));

  const starMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aTwinkleSpeed;
        attribute float aTwinklePhase;
        uniform float uTime;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = aColor;
          float twinkle = aTwinkleSpeed > 0.01
            ? (0.36 + 0.64 * (0.5 + 0.5 * sin(uTime * aTwinkleSpeed + aTwinklePhase)))
            : 1.0;
          vAlpha = aAlpha * twinkle;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (135.0 / max(1.0, -mvPosition.z)), 1.0, 5.2);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          float dist = length(gl_PointCoord - vec2(0.5)) * 2.0;
          if (dist > 1.0) discard;
          float core = pow(smoothstep(1.0, 0.0, dist), 2.2);
          gl_FragColor = vec4(vColor, core * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const starField = new THREE.Points(starGeo, starMat);
  group.add(starField);

  // --- Slowly Moving Overcast Night Clouds (mendung / awan malam bergerak pelan) ---
  const cloudGeo = trackGeo(new THREE.PlaneGeometry(26, 10));
  const cloudTint =
    level.id === 10
      ? 0x9e716a
      : level.id === 9
        ? 0x8f7ca8
        : level.id === 7
          ? 0x998c84
          : level.id === 6
            ? 0x719da8
            : level.id >= 4
              ? 0x7ba590
              : 0x8ea6cc;
  for (let i = 0; i < 8; i++) {
    const baseOpacity = 0.42 + (i % 3) * 0.09;
    const cloudMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.cloudLayer,
        color: cloudTint,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        fog: false,
      }),
    );
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    const bx = -32 + i * 9.2;
    const by = 8.4 + (i % 4) * 2.2;
    const bz = -25 - (i % 3) * 5.2;
    cloud.position.set(bx, by, bz);
    cloud.scale.set(1.0 + (i % 3) * 0.25, 0.9 + (i % 2) * 0.25, 1);
    cloud.lookAt(0, by * 0.62, 0);
    group.add(cloud);
    cloudLayers.push({
      obj: cloud,
      baseX: bx,
      speed: 0.08 + (i % 4) * 0.032,
      range: 28,
      baseOpacity,
    });
  }

  // --- Distant Misty Highland Mountain Silhouettes ---
  const ridgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: level.id === 10 ? 0x1c0f0e : level.id === 9 ? 0x160f1f : level.id >= 4 ? 0x102119 : 0x131d28,
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
  const ridgePeakGeo = trackGeo(new THREE.ConeGeometry(11.5, 10.5, 6));
  for (let m = 0; m < 7; m++) {
    const ang = -Math.PI * 0.62 + (m / 6) * Math.PI * 1.24;
    const r = 46 + (m % 2) * 5;
    const peak = new THREE.Mesh(ridgePeakGeo, ridgeMat);
    peak.position.set(Math.sin(ang) * r, 3.2 + (m % 3) * 0.8, -Math.cos(ang) * r);
    peak.rotation.y = m * 0.7;
    peak.scale.set(1.35 + (m % 2) * 0.3, 0.85 + (m % 3) * 0.25, 0.8);
    group.add(peak);
  }

  // --- Outer Perimeter Backdrop (themed per arena: cliff walls for L8 chasm, basalt caldera for L10, brick walls for L7, forest for others) ---
  const dummy = new THREE.Object3D();
  if (level.id === 8) {
    // Misty canyon cliff monoliths flanking the ravine (none blocking the central chasm)
    const wallCount = 24;
    const cliffGeo = trackGeo(new THREE.ConeGeometry(2.6, 15.5, 6));
    const cliffWall = new THREE.InstancedMesh(cliffGeo, darkStoneMat, wallCount);
    for (let i = 0; i < wallCount; i++) {
      const side = i < wallCount / 2 ? -1 : 1;
      const t = (i % (wallCount / 2)) / (wallCount / 2 - 1);
      const angle = side * (0.28 + t * 0.56) * Math.PI;
      const radius = 19.5 + (i % 4) * 3.1;
      const sc = 0.85 + ((i * 29) % 10) * 0.08;
      dummy.position.set(Math.sin(angle) * radius, -1.2 + (i % 3) * 0.9, -Math.cos(angle) * radius);
      dummy.rotation.set(0, i * 0.9, side * 0.04);
      dummy.scale.set(sc * 1.15, sc * 1.05, sc * 1.1);
      dummy.updateMatrix();
      cliffWall.setMatrixAt(i, dummy.matrix);
    }
    cliffWall.computeBoundingSphere();
    group.add(cliffWall);
  } else if (level.id === 10) {
    // Jagged volcanic obsidian caldera peaks encircling Merapi crater
    const calderaCount = 30;
    const peakGeo = trackGeo(new THREE.ConeGeometry(2.5, 10.8, 5));
    const calderaPeaks = new THREE.InstancedMesh(peakGeo, darkStoneMat, calderaCount);
    for (let i = 0; i < calderaCount; i++) {
      const angle = -Math.PI * 0.78 + (i / (calderaCount - 1)) * (Math.PI * 1.56);
      const radius = 18.8 + (i % 4) * 2.5;
      const sc = 0.82 + ((i * 31) % 11) * 0.07;
      dummy.position.set(Math.sin(angle) * radius, 4.1 * sc, -Math.cos(angle) * radius);
      dummy.rotation.set(((i % 3) - 1) * 0.06, i * 1.15, ((i % 2) - 0.5) * 0.08);
      dummy.scale.set(sc * 1.25, sc * 1.1, sc * 1.15);
      dummy.updateMatrix();
      calderaPeaks.setMatrixAt(i, dummy.matrix);
    }
    calderaPeaks.computeBoundingSphere();
    group.add(calderaPeaks);
  } else if (level.id === 7) {
    // Colonial sugar factory perimeter: weathered brick walls & sparse dead trees
    const wallSegments = 20;
    const wallGeo = trackGeo(new THREE.BoxGeometry(3.8, 4.6, 0.7));
    const factoryWall = new THREE.InstancedMesh(wallGeo, brickMat, wallSegments);
    for (let i = 0; i < wallSegments; i++) {
      const angle = -Math.PI * 0.75 + (i / (wallSegments - 1)) * (Math.PI * 1.5);
      const radius = 19.6 + (i % 3) * 1.6;
      const hScale = 0.75 + (i % 4) * 0.16;
      dummy.position.set(Math.sin(angle) * radius, 2.2 * hScale, -Math.cos(angle) * radius);
      dummy.rotation.set(0, -angle, ((i % 5) - 2) * 0.015);
      dummy.scale.set(1.0 + (i % 2) * 0.25, hScale, 1);
      dummy.updateMatrix();
      factoryWall.setMatrixAt(i, dummy.matrix);
    }
    factoryWall.computeBoundingSphere();
    group.add(factoryWall);

    const deadTreeCount = 12;
    const dTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.38, 6.2, 6));
    const dTrunks = new THREE.InstancedMesh(dTrunkGeo, barkMat, deadTreeCount);
    for (let i = 0; i < deadTreeCount; i++) {
      const angle = -Math.PI * 0.72 + (i / (deadTreeCount - 1)) * (Math.PI * 1.44);
      const radius = 22.5 + (i % 3) * 2.2;
      const sc = 0.9 + (i % 4) * 0.1;
      dummy.position.set(Math.sin(angle) * radius, 3.0 * sc, -Math.cos(angle) * radius);
      dummy.rotation.set(0, i * 0.8, ((i % 3) - 1) * 0.08);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      dTrunks.setMatrixAt(i, dummy.matrix);
    }
    dTrunks.computeBoundingSphere();
    group.add(dTrunks);
  } else {
    const perimeterCount = 36;
    const pTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.48, 5.8, 7));
    const pCrownGeo = trackGeo(new THREE.DodecahedronGeometry(2.15, 1));
    const pTrunks = new THREE.InstancedMesh(pTrunkGeo, barkMat, perimeterCount);
    const pCrowns = new THREE.InstancedMesh(pCrownGeo, foliageDarkMat, perimeterCount * 2);
    const colorTmp = new THREE.Color();
    for (let i = 0; i < perimeterCount; i++) {
      const angle = -Math.PI * 0.78 + (i / (perimeterCount - 1)) * (Math.PI * 1.56);
      const radius = 18.8 + (i % 5) * 2.4;
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius;
      const sc = 0.85 + ((i * 37) % 12) * 0.05;

      dummy.position.set(x, 2.75 * sc, z);
      dummy.rotation.set(0, i * 0.7, ((i % 3) - 1) * 0.06);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      pTrunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 5.1 * sc, z);
      dummy.rotation.set(0.1, i * 1.3, 0);
      dummy.scale.set(sc * 1.35, sc * 0.65, sc * 1.25);
      dummy.updateMatrix();
      pCrowns.setMatrixAt(i * 2, dummy.matrix);

      dummy.position.set(x + Math.sin(i) * 0.7, 6.4 * sc, z + Math.cos(i) * 0.6);
      dummy.rotation.set(-0.1, i * 0.8, 0.15);
      dummy.scale.set(sc * 0.95, sc * 0.6, sc * 0.95);
      dummy.updateMatrix();
      pCrowns.setMatrixAt(i * 2 + 1, dummy.matrix);

      const baseHue = level.id === 9 ? 0.74 : 0.36;
      const baseSat = level.id === 9 ? 0.24 : 0.35;
      colorTmp.setHSL(baseHue + (i % 3) * 0.025, baseSat, 0.16 + (i % 4) * 0.03);
      pCrowns.setColorAt(i * 2, colorTmp);
      colorTmp.setHSL(baseHue + (i % 3) * 0.025, baseSat + 0.03, 0.21 + (i % 3) * 0.03);
      pCrowns.setColorAt(i * 2 + 1, colorTmp);
    }
    pTrunks.computeBoundingSphere();
    pCrowns.computeBoundingSphere();
    if (pCrowns.instanceColor) pCrowns.instanceColor.needsUpdate = true;
    group.add(pTrunks);
    group.add(pCrowns);
  }

  const registerAnchor = (
    id: string,
    propType: PropAnchorType,
    x: number,
    z: number,
    peekX: number,
    peekY: number,
    peekZ: number,
    allowedPatterns: SpawnPattern[],
  ) => {
    const baseAngle = Math.atan2(x, -z);
    const distance = Math.hypot(x, z);
    spawnAnchors.push({
      id,
      propType,
      anchorPos: new THREE.Vector3(x, 0, z),
      peekOffset: new THREE.Vector3(peekX, peekY, peekZ),
      baseAngle,
      distance,
      allowedPatterns,
    });
  };

  // --- LEVEL-SPECIFIC 3D ARENA COMPOSITION (calibrated inside 135° view) ---
  if (level.id === 1) {
    // LEVEL 1: KUBURAN TUA
    const graves = [
      [-6.5, -5.8, 0.35, 0.98],
      [-3.3, -7.8, 0.18, 1.05],
      [0.0, -9.2, 0.0, 1.15],
      [3.5, -7.6, -0.22, 1.02],
      [6.6, -5.4, -0.45, 0.95],
      [-4.9, -11.8, 0.2, 1.15],
      [4.8, -11.6, -0.2, 1.15],
    ];
    graves.forEach(([gx, gz, ry, sc], i) => {
      group.add(createTombstone(gx, gz, ry, sc));
      registerAnchor(
        `grave_${i}`,
        'tombstone',
        gx,
        gz - 0.55,
        i % 2 === 0 ? 0.95 : -0.95,
        0,
        0.2,
        ['peek', 'emerge', 'fade'],
      );
    });
    // Perch for Kuntilanak / crows atop central & side tombstones
    registerAnchor('tomb_top_c', 'perched_tomb', 0.0, -9.2, 0, 1.82 * 1.15, 0.1, ['fade', 'teleport']);

    // Banana trees (Pohon Pisang) for Pocong!
    group.add(createBananaTree(-8.4, -7.4, 0.4, 1.08));
    group.add(createBananaTree(8.2, -7.2, -0.5, 1.1));
    registerAnchor('banana_l', 'banana', -8.4, -7.9, 1.15, 0, 0.75, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 8.2, -7.7, -1.15, 0, 0.75, ['peek', 'emerge']);

    group.add(createBanyanTree(-10.2, -10.8, 1.15));
    registerAnchor('banyan_l', 'banyan', -9.6, -10.0, 1.7, 0, 1.0, ['peek', 'fade', 'teleport']);

    group.add(createKambojaTree(9.6, -10.6, -0.6, 1.12));
    registerAnchor('kamboja_r', 'tree', 9.2, -10.0, -1.35, 0.2, 0.9, ['peek', 'float', 'fade']);
    registerAnchor('kamboja_branch', 'perched_tree', 9.4, -10.2, -0.65, 2.75, 0.55, ['float', 'fade']);

    const bushes = [
      [-4.8, -4.6, 0.9],
      [5.0, -4.5, 0.95],
      [-1.9, -11.4, 1.1],
      [2.1, -11.6, 1.05],
    ];
    bushes.forEach(([bx, bz, sc], i) => {
      group.add(createBush(bx, bz, sc));
      registerAnchor(`bush_${i}`, 'bush', bx, bz - 0.5, i % 2 === 0 ? 0.9 : -0.9, 0, 0.4, ['peek', 'emerge', 'run']);
    });

    group.add(createRockCluster(-2.2, -4.9, 0.85));
    group.add(createRockCluster(2.6, -5.2, 0.9));
    group.add(createOilLamp(-4.2, -5.8, true));
    group.add(createOilLamp(4.3, -5.6, true));
    group.add(createOilLamp(0.2, -11.0, true));

    // Perched crows & crawling ground snakes
    createPerchedCrow(-3.3, 1.78, -7.8, 0.4, 0.5);
    createPerchedCrow(6.6, 1.68, -5.4, -0.6, 2.1);
  } else if (level.id === 2) {
    // LEVEL 2: HUTAN ANGKER
    const trees = [
      [-7.8, -6.8, 0.2, 1.15],
      [-3.8, -9.6, 1.1, 1.25],
      [3.9, -9.4, -0.7, 1.2],
      [7.9, -6.6, -1.2, 1.1],
      [0.0, -13.2, 0.4, 1.35],
    ];
    trees.forEach(([tx, tz, ry, sc], i) => {
      if (i % 2 === 0) group.add(createBanyanTree(tx, tz, sc * 0.95));
      else group.add(createKambojaTree(tx, tz, ry, sc));
      registerAnchor(
        `tree_${i}`,
        'tree',
        tx,
        tz - 0.6,
        i % 2 === 0 ? 1.35 : -1.35,
        i % 2 === 0 ? 0.4 : 0,
        0.9,
        ['peek', 'float', 'fade', 'teleport'],
      );
    });
    // Tree branch perches for Kuntilanak
    registerAnchor('branch_l', 'perched_tree', -3.8, -9.4, 0.45, 2.8, 0.6, ['float', 'fade']);
    registerAnchor('branch_r', 'perched_tree', 3.9, -9.2, -0.45, 2.8, 0.6, ['float', 'fade']);

    // Banana trees (Pohon Pisang) for Pocong!
    group.add(createBananaTree(-9.6, -5.8, 0.5, 1.1));
    group.add(createBananaTree(9.6, -5.6, -0.6, 1.1));
    group.add(createBananaTree(-1.8, -8.2, 0.2, 1.0));
    registerAnchor('banana_l', 'banana', -9.6, -6.2, 1.1, 0, 0.7, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 9.6, -6.0, -1.1, 0, 0.7, ['peek', 'emerge']);
    registerAnchor('banana_c', 'banana', -1.8, -8.5, 0.95, 0, 0.6, ['peek', 'emerge']);

    const bushes = [
      [-5.2, -4.9, 1.05],
      [0.0, -6.4, 1.0],
      [5.4, -4.9, 1.05],
      [-7.0, -9.5, 1.15],
      [7.1, -9.2, 1.15],
    ];
    bushes.forEach(([bx, bz, sc], i) => {
      group.add(createBush(bx, bz, sc));
      registerAnchor(`bush_${i}`, 'bush', bx, bz - 0.4, i % 2 === 0 ? 1.0 : -1.0, 0, 0.5, ['peek', 'run', 'emerge']);
    });

    group.add(createRockCluster(-2.8, -5.2, 0.95));
    group.add(createRockCluster(3.1, -5.4, 1.0));
    group.add(createOilLamp(-2.8, -6.2, true));
    group.add(createOilLamp(2.9, -6.2, true));
    group.add(createOilLamp(-7.6, -4.5, true));
    createPerchedCrow(-7.8, 2.75, -6.8, 0.5, 1.2);
  } else if (level.id === 3) {
    // LEVEL 3: DESA MISTIS
    group.add(createJogloHouse(-6.8, -11.4, 0.45));
    registerAnchor('joglo_door', 'joglo', -6.4, -9.8, 1.4, 0, 1.2, ['peek', 'emerge', 'fade']);
    registerAnchor('joglo_side', 'joglo', -4.0, -10.5, 1.1, 0.2, 0.8, ['peek', 'run', 'jumpscare']);

    group.add(createJogloHouse(7.2, -11.2, -0.48));
    registerAnchor('pendopo_door', 'joglo', 6.8, -9.6, -1.4, 0, 1.2, ['peek', 'float', 'fade']);

    group.add(createOldWell(0.2, -7.8));
    registerAnchor('sumur_tua', 'well', -0.95, -8.3, -0.6, 0, 0.5, ['emerge', 'peek', 'teleport']);
    registerAnchor('well_side_r', 'well', 1.45, -8.2, 0.55, 0, 0.5, ['peek', 'emerge']);
    registerAnchor('joglo_roof_l', 'perched_tomb', -6.8, -11.4, 0, 3.05, 0.4, ['fade', 'float']);

    group.add(createBananaTree(-9.6, -6.6, 0.4, 1.08));
    group.add(createBananaTree(9.6, -6.5, -0.45, 1.08));
    registerAnchor('banana_l', 'banana', -9.6, -7.0, 1.1, 0, 0.7, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 9.6, -6.9, -1.1, 0, 0.7, ['peek', 'emerge']);

    group.add(createBambooFence(-3.6, -5.6, 0.35));
    group.add(createBambooFence(3.8, -5.5, -0.35));
    registerAnchor('fence_l', 'bush', -3.6, -6.2, 0.85, 0, 0.4, ['peek', 'run']);
    registerAnchor('fence_r', 'bush', 3.8, -6.2, -0.85, 0, 0.4, ['peek', 'run']);

    group.add(createKambojaTree(-8.4, -5.2, 0.4, 1.1));
    group.add(createKambojaTree(8.5, -5.1, -0.5, 1.1));
    registerAnchor('village_tree_l', 'tree', -8.2, -4.9, 1.2, 0.3, 0.8, ['float', 'fade']);
    registerAnchor('village_tree_r', 'tree', 8.2, -4.9, -1.2, 0.3, 0.8, ['float', 'fade']);
    registerAnchor('village_branch', 'perched_tree', -8.3, -5.1, 0.55, 2.75, 0.4, ['float', 'fade']);

    group.add(createBush(-1.6, -11.2, 1.1));
    group.add(createBush(1.9, -11.2, 1.1));
    registerAnchor('mid_bush_l', 'bush', -1.6, -11.4, 1.0, 0, 0.6, ['peek', 'teleport']);
    registerAnchor('mid_bush_r', 'bush', 1.9, -11.4, -1.0, 0, 0.6, ['peek', 'teleport']);

    group.add(createRockCluster(-1.9, -5.6, 0.85));
    group.add(createOilLamp(-2.4, -6.2, true));
    group.add(createOilLamp(2.5, -6.2, true));
    group.add(createOilLamp(-5.0, -9.2, true));
    group.add(createOilLamp(5.2, -9.0, true));
    createPerchedCrow(0.95, 2.28, -7.8, -0.3, 1.8);
  } else if (level.id === 4) {
    // LEVEL 4: HUTAN BERINGIN TERLARANG
    group.add(createBanyanTree(0, -11.8, 1.55));
    registerAnchor('giant_banyan_l', 'banyan', -1.4, -10.8, -1.5, 0.3, 1.2, ['peek', 'float', 'teleport']);
    registerAnchor('giant_banyan_r', 'banyan', 1.4, -10.8, 1.5, 0.3, 1.2, ['peek', 'float', 'jumpscare']);
    registerAnchor('banyan_branch_c', 'perched_tree', 0.2, -11.2, 0.5, 3.2, 1.0, ['float', 'fade']);

    group.add(createBanyanTree(-9.2, -8.5, 1.15));
    group.add(createBanyanTree(9.2, -8.2, 1.15));
    registerAnchor('banyan_side_l', 'banyan', -8.8, -8.0, 1.5, 0.2, 1.0, ['peek', 'fade', 'run']);
    registerAnchor('banyan_side_r', 'banyan', 8.8, -8.0, -1.5, 0.2, 1.0, ['peek', 'fade', 'run']);

    group.add(createBananaTree(-6.2, -9.2, 0.3, 1.05));
    group.add(createBananaTree(6.2, -9.0, -0.4, 1.05));
    registerAnchor('banana_l', 'banana', -6.2, -9.6, 1.05, 0, 0.65, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 6.2, -9.4, -1.05, 0, 0.65, ['peek', 'emerge']);

    const statues = [
      [-4.6, -6.4, 0.45, 0.95],
      [4.7, -6.3, -0.45, 0.95],
      [-7.2, -5.0, 0.65, 0.9],
      [7.3, -4.9, -0.65, 0.9],
    ];
    statues.forEach(([sx, sz, ry, sc], i) => {
      group.add(createStoneStatue(sx, sz, ry, sc));
      registerAnchor(`statue_${i}`, 'statue', sx, sz - 0.55, i % 2 === 0 ? 1.1 : -1.1, 0, 0.4, [
        'peek',
        'emerge',
        'teleport',
      ]);
    });
    registerAnchor('statue_top_l', 'perched_tomb', -4.6, -6.4, 0, 2.55, 0.2, ['fade', 'teleport']);

    group.add(createBush(-2.4, -5.2, 1.0));
    group.add(createBush(2.6, -5.1, 1.0));
    registerAnchor('root_bush_l', 'bush', -2.4, -5.6, 0.9, 0, 0.4, ['emerge', 'run']);
    registerAnchor('root_bush_r', 'bush', 2.6, -5.5, -0.9, 0, 0.4, ['emerge', 'run']);

    group.add(createRockCluster(-1.2, -6.2, 0.95));
    group.add(createRockCluster(1.5, -6.5, 0.9));
    group.add(createOilLamp(-4.0, -7.8, true));
    group.add(createOilLamp(4.1, -7.8, true));
    group.add(createOilLamp(0.0, -8.6, true));
    createPerchedCrow(-4.6, 2.7, -6.4, 0.35, 0.8);
  } else if (level.id === 5) {
    // LEVEL 5: KERAJAAN BUTO IJO
    group.add(createTempleGate(0, -12.8, 0));
    registerAnchor('boss_gate', 'gate', 0, -24.0, 0, 0, 12.0, ['emerge', 'fade']);

    group.add(createStoneStatue(-4.5, -10.8, 0.35, 1.2));
    group.add(createStoneStatue(4.5, -10.8, -0.35, 1.2));
    registerAnchor('guard_statue_l', 'statue', -4.5, -11.2, 1.35, 0, 0.6, ['peek', 'fade', 'teleport']);
    registerAnchor('guard_statue_r', 'statue', 4.5, -11.2, -1.35, 0, 0.6, ['peek', 'fade', 'teleport']);
    registerAnchor('statue_top_r', 'perched_tomb', 4.5, -10.8, 0, 2.95, 0.2, ['fade', 'teleport']);

    group.add(createStoneStatue(-7.8, -6.8, 0.55, 1.05));
    group.add(createStoneStatue(7.8, -6.8, -0.55, 1.05));
    registerAnchor('flank_statue_l', 'statue', -7.8, -7.1, 1.2, 0.2, 0.6, ['peek', 'run', 'jumpscare']);
    registerAnchor('flank_statue_r', 'statue', 7.8, -7.1, -1.2, 0.2, 0.6, ['peek', 'run', 'jumpscare']);

    group.add(createBananaTree(-9.6, -7.4, 0.4, 1.05));
    group.add(createBananaTree(9.6, -7.4, -0.4, 1.05));
    registerAnchor('banana_l', 'banana', -9.6, -7.8, 1.05, 0, 0.7, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 9.6, -7.8, -1.05, 0, 0.7, ['peek', 'emerge']);

    group.add(createBush(-5.8, -4.9, 1.0));
    group.add(createBush(5.9, -4.9, 1.0));
    registerAnchor('arena_bush_l', 'bush', -5.8, -5.3, 0.9, 0, 0.5, ['emerge', 'run']);
    registerAnchor('arena_bush_r', 'bush', 5.9, -5.3, -0.9, 0, 0.5, ['emerge', 'run']);

    group.add(createBanyanTree(-10.8, -10.2, 1.2));
    group.add(createBanyanTree(10.8, -10.2, 1.2));
    group.add(createRockCluster(-2.2, -6.8, 0.95));
    group.add(createRockCluster(2.3, -6.9, 0.95));

    group.add(createOilLamp(-2.9, -8.5, true));
    group.add(createOilLamp(2.9, -8.5, true));
    group.add(createOilLamp(-7.0, -5.0, true));
    group.add(createOilLamp(7.0, -5.0, true));
    createPerchedCrow(4.5, 3.3, -10.8, -0.4, 1.4);
  } else if (level.id === 6) {
    // LEVEL 6: RAWA KABUT KERAMAT
    group.add(createBambooBridge(0, -8.2, 0));
    registerAnchor('bridge_mid', 'bridge', -1.2, -8.6, 1.2, 0.25, 0.6, ['emerge', 'peek', 'run']);
    registerAnchor('bridge_far', 'bridge', 1.1, -11.4, -1.1, 0.25, 0.6, ['emerge', 'fade', 'teleport']);

    const mangroves = [
      [-6.8, -6.8, 1.15],
      [6.9, -6.6, 1.15],
      [-4.8, -11.4, 1.25],
      [5.0, -11.2, 1.22],
      [0.2, -14.2, 1.3],
    ];
    mangroves.forEach(([mx, mz, sc], i) => {
      group.add(createSwampTree(mx, mz, sc));
      registerAnchor(`mangrove_${i}`, 'mangrove', mx, mz - 0.5, i % 2 === 0 ? 1.25 : -1.25, 0.15, 0.8, [
        'peek',
        'float',
        'fade',
        'teleport',
      ]);
    });
    registerAnchor('mangrove_branch_l', 'perched_tree', -4.8, -11.2, 0.45, 2.75, 0.5, ['float', 'fade']);
    registerAnchor('mangrove_branch_r', 'perched_tree', 5.0, -11.0, -0.45, 2.75, 0.5, ['float', 'fade']);

    group.add(createBananaTree(-9.2, -5.6, 0.45, 1.05));
    group.add(createBananaTree(9.2, -5.5, -0.45, 1.05));
    registerAnchor('banana_l', 'banana', -9.2, -6.0, 1.1, 0, 0.7, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 9.2, -5.9, -1.1, 0, 0.7, ['peek', 'emerge']);

    const reeds = [
      [-2.8, -5.2, 1.1],
      [2.9, -5.3, 1.05],
      [-3.1, -8.9, 1.15],
      [3.2, -9.1, 1.1],
      [-7.8, -9.4, 1.2],
      [7.8, -9.2, 1.2],
    ];
    reeds.forEach(([rx, rz, sc], i) => {
      group.add(createReedCluster(rx, rz, sc));
      if (i < 4) {
        registerAnchor(`reed_${i}`, 'bush', rx, rz - 0.3, i % 2 === 0 ? 0.9 : -0.9, 0.1, 0.5, [
          'emerge',
          'peek',
          'run',
        ]);
      }
    });

    group.add(createOilLamp(-1.35, -5.2, true));
    group.add(createOilLamp(1.35, -10.8, true));
    group.add(createOilLamp(-5.8, -7.8, false));
    createPerchedCrow(-6.8, 3.8, -6.8, 0.4, 0.9);
  } else if (level.id === 7) {
    // LEVEL 7: PABRIK GULA KOLONIAL
    group.add(createSmokestack(-6.8, -12.6));
    registerAnchor('chimney_base', 'ruin', -5.4, -11.8, 1.4, 0, 0.8, ['peek', 'fade', 'teleport']);

    group.add(createBoilerTank(4.8, -10.2, -0.35));
    registerAnchor('boiler_r', 'boiler', 3.4, -9.8, -1.2, 0.1, 0.7, ['peek', 'emerge', 'jumpscare']);
    registerAnchor('boiler_top', 'perched_tomb', 4.8, -10.2, 0, 2.35, 0.2, ['fade', 'teleport']);

    group.add(createBrickArchWall(-6.4, -7.4, 0.42));
    group.add(createBrickArchWall(6.8, -6.8, -0.46));
    registerAnchor('arch_l', 'ruin', -6.2, -7.2, 1.2, 0, 0.8, ['peek', 'run', 'emerge']);
    registerAnchor('arch_r', 'ruin', 6.6, -6.6, -1.2, 0, 0.8, ['peek', 'run', 'emerge']);
    registerAnchor('arch_top_l', 'perched_tomb', -6.4, -7.4, 0, 3.95, 0.2, ['fade', 'float']);

    group.add(createCogwheelProp(-2.2, -8.8, 0.3, 1.15));
    group.add(createCogwheelProp(1.9, -11.8, -0.25, 1.35));
    registerAnchor('cog_mid', 'boiler', -1.2, -8.8, 1.1, 0, 0.6, ['peek', 'emerge', 'run']);

    group.add(createBananaTree(-9.6, -5.8, 0.4, 1.0));
    group.add(createBananaTree(9.6, -5.7, -0.4, 1.0));
    registerAnchor('banana_l', 'banana', -9.6, -6.2, 1.05, 0, 0.7, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 9.6, -6.1, -1.05, 0, 0.7, ['peek', 'emerge']);

    group.add(createBush(-3.6, -5.2, 0.95));
    group.add(createBush(3.7, -5.1, 0.95));
    registerAnchor('yard_bush_l', 'bush', -3.6, -5.5, 0.95, 0, 0.4, ['emerge', 'run']);
    registerAnchor('yard_bush_r', 'bush', 3.7, -5.4, -0.95, 0, 0.4, ['emerge', 'run']);

    group.add(createRockCluster(0.2, -6.6, 0.9));
    group.add(createOilLamp(-3.4, -6.4, true));
    group.add(createOilLamp(3.4, -6.4, true));
    group.add(createOilLamp(0.0, -10.8, false));
    createPerchedCrow(-6.4, 4.15, -7.4, 0.35, 1.1);
  } else if (level.id === 8) {
    // LEVEL 8: JEMBATAN GANTUNG JURANG
    group.add(createSuspensionBridge(0, -5.4, -14.8));
    registerAnchor('bridge_front', 'bridge', 0, -6.6, 0.85, 0.15, 0.4, ['peek', 'emerge', 'jumpscare']);
    registerAnchor('bridge_center', 'bridge', 0, -9.8, -0.85, -0.25, 0.4, ['float', 'fade', 'teleport']);
    registerAnchor('bridge_far', 'bridge', 0, -13.2, 0.8, 0.1, 0.4, ['emerge', 'float', 'fade']);
    registerAnchor('bridge_pylon_l', 'perched_tomb', -1.45, -5.4, 0, 2.95, 0.1, ['fade', 'teleport']);

    const spires = [
      [-6.8, -8.6, 8.2, 0.4],
      [7.0, -8.4, 8.6, -0.5],
      [-9.8, -12.4, 10.2, 0.8],
      [9.9, -12.2, 10.5, -0.7],
      [-4.8, -15.8, 7.6, 0.2],
      [5.0, -15.6, 7.8, -0.2],
    ];
    spires.forEach(([sx, sz, h, ry], i) => {
      group.add(createCliffSpire(sx, sz, h, ry, false));
      if (i < 4) {
        registerAnchor(`cliff_${i}`, 'cliff', sx, sz + 0.8, i % 2 === 0 ? 1.45 : -1.45, 0.4, 0.8, [
          'float',
          'fade',
          'teleport',
          'jumpscare',
        ]);
      }
    });

    group.add(createKambojaTree(-5.2, -4.4, 0.4, 1.05));
    group.add(createKambojaTree(5.3, -4.3, -0.45, 1.05));
    registerAnchor('cliff_tree_l', 'perched_tree', -5.2, -4.6, 0.55, 2.75, 0.5, ['float', 'fade']);
    registerAnchor('cliff_tree_r', 'perched_tree', 5.3, -4.5, -0.55, 2.75, 0.5, ['float', 'fade']);

    group.add(createBananaTree(-7.6, -4.2, 0.4, 0.95));
    group.add(createBananaTree(7.7, -4.2, -0.4, 0.95));
    registerAnchor('banana_l', 'banana', -7.6, -4.6, 1.1, 0, 0.6, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 7.7, -4.6, -1.1, 0, 0.6, ['peek', 'emerge']);

    group.add(createRockCluster(-2.8, -4.6, 0.85));
    group.add(createRockCluster(2.9, -4.7, 0.85));
    group.add(createOilLamp(-1.6, -5.0, true));
    group.add(createOilLamp(1.6, -5.0, true));
    createPerchedCrow(-1.45, 3.05, -5.4, 0.4, 1.7);
  } else if (level.id === 9) {
    // LEVEL 9: KOMPLEKS CANDI TERKUTUK
    group.add(createCandiTower(0, -13.2));
    registerAnchor('candi_door', 'candi', 0, -11.2, 1.35, 0.4, 1.0, ['emerge', 'fade', 'jumpscare']);
    registerAnchor('candi_top', 'perched_tomb', 0, -11.2, 0, 3.85, 0.5, ['fade', 'teleport']);

    const stupas = [
      [-5.2, -10.2, 1.15],
      [5.2, -10.2, 1.15],
      [-7.8, -6.8, 1.05],
      [7.8, -6.8, 1.05],
    ];
    stupas.forEach(([sx, sz, sc], i) => {
      group.add(createStupa(sx, sz, sc));
      registerAnchor(`stupa_${i}`, 'stupa', sx, sz - 0.5, i % 2 === 0 ? 1.25 : -1.25, 0, 0.6, [
        'peek',
        'fade',
        'teleport',
      ]);
    });
    registerAnchor('stupa_top_l', 'perched_tomb', -5.2, -10.2, 0, 3.05, 0.2, ['fade', 'teleport']);

    group.add(createStoneStatue(-3.2, -7.2, 0.35, 1.1));
    group.add(createStoneStatue(3.2, -7.2, -0.35, 1.1));
    registerAnchor('arca_l', 'statue', -3.2, -7.5, 1.1, 0, 0.5, ['peek', 'emerge', 'run']);
    registerAnchor('arca_r', 'statue', 3.2, -7.5, -1.1, 0, 0.5, ['peek', 'emerge', 'run']);

    group.add(createKambojaTree(-9.6, -9.8, 0.5, 1.18));
    group.add(createKambojaTree(9.6, -9.8, -0.5, 1.18));
    registerAnchor('candi_branch_l', 'perched_tree', -9.4, -9.8, 0.6, 2.95, 0.5, ['float', 'fade']);
    registerAnchor('candi_branch_r', 'perched_tree', 9.4, -9.8, -0.6, 2.95, 0.5, ['float', 'fade']);

    group.add(createBananaTree(-9.8, -5.8, 0.4, 1.02));
    group.add(createBananaTree(9.8, -5.8, -0.4, 1.02));
    registerAnchor('banana_l', 'banana', -9.8, -6.2, 1.05, 0, 0.7, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 9.8, -6.2, -1.05, 0, 0.7, ['peek', 'emerge']);

    group.add(createRockCluster(-1.8, -5.6, 0.9));
    group.add(createRockCluster(1.9, -5.8, 0.9));
    group.add(createOilLamp(-2.5, -8.8, true));
    group.add(createOilLamp(2.5, -8.8, true));
    group.add(createOilLamp(-5.8, -5.2, false));
    group.add(createOilLamp(5.8, -5.2, false));
    createPerchedCrow(3.2, 3.05, -7.2, -0.4, 0.7);
  } else {
    // LEVEL 10: KAWAH GUNUNG MERAPI GAIB (FINAL BOSS)
    group.add(createTempleGate(0, -12.8, 0));
    registerAnchor('boss_gate', 'gate', 0, -24.0, 0, 0, 12.0, ['emerge', 'fade']);

    group.add(createVolcanicFissure(-3.2, -8.2, 0.35, 5.4));
    group.add(createVolcanicFissure(3.3, -8.4, -0.38, 5.4));
    group.add(createVolcanicFissure(0.0, -6.5, 0.08, 4.0));

    const volcanicSpires = [
      [-5.6, -11.2, 7.6, 0.35],
      [5.7, -11.2, 7.8, -0.35],
      [-8.8, -7.8, 6.8, 0.55],
      [8.9, -7.8, 7.0, -0.55],
      [-10.4, -11.8, 9.2, 0.7],
      [10.4, -11.8, 9.4, -0.7],
    ];
    volcanicSpires.forEach(([vx, vz, h, ry], i) => {
      group.add(createCliffSpire(vx, vz, h, ry, true));
      if (i < 4) {
        registerAnchor(`spire_${i}`, 'volcano', vx, vz - 0.5, i % 2 === 0 ? 1.35 : -1.35, 0.2, 0.8, [
          'peek',
          'fade',
          'teleport',
          'jumpscare',
        ]);
      }
    });

    group.add(createStoneStatue(-4.4, -6.8, 0.4, 1.15));
    group.add(createStoneStatue(4.5, -6.8, -0.4, 1.15));
    registerAnchor('volcano_statue_l', 'statue', -4.4, -7.1, 1.2, 0, 0.5, ['peek', 'run', 'emerge']);
    registerAnchor('volcano_statue_r', 'statue', 4.5, -7.1, -1.2, 0, 0.5, ['peek', 'run', 'emerge']);
    registerAnchor('volcano_top_l', 'perched_tomb', -4.4, -6.8, 0, 2.95, 0.2, ['fade', 'teleport']);

    group.add(createBanyanTree(-9.2, -5.2, 1.05));
    group.add(createBanyanTree(9.2, -5.2, 1.05));
    registerAnchor('charred_branch_l', 'perched_tree', -8.8, -5.4, 0.55, 3.1, 0.5, ['float', 'fade']);
    registerAnchor('charred_branch_r', 'perched_tree', 8.8, -5.4, -0.55, 3.1, 0.5, ['float', 'fade']);

    group.add(createBananaTree(-6.8, -9.4, 0.35, 0.98));
    group.add(createBananaTree(6.8, -9.4, -0.35, 0.98));
    registerAnchor('banana_l', 'banana', -6.8, -9.8, 1.05, 0, 0.65, ['peek', 'emerge']);
    registerAnchor('banana_r', 'banana', 6.8, -9.8, -1.05, 0, 0.65, ['peek', 'emerge']);

    group.add(createRockCluster(-2.1, -5.2, 0.95));
    group.add(createRockCluster(2.2, -5.3, 0.95));
    group.add(createOilLamp(-2.8, -9.4, true));
    group.add(createOilLamp(2.8, -9.4, true));
    group.add(createOilLamp(-6.2, -5.1, false));
    group.add(createOilLamp(6.2, -5.1, false));
    createPerchedCrow(-4.4, 3.15, -6.8, 0.4, 1.5);
  }

  // Atmospheric mist pockets inside 135° outer flanks
  registerAnchor('mist_left', 'mist', -8.4, -5.4, 1.2, 0.3, 0.4, ['fade', 'float', 'run']);
  registerAnchor('mist_right', 'mist', 8.4, -5.4, -1.2, 0.3, 0.4, ['fade', 'float', 'run']);

  // Flying crows circling under the moonlit clouds + creeping ground reptiles (skip floating crawlers over swamp water & canyon chasm)
  createFlyingCrow(-2.5, -13.5, 7.5, 3.2, 7.4, 0.42, 0.2);
  createFlyingCrow(3.2, -16.5, 8.8, 3.8, 8.6, -0.35, 3.1);
  if (level.id !== 6 && level.id !== 8) {
    createGroundCrawler(-3.8, -6.0, 2.2, 1.1, 0.65, 0.4);
    createGroundCrawler(3.9, -6.2, 2.4, 1.2, -0.58, 2.5);
  }

  return {
    group,
    spawnAnchors,
    flickerLights,
    swayingObjects,
    cloudLayers,
    flyingCrows,
    perchedCrows,
    crawlers,
    moonMesh: moonGroup,
    starField,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
