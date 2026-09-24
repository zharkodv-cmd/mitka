// `mitka init` — set a project up by reading it, then asking only what it cannot read.
//
// Reads: where the CSS switches layout (media queries, or Tailwind's defaults), the
// pages under src/pages, whether Sanity is installed, whether astro.config already
// loads the bar. Asks: whether those guesses are right, and whether to wire Claude
// Code and .gitignore. Writes mitka.config.mjs and nothing it was not told to.
// `--yes` (or no terminal) takes every default; `--force` rewrites an existing config.
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { titleOf, titled } from '../src/server/middleware.mjs';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.git', '.vercel', '.netlify', 'public']);

function* walk(dir) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(join(dir, e.name)); }
    else yield join(dir, e.name);
  }
}

/* Every px/em/rem width a media query switches at, as the first width of the band
   above it: `max-width: 991px` and `min-width: 992px` are the same edge, 992. */
export function detectEdges(root) {
  const counts = new Map();
  const add = (px) => {
    const edge = Math.round(px);
    if (edge >= 320 && edge <= 2560) counts.set(edge, (counts.get(edge) || 0) + 1);
  };
  const toPx = (n, unit) => Number(n) * (unit === 'px' ? 1 : 16);
  for (const file of walk(join(root, 'src'))) {
    if (!/\.(css|scss|sass|less|astro|svelte|vue|jsx|tsx)$/.test(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('@media')) continue;
      for (const m of line.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|r?em)/g)) {
        const px = toPx(m[2], m[3]);
        add(m[1] === 'max' ? Math.floor(px) + 1 : px);
      }
      for (const m of line.matchAll(/width\s*([<>]=?)\s*([\d.]+)(px|r?em)/g)) {
        const px = toPx(m[2], m[3]);
        add(m[1] === '<=' || m[1] === '>' ? Math.floor(px) + 1 : px);
      }
    }
  }
  // an edge used once is usually one component's own tweak, not the site's grid
  return [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])
    .slice(0, 4).map(([edge]) => edge).sort((a, b) => b - a);
}

const NAMES = {
  2: ['desktop', 'mobile'],
  3: ['desktop', 'tablet', 'mobile'],
  4: ['desktop', 'tablet', 'landscape', 'portrait'],
  5: ['desktop', 'laptop', 'tablet', 'landscape', 'portrait'],
};
const LABELS = { desktop: 'Desktop', laptop: 'Laptop', tablet: 'Tablet', landscape: 'Mobile landscape', portrait: 'Mobile portrait', mobile: 'Mobile' };
const IDEAL = { desktop: 1440, laptop: 1280, tablet: 834, landscape: 667, portrait: 390, mobile: 390 };

/** Edges, widest first, into bands: [e0, ∞), [e1, e0 - 1] … [0, last - 1]. */
export function bandsFrom(edges) {
  const e = [...new Set(edges)].sort((a, b) => b - a).slice(0, 4);
  const ids = NAMES[e.length + 1] ?? ['desktop'];
  return ids.map((id, i) => {
    const min = e[i] ?? 0;
    const max = i === 0 ? Infinity : e[i - 1] - 1;
    return { id, label: LABELS[id], min, max, ideal: Math.min(Math.max(IDEAL[id], min), max) };
  });
}

/** Pages under src/pages as routes; dynamic ones apart, since only the project knows their slugs. */
export function scanPages(root) {
  const dir = join(root, 'src', 'pages');
  const pages = [];
  const dynamic = [];
  for (const file of walk(dir)) {
    const rel = relative(dir, file);
    if (!/\.(astro|md|mdx|html)$/.test(rel) || rel.split('/').some((p) => p.startsWith('_'))) continue;
    const route = ('/' + rel.slice(0, -extname(rel).length)).replace(/\/index$/, '') || '/';
    if (route.includes('[')) dynamic.push({ route, file: relative(root, file) });
    else if (!/^\/(404|500)$/.test(route)) pages.push({ route, name: titleOf(root, file) ?? titled(route.split('/').pop() || 'home') });
  }
  const folders = {};
  for (const { route } of pages) { const s = route.split('/')[1]; if (s) folders[s] = (folders[s] || 0) + 1; }
  for (const p of pages) {
    const s = p.route.split('/')[1];
    p.group = s && folders[s] > 1 ? titled(s) : 'Pages';
  }
  const order = (g) => (g === 'Pages' ? '' : g);
  pages.sort((a, b) => order(a.group).localeCompare(order(b.group)) || a.route.localeCompare(b.route));
  return { pages, dynamic };
}

const q = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function renderConfig({ bands, pages, dynamic, grid, sanity }) {
  const band = (b) => `  { id: ${q(b.id)}, label: ${q(b.label)}, min: ${b.min}, max: ${Number.isFinite(b.max) ? b.max : 'Infinity'}, ideal: ${b.ideal} },`;
  const lines = [
    '// Mitka — the dev bar. Re-read on every page load: edit and refresh, no restart.',
    '// Every export is optional; delete one to fall back to the default.',
    '',
    '// Where the layout switches, widest first. The widest band is your own window; the',
    '// others open as a canvas at `ideal` and can be dragged anywhere inside the band.',
    'export const breakpoints = [',
    ...bands.map(band),
    '];',
    '',
    '// The pages menu: route → [name, group]. A page left out still shows up, named by',
    '// its <title> and grouped by folder. A number in front of a name only orders the',
    '// rows inside a group ("1.2. About") — the menu does not show it.',
    'export const pages = {',
    ...pages.map((p) => `  ${q(p.route)}: [${q(p.name)}, ${q(p.group)}],`),
  ];
  if (dynamic.length) {
    lines.push('', '  // Dynamic routes cannot be listed for you — name the addresses they serve:');
    for (const d of dynamic) {
      const example = d.route.replace(/\[\.{3}[^\]]+\]|\[[^\]]+\]/g, 'example');
      const seg = d.route.split('/')[1];
      lines.push(`  // ${q(example)}: [${q(titled(seg || 'page'))}, ${q(seg ? titled(seg) : 'Pages')}], // ${d.file}`);
    }
  }
  lines.push('};', '');
  lines.push('// The layout grid overlay borrows these classes from your own CSS.');
  lines.push(`export const grid = { container: ${q(grid.container)}, grid: ${q(grid.grid)}, columns: ${grid.columns} };`);
  if (sanity) lines.push('', '// Adds a toggle that hides Sanity\'s visual-editing overlay.', 'export const sanity = true;');
  return lines.join('\n') + '\n';
}

const HOOK = (sub) =>
  `[ -f "$CLAUDE_PROJECT_DIR/node_modules/mitka/bin/mitka.mjs" ] && node "$CLAUDE_PROJECT_DIR/node_modules/mitka/bin/mitka.mjs" --root "$CLAUDE_PROJECT_DIR" ${sub}`;

/** Merge the two hooks into .claude/settings.json, leaving whatever else is there alone. */
export function addClaudeHooks(root) {
  const file = join(root, '.claude', 'settings.json');
  const settings = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  settings.hooks ??= {};
  let added = 0;
  for (const [event, sub] of [['SessionStart', 'digest'], ['UserPromptSubmit', 'count']]) {
    const list = (settings.hooks[event] ??= []);
    if (JSON.stringify(list).includes('mitka')) continue;
    list.push({ hooks: [{ type: 'command', command: HOOK(sub) }] });
    added++;
  }
  if (added) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  }
  return added;
}

const IGNORE = ['feedback/images/', 'feedback/archive/images/'];

/* `mitka()` into astro.config the way `astro add` would, but only where the shape is
   unmistakable — one `integrations: [` or one `defineConfig({`. Anything cleverer is a
   config file someone wrote by hand, and that gets a snippet instead of an edit. */
export function wireAstroConfig(root, optional = false) {
  const file = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts']
    .map((f) => join(root, f)).find(existsSync);
  if (!file) return { status: 'missing' };
  let src = readFileSync(file, 'utf8');
  if (/['"]mitka['"]/.test(src)) return { status: 'present', file };
  const count = (s) => src.split(s).length - 1;
  /* An optional install (a private repo the build machine cannot fetch) must not take
     the build down where it is missing, so it is imported behind a catch. */
  const entry = optional ? '...(mitka ? [mitka()] : [])' : 'mitka()';
  const load = optional
    ? "const mitka = await import('mitka').then((m) => m.default).catch(() => null);"
    : "import mitka from 'mitka';";
  if (src.includes('integrations: []')) src = src.replace('integrations: []', `integrations: [${entry}]`);
  else if (count('integrations: [') === 1) src = src.replace('integrations: [', `integrations: [${entry}, `);
  else if (!src.includes('integrations') && count('defineConfig({') === 1) src = src.replace('defineConfig({', `defineConfig({\n  integrations: [${entry}],`);
  else return { status: 'manual', file };
  // whole statements, not lines: Prettier wraps a long import over several
  const imports = [...src.matchAll(/^import\s[\s\S]*?['"][^'"\n]+['"][ \t]*;?[ \t]*$/gm)];
  const at = imports.length ? imports.at(-1).index + imports.at(-1)[0].length : 0;
  src = `${src.slice(0, at)}${at ? '\n' : ''}${load}${at ? '' : '\n'}${src.slice(at)}`;
  writeFileSync(file, src);
  return { status: 'added', file };
}

export async function init(root, argv) {
  const yes = argv.includes('--yes') || argv.includes('-y') || !process.stdin.isTTY;
  const force = argv.includes('--force');
  const pkgFile = join(root, 'package.json');
  const pkg = existsSync(pkgFile) ? JSON.parse(readFileSync(pkgFile, 'utf8')) : {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
  if (!deps.astro) {
    console.error(`No astro in ${relative(process.cwd(), pkgFile) || 'package.json'} — mitka is an Astro integration.`);
    process.exit(1);
  }

  const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question, fallback) => {
    if (!rl) return fallback;
    let a = '';
    try {
      a = (await rl.question(`${question} [${fallback}] `)).trim();
    } catch {
      // Ctrl+C / Ctrl+D: nothing has been written yet, or only what was already confirmed
      console.log('\nStopped.');
      process.exit(130);
    }
    return a || fallback;
  };
  const yesNo = async (question) => !/^n/i.test(await ask(question, 'Y'));

  console.log(`Setting up mitka in ${root}\n`);
  const configFile = join(root, 'mitka.config.mjs');
  const written = [];

  if (existsSync(configFile) && !force) {
    console.log('mitka.config.mjs is already here — leaving it alone (--force to start over).\n');
  } else {
    let edges = detectEdges(root);
    let source = 'your CSS';
    if (!edges.length && deps.tailwindcss) { edges = [1024, 768, 640]; source = "Tailwind's lg / md / sm"; }
    if (!edges.length) { edges = [992, 768, 480]; source = 'the defaults'; }
    const typed = await ask(`Breakpoints — the widths where your layout switches, from ${source}:`, edges.join(' '));
    const parsed = (typed.match(/\d+/g) || []).map(Number).filter((n) => n >= 200 && n <= 4000);
    const bands = bandsFrom(parsed.length ? parsed : edges);
    for (const b of bands) console.log(`  ${b.label.padEnd(17)} ${b.min}–${Number.isFinite(b.max) ? b.max : '∞'}, opens at ${b.ideal}`);

    const { pages, dynamic } = scanPages(root);
    console.log(`\nPages: ${pages.length} found in src/pages${dynamic.length ? `, ${dynamic.length} dynamic (listed as examples to fill in)` : ''}.`);
    const groups = [...new Set(pages.map((p) => p.group))];
    if (groups.length > 1) console.log(`  grouped by folder: ${groups.join(', ')}`);

    const gridAnswer = await ask('\nGrid overlay — container class, grid class, columns:', 'container grid 12');
    const [container = 'container', gridClass = 'grid', columns = '12'] = gridAnswer.split(/[\s,]+/);
    const sanity = Boolean(deps['@sanity/astro'] || deps.sanity);

    writeFileSync(configFile, renderConfig({
      bands, pages, dynamic, grid: { container, grid: gridClass, columns: Number(columns) || 12 }, sanity,
    }));
    written.push('mitka.config.mjs');
  }

  const wired = wireAstroConfig(root, Boolean(pkg.optionalDependencies?.mitka));
  if (wired.status === 'added') written.push(`${relative(root, wired.file)} (added mitka())`);

  if (await yesNo('\nLet Claude Code see open comments (hooks in .claude/settings.json)?')) {
    if (addClaudeHooks(root)) written.push('.claude/settings.json (SessionStart + UserPromptSubmit hooks)');
  }
  if (await yesNo('Keep pasted screenshots out of git?')) {
    const file = join(root, '.gitignore');
    const have = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const missing = IGNORE.filter((l) => !have.split('\n').includes(l));
    if (missing.length) {
      appendFileSync(file, `${have && !have.endsWith('\n') ? '\n' : ''}\n# mitka: pasted screenshots\n${missing.join('\n')}\n`);
      written.push('.gitignore');
    }
  }
  rl?.close();

  console.log(written.length ? `\nWrote: ${written.join(', ')}.` : '\nNothing to write.');
  if (wired.status === 'manual' || wired.status === 'missing') {
    console.log(`
Add the bar to your Astro config yourself:

  import mitka from 'mitka';
  export default defineConfig({ integrations: [mitka()] });`);
  }
  console.log('\nStart `astro dev` — the bar sits at the bottom of every page. `npx mitka` lists comments.');
}
