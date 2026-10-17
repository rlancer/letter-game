import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/titan-one";
import {
  ALPHABET,
  colorFor,
  phonemesFor,
  PROMPT_INTRO,
  type Letter,
} from "./letters.ts";
import { unlockAudio } from "./sounds.ts";
import { loadVoice, speakParts, stopSpeaking } from "./tts.ts";
import "./style.css";

const list = document.querySelector("#key-list")!;
const status = document.querySelector("#admin-status")!;
const meter = document.querySelector("#admin-meter")!;
const fill = document.querySelector<HTMLElement>("#admin-fill")!;
const errorBox = document.querySelector("#admin-error")!;
const fullLine = document.querySelector<HTMLInputElement>("#full-line")!;
const copyBtn = document.querySelector<HTMLButtonElement>("#copy-keys")!;

const inputs = new Map<Letter, HTMLInputElement>();
const rows = new Map<Letter, HTMLElement>();
let booting: Promise<void> | null = null;
let speaking: Letter | null = null;

function setStatus(text: string): void {
  status.textContent = text;
}

function currentKey(letter: Letter): string {
  const typed = inputs.get(letter)?.value.trim();
  return typed || phonemesFor(letter);
}

function speechParts(letter: Letter): string[] {
  const key = currentKey(letter);
  return fullLine.checked ? [PROMPT_INTRO, `${key}.`] : [key];
}

function renderList(): void {
  list.replaceChildren();
  for (const letter of ALPHABET) {
    const row = document.createElement("div");
    row.className = "key-row";
    row.dataset.letter = letter;

    const block = document.createElement("span");
    block.className = `block color-${colorFor(letter)}`;
    block.innerHTML = `<span>${letter}</span>`;
    block.setAttribute("aria-hidden", "true");

    const input = document.createElement("input");
    input.className = "key-input";
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.value = phonemesFor(letter);
    input.setAttribute("aria-label", `Pronunciation key for ${letter}`);
    inputs.set(letter, input);

    const hear = document.createElement("button");
    hear.type = "button";
    hear.className = "btn hear";
    hear.textContent = "Hear";
    hear.addEventListener("click", () => {
      void unlockAudio();
      void playLetter(letter);
    });

    row.append(block, input, hear);
    rows.set(letter, row);
    list.append(row);
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
    setStatus("Voice is ready. Tap Hear on any letter.");
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

function markSpeaking(letter: Letter | null): void {
  speaking = letter;
  for (const [key, row] of rows) {
    row.classList.toggle("speaking", key === letter);
  }
}

async function playLetter(letter: Letter): Promise<void> {
  try {
    await ensureVoice();
  } catch {
    return;
  }
  markSpeaking(letter);
  setStatus(`Preparing ${letter}…`);
  try {
    await speakParts(speechParts(letter), () => {
      if (speaking === letter) setStatus(`Speaking ${letter}…`);
    });
  } catch (error) {
    errorBox.textContent =
      error instanceof Error ? error.message : "Could not play the letter.";
    errorBox.classList.remove("hidden");
  } finally {
    if (speaking === letter) {
      markSpeaking(null);
      setStatus("Voice is ready. Tap Hear on any letter.");
    }
  }
}

async function copyKeys(): Promise<void> {
  const snippet = ALPHABET.map((letter) => `  ${letter}: ${JSON.stringify(currentKey(letter))},`).join(
    "\n",
  );
  await navigator.clipboard.writeText(snippet);
  const previous = copyBtn.textContent;
  copyBtn.textContent = "Copied";
  window.setTimeout(() => {
    copyBtn.textContent = previous;
  }, 1400);
}

copyBtn.addEventListener("click", () => {
  void copyKeys();
});

window.addEventListener("pagehide", () => {
  stopSpeaking();
});

renderList();
void ensureVoice().catch(() => undefined);
