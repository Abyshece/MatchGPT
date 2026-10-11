import React, { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { CROP_ASPECT, cropToFile, prepareForCrop, prepareFromUrl, type CropArea, type Prepared } from '../lib/photoCrop';
import { useBackHandler } from '../lib/nativeApp';
import { IconX } from '../constants';

// ============================================================================
// PhotoCropper: frame each photo before it's uploaded, one after the other
// when several were picked ("Photo 2 of 4"). Drag to move, pinch, scroll or
// the slider to zoom, Rotate for a sideways photo. The frame is 3:4, as the
// cards show photos. Skip leaves a photo out; Cancel leaves them all out.
// onDone gets the framed photos in order (lib/photoCrop.ts).
// ============================================================================

export type CropSource = { file: File } | { url: string };

interface Props {
  sources: CropSource[];
  onDone: (files: File[]) => void;
  onCancel: () => void;
}

const PhotoCropper: React.FC<Props> = ({ sources, onDone, onCancel }) => {
  const [index, setIndex] = useState(0);
  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [failed, setFailed] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<CropArea | null>(null);
  const [done, setDone] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const source = sources[index];
  const many = sources.length > 1;
  const last = index === sources.length - 1;

  // The photo on screen: a smaller copy, made when it's its turn
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    setPhoto(null);
    setFailed(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setArea(null);
    void ('file' in source ? prepareForCrop(source.file) : prepareFromUrl(source.url)).then((p) => {
      url = p?.url ?? null;
      if (!live) { if (url) URL.revokeObjectURL(url); return; }
      if (!p) setFailed(true);
      else setPhoto(p);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);

  // Android's back button: as Cancel
  useBackHandler(30, () => { if (!busy) onCancel(); return true; });

  const onCropComplete = useCallback((_: unknown, pixels: CropArea) => setArea(pixels), []);

  const next = (files: File[]) => {
    if (last) onDone(files);
    else {
      setDone(files);
      setIndex(index + 1);
    }
  };

  const use = async () => {
    if (!photo || !area) return;
    setBusy(true);
    try {
      const file = await cropToFile(photo.url, area, rotation, photo.name);
      next([...done, file]);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  // A photo this phone can't open: sent as it is, or left out
  const useAsItIs = () => next('file' in source ? [...done, source.file] : done);
  const skip = () => next(done);

  const unreadable = failed || (photo !== null && !photo.readable);

  return (
    <div className="fixed inset-0 z-[450] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 animate-fade-in" data-testid="photo-cropper">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-cropper-title"
        className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
          <div>
            <h3 id="photo-cropper-title" className="text-base font-bold text-gray-900 dark:text-white">Adjust your photo</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="photo-cropper-count">
              {many ? `Photo ${index + 1} of ${sources.length} · ` : ''}Drag to move, pinch or slide to zoom
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Cancel" data-testid="photo-cropper-cancel"
            className="-mr-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-40">
            <IconX />
          </button>
        </div>

        <div className="relative w-full h-[55vh] max-h-[520px] min-h-[300px] bg-zinc-950">
          {unreadable ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-200" data-testid="photo-cropper-unreadable">
              This photo can't be adjusted on this phone. You can send it as it is, or leave it out.
            </div>
          ) : photo ? (
            <Cropper
              image={photo.url}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={CROP_ASPECT}
              minZoom={1}
              maxZoom={4}
              showGrid
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {!unreadable && (
          <div className="flex items-center gap-3 px-4 pt-3">
            <label htmlFor="photo-cropper-zoom" className="text-xs font-semibold text-gray-600 dark:text-gray-300">Zoom</label>
            <input
              id="photo-cropper-zoom"
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              data-testid="photo-cropper-zoom"
              className="flex-1 accent-black dark:accent-white"
            />
            <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} disabled={!photo}
              data-testid="photo-cropper-rotate" aria-label="Rotate a quarter turn"
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40">
              Rotate
            </button>
          </div>
        )}

        <div className="flex gap-2 p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
          {many && (
            <button type="button" onClick={skip} disabled={busy} data-testid="photo-cropper-skip"
              className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40">
              Leave out
            </button>
          )}
          {unreadable ? (
            'file' in source && (
              <button type="button" onClick={useAsItIs} disabled={busy} data-testid="photo-cropper-as-is"
                className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-black dark:bg-white text-white dark:text-black hover:opacity-90 disabled:opacity-40">
                {last ? 'Send as it is' : 'Send as it is, next'}
              </button>
            )
          ) : (
            <button type="button" onClick={use} disabled={!photo || !area || busy} data-testid="photo-cropper-use"
              className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-black dark:bg-white text-white dark:text-black hover:opacity-90 disabled:opacity-40">
              {busy ? 'One moment…' : last ? (many ? 'Use these photos' : 'Use photo') : 'Next photo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotoCropper;
