# mitka

Мітка — a dev-only bar for Astro sites. One integration, nothing in the build.

- **Pages** menu grouped the way the Figma file is, with open-comment counts per breakpoint.
- **Grid** overlay on the project's own `.container` / `.grid`.
- **Spacing / Size / Typography** inspectors reporting *design* px (actual px ÷ the fluid root scale), with the colour token behind every colour.
- **Comments**: Figma-style pins on any element, threads, categories, pasted screenshots, per-breakpoint. Stored in the repo (`feedback/comments.json` + `feedback/images/`), read by Claude through the CLI.
- **Breakpoint canvas**: the page in an iframe at a band's width, draggable inside the band. Comments are written here and tagged with the band.
- **Device preview**: fixed real device widths in real shells — viewing only.

Sister tool of [Mistok](../mistok) (the Figma bridge): Mistok is the bridge into Figma, Mitka the marks on the site.

## Install

Private repo, so a project installs it from a tag and keeps it optional — a machine
without access (Vercel) skips it and builds without the bar:

```json
"optionalDependencies": { "mitka": "github:zharkodv-cmd/mitka#v0.1.0" }
```

```js
// astro.config.mjs
const mitka = await import('mitka').then((m) => m.default).catch(() => null);

export default defineConfig({
  integrations: [
    ...(mitka ? [mitka({ enabled: process.env.PUBLIC_DEV_CHROME !== 'off' })] : []),
  ],
});
```

That is all. The integration injects the bar into every page under `astro dev` and serves its endpoints under `/__devbar/`. Under `astro build` it does nothing.

While working on the bar itself: `npm link ../mitka` in the project (a symlink that `npm install` undoes).

## Options

```ts
mitka({
  enabled?: boolean;                 // default true
  breakpoints?: Breakpoint[];        // default: desktop ≥992 / tablet / landscape / portrait
  devices?: Device[];                // default: eight Apple devices
  pages?: Record<string, [name, group]>;  // '/tuition': ['5.1.1.D. Tuition', 'Main']
  groups?: string[];                 // menu order; unlisted pages land in the last group
  sanity?: boolean;                  // show the toggle for Sanity's visual-editing overlay
  ignore?: string[];                 // extra selectors the inspectors skip, e.g. ['.kit-nav']
  grid?: { container?: string; grid?: string; columns?: number }; // default container/grid/12
  zIndex?: number;                   // default 2000000020 — above Astro's dev toolbar and any app modal
})
```

A breakpoint's `frame` is a mockup shipped with the package, by name — no import needed:

```js
{ id: 'laptop', label: 'Laptop', min: 992, max: 1512, ideal: 1440, frameH: 900, device: 'laptop', frame: 'macbook' }
// macbook · ipad · ipadLandscape · iphone15Pro · iphone11Pro · iphone11ProMax · iphone8 · iphoneLandscape
```

Unlisted pages are named from their `<title>` (the part after an em dash), else from the route.

## The comment queue (CLI)

```
npx mitka                     open comments, newest last
npx mitka all                 including resolved
npx mitka reply <id> "..."    answer in the thread as Claude
npx mitka done <id> "..."     resolve as Claude + note (stays highlighted until you confirm)
npx mitka note <id> "..."     reply without changing status
npx mitka reopen <id>
npx mitka rm <id>             delete the thread and its screenshots
npx mitka digest              compact open list (SessionStart hook)
npx mitka count               one line (UserPromptSubmit hook)
```

The root is the nearest directory with a `package.json` above the cwd, or `--root <dir>`.

Claude Code hooks (`.claude/settings.json`):

```json
"SessionStart": [{ "hooks": [{ "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/node_modules/mitka/bin/mitka.mjs\" --root \"$CLAUDE_PROJECT_DIR\" digest" }] }],
"UserPromptSubmit": [{ "hooks": [{ "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/node_modules/mitka/bin/mitka.mjs\" --root \"$CLAUDE_PROJECT_DIR\" count" }] }]
```

Both print nothing while the queue is empty, and nothing at all when the package is not installed.

## Layout

```
src/integration.mjs       the Astro integration (injectScript + dev middleware)
src/server/middleware.mjs /__devbar/* endpoints
src/store/                comments.json store, categories, status — shared by CLI and server
src/presets.mjs           frames, devices, default breakpoints, switcher icons
src/client/               the bar: markup.ts builds the DOM, run.ts is the behaviour, mitka.css
bin/mitka.mjs             the CLI
assets/                   device mockups, served under /__devbar/assets/
tools/                    measure-device-frames.mjs (screen cut-out geometry), crop-device-frame.mjs
```

`npm test` runs the store selftest.

## Notes

- Everything the bar draws is sized in px on purpose: sites built on a fluid root font-size would otherwise scale the dev UI with the design.
- The canvas is the same page in an iframe; the script runs in both copies and they talk through `postMessage`.
- Screenshots live on disk next to the JSON, never inside it.
- Endpoint prefix `/__devbar/` and class prefix `dt-` predate the name and stay.
