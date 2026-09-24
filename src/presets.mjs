// Devices, default breakpoints and switcher icons. Pure data — the integration ships it
// to the browser as JSON and the CLI never needs it.

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
 * The preview shelf: the eight screens that cover most real visitors (US web traffic,
 * StatCounter Aug 2026 — one device per common viewport bucket). Each is drawn, not a
 * picture: `shell` is the body (the bezel, the corners, the camera cut-out), `browser`
 * the chrome the page is shown in — status bar, address bar, toolbar — so the page gets
 * the height a real browser leaves it. `w`/`h` are the device's CSS screen size.
 * @typedef {'island' | 'home' | 'punch' | 'tablet' | 'macbook' | 'laptop' | 'monitor'} Shell
 * @typedef {'safari-ios' | 'chrome-android' | 'safari-ipad' | 'safari-mac' | 'chrome-windows'} Browser
 * @typedef {{ id: string, label: string, group: string, w: number, h: number,
 *   shell: Shell, browser: Browser, note?: string }} Device
 * @type {Device[]}
 */
export const SHELLS = ['island', 'home', 'punch', 'tablet', 'macbook', 'laptop', 'monitor'];
export const BROWSERS = ['safari-ios', 'chrome-android', 'safari-ipad', 'safari-mac', 'chrome-windows'];

export const DEVICES = [
  { id: 'iphone-16', label: 'iPhone 15 / 16', group: 'Phone', w: 393, h: 852, shell: 'island', browser: 'safari-ios',
    note: 'iPhone 14 Pro–16; 390 and 402 are within 9px' },
  { id: 'iphone-17-pro-max', label: 'iPhone 17 Pro Max', group: 'Phone', w: 440, h: 956, shell: 'island', browser: 'safari-ios',
    note: '16/17 Pro Max; 430×932 Plus/Pro Max nearby' },
  { id: 'iphone-se', label: 'iPhone SE', group: 'Phone', w: 375, h: 667, shell: 'home', browser: 'safari-ios',
    note: 'the shortest common screen' },
  { id: 'galaxy-s25', label: 'Galaxy S25', group: 'Phone', w: 360, h: 780, shell: 'punch', browser: 'chrome-android',
    note: 'Galaxy S22–S26; the narrowest common width' },
  { id: 'ipad', label: 'iPad', group: 'Tablet', w: 820, h: 1180, shell: 'tablet', browser: 'safari-ipad',
    note: 'iPad 10th/11th gen, iPad Air 11"' },
  { id: 'macbook-air', label: 'MacBook Air 13"', group: 'Laptop', w: 1470, h: 956, shell: 'macbook', browser: 'safari-mac',
    note: 'M2–M4 at the default scale; 1440 and 1512 nearby' },
  { id: 'windows-laptop', label: 'Windows laptop 15.6"', group: 'Laptop', w: 1536, h: 864, shell: 'laptop', browser: 'chrome-windows',
    note: '1920×1080 at 125% — the most common laptop' },
  { id: 'desktop-1080', label: 'Desktop 1080p', group: 'Desktop', w: 1920, h: 1080, shell: 'monitor', browser: 'chrome-windows',
    note: 'the most common screen of any kind' },
];
