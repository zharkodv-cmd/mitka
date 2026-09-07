import type { Breakpoint, Device, DeviceFrame } from './types';

/** Device mockups shipped with the package, served under /__devbar/assets/ */
export const FRAMES: Record<
  'macbook' | 'ipad' | 'ipadLandscape' | 'iphone15Pro' | 'iphone11Pro' | 'iphone11ProMax' | 'iphone8' | 'iphoneLandscape',
  DeviceFrame
>;
/** Switcher glyphs by breakpoint id */
export const ICONS: Record<string, string>;
/** The default four bands */
export const BREAKPOINTS: Breakpoint[];
/** The default device shelf */
export const DEVICES: Device[];
