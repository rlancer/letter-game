import { shuffle, type BlockColor } from "./letters.ts";

export const MATH_PER_GAME = 8;

export type MathKind = "plus" | "peek" | "munch" | "ten" | "taller";

export type PlusProblem = {
  kind: "plus";
  a: number;
  b: number;
  answer: number;
};

export type PeekProblem = {
  kind: "peek";
  count: number;
  answer: number;
  seed: number;
};

export type MunchProblem = {
  kind: "munch";
  start: number;
  eaten: number;
  answer: number;
};

export type TenProblem = {
  kind: "ten";
  shown: number;
  answer: number;
};

export type TallerProblem = {
  kind: "taller";
  left: number;
  right: number;
  answer: "left" | "right";
};

export type MathProblem =
  | PlusProblem
  | PeekProblem
  | MunchProblem
  | TenProblem
  | TallerProblem;

export type MathCatalogItem = {
  kind: MathKind;
  title: string;
  blurb: string;
  vibe: string;
};

export const MATH_CATALOG: readonly MathCatalogItem[] = [
  {
    kind: "plus",
    title: "Plus",
    blurb: "Hear a sum. Tap the total.",
    vibe: "3 + 2",
  },
  {
    kind: "peek",
    title: "Peek",
    blurb: "Dots flash. Count them fast.",
    vibe: "···",
  },
  {
    kind: "munch",
    title: "Munch",
    blurb: "Cookies vanish. What’s left?",
    vibe: "nom!",
  },
  {
    kind: "ten",
    title: "Ten",
    blurb: "Fill the frame. Make ten.",
    vibe: "▣▣▢",
  },
  {
    kind: "taller",
    title: "Taller",
    blurb: "Two towers. Tap the bigger one.",
    vibe: "▮ ▮▮",
  },
];

const BLOCK_COLORS = ["tomato", "ultramarine", "grape", "grass"] as const;
const MAX_SUM = 10;

export function colorForNumber(value: number): BlockColor {
  return BLOCK_COLORS[Math.abs(value) % BLOCK_COLORS.length];
}

export function catalogFor(kind: MathKind): MathCatalogItem {
  return MATH_CATALOG.find((item) => item.kind === kind) ?? MATH_CATALOG[0]!;
}

export function spokenFor(problem: MathProblem): string {
  switch (problem.kind) {
    case "plus":
      return `What is ${problem.a} plus ${problem.b}?`;
    case "peek":
      return "How many did you see?";
    case "munch":
      return `${problem.start} cookies. ${problem.eaten} get munched. How many are left?`;
    case "ten":
      return `${problem.shown} in the box. How many more to make ten?`;
    case "taller":
      return "Which tower is taller?";
  }
}

export function promptFor(problem: MathProblem): string {
  switch (problem.kind) {
    case "plus":
      return `${problem.a} + ${problem.b} = ?`;
    case "peek":
      return "How many?";
    case "munch":
      return "How many left?";
    case "ten":
      return "Make 10";
    case "taller":
      return "Tap the taller tower";
  }
}

export function answerOf(problem: MathProblem): number | "left" | "right" {
  return problem.answer;
}

function numberChoices(answer: number, max = 12): number[] {
  const picks: number[] = [answer];
  const nearby = shuffle([
    answer - 2,
    answer - 1,
    answer + 1,
    answer + 2,
    answer + 3,
  ]).filter((value) => value >= 0 && value <= max && value !== answer);

  for (const value of nearby) {
    if (picks.length >= 3) break;
    if (!picks.includes(value)) picks.push(value);
  }

  const pool = Array.from({ length: max + 1 }, (_, value) => value).filter(
    (value) => !picks.includes(value),
  );
  while (picks.length < 3 && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    const [value] = pool.splice(index, 1);
    if (value !== undefined) picks.push(value);
  }
  return shuffle(picks);
}

export function choicesFor(problem: MathProblem): number[] {
  if (problem.kind === "taller") return [];
  return numberChoices(problem.answer);
}

function allPlus(): PlusProblem[] {
  const problems: PlusProblem[] = [];
  for (let a = 0; a <= MAX_SUM; a += 1) {
    for (let b = 0; b <= MAX_SUM - a; b += 1) {
      problems.push({ kind: "plus", a, b, answer: a + b });
    }
  }
  return problems;
}

function deckPlus(): PlusProblem[] {
  return shuffle(allPlus()).slice(0, MATH_PER_GAME);
}

function deckPeek(): PeekProblem[] {
  const counts = shuffle([3, 4, 5, 6, 7, 8, 4, 5, 6, 7]).slice(0, MATH_PER_GAME);
  return counts.map((count, i) => ({
    kind: "peek",
    count,
    answer: count,
    seed: (i + 1) * 9973 + count * 13,
  }));
}

function deckMunch(): MunchProblem[] {
  const problems: MunchProblem[] = [];
  for (let start = 3; start <= 9; start += 1) {
    for (let eaten = 1; eaten < start; eaten += 1) {
      problems.push({
        kind: "munch",
        start,
        eaten,
        answer: start - eaten,
      });
    }
  }
  return shuffle(problems).slice(0, MATH_PER_GAME);
}

function deckTen(): TenProblem[] {
  const shown = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]).slice(0, MATH_PER_GAME);
  return shown.map((value) => ({
    kind: "ten",
    shown: value,
    answer: 10 - value,
  }));
}

function deckTaller(): TallerProblem[] {
  const problems: TallerProblem[] = [];
  for (let left = 1; left <= 8; left += 1) {
    for (let right = 1; right <= 8; right += 1) {
      if (left === right) continue;
      problems.push({
        kind: "taller",
        left,
        right,
        answer: left > right ? "left" : "right",
      });
    }
  }
  return shuffle(problems).slice(0, MATH_PER_GAME);
}

export function deckFor(kind: MathKind): MathProblem[] {
  switch (kind) {
    case "plus":
      return deckPlus();
    case "peek":
      return deckPeek();
    case "munch":
      return deckMunch();
    case "ten":
      return deckTen();
    case "taller":
      return deckTaller();
  }
}

export function finishNote(kind: MathKind, score: number, total: number): string {
  if (score === total) {
    switch (kind) {
      case "plus":
        return "Every sum on the first try!";
      case "peek":
        return "Eagle eyes. You caught every peek!";
      case "munch":
        return "Cookie detective. Nothing gets past you!";
      case "ten":
        return "Ten-frame champion!";
      case "taller":
        return "Tower judge. Spot on!";
    }
  }
  if (score >= 6) {
    switch (kind) {
      case "plus":
        return "Wow. That adding brain is sharp.";
      case "peek":
        return "Quick peeks. Strong counting.";
      case "munch":
        return "Those munches didn’t trick you.";
      case "ten":
        return "You’re getting cozy with ten.";
      case "taller":
        return "You can spot a taller tower.";
    }
  }
  if (score >= 4) {
    return "Nice round. Play again?";
  }
  return "Nice try. One more round!";
}

export function finishStars(score: number, total: number): number {
  if (score === total) return 3;
  if (score >= Math.ceil(total * 0.75)) return 3;
  if (score >= Math.ceil(total * 0.5)) return 2;
  return 1;
}

/** Deterministic pseudo-positions for peek dots from a seed. */
export function peekLayout(
  count: number,
  seed: number,
): Array<{ x: number; y: number; color: BlockColor }> {
  const dots: Array<{ x: number; y: number; color: BlockColor }> = [];
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = 0; i < count; i += 1) {
    dots.push({
      x: 12 + next() * 76,
      y: 14 + next() * 62,
      color: BLOCK_COLORS[i % BLOCK_COLORS.length],
    });
  }
  return dots;
}
