import {
  GRAVITY,
  JUMP_VELOCITY,
  JUMP_HOLD_GRAVITY_MULT,
  JUMP_CUT_VELOCITY,
  COYOTE_TIME,
  DEATH_BOTTOM_MARGIN,
  MOVE_SPEED,
  SYMBOL_SIZE,
} from "./constants.js";

const LAND_MIN_FALL = SYMBOL_SIZE / 2;

const FRAME_DIR = "character_frames/frame_";
const FRAME_COUNT = 10;
const FRAME_DELAY = 0.12; // 12 cs per GIF frame
const SPRITE_HEIGHT = 78;
const TILE_SCALE = 2;

let spriteSize = null;
let frames = [];
let shadowFrames = [];

function buildShadowCanvas(frameCanvas) {
  const c = document.createElement("canvas");
  c.width = frameCanvas.width;
  c.height = frameCanvas.height;
  const g = c.getContext("2d");
  g.filter = "brightness(0)";
  g.drawImage(frameCanvas, 0, 0);
  return c;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function buildFrameCanvas(img, width, height) {
  const c = document.createElement("canvas");
  c.width = width * TILE_SCALE;
  c.height = height * TILE_SCALE;
  const g = c.getContext("2d");
  g.scale(TILE_SCALE, TILE_SCALE);
  g.drawImage(img, 0, 0, width, height);
  return c;
}

export function loadPlayerSprite() {
  if (frames.length) return Promise.resolve(spriteSize);
  const urls = Array.from(
    { length: FRAME_COUNT },
    (_, i) => `${FRAME_DIR}${String(i).padStart(3, "0")}.png`,
  );
  return Promise.all(urls.map(loadImage)).then((images) => {
    const scale = SPRITE_HEIGHT / images[0].naturalHeight;
    const width = images[0].naturalWidth * scale;
    const height = SPRITE_HEIGHT;
    frames = images.map((img) => buildFrameCanvas(img, width, height));
    shadowFrames = frames.map(buildShadowCanvas);
    spriteSize = { width, height };
    return spriteSize;
  });
}

export function applyPlayerSprite(player) {
  if (!spriteSize) return;
  player.width = spriteSize.width;
  player.height = spriteSize.height;
}

export class Player {
  constructor() {
    this.width = 44;
    this.height = 60;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.animTime = 0;
    this.onGround = false;
    this.justLanded = false;
    this.fallStartFeet = 0;
    this.fromJump = false;
    this.groundWheel = null;
    this.groundVy = 0;
    this.coyoteTime = 0;
    this.screenWidth = 0;
  }

  reset(screenWidth, screenHeight) {
    this.screenWidth = screenWidth;
    this.x = screenWidth / 2 - this.width / 2;
    this.y = screenHeight * 0.25;
    this.vy = 0;
    this.animTime = 0;
    this.onGround = false;
    this.justLanded = false;
    this.fallStartFeet = this.y + this.height;
    this.fromJump = false;
    this.groundWheel = null;
    this.groundVy = 0;
    this.coyoteTime = 0;
  }

  jump() {
    // Allow a jump while grounded or within the coyote-time grace window.
    if (!this.onGround && this.coyoteTime <= 0) return false;
    this.vy = JUMP_VELOCITY;
    this.onGround = false;
    this.coyoteTime = 0;
    this.groundWheel = null;
    this.groundVy = 0;
    this.fromJump = true;
    return true;
  }

  update(dt, platforms, moveAxis, scrollSpeed, maxSpinSpeed, jumpHeld = false) {
    this.animTime += dt;
    this.justLanded = false;
    const wasOnGround = this.onGround;
    if (wasOnGround) this.fallStartFeet = this.y + this.height;

    // Carried left with the scrolling wheels; arrow keys / WASD offset from that.
    this.x -= scrollSpeed * dt;
    this.x += moveAxis * MOVE_SPEED * dt;

    if (this.onGround && this.groundVy) {
      this.y += this.groundVy * dt;
    }

    const prevFeet = this.y + this.height;

    let gravity = GRAVITY;
    if (jumpHeld && this.vy < 0) gravity *= JUMP_HOLD_GRAVITY_MULT;
    this.vy += gravity * dt;
    if (!jumpHeld && this.vy < 0) {
      this.vy = Math.max(this.vy, JUMP_CUT_VELOCITY);
    }
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
        const fallDistance = this.y + this.height - this.fallStartFeet;
        if (!wasOnGround && (fallDistance > LAND_MIN_FALL || this.fromJump)) {
          this.justLanded = true;
        }
        this.fromJump = false;
      }
    }

    // Refresh the coyote window while grounded; otherwise let it tick down so a
    // jump pressed shortly after walking off an edge still fires.
    if (this.onGround) {
      this.coyoteTime = COYOTE_TIME;
    } else {
      this.coyoteTime = Math.max(0, this.coyoteTime - dt);
    }
  }

  isOffScreen(screenHeight, reelTop) {
    const feetY = this.y + this.height;
    const offBottom = feetY > screenHeight + DEATH_BOTTOM_MARGIN;
    const offHorizontal = this.x + this.width < 0 || this.x > this.screenWidth;
    const feetAboveTop = feetY < reelTop;
    const offTop = feetAboveTop && this.vy >= 0;
    if (offHorizontal && !offBottom && !this.onGround) {
      return offTop;
    }
    return offHorizontal || offBottom || offTop;
  }

  drawShadow(ctx, frame, x, y, width, height) {
    const cx = x + width / 2;
    const feetY = y + height;
    const airborne = !this.onGround;
    const airFactor = airborne ? Math.min(1, Math.abs(this.vy) / 520) : 0;

    ctx.save();
    ctx.translate(cx, feetY + 1);
    ctx.scale(1 - airFactor * 0.18, 0.17);
    ctx.globalAlpha = 0.46 - airFactor * 0.26;
    ctx.drawImage(frame, -width / 2, -height, width, height);
    ctx.restore();
  }

  draw(ctx) {
    const { x, y, width, height } = this;
    if (frames.length) {
      const i = Math.floor(this.animTime / FRAME_DELAY) % FRAME_COUNT;
      if (shadowFrames[i]) {
        this.drawShadow(ctx, shadowFrames[i], x, y, width, height);
      }
      ctx.drawImage(frames[i], x, y, width, height);
      return;
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height + 2, width * 0.38, height * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(x, y, width, height);
  }
}
