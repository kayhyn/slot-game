// Player physics
export const GRAVITY = 2000;        // downward acceleration (px/s^2)
export const JUMP_VELOCITY = -820;  // initial jump speed (px/s), clears one symbol with headroom
export const JUMP_HOLD_GRAVITY_MULT = 0.82; // lighter gravity while holding jump on the way up
export const JUMP_CUT_VELOCITY = -300;    // upward speed floor when jump is released early
export const COYOTE_TIME = 0.1;     // grace window (s) to still jump just after leaving a platform
export const DEATH_BOTTOM_MARGIN = 72;    // extra px past screen bottom before feet trigger death

// World motion — ramps with score (see difficulty())
export const SCROLL_SPEED_BASE = 34;  // starting scroll (px/s)
export const SCROLL_SPEED_MAX = 112;  // scroll cap at high score (px/s)
export const MOVE_SPEED = 220;        // player run speed (px/s), faster than scroll
export const SPEED_RAMP_SCORE = 2050;  // dollars to reach max speed
export const SPEED_RAMP_SMOOTH = 1.1; // how quickly scroll/spin catch up to score (1/s)

// Per-wheel spin: each reel picks a random speed in this range and a random
// direction. Negative direction means the symbols roll upward (backwards).
export const SPIN_SPEED_MIN = 100;  // slowest reel (px/s)
export const SPIN_SPEED_MAX = 320;  // fastest reel (px/s)
export const SPIN_MULT_BASE = 0.52; // spin multiplier at zero score
export const SPIN_MULT_MAX = 1.18;  // spin multiplier at max ramp
export const BACKWARD_CHANCE = 0.35; // chance a reel spins backwards

// Reel / wheel geometry
export const REEL_WIDTH = 172;      // width of one slot wheel (wider = easier to step between columns)
export const REEL_GAP = 0;          // horizontal gap between wheels (0 = a wheel is always under the player)
export const REEL_MARGIN = 70;      // vertical margin: reel face spans from REEL_MARGIN to height - REEL_MARGIN
export const REEL_BUFFER_SLOTS = 2; // extra strip above/below the visible face (hidden by UI masks)

// Symbols (the platforms)
export const SYMBOL_SIZE = 96;      // size of a symbol tile
export const SYMBOL_SPACING = 130;  // vertical distance between symbols on a reel
export const REEL_PERIOD = 10;      // slots on one reel "page"; expected distinct symbols per reel (~5) sits well under this, so the rare overflow that drops low-value symbols barely perturbs the odds
export const NUM_SLOTS = REEL_PERIOD * 2; // strip repeats the page twice so a short reel still fills the face

// Scoring — dollars; symbol multipliers defined on each symbol in wheel.js
export const STARTING_MONEY = 100;
// Base wager unit. The live unit (min wager AND increment) scales up a step for
// every $100 boundary+50 the player crosses (see wagerUnit() in main.js).
export const WAGER_STEP = 10;
export const MATCH_GLOW_DURATION = 0.85; // seconds of match glow on symbols

// Column hold: reel spin deceleration (px/s^2) when player presses H
export const HOLD_DECEL = 900;

export function difficulty(score) {
  const raw = Math.min(1, score / SPEED_RAMP_SCORE);
  const t = raw * raw * (3 - 2 * raw);
  return {
    t,
    scroll:
      SCROLL_SPEED_BASE + (SCROLL_SPEED_MAX - SCROLL_SPEED_BASE) * t,
    spinMult: SPIN_MULT_BASE + (SPIN_MULT_MAX - SPIN_MULT_BASE) * t,
  };
}
