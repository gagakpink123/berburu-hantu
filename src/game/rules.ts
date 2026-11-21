import { GHOST_DEFINITIONS } from './levels';
import type { GameOutcome, GhostType, ScareMode } from './types';

// Proportional 72° horizontal range (-36° to +36°) and ±15° vertical range
export const MAX_YAW_RAD = (72 * Math.PI) / 180 / 2; // 36 deg left/right -> 72 deg total
export const MAX_PITCH_RAD = (15 * Math.PI) / 180; // 15 deg up/down -> 30 deg total

export const FIXED_STAGE_WIDTH = 2400;
export const FIXED_STAGE_HEIGHT = 1080;
export const MOBILE_MENU_UI_SCALE = 3;
export const WIDE_LENS_DISTORTION = 0.26;
export const BASE_CAMERA_FOV_DEG = 68;

/**
 * Detects smartphone viewports (both landscape and portrait) so all menus and HUD
 * panels scale 3x larger proportionally on phone screens without affecting desktop/tablet.
 */
export function isPhoneViewport(viewportWidth: number, viewportHeight: number): boolean {
  const minSide = Math.min(viewportWidth, viewportHeight);
  const maxSide = Math.max(viewportWidth, viewportHeight);
  return minSide > 0 && minSide <= 540 && maxSide <= 1024;
}

export function computeMenuUiScale(viewportWidth: number, viewportHeight: number): number {
  return isPhoneViewport(viewportWidth, viewportHeight) ? MOBILE_MENU_UI_SCALE : 1;
}

export function clampCameraAngles(yaw: number, pitch: number): { yaw: number; pitch: number } {
  return {
    yaw: Math.max(-MAX_YAW_RAD, Math.min(MAX_YAW_RAD, yaw)),
    pitch: Math.max(-MAX_PITCH_RAD, Math.min(MAX_PITCH_RAD, pitch)),
  };
}

export function computeTouchDragAngles(
  dx: number,
  dy: number,
  viewportWidth: number,
  viewportHeight: number,
  sensitivity: number,
): { yawDelta: number; pitchDelta: number } {
  const safeW = Math.max(1, viewportWidth);
  const safeH = Math.max(1, viewportHeight);
  const clampedSens = Math.max(0.2, Math.min(3.0, sensitivity));
  return {
    yawDelta: (dx / safeW) * (MAX_YAW_RAD * 2.2) * clampedSens,
    pitchDelta: (dy / safeH) * (MAX_PITCH_RAD * 2.2) * clampedSens,
  };
}

/**
 * Maps screen-space NDC (-1..1) through the same barrel curve used by the wide-lens shader
 * so raycasting remains accurate across the entire distorted viewport.
 */
export function mapScreenNdcToWideLensNdc(
  nx: number,
  ny: number,
  distortion = WIDE_LENS_DISTORTION,
): { x: number; y: number } {
  const k = Math.max(0, distortion);
  if (k === 0) return { x: nx, y: ny };
  const r2 = nx * nx + ny * ny;
  const zoom = 1 / (1 + k * 2.0);
  const scale = (1 + k * r2) * zoom;
  return {
    x: Math.max(-1, Math.min(1, nx * scale)),
    y: Math.max(-1, Math.min(1, ny * scale)),
  };
}

/**
 * Smooth, health-friendly damped camera shake for weapon recoil and ghost attacks.
 * Uses low-frequency oscillation without disorienting roll or harsh FOV snaps
 * to prevent eye strain and motion fatigue.
 */
export function computeScreenShake(
  trauma: number,
  timeSec: number,
): { yawOffset: number; pitchOffset: number; rollOffset: number; fovOffset: number } {
  const t = Math.max(0, Math.min(1, trauma));
  if (t <= 0.001) {
    return { yawOffset: 0, pitchOffset: 0, rollOffset: 0, fovOffset: 0 };
  }
  const power = t * t;
  return {
    yawOffset: Math.sin(timeSec * 5.6) * 0.0105 * power,
    pitchOffset: Math.cos(timeSec * 7.2 + 0.6) * 0.0085 * power,
    rollOffset: 0,
    fovOffset: (0.62 + Math.sin(timeSec * 4.5) * 0.18) * power,
  };
}

export function applyGhostDamage(
  currentHp: number,
  damage = 1,
): { nextHp: number; killed: boolean } {
  const nextHp = Math.max(0, currentHp - Math.max(0, damage));
  return {
    nextHp,
    killed: nextHp === 0 && currentHp > 0,
  };
}

export function calculateHitScore(
  ghostType: GhostType,
  combo: number,
  scareMode: ScareMode,
  isKill: boolean,
): number {
  const def = GHOST_DEFINITIONS[ghostType];
  const modeMultiplier = scareMode === 'horor' ? 1.25 : scareMode === 'petualangan' ? 1.0 : 0.85;
  const comboMultiplier = 1 + Math.min(combo, 10) * 0.15;
  if (!isKill) {
    return Math.round(35 * modeMultiplier);
  }
  return Math.round(def.baseScore * comboMultiplier * modeMultiplier);
}

export function calculateAccuracy(hits: number, shots: number): number {
  if (shots <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((hits / shots) * 100)));
}

export function calculateCompletionBonuses(
  accuracy: number,
  maxCombo: number,
  timeLeft: number,
): { accuracyBonus: number; comboBonus: number; timeBonus: number } {
  const accuracyBonus = accuracy >= 80 ? 450 : accuracy >= 60 ? 250 : accuracy >= 40 ? 100 : 0;
  const comboBonus = Math.max(0, maxCombo) * 60;
  const timeBonus = Math.max(0, Math.round(timeLeft)) * 12;
  return { accuracyBonus, comboBonus, timeBonus };
}

export function checkLevelOutcome(params: {
  kills: number;
  targetKills: number;
  timeLeft: number;
  hasBoss: boolean;
  bossKills: number;
  targetBossKills: number;
}): GameOutcome {
  const killsReached = params.kills >= params.targetKills;
  const bossRequirementMet = !params.hasBoss || params.bossKills >= params.targetBossKills;
  if (killsReached && bossRequirementMet) return 'victory';
  if (params.timeLeft <= 0) return 'defeat';
  return null;
}

export interface DifficultyModifiers {
  stayDurationScale: number;
  spawnIntervalScale: number;
  speedScale: number;
  jumpscareWeight: number;
  ambientBoost: number;
  fogScale: number;
}

export function getDifficultyModifiers(scareMode: ScareMode): DifficultyModifiers {
  switch (scareMode) {
    case 'santai':
      return {
        stayDurationScale: 1.25,
        spawnIntervalScale: 1.15,
        speedScale: 0.82,
        jumpscareWeight: 0.02,
        ambientBoost: 1.45,
        fogScale: 0.72,
      };
    case 'horor':
      return {
        stayDurationScale: 0.85,
        spawnIntervalScale: 0.86,
        speedScale: 1.18,
        jumpscareWeight: 0.16,
        ambientBoost: 0.78,
        fogScale: 1.2,
      };
    case 'petualangan':
    default:
      return {
        stayDurationScale: 1.0,
        spawnIntervalScale: 1.0,
        speedScale: 1.0,
        jumpscareWeight: 0.08,
        ambientBoost: 1.05,
        fogScale: 1.0,
      };
  }
}

export function shuffleArray<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Builds a shuffled ghost-type bag per playthrough so each run varies enemy order
 * while still ensuring balanced representation of every allowed ghost in the level.
 */
export function buildSpawnTypeDeck(
  allowedGhosts: readonly GhostType[],
  bagRounds = 3,
  rng: () => number = Math.random,
): GhostType[] {
  if (allowedGhosts.length === 0) return ['tuyul'];
  const deck: GhostType[] = [];
  for (let r = 0; r < Math.max(1, bagRounds); r += 1) {
    deck.push(...shuffleArray(allowedGhosts, rng));
  }
  return deck;
}

/**
 * Applies slight randomized variation to spawn interval, stay duration, and movement speed
 * between playthroughs and individual waves without breaking level difficulty balance.
 */
export function computeRandomizedWaveParams(
  baseSpawnIntervalSec: number,
  baseStaySec: number,
  baseSpeedMul: number,
  mod: DifficultyModifiers,
  rng: () => number = Math.random,
): { spawnIntervalSec: number; stayDurationSec: number; speedMul: number; scaleJitter: number } {
  const intervalJitter = 0.80 + rng() * 0.42; // 0.80x .. 1.22x
  const stayJitter = 0.90 + rng() * 0.22; // 0.90x .. 1.12x
  const speedJitter = 0.90 + rng() * 0.22; // 0.90x .. 1.12x
  const scaleJitter = 0.94 + rng() * 0.12; // 0.94x .. 1.06x
  return {
    spawnIntervalSec: Math.max(0.45, baseSpawnIntervalSec * mod.spawnIntervalScale * intervalJitter),
    stayDurationSec: Math.max(2.2, baseStaySec * mod.stayDurationScale * stayJitter),
    speedMul: Math.max(0.65, baseSpeedMul * mod.speedScale * speedJitter),
    scaleJitter,
  };
}

export const VHS_THIN_PRESET = {
  grainBase: 0.018,
  scanlineBase: 0.026,
  chromaticBase: 0.0008,
  vignetteBase: 0.19,
  twitchMax: 0.06,
} as const;

export const VHS_MYSTICAL_PRESET = {
  grainBase: 0.032,
  scanlineBase: 0.044,
  chromaticBase: 0.0012,
  vignetteBase: 0.30,
  twitchMax: 0.10,
} as const;

const GHOST_VOICE_CLIP_SET = new Set([
  'voice',
  'taunt',
  'laugh',
  'scream',
  'groan',
  'growl',
  'roar',
  'rage',
]);

/**
 * Returns true when an audio manifest key represents spoken/vocal ghost dialogue
 * that must be serialized to prevent overlapping articulation, while non-speech
 * SFX (hits, footsteps, weapon fire, thunder) and music remain unrestricted.
 */
export function isGhostVoiceAudioKey(key: string): boolean {
  if (!key.startsWith('ghosts/')) return false;
  const parts = key.split('/');
  const clip = parts[parts.length - 1] ?? '';
  return GHOST_VOICE_CLIP_SET.has(clip);
}

export type VoicePriority = 'ambient' | 'urgent';

export interface QueuedVoiceRequest<TMeta = unknown> {
  key: string;
  priority: VoicePriority;
  enqueuedAtMs: number;
  maxWaitMs: number;
  meta: TMeta;
}

export interface VoicePlayDecision<TMeta = unknown> {
  action: 'play_now' | 'queued' | 'dropped';
  delayMs: number;
  request?: QueuedVoiceRequest<TMeta>;
}

/**
 * Pure single-channel voice arbitrator: guarantees at most ONE ghost voice plays
 * at any moment with a clean silence gap between clips so every ghost's articulation
 * remains clear and never collides with another ghost's voice.
 */
export class GhostVoiceScheduler<TMeta = unknown> {
  private activeUntilMs = 0;
  private pending: QueuedVoiceRequest<TMeta> | null = null;
  private readonly interVoiceGapMs: number;
  private readonly minAmbientCooldownMs: number;
  private lastVoiceEndMs = -10000;

  constructor(interVoiceGapMs = 260, minAmbientCooldownMs = 950) {
    this.interVoiceGapMs = interVoiceGapMs;
    this.minAmbientCooldownMs = minAmbientCooldownMs;
  }

  public isBusy(nowMs: number): boolean {
    return nowMs < this.activeUntilMs;
  }

  public request(
    key: string,
    priority: VoicePriority,
    nowMs: number,
    meta: TMeta,
    maxWaitMs = 1900,
  ): VoicePlayDecision<TMeta> {
    if (this.isBusy(nowMs)) {
      if (priority === 'urgent') {
        // Keep only the freshest urgent line waiting (max 1 slot) so lines never pile up
        const req: QueuedVoiceRequest<TMeta> = {
          key,
          priority,
          enqueuedAtMs: nowMs,
          maxWaitMs,
          meta,
        };
        this.pending = req;
        return {
          action: 'queued',
          delayMs: Math.max(40, Math.ceil(this.activeUntilMs - nowMs)),
          request: req,
        };
      }
      return { action: 'dropped', delayMs: 0 };
    }

    if (priority === 'ambient' && nowMs - this.lastVoiceEndMs < this.minAmbientCooldownMs) {
      return { action: 'dropped', delayMs: 0 };
    }

    return {
      action: 'play_now',
      delayMs: 0,
      request: { key, priority, enqueuedAtMs: nowMs, maxWaitMs, meta },
    };
  }

  public markStarted(durationSec: number, nowMs: number): void {
    const durMs = Math.max(350, Math.min(4800, Math.round(durationSec * 1000)));
    this.lastVoiceEndMs = nowMs + durMs;
    this.activeUntilMs = nowMs + durMs + this.interVoiceGapMs;
  }

  public consumePending(nowMs: number): QueuedVoiceRequest<TMeta> | null {
    const req = this.pending;
    this.pending = null;
    if (!req) return null;
    if (nowMs - req.enqueuedAtMs > req.maxWaitMs) return null;
    if (this.isBusy(nowMs)) {
      this.pending = req;
      return null;
    }
    return req;
  }

  public clear(): void {
    this.activeUntilMs = 0;
    this.lastVoiceEndMs = -10000;
    this.pending = null;
  }
}

export interface WeatherState {
  drizzleIntensity: number;     // 0..1 temporary light rain wave
  fogDensityMultiplier: number; // ~0.78..1.85 periodic Three.js FogExp2 surge & ebb
  mistOpacity: number;          // 0.14..0.30 thin ground mist opacity
  ambientMistOpacity: number;   // 0.08..0.20 slow drifting mid-arena mist opacity
  windSway: number;             // subtle wind slant for rain & foliage
}

/**
 * Computes cyclical temporary weather intensity: periodic fog density surges,
 * gentle rain showers (gerimis), and drifting ground/ambient mist across every level.
 */
export function computeWeatherState(
  elapsedSec: number,
  stormyLevel: boolean,
  menuBackdrop = false,
): WeatherState {
  // 26-second rain cycle starting with a visible early shower (phase offset 0.85 rad)
  const wave = Math.sin(elapsedSec * 0.24 + 0.85);
  const rawDrizzle = Math.max(0, (wave - (stormyLevel ? -0.15 : 0.12)) / (stormyLevel ? 1.15 : 0.88));
  const cyclicalDrizzle = Math.min(1, Math.pow(rawDrizzle, 0.85) * (stormyLevel ? 1.0 : 0.72));
  const menuGust = 0.5 + 0.5 * Math.sin(elapsedSec * 0.42 + 0.5);
  const drizzleIntensity = menuBackdrop ? 0.58 + menuGust * 0.36 : cyclicalDrizzle;

  // Deeper ~24s rolling fog bank cycle blended with rain surges
  const fogCycle = 0.5 + 0.5 * Math.sin(elapsedSec * 0.26 - 0.4);
  const secondarySurge = 0.5 + 0.5 * Math.sin(elapsedSec * 0.11 + 1.1);
  const fogWave = fogCycle * 0.72 + secondarySurge * 0.28;
  const fogDensityMultiplier =
    (stormyLevel || menuBackdrop ? 0.88 : 0.78) +
    fogWave * (stormyLevel || menuBackdrop ? 0.72 : 0.58) +
    drizzleIntensity * 0.24;

  const mistPulse = 0.5 + 0.5 * Math.sin(elapsedSec * 0.35);
  const mistOpacity = 0.14 + mistPulse * 0.05 + fogWave * 0.065 + drizzleIntensity * 0.035;
  const ambientMistOpacity = 0.08 + mistPulse * 0.035 + fogWave * 0.055 + drizzleIntensity * 0.025;
  const windSway = (menuBackdrop ? 0.17 : 0.12) + Math.sin(elapsedSec * 0.45) * 0.06 + drizzleIntensity * 0.08;
  return {
    drizzleIntensity,
    fogDensityMultiplier,
    mistOpacity,
    ambientMistOpacity,
    windSway,
  };
}

export function computeLightningCooldownSec(
  stormyLevel: boolean,
  menuBackdrop = false,
  rng: () => number = Math.random,
): number {
  const r = Math.max(0, Math.min(1, rng()));
  if (menuBackdrop) {
    return 2.6 + r * 2.6;
  }
  return stormyLevel ? 5.2 + r * 5.8 : 8.5 + r * 7.5;
}

/**
 * Double-flicker lightning illumination curve synchronized with forked sky bolt.
 */
export function computeLightningEnvelope(ageSec: number): number {
  if (ageSec < 0 || ageSec >= 0.72) return 0;
  const p1 = Math.exp(-Math.pow((ageSec - 0.04) / 0.048, 2));
  const p2 = 0.82 * Math.exp(-Math.pow((ageSec - 0.19) / 0.062, 2));
  const trail = Math.max(0, 1 - ageSec / 0.65) * 0.26;
  return Math.min(1, Math.max(p1, p2) + trail);
}

/**
 * Maps lightning bolt world X & storm intensity to synchronized directional thunder playback.
 */
export function computeThunderSyncParams(
  boltX: number,
  stormyLevel: boolean,
): { pan: number; volume: number; delayMs: number } {
  const pan = Math.max(-0.85, Math.min(0.85, boltX / 13));
  const volume = stormyLevel ? 0.88 : 0.62;
  // Crisp near-instant crack in storm levels; slight atmospheric distance lag in calmer levels
  const delayMs = stormyLevel ? 75 : 175;
  return { pan, volume, delayMs };
}

/**
 * Target pointer reticle is hidden at screen center and shown ONLY when active input uses a mouse.
 */
export function resolveMousePointerVisibility(
  eventType: 'move' | 'down' | 'leave' | 'reset',
  pointerType: string,
): boolean {
  if (eventType === 'leave' || eventType === 'reset') return false;
  return pointerType === 'mouse';
}

export const KILL_CAM_REGULAR_DURATION_SEC = 0.78;
export const KILL_CAM_BOSS_DURATION_SEC = 1.25;

export interface KillCamFrameState {
  active: boolean;
  progress: number;
  envelope: number;
  timeScale: number;
  fovOffset: number;
  vignetteBoost: number;
  focusWeight: number;
}

/**
 * Pure Kill-Cam time-dilation & camera-focus envelope triggered briefly upon defeating a ghost.
 * Ramps rapidly into crisp slow-motion, holds a dramatic plateau, and eases smoothly back to 1.0x.
 */
export function computeKillCamState(
  remainingSec: number,
  durationSec: number,
  isBoss: boolean,
): KillCamFrameState {
  if (remainingSec <= 0 || durationSec <= 0) {
    return {
      active: false,
      progress: 0,
      envelope: 0,
      timeScale: 1,
      fovOffset: 0,
      vignetteBoost: 0,
      focusWeight: 0,
    };
  }
  const progress = Math.max(0, Math.min(1, 1 - remainingSec / durationSec));
  let envelope: number;
  if (progress < 0.18) {
    const t = progress / 0.18;
    envelope = t * t * (3 - 2 * t);
  } else if (progress <= 0.62) {
    envelope = 1;
  } else {
    const t = (1 - progress) / 0.38;
    envelope = t * t * (3 - 2 * t);
  }

  const minScale = isBoss ? 0.16 : 0.22;
  const maxZoomDeg = isBoss ? -11.0 : -7.5;
  const maxFocus = isBoss ? 0.58 : 0.42;

  return {
    active: true,
    progress,
    envelope,
    timeScale: 1 - (1 - minScale) * envelope,
    fovOffset: maxZoomDeg * envelope,
    vignetteBoost: (isBoss ? 0.28 : 0.2) * envelope,
    focusWeight: maxFocus * envelope,
  };
}

/**
 * Computes camera yaw/pitch angles oriented toward a defeated ghost's 3D world position,
 * clamped within the arena's ±36° horizontal / ±15° vertical range.
 */
export function computeKillCamFocusAngles(
  targetWorldPos: { x: number; y: number; z: number },
  cameraEyeY = 1.65,
): { yaw: number; pitch: number } {
  const safeForwardZ = Math.max(0.5, -targetWorldPos.z);
  const rawYaw = Math.atan2(-targetWorldPos.x, safeForwardZ);
  const horizDist = Math.max(0.5, Math.hypot(targetWorldPos.x, safeForwardZ));
  const rawPitch = Math.atan2(targetWorldPos.y - cameraEyeY, horizDist);
  return clampCameraAngles(rawYaw, rawPitch);
}

/**
 * Per-key ambient loop gain calibration so crickets sit softly in the background
 * rather than overpowering voices, thunder, or atmospheric wildlife.
 */
export function getAmbienceTargetGain(envKey: string): number {
  const normalized = envKey.replace(/^environment\//, '');
  switch (normalized) {
    case 'crickets':
      return 0.14;
    case 'night-ambience':
      return 0.28;
    default:
      return 0.40;
  }
}

export type WildlifeCallKind = 'owl' | 'wolf';

export const WILDLIFE_CALL_MIN_DELAY_SEC = 12;
export const WILDLIFE_CALL_MAX_DELAY_SEC = 24;

/**
 * Returns an occasional delay (12..24s) for nocturnal owl hoots and distant wolf howls
 * so they enhance horror immersion sporadically without feeling repetitive.
 */
export function computeNextWildlifeCallDelaySec(rng: () => number = Math.random): number {
  const r = Math.max(0, Math.min(1, rng()));
  return WILDLIFE_CALL_MIN_DELAY_SEC + r * (WILDLIFE_CALL_MAX_DELAY_SEC - WILDLIFE_CALL_MIN_DELAY_SEC);
}

export function pickOccasionalWildlifeCall(
  lastKind: WildlifeCallKind | null,
  rng: () => number = Math.random,
): {
  kind: WildlifeCallKind;
  key: 'environment/owl' | 'environment/wolf';
  pan: number;
  volume: number;
} {
  const rKind = rng();
  let kind: WildlifeCallKind;
  if (lastKind === 'owl') {
    kind = rKind < 0.72 ? 'wolf' : 'owl';
  } else if (lastKind === 'wolf') {
    kind = rKind < 0.72 ? 'owl' : 'wolf';
  } else {
    kind = rKind < 0.55 ? 'owl' : 'wolf';
  }

  // Distant off-center stereo placement (-0.85..-0.28 or +0.28..+0.85)
  const side = rng() < 0.5 ? -1 : 1;
  const pan = side * (0.28 + rng() * 0.57);
  const volume = (kind === 'owl' ? 0.60 : 0.56) + rng() * 0.18;

  return {
    kind,
    key: kind === 'owl' ? 'environment/owl' : 'environment/wolf',
    pan,
    volume,
  };
}

export const GHOST_ALERT_MAX_ROWS = 3;
export const GHOST_ALERT_DURATION_MS = 4500;

/**
 * Formats a concise techno-radar Indonesian ghost spawn notification for the top-center HUD.
 */
export function formatGhostSpawnAlert(
  ghostType: GhostType,
  isBoss: boolean,
  propType?: string,
): { title: string; detail: string } {
  const def = GHOST_DEFINITIONS[ghostType];
  const zoneMap: Record<string, string> = {
    banana: 'RUMPUN PISANG',
    tombstone: 'AREA NISAN',
    perched_tree: 'DAHAN POHON',
    perched_tomb: 'ATAS NISAN',
    joglo: 'RUMAH JOGLO',
    well: 'SUMUR TUA',
    banyan: 'POHON BERINGIN',
    statue: 'ARCA BATU',
    gate: 'GERBANG KERAMAT',
    bridge: 'JEMBATAN',
    boiler: 'KETEL TUA',
    ruin: 'RERUNTUHAN',
    cliff: 'TEBING JURANG',
    candi: 'PELATARAN CANDI',
    stupa: 'STUPA KUNO',
    volcano: 'KAWAH MERAPI',
    mangrove: 'AKAR BAKAU',
    bush: 'SEMAK GELAP',
    tree: 'POHON TUA',
    mist: 'KABUT MALAM',
  };
  const zone = propType ? zoneMap[propType] ?? 'SEKTOR GELAP' : 'SEKTOR GELAP';
  if (isBoss || ghostType === 'buto_ijo') {
    return {
      title: `SINYAL MERAH // BOSS ${def.name.toUpperCase()}`,
      detail: zone,
    };
  }
  const tagMap: Record<GhostType, string> = {
    tuyul: 'DETEKSI GERAK',
    pocong: 'ANOMALI KAFAN',
    kuntilanak: 'FREKUENSI TINGGI',
    genderuwo: 'GETARAN BERAT',
    buto_ijo: 'SINYAL MERAH',
  };
  return {
    title: `${tagMap[ghostType]} // ${def.name.toUpperCase()} MUNCUL`,
    detail: `LOKASI: ${zone}`,
  };
}

/**
 * Appends a new ghost alert at the bottom of the 3-row stack so older alerts glide upward,
 * trimming expired or overflow rows beyond maxRows (default 3).
 */
export function pushGhostAlertQueue<T extends { createdAtMs: number; durationMs: number }>(
  queue: readonly T[],
  next: T,
  nowMs: number,
  maxRows = GHOST_ALERT_MAX_ROWS,
): T[] {
  const active = queue.filter((item) => nowMs - item.createdAtMs < item.durationMs);
  const combined = [...active, next];
  return combined.slice(Math.max(0, combined.length - maxRows));
}

export function pruneExpiredGhostAlerts<T extends { createdAtMs: number; durationMs: number }>(
  queue: readonly T[],
  nowMs: number,
): T[] {
  return queue.filter((item) => nowMs - item.createdAtMs < item.durationMs);
}

/**
 * Smooth cubic fade-in (0 -> 1) curve when ghosts materialize into the arena.
 */
export function computeGhostFadeInOpacity(ageSec: number, fadeDurationSec = 0.62): number {
  if (fadeDurationSec <= 0) return 1;
  const t = Math.max(0, Math.min(1, ageSec / fadeDurationSec));
  return t * t * (3 - 2 * t);
}

export interface GhostEntranceState {
  progress: number;       // 0..1 normalized entrance progress
  dissolveReveal: number; // 0..1 shader smoke-dissolve reveal
  shadowReveal: number;   // 0..1 transition from pitch-dark shadow silhouette -> full color
  edgeGlow: number;       // 0..1 mystical spectral edge glow intensity along smoke rim
}

/**
 * Computes mystical 2-stage entrance curves for ghosts materializing out of dark shadow
 * and swirling smoke: rapid organic smoke dissolution followed by gradual color revelation
 * out of a pitch-dark shadow silhouette.
 */
export function computeGhostEntranceState(
  ageSec: number,
  durationSec = 1.15,
): GhostEntranceState {
  if (durationSec <= 0 || ageSec >= durationSec) {
    return { progress: 1, dissolveReveal: 1, shadowReveal: 1, edgeGlow: 0 };
  }
  const progress = Math.max(0, Math.min(1, ageSec / durationSec));
  // Smooth ease-out cubic for organic smoke condensation
  const dissolveReveal = 1 - Math.pow(1 - progress, 2.4);
  // Shadow emergence: starts as pure dark shadow silhouette until ~22%, then reveals colors through 92%
  const shadowT = Math.max(0, Math.min(1, (progress - 0.18) / 0.74));
  const shadowReveal = shadowT * shadowT * (3 - 2 * shadowT);
  // Smoke-burn rim glow swells during active condensation and fades cleanly at completion
  const edgeGlow = Math.sin(Math.pow(progress, 0.8) * Math.PI);
  return {
    progress,
    dissolveReveal,
    shadowReveal,
    edgeGlow: Math.max(0, Math.min(1, edgeGlow)),
  };
}

export interface GhostEntranceProfile {
  smokeCount: number;
  wispCount: number;
  ashCount: number;
  ringCount: number;
  shadowBurstScale: number;
}

export function getGhostEntranceProfile(isBoss: boolean, ghostType: GhostType): GhostEntranceProfile {
  if (isBoss) {
    return { smokeCount: 22, wispCount: 16, ashCount: 18, ringCount: 2, shadowBurstScale: 1.85 };
  }
  if (ghostType === 'genderuwo' || ghostType === 'kuntilanak') {
    return { smokeCount: 15, wispCount: 11, ashCount: 12, ringCount: 2, shadowBurstScale: 1.3 };
  }
  return { smokeCount: 11, wispCount: 8, ashCount: 9, ringCount: 1, shadowBurstScale: 1.0 };
}

export const METEOR_MIN_COOLDOWN_SEC = 14;
export const METEOR_MAX_COOLDOWN_SEC = 32;

/**
 * Rare sky meteor (bintang berekor) interval between 14s and 32s.
 */
export function computeMeteorCooldownSec(rng: () => number = Math.random): number {
  const r = Math.max(0, Math.min(1, rng()));
  return METEOR_MIN_COOLDOWN_SEC + r * (METEOR_MAX_COOLDOWN_SEC - METEOR_MIN_COOLDOWN_SEC);
}

export interface GhostExplosionProfile {
  lightIntensity: number;
  coreScale: number;
  burstCount: number;
  smokeCount: number;
  ashCount: number;
  shardCount: number;
  wispCount: number;
  ringCount: number;
}

/**
 * Calibrates particle, smoke, ash, spectral wisp, and shockwave counts
 * for ghost hit vs regular kill vs boss kill explosions.
 */
export function getGhostExplosionProfile(isKill: boolean, isBoss: boolean): GhostExplosionProfile {
  if (isKill && isBoss) {
    return {
      lightIntensity: 14.5,
      coreScale: 2.25,
      burstCount: 22,
      smokeCount: 30,
      ashCount: 44,
      shardCount: 42,
      wispCount: 22,
      ringCount: 4,
    };
  }
  if (isKill) {
    return {
      lightIntensity: 10.5,
      coreScale: 1.75,
      burstCount: 15,
      smokeCount: 22,
      ashCount: 32,
      shardCount: 30,
      wispCount: 14,
      ringCount: 3,
    };
  }
  return {
    lightIntensity: 5.8,
    coreScale: 1.05,
    burstCount: 8,
    smokeCount: 10,
    ashCount: 14,
    shardCount: 14,
    wispCount: 6,
    ringCount: 1,
  };
}

export const MIN_GENDERUWO_COOLDOWN_WAVES = 3;

/**
 * Builds a weighted spawn deck across `bagRounds` where lighter spirits
 * (Tuyul, Pocong, Kuntilanak) appear more frequently while Genderuwo
 * appears sparingly so heavy pebble-ambush ghosts do not overwhelm the player.
 */
export function buildPacedSpawnDeck(
  allowedGhosts: readonly GhostType[],
  bagRounds = 3,
  rng: () => number = Math.random,
): GhostType[] {
  if (allowedGhosts.length === 0) return ['tuyul'];
  const nonHeavy = allowedGhosts.filter((g) => g !== 'genderuwo');
  const hasGenderuwo = allowedGhosts.includes('genderuwo');
  if (!hasGenderuwo || nonHeavy.length === 0) {
    return buildSpawnTypeDeck(allowedGhosts, bagRounds, rng);
  }

  const deck: GhostType[] = [];
  const rounds = Math.max(1, bagRounds);
  for (let r = 0; r < rounds; r += 1) {
    // Each round includes all non-heavy ghosts twice for rich regular spirit variety
    deck.push(...shuffleArray(nonHeavy, rng));
    deck.push(...shuffleArray(nonHeavy, rng));
  }
  // Insert Genderuwo sparingly (~once per 2 rounds, at least 1 per multi-round deck)
  const genderuwoSlots = Math.max(1, Math.floor(rounds / 2));
  for (let i = 0; i < genderuwoSlots; i += 1) {
    const minIdx = Math.min(deck.length, Math.max(2, Math.floor((deck.length / (genderuwoSlots + 1)) * (i + 1))));
    const jitter = Math.floor((rng() - 0.5) * 2);
    const insertAt = Math.max(2, Math.min(deck.length, minIdx + jitter));
    deck.splice(insertAt, 0, 'genderuwo');
  }
  return deck;
}

/**
 * Guards against simultaneous Genderuwo spawns, Genderuwo during active Boss encounters,
 * or back-to-back Genderuwo waves by substituting a non-Genderuwo ghost when throttled.
 */
export function resolveGhostSpawnPacing(
  candidateType: GhostType,
  allowedGhosts: readonly GhostType[],
  options: {
    activeGenderuwoCount: number;
    hasActiveBoss: boolean;
    wavesSinceLastGenderuwo: number;
  },
  rng: () => number = Math.random,
): GhostType {
  if (candidateType !== 'genderuwo') return candidateType;
  const throttled =
    options.activeGenderuwoCount > 0 ||
    options.hasActiveBoss ||
    options.wavesSinceLastGenderuwo < MIN_GENDERUWO_COOLDOWN_WAVES;
  if (!throttled) return 'genderuwo';

  const alternatives = allowedGhosts.filter((g) => g !== 'genderuwo');
  if (alternatives.length === 0) return candidateType;
  return alternatives[Math.floor(rng() * alternatives.length) % alternatives.length];
}

/**
 * Calibrates Boss Buto Ijo entrance & respawn cooldowns so boss encounters feel dramatic
 * and spaced out rather than spawning immediately at frame 0 or back-to-back every 1.5s.
 */
export function computeBossRespawnDelaySec(
  isInitial: boolean,
  bossKillsDone: number,
  targetBossKills: number,
): number {
  if (isInitial) return 5.5;
  return bossKillsDone < targetBossKills ? 9.5 : 18.0;
}

export interface LevelSoundscapeMix {
  horrorIntensity: number; // 0.20 .. 1.0 overall thematic intensity
  windGain: number; // looping wind intensity
  windFilterHz: number;
  distantGongsGain: number; // looping distant Javanese gongs intensity
  distantGongsFilterHz: number;
  rustlingLeavesGain: number; // looping rustling leaves intensity
  leavesFilterHz: number;
  baseAmbienceKey: string;
  baseAmbienceGain: number;
}

/**
 * Computes looping multi-layer ambient soundscape gains (wind, distant gongs, rustling leaves)
 * tailored to each level's nocturnal horror theme, storm intensity, and difficulty mode.
 */
export function computeLevelSoundscapeMix(
  level: {
    id: number;
    hasBoss: boolean;
    lightningEnabled: boolean;
    fogDensity: number;
    ambientAudioKey: string;
  },
  scareMode: ScareMode,
): LevelSoundscapeMix {
  const levelProgress = Math.max(0, Math.min(1, (level.id - 1) / 9));
  const themeBoost =
    (level.lightningEnabled ? 0.14 : 0) +
    (level.hasBoss ? 0.18 : 0) +
    Math.max(0, (level.fogDensity - 0.036) * 6);
  const modeScale = scareMode === 'horor' ? 1.22 : scareMode === 'santai' ? 0.78 : 1.0;

  const rawIntensity = 0.22 + levelProgress * 0.56 + themeBoost;
  const horrorIntensity = Math.max(
    0.18,
    Math.min(1.0, rawIntensity * (scareMode === 'horor' ? 1.1 : scareMode === 'santai' ? 0.85 : 1.0)),
  );

  // Theme emphasis factors based on Indonesian horror setting
  const isWindHeavy =
    level.ambientAudioKey === 'wind' || level.ambientAudioKey === 'thunder' || level.id === 8 || level.id === 10;
  const isGongHeavy =
    level.ambientAudioKey === 'spooky-gamelan' || level.hasBoss || level.id === 3 || level.id === 9;
  const isFoliageHeavy =
    level.ambientAudioKey === 'crickets' ||
    level.id === 1 ||
    level.id === 2 ||
    level.id === 4 ||
    level.id === 6;

  const windGain = Math.min(
    0.48,
    (0.11 + horrorIntensity * 0.24 + (isWindHeavy ? 0.09 : 0)) * modeScale,
  );
  const windFilterHz = Math.round(780 + horrorIntensity * 1350 + (level.lightningEnabled ? 220 : 0));

  const distantGongsGain = Math.min(
    0.44,
    (0.09 + horrorIntensity * 0.21 + (isGongHeavy ? 0.10 : 0)) * modeScale,
  );
  const distantGongsFilterHz = Math.round(1050 + horrorIntensity * 1250);

  const rustlingLeavesGain = Math.min(
    0.42,
    (0.10 + horrorIntensity * 0.17 + (isFoliageHeavy ? 0.10 : 0) + (level.lightningEnabled ? 0.04 : 0)) * modeScale,
  );
  const leavesFilterHz = Math.round(2500 + horrorIntensity * 1900);

  const baseKey = level.ambientAudioKey === 'crickets' ? 'crickets' : 'night-ambience';
  const baseAmbienceGain = baseKey === 'crickets' ? 0.12 : 0.18;

  return {
    horrorIntensity: Number(horrorIntensity.toFixed(3)),
    windGain: Number(windGain.toFixed(3)),
    windFilterHz,
    distantGongsGain: Number(distantGongsGain.toFixed(3)),
    distantGongsFilterHz,
    rustlingLeavesGain: Number(rustlingLeavesGain.toFixed(3)),
    leavesFilterHz,
    baseAmbienceKey: baseKey,
    baseAmbienceGain,
  };
}




