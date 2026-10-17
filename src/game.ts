import { burst } from "./confetti.ts";
import {
  ALPHABET,
  choicesFor,
  colorFor,
  promptFor,
  shuffle,
  type Letter,
} from "./letters.ts";
import {
  prepareBrowserSpeech,
  speakBrowser,
  stopBrowserSpeech,
} from "./browser-speech.ts";
import { playCorrect, playFanfare, playTap, playWrong, unlockAudio } from "./sounds.ts";
import { loadVoice, prefetch, prepareSpeech, speak, stopSpeaking } from "./tts.ts";
import {
  catalogFor,
  choicesFor as mathChoicesFor,
  colorForNumber,
  deckFor,
  finishNote,
  finishStars,
  MATH_CATALOG,
  MATH_PER_GAME,
  promptFor as mathPromptFor,
  spokenFor,
  type MathKind,
  type MathProblem,
} from "./math.ts";
import { clearStage, renderStageFor } from "./math-stage.ts";
import {
  choicesForWord,
  colorForWord,
  deckForWords,
  spokenWord,
  WORDS_PER_GAME,
  type Word,
} from "./words.ts";

type ScreenName = "start" | "math" | "load" | "play" | "score";
type Mode = "letters" | "words" | "math";

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

type MathRound = {
  mode: "math";
  problem: MathProblem;
  choices: number[];
  firstTry: boolean;
  answered: boolean;
};

type Round = LetterRound | WordRound | MathRound;

const els = {
  start: document.querySelector("#screen-start")!,
  math: document.querySelector("#screen-math")!,
  load: document.querySelector("#screen-load")!,
  play: document.querySelector<HTMLElement>("#screen-play")!,
  score: document.querySelector("#screen-score")!,
  lettersBtn: document.querySelector<HTMLButtonElement>("#letters-btn")!,
  wordsBtn: document.querySelector<HTMLButtonElement>("#words-btn")!,
  mathBtn: document.querySelector<HTMLButtonElement>("#math-btn")!,
  mathPicks: document.querySelector("#math-picks")!,
  mathBackBtn: document.querySelector<HTMLButtonElement>("#math-back-btn")!,
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
  playHint: document.querySelector("#play-hint")!,
  stage: document.querySelector<HTMLElement>("#stage")!,
  choices: document.querySelector("#choices")!,
  finalScore: document.querySelector("#final-score")!,
  finalNote: document.querySelector("#final-note")!,
  stars: document.querySelector("#stars")!,
};

let mode: Mode = "letters";
let mathKind: MathKind = "plus";
let letterDeck: Letter[] = [];
let wordDeck: Word[] = [];
let mathDeck: MathProblem[] = [];
let index = 0;
let correctFirstTries = 0;
let round: Round | null = null;
let booting = false;
let peekRevealToken = 0;

function totalRounds(): number {
  if (mode === "letters") return ALPHABET.length;
  if (mode === "words") return WORDS_PER_GAME;
  return MATH_PER_GAME;
}

function show(screen: ScreenName): void {
  for (const [name, node] of Object.entries({
    start: els.start,
    math: els.math,
    load: els.load,
    play: els.play,
    score: els.score,
  })) {
    const active = name === screen;
    node.classList.toggle("hidden", !active);
    node.setAttribute("aria-hidden", active ? "false" : "true");
  }
}

function renderMathPicker(): void {
  els.mathPicks.innerHTML = "";
  for (const item of MATH_CATALOG) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "math-pick";
    button.dataset.kind = item.kind;
    button.innerHTML = `
      <span class="vibe">${item.vibe}</span>
      <span class="pick-title">${item.title}</span>
      <p class="pick-blurb">${item.blurb}</p>
    `;
    button.addEventListener("click", () => {
      void unlockAudio();
      void bootMath(item.kind);
    });
    els.mathPicks.append(button);
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
  els.choices.classList.remove("words", "math");
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
  els.choices.classList.remove("math");
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

function renderMathChoices(choices: number[], enabled: boolean): void {
  els.choices.classList.remove("words");
  els.choices.classList.add("math");
  els.choices.innerHTML = "";
  for (const value of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `block number color-${colorForNumber(value)}`;
    button.dataset.value = String(value);
    button.setAttribute("aria-label", `Number ${value}`);
    button.disabled = !enabled;
    button.innerHTML = `<span>${value}</span>`;
    button.addEventListener("click", () => void onPickMath(value, button));
    els.choices.append(button);
  }
}

function setPlayChrome(kind: MathKind | null): void {
  if (kind) {
    els.play.dataset.math = kind;
    els.playHint.textContent =
      kind === "taller"
        ? "Tap a tower"
        : kind === "peek"
          ? "Watch close, then tap"
          : "Tap the face to hear it again";
  } else {
    delete els.play.dataset.math;
    els.playHint.textContent = "Tap the face to hear it again";
    clearStage(els.stage);
  }
}

function prefetchLetterAhead(fromIndex: number, count = 2): void {
  for (let offset = 1; offset <= count; offset += 1) {
    const letter = letterDeck[fromIndex + offset];
    if (letter) prefetch(promptFor(letter));
  }
}

async function speakLetter(letter: Letter): Promise<void> {
  els.face.classList.add("thinking");
  els.prompt.textContent = "Listen…";
  try {
    await speak(promptFor(letter), () => {
      els.face.classList.remove("thinking");
      els.face.classList.add("talking");
      prefetchLetterAhead(index, 2);
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
    await speakBrowser(spokenWord(word), () => {
      els.face.classList.remove("thinking");
      els.face.classList.add("talking");
    });
  } finally {
    els.face.classList.remove("thinking", "talking");
    if (round && !round.answered) els.prompt.textContent = "Tap the word.";
  }
}

async function speakMathLine(problem: MathProblem, afterText: string): Promise<void> {
  els.face.classList.add("thinking");
  try {
    await speakBrowser(spokenFor(problem), () => {
      els.face.classList.remove("thinking");
      els.face.classList.add("talking");
    });
  } finally {
    els.face.classList.remove("thinking", "talking");
    if (round && round.mode === "math" && !round.answered) {
      els.prompt.textContent = afterText;
    }
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
  try {
    await speakLetter(letter);
  } finally {
    if (round && round.mode === "letters" && !round.answered) {
      renderLetterChoices(round.choices, true);
      els.face.disabled = false;
    }
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
  try {
    await speakWord(word);
  } finally {
    if (round && round.mode === "words" && !round.answered) {
      renderWordChoices(round.choices, true);
      els.face.disabled = false;
    }
  }
}

async function startPlusRound(problem: Extract<MathProblem, { kind: "plus" }>): Promise<void> {
  round = {
    mode: "math",
    problem,
    choices: mathChoicesFor(problem),
    firstTry: true,
    answered: false,
  };
  clearStage(els.stage);
  renderMathChoices(round.choices, false);
  els.face.disabled = true;
  els.prompt.textContent = "Listen…";
  try {
    await speakMathLine(problem, mathPromptFor(problem));
  } finally {
    if (round && round.mode === "math" && !round.answered) {
      renderMathChoices(round.choices, true);
      els.face.disabled = false;
    }
  }
}

async function startPeekRound(problem: Extract<MathProblem, { kind: "peek" }>): Promise<void> {
  const token = ++peekRevealToken;
  round = {
    mode: "math",
    problem,
    choices: mathChoicesFor(problem),
    firstTry: true,
    answered: false,
  };
  els.choices.innerHTML = "";
  els.face.disabled = true;
  els.prompt.textContent = "Peek…";
  renderStageFor(els.stage, problem, { peekCovered: false });
  await wait(1200);
  if (token !== peekRevealToken || !round || round.answered) return;
  renderStageFor(els.stage, problem, { peekCovered: true });
  els.prompt.textContent = "How many?";
  renderMathChoices(round.choices, false);
  try {
    await speakMathLine(problem, mathPromptFor(problem));
  } finally {
    if (round && round.mode === "math" && !round.answered && token === peekRevealToken) {
      renderMathChoices(round.choices, true);
      els.face.disabled = false;
    }
  }
}

async function startMunchRound(problem: Extract<MathProblem, { kind: "munch" }>): Promise<void> {
  round = {
    mode: "math",
    problem,
    choices: mathChoicesFor(problem),
    firstTry: true,
    answered: false,
  };
  renderMathChoices([], false);
  els.choices.innerHTML = "";
  els.face.disabled = true;
  els.prompt.textContent = "Watch the cookies…";
  renderStageFor(els.stage, problem, { munchPhase: "full" });
  await speakMathLine(problem, mathPromptFor(problem));
  if (!round || round.answered) return;
  renderStageFor(els.stage, problem, { munchPhase: "eating" });
  await wait(560);
  if (!round || round.answered) return;
  renderStageFor(els.stage, problem, { munchPhase: "left" });
  renderMathChoices(round.choices, true);
  els.face.disabled = false;
  els.prompt.textContent = mathPromptFor(problem);
}

async function startTenRound(problem: Extract<MathProblem, { kind: "ten" }>): Promise<void> {
  round = {
    mode: "math",
    problem,
    choices: mathChoicesFor(problem),
    firstTry: true,
    answered: false,
  };
  renderStageFor(els.stage, problem);
  renderMathChoices(round.choices, false);
  els.face.disabled = true;
  els.prompt.textContent = "Look at the frame…";
  try {
    await speakMathLine(problem, mathPromptFor(problem));
  } finally {
    if (round && round.mode === "math" && !round.answered) {
      renderMathChoices(round.choices, true);
      els.face.disabled = false;
    }
  }
}

async function startTallerRound(problem: Extract<MathProblem, { kind: "taller" }>): Promise<void> {
  round = {
    mode: "math",
    problem,
    choices: [],
    firstTry: true,
    answered: false,
  };
  els.choices.innerHTML = "";
  els.face.disabled = true;
  els.prompt.textContent = "Look…";
  renderStageFor(els.stage, problem, {
    tallerEnabled: false,
    onTallerPick: (side, button) => void onPickTaller(side, button),
  });
  try {
    await speakMathLine(problem, mathPromptFor(problem));
  } finally {
    if (round && round.mode === "math" && !round.answered) {
      renderStageFor(els.stage, problem, {
        tallerEnabled: true,
        onTallerPick: (side, button) => void onPickTaller(side, button),
      });
      els.face.disabled = false;
    }
  }
}

async function startMathRound(): Promise<void> {
  const problem = mathDeck[index];
  if (!problem) {
    finish();
    return;
  }
  renderBeads();
  els.scorechip.textContent = `${correctFirstTries} / ${MATH_PER_GAME}`;
  setPlayChrome(problem.kind);

  switch (problem.kind) {
    case "plus":
      await startPlusRound(problem);
      break;
    case "peek":
      await startPeekRound(problem);
      break;
    case "munch":
      await startMunchRound(problem);
      break;
    case "ten":
      await startTenRound(problem);
      break;
    case "taller":
      await startTallerRound(problem);
      break;
  }
}

async function startRound(): Promise<void> {
  if (mode === "letters") await startLetterRound();
  else if (mode === "words") await startWordRound();
  else await startMathRound();
}

async function advanceMath(): Promise<void> {
  index += 1;
  if (index >= mathDeck.length) {
    finish();
    return;
  }
  await startMathRound();
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

async function onPickMath(value: number, button: HTMLButtonElement): Promise<void> {
  if (!round || round.mode !== "math" || round.answered) return;
  if (round.problem.kind === "taller") return;
  playTap();

  if (value !== round.problem.answer) {
    round.firstTry = false;
    button.classList.add("wrong");
    playWrong();
    els.prompt.textContent = "Try again!";
    window.setTimeout(() => {
      button.classList.remove("wrong");
      if (round && round.mode === "math" && !round.answered) {
        els.prompt.textContent = mathPromptFor(round.problem);
      }
    }, 420);
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
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, String(value));
  await wait(720);
  await advanceMath();
}

async function onPickTaller(
  side: "left" | "right",
  button: HTMLButtonElement,
): Promise<void> {
  if (!round || round.mode !== "math" || round.answered) return;
  if (round.problem.kind !== "taller") return;
  playTap();

  if (side !== round.problem.answer) {
    round.firstTry = false;
    button.classList.add("wrong");
    playWrong();
    els.prompt.textContent = "Try again!";
    window.setTimeout(() => {
      button.classList.remove("wrong");
      if (round && round.mode === "math" && !round.answered) {
        els.prompt.textContent = mathPromptFor(round.problem);
      }
    }, 420);
    return;
  }

  round.answered = true;
  if (round.firstTry) correctFirstTries += 1;
  button.classList.add("right");
  for (const node of els.stage.querySelectorAll<HTMLButtonElement>("button")) {
    node.disabled = true;
  }
  els.face.disabled = true;
  playCorrect();
  els.prompt.textContent = "Yes!";
  const rect = button.getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, "▲");
  await wait(720);
  await advanceMath();
}

function finish(): void {
  stopSpeaking();
  stopBrowserSpeech();
  peekRevealToken += 1;
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
  } else if (mode === "words") {
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
  } else {
    els.finalNote.textContent = finishNote(mathKind, score, total);
    const starCount = finishStars(score, total);
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

async function bootGame(nextMode: "letters" | "words"): Promise<void> {
  if (booting) return;
  booting = true;
  mode = nextMode;
  setPlayChrome(null);
  show("load");
  els.retryBtn.classList.add("hidden");
  els.loadError.classList.add("hidden");
  try {
    index = 0;
    correctFirstTries = 0;
    round = null;
    mathDeck = [];
    if (mode === "letters") {
      await loadVoice(({ label, percent }) => {
        els.progressLabel.textContent = label;
        els.progressFill.style.width = `${percent}%`;
      });
      letterDeck = shuffle(ALPHABET);
      wordDeck = [];
      const first = letterDeck[0];
      if (!first) throw new Error("Alphabet is empty.");
      els.progressLabel.textContent = "Practicing the first letter…";
      await prepareSpeech(promptFor(first));
      prefetchLetterAhead(0, 3);
      show("play");
      await startRound();
    } else {
      els.progressLabel.textContent = "Getting the word voice ready…";
      els.progressFill.style.width = "40%";
      await prepareBrowserSpeech();
      els.progressFill.style.width = "100%";
      wordDeck = deckForWords();
      letterDeck = [];
      if (!wordDeck[0]) throw new Error("Word list is empty.");
      show("play");
      await startRound();
    }
  } catch (error) {
    const missing = error instanceof Error && error.message === "missing-model";
    els.loadError.textContent = missing
      ? "The letter voice is not downloaded yet. In a terminal, run mise run setup."
      : mode === "words"
        ? "The word voice could not start. Try Chrome or Edge, then try again."
        : "The letter voice could not start. Check the browser console, then try again.";
    els.loadError.classList.remove("hidden");
    els.retryBtn.classList.remove("hidden");
    els.progressLabel.textContent = "Need a little help.";
  } finally {
    booting = false;
  }
}

async function bootMath(kind: MathKind): Promise<void> {
  if (booting) return;
  booting = true;
  mode = "math";
  mathKind = kind;
  show("load");
  els.retryBtn.classList.add("hidden");
  els.loadError.classList.add("hidden");
  try {
    index = 0;
    correctFirstTries = 0;
    round = null;
    letterDeck = [];
    wordDeck = [];
    const title = catalogFor(kind).title;
    els.progressLabel.textContent = `Warming up ${title}…`;
    els.progressFill.style.width = "40%";
    await prepareBrowserSpeech();
    els.progressFill.style.width = "100%";
    mathDeck = deckFor(kind);
    if (!mathDeck[0]) throw new Error("Math deck is empty.");
    setPlayChrome(kind);
    show("play");
    await startRound();
  } catch {
    els.loadError.textContent =
      "The voice could not start. Try Chrome or Edge, then try again.";
    els.loadError.classList.remove("hidden");
    els.retryBtn.classList.remove("hidden");
    els.progressLabel.textContent = "Need a little help.";
  } finally {
    booting = false;
  }
}

renderMathPicker();

els.lettersBtn.addEventListener("click", () => {
  void unlockAudio();
  void bootGame("letters");
});

els.wordsBtn.addEventListener("click", () => {
  void unlockAudio();
  void bootGame("words");
});

els.mathBtn.addEventListener("click", () => {
  void unlockAudio();
  show("math");
});

els.mathBackBtn.addEventListener("click", () => {
  show("start");
});

els.retryBtn.addEventListener("click", () => {
  if (mode === "math") void bootMath(mathKind);
  else void bootGame(mode);
});

els.againBtn.addEventListener("click", () => {
  void unlockAudio();
  if (mode === "math") void bootMath(mathKind);
  else void bootGame(mode);
});

els.homeBtn.addEventListener("click", () => {
  stopSpeaking();
  stopBrowserSpeech();
  peekRevealToken += 1;
  clearStage(els.stage);
  setPlayChrome(null);
  if (mode === "math") show("math");
  else show("start");
});

els.face.addEventListener("click", () => {
  if (!round || round.answered) return;
  if (round.mode === "letters") void speakLetter(round.letter);
  else if (round.mode === "words") void speakWord(round.word);
  else void speakMathLine(round.problem, mathPromptFor(round.problem));
});
