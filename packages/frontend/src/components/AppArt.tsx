/**
 * Hand-drawn miniatures of the apps we build, for the front-page showcase.
 *
 * These are deliberately specific: each one is a scaled-down picture of that
 * app's actual interface, not a logo on a tint. Showing an icon at 64px told
 * a visitor nothing about what the app IS — the point of a showcase tile is
 * that you recognise the product before you read its name.
 *
 * Colours come from each app's own palette, so the miniature reads as that
 * product rather than as registry chrome:
 *   mero-design → #0d99ff selection blue, per-collaborator cursor colours
 *   mero-sign   → #22c55e status green on document paper
 *   mero-chat   → the Calimero accent, on a channel rail
 *
 * Backgrounds are explicit rather than themed. These are screenshots in
 * spirit: an app's canvas is white in the app, so it stays white here in both
 * themes, the same way a real screenshot would.
 */

import type React from 'react';

type ArtProps = { className?: string };

const frame = 'h-full w-full';

/** mero-design — a collaborative design canvas: layers, tools, cursors. */
export function MeroDesignArt({ className }: ArtProps) {
  return (
    <svg
      viewBox='0 0 320 160'
      className={className ?? frame}
      aria-hidden='true'
      preserveAspectRatio='xMidYMid slice'
    >
      <rect width='320' height='160' fill='#f5f5f5' />

      {/* Left: layer list */}
      <rect x='0' y='0' width='62' height='160' fill='#ffffff' />
      <rect
        x='8'
        y='10'
        width='30'
        height='5'
        rx='2.5'
        fill='#111111'
        opacity='0.65'
      />
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <rect
            x='6'
            y={26 + i * 15}
            width='50'
            height='11'
            rx='3'
            fill={i === 1 ? '#0d99ff' : '#000000'}
            opacity={i === 1 ? '0.12' : '0.04'}
          />
          <rect
            x='10'
            y={29.5 + i * 15}
            width='4'
            height='4'
            rx='1'
            fill={i === 1 ? '#0d99ff' : '#666666'}
          />
          <rect
            x='18'
            y={30 + i * 15}
            width={[26, 30, 20, 28, 22][i]}
            height='3.5'
            rx='1.75'
            fill='#666666'
            opacity={i === 1 ? '0.9' : '0.5'}
          />
        </g>
      ))}

      {/* Toolbar */}
      <rect x='70' y='8' width='108' height='18' rx='9' fill='#ffffff' />
      {[0, 1, 2, 3, 4].map(i => (
        <rect
          key={`t${i}`}
          x={78 + i * 19}
          y={13}
          width='9'
          height='8'
          rx='2'
          fill={i === 0 ? '#0d99ff' : '#111111'}
          opacity={i === 0 ? '1' : '0.35'}
        />
      ))}

      {/* Canvas artwork */}
      <rect
        x='84'
        y='40'
        width='74'
        height='52'
        rx='6'
        fill='#e03e3e'
        opacity='0.9'
      />
      <circle cx='196' cy='62' r='22' fill='#0d99ff' opacity='0.85' />
      <rect
        x='96'
        y='104'
        width='108'
        height='9'
        rx='4.5'
        fill='#111111'
        opacity='0.75'
      />
      <rect
        x='96'
        y='120'
        width='74'
        height='7'
        rx='3.5'
        fill='#111111'
        opacity='0.3'
      />

      {/* Selection box with handles — the thing that says "design tool" */}
      <rect
        x='80'
        y='36'
        width='82'
        height='60'
        fill='none'
        stroke='#0d99ff'
        strokeWidth='1.5'
      />
      {[
        [80, 36],
        [162, 36],
        [80, 96],
        [162, 96],
      ].map(([cx, cy], i) => (
        <rect
          key={`h${i}`}
          x={cx - 3}
          y={cy - 3}
          width='6'
          height='6'
          fill='#ffffff'
          stroke='#0d99ff'
          strokeWidth='1.5'
        />
      ))}

      {/* Multiplayer cursors */}
      <Cursor x={206} y={96} colour='#8b5cf6' label='24' />
      <Cursor x={132} y={128} colour='#f59e0b' label='18' />

      {/* Right: properties panel */}
      <rect x='250' y='0' width='70' height='160' fill='#ffffff' />
      <rect
        x='258'
        y='10'
        width='34'
        height='5'
        rx='2.5'
        fill='#111111'
        opacity='0.65'
      />
      {[0, 1, 2].map(i => (
        <g key={`p${i}`}>
          <rect
            x='258'
            y={26 + i * 22}
            width='24'
            height='4'
            rx='2'
            fill='#666666'
            opacity='0.45'
          />
          <rect
            x='258'
            y={34 + i * 22}
            width='54'
            height='11'
            rx='3'
            fill='#000000'
            opacity='0.05'
          />
          <rect
            x='262'
            y={37.5 + i * 22}
            width='18'
            height='4'
            rx='2'
            fill='#111111'
            opacity='0.5'
          />
        </g>
      ))}
      <rect x='258' y='96' width='54' height='18' rx='4' fill='#0d99ff' />
      <rect
        x='272'
        y='103'
        width='26'
        height='4'
        rx='2'
        fill='#ffffff'
        opacity='0.9'
      />
    </svg>
  );
}

/** mero-sign — a document, a signature, an audit trail. */
export function MeroSignArt({ className }: ArtProps) {
  return (
    <svg
      viewBox='0 0 320 160'
      className={className ?? frame}
      aria-hidden='true'
      preserveAspectRatio='xMidYMid slice'
    >
      <rect width='320' height='160' fill='#0e1011' />

      {/* The document */}
      <rect x='24' y='14' width='150' height='132' rx='4' fill='#ffffff' />
      <rect
        x='38'
        y='28'
        width='64'
        height='7'
        rx='3.5'
        fill='#1a1d1f'
        opacity='0.85'
      />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <rect
          key={i}
          x='38'
          y={46 + i * 10}
          width={[122, 110, 118, 96, 114, 72][i]}
          height='4'
          rx='2'
          fill='#1a1d1f'
          opacity='0.16'
        />
      ))}

      {/* Signature line, signed */}
      <line
        x1='38'
        y1='124'
        x2='118'
        y2='124'
        stroke='#c5c0b9'
        strokeWidth='1'
      />
      <path
        d='M42 121c6-9 10 5 15-4s9 6 14-3 9 5 14-2 8 3 12-1'
        fill='none'
        stroke='#1a1d1f'
        strokeWidth='1.8'
        strokeLinecap='round'
      />
      <rect
        x='128'
        y='116'
        width='34'
        height='14'
        rx='7'
        fill='#22c55e'
        opacity='0.18'
      />
      <path
        d='M134 123l3 3 6-7'
        fill='none'
        stroke='#22c55e'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <rect
        x='147'
        y='121'
        width='9'
        height='4'
        rx='2'
        fill='#22c55e'
        opacity='0.8'
      />

      {/* Audit trail */}
      <rect x='188' y='14' width='108' height='132' rx='6' fill='#1a1d1f' />
      <rect
        x='200'
        y='28'
        width='44'
        height='5'
        rx='2.5'
        fill='#ffffff'
        opacity='0.7'
      />
      {[0, 1, 2, 3].map(i => (
        <g key={`a${i}`}>
          <circle
            cx='204'
            cy={50 + i * 24}
            r='4'
            fill={i < 3 ? '#22c55e' : '#c5c0b9'}
            opacity={i < 3 ? '1' : '0.35'}
          />
          {i < 3 && (
            <line
              x1='204'
              y1={54 + i * 24}
              x2='204'
              y2={70 + i * 24}
              stroke='#22c55e'
              strokeOpacity='0.4'
            />
          )}
          <rect
            x='216'
            y={46 + i * 24}
            width={[52, 44, 58, 40][i]}
            height='4'
            rx='2'
            fill='#ffffff'
            opacity='0.55'
          />
          <rect
            x='216'
            y={54 + i * 24}
            width='30'
            height='3.5'
            rx='1.75'
            fill='#ffffff'
            opacity='0.2'
          />
        </g>
      ))}
    </svg>
  );
}

/** mero-chat — channels, messages, presence. */
export function MeroChatArt({ className }: ArtProps) {
  return (
    <svg
      viewBox='0 0 320 160'
      className={className ?? frame}
      aria-hidden='true'
      preserveAspectRatio='xMidYMid slice'
    >
      <rect width='320' height='160' fill='#0f1511' />

      {/* Channel rail */}
      <rect x='0' y='0' width='84' height='160' fill='#0b0f0c' />
      <rect
        x='12'
        y='14'
        width='42'
        height='6'
        rx='3'
        fill='#ffffff'
        opacity='0.6'
      />
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <rect
            x='8'
            y={32 + i * 20}
            width='68'
            height='14'
            rx='4'
            fill={i === 1 ? '#a4ff11' : '#ffffff'}
            opacity={i === 1 ? '0.16' : '0.03'}
          />
          <text
            x='14'
            y={42 + i * 20}
            fontSize='8'
            fill={i === 1 ? '#a4ff11' : '#ffffff'}
            fillOpacity={i === 1 ? '0.9' : '0.3'}
            fontFamily='monospace'
          >
            #
          </text>
          <rect
            x='23'
            y={36 + i * 20}
            width={[34, 28, 40, 24, 32][i]}
            height='4'
            rx='2'
            fill='#ffffff'
            opacity={i === 1 ? '0.75' : '0.22'}
          />
        </g>
      ))}
      {/* Presence dots */}
      {[0, 1, 2].map(i => (
        <circle
          key={`u${i}`}
          cx={16 + i * 12}
          cy='146'
          r='4.5'
          fill='#a4ff11'
          opacity={0.8 - i * 0.22}
        />
      ))}

      {/* Messages, alternating sides */}
      <rect
        x='96'
        y='16'
        width='60'
        height='5'
        rx='2.5'
        fill='#ffffff'
        opacity='0.35'
      />
      {[
        { x: 96, w: 118, mine: false, lines: [86, 62] },
        { x: 176, w: 128, mine: true, lines: [96, 70] },
        { x: 96, w: 96, mine: false, lines: [70] },
      ].map((m, i) => (
        <g key={`m${i}`}>
          <rect
            x={m.x}
            y={32 + i * 38}
            width={m.w}
            height={m.lines.length > 1 ? 32 : 22}
            rx='9'
            fill={m.mine ? '#a4ff11' : '#ffffff'}
            opacity={m.mine ? '0.85' : '0.07'}
          />
          {m.lines.map((w, j) => (
            <rect
              key={j}
              x={m.x + 10}
              y={42 + i * 38 + j * 10}
              width={w}
              height='4'
              rx='2'
              fill={m.mine ? '#0f1511' : '#ffffff'}
              opacity={m.mine ? '0.55' : '0.3'}
            />
          ))}
        </g>
      ))}

      {/* Composer */}
      <rect
        x='96'
        y='134'
        width='208'
        height='16'
        rx='8'
        fill='#ffffff'
        opacity='0.06'
      />
      <rect
        x='106'
        y='140'
        width='54'
        height='4'
        rx='2'
        fill='#ffffff'
        opacity='0.22'
      />
      <circle cx='294' cy='142' r='6' fill='#a4ff11' />
    </svg>
  );
}

function Cursor({
  x,
  y,
  colour,
  label,
}: {
  x: number;
  y: number;
  colour: string;
  label: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d='M0 0 L0 12 L3.3 8.8 L5.6 13.8 L7.8 12.6 L5.6 7.9 L10.2 7.7 Z'
        fill={colour}
      />
      <rect x='9' y='9' width='15' height='9' rx='4.5' fill={colour} />
      <text
        x='16.5'
        y='15.8'
        fontSize='6'
        fill='#ffffff'
        textAnchor='middle'
        fontFamily='sans-serif'
      >
        {label}
      </text>
    </g>
  );
}

/** package id -> miniature. Anything not listed falls back to its icon. */
export const APP_ART: Record<string, React.FC<ArtProps>> = {
  'com.calimero.mero-design': MeroDesignArt,
  'com.calimero.mero-sign': MeroSignArt,
  'com.calimero.mero-chat': MeroChatArt,
};
