// Rich-text commands for the text box being edited: bold, italic, fonts, sizes, lists...
// Built on the browser's contenteditable and execCommand, plus our own handling where
// those fall short (px font sizes, any font family, choices made before typing).

import { SIZES, DEFAULT_SIZE } from "./fonts.js";

const MARK_FONT = "bytecintia-font";
const exec = (name, value = null) => document.execCommand(name, false, value);

const COMMANDS = [
  "bold", "italic", "underline", "strikeThrough",
  "justifyLeft", "justifyCenter", "justifyRight", "justifyFull",
  "insertUnorderedList", "insertOrderedList",
];

/**
 * root:         the element holding all the text boxes
 * getEditable:  the .content element being edited, or null
 * onNeedEditor: called when a command is used with no box being edited; should start
 *               editing the selected box (all its text selected) and return its element
 * onChange:     called after a command changed the text
 * onSelection:  called when the selection moves
 * onImageFiles: called with image files pasted into a box
 */
export function createRichText({ root, getEditable, onNeedEditor, onChange, onSelection, onImageFiles }) {
  let saved = null; // last selection inside a text box, kept while a toolbar control has focus

  // A font or size chosen with nothing selected applies to the text typed next. The
  // browser forgets one of them if both are chosen, so we remember them ourselves.
  const pending = { family: null, size: null, at: null };
  const clearPending = () => { pending.family = pending.size = pending.at = null; };

  const editableOf = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const content = el?.closest('.content[contenteditable="true"]');
    return content && root.contains(content) ? content : null;
  };

  function remember() {
    const sel = getSelection();
    if (sel.rangeCount && editableOf(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange();
  }

  document.addEventListener("selectionchange", () => {
    remember();
    const sel = getSelection();
    // Moving the caret elsewhere cancels the pending choices.
    if (pending.at && (sel.anchorNode !== pending.at.node || sel.anchorOffset !== pending.at.offset)) clearPending();
    onSelection();
  });
  // selectionchange arrives a moment late: also note the caret as soon as a key or
  // click has been handled, so a toolbar choice made right after sees the right place.
  for (const type of ["keyup", "pointerup", "input"]) root.addEventListener(type, remember);

  /** Focus the box being edited and put the selection back. Returns the box, or null. */
  function restore() {
    const el = getEditable() ?? onNeedEditor();
    if (!el) return null;
    const sel = getSelection();
    if (document.activeElement === el && sel.rangeCount && el.contains(sel.anchorNode)) return el;
    el.focus({ preventScroll: true });
    if (saved && el.contains(saved.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(saved);
    } else if (!(sel.rangeCount && el.contains(sel.anchorNode))) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return el;
  }

  // The browser has no command for "font size in px" or "any font family", so we ask
  // for a marker value and then rewrite the marked elements to the real value.
  const MARKED = `font[face="${MARK_FONT}"], [style*="${MARK_FONT}"], font[size="7"], [style*="xxx-large"]`;

  // Give an element the chosen font and/or size. Inner elements must not override them.
  function applyChoices(el) {
    let target = el;
    if (el.tagName === "FONT") {
      target = document.createElement("span");
      target.append(...el.childNodes);
      el.replaceWith(target);
    }
    target.removeAttribute("face");
    target.removeAttribute("size");
    const set = (prop, cssName, value) => {
      if (value) target.style[prop] = value;
      else if (/bytecintia|xxx-large/.test(target.style[prop])) target.style.removeProperty(cssName); // stray marker
      if (value) target.querySelectorAll(`[style*="${cssName}"]`).forEach((c) => c.style.removeProperty(cssName));
    };
    set("fontFamily", "font-family", pending.family);
    set("fontSize", "font-size", pending.size && `${pending.size}px`);
  }

  // Rewrite the elements the browser marked for us. Returns whether there were any.
  function convertMarkers() {
    const marked = root.querySelectorAll(MARKED);
    marked.forEach(applyChoices);
    if (marked.length) clearPending();
    return marked.length > 0;
  }

  const caretIsAtPending = () => {
    const sel = getSelection();
    return !!pending.at && sel.isCollapsed && sel.anchorNode === pending.at.node && sel.anchorOffset === pending.at.offset;
  };

  /**
   * Choose a font or size ({ family } or { size }). With text selected it is applied
   * now. With only a caret it is remembered and applied to the next character typed.
   */
  function choose(values) {
    if (!restore()) return;
    const sel = getSelection();
    if (sel.isCollapsed) {
      if (!caretIsAtPending()) clearPending();
      Object.assign(pending, values);
      pending.at = { node: sel.anchorNode, offset: sel.anchorOffset };
      return;
    }
    exec("styleWithCSS", true);
    clearPending();
    Object.assign(pending, values);
    if (values.family) exec("fontName", MARK_FONT);
    if (values.size) exec("fontSize", "7");
    convertMarkers();
    clearPending();
    onChange();
  }

  // The first character typed after choosing a font or size is let through as usual
  // (so bold and the like still apply), then wrapped in a span with the chosen
  // style. The caret is left inside the span, so the browser keeps typing there.
  let armed = null; // { length, family, size } while the first character is being typed

  root.addEventListener("beforeinput", (e) => {
    if (!editableOf(e.target) || e.inputType !== "insertText") return; // formatting commands must not cancel the choice
    armed = null;
    if (!pending.family && !pending.size) return;
    if (e.data && caretIsAtPending()) {
      armed = { length: e.data.length, family: pending.family, size: pending.size };
    }
    clearPending();
  });

  root.addEventListener("input", (e) => {
    if (!armed || !editableOf(e.target)) return;
    const { length, family, size } = armed;
    armed = null;
    const sel = getSelection();
    const node = sel.anchorNode;
    const end = sel.anchorOffset;
    if (!sel.isCollapsed || node?.nodeType !== 3 || end < length) return;
    const range = document.createRange();
    range.setStart(node, end - length);
    range.setEnd(node, end);
    const span = document.createElement("span");
    if (family) span.style.fontFamily = family;
    if (size) span.style.fontSize = `${size}px`;
    range.surroundContents(span);
    const caret = document.createRange();
    caret.selectNodeContents(span);
    caret.collapse(false);
    sel.removeAllRanges();
    sel.addRange(caret);
  });

  function run(fn) {
    if (!restore()) return;
    exec("styleWithCSS", true);
    fn();
    convertMarkers();
    onChange();
  }

  // ---- text formatting ----------------------------------------------------

  const command = (name) => run(() => exec(name));
  const setFont = (family) => choose({ family });
  const setSize = (px) => choose({ size: px });

  function stepSize(direction) {
    if (!restore()) return;
    const current = state()?.size ?? DEFAULT_SIZE;
    const next = direction > 0
      ? SIZES.find((s) => s > current) ?? SIZES.at(-1)
      : [...SIZES].reverse().find((s) => s < current) ?? SIZES[0];
    setSize(next);
  }

  // Tidy up any element the browser marked for us after a keystroke.
  const afterInput = () => {
    if (root.querySelector(MARKED)) convertMarkers();
  };

  // ---- state for the toolbar ---------------------------------------------

  function state() {
    const sel = getSelection();
    if (!editableOf(sel.anchorNode)) return null;
    const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const style = getComputedStyle(node);
    const active = {};
    for (const name of COMMANDS) {
      try { active[name] = document.queryCommandState(name); } catch { active[name] = false; }
    }
    return { active, family: style.fontFamily, size: Math.round(parseFloat(style.fontSize)) };
  }

  // ---- paste --------------------------------------------------------------

  root.addEventListener("paste", (e) => {
    if (!editableOf(e.target)) return;
    e.preventDefault();
    const files = [...(e.clipboardData.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      onImageFiles(files);
      return;
    }
    exec("insertText", e.clipboardData.getData("text/plain")); // plain text only
  });

  return { command, setFont, setSize, stepSize, state, afterInput };
}
