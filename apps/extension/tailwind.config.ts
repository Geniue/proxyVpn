import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(200 18% 78%)",
        input: "hsl(200 18% 78%)",
        ring: "hsl(189 72% 42%)",
        background: "hsl(40 33% 96%)",
        foreground: "hsl(212 33% 14%)",
        primary: {
          DEFAULT: "hsl(189 72% 42%)",
          foreground: "hsl(40 33% 98%)"
        },
        secondary: {
          DEFAULT: "hsl(39 67% 88%)",
          foreground: "hsl(212 33% 18%)"
        },
        muted: {
          DEFAULT: "hsl(45 32% 92%)",
          foreground: "hsl(212 16% 38%)"
        },
        destructive: {
          DEFAULT: "hsl(1 72% 54%)",
          foreground: "hsl(0 0% 100%)"
        },
        card: {
          DEFAULT: "hsla(0 0% 100% / 0.84)",
          foreground: "hsl(212 33% 14%)"
        }
      },
      boxShadow: {
        panel: "0 24px 80px rgba(22, 42, 58, 0.16)",
      },
      borderRadius: {
        xl: "1.25rem",
      },
      fontFamily: {
        sans: ['Aptos', 'Segoe UI Variable', 'Segoe UI', 'sans-serif'],
        display: ['Bahnschrift', 'Aptos', 'Segoe UI', 'sans-serif'],
      },
      backgroundImage: {
        aurora: "radial-gradient(circle at top left, rgba(18, 178, 196, 0.32), transparent 38%), radial-gradient(circle at top right, rgba(246, 179, 80, 0.24), transparent 28%), linear-gradient(160deg, rgba(255,255,255,0.98), rgba(245,239,228,0.92))",
      },
    },
  },
  plugins: [],
};

export default config;
