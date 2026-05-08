import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 腾讯视频品牌色系
        'txv-orange': '#FF6A00',
        'txv-orange-light': '#FF8C33',
        'txv-orange-dark': '#CC5500',
        'txv-blue': '#1677FF',
        'txv-blue-light': '#4CC9F0',
        'txv-blue-dark': '#0D5FCC',
        'txv-bg': '#0D0D0D',
        'txv-bg-secondary': '#1A1A1A',
        'txv-bg-tertiary': '#141414',
        'txv-surface': '#2A2A2A',
        'txv-surface-light': '#333333',
        'txv-surface-hover': '#3A3A3A',
        'txv-text': '#FFFFFF',
        'txv-text-secondary': '#999999',
        'txv-text-tertiary': '#666666',
        // Reaction类型颜色
        'reaction-highlight': '#FFD700',
        'reaction-heartbreak': '#9B59B6',
        'reaction-foreshadow': '#00BCD4',
        'reaction-comedy': '#2ECC71',
        'reaction-romance': '#FF69B4',
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      animation: {
        'breathe': 'breathe 3s ease-in-out infinite',
        'breathe-subtle': 'breatheSubtle 4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'pulse-glow-orange': 'pulseGlowOrange 2.5s ease-in-out infinite',
        'fade-in-up': 'fadeInUp 0.3s ease-out',
        'fade-in-down': 'fadeInDown 0.3s ease-out',
        'fade-out': 'fadeOut 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-right': 'slideRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-left': 'slideLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spin-slow': 'spin 8s linear infinite',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'wave-1': 'wave 1.2s ease-in-out infinite',
        'wave-2': 'wave 1.2s ease-in-out infinite 0.15s',
        'wave-3': 'wave 1.2s ease-in-out infinite 0.3s',
        'wave-4': 'wave 1.2s ease-in-out infinite 0.45s',
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
        'border-glow': 'borderGlow 2s ease-in-out infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        },
        breatheSubtle: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.015)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(76,201,240,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(76,201,240,0.6), 0 0 40px rgba(76,201,240,0.2)' },
        },
        pulseGlowOrange: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(255,106,0,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(255,106,0,0.5), 0 0 40px rgba(255,106,0,0.15)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(1.8)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        borderGlow: {
          '0%, 100%': { borderColor: 'rgba(76, 201, 240, 0.2)' },
          '50%': { borderColor: 'rgba(76, 201, 240, 0.5)' },
        },
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(76, 201, 240, 0.2)',
        'glow-md': '0 0 20px rgba(76, 201, 240, 0.3)',
        'glow-lg': '0 0 30px rgba(76, 201, 240, 0.4)',
        'glow-orange-sm': '0 0 10px rgba(255, 106, 0, 0.2)',
        'glow-orange-md': '0 0 20px rgba(255, 106, 0, 0.3)',
        'glow-orange-lg': '0 0 30px rgba(255, 106, 0, 0.4)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'premium': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
        'dark-gradient': 'linear-gradient(180deg, rgba(13,13,13,0) 0%, rgba(13,13,13,0.95) 100%)',
      },
      backdropBlur: {
        'xs': '2px',
        'xl': '20px',
        '2xl': '30px',
        '3xl': '40px',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
