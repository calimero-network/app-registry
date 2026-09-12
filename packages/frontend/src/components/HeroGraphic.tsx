/**
 * The home hero: Calimero Desktop on a laptop, running the whole journey.
 *
 *   1. Browse   — the registry inside the app: named rows, categories, sizes,
 *                 download counts, a cursor that picks one and clicks
 *   2. Install  — the app card, a progress bar, a tick, and the icon landing
 *                 in the launcher dock
 *   3. Use      — mero-chat open: channel list with real names, a thread of
 *                 actual messages arriving one after another, presence, and
 *                 a composer being typed into
 *
 * The device frame matters. Without it the three scenes read as abstract
 * rectangles; drawn inside a laptop they read as software someone is using,
 * which is the whole claim the page is making.
 *
 * ⚠️ NO JAVASCRIPT. A rAF loop on the busiest page runs forever in every open
 * tab, backgrounded ones included. This is SMIL on inline SVG: the browser
 * owns the timeline, pauses it on a hidden tab, costs nothing on the main
 * thread, and inherits `prefers-reduced-motion` from the global reduce block.
 * A JS loop would have bypassed that.
 *
 * Text is real. Placeholder bars say "a list of things"; "#design-review" and
 * "shipping the canvas fix today" say what the product is for.
 */

const LOOP = '18s';

/** Three beats of ~6s, cross-fading at the seams. */
function scene(i: number) {
  return {
    attributeName: 'opacity',
    dur: LOOP,
    repeatCount: 'indefinite' as const,
    keyTimes: '0;0.30;0.34;0.63;0.67;0.96;1',
    values: ['1;1;0;0;0;0;1', '0;0;1;1;0;0;0', '0;0;0;0;1;1;0'][i],
  };
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS = 'Inter, system-ui, sans-serif';

const APPS = [
  { name: 'Merraria', cat: 'Games', size: '2.4 MB', dl: '1,204' },
  { name: 'Mero Chat', cat: 'Communication', size: '890 KB', dl: '981' },
  { name: 'Mero Sheets', cat: 'Productivity', size: '1.2 MB', dl: '340' },
];

const CHANNELS = ['#general', '#design-review', '#releases', '#random'];

const THREAD = [
  { who: 'ana', text: 'anyone got the canvas fix?', mine: false, t: 0.685 },
  { who: 'you', text: 'pushed it — 0.0.4 is signed', mine: true, t: 0.745 },
  { who: 'ana', text: 'installing now', mine: false, t: 0.8 },
  { who: 'you', text: 'syncs straight to your node 🎉', mine: true, t: 0.855 },
];

export function HeroGraphic() {
  return (
    <div
      className='pointer-events-none select-none'
      aria-hidden='true'
      data-testid='hero-graphic'
    >
      {/*
        ⚠️ THE viewBox IS CROPPED, NOT THE DRAWING. The laptop occupies y=18
        to y=514 of a 560-tall board, so 64px of it was empty margin — 11% of
        the hero's height spent on nothing, at the top of the page, on a
        laptop screen where the fold is 860px. Trimming the box is free
        height: every coordinate inside is untouched, so the animation still
        lands where it did.

        The container's `aspect-[960/508]` has to stay in step with this. A
        mismatch does not distort anything (`xMidYMid meet` is the default)
        but it letterboxes, which puts the margin straight back.
      */}
      <svg viewBox='0 14 960 508' className='h-full w-full'>
        <defs>
          <clipPath id='hero-screen'>
            <rect x='96' y='30' width='768' height='452' rx='10' />
          </clipPath>
          <linearGradient id='hero-lid' x1='0' y1='0' x2='0' y2='1'>
            <stop
              offset='0%'
              stopColor='var(--hero-accent-soft)'
              stopOpacity='0.10'
            />
            <stop
              offset='60%'
              stopColor='var(--hero-accent-soft)'
              stopOpacity='0'
            />
          </linearGradient>
          <linearGradient id='hero-base' x1='0' y1='0' x2='1' y2='0'>
            <stop offset='0%' stopColor='currentColor' stopOpacity='0.10' />
            <stop offset='50%' stopColor='currentColor' stopOpacity='0.22' />
            <stop offset='100%' stopColor='currentColor' stopOpacity='0.10' />
          </linearGradient>
        </defs>

        {/* ── Laptop ── */}
        <rect
          x='84'
          y='18'
          width='792'
          height='476'
          rx='18'
          fill='currentColor'
          fillOpacity='0.06'
          stroke='currentColor'
          strokeOpacity='0.18'
        />
        <rect
          x='96'
          y='30'
          width='768'
          height='452'
          rx='10'
          fill='var(--app-rail)'
        />
        <rect
          x='96'
          y='30'
          width='768'
          height='150'
          rx='10'
          fill='url(#hero-lid)'
        />
        {/* Base + notch */}
        <path
          d='M40 500 h880 a10 10 0 0 1 -10 14 H50 a10 10 0 0 1 -10 -14 Z'
          fill='url(#hero-base)'
        />
        <rect
          x='430'
          y='500'
          width='100'
          height='5'
          rx='2.5'
          fill='currentColor'
          fillOpacity='0.22'
        />
        <circle
          cx='480'
          cy='24'
          r='2.5'
          fill='currentColor'
          fillOpacity='0.3'
        />

        {/* App chrome inside the screen */}
        <circle cx='120' cy='52' r='4.5' fill='#ff5f57' opacity='0.85' />
        <circle cx='136' cy='52' r='4.5' fill='#febc2e' opacity='0.85' />
        <circle cx='152' cy='52' r='4.5' fill='#28c840' opacity='0.85' />
        <text
          x='420'
          y='56'
          fontSize='11'
          fontFamily={SANS}
          fill='currentColor'
          fillOpacity='0.45'
        >
          Calimero Desktop
        </text>
        <line
          x1='96'
          y1='74'
          x2='864'
          y2='74'
          stroke='currentColor'
          strokeOpacity='0.1'
        />

        <g clipPath='url(#hero-screen)'>
          {/* ══════ 1. Browse ══════ */}
          <g>
            <animate {...scene(0)} />
            <text
              x='128'
              y='112'
              fontSize='17'
              fontWeight='600'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.85'
            >
              Explore
            </text>
            <rect
              x='620'
              y='94'
              width='214'
              height='26'
              rx='13'
              fill='currentColor'
              opacity='0.06'
            />
            <text
              x='638'
              y='111'
              fontSize='11'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.35'
            >
              Search apps
            </text>

            {APPS.map((a, i) => {
              const on = i === 1;
              const y = 140 + i * 96;
              return (
                <g key={a.name}>
                  <rect
                    x='128'
                    y={y}
                    width='706'
                    height='80'
                    rx='14'
                    fill={on ? 'var(--hero-accent-soft)' : 'currentColor'}
                    opacity={on ? '0.10' : '0.035'}
                  />
                  {on && (
                    <rect
                      x='128'
                      y={y}
                      width='706'
                      height='80'
                      rx='14'
                      fill='none'
                      stroke='var(--hero-accent-soft)'
                      strokeOpacity='0.5'
                    />
                  )}
                  <rect
                    x='148'
                    y={y + 16}
                    width='48'
                    height='48'
                    rx='13'
                    fill={on ? 'var(--hero-accent)' : 'var(--hero-accent-soft)'}
                    opacity={on ? '0.9' : '0.3'}
                  />
                  <text
                    x='212'
                    y={y + 32}
                    fontSize='14'
                    fontWeight='600'
                    fontFamily={SANS}
                    fill='currentColor'
                    fillOpacity={on ? '0.9' : '0.6'}
                  >
                    {a.name}
                  </text>
                  <text
                    x='212'
                    y={y + 50}
                    fontSize='11'
                    fontFamily={SANS}
                    fill='currentColor'
                    fillOpacity='0.35'
                  >
                    calimero-network
                  </text>
                  <rect
                    x='212'
                    y={y + 58}
                    width={a.cat.length * 6.4 + 20}
                    height='16'
                    rx='8'
                    fill='currentColor'
                    opacity='0.08'
                  />
                  <text
                    x={220}
                    y={y + 70}
                    fontSize='9.5'
                    fontFamily={SANS}
                    fill='currentColor'
                    fillOpacity='0.45'
                  >
                    {a.cat}
                  </text>
                  <text
                    x='612'
                    y={y + 45}
                    fontSize='11'
                    fontFamily={MONO}
                    fill='currentColor'
                    fillOpacity='0.35'
                  >
                    {a.size}
                  </text>
                  <text
                    x='682'
                    y={y + 45}
                    fontSize='11'
                    fontFamily={MONO}
                    fill='currentColor'
                    fillOpacity='0.35'
                  >
                    ↓ {a.dl}
                  </text>
                  <rect
                    x='742'
                    y={y + 26}
                    width='76'
                    height='28'
                    rx='14'
                    fill={on ? 'var(--hero-accent)' : 'var(--hero-accent-soft)'}
                    opacity={on ? '1' : '0.2'}
                  />
                  <text
                    x='780'
                    y={y + 45}
                    fontSize='11'
                    fontWeight='600'
                    fontFamily={SANS}
                    textAnchor='middle'
                    fill='var(--hero-on-accent)'
                    fillOpacity={on ? '1' : '0.5'}
                  >
                    Install
                  </text>
                </g>
              );
            })}

            {/* The cursor reaches the Install button in the first ~2s of the
                18s loop and clicks it there. It used to arrive at 17% and sit
                idle until a click at 26%; the ripple has to move with the
                pointer or the scene shows a click that lands on nothing. */}
            <g>
              <animateMotion
                dur={LOOP}
                repeatCount='indefinite'
                path='M840,440 L810,340 L790,272'
                keyPoints='0;0.6;1'
                keyTimes='0;0.06;0.115'
                calcMode='linear'
              />
              <circle r='0' fill='var(--hero-accent-soft)'>
                <animate
                  attributeName='r'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values='0;0;26;0'
                  keyTimes='0;0.115;0.155;0.165'
                />
                <animate
                  attributeName='opacity'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values='0;0;0.4;0'
                  keyTimes='0;0.115;0.13;0.165'
                />
              </circle>
              <path
                d='M0 0 L0 21 L5.8 15.5 L9.6 24 L13.4 22.2 L9.6 14 L17.8 13.6 Z'
                fill='currentColor'
                stroke='var(--app-rail)'
                strokeWidth='1.5'
              />
            </g>
          </g>

          {/* ══════ 2. Install ══════ */}
          <g>
            <animate {...scene(1)} />
            <text
              x='128'
              y='112'
              fontSize='17'
              fontWeight='600'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.85'
            >
              Installing
            </text>

            <rect
              x='268'
              y='150'
              width='424'
              height='214'
              rx='18'
              fill='currentColor'
              opacity='0.05'
            />
            <rect
              x='268'
              y='150'
              width='424'
              height='214'
              rx='18'
              fill='none'
              stroke='var(--hero-accent-soft)'
              strokeOpacity='0.22'
            />
            <rect
              x='304'
              y='184'
              width='68'
              height='68'
              rx='19'
              fill='var(--hero-accent)'
              opacity='0.9'
            />
            <text
              x='392'
              y='206'
              fontSize='16'
              fontWeight='600'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.85'
            >
              Mero Chat
            </text>
            <text
              x='392'
              y='226'
              fontSize='11'
              fontFamily={MONO}
              fill='currentColor'
              fillOpacity='0.35'
            >
              com.calimero.mero-chat
            </text>
            <text
              x='392'
              y='246'
              fontSize='11'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.35'
            >
              v3.1.1 · 890 KB · verified
            </text>

            <rect
              x='304'
              y='282'
              width='352'
              height='10'
              rx='5'
              fill='currentColor'
              opacity='0.1'
            />
            <rect x='304' y='282' height='10' rx='5' fill='var(--hero-accent)'>
              <animate
                attributeName='width'
                dur={LOOP}
                repeatCount='indefinite'
                values='0;0;352;352;352'
                keyTimes='0;0.355;0.55;0.62;1'
              />
            </rect>
            <text
              x='304'
              y='312'
              fontSize='10.5'
              fontFamily={MONO}
              fill='currentColor'
              fillOpacity='0.4'
            >
              verifying signature…
            </text>
            <g opacity='0'>
              <animate
                attributeName='opacity'
                dur={LOOP}
                repeatCount='indefinite'
                values='0;0;1;1;0'
                keyTimes='0;0.545;0.57;0.635;0.665'
              />
              <circle cx='676' cy='287' r='15' fill='var(--hero-accent)' />
              <path
                d='M669 287l5 5 10-11'
                stroke='var(--hero-on-accent)'
                strokeWidth='3'
                fill='none'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
              <text
                x='304'
                y='334'
                fontSize='10.5'
                fontFamily={MONO}
                fill='var(--hero-accent-soft)'
                fillOpacity='1'
              >
                installed to your node
              </text>
            </g>

            {/* Dock */}
            <rect
              x='300'
              y='394'
              width='360'
              height='60'
              rx='16'
              fill='currentColor'
              opacity='0.06'
            />
            {[0, 1, 2].map(i => (
              <rect
                key={i}
                x={320 + i * 62}
                y='408'
                width='40'
                height='40'
                rx='12'
                fill='currentColor'
                opacity='0.1'
              />
            ))}
            <g opacity='0'>
              <animate
                attributeName='opacity'
                dur={LOOP}
                repeatCount='indefinite'
                values='0;0;1;1;0'
                keyTimes='0;0.575;0.60;0.635;0.665'
              />
              <animateTransform
                attributeName='transform'
                type='translate'
                dur={LOOP}
                repeatCount='indefinite'
                values='0,-24;0,-24;0,0;0,0;0,0'
                keyTimes='0;0.575;0.605;0.635;0.665'
              />
              <rect
                x='506'
                y='408'
                width='40'
                height='40'
                rx='12'
                fill='var(--hero-accent)'
              />
            </g>
          </g>

          {/* ══════ 3. Use ══════ */}
          <g>
            <animate {...scene(2)} />
            {/* Channels */}
            <rect
              x='96'
              y='74'
              width='192'
              height='408'
              fill='currentColor'
              opacity='0.05'
            />
            <text
              x='120'
              y='106'
              fontSize='12'
              fontWeight='600'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.6'
            >
              Mero Chat
            </text>
            {CHANNELS.map((c, i) => (
              <g key={c}>
                <rect
                  x='112'
                  y={124 + i * 34}
                  width='160'
                  height='26'
                  rx='7'
                  fill={i === 1 ? 'var(--hero-accent-soft)' : 'currentColor'}
                  opacity={i === 1 ? '0.16' : '0'}
                />
                <text
                  x='124'
                  y={142 + i * 34}
                  fontSize='12'
                  fontFamily={SANS}
                  fill={i === 1 ? 'var(--hero-accent-soft)' : 'currentColor'}
                  fillOpacity={i === 1 ? '1' : '0.4'}
                >
                  {c}
                </text>
              </g>
            ))}
            <text
              x='120'
              y='420'
              fontSize='10'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.3'
            >
              3 online
            </text>
            {[0, 1, 2].map(i => (
              <circle
                key={i}
                cx={124 + i * 18}
                cy='440'
                r='7'
                fill='var(--hero-accent-soft)'
                opacity={0.85 - i * 0.2}
              />
            ))}

            <text
              x='312'
              y='106'
              fontSize='13'
              fontWeight='600'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.7'
            >
              #design-review
            </text>
            <line
              x1='288'
              y1='120'
              x2='864'
              y2='120'
              stroke='currentColor'
              strokeOpacity='0.08'
            />

            {THREAD.map((m, i) => {
              const w = m.text.length * 6.6 + 40;
              const x = m.mine ? 836 - w : 312;
              const y = 146 + i * 62;
              return (
                <g key={i} opacity='0'>
                  <animate
                    attributeName='opacity'
                    dur={LOOP}
                    repeatCount='indefinite'
                    values='0;0;1;1;0'
                    keyTimes={`0;${m.t};${m.t + 0.018};0.955;1`}
                  />
                  <animateTransform
                    attributeName='transform'
                    type='translate'
                    dur={LOOP}
                    repeatCount='indefinite'
                    values={`${m.mine ? 22 : -22},6;${m.mine ? 22 : -22},6;0,0;0,0;0,0`}
                    keyTimes={`0;${m.t};${m.t + 0.018};0.955;1`}
                  />
                  <text
                    x={m.mine ? 836 : 312}
                    y={y - 6}
                    fontSize='10'
                    fontFamily={SANS}
                    textAnchor={m.mine ? 'end' : 'start'}
                    fill='currentColor'
                    fillOpacity='0.35'
                  >
                    {m.who}
                  </text>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height='36'
                    rx='12'
                    fill={m.mine ? 'var(--hero-accent)' : 'currentColor'}
                    opacity={m.mine ? '0.85' : '0.08'}
                  />
                  <text
                    x={x + 20}
                    y={y + 23}
                    fontSize='12.5'
                    fontFamily={SANS}
                    fill={m.mine ? 'var(--hero-on-accent)' : 'currentColor'}
                    fillOpacity={m.mine ? '1' : '0.85'}
                  >
                    {m.text}
                  </text>
                </g>
              );
            })}

            {/* Composer, typed into */}
            <rect
              x='312'
              y='424'
              width='524'
              height='36'
              rx='18'
              fill='currentColor'
              opacity='0.06'
            />
            <text
              x='334'
              y='447'
              fontSize='12'
              fontFamily={SANS}
              fill='currentColor'
              fillOpacity='0.55'
            >
              <tspan>
                nice
                <animate
                  attributeName='opacity'
                  dur={LOOP}
                  repeatCount='indefinite'
                  values='0;0;1;1;0'
                  keyTimes='0;0.90;0.915;0.955;1'
                />
              </tspan>
            </text>
            <rect y='434' width='2' height='16' fill='var(--hero-accent-soft)'>
              <animate
                attributeName='x'
                dur={LOOP}
                repeatCount='indefinite'
                values='334;334;362;362'
                keyTimes='0;0.90;0.918;1'
              />
              <animate
                attributeName='opacity'
                values='1;0;1'
                dur='1.1s'
                repeatCount='indefinite'
              />
            </rect>
            <circle cx='812' cy='442' r='13' fill='var(--hero-accent)' />
            <path
              d='M807 442l4 4 7-8'
              stroke='var(--hero-on-accent)'
              strokeWidth='2'
              fill='none'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
