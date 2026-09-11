/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Themed palette ──
        //
        // These resolve to CSS custom properties defined in index.css under
        // `:root` and `:root[data-theme='light']`, so ~580 existing utility
        // classes (`text-neutral-400`, `bg-white/[0.04]`, `text-brand-600`)
        // flip with the theme WITHOUT touching a single call site. Converting
        // them by hand would have meant editing every page.
        //
        // The channel triplets (`--n-400-rgb`) exist because Tailwind needs a
        // bare `R G B` to apply an opacity modifier: `text-neutral-400/60`
        // cannot work against a `#hex` held in a var.
        neutral: {
          950: 'rgb(var(--n-950-rgb) / <alpha-value>)',
          900: 'rgb(var(--n-900-rgb) / <alpha-value>)',
          800: 'rgb(var(--n-800-rgb) / <alpha-value>)',
          700: 'rgb(var(--n-700-rgb) / <alpha-value>)',
          600: 'rgb(var(--n-600-rgb) / <alpha-value>)',
          500: 'rgb(var(--n-500-rgb) / <alpha-value>)',
          400: 'rgb(var(--n-400-rgb) / <alpha-value>)',
          300: 'rgb(var(--n-300-rgb) / <alpha-value>)',
          200: 'rgb(var(--n-200-rgb) / <alpha-value>)',
          100: 'rgb(var(--n-100-rgb) / <alpha-value>)',
        },
        brand: {
          900: '#2D381B',
          800: '#8AA200',
          700: '#73B30C',
          // ⚠️ `brand-600` is used as TEXT in ~60 places. The bright lime is
          // legible on a dark ground and fails badly on white, so in light
          // mode it resolves to a deep green instead. The raw lime is still
          // available as `brand-accent` for backgrounds and fills, which are
          // fine in both themes.
          600: 'rgb(var(--accent-text-rgb) / <alpha-value>)',
          500: 'rgb(var(--accent-text-hover-rgb) / <alpha-value>)',
          400: '#c9ff73',
          300: '#d6ff99',
          100: '#ECFC91',
          accent: '#A5FF11',
        },
        // The neutral used with an opacity modifier for FILLS: `bg-white/[0.04]`
        // is invisible on a white page, so those became `bg-ink/[0.04]`, which
        // is near-white in dark mode and near-black in light.
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        // ⚠️ SEPARATORS DO NOT GO THROUGH `ink`, AND CANNOT.
        //
        // They used to: `border-ink/[0.06]`, 77 times. In light mode that is
        // 6% near-black on white — `#f1f1f1`, a line you cannot see — and no
        // value of `--ink-rgb` fixes it, because 6% of ANY colour over white
        // lands at `#f0f0f0` at its darkest. The alpha is the bug and it was
        // baked into the class names.
        //
        // So a line is its own token, opaque in light mode and a translucent
        // white in dark, where the ground is what gives it its value. No
        // `<alpha-value>`: these must not be dimmable back into invisibility.
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        background: {
          primary: '#0a0a0a',
          secondary: '#0a0a0a',
          tertiary: '#111111',
        },
        surface: {
          DEFAULT: '#111111',
          2: '#161616',
        },
        semantic: {
          success: '#3fb950',
          warning: '#d29922',
          error: '#f85149',
          info: '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'system-ui', '-apple-system', 'sans-serif'],
        // DM Sans was already being fetched by the font import and then never
        // used — it sat behind Inter in the `sans` stack, so it only ever
        // applied if Inter failed to load. It is a display face here instead:
        // the one place that wants a different voice from the body copy.
        display: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out both',
        'slide-up': 'slideUp 0.5s ease-out both',
        'slide-in-left': 'slideInLeft 0.5s ease-out both',
        'slide-in-right': 'slideInRight 0.5s ease-out both',
        'scale-in': 'scaleIn 0.4s ease-out both',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(165, 255, 17, 0.1)' },
          '50%': { boxShadow: '0 0 40px rgba(165, 255, 17, 0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};
