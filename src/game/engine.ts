import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AUDIO_MANIFEST, type GameAudioManager } from './audio';
import { EffectsManager } from './effects';
import { buildLevelEnvironment, type BuiltEnvironment, type SpawnAnchor } from './environments';
import { GhostManager, type ActiveGhost } from './ghosts';
import { GHOST_DEFINITIONS, LEVEL_CONFIGS, getLevelConfig } from './levels';
import {
  BASE_CAMERA_FOV_DEG,
  FIXED_STAGE_HEIGHT,
  FIXED_STAGE_WIDTH,
  KILL_CAM_BOSS_DURATION_SEC,
  KILL_CAM_REGULAR_DURATION_SEC,
  MAX_PITCH_RAD,
  MAX_YAW_RAD,
  VHS_MYSTICAL_PRESET,
  WIDE_LENS_DISTORTION,
  applyGhostDamage,
  buildSpawnTypeDeck,
  calculateAccuracy,
  calculateCompletionBonuses,
  calculateHitScore,
  checkLevelOutcome,
  clampCameraAngles,
  computeKillCamFocusAngles,
  computeKillCamState,
  computeRandomizedWaveParams,
  computeScreenShake,
  computeThunderSyncParams,
  computeTouchDragAngles,
  getDifficultyModifiers,
  mapScreenNdcToWideLensNdc,
  shuffleArray,
} from './rules';
import { createProceduralTextures, loadGhostTextures, type GhostTextureEntry, type ProceduralTextureSet } from './textures';
import type {
  GameOutcome,
  GamePhase,
  GameSettings,
  GhostType,
  HudSnapshot,
  LevelConfig,
  LoadProgress,
  ScorePopupEvent,
  SpawnPattern,
} from './types';
import { ToyBlaster } from './weapon';
import { createVhsFilmPass } from './vhsShader';

const HIGH_SCORE_KEY = 'berburu_hantu_highscore_v1';

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onScorePopup: (popup: ScorePopupEvent) => void;
  onHitMarker: (isKill: boolean, screenX: number, screenY: number) => void;
  onPlayerHit?: (ghostType: GhostType, isBoss: boolean) => void;
  onPhaseChange: (phase: GamePhase, outcome: GameOutcome) => void;
  onLoadProgress: (progress: LoadProgress) => void;
}

export class GameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly outputPass: OutputPass;
  private readonly vhsPass: ShaderPass;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly isSoftwareGl: boolean;
  private readonly textures: ProceduralTextureSet;
  private readonly effects: EffectsManager;
  private readonly blaster: ToyBlaster;
  private readonly resizeObserver: ResizeObserver;

  private ghostTextures: Record<GhostType, GhostTextureEntry> | null = null;
  private ghostManager: GhostManager | null = null;
  private currentEnv: BuiltEnvironment | null = null;

  private readonly keyLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly lightningLight: THREE.DirectionalLight;
  private readonly envMapTexture: THREE.Texture;
  private readonly baseSkyColor = new THREE.Color();
  private readonly flashSkyColor = new THREE.Color(0x4e6f99);
  private readonly baseFogColor = new THREE.Color();
  private baseHemiIntensity = 0.42;
  private baseKeyIntensity = 0.96;
  private thunderTimeoutId: number | null = null;

  private phase: GamePhase = 'loading';
  private outcome: GameOutcome = null;
  private level: LevelConfig = getLevelConfig(1);
  private settings: GameSettings;

  // Camera state (yaw: -36..+36 deg, pitch: -15..+15 deg)
  private targetYaw = 0;
  private targetPitch = 0;
  private currentYaw = 0;
  private currentPitch = 0;
  private shakeTrauma = 0;
  private shakeYawSmoothed = 0;
  private shakePitchSmoothed = 0;
  private shakeFovSmoothed = 0;
  private vhsGlitchTrauma = 0;
  private screenFlashAlpha = 0;
  private attackFlashAlpha = 0;
  private lastCameraFov = BASE_CAMERA_FOV_DEG;

  // Aiming state (normalized -1..1 for crosshair)
  private pointerNdc = new THREE.Vector2(0, 0);
  private keysHeld = new Set<string>();
  private touchGesture: {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    isDragging: boolean;
  } | null = null;

  // Gameplay counters
  private score = 0;
  private highScore = 0;
  private combo = 0;
  private maxCombo = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private kills = 0;
  private timeLeft = 75;
  private maxAmmo = 12;
  private ammo = 12;
  private reloadTimer = 0;
  private spawnTimer = 0.8;
  private spawnDeck: GhostType[] = [];
  private lastAnchorId: string | null = null;
  private bossKills = 0;
  private bossRespawnTimer = 0;
  private accuracyBonus = 0;
  private comboBonus = 0;
  private ghostAttacksReceived = 0;

  private simTime = 0;
  private hitstopTimer = 0;
  private killCamRemaining = 0;
  private killCamDuration = KILL_CAM_REGULAR_DURATION_SEC;
  private killCamIsBoss = false;
  private killCamGhostName = '';
  private readonly killCamTargetPos = new THREE.Vector3(0, 1.5, -8);
  private killCamFovSmoothed = 0;
  private killCamYawSmoothed = 0;
  private killCamPitchSmoothed = 0;
  private killCamVignetteSmoothed = 0;
  private lastKillCamHudActive = false;
  private lastHudPush = 0;
  private lastHoverCheck = 0;
  private popupSeq = 1;
  private disposed = false;
  private frameId = 0;
  private lastFrameMs = performance.now();
  private envObjectsReady = false;

  // Reusable math scratch objects (zero GC in loop)
  private readonly _vec3A = new THREE.Vector3();
  private readonly _rayNdc = new THREE.Vector2();

  constructor(
    private readonly container: HTMLDivElement,
    private readonly audio: GameAudioManager,
    initialSettings: GameSettings,
    private readonly callbacks: EngineCallbacks,
    initialLevelId = 1,
  ) {
    this.settings = { ...initialSettings };
    this.highScore = Number(window.localStorage.getItem(HIGH_SCORE_KEY) || '0') || 0;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = FIXED_STAGE_WIDTH;
    const height = FIXED_STAGE_HEIGHT;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.dataset.testid = 'game-canvas';

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV_DEG, width / height, 0.1, 120);
    this.camera.position.set(0, 1.65, 0);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Subtle nocturnal PBR reflections via PMREM RoomEnvironment (low intensity to preserve midnight mood)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envMapTexture = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envMapTexture;
    this.scene.environmentIntensity = 0.2;
    roomEnv.dispose();
    pmrem.dispose();

    // Sculpted nocturnal moonlight 3-point rig
    this.hemiLight = new THREE.HemisphereLight(0x1b3048, 0x0d140d, 0.42);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0x9bb8f5, 0.96);
    this.keyLight.position.set(6, 16, 8);
    this.keyLight.castShadow = false;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x6398e6, 0.46);
    this.rimLight.position.set(-8, 11, -14);
    this.rimLight.castShadow = false;
    this.scene.add(this.rimLight);

    this.lightningLight = new THREE.DirectionalLight(0xbef5ff, 0);
    this.lightningLight.position.set(-6, 20, -14);
    this.scene.add(this.lightningLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.effects = new EffectsManager(this.textures);
    this.scene.add(this.effects.group);

    this.blaster = new ToyBlaster(this.scene, this.textures);
    this.blaster.group.visible = false;
    this.camera.add(this.blaster.group);

    this.loadLevelScene(initialLevelId);

    // Classic 90s VHS Glitch, Grainy Film & Wide-Lens barrel distortion post-processing pipeline
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.vhsPass = createVhsFilmPass(width, height);
    this.vhsPass.uniforms.uLensDistortion.value = WIDE_LENS_DISTORTION;
    this.composer.addPass(this.vhsPass);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.bindEvents();
    this.initAssets();
    this.startLoop();
  }

  private async initAssets(): Promise<void> {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const failedAssets: string[] = [];
    let texLoaded = 0;
    let previewLoaded = 0;
    let audioLoaded = 0;
    const totalAudio = Object.keys(AUDIO_MANIFEST).length;
    const totalPreviews = LEVEL_CONFIGS.length;
    const totalAll = totalAudio + 5 + totalPreviews;

    const reportProgress = (ready: boolean, stageLabel?: string) => {
      const loaded = Math.min(totalAll, texLoaded + previewLoaded + audioLoaded);
      this.callbacks.onLoadProgress({
        loaded,
        total: totalAll,
        percent: ready ? 100 : Math.round((loaded / totalAll) * 100),
        ready,
        failedAssets: [...failedAssets],
        stageLabel: stageLabel ?? (ready ? 'Semua aset Nusantara siap!' : 'Memuat aset audio & visual Nusantara...'),
      });
    };

    reportProgress(false, 'Menyiapkan arena 3D & memuat aset Nusantara...');

    const texPromise = loadGhostTextures(maxAniso, (url, ok) => {
      texLoaded += 1;
      if (!ok) failedAssets.push(url);
      reportProgress(false, 'Memuat karakter hantu Nusantara...');
    }).then((loadedGhosts) => {
      if (this.disposed) return loadedGhosts;
      this.ghostTextures = loadedGhosts;
      this.ghostManager = new GhostManager(
        loadedGhosts,
        this.textures.contactShadow,
        this.textures.softGlow,
      );
      this.scene.add(this.ghostManager.group);
      if (this.phase === 'playing' && this.ghostManager.activeGhosts.length === 0 && this.currentEnv) {
        if (this.level.hasBoss) {
          this.spawnBossGhost();
        }
        this.spawnNextGhost(true);
        this.pushHud(true);
      }
      if (!this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.camera);
      }
      return loadedGhosts;
    });

    const previewPromise = Promise.all(
      LEVEL_CONFIGS.map(
        (lvl) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              previewLoaded += 1;
              reportProgress(false, 'Memuat pratinjau arena mistis...');
              resolve();
            };
            img.onerror = () => {
              previewLoaded += 1;
              failedAssets.push(lvl.previewImage);
              reportProgress(false, 'Memuat pratinjau arena mistis...');
              resolve();
            };
            img.src = lvl.previewImage;
          }),
      ),
    );

    const audioPromise = this.audio.preloadAll((p) => {
      audioLoaded = p.loaded;
      reportProgress(false, 'Memuat musik gamelan & suara hantu...');
    });

    const [audioResult] = await Promise.all([audioPromise, texPromise, previewPromise]);
    if (this.disposed) return;

    failedAssets.push(...audioResult.failedAssets);
    reportProgress(true, 'Semua aset Nusantara siap dimainkan!');
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private onWindowBlur = (): void => {
    this.keysHeld.clear();
    this.touchGesture = null;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
      if (this.phase === 'playing') e.preventDefault();
    }
    this.keysHeld.add(e.code);

    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.phase === 'playing') {
        this.pauseGame();
      } else if (this.phase === 'paused') {
        this.resumeGame();
      }
    } else if (e.code === 'KeyR' && this.phase === 'playing') {
      this.triggerReload();
    } else if (e.code === 'Space' && this.phase === 'playing') {
      this.fireAtNdc(this.pointerNdc.x, this.pointerNdc.y);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (e.pointerType === 'touch') {
      if (this.phase !== 'playing' || !this.touchGesture || e.pointerId !== this.touchGesture.pointerId) {
        return;
      }
      const totalDist = Math.hypot(
        e.clientX - this.touchGesture.startX,
        e.clientY - this.touchGesture.startY,
      );
      if (!this.touchGesture.isDragging && totalDist > 8) {
        this.touchGesture.isDragging = true;
      }
      if (this.touchGesture.isDragging) {
        const dx = e.clientX - this.touchGesture.lastX;
        const dy = e.clientY - this.touchGesture.lastY;
        const { yawDelta, pitchDelta } = computeTouchDragAngles(
          dx,
          dy,
          rect.width,
          rect.height,
          this.settings.cameraSensitivity,
        );
        const clamped = clampCameraAngles(this.targetYaw + yawDelta, this.targetPitch + pitchDelta);
        this.targetYaw = clamped.yaw;
        this.targetPitch = clamped.pitch;
        this.blaster.addCameraSway(yawDelta * 0.85, pitchDelta * 0.85);
      }
      this.touchGesture.lastX = e.clientX;
      this.touchGesture.lastY = e.clientY;
      return;
    }

    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const dx = nx - this.pointerNdc.x;
    const dy = ny - this.pointerNdc.y;

    this.pointerNdc.set(nx, ny);

    if (this.phase === 'playing' && this.settings.pointerAimEnabled) {
      // Smooth edge-follow + center blaster aim tracking across 72° arc
      this.blaster.addCameraSway(dx * 2.5, dy * 2.5);
      this.blaster.setAimNdc(nx, ny);
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    void this.audio.unlock();
    if (this.phase !== 'playing') return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (e.pointerType === 'touch') {
      if (this.touchGesture !== null) return;
      this.touchGesture = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        isDragging: false,
      };
      try {
        this.renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
      return;
    }

    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const sx = ((e.clientX - rect.left) / rect.width) * FIXED_STAGE_WIDTH;
    const sy = ((e.clientY - rect.top) / rect.height) * FIXED_STAGE_HEIGHT;

    this.pointerNdc.set(nx, ny);
    this.blaster.setAimNdc(nx, ny);

    // Raycast directly at pointer coordinates (adjusted for wide-lens barrel distortion)
    this.fireAtNdc(nx, ny, sx, sy);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    if (!this.touchGesture || e.pointerId !== this.touchGesture.pointerId) return;

    const wasDragging = this.touchGesture.isDragging;
    this.touchGesture = null;

    if (e.type === 'pointerup' && !wasDragging && this.phase === 'playing') {
      const rect = this.renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const sx = ((e.clientX - rect.left) / rect.width) * FIXED_STAGE_WIDTH;
      const sy = ((e.clientY - rect.top) / rect.height) * FIXED_STAGE_HEIGHT;
      this.blaster.setAimNdc(nx, ny);
      this.fireAtNdc(nx, ny, sx, sy);
    }
  };

  public updateSettings(next: GameSettings): void {
    this.settings = { ...next };
    this.audio.updateSettings(next);
    this.applyLightingForMode();
  }

  private applyLightingForMode(): void {
    const mod = getDifficultyModifiers(this.settings.scareMode);
    this.baseHemiIntensity = this.level.hemiIntensity * mod.ambientBoost;
    this.baseKeyIntensity = this.level.keyLightIntensity * (this.settings.scareMode === 'santai' ? 1.25 : 1.0);
    this.hemiLight.intensity = this.baseHemiIntensity;
    this.keyLight.intensity = this.baseKeyIntensity;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = this.level.fogDensity * mod.fogScale;
    }
  }

  private loadLevelScene(levelId: number): void {
    this.level = getLevelConfig(levelId);
    if (this.currentEnv) {
      this.scene.remove(this.currentEnv.group);
      this.currentEnv.dispose();
    }
    this.currentEnv = buildLevelEnvironment(this.level, this.textures, this.isSoftwareGl);
    this.scene.add(this.currentEnv.group);
    this.envObjectsReady = true;

    this.baseSkyColor.setHex(this.level.skyColor);
    this.baseFogColor.setHex(this.level.fogColor);
    this.scene.background = new THREE.Color(this.level.skyColor);
    this.scene.fog = new THREE.FogExp2(this.level.fogColor, this.level.fogDensity);
    this.hemiLight.color.setHex(this.level.hemiSkyColor);
    this.hemiLight.groundColor.setHex(this.level.hemiGroundColor);
    this.keyLight.color.setHex(this.level.keyLightColor);
    this.applyLightingForMode();
  }

  public enterTitleFromSplash(): void {
    if (this.phase === 'playing' || this.phase === 'paused' || this.phase === 'gameover') return;
    this.phase = 'title';
    this.outcome = null;
    document.body.dataset.state = 'title';
    void this.audio.playMusic('main-menu');
    void this.audio.playAmbience('night-ambience');
    this.callbacks.onPhaseChange('title', null);
    this.pushHud(true);
  }

  public startLevel(levelId: number): void {
    void this.audio.unlock();
    this.loadLevelScene(levelId);
    this.ghostManager?.clearAll();

    this.phase = 'playing';
    this.outcome = null;
    document.body.dataset.state = 'playing';
    this.blaster.group.visible = true;

    this.targetYaw = 0;
    this.targetPitch = 0;
    this.currentYaw = 0;
    this.currentPitch = 0;
    this.shakeTrauma = 0;
    this.attackFlashAlpha = 0;
    this.killCamRemaining = 0;
    this.killCamFovSmoothed = 0;
    this.killCamYawSmoothed = 0;
    this.killCamPitchSmoothed = 0;
    this.killCamVignetteSmoothed = 0;
    this.lastKillCamHudActive = false;
    document.body.dataset.killCam = '0';
    this.keysHeld.clear();

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.kills = 0;
    this.timeLeft = this.level.durationSec;
    this.ammo = this.maxAmmo;
    this.reloadTimer = 0;
    this.spawnDeck = buildSpawnTypeDeck(this.level.allowedGhosts, 3);
    this.lastAnchorId = null;
    this.spawnTimer = 0.45 + Math.random() * 0.45;
    this.bossKills = 0;
    this.bossRespawnTimer = 0;
    this.accuracyBonus = 0;
    this.comboBonus = 0;
    this.ghostAttacksReceived = 0;

    void this.audio.playMusic(this.level.musicKey);
    void this.audio.playAmbience(this.level.ambientAudioKey);

    this.callbacks.onPhaseChange('playing', null);

    // Spawn an immediate visible ghost (plus Boss Buto Ijo on Level 5) right away
    if (this.ghostManager && this.currentEnv) {
      if (this.level.hasBoss) {
        this.spawnBossGhost();
      }
      this.spawnNextGhost(true);
    }
    this.pushHud(true);
  }

  public pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    document.body.dataset.state = 'paused';
    this.keysHeld.clear();
    this.touchGesture = null;
    this.audio.pauseLoops();
    this.callbacks.onPhaseChange('paused', null);
    this.pushHud(true);
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    this.audio.resumeLoops();
    this.callbacks.onPhaseChange('playing', null);
    this.pushHud(true);
  }

  public returnToTitle(): void {
    this.phase = 'title';
    this.outcome = null;
    document.body.dataset.state = 'title';
    this.blaster.group.visible = false;
    this.ghostManager?.clearAll();
    this.keysHeld.clear();
    this.touchGesture = null;
    this.shakeTrauma = 0;
    this.attackFlashAlpha = 0;
    this.killCamRemaining = 0;
    this.killCamFovSmoothed = 0;
    this.killCamYawSmoothed = 0;
    this.killCamPitchSmoothed = 0;
    this.killCamVignetteSmoothed = 0;
    this.lastKillCamHudActive = false;
    document.body.dataset.killCam = '0';
    void this.audio.playMusic('main-menu');
    void this.audio.playAmbience('night-ambience');
    this.callbacks.onPhaseChange('title', null);
    this.pushHud(true);
  }

  public triggerReload(): void {
    if (this.reloadTimer > 0 || this.ammo >= this.maxAmmo) return;
    this.reloadTimer = 0.72;
    this.blaster.triggerReload();
    void this.audio.playSfx('weapon/reload', { volume: 0.75 });
    this.pushHud(true);
  }

  private triggerGhostAttackOnPlayer(ghostType: GhostType, isBoss: boolean, pan: number, intensity: number): void {
    if (this.phase !== 'playing') return;
    this.ghostAttacksReceived += 1;
    this.shakeTrauma = Math.min(0.75, Math.max(this.shakeTrauma, 0.25) + intensity * 0.55);
    document.body.dataset.shake = this.shakeTrauma.toFixed(2);
    document.body.dataset.attacks = String(this.ghostAttacksReceived);
    this.attackFlashAlpha = Math.min(1.0, Math.max(this.attackFlashAlpha, isBoss ? 0.85 : 0.65));
    this.vhsGlitchTrauma = Math.max(this.vhsGlitchTrauma, isBoss ? 0.7 : 0.52);
    this.blaster.addCameraSway((Math.random() - 0.5) * 0.45, -0.25);

    const def = GHOST_DEFINITIONS[ghostType];
    if (isBoss) {
      this.audio.playGhostEvent('buto_ijo', 'rage', pan, 1.15);
    } else if (ghostType === 'genderuwo') {
      this.audio.playGhostEvent('genderuwo', 'rage', pan, 1.0);
    } else if (ghostType === 'kuntilanak') {
      this.audio.playGhostEvent('kuntilanak', 'scream', pan, 0.95);
    } else {
      this.audio.playGhostEvent(ghostType, 'appear', pan, 0.95);
    }
    this.callbacks.onPlayerHit?.(ghostType, isBoss);
    this.callbacks.onScorePopup({
      id: this.popupSeq++,
      text: isBoss ? 'SERANGAN BUTO IJO!' : `AWAS ${def.name.toUpperCase()}!`,
      xPct: 50,
      yPct: 24,
      isBoss,
    });
    this.pushHud(false);
  }

  private fireAtNdc(nx: number, ny: number, screenX?: number, screenY?: number): void {
    if (this.phase !== 'playing') return;
    if (this.reloadTimer > 0) return;
    if (this.ammo <= 0) {
      this.triggerReload();
      return;
    }

    this.ammo -= 1;
    this.shotsFired += 1;

    const lensNdc = mapScreenNdcToWideLensNdc(nx, ny, WIDE_LENS_DISTORTION);
    this._rayNdc.set(lensNdc.x, lensNdc.y);
    this.raycaster.setFromCamera(this._rayNdc, this.camera);

    // Build raycast list: environment props (for true depth occlusion) + active ghost hit meshes
    const targets: THREE.Object3D[] = [];
    if (this.currentEnv && this.envObjectsReady) {
      targets.push(this.currentEnv.group);
    }
    const ghostMeshes = this.ghostManager?.getHitMeshes() ?? [];
    targets.push(...ghostMeshes);

    const intersects = this.raycaster.intersectObjects(targets, true);

    let hitPoint = this._vec3A;
    if (intersects.length > 0) {
      hitPoint.copy(intersects[0].point);
    } else {
      hitPoint.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, 22);
    }

    this.blaster.triggerShoot(hitPoint);
    // Gentle, health-friendly weapon recoil feel
    this.shakeTrauma = Math.min(0.42, Math.max(this.shakeTrauma, 0.16) + 0.14);
    document.body.dataset.shake = this.shakeTrauma.toFixed(2);
    this.screenFlashAlpha = 0.16;
    void this.audio.playSfx('weapon/shoot', { volume: 0.75 });

    // Check if the FIRST (closest) hit belongs to a ghost (respecting occlusion behind tombstones/trees!)
    let hitGhost: ActiveGhost | undefined;
    if (intersects.length > 0) {
      for (const hit of intersects) {
        const gid = hit.object.userData?.ghostId as number | undefined;
        if (gid !== undefined) {
          hitGhost = this.ghostManager?.findById(gid);
          break;
        }
        // Stop if a solid 3D obstacle blocks the line of sight before reaching any ghost
        if (hit.object instanceof THREE.Mesh && hit.object.material && !(hit.object.material as THREE.Material).transparent) {
          break;
        }
      }
    }

    const sx = screenX ?? ((nx + 1) * 0.5) * FIXED_STAGE_WIDTH;
    const sy = screenY ?? ((1 - ny) * 0.5) * FIXED_STAGE_HEIGHT;

    if (hitGhost) {
      this.shotsHit += 1;
      this.combo += 1;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      const dmg = applyGhostDamage(hitGhost.hp, 1);
      this.ghostManager?.triggerHitReaction(hitGhost, dmg.nextHp, dmg.killed);

      const gained = calculateHitScore(hitGhost.type, this.combo, this.settings.scareMode, dmg.killed);
      this.score += gained;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        window.localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
      }

      const pan = this.computePan(hitGhost.group.position);
      const def = GHOST_DEFINITIONS[hitGhost.type];
      // Epic glowing rainbow explosion when laser hits target ghost!
      this.effects.spawnRainbowExplosion(hitPoint, dmg.killed && hitGhost.isBoss);
      this.vhsGlitchTrauma = Math.max(this.vhsGlitchTrauma, dmg.killed ? 0.55 : 0.32);
      this.hitstopTimer = dmg.killed ? 0.045 : 0.025;

      void this.audio.playSfx('weapon/impact', { pan, volume: dmg.killed ? 1.05 : 0.85, priority: true });
      if (dmg.killed) {
        this.kills += 1;
        this.audio.playGhostEvent(hitGhost.type, 'defeat', pan, 1.0);
        void this.audio.playSfx('ui/score', { volume: 0.7 });
        if (this.combo >= 3) {
          void this.audio.playSfx('ui/combo', { volume: 0.72 });
        }
        // Trigger brief slow-motion Kill-Cam focusing on the vanquished ghost
        this.killCamDuration = hitGhost.isBoss ? KILL_CAM_BOSS_DURATION_SEC : KILL_CAM_REGULAR_DURATION_SEC;
        this.killCamRemaining = this.killCamDuration;
        this.killCamIsBoss = hitGhost.isBoss;
        this.killCamGhostName = def.name;
        this.killCamTargetPos.set(
          hitGhost.group.position.x,
          Math.max(0.65, hitGhost.visualGroup.position.y + def.worldHeight * 0.52),
          hitGhost.group.position.z,
        );
        document.body.dataset.killCam = '1';
        if (hitGhost.isBoss) {
          this.bossKills += 1;
          this.bossRespawnTimer = this.bossKills < this.level.targetBossKills ? 1.5 : 5.5;
          this.shakeTrauma = 0.75;
          this.vhsGlitchTrauma = 0.95;
        }
      } else {
        this.audio.playGhostEvent(hitGhost.type, 'hit', pan, 1.0);
        if (hitGhost.isBoss && dmg.nextHp <= 2 && hitGhost.ragedStage === 0) {
          hitGhost.ragedStage = 1;
          this.audio.playGhostEvent('buto_ijo', 'rage', pan, 1.2);
          this.shakeTrauma = 0.55;
          this.vhsGlitchTrauma = 0.82;
        }
      }

      const xPct = ((nx + 1) * 0.5) * 100;
      const yPct = ((1 - ny) * 0.5) * 100;
      this.callbacks.onHitMarker(dmg.killed, sx, sy);
      this.callbacks.onScorePopup({
        id: this.popupSeq++,
        text: `+${gained}`,
        subtext: dmg.killed ? `${def.name} Kalah!` : `${def.name} (${dmg.nextHp} HP)`,
        xPct: THREE.MathUtils.clamp(xPct, 12, 88),
        yPct: THREE.MathUtils.clamp(yPct, 15, 80),
        isBoss: hitGhost.isBoss,
      });
    } else {
      this.combo = 0;
      void this.audio.playSfx('weapon/miss', { volume: 0.6 });
      this.effects.spawnBurst(hitPoint, 5, 0x9fb8c9, 1.8, 0.55, 0.35);
      const activeTuyul = this.ghostManager?.activeGhosts.find(
        (g) => g.type === 'tuyul' && (g.state === 'active' || g.state === 'spawning'),
      );
      if (activeTuyul) {
        this.audio.playGhostEvent('tuyul', 'taunt', this.computePan(activeTuyul.group.position), 1.05);
      }
    }

    if (this.ammo === 0) {
      this.triggerReload();
    }
    this.pushHud(true);
  }

  private computePan(worldPos: THREE.Vector3): number {
    const angleToGhost = Math.atan2(worldPos.x, -worldPos.z);
    // Camera yaw: positive yaw looks left (-X), negative yaw looks right (+X)
    const rel = angleToGhost + this.currentYaw;
    return THREE.MathUtils.clamp(Math.sin(rel), -0.9, 0.9);
  }

  private spawnBossGhost(): void {
    if (!this.ghostManager || !this.currentEnv) return;
    const anchors = this.currentEnv.spawnAnchors;
    if (anchors.length === 0) return;

    const mod = getDifficultyModifiers(this.settings.scareMode);
    const gateAnchor = anchors.find((a) => a.propType === 'gate') ?? anchors[0];
    const boss = this.ghostManager.spawnGhost(
      'buto_ijo',
      gateAnchor,
      'emerge',
      999,
      1.0 * mod.speedScale,
      this.settings.scareMode,
    );
    this.effects.spawnBurst(boss.group.position.clone().setY(1.2), 28, 0x39ff7a, 4.2, 1.4, 0.8);
    this.shakeTrauma = 0.6;
    this.vhsGlitchTrauma = 0.75;
    this.audio.playGhostEvent('buto_ijo', 'appear', 0, 1.2);
  }

  private spawnNextGhost(preferFront = false): number {
    if (!this.ghostManager || !this.currentEnv) return this.level.spawnIntervalSec;
    const anchors = this.currentEnv.spawnAnchors;
    if (anchors.length === 0) return this.level.spawnIntervalSec;

    const mod = getDifficultyModifiers(this.settings.scareMode);

    // Draw from shuffled spawn bag so each playthrough mixes ghost order unpredictably
    if (this.spawnDeck.length === 0) {
      this.spawnDeck = buildSpawnTypeDeck(this.level.allowedGhosts, 3);
    }
    const type = this.spawnDeck.pop()!;

    // Pick anchor avoiding immediate repeat & occupied spots while blending folklore + surprise placements
    const occupiedIds = new Set(this.ghostManager.activeGhosts.map((g) => g.anchor.id));
    const freeAnchors = anchors.filter((a) => !occupiedIds.has(a.id) && a.propType !== 'gate');
    let pool = freeAnchors.length > 0 ? freeAnchors : anchors.filter((a) => a.propType !== 'gate');
    if (pool.length === 0) pool = anchors;

    const nonRepeatPool = pool.filter((a) => a.id !== this.lastAnchorId);
    if (nonRepeatPool.length > 0) pool = nonRepeatPool;

    if (preferFront) {
      const frontPool = pool.filter((a) => Math.abs(a.baseAngle) <= 0.52);
      if (frontPool.length > 0) pool = frontPool;
    } else if (type === 'pocong') {
      const bananaPool = pool.filter((a) => a.propType === 'banana');
      if (bananaPool.length > 0 && Math.random() < 0.72) pool = bananaPool;
    } else if (type === 'kuntilanak') {
      const perchPool = pool.filter((a) => a.propType === 'perched_tree' || a.propType === 'perched_tomb');
      if (perchPool.length > 0 && Math.random() < 0.65) pool = perchPool;
    } else {
      const groundPool = pool.filter((a) => a.propType !== 'perched_tree' && a.propType !== 'perched_tomb');
      if (groundPool.length > 0 && Math.random() < 0.8) pool = groundPool;
    }

    const anchor: SpawnAnchor = shuffleArray(pool)[0];
    this.lastAnchorId = anchor.id;

    // Pick shuffled spawn pattern respecting scareMode jumpscare cap
    let patterns = anchor.allowedPatterns;
    if (Math.random() > mod.jumpscareWeight) {
      const nonJump = patterns.filter((p) => p !== 'jumpscare');
      if (nonJump.length > 0) patterns = nonJump;
    }
    const pattern: SpawnPattern = shuffleArray(patterns)[0];

    const wave = computeRandomizedWaveParams(
      this.level.spawnIntervalSec,
      this.level.ghostStaySec,
      this.level.ghostSpeedMul,
      mod,
    );
    const ghost = this.ghostManager.spawnGhost(
      type,
      anchor,
      pattern,
      wave.stayDurationSec,
      wave.speedMul,
      this.settings.scareMode,
    );
    ghost.group.scale.setScalar(wave.scaleJitter);

    const pan = this.computePan(ghost.group.position);
    if (type !== 'genderuwo') {
      this.effects.spawnBurst(ghost.group.position.clone().setY(1.0), 10, GHOST_DEFINITIONS[type].auraColor, 2.2, 0.9, 0.45);
      this.audio.playGhostEvent(type, 'appear', pan, 0.9);
    }

    return wave.spawnIntervalSec;
  }

  private finishLevel(outcome: GameOutcome): void {
    this.phase = 'gameover';
    this.outcome = outcome;
    this.killCamRemaining = 0;
    this.lastKillCamHudActive = false;
    document.body.dataset.killCam = '0';
    document.body.dataset.state = 'gameover';
    this.keysHeld.clear();

    const accuracy = calculateAccuracy(this.shotsHit, this.shotsFired);
    if (outcome === 'victory') {
      const bonuses = calculateCompletionBonuses(accuracy, this.maxCombo, this.timeLeft);
      this.accuracyBonus = bonuses.accuracyBonus;
      this.comboBonus = bonuses.comboBonus;
      this.score += bonuses.accuracyBonus + bonuses.comboBonus + bonuses.timeBonus;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        window.localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
      }
      void this.audio.playSfx('ui/level-complete', { priority: true, volume: 0.95 });
    } else {
      void this.audio.playSfx('ui/game-over', { priority: true, volume: 0.9 });
    }

    this.audio.pauseLoops();
    this.callbacks.onPhaseChange('gameover', outcome);
    this.pushHud(true);
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = FIXED_STAGE_WIDTH;
    const h = FIXED_STAGE_HEIGHT;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.vhsPass.uniforms.uResolution.value.set(w, h);
    this.renderFrame();
  }

  private renderFrame(): void {
    this.composer.render();
  }

  private startLoop(): void {
    // Render frame 0 immediately so the canvas is never blank/black on initial mount
    this.update(0.016, performance.now());
    this.renderFrame();

    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastFrameMs) / 1000;
      this.lastFrameMs = now;
      const maxDt = this.isSoftwareGl ? 0.12 : 0.05;
      const dt = Math.min(Math.max(rawDt, 0.001), maxDt);

      this.update(dt, now);
      this.renderFrame();

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 45);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private update(dt: number, nowMs: number): void {
    const isPlaying = this.phase === 'playing';
    if (isPlaying && this.killCamRemaining > 0 && this.hitstopTimer <= 0) {
      this.killCamRemaining = Math.max(0, this.killCamRemaining - dt);
    }
    const killCam = isPlaying
      ? computeKillCamState(this.killCamRemaining, this.killCamDuration, this.killCamIsBoss)
      : computeKillCamState(0, 1, false);
    document.body.dataset.killCam = killCam.active ? '1' : '0';

    const simDt = this.hitstopTimer > 0 ? 0 : dt * (isPlaying ? killCam.timeScale : 1);
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
    }
    this.simTime += simDt;

    // 1. Camera movement: Title/Loading stage gentle tour OR active FPS controls (72° yaw, ±15° pitch)
    if (this.phase === 'title' || this.phase === 'loading') {
      this.targetYaw = Math.sin(this.simTime * 0.25) * 0.42;
      this.targetPitch = Math.sin(this.simTime * 0.18) * 0.06 + 0.03;
    } else if (isPlaying) {
      const sens = 1.65 * this.settings.cameraSensitivity;
      let yawDelta = 0;
      let pitchDelta = 0;

      if (this.keysHeld.has('ArrowLeft') || this.keysHeld.has('KeyA')) yawDelta += sens * dt;
      if (this.keysHeld.has('ArrowRight') || this.keysHeld.has('KeyD')) yawDelta -= sens * dt;
      if (this.keysHeld.has('ArrowUp') || this.keysHeld.has('KeyW')) pitchDelta += sens * 0.65 * dt;
      if (this.keysHeld.has('ArrowDown') || this.keysHeld.has('KeyS')) pitchDelta -= sens * 0.65 * dt;

      // Edge-of-screen smooth mouse panning when pointerAimEnabled
      if (this.settings.pointerAimEnabled) {
        const edgeX = Math.abs(this.pointerNdc.x);
        if (edgeX > 0.62) {
          const factor = (edgeX - 0.62) / 0.38;
          yawDelta -= Math.sign(this.pointerNdc.x) * factor * sens * 0.85 * dt;
        }
        const edgeY = Math.abs(this.pointerNdc.y);
        if (edgeY > 0.68) {
          const factor = (edgeY - 0.68) / 0.32;
          pitchDelta += Math.sign(this.pointerNdc.y) * factor * sens * 0.45 * dt;
        }
      }

      if (yawDelta !== 0 || pitchDelta !== 0) {
        this.blaster.addCameraSway(yawDelta, pitchDelta);
      }

      const clamped = clampCameraAngles(this.targetYaw + yawDelta, this.targetPitch + pitchDelta);
      this.targetYaw = clamped.yaw;
      this.targetPitch = clamped.pitch;
    }

    // Exponential damping for silky camera rotation
    this.currentYaw = THREE.MathUtils.damp(this.currentYaw, this.targetYaw, 14, dt);
    this.currentPitch = THREE.MathUtils.damp(this.currentPitch, this.targetPitch, 14, dt);

    // Brief Kill-Cam gentle camera framing & cinematic zoom toward defeated ghost
    let targetKillCamYawOffset = 0;
    let targetKillCamPitchOffset = 0;
    if (killCam.active) {
      const focus = computeKillCamFocusAngles(this.killCamTargetPos, this.camera.position.y);
      targetKillCamYawOffset = (focus.yaw - this.currentYaw) * killCam.focusWeight;
      targetKillCamPitchOffset = (focus.pitch - this.currentPitch) * killCam.focusWeight;
    }
    this.killCamYawSmoothed = THREE.MathUtils.damp(this.killCamYawSmoothed, targetKillCamYawOffset, 12, dt);
    this.killCamPitchSmoothed = THREE.MathUtils.damp(this.killCamPitchSmoothed, targetKillCamPitchOffset, 12, dt);
    this.killCamFovSmoothed = THREE.MathUtils.damp(this.killCamFovSmoothed, killCam.fovOffset, 13, dt);
    this.killCamVignetteSmoothed = THREE.MathUtils.damp(this.killCamVignetteSmoothed, killCam.vignetteBoost, 12, dt);

    // Smooth, health-friendly damped screen shake (no jarring roll or high-frequency eye strain)
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.9);
    const shake = computeScreenShake(this.shakeTrauma, this.simTime);
    this.shakeYawSmoothed = THREE.MathUtils.damp(this.shakeYawSmoothed, shake.yawOffset, 15, dt);
    this.shakePitchSmoothed = THREE.MathUtils.damp(this.shakePitchSmoothed, shake.pitchOffset, 15, dt);
    this.shakeFovSmoothed = THREE.MathUtils.damp(this.shakeFovSmoothed, shake.fovOffset, 12, dt);

    document.body.dataset.shake = this.shakeTrauma > 0.05 ? this.shakeTrauma.toFixed(2) : '0';
    document.body.dataset.attacks = String(this.ghostAttacksReceived);

    this.camera.rotation.y = THREE.MathUtils.clamp(
      this.currentYaw + this.killCamYawSmoothed + this.shakeYawSmoothed,
      -MAX_YAW_RAD - 0.06,
      MAX_YAW_RAD + 0.06,
    );
    this.camera.rotation.x = THREE.MathUtils.clamp(
      this.currentPitch + this.killCamPitchSmoothed + this.shakePitchSmoothed,
      -MAX_PITCH_RAD - 0.04,
      MAX_PITCH_RAD + 0.04,
    );
    this.camera.rotation.z = 0;

    const targetFov = BASE_CAMERA_FOV_DEG + this.shakeFovSmoothed + this.killCamFovSmoothed;
    if (Math.abs(this.lastCameraFov - targetFov) > 0.02) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
      this.lastCameraFov = targetFov;
    }

    // 2. Environment animations (flickering lanterns, swaying trees/banana leaves, moon, stars, clouds, crows, snakes)
    if (this.currentEnv) {
      this.currentEnv.moonMesh.lookAt(this.camera.position);
      const starMat = this.currentEnv.starField.material as THREE.ShaderMaterial;
      if (starMat.uniforms?.uTime) {
        starMat.uniforms.uTime.value = this.simTime;
      }
      for (const f of this.currentEnv.flickerLights) {
        const flick =
          Math.sin(this.simTime * 8.5 + f.phase) * 0.25 +
          Math.sin(this.simTime * 19.0 + f.phase) * 0.12;
        f.light.intensity = Math.max(1.2, f.baseIntensity + flick);
        if (f.flameMesh) {
          f.flameMesh.scale.y = 0.9 + flick * 0.25;
        }
      }
      for (const s of this.currentEnv.swayingObjects) {
        s.obj.rotation.z = s.baseRotZ + Math.sin(this.simTime * 1.3 + s.phase) * s.amp;
      }
      for (const c of this.currentEnv.cloudLayers) {
        const offset = ((this.simTime * c.speed + c.baseX + c.range) % (c.range * 2)) - c.range;
        c.obj.position.x = offset;
      }
      for (const crow of this.currentEnv.flyingCrows) {
        const t = this.simTime * crow.speed + crow.phase;
        const x = crow.centerX + Math.cos(t) * crow.radiusX;
        const z = crow.centerZ + Math.sin(t) * crow.radiusZ;
        const nx = crow.centerX + Math.cos(t + 0.05) * crow.radiusX;
        const nz = crow.centerZ + Math.sin(t + 0.05) * crow.radiusZ;
        crow.obj.position.set(x, crow.height + Math.sin(t * 2.5) * 0.35, z);
        crow.obj.lookAt(nx, crow.obj.position.y, nz);
        const flap = Math.sin(this.simTime * 9.5 + crow.phase) * 0.55;
        crow.leftWing.rotation.z = flap;
        crow.rightWing.rotation.z = -flap;
      }
      for (const pc of this.currentEnv.perchedCrows) {
        pc.head.rotation.y = Math.sin(this.simTime * 1.1 + pc.phase) * 0.55;
        pc.body.rotation.x = Math.sin(this.simTime * 2.0 + pc.phase) * 0.06;
      }
      for (const cr of this.currentEnv.crawlers) {
        const headT = this.simTime * cr.speed + cr.phase;
        cr.segments.forEach((seg, idx) => {
          const lagT = headT - idx * 0.14;
          const sx = cr.centerX + Math.cos(lagT) * cr.radiusX;
          const sz = cr.centerZ + Math.sin(lagT * 2) * cr.radiusZ * 0.6;
          seg.position.set(sx, 0.05, sz);
        });
      }
    }

    // 3. Dynamic weather & slow-motion particle updates (rainbow burst, shockwaves, mist, rain, lightning)
    const effectsDt = isPlaying ? simDt : dt;
    const { flash, boltX, weather } = this.effects.update(
      effectsDt,
      this.simTime,
      this.camera,
      this.level.lightningEnabled,
      (strikeX) => {
        if (!isPlaying) return;
        const sync = computeThunderSyncParams(strikeX, this.level.lightningEnabled);
        if (this.thunderTimeoutId !== null) {
          window.clearTimeout(this.thunderTimeoutId);
        }
        this.thunderTimeoutId = window.setTimeout(() => {
          this.thunderTimeoutId = null;
          if (!this.disposed && this.phase === 'playing') {
            void this.audio.playSfx('environment/thunder', {
              pan: sync.pan,
              volume: sync.volume,
              cooldownMs: 2200,
              priority: true,
            });
          }
        }, sync.delayMs);
      },
    );

    this.lightningLight.position.set(boltX, 20, -16);
    this.lightningLight.intensity = flash * (this.level.lightningEnabled ? 4.4 : 3.2);
    this.hemiLight.intensity = this.baseHemiIntensity + flash * 0.95;
    this.keyLight.intensity = this.baseKeyIntensity + flash * 0.75;
    if (this.currentEnv) {
      for (const c of this.currentEnv.cloudLayers) {
        const mesh = c.obj as THREE.Mesh;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(0.88, c.baseOpacity + flash * 0.28);
      }
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.baseSkyColor).lerp(this.flashSkyColor, flash * 0.45);
    }
    const modForWeather = getDifficultyModifiers(this.settings.scareMode);
    if (this.scene.fog instanceof THREE.FogExp2) {
      const targetFogDensity = this.level.fogDensity * modForWeather.fogScale * weather.fogDensityMultiplier;
      this.scene.fog.density = THREE.MathUtils.damp(this.scene.fog.density, targetFogDensity, 2.2, dt);
      this.scene.fog.color.copy(this.baseFogColor).lerp(this.flashSkyColor, flash * 0.32);
      document.body.dataset.fogDensity = this.scene.fog.density.toFixed(4);
    }
    document.body.dataset.lightning = flash > 0.08 ? flash.toFixed(2) : '0';
    this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt * 3.5);
    this.attackFlashAlpha = Math.max(0, this.attackFlashAlpha - dt * 2.4);
    this.vhsGlitchTrauma = Math.max(0, this.vhsGlitchTrauma - dt * 2.4);

    // Mystical nocturnal horror filter (richer atmosphere while keeping center sharp)
    const periodicTwitch =
      Math.pow(Math.max(0, Math.sin(this.simTime * 0.85) * Math.sin(this.simTime * 3.7)), 16) *
      VHS_MYSTICAL_PRESET.twitchMax;
    const modeScale = this.settings.scareMode === 'santai' ? 0.72 : this.settings.scareMode === 'horor' ? 1.18 : 1.0;
    this.vhsPass.uniforms.uTime.value = this.simTime;
    this.vhsPass.uniforms.uGrainIntensity.value = VHS_MYSTICAL_PRESET.grainBase * modeScale;
    this.vhsPass.uniforms.uScanlineIntensity.value = VHS_MYSTICAL_PRESET.scanlineBase * modeScale;
    this.vhsPass.uniforms.uVignetteStrength.value =
      (this.settings.scareMode === 'horor' ? VHS_MYSTICAL_PRESET.vignetteBase + 0.06 : VHS_MYSTICAL_PRESET.vignetteBase) +
      this.killCamVignetteSmoothed;
    this.vhsPass.uniforms.uLensDistortion.value = WIDE_LENS_DISTORTION + this.shakeTrauma * 0.025;
    this.vhsPass.uniforms.uDamageFlash.value = this.attackFlashAlpha;
    this.vhsPass.uniforms.uGlitch.value = THREE.MathUtils.clamp(
      (this.vhsGlitchTrauma * 0.55 + flash * 0.2 + this.shakeTrauma * 0.14 + periodicTwitch) * modeScale,
      0,
      0.8,
    );

    // 4. Blaster animation
    this.blaster.update(dt * (0.55 + 0.45 * killCam.timeScale), isPlaying);

    // 5. Gameplay simulation (timer, reload, spawn, ghosts, win/loss)
    if (isPlaying && simDt > 0) {
      if (this.reloadTimer > 0) {
        this.reloadTimer = Math.max(0, this.reloadTimer - simDt);
        if (this.reloadTimer === 0) {
          this.ammo = this.maxAmmo;
        }
      }

      this.timeLeft = Math.max(0, this.timeLeft - simDt);

      const mod = getDifficultyModifiers(this.settings.scareMode);
      const hasActiveBoss = this.ghostManager?.activeGhosts.some((g) => g.isBoss) ?? false;
      if (this.level.hasBoss && !hasActiveBoss) {
        this.bossRespawnTimer -= simDt;
        if (this.bossRespawnTimer <= 0) {
          this.spawnBossGhost();
          this.bossRespawnTimer = this.bossKills < this.level.targetBossKills ? 1.5 : 5.5;
        }
      }

      const activeCount = this.ghostManager?.activeGhosts.length ?? 0;
      if (activeCount < this.level.maxConcurrentGhosts) {
        this.spawnTimer -= simDt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = this.spawnNextGhost();
        }
      }

      this.ghostManager?.update(
        simDt,
        this.simTime,
        this.camera,
        (g) => {
          const pan = this.computePan(g.group.position);
          const dist = g.group.position.distanceTo(this.camera.position);
          const distScale = THREE.MathUtils.clamp(14 / Math.max(4, dist), 0.35, 1.15);
          this.audio.playGhostEvent(g.type, 'idle', pan, distScale);
        },
        (g) => {
          // Genderuwo pebble ambush before emerging -> pebble hits screen after brief flight!
          const pan = this.computePan(g.baseWorldPos);
          this.effects.spawnPebbleThrow(g.baseWorldPos, this.camera.position);
          this.audio.playGhostEvent('genderuwo', 'pebble', pan, 1.0);
          window.setTimeout(() => {
            if (!this.disposed && this.phase === 'playing') {
              this.triggerGhostAttackOnPlayer('genderuwo', false, pan, 0.48);
            }
          }, 360);
        },
        (g) => {
          const pan = this.computePan(g.group.position);
          this.triggerGhostAttackOnPlayer(g.type, g.isBoss, pan, g.isBoss ? 0.72 : 0.56);
        },
        () => {
          // Cleanup callback
        },
      );

      const outcome = checkLevelOutcome({
        kills: this.kills,
        targetKills: this.level.targetKills,
        timeLeft: this.timeLeft,
        hasBoss: this.level.hasBoss,
        bossKills: this.bossKills,
        targetBossKills: this.level.targetBossKills,
      });
      // Let the final slow-motion Kill-Cam finish playing before presenting the Victory modal
      if (outcome && (outcome === 'defeat' || !killCam.active)) {
        this.finishLevel(outcome);
      }
    }

    // 6. Push HUD immediately on Kill-Cam transitions, otherwise throttle to ~12 Hz (24 Hz during Kill-Cam bar animation)
    const killCamChanged = killCam.active !== this.lastKillCamHudActive;
    this.lastKillCamHudActive = killCam.active;
    const hudIntervalMs = killCam.active ? 40 : 80;
    if (killCamChanged || nowMs - this.lastHudPush >= hudIntervalMs) {
      this.lastHudPush = nowMs;
      this.pushHud(false);
    }
  }

  private getTargetedGhost(forceCheck = false): HudSnapshot['targetedGhost'] {
    if (this.phase !== 'playing' || !this.ghostManager) return null;
    const now = performance.now();
    if (!forceCheck && now - this.lastHoverCheck < 75) return null;
    this.lastHoverCheck = now;

    const hitMeshes = this.ghostManager.getHitMeshes();
    if (hitMeshes.length === 0) return null;
    const lensNdc = mapScreenNdcToWideLensNdc(this.pointerNdc.x, this.pointerNdc.y, WIDE_LENS_DISTORTION);
    this._rayNdc.set(lensNdc.x, lensNdc.y);
    this.raycaster.setFromCamera(this._rayNdc, this.camera);
    const hits = this.raycaster.intersectObjects(hitMeshes, false);
    if (hits.length === 0) return null;
    const gid = hits[0].object.userData?.ghostId as number | undefined;
    const ghost = gid !== undefined ? this.ghostManager.findById(gid) : undefined;
    if (!ghost) return null;
    const def = GHOST_DEFINITIONS[ghost.type];
    return {
      name: def.name,
      type: ghost.type,
      hp: ghost.hp,
      maxHp: ghost.maxHp,
      isBoss: ghost.isBoss,
    };
  }

  private pushHud(forceTargetCheck: boolean): void {
    const boss = this.ghostManager?.activeGhosts.find((g) => g.isBoss && g.hp > 0);
    const targeted = this.getTargetedGhost(forceTargetCheck);
    const killCam =
      this.phase === 'playing'
        ? computeKillCamState(this.killCamRemaining, this.killCamDuration, this.killCamIsBoss)
        : computeKillCamState(0, 1, false);
    this.callbacks.onHudUpdate({
      phase: this.phase,
      outcome: this.outcome,
      levelId: this.level.id,
      levelName: this.level.name,
      score: this.score,
      highScore: this.highScore,
      combo: this.combo,
      maxCombo: this.maxCombo,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      accuracy: calculateAccuracy(this.shotsHit, this.shotsFired),
      kills: this.kills,
      targetKills: this.level.targetKills,
      bossKills: this.bossKills,
      targetBossKills: this.level.targetBossKills,
      timeLeft: Math.ceil(this.timeLeft),
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      isReloading: this.reloadTimer > 0,
      targetedGhost: targeted,
      bossInfo: boss
        ? {
            name: GHOST_DEFINITIONS.buto_ijo.name,
            hp: boss.hp,
            maxHp: boss.maxHp,
            active: true,
          }
        : null,
      killCam: killCam.active
        ? {
            active: true,
            ghostName: this.killCamGhostName,
            isBoss: this.killCamIsBoss,
            progress: killCam.progress,
          }
        : null,
      activeGhostCount: this.ghostManager?.activeGhosts.length ?? 0,
      cameraYawDeg: Math.round(THREE.MathUtils.radToDeg(this.currentYaw)),
      cameraPitchDeg: Math.round(THREE.MathUtils.radToDeg(this.currentPitch)),
      accuracyBonus: this.accuracyBonus,
      comboBonus: this.comboBonus,
      ghostAttacksReceived: this.ghostAttacksReceived,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    if (this.thunderTimeoutId !== null) {
      window.clearTimeout(this.thunderTimeoutId);
      this.thunderTimeoutId = null;
    }

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.resizeObserver.disconnect();

    this.ghostManager?.dispose();
    this.currentEnv?.dispose();
    this.effects.dispose();
    this.blaster.dispose();
    this.envMapTexture.dispose();
    Object.values(this.textures).forEach((t) => t.dispose());
    if (this.ghostTextures) {
      Object.values(this.ghostTextures).forEach((e) => e.texture.dispose());
    }
    this.vhsPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
