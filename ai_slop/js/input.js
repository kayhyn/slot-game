const keys = new Set();
const held = new Set();

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
    e.preventDefault();
    keys.add("jump");
  }
  if (e.code === "KeyH") {
    keys.add("hold");
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
  if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
    keys.delete("jump");
  }
  if (["ArrowLeft", "KeyA"].includes(e.code)) {
    held.delete("left");
  }
  if (["ArrowRight", "KeyD"].includes(e.code)) {
    held.delete("right");
  }
});

window.addEventListener("pointerdown", () => keys.add("jump"));
window.addEventListener("pointerup", () => keys.delete("jump"));

export function consumeJump() {
  if (!keys.has("jump")) return false;
  keys.delete("jump");
  return true;
}

export function consumeHold() {
  if (!keys.has("hold")) return false;
  keys.delete("hold");
  return true;
}

export function getMoveAxis() {
  let axis = 0;
  if (held.has("left")) axis -= 1;
  if (held.has("right")) axis += 1;
  return axis;
}
