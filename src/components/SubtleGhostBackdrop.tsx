import React from 'react';
import { GHOST_DEFINITIONS } from '../game/levels';
import type { GhostType } from '../game/types';

interface SubtleGhostBackdropProps {
  compact?: boolean;
}

interface GhostSilhouetteSpec {
  type: GhostType;
  baseOpacity: number;
  flashBoost: number;
  desktopClass: string;
  compactClass: string;
  flipX?: boolean;
  floatDelay: string;
  floatDuration: string;
  brightness: number;
  glowColor: string;
}

const BACKDROP_GHOSTS: GhostSilhouetteSpec[] = [
  {
    type: 'genderuwo',
    baseOpacity: 0.28,
    flashBoost: 0.24,
    desktopClass: 'left-[1%] bottom-[3%] w-[420px] h-[550px]',
    compactClass: 'left-[0%] bottom-[2%] w-[132px] h-[172px]',
    floatDelay: '0s',
    floatDuration: '6.4s',
    brightness: 0.78,
    glowColor: 'rgba(255, 130, 88, 0.20)',
  },
  {
    type: 'pocong',
    baseOpacity: 0.27,
    flashBoost: 0.24,
    desktopClass: 'left-[16%] bottom-[12%] w-[245px] h-[385px]',
    compactClass: 'left-[11%] bottom-[10%] w-[78px] h-[122px]',
    floatDelay: '-1.6s',
    floatDuration: '5.2s',
    brightness: 0.8,
    glowColor: 'rgba(185, 228, 255, 0.24)',
  },
  {
    type: 'kuntilanak',
    baseOpacity: 0.29,
    flashBoost: 0.25,
    desktopClass: 'right-[14%] top-[14%] w-[265px] h-[410px]',
    compactClass: 'right-[11%] top-[12%] w-[84px] h-[128px]',
    flipX: true,
    floatDelay: '-2.3s',
    floatDuration: '4.8s',
    brightness: 0.82,
    glowColor: 'rgba(155, 225, 255, 0.26)',
  },
  {
    type: 'buto_ijo',
    baseOpacity: 0.28,
    flashBoost: 0.24,
    desktopClass: 'right-[0.5%] bottom-[2%] w-[445px] h-[585px]',
    compactClass: 'right-[-1%] bottom-[2%] w-[140px] h-[184px]',
    flipX: true,
    floatDelay: '-0.9s',
    floatDuration: '7.1s',
    brightness: 0.76,
    glowColor: 'rgba(92, 240, 152, 0.22)',
  },
  {
    type: 'tuyul',
    baseOpacity: 0.24,
    flashBoost: 0.22,
    desktopClass: 'right-[20%] bottom-[5%] w-[180px] h-[250px]',
    compactClass: 'right-[15%] bottom-[4%] w-[58px] h-[80px]',
    flipX: true,
    floatDelay: '-3.1s',
    floatDuration: '4.5s',
    brightness: 0.78,
    glowColor: 'rgba(126, 255, 178, 0.22)',
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
              opacity: `calc(${spec.baseOpacity} + var(--storm-flash, 0) * ${spec.flashBoost})`,
              WebkitMaskImage:
                'linear-gradient(to bottom, rgba(0,0,0,0.96) 44%, rgba(0,0,0,0.52) 78%, transparent 98%)',
              maskImage:
                'linear-gradient(to bottom, rgba(0,0,0,0.96) 44%, rgba(0,0,0,0.52) 78%, transparent 98%)',
            }}
          >
            <div
              className="w-full h-full animate-float-slow"
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
                  filter: `brightness(${spec.brightness}) contrast(1.08) saturate(0.52) drop-shadow(0 0 26px ${spec.glowColor})`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
