// In-page text editor. A contenteditable box is laid over the text item while it is
// being edited. Each paragraph is a <div class="blk"> that carries its formatting in
// data attributes (size, bold, align, list), so the model stays simple:
//   blocks = [{ text, size, bold, align, list }]

import { TEXT_DEFAULT } from "./units.js";
import { LINE_FACTOR, LIST_INDENT } from "./render.js";

const SIZES = [12, 16, 20, 26, 32, 40, 52, 68, 90];
const $ = (id) => document.getElementById(id);

/**
 * onChange(blocks): called after every edit.
 * onStop(item, blocks): called when editing ends.
 */
export function createTextEditor({ onChange, onStop }) {
  const root = $("text-editor");
  const bar = $("format-bar");
  let current = null; // the item being edited

  // ---- paragraphs <-> DOM -------------------------------------------------

  function setBlockData(div, b) {
    div.dataset.size = b.size || TEXT_DEFAULT;
    if (b.bold) div.dataset.bold = "1";
    else delete div.dataset.bold;
    if (b.align) div.dataset.align = b.align;
    else delete div.dataset.align;
    if (b.list) div.dataset.list = b.list;
    else delete div.dataset.list;
  }

  // Sizes scale with the page zoom through the --z CSS variable.
  function styleBlock(div) {
    const size = Number(div.dataset.size) || TEXT_DEFAULT;
    div.style.fontSize = `calc(var(--z) * ${size}px)`;
    div.style.lineHeight = `calc(var(--z) * ${Math.round(size * LINE_FACTOR)}px)`;
    div.style.paddingLeft = div.dataset.list ? `calc(var(--z) * ${Math.round(size * LIST_INDENT)}px)` : "";
  }

  function makeBlock(b = {}) {
    const div = document.createElement("div");
    div.className = "blk";
    setBlockData(div, b);
    const parts = (b.text ?? "").split("\n");
    parts.forEach((t, i) => {
      if (i) div.append(document.createElement("br"));
      if (t) div.append(t);
    });
    // An empty line (or one ending in a line break) needs a <br> to keep its height.
    if (!div.lastChild || div.lastChild.nodeName === "BR") div.append(document.createElement("br"));
    styleBlock(div);
    return div;
  }

  function textOf(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeName === "BR") return "\n";
    let s = "";
    node.childNodes.forEach((c) => (s += textOf(c)));
    return s;
  }

  function parse() {
    const make = (text, d = {}) => ({
      text,
      size: Number(d.size) || TEXT_DEFAULT,
      bold: d.bold === "1",
      align: Number(d.align) || 0,
      list: d.list || null,
    });
    const blocks = [];
    for (const node of root.childNodes) {
      if (node.nodeType === 3) {
        if (node.nodeValue) blocks.push(make(node.nodeValue));
      } else if (node.nodeType === 1) {
        let text = textOf(node);
        if (text === "\n") text = ""; // the placeholder <br> of an empty line
        else if (text.endsWith("\n")) text = text.slice(0, -1);
        blocks.push(make(text, node.dataset));
      }
    }
    return blocks.length ? blocks : [make("")];
  }

  function placeCaretEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Chrome can leave loose text or <br> directly in the box (for example after
  // select-all and delete). Wrap them back into paragraphs.
  function normalize() {
    if (!root.childNodes.length) {
      root.append(makeBlock());
      placeCaretEnd(root.firstChild);
      return;
    }
    const sel = getSelection();
    for (const n of [...root.childNodes]) {
      if (n.nodeType !== 3 && n.nodeName !== "BR") continue;
      const holdsCaret = sel.anchorNode === n;
      const offset = sel.anchorOffset;
      const div = makeBlock();
      div.replaceChildren();
      n.replaceWith(div);
      div.append(n);
      if (holdsCaret) {
        const range = document.createRange();
        range.setStart(n, offset);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }

  // ---- formatting ---------------------------------------------------------

  function selectedBlocks() {
    const sel = getSelection();
    if (!sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return [];
    return [...root.children].filter((child) => range.intersectsNode(child));
  }

  function changed() {
    onChange(parse());
  }

  function format(fn) {
    const blocks = selectedBlocks();
    if (!blocks.length) return;
    fn(blocks);
    blocks.forEach(styleBlock);
    changed();
    refreshBar();
  }

  const sizeOf = (div) => Number(div.dataset.size) || TEXT_DEFAULT;

  const actions = {
    smaller: (blocks) => blocks.forEach((b) => {
      const i = SIZES.findIndex((s) => s >= sizeOf(b));
      b.dataset.size = SIZES[Math.max(0, (i === -1 ? SIZES.length : i) - 1)];
    }),
    larger: (blocks) => blocks.forEach((b) => {
      const i = SIZES.findIndex((s) => s > sizeOf(b));
      b.dataset.size = SIZES[i === -1 ? SIZES.length - 1 : i];
    }),
    bold: (blocks) => {
      const all = blocks.every((b) => b.dataset.bold === "1");
      blocks.forEach((b) => (all ? delete b.dataset.bold : (b.dataset.bold = "1")));
    },
    align: (n) => (blocks) => blocks.forEach((b) => (n ? (b.dataset.align = n) : delete b.dataset.align)),
    list: (kind) => (blocks) => {
      const all = blocks.every((b) => b.dataset.list === kind);
      blocks.forEach((b) => (all ? delete b.dataset.list : (b.dataset.list = kind)));
    },
  };

  function refreshBar() {
    const first = selectedBlocks()[0];
    if (!first) return;
    $("fmt-size").textContent = sizeOf(first);
    const on = (id, state) => $(id).classList.toggle("active", state);
    on("fmt-bold", first.dataset.bold === "1");
    on("fmt-left", !first.dataset.align);
    on("fmt-center", first.dataset.align === "1");
    on("fmt-right", first.dataset.align === "2");
    on("fmt-bullet", first.dataset.list === "bullet");
    on("fmt-number", first.dataset.list === "number");
  }

  // ---- events -------------------------------------------------------------

  // Keep the text selection when a format button is pressed.
  bar.addEventListener("mousedown", (e) => e.preventDefault());

  $("fmt-smaller").addEventListener("click", () => format(actions.smaller));
  $("fmt-larger").addEventListener("click", () => format(actions.larger));
  $("fmt-bold").addEventListener("click", () => format(actions.bold));
  $("fmt-left").addEventListener("click", () => format(actions.align(0)));
  $("fmt-center").addEventListener("click", () => format(actions.align(1)));
  $("fmt-right").addEventListener("click", () => format(actions.align(2)));
  $("fmt-bullet").addEventListener("click", () => format(actions.list("bullet")));
  $("fmt-number").addEventListener("click", () => format(actions.list("number")));
  $("fmt-done").addEventListener("click", () => stop());

  root.addEventListener("input", () => {
    normalize();
    changed();
  });

  root.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      format(actions.bold);
    } else if (mod && ["i", "u"].includes(e.key.toLowerCase())) {
      e.preventDefault(); // no italic or underline: the printer output is plain
    } else if (e.key === "Escape") {
      e.preventDefault();
      stop();
    } else if (e.key === "Enter" && !e.shiftKey) {
      // Enter on an empty list item ends the list.
      const [block] = selectedBlocks();
      if (block && block.dataset.list && !block.textContent) {
        e.preventDefault();
        delete block.dataset.list;
        styleBlock(block);
        changed();
        refreshBar();
      }
    }
  });

  // Paste as plain text only, so no foreign styles come in.
  root.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  root.addEventListener("drop", (e) => e.preventDefault());
  root.addEventListener("blur", () => stop());
  document.addEventListener("selectionchange", () => {
    if (current) refreshBar();
  });

  // ---- public -------------------------------------------------------------

  function position(item, zoom) {
    root.style.setProperty("--z", zoom);
    root.style.left = `${item.x * zoom}px`;
    root.style.top = `${item.y * zoom}px`;
    root.style.width = `${item.w * zoom}px`;
  }

  function start(item, zoom) {
    current = item;
    root.replaceChildren(...item.blocks.map(makeBlock));
    position(item, zoom);
    root.classList.remove("hidden");
    bar.classList.remove("hidden");
    root.focus();
    placeCaretEnd(root.lastChild);
    refreshBar();
  }

  function stop() {
    if (!current) return;
    const item = current;
    current = null; // set first: removing the box fires blur again
    const blocks = parse();
    root.classList.add("hidden");
    bar.classList.add("hidden");
    root.replaceChildren();
    onStop(item, blocks);
  }

  return { start, stop, position };
}
