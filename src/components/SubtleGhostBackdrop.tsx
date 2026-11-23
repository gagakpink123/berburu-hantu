import React from 'react';
import { GHOST_DEFINITIONS } from '../game/levels';
import type { GhostType } from '../game/types';

interface SubtleGhostBackdropProps {
  compact?: boolean;
}

interface GhostSilhouetteSpec {
  type: GhostType;
  desktopClass: string;
  compactClass: string;
  flipX?: boolean;
  floatDelay: string;
  floatDuration: string;
  glowColor: string;
}

const BACKDROP_GHOSTS: GhostSilhouetteSpec[] = [
  {
    type: 'genderuwo',
    desktopClass: 'left-[1%] bottom-[3%] w-[420px] h-[550px]',
    compactClass: 'left-[0%] bottom-[2%] w-[132px] h-[172px]',
    floatDelay: '0s',
    floatDuration: '9.4s',
    glowColor: 'rgba(180, 224, 255, 0.55)',
  },
  {
    type: 'pocong',
    desktopClass: 'left-[16%] bottom-[12%] w-[245px] h-[385px]',
    compactClass: 'left-[11%] bottom-[10%] w-[78px] h-[122px]',
    floatDelay: '-2.1s',
    floatDuration: '7.8s',
    glowColor: 'rgba(205, 236, 255, 0.60)',
  },
  {
    type: 'kuntilanak',
    desktopClass: 'right-[14%] top-[14%] w-[265px] h-[410px]',
    compactClass: 'right-[11%] top-[12%] w-[84px] h-[128px]',
    flipX: true,
    floatDelay: '-3.4s',
    floatDuration: '7.2s',
    glowColor: 'rgba(188, 232, 255, 0.62)',
  },
  {
    type: 'buto_ijo',
    desktopClass: 'right-[0.5%] bottom-[2%] w-[445px] h-[585px]',
    compactClass: 'right-[-1%] bottom-[2%] w-[140px] h-[184px]',
    flipX: true,
    floatDelay: '-1.3s',
    floatDuration: '10.6s',
    glowColor: 'rgba(170, 245, 215, 0.58)',
  },
  {
    type: 'tuyul',
    desktopClass: 'right-[20%] bottom-[5%] w-[180px] h-[250px]',
    compactClass: 'right-[15%] bottom-[4%] w-[58px] h-[80px]',
    flipX: true,
    floatDelay: '-4.2s',
    floatDuration: '6.8s',
    glowColor: 'rgba(185, 240, 228, 0.55)',
  },
];

export const SubtleGhostBackdrop: React.FC<SubtleGhostBackdropProps> = ({ compact = false }) => {
  return (
    <div
      aria-hidden="true"
      data-testid="title-ghost-backdrop"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden select-none"
    >
      {BACKDROP_GHOSTS.map((spec) => {
        const def = GHOST_DEFINITIONS[spec.type];
        const positionClass = compact ? spec.compactClass : spec.desktopClass;

        return (
          <div
            key={spec.type}
            data-ghost-silhouette={spec.type}
            className={`absolute ${positionClass}`}
            style={{
              opacity: 0.94,
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 58%, rgba(0,0,0,0.72) 84%, transparent 100%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,1) 58%, rgba(0,0,0,0.72) 84%, transparent 100%)',
            }}
          >
            <div
              className="w-full h-full animate-ghost-lurk"
              style={{
                animationDelay: spec.floatDelay,
                animationDuration: spec.floatDuration,
              }}
            >
              <img
                src={def.imageUrl}
                alt=""
                draggable={false}
                className="w-full h-full object-contain object-bottom"
                style={{
                  transform: spec.flipX ? 'scaleX(-1)' : undefined,
                  filter: `brightness(calc(0.055 + var(--storm-flash, 0) * 1.12)) contrast(calc(1.18 + var(--storm-flash, 0) * 0.08)) saturate(calc(0.2 + var(--storm-flash, 0) * 0.78))`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
