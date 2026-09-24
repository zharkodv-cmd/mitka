// The bar's behaviour. It runs twice when a canvas is open — once in the page, once in
// the iframe copy — and the two talk through postMessage. The page is the one in
// charge: the copy never reads the modes from storage, it asks (see `hello`).
import { categoryOf } from "../store/categories.mjs";
import { stateOf, STATE_LABEL } from "../store/status.mjs";
import type { MitkaConfig } from "./config";
import { DEVTOOLS_DEVICES } from "../devtools-devices.mjs";
import { drawDevice, pageTints, inkFor } from "./devices";

export function run(cfg: MitkaConfig) {
  const BREAKPOINTS = cfg.breakpoints;
  const CATEGORIES = cfg.categories;
  /* The widest band is your own window rather than a canvas, and it is where a note
     with no band on record belongs. Found by shape, not by the id "desktop". */
  const WIDE = (BREAKPOINTS.find((b) => !Number.isFinite(b.max)) ?? BREAKPOINTS[0]).id;
  const bpOf = (width: number) =>
    BREAKPOINTS.find((b) => width >= b.min && width <= b.max)?.id ?? WIDE;
  const bandOfNote = (n: { breakpoint?: string }) => n.breakpoint || WIDE;
  const deviceById = (id: string) => cfg.devices.find((d) => d.id === id);
  /* Inside the canvas the same page runs a second copy of the bar. It shares this
     origin's localStorage, so everything it would remember is either the page's
     already or — the device preview forcing comments off — wrong for the page. */
  const inFrame = window.self !== window.top;
  const persist = (key: string, value: string) => { if (!inFrame) localStorage.setItem(key, value); };

  /* Every tool button writes its hint as `title`, which is the one place the text
     should live — but the native tooltip needs a second of dead-still cursor and never
     showed up on this page. Move it to `data-tip`, which CSS draws instantly, and keep
     the string as the button's accessible name: these are icons with no text of their
     own, and dropping `title` without replacing it would leave them unnamed. */
  for (const b of document.querySelectorAll<HTMLElement>(".devtools .dt-icon[title]")) {
    b.dataset.tip = b.title;
    if (!b.getAttribute("aria-label")) b.setAttribute("aria-label", b.title);
    b.removeAttribute("title");
  }

  const btn = document.querySelector<HTMLButtonElement>(".dt-grid-btn")!;
  const overlay = document.querySelector<HTMLElement>(".dt-grid-overlay")!;
  const KEY = "dt-grid";
  const setGrid = (on: boolean) => {
    overlay.hidden = !on;
    btn.setAttribute("aria-pressed", String(on));
    persist(KEY, on ? "1" : "0");
    tellFrame({ grid: on });
  };
  btn.addEventListener("click", () => setGrid(overlay.hidden === true));

  // Summary shows the page name from <title> ("Site — About" → "About")
  const summary = document.querySelector<HTMLElement>(".dt-pages-name")!;
  const active = document.querySelector<HTMLElement>(".dt-pages a[aria-current]");
  const t = document.title.split("—").pop()?.trim();
  // .dt-menu-label, not the whole row: the row also holds the route in an <em>
  const activeName = active?.querySelector(".dt-menu-label")?.textContent?.trim();
  summary.textContent = activeName || t || summary.textContent;

  /* The pages and devices menus are <details>, which only ever close on their own
     summary. Escape, a click anywhere else and focus leaving the window (a click into
     the canvas iframe) close them too. In comment mode that outside click only closes
     the menu — it must not also drop a pin where it landed. */
  const menus = [...document.querySelectorAll<HTMLDetailsElement>(".devtools details")];
  let swallowClick = false;
  const closeMenus = () => {
    const open = menus.filter((m) => m.open);
    for (const m of open) m.open = false;
    return open;
  };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const [was] = closeMenus();
    if (!was) return;
    was.querySelector("summary")?.focus();
    // Escape also backs out of comment mode; one press, one step
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  document.addEventListener("pointerdown", (e) => {
    swallowClick = menus.some((m) => m.open && !m.contains(e.target as Node)) && closeMenus().length > 0;
  }, true);
  addEventListener("blur", closeMenus);

  /* Three inspectors over one overlay — spacing, size, type. Only one can be on at a
     time: they all answer "what is this element" for whatever the cursor is over, and
     two answers stacked on the same box was unreadable. Everything is reported in
     DESIGN pixels (actual px ÷ the fluid root scale), which is what Figma shows. */
  const padOverlay = document.querySelector<HTMLElement>(".dt-pad-overlay")!;
  const INSPECT_KEY = "dt-inspect";
  const SKIP = [".devtools", ".dt-pad-overlay", ".dt-grid-overlay", ".dt-frame", ".dt-history", ...cfg.ignore].join(", ");
  /* What comment mode leaves alone: the bar's own parts, and whatever the project told
     it to ignore — a dev nav stays a nav. */
  const NOT_PINNABLE = [".devtools", ".dt-notes-overlay", ".dt-history", ".dt-frame", ...cfg.ignore].join(", ");
  type Inspector = "" | "pads" | "sizes" | "type";
  const inspectBtns: Record<Exclude<Inspector, "">, HTMLButtonElement> = {
    pads: document.querySelector<HTMLButtonElement>(".dt-pad-btn")!,
    sizes: document.querySelector<HTMLButtonElement>(".dt-size-btn")!,
    type: document.querySelector<HTMLButtonElement>(".dt-type-btn")!,
  };
  let inspect: Inspector = "";
  let raf = 0;

  const designPx = (px: number) => {
    const scale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    const v = px / scale;
    return Math.round(v * 10) % 10 === 0 ? String(Math.round(v)) : v.toFixed(1);
  };

  /* p = padding, m = margin, g = the gap between a flex/grid container's children. */
  const zone = (x: number, y: number, w: number, h: number, label: string, kind = "p") => {
    if (w <= 0 || h <= 0) return "";
    const chip =
      label !== ""
        ? `<span class="dt-pad-chip dt-pad-chip--${kind}" style="left:${x + w / 2}px;top:${y + h / 2}px">${label}</span>`
        : "";
    return `<span class="dt-pad-zone dt-pad-zone--${kind}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></span>${chip}`;
  };

  const SPACING = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "marginTop", "marginRight", "marginBottom", "marginLeft", "columnGap", "rowGap"] as const;

  /* Text sitting inside a padded card leaves the cursor on the text, whose own box has
     nothing to show — which is the "sometimes it shows no padding" case. Climb to the
     nearest ancestor that actually spaces something. The tag label always names the
     element that was measured, so this never quietly reports the wrong box. */
  const spacer = (el: Element) => {
    let n: Element | null = el;
    for (let i = 0; n && i < 6; i++, n = n.parentElement) {
      const cs = getComputedStyle(n) as unknown as Record<string, string>;
      if (SPACING.some((k) => parseFloat(cs[k]) >= 2)) return n;
    }
    return el;
  };

  /* The space between children, drawn rather than only named in the tag: a gap is the
     one measurement that belongs to the group and to none of its boxes. */
  const gapZones = (el: Element, cs: CSSStyleDeclaration) => {
    const gap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    if (!(cs.display.includes("flex") || cs.display.includes("grid")) || (!gap && !rowGap)) return "";
    const kids = [...el.children]
      .map((k) => k.getBoundingClientRect())
      .filter((r) => r.width || r.height);
    let html = "";
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1];
      const b = kids[i];
      if (gap && b.left >= a.right - 1) {
        const top = Math.max(a.top, b.top);
        html += zone(a.right, top, b.left - a.right, Math.min(a.bottom, b.bottom) - top, designPx(gap), "g");
      } else if (rowGap && b.top >= a.bottom - 1) {
        const left = Math.min(a.left, b.left);
        html += zone(left, a.bottom, Math.max(a.right, b.right) - left, b.top - a.bottom, designPx(rowGap), "g");
      }
    }
    return html;
  };

  const outline = (r: DOMRect) =>
    `<span class="dt-pad-outline" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></span>`;

  const tagChip = (el: Element, r: DOMRect, extra = "") =>
    `<span class="dt-pad-tag" style="left:${r.left}px;top:${Math.max(2, r.top - 22)}px">${
      el.tagName.toLowerCase() + (el.classList[0] ? "." + el.classList[0] : "")}${extra}</span>`;

  const drawPads = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const pt = parseFloat(cs.paddingTop);
    const pr = parseFloat(cs.paddingRight);
    const pb = parseFloat(cs.paddingBottom);
    const pl = parseFloat(cs.paddingLeft);
    let html = outline(r);
    html += zone(r.left, r.top, r.width, pt, pt >= 2 ? designPx(pt) : "");
    html += zone(r.left, r.bottom - pb, r.width, pb, pb >= 2 ? designPx(pb) : "");
    html += zone(r.left, r.top + pt, pl, r.height - pt - pb, pl >= 2 ? designPx(pl) : "");
    html += zone(r.right - pr, r.top + pt, pr, r.height - pt - pb, pr >= 2 ? designPx(pr) : "");
    const mt = parseFloat(cs.marginTop);
    const mr = parseFloat(cs.marginRight);
    const mb = parseFloat(cs.marginBottom);
    const ml = parseFloat(cs.marginLeft);
    html += zone(r.left, r.top - mt, r.width, mt, mt >= 2 ? designPx(mt) : "", "m");
    html += zone(r.left, r.bottom, r.width, mb, mb >= 2 ? designPx(mb) : "", "m");
    html += zone(r.left - ml, r.top, ml, r.height, ml >= 2 ? designPx(ml) : "", "m");
    html += zone(r.right, r.top, mr, r.height, mr >= 2 ? designPx(mr) : "", "m");
    html += gapZones(el, cs);
    const gap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    const gapInfo =
      (cs.display.includes("flex") || cs.display.includes("grid")) && (gap || rowGap)
        ? ` · gap ${designPx(gap)}${rowGap && rowGap !== gap ? "/" + designPx(rowGap) : ""}`
        : "";
    padOverlay.innerHTML = html + tagChip(el, r, gapInfo);
  };

  const drawSize = (el: Element) => {
    const r = el.getBoundingClientRect();
    padOverlay.innerHTML =
      outline(r) +
      `<span class="dt-pad-chip" style="left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px">${
        designPx(r.width)} × ${designPx(r.height)}</span>` +
      tagChip(el, r);
  };

  /* rgb() is what getComputedStyle hands back and hex is what the design file speaks;
     a translucent colour keeps its alpha as a percentage rather than losing it. */
  const hex = (c: string) => {
    const n = (c.match(/[\d.]+/g) || []).map(Number);
    if (n.length < 3) return c;
    const h = "#" + n.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    return n[3] !== undefined && n[3] < 1 ? `${h} · ${Math.round(n[3] * 100)}%` : h;
  };

  /* Which token this colour came from. There is no way back from a computed colour to
     the var() that produced it, so every custom property on :root that parses as a
     colour is resolved once through a probe element and matched by value. Names are
     compared shortest-first: --color-black is the answer, not a longer alias that
     happens to hold the same hex. */
  let tokenColors: [rgb: string, name: string][] | null = null;
  const colorTokens = () => {
    if (tokenColors) return tokenColors;
    const cs = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.append(probe);
    const out: [string, string][] = [];
    for (const name of Array.from(cs as unknown as string[])) {
      if (!name.startsWith("--")) continue;
      const v = cs.getPropertyValue(name).trim();
      if (!/^(#|rgb|hsl|oklch|lab|color\()/i.test(v)) continue;
      probe.style.color = "rgb(1, 2, 3)"; // a value no token holds, so a rejected one is visible
      probe.style.color = v;
      const rgb = getComputedStyle(probe).color;
      if (rgb && rgb !== "rgb(1, 2, 3)") out.push([rgb, name]);
    }
    probe.remove();
    out.sort((a, b) => a[1].length - b[1].length);
    tokenColors = out;
    return out;
  };
  const tokenName = (rgb: string) => colorTokens().find(([v]) => v === rgb)?.[1] ?? "";

  /* 500 is a number; Medium is what the Figma panel says and what we type into CSS. */
  const WEIGHTS: Record<string, string> = {
    "100": "Thin", "200": "Extra Light", "300": "Light", "400": "Regular", "500": "Medium",
    "600": "Semi Bold", "700": "Bold", "800": "Extra Bold", "900": "Black",
  };

  /* Type inspector: the values Figma's own panel shows, in its units — line-height and
     letter-spacing as a percentage of the size, the weight by name, the colour by token.
     The raw px rides along dimmed, because px is what the brief is written in and what
     a comment quotes. */
  const drawType = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === "normal" ? 0 : parseFloat(cs.lineHeight);
    const ls = parseFloat(cs.letterSpacing) || 0;
    const token = tokenName(cs.color);
    const pct = (v: number) => `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
    const rows: [string, string][] = [
      ["Font", cs.fontFamily.split(",")[0].replace(/["']/g, "") + (cs.fontStyle !== "normal" ? ` ${cs.fontStyle}` : "")],
      ["Weight", `${WEIGHTS[cs.fontWeight] ?? ""} <em>${cs.fontWeight}</em>`],
      ["Size", `${designPx(size)}px`],
      ["Line", lh ? `${pct(lh / size)} <em>${designPx(lh)}px</em>` : "normal"],
      /* Percent of the font size, the way Figma states it; the px stays alongside
         because that is the number the brief pins letter-spacing to. */
      ["Letter", ls ? `${pct(ls / size)} <em>${ls.toFixed(2).replace(/\.?0+$/, "")}px</em>` : "0"],
      ["Color", `<i class="dt-type-sw" style="background:${cs.color}"></i>${
        token ? `${token} <em>${hex(cs.color)}</em>` : hex(cs.color)}`],
    ];
    /* Below the element, or above it when there is no room — the card is ~120px tall
       and a heading near the fold would otherwise be measured off-screen. */
    const below = r.bottom + 130 < innerHeight;
    const top = below ? r.bottom + 8 : Math.max(8, r.top - 138);
    const left = Math.min(Math.max(8, r.left), innerWidth - 210);
    padOverlay.innerHTML =
      outline(r) +
      tagChip(el, r) +
      `<div class="dt-type-card" style="left:${left}px;top:${top}px">${rows
        .map(([k, v]) => `<span class="dt-type-row"><b>${k}</b><span>${v}</span></span>`)
        .join("")}</div>`;
  };

  const onInspectMove = (e: MouseEvent) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      padOverlay.hidden = true;
      let el = document.elementFromPoint(e.clientX, e.clientY);
      padOverlay.hidden = false;
      if (!el || el.closest(SKIP)) { padOverlay.innerHTML = ""; return; }
      /* Alt walks one level out. Inside a group the cursor can only ever land on a
         child, so without this the container's own padding is unreachable by hover. */
      if (e.altKey && el.parentElement && el.parentElement !== document.body) el = el.parentElement;
      if (inspect === "sizes") drawSize(el);
      else if (inspect === "type") drawType(el);
      else drawPads(e.altKey ? el : spacer(el));
    });
  };

  const setInspect = (key: Inspector) => {
    inspect = key;
    for (const [k, b] of Object.entries(inspectBtns)) b.setAttribute("aria-pressed", String(k === key));
    persist(INSPECT_KEY, key);
    tellFrame({ inspect: key });
    padOverlay.hidden = !key;
    padOverlay.innerHTML = "";
    if (key) document.addEventListener("mousemove", onInspectMove);
    else document.removeEventListener("mousemove", onInspectMove);
  };
  for (const [k, b] of Object.entries(inspectBtns)) {
    b.addEventListener("click", () => {
      if (k !== inspect) setNotes(false);
      setInspect(inspect === k ? "" : (k as Inspector));
    });
  }

  /* Comment mode: Figma-style numbered pins on the page. Pins live in
     feedback/comments.json via /__devbar/comments — a file, not localStorage, so
     the notes survive a different browser and I can read them straight from the repo. */
  const notesBtn = document.querySelector<HTMLButtonElement>(".dt-notes-btn")!;
  const bpBtns = [...document.querySelectorAll<HTMLButtonElement>(".dt-bp")];
  const historyBtn = document.querySelector<HTMLButtonElement>(".dt-history-btn")!;
  const history = document.querySelector<HTMLElement>(".dt-history")!;
  const studioBtn = document.querySelector<HTMLButtonElement>(".dt-studio-btn")!;
  const device = document.querySelector<HTMLElement>(".dt-device")!;
  const shellEl = document.querySelector<HTMLElement>(".dt-shell")!;
  const chromeTop = document.querySelector<HTMLElement>('.dt-chrome[data-at="top"]')!;
  const chromeBottom = document.querySelector<HTMLElement>('.dt-chrome[data-at="bottom"]')!;
  const ruler = document.querySelector<HTMLElement>(".dt-ruler")!;
  const devicesMenu = document.querySelector<HTMLDetailsElement>(".dt-devices")!;
  const hi = document.querySelector<HTMLElement>(".dt-notes-hi")!;
  const hiBox = hi.querySelector<HTMLElement>(".dt-hi-box")!;
  const hiTag = hi.querySelector<HTMLElement>(".dt-hi-tag")!;
  const handles = [...document.querySelectorAll<HTMLElement>(".dt-frame-handle")];
  const sizeBadge = document.querySelector<HTMLElement>(".dt-frame-size")!;
  const rotateBtn = document.querySelector<HTMLButtonElement>(".dt-frame-rotate")!;
  const barsBtn = document.querySelector<HTMLButtonElement>(".dt-frame-bars")!;
  const frame = document.querySelector<HTMLElement>(".dt-frame")!;
  /* The narrow breakpoints are rendered in an iframe: media queries read the viewport,
     not a container, so shrinking an element on this page would change nothing. Inside
     that iframe this same code runs again — it must not open another one. */
  const frameEl = frame.querySelector("iframe")!;
  const notesCount = document.querySelector<HTMLElement>(".dt-notes-count")!;
  const notesOverlay = document.querySelector<HTMLElement>(".dt-notes-overlay")!;
  const NOTES_KEY = "dt-notes";
  const ROUTE = location.pathname.replace(/\/+$/, "") || "/";
  type Note = {
    // present when the whole file is read at once; the per-route fetch does not need it
    route?: string;
    id: number; selector: string; rx: number; ry: number;
    text: string; label: string; status: string; note: string; breakpoint?: string; category?: string;
    doneBy?: string | null; images?: string[]; browser?: string; device?: string;
    tag?: string; classes?: string[]; nth?: number;
    replies?: { author: string; text: string; at: string }[];
    createdAt?: string; updatedAt?: string | null;
  };
  let notes: Note[] = [];
  let notesOn = false;
  let openId: number | null = null;
  let draft:
    | { selector: string; rx: number; ry: number; label: string; tag: string; classes: string[]; nth: number;
        category: string; image?: string; text?: string }
    | null = null;
  let notesRaf = 0;
  /* What is half-typed in the open thread's reply box. Only one card is ever open, so
     one variable does it. Both this and draft.text exist because every render rebuilds
     the textareas: picking a category or pasting a screenshot used to wipe the sentence
     you were in the middle of. */
  let replyDraft = "";
  /* Which thread that half-typed reply belongs to. Checked at render rather than at
     each of the six places openId changes, so no path can carry one thread's text into
     another's box. */
  let replyFor: number | null = null;
  /* null = follow the real window; a value = you are looking at another breakpoint's
     notes while the window stays where it is. Comments are always filed under the
     breakpoint the window is actually at, so a pin never lies about what was seen. */
  let bpFilter: string | null = null;
  /* A half-typed comment is work. It lived in `draft` alone, so an HMR reload — or the
     stray refresh that follows one — took the sentence with it. Kept per route: the
     draft belongs to the page it points at, and two tabs on two pages never fight. */
  const DRAFT_KEY = `dt-draft:${ROUTE}${inFrame ? ":canvas" : ""}`;
  let draftSave = 0;
  const writeDraft = () => {
    if (!draft && !replyDraft) { localStorage.removeItem(DRAFT_KEY); return; }
    const body = { draft, reply: replyDraft ? { for: replyFor, text: replyDraft } : null };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(body)); } catch {
      /* A pasted screenshot is a data URL of megabytes and the ~5 MB store refuses the
         lot. The sentence is the half worth keeping; the image is still on the clipboard. */
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(
          { ...body, draft: draft && { ...draft, image: undefined } }));
      } catch { /* nothing to be done: keep typing, the file is still the record */ }
    }
  };
  /* Debounced because it runs on every keystroke and every render; flushed on the way
     out, or a reload inside the window would lose exactly what this exists to keep. */
  const keepDraft = () => { clearTimeout(draftSave); draftSave = setTimeout(writeDraft, 200); };
  addEventListener("pagehide", () => { clearTimeout(draftSave); writeDraft(); });
  /* One switch for resolved threads: it governs both their dimmed marks on the page
     and their rows in the panel. Default on — a resolved thread you cannot see is a
     decision you cannot revisit. */
  let showResolved = localStorage.getItem("dt-resolved") !== "0";
  /* Longest match first: Edge and Opera both carry "Chrome" in their UA, and Chrome
     carries no "Version/", which is what separates it from Safari. */
  const BROWSERS: [RegExp, string][] = [
    [/Edg\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+).*Safari/, "Safari"],
  ];
  const PLATFORMS: [RegExp, string][] = [
    [/iPhone|iPad/, "iOS"], [/Android/, "Android"], [/Mac OS X/, "macOS"],
    [/Windows/, "Windows"], [/Linux/, "Linux"],
  ];
  const browserTag = () => {
    const ua = navigator.userAgent;
    const hit = (list: [RegExp, string][]) => list.find(([re]) => re.test(ua));
    const b = hit(BROWSERS);
    const os = hit(PLATFORMS);
    const version = b ? b[0].exec(ua)?.[1] : null;
    return [b ? `${b[1]}${version ? " " + version : ""}` : "unknown browser", os?.[1]]
      .filter(Boolean).join(" \u00b7 ");
  };

  const currentBp = () => bpOf(innerWidth);
  const activeBp = () => bpFilter ?? currentBp();
  const syncBpButtons = () => {
    const active = activeBp();
    for (const b of bpBtns) b.setAttribute("aria-pressed", String(b.dataset.bp === active));
  };

  /* A path, not a class list: classes are shared, and a hashed one would not survive
     the next build. Stops at the first id it meets. */
  const cssPath = (start: Element) => {
    const parts: string[] = [];
    let node: Element | null = start;
    while (node && node.tagName !== "HTML" && parts.length < 8) {
      if (node.id) { parts.unshift("#" + CSS.escape(node.id)); break; }
      const parent: HTMLElement | null = node.parentElement;
      const tag = node.tagName.toLowerCase();
      const same = parent ? [...parent.children].filter((c) => c.tagName === node!.tagName) : [];
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
      node = parent;
    }
    return parts.join(">");
  };

  /* Finding the element again, in order of confidence:
       1. the stored path — right until a sibling is added or removed above it;
       2. tag + classes + the exact text the pin was placed on;
       3. tag + classes alone.
     Without the fallbacks a pin would silently jump to whatever now sits at that
     nth-of-type slot, which is worse than moving: it would point at the wrong thing. */
  /* Both sides cleaned. Sanity's visual editing writes zero-width markers into the
     page text — well over a thousand inside a single element on a CMS page — and the
     label was stored clean, so comparing it against a raw textContent never matched.
     Every pin on a CMS-heavy page then fell through to the fallback and landed on
     whatever came first in the pool. */
  const sameText = (el: Element, label: string) =>
    !label || clean(el.textContent || "").slice(0, 60) === label;

  const poolSelector = (tag?: string, classes?: string[]) =>
    [tag || "*", ...(classes || []).map((k) => "." + CSS.escape(k))].join("");

  const poolOf = (c: { tag?: string; classes?: string[] }) => {
    try { return [...document.querySelectorAll(poolSelector(c.tag, c.classes))]; } catch { return []; }
  };

  const resolveEl = (c: Note): Element | null => {
    let el: Element | null = null;
    try { el = document.querySelector(c.selector); } catch { el = null; }
    if (el && sameText(el, c.label)) return el;
    const pool = poolOf(c);
    /* An empty label matches everything, so text can only be trusted when there is
       some. Twenty salary labels and thirty images have none — for those the position
       the pin was placed at is the only thing left that distinguishes them. */
    const byText = clean(c.label) ? pool.find((n) => sameText(n, c.label)) : null;
    return byText || (c.nth != null ? pool[c.nth] : null) || pool[0] || el;
  };

  /* Anchor is stored as a fraction of the element's box, so the pin keeps its place
     when the fluid layout rescales — an absolute offset would drift. */
  const anchorOf = (c: Note) => {
    const el = resolveEl(c);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null; // hidden element: no pin rather than a pin at 0,0
    return { x: r.left + r.width * c.rx, y: r.top + r.height * c.ry };
  };

  /* Absolute date and time, not "2 hours ago": a thread gets answered days later
     and the stamp has to say which day that was without arithmetic. Locale comes
     from the browser, so the month reads in whatever language you work in. */
  const stamp = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
        })
      : "";

  const TRASH = `<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="M4 6h12M8 6V4.2h4V6M6.6 6l.55 9.8h5.7L13.4 6"/></svg>`;
  /* The tick and the cross were text glyphs — a ✓ and a ✕ sit on a baseline and carry
     the font's own weight, so they never lined up with the drawn icons beside them.
     Same viewBox, same 13px, same stroke as the rest. */
  const TICK = `<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="M4.8 10.4 8.2 13.8l7-7.6" stroke-linejoin="round"/></svg>`;
  const CROSS = `<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="M5.4 5.4l9.2 9.2M14.6 5.4l-9.2 9.2"/></svg>`;
  /* My starburst, not a tick: I never close a thread, I only say I did the work, and
     the two have to look different or "handled" and "agreed" become the same mark. */
  const CLAUDE_MARK = (px: number) =>
    `<svg viewBox="0 0 20 20" width="${px}" height="${px}" aria-hidden="true" class="dt-claude"><path d="M10 2.6v14.8M2.6 10h14.8M4.8 4.8l10.4 10.4M15.2 4.8L4.8 15.2"/></svg>`;

  /* Sanity's visual editing writes zero-width markers into the DOM text; they came
     along when a pin captured what it was pinned to and turned the quote into junk. */
  const clean = (v: string) => v.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "").trim();

  /* The text the pin sits on, behind an icon rather than spelled out: it is context
     for the odd "which one was this again?", not part of the conversation, and a full
     line of quoted copy competed with the comment itself.
     `data-tip`, not `title`: the native tooltip needs a second of dead-still cursor
     and never showed up on this page. A drawn one appears at once and matches the card. */
  const onIcon = (label: string) =>
    !clean(label) ? "" : `<span class="dt-note-info" data-tip="${esc(clean(label))}"
      ><svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><circle cx="10" cy="10" r="7.4"/><path d="M10 9.2v4.4M10 6.4v.6"/></svg></span>`;

  /* The whole taxonomy, spelled out: a row of five named tags. Bare colour dots were
     unreadable — nobody remembers that purple means motion — so the colour rides
     along with the word instead of standing in for it. A select would hide the set
     behind a click, and the point is to tag without thinking. */
  const cats = (active: string, id?: number) =>
    `<span class="dt-note-cats">${CATEGORIES.map((k) => `<button class="dt-cat${
      k.id === active ? " is-on" : ""}" data-act="cat" data-cat="${k.id}"${
      id ? ` data-id="${id}"` : ""} style="--cat:${k.color}">${k.label}</button>`).join("")}</span>`;

  /* Pasted screenshots. Served by /__devbar/image because feedback/ is outside
     public/ — a review screenshot has no business shipping with the build. */
  const XMARK = `<svg viewBox="0 0 20 20" width="9" height="9" aria-hidden="true"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg>`;

  /* One thumbnail with its remove badge. The badge sits inside the picture rather than
     overlapping its corner: the thread scrolls in its own box, and anything hanging
     outside a thumbnail would be clipped by that container on the first scroll. */
  const shot = (src: string, rm: string) =>
    `<span class="dt-shot"><a href="${src}" target="_blank"
      ><img src="${src}" alt="" loading="lazy" /></a
      ><button class="dt-shot-rm" data-act="unshot" ${rm} aria-label="Remove screenshot">${XMARK}</button></span>`;

  const shots = (paths: string[] = [], id?: number) =>
    !paths.length ? "" : `<div class="dt-note-shots">${paths.map((p) => {
      const name = p.split("/").pop()!;
      const src = `/__devbar/image?name=${encodeURIComponent(name)}`;
      return shot(src, `data-id="${id}" data-img="${esc(name)}"`);
    }).join("")}</div>`;

  const CLIP = `<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.4"/><path d="m3.5 14.5 4-4 3 3 2-2 4 4"/></svg>`;

  /* The box you write in: one bordered field holding the text, the screenshot waiting
     to go with it and the row of actions — Figma's composer. The input and the picture
     used to sit loose on the card, and nothing said the picture was part of what Enter
     would send. The border turns blue while you type. */
  const compose = (cls: string, placeholder: string, value: string, send: string, extra = "") =>
    `<div class="dt-note-foot"><div class="dt-compose">
      <textarea class="${cls}" rows="1" placeholder="${placeholder}">${esc(value)}</textarea>
      ${extra}
      <div class="dt-compose-bar">
        <button class="dt-attach" data-act="attach" title="Attach a screenshot \u2014 or paste or drop one">${CLIP}</button>
        <button class="dt-send${value.trim() ? " is-ready" : ""}" ${send} title="Send (Enter)"
          ><svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9"/></svg></button>
      </div>
    </div></div>`;

  /* What the pin is attached to, in the same words the hover highlight uses. */
  const elName = (tag?: string, classes?: string[]) =>
    (tag || "element") + (classes?.[0] ? "." + classes[0] : "");

  /* "img · resolved by claude" spent most of the bar on a word you read once. The mark
     says it in the same ringed 22px circle as the tick beside it, and matches the pin
     on the page. Only for my state: once you close a thread the tick next to it is
     already green and filled, and two marks for one fact is one too many. */
  /* A button, not a badge: clicking it clears my mark and puts the thread back to
     open — the way to say "no, this is not done". `reopen` is the same action the
     tick uses on a closed thread, so the store needs nothing new. */
  const stateMark = (st: string, id: number) =>
    st !== "claude" ? "" : `<button class="dt-note-state" data-act="reopen" data-id="${id}"
      title="Resolved by Claude \u2014 click to clear">${CLAUDE_MARK(13)}</button>`;

  const esc = (v: string) =>
    v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

  /* The badge answers "is there anything for me here" from the toolbar alone, so it is
     drawn whether or not comment mode is on — it used to sit past the early return
     below and only ever updated while the mode was already open, which is exactly when
     you can see the pins anyway. A number while threads are open, my mark when all that
     is left is my own fixes to be checked, a tick when the page is signed off. */
  const renderBadge = (bp: string) => {
    const mine = notes.filter((c) => bandOfNote(c) === bp);
    const open = mine.filter((c) => stateOf(c) === "open").length;
    const claude = mine.filter((c) => stateOf(c) === "claude").length;
    notesCount.innerHTML = open ? String(open) : claude ? CLAUDE_MARK(9) : "\u2713";
    notesCount.dataset.state = open ? "open" : claude ? "claude" : "done";
    notesCount.hidden = mine.length === 0;
  };

  const renderNotes = () => {
    keepDraft();
    syncBpButtons();
    if (openId !== replyFor) { replyDraft = ""; replyFor = openId; }
    const bp0 = activeBp();
    renderBadge(bp0);
    if (!notesOn) { notesOverlay.innerHTML = ""; return; }
    const bp = bp0;
    let html = "";
    const visible = notes.filter(
      (n) => bandOfNote(n) === bp && (showResolved || stateOf(n) !== "done"));
    for (const c of visible) {
      const a = anchorOf(c);
      /* No anchor means the element is gone or hidden — a pin at 0,0 would lie about
         where it was. The thread itself must still be reachable, though: without this
         the panel row was a dead click, with no way to read, answer or delete it. */
      if (!a && openId !== c.id) continue;
      const st = stateOf(c);
      const done = st === "done";
      const orphan = !a;
      const at = a ?? { x: 0, y: 0 };
      /* No number in the pin: ids run into three digits and stopped fitting the dot.
         The id lives in the panel row instead, Figma-style — open is a plain marker
         on the page, resolved is a tick, and hovering names the thread. */
      const cat = categoryOf(c.category);
      if (!orphan) {
        /* Three marks, one glance: a bare dot is open, a tick is resolved by you, and
           my starburst is resolved by me — closed, but by the one of us you may still
           want to check, which is why it is the only resolved mark that is not dimmed. */
        html += `<button class="dt-pin dt-pin--${st}" data-id="${c.id}"
          style="left:${at.x}px;top:${at.y}px;--cat:${cat.color}"
          title="${esc(c.text.slice(0, 80))} \u00b7 ${cat.label}${
            st === "claude" ? " \u00b7 resolved by Claude \u2014 tick to confirm" : st === "done" ? " \u00b7 resolved" : ""}">${
            st === "done" ? "\u2713" : st === "claude" ? CLAUDE_MARK(11) : ""}</button>`;
      }
      if (openId === c.id) {
        type Msg = { author: string; text: string; at?: string | null };
        const thread: Msg[] = [
          { author: "you", text: c.text, at: c.createdAt },
          ...(c.note ? [{ author: "claude", text: c.note, at: c.updatedAt }] : []),
          ...(c.replies ?? []),
        ];
        html += `<div class="dt-note${orphan ? " dt-note--orphan" : ""}" data-id="${c.id}"
          style="left:${at.x}px;top:${at.y}px">
          <div class="dt-note-bar">
            <span class="dt-note-el">${esc(elName(c.tag, c.classes))}</span>
            ${onIcon(c.label)}
            <span class="dt-note-tools">
              ${stateMark(st, c.id)}
              <button data-act="${done ? "reopen" : "done"}" data-id="${c.id}"
                class="dt-note-resolve${done ? " is-on" : ""}" title="${
                  done ? "Reopen" : st === "claude" ? "Looks right \u2014 mark it resolved" : "Resolve"
                }">${TICK}</button>
              <i class="dt-note-sep"></i>
              <button data-act="rm" data-id="${c.id}" title="Delete this thread">${TRASH}</button>
              <button data-act="close" data-id="${c.id}" title="Close">${CROSS}</button>
            </span>
          </div>
          ${orphan ? `<p class="dt-note-orphan">The element this was pinned to is not on the page right now.</p>` : ""}
          ${cats(categoryOf(c.category).id, c.id)}
          <div class="dt-note-thread">
            ${thread.map((m) => `<div class="dt-msg">
              <div class="dt-msg-head"><b>${m.author === "claude" ? "Claude" : "You"}</b><time>${stamp(m.at)}</time></div>
              <p>${esc(m.text)}</p>
            </div>`).join("")}
            ${shots(c.images, c.id)}
          </div>
          ${compose("dt-note-reply-input", "Reply", replyDraft, `data-act="reply" data-id="${c.id}"`)}
        </div>`;
      }
    }
    if (draft) {
      const el = document.querySelector(draft.selector);
      const r = el?.getBoundingClientRect();
      const x = r ? r.left + r.width * draft.rx : 0;
      const y = r ? r.top + r.height * draft.ry : 0;
      html += `<span class="dt-pin dt-pin--draft" style="left:${x}px;top:${y}px;--cat:${categoryOf(draft.category).color}"></span>
        <div class="dt-note" style="left:${x}px;top:${y}px">
          <div class="dt-note-bar">
            <span class="dt-note-el">${esc(elName(draft.tag, draft.classes))}</span>
            ${onIcon(draft.label)}
            <span class="dt-note-tools"><button data-act="cancel" title="Cancel">${CROSS}</button></span>
          </div>
          ${cats(draft.category)}
          ${compose("dt-note-input", "Comment", draft.text ?? "", `data-act="save"`,
            draft.image ? `<div class="dt-note-shots">${shot(draft.image, "")}</div>` : "")}
        </div>`;
    }
    notesOverlay.innerHTML = html;
    /* A card is 288px wide and can be ~300 tall. Pinned low on a 390px preview it
       would hang off the screen with the reply box out of reach, so it flips. */
    for (const card of notesOverlay.querySelectorAll<HTMLElement>(".dt-note")) {
      const r = card.getBoundingClientRect();
      if (r.bottom > innerHeight - 8) card.dataset.flip = "1";
      if (r.right > innerWidth - 8) card.dataset.flipx = "1";
    }
    renderHistory(bp);
    for (const box of notesOverlay.querySelectorAll<HTMLTextAreaElement>(".dt-note-input, .dt-note-reply-input")) grow(box);
    const fresh = notesOverlay.querySelector<HTMLTextAreaElement>(".dt-note-input");
    if (fresh) { fresh.focus(); fresh.setSelectionRange(fresh.value.length, fresh.value.length); }
  };

  /* Repositioning moves the existing nodes instead of rewriting innerHTML. Rebuilding
     on every scroll frame churned the DOM, and — with the observer below watching the
     document — fed itself: a render mutated the page, which triggered another render. */
  const positionPins = () => {
    /* Pins and cards only. A bare `[data-id]` also caught every button inside a card —
       harmless for the static ones, but the screenshot's remove badge is absolutely
       positioned, so it took the pin's document coordinates and flew off, dragging a
       scrollbar the width of the page into the thread. */
    for (const el of notesOverlay.querySelectorAll<HTMLElement>(".dt-pin[data-id], .dt-note[data-id]")) {
      /* An orphaned card is placed by CSS precisely because it has no anchor; running
         it through the anchor check below hid the card the panel row had just opened. */
      if (el.classList.contains("dt-note--orphan")) continue;
      const c = notes.find((n) => n.id === Number(el.dataset.id));
      const a = c && anchorOf(c);
      if (!a) { el.style.visibility = "hidden"; continue; }
      el.style.visibility = "";
      el.style.left = `${a.x}px`;
      el.style.top = `${a.y}px`;
    }
  };
  /* The history is the same data as the pins, read as a list: every thread on this
     page at this breakpoint, newest last, resolved ones dimmed but still clickable —
     clicking one opens its pin, which is the only way to reach a resolved thread
     while "show resolved" is off. */
  const renderHistory = (bp: string) => {
    if (history.hidden) return;
    const mine = notes.filter((n) => bandOfNote(n) === bp);
    /* Numbered per breakpoint, not by the file's global id: "#3 on tablet" is what
       you actually say out loud, and it stays a short number on every band. Counted
       in creation order, so resolving one does not renumber the rest. */
    const seq = new Map(mine.map((n, i) => [n.id, i + 1]));
    /* Three lists, not two. Mine sit in the middle rather than last because they are
       the only resolved threads with anything left to do: read the fix, and either tick
       it — which files it under Resolved as yours — or reopen it. */
    const byState = { open: [] as Note[], claude: [] as Note[], done: [] as Note[] };
    for (const n of mine) byState[stateOf(n)].push(n);
    /* The row is a div, not a button: the delete icon is a button of its own and
       cannot be nested inside one. Clicking anywhere else still jumps to the pin. */
    const row = (c: Note) => {
      const replies = (c.replies?.length ?? 0) + (c.note ? 1 : 0);
      const cat = categoryOf(c.category);
      const st = stateOf(c);
      const byClaude = st === "claude";
      /* No anchor means the element is gone — the pin is deliberately not drawn rather
         than parked somewhere it never was, and this is where that gets said. */
      const orphan = !anchorOf(c);
      /* The newest line, not the opening one: by the time a thread has answers, what
         you need from the list is where it stands, and the first message is the part
         you already know. The stamp follows it, or the row would date the wrong line. */
      const last = c.replies?.length
        ? c.replies[c.replies.length - 1]
        : c.note
          ? { author: "claude", text: c.note }
          : { author: "you", text: c.text };
      return `<div class="dt-hist-row is-${st}${orphan ? " is-orphan" : ""}">
        <button class="dt-hist-go" data-go="${c.id}">
          <span class="dt-hist-n" style="--cat:${cat.color}">${byClaude ? CLAUDE_MARK(8) : ""}</span>
          <span class="dt-hist-body">
            <span class="dt-hist-id">#${seq.get(c.id)}<em>${cat.label}</em>${
              byClaude ? `<b class="dt-hist-claude">${CLAUDE_MARK(9)}Claude</b>` : ""}${
              orphan ? `<b class="dt-hist-orphan" title="The element this was pinned to is not on the page right now">no pin</b>` : ""}</span>
            <span class="dt-hist-text">${last.author === "claude" ? "<b>Claude:</b> " : ""}${esc(last.text)}</span>
            <span class="dt-hist-meta">${stamp(c.updatedAt || c.createdAt)}${c.device ? ` \u00b7 ${esc(c.device)}` : c.browser ? ` \u00b7 ${esc(c.browser)}` : ""}${replies
              ? ` \u00b7 ${replies} repl${replies === 1 ? "y" : "ies"}` : ""}</span>
          </span>
        </button>
        <button class="dt-hist-rm" data-rm="${c.id}" title="Delete this comment">${TRASH}</button>
      </div>`;
    };
    /* The same chips the page menu carries, for this route: which bands still hold
       something, and how much. A sentence told you they existed somewhere; a row of
       chips names the band and switches to it on click. */
    /* The head reads left to right: which band you are on, what this panel is, then —
       past a rule — the other bands that still hold something. The band you are on is a
       bare icon: it is a label, not a button, and there is nowhere to switch to. */
    const hereIcon = BREAKPOINTS.find((x) => x.id === bp);
    const others = BREAKPOINTS.map((band) => {
      const here = notes.filter((n) => bandOfNote(n) === band.id && stateOf(n) !== "done");
      return { band, open: here.filter((n) => stateOf(n) === "open").length, total: here.length };
    }).filter((x) => x.total && x.band.id !== bp);
    const bandChips = others.length
      ? `<i class="dt-hist-sep"></i><div class="dt-hist-bands">${others.map(({ band, open, total }) =>
          `<button data-bp="${band.id}" data-state="${open ? "open" : "claude"}"
            title="${band.label}: ${open} open \u00b7 ${total - open} to check"
            ><svg viewBox="0 0 20 20" width="11" height="11" aria-hidden="true">${band.icon}</svg><i>${total}</i></button>`
        ).join("")}</div>`
      : "";
    const GROUPS = ["open", "claude", "done"] as const;
    /* The eye hides threads you have already signed off, not mine: mine are the queue
       it exists to keep you from losing. */
    const shown = GROUPS.filter((k) => byState[k].length && (k !== "done" || showResolved));
    history.innerHTML =
      `<div class="dt-hist-head">
         <span class="dt-hist-here" title="${hereIcon?.label ?? bp}"
           ><svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true">${hereIcon?.icon ?? ""}</svg></span>
         <span class="dt-hist-title">Comments</span>
         ${bandChips}
         <button class="dt-hist-refresh" data-refresh aria-label="Reload comments from the file">
           <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16.3 3.4v3.4h-3.4"/></svg>
         </button>
         <button class="dt-hist-fold" data-fold aria-label="Collapse or expand the panel">
           <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="M5.5 8.5 10 12.5l4.5-4"/></svg>
         </button>
       </div>` +
      (shown.length
        ? `<div class="dt-hist-list">${shown.map((k) =>
            `<p class="dt-hist-group">${STATE_LABEL[k]}<em>${byState[k].length}</em></p>` +
            byState[k].map(row).join("")).join("")}</div>`
        : `<p class="dt-hist-empty">${byState.done.length
            ? "Everything here is resolved."
            : "No comments at this breakpoint yet. Click anything on the page to leave one."}</p>`);
  };

  /* Collapsed keeps the head — the band it is filtered to and the way back — rather
     than hiding outright: the toolbar button already does "gone". It is a gesture for
     the moment you need the page clear, not a setting: it was remembered, so a panel
     collapsed once opened collapsed ever after, which reads as a panel that is broken. */
  const setFold = (on: boolean) => history.toggleAttribute("data-collapsed", on);

  history.addEventListener("click", async (e) => {
    const refresh = (e.target as Element).closest<HTMLElement>("[data-refresh]");
    if (refresh) {
      /* The list is a file, and I edit it from the terminal — this is how those edits
         arrive without losing the page's scroll position to a reload. The spin runs
         even when nothing changed, or a click that finds no news looks broken. */
      refresh.dataset.spin = "1";
      await syncNotes();
      setTimeout(() => delete refresh.dataset.spin, 500);
      return;
    }
    /* Collapsed, the whole head opens it: the chevron is a 13px target, and the thing
       you press is "the panel". Expanded, only the chevron closes it — the head carries
       the band buttons. */
    if (history.hasAttribute("data-collapsed") && (e.target as Element).closest(".dt-hist-head")) {
      setFold(false);
      return;
    }
    if ((e.target as Element).closest("[data-fold]")) {
      setFold(!history.hasAttribute("data-collapsed"));
      return;
    }
    const band = (e.target as Element).closest<HTMLButtonElement>(".dt-hist-bands [data-bp]");
    if (band) { pickBp(band.dataset.bp!); return; }
    const kill = (e.target as Element).closest<HTMLButtonElement>("[data-rm]");
    if (kill) {
      await fetch(`/__devbar/comments?id=${kill.dataset.rm}`, { method: "DELETE" });
      openId = null;
      await syncNotes();
      return;
    }
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-go]");
    if (!btn) return;
    const id = Number(btn.dataset.go);
    /* In a canvas the page you are looking at is the iframe's, and this panel belongs
       to the document behind it — opening the thread here scrolled a page nobody could
       see. Hand the job to the copy that owns the pins. */
    if (!frame.hidden) { tellFrame({ open: id }); return; }
    goTo(id);
  });

  /* Open a thread and put its element on screen. Runs in whichever copy owns the pins:
     the page itself, or the canvas when one is open. */
  const goTo = (id: number) => {
    openId = id;
    draft = null;
    renderNotes();
    const c = notes.find((n) => n.id === id);
    /* Centre the pin, not the element it hangs on. `scrollIntoView` centres the whole
       box, and a section 5000px tall then leaves its pin far above the fold — which is
       exactly the case you hit, since most pins sit on sections. */
    const a = c && anchorOf(c);
    if (a) scrollTo({ top: scrollY + a.y - innerHeight / 2, behavior: "smooth" });
    else if (c) resolveEl(c)?.scrollIntoView({ block: "center", behavior: "smooth" });
    notesOverlay.querySelector<HTMLElement>(`.dt-pin[data-id="${id}"]`)
      ?.animate([{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(1)" }], 400);
  };

  const setHistory = (on: boolean) => {
    history.hidden = !on;
    historyBtn.setAttribute("aria-pressed", String(on));
    persist("dt-history", on ? "1" : "0");
    renderNotes();
  };
  const resolvedBtn = document.querySelector<HTMLButtonElement>(".dt-resolved-btn")!;
  const setResolved = (on: boolean) => {
    showResolved = on;
    resolvedBtn.setAttribute("aria-pressed", String(on));
    persist("dt-resolved", on ? "1" : "0");
    tellFrame({ resolved: on }); // the canvas draws its own pins
    renderNotes();
    loadAllNotes(); // the eye hides resolved threads in the page menu too
  };
  resolvedBtn.addEventListener("click", () => setResolved(!showResolved));
  resolvedBtn.setAttribute("aria-pressed", String(showResolved));

  historyBtn.addEventListener("click", () => {
    const open = history.hidden === true;
    // opening the list is also the plainest way into comment mode
    if (open && !notesOn) setNotes(true);
    if (open) setFold(false); // asking for the panel means asking to read it
    setHistory(open);
  });

  const reposition = () => {
    if (notesRaf || !notesOn) return;
    notesRaf = requestAnimationFrame(() => { notesRaf = 0; positionPins(); });
  };

  /* Pins follow their element through anything that moves it: a font landing, an
     image loading, HMR swapping a section, Sanity editing text in place. Ignores its
     own overlay, or writing pins would loop. */
  const watcher = new MutationObserver((records) => {
    if (records.every((r) => (r.target as Element).closest?.(".dt-notes-overlay"))) return;
    reposition();
  });
  const sizer = new ResizeObserver(() => reposition());

  /* The menu counts every page, not this one, so it needs the whole file. Three numbers:
     what nobody has looked at, what I closed and you have not checked, and what is
     signed off. Resolved used to be dropped here, which read as "no comments on this
     page" on twenty pages that in fact carry the whole history — so it rides along under
     the same eye the panel uses, in a quieter green: done is context, not a to-do. */
  const paintPageCounts = (all: Note[]) => {
    type Count = { open: number; claude: number; done: number };
    const zero = (): Count => ({ open: 0, claude: 0, done: 0 });
    const tally: Record<string, Count & { bands: Record<string, Count> }> = {};
    for (const c of all) {
      const st = stateOf(c);
      const t = (tally[c.route ?? ""] ??= { ...zero(), bands: {} });
      t[st]++;
      const bp = bandOfNote(c);
      (t.bands[bp] ??= zero())[st]++;
    }
    /* Every state gets its own chip — one chip for all three hid the only one that is
       work: a band with one open thread and nine I had closed read as a blue ten. What
       the eye is hiding does not count anywhere in here, so a page whose threads are all
       resolved goes back to reading as empty the moment you switch it off. */
    const STATES = ["open", "claude", "done"] as const;
    const STATE_TITLE = {
      open: "open", claude: "resolved by Claude, to check", done: "resolved",
    } as const;
    const countsOf = (c: Count) =>
      STATES.map((k) => [k, k === "done" && !showResolved ? 0 : c[k]] as const);
    const shownOf = (c: Count) => countsOf(c).reduce((n, [, v]) => n + v, 0);
    for (const link of document.querySelectorAll<HTMLAnchorElement>(".dt-pages a")) {
      const n = link.querySelector<HTMLElement>(".dt-pages-n");
      if (!n) continue;
      const t = tally[new URL(link.href).pathname.replace(/\/+$/, "") || "/"];
      for (const bp of BREAKPOINTS) {
        const band = t?.bands[bp.id];
        for (const [k, v] of countsOf(band ?? zero())) {
          const chip = n.querySelector<HTMLElement>(`[data-bp="${bp.id}"][data-state="${k}"]`)!;
          chip.hidden = !v;
          if (!v) continue;
          chip.querySelector("i")!.textContent = String(v);
          chip.title = `${bp.label}: ${v} ${STATE_TITLE[k]}`;
        }
      }
      const total = t ? shownOf(t) : 0;
      n.hidden = !total;
      /* Which band they are on, or a page counting three shows an empty screen when
         all three were written on a phone. */
      const bands = t
        ? BREAKPOINTS.filter((x) => t.bands[x.id] && shownOf(t.bands[x.id]))
            .map((x) => `${x.label} ${shownOf(t.bands[x.id])}`).join(" \u00b7 ")
        : "";
      n.title = total
        ? `${t.open} open \u00b7 ${t.claude} resolved by Claude, to check` +
          ` \u00b7 ${t.done} resolved\n${bands}`
        : "";
    }
  };

  const loadAllNotes = async () => {
    try {
      paintPageCounts((await (await fetch("/__devbar/comments")).json()).comments ?? []);
    } catch { /* the menu simply shows no counts */ }
  };

  const loadNotes = async () => {
    try {
      const res = await fetch(`/__devbar/comments?route=${encodeURIComponent(ROUTE)}`);
      notes = (await res.json()).comments ?? [];
    } catch { notes = []; }
    renderNotes();
  };

  /* Outline whatever the click would attach to, so the target is never a surprise —
     the same idea as Agentation's picker. */
  let hiRaf = 0;
  const onNoteHover = (e: MouseEvent) => {
    if (hiRaf) return;
    hiRaf = requestAnimationFrame(() => {
      hiRaf = 0;
      const t = e.target as Element;
      if (draft || t.closest(NOT_PINNABLE)) {
        hi.hidden = true;
        return;
      }
      hi.hidden = true;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      hi.hidden = false;
      if (!el) return;
      const r = el.getBoundingClientRect();
      hiBox.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
      hiTag.textContent =
        el.tagName.toLowerCase() +
        ([...el.classList].find((k) => !/^(astro|svelte)-/.test(k)) ? "." + [...el.classList].find((k) => !/^(astro|svelte)-/.test(k)) : "") +
        `  ${Math.round(r.width)}×${Math.round(r.height)}`;
      hiTag.style.cssText = `left:${r.left}px;top:${Math.max(2, r.top - 20)}px`;
    });
  };

  /* Escape backs out one step at a time: the note you are writing, then the thread you
     opened, then the mode itself. Pressing it with nothing open means "I am done here",
     which was the one step you could only reach by going back to the toolbar. */
  const onNoteKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.isComposing) return;
    e.preventDefault();
    if (draft) { draft = null; renderNotes(); return; }
    if (openId !== null) { openId = null; renderNotes(); return; }
    setNotes(false);
  };

  /* Capture phase: in comment mode a click is a pin, never a navigation. */
  const onNoteClick = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t.closest(NOT_PINNABLE)) return;
    e.preventDefault();
    e.stopPropagation();
    if (swallowClick) { swallowClick = false; return; }
    notesOverlay.hidden = true;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    notesOverlay.hidden = false;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const classes = [...el.classList].filter((k) => !/^(astro|svelte|css)-/.test(k)).slice(0, 2);
    draft = {
      selector: cssPath(el),
      tag,
      classes,
      // where it sat among its lookalikes: the last resort when the path breaks and
      // the element carries no text to recognise it by
      nth: poolOf({ tag, classes }).indexOf(el),
      rx: r.width ? (e.clientX - r.left) / r.width : 0.5,
      ry: r.height ? (e.clientY - r.top) / r.height : 0.5,
      label: clean(el.textContent || "").slice(0, 60),
      category: CATEGORIES[0].id,
    };
    openId = null;
    hi.hidden = true;
    renderNotes();
  };

  /* A retina screenshot of a full page is 8-20 MB of PNG, and the old 5 MB ceiling
     dropped it without a word — the "big screenshots do not upload" bug. Anything past
     2200px on its long side is re-encoded as JPEG first, which lands a full-page shot
     around 300-600 KB. Small ones keep their lossless PNG, because a 300px crop of a
     button is exactly where JPEG artefacts would matter. */
  const MAX_SIDE = 2200;
  const KEEP_PNG = 900 * 1024;
  const MAX_SHOT = 8 * 1024 * 1024; // after shrinking; a body this big means something is wrong

  const toast = (msg: string) => {
    const el = document.createElement("div");
    el.className = "dt-toast";
    el.textContent = msg;
    document.body.append(el);
    setTimeout(() => el.remove(), 2800);
  };

  const readDataUrl = (file: Blob) =>
    new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });

  const shrink = async (file: File) => {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size <= KEEP_PNG) { bmp.close(); return readDataUrl(file); }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return c.toDataURL("image/jpeg", 0.85);
  };

  /* A screenshot for a comment — pasted, dropped on the card or picked with the clip
     button. A draft holds its image until the comment it belongs to exists; an open
     thread files it at once. */
  const attachImage = async (file: File, card: Element | null) => {
    let dataUrl: string;
    try {
      dataUrl = await shrink(file);
    } catch {
      toast("That image could not be read.");
      return;
    }
    if (dataUrl.length > MAX_SHOT) { toast("Screenshot is too large even after shrinking."); return; }
    const id = Number((card as HTMLElement | null)?.dataset.id);
    if (!id) { if (draft) { draft.image = dataUrl; renderNotes(); } return; }
    const res = await fetch("/__devbar/comments", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, image: dataUrl }),
    });
    if (!res.ok) { toast(`Screenshot was not saved (${res.status}).`); return; }
    await syncNotes();
  };
  const imageIn = (items?: DataTransferItemList | null) =>
    [...(items ?? [])].find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();

  /* Delegated because the textareas are rebuilt on every render, so a listener bound to
     one would not survive the first keystroke. */
  notesOverlay.addEventListener("paste", (e) => {
    const file = imageIn((e as ClipboardEvent).clipboardData?.items);
    if (!file) return; // plain text paste: leave it to the textarea
    e.preventDefault();
    attachImage(file, (e.target as Element).closest(".dt-note"));
  });
  notesOverlay.addEventListener("dragover", (e) => {
    if (!(e.target as Element).closest(".dt-note")) return;
    e.preventDefault(); // without this the browser opens the file instead
    (e.target as Element).closest(".dt-note")!.querySelector(".dt-compose")?.setAttribute("data-drop", "");
  });
  notesOverlay.addEventListener("dragleave", (e) => {
    (e.target as Element).closest(".dt-note")?.querySelector(".dt-compose")?.removeAttribute("data-drop");
  });
  notesOverlay.addEventListener("drop", (e) => {
    const card = (e.target as Element).closest(".dt-note");
    if (!card) return;
    e.preventDefault();
    card.querySelector(".dt-compose")?.removeAttribute("data-drop");
    const file = imageIn(e.dataTransfer?.items);
    if (file) attachImage(file, card);
  });

  /* The box takes the height of its text instead of scrolling inside itself — the card
     grows with what you write, the way Figma's does. `auto` first, or scrollHeight only
     ever reports the tallest the box has been. */
  const grow = (box: HTMLTextAreaElement) => {
    /* Measured with the bar off. `height: auto` drops the box to its min-height for the
       instant it takes to read scrollHeight — reading it forces a synchronous layout —
       and with overflow on `auto` the browser paints a scrollbar in that instant. */
    box.style.overflowY = "hidden";
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
    // a bar only once the 50vh cap actually clips the text
    box.style.overflowY = box.scrollHeight > box.clientHeight ? "auto" : "hidden";
  };
  notesOverlay.addEventListener("input", (e) => {
    const box = (e.target as Element).closest<HTMLTextAreaElement>(".dt-note-input, .dt-note-reply-input");
    if (!box) return;
    if (box.classList.contains("dt-note-input")) { if (draft) draft.text = box.value; }
    else replyDraft = box.value;
    keepDraft();
    /* Blue the moment there is something to send, grey while the box is empty — the
       one place the card says whether Enter will do anything. */
    box.closest(".dt-note")?.querySelector(".dt-send")
      ?.classList.toggle("is-ready", box.value.trim() !== "");
    grow(box);
  });

  /* Enter sends, Shift+Enter breaks a line, Esc backs out — delegated, because the
     textareas are rebuilt on every render. The send buttons promised ⌘Enter and nothing
     ever listened for it; a comment is one line more often than not, so plain Enter is
     the key that belongs here. */
  notesOverlay.addEventListener("keydown", (e) => {
    const box = (e.target as Element).closest<HTMLTextAreaElement>(".dt-note-input, .dt-note-reply-input");
    if (!box) return;
    // isComposing: mid-IME Enter picks a candidate, it does not end the sentence
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    box.closest(".dt-note")?.querySelector<HTMLButtonElement>(".dt-send")?.click();
  });

  notesOverlay.addEventListener("click", async (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("button");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = Number(btn.dataset.id);
    if (!act) { openId = openId === id ? null : id; draft = null; renderNotes(); return; }
    if (act === "attach") {
      // a throwaway input: the file picker is the only native way to a file
      const pick = Object.assign(document.createElement("input"), { type: "file", accept: "image/*" });
      const card = btn.closest(".dt-note");
      pick.addEventListener("change", () => { if (pick.files?.[0]) attachImage(pick.files[0], card); });
      pick.click();
      return;
    }
    /* On a draft nothing has been written yet, so the × is a local undo; on a saved
       thread it deletes the file too, through detach() in the store. */
    if (act === "unshot") {
      if (!id) { if (draft) { delete draft.image; renderNotes(); } return; }
      await fetch("/__devbar/comments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, removeImage: btn.dataset.img }),
      });
      await syncNotes();
      return;
    }
    if (act === "cancel") { draft = null; renderNotes(); return; }
    if (act === "close") { openId = null; renderNotes(); return; }
    /* On a draft the tag is not written anywhere yet, so it is a local edit; on a
       saved thread it is a patch like any other. */
    if (act === "cat") {
      const cat = btn.dataset.cat!;
      if (!id) { if (draft) draft.category = cat; renderNotes(); return; }
      await fetch("/__devbar/comments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, category: cat }),
      });
      await syncNotes();
      return;
    }
    if (act === "save") {
      const text = notesOverlay.querySelector<HTMLTextAreaElement>(".dt-note-input")!.value.trim();
      if (!text || !draft) { draft = null; renderNotes(); return; }
      await fetch("/__devbar/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft, route: ROUTE, text,
          breakpoint: currentBp(),
          browser: browserTag(),
          device: inFrame ? deviceLabel : "",
          viewport: { w: innerWidth, h: innerHeight },
        }),
      });
      draft = null;
      await syncNotes();
      return;
    }
    if (act === "reply") {
      const box = notesOverlay.querySelector<HTMLTextAreaElement>(".dt-note-reply-input")!;
      const text = box.value.trim();
      if (!text) { box.focus(); return; }
      replyDraft = "";
      await fetch("/__devbar/comments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, reply: text }),
      });
      await syncNotes();
      return;
    }
    if (act === "rm") {
      await fetch(`/__devbar/comments?id=${id}`, { method: "DELETE" });
    } else {
      await fetch("/__devbar/comments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(act === "done"
          ? { id, status: "done", doneBy: "you" }
          : { id, status: "open", doneBy: null }),
      });
    }
    openId = null;
    await syncNotes();
  });

  /* The canvas is a second copy of the bar and has no toolbar of its own: every mode
     it is in, it was told. */
  let frameScrollbar: "overlay" | "classic" = "overlay";
  /* Which device the canvas stands for, filed with every comment written in it: the
     band says "portrait", this says "iPhone SE with the bars shown". */
  let frameDevice = "";
  let deviceLabel = ""; // in the copy: what the page last said
  const tellFrame = (msg: Record<string, unknown>) => {
    if (!frame.hidden) frameEl.contentWindow?.postMessage({ dt: true, ...msg }, location.origin);
  };
  /* The copy says `hello` once its listener is up and is answered with the whole state.
     Answering the iframe's `load` instead raced the copy's own start-up — it fetches
     its config first — and on a light page `load` won: the message went nowhere, the
     copy fell back to the modes in storage, and a device preview came up in comment
     mode, turning every click on the page into a pin. */
  const frameState = () =>
    ({ notes: notesOn, grid: !overlay.hidden, inspect, resolved: showResolved, scrollbar: frameScrollbar, device: frameDevice });
  addEventListener("message", (e) => {
    if (e.origin !== location.origin || !(e.data as any)?.dt) return;
    const m = e.data as {
      hello?: boolean; notes?: boolean; reload?: boolean; grid?: boolean;
      inspect?: Inspector; open?: number; resolved?: boolean; scrollbar?: string; device?: string;
    };
    if (inFrame && typeof m.device === "string") deviceLabel = m.device;
    // Windows draws a scrollbar that takes width; the copy shows one when told to
    if (inFrame && m.scrollbar) document.documentElement.classList.toggle("dt-sb-classic", m.scrollbar === "classic");
    if (m.hello && e.source === frameEl.contentWindow) { tellFrame(frameState()); return; }
    // applied without echo, or the page's own state would bounce straight back to it
    if (typeof m.notes === "boolean" && m.notes !== notesOn) setNotes(m.notes, false);
    if (typeof m.open === "number") goTo(m.open);
    if (typeof m.grid === "boolean" && m.grid === overlay.hidden) setGrid(m.grid);
    if (typeof m.inspect === "string" && m.inspect !== inspect) setInspect(m.inspect);
    if (typeof m.resolved === "boolean" && m.resolved !== showResolved) setResolved(m.resolved);
    if (m.reload) { loadNotes(); loadAllNotes(); }
  });

  /* Re-read the file and tell the other document to do the same — the canvas is a
     second copy of this component, each holding its own copy of the list. Without it
     the outer panel kept showing a thread you had just resolved inside the canvas, and
     no amount of switching bands cleared it: re-rendering is not re-reading. Runs after
     every write, and on demand from the refresh button. The reply never bounces back,
     so no loop. */
  const syncNotes = async () => {
    await loadNotes();
    loadAllNotes();
    tellFrame({ reload: true });
    if (inFrame) parent.postMessage({ dt: true, reload: true }, location.origin);
  };

  /* `echo`: tell the page when the copy in the canvas turns the mode on or off itself
     (Escape in there), but not when it is only doing what the page said. */
  const setNotes = (on: boolean, echo = true) => {
    notesOn = on;
    notesBtn.setAttribute("aria-pressed", String(on));
    /* The panel is the point of the mode, so it comes with it unless you closed it. */
    if (!on) { history.hidden = true; historyBtn.setAttribute("aria-pressed", "false"); }
    else if (!inFrame && history.hidden && localStorage.getItem("dt-history") !== "0") {
      history.hidden = false;
      historyBtn.setAttribute("aria-pressed", "true");
    }
    persist(NOTES_KEY, on ? "1" : "0");
    tellFrame({ notes: on });
    if (inFrame && echo) parent.postMessage({ dt: true, notes: on }, location.origin);
    notesOverlay.hidden = !on || !frame.hidden;
    document.documentElement.classList.toggle("dt-noting", on);
    if (on) {
      setInspect("");
      document.addEventListener("click", onNoteClick, true);
      document.addEventListener("keydown", onNoteKey);
      document.addEventListener("mousemove", onNoteHover);
      addEventListener("scroll", reposition, true);
      addEventListener("resize", reposition);
      watcher.observe(document.body, { childList: true, subtree: true, characterData: true });
      sizer.observe(document.body);
      loadNotes();
    } else {
      draft = null;
      openId = null;
      /* The canvas stays where it is: picking an inspector turns comment mode off, and
         sending the window back to desktop here tore the canvas down under it. */
      document.removeEventListener("click", onNoteClick, true);
      document.removeEventListener("keydown", onNoteKey);
      document.removeEventListener("mousemove", onNoteHover);
      hi.hidden = true;
      removeEventListener("scroll", reposition, true);
      removeEventListener("resize", reposition);
      watcher.disconnect();
      sizer.disconnect();
      notesOverlay.innerHTML = "";
    }
  };
  /* ---------------------------------------------------------------------------
     Two separate things, Webflow-style:

       Breakpoint  — a working canvas you resize freely inside a band. Comments are
                     written here and belong to whichever band the width falls in.
       Device      — a viewing shelf. Fixed real device width in a real shell,
                     comments switched off; it is for looking, not for working.
     --------------------------------------------------------------------------- */
  const W_KEY = "dt-w";
  const CANVAS_KEY = "dt-canvas";
  const DEVICE_KEY = "dt-device";

  let canvasOn = localStorage.getItem(CANVAS_KEY) === "1";
  let deviceId = localStorage.getItem(DEVICE_KEY) || "";
  // a device the shelf no longer has (renamed, or dropped from the config) is no device
  if (deviceId && !deviceById(deviceId)) { deviceId = ""; localStorage.setItem(DEVICE_KEY, ""); }
  let frameW = Number(localStorage.getItem(W_KEY)) || 0;
  /* A DevTools device: the canvas at that device's exact size, turned or not. It is the
     working canvas all the same — comments on, filed under the band the width is in. */
  const EMU_KEY = "dt-emu";
  type Emu = { id: string; turned: boolean };
  let emu: Emu | null = (() => {
    try { return JSON.parse(localStorage.getItem(EMU_KEY) || "null"); } catch { return null; }
  })();
  const emuDevice = () => (emu ? DEVTOOLS_DEVICES.find((d) => d.id === emu!.id) ?? null : null);
  const emuSize = () => {
    const d = emuDevice();
    return d ? (emu!.turned ? { w: d.h, h: d.w } : { w: d.w, h: d.h }) : null;
  };
  /* The preview's browser bars: shown, the way a page first loads, or folded, the way
     they are once you scroll. A switch rather than following the scroll: folding them
     resizes the iframe, and every vh inside would jump — which Safari's never do. */
  let barsMin = localStorage.getItem("dt-bars-min") === "1";
  const setEmu = (next: Emu | null) => {
    emu = next;
    persist(EMU_KEY, next ? JSON.stringify(next) : "");
  };

  const setBadge = (text: string) => {
    sizeBadge.textContent = text;
    // the rotate button sits just right of the badge, whatever its length
    frame.style.setProperty("--dt-badge-w", `${sizeBadge.offsetWidth}px`);
  };

  /* Ruler across the top of the canvas: a tick every 50px, a number every 200, and
     a marked line at each band edge — the widths where the layout actually flips. */
  const renderRuler = (w: number) => {
    if (!w) { ruler.innerHTML = ""; return; }
    let html = "";
    for (let x = 0; x <= w; x += 50) {
      html += `<span class="dt-tick${x % 200 === 0 ? " is-major" : ""}" style="left:${x}px"></span>`;
    }
    for (const b of BREAKPOINTS) {
      for (const edge of [b.min, b.max]) {
        if (edge > 0 && Number.isFinite(edge) && edge <= w) {
          html += `<span class="dt-edge" style="left:${edge}px" title="${b.label} edge"></span>`;
        }
      }
    }
    ruler.innerHTML = html;
    ruler.style.width = `${w}px`;
  };

  /* The shell is scaled so its screen hole is exactly the device's CSS width; the
     whole thing is then scaled again if the window is too small to hold it. */
  const fitCanvas = () => {
    const w = parseFloat(device.style.width) || 0;
    const h = parseFloat(device.style.height) || 0;
    if (!w || !h) { device.style.transform = ""; delete device.dataset.scaled; return; }
    /* The canvas is already sized to the window's height, so only its width can
       overflow; a device shell can overflow either way. Scaling the canvas on height
       would shrink it for no reason and make the ruler lie. */
    const k = deviceId || emu
      ? Math.min(1, (innerWidth - 80) / w, (innerHeight - 120) / h)
      : Math.min(1, (innerWidth - 80) / w);
    device.style.transform = k < 1 ? `scale(${k})` : "";
    device.dataset.scaled = k < 1 ? String(Math.round(k * 100)) : "";
  };

  /* The Dynamic Island where Chrome DevTools puts it for a phone of this size. */
  const cutoutOf = (d: { w: number; h: number }) =>
    DEVTOOLS_DEVICES.find((x) => x.w === d.w && x.h === d.h && x.cutout)?.cutout;
  const frameDoc = () => { try { return frameEl.contentDocument; } catch { return null; } };
  const frameTitle = () => frameDoc()?.title.split("\u2014").pop()?.trim() || "";

  /* The bars take their colour from the page, the way the real browser does: Safari
     from the edges of the page, Chrome on Android from theme-color. Re-read on load
     and while the page scrolls, since a sticky header can change it. */
  const tintChrome = () => {
    const doc = frameDoc();
    const dev = deviceId ? deviceById(deviceId) : null;
    if (!doc?.body || !dev) return;
    const t = pageTints(doc);
    const top = dev.browser === "chrome-android" ? t.theme || "rgb(255, 255, 255)" : t.top;
    const bottom = dev.browser === "chrome-android" ? "rgb(255, 255, 255)" : t.bottom;
    device.style.setProperty("--dt-top", top);
    device.style.setProperty("--dt-top-ink", inkFor(top));
    device.style.setProperty("--dt-bottom", bottom);
    device.style.setProperty("--dt-bottom-ink", inkFor(bottom));
    const tab = chromeTop.querySelector(".dt-win-tab > span");
    if (tab) tab.textContent = frameTitle() || location.host;
  };
  let tintRaf = 0;
  frameEl.addEventListener("load", () => {
    if (!frameDoc()) return; // another site: nothing of it is ours to read
    tintChrome();
    frameEl.contentWindow?.addEventListener("scroll", () => {
      if (tintRaf) return;
      tintRaf = requestAnimationFrame(() => { tintRaf = 0; tintChrome(); });
    }, { passive: true });
  });
  /* The drawn back, forward and reload work on the page in the frame — through the
     frame's own Navigation API: history.back() walks the tab's joint history and could
     take the page you are reviewing back instead. A page from another site cannot be
     reached at all, so there reload means "back to this site". */
  type FrameNav = { canGoBack: boolean; canGoForward: boolean; back(): void; forward(): void; reload(): void };
  for (const bar of [chromeTop, chromeBottom]) {
    bar.addEventListener("click", (e) => {
      const nav = (e.target as Element).closest<HTMLElement>("[data-nav]")?.dataset.nav;
      if (!nav) return;
      try {
        const n = (frameEl.contentWindow as unknown as { navigation?: FrameNav })?.navigation;
        if (!frameDoc() || !n) throw new Error("foreign");
        if (nav === "back") { if (n.canGoBack) n.back(); }
        else if (nav === "fwd") { if (n.canGoForward) n.forward(); }
        else n.reload();
      } catch {
        if (nav === "reload" || nav === "back") frameEl.src = location.href;
      }
    });
  }
  barsBtn.addEventListener("click", () => {
    barsMin = !barsMin;
    persist("dt-bars-min", barsMin ? "1" : "0");
    applyCanvas();
  });

  const applyCanvas = () => {
    if (inFrame) return;
    const dev = deviceId ? deviceById(deviceId) ?? null : null;
    if (deviceId && !dev) { deviceId = ""; localStorage.setItem(DEVICE_KEY, ""); }

    if (!dev && !canvasOn) {
      frame.hidden = true;
      frameEl.removeAttribute("src");
      document.documentElement.classList.remove("dt-framing");
      notesOverlay.hidden = !notesOn;
      ruler.innerHTML = "";
      syncBpButtons();
      /* Coming back to Desktop leaves through this branch. It used to stop at the
         button pills, so the panel kept the band you had just left — the half of
         "switching back and forth does nothing" that the bottom of this function
         never saw. */
      rotateBtn.hidden = true;
      barsBtn.hidden = true;
      syncDeviceMenu();
      if (notesOn) loadNotes(); else renderNotes();
      return;
    }

    frame.hidden = false;
    document.documentElement.classList.add("dt-framing");
    notesOverlay.hidden = true; // the canvas owns its own pins
    if (!frameEl.src) frameEl.src = location.href;

    if (dev) {
      const look = drawDevice(dev, { host: location.host, title: frameTitle(), now: new Date(), min: barsMin, cutout: cutoutOf(dev) });
      const { screen } = look;
      frame.dataset.mode = "device";
      device.dataset.shell = dev.shell;
      device.dataset.browser = dev.browser;
      device.style.width = `${look.footprint.w}px`;
      device.style.height = `${look.footprint.h}px`;
      device.style.setProperty("--dt-r", `${screen.r}px`);
      device.style.setProperty("--dt-rb", `${screen.rb}px`);
      shellEl.innerHTML = look.shell;
      const place = (el: HTMLElement, y: number, h: number, html: string) => {
        el.innerHTML = html;
        el.style.cssText = `left:${screen.x}px;top:${y}px;width:${screen.w}px;height:${h}px`;
      };
      place(chromeTop, screen.y, look.topH, look.top);
      place(chromeBottom, screen.y + screen.h - look.bottomH, look.bottomH, look.bottom);
      const pageH = screen.h - look.topH - look.bottomH;
      frameEl.style.position = "absolute";
      frameEl.style.left = `${screen.x}px`;
      frameEl.style.top = `${screen.y + look.topH}px`;
      frameEl.style.width = `${screen.w}px`;
      frameEl.style.height = `${pageH}px`;
      ruler.innerHTML = "";
      const folded = barsMin && look.canMinimize;
      frameScrollbar = look.scrollbar;
      frameDevice = `${dev.label}${folded ? " \u00b7 bars folded" : ""}`;
      bpFilter = bpOf(dev.w);
      tellFrame({ notes: notesOn, scrollbar: frameScrollbar, device: frameDevice });
      barsBtn.hidden = !look.canMinimize;
      barsBtn.setAttribute("aria-pressed", String(folded));
      /* The page gets what the browser leaves of the screen. Said out loud, because inside
         an iframe every vh unit is that height — on the phone, 100vh is the taller one. */
      setBadge(`${dev.label} \u00b7 page ${dev.w}\u00d7${pageH} of ${dev.w}\u00d7${dev.h}${folded ? " \u00b7 bars folded" : ""} \u00b7 ${BREAKPOINTS.find((b) => b.id === bpFilter)?.label ?? ""}`);
      tintChrome();
    } else {
      const size = emuSize();
      if (!size) setEmu(null); // a device Chrome has since dropped from its list
      const w = size?.w || frameW || BREAKPOINTS.find((b) => b.id === currentBp())!.ideal;
      frameW = w;
      frame.dataset.mode = "canvas";
      delete device.dataset.shell;
      delete device.dataset.browser;
      shellEl.innerHTML = chromeTop.innerHTML = chromeBottom.innerHTML = "";
      chromeTop.style.cssText = chromeBottom.style.cssText = "";
      barsBtn.hidden = true;
      frameScrollbar = "overlay";
      /* Full height on purpose: the canvas is a working surface, and a short one
         would hide exactly the sections you are trying to comment on. A DevTools device
         is the exception — its height is the point of picking it. */
      device.style.width = `${w}px`;
      device.style.height = `${size?.h ?? innerHeight - 84}px`; // window minus the ruler and the bar
      frameEl.style.position = "";
      frameEl.style.left = frameEl.style.top = "";
      frameEl.style.width = "100%";
      frameEl.style.height = "100%";
      renderRuler(w);
      tellFrame({ notes: notesOn });
      const band = BREAKPOINTS.find((b) => b.id === bpOf(w))!;
      const named = emuDevice();
      frameDevice = named ? `${named.label}${emu?.turned ? " \u00b7 landscape" : ""}` : "";
      tellFrame({ scrollbar: frameScrollbar, device: frameDevice });
      setBadge(named && size
        ? `${named.label} \u00b7 ${size.w}\u00d7${size.h} \u00b7 ${band.label}`
        : `${w}px \u00b7 ${band.label}`);
      bpFilter = bpOf(w);
    }
    rotateBtn.hidden = !(emuDevice()?.rotates && !dev);
    syncDeviceMenu();
    fitCanvas();
    syncBpButtons();
    /* Re-read rather than re-render: switching bands is the gesture you reach for
       when the list looks stale, and it also picks up edits made from the CLI. */
    if (notesOn) loadNotes(); else renderNotes();
  };

  const pickBp = (id: string) => {
    const b = BREAKPOINTS.find((x) => x.id === id)!;
    deviceId = "";
    localStorage.setItem(DEVICE_KEY, "");
    setEmu(null);
    /* The widest band has no canvas — it is your own window, which is the honest
       way to view it and the only way to see a truly full-bleed layout. */
    canvasOn = id !== WIDE;
    frameW = canvasOn ? b.ideal : 0;
    bpFilter = canvasOn ? id : null;
    localStorage.setItem(CANVAS_KEY, canvasOn ? "1" : "0");
    localStorage.setItem(W_KEY, String(frameW));
    openId = null;
    draft = null;
    applyCanvas();
  };
  for (const b of bpBtns) b.addEventListener("click", () => pickBp(b.dataset.bp!));

  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-device]")) {
    btn.addEventListener("click", () => {
      deviceId = btn.dataset.device === deviceId ? "" : btn.dataset.device!;
      localStorage.setItem(DEVICE_KEY, deviceId);
      devicesMenu.open = false;
      applyCanvas();
    });
  }

  /* A DevTools row: the canvas at that size. Picking the one already open closes it,
     back to the window — the same toggle the preview rows have. */
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-emu]")) {
    btn.addEventListener("click", () => {
      const again = emu?.id === btn.dataset.emu && !deviceId;
      deviceId = "";
      localStorage.setItem(DEVICE_KEY, "");
      setEmu(again ? null : { id: btn.dataset.emu!, turned: false });
      canvasOn = !again;
      frameW = 0;
      localStorage.setItem(CANVAS_KEY, canvasOn ? "1" : "0");
      bpFilter = null;
      openId = null;
      draft = null;
      devicesMenu.open = false;
      applyCanvas();
    });
  }
  rotateBtn.addEventListener("click", () => {
    if (!emu) return;
    setEmu({ ...emu, turned: !emu.turned });
    openId = null;
    draft = null;
    applyCanvas();
  });

  /* Two lists behind one button: Preview (a real screen and its browser) and DevTools
     (every device Chrome knows, as a working canvas). The tab you were on is kept. */
  const tabs = [...devicesMenu.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const panels = [...devicesMenu.querySelectorAll<HTMLElement>("[data-panel]")];
  const setTab = (name: string) => {
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.tab === name));
    for (const p of panels) p.hidden = p.dataset.panel !== name;
    persist("dt-devices-tab", name);
  };
  for (const t of tabs) t.addEventListener("click", () => setTab(t.dataset.tab!));
  setTab(localStorage.getItem("dt-devices-tab") === "devtools" ? "devtools" : "preview");

  /* Forty-odd devices: typing narrows the list, and a heading stays only while it
     still has a row under it. */
  const search = devicesMenu.querySelector<HTMLInputElement>(".dt-emu-search")!;
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    let heading: HTMLElement | null = null;
    let any = false;
    const close = () => { if (heading) heading.hidden = !any; };
    for (const el of search.parentElement!.children as unknown as HTMLElement[]) {
      if (el.classList.contains("dt-devices-group")) { close(); heading = el; any = false; continue; }
      if (!el.dataset.emu) continue;
      el.hidden = !!q && !el.textContent!.toLowerCase().includes(q);
      any ||= !el.hidden;
    }
    close();
  });

  /* Which row is open, in both lists, and on the button itself: the menu names the
     device instead of saying "Device" while one is up. */
  const devicesName = devicesMenu.querySelector<HTMLElement>(".dt-devices-name")!;
  function syncDeviceMenu() {
    for (const b of devicesMenu.querySelectorAll<HTMLElement>("[data-device]")) {
      b.setAttribute("aria-pressed", String(b.dataset.device === deviceId));
    }
    const live = !deviceId && !frame.hidden ? emu?.id : undefined;
    for (const b of devicesMenu.querySelectorAll<HTMLElement>("[data-emu]")) {
      b.setAttribute("aria-pressed", String(b.dataset.emu === live));
    }
    devicesName.textContent = (deviceId && deviceById(deviceId)?.label) || (live && emuDevice()?.label) || "Device";
  }

  /* Dragging either edge, Webflow-style. The width is clamped to the band you are
     in: a breakpoint is chosen by its icon, never stumbled into mid-drag, so the
     comments you are writing keep belonging to the band you picked. Pointer capture
     keeps the drag alive over the iframe, which would otherwise eat the events. */
  const bandOf = (id: string) => BREAKPOINTS.find((b) => b.id === id)!;
  const clampToBand = (w: number) => {
    const b = bandOf(bpFilter ?? currentBp());
    return Math.max(b.min || 320, Math.min(Number.isFinite(b.max) ? b.max : 2560, Math.round(w)));
  };

  for (const handle of handles) {
    const dir = handle.dataset.edge === "l" ? -1 : 1;

    handle.addEventListener("pointerdown", (e) => {
      if (deviceId) return; // a device has one true width
      e.preventDefault();
      // dragging a DevTools device makes it a canvas of your own width, full height
      if (emu) { setEmu(null); applyCanvas(); }
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = frameW;
      const scale = Number(device.dataset.scaled || 100) / 100;
      frame.dataset.dragging = "1";
      const move = (ev: PointerEvent) => {
        // the canvas is centred, so one edge moving by d changes the width by 2d
        frameW = clampToBand(startW + (dir * (ev.clientX - startX) * 2) / scale);
        device.style.width = `${frameW}px`;
        renderRuler(frameW);
        setBadge(`${frameW}px \u00b7 ${bandOf(bpOf(frameW)).label}`);
        fitCanvas();
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        delete frame.dataset.dragging;
        localStorage.setItem(W_KEY, String(frameW));
        applyCanvas();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });

    /* Double-click: jump to the nearer edge of the band — the two widths where the
       layout actually flips, and the ones worth checking. */
    handle.addEventListener("dblclick", () => {
      if (deviceId) return;
      setEmu(null);
      const b = bandOf(bpFilter ?? currentBp());
      const edges = [b.min || 320, Number.isFinite(b.max) ? b.max : b.ideal];
      frameW = Math.abs(frameW - edges[0]) < Math.abs(frameW - edges[1]) ? edges[0] : edges[1];
      localStorage.setItem(W_KEY, String(frameW));
      applyCanvas();
    });
  }

  /* Dragging the real window across a band edge changes which comments belong on
     screen, so the list has to follow. Only on an actual band change — re-rendering
     on every resize frame would churn the DOM for nothing. */
  let lastBp = currentBp();
  addEventListener("resize", () => {
    syncBpButtons();
    if (currentBp() !== lastBp) { lastBp = currentBp(); renderNotes(); }
    if (!frame.hidden) {
      if (!deviceId && !emu) device.style.height = `${innerHeight - 84}px`;
      fitCanvas();
    }
  });

  /* Sanity's overlay is <sanity-visual-editing>, a direct child of <html>. Hiding it
     is a CSS class, not a remount: the island keeps its state and comes back instantly. */
  const STUDIO_KEY = "dt-studio";
  const setStudio = (on: boolean) => {
    studioBtn.setAttribute("aria-pressed", String(on));
    document.documentElement.classList.toggle("dt-no-studio", !on);
    persist(STUDIO_KEY, on ? "1" : "0");
  };
  studioBtn.addEventListener("click", () => setStudio(studioBtn.getAttribute("aria-pressed") !== "true"));
  setStudio(localStorage.getItem(STUDIO_KEY) !== "0");

  notesBtn.addEventListener("click", () => setNotes(!notesOn));

  /* The tab under the bar folds it away below the window edge, for the moments the bar
     sits on exactly what you are looking at. The tab stays where it is to bring it
     back, and the modes stay as they were. Remembered, like every other switch here. */
  const bar = document.querySelector<HTMLElement>(".devtools")!;
  const tab = document.querySelector<HTMLButtonElement>(".dt-tab")!;
  const setCollapsed = (on: boolean) => {
    bar.toggleAttribute("data-collapsed", on);
    tab.toggleAttribute("data-collapsed", on);
    tab.setAttribute("aria-expanded", String(!on));
    tab.setAttribute("aria-label", on ? "Show the bar" : "Hide the bar");
    // out of sight, out of the tab order
    for (const g of bar.querySelectorAll<HTMLElement>(".dt-group")) g.inert = on;
    if (on) closeMenus();
    persist("dt-collapsed", on ? "1" : "0");
  };
  tab.addEventListener("click", () => setCollapsed(!bar.hasAttribute("data-collapsed")));

  if (!inFrame) {
    setCollapsed(localStorage.getItem("dt-collapsed") === "1");
    // after the first paint, or a bar remembered folded slides away on every load
    requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute("data-ready", "")));
    /* Restore the canvas/device the session was left in — without this the saved
       width and breakpoint were remembered but never applied. */
    if (canvasOn || deviceId) applyCanvas();
    else syncDeviceMenu();
    setGrid(localStorage.getItem(KEY) === "1");
    const savedInspect = localStorage.getItem(INSPECT_KEY) as Inspector | null;
    if (savedInspect && savedInspect in inspectBtns) setInspect(savedInspect);
    setNotes(localStorage.getItem(NOTES_KEY) === "1");
  }
  /* Whatever was half-written when the page went away. The pin is redrawn from its
     selector like any saved comment's, so a draft survives HMR the same way sent ones
     do; an element that no longer exists takes its draft with it. In the canvas the
     draft waits for the page to switch comment mode on. */
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (saved?.draft && document.querySelector(saved.draft.selector)) {
      draft = saved.draft;
      if (!notesOn && !inFrame) setNotes(true); // the sentence is unreachable with the mode off
    }
    if (saved?.reply?.text) {
      replyDraft = saved.reply.text;
      // openId last: renderNotes drops the reply when it belongs to another thread
      replyFor = openId = saved.reply.for ?? null;
    }
    if (draft || replyDraft) renderNotes();
  } catch { localStorage.removeItem(DRAFT_KEY); }

  if (!notesOn) loadNotes(); // badge shows the open count even with the mode off
  loadAllNotes(); // the page menu carries its counts whether or not the mode is on

  /* `npx mitka done` writes the same file from the terminal, and nothing tells the open
     page about it — the counts sat at what they were when the tab loaded until someone
     hit refresh in the panel. Coming back to the tab is exactly when they are read, so
     that is when they are re-fetched. */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    loadAllNotes();
    loadNotes();
  });

  // the copy in the canvas asks the page for its modes, now that it can hear the answer
  if (inFrame) parent.postMessage({ dt: true, hello: true }, location.origin);
}
