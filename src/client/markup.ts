// The bar's DOM, built once from config. Everything run.ts looks up by class is here.
import type { MitkaConfig } from "./config";

const esc = (v: string) =>
  v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

const icon = (paths: string, size = 15) =>
  `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true">${paths}</svg>`;

export function mount(cfg: MitkaConfig) {
  const current = location.pathname.replace(/\/$/, "") || "/";

  /* One chip per breakpoint that still has something on it — the band's own icon plus
     a count, so "3 on Tuition" says which sizes to open. The script fills the numbers. */
  const chips = cfg.breakpoints
    .map((bp) => `<b data-bp="${esc(bp.id)}" hidden>${icon(bp.icon, 11)}<i></i></b>`)
    .join("");
  const pages = cfg.groups
    .map((g) =>
      `<li class="dt-pages-group">${esc(g)}</li>` +
      cfg.pages.filter((p) => p.group === g).map((p) =>
        `<li><a href="${esc(p.route)}"${p.route === current ? ' aria-current="page"' : ""}>` +
        `<span class="dt-menu-label">${esc(p.label)}</span><em class="dt-pages-n" hidden>${chips}</em></a></li>`).join(""))
    .join("");

  const devices = [...new Set(cfg.devices.map((d) => d.group))]
    .map((g) =>
      `<p class="dt-devices-group">${esc(g)}</p>` +
      cfg.devices.filter((d) => d.group === g).map((d) =>
        `<button type="button" data-device="${esc(d.id)}" aria-pressed="false">` +
        `<span class="dt-menu-label">${esc(d.label)}</span><em>${d.w}&times;${d.h}</em></button>`).join(""))
    .join("");

  const bps = cfg.breakpoints
    .map((b) => `<button class="dt-icon dt-bp" type="button" data-bp="${esc(b.id)}" aria-pressed="false" title="${esc(b.label)}">${icon(b.icon, 16)}</button>`)
    .join("");

  const cols = Array.from({ length: cfg.grid.columns }, () => `<div class="dt-overlay-col"></div>`).join("");
  const handleTip = "Drag to resize inside this breakpoint. Double-click snaps to the band's edge";

  document.body.insertAdjacentHTML("beforeend", `
<!-- One bar, bottom-centre: pages · devices | inspectors | comments | breakpoints. -->
<div class="devtools">
  <div class="dt-group dt-group--menus">
    <details class="dt-pages" name="dt-menu">
      <summary aria-label="Pages" title="Pages">${esc(current)}</summary>
      <ul>${pages}</ul>
    </details>
    <details class="dt-devices" name="dt-menu">
      <summary title="Devices">
        ${icon('<rect x="3" y="4" width="14" height="9" rx="1.5" /><path d="M7 16h6" />')}
        <span class="dt-devices-name">Device</span>
      </summary>
      <div class="dt-devices-menu">${devices}</div>
    </details>
  </div>

  <div class="dt-group" role="group" aria-label="Inspect">
    <button class="dt-icon dt-grid-btn" type="button" aria-pressed="false" title="Grid">
      ${icon('<path d="M4 3v14M8 3v14M12 3v14M16 3v14" />')}
    </button>
    <button class="dt-icon dt-pad-btn" type="button" aria-pressed="false" title="Spacing">
      ${icon('<rect x="2.5" y="2.5" width="15" height="15" rx="1.5" /><rect x="6.5" y="6.5" width="7" height="7" rx="1" stroke-dasharray="2 2" />')}
    </button>
    <button class="dt-icon dt-size-btn" type="button" aria-pressed="false" title="Size">
      ${icon('<path d="M3 7V4h3M17 13v3h-3M3 4l6 6M17 16l-6-6" />')}
    </button>
    <button class="dt-icon dt-type-btn" type="button" aria-pressed="false" title="Typography">
      ${icon('<path d="M2.5 15.5 6.5 5l4 10.5M3.9 12.6h5.2M15 4.5v11M13.2 6.3 15 4.5l1.8 1.8M13.2 13.7 15 15.5l1.8-1.8" />')}
    </button>
    <button class="dt-icon dt-studio-btn" type="button" aria-pressed="true" title="Sanity"${cfg.sanity ? "" : " hidden"}>
      ${icon('<path d="M12.5 3.5 16.5 7.5 7 17H3v-4z" />')}
    </button>
  </div>

  <div class="dt-group" role="group" aria-label="Comments">
    <button class="dt-icon dt-notes-btn" type="button" aria-pressed="false" title="Comment">
      ${icon('<path d="M4 3.5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9.5L5.5 16.5v-3H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" stroke-linejoin="round" />')}
      <span class="dt-notes-count" hidden></span>
    </button>
    <button class="dt-icon dt-copy-btn" type="button" title="Copy the whole queue">
      ${icon('<rect x="7.5" y="7.5" width="9" height="9" rx="1.6" /><path d="M12.5 5.1A1.6 1.6 0 0 0 10.9 3.5H5.1a1.6 1.6 0 0 0-1.6 1.6v5.8a1.6 1.6 0 0 0 1.6 1.6" />')}
    </button>
    <button class="dt-icon dt-history-btn" type="button" aria-pressed="false" title="Panel">
      ${icon('<rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M12 3.5v13M14 7.5h1.5M14 10h1.5" />')}
    </button>
    <button class="dt-icon dt-resolved-btn" type="button" aria-pressed="true" title="Resolved">
      ${icon('<circle cx="10" cy="10" r="7.5" /><path d="M6.8 10.2 9 12.4l4-4.4" stroke-linejoin="round" />')}
    </button>
  </div>

  <div class="dt-group dt-bps" role="group" aria-label="Breakpoint">${bps}</div>
</div>

<div class="dt-frame" hidden aria-hidden="true">
  <div class="dt-stage">
    <span class="dt-frame-handle" data-edge="l" title="${handleTip}"></span>
    <div class="dt-device">
      <iframe title="Breakpoint preview"></iframe>
      <img class="dt-shell-img" alt="" hidden />
    </div>
    <span class="dt-frame-handle" data-edge="r" title="${handleTip}"></span>
  </div>
  <div class="dt-ruler"></div>
  <span class="dt-frame-size"></span>
</div>

<aside class="dt-history" hidden aria-label="Comment history"></aside>
<div class="dt-notes-hi" hidden aria-hidden="true"><span class="dt-hi-box"></span><span class="dt-hi-tag"></span></div>
<div class="dt-notes-overlay" hidden aria-hidden="true"></div>
<div class="dt-grid-overlay" hidden aria-hidden="true">
  <div class="${esc(cfg.grid.container)} dt-overlay-container">
    <div class="${esc(cfg.grid.grid)} dt-overlay-grid">${cols}</div>
  </div>
</div>
<div class="dt-pad-overlay" hidden aria-hidden="true"></div>
`);
}
