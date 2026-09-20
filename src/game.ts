import { burst } from "./confetti.ts";
import {
  ALPHABET,
  choicesFor,
  colorFor,
  promptFor,
  shuffle,
  type Letter,
} from "./letters.ts";
import { playCorrect, playFanfare, playTap, playWrong, unlockAudio } from "./sounds.ts";
import { loadVoice, prefetch, prepareSpeech, speak, stopSpeaking } from "./tts.ts";

type ScreenName = "start" | "load" | "play" | "score";

type Round = {
  letter: Letter;
  choices: Letter[];
  firstTry: boolean;
  answered: boolean;
};

const els = {
  start: document.querySelector("#screen-start")!,
  load: document.querySelector("#screen-load")!,
  play: document.querySelector("#screen-play")!,
  score: document.querySelector("#screen-score")!,
  playBtn: document.querySelector<HTMLButtonElement>("#play-btn")!,
  retryBtn: document.querySelector<HTMLButtonElement>("#retry-btn")!,
  againBtn: document.querySelector<HTMLButtonElement>("#again-btn")!,
  progressFill: document.querySelector<HTMLElement>("#load-fill")!,
  progressLabel: document.querySelector("#load-label")!,
  loadError: document.querySelector("#load-error")!,
  beads: document.querySelector("#beads")!,
  scorechip: document.querySelector("#scorechip")!,
  prompt: document.querySelector("#prompt")!,
  face: document.querySelector<HTMLButtonElement>("#face")!,
  choices: document.querySelector("#choices")!,
  finalScore: document.querySelector("#final-score")!,
  finalNote: document.querySelector("#final-note")!,
  stars: document.querySelector("#stars")!,
};

let deck: Letter[] = [];
let index = 0;
let correctFirstTries = 0;
let round: Round | null = null;
let booting = false;

function show(screen: ScreenName): void {
  for (const [name, node] of Object.entries({
    start: els.start,
    load: els.load,
    play: els.play,
    score: els.score,
  })) {
    const active = name === screen;
    node.classList.toggle("hidden", !active);
    node.setAttribute("aria-hidden", active ? "false" : "true");
  }
}

function renderBeads(): void {
  els.beads.innerHTML = ALPHABET.map((_, beadIndex) => {
    const state =
      beadIndex < index ? "done" : beadIndex === index ? "now" : "todo";
    return `<span class="bead ${state}" aria-hidden="true"></span>`;
  }).join("");
}

function renderChoices(choices: Letter[], enabled: boolean): void {
  els.choices.innerHTML = "";
  for (const letter of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `block color-${colorFor(letter)}`;
    button.dataset.letter = letter;
    button.setAttribute("aria-label", `Letter ${letter}`);
    button.disabled = !enabled;
    button.innerHTML = `<span>${letter}</span>`;
    button.addEventListener("click", () => void onPick(letter, button));
    els.choices.append(button);
  }
}

async function speakLetter(letter: Letter): Promise<void> {
  els.face.classList.add("thinking");
  els.prompt.textContent = "Listen…";
  try {
    await speak(promptFor(letter), () => {
      els.face.classList.remove("thinking");
      els.face.classList.add("talking");
    });
  } finally {
    els.face.classList.remove("thinking", "talking");
    if (round && !round.answered) els.prompt.textContent = "Tap the letter.";
  }
}

async function startRound(): Promise<void> {
  const letter = deck[index];
  if (!letter) {
    finish();
    return;
  }
  round = {
    letter,
    choices: choicesFor(letter),
    firstTry: true,
    answered: false,
  };
          renderBeads();
          els.scorechip.textContent = `${correctFirstTries} / ${ALPHABET.length}`;
  renderChoices(round.choices, false);
  els.face.disabled = true;
  const next = deck[index + 1];
  if (next) prefetch(promptFor(next));
  await speakLetter(letter);
  if (!round.answered) {
    renderChoices(round.choices, true);
    els.face.disabled = false;
  }
}

async function onPick(letter: Letter, button: HTMLButtonElement): Promise<void> {
  if (!round || round.answered) return;
  playTap();

  if (letter !== round.letter) {
    round.firstTry = false;
    button.classList.add("wrong");
    playWrong();
    els.prompt.textContent = "Try again!";
    window.setTimeout(() => button.classList.remove("wrong"), 420);
    return;
  }

  round.answered = true;
  if (round.firstTry) correctFirstTries += 1;
  button.classList.add("right");
  for (const node of els.choices.querySelectorAll<HTMLButtonElement>("button")) {
    node.disabled = true;
  }
  els.face.disabled = true;
  playCorrect();
  els.prompt.textContent = "Yes!";
  const rect = button.getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, letter);
  await wait(720);
  index += 1;
  if (index >= deck.length) {
    finish();
    return;
  }
  await startRound();
}

function finish(): void {
  stopSpeaking();
  playFanfare();
  const score = correctFirstTries;
  els.finalScore.textContent = `${score} / ${ALPHABET.length}`;
  els.finalNote.textContent =
    score === ALPHABET.length
      ? "Every letter on the first try!"
      : score >= 20
        ? "Wow. Those ears are working."
        : score >= 12
          ? "Great listening. Play again?"
          : "Nice try. Play again and listen close.";
  const starCount = score === 26 ? 3 : score >= 20 ? 3 : score >= 12 ? 2 : 1;
  els.stars.innerHTML = Array.from({ length: 3 }, (_, i) =>
    `<span class="star ${i < starCount ? "on" : ""}">★</span>`,
  ).join("");
  burst(window.innerWidth / 2, window.innerHeight / 3, "★");
  show("score");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function bootGame(): Promise<void> {
  if (booting) return;
  booting = true;
  show("load");
  els.retryBtn.classList.add("hidden");
  els.loadError.classList.add("hidden");
  try {
    await loadVoice(({ label, percent }) => {
      els.progressLabel.textContent = label;
      els.progressFill.style.width = `${percent}%`;
    });
    deck = shuffle(ALPHABET);
    index = 0;
    correctFirstTries = 0;
    const first = deck[0];
    if (!first) throw new Error("Alphabet is empty.");
    els.progressLabel.textContent = "Practicing the first letter…";
    await prepareSpeech(promptFor(first));
    show("play");
    await startRound();
  } catch (error) {
    const missing = error instanceof Error && error.message === "missing-model";
    els.loadError.textContent = missing
      ? "The letter voice is not downloaded yet. In a terminal, run mise run setup."
      : "The letter voice could not start. Check the browser console, then try again.";
    els.loadError.classList.remove("hidden");
    els.retryBtn.classList.remove("hidden");
    els.progressLabel.textContent = "Need a little help.";
  } finally {
    booting = false;
  }
}

els.playBtn.addEventListener("click", () => {
  void unlockAudio();
  void bootGame();
});

els.retryBtn.addEventListener("click", () => {
  void bootGame();
});

els.againBtn.addEventListener("click", () => {
  void unlockAudio();
  void bootGame();
});

els.face.addEventListener("click", () => {
  if (!round || round.answered) return;
  void speakLetter(round.letter);
});
