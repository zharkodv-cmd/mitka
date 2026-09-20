#!/usr/bin/env node
// The comment queue from the terminal — what Claude uses to answer and close threads.
//
//   mitka                      open comments, newest last
//   mitka all                  including done ones
//   mitka done 3 "note"        resolve it as Claude + leave a note
//   mitka note 3 "..."         reply without changing status
//   mitka reply 3 "..."        same thing, clearer name
//   mitka reopen 3
//   mitka rm 3
//   mitka prune [--dry]        move resolved threads to feedback/archive/, keep numbering
//   mitka digest               compact list for the SessionStart hook
//   mitka count                one line for the UserPromptSubmit hook
//   mitka --selftest
//
// Root is the nearest directory with a package.json above the cwd, or `--root <dir>`.
// The store is <root>/feedback/comments.json.
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createStore, add, patch, reply, nextId, stateOf, STATE_LABEL } from '../src/store/comments.mjs';

const argv = process.argv.slice(2);
const rootFlag = argv.indexOf('--root');
let root = process.cwd();
if (rootFlag !== -1) {
  root = resolve(argv[rootFlag + 1] || '.');
  argv.splice(rootFlag, 2);
} else {
  for (let d = root; ; d = dirname(d)) {
    if (existsSync(join(d, 'package.json'))) { root = d; break; }
    if (dirname(d) === d) break;
  }
}

const [cmd = 'list', id, ...rest] = argv;
const text = rest.join(' ');

if (cmd === '--selftest') {
  const assert = (await import('node:assert')).strict;
  const dir = await mkdtemp(join(tmpdir(), 'mitka-'));
  const s = createStore(dir);
  const t = { comments: [] };
  const a = add(t, { route: '/', selector: 'h1', rx: 0.5, ry: 0.5, text: 'one', breakpoint: 'tablet' });
  assert.equal(a.breakpoint, 'tablet', 'breakpoint is stored, not dropped');
  assert.equal(a.category, 'general', 'an untagged note defaults to general, not undefined');
  assert.equal(add(t, { route: '/', selector: 'x', rx: 0, ry: 0, text: 'y', category: 'bug' }).category, 'bug');
  assert.equal(add(t, { route: '/', selector: 'x', rx: 0, ry: 0, text: 'y', category: 'nonsense' }).category, 'general',
    'an unknown category falls back rather than storing a colourless id');
  assert.equal(add(t, { route: '/', selector: 'x', rx: 0, ry: 0, text: 'y' }).breakpoint, 'desktop', 'defaults to desktop');
  t.comments = [a];
  const b = add(t, { route: '/', selector: 'h2', rx: 0, ry: 0, text: 'two' });
  assert.equal(a.id, 1); assert.equal(b.id, 2);
  patch(t, 1, { status: 'done' });
  add(t, { route: '/', selector: 'h3', rx: 0, ry: 0, text: 'three' });
  assert.equal(t.comments.at(-1).id, 3, 'ids keep climbing so pin numbers stay stable');
  t.comments = t.comments.filter((c) => c.id !== 2);
  assert.equal(nextId(t), 4, 'deleting does not free an id for reuse');
  assert.equal(patch(t, 99, {}), null, 'unknown id reports rather than throws');
  reply(t, 1, 'you', 'уточнення');
  reply(t, 1, 'claude', 'зрозумів, роблю');
  assert.equal(t.comments[0].replies.length, 2, 'thread keeps both sides in order');
  assert.equal(t.comments[0].replies[0].author, 'you');
  assert.equal(reply(t, 99, 'you', 'x'), null, 'reply to a missing comment reports');
  assert.equal(a.browser, '', 'no browser given stores empty, not undefined');
  assert.equal(add(t, { route: '/', selector: 'x', rx: 0, ry: 0, text: 'y', browser: 'Safari 18 · macOS' }).browser, 'Safari 18 · macOS');
  assert.equal(a.nth, null, 'no index given stores null rather than undefined');
  assert.equal(add(t, { route: '/', selector: 'x', rx: 0, ry: 0, text: 'y', nth: 0 }).nth, 0, 'index 0 survives, it is not falsy-dropped');
  assert.equal(a.doneBy, null, 'a fresh note is not resolved by anyone');
  assert.equal(patch(t, 1, { status: 'done', doneBy: 'claude' }).doneBy, 'claude');
  assert.equal(patch(t, 1, { status: 'open', doneBy: null }).doneBy, null, 'reopening clears who closed it');
  assert.equal(stateOf({ status: 'open', doneBy: null }), 'open');
  assert.equal(stateOf({ status: 'open', doneBy: 'claude' }), 'open', 'a name without a close is still open');
  assert.equal(stateOf({ status: 'done', doneBy: 'you' }), 'done');
  assert.equal(stateOf({ status: 'done', doneBy: 'claude' }), 'claude', 'closed by Claude is its own status');
  // the disk side, in a temp root
  assert.deepEqual(s.load(), { comments: [] }, 'a missing file reads as an empty store');
  assert.equal(s.attach(t, 1, 'not a data url'), null, 'a non-image paste is refused, not written');
  assert.equal(s.attach(t, 99, 'data:image/png;base64,AA=='), null, 'attaching to a missing id reports');
  const rel = s.attach(t, 1, 'data:image/png;base64,iVBORw0KGgo=');
  assert.match(rel, /^feedback\/images\/1-\d+\.png$/, 'a screenshot lands under the comment id');
  assert.ok(existsSync(join(dir, rel)), 'and is written to disk');
  assert.equal(s.detach(t, 1, 'not-mine.png'), false, 'a name this comment does not own is refused');
  assert.equal(s.detach(t, 1, rel), true);
  assert.ok(!existsSync(join(dir, rel)), 'detaching deletes the file');
  assert.equal(s.remove(t, 99), false, 'removing a missing id reports rather than throws');
  s.save(t);
  assert.equal(s.load().comments.length, t.comments.length, 'save then load round-trips');
  // prune: resolved threads leave, open ones stay, numbering carries on
  const dir2 = await mkdtemp(join(tmpdir(), 'mitka-prune-'));
  const s2 = createStore(dir2);
  const t2 = { comments: [] };
  add(t2, { route: '/', selector: 'h1', rx: 0, ry: 0, text: 'closed' });
  const open2 = add(t2, { route: '/', selector: 'h2', rx: 0, ry: 0, text: 'still open' });
  patch(t2, 1, { status: 'done', doneBy: 'you' });
  const shot = s2.attach(t2, 1, 'data:image/png;base64,iVBORw0KGgo=');
  const floor = nextId(t2);
  const dryRun = s2.prune(t2, { dry: true, date: '2026-01-01' });
  assert.equal(dryRun.moving.length, 1, 'a dry run reports what would move');
  assert.equal(t2.comments.length, 2, 'and moves nothing');
  const moved = s2.prune(t2, { date: '2026-01-01' });
  assert.equal(moved.moving.length, 1, 'only the resolved thread moves');
  assert.deepEqual(t2.comments.map((c) => c.id), [open2.id], 'the open one stays');
  assert.equal(nextId(t2), floor, 'the id floor survives the threads that left');
  assert.ok(existsSync(join(dir2, 'feedback/archive/comments-2026-01-01.json')), 'the archive file is written');
  assert.ok(existsSync(join(dir2, 'feedback/archive/images', shot.split('/').pop())), 'screenshots move with it');
  assert.ok(!existsSync(join(dir2, shot)), 'and leave the live image dir');
  assert.match(moved.moving[0].images[0], /^feedback\/archive\/images\//, 'the archived record points at the new path');
  s2.prune(t2, { date: '2026-01-01' });
  assert.equal(JSON.parse(readFileSync(join(dir2, 'feedback/archive/comments-2026-01-01.json'), 'utf8')).comments.length, 1, 'pruning twice in a day does not double the archive');
  await rm(dir2, { recursive: true, force: true });
  await rm(dir, { recursive: true, force: true });
  console.log('mitka selftest ok');
  process.exit(0);
}

const store = createStore(root);
const db = store.load();

if (cmd === 'reply') {
  if (!/^\d+$/.test(id || '') || !text) { console.error('reply needs: <number> "<text>"'); process.exit(1); }
  const c = reply(db, id, 'claude', text);
  if (!c) { console.error(`No comment #${id}`); process.exit(1); }
  store.save(db);
  console.log(`#${c.id} +reply: ${text}`);
  process.exit(0);
}

if (['done', 'note', 'reopen', 'rm'].includes(cmd)) {
  if (!/^\d+$/.test(id || '')) { console.error(`${cmd} needs a comment number`); process.exit(1); }
  if (cmd === 'rm') {
    if (!store.remove(db, id)) { console.error(`No comment #${id}`); process.exit(1); }
    store.save(db);
    console.log(`removed #${id}`);
    process.exit(0);
  }
  if (text) reply(db, id, 'claude', text);
  /* Resolved, and resolved by Claude: a thread Claude closes carries its name so it
     lands in its own group rather than mixing with the ones you closed yourself. */
  const changes = cmd === 'done' ? { status: 'done', doneBy: 'claude' }
    : cmd === 'reopen' ? { status: 'open', doneBy: null } : {};
  const c = patch(db, id, changes);
  if (!c) { console.error(`No comment #${id}`); process.exit(1); }
  store.save(db);
  console.log(`#${c.id} ${stateOf(c)}${text ? ` — ${text}` : ''}`);
  process.exit(0);
}

/* The store is meant to be small and readable: a year of answered threads makes both the
   panel's archive and this list a wall. Prune moves them to feedback/archive/ — the same
   records, screenshots and all — and leaves the id floor behind, so the next comment is
   #552 and not #1. Nothing is deleted. */
if (cmd === 'prune') {
  const dry = argv.includes('--dry');
  const { moving, keeping, archiveFile, images } = store.prune(db, { dry });
  if (!moving.length) { console.log('Nothing resolved to move.'); process.exit(0); }
  const rel = archiveFile.replace(store.root + '/', '');
  if (dry) {
    console.log(`Would move ${moving.length} resolved thread${moving.length === 1 ? '' : 's'} (${images.length} screenshot${images.length === 1 ? '' : 's'}) to ${rel}; ${keeping.length} would stay.`);
    process.exit(0);
  }
  store.save(db);
  console.log(`Moved ${moving.length} resolved thread${moving.length === 1 ? '' : 's'} and ${images.length} screenshot${images.length === 1 ? '' : 's'} to ${rel}.`);
  console.log(`${keeping.length} left in the store; the next comment will be #${db.nextId}.`);
  process.exit(0);
}

/* Fed to Claude by the SessionStart / UserPromptSubmit hooks. Both print nothing when
   the queue is empty: this lands in the model's context on every session and every
   message, so silence is the default and brevity the rest. */
if (cmd === 'digest' || cmd === 'count') {
  // stateOf, not status: a thread Claude has already marked is not one to hand it again
  const open = db.comments.filter((c) => stateOf(c) === 'open');
  if (!open.length) process.exit(0);
  if (cmd === 'count') {
    console.log(`${open.length} open page comment${open.length === 1 ? '' : 's'} in feedback/comments.json — read them with \`npx mitka\`.`);
    process.exit(0);
  }
  const CAP = 15;
  console.log(`Open page comments (${open.length}). Reply with \`npx mitka reply <id> "..."\`, close with \`npx mitka done <id> "..."\`.`);
  let route = '';
  for (const c of open.slice(0, CAP)) {
    if (c.route !== route) { route = c.route; console.log(route); }
    console.log(`  id ${c.id} [${c.breakpoint || 'desktop'}]${c.browser ? ` [${c.browser}]` : ''} [${c.category || 'general'}] ${c.text.replace(/\s+/g, ' ').slice(0, 100)}`);
    for (const img of c.images || []) console.log(`      screenshot: ${img}`);
  }
  if (open.length > CAP) console.log(`  …and ${open.length - CAP} more`);
  process.exit(0);
}

const list = db.comments.filter((c) => cmd === 'all' || stateOf(c) === 'open');
if (!list.length) { console.log(cmd === 'all' ? 'No comments.' : 'No open comments.'); process.exit(0); }
// The panel numbers threads per route+breakpoint, so "#4 on desktop" there is id 10
// here. Print both or we end up naming the same note two different things.
const seq = new Map();
const counts = {};
for (const c of db.comments) {
  const key = `${c.route}|${c.breakpoint || 'desktop'}`;
  seq.set(c.id, (counts[key] = (counts[key] || 0) + 1));
}
let route = '';
for (const c of list) {
  if (c.route !== route) { route = c.route; console.log(`\n${route}`); }
  const by = STATE_LABEL[stateOf(c)].toLowerCase();
  console.log(`  #${seq.get(c.id)} (id ${c.id}) [${by}] [${c.breakpoint || 'desktop'}]${c.browser ? ` [${c.browser}]` : ''} [${c.category || 'general'}] ${c.text}`);
  if (c.label) console.log(`       on: ${c.label}`);
  for (const img of c.images || []) console.log(`       img: ${img}`);
  if (c.note) console.log(`       me: ${c.note}`);
  for (const r of c.replies || []) console.log(`       ${r.author === 'claude' ? 'me' : 'you'}: ${r.text}`);
}
console.log(`\n${list.length} shown / ${db.comments.length} total`);
