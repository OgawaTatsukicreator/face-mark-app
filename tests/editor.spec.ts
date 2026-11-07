import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const PREFERENCES_KEY = "face-mask-preferences-v1";
const defaults = { kind: "solid", color: "#000000", opacity: 1, scale: 1.15, pixelSize: 14, blurRadius: 12 };
const detectorResult = { result: [
  { box: { x_min: 20, y_min: 20, x_max: 80, y_max: 80, probability: 0.95 } },
  { box: { x_min: 90, y_min: 20, x_max: 150, y_max: 80, probability: 0.4 } },
] };

declare global {
  interface Window {
    __clipboardReject: boolean;
    __clipboardTypes: string[];
    __cameraRequests: number;
    __cameraStops: number;
    __resolveCamera?: () => void;
    __cameraReject: boolean;
  }
}

async function generatedImage(name = "portrait.png", transparent = false) {
  const buffer = await sharp({ create: {
    width: 180, height: 120, channels: 4,
    background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 237, g: 182, b: 99, alpha: 1 },
  } }).png().toBuffer();
  return { name, mimeType: "image/png", buffer };
}

async function addSample(page: Page) {
  await page.getByRole("button", { name: "Try the sample", exact: true }).click();
  await expect(page.getByTestId("masked-canvas")).toBeVisible();
  await expect(page.getByTestId("face-count")).toContainText(/Detected.*3|検出.*3/);
  await expect.poll(() => page.getByTestId("masked-canvas").evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(960);
}

async function upload(page: Page, count = 1) {
  const file = await generatedImage();
  await page.getByTestId("file-input").setInputFiles(
    Array.from({ length: count }, (_, index) => ({ ...file, name: `portrait-${index + 1}.png` })),
  );
  await expect(page.getByTestId("history-card")).toHaveCount(count);
  await expect(page.getByTestId("masked-canvas")).toBeVisible();
}

async function canvasPixels(page: Page, points: [number, number][]) {
  return page.getByTestId("masked-canvas").evaluate((canvas: HTMLCanvasElement, samplePoints) => {
    const context = canvas.getContext("2d")!;
    return samplePoints.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
  }, points);
}

async function canvasHash(page: Page) {
  return page.getByTestId("masked-canvas").evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

async function expectApplied(page: Page, count: number) {
  await expect(page.getByTestId("face-count")).toContainText(new RegExp(`(?:Masked|適用):?\\s*${count}(?:\\D|$)`));
}

async function exportImage(page: Page, type: "image/png" | "image/jpeg") {
  await page.getByTestId("output-format").selectOption(type);
  const download = page.waitForEvent("download");
  await page.getByTestId("download").click();
  const result = await download;
  const path = await result.path();
  expect(path).not.toBeNull();
  return { name: result.suggestedFilename(), buffer: await readFile(path!) };
}

async function decodedExport(page: Page, buffer: Buffer) {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const current = document.querySelector<HTMLCanvasElement>('[data-testid="masked-canvas"]')!;
    const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const expected = current.getContext("2d")!.getImageData(0, 0, current.width, current.height).data;
    return {
      width: canvas.width, height: canvas.height,
      samePixels: actual.length === expected.length && actual.every((value, index) => value === expected[index]),
      corner: Array.from(context.getImageData(0, 0, 1, 1).data),
    };
  }, buffer.toString("base64"));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, settings }) => {
    try {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
        version: 1, language: "en", theme: "light", settings, guideSeen: true,
      }));
    } catch { /* The storage-denied test deliberately disables access. */ }
  }, { key: PREFERENCES_KEY, settings: defaults });
  // An accidental test request must never reach the configured external service.
  await page.route("**/api/detect", (route) => route.fulfill({ json: { result: [] } }));
  await page.goto("/");
  await expect(page.getByTestId("language")).toHaveValue("en");
});

test("sample stays local and all four masks render on every demo face", async ({ page }, testInfo) => {
  let requests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/detect")) requests++; });
  await addSample(page);
  await expectApplied(page, 3);
  await expect.poll(() => canvasPixels(page, [[220, 260], [480, 235], [740, 270]])).toEqual([
    [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255],
  ]);
  const outside = (await canvasPixels(page, [[5, 5]]))[0];
  const hashes = new Set<string>([await canvasHash(page)]);
  for (const kind of ["mosaic", "blur", "stamp"]) {
    const previous = await canvasHash(page);
    await page.getByTestId("mask-kind").selectOption(kind);
    await expect.poll(() => canvasHash(page)).not.toBe(previous);
    hashes.add(await canvasHash(page));
    expect((await canvasPixels(page, [[5, 5]]))[0]).toEqual(outside);
  }
  expect(hashes.size).toBe(4);
  expect(requests).toBe(0);
  if (process.env.FACE_MASK_SCREENSHOT_DIR) {
    await page.getByTestId("mask-kind").selectOption("solid");
    await expect.poll(() => canvasPixels(page, [[220, 260]])).toEqual([[0, 0, 0, 255]]);
    await page.getByTestId("viewport").scrollIntoViewIfNeeded();
    await mkdir(process.env.FACE_MASK_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.FACE_MASK_SCREENSHOT_DIR, `${testInfo.project.name}.png`), scale: "css" });
  }
});

test("face toggles and confidence filter preserve unknown confidence", async ({ page }) => {
  await page.route("**/api/detect", (route) => route.fulfill({ json: { result: [
    ...detectorResult.result,
    { box: { x_min: 20, y_min: 85, x_max: 60, y_max: 115, probability: null } },
  ] } }));
  await upload(page);
  await page.getByTestId("detect-all").click();
  await expectApplied(page, 3);
  await page.getByTestId("threshold").fill("0.8");
  await expectApplied(page, 2);
  await page.getByRole("checkbox", { name: "Mask region 1", exact: true }).uncheck();
  await expectApplied(page, 1);
  await expect(page.getByTestId("face-count")).toContainText("Detected: 3");
  await page.getByTestId("undo").click();
  await expectApplied(page, 2);
});

test("a per-face opacity adjustment keeps inheriting untouched image defaults", async ({ page }) => {
  await addSample(page);
  await page.getByTestId("face-select-1").click();
  await page.getByText("Adjust color, strength and position", { exact: true }).click();
  await page.getByRole("slider", { name: /^Opacity/ }).fill("0.5");
  await page.getByRole("combobox", { name: "Settings target", exact: true }).selectOption("");
  await page.getByTestId("mask-kind").selectOption("mosaic");
  await page.getByTestId("face-select-1").click();
  await expect(page.getByTestId("mask-kind")).toHaveValue("mosaic");
  await expect(page.getByRole("slider", { name: /^Opacity/ })).toHaveValue("0.5");
  await page.getByTestId("face-select-2").click();
  await expect(page.getByTestId("mask-kind")).toHaveValue("mosaic");
  await expect(page.getByRole("slider", { name: /^Opacity/ })).toHaveValue("1");
});

test("manual rectangles keep image coordinates after zoom and pan and deletion is undoable", async ({ page }) => {
  await addSample(page);
  await page.getByTestId("zoom").fill("2");
  await page.getByTestId("pan-mode").click();
  await page.getByTestId("viewport").scrollIntoViewIfNeeded();
  const viewport = await page.getByTestId("viewport").boundingBox();
  expect(viewport).not.toBeNull();
  await page.mouse.move(viewport!.x + viewport!.width / 2, viewport!.y + viewport!.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport!.x + viewport!.width / 2 + 18, viewport!.y + viewport!.height / 2 + 12, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId("manual-add-mode").click();
  await page.getByTestId("viewport").scrollIntoViewIfNeeded();
  const surface = await page.getByTestId("image-surface").boundingBox();
  expect(surface).not.toBeNull();
  const x1 = surface!.x + surface!.width * 0.46;
  const y1 = surface!.y + surface!.height * 0.46;
  const x2 = surface!.x + surface!.width * 0.54;
  const y2 = surface!.y + surface!.height * 0.54;
  await page.mouse.move(x2, y2);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("face-count")).toContainText("Manual: 1");
  const rectangle = page.getByTestId("region-overlay").getByRole("button").last();
  const geometry = await rectangle.evaluate((element) => ({
    x: Number(element.getAttribute("x")), y: Number(element.getAttribute("y")),
    width: Number(element.getAttribute("width")), height: Number(element.getAttribute("height")),
  }));
  expect(Math.abs(geometry.x + geometry.width / 2 - 480)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.y + geometry.height / 2 - 320)).toBeLessThanOrEqual(1);
  await page.getByTestId("delete-region").click();
  await expect(page.getByTestId("face-count")).toContainText("Manual: 0");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("face-count")).toContainText("Manual: 1");
  await page.getByTestId("reset-view").click();
  await expect(page.getByTestId("zoom")).toHaveValue("1");
});

test("Undo/Redo branches and each session image retains its own edit history", async ({ page }) => {
  await addSample(page);
  await page.getByTestId("mask-kind").selectOption("mosaic");
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("mask-kind")).toHaveValue("solid");
  await page.getByTestId("redo").click();
  await expect(page.getByTestId("mask-kind")).toHaveValue("mosaic");
  await page.getByTestId("undo").click();
  await page.getByTestId("mask-kind").selectOption("blur");
  await expect(page.getByTestId("redo")).toBeDisabled();
  await page.getByRole("checkbox", { name: "Mask region 1", exact: true }).uncheck();
  await expectApplied(page, 2);
  await addSample(page);
  await expect(page.getByTestId("history-card")).toHaveCount(2);
  await expectApplied(page, 3);
  await page.getByTestId("history-card").first().getByRole("button").first().click();
  await expectApplied(page, 2);
  await expect(page.getByTestId("mask-kind")).toHaveValue("blur");
  await page.getByTestId("undo").click();
  await expectApplied(page, 3);
});

test("PNG export excludes comparison, bounds and zoom; names and JPEG output are correct", async ({ page }) => {
  await addSample(page);
  await page.getByTestId("filename").fill("photos:masked?.jpeg");
  await page.getByTestId("show-bounds").check();
  await page.getByRole("checkbox", { name: "Compare before and after", exact: true }).check();
  await page.getByTestId("comparison").fill("100");
  await page.getByTestId("zoom").fill("1.8");
  const png = await exportImage(page, "image/png");
  expect(png.name).toBe("photos_masked_.png");
  expect(png.buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(await decodedExport(page, png.buffer)).toMatchObject({ width: 960, height: 640, samePixels: true });
  await page.getByTestId("output-format").selectOption("image/jpeg");
  await page.getByTestId("jpeg-quality").fill("0.7");
  const jpeg = await exportImage(page, "image/jpeg");
  expect(jpeg.name).toBe("photos_masked_.jpg");
  expect(jpeg.buffer.subarray(0, 2)).toEqual(Buffer.from([255, 216]));
  const metadata = await sharp(jpeg.buffer).metadata();
  expect(metadata).toMatchObject({ width: 960, height: 640, format: "jpeg" });
  expect(metadata.exif).toBeUndefined();
});

test("JPEG flattens transparent source pixels onto white", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles(await generatedImage("transparent.png", true));
  await expect(page.getByTestId("history-card")).toHaveCount(1);
  const jpeg = await exportImage(page, "image/jpeg");
  const { data } = await sharp(jpeg.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(Array.from(data.subarray(0, 3))).toEqual([255, 255, 255]);
});

test("batch detection runs sequentially, keeps mixed outcomes, and reports progress", async ({ page }) => {
  let requests = 0;
  let inFlight = 0;
  let maximum = 0;
  await page.route("**/api/detect", async (route) => {
    const index = requests++;
    maximum = Math.max(maximum, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, 120));
    inFlight--;
    await route.fulfill(index === 1
      ? { status: 502, json: { code: "UPSTREAM_ERROR" } }
      : { json: index === 0 ? detectorResult : { result: [] } });
  });
  await upload(page, 3);
  expect(requests).toBe(0);
  await page.getByTestId("detect-all").click();
  await expect(page.getByTestId("stop-detection")).toBeVisible();
  await expect(page.getByTestId("stop-detection")).toBeHidden();
  expect(requests).toBe(3);
  expect(maximum).toBe(1);
  await expect(page.getByTestId("history-card").nth(0)).toContainText(/Ready to edit|検出済|完了/i);
  await expect(page.getByTestId("history-card").nth(1)).toContainText(/error|failed|失敗/i);
  await page.getByTestId("history-card").nth(2).getByRole("button").first().click();
  await expect(page.getByText(/No faces were found|No faces found|顔が見つかりません/)).toBeVisible();
  await page.getByTestId("add-center-region").click();
  await expect(page.getByTestId("face-count")).toContainText("Manual: 1");
});

test("cancelled detection cannot apply a late response or start remaining files", async ({ page }) => {
  let release: (() => void) | undefined;
  let requests = 0;
  await page.route("**/api/detect", async (route) => {
    requests++;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: detectorResult }).catch(() => {});
  });
  await upload(page, 2);
  await page.getByTestId("detect-all").click();
  await expect.poll(() => requests).toBe(1);
  await page.getByTestId("stop-detection").click();
  release?.();
  await expect(page.getByRole("status").filter({ hasText: /Detection stopped/ })).toBeVisible();
  await expect(page.getByTestId("face-count")).toContainText("Detected: 0");
  await page.getByTestId("history-card").first().getByRole("button").first().click();
  await expect(page.getByTestId("face-count")).toContainText("Detected: 0");
  expect(requests).toBe(1);
});

test("invalid and corrupt inputs are isolated, identical files can be selected again, and limit is ten", async ({ page }) => {
  const valid = await generatedImage();
  await page.getByTestId("file-input").setInputFiles([
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") },
    valid,
    { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("invalid PNG") },
  ]);
  await expect(page.getByTestId("history-card")).toHaveCount(1);
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveCount(2);
  await page.getByTestId("file-input").setInputFiles(valid);
  await expect(page.getByTestId("history-card")).toHaveCount(2);
  await page.getByTestId("file-input").setInputFiles(Array.from({ length: 10 }, (_, index) => ({ ...valid, name: `extra-${index}.png` })));
  await expect(page.getByTestId("history-card")).toHaveCount(10);
  await expect(page.getByRole("alert").filter({ hasText: /up to 10 images|最大10枚/ })).toBeVisible();
});

test("image paste is accepted while text-field paste stays untouched and denial has a fallback", async ({ page }) => {
  const image = await generatedImage();
  const payload = image.buffer.toString("base64");
  expect(await page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "pasted.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  }, payload)).toBe(true);
  await expect(page.getByTestId("history-card")).toHaveCount(1);
  expect(await page.getByTestId("filename").evaluate(async (input, base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "pasted.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  }, payload)).toBe(false);
  await expect(page.getByTestId("history-card")).toHaveCount(1);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    read: async () => { throw new DOMException("Denied", "NotAllowedError"); },
  } }));
  await page.getByRole("button", { name: "Paste image", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /clipboard could not be read/i })).toBeVisible();
});

test("clipboard output writes a masked PNG and handles permission rejection", async ({ page }) => {
  await page.evaluate(() => {
    window.__clipboardReject = false;
    window.__clipboardTypes = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      write: async (items: ClipboardItem[]) => {
        if (window.__clipboardReject) throw new DOMException("Denied", "NotAllowedError");
        const blob = await items[0].getType("image/png");
        window.__clipboardTypes.push(blob.type);
      },
    } });
  });
  await addSample(page);
  await page.getByTestId("copy-image").click();
  await expect.poll(() => page.evaluate(() => window.__clipboardTypes)).toEqual(["image/png"]);
  await expect(page.getByRole("status").filter({ hasText: /copied/i })).toBeVisible();
  await page.evaluate(() => { window.__clipboardReject = true; });
  await page.getByTestId("copy-image").click();
  await expect(page.getByRole("status").filter({ hasText: /download/i })).toBeVisible();
});

test("camera permission is explicit, late permission is stopped, and rejection is recoverable", async ({ page }) => {
  await page.evaluate(() => {
    window.__cameraRequests = 0;
    window.__cameraStops = 0;
    window.__cameraReject = false;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: () => {
      window.__cameraRequests++;
      if (window.__cameraReject) return Promise.reject(new DOMException("Denied", "NotAllowedError"));
      return new Promise<MediaStream>((resolve) => {
        window.__resolveCamera = () => {
          const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
          canvas.getContext("2d")!.fillRect(0, 0, 320, 240);
          const stream = canvas.captureStream();
          for (const track of stream.getTracks()) {
            const original = track.stop.bind(track);
            track.stop = () => { window.__cameraStops++; original(); };
          }
          resolve(stream);
        };
      });
    } });
  });
  expect(await page.evaluate(() => window.__cameraRequests)).toBe(0);
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__cameraRequests)).toBe(1);
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await page.evaluate(() => window.__resolveCamera?.());
  await expect.poll(() => page.evaluate(() => window.__cameraStops)).toBe(1);
  await expect(page.getByRole("region", { name: "Camera capture" })).toBeHidden();
  await page.evaluate(() => { window.__cameraReject = true; });
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Camera access was not allowed/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Choose images/i })).toBeEnabled();
});

test("virtual camera capture adds an image and stops its track", async ({ page }) => {
  await page.evaluate(() => {
    window.__cameraStops = 0;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#448877"; context.fillRect(0, 0, 320, 240);
      const stream = canvas.captureStream(10);
      const timer = setInterval(() => context.fillRect(0, 0, 320, 240), 80);
      for (const track of stream.getTracks()) {
        const original = track.stop.bind(track);
        track.stop = () => { window.__cameraStops++; clearInterval(timer); original(); };
      }
      return stream;
    } });
  });
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Capture and add", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Capture and add", exact: true }).click();
  await expect(page.getByTestId("history-card")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__cameraStops)).toBe(1);
  await expect(page.getByRole("region", { name: "Camera capture" })).toBeHidden();
});

test("language, theme and defaults persist without retaining image or edit data", async ({ page }) => {
  await addSample(page);
  await page.getByTestId("mask-kind").selectOption("mosaic");
  await page.getByRole("button", { name: "Remember these mask defaults", exact: true }).click();
  await page.getByTestId("theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("language").selectOption("ja");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PREFERENCES_KEY);
  expect(Object.keys(stored).sort()).toEqual(["guideSeen", "language", "settings", "theme", "version"]);
  expect(stored.settings.kind).toBe("mosaic");
  expect(JSON.stringify(stored)).not.toMatch(/sample\.png|x_min|blob:|FACE_API/);
  await page.reload();
  await expect(page.getByTestId("language")).toHaveValue("ja");
  await expect(page.getByTestId("theme")).toHaveValue("dark");
  await expect(page.getByTestId("history-card")).toHaveCount(0);
  await page.getByTestId("language").selectOption("en");
  await addSample(page);
  await expect(page.getByTestId("mask-kind")).toHaveValue("mosaic");
});

test("corrupt or denied preference storage does not stop editing", async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, "{broken-json"), PREFERENCES_KEY);
  await page.reload();
  await expect(page.getByTestId("language")).toHaveValue("ja");
  await expect(page.getByRole("heading", { name: "使い方", exact: true })).toBeVisible();
  await page.getByTestId("language").selectOption("en");
  await addSample(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Denied", "SecurityError"); };
  });
  await page.getByTestId("theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("mask-kind").selectOption("stamp");
  await expectApplied(page, 3);
});

test("system theme follows OS and the workspace fits a phone viewport", async ({ page }) => {
  await page.getByTestId("theme").selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.setViewportSize({ width: 390, height: 844 });
  await addSample(page);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
  await expect(page.getByTestId("download")).toBeVisible();
});
