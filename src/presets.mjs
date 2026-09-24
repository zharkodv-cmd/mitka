// Device mockups, devices and default breakpoints. Pure data — the integration ships
// it to the browser as JSON and the CLI never needs it.
//
// Frame geometry (sx/sy/sw/sh = the transparent screen hole inside the picture) is
// measured by `node tools/measure-device-frames.mjs`, not typed. The pictures live in
// this package's assets/ and are served by the dev middleware under /__devbar/assets/.

/** @typedef {{ src: string, w: number, h: number, sx: number, sy: number, sw: number, sh: number }} DeviceFrame */

const asset = (name) => `/__devbar/assets/${name}`;

/** @type {Record<string, DeviceFrame>} */
export const FRAMES = {
  macbook: { src: asset('macbook.webp'), w: 3460, h: 2060, sx: 450, sy: 230, sw: 2560, sh: 1600 },
  ipad: { src: asset('ipad.webp'), w: 1942, h: 2583, sx: 95, sy: 100, sw: 1668, sh: 2388 },
  ipadLandscape: { src: asset('ipad-landscape.webp'), w: 2583, h: 1942, sx: 100, sy: 179, sw: 2388, sh: 1668 },
  iphone15Pro: { src: asset('iphone-15-pro.svg'), w: 413, h: 872, sx: 10, sy: 10, sw: 393, sh: 852 },
  iphone11Pro: { src: asset('iphone.webp'), w: 1385, h: 2696, sx: 130, sy: 130, sw: 1125, sh: 2436 },
  iphone11ProMax: { src: asset('iphone-11-pro-max.webp'), w: 1413, h: 2844, sx: 86, sy: 78, sw: 1242, sh: 2688 },
  iphone8: { src: asset('iphone-8.webp'), w: 871, h: 1788, sx: 61, sy: 219, sw: 750, sh: 1334 },
  iphoneLandscape: { src: asset('iphone-landscape.webp'), w: 2696, h: 1385, sx: 130, sy: 130, sw: 2436, sh: 1125 },
};

/* Glyphs for the breakpoint switcher, keyed by breakpoint id (Webflow's monitor /
   laptop / tablet / phone set). Paths are stroked with currentColor at 1.5,
   viewBox 0 0 20 20. A breakpoint may carry its own `icon` instead. */
export const ICONS = {
  desktop: '<rect x="2" y="4" width="16" height="10" rx="1.5"/><path d="M7 17h6M10 14v3"/>',
  laptop: '<rect x="3" y="5" width="14" height="9" rx="1.5"/><path d="M1.5 16.5h17"/>',
  tablet: '<rect x="5" y="2" width="10" height="16" rx="1.5"/><path d="M9 15.5h2"/>',
  landscape: '<rect x="2" y="6" width="16" height="9" rx="1.5"/><path d="M15.5 9v3"/>',
  portrait: '<rect x="6" y="2" width="8" height="16" rx="1.5"/><path d="M9 15.5h2"/>',
};
ICONS.mobile = ICONS.portrait; // the single phone band of a three-band site

/**
 * Default bands: desktop ≥992, tablet, mobile landscape, mobile portrait — the edges
 * most hand-written CSS switches at. `max: Infinity` is fine here — the integration serialises it.
 * `ideal` is the width the canvas opens at.
 * @typedef {{ id: string, label: string, min: number, max: number, ideal: number, icon?: string }} Breakpoint
 * @type {Breakpoint[]}
 */
export const BREAKPOINTS = [
  { id: 'desktop', label: 'Desktop', min: 992, max: Infinity, ideal: 1440 },
  { id: 'tablet', label: 'Tablet', min: 768, max: 991, ideal: 834 },
  { id: 'landscape', label: 'Mobile landscape', min: 480, max: 767, ideal: 667 },
  { id: 'portrait', label: 'Mobile portrait', min: 0, max: 479, ideal: 390 },
];

/**
 * Devices for the preview mode — a viewing shelf, nothing to do with breakpoints.
 * Comments are never written in device preview: it shows a fixed, real device width,
 * while comments belong to the breakpoint band you are resizing inside.
 * `w`/`h` are the device's own CSS viewport.
 * @typedef {{ id: string, label: string, group: string, w: number, h: number, frame: DeviceFrame | string }} Device
 * @type {Device[]}
 */
export const DEVICES = [
  { id: 'iphone-15-pro', label: 'iPhone 15 Pro', group: 'Phone', w: 393, h: 852, frame: FRAMES.iphone15Pro },
  { id: 'iphone-11-pro', label: 'iPhone 11 Pro', group: 'Phone', w: 375, h: 812, frame: FRAMES.iphone11Pro },
  { id: 'iphone-11-pro-max', label: 'iPhone 11 Pro Max', group: 'Phone', w: 414, h: 896, frame: FRAMES.iphone11ProMax },
  { id: 'iphone-8', label: 'iPhone 8', group: 'Phone', w: 375, h: 667, frame: FRAMES.iphone8 },
  { id: 'iphone-11-pro-landscape', label: 'iPhone 11 Pro · landscape', group: 'Phone', w: 812, h: 375, frame: FRAMES.iphoneLandscape },
  { id: 'ipad-pro-11', label: 'iPad Pro 11"', group: 'Tablet', w: 834, h: 1194, frame: FRAMES.ipad },
  { id: 'ipad-pro-11-landscape', label: 'iPad Pro 11" · landscape', group: 'Tablet', w: 1194, h: 834, frame: FRAMES.ipadLandscape },
  { id: 'macbook-air-13', label: 'MacBook Air 13"', group: 'Laptop', w: 1280, h: 800, frame: FRAMES.macbook },
];
