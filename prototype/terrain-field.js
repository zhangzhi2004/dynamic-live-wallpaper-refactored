"use strict";

// Both wallpapers use the same warped icon density. Keep the undisturbed
// contributions when Explorer reports just one or two moved icons.
window.createTerrainField = function (width, height, step, noise) {
  const length = width * height;
  const baseline = Math.sqrt(-Math.log(0.35));
  const floor = Math.exp(-30);
  let density, layout, sigma, warp, result, revisions = 0;

  function addRectangle(rect, count, inverseSigma, warpAmount) {
    const { cx, cy, hw, hh } = rect;
    const radius = 5.5 * sigma + Math.max(hw, hh) * 0.5 + warpAmount * 0.5;
    const x0 = Math.max(0, Math.floor((cx - radius) / step));
    const x1 = Math.min(width - 1, Math.ceil((cx + radius) / step));
    const y0 = Math.max(0, Math.floor((cy - radius) / step));
    const y1 = Math.min(height - 1, Math.ceil((cy + radius) / step));
    for (let y = y0; y <= y1; y++) {
      const row = y * width;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        const dx = Math.max(0, Math.abs(x * step + noise.wx[i] * warpAmount - cx) - hw * 0.5);
        const dy = Math.max(0, Math.abs(y * step + noise.wy[i] * warpAmount - cy) - hh * 0.5);
        density[i] += count * Math.exp(-(dx * dx + dy * dy) * inverseSigma);
      }
    }
  }

  function empty(sigmaValue) {
    return { s: new Float32Array(length).fill(sigmaValue * (Math.sqrt(30) - baseline)) };
  }

  function compute(rects, sigmaValue, warpValue) {
    const next = new Map();
    for (const rect of rects) {
      const key = `${rect.cx},${rect.cy},${rect.hw},${rect.hh}`;
      const entry = next.get(key);
      if (entry) entry.count++;
      else next.set(key, { rect, count: 1 });
    }
    const changes = [];
    const compatible = !!density && sigma === sigmaValue && warp === warpValue;
    if (compatible) {
      for (const [key, entry] of layout) {
        const count = (next.get(key)?.count ?? 0) - entry.count;
        if (count) changes.push({ rect: entry.rect, count });
      }
      for (const [key, entry] of next) if (!layout.has(key)) changes.push(entry);
      if (!changes.length) return result;
    }

    sigma = sigmaValue;
    warp = warpValue;
    layout = next;
    // Rebase after a run of small edits to bound floating-point cancellation
    // in the low-density part of the field.
    const rebuild = !compatible || changes.length >= next.size || revisions >= 96;
    if (rebuild) density = new Float64Array(length);
    const inverseSigma = 1 / (sigma * sigma);
    const warpAmount = warp * 2.2;
    for (const { rect, count } of rebuild ? next.values() : changes)
      addRectangle(rect, count, inverseSigma, warpAmount);
    revisions = rebuild ? 0 : revisions + 1;
    if (!next.size) {
      result = empty(sigma);
      return result;
    }

    const s = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const logDensity = Math.log(Math.max(density[i], floor));
      s[i] = sigma * (Math.sqrt(Math.max(-logDensity, 0)) - baseline)
        - sigma * 0.6 * Math.max(logDensity, 0);
    }
    result = { s };
    return result;
  }

  return { compute, empty };
};
