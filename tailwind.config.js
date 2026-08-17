/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        night:  "rgb(var(--c-night) / <alpha-value>)",
        panel:  "#33204D",
        panel2: "#3D2759",
        line:   "rgb(var(--c-line) / <alpha-value>)",
        mint:   "#2FD6BC",   // team النعناع — identity only
        mintDim:"#159C88",
        chili:  "#FF4D79",   // team الفلفل — identity only
        chiliDim:"#C22F55",
        plus:   "#4CBE7B",   // scored / go — not mint
        plusDim:"#2E9A58",
        minus:  "#E1584F",   // lost / forbidden / error — not chili
        minusDim:"#B33D36",
        tang:   "#FF9A3C",   // 15s warn — never remapped (cafe keeps the alarm)
        tangDim:"#CC6F1B",
        lemon:  "rgb(var(--c-lemon) / <alpha-value>)",
        lemonDim:"rgb(var(--c-lemon-dim) / <alpha-value>)",
        cream:  "rgb(var(--c-cream) / <alpha-value>)",
        muted:  "rgb(var(--c-muted) / <alpha-value>)",
      },
      fontFamily: {
        display: ['"Baloo Bhaijaan 2"', "system-ui", "sans-serif"],
        body:    ['"Tajawal"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
