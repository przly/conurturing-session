/**
 * Receives survey responses from the website and writes them to this sheet.
 * Setup steps: see google-apps-script/README.md.
 *
 * One row per response. Columns are created automatically from the
 * question ids, so adding a question to the survey adds a column here.
 * Sending the same response_id again (e.g. after "Back" + "Finish")
 * updates that row instead of adding a duplicate.
 */

const SHEET_NAME = 'Responses'
const FIXED_COLUMNS = ['submitted_at', 'response_id', 'survey_version']

function doPost(e) {
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const data = JSON.parse(e.postData.contents)
    if (!data.response_id || typeof data.answers !== 'object') {
      return json({ ok: false, error: 'Invalid payload' })
    }

    const sheet = getSheet()
    const headers = ensureHeaders(sheet, Object.keys(data.answers))

    const values = {
      submitted_at: new Date(),
      response_id: String(data.response_id),
      survey_version: String(data.survey_version || ''),
    }
    for (const [id, answer] of Object.entries(data.answers)) values[id] = String(answer)
    const row = headers.map((h) => (h in values ? values[h] : ''))

    // Update the existing row for this response, or append a new one.
    const lastRow = sheet.getLastRow()
    const ids = lastRow > 1 ? sheet.getRange(2, 2, lastRow - 1, 1).getValues().flat() : []
    const index = ids.indexOf(values.response_id)
    if (index === -1) sheet.appendRow(row)
    else sheet.getRange(index + 2, 1, 1, row.length).setValues([row])

    return json({ ok: true })
  } catch (err) {
    return json({ ok: false, error: String(err) })
  } finally {
    lock.releaseLock()
  }
}

/** Lets you open the web app URL in a browser to check it is live. */
function doGet() {
  return json({ ok: true, message: 'Survey endpoint is running.' })
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME)
}

/** Makes sure the header row has the fixed columns plus every question id. */
function ensureHeaders(sheet, questionIds) {
  const existing = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].filter(String)
    : []
  const headers = existing.length ? existing : FIXED_COLUMNS.slice()
  for (const id of questionIds) if (!headers.includes(id)) headers.push(id)
  if (headers.length !== existing.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
    sheet.setFrozenRows(1)
  }
  return headers
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON)
}
