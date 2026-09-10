/**
 * The home hero: browse → install → use, on a loop, full width.
 *
 *   1. Browse   — the registry: real-looking app rows with icons, categories,
 *                 sizes and download counts; a cursor picks one
 *   2. Install  — Calimero Desktop: the app card, a progress bar, a tick,
 *                 then it appears in the launcher dock
 *   3. Use      — the app opens: channel rail, message thread filling in from
 *                 both sides, presence dots, a composer
 *
 * ⚠️ NO JAVASCRIPT. A rAF loop on the front page runs forever in every open
 * tab, backgrounded ones included. This is SMIL on inline SVG: the browser
 * owns the timeline, pauses it when the tab is hidden, and it costs nothing
 * on the main thread. It also inherits `prefers-reduced-motion` from the
 * global reduce block — a JS loop would have bypassed that.
 *
 * Colour is deliberate rather than decorative: the accent marks what is
 * happening now (the selected row, the progress fill, your own messages),
 * and everything else is low-opacity neutral, so the eye follows the action
 * through the three scenes.
 */

const LOOP = '15s';

/** Scene visibility. Three beats of ~5s with a short cross-fade at each seam. */
function scene(i: number) {
  const v = ['1;1;0;0;0;0;1', '0;0;1;1;0;0;0', '0;0;0;0;1;1;0'][i];
  return {
    values: v,
    keyTimes: '0;0.30;0.34;0.63;0.67;0.96;1',
    dur: LOOP,
    repeatCount: 'indefinite' as const,
    attributeName: 'opacity',
  };
}

const ROWS = [
  { name: 68, meta: 120, cat: 'games', size: 30 },
  { name: 92, meta: 150, cat: 'social', size: 34 },
  { name: 58, meta: 104, cat: 'tools', size: 28 },
];

export function HeroGraphic() {
  return (
    <div
      className='pointer-events-none select-none'
      aria-hidden='true'
      data-testid='hero-graphic'
    >
      <svg viewBox='0 0 900 420' className='h-full w-full'>
        <defs>
          <clipPath id='hero-clip'>
            <rect x='16' y='16' width='868' height='388' rx='16' />
          </clipPath>
          <linearGradient id='hero-glow' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor='var(--accent)' stopOpacity='0.10' />
            <stop offset='100%' stopColor='var(--accent)' stopOpacity='0' />
          </linearGradient>
        </defs>

        {/* Window chrome, shared by all three scenes */}
        <rect
          x='16'
          y='16'
          width='868'
          height='388'
          rx='16'
          fill='var(--app-rail)'
          stroke='var(--accent)'
          strokeOpacity='0.22'
        />
        <rect x='16' y='16' width='868' height='120' fill='url(#hero-glow)' />
        <circle cx='44' cy='42' r='5' fill='var(--accent)' opacity='0.7' />
        <circle cx='62' cy='42' r='5' fill='currentColor' opacity='0.22' />
        <circle cx='80' cy='42' r='5' fill='currentColor' opacity='0.22' />
        <rect
          x='110'
          y='34'
          width='300'
          height='16'
          rx='8'
          fill='currentColor'
          opacity='0.06'
        />
        <line
          x1='16'
          y1='68'
          x2='884'
          y2='68'
          stroke='var(--accent)'
          strokeOpacity='0.14'
        />

        <g clipPath='url(#hero-clip)'>
          {/* ─────────── 1. Browse the registry ─────────── */}
          <g>
            <animate {...scene(0)} />
            <text
              x='48'
              y='104'
              fontSize='15'
              fill='currentColor'
              fillOpacity='0.75'
              fontFamily='sans-serif'
              fontWeight='600'
            >
              Explore
            </text>
            {[0, 1, 2].map(i => {
              const r = ROWS[i];
              const on = i === 1;
              const y = 126 + i * 86;
              return (
                <g key={i}>
                  <rect
                    x='48'
                    y={y}
                    width='804'
                    height='72'
                    rx='12'
                    fill={on ? 'var(--accent)' : 'currentColor'}
                    opacity={on ? '0.10' : '0.035'}
                  />
                  {on && (
                    <rect
                      x='48'
                      y={y}
                      width='804'
                      height='72'
                      rx='12'
                      fill='none'
                      stroke='var(--accent)'
                      strokeOpacity='0.45'
                    />
                  )}
                  <rect
                    x='68'
                    y={y + 14}
                    width='44'
                    height='44'
                    rx='12'
                    fill='var(--accent)'
                    opacity={on ? '0.9' : '0.28'}
                  />
                  <rect
                    x='128'
                    y={y + 18}
                    width={r.name}
                    height='9'
                    rx='4.5'
                    fill='currentColor'
                    opacity={on ? '0.8' : '0.5'}
                  />
                  <rect
                    x='128'
                    y={y + 34}
                    width={r.meta}
                    height='7'
                    rx='3.5'
                    fill='currentColor'
                    opacity='0.24'
                  />
                  {/* category chip */}
                  <rect
                    x='128'
                    y={y + 48}
                    width='58'
                    height='13'
                    rx='6.5'
                    fill='currentColor'
                    opacity='0.09'
                  />
                  <rect
                    x='136'
                    y={y + 52}
                    width='42'
                    height='5'
                    rx='2.5'
                    fill='currentColor'
                    opacity='0.35'
                  />
                  {/* size + downloads */}
                  <rect
                    x='640'
                    y={y + 32}
                    width={r.size}
                    height='7'
                    rx='3.5'
                    fill='currentColor'
                    opacity='0.28'
                  />
                  <rect
                    x='690'
                    y={y + 32}
                    width='26'
                    height='7'
                    rx='3.5'
                    fill='currentColor'
                    opacity='0.28'
                  />
                  {/* install button */}
                  <rect
                    x='752'
                    y={y + 22}
                    width='80'
                    height='28'
                    rx='14'
                    fill='var(--accent)'
                    opacity={on ? '1' : '0.22'}
                  />
                </g>
              );
            })}
            {/* Cursor arrives on the middle row and clicks */}
            <g>
              <animateMotion
                dur={LOOP}
                repeatCount='indefinite'
                path='M860,380 L820,300 L800,244'
                keyPoints='0;0.6;1'
                keyTimes='0;0.18;0.27'
                calcMode='linear'
              />
              <circle r='0' fill='var(--accent)' opacity='0.5'>
                <animate
                  attributeName='r'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values='0;0;22;0'
                  keyTimes='0;0.27;0.30;0.31'
                />
                <animate
                  attributeName='opacity'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values='0;0;0.45;0'
                  keyTimes='0;0.27;0.285;0.31'
                />
              </circle>
              <path
                d='M0 0 L0 22 L6 16 L10 25 L14 23 L10 14.5 L18.5 14 Z'
                fill='currentColor'
                stroke='var(--app-rail)'
                strokeWidth='1.5'
              />
            </g>
          </g>

          {/* ─────────── 2. Install into Calimero Desktop ─────────── */}
          <g>
            <animate {...scene(1)} />
            <text
              x='48'
              y='104'
              fontSize='15'
              fill='currentColor'
              fillOpacity='0.75'
              fontFamily='sans-serif'
              fontWeight='600'
            >
              Calimero Desktop
            </text>

            <rect
              x='250'
              y='124'
              width='400'
              height='190'
              rx='16'
              fill='currentColor'
              opacity='0.05'
            />
            <rect
              x='250'
              y='124'
              width='400'
              height='190'
              rx='16'
              fill='none'
              stroke='var(--accent)'
              strokeOpacity='0.2'
            />
            <rect
              x='286'
              y='158'
              width='64'
              height='64'
              rx='18'
              fill='var(--accent)'
              opacity='0.9'
            />
            <rect
              x='368'
              y='168'
              width='150'
              height='11'
              rx='5.5'
              fill='currentColor'
              opacity='0.7'
            />
            <rect
              x='368'
              y='188'
              width='104'
              height='8'
              rx='4'
              fill='currentColor'
              opacity='0.28'
            />
            <rect
              x='368'
              y='204'
              width='62'
              height='13'
              rx='6.5'
              fill='var(--accent)'
              opacity='0.2'
            />

            {/* Progress */}
            <rect
              x='286'
              y='250'
              width='328'
              height='10'
              rx='5'
              fill='currentColor'
              opacity='0.1'
            />
            <rect x='286' y='250' height='10' rx='5' fill='var(--accent)'>
              <animate
                attributeName='width'
                dur={LOOP}
                repeatCount='indefinite'
                values='0;0;328;328;328'
                keyTimes='0;0.36;0.56;0.62;1'
              />
            </rect>
            <g opacity='0'>
              <animate
                attributeName='opacity'
                dur={LOOP}
                repeatCount='indefinite'
                values='0;0;1;1;0'
                keyTimes='0;0.555;0.58;0.64;0.67'
              />
              <circle cx='630' cy='255' r='14' fill='var(--accent)' />
              <path
                d='M623 255l5 5 10-11'
                stroke='var(--app-rail)'
                strokeWidth='3'
                fill='none'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </g>

            {/* Launcher dock — the installed app lands here */}
            <rect
              x='286'
              y='288'
              width='328'
              height='2'
              rx='1'
              fill='currentColor'
              opacity='0.08'
            />
            {[0, 1, 2].map(i => (
              <rect
                key={i}
                x={310 + i * 56}
                y='300'
                width='36'
                height='36'
                rx='11'
                fill='currentColor'
                opacity='0.09'
              />
            ))}
            <g opacity='0'>
              <animate
                attributeName='opacity'
                dur={LOOP}
                repeatCount='indefinite'
                values='0;0;1;1;0'
                keyTimes='0;0.585;0.61;0.64;0.67'
              />
              <rect
                x='478'
                y='300'
                width='36'
                height='36'
                rx='11'
                fill='var(--accent)'
              />
            </g>
          </g>

          {/* ─────────── 3. Use it ─────────── */}
          <g>
            <animate {...scene(2)} />
            {/* Channel rail */}
            <rect
              x='16'
              y='68'
              width='200'
              height='336'
              fill='currentColor'
              opacity='0.05'
            />
            <rect
              x='44'
              y='94'
              width='96'
              height='9'
              rx='4.5'
              fill='currentColor'
              opacity='0.55'
            />
            {[0, 1, 2, 3, 4].map(i => (
              <g key={i}>
                <rect
                  x='36'
                  y={120 + i * 34}
                  width='160'
                  height='26'
                  rx='8'
                  fill={i === 1 ? 'var(--accent)' : 'currentColor'}
                  opacity={i === 1 ? '0.16' : '0.04'}
                />
                <rect
                  x='50'
                  y={130 + i * 34}
                  width={[74, 96, 62, 84, 70][i]}
                  height='7'
                  rx='3.5'
                  fill={i === 1 ? 'var(--accent)' : 'currentColor'}
                  opacity={i === 1 ? '0.85' : '0.28'}
                />
              </g>
            ))}
            {/* Presence */}
            {[0, 1, 2, 3].map(i => (
              <circle
                key={`p${i}`}
                cx={50 + i * 22}
                cy='376'
                r='9'
                fill='var(--accent)'
                opacity={0.85 - i * 0.18}
              />
            ))}

            {/* Thread */}
            {[
              { x: 248, w: 300, h: 54, mine: false, t: 0.685 },
              { x: 470, w: 366, h: 40, mine: true, t: 0.745 },
              { x: 248, w: 234, h: 40, mine: false, t: 0.805 },
              { x: 404, w: 432, h: 54, mine: true, t: 0.865 },
            ].map((m, i) => (
              <g key={`m${i}`} opacity='0'>
                <animate
                  attributeName='opacity'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values='0;0;1;1;0'
                  keyTimes={`0;${m.t};${m.t + 0.02};0.96;1`}
                />
                <animateTransform
                  attributeName='transform'
                  type='translate'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values={`${m.mine ? 26 : -26},0;${m.mine ? 26 : -26},0;0,0;0,0;0,0`}
                  keyTimes={`0;${m.t};${m.t + 0.02};0.96;1`}
                />
                <rect
                  x={m.x}
                  y={110 + i * 62}
                  width={m.w}
                  height={m.h}
                  rx='14'
                  fill={m.mine ? 'var(--accent)' : 'currentColor'}
                  opacity={m.mine ? '0.82' : '0.08'}
                />
                <rect
                  x={m.x + 18}
                  y={110 + i * 62 + 15}
                  width={m.w * 0.55}
                  height='7'
                  rx='3.5'
                  fill={m.mine ? 'var(--app-rail)' : 'currentColor'}
                  opacity={m.mine ? '0.5' : '0.3'}
                />
                {m.h > 44 && (
                  <rect
                    x={m.x + 18}
                    y={110 + i * 62 + 30}
                    width={m.w * 0.34}
                    height='7'
                    rx='3.5'
                    fill={m.mine ? 'var(--app-rail)' : 'currentColor'}
                    opacity={m.mine ? '0.35' : '0.18'}
                  />
                )}
              </g>
            ))}

            {/* Composer with a blinking caret */}
            <rect
              x='248'
              y='356'
              width='588'
              height='34'
              rx='17'
              fill='currentColor'
              opacity='0.06'
            />
            <rect
              x='268'
              y='370'
              width='110'
              height='7'
              rx='3.5'
              fill='currentColor'
              opacity='0.22'
            />
            <rect x='384' y='366' width='2' height='15' fill='var(--accent)'>
              <animate
                attributeName='opacity'
                values='1;0;1'
                dur='1.1s'
                repeatCount='indefinite'
              />
            </rect>
            <circle cx='814' cy='373' r='13' fill='var(--accent)' />
          </g>
        </g>
      </svg>
    </div>
  );
}
