import { renderCardSvg as renderCard1 } from "../style/Card_1.js";
import { renderErrorSvg } from "../style/Error.js";
// import { renderCardSvg as renderCard2 } from "../style/Card_2.js";

// card参数
const cardStyles = {
  1: renderCard1,
  // 2: renderCard2,
};

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
    const renderCard = cardStyles[card] || renderCard1;

    if (!oid) {
      return svg(renderErrorSvg(theme), { "cache-control": "no-store" }, 400);
    }

    if (!OID_RE.test(oid)) {
      return svg(renderErrorSvg(theme), { "cache-control": "no-store" }, 400);
    }

    try {

      const cardTask = postJson(`${API_BASE}/user-card/detail`, { oid }).then(async (cardRes) => {
        const user = cardRes?.body?.user;
        if (!user) return { user: null, avatarImg: null };
        const avatarImg = user.avatar
          ? await fetchImageData(user.avatar, 600 * 1024, { width: 160, height: 160, fit: "cover", format: "jpeg", quality: 80 })
          : null;
        return { user, avatarImg };
      });

      const bgTask = postJson(`${API_BASE}/students/profile`, { studentOid: oid })
        .then((profileRes) => {
          const bgUrl = profileRes?.body?.memberArchive?.homepageCover || "";
          return bgUrl
            ? fetchImageData(bgUrl, 1024 * 1024, { width: 800, height: 260, fit: "cover", format: "jpeg", quality: 70 })
            : null;
        })
        .catch(() => null);

      let cardResult;
      try {
        cardResult = await cardTask;
      } catch {
        return svg(renderErrorSvg(theme), { "cache-control": "no-store" }, 502);
      }

      const { user, avatarImg } = cardResult;
      if (!user) {
        return svg(renderErrorSvg(theme), { "cache-control": "no-store" }, 404);
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

      return svg(renderCard(data, theme), {
        "cache-control": "no-store",
      });
    } catch (err) {
      console.error(err);
      return svg(renderErrorSvg(theme), { "cache-control": "no-store" }, 502);
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
  const attempts = [fetchAsDataUri(url)];
  if (resizeOpts) {
    attempts.push(
      fetchAsDataUri(ossResizeUrl(url, resizeOpts.width, resizeOpts.height, resizeOpts.quality))
    );
  }
  const hit = await firstImageMatch(attempts, maxBytes);
  if (hit) return hit;
  if (resizeOpts) {
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
  }

  return null;
}

function firstImageMatch(attempts, maxBytes) {
  return new Promise((resolve) => {
    let pending = attempts.length;
    if (pending === 0) return resolve(null);
    attempts.forEach((p) => {
      Promise.resolve(p).then(
        (v) => {
          if (v && v.bytes <= maxBytes) return resolve(v);
          if (--pending === 0) resolve(null);
        },
        () => {
          if (--pending === 0) resolve(null);
        }
      );
    });
  });
}

function ossResizeUrl(url, width, height, quality) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}x-oss-process=image/resize,w_${width},h_${height},m_fill/format,jpg/quality,q_${quality}`;
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
