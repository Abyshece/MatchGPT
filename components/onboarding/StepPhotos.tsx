import React, { useRef, useState } from 'react';
import { PageHeader, Card, Button } from '../NotionUI';
import { IconUpload, IconCheck, IconChevronRight, IconChevronLeft, IconX } from '../../constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { BACK, useBackHandler } from '../../lib/nativeApp';
import { deletePhotoFile, uploadPhoto } from '../../lib/photoService';

// ============================================================================
// Step 3 of sign-up: photos. One clear photo of the face is enough to start;
// the other slots suggest what families like to see (a full-length photo, one
// in traditional clothes…), and more can be added later in My Profile (up to
// 12). Each photo is saved as soon as it's uploaded, so nothing is lost if
// the app closes.
// ============================================================================

const PHOTO_SLOTS = [
  { id: 'p1', category: 'Main photo',  description: 'Clear face photo',       tip: 'Facing the camera, in good light. No sunglasses.' },
  { id: 'p2', category: 'Full length', description: 'Full-length photo',      tip: 'Standing, head to toe.' },
  { id: 'p3', category: 'Traditional', description: 'Traditional or festive', tip: 'At a festival or a wedding, in traditional clothes.' },
  { id: 'p4', category: 'Everyday',    description: 'Everyday you',           tip: 'A relaxed, natural photo.' },
  { id: 'p5', category: 'Career',      description: 'At work or study',       tip: 'At work, on campus, or in work clothes.' },
  { id: 'p6', category: 'Interests',   description: 'Doing what you love',    tip: 'A hobby, a sport or a trip.' },
];
const MIN_PHOTOS = 1;

interface UploadedPhoto {
  slotId: string;
  publicUrl: string;
  previewUrl: string;
}

interface StepPhotosProps {
  onComplete: () => void;
  onBack: () => void;
}

const StepPhotos: React.FC<StepPhotosProps> = ({ onComplete, onBack }) => {
  const { session, profileRow, refreshProfile } = useAuth();
  const saved = profileRow?.photo_urls ?? [];
  // Photos already saved (coming back to this step) fill the slots in order;
  // any beyond the six (added in My Profile) are kept as they are
  const [photos, setPhotos] = useState<Record<string, UploadedPhoto>>(() => Object.fromEntries(
    saved.slice(0, PHOTO_SLOTS.length).map((url, i) => [PHOTO_SLOTS[i].id, {
      slotId: PHOTO_SLOTS[i].id, publicUrl: url, previewUrl: url,
    }]),
  ));
  const extraUrls = useRef(saved.slice(PHOTO_SLOTS.length));
  const latest = useRef(photos);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const uploadedCount = Object.keys(photos).length;
  const canContinue = uploadedCount >= MIN_PHOTOS && !uploadingSlot;
  const forSomeoneElse = (profileRow?.profile_created_for ?? 'Myself') !== 'Myself';

  // Android back button: back to step 2
  useBackHandler(BACK.PAGE, () => { if (!isSaving) onBack(); return true; });

  // The profile's photos, in slot order (the face photo first)
  const save = async (next: Record<string, UploadedPhoto>) => {
    if (!session?.user.id) return 'Not signed in.';
    const urls = [
      ...PHOTO_SLOTS.map((s) => next[s.id]?.publicUrl).filter((u): u is string => Boolean(u)),
      ...extraUrls.current,
    ];
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ photo_urls: urls })
      .eq('id', session.user.id);
    return updateError?.message ?? null;
  };

  const change = async (next: Record<string, UploadedPhoto>) => {
    latest.current = next;
    setPhotos(next);
    const saveError = await save(next);
    if (saveError) setError(saveError);
    return !saveError;
  };

  const handleFileChange = async (slotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // reset the input so choosing the same file again fires onChange again
    input.value = '';
    if (!file) return;
    if (!session?.user.id) { setError('Not signed in.'); return; }

    setError(null);
    setUploadingSlot(slotId);
    // Stored as <user id>/<slot>_<time>.<ext>: the folder named for the user
    // is what lets them write there
    const upload = await uploadPhoto(session.user.id, file, slotId);
    if (upload.error || !upload.url) {
      setError(upload.error ?? 'The photo could not be uploaded.');
      setUploadingSlot(null);
      return;
    }

    const previous = latest.current[slotId];
    const saveOk = await change({
      ...latest.current,
      [slotId]: { slotId, publicUrl: upload.url, previewUrl: URL.createObjectURL(file) },
    });
    setUploadingSlot(null);
    // The photo it replaced, once the profile no longer points at it
    if (saveOk && previous) await deletePhotoFile(previous.publicUrl);
  };

  const handleRemove = async (slotId: string) => {
    const photo = latest.current[slotId];
    if (!photo) return;
    setError(null);
    const next = { ...latest.current };
    delete next[slotId];
    const saveOk = await change(next);
    if (saveOk) await deletePhotoFile(photo.publicUrl);
  };

  const handleContinue = async () => {
    if (!canContinue) return;
    setIsSaving(true);
    const saveError = await save(latest.current);
    if (saveError) {
      setIsSaving(false);
      setError(saveError);
      return;
    }
    await refreshProfile();
    setIsSaving(false);
    onComplete();
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#191919] animate-fade-in">
      <div className="flex-none flex items-center p-4 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-[#191919] z-20">
        <button
          type="button"
          onClick={onBack}
          className="mr-3 p-2 -ml-2 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          title="Back"
          aria-label="Back"
        >
          <IconChevronLeft />
        </button>
        <div className="font-bold text-gray-700 dark:text-gray-100 text-lg">Shaadi24</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto py-6 px-4 h-full flex flex-col">
          <div className="flex-none mb-4">
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Step 3 of 3</div>
            <PageHeader title={forSomeoneElse ? 'Add their photos' : 'Add your photos'} />
            <div className="text-gray-600 dark:text-gray-300 text-sm -mt-6">
              One clear photo of {forSomeoneElse ? 'their' : 'your'} face is enough to start.
              More help families get to know {forSomeoneElse ? 'them' : 'you'}: add them now or later in My Profile.
              {' '}Only {forSomeoneElse ? 'them' : 'you'} in each photo, please.
            </div>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 flex-1 min-h-0">
            {PHOTO_SLOTS.map(slot => {
              const photo = photos[slot.id];
              const isUploading = uploadingSlot === slot.id;
              return (
                <Card key={slot.id} className="p-3 flex flex-col h-full relative overflow-hidden group">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wide truncate max-w-[80%]">
                      {slot.category}
                    </span>
                    {photo && <div className="text-green-500 transform scale-75"><IconCheck /></div>}
                  </div>

                  <h3 className="font-semibold text-xs text-gray-800 dark:text-gray-100 mb-0.5 truncate">{slot.description}</h3>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 flex-grow leading-tight line-clamp-2">{slot.tip}</p>

                  <div className="aspect-square bg-gray-50 dark:bg-zinc-800 border border-dashed border-gray-300 dark:border-zinc-700 rounded-md relative flex items-center justify-center overflow-hidden hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors">
                    {photo ? (
                      <>
                        <img src={photo.previewUrl} alt={slot.description} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemove(slot.id)}
                          className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 text-white rounded"
                          title="Remove"
                          aria-label={`Remove ${slot.description.toLowerCase()}`}
                        >
                          <div className="transform scale-75"><IconX /></div>
                        </button>
                      </>
                    ) : isUploading ? (
                      <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-black dark:border-zinc-600 dark:border-t-white rounded-full animate-spin" />
                        <span className="text-[10px] uppercase font-bold">Uploading…</span>
                      </div>
                    ) : (
                      <div className="text-center p-2">
                        <div className="mx-auto w-6 h-6 mb-1 text-gray-300 dark:text-gray-600"><IconUpload /></div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">Upload</span>
                      </div>
                    )}

                    {!photo && !isUploading && (
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        aria-label={`Upload ${slot.description.toLowerCase()}`}
                        disabled={!!uploadingSlot}
                        onChange={(e) => handleFileChange(slot.id, e)}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-zinc-800 flex justify-between items-center gap-4 flex-none pb-6">
            <div className="min-w-0 text-sm text-gray-500 dark:text-gray-400">
              {uploadedCount}/{PHOTO_SLOTS.length} added
              {uploadedCount < MIN_PHOTOS && <span className="ml-2 text-amber-600 dark:text-amber-400">— add a face photo to continue</span>}
            </div>
            <Button onClick={handleContinue} disabled={!canContinue || isSaving} className="flex-none h-11 px-6 text-sm font-bold shadow-md">
              {isSaving ? 'Saving…' : 'Continue'} <IconChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepPhotos;
