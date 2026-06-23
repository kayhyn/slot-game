import {
  REEL_WIDTH,
  REEL_GAP,
  REEL_MARGIN,
  REEL_BUFFER_SLOTS,
  SYMBOL_SPACING,
  SYMBOL_SIZE,
  MATCH_BONUS,
  SPIN_SPEED_MAX,
  difficulty,
} from "./constants.js";
import { Player } from "./player.js";
import { Wheel, resetWheelIds } from "./wheel.js";
import { consumeJump, consumeHold, getMoveAxis } from "./input.js";
import { Confetti } from "./confetti.js";
import { Sparkles } from "./sparkles.js";
import { initAudio, playSound } from "./audio.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const player = new Player();
const confetti = new Confetti();
const sparkles = new Sparkles();
let wheels = [];
let state = "playing"; // "playing" | "over"
let score = 0;
let lastTime = 0;
const awardedMatches = new Set();

const STEP = REEL_WIDTH + REEL_GAP;
const REEL_STRIP_BUFFER = REEL_BUFFER_SLOTS * SYMBOL_SPACING;

function wheelUnderPlayer() {
  const cx = player.x + player.width / 2;
  return wheels.find((w) => cx >= w.x && cx < w.x + w.width) ?? null;
}

function processFrozenMatches(stripTop, zoneTop, zoneBottom) {
  for (const w of wheels) {
    if (w.pendingMatchCheck) w.pendingMatchCheck = false;
  }
  if (wheels.filter((w) => w.frozen).length >= 3) {
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

function buildWheels() {
  wheels = [];
  const { spinMult } = difficulty(score);
  let firstX = canvas.width / 2 - REEL_WIDTH / 2;
  while (firstX > -STEP) firstX -= STEP;
  for (let x = firstX; x < canvas.width + STEP * 2; x += STEP) {
    wheels.push(new Wheel(x, spinMult));
  }
}

function resetGame() {
  resetWheelIds();
  buildWheels();
  player.reset(canvas.width, canvas.height);
  confetti.particles = [];
  sparkles.particles = [];
  awardedMatches.clear();
  state = "playing";
  score = 0;
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  resetGame();
}

function recycleWheels() {
  while (
    wheels.length &&
    wheels[0].x + REEL_WIDTH < 0 &&
    !wheels[0].stopping
  ) {
    wheels.shift();
  }
  let last = wheels[wheels.length - 1];
  const { spinMult } = difficulty(score);
  while (last.x < canvas.width + STEP) {
    last = new Wheel(last.x + STEP, spinMult);
    wheels.push(last);
  }
}

function wheelsAdjacent(a, b) {
  return Math.abs(Math.abs(b.x - a.x) - STEP) < 5;
}

function awardRun(run, stripTop) {
  const key = run.map((e) => e.w.id).join("-");
  if (awardedMatches.has(key)) return;
  awardedMatches.add(key);
  score += MATCH_BONUS * run.length;
  let cx = 0;
  let cy = 0;
  for (const { w, slot } of run) {
    w.triggerMatchGlow(slot);
    const c = w.symbolCenter(stripTop, slot);
    cx += c.x;
    cy += c.y;
  }
  cx /= run.length;
  cy /= run.length;
  sparkles.burst(cx, cy, 28);
  playSound("jackpot");
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

function update(dt) {
  if (state === "over") {
    if (consumeJump()) resetGame();
    return;
  }

  const { top, bottom, stripTop, middleTop, zoneBottom } = reelWindow();

  if (consumeJump()) player.jump();

  if (consumeHold()) {
    playSound("button");
    const wheel = wheelUnderPlayer();
    if (wheel) {
      const wasFrozen = wheel.frozen;
      wheel.toggleHold();
      if (wasFrozen) checkMatches(stripTop, middleTop, zoneBottom, { award: false });
    }
  }

  const diff = difficulty(score);
  for (const w of wheels) w.refreshSpinMult(diff.spinMult);
  for (const w of wheels) w.update(dt, diff.scroll);
  recycleWheels();
  processFrozenMatches(stripTop, middleTop, zoneBottom);

  const platforms = [];
  for (const w of wheels) {
    for (const p of w.getPlatforms(top, bottom, stripTop)) platforms.push(p);
  }

  const maxSpinSpeed = SPIN_SPEED_MAX * diff.spinMult;
  player.update(dt, platforms, getMoveAxis(), diff.scroll, maxSpinSpeed);

  confetti.update(dt);
  sparkles.update(dt);

  if (player.isOffScreen(canvas.height, top)) {
    state = "over";
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
  ctx.fillText(`Score ${score}`, 20, 18);
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText("← → / A D move   H hold/toggle reel   Space jump", 20, 48);

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
      `Score ${score} — press Space / tap to retry`,
      canvas.width / 2,
      canvas.height / 2 + 30,
    );
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
initAudio();
resize();
requestAnimationFrame(loop);
