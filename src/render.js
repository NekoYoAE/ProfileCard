import { fmt, escapeXml, escapeXmlAttr, truncate, svgSize } from "./utils.js";
import { applyTheme } from "./theme.js";

export const WATERMARK_TEXT = "基于ProfileCard创建";
const WATERMARK_BAND = 33;
const WATERMARK_X = 7;
const WATERMARK_TOP = 15;
const WATERMARK_ICON = 14;
const WATERMARK_GITHUB_PATH = "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12";

const DEFAULT_NAME_MAX = 274;
const DEFAULT_NAME_FS = 20;
const DEFAULT_BIO_MAX = 274;
const DEFAULT_BIO_FS = 13;

const RANK_CIRCUM = 276.5;
const RANK_BANDS = [
  { rank: "C", min: 0 },
  { rank: "B", min: 500 },
  { rank: "A", min: 2000 },
  { rank: "S", min: 5000 },
  { rank: "S+", min: 10000 },
];

function rankInfo(likeCount, followerCount) {
  const total = (Number(likeCount) || 0) + (Number(followerCount) || 0);
  let idx = 0;
  for (let i = 0; i < RANK_BANDS.length; i++) {
    if (total < RANK_BANDS[i].min) break;
    idx = i;
  }
  const band = RANK_BANDS[idx];
  const next = RANK_BANDS[Math.min(idx + 1, RANK_BANDS.length - 1)];
  const progress =
    idx === RANK_BANDS.length - 1
      ? 100
      : Math.min(100, ((total - band.min) / (next.min - band.min)) * 100);
  return { rank: band.rank, progress };
}

const formatters = {
  name: (data, args) =>
    escapeXml(truncate(String(data.name ?? ""), num(args[0], DEFAULT_NAME_MAX), num(args[1], DEFAULT_NAME_FS))),
  nameAttr: (data, args) =>
    escapeXmlAttr(truncate(String(data.name ?? ""), num(args[0], DEFAULT_NAME_MAX), num(args[1], DEFAULT_NAME_FS))),
  bio: (data, args) =>
    data.bio
      ? escapeXml(truncate(String(data.bio), num(args[0], DEFAULT_BIO_MAX), num(args[1], DEFAULT_BIO_FS)))
      : "",
  likes: (data) => escapeXml(fmt(data.likeCount)),
  followers: (data) => escapeXml(fmt(data.followerCount)),
  score: (data) => (data.reputationScore == null ? "--" : escapeXml(fmt(data.reputationScore))),
  rank: (data) => escapeXml(rankInfo(data.likeCount, data.followerCount).rank),
  rankOffset: (data) => {
    const { progress } = rankInfo(data.likeCount, data.followerCount);
    return String(Math.round(RANK_CIRCUM * (1 - progress / 100) * 10) / 10);
  },
  avatar: (data) => avatarBlock(data),
  background: (data) => (data.backgroundUri ? backgroundBlock(data) : ""),
};

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function renderCardSvg(template, data = {}, theme = "dark", opts = {}) {
  const vars = collectVars(template, data);
  const out = template.replace(/\{\{([^{}]+)\}\}/g, (m, expr) => {
    const key = expr.trim().split(":")[0];
    return key in vars ? vars[key] : "";
  });
  const themed = applyTheme(out, theme, opts);
  return opts.watermark === false ? themed : addWatermark(themed);
}

export function addWatermark(svg) {
  if (typeof svg !== "string") return svg;
  if (svg.includes('class="pc-wm"')) return svg;

  const size = svgSize(svg);
  const base = size.height;
  const grown = growCanvas(svg, base + WATERMARK_BAND);

  const iconScale = WATERMARK_ICON / 24;
  const textBaseline = WATERMARK_ICON / 2 + 5;
  const markup =
    `\n  <g class="pc-wm" transform="translate(${WATERMARK_X}, ${base + WATERMARK_TOP})">` +
    `<path d="${WATERMARK_GITHUB_PATH}" transform="scale(${iconScale})" />` +
    `<text class="pc-wm-text" x="${WATERMARK_ICON + 5}" y="${textBaseline}">${escapeXml(WATERMARK_TEXT)}</text>` +
    `</g>\n`;

  const idx = grown.lastIndexOf("</svg>");
  return idx < 0 ? grown : `${grown.slice(0, idx)}${markup}${grown.slice(idx)}`;
}

function growCanvas(svg, newHeight) {
  let out = svg.replace(
    /viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+[\d.]+(\s*)"/,
    (m, x, y, w, sp) => `viewBox="${x} ${y} ${w} ${newHeight}${sp}"`
  );
  return out.replace(/(<svg\b[^>]*\sheight=")[\d.]+/, `$1${newHeight}`);
}

function collectVars(template, data) {
  const vars = {};
  const re = /\{\{([^{}]+)\}\}/g;
  let m;
  while ((m = re.exec(template))) {
    const expr = m[1].trim();
    const [key, ...args] = expr.split(":");
    if (!key || key in vars) continue;
    vars[key] = formatters[key] ? formatters[key](data, args) : rawValue(key, data);
  }
  return vars;
}

function rawValue(key, data) {
  const v = data[key];
  if (v == null) return "";
  return escapeXml(String(v));
}

function avatarBlock(data) {
  if (data.avatarUri) {
    return `<g class="anim-avatar d1" filter="url(#avatarShadow)"><g clip-path="url(#avatarClip)"><image href="${escapeXmlAttr(data.avatarUri)}" x="22" y="95" width="76" height="76" preserveAspectRatio="xMidYMid slice" /></g></g>`;
  }
  return `<g class="anim-avatar d1" filter="url(#avatarShadow)"><circle cx="60" cy="133" r="38" fill="url(#fallbackBg)" /></g><text class="avatar-initial" x="60" y="144" text-anchor="middle">${escapeXml(String(data.name || "?").charAt(0))}</text>`;
}

function backgroundBlock(data) {
  return `<g class="bg-img"><image href="${escapeXmlAttr(data.backgroundUri)}" x="0" y="0" width="400" height="130" preserveAspectRatio="xMidYMid slice" /></g>`;
}
