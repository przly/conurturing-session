-- Twin plant study (Form test + Weather test): database setup.
-- Run once in a NEW Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- Then add your researcher login (see the bottom of this file).
-- An existing project from before the Weather test: run migrations/002_weather_test.sql instead.

-- ─── Tables ───────────────────────────────────────────────────

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  participant_code text,
  test_type text not null default 'form',
  order_ab text check (order_ab in ('plant-orb', 'orb-plant')),  -- form test only
  imagined_person text,            -- form test
  condition_order text,            -- weather: e.g. 'B,A,C'
  clip_assignment text,            -- weather: clip per position, e.g. '2,1,1'
  clip3_offset_sec real,           -- weather: start of the reused clip in condition 3
  include_c boolean not null default false,
  hometown_name text,
  hometown_lat double precision,
  hometown_lon double precision,
  family_name text,
  started_at timestamptz,          -- when the participant pressed Start
  created_at timestamptz not null default now(),
  constraint sessions_test_type_check check (test_type in ('form', 'weather')),
  constraint sessions_form_order_check check (test_type <> 'form' or order_ab is not null),
  constraint sessions_weather_check check (test_type <> 'weather' or (
    condition_order ~ '^[ABC](,[ABC]){1,2}$' and clip_assignment ~ '^[12](,[12]){1,2}$'
  ))
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  round int,                       -- round / condition position 1–3 (0 = before them, e.g. calibration, intro)
  form text,                       -- 'plant' or 'orb' (form test; 'plant' in the weather test)
  condition text,                  -- 'A' / 'B' / 'C' (weather) or 'plant' / 'orb' (form)
  type text not null,              -- see README → What's logged
  t_sec real,                      -- round seconds since round start
  duration_sec real,               -- for talk events
  health real,
  meta jsonb,                      -- extra detail (e.g. {"source":"manual"})
  created_at timestamptz not null default now()
);
create index if not exists events_session_idx on public.events (session_id, round, t_sec);
create index if not exists events_session_type_idx on public.events (session_id, type);

create table if not exists public.answers (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  round int not null,              -- round / condition position, or 0 for final questions
  form text,
  condition text,
  question_id text not null,
  value text,
  created_at timestamptz not null default now()
);
create index if not exists answers_session_idx on public.answers (session_id);

-- Researchers allowed to read data (matched on login email).
create table if not exists public.researchers (
  email text primary key
);

-- ─── Access rules (RLS) ───────────────────────────────────────
-- Participants (anon) can only ADD events and answers, never read.
-- Sessions are created through start_session() below.
-- Logged-in researchers on the list can read, create and delete.

alter table public.sessions enable row level security;
alter table public.events enable row level security;
alter table public.answers enable row level security;
alter table public.researchers enable row level security;

create or replace function public.is_researcher()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.researchers where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
grant execute on function public.is_researcher() to authenticated;

drop policy if exists "participants add events" on public.events;
create policy "participants add events" on public.events
  for insert to anon, authenticated with check (true);
drop policy if exists "researchers read events" on public.events;
create policy "researchers read events" on public.events
  for select to authenticated using (public.is_researcher());
drop policy if exists "researchers delete events" on public.events;
create policy "researchers delete events" on public.events
  for delete to authenticated using (public.is_researcher());

drop policy if exists "participants add answers" on public.answers;
create policy "participants add answers" on public.answers
  for insert to anon, authenticated with check (true);
drop policy if exists "researchers read answers" on public.answers;
create policy "researchers read answers" on public.answers
  for select to authenticated using (public.is_researcher());
drop policy if exists "researchers delete answers" on public.answers;
create policy "researchers delete answers" on public.answers
  for delete to authenticated using (public.is_researcher());

drop policy if exists "researchers manage sessions" on public.sessions;
create policy "researchers manage sessions" on public.sessions
  for all to authenticated using (public.is_researcher()) with check (public.is_researcher());

-- ─── Participant start ────────────────────────────────────────
-- Called when the participant presses Start. Creates the session if the
-- researcher didn't (bare link), otherwise records the imagined person.
-- Returns the order to use. Without an order, alternates between orders.

create or replace function public.start_session(
  p_id uuid,
  p_code text default null,
  p_order text default null,
  p_imagined text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_order text;
begin
  select order_ab into v_order from public.sessions where id = p_id;
  if v_order is null then
    v_order := coalesce(
      case when p_order in ('plant-orb', 'orb-plant') then p_order end,
      case when (select count(*) from public.sessions where test_type = 'form') % 2 = 0
           then 'plant-orb' else 'orb-plant' end
    );
    insert into public.sessions (id, participant_code, order_ab, imagined_person, started_at)
    values (p_id, p_code, v_order, nullif(p_imagined, ''), now());
  else
    update public.sessions
       set imagined_person = coalesce(nullif(p_imagined, ''), imagined_person),
           started_at = coalesce(started_at, now())
     where id = p_id;
  end if;
  return v_order;
end;
$$;
grant execute on function public.start_session(uuid, text, text, text) to anon, authenticated;

-- ─── Participant: load the session's test ─────────────────────
-- Participants can't read sessions. This returns only what the page
-- needs to run the right test, or null if the id doesn't exist yet.

create or replace function public.get_session_config(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'test_type', test_type,
    'order_ab', order_ab,
    'condition_order', condition_order,
    'clip_assignment', clip_assignment,
    'clip3_offset_sec', clip3_offset_sec,
    'include_c', include_c
  )
  from public.sessions where id = p_id;
$$;
grant execute on function public.get_session_config(uuid) to anon, authenticated;

-- ─── Participant: Weather test start ──────────────────────────
-- Stores the hometown and family name when the participant presses Start.
-- Weather sessions are always created in the admin panel first.

create or replace function public.start_weather_session(
  p_id uuid,
  p_hometown_name text,
  p_hometown_lat double precision,
  p_hometown_lon double precision,
  p_family_name text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.sessions
     set hometown_name = nullif(p_hometown_name, ''),
         hometown_lat = p_hometown_lat,
         hometown_lon = p_hometown_lon,
         family_name = nullif(p_family_name, ''),
         started_at = coalesce(started_at, now())
   where id = p_id and test_type = 'weather';
  if not found then
    raise exception 'weather session % not found', p_id;
  end if;
end;
$$;
grant execute on function public.start_weather_session(uuid, text, double precision, double precision, text)
  to anon, authenticated;

-- ─── Admin: session list with status ──────────────────────────
-- security_invoker: the view uses the caller's access rules, so only
-- researchers see rows.

drop view if exists public.session_overview;
create view public.session_overview with (security_invoker = true) as
select
  s.*,
  (select max(e.round) from public.events e
    where e.session_id = s.id and e.type in ('round_start', 'condition_start')) as current_round,
  exists (select 1 from public.answers a where a.session_id = s.id and a.round = 0) as completed,
  exists (select 1 from public.events e
    where e.session_id = s.id and e.type = 'weather_fetch_failed') as weather_failed
from public.sessions s;
revoke all on public.session_overview from anon;
grant select on public.session_overview to authenticated;

-- ─── Your researcher login ────────────────────────────────────
-- 1. Dashboard → Authentication → Users → Add user → email + password
--    (tick "Auto confirm user").
-- 2. Run this with that email:
--
--   insert into public.researchers (email) values ('you@example.com');
