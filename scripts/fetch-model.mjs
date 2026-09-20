import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_ID = "Kokoro-82M-v1.0-ONNX";
const HF_BASE = `https://huggingface.co/onnx-community/${MODEL_ID}/resolve/main`;
const MODEL_DIR = path.join(ROOT, "public", "models", MODEL_ID);
const VOICE_DIR = path.join(ROOT, "public", "voices");
const ORT_DIR = path.join(ROOT, "src", "assets", "ort");

const FILES = [
  { url: `${HF_BASE}/config.json`, dest: path.join(MODEL_DIR, "config.json") },
  { url: `${HF_BASE}/tokenizer.json`, dest: path.join(MODEL_DIR, "tokenizer.json") },
  { url: `${HF_BASE}/tokenizer_config.json`, dest: path.join(MODEL_DIR, "tokenizer_config.json") },
  {
    url: `${HF_BASE}/onnx/model_quantized.onnx`,
    dest: path.join(MODEL_DIR, "onnx", "model_quantized.onnx"),
    expectedBytes: 92_361_116,
  },
  {
    url: `${HF_BASE}/voices/af_heart.bin`,
    dest: path.join(VOICE_DIR, "af_heart.bin"),
    expectedBytes: 522_240,
  },
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest, expectedBytes) {
  if (await exists(dest)) {
    const { size } = await stat(dest);
    if (!expectedBytes || size === expectedBytes) {
      console.log(`exists  ${path.relative(ROOT, dest)} (${size} bytes)`);
      return;
    }
    console.log(`replace ${path.relative(ROOT, dest)} (size ${size}, expected ${expectedBytes})`);
  }

  await mkdir(path.dirname(dest), { recursive: true });
  console.log(`fetch   ${url}`);

  const response = await fetch(url, {
    headers: { "User-Agent": "letter-game-setup" },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const total = Number(response.headers.get("content-length")) || expectedBytes || 0;
  let loaded = 0;
  let lastPct = -1;
  const reader = Readable.fromWeb(response.body);
  reader.on("data", (chunk) => {
    loaded += chunk.length;
    if (!total) return;
    const pct = Math.floor((loaded / total) * 100);
    if (pct !== lastPct && pct % 5 === 0) {
      lastPct = pct;
      console.log(`  ${pct}%`);
    }
  });

  await pipeline(reader, createWriteStream(dest));
  console.log(`saved   ${path.relative(ROOT, dest)}`);
}

async function copyOrtRuntime() {
  const dist = path.join(ROOT, "node_modules", "@huggingface", "transformers", "dist");
  if (!(await exists(dist))) {
    throw new Error("Install npm packages first so ONNX Runtime files can be copied.");
  }

  await mkdir(ORT_DIR, { recursive: true });
  const names = await readdir(dist);
  const runtimeFiles = names.filter(
    (name) => name.startsWith("ort-") && (name.endsWith(".wasm") || name.endsWith(".mjs")),
  );
  if (runtimeFiles.length === 0) {
    throw new Error(`No ONNX Runtime files found in ${dist}`);
  }

  for (const name of runtimeFiles) {
    const dest = path.join(ORT_DIR, name);
    await copyFile(path.join(dist, name), dest);
    console.log(`copied  ${path.relative(ROOT, dest)}`);
  }
}

async function main() {
  console.log("Downloading local Kokoro TTS files…");
  for (const file of FILES) {
    await download(file.url, file.dest, file.expectedBytes);
  }
  await copyOrtRuntime();
  console.log("TTS model is ready in public/models, public/voices, and src/assets/ort.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
