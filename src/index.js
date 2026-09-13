import { renderCardSvg } from "./render.js";
import { escapeXml, textWidth } from "./utils.js";

const cardStyles = {
  1: "Card_1.svg",
  2: "Card_2.svg",
  error: "Error.svg",
};

const templateCache = new Map();

async function getCardTemplate(card, env) {
  const file = cardStyles[card] || cardStyles[1];
  if (!templateCache.has(file)) {
    const res = await env.ASSETS.fetch(new URL(`/${file}`, "https://assets.local/"));
    if (!res.ok) throw new Error(`Failed to load card template: ${file}`);
    templateCache.set(file, await res.text());
  }
  return templateCache.get(file);
}

const ERROR_SLOT_TITLE = "%%ERR_TITLE%%";
const ERROR_SLOT_MESSAGE = "%%ERR_MESSAGE%%";

const ERROR_LAYOUT = {
  padX: 20,
  padBottom: 18,
  titleY: 38,
  titleFontSize: 16,
  messageFontSize: 12,
  lineHeight: 1.4,
  maxTitleLines: 6,
  maxMessageLines: 5,
};

const ERROR_FALLBACK_TEMPLATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 90" width="260" height="90" role="img" aria-label="出错了"><style>svg{--card-bg:#1c1f26;--name:#e6e6e6;--bio:#9ca3af}.bg{fill:var(--card-bg)}.title{fill:var(--name);font-size:16px;font-weight:700}.desc{fill:var(--bio);font-size:12px}</style><rect class="bg" x="0" y="0" width="260" height="90" rx="14" /><text class="title" x="20" y="38">${ERROR_SLOT_TITLE}</text><text class="desc" x="20" y="60">${ERROR_SLOT_MESSAGE}</text></svg>`;

async function renderError(env, theme, title = "出错了", message = "无法加载数据，请稍后重试", opts = {}) {
  let tpl;
  try {
    tpl = await getCardTemplate("error", env);
  } catch (err) {
    console.error("Failed to load Error.svg", err);
    tpl = ERROR_FALLBACK_TEMPLATE;
  }
  const markup = renderCardSvg(tpl, { title: ERROR_SLOT_TITLE, message: ERROR_SLOT_MESSAGE }, theme, opts);
  return fitErrorText(markup, title, message);
}

function fitErrorText(markup, title, message) {
  const size = svgSize(markup);
  const maxWidth = Math.max(40, size.width - ERROR_LAYOUT.padX * 2);

  const titleEl = locateTextElement(markup, ERROR_SLOT_TITLE);
  const messageEl = locateTextElement(markup, ERROR_SLOT_MESSAGE);

  const titleFontSize = titleEl ? titleEl.fontSize : ERROR_LAYOUT.titleFontSize;
  const messageFontSize = messageEl ? messageEl.fontSize : ERROR_LAYOUT.messageFontSize;
  const titleLh = Math.round(titleFontSize * ERROR_LAYOUT.lineHeight);
  const messageLh = Math.round(messageFontSize * ERROR_LAYOUT.lineHeight);

  const startY = titleEl ? titleEl.y : ERROR_LAYOUT.titleY;
  const titleLines = title ? wrapLines(title, maxWidth, titleFontSize, ERROR_LAYOUT.maxTitleLines) : [];
  const messageLines = message ? wrapLines(message, maxWidth, messageFontSize, ERROR_LAYOUT.maxMessageLines) : [];

  const messageStart = titleLines.length
    ? startY + titleLines.length * titleLh
    : (messageEl ? messageEl.y : startY);

  const titleBottom = titleLines.length ? startY + (titleLines.length - 1) * titleLh : 0;
  const messageBottom = messageLines.length ? messageStart + (messageLines.length - 1) * messageLh : 0;
  const height = Math.max(size.height, Math.round(Math.max(titleBottom, messageBottom) + ERROR_LAYOUT.padBottom));

  const filled = moveTextY(markup, messageEl, messageStart)
    .replace(ERROR_SLOT_TITLE, () => tspanBlock(titleLines, titleEl ? titleEl.x : ERROR_LAYOUT.padX, titleLh))
    .replace(ERROR_SLOT_MESSAGE, () => tspanBlock(messageLines, messageEl ? messageEl.x : ERROR_LAYOUT.padX, messageLh));

  return resizeCard(filled, height);
}

function moveTextY(markup, el, y) {
  if (!el || el.y === y) return markup;
  const tag = el.tag.replace(/(\sy="\s*)[-\d.]+(\s*")/, `$1${y}$2`);
  return markup.slice(0, el.openStart) + tag + markup.slice(el.openEnd + 1);
}

function tspanBlock(lines, x, lineHeight) {
  if (!lines.length) return "";
  return lines
    .map((line, i) => `<tspan x="${x}"${i ? ` dy="${lineHeight}"` : ""}>${escapeXml(line)}</tspan>`)
    .join("");
}

const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;

function tokenize(text) {
  const tokens = [];
  let word = "";
  const flushWord = () => {
    if (word) tokens.push(word);
    word = "";
  };
  for (const ch of String(text)) {
    if (ch === "\n" || ch === "\r") {
      flushWord();
      if (ch === "\n") tokens.push("\n");
    } else if (ch === " ") {
      flushWord();
      tokens.push(" ");
    } else if (CJK_RE.test(ch)) {
      flushWord();
      tokens.push(ch);
    } else {
      word += ch;
    }
  }
  flushWord();
  return tokens;
}

function wrapLines(text, maxWidth, fontSize, maxLines = Infinity) {
  const lines = [];
  let cur = "";
  const flush = () => {
    lines.push(cur.trimEnd());
    cur = "";
  };

  for (const token of tokenize(text)) {
    if (token === "\n") {
      flush();
    } else if (token === " ") {
      if (cur) cur += " ";
    } else if (!cur) {
      if (textWidth(token, fontSize) <= maxWidth) {
        cur = token;
        continue;
      }
      let part = "";
      for (const ch of token) {
        if (part && textWidth(part + ch, fontSize) > maxWidth) {
          lines.push(part);
          part = ch;
        } else {
          part += ch;
        }
      }
      cur = part;
    } else if (textWidth(cur + token, fontSize) > maxWidth) {
      flush();
      cur = token;
    } else {
      cur += token;
    }
  }
  flush();

  const wrapped = lines.length ? lines.filter((line, i) => line !== "" || i === 0) : [""];
  if (wrapped.length > maxLines) {
    const kept = wrapped.slice(0, maxLines);
    kept[kept.length - 1] = ellipsize(kept[kept.length - 1], maxWidth, fontSize);
    return kept;
  }
  return wrapped;
}

function ellipsize(line, maxWidth, fontSize) {
  if (textWidth(`${line}…`, fontSize) <= maxWidth) return `${line}…`;
  let out = "";
  for (const ch of line) {
    if (textWidth(`${out}${ch}…`, fontSize) > maxWidth) break;
    out += ch;
  }
  return `${out}…`;
}

function svgSize(markup) {
  const start = markup.indexOf("<svg");
  const svgTag = start < 0 ? "" : markup.slice(start, markup.indexOf(">", start) + 1);
  const vb = svgTag.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/);
  return {
    width: vb ? Number(vb[1]) : numAttr(svgTag, "width", 260),
    height: vb ? Number(vb[2]) : numAttr(svgTag, "height", 90),
  };
}

function locateTextElement(markup, slot) {
  const idx = markup.indexOf(slot);
  if (idx < 0) return null;
  const openStart = markup.lastIndexOf("<text", idx);
  if (openStart < 0) return null;
  const openEnd = markup.indexOf(">", openStart);
  if (openEnd < 0 || openEnd > idx) return null;
  const open = markup.slice(openStart, openEnd + 1);
  const cls = (open.match(/class="([^"]*)"/) || [])[1] || "";
  const fallbackSize = cls.includes("desc") ? ERROR_LAYOUT.messageFontSize : ERROR_LAYOUT.titleFontSize;
  return {
    tag: open,
    openStart,
    openEnd,
    x: numAttr(open, "x", ERROR_LAYOUT.padX),
    y: numAttr(open, "y", ERROR_LAYOUT.titleY),
    fontSize: numAttr(open, "font-size", 0) || classFontSize(markup, cls, fallbackSize),
  };
}

function numAttr(tag, name, fallback) {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="\\s*([-\\d.]+)\\s*"`));
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function classFontSize(markup, cls, fallback) {
  for (const name of String(cls).trim().split(/\s+/)) {
    if (!name) continue;
    const safe = name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
    const m = markup.match(new RegExp(`\\.${safe}\\s*\\{[^}]*font-size\\s*:\\s*([\\d.]+)px`));
    if (m) return Number(m[1]);
  }
  return fallback;
}

function resizeCard(markup, height) {
  return markup
    .replace(/(viewBox="\s*[-\d.]+\s+[-\d.]+\s+[\d.]+\s+)[\d.]+/, `$1${height}`)
    .replace(/(<svg\b[^>]*\sheight=")[\d.]+/, `$1${height}`)
    .replace(/(<rect\b[^>]*class="[^"]*\bbg\b[^"]*"[^>]*\sheight=")[\d.]+/, `$1${height}`);
}

const API_BASE = "https://community-web.ccw.site";
const OID_RE = /^[0-9a-fA-F]{24}$/;

const BLACKLIST = new Set([
  "69704d3886bbc77f84e44e23",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== "/") {
      return new Response("Not Found", { status: 404 });
    }

    const oid = (url.searchParams.get("oid") || "").trim();
    const theme = (url.searchParams.get("theme") || "dark").toLowerCase() === "light" ? "light" : "dark";
    const card = Number(url.searchParams.get("card")) || 1;
    const animation = String(url.searchParams.get("animation") ?? "1") !== "0";

    if (!oid) {
      return svg(await renderError(env, theme, "参数错误", "缺少oid", { animation }), { "cache-control": "no-store" }, 400);
    }

    if (!OID_RE.test(oid)) {
      return svg(await renderError(env, theme, "参数错误", "无效的oid", { animation }), { "cache-control": "no-store" }, 400);
    }

    if (BLACKLIST.has(oid.toLowerCase())) {
      return svg(await renderError(env, theme, "他妈的这个傻逼用我的ProfileCard私自转发不标注原作者还感谢别人，碰到这样的傻子真无语了", "", { animation }), { "cache-control": "no-store" }, 403);
    }

    try {
      const template = await getCardTemplate(card, env);

      const cardTask = postJson(`${API_BASE}/user-card/detail`, { oid }).then(async (cardRes) => {
        const user = cardRes?.body?.user;
        if (!user) return { user: null, avatarImg: null };
        const avatarImg = user.avatar
          ? await fetchImageData(user.avatar, 600 * 1024, { width: 160, height: 160, fit: "cover", format: "jpeg", quality: 80 }).catch(() => null)
          : null;
        return { user, avatarImg };
      });

      const bgTask = postJson(`${API_BASE}/students/profile`, { studentOid: oid })
        .then((profileRes) => {
          const bgUrl = profileRes?.body?.memberArchive?.homepageCover || "";
          return bgUrl
            ? fetchImageData(bgUrl, Number.POSITIVE_INFINITY, { width: 800, height: 260, fit: "cover", format: "jpeg", quality: 70 })
            : null;
        })
        .catch(() => null);

      let cardResult;
      try {
        cardResult = await cardTask;
      } catch {
        return svg(await renderError(env, theme, "数据获取失败，请稍后重试", { animation }), { "cache-control": "no-store" }, 502);
      }

      const { user, avatarImg } = cardResult;
      if (!user) {
        return svg(await renderError(env, theme, "用户不存在", "未找到该用户", { animation }), { "cache-control": "no-store" }, 404);
      }

      const bgImg = await bgTask;

      const stats = user.statistics || {};
      const data = {
        name: user.name || "Unknown",
        avatarUri: avatarImg?.dataUri || "",
        backgroundUri: bgImg?.dataUri || "",
        bio: user.bio || "",
        likeCount: stats.likeCount ?? 0,
        followerCount: stats.followerCount ?? 0,
        reputationScore: user.reputationScore?.score ?? null,
      };

      return svg(renderCardSvg(template, data, theme, { animation }), {
        "cache-control": "public, max-age=60",
      });
    } catch (err) {
      console.error(err);
      return svg(await renderError(env, theme,"数据获取失败，请稍后重试", { animation }), { "cache-control": "no-store" }, 502);
    }
  },
};

async function postJson(url, body, timeoutMs = 6000) {
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);
  return res.json();
}

async function fetchImageData(url, maxBytes = 1024 * 1024, resizeOpts = null) {
  const meta = await probeImage(url);

  if (meta?.type === "gif" || meta?.type === "webp") {
    if (!meta.width || meta.width <= (resizeOpts?.width || 0)) {
      const original = await fetchAsDataUri(url).catch(() => null);
      if (original && original.bytes <= maxBytes) return original;
    }
    if (resizeOpts) {
      const resized = await fetchAsDataUri(
        ossResizeUrl(url, resizeOpts.width, resizeOpts.height, 0, "", "m_lfit")
      ).catch(() => null);
      if (resized && resized.bytes <= maxBytes) return resized;
    }
    return null;
  }

  if (meta?.type === "static") {
    if (!resizeOpts) {
      const original = await fetchAsDataUri(url).catch(() => null);
      return original && original.bytes <= maxBytes ? original : null;
    }
    const needResize = meta.width ? meta.width > resizeOpts.width : true;
    if (!needResize) {
      const original = await fetchAsDataUri(url).catch(() => null);
      if (original && original.bytes <= maxBytes) return original;
      if (resizeOpts) {
        const resized = await fetchAsDataUri(
          ossResizeUrl(url, resizeOpts.width, resizeOpts.height, resizeOpts.quality)
        ).catch(() => null);
        if (resized && resized.bytes <= maxBytes) return resized;
      }
      return null;
    }
    const resized = await fetchAsDataUri(
      ossResizeUrl(url, resizeOpts.width, resizeOpts.height, resizeOpts.quality)
    ).catch(() => null);
    if (resized && resized.bytes <= maxBytes) return resized;
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
    const original = await fetchAsDataUri(url).catch(() => null);
    if (original && original.bytes <= maxBytes) return original;
    return null;
  }

  const original = await fetchAsDataUri(url).catch(() => null);
  if (!original) return null;

  const isGif = original.dataUri.startsWith("data:image/gif");
  const isWebp = original.dataUri.startsWith("data:image/webp");

  if (isGif || isWebp) {
    if (!resizeOpts) return original;
    const resized = fetchAsDataUri(
      ossResizeUrl(url, resizeOpts.width, resizeOpts.height, 0, "", "m_lfit")
    ).catch(() => null);
    return (await pickSmallest([original, resized], maxBytes)) || original;
  }

  if (resizeOpts) {
    const resized = fetchAsDataUri(
      ossResizeUrl(url, resizeOpts.width, resizeOpts.height, resizeOpts.quality)
    ).catch(() => null);
    const hit = await pickSmallest([original, resized], maxBytes);
    if (hit) return hit;
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

  return original;
}

async function probeImage(url) {
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { range: "bytes=0-511" } }, 4000);
  } catch {
    return null;
  }
  if (!res.ok || res.status !== 206) {
    if (res.body) await res.body.cancel().catch(() => {});
    return null;
  }
  let buf;
  try {
    buf = new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
  if (buf.length < 4) return null;
  try {
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return buf.length >= 10
        ? { type: "gif", width: buf[6] | (buf[7] << 8), height: buf[8] | (buf[9] << 8) }
        : { type: "gif" };
    }
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return buf.length >= 24
        ? {
            type: "static",
            width: (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19],
            height: (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23],
          }
        : { type: "static" };
    }
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      if (buf[15] === 0x58 && buf.length >= 30) {
        return {
          type: "webp",
          width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
          height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
        };
      }
      if (buf[15] === 0x20 && buf.length >= 27) {
        return { type: "webp", width: buf[23] | (buf[24] << 8), height: buf[25] | (buf[26] << 8) };
      }
      if (buf[15] === 0x4c && buf.length >= 25) {
        const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
        return {
          type: "webp",
          width: 1 + (b0 | ((b1 & 0x3f) << 8)),
          height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)),
        };
      }
      return { type: "webp" };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      const size = parseJpegSize(buf);
      return size ? { type: "static", ...size } : { type: "static" };
    }
    return { type: "static" };
  } catch {
    return null;
  }
}

function parseJpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
    if (marker >= 0xd0 && marker <= 0xd7) { i += 2; continue; }
    if (marker === 0x01) { i += 2; continue; }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        width: (buf[i + 7] << 8) | buf[i + 8],
        height: (buf[i + 5] << 8) | buf[i + 6],
      };
    }
    i += 2 + len;
  }
  return null;
}

function pickSmallest(attempts, maxBytes) {
  return Promise.allSettled(attempts).then((settled) => {
    let best = null;
    for (const s of settled) {
      const v = s.status === "fulfilled" ? s.value : null;
      if (!v || v.bytes > maxBytes) continue;
      if (!best || v.bytes < best.bytes) best = v;
    }
    return best;
  });
}

function ossResizeUrl(url, width, height, quality, format = "jpg", fit = "m_fill") {
  const sep = url.includes("?") ? "&" : "?";
  const hPart = height ? `,h_${height}` : "";
  const qPart = quality ? `/quality,q_${quality}` : "";
  const fmtPart = format ? `/format,${format}` : "";
  return `${url}${sep}x-oss-process=image/resize,w_${width}${hPart},${fit}${fmtPart}${qPart}`;
}

async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function detectImageType(b64) {
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

async function fetchAsDataUri(url, fetchOpts = {}, timeoutMs = 5000) {
  let res;
  try {
    res = await fetchWithTimeout(url, fetchOpts, timeoutMs);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    const ct = res.headers.get("content-type") || "image/jpeg";
    const buf = await res.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    return {
      dataUri: `data:${detectImageType(b64)};base64,${b64}`,
      bytes: buf.byteLength,
      contentType: ct,
    };
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function svg(body, extraHeaders = {}, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      ...extraHeaders,
    },
  });
}
