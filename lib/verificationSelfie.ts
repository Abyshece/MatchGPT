// ============================================================================
// The selfie for the Verified badge (supabase/migrations/…_trust_and_support.sql)
//
// The member takes a selfie doing a gesture the server picks for them
// (verification_pose(): the same all day, so it can't be chosen to suit an old
// photo). It goes into the private bucket verification-selfies, in a folder
// named after the member: only they and the team who check verifications can
// open it, and the admin panel removes it once the request is decided.
// ============================================================================

import { supabase } from './supabase';

const BUCKET = 'verification-selfies';

export type Pose =
  | 'thumbs_up' | 'peace' | 'hand_on_head' | 'touch_ear' | 'hand_on_cheek' | 'three_fingers' | 'open_palm' | 'point_up';

/** The gestures, as verification_pose_for() picks them */
export const POSES: Record<Pose, { label: string; how: string }> = {
  thumbs_up: { label: 'Thumbs up', how: 'Hold a thumbs up next to your face.' },
  peace: { label: 'Two fingers up', how: 'Hold up two fingers next to your face.' },
  hand_on_head: { label: 'Hand on your head', how: 'Put one hand flat on top of your head.' },
  touch_ear: { label: 'Touch your ear', how: 'Touch one ear with a finger.' },
  hand_on_cheek: { label: 'Hand on your cheek', how: 'Rest one hand on your cheek.' },
  three_fingers: { label: 'Three fingers up', how: 'Hold up three fingers next to your face.' },
  open_palm: { label: 'Open hand', how: 'Hold up an open hand, palm to the camera, next to your face.' },
  point_up: { label: 'Point up', how: 'Point one finger up, next to your face.' },
};

export const poseLabel = (pose: string | null | undefined): string =>
  (pose && POSES[pose as Pose]?.label) || 'No gesture';

export type VerificationReason =
  | 'selfie_unclear' | 'selfie_mismatch' | 'pose_missing' | 'photos_unclear' | 'need_two_photos'
  | 'links_not_yours' | 'need_selfie' | 'other';

/**
 * Why a request wasn't approved: what the team picks (label) and what the
 * member reads, with what to do (verification_reason_text() in the database
 * has the first sentence, for the notification).
 */
export const VERIFICATION_REASONS: Record<VerificationReason, { label: string; member: string }> = {
  selfie_unclear: {
    label: 'Face not clear in the selfie',
    member: "We couldn't see your face clearly in the selfie. Take it again in good light, facing the camera, without sunglasses or a mask.",
  },
  selfie_mismatch: {
    label: "Selfie doesn't match the profile photos",
    member: "The selfie doesn't look like the person in your profile photos. Your photos need to be of you; change them if they aren't, then try again.",
  },
  pose_missing: {
    label: "Gesture not done",
    member: "The selfie didn't show the gesture we asked for. Take it again, doing the gesture shown.",
  },
  photos_unclear: {
    label: "Profile photos don't show their face",
    member: "Your profile photos don't show your face clearly. Add two clear photos of yourself, then try again.",
  },
  need_two_photos: {
    label: 'Fewer than two photos of them',
    member: 'The Verified badge needs two photos of you on your profile. Add another, then try again.',
  },
  links_not_yours: {
    label: "Social links don't look like theirs",
    member: "The social media links didn't look like yours. Remove them or add your own, then try again.",
  },
  need_selfie: {
    label: 'No selfie (asked before selfies)',
    member: 'Verification needs a selfie now. Take one, doing the gesture shown.',
  },
  other: {
    label: 'Something else (write a note)',
    member: "Something didn't check out. Our team's note says what.",
  },
};

export const reasonText = (code: string | null | undefined): string =>
  (code && VERIFICATION_REASONS[code as VerificationReason]?.member) || VERIFICATION_REASONS.other.member;

/** Today's gesture for the signed-in member */
export async function fetchPose(): Promise<Pose | null> {
  const { data, error } = await supabase.rpc('verification_pose');
  if (error || typeof data !== 'string') return null;
  return data as Pose;
}

// A phone photo can be 5–10 MB: made smaller (1280 pixels at most) as a JPEG
// before it's sent. If the browser can't, it goes as it is.
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Sends the selfie; returns where it is in the bucket */
export async function uploadSelfie(userId: string, file: File): Promise<{ path: string | null; error: string | null }> {
  if (!file.type.startsWith('image/')) return { path: null, error: "That isn't a photo." };
  const blob = await shrink(file);
  if (blob.size > 8 * 1024 * 1024) return { path: null, error: 'That photo is too big. Please take it again.' };
  const type = blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg';
  const path = `${userId}/selfie_${Date.now()}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: false, contentType: type });
  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/** A link to look at a selfie for 10 minutes (the member's own, or the team's) */
export async function selfieUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

/** Removes a selfie (best effort) */
export async function removeSelfie(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).then(() => undefined, () => undefined);
}
