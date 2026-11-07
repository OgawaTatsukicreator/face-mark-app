import { MAX_DIMENSION, MAX_FILE_SIZE, MAX_PIXELS, type Region } from "./editor";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PreparedImage = { file: File; url: string; width: number; height: number };

function assertDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
      || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new Error("IMAGE_SIZE");
  }
}

/** Reject oversized encoded dimensions before asking the browser to allocate a bitmap. */
function inspectHeader(bytes: Uint8Array, type: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (type === "image/png") {
    if (bytes.length < 24 || ascii(0, 8) !== "\x89PNG\r\n\x1a\n" || ascii(12, 16) !== "IHDR") throw new Error("IMAGE_DECODE");
    assertDimensions(view.getUint32(16), view.getUint32(20));
    return;
  }
  if (type === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("IMAGE_DECODE");
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) throw new Error("IMAGE_DECODE");
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error("IMAGE_DECODE");
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) throw new Error("IMAGE_DECODE");
        assertDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
        return;
      }
      offset += length;
    }
    throw new Error("IMAGE_DECODE");
  }
  if (bytes.length < 30 || ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") throw new Error("IMAGE_DECODE");
  const chunk = ascii(12, 16);
  if (chunk === "VP8X") {
    const uint24 = (offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    assertDimensions(uint24(24) + 1, uint24(27) + 1);
  } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const packed = view.getUint32(21, true);
    assertDimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
  } else if (chunk === "VP8 " && ascii(23, 26) === "\x9d\x01\x2a") {
    assertDimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  } else {
    throw new Error("IMAGE_DECODE");
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error("FILE_TYPE");
  if (!file.size || file.size > MAX_FILE_SIZE) throw new Error("FILE_SIZE");
  inspectHeader(new Uint8Array(await file.arrayBuffer()), file.type);
  const originalUrl = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = originalUrl;
    try {
      await image.decode();
    } catch {
      throw new Error("IMAGE_DECODE");
    }
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    assertDimensions(width, height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    // Browser decoding applies EXIF orientation; encoding only these pixels drops original metadata.
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("IMAGE_ENCODE")), file.type, 0.95,
    ));
    if (!blob.size || blob.size > MAX_FILE_SIZE) throw new Error("FILE_SIZE");
    if (!ACCEPTED_TYPES.includes(blob.type)) throw new Error("IMAGE_ENCODE");
    const canonical = new File([blob], file.name, { type: blob.type, lastModified: file.lastModified });
    return { file: canonical, url: URL.createObjectURL(canonical), width, height };
  } finally {
    URL.revokeObjectURL(originalUrl);
    image.src = "";
    canvas.width = canvas.height = 0;
  }
}

/** Local, invented figures with demo rectangles; no photographs or detection service. */
export async function createSample(): Promise<{ file: File; regions: Region[] }> {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  try {
    context.fillStyle = "#e7f0ed";
    context.fillRect(0, 0, 960, 640);
    context.fillStyle = "#c4d9cf";
    context.beginPath();
    context.arc(790, 100, 180, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#d1e1dc";
    context.fillRect(0, 440, 960, 200);
    const regions: Region[] = [];
    const colors = ["#395b64", "#91674b", "#686494"];
    for (let index = 0; index < 3; index++) {
      const x = 220 + index * 260;
      const y = 250 + [10, -15, 20][index];
      context.fillStyle = colors[index];
      context.beginPath();
      context.ellipse(x, 490, 108, 145, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ecc5a6";
      context.beginPath();
      context.ellipse(x, y, 75, 92, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#413a34";
      context.beginPath();
      context.ellipse(x, y - 60, 75, 38, 0, Math.PI, Math.PI * 2);
      context.fill();
      for (const direction of [-1, 1]) {
        context.beginPath();
        context.arc(x + direction * 25, y - 4, 7, 0, Math.PI * 2);
        context.fill();
      }
      context.strokeStyle = "#9b5d4b";
      context.lineWidth = 6;
      context.beginPath();
      context.arc(x, y + 13, 30, 0.15 * Math.PI, 0.85 * Math.PI);
      context.stroke();
      regions.push({
        id: `demo-${index + 1}`, box: { x_min: x - 80, y_min: y - 100, x_max: x + 80, y_max: y + 100 },
        probability: null, enabled: true, source: "detected",
      });
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("IMAGE_ENCODE")), "image/png",
    ));
    return { file: new File([blob], "sample.png", { type: "image/png" }), regions };
  } finally {
    canvas.width = canvas.height = 0;
  }
}
