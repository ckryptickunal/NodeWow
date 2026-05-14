import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)',
        foreground: 'var(--white)',
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
        muted: 'var(--muted)',
        'step-num': 'var(--step-num)',
        blue: 'var(--blue)',
      },
      fontFamily: {
        display: ['var(--font-big-shoulders)', 'sans-serif'],
        body: ['var(--font-dm-sans)', 'sans-serif'],
      },
      borderRadius: {
        pill: 'var(--radius-pill)',
        badge: 'var(--radius-badge)',
        card: 'var(--radius-card)',
        image: 'var(--radius-image)',
      },
      spacing: {
        'section-y': 'var(--section-padding)',
        'page-x': 'var(--page-padding-x)',
      },
      maxWidth: {
        content: 'var(--content-max-width)',
      },
    },
  },
  plugins: [],
};

export default config;
