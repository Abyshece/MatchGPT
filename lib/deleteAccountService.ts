// ============================================================================
// deleteAccountService
//
// Wraps the delete-account Edge Function call. Returns success/error and
// handles signing the user out locally on success.
//
// This is exposed as a standalone module rather than added to profileService
// because the call flow is meaningfully different (Edge Function vs DB query).
// ============================================================================

import { supabase } from './supabase';

export interface DeleteAccountInput {
  reason?: string;       // optional user-provided reason
  confirmation: string;  // must equal 'Delete' — guard against accidental calls
}

export interface DeleteAccountResult {
  success: boolean;
  error: string | null;
  photosDeleted?: number;
  appStoreRenews?: boolean;  // an App Store subscription renews until the person cancels it
}

/**
 * Permanently delete the current user's account.
 *
 * Calls the `delete-account` Supabase Edge Function, which uses service_role to
 * remove the auth.users row (cascades to all data via FK) and clean up Storage.
 *
 * On success, signs the user out locally — they should be redirected to the
 * landing/auth screen by the AuthContext session-change handler.
 */
export async function deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResult> {
  if (input.confirmation !== 'Delete') {
    return {
      success: false,
      error: 'Confirmation phrase must be exactly "Delete"',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: {
        reason: input.reason ?? null,
        confirmation: 'Delete',
      },
    });

    if (error) {
      // Network or function-level error
      console.error('[deleteAccount] function invocation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete account. Please try again.',
      };
    }

    // The function returns {success, error?, details?}
    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Server reported failure but no error message.',
      };
    }

    // Sign out locally to clear the session before AuthContext figures out
    // the user no longer exists on the server
    await supabase.auth.signOut();

    return {
      success: true,
      error: null,
      photosDeleted: data?.details?.photos_deleted ?? 0,
      appStoreRenews: !!data?.details?.app_store_renews,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[deleteAccount] threw:', msg);
    return {
      success: false,
      error: msg,
    };
  }
}
