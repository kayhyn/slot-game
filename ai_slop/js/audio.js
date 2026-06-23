const SOUNDS_DIR = "sounds/";
const sounds = {};
const BGM_VOLUME = 0.38;
const BGM_PAUSE_KEYS = new Set(["diamond"]);

let bgm = null;
let bgmSfxPauseCount = 0;
let bgmActive = false;

export function initAudio() {
  load("jackpot", "jackpot.mp3");
  load("diamond", "diamond.mp3");
  load("button", "button-press.mp3");
  load("death", "aw-dangit.mp3");
  load("start", "lets-go-gambling.mp3");
  load("fail", "fail.mp3");
  load("grunt", "grunt.mp3");
  load("land", "land.mp3");

  bgm = new Audio();
  bgm.preload = "auto";
  bgm.src = `${SOUNDS_DIR}bgm.mp3`;
  bgm.loop = true;
  bgm.volume = BGM_VOLUME;
  bgm.load();
}

function load(key, file) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = `${SOUNDS_DIR}${file}`;
  audio.load();
  sounds[key] = audio;
}

function pauseBgmForSfx() {
  if (!bgm || !bgmActive) return;
  bgmSfxPauseCount++;
  if (bgmSfxPauseCount === 1) bgm.pause();
}

function resumeBgmAfterSfx() {
  if (!bgm || !bgmActive) return;
  bgmSfxPauseCount = Math.max(0, bgmSfxPauseCount - 1);
  if (bgmSfxPauseCount === 0) bgm.play().catch(() => {});
}

export function startBgm() {
  if (!bgm) return;
  bgmSfxPauseCount = 0;
  bgmActive = true;
  bgm.volume = BGM_VOLUME;
  bgm.currentTime = 0;
  bgm.play().catch(() => {});
}

export function stopBgm() {
  if (!bgm) return;
  bgmActive = false;
  bgmSfxPauseCount = 0;
  bgm.pause();
}

export function playSound(key) {
  const template = sounds[key];
  if (!template) return;
  const clip = template.cloneNode();
  if (BGM_PAUSE_KEYS.has(key)) {
    pauseBgmForSfx();
    clip.addEventListener("ended", resumeBgmAfterSfx, { once: true });
    clip.addEventListener("error", resumeBgmAfterSfx, { once: true });
  }
  clip.play().catch(() => {
    if (BGM_PAUSE_KEYS.has(key)) resumeBgmAfterSfx();
  });
}
