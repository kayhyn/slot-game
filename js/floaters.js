const RISE_SPEED = 34; // px/s the text drifts upward
const LIFE = 1.8;      // seconds before it fully fades
const MULTIPLIER_DELAY = 0.12; // seconds; roughly a few frames at 60fps

// Floating "+$N" payout numbers. They stay pinned to the reels horizontally
// (drift left with the scroll) while rising and fading in screen space.
export class PayoutTexts {
  constructor() {
    this.items = [];
  }

  spawn(x, y, amount) {
    const item = { x, y, label: `$${amount}`, age: 0, life: LIFE, kind: "payout" };
    this.items.push(item);
    return item;
  }

  spawnMultiplier(x, y, multiplier) {
    const item = {
      x,
      y,
      label: `${multiplier}x`,
      age: -MULTIPLIER_DELAY,
      life: LIFE,
      kind: "multiplier",
    };
    this.items.push(item);
    return item;
  }

  remove(item) {
    if (!item) return;
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  clear() {
    this.items.length = 0;
  }

  update(dt, scrollSpeed) {
    for (const t of this.items) {
      t.age += dt;
      if (t.age < 0) continue;
      t.x -= scrollSpeed * dt;
      t.y -= RISE_SPEED * dt;
    }
    this.items = this.items.filter((t) => t.age < t.life);
  }

  draw(ctx) {
    if (!this.items.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 44px system-ui, sans-serif";
    ctx.lineJoin = "round";
    for (const t of this.items) {
      if (t.age < 0) continue;
      const k = t.age / t.life;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      const label = t.label;
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
      ctx.strokeText(label, t.x, t.y);
      ctx.fillStyle = t.kind === "multiplier" ? "#fb923c" : "#fde047";
      ctx.fillText(label, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
