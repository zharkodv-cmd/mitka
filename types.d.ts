export interface Breakpoint {
  id: string;
  label: string;
  /** the band, in CSS px; `max: Infinity` for the widest, which has no canvas — it is your own window */
  min: number;
  max: number;
  /** the width the canvas opens at */
  ideal: number;
  /** SVG paths for the switcher glyph (viewBox 0 0 20 20, stroked); defaults by id */
  icon?: string;
}

/** The body drawn around the screen */
export type Shell = 'island' | 'home' | 'punch' | 'tablet' | 'macbook' | 'laptop' | 'monitor';
/** The browser chrome drawn on the screen — it decides the height the page gets */
export type Browser = 'safari-ios' | 'chrome-android' | 'safari-ipad' | 'safari-mac' | 'chrome-windows';

export interface Device {
  id: string;
  label: string;
  /** menu section: 'Phone' | 'Tablet' | 'Laptop' | 'Desktop' | anything */
  group: string;
  /** the device's CSS screen size; the page gets what the browser chrome leaves of it */
  w: number;
  h: number;
  shell: Shell;
  browser: Browser;
  /** the row's tooltip in the menu */
  note?: string;
}

export interface MitkaOptions {
  /** `false` keeps the bar out entirely — the switch Playwright flips */
  enabled?: boolean;
  /** bands of the breakpoint switcher; defaults to desktop ≥992 / tablet / landscape / portrait */
  breakpoints?: Breakpoint[];
  /** the preview shelf; defaults to the eight screens most visitors use */
  devices?: Device[];
  /** route -> [menu name, group]; unlisted pages fall back to their <title>. Also how an
   *  address a dynamic route serves (/blog/some-post) gets into the menu */
  pages?: Record<string, [name: string, group?: string]>;
  /** group order in the page menu; unlisted pages land in the last one. Without it the
   *  menu groups pages by folder */
  groups?: string[];
  /** show the toggle that hides Sanity's visual-editing overlay */
  sanity?: boolean;
  /** extra selectors the inspectors and comment picker must ignore */
  ignore?: string[];
  /** class names the grid overlay borrows from the project's own layout */
  grid?: { container?: string; grid?: string; columns?: number };
  /** base z-index of the bar; overlays stack around it */
  zIndex?: number;
}

/** Everything but `enabled` can also live in `mitka.config.mjs` at the project root
 *  (named exports or a default object), re-read on every page load. Options passed
 *  here win over the file. */
export default function mitka(options?: MitkaOptions): any;
