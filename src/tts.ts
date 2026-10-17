import { env as hfEnv } from "@huggingface/transformers";
import { env as kokoroEnv, KokoroTTS } from "kokoro-js";
import ortMjs from "./assets/ort/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasm from "./assets/ort/ort-wasm-simd-threaded.jsep.wasm?url";
import { sharedAudioContext } from "./sounds.ts";

const MODEL_ID = "Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";
const SPEED = 1;

export type LoadProgress = {
  label: string;
  percent: number;
};

export type SynthTiming = {
  kind: SpeechKind;
  value: string;
  ms: number;
  cached: boolean;
};

type Waiter = {
  resolve: (clip: Clip) => void;
  reject: (error: unknown) => void;
};

type SpeechKind = "phonemes" | "text";

type Slot = {
  kind: SpeechKind;
  value: string;
  urgent: boolean;
};

type Clip = {
  samples: Float32Array;
  sampleRate: number;
  buffer: AudioBuffer | null;
};

function cacheKey(kind: SpeechKind, value: string): string {
  return `${kind}:${value}`;
}

let tts: KokoroTTS | null = null;
let cancelPlay: (() => void) | null = null;
let speakToken = 0;
let pumping = false;
const clipCache = new Map<string, Clip>();
const groups = new Map<string, Waiter[]>();
const queue: Slot[] = [];
const timings: SynthTiming[] = [];

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
  // Stick to wasm + q8. WebGPU with q8 produces garbled "Japanese-sounding" audio.
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

async function synthesize(slot: Slot): Promise<Clip> {
  if (!tts) throw new Error("Voice is not ready yet.");
  const started = performance.now();
  const raw =
    slot.kind === "text"
      ? await tts.generate(slot.value, { voice: VOICE, speed: SPEED })
      : await tts.generate_from_ids(
          tts.tokenizer(slot.value, { truncation: true }).input_ids,
          { voice: VOICE, speed: SPEED },
        );
  const ms = Math.round(performance.now() - started);
  timings.push({ kind: slot.kind, value: slot.value, ms, cached: false });
  console.info(`[tts] synth ${slot.kind} "${slot.value}" ${ms}ms`);
  // Copy out of WASM heap — that buffer is reused and otherwise becomes garbage.
  return {
    samples: Float32Array.from(raw.audio),
    sampleRate: raw.sampling_rate || 24000,
    buffer: null,
  };
}

function audioBufferFor(clip: Clip): AudioBuffer {
  if (clip.buffer) return clip.buffer;
  const audio = sharedAudioContext();
  const frames = Math.max(1, clip.samples.length);
  const buffer = audio.createBuffer(1, frames, clip.sampleRate);
  buffer.getChannelData(0).set(clip.samples.subarray(0, frames));
  clip.buffer = buffer;
  return buffer;
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

function promote(kind: SpeechKind, value: string): void {
  const index = queue.findIndex((slot) => slot.kind === kind && slot.value === value);
  if (index < 0) return;
  const slot = queue[index];
  if (!slot || slot.urgent) return;
  queue.splice(index, 1);
  slot.urgent = true;
  insert(slot);
}

function takeNextSlot(): Slot | undefined {
  const urgentAt = queue.findIndex((slot) => slot.urgent);
  if (urgentAt >= 0) return queue.splice(urgentAt, 1)[0];
  return queue.shift();
}

function enqueue(kind: SpeechKind, value: string, urgent: boolean): Promise<Clip> {
  const key = cacheKey(kind, value);
  const cached = clipCache.get(key);
  if (cached) {
    timings.push({ kind, value, ms: 0, cached: true });
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject };
    const existing = groups.get(key);
    if (existing) {
      existing.push(waiter);
      if (urgent) promote(kind, value);
      return;
    }
    groups.set(key, [waiter]);
    insert({ kind, value, urgent });
    void pump();
  });
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length > 0) {
      const slot = takeNextSlot();
      if (!slot) break;
      const key = cacheKey(slot.kind, slot.value);
      const waiters = groups.get(key) ?? [];
      try {
        const clip = await synthesize(slot);
        clipCache.set(key, clip);
        for (const waiter of waiters) waiter.resolve(clip);
      } catch (error) {
        for (const waiter of waiters) waiter.reject(error);
      } finally {
        groups.delete(key);
      }
    }
  } finally {
    pumping = false;
  }
  if (queue.length > 0) void pump();
}

async function playClip(clip: Clip, token: number, onStart?: () => void): Promise<void> {
  if (token !== speakToken) return;
  const audio = sharedAudioContext();
  if (audio.state === "suspended") await audio.resume();
  if (token !== speakToken) return;
  if (audio.state !== "running") {
    throw new Error("The browser blocked the sound. Tap Hear again.");
  }

  const buffer = audioBufferFor(clip);
  if (token !== speakToken) return;

  await new Promise<void>((resolve, reject) => {
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    let settled = false;
    let timer = 0;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
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
    // Some browsers skip onended for short/odd buffers — never block the round.
    timer = window.setTimeout(finish, Math.ceil(buffer.duration * 1000) + 400);
    try {
      onStart?.();
      source.start();
    } catch (error) {
      settled = true;
      if (timer) window.clearTimeout(timer);
      if (cancelPlay === cancel) cancelPlay = null;
      reject(error instanceof Error ? error : new Error("Could not play the letter."));
    }
  });
}

export async function prepareSpeech(phonemes: string): Promise<void> {
  await enqueue("phonemes", phonemes, true);
}

export async function prepareText(text: string): Promise<void> {
  await enqueue("text", text, true);
}

export async function speakParts(parts: string[], onStart?: () => void): Promise<void> {
  const token = (speakToken += 1);
  stopSpeaking();
  const pending = parts.map((part) => enqueue("phonemes", part, true));
  for (let index = 0; index < pending.length; index += 1) {
    const clip = await pending[index];
    if (token !== speakToken) return;
    await playClip(clip, token, index === 0 ? onStart : undefined);
    if (token !== speakToken) return;
  }
}

export async function speak(phonemes: string, onStart?: () => void): Promise<void> {
  await speakParts([phonemes], onStart);
}

export async function speakText(text: string, onStart?: () => void): Promise<void> {
  const token = (speakToken += 1);
  stopSpeaking();
  const started = performance.now();
  const clip = await enqueue("text", text, true);
  const waitMs = Math.round(performance.now() - started);
  if (waitMs > 20) console.info(`[tts] speak wait "${text}" ${waitMs}ms`);
  if (token !== speakToken) return;
  await playClip(clip, token, onStart);
}

export function stopSpeaking(): void {
  cancelPlay?.();
  cancelPlay = null;
}

export function prefetch(phonemes: string): void {
  void enqueue("phonemes", phonemes, false);
}

export function prefetchText(text: string): void {
  void enqueue("text", text, false);
}

export function isCached(kind: SpeechKind, value: string): boolean {
  return clipCache.has(cacheKey(kind, value));
}

export function getSynthTimings(): SynthTiming[] {
  return [...timings];
}

export function clearSynthTimings(): void {
  timings.length = 0;
}

declare global {
  interface Window {
    __ttsTimings?: () => SynthTiming[];
  }
}

if (typeof window !== "undefined") {
  window.__ttsTimings = getSynthTimings;
}
