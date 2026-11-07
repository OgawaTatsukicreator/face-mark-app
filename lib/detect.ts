import sharp from "sharp";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
const MAX_PIXELS = 24_000_000;
const MAX_DIMENSION = 8192;
const MAX_UPSTREAM_BYTES = 1024 * 1024;
const MIME_FORMATS = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;

type ErrorCode = "INVALID_REQUEST" | "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE" | "INVALID_IMAGE" | "IMAGE_TOO_LARGE" | "NOT_CONFIGURED" | "UPSTREAM_ERROR" | "INVALID_RESPONSE" | "TIMEOUT" | "ABORTED";
const messages: Record<ErrorCode, string> = {
  INVALID_REQUEST: "画像ファイルを1枚選択して、もう一度お試しください。",
  FILE_TOO_LARGE: "画像は10MB以下にしてください。",
  UNSUPPORTED_TYPE: "JPEG・PNG・WebPの画像を選択してください。",
  INVALID_IMAGE: "画像を読み込めません。別の画像を選択してください。",
  IMAGE_TOO_LARGE: "画像は各辺8192px以下・2400万画素以下にしてください。",
  NOT_CONFIGURED: "顔検出の接続設定がありません。手動で範囲を追加できます。",
  UPSTREAM_ERROR: "顔検出に接続できません。再試行するか、手動で範囲を追加してください。",
  INVALID_RESPONSE: "顔検出の応答を読み込めません。再試行するか、手動で範囲を追加してください。",
  TIMEOUT: "顔検出が時間内に完了しませんでした。再試行してください。",
  ABORTED: "顔検出を中止しました。",
};

function failure(code: ErrorCode, status: number) {
  return json({ code, error: messages[code] }, status);
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

class BodyLimitError extends Error {}

async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new BodyLimitError();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, total);
  } finally {
    reader.releaseLock();
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeResult(value: unknown, width: number, height: number) {
  if (!record(value) || !Array.isArray(value.result) || value.result.length > 500) throw new Error("schema");
  return value.result.map((item: unknown) => {
    if (!record(item) || !record(item.box)) throw new Error("schema");
    const box = item.box;
    const { x_min, y_min, x_max, y_max } = box;
    if (![x_min, y_min, x_max, y_max].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) throw new Error("schema");
    const x1 = x_min as number;
    const y1 = y_min as number;
    const x2 = x_max as number;
    const y2 = y_max as number;
    if (x2 <= x1 || y2 <= y1) throw new Error("schema");
    // Allow only a one-pixel boundary rounding discrepancy, never arbitrary overflow.
    if (x1 < -1 || y1 < -1 || x2 > width + 1 || y2 > height + 1) throw new Error("schema");
    const clipped = { x_min: Math.max(0, x1), y_min: Math.max(0, y1), x_max: Math.min(width, x2), y_max: Math.min(height, y2) };
    if (clipped.x_max <= clipped.x_min || clipped.y_max <= clipped.y_min) throw new Error("schema");
    const probability = box.probability == null ? null : box.probability;
    if (probability !== null && (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1)) throw new Error("schema");
    return { box: { ...clipped, probability } };
  });
}

export type DetectDependencies = { fetchImpl?: typeof fetch; timeoutMs?: number };

/** Server-only API boundary. Dependencies allow deterministic tests without real credentials. */
export async function handleDetect(request: Request, dependencies: DetectDependencies = {}): Promise<Response> {
  if (request.signal.aborted) return failure("ABORTED", 499);
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) return failure("FILE_TOO_LARGE", 413);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) return failure("INVALID_REQUEST", 400);
  let form: FormData;
  try {
    // Bound the actual stream too: Content-Length may be absent or dishonest.
    const bytes = await readBounded(request.body, MAX_BODY_BYTES);
    if (request.signal.aborted) return failure("ABORTED", 499);
    form = await new Response(new Uint8Array(bytes), { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    if (request.signal.aborted) return failure("ABORTED", 499);
    return error instanceof BodyLimitError ? failure("FILE_TOO_LARGE", 413) : failure("INVALID_REQUEST", 400);
  }
  const files = form.getAll("file");
  const file = files[0];
  if (files.length !== 1 || !(file instanceof Blob) || file.size === 0) return failure("INVALID_REQUEST", 400);
  if (file.size > MAX_FILE_BYTES) return failure("FILE_TOO_LARGE", 413);
  if (!Object.hasOwn(MIME_FORMATS, file.type)) return failure("UNSUPPORTED_TYPE", 415);
  const expectedFormat = MIME_FORMATS[file.type as keyof typeof MIME_FORMATS];

  let normalized: Buffer;
  let width: number;
  let height: number;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    // metadata() does not decode pixels. Inspect dimensions before the bounded full decode.
    const metadata = await sharp(input, { limitInputPixels: false }).metadata();
    if (metadata.format !== expectedFormat) return failure("UNSUPPORTED_TYPE", 415);
    if (!metadata.width || !metadata.height) return failure("INVALID_IMAGE", 400);
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION || metadata.width * metadata.height > MAX_PIXELS) return failure("IMAGE_TOO_LARGE", 413);
    if ((metadata.pages ?? 1) > 1) return failure("INVALID_IMAGE", 400);
    // Fully decode, apply EXIF orientation, and strip metadata before sending upstream.
    const decoded = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "warning" })
      .rotate().toFormat(expectedFormat).toBuffer({ resolveWithObject: true });
    normalized = decoded.data;
    width = decoded.info.width;
    height = decoded.info.height;
    if (normalized.byteLength > MAX_FILE_BYTES) return failure("FILE_TOO_LARGE", 413);
  } catch {
    return failure("INVALID_IMAGE", 400);
  }
  if (request.signal.aborted) return failure("ABORTED", 499);

  const apiKey = process.env.FACE_API_KEY;
  let apiUrl: URL;
  try {
    apiUrl = new URL(process.env.FACE_API_URL ?? "");
    if (!apiKey || !["http:", "https:"].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password) return failure("NOT_CONFIGURED", 500);
  } catch {
    return failure("NOT_CONFIGURED", 500);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, dependencies.timeoutMs ?? 10_000);
  try {
    const outbound = new FormData();
    outbound.append("file", new Blob([new Uint8Array(normalized)], { type: file.type }), `upload.${expectedFormat === "jpeg" ? "jpg" : expectedFormat}`);
    const response = await (dependencies.fetchImpl ?? fetch)(apiUrl, {
      method: "POST", headers: { "x-api-key": apiKey }, body: outbound,
      signal: controller.signal, cache: "no-store", redirect: "error",
    });
    let data: unknown;
    try {
      data = JSON.parse((await readBounded(response.body, MAX_UPSTREAM_BYTES)).toString("utf8"));
    } catch (error) {
      if (controller.signal.aborted) throw error;
      return failure(response.ok ? "INVALID_RESPONSE" : "UPSTREAM_ERROR", 502);
    }
    if (request.signal.aborted) return failure("ABORTED", 499);
    if (timedOut) return failure("TIMEOUT", 504);
    // CompreFace CommonExceptionCode: NO_FACES_FOUND(28, BAD_REQUEST).
    // https://github.com/exadel-inc/CompreFace/blob/master/java/common/src/main/java/com/exadel/frs/commonservice/handler/CommonExceptionCode.java
    if (response.status === 400 && record(data) && data.code === 28) return json({ result: [] });
    if (!response.ok) return failure("UPSTREAM_ERROR", 502);
    try {
      return json({ result: normalizeResult(data, width, height) });
    } catch {
      return failure("INVALID_RESPONSE", 502);
    }
  } catch {
    if (request.signal.aborted) return failure("ABORTED", 499);
    return timedOut ? failure("TIMEOUT", 504) : failure("UPSTREAM_ERROR", 502);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
  }
}
