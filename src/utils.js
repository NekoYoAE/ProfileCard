export function fmt(n) {
  n = Number(n) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "w";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeXmlAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function textWidth(s, fontSize) {
  let units = 0;
  for (const ch of String(s)) {
    units += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : 0.55;
  }
  return units * fontSize;
}

export function truncate(s, maxWidth, fontSize) {
  s = String(s);
  if (textWidth(s, fontSize) <= maxWidth) return s;
  let out = "";
  for (const ch of s) {
    if (textWidth(out + ch + "…", fontSize) > maxWidth) break;
    out += ch;
  }
  return out + "…";
}

export function numAttr(tag, name, fallback) {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="\\s*([-\\d.]+)\\s*"`));
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function svgSize(markup) {
  const start = markup.indexOf("<svg");
  const svgTag = start < 0 ? "" : markup.slice(start, markup.indexOf(">", start) + 1);
  const vb = svgTag.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/);
  return {
    width: vb ? Number(vb[1]) : numAttr(svgTag, "width", 260),
    height: vb ? Number(vb[2]) : numAttr(svgTag, "height", 90),
  };
}

export function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : ""));
}
