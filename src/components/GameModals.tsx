import React, { useState } from 'react';
import { ArrowRight, Home, Play, RotateCcw, X } from 'lucide-react';
import { GHOST_DEFINITIONS, LEVEL_CONFIGS } from '../game/levels';
import type { GameSettings, GhostType, HudSnapshot, ScareMode } from '../game/types';

interface ModalShellProps {
  title: string;
  onClose?: () => void;
  maxWidthClass?: string;
  compact?: boolean;
  children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({
  title,
  onClose,
  maxWidthClass = 'max-w-[1160px]',
  compact = false,
  children,
}) => (
  <div className={`pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[#030507]/82 ${compact ? 'p-3' : 'p-10'}`}>
    <div
      className={`horror-frame relative w-full ${maxWidthClass} overflow-y-auto rounded-xl ${
        compact ? 'max-h-[336px] p-3.5' : 'max-h-[950px] p-7'
      }`}
    >
      <div
        className={`flex items-center justify-between gap-4 border-b border-[#d6a94f]/25 ${
          compact ? 'pb-2 mb-2.5' : 'pb-3.5 mb-5'
        }`}
      >
        <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
          <span aria-hidden="true" className={`text-[#d6a94f] ${compact ? 'text-xs' : 'text-base'}`}>◆</span>
          <h2 className={`font-display font-bold tracking-wide text-[#f7f0dc] ${compact ? 'text-base' : 'text-2xl'}`}>
            {title}
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className={`flex items-center justify-center rounded-lg border border-[#d6a94f]/30 bg-[#10181f] hover:border-[#7effb2] text-[#f3efe4] cursor-pointer ${
              compact ? 'w-8 h-8' : 'w-11 h-11'
            }`}
          >
            <X className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
          </button>
        )}
      </div>
      {children}
    </div>
  </div>
);

const LevelPreviewCardImage: React.FC<{ src: string; alt: string; levelId: number; compact?: boolean }> = ({
  src,
  alt,
  levelId,
  compact = false,
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative aspect-video rounded-lg overflow-hidden border border-[#d6a94f]/35 bg-[#091214] shrink-0 ${
        compact ? 'w-28' : 'w-56'
      }`}
    >
      {!failed ? (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-[#12261e] to-[#080d10] font-display text-[#d6a94f] ${
            compact ? 'text-[10px]' : 'text-sm'
          }`}
        >
          ARENA {levelId}
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20"
      />
      <span
        className={`absolute bottom-1 left-1.5 font-mono-num font-bold tracking-wider text-[#f7f0dc] drop-shadow ${
          compact ? 'text-[10px]' : 'text-xs'
        }`}
      >
        LVL {levelId}
      </span>
    </div>
  );
};

export const LevelSelectModal: React.FC<{
  compact?: boolean;
  onSelect: (levelId: number) => void;
  onClose: () => void;
}> = ({ compact = false, onSelect, onClose }) => (
  <ModalShell
    title="Pilih Arena Berburu (Level 1–10)"
    onClose={onClose}
    compact={compact}
    maxWidthClass={compact ? 'max-w-[740px]' : 'max-w-[1460px]'}
  >
    <div className={`grid ${compact ? 'grid-cols-1 gap-2' : 'grid-cols-2 gap-3.5'}`}>
      {LEVEL_CONFIGS.map((lvl) => (
        <div
          key={lvl.id}
          className={`flex items-center justify-between rounded-lg bg-gradient-to-r from-[#0e161b] to-[#0a1014] border border-[#d6a94f]/25 hover:border-[#d6a94f]/55 transition-colors ${
            compact ? 'gap-3 p-2.5' : 'gap-4 p-3.5'
          }`}
        >
          <LevelPreviewCardImage
            src={lvl.previewImage}
            alt={`Preview lingkungan ${lvl.name}`}
            levelId={lvl.id}
            compact={compact}
          />

          <div className="flex-1 min-w-0">
            <div
              className={`flex flex-wrap items-center font-semibold text-[#d6a94f] ${
                compact ? 'gap-1.5 text-[11px]' : 'gap-2 text-xs'
              }`}
            >
              <span className="font-display tracking-wider">LEVEL {lvl.id}</span>
              <span aria-hidden="true" className="text-white/30">·</span>
              <span className="text-[#7effb2]">{lvl.difficultyLabel}</span>
              <span aria-hidden="true" className="text-white/30">·</span>
              <span className="font-mono-num text-[#ffd34e]">
                Target: {lvl.targetKills} Hantu{lvl.targetBossKills > 0 ? ` + ${lvl.targetBossKills}× Buto Ijo` : ''} ({lvl.durationSec}s)
              </span>
            </div>
            <h3 className={`font-display font-bold text-[#f7f2e4] truncate ${compact ? 'text-sm mt-0.5' : 'text-lg mt-0.5'}`}>
              {lvl.name}
            </h3>
            <p className={`text-[#c7d3cc]/85 leading-snug line-clamp-2 ${compact ? 'text-[11px] mt-0.5' : 'text-xs mt-0.5'}`}>
              {lvl.description}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onSelect(lvl.id)}
            aria-label={`Mainkan Level ${lvl.id}: ${lvl.name}`}
            className={`flex items-center justify-center rounded-lg bg-gradient-to-b from-[#ff7d3b] to-[#d94d14] hover:from-[#ff8d52] hover:to-[#e95b1e] border border-[#ffd08a]/50 text-[#090b0d] font-display font-bold cursor-pointer shrink-0 whitespace-nowrap ${
              compact ? 'gap-1.5 px-3.5 py-2 text-xs' : 'gap-1.5 px-4 py-2.5 text-sm'
            }`}
          >
            <Play className={compact ? 'w-3.5 h-3.5 fill-current' : 'w-4 h-4 fill-current'} />
            Mainkan
          </button>
        </div>
      ))}
    </div>
  </ModalShell>
);

export const GuideModal: React.FC<{ compact?: boolean; onClose: () => void }> = ({ compact = false, onClose }) => {
  const ghostList: GhostType[] = ['tuyul', 'pocong', 'kuntilanak', 'genderuwo', 'buto_ijo'];
  return (
    <ModalShell
      title="Panduan Berburu Hantu"
      onClose={onClose}
      compact={compact}
      maxWidthClass={compact ? 'max-w-[740px]' : 'max-w-[1280px]'}
    >
      <div className={compact ? 'space-y-2.5 text-xs text-[#dce4df]' : 'space-y-5 text-base text-[#dce4df]'}>
        <div className={`grid grid-cols-2 ${compact ? 'gap-2.5' : 'gap-5'}`}>
          <div className={`rounded-lg bg-[#0d1419] border border-[#d6a94f]/25 ${compact ? 'p-2.5' : 'p-4'}`}>
            <h3 className={`font-display font-bold text-[#d6a94f] ${compact ? 'text-xs mb-1' : 'text-base mb-2'}`}>
              Kontrol PC / Laptop
            </h3>
            <ul className={`text-[#c7d3cc] ${compact ? 'space-y-1 text-[11px]' : 'space-y-1.5 text-sm'}`}>
              <li>Panah Kiri/Kanan (atau A/D): Putar kamera 72° (±36°)</li>
              <li>Panah Atas/Bawah (atau W/S): Arahkan atas/bawah ±15°</li>
              <li>Gerak Mouse &amp; Klik Kiri (atau Spasi): Bidik &amp; tembak laser</li>
              <li>Tombol R: Isi ulang energi · P / Esc: Jeda</li>
            </ul>
          </div>
          <div className={`rounded-lg bg-[#0d1419] border border-[#7effb2]/25 ${compact ? 'p-2.5' : 'p-4'}`}>
            <h3 className={`font-display font-bold text-[#7effb2] ${compact ? 'text-xs mb-1' : 'text-base mb-2'}`}>
              Kontrol Smartphone &amp; Layar Sentuh
            </h3>
            <ul className={`text-[#c7d3cc] ${compact ? 'space-y-1 text-[11px]' : 'space-y-1.5 text-sm'}`}>
              <li>Menu otomatis 3× lebih besar agar nyaman di layar HP</li>
              <li>Geser layar (drag) ke mana saja untuk memutar kamera 72°</li>
              <li>Ketuk langsung karakter hantu untuk menembak sinar laser</li>
              <li>Tombol Fullscreen pojok kanan atas otomatis mengunci landscape</li>
            </ul>
          </div>
        </div>

        <div>
          <h3 className={`font-display font-bold text-[#f7f2e4] ${compact ? 'text-xs mb-1.5' : 'text-base mb-2.5'}`}>
            Daftar Hantu &amp; Sifat Mistisnya
          </h3>
          <div className={`grid grid-cols-2 ${compact ? 'gap-2' : 'gap-3.5'}`}>
            {ghostList.map((t) => {
              const g = GHOST_DEFINITIONS[t];
              return (
                <div
                  key={t}
                  className={`flex items-center rounded-lg bg-[#0d1419] border border-[#d6a94f]/20 ${
                    compact ? 'gap-2 p-2' : 'gap-3.5 p-3'
                  }`}
                >
                  <img
                    src={g.imageUrl}
                    alt={g.name}
                    className={`object-contain shrink-0 ${compact ? 'w-10 h-11' : 'w-14 h-16'}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-display font-bold text-[#f7f2e4] ${compact ? 'text-xs' : 'text-base'}`}>
                        {g.name}
                      </span>
                      <span className={`font-mono-num font-bold text-[#7effb2] ${compact ? 'text-[11px]' : 'text-sm'}`}>
                        {g.hp} Tembakan
                      </span>
                    </div>
                    <p className={`text-[#c7d3cc]/85 leading-snug ${compact ? 'text-[11px] mt-0.5' : 'text-sm mt-1'}`}>
                      {g.comedyNote}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

export const SettingsModal: React.FC<{
  settings: GameSettings;
  compact?: boolean;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}> = ({ settings, compact = false, onChange, onClose }) => {
  const modes: Array<{ id: ScareMode; label: string }> = [
    { id: 'santai', label: 'Mode Santai (Ramah Anak)' },
    { id: 'petualangan', label: 'Mode Petualangan' },
    { id: 'horor', label: 'Mode Horor' },
  ];
  return (
    <ModalShell
      title="Pengaturan Permainan"
      onClose={onClose}
      compact={compact}
      maxWidthClass={compact ? 'max-w-[660px]' : 'max-w-[920px]'}
    >
      <div className={compact ? 'space-y-2.5 text-xs' : 'space-y-5 text-base'}>
        <div>
          <label className={`block font-display font-semibold text-[#d6a94f] ${compact ? 'text-[11px] mb-1.5' : 'text-sm mb-2'}`}>
            TINGKAT KETAKUTAN
          </label>
          <div className={`grid grid-cols-3 ${compact ? 'gap-2' : 'gap-3'}`}>
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange({ ...settings, scareMode: m.id })}
                className={`rounded-lg border font-semibold cursor-pointer ${
                  compact ? 'px-2.5 py-2 text-[11px]' : 'px-4 py-3 text-sm'
                } ${
                  settings.scareMode === m.id
                    ? 'bg-[#1c352a] border-[#7effb2] text-[#7effb2]'
                    : 'bg-[#0e151a] border-white/10 text-[#d9d2c0]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`grid grid-cols-2 ${compact ? 'gap-3' : 'gap-6'}`}>
          <label className="block">
            <span className={`flex justify-between font-semibold text-[#dce4df] ${compact ? 'text-[11px] mb-1' : 'text-sm mb-2'}`}>
              <span>Volume Musik &amp; Suasana</span>
              <span className="font-mono-num text-[#7effb2]">{Math.round(settings.musicVolume * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              onChange={(e) => onChange({ ...settings, musicVolume: Number(e.target.value) })}
              className="w-full accent-[#7effb2]"
            />
          </label>

          <label className="block">
            <span className={`flex justify-between font-semibold text-[#dce4df] ${compact ? 'text-[11px] mb-1' : 'text-sm mb-2'}`}>
              <span>Volume Efek Suara &amp; Voice</span>
              <span className="font-mono-num text-[#7effb2]">{Math.round(settings.sfxVolume * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              onChange={(e) => onChange({ ...settings, sfxVolume: Number(e.target.value) })}
              className="w-full accent-[#ff6b2b]"
            />
          </label>
        </div>

        <label className="block">
          <span className={`flex justify-between font-semibold text-[#dce4df] ${compact ? 'text-[11px] mb-1' : 'text-sm mb-2'}`}>
            <span>Sensitivitas Kamera</span>
            <span className="font-mono-num text-[#d6a94f]">{settings.cameraSensitivity.toFixed(1)}x</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={settings.cameraSensitivity}
            onChange={(e) => onChange({ ...settings, cameraSensitivity: Number(e.target.value) })}
            className="w-full accent-[#d6a94f]"
          />
        </label>

        <div className={`flex items-center justify-between border-t border-white/10 ${compact ? 'gap-3 pt-2.5' : 'gap-4 pt-3.5'}`}>
          <label className={`flex items-center gap-2 text-[#dce4df] cursor-pointer ${compact ? 'text-[11px]' : 'text-sm gap-3'}`}>
            <input
              type="checkbox"
              checked={settings.pointerAimEnabled}
              onChange={(e) => onChange({ ...settings, pointerAimEnabled: e.target.checked })}
              className={`accent-[#7effb2] ${compact ? 'w-4 h-4' : 'w-5 h-5'}`}
            />
            Aktifkan bidikan &amp; geser tepi layar dengan mouse
          </label>

          <button
            type="button"
            onClick={() => onChange({ ...settings, muted: !settings.muted })}
            className={`rounded-lg bg-[#0e151a] border border-white/15 font-semibold text-[#f3efe4] cursor-pointer shrink-0 ${
              compact ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-sm'
            }`}
          >
            {settings.muted ? 'Audio: Dibisukan' : 'Audio: Aktif'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export const PauseModal: React.FC<{
  levelName: string;
  compact?: boolean;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onTitle: () => void;
}> = ({ levelName, compact = false, onResume, onRestart, onOpenSettings, onTitle }) => (
  <ModalShell
    title="Permainan Dijeda"
    compact={compact}
    maxWidthClass={compact ? 'max-w-[440px]' : 'max-w-[640px]'}
  >
    <p className={`text-[#c7d3cc] ${compact ? 'text-xs mb-2.5' : 'text-base mb-4'}`}>Arena saat ini: {levelName}</p>
    <div className={`grid grid-cols-2 ${compact ? 'gap-2' : 'gap-3.5'}`}>
      <button
        type="button"
        onClick={onResume}
        className={`col-span-2 flex items-center justify-center rounded-lg bg-[#7effb2] hover:bg-[#95ffbf] text-[#09100c] font-display font-bold cursor-pointer ${
          compact ? 'gap-2 px-4 py-2 text-xs' : 'gap-2.5 px-6 py-3.5 text-base'
        }`}
      >
        <Play className={compact ? 'w-4 h-4 fill-current' : 'w-5 h-5 fill-current'} />
        Lanjutkan
      </button>
      <button
        type="button"
        onClick={onRestart}
        className={`flex items-center justify-center gap-2 rounded-lg bg-[#18222a] border border-white/15 hover:border-[#d6a94f]/50 text-[#f3efe4] font-semibold cursor-pointer ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-base'
        }`}
      >
        <RotateCcw className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        Main Lagi
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className={`flex items-center justify-center rounded-lg bg-[#18222a] border border-white/15 hover:border-[#d6a94f]/50 text-[#f3efe4] font-semibold cursor-pointer ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-base'
        }`}
      >
        Pengaturan
      </button>
      <button
        type="button"
        onClick={onTitle}
        className={`col-span-2 flex items-center justify-center gap-2 rounded-lg bg-[#121920] border border-white/15 hover:border-white/30 text-[#f3efe4] font-semibold cursor-pointer ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-base'
        }`}
      >
        <Home className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        Menu Utama
      </button>
    </div>
  </ModalShell>
);

export const GameOverModal: React.FC<{
  hud: HudSnapshot;
  compact?: boolean;
  onRetry: () => void;
  onNextLevel: () => void;
  onTitle: () => void;
}> = ({ hud, compact = false, onRetry, onNextLevel, onTitle }) => {
  const isVictory = hud.outcome === 'victory';
  const hasNext = isVictory && hud.levelId < LEVEL_CONFIGS.length;

  return (
    <ModalShell
      title={isVictory ? 'Level Selesai!' : 'Waktu Habis!'}
      compact={compact}
      maxWidthClass={compact ? 'max-w-[680px]' : 'max-w-[920px]'}
    >
      <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
        <p className={`text-[#c7d3cc] ${compact ? 'text-xs' : 'text-base'}`}>
          {isVictory
            ? hud.targetBossKills > 0
              ? hud.levelId === LEVEL_CONFIGS.length
                ? `Luar biasa! Kamu menamatkan seluruh arena, menaklukkan ${hud.kills} hantu dan mengalahkan Raja Buto Ijo Abadi ${hud.bossKills} kali!`
                : `Selamat! Kamu menaklukkan ${hud.kills} hantu dan mengalahkan Raja Buto Ijo ${hud.bossKills} kali!`
              : `Hebat! Semua hantu di ${hud.levelName} berhasil ditaklukkan.`
            : hud.targetBossKills > 0
              ? `Target Level ${hud.levelId} belum terpenuhi (${hud.kills}/${hud.targetKills} hantu · ${hud.bossKills}/${hud.targetBossKills} Buto Ijo). Ayo coba lagi!`
              : `Para hantu kabur ke dalam kabut di ${hud.levelName}. Ayo coba lagi!`}
        </p>

        <div className={`grid grid-cols-4 ${compact ? 'gap-2' : 'gap-3.5'}`}>
          <div className={`rounded-lg bg-[#0d1419] border border-[#d6a94f]/25 ${compact ? 'p-2.5' : 'p-4'}`}>
            <div className={compact ? 'text-[10px] text-[#9db4aa]' : 'text-xs text-[#9db4aa]'}>TOTAL SKOR</div>
            <div className={`font-mono-num font-bold text-[#ffd34e] mt-0.5 ${compact ? 'text-lg' : 'text-2xl'}`}>
              {hud.score.toLocaleString('id-ID')}
            </div>
          </div>
          <div className={`rounded-lg bg-[#0d1419] border border-[#d6a94f]/25 ${compact ? 'p-2.5' : 'p-4'}`}>
            <div className={compact ? 'text-[10px] text-[#9db4aa]' : 'text-xs text-[#9db4aa]'}>SKOR TERTINGGI</div>
            <div className={`font-mono-num font-bold text-[#7effb2] mt-0.5 ${compact ? 'text-lg' : 'text-2xl'}`}>
              {hud.highScore.toLocaleString('id-ID')}
            </div>
          </div>
          <div className={`rounded-lg bg-[#0d1419] border border-[#d6a94f]/25 ${compact ? 'p-2.5' : 'p-4'}`}>
            <div className={compact ? 'text-[10px] text-[#9db4aa]' : 'text-xs text-[#9db4aa]'}>
              {hud.targetBossKills > 0 ? 'HANTU / BUTO IJO' : 'HANTU KALAH'}
            </div>
            <div className={`font-mono-num font-bold text-[#f7f2e4] mt-0.5 ${compact ? 'text-lg' : 'text-2xl'}`}>
              {hud.targetBossKills > 0
                ? `${hud.kills}/${hud.targetKills} · ${hud.bossKills}/${hud.targetBossKills}`
                : hud.kills}
            </div>
          </div>
          <div className={`rounded-lg bg-[#0d1419] border border-[#d6a94f]/25 ${compact ? 'p-2.5' : 'p-4'}`}>
            <div className={compact ? 'text-[10px] text-[#9db4aa]' : 'text-xs text-[#9db4aa]'}>AKURASI</div>
            <div className={`font-mono-num font-bold text-[#38f8ff] mt-0.5 ${compact ? 'text-lg' : 'text-2xl'}`}>
              {hud.accuracy}%
            </div>
          </div>
        </div>

        {isVictory && (hud.accuracyBonus > 0 || hud.comboBonus > 0) && (
          <div className={compact ? 'text-xs text-[#b9d9c8]' : 'text-sm text-[#b9d9c8]'}>
            Bonus Akurasi: +{hud.accuracyBonus} · Bonus Combo Maks ({hud.maxCombo}x): +{hud.comboBonus}
          </div>
        )}

        <div className={`flex pt-1 ${compact ? 'gap-2' : 'gap-3.5'}`}>
          {hasNext && (
            <button
              type="button"
              data-start="true"
              onClick={onNextLevel}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#7effb2] hover:bg-[#95ffbf] text-[#09100c] font-display font-bold cursor-pointer whitespace-nowrap ${
                compact ? 'px-4 py-2 text-xs' : 'px-6 py-3 text-base'
              }`}
            >
              Lanjut Level {hud.levelId + 1}
              <ArrowRight className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            </button>
          )}
          <button
            type="button"
            data-start={!hasNext ? 'true' : undefined}
            onClick={onRetry}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-[#ff7d3b] to-[#d94d14] hover:from-[#ff8d52] hover:to-[#e95b1e] text-[#0c0e10] font-display font-bold cursor-pointer whitespace-nowrap ${
              compact ? 'px-4 py-2 text-xs' : 'px-6 py-3 text-base'
            }`}
          >
            <RotateCcw className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            Main Lagi
          </button>
          <button
            type="button"
            onClick={onTitle}
            className={`flex items-center justify-center gap-2 rounded-lg bg-[#18222a] border border-white/15 text-[#f3efe4] font-semibold cursor-pointer whitespace-nowrap ${
              compact ? 'px-3.5 py-2 text-xs' : 'px-5 py-3 text-base'
            }`}
          >
            <Home className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            Menu Utama
          </button>
        </div>

        <div
          className={`border-t border-[#d6a94f]/20 text-center text-[#c7d3cc]/80 flex flex-wrap items-center justify-center gap-2 ${
            compact ? 'pt-2 text-[11px]' : 'pt-3.5 text-sm'
          }`}
        >
          <span>Created by</span>
          <strong className="text-[#d6a94f]">@adnanjogja</strong>
          <span aria-hidden="true">·</span>
          <span>Threads:</span>
          <a
            href="https://www.threads.com/@adnanjogja"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#7effb2] hover:text-[#b2ffd1] underline underline-offset-2"
          >
            @adnanjogja
          </a>
          <span aria-hidden="true">·</span>
          <span>Instagram:</span>
          <a
            href="https://www.instagram.com/adnanjogja/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ffb84d] hover:text-[#ffd98e] underline underline-offset-2"
          >
            @adnanjogja
          </a>
        </div>
      </div>
    </ModalShell>
  );
};

const LORE_ORDER: GhostType[] = ['tuyul', 'pocong', 'kuntilanak', 'genderuwo', 'buto_ijo'];

export const GhostLoreModal: React.FC<{
  ghostType: GhostType;
  compact?: boolean;
  onSelectGhost: (ghost: GhostType) => void;
  onClose: () => void;
}> = ({ ghostType, compact = false, onSelectGhost, onClose }) => {
  const ghost = GHOST_DEFINITIONS[ghostType];
  return (
    <ModalShell
      title={`Kitab Mitos Hantu — ${ghost.name}`}
      onClose={onClose}
      compact={compact}
      maxWidthClass={compact ? 'max-w-[740px]' : 'max-w-[1160px]'}
    >
      <div data-testid="ghost-lore-modal" className={compact ? 'space-y-2.5' : 'space-y-5'}>
        <div className={`grid grid-cols-12 items-start ${compact ? 'gap-3' : 'gap-7'}`}>
          {/* Portrait Card */}
          <div
            className={`col-span-4 flex flex-col items-center text-center rounded-xl bg-gradient-to-b from-[#111c22] to-[#080d11] border border-[#d6a94f]/30 ${
              compact ? 'p-2.5' : 'p-5'
            }`}
          >
            <div className={`w-full flex items-center justify-center ${compact ? 'h-24 mb-1.5' : 'h-56 mb-3'}`}>
              <img
                src={ghost.imageUrl}
                alt={ghost.name}
                className="max-h-full max-w-full object-contain drop-shadow-[0_10px_22px_rgba(126,255,178,0.28)]"
              />
            </div>
            <h3 className={`font-display font-extrabold text-[#f7f0dc] ${compact ? 'text-sm' : 'text-2xl'}`}>
              {ghost.name}
            </h3>
            <p className={`text-[#d6a94f] font-semibold ${compact ? 'text-[10px]' : 'text-sm'}`}>
              {ghost.subtitle}
            </p>
            <div className={`flex items-center justify-center gap-2 font-mono-num ${compact ? 'mt-1.5 text-[10px]' : 'mt-3 text-sm'}`}>
              <span className="rounded px-2 py-0.5 bg-[#12271e] border border-[#7effb2]/40 text-[#7effb2]">
                {ghost.hp} HP
              </span>
              <span className="rounded px-2 py-0.5 bg-[#201912] border border-[#ffd34e]/40 text-[#ffd34e]">
                +{ghost.baseScore} Poin
              </span>
            </div>
          </div>

          {/* Indonesian Myth & Origin Explanations */}
          <div className={`col-span-8 ${compact ? 'space-y-2 text-[11px]' : 'space-y-4 text-base'}`}>
            <div className={`rounded-lg bg-[#0d151b] border border-[#d6a94f]/25 ${compact ? 'p-2.5' : 'p-4'}`}>
              <h4 className={`font-display font-bold tracking-wide text-[#7effb2] ${compact ? 'text-[11px] mb-1' : 'text-sm mb-1.5'}`}>
                PENJELASAN MITOS NUSANTARA
              </h4>
              <p className="text-[#e2ebe6] leading-relaxed">{ghost.mythExplanation}</p>
            </div>

            <div className={`rounded-lg bg-[#0d151b] border border-[#d6a94f]/25 ${compact ? 'p-2.5' : 'p-4'}`}>
              <h4 className={`font-display font-bold tracking-wide text-[#ffd34e] ${compact ? 'text-[11px] mb-1' : 'text-sm mb-1.5'}`}>
                ASAL-USUL & AKAR TRADISI
              </h4>
              <p className="text-[#dce6e0] leading-relaxed">{ghost.mythOrigin}</p>
            </div>

            <div className={`rounded-lg bg-[#0a1116] border border-white/10 ${compact ? 'p-2' : 'p-3.5'}`}>
              <p className="text-[#c5d4cc]">
                <strong className="text-[#ff9c5a]">Suara & Tips Berburu:</strong> {ghost.comedyNote} — {ghost.hunterTip}
              </p>
            </div>
          </div>
        </div>

        {/* Switch between all 5 Nusantara Ghosts + Close */}
        <div className={`flex flex-wrap items-center justify-between border-t border-[#d6a94f]/20 ${compact ? 'pt-2 gap-2' : 'pt-4 gap-3'}`}>
          <div className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
            {LORE_ORDER.map((type) => {
              const active = type === ghostType;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelectGhost(type)}
                  className={`rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    compact ? 'px-2.5 py-1 text-[10px]' : 'px-4 py-2 text-sm'
                  } ${
                    active
                      ? 'bg-[#1b3a2c] border border-[#7effb2]/65 text-[#7effb2]'
                      : 'bg-[#10181f] border border-white/15 text-[#d9d2c0] hover:border-[#d6a94f]/60'
                  }`}
                >
                  {GHOST_DEFINITIONS[type].name}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg bg-gradient-to-b from-[#ff7d3b] to-[#d94d14] hover:from-[#ff8d52] hover:to-[#e95b1e] border border-[#ffd08a]/50 text-[#090b0d] font-display font-bold cursor-pointer ${
              compact ? 'px-4 py-1.5 text-xs' : 'px-6 py-2.5 text-base'
            }`}
          >
            Tutup
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

