const keys = new Set();
const held = new Set();
let escapePressed = false;
let wagerUpPressed = false;
let wagerDownPressed = false;
let pendingPointer = null;
let pointerHover = null;

export function initInput(canvas) {
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    pendingPointer = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
    keys.add("jump");
  });
  canvas.addEventListener("pointerup", () => keys.delete("jump"));
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pointerHover = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  });
  canvas.addEventListener("pointerleave", () => {
    pointerHover = null;
  });
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    escapePressed = true;
  }
  if (e.code === "ArrowUp" || e.code === "KeyL") {
    e.preventDefault();
    wagerUpPressed = true;
  }
  if (e.code === "ArrowDown" || e.code === "KeyM") {
    e.preventDefault();
    wagerDownPressed = true;
  }
  if (["Space", "KeyW"].includes(e.code)) {
    e.preventDefault();
    keys.add("jump");
  }
  if (e.code === "KeyH" || e.code === "Enter") {
    keys.add("hold");
  }
  if (e.code === "Enter") {
    keys.add("confirm");
  }
  if (["ArrowLeft", "KeyA"].includes(e.code)) {
    e.preventDefault();
    held.add("left");
  }
  if (["ArrowRight", "KeyD"].includes(e.code)) {
    e.preventDefault();
    held.add("right");
  }
});

window.addEventListener("keyup", (e) => {
  if (["Space", "KeyW"].includes(e.code)) {
    keys.delete("jump");
  }
  if (["ArrowLeft", "KeyA"].includes(e.code)) {
    held.delete("left");
  }
  if (["ArrowRight", "KeyD"].includes(e.code)) {
    held.delete("right");
  }
});

export function consumeJump() {
  if (!keys.has("jump")) return false;
  keys.delete("jump");
  return true;
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
  return axis;
}
