import { fmt, escapeXml, escapeXmlAttr, truncate } from "./utils.js";
import { applyTheme } from "./theme.js";

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
  background: (data) => (data.backgroundUri || data.backgroundUrl ? backgroundBlock(data) : ""),
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
  return applyTheme(out, theme, opts);
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
  const src = data.avatarUri || data.avatarUrl;
  if (src) {
    const loading = data.avatarUrl && !data.avatarUri
      ? `<g class="bg-loading"><rect x="22" y="95" width="76" height="76" fill="url(#fallbackBg)" /><text class="loading-text loading-sm" x="60" y="140" text-anchor="middle">加载中</text></g>`
      : "";
    return `<g class="anim-avatar d1" filter="url(#avatarShadow)"><g clip-path="url(#avatarClip)">${loading}<image href="${escapeXmlAttr(src)}" x="22" y="95" width="76" height="76" preserveAspectRatio="xMidYMid slice" /></g></g>`;
  }
  return `<g class="anim-avatar d1" filter="url(#avatarShadow)"><circle cx="60" cy="133" r="38" fill="url(#fallbackBg)" /></g><text class="avatar-initial" x="60" y="144" text-anchor="middle">${escapeXml(String(data.name || "?").charAt(0))}</text>`;
}

function backgroundBlock(data) {
  const src = data.backgroundUri || data.backgroundUrl;
  const loading = data.backgroundUrl && !data.backgroundUri
    ? `<g class="bg-loading"><rect x="0" y="0" width="400" height="130" fill="var(--card-bg)" /><text class="loading-text" x="200" y="70" text-anchor="middle">加载中</text></g>`
    : "";
  return `${loading}<g class="bg-img"><image href="${escapeXmlAttr(src)}" x="0" y="0" width="400" height="130" preserveAspectRatio="xMidYMid slice" /></g>`;
}
