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

export function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : ""));
}
