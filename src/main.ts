import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/titan-one";
import { mountConfetti } from "./confetti.ts";
import "./game.ts";
import "./style.css";

mountConfetti(document.querySelector("#confetti")!);
