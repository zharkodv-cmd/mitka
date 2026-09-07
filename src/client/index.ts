// Entry of the injected page script. Draws the bar from the config the dev server
// hands out, so it is always the current page list and band set, and the same code
// serves every project.
import "./devbar.css";
import { loadConfig } from "./config";
import { mount } from "./markup";
import { run } from "./run";

loadConfig()
  .then((cfg) => {
    document.documentElement.style.setProperty("--dt-z", String(cfg.zIndex));
    mount(cfg);
    run(cfg);
  })
  .catch((e) => console.warn("[astro-devbar] not started:", e));

/* Editing the bar while it runs: it holds listeners on the document and window and may
   own a canvas iframe, so a hot re-run would stack a second bar on the first. A clean
   page is the only honest way to pick the change up. */
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
