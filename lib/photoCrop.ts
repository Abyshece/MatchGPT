// ============================================================================
// Cropping a photo before it's uploaded (components/PhotoCropper.tsx): the
// member frames each photo as their card will show it (3:4, like MatchCard
// and My Profile), and can turn a sideways one.
//
//   prepareForCrop()  a photo made small enough to move around smoothly
//                     (2560 pixels at most, the right way up, without the
//                     camera's hidden details: lib/imageShrink.ts)
//   cropToFile()      the framed part as a JPEG, 1280 pixels tall at most;
//                     uploadPhoto() then stores it (lib/photoService.ts)
// ============================================================================

import { shrinkImage } from './imageShrink';

export const CROP_ASPECT = 3 / 4;   // width : height, as the cards show photos
const OUTPUT_MAX_SIDE = 1280;

export interface CropArea { x: number; y: number; width: number; height: number }

export interface Prepared {
  name: string;
  url: string;        // an object URL to show; revoke() when done
  readable: boolean;  // false: the browser can't open it, so it can't be cropped here
}

/** A photo ready to frame (an object URL of a smaller copy) */
export async function prepareForCrop(file: File): Promise<Prepared> {
  const small = await shrinkImage(file, 2560);
  return { name: file.name, url: URL.createObjectURL(small.blob), readable: small.shrunk };
}

/** Loads a photo already on the profile, to frame it again */
export async function prepareFromUrl(url: string): Promise<Prepared | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return prepareForCrop(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo couldn't be opened."));
    img.src = src;
  });
}

/**
 * The framed part of the photo as a JPEG File. `area` is in the pixels of
 * the photo turned by `rotation` degrees (what react-easy-crop reports).
 */
export async function cropToFile(src: string, area: CropArea, rotation: number, name: string): Promise<File> {
  const img = await loadImage(src);
  const turn = ((rotation % 360) + 360) % 360;
  const sideways = turn === 90 || turn === 270;

  // The whole photo, turned
  const turned = document.createElement('canvas');
  turned.width = sideways ? img.naturalHeight : img.naturalWidth;
  turned.height = sideways ? img.naturalWidth : img.naturalHeight;
  const t = turned.getContext('2d');
  if (!t) throw new Error("The photo couldn't be cropped.");
  t.translate(turned.width / 2, turned.height / 2);
  t.rotate((turn * Math.PI) / 180);
  t.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  // The framed part, no bigger than it needs to be
  const scale = Math.min(1, OUTPUT_MAX_SIDE / Math.max(area.width, area.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(area.width * scale));
  out.height = Math.max(1, Math.round(area.height * scale));
  const o = out.getContext('2d');
  if (!o) throw new Error("The photo couldn't be cropped.");
  o.fillStyle = '#ffffff';
  o.fillRect(0, 0, out.width, out.height);
  o.drawImage(turned, area.x, area.y, area.width, area.height, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error("The photo couldn't be cropped.");
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
