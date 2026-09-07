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
  /** the band, in CSS px; `max: Infinity` for the widest */
  min: number;
  max: number;
  /** the width the canvas opens at */
  ideal: number;
  /** height of the CSS shell when there is no `frame` */
  frameH?: number | null;
  /** which CSS shell to draw without a `frame`: 'laptop' | 'tablet' | 'phone' */
  device?: string | null;
  /** a real mockup picture to sit the canvas inside — one shipped with the package by
   *  name ('macbook' | 'ipad' | 'ipadLandscape' | 'iphone15Pro' | 'iphone11Pro' |
   *  'iphone11ProMax' | 'iphone8' | 'iphoneLandscape') or your own geometry */
  frame?: DeviceFrame | FrameName | (string & {}) | null;
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
  frame: DeviceFrame;
}

export interface MitkaOptions {
  /** `false` keeps the bar out entirely — the switch Playwright flips */
  enabled?: boolean;
  /** bands of the breakpoint switcher; defaults to the starter's four */
  breakpoints?: Breakpoint[];
  /** the device preview shelf; defaults to eight Apple devices */
  devices?: Device[];
  /** route -> [menu name, group]; unlisted pages fall back to their <title> */
  pages?: Record<string, string[]>;
  /** group order in the page menu; unlisted pages land in the last one */
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

export default function mitka(options?: MitkaOptions): any;
