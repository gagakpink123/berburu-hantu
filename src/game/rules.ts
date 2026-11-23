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

export type GyroPermissionResult = 'granted' | 'denied' | 'unsupported';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface GyroTrackerState {
  prevQuat: Quat | null;
  smoothedQuat: Quat | null;
  lastOrientDeg: number;
  lastTimeMs: number | null;
  resetPending: boolean;
}

export const GYRO_MAX_STEP_RAD = (28 * Math.PI) / 180;
export const GYRO_NOISE_FLOOR_RAD = (0.025 * Math.PI) / 180;
export const GYRO_MAX_EVENT_DELTA_RAD = (8 * Math.PI) / 180;

export function normalizeAngleDegDelta(currentDeg: number, originDeg: number): number {
  const diff = currentDeg - originDeg;
  return ((((diff + 180) % 360) + 360) % 360) - 180;
}

export function getScreenOrientationAngleDeg(): number {
  if (typeof window === 'undefined') return 0;
  const screenAngle = window.screen?.orientation?.angle;
  if (typeof screenAngle === 'number' && Number.isFinite(screenAngle)) {
    return ((screenAngle % 360) + 360) % 360;
  }
  const legacyOrientation = (window as Window & { orientation?: number }).orientation;
  if (typeof legacyOrientation === 'number' && Number.isFinite(legacyOrientation)) {
    return ((legacyOrientation % 360) + 360) % 360;
  }
  return 0;
}

function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (len <= 1e-12) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

function mulQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function conjQuat(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function slerpQuat(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }
  if (dot > 0.9995) {
    return normalizeQuat({
      x: a.x + t * (bx - a.x),
      y: a.y + t * (by - a.y),
      z: a.z + t * (bz - a.z),
      w: a.w + t * (bw - a.w),
    });
  }
  const theta0 = Math.acos(Math.min(1, dot));
  const sinTheta0 = Math.sin(theta0);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return normalizeQuat({
    x: s0 * a.x + s1 * bx,
    y: s0 * a.y + s1 * by,
    z: s0 * a.z + s1 * bz,
    w: s0 * a.w + s1 * bw,
  });
}

/**
 * Converts W3C DeviceOrientationEvent (alpha, beta, gamma) + current screen orientation
 * angle into a continuous 3D camera quaternion in screen space (YXZ Euler * -90deg X * -orient Z),
 * eliminating Euler gimbal lock jumps and handling portrait/landscape transitions seamlessly.
 */
export function deviceOrientationToScreenQuaternion(params: {
  alpha: number | null | undefined;
  beta: number;
  gamma: number;
  screenOrientDeg: number;
}): Quat {
  const deg2rad = Math.PI / 180;
  const alphaRad = (typeof params.alpha === 'number' && Number.isFinite(params.alpha) ? params.alpha : 0) * deg2rad;
  const betaRad = params.beta * deg2rad;
  const gammaRad = -params.gamma * deg2rad;
  const orientRad = (((params.screenOrientDeg % 360) + 360) % 360) * deg2rad;

  // Euler(x = betaRad, y = alphaRad, z = gammaRad, 'YXZ')
  const c1 = Math.cos(betaRad * 0.5);
  const s1 = Math.sin(betaRad * 0.5);
  const c2 = Math.cos(alphaRad * 0.5);
  const s2 = Math.sin(alphaRad * 0.5);
  const c3 = Math.cos(gammaRad * 0.5);
  const s3 = Math.sin(gammaRad * 0.5);

  const qEuler: Quat = {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  };

  // q1: rotate -90 deg around X so camera looks out the back of the device (-Z)
  const q1: Quat = { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
  // q0: rotate -orientRad around Z to align axes with portrait or landscape screen orientation
  const halfNegOrient = -orientRad * 0.5;
  const q0: Quat = { x: 0, y: 0, z: Math.sin(halfNegOrient), w: Math.cos(halfNegOrient) };

  return normalizeQuat(mulQuat(mulQuat(qEuler, q1), q0));
}

export function createGyroTrackerState(screenOrientDeg = 0): GyroTrackerState {
  return {
    prevQuat: null,
    smoothedQuat: null,
    lastOrientDeg: ((screenOrientDeg % 360) + 360) % 360,
    lastTimeMs: null,
    resetPending: true,
  };
}

export function resetGyroTrackerOnOrientation(state: GyroTrackerState | null): GyroTrackerState {
  if (!state) return createGyroTrackerState(0);
  return {
    ...state,
    resetPending: true,
  };
}

/**
 * Computes smooth, gimbal-lock-free screen-relative (dYaw, dPitch) increments from
 * consecutive DeviceOrientationEvent samples without requiring manual calibration.
 * Automatically resets smoothly across portrait <-> landscape orientation switches and
 * rejects sudden sensor/compass glitches.
 */
export function stepGyroTracker(
  state: GyroTrackerState | null,
  input: {
    alpha: number | null | undefined;
    beta: number;
    gamma: number;
    screenOrientDeg: number;
    nowMs: number;
    sensitivity: number;
  },
): { nextState: GyroTrackerState; dYaw: number; dPitch: number; didReset: boolean } {
  const orientDeg = ((input.screenOrientDeg % 360) + 360) % 360;
  const rawQuat = deviceOrientationToScreenQuaternion({
    alpha: input.alpha,
    beta: input.beta,
    gamma: input.gamma,
    screenOrientDeg: orientDeg,
  });

  if (
    !state ||
    state.resetPending ||
    !state.prevQuat ||
    !state.smoothedQuat ||
    Math.abs(normalizeAngleDegDelta(orientDeg, state.lastOrientDeg)) > 1
  ) {
    return {
      nextState: {
        prevQuat: rawQuat,
        smoothedQuat: rawQuat,
        lastOrientDeg: orientDeg,
        lastTimeMs: input.nowMs,
        resetPending: false,
      },
      dYaw: 0,
      dPitch: 0,
      didReset: true,
    };
  }

  const rawDelta = mulQuat(conjQuat(state.prevQuat), rawQuat);
  const rawStepAngle = 2 * Math.acos(Math.min(1, Math.abs(rawDelta.w)));
  if (!Number.isFinite(rawStepAngle) || rawStepAngle > GYRO_MAX_STEP_RAD) {
    return {
      nextState: {
        prevQuat: rawQuat,
        smoothedQuat: rawQuat,
        lastOrientDeg: orientDeg,
        lastTimeMs: input.nowMs,
        resetPending: false,
      },
      dYaw: 0,
      dPitch: 0,
      didReset: true,
    };
  }

  const dtSec =
    state.lastTimeMs !== null
      ? Math.max(0.004, Math.min(0.25, (input.nowMs - state.lastTimeMs) / 1000))
      : 0.016;
  const slerpAlpha = 1 - Math.exp(-28 * dtSec);
  const smoothedQuat = slerpQuat(state.smoothedQuat, rawQuat, slerpAlpha);

  let deltaQ = mulQuat(conjQuat(state.prevQuat), smoothedQuat);
  if (deltaQ.w < 0) {
    deltaQ = { x: -deltaQ.x, y: -deltaQ.y, z: -deltaQ.z, w: -deltaQ.w };
  }
  const theta = 2 * Math.acos(Math.min(1, deltaQ.w));
  let rx = 0;
  let ry = 0;
  if (theta > 1e-6) {
    const sinHalf = Math.sqrt(Math.max(1e-12, 1 - deltaQ.w * deltaQ.w));
    rx = (deltaQ.x / sinHalf) * theta;
    ry = (deltaQ.y / sinHalf) * theta;
  }

  const cleanRx = Math.abs(rx) <= GYRO_NOISE_FLOOR_RAD ? 0 : rx - Math.sign(rx) * GYRO_NOISE_FLOOR_RAD;
  const cleanRy = Math.abs(ry) <= GYRO_NOISE_FLOOR_RAD ? 0 : ry - Math.sign(ry) * GYRO_NOISE_FLOOR_RAD;
  const gain = 0.75 + 0.55 * Math.max(0.4, Math.min(2.0, input.sensitivity));

  const dPitch = Math.max(
    -GYRO_MAX_EVENT_DELTA_RAD,
    Math.min(GYRO_MAX_EVENT_DELTA_RAD, cleanRx * gain),
  );
  const dYaw = Math.max(
    -GYRO_MAX_EVENT_DELTA_RAD,
    Math.min(GYRO_MAX_EVENT_DELTA_RAD, cleanRy * gain),
  );

  return {
    nextState: {
      prevQuat: smoothedQuat,
      smoothedQuat,
      lastOrientDeg: orientDeg,
      lastTimeMs: input.nowMs,
      resetPending: false,
    },
    dYaw: dYaw === 0 ? 0 : dYaw,
    dPitch: dPitch === 0 ? 0 : dPitch,
    didReset: false,
  };
}

export async function requestGyroPermission(): Promise<GyroPermissionResult> {
  if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
    return 'unsupported';
  }
  const DevOrient = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied' | 'prompt'>;
  };
  if (typeof DevOrient.requestPermission === 'function') {
    try {
      const res = await DevOrient.requestPermission();
      return res === 'denied' ? 'denied' : 'granted';
    } catch {
      return 'denied';
    }
  }
  return 'granted';
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

export interface HandSwayState {
  yawOffset: number;
  pitchOffset: number;
  rollOffset: number;
  intensity: number;
}

/**
 * Subtle, erratic multi-harmonic camera sway simulating the player's trembling hands
 * as active ghost encounters accumulate, intensifying markedly during faceAttackActive.
 */
export function computeHandSway(params: {
  timeSec: number;
  activeGhostCount: number;
  faceAttackActive: boolean;
  activeFaceCount?: number;
  scareMode?: ScareMode;
}): HandSwayState {
  const ghostCount = Math.max(0, params.activeGhostCount);
  const faceCount = params.faceAttackActive ? Math.max(1, params.activeFaceCount ?? 1) : 0;
  if (ghostCount === 0 && faceCount === 0) {
    return { yawOffset: 0, pitchOffset: 0, rollOffset: 0, intensity: 0 };
  }

  const countPressure = Math.min(0.62, ghostCount * 0.14);
  const faceBoost = faceCount > 0 ? 0.36 + Math.max(0, faceCount - 1) * 0.12 : 0;
  const modeScale = params.scareMode === 'santai' ? 0.74 : params.scareMode === 'horor' ? 1.2 : 1.0;
  const intensity = Math.max(0, Math.min(1.25, (countPressure + faceBoost) * modeScale));

  // Incommensurate frequencies produce organic, erratic non-repeating hand tremor
  const t = params.timeSec;
  const speedMul = 1 + intensity * 0.45;
  const st = t * speedMul;

  const yawWave =
    Math.sin(st * 2.13) * 0.52 +
    Math.sin(st * 5.47 + 1.15) * 0.31 +
    Math.cos(st * 9.83 + 0.42) * 0.17;
  const pitchWave =
    Math.cos(st * 2.51 + 0.78) * 0.50 +
    Math.sin(st * 6.19 + 2.04) * 0.33 +
    Math.sin(st * 11.17 + 1.63) * 0.17;
  const rollWave =
    Math.sin(st * 3.11 + 0.35) * 0.58 +
    Math.cos(st * 7.69 + 1.41) * 0.42;

  return {
    yawOffset: yawWave * 0.0078 * intensity,
    pitchOffset: pitchWave * 0.0062 * intensity,
    rollOffset: rollWave * 0.0052 * intensity,
    intensity: Number(intensity.toFixed(3)),
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

export function calculateAccuracy(hits: number, shots: number): number {
  if (shots <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((hits / shots) * 100)));
}

export const MAX_GHOST_VANISH_BEFORE_FACE_ATTACK = 3;
export const HIGH_TARGET_GHOST_VANISH_BEFORE_FACE_ATTACK = 5;
export const HIGH_TARGET_KILLS_THRESHOLD = 20;
export const MAX_CONCURRENT_FACE_ATTACKS = 3;
export type FaceAttackSlot = 'right' | 'center' | 'left';
export const FACE_ATTACK_SLOT_ORDER: readonly FaceAttackSlot[] = ['right', 'center', 'left'];

export interface FaceAttackSlotLayout {
  xOffset: number;
  zDist: number;
  renderOrder: number;
  scaleBoost: number;
}

/**
 * Returns the target face_attack vanish threshold based on level targetKills:
 * - Standard levels (< 20 targetKills): 3 appearances/vanishes alive
 * - High-target levels (>= 20 targetKills, i.e. Levels 5-10): 5 appearances/vanishes alive
 */
export function getFaceAttackVanishThreshold(targetKills: number): number {
  return targetKills >= HIGH_TARGET_KILLS_THRESHOLD
    ? HIGH_TARGET_GHOST_VANISH_BEFORE_FACE_ATTACK
    : MAX_GHOST_VANISH_BEFORE_FACE_ATTACK;
}

/**
 * Maps active close-up ghost count (1..3 in arrival order) to screen lanes:
 * - 1 ghost:  ['center']
 * - 2 ghosts: ['left', 'right']         (1st shifts left, 2nd enters right)
 * - 3 ghosts: ['left', 'center', 'right'] (2nd shifts to center, 3rd enters right)
 */
export function getFaceAttackSlotsForCount(count: number): FaceAttackSlot[] {
  if (count <= 0) return [];
  if (count === 1) return ['center'];
  if (count === 2) return ['left', 'right'];
  return ['left', 'center', 'right'];
}

/**
 * Returns the initial spawn lane for an incoming close-up face_attack ghost
 * given how many close-up ghosts are already on screen (0 -> center, 1+ -> right).
 */
export function getIncomingFaceAttackSpawnSlot(currentActiveFaceCount: number): FaceAttackSlot {
  return currentActiveFaceCount <= 0 ? 'center' : 'right';
}

/**
 * Assigns each active close-up ghost (sorted chronologically by arrival) to its target lane.
 */
export function assignFaceAttackSlots<T extends { id: number }>(
  activeFaces: readonly T[],
): Array<{ item: T; slot: FaceAttackSlot }> {
  const ordered = [...activeFaces].sort((a, b) => a.id - b.id).slice(0, MAX_CONCURRENT_FACE_ATTACKS);
  const slots = getFaceAttackSlotsForCount(ordered.length);
  return ordered.map((item, idx) => ({ item, slot: slots[idx] }));
}

/**
 * Computes camera-space offsets and scale boost for close-up face jumpscares so up to 3 ghosts
 * loom very close to the camera lined up across left, center, and right screen lanes.
 */
export function getFaceAttackSlotLayout(slot: FaceAttackSlot): FaceAttackSlotLayout {
  switch (slot) {
    case 'right':
      return { xOffset: 0.56, zDist: 0.96, renderOrder: 31, scaleBoost: 0.98 };
    case 'center':
      return { xOffset: 0, zDist: 0.90, renderOrder: 34, scaleBoost: 1.05 };
    case 'left':
      return { xOffset: -0.56, zDist: 0.96, renderOrder: 32, scaleBoost: 0.98 };
  }
}

/**
 * Orders queued close-up face attackers by original undefeated ghost sequence (entityId ascending).
 */
export function sortPendingFaceAttackEntities<T extends { entityId: number; defeated: boolean }>(
  entities: readonly T[],
): T[] {
  return entities
    .filter((e) => !e.defeated)
    .sort((a, b) => a.entityId - b.entityId);
}

/**
 * Maps a close-up face_attack ghost's lane or animated horizontal screen coordinate
 * into stereo pan [-0.82, +0.82] so screams and whispers match its left/center/right position
 * and smoothly pan across the player's ears when shifting slots.
 */
export function getFaceAttackStereoPan(
  slot: FaceAttackSlot | null,
  faceAttackX?: number,
): number {
  if (typeof faceAttackX === 'number' && Number.isFinite(faceAttackX)) {
    const normalized = faceAttackX / 0.56;
    return Math.max(-0.82, Math.min(0.82, Number((normalized * 0.74).toFixed(3))));
  }
  if (slot === 'left') return -0.74;
  if (slot === 'right') return 0.74;
  return 0;
}

export interface FaceAttackAudioParams {
  intensity: number;         // 0.42 .. 1.30 overall approaching intensity
  screamVolume: number;      // 1.15 .. 1.95 close-up scream/roar volume
  whisperGain: number;       // 0.18 .. 0.72 continuous proximity whisper/breath gain
  proximityFilterHz: number; // 1850 .. 7800 brightness cutoff simulating ear distance
  whisperFilterHz: number;   // 1350 .. 4450 whisper sibilance presence cutoff
  whisperLfoHz: number;      // 2.10 .. 5.40 breathing cadence rate
}

/**
 * Computes monotonically increasing stereo whisper & scream audio parameters as a close-up
 * face_attack ghost lingers/approaches the player's ears or as multiple faces crowd the screen.
 */
export function computeFaceAttackAudioIntensity(params: {
  ageSec: number;
  activeFaceCount: number;
  isBoss: boolean;
}): FaceAttackAudioParams {
  const safeAge = Math.max(0, Number.isFinite(params.ageSec) ? params.ageSec : 0);
  const safeCount = Math.max(1, Math.min(MAX_CONCURRENT_FACE_ATTACKS, params.activeFaceCount || 1));
  const ageProgress = Math.max(0, Math.min(1, safeAge / 4.2));
  const crowdBoost = (safeCount - 1) / 2; // 0 for 1 face, 0.5 for 2 faces, 1 for 3 faces
  const bossBoost = params.isBoss ? 0.12 : 0;

  const intensity = Math.max(
    0.42,
    Math.min(1.30, 0.42 + ageProgress * 0.56 + crowdBoost * 0.22 + bossBoost),
  );
  const screamVolume = Math.max(
    1.15,
    Math.min(1.95, 1.15 + ageProgress * 0.48 + crowdBoost * 0.16 + (params.isBoss ? 0.12 : 0)),
  );
  const whisperGain = Math.max(
    0.18,
    Math.min(0.72, 0.18 + ageProgress * 0.32 + crowdBoost * 0.14 + (params.isBoss ? 0.06 : 0)),
  );
  const proximityFilterHz = Math.round(
    Math.min(7850, 1850 + ageProgress * 4600 + crowdBoost * 1150 + (params.isBoss ? 350 : 0)),
  );
  const whisperFilterHz = Math.round(
    Math.min(4450, 1350 + ageProgress * 2450 + crowdBoost * 650),
  );
  const whisperLfoHz = Number((2.1 + ageProgress * 2.4 + crowdBoost * 0.9).toFixed(2));

  return {
    intensity: Number(intensity.toFixed(3)),
    screamVolume: Number(screamVolume.toFixed(3)),
    whisperGain: Number(whisperGain.toFixed(3)),
    proximityFilterHz,
    whisperFilterHz,
    whisperLfoHz,
  };
}

export interface LevelGhostEntity {
  entityId: number;
  type: GhostType;
  isBoss: boolean;
  hp: number;
  maxHp: number;
  appearances: number;
  vanishCount: number;
  defeated: boolean;
  readyAtSimTime: number;
}

/**
 * Builds an exact finite ghost roster for a level so total ghosts appearing equals targetKills.
 * On boss levels (hasBoss + targetBossKills > 0), targetBossKills of those ghosts are Boss Buto Ijo
 * paced across the encounter while the remainder are regular Nusantara ghosts.
 */
export function buildLevelGhostRoster(
  level: {
    targetKills: number;
    allowedGhosts: readonly GhostType[];
    hasBoss: boolean;
    targetBossKills: number;
  },
  rng: () => number = Math.random,
): LevelGhostEntity[] {
  const total = Math.max(1, level.targetKills);
  const bossQuota = level.hasBoss ? Math.min(total, Math.max(0, level.targetBossKills)) : 0;
  const regularQuota = Math.max(0, total - bossQuota);

  const regularTypes: GhostType[] = [];
  while (regularTypes.length < regularQuota) {
    regularTypes.push(...buildPacedSpawnDeck(level.allowedGhosts, 2, rng));
  }
  const trimmedRegulars = regularTypes.slice(0, regularQuota);

  // Space Boss Buto Ijo evenly across the middle/later portions of the level roster
  const combinedTypes: GhostType[] = [...trimmedRegulars];
  if (bossQuota > 0) {
    for (let i = 0; i < bossQuota; i += 1) {
      const targetIdx = Math.min(
        combinedTypes.length,
        Math.max(2, Math.round(((i + 1) / (bossQuota + 1)) * (combinedTypes.length + i))),
      );
      combinedTypes.splice(targetIdx, 0, 'buto_ijo');
    }
  }

  return combinedTypes.slice(0, total).map((type, idx) => {
    const def = GHOST_DEFINITIONS[type];
    return {
      entityId: idx + 1,
      type,
      isBoss: Boolean(def.isBoss),
      hp: def.hp,
      maxHp: def.hp,
      appearances: 0,
      vanishCount: 0,
      defeated: false,
      readyAtSimTime: 0,
    };
  });
}

/**
 * Computes how long an undefeated ghost waits in the mist before reappearing.
 * Caps wait time when the arena currently has zero visible ghosts so pacing stays snappy.
 */
export function computeGhostReappearDelaySec(
  vanishCount: number,
  isBoss: boolean,
  activeGhostCount: number,
  rng: () => number = Math.random,
): number {
  const r = Math.max(0, Math.min(1, rng()));
  if (activeGhostCount <= 0) {
    return isBoss ? 1.1 + r * 0.6 : 0.75 + r * 0.55;
  }
  const base = isBoss ? 3.2 : 1.7;
  const pressureTrim = Math.min(0.6, vanishCount * 0.25);
  return Math.max(0.85, base - pressureTrim + r * 1.4);
}

/**
 * Updates a ghost entity when it vanishes while still alive, returning whether it must
 * immediately trigger a terrifying close-up face attack once its disappearances reach the
 * level's vanishThreshold (3 for standard levels, 5 for high-target levels).
 */
export function applyGhostVanishOutcome(
  entity: LevelGhostEntity,
  remainingHp: number,
  simTime: number,
  activeGhostCount: number,
  rng: () => number = Math.random,
  vanishThreshold = MAX_GHOST_VANISH_BEFORE_FACE_ATTACK,
): { triggerFaceAttack: boolean; delaySec: number } {
  entity.hp = Math.max(1, Math.min(entity.maxHp, remainingHp));
  entity.vanishCount += 1;
  if (entity.vanishCount >= vanishThreshold) {
    entity.readyAtSimTime = simTime + 0.28;
    return { triggerFaceAttack: true, delaySec: 0.28 };
  }
  const delaySec = computeGhostReappearDelaySec(entity.vanishCount, entity.isBoss, activeGhostCount, rng);
  entity.readyAtSimTime = simTime + delaySec;
  return { triggerFaceAttack: false, delaySec };
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

export type VoicePriority = 'ambient' | 'urgent' | 'face_attack';

export interface QueuedVoiceRequest<TMeta = unknown> {
  key: string;
  priority: VoicePriority;
  enqueuedAtMs: number;
  maxWaitMs: number;
  meta: TMeta;
}

export interface VoicePlayDecision<TMeta = unknown> {
  action: 'play_now' | 'queued' | 'dropped' | 'preempt_and_play';
  delayMs: number;
  request?: QueuedVoiceRequest<TMeta>;
}

/**
 * Single-channel voice arbitrator:
 * - Guarantees at most ONE ghost voice plays at any moment (zero overlap/collision).
 * - Strictly queues `'face_attack'` voices in screen appearance FIFO order without dropping them,
 *   while prioritizing queued `'face_attack'` ahead of other lines.
 */
export class GhostVoiceScheduler<TMeta = unknown> {
  private activeUntilMs = 0;
  private activePriority: VoicePriority | null = null;
  private pending: QueuedVoiceRequest<TMeta> | null = null;
  private faceQueue: QueuedVoiceRequest<TMeta>[] = [];
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

  public getPendingFaceCount(): number {
    return this.faceQueue.length;
  }

  public request(
    key: string,
    priority: VoicePriority,
    nowMs: number,
    meta: TMeta,
    maxWaitMs = priority === 'face_attack' ? 30000 : 1900,
  ): VoicePlayDecision<TMeta> {
    if (priority === 'face_attack') {
      const req: QueuedVoiceRequest<TMeta> = {
        key,
        priority,
        enqueuedAtMs: nowMs,
        maxWaitMs,
        meta,
      };
      if (this.isBusy(nowMs)) {
        if (this.activePriority === 'face_attack') {
          this.faceQueue.push(req);
          return {
            action: 'queued',
            delayMs: Math.max(40, Math.ceil(this.activeUntilMs - nowMs)),
            request: req,
          };
        }
        // Preempt non-face ambient/urgent line immediately so face_attack voices play right away
        if (this.faceQueue.length === 0) {
          this.activeUntilMs = 0;
          this.activePriority = null;
          this.pending = null;
          return {
            action: 'preempt_and_play',
            delayMs: 0,
            request: req,
          };
        }
        this.faceQueue.push(req);
        return {
          action: 'queued',
          delayMs: Math.max(40, Math.ceil(this.activeUntilMs - nowMs)),
          request: req,
        };
      }
      return {
        action: 'play_now',
        delayMs: 0,
        request: req,
      };
    }

    if (this.isBusy(nowMs) || this.faceQueue.length > 0) {
      if (priority === 'urgent' && this.activePriority !== 'face_attack' && this.faceQueue.length === 0) {
        // Keep only the freshest non-face urgent line waiting (max 1 slot) so lines never pile up
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

  public markStarted(durationSec: number, nowMs: number, priority: VoicePriority = 'ambient'): void {
    const durMs = Math.max(350, Math.min(25000, Math.round(durationSec * 1000)));
    this.lastVoiceEndMs = nowMs + durMs;
    this.activeUntilMs = nowMs + durMs + this.interVoiceGapMs;
    this.activePriority = priority;
  }

  public markEnded(nowMs: number): void {
    this.lastVoiceEndMs = nowMs;
    this.activeUntilMs = nowMs + Math.min(180, this.interVoiceGapMs);
    this.activePriority = null;
  }

  public consumePending(nowMs: number): QueuedVoiceRequest<TMeta> | null {
    if (this.isBusy(nowMs)) return null;

    while (this.faceQueue.length > 0) {
      const nextFace = this.faceQueue.shift()!;
      if (nowMs - nextFace.enqueuedAtMs <= nextFace.maxWaitMs) {
        return nextFace;
      }
    }

    const req = this.pending;
    this.pending = null;
    if (!req) return null;
    if (nowMs - req.enqueuedAtMs > req.maxWaitMs) return null;
    return req;
  }

  public clear(): void {
    this.activeUntilMs = 0;
    this.activePriority = null;
    this.lastVoiceEndMs = -10000;
    this.pending = null;
    this.faceQueue = [];
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
 * Formats concise techno-radar Indonesian ghost notifications strictly for the top-center slider.
 */
export function formatGhostSpawnAlert(
  ghostType: GhostType,
  isBoss: boolean,
  propType?: string,
  appearanceNum = 1,
  vanishThreshold = MAX_GHOST_VANISH_BEFORE_FACE_ATTACK,
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
  if (appearanceNum > 1) {
    return {
      title: `MUNCUL LAGI (${appearanceNum}/${vanishThreshold}) // ${def.name.toUpperCase()}`,
      detail: zone,
    };
  }
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

export function formatGhostVanishAlert(
  ghostType: GhostType,
  hpLeft: number,
  vanishCount: number,
  vanishThreshold = MAX_GHOST_VANISH_BEFORE_FACE_ATTACK,
): { title: string; detail: string } {
  const def = GHOST_DEFINITIONS[ghostType];
  if (vanishCount >= vanishThreshold) {
    return {
      title: `AWAS // ${def.name.toUpperCase()} MENGHILANG ${vanishThreshold}×!`,
      detail: `MENDEKAT (${hpLeft} HP)`,
    };
  }
  return {
    title: `KABUT // ${def.name.toUpperCase()} MENGHILANG (${vanishCount}/${vanishThreshold})`,
    detail: `SISA ${hpLeft} HP`,
  };
}

export function formatFaceAttackAlert(ghostType: GhostType, hpLeft: number): { title: string; detail: string } {
  const def = GHOST_DEFINITIONS[ghostType];
  return {
    title: `BAHAYA DEKAT // WAJAH ${def.name.toUpperCase()}!`,
    detail: `TEMBAK (${hpLeft} HP)`,
  };
}

export function formatGhostDefeatAlert(
  ghostType: GhostType,
  isBoss: boolean,
  remainingTarget: number,
): { title: string; detail: string } {
  const def = GHOST_DEFINITIONS[ghostType];
  return {
    title: isBoss
      ? `BOSS TUMBANG // ${def.name.toUpperCase()} KALAH!`
      : `TERELIMINASI // ${def.name.toUpperCase()} KALAH!`,
    detail: remainingTarget > 0 ? `SISA TARGET: ${remainingTarget}` : 'SEMUA TARGET SELESAI!',
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

export const TITLE_SUBTITLE_INTERVAL_MS = 9000;

export const TITLE_SUBTITLES: readonly string[] = [
  'Hantu Juga Seperti Manusia, Tak Selayaknya Kamu Tembaki',
  'Stop Kekerasan terhadap Makhluk Halus, Mari Hidup Berdampingan',
  'Apa Salah Mereka sampai Harus Ditembak? Mereka Cuma Butuh Pengertian',
  'Jangan Asal Tembak, Makhluk Gaib Juga Punya Perasaan',
  'Keadilan bagi Seluruh Makhluk Gaib di Tengah Keserakahan Manusia',
  'Hidup Berdampingan Jauh Lebih Indah daripada Saling Menembak',
  'Simpan Senjatamu, Ajak Mereka Berdialog di Tengah Malam Sambil Ngopi',
  'Mengapa Harus Dimusuhi Jika Kita Bisa Berbagi di Ruang Semesta',
  'Mereka Hanya Penunggu Lama, Bukan Target Latihan Menembakmu',
  'Apa Dosa Mereka hingga Layak Kamu Musnahkan?',
  'Yakin Mau Menembak? Mereka Cuma Cari Perhatian dari Kamu yang Cuek',
  'Siapa Sebenarnya yang Menyeramkan: Hantunya, atau Kamu yang Bawa Senjata?!',
  'Mereka Tak Pernah Minta Dilahirkan Jadi Hantu, Kenapa Dimusuhi?',
  'Sebelum Menarik Pelatuk, Tanyakan pada Dirimu: Apa Salah Mereka?',
  'Kasihan Mereka, Sudah Meninggal Masih Saja Jadi Target Tembak',
  'Daripada Ditembak, Bukankah Lebih Baik Kita Berteman Saja',
  'Katanya Pemburu Profesional, Kok Lawannya Makhluk Halus yang Tak Bersalah?',
  'Mereka Sudah Lama Tinggal di Sana, Kamu yang Datang Bawa Senjata, Dasar Penjajah!',
  'Berdamai dengan Masa Lalu Lebih Mulia daripada Menembaki Hantu yang Tidak Bawa Senjata',
  'Turunkan Senjatamu, Pahlawan Sejati Tidak Menembak Makhluk yang Sudah Tiada',
  'Beda Alam Bukan Alasan untuk Saling Menyerang di Tengah Gelapnya Malam',
  'Katanya Menjaga Ketertiban, Kok Malah Menembaki Hantu yang Sedang Jalan-Jalan',
];

export function pickNextRandomSubtitleIndex(
  currentIndex: number,
  total: number,
  rand = Math.random,
): number {
  if (total <= 1) return 0;
  const candidate = Math.floor(Math.max(0, Math.min(0.9999999, rand())) * (total - 1));
  return candidate >= currentIndex ? candidate + 1 : candidate;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function isIosDevice(
  userAgent: string,
  maxTouchPoints = 0,
  platform = '',
): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  if ((/Macintosh/i.test(userAgent) || platform === 'MacIntel') && maxTouchPoints > 1) {
    return true;
  }
  return false;
}

export function supportsNativeElementFullscreen(
  el:
    | {
        requestFullscreen?: unknown;
        webkitRequestFullscreen?: unknown;
      }
    | null
    | undefined,
): boolean {
  if (!el) return false;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

export function getEffectiveViewportSize(input: {
  innerWidth: number;
  innerHeight: number;
  visualWidth?: number | null;
  visualHeight?: number | null;
}): ViewportDimensions {
  const vw =
    typeof input.visualWidth === 'number' && Number.isFinite(input.visualWidth) && input.visualWidth > 0
      ? input.visualWidth
      : input.innerWidth;
  const vh =
    typeof input.visualHeight === 'number' && Number.isFinite(input.visualHeight) && input.visualHeight > 0
      ? input.visualHeight
      : input.innerHeight;
  return {
    width: Math.max(1, Math.round(vw)),
    height: Math.max(1, Math.round(vh)),
  };
}

export function computeRendererPixelRatio(input: {
  isSoftwareGl: boolean;
  isIos: boolean;
}): number {
  if (input.isSoftwareGl) return 0.5;
  if (input.isIos) return 0.75;
  return 1;
}

export function computeMenuSafeAreaInsets(
  raw: SafeAreaInsets,
  viewport: ViewportDimensions,
  stageScale: number,
  menuUiScale: number,
): SafeAreaInsets {
  const safeStageScale = Math.max(0.05, stageScale);
  const totalScale = Math.max(0.05, safeStageScale * menuUiScale);
  const marginX = Math.max(0, (viewport.width - FIXED_STAGE_WIDTH * safeStageScale) / 2);
  const marginY = Math.max(0, (viewport.height - FIXED_STAGE_HEIGHT * safeStageScale) / 2);

  const convert = (inset: number, margin: number) => {
    const net = Math.max(0, inset - margin);
    return Math.min(96, Math.round(net / totalScale));
  };

  return {
    top: convert(raw.top, marginY),
    right: convert(raw.right, marginX),
    bottom: convert(raw.bottom, marginY),
    left: convert(raw.left, marginX),
  };
}

export interface GhostExplosionColorTheme {
  smokeHex: readonly number[];
  particleHex: readonly number[];
  flashHex: number;
  ringHex: readonly number[];
}

const WHITE_EXPLOSION_THEME: GhostExplosionColorTheme = {
  smokeHex: [0xffffff, 0xf2f6fa, 0xe2e8f0, 0xd4dde6],
  particleHex: [0xffffff, 0xf8fafc, 0xeef4fa, 0xdfe8f2],
  flashHex: 0xffffff,
  ringHex: [0xffffff, 0xf1f5f9, 0xe2e8f0, 0xffffff],
};

const RED_EXPLOSION_THEME: GhostExplosionColorTheme = {
  smokeHex: [0xd92626, 0xef4444, 0xb91c1c, 0x991b1b],
  particleHex: [0xff4d4d, 0xff2a2a, 0xff7a7a, 0xdc2626],
  flashHex: 0xff3b3b,
  ringHex: [0xff3b3b, 0xef4444, 0xff8585, 0xdc2626],
};

const GREEN_EXPLOSION_THEME: GhostExplosionColorTheme = {
  smokeHex: [0x22c55e, 0x16a34a, 0x4ade80, 0x15803d],
  particleHex: [0x4ade80, 0x22c55e, 0x16a34a, 0x39ff7a],
  flashHex: 0x39ff7a,
  ringHex: [0x4ade80, 0x22c55e, 0x16a34a, 0x39ff7a],
};

/**
 * Character-matched death smoke & flying particle colors:
 * - Tuyul, Pocong, Kuntilanak -> White
 * - Genderuwo -> Red
 * - Buto Ijo -> Green
 */
export function getGhostExplosionColorTheme(ghostType: GhostType): GhostExplosionColorTheme {
  switch (ghostType) {
    case 'genderuwo':
      return RED_EXPLOSION_THEME;
    case 'buto_ijo':
      return GREEN_EXPLOSION_THEME;
    case 'tuyul':
    case 'pocong':
    case 'kuntilanak':
    default:
      return WHITE_EXPLOSION_THEME;
  }
}

export const SMOKE_CENTER_MAX_ALPHA = 0.6;
export const EXPLOSION_PARTICLE_OPACITY = 0.15;
export const EXPLOSION_OVAL_LIGHT_OPACITY = 0.2;

export interface FaceAttackEntranceState {
  opacity: number;
  scaleMultiplier: number;
  tremorX: number;
  tremorY: number;
  rotationZ: number;
  allowShake: boolean;
}

/**
 * Computes close-up `face_attack` entrance & motion behavior:
 * - Kuntilanak fades in slowly and hovers smoothly in the air with ZERO shake.
 * - Other ghosts slam onto the screen via a super-fast zoom-out from oversized scale -> 1.0 with tight recoil.
 */
export function computeFaceAttackEntranceState(input: {
  ghostType: GhostType;
  ageSec: number;
  elapsedSec: number;
  wobbleAngle: number;
  movePhase: number;
}): FaceAttackEntranceState {
  const age = Math.max(0, input.ageSec);
  if (input.ghostType === 'kuntilanak') {
    const fadeT = Math.min(1, age / 1.45);
    const opacity = fadeT * fadeT * (3 - 2 * fadeT);
    const floatBlend = Math.min(1, opacity * 1.15);
    const floatX = Math.sin(input.elapsedSec * 0.78 + input.movePhase) * 0.045 * floatBlend;
    const floatY = Math.sin(input.elapsedSec * 1.12 + input.movePhase * 1.37) * 0.072 * floatBlend;
    const floatTilt = Math.sin(input.elapsedSec * 0.62 + input.movePhase * 0.85) * 0.022 * floatBlend;
    const breatheScale = Math.sin(input.elapsedSec * 0.92 + input.movePhase) * 0.014 * floatBlend;
    const driftScale = 0.94 + 0.06 * opacity + breatheScale;
    return {
      opacity,
      scaleMultiplier: driftScale,
      tremorX: floatX || 0,
      tremorY: floatY || 0,
      rotationZ: floatTilt || 0,
      allowShake: false,
    };
  }

  let zoomOutCurve: number;
  if (age < 0.075) {
    // Super-fast zoom-out from screen (starts huge at 2.65x right in player's face, slams back to 0.93x)
    const u = age / 0.075;
    const easeOut = 1 - Math.pow(1 - u, 3);
    zoomOutCurve = 2.65 + (0.93 - 2.65) * easeOut;
  } else if (age < 0.28) {
    // Crisp recoil settle around 1.0
    const v = (age - 0.075) / 0.205;
    zoomOutCurve = 1.0 - 0.09 * Math.exp(-5.0 * v) * Math.cos(v * Math.PI * 2.5);
  } else {
    zoomOutCurve = 1.0 + Math.sin(input.elapsedSec * 20.0 + input.movePhase) * 0.028;
  }

  return {
    opacity: 1,
    scaleMultiplier: zoomOutCurve,
    tremorX: Math.sin(input.elapsedSec * 34.0 + input.movePhase) * 0.024,
    tremorY: Math.cos(input.elapsedSec * 29.0 + input.movePhase) * 0.02,
    rotationZ: input.wobbleAngle * 0.55 + Math.sin(input.elapsedSec * 18.0 + input.movePhase) * 0.042,
    allowShake: true,
  };
}

export const LEVEL_FADE_OUT_MS = 1050;
export const LEVEL_FADE_HOLD_MS = 140;
export const LEVEL_FADE_IN_MS = 1250;

export function computeLevelCurtainOpacity(
  phase: 'idle' | 'fading_out' | 'holding' | 'fading_in',
  progress01: number,
): number {
  const t = Math.max(0, Math.min(1, progress01));
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  if (phase === 'holding') return 1;
  if (phase === 'fading_out') return eased;
  if (phase === 'fading_in') return 1 - eased;
  return 0;
}

export const TITLE_GHOST_VOICE_TYPES: readonly GhostType[] = [
  'tuyul',
  'pocong',
  'kuntilanak',
  'genderuwo',
  'buto_ijo',
];

export const TITLE_GHOST_VOICE_INITIAL_MIN_DELAY_MS = 3500;
export const TITLE_GHOST_VOICE_INITIAL_MAX_DELAY_MS = 6000;
export const TITLE_GHOST_VOICE_MIN_DELAY_MS = 12000;
export const TITLE_GHOST_VOICE_MAX_DELAY_MS = 19000;

export function pickRandomTitleGhostVoiceKey(
  lastGhostType: GhostType | null,
  rng: () => number = Math.random,
): { ghostType: GhostType; key: string } {
  const pool =
    lastGhostType !== null
      ? TITLE_GHOST_VOICE_TYPES.filter((t) => t !== lastGhostType)
      : TITLE_GHOST_VOICE_TYPES;
  const r = Math.max(0, Math.min(0.9999999, rng()));
  const ghostType = pool[Math.floor(r * pool.length)];
  const folder = ghostType === 'buto_ijo' ? 'buto-ijo' : ghostType;
  return {
    ghostType,
    key: `ghosts/${folder}/voice`,
  };
}

export function computeTitleGhostVoiceDelayMs(
  isInitial: boolean,
  rng: () => number = Math.random,
): number {
  const r = Math.max(0, Math.min(1, rng()));
  const min = isInitial ? TITLE_GHOST_VOICE_INITIAL_MIN_DELAY_MS : TITLE_GHOST_VOICE_MIN_DELAY_MS;
  const max = isInitial ? TITLE_GHOST_VOICE_INITIAL_MAX_DELAY_MS : TITLE_GHOST_VOICE_MAX_DELAY_MS;
  return Math.round(min + r * (max - min));
}


