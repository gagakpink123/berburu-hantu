import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Smartphone, X } from 'lucide-react';
import {
  GameOverModal,
  GhostLoreModal,
  GuideModal,
  LevelSelectModal,
  PauseModal,
  SettingsModal,
} from './components/GameModals';
import { PlayingHud } from './components/PlayingHud';
import { SplashScreen } from './components/SplashScreen';
import { StormAtmosphereOverlay } from './components/StormAtmosphereOverlay';
import { TitleScreen } from './components/TitleScreen';
import { AUDIO_MANIFEST, GameAudioManager } from './game/audio';
import { GameEngine } from './game/engine';
import { LEVEL_CONFIGS } from './game/levels';
import {
  FIXED_STAGE_HEIGHT,
  FIXED_STAGE_WIDTH,
  LEVEL_FADE_HOLD_MS,
  LEVEL_FADE_IN_MS,
  LEVEL_FADE_OUT_MS,
  type SafeAreaInsets,
  type ViewportDimensions,
  computeLevelCurtainOpacity,
  computeMenuSafeAreaInsets,
  computeMenuUiScale,
  computeTitleGhostVoiceDelayMs,
  getEffectiveViewportSize,
  isIosDevice,
  pickRandomTitleGhostVoiceKey,
  pruneExpiredGhostAlerts,
  pushGhostAlertQueue,
  requestGyroPermission,
  resolveMousePointerVisibility,
  supportsNativeElementFullscreen,
} from './game/rules';
import type {
  GamePhase,
  GameSettings,
  GhostAlertNotification,
  GhostType,
  HudSnapshot,
  LoadProgress,
  ScareMode,
} from './game/types';

const TOTAL_PRELOAD_ASSETS = Object.keys(AUDIO_MANIFEST).length + 5 + LEVEL_CONFIGS.length;

function readEffectiveViewport(): ViewportDimensions {
  if (typeof window === 'undefined') {
    return { width: FIXED_STAGE_WIDTH, height: FIXED_STAGE_HEIGHT };
  }
  return getEffectiveViewportSize({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualWidth: window.visualViewport?.width,
    visualHeight: window.visualViewport?.height,
  });
}

function computeScaleForViewport(vp: ViewportDimensions): number {
  return Math.min(vp.width / FIXED_STAGE_WIDTH, vp.height / FIXED_STAGE_HEIGHT);
}

const INITIAL_SETTINGS: GameSettings = {
  scareMode: 'petualangan',
  musicVolume: 0.6,
  sfxVolume: 0.85,
  muted: false,
  cameraSensitivity: 1.0,
  pointerAimEnabled: true,
};

const INITIAL_HUD: HudSnapshot = {
  outcome: null,
  levelId: 1,
  levelName: 'Kuburan Tua',
  accuracy: 0,
  kills: 0,
  targetKills: 10,
  bossKills: 0,
  targetBossKills: 0,
  timeLeft: 75,
  ammo: 12,
  maxAmmo: 12,
  isReloading: false,
  targetedGhost: null,
  bossInfo: null,
  killCam: null,
  faceAttackActive: false,
  cameraYawDeg: 0,
};

export default function App() {
  const stageRef = useRef<HTMLElement>(null);
  const safeProbeRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const audioRef = useRef<GameAudioManager | null>(null);
  const hitFlashTimeoutRef = useRef<number | null>(null);

  const [viewport, setViewport] = useState<ViewportDimensions>(() => readEffectiveViewport());
  const stageScale = computeScaleForViewport(viewport);
  const menuUiScale = computeMenuUiScale(viewport.width, viewport.height);
  const [menuSafeInsets, setMenuSafeInsets] = useState<SafeAreaInsets>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showIosLandscapeHint, setShowIosLandscapeHint] = useState<boolean>(false);
  const iosImmersiveFsRef = useRef<boolean>(false);
  const [gyroEnabled, setGyroEnabled] = useState<boolean>(false);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(true);
  const [settings, setSettings] = useState<GameSettings>(INITIAL_SETTINGS);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [phase, setPhase] = useState<GamePhase>('loading');
  const [playerHitFlash, setPlayerHitFlash] = useState(false);
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({
    loaded: 0,
    total: TOTAL_PRELOAD_ASSETS,
    percent: 0,
    ready: false,
    failedAssets: [],
    stageLabel: 'Memulai persiapan aset Nusantara...',
  });

  const [activeModal, setActiveModal] = useState<'none' | 'levels' | 'guide' | 'settings'>('none');
  const [isLoreOpen, setIsLoreOpen] = useState<boolean>(false);
  const [levelTransitionPhase, setLevelTransitionPhase] = useState<'idle' | 'fading_out' | 'fading_in'>('idle');
  const curtainRef = useRef<HTMLDivElement>(null);
  const transitionLockRef = useRef<boolean>(false);
  const transitionTimersRef = useRef<number[]>([]);
  const transitionRafRef = useRef<number | null>(null);
  const lastTitleGhostRef = useRef<GhostType | null>(null);
  const titleVoiceTimerRef = useRef<number | null>(null);
  const [showMousePointer, setShowMousePointer] = useState(false);
  const showMousePointerRef = useRef(false);
  const mouseStagePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hitMarker, setHitMarker] = useState<{ active: boolean; isKill: boolean; x: number; y: number }>({
    active: false,
    isKill: false,
    x: 0,
    y: 0,
  });
  const [ghostAlerts, setGhostAlerts] = useState<GhostAlertNotification[]>([]);

  const phaseRef = useRef<GamePhase>('loading');
  const modalRef = useRef(activeModal);
  modalRef.current = activeModal;

  const isAutostartRef = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autostart') === '1',
  );

  // Sync visualViewport, safe-area insets & orientation settle (essential for iPhone Safari landscape)
  const syncViewportMetrics = useCallback(() => {
    const nextVp = readEffectiveViewport();
    const nextStageScale = computeScaleForViewport(nextVp);
    const nextMenuScale = computeMenuUiScale(nextVp.width, nextVp.height);
    setViewport((prev) => (prev.width === nextVp.width && prev.height === nextVp.height ? prev : nextVp));

    if (nextVp.width >= nextVp.height) {
      setShowIosLandscapeHint(false);
    }

    const probe = safeProbeRef.current;
    if (probe) {
      const cs = getComputedStyle(probe);
      const raw: SafeAreaInsets = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
      const nextSafe = computeMenuSafeAreaInsets(raw, nextVp, nextStageScale, nextMenuScale);
      setMenuSafeInsets((prev) =>
        prev.top === nextSafe.top &&
        prev.right === nextSafe.right &&
        prev.bottom === nextSafe.bottom &&
        prev.left === nextSafe.left
          ? prev
          : nextSafe,
      );
    }
  }, []);

  useEffect(() => {
    const settleTimers: number[] = [];
    const scheduleViewportSync = () => {
      syncViewportMetrics();
      const t1 = window.setTimeout(syncViewportMetrics, 120);
      const t2 = window.setTimeout(syncViewportMetrics, 350);
      settleTimers.push(t1, t2);
    };

    syncViewportMetrics();
    window.addEventListener('resize', syncViewportMetrics);
    window.addEventListener('orientationchange', scheduleViewportSync);
    window.visualViewport?.addEventListener('resize', syncViewportMetrics);
    window.visualViewport?.addEventListener('scroll', syncViewportMetrics);
    try {
      window.screen?.orientation?.addEventListener('change', scheduleViewportSync);
    } catch {
      // Ignore on browsers without ScreenOrientation EventTarget support
    }

    const onGestureStart = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener('gesturestart', onGestureStart);

    return () => {
      for (const id of settleTimers) window.clearTimeout(id);
      window.removeEventListener('resize', syncViewportMetrics);
      window.removeEventListener('orientationchange', scheduleViewportSync);
      window.visualViewport?.removeEventListener('resize', syncViewportMetrics);
      window.visualViewport?.removeEventListener('scroll', syncViewportMetrics);
      try {
        window.screen?.orientation?.removeEventListener('change', scheduleViewportSync);
      } catch {
        // Ignore cleanup errors
      }
      document.removeEventListener('gesturestart', onGestureStart);
    };
  }, [syncViewportMetrics]);

  // Global first-gesture & foreground audio unlock for iOS Safari
  useEffect(() => {
    const unlockOnGesture = () => {
      void audioRef.current?.unlock();
    };
    const onVisibilityOrPageShow = () => {
      if (document.visibilityState === 'visible') {
        void audioRef.current?.unlock();
        syncViewportMetrics();
      }
    };
    window.addEventListener('pointerdown', unlockOnGesture, { capture: true, passive: true });
    window.addEventListener('touchstart', unlockOnGesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibilityOrPageShow);
    window.addEventListener('pageshow', onVisibilityOrPageShow);
    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture, true);
      window.removeEventListener('touchstart', unlockOnGesture, true);
      document.removeEventListener('visibilitychange', onVisibilityOrPageShow);
      window.removeEventListener('pageshow', onVisibilityOrPageShow);
    };
  }, [syncViewportMetrics]);

  // Sync fullscreen state with browser changes (e.g. Escape key)
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const onFullscreenChange = () => {
      const nativeActive = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(nativeActive || iosImmersiveFsRef.current);
      syncViewportMetrics();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, [syncViewportMetrics]);

  const handleToggleFullscreen = useCallback(async () => {
    void audioRef.current?.unlock();
    void audioRef.current?.playSfx('ui/click', { volume: 0.65 });
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const rootEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const orientation = screen.orientation as
      | (ScreenOrientation & { lock?: (mode: string) => Promise<void>; unlock?: () => void })
      | undefined;

    if (!supportsNativeElementFullscreen(rootEl)) {
      const nextImmersive = !iosImmersiveFsRef.current;
      iosImmersiveFsRef.current = nextImmersive;
      setIsFullscreen(nextImmersive);
      const vp = readEffectiveViewport();
      const isIos =
        typeof navigator !== 'undefined' &&
        isIosDevice(navigator.userAgent, navigator.maxTouchPoints, navigator.platform);
      if (nextImmersive) {
        try {
          window.scrollTo(0, 1);
        } catch {
          // Ignore scroll fallback errors
        }
        if (isIos && vp.width < vp.height) {
          setShowIosLandscapeHint(true);
        }
      } else {
        setShowIosLandscapeHint(false);
      }
      syncViewportMetrics();
      return;
    }

    try {
      const activeFs = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
      if (!activeFs) {
        if (rootEl.requestFullscreen) {
          await rootEl.requestFullscreen();
        } else if (rootEl.webkitRequestFullscreen) {
          await rootEl.webkitRequestFullscreen();
        }
        try {
          await orientation?.lock?.('landscape');
        } catch {
          // Desktop/iOS Safari may reject orientation.lock; fullscreen still succeeds
        }
      } else {
        try {
          orientation?.unlock?.();
        } catch {
          // Ignore unlock errors
        }
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
    } catch {
      // Ignore fullscreen denial in sandboxed iframes or headless environments
    }
    syncViewportMetrics();
  }, [syncViewportMetrics]);

  const handleToggleGyro = useCallback(async () => {
    if (gyroEnabled) {
      void audioRef.current?.playSfx('ui/click', { volume: 0.65 });
      engineRef.current?.setGyroEnabled(false);
      setGyroEnabled(false);
      return;
    }
    // Request permission immediately in the click gesture before any async awaits for iOS Safari compatibility
    const permission = await requestGyroPermission();
    void audioRef.current?.playSfx('ui/click', { volume: 0.65 });
    if (permission === 'granted') {
      engineRef.current?.setGyroEnabled(true);
      setGyroEnabled(true);
    } else {
      setGyroEnabled(false);
      engineRef.current?.notifyGyroUnavailable(permission);
    }
  }, [gyroEnabled]);

  const handleToggleNotif = useCallback(() => {
    void audioRef.current?.playSfx('ui/click', { volume: 0.65 });
    setNotifEnabled((prev) => !prev);
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const audio = new GameAudioManager();
    audioRef.current = audio;

    const params = new URLSearchParams(window.location.search);
    const isAutostart = params.get('autostart') === '1';
    const rawLvl = isAutostart ? Number(params.get('level') || '1') || 1 : 1;
    const initialLvl = Math.max(1, Math.min(LEVEL_CONFIGS.length, rawLvl));

    const engine = new GameEngine(
      mount,
      audio,
      INITIAL_SETTINGS,
      {
        onHudUpdate: (nextHud) => setHud(nextHud),
        onPhaseChange: (nextPhase) => {
          phaseRef.current = nextPhase;
          setPhase(nextPhase);
          if (nextPhase !== 'playing' && nextPhase !== 'paused') {
            setGhostAlerts([]);
          }
        },
        onLoadProgress: (p) => setLoadProgress(p),
        onHitMarker: (isKill, x, y) => {
          setHitMarker({ active: true, isKill, x, y });
          window.setTimeout(() => {
            setHitMarker((prev) => (prev.x === x && prev.y === y ? { ...prev, active: false } : prev));
          }, 160);
        },
        onPlayerHit: () => {
          setPlayerHitFlash(true);
          if (hitFlashTimeoutRef.current !== null) {
            window.clearTimeout(hitFlashTimeoutRef.current);
          }
          hitFlashTimeoutRef.current = window.setTimeout(() => {
            setPlayerHitFlash(false);
            hitFlashTimeoutRef.current = null;
          }, 260);
        },
        onGhostAlert: (alert) => {
          const now = performance.now();
          setGhostAlerts((prev) => pushGhostAlertQueue(prev, alert, now));
          window.setTimeout(() => {
            setGhostAlerts((prev) => pruneExpiredGhostAlerts(prev, performance.now()));
          }, alert.durationMs + 60);
        },
      },
      initialLvl,
    );
    engineRef.current = engine;

    if (isAutostart) {
      engine.startLevel(initialLvl);
    } else {
      document.body.dataset.state = 'loading';
    }

    return () => {
      if (hitFlashTimeoutRef.current !== null) {
        window.clearTimeout(hitFlashTimeoutRef.current);
      }
      for (const tid of transitionTimersRef.current) {
        window.clearTimeout(tid);
      }
      transitionTimersRef.current = [];
      if (titleVoiceTimerRef.current !== null) {
        window.clearTimeout(titleVoiceTimerRef.current);
        titleVoiceTimerRef.current = null;
      }
      engine.dispose();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // Auto-advance from splash screen shortly after 100% of assets finish preloading
  useEffect(() => {
    if (isAutostartRef.current) return;
    if (phase !== 'loading' || !loadProgress.ready) return;
    const timer = window.setTimeout(() => {
      engineRef.current?.enterTitleFromSplash();
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [phase, loadProgress.ready]);

  // Mouse-only pointer indicator tracking into fixed 2400x1080 stage coordinates (never shown at center or on touch)
  useEffect(() => {
    const syncVisibility = (nextVisible: boolean) => {
      if (showMousePointerRef.current !== nextVisible) {
        showMousePointerRef.current = nextVisible;
        setShowMousePointer(nextVisible);
      }
    };

    const updateMousePosition = (e: PointerEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.max(0, Math.min(FIXED_STAGE_WIDTH, ((e.clientX - rect.left) / rect.width) * FIXED_STAGE_WIDTH));
      const y = Math.max(0, Math.min(FIXED_STAGE_HEIGHT, ((e.clientY - rect.top) / rect.height) * FIXED_STAGE_HEIGHT));
      mouseStagePosRef.current = { x, y };
      const el = crosshairRef.current;
      if (el) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const visible = resolveMousePointerVisibility('move', e.pointerType);
      if (visible) {
        updateMousePosition(e);
      }
      syncVisibility(visible);
    };

    const onPointerDown = (e: PointerEvent) => {
      const visible = resolveMousePointerVisibility('down', e.pointerType);
      if (visible) {
        updateMousePosition(e);
      }
      syncVisibility(visible);
    };

    const onMouseLeave = () => {
      syncVisibility(resolveMousePointerVisibility('leave', 'mouse'));
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    document.documentElement.addEventListener('mouseleave', onMouseLeave);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  // Sync transition state dataset for E2E & telemetry cleanliness, and clean up timers on unmount
  useEffect(() => {
    document.body.dataset.transitionState = levelTransitionPhase;
  }, [levelTransitionPhase]);

  useEffect(() => {
    return () => {
      for (const tid of transitionTimersRef.current) {
        window.clearTimeout(tid);
      }
      transitionTimersRef.current = [];
      if (transitionRafRef.current !== null) {
        window.cancelAnimationFrame(transitionRafRef.current);
        transitionRafRef.current = null;
      }
    };
  }, []);

  // Title screen spaced random ghost voices alongside main-menu music & night ambience
  useEffect(() => {
    const clearScheduledVoice = () => {
      if (titleVoiceTimerRef.current !== null) {
        window.clearTimeout(titleVoiceTimerRef.current);
        titleVoiceTimerRef.current = null;
      }
    };

    if (phase !== 'title' || settings.muted) {
      clearScheduledVoice();
      return;
    }

    let cancelled = false;
    const scheduleNext = (isInitial: boolean) => {
      if (cancelled) return;
      const delayMs = computeTitleGhostVoiceDelayMs(isInitial);
      titleVoiceTimerRef.current = window.setTimeout(() => {
        titleVoiceTimerRef.current = null;
        if (cancelled || phaseRef.current !== 'title') return;
        const audio = audioRef.current;
        if (!audio || !audio.isAudioRunning()) {
          // Wait quietly until first gesture unlocks Web Audio, then schedule again
          titleVoiceTimerRef.current = window.setTimeout(() => scheduleNext(true), 2200);
          return;
        }
        const picked = pickRandomTitleGhostVoiceKey(lastTitleGhostRef.current);
        lastTitleGhostRef.current = picked.ghostType;
        void audio.playSfx(picked.key, {
          volume: 0.92,
          duckMusic: true,
          priority: false,
        });
        scheduleNext(false);
      }, delayMs);
    };

    scheduleNext(true);
    return () => {
      cancelled = true;
      clearScheduledVoice();
    };
  }, [phase, settings.muted]);

  const handleEnterFromSplash = useCallback(() => {
    void audioRef.current?.unlock();
    void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
    engineRef.current?.enterTitleFromSplash();
  }, []);

  const runCurtainTransition = useCallback((onSwitchMidpoint: () => void) => {
    if (transitionLockRef.current) return;
    transitionLockRef.current = true;
    void audioRef.current?.unlock();
    void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
    setActiveModal('none');
    setIsLoreOpen(false);

    for (const tid of transitionTimersRef.current) {
      window.clearTimeout(tid);
    }
    transitionTimersRef.current = [];
    if (transitionRafRef.current !== null) {
      window.cancelAnimationFrame(transitionRafRef.current);
      transitionRafRef.current = null;
    }

    const setCurtainOpacity = (value: number) => {
      if (curtainRef.current) {
        curtainRef.current.style.opacity = value.toFixed(4);
      }
    };

    setCurtainOpacity(0);
    setLevelTransitionPhase('fading_out');

    let fadeOutStart: number | null = null;
    const stepFadeOut = (now: number) => {
      if (fadeOutStart === null) {
        fadeOutStart = now;
      }
      const progress = (now - fadeOutStart) / LEVEL_FADE_OUT_MS;
      const clamped = Math.min(1, Math.max(0, progress));
      setCurtainOpacity(computeLevelCurtainOpacity('fading_out', clamped));

      if (clamped < 1) {
        transitionRafRef.current = window.requestAnimationFrame(stepFadeOut);
        return;
      }

      transitionRafRef.current = null;
      setCurtainOpacity(1);

      const holdTimer = window.setTimeout(() => {
        onSwitchMidpoint();

        // Wait one animation frame after state/scene switch so the destination paints behind full darkness
        transitionRafRef.current = window.requestAnimationFrame(() => {
          setLevelTransitionPhase('fading_in');
          let fadeInStart: number | null = null;
          const stepFadeIn = (inNow: number) => {
            if (fadeInStart === null) {
              fadeInStart = inNow;
            }
            const inProgress = (inNow - fadeInStart) / LEVEL_FADE_IN_MS;
            const inClamped = Math.min(1, Math.max(0, inProgress));
            setCurtainOpacity(computeLevelCurtainOpacity('fading_in', inClamped));

            if (inClamped < 1) {
              transitionRafRef.current = window.requestAnimationFrame(stepFadeIn);
              return;
            }

            transitionRafRef.current = null;
            setCurtainOpacity(0);
            setLevelTransitionPhase('idle');
            transitionLockRef.current = false;
            transitionTimersRef.current = [];
          };
          transitionRafRef.current = window.requestAnimationFrame(stepFadeIn);
        });
      }, LEVEL_FADE_HOLD_MS);

      transitionTimersRef.current.push(holdTimer);
    };

    transitionRafRef.current = window.requestAnimationFrame(stepFadeOut);
  }, []);

  const handleStartLevel = useCallback(
    (levelId: number) => {
      runCurtainTransition(() => {
        engineRef.current?.startLevel(levelId);
      });
    },
    [runCurtainTransition],
  );

  const handleReturnToTitle = useCallback(() => {
    runCurtainTransition(() => {
      engineRef.current?.returnToTitle();
    });
  }, [runCurtainTransition]);

  const handleToggleMute = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, muted: !prev.muted };
      engineRef.current?.updateSettings(next);
      return next;
    });
  }, []);

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    engineRef.current?.updateSettings(next);
  }, []);

  const handleScareModeChange = useCallback((scareMode: ScareMode) => {
    void audioRef.current?.playSfx('ui/click', { volume: 0.65 });
    setSettings((prev) => {
      const next = { ...prev, scareMode };
      engineRef.current?.updateSettings(next);
      return next;
    });
  }, []);

  // Title-screen Enter/Space start handshake + global M mute shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        handleToggleMute();
      } else if (
        (e.code === 'Enter' || e.code === 'Space') &&
        phaseRef.current === 'title' &&
        modalRef.current === 'none'
      ) {
        e.preventDefault();
        handleStartLevel(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartLevel, handleToggleMute]);

  return (
    <div
      className="fixed inset-0 bg-[#040608] flex items-center justify-center overflow-hidden"
      style={{
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
      }}
    >
      <div ref={safeProbeRef} aria-hidden="true" className="safe-area-probe" />
      <main
        ref={stageRef}
        data-testid="viewport-2400x1080"
        data-face-attack={hud.faceAttackActive ? '1' : '0'}
        className={`relative overflow-hidden bg-[#090d10] ${
          isFullscreen ? '' : 'border border-[#d6a94f]/25 shadow-[0_0_80px_rgba(0,0,0,0.96)]'
        }`}
        style={{
          width: `${FIXED_STAGE_WIDTH}px`,
          height: `${FIXED_STAGE_HEIGHT}px`,
          transform: `scale(${stageScale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
      >
        {/* Fixed 2400x1080 WebGL Viewport Container */}
        <div
          ref={canvasMountRef}
          className={`absolute inset-0 z-0 ${phase === 'playing' && showMousePointer ? 'cursor-none' : ''}`}
        />

        {/* Atmospheric Diagonal Drizzle & Lightning Sky Bloom on Splash/Title */}
        {(phase === 'loading' || phase === 'title') && <StormAtmosphereOverlay />}

        {/* Hit Marker & Mouse-Only Target Indicator (hidden at center & on touch devices) */}
        {phase === 'playing' && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none">
            {hitMarker.active && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: `${hitMarker.x}px`, top: `${hitMarker.y}px` }}
              >
                <svg
                  viewBox="0 0 36 36"
                  className={`${menuUiScale > 1 ? 'w-20 h-20' : 'w-12 h-12'} ${
                    hitMarker.isKill ? 'text-[#ff52e5]' : 'text-[#38f8ff]'
                  }`}
                >
                  <path
                    d="M6 6 L13 13 M30 6 L23 13 M6 30 L13 23 M30 30 L23 23"
                    stroke="currentColor"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}

            {showMousePointer && (
              <div
                ref={crosshairRef}
                data-testid="mouse-pointer-indicator"
                className="absolute pointer-events-none"
                style={{
                  left: `${mouseStagePosRef.current.x}px`,
                  top: `${mouseStagePosRef.current.y}px`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <svg
                  viewBox="0 0 40 40"
                  className={`${
                    menuUiScale > 1 ? 'w-20 h-20' : 'w-11 h-11'
                  } text-[#38f8ff] drop-shadow-[0_0_6px_rgba(0,0,0,0.95)]`}
                >
                  <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.85" />
                  <line x1="20" y1="3" x2="20" y2="10" stroke="currentColor" strokeWidth="1.8" />
                  <line x1="20" y1="30" x2="20" y2="37" stroke="currentColor" strokeWidth="1.8" />
                  <line x1="3" y1="20" x2="10" y2="20" stroke="currentColor" strokeWidth="1.8" />
                  <line x1="30" y1="20" x2="37" y2="20" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="20" cy="20" r="2.2" fill="#ff6b2b" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* Menu & HUD UI Layer (1x on desktop, 3x enlarged inside 800x360 logical frame on smartphones) */}
        <div
          data-testid="menu-scale-layer"
          data-menu-scale={menuUiScale}
          className="pointer-events-none absolute top-0 left-0 z-20"
          style={
            {
              width: `${FIXED_STAGE_WIDTH / menuUiScale}px`,
              height: `${FIXED_STAGE_HEIGHT / menuUiScale}px`,
              transform: `scale(${menuUiScale})`,
              transformOrigin: 'top left',
              '--safe-top': `${menuSafeInsets.top}px`,
              '--safe-right': `${menuSafeInsets.right}px`,
              '--safe-bottom': `${menuSafeInsets.bottom}px`,
              '--safe-left': `${menuSafeInsets.left}px`,
            } as CSSProperties
          }
        >
          {showIosLandscapeHint && (
            <div
              data-testid="ios-landscape-hint"
              role="status"
              className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-50 hud-glass rounded-lg px-3 py-1.5 flex items-center gap-2 max-w-[92%] text-[11px] text-[#f3efe4] shadow-lg"
            >
              <Smartphone className="w-4 h-4 text-[#7effb2] shrink-0 rotate-90" />
              <span className="leading-snug">
                Safari iPhone: putar HP ke posisi mendatar (Landscape) untuk layar penuh maksimal.
              </span>
              <button
                type="button"
                aria-label="Tutup petunjuk landscape"
                onClick={() => setShowIosLandscapeHint(false)}
                className="p-0.5 rounded text-[#b7cbc2] hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {/* Preload Splash Screen */}
          {phase === 'loading' && (
            <SplashScreen
              loadProgress={loadProgress}
              isFullscreen={isFullscreen}
              compact={menuUiScale > 1}
              onEnter={handleEnterFromSplash}
              onToggleFullscreen={handleToggleFullscreen}
            />
          )}

          {/* Title Screen */}
          {phase === 'title' && (
            <TitleScreen
              scareMode={settings.scareMode}
              muted={settings.muted}
              isFullscreen={isFullscreen}
              compact={menuUiScale > 1}
              onStart={() => {
                setIsLoreOpen(false);
                handleStartLevel(1);
              }}
              onSelectLevel={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                setIsLoreOpen(false);
                setActiveModal('levels');
              }}
              onOpenGuide={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                setIsLoreOpen(false);
                setActiveModal('guide');
              }}
              onOpenSettings={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                setIsLoreOpen(false);
                setActiveModal('settings');
              }}
              onOpenLore={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                setActiveModal('none');
                setIsLoreOpen(true);
              }}
              onChangeScareMode={handleScareModeChange}
              onToggleMute={handleToggleMute}
              onToggleFullscreen={handleToggleFullscreen}
            />
          )}

          {/* Active Gameplay HUD */}
          {phase === 'playing' && (
            <PlayingHud
              hud={hud}
              muted={settings.muted}
              isFullscreen={isFullscreen}
              gyroEnabled={gyroEnabled}
              notifEnabled={notifEnabled}
              compact={menuUiScale > 1}
              playerHitFlash={playerHitFlash}
              ghostAlerts={ghostAlerts}
              onPause={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                engineRef.current?.pauseGame();
              }}
              onToggleMute={handleToggleMute}
              onToggleFullscreen={handleToggleFullscreen}
              onToggleGyro={handleToggleGyro}
              onToggleNotif={handleToggleNotif}
              onReload={() => engineRef.current?.triggerReload()}
            />
          )}

          {/* Pause Modal */}
          {phase === 'paused' && activeModal === 'none' && (
            <PauseModal
              levelName={hud.levelName}
              compact={menuUiScale > 1}
              onResume={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                engineRef.current?.resumeGame();
              }}
              onRestart={() => handleStartLevel(hud.levelId)}
              onOpenSettings={() => setActiveModal('settings')}
              onTitle={handleReturnToTitle}
            />
          )}

          {/* Level Complete / Game Over Modal */}
          {phase === 'gameover' && (
            <GameOverModal
              hud={hud}
              compact={menuUiScale > 1}
              onRetry={() => handleStartLevel(hud.levelId)}
              onNextLevel={() => handleStartLevel(Math.min(LEVEL_CONFIGS.length, hud.levelId + 1))}
              onTitle={handleReturnToTitle}
            />
          )}

          {/* Sub-modals (Level Select, Panduan, Pengaturan) */}
          {activeModal === 'levels' && (
            <LevelSelectModal
              compact={menuUiScale > 1}
              onSelect={(lvl) => handleStartLevel(lvl)}
              onClose={() => setActiveModal('none')}
            />
          )}
          {activeModal === 'guide' && <GuideModal compact={menuUiScale > 1} onClose={() => setActiveModal('none')} />}
          {activeModal === 'settings' && (
            <SettingsModal
              settings={settings}
              compact={menuUiScale > 1}
              onChange={handleUpdateSettings}
              onClose={() => setActiveModal('none')}
            />
          )}
          {phase === 'title' && isLoreOpen && activeModal === 'none' && (
            <GhostLoreModal
              compact={menuUiScale > 1}
              onClose={() => setIsLoreOpen(false)}
            />
          )}
        </div>

        {/* Slow dramatic smooth fade-in / fade-out curtain synchronized via rAF */}
        <div
          ref={curtainRef}
          aria-hidden="true"
          data-testid="level-transition-curtain"
          data-transition-phase={levelTransitionPhase}
          className={`absolute inset-0 z-40 bg-[#030508] ${
            levelTransitionPhase === 'fading_out' ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
          style={{ opacity: 0, willChange: 'opacity' }}
        />

        {/* Thin subtle flickering horizontal glitch slices layered gently on level enter/exit transitions */}
        {levelTransitionPhase !== 'idle' && (
          <div
            aria-hidden="true"
            data-testid="level-transition-glitch"
            data-transition-phase={levelTransitionPhase}
            className="pointer-events-none absolute inset-0 z-[41] overflow-hidden transition-glitch-layer"
          >
            <div className="transition-glitch-line-a" />
            <div className="transition-glitch-line-b" />
            <div className="transition-glitch-line-c" />
          </div>
        )}
      </main>
    </div>
  );
}
