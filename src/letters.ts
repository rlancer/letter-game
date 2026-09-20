export const ALPHABET = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
] as const;

export type Letter = (typeof ALPHABET)[number];

const LETTER_NAMES: Record<Letter, string> = {
  A: "ay",
  B: "bee",
  C: "see",
  D: "dee",
  E: "ee",
  F: "eff",
  G: "jee",
  H: "aitch",
  I: "eye",
  J: "jay",
  K: "kay",
  L: "ell",
  M: "em",
  N: "en",
  O: "oh",
  P: "pee",
  Q: "cue",
  R: "are",
  S: "ess",
  T: "tee",
  U: "you",
  V: "vee",
  W: "double you",
  X: "ex",
  Y: "why",
  Z: "zee",
};

const CONFUSABLES: Partial<Record<Letter, Letter[]>> = {
  B: ["D", "P"],
  C: ["G", "O"],
  D: ["B", "P"],
  E: ["F"],
  F: ["E", "P"],
  G: ["C", "Q"],
  I: ["J", "L"],
  J: ["I"],
  L: ["I", "T"],
  M: ["N", "W"],
  N: ["M", "H"],
  O: ["C", "Q"],
  P: ["B", "Q"],
  Q: ["O", "P"],
  U: ["V", "W"],
  V: ["U", "W"],
  W: ["M", "V"],
};

const BLOCK_COLORS = ["tomato", "ultramarine", "grape", "grass"] as const;
export type BlockColor = (typeof BLOCK_COLORS)[number];

export function letterName(letter: Letter): string {
  return LETTER_NAMES[letter];
}

export function promptFor(letter: Letter): string {
  return `Find the letter ${letterName(letter)}.`;
}

export function colorFor(letter: Letter): BlockColor {
  return BLOCK_COLORS[letter.charCodeAt(0) % BLOCK_COLORS.length];
}

export function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const left = next[i];
    const right = next[j];
    if (left === undefined || right === undefined) continue;
    next[i] = right;
    next[j] = left;
  }
  return next;
}

export function choicesFor(answer: Letter): Letter[] {
  const pool = ALPHABET.filter((letter) => letter !== answer);
  const picks: Letter[] = [];
  const lookalikes = CONFUSABLES[answer] ?? [];
  if (lookalikes.length > 0 && Math.random() < 0.65) {
    const lookalike = lookalikes[Math.floor(Math.random() * lookalikes.length)];
    if (lookalike) picks.push(lookalike);
  }
  while (picks.length < 2) {
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    if (candidate && !picks.includes(candidate)) picks.push(candidate);
  }
  return shuffle([answer, ...picks]);
}
