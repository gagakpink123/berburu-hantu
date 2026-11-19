import React from 'react';
import { BookOpen, Map, Maximize2, Minimize2, Play, Settings, Volume2, VolumeX } from 'lucide-react';
import { GHOST_DEFINITIONS } from '../game/levels';
import type { GhostType, ScareMode } from '../game/types';

interface TitleScreenProps {
  highScore: number;
  scareMode: ScareMode;
  muted: boolean;
  isFullscreen: boolean;
  compact?: boolean;
  onStart: () => void;
  onSelectLevel: () => void;
  onOpenGuide: () => void;
  onOpenSettings: () => void;
  onSelectGhostLore: (ghost: GhostType) => void;
  onChangeScareMode: (mode: ScareMode) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
}

const GHOST_ORDER: GhostType[] = ['tuyul', 'pocong', 'kuntilanak', 'genderuwo', 'buto_ijo'];

const SCARE_OPTIONS: Array<{ id: ScareMode; label: string; hint: string }> = [
  { id: 'santai', label: 'Mode Santai', hint: 'Cerah & lucu untuk anak' },
  { id: 'petualangan', label: 'Mode Petualangan', hint: 'Horor komedi seimbang' },
  { id: 'horor', label: 'Mode Horor', hint: 'Lebih gelap & menegangkan' },
];

export const TitleScreen: React.FC<TitleScreenProps> = ({
  highScore,
  scareMode,
  muted,
  isFullscreen,
  compact = false,
  onStart,
  onSelectLevel,
  onOpenGuide,
  onOpenSettings,
  onSelectGhostLore,
  onChangeScareMode,
  onToggleMute,
  onToggleFullscreen,
}) => {
  return (
    <div
      data-testid="title-screen"
      className={`pointer-events-auto absolute inset-0 z-20 flex flex-col justify-between horror-vignette overflow-hidden ${
        compact ? 'px-5 py-3' : 'px-12 py-8'
      }`}
    >
      {/* Subtle atmospheric left scrim so 3D moonlit arena remains visible on the right */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#05080b]/92 via-[#070d12]/70 to-[#06090c]/40"
      />

      {/* Top utility row */}
      <div className="flex items-center justify-between gap-4">
        <div
          className={`horror-frame rounded-lg flex items-center text-[#e6dcc6]/90 ${
            compact ? 'px-3 py-1 gap-2 text-[11px]' : 'px-6 py-2.5 gap-4 text-base'
          }`}
        >
          <span className="font-display font-semibold tracking-widest text-[#d6a94f]">SKOR TERTINGGI</span>
          <span aria-hidden="true" className="text-[#d6a94f]/40">◆</span>
          <span
            className={`font-mono-num font-bold text-[#7effb2] ${compact ? 'text-base' : 'text-2xl'}`}
            data-testid="title-highscore"
          >
            {highScore.toLocaleString('id-ID')}
          </span>
        </div>

        <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            className={`horror-frame flex items-center justify-center rounded-lg text-[#f3efe4] hover:border-[#7effb2] transition-colors cursor-pointer ${
              compact ? 'w-9 h-9' : 'w-14 h-14'
            }`}
          >
            {muted ? (
              <VolumeX className={compact ? 'w-4 h-4 text-[#ff7b7b]' : 'w-6 h-6 text-[#ff7b7b]'} />
            ) : (
              <Volume2 className={compact ? 'w-4 h-4 text-[#7effb2]' : 'w-6 h-6 text-[#7effb2]'} />
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
            className={`horror-frame flex items-center justify-center rounded-lg text-[#f3efe4] hover:border-[#ffd34e] transition-colors cursor-pointer ${
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
      </div>

      {/* Main focal hero + Nusantara Ghost Showcase */}
      <div
        className={`my-auto grid grid-cols-12 items-center w-full mx-auto ${
          compact ? 'gap-4' : 'gap-14 max-w-[2020px]'
        }`}
      >
        <div className={`col-span-6 flex flex-col items-start ${compact ? 'gap-2.5' : 'gap-6'}`}>
          {/* Bespoke Javanese Gunungan Crest & Title Lockup */}
          <div className="flex flex-col gap-1">
            <svg
              viewBox="0 0 220 38"
              className={compact ? 'w-28 h-5 text-[#d6a94f]' : 'w-56 h-9 text-[#d6a94f]'}
              aria-hidden="true"
            >
              <path d="M2 19 H68 M152 19 H218" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.6" />
              <path d="M110 2 L126 19 L110 36 L94 19 Z" fill="rgba(18,32,26,0.9)" stroke="currentColor" strokeWidth="1.8" />
              <path d="M110 8 L119 19 L110 30 L101 19 Z" fill="none" stroke="#7effb2" strokeWidth="1.2" />
              <circle cx="110" cy="19" r="3.5" fill="#ff6b2b" />
            </svg>
            <h1
              className={`font-display font-extrabold tracking-wide text-[#f7f0dc] leading-none drop-shadow-[0_8px_28px_rgba(0,0,0,0.95)] ${
                compact ? 'text-[31px]' : 'text-[68px]'
              }`}
            >
              BERBURU HANTU
            </h1>
            <p
              className={`text-[#8ff5bd] tracking-wide font-medium drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] ${
                compact ? 'text-xs' : 'text-2xl'
              }`}
            >
              Petualangan Berburu Hantu Nusantara
            </p>
          </div>

          {/* Scare Mode Selector */}
          <div
            className={`w-full horror-frame ${
              compact ? 'rounded-lg p-2.5' : 'max-w-[640px] rounded-xl p-5'
            }`}
          >
            <div
              className={`font-display font-bold tracking-widest text-[#d6a94f] ${
                compact ? 'text-[10px] mb-1.5' : 'text-sm mb-3'
              }`}
            >
              TINGKAT KETAKUTAN
            </div>
            <div
              className={`grid grid-cols-3 rounded-lg bg-[#05080b]/90 border border-[#d6a94f]/25 ${
                compact ? 'gap-1.5 p-1' : 'gap-2.5 p-1.5'
              }`}
            >
              {SCARE_OPTIONS.map((opt) => {
                const active = scareMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeScareMode(opt.id)}
                    className={`rounded-md font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap truncate ${
                      compact ? 'px-2 py-1.5 text-[11px]' : 'px-4 py-2.5 text-base'
                    } ${
                      active
                        ? 'bg-gradient-to-b from-[#1f4232] to-[#12261d] text-[#7effb2] border border-[#7effb2]/55 shadow-[0_0_14px_rgba(62,255,150,0.22)]'
                        : 'text-[#d9d2c0]/75 hover:text-[#f7f2e4]'
                    }`}
                  >
                    {opt.label.replace('Mode ', '')}
                  </button>
                );
              })}
            </div>
            <p className={`text-[#c7d3cc]/85 ${compact ? 'mt-1.5 text-[11px]' : 'mt-3 text-base'}`}>
              {SCARE_OPTIONS.find((o) => o.id === scareMode)?.hint}
            </p>
          </div>

          {/* Primary & Secondary Game Menu Actions */}
          <div className={`w-full flex flex-col items-start ${compact ? 'gap-2 pt-0.5' : 'max-w-[640px] gap-4 pt-1'}`}>
            <div className={`w-full grid grid-cols-2 ${compact ? 'gap-2' : 'gap-4'}`}>
              <button
                type="button"
                data-start="true"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onStart();
                }}
                className={`w-full flex items-center justify-center rounded-lg bg-gradient-to-b from-[#ff7d3b] to-[#d94d14] hover:from-[#ff8d52] hover:to-[#e95b1e] border border-[#ffd08a]/55 text-[#090b0d] font-display font-extrabold tracking-wider shadow-[0_8px_28px_rgba(255,107,43,0.48)] transition-transform active:scale-95 cursor-pointer whitespace-nowrap ${
                  compact ? 'gap-1.5 px-3 py-2 text-xs' : 'gap-3 px-6 py-4 text-xl'
                }`}
              >
                <Play className={compact ? 'w-3.5 h-3.5 fill-current shrink-0' : 'w-6 h-6 fill-current shrink-0'} />
                MULAI BERBURU
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectLevel();
                }}
                className={`w-full flex items-center justify-center rounded-lg bg-gradient-to-b from-[#2be092] to-[#118a5c] hover:from-[#43ee9f] hover:to-[#18a46f] border border-[#9effcf]/55 text-[#06140e] font-display font-extrabold tracking-wider shadow-[0_8px_28px_rgba(43,224,146,0.34)] transition-transform active:scale-95 cursor-pointer whitespace-nowrap ${
                  compact ? 'gap-1.5 px-3 py-2 text-xs' : 'gap-3 px-6 py-4 text-xl'
                }`}
              >
                <Map className={compact ? 'w-3.5 h-3.5 shrink-0' : 'w-6 h-6 shrink-0'} />
                PILIH LEVEL
              </button>
            </div>

            <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
              <button
                type="button"
                onClick={onOpenGuide}
                className={`horror-frame flex items-center rounded-lg hover:border-[#7effb2] text-[#f3efe4] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  compact ? 'gap-1 px-2.5 py-1.5 text-[11px]' : 'gap-2 px-5 py-3 text-base'
                }`}
              >
                <BookOpen className={compact ? 'w-3.5 h-3.5 text-[#7effb2]' : 'w-5 h-5 text-[#7effb2]'} />
                PANDUAN
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className={`horror-frame flex items-center rounded-lg hover:border-[#d6a94f] text-[#f3efe4] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  compact ? 'gap-1 px-2.5 py-1.5 text-[11px]' : 'gap-2 px-5 py-3 text-base'
                }`}
              >
                <Settings className={compact ? 'w-3.5 h-3.5 text-[#d6a94f]' : 'w-5 h-5 text-[#d6a94f]'} />
                PENGATURAN
              </button>
            </div>
          </div>
        </div>

        {/* Right Showcase: Carved Interactive Compendium of 5 Nusantara Ghosts */}
        <div className="col-span-6">
          <div className={`horror-frame relative ${compact ? 'rounded-lg p-3' : 'rounded-xl p-6'}`}>
            <div
              className={`flex items-center justify-between border-b border-[#d6a94f]/25 font-display font-bold tracking-widest text-[#d6a94f] ${
                compact ? 'mb-2 pb-1.5 text-[11px]' : 'mb-4 pb-3 text-base'
              }`}
            >
              <span>KITAB TARGET HANTU</span>
              <span className="text-[#7effb2] font-sans font-semibold">
                {compact ? 'Ketuk: Mitos & Asal-Usul' : 'Klik Hantu: Mitos & Asal-Usul'}
              </span>
            </div>
            <div className={`grid grid-cols-5 ${compact ? 'gap-1.5' : 'gap-3.5'}`}>
              {GHOST_ORDER.map((type) => {
                const g = GHOST_DEFINITIONS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    data-testid={`ghost-lore-${type}`}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onSelectGhostLore(type);
                    }}
                    className={`group flex flex-col items-center text-center bg-gradient-to-b from-[#121c22] to-[#080d11] border border-[#d6a94f]/25 hover:border-[#7effb2] hover:from-[#17282b] hover:shadow-[0_0_18px_rgba(126,255,178,0.22)] transition-all cursor-pointer active:scale-95 ${
                      compact ? 'p-1.5 rounded-md' : 'p-3.5 rounded-lg'
                    }`}
                  >
                    <div className={`w-full flex items-end justify-center ${compact ? 'h-16 mb-1' : 'h-36 mb-2.5'}`}>
                      <img
                        src={g.imageUrl}
                        alt={g.name}
                        className="max-h-full max-w-full object-contain animate-float-slow drop-shadow-[0_6px_16px_rgba(126,255,178,0.28)] group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <span className={`font-bold text-[#f3efe4] group-hover:text-[#7effb2] whitespace-nowrap ${compact ? 'text-[10px]' : 'text-base'}`}>
                      {g.name}
                    </span>
                    <span className={`font-mono-num text-[#7effb2] mt-0.5 ${compact ? 'text-[10px]' : 'text-sm'}`}>
                      {g.hp} HP
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom safe footer: 72° control hint (no joystick) + clickable creator copyright links */}
      <div
        className={`flex items-center justify-between border-t border-[#d6a94f]/20 text-[#c8d0ca]/85 ${
          compact ? 'pt-1.5 text-[10px] gap-3' : 'pt-3.5 text-base gap-6'
        }`}
      >
        <span className="truncate">
          {compact
            ? 'Geser Layar: Lihat 72° · Ketuk: Tembak · Fullscreen: Kanan Atas'
            : 'Geser Layar / Panah: Lihat 72° (±36°) · Sentuh / Klik: Tembak Laser · R: Isi Ulang · P: Jeda'}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span>Created by</span>
          <strong className="text-[#d6a94f]">@adnanjogja</strong>
          <span aria-hidden="true">·</span>
          <a
            href="https://www.threads.com/@adnanjogja"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#7effb2] hover:text-[#b2ffd1] underline underline-offset-2"
          >
            Threads
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://www.instagram.com/adnanjogja/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ffb84d] hover:text-[#ffd98e] underline underline-offset-2"
          >
            Instagram
          </a>
        </span>
      </div>
    </div>
  );
};
