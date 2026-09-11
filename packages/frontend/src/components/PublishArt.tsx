/**
 * The Upload page's graphic: a bundle being signed, pushed, and picked up by
 * peers.
 *
 * The page used to carry a five-step walkthrough under the form, teaching
 * `mero-sign` and `calimero-registry bundle create` — a flow the docs page
 * explicitly says is replaced by `cargo mero`. Two sets of instructions, one
 * of them wrong, is worse than one; the steps are gone and this stands where
 * they were, with the reading pointed at Docs.
 *
 * ⚠️ CSS/SMIL ONLY — NO JAVASCRIPT LOOP. Same rule as the hero: a rAF loop on
 * a page runs forever in every background tab, and it bypasses
 * `prefers-reduced-motion`, which is honoured globally here through a media
 * query that can only reach declarative animation. Everything below animates
 * on the compositor and stops when the tab is hidden.
 *
 * ⚠️ The palette is the poster gallery's, not the page's. These are printed
 * colours on a fixed pastel ground — they do not swap with the theme, because
 * near-black type and marks on a chosen pastel is the only way the thing
 * stays legible in both.
 */

const INK = '#1c1f34';
const MARK = '#4f5bd5';

export function PublishArt() {
  return (
    <div
      data-testid='publish-art'
      className='relative overflow-hidden rounded-2xl border border-line'
      style={{
        background:
          'linear-gradient(112deg, #e9ecfb 0%, #eef0fc 46%, #f5f2fb 100%)',
      }}
    >
      <div className='relative aspect-[21/9] w-full'>
        <svg
          viewBox='0 0 840 360'
          className='absolute inset-0 h-full w-full'
          role='img'
          aria-label='A signed bundle being published and picked up by peers'
        >
          <defs>
            <linearGradient id='pa-card' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='#ffffff' stopOpacity='0.95' />
              <stop offset='100%' stopColor='#ffffff' stopOpacity='0.72' />
            </linearGradient>
          </defs>

          {/* Quiet shapes, so the ground is composed rather than blank. */}
          <circle cx='90' cy='300' r='120' fill={MARK} opacity='0.06' />
          <circle cx='700' cy='40' r='90' fill={MARK} opacity='0.05' />

          {/* ── The bundle ── */}
          <g className='pa-bundle'>
            <rect
              x='96'
              y='128'
              width='132'
              height='104'
              rx='14'
              fill='url(#pa-card)'
              stroke={MARK}
              strokeOpacity='0.35'
            />
            <rect
              x='116'
              y='152'
              width='64'
              height='8'
              rx='4'
              fill={INK}
              opacity='0.5'
            />
            <rect
              x='116'
              y='170'
              width='92'
              height='6'
              rx='3'
              fill={INK}
              opacity='0.22'
            />
            <rect
              x='116'
              y='184'
              width='74'
              height='6'
              rx='3'
              fill={INK}
              opacity='0.18'
            />
            {/* the seal, drawn on as the bundle is signed */}
            <circle
              className='pa-seal'
              cx='202'
              cy='208'
              r='14'
              fill={MARK}
              opacity='0.9'
            />
            <path
              className='pa-tick'
              d='M195 208l5 5 9-10'
              fill='none'
              stroke='#ffffff'
              strokeWidth='2.4'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </g>

          {/* ── The wire ── */}
          <path
            id='pa-wire'
            d='M232 180 H600'
            fill='none'
            stroke={MARK}
            strokeOpacity='0.25'
            strokeWidth='2'
            strokeDasharray='6 8'
          />
          {/* the packet, travelling it */}
          <circle className='pa-packet' r='7' fill={MARK}>
            <animateMotion
              dur='4.6s'
              repeatCount='indefinite'
              keyPoints='0;0;1;1'
              keyTimes='0;0.28;0.78;1'
              calcMode='linear'
            >
              <mpath href='#pa-wire' />
            </animateMotion>
          </circle>

          {/* ── The registry ── */}
          <g>
            <rect
              x='600'
              y='120'
              width='150'
              height='120'
              rx='16'
              fill='url(#pa-card)'
              stroke={MARK}
              strokeOpacity='0.35'
            />
            {[0, 1, 2].map(i => (
              <rect
                key={i}
                className={`pa-row pa-row-${i}`}
                x='620'
                y={146 + i * 28}
                width='110'
                height='18'
                rx='6'
                fill={MARK}
                opacity='0.14'
              />
            ))}
          </g>

          {/* ── The peers ── */}
          {[
            [676, 300],
            [744, 276],
            [608, 276],
          ].map(([cx, cy], i) => (
            <g key={i}>
              <line
                x1='675'
                y1='240'
                x2={cx}
                y2={cy}
                stroke={MARK}
                strokeOpacity='0.2'
                strokeWidth='1.5'
              />
              <circle
                className={`pa-peer pa-peer-${i}`}
                cx={cx}
                cy={cy}
                r='13'
                fill='#ffffff'
                stroke={MARK}
                strokeOpacity='0.45'
              />
            </g>
          ))}
        </svg>

        <div className='absolute inset-x-0 bottom-0 p-5 sm:p-7'>
          <p
            className='font-display text-[15px] font-bold leading-tight tracking-tight sm:text-[19px]'
            style={{ color: INK }}
          >
            Sign it, push it, and every node can verify it.
          </p>
          <p
            className='mt-1 text-[12px] font-light sm:text-[13px]'
            style={{ color: INK, opacity: 0.7 }}
          >
            A bundle is WASM plus a signed manifest. The registry checks the
            signature; peers check it again on install.
          </p>
        </div>
      </div>
    </div>
  );
}
