/** Tailwind v3 config, compiles src/webui/styles.css for offline use. */
module.exports = {
  content: ["./src/webui/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        gold1: "#F0E6D2", gold2: "#C8AA6E", gold3: "#C8AA6E",
        gold4: "#C8983C", gold5: "#785A28", gold6: "#463714", gold7: "#32281E",
        blue1: "#CDFAFA", blue2: "#0AC8B9", blue3: "#0397AB", blue4: "#005A82",
        blue5: "#0A323C", blue6: "#091428", blue7: "#0A1428",
        grey1: "#A09B8C", grey2: "#3C3C41", grey3: "#1E2328",
        icon: "#c9bf96", iconActive: "#eee7d4",
        subText: "#9f9b8d", titleText: "#978351",
        "hextech-black": "#010A13",
      },
      fontFamily: {
        serif: ["Marcellus", "Georgia", "Cambria", "serif"],
        display: ["Cinzel", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
