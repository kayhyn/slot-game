import {
  REEL_WIDTH,
  REEL_GAP,
  REEL_MARGIN,
  REEL_BUFFER_SLOTS,
  SYMBOL_SPACING,
  SYMBOL_SIZE,
  STARTING_MONEY,
  MIN_WAGER,
  WAGER_STEP,
  SPIN_SPEED_MAX,
  SCROLL_SPEED_BASE,
  SPIN_MULT_BASE,
  SPEED_RAMP_SMOOTH,
  difficulty,
} from "./constants.js";
import { Player, loadPlayerSprite, applyPlayerSprite } from "./player.js";
import {
  Wheel,
  resetWheelIds,
  loadSymbolTiles,
  drawColumnDividers,
  getSymbolMultiplier,
  isJackpotSymbol,
} from "./wheel.js";
import {
  consumeJump,
  consumeHold,
  consumeEscape,
  consumePointer,
  consumeConfirm,
  consumeWagerUp,
  consumeWagerDown,
  getPointerHover,
  clearJump,
  getMoveAxis,
  initInput,
} from "./input.js";
import { Confetti } from "./confetti.js";
import { Sparkles } from "./sparkles.js";
import { initAudio, playSound, startBgm, stopBgm } from "./audio.js";
import {
  drawTitleScreen,
  drawCreditsScreen,
  hitTestTitleScreen,
  hitTestCreditsScreen,
  hoverTitleScreen,
  hoverCreditsScreen,
} from "./menu.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const player = new Player();
const confetti = new Confetti();
const sparkles = new Sparkles();
let wheels = [];
let state = "menu"; // "menu" | "credits" | "playing" | "over"
let score = STARTING_MONEY;
let wager = MIN_WAGER;
let lastTime = 0;
const awardedMatches = new Set();
const matchedWheelIds = new Set();
let firstDepartureFree = true;
let smoothedScroll = SCROLL_SPEED_BASE;
let smoothedSpinMult = SPIN_MULT_BASE;

const STEP = REEL_WIDTH + REEL_GAP;
const REEL_STRIP_BUFFER = REEL_BUFFER_SLOTS * SYMBOL_SPACING;

function wheelUnderPlayer() {
  const cx = player.x + player.width / 2;
  return wheels.find((w) => cx >= w.x && cx < w.x + w.width) ?? null;
}

function processFrozenMatches(stripTop, zoneTop, zoneBottom) {
  const pending = wheels.some((w) => w.pendingMatchCheck);
  for (const w of wheels) {
    if (w.pendingMatchCheck) w.pendingMatchCheck = false;
  }
  if (pending) {
    checkMatches(stripTop, zoneTop, zoneBottom);
  }
}

function reelWindow() {
  const top = REEL_MARGIN;
  const bottom = canvas.height - REEL_MARGIN;
  const middleTop = (top + bottom) / 2 - SYMBOL_SIZE / 2;
  return {
    top,
    bottom,
    stripTop: top - REEL_STRIP_BUFFER,
    stripBottom: bottom + REEL_STRIP_BUFFER,
    middleTop,
    zoneBottom: middleTop + SYMBOL_SIZE,
  };
}

function updateSmoothedDifficulty(dt) {
  const target = difficulty(score);
  const k = 1 - Math.exp(-SPEED_RAMP_SMOOTH * dt);
  smoothedScroll += (target.scroll - smoothedScroll) * k;
  smoothedSpinMult += (target.spinMult - smoothedSpinMult) * k;
}

function buildWheels() {
  wheels = [];
  let firstX = canvas.width / 2 - REEL_WIDTH / 2;
  while (firstX > -STEP) firstX -= STEP;
  for (let x = firstX; x < canvas.width + STEP * 2; x += STEP) {
    wheels.push(new Wheel(x, smoothedSpinMult));
  }
}

function formatMoney(amount) {
  return `$${amount}`;
}

function clampWager() {
  wager = Math.max(MIN_WAGER, Math.min(score, wager));
}

function checkBroke() {
  if (score < MIN_WAGER) {
    score = Math.max(0, score);
    state = "over";
    stopBgm();
    playSound("death");
    return true;
  }
  return false;
}

function loseMoney(amount) {
  score -= amount;
  playSound("fail");
  clampWager();
  checkBroke();
}

function adjustWager(delta) {
  wager = Math.max(MIN_WAGER, Math.min(score, wager + delta));
}

function resetGame() {
  resetWheelIds();
  score = STARTING_MONEY;
  wager = MIN_WAGER;
  smoothedScroll = SCROLL_SPEED_BASE;
  smoothedSpinMult = SPIN_MULT_BASE;
  buildWheels();
  player.reset(canvas.width, canvas.height);
  confetti.particles = [];
  sparkles.particles = [];
  awardedMatches.clear();
  matchedWheelIds.clear();
  firstDepartureFree = true;
}

function startPlaying() {
  resetGame();
  state = "playing";
  playSound("start");
  startBgm();
}

function goToMenu() {
  state = "menu";
  wheels = [];
  stopBgm();
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (state === "playing" || state === "over") {
    resetGame();
  }
}

function recycleWheels() {
  while (
    wheels.length &&
    wheels[0].x + REEL_WIDTH < 0 &&
    !wheels[0].stopping
  ) {
    const departing = wheels[0];
    if (!matchedWheelIds.has(departing.id) && !firstDepartureFree) {
      loseMoney(wager);
      if (state === "over") return;
    }
    firstDepartureFree = false;
    wheels.shift();
  }
  if (!wheels.length) return;
  let last = wheels[wheels.length - 1];
  while (last.x < canvas.width + STEP) {
    last = new Wheel(last.x + STEP, smoothedSpinMult);
    wheels.push(last);
  }
}

function wheelsAdjacent(a, b) {
  return Math.abs(Math.abs(b.x - a.x) - STEP) < 5;
}

function runLengthMultiplier(length) {
  return length - 2; // 3→1×, 4→2×, 5→3× on the symbol multiplier
}

function awardRun(run, stripTop) {
  const key = run.map((e) => e.w.id).join("-");
  if (awardedMatches.has(key)) return;
  awardedMatches.add(key);

  const sym = run[0].w.slots[run[0].slot];
  const effectiveMult = getSymbolMultiplier(sym) * runLengthMultiplier(run.length);
  score += wager * effectiveMult * run.length;
  clampWager();

  const jackpot = isJackpotSymbol(sym);
  let cx = 0;
  let cy = 0;
  for (const { w, slot } of run) {
    matchedWheelIds.add(w.id);
    w.triggerMatchGlow(slot);
    const c = w.symbolCenter(stripTop, slot);
    cx += c.x;
    cy += c.y;
  }
  cx /= run.length;
  cy /= run.length;
  sparkles.burst(cx, cy, 28);
  playSound("jackpot");
  if (jackpot) {
    sparkles.burst(cx, cy, 80, true);
    playSound("diamond");
  }
}

function checkMatches(stripTop, zoneTop, zoneBottom, { award = true } = {}) {
  if (!award) {
    for (const w of wheels) w.glowTime = 0;
    return;
  }

  const frozen = wheels.filter((w) => w.frozen);
  const candidates = frozen
    .map((w) => ({ w, slot: w.zoneSlot(stripTop, zoneTop, zoneBottom) }))
    .filter((e) => e.slot >= 0);
  if (candidates.length < 3) return;

  const sorted = [...candidates].sort((a, b) => a.w.x - b.w.x);
  let i = 0;
  while (i < sorted.length) {
    const sym = sorted[i].w.slots[sorted[i].slot];
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j].w.slots[sorted[j].slot] === sym &&
      wheelsAdjacent(sorted[j - 1].w, sorted[j].w)
    ) {
      j++;
    }
    const run = sorted.slice(i, j);
    if (run.length >= 3) awardRun(run, stripTop);
    i = j;
  }
}

function handleMenuPointer() {
  const p = consumePointer();
  if (!p) return;

  if (state === "menu") {
    const hit = hitTestTitleScreen(canvas.width, canvas.height, p.x, p.y);
    if (hit === "play") {
      clearJump();
      startPlaying();
    } else if (hit === "credits") {
      state = "credits";
    }
    return;
  }

  if (state === "credits") {
    if (hitTestCreditsScreen(canvas.width, canvas.height, p.x, p.y) === "back") {
      state = "menu";
    }
  }
}

function updateMenu() {
  if (consumeEscape()) {
    if (state === "credits") state = "menu";
    else if (state === "playing" || state === "over") goToMenu();
    return;
  }

  if (state === "menu" && consumeConfirm()) {
    startPlaying();
    return;
  }

  if (state === "credits" && consumeConfirm()) {
    state = "menu";
    return;
  }

  handleMenuPointer();
}

function update(dt) {
  if (state === "menu" || state === "credits") {
    updateMenu();
    return;
  }

  if (state === "over") {
    if (consumeEscape()) {
      goToMenu();
      return;
    }
    if (consumeJump()) startPlaying();
    return;
  }

  if (consumeEscape()) {
    goToMenu();
    return;
  }

  const { top, bottom, stripTop, middleTop, zoneBottom } = reelWindow();

  if (consumeJump() && player.jump()) playSound("grunt");

  if (consumeWagerUp()) adjustWager(WAGER_STEP);
  if (consumeWagerDown()) adjustWager(-WAGER_STEP);

  if (consumeHold()) {
    playSound("button");
    const wheel = wheelUnderPlayer();
    if (wheel) {
      const wasFrozen = wheel.frozen;
      wheel.toggleHold();
      if (wasFrozen) checkMatches(stripTop, middleTop, zoneBottom, { award: false });
    }
  }

  updateSmoothedDifficulty(dt);
  for (const w of wheels) w.refreshSpinMult(smoothedSpinMult);
  for (const w of wheels) w.update(dt, smoothedScroll);
  recycleWheels();
  processFrozenMatches(stripTop, middleTop, zoneBottom);

  const platforms = [];
  for (const w of wheels) {
    for (const p of w.getPlatforms(top, bottom, stripTop)) platforms.push(p);
  }

  const maxSpinSpeed = SPIN_SPEED_MAX * smoothedSpinMult;
  player.update(dt, platforms, getMoveAxis(), smoothedScroll, maxSpinSpeed);
  if (player.justLanded) playSound("land");

  confetti.update(dt);
  sparkles.update(dt);

  if (state !== "over" && player.isOffScreen(canvas.height, top)) {
    state = "over";
    stopBgm();
    playSound("death");
  }
}

function drawMiddleRowHighlight(middleTop) {
  ctx.fillStyle = "rgba(250, 204, 21, 0.1)";
  ctx.fillRect(0, middleTop, canvas.width, SYMBOL_SIZE);
  ctx.strokeStyle = "rgba(250, 204, 21, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0.5, middleTop + 0.5, canvas.width - 1, SYMBOL_SIZE - 1);
}

function drawMatchGlows(stripTop) {
  for (const w of wheels) w.drawMatchGlow(ctx, stripTop);
}

function draw() {
  if (state === "menu") {
    const hover = getPointerHover();
    const hoverId = hover
      ? hoverTitleScreen(canvas.width, canvas.height, hover.x, hover.y)
      : null;
    drawTitleScreen(ctx, canvas.width, canvas.height, hoverId);
    return;
  }

  if (state === "credits") {
    const hover = getPointerHover();
    const hoverId = hover
      ? hoverCreditsScreen(canvas.width, canvas.height, hover.x, hover.y)
      : null;
    drawCreditsScreen(ctx, canvas.width, canvas.height, hoverId);
    return;
  }

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#0a0a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const { top, bottom, stripTop, stripBottom, middleTop, zoneBottom } = reelWindow();
  for (const w of wheels) {
    w.draw(ctx, top, bottom, stripTop, stripBottom, middleTop, zoneBottom);
  }

  drawColumnDividers(ctx, wheels, top, bottom, canvas.width);
  drawMiddleRowHighlight(middleTop);
  drawMatchGlows(stripTop);
  player.draw(ctx);
  sparkles.draw(ctx);
  confetti.draw(ctx);

  // HUD
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText(formatMoney(score), 20, 18);
  ctx.textAlign = "right";
  ctx.fillText(`Wager ${formatMoney(wager)}`, canvas.width - 20, 18);
  ctx.textAlign = "left";
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText("← → / A D move   ↑ ↓ / L M wager   H / Enter hold   Space jump", 20, 48);

  if (state === "over") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillText(
      `${formatMoney(score)} — press Space / tap to retry`,
      canvas.width / 2,
      canvas.height / 2 + 30,
    );
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
    ctx.fillText("Escape — main menu", canvas.width / 2, canvas.height / 2 + 68);
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  if (ready) resize();
});

initAudio();
initInput(canvas);

let ready = false;

Promise.all([loadSymbolTiles(), loadPlayerSprite()])
  .then(() => {
    applyPlayerSprite(player);
    ready = true;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    requestAnimationFrame(loop);
  })
  .catch((err) => {
    console.error(err);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("Failed to load symbol images.", 20, 40);
  });
