import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Compass, Maximize2, Minimize2, Pause, RotateCw, Volume2, VolumeX } from 'lucide-react';
import type { GhostAlertNotification, HudSnapshot } from '../game/types';

interface PlayingHudProps {
  hud: HudSnapshot;
  muted: boolean;
  isFullscreen: boolean;
  gyroEnabled: boolean;
  notifEnabled: boolean;
  compact?: boolean;
  playerHitFlash: boolean;
  ghostAlerts: GhostAlertNotification[];
  onPause: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleGyro: () => void;
  onToggleNotif: () => void;
  onReload: () => void;
}

interface RenderedAlert extends GhostAlertNotification {
  exiting?: boolean;
}

export const PlayingHud: React.FC<PlayingHudProps> = ({
  hud,
  muted,
  isFullscreen,
  gyroEnabled,
  notifEnabled,
  compact = false,
  playerHitFlash,
  ghostAlerts,
  onPause,
  onToggleMute,
  onToggleFullscreen,
  onToggleGyro,
  onToggleNotif,
  onReload,
}) => {
  const [renderedAlerts, setRenderedAlerts] = useState<RenderedAlert[]>([]);

  useEffect(() => {
    const activeIds = new Set(ghostAlerts.map((a) => a.id));
    setRenderedAlerts((prev) => {
      const next: RenderedAlert[] = [];
      const seen = new Set<number>();

      for (const item of prev) {
        if (activeIds.has(item.id)) {
          const fresh = ghostAlerts.find((a) => a.id === item.id) ?? item;
          next.push({ ...fresh, exiting: false });
          seen.add(item.id);
        } else {
          next.push({ ...item, exiting: true });
          seen.add(item.id);
        }
      }

      for (const incoming of ghostAlerts) {
        if (!seen.has(incoming.id)) {
          next.push({ ...incoming, exiting: false });
        }
      }

      return next.slice(-5);
    });
  }, [ghostAlerts]);

  useEffect(() => {
    if (!renderedAlerts.some((a) => a.exiting)) return;
    const timer = window.setTimeout(() => {
      setRenderedAlerts((prev) => prev.filter((a) => !a.exiting));
    }, 360);
    return () => window.clearTimeout(timer);
  }, [renderedAlerts]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none">
      {/* Subtle mystical screen-edge horror vignette framing the 3D scene */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_110px_rgba(0,0,0,0.62)]"
      />

      {/* Brief Slow-Motion Kill-Cam Cinema Framing & Focus Badge */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/85 to-transparent transition-all duration-150 ${
          hud.killCam?.active ? (compact ? 'h-10 opacity-100' : 'h-20 opacity-100') : 'h-0 opacity-0'
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent transition-all duration-150 ${
          hud.killCam?.active ? (compact ? 'h-10 opacity-100' : 'h-20 opacity-100') : 'h-0 opacity-0'
        }`}
      />

      {/* Crimson supernatural edge-flash overlay when a ghost attacks the player */}
      <div
        aria-hidden="true"
        data-testid="player-hit-flash"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${
          playerHitFlash ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,30,30,0) 48%, rgba(215,24,24,0.45) 84%, rgba(160,10,10,0.78) 100%)',
        }}
      />

      {/* Top Perimeter Clusters (>= 85% viewport remains completely clear) */}
      <div className={`flex items-start justify-between ${compact ? 'gap-2 safe-hud-top-compact' : 'gap-4 safe-hud-top-desktop'}`}>
        {/* Top-Left: Strictly displays ONLY Level & Location, Target Ghost Count, and Defeated Ghost Count */}
        <div
          data-testid="hud-top-left"
          className={`hud-glass flex flex-col rounded-lg drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] ${
            compact ? 'gap-0.5 px-3 py-1.5' : 'gap-1 px-5 py-2.5'
          }`}
        >
          <div
            data-testid="hud-level-location"
            className={`flex items-center font-display font-bold tracking-wider text-[#d6a94f] ${
              compact ? 'gap-1.5 text-[10px]' : 'gap-2 text-sm'
            }`}
          >
            <span>LVL {hud.levelId}</span>
            <span aria-hidden="true" className="text-[#d6a94f]/40">◆</span>
            <span className="text-[#e7dfd0]">{hud.levelName}</span>
          </div>
          <div className={`flex items-baseline ${compact ? 'gap-3' : 'gap-5'}`}>
            <div>
              <span className={`uppercase tracking-wider text-[#b7cbc2] ${compact ? 'text-[9px] mr-1' : 'text-xs mr-1.5'}`}>
                TARGET HANTU
              </span>
              <span
                className={`font-mono-num font-bold text-[#ffd34e] ${compact ? 'text-sm' : 'text-xl'}`}
                data-testid="hud-target-kills"
              >
                {hud.targetKills}
              </span>
            </div>
            <div>
              <span className={`uppercase tracking-wider text-[#b7cbc2] ${compact ? 'text-[9px] mr-1' : 'text-xs mr-1.5'}`}>
                DIKALAHKAN
              </span>
              <span
                className={`font-mono-num font-bold text-[#7effb2] ${compact ? 'text-sm' : 'text-xl'}`}
                data-testid="hud-kills"
              >
                {hud.kills}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Center: Compact Timer + Boss or Targeted Ghost HP */}
        <div className={`flex flex-col items-center ${compact ? 'gap-1' : 'gap-2'}`}>
          <div
            className={`hud-glass rounded-lg text-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] ${
              compact ? 'px-3 py-1' : 'px-5 py-2'
            }`}
          >
            <span
              className={`font-display uppercase tracking-widest text-[#d6a94f] block leading-tight ${
                compact ? 'text-[9px]' : 'text-xs'
              }`}
            >
              WAKTU
            </span>
            <span
              data-testid="hud-timer"
              className={`font-mono-num font-bold leading-none ${compact ? 'text-base' : 'text-2xl'} ${
                hud.timeLeft <= 12 ? 'text-[#ff5c5c]' : 'text-[#f7f2e4]'
              }`}
            >
              {hud.timeLeft}s
            </span>
          </div>

          {/* Boss Health Bar (Level 5) */}
          {hud.bossInfo?.active && (
            <div
              className={`hud-glass rounded-lg drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] ${
                compact ? 'w-44 px-2.5 py-1' : 'w-72 px-4 py-2'
              }`}
            >
              <div
                className={`flex justify-between font-display font-bold text-[#7effb2] mb-1 ${
                  compact ? 'text-[10px]' : 'text-sm'
                }`}
              >
                <span>
                  {hud.bossInfo.name} #{hud.bossKills + 1}
                </span>
                <span className="font-mono-num">
                  {hud.bossInfo.hp}/{hud.bossInfo.maxHp}
                </span>
              </div>
              <div className={`w-full rounded bg-black/60 border border-[#39ff7a]/30 overflow-hidden ${compact ? 'h-1.5' : 'h-2.5'}`}>
                <div
                  className="h-full bg-gradient-to-r from-[#28d968] to-[#7effb2] transition-all duration-150"
                  style={{ width: `${(hud.bossInfo.hp / hud.bossInfo.maxHp) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Targeted Ghost HP Indicator */}
          {hud.targetedGhost && !hud.targetedGhost.isBoss && (
            <div
              className={`hud-glass rounded-lg flex items-center drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] ${
                compact ? 'px-2.5 py-1 gap-1.5 text-[11px]' : 'px-3.5 py-1.5 gap-2.5 text-sm'
              }`}
            >
              <span className="font-display font-bold text-[#f7f2e4]">{hud.targetedGhost.name}</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: hud.targetedGhost.maxHp }).map((_, i) => (
                  <span
                    key={i}
                    className={`${compact ? 'w-2 h-2' : 'w-3 h-3'} rounded-sm ${
                      i < hud.targetedGhost!.hp ? 'bg-[#ff6b2b]' : 'bg-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top-Right: Compact Accuracy + Mute + Fullscreen Landscape + Pause */}
        <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2.5'}`}>
          <div
            className={`hud-glass flex flex-col items-end rounded-lg drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] ${
              compact ? 'px-2.5 py-1' : 'px-4 py-2 text-sm'
            }`}
          >
            <span className={`uppercase tracking-wider text-[#b7cbc2] leading-tight ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
              AKURASI
            </span>
            <span className={`font-mono-num font-bold text-[#f3efe4] leading-tight ${compact ? 'text-xs' : 'text-base'}`}>
              {hud.accuracy}%
            </span>
          </div>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onToggleMute();
            }}
            className={`hud-glass pointer-events-auto flex items-center justify-center rounded-lg text-[#f3efe4] hover:border-[#7effb2] cursor-pointer ${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            }`}
          >
            {muted ? (
              <VolumeX className={compact ? 'w-4 h-4 text-[#ff7b7b]' : 'w-5 h-5 text-[#ff7b7b]'} />
            ) : (
              <Volume2 className={compact ? 'w-4 h-4 text-[#7effb2]' : 'w-5 h-5 text-[#7effb2]'} />
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-fullscreen"
            aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh otomatis landscape'}
            title={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh landscape'}
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onToggleFullscreen();
            }}
            className={`hud-glass pointer-events-auto flex items-center justify-center rounded-lg text-[#f3efe4] hover:border-[#ffd34e] cursor-pointer ${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            }`}
          >
            {isFullscreen ? (
              <Minimize2 className={compact ? 'w-4 h-4 text-[#ffd34e]' : 'w-5 h-5 text-[#ffd34e]'} />
            ) : (
              <Maximize2 className={compact ? 'w-4 h-4 text-[#7effb2]' : 'w-5 h-5 text-[#7effb2]'} />
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Jeda permainan"
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onPause();
            }}
            className={`hud-glass pointer-events-auto flex items-center justify-center rounded-lg text-[#f3efe4] hover:border-[#d6a94f] cursor-pointer ${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            }`}
          >
            <Pause className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
          </button>
        </div>
      </div>

      {/* Bottom-Right: Laser Energy Ammo & Reload + 72° Camera Yaw Readout (Bottom-Left intentionally clear) */}
      <div
        className={`absolute flex flex-col items-end pointer-events-none ${
          compact ? 'safe-hud-br-compact gap-1' : 'safe-hud-br-desktop gap-2'
        }`}
      >
        <div
          data-testid="hud-yaw"
          className={`hud-glass rounded-md font-mono-num text-[#d5e3db]/90 ${
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-3.5 py-1 text-sm'
          }`}
        >
          {hud.cameraYawDeg > 0 ? `+${hud.cameraYawDeg}` : hud.cameraYawDeg}° / ±36°
        </div>
        <div
          className={`hud-glass pointer-events-auto flex items-center rounded-lg ${
            compact ? 'gap-2 px-2.5 py-1.5' : 'gap-3 px-4 py-2'
          }`}
        >
          <div className="flex flex-col gap-1">
            <div
              className={`flex items-center justify-between font-display font-bold tracking-wider text-[#d6a94f] ${
                compact ? 'gap-2 text-[11px]' : 'gap-4 text-sm'
              }`}
            >
              <span>LASER</span>
              <span className="font-mono-num text-[#38f8ff]">
                {hud.isReloading ? 'ISI...' : `${hud.ammo}/${hud.maxAmmo}`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: hud.maxAmmo }).map((_, i) => (
                <span
                  key={i}
                  className={`${compact ? 'w-1.5 h-2.5' : 'w-2 h-4'} rounded-[2px] ${
                    i < hud.ammo ? 'bg-[#38f8ff] shadow-[0_0_6px_rgba(56,248,255,0.6)]' : 'bg-white/15'
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Isi ulang peluru laser"
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onReload();
            }}
            className={`flex items-center justify-center rounded-lg bg-[#102129]/60 border border-[#38f8ff]/40 text-[#38f8ff] hover:bg-[#19303b]/80 cursor-pointer ${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            }`}
          >
            <RotateCw className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} ${hud.isReloading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Bottom-Left: 3-Row Slider Notification above Aktifkan Gyro + Notif ON/OFF Toggle */}
      <div
        className={`absolute flex flex-col items-start pointer-events-none ${
          compact ? 'safe-hud-bl-compact gap-1.5' : 'safe-hud-bl-desktop gap-2.5'
        }`}
      >
        {notifEnabled && (
          <div
            data-testid="ghost-alert-feed"
            aria-live="polite"
            className={`pointer-events-none flex flex-col items-start overflow-hidden ${
              compact ? 'w-64 gap-0.5' : 'w-[430px] gap-1'
            }`}
          >
            {renderedAlerts.map((alert) => (
              <div
                key={alert.id}
                data-testid={alert.exiting ? 'ghost-alert-row-exiting' : 'ghost-alert-row'}
                data-face-alert={alert.isFaceAttack ? 'true' : 'false'}
                className={`w-full rounded-md border backdrop-blur-[2px] flex items-center justify-between transition-all duration-300 ease-out ${
                  alert.exiting ? 'animate-ghost-alert-out' : 'animate-ghost-alert-in'
                } ${
                  alert.isFaceAttack
                    ? 'bg-[#2b050b]/74 border-[#ff2a4d]/85 shadow-[0_0_14px_rgba(255,42,77,0.45)]'
                    : alert.isBoss
                      ? 'bg-[#042423]/48 border-[#2dd4bf]/55 shadow-[0_0_12px_rgba(45,212,191,0.22)]'
                      : 'bg-[#041d1c]/42 border-[#2dd4bf]/32 shadow-[0_0_8px_rgba(45,212,191,0.14)]'
                } ${compact ? 'px-2 py-0.5 text-[9px] gap-1.5' : 'px-3 py-1 text-xs gap-2'}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className={`shrink-0 rounded-full ${
                      alert.isFaceAttack
                        ? 'bg-[#ff2e55] shadow-[0_0_8px_#ff2e55] animate-ping'
                        : 'bg-[#2dd4bf] animate-pulse'
                    } ${compact ? 'w-1 h-1' : 'w-1.5 h-1.5'}`}
                  />
                  <span
                    className={`font-mono-num font-bold tracking-wider truncate ${
                      alert.isFaceAttack
                        ? 'text-[#ff2e55] animate-face-neon-blink'
                        : 'text-[#4bf2d8]/90 animate-techno-glitch'
                    }`}
                  >
                    {alert.title}
                  </span>
                </div>
                {alert.detail && (
                  <span
                    className={`shrink-0 font-mono-num uppercase tracking-wider ${
                      alert.isFaceAttack
                        ? 'text-[#ff4d6d] animate-face-neon-blink font-bold'
                        : 'text-[#8ef7e6]/75'
                    } ${compact ? 'text-[8px]' : 'text-[10px]'}`}
                  >
                    {alert.detail.replace(/^LOKASI:\s*/, '')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-gyro"
            aria-pressed={gyroEnabled}
            aria-label={gyroEnabled ? 'Nonaktifkan sensor giroskop' : 'Aktifkan sensor giroskop HP'}
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onToggleGyro();
            }}
            className={`hud-glass pointer-events-auto flex items-center rounded-lg font-display font-bold tracking-wide cursor-pointer transition-colors ${
              compact ? 'gap-1.5 px-2.5 py-1.5 text-[10px]' : 'gap-2 px-3.5 py-2 text-xs'
            } ${
              gyroEnabled
                ? 'border-[#2dd4bf]/65 text-[#7effb2] bg-[#082420]/75'
                : 'text-[#e7dfd0] hover:border-[#2dd4bf]/60 hover:text-[#7effb2]'
            }`}
          >
            <Compass className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            <span>{gyroEnabled ? 'Gyro Aktif' : 'Aktifkan Gyro'}</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="btn-notif"
            aria-pressed={notifEnabled}
            aria-label={notifEnabled ? 'Nonaktifkan notifikasi slider' : 'Aktifkan notifikasi slider'}
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onToggleNotif();
            }}
            className={`hud-glass pointer-events-auto flex items-center rounded-lg font-display font-bold tracking-wide cursor-pointer transition-colors ${
              compact ? 'gap-1 px-2.5 py-1.5 text-[10px]' : 'gap-1.5 px-3 py-2 text-xs'
            } ${
              notifEnabled
                ? 'border-[#2dd4bf]/60 text-[#7effb2] bg-[#082420]/70'
                : 'border-white/20 text-[#9aa8a3] bg-[#0b1014]/70 hover:text-[#e7dfd0]'
            }`}
          >
            {notifEnabled ? (
              <Bell className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            ) : (
              <BellOff className={compact ? 'w-3.5 h-3.5 text-[#ff7b7b]' : 'w-4 h-4 text-[#ff7b7b]'} />
            )}
            <span>{notifEnabled ? 'Notif: ON' : 'Notif: OFF'}</span>
          </button>
        </div>
      </div>

    </div>
  );
};
