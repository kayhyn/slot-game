import {
  REEL_WIDTH,
  REEL_GAP,
  REEL_MARGIN,
  REEL_BUFFER_SLOTS,
  SYMBOL_SPACING,
  SYMBOL_SIZE,
  STARTING_MONEY,
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
  getScoringTiers,
  isJackpotSymbol,
  drawSymbolArt,
  tickDiamondSparkle,
} from "./wheel.js";
import {
  consumeJump,
  isJumpHeld,
  consumeHold,
  consumeEscape,
  consumePointer,
  consumeConfirm,
  consumeWagerUp,
  consumeWagerDown,
  getPointerHover,
  clearJump,
  getMoveAxis,
  getControlBindings,
  getRebindingAction,
  initInput,
  resetControlBindings,
  setTouchGameplayEnabled,
  setTouchWagerButtons,
  startRebinding,
} from "./input.js";
import { Confetti } from "./confetti.js";
import { Sparkles } from "./sparkles.js";
import { PayoutTexts } from "./floaters.js";
import {
  initAudio,
  isBgmEnabled,
  isSfxEnabled,
  playSound,
  playMatchSounds,
  startBgm,
  stopBgm,
  toggleBgm,
  toggleSfx,
} from "./audio.js";
import {
  drawTitleScreen,
  drawCreditsScreen,
  drawHowToScreen,
  drawSettingsScreen,
  hitTestTitleScreen,
  hitTestCreditsScreen,
  hitTestHowToScreen,
  hitTestSettingsScreen,
  hoverTitleScreen,
  hoverCreditsScreen,
  hoverHowToScreen,
  hoverSettingsScreen,
} from "./menu.js";
import { drawMetallicText, loadTitleFont } from "./textfx.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const player = new Player();
const confetti = new Confetti();
const sparkles = new Sparkles();
const payoutTexts = new PayoutTexts();
let wheels = [];
let state = "menu"; // "menu" | "howto" | "settings" | "credits" | "playing" | "over"
let score = STARTING_MONEY;
let bestThisRun = STARTING_MONEY;
// Wager unit scales with wealth: level 1 = $10. Crossing a $100 boundary+50
// ($150, $250, ...) bumps it up a level; dropping below the $100 boundary
// ($100, $200, ...) bumps it back down (hysteresis avoids flicker).
let wagerLevel = 1;
let wager = WAGER_STEP;
let lastTime = 0;
// Each entry tracks an awarded match group:
//   { members: Map<Wheel, stake>, symbol, total, text }
// `members` keeps every reel ever counted in the group, mapped to the stake it
// joined with — so a reel that later scrolls off (or is unlocked) still counts
// toward the group's length and stake, letting the group keep growing. `total`
// is the full payout earned so far, so extending only pays the difference.
let payoutGroups = [];
let smoothedScroll = SCROLL_SPEED_BASE;
let smoothedSpinMult = SPIN_MULT_BASE;
let hasCompletedRun = readHasCompletedRun();
let highScore = hasCompletedRun ? readHighScore() : 0;

const STEP = REEL_WIDTH + REEL_GAP;
const REEL_STRIP_BUFFER = REEL_BUFFER_SLOTS * SYMBOL_SPACING;
const SCORING_TIERS = getScoringTiers();
let gameplayBackground = null;
let reelOverlay = null;
let reelFades = null;
let scoringLegend = null;

function shouldShowTouchControls() {
  return navigator.maxTouchPoints > 0 || Math.min(canvas.width, canvas.height) < 700;
}

function touchWagerButtonLayout() {
  const size = 42;
  const gap = 10;
  const y = 48;
  const right = canvas.width - 20;
  return [
    { action: "down", label: "-", x: right - size * 2 - gap, y, w: size, h: size },
    { action: "up", label: "+", x: right - size, y, w: size, h: size },
  ];
}

function wheelUnderPlayer() {
  const cx = player.x + player.width / 2;
  return wheels.find((w) => cx >= w.x && cx < w.x + w.width) ?? null;
}

function processPendingMatches(stripTop, zoneTop, zoneBottom) {
  const justFrozen = wheels.filter((w) => w.pendingMatchCheck);
  for (const w of justFrozen) w.pendingMatchCheck = false;
  if (justFrozen.length) {
    checkMatches(stripTop, zoneTop, zoneBottom, { requireWheels: justFrozen });
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

function readHasCompletedRun() {
  try {
    if (localStorage.getItem("slotrunner.hasPlayed") === "true") return true;
    return localStorage.getItem("slotrunner.highScore") !== null;
  } catch {
    return false;
  }
}

function readHighScore() {
  try {
    return Number(localStorage.getItem("slotrunner.highScore")) || 0;
  } catch {
    return 0;
  }
}

function trackBestThisRun() {
  bestThisRun = Math.max(bestThisRun, score);
}

function finalizeRun() {
  trackBestThisRun();
  if (bestThisRun > highScore) highScore = bestThisRun;
  hasCompletedRun = true;
  try {
    localStorage.setItem("slotrunner.hasPlayed", "true");
    localStorage.setItem("slotrunner.highScore", String(highScore));
  } catch {
    // High score remains visible for this session even if storage is unavailable.
  }
}

function triggerGameOver() {
  if (state === "over") return;
  state = "over";
  finalizeRun();
  stopBgm();
  playSound("death");
}

function audioMenuState() {
  return { bgm: isBgmEnabled(), sfx: isSfxEnabled() };
}

// Live wager unit: the minimum bet AND the +/- increment. Scales with wealth.
function wagerUnit() {
  return WAGER_STEP * wagerLevel;
}

// Re-evaluate the wager level against the current balance. Level up once the
// score reaches a $100 boundary+50; level down once it falls below the next
// lower $100 boundary. The gap between those thresholds is the hysteresis band.
function updateWagerLevel() {
  let changed = false;
  while (score >= 100 * wagerLevel + 50) {
    wagerLevel++;
    changed = true;
  }
  while (wagerLevel > 1 && score < 100 * (wagerLevel - 1)) {
    wagerLevel--;
    changed = true;
  }
  if (changed) clampWager();
}

// The wager can never exceed the balance; if the balance drops below the unit,
// the wager follows the balance down (only possible when nearly broke).
function clampWager() {
  const unit = wagerUnit();
  const snapped = Math.round(wager / unit) * unit;
  wager = Math.min(score, Math.max(unit, snapped));
}

function adjustWager(delta) {
  const unit = wagerUnit();
  wager = Math.min(score, Math.max(unit, wager + delta));
}

const GROUND_SYMBOL = -2; // sentinel: a frozen reel with nothing aligned in the row

// Classify a reel for the viability check: a spinning reel can be stopped on any
// symbol (one lock), a frozen/stopping reel is a fixed anchor (free), and a
// frozen reel with nothing in the row is a wall that breaks runs.
function classifyReel(w, stripTop, zoneTop, zoneBottom) {
  if (!w.frozen && !w.stopping) return { w, spin: true, sym: -1 };
  const slot = w.lockLandSlot(stripTop, zoneTop, zoneBottom);
  return { w, spin: false, sym: slot >= 0 ? w.slots[slot] : GROUND_SYMBOL };
}

// Fewest spinning reels that must be locked to complete some new 3-in-a-row,
// given the current board. Infinity when no run can be formed at all.
function minLocksForMatch(stripTop, zoneTop, zoneBottom) {
  const reels = wheels
    .filter((w) => w.x + w.width > 0 && w.x < canvas.width)
    .map((w) => classifyReel(w, stripTop, zoneTop, zoneBottom));

  let best = Infinity;
  for (let i = 0; i + 2 < reels.length; i++) {
    const t = [reels[i], reels[i + 1], reels[i + 2]];
    if (!wheelsAdjacent(t[0].w, t[1].w) || !wheelsAdjacent(t[1].w, t[2].w)) continue;

    let anchorSym = -1;
    let spinners = 0;
    let ok = true;
    for (const r of t) {
      if (r.spin) {
        spinners++;
      } else if (r.sym === GROUND_SYMBOL) {
        ok = false; // a wall can never become the match symbol
        break;
      } else if (anchorSym === -1) {
        anchorSym = r.sym;
      } else if (anchorSym !== r.sym) {
        ok = false; // two locked anchors with different symbols can't be unified
        break;
      }
    }
    // spinners === 0 is an already-complete run (already scored), not a rescue.
    if (ok && spinners >= 1) best = Math.min(best, spinners);
  }
  return best;
}

// Broke = it is impossible to reach another match. With every lock costing at
// least one wager unit, the player can afford floor(score / unit) locks; if that
// is fewer than the cheapest completable run needs, the run is over. At >= 3
// units a fresh run can always be built from scratch. The unit scales with
// wealth, but the level-down hysteresis keeps it at $10 whenever the balance is
// low enough for this check to matter, so death still happens at $0/$10/$20.
function checkBroke(stripTop, zoneTop, zoneBottom) {
  const unit = wagerUnit();
  if (score >= unit * 3) return false;
  if (wheels.some((w) => w.stopping)) return false; // a bet is still resolving

  const affordableLocks = Math.floor(score / unit);
  if (minLocksForMatch(stripTop, zoneTop, zoneBottom) <= affordableLocks) {
    return false;
  }

  score = Math.max(0, score);
  triggerGameOver();
  return true;
}

function resetGame() {
  resetWheelIds();
  score = STARTING_MONEY;
  bestThisRun = STARTING_MONEY;
  wagerLevel = 1;
  wager = WAGER_STEP;
  smoothedScroll = SCROLL_SPEED_BASE;
  smoothedSpinMult = SPIN_MULT_BASE;
  buildWheels();
  player.reset(canvas.width, canvas.height);
  confetti.particles = [];
  sparkles.particles = [];
  payoutTexts.clear();
  payoutGroups = [];
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
  rebuildStaticCanvases();
  if (state === "playing" || state === "over") {
    resetGame();
  }
}

function makeCanvas(width, height) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(width));
  c.height = Math.max(1, Math.ceil(height));
  return c;
}

function rebuildStaticCanvases() {
  if (!canvas.width || !canvas.height) return;

  gameplayBackground = makeCanvas(canvas.width, canvas.height);
  let g = gameplayBackground.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#0a0a12");
  g.fillStyle = bg;
  g.fillRect(0, 0, canvas.width, canvas.height);

  const { top, bottom } = reelWindow();
  reelOverlay = makeCanvas(canvas.width, canvas.height);
  g = reelOverlay.getContext("2d");
  g.fillStyle = "#0f172a";
  g.fillRect(0, 0, canvas.width, top);
  g.fillStyle = "#0a0a12";
  g.fillRect(0, bottom, canvas.width, canvas.height - bottom);

  reelFades = makeCanvas(canvas.width, canvas.height);
  g = reelFades.getContext("2d");
  const topFade = g.createLinearGradient(0, top, 0, top + 60);
  topFade.addColorStop(0, "rgba(0,0,0,0.65)");
  topFade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = topFade;
  g.fillRect(0, top, canvas.width, 60);

  const botFade = g.createLinearGradient(0, bottom - 60, 0, bottom);
  botFade.addColorStop(0, "rgba(0,0,0,0)");
  botFade.addColorStop(1, "rgba(0,0,0,0.65)");
  g.fillStyle = botFade;
  g.fillRect(0, bottom - 60, canvas.width, 60);

  scoringLegend = makeCanvas(canvas.width, 46);
  g = scoringLegend.getContext("2d");
  drawScoringLegend(g, 12);
}

function recycleWheels() {
  while (
    wheels.length &&
    wheels[0].x + REEL_WIDTH < 0 &&
    !wheels[0].stopping
  ) {
    wheels.shift();
  }
  pruneGroups();
  if (!wheels.length) return;
  let last = wheels[wheels.length - 1];
  while (last.x < canvas.width + STEP) {
    last = new Wheel(last.x + STEP, smoothedSpinMult);
    wheels.push(last);
  }
}

// A group stays alive while it still has at least one anchor: a member that is
// on screen and locked on the symbol. Once every member has scrolled off or been
// restarted (none still locked), the group dissolves — matching "length holds
// until all reels are restarted". Reaching it again then counts as a fresh match.
function pruneGroups() {
  const live = new Set(wheels);
  payoutGroups = payoutGroups.filter((g) => {
    for (const w of g.members.keys()) {
      if (live.has(w) && (w.frozen || w.stopping)) return true;
    }
    return false;
  });
}

function wheelsAdjacent(a, b) {
  return Math.abs(Math.abs(b.x - a.x) - STEP) < 5;
}

function runLengthMultiplier(length) {
  return length - 2; // 3→1×, 4→2×, 5→3× on the symbol multiplier
}

function membersShareWheel(members, wheelSet) {
  for (const w of members.keys()) if (wheelSet.has(w)) return true;
  return false;
}

function awardRun(run, stripTop, zoneTop, zoneBottom) {
  const sym = run[0].w.slots[run[0].slot];
  const live = new Set(wheels);
  const runSet = new Set(run.map((e) => e.w));

  // Existing groups of this symbol that the run touches — they merge into one.
  const overlapping = payoutGroups.filter(
    (g) => g.symbol === sym && membersShareWheel(g.members, runSet),
  );

  // Rebuild the merged membership (reel -> stake it joined with). Off-screen
  // members are trusted and kept, so the group keeps its length after a reel
  // scrolls away. A member that is on screen but has since been restarted onto a
  // different symbol has left the group and is dropped.
  const members = new Map();
  let previousTotal = 0;
  for (const g of overlapping) {
    previousTotal += g.total;
    for (const [w, stake] of g.members) {
      if (members.has(w)) continue;
      if (live.has(w) && (w.frozen || w.stopping)) {
        const slot = w.lockLandSlot(stripTop, zoneTop, zoneBottom);
        if (slot < 0 || w.slots[slot] !== sym) continue;
      }
      members.set(w, stake);
    }
  }

  let addedCount = 0;
  for (const { w } of run) {
    if (!members.has(w)) {
      members.set(w, w.stake);
      addedCount++;
    }
  }

  const length = members.size;
  if (length < 3) return;

  // Re-forming a single existing group with nothing new (e.g. a restarted reel
  // re-landed the same symbol): the group is intact, so pay nothing.
  if (addedCount === 0 && overlapping.length === 1) return;

  let totalStake = 0;
  for (const stake of members.values()) totalStake += stake;
  const total = Math.round(
    totalStake * getSymbolMultiplier(sym) * runLengthMultiplier(length),
  );

  // Merging/extending supersedes the old groups; their floating texts vanish so
  // only the new cumulative total shows.
  for (const g of overlapping) {
    payoutTexts.remove(g.text);
    const idx = payoutGroups.indexOf(g);
    if (idx >= 0) payoutGroups.splice(idx, 1);
  }

  const delta = total - previousTotal;
  if (delta > 0) {
    score += delta;
    trackBestThisRun();
    clampWager();
  }

  const group = { members, symbol: sym, total, text: null };

  let cx = 0;
  let cy = 0;
  for (const { w, slot } of run) {
    w.matchGroup = group;
    w.triggerMatchGlow(slot);
    const c = w.symbolCenter(
      stripTop,
      slot,
      w.stopping ? w.holdLandSpin : w.spin,
    );
    cx += c.x;
    cy += c.y;
  }
  cx /= run.length;
  cy /= run.length;

  group.text = payoutTexts.spawn(cx, cy, total);
  if (length > 3) {
    payoutTexts.spawnMultiplier(cx, cy + 42, length);
  }
  payoutGroups.push(group);

  sparkles.burst(cx, cy, 28);
  const jackpot = isJackpotSymbol(sym);
  playMatchSounds(getSymbolMultiplier(sym), length, jackpot);
  if (jackpot) {
    sparkles.burst(cx, cy, 80, true);
    confetti.burst(cx, cy, 80);
  }
}

function checkMatches(stripTop, zoneTop, zoneBottom, { award = true, requireWheels = null } = {}) {
  if (!award) {
    for (const w of wheels) w.glowTime = 0;
    return;
  }

  // When the check is triggered by freezing a column, only award runs that
  // include a just-frozen column. This prevents an already-scored group from
  // counting again once its leftmost member scrolls off-screen and is recycled
  // (which shrinks the run's id-key and slips past the awarded-match dedup).
  const required = requireWheels ? new Set(requireWheels) : null;

  const anchored = wheels.filter((w) => w.frozen || w.stopping);
  const candidates = anchored
    .map((w) => ({ w, slot: w.lockLandSlot(stripTop, zoneTop, zoneBottom) }))
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
    if (run.length >= 3 && (!required || run.some((e) => required.has(e.w)))) {
      awardRun(run, stripTop, zoneTop, zoneBottom);
    }
    i = j;
  }
}

function handleMenuPointer() {
  const p = consumePointer();
  if (!p) return;

  if (state === "menu") {
    const hit = hitTestTitleScreen(canvas.width, canvas.height, p.x, p.y, audioMenuState());
    if (hit === "play") {
      clearJump();
      startPlaying();
    } else if (hit === "howto") {
      state = "howto";
    } else if (hit === "settings") {
      state = "settings";
    } else if (hit === "credits") {
      state = "credits";
    }
    return;
  }

  if (state === "howto") {
    if (hitTestHowToScreen(canvas.width, canvas.height, p.x, p.y) === "back") {
      state = "menu";
    }
    return;
  }

  if (state === "settings") {
    if (getRebindingAction()) return;
    const hit = hitTestSettingsScreen(canvas.width, canvas.height, p.x, p.y);
    if (hit === "back") {
      state = "menu";
    } else if (hit === "bgm") {
      toggleBgm();
    } else if (hit === "sfx") {
      toggleSfx();
    } else if (hit === "reset") {
      resetControlBindings();
    } else if (hit?.startsWith("bind:")) {
      startRebinding(hit.slice("bind:".length));
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
    if (state === "credits" || state === "howto" || state === "settings") state = "menu";
    else if (state === "playing" || state === "over") goToMenu();
    return;
  }

  if (state === "menu" && consumeConfirm()) {
    startPlaying();
    return;
  }

  if ((state === "credits" || state === "howto" || state === "settings") && consumeConfirm()) {
    state = "menu";
    return;
  }

  handleMenuPointer();
}

function update(dt) {
  if (state === "menu" || state === "credits" || state === "howto" || state === "settings") {
    updateMenu();
    return;
  }

  if (state === "over") {
    if (consumeEscape()) {
      goToMenu();
      return;
    }
    if (consumeJump() || consumeConfirm()) startPlaying();
    return;
  }

  if (consumeEscape()) {
    goToMenu();
    return;
  }
  consumePointer(); // gameplay touches should not become stale menu clicks later

  const { top, bottom, stripTop, middleTop, zoneBottom } = reelWindow();

  if (consumeJump() && player.jump()) playSound("grunt");

  if (consumeWagerUp()) adjustWager(wagerUnit());
  if (consumeWagerDown()) adjustWager(-wagerUnit());

  if (consumeHold()) {
    const wheel = wheelUnderPlayer();
    if (wheel) {
      if (!wheel.frozen && !wheel.stopping) {
        // Locking a reel costs the current wager, staked on that reel.
        if (wager >= wagerUnit() && score >= wager) {
          score -= wager;
          wheel.beginHold(wager, stripTop, middleTop, zoneBottom);
          clampWager();
          playSound("button");
          checkMatches(stripTop, middleTop, zoneBottom, { requireWheels: [wheel] });
        } else {
          playSound("fail");
        }
      } else if (wheel.frozen) {
        // Unlocking forfeits the stake and clears any match glow.
        wheel.resumeSpin();
        checkMatches(stripTop, middleTop, zoneBottom, { award: false });
        playSound("button");
      }
    }
  }

  updateSmoothedDifficulty(dt);
  for (const w of wheels) w.refreshSpinMult(smoothedSpinMult);
  for (const w of wheels) w.update(dt, smoothedScroll);
  recycleWheels();
  processPendingMatches(stripTop, middleTop, zoneBottom);
  updateWagerLevel();
  if (checkBroke(stripTop, middleTop, zoneBottom)) return;

  const platforms = [];
  for (const w of wheels) {
    for (const p of w.getPlatforms(top, bottom, stripTop)) platforms.push(p);
  }

  const maxSpinSpeed = SPIN_SPEED_MAX * smoothedSpinMult;
  player.update(dt, platforms, getMoveAxis(), smoothedScroll, maxSpinSpeed, isJumpHeld());
  if (player.justLanded) playSound("land");

  confetti.update(dt);
  sparkles.update(dt);
  payoutTexts.update(dt, smoothedScroll);

  if (state !== "over" && player.isOffScreen(canvas.height, top)) {
    triggerGameOver();
  }
}

function drawMiddleRowHighlight(middleTop) {
  ctx.fillStyle = "rgba(250, 204, 21, 0.1)";
  ctx.fillRect(0, middleTop, canvas.width, SYMBOL_SIZE);
  ctx.strokeStyle = "rgba(250, 204, 21, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0.5, middleTop + 0.5, canvas.width - 1, SYMBOL_SIZE - 1);
}

function drawGameplayHud(top, bottom) {
  if (reelOverlay) ctx.drawImage(reelOverlay, 0, 0);
  drawStakes(bottom);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText(formatMoney(score), 20, 18);
  ctx.textAlign = "right";
  ctx.fillText(`Wager ${formatMoney(wager)}`, canvas.width - 20, 18);
  drawBottomHud();
  drawTouchWagerButtons();
}

function drawMatchGlows(stripTop) {
  for (const w of wheels) w.drawMatchGlow(ctx, stripTop);
}

// Show the wager staked on each locked reel, just below the reel face.
function drawStakes(reelBottom) {
  ctx.save();
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const w of wheels) {
    if (w.stake <= 0) continue;
    const cx = w.x + w.width / 2;
    if (cx < -40 || cx > canvas.width + 40) continue;
    ctx.fillStyle = "rgba(250, 204, 21, 0.9)";
    ctx.fillText(formatMoney(w.stake), cx, reelBottom + 8);
  }
  ctx.restore();
}

function drawScoringLegend(target, iconTop) {
  const icon = 22;
  let x = 20;

  target.save();
  target.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in target) target.imageSmoothingQuality = "high";
  target.textBaseline = "middle";
  target.textAlign = "left";
  target.font = "bold 13px system-ui, -apple-system, sans-serif";
  for (const tier of SCORING_TIERS) {
    for (const symbolIndex of tier.symbolIndices) {
      drawSymbolArt(target, symbolIndex, x, iconTop, icon);
      x += icon + 2;
    }
    x += 4;
    const text = `${tier.multiplier}x`;
    target.fillStyle = tier.jackpot ? "#67e8f9" : "rgba(250, 204, 21, 0.9)";
    target.fillText(text, x, iconTop + icon / 2);
    x += target.measureText(text).width + 16;
  }
  target.restore();
}

function drawBottomHud() {
  if (scoringLegend) {
    ctx.drawImage(scoringLegend, 0, canvas.height - scoringLegend.height);
  }

  if (hasCompletedRun) {
    ctx.save();
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
    ctx.fillText(`High ${formatMoney(highScore)}`, canvas.width - 20, canvas.height - 24);
    ctx.restore();
  }
}

function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTouchWagerButtons() {
  const buttons = state === "playing" && shouldShowTouchControls()
    ? touchWagerButtonLayout()
    : [];
  setTouchGameplayEnabled(state === "playing");
  setTouchWagerButtons(buttons);
  if (!buttons.length) return;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px system-ui, -apple-system, sans-serif";
  for (const btn of buttons) {
    const r = 8;
    roundRectPath(btn.x, btn.y, btn.w, btn.h, r);
    ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    const fill = ctx.createLinearGradient(btn.x, btn.y + btn.h, btn.x + btn.w, btn.y);
    fill.addColorStop(0, "#a54e07");
    fill.addColorStop(0.22, "#b47e11");
    fill.addColorStop(0.48, "#fef1a2");
    fill.addColorStop(0.72, "#bc881b");
    fill.addColorStop(1, "#a54e07");
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#a55d07";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.clip();
    const topInset = ctx.createLinearGradient(0, btn.y, 0, btn.y + btn.h * 0.45);
    topInset.addColorStop(0, "rgba(255, 246, 187, 0.95)");
    topInset.addColorStop(1, "rgba(255, 246, 187, 0)");
    ctx.strokeStyle = topInset;
    ctx.lineWidth = 5;
    ctx.stroke();

    const bottomInset = ctx.createLinearGradient(0, btn.y + btn.h * 0.55, 0, btn.y + btn.h);
    bottomInset.addColorStop(0, "rgba(139, 66, 8, 0)");
    bottomInset.addColorStop(1, "rgba(139, 66, 8, 0.95)");
    ctx.strokeStyle = bottomInset;
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 248, 200, 0.28)";
    ctx.fillRect(btn.x + 7, btn.y + 5, btn.w - 14, Math.max(2, btn.h * 0.12));
    ctx.restore();

    ctx.fillStyle = "rgba(250, 227, 133, 0.95)";
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
    ctx.fillStyle = "rgba(18, 10, 3, 0.92)";
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 - 1);
  }
  ctx.restore();
}

function clearTouchControls() {
  setTouchGameplayEnabled(false);
  setTouchWagerButtons([]);
}

function drawLoadingScreen() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#0a0a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(248, 250, 252, 0.82)";
  ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Loading...", canvas.width / 2, canvas.height / 2);
}

function draw() {
  if (state === "menu") {
    clearTouchControls();
    const hover = getPointerHover();
    const hoverId = hover
      ? hoverTitleScreen(canvas.width, canvas.height, hover.x, hover.y, audioMenuState())
      : null;
    drawTitleScreen(
      ctx,
      canvas.width,
      canvas.height,
      hoverId,
      audioMenuState(),
      hasCompletedRun ? highScore : null,
    );
    return;
  }

  if (state === "howto") {
    clearTouchControls();
    const hover = getPointerHover();
    const hoverId = hover
      ? hoverHowToScreen(canvas.width, canvas.height, hover.x, hover.y)
      : null;
    drawHowToScreen(ctx, canvas.width, canvas.height, hoverId);
    return;
  }

  if (state === "settings") {
    clearTouchControls();
    const hover = getPointerHover();
    const hoverId = hover && !getRebindingAction()
      ? hoverSettingsScreen(canvas.width, canvas.height, hover.x, hover.y)
      : null;
    drawSettingsScreen(
      ctx,
      canvas.width,
      canvas.height,
      hoverId,
      audioMenuState(),
      getControlBindings(),
      getRebindingAction(),
    );
    return;
  }

  if (state === "credits") {
    clearTouchControls();
    const hover = getPointerHover();
    const hoverId = hover
      ? hoverCreditsScreen(canvas.width, canvas.height, hover.x, hover.y)
      : null;
    drawCreditsScreen(ctx, canvas.width, canvas.height, hoverId);
    return;
  }

  if (gameplayBackground) {
    ctx.drawImage(gameplayBackground, 0, 0);
  } else {
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const { top, bottom, stripTop, stripBottom, middleTop, zoneBottom } = reelWindow();
  for (const w of wheels) {
    w.draw(ctx, top, bottom, stripTop, stripBottom, middleTop, zoneBottom);
  }

  if (reelFades) ctx.drawImage(reelFades, 0, 0);
  drawColumnDividers(ctx, wheels, top, bottom, canvas.width);
  drawMiddleRowHighlight(middleTop);
  drawMatchGlows(stripTop);
  player.draw(ctx);
  sparkles.draw(ctx);
  confetti.draw(ctx);
  payoutTexts.draw(ctx);
  drawGameplayHud(top, bottom);

  if (state === "over") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawMetallicText(ctx, "GAME OVER", canvas.width / 2, canvas.height / 2 - 30, 72);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillText(
      `${formatMoney(score)} — Best ${formatMoney(bestThisRun)} — Space / Enter / tap to retry`,
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

  tickDiamondSparkle(dt);
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
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
drawLoadingScreen();

Promise.all([loadSymbolTiles(), loadPlayerSprite(), loadTitleFont()])
  .then(() => {
    applyPlayerSprite(player);
    ready = true;
    rebuildStaticCanvases();
    requestAnimationFrame(loop);
  })
  .catch((err) => {
    console.error(err);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("Failed to load symbol images.", 20, 40);
  });
