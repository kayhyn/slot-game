import { GRAVITY, JUMP_VELOCITY, MOVE_SPEED } from "./constants.js";

export class Player {
  constructor() {
    this.width = 44;
    this.height = 60;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.onGround = false;
    this.groundWheel = null;
    this.groundVy = 0;
    this.screenWidth = 0;
  }

  reset(screenWidth, screenHeight) {
    this.screenWidth = screenWidth;
    this.x = screenWidth / 2 - this.width / 2;
    this.y = screenHeight * 0.25;
    this.vy = 0;
    this.onGround = false;
    this.groundWheel = null;
    this.groundVy = 0;
  }

  jump() {
    if (!this.onGround) return;
    this.vy = JUMP_VELOCITY;
    this.onGround = false;
    this.groundWheel = null;
    this.groundVy = 0;
  }

  update(dt, platforms, moveAxis, scrollSpeed, maxSpinSpeed) {
    // Carried left with the scrolling wheels; arrow keys / WASD offset from that.
    this.x -= scrollSpeed * dt;
    this.x += moveAxis * MOVE_SPEED * dt;

    if (this.onGround && this.groundVy) {
      this.y += this.groundVy * dt;
    }

    const prevFeet = this.y + this.height;

    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;

    const newFeet = this.y + this.height;
    // Tolerance lets the player stick to a fast-rolling symbol (either direction).
    const ride = maxSpinSpeed * dt + 6;

    this.onGround = false;
    this.groundWheel = null;
    this.groundVy = 0;

    if (this.vy >= 0) {
      let best = null;
      for (const p of platforms) {
        const overlapX = this.x + this.width > p.x && this.x < p.x + p.width;
        if (!overlapX) continue;
        if (prevFeet <= p.y + ride && newFeet >= p.y - ride) {
          if (!best || p.y < best.y) best = p; // prefer the highest valid symbol
        }
      }
      if (best) {
        this.y = best.y - this.height;
        this.vy = 0;
        this.onGround = true;
        this.groundWheel = best.wheel;
        this.groundVy = best.vy;
      }
    }
  }

  isOffScreen(screenHeight, reelTop) {
    const offHorizontal = this.x + this.width < 0 || this.x > this.screenWidth;
    const offBottom = this.y > screenHeight + 120;
    const feetAboveTop = this.y + this.height < reelTop;
    const offTop = feetAboveTop && this.vy >= 0;
    return offHorizontal || offBottom || offTop;
  }

  draw(ctx) {
    const { x, y, width, height } = this;
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(x, y, width, height);
    // facing-right eye
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(x + width * 0.62, y + height * 0.2, 7, 7);
  }
}
