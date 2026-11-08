create schema if not exists hallownest_private;
revoke all on schema hallownest_private from public;
grant usage on schema hallownest_private to anon, authenticated;

create table public.hallownest_archive (
  id integer primary key check (id = 1),
  revision integer not null default 0,
  entries jsonb not null check (jsonb_typeof(entries) = 'array')
);
alter table public.hallownest_archive enable row level security;
revoke all on public.hallownest_archive from anon, authenticated;
grant select on public.hallownest_archive to anon, authenticated;
create policy "Visitors read the Hallownest archive"
  on public.hallownest_archive for select to anon, authenticated using (true);
insert into public.hallownest_archive (id, entries) values (1, '[]');

create table hallownest_private.editor_credentials (
  id integer primary key check (id = 1),
  digest text not null
);
alter table hallownest_private.editor_credentials enable row level security;

create function hallownest_private.write_archive(
  p_credential text, p_expected integer, p_entries jsonb
) returns integer language plpgsql security definer set search_path = ''
as $$
declare
  next_revision integer;
begin
  if p_credential is null or length(p_credential) > 160 or not exists (
    select 1 from hallownest_private.editor_credentials
    where digest = encode(sha256(convert_to(p_credential, 'UTF8')), 'hex')
  ) then
    raise exception 'Invalid editor credential' using errcode = '42501';
  end if;

  if p_entries is null then
    select revision into next_revision from public.hallownest_archive where id = 1;
    return next_revision;
  end if;

  if jsonb_typeof(p_entries) <> 'array' or octet_length(p_entries::text) > 4000000 then
    raise exception 'Invalid archive payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 1500 then
    raise exception 'Too many archive entries' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) as entry
    where jsonb_typeof(entry) <> 'object'
      or coalesce(jsonb_typeof(entry->'id'), '') <> 'string'
      or coalesce(jsonb_typeof(entry->'name'), '') <> 'string'
      or length(trim(entry->>'name')) = 0
      or coalesce(entry->>'kind', '') not in ('разумные', 'дикие', 'equipment', 'state', 'rule')
      or coalesce(jsonb_typeof(entry->'stats'), 'object') <> 'object'
  ) or exists (
    select 1 from jsonb_array_elements(p_entries) as entry
    group by entry->>'id' having count(*) > 1
  ) then
    raise exception 'Invalid archive entries' using errcode = '22023';
  end if;

  update public.hallownest_archive
  set entries = p_entries, revision = revision + 1
  where id = 1 and revision = p_expected
  returning revision into next_revision;
  if not found then
    raise sqlstate 'PT409' using message = 'Archive revision has changed';
  end if;
  return next_revision;
end;
$$;

create function public.hallownest_write_archive(
  p_credential text, p_expected integer, p_entries jsonb
) returns integer language sql security invoker set search_path = ''
as $$
  select hallownest_private.write_archive(p_credential, p_expected, p_entries);
$$;

revoke all on function hallownest_private.write_archive(text, integer, jsonb) from public;
revoke all on function public.hallownest_write_archive(text, integer, jsonb) from public;
grant execute on function hallownest_private.write_archive(text, integer, jsonb) to anon, authenticated;
grant execute on function public.hallownest_write_archive(text, integer, jsonb) to anon, authenticated;
