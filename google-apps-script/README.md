# Saving answers to Google Sheets

The website sends each finished survey to a small Google Apps Script,
which writes it as one row in a Google Sheet.

## One-time setup (about 10 minutes)

1. Create a new Google Sheet (for example "Playground Survey – Responses").
2. In the sheet, open **Extensions → Apps Script**.
3. Delete the example code, paste in everything from `Code.gs` (this folder) and click **Save**.
4. Click **Deploy → New deployment**.
   - Click the gear next to "Select type" and choose **Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Click **Deploy**, then **Authorize access** and allow the permissions
     (Google will warn that the app is unverified: choose *Advanced → Go to … (unsafe)*;
     it is your own script).
5. Copy the **Web app URL** (it ends in `/exec`).
6. In the project folder, create a file called `.env.local` with:

   ```
   VITE_SHEETS_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   ```

7. Restart `npm run dev`. Finish the survey once, and a **Responses** tab with
   a header row and your answers should appear in the sheet.

To check the URL works, open it in a browser: it should say
`"Survey endpoint is running."`

## Good to know

- **Columns:** `submitted_at`, `response_id`, `survey_version`, then one column per
  question id with the chosen letter (A–D). New questions add new columns automatically.
- **Changed answers:** if someone goes back and presses Finish again, their row is
  updated rather than duplicated. "Start again" counts as a new response.
- **Editing the script later:** after changing `Code.gs`, use
  **Deploy → Manage deployments → Edit → Version: New version → Deploy**.
  That keeps the same URL. A *new* deployment gets a new URL.
- **Hosting:** when you deploy the site (Vercel, Netlify, GitHub Pages…), add
  `VITE_SHEETS_URL` as an environment variable there too.
- **Privacy:** nothing personal is collected, only the answers, a random id and
  a timestamp. The URL is public in the site's code, so anyone who finds it could
  send fake rows. That is fine for a prototype; check with your supervisor before
  a real study.
