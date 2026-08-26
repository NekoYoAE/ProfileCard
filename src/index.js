/**
 * profile-card Worker
 *
 * 用法: https://<你的域名>/?oid=用户oid
 * 展示用户卡片: 主页背景图 / 头像 / 名称 / 获赞 / 粉丝
 *
 * 数据来源 (ccw-api):
 *   - POST https://community-web.ccw.site/user-card/detail  { oid }            -> 头像/名称/获赞/粉丝
 *   - POST https://community-web.ccw.site/students/profile   { studentOid }    -> memberArchive.homepageCover 主页背景图
 *
 * 注意: 社交平台会缓存图片/链接预览，更新卡片后平台仍可能显示旧版。
 * 请在 URL 后加版本参数强制平台重新抓取, 例如: ?oid=xxx&v=2
 * (v 参数已纳入缓存 key, 可同时绕过 Worker 自身缓存)
 */

const API_BASE = "https://community-web.ccw.site";
const OID_RE = /^[0-9a-fA-F]{24}$/;
const CACHE_TTL = 1 * 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== "/") {
      return new Response("Not Found", { status: 404 });
    }

    const oid = (url.searchParams.get("oid") || "").trim();

    // 没有 oid -> 显示使用说明
    if (!oid) {
      return html(renderHelp(url.origin), { "cache-control": "public, max-age=60" });
    }

    // oid 格式非法
    if (!OID_RE.test(oid)) {
      return html(renderError("oid 格式不正确，应为 24 位十六进制字符串"), {
        "cache-control": "no-store",
      });
    }

    // 尝试命中缓存（key 用完整 URL，包含 v 等版本参数）
    const cacheKey = new Request(url, request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [cardRes, profileRes] = await Promise.all([
        postJson(`${API_BASE}/user-card/detail`, { oid }),
        postJson(`${API_BASE}/students/profile`, { studentOid: oid }),
      ]);

      const user = cardRes?.body?.user;
      if (!user) {
        return html(renderError("未找到该用户，请检查 oid 是否正确"), {
          "cache-control": "no-store",
        });
      }

      const stats = user.statistics || {};
      const bgUrl = profileRes?.body?.memberArchive?.homepageCover || "";

      // 下载并内嵌头像/背景图，解决 SVG-as-image 模式下外部图片引用不渲染的问题
      const [avatarImg, bgImg] = await Promise.all([
        user.avatar
          ? fetchImageData(user.avatar, 600 * 1024, { width: 160, height: 160, fit: "cover", format: "jpeg", quality: 80 })
          : null,
        bgUrl
          ? fetchImageData(bgUrl, 1024 * 1024, { width: 800, height: 260, fit: "cover", format: "jpeg", quality: 70 })
          : null,
      ]);

      const data = {
        name: user.name || "未知用户",
        avatarUri: avatarImg?.dataUri || "",
        backgroundUri: bgImg?.dataUri || "",
        bio: user.bio || "",
        likeCount: stats.likeCount ?? 0,
        followerCount: stats.followerCount ?? 0,
      };

      const response = svg(renderCardSvg(data), {
        "cache-control": `public, max-age=${CACHE_TTL}`,
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (err) {
      console.error(err);
      return html(renderError("获取用户信息失败，请稍后重试"), {
        "cache-control": "no-store",
      });
    }
  },
};

/** 发送 POST JSON 请求 */
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * 下载图片并转换为 data URI，限制最大体积。
 * 1. 先尝试原图；
 * 2. 太大则尝试阿里云 OSS 图片处理缩小（免费，不占用 Worker 额度）；
 * 3. 仍不行则回退 Cloudflare Image Transformations（若账户开启）。
 */
async function fetchImageData(url, maxBytes = 1024 * 1024, resizeOpts = null) {
  // 1. 直接下载原图
  try {
    const direct = await fetchAsDataUri(url);
    if (direct && direct.bytes <= maxBytes) return direct;
  } catch {}

  if (!resizeOpts) return null;

  // 2. 尝试阿里云 OSS 图片处理参数缩小
  try {
    const ossUrl = ossResizeUrl(url, resizeOpts.width, resizeOpts.height, resizeOpts.quality);
    const oss = await fetchAsDataUri(ossUrl);
    if (oss && oss.bytes <= maxBytes) return oss;
  } catch {}

  // 3. 尝试 Cloudflare Image Transformations
  try {
    const cf = await fetchAsDataUri(url, {
      cf: {
        image: {
          width: resizeOpts.width,
          height: resizeOpts.height,
          fit: "cover",
          format: "jpeg",
          quality: resizeOpts.quality,
        },
      },
    });
    if (cf && cf.bytes <= maxBytes) return cf;
  } catch {}

  return null;
}

/** 构造阿里云 OSS 图片处理 URL（resize 转 JPEG） */
function ossResizeUrl(url, width, height, quality) {
  const sep = url.includes("?") ? "&" : "?";
  // m_fill 等价于 CSS background-size: cover
  return `${url}${sep}x-oss-process=image/resize,w_${width},h_${height},m_fill/format,jpg/quality,q_${quality}`;
}

/** 带超时的 fetch（默认 8 秒） */
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 根据 base64 头判断真实图片格式 */
function detectImageType(b64) {
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

/** 将图片 URL 转为 data URI */
async function fetchAsDataUri(url, fetchOpts = {}, timeoutMs = 8000) {
  const res = await fetchWithTimeout(url, fetchOpts, timeoutMs);
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "image/jpeg";
  const buf = await res.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  return {
    dataUri: `data:${detectImageType(b64)};base64,${b64}`,
    bytes: buf.byteLength,
    contentType: ct,
  };
}

/** ArrayBuffer -> base64（分块避免栈溢出） */
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** 包装 HTML 响应 */
function html(body, extraHeaders = {}) {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...extraHeaders,
    },
  });
}

/** 包装 SVG 响应 */
function svg(body, extraHeaders = {}) {
  return new Response(body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      ...extraHeaders,
    },
  });
}

/** 数字格式化: 12345 -> 1.2万 */
function fmt(n) {
  n = Number(n) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "亿";
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
  return String(n);
}

/** SVG 用户卡片 */
function renderCardSvg({ name, avatarUri, backgroundUri, bio, likeCount, followerCount }) {
  const W = 400;
  const H = 265;
  const safeName = truncate(name || "未知用户", 360, 20);
  const safeBio = truncate(bio || "", 360, 13);
  // 有简介时分隔线下移，保证与文字间距一致
  const lineY = safeBio ? 206 : 198;

  const avatarBlock = avatarUri
    ? `<g clip-path="url(#avatarClip)"><image href="${escapeXmlAttr(avatarUri)}" x="22" y="67" width="76" height="76" preserveAspectRatio="xMidYMid slice" /></g>`
    : `<circle cx="60" cy="105" r="38" fill="url(#fallbackBg)" /><text class="avatar-initial" x="60" y="116" text-anchor="middle">${escapeXml(String(name || "?").charAt(0))}</text>`;
  const bioBlock = safeBio
    ? `<text class="bio" x="20" y="184">${escapeXml(safeBio)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeXmlAttr(name)} - CCW 用户卡片">
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif; }
  .card-bg { fill: #ffffff; }
  .fade-end { stop-color: #ffffff; }
  .avatar-ring { stroke: #ffffff; }
  .name { fill: #1f2328; font-size: 20px; font-weight: 700; }
  .bio { fill: #6b7280; font-size: 13px; }
  .num { fill: #1f2328; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .label { fill: #6b7280; font-size: 12px; }
  .avatar-initial { fill: #ffffff; font-size: 30px; font-weight: 600; }
  .line { stroke: rgba(0, 0, 0, 0.08); stroke-width: 1; }
  @media (prefers-color-scheme: dark) {
    .card-bg { fill: #1c1f26; }
    .fade-end { stop-color: #1c1f26; }
    .avatar-ring { stroke: #1c1f26; }
    .name, .num { fill: #e6e6e6; }
    .bio, .label { fill: #9ca3af; }
    .line { stroke: rgba(255, 255, 255, 0.1); }
  }
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
  <clipPath id="bannerClip"><rect x="0" y="0" width="${W}" height="130" rx="16" /></clipPath>
  <clipPath id="avatarClip"><circle cx="60" cy="105" r="38" /></clipPath>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
    <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000000" flood-opacity="0.15" />
  </filter>
</defs>
<g filter="url(#shadow)">
  <rect class="card-bg" x="0" y="0" width="${W}" height="${H}" rx="16" />
  <g clip-path="url(#bannerClip)">
    <rect x="0" y="0" width="${W}" height="130" fill="url(#fallbackBg)" />
    ${backgroundUri ? `<image href="${escapeXmlAttr(backgroundUri)}" x="0" y="0" width="${W}" height="130" preserveAspectRatio="xMidYMid slice" />` : ""}
    <rect x="0" y="0" width="${W}" height="130" fill="url(#fade)" />
  </g>
  ${avatarBlock}
  <circle class="avatar-ring" cx="60" cy="105" r="38" fill="none" stroke-width="4" />
  <text class="name" x="20" y="163">${escapeXml(safeName)}</text>
  ${bioBlock}
  <line class="line" x1="20" y1="${lineY}" x2="380" y2="${lineY}" />
  <line class="line" x1="200" y1="${lineY + 6}" x2="200" y2="${lineY + 40}" />
  <text class="num" x="100" y="${lineY + 28}" text-anchor="middle">${escapeXml(fmt(likeCount))}</text>
  <text class="label" x="100" y="${lineY + 46}" text-anchor="middle">获赞</text>
  <text class="num" x="300" y="${lineY + 28}" text-anchor="middle">${escapeXml(fmt(followerCount))}</text>
  <text class="label" x="300" y="${lineY + 46}" text-anchor="middle">粉丝</text>
</g>
</svg>`;
}

/** 使用说明页 */
function renderHelp(origin) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CCW 用户卡片</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(135deg, #eef2f7 0%, #dfe7f0 100%);
    padding: 24px;
  }
  .box {
    max-width: 560px;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
    padding: 36px 40px;
  }
  h1 { font-size: 24px; margin-bottom: 8px; }
  p { color: #6b7280; font-size: 14px; line-height: 1.8; }
  code {
    display: inline-block;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 13px;
    color: #e11d48;
  }
  .demo {
    display: block;
    margin: 12px 0 4px;
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    padding: 12px 16px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    color: #0f172a;
    word-break: break-all;
  }
</style>
</head>
<body>
  <div class="box">
    <h1>CCW 用户卡片</h1>
    <p>在 URL 后添加 <code>?oid=用户oid</code> 即可获取用户卡片。</p>
    <p>例如：</p>
    <span class="demo">${escapeHtml(`${origin}/?oid=63c2807d669fa967f17f5559`)}</span>
  </div>
</body>
</html>`;
}

/** 错误提示页 */
function renderError(message) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>出错了 - CCW 用户卡片</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
    padding: 24px;
  }
  .box {
    max-width: 460px;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
    padding: 36px 40px;
    text-align: center;
  }
  h1 { font-size: 20px; margin-bottom: 8px; }
  p { color: #6b7280; font-size: 14px; }
</style>
</head>
<body>
  <div class="box">
    <h1>出错了</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

/** 转义 HTML 特殊字符 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 转义 XML 文本节点 */
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 转义 XML 属性值 */
function escapeXmlAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 估算文本渲染宽度（CJK 按 1em，其余按 0.55em） */
function textWidth(s, fontSize) {
  let units = 0;
  for (const ch of String(s)) {
    units += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : 0.55;
  }
  return units * fontSize;
}

/** 按宽度截断文本，超出加省略号 */
function truncate(s, maxWidth, fontSize) {
  s = String(s);
  if (textWidth(s, fontSize) <= maxWidth) return s;
  let out = "";
  for (const ch of s) {
    if (textWidth(out + ch + "…", fontSize) > maxWidth) break;
    out += ch;
  }
  return out + "…";
}
