# Twin plants studies

Web prototype for the *twin plants* concept (Master Digital Design, AUAS, Emerging Interactions). The app runs two studies.

| Test | Research question |
|---|---|
| Form | Are people more attached to a plant than an abstract orb when both behave the same way? |
| Weather | Do people feel more connected to home when a presence-sensing plant also shows the weather in their hometown? |

The stack is Vite, React, TypeScript, Three.js, Tailwind, Base UI and Supabase.

## Form test flow

```
Start → Mic calibration → Round 1 → Survey → Round 2 → Survey → Final questions → Done
```

Participants spend five minutes with each form in counterbalanced order. The twin owner's reactions follow the same script in each round.

Round script (both forms, all values in `ROUND_CONFIG` in `src/config.ts`):

| Time | Event |
|---|---|
| 0:00 | Fade in, `health = 0.7` |
| 0:00–3:00 | Health decays slowly; talking raises it |
| 1:00, 2:30, 4:00 | Partner pulse (4:00 fires even while withered) |
| 3:00 | Forced withering to `0.15` over 20 s, regardless of talking |
| 3:00–5:00 | Revive window: talking restores health |
| 5:00 | Fade out → "Round complete, please wait for the researcher" |

(The handover specified 10-minute rounds; they were shortened to 5 minutes with every event scaled proportionally.)

Health never drops below `healthFloor` (0.08); the object never dies.

## Weather test flow

```
Consent and hometown → Intro video → Comprehension check → (Framing → Viewing → Survey) × 2 or 3 → Final questions → Done
```

Each Weather viewing lasts up to one minute. Participants watch the plant and a prerecorded, blurred shadow. They use no microphone or camera. The selected hometown supplies coordinates for local weather. The optional family name personalises the framing and survey.

| Condition | What the participant sees |
|---|---|
| A | Presence only |
| B | Presence and hometown weather |
| C | Presence and Amsterdam weather, when enabled |

Open-Meteo supplies current weather on the framing screen. If geocoding is unavailable, the participant can type their hometown. Missing coordinates or a failed forecast produce a cloudy daytime fallback and a flag in the session list. Conditions B and C start in the fetched or fallback state, change to a nearby state at roughly 0:18, and return at roughly 0:42. Changes take three seconds and may shift by up to five seconds to give presence cues room.

### Videos and presence cues

The Presence preview and every Weather condition use the same recording and movement cues under `public/videos/`.

| File | Use |
|---|---|
| `movement_v1.mp4`, `movement_v1.cues.json` | Recorded movement and matching cues for participant viewings |
| `presence_1.mp4`, `presence_2.mp4` | Muted shadow clips |
| `presence_1.cues.json`, `presence_2.cues.json` | Cue tracks corresponding to the two clips |

Cue tracks are JSON arrays sorted by `t`. Times are seconds from the start of the source video and must fall within its duration. Optional `x` is a horizontal position between 0 (left) and 1 (right). Add `motion: { from, to, seconds }` to interpolate position between the start and end of a movement. Motion endpoints can extend beyond the frame.

```json
[
  { "t": 12, "event": "enter", "x": 0.2, "motion": { "from": -0.2, "to": 0.2, "seconds": 3 } },
  { "t": 18.5, "event": "move", "x": 0.5, "motion": { "from": 0.2, "to": 0.5, "seconds": 2 } },
  { "t": 20.5, "event": "behind", "x": 0.5 },
  { "t": 45, "event": "still", "x": 0.5 },
  { "t": 92, "event": "leave" },
  { "t": 150, "event": "pass", "x": 0.5 }
]
```

| Cue | Plant response |
|---|---|
| No one present | Closed with a soft glow |
| `enter`, `move` | Petals open to 25% at the edge and open further as the person approaches the centre |
| `behind` | Petals are fully open at the centre and the flower brightens |
| `still` | Keeps the petals open |
| `leave` | Petals close as the person moves away and the glow fades over about a minute |
| `pass` | Petals briefly track the crossing and the glow pulses |

Each participant viewing starts at zero and runs for one minute. Regenerate placeholders with Python, Pillow and FFmpeg.

```bash
python3 scripts/make-placeholder-intro.py
python3 scripts/make-placeholder-presence.py
```

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

Without the env vars the app still runs in **local mode**: nothing is sent anywhere and the participant's data can be downloaded as JSON from the final screen.

### Supabase (once)

1. Create a free project at [supabase.com](https://supabase.com). Pick an **EU region** (e.g. Frankfurt) for research data.
2. For a new project, run `supabase/schema.sql` in **SQL Editor → New query**. For an existing project, apply only pending files from `supabase/migrations/` in order. The live study database already has `002_weather_test.sql`.
3. **Authentication → Users → Add user**: your researcher email + password, tick *Auto confirm user*.
4. In the SQL editor, put that email on the researchers list:
   ```sql
   insert into public.researchers (email) values ('you@example.com');
   ```
5. **Project Settings → API**: copy the *Project URL* and the *anon public* key into `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
6. (Recommended) **Authentication → Sign In / Providers**: turn off *Allow new users to sign up*.

Env var names have the `VITE_` prefix because Vite only exposes those to the browser. The anon key is meant to be public; access is controlled by the rules below.

### Data access (RLS)

- **Participants (anon)** can only *insert* events and answers. They cannot read anything. The `get_session_config()` RPC returns the public study configuration. The `start_session()` RPC registers Form participants. The `start_weather_session()` RPC records hometown and family details on an admin-created Weather session.
- **Researchers** (logged in *and* listed in `researchers`) can read, create and delete sessions and read all data. Other logged-in accounts see nothing.
- Live view and overrides use **Supabase Realtime broadcast** (messages only, nothing stored). If you switch Realtime to *private channels only* in the dashboard, the live view stops working.

### Deploy on Vercel

1. Import the GitHub repo in Vercel (framework preset: **Vite**, defaults are fine).
2. **Settings → Environment Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then redeploy.
3. Apply any pending database migrations before releasing code that depends on them. Pushing to `main` deploys automatically on the existing Vercel project.
4. Form microphone access requires HTTPS or localhost. Both studies run on Vercel Hobby and the Supabase free tier. Open-Meteo requires no API key.

## Running a session

Open `/intro` on the app's domain to show the two-flower explainer by itself. Viewers can replay it, and the page does not save study data.

1. Open `/?admin=1` and sign in with your researcher account.
2. In **New session**, enter a participant code and choose **Form** or **Weather**.
   - **Form** preselects plant-first or orb-first to balance the groups. You can override the order.
   - **Weather** defaults to two conditions. Enable Amsterdam weather to run three. The suggested order rotates through both two-part orders or all six three-part orders. Each condition shows the same recorded movement sequence.
3. Click **Create link** and open the participant's `?session=<id>` link in Chrome or Safari. Use the researcher script and live view in the admin panel. Form has a microphone calibration and round overrides. Weather has a skip command for the active condition.
4. At the end, check that the participant screen confirms saving. Keep it open while pending rows retry. The done screen also offers a JSON download.

A bare Form link can create a session on Start when Supabase is configured. Use a session's **Test link** for Form testing and **Preview Weather test** for a local Weather run that sends no data.

### URL parameters

| Param | Effect |
|---|---|
| `?admin=1` | Researcher panel |
| `?session=<id>` | Admin-created participant link. The configured test opens automatically |
| `?order=plant-orb` / `orb-plant` | Order for a bare Form link |
| `?code=P07` | Participant code for a bare Form link |
| `?compare=1` | Form comparison with plant and orb side by side |
| `?test=weather` | Local Weather preview. Add `&conditions=B,A` to set order and count. Defaults to A, B, C |
| `?lab=weather` | Weather tuning and presence playback, with no session |
| `?weather=rain` | Fix B/C or the lab to `rain`, `clear`, `cloudy`, `snow` or `fog`. Forecast fetches and scripted changes are skipped |
| `?fast=1` | 10× speed for both studies. Weather viewings take up to 6 seconds and Form rounds take 30 seconds |
| `?debug=1` | Form health, pulse, microphone and controls, or Weather clip, cue, clock, transition and weather controls |

Use [the fast Weather preview](http://localhost:5173/?test=weather&fast=1&debug=1) with the local Vite server to inspect the full flow.

## Exporting data

Select a session to export it, or use **Export all** with the **Test type** filter. **All** produces separately named Form and Weather exports. The session list shows the latest saved status from `session_overview` and flags failed Weather forecasts.

JSON includes `sessions`, `events`, `answers` and `summary` in one file. CSV downloads one file per table or summary.

### Form events and summary

`events.type`:

| type | Meaning |
|---|---|
| `calibration` | round 0, mic noise/speech levels and thresholds in `meta` |
| `round_start` / `round_end` | `meta.source` is `script` or `manual`; restarts are marked `restarted: true` |
| `health` | once per round second, with `pulse` and `listening` in `meta` (for plotting curves) |
| `talk` | start time `t_sec` and `duration_sec` (events shorter than 0.3 s are ignored) |
| `pulse`, `wither_start`, `wither_end` | script or manual |
| `revived` | first time health ≥ 0.6 after the forced wither; `meta.since_wither_start`, `meta.first_talk_after_wither_t` |

Derived in `summary.csv`:

- `latency_first_talk_sec`: wither start → first talk.
- `time_to_revive_sec`: wither start → health ≥ `reviveThreshold`.
- Talk time before and after the wither, mean and end health, number of manual overrides.

If a round was restarted, only events after the last restart count.

### Weather events and summary

Raw events and answers join to the session through `session_id`. The session identifies the test type. `round` is the viewing position (1 through 3). Intro, comprehension and final rows use position 0 and a null condition.

| Event | Recorded details |
|---|---|
| `consent` | Agreement and whether hometown coordinates were available |
| `intro_start`, `intro_end` | Replay count and seconds watched |
| `comprehension_answer` | Selected option, correctness, attempt number and displayed option order |
| `condition_start` | Position, clip, actual video offset and playback speed |
| `presence_cue` | Cue event, horizontal position, source video time and clip |
| `weather_state` | Starting state, source, day or night, location, forecast measurements and planned transition schedule |
| `weather_transition` | Actual condition time, target time, shift, states, source and transition duration |
| `weather_fetch_failed` | Error and requested location |
| `condition_end` | End time and source |

The Weather summary contains one row per session and assigned position. Columns include condition, clip and offset, weather source and state, WMO code, temperature, day/night flag, forecast failure, actual scripted change times and shifts, six Likert answers, the `ios` picture choice, latest comprehension result and attempt count, the preferred condition and displayed version, and both free-text responses.

## Fairness: what's shared between plant and orb

Both forms read the same state (`health`, `pulse`, `listening`) through **one** eased `Expression` (`src/shared/scene/expression.ts`):

- same glowing material, orange glow colour, emissive range, desaturation and dimming. The orb glows over its whole surface; on the plant **only the petals glow**, while the stem, leaves and flower centre are green and don't glow (they still dim and desaturate with health). So the plant gives off less light in total than the orb. That was a deliberate design choice, and the analysis should mention it.
- same floor glow and bloom
- same idle breathing frequency
- petals open as health rises and close into a bud as it fades, alongside the leaves
- same pulse frequency and peak displacement (orb bob ↔ leaf-tip sway)
- same lean displacement toward the camera while listening
- same reaction to voice **loudness** (`voice`, 0–1, scaled from each participant's calibration, normal speech ≈ 0.6): the plant's leaves swing toward perpendicular to the stem and the orb swells, and both glow brighter. Loudness only affects the visuals, not health: talking adds energy at the same rate however loud it is

Neither form has its own light, because a light inside the plant's bud would light its own leaves while the orb's couldn't. Only shape and how the shape moves differ (`src/shared/scene/forms.ts`). Tune both together in `?compare=1`.

## Privacy

The microphone is analysed in the browser only (`src/tests/form/MicDetector.ts`): loudness per 20 ms frame → speaking yes/no. No audio is recorded, stored or transmitted. Only talk start times and durations are saved.

## Code map

```
src/App.tsx                     Test routing and local previews
src/AdminApp.tsx                Researcher dashboard, live view and exports
src/config.ts                   Form and Weather settings and URL params
src/tests/form/                 Form flow, mic calibration, round runner and analysis
src/tests/weather/              Weather flow, forecast, session clock and analysis
src/tests/weather/presence/     Clip and cue loading, sync and plant response
src/tests/weather/text.ts       Weather participant wording and question IDs
src/shared/scene/              Three.js stage, forms, expression and weather
src/shared/components/         Shared canvas, survey and done screen
src/shared/data/               Supabase, queued logger, live channel and exports
public/videos/                 Intro, placeholder presence clips and matching cues
scripts/                       Video generators and Form regression check
supabase/schema.sql            Schema for new projects
supabase/migrations/           Incremental schema updates
```

## Twin flowers roleplay

Open `/?test=flowers` on an HTTPS deployment of this app with
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured, as described in
`.env.example`. The pair uses Supabase Realtime public Broadcast channels.
You can also try both seats on `localhost` on a single computer.

1. Copy the Flower B link and open it on the second computer.
2. Open Flower A on the first computer.
3. Enable the camera on both screens. Each time you open or reload a link, follow the
   practice prompts and hold each position for five seconds, then select
   **Start the test**. Move left or right to change how far the
   other screen's flower opens, and move closer or farther to change its glow.

MediaPipe runs in each browser. Supabase relays the seat, a face-present
boolean, and the petal and glow levels based on the largest face in the frame.
Camera frames stay on the computer that captured them. The browser
downloads the MediaPipe runtime and face detector model on first use.
