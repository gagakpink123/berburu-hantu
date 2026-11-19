export type GhostType = 'tuyul' | 'pocong' | 'kuntilanak' | 'genderuwo' | 'buto_ijo';

export type ScareMode = 'santai' | 'petualangan' | 'horor';

export type GamePhase = 'loading' | 'title' | 'playing' | 'paused' | 'gameover';

export type GameOutcome = 'victory' | 'defeat' | null;

export type SpawnPattern =
  | 'peek'
  | 'fade'
  | 'jumpscare'
  | 'emerge'
  | 'float'
  | 'run'
  | 'teleport';

export type PropAnchorType =
  | 'tombstone'
  | 'bush'
  | 'tree'
  | 'banyan'
  | 'banana'
  | 'perched_tree'
  | 'perched_tomb'
  | 'joglo'
  | 'well'
  | 'statue'
  | 'gate'
  | 'mist'
  | 'bridge'
  | 'ruin'
  | 'boiler'
  | 'cliff'
  | 'candi'
  | 'stupa'
  | 'volcano'
  | 'mangrove';

export interface GhostDefinition {
  type: GhostType;
  name: string;
  subtitle: string;
  hp: number;
  baseScore: number;
  imageUrl: string;
  worldHeight: number;
  hoverHeight: number;
  auraColor: number;
  comedyNote: string;
  mythExplanation: string;
  mythOrigin: string;
  hunterTip: string;
  isBoss?: boolean;
}

export interface LevelConfig {
  id: number;
  name: string;
  subtitle: string;
  difficultyLabel: string;
  description: string;
  previewImage: string;
  durationSec: number;
  targetKills: number;
  targetScore: number;
  maxConcurrentGhosts: number;
  spawnIntervalSec: number;
  ghostStaySec: number;
  ghostSpeedMul: number;
  allowedGhosts: GhostType[];
  hasBoss: boolean;
  targetBossKills: number;
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  keyLightColor: number;
  keyLightIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  ambientAudioKey: string;
  musicKey: string;
  lightningEnabled: boolean;
}

export interface GameSettings {
  scareMode: ScareMode;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  cameraSensitivity: number;
  pointerAimEnabled: boolean;
}

export interface TargetedGhostHud {
  name: string;
  type: GhostType;
  hp: number;
  maxHp: number;
  isBoss: boolean;
}

export interface ScorePopupEvent {
  id: number;
  text: string;
  subtext?: string;
  xPct: number;
  yPct: number;
  isBoss?: boolean;
}

export interface KillCamHudState {
  active: boolean;
  ghostName: string;
  isBoss: boolean;
  progress: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  outcome: GameOutcome;
  levelId: number;
  levelName: string;
  score: number;
  highScore: number;
  combo: number;
  maxCombo: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
  kills: number;
  targetKills: number;
  bossKills: number;
  targetBossKills: number;
  timeLeft: number;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  targetedGhost: TargetedGhostHud | null;
  bossInfo: { name: string; hp: number; maxHp: number; active: boolean } | null;
  killCam: KillCamHudState | null;
  activeGhostCount: number;
  cameraYawDeg: number;
  cameraPitchDeg: number;
  accuracyBonus: number;
  comboBonus: number;
  ghostAttacksReceived: number;
}

export interface LoadProgress {
  loaded: number;
  total: number;
  percent: number;
  ready: boolean;
  failedAssets: string[];
  stageLabel?: string;
}
