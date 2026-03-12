/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nominal: '#22c55e',
        elevated: '#f59e0b',
        critical: '#ef4444',
        surface: '#111827',
        'surface-alt': '#1f2937',
        border: '#374151',
      },
    },
  },
  plugins: [],
}
