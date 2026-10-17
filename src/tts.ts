import { env as hfEnv } from "@huggingface/transformers";
import { env as kokoroEnv, KokoroTTS } from "kokoro-js";
import ortMjs from "./assets/ort/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasm from "./assets/ort/ort-wasm-simd-threaded.jsep.wasm?url";
import { sharedAudioContext } from "./sounds.ts";

const MODEL_ID = "Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";
const SPEED = 0.95;

export type LoadProgress = {
  label: string;
  percent: number;
};

type Waiter = {
  resolve: (bytes: ArrayBuffer) => void;
  reject: (error: unknown) => void;
};

type Slot = {
  phonemes: string;
  urgent: boolean;
};

let tts: KokoroTTS | null = null;
let cancelPlay: (() => void) | null = null;
let speakToken = 0;
let pumping = false;
const clipCache = new Map<string, ArrayBuffer>();
const groups = new Map<string, Waiter[]>();
const queue: Slot[] = [];

hfEnv.allowLocalModels = true;
hfEnv.allowRemoteModels = false;
hfEnv.useBrowserCache = false;
hfEnv.localModelPath = "/models/";
kokoroEnv.wasmPaths = {
  mjs: ortMjs,
  wasm: ortWasm,
};

function redirectVoiceRequests(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const marker = "/voices/";
    const at = url.indexOf(marker);
    if (at !== -1 && url.includes(".bin")) {
      const file = url.slice(at + marker.length).split("?")[0];
      return originalFetch(`/voices/${file}`, init);
    }
    return originalFetch(input, init);
  };
}

redirectVoiceRequests();

async function assertModelPresent(): Promise<void> {
  const url = `/models/${MODEL_ID}/onnx/model_quantized.onnx`;
  const head = await fetch(url, { method: "HEAD" });
  if (head.ok) return;
  const ranged = await fetch(url, { headers: { Range: "bytes=0-0" } });
  if (!ranged.ok && ranged.status !== 206) {
    throw new Error("missing-model");
  }
}

export async function loadVoice(onProgress: (progress: LoadProgress) => void): Promise<void> {
  if (tts) {
    onProgress({ label: "Voice is ready!", percent: 100 });
    return;
  }
  onProgress({ label: "Looking for the local voice…", percent: 4 });
  await assertModelPresent();
  onProgress({ label: "Opening the letter voice…", percent: 10 });

  tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (event) => {
      if (event.status === "progress" && event.total) {
        const percent = 10 + Math.round((event.loaded / event.total) * 80);
        onProgress({
          label: "Waking up the voice…",
          percent: Math.min(percent, 92),
        });
      }
    },
  });

  onProgress({ label: "Voice is ready!", percent: 100 });
}

async function synthesize(phonemes: string) {
  if (!tts) throw new Error("Voice is not ready yet.");
  const { input_ids } = tts.tokenizer(phonemes, { truncation: true });
  return tts.generate_from_ids(input_ids, { voice: VOICE, speed: SPEED });
}

function insert(slot: Slot): void {
  if (!slot.urgent) {
    queue.push(slot);
    return;
  }
  const firstBackground = queue.findIndex((item) => !item.urgent);
  if (firstBackground === -1) queue.push(slot);
  else queue.splice(firstBackground, 0, slot);
}

function promote(phonemes: string): void {
  const index = queue.findIndex((slot) => slot.phonemes === phonemes);
  if (index < 0) return;
  const slot = queue[index];
  if (!slot || slot.urgent) return;
  queue.splice(index, 1);
  slot.urgent = true;
  insert(slot);
}

function enqueue(phonemes: string, urgent: boolean): Promise<ArrayBuffer> {
  const cached = clipCache.get(phonemes);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject };
    const existing = groups.get(phonemes);
    if (existing) {
      existing.push(waiter);
      if (urgent) promote(phonemes);
      return;
    }
    groups.set(phonemes, [waiter]);
    insert({ phonemes, urgent });
    void pump();
  });
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length > 0) {
      const slot = queue.shift();
      if (!slot) break;
      const waiters = groups.get(slot.phonemes) ?? [];
      try {
        const audio = await synthesize(slot.phonemes);
        const bytes = await audio.toBlob().arrayBuffer();
        clipCache.set(slot.phonemes, bytes);
        for (const waiter of waiters) waiter.resolve(bytes);
      } catch (error) {
        for (const waiter of waiters) waiter.reject(error);
      } finally {
        groups.delete(slot.phonemes);
      }
    }
  } finally {
    pumping = false;
  }
  if (queue.length > 0) void pump();
}

async function playUrl(bytes: ArrayBuffer, token: number, onStart?: () => void): Promise<void> {
  if (token !== speakToken) return;
  const audio = sharedAudioContext();
  if (audio.state === "suspended") await audio.resume();
  if (token !== speakToken) return;
  if (audio.state !== "running") {
    throw new Error("The browser blocked the sound. Tap Hear again.");
  }

  const buffer = await audio.decodeAudioData(bytes.slice(0));
  if (token !== speakToken) return;

  await new Promise<void>((resolve, reject) => {
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      source.disconnect();
      if (cancelPlay === cancel) cancelPlay = null;
      resolve();
    };
    const cancel = () => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      finish();
    };
    cancelPlay = cancel;
    source.onended = finish;
    try {
      onStart?.();
      source.start();
    } catch (error) {
      settled = true;
      if (cancelPlay === cancel) cancelPlay = null;
      reject(error instanceof Error ? error : new Error("Could not play the letter."));
    }
  });
}

export async function prepareSpeech(phonemes: string): Promise<void> {
  await enqueue(phonemes, true);
}

export async function speakParts(parts: string[], onStart?: () => void): Promise<void> {
  const token = (speakToken += 1);
  stopSpeaking();
  const pending = parts.map((part) => enqueue(part, true));
  for (let index = 0; index < pending.length; index += 1) {
    const bytes = await pending[index];
    if (token !== speakToken) return;
    await playUrl(bytes, token, index === 0 ? onStart : undefined);
    if (token !== speakToken) return;
  }
}

export async function speak(phonemes: string, onStart?: () => void): Promise<void> {
  await speakParts([phonemes], onStart);
}

export function stopSpeaking(): void {
  cancelPlay?.();
  cancelPlay = null;
}

export function prefetch(phonemes: string): void {
  void enqueue(phonemes, false);
}
