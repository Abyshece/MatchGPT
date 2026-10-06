import React, { useState } from 'react';
import { PageHeader, Card, Button } from '../NotionUI';
import { IconUpload, IconCheck, IconChevronRight, IconChevronLeft, IconX } from '../../constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { BACK, useBackHandler } from '../../lib/nativeApp';

// Categorized photo slots — same idea as the original PhotoUpload component,
// but wired up to upload to Supabase Storage instead of using URL.createObjectURL.
const PHOTO_SLOTS = [
  { id: 'p1', category: 'The Basics', description: 'Front-Face Selfie',  tip: 'Good lighting, natural smile.' },
  { id: 'p2', category: 'Lifestyle',  description: 'Adventurous Photo',  tip: 'Hiking, traveling, doing something active.' },
  { id: 'p3', category: 'Empathy',    description: 'With an Animal',     tip: 'Shows kindness — pet or friendly encounter.' },
  { id: 'p4', category: 'Style',      description: 'Best Outfit',         tip: 'Full body. Wear something you feel good in.' },
  { id: 'p5', category: 'Social',     description: 'With Friends',        tip: 'You should be easy to identify in the photo.' },
  { id: 'p6', category: 'Career',     description: 'Work Context',        tip: 'Workplace, on site, or professional attire.' },
];

interface UploadedPhoto {
  slotId: string;
  storagePath: string;  // path inside the photos bucket
  publicUrl: string;
  previewUrl: string;
}

interface StepPhotosProps {
  onComplete: () => void;
  onBack: () => void;
}

const StepPhotos: React.FC<StepPhotosProps> = ({ onComplete, onBack }) => {
  const { session, refreshProfile } = useAuth();
  const [photos, setPhotos] = useState<Record<string, UploadedPhoto>>({});
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const uploadedCount = Object.keys(photos).length;
  const minRequired = 4;
  const canContinue = uploadedCount >= minRequired;

  // Android back button: back to step 1
  useBackHandler(BACK.PAGE, () => { onBack(); return true; });

  const handleFileChange = async (slotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!session?.user.id) { setError('Not signed in.'); return; }

    if (file.size > 8 * 1024 * 1024) {
      setError('Photo must be under 8MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('That doesn\'t look like an image file.');
      return;
    }

    setError(null);
    setUploadingSlot(slotId);

    // Storage path: <user_id>/<slotId>_<timestamp>.<ext>
    // Folder = user id so RLS policy lets the user write here.
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${session.user.id}/${slotId}_${Date.now()}.${ext}`;

    // If this slot was already uploaded, delete the old file first
    const previous = photos[slotId];
    if (previous) {
      await supabase.storage.from('photos').remove([previous.storagePath]);
    }

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(path, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      setUploadingSlot(null);
      return;
    }

    const { data: urlData } = supabase.storage.from('photos').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    setPhotos(prev => ({
      ...prev,
      [slotId]: {
        slotId,
        storagePath: path,
        publicUrl,
        previewUrl: URL.createObjectURL(file),
      },
    }));
    setUploadingSlot(null);

    // reset the input so re-selecting the same file fires onChange again
    e.target.value = '';
  };

  const handleRemove = async (slotId: string) => {
    const photo = photos[slotId];
    if (!photo) return;
    await supabase.storage.from('photos').remove([photo.storagePath]);
    setPhotos(prev => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  };

  const handleContinue = async () => {
    if (!session?.user.id) { setError('Not signed in.'); return; }
    if (!canContinue) return;

    // Save the public URLs in profile order. The first slot (selfie) goes first.
    const orderedUrls = PHOTO_SLOTS
      .map(s => photos[s.id]?.publicUrl)
      .filter((u): u is string => Boolean(u));

    setIsSaving(true);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ photo_urls: orderedUrls })
      .eq('id', session.user.id);
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refreshProfile();
    onComplete();
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#191919] animate-fade-in">
      <div className="flex-none flex items-center p-4 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-[#191919] z-20">
        <button
          onClick={onBack}
          className="mr-3 p-2 -ml-2 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          title="Back"
        >
          <IconChevronLeft />
        </button>
        <div className="font-bold text-gray-700 dark:text-gray-100 text-lg">Shaadi24</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto py-6 px-4 h-full flex flex-col">
          <div className="flex-none mb-4">
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Step 2 of 3</div>
            <PageHeader title="Add your photos" />
            <div className="text-gray-600 dark:text-gray-300 text-sm -mt-6">
              Upload at least <strong>{minRequired} photos</strong>. Each slot has a category to help your matches see different sides of you.
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
                          onClick={() => handleRemove(slot.id)}
                          className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 text-white rounded"
                          title="Remove"
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
              {uploadedCount}/{PHOTO_SLOTS.length} uploaded
              {!canContinue && <span className="ml-2 text-amber-600 dark:text-amber-400">— need {minRequired - uploadedCount} more</span>}
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
