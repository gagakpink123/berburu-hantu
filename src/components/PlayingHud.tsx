import React from 'react';
import { Maximize2, Minimize2, Pause, RotateCw, Volume2, VolumeX } from 'lucide-react';
import type { HudSnapshot, ScorePopupEvent } from '../game/types';

interface PlayingHudProps {
  hud: HudSnapshot;
  muted: boolean;
  isFullscreen: boolean;
  compact?: boolean;
  playerHitFlash: boolean;
  popups: ScorePopupEvent[];
  onPause: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onReload: () => void;
}

export const PlayingHud: React.FC<PlayingHudProps> = ({
  hud,
  muted,
  isFullscreen,
  compact = false,
  playerHitFlash,
  popups,
  onPause,
  onToggleMute,
  onToggleFullscreen,
  onReload,
}) => {
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
      {hud.killCam?.active && (
        <div
          data-testid="kill-cam-indicator"
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 hud-glass rounded-lg border flex flex-col items-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)] ${
            hud.killCam.isBoss
              ? 'border-[#39ff7a]/75 shadow-[0_0_24px_rgba(57,255,122,0.35)]'
              : 'border-[#ffd34e]/70 shadow-[0_0_20px_rgba(255,211,78,0.28)]'
          } ${compact ? 'bottom-2.5 px-3 py-1 gap-1 min-w-[165px]' : 'bottom-5 px-5 py-2 gap-1.5 min-w-[260px]'}`}
        >
          <div className={`flex items-center font-display font-extrabold tracking-widest ${compact ? 'gap-1.5 text-[10px]' : 'gap-2 text-xs'}`}>
            <span className={`inline-block rounded-full animate-pulse ${hud.killCam.isBoss ? 'bg-[#39ff7a]' : 'bg-[#ff52e5]'} ${compact ? 'w-1.5 h-1.5' : 'w-2 h-2'}`} />
            <span className={hud.killCam.isBoss ? 'text-[#7effb2]' : 'text-[#ffd34e]'}>
              KILL-CAM · SLOW-MO
            </span>
          </div>
          <div className={`font-display font-bold text-[#f7f2e4] leading-none ${compact ? 'text-xs' : 'text-base'}`}>
            {hud.killCam.isBoss ? `BOSS ${hud.killCam.ghostName.toUpperCase()} TUMBANG!` : `${hud.killCam.ghostName} Kalah!`}
          </div>
          <div className={`w-full rounded-full bg-white/15 overflow-hidden ${compact ? 'h-1' : 'h-1.5'}`}>
            <div
              className={`h-full transition-[width] duration-75 ${
                hud.killCam.isBoss
                  ? 'bg-gradient-to-r from-[#2be092] to-[#39ff7a]'
                  : 'bg-gradient-to-r from-[#ff7d3b] via-[#ffd34e] to-[#ff52e5]'
              }`}
              style={{ width: `${Math.max(4, Math.round((1 - hud.killCam.progress) * 100))}%` }}
            />
          </div>
        </div>
      )}

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
      <div className={`flex items-start justify-between ${compact ? 'gap-2 p-2.5' : 'gap-4 p-6'}`}>
        {/* Top-Left: Level, Score, Ghost Kill Target & Boss Target (Level 5) */}
        <div
          className={`hud-glass flex flex-col rounded-lg drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] ${
            compact ? 'gap-0.5 px-3 py-1.5' : 'gap-1 px-5 py-2.5'
          }`}
        >
          <div
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
                SKOR
              </span>
              <span
                className={`font-mono-num font-bold text-[#f7f2e4] ${compact ? 'text-base' : 'text-2xl'}`}
                data-testid="hud-score"
              >
                {hud.score.toLocaleString('id-ID')}
              </span>
            </div>
            <div>
              <span className={`uppercase tracking-wider text-[#b7cbc2] ${compact ? 'text-[9px] mr-1' : 'text-xs mr-1.5'}`}>
                HANTU
              </span>
              <span
                className={`font-mono-num font-bold text-[#7effb2] ${compact ? 'text-sm' : 'text-xl'}`}
                data-testid="hud-kills"
              >
                {hud.kills}/{hud.targetKills}
              </span>
            </div>
            {hud.targetBossKills > 0 && (
              <div>
                <span className={`uppercase tracking-wider text-[#b7cbc2] ${compact ? 'text-[9px] mr-1' : 'text-xs mr-1.5'}`}>
                  BUTO IJO
                </span>
                <span
                  data-testid="hud-boss-kills"
                  className={`font-mono-num font-bold ${compact ? 'text-sm' : 'text-xl'} ${
                    hud.bossKills >= hud.targetBossKills ? 'text-[#7effb2]' : 'text-[#ffd34e]'
                  }`}
                >
                  {hud.bossKills}/{hud.targetBossKills}
                </span>
              </div>
            )}
            {hud.combo >= 2 && (
              <span className={`font-mono-num font-bold text-[#ffb84d] ${compact ? 'text-xs' : 'text-base'}`}>
                {hud.combo}x
              </span>
            )}
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
          compact ? 'bottom-2.5 right-3 gap-1' : 'bottom-5 right-6 gap-2'
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

      {/* Score Popups */}
      {popups.map((p) => (
        <div
          key={p.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none"
          style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
        >
          <div
            className={`font-mono-num font-extrabold drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] ${
              compact
                ? p.isBoss
                  ? 'text-2xl text-[#39ff7a]'
                  : 'text-xl text-[#ffd34e]'
                : p.isBoss
                  ? 'text-4xl text-[#39ff7a]'
                  : 'text-3xl text-[#ffd34e]'
            }`}
          >
            {p.text}
          </div>
          {p.subtext && (
            <div
              className={`font-bold text-[#f3efe4] drop-shadow-[0_2px_8px_rgba(0,0,0,0.98)] ${
                compact ? 'text-[11px]' : 'text-sm'
              }`}
            >
              {p.subtext}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
