import { useCallback, useEffect, useRef, useState } from 'react';
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
import { TitleScreen } from './components/TitleScreen';
import { AUDIO_MANIFEST, GameAudioManager } from './game/audio';
import { GameEngine } from './game/engine';
import { LEVEL_CONFIGS } from './game/levels';
import {
  FIXED_STAGE_HEIGHT,
  FIXED_STAGE_WIDTH,
  computeMenuUiScale,
  resolveMousePointerVisibility,
} from './game/rules';
import type {
  GamePhase,
  GameSettings,
  GhostType,
  HudSnapshot,
  LoadProgress,
  ScareMode,
  ScorePopupEvent,
} from './game/types';

const TOTAL_PRELOAD_ASSETS = Object.keys(AUDIO_MANIFEST).length + 5 + LEVEL_CONFIGS.length;

function computeStageScale(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.innerWidth / FIXED_STAGE_WIDTH, window.innerHeight / FIXED_STAGE_HEIGHT);
}

function getCurrentMenuUiScale(): number {
  if (typeof window === 'undefined') return 1;
  return computeMenuUiScale(window.innerWidth, window.innerHeight);
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
  phase: 'loading',
  outcome: null,
  levelId: 1,
  levelName: 'Kuburan Tua',
  score: 0,
  highScore: 0,
  combo: 0,
  maxCombo: 0,
  shotsFired: 0,
  shotsHit: 0,
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
  activeGhostCount: 0,
  cameraYawDeg: 0,
  cameraPitchDeg: 0,
  accuracyBonus: 0,
  comboBonus: 0,
  ghostAttacksReceived: 0,
};

export default function App() {
  const stageRef = useRef<HTMLElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const audioRef = useRef<GameAudioManager | null>(null);
  const hitFlashTimeoutRef = useRef<number | null>(null);

  const [stageScale, setStageScale] = useState<number>(() => computeStageScale());
  const [menuUiScale, setMenuUiScale] = useState<number>(() => getCurrentMenuUiScale());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
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
  const [selectedLoreGhost, setSelectedLoreGhost] = useState<GhostType | null>(null);
  const [showMousePointer, setShowMousePointer] = useState(false);
  const showMousePointerRef = useRef(false);
  const mouseStagePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hitMarker, setHitMarker] = useState<{ active: boolean; isKill: boolean; x: number; y: number }>({
    active: false,
    isKill: false,
    x: 0,
    y: 0,
  });
  const [popups, setPopups] = useState<ScorePopupEvent[]>([]);

  const phaseRef = useRef<GamePhase>('loading');
  const modalRef = useRef(activeModal);
  modalRef.current = activeModal;

  const isAutostartRef = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autostart') === '1',
  );

  // Proportional scaling of fixed 2400x1080 stage + 3x menu enlargement on smartphone viewports
  useEffect(() => {
    const onResize = () => {
      setStageScale(computeStageScale());
      setMenuUiScale(getCurrentMenuUiScale());
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sync fullscreen state with browser changes (e.g. Escape key)
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
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
    setStageScale(computeStageScale());
    setMenuUiScale(getCurrentMenuUiScale());
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
        onScorePopup: (popup) => {
          setPopups((prev) => [...prev.slice(-4), popup]);
          window.setTimeout(() => {
            setPopups((prev) => prev.filter((item) => item.id !== popup.id));
          }, 900);
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

  const handleEnterFromSplash = useCallback(() => {
    void audioRef.current?.unlock();
    void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
    engineRef.current?.enterTitleFromSplash();
  }, []);

  const handleStartLevel = useCallback((levelId: number) => {
    void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
    setActiveModal('none');
    engineRef.current?.startLevel(levelId);
  }, []);

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
    <div className="w-screen h-screen bg-[#040608] flex items-center justify-center overflow-hidden">
      <main
        ref={stageRef}
        data-testid="viewport-2400x1080"
        className="relative overflow-hidden bg-[#090d10] border border-[#d6a94f]/25 shadow-[0_0_80px_rgba(0,0,0,0.96)]"
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
          style={{
            width: `${FIXED_STAGE_WIDTH / menuUiScale}px`,
            height: `${FIXED_STAGE_HEIGHT / menuUiScale}px`,
            transform: `scale(${menuUiScale})`,
            transformOrigin: 'top left',
          }}
        >
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
              highScore={hud.highScore}
              scareMode={settings.scareMode}
              muted={settings.muted}
              isFullscreen={isFullscreen}
              compact={menuUiScale > 1}
              onStart={() => {
                setSelectedLoreGhost(null);
                handleStartLevel(1);
              }}
              onSelectLevel={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                setSelectedLoreGhost(null);
                setActiveModal('levels');
              }}
              onOpenGuide={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                setSelectedLoreGhost(null);
                setActiveModal('guide');
              }}
              onOpenSettings={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                setSelectedLoreGhost(null);
                setActiveModal('settings');
              }}
              onSelectGhostLore={(ghost) => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                setActiveModal('none');
                setSelectedLoreGhost(ghost);
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
              compact={menuUiScale > 1}
              playerHitFlash={playerHitFlash}
              popups={popups}
              onPause={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                engineRef.current?.pauseGame();
              }}
              onToggleMute={handleToggleMute}
              onToggleFullscreen={handleToggleFullscreen}
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
              onTitle={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                engineRef.current?.returnToTitle();
              }}
            />
          )}

          {/* Level Complete / Game Over Modal */}
          {phase === 'gameover' && (
            <GameOverModal
              hud={hud}
              compact={menuUiScale > 1}
              onRetry={() => handleStartLevel(hud.levelId)}
              onNextLevel={() => handleStartLevel(Math.min(LEVEL_CONFIGS.length, hud.levelId + 1))}
              onTitle={() => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.7 });
                engineRef.current?.returnToTitle();
              }}
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
          {phase === 'title' && selectedLoreGhost && activeModal === 'none' && (
            <GhostLoreModal
              ghostType={selectedLoreGhost}
              compact={menuUiScale > 1}
              onSelectGhost={(ghost) => {
                void audioRef.current?.playSfx('ui/click', { volume: 0.65 });
                setSelectedLoreGhost(ghost);
              }}
              onClose={() => setSelectedLoreGhost(null)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
