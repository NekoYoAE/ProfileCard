const TEXT = "加载出错";
function measureWidth(text, fontSize) {
  let w = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fa5]/.test(ch)) w += fontSize;
    else if (/\d/.test(ch)) w += fontSize * 0.6;
    else if (ch === " ") w += fontSize * 0.3;
    else w += fontSize * 0.55;
  }
  return w;
}

export function renderErrorSvg(theme = "dark") {
  const isDark = theme !== "light";
  const fontSize = 16;
  const padX = 22;
  const padY = 12;
  const width = Math.ceil(measureWidth(TEXT, fontSize) + padX * 2);
  const height = Math.ceil(fontSize + padY * 2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="加载出错">
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif; }
  .card-bg { fill: ${isDark ? "#1c1f26" : "#ffffff"}; }
  .err-text { fill: ${isDark ? "#fca5a5" : "#dc2626"}; font-size: ${fontSize}px; font-weight: 600; }
</style>
<rect class="card-bg" x="0" y="0" width="${width}" height="${height}" rx="10" />
<text class="err-text" x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central">${TEXT}</text>
</svg>`;
}
