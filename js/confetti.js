const COLORS = ["#ef4444", "#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#facc15"];

export class Confetti {
  constructor() {
    this.particles = [];
  }

  burst(x, y, count = 80) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 180 + Math.random() * 320;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120,
        w: 4 + Math.random() * 6,
        h: 6 + Math.random() * 8,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 14,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1.2 + Math.random() * 0.6,
        age: 0,
      });
    }
  }

  update(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  draw(ctx) {
    for (const p of this.particles) {
      const alpha = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
}
