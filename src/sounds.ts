let ctx: AudioContext | null = null;

export async function unlockAudio(): Promise<void> {
  const audio = getContext();
  if (audio.state === "suspended") await audio.resume();
}

function getContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

function tone(
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  gainValue: number,
): void {
  const audio = getContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export function playTap(): void {
  const audio = getContext();
  tone(520, audio.currentTime, 0.08, "triangle", 0.08);
}

export function playCorrect(): void {
  const audio = getContext();
  const t = audio.currentTime;
  tone(523.25, t, 0.16, "triangle", 0.12);
  tone(659.25, t + 0.09, 0.16, "triangle", 0.12);
  tone(783.99, t + 0.18, 0.28, "triangle", 0.14);
}

export function playWrong(): void {
  const audio = getContext();
  const t = audio.currentTime;
  tone(196, t, 0.22, "square", 0.05);
  tone(165, t + 0.12, 0.28, "square", 0.04);
}

export function playFanfare(): void {
  const audio = getContext();
  const t = audio.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((note, index) => {
    tone(note, t + index * 0.12, 0.32, "triangle", 0.12);
  });
}
