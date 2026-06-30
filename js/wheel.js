import {
  REEL_WIDTH,
  SYMBOL_SIZE,
  SYMBOL_SPACING,
  SPIN_SPEED_MIN,
  SPIN_SPEED_MAX,
  BACKWARD_CHANCE,
  NUM_SLOTS,
  REEL_PERIOD,
  HOLD_DECEL,
  SPIN_MULT_BASE,
  MATCH_GLOW_DURATION,
} from "./constants.js";

const SYMBOL_PATH = "symbols/";

// Slot art from symbols/ (CC BY 4.0 — Ville Seppänen)
//   weight:     relative frequency among the COPIES of the symbols a reel shows
//               (how often it passes through the win row, i.e. how easy to land)
//   multiplier: payout factor per symbol at the current wager
//   jackpot:    triggers the diamond celebration on a match
//   spawn:      independent chance the symbol appears as a fresh symbol on a reel
//   offer3:     chance a fresh appearance offers a 3-run opportunity
//   extend:     chance each additional reel extends an offered run. Longer runs
//               become rarer naturally: P(4+|3)=extend, P(5+|3)=extend^2.
//   backfill:   relative chance the symbol is used only to keep a reel varied;
//               rare symbols use 0 so they are never visual dead weight.
//
// Design: symbol variety is mostly independent per reel. Match formation is a
// separate short-lived opportunity plan, so the game can offer satisfying runs
// without causing every adjacent reel to inherit the same whole symbol set.
const SYMBOL_DEFS = [
  { file: "diamond.png", label: "Diamond", c: "#102030", weight: 1, multiplier: 12, jackpot: true, spawn: 0.03, offer3: 0.78, extend: 0.22, backfill: 0 },
  { file: "seven.png", label: "Seven", c: "#2a1520", weight: 3, multiplier: 6, jackpot: false, spawn: 0.052, offer3: 0.64, extend: 0.25, backfill: 0 },
  { file: "bar.png", label: "BAR", c: "#181828", weight: 3, multiplier: 6, jackpot: false, spawn: 0.052, offer3: 0.64, extend: 0.25, backfill: 0 },
  { file: "coin.png", label: "Coin", c: "#2a2208", weight: 6, multiplier: 4, jackpot: false, spawn: 0.065, offer3: 0.5, extend: 0.29, backfill: 4 },
  { file: "bell.png", label: "Bell", c: "#2a2210", weight: 6, multiplier: 4, jackpot: false, spawn: 0.065, offer3: 0.5, extend: 0.29, backfill: 4 },
  { file: "horseshoe.png", label: "Horseshoe", c: "#241a10", weight: 6, multiplier: 4, jackpot: false, spawn: 0.065, offer3: 0.5, extend: 0.29, backfill: 4 },
  { file: "cherry.png", label: "Cherry", c: "#2a1218", weight: 20, multiplier: 2, jackpot: false, spawn: 0.18, offer3: 0.3, extend: 0.34, backfill: 10 },
  { file: "lemon.png", label: "Lemon", c: "#2a2610", weight: 20, multiplier: 2, jackpot: false, spawn: 0.18, offer3: 0.3, extend: 0.34, backfill: 10 },
  { file: "watermelon.png", label: "Melon", c: "#182818", weight: 20, multiplier: 2, jackpot: false, spawn: 0.18, offer3: 0.3, extend: 0.34, backfill: 10 },
  { file: "orange.png", label: "Orange", c: "#2a1c0c", weight: 20, multiplier: 2, jackpot: false, spawn: 0.18, offer3: 0.3, extend: 0.34, backfill: 10 },
  { file: "apple.png", label: "Apple", c: "#2a1010", weight: 20, multiplier: 2, jackpot: false, spawn: 0.18, offer3: 0.3, extend: 0.34, backfill: 10 },
  { file: "grapefruit.png", label: "Grapefruit", c: "#2a1418", weight: 20, multiplier: 2, jackpot: false, spawn: 0.18, offer3: 0.3, extend: 0.34, backfill: 10 },
];

export const SYMBOL_COUNT = SYMBOL_DEFS.length;
export const DIAMOND_INDEX = SYMBOL_DEFS.findIndex((s) => s.jackpot);

const SPARKLE_TIME_SCALE = 0.72;
let sparklePhase = 0;

export function tickDiamondSparkle(dt) {
  sparklePhase += dt * SPARKLE_TIME_SCALE;
}

function drawStarburst(ctx, x, y, strength, scale = 1) {
  const longArm = (3.2 + 7.2 * strength) * scale;
  const shortArm = longArm * 0.26;

  ctx.save();
  ctx.globalAlpha = 0.36 + 0.58 * strength;
  ctx.strokeStyle = "#e0f7fa";
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - longArm, y);
  ctx.lineTo(x + longArm, y);
  ctx.moveTo(x, y - longArm * 1.28);
  ctx.lineTo(x, y + longArm * 1.28);
  ctx.moveTo(x - shortArm, y - shortArm);
  ctx.lineTo(x + shortArm, y + shortArm);
  ctx.moveTo(x + shortArm, y - shortArm);
  ctx.lineTo(x - shortArm, y + shortArm);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, longArm * 0.13), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDiamondGlint(ctx, tx, ty, size, seed, phaseOffset = 0) {
  const cx = tx + size / 2;
  const cy = ty + size / 2;
  const points = [
    [size * 0.11, -size * 0.29],
    [-size * 0.18, -size * 0.05],
    [size * 0.2, size * 0.08],
    [0, size * 0.28],
  ];

  for (let i = 0; i < points.length; i++) {
    const phase = phaseOffset + sparklePhase * 3.2 + seed * 1.7 + i * 1.1;
    const pulse = Math.sin(phase);
    const sharp = pulse * pulse * pulse;
    if (sharp < 0.04) continue;

    const [ox, oy] = points[i];
    const x = cx + ox;
    const y = cy + oy;
    drawStarburst(ctx, x, y, sharp, size / SYMBOL_SIZE);
  }
}

// --- Symbol inclusion and run planning -------------------------------------
// Reels should have enough distinct symbols to read as varied even when a
// planned match is forcing one slot. Extra symbols are cheap-biased backfill.
const MIN_INCLUDED = 4;
const MAX_INCLUDED = 7;
const MAX_PLANNED_RUN = 6;
const MAX_NEW_PLANS_PER_REEL = 2;

// Pending planned runs, threaded across generated columns left to right. A value
// of 2 means "force this symbol into the next two reels".
const plannedRunRemaining = new Array(SYMBOL_COUNT).fill(0);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Weighted pick restricted to the symbols this reel shows, skipping neighbours.
function pickFiller(included, banned) {
  let pool = 0;
  for (const i of included) if (!banned.has(i)) pool += SYMBOL_DEFS[i].weight;
  if (pool <= 0) return -1;

  let roll = Math.random() * pool;
  for (const i of included) {
    if (banned.has(i)) continue;
    roll -= SYMBOL_DEFS[i].weight;
    if (roll < 0) return i;
  }
  for (const i of included) if (!banned.has(i)) return i;
  return -1;
}

// A symbol not already on the reel, weighted by `weight` so the minimum-variety
// backfill leans toward cheaper symbols (rarely handing out a high-value start).
function pickBackfill(included, protectedSymbols = new Set()) {
  let pool = 0;
  for (let i = 0; i < SYMBOL_COUNT; i++) {
    if (!included.includes(i) && !protectedSymbols.has(i)) {
      pool += SYMBOL_DEFS[i].backfill;
    }
  }
  if (pool <= 0) return -1;

  let roll = Math.random() * pool;
  for (let i = 0; i < SYMBOL_COUNT; i++) {
    if (included.includes(i) || protectedSymbols.has(i)) continue;
    roll -= SYMBOL_DEFS[i].backfill;
    if (roll < 0) return i;
  }
  return -1;
}

function plannedRunLength(symbolIndex) {
  const def = SYMBOL_DEFS[symbolIndex];
  if (Math.random() >= def.offer3) return 0;

  let length = 3;
  while (length < MAX_PLANNED_RUN && Math.random() < def.extend) length++;
  return length;
}

function maybeStartRuns(runCandidates) {
  const starts = [];
  for (const i of runCandidates) {
    const length = plannedRunLength(i);
    if (length > 0) starts.push({ symbolIndex: i, length });
  }
  if (!starts.length) return;

  shuffle(starts);
  starts.sort(
    (a, b) =>
      SYMBOL_DEFS[b.symbolIndex].multiplier - SYMBOL_DEFS[a.symbolIndex].multiplier,
  );

  for (const { symbolIndex, length } of starts.slice(0, MAX_NEW_PLANS_PER_REEL)) {
    plannedRunRemaining[symbolIndex] = Math.max(
      plannedRunRemaining[symbolIndex],
      length - 1,
    );
  }
}

function trimIncluded(included, protectedSymbols) {
  if (included.length <= MAX_INCLUDED) return included;

  const removable = shuffle(included.filter((i) => !protectedSymbols.has(i)));
  removable.sort((a, b) => SYMBOL_DEFS[a].multiplier - SYMBOL_DEFS[b].multiplier);

  while (included.length > MAX_INCLUDED && removable.length) {
    const drop = removable.shift();
    const at = included.indexOf(drop);
    if (at >= 0) included.splice(at, 1);
  }
  return included;
}

// Which symbols this reel shows. Fresh appearances are independent by symbol;
// any active run plan then forces only its own symbol into this reel. A page has
// REEL_PERIOD slots, so the final distinct set is capped conservatively.
function chooseIncluded() {
  const included = [];
  const forced = new Set();
  const runCandidates = new Set();

  for (let i = 0; i < SYMBOL_COUNT; i++) {
    if (plannedRunRemaining[i] > 0) {
      included.push(i);
      forced.add(i);
      plannedRunRemaining[i]--;
    }
  }

  for (let i = 0; i < SYMBOL_COUNT; i++) {
    if (!included.includes(i) && Math.random() < SYMBOL_DEFS[i].spawn) {
      included.push(i);
      runCandidates.add(i);
    }
  }

  while (included.length < MIN_INCLUDED) {
    const i = pickBackfill(included, forced);
    if (i < 0) break;
    included.push(i);
  }

  trimIncluded(included, forced);
  maybeStartRuns([...runCandidates].filter((i) => included.includes(i)));
  return included;
}

function fallbackPage(included) {
  const slots = [];
  for (let i = 0; i < REEL_PERIOD; i++) slots.push(included[i % included.length]);
  // The page tiles, so a matching first/last slot would sit next to itself.
  if (REEL_PERIOD >= 2 && slots[0] === slots[REEL_PERIOD - 1]) {
    [slots[REEL_PERIOD - 1], slots[REEL_PERIOD - 2]] =
      [slots[REEL_PERIOD - 2], slots[REEL_PERIOD - 1]];
  }
  return slots;
}

// One page: REEL_PERIOD slots holding every included symbol at least once with
// no two neighbours alike. The page tiles, so slot 0 and the last slot must
// differ too (they end up adjacent across the repeat).
function buildPage(included) {
  for (let tries = 0; tries < 120; tries++) {
    const slots = new Array(REEL_PERIOD).fill(-1);
    const positions = shuffle([...Array(REEL_PERIOD).keys()]).slice(0, included.length);
    const symbols = shuffle([...included]);
    for (let i = 0; i < included.length; i++) slots[positions[i]] = symbols[i];

    const empty = [];
    for (let i = 0; i < REEL_PERIOD; i++) if (slots[i] === -1) empty.push(i);
    shuffle(empty);

    let ok = true;
    for (const i of empty) {
      const banned = new Set();
      const prev = slots[(i - 1 + REEL_PERIOD) % REEL_PERIOD];
      const next = slots[(i + 1) % REEL_PERIOD];
      if (prev !== -1) banned.add(prev);
      if (next !== -1) banned.add(next);

      const sym = pickFiller(included, banned);
      if (sym < 0) {
        ok = false;
        break;
      }
      slots[i] = sym;
    }

    if (ok && slots[0] !== slots[REEL_PERIOD - 1]) return slots;
  }
  return fallbackPage(included);
}

// The visible strip repeats the page so a short reel still fills the tall face.
export function generateStrip() {
  const page = buildPage(chooseIncluded());
  const strip = [];
  for (let r = 0; r < NUM_SLOTS / REEL_PERIOD; r++) strip.push(...page);
  return strip;
}

export function getSymbolMultiplier(symbolIndex) {
  return SYMBOL_DEFS[symbolIndex]?.multiplier ?? 2;
}

export function isJackpotSymbol(symbolIndex) {
  return SYMBOL_DEFS[symbolIndex]?.jackpot ?? false;
}

export function getScoringLegend() {
  return SYMBOL_DEFS.map(({ label, multiplier, jackpot }, symbolIndex) => ({
    symbolIndex,
    label,
    multiplier,
    jackpot,
  }));
}

// Legend grouped by payout: one entry per multiplier with all of its symbols,
// sorted high value first, so the UI can cluster symbols under a single label.
export function getScoringTiers() {
  const byMultiplier = new Map();
  SYMBOL_DEFS.forEach((s, symbolIndex) => {
    let tier = byMultiplier.get(s.multiplier);
    if (!tier) {
      tier = { multiplier: s.multiplier, jackpot: s.jackpot, symbolIndices: [] };
      byMultiplier.set(s.multiplier, tier);
    }
    tier.symbolIndices.push(symbolIndex);
    tier.jackpot = tier.jackpot || s.jackpot;
  });
  return [...byMultiplier.values()].sort((a, b) => b.multiplier - a.multiplier);
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

// When a hold would otherwise stop between symbols, the reel rolls on until the
// next symbol sits this many px inside the half-overlap threshold (a small
// safety margin so the landed slot is detected reliably).
const HOLD_LAND_MARGIN = 6;

const TILE_SCALE = 2;
const SHIMMER_FRAMES = 8;
const PAGE_HEIGHT = REEL_PERIOD * SYMBOL_SPACING;
let SYMBOL_IMAGES = [];
let SYMBOL_TILES = [];
let SYMBOL_TILES_LOCKED = [];
let SYMBOL_BACKDROPS = [];
let SYMBOL_BACKDROPS_LOCKED = [];
let SYMBOL_ICON_FRAMES = [];
let SYMBOL_ICON_FRAMES_LOCKED = [];
let SYMBOL_REEL_TILES = [];
let SYMBOL_REEL_TILES_LOCKED = [];

function lightenHex(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function fittedImageRect(img, x, y, size, scale = 1) {
  if (!img) return null;
  const pad = size * 0.08;
  const max = (size - pad * 2) * scale;
  const fit = Math.min(max / img.naturalWidth, max / img.naturalHeight);
  const w = img.naturalWidth * fit;
  const h = img.naturalHeight * fit;
  return {
    x: x + (size - w) / 2,
    y: y + (size - h) / 2,
    w,
    h,
  };
}

function drawImageFitted(ctx, img, x, y, size, scale = 1) {
  const rect = fittedImageRect(img, x, y, size, scale);
  if (!rect) return;
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
}

function drawImageFittedIntoRect(ctx, img, rect) {
  if (!img || !rect) return;
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
}

function buildTileBackground(bg) {
  const c = document.createElement("canvas");
  c.width = SYMBOL_SIZE * TILE_SCALE;
  c.height = SYMBOL_SIZE * TILE_SCALE;
  const g = c.getContext("2d");
  g.scale(TILE_SCALE, TILE_SCALE);
  roundRect(g, 0, 0, SYMBOL_SIZE, SYMBOL_SIZE, 14);
  g.fillStyle = bg;
  g.fill();
  return c;
}

function buildTile(img, bg) {
  const c = buildTileBackground(bg);
  const g = c.getContext("2d");
  g.setTransform(TILE_SCALE, 0, 0, TILE_SCALE, 0, 0);
  drawImageFitted(g, img, 0, 0, SYMBOL_SIZE);
  return c;
}

function buildEffectFrame(img, symbolIndex, frameIndex) {
  const def = SYMBOL_DEFS[symbolIndex];
  if (!def || def.multiplier < 4) return null;

  const c = document.createElement("canvas");
  c.width = SYMBOL_SIZE * TILE_SCALE;
  c.height = SYMBOL_SIZE * TILE_SCALE;
  const g = c.getContext("2d");
  g.setTransform(TILE_SCALE, 0, 0, TILE_SCALE, 0, 0);

  const icon = fittedImageRect(img, 0, 0, SYMBOL_SIZE);
  if (!icon) return null;

  const phase = frameIndex / SHIMMER_FRAMES;
  const jackpot = def.jackpot;
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  const cx = icon.x + icon.w / 2;
  const cy = icon.y + icon.h / 2;
  const radius = Math.max(icon.w, icon.h) * 0.58;
  const glowAlpha = jackpot
    ? 0.18 + pulse * 0.09
    : def.multiplier >= 6
      ? 0.1 + pulse * 0.05
      : 0.03 + pulse * 0.02;
  const glowColor = jackpot ? "103, 232, 249" : "250, 204, 21";

  g.globalCompositeOperation = "lighter";
  const glow = g.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
  glow.addColorStop(0, `rgba(${glowColor}, ${glowAlpha})`);
  glow.addColorStop(1, `rgba(${glowColor}, 0)`);
  g.fillStyle = glow;
  g.fillRect(icon.x, icon.y, icon.w, icon.h);

  if (def.multiplier >= 6) {
    const sx = icon.x - icon.w * 0.65 + phase * icon.w * 1.9;
    const grad = g.createLinearGradient(
      sx - icon.w * 0.18,
      icon.y,
      sx + icon.w * 0.18,
      icon.y + icon.h,
    );
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.48, jackpot ? "rgba(224,247,250,0.28)" : "rgba(255,255,210,0.2)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(sx - icon.w * 0.24, icon.y);
    g.lineTo(sx + icon.w * 0.06, icon.y);
    g.lineTo(sx + icon.w * 0.42, icon.y + icon.h);
    g.lineTo(sx + icon.w * 0.12, icon.y + icon.h);
    g.closePath();
    g.fill();
  }

  g.globalCompositeOperation = "destination-in";
  drawImageFittedIntoRect(g, img, icon);
  g.globalCompositeOperation = "source-over";
  return c;
}

function buildIconFrame(img, symbolIndex, frameIndex) {
  const c = document.createElement("canvas");
  c.width = SYMBOL_SIZE * TILE_SCALE;
  c.height = SYMBOL_SIZE * TILE_SCALE;
  const g = c.getContext("2d");
  g.setTransform(TILE_SCALE, 0, 0, TILE_SCALE, 0, 0);
  drawImageFitted(g, img, 0, 0, SYMBOL_SIZE);

  const effect = buildEffectFrame(img, symbolIndex, frameIndex);
  if (effect) {
    g.globalCompositeOperation = "screen";
    g.drawImage(effect, 0, 0, SYMBOL_SIZE, SYMBOL_SIZE);
    g.globalCompositeOperation = "source-over";
  }
  if (symbolIndex === DIAMOND_INDEX) {
    drawDiamondGlint(
      g,
      0,
      0,
      SYMBOL_SIZE,
      symbolIndex,
      (frameIndex / SHIMMER_FRAMES) * Math.PI * 2,
    );
  }
  return c;
}

function buildReelTileFrame(symbolIndex, locked, frameIndex) {
  const c = document.createElement("canvas");
  c.width = SYMBOL_SIZE * TILE_SCALE;
  c.height = SYMBOL_SIZE * TILE_SCALE;
  const g = c.getContext("2d");
  const backdrop = locked
    ? SYMBOL_BACKDROPS_LOCKED[symbolIndex]
    : SYMBOL_BACKDROPS[symbolIndex];
  const iconFrames = locked ? SYMBOL_ICON_FRAMES_LOCKED : SYMBOL_ICON_FRAMES;

  if (backdrop) g.drawImage(backdrop, 0, 0);
  const icon = iconFrames[symbolIndex]?.[frameIndex] ?? iconFrames[symbolIndex]?.[0];
  if (icon) g.drawImage(icon, 0, 0);
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
    SYMBOL_IMAGES = images;
    SYMBOL_BACKDROPS = images.map((_, i) => buildTileBackground(SYMBOL_DEFS[i].c));
    SYMBOL_BACKDROPS_LOCKED = images.map((_, i) =>
      buildTileBackground(lightenHex(SYMBOL_DEFS[i].c, 0.14)),
    );
    SYMBOL_ICON_FRAMES = images.map((img, symbolIndex) =>
      Array.from({ length: SHIMMER_FRAMES }, (_, frameIndex) =>
        buildIconFrame(img, symbolIndex, frameIndex),
      ),
    );
    // Locked tiles use a lighter box, but the symbol art itself is unchanged.
    SYMBOL_ICON_FRAMES_LOCKED = SYMBOL_ICON_FRAMES;
    SYMBOL_REEL_TILES = images.map((_, symbolIndex) =>
      Array.from({ length: SHIMMER_FRAMES }, (_, frameIndex) =>
        buildReelTileFrame(symbolIndex, false, frameIndex),
      ),
    );
    SYMBOL_REEL_TILES_LOCKED = images.map((_, symbolIndex) =>
      Array.from({ length: SHIMMER_FRAMES }, (_, frameIndex) =>
        buildReelTileFrame(symbolIndex, true, frameIndex),
      ),
    );
    SYMBOL_TILES = images.map((_, i) => SYMBOL_REEL_TILES[i][0]);
    SYMBOL_TILES_LOCKED = images.map((_, i) => SYMBOL_REEL_TILES_LOCKED[i][0]);
  });
}

export function symbolTilesReady() {
  return SYMBOL_TILES.length === SYMBOL_COUNT;
}

export function drawSymbolIcon(ctx, symbolIndex, x, y, size = 48) {
  const tile = SYMBOL_TILES[symbolIndex];
  if (tile) {
    ctx.drawImage(tile, x, y, size, size);
    if (symbolIndex === DIAMOND_INDEX) drawDiamondGlint(ctx, x, y, size, symbolIndex);
    return;
  }
  drawSymbolArt(ctx, symbolIndex, x, y, size);
}

export function drawSymbolArt(ctx, symbolIndex, x, y, size = 48) {
  const img = SYMBOL_IMAGES[symbolIndex];
  if (!img) return;
  drawImageFitted(ctx, img, x, y, size);
  if (symbolIndex === DIAMOND_INDEX) drawDiamondGlint(ctx, x, y, size, symbolIndex);
}

function shimmerFrame(seed = 0) {
  return (Math.floor(sparklePhase * 12 + seed) % SHIMMER_FRAMES + SHIMMER_FRAMES) % SHIMMER_FRAMES;
}

function drawReelSymbol(ctx, symbolIndex, x, y, options = {}) {
  const { locked = false, frame = 0 } = options;
  const backdrop = locked
    ? SYMBOL_BACKDROPS_LOCKED[symbolIndex]
    : SYMBOL_BACKDROPS[symbolIndex];
  if (backdrop) ctx.drawImage(backdrop, x, y, SYMBOL_SIZE, SYMBOL_SIZE);

  const frames = locked ? SYMBOL_ICON_FRAMES_LOCKED : SYMBOL_ICON_FRAMES;
  const icon = frames[symbolIndex]?.[frame] ?? frames[symbolIndex]?.[0];
  if (!icon) return;

  ctx.drawImage(icon, x, y, SYMBOL_SIZE, SYMBOL_SIZE);
}

function buildWheelPageFrames(pageSlots, wheelId) {
  if (!SYMBOL_REEL_TILES.length) return [];

  const inset = (REEL_WIDTH - SYMBOL_SIZE) / 2;
  return Array.from({ length: SHIMMER_FRAMES }, (_, frameIndex) => {
    const c = document.createElement("canvas");
    c.width = REEL_WIDTH;
    c.height = PAGE_HEIGHT;
    const g = c.getContext("2d");

    for (let slot = 0; slot < REEL_PERIOD; slot++) {
      const symbolIndex = pageSlots[slot];
      const tileFrame = (frameIndex + wheelId + slot) % SHIMMER_FRAMES;
      const tile = SYMBOL_REEL_TILES[symbolIndex]?.[tileFrame];
      if (tile) {
        g.drawImage(tile, inset, slot * SYMBOL_SPACING, SYMBOL_SIZE, SYMBOL_SIZE);
      }
    }
    return c;
  });
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

const DIVIDER_WIDTH = 10;
const dividerSprites = new Map();

function dividerSprite(height) {
  const h = Math.max(1, Math.ceil(height));
  let sprite = dividerSprites.get(h);
  if (sprite) return sprite;

  sprite = document.createElement("canvas");
  sprite.width = DIVIDER_WIDTH;
  sprite.height = h;
  const g = sprite.getContext("2d");
  const x = DIVIDER_WIDTH / 2;

  const grad = g.createLinearGradient(0, 0, DIVIDER_WIDTH, h);
  grad.addColorStop(0, "rgba(160, 120, 40, 0.06)");
  grad.addColorStop(0.22, "#9a7020");
  grad.addColorStop(0.5, "#f0cc55");
  grad.addColorStop(0.78, "#9a7020");
  grad.addColorStop(1, "rgba(160, 120, 40, 0.06)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x, 0);
  g.lineTo(x + 2.4, h * 0.48);
  g.lineTo(x, h);
  g.lineTo(x - 2.4, h * 0.48);
  g.closePath();
  g.fill();

  g.strokeStyle = "rgba(255, 240, 190, 0.45)";
  g.lineWidth = 0.75;
  g.beginPath();
  g.moveTo(x, 0);
  g.lineTo(x, h);
  g.stroke();

  dividerSprites.set(h, sprite);
  return sprite;
}

export function drawColumnDividers(ctx, wheels, reelTop, reelBottom, canvasWidth) {
  if (!wheels.length) return;

  const xs = new Set();
  const sprite = dividerSprite(reelBottom - reelTop);
  for (const w of wheels) {
    if (w.x + w.width < 0 || w.x > canvasWidth) continue;
    xs.add(w.x);
    xs.add(w.x + w.width);
  }

  ctx.save();
  for (const x of xs) {
    ctx.drawImage(sprite, Math.round(x - DIVIDER_WIDTH / 2), reelTop);
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
    this.pageSlots = this.slots.slice(0, REEL_PERIOD);
    this.pageFrames = buildWheelPageFrames(this.pageSlots, this.id);
    this.frozen = false;
    this.stopping = false;
    this.pendingMatchCheck = false;
    this.matchGroup = null;
    this.stake = 0; // wager paid to lock this reel; cashed back into a match payout
    this.holdLandSpin = 0;
    this.holdDecelRate = 0; // per-hold brake rate (0 = use the default holdDecel)
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

  beginHold(stake = 0, stripTop, zoneTop, zoneBottom) {
    if (this.frozen || this.stopping) return;
    this.heldSpinSpeed = this.spinSpeed;
    this.stake = stake;
    const { landSpin, decel } = this.computeHoldLanding(stripTop, zoneTop, zoneBottom);
    this.holdLandSpin = landSpin;
    this.holdDecelRate = decel;
    this.stopping = true;
  }

  // Faster reels (higher spin multiplier) brake proportionally harder, so the
  // time from pressing hold to a full stop stays roughly constant as the game
  // speeds up.
  holdDecel() {
    return HOLD_DECEL * this.spinMult;
  }

  // Where this reel would stop, and how hard to brake to get there. Normally it
  // coasts to its natural stop at the default deceleration. But if that stop
  // would leave the win zone empty (a symbol straddling the gap between rows),
  // the brake is eased just enough that the reel rolls a little further in its
  // current direction until the next symbol clears the half-overlap threshold —
  // so a hold never settles between symbols.
  computeHoldLanding(stripTop, zoneTop, zoneBottom) {
    const defaultDecel = this.holdDecel();
    const natural = this.predictHoldLandSpin(defaultDecel);
    if (
      stripTop === undefined ||
      this.zoneSlotAtSpin(stripTop, zoneTop, zoneBottom, natural) >= 0
    ) {
      return { landSpin: natural, decel: defaultDecel };
    }

    const dir = Math.sign(this.spinSpeed) || 1;
    const v0 = Math.abs(this.spinSpeed);
    // Largest |offset-from-centred| (px) that still counts, minus a small margin
    // so the landed symbol clears the strict half-overlap test reliably.
    const landable = SYMBOL_SIZE * 0.5 - HOLD_LAND_MARGIN;
    const phi = wrap(natural - (zoneTop - stripTop), SYMBOL_SPACING);
    const advance =
      dir > 0 ? SYMBOL_SPACING - landable - phi : phi - landable;
    const landSpin = natural + dir * advance;

    const travel = Math.abs(landSpin - this.spin);
    const decel =
      v0 > 1 && travel > 0 ? (v0 * v0) / (2 * travel) : defaultDecel;
    return { landSpin, decel };
  }

  predictHoldLandSpin(decel = this.holdDecel()) {
    let spin = this.spin;
    let v = this.spinSpeed;
    const dt = 1 / 120;
    while (Math.abs(v) > 2) {
      const speed = Math.abs(v);
      const dir = Math.sign(v) || 1;
      const next = Math.max(0, speed - decel * dt);
      v = dir * next;
      spin += v * dt;
    }
    return spin;
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
    this.matchGroup = null;
    this.stake = 0; // unlocking forfeits the staked wager
    this.holdLandSpin = 0;
    this.holdDecelRate = 0;
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
      this.spin = this.holdLandSpin;
      this.spinSpeed = 0;
      this.finishHold();
      return;
    }

    const next = Math.max(0, speed - (this.holdDecelRate || this.holdDecel()) * dt);
    this.spinSpeed = dir * next;
    this.spin += this.spinSpeed * dt;
  }

  finishHold() {
    this.spin = this.holdLandSpin;
    this.spinSpeed = 0;
    this.stopping = false;
    this.frozen = true;
    this.pendingMatchCheck = true;
  }

  lockLandSpin() {
    return this.stopping ? this.holdLandSpin : this.spin;
  }

  zoneSlotAtSpin(stripTop, zoneTop, zoneBottom, spin) {
    let best = -1;
    let bestOverlap = 0;
    const minOverlap = SYMBOL_SIZE * 0.5;
    for (let i = 0; i < NUM_SLOTS; i++) {
      const y = this.slotYAt(i, stripTop, spin);
      const overlap =
        Math.min(y + SYMBOL_SIZE, zoneBottom) - Math.max(y, zoneTop);
      if (overlap > minOverlap && overlap > bestOverlap) {
        bestOverlap = overlap;
        best = i;
      }
    }
    return best;
  }

  lockLandSlot(stripTop, zoneTop, zoneBottom) {
    if (!this.frozen && !this.stopping) return -1;
    return this.zoneSlotAtSpin(
      stripTop,
      zoneTop,
      zoneBottom,
      this.lockLandSpin(),
    );
  }

  zoneSlot(stripTop, zoneTop, zoneBottom) {
    return this.zoneSlotAtSpin(stripTop, zoneTop, zoneBottom, this.spin);
  }

  zoneSymbolIndex(stripTop, zoneTop, zoneBottom) {
    const slot = this.zoneSlot(stripTop, zoneTop, zoneBottom);
    return slot >= 0 ? this.slots[slot] : -1;
  }

  symbolCenter(stripTop, slot, spin = this.spin) {
    const inset = (this.width - SYMBOL_SIZE) / 2;
    return {
      x: this.x + inset + SYMBOL_SIZE / 2,
      y: this.slotYAt(slot, stripTop, spin) + SYMBOL_SIZE / 2,
    };
  }

  triggerMatchGlow(slot) {
    this.glowSlot = slot;
    this.glowTime = MATCH_GLOW_DURATION;
  }

  // Vertical (top) position of slot i within the reel face.
  slotY(i, stripTop) {
    return this.slotYAt(i, stripTop, this.spin);
  }

  slotYAt(i, stripTop, spin) {
    return stripTop + wrap(i * SYMBOL_SPACING + spin, STRIP_HEIGHT);
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
    const y = this.slotYAt(this.glowSlot, stripTop, this.lockLandSpin());
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

    const landSlot =
      this.frozen || this.stopping
        ? this.lockLandSlot(stripTop, zoneTop, zoneBottom)
        : -1;
    const frame = shimmerFrame(this.id * 0.37);

    const page = this.pageFrames[frame];
    if (page) {
      const offset = wrap(this.spin, PAGE_HEIGHT);
      for (let y = stripTop + offset - PAGE_HEIGHT; y < stripBottom; y += PAGE_HEIGHT) {
        ctx.drawImage(page, this.x, y);
      }
    } else {
      for (let i = 0; i < NUM_SLOTS; i++) {
        const y = this.slotY(i, stripTop);
        if (y + SYMBOL_SIZE < stripTop || y > stripBottom) continue;
        const symbolIndex = this.slots[i];
        drawReelSymbol(ctx, symbolIndex, this.x + inset, y, { frame });
      }
    }

    const drawSlotOverlay = (slot, locked) => {
      const y = this.slotY(slot, stripTop);
      if (y + SYMBOL_SIZE < stripTop || y > stripBottom) return;
      const symbolIndex = this.slots[slot];
      const tileFrame = (frame + this.id + (slot % REEL_PERIOD)) % SHIMMER_FRAMES;
      drawReelSymbol(ctx, symbolIndex, this.x + inset, y, {
        locked,
        frame: tileFrame,
      });
    };

    if (landSlot >= 0) {
      drawSlotOverlay(landSlot, true);
    }

    // Hide the strip buffer so wrapped symbols scroll in from above/below the face.
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(this.x, stripTop, this.width, reelTop - stripTop);
    ctx.fillRect(this.x, reelBottom, this.width, stripBottom - reelBottom);

    ctx.restore();
  }
}

export function resetWheelIds() {
  nextWheelId = 0;
  plannedRunRemaining.fill(0);
}
