// The preview shelf, drawn: the device's body as SVG, and on its screen the status bar
// and browser chrome as HTML, so the page in the iframe gets the height a real browser
// leaves it. Nothing here is a picture of anyone's product — shapes, own icons, system
// fonts. Heights are measured values (iOS 26 Safari, Chrome, macOS 27, Windows 11), see
// CHROME below; where a number is an estimate it says so.
import type { Device } from "./config";

export type Look = {
  /** the whole drawing: body plus a laptop's base or a monitor's stand */
  footprint: { w: number; h: number };
  /** the screen inside it */
  screen: { x: number; y: number; w: number; h: number; r: number; rb: number };
  topH: number;
  bottomH: number;
  shell: string;
  top: string;
  bottom: string;
  /** Safari and Chrome on phones fold their bars away on scroll */
  canMinimize: boolean;
  /** Windows draws a real scrollbar that takes width; everything else floats it */
  scrollbar: "overlay" | "classic";
};

const esc = (v: string) =>
  v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/* Own glyphs, 20×20, stroked like the bar's icons unless filled on purpose. */
const I = {
  signal: `<svg viewBox="0 0 20 20" class="dt-i dt-i--fill"><rect x="1" y="12" width="3.2" height="5" rx="1"/><rect x="5.6" y="9" width="3.2" height="8" rx="1"/><rect x="10.2" y="6" width="3.2" height="11" rx="1"/><rect x="14.8" y="3" width="3.2" height="14" rx="1"/></svg>`,
  wifi: `<svg viewBox="0 0 20 20" class="dt-i dt-i--fill"><path d="M10 16.6 7.4 13.8a3.7 3.7 0 0 1 5.2 0z"/><path d="M4.8 11.1a7.4 7.4 0 0 1 10.4 0l-1.3 1.4a5.5 5.5 0 0 0-7.8 0z"/><path d="M2.2 8.3a11.1 11.1 0 0 1 15.6 0l-1.3 1.4a9.2 9.2 0 0 0-13 0z"/></svg>`,
  battery: `<svg viewBox="0 0 28 14" class="dt-i dt-i--batt"><rect x="1" y="1" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".4"/><rect x="3" y="3" width="17" height="8" rx="2" fill="currentColor"/><path d="M26 5v4a2 2 0 0 0 0-4z" fill="currentColor" fill-opacity=".4"/></svg>`,
  back: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M12.5 4 6.5 10l6 6"/></svg>`,
  fwd: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M7.5 4l6 6-6 6"/></svg>`,
  reload: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9"/><path d="M14.2 3.2v3.2H11"/></svg>`,
  dots: `<svg viewBox="0 0 20 20" class="dt-i dt-i--fill"><circle cx="4.5" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="15.5" cy="10" r="1.6"/></svg>`,
  dotsV: `<svg viewBox="0 0 20 20" class="dt-i dt-i--fill"><circle cx="10" cy="4.5" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="10" cy="15.5" r="1.6"/></svg>`,
  share: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M10 12.5V2.8M6.8 5.8 10 2.6l3.2 3.2"/><path d="M6.5 8.5H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 17.5h10a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 15 8.5h-1.5"/></svg>`,
  plus: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M10 4v12M4 10h12"/></svg>`,
  tabs: `<svg viewBox="0 0 20 20" class="dt-i"><rect x="3" y="6" width="11" height="11" rx="2"/><path d="M6 3.5h8.5A2.5 2.5 0 0 1 17 6v8.5"/></svg>`,
  sidebar: `<svg viewBox="0 0 20 20" class="dt-i"><rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M8 4v12"/></svg>`,
  lock: `<svg viewBox="0 0 20 20" class="dt-i"><rect x="5" y="9" width="10" height="8" rx="1.8"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>`,
  tune: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M3 6.5h8M15 6.5h2M3 13.5h2M9 13.5h8"/><circle cx="13" cy="6.5" r="2"/><circle cx="7" cy="13.5" r="2"/></svg>`,
  star: `<svg viewBox="0 0 20 20" class="dt-i"><path d="m10 3 2.1 4.4 4.8.6-3.5 3.3.9 4.7L10 13.7 5.7 16l.9-4.7L3.1 8l4.8-.6z" stroke-linejoin="round"/></svg>`,
  user: `<svg viewBox="0 0 20 20" class="dt-i dt-i--fill"><circle cx="10" cy="10" r="8" fill-opacity=".25"/><circle cx="10" cy="8" r="3"/><path d="M4.8 15.3a6 6 0 0 1 10.4 0 7.9 7.9 0 0 1-10.4 0z"/></svg>`,
  recent: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M5.5 5v10M10 5v10M14.5 5v10"/></svg>`,
  home: `<svg viewBox="0 0 20 20" class="dt-i"><rect x="4.5" y="4.5" width="11" height="11" rx="3.5"/></svg>`,
  navBack: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>`,
  close: `<svg viewBox="0 0 20 20" class="dt-i"><path d="m5.5 5.5 9 9m0-9-9 9"/></svg>`,
  winMin: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M5 10h10"/></svg>`,
  winMax: `<svg viewBox="0 0 20 20" class="dt-i"><rect x="5" y="5" width="10" height="10" rx="1.5"/></svg>`,
  chevUp: `<svg viewBox="0 0 20 20" class="dt-i"><path d="m6 12 4-4 4 4"/></svg>`,
  volume: `<svg viewBox="0 0 20 20" class="dt-i"><path d="M3.5 8v4h3l4 3.5v-11l-4 3.5z" stroke-linejoin="round"/><path d="M13.5 7.5a3.5 3.5 0 0 1 0 5"/></svg>`,
};

const clock = (now: Date, opts: Intl.DateTimeFormatOptions) => now.toLocaleTimeString("en-US", opts);
const hm = (now: Date) => clock(now, { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?[AP]M$/, "");

/* ---------- bodies ---------- */

type Frame = { side: number; top: number; bottom: number; r: number; rb?: number; body: number; extraW?: number; extraH?: number };

const FRAMES: Record<Device["shell"], (d: Device) => Frame> = {
  // corner radius of the glass on a 393 / 440 wide Dynamic Island iPhone
  island: (d) => ({ side: 12, top: 12, bottom: 12, r: d.w >= 430 ? 62 : 55, body: d.w >= 430 ? 74 : 67, extraW: 6 }),
  home: () => ({ side: 18, top: 92, bottom: 92, r: 0, body: 56, extraW: 6 }),
  punch: () => ({ side: 9, top: 9, bottom: 9, r: 34, body: 43, extraW: 6 }),
  tablet: () => ({ side: 26, top: 26, bottom: 26, r: 18, body: 44 }),
  macbook: (d) => ({ side: 16, top: 18, bottom: 24, r: 10, rb: 0, body: 20, extraW: Math.round((d.w + 32) * 0.12), extraH: 18 }),
  laptop: (d) => ({ side: 12, top: 14, bottom: 28, r: 4, rb: 0, body: 12, extraW: Math.round((d.w + 24) * 0.08), extraH: 16 }),
  monitor: () => ({ side: 12, top: 12, bottom: 34, r: 0, body: 10, extraH: 96 }),
};

function shellSvg(d: Device, f: Frame, fw: number, fh: number, sx: number) {
  const W = d.w + 2 * f.side;
  const H = d.h + f.top + f.bottom;
  const x = (fw - W) / 2;
  const screen = `<rect class="dt-shell-screen" x="${sx}" y="${f.top}" width="${d.w}" height="${d.h}" rx="${f.r}"/>`;
  let parts = "";
  if (d.shell === "island" || d.shell === "home" || d.shell === "punch") {
    // side buttons: action + volume on the left, power on the right
    const btn = (bx: number, by: number, bh: number) => `<rect class="dt-shell-btn" x="${bx}" y="${by}" width="4" height="${bh}" rx="2"/>`;
    parts += d.shell === "punch"
      ? btn(x + W - 1, 150, 70) + btn(x + W - 1, 240, 44)
      : btn(x - 3, 120, 28) + btn(x - 3, 170, 56) + btn(x - 3, 236, 56) + btn(x + W - 1, 190, 90);
    parts += `<rect class="dt-shell-body" x="${x}" y="0" width="${W}" height="${H}" rx="${f.body}"/>`;
    parts += `<rect class="dt-shell-bezel" x="${x + 3}" y="3" width="${W - 6}" height="${H - 6}" rx="${f.body - 3}"/>`;
    if (d.shell === "home") {
      parts += `<rect class="dt-shell-slot" x="${fw / 2 - 26}" y="44" width="52" height="6" rx="3"/>`;
      parts += `<circle class="dt-shell-slot" cx="${fw / 2 - 48}" cy="47" r="5"/>`;
      parts += `<circle class="dt-shell-homebtn" cx="${fw / 2}" cy="${H - 46}" r="28"/>`;
    }
  } else if (d.shell === "tablet") {
    parts += `<rect class="dt-shell-body dt-shell-body--light" x="${x}" y="0" width="${W}" height="${H}" rx="${f.body}"/>`;
    parts += `<rect class="dt-shell-bezel" x="${x + 4}" y="4" width="${W - 8}" height="${H - 8}" rx="${f.body - 4}"/>`;
  } else if (d.shell === "monitor") {
    const neckW = Math.round(W * 0.1);
    parts += `<path class="dt-shell-stand" d="M${fw / 2 - neckW / 2} ${H - 2}h${neckW}l${neckW * 0.2} 84h${-neckW * 1.4}z"/>`;
    parts += `<rect class="dt-shell-stand" x="${fw / 2 - W * 0.15}" y="${H + 80}" width="${W * 0.3}" height="14" rx="7"/>`;
    parts += `<rect class="dt-shell-body" x="${x}" y="0" width="${W}" height="${H}" rx="${f.body}"/>`;
  } else {
    // laptops: the lid, then the base wider than it, with the lip you open it by
    const bw = W + (f.extraW ?? 0);
    const bx = (fw - bw) / 2;
    const bh = f.extraH ?? 16;
    parts += `<path class="dt-shell-body" d="M${x} ${f.body}a${f.body} ${f.body} 0 0 1 ${f.body} ${-f.body}h${W - 2 * f.body}a${f.body} ${f.body} 0 0 1 ${f.body} ${f.body}V${H}H${x}z"/>`;
    parts += `<path class="dt-shell-base${d.shell === "macbook" ? " dt-shell-base--silver" : ""}" d="M${bx} ${H}h${bw}v${bh - 8}a8 8 0 0 1-8 8H${bx + 8}a8 8 0 0 1-8-8z"/>`;
    parts += `<rect class="dt-shell-lip" x="${fw / 2 - W * 0.07}" y="${H}" width="${W * 0.14}" height="5" rx="2.5"/>`;
  }
  return `<svg viewBox="0 0 ${fw} ${fh}" width="${fw}" height="${fh}" aria-hidden="true">${parts}${screen}</svg>`;
}

/* ---------- browser chrome ----------
   Heights, in CSS px:
   - iOS 26 Safari, compact tab bar (the default): the status strip is the top safe area
     (59 on 393-wide Dynamic Island phones, 62 on 402/440, 20 on a home-button phone);
     the bottom band is 98 with the bars shown, 58 folded. innerHeight measured on
     devices: 393×695, 440×796, SE 375×549 — this layout gives exactly those.
   - Chrome on Android: status bar (Samsung does not publish its height; 36 is an
     estimate for a punch-hole Galaxy), toolbar 56 (hides on scroll), three-button
     navigation 48 (Samsung's default).
   - iPadOS 26 Safari: status 24, toolbar 50 (estimate), home indicator 20.
   - macOS 27: menu bar 33, Safari toolbar 52 (one tab), Dock 59 below the window.
   - Chrome on Windows 11: tab strip 41 + toolbar 46 (Chromium source), taskbar 48. */

type Chrome = { top: number; bottom: number; topMin?: number; bottomMin?: number };

const CHROME: Record<Device["browser"], (d: Device) => Chrome> = {
  "safari-ios": (d) => {
    const status = d.shell === "home" ? 20 : d.w >= 400 ? 62 : 59;
    return { top: status, bottom: 98, topMin: status, bottomMin: 58 };
  },
  "chrome-android": () => ({ top: 36 + 56, bottom: 48, topMin: 36, bottomMin: 48 }),
  "safari-ipad": () => ({ top: 24 + 50, bottom: 20 }),
  "safari-mac": () => ({ top: 33 + 52, bottom: 59 }),
  "chrome-windows": () => ({ top: 41 + 46, bottom: 48 }),
};

type Ctx = { d: Device; host: string; title: string; now: Date; min: boolean; cutout?: { x: number; y: number; width: number; height: number } };

const iosStatus = ({ d, now, cutout }: Ctx, h: number) => {
  if (d.shell === "home") {
    return `<div class="dt-sb dt-sb--mini" style="height:${h}px"><span class="dt-sb-l">${I.signal}${I.wifi}</span>` +
      `<b>${hm(now)}</b><span class="dt-sb-r">${I.battery}</span></div>`;
  }
  const island = cutout ?? { x: (d.w - 125) / 2, y: 11, width: 125, height: 37 };
  return `<div class="dt-sb" style="height:${h}px"><span class="dt-island" style="left:${island.x}px;top:${island.y}px;width:${island.width}px;height:${island.height}px"></span>` +
    `<b class="dt-sb-time" style="top:${island.y}px;height:${island.height}px">${hm(now)}</b>` +
    `<span class="dt-sb-icons" style="top:${island.y}px;height:${island.height}px">${I.signal}${I.wifi}${I.battery}</span></div>`;
};

const iosBottom = ({ d, host, min }: Ctx, h: number) => {
  const indicator = d.shell === "home" ? "" : `<i class="dt-home-ind"></i>`;
  if (min) return `<div class="dt-ios-bar is-min" style="height:${h}px"><span class="dt-ios-mini">${esc(host)}</span>${indicator}</div>`;
  return `<div class="dt-ios-bar" style="height:${h}px"><div class="dt-ios-row">` +
    `<button class="dt-glass dt-glass--round" data-nav="back">${I.back}</button>` +
    `<span class="dt-glass dt-ios-url"><span>${esc(host)}</span><button data-nav="reload">${I.reload}</button></span>` +
    `<span class="dt-glass dt-glass--round">${I.dots}</span></div>${indicator}</div>`;
};

const androidTop = ({ now, min }: Ctx, host: string) =>
  `<div class="dt-sb dt-sb--android" style="height:36px"><b>${clock(now, { hour: "numeric", minute: "2-digit", hour12: false })}</b>` +
  `<span class="dt-punch"></span><span class="dt-sb-r">${I.wifi}${I.signal}${I.battery}</span></div>` +
  (min ? "" : `<div class="dt-and-bar"><span class="dt-and-url">${I.tune}<span>${esc(host)}</span></span>` +
    `<span class="dt-and-tabs">1</span>${I.dotsV}</div>`);

const androidNav = () => `<div class="dt-and-nav">${I.recent}${I.home}${I.navBack}</div>`;

const ipadTop = ({ now, host }: Ctx) =>
  `<div class="dt-sb dt-sb--flat" style="height:24px"><b>${hm(now)} ${now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b>` +
  `<span class="dt-sb-r">${I.wifi}${I.battery}</span></div>` +
  `<div class="dt-ipad-bar"><span class="dt-bar-group">${I.sidebar}<button data-nav="back">${I.back}</button><button data-nav="fwd">${I.fwd}</button></span>` +
  `<span class="dt-ipad-url">${I.lock}<span>${esc(host)}</span><button data-nav="reload">${I.reload}</button></span>` +
  `<span class="dt-bar-group">${I.share}${I.plus}${I.tabs}</span></div>`;

const macTop = ({ now, host }: Ctx, notch: boolean) =>
  `<div class="dt-mac-menu"><span class="dt-mac-apps"><b>Safari</b><span>File</span><span>Edit</span><span>View</span><span>History</span><span>Bookmarks</span><span>Window</span><span>Help</span></span>` +
  (notch ? `<span class="dt-mac-notch"></span>` : "") +
  `<span class="dt-sb-r">${I.wifi}${I.battery}<span>${now.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}&nbsp; ${hm(now)}</span></span></div>` +
  `<div class="dt-mac-bar"><span class="dt-lights"><i></i><i></i><i></i></span>` +
  `<span class="dt-bar-group">${I.sidebar}<button data-nav="back">${I.back}</button><button data-nav="fwd">${I.fwd}</button></span>` +
  `<span class="dt-mac-url">${I.lock}<span>${esc(host)}</span><button data-nav="reload">${I.reload}</button></span>` +
  `<span class="dt-bar-group">${I.share}${I.plus}${I.tabs}</span></div>`;

const macDock = () =>
  `<div class="dt-mac-dock"><span class="dt-dock">${Array.from({ length: 9 }, (_, i) => `<i style="--hue:${i * 40}"></i>`).join("")}</span></div>`;

const winTop = ({ host, title }: Ctx) =>
  `<div class="dt-win-tabs"><span class="dt-win-tab"><i class="dt-fav"></i><span>${esc(title || host)}</span>${I.close}</span>` +
  `<span class="dt-win-new">${I.plus}</span><span class="dt-win-ctrl">${I.winMin}${I.winMax}${I.close}</span></div>` +
  `<div class="dt-win-bar"><span class="dt-bar-group"><button data-nav="back">${I.back}</button><button data-nav="fwd">${I.fwd}</button><button data-nav="reload">${I.reload}</button></span>` +
  `<span class="dt-win-url">${I.tune}<span>${esc(host)}</span>${I.star}</span><span class="dt-bar-group">${I.user}${I.dotsV}</span></div>`;

const winTaskbar = ({ now }: Ctx) =>
  `<div class="dt-win-task"><span class="dt-win-apps">${Array.from({ length: 6 }, (_, i) => `<i style="--hue:${200 + i * 30}"></i>`).join("")}</span>` +
  `<span class="dt-win-tray">${I.chevUp}${I.wifi}${I.volume}${I.battery}<span class="dt-win-clock">${clock(now, { hour: "numeric", minute: "2-digit" })}<br>${now.toLocaleDateString("en-US")}</span></span></div>`;

export function drawDevice(d: Device, ctx: Omit<Ctx, "d">): Look {
  const f = FRAMES[d.shell](d);
  const W = d.w + 2 * f.side;
  const H = d.h + f.top + f.bottom;
  const fw = W + (f.extraW ?? 0);
  const fh = H + (d.shell === "monitor" || d.shell === "macbook" || d.shell === "laptop" ? f.extraH ?? 0 : 0);
  const sx = (fw - W) / 2 + f.side;
  const c = CHROME[d.browser](d);
  const topH = ctx.min ? c.topMin ?? c.top : c.top;
  const bottomH = ctx.min ? c.bottomMin ?? c.bottom : c.bottom;
  const full: Ctx = { ...ctx, d };

  let top = "";
  let bottom = "";
  switch (d.browser) {
    case "safari-ios": top = iosStatus(full, topH); bottom = iosBottom(full, bottomH); break;
    case "chrome-android": top = androidTop(full, ctx.host); bottom = androidNav(); break;
    case "safari-ipad": top = ipadTop(full); bottom = `<div class="dt-ipad-foot"><i class="dt-home-ind"></i></div>`; break;
    case "safari-mac": top = macTop(full, d.shell === "macbook"); bottom = macDock(); break;
    case "chrome-windows": top = winTop(full); bottom = winTaskbar(full); break;
  }
  return {
    footprint: { w: fw, h: fh },
    screen: { x: sx, y: f.top, w: d.w, h: d.h, r: f.r, rb: f.rb ?? f.r },
    topH,
    bottomH,
    shell: shellSvg(d, f, fw, fh, sx),
    top,
    bottom,
    canMinimize: c.topMin !== undefined && (c.topMin !== c.top || c.bottomMin !== c.bottom),
    scrollbar: d.browser === "chrome-windows" ? "classic" : "overlay",
  };
}

/* Any CSS colour — rgb(), #hex, a name, oklch(), color() — as sRGB bytes and alpha,
   read back through a 1×1 canvas: the browser parses, not a regex. */
let pixel: CanvasRenderingContext2D | null = null;
export function rgbaOf(color: string): [number, number, number, number] {
  pixel ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 })
    .getContext("2d", { willReadFrequently: true });
  if (!pixel || !color) return [0, 0, 0, 0];
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = "rgba(0, 0, 0, 0)";
  pixel.fillStyle = color; // an unparsable colour leaves the transparent one in place
  pixel.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}
const css = ([r, g, b]: number[]) => `rgb(${r}, ${g}, ${b})`;

/* What colour the browser paints its bars with. iOS Safari tints the status strip and the
   bottom band from the page: a fixed or sticky element at least 90% of the width within
   4px of that edge (WebKit's LocalFrameView::fixedContainerEdges), else the page's own
   background. Chrome on Android takes <meta name="theme-color">. */
export function pageTints(doc: Document) {
  const win = doc.defaultView!;
  const clear = (c: string) => !c || rgbaOf(c)[3] === 0;
  const bgRaw = [doc.body, doc.documentElement].map((el) => el && win.getComputedStyle(el).backgroundColor).find((c) => c && !clear(c));
  // a see-through page background sits on the browser's white
  const [br, bgn, bb, ba] = bgRaw ? rgbaOf(bgRaw) : [255, 255, 255, 1];
  const bg = [br, bgn, bb].map((v) => Math.round(v * ba + 255 * (1 - ba)));
  // a see-through bar is blended over the page, as WebKit does below 75% opacity
  const over = (c: string) => {
    const [r, g, b, a] = rgbaOf(c);
    if (a >= 0.75) return css([r, g, b]);
    const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a));
    return css([mix(r, bg[0]), mix(g, bg[1]), mix(b, bg[2])]);
  };
  const edge = (y: number) => {
    let el = doc.elementFromPoint(win.innerWidth / 2, y);
    for (; el && el !== doc.documentElement; el = el.parentElement) {
      const cs = win.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const wide = el.getBoundingClientRect().width >= win.innerWidth * 0.9;
      // a frosted bar has no one colour, so it tints nothing
      const frosted = cs.backdropFilter && cs.backdropFilter !== "none";
      return wide && !frosted && !clear(cs.backgroundColor) ? over(cs.backgroundColor) : null;
    }
    return null;
  };
  const themeRaw = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content || "";
  const theme = themeRaw && !clear(themeRaw) ? css(rgbaOf(themeRaw)) : "";
  return { top: edge(4) ?? css(bg), bottom: edge(win.innerHeight - 4) ?? css(bg), theme };
}

/** Black or white ink for text on a colour. */
export function inkFor(color: string) {
  const [r, g, b] = rgbaOf(color).map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#000" : "#fff";
}
