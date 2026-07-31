/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        night:  "#241638",   // page
        panel:  "#33204D",
        panel2: "#3D2759",
        line:   "#4A3568",
        mint:   "#2FD6BC",   // team النعناع
        mintDim:"#159C88",
        chili:  "#FF4D79",   // team الفلفل + every "forbidden" mark
        chiliDim:"#C22F55",
        tang:   "#FF9A3C",   // heat, host actions
        tangDim:"#CC6F1B",
        lemon:  "#FFD84D",   // neutral primary
        lemonDim:"#C9A423",
        cream:  "#FFF6E9",   // the card stock
        muted:  "#A99BC4",
      },
      fontFamily: {
        display: ['"Baloo Bhaijaan 2"', "system-ui", "sans-serif"],
        body:    ['"Tajawal"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
