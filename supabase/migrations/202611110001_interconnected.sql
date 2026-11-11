begin;
create table public.ic_organizers (
  user_id uuid primary key references auth.users on delete cascade
);
create table public.ic_profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object')
);
create table public.ic_events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  day date not null,
  place text not null default '',
  luma_url text not null default '',
  partiful_url text not null default '',
  luma_id text not null default ''
);
create table public.ic_members (
  event_id uuid references public.ic_events on delete cascade,
  user_id uuid references auth.users on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending','approved','removed')),
  shared text[] not null default '{}',
  primary key (event_id,user_id),
  check (shared <@ array['name','affiliation','role','interests','looking','website','linkedin','instagram','email','phone'])
);
create table public.ic_rosters (
  event_id uuid references public.ic_events on delete cascade,
  source text check (source in ('luma','partiful')),
  guests jsonb not null check (jsonb_typeof(guests) = 'array' and jsonb_array_length(guests) <= 4000),
  updated_at timestamptz not null default now(),
  primary key(event_id,source)
);
create table public.ic_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  profile_id uuid references auth.users on delete set null,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  follow_up boolean not null default false,
  created_at timestamptz not null default now(),
  unique(id,owner_id), unique(owner_id,profile_id)
);
create table public.ic_encounters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  connection_id uuid not null,
  event_id uuid references public.ic_events on delete set null,
  event_name text not null default '', place text not null default '', note text not null default '',
  met_on date, met boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(connection_id,owner_id) references public.ic_connections(id,owner_id) on delete cascade
);
create index ic_encounters_parent on public.ic_encounters(connection_id,owner_id);
create index ic_members_by_user on public.ic_members(user_id,event_id);

-- The event lookup runs with the table owner's rights to avoid recursive member policies.
create function public.ic_host(target uuid) returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.ic_events where id=target and host_id=auth.uid());
$$;
alter table public.ic_organizers enable row level security;
alter table public.ic_profiles enable row level security;
alter table public.ic_events enable row level security;
alter table public.ic_members enable row level security;
alter table public.ic_rosters enable row level security;
alter table public.ic_connections enable row level security;
alter table public.ic_encounters enable row level security;

create policy own_organizer on public.ic_organizers for select to authenticated using (user_id=auth.uid());
create policy own_profile on public.ic_profiles to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy own_connections on public.ic_connections to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy own_encounters on public.ic_encounters to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy read_membership on public.ic_members for select to authenticated using (user_id=auth.uid() or public.ic_host(event_id));
create policy read_event on public.ic_events for select to authenticated using (host_id=auth.uid() or exists (
  select 1 from public.ic_members m where m.event_id=id and m.user_id=auth.uid() and m.status in ('pending','approved')
));
create policy create_event on public.ic_events for insert to authenticated with check (host_id=auth.uid() and exists (
  select 1 from public.ic_organizers where user_id=auth.uid()
));
create policy host_roster on public.ic_rosters to authenticated using (public.ic_host(event_id)) with check (public.ic_host(event_id));

-- The creator participates with a hidden profile until they explicitly share fields.
create function public.ic_add_host_member() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.ic_members(event_id,user_id,email,status)
    values(new.id,new.host_id,coalesce(auth.jwt()->>'email',''),'approved');
  return new;
end; $$;
revoke all on function public.ic_add_host_member() from public,anon,authenticated;
create trigger ic_event_created after insert on public.ic_events
  for each row execute function public.ic_add_host_member();

-- Requesting from a QR link never grants directory access. Only the host decides.
create function public.ic_request_access(target uuid) returns void language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.ic_members(event_id,user_id,email)
  values(target,auth.uid(),auth.jwt()->>'email') on conflict do nothing;
end; $$;
create function public.ic_set_access(target uuid, attendee uuid, decision text) returns void language plpgsql security definer
set search_path = '' as $$
begin
  if not public.ic_host(target) or decision not in ('approved','removed') then raise exception 'Access denied'; end if;
  update public.ic_members set status=decision, shared=case when decision='removed' then '{}' else shared end
    where event_id=target and user_id=attendee;
  if not found then raise exception 'Request no longer exists'; end if;
end; $$;
create function public.ic_share(target uuid, fields text[]) returns void language plpgsql security definer
set search_path = '' as $$
begin
  update public.ic_members set shared=fields where event_id=target and user_id=auth.uid() and status='approved';
  if not found then raise exception 'Event membership required'; end if;
end; $$;

create function public.ic_directory(target uuid) returns table(user_id uuid, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.ic_host(target) and not exists(select 1 from public.ic_members m
    where m.event_id=target and m.user_id=auth.uid() and m.status='approved') then
    raise exception 'Event membership required';
  end if;
  return query select m.user_id, jsonb_object_agg(f.key,f.value)
    from public.ic_members m join public.ic_profiles p using(user_id)
    cross join lateral jsonb_each_text(p.details) f
    where m.event_id=target and m.status='approved' and 'name'=any(m.shared)
      and trim(coalesce(p.details->>'name',''))<>'' and f.key=any(m.shared) and trim(f.value)<>''
    group by m.user_id;
end; $$;

-- Save both parts of quick capture in one transaction; client IDs make retry safe.
create function public.ic_capture(person uuid, info jsonb, linked uuid, meeting jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.ic_connections(id,details,profile_id) values(person,info,linked)
    on conflict (id) do nothing;
  if not exists(select 1 from public.ic_connections where id=person and owner_id=auth.uid()) then
    raise exception 'Connection unavailable';
  end if;
  if meeting is not null and meeting <> 'null'::jsonb then
    insert into public.ic_encounters(id,connection_id,event_id,event_name,place,note,met_on,met)
    values((meeting->>'id')::uuid,person,nullif(meeting->>'event_id','')::uuid,coalesce(meeting->>'event_name',''),
      coalesce(meeting->>'place',''),coalesce(meeting->>'note',''),nullif(meeting->>'met_on','')::date,
      coalesce((meeting->>'met')::boolean,false)) on conflict(id) do nothing;
  end if;
end; $$;

revoke all on public.ic_organizers,public.ic_profiles,public.ic_events,public.ic_members,public.ic_rosters,
  public.ic_connections,public.ic_encounters from public,anon,authenticated;
grant select on public.ic_organizers,public.ic_members to authenticated;
grant select,insert on public.ic_events to authenticated;
grant update (title,day,place,luma_url,partiful_url,luma_id) on public.ic_events to authenticated;
create policy edit_event on public.ic_events for update to authenticated using (host_id=auth.uid()) with check (host_id=auth.uid());
grant select,insert,update,delete on public.ic_profiles,public.ic_rosters,public.ic_connections,public.ic_encounters to authenticated;
revoke all on function public.ic_host(uuid),public.ic_request_access(uuid),public.ic_set_access(uuid,uuid,text),
 public.ic_share(uuid,text[]),public.ic_directory(uuid),public.ic_capture(uuid,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.ic_host(uuid),public.ic_request_access(uuid),public.ic_set_access(uuid,uuid,text),
 public.ic_share(uuid,text[]),public.ic_directory(uuid),public.ic_capture(uuid,jsonb,uuid,jsonb) to authenticated;
commit;
