/** Tap-to-select (region growing) + smart edge-snapping brush + luminance recoloring. Local-first. */

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
const edgeCache = new WeakMap<ImageData, Uint8Array>();

/** Precompute Sobel gradient edge map (cached per ImageData). Values 0-255. */
export function getEdgeMap(img: ImageData): Uint8Array {
  let edges = edgeCache.get(img);
  if (edges) return edges;
  const { width: w, height: h, data } = img;
  edges = new Uint8Array(w * h);

  // Fast integer luminance
  const lum = new Uint8Array(w * h);
  for (let i = 0; i < lum.length; i++) {
    const p = i * 4;
    lum[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  // Sobel 3x3 filter
  for (let y = 1; y < h - 1; y++) {
    const yw = y * w;
    const yprev = yw - w;
    const ynext = yw + w;
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -lum[yprev + x - 1] + lum[yprev + x + 1]
        - (lum[yw + x - 1] << 1) + (lum[yw + x + 1] << 1)
        - lum[ynext + x - 1] + lum[ynext + x + 1];

      const gy =
        -lum[yprev + x - 1] - (lum[yprev + x] << 1) - lum[yprev + x + 1]
        + lum[ynext + x - 1] + (lum[ynext + x] << 1) + lum[ynext + x + 1];

      const mag = (Math.abs(gx) + Math.abs(gy)) >> 2;
      edges[yw + x] = Math.min(255, mag);
    }
  }
  edgeCache.set(img, edges);
  return edges;
}

/** Connected pixels with colour close to the tapped spot, respecting structural edges. */
export function growFrom(img: ImageData, sx: number, sy: number, tol: number): Uint8Array {
  const { width: w, height: h } = img;
  let d = cache.get(img);
  if (!d) { d = blurred(img.data, w, h); cache.set(img, d); }
  const edgeMap = getEdgeMap(img);
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
  const maxEdge = Math.max(34, tol * 0.85);

  const ok = (p: number) => {
    if (edgeMap[p] > maxEdge) return false;
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

/** Standard circular disc painter. */
export function paintDisc(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, v: 0 | 1) {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) mask[y * w + x] = v;
}

// Reusable local queue and visited stamps to prevent garbage collection pauses
let localQueue = new Int32Array(32768);
let visitStamp = new Int32Array(0);
let currentVisitId = 0;

/**
 * Smart Edge-Snapping Disc:
 * Fills up to structural boundaries (edges, rooflines, windows, doors, sky)
 * without spilling outside the wall!
 */
export function paintSmartDisc(
  mask: Uint8Array,
  img: ImageData,
  cx: number,
  cy: number,
  r: number,
  v: 0 | 1,
  edgeThreshold = 34,
  colorTol = 50
) {
  const { width: w, height: h } = img;
  let d = cache.get(img);
  if (!d) { d = blurred(img.data, w, h); cache.set(img, d); }
  const edgeMap = getEdgeMap(img);

  cx = Math.round(cx);
  cy = Math.round(cy);
  if (cx < 0 || cx >= w || cy < 0 || cy >= h) return;

  const rInt = Math.ceil(r);
  const r2 = r * r;

  if (visitStamp.length !== w * h) {
    visitStamp = new Int32Array(w * h);
    currentVisitId = 0;
  }
  currentVisitId++;
  if (currentVisitId > 2000000000) {
    visitStamp.fill(0);
    currentVisitId = 1;
  }
  const myVisit = currentVisitId;

  // Sample reference color at center (3x3 average)
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) {
        const p = (y * w + x) * 4;
        sr += d[p]; sg += d[p + 1]; sb += d[p + 2]; sn++;
      }
    }
  }
  sr /= sn; sg /= sn; sb /= sn;

  const maxPixels = (rInt * 2 + 1) * (rInt * 2 + 1);
  if (localQueue.length < maxPixels) {
    localQueue = new Int32Array(maxPixels * 2);
  }

  let head = 0, tail = 0;
  const startIdx = cy * w + cx;
  localQueue[tail++] = startIdx;
  visitStamp[startIdx] = myVisit;
  mask[startIdx] = v;

  while (head < tail) {
    const curr = localQueue[head++];
    const x = curr % w;
    const y = (curr / w) | 0;

    const neighbors = [
      x > 0 ? curr - 1 : -1,
      x < w - 1 ? curr + 1 : -1,
      y > 0 ? curr - w : -1,
      y < h - 1 ? curr + w : -1,
    ];

    for (let k = 0; k < 4; k++) {
      const nIdx = neighbors[k];
      if (nIdx < 0 || visitStamp[nIdx] === myVisit) continue;
      visitStamp[nIdx] = myVisit;

      const nx = nIdx % w;
      const ny = (nIdx / w) | 0;

      // 1. Must be strictly inside brush circle
      const dx = nx - cx;
      const dy = ny - cy;
      if (dx * dx + dy * dy > r2) continue;

      // 2. Edge barrier check: do not cross strong architectural edges!
      if (edgeMap[nIdx] > edgeThreshold) {
        continue;
      }

      // 3. Color similarity check relative to brush center
      const cp = nIdx * 4;
      const dr = d[cp] - sr;
      const dg = d[cp + 1] - sg;
      const db = d[cp + 2] - sb;
      const diff = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3;
      if (diff > colorTol) {
        continue;
      }

      mask[nIdx] = v;
      localQueue[tail++] = nIdx;
    }
  }
}

/** Interpolates strokes smoothly between touch points with edge snapping. */
export function paintSmartStroke(
  mask: Uint8Array,
  img: ImageData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  v: 0 | 1,
  smart = true,
  edgeThreshold = 34,
  colorTol = 50
) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const stepSize = Math.max(3, r * 0.35);
  const steps = Math.max(1, Math.ceil(dist / stepSize));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (smart) {
      paintSmartDisc(mask, img, x, y, r, v, edgeThreshold, colorTol);
    } else {
      paintDisc(mask, img.width, img.height, x, y, r, v);
    }
  }
}

export function maskCount(m: Uint8Array) { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; }

export function unionInto(a: Uint8Array, b: Uint8Array) { for (let i = 0; i < a.length; i++) if (b[i]) a[i] = 1; }

/** Soft edge (3x3 box) so edges don't look cut out. */
function feather(mask: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) {
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
export function recolor(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  mask: Uint8Array,
  rgb: [number, number, number],
  finish: 'matt' | 'sheen' = 'matt'
) {
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
    k = k <= 1 ? Math.max(0.12, k) : 1 + (k - 1) * (finish === 'sheen' ? 0.82 : 0.68);
    let r = rgb[0] * k, g = rgb[1] * k, b = rgb[2] * k;
    if (finish === 'sheen' && k > 1.12) {
      const boost = (k - 1.12) * 24;
      r += boost; g += boost; b += boost;
    }
    data[p] = data[p] + (Math.min(255, r) - data[p]) * al;
    data[p + 1] = data[p + 1] + (Math.min(255, g) - data[p + 1]) * al;
    data[p + 2] = data[p + 2] + (Math.min(255, b) - data[p + 2]) * al;
  }
}
