import React from 'react';
import { Maximize2, Minimize2, Play } from 'lucide-react';
import { GHOST_DEFINITIONS } from '../game/levels';
import type { GhostType, LoadProgress } from '../game/types';

interface SplashScreenProps {
  loadProgress: LoadProgress;
  isFullscreen: boolean;
  compact?: boolean;
  onToggleFullscreen: () => void;
  onEnter: () => void;
}

const GHOST_ORDER: GhostType[] = ['tuyul', 'pocong', 'kuntilanak', 'genderuwo', 'buto_ijo'];

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loadProgress,
  isFullscreen,
  compact = false,
  onToggleFullscreen,
  onEnter,
}) => {
  const pct = Math.min(100, Math.max(0, loadProgress.percent));

  return (
    <div
      data-testid="splash-screen"
      className={`pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-between bg-gradient-to-b from-[#04070a]/95 via-[#070d12]/88 to-[#030508]/96 horror-vignette select-none ${
        compact ? 'px-5 py-2.5' : 'px-16 py-10'
      }`}
    >
      {/* Top atmospheric label + top-right fullscreen toggle */}
      <div className="w-full flex items-center justify-between">
        <div className={compact ? 'w-9' : 'w-14'} aria-hidden="true" />
        <div
          className={`flex items-center font-display text-[#d6a94f]/90 ${
            compact ? 'gap-1.5 text-[10px] tracking-[0.2em]' : 'gap-3 text-base tracking-[0.3em]'
          }`}
        >
          <span aria-hidden="true">◆</span>
          <span>EDISI ARKADE HOROR KOMEDI NUSANTARA</span>
          <span aria-hidden="true">◆</span>
        </div>
        <button
          type="button"
          data-testid="btn-fullscreen"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleFullscreen();
          }}
          aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh otomatis landscape'}
          title={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh landscape'}
          className={`horror-frame flex items-center justify-center rounded-lg text-[#f3efe4] hover:border-[#7effb2] transition-colors cursor-pointer ${
            compact ? 'w-9 h-9' : 'w-14 h-14'
          }`}
        >
          {isFullscreen ? (
            <Minimize2 className={compact ? 'w-4 h-4 text-[#ffd34e]' : 'w-6 h-6 text-[#ffd34e]'} />
          ) : (
            <Maximize2 className={compact ? 'w-4 h-4 text-[#7effb2]' : 'w-6 h-6 text-[#7effb2]'} />
          )}
        </button>
      </div>

      {/* Center Emblem, Title, Ghost Lineup & Loading Progress */}
      <div
        className={`flex flex-col items-center text-center w-full ${
          compact ? 'max-w-[680px] gap-2.5' : 'max-w-[1060px] gap-7'
        }`}
      >
        <svg
          viewBox="0 0 260 44"
          className={compact ? 'w-32 h-5 text-[#d6a94f]' : 'w-64 h-11 text-[#d6a94f]'}
          aria-hidden="true"
        >
          <path d="M2 22 H86 M174 22 H258" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.65" />
          <path d="M130 3 L148 22 L130 41 L112 22 Z" fill="rgba(18,32,26,0.95)" stroke="currentColor" strokeWidth="2" />
          <path d="M130 10 L140 22 L130 34 L120 22 Z" fill="none" stroke="#7effb2" strokeWidth="1.4" />
          <circle cx="130" cy="22" r="4" fill="#ff6b2b" />
        </svg>

        <div>
          <h1
            className={`font-display font-extrabold tracking-wider text-[#f7f0dc] leading-none drop-shadow-[0_10px_34px_rgba(0,0,0,0.95)] ${
              compact ? 'text-[30px]' : 'text-[78px]'
            }`}
          >
            BERBURU HANTU
          </h1>
          <p className={`text-[#8ff5bd] tracking-wide font-medium ${compact ? 'mt-0.5 text-xs' : 'mt-3 text-2xl'}`}>
            Petualangan Berburu Hantu Nusantara
          </p>
        </div>

        {/* 5 Ghost silhouettes progressively illuminating as assets load */}
        <div
          className={`grid grid-cols-5 w-full ${
            compact ? 'gap-2 max-w-[620px] py-0.5' : 'gap-5 max-w-[920px] py-2'
          }`}
        >
          {GHOST_ORDER.map((type, idx) => {
            const g = GHOST_DEFINITIONS[type];
            const threshold = (idx + 1) * 18;
            const lit = pct >= threshold || loadProgress.ready;
            return (
              <div
                key={type}
                className={`flex flex-col items-center border transition-all duration-300 ${
                  compact ? 'p-1.5 rounded-lg' : 'p-3.5 rounded-xl'
                } ${
                  lit
                    ? 'bg-[#101c20]/90 border-[#7effb2]/45 opacity-100'
                    : 'bg-[#080d11]/70 border-[#d6a94f]/15 opacity-40'
                }`}
              >
                <div className={`w-full flex items-end justify-center ${compact ? 'h-12 mb-1' : 'h-24 mb-2'}`}>
                  <img
                    src={g.imageUrl}
                    alt={g.name}
                    className="max-h-full max-w-full object-contain drop-shadow-[0_6px_16px_rgba(126,255,178,0.28)]"
                  />
                </div>
                <span className={`font-bold text-[#f3efe4] whitespace-nowrap ${compact ? 'text-[11px]' : 'text-base'}`}>
                  {g.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Loading Bar Box */}
        <div
          className={`w-full horror-frame ${
            compact ? 'max-w-[640px] rounded-lg p-2.5' : 'max-w-[920px] rounded-xl p-6'
          }`}
        >
          <div
            className={`flex items-center justify-between text-[#e6dcc6] ${
              compact ? 'gap-3 text-xs mb-1.5' : 'gap-6 text-base mb-3'
            }`}
          >
            <span data-testid="splash-status" className="font-medium text-[#d8e6de] truncate">
              {loadProgress.stageLabel || 'Memuat aset audio, tekstur & arena Nusantara...'}
            </span>
            <span data-testid="splash-percent" className="font-mono-num font-bold text-[#7effb2] shrink-0">
              {loadProgress.loaded}/{loadProgress.total} · {pct}%
            </span>
          </div>

          <div
            className={`w-full rounded-md bg-black/70 border border-[#d6a94f]/30 overflow-hidden p-[2px] ${
              compact ? 'h-2.5' : 'h-4'
            }`}
          >
            <div
              data-testid="splash-bar"
              className="h-full rounded-sm bg-gradient-to-r from-[#28d968] via-[#7effb2] to-[#ffd34e] transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className={`flex items-center justify-between text-[#9fb3a8] ${compact ? 'mt-2 text-[11px]' : 'mt-4 text-sm'}`}>
            <span>Resolusi Tetap 2400×1080 · Lensa Wide · VHS Retro Filter</span>
            {loadProgress.ready ? (
              <button
                type="button"
                onClick={onEnter}
                className={`flex items-center gap-1.5 rounded-md bg-gradient-to-b from-[#ff7d3b] to-[#d94d14] hover:from-[#ff8d52] hover:to-[#e95b1e] border border-[#ffd08a]/55 text-[#090b0d] font-display font-extrabold tracking-wider cursor-pointer ${
                  compact ? 'px-3.5 py-1 text-xs' : 'px-6 py-2.5 text-base'
                }`}
              >
                <Play className={compact ? 'w-3 h-3 fill-current' : 'w-4 h-4 fill-current'} />
                MASUK GAME
              </button>
            ) : (
              <span className="text-[#d6a94f] font-medium">Menyiapkan aset...</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Creator Credit */}
      <div className={`text-[#c8d0ca]/80 flex items-center ${compact ? 'text-[11px] gap-1.5' : 'text-base gap-2.5'}`}>
        <span>Created by</span>
        <strong className="text-[#d6a94f]">@adnanjogja</strong>
        <span aria-hidden="true">·</span>
        <a
          href="https://www.threads.com/@adnanjogja"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#7effb2] hover:underline"
        >
          Threads
        </a>
        <span aria-hidden="true">·</span>
        <a
          href="https://www.instagram.com/adnanjogja/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#ffb84d] hover:underline"
        >
          Instagram
        </a>
      </div>
    </div>
  );
};
