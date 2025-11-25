import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "sans-serif"],
        mono: ['"Fira Code"', "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
