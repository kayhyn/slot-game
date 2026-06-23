const BUTTONS = [
  { id: "play", label: "Play" },
  { id: "credits", label: "Credits" },
];

function layout(width, height) {
  const cx = width / 2;
  const titleY = height * 0.32;
  const firstBtnY = height * 0.52;
  const btnW = 220;
  const btnH = 54;
  const gap = 18;

  return {
    titleY,
    buttons: BUTTONS.map((b, i) => ({
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

function drawBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#0a0a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

function drawButton(ctx, btn, hovered = false) {
  const { x, y, w, h, label } = btn;
  const r = 12;

  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }

  const fill = hovered ? "#1e293b" : "#111827";
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = hovered ? "#fde047" : "rgba(250, 204, 21, 0.55)";
  ctx.lineWidth = hovered ? 2.5 : 2;
  ctx.stroke();

  ctx.fillStyle = hovered ? "#fef9c3" : "#f8fafc";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

function hitTest(btn, x, y) {
  return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

export function drawTitleScreen(ctx, width, height, hoverId = null) {
  drawBackground(ctx, width, height);

  const { titleY, buttons } = layout(width, height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 72px system-ui, sans-serif";
  const titleGrad = ctx.createLinearGradient(0, titleY - 40, 0, titleY + 40);
  titleGrad.addColorStop(0, "#fde047");
  titleGrad.addColorStop(0.5, "#facc15");
  titleGrad.addColorStop(1, "#ca8a04");
  ctx.fillStyle = titleGrad;
  ctx.fillText("Slotrunner", width / 2, titleY);

  ctx.font = "17px system-ui, sans-serif";
  ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
  ctx.fillText("Freeze the reels. Match three in a row.", width / 2, titleY + 52);

  for (const btn of buttons) {
    drawButton(ctx, btn, hoverId === btn.id);
  }
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
    "Slotrunner",
    "",
    "Symbol art — Ville Seppänen (CC BY 4.0)",
    "",
    "Press Escape to return",
  ];
  let y = height * 0.38;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += 32;
  }

  drawButton(ctx, back, hoverId === back.id);
}

export function hitTestTitleScreen(width, height, x, y) {
  const { buttons } = layout(width, height);
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

export function hoverTitleScreen(width, height, x, y) {
  return hitTestTitleScreen(width, height, x, y);
}

export function hoverCreditsScreen(width, height, x, y) {
  return hitTestCreditsScreen(width, height, x, y);
}
