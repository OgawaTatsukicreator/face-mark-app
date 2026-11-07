import { activeRegions, effectiveBox, sanitizeSettings, type EditState } from "./editor";

export type ImageFormat = "image/png" | "image/jpeg";

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  return { canvas, context };
}

/** Always render from the source pixels, never from a previously masked preview. */
export function renderMaskedCanvas(source: CanvasImageSource, width: number, height: number, state: EditState): HTMLCanvasElement {
  const { canvas, context } = makeCanvas(width, height);
  context.drawImage(source, 0, 0, width, height);
  for (const region of activeRegions(state)) {
    const box = effectiveBox(region, state, width, height);
    if (!box) continue;
    const settings = sanitizeSettings({ ...state.settings, ...region.settings });
    const x = box.x_min;
    const y = box.y_min;
    const w = box.x_max - x;
    const h = box.y_max - y;
    context.save();
    context.beginPath();
    context.rect(x, y, w, h);
    context.clip();
    context.globalAlpha = settings.opacity;
    if (settings.kind === "mosaic") {
      const { canvas: tile, context: tileContext } = makeCanvas(
        Math.max(1, Math.ceil(w / settings.pixelSize)), Math.max(1, Math.ceil(h / settings.pixelSize)),
      );
      tileContext.drawImage(source, x, y, w, h, 0, 0, tile.width, tile.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(tile, 0, 0, tile.width, tile.height, x, y, w, h);
      tile.width = tile.height = 0;
    } else if (settings.kind === "blur") {
      const margin = Math.ceil(settings.blurRadius * 2);
      const left = Math.max(0, x - margin);
      const top = Math.max(0, y - margin);
      const right = Math.min(width, box.x_max + margin);
      const bottom = Math.min(height, box.y_max + margin);
      context.filter = `blur(${settings.blurRadius}px)`;
      context.drawImage(source, left, top, right - left, bottom - top, left, top, right - left, bottom - top);
    } else {
      context.fillStyle = settings.color;
      context.fillRect(x, y, w, h);
      if (settings.kind === "stamp") {
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const radius = Math.min(w, h) * 0.44;
        context.fillStyle = "#ffd166";
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#292524";
        for (const direction of [-1, 1]) {
          context.beginPath();
          context.arc(centerX + direction * radius * 0.32, centerY - radius * 0.2, Math.max(1, radius * 0.08), 0, Math.PI * 2);
          context.fill();
        }
        context.strokeStyle = "#292524";
        context.lineWidth = Math.max(1, radius * 0.08);
        context.beginPath();
        context.arc(centerX, centerY + radius * 0.04, radius * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
        context.stroke();
      }
    }
    context.restore();
  }
  return canvas;
}

export async function canvasBlob(canvas: HTMLCanvasElement, type: ImageFormat = "image/png", quality = 0.92): Promise<Blob> {
  let target = canvas;
  if (type === "image/jpeg") {
    const { canvas: opaque, context } = makeCanvas(canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, opaque.width, opaque.height);
    context.drawImage(canvas, 0, 0);
    target = opaque;
  }
  try {
    return await new Promise<Blob>((resolve, reject) => target.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("IMAGE_ENCODE")),
      type,
      Math.max(0.1, Math.min(1, Number.isFinite(quality) ? quality : 0.92)),
    ));
  } finally {
    if (target !== canvas) target.width = target.height = 0;
  }
}

export function safeFilename(name: string, type: ImageFormat | "image/webp"): string {
  const base = name.replace(/\.[^.]*$/, "").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 100);
  const safe = !base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? "masked-image" : base;
  return `${safe}.${type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png"}`;
}
