// Figma-style page comments. One JSON file in the project is the whole store — it is
// small, diffable, and Claude can read it without a network call.
//
// Paths are fixed relative to the project root: feedback/comments.json for the threads
// and feedback/images/ for pasted screenshots. Both the dev middleware and the CLI
// open the store the same way, so a thread can never be written under one path and
// read under another.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { categoryOf } from './categories.mjs';

export { CATEGORIES, categoryOf } from './categories.mjs';
export { stateOf, STATE_LABEL } from './status.mjs';

/** Ids never reuse a slot, so a pin number stays the same for the life of the file. */
export const nextId = (db) => db.comments.reduce((m, c) => Math.max(m, c.id), 0) + 1;

export function add(db, { route, selector, rx, ry, text, label, viewport, breakpoint, browser, tag, classes, nth, category }) {
  const c = {
    id: nextId(db), route, selector, rx, ry, text,
    // Fallbacks for when the selector path stops matching: the pin re-finds its
    // element by tag + classes + the text it was pinned to, and failing that by the
    // position it held among its lookalikes.
    tag: tag || '', classes: classes || [], nth: Number.isInteger(nth) ? nth : null,
    label: label || '', viewport: viewport || null,
    breakpoint: breakpoint || 'desktop',
    // which browser it was seen in — a rendering bug is rarely all of them
    browser: browser || '',
    category: categoryOf(category).id,
    status: 'open', note: '', replies: [],
    // who closed it: 'claude' from the CLI, 'you' from the browser. The pair
    // (status, doneBy) is what makes "resolved by Claude" its own status.
    doneBy: null,
    // pasted screenshots, as project-relative paths — Claude reads the file, not a data URL
    images: [],
    createdAt: new Date().toISOString(), updatedAt: null,
  };
  db.comments.push(c);
  return c;
}

/** A thread under a comment: your clarifications and Claude's answers, in order. */
export function reply(db, id, author, text) {
  const c = db.comments.find((x) => x.id === Number(id));
  if (!c) return null;
  (c.replies ||= []).push({ author, text, at: new Date().toISOString() });
  c.updatedAt = new Date().toISOString();
  return c;
}

export function patch(db, id, changes) {
  const c = db.comments.find((x) => x.id === Number(id));
  if (!c) return null;
  Object.assign(c, changes, { updatedAt: new Date().toISOString() });
  return c;
}

/**
 * Open the store of one project. Everything that touches the disk lives here; the
 * pure helpers above are exported on their own so the selftest can run without a root.
 * @param {string} root absolute path of the project (the dir holding feedback/)
 */
export function createStore(root) {
  const file = join(root, 'feedback', 'comments.json');
  const imageDir = join(root, 'feedback', 'images');
  const rel = (name) => `feedback/images/${name}`;

  const load = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { comments: [] });
  const save = (db) => writeFileSync(file, JSON.stringify(db, null, 2) + '\n');

  /**
   * Store a pasted screenshot next to the comments file and record its path.
   * The bytes land on disk rather than inside comments.json on purpose: a base64 blob
   * would bloat every read of the store, and a path is something Claude can open.
   * Returns the project-relative path, or null if the data URL is not an image.
   */
  const attach = (db, id, dataUrl) => {
    const c = db.comments.find((x) => x.id === Number(id));
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/s.exec(dataUrl || '');
    if (!c || !m) return null;
    mkdirSync(imageDir, { recursive: true });
    const name = `${c.id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    writeFileSync(join(imageDir, name), Buffer.from(m[2], 'base64'));
    (c.images ||= []).push(rel(name));
    c.updatedAt = new Date().toISOString();
    return rel(name);
  };

  /**
   * Drop one screenshot from a thread and delete its file. Returns false if the
   * comment or that image is unknown — a stale name from an old render must not
   * remove a file some other comment still points at.
   */
  const detach = (db, id, name) => {
    const c = db.comments.find((x) => x.id === Number(id));
    const base = String(name).split('/').pop();
    const hit = c?.images?.find((p) => p.split('/').pop() === base);
    if (!hit) return false;
    rmSync(join(imageDir, base), { force: true });
    c.images = c.images.filter((p) => p !== hit);
    c.updatedAt = new Date().toISOString();
    return true;
  };

  /**
   * Delete a thread and the screenshots that belonged to it. One place, because both
   * the CLI and the middleware delete, and an orphaned image is a file nothing will
   * ever point at again. Returns false if there was no such comment.
   */
  const remove = (db, id) => {
    const c = db.comments.find((x) => x.id === Number(id));
    if (!c) return false;
    for (const p of c.images || []) rmSync(join(imageDir, p.split('/').pop()), { force: true });
    db.comments = db.comments.filter((x) => x.id !== Number(id));
    return true;
  };

  return { root, file, imageDir, load, save, attach, detach, remove, add, patch, reply, nextId };
}
