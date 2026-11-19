import * as THREE from 'three';
import { GHOST_DEFINITIONS } from './levels';
import type { GhostType } from './types';

export interface GhostTextureEntry {
  texture: THREE.Texture;
  aspect: number; // width / height
}

export interface ProceduralTextureSet {
  groundStone: THREE.CanvasTexture;
  groundMoss: THREE.CanvasTexture;
  bumpNoise: THREE.CanvasTexture;
  barkColor: THREE.CanvasTexture;
  woodColor: THREE.CanvasTexture;
  softGlow: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  mistPuff: THREE.CanvasTexture;
  moonSurface: THREE.CanvasTexture;
  cloudLayer: THREE.CanvasTexture;
  leafTex: THREE.CanvasTexture;
  bananaLeafTex: THREE.CanvasTexture;
  roofShingle: THREE.CanvasTexture;
  stoneCarving: THREE.CanvasTexture;
  rainStreak: THREE.CanvasTexture;
  brickWall: THREE.CanvasTexture;
  rustedIron: THREE.CanvasTexture;
  lavaGlow: THREE.CanvasTexture;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const aniso = Math.min(maxAnisotropy, 4);

  // 1. Mossy soil & stone path ground (256x256 for fast upload & low VRAM)
  const [gCanvas, gCtx] = makeCanvas(256);
  gCtx.fillStyle = '#2d3b29';
  gCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 2 + Math.random() * 10;
    const shade = Math.random();
    gCtx.fillStyle =
      shade < 0.35
        ? 'rgba(58, 78, 50, 0.42)'
        : shade < 0.7
          ? 'rgba(42, 36, 28, 0.38)'
          : 'rgba(84, 108, 70, 0.28)';
    gCtx.beginPath();
    gCtx.arc(x, y, r, 0, Math.PI * 2);
    gCtx.fill();
  }
  const groundMoss = new THREE.CanvasTexture(gCanvas);
  groundMoss.colorSpace = THREE.SRGBColorSpace;
  groundMoss.wrapS = groundMoss.wrapT = THREE.RepeatWrapping;
  groundMoss.repeat.set(12, 12);
  groundMoss.anisotropy = aniso;

  // 2. Ancient Javanese stone slabs / temple floor (256x256)
  const [sCanvas, sCtx] = makeCanvas(256);
  sCtx.fillStyle = '#3a4248';
  sCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const offset = row % 2 === 0 ? 0 : 32;
      const x = (col * 64 + offset) % 256;
      const y = row * 64;
      const v = 58 + Math.floor(Math.random() * 26);
      sCtx.fillStyle = `rgb(${v}, ${v + 6}, ${v + 10})`;
      sCtx.fillRect(x + 2, y + 2, 60, 60);
      sCtx.strokeStyle = 'rgba(18, 25, 22, 0.8)';
      sCtx.lineWidth = 2;
      sCtx.strokeRect(x + 1, y + 1, 62, 62);
    }
  }
  for (let i = 0; i < 200; i++) {
    sCtx.fillStyle = Math.random() < 0.5 ? 'rgba(72, 105, 64, 0.22)' : 'rgba(20, 24, 28, 0.24)';
    sCtx.beginPath();
    sCtx.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 7, 0, Math.PI * 2);
    sCtx.fill();
  }
  const groundStone = new THREE.CanvasTexture(sCanvas);
  groundStone.colorSpace = THREE.SRGBColorSpace;
  groundStone.wrapS = groundStone.wrapT = THREE.RepeatWrapping;
  groundStone.repeat.set(10, 10);
  groundStone.anisotropy = aniso;

  // 3. Linear grayscale micro-relief bump map (128x128)
  const [bCanvas, bCtx] = makeCanvas(128);
  const imgData = bCtx.createImageData(128, 128);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const val = 90 + Math.floor(Math.random() * 90);
    imgData.data[i] = val;
    imgData.data[i + 1] = val;
    imgData.data[i + 2] = val;
    imgData.data[i + 3] = 255;
  }
  bCtx.putImageData(imgData, 0, 0);
  const bumpNoise = new THREE.CanvasTexture(bCanvas);
  bumpNoise.wrapS = bumpNoise.wrapT = THREE.RepeatWrapping;
  bumpNoise.repeat.set(6, 6);

  // 4. Tree bark texture (128x128)
  const [kCanvas, kCtx] = makeCanvas(128);
  kCtx.fillStyle = '#33261d';
  kCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 48; i++) {
    kCtx.fillStyle = i % 2 === 0 ? 'rgba(20,14,10,0.45)' : 'rgba(72,54,39,0.35)';
    kCtx.fillRect(Math.random() * 128, 0, 1 + Math.random() * 4, 128);
  }
  const barkColor = new THREE.CanvasTexture(kCanvas);
  barkColor.colorSpace = THREE.SRGBColorSpace;
  barkColor.wrapS = barkColor.wrapT = THREE.RepeatWrapping;
  barkColor.anisotropy = aniso;

  // 5. Javanese teak wood (Joglo, 128x128)
  const [wCanvas, wCtx] = makeCanvas(128);
  wCtx.fillStyle = '#4f331e';
  wCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    wCtx.fillStyle = y % 32 === 0 ? 'rgba(95,60,34,0.35)' : 'rgba(42,24,12,0.35)';
    wCtx.fillRect(0, y, 128, 15);
    wCtx.fillStyle = 'rgba(20,12,6,0.5)';
    wCtx.fillRect(0, y + 15, 128, 1);
  }
  const woodColor = new THREE.CanvasTexture(wCanvas);
  woodColor.colorSpace = THREE.SRGBColorSpace;
  woodColor.wrapS = woodColor.wrapT = THREE.RepeatWrapping;
  woodColor.anisotropy = aniso;

  // 6. Soft radial glow (64x64)
  const [fCanvas, fCtx] = makeCanvas(64);
  const grad = fCtx.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  fCtx.fillStyle = grad;
  fCtx.fillRect(0, 0, 64, 64);
  const softGlow = new THREE.CanvasTexture(fCanvas);
  softGlow.colorSpace = THREE.SRGBColorSpace;

  // 7. Radial dark contact shadow disc (64x64)
  const [cCanvas, cCtx] = makeCanvas(64);
  const cGrad = cCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  cGrad.addColorStop(0, 'rgba(0,0,0,0.75)');
  cGrad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  cGrad.addColorStop(1, 'rgba(0,0,0,0)');
  cCtx.fillStyle = cGrad;
  cCtx.fillRect(0, 0, 64, 64);
  const contactShadow = new THREE.CanvasTexture(cCanvas);

  // 8. Soft volumetric mist puff (64x64)
  const [mCanvas, mCtx] = makeCanvas(64);
  const mGrad = mCtx.createRadialGradient(32, 32, 4, 32, 32, 31);
  mGrad.addColorStop(0, 'rgba(210,235,230,0.52)');
  mGrad.addColorStop(0.55, 'rgba(175,210,205,0.22)');
  mGrad.addColorStop(1, 'rgba(150,190,185,0)');
  mCtx.fillStyle = mGrad;
  mCtx.fillRect(0, 0, 64, 64);
  const mistPuff = new THREE.CanvasTexture(mCanvas);
  mistPuff.colorSpace = THREE.SRGBColorSpace;

  // 9. Realistic Lunar Crater & Maria Surface for Full Moon (256x256)
  const [moonCanvas, moonCtx] = makeCanvas(256);
  moonCtx.fillStyle = '#e4e8ee';
  moonCtx.fillRect(0, 0, 256, 256);
  const maria = [
    [75, 85, 48, 0.24],
    [145, 70, 41, 0.21],
    [110, 145, 55, 0.22],
    [180, 130, 37, 0.19],
    [55, 155, 34, 0.18],
  ];
  for (const [mx, my, mr, ma] of maria) {
    const mg = moonCtx.createRadialGradient(mx, my, mr * 0.15, mx, my, mr);
    mg.addColorStop(0, `rgba(98, 108, 122, ${ma})`);
    mg.addColorStop(1, 'rgba(98, 108, 122, 0)');
    moonCtx.fillStyle = mg;
    moonCtx.beginPath();
    moonCtx.arc(mx, my, mr, 0, Math.PI * 2);
    moonCtx.fill();
  }
  for (let i = 0; i < 40; i++) {
    const cx = 16 + ((i * 97) % 224);
    const cy = 16 + ((i * 141) % 224);
    const cr = 2 + (i % 6) * 2.0;
    moonCtx.fillStyle = 'rgba(110, 118, 130, 0.28)';
    moonCtx.beginPath();
    moonCtx.arc(cx, cy, cr, 0, Math.PI * 2);
    moonCtx.fill();
  }
  const moonSurface = new THREE.CanvasTexture(moonCanvas);
  moonSurface.colorSpace = THREE.SRGBColorSpace;
  moonSurface.anisotropy = aniso;

  // 10. Overcast Wispy Night Cloud Texture (256x256)
  const [clCanvas, clCtx] = makeCanvas(256);
  clCtx.clearRect(0, 0, 256, 256);
  const cloudPuffs: Array<[number, number, number, number, string]> = [
    [58, 134, 58, 0.56, '78, 100, 136'],
    [115, 114, 72, 0.64, '104, 130, 172'],
    [168, 126, 62, 0.56, '88, 112, 152'],
    [140, 148, 56, 0.50, '48, 62, 90'],
    [95, 152, 52, 0.48, '44, 58, 84'],
    [202, 142, 46, 0.42, '72, 94, 128'],
    [42, 144, 44, 0.40, '68, 88, 120'],
    [122, 96, 52, 0.52, '192, 214, 245'],
    [164, 108, 40, 0.38, '175, 200, 236'],
  ];
  for (const [px, py, pr, pa, rgb] of cloudPuffs) {
    const cg = clCtx.createRadialGradient(px, py, pr * 0.14, px, py, pr);
    cg.addColorStop(0, `rgba(${rgb}, ${pa})`);
    cg.addColorStop(0.58, `rgba(${rgb}, ${pa * 0.52})`);
    cg.addColorStop(1, `rgba(${rgb}, 0)`);
    clCtx.fillStyle = cg;
    clCtx.beginPath();
    clCtx.arc(px, py, pr, 0, Math.PI * 2);
    clCtx.fill();
  }
  const cloudLayer = new THREE.CanvasTexture(clCanvas);
  cloudLayer.colorSpace = THREE.SRGBColorSpace;

  // 11. Falling Leaf Texture (alpha masked organic leaf)
  const [lfCanvas, lfCtx] = makeCanvas(64);
  lfCtx.clearRect(0, 0, 64, 64);
  lfCtx.fillStyle = '#8b9944';
  lfCtx.beginPath();
  lfCtx.moveTo(32, 6);
  lfCtx.quadraticCurveTo(54, 24, 32, 58);
  lfCtx.quadraticCurveTo(10, 24, 32, 6);
  lfCtx.fill();
  lfCtx.strokeStyle = '#576126';
  lfCtx.lineWidth = 2;
  lfCtx.beginPath();
  lfCtx.moveTo(32, 10);
  lfCtx.lineTo(32, 56);
  lfCtx.stroke();
  const leafTex = new THREE.CanvasTexture(lfCanvas);
  leafTex.colorSpace = THREE.SRGBColorSpace;

  // 12. Broad Banana Leaf Texture (128x128)
  const [blCanvas, blCtx] = makeCanvas(128);
  blCtx.clearRect(0, 0, 128, 128);
  blCtx.fillStyle = '#2f5f2e';
  blCtx.beginPath();
  blCtx.moveTo(64, 4);
  blCtx.bezierCurveTo(105, 24, 112, 92, 64, 124);
  blCtx.bezierCurveTo(16, 92, 23, 24, 64, 4);
  blCtx.fill();
  blCtx.strokeStyle = '#628e48';
  blCtx.lineWidth = 3;
  blCtx.beginPath();
  blCtx.moveTo(64, 7);
  blCtx.lineTo(64, 122);
  blCtx.stroke();
  blCtx.lineWidth = 1.2;
  blCtx.strokeStyle = 'rgba(135, 180, 95, 0.5)';
  for (let y = 20; y < 112; y += 12) {
    blCtx.beginPath();
    blCtx.moveTo(64, y);
    blCtx.lineTo(96, y - 8);
    blCtx.moveTo(64, y);
    blCtx.lineTo(32, y - 8);
    blCtx.stroke();
  }
  const bananaLeafTex = new THREE.CanvasTexture(blCanvas);
  bananaLeafTex.colorSpace = THREE.SRGBColorSpace;
  bananaLeafTex.anisotropy = aniso;

  // 13. Traditional Javanese Terracotta/Wood Roof Shingles (128x128)
  const [rfCanvas, rfCtx] = makeCanvas(128);
  rfCtx.fillStyle = '#3e2314';
  rfCtx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    const offset = row % 2 === 0 ? 0 : 8;
    for (let col = -1; col < 9; col++) {
      const x = col * 16 + offset;
      const shade = (row + col) % 3;
      rfCtx.fillStyle = shade === 0 ? '#4e2b19' : shade === 1 ? '#3b2012' : '#58321e';
      rfCtx.fillRect(x + 1, y + 1, 14, 14);
      rfCtx.fillStyle = 'rgba(18, 10, 5, 0.55)';
      rfCtx.fillRect(x, y + 14, 16, 2);
    }
  }
  const roofShingle = new THREE.CanvasTexture(rfCanvas);
  roofShingle.colorSpace = THREE.SRGBColorSpace;
  roofShingle.wrapS = roofShingle.wrapT = THREE.RepeatWrapping;
  roofShingle.repeat.set(4, 3);
  roofShingle.anisotropy = aniso;

  // 14. Carved Volcanic Andesite Masonry (Candi / Nisan relief, 128x128)
  const [scCanvas, scCtx] = makeCanvas(128);
  scCtx.fillStyle = '#485057';
  scCtx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 4; row++) {
    const y = row * 32;
    const shift = row % 2 === 0 ? 0 : 16;
    for (let col = -1; col < 4; col++) {
      const x = col * 32 + shift;
      const v = 64 + ((row * 7 + col * 13) % 18);
      scCtx.fillStyle = `rgb(${v}, ${v + 5}, ${v + 9})`;
      scCtx.fillRect(x + 2, y + 2, 28, 28);
      scCtx.strokeStyle = 'rgba(20, 26, 24, 0.75)';
      scCtx.lineWidth = 2;
      scCtx.strokeRect(x + 1, y + 1, 30, 30);
    }
  }
  for (let i = 0; i < 65; i++) {
    scCtx.fillStyle = i % 2 === 0 ? 'rgba(42, 74, 46, 0.28)' : 'rgba(18, 22, 24, 0.22)';
    scCtx.beginPath();
    scCtx.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 5, 0, Math.PI * 2);
    scCtx.fill();
  }
  const stoneCarving = new THREE.CanvasTexture(scCanvas);
  stoneCarving.colorSpace = THREE.SRGBColorSpace;
  stoneCarving.wrapS = stoneCarving.wrapT = THREE.RepeatWrapping;
  stoneCarving.anisotropy = aniso;

  // 15. Soft tapered drizzle streak texture (16x64)
  const rnCanvas = document.createElement('canvas');
  rnCanvas.width = 16;
  rnCanvas.height = 64;
  const rnCtx = rnCanvas.getContext('2d')!;
  const rnGrad = rnCtx.createLinearGradient(8, 0, 8, 64);
  rnGrad.addColorStop(0, 'rgba(195, 232, 255, 0)');
  rnGrad.addColorStop(0.28, 'rgba(210, 240, 255, 0.55)');
  rnGrad.addColorStop(0.85, 'rgba(225, 248, 255, 0.9)');
  rnGrad.addColorStop(1, 'rgba(225, 248, 255, 0)');
  rnCtx.fillStyle = rnGrad;
  rnCtx.fillRect(6, 0, 4, 64);
  const rainStreak = new THREE.CanvasTexture(rnCanvas);
  rainStreak.colorSpace = THREE.SRGBColorSpace;

  // 16. Colonial Weathered Red-Brick Masonry (Pabrik Gula, 128x128)
  const [bwCanvas, bwCtx] = makeCanvas(128);
  bwCtx.fillStyle = '#381e18';
  bwCtx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    const offset = row % 2 === 0 ? 0 : 16;
    for (let col = -1; col < 5; col++) {
      const x = col * 32 + offset;
      const rShade = 72 + ((row * 13 + col * 7) % 24);
      const gShade = 32 + ((row * 5 + col * 11) % 14);
      bwCtx.fillStyle = `rgb(${rShade}, ${gShade}, 24)`;
      bwCtx.fillRect(x + 2, y + 2, 28, 12);
    }
  }
  for (let i = 0; i < 45; i++) {
    bwCtx.fillStyle = i % 2 === 0 ? 'rgba(20, 28, 18, 0.34)' : 'rgba(12, 10, 10, 0.28)';
    bwCtx.beginPath();
    bwCtx.arc(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 6, 0, Math.PI * 2);
    bwCtx.fill();
  }
  const brickWall = new THREE.CanvasTexture(bwCanvas);
  brickWall.colorSpace = THREE.SRGBColorSpace;
  brickWall.wrapS = brickWall.wrapT = THREE.RepeatWrapping;
  brickWall.repeat.set(2, 2);
  brickWall.anisotropy = aniso;

  // 17. Rusted Riveted Industrial Iron (128x128)
  const [riCanvas, riCtx] = makeCanvas(128);
  riCtx.fillStyle = '#2c2522';
  riCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    riCtx.fillStyle = i % 3 === 0 ? 'rgba(116, 52, 24, 0.35)' : 'rgba(24, 24, 28, 0.36)';
    riCtx.beginPath();
    riCtx.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 9, 0, Math.PI * 2);
    riCtx.fill();
  }
  riCtx.strokeStyle = 'rgba(15, 14, 16, 0.7)';
  riCtx.lineWidth = 2;
  riCtx.strokeRect(2, 2, 124, 60);
  riCtx.strokeRect(2, 66, 124, 60);
  for (let rx = 12; rx < 124; rx += 26) {
    for (const ry of [10, 54, 74, 118]) {
      riCtx.fillStyle = '#4a3d36';
      riCtx.beginPath();
      riCtx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      riCtx.fill();
    }
  }
  const rustedIron = new THREE.CanvasTexture(riCanvas);
  rustedIron.colorSpace = THREE.SRGBColorSpace;
  rustedIron.wrapS = rustedIron.wrapT = THREE.RepeatWrapping;
  rustedIron.anisotropy = aniso;

  // 18. Volcanic Basalt & Magma Fissure Glow (128x128)
  const [lvCanvas, lvCtx] = makeCanvas(128);
  lvCtx.fillStyle = '#1b1110';
  lvCtx.fillRect(0, 0, 128, 128);
  const lGrad = lvCtx.createLinearGradient(0, 0, 128, 128);
  lGrad.addColorStop(0, '#ff430a');
  lGrad.addColorStop(0.45, '#ff8e1c');
  lGrad.addColorStop(0.7, '#ff3b05');
  lGrad.addColorStop(1, '#9e1900');
  lvCtx.strokeStyle = lGrad;
  lvCtx.lineWidth = 10;
  lvCtx.lineCap = 'round';
  lvCtx.beginPath();
  lvCtx.moveTo(8, 22);
  lvCtx.bezierCurveTo(44, 48, 72, 18, 120, 54);
  lvCtx.moveTo(14, 92);
  lvCtx.bezierCurveTo(54, 62, 82, 112, 118, 88);
  lvCtx.stroke();
  lvCtx.strokeStyle = '#ffd25a';
  lvCtx.lineWidth = 3.5;
  lvCtx.stroke();
  const lavaGlow = new THREE.CanvasTexture(lvCanvas);
  lavaGlow.colorSpace = THREE.SRGBColorSpace;
  lavaGlow.wrapS = lavaGlow.wrapT = THREE.RepeatWrapping;
  lavaGlow.anisotropy = aniso;

  return {
    groundStone,
    groundMoss,
    bumpNoise,
    barkColor,
    woodColor,
    softGlow,
    contactShadow,
    mistPuff,
    moonSurface,
    cloudLayer,
    leafTex,
    bananaLeafTex,
    roofShingle,
    stoneCarving,
    rainStreak,
    brickWall,
    rustedIron,
    lavaGlow,
  };
}

export async function loadGhostTextures(
  maxAnisotropy: number,
  onOneLoaded?: (url: string, ok: boolean) => void,
): Promise<Record<GhostType, GhostTextureEntry>> {
  const loader = new THREE.TextureLoader();
  const types = Object.keys(GHOST_DEFINITIONS) as GhostType[];
  const result = {} as Record<GhostType, GhostTextureEntry>;

  await Promise.all(
    types.map(
      (type) =>
        new Promise<void>((resolve) => {
          const url = GHOST_DEFINITIONS[type].imageUrl;
          loader.load(
            url,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = Math.min(maxAnisotropy, 4);
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              tex.magFilter = THREE.LinearFilter;
              const img = tex.image as HTMLImageElement;
              const aspect = img && img.height > 0 ? img.width / img.height : 0.5;
              result[type] = { texture: tex, aspect };
              onOneLoaded?.(url, true);
              resolve();
            },
            undefined,
            () => {
              // Graceful procedural fallback canvas if image fails
              const [c, ctx] = makeCanvas(128);
              ctx.fillStyle = '#8ef5b4';
              ctx.beginPath();
              ctx.arc(64, 64, 48, 0, Math.PI * 2);
              ctx.fill();
              const tex = new THREE.CanvasTexture(c);
              tex.colorSpace = THREE.SRGBColorSpace;
              result[type] = { texture: tex, aspect: 0.6 };
              onOneLoaded?.(url, false);
              resolve();
            },
          );
        }),
    ),
  );

  return result;
}
