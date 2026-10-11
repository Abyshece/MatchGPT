// ============================================================================
// Photos made small before they're sent (profile photos, the verification
// selfie): a phone photo is often 2–10 MB, and every profile view downloads
// it. Redrawn at 1280 pixels at most on the longest side, as a JPEG, it's
// about 150–300 KB and still sharp on a phone screen.
//
// Redrawing also drops what the camera hid in the file (EXIF), which can
// include where the photo was taken: profile photos are public, so a home's
// location shouldn't travel with them. Turned the right way up first (the
// browser applies the camera's rotation when it decodes the photo).
//
// If the browser can't decode the file (a format it doesn't know), the
// original is returned unchanged and `shrunk` is false.
// ============================================================================

export const MAX_SIDE = 1280;
const QUALITY = 0.85;

export interface Shrunk {
  blob: Blob;
  type: string;      // the blob's content type
  ext: string;       // a file extension for it
  shrunk: boolean;   // false: the original, as it was
}

const extOf = (file: File) => file.name.split('.').pop()?.toLowerCase() || 'jpg';

export async function shrinkImage(file: File, maxSide = MAX_SIDE): Promise<Shrunk> {
  const original: Shrunk = { blob: file, type: file.type, ext: extOf(file), shrunk: false };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return original;
    }
    // A JPEG has no see-through parts: white behind a transparent PNG, not black
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size === 0) return original;
    return { blob, type: 'image/jpeg', ext: 'jpg', shrunk: true };
  } catch {
    return original;
  }
}
