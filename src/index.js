import { renderCardSvg } from "./render.js";
import { themeValues } from "./theme.js";

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

async function renderError(env, theme, title = "出错了", message = "无法加载数据，请稍后重试", opts = {}) {
  try {
    const tpl = await getCardTemplate("error", env);
    return renderCardSvg(tpl, { title, message }, theme, opts);
  } catch (err) {
    console.error("Failed to load Error.svg", err);
    const v = themeValues(theme);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 90" width="260" height="90" role="img" aria-label="出错了"><rect width="260" height="90" rx="14" fill="${v["--card-bg"]}"/><text x="20" y="38" font-family="sans-serif" font-size="16" font-weight="700" fill="${v["--name"]}">出错了</text><text x="20" y="60" font-family="sans-serif" font-size="12" fill="${v["--bio"]}">无法加载数据，请稍后重试</text></svg>`;
  }
}

const API_BASE = "https://community-web.ccw.site";
const OID_RE = /^[0-9a-fA-F]{24}$/;

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
