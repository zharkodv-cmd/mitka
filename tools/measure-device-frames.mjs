#!/usr/bin/env node
// Measures the screen cut-out of each device mockup in assets/.
// The mockups are PNGs whose screen is a transparent hole, so the screen is the
// largest transparent region that does NOT touch the image border — the outside
// background is transparent too, and it is the one that reaches the edges.
//
// Prints a table ready to paste into src/presets.mjs.
//   node tools/measure-device-frames.mjs
import { chromium } from "playwright";
import { readFileSync, readdirSync } from "node:fs";

const dir = "assets";
const files = readdirSync(dir).filter((f) => /\.(png|webp)$/.test(f));
const b = await chromium.launch();
const p = await b.newPage();
const out = {};

for (const f of files) {
  const b64 = readFileSync(`${dir}/${f}`).toString("base64");
  out[f] = await p.evaluate(async (src) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const { data: d } = g.getImageData(0, 0, c.width, c.height);
    const W = c.width, H = c.height, N = W * H;

    const clear = new Uint8Array(N);
    for (let n = 0; n < N; n++) clear[n] = d[n * 4 + 3] < 16 ? 1 : 0;

    // Flood the transparent background inwards from every border pixel.
    const seen = new Uint8Array(N);
    const stack = new Int32Array(N);
    let top = 0;
    const push = (n) => { if (clear[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (top) {
      const n = stack[--top], x = n % W, y = (n / W) | 0;
      if (x > 0) push(n - 1);
      if (x < W - 1) push(n + 1);
      if (y > 0) push(n - W);
      if (y < H - 1) push(n + W);
    }

    // Whatever transparency is left is enclosed by the device: the screen.
    let best = null;
    for (let s = 0; s < N; s++) {
      if (!clear[s] || seen[s]) continue;
      let area = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
      top = 0; seen[s] = 1; stack[top++] = s;
      while (top) {
        const n = stack[--top], x = n % W, y = (n / W) | 0;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const m of [x > 0 ? n - 1 : -1, x < W - 1 ? n + 1 : -1, y > 0 ? n - W : -1, y < H - 1 ? n + W : -1]) {
          if (m >= 0 && clear[m] && !seen[m]) { seen[m] = 1; stack[top++] = m; }
        }
      }
      if (!best || area > best.area) best = { area, sx: x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1 };
    }
    return { w: W, h: H, ...(best || {}) };
  }, `data:image/${f.endsWith(".webp") ? "webp" : "png"};base64,${b64}`);
}
await b.close();

for (const [f, m] of Object.entries(out)) {
  if (!m.sw) { console.log(`${f}: no enclosed transparent area found`); continue; }
  console.log(
    `${f.padEnd(20)} image ${m.w}x${m.h}  screen ${m.sw}x${m.sh} at ${m.sx},${m.sy}` +
    `  aspect ${(m.sw / m.sh).toFixed(3)}`);
  console.log(`  frame: { src: '/__devbar/assets/${f}', w: ${m.w}, h: ${m.h}, sx: ${m.sx}, sy: ${m.sy}, sw: ${m.sw}, sh: ${m.sh} },`);
}
