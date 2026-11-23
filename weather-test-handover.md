# Weather test: handover for the remaining steps

## Presence preview recording

Open `?test=presence` to view the recorded movement sequence. Both viewings use `public/videos/movement_v1.mp4` and its matching cue track from time zero. The second viewing hides the backdrop. The 52.6-second recording plays at its original speed with the final empty frame held to complete one minute.

Written 2026-11-19. This repo runs two studies on one Vite + React + TypeScript + Three.js + Supabase app:

- **Form test** (plant vs orb, live since 2026-11-17): **must keep working exactly as it does now.**
- **Weather test** (new, half built): *Do people feel more connected to home when a presence-sensing plant also shows the weather in their hometown?*

Read the whole file before changing anything. The original brief is quoted at the end ([Original brief](#original-brief-weather-test)); this file says what is already built, what is left, and the decisions made along the way.

---

## 1. Where things stand

Step numbers follow the brief's build order.

| # | Step | Status |
|---|---|---|
| 1 | Inspect, plan | ✅ |
| 2 | Refactor shared code (Form test unchanged) | ✅ committed `ebfc864`, deployed |
| 3 | `test_type` on sessions, router, admin test selection | ✅ committed `ebfc864`, deployed |
| 4 | Weather flow skeleton, start screen, hometown lookup | ✅ **not committed** |
| – | Weather debug dashboard + weather look (user's extra request) | ✅ **not committed** |
| **5** | **Presence layer** | ❌ **skipped on purpose for now, still required** |
| 6 | Weather layer (live data, mapping, scripted changes, fallback) | ✅ **not committed** |
| 7 | Intro clip, comprehension check, surveys | ⏳ partly: placeholder video exists, screens are placeholders |
| 8 | Logging, export, admin options | ⏳ partly |
| 9 | README and deploy | ❌ |

**Uncommitted work at hand-over:** steps 4, 6, the debug dashboard, `public/videos/intro.mp4`, `scripts/`. Ask the user before committing. They commit straight to `main`; **a push to `main` deploys to Vercel automatically.**

**Database:** `supabase/migrations/002_weather_test.sql` **has already been run on the live Supabase** (2026-11-19). Don't ask the user to run it again. Any further schema change needs a new file `supabase/migrations/003_….sql` (idempotent: `if not exists`, `create or replace`), the same change folded into `supabase/schema.sql`, and the user must run it in Supabase → SQL Editor **before** the code that needs it is deployed. You cannot run SQL on their project yourself. Show them the SQL inline; copying to their clipboard from a sandbox doesn't work.

---

## 2. Ground rules

1. **Do not change Form test behaviour.** That covers its screens, wording, timings, events, answers and visuals. After any change to shared code, run the regression check in [Testing](#7-testing).
2. **Shared scene code must stay neutral.** `src/shared/scene/*` is used by both tests. New behaviour there must be opt-in (optional field or option with a default that reproduces today's output exactly). The weather layer is the model: it only exists when `getWeather` is passed to `TwinCanvas`, which the Form test never does.
3. **All timings and visual parameters go in one config object**: `WEATHER_CONFIG` in `src/config.ts` (the Form test uses `ROUND_CONFIG` there, plus `LOOK` in `expression.ts`).
4. **Participant-facing wording lives in `src/tests/weather/text.ts`.** Question `id`s are stored in `answers.question_id` and must not change once data collection starts.
5. **Free tiers only** (Vercel Hobby + Supabase free). No new paid services, no API keys. Open-Meteo needs no key.
6. **No mic, no camera, no interaction during conditions** in the Weather test. Never request mic permission in it.
7. **Weather changes only colour and texture, never movement or posture.** Also don't make the plant look grey and dim for bad weather: desaturation and dimming are how the Form test shows an *unhealthy* plant, so strong values read as "wilting". The current tuning keeps plant saturation ≥ 0.75 and brightness near 1, and lets the room (background, haze, particles) carry the weather. Keep it that way.
8. Keep files small and commented like the existing code. UI components come from `src/components/ui` (Base UI + Tailwind, shadcn-style). Don't edit those.

---

## 3. Code map

```
src/App.tsx                       router (see below)
src/config.ts                     ROUND_CONFIG (form), WEATHER_CONFIG (weather), URL_PARAMS, shared types
src/AdminApp.tsx                  researcher panel (?admin=1), both tests

src/shared/
  scene/TwinScene.ts              Three.js scene; optional weather layer (options.getWeather)
  scene/expression.ts             shared Expression (openness, pulse, lean, voice, idle) + LOOK + applyGlow
  scene/forms.ts                  plant + orb geometry/animation (reads Expression only)
  scene/state.ts                  TwinState {health, pulse, listening, voice}
  scene/weather.ts                WeatherLayer: tint/saturation/brightness, background, haze, flicker, particles
  components/                     Screen, TwinCanvas, LikertSurvey (generic), DoneScreen (generic)
  data/logger.ts                  queued Supabase writer (localStorage-backed); { local: true } = save nothing
  data/live.ts                    Realtime broadcast: participant status → admin, admin commands → participant
  data/session.ts                 loadSessionConfig() → get_session_config RPC
  data/export.ts                  fetch + CSV/JSON download; takes a test-specific summariser
  survey/likert.ts                1–7 scale constants, SurveyItem

src/tests/form/                   the Form test (moved, logic unchanged). Don't touch unless asked.
src/tests/weather/
  WeatherTest.tsx                 the flow (phases) → screens
  WeatherSession.ts               logger, live link, condition clock, weather prep + scripted changes, event logging
  ConditionClock.ts               5-minute condition clock (timer-based, ?fast=1 aware), onTick hook
  WeatherControl.ts               what the weather layer shows now; smooth state + day/night changes
  forecast.ts                     Open-Meteo forecast fetch + WMO code → state
  geocoding.ts                    Open-Meteo geocoding (hometown autocomplete)
  schedule.ts                     places the 1:30 / 3:30 changes clear of presence cues
  text.ts                         all participant-facing text + Likert items
  plantState.ts                   RESTING TwinState (placeholder until presence exists)
  WeatherLab.tsx                  ?lab=weather tuning page
  components/StartScreen.tsx      consent, hometown combobox, family name
  components/ConditionStage.tsx   full-screen plant during a condition (+ debug panel)
  components/WeatherDebugPanel.tsx  ?debug=1 dashboard

supabase/schema.sql               full schema for a NEW project (includes 002)
supabase/migrations/002_weather_test.sql   already applied to the live DB
scripts/make-placeholder-intro.py renders public/videos/intro.mp4 (Pillow + ffmpeg)
scripts/e2e/                      Form regression check (Playwright)
public/videos/intro.mp4           placeholder intro clip (2:00, split screen, captions)
```

### Router (`src/App.tsx`)

| URL | Result |
|---|---|
| `?admin=1` | admin panel |
| `?compare=1` | plant/orb side by side (form tuning) |
| `?lab=weather` | plant + weather debug panel, no session, nothing saved |
| `?session=<id>` | loads `get_session_config(id)`: weather → `WeatherTest`; form or unknown id → `FormTest` (unknown id = created on Start, as before) |
| `?test=weather` | local Weather preview, **nothing saved** (logger `local: true`, no live link). `&conditions=B,A,C` sets the order (default A,B,C) |
| anything else | `FormTest` |

Other params: `?fast=1` (10×), `?debug=1` (debug overlay/panel), `?weather=rain|clear|cloudy|snow|fog` (holds that state in B/C, no fetch, no scripted changes).

### Weather flow (`WeatherTest.tsx`) and live phases

`start → intro → check → (between → round → survey) × 2–3 → final → done`

Phase names are shared with the Form test in `src/shared/data/live.ts` (`between` = framing screen, `round` = condition running). `intro`, `check` and `final` are **placeholders** right now (a title and a Continue button).

### Data model (already in the DB)

- `sessions`: `test_type` ('form' | 'weather'), `condition_order` ('B,A,C'), `clip_assignment` (clip per *position*, e.g. '2,1,1'), `clip3_offset_sec`, `include_c`, `hometown_name/lat/lon`, `family_name`. `order_ab` is form only.
- `events` / `answers`: new `condition` column ('A'/'B'/'C' or 'plant'/'orb'). `round` = position 1–3 (0 = before conditions / final questions). Weather rows use `form = 'plant'`.
- RPCs: `get_session_config(id)`, `start_weather_session(id, hometown_name, lat, lon, family_name)`, `start_session(...)` (form).
- View `session_overview` (security_invoker): sessions + `current_round`, `completed`, `weather_failed`. The admin list already reads it.

### What the Weather test logs today

| type | when | meta |
|---|---|---|
| `consent` | Start | `agreed`, `hometown_has_coords` |
| `condition_start` | Begin | `position`, `clip`, `clip_offset_sec`, `speed` |
| `weather_state` | condition start (B/C: live/fallback/url; A: `to: null`) | `from`, `to`, `is_day`, `source`, `place`, `lat`, `lon`, `code`, `temperature`, `cloud_cover`, `precipitation`, `local_time`, `schedule` (planned/actual change times) |
| `weather_transition` | scripted 1:30 / 3:30 change, or debug panel | `from`, `to`, `transition_sec` (real seconds), `source` ('script' / 'debug'), `planned_at`, `shift` |
| `weather_fetch_failed` | B/C fetch failed, timed out, or hometown had no coordinates | `error`, `place`, `lat`, `lon` |
| `condition_end` | after 5:00 or admin skip | `source` ('script' / 'manual') |

Not yet logged (to do): `intro_start`, `intro_end`, `comprehension_answer`, `presence_cue`.

---

## 4. Decisions already made

These were proposed and accepted ("start" without changes). Keep them unless the user says otherwise.

- **Scripted weather:** start in the real state, at **1:30** change to a nearby state, at **3:30** change back to the real state (one change each, 5 s long). Nearby map in `WEATHER_CONFIG.nearby`: clear→cloudy, cloudy→rain, rain→cloudy, snow→cloudy, fog→cloudy.
- **Comprehension question options** (draft, the user may reword): "It wakes up and glows" (correct), "Nothing happens", "It plays a sound", "It turns off". No weather option, so it doesn't prime condition B.
- **Researcher script:** write a Weather version for the admin panel (Claude's wording; user edits).
- **Weather sessions only come from the admin panel.** `?test=weather` is a preview that saves nothing.
- **Weather is fetched on the framing screen** (before Begin), so the condition starts instantly. Begin shows a spinner until it's ready, at most `fetchTimeoutSec` (6 s), then the fallback state.
- **Fallback:** `cloudy`, `is_day = true`, `weather_fetch_failed` logged, scripted changes still run. The admin list shows a "weather failed" badge.
- **If the geocoding service is down**, the start screen turns the hometown into a plain text field (the Base UI Combobox clears free text on blur, so it can't be used for that). The hometown is then saved without coordinates and B uses the fallback.
- **Counterbalancing (admin):** without C, rotate A,B / B,A; with C, rotate all 6 orders, counted per `include_c` group. Clips alternate `1,2` / `2,1` by weather-session count; a third condition reuses clip 1 from `clip3OffsetSec` (150 s). The pre-selected option is labelled "(next in balance)"; picking another is the manual override.
- **Intro clip placeholder** is generated, not stock footage (no licensing questions, matches the storyboard). Its captions end with the framing sentence used before each condition.

---

## 5. Remaining work

### Step 5: Presence layer (**required; the user postponed it, not dropped it**)

The brief: a heavily blurred background video behind the Three.js canvas that reads as a shadow (`filter: blur(30px) grayscale(1) contrast(0.8)`, reduced opacity), driven by `/public/videos/presence_1.mp4` and `presence_2.mp4`, each with a cue file (`presence_1.cues.json`, `presence_2.cues.json`) synced to `video.currentTime`. No computer vision. Plant reactions come only from the cues and are identical in all conditions.

Cue format:
```json
[
  { "t": 12.0, "event": "enter", "x": 0.2 },
  { "t": 18.5, "event": "move",  "x": 0.6 },
  { "t": 45.0, "event": "still", "x": 0.6 },
  { "t": 92.0, "event": "leave" },
  { "t": 150.0, "event": "pass", "x": 0.5 }
]
```

| Event | Plant |
|---|---|
| nobody present | resting: slightly closed, soft dim glow |
| enter | wakes over ~3 s, opens, brightens |
| move / x | leans gently toward x |
| still | fully open, slow breathing |
| pass | brief perk-up, then back to rest |
| leave | lingering glow fading over ~60 s, closes slowly |

What to build:

1. **Placeholder clips + sample cues.** Extend `scripts/` with a generator like `make-placeholder-intro.py`: a dark room, a soft grey silhouette whose moves follow the cue file, written to `public/videos/presence_N.mp4` + `presence_N.cues.json`. Clip 1 must cover `clip3OffsetSec + 300` s, or the player must loop (see 4). Keep files small (480p is plenty under a 30 px blur; the Vercel deployment carries them).
2. **Cue loading + sync** (`src/tests/weather/presence/CueTrack.ts` or similar): load the JSON, validate it, and every frame find the latest cue with `t ≤ video.currentTime`. Handle looping (currentTime jumps back). Log each cue as `presence_cue` (meta: `event`, `x`, `video_t`, `clip`) when it is reached.
3. **Presence → plant state** (`PresenceDriver`): produce the plant's `TwinState` from the current presence state (wake/fade easing, pass perk-up). Replace `RESTING` in `ConditionStage` and `WeatherLab`.
   - Sideways lean toward `x` does not exist yet: `Expression.lean` only leans toward the camera. Add an **optional** field (e.g. `TwinState.leanX?`, default 0) and use it in `forms.ts` **only when non-zero**, so Form output is unchanged. Same for a slower breathing rate in "still" (e.g. `idleRate?`, default 1).
   - The plant's stem bends sideways as openness drops (`PLANT.droopDeg`), which the brief reserves for the Form test's withering. Keep the resting openness high enough that it doesn't read as drooping, or add an opt-in way to limit the bend. Discuss with the user if unsure.
   - `pass` can reuse `pulse` (it already eases back).
4. **Video player** behind the canvas, for the condition's clip (`session.clipAt(position)`), starting at `session.clipOffsetAt(position)` (150 s for position 3). `playbackRate = SPEED` in fast mode (Chrome caps at 16). Muted, `playsInline`, looping if shorter than needed. Log the actual start offset.
   - **Rendering catch:** the scene currently paints an opaque background (`scene.background`) and the weather layer colours it. For a video *behind* the canvas the renderer needs `alpha: true` and a transparent background in weather mode (opt-in through `TwinSceneOptions`). The weather layer would then tint a CSS layer or the clear colour instead of `scene.background`. Check that `UnrealBloomPass` keeps alpha in three r187. If it doesn't, put the video **inside** the scene instead (a `VideoTexture` on a plane behind the plant, blurred by downsampling plus a grayscale/contrast shader).
5. **Weather scheduling hook:** `WeatherSession.cueTimes(position)` currently returns `[]`. Return the cue times converted to condition seconds (`cue.t − offset`, unwrapped across loops, within 0–300) so `scheduleChanges()` keeps the 1:30 / 3:30 changes ≥ 3 s from cues (shift up to ±10 s; actual times are already logged in `weather_state.meta.schedule`).
6. **Debug panel:** fill the "presence" section: current cue event, presence state, x, video time, clip. Optionally add buttons in `?lab=weather` to fire enter/move/still/pass/leave by hand.
7. **Counterbalancing check:** clips per position already come from the session (`clip_assignment`); make sure the clip actually played matches and is logged in `condition_start`.

### Step 7: Intro, comprehension check, surveys, final questions

1. **Intro** (phase `intro`): play `/videos/intro.mp4` full screen (`playbackRate = SPEED`), Continue appears when it ends. Log `intro_start` / `intro_end` (meta: `replay` count, watched seconds). The placeholder already contains the "Your room in Amsterdam" / "Your family's home" labels and captions. Replace it by dropping the real file at the same path.
2. **Comprehension check** (phase `check`): "What happens to your family's plant when you walk into your room?" with the options from §4, shuffled once per session (log the shown order). Log `comprehension_answer` (meta: `answer`, `correct`, `attempt`). If wrong: show a short explanation and offer **Replay the clip** (back to `intro`, then ask again) and a way to continue. Decide with the user whether a second wrong answer may continue; default: yes, logged.
3. **Survey after each condition:** the six Likert items already exist (`likertItems()` in `text.ts`). Add the **Inclusion of Other in Self** item: 7 pictures of two circles labelled "me" and "home" with increasing overlap, single choice, required, `question_id: 'ios'`, value 1–7. Draw them as inline SVG. Extend the shared `LikertSurvey` with an opt-in extra item type, or compose a weather-specific survey page, but keep the Form survey's output identical.
4. **Final questions** (phase `final`, `round = 0`, `condition = null`):
   - "Which version would you want in your room abroad?" Options "Version 1 / 2 / 3" in the order shown (only as many as there were conditions). Store the mapped condition letter (`question_id: 'preferred_condition'`, value 'A'/'B'/'C') **and** the shown label (`preferred_version`, value '1'/'2'/'3').
   - Open: "What did the colour changes make you think about?" (`colour_changes`)
   - Open: "Did the weather make the presence feel more or less like home? Why?" (`weather_home`)
   - Use the same layout as the Form test's `FinalQuestions` but as a separate weather component. Don't change the form one.

### Step 8: Logging, export, admin

1. **Session list:** filter by test type (All / Form / Weather), plus a **status** column from `session_overview`: not started / started / condition N (form: round N) / completed. The weather-failed badge already exists.
2. **Export per test type** (CSV + JSON): sessions, events, answers, plus a summary. `downloadExport(data, name, format, summariser)` already takes a summariser; `summariseForm` skips non-form sessions. Write `summariseWeather`: one row per session × position, with condition, clip, clip offset, weather source/state/code/temperature/is_day, fetch failed, actual change times + shifts, the Likert items, `ios`, comprehension correct/attempts, and whether this was the preferred condition. "Export all" should export the test type selected in the filter, or both into separately named files.
3. **Preview button** per test: opens `?test=weather&fast=1&debug=1` (saves nothing). For the Form test the existing "Test link" on a session is the preview. Note: a bare Form link *does* create a session when Supabase is configured.
4. **Weather researcher script:** a `researcherScript.ts` for the weather test (steps matched to phases: welcome/consent, intro, check, framing per part, survey, final, done). The admin's `ResearcherScript` component is currently form-only (it imports the form steps), so pass the steps in as a prop. Researcher wording must not reveal which condition is which, or what the study expects.
5. **Admin live view** for weather already shows phase, part · condition, time and a Skip condition button. Optionally add weather state + presence state to `LiveStatus`.

### Step 9: README + deploy

Update `README.md` (currently Form-only):
- what each test is, the session flow of each, how to create each test type in the admin panel and what the options mean
- where videos and cue files go (`public/videos/intro.mp4`, `presence_1.mp4`, `presence_2.mp4`, `presence_N.cues.json`), the cue format and the reaction table, how to regenerate placeholders
- URL parameters (table in §3), `?lab=weather`, `?weather=`
- logged events for the weather test (table in §3 plus the new ones), export columns
- database: fresh project → `schema.sql`; existing project → migrations in order
- code map (§3)

Deploy: push to `main` (Vercel deploys automatically). If a new migration exists, the user must run it **first**.

---

## 6. Gotchas

- **Base UI Combobox** clears typed text on blur when nothing is selected; that's why the start screen switches to a plain `Input` after a lookup failure.
- **`WeatherControl` transitions are real time**; scripted ones pass `transitionSec / SPEED`, so `transition_sec` in the log is real seconds (0.5 in fast mode). `condition_start.meta.speed` tells you which.
- **`WeatherSession.log()`** fills `round`, `condition` and `t_sec` from the current condition. Weather changes are only logged while a condition clock is running (`weather.onChange`).
- **Order inside `startCondition`:** `condition_start` is logged, the clock starts, then weather is set up (so the first `weather_state` lands inside the condition). Keep that order when adding presence.
- **The logger's start call:** queued `start` items may lack `rpc` (from before the weather test); they default to `start_session`.
- **The Form test's `ResearcherScript.describe()`** must cover every `Phase`, so adding a phase there needs a case.
- **Lint:** `npx oxlint`. Existing warnings live in `src/hooks/use-composer-editor.ts`, `AdminApp.tsx:~538`, `TwinCanvas.tsx`, `DoneScreen.tsx` (all from before). Don't add new ones. Fast refresh wants component files to export only components.
- **Port 5173** is often already taken by the user's own dev server; use another port (`npx vite --port 5174`).

---

## 7. Testing

There's no unit-test setup; testing is done in a real browser with Playwright (`playwright-core`, using the installed Chrome).

**Form regression check (run after any change to shared code):**
```bash
npm i --no-save playwright-core@1.49.1       # once; doesn't touch package.json
npx vite --port 5199 --strictPort &           # local mode: no .env.local, nothing is sent anywhere
git stash -u && BASE=http://localhost:5199/ node scripts/e2e/form-regression.mjs /tmp/form-baseline && git stash pop
BASE=http://localhost:5199/ node scripts/e2e/form-regression.mjs /tmp/form-new
node scripts/e2e/compare.mjs /tmp/form-baseline /tmp/form-new   # must print identical/identical/none
```
(Better: make the baseline once from a clean checkout of the last known-good commit in a separate worktree, instead of stashing.) The script runs the whole Form test in fast mode with Chrome's fake mic and saves screenshots, all screen text and the exported data. `talk`/`health` events are ignored by the compare, because the fake mic's test tone makes them vary.

**Weather test:** run `?test=weather&fast=1&debug=1` end to end. Also test:
- a mocked session: intercept `http://mock.local/**` with Playwright `context.route` and start Vite with `VITE_SUPABASE_URL=http://mock.local VITE_SUPABASE_ANON_KEY=anon`. Check the `start_weather_session` payload and that every event/answer row has the right `condition`
- the forecast API blocked (`page.route('https://api.open-meteo.com/**', r => r.abort())`) → fallback + `weather_fetch_failed`
- geocoding blocked (`https://geocoding-api.open-meteo.com/**`) → typed hometown accepted

**SQL:** there's no local Postgres. `@electric-sql/pglite` (WASM Postgres) works for checking migrations: create stub roles `anon`/`authenticated` and an `auth.jwt()` function, then run `schema.sql`, and separately the old schema followed by the migration (twice, to prove it's idempotent).

`npm run build` must pass (it runs `tsc -b`).

---

## Original brief: Weather test

> **Research question.** Do people feel more connected to home when a presence-sensing plant also shows the weather in their hometown?
>
> **Flow.** Start (consent + hometown + family member name) → Intro clip (~2 min) → Comprehension check → Condition 1 (5 min) → Survey → Condition 2 (5 min) → Survey → [Condition 3 (5 min) → Survey] → Final questions → Done. No mic, no interaction; participants only watch. Plant form only.
>
> **Start screen.** Hometown with Open-Meteo Geocoding autocomplete (name, lat, lon). Optional `family_name`, used in framing and survey text.
>
> **Intro clip.** Pre-recorded split screen showing it works both ways: left "Your room in Amsterdam", right "Your family's home", each with a blurred silhouette and a plant reacting to the other side. `/public/videos/intro.mp4` (placeholder until provided). Then a multiple-choice comprehension question, "What happens to your family's plant when you walk into your room?"; if wrong, a short explanation and an offer to replay. Log the answer.
>
> **Conditions (5 min each).** A: presence only. B: presence + participant's hometown weather. C (optional per session): presence + Amsterdam weather. Framing before each: A "This is your plant. The shadow is [family_name / your family] at home." B adds "It also shows the weather in [hometown] right now." C adds "It also shows the weather here in Amsterdam right now."
>
> **Presence layer.** Identical in all conditions; see step 5 above. Counterbalance clips: with 2 conditions alternate clip order across sessions; with 3, reuse clip 1 for the third from a different offset and log it. Placeholder clips + sample cue file until real ones exist.
>
> **Weather layer (B, C).** Open-Meteo Forecast `current=weather_code,temperature_2m,is_day,cloud_cover,precipitation`; B hometown, C Amsterdam (52.37, 4.90). WMO → clear / cloudy / rain / snow / fog-storm, plus is_day (night dimmer, cooler). Colour and texture only, never movement or posture; never droop for weather. Scripted transitions at 1:30 and 3:30 (~5 s) to a nearby state and back, not coinciding with cues (shift ≤ ±10 s, log actual). Fallback: "cloudy", log `weather_fetch_failed`, flag the session in admin. All timings and visuals in one config object.
>
> **Surveys (1–7 after each condition).** I felt connected to home. / It made me think of [family_name / my family] or [hometown]. / It felt like the plant was "from home". / It felt comforting. / It made me feel homesick. / I understood what the plant was reacting to. / Inclusion of Other in Self circles labelled "home" and "me" (7 pictures, single choice). **Final:** "Which version would you want in your room abroad?" (neutral "Version 1/2/3" in shown order, mapped back) / "What did the colour changes make you think about?" / "Did the weather make the presence feel more or less like home? Why?" Reuse existing survey components.
>
> **Admin.** Choose test type when creating a session; weather options: include C, condition order (auto-counterbalanced or manual), clip assignment (auto alternating or manual). Participant link is only `?session=<id>`. Session list: filter by test type, status (started / condition N / completed), flag weather fetch failures. Export per test type (CSV/JSON): sessions, events, answers. Optional preview button with `?fast=1`.
>
> **Data model.** Extend existing tables (done, see §3). Store the fetched weather (code, temperature, is_day) as an event when each condition starts (done).
>
> **Debug.** `?fast=1` 10× for both tests; `?debug=1` overlay for the Weather test with current cue event, presence state, weather state, next transition time, condition and clip; `?weather=rain` etc. forces a state.
>
> **Acceptance criteria.**
> - [ ] The Form test works exactly as before
> - [ ] The admin can create a session for either test and send a single link
> - [ ] The Weather test runs end to end with no mic and no interaction: start → intro → check → conditions → surveys → final
> - [ ] Presence reactions are driven only by the cue files and are identical across conditions
> - [ ] The weather layer changes only colour and texture, with transitions at ~1:30 and ~3:30
> - [ ] Hometown lookup and live weather work, and the fallback works when the API fails
> - [ ] Counterbalancing of condition order and clips works and is logged
> - [ ] All events and answers are stored with test_type and condition, and can be exported per test
> - [ ] Placeholder videos and cues work until the real ones are added
> - [ ] README updated: how to create each test type, where to put the videos and cue files, and the cue file format
> - [ ] Still runs on the free tiers (Vercel + Supabase), with no new paid services
