const themes = {
  dark: {
    "--card-bg": "#1c1f26",
    "--fade-end": "#1c1f26",
    "--name": "#e6e6e6",
    "--bio": "#9ca3af",
    "--num": "#e6e6e6",
    "--label": "#9ca3af",
    "--line": "rgba(255,255,255,0.1)",
    "--avatar-initial": "#ffffff",
    "--shadow-color": "#000000",
    "--shadow-opacity": "0.35",
    "--accent": "#8b9cf7",
  },
  light: {
    "--card-bg": "#ffffff",
    "--fade-end": "#ffffff",
    "--name": "#1f2328",
    "--bio": "#6b7280",
    "--num": "#1f2328",
    "--label": "#6b7280",
    "--line": "rgba(0,0,0,0.08)",
    "--avatar-initial": "#1f2328",
    "--shadow-color": "#ffffff",
    "--shadow-opacity": "0.25",
    "--accent": "#5b6bd6",
  },
};

export function isLight(theme) {
  return String(theme || "").toLowerCase() === "light";
}

export function normalizeTheme(theme) {
  return isLight(theme) ? "light" : "dark";
}

export function themeCss(theme = "dark") {
  const vars = themes[normalizeTheme(theme)];
  const decls = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
  return `svg{${decls}}`;
}

export function applyTheme(svg, theme = "dark", opts = {}) {
  if (typeof svg !== "string") return svg;
  let css = themeCss(theme);
  if (opts.animation === false) {
    css += `svg .anim,svg .anim-avatar,svg .bg-img,svg .ring-progress{animation:none!important}`;
  }
  return svg.replace("</style>", `${css}</style>`);
}

export function themeValues(theme = "dark") {
  return themes[normalizeTheme(theme)];
}

export { themes };
export default { themes, isLight, normalizeTheme, themeCss, applyTheme, themeValues };
