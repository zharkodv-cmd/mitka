// What kind of note a comment is, carried as the colour inside its pin — you can
// read a page's worth of feedback without opening a single card.
//
// Pure data with no node APIs, like breakpoints.mjs: comments.mjs (which reads the
// filesystem) and the browser bundle in DevTools.astro both import it. Putting this
// in comments.mjs broke the page — Vite externalises `node:fs` for the browser.
//
// Four, and that is the ceiling: past a handful nobody remembers which colour means
// what and the picker stops being a glance. `general` is the default and keeps the
// blue the tool has always used, so an untagged note still looks right.
/** @typedef {{ id: string, label: string, color: string }} Category */
/** @type {Category[]} */
export const CATEGORIES = [
  { id: 'general', label: 'General', color: '#0d99ff' }, // anything without a sharper name
  { id: 'text', label: 'Text', color: '#f5c451' }, // copy and wording
  { id: 'bug', label: 'Bug', color: '#e5484d' }, // it is broken, not a preference
  { id: 'motion', label: 'Motion', color: '#a475f9' }, // animation, transitions
];

export const categoryOf = (id) => CATEGORIES.find((k) => k.id === id) || CATEGORIES[0];
