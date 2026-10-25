-- ============================================================================
-- scripts/backup/fingerprint.sql
-- Fingerprint of schema `public`: one "key|value" line per item, for comparing
-- a backup's SOURCE snapshot with a RESTORED copy. Read-only: SELECTs and
-- SET LOCAL only. Run with `psql -X -At` INSIDE a transaction:
--   * at backup time, inside the exported-snapshot transaction
--     (snapshot-dump.sh), so it describes exactly what pg_dump dumped;
--   * at restore time, inside a READ ONLY transaction (restore-verify.ts).
-- Lines starting "info." describe the server and are NOT compared.
-- ============================================================================

-- Text forms that must not depend on session settings.
set local timezone = 'UTC';
set local datestyle = 'ISO, YMD';
set local intervalstyle = 'postgres';
set local extra_float_digits = 1;
set local bytea_output = 'hex';

select 'info.server_version', current_setting('server_version');
select 'info.read_only', current_setting('transaction_read_only');
select 'info.at', now()::text;

select 'meta.tables', coalesce(string_agg(relname, ',' order by relname), '')
  from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p');

-- Every table: row count and an md5 over every row's text, in a fixed order.
select format($q$select %L, count(*) || ':' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.%I t$q$,
              'rows.' || relname, relname)
  from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') order by relname
\gexec

-- Structure, one line per table / object, so a difference points at its cause.
select 'columns.' || table_name,
       md5(string_agg(column_name || ':' || data_type || ':' || udt_name || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by ordinal_position))
  from information_schema.columns where table_schema = 'public' group by table_name order by table_name;
select 'constraints.' || conrelid::regclass::text,
       md5(string_agg(conname || ':' || pg_get_constraintdef(oid), ',' order by conname))
  from pg_constraint where connamespace = 'public'::regnamespace group by conrelid order by 1;
select 'indexes.' || tablename, md5(string_agg(indexname || ':' || indexdef, ',' order by indexname))
  from pg_indexes where schemaname = 'public' group by tablename order by tablename;
select 'triggers.' || tgrelid::regclass::text, md5(string_agg(tgname || ':' || pg_get_triggerdef(oid), ',' order by tgname))
  from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
 group by tgrelid order by 1;
select 'function.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       md5(pg_get_functiondef(p.oid)) || ':definer=' || p.prosecdef || ':config=' || coalesce(array_to_string(p.proconfig, ';'), '')
  from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;
select 'policy.' || tablename || '.' || policyname,
       md5(cmd || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') || ':' || permissive)
  from pg_policies where schemaname = 'public' order by 1;
select 'rls.' || relname, relrowsecurity::text || ':' || relforcerowsecurity::text
  from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') order by relname;
select 'comment.' || c.relname, md5(coalesce(obj_description(c.oid, 'pg_class'), ''))
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by c.relname;

-- Privileges, with the GRANTOR stripped: a restore re-issues grants as the
-- restoring role, so the grantor legitimately differs; grantee and rights must not.
select 'acl.table.' || relname, coalesce(regexp_replace(relacl::text, '/[^,}"]+', '', 'g'), 'default')
  from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') order by relname;
select 'acl.function.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       coalesce(regexp_replace(p.proacl::text, '/[^,}"]+', '', 'g'), 'default')
  from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;
select 'acl.schema.public', coalesce(regexp_replace(nspacl::text, '/[^,}"]+', '', 'g'), 'default')
  from pg_namespace where nspname = 'public';
-- Default privileges for objects created later in schema public (pg_dump
-- restores these; a target's own defaults must not leak into the result).
select 'acl.default.' || pg_get_userbyid(defaclrole) || '.' || defaclobjtype::text,
       coalesce(regexp_replace(defaclacl::text, '/[^,}"]+', '', 'g'), 'none')
  from pg_default_acl where defaclnamespace = 'public'::regnamespace order by 1;
