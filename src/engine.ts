/** Tap-to-select (region growing) + brush, and luminance-preserving recolor. All local. */

export function emptyMask(w: number, h: number) { return new Uint8Array(w * h); }

function blurred(d: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const i = (yy * w + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    const o = (y * w + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return out;
}

const cache = new WeakMap<ImageData, Uint8ClampedArray>();

/** Connected pixels with colour close to the tapped spot. Gaps (different colour) are skipped. */
export function growFrom(img: ImageData, sx: number, sy: number, tol: number): Uint8Array {
  const { width: w, height: h } = img;
  let d = cache.get(img);
  if (!d) { d = blurred(img.data, w, h); cache.set(img, d); }
  sx = Math.min(w - 1, Math.max(0, Math.round(sx))); sy = Math.min(h - 1, Math.max(0, Math.round(sy)));
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = (y * w + x) * 4; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++;
  }
  sr /= n; sg /= n; sb /= n;
  const mask = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  const ok = (p: number) => {
    const i = p * 4;
    const dr = d![i] - sr, dg = d![i + 1] - sg, db = d![i + 2] - sb;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3 <= tol;
  };
  const start = sy * w + sx;
  mask[start] = 1; q[tail++] = start;
  while (head < tail) {
    const p = q[head++]; const x = p % w, y = (p / w) | 0;
    if (x > 0 && !mask[p - 1] && ok(p - 1)) { mask[p - 1] = 1; q[tail++] = p - 1; }
    if (x < w - 1 && !mask[p + 1] && ok(p + 1)) { mask[p + 1] = 1; q[tail++] = p + 1; }
    if (y > 0 && !mask[p - w] && ok(p - w)) { mask[p - w] = 1; q[tail++] = p - w; }
    if (y < h - 1 && !mask[p + w] && ok(p + w)) { mask[p + w] = 1; q[tail++] = p + w; }
  }
  return mask;
}

export function paintDisc(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, v: 0 | 1) {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) mask[y * w + x] = v;
}

export function maskCount(m: Uint8Array) { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; }

export function unionInto(a: Uint8Array, b: Uint8Array) { for (let i = 0; i < a.length; i++) if (b[i]) a[i] = 1; }

/** Soft edge (3x3 box) so edges don't look cut out. */
function feather(mask: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) {
      // only compute near edges for speed
      let any = 0;
      for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx]) { any = 1; break; }
      }
      if (!any) continue;
    }
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      s += mask[yy * w + xx]; n++;
    }
    out[y * w + x] = s / n;
  }
  return out;
}

/**
 * Recolor: keeps the original light / shadow / texture by scaling the target colour with each
 * pixel's brightness relative to the area average (not a flat overlay).
 */
export function recolor(data: Uint8ClampedArray, w: number, h: number, mask: Uint8Array, rgb: [number, number, number]) {
  let sum = 0, n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { const p = i * 4; sum += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]; n++; }
  if (!n) return;
  const mean = Math.max(20, sum / n);
  const a = feather(mask, w, h);
  for (let i = 0; i < a.length; i++) {
    const al = a[i];
    if (al <= 0) continue;
    const p = i * 4;
    const l = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    let k = l / mean;
    k = k <= 1 ? Math.max(0.12, k) : 1 + (k - 1) * 0.7;
    let r = rgb[0] * k, g = rgb[1] * k, b = rgb[2] * k;
    data[p] = data[p] + (Math.min(255, r) - data[p]) * al;
    data[p + 1] = data[p + 1] + (Math.min(255, g) - data[p + 1]) * al;
    data[p + 2] = data[p + 2] + (Math.min(255, b) - data[p + 2]) * al;
  }
}
