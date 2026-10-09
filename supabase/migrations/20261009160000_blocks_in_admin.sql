-- ============================================================================
-- Blocks in the admin panel
--
-- Reports already reach Admin → Reports (with their deadlines), the admins'
-- alerts and Scam alerts. Blocks were only counted (Customers → "Blocked
-- by"). Now:
--   - a member's timeline shows the reason given for a block, when there is one
--   - Scam alerts flag a member blocked by 3 or more members in 30 days
--     ("many_blocks")
--
-- Both functions were changed in place since they were written (admin roles,
-- 20261008220000), so the live definitions are edited here rather than
-- written out again.
-- ============================================================================

do $$
declare
  def text;
  patched text;
begin
  -- The timeline: the reason with each block
  select pg_get_functiondef('public.admin_member_timeline(uuid, integer)'::regprocedure) into def;
  patched := replace(def,
    $a$select b.created_at, 'safety', 'Blocked ' || o.name, null$a$,
    $a$select b.created_at, 'safety', 'Blocked ' || o.name, nullif(btrim(left(b.reason, 140)), '')$a$);
  patched := replace(patched,
    $a$select b.created_at, 'safety', 'Blocked by ' || o.name, null$a$,
    $a$select b.created_at, 'safety', 'Blocked by ' || o.name, nullif(btrim(left(b.reason, 140)), '')$a$);
  if patched = def or position('Blocked by '' || o.name, nullif' in patched) = 0 then
    raise exception 'admin_member_timeline: the block lines were not found';
  end if;
  execute patched;

  -- Scam alerts: blocked by several members
  select pg_get_functiondef('public.admin_risk_signals()'::regprocedure) into def;
  -- (anchored on code, not comments: the live copy has its comments stripped)
  patched := replace(def,
    $a$    banned_back as ($a$,
    $a$    blocked as (
      select b.blocked_id as user_id, 'many_blocks'::text, 2,
             'Blocked by ' || count(distinct b.blocker_id) || ' members'
               || coalesce(': "' || left((array_agg(nullif(btrim(b.reason), '') order by b.created_at desc)
                    filter (where nullif(btrim(b.reason), '') is not null))[1], 100) || '"', ''),
             max(b.created_at), count(distinct b.blocker_id)
        from public.blocks b
       where b.created_at > now() - interval '30 days'
       group by b.blocked_id
      having count(distinct b.blocker_id) >= 3),
    banned_back as ($a$);
  patched := replace(patched,
    $a$union all select * from reported union all select * from banned_back$a$,
    $a$union all select * from reported union all select * from blocked union all select * from banned_back$a$);
  if position('select * from blocked' in patched) = 0 or position('blocked as (' in patched) = 0 then
    raise exception 'admin_risk_signals: the places to add blocks were not found';
  end if;
  execute patched;
end $$;
