import {
  peekLayout,
  type MathKind,
  type MathProblem,
  type MunchProblem,
  type PeekProblem,
  type TenProblem,
  type TallerProblem,
} from "./math.ts";

export function clearStage(stage: HTMLElement): void {
  stage.innerHTML = "";
  stage.hidden = true;
  stage.className = "math-stage";
  stage.removeAttribute("data-kind");
}

export function showStage(stage: HTMLElement, kind: MathKind): void {
  stage.hidden = false;
  stage.className = `math-stage kind-${kind}`;
  stage.dataset.kind = kind;
}

export function renderPeekStage(stage: HTMLElement, problem: PeekProblem, covered: boolean): void {
  showStage(stage, "peek");
  const dots = peekLayout(problem.count, problem.seed)
    .map(
      (dot) =>
        `<span class="peek-dot color-${dot.color}" style="left:${dot.x}%;top:${dot.y}%"></span>`,
    )
    .join("");
  stage.innerHTML = `
    <div class="peek-board ${covered ? "covered" : ""}" aria-hidden="true">
      ${dots}
      <div class="peek-lid"><span>?</span></div>
    </div>
  `;
}

export function renderMunchStage(
  stage: HTMLElement,
  problem: MunchProblem,
  phase: "full" | "eating" | "left",
): void {
  showStage(stage, "munch");
  const cookies = Array.from({ length: problem.start }, (_, i) => {
    const gone = phase !== "full" && i < problem.eaten;
    const chomp = phase === "eating" && i < problem.eaten;
    return `<span class="cookie ${gone ? "gone" : ""} ${chomp ? "chomp" : ""}" style="--i:${i}"></span>`;
  }).join("");
  stage.innerHTML = `<div class="cookie-tray" aria-hidden="true">${cookies}</div>`;
}

export function renderTenStage(stage: HTMLElement, problem: TenProblem): void {
  showStage(stage, "ten");
  const cells = Array.from({ length: 10 }, (_, i) => {
    const filled = i < problem.shown;
    return `<span class="ten-cell ${filled ? "filled" : "empty"}"></span>`;
  }).join("");
  stage.innerHTML = `
    <div class="ten-frame" aria-hidden="true">${cells}</div>
    <p class="ten-caption">${problem.shown} + ? = 10</p>
  `;
}

export function renderTallerStage(
  stage: HTMLElement,
  problem: TallerProblem,
  enabled: boolean,
  onPick: (side: "left" | "right", button: HTMLButtonElement) => void,
): void {
  showStage(stage, "taller");
  stage.innerHTML = "";
  for (const side of ["left", "right"] as const) {
    const height = side === "left" ? problem.left : problem.right;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tower-btn side-${side}`;
    button.disabled = !enabled;
    button.setAttribute("aria-label", `${side} tower, ${height} blocks`);
    const blocks = Array.from({ length: height }, (_, i) => {
      const colors = ["tomato", "ultramarine", "grape", "grass"] as const;
      return `<span class="tower-block color-${colors[i % colors.length]}"></span>`;
    }).join("");
    button.innerHTML = `
      <span class="tower-stack">${blocks}</span>
      <span class="tower-label">${height}</span>
    `;
    button.addEventListener("click", () => onPick(side, button));
    stage.append(button);
  }
}

export function renderPlusStage(stage: HTMLElement): void {
  clearStage(stage);
}

export function renderStageFor(
  stage: HTMLElement,
  problem: MathProblem,
  options: {
    peekCovered?: boolean;
    munchPhase?: "full" | "eating" | "left";
    tallerEnabled?: boolean;
    onTallerPick?: (side: "left" | "right", button: HTMLButtonElement) => void;
  } = {},
): void {
  switch (problem.kind) {
    case "plus":
      renderPlusStage(stage);
      break;
    case "peek":
      renderPeekStage(stage, problem, options.peekCovered ?? false);
      break;
    case "munch":
      renderMunchStage(stage, problem, options.munchPhase ?? "full");
      break;
    case "ten":
      renderTenStage(stage, problem);
      break;
    case "taller":
      renderTallerStage(
        stage,
        problem,
        options.tallerEnabled ?? false,
        options.onTallerPick ?? (() => undefined),
      );
      break;
  }
}
