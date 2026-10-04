/* ADHD (AI Driven Haptic Design) site effects.
 * 1. ASCII/binary aurora: a lava-lamp style fluid field of drifting metaballs,
 *    sampled on a character grid and drawn as 0/1 and terminal glyphs whose
 *    density and colour follow the field.
 * 2. Blade cut: dragging the pointer across the hero/background slices the lava.
 *    The fluid parts around the blade, piles up in glowing chromatic walls,
 *    a hot seam flashes down the middle and the channel then heals shut.
 * 3. Rotating 3D screenshot carousels.
 * Honours prefers-reduced-motion (renders a single still frame, no cutting,
 * carousels stay put).
 */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- ASCII aurora ---------- */
  var canvas = document.getElementById("field");
  var ctx = canvas.getContext("2d");
  var RAMP = " .:-=+*01#%@";            // low -> high density
  var BIN = "01";
  var cell = 14, cw = 8.68, cols = 0, rows = 0, dpr = 1, vw = 0, vh = 0;

  /* ---------- Themes ----------
   * Every colour the background and the page chrome use lives here, one
   * object per look. A page picks its theme with <html data-theme="...">;
   * ADHD.setTheme(name) switches live, lerping the glyph palette, the blade
   * and heat colours and the base over ~0.5 s while CSS transitions the
   * page's custom properties (registered with @property in style.css).
   *   stops   glyph palette, low density -> hot binary core
   *   base    canvas background
   *   wallA/B chromatic tint on the two walls of a cut (left / right of the blade)
   *   heat    colour the seam cools through; core: white-hot seam, wall flare, blade core
   *   glow    soft halo under the blade; tip: blade tip gradient (inner -> outer)
   *   gain    optional glyph opacity multiplier (default 1) for bright palettes
   *   ui      CSS custom properties for the page (see :root in style.css)
   * Gallery themes (ukiyoe ... gold) are tuned from each design's sampled
   * palette, pushed dark-friendly so the glyphs stay clean on a dark base.
   */
  var THEMES = {
    home: {
      base: "#05060a",
      stops: [[0, "#140a3c"], [0.30, "#6e46ff"], [0.55, "#3ef2e0"], [0.78, "#ff3fb4"], [1, "#ffbe5a"]],
      wallA: "#3ef2e0", wallB: "#ff3fb4", heat: "#5af5eb", core: "#ffffff", glow: "#6e46ff",
      tip: ["#befff8", "#3ef2e0", "#6e46ff"],
      ui: {
        bg: "#05060a", ink: "#e8f0ff", dim: "#8a93a8", text2: "#c9d2e6", text3: "#b4bccd",
        accent: "#3ef2e0", glow: "#9b6bff", hot: "#ff3fb4", warm: "#ffb547",
        glass: "rgba(14,16,26,0.42)", line: "rgba(255,255,255,0.12)",
        frameA: "#2b2f3d", frameB: "#0b0c12", stroke: "rgba(255,255,255,0.85)", shadow: "#000000"
      }
    },
    // Brain Kata: ukiyo-e woodblock. Indigo night, Prussian waves, washi cream,
    // a vermilion sun and the gold of the brain mascot; ink outlines, not neon.
    brainKata: {
      base: "#070a18",
      stops: [[0, "#0d1434"], [0.3, "#2a4aa8"], [0.52, "#46a6dc"], [0.68, "#f3e6c8"], [0.84, "#ec5434"], [1, "#f2b23a"]],
      wallA: "#f3e6c8", wallB: "#ee5a36", heat: "#f2b440", core: "#fff6e2", glow: "#e8553a",
      tip: ["#fff1d0", "#f2b440", "#e8553a"],
      ui: {
        bg: "#070a18", ink: "#f5ecd8", dim: "#9ea3c0", text2: "#ddd6c4", text3: "#c8c2b0",
        accent: "#f2b440", glow: "#4f74d8", hot: "#f57a56", warm: "#f3e1b8",
        glass: "rgba(16,22,52,0.5)", line: "rgba(243,230,200,0.16)",
        frameA: "#2a3156", frameB: "#0b0f24", stroke: "#fff4dc", shadow: "#0a0e26"
      }
    },
    // Gate Relay: festival colour on deep ink (docs/ART_DIRECTION.md).
    gateRelay: {
      base: "#0d0a18",
      stops: [[0, "#241a4a"], [0.3, "#8b5cf6"], [0.5, "#ff7ab6"], [0.66, "#f2542d"], [0.8, "#ffc933"], [0.9, "#2fd68f"], [1, "#3fc1ff"]],
      wallA: "#3fc1ff", wallB: "#ff7ab6", heat: "#ffc933", core: "#fff4dc", glow: "#8b5cf6",
      tip: ["#fff4dc", "#ffc933", "#f2542d"],
      ui: {
        bg: "#0d0a18", ink: "#fff4dc", dim: "#a99fc4", text2: "#e6dccb", text3: "#cfc4b8",
        accent: "#3fc1ff", glow: "#8b5cf6", hot: "#ff7ab6", warm: "#ffc933",
        glass: "rgba(20,15,36,0.52)", line: "rgba(255,244,220,0.15)",
        frameA: "#2c2448", frameB: "#140f24", stroke: "#fff4dc", shadow: "#140f24"
      }
    },
    // Gallery at rest: a quiet moonlit steel, so each design's colour lands hard.
    gallery: {
      base: "#06070d",
      stops: [[0, "#0e1020"], [0.3, "#2c3562"], [0.58, "#5a6c9e"], [0.82, "#8e9cc8"], [1, "#c4c4ec"]], gain: 0.72,
      wallA: "#9fd8ff", wallB: "#cdb8ff", heat: "#bfe6ff", core: "#ffffff", glow: "#6f7fd0",
      tip: ["#eef4ff", "#9fd8ff", "#6f7fd0"],
      ui: {
        bg: "#06070d", ink: "#eef1fb", dim: "#959cb4", text2: "#cdd3e4", text3: "#b8bfd2",
        accent: "#9fd8ff", glow: "#8a90e0", hot: "#cdb8ff", warm: "#e9d6a8",
        glass: "rgba(12,14,24,0.6)", line: "rgba(255,255,255,0.12)",
        frameA: "#2a2e3c", frameB: "#0b0c12", stroke: "rgba(255,255,255,0.85)", shadow: "#000000"
      }
    },
    // Ukiyo-e Drift: Prussian blue waves, washi paper, a vermilion hanko stamp.
    ukiyoe: {
      base: "#010814",
      stops: [[0, "#001030"], [0.32, "#0f3a72"], [0.58, "#2a6cb0"], [0.8, "#7fa6d0"], [0.93, "#eadcc0"], [1, "#e0603f"]],
      wallA: "#eadcc0", wallB: "#d8583c", heat: "#f0b8a0", core: "#fff7ea", glow: "#1f5a9e",
      tip: ["#fff3e0", "#eadcc0", "#2f6aa8"],
      ui: {
        bg: "#010814", ink: "#f4ead6", dim: "#97a6bf", accent: "#eadcc0", glow: "#3d78c0", hot: "#e8664a", warm: "#e8c9a8",
        glass: "rgba(0,18,40,0.62)", line: "rgba(234,220,192,0.18)", frameA: "#1d3354", frameB: "#001030", stroke: "#f4ead6", shadow: "#001030"
      }
    },
    // Sumi Silence: ink greys and warm white, one red seal (only in the hottest cores and the cut).
    sumi: {
      base: "#080807",
      stops: [[0, "#151514"], [0.3, "#3c3b39"], [0.6, "#8d8a85"], [0.86, "#e6e0d6"], [0.95, "#f2ede4"], [1, "#c8322a"]],
      wallA: "#efe9df", wallB: "#c8322a", heat: "#d24a3a", core: "#fffaf2", glow: "#5a5856",
      tip: ["#fffaf2", "#c8c2b8", "#c8322a"],
      ui: {
        bg: "#080807", ink: "#f2ede4", dim: "#a19c94", accent: "#e8e2d8", glow: "#77736d", hot: "#ef6a5a", warm: "#d9cdb8",
        glass: "rgba(14,14,13,0.66)", line: "rgba(242,237,228,0.16)", frameA: "#2e2d2b", frameB: "#0c0c0b", stroke: "#f2ede4", shadow: "#000000"
      }
    },
    // Nihonga Gild: gold leaf glowing behind malachite and ultramarine.
    nihonga: {
      base: "#0a0905",
      stops: [[0, "#141a2e"], [0.26, "#2a46a0"], [0.48, "#2e9c74"], [0.7, "#d4a650"], [0.88, "#e8c88a"], [1, "#f4ead0"]],
      wallA: "#3fb98a", wallB: "#4a68d0", heat: "#e8c080", core: "#fff8e6", glow: "#d4a650",
      tip: ["#fff8e6", "#e8c88a", "#2e9c74"],
      ui: {
        bg: "#0a0905", ink: "#f6eedb", dim: "#ada386", accent: "#e8c88a", glow: "#3fb98a", hot: "#93a8f2", warm: "#e0c090",
        glass: "rgba(18,16,8,0.64)", line: "rgba(224,192,144,0.2)", frameA: "#3a3220", frameB: "#100e06", stroke: "#f4e6c4", shadow: "#0a0905"
      }
    },
    // Origami Fold: crisp pastel paper facets (pink, sky, mint, cream) on a dusk navy.
    origami: {
      base: "#0b0d1a",
      stops: [[0, "#1a1c34"], [0.28, "#7f96c8"], [0.5, "#a6dcc4"], [0.72, "#f0a090"], [0.88, "#f6c4b0"], [1, "#fbeedd"]],
      wallA: "#a0c8f0", wallB: "#f5a8b8", heat: "#fbe0c8", core: "#ffffff", glow: "#a0b0d0",
      tip: ["#ffffff", "#f6c4b0", "#a0b0d0"],
      ui: {
        bg: "#0b0d1a", ink: "#fbf3e8", dim: "#a9aec8", accent: "#a6dcc4", glow: "#a0b0e8", hot: "#f5a8b8", warm: "#f0c8a0",
        glass: "rgba(18,20,38,0.6)", line: "rgba(251,238,221,0.18)", frameA: "#2e3150", frameB: "#10121f", stroke: "#fbeedd", shadow: "#0b0d1a"
      }
    },
    // Obsidian Mirror: black volcanic glass, fine bronze-gold inlay, deep jade.
    obsidian: {
      base: "#030404",
      stops: [[0, "#0a0f0e"], [0.3, "#0f4a3a"], [0.55, "#1f7a5e"], [0.76, "#806040"], [0.9, "#b89466"], [1, "#e0c090"]],
      wallA: "#2fae84", wallB: "#e0c090", heat: "#c8a070", core: "#fff4dc", glow: "#14604a",
      tip: ["#fff4dc", "#e0c090", "#14604a"],
      ui: {
        bg: "#030404", ink: "#efe6d4", dim: "#94968c", accent: "#e0c090", glow: "#2fae84", hot: "#5fd0a8", warm: "#c8a070",
        glass: "rgba(6,8,8,0.68)", line: "rgba(224,192,144,0.18)", frameA: "#1d2321", frameB: "#050606", stroke: "#e0c090", shadow: "#000000"
      }
    },
    // Loom & Thread: cochineal red and indigo threads, terracotta, cream.
    textile: {
      base: "#0c0710",
      stops: [[0, "#1c1236"], [0.26, "#30348e"], [0.48, "#903020"], [0.66, "#c8582e"], [0.84, "#c0a080"], [1, "#efe2c4"]],
      wallA: "#efe2c4", wallB: "#c8402a", heat: "#e0884e", core: "#fff4e4", glow: "#903020",
      tip: ["#fff4e4", "#e0884e", "#30348e"],
      ui: {
        bg: "#0c0710", ink: "#f6ecda", dim: "#ab9f9a", accent: "#efc89a", glow: "#5a60c8", hot: "#f27e5e", warm: "#d8b890",
        glass: "rgba(22,12,24,0.62)", line: "rgba(239,226,196,0.18)", frameA: "#38243a", frameB: "#120a14", stroke: "#efe2c4", shadow: "#0c0710"
      }
    },
    // Lost-Wax Gold: warm cast metal chased over charcoal.
    gold: {
      base: "#090706",
      stops: [[0, "#18120c"], [0.3, "#705030"], [0.52, "#907040"], [0.72, "#d0a060"], [0.88, "#f0d090"], [1, "#fff2cc"]],
      wallA: "#f0d090", wallB: "#e0a050", heat: "#ffd27a", core: "#fffaea", glow: "#b07a30",
      tip: ["#fffaea", "#f0d090", "#b07a30"],
      ui: {
        bg: "#090706", ink: "#f8eed8", dim: "#aa9c84", accent: "#f0c870", glow: "#c08a40", hot: "#ffb04a", warm: "#e0b070",
        glass: "rgba(16,12,8,0.64)", line: "rgba(240,208,144,0.2)", frameA: "#3a2e1e", frameB: "#100c08", stroke: "#f0d090", shadow: "#000000"
      }
    },
    // Neon Rain: midnight blue, electric purple, neon magenta, signage red.
    neon: {
      base: "#070414",
      stops: [[0, "#120a2e"], [0.28, "#3a1a8a"], [0.5, "#8a2be2"], [0.7, "#ff2fa8"], [0.86, "#ff4a5a"], [1, "#ffd6f2"]],
      wallA: "#39d0ff", wallB: "#ff2fa8", heat: "#ff6ad0", core: "#fff0fb", glow: "#8a2be2",
      tip: ["#ffe0f6", "#ff2fa8", "#3a1a8a"],
      ui: {
        bg: "#070414", ink: "#f6eefe", dim: "#a89cc8", accent: "#ff6ad0", glow: "#9b5cff", hot: "#39d0ff", warm: "#ff7a86",
        glass: "rgba(14,8,32,0.62)", line: "rgba(255,106,208,0.2)", frameA: "#2a1a4a", frameB: "#0c0618", stroke: "#ffd6f2", shadow: "#000000"
      }
    },
    // Raked Sand: warm grey stone and raked sand, charcoal lines, nothing loud.
    zen: {
      base: "#0b0a09",
      stops: [[0, "#16140f"], [0.3, "#3e3a34"], [0.56, "#7a746a"], [0.8, "#bcb09a"], [1, "#ece4d2"]], gain: 0.85,
      wallA: "#e4dac6", wallB: "#8a8378", heat: "#d8ccb4", core: "#fffaf0", glow: "#5a554e",
      tip: ["#fffaf0", "#d8ccb4", "#5a554e"],
      ui: {
        bg: "#0b0a09", ink: "#f2ece0", dim: "#a39c90", accent: "#ddd0b6", glow: "#9a9286", hot: "#d4bc94", warm: "#cdbfa4",
        glass: "rgba(16,15,13,0.64)", line: "rgba(236,228,210,0.16)", frameA: "#2e2b27", frameB: "#0e0d0b", stroke: "#ece4d2", shadow: "#000000"
      }
    },
    // Lantern Light: indigo night, lantern amber, vermilion and paper cream.
    matsuri: {
      base: "#070818",
      stops: [[0, "#10123a"], [0.28, "#2a2f78"], [0.5, "#c8402a"], [0.68, "#f09a30"], [0.86, "#ffd27a"], [1, "#fff0d0"]],
      wallA: "#ffb347", wallB: "#e8452c", heat: "#ffcf70", core: "#fff6e4", glow: "#c8402a",
      tip: ["#fff3d8", "#ffb347", "#2a2f78"],
      ui: {
        bg: "#070818", ink: "#fff2dc", dim: "#a8a6c4", accent: "#ffbe5a", glow: "#5a64c8", hot: "#ff8e6e", warm: "#ffd890",
        glass: "rgba(14,16,44,0.6)", line: "rgba(255,190,90,0.2)", frameA: "#2a2c5a", frameB: "#0c0d26", stroke: "#fff0d0", shadow: "#000000"
      }
    },
    // Ink & Thunder: ink black, paper white, screentone grey, one accent red.
    manga: {
      base: "#050505",
      stops: [[0, "#141414"], [0.3, "#3e3e3e"], [0.56, "#8e8e8e"], [0.84, "#f2f0ea"], [0.95, "#ffffff"], [1, "#e02424"]],
      wallA: "#ffffff", wallB: "#e02424", heat: "#ff5050", core: "#ffffff", glow: "#3e3e3e",
      tip: ["#ffffff", "#bdbdbd", "#e02424"],
      ui: {
        bg: "#050505", ink: "#f6f4ee", dim: "#a3a3a3", accent: "#f2f0ea", glow: "#8a8a8a", hot: "#ff5a5a", warm: "#e6e2d8",
        glass: "rgba(10,10,10,0.68)", line: "rgba(255,255,255,0.16)", frameA: "#2c2c2c", frameB: "#0a0a0a", stroke: "#ffffff", shadow: "#000000"
      }
    },
    // Clay & Ash: fired clay, ash grey, earth brown, warm beige.
    wabi: {
      base: "#0b0806",
      stops: [[0, "#1a120c"], [0.3, "#4e3624"], [0.54, "#906040"], [0.76, "#b09080"], [1, "#ddcdb6"]], gain: 0.9,
      wallA: "#d8c4a8", wallB: "#a8683e", heat: "#d4a880", core: "#fff6ea", glow: "#6a4630",
      tip: ["#fff6ea", "#d4a880", "#6a4630"],
      ui: {
        bg: "#0b0806", ink: "#f4ebde", dim: "#a89a8c", accent: "#dcbc96", glow: "#b08a6a", hot: "#e8a070", warm: "#d6bea0",
        glass: "rgba(20,14,10,0.64)", line: "rgba(221,205,182,0.18)", frameA: "#38281e", frameB: "#100b08", stroke: "#ddcdb6", shadow: "#000000"
      }
    },
    // Superflat Pop: hot pink, sunshine yellow, sky blue, cherry red, all at full volume.
    superflat: {
      base: "#0c0618",
      stops: [[0, "#24104a"], [0.26, "#30b0d0"], [0.46, "#f060a0"], [0.64, "#ffd23c"], [0.82, "#f07020"], [1, "#fff2fa"]],
      wallA: "#30c8f0", wallB: "#ffd23c", heat: "#ff8ac0", core: "#ffffff", glow: "#f060a0",
      tip: ["#fff2fa", "#ffd23c", "#f060a0"],
      ui: {
        bg: "#0c0618", ink: "#fff6fb", dim: "#b4a6cc", accent: "#ffd23c", glow: "#30c8f0", hot: "#ff78b8", warm: "#ff9a50",
        glass: "rgba(22,10,42,0.62)", line: "rgba(255,210,60,0.22)", frameA: "#34205a", frameB: "#120a24", stroke: "#fff2fa", shadow: "#000000"
      }
    },
    // Fifth Sun: carved basalt and ritual gold, calendar-precise.
    sunstone: {
      base: "#080706",
      stops: [[0, "#141210"], [0.3, "#3c3832"], [0.52, "#706040"], [0.72, "#a09070"], [0.88, "#d8b860"], [1, "#f0dca0"]],
      wallA: "#e0c070", wallB: "#a09070", heat: "#f0d080", core: "#fff8e4", glow: "#706040",
      tip: ["#fff8e4", "#e0c070", "#3c3832"],
      ui: {
        bg: "#080706", ink: "#f4ecda", dim: "#a69e8e", accent: "#e6c674", glow: "#a8986e", hot: "#f0b450", warm: "#d8c08a",
        glass: "rgba(16,14,12,0.66)", line: "rgba(224,192,112,0.18)", frameA: "#34302a", frameB: "#0e0c0a", stroke: "#f0dca0", shadow: "#000000"
      }
    },
    // Painted Book: amate bark tan, terracotta, carbon black and cochineal red.
    codex: {
      base: "#0d0806",
      stops: [[0, "#1e120c"], [0.28, "#6a2a1a"], [0.48, "#b8203a"], [0.64, "#c8582e"], [0.82, "#d0a080"], [1, "#f2dec2"]],
      wallA: "#e8c8a4", wallB: "#c8302a", heat: "#e8905a", core: "#fff4e6", glow: "#6a2a1a",
      tip: ["#fff4e6", "#e8905a", "#6a2a1a"],
      ui: {
        bg: "#0d0806", ink: "#f6ecde", dim: "#ac9c90", accent: "#ecc8a0", glow: "#c86a4a", hot: "#f27a62", warm: "#e0b890",
        glass: "rgba(24,14,10,0.64)", line: "rgba(242,222,194,0.18)", frameA: "#3a241a", frameB: "#120a08", stroke: "#f2dec2", shadow: "#000000"
      }
    },
    // Stone Ascent: pyramid stone at dusk, amber light, shadow brown, a sky on fire.
    temple: {
      base: "#0b0705",
      stops: [[0, "#1a100a"], [0.28, "#4a2c18"], [0.48, "#804020"], [0.66, "#c07030"], [0.84, "#f0a030"], [1, "#ffdc96"]],
      wallA: "#f0a030", wallB: "#b4b0aa", heat: "#ffc060", core: "#fff4e0", glow: "#c07030",
      tip: ["#fff4e0", "#f0a030", "#804020"],
      ui: {
        bg: "#0b0705", ink: "#f8ecdc", dim: "#ab9c8c", accent: "#f6aa40", glow: "#c87a40", hot: "#ff8c50", warm: "#e8c08a",
        glass: "rgba(22,14,10,0.64)", line: "rgba(240,160,48,0.2)", frameA: "#3a2618", frameB: "#120b07", stroke: "#ffdc96", shadow: "#000000"
      }
    },
    // Plume Song: iridescent quetzal greens and teals, deep blue, a flash of sun gold.
    quetzal: {
      base: "#030a0a",
      stops: [[0, "#06181a"], [0.28, "#1a4a8a"], [0.48, "#209080"], [0.68, "#40d0a8"], [0.86, "#8ee8d0"], [1, "#f0d060"]],
      wallA: "#40d0a8", wallB: "#f0d060", heat: "#8ee8d0", core: "#f4fff8", glow: "#1a4a8a",
      tip: ["#f4fff8", "#40d0a8", "#1a4a8a"],
      ui: {
        bg: "#030a0a", ink: "#eef8f2", dim: "#92aaa4", accent: "#5ee0b8", glow: "#4a80d8", hot: "#f0d060", warm: "#b8e0c8",
        glass: "rgba(6,20,22,0.62)", line: "rgba(94,224,184,0.2)", frameA: "#173434", frameB: "#061212", stroke: "#c8f4e4", shadow: "#000000"
      }
    },
    // Wall of Memory: muralist terracotta, ochre, turquoise and crimson.
    mural: {
      base: "#0c0606",
      stops: [[0, "#1e0c0c"], [0.26, "#901010"], [0.46, "#c05030"], [0.64, "#e0a040"], [0.82, "#30b0b0"], [1, "#e8f2e4"]],
      wallA: "#30c4c4", wallB: "#e0a040", heat: "#f07050", core: "#fff6ec", glow: "#901010",
      tip: ["#fff6ec", "#e0a040", "#901010"],
      ui: {
        bg: "#0c0606", ink: "#f8eee4", dim: "#ae9e98", accent: "#48cccc", glow: "#d0603a", hot: "#f88c70", warm: "#e8b860",
        glass: "rgba(24,12,12,0.62)", line: "rgba(72,204,204,0.2)", frameA: "#3a2020", frameB: "#120808", stroke: "#f2e2cc", shadow: "#000000"
      }
    },
    // Green Ruin: deep jungle, moss on stone, morning mist.
    jungle: {
      base: "#030a04",
      stops: [[0, "#06160a"], [0.28, "#0a3a14"], [0.5, "#3a6a2a"], [0.7, "#909040"], [0.86, "#d0c060"], [1, "#e8ecd8"]],
      wallA: "#a8c8a0", wallB: "#d0c060", heat: "#e0d888", core: "#f6f8ec", glow: "#2a5a22",
      tip: ["#f6f8ec", "#d0c060", "#0a3a14"],
      ui: {
        bg: "#030a04", ink: "#eef2e4", dim: "#98a690", accent: "#cad474", glow: "#5a9a4a", hot: "#e2cc64", warm: "#b8c8a0",
        glass: "rgba(6,18,8,0.64)", line: "rgba(208,192,96,0.18)", frameA: "#1c3020", frameB: "#081008", stroke: "#e8ecd8", shadow: "#000000"
      }
    },
    // Concrete Glyph: board-formed concrete, ochre, glyph black, clay.
    mexica: {
      base: "#080807",
      stops: [[0, "#141413"], [0.3, "#3a3836"], [0.54, "#7a7570"], [0.72, "#a08060"], [0.88, "#e0c0a0"], [1, "#f4e4cc"]],
      wallA: "#e0a050", wallB: "#c8c4bc", heat: "#e8b878", core: "#fff8ee", glow: "#5a5650",
      tip: ["#fff8ee", "#e0a050", "#3a3836"],
      ui: {
        bg: "#080807", ink: "#f2ece2", dim: "#a29c94", accent: "#e6b474", glow: "#9a948c", hot: "#ee9c64", warm: "#d8c0a0",
        glass: "rgba(16,16,15,0.66)", line: "rgba(224,192,160,0.18)", frameA: "#302e2b", frameB: "#0c0c0b", stroke: "#f4e4cc", shadow: "#000000"
      }
    }
  };

  function hexRgb(s) { var n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  // The palette is sampled ~10k times a frame. Precompute each theme's table
  // (and its CSS strings) once so the hot loop does no colour maths or string
  // building; alpha goes through globalAlpha instead of an rgba() string per glyph.
  var PAL_N = 1024;
  function buildPalette(stops) {
    var pal = new Uint8Array(PAL_N * 3), cssTab = new Array(PAL_N);
    for (var p = 0; p < PAL_N; p++) {
      var tv = p / (PAL_N - 1), c = hexRgb(stops[stops.length - 1][1]);
      for (var i = 1; i < stops.length; i++) {
        if (tv <= stops[i][0]) {
          var a = hexRgb(stops[i - 1][1]), b = hexRgb(stops[i][1]);
          var k = (tv - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
          c = [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
          break;
        }
      }
      pal[p * 3] = c[0]; pal[p * 3 + 1] = c[1]; pal[p * 3 + 2] = c[2];
      cssTab[p] = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
    }
    return { pal: pal, css: cssTab };
  }
  // Glyphs touched by the blade (and every glyph mid-transition) get tinted
  // off-palette; cache those strings (5 bits per channel), filled lazily and
  // bounded, so steady state and repeated theme changes allocate nothing.
  var mixCss = new Array(32768);
  function css(r, g, b) {
    var k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    return mixCss[k] || (mixCss[k] = "rgb(" + (r & 248) + "," + (g & 248) + "," + (b & 248) + ")");
  }

  // Named single colours, in this order, as flat rgb triples per theme
  var C_BASE = 0, C_WALLA = 1, C_WALLB = 2, C_HEAT = 3, C_CORE = 4, C_GLOW = 5, NC = 6;
  var COL_KEYS = ["base", "wallA", "wallB", "heat", "core", "glow"];
  function prepare(th) {
    if (th.pal) return th;
    var built = buildPalette(th.stops);
    th.pal = built.pal; th.palCss = built.css;
    th.col = new Float32Array(NC * 3); th.colStr = [];
    for (var i = 0; i < NC; i++) {
      var c = hexRgb(th[COL_KEYS[i]]);
      th.col[i * 3] = c[0]; th.col[i * 3 + 1] = c[1]; th.col[i * 3 + 2] = c[2];
      th.colStr.push(th[COL_KEYS[i]]);
    }
    return th;
  }

  // Live state: what is on screen now. During a transition these are refilled
  // in place each frame from the from/to snapshots (no allocation).
  var palR = new Uint8Array(PAL_N), palG = new Uint8Array(PAL_N), palB = new Uint8Array(PAL_N);
  var palCss = new Array(PAL_N);
  var col = new Float32Array(NC * 3), colStr = new Array(NC);
  var fromPal = new Float32Array(PAL_N * 3), fromCol = new Float32Array(NC * 3);
  var gain = 1, fromGain = 1;
  var themeName = "", theme = null, fromTheme = null, mixK = 1;
  var tStart = 0, tDur = 0, transitioning = false;

  function settle(th) {
    for (var p = 0; p < PAL_N; p++) {
      palR[p] = th.pal[p * 3]; palG[p] = th.pal[p * 3 + 1]; palB[p] = th.pal[p * 3 + 2];
      palCss[p] = th.palCss[p];
    }
    for (var i = 0; i < NC * 3; i++) col[i] = th.col[i];
    gain = th.gain || 1;
    for (i = 0; i < NC; i++) colStr[i] = th.colStr[i];
    transitioning = false; mixK = 1;
  }

  function stepTheme(now) {
    if (!transitioning) return;
    var k = (now - tStart) / tDur;
    if (k >= 1) { settle(theme); return; }
    if (k < 0) k = 0;
    var e = k * k * (3 - 2 * k), to = theme.pal, tc = theme.col;
    mixK = e;
    for (var p = 0, q = 0; p < PAL_N; p++, q += 3) {
      var r = fromPal[q] + (to[q] - fromPal[q]) * e;
      var g = fromPal[q + 1] + (to[q + 1] - fromPal[q + 1]) * e;
      var b = fromPal[q + 2] + (to[q + 2] - fromPal[q + 2]) * e;
      palR[p] = r; palG[p] = g; palB[p] = b;
      palCss[p] = css(r | 0, g | 0, b | 0);
    }
    for (var i = 0; i < NC * 3; i++) col[i] = fromCol[i] + (tc[i] - fromCol[i]) * e;
    gain = fromGain + ((theme.gain || 1) - fromGain) * e;
    for (i = 0; i < NC; i++) colStr[i] = css(col[i * 3] | 0, col[i * 3 + 1] | 0, col[i * 3 + 2] | 0);
  }

  // Page chrome: write the theme's custom properties on <html>. CSS
  // transitions them (registered as <color>), so the page and the lava move together.
  var root = document.documentElement;
  function mixHex(a, b, k) {
    var x = hexRgb(a), y = hexRgb(b);
    return "rgb(" + Math.round(x[0] + (y[0] - x[0]) * k) + "," + Math.round(x[1] + (y[1] - x[1]) * k) + "," + Math.round(x[2] + (y[2] - x[2]) * k) + ")";
  }
  function applyUi(th) {
    var ui = th.ui;
    if (!ui.text2) ui.text2 = mixHex(ui.ink, ui.dim, 0.3);
    if (!ui.text3) ui.text3 = mixHex(ui.ink, ui.dim, 0.5);
    for (var key in ui) if (ui.hasOwnProperty(key)) root.style.setProperty("--" + key, ui[key]);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", ui.bg);
  }

  function setTheme(name, instant) {
    var th = THEMES[name];
    if (!th || name === themeName) return;
    prepare(th);
    if (instant || !theme) {
      root.classList.add("theme-instant");
      theme = th; fromTheme = th; themeName = name;
      settle(th); applyUi(th);
      void root.offsetWidth;   // commit the instant values before re-enabling transitions
      root.classList.remove("theme-instant");
      if (reduce && started) requestAnimationFrame(frame);
      return;
    }
    // start from whatever is on screen right now, even mid-transition
    for (var p = 0, q = 0; p < PAL_N; p++, q += 3) { fromPal[q] = palR[p]; fromPal[q + 1] = palG[p]; fromPal[q + 2] = palB[p]; }
    for (var i = 0; i < NC * 3; i++) fromCol[i] = col[i];
    fromGain = gain;
    fromTheme = mixK < 0.5 && fromTheme ? fromTheme : theme;
    theme = th; themeName = name;
    tStart = performance.now(); tDur = reduce ? 220 : 520; transitioning = true; mixK = 0;
    applyUi(th);
    // a still (reduced-motion) field only renders while it cross-fades
    if (reduce && !looping) { looping = true; requestAnimationFrame(frame); }
  }
  var started = false, looping = false;
  window.ADHD = {
    themes: THEMES,
    setTheme: function (name) { setTheme(name, false); },
    theme: function () { return themeName; },
    // More themes from data (the gallery's generated ones). A theme already in
    // THEMES (hand-tuned) wins; tables are built lazily on first use.
    addThemes: function (map) {
      for (var k in map) if (map.hasOwnProperty(k) && !THEMES[k]) THEMES[k] = map[k];
    }
  };
  setTheme(THEMES[root.getAttribute("data-theme")] ? root.getAttribute("data-theme") : "home", true);

  // Lava-lamp blobs moving on slow Lissajous paths. ox/oy/vx/vy is a spring
  // offset: the blade can shove a blob, which then wobbles back onto its path.
  var blobs = [];
  for (var b = 0; b < 7; b++) {
    blobs.push({
      ax: 0.25 + Math.random() * 0.25, ay: 0.25 + Math.random() * 0.25,
      fx: 0.05 + Math.random() * 0.09, fy: 0.04 + Math.random() * 0.08,
      px: Math.random() * 6.28, py: Math.random() * 6.28,
      r: 0.16 + Math.random() * 0.14, hue: Math.random(),
      ox: 0, oy: 0, vx: 0, vy: 0
    });
  }
  var NB = blobs.length;
  var cx = new Float64Array(NB), cy = new Float64Array(NB), rr = new Float64Array(NB), hh = new Float64Array(NB);

  /* ---------- Cut state ----------
   * One value per character cell, so the effect costs the same as the grid
   * and only cells inside the dirty box [bx0..bx1]x[by0..by1] are touched.
   *   carve  depth of the cut (can exceed 1: deep cuts take longer to heal). The
   *          channel is open wherever carve > OPEN, so as carve decays the open
   *          region narrows and the walls slide inward: the fluid closing over it
   *   rim    energy of the wake; lights the walls along the channel edge
   *   side   which wall a cell sits on (-1 left / +1 right of the blade) -> chromatic tint
   *   heat   the white-hot seam right behind the blade
   *   dX,dY  how far the fluid at this cell has been pushed (px), sprung by vX,vY
   */
  var carve, rim, side, heat, dX, dY, vX, vY;
  var bx0 = 1, by0 = 1, bx1 = 0, by1 = 0;   // empty box
  var bladeScale = 1;
  function boxEmpty() { return bx0 > bx1; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    vw = w; vh = h;
    cell = w < 700 ? 11 : 14;
    cw = cell * 0.62;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / cw);
    rows = Math.ceil(h / cell);
    ctx.font = "600 " + cell + "px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";
    // a finger on a phone shouldn't carve a quarter of the screen away
    bladeScale = Math.max(0.65, Math.min(1, w / 1100));
    var n = cols * rows;
    carve = new Float32Array(n); rim = new Float32Array(n); side = new Float32Array(n);
    heat = new Float32Array(n);
    dX = new Float32Array(n); dY = new Float32Array(n); vX = new Float32Array(n); vY = new Float32Array(n);
    bx0 = by0 = 1; bx1 = by1 = 0;
  }

  /* ---------- Pointer trail ----------
   * A fixed ring of the last 40 pointer samples with timestamps. Input
   * handlers only record; the frame loop carves the new segments, so all
   * buffer writes happen in one place, once per frame.
   */
  var TRAIL = 40;
  var trX = new Float32Array(TRAIL), trY = new Float32Array(TRAIL), trT = new Float64Array(TRAIL);
  var trS = new Float32Array(TRAIL);      // smoothed speed at this sample (px/s)
  var trP = new Uint8Array(TRAIL);        // 1 = pressed (mouse button / touch)
  var trBrk = new Uint8Array(TRAIL);      // 1 = first point of a new stroke
  var trHead = -1, trLen = 0, trPending = 0;
  var stroke = false, lastSpeed = 0, lastMoveT = 0;

  function addPoint(x, y, pressed) {
    var now = performance.now();
    // a pause or a jump across a panel starts a fresh stroke, never a bridging line
    var brk = !stroke || now - lastMoveT > 120;
    var spd = 0;
    if (!brk) {
      var dx = x - trX[trHead], dy = y - trY[trHead];
      var inst = Math.sqrt(dx * dx + dy * dy) / Math.max(0.008, (now - trT[trHead]) / 1000);
      spd = lastSpeed * 0.55 + inst * 0.45;   // tame single-event spikes
      if (dx * dx + dy * dy < 1) { lastMoveT = now; return; }   // sub-pixel jitter
    }
    trHead = (trHead + 1) % TRAIL;
    trX[trHead] = x; trY[trHead] = y; trT[trHead] = now;
    trS[trHead] = spd; trP[trHead] = pressed ? 1 : 0; trBrk[trHead] = brk ? 1 : 0;
    if (trLen < TRAIL) trLen++;
    if (trPending < TRAIL - 1) trPending++;
    lastSpeed = spd; lastMoveT = now; stroke = true;
  }
  function endStroke() { stroke = false; lastSpeed = 0; }

  // Stamp one blade segment a->b into the cell buffers.
  function carveSegment(ax, ay, bx, by, speed, pressed) {
    var sx = bx - ax, sy = by - ay;
    var len = Math.sqrt(sx * sx + sy * sy);
    if (len < 0.01) return;
    var ux = sx / len, uy = sy / len;
    var s = Math.min(1, speed / 1600);                 // 0 = drifting, 1 = slash
    // channel half-width (px) and depth: faster and pressed cut wider/deeper/longer
    var R = (pressed ? 22 + 26 * s : 12 + 18 * s) * bladeScale;
    var depth = pressed ? 1.5 + 1.3 * s : 0.5 + 1.3 * s;
    var heatAmt = Math.min(1.2, 0.3 + 1.0 * s + (pressed ? 0.25 : 0));
    var rimAmt = (pressed ? 0.95 : 0.55) + 0.6 * s;
    var push = R * (0.8 + 0.9 * s);                    // how far the walls are shoved out
    var drag = R * 0.9 * s;                            // fluid dragged along with the blade
    var reach = R * 2.1;
    var invR = 1 / R, invL = 1 / len;
    var invSeam = 1 / Math.max(cw * 0.8, R * 0.24);

    var x0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / cw));
    var x1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx) + reach) / cw));
    var y0 = Math.max(0, Math.floor((Math.min(ay, by) - reach) / cell));
    var y1 = Math.min(rows - 1, Math.ceil((Math.max(ay, by) + reach) / cell));
    if (x0 > x1 || y0 > y1) return;

    for (var y = y0; y <= y1; y++) {
      var py = (y + 0.5) * cell;
      for (var x = x0; x <= x1; x++) {
        var px = (x + 0.5) * cw;
        var t = ((px - ax) * ux + (py - ay) * uy) * invL;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var ddx = px - (ax + sx * t), ddy = py - (ay + sy * t);
        var d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d > reach) continue;
        var i = y * cols + x;
        var r = d * invR, r2 = r * r;

        // cut profile: gaussian across the blade. Thresholded at render time,
        // so its decay reads as the walls closing in, not as a fog filling up
        var g = Math.exp(-r2) * depth;
        if (g > carve[i]) carve[i] = g;

        // wake energy over the whole disturbed area
        var wv = Math.exp(-r2 * 0.15) * rimAmt;
        if (wv > rim[i]) {
          rim[i] = wv;
          // which side of the blade: drives the cyan / magenta chromatic split
          side[i] = d > 0.5 ? (ux * ddy - uy * ddx) / d : 0;
        }

        // seam: a line of heat right where the edge passed, never thinner than
        // a glyph so it reads as one continuous filament instead of dots
        var hq = d * invSeam;
        var hv = Math.exp(-hq * hq) * heatAmt;
        if (hv > heat[i]) heat[i] = hv;

        // displacement: outward from the blade, peaking at the wall, plus a
        // drag along the stroke. Blend toward it so repeated stamps don't pile up.
        var nX = d > 0.5 ? ddx / d : -uy, nY = d > 0.5 ? ddy / d : ux;
        var out = push * r * Math.exp(0.5 * (1 - r2));
        var along = drag * Math.exp(-r2);
        var wgt = Math.exp(-r2 * 0.3);
        dX[i] += (nX * out + ux * along - dX[i]) * wgt;
        dY[i] += (nY * out + uy * along - dY[i]) * wgt;
        vX[i] *= 1 - wgt; vY[i] *= 1 - wgt;
      }
    }
    if (boxEmpty()) { bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; }
    else {
      if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0;
      if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
    }

    // shove nearby metaballs: along the stroke and away from the edge
    var aspectH = vh;
    for (var j = 0; j < NB; j++) {
      var bpx = cx[j] * aspectH, bpy = cy[j] * aspectH;
      var tt = ((bpx - ax) * ux + (bpy - ay) * uy) * invL;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      var ex = bpx - (ax + sx * tt), ey = bpy - (ay + sy * tt);
      var ed = Math.sqrt(ex * ex + ey * ey);
      var infl = rr[j] * aspectH * 1.4 + R;
      if (ed > infl) continue;
      var fall = 1 - ed / infl;
      fall *= fall * (pressed ? 1.7 : 1) * (0.25 + s);
      var o = blobs[j];
      var awayX = ed > 1 ? ex / ed : 0, awayY = ed > 1 ? ey / ed : 0;
      // impulse scales with distance travelled, so it's frame-rate independent
      var kick = fall * (len / aspectH) * 0.7;
      o.vx += (ux * 0.5 + awayX * 0.5) * kick;
      o.vy += (uy * 0.5 + awayY * 0.5) * kick;
    }
  }

  // Heal the cut: channel closes from its walls inward (uniform decay of a
  // flat-topped profile narrows it), heat cools fast, displaced fluid springs
  // back with a little overshoot. Also shrinks the dirty box to what's live.
  function relax(dt) {
    if (boxEmpty()) return;
    // walls stay lit a little longer than the channel takes to close
    var kc = Math.exp(-dt / 0.75), kr = Math.exp(-dt / 1.05), kh = Math.exp(-dt / 0.24);
    var K = 26, C = 6.2;                 // ~0.8 s period, underdamped: liquid wobble
    var nx0 = cols, ny0 = rows, nx1 = -1, ny1 = -1;
    for (var y = by0; y <= by1; y++) {
      var i = y * cols + bx0;
      for (var x = bx0; x <= bx1; x++, i++) {
        var c = carve[i] * kc, w = rim[i] * kr, h = heat[i] * kh;
        var ax = -K * dX[i] - C * vX[i], ay = -K * dY[i] - C * vY[i];
        var vx = vX[i] + ax * dt, vy = vY[i] + ay * dt;
        var ox = dX[i] + vx * dt, oy = dY[i] + vy * dt;
        // flush to exact zero so the idle field renders exactly as it did before
        if (c < 0.004) c = 0;
        if (w < 0.004) w = 0;
        if (h < 0.004) h = 0;
        if (ox * ox + oy * oy < 0.01 && vx * vx + vy * vy < 0.05) { ox = oy = vx = vy = 0; }
        carve[i] = c; rim[i] = w; heat[i] = h;
        dX[i] = ox; dY[i] = oy; vX[i] = vx; vY[i] = vy;
        if (c || w || h || ox || oy) {
          if (x < nx0) nx0 = x; if (x > nx1) nx1 = x;
          if (y < ny0) ny0 = y; if (y > ny1) ny1 = y;
        }
      }
    }
    if (nx1 < 0) { bx0 = by0 = 1; bx1 = by1 = 0; }
    else { bx0 = nx0; by0 = ny0; bx1 = nx1; by1 = ny1; }
  }

  // cheap per-cell hash for flicker (0..1), no allocation, no Math.random
  function hash(x, y, f) {
    var h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(f, 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) & 1023) / 1023;
  }

  var OPEN = 0.42;   // carve level at which the channel is open
  var lastMs = 0, stillT = -1;
  function frame(ms) {
    started = true;
    // reduced motion: one still frame; a theme change re-renders that same
    // instant while the colours cross-fade, so nothing moves
    if (reduce && stillT < 0) stillT = ms / 1000;
    var t = reduce ? stillT : ms / 1000;
    var dt = lastMs ? Math.min(0.05, (ms - lastMs) / 1000) : 1 / 60;
    lastMs = ms;
    stepTheme(performance.now());
    var w = vw, h = vh;
    var aspect = w / h;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = colStr[C_BASE];
    ctx.fillRect(0, 0, w, h);

    // blob centres for this frame (normalised coords), plus their sprung offsets
    var i, j;
    for (i = 0; i < NB; i++) {
      var o = blobs[i];
      if (o.vx || o.vy || o.ox || o.oy) {
        o.vx += (-3.2 * o.ox - 1.9 * o.vx) * dt;
        o.vy += (-3.2 * o.oy - 1.9 * o.vy) * dt;
        o.ox += o.vx * dt; o.oy += o.vy * dt;
        if (Math.abs(o.ox) + Math.abs(o.oy) + Math.abs(o.vx) + Math.abs(o.vy) < 1e-4) o.ox = o.oy = o.vx = o.vy = 0;
      }
      cx[i] = (0.5 + o.ax * Math.sin(t * o.fx * 6.28 + o.px)) * aspect + o.ox;
      cy[i] = 0.5 + o.ay * Math.cos(t * o.fy * 6.28 + o.py) + o.oy;
      rr[i] = o.r * (1 + 0.15 * Math.sin(t * 0.7 + i));
      hh[i] = o.hue;
    }

    // carve the segments recorded since the last frame
    while (trPending > 0) {
      var k = (trHead - trPending + 1 + TRAIL) % TRAIL;
      trPending--;
      if (trBrk[k]) continue;
      var pk = (k - 1 + TRAIL) % TRAIL;
      carveSegment(trX[pk], trY[pk], trX[k], trY[k], trS[k], trP[k] === 1);
    }
    relax(dt);

    var hasCut = !boxEmpty();
    var flick = Math.floor(t * 9), shimmer = Math.floor(t * 22);
    for (var y = 0; y < rows; y++) {
      var rowCut = hasCut && y >= by0 && y <= by1;
      for (var x = 0; x < cols; x++) {
        var nx = (x / cols) * aspect, ny = y / rows;
        var ci = 0, cv = 0, wv = 0, hv = 0, ox = 0, oy = 0;
        if (rowCut && x >= bx0 && x <= bx1) {
          ci = y * cols + x;
          cv = carve[ci]; wv = rim[ci]; hv = heat[ci]; ox = dX[ci]; oy = dY[ci];
          // sample the fluid from where it was pushed from
          nx -= ox / h; ny -= oy / h;
        }
        var f = 0, hue = 0;
        for (j = 0; j < NB; j++) {
          var dx = nx - cx[j], dy = ny - cy[j];
          var v = (rr[j] * rr[j]) / (dx * dx + dy * dy + 0.0008);
          f += v; hue += v * hh[j];
        }
        // aurora ribbons: slow sine curtains layered over the blobs
        var ribbon = 0.5 + 0.5 * Math.sin(nx * 3.1 + t * 0.35 + Math.sin(ny * 4.0 - t * 0.25) * 1.6);
        var field = f * 0.55 + ribbon * 0.35;

        if (cv || wv || hv) {
          // open channel: clean and dark, with a crisp edge at carve = OPEN
          var oq = (cv - OPEN + 0.05) * 10;
          var open = oq <= 0 ? 0 : oq >= 1 ? 1 : oq * oq * (3 - 2 * oq);
          // walls: a bright band riding that edge wherever it currently is
          var eq = (cv - OPEN) * 7;
          var edge = wv * Math.exp(-eq * eq);
          // parted lava piles up against the walls, brightest where there was most of it
          field = field * (1 - open) + edge * (0.6 + 1.0 * Math.min(1.5, field));
          if (field < 0.22 && hv < 0.14 && edge < 0.1) continue;
          drawCutCell(x, y, field, hue / f, nx, t, edge, side[ci], hv, ox, oy, shimmer, flick);
          continue;
        }

        if (field < 0.22) continue;
        var dens = Math.min(1, (field - 0.22) / 1.3);
        var ch;
        if (dens > 0.55) {
          // hot core: flickering binary
          ch = BIN.charAt(((x * 7 + y * 13 + flick) % 2 + 2) % 2);
        } else {
          ch = RAMP.charAt(Math.floor(dens * (RAMP.length - 1)));
        }
        if (ch === " ") continue;
        var pi = palette01((hue / f) * 0.55 + dens * 0.55 + 0.08 * Math.sin(t * 0.3 + nx));
        ctx.globalAlpha = Math.round((0.18 + dens * 0.8) * gain * 100) / 100;   // same 2-decimal alpha as before
        ctx.fillStyle = palCss[pi];
        ctx.fillText(ch, x * cw, y * cell);
      }
    }
    ctx.globalAlpha = 1;
    drawBlade();
    if (!reduce) requestAnimationFrame(frame);
    else if (transitioning) requestAnimationFrame(frame);
    else looping = false;
  }

  function palette01(tv) {
    tv = tv < 0 ? 0 : tv > 1 ? 1 : tv;
    return (tv * (PAL_N - 1) + 0.5) | 0;
  }

  // A glyph inside the wake. The seam is a filament of white-hot binary that
  // cools through cyan; the walls flare bright 0/1, tinted cyan on one side of
  // the blade and magenta on the other, and dissolve back into the lava.
  function drawCutCell(x, y, field, hueN, nx, t, wv, sd, hv, ox, oy, shimmer, flick) {
    var dens = field > 0.22 ? Math.min(1, (field - 0.22) / 1.3) : 0;
    var hot = hv > 1 ? 1 : hv, wall = wv > 1 ? 1 : wv;
    var rnd = hash(x, y, shimmer), ch;
    if (hot > 0.14 || rnd < wall * 1.4 - 0.15) {
      // energised: fast-flickering bits; the flicker thins out as the wall cools
      ch = BIN.charAt(hash(y, x, shimmer) < 0.5 ? 1 : 0);
    } else if (dens > 0.55) {
      ch = BIN.charAt(((x * 7 + y * 13 + flick) % 2 + 2) % 2);
    } else {
      ch = RAMP.charAt(Math.floor(dens * (RAMP.length - 1)));
      if (ch === " ") return;
    }
    var pi = palette01(hueN * 0.55 + dens * 0.55 + 0.08 * Math.sin(t * 0.3 + nx));
    var r = palR[pi], g = palG[pi], b = palB[pi];
    // chromatic wall tint: theme wallA left of the blade, wallB right
    // (home: cyan / magenta)
    var tint = Math.min(1, wall * 2.2) * Math.sqrt(sd < 0 ? -sd : sd);
    if (tint > 0.01) {
      var wo = (sd < 0 ? C_WALLA : C_WALLB) * 3;
      r += (col[wo] - r) * tint; g += (col[wo + 1] - g) * tint; b += (col[wo + 2] - b) * tint;
    }
    // heat: white-hot at the core, cooling through the theme's heat colour
    // rather than fading to grey (a dim grey seam reads as dust, not as a cooling cut)
    var co = C_CORE * 3;
    if (hot > 0.01) {
      var hk = hot * 3 > 1 ? 1 : hot * 3, hc = hot * hot, ho = C_HEAT * 3;
      r += (col[ho] - r) * hk; g += (col[ho + 1] - g) * hk; b += (col[ho + 2] - b) * hk;
      r += (col[co] - r) * hc; g += (col[co + 1] - g) * hc; b += (col[co + 2] - b) * hc;
    }
    // the strongest walls flare toward the core colour, so they read on any lava colour
    if (wall > 0.5) {
      var wf = (wall - 0.5) * 0.6;
      r += (col[co] - r) * wf; g += (col[co + 1] - g) * wf; b += (col[co + 2] - b) * wf;
    }
    var a = dens > 0 ? (0.18 + dens * 0.8) * gain : 0;
    var lift = Math.max(wall * 1.5, hot * 1.4);
    if (lift > a) a = lift > 1 ? 1 : lift;
    // the glyph itself rides a little of the push, so the lava visibly moves
    var gx = x * cw + ox * 0.22, gy = y * cell + oy * 0.22;
    if (hot > 0.3) {
      // chromatic fringe on the hottest glyphs
      ctx.globalAlpha = a * 0.6 * hot;
      ctx.fillStyle = colStr[C_WALLB]; ctx.fillText(ch, gx - 1.8, gy);
      ctx.fillStyle = colStr[C_WALLA]; ctx.fillText(ch, gx + 1.8, gy);
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = css(r | 0, g | 0, b | 0);
    ctx.fillText(ch, gx, gy);
  }

  // The blade itself: a hairline of light along the newest part of the trail,
  // drawn additively with a split edge in the theme's two wall colours. It lives
  // ~0.3 s, so it reads as the instant of the cut while the glyph wake carries the aftermath.
  var BLADE_LIFE = 320;
  // Soft glow for the blade tip, rendered once per theme so drawing it is one drawImage.
  function rgba(hex, a) { var c = hexRgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function tipFor(th) {
    if (th.tipCanvas) return th.tipCanvas;
    var cv = document.createElement("canvas");
    cv.width = cv.height = 96;
    var g = cv.getContext("2d");
    var grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    grad.addColorStop(0, rgba(th.core, 0.9));
    grad.addColorStop(0.12, rgba(th.tip[0], 0.55));
    grad.addColorStop(0.4, rgba(th.tip[1], 0.16));
    grad.addColorStop(1, rgba(th.tip[2], 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 96, 96);
    return (th.tipCanvas = cv);
  }
  function drawBlade() {
    if (trLen < 2) return;
    var now = performance.now();
    if (now - trT[trHead] > BLADE_LIFE) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var pass = 0; pass < 4; pass++) {
      for (var n = 0; n < trLen - 1; n++) {
        var k = (trHead - n + TRAIL) % TRAIL;
        if (trBrk[k]) continue;
        var age = now - trT[k];
        if (age > BLADE_LIFE) break;
        var pk = (k - 1 + TRAIL) % TRAIL;
        var fade = 1 - age / BLADE_LIFE;
        fade *= fade;
        var s = Math.min(1, trS[k] / 1600);
        var a = fade * (0.2 + 0.8 * s);
        if (a < 0.02) continue;
        var ax = trX[pk], ay = trY[pk], bx = trX[k], by = trY[k];
        var sx = bx - ax, sy = by - ay, l = Math.sqrt(sx * sx + sy * sy) || 1;
        var nx = -sy / l, ny = sx / l;
        var wide = trP[k] ? 1.5 : 1;
        var off = 0;
        if (pass === 0) { ctx.strokeStyle = colStr[C_GLOW]; ctx.lineWidth = 12 * wide * fade; ctx.globalAlpha = a * 0.16; }
        else if (pass === 1) { ctx.strokeStyle = colStr[C_WALLA]; ctx.lineWidth = 1.6 * wide; ctx.globalAlpha = a * 0.55; off = -1.4 * wide; }
        else if (pass === 2) { ctx.strokeStyle = colStr[C_WALLB]; ctx.lineWidth = 1.6 * wide; ctx.globalAlpha = a * 0.55; off = 1.4 * wide; }
        else { ctx.strokeStyle = colStr[C_CORE]; ctx.lineWidth = 1.1 * wide; ctx.globalAlpha = a * 0.9; }
        ctx.beginPath();
        ctx.moveTo(ax + nx * off, ay + ny * off);
        ctx.lineTo(bx + nx * off, by + ny * off);
        ctx.stroke();
      }
    }
    // the tip: brightest while the blade is actually moving
    var tipAge = now - trT[trHead];
    var ts = Math.min(1, trS[trHead] / 1600);
    var ta = (1 - tipAge / BLADE_LIFE) * (0.15 + 0.85 * ts);
    if (ta > 0.02) {
      var sz = (trP[trHead] ? 64 : 44) * (0.6 + 0.4 * ts);
      var tx = trX[trHead] - sz / 2, ty = trY[trHead] - sz / 2;
      if (mixK < 1 && fromTheme !== theme) {
        ctx.globalAlpha = ta * (1 - mixK);
        ctx.drawImage(tipFor(fromTheme), tx, ty, sz, sz);
      }
      ctx.globalAlpha = ta * mixK;
      ctx.drawImage(tipFor(theme), tx, ty, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);

  /* ---------- Pointer input for the cut ----------
   * The canvas sits underneath the page and never captures events; we listen
   * on window (passive, so scrolling is untouched) and only cut while the
   * pointer is over the hero or bare background, not over glass panels/nav.
   */
  function overBackground(el) {
    if (!el || !el.closest) return true;
    if (el.closest(".hero")) return !el.closest(".nav");
    return !el.closest(".glass");
  }
  var pressed = false, touchScroll = false;

  function onMove(e) {
    if (e.pointerType === "touch" && !pressed) return;
    if (!overBackground(e.target)) { endStroke(); return; }
    addPoint(e.clientX, e.clientY, pressed || (e.buttons & 1) === 1);
  }

  if (!reduce) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      pressed = true;
      touchScroll = false;
      if (!overBackground(e.target)) return;
      endStroke();                       // pressing starts a clean, deeper stroke
      addPoint(e.clientX, e.clientY, true);
    }, { passive: true });
    window.addEventListener("pointerup", function (e) {
      pressed = false;
      if (e.pointerType === "touch") endStroke();
    }, { passive: true });
    // On touch the browser takes the gesture over for scrolling and cancels the
    // pointer. Keep cutting from passive touchmoves so the finger still slices
    // the (fixed) background while the page scrolls under it.
    window.addEventListener("pointercancel", function (e) {
      if (e.pointerType === "touch") touchScroll = true;
      else { pressed = false; endStroke(); }
    }, { passive: true });
    window.addEventListener("touchmove", function (e) {
      if (!touchScroll || !e.touches.length) return;
      var tp = e.touches[0];
      if (!overBackground(document.elementFromPoint(tp.clientX, tp.clientY))) { endStroke(); return; }
      addPoint(tp.clientX, tp.clientY, true);
    }, { passive: true });
    window.addEventListener("touchend", function () { touchScroll = false; pressed = false; endStroke(); }, { passive: true });
    document.addEventListener("mouseleave", endStroke);
    window.addEventListener("blur", function () { pressed = false; endStroke(); });
    // A mouse drag that starts on empty background or the decorative wordmark
    // would otherwise paint a text selection across the hero; copy text
    // (lede, prompt, headings, links) stays selectable.
    document.addEventListener("mousedown", function (e) {
      if (e.button === 0 && overBackground(e.target) && !e.target.closest("p, h2, h3, a, li, figure, footer")) e.preventDefault();
    });
  }

  /* ---------- Video clips ----------
   * Clips are muted, looping and preload="none", so nothing downloads until a
   * clip first plays. Carousel clips play only while they face the front of a
   * ring that is on screen; other clips play while they're in view. With
   * prefers-reduced-motion nothing ever plays: the poster frames stand in.
   */
  function setPlaying(video, on) {
    if (on && video.paused) {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});   // autoplay refusals just leave the poster
    } else if (!on && !video.paused) {
      video.pause();
    }
  }
  var observe = "IntersectionObserver" in window ? function (el, cb) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { cb(e.isIntersecting && e.intersectionRatio >= 0.25); });
    }, { threshold: [0, 0.25, 0.6] }).observe(el);
  } : function (el, cb) { cb(true); };

  /* ---------- Rotating carousels ---------- */
  var FRONT = 65;   // degrees either side of the viewer that count as "facing front"
  var carousels = Array.prototype.slice.call(document.querySelectorAll(".carousel"));
  var state = carousels.map(function (el, i) {
    var ring = el.querySelector(".ring");
    var items = Array.prototype.slice.call(ring.children);
    var n = items.length;
    var step = 360 / n;
    var radius = Math.round((172 / 2) / Math.tan(Math.PI / n)) + 36;
    var clips = [];
    items.forEach(function (it, k) {
      it.style.transform = "rotateY(" + (k * step) + "deg) translateZ(" + radius + "px)";
      var v = it.querySelector("video");
      if (v) clips.push({ el: v, base: k * step });
    });
    var s = { ring: ring, radius: radius, angle: i * 30, speed: i % 2 ? -14 : 14, paused: false, clips: clips, onScreen: false };
    el.addEventListener("mouseenter", function () { s.paused = true; });
    el.addEventListener("mouseleave", function () { s.paused = false; });
    if (clips.length && !reduce) observe(el, function (vis) { s.onScreen = vis; syncClips(s); });
    return s;
  });

  function syncClips(s) {
    for (var c = 0; c < s.clips.length; c++) {
      var a = ((s.clips[c].base + s.angle) % 360 + 540) % 360 - 180;   // -180..180, 0 = facing viewer
      setPlaying(s.clips[c].el, s.onScreen && !document.hidden && Math.abs(a) < FRONT);
    }
  }

  function place(s) {
    s.ring.style.transform = "translateZ(" + (-s.radius) + "px) rotateX(-6deg) rotateY(" + s.angle + "deg)";
  }
  state.forEach(place);

  var last = 0;
  function spin(ms) {
    var dt = last ? Math.min(0.05, (ms - last) / 1000) : 0;
    last = ms;
    state.forEach(function (s) {
      if (!s.paused) s.angle += s.speed * dt;
      place(s);
      if (s.clips.length) syncClips(s);
    });
    requestAnimationFrame(spin);
  }
  if (!reduce) requestAnimationFrame(spin);

  // Clips outside carousels (the app pages' hero and gallery)
  var loose = Array.prototype.slice.call(document.querySelectorAll("video")).filter(function (v) { return !v.closest(".carousel"); });
  if (!reduce) {
    loose.forEach(function (v) {
      observe(v, function (vis) { v._inView = vis; setPlaying(v, vis && !document.hidden); });
    });
  }
  document.addEventListener("visibilitychange", function () {
    loose.forEach(function (v) { setPlaying(v, !reduce && v._inView && !document.hidden); });
    state.forEach(function (s) { if (s.clips.length) syncClips(s); });
  });
})();
