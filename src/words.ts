import { shuffle, type BlockColor } from "./letters.ts";

export type Word = {
  text: string;
  confusable: string[];
};

// Early-reader words. Spoken as plain English (Kokoro + eSpeak know these).
export const WORDS: readonly Word[] = [
  { text: "cat", confusable: ["bat", "hat", "mat"] },
  { text: "dog", confusable: ["dig", "log", "fog"] },
  { text: "sun", confusable: ["fun", "run", "bun"] },
  { text: "pig", confusable: ["big", "dig", "pin"] },
  { text: "bed", confusable: ["red", "bad", "beg"] },
  { text: "cup", confusable: ["cap", "cut", "pup"] },
  { text: "hat", confusable: ["hot", "bat", "ham"] },
  { text: "fish", confusable: ["dish", "wish", "fist"] },
  { text: "bird", confusable: ["burn", "bard", "hard"] },
  { text: "tree", confusable: ["free", "three", "tee"] },
  { text: "ball", confusable: ["bell", "tall", "call"] },
  { text: "moon", confusable: ["soon", "moan", "noon"] },
  { text: "star", confusable: ["stir", "scar", "start"] },
  { text: "book", confusable: ["look", "boot", "cook"] },
  { text: "frog", confusable: ["fog", "from", "dog"] },
  { text: "cake", confusable: ["lake", "cape", "bake"] },
  { text: "duck", confusable: ["deck", "dark", "luck"] },
  { text: "ship", confusable: ["shop", "chip", "sip"] },
  { text: "hand", confusable: ["hard", "land", "sand"] },
  { text: "jump", confusable: ["bump", "just", "dump"] },
];

export const WORDS_PER_GAME = 10;

const BLOCK_COLORS = ["tomato", "ultramarine", "grape", "grass"] as const;

export const WORD_PROMPT_INTRO = "Find the word,";

export function spokenWord(word: Word): string {
  return word.text;
}

export function promptForWord(word: Word): string {
  return `${WORD_PROMPT_INTRO} ${word.text}.`;
}

export function colorForWord(text: string): BlockColor {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash + text.charCodeAt(i) * (i + 1)) % 997;
  }
  return BLOCK_COLORS[hash % BLOCK_COLORS.length];
}

export function deckForWords(): Word[] {
  return shuffle(WORDS).slice(0, WORDS_PER_GAME);
}

export function choicesForWord(answer: Word): string[] {
  const picks: string[] = [];
  const lookalikes = answer.confusable.filter((text) => text !== answer.text);
  const preferred = shuffle(lookalikes);
  for (const text of preferred) {
    if (picks.length >= 2) break;
    picks.push(text);
  }
  const pool = WORDS.map((word) => word.text).filter(
    (text) => text !== answer.text && !picks.includes(text),
  );
  while (picks.length < 2 && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    const [text] = pool.splice(index, 1);
    if (text) picks.push(text);
  }
  return shuffle([answer.text, ...picks]);
}
