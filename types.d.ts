export interface DeviceFrame {
  /** URL of the mockup picture; the package's own live under /__devbar/assets/ */
  src: string;
  /** pixel size of the picture */
  w: number;
  h: number;
  /** the transparent screen hole inside it — measured with tools/measure-device-frames.mjs */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export type FrameName =
  | 'macbook' | 'ipad' | 'ipadLandscape' | 'iphone15Pro'
  | 'iphone11Pro' | 'iphone11ProMax' | 'iphone8' | 'iphoneLandscape';

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

export interface Device {
  id: string;
  label: string;
  /** menu section: 'Phone' | 'Tablet' | 'Laptop' | anything */
  group: string;
  /** the device's own CSS viewport */
  w: number;
  h: number;
  /** a mockup shipped with the package, by name, or your own geometry */
  frame: DeviceFrame | FrameName;
}

export interface MitkaOptions {
  /** `false` keeps the bar out entirely — the switch Playwright flips */
  enabled?: boolean;
  /** bands of the breakpoint switcher; defaults to desktop ≥992 / tablet / landscape / portrait */
  breakpoints?: Breakpoint[];
  /** the device preview shelf; defaults to eight Apple devices */
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
