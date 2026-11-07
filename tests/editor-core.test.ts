import test from "node:test";
import assert from "node:assert/strict";
import {
  activeRegions, clampBox, createHistory, DEFAULT_SETTINGS, editHistory, effectiveBox,
  HISTORY_LIMIT, redoHistory, sanitizeSettings, undoHistory, type EditState, type Region,
} from "../lib/editor";
import { safeFilename } from "../lib/render";

const region = (id: string, probability: number | null = 0.9): Region => ({
  id, probability, enabled: true, source: "detected",
  box: { x_min: 10, y_min: 20, x_max: 30, y_max: 40 },
});

test("confidence filtering keeps unknown confidence and manual regions without modifying detections", () => {
  const regions = [region("high", 0.9), region("low", 0.4), region("unknown", null),
    { ...region("manual", 0.1), source: "manual" as const }, { ...region("off"), enabled: false }];
  const state: EditState = { regions, settings: { ...DEFAULT_SETTINGS }, threshold: 0.8 };
  assert.deepEqual(activeRegions(state).map((item) => item.id), ["high", "unknown", "manual"]);
  assert.equal(state.regions.length, 5);
  assert.equal(state.regions[1].probability, 0.4);
});

test("box clipping rejects non-finite, inverted, empty and wholly outside rectangles", () => {
  assert.deepEqual(clampBox({ x_min: -10, y_min: -20, x_max: 80, y_max: 90 }, 60, 70), {
    x_min: 0, y_min: 0, x_max: 60, y_max: 70,
  });
  for (const box of [
    { x_min: NaN, y_min: 0, x_max: 1, y_max: 1 },
    { x_min: 2, y_min: 0, x_max: 1, y_max: 1 },
    { x_min: 0, y_min: 1, x_max: 1, y_max: 1 },
    { x_min: 80, y_min: 0, x_max: 90, y_max: 20 },
  ]) assert.equal(clampBox(box, 60, 70), null);
});

test("scale and per-face geometry use an adjustment while preserving the original box", () => {
  const original = region("one");
  const moved = { ...original, adjustment: { x_min: 40, y_min: 30, x_max: 60, y_max: 50 }, settings: { scale: 2 } };
  const state = createHistory().present;
  assert.deepEqual(effectiveBox(moved, state, 55, 100), { x_min: 30, y_min: 20, x_max: 55, y_max: 60 });
  assert.deepEqual(moved.box, { x_min: 10, y_min: 20, x_max: 30, y_max: 40 });
});

test("undo/redo restores regions and settings, forks history, and isolates images", () => {
  const other = createHistory();
  let history = createHistory(DEFAULT_SETTINGS, [region("one")]);
  history = editHistory(history, { ...history.present, settings: { ...history.present.settings, kind: "mosaic" } });
  history = editHistory(history, { ...history.present, regions: [] });
  history = undoHistory(history);
  assert.equal(history.present.regions[0].id, "one");
  assert.equal(history.present.settings.kind, "mosaic");
  assert.equal(redoHistory(history).present.regions.length, 0);
  history = editHistory(history, { ...history.present, threshold: 0.5 });
  assert.equal(history.future.length, 0);
  assert.equal(other.present.regions.length, 0);
  assert.equal(other.past.length, 0);
  assert.strictEqual(editHistory(history, history.present), history);
});

test("history owns independent snapshots and caps Undo at fifty edits", () => {
  const input = region("one");
  let history = createHistory(DEFAULT_SETTINGS, [input]);
  input.box.x_min = 999;
  assert.equal(history.present.regions[0].box.x_min, 10);
  for (let index = 1; index <= 75; index++) history = editHistory(history, { ...history.present, threshold: index / 100 });
  assert.equal(history.past.length, HISTORY_LIMIT);
  for (let index = 0; index < HISTORY_LIMIT; index++) history = undoHistory(history);
  assert.equal(history.present.threshold, 0.25);
  assert.equal(history.past.length, 0);
});

test("saved settings accept only bounded known fields", () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  const result = sanitizeSettings({ kind: "script", color: "url(secret)", opacity: -10, scale: Infinity, pixelSize: 10000, blurRadius: NaN, image: "secret" });
  assert.equal(result.kind, "solid");
  assert.equal(result.color, "#000000");
  assert.equal(result.opacity, 0);
  assert.equal(result.scale, DEFAULT_SETTINGS.scale);
  assert.equal(result.pixelSize, 80);
  assert.equal(result.blurRadius, DEFAULT_SETTINGS.blurRadius);
  assert.equal("image" in result, false);
});

test("download names remove path/control characters, reserved names and wrong extensions", () => {
  assert.equal(safeFilename("photo.jpeg", "image/png"), "photo.png");
  assert.equal(safeFilename("CON.png", "image/jpeg"), "masked-image.jpg");
  assert.equal(safeFilename("nul.backup.png", "image/png"), "masked-image.png");
  assert.equal(safeFilename(".png", "image/png"), "masked-image.png");
  assert.equal(/[\\/:?*\u0000-\u001f]/.test(safeFilename("../bad:?/\u0000name.png", "image/png")), false);
});
