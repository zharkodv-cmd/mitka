# astro-devbar

A dev-only bar for Astro sites. One integration, nothing in the build.

- **Pages** menu grouped the way the Figma file is, with open-comment counts per breakpoint.
- **Grid** overlay on the project's own `.container` / `.grid`.
- **Spacing / Size / Typography** inspectors reporting *design* px (actual px ÷ the fluid root scale), with the colour token behind every colour.
- **Comments**: Figma-style pins on any element, threads, categories, pasted screenshots, per-breakpoint. Stored in the repo (`feedback/comments.json` + `feedback/images/`), read by Claude through the CLI.
- **Breakpoint canvas**: the page in an iframe at a band's width, draggable inside the band, real device mockup around it. Comments are written here and tagged with the band.
- **Device preview**: fixed real device widths in real shells — viewing only.

## Install

```sh
npm i -D astro-devbar
```

```js
// astro.config.mjs
import devbar from 'astro-devbar';

export default defineConfig({
  integrations: [
    devbar({
      enabled: process.env.PUBLIC_DEV_CHROME !== 'off', // e.g. off for Playwright
    }),
  ],
});
```

That is all. The integration injects the bar into every page under `astro dev` and serves its endpoints under `/__devbar/`. Under `astro build` it does nothing.

## Options

```ts
devbar({
  enabled?: boolean;                 // default true
  breakpoints?: Breakpoint[];        // default: desktop ≥992 / tablet / landscape / portrait
  devices?: Device[];                // default: eight Apple devices
  pages?: Record<string, [name, group]>;  // '/tuition': ['5.1.1.D. Tuition', 'Main']
  groups?: string[];                 // menu order; unlisted pages land in the last group
  sanity?: boolean;                  // show the toggle for Sanity's visual-editing overlay
  ignore?: string[];                 // extra selectors the inspectors skip, e.g. ['.kit-nav']
  grid?: { container?: string; grid?: string; columns?: number }; // default container/grid/12
  zIndex?: number;                   // default 100
})
```

Device mockups ship with the package. Reference them from `astro-devbar/presets`:

```js
import { FRAMES } from 'astro-devbar/presets';
{ id: 'laptop', label: 'Laptop', min: 992, max: 1512, ideal: 1440, frameH: 900, device: 'laptop', frame: FRAMES.macbook }
```

Unlisted pages are named from their `<title>` (the part after an em dash), else from the route.

## The comment queue (CLI)

```
npx devbar                     open comments, newest last
npx devbar all                 including resolved
npx devbar reply <id> "..."    answer in the thread as Claude
npx devbar done <id> "..."     resolve as Claude + note (stays highlighted until you confirm)
npx devbar note <id> "..."     reply without changing status
npx devbar reopen <id>
npx devbar rm <id>             delete the thread and its screenshots
npx devbar digest              compact open list (SessionStart hook)
npx devbar count               one line (UserPromptSubmit hook)
```

The root is the nearest directory with a `package.json` above the cwd, or `--root <dir>`.

Claude Code hooks (`.claude/settings.json`):

```json
"SessionStart": [{ "hooks": [{ "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/node_modules/astro-devbar/bin/devbar.mjs\" --root \"$CLAUDE_PROJECT_DIR\" digest" }] }],
"UserPromptSubmit": [{ "hooks": [{ "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/node_modules/astro-devbar/bin/devbar.mjs\" --root \"$CLAUDE_PROJECT_DIR\" count" }] }]
```

Both print nothing while the queue is empty.

## Layout

```
src/integration.mjs      the Astro integration (injectScript + dev middleware)
src/server/middleware.mjs /__devbar/* endpoints
src/store/               comments.json store, categories, status — shared by CLI and server
src/presets.mjs          frames, devices, default breakpoints, switcher icons
src/client/              the bar: markup.ts builds the DOM, run.ts is the behaviour, devbar.css
bin/devbar.mjs           the CLI
assets/                  device mockups, served under /__devbar/assets/
tools/                   measure-device-frames.mjs (screen cut-out geometry), crop-device-frame.mjs
```

`npm test` runs the store selftest.

## Notes

- Everything the bar draws is sized in px on purpose: sites built on a fluid root font-size would otherwise scale the dev UI with the design.
- The canvas is the same page in an iframe; the script runs in both copies and they talk through `postMessage`.
- Screenshots live on disk next to the JSON, never inside it.
