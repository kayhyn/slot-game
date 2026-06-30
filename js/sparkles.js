const MAX_PARTICLES = 160;

export class Sparkles {
  constructor() {
    this.particles = [];
  }

  burst(x, y, count = 24, intense = false) {
    const room = MAX_PARTICLES - this.particles.length;
    count = Math.min(count, Math.max(0, room));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = intense
        ? 160 + Math.random() * 280
        : 90 + Math.random() * 180;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (intense ? 80 : 50),
        size: intense ? 3 + Math.random() * 5 : 2 + Math.random() * 3,
        life: intense ? 0.7 + Math.random() * 0.5 : 0.45 + Math.random() * 0.35,
        age: 0,
      });
    }
  }

  update(dt) {
    let w = 0;
    for (let r = 0; r < this.particles.length; r++) {
      const p = this.particles[r];
      p.age += dt;
      p.vy -= 28 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age < p.life) {
        if (w !== r) this.particles[w] = p;
        w++;
      }
    }
    this.particles.length = w;
  }

  draw(ctx) {
    if (!this.particles.length) return;
    ctx.fillStyle = "#fde68a";
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.age / p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
