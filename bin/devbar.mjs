#!/usr/bin/env node
// The comment queue from the terminal — what Claude uses to answer and close threads.
//
//   devbar                     open comments, newest last
//   devbar all                 including done ones
//   devbar done 3 "note"       resolve it as Claude + leave a note
//   devbar note 3 "..."        reply without changing status
//   devbar reply 3 "..."       same thing, clearer name
//   devbar reopen 3
//   devbar rm 3
//   devbar digest              compact list for the SessionStart hook
//   devbar count               one line for the UserPromptSubmit hook
//   devbar --selftest
//
// Root is the nearest directory with a package.json above the cwd, or `--root <dir>`.
// The store is <root>/feedback/comments.json.
import { existsSync } from 'node:fs';
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
  const dir = await mkdtemp(join(tmpdir(), 'devbar-'));
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
  await rm(dir, { recursive: true, force: true });
  console.log('devbar selftest ok');
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

/* Fed to Claude by the SessionStart / UserPromptSubmit hooks. Both print nothing when
   the queue is empty: this lands in the model's context on every session and every
   message, so silence is the default and brevity the rest. */
if (cmd === 'digest' || cmd === 'count') {
  // stateOf, not status: a thread Claude has already marked is not one to hand it again
  const open = db.comments.filter((c) => stateOf(c) === 'open');
  if (!open.length) process.exit(0);
  if (cmd === 'count') {
    console.log(`${open.length} open page comment${open.length === 1 ? '' : 's'} in feedback/comments.json — read them with \`npx devbar\`.`);
    process.exit(0);
  }
  const CAP = 15;
  console.log(`Open page comments (${open.length}). Reply with \`npx devbar reply <id> "..."\`, close with \`npx devbar done <id> "..."\`.`);
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
