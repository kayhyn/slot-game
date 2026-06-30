import { drawSymbolIcon, getScoringTiers } from "./wheel.js";
import { drawMetallicText } from "./textfx.js";

function titleButtons() {
  return [
    { id: "play", label: "Play" },
    { id: "howto", label: "How to Play" },
    { id: "settings", label: "Settings" },
    { id: "credits", label: "Credits" },
  ];
}

function layout(width, height, audio = { bgm: true, sfx: true }) {
  const cx = width / 2;
  const titleY = height * 0.26;
  const btnW = 220;
  const btnH = 48;
  const gap = 12;
  const buttons = titleButtons();
  const stackH = buttons.length * btnH + (buttons.length - 1) * gap;
  const firstBtnY = Math.min(height * 0.44, height - stackH - 24);

  return {
    titleY,
    buttons: buttons.map((b, i) => ({
      id: b.id,
      label: b.label,
      x: cx - btnW / 2,
      y: firstBtnY + i * (btnH + gap),
      w: btnW,
      h: btnH,
    })),
    back: {
      id: "back",
      label: "Back",
      x: cx - btnW / 2,
      y: height * 0.78,
      w: btnW,
      h: btnH,
    },
  };
}

function settingsLayout(width, height) {
  const cx = width / 2;
  const btnH = 42;
  const rowGap = 12;
  const labelW = 150;
  const bindW = 190;
  const startY = height * 0.28;
  const controls = [
    { id: "moveLeft", label: "Move Left" },
    { id: "moveRight", label: "Move Right" },
    { id: "jump", label: "Jump" },
    { id: "hold", label: "Hold Reel" },
    { id: "wagerUp", label: "Wager Up" },
    { id: "wagerDown", label: "Wager Down" },
  ];

  return {
    controls: controls.map((row, i) => ({
      ...row,
      labelX: cx - labelW,
      y: startY + i * (btnH + rowGap),
      button: {
        id: `bind:${row.id}`,
        label: "",
        x: cx + 10,
        y: startY + i * (btnH + rowGap),
        w: bindW,
        h: btnH,
      },
    })),
    bgm: { id: "bgm", label: "", x: cx - 205, y: height * 0.76, w: 130, h: btnH },
    sfx: { id: "sfx", label: "", x: cx - 65, y: height * 0.76, w: 130, h: btnH },
    reset: { id: "reset", label: "Reset Keys", x: cx + 75, y: height * 0.76, w: 130, h: btnH },
    back: { id: "back", label: "Back", x: cx - 110, y: height * 0.86, w: 220, h: 48 },
  };
}

function drawBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#0a0a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

function drawButton(ctx, btn, hovered = false) {
  const { x, y, w, h, label } = btn;
  const r = 8;

  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }

  ctx.shadowColor = hovered ? "rgba(0, 0, 0, 0.32)" : "rgba(0, 0, 0, 0.22)";
  ctx.shadowBlur = hovered ? 14 : 8;
  ctx.shadowOffsetY = hovered ? 6 : 3;
  const fill = ctx.createLinearGradient(x, y + h, x + w, y);
  fill.addColorStop(0, "#a54e07");
  fill.addColorStop(0.22, "#b47e11");
  fill.addColorStop(0.48, hovered ? "#fff6bd" : "#fef1a2");
  fill.addColorStop(0.72, "#bc881b");
  fill.addColorStop(1, "#a54e07");
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = hovered ? "rgba(165, 93, 7, 0.6)" : "#a55d07";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.clip();
  const topInset = ctx.createLinearGradient(0, y, 0, y + h * 0.45);
  topInset.addColorStop(0, "rgba(255, 246, 187, 0.95)");
  topInset.addColorStop(1, "rgba(255, 246, 187, 0)");
  ctx.strokeStyle = topInset;
  ctx.lineWidth = 5;
  ctx.stroke();

  const bottomInset = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
  bottomInset.addColorStop(0, "rgba(139, 66, 8, 0)");
  bottomInset.addColorStop(1, "rgba(139, 66, 8, 0.95)");
  ctx.strokeStyle = bottomInset;
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 248, 200, 0.28)";
  ctx.fillRect(x + 8, y + 5, w - 16, Math.max(2, h * 0.12));

  ctx.font = "800 21px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(250, 227, 133, 0.95)";
  ctx.fillText(label, x + w / 2, y + h / 2 + 2);
  ctx.fillStyle = hovered ? "rgba(18, 10, 3, 0.78)" : "rgba(18, 10, 3, 0.92)";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

function hitTest(btn, x, y) {
  return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

export function drawTitleScreen(ctx, width, height, hoverId = null, audio, highScore = null) {
  drawBackground(ctx, width, height);

  const { titleY, buttons } = layout(width, height, audio);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  drawMetallicText(ctx, "Slot Runner", width / 2, titleY, 84);

  ctx.font = "17px system-ui, sans-serif";
  ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
  ctx.fillText("Platforming + gambling = fun?", width / 2, titleY + 52);

  if (highScore !== null) {
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillStyle = "rgba(250, 204, 21, 0.78)";
    ctx.fillText(`High Score $${highScore}`, width / 2, titleY + 80);
  }

  for (const btn of buttons) {
    drawButton(ctx, btn, hoverId === btn.id);
  }
}

export function drawHowToScreen(ctx, width, height, hoverId = null) {
  drawBackground(ctx, width, height);

  const { back } = layout(width, height);
  const cx = width / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText("How to Play", cx, height * 0.13);

  ctx.font = "17px system-ui, sans-serif";
  ctx.fillStyle = "rgba(248, 250, 252, 0.82)";
  const lines = [
    "Run across the slot reels and stay on the symbols.",
    "Lock reels in the highlighted center row to make 3+ matching symbols.",
    "Each lock costs your wager. Matches pay back the staked reels times the symbol value.",
    "Default controls: move A/D or arrows, jump W/Space/tap, lock H/Enter.",
    "Controls and audio can be changed in Settings.",
  ];
  let y = height * 0.23;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += 28;
  }

  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillStyle = "#fde047";
  ctx.fillText("Scoring Legend", cx, height * 0.44);

  // Symbols clustered under a single payout label per tier (high value first).
  const tiers = getScoringTiers();
  const icon = 38;
  const gap = 6;
  const labelGap = 16;
  const rowStep = 52;
  let rowY = height * 0.5;

  for (const tier of tiers) {
    const count = tier.symbolIndices.length;
    const clusterW = count * icon + (count - 1) * gap;
    const label = `${tier.multiplier}x`;
    ctx.font = "bold 22px system-ui, sans-serif";
    const labelW = ctx.measureText(label).width;
    let x = cx - (clusterW + labelGap + labelW) / 2;
    const iconTop = rowY - icon / 2;
    for (const symbolIndex of tier.symbolIndices) {
      drawSymbolIcon(ctx, symbolIndex, x, iconTop, icon);
      x += icon + gap;
    }
    x += labelGap - gap;
    ctx.textAlign = "left";
    ctx.fillStyle = tier.jackpot ? "#67e8f9" : "rgba(250, 204, 21, 0.95)";
    ctx.fillText(label, x, rowY);
    rowY += rowStep;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillText("Longer matching runs multiply the payout again.", cx, rowY + 6);

  drawButton(ctx, back, hoverId === back.id);
}

export function drawSettingsScreen(
  ctx,
  width,
  height,
  hoverId = null,
  audio,
  bindings,
  rebindingAction = null,
) {
  drawBackground(ctx, width, height);

  const ui = settingsLayout(width, height);
  const cx = width / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText("Settings", cx, height * 0.15);

  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
  ctx.fillText(
    rebindingAction ? "Press any key, or Escape to cancel." : "Click a control to remap it.",
    cx,
    height * 0.21,
  );

  ctx.font = "17px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (const row of ui.controls) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(248, 250, 252, 0.82)";
    ctx.fillText(row.label, row.labelX, row.y + row.button.h / 2);

    const label =
      rebindingAction === row.id
        ? "Press a key..."
        : bindings[row.id] || "Unbound";
    drawButton(ctx, { ...row.button, label }, hoverId === row.button.id);
  }

  drawButton(
    ctx,
    { ...ui.bgm, label: `BGM ${audio.bgm ? "On" : "Off"}` },
    hoverId === "bgm",
  );
  drawButton(
    ctx,
    { ...ui.sfx, label: `SFX ${audio.sfx ? "On" : "Off"}` },
    hoverId === "sfx",
  );
  drawButton(ctx, ui.reset, hoverId === "reset");
  drawButton(ctx, ui.back, hoverId === "back");
}

export function drawCreditsScreen(ctx, width, height, hoverId = null) {
  drawBackground(ctx, width, height);

  const { back } = layout(width, height);
  const cx = width / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText("Credits", cx, height * 0.22);

  ctx.font = "18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(248, 250, 252, 0.8)";
  const lines = [
    "Slot Runner",
    "~",
    "Game - Kaylee Hynes",
    "Symbol art — Ville Seppänen (CC BY 4.0)",
    "Music - Celtic Electro Jig by Dominique Garnier",
    "Fonts - Dafont.com",
    "~",
    "Press Escape to return",
  ];
  let y = height * 0.38;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += 32;
  }

  drawButton(ctx, back, hoverId === back.id);
}

export function hitTestTitleScreen(width, height, x, y, audio) {
  const { buttons } = layout(width, height, audio);
  for (const btn of buttons) {
    if (hitTest(btn, x, y)) return btn.id;
  }
  return null;
}

export function hitTestCreditsScreen(width, height, x, y) {
  const { back } = layout(width, height);
  if (hitTest(back, x, y)) return back.id;
  return null;
}

export function hitTestHowToScreen(width, height, x, y) {
  const { back } = layout(width, height);
  if (hitTest(back, x, y)) return back.id;
  return null;
}

export function hitTestSettingsScreen(width, height, x, y) {
  const ui = settingsLayout(width, height);
  for (const row of ui.controls) {
    if (hitTest(row.button, x, y)) return row.button.id;
  }
  for (const btn of [ui.bgm, ui.sfx, ui.reset, ui.back]) {
    if (hitTest(btn, x, y)) return btn.id;
  }
  return null;
}

export function hoverTitleScreen(width, height, x, y, audio) {
  return hitTestTitleScreen(width, height, x, y, audio);
}

export function hoverCreditsScreen(width, height, x, y) {
  return hitTestCreditsScreen(width, height, x, y);
}

export function hoverHowToScreen(width, height, x, y) {
  return hitTestHowToScreen(width, height, x, y);
}

export function hoverSettingsScreen(width, height, x, y) {
  return hitTestSettingsScreen(width, height, x, y);
}
