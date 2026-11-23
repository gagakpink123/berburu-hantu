import React, { useId } from 'react';

interface CrackedStoneTitleProps {
  align?: 'left' | 'center';
  compact?: boolean;
  variant?: 'splash' | 'title';
}

const DEPTH_LAYERS = [
  { dx: 11.5, dy: 14.0, fill: '#030507', stroke: '#020304' },
  { dx: 10.0, dy: 12.2, fill: '#080b0f', stroke: '#05070a' },
  { dx: 8.6, dy: 10.5, fill: '#0f1419', stroke: '#090c10' },
  { dx: 7.2, dy: 8.8, fill: '#161d24', stroke: '#0d1217' },
  { dx: 5.8, dy: 7.1, fill: '#1f2830', stroke: '#13191f' },
  { dx: 4.4, dy: 5.4, fill: '#2a353f', stroke: '#1b2229' },
  { dx: 3.0, dy: 3.7, fill: '#374450', stroke: '#252e37' },
  { dx: 1.6, dy: 2.0, fill: '#4b5966', stroke: '#343f49' },
];

export const CrackedStoneTitle: React.FC<CrackedStoneTitleProps> = ({
  align = 'left',
  compact = false,
  variant = 'title',
}) => {
  const uid = useId().replace(/:/g, '');
  const isCentered = align === 'center';
  const anchorX = isCentered ? 560 : 14;
  const textAnchor = isCentered ? 'middle' : 'start';
  const textXShift = isCentered ? 72 : 14;

  const faceGradId = `stone-face-${uid}`;
  const stoneFilterId = `stone-tex-${uid}`;
  const glyphClipId = `glyph-clip-${uid}`;
  const shadowFilterId = `stone-drop-${uid}`;
  const emberGlowId = `ember-glow-${uid}`;

  const ox = textXShift;

  const primaryCracks = [
    `M ${ox + 32} 26 L ${ox + 54} 54 L ${ox + 42} 78 L ${ox + 68} 106 L ${ox + 60} 124`,
    `M ${ox + 156} 28 L ${ox + 138} 58 L ${ox + 164} 84 L ${ox + 146} 120`,
    `M ${ox + 264} 24 L ${ox + 288} 52 L ${ox + 270} 80 L ${ox + 296} 104 L ${ox + 282} 124`,
    `M ${ox + 394} 28 L ${ox + 372} 62 L ${ox + 398} 90 L ${ox + 380} 122`,
    `M ${ox + 514} 26 L ${ox + 538} 56 L ${ox + 518} 86 L ${ox + 546} 120`,
    `M ${ox + 656} 28 L ${ox + 632} 60 L ${ox + 658} 88 L ${ox + 638} 122`,
    `M ${ox + 770} 26 L ${ox + 794} 58 L ${ox + 774} 88 L ${ox + 798} 120`,
    `M ${ox + 896} 28 L ${ox + 874} 62 L ${ox + 900} 92 L ${ox + 882} 122`,
  ];

  const hairlineCracks = [
    `M ${ox + 54} 54 L ${ox + 84} 63 L ${ox + 100} 55`,
    `M ${ox + 138} 58 L ${ox + 110} 69 L ${ox + 98} 84`,
    `M ${ox + 288} 52 L ${ox + 320} 61 L ${ox + 336} 47`,
    `M ${ox + 372} 62 L ${ox + 344} 75`,
    `M ${ox + 538} 56 L ${ox + 570} 65 L ${ox + 588} 53`,
    `M ${ox + 632} 60 L ${ox + 600} 71`,
    `M ${ox + 794} 58 L ${ox + 826} 67 L ${ox + 844} 80`,
    `M ${ox + 874} 62 L ${ox + 848} 75`,
  ];

  const mysticCracks = [
    `M ${ox + 156} 30 L ${ox + 138} 58 L ${ox + 164} 84`,
    `M ${ox + 514} 28 L ${ox + 538} 56 L ${ox + 518} 86`,
    `M ${ox + 770} 28 L ${ox + 794} 58 L ${ox + 774} 88`,
  ];

  const widthClass =
    variant === 'splash'
      ? compact
        ? 'w-[560px]'
        : 'w-[1160px]'
      : compact
        ? 'w-[490px]'
        : 'w-[1040px]';

  return (
    <h1
      aria-label="BERBURU HANTU"
      className={`relative max-w-full select-none ${widthClass} ${isCentered ? 'mx-auto' : ''}`}
    >
      <svg
        viewBox="0 0 1120 148"
        className="w-full h-auto overflow-visible"
        role="img"
        aria-hidden="true"
      >
        <defs>
          {/* High-contrast carved Indonesian candi/andesite stone gradient */}
          <linearGradient id={faceGradId} x1="0%" y1="0%" x2="8%" y2="100%">
            <stop offset="0%" stopColor="#eff5f8" />
            <stop offset="24%" stopColor="#bcc6cd" />
            <stop offset="62%" stopColor="#727c85" />
            <stop offset="86%" stopColor="#48534d" />
            <stop offset="100%" stopColor="#2e3539" />
          </linearGradient>

          {/* Soft grounded shadow */}
          <filter id={shadowFilterId} x="-10%" y="-20%" width="120%" height="150%">
            <feDropShadow dx="0" dy="16" stdDeviation="12" floodColor="#010204" floodOpacity="0.95" />
          </filter>

          {/* Procedural volcanic stone grain + chiseled lighting texture */}
          <filter id={stoneFilterId} x="-5%" y="-10%" width="110%" height="120%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.08 0.1"
              numOctaves="4"
              seed="17"
              result="grain"
            />
            <feDiffuseLighting
              in="grain"
              surfaceScale="3.8"
              diffuseConstant="1.15"
              lightingColor="#e4eef5"
              result="lit"
            >
              <feDistantLight azimuth="225" elevation="52" />
            </feDiffuseLighting>
            <feBlend in="SourceGraphic" in2="lit" mode="multiply" result="shaded" />
            <feTurbulence
              type="turbulence"
              baseFrequency="0.025 0.04"
              numOctaves="3"
              seed="5"
              result="weather"
            />
            <feColorMatrix
              in="weather"
              type="matrix"
              values="0.34 0 0 0 0.28  0 0.38 0 0 0.30  0 0 0.34 0 0.28  0 0 0 0.36 0"
              result="weatherTint"
            />
            <feBlend in="shaded" in2="weatherTint" mode="overlay" result="textured" />
            <feComposite in="textured" in2="SourceAlpha" operator="in" />
          </filter>

          {/* Subtle mystical fissure luminescence */}
          <filter id={emberGlowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Strict glyph clip path */}
          <clipPath id={glyphClipId}>
            <text
              x={anchorX}
              y="108"
              textAnchor={textAnchor}
              fontFamily="Cinzel, Georgia, serif"
              fontWeight="800"
              fontSize="94"
              letterSpacing="6"
            >
              BERBURU HANTU
            </text>
          </clipPath>
        </defs>

        {/* Grounded ambient shadow */}
        <g filter={`url(#${shadowFilterId})`}>
          <text
            x={anchorX + 12}
            y="122"
            textAnchor={textAnchor}
            fontFamily="Cinzel, Georgia, serif"
            fontWeight="800"
            fontSize="94"
            letterSpacing="6"
            fill="#020305"
          >
            BERBURU HANTU
          </text>
        </g>

        {/* Multi-layer 3D stone depth extrusion */}
        {DEPTH_LAYERS.map((layer, index) => (
          <text
            key={index}
            x={anchorX + layer.dx}
            y={108 + layer.dy}
            textAnchor={textAnchor}
            fontFamily="Cinzel, Georgia, serif"
            fontWeight="800"
            fontSize="94"
            letterSpacing="6"
            fill={layer.fill}
            stroke={layer.stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          >
            BERBURU HANTU
          </text>
        ))}

        {/* Front carved stone face */}
        <g filter={`url(#${stoneFilterId})`}>
          <text
            x={anchorX}
            y="108"
            textAnchor={textAnchor}
            fontFamily="Cinzel, Georgia, serif"
            fontWeight="800"
            fontSize="94"
            letterSpacing="6"
            fill={`url(#${faceGradId})`}
          >
            BERBURU HANTU
          </text>
        </g>

        {/* Chiseled rim & deep tectonic stone cracks clipped cleanly to glyph interiors */}
        <g clipPath={`url(#${glyphClipId})`}>
          <text
            x={anchorX - 1.2}
            y="106.5"
            textAnchor={textAnchor}
            fontFamily="Cinzel, Georgia, serif"
            fontWeight="800"
            fontSize="94"
            letterSpacing="6"
            fill="none"
            stroke="rgba(240, 248, 255, 0.45)"
            strokeWidth="2.0"
          >
            BERBURU HANTU
          </text>

          <rect x="0" y="92" width="1120" height="40" fill="rgba(20, 32, 24, 0.30)" />

          {/* Crisp bright chiseled crack lips */}
          <g transform="translate(1.6, 1.5)" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {primaryCracks.map((d, idx) => (
              <path key={`lip-p-${idx}`} d={d} stroke="rgba(232, 244, 252, 0.54)" strokeWidth="2.8" />
            ))}
            {hairlineCracks.map((d, idx) => (
              <path key={`lip-h-${idx}`} d={d} stroke="rgba(222, 236, 246, 0.38)" strokeWidth="1.5" />
            ))}
          </g>

          {/* Deep dark stone crack crevices */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {primaryCracks.map((d, idx) => (
              <path key={`crack-p-${idx}`} d={d} stroke="#030507" strokeWidth="3.8" />
            ))}
            {hairlineCracks.map((d, idx) => (
              <path key={`crack-h-${idx}`} d={d} stroke="#040609" strokeWidth="2.0" />
            ))}
          </g>

          {/* Subtle mystical Nusantara fissure glow inside select fractures */}
          <g
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${emberGlowId})`}
            style={{ opacity: 'calc(0.32 + var(--storm-flash, 0) * 0.68)' }}
          >
            {mysticCracks.map((d, idx) => (
              <path
                key={`mystic-${idx}`}
                d={d}
                stroke={idx === 1 ? '#e0b356' : '#7effb2'}
                strokeWidth="1.35"
              />
            ))}
          </g>

          {/* Real-time lightning rim catchlight */}
          <text
            x={anchorX}
            y="108"
            textAnchor={textAnchor}
            fontFamily="Cinzel, Georgia, serif"
            fontWeight="800"
            fontSize="94"
            letterSpacing="6"
            fill="rgba(198, 232, 255, 0.38)"
            stroke="rgba(232, 246, 255, 0.78)"
            strokeWidth="1.6"
            style={{ opacity: 'calc(var(--storm-flash, 0) * 0.8)' }}
          >
            BERBURU HANTU
          </text>
        </g>
      </svg>
    </h1>
  );
};
