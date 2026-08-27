import { fmt, escapeXml, escapeXmlAttr, truncate } from "./utils.js";
import { applyTheme } from "./theme.js";

const DEFAULT_NAME_MAX = 274;
const DEFAULT_NAME_FS = 20;
const DEFAULT_BIO_MAX = 274;
const DEFAULT_BIO_FS = 13;

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
  if (data.avatarUri) {
    return `<g class="anim-avatar d1" filter="url(#avatarShadow)"><g clip-path="url(#avatarClip)"><image href="${escapeXmlAttr(data.avatarUri)}" x="22" y="95" width="76" height="76" preserveAspectRatio="xMidYMid slice" /></g></g>`;
  }
  return `<g class="anim-avatar d1" filter="url(#avatarShadow)"><circle cx="60" cy="133" r="38" fill="url(#fallbackBg)" /></g><text class="avatar-initial" x="60" y="144" text-anchor="middle">${escapeXml(String(data.name || "?").charAt(0))}</text>`;
}

function backgroundBlock(data) {
  return `<g class="bg-img"><image href="${escapeXmlAttr(data.backgroundUri)}" x="0" y="0" width="400" height="130" preserveAspectRatio="xMidYMid slice" /></g>`;
}
