# Twin plant attachment test

Web prototype for the *twin plants* concept (Master Digital Design, AUAS, Emerging Interactions).
It tests one question: **are people more attached to a plant form than to an abstract orb when the behaviour is identical?**

Each participant does two 5-minute rounds, one with the **plant** and one with the **orb** (order counterbalanced), and answers a short questionnaire after each round, then a few final questions. The "partner" (the twin's owner) is scripted, so every session is identical.

Stack: Vite + React + TypeScript, Three.js, Tailwind/Base UI, Supabase.

## Session flow

```
Start (imagined person, mic notice) → Mic calibration → Round 1 → Survey → Round 2 → Survey → Final questions → Done
```

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

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

Without the env vars the app still runs in **local mode**: nothing is sent anywhere and the participant's data can be downloaded as JSON from the final screen.

### Supabase (once)

1. Create a free project at [supabase.com](https://supabase.com). Pick an **EU region** (e.g. Frankfurt) for research data.
2. **SQL Editor → New query**: paste `supabase/schema.sql` and run it.
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

- **Participants (anon)** can only *insert* events and answers. They cannot read anything. Sessions are created through the `start_session()` function, which returns only the session's order.
- **Researchers** (logged in *and* listed in `researchers`) can read, create and delete sessions and read all data. Other logged-in accounts see nothing.
- Live view and overrides use **Supabase Realtime broadcast** (messages only, nothing stored). If you switch Realtime to *private channels only* in the dashboard, the live view stops working.

### Deploy on Vercel

1. Import the GitHub repo in Vercel (framework preset: **Vite**, defaults are fine).
2. **Settings → Environment Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then redeploy.
3. The microphone only works over **https** (Vercel is) or on `localhost`.

## Running a session

1. Open `https://<your-site>/?admin=1` on your own laptop and sign in.
2. **New session**: enter a participant code (e.g. `P07`). The order is pre-selected to keep the plant-first and orb-first groups balanced. Click **Create link**.
3. Open the participant link on the participant's laptop (Chrome or Safari) with sound input on, the screen at full brightness, notifications off and the laptop plugged in. The page asks to keep the screen awake during rounds where the browser supports it; if not, turn off auto-sleep.
4. Do the intro and framing verbally. The participant presses **Start**, allows the microphone and does the 10-second calibration.
5. Rounds run on their own. In the admin panel, select the session to watch phase, time, health, pulse and talking live.
6. **Overrides** (fallback only, logged with `source: manual`): trigger pulse, trigger wither, skip round, restart round. They only work while a round is running.
7. After the final questions, the done screen confirms everything is saved. If it says it is still saving, keep the page open; unsaved rows are kept on that browser and retried.

A bare link without `?session=` also works: it creates a session on Start and alternates the order automatically.

### URL parameters

| Param | Effect |
|---|---|
| `?admin=1` | Researcher panel |
| `?session=<id>` | Participant link (created in the admin panel) |
| `?order=plant-orb` / `orb-plant` | Order for a bare link (a session created in the admin panel keeps its own order) |
| `?code=P07` | Participant code for a bare link |
| `?fast=1` | 10× speed (a round takes 30 seconds) for testing |
| `?debug=1` | Overlay with health, pulse, listening, mic level and thresholds, plus override buttons. **Hold Space to simulate talking.** Never show this to participants |
| `?compare=1` | Plant and orb side by side, driven by one state, with sliders. Use it to check that both are equally expressive |

Test run: `/?fast=1&debug=1` (or the *test link* in the admin panel).

## Exporting data

In the admin panel, select a session (or use **Export all**):

- **CSV** downloads four files:
  - `summary.csv`: one row per session × round with the derived metrics (below), every Likert item, `likert_mean` (with `talking_awkward` reversed) and the take-home choice.
  - `events.csv`: every logged event.
  - `answers.csv`: every answer.
  - `sessions.csv`: sessions.
- **JSON** downloads one file with all of the above.

### What's logged

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

## Fairness: what's shared between plant and orb

Both forms read the same state (`health`, `pulse`, `listening`) through **one** eased `Expression` (`src/scene/expression.ts`):

- same glowing material, orange glow colour, emissive range, desaturation and dimming. The orb glows over its whole surface; on the plant **only the petals glow**, while the stem, leaves and flower centre are green and don't glow (they still dim and desaturate with health). So the plant gives off less light in total than the orb. That was a deliberate design choice, and the analysis should mention it.
- same floor glow and bloom
- same idle breathing frequency
- petals open as health rises and close into a bud as it fades, alongside the leaves
- same pulse frequency and peak displacement (orb bob ↔ leaf-tip sway)
- same lean displacement toward the camera while listening
- same reaction to voice **loudness** (`voice`, 0–1, scaled from each participant's calibration, normal speech ≈ 0.6): the plant's leaves swing toward perpendicular to the stem and the orb swells, and both glow brighter. Loudness only affects the visuals, not health: talking adds energy at the same rate however loud it is

Neither form has its own light, because a light inside the plant's bud would light its own leaves while the orb's couldn't. Only shape and how the shape moves differ (`src/scene/forms.ts`). Tune both together in `?compare=1`.

## Privacy

The microphone is analysed in the browser only (`src/twin/MicDetector.ts`): loudness per 20 ms frame → speaking yes/no. No audio is recorded, stored or transmitted. Only talk start times and durations are saved.

## Code map

```
src/config.ts               ROUND_CONFIG, mic settings, URL params
src/twin/RoundRunner.ts     round clock, script, health dynamics, events
src/twin/MicDetector.ts     calibration, hysteresis + hangover talk detection
src/twin/StudySession.ts    ties mic, runner, logger and live link together
src/scene/                  Three.js scene, shared expression, plant + orb
src/data/                   Supabase client, queued logger, live channel, export
src/survey/questions.ts     Likert items and final questions
src/components/participant/ participant screens
src/AdminApp.tsx            researcher panel
supabase/schema.sql         tables, access rules, start_session()
```
