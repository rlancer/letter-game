import { env as hfEnv } from "@huggingface/transformers";
import { env as kokoroEnv, KokoroTTS } from "kokoro-js";
import ortMjs from "./assets/ort/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasm from "./assets/ort/ort-wasm-simd-threaded.jsep.wasm?url";

const MODEL_ID = "Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";
const SPEED = 0.95;

export type LoadProgress = {
  label: string;
  percent: number;
};

let tts: KokoroTTS | null = null;
let playing: HTMLAudioElement | null = null;
let speakToken = 0;
const clipCache = new Map<string, string>();

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

async function getClip(text: string): Promise<string> {
  const cached = clipCache.get(text);
  if (cached) return cached;
  if (!tts) throw new Error("Voice is not ready yet.");

  const audio = await tts.generate(text, { voice: VOICE, speed: SPEED });
  const url = URL.createObjectURL(audio.toBlob());
  clipCache.set(text, url);
  return url;
}

export async function prepareSpeech(text: string): Promise<void> {
  await getClip(text);
}

export async function speak(text: string, onStart?: () => void): Promise<void> {
  const token = (speakToken += 1);
  stopSpeaking();
  const url = await getClip(text);
  if (token !== speakToken) return;
  const element = new Audio(url);
  playing = element;
  onStart?.();
  await new Promise<void>((resolve, reject) => {
    element.onended = () => {
      if (playing === element) playing = null;
      resolve();
    };
    element.onerror = () => reject(new Error("Could not play the letter."));
    void element.play().catch(reject);
  });
}

export function stopSpeaking(): void {
  if (!playing) return;
  playing.pause();
  playing.currentTime = 0;
  playing = null;
}

export function prefetch(text: string): void {
  void getClip(text);
}
