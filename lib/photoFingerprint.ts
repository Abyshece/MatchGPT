// ============================================================================
// A photo's fingerprint: a 64-bit "difference hash" that stays the same when
// a photo is resized, recompressed or slightly recoloured, so the same photo
// on two accounts can be found (Admin → Moderation and Scam alerts;
// public.photo_fingerprints). Made here, in the admin's browser: the photo is
// shrunk to 9 × 8 grey pixels and each bit says whether a pixel is brighter
// than the one to its right. Two photos whose fingerprints differ in at most
// 6 of the 64 bits look the same.
// ============================================================================

/** The 72 grey values (9 × 8) → the fingerprint, as a signed 64-bit integer in text (Postgres bigint) */
export function differenceHash(grey: ArrayLike<number>): string {
  if (grey.length !== 72) throw new Error('Expected 9 × 8 grey values');
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (grey[y * 9 + x] > grey[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return BigInt.asIntN(64, bits).toString();
}

/** How many of the 64 bits differ */
export function hashDistance(a: string, b: string): number {
  let x = BigInt.asUintN(64, BigInt(a) ^ BigInt(b));
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

const LOAD_TIMEOUT_MS = 8000;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; reject(new Error(`Took too long: ${url}`)); }, LOAD_TIMEOUT_MS);
    img.crossOrigin = 'anonymous';  // the photo buckets allow it, so the canvas can be read
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error(`Couldn't load ${url}`)); };
    img.src = url;
  });

/** A photo's fingerprint, or null if it can't be loaded */
export async function fingerprintPhoto(url: string): Promise<string | null> {
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 9, 8);
    const { data } = ctx.getImageData(0, 0, 9, 8);
    const grey = new Array<number>(72);
    for (let i = 0; i < 72; i++) {
      grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    return differenceHash(grey);
  } catch {
    return null;
  }
}
