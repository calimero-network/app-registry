/**
 * The home hero.
 *
 * A node joining a mesh: peers on a ring, edges drawn between them, packets
 * travelling along the edges. It is the one picture that says what Calimero
 * is without a paragraph.
 *
 * ⚠️ NO JAVASCRIPT, DELIBERATELY. The request was for something animated and
 * looping that does not lag. A rAF loop on the front page runs forever, in
 * every open tab, including backgrounded ones. This is pure CSS on an inline
 * SVG: the compositor owns it, the browser stops it when the tab is hidden,
 * and it costs nothing on the main thread.
 *
 * It also inherits `prefers-reduced-motion` for free — the global reduce
 * block clamps `animation-duration`, so a viewer who asked for less motion
 * gets a still image. A JS loop would have bypassed that and quietly undone
 * the accessibility work.
 *
 * Only `transform` and `opacity` are animated. Anything touching layout or
 * paint here would be a permanent jank source on the busiest page.
 */
export function HeroGraphic() {
  const peers = [
    { x: 260, y: 40 },
    { x: 430, y: 130 },
    { x: 430, y: 270 },
    { x: 260, y: 360 },
    { x: 90, y: 270 },
    { x: 90, y: 130 },
  ];

  return (
    <div
      className='pointer-events-none select-none'
      aria-hidden='true'
      data-testid='hero-graphic'
    >
      <svg viewBox='0 0 520 400' className='h-full w-full'>
        <defs>
          <radialGradient id='hg-core' cx='50%' cy='50%'>
            <stop offset='0%' stopColor='var(--accent)' stopOpacity='0.35' />
            <stop offset='100%' stopColor='var(--accent)' stopOpacity='0' />
          </radialGradient>
        </defs>

        <circle cx='260' cy='200' r='150' fill='url(#hg-core)' />

        {peers.map((p, i) => (
          <line
            key={`e${i}`}
            x1='260'
            y1='200'
            x2={p.x}
            y2={p.y}
            stroke='var(--accent)'
            strokeOpacity='0.22'
            strokeWidth='1'
          />
        ))}

        {/* Packets. Each rides its edge on a staggered delay, so the mesh
            looks busy without every dot moving in lockstep. */}
        {peers.map((p, i) => (
          <circle key={`p${i}`} r='3' fill='var(--accent)'>
            <animateMotion
              dur={`${3.2 + i * 0.35}s`}
              repeatCount='indefinite'
              path={`M260,200 L${p.x},${p.y}`}
              begin={`${i * 0.45}s`}
            />
            <animate
              attributeName='opacity'
              values='0;1;1;0'
              dur={`${3.2 + i * 0.35}s`}
              repeatCount='indefinite'
              begin={`${i * 0.45}s`}
            />
          </circle>
        ))}

        {peers.map((p, i) => (
          <circle
            key={`n${i}`}
            cx={p.x}
            cy={p.y}
            r='9'
            fill='var(--app-bg)'
            stroke='var(--accent)'
            strokeOpacity='0.5'
            strokeWidth='1.4'
          />
        ))}

        <circle
          cx='260'
          cy='200'
          r='26'
          fill='var(--app-bg)'
          stroke='var(--accent)'
          strokeWidth='1.6'
        />
        <circle cx='260' cy='200' r='26' fill='none' stroke='var(--accent)'>
          <animate
            attributeName='r'
            values='26;56'
            dur='3s'
            repeatCount='indefinite'
          />
          <animate
            attributeName='opacity'
            values='0.5;0'
            dur='3s'
            repeatCount='indefinite'
          />
        </circle>
        <path
          d='M250 194h20M250 200h20M250 206h13'
          stroke='var(--accent)'
          strokeWidth='1.6'
          strokeLinecap='round'
        />
      </svg>
    </div>
  );
}
