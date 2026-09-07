// mitka — the Astro integration. Dev only by construction: outside `astro dev`
// the hooks do nothing, so no script, style, route or asset of the bar can reach a
// build. (A component imported from a layout would leak its stylesheet, because Astro
// collects styles from the import graph, not from what renders.)
import { fileURLToPath } from 'node:url';
import { mitkaMiddleware } from './server/middleware.mjs';

const PKG = fileURLToPath(new URL('..', import.meta.url));

/** @param {import('../types.d.ts').MitkaOptions} [options] */
export default function mitka(options = {}) {
  let routes = [];
  return {
    name: 'mitka',
    hooks: {
      'astro:config:setup': ({ command, config, injectScript, updateConfig }) => {
        if (command !== 'dev' || options.enabled === false) return;
        const root = fileURLToPath(config.root);
        // Every page, every copy of it — the breakpoint canvas is the same page in an
        // iframe, and the script inside knows it is the inner one.
        injectScript('page', 'import "mitka/client";');
        updateConfig({
          vite: {
            // Served as source, not pre-bundled: the client is TypeScript plus a CSS
            // import, which Vite handles directly and esbuild's dep scan does not.
            optimizeDeps: { exclude: ['mitka'] },
            // A `file:` link resolves to its real path outside the project, which the
            // dev server refuses to serve unless told otherwise.
            server: { fs: { allow: [root, PKG] } },
            plugins: [{
              name: 'mitka',
              // configureServer, not astro:server:setup: this runs before Astro's own
              // request handler is installed, so /__devbar/* never reaches the router.
              configureServer(server) {
                server.middlewares.use(mitkaMiddleware({ root, pkg: PKG, options, routes: () => routes }));
              },
            }],
          },
        });
      },
      // Re-fires in dev whenever a page file is added or removed, so the menu stays
      // honest without a restart — the client asks for the list on every load.
      'astro:routes:resolved': ({ routes: resolved }) => { routes = resolved; },
    },
  };
}
