import type { Breakpoint, Device, DeviceFrame, FrameName } from './types';

/** Device mockups shipped with the package, served under /__devbar/assets/ */
export const FRAMES: Record<FrameName, DeviceFrame>;
/** Switcher glyphs by breakpoint id */
export const ICONS: Record<string, string>;
/** The default four bands */
export const BREAKPOINTS: Breakpoint[];
/** The default device shelf */
export const DEVICES: Device[];
