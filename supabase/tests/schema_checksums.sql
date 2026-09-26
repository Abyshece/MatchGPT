with objs as (
  select 'columns' as kind, c.relname as name,
         string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || a.attnotnull, ',' order by a.attnum) as def
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v')
  group by c.relname
  union all
  select 'constraints', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'indexes', indexrelid::regclass::text, pg_get_indexdef(indexrelid)
  from pg_index i join pg_class c on c.oid = i.indrelid where c.relnamespace = 'public'::regnamespace
  union all
  select 'functions', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(p.prosrc) || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' || p.provolatile::text || '|' || pg_get_function_result(p.oid) || '|' || l.lanname
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'function_acl', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         coalesce((select string_agg(g, ',' order by g)
                   from (select case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || '=' || x.privilege_type as g
                         from aclexplode(p.proacl) x
                         where x.grantee = 0 or pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role')) s), 'default')
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'triggers', tgrelid::regclass::text || '.' || tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  where not t.tgisinternal and (t.tgrelid::regclass::text like 'public.%' or t.tgfoid in (select oid from pg_proc where pronamespace = 'public'::regnamespace))
  union all
  select 'views', c.relname, pg_get_viewdef(c.oid)
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  union all
  select 'policies', schemaname || '.' || tablename || '.' || policyname,
         permissive || '|' || roles::text || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname in ('public','storage')
  union all
  select 'rls', relname, relrowsecurity::text || '/' || relforcerowsecurity::text
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
  union all
  select 'table_grants', table_name, string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type)
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon','authenticated','service_role') and privilege_type <> 'MAINTAIN'
  group by table_name
  union all
  select 'realtime', schemaname || '.' || tablename, pubname
  from pg_publication_tables where pubname = 'supabase_realtime'
  union all
  select 'buckets', id, name || '|' || public::text from storage.buckets
)
select kind, count(*) as n, md5(string_agg(name || '=' || md5(def), ';' order by name)) as checksum
from objs group by kind order by kind;
