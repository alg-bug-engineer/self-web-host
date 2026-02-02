import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-inset': 'var(--bg-inset)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'accent-primary': 'var(--accent-primary)',
        'accent-secondary': 'var(--accent-secondary)',
        'accent-tertiary': 'var(--accent-tertiary)',
        'border-default': 'var(--border-default)',
        'border-muted': 'var(--border-muted)',
        'color-success-fg': 'var(--color-success-fg)',
        'color-success-subtle': 'var(--color-success-subtle)',
        'color-danger-fg': 'var(--color-danger-fg)',
        'color-danger-subtle': 'var(--color-danger-subtle)',
        'color-warning-fg': 'var(--color-warning-fg)',
        'color-warning-subtle': 'var(--color-warning-subtle)',
        'color-attention-fg': 'var(--color-attention-fg)',
        'color-attention-subtle': 'var(--color-attention-subtle)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Noto Sans"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config