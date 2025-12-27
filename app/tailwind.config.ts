import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accugreen: "#6FBF4A",
        accunavy: "#0F1A23",
        accuyellow: "#F5C542",
        accuorange: "#F28C38",
      },
    },
  },
  plugins: [],
};

export default config;
