/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Calimero Design System Colors
        neutral: {
          900: '#131215',
          800: '#222222',
          700: '#282828',
          600: '#404040',
          400: '#8E8E8E',
          300: '#A0A0A0',
          200: '#C8C8C8',
        },
        brand: {
          900: '#2D381B',
          800: '#8AA200',
          700: '#73B30C',
          600: '#A5FF11',
          100: '#ECFC91',
        },
        background: {
          primary: '#0F1419',
          secondary: '#131215',
          tertiary: '#0A0E13',
        },
        semantic: {
          success: '#16a34a',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
        },
        // Legacy primary colors for backward compatibility
        primary: {
          50: '#ECFC91',
          100: '#ECFC91',
          200: '#A5FF11',
          300: '#A5FF11',
          400: '#73B30C',
          500: '#73B30C',
          600: '#8AA200',
          700: '#8AA200',
          800: '#2D381B',
          900: '#2D381B',
        },
      },
      fontFamily: {
        sans: ['Power Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        heading: ['Power Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        secondary: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      spacing: {
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        6: '1.5rem',
      },
    },
  },
  plugins: [],
};
