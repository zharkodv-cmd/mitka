# mitka

Мітка — "a mark". A dev-only toolbar for Astro sites, for reviewing a site the way you
review a design file: leave pinned comments on any element, check spacing and type in
design pixels, and look at every breakpoint without leaving the page. Comments live in
the repo as JSON, so Claude Code (or anyone) can read them and answer from the terminal.

It exists only under `astro dev`. Nothing of it reaches a build.

- **Pages** — every route in one menu, grouped by folder (or your own groups), with the
  open-comment count per page and per breakpoint.
- **Grid** — your layout grid drawn over the page, from your own `.container` / `.grid`.
- **Spacing · Size · Typography** — hover an element for its padding, margin and gap,
  its size, or its type (size, line height and letter spacing the way Figma states them,
  colour by token name). Values are *design* px: actual px ÷ the root font scale.
- **Comments** — Figma-style pins: threads, four tags, screenshots (paste, drop or pick),
  filed per page and per breakpoint.
- **Breakpoints** — the page in a canvas at a band's width; drag either edge inside the
  band. Comments written there belong to that band.
- **Devices** — the page inside a real device mockup, at the device's own width. For
  looking only.

## Install

```sh
npm i -D mitka
npx mitka init
```

`init` reads the project and asks only what it cannot read:

- **breakpoints** — found in your CSS media queries (Tailwind's defaults if you use
  Tailwind), shown as bands for you to confirm or retype;
- **pages** — every page under `src/pages`, named from its `<title>`, grouped by folder;
  dynamic routes are listed as examples for you to fill in;
- **grid** — the container and grid classes the overlay should borrow;
- **Claude Code** — whether to add the hooks that show Claude the open comments;
- **git** — whether to keep pasted screenshots out of it.

It writes `mitka.config.mjs`, adds `mitka()` to `astro.config` if it is not there, and
touches nothing else. `npx mitka init --yes` takes every default.

Without `init`, `integrations: [mitka()]` in `astro.config.mjs` is enough: four default
breakpoints, pages grouped by folder.

After upgrading, stop and start `astro dev`. Astro's own restart (on a config change)
runs in the same Node process, which keeps the old server half of the bar loaded while
the browser half is already new.

## Using the bar

| Control | |
|---|---|
| **Pages** | jump to any page. Chips show comment counts per breakpoint: blue open, clay resolved by Claude, green resolved |
| **Grid** | the layout grid overlay |
| **Spacing / Size / Type** | inspectors, one at a time. Hold **Alt** to measure the parent |
| **Sanity** | hides Sanity's visual-editing overlay (only with `sanity: true`) |
| **Comment** | comment mode: click anything to pin a note. The badge counts open threads |
| **Panel** | the list of this page's threads at this breakpoint |
| **Resolved** | shows or hides resolved threads, on the page and in the menu |
| **Breakpoints** | open the canvas at a band. The widest band is your own window |
| **Device** | a device mockup, viewing only |
| **Tab** on top of the bar | folds the bar below the window edge and back |

Keys: **Esc** closes a menu, then the note you are writing, then the open thread, then
comment mode. **Enter** sends, **Shift+Enter** is a new line. Double-click a canvas
handle to snap to the band's edge.

Everything the bar remembers (modes, canvas width, a half-typed comment) is in
`localStorage`, per browser.

## Comments and Claude Code

Threads are stored in `feedback/comments.json`, screenshots in `feedback/images/`, both
at the project root. The CLI reads and answers them:

```
npx mitka                     open comments, newest last
npx mitka all                 including resolved
npx mitka reply <id> "..."    answer in the thread as Claude
npx mitka done <id> "..."     resolve as Claude + note (stays marked until you confirm)
npx mitka note <id> "..."     reply without changing status
npx mitka reopen <id>
npx mitka rm <id>             delete the thread and its screenshots
npx mitka prune [--dry]       move resolved threads to feedback/archive/
npx mitka digest              compact open list (SessionStart hook)
npx mitka count               one line (UserPromptSubmit hook)
npx mitka init [--yes]        set a project up
```

The root is the nearest directory with a `package.json` above the working directory, or
`--root <dir>`.

A thread Claude resolves is marked in clay until you confirm it with the tick, so "done"
and "checked" stay apart. The panel numbers threads per page and breakpoint (`#4`); the
CLI prints both that and the file-wide id: `#4 (id 10)`.

`prune` keeps the store readable: resolved threads and their screenshots move to
`feedback/archive/`, and the next comment carries on the numbering. Nothing is deleted.

The Claude Code hooks `init` adds to `.claude/settings.json` (both print nothing while the
queue is empty, and nothing at all where the package is not installed):

```json
"SessionStart": [{ "hooks": [{ "type": "command",
  "command": "if [ -f \"$CLAUDE_PROJECT_DIR/node_modules/mitka/bin/mitka.mjs\" ]; then node \"$CLAUDE_PROJECT_DIR/node_modules/mitka/bin/mitka.mjs\" --root \"$CLAUDE_PROJECT_DIR\" digest; fi" }] }],
"UserPromptSubmit": [{ "hooks": [{ "type": "command",
  "command": "if [ -f \"$CLAUDE_PROJECT_DIR/node_modules/mitka/bin/mitka.mjs\" ]; then node \"$CLAUDE_PROJECT_DIR/node_modules/mitka/bin/mitka.mjs\" --root \"$CLAUDE_PROJECT_DIR\" count; fi" }] }]
```

## Configuration

Everything lives in `mitka.config.mjs` at the project root — named exports or one
default object. It is re-read on every page load: edit, refresh, no restart.

```js
// mitka.config.mjs
export const breakpoints = [
  { id: 'desktop', label: 'Desktop', min: 992, max: Infinity, ideal: 1440 },
  { id: 'tablet', label: 'Tablet', min: 768, max: 991, ideal: 834 },
  { id: 'landscape', label: 'Mobile landscape', min: 480, max: 767, ideal: 667 },
  { id: 'portrait', label: 'Mobile portrait', min: 0, max: 479, ideal: 390 },
];

// route → [name, group]. Unlisted pages still appear, named by <title>.
// A number in front of a name only orders the rows: '1.2. About' reads as 'About'.
export const pages = {
  '/': ['Home', 'Main'],
  '/blog/hello-world': ['Blog post', 'Blog'], // an address a dynamic route serves
};
export const groups = ['Main', 'Blog'];      // menu order; unlisted pages land in the last

export const grid = { container: 'container', grid: 'grid', columns: 12 };
export const sanity = true;                  // Sanity overlay toggle
export const ignore = ['.my-dev-nav'];       // selectors the inspectors skip
export const devices = [/* … */];            // the device shelf, see below
export const zIndex = 2000000020;            // the bar's base layer
```

| Key | Default | |
|---|---|---|
| `breakpoints` | the four above | `id`, `label`, `min`, `max` (`Infinity` for the widest), `ideal` (canvas width), optional `icon` (SVG paths, 20×20) |
| `pages` | from `src/pages` | route → `[name, group]` |
| `groups` | by folder | group order |
| `grid` | `container` / `grid` / 12 | classes of your own layout the overlay reuses |
| `devices` | eight Apple devices | `{ id, label, group, w, h, frame }` — `frame` by name: `macbook` `ipad` `ipadLandscape` `iphone15Pro` `iphone11Pro` `iphone11ProMax` `iphone8` `iphoneLandscape` |
| `sanity` | `false` | show the Sanity overlay toggle |
| `ignore` | `[]` | selectors the inspectors and comment picker skip |
| `zIndex` | `2000000020` | above Astro's dev toolbar and any app modal |

The same keys can be passed to `mitka({ … })` in `astro.config`, where they win over the
file. `enabled` only works there: `mitka({ enabled: process.env.CI !== 'true' })` keeps
the bar out of, say, a Playwright run.

### A private install

Installed from a repo the build machine cannot reach (an `optionalDependency` on a
private GitHub repo), import it behind a catch so a missing package never breaks the
build — `init` writes it this way when it finds mitka under `optionalDependencies`:

```js
const mitka = await import('mitka').then((m) => m.default).catch(() => null);
export default defineConfig({ integrations: [...(mitka ? [mitka()] : [])] });
```

## How it works

- The integration injects one script into every page under `astro dev` and serves its
  endpoints under `/__devbar/` from Vite middleware. Under `astro build` it does nothing.
- The canvas is the same page in an iframe. The bar runs in both copies; the one inside
  hides itself and takes its modes from the page over `postMessage`.
- The bar stays above the page's modal `<dialog>`s: while one is open, the bar moves into
  a popover host inside it (top layer, not inert) and back out when it closes.
- Writes to `/__devbar/comments` from another origin are refused — any site open in the
  same browser could otherwise post a "comment" that Claude would read as a task.
- The bar is sized in px on purpose: a site with a fluid root font-size would otherwise
  scale the dev UI along with the design.

## Development

```
src/integration.mjs       the Astro integration
src/server/middleware.mjs /__devbar/* endpoints, mitka.config.mjs loading
src/store/                comments.json store, tags, statuses — shared by CLI, server, browser
src/presets.mjs           device mockups, devices, default breakpoints, switcher icons
src/client/               the bar: markup.ts builds the DOM, run.ts is the behaviour, mitka.css
bin/mitka.mjs             the CLI; bin/init.mjs is `mitka init`
assets/                   device mockups, served under /__devbar/assets/
tools/                    mockup prep (needs playwright): screen cut-out geometry, crop
```

`npm test` runs the selftest (store, CLI, init). To work on the bar, point a test
project at your checkout — `"mitka": "file:../mitka"` — and restart its dev server after
changing anything outside `src/client/`.

## License

MIT
