// ============================================================================
// photoService
//
// Helpers for uploading/replacing/removing photos.
//
// Storage layout (Phase 1):
//   bucket: photos
//   path:   <user_id>/<slot>_<timestamp>.<ext>
//
// The user's photo_urls array on profiles holds the public URLs, in order.
// We store URLs (not paths) because that's what the UI renders directly.
// ============================================================================

import { supabase } from './supabase';

const BUCKET = 'photos';

// Strip a public URL down to its storage path (the part after `<bucket>/`).
// Used when we need to delete the underlying file from Storage.
function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

// ----------------------------------------------------------------------------
// Upload a new photo file. Returns its public URL.
// ----------------------------------------------------------------------------

export async function uploadPhoto(
  userId: string,
  file: File,
  slot = 'p'
): Promise<{ url: string | null; error: string | null }> {
  if (file.size > 8 * 1024 * 1024) {
    return { url: null, error: 'Photo must be under 8MB.' };
  }
  if (!file.type.startsWith('image/')) {
    return { url: null, error: 'That file is not an image.' };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/${slot}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

// ----------------------------------------------------------------------------
// Delete a photo's file from Storage, once the profile no longer points at it
// (best effort, like the deletes below)
// ----------------------------------------------------------------------------

export async function deletePhotoFile(url: string): Promise<void> {
  const path = pathFromPublicUrl(url);
  if (path) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
  }
}

// ----------------------------------------------------------------------------
// Replace an existing photo: upload new file, then delete the old one + update profile
// ----------------------------------------------------------------------------

export async function replacePhoto(
  userId: string,
  oldUrl: string,
  newFile: File,
  currentUrls: string[],
  slot = 'p'
): Promise<{ urls: string[] | null; error: string | null }> {
  const upload = await uploadPhoto(userId, newFile, slot);
  if (upload.error || !upload.url) {
    return { urls: null, error: upload.error };
  }

  // Replace in the array, preserving order
  const idx = currentUrls.indexOf(oldUrl);
  const newUrls = [...currentUrls];
  if (idx >= 0) {
    newUrls[idx] = upload.url;
  } else {
    newUrls.push(upload.url);
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ photo_urls: newUrls })
    .eq('id', userId);

  if (updateError) {
    return { urls: null, error: updateError.message };
  }

  // Best-effort delete of old file (don't fail the operation if this errors)
  const oldPath = pathFromPublicUrl(oldUrl);
  if (oldPath) {
    await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
  }

  return { urls: newUrls, error: null };
}

// ----------------------------------------------------------------------------
// Add a photo to the user's collection (appends to the end)
// ----------------------------------------------------------------------------

export async function addPhoto(
  userId: string,
  file: File,
  currentUrls: string[],
  slot = 'p'
): Promise<{ urls: string[] | null; error: string | null }> {
  const upload = await uploadPhoto(userId, file, slot);
  if (upload.error || !upload.url) {
    return { urls: null, error: upload.error };
  }

  const newUrls = [...currentUrls, upload.url];

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ photo_urls: newUrls })
    .eq('id', userId);

  if (updateError) {
    return { urls: null, error: updateError.message };
  }
  return { urls: newUrls, error: null };
}

// ----------------------------------------------------------------------------
// Remove a photo
// ----------------------------------------------------------------------------

export async function removePhoto(
  userId: string,
  url: string,
  currentUrls: string[]
): Promise<{ urls: string[] | null; error: string | null }> {
  const newUrls = currentUrls.filter((u) => u !== url);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ photo_urls: newUrls })
    .eq('id', userId);

  if (updateError) {
    return { urls: null, error: updateError.message };
  }

  // Best-effort delete of the file
  const path = pathFromPublicUrl(url);
  if (path) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
  }
  return { urls: newUrls, error: null };
}

// ----------------------------------------------------------------------------
// Reorder photos
// ----------------------------------------------------------------------------

export async function reorderPhotos(
  userId: string,
  newUrls: string[]
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ photo_urls: newUrls })
    .eq('id', userId);

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}
