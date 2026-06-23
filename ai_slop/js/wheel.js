import {
  REEL_WIDTH,
  SYMBOL_SIZE,
  SYMBOL_SPACING,
  SPIN_SPEED_MIN,
  SPIN_SPEED_MAX,
  BACKWARD_CHANCE,
  NUM_SLOTS,
  HOLD_DECEL,
  SPIN_MULT_BASE,
  MATCH_GLOW_DURATION,
} from "./constants.js";

// The symbol set. Each entry is a glyph + tile color.
const SYMBOLS = [
  { g: "7", c: "#ef4444" },
  { g: "\u2605", c: "#f59e0b" }, // star
  { g: "\u25C6", c: "#38bdf8" }, // diamond
  { g: "\u25B2", c: "#a78bfa" }, // triangle
  { g: "\u25CF", c: "#34d399" }, // circle
  { g: "\u25A0", c: "#f472b6" }, // square
];

let nextWheelId = 0;

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const STRIP_HEIGHT = NUM_SLOTS * SYMBOL_SPACING;

// Pre-render each symbol once to an offscreen canvas so tiles never flash in
// (no per-frame text/path rendering, no waiting on font/layout).
const TILE_SCALE = 2; // render at 2x for crisp scaling on hi-dpi screens
const SYMBOL_TILES = SYMBOLS.map((sym) => {
  const c = document.createElement("canvas");
  c.width = SYMBOL_SIZE * TILE_SCALE;
  c.height = SYMBOL_SIZE * TILE_SCALE;
  const g = c.getContext("2d");
  g.scale(TILE_SCALE, TILE_SCALE);
  roundRect(g, 0, 0, SYMBOL_SIZE, SYMBOL_SIZE, 14);
  g.fillStyle = sym.c;
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold ${Math.floor(SYMBOL_SIZE * 0.5)}px system-ui, sans-serif`;
  g.fillText(sym.g, SYMBOL_SIZE / 2, SYMBOL_SIZE / 2 + 2);
  return c;
});

// Positive modulo so backward-spinning reels (negative spin) wrap correctly.
function wrap(value, range) {
  return ((value % range) + range) % range;
}

export function symbolInZone(y, zoneTop, zoneBottom) {
  const overlap =
    Math.min(y + SYMBOL_SIZE, zoneBottom) - Math.max(y, zoneTop);
  return overlap > SYMBOL_SIZE * 0.5;
}

export class Wheel {
  constructor(screenX, spinMult = SPIN_MULT_BASE) {
    this.id = nextWheelId++;
    this.x = screenX;            // screen-space left edge
    this.width = REEL_WIDTH;
    this.spin = Math.random() * STRIP_HEIGHT; // random starting phase
    this.spinMult = spinMult;
    this.spinSpeed = this.randomSpinSpeed();
    this.slots = Array.from(
      { length: NUM_SLOTS },
      () => (Math.random() * SYMBOLS.length) | 0,
    );
    this.frozen = false;
    this.stopping = false;
    this.pendingMatchCheck = false;
    this.glowSlot = -1;
    this.glowTime = 0;
  }

  update(dt, scrollSpeed) {
    this.x -= scrollSpeed * dt;
    if (this.glowTime > 0) this.glowTime = Math.max(0, this.glowTime - dt);
    if (this.stopping) {
      this.updateHold(dt);
    } else if (!this.frozen) {
      this.spin += this.spinSpeed * dt;
    }
  }

  beginHold() {
    if (this.frozen || this.stopping) return;
    this.heldSpinSpeed = this.spinSpeed;
    this.stopping = true;
  }

  toggleHold() {
    if (this.stopping) {
      this.resumeSpin();
    } else if (this.frozen) {
      this.releaseHold();
    } else {
      this.beginHold();
    }
  }

  resumeSpin() {
    this.stopping = false;
    this.frozen = false;
    this.pendingMatchCheck = false;
    this.glowTime = 0;
    this.spinSpeed = this.heldSpinSpeed;
  }

  releaseHold() {
    this.resumeSpin();
  }

  randomSpinSpeed() {
    const dir = Math.random() < BACKWARD_CHANCE ? -1 : 1;
    const mag =
      SPIN_SPEED_MIN +
      Math.random() * (SPIN_SPEED_MAX - SPIN_SPEED_MIN);
    return dir * mag * this.spinMult;
  }

  refreshSpinMult(spinMult) {
    if (this.frozen || this.stopping || this.spinMult === spinMult) return;
    const ratio = spinMult / this.spinMult;
    this.spinSpeed *= ratio;
    this.spinMult = spinMult;
  }

  updateHold(dt) {
    const dir = Math.sign(this.spinSpeed);
    const speed = Math.abs(this.spinSpeed);

    if (speed <= 2) {
      this.spinSpeed = 0;
      this.finishHold();
      return;
    }

    const next = Math.max(0, speed - HOLD_DECEL * dt);
    this.spinSpeed = dir * next;
    this.spin += this.spinSpeed * dt;
  }

  finishHold() {
    this.spinSpeed = 0;
    this.stopping = false;
    this.frozen = true;
    this.pendingMatchCheck = true;
  }

  zoneSlot(stripTop, zoneTop, zoneBottom) {
    let best = -1;
    let bestOverlap = 0;
    const minOverlap = SYMBOL_SIZE * 0.5;
    for (let i = 0; i < NUM_SLOTS; i++) {
      const y = this.slotY(i, stripTop);
      const overlap =
        Math.min(y + SYMBOL_SIZE, zoneBottom) - Math.max(y, zoneTop);
      if (overlap > minOverlap && overlap > bestOverlap) {
        bestOverlap = overlap;
        best = i;
      }
    }
    return best;
  }

  zoneSymbolIndex(stripTop, zoneTop, zoneBottom) {
    const slot = this.zoneSlot(stripTop, zoneTop, zoneBottom);
    return slot >= 0 ? this.slots[slot] : -1;
  }

  symbolCenter(stripTop, slot) {
    const inset = (this.width - SYMBOL_SIZE) / 2;
    return {
      x: this.x + inset + SYMBOL_SIZE / 2,
      y: this.slotY(slot, stripTop) + SYMBOL_SIZE / 2,
    };
  }

  triggerMatchGlow(slot) {
    this.glowSlot = slot;
    this.glowTime = MATCH_GLOW_DURATION;
  }

  // Vertical (top) position of slot i within the reel face.
  slotY(i, reelTop) {
    return reelTop + wrap(i * SYMBOL_SPACING + this.spin, STRIP_HEIGHT);
  }

  // Symbols the player can currently stand on: fully inside the visible reel face.
  // Positions use the extended strip anchor so wrap jumps stay outside the viewport.
  getPlatforms(reelTop, reelBottom, stripTop) {
    const platforms = [];
    const inset = (this.width - SYMBOL_SIZE) / 2;
    const vy = this.frozen ? 0 : this.spinSpeed;
    for (let i = 0; i < NUM_SLOTS; i++) {
      const y = this.slotY(i, stripTop);
      if (y >= reelTop && y + SYMBOL_SIZE <= reelBottom) {
        platforms.push({
          x: this.x + inset,
          y,
          width: SYMBOL_SIZE,
          height: SYMBOL_SIZE,
          wheel: this,
          vy,
        });
      }
    }
    return platforms;
  }

  drawMatchGlow(ctx, stripTop) {
    if (this.glowTime <= 0 || this.glowSlot < 0) return;
    const inset = (this.width - SYMBOL_SIZE) / 2;
    const y = this.slotY(this.glowSlot, stripTop);
    const tx = this.x + inset;
    const glowT = this.glowTime / MATCH_GLOW_DURATION;
    const tile = SYMBOL_TILES[this.slots[this.glowSlot]];
    const cx = tx + SYMBOL_SIZE / 2;
    const cy = y + SYMBOL_SIZE / 2;
    const pad = 10 + 8 * glowT;

    const glow = ctx.createRadialGradient(cx, cy, SYMBOL_SIZE * 0.15, cx, cy, SYMBOL_SIZE * 0.65 + pad);
    glow.addColorStop(0, `rgba(253, 224, 71, ${0.55 * glowT})`);
    glow.addColorStop(1, "rgba(253, 224, 71, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(tx - pad, y - pad, SYMBOL_SIZE + pad * 2, SYMBOL_SIZE + pad * 2);

    ctx.drawImage(tile, tx, y, SYMBOL_SIZE, SYMBOL_SIZE);

    ctx.strokeStyle = `rgba(253, 224, 71, ${0.9 * glowT})`;
    ctx.lineWidth = 3 + 3 * glowT;
    roundRect(ctx, tx - 3, y - 3, SYMBOL_SIZE + 6, SYMBOL_SIZE + 6, 16);
    ctx.stroke();
  }

  draw(ctx, reelTop, reelBottom, stripTop, stripBottom, zoneTop, zoneBottom) {
    const faceH = reelBottom - reelTop;
    const stripH = stripBottom - stripTop;
    const inset = (this.width - SYMBOL_SIZE) / 2;
    const zoneSlot = this.zoneSlot(stripTop, zoneTop, zoneBottom);

    ctx.save();
    // Clip to the extended strip; UI masks hide the buffer above/below the face.
    roundRect(ctx, this.x, stripTop, this.width, stripH, 14);
    ctx.clip();

    // Reel backdrop
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(this.x, stripTop, this.width, stripH);

    // Symbols (pre-rendered tiles, just blitted)
    for (let i = 0; i < NUM_SLOTS; i++) {
      const y = this.slotY(i, stripTop);
      const tx = this.x + inset;
      ctx.drawImage(SYMBOL_TILES[this.slots[i]], tx, y, SYMBOL_SIZE, SYMBOL_SIZE);

      if (i === zoneSlot) {
        ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
        ctx.lineWidth = 2;
        roundRect(ctx, tx - 2, y - 2, SYMBOL_SIZE + 4, SYMBOL_SIZE + 4, 16);
        ctx.stroke();
      }
    }

    // Hide the strip buffer so wrapped symbols scroll in from above/below the face.
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(this.x, stripTop, this.width, reelTop - stripTop);
    ctx.fillRect(this.x, reelBottom, this.width, stripBottom - reelBottom);

    // Shading at top and bottom to suggest the reel curving away.
    const topFade = ctx.createLinearGradient(0, reelTop, 0, reelTop + 60);
    topFade.addColorStop(0, "rgba(0,0,0,0.65)");
    topFade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topFade;
    ctx.fillRect(this.x, reelTop, this.width, 60);

    const botFade = ctx.createLinearGradient(0, reelBottom - 60, 0, reelBottom);
    botFade.addColorStop(0, "rgba(0,0,0,0)");
    botFade.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = botFade;
    ctx.fillRect(this.x, reelBottom - 60, this.width, 60);

    ctx.restore();

    // Housing frame
    roundRect(ctx, this.x, reelTop, this.width, faceH, 14);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#334155";
    ctx.stroke();
  }
}

export function resetWheelIds() {
  nextWheelId = 0;
}
