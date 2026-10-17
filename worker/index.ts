export interface Env {
  MODELS: R2Bucket;
}

const MODEL_PATH = "/models/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx";
const MODEL_KEY = "models/Kokoro-82M-v1.0-ONNX/onnx/model_quantized.onnx";

const CORP = {
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cache-Control": "public, max-age=31536000, immutable",
};

function headersFor(obj: R2Object): Headers {
  const headers = new Headers();
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("content-type", "application/octet-stream");
  for (const [key, value] of Object.entries(CORP)) {
    headers.set(key, value);
  }
  return headers;
}

async function serveModel(request: Request, env: Env): Promise<Response> {
  const rangeHeader = request.headers.get("range");

  if (request.method === "HEAD") {
    const obj = await env.MODELS.head(MODEL_KEY);
    if (!obj) return new Response(null, { status: 404 });
    const headers = headersFor(obj);
    headers.set("content-length", String(obj.size));
    return new Response(null, { status: 200, headers });
  }

  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) return new Response("Invalid Range", { status: 416 });

    const head = await env.MODELS.head(MODEL_KEY);
    if (!head) return new Response("Not found", { status: 404 });

    const start = match[1] === "" ? 0 : Number(match[1]);
    const end = match[2] === "" ? head.size - 1 : Number(match[2]);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start >= head.size
    ) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "content-range": `bytes */${head.size}` },
      });
    }

    const obj = await env.MODELS.get(MODEL_KEY, {
      range: { offset: start, length: end - start + 1 },
    });
    if (!obj) return new Response("Not found", { status: 404 });

    const headers = headersFor(obj);
    headers.set("content-range", `bytes ${start}-${end}/${head.size}`);
    headers.set("content-length", String(end - start + 1));
    return new Response(obj.body, { status: 206, headers });
  }

  const obj = await env.MODELS.get(MODEL_KEY);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = headersFor(obj);
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === MODEL_PATH) return serveModel(request, env);
    return new Response("Not found", { status: 404 });
  },
};
