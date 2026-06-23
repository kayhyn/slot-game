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

const SYMBOL_PATH = "../symbols/";

// Slot art from symbols/ (CC BY 4.0 — Ville Seppänen)
const DIAMOND_INDEX = 3;
// Independent per column: P(all 3 consecutive have a diamond) = chance^3 = 50%.
const COLUMN_HAS_DIAMOND_CHANCE = Math.cbrt(0.5);

// weight: relative spawn frequency; multiplier: payout factor per symbol at current wager
const SYMBOL_DEFS = [
  { file: "seven.png", c: "#2a1520", weight: 3, multiplier: 4, jackpot: false },
  { file: "cherry.png", c: "#2a1218", weight: 20, multiplier: 2, jackpot: false },
  { file: "bell.png", c: "#2a2210", weight: 5, multiplier: 3, jackpot: false },
  { file: "diamond.png", c: "#102030", weight: 1, multiplier: 50, jackpot: true },
  { file: "lemon.png", c: "#2a2610", weight: 20, multiplier: 2, jackpot: false },
  { file: "bar.png", c: "#181828", weight: 4, multiplier: 4, jackpot: false },
  { file: "watermelon.png", c: "#182818", weight: 20, multiplier: 2, jackpot: false },
];

export const SYMBOL_COUNT = SYMBOL_DEFS.length;

const WEIGHT_TOTAL = SYMBOL_DEFS.reduce((sum, s) => sum + s.weight, 0);

function pickWeightedSymbol(exclude) {
  const banned =
    exclude instanceof Set
      ? exclude
      : new Set(exclude >= 0 ? [exclude] : []);

  let pool = WEIGHT_TOTAL;
  for (const i of banned) pool -= SYMBOL_DEFS[i].weight;
  if (pool <= 0) return -1;

  let roll = Math.random() * pool;
  for (let i = 0; i < SYMBOL_COUNT; i++) {
    if (banned.has(i)) continue;
    roll -= SYMBOL_DEFS[i].weight;
    if (roll < 0) return i;
  }
  for (let i = 0; i < SYMBOL_COUNT; i++) {
    if (!banned.has(i)) return i;
  }
  return -1;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fallbackStrip(includeDiamond) {
  const cycle = [0, 1, 2, 4, 5, 6];
  const slots = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    slots.push(cycle[i % cycle.length]);
  }
  if (includeDiamond) {
    for (const i of shuffle([...Array(NUM_SLOTS).keys()])) {
      const prev = slots[(i - 1 + NUM_SLOTS) % NUM_SLOTS];
      const next = slots[(i + 1) % NUM_SLOTS];
      if (prev !== DIAMOND_INDEX && next !== DIAMOND_INDEX) {
        slots[i] = DIAMOND_INDEX;
        break;
      }
    }
  }
  return slots;
}

export function generateStrip() {
  const includeDiamond = Math.random() < COLUMN_HAS_DIAMOND_CHANCE;
  const required = [];
  for (let i = 0; i < SYMBOL_COUNT; i++) {
    if (i === DIAMOND_INDEX && !includeDiamond) continue;
    required.push(i);
  }
  const banDiamond = includeDiamond ? null : new Set([DIAMOND_INDEX]);

  for (let tries = 0; tries < 120; tries++) {
    const slots = new Array(NUM_SLOTS).fill(-1);
    const positions = shuffle([...Array(NUM_SLOTS).keys()]).slice(0, required.length);
    const symbols = shuffle([...required]);
    for (let i = 0; i < required.length; i++) {
      slots[positions[i]] = symbols[i];
    }

    const empty = [];
    for (let i = 0; i < NUM_SLOTS; i++) {
      if (slots[i] === -1) empty.push(i);
    }
    shuffle(empty);

    let ok = true;
    for (const i of empty) {
      const banned = banDiamond ? new Set(banDiamond) : new Set();
      const prev = slots[(i - 1 + NUM_SLOTS) % NUM_SLOTS];
      const next = slots[(i + 1) % NUM_SLOTS];
      if (prev !== -1) banned.add(prev);
      if (next !== -1) banned.add(next);

      const sym = pickWeightedSymbol(banned);
      if (sym < 0) {
        ok = false;
        break;
      }
      slots[i] = sym;
    }

    const hasDiamond = slots.includes(DIAMOND_INDEX);
    if (ok && slots[0] !== slots[NUM_SLOTS - 1] && hasDiamond === includeDiamond) {
      return slots;
    }
  }
  return fallbackStrip(includeDiamond);
}

export function getSymbolMultiplier(symbolIndex) {
  return SYMBOL_DEFS[symbolIndex]?.multiplier ?? 2;
}

export function isJackpotSymbol(symbolIndex) {
  return SYMBOL_DEFS[symbolIndex]?.jackpot ?? false;
}

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

const TILE_SCALE = 2;
let SYMBOL_TILES = [];

function buildTile(img, bg) {
  const c = document.createElement("canvas");
  c.width = SYMBOL_SIZE * TILE_SCALE;
  c.height = SYMBOL_SIZE * TILE_SCALE;
  const g = c.getContext("2d");
  g.scale(TILE_SCALE, TILE_SCALE);
  roundRect(g, 0, 0, SYMBOL_SIZE, SYMBOL_SIZE, 14);
  g.fillStyle = bg;
  g.fill();
  const pad = 8;
  const max = SYMBOL_SIZE - pad * 2;
  const scale = Math.min(max / img.naturalWidth, max / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  g.drawImage(img, (SYMBOL_SIZE - w) / 2, (SYMBOL_SIZE - h) / 2, w, h);
  return c;
}

export function loadSymbolTiles() {
  return Promise.all(
    SYMBOL_DEFS.map(
      ({ file }) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load ${file}`));
          img.src = `${SYMBOL_PATH}${file}`;
        }),
    ),
  ).then((images) => {
    SYMBOL_TILES = images.map((img, i) => buildTile(img, SYMBOL_DEFS[i].c));
  });
}

export function symbolTilesReady() {
  return SYMBOL_TILES.length === SYMBOL_COUNT;
}

// Positive modulo so backward-spinning reels (negative spin) wrap correctly.
function wrap(value, range) {
  return ((value % range) + range) % range;
}

export function symbolInZone(y, zoneTop, zoneBottom) {
  const overlap =
    Math.min(y + SYMBOL_SIZE, zoneBottom) - Math.max(y, zoneTop);
  return overlap > SYMBOL_SIZE * 0.5;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function slotZoneOverlap(y, zoneTop, zoneBottom) {
  return Math.max(
    0,
    Math.min(y + SYMBOL_SIZE, zoneBottom) - Math.max(y, zoneTop),
  );
}

// Outline fades in/out around the 50% overlap threshold.
function slotZoneOutlineStrength(y, zoneTop, zoneBottom) {
  const frac = slotZoneOverlap(y, zoneTop, zoneBottom) / SYMBOL_SIZE;
  return smoothstep(0.42, 0.58, frac);
}

const MAX_DIVIDER_BOW = 9; // px; kept below symbol inset so bows never reach tiles

function bowForDividerX(x, canvasWidth) {
  const norm = (x - canvasWidth * 0.5) / (canvasWidth * 0.5);
  return norm * MAX_DIVIDER_BOW;
}

function quadPoint(t, x0, y0, x1, y1, x2, y2) {
  const omt = 1 - t;
  return {
    x: omt * omt * x0 + 2 * omt * t * x1 + t * t * x2,
    y: omt * omt * y0 + 2 * omt * t * y1 + t * t * y2,
  };
}

function quadTangent(t, x0, y0, x1, y1, x2, y2) {
  const omt = 1 - t;
  return {
    x: 2 * omt * (x1 - x0) + 2 * t * (x2 - x1),
    y: 2 * omt * (y1 - y0) + 2 * t * (y2 - y1),
  };
}

function drawTaperedBowedGoldDivider(ctx, x, top, bottom, bow) {
  const midY = (top + bottom) / 2;
  const x0 = x;
  const y0 = top;
  const x1 = x + bow;
  const y1 = midY;
  const x2 = x;
  const y2 = bottom;
  const segments = 36;
  const maxHalfWidth = 2.4;

  const upper = [];
  const lower = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = quadPoint(t, x0, y0, x1, y1, x2, y2);
    const tan = quadTangent(t, x0, y0, x1, y1, x2, y2);
    const len = Math.hypot(tan.x, tan.y) || 1;
    const nx = -tan.y / len;
    const taper = Math.sin(t * Math.PI);
    const hw = maxHalfWidth * taper;
    upper.push({ x: p.x + nx * hw, y: p.y });
    lower.push({ x: p.x - nx * hw, y: p.y });
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(upper[0].x, upper[0].y);
  for (let i = 1; i < upper.length; i++) ctx.lineTo(upper[i].x, upper[i].y);
  for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i].x, lower[i].y);
  ctx.closePath();

  const grad = ctx.createLinearGradient(x - 5, top, x + 5, bottom);
  grad.addColorStop(0, "rgba(160, 120, 40, 0.12)");
  grad.addColorStop(0.12, "#9a7020");
  grad.addColorStop(0.5, "#f0cc55");
  grad.addColorStop(0.88, "#9a7020");
  grad.addColorStop(1, "rgba(160, 120, 40, 0.12)");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(x1, y1, x2, y2);
  ctx.strokeStyle = "rgba(255, 240, 190, 0.5)";
  ctx.lineWidth = 0.75;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

export function drawColumnDividers(ctx, wheels, reelTop, reelBottom, canvasWidth) {
  if (!wheels.length) return;

  const xs = new Set();
  for (const w of wheels) {
    if (w.x + w.width < 0 || w.x > canvasWidth) continue;
    xs.add(w.x);
    xs.add(w.x + w.width);
  }

  ctx.save();
  for (const x of xs) {
    drawTaperedBowedGoldDivider(
      ctx,
      x,
      reelTop,
      reelBottom,
      bowForDividerX(x, canvasWidth),
    );
  }
  ctx.restore();
}

export class Wheel {
  constructor(screenX, spinMult = SPIN_MULT_BASE) {
    this.id = nextWheelId++;
    this.x = screenX;            // screen-space left edge
    this.width = REEL_WIDTH;
    this.spin = Math.random() * STRIP_HEIGHT; // random starting phase
    this.spinMult = spinMult;
    this.spinSpeed = this.randomSpinSpeed();
    this.slots = generateStrip();
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
    if (!tile) return;
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
    const stripH = stripBottom - stripTop;
    const inset = (this.width - SYMBOL_SIZE) / 2;

    ctx.save();
    // Clip to the extended strip; UI masks hide the buffer above/below the face.
    ctx.beginPath();
    ctx.rect(this.x, stripTop, this.width, stripH);
    ctx.clip();

    // Reel backdrop
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(this.x, stripTop, this.width, stripH);

    // Symbols (pre-rendered tiles, just blitted)
    for (let i = 0; i < NUM_SLOTS; i++) {
      const y = this.slotY(i, stripTop);
      const tx = this.x + inset;
      const tile = SYMBOL_TILES[this.slots[i]];
      if (tile) ctx.drawImage(tile, tx, y, SYMBOL_SIZE, SYMBOL_SIZE);

      const outline = slotZoneOutlineStrength(y, zoneTop, zoneBottom);
      if (outline > 0.02) {
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.55 * outline})`;
        ctx.lineWidth = 1 + outline;
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
  }
}

export function resetWheelIds() {
  nextWheelId = 0;
}
