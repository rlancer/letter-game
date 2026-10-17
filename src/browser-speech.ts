type StartHandler = () => void;

let speakToken = 0;
let active: SpeechSynthesisUtterance | null = null;
let preferred: SpeechSynthesisVoice | null = null;

function synth(): SpeechSynthesis {
  if (!("speechSynthesis" in window)) {
    throw new Error("This browser cannot speak words out loud.");
  }
  return window.speechSynthesis;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (preferred) return preferred;
  const voices = synth().getVoices();
  const en = voices.filter((voice) => /^en(-|_)/i.test(voice.lang));
  preferred =
    en.find((voice) => /zira|samantha|karen|moira|female|woman/i.test(voice.name)) ??
    en.find((voice) => /en-US/i.test(voice.lang)) ??
    en[0] ??
    voices.find((voice) => voice.default) ??
    null;
  return preferred;
}

function warmVoices(): Promise<void> {
  const voices = synth().getVoices();
  if (voices.length > 0) {
    pickVoice();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      pickVoice();
      resolve();
    };
    synth().addEventListener("voiceschanged", done, { once: true });
    window.setTimeout(done, 800);
  });
}

export async function prepareBrowserSpeech(): Promise<void> {
  await warmVoices();
  // Chrome often needs a tiny kick before the first real utterance is snappy.
  synth().cancel();
}

export function stopBrowserSpeech(): void {
  speakToken += 1;
  active = null;
  try {
    synth().cancel();
  } catch {
    // Speech API unavailable.
  }
}

export async function speakBrowser(text: string, onStart?: StartHandler): Promise<void> {
  await warmVoices();
  stopBrowserSpeech();
  const token = speakToken;

  await new Promise<void>((resolve, reject) => {
    if (token !== speakToken) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    active = utterance;

    let started = false;
    utterance.onstart = () => {
      started = true;
      onStart?.();
    };
    utterance.onend = () => {
      if (active === utterance) active = null;
      resolve();
    };
    utterance.onerror = (event) => {
      if (active === utterance) active = null;
      if (event.error === "canceled" || event.error === "interrupted") {
        resolve();
        return;
      }
      reject(new Error(`Could not speak “${text}”.`));
    };

    synth().speak(utterance);
    // Some engines never fire onstart for short words — still unlock UI promptly.
    window.setTimeout(() => {
      if (token === speakToken && !started) onStart?.();
    }, 40);
  });
}
