#!/usr/bin/env node
// Crops a device mockup down to its largest opaque part, dropping anything that
// floats beside it — the iPad Pro export ships with an Apple Pencil alongside.
//   node tools/crop-device-frame.mjs assets/ipad.png
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("usage: crop-device-frame.mjs <png>"); process.exit(1); }

const b = await chromium.launch();
const p = await b.newPage();
const out = await p.evaluate(async (src) => {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const { data: d } = g.getImageData(0, 0, c.width, c.height);
  const W = c.width, H = c.height, N = W * H;

  const solid = new Uint8Array(N);
  for (let n = 0; n < N; n++) solid[n] = d[n * 4 + 3] > 24 ? 1 : 0;

  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  let best = null;
  for (let s = 0; s < N; s++) {
    if (!solid[s] || seen[s]) continue;
    let top = 0, area = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    seen[s] = 1; stack[top++] = s;
    while (top) {
      const n = stack[--top], x = n % W, y = (n / W) | 0;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const m of [x > 0 ? n - 1 : -1, x < W - 1 ? n + 1 : -1, y > 0 ? n - W : -1, y < H - 1 ? n + W : -1]) {
        if (m >= 0 && solid[m] && !seen[m]) { seen[m] = 1; stack[top++] = m; }
      }
    }
    if (!best || area > best.area) best = { area, x0, y0, x1, y1 };
  }

  const w = best.x1 - best.x0 + 1, h = best.y1 - best.y0 + 1;
  const c2 = document.createElement("canvas");
  c2.width = w; c2.height = h;
  c2.getContext("2d").drawImage(c, best.x0, best.y0, w, h, 0, 0, w, h);
  return { url: c2.toDataURL("image/png"), was: `${W}x${H}`, now: `${w}x${h}` };
}, `data:image/png;base64,${readFileSync(file).toString("base64")}`);
await b.close();

writeFileSync(file, Buffer.from(out.url.split(",")[1], "base64"));
console.log(`${file}: ${out.was} -> ${out.now}`);
