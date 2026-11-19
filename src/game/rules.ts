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
export function computeWeatherState(elapsedSec: number, stormyLevel: boolean): WeatherState {
  // 26-second rain cycle starting with a visible early shower (phase offset 0.85 rad)
  const wave = Math.sin(elapsedSec * 0.24 + 0.85);
  const rawDrizzle = Math.max(0, (wave - (stormyLevel ? -0.15 : 0.12)) / (stormyLevel ? 1.15 : 0.88));
  const drizzleIntensity = Math.min(1, Math.pow(rawDrizzle, 0.85) * (stormyLevel ? 1.0 : 0.72));

  // Deeper ~24s rolling fog bank cycle blended with rain surges
  const fogCycle = 0.5 + 0.5 * Math.sin(elapsedSec * 0.26 - 0.4);
  const secondarySurge = 0.5 + 0.5 * Math.sin(elapsedSec * 0.11 + 1.1);
  const fogWave = fogCycle * 0.72 + secondarySurge * 0.28;
  const fogDensityMultiplier =
    (stormyLevel ? 0.88 : 0.78) +
    fogWave * (stormyLevel ? 0.72 : 0.58) +
    drizzleIntensity * 0.24;

  const mistPulse = 0.5 + 0.5 * Math.sin(elapsedSec * 0.35);
  const mistOpacity = 0.14 + mistPulse * 0.05 + fogWave * 0.065 + drizzleIntensity * 0.035;
  const ambientMistOpacity = 0.08 + mistPulse * 0.035 + fogWave * 0.055 + drizzleIntensity * 0.025;
  const windSway = 0.12 + Math.sin(elapsedSec * 0.45) * 0.06 + drizzleIntensity * 0.08;
  return {
    drizzleIntensity,
    fogDensityMultiplier,
    mistOpacity,
    ambientMistOpacity,
    windSway,
  };
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

