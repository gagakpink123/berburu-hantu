import {
  GhostVoiceScheduler,
  getAmbienceTargetGain,
  isGhostVoiceAudioKey,
  type LevelSoundscapeMix,
} from './rules';
import type { GameSettings, GhostType, LoadProgress } from './types';

export const AUDIO_MANIFEST: Record<string, string> = {
  // Music
  'music/main-menu': '/assets/audio/music/main-menu.mp3',
  'music/level-1': '/assets/audio/music/level-1.mp3',
  'music/level-2': '/assets/audio/music/level-2.mp3',
  'music/level-3': '/assets/audio/music/level-3.mp3',
  'music/level-4': '/assets/audio/music/level-4.mp3',
  'music/level-5-boss': '/assets/audio/music/level-5-boss.mp3',

  // Ghost: Tuyul
  'ghosts/tuyul/laugh': '/assets/audio/ghosts/tuyul/laugh.mp3',
  'ghosts/tuyul/voice': '/assets/audio/ghosts/tuyul/voice.mp3',
  'ghosts/tuyul/taunt': '/assets/audio/ghosts/tuyul/taunt.mp3',
  'ghosts/tuyul/appear': '/assets/audio/ghosts/tuyul/appear.mp3',
  'ghosts/tuyul/move': '/assets/audio/ghosts/tuyul/move.mp3',
  'ghosts/tuyul/hit': '/assets/audio/ghosts/tuyul/hit.mp3',
  'ghosts/tuyul/defeat': '/assets/audio/ghosts/tuyul/defeat.mp3',

  // Ghost: Pocong
  'ghosts/pocong/appear': '/assets/audio/ghosts/pocong/appear.mp3',
  'ghosts/pocong/jump': '/assets/audio/ghosts/pocong/jump.mp3',
  'ghosts/pocong/groan': '/assets/audio/ghosts/pocong/groan.mp3',
  'ghosts/pocong/voice': '/assets/audio/ghosts/pocong/voice.mp3',
  'ghosts/pocong/hit': '/assets/audio/ghosts/pocong/hit.mp3',
  'ghosts/pocong/defeat': '/assets/audio/ghosts/pocong/defeat.mp3',

  // Ghost: Kuntilanak
  'ghosts/kuntilanak/laugh': '/assets/audio/ghosts/kuntilanak/laugh.mp3',
  'ghosts/kuntilanak/scream': '/assets/audio/ghosts/kuntilanak/scream.mp3',
  'ghosts/kuntilanak/voice': '/assets/audio/ghosts/kuntilanak/voice.mp3',
  'ghosts/kuntilanak/appear': '/assets/audio/ghosts/kuntilanak/appear.mp3',
  'ghosts/kuntilanak/move': '/assets/audio/ghosts/kuntilanak/move.mp3',
  'ghosts/kuntilanak/hit': '/assets/audio/ghosts/kuntilanak/hit.mp3',
  'ghosts/kuntilanak/defeat': '/assets/audio/ghosts/kuntilanak/defeat.mp3',

  // Ghost: Genderuwo
  'ghosts/genderuwo/growl': '/assets/audio/ghosts/genderuwo/growl.mp3',
  'ghosts/genderuwo/voice': '/assets/audio/ghosts/genderuwo/voice.mp3',
  'ghosts/genderuwo/roar': '/assets/audio/ghosts/genderuwo/roar.mp3',
  'ghosts/genderuwo/pebble': '/assets/audio/ghosts/genderuwo/pebble.mp3',
  'ghosts/genderuwo/appear': '/assets/audio/ghosts/genderuwo/appear.mp3',
  'ghosts/genderuwo/footsteps': '/assets/audio/ghosts/genderuwo/footsteps.mp3',
  'ghosts/genderuwo/hit': '/assets/audio/ghosts/genderuwo/hit.mp3',
  'ghosts/genderuwo/defeat': '/assets/audio/ghosts/genderuwo/defeat.mp3',

  // Ghost: Buto Ijo
  'ghosts/buto-ijo/roar': '/assets/audio/ghosts/buto-ijo/roar.mp3',
  'ghosts/buto-ijo/voice': '/assets/audio/ghosts/buto-ijo/voice.mp3',
  'ghosts/buto-ijo/appear': '/assets/audio/ghosts/buto-ijo/appear.mp3',
  'ghosts/buto-ijo/footsteps': '/assets/audio/ghosts/buto-ijo/footsteps.mp3',
  'ghosts/buto-ijo/hit': '/assets/audio/ghosts/buto-ijo/hit.mp3',
  'ghosts/buto-ijo/rage': '/assets/audio/ghosts/buto-ijo/rage.mp3',
  'ghosts/buto-ijo/defeat': '/assets/audio/ghosts/buto-ijo/defeat.mp3',

  // Weapon
  'weapon/shoot': '/assets/audio/weapon/shoot.mp3',
  'weapon/impact': '/assets/audio/weapon/impact.mp3',
  'weapon/miss': '/assets/audio/weapon/miss.mp3',
  'weapon/reload': '/assets/audio/weapon/reload.mp3',

  // Environment
  'environment/night-ambience': '/assets/audio/environment/night-ambience.mp3',
  'environment/wind': '/assets/audio/environment/wind.mp3',
  'environment/crickets': '/assets/audio/environment/crickets.mp3',
  'environment/owl': '/assets/audio/environment/owl.mp3',
  'environment/wolf': '/assets/audio/environment/wolf.mp3',
  'environment/thunder': '/assets/audio/environment/thunder.mp3',
  'environment/leaves': '/assets/audio/environment/leaves.mp3',
  'environment/spooky-gamelan': '/assets/audio/environment/spooky-gamelan.mp3',

  // UI
  'ui/click': '/assets/audio/ui/click.mp3',
  'ui/level-complete': '/assets/audio/ui/level-complete.mp3',
  'ui/game-over': '/assets/audio/ui/game-over.mp3',
  'ui/score': '/assets/audio/ui/score.mp3',
  'ui/combo': '/assets/audio/ui/combo.mp3',
};

export class GameAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private soundscapeGain: GainNode | null = null;
  private rawBytes = new Map<string, ArrayBuffer>();
  private decodedBuffers = new Map<string, AudioBuffer>();
  private cooldowns = new Map<string, number>();
  private activeSfxCount = 0;

  private currentMusicSource: AudioBufferSourceNode | null = null;
  private currentMusicGain: GainNode | null = null;
  private currentMusicKey: string | null = null;

  private currentAmbienceSource: AudioBufferSourceNode | null = null;
  private currentAmbienceGain: GainNode | null = null;
  private currentAmbienceKey: string | null = null;
  private activeSoundscapeMix: LevelSoundscapeMix | null = null;
  private soundscapeRequested = false;
  private soundscapeStarting = false;
  private soundscapeLayers = new Map<
    'wind' | 'gongs' | 'leaves' | 'base',
    {
      key: string;
      source: AudioBufferSourceNode;
      filter: BiquadFilterNode;
      panner: StereoPannerNode | null;
      gain: GainNode;
      targetGain: number;
    }
  >();
  private voiceDuckUntilMs = 0;
  private voiceDuckTimeout: number | null = null;

  private readonly voiceScheduler = new GhostVoiceScheduler<{
    pan?: number;
    volume: number;
    duckMusic: boolean;
  }>(260, 950);
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private queuedVoiceTimer: number | null = null;

  private settings: GameSettings = {
    scareMode: 'petualangan',
    musicVolume: 0.6,
    sfxVolume: 0.85,
    muted: false,
    cameraSensitivity: 1.0,
    pointerAimEnabled: true,
  };

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.soundscapeGain = this.ctx.createGain();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.14;
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.soundscapeGain.connect(this.masterGain);
      this.masterGain.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.applyVolumes();
    }
    return this.ctx;
  }

  public async preloadAll(onProgress?: (progress: LoadProgress) => void): Promise<LoadProgress> {
    const entries = Object.entries(AUDIO_MANIFEST);
    const total = entries.length;
    let loaded = 0;
    const failedAssets: string[] = [];

    const batchSize = 8;
    for (let i = 0; i < entries.length; i += batchSize) {
      const slice = entries.slice(i, i + batchSize);
      await Promise.all(
        slice.map(async ([key, url]) => {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = await res.arrayBuffer();
            this.rawBytes.set(key, buf);
          } catch {
            failedAssets.push(url);
          } finally {
            loaded += 1;
            onProgress?.({
              loaded,
              total,
              percent: Math.round((loaded / total) * 100),
              ready: loaded === total,
              failedAssets: [...failedAssets],
            });
          }
        }),
      );
    }

    return {
      loaded,
      total,
      percent: 100,
      ready: true,
      failedAssets,
    };
  }

  public async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignore if autoplay blocked until next interaction
      }
    }
    if (ctx.state === 'running') {
      if (this.currentMusicKey && !this.currentMusicSource) {
        this.playMusic(this.currentMusicKey);
      }
      if (this.soundscapeRequested && this.activeSoundscapeMix && this.soundscapeLayers.size === 0) {
        void this.startGameplaySoundscape(this.activeSoundscapeMix);
      } else if (this.currentAmbienceKey && !this.currentAmbienceSource && !this.soundscapeRequested) {
        this.playAmbience(this.currentAmbienceKey);
      }
    }
  }

  public updateSettings(next: GameSettings): void {
    this.settings = { ...next };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const isDucked = performance.now() < this.voiceDuckUntilMs;
    this.masterGain.gain.setTargetAtTime(this.settings.muted ? 0 : 1, now, 0.04);
    this.musicGain.gain.setTargetAtTime(
      isDucked ? this.settings.musicVolume * 0.36 : this.settings.musicVolume,
      now,
      0.08,
    );
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.04);
    if (this.soundscapeGain) {
      const envVol = Math.max(this.settings.sfxVolume * 0.78, this.settings.musicVolume * 0.52);
      this.soundscapeGain.gain.setTargetAtTime(isDucked ? envVol * 0.62 : envVol, now, 0.1);
    }
  }

  private duckMusicForVoice(durationSec: number): void {
    const holdMs = Math.min(4200, Math.max(900, Math.round(durationSec * 1000)));
    this.voiceDuckUntilMs = Math.max(this.voiceDuckUntilMs, performance.now() + holdMs);
    this.applyVolumes();
    if (this.voiceDuckTimeout !== null) {
      window.clearTimeout(this.voiceDuckTimeout);
    }
    this.voiceDuckTimeout = window.setTimeout(() => {
      this.voiceDuckTimeout = null;
      this.applyVolumes();
    }, holdMs + 40);
  }

  private async getDecoded(key: string): Promise<AudioBuffer | null> {
    if (this.decodedBuffers.has(key)) {
      return this.decodedBuffers.get(key) ?? null;
    }
    const ctx = this.ensureContext();
    if (!ctx) return null;
    let raw = this.rawBytes.get(key);
    if (!raw) {
      const url = AUDIO_MANIFEST[key];
      if (!url) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        raw = await res.arrayBuffer();
        this.rawBytes.set(key, raw);
      } catch {
        return null;
      }
    }
    try {
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      this.decodedBuffers.set(key, decoded);
      return decoded;
    } catch {
      return null;
    }
  }

  public async playMusic(musicKey: string): Promise<void> {
    const fullKey = musicKey.startsWith('music/') ? musicKey : `music/${musicKey}`;
    if (this.currentMusicKey === fullKey && this.currentMusicSource) return;
    this.currentMusicKey = fullKey;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain || ctx.state !== 'running') return;

    const buffer = await this.getDecoded(fullKey);
    if (!buffer || this.currentMusicKey !== fullKey) return;

    // Fade out previous music
    if (this.currentMusicSource && this.currentMusicGain) {
      const oldSrc = this.currentMusicSource;
      const oldGain = this.currentMusicGain;
      const t = ctx.currentTime;
      oldGain.gain.cancelScheduledValues(t);
      oldGain.gain.setValueAtTime(oldGain.gain.value, t);
      oldGain.gain.linearRampToValueAtTime(0.0001, t + 0.55);
      window.setTimeout(() => {
        try {
          oldSrc.stop();
          oldSrc.disconnect();
        } catch {
          // ignore
        }
      }, 600);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.65, now + 0.85);
    src.connect(g);
    g.connect(this.musicGain);
    src.start(0);

    this.currentMusicSource = src;
    this.currentMusicGain = g;
  }

  private fadeOutSingleAmbience(): void {
    if (!this.ctx || !this.currentAmbienceSource || !this.currentAmbienceGain) return;
    const oldSrc = this.currentAmbienceSource;
    const oldGain = this.currentAmbienceGain;
    this.currentAmbienceSource = null;
    this.currentAmbienceGain = null;
    const t = this.ctx.currentTime;
    oldGain.gain.cancelScheduledValues(t);
    oldGain.gain.setValueAtTime(oldGain.gain.value, t);
    oldGain.gain.linearRampToValueAtTime(0.0001, t + 0.45);
    window.setTimeout(() => {
      try {
        oldSrc.stop();
        oldSrc.disconnect();
      } catch {
        // ignore
      }
    }, 500);
  }

  public async playAmbience(envKey: string): Promise<void> {
    const fullKey = envKey.startsWith('environment/') ? envKey : `environment/${envKey}`;
    if (this.currentAmbienceKey === fullKey && this.currentAmbienceSource) return;
    this.currentAmbienceKey = fullKey;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain || ctx.state !== 'running') return;

    const buffer = await this.getDecoded(fullKey);
    if (!buffer || this.currentAmbienceKey !== fullKey || this.soundscapeRequested) return;

    this.fadeOutSingleAmbience();

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(getAmbienceTargetGain(fullKey), now + 0.8);
    src.connect(g);
    g.connect(this.musicGain);
    src.start(0);

    this.currentAmbienceSource = src;
    this.currentAmbienceGain = g;
  }

  /**
   * Starts simultaneous looping gameplay ambient soundscape layers
   * (wind, distant gongs, rustling leaves, and base nocturnal bed) calibrated to the level's horror theme.
   */
  public async startGameplaySoundscape(mix: LevelSoundscapeMix): Promise<void> {
    this.activeSoundscapeMix = { ...mix };
    this.soundscapeRequested = true;
    this.currentAmbienceKey = null;

    const ctx = this.ensureContext();
    if (!ctx || !this.soundscapeGain || ctx.state !== 'running') return;
    if (this.soundscapeStarting) return;
    this.soundscapeStarting = true;

    try {
      this.fadeOutSingleAmbience();
      this.teardownSoundscapeLayers(0.25);

      const layerSpecs: Array<{
        id: 'wind' | 'gongs' | 'leaves' | 'base';
        key: string;
        gain: number;
        filterHz: number;
        pan: number;
        offsetSec: number;
      }> = [
        {
          id: 'wind',
          key: 'environment/wind',
          gain: mix.windGain,
          filterHz: mix.windFilterHz,
          pan: 0,
          offsetSec: 0,
        },
        {
          id: 'gongs',
          key: 'environment/spooky-gamelan',
          gain: mix.distantGongsGain,
          filterHz: mix.distantGongsFilterHz,
          pan: -0.22,
          offsetSec: 0.4,
        },
        {
          id: 'leaves',
          key: 'environment/leaves',
          gain: mix.rustlingLeavesGain,
          filterHz: mix.leavesFilterHz,
          pan: 0.24,
          offsetSec: 0.2,
        },
        {
          id: 'base',
          key: `environment/${mix.baseAmbienceKey}`,
          gain: mix.baseAmbienceGain,
          filterHz: 4800,
          pan: 0,
          offsetSec: 0,
        },
      ];

      const decoded = await Promise.all(
        layerSpecs.map(async (spec) => ({
          spec,
          buffer: await this.getDecoded(spec.key),
        })),
      );

      if (!this.soundscapeRequested || !this.ctx || !this.soundscapeGain) return;
      const latestMix = this.activeSoundscapeMix ?? mix;
      const now = this.ctx.currentTime;

      for (const { spec, buffer } of decoded) {
        if (!buffer) continue;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(spec.filterHz, now);
        filter.Q.value = 0.7;

        const layerGain = this.ctx.createGain();
        const targetGain =
          spec.id === 'wind'
            ? latestMix.windGain
            : spec.id === 'gongs'
              ? latestMix.distantGongsGain
              : spec.id === 'leaves'
                ? latestMix.rustlingLeavesGain
                : latestMix.baseAmbienceGain;

        layerGain.gain.setValueAtTime(0.0001, now);
        layerGain.gain.linearRampToValueAtTime(Math.max(0.001, targetGain), now + 1.1);

        let panner: StereoPannerNode | null = null;
        if (typeof this.ctx.createStereoPanner === 'function' && spec.pan !== 0) {
          panner = this.ctx.createStereoPanner();
          panner.pan.setValueAtTime(spec.pan, now);
          src.connect(filter);
          filter.connect(panner);
          panner.connect(layerGain);
        } else {
          src.connect(filter);
          filter.connect(layerGain);
        }
        layerGain.connect(this.soundscapeGain);

        const safeOffset = buffer.duration > 1.5 ? spec.offsetSec % Math.max(0.5, buffer.duration - 0.5) : 0;
        src.start(0, safeOffset);

        this.soundscapeLayers.set(spec.id, {
          key: spec.key,
          source: src,
          filter,
          panner,
          gain: layerGain,
          targetGain,
        });
      }
    } finally {
      this.soundscapeStarting = false;
    }
  }

  /**
   * Dynamically swells or adjusts running ambient soundscape layers (e.g. storm wind surges or mode change).
   */
  public updateGameplaySoundscape(mix: LevelSoundscapeMix, stormSurge = 0): void {
    this.activeSoundscapeMix = { ...mix };
    if (!this.ctx || !this.soundscapeRequested || this.soundscapeLayers.size === 0) return;

    const now = this.ctx.currentTime;
    const surge = Math.max(0, Math.min(0.45, stormSurge));

    const windLayer = this.soundscapeLayers.get('wind');
    if (windLayer) {
      const target = Math.min(0.62, mix.windGain * (1 + surge));
      windLayer.targetGain = target;
      windLayer.gain.gain.setTargetAtTime(target, now, 0.45);
      windLayer.filter.frequency.setTargetAtTime(mix.windFilterHz + surge * 550, now, 0.45);
    }

    const gongsLayer = this.soundscapeLayers.get('gongs');
    if (gongsLayer) {
      gongsLayer.targetGain = mix.distantGongsGain;
      gongsLayer.gain.gain.setTargetAtTime(mix.distantGongsGain, now, 0.45);
      gongsLayer.filter.frequency.setTargetAtTime(mix.distantGongsFilterHz, now, 0.45);
    }

    const leavesLayer = this.soundscapeLayers.get('leaves');
    if (leavesLayer) {
      const target = Math.min(0.55, mix.rustlingLeavesGain * (1 + surge * 0.85));
      leavesLayer.targetGain = target;
      leavesLayer.gain.gain.setTargetAtTime(target, now, 0.45);
      leavesLayer.filter.frequency.setTargetAtTime(mix.leavesFilterHz + surge * 380, now, 0.45);
    }

    const baseLayer = this.soundscapeLayers.get('base');
    if (baseLayer) {
      baseLayer.targetGain = mix.baseAmbienceGain;
      baseLayer.gain.gain.setTargetAtTime(mix.baseAmbienceGain, now, 0.45);
    }
  }

  private teardownSoundscapeLayers(fadeSec = 0.4): void {
    if (!this.ctx || this.soundscapeLayers.size === 0) {
      this.soundscapeLayers.clear();
      return;
    }
    const now = this.ctx.currentTime;
    const oldEntries = Array.from(this.soundscapeLayers.values());
    this.soundscapeLayers.clear();

    for (const layer of oldEntries) {
      try {
        layer.gain.gain.cancelScheduledValues(now);
        layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
        layer.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      } catch {
        // ignore
      }
      window.setTimeout(() => {
        try {
          layer.source.stop();
          layer.source.disconnect();
          layer.filter.disconnect();
          layer.panner?.disconnect();
          layer.gain.disconnect();
        } catch {
          // ignore
        }
      }, Math.round((fadeSec + 0.08) * 1000));
    }
  }

  public stopGameplaySoundscape(): void {
    this.soundscapeRequested = false;
    this.activeSoundscapeMix = null;
    this.teardownSoundscapeLayers(0.45);
  }

  public getSoundscapeSummary(): {
    requested: boolean;
    activeLayerCount: number;
    mix: LevelSoundscapeMix | null;
  } {
    return {
      requested: this.soundscapeRequested,
      activeLayerCount: this.soundscapeLayers.size,
      mix: this.activeSoundscapeMix,
    };
  }

  public pauseLoops(): void {
    this.clearVoiceQueue();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.currentMusicGain) {
      this.currentMusicGain.gain.setTargetAtTime(0.08, now, 0.12);
    }
    if (this.currentAmbienceGain) {
      this.currentAmbienceGain.gain.setTargetAtTime(0.04, now, 0.12);
    }
    for (const layer of this.soundscapeLayers.values()) {
      layer.gain.gain.setTargetAtTime(0.02, now, 0.12);
    }
  }

  public clearVoiceQueue(): void {
    if (this.queuedVoiceTimer !== null) {
      window.clearTimeout(this.queuedVoiceTimer);
      this.queuedVoiceTimer = null;
    }
    this.voiceScheduler.clear();
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {
        // ignore
      }
      this.activeVoiceSource = null;
    }
  }

  public resumeLoops(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.currentMusicGain) {
      this.currentMusicGain.gain.setTargetAtTime(0.65, now, 0.18);
    }
    if (this.currentAmbienceGain && !this.soundscapeRequested) {
      this.currentAmbienceGain.gain.setTargetAtTime(
        getAmbienceTargetGain(this.currentAmbienceKey ?? ''),
        now,
        0.18,
      );
    }
    for (const layer of this.soundscapeLayers.values()) {
      layer.gain.gain.setTargetAtTime(layer.targetGain, now, 0.18);
    }
  }

  public isVoicePlaying(): boolean {
    return this.voiceScheduler.isBusy(performance.now()) || this.activeVoiceSource !== null;
  }

  public async playSfx(
    key: string,
    options?: {
      pan?: number;
      volume?: number;
      pitchJitter?: number;
      cooldownMs?: number;
      priority?: boolean;
      duckMusic?: boolean;
    },
  ): Promise<void> {
    if (isGhostVoiceAudioKey(key)) {
      await this.playSerializedGhostVoice(key, {
        pan: options?.pan,
        volume: options?.volume ?? 1.15,
        urgent: Boolean(options?.priority),
        duckMusic: options?.duckMusic ?? true,
      });
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || ctx.state !== 'running' || this.settings.muted) return;

    const nowMs = performance.now();
    const cooldown = options?.cooldownMs ?? 80;
    const last = this.cooldowns.get(key) ?? 0;
    if (!options?.priority && nowMs - last < cooldown) return;
    if (!options?.priority && this.activeSfxCount >= 12) return;
    this.cooldowns.set(key, nowMs);

    const buffer = await this.getDecoded(key);
    if (!buffer) return;

    if (options?.duckMusic) {
      this.duckMusicForVoice(buffer.duration);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const jitter = options?.pitchJitter ?? 0.07;
    if (jitter > 0) {
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
    }

    const gainNode = ctx.createGain();
    gainNode.gain.value = Math.max(0.05, Math.min(1.65, options?.volume ?? 0.85));

    if (typeof ctx.createStereoPanner === 'function' && options?.pan !== undefined) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.92, Math.min(0.92, options.pan));
      src.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      src.connect(gainNode);
      gainNode.connect(this.sfxGain);
    }

    this.activeSfxCount += 1;
    src.onended = () => {
      this.activeSfxCount = Math.max(0, this.activeSfxCount - 1);
      try {
        src.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore
      }
    };
    src.start(0);
  }

  private async playSerializedGhostVoice(
    key: string,
    opts: { pan?: number; volume: number; urgent: boolean; duckMusic: boolean },
  ): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || ctx.state !== 'running' || this.settings.muted) return;

    const decision = this.voiceScheduler.request(
      key,
      opts.urgent ? 'urgent' : 'ambient',
      performance.now(),
      { pan: opts.pan, volume: opts.volume, duckMusic: opts.duckMusic },
    );

    if (decision.action === 'dropped') return;
    if (decision.action === 'queued') {
      if (this.queuedVoiceTimer !== null) {
        window.clearTimeout(this.queuedVoiceTimer);
      }
      this.queuedVoiceTimer = window.setTimeout(() => {
        this.queuedVoiceTimer = null;
        this.flushQueuedVoice();
      }, decision.delayMs + 15);
      return;
    }

    await this.startVoiceClipNow(key, opts.pan, opts.volume, opts.duckMusic);
  }

  private flushQueuedVoice(): void {
    const next = this.voiceScheduler.consumePending(performance.now());
    if (!next) return;
    void this.startVoiceClipNow(next.key, next.meta.pan, next.meta.volume, next.meta.duckMusic);
  }

  private async startVoiceClipNow(
    key: string,
    pan: number | undefined,
    volume: number,
    duckMusic: boolean,
  ): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || ctx.state !== 'running' || this.settings.muted) return;

    // Double-guard: if a voice started while awaiting decode, avoid overlapping
    const nowBeforeDecode = performance.now();
    if (this.voiceScheduler.isBusy(nowBeforeDecode) || this.activeVoiceSource) return;

    const buffer = await this.getDecoded(key);
    if (!buffer) return;
    const nowMs = performance.now();
    if (this.voiceScheduler.isBusy(nowMs) || this.activeVoiceSource) return;

    // Reserve the exclusive single voice slot immediately
    this.voiceScheduler.markStarted(buffer.duration, nowMs);
    if (duckMusic) {
      this.duckMusicForVoice(buffer.duration + 0.15);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1.0; // Zero pitch jitter so articulation stays crisp

    const gainNode = ctx.createGain();
    gainNode.gain.value = Math.max(0.2, Math.min(1.65, volume));

    if (typeof ctx.createStereoPanner === 'function' && pan !== undefined) {
      const panner = ctx.createStereoPanner();
      // Keep stereo pan centered enough (-0.55..0.55) so dialogue stays clearly intelligible on both ears
      panner.pan.value = Math.max(-0.55, Math.min(0.55, pan * 0.6));
      src.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      src.connect(gainNode);
      gainNode.connect(this.sfxGain);
    }

    this.activeVoiceSource = src;
    src.onended = () => {
      if (this.activeVoiceSource === src) {
        this.activeVoiceSource = null;
      }
      try {
        src.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore
      }
    };
    src.start(0);
  }

  public playGhostEvent(
    ghostType: GhostType,
    event: 'appear' | 'idle' | 'move' | 'hit' | 'defeat' | 'rage' | 'voice' | 'taunt' | 'pebble' | 'scream',
    pan = 0,
    distanceFactor = 1,
  ): void {
    const folder = ghostType === 'buto_ijo' ? 'buto-ijo' : ghostType;
    let clip = 'appear';
    if (event === 'appear') {
      clip = 'appear';
    } else if (event === 'hit') {
      clip = 'hit';
    } else if (event === 'defeat') {
      clip = 'defeat';
    } else if (event === 'rage') {
      clip = ghostType === 'buto_ijo' ? 'rage' : 'roar';
    } else if (event === 'scream') {
      clip = ghostType === 'kuntilanak' ? 'scream' : 'roar';
    } else if (event === 'pebble') {
      clip = ghostType === 'genderuwo' ? 'pebble' : 'appear';
    } else if (event === 'taunt') {
      clip = ghostType === 'tuyul' ? 'taunt' : 'voice';
    } else if (event === 'voice') {
      clip = 'voice';
    } else if (event === 'move') {
      if (ghostType === 'pocong') clip = 'jump';
      else if (ghostType === 'genderuwo' || ghostType === 'buto_ijo') clip = 'footsteps';
      else clip = 'move';
    } else if (event === 'idle') {
      if (ghostType === 'tuyul') {
        const r = Math.random();
        clip = r < 0.55 ? 'voice' : r < 0.85 ? 'taunt' : 'laugh';
      } else if (ghostType === 'pocong') {
        clip = Math.random() < 0.72 ? 'voice' : Math.random() < 0.65 ? 'groan' : 'jump';
      } else if (ghostType === 'kuntilanak') {
        clip = Math.random() < 0.68 ? 'voice' : Math.random() < 0.8 ? 'laugh' : 'scream';
      } else if (ghostType === 'genderuwo') {
        const r = Math.random();
        clip = r < 0.6 ? 'voice' : r < 0.84 ? 'growl' : 'roar';
      } else {
        clip = Math.random() < 0.72 ? 'voice' : 'roar';
      }
    }

    const isSpoken = isGhostVoiceAudioKey(`ghosts/${folder}/${clip}`);
    const isUrgentVoice = event === 'taunt' || event === 'rage' || event === 'scream' || event === 'voice';
    const isBoss = ghostType === 'buto_ijo';
    const baseDist = isSpoken
      ? Math.max(1.05, Math.min(1.38, distanceFactor * 1.22))
      : Math.max(0.45, Math.min(1.25, distanceFactor));
    const vol = baseDist * (isBoss ? 1.22 : 1.12);

    void this.playSfx(`ghosts/${folder}/${clip}`, {
      pan,
      volume: vol,
      pitchJitter: isSpoken ? 0 : isBoss ? 0.04 : 0.08,
      cooldownMs: event === 'hit' || event === 'defeat' || event === 'pebble' ? 60 : isSpoken ? 750 : 480,
      priority: isBoss || event === 'defeat' || event === 'pebble' || isUrgentVoice,
      duckMusic: isSpoken,
    });
  }

  public dispose(): void {
    this.clearVoiceQueue();
    this.stopGameplaySoundscape();
    if (this.voiceDuckTimeout !== null) {
      window.clearTimeout(this.voiceDuckTimeout);
      this.voiceDuckTimeout = null;
    }
    try {
      this.currentMusicSource?.stop();
      this.currentAmbienceSource?.stop();
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
  }
}
