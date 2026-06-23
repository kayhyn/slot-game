const sounds = {};

export function initAudio() {
  load("jackpot", "jackpot.mp3");
  load("button", "button-press.mp3");
}

function load(key, url) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  audio.load();
  sounds[key] = audio;
}

export function playSound(key) {
  const template = sounds[key];
  if (!template) return;
  const clip = template.cloneNode();
  clip.play().catch(() => {});
}
