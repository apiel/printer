// Everything in the editor is measured in printer dots: 8 dots per mm (203 dpi),
// the standard for thermal receipt printers. A 48 mm print area is 384 dots.
export const DOTS_PER_MM = 8;
export const mmToDots = (mm) => Math.round(mm * DOTS_PER_MM);
export const dotsToMm = (dots) => dots / DOTS_PER_MM;

// A roll (endless page) starts this short and grows as content is added.
export const ROLL_MIN_MM = 14;

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
