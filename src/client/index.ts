// Entry of the injected page script. Draws the bar from the config the dev server
// hands out, so it is always the current page list and band set, and the same code
// serves every project.
import "./mitka.css";
import { loadConfig } from "./config";
import { mount } from "./markup";
import { run } from "./run";
import { keepAboveModals } from "./toplayer";

// The canvas copy: marked before the config arrives, so its scrollbar and its own bar
// never paint for a frame.
if (window.self !== window.top) document.documentElement.classList.add("dt-in-frame");

loadConfig()
  .then((cfg) => {
    document.documentElement.style.setProperty("--dt-z", String(cfg.zIndex));
    mount(cfg);
    run(cfg);
    // everything the bar draws, except the canvas iframe (see toplayer.ts)
    keepAboveModals(
      [".dt-grid-overlay", ".dt-pad-overlay", ".dt-notes-overlay", ".dt-notes-hi", ".dt-history", ".devtools", ".dt-tab"]
        .map((s) => document.querySelector<HTMLElement>(s))
        .filter((el): el is HTMLElement => !!el),
    );
  })
  .catch((e) => console.warn("[mitka] not started:", e));

/* Editing the bar while it runs: it holds listeners on the document and window and may
   own a canvas iframe, so a hot re-run would stack a second bar on the first. A clean
   page is the only honest way to pick the change up. */
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
