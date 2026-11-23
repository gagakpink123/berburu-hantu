import React, { useEffect, useState } from 'react';
import { BookOpen, Ghost, Map, Maximize2, Minimize2, Play, Settings, Volume2, VolumeX } from 'lucide-react';
import { TITLE_SUBTITLE_INTERVAL_MS, TITLE_SUBTITLES, pickNextRandomSubtitleIndex } from '../game/rules';
import type { ScareMode } from '../game/types';
import { CrackedStoneTitle } from './CrackedStoneTitle';
import { SubtleGhostBackdrop } from './SubtleGhostBackdrop';

interface TitleScreenProps {
  scareMode: ScareMode;
  muted: boolean;
  isFullscreen: boolean;
  compact?: boolean;
  onStart: () => void;
  onSelectLevel: () => void;
  onOpenGuide: () => void;
  onOpenSettings: () => void;
  onOpenLore: () => void;
  onChangeScareMode: (mode: ScareMode) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
}

const SCARE_OPTIONS: Array<{ id: ScareMode; label: string; hint: string }> = [
  { id: 'santai', label: 'Santai', hint: 'Cerah & ramah untuk anak' },
  { id: 'petualangan', label: 'Petualangan', hint: 'Horor komedi malam seimbang' },
  { id: 'horor', label: 'Horor', hint: 'Lebih gelap, sunyi & menegangkan' },
];

export const TitleScreen: React.FC<TitleScreenProps> = ({
  scareMode,
  muted,
  isFullscreen,
  compact = false,
  onStart,
  onSelectLevel,
  onOpenGuide,
  onOpenSettings,
  onOpenLore,
  onChangeScareMode,
  onToggleMute,
  onToggleFullscreen,
}) => {
  const activeScareHint = SCARE_OPTIONS.find((o) => o.id === scareMode)?.hint;
  const [subtitleIdx, setSubtitleIdx] = useState<number>(() =>
    Math.floor(Math.random() * TITLE_SUBTITLES.length),
  );
  const [subtitleLeaving, setSubtitleLeaving] = useState<boolean>(false);

  useEffect(() => {
    let stayTimer: number | null = null;
    let outTimer: number | null = null;
    const fadeOutMs = 1200;
    const stayMs = Math.max(1000, TITLE_SUBTITLE_INTERVAL_MS - fadeOutMs);

    const scheduleNext = () => {
      stayTimer = window.setTimeout(() => {
        setSubtitleLeaving(true);
        outTimer = window.setTimeout(() => {
          setSubtitleIdx((prev) => pickNextRandomSubtitleIndex(prev, TITLE_SUBTITLES.length));
          setSubtitleLeaving(false);
          scheduleNext();
        }, fadeOutMs);
      }, stayMs);
    };

    scheduleNext();
    return () => {
      if (stayTimer !== null) window.clearTimeout(stayTimer);
      if (outTimer !== null) window.clearTimeout(outTimer);
    };
  }, []);

  return (
    <div
      data-testid="title-screen"
      className={`pointer-events-auto absolute inset-0 z-20 flex flex-col justify-between overflow-hidden select-none ${
        compact ? 'safe-pad-title-compact' : 'safe-pad-title-desktop'
      }`}
    >
      {/* Subtle misty Nusantara ghost silhouettes flanking the centered menu */}
      <SubtleGhostBackdrop compact={compact} />

      {/* Balanced centered vignette scrim: ensures crisp readability while keeping stormy sky & background ghosts visible */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 68% 72% at 50% 50%, rgba(4, 7, 11, 0.58) 0%, rgba(5, 9, 14, 0.34) 56%, rgba(3, 5, 8, 0.72) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[#030508]/84 via-transparent to-[#04070b]/46"
      />

      {/* Top PS5 Utility Bar */}
      <header className="w-full flex items-center justify-between gap-4 animate-ps5-enter">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className={`w-[3px] rounded-full bg-[#d6a94f]/85 ${compact ? 'h-5' : 'h-9'}`}
          />
          <div className="flex flex-col">
            <span
              className={`font-sans font-medium uppercase text-[#9eb0bc] ${
                compact ? 'text-[9px] tracking-[0.24em]' : 'text-xs tracking-[0.28em]'
              }`}
            >
              Misi Penumpasan
            </span>
            <span
              className={`font-display font-bold text-[#f2f6f8] leading-tight ${
                compact ? 'text-xs' : 'text-xl'
              }`}
            >
              10 Arena Nusantara
            </span>
          </div>
        </div>

        <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3.5'}`}>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            title={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            className={`ps5-icon-btn flex items-center justify-center rounded-xl text-[#f3efe4] cursor-pointer ${
              compact ? 'w-9 h-9' : 'w-14 h-14'
            }`}
          >
            {muted ? (
              <VolumeX className={compact ? 'w-4 h-4 text-[#ff7b7b]' : 'w-6 h-6 text-[#ff7b7b]'} />
            ) : (
              <Volume2 className={compact ? 'w-4 h-4 text-[#dbe6ee]' : 'w-6 h-6 text-[#dbe6ee]'} />
            )}
          </button>

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
      </header>

      {/* Centered Minimalist PS5 Hero & Action Hub */}
      <div
        data-testid="title-hero-center"
        className={`my-auto mx-auto flex flex-col items-center text-center w-full ${
          compact ? 'max-w-[500px] gap-2.5' : 'max-w-[1060px] gap-7'
        }`}
      >
        {/* Minimalist Nusantara Crest + Centered 3D Cracked Stone Title */}
        <div className={`flex flex-col items-center animate-ps5-enter-d1 ${compact ? 'gap-1' : 'gap-2.5'}`}>
          <div className="flex items-center justify-center gap-3.5">
            <svg
              viewBox="0 0 80 20"
              className={compact ? 'w-9 h-2.5 text-[#d6a94f]/85' : 'w-16 h-4 text-[#d6a94f]/85'}
              aria-hidden="true"
            >
              <path d="M1 10 H48" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.55" />
              <path d="M62 2 L70 10 L62 18 L54 10 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="62" cy="10" r="2" fill="#7effb2" />
            </svg>
            <span
              className={`font-sans font-semibold uppercase text-[#d6a94f]/95 ${
                compact ? 'text-[9px] tracking-[0.26em]' : 'text-sm tracking-[0.34em]'
              }`}
            >
              DIVISI PEMBURU HANTU LOKAL
            </span>
            <svg
              viewBox="0 0 80 20"
              className={compact ? 'w-9 h-2.5 text-[#d6a94f]/85' : 'w-16 h-4 text-[#d6a94f]/85'}
              aria-hidden="true"
            >
              <path d="M32 10 H79" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.55" />
              <path d="M18 2 L26 10 L18 18 L10 10 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="18" cy="10" r="2" fill="#7effb2" />
            </svg>
          </div>

          <CrackedStoneTitle align="center" compact={compact} variant="title" />

          <div
            className={`w-full flex items-start justify-center overflow-hidden ${
              compact ? '-mt-1.5 pt-0.5 min-h-[26px] max-w-[480px]' : '-mt-5 pt-0.5 min-h-[52px] max-w-[1000px]'
            }`}
          >
            <p
              key={subtitleIdx}
              data-testid="title-rotating-subtitle"
              data-subtitle-state={subtitleLeaving ? 'leaving' : 'entering'}
              className={`font-sans italic font-normal subtitle-neon tracking-wide text-center leading-snug ${
                subtitleLeaving ? 'animate-subtitle-slide-out' : 'animate-subtitle-slide-in'
              } ${compact ? 'text-[10.5px]' : 'text-xl'}`}
            >
              {TITLE_SUBTITLES[subtitleIdx]}
            </p>
          </div>
        </div>

        {/* Centered Minimalist PS5 Scare Mode Rail */}
        <div className={`w-full mx-auto animate-ps5-enter-d2 ${compact ? 'max-w-[380px]' : 'max-w-[680px]'}`}>
          <div className="flex items-center justify-between border-b border-white/16">
            {SCARE_OPTIONS.map((opt) => {
              const active = scareMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeScareMode(opt.id)}
                  className={`relative flex-1 font-sans font-semibold tracking-[0.14em] uppercase transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white ${
                    compact ? 'py-1.5 text-[10px]' : 'py-3.5 text-base'
                  } ${
                    active ? 'text-[#f6fafc]' : 'text-[#9fb0bc]/75 hover:text-[#dce6ed]'
                  }`}
                >
                  {opt.label}
                  <span
                    aria-hidden="true"
                    className={`absolute left-3 right-3 bottom-0 h-[2px] rounded-full transition-all duration-300 ${
                      active
                        ? 'bg-gradient-to-r from-[#d6a94f] via-[#fff2cf] to-[#7effb2] opacity-100 scale-x-100'
                        : 'opacity-0 scale-x-50'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <p className={`text-[#b6c7d1]/85 text-center ${compact ? 'mt-1 text-[10px]' : 'mt-2.5 text-base'}`}>
            {activeScareHint}
          </p>
        </div>

        {/* Centered Primary Action Pair: MULAI BERBURU & PILIH LEVEL side-by-side, balanced size, distinct colors */}
        <div
          className={`w-full mx-auto flex flex-col items-center animate-ps5-enter-d3 ${
            compact ? 'max-w-[380px] gap-2' : 'max-w-[680px] gap-4'
          }`}
        >
          <div className={`w-full grid grid-cols-2 ${compact ? 'gap-2.5' : 'gap-5'}`}>
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onStart();
              }}
              className={`ps5-action-tile ps5-btn-ember w-full flex items-center justify-center rounded-xl text-[#fff8f1] font-sans font-bold tracking-[0.14em] uppercase cursor-pointer whitespace-nowrap ${
                compact ? 'gap-1.5 px-3 py-2 text-[11px]' : 'gap-3.5 px-7 py-5 text-lg'
              }`}
            >
              <Play className={compact ? 'w-3.5 h-3.5 fill-current shrink-0' : 'w-5 h-5 fill-current shrink-0'} />
              MULAI BERBURU
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectLevel();
              }}
              className={`ps5-action-tile ps5-btn-jade w-full flex items-center justify-center rounded-xl text-[#f0fff7] font-sans font-bold tracking-[0.14em] uppercase cursor-pointer whitespace-nowrap ${
                compact ? 'gap-1.5 px-3 py-2 text-[11px]' : 'gap-3.5 px-7 py-5 text-lg'
              }`}
            >
              <Map className={compact ? 'w-3.5 h-3.5 shrink-0' : 'w-5 h-5 shrink-0'} />
              PILIH LEVEL
            </button>
          </div>

          {/* Centered Minimalist PS5 Secondary Links (Kitab Hantu, Panduan, Pengaturan) */}
          <div className={`flex flex-wrap items-center justify-center ${compact ? 'gap-2' : 'gap-3.5'}`}>
            <button
              type="button"
              data-testid="btn-kitab-hantu"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenLore();
              }}
              className={`ps5-secondary-btn flex items-center rounded-xl text-[#e2ecf2] font-sans font-medium tracking-[0.08em] uppercase cursor-pointer whitespace-nowrap ${
                compact ? 'gap-1.5 px-2.5 py-1.5 text-[10px]' : 'gap-2.5 px-5 py-3 text-sm'
              }`}
            >
              <Ghost className={compact ? 'w-3 h-3 text-[#7effb2]' : 'w-4 h-4 text-[#7effb2]'} />
              KITAB HANTU
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenGuide();
              }}
              className={`ps5-secondary-btn flex items-center rounded-xl text-[#e2ecf2] font-sans font-medium tracking-[0.08em] uppercase cursor-pointer whitespace-nowrap ${
                compact ? 'gap-1.5 px-2.5 py-1.5 text-[10px]' : 'gap-2.5 px-5 py-3 text-sm'
              }`}
            >
              <BookOpen className={compact ? 'w-3 h-3 text-[#99c8e8]' : 'w-4 h-4 text-[#99c8e8]'} />
              PANDUAN
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenSettings();
              }}
              className={`ps5-secondary-btn flex items-center rounded-xl text-[#e2ecf2] font-sans font-medium tracking-[0.08em] uppercase cursor-pointer whitespace-nowrap ${
                compact ? 'gap-1.5 px-2.5 py-1.5 text-[10px]' : 'gap-2.5 px-5 py-3 text-sm'
              }`}
            >
              <Settings className={compact ? 'w-3 h-3 text-[#d6a94f]' : 'w-4 h-4 text-[#d6a94f]'} />
              PENGATURAN
            </button>
          </div>
        </div>
      </div>

      {/* Quiet Minimalist PS5 Footer */}
      <footer
        className={`flex items-center justify-between text-[#b5c2ca]/78 ${
          compact ? 'text-[10px] gap-3' : 'text-sm gap-6'
        }`}
      >
        <span className="truncate tracking-wide">
          {compact
            ? 'Geser Layar: Lihat 72° · Ketuk: Tembak Laser'
            : 'Geser / Panah: Lihat 72° (±36°) · Klik / Sentuh: Tembak · Enter: Mulai'}
        </span>

        <span className="flex items-center gap-1.5 shrink-0">
          <span>Created by</span>
          <strong className="font-semibold text-[#d6a94f]/90">@adnanjogja</strong>
          <span aria-hidden="true">·</span>
          <a
            href="https://www.threads.com/@adnanjogja"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#cde0eb] hover:text-white transition-colors"
          >
            Threads
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://www.instagram.com/adnanjogja/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#cde0eb] hover:text-white transition-colors"
          >
            Instagram
          </a>
        </span>
      </footer>
    </div>
  );
};
