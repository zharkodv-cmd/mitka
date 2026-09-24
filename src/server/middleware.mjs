// Dev-server endpoints under /__devbar/. Plain Connect middleware, so it only ever
// exists while `astro dev` runs — nothing here is a route in the project and nothing
// reaches a build.
//
//   GET    /__devbar/config              what the client needs to draw itself
//   GET    /__devbar/comments[?route=]   threads, all or for one route
//   POST   /__devbar/comments            new thread (+ optional screenshot)
//   PATCH  /__devbar/comments            edit / reply / attach / detach
//   DELETE /__devbar/comments?id=        remove a thread and its screenshots
//   GET    /__devbar/image?name=         a pasted screenshot from feedback/images/
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStore } from '../store/comments.mjs';
import { CATEGORIES } from '../store/categories.mjs';
import { BREAKPOINTS, DEVICES, ICONS, SHELLS, BROWSERS } from '../presets.mjs';

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
};

/** The Figma numbering stays in the data because the menu is sorted by it. */
const figmaOrder = (name) =>
  name.split('.').slice(0, 2).map(Number).reduce((a, b) => a * 100 + (Number.isNaN(b) ? 9999 : b), 0);

/** Page <title> from the source, minus a "Site name — " prefix. Null when unreadable. */
export const titleOf = (root, entrypoint) => {
  try {
    const src = readFileSync(isAbsolute(entrypoint) ? entrypoint : join(root, entrypoint), 'utf8');
    return src.match(/title="([^"]+)"/)?.[1].split('—').pop()?.trim() || null;
  } catch { return null; }
};

/** '/docs/getting-started' → 'Docs'. */
export const titled = (segment) => segment[0].toUpperCase() + segment.slice(1).replace(/[-_]+/g, ' ');

/** Everything the browser side draws from: pages, bands, devices, tags, knobs. */
export function buildConfig({ root, options, routes }) {
  const named = options.pages ?? {};
  const row = (route, name, group) => ({
    // "1.1.1.D. Homepage" is sorted by its number and read without it
    route, name, label: name.replace(/^[\d.]+[A-Z]?\.\s*/, ''), group,
  });
  const discovered = routes
    // A dynamic route has no address to visit — /blog/[slug] only ever resolved to
    // /blog, which is already a row of its own. Injected routes (a CMS studio) and
    // Astro's own 404/500 are not pages of the site either.
    .filter((r) => r.origin === 'project' && r.type === 'page' && !r.pattern.includes('['))
    .map((r) => ({ route: r.pattern.replace(/\/+$/, '') || '/', entrypoint: r.entrypoint }));
  // An address a dynamic route serves — /locations/san-diego out of
  // /locations/[campus] — cannot be discovered: Astro knows the pattern, only the
  // project knows which slugs exist. Naming one in `pages` is how it says so.
  const seen = new Set(discovered.map((p) => p.route));
  const all = [...discovered, ...Object.keys(named).filter((r) => !seen.has(r)).map((route) => ({ route }))];

  /* With no `groups` the menu groups itself by folder: /docs/a and /docs/b are Docs,
     a page with no siblings under its segment stays in Pages. With `groups`, a page
     the map does not name lands in the last one. */
  const folders = {};
  for (const { route } of all) {
    const seg = route.split('/')[1];
    if (seg) folders[seg] = (folders[seg] || 0) + 1;
  }
  const autoGroup = (route) => {
    const seg = route.split('/')[1];
    return seg && folders[seg] > 1 ? titled(seg) : 'Pages';
  };
  const fallback = options.groups ? () => options.groups[options.groups.length - 1] : autoGroup;
  const rows = all.map(({ route, entrypoint }) => {
    const [name, group] = named[route] ?? [];
    return row(route, name ?? (entrypoint && titleOf(root, entrypoint)) ?? route, group ?? fallback(route));
  });
  const groups = options.groups ?? [...new Set([
    ...Object.values(named).map(([, g]) => g).filter(Boolean),
    'Pages',
    ...rows.map((p) => p.group).sort(),
  ])];
  const pages = rows.sort((a, b) =>
    groups.indexOf(a.group) - groups.indexOf(b.group) ||
    figmaOrder(a.name) - figmaOrder(b.name) ||
    a.route.localeCompare(b.route));

  const breakpoints = (options.breakpoints ?? BREAKPOINTS).map((b) => ({
    id: b.id, label: b.label, min: b.min, ideal: b.ideal,
    max: Number.isFinite(b.max) ? b.max : null, // JSON has no Infinity; the client puts it back
    icon: b.icon ?? ICONS[b.id] ?? ICONS.desktop,
  }));
  /* A device the client cannot draw would throw on every load it stays selected, so it
     is dropped here and said so — including one still in the pre-0.3 picture shape. */
  const devices = (options.devices ?? DEVICES).filter((d) => {
    if (d.w > 0 && d.h > 0 && SHELLS.includes(d.shell) && BROWSERS.includes(d.browser)) return true;
    console.warn(`[mitka] device "${d.id}" skipped: it needs w and h, shell (${SHELLS.join(', ')}) and browser (${BROWSERS.join(', ')})${d.frame ? '; `frame` pictures were replaced by shell + browser in 0.3' : ''}`);
    return false;
  });
  return {
    pages,
    groups: groups.filter((g) => pages.some((p) => p.group === g)),
    breakpoints,
    devices,
    categories: CATEGORIES,
    sanity: Boolean(options.sanity),
    ignore: options.ignore ?? [],
    grid: { container: 'container', grid: 'grid', columns: 12, ...options.grid },
    // Above everything a page can produce, Astro's own dev toolbar (2000000010)
    // included: this is dev chrome, and a bar you cannot click because a modal,
    // a mega-menu or a skip link landed on top of it is not a bar. The CSS adds
    // at most +5, so this stays clear of the int32 ceiling.
    zIndex: options.zIndex ?? 2000000020,
  };
}

/* mitka.config.mjs at the project root, re-read whenever it changes: a page reload
   picks up a renamed page or a new band without restarting the dev server. Named
   exports or a default object, either works. A file that does not parse mid-edit
   keeps the last good version rather than taking the bar down. */
const configLoader = (root) => {
  const file = join(root, 'mitka.config.mjs');
  let stamp = 0;
  let last = {};
  return async () => {
    if (!existsSync(file)) return {};
    const t = statSync(file).mtimeMs;
    if (t === stamp) return last;
    stamp = t;
    try {
      const { default: dflt, ...named } = await import(`${pathToFileURL(file).href}?t=${t}`);
      last = { ...named, ...dflt };
    } catch (e) {
      console.warn(`[mitka] mitka.config.mjs: ${e.message}`);
    }
    return last;
  };
};

/* Writes come from the bar on this page and nowhere else. Any site open in the same
   browser can send a no-cors POST to localhost, and what lands in comments.json is
   read by Claude as a to-do list — so a request that names a foreign origin is
   refused. Browsers send Origin on every non-GET fetch; the CLI never comes here. */
const foreign = (req) => {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host !== req.headers.host; } catch { return true; }
};

/**
 * @param {{ root: string, options: Record<string, any>, routes: () => any[] }} ctx
 */
export function mitkaMiddleware({ root, options, routes }) {
  const store = createStore(root);
  const fileOptions = configLoader(root);

  const send = (res, status, body, type = 'application/json') => {
    res.statusCode = status;
    res.setHeader('content-type', type);
    res.setHeader('cache-control', 'no-store');
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const json = (res, body, status = 200) => send(res, status, body);
  const text = (res, status, msg) => send(res, status, msg, 'text/plain');
  const readJson = (req) => new Promise((ok, no) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { no(e); }
    });
    req.on('error', no);
  });

  const comments = async (req, res, url) => {
    if (req.method !== 'GET' && foreign(req)) return text(res, 403, 'Cross-origin write refused');
    if (req.method === 'GET') {
      const route = url.searchParams.get('route');
      const db = store.load();
      return json(res, { comments: route ? db.comments.filter((c) => c.route === route) : db.comments });
    }
    if (req.method === 'POST') {
      const { image, ...body } = await readJson(req);
      if (!body?.text?.trim()) return json(res, { error: 'empty comment' }, 400);
      const db = store.load();
      const c = store.add(db, body);
      // the comment has to exist before a screenshot can be filed under its id
      if (image) store.attach(db, c.id, image);
      store.save(db);
      return json(res, c, 201);
    }
    if (req.method === 'PATCH') {
      const { id, reply: replyText, image, removeImage, ...changes } = await readJson(req);
      const db = store.load();
      if (image) store.attach(db, id, image);
      if (removeImage) store.detach(db, id, removeImage);
      // A reply from the browser is always yours; Claude's come through the CLI.
      if (replyText?.trim()) store.reply(db, id, 'you', replyText.trim());
      const c = Object.keys(changes).length || !replyText
        ? store.patch(db, id, changes)
        : db.comments.find((x) => x.id === Number(id));
      if (!c) return json(res, { error: `no comment #${id}` }, 404);
      store.save(db);
      return json(res, c);
    }
    if (req.method === 'DELETE') {
      const id = Number(url.searchParams.get('id'));
      const db = store.load();
      // takes its screenshots with it — see remove() in the store
      if (!store.remove(db, id)) return json(res, { error: `no comment #${id}` }, 404);
      store.save(db);
      return json(res, { ok: true, id });
    }
    return text(res, 405, 'Method not allowed');
  };

  /* Basename only, from a fixed dir with a known extension: the name comes from the
     store, but this reads the disk, and "../../.env" is exactly the request a path
     parameter invites. */
  const file = (res, dir, name) => {
    const base = name.replace(/^.*[/\\]/, '');
    const ext = base.split('.').pop()?.toLowerCase() ?? '';
    if (!/^[\w.-]+$/.test(base) || !MIME[ext]) return text(res, 400, 'Bad name');
    const path = join(dir, base);
    if (!existsSync(path)) return text(res, 404, 'Not found');
    return send(res, 200, readFileSync(path), MIME[ext]);
  };

  return async function mitka(req, res, next) {
    if (!req.url || !req.url.startsWith('/__devbar/')) return next();
    const url = new URL(req.url, 'http://devbar');
    const path = url.pathname.slice('/__devbar/'.length);
    try {
      // what astro.config passes wins over the file
      if (path === 'config') return json(res, buildConfig({ root, options: { ...(await fileOptions()), ...options }, routes: routes() }));
      if (path === 'comments') return await comments(req, res, url);
      if (path === 'image') return file(res, store.imageDir, url.searchParams.get('name') || '');
      return text(res, 404, 'Not found');
    } catch (e) {
      return text(res, 500, String(e?.stack || e));
    }
  };
}
