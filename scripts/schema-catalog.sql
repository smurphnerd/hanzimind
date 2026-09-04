-- Everything two databases must agree on for one to be a faithful copy of the
-- other. Run it against both and diff the output.
--
-- Two callers, deliberately the same file so they cannot drift: the
-- `migrations` job in .github/workflows/ci.yml diffs a database built by
-- `drizzle-kit push` against one built by `db:migrate`, and
-- docs/remote-setup.md section 5a is the operator's pre-cutover drift check
-- against their own production database.
--
-- Wider than what schema.ts declares today, on purpose. An earlier version
-- asked only for columns, constraints and indexes. A control that injected
-- five deliberate differences caught four: a new enum type went straight
-- through, because nothing here looked at pg_type. Everything below is
-- something drizzle can emit, so the first person to add a `pgEnum`, a serial,
-- a generated column or a trigram index is covered rather than silently
-- unprotected. Several sections are empty against today's schema; that is the
-- point of having them.

\pset pager off
\pset footer off

\echo '=== relations ==='
select relname, relkind, relpersistence
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relkind in ('r', 'p', 'v', 'm', 'f')
 order by 1;

\echo '=== columns ==='
select table_name, column_name, ordinal_position, data_type, udt_name,
       character_maximum_length, numeric_precision, numeric_scale,
       datetime_precision, is_nullable, column_default, collation_name,
       is_identity, identity_generation, is_generated, generation_expression
  from information_schema.columns
 where table_schema = 'public'
 order by table_name, column_name;

\echo '=== constraints ==='
select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid)
  from pg_constraint
 where connamespace = 'public'::regnamespace
 order by 1, 2;

\echo '=== indexes ==='
select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
 order by 1, 2;

-- Enums, domains, composites and ranges. The row type Postgres creates for
-- every table is excluded; it carries no information the column list does not.
\echo '=== types ==='
select t.typname, t.typtype,
       coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder)
                   from pg_enum e where e.enumtypid = t.oid), '') as enum_labels,
       case when t.typtype = 'd'
            then format_type(t.typbasetype, t.typtypmod) else '' end as domain_base,
       t.typnotnull, coalesce(t.typdefault, '') as domain_default
  from pg_type t
 where t.typnamespace = 'public'::regnamespace
   and t.typtype in ('e', 'd', 'c', 'r')
   and not exists (select 1 from pg_class c
                    where c.oid = t.typrelid and c.relkind in ('r', 'p', 'v', 'm'))
 order by 1;

\echo '=== sequences ==='
select sequence_name, data_type, start_value, minimum_value, maximum_value,
       increment, cycle_option
  from information_schema.sequences
 where sequence_schema = 'public'
 order by 1;

\echo '=== triggers ==='
select c.relname, t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where c.relnamespace = 'public'::regnamespace
   and not t.tgisinternal
 order by 1, 2;

\echo '=== functions ==='
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   -- pg_get_functiondef refuses aggregates and window functions.
   and p.prokind = 'f'
 order by 1, 2;

\echo '=== comments ==='
select c.relname as relation, '' as column_name,
       obj_description(c.oid, 'pg_class') as comment
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relkind in ('r', 'p', 'v', 'm')
   and obj_description(c.oid, 'pg_class') is not null
union all
select c.relname, a.attname, col_description(c.oid, a.attnum)
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
 where c.relnamespace = 'public'::regnamespace
   and col_description(c.oid, a.attnum) is not null
 order by 1, 2;

-- Not schema-scoped, but a migration that needs pg_trgm needs it everywhere the
-- schema is built, so a difference here is a real difference.
\echo '=== extensions ==='
select extname, extversion from pg_extension order by 1;
