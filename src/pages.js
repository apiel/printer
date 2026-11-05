// The pages and the items on them. A page is a sheet (a roll, or a fixed size such as
// A4) that holds text boxes and images placed anywhere. Items can be moved, resized
// and (images) turned in quarter turns; a text box is edited in place.
//
// Positions and sizes are in printer dots. The sheets are scaled on screen to fit.

import { mmToDots, newId } from "./units.js";
import { pageLengthMm, pageWidthDots } from "./presets.js";
import { bakeImage } from "./bitmap.js";
import { icon } from "./icons.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createPages({ stage, getPreset, getRoll, setRoll, onChange, onSelection, onDropImages, onFit }) {
  let model = []; // [{ items: [...] }]
  let views = []; // per page: the DOM around it
  const els = new Map(); // item id -> element
  let selected = null; // { item, pageIndex }
  let editing = null; // the text item being edited
  let zoom = 1;
  let drag = null;

  // The selection box with its handles. One instance, moved to whichever page needs it.
  const sel = document.createElement("div");
  sel.className = "sel ui";
  sel.innerHTML = ["nw", "ne", "sw", "se"].map((c) => `<div class="h h-${c}" data-handle="resize-${c}" title="Resize"></div>`).join("");

  // ---- items ---------------------------------------------------------------

  const contentOf = (item) => els.get(item.id)?.querySelector(".content") ?? null;
  const itemHeight = (item) => els.get(item.id)?.offsetHeight ?? 0;

  /** How far down the content reaches on the longest page, plus the bottom padding (0 if empty). */
  function contentBottom() {
    let bottom = 0;
    for (const pg of model) for (const it of pg.items) bottom = Math.max(bottom, it.y + itemHeight(it));
    return bottom ? bottom + mmToDots(getPreset().padding.bottom) : 0;
  }

  const pageOf = (item) => model.findIndex((p) => p.items.includes(item));

  function makeEl(item) {
    const el = document.createElement("div");
    el.className = `item ${item.type}`;
    el.dataset.id = item.id;
    if (item.type === "text") {
      const content = document.createElement("div");
      content.className = "content";
      content.contentEditable = "false";
      content.innerHTML = item.html;
      el.append(content);
    } else {
      const img = document.createElement("img");
      img.draggable = false;
      img.alt = "";
      el.append(img);
    }
    els.set(item.id, el);
    applyItem(item);
    return el;
  }

  function applyItem(item) {
    const el = els.get(item.id);
    el.style.left = `${item.x}px`;
    el.style.top = `${item.y}px`;
    if (item.type === "text") {
      el.style.width = `${item.w}px`;
      el.style.minHeight = `${item.h || 0}px`;
    } else {
      el.style.width = `${item.bw}px`;
      el.style.height = `${item.bh}px`;
      const img = el.firstChild;
      if (img.getAttribute("src") !== item.src) img.src = item.src;
      img.style.transform = "";
    }
  }

  // ---- building the sheets --------------------------------------------------

  function buildView(index) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    const sizer = document.createElement("div");
    sizer.className = "sizer";
    const zoomer = document.createElement("div");
    zoomer.className = "zoomer";
    const page = document.createElement("div");
    page.className = "page";
    for (const item of model[index].items) page.append(makeEl(item));

    const guide = document.createElement("div");
    guide.className = "padding-guide ui";
    const lenHandle = document.createElement("div");
    lenHandle.className = "len-handle ui";
    lenHandle.dataset.handle = "length";
    lenHandle.title = "Drag to set the length (content below it is cropped)";
    const hint = document.createElement("div");
    hint.className = "empty-hint ui";
    hint.textContent = "Add a text box or an image from the toolbar";

    zoomer.append(page, guide, lenHandle, hint);
    sizer.append(zoomer);

    const caption = document.createElement("div");
    caption.className = "caption ui";
    caption.innerHTML = `<span>Page ${index + 1}</span><button type="button" class="icon" data-remove-page="${index}" title="Remove this page">${icon("trash")}</button>`;

    wrap.append(sizer, caption);
    views[index] = { wrap, sizer, zoomer, page, guide, lenHandle, hint, caption };
    return wrap;
  }

  function rebuild() {
    els.clear();
    views = [];
    stage.replaceChildren(...model.map((_, i) => buildView(i)));
    layout();
  }

  /** Size every sheet for the current page size and fit it to the screen. */
  function layout() {
    const p = getPreset();
    const width = pageWidthDots(p);
    const roll = !p.lengthMm;
    zoom = clamp((stage.clientWidth - 48) / width, 0.2, 3);

    model.forEach((pg, i) => {
      const v = views[i];
      if (!v) return;
      let height;
      if (roll) {
        // A roll grows with its content (plus the bottom padding), never below its minimum length.
        let bottom = 0;
        for (const it of pg.items) bottom = Math.max(bottom, it.y + itemHeight(it));
        const { length, crop } = getRoll();
        // Automatic: as long as the content (plus padding), at least `length`. Cropped: exactly `length`.
        height = crop ? Math.max(8, length) : Math.max(8, length, bottom + mmToDots(p.padding.bottom));
      } else {
        height = mmToDots(pageLengthMm(p));
      }
      Object.assign(v.page.style, { width: `${width}px`, height: `${height}px`, overflow: roll && !getRoll().crop ? "visible" : "hidden" });
      Object.assign(v.zoomer.style, { width: `${width}px`, height: `${height}px`, transform: `scale(${zoom})` });
      v.zoomer.style.setProperty("--inv", String(1 / zoom)); // keeps handles and borders a constant size
      Object.assign(v.sizer.style, { width: `${width * zoom}px`, height: `${height * zoom}px` });
      Object.assign(v.guide.style, {
        left: `${mmToDots(p.padding.left)}px`,
        right: `${mmToDots(p.padding.right)}px`,
        top: `${mmToDots(p.padding.top)}px`,
        bottom: `${mmToDots(p.padding.bottom)}px`,
      });
      v.lenHandle.style.display = roll ? "" : "none";
      v.caption.style.display = !roll && model.length > 1 ? "" : "none";
      v.caption.style.width = `${width * zoom}px`;
      v.hint.style.display = pg.items.length === 0 ? "" : "none";
    });
    placeSelection();
  }

  // ---- selection ---------------------------------------------------------

  function placeSelection() {
    if (!selected) {
      sel.remove();
      return;
    }
    const { item, pageIndex } = selected;
    const el = els.get(item.id);
    const v = views[pageIndex];
    if (!el || !v) {
      sel.remove();
      return;
    }
    if (sel.parentElement !== v.zoomer) v.zoomer.append(sel);
    sel.classList.toggle("is-image", item.type === "image");
    sel.classList.toggle("is-editing", editing === item);
    Object.assign(sel.style, {
      left: `${item.x}px`,
      top: `${item.y}px`,
      width: `${el.offsetWidth}px`,
      height: `${el.offsetHeight}px`,
    });
  }

  function select(item, pageIndex = item ? pageOf(item) : -1) {
    if (editing && editing !== item) stopEdit();
    const same = selected?.item === item;
    selected = item ? { item, pageIndex } : null;
    placeSelection();
    if (!same) onSelection(item);
  }

  // ---- adding and removing -----------------------------------------------

  function addText(pageIndex, { x, y, w }) {
    const item = { id: newId(), type: "text", x, y, w, h: 0, html: "<div><br></div>" };
    model[pageIndex].items.push(item);
    views[pageIndex].page.append(makeEl(item));
    onFit();
    layout();
    select(item, pageIndex);
    startEdit(item);
    onChange();
    return item;
  }

  async function addImage(pageIndex, { orig, w, h, x, y, angle = 0 }) {
    const baked = await bakeImage(orig, w, h, angle);
    const item = { id: newId(), type: "image", x, y, w, h, ratio: h / w, angle, orig, src: baked.src, bw: baked.bw, bh: baked.bh };
    model[pageIndex].items.push(item);
    views[pageIndex].page.append(makeEl(item));
    onFit();
    layout();
    select(item, pageIndex);
    onChange();
    return item;
  }

  function remove(item) {
    const i = pageOf(item);
    if (i < 0) return;
    model[i].items = model[i].items.filter((x) => x !== item);
    els.get(item.id)?.remove();
    els.delete(item.id);
    if (editing === item) editing = null;
    if (selected?.item === item) selected = null;
    onFit();
    layout();
    onSelection(selected?.item ?? null);
  }

  function deleteSelected() {
    if (!selected) return;
    remove(selected.item);
    onChange();
  }

  /** Remove every item and every extra page. */
  function clearAll() {
    stopEdit();
    selected = null;
    model = [{ items: [] }];
    rebuild();
    onSelection(null);
    onChange();
  }

  function addPage() {
    stopEdit();
    model.push({ items: [] });
    rebuild();
    onChange();
    return model.length - 1;
  }

  function removePage(index) {
    if (model.length <= 1) return;
    stopEdit();
    select(null);
    model.splice(index, 1);
    rebuild();
    onChange();
  }

  // ---- editing text ---------------------------------------------------------

  function startEdit(item, { selectAll = false } = {}) {
    if (item.type !== "text") return;
    if (editing && editing !== item) stopEdit();
    select(item);
    editing = item;
    const content = contentOf(item);
    content.contentEditable = "true";
    content.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(content);
    if (!selectAll) range.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(range);
    placeSelection();
    onSelection(item);
  }

  function stopEdit() {
    if (!editing) return;
    const item = editing;
    editing = null;
    const content = contentOf(item);
    if (content) {
      content.contentEditable = "false";
      getSelection().removeAllRanges();
      item.html = content.innerHTML;
      // A box left empty is removed.
      if (!content.textContent.trim() && !content.querySelector("img")) remove(item);
    }
    placeSelection();
    onSelection(selected?.item ?? null);
    onChange();
  }

  /** Copy the edited text into the model (call after the text changed). */
  function syncEditing() {
    if (!editing) return;
    const content = contentOf(editing);
    if (content) editing.html = content.innerHTML;
    onFit(); // the page follows the text as it grows or shrinks
    layout();
  }

  // ---- finding things under the pointer -------------------------------------

  function toPage(e, pageIndex) {
    const r = views[pageIndex].page.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  }

  function itemFromEvent(e) {
    const el = e.target.closest?.(".item");
    if (!el) return null;
    for (let i = 0; i < model.length; i++) {
      const item = model[i].items.find((it) => it.id === el.dataset.id);
      if (item) return { item, pageIndex: i, el };
    }
    return null;
  }

  // ---- dragging -------------------------------------------------------------

  function startMove(found, e) {
    const { item, pageIndex, el } = found;
    const p0 = toPage(e, pageIndex);
    const x0 = item.x;
    const y0 = item.y;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    drag = {
      move(ev) {
        const p = toPage(ev, pageIndex);
        if (!moved && Math.abs(p.x - p0.x) + Math.abs(p.y - p0.y) < 3) return;
        moved = true;
        item.x = clamp(Math.round(x0 + p.x - p0.x), 0, Math.max(0, pageWidthDots(getPreset()) - el.offsetWidth));
        item.y = Math.max(0, Math.round(y0 + p.y - p0.y));
        applyItem(item);
        layout();
      },
      end() {
        if (moved) {
          onFit();
          onChange();
        }
      },
    };
  }

  // After a resize or rotation the picture is baked again from the original.
  async function rebake(item, anchor) {
    const cx = item.x + item.bw / 2;
    const cy = item.y + item.bh / 2;
    const baked = await bakeImage(item.orig, item.w, item.h, item.angle);
    item.src = baked.src;
    item.bw = baked.bw;
    item.bh = baked.bh;
    if (anchor === "center") {
      item.x = Math.max(0, Math.round(cx - baked.bw / 2));
      item.y = Math.max(0, Math.round(cy - baked.bh / 2));
    }
    applyItem(item);
    layout();
  }

  // Resizing from a corner. Text boxes only have the bottom right one.
  function startResize(e, corner) {
    const { item, pageIndex } = selected;
    const el = els.get(item.id);
    const width = pageWidthDots(getPreset());
    e.target.setPointerCapture(e.pointerId);

    if (item.type === "text") {
      drag = {
        move(ev) {
          const p = toPage(ev, pageIndex);
          item.w = clamp(Math.round(p.x - item.x), 40, Math.max(40, width - item.x));
          item.h = Math.max(0, Math.round(p.y - item.y));
          applyItem(item);
          layout();
        },
        end() {
          onFit();
          onChange();
        },
      };
      return;
    }

    // Images scale evenly around the opposite corner. The picture is stretched while
    // dragging and dithered again at the new size on release.
    const east = corner.includes("e");
    const south = corner.includes("s");
    const bw0 = item.bw;
    const bh0 = item.bh;
    const ax = east ? item.x : item.x + bw0; // the corner that stays where it is
    const ay = south ? item.y : item.y + bh0;
    const maxK = Math.max(0.1, Math.min(east ? (width - ax) / bw0 : ax / bw0, south ? Infinity : ay / bh0));
    let k = 1;
    drag = {
      move(ev) {
        const p = toPage(ev, pageIndex);
        const kw = (east ? p.x - ax : ax - p.x) / bw0;
        const kh = (south ? p.y - ay : ay - p.y) / bh0;
        k = clamp(Math.max(kw, kh), 0.1, maxK);
        item.x = Math.round(east ? ax : ax - bw0 * k);
        item.y = Math.round(south ? ay : ay - bh0 * k);
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
        el.style.width = `${bw0 * k}px`;
        el.style.height = `${bh0 * k}px`;
        placeSelection();
      },
      async end() {
        await scaleImage(item, k);
        onFit();
        onChange();
      },
    };
  }

  // ---- image operations (used by the image toolbox) ------------------------

  const selectedImage = () => (selected?.item.type === "image" ? selected.item : null);
  const ratioOf = (item) => item.ratio ?? item.h / item.w; // older saved images have none

  /** Turn the selected image by a quarter turn (delta: 90 or -90). */
  async function rotateSelected(delta) {
    const item = selectedImage();
    if (!item) return;
    item.angle = (((item.angle + delta) % 360) + 360) % 360;
    await rebake(item, "center");
    const width = pageWidthDots(getPreset());
    if (item.bw > width) await scaleImage(item, width / item.bw); // a turned image may be too wide
    item.x = clamp(item.x, 0, Math.max(0, width - item.bw));
    applyItem(item);
    layout();
    onFit();
    onChange();
  }

  // Scale evenly. Height follows from the stored proportions, so rounding cannot add up.
  async function scaleImage(item, k) {
    item.w = Math.max(4, Math.round(item.w * k));
    item.h = Math.max(4, Math.round(item.w * ratioOf(item)));
    await rebake(item, "topleft");
  }

  /** Set the width or height (dots) of the selected image as shown on the page. */
  async function setImageSize(dim, dots, keepRatio) {
    const item = selectedImage();
    if (!item || !(dots > 0)) return;
    const width = pageWidthDots(getPreset());
    let bw = item.bw;
    let bh = item.bh;
    if (dim === "w") {
      bw = clamp(Math.round(dots), 4, width);
      if (keepRatio) bh = (item.bh * bw) / item.bw;
    } else {
      bh = Math.max(4, Math.round(dots));
      if (keepRatio) bw = clamp((item.bw * bh) / item.bh, 4, width);
    }
    const turned = item.angle % 180 !== 0; // quarter turned: shown width is the picture's height
    item.w = Math.max(4, Math.round(turned ? bh : bw));
    item.h = Math.max(4, Math.round(turned ? bw : bh));
    if (!keepRatio) item.ratio = item.h / item.w;
    await rebake(item, "topleft");
    item.x = clamp(item.x, 0, Math.max(0, width - item.bw));
    applyItem(item);
    layout();
    onFit();
    onChange();
  }

  /** Scale the selected image to the page's content width, or ("page") to fit the whole page. */
  async function fitSelected(mode) {
    const item = selectedImage();
    if (!item) return;
    const p = getPreset();
    const left = mmToDots(p.padding.left);
    const top = mmToDots(p.padding.top);
    let k = (pageWidthDots(p) - left - mmToDots(p.padding.right)) / item.bw;
    if (mode === "page" && p.lengthMm) {
      k = Math.min(k, (mmToDots(pageLengthMm(p)) - top - mmToDots(p.padding.bottom)) / item.bh);
    }
    item.x = left;
    if (mode === "page") item.y = top;
    await scaleImage(item, k);
    onFit();
    onChange();
  }

  function startLength(e) {
    const pageIndex = views.findIndex((v) => v.lenHandle === e.target);
    const startY = e.clientY;
    const startH = views[pageIndex].page.offsetHeight;
    e.target.setPointerCapture(e.pointerId);
    drag = {
      move(ev) {
        setRoll({ length: Math.max(0, Math.round(startH + (ev.clientY - startY) / zoom)), crop: true });
        layout();
      },
      end: () => onChange(),
    };
  }

  // ---- pointer events ------------------------------------------------------

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const handle = e.target.closest("[data-handle]");
    if (handle) {
      e.preventDefault();
      e.stopPropagation();
      const kind = handle.dataset.handle;
      if (kind.startsWith("resize")) startResize(e, kind.split("-")[1]);
      else if (kind === "length") startLength(e);
      return;
    }
    const found = itemFromEvent(e);
    if (!found) {
      stopEdit();
      select(null);
      return;
    }
    if (editing === found.item && e.target.closest(".content")) return; // place the caret
    select(found.item, found.pageIndex);
    if (editing !== found.item) startMove(found, e);
  });

  stage.addEventListener("pointermove", (e) => drag?.move(e));

  const endDrag = async (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    await d.end?.(e);
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("dblclick", (e) => {
    const found = itemFromEvent(e);
    if (found?.item.type === "text") startEdit(found.item);
  });

  stage.addEventListener("click", (e) => {
    const button = e.target.closest("[data-remove-page]");
    if (button) removePage(Number(button.dataset.removePage));
  });

  // Dropping image files onto a page adds them there.
  stage.addEventListener("dragover", (e) => {
    if ([...(e.dataTransfer?.types ?? [])].includes("Files")) e.preventDefault();
  });
  stage.addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    const index = views.findIndex((v) => v.wrap.contains(e.target));
    if (index < 0) return;
    onDropImages(files, index, toPage(e, index));
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) {
      if (e.key === "Escape" && editing) stopEdit();
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      deleteSelected();
      e.preventDefault();
    } else if (e.key === "Enter" && selected?.item.type === "text") {
      startEdit(selected.item);
      e.preventDefault();
    } else if (e.key === "Escape") {
      select(null);
    }
  });

  // ---- public ---------------------------------------------------------------

  return {
    load(pages) {
      editing = null;
      selected = null;
      model = pages;
      rebuild();
    },
    getModel: () => model,
    layout,
    addText,
    addImage,
    addPage,
    deleteSelected,
    clearAll,
    contentBottom,
    rotateSelected,
    setImageSize,
    fitSelected,
    startEdit,
    stopEdit,
    syncEditing,
    selectedItem: () => selected?.item ?? null,
    isEditing: () => !!editing,
    editingContent: () => (editing ? contentOf(editing) : null),
    pageElements: () => views.map((v) => v.page),
    count: () => model.length,
    // The page new things go on: the one with the selection, else the last.
    currentIndex: () => (selected ? selected.pageIndex : model.length - 1),
    isEmpty: (i) => model[i].items.length === 0,
    nextFreeY(pageIndex) {
      let y = mmToDots(getPreset().padding.top);
      for (const it of model[pageIndex].items) y = Math.max(y, it.y + itemHeight(it) + 4);
      return y;
    },
    // Keep every item inside the page after its width changed.
    fitToWidth(width) {
      for (const pg of model) {
        for (const it of pg.items) {
          if (it.type === "text") {
            it.w = Math.min(it.w, width);
            it.x = clamp(it.x, 0, Math.max(0, width - it.w));
          } else {
            it.x = clamp(it.x, 0, Math.max(0, width - it.bw));
          }
          if (els.has(it.id)) applyItem(it);
        }
      }
      layout();
    },
  };
}
