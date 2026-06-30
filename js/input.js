const keys = new Set();
const held = new Set();
const BINDINGS_KEY = "slotrunner.bindings";
const DEFAULT_BINDINGS = {
  moveLeft: ["ArrowLeft", "KeyA"],
  moveRight: ["ArrowRight", "KeyD"],
  jump: ["Space", "KeyW"],
  hold: ["KeyH", "Enter"],
  wagerUp: ["ArrowUp", "KeyL"],
  wagerDown: ["ArrowDown", "KeyK"],
};

let jumpPressed = false;
let escapePressed = false;
let wagerUpPressed = false;
let wagerDownPressed = false;
let pendingPointer = null;
let pointerHover = null;
let bindings = readBindings();
let rebindAction = null;
let touchGesture = null;
let touchMoveAxis = 0;
let touchWagerButtons = [];
let touchGameplayEnabled = false;

const TAP_SLOP = 18;
const SWIPE_THRESHOLD = 28;

export function initInput(canvas) {
  canvas.addEventListener("pointerdown", (e) => {
    const p = canvasPoint(canvas, e);
    pendingPointer = p;
    if (e.pointerType === "touch") {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const hit = hitTouchWagerButton(p);
      if (hit === "up") wagerUpPressed = true;
      if (hit === "down") wagerDownPressed = true;
      if (hit) return;
      if (!touchGameplayEnabled) return;

      touchGesture = {
        id: e.pointerId,
        startX: p.x,
        startY: p.y,
        moved: false,
      };
      touchMoveAxis = 0;
      return;
    }

    keys.add("jump");
    jumpPressed = true;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") {
      e.preventDefault();
      finishTouchGesture(canvas, e);
      return;
    }
    keys.delete("jump");
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = canvasPoint(canvas, e);
    pointerHover = p;
    if (e.pointerType === "touch" && touchGesture?.id === e.pointerId) {
      e.preventDefault();
      updateTouchSwipe(p);
    }
  });
  canvas.addEventListener("pointerleave", () => {
    pointerHover = null;
  });
  canvas.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "touch" && touchGesture?.id === e.pointerId) {
      clearTouchGesture();
    }
  });
  canvas.style.touchAction = "none";
}

function canvasPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function hitTouchWagerButton(p) {
  for (const btn of touchWagerButtons) {
    if (p.x >= btn.x && p.x <= btn.x + btn.w && p.y >= btn.y && p.y <= btn.y + btn.h) {
      return btn.action;
    }
  }
  return null;
}

function updateTouchSwipe(p) {
  const dx = p.x - touchGesture.startX;
  const dy = p.y - touchGesture.startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  touchGesture.moved ||= Math.hypot(dx, dy) > TAP_SLOP;
  if (absX > SWIPE_THRESHOLD && absX > absY * 1.15) {
    touchMoveAxis = Math.sign(dx);
  }
}

function finishTouchGesture(canvas, e) {
  if (!touchGesture || touchGesture.id !== e.pointerId) return;
  const p = canvasPoint(canvas, e);
  const dx = p.x - touchGesture.startX;
  const dy = p.y - touchGesture.startY;
  if (Math.hypot(dx, dy) <= TAP_SLOP) {
    jumpPressed = true;
  }
  clearTouchGesture();
}

function clearTouchGesture() {
  touchGesture = null;
  touchMoveAxis = 0;
}

export function setTouchWagerButtons(buttons) {
  touchWagerButtons = buttons;
}

export function setTouchGameplayEnabled(enabled) {
  touchGameplayEnabled = enabled;
  if (!enabled) clearTouchGesture();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (rebindAction) {
      rebindAction = null;
      e.preventDefault();
      return;
    }
    escapePressed = true;
  }

  if (rebindAction) {
    e.preventDefault();
    bindings[rebindAction] = [e.code];
    saveBindings();
    rebindAction = null;
    keys.clear();
    held.clear();
    return;
  }

  if (matchesBinding("wagerUp", e.code)) {
    e.preventDefault();
    wagerUpPressed = true;
  }
  if (matchesBinding("wagerDown", e.code)) {
    e.preventDefault();
    wagerDownPressed = true;
  }
  if (matchesBinding("jump", e.code)) {
    e.preventDefault();
    if (!keys.has("jump")) jumpPressed = true;
    keys.add("jump");
  }
  if (matchesBinding("hold", e.code)) {
    keys.add("hold");
  }
  if (e.code === "Enter") {
    keys.add("confirm");
  }
  if (matchesBinding("moveLeft", e.code)) {
    e.preventDefault();
    held.add("left");
  }
  if (matchesBinding("moveRight", e.code)) {
    e.preventDefault();
    held.add("right");
  }
});

window.addEventListener("keyup", (e) => {
  if (matchesBinding("jump", e.code)) {
    keys.delete("jump");
  }
  if (matchesBinding("moveLeft", e.code)) {
    held.delete("left");
  }
  if (matchesBinding("moveRight", e.code)) {
    held.delete("right");
  }
});

function readBindings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BINDINGS_KEY));
    if (!parsed || typeof parsed !== "object") return cloneDefaultBindings();
    return Object.fromEntries(
      Object.entries(DEFAULT_BINDINGS).map(([action, defaults]) => [
        action,
        Array.isArray(parsed[action]) && parsed[action].length ? parsed[action] : defaults,
      ]),
    );
  } catch {
    return cloneDefaultBindings();
  }
}

function cloneDefaultBindings() {
  return Object.fromEntries(
    Object.entries(DEFAULT_BINDINGS).map(([action, codes]) => [action, [...codes]]),
  );
}

function saveBindings() {
  try {
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
  } catch {
    // Remaps still apply in memory if storage is unavailable.
  }
}

function matchesBinding(action, code) {
  return bindings[action]?.includes(code);
}

export function formatKeyCode(code) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "Space";
  if (code.startsWith("Arrow")) return code.slice(5);
  return code;
}

export function getControlBindings() {
  return Object.fromEntries(
    Object.entries(bindings).map(([action, codes]) => [
      action,
      codes.map(formatKeyCode).join(" / "),
    ]),
  );
}

export function startRebinding(action) {
  if (!bindings[action]) return;
  rebindAction = action;
}

export function getRebindingAction() {
  return rebindAction;
}

export function resetControlBindings() {
  bindings = cloneDefaultBindings();
  saveBindings();
  keys.clear();
  held.clear();
}

export function consumeJump() {
  if (!jumpPressed) return false;
  jumpPressed = false;
  return true;
}

export function isJumpHeld() {
  return keys.has("jump");
}

export function consumeConfirm() {
  if (!keys.has("confirm")) return false;
  keys.delete("confirm");
  keys.delete("hold");
  return true;
}

export function consumeEscape() {
  if (!escapePressed) return false;
  escapePressed = false;
  return true;
}

export function consumePointer() {
  const p = pendingPointer;
  pendingPointer = null;
  return p;
}

export function getPointerHover() {
  return pointerHover;
}

export function clearJump() {
  keys.delete("jump");
  jumpPressed = false;
}

export function consumeWagerUp() {
  if (!wagerUpPressed) return false;
  wagerUpPressed = false;
  return true;
}

export function consumeWagerDown() {
  if (!wagerDownPressed) return false;
  wagerDownPressed = false;
  return true;
}

export function consumeHold() {
  if (!keys.has("hold")) return false;
  keys.delete("hold");
  keys.delete("confirm");
  return true;
}

export function getMoveAxis() {
  let axis = 0;
  if (held.has("left")) axis -= 1;
  if (held.has("right")) axis += 1;
  return Math.max(-1, Math.min(1, axis + touchMoveAxis));
}
