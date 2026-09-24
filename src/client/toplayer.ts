// Keep the bar usable while the page has a modal <dialog> open.
//
// A modal dialog sits in the top layer above every z-index and makes the rest of
// the document inert, so the bar could neither paint over it nor take a click —
// and a modal is exactly the kind of UI that gets reviewed. Measured in Chromium
// 151: a popover shown from OUTSIDE the dialog is still under it and
// still inert, even when re-shown after the modal. A popover host INSIDE the
// dialog's subtree is different on both counts: it is not inert, it enters the
// top layer after the dialog, and — top-layer boxes being positioned from the
// viewport whatever their ancestors do — its fixed children land where they
// always did, even under a dialog with `backdrop-filter`, which would otherwise
// become their containing block.
//
// So `showModal` is wrapped: the bar's roots move into a 0×0 popover host
// appended to the dialog, and move back to <body> when it closes. The canvas
// iframe stays behind: moving an iframe reloads it, and a modal in the outer
// page is not what the canvas is for.
export function keepAboveModals(roots: HTMLElement[]) {
  if (!("showPopover" in HTMLElement.prototype) || typeof HTMLDialogElement === "undefined") return;
  const proto = HTMLDialogElement.prototype;
  const original = proto.showModal;
  let host: HTMLElement | null = null;

  const unhost = () => {
    if (!host) return;
    for (const el of roots) document.body.append(el);
    try { host.hidePopover(); } catch { /* already hidden */ }
    host.remove();
    host = null;
  };
  const hostIn = (dialog: HTMLDialogElement) => {
    unhost();
    host = document.createElement("div");
    host.className = "dt-host";
    host.setAttribute("popover", "manual");
    host.append(...roots);
    dialog.append(host);
    try { host.showPopover(); } catch { /* not connected, or already shown */ }
    dialog.addEventListener("close", () => {
      unhost();
      // a modal under this one takes the bar back
      const below = document.querySelector<HTMLDialogElement>("dialog:modal");
      if (below) hostIn(below);
    }, { once: true });
  };

  proto.showModal = function (this: HTMLDialogElement) {
    original.call(this);
    if (this.isConnected) hostIn(this);
  };
}
