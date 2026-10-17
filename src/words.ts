import { shuffle, type BlockColor } from "./letters.ts";

export type Word = {
  text: string;
  phonemes: string;
  confusable: string[];
};

// Early-reader words with Misaki US phonemes (same alphabet Kokoro expects).
export const WORDS: readonly Word[] = [
  { text: "cat", phonemes: "kˈæt", confusable: ["bat", "hat", "mat"] },
  { text: "dog", phonemes: "dˈɔɡ", confusable: ["dig", "log", "fog"] },
  { text: "sun", phonemes: "sˈʌn", confusable: ["fun", "run", "bun"] },
  { text: "pig", phonemes: "pˈɪɡ", confusable: ["big", "dig", "pin"] },
  { text: "bed", phonemes: "bˈɛd", confusable: ["red", "bad", "beg"] },
  { text: "cup", phonemes: "kˈʌp", confusable: ["cap", "cut", "pup"] },
  { text: "hat", phonemes: "hˈæt", confusable: ["hot", "bat", "ham"] },
  { text: "fish", phonemes: "fˈɪʃ", confusable: ["dish", "wish", "fist"] },
  { text: "bird", phonemes: "bˈɚd", confusable: ["burn", "bard", "hard"] },
  { text: "tree", phonemes: "tɹˈiː", confusable: ["free", "three", "tee"] },
  { text: "ball", phonemes: "bˈɔl", confusable: ["bell", "tall", "call"] },
  { text: "moon", phonemes: "mˈuːn", confusable: ["soon", "moan", "noon"] },
  { text: "star", phonemes: "stˈɑɹ", confusable: ["stir", "scar", "start"] },
  { text: "book", phonemes: "bˈʊk", confusable: ["look", "boot", "cook"] },
  { text: "frog", phonemes: "fɹˈɔɡ", confusable: ["fog", "from", "dog"] },
  { text: "cake", phonemes: "kˈeɪk", confusable: ["lake", "cape", "bake"] },
  { text: "duck", phonemes: "dˈʌk", confusable: ["deck", "dark", "luck"] },
  { text: "ship", phonemes: "ʃˈɪp", confusable: ["shop", "chip", "sip"] },
  { text: "hand", phonemes: "hˈænd", confusable: ["hard", "land", "sand"] },
  { text: "jump", phonemes: "ʤˈʌmp", confusable: ["bump", "just", "dump"] },
];

export const WORDS_PER_GAME = 10;

const BLOCK_COLORS = ["tomato", "ultramarine", "grape", "grass"] as const;

export const WORD_PROMPT_INTRO = "fˈInd ðə wˈɚd,";

export function promptForWord(word: Word): string {
  return `${WORD_PROMPT_INTRO} ${word.phonemes}.`;
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
