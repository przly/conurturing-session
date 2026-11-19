-- Adds the Weather test next to the Form test.
-- For a project that already ran schema.sql: run this once in
-- Supabase → SQL Editor → New query → paste → Run. Safe to run again.
-- (A fresh project only needs schema.sql, which already includes this.)

-- ─── sessions ─────────────────────────────────────────────────

alter table public.sessions add column if not exists test_type text not null default 'form';
alter table public.sessions add column if not exists condition_order text;     -- weather: e.g. 'B,A,C'
alter table public.sessions add column if not exists clip_assignment text;     -- weather: clip per position, e.g. '2,1,1'
alter table public.sessions add column if not exists clip3_offset_sec real;    -- weather: start of the reused clip in condition 3
alter table public.sessions add column if not exists include_c boolean not null default false;
alter table public.sessions add column if not exists hometown_name text;
alter table public.sessions add column if not exists hometown_lat double precision;
alter table public.sessions add column if not exists hometown_lon double precision;
alter table public.sessions add column if not exists family_name text;

-- Weather sessions have no plant/orb order.
alter table public.sessions alter column order_ab drop not null;

alter table public.sessions drop constraint if exists sessions_test_type_check;
alter table public.sessions add constraint sessions_test_type_check
  check (test_type in ('form', 'weather'));
alter table public.sessions drop constraint if exists sessions_form_order_check;
alter table public.sessions add constraint sessions_form_order_check
  check (test_type <> 'form' or order_ab is not null);
alter table public.sessions drop constraint if exists sessions_weather_check;
alter table public.sessions add constraint sessions_weather_check
  check (test_type <> 'weather' or (
    condition_order ~ '^[ABC](,[ABC]){1,2}$' and clip_assignment ~ '^[12](,[12]){1,2}$'
  ));

-- ─── events / answers ─────────────────────────────────────────
-- condition: 'A' / 'B' / 'C' (weather) or 'plant' / 'orb' (form). Existing rows copy form.

alter table public.events add column if not exists condition text;
alter table public.answers add column if not exists condition text;
update public.events set condition = form where condition is null and form is not null;
update public.answers set condition = form where condition is null and form is not null;

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

-- ─── Form test bare links: balance only among form sessions ───

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

create index if not exists events_session_type_idx on public.events (session_id, type);
