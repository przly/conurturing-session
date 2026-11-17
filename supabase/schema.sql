-- Twin plant attachment test: database setup.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Then add your researcher login (see the bottom of this file).

-- ─── Tables ───────────────────────────────────────────────────

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  participant_code text,
  order_ab text not null check (order_ab in ('plant-orb', 'orb-plant')),
  imagined_person text,
  started_at timestamptz,          -- when the participant pressed Start
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  round int,                       -- 1 or 2 (0 = before the rounds, e.g. calibration)
  form text,                       -- 'plant' or 'orb'
  type text not null,              -- round_start, talk, pulse, wither_start, wither_end, revived, round_end, health, calibration
  t_sec real,                      -- round seconds since round start
  duration_sec real,               -- for talk events
  health real,
  meta jsonb,                      -- extra detail (e.g. {"source":"manual"})
  created_at timestamptz not null default now()
);
create index if not exists events_session_idx on public.events (session_id, round, t_sec);

create table if not exists public.answers (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  round int not null,              -- 1, 2, or 0 for final questions
  form text,
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
      case when (select count(*) from public.sessions) % 2 = 0 then 'plant-orb' else 'orb-plant' end
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

-- ─── Your researcher login ────────────────────────────────────
-- 1. Dashboard → Authentication → Users → Add user → email + password
--    (tick "Auto confirm user").
-- 2. Run this with that email:
--
--   insert into public.researchers (email) values ('you@example.com');
