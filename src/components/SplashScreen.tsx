import React from 'react';
import { Maximize2, Minimize2, Play } from 'lucide-react';
import type { LoadProgress } from '../game/types';
import { CrackedStoneTitle } from './CrackedStoneTitle';

interface SplashScreenProps {
  loadProgress: LoadProgress;
  isFullscreen: boolean;
  compact?: boolean;
  onToggleFullscreen: () => void;
  onEnter: () => void;
}

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
      className={`pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-between select-none overflow-hidden ${
        compact ? 'px-6 py-3' : 'px-16 py-10'
      }`}
    >
      {/* Subtle top & bottom gradient scrim leaving the dynamic stormy 3D arena visible */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#04070b]/58 via-[#05090e]/24 to-[#030508]/88"
      />

      {/* Minimalist PS5 Top Bar */}
      <div className="w-full flex items-center justify-between animate-ps5-enter">
        <span
          className={`font-sans font-medium uppercase text-[#c7d3db]/80 ${
            compact ? 'text-[10px] tracking-[0.26em]' : 'text-sm tracking-[0.34em]'
          }`}
        >
          EDISI HOROR NUSANTARA
        </span>

        <button
          type="button"
          data-testid="btn-fullscreen"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleFullscreen();
          }}
          aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh otomatis landscape'}
          title={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh landscape'}
          className={`ps5-icon-btn flex items-center justify-center rounded-xl text-[#f3efe4] cursor-pointer ${
            compact ? 'w-9 h-9' : 'w-14 h-14'
          }`}
        >
          {isFullscreen ? (
            <Minimize2 className={compact ? 'w-4 h-4 text-[#ffd34e]' : 'w-6 h-6 text-[#ffd34e]'} />
          ) : (
            <Maximize2 className={compact ? 'w-4 h-4 text-[#dbe6ee]' : 'w-6 h-6 text-[#dbe6ee]'} />
          )}
        </button>
      </div>

      {/* Center Stage: Gunungan Crest + 3D Cracked-Stone Title */}
      <div
        className={`flex flex-col items-center text-center w-full animate-ps5-enter-d1 ${
          compact ? 'max-w-[580px] gap-2' : 'max-w-[1220px] gap-6'
        }`}
      >
        <svg
          viewBox="0 0 220 34"
          className={compact ? 'w-24 h-4 text-[#d6a94f]/80' : 'w-52 h-8 text-[#d6a94f]/80'}
          aria-hidden="true"
        >
          <path d="M4 17 H78 M142 17 H216" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.45" />
          <path d="M110 3 L123 17 L110 31 L97 17 Z" fill="rgba(10,16,20,0.65)" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="110" cy="17" r="2.6" fill="#7effb2" />
        </svg>

        <CrackedStoneTitle align="center" compact={compact} variant="splash" />

        <p
          className={`font-sans font-normal text-[#cfdbe3]/90 tracking-[0.14em] drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)] ${
            compact ? 'text-[11px]' : 'text-2xl'
          }`}
        >
          Petualangan Berburu Hantu Nusantara
        </p>
      </div>

      {/* Bottom Minimalist PS5 Loading Dock + Entry Action */}
      <div className={`w-full flex flex-col items-center animate-ps5-enter-d2 ${compact ? 'gap-2.5' : 'gap-6'}`}>
        <div className={`w-full flex flex-col ${compact ? 'max-w-[460px] gap-2' : 'max-w-[820px] gap-3.5'}`}>
          <div
            className={`flex items-center justify-between text-[#d4dfe6]/85 ${
              compact ? 'text-[11px] gap-3' : 'text-base gap-6'
            }`}
          >
            <span data-testid="splash-status" className="truncate font-normal tracking-wide">
              {loadProgress.stageLabel || 'Menyiapkan arena malam Nusantara...'}
            </span>
            <span data-testid="splash-percent" className="font-mono-num font-semibold text-[#eef4f8] shrink-0">
              {pct}%
            </span>
          </div>

          <div className={`w-full rounded-full bg-white/12 overflow-hidden ${compact ? 'h-[3px]' : 'h-1'}`}>
            <div
              data-testid="splash-bar"
              className="h-full rounded-full bg-gradient-to-r from-[#85b6d8] via-[#d8edf9] to-[#7effb2] transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className={`flex items-center justify-center ${compact ? 'pt-1 min-h-[34px]' : 'pt-3 min-h-[60px]'}`}>
            {loadProgress.ready ? (
              <button
                type="button"
                onClick={onEnter}
                className={`ps5-action-tile ps5-btn-ember flex items-center justify-center rounded-xl text-[#fff8ef] font-sans font-semibold tracking-[0.18em] uppercase cursor-pointer whitespace-nowrap ${
                  compact ? 'gap-2 px-5 py-1.5 text-xs' : 'gap-3 px-10 py-4 text-base'
                }`}
              >
                <Play className={compact ? 'w-3.5 h-3.5 fill-current' : 'w-5 h-5 fill-current'} />
                MASUK ARENA
              </button>
            ) : (
              <span className={`tracking-[0.22em] uppercase text-[#a9bac6]/75 ${compact ? 'text-[10px]' : 'text-sm'}`}>
                Memuat atmosfer &amp; suara alam...
              </span>
            )}
          </div>
        </div>

        <div
          className={`flex items-center text-[#b8c4cc]/70 ${
            compact ? 'text-[10px] gap-1.5' : 'text-sm gap-3'
          }`}
        >
          <span>Created by</span>
          <strong className="font-semibold text-[#d6a94f]/90">@adnanjogja</strong>
          <span aria-hidden="true">·</span>
          <a
            href="https://www.threads.com/@adnanjogja"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#c9dce6] hover:text-white transition-colors"
          >
            Threads
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://www.instagram.com/adnanjogja/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#c9dce6] hover:text-white transition-colors"
          >
            Instagram
          </a>
        </div>
      </div>
    </div>
  );
};
