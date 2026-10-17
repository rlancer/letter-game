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
import {
  loadVoice,
  prefetch,
  prefetchText,
  prepareSpeech,
  prepareText,
  speak,
  speakText,
  stopSpeaking,
} from "./tts.ts";
import {
  choicesForWord,
  colorForWord,
  deckForWords,
  promptForWord,
  WORDS_PER_GAME,
  type Word,
} from "./words.ts";

type ScreenName = "start" | "load" | "play" | "score";
type Mode = "letters" | "words";

type LetterRound = {
  mode: "letters";
  letter: Letter;
  choices: Letter[];
  firstTry: boolean;
  answered: boolean;
};

type WordRound = {
  mode: "words";
  word: Word;
  choices: string[];
  firstTry: boolean;
  answered: boolean;
};

type Round = LetterRound | WordRound;

const els = {
  start: document.querySelector("#screen-start")!,
  load: document.querySelector("#screen-load")!,
  play: document.querySelector("#screen-play")!,
  score: document.querySelector("#screen-score")!,
  lettersBtn: document.querySelector<HTMLButtonElement>("#letters-btn")!,
  wordsBtn: document.querySelector<HTMLButtonElement>("#words-btn")!,
  retryBtn: document.querySelector<HTMLButtonElement>("#retry-btn")!,
  againBtn: document.querySelector<HTMLButtonElement>("#again-btn")!,
  homeBtn: document.querySelector<HTMLButtonElement>("#home-btn")!,
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

let mode: Mode = "letters";
let letterDeck: Letter[] = [];
let wordDeck: Word[] = [];
let index = 0;
let correctFirstTries = 0;
let round: Round | null = null;
let booting = false;

function totalRounds(): number {
  return mode === "letters" ? ALPHABET.length : WORDS_PER_GAME;
}

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
  const total = totalRounds();
  els.beads.innerHTML = Array.from({ length: total }, (_, beadIndex) => {
    const state =
      beadIndex < index ? "done" : beadIndex === index ? "now" : "todo";
    return `<span class="bead ${state}" aria-hidden="true"></span>`;
  }).join("");
}

function renderLetterChoices(choices: Letter[], enabled: boolean): void {
  els.choices.classList.remove("words");
  els.choices.innerHTML = "";
  for (const letter of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `block color-${colorFor(letter)}`;
    button.dataset.letter = letter;
    button.setAttribute("aria-label", `Letter ${letter}`);
    button.disabled = !enabled;
    button.innerHTML = `<span>${letter}</span>`;
    button.addEventListener("click", () => void onPickLetter(letter, button));
    els.choices.append(button);
  }
}

function renderWordChoices(choices: string[], enabled: boolean): void {
  els.choices.classList.add("words");
  els.choices.innerHTML = "";
  for (const text of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `block word color-${colorForWord(text)}`;
    button.dataset.word = text;
    button.setAttribute("aria-label", `Word ${text}`);
    button.disabled = !enabled;
    button.innerHTML = `<span>${text}</span>`;
    button.addEventListener("click", () => void onPickWord(text, button));
    els.choices.append(button);
  }
}

async function speakLetter(letter: Letter): Promise<void> {
  els.face.classList.add("thinking");
  els.prompt.textContent = "Listen…";
  try {
    const next = letterDeck[index + 1];
    await speak(promptFor(letter), () => {
      els.face.classList.remove("thinking");
      els.face.classList.add("talking");
      if (next) prefetch(promptFor(next));
    });
  } finally {
    els.face.classList.remove("thinking", "talking");
    if (round && !round.answered) els.prompt.textContent = "Tap the letter.";
  }
}

async function speakWord(word: Word): Promise<void> {
  els.face.classList.add("thinking");
  els.prompt.textContent = "Listen…";
  try {
    const next = wordDeck[index + 1];
    await speakText(promptForWord(word), () => {
      els.face.classList.remove("thinking");
      els.face.classList.add("talking");
      if (next) prefetchText(promptForWord(next));
    });
  } finally {
    els.face.classList.remove("thinking", "talking");
    if (round && !round.answered) els.prompt.textContent = "Tap the word.";
  }
}

async function startLetterRound(): Promise<void> {
  const letter = letterDeck[index];
  if (!letter) {
    finish();
    return;
  }
  round = {
    mode: "letters",
    letter,
    choices: choicesFor(letter),
    firstTry: true,
    answered: false,
  };
  renderBeads();
  els.scorechip.textContent = `${correctFirstTries} / ${ALPHABET.length}`;
  renderLetterChoices(round.choices, false);
  els.face.disabled = true;
  await speakLetter(letter);
  if (!round.answered) {
    renderLetterChoices(round.choices, true);
    els.face.disabled = false;
  }
}

async function startWordRound(): Promise<void> {
  const word = wordDeck[index];
  if (!word) {
    finish();
    return;
  }
  round = {
    mode: "words",
    word,
    choices: choicesForWord(word),
    firstTry: true,
    answered: false,
  };
  renderBeads();
  els.scorechip.textContent = `${correctFirstTries} / ${WORDS_PER_GAME}`;
  renderWordChoices(round.choices, false);
  els.face.disabled = true;
  await speakWord(word);
  if (!round.answered) {
    renderWordChoices(round.choices, true);
    els.face.disabled = false;
  }
}

async function startRound(): Promise<void> {
  if (mode === "letters") await startLetterRound();
  else await startWordRound();
}

async function onPickLetter(letter: Letter, button: HTMLButtonElement): Promise<void> {
  if (!round || round.mode !== "letters" || round.answered) return;
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
  if (index >= letterDeck.length) {
    finish();
    return;
  }
  await startLetterRound();
}

async function onPickWord(text: string, button: HTMLButtonElement): Promise<void> {
  if (!round || round.mode !== "words" || round.answered) return;
  playTap();

  if (text !== round.word.text) {
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
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, text[0]?.toUpperCase() ?? "★");
  await wait(720);
  index += 1;
  if (index >= wordDeck.length) {
    finish();
    return;
  }
  await startWordRound();
}

function finish(): void {
  stopSpeaking();
  playFanfare();
  const score = correctFirstTries;
  const total = totalRounds();
  els.finalScore.textContent = `${score} / ${total}`;
  if (mode === "letters") {
    els.finalNote.textContent =
      score === total
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
  } else {
    els.finalNote.textContent =
      score === total
        ? "Every word on the first try!"
        : score >= 8
          ? "Wow. Those reading eyes are sharp."
          : score >= 5
            ? "Great reading. Play again?"
            : "Nice try. Play again and listen close.";
    const starCount = score === total ? 3 : score >= 8 ? 3 : score >= 5 ? 2 : 1;
    els.stars.innerHTML = Array.from({ length: 3 }, (_, i) =>
      `<span class="star ${i < starCount ? "on" : ""}">★</span>`,
    ).join("");
  }
  burst(window.innerWidth / 2, window.innerHeight / 3, "★");
  show("score");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function bootGame(nextMode: Mode): Promise<void> {
  if (booting) return;
  booting = true;
  mode = nextMode;
  show("load");
  els.retryBtn.classList.add("hidden");
  els.loadError.classList.add("hidden");
  try {
    await loadVoice(({ label, percent }) => {
      els.progressLabel.textContent = label;
      els.progressFill.style.width = `${percent}%`;
    });
    index = 0;
    correctFirstTries = 0;
    round = null;
    if (mode === "letters") {
      letterDeck = shuffle(ALPHABET);
      wordDeck = [];
      const first = letterDeck[0];
      if (!first) throw new Error("Alphabet is empty.");
      els.progressLabel.textContent = "Practicing the first letter…";
      await prepareSpeech(promptFor(first));
    } else {
      wordDeck = deckForWords();
      letterDeck = [];
      const first = wordDeck[0];
      if (!first) throw new Error("Word list is empty.");
      els.progressLabel.textContent = "Practicing the first word…";
      await prepareText(promptForWord(first));
    }
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

els.lettersBtn.addEventListener("click", () => {
  void unlockAudio();
  void bootGame("letters");
});

els.wordsBtn.addEventListener("click", () => {
  void unlockAudio();
  void bootGame("words");
});

els.retryBtn.addEventListener("click", () => {
  void bootGame(mode);
});

els.againBtn.addEventListener("click", () => {
  void unlockAudio();
  void bootGame(mode);
});

els.homeBtn.addEventListener("click", () => {
  stopSpeaking();
  show("start");
});

els.face.addEventListener("click", () => {
  if (!round || round.answered) return;
  if (round.mode === "letters") void speakLetter(round.letter);
  else void speakWord(round.word);
});
