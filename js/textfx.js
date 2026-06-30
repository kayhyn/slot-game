export const TITLE_FONT = "Porky";

// Smooth gold surface. The shine comes from diagonal specular overlays below,
// not from stacked horizontal bands.
const METAL_GOLD_STOPS = [
  [0.0, "#fff7bf"],
  [0.28, "#f7c348"],
  [0.62, "#b66b0b"],
  [1.0, "#6d3600"],
];

let fontPromise = null;

export function loadTitleFont() {
  if (fontPromise) return fontPromise;
  if (typeof FontFace === "undefined" || !document.fonts) {
    fontPromise = Promise.resolve(false);
    return fontPromise;
  }
  const face = new FontFace(TITLE_FONT, "url(fonts/porky.otf)");
  fontPromise = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      return true;
    })
    .catch((err) => {
      console.warn("Title font fonts/porky.otf not loaded; using fallback.", err);
      return false;
    });
  return fontPromise;
}

/**
 * Draw text with a shiny gold fill, clipped specular streaks, beveled strokes,
 * and a soft drop shadow. Honors the caller's textAlign / textBaseline.
 */
export function drawMetallicText(ctx, text, x, y, fontSize, options = {}) {
  const {
    stops = METAL_GOLD_STOPS,
    strokeStyle = "rgba(43, 21, 0, 0.96)",
    strokeWidth = Math.max(4, fontSize * 0.08),
    shadow = true,
  } = options;

  ctx.save();
  ctx.font = `${fontSize}px "${TITLE_FONT}", system-ui, sans-serif`;
  ctx.textAlign = ctx.textAlign || "center";
  ctx.textBaseline = ctx.textBaseline || "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  if (shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
    ctx.shadowBlur = fontSize * 0.16;
    ctx.shadowOffsetY = fontSize * 0.07;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(text, x, y);

  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = fontSize * 0.04;
  ctx.shadowOffsetY = fontSize * 0.025;
  ctx.strokeStyle = "rgba(255, 213, 74, 0.8)";
  ctx.lineWidth = Math.max(2, fontSize * 0.04);
  ctx.strokeText(text, x, y);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const fillCanvas = document.createElement("canvas");
  fillCanvas.width = ctx.canvas.width;
  fillCanvas.height = ctx.canvas.height;
  const fillCtx = fillCanvas.getContext("2d");
  fillCtx.font = ctx.font;
  fillCtx.textAlign = ctx.textAlign;
  fillCtx.textBaseline = ctx.textBaseline;

  fillCtx.fillStyle = "#000";
  fillCtx.fillText(text, x, y);

  fillCtx.globalCompositeOperation = "source-in";
  const textWidth = fillCtx.measureText(text).width;
  const grad = fillCtx.createLinearGradient(
    x - textWidth * 0.5,
    y - fontSize * 0.55,
    x + textWidth * 0.48,
    y + fontSize * 0.58,
  );
  for (const [stop, color] of stops) grad.addColorStop(stop, color);
  fillCtx.fillStyle = grad;
  fillCtx.fillRect(0, 0, fillCanvas.width, fillCanvas.height);

  fillCtx.globalCompositeOperation = "source-atop";

  const broadHighlight = fillCtx.createRadialGradient(
    x - textWidth * 0.2,
    y - fontSize * 0.28,
    fontSize * 0.08,
    x - textWidth * 0.12,
    y - fontSize * 0.2,
    Math.max(textWidth * 0.58, fontSize * 2.2),
  );
  broadHighlight.addColorStop(0, "rgba(255, 255, 255, 0.72)");
  broadHighlight.addColorStop(0.16, "rgba(255, 247, 190, 0.46)");
  broadHighlight.addColorStop(0.55, "rgba(255, 218, 74, 0.16)");
  broadHighlight.addColorStop(1, "rgba(255, 255, 255, 0)");
  fillCtx.fillStyle = broadHighlight;
  fillCtx.fillRect(0, 0, fillCanvas.width, fillCanvas.height);

  fillCtx.save();
  fillCtx.translate(x, y);
  fillCtx.rotate(-0.18);
  const streak = fillCtx.createLinearGradient(0, -fontSize, 0, fontSize);
  streak.addColorStop(0, "rgba(255, 255, 255, 0)");
  streak.addColorStop(0.43, "rgba(255, 255, 255, 0)");
  streak.addColorStop(0.49, "rgba(255, 255, 255, 0.95)");
  streak.addColorStop(0.52, "rgba(255, 250, 210, 0.78)");
  streak.addColorStop(0.58, "rgba(255, 255, 255, 0)");
  streak.addColorStop(1, "rgba(255, 255, 255, 0)");
  fillCtx.fillStyle = streak;
  fillCtx.fillRect(-textWidth * 0.6, -fontSize, textWidth * 1.2, fontSize * 2);

  const smallerStreak = fillCtx.createLinearGradient(0, -fontSize, 0, fontSize);
  smallerStreak.addColorStop(0, "rgba(255, 255, 255, 0)");
  smallerStreak.addColorStop(0.6, "rgba(255, 255, 255, 0)");
  smallerStreak.addColorStop(0.64, "rgba(255, 255, 255, 0.58)");
  smallerStreak.addColorStop(0.68, "rgba(255, 255, 255, 0)");
  smallerStreak.addColorStop(1, "rgba(255, 255, 255, 0)");
  fillCtx.fillStyle = smallerStreak;
  fillCtx.fillRect(-textWidth * 0.52, -fontSize, textWidth * 1.04, fontSize * 2);
  fillCtx.restore();

  const lowerShade = fillCtx.createLinearGradient(0, y - fontSize * 0.15, 0, y + fontSize * 0.64);
  lowerShade.addColorStop(0, "rgba(74, 33, 0, 0)");
  lowerShade.addColorStop(1, "rgba(45, 18, 0, 0.38)");
  fillCtx.fillStyle = lowerShade;
  fillCtx.fillRect(0, 0, fillCanvas.width, fillCanvas.height);

  ctx.drawImage(fillCanvas, 0, 0);

  ctx.strokeStyle = "rgba(255, 255, 235, 0.52)";
  ctx.lineWidth = Math.max(1, fontSize * 0.018);
  ctx.strokeText(text, x, y);

  ctx.restore();
}
