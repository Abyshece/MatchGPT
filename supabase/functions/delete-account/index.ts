// ============================================================================
// delete-account Edge Function
//
// GDPR right-to-erasure — completely removes a user's account.
//
// Flow:
//   1. Browser calls this function with the user's JWT in the Authorization header
//   2. Function verifies JWT and extracts auth user ID
//   3. Function uses service_role to:
//      a) Delete all photos from Storage (best-effort)
//      b) Write an audit log entry (kept for legal retention)
//      c) Delete the auth.users row → cascades to profiles, likes, matches, messages, etc.
//   4. Returns success
//
// Why an Edge Function and not a database function:
//   - Deleting an auth.users row requires service_role (admin)
//   - Service_role must never be exposed to the browser
//   - Edge Functions run server-side and can use service_role safely
//
// Deploy with: supabase functions deploy delete-account
// ============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// CORS: allowed browser origins come from the ALLOWED_ORIGINS secret.
import { withCors } from '../_shared/cors.ts';

interface DeleteRequestBody {
  reason?: string;
  confirmation?: string;  // must be the literal string "Delete" — defense in depth
}

interface DeleteResponse {
  success: boolean;
  error?: string;
  details?: {
    photos_deleted: number;
    storage_errors: number;
    audit_log_id: string;
  };
}

serve(withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // ---- Read env ----
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('[delete-account] missing env vars');
    return jsonResponse({ success: false, error: 'Server not configured' }, 500);
  }

  // ---- Verify user via JWT ----
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'Missing authorization' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');

  // Use anon-key client to verify the JWT and extract user
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser(token);

  if (userError || !user) {
    console.warn('[delete-account] invalid JWT:', userError);
    return jsonResponse({ success: false, error: 'Invalid session' }, 401);
  }

  const userId = user.id;
  const userEmail = user.email ?? 'unknown';

  // ---- Parse + validate body ----
  let body: DeleteRequestBody = {};
  try {
    body = await req.json();
  } catch {
    // ok — body is optional
  }

  if (body.confirmation !== 'Delete') {
    return jsonResponse({
      success: false,
      error: 'Confirmation phrase must be exactly "Delete"',
    }, 400);
  }

  // ---- Service-role client for admin operations ----
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- 1. Write audit log BEFORE deletion (so we have a trail even on failure) ----
  const { data: auditRow, error: auditError } = await admin
    .from('deletion_audit')
    .insert({
      deleted_user_id: userId,
      deleted_email: userEmail,
      reason: body.reason ?? null,
      requested_at: new Date().toISOString(),
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: req.headers.get('user-agent') ?? null,
    })
    .select('id')
    .single();

  if (auditError) {
    console.error('[delete-account] failed to write audit log:', auditError);
    // Don't fail the delete — audit table is for our records, the user's right to erasure
    // takes priority
  }
  const auditLogId = auditRow?.id ?? 'unknown';

  // ---- 2. Delete photos from Storage ----
  let photosDeleted = 0;
  let storageErrors = 0;

  // First, list every file in the user's folder under the photos bucket
  const { data: files, error: listError } = await admin.storage
    .from('photos')
    .list(userId, { limit: 100 });

  if (listError) {
    console.warn('[delete-account] storage list failed:', listError);
    storageErrors++;
  } else if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${f.name}`);
    const { error: removeError } = await admin.storage.from('photos').remove(paths);
    if (removeError) {
      console.warn('[delete-account] storage remove failed:', removeError);
      storageErrors++;
    } else {
      photosDeleted = paths.length;
    }
  }

  // ---- 3. Delete auth user (cascades to all related tables via FK ON DELETE CASCADE) ----
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error('[delete-account] auth.users delete failed:', deleteError);
    // Update audit log with the failure
    await admin
      .from('deletion_audit')
      .update({ completed_at: new Date().toISOString(), success: false, error_message: deleteError.message })
      .eq('id', auditLogId);
    return jsonResponse({
      success: false,
      error: `Failed to delete account: ${deleteError.message}`,
    }, 500);
  }

  // ---- 4. Mark audit log as complete ----
  await admin
    .from('deletion_audit')
    .update({ completed_at: new Date().toISOString(), success: true })
    .eq('id', auditLogId);

  console.log(`[delete-account] deleted user ${userId} (${userEmail}), ${photosDeleted} photos removed`);

  return jsonResponse({
    success: true,
    details: {
      photos_deleted: photosDeleted,
      storage_errors: storageErrors,
      audit_log_id: auditLogId,
    },
  });
}));

function jsonResponse(body: DeleteResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
