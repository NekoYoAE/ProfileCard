import { fmt, escapeXml, escapeXmlAttr, textWidth, truncate, fill } from "../src/utils.js";

export const cardBaseCss = `
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif; }
  .avatar-initial { fill: #ffffff; font-size: 30px; font-weight: 600; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
  @keyframes popIn { 0% { opacity: 0; transform: scale(0.85); } 70% { opacity: 1; transform: scale(1.03); } 100% { opacity: 1; transform: none; } }
  .anim { animation: fadeUp 0.7s cubic-bezier(0.22, 0.9, 0.36, 1) both; }
  .anim-avatar { animation: popIn 0.6s cubic-bezier(0.34, 1.2, 0.64, 1) both; }
  .d0 { animation-delay: 0s; }
  .d1 { animation-delay: 0.08s; }
  .d2 { animation-delay: 0.16s; }
  .d3 { animation-delay: 0.24s; }
  .d4 { animation-delay: 0.32s; }
  @keyframes bgReveal { from { opacity: 0; transform: translateY(16px) scale(1.2); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .bg-img { transform-box: fill-box; transform-origin: 50% 50%; animation: bgReveal 1s cubic-bezier(0.22, 0.9, 0.36, 1) 0.05s both; }
  @media (prefers-reduced-motion: reduce) { .anim, .anim-avatar, .bg-img { animation: none; } }`;

// 深色主题
export const cardCssDark = `
  .card-bg { fill: #1c1f26; }
  .fade-end { stop-color: #1c1f26; }
  .name { fill: #e6e6e6; font-size: 20px; font-weight: 700; }
  .bio { fill: #9ca3af; font-size: 13px; }
  .num { fill: #e6e6e6; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .label { fill: #9ca3af; font-size: 12px; }
  .line { stroke: rgba(255, 255, 255, 0.1); stroke-width: 1; }`;

// 浅色主题
export const cardCssLight = `
  .card-bg { fill: #ffffff; }
  .fade-end { stop-color: #ffffff; }
  .name { fill: #1f2328; font-size: 20px; font-weight: 700; }
  .bio { fill: #6b7280; font-size: 13px; }
  .num { fill: #1f2328; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .label { fill: #6b7280; font-size: 12px; }
  .line { stroke: rgba(0, 0, 0, 0.08); stroke-width: 1; }`;

const SVG_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 265" width="400" height="265" role="img" aria-label="{{nameAttr}}">
  <style>
    {{style}}
  </style>
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.15" />
      <stop offset="0.45" stop-color="#000000" stop-opacity="0" />
      <stop offset="1" class="fade-end" stop-color="#ffffff" />
    </linearGradient>
    <linearGradient id="fallbackBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#667eea" />
      <stop offset="1" stop-color="#764ba2" />
    </linearGradient>
    <clipPath id="bannerClip"><path d="M16 0 H384 Q400 0 400 16 V130 H0 V16 Q0 0 16 0 Z" /></clipPath>
    <clipPath id="avatarClip"><circle cx="60" cy="133" r="38" /></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000000" flood-opacity="0.15" />
    </filter>
    <filter id="avatarShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="{{shadowColor}}" flood-opacity="{{shadowOpacity}}" />
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <rect class="card-bg" x="0" y="0" width="400" height="265" rx="16" />
    <g class="anim d0" clip-path="url(#bannerClip)">
      <rect class="card-bg" x="0" y="0" width="400" height="130" />
      {{background}}
      <rect x="0" y="0" width="400" height="130" fill="url(#fade)" />
    </g>
    {{avatar}}
    <text class="name anim d2" x="118" y="140">{{name}}</text>
    {{bio}}
    <line class="line anim d3" x1="20" y1="200" x2="380" y2="200" />
    <line class="line anim d3" x1="140" y1="206" x2="140" y2="250" />
    <line class="line anim d3" x1="260" y1="206" x2="260" y2="250" />
    <text class="num anim d4" x="80" y="228" text-anchor="middle">{{likes}}</text>
    <text class="label anim d4" x="80" y="246" text-anchor="middle">获赞</text>
    <text class="num anim d4" x="200" y="228" text-anchor="middle">{{followers}}</text>
    <text class="label anim d4" x="200" y="246" text-anchor="middle">粉丝</text>
    <text class="num anim d4" x="320" y="228" text-anchor="middle">{{score}}</text>
    <text class="label anim d4" x="320" y="246" text-anchor="middle">信誉分</text>
  </g>
</svg>`;

export function renderCardSvg({ name, avatarUri, backgroundUri, bio, likeCount, followerCount, reputationScore }, theme = "dark") {
  const isDark = theme !== "light";
  const safeName = truncate(name || "", 274, 20);
  const safeBio = truncate(bio || "", 274, 13);

  const avatarBlock = avatarUri
    ? `<g class="anim-avatar d1" filter="url(#avatarShadow)"><g clip-path="url(#avatarClip)"><image href="${escapeXmlAttr(avatarUri)}" x="22" y="95" width="76" height="76" preserveAspectRatio="xMidYMid slice" /></g></g>`
    : `<g class="anim-avatar d1" filter="url(#avatarShadow)"><circle cx="60" cy="133" r="38" fill="url(#fallbackBg)" /></g><text class="avatar-initial" x="60" y="144" text-anchor="middle">${escapeXml(String(name || "?").charAt(0))}</text>`;

  const bgBlock = backgroundUri
    ? `<g class="bg-img"><image href="${escapeXmlAttr(backgroundUri)}" x="0" y="0" width="400" height="130" preserveAspectRatio="xMidYMid meet" /></g>`
    : "";

  const bioBlock = safeBio
    ? `<text class="bio anim d3" x="118" y="162">${escapeXml(safeBio)}</text>`
    : "";

  return fill(SVG_TEMPLATE, {
    style: cardBaseCss + (isDark ? cardCssDark : cardCssLight),
    shadowColor: isDark ? "#ffffff" : "#000000",
    shadowOpacity: isDark ? "0.35" : "0.25",
    name: escapeXml(safeName),
    nameAttr: escapeXmlAttr(safeName),
    avatar: avatarBlock,
    background: bgBlock,
    bio: bioBlock,
    likes: escapeXml(fmt(likeCount)),
    followers: escapeXml(fmt(followerCount)),
    score: reputationScore == null ? "--" : escapeXml(fmt(reputationScore)),
  });
}
