export interface Palette {
  /** Three vibrant colors, most dominant first (CSS hsl strings). */
  colors: [string, string, string];
  /** Single color for UI accents (progress bar, active row, buttons). */
  accent: string;
}

export const DEFAULT_PALETTE: Palette = {
  colors: ['hsl(160 75% 40%)', 'hsl(40 65% 52%)', 'hsl(255 45% 42%)'],
  accent: 'hsl(160 75% 45%)',
};

const SIZE = 32;
const HUE_BINS = 12; // 30° each
const MIN_HUE_GAP = 40;

const cache = new Map<string, Palette>();

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function hueDist(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // required for getImageData on remote art
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cover art failed to load'));
    img.src = src;
  });
}

interface Swatch { h: number; s: number; l: number }

/**
 * Extracts up to 3 vibrant, hue-distinct colors from cover art.
 * Falls back to DEFAULT_PALETTE for grayscale art or CORS/load failures.
 * `cacheKey` should be a stable track id (NOT the base64 string).
 */
export async function extractPalette(src: string, cacheKey: string): Promise<Palette> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  try {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No 2d context');
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;

    const bins = Array.from({ length: HUE_BINS }, () => ({ w: 0, h: 0, s: 0, l: 0 }));
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      if (l < 0.08 || l > 0.95 || s < 0.15) continue; // skip near-black/white/gray
      const w = s * (1 - Math.abs(2 * l - 1)); // favor colorful, mid-lightness pixels
      const bin = bins[Math.floor((h / 360) * HUE_BINS) % HUE_BINS];
      bin.w += w; bin.h += h * w; bin.s += s * w; bin.l += l * w;
    }

    const ranked = bins.filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
    if (!ranked.length) {
      cache.set(cacheKey, DEFAULT_PALETTE);
      return DEFAULT_PALETTE;
    }

    const topW = ranked[0].w;
    const picked: Swatch[] = [];
    for (const b of ranked) {
      if (b.w < topW * 0.05) break; // ignore noise bins
      const sw = { h: b.h / b.w, s: b.s / b.w, l: b.l / b.w };
      if (picked.every((p) => hueDist(p.h, sw.h) >= MIN_HUE_GAP)) picked.push(sw);
      if (picked.length === 3) break;
    }

    // Single-hue covers: derive neighbors so the blobs still have variety
    const offsets = [0, 30, -35];
    while (picked.length < 3) {
      const base = picked[0];
      picked.push({
        h: (base.h + offsets[picked.length] + 360) % 360,
        s: base.s,
        l: clamp(base.l + (picked.length === 1 ? 0.06 : -0.06), 0.3, 0.55),
      });
    }

    // Clamp so neon/pastel covers don't wash out white text
    const css = picked.map(({ h, s, l }) => {
      const S = clamp(s * 1.1, 0.45, 0.9);
      const L = clamp(l, 0.3, 0.55);
      return `hsl(${h.toFixed(0)} ${(S * 100).toFixed(0)}% ${(L * 100).toFixed(0)}%)`;
    }) as [string, string, string];

    const palette: Palette = { colors: css, accent: css[0] };
    cache.set(cacheKey, palette);
    return palette;
  } catch {
    return DEFAULT_PALETTE; // not cached, so a transient failure can retry
  }
}
