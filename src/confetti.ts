type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  rotation: number;
  size: number;
  color: string;
  glyph: string;
  life: number;
};

const COLORS = ["#FF3D2E", "#1E4FD8", "#7A3CFF", "#19C37D", "#FFE566", "#FF8A3D"];

let canvas: HTMLCanvasElement | null = null;
let particles: Particle[] = [];
let raf = 0;

export function mountConfetti(node: HTMLCanvasElement): void {
  canvas = node;
  resize();
  window.addEventListener("resize", resize);
}

function resize(): void {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

export function burst(x: number, y: number, glyph = "★"): void {
  if (!canvas) return;
  for (let i = 0; i < 28; i += 1) {
    const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4;
    const speed = 4 + Math.random() * 8;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      spin: (Math.random() - 0.5) * 0.4,
      rotation: Math.random() * Math.PI,
      size: 12 + Math.random() * 16,
      color: COLORS[i % COLORS.length],
      glyph: Math.random() < 0.45 ? glyph : "●",
      life: 1,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(): void {
  const node = canvas;
  const ctx = node?.getContext("2d");
  if (!node || !ctx) {
    raf = 0;
    return;
  }

  ctx.clearRect(0, 0, node.width, node.height);
  particles = particles.filter((particle) => particle.life > 0.04);
  for (const particle of particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.28;
    particle.vx *= 0.99;
    particle.rotation += particle.spin;
    particle.life -= 0.012;
    ctx.save();
    ctx.globalAlpha = Math.max(particle.life, 0);
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.fillStyle = particle.color;
    ctx.font = `800 ${particle.size}px Nunito, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(particle.glyph, 0, 0);
    ctx.restore();
  }

  if (particles.length) {
    raf = requestAnimationFrame(tick);
  } else {
    ctx.clearRect(0, 0, node.width, node.height);
    raf = 0;
  }
}
