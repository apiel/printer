// The document is saved in the browser so it is still there at next start.
//
// doc  = { presetId, minLength, pages: [{ items: [item, ...] }] }
//        (minLength: a roll's minimum length, in dots)
// item = { id, type: "text" | "image", x, y, ... }   (x, y in dots from the page's top left)
//   text:  w (width), h (minimum height), html (the rich text)
//   image: w, h (size before rotation), angle (degrees), orig (original picture),
//          src (the baked black and white picture), bw, bh (size of src)

import { newId } from "./units.js";

const KEY = "bytecintia.doc.v3";
const V2_KEY = "bytecintia.doc.v2"; // one rich-text page
const V1_KEY = "bytecintia.doc"; // free-placed items

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

export function loadDoc() {
  const doc = read(KEY);
  if (doc && Array.isArray(doc.pages)) return doc;

  const v2 = read(V2_KEY);
  if (v2 && typeof v2.html === "string") return fromHtml(v2.presetId, v2.html, v2.minLength);

  const v1 = read(V1_KEY);
  if (v1 && Array.isArray(v1.pages)) {
    const m = migrateV1(v1);
    return fromHtml(m.presetId, m.html, m.minLength);
  }
  return null;
}

export function saveDoc(doc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

// Older documents become one text box. Its width is 0, which means "fill the page":
// the app sets it once the page size is known.
function fromHtml(presetId, html, minLength) {
  return {
    presetId,
    minLength: minLength ?? 112,
    pages: [{ items: [{ id: newId(), type: "text", x: 0, y: 0, w: 0, h: 0, html: stripTables(html) || "<div><br></div>" }] }],
  };
}

// Tables are gone: keep their text, one line per row.
function stripTables(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  root.querySelectorAll("table").forEach((table) => {
    const rows = document.createDocumentFragment();
    table.querySelectorAll("tr").forEach((tr) => {
      const div = document.createElement("div");
      div.textContent = [...tr.cells].map((c) => c.textContent.trim()).join("  |  ");
      rows.append(div);
    });
    table.replaceWith(rows);
  });
  return root.innerHTML;
}

// Version 1 placed text and images freely on pages. Lay them out top to bottom as
// ordinary content (positions are lost, lines are dropped).
function migrateV1(old) {
  const root = document.createElement("div");
  for (const page of old.pages) {
    const items = [...(page.items ?? [])].sort((a, b) => a.y - b.y);
    let list = null;
    for (const item of items) {
      if (item.type === "image") {
        list = null;
        const wrap = document.createElement("div");
        wrap.style.textAlign = "center";
        const img = document.createElement("img");
        img.src = item.src;
        img.style.width = `${item.w}px`;
        wrap.append(img);
        root.append(wrap);
      } else if (item.type === "text") {
        const blocks = item.blocks ?? [{ text: item.text ?? "", size: item.size, bold: item.bold, align: item.align }];
        for (const b of blocks) {
          const tag = b.list === "number" ? "ol" : "ul";
          let target;
          if (b.list) {
            if (!list || list.tagName.toLowerCase() !== tag) {
              list = document.createElement(tag);
              root.append(list);
            }
            target = document.createElement("li");
            list.append(target);
          } else {
            list = null;
            target = document.createElement("div");
            root.append(target);
          }
          target.style.fontSize = `${b.size || 26}px`;
          if (b.bold) target.style.fontWeight = "bold";
          target.style.textAlign = ["left", "center", "right"][b.align ?? 0];
          target.textContent = b.text || "";
          if (!b.text) target.innerHTML = "<br>";
        }
      }
    }
  }
  return { presetId: old.presetId, html: root.innerHTML, minLength: old.pages[0]?.minLength ?? 112 };
}
