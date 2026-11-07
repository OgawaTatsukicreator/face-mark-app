import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { handleDetect } from "../lib/detect";

const originalUrl = process.env.FACE_API_URL;
const originalKey = process.env.FACE_API_KEY;
const TEST_URL = "https://detect.example.test/api/detect";
const TEST_KEY = "test-only-key-do-not-use";
before(() => { process.env.FACE_API_URL = TEST_URL; process.env.FACE_API_KEY = TEST_KEY; });
after(() => {
  if (originalUrl === undefined) delete process.env.FACE_API_URL; else process.env.FACE_API_URL = originalUrl;
  if (originalKey === undefined) delete process.env.FACE_API_KEY; else process.env.FACE_API_KEY = originalKey;
});

async function fixture(format: "jpeg" | "png" | "webp" = "png", width = 64, height = 48) {
  return sharp({ create: { width, height, channels: 3, background: "#55aabb" } }).toFormat(format).toBuffer();
}

function request(file: Uint8Array | null, mime = "image/png", signal?: AbortSignal) {
  const form = new FormData();
  if (file) form.append("file", new Blob([new Uint8Array(file)], { type: mime }), "private-filename.png");
  return new Request("http://localhost/api/detect", { method: "POST", body: form, signal });
}

const face = (probability?: number | null) => ({ box: { x_min: 5, y_min: 6, x_max: 30, y_max: 35, ...(probability === undefined ? {} : { probability }) } });
function upstream(body: unknown = { result: [face(0.95)] }, status = 200): typeof fetch {
  return async () => Response.json(body, { status });
}
async function code(response: Response, expected: string, status: number) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.code, expected);
  assert.equal(typeof body.error, "string");
  assert.ok(!JSON.stringify(body).includes(TEST_KEY));
  assert.ok(!JSON.stringify(body).includes(TEST_URL));
}

test("JPEG, PNG and WebP fully decode and forward only a canonical image and server key", async (t) => {
  for (const format of ["jpeg", "png", "webp"] as const) await t.test(format, async () => {
    let calls = 0;
    const response = await handleDetect(request(await fixture(format), `image/${format}`), { fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(String(url), TEST_URL);
      assert.equal(new Headers(init?.headers).get("x-api-key"), TEST_KEY);
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      const forwarded = (init?.body as FormData).get("file") as File;
      assert.match(forwarded.name, /^upload\./);
      const metadata = await sharp(Buffer.from(await forwarded.arrayBuffer())).metadata();
      assert.equal(metadata.format, format);
      assert.equal(metadata.width, 64);
      assert.equal(metadata.height, 48);
      assert.equal(metadata.exif, undefined);
      return Response.json({ result: [face(0.95), face()], provider_secret: TEST_KEY });
    } });
    assert.equal(calls, 1);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { result: [face(0.95), face(null)] });
  });
});

test("no-face success and CompreFace numeric code28 are distinguished from other provider failures", async () => {
  const image = await fixture();
  for (const fetchImpl of [upstream({ result: [] }), upstream({ code: 28, message: "No face is found in the given image" }, 400)]) {
    const response = await handleDetect(request(image), { fetchImpl });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: [] });
  }
  await code(await handleDetect(request(image), { fetchImpl: upstream({ code: "28", message: TEST_KEY }, 400) }), "UPSTREAM_ERROR", 502);
  await code(await handleDetect(request(image), { fetchImpl: upstream({ code: 28 }, 401) }), "UPSTREAM_ERROR", 502);
});

test("missing, duplicate, empty and malformed uploads never call upstream", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls += 1; return Response.json({ result: [] }); };
  const duplicate = new FormData();
  duplicate.append("file", new Blob([new Uint8Array(await fixture())], { type: "image/png" }));
  duplicate.append("file", new Blob([new Uint8Array(await fixture())], { type: "image/png" }));
  const invalid = [
    request(null), request(new Uint8Array()),
    new Request("http://localhost/api/detect", { method: "POST", body: duplicate }),
    new Request("http://localhost/api/detect", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=missing" }, body: "broken" }),
    new Request("http://localhost/api/detect", { method: "POST", headers: { "content-type": "text/plain" }, body: "hello" }),
  ];
  for (const input of invalid) await code(await handleDetect(input, { fetchImpl }), "INVALID_REQUEST", 400);
  assert.equal(calls, 0);
});

test("declared, actual stream and individual file limits are enforced before upstream", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls += 1; return Response.json({ result: [] }); };
  const declared = request(await fixture());
  declared.headers.set("content-length", String(10 * 1024 * 1024 + 64 * 1024 + 1));
  await code(await handleDetect(declared, { fetchImpl }), "FILE_TOO_LARGE", 413);
  const stream = new Request("http://localhost/api/detect", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: new Uint8Array(10 * 1024 * 1024 + 64 * 1024 + 1) });
  await code(await handleDetect(stream, { fetchImpl }), "FILE_TOO_LARGE", 413);
  await code(await handleDetect(request(new Uint8Array(10 * 1024 * 1024 + 1)), { fetchImpl }), "FILE_TOO_LARGE", 413);
  assert.equal(calls, 0);
});

test("unsupported, MIME-spoofed and corrupt files are rejected", async () => {
  const image = await fixture();
  await code(await handleDetect(request(image, "image/gif"), { fetchImpl: upstream() }), "UNSUPPORTED_TYPE", 415);
  await code(await handleDetect(request(image, "image/jpeg"), { fetchImpl: upstream() }), "UNSUPPORTED_TYPE", 415);
  await code(await handleDetect(request(new TextEncoder().encode("not an image")), { fetchImpl: upstream() }), "INVALID_IMAGE", 400);
  await code(await handleDetect(request(image.subarray(0, image.length - 20)), { fetchImpl: upstream() }), "INVALID_IMAGE", 400);
});

test("dimension and pixel limits reject compressed oversized images without forwarding", async () => {
  await code(await handleDetect(request(await fixture("png", 8193, 1)), { fetchImpl: upstream() }), "IMAGE_TOO_LARGE", 413);
  await code(await handleDetect(request(await fixture("png", 6000, 4001)), { fetchImpl: upstream() }), "IMAGE_TOO_LARGE", 413);
});

test("EXIF orientation is applied before forwarding and metadata is removed", async () => {
  const rotated = await sharp({ create: { width: 64, height: 48, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const response = await handleDetect(request(rotated, "image/jpeg"), { fetchImpl: async (_url, init) => {
    const forwarded = (init?.body as FormData).get("file") as File;
    const metadata = await sharp(Buffer.from(await forwarded.arrayBuffer())).metadata();
    assert.equal(metadata.width, 48);
    assert.equal(metadata.height, 64);
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.exif, undefined);
    return Response.json({ result: [face(0.8)] });
  } });
  assert.equal(response.status, 200);
});

test("only boundary rounding within one pixel clamps; extra face properties are removed", async () => {
  const response = await handleDetect(request(await fixture()), { fetchImpl: upstream({ result: [{ box: { x_min: -1, y_min: -0.5, x_max: 64.5, y_max: 49, probability: 0 }, embedding: [1, 2], age: { value: 50 } }] }) });
  assert.deepEqual(await response.json(), { result: [{ box: { x_min: 0, y_min: 0, x_max: 64, y_max: 48, probability: 0 } }] });
});

test("invalid result schemas fail closed rather than silently dropping faces", async (t) => {
  const image = await fixture();
  const invalid: unknown[] = [null, {}, { result: {} }, { result: [null] }, { result: [{}] }, { result: [face("0.9" as unknown as number)] },
    { result: [face(1.01)] }, { result: [face(-0.1)] },
    ...[
      { x_min: "1", y_min: 2, x_max: 3, y_max: 4 },
      { x_min: 9, y_min: 2, x_max: 3, y_max: 4 },
      { x_min: 1, y_min: 9, x_max: 3, y_max: 4 },
      { x_min: 70, y_min: 2, x_max: 80, y_max: 4 },
      { x_min: -8, y_min: 2, x_max: 0, y_max: 4 },
      { x_min: 1, y_min: 50, x_max: 3, y_max: 60 },
      { x_min: -1.0001, y_min: 2, x_max: 3, y_max: 4 },
      { x_min: 1, y_min: -1.0001, x_max: 3, y_max: 4 },
      { x_min: 1, y_min: 2, x_max: 65.0001, y_max: 4 },
      { x_min: 1, y_min: 2, x_max: 3, y_max: 49.0001 },
      { x_min: -1e100, y_min: -1e100, x_max: 1e100, y_max: 1e100 },
      { x_min: 1, y_min: 2, x_max: Number.MAX_VALUE, y_max: 4 },
      { x_min: -1, y_min: 2, x_max: -0.5, y_max: 4 },
      { x_min: 64.1, y_min: 2, x_max: 64.5, y_max: 4 },
    ].map((box) => ({ result: [{ box }] })),
    { result: Array.from({ length: 501 }, () => face(0.9)) },
  ];
  for (const [index, value] of invalid.entries()) await t.test(`schema ${index + 1}`, async () => {
    await code(await handleDetect(request(image), { fetchImpl: upstream(value) }), "INVALID_RESPONSE", 502);
  });
});

test("invalid JSON and oversized upstream bodies produce sanitized errors", async () => {
  const image = await fixture();
  // JSON numeric overflow remains valid JSON but must never become a usable coordinate/confidence.
  for (const body of [
    '{"result":[{"box":{"x_min":1,"y_min":1,"x_max":3,"y_max":3,"probability":1e999}}]}',
    '{"result":[{"box":{"x_min":1,"y_min":1,"x_max":1e999,"y_max":3}}]}',
    '{"result":[{"box":{"x_min":-1e999,"y_min":1,"x_max":3,"y_max":3}}]}',
  ]) await code(await handleDetect(request(image), { fetchImpl: async () => new Response(body) }), "INVALID_RESPONSE", 502);
  await code(await handleDetect(request(image), { fetchImpl: async () => new Response(`secret:${TEST_KEY} url:${TEST_URL}`) }), "INVALID_RESPONSE", 502);
  await code(await handleDetect(request(image), { fetchImpl: async () => new Response("x".repeat(1024 * 1024 + 1)) }), "INVALID_RESPONSE", 502);
  await code(await handleDetect(request(image), { fetchImpl: async () => new Response(TEST_KEY, { status: 500 }) }), "UPSTREAM_ERROR", 502);
  await code(await handleDetect(request(image), { fetchImpl: async () => { throw new Error(`${TEST_URL} ${TEST_KEY}`); } }), "UPSTREAM_ERROR", 502);
});

test("missing or invalid server configuration never calls upstream", async () => {
  const image = await fixture();
  try {
    delete process.env.FACE_API_KEY;
    await code(await handleDetect(request(image), { fetchImpl: upstream() }), "NOT_CONFIGURED", 500);
    process.env.FACE_API_KEY = TEST_KEY;
    for (const url of ["", "file:///tmp/image", "https://username:password@example.test/detect"]) {
      process.env.FACE_API_URL = url;
      await code(await handleDetect(request(image), { fetchImpl: upstream() }), "NOT_CONFIGURED", 500);
    }
  } finally { process.env.FACE_API_URL = TEST_URL; process.env.FACE_API_KEY = TEST_KEY; }
});

test("upstream timeout aborts the fetch and returns504", async () => {
  let aborted = false;
  const response = await handleDetect(request(await fixture()), { timeoutMs: 10, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  }) });
  await code(response, "TIMEOUT", 504);
  assert.equal(aborted, true);
});

test("request cancellation propagates to upstream and returns499", async () => {
  const controller = new AbortController();
  let aborted = false;
  const response = await handleDetect(request(await fixture(), "image/png", controller.signal), { fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    controller.abort();
  }) });
  await code(response, "ABORTED", 499);
  assert.equal(aborted, true);
  await code(await handleDetect(request(await fixture(), "image/png", controller.signal), { fetchImpl: upstream() }), "ABORTED", 499);
});
