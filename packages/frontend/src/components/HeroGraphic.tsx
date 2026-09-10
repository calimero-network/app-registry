/**
 * The home hero: the actual journey, in three beats on a loop.
 *
 *   1. Browse   — a marketplace list, cursor lands on a row
 *   2. Install  — a progress bar fills, the row ticks
 *   3. Use      — the app opens: channels on the left, messages arriving
 *                 left and right
 *
 * The first attempt was an abstract node-mesh. It said nothing a visitor
 * could act on. This shows what the product does, which is the only thing a
 * front-page graphic is for.
 *
 * ⚠️ STILL NO JAVASCRIPT. A rAF loop on the busiest page runs forever in
 * every open tab, including backgrounded ones. This is SMIL on an inline SVG:
 * the browser owns the timeline, pauses it when the tab is hidden, and it
 * costs nothing on the main thread. It also inherits `prefers-reduced-motion`
 * from the global reduce block — a JS loop would have bypassed that.
 *
 * The whole loop is 12s, and each scene is shown by animating `opacity` on a
 * group. Only opacity and transform are touched; nothing here triggers
 * layout.
 */

const LOOP = '12s';

/** Shared timing: each scene holds for ~4s, cross-fading at the seams. */
function sceneOpacity(index: number) {
  // 0 → visible 0-4s, 1 → 4-8s, 2 → 8-12s, with a short fade either side.
  const points = [
    ['1;1;0;0;0;0;1', '0;0.30;0.35;0.62;0.67;0.95;1'],
    ['0;0;1;1;0;0;0', '0;0.30;0.35;0.62;0.67;0.95;1'],
    ['0;0;0;0;1;1;0', '0;0.30;0.35;0.62;0.67;0.95;1'],
  ][index];
  return { values: points[0], keyTimes: points[1] };
}

export function HeroGraphic() {
  return (
    <div
      className='pointer-events-none select-none'
      aria-hidden='true'
      data-testid='hero-graphic'
    >
      <svg viewBox='0 0 520 340' className='h-full w-full'>
        <defs>
          <clipPath id='hg-screen'>
            <rect x='40' y='30' width='440' height='268' rx='14' />
          </clipPath>
        </defs>

        {/* Device frame — constant across all three scenes, so the app feels
            like it is running inside one window rather than three pictures. */}
        <rect
          x='40'
          y='30'
          width='440'
          height='268'
          rx='14'
          fill='var(--app-rail)'
          stroke='var(--accent)'
          strokeOpacity='0.25'
        />
        <g opacity='0.5'>
          <circle cx='62' cy='48' r='3.5' fill='var(--accent)' opacity='0.6' />
          <circle cx='76' cy='48' r='3.5' fill='currentColor' opacity='0.25' />
          <circle cx='90' cy='48' r='3.5' fill='currentColor' opacity='0.25' />
        </g>
        <line
          x1='40'
          y1='66'
          x2='480'
          y2='66'
          stroke='var(--accent)'
          strokeOpacity='0.15'
        />

        <g clipPath='url(#hg-screen)'>
          {/* ── 1. Browse ── */}
          <g>
            <animate
              attributeName='opacity'
              dur={LOOP}
              repeatCount='indefinite'
              {...sceneOpacity(0)}
            />
            {[0, 1, 2].map(i => (
              <g key={i} transform={`translate(0 ${i * 62})`}>
                <rect
                  x='64'
                  y='86'
                  width='392'
                  height='50'
                  rx='10'
                  fill='currentColor'
                  opacity={i === 1 ? '0.09' : '0.04'}
                />
                <rect
                  x='78'
                  y='98'
                  width='26'
                  height='26'
                  rx='7'
                  fill='var(--accent)'
                  opacity={i === 1 ? '0.85' : '0.3'}
                />
                <rect
                  x='116'
                  y='101'
                  width={i === 1 ? 96 : 70}
                  height='7'
                  rx='3.5'
                  fill='currentColor'
                  opacity='0.55'
                />
                <rect
                  x='116'
                  y='114'
                  width='150'
                  height='6'
                  rx='3'
                  fill='currentColor'
                  opacity='0.22'
                />
                <rect
                  x='408'
                  y='103'
                  width='34'
                  height='16'
                  rx='8'
                  fill='var(--accent)'
                  opacity={i === 1 ? '0.9' : '0.25'}
                />
              </g>
            ))}
            {/* Cursor drifting onto the middle row, then a click pulse. */}
            <g>
              <animateMotion
                dur={LOOP}
                repeatCount='indefinite'
                path='M470,270 L440,190 L430,172'
                keyPoints='0;0.7;1'
                keyTimes='0;0.22;0.3'
                calcMode='linear'
              />
              <path
                d='M0 0 L0 13 L3.6 9.6 L6 15 L8.4 13.6 L6 8.6 L11 8.4 Z'
                fill='currentColor'
              />
            </g>
          </g>

          {/* ── 2. Install ── */}
          <g>
            <animate
              attributeName='opacity'
              dur={LOOP}
              repeatCount='indefinite'
              {...sceneOpacity(1)}
            />
            <rect
              x='150'
              y='120'
              width='220'
              height='88'
              rx='12'
              fill='currentColor'
              opacity='0.06'
            />
            <rect
              x='170'
              y='140'
              width='36'
              height='36'
              rx='9'
              fill='var(--accent)'
              opacity='0.85'
            />
            <rect
              x='218'
              y='146'
              width='96'
              height='8'
              rx='4'
              fill='currentColor'
              opacity='0.55'
            />
            <rect
              x='218'
              y='160'
              width='60'
              height='6'
              rx='3'
              fill='currentColor'
              opacity='0.25'
            />
            {/* Track + fill */}
            <rect
              x='170'
              y='188'
              width='180'
              height='7'
              rx='3.5'
              fill='currentColor'
              opacity='0.12'
            />
            <rect x='170' y='188' height='7' rx='3.5' fill='var(--accent)'>
              <animate
                attributeName='width'
                dur={LOOP}
                repeatCount='indefinite'
                values='0;0;180;180;180'
                keyTimes='0;0.35;0.58;0.62;1'
              />
            </rect>
            <g opacity='0'>
              <animate
                attributeName='opacity'
                dur={LOOP}
                repeatCount='indefinite'
                values='0;0;1;1;0'
                keyTimes='0;0.57;0.60;0.63;0.66'
              />
              <circle cx='360' cy='191' r='9' fill='var(--accent)' />
              <path
                d='M356 191l3 3 6-6'
                stroke='var(--app-rail)'
                strokeWidth='2'
                fill='none'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </g>
          </g>

          {/* ── 3. Use: a chat with channels and messages ── */}
          <g>
            <animate
              attributeName='opacity'
              dur={LOOP}
              repeatCount='indefinite'
              {...sceneOpacity(2)}
            />
            {/* Channel rail */}
            <rect
              x='40'
              y='66'
              width='104'
              height='232'
              fill='currentColor'
              opacity='0.05'
            />
            {[0, 1, 2, 3].map(i => (
              <g key={i}>
                <rect
                  x='56'
                  y={86 + i * 30}
                  width='72'
                  height='16'
                  rx='8'
                  fill={i === 1 ? 'var(--accent)' : 'currentColor'}
                  opacity={i === 1 ? '0.75' : '0.16'}
                />
              </g>
            ))}
            {/* Messages, alternating sides, arriving one after another */}
            {[
              { x: 164, y: 92, w: 150, mine: false, t: 0.7 },
              { x: 286, y: 128, w: 170, mine: true, t: 0.76 },
              { x: 164, y: 164, w: 120, mine: false, t: 0.82 },
              { x: 252, y: 200, w: 204, mine: true, t: 0.88 },
            ].map((m, i) => (
              <g key={i} opacity='0'>
                <animate
                  attributeName='opacity'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values={`0;0;1;1;0`}
                  keyTimes={`0;${m.t};${m.t + 0.03};0.95;1`}
                />
                <animateTransform
                  attributeName='transform'
                  type='translate'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values={`${m.mine ? 14 : -14},0;${m.mine ? 14 : -14},0;0,0;0,0;0,0`}
                  keyTimes={`0;${m.t};${m.t + 0.03};0.95;1`}
                />
                <rect
                  x={m.x}
                  y={m.y}
                  width={m.w}
                  height='26'
                  rx='9'
                  fill={m.mine ? 'var(--accent)' : 'currentColor'}
                  opacity={m.mine ? '0.8' : '0.1'}
                />
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
