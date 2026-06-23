// Player physics
export const GRAVITY = 2000;        // downward acceleration (px/s^2)
export const JUMP_VELOCITY = -760;  // initial jump speed (px/s), tuned to clear one symbol

// World motion — ramps with score (see difficulty())
export const SCROLL_SPEED_BASE = 36;  // starting scroll (px/s)
export const SCROLL_SPEED_MAX = 88;   // scroll cap at high score (px/s)
export const MOVE_SPEED = 220;        // player run speed (px/s), faster than scroll
export const SPEED_RAMP_SCORE = 30;   // match points to reach max speed

// Per-wheel spin: each reel picks a random speed in this range and a random
// direction. Negative direction means the symbols roll upward (backwards).
export const SPIN_SPEED_MIN = 100;  // slowest reel (px/s)
export const SPIN_SPEED_MAX = 320;  // fastest reel (px/s)
export const SPIN_MULT_BASE = 0.55; // spin multiplier at zero score
export const SPIN_MULT_MAX = 1.0;   // spin multiplier at max ramp
export const BACKWARD_CHANCE = 0.35; // chance a reel spins backwards

// Reel / wheel geometry
export const REEL_WIDTH = 150;      // width of one slot wheel
export const REEL_GAP = 0;          // horizontal gap between wheels (0 = a wheel is always under the player)
export const REEL_MARGIN = 70;      // vertical margin: reel face spans from REEL_MARGIN to height - REEL_MARGIN
export const REEL_BUFFER_SLOTS = 2; // extra strip above/below the visible face (hidden by UI masks)

// Symbols (the platforms)
export const SYMBOL_SIZE = 96;      // size of a symbol tile
export const SYMBOL_SPACING = 130;  // vertical distance between symbols on a reel
export const NUM_SLOTS = 14;        // symbols per reel strip before it loops

// Scoring — points awarded only for 3+ symbol matches in the golden zone
export const MATCH_BONUS = 100;     // points per symbol in a matching run
export const MATCH_GLOW_DURATION = 0.85; // seconds of match glow on symbols

// Column hold: reel spin deceleration (px/s^2) when player presses H
export const HOLD_DECEL = 900;

export function difficulty(score) {
  const t = Math.min(1, score / SPEED_RAMP_SCORE);
  return {
    t,
    scroll:
      SCROLL_SPEED_BASE + (SCROLL_SPEED_MAX - SCROLL_SPEED_BASE) * t,
    spinMult: SPIN_MULT_BASE + (SPIN_MULT_MAX - SPIN_MULT_BASE) * t,
  };
}
