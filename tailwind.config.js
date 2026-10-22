// Theme colours are CSS variables (they change with the theme and accent).
// Tailwind 3 can't apply an opacity modifier (`bg-danger/10`) to a bare
// var() colour - such classes silently produced no CSS - so each colour is a
// function that mixes the variable with transparent at the asked opacity.
const color = (name) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `var(${name})`
    : `color-mix(in srgb, var(${name}) calc(${opacityValue} * 100%), transparent)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        nav: '955px',
      },
      fontFamily: {
        sans: ['"DM Sans Variable"', 'sans-serif'],
      },
      colors: {
        bg: {
          base: color('--bg-base'),
          sunken: color('--bg-sunken'),
          surface: color('--bg-surface'),
          card: color('--bg-card'),
          elevated: color('--bg-elevated'),
          hover: color('--bg-hover'),
          border: color('--bg-border'),
          // The lighter border inside cards and settings groups.
          'border-soft': 'color-mix(in srgb, var(--bg-border) 60%, transparent)',
        },
        accent: {
          DEFAULT: color('--accent'),
          hover: color('--accent-hover'),
          muted: color('--accent-muted'),
          // Pre-mixed softer accent (rgba) for pinned/selected borders.
          border: color('--accent-border'),
          // Text/icon colour on a solid accent fill.
          fg: color('--accent-fg'),
        },
        text: {
          primary: color('--text-primary'),
          content: color('--text-content'),
          secondary: color('--text-secondary'),
          muted: color('--text-muted'),
        },
        success: color('--success'),
        danger: {
          DEFAULT: color('--danger'),
          hover: color('--danger-hover'),
          // Pre-mixed rgba soft tint (kept as a named token).
          muted: color('--danger-muted'),
        },
      },
    },
  },
  plugins: [],
}
