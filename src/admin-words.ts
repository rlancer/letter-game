import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/titan-one";
import { unlockAudio } from "./sounds.ts";
import { loadVoice, speakText, stopSpeaking } from "./tts.ts";
import {
  WORDS,
  colorForWord,
  promptForWord,
  spokenWord,
  type Word,
} from "./words.ts";
import "./style.css";

const list = document.querySelector("#key-list")!;
const status = document.querySelector("#admin-status")!;
const meter = document.querySelector("#admin-meter")!;
const fill = document.querySelector<HTMLElement>("#admin-fill")!;
const errorBox = document.querySelector("#admin-error")!;
const fullLine = document.querySelector<HTMLInputElement>("#full-line")!;

const rows = new Map<string, HTMLElement>();
let booting: Promise<void> | null = null;
let speaking: string | null = null;

function setStatus(text: string): void {
  status.textContent = text;
}

function lineFor(word: Word): string {
  return fullLine.checked ? promptForWord(word) : spokenWord(word);
}

function renderList(): void {
  list.replaceChildren();
  for (const word of WORDS) {
    const row = document.createElement("div");
    row.className = "key-row word-key-row word-preview-row";
    row.dataset.word = word.text;

    const block = document.createElement("span");
    block.className = `block word color-${colorForWord(word.text)}`;
    block.innerHTML = `<span>${word.text}</span>`;
    block.setAttribute("aria-hidden", "true");

    const label = document.createElement("p");
    label.className = "word-spoken";
    label.textContent = promptForWord(word);

    const hear = document.createElement("button");
    hear.type = "button";
    hear.className = "btn hear";
    hear.textContent = "Hear";
    hear.addEventListener("click", () => {
      void unlockAudio();
      void playWord(word);
    });

    row.append(block, label, hear);
    rows.set(word.text, row);
    list.append(row);
  }
}

function refreshLabels(): void {
  for (const word of WORDS) {
    const row = rows.get(word.text);
    const label = row?.querySelector(".word-spoken");
    if (label) label.textContent = lineFor(word);
  }
}

async function ensureVoice(): Promise<void> {
  if (booting) {
    await booting;
    return;
  }
  meter.classList.remove("hidden");
  errorBox.classList.add("hidden");
  booting = loadVoice(({ label, percent }) => {
    setStatus(label);
    fill.style.width = `${percent}%`;
  }).then(() => {
    meter.classList.add("hidden");
    setStatus("Voice is ready. Tap Hear on any word.");
  });
  try {
    await booting;
  } catch (error) {
    booting = null;
    meter.classList.add("hidden");
    const missing = error instanceof Error && error.message === "missing-model";
    errorBox.textContent = missing
      ? "The letter voice is not downloaded yet. In a terminal, run mise run setup."
      : "The letter voice could not start. Check the browser console, then try again.";
    errorBox.classList.remove("hidden");
    setStatus("Need a little help.");
    throw error;
  }
}

function markSpeaking(text: string | null): void {
  speaking = text;
  for (const [key, row] of rows) {
    row.classList.toggle("speaking", key === text);
  }
}

async function playWord(word: Word): Promise<void> {
  try {
    await ensureVoice();
  } catch {
    return;
  }
  markSpeaking(word.text);
  const line = lineFor(word);
  setStatus(`Preparing ${word.text}…`);
  try {
    await speakText(line, () => {
      if (speaking === word.text) setStatus(`Speaking ${word.text}…`);
    });
  } catch (error) {
    errorBox.textContent =
      error instanceof Error ? error.message : "Could not play the word.";
    errorBox.classList.remove("hidden");
  } finally {
    if (speaking === word.text) {
      markSpeaking(null);
      setStatus("Voice is ready. Tap Hear on any word.");
    }
  }
}

fullLine.addEventListener("change", () => {
  refreshLabels();
});

window.addEventListener("pagehide", () => {
  stopSpeaking();
});

renderList();
void ensureVoice().catch(() => undefined);
