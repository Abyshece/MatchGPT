-- ============================================================================
-- Phase 13: Sign in with Apple
--
-- The iPhone app signs people in with Apple's own sheet (and Google's). Apple
-- asks apps that offer Sign in with Apple and let people delete their account
-- to end Sign in with Apple for the app when the account is deleted (Apple's
-- "revoke tokens" call). That needs a refresh token only Apple's server hands
-- out: the apple-sign-in function exchanges the app's one-time code for it
-- and keeps it here, and delete-account revokes it. Only the server (service
-- role) reads or writes these; the token goes with the account.
-- "Download my data" says since when one is kept.
-- ============================================================================

create table public.apple_sign_in_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  refresh_token text not null check (length(refresh_token) between 1 and 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apple_sign_in_tokens enable row level security;
revoke all on public.apple_sign_in_tokens from anon, authenticated;

-- ---- "Download my data": whether Sign in with Apple has a token kept ----------------------
create or replace function public.export_my_data()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid;
  result jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'export_metadata', jsonb_build_object(
      'exported_at', now(),
      'user_id', uid,
      'format_version', '1.3',
      'app', 'MatchGPT',
      'note', 'This export contains data we hold about your account. It does not include data about other users (e.g. their messages to you are excluded; only your messages are listed).'
    ),
    'profile', (
      select to_jsonb(p) from public.profiles p where p.id = uid
    ),
    'likes_sent', (
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from public.likes l where l.liker_id = uid
    ),
    'likes_received_count', (
      -- Only count, not detail — would leak info about who likes you (others' data)
      select count(*) from public.likes where liked_id = uid
    ),
    'matches', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from public.matches m
      where m.user_a_id = uid or m.user_b_id = uid
    ),
    'messages_sent', (
      select coalesce(jsonb_agg(to_jsonb(msg)), '[]'::jsonb)
      from public.messages msg
      where msg.sender_id = uid
    ),
    'reports_filed', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from public.reports r
      where r.reporter_id = uid
    ),
    'verification_requests', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
      from public.verification_requests v
      where v.user_id = uid
    ),
    'blocks_created', (
      select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
      from public.blocks b
      where b.blocker_id = uid
    ),
    'search_history', (
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
      from public.search_history s
      where s.user_id = uid
    ),
    'consent_records', (
      select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
      from public.consent_records c
      where c.user_id = uid
    ),
    'subscriptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'sold_by', s.provider, 'plan', s.plan_id, 'status', s.status, 'test', s.mode = 'test',
          'trial_ends_at', s.trial_ends_at, 'period_start', s.current_start, 'period_end', s.current_end,
          'renews', coalesce(s.auto_renew, not s.cancel_at_period_end), 'ended_at', s.ended_at,
          'started_at', s.created_at) order by s.created_at), '[]'::jsonb)
      from public.subscriptions s
      where s.user_id = uid
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'sold_by', p.provider, 'reference', coalesce(p.store_order_id, p.razorpay_payment_id),
          'amount', p.amount, 'currency', p.currency, 'amount_unit', 'smallest currency unit (paise for INR)',
          'status', p.status, 'method', p.method, 'paid_at', p.paid_at,
          'refunded_amount', p.refunded_amount, 'refunded_at', p.refunded_at, 'invoice_url', p.invoice_url)
          order by p.paid_at), '[]'::jsonb)
      from public.payments p
      where p.user_id = uid
    ),
    -- Where notifications go: phones with the app, and browsers
    'notification_devices', jsonb_build_object(
      'phones', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'platform', d.platform, 'app_version', d.app_version,
            'added_at', d.created_at, 'last_signed_up_at', d.updated_at) order by d.created_at), '[]'::jsonb)
        from public.push_devices d
        where d.user_id = uid
      ),
      'browsers', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'browser', ps.user_agent, 'added_at', ps.created_at) order by ps.created_at), '[]'::jsonb)
        from public.push_subscriptions ps
        where ps.user_id = uid
      )
    ),
    -- Sign in with Apple: since when a token is kept to end it when the
    -- account is deleted (not the token itself)
    'sign_in_with_apple', (
      select jsonb_build_object('token_kept_since', t.created_at, 'last_updated_at', t.updated_at)
      from public.apple_sign_in_tokens t
      where t.user_id = uid
    )
  ) into result;

  return result;
end;
$function$;
