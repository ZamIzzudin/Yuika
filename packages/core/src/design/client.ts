// @yuika/core, D102/D103: barrel design CLIENT-SAFE (tanpa store/node:fs).
// Dipakai bundler web untuk nilai (FONT_BANK, ICON_CATEGORIES); barrel
// ./design tetap untuk server (model + store).
export * from "./model.js";
export * from "./fonts.js";
export * from "./icons.js";
