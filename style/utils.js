/**
 * 通用工具函数（与卡片 SVG 样式无关）
 */

/** 数字格式化：>=1w 显示 x.xw，>=1k 显示 x.xk */
export function fmt(n) {
  n = Number(n) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "w";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

/** XML 文本转义 */
export function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** XML 属性转义 */
export function escapeXmlAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 估算文字宽度：中文=1em，其它=0.55em */
export function textWidth(s, fontSize) {
  let units = 0;
  for (const ch of String(s)) {
    units += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 1 : 0.55;
  }
  return units * fontSize;
}

/** 超出 maxWidth 截断并加省略号 */
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

/** 把模板中的 {{key}} 替换为变量值，未提供的 key 替换为空 */
export function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : ""));
}
