const SOUNDS_DIR = "sounds/";
const sounds = {};
const BGM_VOLUME = 0.38;
const SFX_VOLUMES = {
  start: 0.5,
  death: 0.5,
  match2x4x: 0.5,
  jackpot: 0.5,
};
const BGM_PAUSE_KEYS = new Set(["jackpot"]);
const BGM_ENABLED_KEY = "slotrunner.bgmEnabled";
const SFX_ENABLED_KEY = "slotrunner.sfxEnabled";

let bgm = null;
let bgmSfxPauseCount = 0;
let bgmActive = false;
let bgmEnabled = readSetting(BGM_ENABLED_KEY, true);
let sfxEnabled = readSetting(SFX_ENABLED_KEY, true);

export function initAudio() {
  load("match2x4x", "2x-4x.mp3");
  load("jackpot", "jackpot.mp3");
  load("kaching", "kaching.mp3");
  load("6x", "6x.mp3");
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

function readSetting(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function writeSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures; the in-memory toggle still works for this session.
  }
}

function pauseBgmForSfx() {
  if (!bgm || !bgmActive) return;
  bgmSfxPauseCount++;
  if (bgmSfxPauseCount === 1) bgm.pause();
}

function resumeBgmAfterSfx() {
  if (!bgm || !bgmActive) return;
  bgmSfxPauseCount = Math.max(0, bgmSfxPauseCount - 1);
  if (!bgmEnabled) return;
  if (bgmSfxPauseCount === 0) bgm.play().catch(() => {});
}

export function startBgm() {
  if (!bgm) return;
  bgmSfxPauseCount = 0;
  bgmActive = true;
  bgm.volume = BGM_VOLUME;
  bgm.currentTime = 0;
  if (!bgmEnabled) return;
  bgm.play().catch(() => {});
}

export function stopBgm() {
  if (!bgm) return;
  bgmActive = false;
  bgmSfxPauseCount = 0;
  bgm.pause();
}

function matchPitch(groupLength) {
  return 1 + Math.max(0, groupLength - 3) * 0.1;
}

export function playMatchSounds(symbolMultiplier, groupLength, isJackpot = false) {
  const pitch = matchPitch(groupLength);
  const tier = Math.round(Number(symbolMultiplier) || 0);
  if (isJackpot || tier >= 12) {
    playSound("jackpot", { pitch });
    return;
  }
  switch (tier) {
    case 2:
      playSound("match2x4x", { pitch });
      break;
    case 4:
      playSound("match2x4x", { pitch });
      playSound("kaching", { pitch });
      break;
    case 6:
      playSound("kaching", { pitch });
      playSound("6x", { pitch });
      break;
    default:
      playSound("match2x4x", { pitch });
      break;
  }
}

export function playSound(key, { pitch } = {}) {
  if (!sfxEnabled) return;
  const template = sounds[key];
  if (!template) return;
  const clip = template.cloneNode();
  const volume = SFX_VOLUMES[key];
  if (volume !== undefined) clip.volume = volume;
  if (pitch !== undefined) {
    clip.preservesPitch = false;
    clip.mozPreservesPitch = false;
    clip.webkitPreservesPitch = false;
    clip.playbackRate = pitch;
  }
  if (BGM_PAUSE_KEYS.has(key)) {
    pauseBgmForSfx();
    clip.addEventListener("ended", resumeBgmAfterSfx, { once: true });
    clip.addEventListener("error", resumeBgmAfterSfx, { once: true });
  }
  clip.play().catch(() => {
    if (BGM_PAUSE_KEYS.has(key)) resumeBgmAfterSfx();
  });
}

export function isBgmEnabled() {
  return bgmEnabled;
}

export function isSfxEnabled() {
  return sfxEnabled;
}

export function toggleBgm() {
  bgmEnabled = !bgmEnabled;
  writeSetting(BGM_ENABLED_KEY, bgmEnabled);
  if (!bgm) return bgmEnabled;
  if (!bgmEnabled) {
    bgm.pause();
  } else if (bgmActive && bgmSfxPauseCount === 0) {
    bgm.play().catch(() => {});
  }
  return bgmEnabled;
}

export function toggleSfx() {
  sfxEnabled = !sfxEnabled;
  writeSetting(SFX_ENABLED_KEY, sfxEnabled);
  return sfxEnabled;
}
